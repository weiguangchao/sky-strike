import { required } from './support.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, DoubleSide, Mesh, Raycaster, Triangle, Vector3 } from 'three';
import { ARCHIVE, ARCHIVE_COUNTRIES, HANDBOOK_ARCHIVE, NEW_ARCHIVE, archiveEra, filterArchive } from '../game/historical-archive.ts';
import { isReviewLedger, modelReviewStatus as parsedModelReviewStatus, reviewLabel, parseReviewLedger, isModelRevision, grokReviewGate } from '../game/model-review.ts';
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
  return { leading: required(section[0]), trailing: required(section.at(-1)) };
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
        const normal = required(points[1]).clone().sub(required(points[0])).cross(required(points[2]).clone().sub(required(points[0])));
        area += Math.max(0, normal.y) / 2;
      }
    }
  });
  return area;
}

test('served transports preserve dimensions, wing areas and real structural support', async () => {
  for (const spec of [
    { id: 'c46a', length: 23.2664, span: 32.9184, area: 126.34, engines: 2 },
    { id: 'c47a', length: 19.431, span: 29.1084, area: 91.69, engines: 2 },
    { id: 'c54g', length: 28.4734, span: 35.814, area: 135.91, engines: 4 },
    { id: 'c119c', length: 26.3652, span: 33.3248, area: 134.4, engines: 2 },
  ]) {
    const scene = await archiveScene(spec.id), scale = spec.length / 6;
    scene.traverse(node => {
      assert.ok(!/wing_gun|synchronized_machine_gun|jet_nozzle/i.test(node.name), 'selected transports are unarmed piston aircraft');
      if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
    });
    const body = required(components(scene, 'fuselage')[0]), wings = components(scene, 'main-wing'), engines = components(scene, 'radial-engine');
    const wingBounds = new Box3();
    for (const wing of wings) wingBounds.union(new Box3().setFromObject(wing));
    assert.equal(wings.length, 2);
    assert.equal(engines.length, spec.engines);
    assert.ok(Math.abs(new Box3().setFromObject(scene).getSize(new Vector3()).z * scale - spec.length) < .01);
    assert.ok(Math.abs(wingBounds.getSize(new Vector3()).x * scale - spec.span) < .01);
    assert.ok(Math.abs(wings.reduce((sum, wing) => sum + planformArea(wing), 0) * scale * scale / spec.area - 1) < .02, `${spec.id}: exported wing area`);
    const inside = (point: Vector3, solids: Object3D[]) => [new Vector3(0, 1, 0), new Vector3(0, -1, 0)].every(direction =>
      new Set(new Raycaster(point, direction, .00001, 10).intersectObjects(solids, true).map(hit => hit.distance.toFixed(5))).size % 2 === 1);
    for (const wing of wings) assert.ok(worldVertices(wing).some(point => inside(point, [body])), 'central wing enters fuselage');
    for (const engine of engines) assert.ok(worldVertices(engine).some(point => inside(point, wings)), 'nacelle enters real wing');
    const propellers = components(scene, 'propeller');
    assert.equal(propellers.length, spec.engines, 'one actual propeller per wing engine');
    for (const propeller of propellers) {
      const centre = new Box3().setFromObject(propeller).getCenter(new Vector3());
      assert.ok(Math.abs(centre.x) > .7, 'no fighter-style nose propeller');
      const engine = required(engines.find(engine => Math.abs(new Box3().setFromObject(engine).getCenter(new Vector3()).x - centre.x) < .1));
      assert.ok(worldVertices(propeller).some(point => inside(point, [engine])), 'propeller hub enters its engine shaft');
    }
    const booms = components(scene, 'tail-boom');
    if (spec.id === 'c119c') {
      assert.equal(booms.length, 2);
      assert.equal(components(scene, 'vertical-tail').length, 2);
      for (const boom of booms) assert.ok(worldVertices(boom).some(point => inside(point, [...wings, ...engines])), 'tail boom enters wing or engine housing');
    } else assert.equal(booms.length, 0);
    for (const component of ['horizontal-tail', 'vertical-tail']) for (const surface of components(scene, component)) assert.ok(worldVertices(surface).some(point => inside(point, booms.length ? booms : [body])), `${component} enters its supporting structure`);
    if (spec.id === 'c54g' || spec.id === 'c119c') assert.equal(components(scene, 'landing-wheel').length, 0, 'retracted tricycle aircraft must not inherit a tailwheel');
  }
});

test('transport cockpit and cargo glazing follow the actual curved fuselage', async () => {
  for (const id of ['c46a', 'c47a', 'c54g', 'c119c']) {
    const scene = await archiveScene(id), body = required(components(scene, 'fuselage')[0]);
    body.traverse(node => { if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide; });
    const glazing = required(components(scene, 'cargo-glazing')[0]);
    const glass: Vector3[] = [];
    glazing.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
      const groups = node.geometry.groups.length ? node.geometry.groups : [{ start: 0, count: indices?.count ?? positions.count, materialIndex: 0 }];
      for (const group of groups) {
        if (required(materials[group.materialIndex ?? 0]).name.replace(/\.\d+$/, '') !== 'archive_glazing') continue;
        for (let at = group.start; at < group.start + group.count; at += 3) {
          const point = (offset: number) => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(at + offset) : at + offset).applyMatrix4(node.matrixWorld);
          const triangle = new Triangle(point(0), point(1), point(2));
          glass.push(triangle.a, triangle.b, triangle.c, triangle.getMidpoint(new Vector3()));
        }
      }
    });
    assert.ok(glass.length > 300, 'curved glazing is subdivided into exported faces');
    for (const point of glass) {
      const directions = [new Vector3(0, -1, 0), new Vector3(-Math.sign(point.x), 0, 0)];
      const distance = Math.min(...directions.flatMap(direction => new Raycaster(point, direction, .00001, 2).intersectObject(body, true).map(hit => hit.distance)));
      assert.ok(distance < .006, `${id}: glazing must sit on the body, distance ${distance}, point ${point.toArray()}`);
    }
    assert.ok(new Box3().setFromObject(required(components(scene, 'cargo-door')[0])).getSize(new Vector3()).y > .4, 'actual tall port cargo doorway');
  }
});

test('CG-4A exports an unpowered cargo glider with supported high wings and landing gear', async () => {
  const scene = await archiveScene('cg4a');
  scene.traverse(node => {
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
    assert.ok(!/engine|nozzle|exhaust|machine_gun|wing_gun|spinner/i.test(node.name), `cargo glider must not contain ${node.name}`);
  });
  assert.equal(components(scene, 'propeller').length, 0);
  const body = required(components(scene, 'fuselage')[0]), wings = components(scene, 'main-wing');
  const fuselage = new Box3().setFromObject(body), wingBounds = new Box3();
  for (const wing of wings) wingBounds.union(new Box3().setFromObject(wing));
  assert.equal(wings.length, 2);
  const scale = 14.732 / 6;
  assert.ok(Math.abs(wingBounds.getSize(new Vector3()).x * scale - 25.5016) < .01, '83 ft 8 in exported wingspan');
  assert.ok(Math.abs(fuselage.getSize(new Vector3()).z * scale - 14.732) < .01, '48 ft 4 in museum fuselage length');
  const inside = (point: Vector3, solids: Object3D[]) => [new Vector3(0, 1, 0), new Vector3(0, -1, 0)].every(direction =>
    new Set(new Raycaster(point, direction, .00001, 10).intersectObjects(solids, true).map(hit => hit.distance.toFixed(5))).size % 2 === 1);
  const braces = components(scene, 'lift-strut');
  assert.equal(braces.length, 4);
  for (const brace of braces) {
    const points = worldVertices(brace);
    assert.ok(points.some(point => inside(point, [body])), 'lift-strut lower end enters the cargo fuselage');
    assert.ok(points.some(point => inside(point, wings)), 'lift-strut upper end enters the high wing');
  }
  const gear = components(scene, 'landing-wheel');
  assert.equal(gear.length, 3);
  for (const wheel of gear) {
    assert.ok(worldVertices(wheel).some(point => inside(point, [body])), 'landing-gear support enters the fuselage');
    const bounds = new Box3().setFromObject(wheel), centre = bounds.getCenter(new Vector3());
    const underside = required(new Raycaster(new Vector3(0, -2, centre.z), new Vector3(0, 1, 0)).intersectObject(body, true)[0]).point.y;
    assert.ok(bounds.min.y < underside, 'wheel extends below the local fuselage underside');
  }
  const glazing = required(components(scene, 'cargo-glazing')[0]);
  const skids = components(scene, 'landing-skid');
  assert.equal(skids.length, 2);
  for (const skid of skids) {
    assert.ok(worldVertices(skid).some(point => inside(point, [body])), 'skid support enters the real fuselage volume');
    const probe = new Box3().setFromObject(skid).getCenter(new Vector3());
    const underside = required(new Raycaster(new Vector3(probe.x, -2, probe.z), new Vector3(0, 1, 0)).intersectObject(body, true)[0]).point.y;
    assert.ok(new Box3().setFromObject(skid).min.y < underside - .025, 'landing skid projects below the actual keel');
  }
  assert.ok(worldVertices(glazing).length > 40, 'cockpit and cargo glazing contain real exported surfaces');
  assert.ok(new Box3().setFromObject(required(components(scene, 'cargo-door')[0])).getSize(new Vector3()).y > .5);
  assert.ok(new Box3().setFromObject(required(components(scene, 'cargo-nose')[0])).getSize(new Vector3()).x > .5);
});

test('CG-4A underside paint faces down and both fuselage sides keep symmetric olive paint', async () => {
  const body = required(components(await archiveScene('cg4a'), 'fuselage')[0]);
  const sideAreas: [number, number] = [0, 0];
  let undersideArea = 0;
  body.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const groups = node.geometry.groups.length ? node.geometry.groups : [{ start: 0, count: indices?.count ?? positions.count, materialIndex: 0 }];
    for (const group of groups) {
      const name = required(materials[group.materialIndex ?? 0]).name.replace(/\.\d+$/, '');
      for (let at = group.start; at < group.start + group.count; at += 3) {
        const point = (offset: number) => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(at + offset) : at + offset).applyMatrix4(node.matrixWorld);
        const triangle = new Triangle(point(0), point(1), point(2)), normal = triangle.getNormal(new Vector3());
        if (name === 'archive_underside' && triangle.getArea() > .000001) {
          assert.ok(normal.y < -.5, `grey underside appears on a side or nose face: ${normal.toArray()}`);
          undersideArea += triangle.getArea();
        }
        if (Math.abs(normal.x) > .8) {
          assert.equal(name, 'archive_olive', 'both vertical cargo-body sides use olive paint');
          const side = normal.x > 0 ? 1 : 0;
          sideAreas[side] += triangle.getArea();
        }
      }
    }
  });
  assert.ok(undersideArea > 1, 'real downward-facing grey paint remains');
  assert.ok(Math.abs(required(sideAreas[0]) - required(sideAreas[1])) < .00001, 'port and starboard paint areas are symmetric');
});

test('exported wing angles, chords and areas preserve the corrected aircraft silhouettes', async () => {
  const angles: Record<string, number[]> = { 'sopwith-camel': [5, 0], 'spad-xiii': [0, 0], 'spitfire-ia': [6], p51d: [5], a6m5: [5.7], mig21pf: [-2], f86a: [3], f16a: [0] };
  for (const [id, expected] of Object.entries(angles)) {
    const scene = await archiveScene(id);
    for (const wing of components(scene, 'main-wing').filter(node => new Box3().setFromObject(node).max.x > 1)) {
      const points = worldVertices(wing), a = wingEdge(points, 0).leading, b = wingEdge(points, 1).leading;
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      assert.ok(Math.abs(angle - required(expected[wing.userData.wing_level])) < .1, `${id}: measured dihedral ${angle}`);
    }
    if (id === 'f86a' || id === 'f16a') for (const tail of components(scene, 'horizontal-tail').filter(node => new Box3().setFromObject(node).max.x > .5)) {
      const points = worldVertices(tail), a = wingEdge(points, 0).leading, b = wingEdge(points, 1).leading;
      assert.ok(Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI - (id === 'f86a' ? 10 : -10)) < .1, `${id}: measured tail dihedral`);
    }
  }
  for (const [id, expectedArea] of [['f86a', 26.75], ['p51d', 21.9], ['spitfire-ia', 22.48], ['a6m5', 21.3], ['mig21pf', 23], ['mirage2000c', 41]] as const) {
    const scene = await archiveScene(id), entry = required(NEW_ARCHIVE.find(item => item.id === id));
    const area = components(scene, 'main-wing').reduce((sum, wing) => sum + planformArea(wing), 0) * (entry.geometry.length / 6) ** 2;
    assert.ok(Math.abs(area / expectedArea - 1) < .035, `${id}: exported gross planform ${area} m²`);
  }
  for (const [id, expectedSweep, quarterChord] of [['f16a', 40, false], ['f86a', 35.23, true], ['mirage2000c', 58, false], ['mig21pf', 57, false]] as const) {
    const scene = await archiveScene(id);
    const wing = required(components(scene, 'main-wing').find(node => new Box3().setFromObject(node).max.x > 1));
    const points = worldVertices(wing), a = wingEdge(points, .32), b = wingEdge(points, .92);
    const za = a.leading.z + (quarterChord ? (a.trailing.z - a.leading.z) / 4 : 0);
    const zb = b.leading.z + (quarterChord ? (b.trailing.z - b.leading.z) / 4 : 0);
    const angle = Math.atan2(zb - za, b.leading.x - a.leading.x) * 180 / Math.PI;
    assert.ok(Math.abs(angle - expectedSweep) < .2, `${id}: measured sweep ${angle}`);
    if (id === 'mirage2000c') assert.ok(wingEdge(points, 1).trailing.z - wingEdge(points, 1).leading.z > .2, 'Mirage retains a finite tip chord');
  }
  for (const [id, sweep] of [['p51d', 3.59222], ['a6m5', 5], ['f16a', 40]] as const) {
    const scene = await archiveScene(id), wing = required(components(scene, 'main-wing').find(node => new Box3().setFromObject(node).max.x > 1));
    const points = worldVertices(wing), a = wingEdge(points, .32), b = wingEdge(points, .80);
    const angle = Math.atan2(b.leading.z - a.leading.z, b.leading.x - a.leading.x) * 180 / Math.PI;
    assert.ok(Math.abs(angle - sweep) < .2, `${id}: measured leading-edge sweep ${angle}`);
    if (id === 'f16a') {
      assert.ok(Math.abs(a.trailing.z - b.trailing.z) < .001, 'F-16A main trailing edge is unswept');
      const tail = required(components(scene, 'horizontal-tail').find(node => new Box3().setFromObject(node).max.x > .5));
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
    const scene = await archiveScene(id), entry = required(NEW_ARCHIVE.find(item => item.id === id));
    const wing = required(components(scene, 'main-wing').find(node => new Box3().setFromObject(node).max.x > 1));
    const points = worldVertices(wing);
    for (const [fraction, expected] of [[0, rootChord], [1, tipChord]] as const) {
      const edge = wingEdge(points, fraction), chord = (edge.trailing.z - edge.leading.z) * entry.geometry.length / 6;
      assert.ok(Math.abs(chord - expected) < .025, `${id}: chord at ${fraction} measured ${chord}`);
    }
  }
});

test('Camel wing gap and stagger, and Spitfire/Zero tail spans match primary references', async () => {
  const scene = await archiveScene('sopwith-camel'), scale = 5.72 / 6;
  const wings = components(scene, 'main-wing').filter(node => new Box3().setFromObject(node).max.x > 1);
  const lower = required(wings.find(node => node.userData.wing_level === 0));
  const upper = required(wings.find(node => node.userData.wing_level === 1));
  const low = wingEdge(worldVertices(lower), 0).leading, high = wingEdge(worldVertices(upper), 0).leading;
  assert.ok(Math.abs((high.y - low.y) * scale - 1.524) < .01, 'Camel: 5 ft wing gap at centre');
  assert.ok(Math.abs((low.z - high.z) * scale - .4572) < .01, 'Camel: 18 in positive stagger');
  for (const wing of wings) {
    assert.ok(Math.abs(new Box3().setFromObject(wing).max.x * 2 * scale - 8.53) < .01, 'Camel: equal upper/lower spans');
    const edge = wingEdge(worldVertices(wing), .48);
    assert.ok(Math.abs((edge.trailing.z - edge.leading.z) * scale - 1.3716) < .01, 'Camel: 4 ft 6 in chord');
  }
  for (const [id, span] of [['spitfire-ia', 3.2004], ['a6m5', 4.73]] as const) {
    const aircraft = await archiveScene(id), entry = required(NEW_ARCHIVE.find(item => item.id === id));
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
  ] as const) {
    const scene = await archiveScene(id), entry = required(NEW_ARCHIVE.find(item => item.id === id));
    const tail = required(components(scene, component).find(node => new Box3().setFromObject(node).max.x > .5));
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
  const f16 = await archiveScene('f16a'), fin = new Box3().setFromObject(required(components(f16, 'vertical-tail')[0]));
  const body = new Box3().setFromObject(required(components(f16, 'fuselage')[0]));
  assert.ok(Math.abs(fin.max.z - 3) < .001 && fin.max.z > body.max.z + .15, 'F-16A fin tip is the aftmost airframe point, behind the nozzle');
  const points = worldVertices(required(components(f16, 'vertical-tail')[0]));
  const top = points.filter(point => Math.abs(point.y - fin.max.y) < .001);
  assert.ok(Math.max(...top.map(point => point.z)) > 2.99 && Math.min(...top.map(point => point.z)) > 2.5, 'F-16A upper fin moves aft with its swept leading and trailing edges');
  const root = points.filter(point => Math.abs(point.y - .197) < .001);
  const leadingSweep = Math.atan2(Math.min(...top.map(point => point.z)) - Math.min(...root.map(point => point.z)), fin.max.y - .197) * 180 / Math.PI;
  assert.ok(Math.abs(leadingSweep - 47.5) < .2, 'F-16A fin leading-edge angle follows the original side view');
  const mig = await archiveScene('mig21pf'), migPoints = worldVertices(required(components(mig, 'vertical-tail')[0]));
  const migTop = migPoints.filter(point => Math.abs(point.y - 1.25) < .001), migRoot = migPoints.filter(point => Math.abs(point.y - .17) < .001);
  const migSweep = Math.atan2(Math.min(...migTop.map(point => point.z)) - Math.min(...migRoot.map(point => point.z)), 1.25 - .17) * 180 / Math.PI;
  assert.ok(Math.abs(migSweep - 60) < .2, 'MiG-21PF retains the steep fin leading edge');
  const rafale = await archiveScene('rafale-c');
  const panel = required(components(rafale, 'main-wing').find(node => new Box3().setFromObject(node).max.x > 1));
  assert.ok(Math.abs(new Box3().setFromObject(panel).max.x * 2 * 15.3 / 6 - 9.95) < .01, 'Rafale panel span excludes wingtip missiles');
});

test('vertical fins have a forward maximum thickness and a thin trailing edge in real exported sections', async () => {
  for (const id of ['spitfire-ia', 'f86a', 'f16a', 'rafale-c']) {
    const fin = required(components(await archiveScene(id), 'vertical-tail')[0]);
    const bounds = new Box3().setFromObject(fin);
    const height = (bounds.min.y + bounds.max.y) / 2;
    const section = worldVertices(fin).filter(point => Math.abs(point.y - height) < .0001);
    assert.ok(section.length >= 14, `${id}: an actual chordwise foil section`);
    const leading = Math.min(...section.map(point => point.z)), trailing = Math.max(...section.map(point => point.z));
    const chord = trailing - leading;
    const maximum = Math.max(...section.map(point => Math.abs(point.x)));
    assert.ok(maximum > .001 && chord > .05, `${id}: finite foil thickness and chord`);
    const peak = required(section.find(point => Math.abs(point.x) > maximum - .00001));
    const peakFraction = (peak.z - leading) / chord;
    assert.ok(peakFraction > .20 && peakFraction < .40, `${id}: maximum thickness belongs ahead of mid-chord`);
    const rear = section.filter(point => (point.z - leading) / chord > .85);
    assert.ok(rear.length >= 3 && rear.every(point => Math.abs(point.x) < maximum * .30), `${id}: the foil narrows toward its trailing edge`);
  }
});

test('early Gato deck gun is aft of its fairwater while VII C retains its forward gun', async () => {
  for (const id of ['gato', 'type-viic']) {
    const scene = await archiveScene(id), gun = required(components(scene, 'deck-gun')[0]), sail = required(components(scene, 'sail')[0]);
    assert.ok(gun && sail, id);
    const gunZ = new Box3().setFromObject(gun).getCenter(new Vector3()).z;
    const sailZ = new Box3().setFromObject(sail).getCenter(new Vector3()).z;
    assert.ok(id === 'gato' ? gunZ > sailZ + .5 : gunZ < sailZ - .5, `${id}: deck gun must match the declared early configuration`);
  }
});

test('Rafale fixed probe joins the forward fuselage ahead of the windscreen', async () => {
  const scene = await archiveScene('rafale-c'), probe = required(components(scene, 'refueling-probe')[0]);
  const bounds = new Box3().setFromObject(probe);
  // The common forward airframe in the military three-view has a short,
  // raised starboard probe whose tip remains behind the nose.
  assert.ok(bounds.min.x > 0 && bounds.max.x < .35, 'probe remains on the starboard cheek');
  assert.ok(bounds.max.z < -1.8 && bounds.min.z < -2.4 && bounds.min.z > -2.6, 'probe begins ahead of the windscreen and stops short of the nose');
  const body = required(components(scene, 'fuselage')[0]);
  body.traverse(node => {
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
  });
  const joined = worldVertices(probe).some(point => new Set(new Raycaster(point, new Vector3(1, 0, 0), .00001, 1).intersectObject(body).map(hit => hit.distance.toFixed(5))).size % 2 === 1);
  assert.ok(joined, 'an actual probe mount vertex enters the fuselage volume');
});

test('submarine flood openings follow the actual tapered hull and casing surfaces', async () => {
  for (const id of ['u9', 'type-viic', 'gato', 'nautilus', 'oberon']) {
    const scene = await archiveScene(id);
    const surfaces = [...components(scene, 'submarine-hull'), ...components(scene, 'deck-casing')];
    const triangles: Triangle[] = [];
    for (const surface of surfaces) surface.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
      for (let at = 0; at < (indices?.count ?? positions.count); at += 3) {
        const vertex = (offset: number) => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(at + offset) : at + offset).applyMatrix4(node.matrixWorld);
        triangles.push(new Triangle(vertex(0), vertex(1), vertex(2)));
      }
    });
    const openings = required(components(scene, 'flood-openings')[0]), points = worldVertices(openings);
    assert.ok(points.length > 80, `${id}: actual flood-opening surfaces inspected`);
    const closest = new Vector3();
    for (const point of points) {
      // A lateral ray overstates gaps on steep shoulders; measure the true
      // nearest distance to the exported hull/casing triangles instead.
      const distance = Math.min(...triangles.map(triangle => triangle.closestPointToPoint(point, closest).distanceTo(point)));
      assert.ok(distance <= .005,
        `${id}: flood opening at ${point.toArray()} floats away from its supporting surface`);
    }
  }
});

test('F-16 ventral-fin roots enter the fuselage rather than hanging below it', async () => {
  const scene = await archiveScene('f16a'), body = required(components(scene, 'fuselage')[0]);
  body.traverse(node => {
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
  });
  const fins = required(components(scene, 'ventral-fin')[0]), points = worldVertices(fins);
  for (const side of [-1, 1]) {
    assert.ok(points.filter(point => point.x * side > 0).some(point =>
      new Raycaster(point, new Vector3(0, 1, 0), .00001, .3).intersectObject(body).length &&
      new Raycaster(point, new Vector3(0, -1, 0), .00001, .3).intersectObject(body).length),
    `F-16: ${side} fin has an actual root inside the airframe`);
  }
});

test('Sabre forward fuselage tapers into a rolled open intake', async () => {
  const scene = await archiveScene('f86a');
  const body = required(components(scene, 'fuselage')[0]);
  const points = worldVertices(body), bounds = new Box3().setFromPoints(points);
  const nose = new Box3().setFromPoints(points.filter(point => point.z < bounds.min.z + .12));
  const bodySize = bounds.getSize(new Vector3()), noseSize = nose.getSize(new Vector3());
  assert.ok(noseSize.x < bodySize.x * .77 && noseSize.y < bodySize.y * .77,
    'the forward airframe narrows in both plan and profile rather than ending as a tube');
  const intake = required(components(scene, 'nose-intake')[0]);
  const lip: Vector3[] = [];
  intake.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (materials.every(material => material.name === 'archive_silver')) lip.push(...worldVertices(node));
  });
  const rim = new Box3().setFromPoints(lip), rimSize = rim.getSize(new Vector3());
  assert.ok(lip.length && rimSize.z > .05 && rimSize.z < .08, 'painted lip has a rolled longitudinal section');
  assert.ok(rim.min.z < bounds.min.z - .02 && rim.max.z > bounds.min.z + .02, 'lip curves around the airframe mouth');
  assert.ok(rimSize.x <= noseSize.x + .003 && rimSize.y <= noseSize.y + .003, 'lip meets the tapered shell without an oversized ring');
});

test('intake lips follow their actual duct sections without a second circular outline', async () => {
  for (const id of ['f16a', 'mirage2000c', 'rafale-c']) {
    const scene = await archiveScene(id), entry = required(NEW_ARCHIVE.find(item => item.id === id));
    assert.equal(entry.category, 'aircraft');
    if (entry.category !== 'aircraft') continue;
    const ducts = required(entry.geometry.profile.ducts);
    for (const [index, intake] of components(scene, 'intake').entries()) {
      const points = worldVertices(intake), front = Math.min(...points.map(point => point.z));
      const rim = points.filter(point => point.z < front + .03);
      const [, rx, rz] = required(required(ducts[index]).at(-1));
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
  const radiator = required(components(scene, 'wing-radiator')[0]), oil = required(components(scene, 'oil-cooler')[0]);
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
    const scene = await archiveScene(id), hull = required(components(scene, 'submarine-hull')[0]), deck = required(components(scene, 'deck-casing')[0]);
    assert.ok(hull && deck, id);
    for (const part of [hull, deck]) part.traverse(node => {
      if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
    });
    const width = new Box3().setFromObject(hull).getSize(new Vector3()).x;
    for (let forward = -3.5; forward <= 3.5; forward += .25) for (const fraction of [-.15, 0, .15]) {
      const ray = new Raycaster(new Vector3(width * fraction, 4, -forward), new Vector3(0, -1, 0));
      const deckHit = required(ray.intersectObject(deck)[0]), hullHit = required(ray.intersectObject(hull)[0]);
      assert.ok(deckHit && hullHit, `${id}: deck and hull sampled at ${forward}`);
      assert.ok(deckHit.point.y > hullHit.point.y + .002, `${id}: hull must not emerge through the deck at ${forward}`);
    }
  }
  const soryu = await archiveScene('soryu-early'), hull = required(components(soryu, 'submarine-hull')[0]);
  const size = new Box3().setFromObject(hull).getSize(new Vector3());
  assert.ok(Math.abs(size.y / size.x - 10.3 / 9.1) < .005, 'Soryu outer hull retains its published depth/beam ratio');
});

test('century archive identities, references and era filters are consistent', () => {
  assert.equal(new Set(ARCHIVE.map(entry => entry.id)).size, ARCHIVE.length);
  assert.equal(new Set(ARCHIVE.map(entry => entry.modelId)).size, ARCHIVE.length);
  assert.equal(NEW_ARCHIVE.length, 36);
  assert.equal(HANDBOOK_ARCHIVE.length, 162);
  for (const id of ['pt-109', 'john-w-brown']) {
    assert.ok(ARCHIVE.some(entry => entry.id === id), `${id}: combat asset and review provenance retained`);
    assert.ok(!filterArchive({}).some(entry => entry.id === id), `${id}: removed from handbook browsing`);
  }
  for (const entry of ARCHIVE) {
    assert.ok(ARCHIVE_COUNTRIES.some(country => country.id === entry.country), entry.id);
    assert.equal(new URL(entry.source).protocol, 'https:');
    assert.ok(entry.feature && entry.note, entry.id);
  }
  for (const era of ['ww1', 'interwar-ww2', 'cold-war', 'modern']) {
    assert.ok(filterArchive({ country: 'all', category: 'aircraft', era }).length, `${era}: aircraft`);
    assert.ok(filterArchive({ country: 'all', category: 'submarine', era }).length, `${era}: submarine`);
  }
  assert.deepEqual([1918, 1919, 1945, 1946, 1991, 1992].map(archiveEra), ['ww1', 'interwar-ww2', 'interwar-ww2', 'cold-war', 'cold-war', 'modern']);
  assert.equal(filterArchive({ country: 'se', category: 'submarine' }).length, 0);
  assert.deepEqual(ARCHIVE_COUNTRIES.map(country => country.id), ['cn', 'us', 'fr', 'gb', 'ru', 'jp', 'de', 'it']);
  for (const country of ['se', 'nl', 'pl', 'ca', 'au', 'nz', 'no', 'gr', 'yu', 'fi', 'ro', 'th', 'br', 'in', 'za', 'dk', 'su']) assert.equal(filterArchive({ country }).length, 0, country);
  assert.ok(filterArchive({ country: 'ru' }).some(entry => entry.id === 'mig21pf'));
  assert.ok(filterArchive({ country: 'ru', category: 'surface' }).some(entry => entry.id === 'marat'));
});

const revision = 'a'.repeat(64);
assert.ok(isModelRevision(revision));
const member = (seat: 'opus' | 'sol' | 'grok', score = seat === 'grok' ? 9.9 : 9.8, rev: string = revision): CouncilMember => {
  assert.ok(isModelRevision(rev));
  const targets = {
    opus: { provider: 'claudeAgent', model: 'claude-opus-5-5', effort: 'high' },
    sol: { provider: 'codex', model: 'gpt-6.1-sol', effort: 'xhigh' },
    grok: { provider: 'cursor', model: 'grok-4.7', effort: 'xhigh' },
  } satisfies Record<string, Pick<CouncilMember, 'provider' | 'model' | 'effort'>>;
  return { ...targets[seat], reviewer: seat, taskId: `task-${seat}`, overallScore: score, results: { example: { revision: rev, score, findings: [] } } };
};
const ledger = (...members: CouncilMember[]): ReviewLedger => ({ version: 2, rounds: [{ round: 1, date: '2026-11-16', members }] });

test('Grok must reach 9.8 overall and on the entire current batch before later reviews', () => {
  const revisions = new Map([['example', revision], ['other', revision]]);
  const gate = (input: ReviewLedger | null, modelIds = ['example']) => grokReviewGate({ modelIds, revisions, ledger: input });
  assert.equal(gate(null).state, 'blocked');
  assert.equal(gate(ledger()).state, 'blocked');
  assert.equal(gate(ledger(member('grok')), []).state, 'blocked');
  assert.equal(gate(ledger(member('grok', 9.8))).state, 'ready');
  assert.equal(gate(ledger({ ...member('grok'), overallScore: 9.8 })).state, 'ready');
  assert.equal(gate(ledger({ ...member('grok'), overallScore: null })).state, 'blocked');
  assert.equal(gate(ledger(member('grok', 9.9, 'b'.repeat(64)))).state, 'blocked');
  assert.equal(gate(ledger(member('grok')), ['example', 'other']).state, 'blocked');
  assert.equal(gate(ledger(member('grok'))).state, 'ready');
  const grok = member('grok');
  const complete = { ...grok, results: { ...grok.results, other: { revision, score: 9.9, findings: [] } } };
  assert.equal(gate(ledger(complete), ['example', 'other']).state, 'ready');
  const split: ReviewLedger = { version: 2, rounds: [required(ledger(grok).rounds[0]), { round: 2, date: '2026-11-16', members: [{ ...complete, results: { other: required(complete.results.other) } }] }] };
  assert.equal(gate(split, ['example', 'other']).state, 'blocked');
});

test('exactly 9.8 passes all seats but 9.79 or a missing overall cannot approve', () => {
  assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: ledger(member('opus', 9.8), member('sol', 9.8), member('grok', 9.8)) }).state, 'approved');
  for (const seat of ['opus', 'sol', 'grok'] as const) {
    for (const overallScore of [9.79, null]) {
      const entries = (['opus', 'sol', 'grok'] as const).map(target => target === seat ? { ...member(target, 10), overallScore } : member(target, 10));
      assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: ledger(...entries) }).state, overallScore === null ? 'pending' : 'changes-required');
    }
  }
});

test('approval requires every named provider >=9.8 on one exact revision and round', () => {
  for (const members of [[], [member('opus')], [member('opus'), member('sol')]]) {
    assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: ledger(...members) }).state, 'pending');
  }
  const approved = ledger(member('opus'), member('sol'), member('grok', 10));
  assert.ok(isReviewLedger(approved));
  assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: approved }).state, 'approved');
  for (const seat of ['opus', 'sol', 'grok'] as const) {
    const low = ledger(...(['opus', 'sol', 'grok'] as const).map(target => member(target, target === seat ? 9.79 : 10)));
    assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: low }).state, 'changes-required');
  }
  assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: ledger(member('opus'), member('sol'), member('grok', 10, 'b'.repeat(64))) }).state, 'stale');
  assert.equal(modelReviewStatus({ modelId: 'example', revision: undefined, ledger: approved }).state, 'pending');
  const split: ReviewLedger = { version: 2, rounds: [required(ledger(member('opus'), member('sol')).rounds[0]), { round: 2, date: '2026-11-16', members: [member('grok')] }] };
  assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: split }).state, 'pending');
  const regression: ReviewLedger = { version: 2, rounds: [required(approved.rounds[0]), { round: 2, date: '2026-11-16', members: [member('opus', 9.5)] }] };
  assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: regression }).state, 'changes-required');
});

test('the ledger rejects duplicated providers, identities, incorrect models and efforts', () => {
  for (const score of [NaN, Infinity, -1, 10.01]) assert.equal(isReviewLedger(ledger(member('opus', score))), false);
  assert.equal(isReviewLedger(ledger(member('opus'), member('opus'))), false);
  assert.equal(isReviewLedger(ledger(member('opus'), { ...member('sol'), reviewer: 'opus' })), false);
  assert.equal(isReviewLedger(ledger(member('opus'), { ...member('sol'), taskId: 'task-opus' })), false);
  assert.equal(isReviewLedger({ ...ledger(member('opus')), version: 1 }), false);
  assert.equal(isReviewLedger({ version: 2, rounds: [{ round: 1, date: '2026-11-16', members: [{ ...member('opus'), model: 'other-model' }] }] }), false);
  assert.equal(isReviewLedger({ version: 2, rounds: [{ round: 1, date: '2026-11-16', members: [{ ...member('opus'), effort: 'xhigh' }] }] }), false);
});

test('a real no-score result stays local to its model and supersedes older approvals', () => {
  const unscored: CouncilMember = { ...member('opus'), results: { example: { revision, score: null, findings: ['The artifact could not be inspected.'] } } };
  const trio = ledger(unscored, member('sol'), member('grok'));
  assert.ok(isReviewLedger(trio));
  const status = modelReviewStatus({ modelId: 'example', revision, ledger: trio });
  assert.equal(status.state, 'pending');
  assert.equal(status.unscored, 1);
  assert.match(reviewLabel(status), /未评分/);
  const rounds: ReviewLedger = { version: 2, rounds: [
    required(ledger(member('opus'), member('sol'), member('grok')).rounds[0]),
    { round: 2, date: '2026-11-16', members: trio.rounds[0]?.members ?? [] },
  ] };
  assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: rounds }).state, 'pending');
  const withOther = ledger(...[unscored, member('sol'), member('grok')].map(entry => ({ ...entry, results: { ...entry.results, other: { revision, score: entry.provider === 'cursor' ? 9.9 : 9.8, findings: [] } } })));
  assert.equal(modelReviewStatus({ modelId: 'other', revision, ledger: withOther }).state, 'approved');
  assert.equal(modelReviewStatus({ modelId: 'example', revision, ledger: withOther }).state, 'pending');
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
      assert.equal(components(scene, 'propeller').length, entry.geometry.propellerBlades ? entry.geometry.engines : 0, entry.id);
      assert.equal(nodes.filter(node => node.userData['archive_component'] === 'main-wing').length, entry.geometry.wingLevels.length * 2, entry.id);
      const aspect = size.x / size.z;
      assert.ok(Math.abs(aspect - entry.geometry.span / entry.geometry.length) < .12, `${entry.id}: planform proportions`);
    } else {
      assert.equal(nodes.filter(node => node.userData['archive_component'] === 'propulsor').length, entry.geometry.shafts, entry.id);
      assert.equal(nodes.filter(node => node.userData['archive_component'] === 'deck-gun').length, entry.geometry.deckGun ? 1 : 0, entry.id);
      const fins = nodes.filter(node => node.userData['archive_component'] === 'stern-rudder');
      const expected = required({ u9: 3, 'type-viic': 4, gato: 3, nautilus: 3, oberon: 3, 'virginia-block-i': 4, 'type-212a': 4, 'soryu-early': 4, 'type-039a': 4, 'rubis-amethyste': 4, 'project-971': 4, 'sauro-first-series': 4, 'type-035g': 3, 'type-039-original': 4, 'type-091-late': 4, 'type-094-early': 4, 'type-093-early': 4, 'type-092-refit': 4 }[entry.id]);
      assert.equal(fins.length, expected, entry.id);
      const finAxis = new Vector3(1, 0, 0).transformDirection(required(fins[0]).matrixWorld);
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
    const entry = required(NEW_ARCHIVE.find(item => item.id === id));
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


function modelReviewStatus({ modelId, revision, ledger }: { modelId: string; revision: unknown; ledger: unknown }) {
  return parsedModelReviewStatus({ modelId, revision: isModelRevision(revision) ? revision : undefined, ledger: parseReviewLedger(ledger) });
}
