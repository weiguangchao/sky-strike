import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Mesh, Ray, Triangle, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HISTORICAL_SHIPS, historicalModel } from '../game/naval-history.ts';
import { required } from './support.ts';

async function sceneFor(id: string) {
  const bytes = await readFile(new URL(`../game/public/assets/models/${id}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
  scene.updateMatrixWorld(true);
  return scene;
}

function trianglesOf(root: Object3D, material = /^/, permanent = false): Triangle[] {
  const triangles: Triangle[] = [];
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    for (let parent: Object3D | null = node; parent; parent = parent.parent) {
      if (parent.userData.game_ruin || permanent && parent.userData.game_part) return;
    }
    const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const groups = node.geometry.groups.length ? node.geometry.groups : [{ start: 0, count: indices?.count ?? positions.count, materialIndex: 0 }];
    for (const group of groups) {
      if (!material.test(required(materials[group.materialIndex ?? 0]).name)) continue;
      for (let at = group.start; at < group.start + group.count; at += 3) {
        const point = (offset: number) => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(at + offset) : at + offset).applyMatrix4(node.matrixWorld);
        triangles.push(new Triangle(point(0), point(1), point(2)));
      }
    }
  });
  return triangles;
}

function boundsOf(triangles: readonly Triangle[]) {
  return new Box3().setFromPoints(triangles.flatMap(triangle => [triangle.a, triangle.b, triangle.c]));
}

// Exporters split normals and materials at shared vertices. Weld positions to
// recover each physical piece without relying on Blender's joined mesh names.
function piecesOf(triangles: readonly Triangle[]) {
  const parent = triangles.map((_, index) => index), owner = new Map<string, number>();
  function find(index: number): number {
    const next = required(parent[index]);
    if (next === index) return index;
    const root = find(next);
    parent[index] = root;
    return root;
  }
  triangles.forEach((triangle, index) => {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      const key = point.toArray().map(value => Math.round(value * 1e5)).join(','), previous = owner.get(key);
      if (previous === undefined) owner.set(key, index);
      else parent[find(index)] = find(previous);
    }
  });
  const groups = new Map<number, Triangle[]>();
  triangles.forEach((triangle, index) => {
    const key = find(index), group = groups.get(key) ?? [];
    group.push(triangle);
    groups.set(key, group);
  });
  return [...groups.values()].map(triangles => ({ triangles, bounds: boundsOf(triangles) }));
}

function hitAt({ triangles, origin, direction }: { triangles: readonly Triangle[]; origin: Vector3; direction: Vector3 }) {
  const ray = new Ray(origin, direction), hit = new Vector3();
  let nearest: Vector3 | undefined, distance = Infinity;
  for (const triangle of triangles) {
    if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) continue;
    const candidate = origin.distanceToSquared(hit);
    if (candidate < distance) { nearest = hit.clone(); distance = candidate; }
  }
  return nearest;
}

test('carrier island feet enter the surviving flight deck', async () => {
  for (const id of ['fleet-carrier', 'historic-kaga', 'historic-shokaku', 'historic-hiryu', 'historic-soryu', 'historic-ranger']) {
    const scene = await sceneFor(id), nodes: Object3D[] = [];
    scene.traverse(node => { if (node.userData.game_part === 'bridge') nodes.push(node); });
    const island = trianglesOf(required(nodes[0])), bounds = boundsOf(island), centre = bounds.getCenter(new Vector3());
    const deck = required(hitAt({ triangles: trianglesOf(scene, /^/, true), origin: new Vector3(centre.x, bounds.min.y + .1, centre.z), direction: new Vector3(0, -1, 0) }));
    assert.ok(bounds.min.y < deck.y + .001, `${id}: island foot floats ${bounds.min.y - deck.y} above the deck`);
    assert.ok(bounds.min.y > deck.y - .04, `${id}: island foot remains near the deck surface`);
  }
});

test('command tower and merchant masts have solid support under their feet', async () => {
  for (const id of ['historic-algerie', 'transport', 'historic-wolverine', 'historic-sable']) {
    const scene = await sceneFor(id), pieces = piecesOf(trianglesOf(scene));
    const masts = pieces.filter(piece => {
      const size = piece.bounds.getSize(new Vector3());
      return size.y > .20 && size.x < .40 && size.z < .07 && piece.bounds.min.y > .35;
    });
    assert.ok(masts.length, `${id}: actual mast solids found`);
    for (const mast of masts) {
      const centre = mast.bounds.getCenter(new Vector3());
      const support = required(hitAt({ triangles: pieces.filter(piece => piece !== mast).flatMap(piece => piece.triangles), origin: new Vector3(centre.x, mast.bounds.min.y + .1, centre.z), direction: new Vector3(0, -1, 0) }));
      assert.ok(support.y >= mast.bounds.min.y - .002, `${id}: mast foot floats ${mast.bounds.min.y - support.y}`);
    }
  }
});

function touch(a: ReturnType<typeof piecesOf>[number], b: ReturnType<typeof piecesOf>[number]) {
  const tolerance = .0015;
  if (!a.bounds.clone().expandByScalar(tolerance).intersectsBox(b.bounds)) return false;
  const closest = new Vector3(), crossing = new Vector3();
  for (const x of a.triangles) for (const y of b.triangles) {
    if (!boundsOf([x]).expandByScalar(tolerance).intersectsBox(boundsOf([y]))) continue;
    for (const [first, second] of [[x, y], [y, x]]) {
      for (const point of [required(first).a, required(first).b, required(first).c]) {
        if (required(second).closestPointToPoint(point, closest).distanceTo(point) <= tolerance) return true;
      }
      for (const [start, end] of [[required(first).a, required(first).b], [required(first).b, required(first).c], [required(first).c, required(first).a]]) {
        const from = required(start), to = required(end), delta = to.clone().sub(from);
        const hit = new Ray(from, delta.clone().normalize()).intersectTriangle(required(second).a, required(second).b, required(second).c, false, crossing);
        if (hit && from.distanceTo(hit) <= delta.length() + tolerance) return true;
      }
    }
  }
  return false;
}

test('missile launch rails connect through real solids to the traversing base', async () => {
  let checked = 0;
  for (const ship of HISTORICAL_SHIPS.filter(ship => ship.geometry.launchers?.some(launcher => !['vls', 'asroc', 'alpha'].includes(launcher.kind)))) {
    const scene = await sceneFor(historicalModel(ship.id)), launchers: Object3D[] = [];
    scene.traverse(node => { if (node.userData.naval_launcher && !['vls', 'asroc', 'alpha'].includes(node.userData.naval_launcher)) launchers.push(node); });
    for (const launcher of launchers) {
      const pieces = piecesOf(trianglesOf(launcher));
      const base = pieces.reduce((lowest, piece) => piece.bounds.min.y < lowest.bounds.min.y ? piece : lowest);
      const connected = new Set([base]);
      for (let previous = -1; previous !== connected.size;) {
        previous = connected.size;
        for (const piece of pieces) if (!connected.has(piece) && [...connected].some(other => touch(piece, other))) connected.add(piece);
      }
      assert.equal(connected.size, pieces.length, `${ship.id}/${launcher.name}: rails, missiles or fins float apart from the pedestal`);
      checked++;
    }
  }
  assert.ok(checked >= 20, 'the shared launcher family was checked throughout the fleet');
});

test('open-bridge periscopes and shears reach the bridge floor', async () => {
  for (const id of ['u9', 'type-viic', 'gato']) {
    const scene = await sceneFor(`archive-${id}`), nodes: Object3D[] = [];
    scene.traverse(node => { if (node.userData.archive_component === 'sail') nodes.push(node); });
    const sail = required(nodes[0]), floor = trianglesOf(sail, /^archive_openings$/);
    const standards = piecesOf(trianglesOf(sail, /^archive_(structure|submarine_casing)$/)).filter(piece => {
      const size = piece.bounds.getSize(new Vector3());
      return size.y > .17 && size.x < .10 && size.z < .10;
    });
    assert.ok(standards.length >= 2, `${id}: exported vertical standards found`);
    for (const standard of standards) {
      const centre = standard.bounds.getCenter(new Vector3());
      const support = required(hitAt({ triangles: floor, origin: new Vector3(centre.x, standard.bounds.min.y + .1, centre.z), direction: new Vector3(0, -1, 0) }));
      assert.ok(standard.bounds.min.y <= support.y + .002, `${id}: unsupported standard above the hollow bridge floor`);
    }
  }
});

test('CG-4A main wheels have discs between each tyre and hub', async () => {
  const scene = await sceneFor('archive-cg4a'), gears: Object3D[] = [];
  scene.traverse(node => { if (node.userData.archive_component === 'landing-wheel') gears.push(node); });
  let checked = 0;
  for (const gear of gears) {
    const tyre = trianglesOf(gear, /^archive_openings$/), bounds = boundsOf(tyre), centre = bounds.getCenter(new Vector3());
    if (bounds.getSize(new Vector3()).y < .2) continue;
    const radius = bounds.getSize(new Vector3()).y / 2;
    const disc = hitAt({ triangles: trianglesOf(gear, /^archive_structure$/), origin: new Vector3(centre.x + .3, centre.y + radius * .55, centre.z), direction: new Vector3(-1, 0, 0) });
    assert.ok(disc, 'the annulus between hub and tyre must contain a real wheel disc');
    checked++;
  }
  assert.equal(checked, 2);
});


test('belly torpedo connects through solid mounts to the airframe', async () => {
  const pieces = piecesOf(trianglesOf(await sceneFor('torpedo')));
  const store = required(pieces.find(piece => piece.bounds.max.y < -.14 && piece.bounds.getSize(new Vector3()).z > 1));
  const body = required(pieces.find(piece => piece.triangles.length > 500 && piece.bounds.getSize(new Vector3()).z > 2));
  const connected = new Set([store]);
  for (let previous = -1; previous !== connected.size;) {
    previous = connected.size;
    for (const piece of pieces) if (!connected.has(piece) && [...connected].some(other => touch(piece, other))) connected.add(piece);
  }
  assert.ok(connected.has(body), 'the torpedo needs actual solid contact through its mounts to the fuselage');
});

test('both patrol windscreen posts enter the cabin coaming', async () => {
  const pieces = piecesOf(trianglesOf(await sceneFor('patrol-boat')));
  const posts = pieces.filter(piece => {
    const size = piece.bounds.getSize(new Vector3()), centre = piece.bounds.getCenter(new Vector3());
    return Math.abs(centre.x) > .27 && Math.abs(centre.x) < .31 && size.x < .05 && size.z < .08 && size.y > .12 && size.y < .18 && piece.bounds.max.y < .46;
  });
  assert.equal(posts.length, 2, 'both exported windscreen post solids must be present');
  for (const post of posts) {
    const centre = post.bounds.getCenter(new Vector3());
    const support = required(hitAt({ triangles: pieces.filter(piece => !posts.includes(piece)).flatMap(piece => piece.triangles), origin: new Vector3(centre.x, post.bounds.min.y + .025, centre.z), direction: new Vector3(0, -1, 0) }));
    assert.ok(post.bounds.min.y <= support.y + .0015, `windscreen foot floats ${post.bounds.min.y - support.y} above the coaming`);
  }
});


// Probe the exported structural solids identified in the source-view failures.
// Only lower supports count: contact with an antenna or another floating tier
// above the foot cannot satisfy the attachment requirement.
test('capital bridge tiers, optical tops and roof plates meet lower structure', async () => {
  const families = [
    { ids: ['iowa', 'missouri', 'south-dakota'], foot: .817, width: [.25, .35] },
    { ids: ['king-george-v', 'renown', 'warspite'], foot: .644, width: [.18, .25] },
    { ids: ['bismarck', 'tirpitz', 'scharnhorst'], foot: .751, width: [.22, .30] },
    { ids: ['prinz-eugen'], foot: .600, width: [.13, .18] },
    { ids: ['littorio', 'roma', 'giulio-cesare'], foot: .747, width: [.35, .41] },
    { ids: ['littorio', 'roma', 'giulio-cesare'], foot: .850, width: [.035, .06] },
    { ids: ['arizona', 'hood'], foot: 1.071, width: [.60, .68] },
    { ids: ['marat'], foot: 1.092, width: [.60, .68] },
    { ids: ['ning-hai'], foot: .886, width: [.37, .43] },
  ];
  const failures: string[] = [];
  let checked = 0;
  for (const { ids, foot, width } of families) for (const id of ids) {
    const scene = await sceneFor(`historic-${id}`), bridge: Object3D[] = [];
    scene.traverse(node => { if (node.userData.game_part === 'bridge') bridge.push(node); });
    const pieces = piecesOf(trianglesOf(required(bridge[0])));
    const candidates = pieces.filter(piece => {
      const size = piece.bounds.getSize(new Vector3());
      return size.x >= required(width[0]) && size.x <= required(width[1]) && Math.abs(piece.bounds.min.y - foot) < .035;
    }).sort((a, b) => Math.abs(a.bounds.min.y - foot) - Math.abs(b.bounds.min.y - foot));
    const target = required(candidates[0]);
    const supported = pieces.some(other => other !== target && other.bounds.min.y < target.bounds.min.y - .003 && touch(target, other));
    if (!supported) failures.push(`${id}: unsupported structure at Y=${target.bounds.min.y}`);
    checked++;
  }
  assert.equal(checked, 20);
  assert.deepEqual(failures, []);
});

test('jet carrier and Aegis bridge feet meet the actual permanent deck', async () => {
  const failures: string[] = [];
  for (const id of ['midway', 'forrestal', 'ticonderoga']) {
    const scene = await sceneFor(`historic-${id}`), nodes: Object3D[] = [];
    scene.traverse(node => { if (node.userData.game_part === 'bridge') nodes.push(node); });
    const pieces = piecesOf(trianglesOf(required(nodes[0])));
    const foot = pieces.filter(piece => piece.bounds.getSize(new Vector3()).x > .2).sort((a, b) => a.bounds.min.y - b.bounds.min.y)[0];
    const base = required(foot), centre = base.bounds.getCenter(new Vector3());
    const deck = required(hitAt({ triangles: trianglesOf(scene, /^/, true), origin: new Vector3(centre.x, base.bounds.min.y + .03, centre.z), direction: new Vector3(0, -1, 0) }));
    if (base.bounds.min.y > deck.y + .0015) failures.push(`${id}: bridge foot floats ${base.bounds.min.y - deck.y}`);
  }
  assert.deepEqual(failures, []);
});


test('served Chinese and Italian trainers export unarmed airframes with supported wings and tanks', async () => {
  for (const id of ['mb326', 'cj6a']) {
    const scene = await sceneFor(`archive-${id}`), nodes: Object3D[] = [];
    scene.traverse(node => {
      if (node.userData.archive_component) nodes.push(node);
      assert.ok(!/wing_gun|machine_gun|weapon|bomb|rocket/.test(node.name), `${id}: unarmed training fit`);
    });
    const shapeOf = (node: Object3D) => { const triangles = trianglesOf(node); return { triangles, bounds: boundsOf(triangles) }; };
    const body = shapeOf(required(nodes.find(node => node.userData.archive_component === 'fuselage')));
    const wings = nodes.filter(node => node.userData.archive_component === 'main-wing').map(shapeOf);
    assert.equal(wings.length, 2);
    for (const node of nodes.filter(node => ['main-wing', 'horizontal-tail', 'vertical-tail', 'intake'].includes(node.userData.archive_component))) {
      assert.ok(touch(shapeOf(node), body), `${id}: ${node.userData.archive_component} enters fuselage`);
    }
    const tanks = nodes.filter(node => node.userData.archive_component === 'wingtip-tank');
    assert.equal(tanks.length, id === 'mb326' ? 2 : 0);
    for (const tank of tanks) assert.ok(wings.some(wing => touch(shapeOf(tank), wing)), 'tip tank attaches to the wing surface');
    if (id === 'cj6a') {
      const wing = required(wings.find(wing => wing.bounds.max.x > 3));
      const span = wing.bounds.max.x, vertices = wing.triangles.flatMap(triangle => [triangle.a, triangle.b, triangle.c]);
      const leading = (fraction: number) => required(vertices.filter(point => Math.abs(point.x - span * fraction) < 1e-5).sort((a, b) => a.z - b.z)[0]);
      assert.ok(Math.abs(leading(.16).y - leading(.20).y) < .001, 'CJ6 inner wing stays flat through the dihedral break');
      const outer = Math.atan2(leading(1).y - leading(.32).y, span * .68) * 180 / Math.PI;
      assert.ok(Math.abs(outer - 7) < .02, 'CJ6 outer wing has seven degrees of dihedral');
    }
    const size = boundsOf(trianglesOf(scene)).getSize(new Vector3());
    const length = id === 'mb326' ? 10.65 : 8.46, span = id === 'mb326' ? 10.56 : 10.22;
    assert.ok(Math.abs(size.x * length / 6 - span) < .015, `${id}: complete span`);
    assert.ok(Math.abs(size.z * length / 6 - length) < .015, `${id}: complete length including nose and exhaust`);
  }
});


test('both patrol windscreen panes extend into their actual cabin sill', async () => {
  const scene = await sceneFor('patrol-boat');
  const panes = piecesOf(trianglesOf(scene, /^fleet_glass(?:\.\d+)?$/));
  assert.equal(panes.length, 2, 'two physical windscreen panes are present');
  const sill = trianglesOf(scene, /^olive-drab-paint(?:\.\d+)?$/);
  for (const pane of panes) {
    const centre = pane.bounds.getCenter(new Vector3());
    const support = required(hitAt({ triangles: sill, origin: new Vector3(centre.x, pane.bounds.min.y + .02, centre.z), direction: new Vector3(0, -1, 0) }));
    assert.ok(pane.bounds.min.y <= support.y + .0015, `windscreen glass floats ${pane.bounds.min.y - support.y} above the actual sill`);
  }
});

test('patrol glass follows both sloping side posts over the complete exposed height', async () => {
  const scene = await sceneFor('patrol-boat');
  const panes = piecesOf(trianglesOf(scene, /^fleet_glass(?:\.\d+)?$/));
  const posts = piecesOf(trianglesOf(scene)).filter(piece => {
    const size = piece.bounds.getSize(new Vector3()), centre = piece.bounds.getCenter(new Vector3());
    return Math.abs(centre.x) > .27 && Math.abs(centre.x) < .31 && size.x < .05 && size.z < .08 && size.y > .12 && size.y < .18 && piece.bounds.max.y < .46;
  });
  assert.equal(panes.length, 2);
  assert.equal(posts.length, 2);
  function section(triangles: readonly Triangle[], height: number) {
    const points: Vector3[] = [];
    for (const triangle of triangles) for (const [a, b] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]]) {
      const start = required(a), end = required(b);
      if (height < Math.min(start.y, end.y) || height > Math.max(start.y, end.y) || Math.abs(end.y - start.y) < 1e-8) continue;
      points.push(start.clone().lerp(end, (height - start.y) / (end.y - start.y)));
    }
    assert.ok(points.length, 'the exported surface crosses this height');
    return points;
  }
  for (const pane of panes) {
    const side = Math.sign(pane.bounds.getCenter(new Vector3()).x);
    const post = required(posts.find(post => Math.sign(post.bounds.getCenter(new Vector3()).x) === side));
    for (const height of [.302, .307, .317, .337, .357, .377, .397, .417, .432]) {
      const glazing = section(pane.triangles, height), frame = section(post.triangles, height);
      const glassEdge = Math.max(...glazing.map(point => side * point.x)), postEdge = Math.min(...frame.map(point => side * point.x));
      assert.ok(glassEdge >= postEdge + .0005, `pane ${side} at ${height}: lower outer seam ${postEdge - glassEdge}`);
      assert.ok(Math.max(...glazing.map(point => point.z)) > Math.min(...frame.map(point => point.z)) && Math.max(...frame.map(point => point.z)) > Math.min(...glazing.map(point => point.z)), 'glass and post also overlap in depth');
    }
  }
});


test('radar lattice feet enter their bridge-wing roof instead of hanging from the mast', async () => {
  const ids = ['mitscher', 'forrest-sherman', 'farragut-1958', 'charles-adams', 'spruance', 'des-moines', 'galveston', 'boston', 'leahy', 'belknap', 'bainbridge-nuclear', 'california', 'truxtun'];
  for (const id of ids) {
    const scene = await sceneFor(`historic-${id}`), bridges: Object3D[] = [];
    scene.traverse(node => { if (node.userData.game_part === 'bridge') bridges.push(node); });
    const bridge = required(bridges[0]);
    const legs = piecesOf(trianglesOf(bridge, /^fleet_ink$/)).filter(piece => {
      const size = piece.bounds.getSize(new Vector3());
      return size.y > .25 && size.x > .06 && size.z < .05;
    });
    assert.ok(legs.length, `${id}: exported sloping lattice solids found`);
    const vertices = legs.flatMap(leg => leg.triangles.flatMap(triangle => [triangle.a, triangle.b, triangle.c]));
    const roof = trianglesOf(bridge, /^fleet_roof$/);
    for (const side of [-1, 1]) {
      const foot = required(vertices.filter(point => point.x * side > .04).sort((a, b) => a.y - b.y)[0]);
      const support = required(hitAt({ triangles: roof, origin: foot.clone().add(new Vector3(0, .05, 0)), direction: new Vector3(0, -1, 0) }));
      assert.ok(foot.y < support.y, `${id}: lattice foot floats ${foot.y - support.y} above the bridge wing`);
      assert.ok(foot.y > support.y - .02, `${id}: lattice foot stays near the roof it enters`);
    }
  }
});
