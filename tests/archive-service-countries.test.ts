import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ARCHIVE, filterArchive } from '../game/historical-archive.ts';
import { archiveServiceCountries } from '../game/archive-service-countries.ts';
import { archiveServiceCountryData } from '../scripts/archive-service-countries.ts';
import { required } from './support.ts';

for (const spec of [
  { id: 'archive-spad-xiii', origin: 'fr', countries: ['fr', 'us'] },
  { id: 'archive-gato', origin: 'us', countries: ['us', 'it', 'jp'] },
  { id: 'archive-type-viic', origin: 'de', countries: ['de', 'gb', 'fr', 'ru'] },
  { id: 'archive-type-212a', origin: 'de', countries: ['de', 'it'] },
]) test(`${spec.id} appears for verified operators while keeping its representative identity`, () => {
  const entry = required(ARCHIVE.find(entry => entry.modelId === spec.id));
  assert.equal(entry.country, spec.origin);
  assert.deepEqual(new Set(archiveServiceCountries(entry)), new Set(spec.countries));
  for (const country of spec.countries) {
    const matches = filterArchive({ country, category: entry.category }).filter(row => row.modelId === spec.id);
    assert.deepEqual(matches, [entry], 'one unchanged class representative per operator');
  }
});

test('unverified operators stay out and generated mappings match the adopted evidence ledger', async () => {
  const entry = required(ARCHIVE.find(entry => entry.modelId === 'archive-type-212a'));
  assert.equal(filterArchive({ country: 'us' }).includes(entry), false);
  const ledgerText = await readFile(new URL('../dcos/feature/inventory/eight-country-resolutions.json', import.meta.url), 'utf8');
  const generated: unknown = JSON.parse(await readFile(new URL('../game/archive-service-countries.json', import.meta.url), 'utf8'));
  assert.deepEqual(generated, archiveServiceCountryData(ledgerText));
});
