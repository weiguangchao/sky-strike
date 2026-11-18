import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalInventory, candidateKey, groupInventoryResolutions, parseInventoryResolutions } from '../scripts/inventory-resolutions.ts';

const evidence = { source: 'https://example.org/service', sourceSha256: 'a'.repeat(64), checkedOn: '2026-11-17', rationale: 'Dated service table, including the selected variant.' };
const served = { country: 'us', category: 'aircraft', candidateUrl: 'https://example.org/c47', evidence, canonicalId: 'douglas-c47', serviceCountries: ['us'], serviceEvidence: 'Served in 1944.' };
const ledger = (records: readonly unknown[]) => ({ version: 2, scopeComplete: false, records, coverageClosure: [] });

test('an imported type shares one canonical model across evidenced service countries', () => {
  const parsed = parseInventoryResolutions(ledger([
    { ...served, disposition: 'modelled', modelId: 'archive-c47' },
    { ...served, country: 'gb', candidateUrl: 'https://example.org/dakota', serviceCountries: ['gb'], disposition: 'same-as' },
  ]));
  const canonical = canonicalInventory(parsed.records);
  assert.equal(canonical.size, 1);
  assert.deepEqual([...canonical.get('douglas-c47')?.modelIds ?? []], ['archive-c47']);
  assert.deepEqual([...canonical.get('douglas-c47')?.serviceCountries ?? []], ['us', 'gb']);
});

test('prototype exclusion and uncertain identities do not create model requirements', () => {
  const parsed = parseInventoryResolutions(ledger([
    { country: 'us', category: 'aircraft', candidateUrl: 'https://example.org/prototype', evidence, disposition: 'excluded', reason: 'never-served' },
    { country: 'us', category: 'surface', candidateUrl: 'https://example.org/conversion', evidence, disposition: 'ambiguous', question: 'Which hull was commissioned after conversion?' },
  ]));
  assert.equal(canonicalInventory(parsed.records).size, 0);
  assert.equal(parsed.records[0]?.disposition, 'excluded');
  assert.equal(parsed.records[1]?.disposition, 'ambiguous');
});

test('unmodelled configurations and service-verified omissions remain explicit', () => {
  const parsed = parseInventoryResolutions(ledger([
    { ...served, disposition: 'service-verified' },
    { ...served, candidateUrl: 'https://example.org/c47-refit', disposition: 'configuration', configuration: 'Dated refit', modelId: null },
  ]));
  assert.equal(canonicalInventory(parsed.records).get('douglas-c47')?.modelIds.size, 0);
  assert.equal(parsed.records[1]?.disposition, 'configuration');
});

test('a same-as decision cannot resolve to a missing canonical record or another category', () => {
  assert.throws(() => canonicalInventory(parseInventoryResolutions(ledger([{ ...served, disposition: 'same-as' }])).records), /no canonical record/);
  assert.throws(() => canonicalInventory(parseInventoryResolutions(ledger([
    { ...served, disposition: 'service-verified' },
    { ...served, category: 'submarine', candidateUrl: 'https://example.org/boat', disposition: 'same-as' },
  ])).records), /changes category/);
});

test('a disposition requires evidence, a retained operator and a complete model identity', () => {
  assert.throws(() => parseInventoryResolutions(ledger([{ ...served, disposition: 'modelled' }])), /nonempty/);
  assert.throws(() => parseInventoryResolutions(ledger([{ ...served, country: 'se', disposition: 'service-verified' }])), /Out-of-scope/);
  assert.throws(() => parseInventoryResolutions(ledger([{ ...served, serviceCountries: ['gb'], disposition: 'service-verified' }])), /missing from service/);
  assert.throws(() => parseInventoryResolutions(ledger([{ ...served, evidence: { ...evidence, sourceSha256: 'stale' }, disposition: 'service-verified' }])), /hash/);
});

test('reusing a model cannot hide an unmodelled distinct aircraft type', () => {
  const parsed = parseInventoryResolutions(ledger([
    { ...served, disposition: 'modelled', modelId: 'archive-c47' },
    { ...served, candidateUrl: 'https://example.org/other-type', canonicalId: 'different-type', disposition: 'modelled', modelId: 'archive-c47' },
  ]));
  assert.throws(() => canonicalInventory(parsed.records), /different canonical types/);
});

test('one source page may resolve multiple types while its uncertain remainder stays open', () => {
  const parsed = parseInventoryResolutions(ledger([
    { ...served, disposition: 'service-verified' },
    { ...served, canonicalId: 'another-type-on-page', disposition: 'service-verified' },
    { country: served.country, category: served.category, candidateUrl: served.candidateUrl, evidence, disposition: 'ambiguous', question: 'Did the remaining type enter service?' },
  ]));
  const pages = groupInventoryResolutions(parsed.records);
  assert.equal(pages.size, 1, 'decisions do not invent extra discovery pages');
  const first = parsed.records[0];
  assert.ok(first);
  const records = pages.get(candidateKey({ ...first, url: first.candidateUrl }));
  assert.equal(records?.length, 3);
  assert.equal(records?.some(record => record.disposition === 'ambiguous'), true);
  assert.equal(canonicalInventory(parsed.records).size, 2);
});

test('duplicate subjects and whole-page exclusion cannot erase other classes on a page', () => {
  const first = { ...served, disposition: 'service-verified' };
  const exclusion = { country: served.country, category: served.category, candidateUrl: served.candidateUrl, evidence, disposition: 'excluded', reason: 'never-served' };
  for (const records of [[first, first], [first, { ...first, candidateUrl: 'https://www.example.org/c47/' }]]) {
    assert.throws(() => groupInventoryResolutions(parseInventoryResolutions(ledger(records)).records), /Duplicate resolution subject/);
  }
  for (const records of [[first, exclusion], [exclusion, first]]) {
    assert.throws(() => groupInventoryResolutions(parseInventoryResolutions(ledger(records)).records), /Whole-page exclusion/);
  }
});
