import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ARCHIVE } from '../game/historical-archive.ts';

const textOf = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function serviceTables(html: string) {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].flatMap(table => {
    // HTML permits omitted </tr> tags; Navypedia uses that form throughout.
    const rows = (table[1] ?? '').split(/<tr\b[^>]*>/i).slice(1).map(row =>
      [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => textOf(cell[1] ?? '')));
    const header = rows.find(row => row.some(cell => /^(Comm|Comp)\.?$/i.test(cell)));
    if (!header) return [];
    const eventColumn = header.findIndex(cell => /^(Comm|Comp)\.?$/i.test(cell));
    const dateKind = /^Comm/i.test(header[eventColumn] ?? '') ? 'commissioning' : 'completion';
    return [{ headers: header, eventColumn, dateKind, rows: rows.slice(rows.indexOf(header) + 1) }];
  });
}

async function collectSource({ url, folder }: { url: string; folder: URL }) {
  const atlasAppearances = ARCHIVE.filter(entry => entry.source === url).map(entry => ({ id: entry.id, modelId: entry.modelId, country: entry.country, category: entry.category }));
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'SkyStrikeInventoryResearch/1.0' }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const sha256 = createHash('sha256').update(html).digest('hex');
    await writeFile(new URL(`${sha256}.html`, folder), html);
    const tables = serviceTables(html);
    const result = { url, state: 'retrieved' as const, retrievedAt: new Date().toISOString(), sha256, title: textOf(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''), atlasAppearances, tables };
    console.info(JSON.stringify({ url, tables: tables.length }));
    return result;
  } catch (error) {
    const result = { url, state: 'unavailable' as const, reason: error instanceof Error ? error.message : String(error), atlasAppearances };
    console.info(JSON.stringify({ url, state: result.state, reason: result.reason }));
    return result;
  }
}

async function collect() {
  const folder = new URL('../.artifacts/eight-country-expansion/atlas-service-pages/', import.meta.url);
  await mkdir(folder, { recursive: true });
  const sources = [...new Set(ARCHIVE.map(entry => entry.source).filter(source => new URL(source).hostname.endsWith('navypedia.org')))];
  const records: Awaited<ReturnType<typeof collectSource>>[] = [];
  for (let at = 0; at < sources.length; at += 4) records.push(...await Promise.all(sources.slice(at, at + 4).map(url => collectSource({ url, folder }))));
  await writeFile(new URL('../dcos/feature/inventory/current-atlas-source-extracts.json', import.meta.url), JSON.stringify({
    schemaVersion: 1, generatedAt: new Date().toISOString(), complete: false,
    status: 'source-extracts-require-human-reconciliation',
    warning: 'Raw secondary-source class pages and commissioning/completion tables for existing atlas appearances. A table can include uncompleted ships, conversions, multiple configurations, and dates outside scope. Neither a nonempty completion cell nor a shared URL automatically verifies a served canonical class. Completion and commissioning are kept distinct. No model score is implied.',
    records,
  }, null, 2) + '\n');
  console.info(JSON.stringify({ sources: records.length, unavailable: records.filter(record => record.state === 'unavailable').length, complete: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await collect();
