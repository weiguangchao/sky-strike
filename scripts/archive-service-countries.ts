import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ARCHIVE } from '../game/historical-archive.ts';
import { NAVIES } from '../game/naval-history.ts';
import { canonicalInventory, parseInventoryResolutions } from './inventory-resolutions.ts';

/** Derive shared model operators from the evidence ledger, never from appearance years. */
export function archiveServiceCountryData(ledgerText: string) {
  const input: unknown = JSON.parse(ledgerText);
  const ledger = parseInventoryResolutions(input);
  const identities = canonicalInventory(ledger.records);
  const models = [...identities.values()].flatMap(identity => [...identity.modelIds].map(modelId => {
    const entry = ARCHIVE.find(entry => entry.modelId === modelId);
    if (!entry || entry.category !== identity.category) throw new Error(`Missing or mismatched operator model: ${modelId}`);
    return {
      modelId,
      countries: NAVIES.filter(country => identity.serviceCountries.has(country.id)).map(country => country.id),
    };
  })).sort((first, second) => first.modelId.localeCompare(second.modelId));
  return { version: 1, ledgerSha256: createHash('sha256').update(ledgerText).digest('hex'), models };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ledgerText = await readFile(new URL('../dcos/feature/inventory/eight-country-resolutions.json', import.meta.url), 'utf8');
  const data = archiveServiceCountryData(ledgerText);
  const text = JSON.stringify(data, null, 2) + '\n';
  const destination = new URL('../game/archive-service-countries.json', import.meta.url);
  if (process.argv.includes('--check')) {
    if (await readFile(destination, 'utf8') !== text) throw new Error('Served-country mapping is stale. Run npm run inventory:operators.');
  } else {
    await writeFile(destination, text);
  }
  console.info({ operatorModels: data.models.length, ledgerSha256: data.ledgerSha256, checked: process.argv.includes('--check') });
}
