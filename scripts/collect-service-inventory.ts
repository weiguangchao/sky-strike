import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { NAVIES } from '../game/naval-history.ts';
import type { ArchiveCountryId } from '../game/naval-history.ts';
import { ARCHIVE } from '../game/historical-archive.ts';
import previousInventory from '../dcos/feature/inventory/eight-country-index.json';
import supplementalInput from '../dcos/feature/inventory/eight-country-supplemental-discoveries.json';

type Category = 'aircraft' | 'surface' | 'submarine';
interface Link { url: string; title: string }
interface Source { country: ArchiveCountryId; category: Category | 'naval'; url: string }
type RetrievedSource = Source & (
  | { state: 'retrieved'; sha256: string; bytes: number; snapshot: string; retrievedAt: string; links: readonly Link[] }
  | { state: 'unavailable'; reason: string }
);
interface Candidate extends Link {
  country: ArchiveCountryId;
  category: Category;
  indexSources: string[];
  serviceEvidence: 'not-yet-verified';
  existingModelCandidates: string[];
}
interface SupplementalDiscovery extends Link {
  country: ArchiveCountryId;
  category: Category;
  evidenceSource: string;
  evidenceSha256: string;
  checkedOn: string;
  supportingQuote: string;
}

const NAVAL_INDEXES = {
  cn: 'china/ch', us: 'usa/usa', fr: 'france/fr', gb: 'uk/uk',
  ru: 'russia/ru', jp: 'japan/jap', de: 'germany/ger', it: 'italy/it',
} satisfies Record<ArchiveCountryId, string>;

// These are discovery sources, not proof that every row entered service.
// Missing branches, prototypes, imports and aliases must be adjudicated separately.
const AIRCRAFT_INDEXES = {
  cn: ['List_of_aircraft_of_the_People%27s_Liberation_Army_Air_Force', 'List_of_equipment_of_the_Republic_of_China_Air_Force', 'List_of_aircraft_used_in_China_before_1937', 'People%27s_Liberation_Army_Naval_Air_Force'],
  us: ['List_of_active_United_States_military_aircraft', 'List_of_United_States_Air_Force_aircraft_designations_(1919–1962)', 'List_of_United_States_Navy_aircraft_designations_(pre-1962)', 'List_of_United_States_Tri-Service_aircraft_designations', 'List_of_undesignated_military_aircraft_of_the_United_States', 'List_of_aircraft_of_the_United_States_during_World_War_II'],
  fr: ['List_of_military_aircraft_of_France', 'List_of_active_military_aircraft_of_the_French_Armed_Forces'],
  gb: ['List_of_aircraft_of_the_Royal_Air_Force', 'List_of_aircraft_of_the_Fleet_Air_Arm', 'List_of_aircraft_of_the_Royal_Flying_Corps', 'List_of_aircraft_of_the_Royal_Naval_Air_Service', 'List_of_aircraft_of_the_Army_Air_Corps_(United_Kingdom)'],
  ru: ['List_of_military_aircraft_of_the_Soviet_Union_and_the_CIS', 'Imperial_Russian_Air_Service', 'List_of_aircraft_of_the_Russian_Air_Force'],
  jp: ['List_of_aircraft_of_Japan_during_World_War_II', 'Japan_Air_Self-Defense_Force', 'Japan_Maritime_Self-Defense_Force_aviation', 'List_of_aircraft_of_the_Imperial_Japanese_Navy'],
  de: ['List_of_military_aircraft_of_Germany', 'List_of_World_War_I_Central_Powers_aircraft', 'List_of_aircraft_of_the_Luftwaffe,_World_War_II', 'Marineflieger'],
  it: ['List_of_aircraft_used_by_Italian_Air_Force', 'List_of_active_Italian_military_aircraft', 'List_of_Regia_Aeronautica_aircraft_used_in_World_War_II'],
} satisfies Record<ArchiveCountryId, readonly string[]>;

const textOf = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|lt|gt);|&#(?:39|160);/g, entity => {
  switch (entity) {
    case '&amp;': return '&';
    case '&quot;': return '"';
    case '&#39;': return "'";
    case '&lt;': return '<';
    case '&gt;': return '>';
    default: return ' ';
  }
}).replace(/\s+/g, ' ').trim();

export function linksOf({ html, base }: { html: string; base: string }): Link[] {
  const links: Link[] = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, , href, label] = match;
    if (!href || !label || href.startsWith('#') || /^(javascript|mailto):/i.test(href)) continue;
    const url = new URL(href.replace(/&amp;/g, '&'), base);
    url.hash = '';
    const title = textOf(label);
    if (title) links.push({ url: url.href, title });
  }
  return links;
}

export function aircraftLinks({ html, base }: { html: string; base: string }): Link[] {
  const candidates: Link[] = [];
  // Real article pages contain navigation lists before the article. Those are
  // not aircraft indexes, even when a percent-encoded page title has digits.
  const contentStart = /<div\b[^>]*class=["'][^"']*\bmw-parser-output\b[^"']*["'][^>]*>/i.exec(html);
  let article = contentStart ? html.slice(contentStart.index + contentStart[0].length) : html;
  // This replacement for the defunct German Army index also lists countries
  // outside the requested scope. Keep only its actual German chapter, and
  // fail closed if the publisher changes that chapter's identity.
  if (new URL(base).pathname === '/wiki/List_of_World_War_I_Central_Powers_aircraft') {
    const german = /<h2\b[^>]*id=["']German_aircraft["'][^>]*>/i.exec(article);
    if (!german) throw new Error('Missing German aircraft section in Central Powers index');
    article = article.slice(german.index + german[0].length).split(/<h2\b/i)[0] ?? '';
  }
  const aircraftArticle = (link: Link) => {
    const url = new URL(link.url);
    return url.hostname === 'en.wikipedia.org' && url.pathname.startsWith('/wiki/') && !/\/[^/]*:|\/(?:List_of|Lists_of)/.test(url.pathname);
  };
  for (const table of article.matchAll(/<table\b[^>]*class=["'][^"']*wikitable[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi)) {
    const body = table[1];
    if (!body) continue;
    let aircraftColumn: number | undefined;
    const rowspans = new Map<number, { remaining: number; html: string }>();
    for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const content = row[1];
      if (!content) continue;
      const cells: string[] = [];
      for (const [column, span] of rowspans) {
        cells[column] = span.html;
        span.remaining--;
        if (!span.remaining) rowspans.delete(column);
      }
      let column = 0;
      for (const cell of content.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
        while (cells[column] !== undefined) column++;
        const attributes = cell[1] ?? '', cellHtml = cell[2] ?? '';
        const colspan = Math.max(1, Number(attributes.match(/\bcolspan=["']?(\d+)/i)?.[1] ?? 1));
        const rowspan = Math.max(1, Number(attributes.match(/\browspan=["']?(\d+)/i)?.[1] ?? 1));
        for (let offset = 0; offset < colspan; offset++) {
          cells[column + offset] = cellHtml;
          if (rowspan > 1) rowspans.set(column + offset, { html: cellHtml, remaining: rowspan - 1 });
        }
        column += colspan;
      }
      if (!/<td\b/i.test(content)) {
        const headers = cells.map(cell => textOf(cell).replace(/\[[^\]]*\]/g, '').trim());
        const modelColumn = headers.findIndex(cell => /^(aircraft(?: model| type)?|model)$/i.test(cell));
        const namedColumn = modelColumn >= 0 ? modelColumn : headers.findIndex(cell => /^name$/i.test(cell) || (!headers.some(header => /^class$/i.test(header)) && /^type$/i.test(cell)));
        if (namedColumn >= 0) aircraftColumn = namedColumn;
        continue;
      }
      if (aircraftColumn === undefined) continue;
      const cell = cells[aircraftColumn] ?? '';
      const links = linksOf({ html: cell, base }).filter(aircraftArticle);
      for (const link of links) candidates.push({ ...link, title: link.title });
    }
  }
  // Historical lists can coexist with modern tables in the same index.
  // Remove complete (including nested) tables before parsing list items, so
  // role links and navigation cannot become aircraft merely through a list.
  const indexPath = new URL(base).pathname;
  const namedTypes = indexPath.startsWith('/wiki/List_of_') && !/designation/i.test(indexPath);
  if (indexPath.startsWith('/wiki/List_of_') || candidates.length === 0) {
    const body = article.split(/<h[23]\b[^>]*id=["'](?:See_also|References|Notes|Sources|External_links)["']/i)[0] ?? '';
    const outsideTables: string[] = [];
    let depth = 0, start = 0;
    for (const tag of body.matchAll(/<\/?table\b[^>]*>/gi)) {
      if (tag[0].startsWith('</')) {
        depth = Math.max(0, depth - 1);
        if (depth === 0) start = tag.index + tag[0].length;
      } else {
        if (depth === 0) outsideTables.push(body.slice(start, tag.index));
        depth++;
      }
    }
    if (depth === 0) outsideTables.push(body.slice(start));
    for (const item of outsideTables.join('').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const links = linksOf({ html: item[1] ?? '', base }).filter(aircraftArticle);
      const link = namedTypes ? links[0] : links.find(link => /\d/.test(new URL(link.url).pathname));
      if (link) candidates.push(link);
    }
  }
  return candidates;
}

export const navalLeaf = (url: string) => /\/ships\/[^/]+\/[^/_]+_[a-z]+[0-9]?_.+\.htm$/i.test(new URL(url).pathname);
export const submarineLink = (url: string, title = '') => /\/[^/_]+_s[sm][0-9]?[_\.]/i.test(new URL(url).pathname)
  || (navalLeaf(url) && /\bmidget submarines?\b/i.test(title) && !/\b(?:chasers?|decoy|tenders?|rescue|support|depot)\b/i.test(title));
const normalize = (url: string) => url.replace('://www.', '://').replace(/\/$/, '').toLowerCase();

/** Supplemental links are discovery leads; service decisions remain separate. */
export function supplementalDiscoveries(input: unknown): SupplementalDiscovery[] {
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 1 || !('records' in input) || !Array.isArray(input.records)) throw new Error('Invalid supplemental discoveries');
  return input.records.map((value: unknown): SupplementalDiscovery => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid supplemental discovery');
    const row: Record<string, unknown> = Object.fromEntries(Object.entries(value));
    const country = NAVIES.find(country => country.id === row.country);
    const category = row.category;
    if (!country || (category !== 'aircraft' && category !== 'surface' && category !== 'submarine')) throw new Error('Out-of-scope supplemental discovery');
    const text = (key: string) => {
      const field = row[key];
      if (typeof field !== 'string' || !field.trim()) throw new Error(`Missing supplemental ${key}`);
      return field;
    };
    const url = text('url'), evidenceSource = text('evidenceSource'), evidenceSha256 = text('evidenceSha256'), checkedOn = text('checkedOn');
    if (new URL(url).protocol !== 'https:' || new URL(evidenceSource).protocol !== 'https:' || !/^[a-f0-9]{64}$/.test(evidenceSha256) || !/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) throw new Error('Invalid supplemental provenance');
    return { country: country.id, category, url, title: text('title'), evidenceSource, evidenceSha256, checkedOn, supportingQuote: text('supportingQuote') };
  });
}

async function collect(): Promise<void> {
  const folder = new URL('../.artifacts/eight-country-expansion/source-pages/', import.meta.url);
  await mkdir(folder, { recursive: true });
  const retrieved: RetrievedSource[] = [];
  async function fetchSource(source: Source): Promise<RetrievedSource> {
    const previous = previousInventory.sources.find(row => row.url === source.url && row.country === source.country && row.category === source.category);
    if (!process.argv.includes('--refresh-sources') && previous?.state === 'retrieved' && 'snapshot' in previous && typeof previous.snapshot === 'string') {
      const html = await readFile(new URL(previous.snapshot, folder), 'utf8').catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (html !== undefined) {
        const sha256 = createHash('sha256').update(html).digest('hex');
        if (!('sha256' in previous) || sha256 !== previous.sha256) throw new Error(`Cached source hash mismatch: ${source.url}`);
        const retrievedAt = 'retrievedAt' in previous && typeof previous.retrievedAt === 'string' ? previous.retrievedAt : previousInventory.collectedAt;
        const result: RetrievedSource = { ...source, state: 'retrieved', sha256, bytes: Buffer.byteLength(html), snapshot: previous.snapshot, retrievedAt, links: source.category === 'aircraft' ? aircraftLinks({ html, base: source.url }) : linksOf({ html, base: source.url }) };
        console.info(JSON.stringify({ source: source.url, state: 'cached', links: result.links.length }));
        return result;
      }
    }
    try {
      const response = await fetch(source.url, { headers: { 'User-Agent': 'SkyStrikeInventoryResearch/1.0' }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const sha256 = createHash('sha256').update(html).digest('hex');
      const snapshot = `${sha256}.html`;
      await writeFile(new URL(snapshot, folder), html);
      const result: RetrievedSource = { ...source, state: 'retrieved', sha256, bytes: Buffer.byteLength(html), snapshot, retrievedAt: new Date().toISOString(), links: source.category === 'aircraft' ? aircraftLinks({ html, base: source.url }) : linksOf({ html, base: source.url }) };
      console.info(JSON.stringify({ source: source.url, state: result.state, links: result.links.length }));
      return result;
    } catch (error) {
      const result: RetrievedSource = { ...source, state: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
      console.info(JSON.stringify({ source: source.url, state: result.state, reason: result.reason }));
      return result;
    }
  }
  async function batch(sources: readonly Source[]): Promise<void> {
    for (let at = 0; at < sources.length; at += 4) retrieved.push(...await Promise.all(sources.slice(at, at + 4).map(fetchSource)));
  }
  await batch(NAVIES.map(country => ({ country: country.id, category: 'naval', url: `https://www.navypedia.org/ships/${NAVAL_INDEXES[country.id]}_index.htm` })));
  const navalSources: Source[] = [];
  for (const source of retrieved) if (source.state === 'retrieved') {
    const seen = new Set<string>();
    for (const link of source.links) if (link.url.includes('/ships/') && link.url.endsWith('.htm') && !link.url.endsWith('_index.htm') && !seen.has(link.url)) {
      seen.add(link.url);
      navalSources.push({ country: source.country, category: submarineLink(link.url, link.title) || /_ss[0-9]?\.htm$/.test(link.url) ? 'submarine' : 'surface', url: link.url });
    }
  }
  await batch(navalSources);
  await batch(NAVIES.flatMap(country => AIRCRAFT_INDEXES[country.id].map(title => ({ country: country.id, category: 'aircraft' as const, url: `https://en.wikipedia.org/wiki/${title}` }))));
  const candidates = new Map<string, Candidate>();
  const add = (link: Link, country: ArchiveCountryId, category: Category, indexSource: string) => {
    const key = `${country}/${category}/${normalize(link.url)}`;
    const old = candidates.get(key);
    if (old) { if (!old.indexSources.includes(indexSource)) old.indexSources.push(indexSource); return; }
    candidates.set(key, { ...link, country, category, indexSources: [indexSource], serviceEvidence: 'not-yet-verified', existingModelCandidates: ARCHIVE.filter(entry => normalize(entry.source) === normalize(link.url)).map(entry => entry.modelId) });
  };
  for (const source of retrieved) if (source.state === 'retrieved' && source.category !== 'naval') {
    for (const link of source.links) {
      if (source.category !== 'aircraft' && !navalLeaf(link.url)) continue;
      const category = source.category === 'aircraft' ? 'aircraft' : submarineLink(link.url, link.title) ? 'submarine' : 'surface';
      add(link, source.country, category, source.url);
    }
  }
  for (const link of supplementalDiscoveries(supplementalInput)) add(link, link.country, link.category, link.evidenceSource);
  const rows = [...candidates.values()];
  const coverage = NAVIES.flatMap(country => (['aircraft', 'surface', 'submarine'] as const).map(category => ({ country: country.id, category, state: 'in-progress', discoveredCandidates: rows.filter(row => row.country === country.id && row.category === category).length, currentAtlasEntries: ARCHIVE.filter(entry => entry.country === country.id && entry.category === category).length })));
  const report = { version: 1, collectedAt: new Date().toISOString(), scope: 'Actually served manned military aircraft types, surface warship/auxiliary and submarine classes in 1914-present; eight retained service countries. Secondary indexes contain unserved proposals and out-of-period types and MUST be verified before modeling. Imports and aliases require canonical identity reconciliation.', complete: false, coverage, sources: retrieved.map(source => source.state === 'retrieved' ? { ...source, links: undefined } : source), candidates: rows };
  await writeFile(new URL('../dcos/feature/inventory/eight-country-index.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.info(JSON.stringify({ complete: false, sources: retrieved.length, unavailable: retrieved.filter(source => source.state === 'unavailable').length, candidates: rows.length, coverage }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await collect();
