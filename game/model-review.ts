export const MODEL_PASS_SCORE = 9.8;
export const GROK_GATE_SCORE = 9.8;
export type ModelRevision = string & { readonly __brand: 'ModelRevision' };
export const isModelRevision = (value: unknown): value is ModelRevision => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export interface ModelScore { revision: ModelRevision; score: number | null; findings: readonly string[] }
export type CouncilTarget =
  | { provider: 'claudeAgent'; model: 'claude-opus-5-5'; effort: 'high' }
  | { provider: 'codex'; model: 'gpt-6.1-sol'; effort: 'xhigh' }
  | { provider: 'cursor'; model: 'grok-4.7'; effort: 'xhigh' };
export type CouncilMember = CouncilTarget & {
  reviewer: string;
  taskId: string;
  overallScore: number | null;
  results: Readonly<Record<string, ModelScore>>;
};
export interface CouncilRound { round: number; date: string; members: readonly CouncilMember[] }
export interface ReviewLedger { version: 2; rounds: readonly CouncilRound[] }
export type ReviewStatus =
  | { state: 'pending'; scores: readonly number[]; unscored: number; round: number | null }
  | { state: 'stale'; scores: readonly []; round: number }
  | { state: 'changes-required'; scores: readonly number[]; round: number }
  | { state: 'approved'; scores: readonly [number, number, number]; round: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function isModelScore(value: unknown): value is ModelScore {
  if (!isRecord(value) || !isModelRevision(value.revision)) return false;
  if (!Array.isArray(value.findings) || !value.findings.every(finding => typeof finding === 'string')) return false;
  if (value.score === null) return value.findings.some(finding => finding.trim().length > 0);
  return typeof value.score === 'number' && Number.isFinite(value.score) && value.score >= 0 && value.score <= 10;
}

function isCouncilMember(value: unknown): value is CouncilMember {
  if (!isRecord(value) || typeof value.reviewer !== 'string' || !value.reviewer.trim()) return false;
  if (typeof value.taskId !== 'string' || !value.taskId.trim()) return false;
  if (value.overallScore !== null && (typeof value.overallScore !== 'number' || !Number.isFinite(value.overallScore) || value.overallScore < 0 || value.overallScore > 10)) return false;
  const target = (value.provider === 'claudeAgent' && value.model === 'claude-opus-5-5' && value.effort === 'high')
    || (value.provider === 'codex' && value.model === 'gpt-6.1-sol' && value.effort === 'xhigh')
    || (value.provider === 'cursor' && value.model === 'grok-4.7' && value.effort === 'xhigh');
  return target && isRecord(value.results) && Object.values(value.results).every(isModelScore);
}

export function isReviewLedger(value: unknown): value is ReviewLedger {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.rounds)) return false;
  const rounds = new Set<number>();
  return value.rounds.every((round: unknown) => {
    if (!isRecord(round) || typeof round.round !== 'number' || !Number.isInteger(round.round) || round.round < 1 || rounds.has(round.round)) return false;
    if (typeof round.date !== 'string' || !Number.isFinite(Date.parse(round.date))) return false;
    if (!Array.isArray(round.members) || round.members.length > 3 || !round.members.every(isCouncilMember)) return false;
    rounds.add(round.round);
    const reviewers = round.members.map(member => member.reviewer), tasks = round.members.map(member => member.taskId), providers = round.members.map(member => member.provider);
    return new Set(reviewers).size === reviewers.length && new Set(tasks).size === tasks.length && new Set(providers).size === providers.length;
  });
}

/** All three named providers must score the same asset version in the same round. */
export function modelReviewStatus({ modelId, revision, ledger }: { modelId: string; revision: ModelRevision | undefined; ledger: ReviewLedger | null }): ReviewStatus {
  if (!revision || !ledger) return { state: 'pending', scores: [], unscored: 0, round: null };
  const round = [...ledger.rounds].sort((a, b) => b.round - a.round).find(candidate => candidate.members.some(member => Object.hasOwn(member.results, modelId)));
  if (!round) return { state: 'pending', scores: [], unscored: 0, round: null };
  const reviews = round.members.map(member => member.results[modelId]).filter((score): score is ModelScore => !!score);
  if (reviews.some(review => review.revision !== revision)) return { state: 'stale', scores: [], round: round.round };
  const scores = reviews.flatMap(review => review.score === null ? [] : [review.score]);
  const unscored = reviews.filter(review => review.score === null).length;
  if (unscored) return { state: 'pending', scores, unscored, round: round.round };
  if (round.members.some(member => member.overallScore === null)) return { state: 'pending', scores, unscored: 1, round: round.round };
  if (scores.some(score => score < MODEL_PASS_SCORE) || round.members.some(member => member.overallScore !== null && member.overallScore < MODEL_PASS_SCORE)) return { state: 'changes-required', scores, round: round.round };
  const [first, second, third] = scores;
  if (first !== undefined && second !== undefined && third !== undefined) return { state: 'approved', scores: [first, second, third], round: round.round };
  return { state: 'pending', scores, unscored: 0, round: round.round };
}

export type GrokGateStatus =
  | { state: 'ready'; round: number; passed: number; total: number; overallScore: number }
  | { state: 'blocked'; round: number | null; passed: number; total: number; overallScore: number | null };

/** Launch GPT/Claude only after Grok clears the entire current batch in one round. */
export function grokReviewGate({ modelIds, revisions, ledger }: { modelIds: readonly string[]; revisions: ReadonlyMap<string, ModelRevision>; ledger: ReviewLedger | null }): GrokGateStatus {
  const round = ledger ? [...ledger.rounds].sort((a, b) => b.round - a.round)[0] : undefined;
  const grok = round?.members.find(member => member.provider === 'cursor');
  const overallScore = grok?.overallScore ?? null;
  const passed = modelIds.filter(id => {
    const review = grok?.results[id], revision = revisions.get(id);
    return revision !== undefined && review?.revision === revision && review.score !== null && review.score >= GROK_GATE_SCORE;
  }).length;
  if (round && modelIds.length > 0 && passed === modelIds.length && overallScore !== null && overallScore >= GROK_GATE_SCORE) return { state: 'ready', round: round.round, passed, total: modelIds.length, overallScore };
  return { state: 'blocked', round: round?.round ?? null, passed, total: modelIds.length, overallScore };
}

export function parseReviewLedger(input: unknown): ReviewLedger | null { return isReviewLedger(input) ? input : null; }

export function parseRevisions(input: unknown): ReadonlyMap<string, ModelRevision> {
  if (!isRecord(input)) throw new Error('Invalid model revision manifest');
  const revisions = new Map<string, ModelRevision>();
  for (const [id, revision] of Object.entries(input)) {
    if (!isModelRevision(revision)) throw new Error(`Invalid model revision: ${id}`);
    revisions.set(id, revision);
  }
  return revisions;
}

export function reviewLabel(status: ReviewStatus): string {
  switch (status.state) {
    case 'approved': return status.scores.map(String).join('/');
    case 'stale': return '已更新 · 待三方重评';
    case 'changes-required': return `未通过 ${status.scores.map(String).join('/')}`;
    case 'pending':
      if (status.unscored) return '评审未评分 · 待补评';
      return status.scores.length ? `待三方齐评 · ${status.scores.length}/3` : '待三方 council 评审';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
