import { NAVIES } from '../game/naval-history.ts';
import type { ArchiveCountryId } from '../game/naval-history.ts';
import type { ArchiveCategory } from '../game/historical-archive.ts';

interface Evidence {
  source: string;
  sourceSha256: string;
  checkedOn: string;
  rationale: string;
}
interface CandidateIdentity {
  country: ArchiveCountryId;
  category: ArchiveCategory;
  candidateUrl: string;
  evidence: Evidence;
}
interface ServedIdentity {
  canonicalId: string;
  serviceCountries: readonly [ArchiveCountryId, ...ArchiveCountryId[]];
  serviceEvidence: string;
}
export type InventoryResolution = CandidateIdentity & (
  | (ServedIdentity & { disposition: 'modelled'; modelId: string })
  | (ServedIdentity & { disposition: 'service-verified' })
  | (ServedIdentity & { disposition: 'same-as' })
  | (ServedIdentity & { disposition: 'configuration'; configuration: string; modelId: string | null })
  | { disposition: 'excluded'; reason: 'unmanned' | 'civilian-only' | 'never-served' | 'outside-period' | 'not-a-type-or-class' | 'out-of-scope-country' }
  | { disposition: 'ambiguous'; question: string }
);
export interface InventoryResolutions {
  version: 2;
  scopeComplete: boolean;
  records: readonly InventoryResolution[];
  coverageClosure: readonly { country: ArchiveCountryId; category: ArchiveCategory; closed: boolean; reason: string }[];
}

const objectOf = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected inventory object');
  return Object.fromEntries(Object.entries(value));
};
function textOf(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Expected nonempty inventory text');
  return value;
}
function urlOf(value: unknown): string {
  const url = textOf(value);
  if (new URL(url).protocol !== 'https:') throw new Error('Inventory evidence must use HTTPS');
  return url;
}
function countryOf(value: unknown): ArchiveCountryId {
  const country = NAVIES.find(country => country.id === value);
  if (!country) throw new Error(`Out-of-scope inventory country: ${String(value)}`);
  return country.id;
}
function categoryOf(value: unknown): ArchiveCategory {
  if (value === 'aircraft' || value === 'surface' || value === 'submarine') return value;
  throw new Error('Invalid inventory category');
}
function evidenceOf(input: unknown): Evidence {
  const value = objectOf(input);
  const sourceSha256 = textOf(value.sourceSha256);
  const checkedOn = textOf(value.checkedOn);
  if (!/^[a-f0-9]{64}$/.test(sourceSha256) || !/^\d{4}-\d{2}-\d{2}$/.test(checkedOn) || !Number.isFinite(Date.parse(checkedOn))) throw new Error('Invalid evidence hash or date');
  return { source: urlOf(value.source), sourceSha256, checkedOn, rationale: textOf(value.rationale) };
}
function servedOf(value: Record<string, unknown>): ServedIdentity {
  if (!Array.isArray(value.serviceCountries)) throw new Error('Missing service countries');
  const [first, ...rest] = value.serviceCountries.map(countryOf);
  if (!first || new Set([first, ...rest]).size !== rest.length + 1) throw new Error('Service countries must be nonempty and unique');
  return { canonicalId: textOf(value.canonicalId), serviceCountries: [first, ...rest], serviceEvidence: textOf(value.serviceEvidence) };
}
function resolutionOf(input: unknown): InventoryResolution {
  const value = objectOf(input);
  const base: CandidateIdentity = { country: countryOf(value.country), category: categoryOf(value.category), candidateUrl: urlOf(value.candidateUrl), evidence: evidenceOf(value.evidence) };
  switch (value.disposition) {
    case 'modelled': return { ...base, ...servedOf(value), disposition: 'modelled', modelId: textOf(value.modelId) };
    case 'service-verified': return { ...base, ...servedOf(value), disposition: 'service-verified' };
    case 'same-as': return { ...base, ...servedOf(value), disposition: 'same-as' };
    case 'configuration': return { ...base, ...servedOf(value), disposition: 'configuration', configuration: textOf(value.configuration), modelId: value.modelId === null ? null : textOf(value.modelId) };
    case 'ambiguous': return { ...base, disposition: 'ambiguous', question: textOf(value.question) };
    case 'excluded': {
      const reason = value.reason;
      if (reason !== 'unmanned' && reason !== 'civilian-only' && reason !== 'never-served' && reason !== 'outside-period' && reason !== 'not-a-type-or-class' && reason !== 'out-of-scope-country') throw new Error('Invalid exclusion reason');
      return { ...base, disposition: 'excluded', reason };
    }
    default: throw new Error(`Unsupported inventory disposition: ${String(value.disposition)}`);
  }
}

/** Parse the research ledger at its JSON boundary; no disposition implies an art score. */
export function parseInventoryResolutions(input: unknown): InventoryResolutions {
  const value = objectOf(input);
  if (value.version !== 2 || typeof value.scopeComplete !== 'boolean' || !Array.isArray(value.records) || !Array.isArray(value.coverageClosure)) throw new Error('Invalid inventory resolutions ledger');
  const records = value.records.map(resolutionOf);
  for (const record of records) if ('serviceCountries' in record && !record.serviceCountries.includes(record.country)) throw new Error('Candidate country missing from service evidence');
  const coverageClosure = value.coverageClosure.map((input: unknown) => {
    const cell = objectOf(input);
    if (typeof cell.closed !== 'boolean') throw new Error('Missing coverage closure flag');
    return { country: countryOf(cell.country), category: categoryOf(cell.category), closed: cell.closed, reason: textOf(cell.reason) };
  });
  return { version: 2, scopeComplete: value.scopeComplete, records, coverageClosure };
}

/** Aliases and refits resolve through a canonical type, without creating a second model. */
export function canonicalInventory(records: readonly InventoryResolution[]) {
  const canonical = new Map<string, { category: ArchiveCategory; serviceCountries: Set<ArchiveCountryId>; modelIds: Set<string> }>();
  const modelIdentities = new Map<string, string>();
  for (const record of records) {
    if (!('canonicalId' in record)) continue;
    const old = canonical.get(record.canonicalId);
    if (old && old.category !== record.category) throw new Error(`Canonical identity changes category: ${record.canonicalId}`);
    const identity = old ?? { category: record.category, serviceCountries: new Set<ArchiveCountryId>(), modelIds: new Set<string>() };
    record.serviceCountries.forEach(country => identity.serviceCountries.add(country));
    if ('modelId' in record && record.modelId) {
      const previous = modelIdentities.get(record.modelId);
      if (previous && previous !== record.canonicalId) throw new Error(`One model assigned to different canonical types: ${record.modelId}`);
      identity.modelIds.add(record.modelId);
      modelIdentities.set(record.modelId, record.canonicalId);
    }
    canonical.set(record.canonicalId, identity);
  }
  for (const record of records) if (record.disposition === 'same-as' && !records.some(target => target.disposition !== 'same-as' && 'canonicalId' in target && target.canonicalId === record.canonicalId)) throw new Error(`Alias has no canonical record: ${record.canonicalId}`);
  return canonical;
}

export const candidateKey = ({ country, category, url }: Pick<InventoryResolution, 'country' | 'category'> & { url: string }) =>
  `${country}/${category}/${url.replace('://www.', '://').replace(/\/$/, '').toLowerCase()}`;

/** A source page can describe several classes; one ambiguous remainder keeps it open. */
export function groupInventoryResolutions(records: readonly InventoryResolution[]) {
  const grouped = new Map<string, InventoryResolution[]>();
  for (const record of records) {
    const key = candidateKey({ ...record, url: record.candidateUrl });
    const previous = grouped.get(key) ?? [];
    if (previous.length && (record.disposition === 'excluded' || previous.some(row => row.disposition === 'excluded'))) {
      throw new Error(`Whole-page exclusion conflicts with another resolution: ${key}`);
    }
    const duplicate = 'canonicalId' in record
      ? previous.some(row => 'canonicalId' in row && row.canonicalId === record.canonicalId)
      : previous.some(row => !('canonicalId' in row));
    if (duplicate) throw new Error(`Duplicate resolution subject: ${key}`);
    grouped.set(key, [...previous, record]);
  }
  return grouped;
}
