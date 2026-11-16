export const MODEL_PASS_SCORE = 9.8;
export interface ModelScore { revision: string; score: number | null; findings: readonly string[] }
export interface CouncilMember {
  reviewer: string;
  model: string;
  taskId: string;
  results: Readonly<Record<string, ModelScore>>;
}
export interface CouncilRound { round: number; date: string; members: readonly CouncilMember[] }
export interface ReviewLedger { version: 1; rounds: readonly CouncilRound[] }
export interface ReviewStatus {
  state: 'pending' | 'stale' | 'changes-required' | 'approved';
  scores: readonly number[];
  unscored?: number;
  round?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function isModelScore(value: unknown): value is ModelScore {
  if (!isRecord(value) || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision)) return false;
  if (!Array.isArray(value.findings) || !value.findings.every(finding => typeof finding === 'string')) return false;
  if (value.score === null) return value.findings.some(finding => finding.trim().length > 0);
  return typeof value.score === 'number' && Number.isFinite(value.score) && value.score >= 0 && value.score <= 10;
}

function isCouncilMember(value: unknown): value is CouncilMember {
  if (!isRecord(value) || typeof value.reviewer !== 'string' || !value.reviewer.trim()) return false;
  if (typeof value.taskId !== 'string' || !value.taskId.trim()) return false;
  if (typeof value.model !== 'string' || !/^gpt-\d+(?:\.\d+)*-sol$/.test(value.model)) return false;
  return isRecord(value.results) && Object.values(value.results).every(isModelScore);
}

export function isReviewLedger(value: unknown): value is ReviewLedger {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.rounds)) return false;
  const rounds = new Set<number>();
  return value.rounds.every((round: unknown) => {
    if (!isRecord(round) || typeof round.round !== 'number' || !Number.isInteger(round.round) || round.round < 1 || rounds.has(round.round)) return false;
    if (typeof round.date !== 'string' || !Number.isFinite(Date.parse(round.date))) return false;
    if (!Array.isArray(round.members) || round.members.length > 2 || !round.members.every(isCouncilMember)) return false;
    rounds.add(round.round);
    const reviewers = round.members.map(member => member.reviewer), tasks = round.members.map(member => member.taskId);
    return new Set(reviewers).size === reviewers.length && new Set(tasks).size === tasks.length;
  });
}

/** Two independent reviews of the same revision and round are required. */
export function modelReviewStatus(modelId: string, revision: string | undefined, ledger: unknown): ReviewStatus {
  if (!revision || !isReviewLedger(ledger)) return { state: 'pending', scores: [] };
  const round = [...ledger.rounds].sort((a, b) => b.round - a.round).find(candidate => candidate.members.some(member => Object.hasOwn(member.results, modelId)));
  if (!round) return { state: 'pending', scores: [] };
  const reviews = round.members.map(member => member.results[modelId]).filter((score): score is ModelScore => !!score);
  if (reviews.some(review => review.revision !== revision)) return { state: 'stale', scores: [], round: round.round };
  const scores = reviews.flatMap(review => review.score === null ? [] : [review.score]);
  const unscored = reviews.filter(review => review.score === null).length;
  if (unscored) return { state: 'pending', scores, unscored, round: round.round };
  if (scores.some(score => score < MODEL_PASS_SCORE)) return { state: 'changes-required', scores, round: round.round };
  return { state: scores.length === 2 ? 'approved' : 'pending', scores, round: round.round };
}

export function reviewLabel(status: ReviewStatus): string {
  if (status.state === 'approved') return `双评通过 ${status.scores.map(String).join('/')}`;
  if (status.state === 'stale') return '已更新 · 待重评';
  if (status.state === 'changes-required') return `未通过 ${status.scores.map(String).join('/')}`;
  if (status.unscored) return 'Sol 未评分 · 待补评';
  return status.scores.length ? `待第二位 Sol · ${status.scores[0]}` : '待双 Sol 评审';
}
