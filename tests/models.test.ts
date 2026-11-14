import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VISUAL_SIGNALS } from '../game/visual-style.ts';

interface Gltf {
  asset: { version: string; generator: string };
  buffers: { uri?: string }[];
  accessors: { type: string; count: number; min?: number[]; max?: number[] }[];
  meshes: { primitives: { attributes: { POSITION: number }; indices?: number }[] }[];
  nodes: { name?: string; translation?: number[] }[];
  materials: { name: string; extensions?: { KHR_materials_unlit?: object }; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
}

const directory = new URL('../game/public/assets/models/', import.meta.url);
const ids = ['falcon','swift','turtle','scout','dart','gunship','boss','boss-final','carrier','island','pickup-xp','pickup-health','pickup-bomb','enemy-round','enemy-aimed'];

async function asset(id: string): Promise<{ json: Gltf; bytes: number }> {
  const buffer = await readFile(new URL(`${id}.glb`, directory));
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, `${id}: GLB magic`);
  assert.equal(buffer.readUInt32LE(4), 2, `${id}: glTF version`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${id}: complete binary`);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, `${id}: JSON chunk`);
  const json = JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString()) as Gltf;
  return { json, bytes: buffer.length };
}

test('all Blender assets contain embedded, finite 3D geometry within the mobile size budget', async () => {
  let total = 0;
  for (const id of ids) {
    const { json, bytes } = await asset(id);
    total += bytes;
    assert.equal(json.asset.version, '2.0');
    assert.match(json.asset.generator, /Blender/);
    assert.ok(json.buffers.every(buffer => !buffer.uri), `${id}: external resource dependency`);
    assert.ok(json.meshes.length > 0);
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      const positions = json.accessors[primitive.attributes.POSITION];
      assert.ok(positions.count > 2, `${id}: missing mesh geometry`);
      assert.ok(positions.min?.every(Number.isFinite) && positions.max?.every(Number.isFinite));
    }
    const origin = json.nodes.find(node => node.name === id);
    assert.ok(origin, `${id}: model origin node`);
    assert.ok(!origin.translation || origin.translation.every(value => Math.abs(value) < .001), `${id}: exported workbench offset`);
    assert.ok(bytes < 400_000, `${id}: excessive model payload`);
  }
  assert.ok(total < 1_500_000, 'model library exceeds mobile download budget');
});

test('single, twin, four and six engine aircraft keep separate animatable propeller nodes', async () => {
  for (const [id, engines] of Object.entries({ falcon:1, swift:1, turtle:2, scout:1, dart:1, gunship:2, boss:4, 'boss-final':6 })) {
    const { json } = await asset(id);
    assert.equal(json.nodes.filter(node => node.name?.startsWith('propeller_')).length, engines, id);
  }
});

test('Blender gameplay markers preserve semantic colors without lighting or tone mapping', async () => {
  for (const [key, signal] of Object.entries(VISUAL_SIGNALS)) {
    const { json } = await asset(signal.model);
    const material = json.materials.find(material => material.name === `signal_${key}`);
    assert.ok(material?.extensions?.KHR_materials_unlit, `${key}: marker must remain unlit`);
    const encoded = material.pbrMetallicRoughness!.baseColorFactor!;
    const rgb = [1,3,5].map(index => parseInt(signal.color.slice(index,index+2),16) / 255);
    const expected = rgb.map(value => value <= .04045 ? value / 12.92 : ((value+.055)/1.055)**2.4);
    expected.forEach((value,index) => assert.ok(Math.abs(encoded[index]-value)<.0001, `${key}: Blender and HUD colors differ`));
    assert.ok(json.materials.some(material => material.name === 'signal_ink'));
    assert.ok(json.materials.some(material => material.name === 'signal_white'));
  }
});
