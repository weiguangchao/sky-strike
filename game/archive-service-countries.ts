import { NAVIES } from './naval-history.ts';
import type { ArchiveEntry } from './historical-archive.ts';
import serviceCountries from './archive-service-countries.json' with { type: 'json' };

// The China evidence covers the J-7 and Mirage 2000-5, not these catalogued variants.
const ORIGIN_ONLY_MODELS: ReadonlySet<string> = new Set(['archive-mig21pf', 'archive-mirage2000c']);

/** Use the verified class operators, except where a related variant is a different catalog subject. */
export function archiveServiceCountries(entry: Pick<ArchiveEntry, 'modelId' | 'country'>) {
  if (ORIGIN_ONLY_MODELS.has(entry.modelId)) return [entry.country];
  const verified = serviceCountries.models.find(row => row.modelId === entry.modelId);
  return verified
    ? NAVIES.filter(country => verified.countries.includes(country.id)).map(country => country.id)
    : [entry.country];
}
