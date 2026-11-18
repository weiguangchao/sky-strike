import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraftLinks, navalLeaf, submarineLink, supplementalDiscoveries, publishInventory } from '../scripts/collect-service-inventory.ts';
import { serviceTables } from '../scripts/collect-atlas-service-evidence.ts';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('aircraft discovery reads the model column without treating origin countries as aircraft', () => {
  const html = `<table class="wikitable sortable"><tr><th>Aircraft</th><th>Origin</th></tr>
    <tr><td><a href="/wiki/Supermarine_Spitfire">Spitfire</a></td><td><a href="/wiki/United_Kingdom">United Kingdom</a></td></tr>
    <tr><td><a href="/wiki/Douglas_C-47_Skytrain">C-47</a> / <a href="/wiki/Lisunov_Li-2">Li-2</a></td><td>Multiple</td></tr></table>`;
  assert.deepEqual(aircraftLinks({ html, base: 'https://en.wikipedia.org/' }).map(link => link.title), ['Spitfire', 'C-47', 'Li-2']);
});

test('aircraft URLs retain apostrophes inside double-quoted links and quotes inside single-quoted links', () => {
  const html = `<table class="wikitable"><tr><th>Aircraft</th></tr>
    <tr><td><a href="https://en.wikipedia.org/wiki/Xi'an_H-6" title="Xi'an H-6">Xian H-6</a></td></tr>
    <tr><td><a href='/wiki/Example_"Trainer"'>Quoted trainer</a></td></tr></table>`;
  assert.deepEqual(aircraftLinks({ html, base: 'https://en.wikipedia.org/' }), [
    { url: "https://en.wikipedia.org/wiki/Xi'an_H-6", title: 'Xian H-6' },
    { url: 'https://en.wikipedia.org/wiki/Example_%22Trainer%22', title: 'Quoted trainer' },
  ]);
});

test('designation discovery follows the aircraft header when the model is in the second column', () => {
  const html = `<table class='wikitable'><tr><th>Designation</th><th>Aircraft</th><th>Manufacturer</th></tr>
    <tr><td>C-47</td><td><a href='/wiki/Douglas_C-47_Skytrain#Variants'>Skytrain</a></td><td>Douglas</td></tr></table>`;
  assert.deepEqual(aircraftLinks({ html, base: 'https://en.wikipedia.org/' }), [{ url: 'https://en.wikipedia.org/wiki/Douglas_C-47_Skytrain', title: 'Skytrain' }]);
});

test('aircraft model takes precedence over a separate unlinked nickname column', () => {
  const html = `<table class="wikitable"><tr><th>Aircraft model</th><th>Name</th><th>Role</th></tr>
    <tr><td><a href="/wiki/Macchi_C.202">Macchi C.202</a></td><td>Folgore</td><td>Fighter</td></tr></table>`;
  assert.deepEqual(aircraftLinks({ html, base: 'https://en.wikipedia.org/' }).map(link => link.title), ['Macchi C.202']);
});

test('designation lists discover numbered models without ingesting manufacturers or bibliography', () => {
  const html = `<ul><li>A – <a href="/wiki/Curtiss_Aeroplane_Company">Curtiss</a></li>
    <li><a href="/wiki/Curtiss_PN-1">PN-1</a> – Curtiss</li></ul>
    <h2 id="References">References</h2><ul><li><a href="/wiki/ISBN_978123">Book</a></li></ul>`;
  assert.deepEqual(aircraftLinks({ html, base: 'https://en.wikipedia.org/' }).map(link => link.title), ['PN-1']);
});

test('naval discovery separates numbered submarine indexes and class leaves from surface ships', () => {
  assert.equal(submarineLink('https://www.navypedia.org/ships/uk/uk_ss1.htm'), true);
  assert.equal(submarineLink('https://www.navypedia.org/ships/uk/uk_ss1_a.htm'), true);
  assert.equal(submarineLink('https://www.navypedia.org/ships/germany/ger_sm_uc1.htm'), true);
  assert.equal(submarineLink('https://www.navypedia.org/ships/usa/us_dd_fletcher.htm'), false);
  assert.equal(submarineLink('https://www.navypedia.org/ships/japan/jap_aux_ss.htm'), false);
  assert.equal(submarineLink('https://www.navypedia.org/ships/russia/ru_cf_sm3.htm'), false);
  assert.equal(submarineLink('https://www.navypedia.org/ships/russia/ru_cf_sm4.htm'), false);
  assert.equal(navalLeaf('https://www.navypedia.org/ships/uk/uk_ss1_a.htm'), true);
  assert.equal(navalLeaf('https://www.navypedia.org/ships/uk/uk_ss1.htm'), false);
});

test('mixed historical lists and modern tables retain early and unnumbered aircraft without table navigation', () => {
  const html = `<div class="mw-parser-output"><h2 id="World_War_I">World War I</h2>
    <ul><li><a href="/wiki/Breguet_14">Breguet 14</a></li><li><a href="/wiki/Sopwith_Camel">Sopwith Camel</a></li></ul>
    <table class="wikitable"><tr><th>Aircraft</th><th>Role</th></tr>
    <tr><td><a href="/wiki/Dassault_Rafale">Rafale</a></td><td><ul><li><a href="/wiki/Multirole_combat_aircraft">Multirole</a></li></ul></td></tr></table>
    <table class="navbox"><tr><td><table><tr><td>Navigation</td></tr></table><ul><li><a href="/wiki/Air_Base_99">Air Base 99</a></li></ul></td></tr></table>
    <h2 id="References">References</h2><ul><li><a href="/wiki/Book_1917">Book</a></li></ul></div>`;
  assert.deepEqual(aircraftLinks({ html, base: 'https://en.wikipedia.org/wiki/List_of_military_aircraft_of_France' }).map(link => link.title), ['Rafale', 'Breguet 14', 'Sopwith Camel']);
});

test('aircraft discovery expands rowspans instead of treating a following role as a model', () => {
  const html = `<table class="wikitable"><tr><th>Aircraft</th><th>Role</th><th>Variant</th></tr>
    <tr><td rowspan="2"><a href="/wiki/McDonnell_Douglas_F-15_Eagle">F-15</a></td><td>Fighter</td><td>J</td></tr>
    <tr><td><a href="/wiki/Trainer_aircraft">Conversion trainer</a></td><td>DJ</td></tr></table>`;
  assert.deepEqual(aircraftLinks({ html, base: 'https://en.wikipedia.org/' }).map(row => row.title), ['F-15', 'F-15']);
});

test('discovery excludes article navigation and tables without an aircraft column', () => {
  const html = `<ul><li><a href="/wiki/Percent_encoded_%C3%A4">Read</a></li></ul>
    <div class="mw-content-ltr mw-parser-output"><table class="wikitable"><tr><th>Airfield</th><th>Year</th></tr>
    <tr><td><a href="/wiki/Air_Base_1">Air Base 1</a></td><td>1941</td></tr></table>
    <ul><li><a href="/wiki/Nieuport_11">Nieuport 11</a></li></ul>
    <h2 id="References">References</h2></div>`;
  assert.deepEqual(aircraftLinks({ html, base: 'https://en.wikipedia.org/' }).map(row => row.title), ['Nieuport 11']);
});

test('footnoted aircraft headers work while a naval class table cannot become an aircraft inventory', () => {
  const html = `<table class="wikitable"><tr><th>Wing</th><th>Model <sup>[5]</sup></th></tr>
    <tr><td>1</td><td><a href="/wiki/North_American_P-51_Mustang">P-51</a></td></tr></table>
    <table class="wikitable"><tr><th>Class</th><th>Type</th></tr>
    <tr><td><a href="/wiki/Example_class">Example</a></td><td><a href="/wiki/Destroyer">Destroyer</a></td></tr></table>`;
  assert.deepEqual(aircraftLinks({ html, base: 'https://en.wikipedia.org/' }).map(row => row.title), ['P-51']);
});

test('naval service tables retain commissioning, completion and cancelled rows with optional HTML row endings', () => {
  const html = `<table><tr><th>Name</th><th>Launched</th><th>Comm</th><th>Fate</th>
    <tr><td>Iowa</td><td>27.8.1942</td><td>22.2.1943</td><td>stricken 3.2006</td>
    <tr><td>Kentucky</td><td>20.1.1950</td><td>---</td><td>incomplete</td></table>
    <table><tr><th>Name</th><th>Comp</th></tr><tr><td>Rubis</td><td>23.2.1983</td></tr></table>`;
  const tables = serviceTables(html);
  assert.equal(tables[0]?.dateKind, 'commissioning');
  assert.equal(tables[1]?.dateKind, 'completion');
  assert.deepEqual(tables[0]?.rows, [['Iowa', '27.8.1942', '22.2.1943', 'stricken 3.2006'], ['Kentucky', '20.1.1950', '---', 'incomplete']]);
});

test('the shared Central Powers index contributes only the German aircraft section', () => {
  const html = `<div class="mw-parser-output"><h2 id="Austro-Hungarian_aircraft">Austro-Hungarian aircraft</h2>
    <ul><li><a href="/wiki/Aviatik_B.I">Aviatik B.I</a></li></ul>
    <h2 id="German_aircraft">German aircraft</h2><h3>C types</h3>
    <ul><li><a href="/wiki/Albatros_C.III">Albatros C.III</a></li></ul>
    <h2 id="Ottoman_aircraft">Ottoman aircraft</h2><ul><li><a href="/wiki/Bleriot_XI">Bleriot XI</a></li></ul></div>`;
  const base = 'https://en.wikipedia.org/wiki/List_of_World_War_I_Central_Powers_aircraft';
  assert.deepEqual(aircraftLinks({ html, base }).map(link => link.title), ['Albatros C.III']);
  assert.throws(() => aircraftLinks({ html: '<ul><li><a href="/wiki/Albatros_C.III">Albatros C.III</a></li></ul>', base }), /German aircraft section/);
});


test('Japanese auxiliary indexes retain their seven midget submarine pages without moving assault craft or tenders', () => {
  for (const file of ['a_sub', 'b_c', 'm_kanamono', 'shinkai', 's_kanamono', 'd', 'kairyu']) {
    assert.equal(submarineLink(`https://www.navypedia.org/ships/japan/jap_aux_${file}.htm`, 'Midget submarines'), true, file);
  }
  assert.equal(submarineLink('https://www.navypedia.org/ships/japan/jap_aux_u_kanamono.htm', 'Submerging assault craft'), false);
  assert.equal(submarineLink('https://www.navypedia.org/ships/japan/jap_aux_maru_se.htm', 'Submerging assault craft'), false);
  assert.equal(submarineLink('https://www.navypedia.org/ships/japan/jap_aux_ss.htm', 'SS tank landing ships'), false);
  assert.equal(submarineLink('https://www.navypedia.org/ships/usa/us_aux_tender.htm', 'Submarine tender'), false);
  assert.equal(submarineLink('https://www.navypedia.org/ships/china/ch_es_kao_ming.htm', 'KAO MING submarine chasers'), false);
  assert.equal(submarineLink('https://www.navypedia.org/ships/france/fr_co_asds1.htm', 'Submarine decoy ships'), false);
});

test('supplemental discovery preserves provenance without assigning service, models or scores', () => {
  const row = { country: 'us', category: 'submarine', url: 'https://en.wikipedia.org/wiki/Balao-class_submarine', title: 'Balao class', evidenceSource: 'https://en.wikipedia.org/wiki/Balao-class_submarine', evidenceSha256: 'a'.repeat(64), checkedOn: '2026-11-17', supportingQuote: '120 of these boats were commissioned' };
  assert.deepEqual(supplementalDiscoveries({ version: 1, records: [row] }), [row]);
  assert.throws(() => supplementalDiscoveries({ version: 1, records: [{ ...row, country: 'ca' }] }), /Out-of-scope/);
  assert.throws(() => supplementalDiscoveries({ version: 1, records: [{ ...row, evidenceSha256: 'missing' }] }), /provenance/);
  assert.throws(() => supplementalDiscoveries({ version: 1, records: [{ ...row, url: 'http://example.org/' }] }), /provenance/);
});

test('an incomplete refresh preserves the previous index and a complete refresh can replace it', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'sky-strike-inventory-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const destination = pathToFileURL(join(folder, 'index.json'));
  const previous = '{"complete":false,"previous":"validated index"}\n';
  await writeFile(destination, previous);
  const decisions = [{ country: 'cn', category: 'aircraft', candidateUrl: 'https://www.example.org/J-7/' }] as const;
  await assert.rejects(publishInventory({ report: { candidates: [] }, decisions, destination }), /missing discovery.*existing decision.*J-7/);
  assert.equal(await readFile(destination, 'utf8'), previous, 'source loss must not replace the existing index');
  const report = { complete: false, candidates: [{ country: 'cn', category: 'aircraft', url: 'https://example.org/j-7' }] } as const;
  await publishInventory({ report, decisions, destination });
  assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), report);
});
