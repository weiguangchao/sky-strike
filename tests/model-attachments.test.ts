import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, DoubleSide, Mesh, Raycaster, Triangle, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HISTORICAL_SHIPS, historicalModel } from '../game/naval-history.ts';
import { required } from './support.ts';
import { VEHICLE_MODEL_IDS } from '../game/models.ts';

async function sceneFor(id: string) {
  const bytes = await readFile(new URL(`../game/public/assets/models/${id}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
  scene.updateMatrixWorld(true);
  scene.traverse(node => {
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
  });
  return scene;
}

test('all damaged carrier deck bases stay supported after the intact operations layer disappears', async () => {
  const carriers = HISTORICAL_SHIPS.filter(ship => ship.hull === 'fleet-carrier').map(ship => historicalModel(ship.id));
  for (const id of ['fleet-carrier', ...carriers]) {
    const scene = await sceneFor(id), meshes: Mesh[] = [];
    let damage: Object3D | undefined;
    scene.traverse(node => {
      if (node.userData.game_ruin === 'flight-deck') damage = node;
      if (node instanceof Mesh) meshes.push(node);
    });
    const plate = required(damage), centre = new Box3().setFromObject(plate).getCenter(new Vector3());
    const staticDeck = meshes.filter(mesh => {
      for (let node: Object3D | null = mesh; node; node = node.parent) if (node.userData.game_part || node.userData.game_ruin) return false;
      return true;
    });
    for (const offset of [-.1, 0, .1]) {
      const x = centre.x + offset;
      const underside = required(new Raycaster(new Vector3(x, -2, centre.z), new Vector3(0, 1, 0)).intersectObject(plate, true)[0]).point.y;
      const support = required(new Raycaster(new Vector3(x, 2, centre.z), new Vector3(0, -1, 0)).intersectObjects(staticDeck, false)[0]).point.y;
      assert.ok(underside <= support + .001, `${id}: damage plate floats ${underside - support} above its surviving deck`);
      assert.ok(underside > support - .015, `${id}: damage plate must remain visible above the deck`);
    }
  }
});

function materialTriangles(root: Object3D, materialName: RegExp): Triangle[] {
  const triangles: Triangle[] = [];
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const groups = node.geometry.groups.length ? node.geometry.groups : [{ start: 0, count: indices?.count ?? positions.count, materialIndex: 0 }];
    for (const group of groups) {
      if (!materialName.test(required(materials[group.materialIndex ?? 0]).name)) continue;
      for (let at = group.start; at < group.start + group.count; at += 3) {
        const point = (offset: number) => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(at + offset) : at + offset).applyMatrix4(node.matrixWorld);
        triangles.push(new Triangle(point(0), point(1), point(2)));
      }
    }
  });
  return triangles;
}

test('each ruined steel plate and beam connects to a base anchored in permanent geometry', async () => {
  let checked = 0;
  for (const id of VEHICLE_MODEL_IDS) {
    const scene = await sceneFor(id), ruins: Object3D[] = [], permanent: Mesh[] = [];
    scene.traverse(node => {
      if (node.userData.game_ruin) ruins.push(node);
      if (!(node instanceof Mesh)) return;
      for (let parent: Object3D | null = node; parent; parent = parent.parent) if (parent.userData.game_part || parent.userData.game_ruin) return;
      permanent.push(node);
    });
    for (const ruin of ruins) {
      const base = materialTriangles(ruin, /^fleet_ink(?:\.|$)/);
      if (!base.length) continue;
      const rust = materialTriangles(ruin, /^fleet_rust(?:\.|$)/);
      const origin = ruin.getWorldPosition(new Vector3());
      // The two disjoint rust plates live on opposite sides of the origin;
      // test both independently even when the exporter merges their meshes.
      const pieces = [-1, 1].map(side => rust.filter(triangle => (triangle.getMidpoint(new Vector3()).x - origin.x) * side > 0));
      pieces.push(materialTriangles(ruin, /^fleet_edge(?:_|\.|$)/));
      for (const piece of pieces) {
        assert.ok(piece.length, `${id}/${ruin.name}: missing steel component`);
        const minimum = Math.min(...piece.flatMap(triangle => [triangle.a.y, triangle.b.y, triangle.c.y]));
        const bottom = piece.filter(triangle => [triangle.a, triangle.b, triangle.c].every(point => Math.abs(point.y - minimum) < .00001));
        assert.ok(bottom.length, `${id}/${ruin.name}: steel bottom faces found`);
        const attached = bottom.some(triangle => {
          const point = triangle.getMidpoint(new Vector3());
          const ray = new Raycaster(point.clone().add(new Vector3(0, .1, 0)), new Vector3(0, -1, 0)).ray;
          return base.some(support => {
            const hit = ray.intersectTriangle(support.a, support.b, support.c, false, new Vector3());
            return hit !== null && hit.y >= point.y + .0001;
          });
        });
        assert.ok(attached, `${id}/${ruin.name}: an individual steel component floats above the base`);
      }
      const minimum = Math.min(...base.flatMap(triangle => [triangle.a.y, triangle.b.y, triangle.c.y]));
      const bottom = base.filter(triangle => [triangle.a, triangle.b, triangle.c].every(point => Math.abs(point.y - minimum) < .00001));
      const samples = bottom.flatMap(triangle => {
        const points: Vector3[] = [];
        for (let a = 1; a < 8; a++) for (let b = 1; a + b < 9; b++) {
          points.push(triangle.a.clone().multiplyScalar(a / 10).addScaledVector(triangle.b, b / 10).addScaledVector(triangle.c, 1 - (a + b) / 10));
        }
        return points;
      });
      assert.ok(samples.some(point => {
        const hit = new Raycaster(point.clone().add(new Vector3(0, .04, 0)), new Vector3(0, -1, 0), 0, .1).intersectObjects(permanent, false)[0];
        return hit !== undefined && hit.point.y >= point.y + .0001;
      }), `${id}/${ruin.name}: ruin base has no contact with retained permanent geometry`);
      checked++;
    }
  }
  assert.ok(checked >= 410, 'the shared damage generator is checked throughout the actual library');
});

test('new Chinese, French and Italian sail planes enter their actual exported towers', async () => {
  for (const id of ['type-039a', 'rubis-amethyste', 'sauro-first-series']) {
    const scene = await sceneFor(`archive-${id}`);
    const towers: Object3D[] = [], planes: Object3D[] = [];
    scene.traverse(node => {
      if (node.userData.archive_component === 'sail') towers.push(node);
      if (node.userData.archive_component === 'diving-plane') planes.push(node);
    });
    assert.equal(towers.length, 1, id);
    assert.equal(planes.length, 2, id);
    for (const plane of planes) {
      const bounds = new Box3().setFromObject(plane), probe = bounds.getCenter(new Vector3());
      probe.x = 0;
      for (const direction of [new Vector3(0, 1, 0), new Vector3(0, -1, 0)]) {
        assert.ok(new Raycaster(probe, direction, .00001, 2).intersectObjects(towers, true).length, `${id}: plane root must be inside tower volume`);
      }
    }
  }
});

test('Project 971 towed-array pod is physically supported by its upper stern fin', async () => {
  const scene = await sceneFor('archive-project-971'), pods: Object3D[] = [], fins: Object3D[] = [];
  scene.traverse(node => {
    if (node.userData.archive_component === 'towed-array-pod') pods.push(node);
    if (node.userData.archive_component === 'stern-rudder') fins.push(node);
  });
  assert.equal(pods.length, 1);
  assert.equal(fins.length, 4);
  // The pod overhangs the tapered airfoil. Test volume overlap along the
  // actual central junction, rather than support below its entire footprint.
  for (const z of [3.95, 4.12, 4.28]) {
    const x = 0;
    const bottom = required(new Raycaster(new Vector3(x, -3, z), new Vector3(0, 1, 0)).intersectObjects(pods, true)[0]).point.y;
    const support = required(new Raycaster(new Vector3(x, 3, z), new Vector3(0, -1, 0)).intersectObjects(fins, true)[0]).point.y;
    assert.ok(support - bottom > .04, `tail pod must overlap the upper fin volume at ${z}`);
    const junction = new Vector3(x, bottom + .02, z);
    for (const solid of [pods, fins]) for (const direction of [new Vector3(0, 1, 0), new Vector3(0, -1, 0)]) {
      assert.ok(new Raycaster(junction, direction, .00001, 2).intersectObjects(solid, true).length,
        `junction must be inside both solids at ${z}`);
    }
  }
});

test('SPAD synchronized gun roots enter the exported fuselage on both sides', async () => {
  const scene = await sceneFor('archive-spad-xiii');
  const body = required(scene.getObjectsByProperty('type', 'Object3D').find(node => node.userData.archive_component === 'fuselage'));
  const gunPoints: Vector3[] = [];
  scene.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const groups = node.geometry.groups.length ? node.geometry.groups : [{ start: 0, count: indices?.count ?? positions.count, materialIndex: 0 }];
    for (const group of groups) {
      if (materials[group.materialIndex ?? 0]?.name.replace(/\.\d+$/, '') !== 'archive_structure') continue;
      for (let at = group.start; at < group.start + group.count; at++) gunPoints.push(new Vector3().fromBufferAttribute(positions, indices ? indices.getX(at) : at).applyMatrix4(node.matrixWorld));
    }
  });
  for (const side of [-1, 1]) {
    const roots = gunPoints.filter(point => point.x * side > .11 && point.x * side < .18 && Math.abs(point.z + .55) < .025 && point.y > .2 && point.y < .5);
    assert.ok(roots.length >= 6, `${side}: actual gun-root vertices found`);
    assert.ok(roots.some(point =>
      new Raycaster(point, new Vector3(0, 1, 0), .00001, 1).intersectObject(body, true).length &&
      new Raycaster(point, new Vector3(0, -1, 0), .00001, 1).intersectObject(body, true).length),
    `${side}: gun root hangs above the actual airframe`);
  }
});

test('closed naval gunhouse access caps have continuous support from the exported roof', async () => {
  for (const ship of HISTORICAL_SHIPS.filter(ship => !ship.geometry.openGuns && ship.geometry.radar !== 'stealth')) {
    const scene = await sceneFor(historicalModel(ship.id)), mounts: Object3D[] = [];
    scene.traverse(node => { if (node.userData.historic_main || node.name.startsWith('turret_secondary')) mounts.push(node); });
    for (const mount of mounts) {
      const origin = mount.localToWorld(new Vector3(.004, 1, .045));
      const direction = mount.localToWorld(new Vector3(.004, 0, .045)).sub(origin).normalize();
      const crossings = new Map<number, Set<number>>();
      let roof = -Infinity;
      for (const hit of new Raycaster(origin, direction).intersectObject(mount, true)) {
        if (!hit.face || !(hit.object instanceof Mesh)) continue;
        const height = mount.worldToLocal(hit.point.clone()).y;
        if (height < .275 || height > .34) continue;
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
        if (materials[hit.face.materialIndex]?.name.replace(/\.\d+$/, '') === 'fleet_roof' && Math.abs(normal.y) > .9) roof = Math.max(roof, height);
        const key = Math.round(height * 1e6) / 1e6;
        const signs = crossings.get(key) ?? new Set<number>();
        signs.add(Math.sign(normal.y));
        crossings.set(key, signs);
      }
      const levels = [...crossings].sort(([a], [b]) => b - a);
      assert.ok(levels.length >= 2, `${ship.id}/${mount.name}: actual roof and access-cap surfaces found`);
      assert.ok(Number.isFinite(roof), `${ship.id}/${mount.name}: actual supporting roof found`);
      let depth = 0, previous: number | undefined;
      for (const [height, signs] of levels) {
        // Gunhouse roof faces have mixed winding. Use their actual hit plane
        // as support, and sweep the closed cap/pad solids above that plane.
        if (height <= roof + .00001) break;
        if (previous !== undefined && depth === 0) assert.ok(previous - height <= .003,
          `${ship.id}/${mount.name}: access cap floats ${previous - height} above its roof`);
        depth += [...signs].reduce((sum, sign) => sum + sign, 0);
        previous = height;
      }
      if (previous !== undefined && depth === 0) assert.ok(previous - roof <= .003,
        `${ship.id}/${mount.name}: cap ends ${previous - roof} above the supporting roof`);
    }
  }
});
