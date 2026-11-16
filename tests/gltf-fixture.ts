import assert from 'node:assert/strict';

function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}
function array(value: unknown): unknown[] { assert.ok(Array.isArray(value)); return value; }
function string(value: unknown): string { assert.ok(typeof value === 'string'); return value; }
function number(value: unknown): number { assert.ok(typeof value === 'number' && Number.isFinite(value)); return value; }
const numbers = (value: unknown): number[] => array(value).map(number);

/** Read only the glTF fields the asset checks use, validating the binary's JSON. */
export function parseGltf(value: unknown) {
  const json = object(value), asset = object(json.asset);
  return {
    asset: { version: string(asset.version), generator: string(asset.generator) },
    buffers: array(json.buffers).map(value => { const buffer = object(value); return { uri: buffer.uri === undefined ? undefined : string(buffer.uri) }; }),
    accessors: array(json.accessors).map(value => { const accessor = object(value); return { type: string(accessor.type), count: number(accessor.count), min: accessor.min === undefined ? undefined : numbers(accessor.min), max: accessor.max === undefined ? undefined : numbers(accessor.max) }; }),
    meshes: array(json.meshes).map(value => ({ primitives: array(object(value).primitives).map(value => { const primitive = object(value); return { attributes: { POSITION: number(object(primitive.attributes).POSITION) }, indices: primitive.indices === undefined ? undefined : number(primitive.indices) }; }) })),
    nodes: array(json.nodes).map(value => {
      const node = object(value), extras = node.extras === undefined ? undefined : object(node.extras);
      return { name: node.name === undefined ? undefined : string(node.name), translation: node.translation === undefined ? undefined : numbers(node.translation), extras: extras ? { game_part: extras.game_part === undefined ? undefined : string(extras.game_part), game_ruin: extras.game_ruin === undefined ? undefined : string(extras.game_ruin) } : undefined };
    }),
    materials: array(json.materials).map(value => {
      const material = object(value), extensions = material.extensions === undefined ? undefined : object(material.extensions), pbr = material.pbrMetallicRoughness === undefined ? undefined : object(material.pbrMetallicRoughness);
      return { name: string(material.name), extensions: extensions ? { KHR_materials_unlit: extensions.KHR_materials_unlit === undefined ? undefined : object(extensions.KHR_materials_unlit) } : undefined, pbrMetallicRoughness: pbr ? { baseColorFactor: pbr.baseColorFactor === undefined ? undefined : numbers(pbr.baseColorFactor) } : undefined };
    }),
  };
}
