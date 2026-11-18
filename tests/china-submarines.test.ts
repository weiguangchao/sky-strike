import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, DoubleSide, Mesh, Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { required } from './support.ts';
const root = new URL('../game/public/assets/models/', import.meta.url);
function components(root: Object3D, name: string) {
  const nodes: Object3D[] = [];
  root.traverse(node => { if (node.userData.archive_component === name) nodes.push(node); });
  return nodes;
}
function vertices(root: Object3D) {
  const points: Vector3[] = [];
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const positions = node.geometry.getAttribute('position');
    for (let at = 0; at < positions.count; at++) points.push(new Vector3().fromBufferAttribute(positions, at).applyMatrix4(node.matrixWorld));
  });
  return points;
}
function inside(point: Vector3, solids: Object3D[]) {
  return solids.some(solid => [new Vector3(0, 1, 0), new Vector3(0, -1, 0)].every(direction =>
    new Set(new Raycaster(point, direction, .00001, 20).intersectObject(solid, true).map(hit => hit.distance.toFixed(5))).size % 2 === 1));
}
test('Chinese submarine class representatives retain dimensions and join sails, planes, shafts and closed missile hatches', async () => {
for (const spec of [{ id: 'archive-type-093-early', length: 107, beam: 11, planes: 'sail', shafts: 1 }, { id: 'archive-type-092-refit', length: 120, beam: 10.6, planes: 'sail', shafts: 1 }, { id: 'archive-type-091-late', length: 98, beam: 9, planes: 'sail', shafts: 1 }, { id: 'archive-type-094-early', length: 137, beam: 12.5, planes: 'sail', shafts: 1 }, { id: 'archive-type-035g', length: 76, beam: 7.6, planes: 'bow', shafts: 2 }, { id: 'archive-type-039-original', length: 76.6, beam: 8.4, planes: 'sail', shafts: 1 }]) {
  const bytes = await readFile(new URL(`${spec.id}.glb`, root));
  const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
  scene.updateMatrixWorld(true);
  scene.traverse(node => { if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide; });
  const hull = required(components(scene, 'submarine-hull')[0]);
  const sail = required(components(scene, 'sail')[0]);
  const casing = components(scene, 'missile-casing');
  const solids = [hull, ...components(scene, 'deck-casing'), ...components(scene, 'fairwater'), ...casing];
  const size = new Box3().setFromObject(hull).getSize(new Vector3());
  assert.ok(Math.abs(size.z * spec.length / 10 - spec.length) < .01, 'selected late/early hull length');
  assert.ok(Math.abs(size.x * spec.length / 10 - spec.beam) < .02, 'actual hull beam, excluding planes');
  assert.ok(vertices(sail).some(point => inside(point, solids)), 'sail foot enters an actual hull or casing volume');
  assert.equal(components(scene, 'diving-plane').length, 2);
  for (const plane of components(scene, 'diving-plane')) assert.ok(vertices(plane).some(point => inside(point, spec.planes === 'sail' ? [sail] : [hull])), 'each diving plane enters its selected sail or bow mount');
  assert.equal(components(scene, 'propulsor').length, spec.shafts);
  for (const propulsor of components(scene, 'propulsor')) assert.ok(vertices(propulsor).some(point => inside(point, [hull])), `${spec.id}: propulsor shaft enters stern body`);
  for (const fin of components(scene, 'stern-rudder')) assert.ok(vertices(fin).some(point => inside(point, [hull])), 'each stern fin enters tapered hull');
  const hatches = components(scene, 'missile-hatch');
  if (spec.id === 'archive-type-094-early' || spec.id === 'archive-type-092-refit') {
    assert.equal(casing.length, 1); assert.equal(hatches.length, 12);
    assert.ok(vertices(required(casing[0])).some(point => inside(point, [hull])), 'ballistic-missile fairing joins the pressure-hull exterior');
    for (const hatch of hatches) assert.ok(vertices(hatch).some(point => inside(point, casing)), 'every closed lid enters the actual missile casing');
    const rows = new Set(hatches.map(hatch => new Box3().setFromObject(hatch).getCenter(new Vector3()).z.toFixed(4)));
    assert.equal(rows.size, 6, 'six pairs, not six total missiles');
  } else assert.equal(hatches.length, 0);

}
});
