import { NAVIES } from './naval-history.ts';
import type { ArchiveEntry } from './historical-archive.ts';
import serviceCountries from './archive-service-countries.json' with { type: 'json' };

/** Served operators share a class representative; its country and year stay unchanged. */
export function archiveServiceCountries(entry: Pick<ArchiveEntry, 'modelId' | 'country'>) {
  const verified = serviceCountries.models.find(row => row.modelId === entry.modelId);
  return verified
    ? NAVIES.filter(country => verified.countries.includes(country.id)).map(country => country.id)
    : [entry.country];
}
