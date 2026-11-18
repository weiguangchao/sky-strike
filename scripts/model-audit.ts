import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ARCHIVE, NEW_ARCHIVE } from '../game/historical-archive.ts';
import { HISTORICAL_SHIPS } from '../game/naval-history.ts';
import { VEHICLE_MODEL_IDS } from '../game/models.ts';
import { parseReviewLedger, parseRevisions, modelReviewStatus, grokReviewGate } from '../game/model-review.ts';

const root = new URL('../', import.meta.url);
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

export async function currentRevisions(): Promise<Record<string, string>> {
  const sources = await Promise.all(['assets/blender/sky-strike-ww2.blend', 'scripts/blender/build_models.py', 'assets/blender/century-archive.blend', 'scripts/blender/build_archive.py', 'scripts/blender/refine_geometry.py', 'scripts/sprites.ts'].map(async file => hash(await readFile(new URL(file, root)))));
  return Object.fromEntries(await Promise.all(VEHICLE_MODEL_IDS.map(async modelId => {
    const entry = ARCHIVE.find(item => item.modelId === modelId);
    const isNew = NEW_ARCHIVE.some(item => item.modelId === modelId);
    const definition = entry ? (isNew ? NEW_ARCHIVE.find(item => item.id === entry.id) : HISTORICAL_SHIPS.find(item => item.id === entry.id)) : { modelId };
    const [geometry, sprite] = await Promise.all(['models/' + modelId + '.glb', 'sprites/' + modelId + '.png'].map(file => readFile(new URL('game/public/assets/' + file, root))));
    if (!geometry || !sprite) throw new Error(`Missing review asset: ${modelId}`);
    return [modelId, hash(JSON.stringify({ asset: hash(geometry), sprite: hash(sprite), definition, blend: sources[isNew ? 2 : 0], generator: sources[isNew ? 3 : 1], refinement: sources[4], spriteGenerator: sources[5] }))];
  })));
}

export async function refreshRevisions(): Promise<void> {
  await writeFile(new URL('game/archive-revisions.json', root), JSON.stringify(await currentRevisions(), null, 2) + '\n');
}

async function audit(): Promise<void> {
  if (process.argv.includes('--refresh')) await refreshRevisions();
  const revisions = await currentRevisions();
  const recorded: unknown = JSON.parse(await readFile(new URL('game/archive-revisions.json', root), 'utf8'));
  const ledger = parseReviewLedger(JSON.parse(await readFile(new URL('game/model-reviews.json', root), 'utf8')));
  if (!ledger) throw new Error('Invalid council ledger: independent Claude Opus high, GPT Sol xhigh and Cursor Grok 4.7 xhigh tasks with finite scores or explicit no-score reasons are required.');
  if (JSON.stringify(revisions) !== JSON.stringify(recorded)) throw new Error('Model revisions changed. Run npm run models:audit -- --refresh; changed models require a fresh council.');
  const counts = { pending: 0, stale: 0, 'changes-required': 0, approved: 0 };
  const parsedRevisions = parseRevisions(revisions);
  parseRevisions(recorded);
  for (const modelId of VEHICLE_MODEL_IDS) counts[modelReviewStatus({ modelId, revision: parsedRevisions.get(modelId), ledger }).state]++;
  const grokGate = grokReviewGate({ modelIds: VEHICLE_MODEL_IDS, revisions: parsedRevisions, ledger });
  console.info(JSON.stringify({ coverage: 'all vehicles currently in the project; eight-country service inventory audit is in progress', total: VEHICLE_MODEL_IDS.length, thresholds: { grok: '>=9.8', gptAndClaude: '>=9.8' }, grokGate, ...counts }, null, 2));
  if (process.argv.includes('--require-grok') && grokGate.state !== 'ready') process.exitCode = 1;
  if (process.argv.includes('--require-approved') && counts.approved !== VEHICLE_MODEL_IDS.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await audit();
