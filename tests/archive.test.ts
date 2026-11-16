import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, DoubleSide, Mesh, Raycaster, Vector3 } from 'three';
import { ARCHIVE, ARCHIVE_COUNTRIES, NEW_ARCHIVE, archiveEra, filterArchive } from '../game/historical-archive.ts';
import { isReviewLedger, modelReviewStatus, reviewLabel } from '../game/model-review.ts';
import type { CouncilMember, ReviewLedger } from '../game/model-review.ts';
import type { Object3D } from 'three';
import { currentRevisions } from '../scripts/model-audit.ts';

async function archiveScene(id: string) {
  const buffer = await readFile(new URL(`../game/public/assets/models/archive-${id}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer, '');
  scene.updateMatrixWorld(true);
  return scene;
}

function components(root: Object3D, name: string): Object3D[] {
  const found: Object3D[] = [];
  root.traverse(node => { if (node.userData.archive_component === name) found.push(node); });
  return found;
}

function worldVertices(root: Object3D): Vector3[] {
  const points: Vector3[] = [];
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const positions = node.geometry.getAttribute('position');
    for (let at = 0; at < positions.count; at++) points.push(new Vector3().fromBufferAttribute(positions, at).applyMatrix4(node.matrixWorld));
  });
  return points;
}

function wingEdge(points: Vector3[], fraction: number) {
  const span = Math.max(...points.map(point => point.x));
  const section = points.filter(point => Math.abs(point.x - span * fraction) < .0001).sort((a, b) => a.z - b.z);
  assert.ok(section.length, `wing section ${fraction} is present in the exported mesh`);
  return { leading: section[0], trailing: section.at(-1)! };
}

// Sum actual upward-facing painted triangles. A convex hull would fill in
// concave leading-edge extensions and the Camel centre-section cutout.
function planformArea(root: Object3D): number {
  let area = 0;
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const groups = node.geometry.groups.length ? node.geometry.groups : [{ start: 0, count: indices?.count ?? positions.count, materialIndex: 0 }];
    for (const group of groups) {
      if (!/^archive_(olive|silver|navy|grey)$/.test(materials[group.materialIndex ?? 0].name)) continue;
      for (let at = group.start; at < group.start + group.count; at += 3) {
        const points = [0, 1, 2].map(offset => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(at + offset) : at + offset).applyMatrix4(node.matrixWorld));
        const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
        area += Math.max(0, normal.y) / 2;
      }
    }
  });
  return area;
}

test('exported wing angles, chords and areas preserve the corrected aircraft silhouettes', async () => {
  const angles: Record<string, number[]> = { 'sopwith-camel': [5, 0], 'spad-xiii': [0, 0], 'spitfire-ia': [6], p51d: [5], a6m5: [5.7], mig21pf: [-2], f86a: [3], f16a: [0] };
  for (const [id, expected] of Object.entries(angles)) {
    const scene = await archiveScene(id);
    for (const wing of components(scene, 'main-wing').filter(node => new Box3().setFromObject(node).max.x > 1)) {
      const points = worldVertices(wing), a = wingEdge(points, 0).leading, b = wingEdge(points, 1).leading;
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      assert.ok(Math.abs(angle - expected[wing.userData.wing_level]) < .1, `${id}: measured dihedral ${angle}`);
    }
    if (id === 'f86a' || id === 'f16a') for (const tail of components(scene, 'horizontal-tail').filter(node => new Box3().setFromObject(node).max.x > .5)) {
      const points = worldVertices(tail), a = wingEdge(points, 0).leading, b = wingEdge(points, 1).leading;
      assert.ok(Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI - (id === 'f86a' ? 10 : -10)) < .1, `${id}: measured tail dihedral`);
    }
  }
  for (const [id, expectedArea] of [['f86a', 26.75], ['p51d', 21.9], ['spitfire-ia', 22.48], ['a6m5', 21.3], ['mig21pf', 23], ['mirage2000c', 41]] as const) {
    const scene = await archiveScene(id), entry = NEW_ARCHIVE.find(item => item.id === id)!;
    const area = components(scene, 'main-wing').reduce((sum, wing) => sum + planformArea(wing), 0) * (entry.geometry.length / 6) ** 2;
    assert.ok(Math.abs(area / expectedArea - 1) < .035, `${id}: exported gross planform ${area} m²`);
  }
  for (const [id, expectedSweep, quarterChord] of [['f16a', 40, false], ['f86a', 35.23, true], ['mirage2000c', 58, false], ['mig21pf', 57, false]] as const) {
    const scene = await archiveScene(id);
    const wing = components(scene, 'main-wing').find(node => new Box3().setFromObject(node).max.x > 1)!;
    const points = worldVertices(wing), a = wingEdge(points, .32), b = wingEdge(points, .92);
    const za = a.leading.z + (quarterChord ? (a.trailing.z - a.leading.z) / 4 : 0);
    const zb = b.leading.z + (quarterChord ? (b.trailing.z - b.leading.z) / 4 : 0);
    const angle = Math.atan2(zb - za, b.leading.x - a.leading.x) * 180 / Math.PI;
    assert.ok(Math.abs(angle - expectedSweep) < .2, `${id}: measured sweep ${angle}`);
    if (id === 'mirage2000c') assert.ok(wingEdge(points, 1).trailing.z - wingEdge(points, 1).leading.z > .2, 'Mirage retains a finite tip chord');
  }
  for (const [id, sweep] of [['p51d', 3.59222], ['a6m5', 5], ['f16a', 40]] as const) {
    const scene = await archiveScene(id), wing = components(scene, 'main-wing').find(node => new Box3().setFromObject(node).max.x > 1)!;
    const points = worldVertices(wing), a = wingEdge(points, .32), b = wingEdge(points, .80);
    const angle = Math.atan2(b.leading.z - a.leading.z, b.leading.x - a.leading.x) * 180 / Math.PI;
    assert.ok(Math.abs(angle - sweep) < .2, `${id}: measured leading-edge sweep ${angle}`);
    if (id === 'f16a') {
      assert.ok(Math.abs(a.trailing.z - b.trailing.z) < .001, 'F-16A main trailing edge is unswept');
      const tail = components(scene, 'horizontal-tail').find(node => new Box3().setFromObject(node).max.x > .5)!;
      const ta = wingEdge(worldVertices(tail), .48), tb = wingEdge(worldVertices(tail), .92);
      const tailSweep = Math.atan2(tb.leading.z - ta.leading.z, tb.leading.x - ta.leading.x) * 180 / Math.PI;
      assert.ok(Math.abs(tailSweep - 40) < .2, `F-16A: measured tail leading-edge sweep ${tailSweep}`);
      assert.ok(Math.abs(new Box3().setFromObject(tail).max.x * 2 * 15.09 / 6 - 5.495) < .02, 'F-16A early tail span follows the primary three-view');
      const panelSpan = new Box3().setFromObject(wing).max.x * 2 * 15.09 / 6;
      assert.ok(Math.abs(panelSpan - 9.144) < .01, 'F-16A panels use 30 ft, excluding rails and missiles');
    }
  }
  const fokker = await archiveScene('fokker-dvii');
  for (const wing of components(fokker, 'main-wing')) {
    const edge = wingEdge(worldVertices(wing), 0);
    const chord = (edge.trailing.z - edge.leading.z) * 7 / 6;
    assert.ok(Math.abs(chord - (wing.userData.wing_level ? 1.6 : 1.2)) < .02, `D.VII: measured chord ${chord}`);
  }
  for (const [id, rootChord, tipChord] of [['spitfire-ia', 2.54, 0], ['mig21pf', 5.9736, .46]] as const) {
    const scene = await archiveScene(id), entry = NEW_ARCHIVE.find(item => item.id === id)!;
    const wing = components(scene, 'main-wing').find(node => new Box3().setFromObject(node).max.x > 1)!;
    const points = worldVertices(wing);
    for (const [fraction, expected] of [[0, rootChord], [1, tipChord]]) {
      const edge = wingEdge(points, fraction), chord = (edge.trailing.z - edge.leading.z) * entry.geometry.length / 6;
      assert.ok(Math.abs(chord - expected) < .025, `${id}: chord at ${fraction} measured ${chord}`);
    }
  }
});

test('Camel wing gap and stagger, and Spitfire/Zero tail spans match primary references', async () => {
  const scene = await archiveScene('sopwith-camel'), scale = 5.72 / 6;
  const wings = components(scene, 'main-wing').filter(node => new Box3().setFromObject(node).max.x > 1);
  const lower = wings.find(node => node.userData.wing_level === 0)!;
  const upper = wings.find(node => node.userData.wing_level === 1)!;
  const low = wingEdge(worldVertices(lower), 0).leading, high = wingEdge(worldVertices(upper), 0).leading;
  assert.ok(Math.abs((high.y - low.y) * scale - 1.524) < .01, 'Camel: 5 ft wing gap at centre');
  assert.ok(Math.abs((low.z - high.z) * scale - .4572) < .01, 'Camel: 18 in positive stagger');
  for (const wing of wings) {
    assert.ok(Math.abs(new Box3().setFromObject(wing).max.x * 2 * scale - 8.53) < .01, 'Camel: equal upper/lower spans');
    const edge = wingEdge(worldVertices(wing), .48);
    assert.ok(Math.abs((edge.trailing.z - edge.leading.z) * scale - 1.3716) < .01, 'Camel: 4 ft 6 in chord');
  }
  for (const [id, span] of [['spitfire-ia', 3.2004], ['a6m5', 4.73]] as const) {
    const aircraft = await archiveScene(id), entry = NEW_ARCHIVE.find(item => item.id === id)!;
    const tails = components(aircraft, 'horizontal-tail');
    const bounds = new Box3();
    for (const tail of tails) bounds.union(new Box3().setFromObject(tail));
    const measured = bounds.getSize(new Vector3()).x * entry.geometry.length / 6;
    assert.ok(Math.abs(measured - span) < .03, `${id}: tail span ${measured}`);
  }
});

test('exported tail surfaces and fins retain their individual sweep and longitudinal placement', async () => {
  for (const [id, component, sweep, dihedral] of [
    ['f86a', 'horizontal-tail', 37.6383, 10],
    ['mig21pf', 'horizontal-tail', 57, 0],
    ['rafale-c', 'canard', 49.6, 0],
    ['gripen-c', 'canard', 45, 8],
  ] as const) {
    const scene = await archiveScene(id), entry = NEW_ARCHIVE.find(item => item.id === id)!;
    const tail = components(scene, component).find(node => new Box3().setFromObject(node).max.x > .5)!;
    const points = worldVertices(tail), a = wingEdge(points, .64), b = wingEdge(points, .92);
    const measured = Math.atan2(b.leading.z - a.leading.z, b.leading.x - a.leading.x) * 180 / Math.PI;
    assert.ok(Math.abs(measured - sweep) < .2, `${id}: tail leading-edge sweep ${measured}`);
    const angle = Math.atan2(b.leading.y - a.leading.y, b.leading.x - a.leading.x) * 180 / Math.PI;
    assert.ok(Math.abs(angle - dihedral) < .1, `${id}: tail dihedral ${angle}`);
    if (id === 'f86a') {
      const scale = entry.geometry.length / 6;
      const area = components(scene, component).reduce((sum, node) => sum + planformArea(node), 0) * scale ** 2;
      assert.ok(Math.abs(area - 3.25) < .03, 'F-86A total tail area includes the centre covered by the fin');
      assert.ok(Math.abs(new Box3().setFromObject(tail).max.x * 2 * scale - 3.8862) < .01, 'F-86A tail span');
      const tip = wingEdge(points, 1), root = wingEdge(points, 0);
      const quarter = Math.atan2(tip.leading.z + (tip.trailing.z - tip.leading.z) / 4 - root.leading.z - (root.trailing.z - root.leading.z) / 4, tip.leading.x - root.leading.x) * 180 / Math.PI;
      assert.ok(Math.abs(quarter - (34 + 35 / 60)) < .1, 'F-86A quarter-chord tail sweep uses its own reference');
    }
    if (id === 'rafale-c') {
      const measuredTrailing = Math.atan2(b.trailing.z - a.trailing.z, b.trailing.x - a.trailing.x) * 180 / Math.PI;
      assert.ok(Math.abs(measuredTrailing - 15) < .2, 'Rafale canard trailing edge sweeps aft');
    }
  }
  const f16 = await archiveScene('f16a'), fin = new Box3().setFromObject(components(f16, 'vertical-tail')[0]);
  const body = new Box3().setFromObject(components(f16, 'fuselage')[0]);
  assert.ok(Math.abs(fin.max.z - 3) < .001 && fin.max.z > body.max.z + .15, 'F-16A fin tip is the aftmost airframe point, behind the nozzle');
  const points = worldVertices(components(f16, 'vertical-tail')[0]);
  const top = points.filter(point => Math.abs(point.y - fin.max.y) < .001);
  assert.ok(Math.max(...top.map(point => point.z)) > 2.99 && Math.min(...top.map(point => point.z)) > 2.5, 'F-16A upper fin moves aft with its swept leading and trailing edges');
  const root = points.filter(point => Math.abs(point.y - .197) < .001);
  const leadingSweep = Math.atan2(Math.min(...top.map(point => point.z)) - Math.min(...root.map(point => point.z)), fin.max.y - .197) * 180 / Math.PI;
  assert.ok(Math.abs(leadingSweep - 47.5) < .2, 'F-16A fin leading-edge angle follows the original side view');
  const mig = await archiveScene('mig21pf'), migPoints = worldVertices(components(mig, 'vertical-tail')[0]);
  const migTop = migPoints.filter(point => Math.abs(point.y - 1.25) < .001), migRoot = migPoints.filter(point => Math.abs(point.y - .17) < .001);
  const migSweep = Math.atan2(Math.min(...migTop.map(point => point.z)) - Math.min(...migRoot.map(point => point.z)), 1.25 - .17) * 180 / Math.PI;
  assert.ok(Math.abs(migSweep - 60) < .2, 'MiG-21PF retains the steep fin leading edge');
  const rafale = await archiveScene('rafale-c');
  const panel = components(rafale, 'main-wing').find(node => new Box3().setFromObject(node).max.x > 1)!;
  assert.ok(Math.abs(new Box3().setFromObject(panel).max.x * 2 * 15.3 / 6 - 9.95) < .01, 'Rafale panel span excludes wingtip missiles');
});

test('early Gato deck gun is aft of its fairwater while VII C retains its forward gun', async () => {
  for (const id of ['gato', 'type-viic']) {
    const scene = await archiveScene(id), gun = components(scene, 'deck-gun')[0], sail = components(scene, 'sail')[0];
    assert.ok(gun && sail, id);
    const gunZ = new Box3().setFromObject(gun).getCenter(new Vector3()).z;
    const sailZ = new Box3().setFromObject(sail).getCenter(new Vector3()).z;
    assert.ok(id === 'gato' ? gunZ > sailZ + .5 : gunZ < sailZ - .5, `${id}: deck gun must match the declared early configuration`);
  }
});

test('Rafale fixed probe joins the forward fuselage ahead of the windscreen', async () => {
  const scene = await archiveScene('rafale-c'), probe = components(scene, 'refueling-probe')[0];
  const bounds = new Box3().setFromObject(probe);
  // The common forward airframe in the military three-view has a short,
  // raised starboard probe whose tip remains behind the nose.
  assert.ok(bounds.min.x > 0 && bounds.max.x < .35, 'probe remains on the starboard cheek');
  assert.ok(bounds.max.z < -1.8 && bounds.min.z < -2.4 && bounds.min.z > -2.6, 'probe begins ahead of the windscreen and stops short of the nose');
  const body = components(scene, 'fuselage')[0];
  body.traverse(node => {
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
  });
  const joined = worldVertices(probe).some(point => new Set(new Raycaster(point, new Vector3(1, 0, 0), .00001, 1).intersectObject(body).map(hit => hit.distance.toFixed(5))).size % 2 === 1);
  assert.ok(joined, 'an actual probe mount vertex enters the fuselage volume');
});

test('intake lips follow their actual duct sections without a second circular outline', async () => {
  for (const id of ['f16a', 'mirage2000c', 'rafale-c', 'gripen-c']) {
    const scene = await archiveScene(id), entry = NEW_ARCHIVE.find(item => item.id === id)!;
    assert.equal(entry.category, 'aircraft');
    if (entry.category !== 'aircraft') continue;
    const ducts = entry.geometry.profile.ducts!;
    for (const [index, intake] of components(scene, 'intake').entries()) {
      const points = worldVertices(intake), front = Math.min(...points.map(point => point.z));
      const rim = points.filter(point => point.z < front + .03);
      const [, rx, rz] = ducts[index].at(-1)!;
      const bounds = new Box3().setFromPoints(rim).getSize(new Vector3());
      assert.ok(Math.abs(bounds.x - rx * 2) < .003 && Math.abs(bounds.y - rz * 2) < .003, `${id}: lip must meet the duct in both axes`);
    }
  }
});

test('Spitfire coolers remain attached beneath the raised wings and retain unequal lengths', async () => {
  const scene = await archiveScene('spitfire-ia'), wings = components(scene, 'main-wing');
  for (const wing of wings) wing.traverse(node => {
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
  });
  const radiator = components(scene, 'wing-radiator')[0], oil = components(scene, 'oil-cooler')[0];
  assert.ok(new Box3().setFromObject(radiator).getSize(new Vector3()).z > new Box3().setFromObject(oil).getSize(new Vector3()).z * 1.7);
  for (const cooler of [radiator, oil]) {
    const attached = worldVertices(cooler).some(point => {
      const hits = new Raycaster(point, new Vector3(0, 1, 0), .00001, 1).intersectObjects(wings);
      return new Set(hits.map(hit => hit.distance.toFixed(5))).size % 2 === 1;
    });
    assert.ok(attached, 'an actual cooler vertex enters the wing volume');
  }
});

test('old submarine cruise decks cover the hull crown across their longitudinal stations', async () => {
  for (const id of ['u9', 'type-viic', 'gato', 'nautilus', 'oberon']) {
    const scene = await archiveScene(id), hull = components(scene, 'submarine-hull')[0], deck = components(scene, 'deck-casing')[0];
    assert.ok(hull && deck, id);
    for (const part of [hull, deck]) part.traverse(node => {
      if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
    });
    const width = new Box3().setFromObject(hull).getSize(new Vector3()).x;
    for (let forward = -3.5; forward <= 3.5; forward += .25) for (const fraction of [-.15, 0, .15]) {
      const ray = new Raycaster(new Vector3(width * fraction, 4, -forward), new Vector3(0, -1, 0));
      const deckHit = ray.intersectObject(deck)[0], hullHit = ray.intersectObject(hull)[0];
      assert.ok(deckHit && hullHit, `${id}: deck and hull sampled at ${forward}`);
      assert.ok(deckHit.point.y > hullHit.point.y + .002, `${id}: hull must not emerge through the deck at ${forward}`);
    }
  }
  const soryu = await archiveScene('soryu-early'), hull = components(soryu, 'submarine-hull')[0];
  const size = new Box3().setFromObject(hull).getSize(new Vector3());
  assert.ok(Math.abs(size.y / size.x - 10.3 / 9.1) < .005, 'Soryu outer hull retains its published depth/beam ratio');
});

test('century archive identities, references and era filters are consistent', () => {
  assert.equal(new Set(ARCHIVE.map(entry => entry.id)).size, ARCHIVE.length);
  assert.equal(new Set(ARCHIVE.map(entry => entry.modelId)).size, ARCHIVE.length);
  assert.equal(NEW_ARCHIVE.length, 20);
  for (const entry of ARCHIVE) {
    assert.ok(ARCHIVE_COUNTRIES.some(country => country.id === entry.country), entry.id);
    assert.equal(new URL(entry.source).protocol, 'https:');
    assert.ok(entry.feature && entry.note, entry.id);
  }
  for (const era of ['ww1', 'interwar-ww2', 'cold-war', 'modern']) {
    assert.ok(filterArchive('all', 'aircraft', era).length, `${era}: aircraft`);
    assert.ok(filterArchive('all', 'submarine', era).length, `${era}: submarine`);
  }
  assert.deepEqual([1918, 1919, 1945, 1946, 1991, 1992].map(archiveEra), ['ww1', 'interwar-ww2', 'interwar-ww2', 'cold-war', 'cold-war', 'modern']);
  assert.equal(filterArchive('se', 'submarine').length, 0);
});

const revision = 'a'.repeat(64);
const member = (reviewer: string, score = 9.8, rev = revision): CouncilMember => ({ reviewer, model: 'gpt-6.1-sol', taskId: `task-${reviewer}`, results: { example: { revision: rev, score, findings: [] } } });
const ledger = (...members: CouncilMember[]): ReviewLedger => ({ version: 1, rounds: [{ round: 1, date: '2026-11-15', members }] });

test('approval requires two independent Sol scores >=9.8 on one exact revision and round', () => {
  assert.equal(modelReviewStatus('example', revision, ledger()).state, 'pending');
  assert.equal(modelReviewStatus('example', revision, ledger(member('a'))).state, 'pending');
  assert.equal(modelReviewStatus('example', revision, ledger(member('a'), member('a'))).state, 'pending');
  assert.equal(modelReviewStatus('example', revision, ledger(member('a'), { ...member('b'), taskId: 'task-a' })).state, 'pending');
  assert.equal(modelReviewStatus('example', revision, ledger(member('a'), member('b', 9.79))).state, 'changes-required');
  assert.equal(modelReviewStatus('example', revision, ledger(member('a'), member('b'))).state, 'approved');
  assert.equal(modelReviewStatus('example', revision, ledger(member('a'), member('b', 10))).state, 'approved');
  assert.equal(modelReviewStatus('example', revision, ledger(member('a'), member('b', 10, 'b'.repeat(64)))).state, 'stale');
  assert.equal(modelReviewStatus('example', undefined, ledger(member('a'), member('b'))).state, 'pending');
  const split: ReviewLedger = { version: 1, rounds: [ledger(member('a')).rounds[0], { round: 2, date: '2026-11-15', members: [member('b')] }] };
  assert.equal(modelReviewStatus('example', revision, split).state, 'pending');
  const regression: ReviewLedger = { version: 1, rounds: [ledger(member('a'), member('b')).rounds[0], { round: 2, date: '2026-11-15', members: [member('c', 9.5), member('d')] }] };
  assert.equal(modelReviewStatus('example', revision, regression).state, 'changes-required');
  for (const score of [NaN, Infinity, -1, 10.01]) assert.equal(isReviewLedger(ledger(member('a', score))), false);
  assert.equal(isReviewLedger(ledger({ ...member('a'), model: 'other-model' })), false);
});

test('a real no-score result stays local to its model and supersedes older approvals', () => {
  const unscored = member('a');
  unscored.results = { example: { revision, score: null, findings: ['The artifact could not be inspected.'] } };
  const paired = ledger(unscored, member('b'));
  assert.ok(isReviewLedger(paired));
  const status = modelReviewStatus('example', revision, paired);
  assert.equal(status.state, 'pending');
  assert.equal(status.unscored, 1);
  assert.match(reviewLabel(status), /未评分/);
  const rounds: ReviewLedger = { version: 1, rounds: [
    ledger(member('old-a'), member('old-b')).rounds[0],
    { round: 2, date: '2026-11-15', members: [unscored, member('b')] },
  ] };
  assert.equal(modelReviewStatus('example', revision, rounds).state, 'pending');
  const withOther: ReviewLedger = { version: 1, rounds: [{ round: 1, date: '2026-11-15', members: [
    { ...unscored, results: { ...unscored.results, other: { revision, score: 9.9, findings: [] } } },
    { ...member('b'), results: { ...member('b').results, other: { revision, score: 9.8, findings: [] } } },
  ] }] };
  assert.equal(modelReviewStatus('other', revision, withOther).state, 'approved');
  assert.equal(modelReviewStatus('example', revision, withOther).state, 'pending');
  assert.equal(isReviewLedger(ledger({ ...unscored, results: { example: { revision, score: null, findings: [] } } })), false);
});

test('the editable source, Blender input, exported GLBs and recorded review revisions match', async () => {
  const input = JSON.parse(await readFile(new URL('../assets/blender/century-archive.json', import.meta.url), 'utf8'));
  assert.deepEqual(input.entries, NEW_ARCHIVE);
  const recorded = JSON.parse(await readFile(new URL('../game/archive-revisions.json', import.meta.url), 'utf8'));
  assert.deepEqual(recorded, await currentRevisions());
  const blend = await readFile(new URL('../assets/blender/century-archive.blend', import.meta.url));
  const source = blend.readUInt32LE(0) === 0xfd2fb528 ? zstdDecompressSync(blend) : blend;
  assert.equal(source.subarray(0, 7).toString(), 'BLENDER');
});

test('every new model exports distinct geometry and physical identifying structures', async () => {
  const hashes = new Set<string>();
  let bytes = 0;
  for (const entry of NEW_ARCHIVE) {
    const buffer = await readFile(new URL(`../game/public/assets/models/${entry.modelId}.glb`, import.meta.url));
    bytes += buffer.length;
    assert.ok(buffer.length < 400_000, entry.id);
    const jsonLength = buffer.readUInt32LE(12);
    const binary = buffer.subarray(20 + jsonLength + 8);
    const hash = createHash('sha256').update(binary).digest('hex');
    assert.ok(!hashes.has(hash), `${entry.id}: geometry must differ, independently of names and materials`);
    hashes.add(hash);
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer, '');
    scene.updateMatrixWorld(true);
    const nodes: import('three').Object3D[] = [];
    scene.traverse(node => nodes.push(node));
    const identity = nodes.find(node => node.userData.archive_id === entry.id);
    assert.ok(identity, entry.id);
    assert.equal(identity.userData.archive_year, entry.year);
    assert.equal(identity.userData.archive_category, entry.category);
    const bounds = new Box3().setFromObject(scene), size = bounds.getSize(new Vector3());
    assert.ok([size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0));
    let upwardFaces = 0;
    for (const node of nodes) if (node instanceof Mesh) {
      const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
      const a = new Vector3(), b = new Vector3(), c = new Vector3();
      for (let at = 0; at < (indices?.count ?? positions.count); at += 3) {
        a.fromBufferAttribute(positions, indices ? indices.getX(at) : at).applyMatrix4(node.matrixWorld);
        b.fromBufferAttribute(positions, indices ? indices.getX(at + 1) : at + 1).applyMatrix4(node.matrixWorld);
        c.fromBufferAttribute(positions, indices ? indices.getX(at + 2) : at + 2).applyMatrix4(node.matrixWorld);
        if (b.sub(a).cross(c.sub(a)).y > .0001) upwardFaces++;
      }
    }
    assert.ok(upwardFaces > 20, `${entry.id}: real upward-facing surfaces`);
    if (entry.category === 'aircraft') {
      assert.equal(nodes.filter(node => node.name.startsWith('propeller_')).length, entry.geometry.propellerBlades ? 1 : 0, entry.id);
      assert.equal(nodes.filter(node => node.userData['archive_component'] === 'main-wing').length, entry.geometry.wingLevels.length * 2, entry.id);
      const aspect = size.x / size.z;
      assert.ok(Math.abs(aspect - entry.geometry.span / entry.geometry.length) < .12, `${entry.id}: planform proportions`);
    } else {
      assert.equal(nodes.filter(node => node.userData['archive_component'] === 'propulsor').length, entry.geometry.shafts, entry.id);
      assert.equal(nodes.filter(node => node.userData['archive_component'] === 'deck-gun').length, entry.geometry.deckGun ? 1 : 0, entry.id);
      const fins = nodes.filter(node => node.userData['archive_component'] === 'stern-rudder');
      const expected = { u9: 3, 'type-viic': 4, gato: 3, nautilus: 3, oberon: 3, 'virginia-block-i': 4, 'type-212a': 4, 'soryu-early': 4 }[entry.id];
      assert.equal(fins.length, expected, entry.id);
      const finAxis = new Vector3(1, 0, 0).transformDirection(fins[0].matrixWorld);
      if (entry.geometry.rudder === 'x') assert.ok(Math.abs(finAxis.y) > .65 && Math.abs(finAxis.x) > .65, `${entry.id}: real X stern geometry`);
    }
  }
  assert.ok(bytes < 4_000_000, 'first archive batch remains a lazy, bounded download');
});

test('exported main wings have a continuous centre section and physically enter the fuselage', async () => {
  for (const entry of NEW_ARCHIVE.filter(item => item.category === 'aircraft')) {
    const buffer = await readFile(new URL(`../game/public/assets/models/${entry.modelId}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer, ''); scene.updateMatrixWorld(true);
    const wings: import('three').Object3D[] = [], bodies: import('three').Object3D[] = [];
    scene.traverse(node => {
      if (node.userData.archive_component === 'main-wing') wings.push(node);
      if (node.userData.archive_component === 'fuselage') node.traverse(part => {
        if (!(part instanceof Mesh)) return;
        for (const material of Array.isArray(part.material) ? part.material : [part.material]) material.side = DoubleSide;
        bodies.push(part);
      });
    });
    for (const wing of wings) {
      const bounds = new Box3().setFromObject(wing);
      assert.ok(bounds.min.x < .001 && bounds.max.x > -.001, `${entry.id}: centre wing must reach X=0`);
      if (wing.userData.wing_level !== 0) continue;
      let inside = false;
      wing.traverse(part => {
        if (!(part instanceof Mesh) || inside) return;
        const positions = part.geometry.getAttribute('position'), point = new Vector3();
        for (let index = 0; index < positions.count && !inside; index++) {
          point.fromBufferAttribute(positions, index).applyMatrix4(part.matrixWorld);
          if (Math.abs(point.x) > .0001) continue;
          const hits = new Raycaster(point, new Vector3(1, 0, 0), .00001, 2).intersectObjects(bodies, false);
          const distances = [...new Set(hits.map(hit => hit.distance.toFixed(5)))];
          if (distances.length % 2 === 1) inside = true;
        }
      });
      assert.ok(inside, `${entry.id}: an actual lower-wing root vertex must lie inside the fuselage`);
    }
  }
});

test('modern submarine bows are round and sail-mounted planes overlap the actual sail', async () => {
  for (const id of ['virginia-block-i', 'type-212a', 'soryu-early']) {
    const entry = NEW_ARCHIVE.find(item => item.id === id)!;
    const buffer = await readFile(new URL(`../game/public/assets/models/${entry.modelId}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer, ''); scene.updateMatrixWorld(true);
    let hull: import('three').Object3D | undefined, sail: import('three').Object3D | undefined;
    const planes: import('three').Object3D[] = [];
    scene.traverse(node => {
      if (node.userData.archive_component === 'submarine-hull') hull = node;
      if (node.userData.archive_component === 'sail') sail = node;
      if (node.userData.archive_component === 'diving-plane') planes.push(node);
    });
    assert.ok(hull && sail, id);
    const hullBounds = new Box3().setFromObject(hull), bowZ = hullBounds.min.z + .25;
    let sliceWidth = 0;
    hull.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
      const a = new Vector3(), b = new Vector3();
      for (let index = 0; index < (indices?.count ?? positions.count); index += 3) for (let edge = 0; edge < 3; edge++) {
        const at = index + edge, next = index + (edge + 1) % 3;
        a.fromBufferAttribute(positions, indices ? indices.getX(at) : at).applyMatrix4(node.matrixWorld);
        b.fromBufferAttribute(positions, indices ? indices.getX(next) : next).applyMatrix4(node.matrixWorld);
        if (a.z === b.z || bowZ < Math.min(a.z, b.z) || bowZ > Math.max(a.z, b.z)) continue;
        const x = a.x + (b.x - a.x) * (bowZ - a.z) / (b.z - a.z);
        sliceWidth = Math.max(sliceWidth, Math.abs(x));
      }
    });
    assert.ok(sliceWidth / hullBounds.max.x > .65, `${id}: bow must remain broad near the stem, not taper into a long cone`);
    if (id === 'virginia-block-i') continue;
    const tower = new Box3().setFromObject(sail);
    for (const plane of planes) {
      const bounds = new Box3().setFromObject(plane);
      assert.equal(plane.userData.plane_mount, 'sail', id);
      assert.ok(bounds.min.x < tower.max.x && bounds.max.x > tower.min.x && bounds.min.z < tower.max.z && bounds.max.z > tower.min.z && bounds.min.y > tower.min.y && bounds.max.y < tower.max.y, `${id}: sail planes must attach to the tower`);
    }
  }
});
