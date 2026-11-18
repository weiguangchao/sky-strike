import { pathToFileURL } from 'node:url';
import inventory from '../dcos/feature/inventory/eight-country-index.json';
import resolutionInput from '../dcos/feature/inventory/eight-country-resolutions.json';
import reviews from '../game/model-reviews.json';
import revisions from '../game/archive-revisions.json';
import { ARCHIVE } from '../game/historical-archive.ts';
import { NAVIES } from '../game/naval-history.ts';
import { modelReviewStatus, parseReviewLedger, parseRevisions } from '../game/model-review.ts';
import { currentRevisions } from './model-audit.ts';
import { candidateKey, canonicalInventory, groupInventoryResolutions, parseInventoryResolutions } from './inventory-resolutions.ts';

const categories = ['aircraft', 'surface', 'submarine'] as const;

export async function auditInventory() {
  const resolutions = parseInventoryResolutions(resolutionInput);
  const ledger = parseReviewLedger(reviews);
  if (!ledger) throw new Error('Invalid council ledger');
  const parsedRevisions = parseRevisions(revisions);
  const actualRevisions = await currentRevisions();
  if (JSON.stringify(actualRevisions) !== JSON.stringify(revisions)) throw new Error('Refresh model revisions before auditing inventory');
  const retained = new Set<string>(NAVIES.map(country => country.id));
  const candidates = new Set(inventory.candidates.map(candidateKey));
  const resolved = groupInventoryResolutions(resolutions.records);
  for (const record of resolutions.records) {
    const key = candidateKey({ ...record, url: record.candidateUrl });
    if (!candidates.has(key)) throw new Error(`Resolution has no discovery row: ${key}`);
    if (!retained.has(record.country)) throw new Error(`Out-of-scope operator: ${key}`);
    if ('modelId' in record && record.modelId) {
      const entry = ARCHIVE.find(entry => entry.modelId === record.modelId);
      if (!entry || entry.category !== record.category) throw new Error(`Missing or mismatched atlas model: ${key}`);
    }
  }
  const canonical = canonicalInventory(resolutions.records);
  const acceptedModel = (modelId: string) => modelReviewStatus({ modelId, revision: parsedRevisions.get(modelId), ledger }).state === 'approved';
  const coverage = NAVIES.flatMap(country => categories.map(category => {
    const rows = inventory.candidates.filter(row => row.country === country.id && row.category === category);
    const decisions = rows.flatMap(row => resolved.get(candidateKey(row)) ?? []);
    const identities = [...canonical.values()].filter(identity => identity.category === category && identity.serviceCountries.has(country.id));
    const accepted = identities.filter(identity => identity.modelIds.size > 0 && [...identity.modelIds].every(acceptedModel));
    const ambiguous = decisions.filter(record => record.disposition === 'ambiguous').length;
    const missingModels = identities.filter(identity => identity.modelIds.size === 0).length;
    const unmodelledConfigurations = decisions.filter(record => record.disposition === 'configuration' && record.modelId === null).length;
    const closure = resolutions.coverageClosure.filter(cell => cell.country === country.id && cell.category === category);
    if (closure.length !== 1) throw new Error(`Missing or duplicated coverage declaration: ${country.id}/${category}`);
    const unresolved = rows.filter(row => {
      const records = resolved.get(candidateKey(row));
      return !records || records.some(record => record.disposition === 'ambiguous');
    }).length;
    const declaredClosed = closure.every(cell => cell.closed);
    // The requested census is by type/class. Extra refit appearances remain
    // visible in the report, while one approved representative covers a class.
    if (declaredClosed && (!rows.length || unresolved > 0 || accepted.length !== identities.length)) throw new Error(`Premature coverage closure: ${country.id}/${category}`);
    return {
      country: country.id, category, state: declaredClosed ? 'closed' : 'in-progress',
      discoveredCandidates: rows.length, unresolved, decisions: decisions.length,
      excluded: decisions.filter(record => record.disposition === 'excluded').length, ambiguous,
      serviceVerified: identities.length, missingModels, unmodelledConfigurations,
      modelDrafts: identities.length - missingModels - accepted.length, councilAccepted: accepted.length,
      currentAtlasAppearances: ARCHIVE.filter(entry => entry.country === country.id && entry.category === category).length,
    };
  }));
  const unavailableSources = inventory.sources.filter(source => source.state === 'unavailable').map(source => source.url);
  const complete = coverage.every(cell => cell.state === 'closed') && unavailableSources.length === 0;
  if (resolutions.scopeComplete && !complete) throw new Error('Inventory claims completion while coverage is open');
  return {
    scope: inventory.scope, complete,
    warning: 'Discovery rows are unverified leads, not a required model count. Current atlas appearances include configurations and are not a canonical class census.',
    candidates: inventory.candidates.length, unresolved: coverage.reduce((total, cell) => total + cell.unresolved, 0),
    decisions: resolutions.records.length, candidatesWithDecisions: resolved.size, canonicalTypes: canonical.size, coverage, unavailableSources,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await auditInventory();
  console.info(JSON.stringify(report, null, 2));
  if (process.argv.includes('--require-complete') && !report.complete) process.exitCode = 1;
}
