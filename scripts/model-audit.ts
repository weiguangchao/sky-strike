import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ARCHIVE, NEW_ARCHIVE } from '../game/historical-archive.ts';
import { HISTORICAL_SHIPS } from '../game/naval-history.ts';
import { parseReviewLedger, parseRevisions, modelReviewStatus } from '../game/model-review.ts';

const root = new URL('../', import.meta.url);
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

export async function currentRevisions(): Promise<Record<string, string>> {
  const sources = await Promise.all(['assets/blender/sky-strike-ww2.blend', 'scripts/blender/build_models.py', 'assets/blender/century-archive.blend', 'scripts/blender/build_archive.py'].map(async file => hash(await readFile(new URL(file, root)))));
  return Object.fromEntries(await Promise.all(ARCHIVE.map(async entry => {
    const isNew = entry.category !== 'surface';
    const definition = isNew ? NEW_ARCHIVE.find(item => item.id === entry.id) : HISTORICAL_SHIPS.find(item => item.id === entry.id);
    const geometry = await readFile(new URL(`game/public/assets/models/${entry.modelId}.glb`, root));
    return [entry.modelId, hash(JSON.stringify({ asset: hash(geometry), definition, blend: sources[isNew ? 2 : 0], generator: sources[isNew ? 3 : 1] }))];
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
  if (!ledger) throw new Error('Invalid council ledger: independent GPT Sol task IDs, finite scores or an explicit no-score reason are required.');
  if (JSON.stringify(revisions) !== JSON.stringify(recorded)) throw new Error('Model revisions changed. Run npm run models:audit -- --refresh; changed models require a fresh council.');
  const counts = { pending: 0, stale: 0, 'changes-required': 0, approved: 0 };
  const parsedRevisions = parseRevisions(revisions);
  parseRevisions(recorded);
  for (const entry of ARCHIVE) counts[modelReviewStatus({ modelId: entry.modelId, revision: parsedRevisions.get(entry.modelId), ledger }).state]++;
  console.info(JSON.stringify({ coverage: 'partial; global service inventory not yet complete', total: ARCHIVE.length, threshold: 9.8, ...counts }, null, 2));
  if (process.argv.includes('--require-approved') && counts.approved !== ARCHIVE.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await audit();
