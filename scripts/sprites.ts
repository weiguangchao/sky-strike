import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Box3, Color, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PNG } from 'pngjs';
import { ALL_MODEL_IDS } from '../game/models.ts';
import { HULLS } from '../game/campaign.ts';
import { NEW_ARCHIVE } from '../game/historical-archive.ts';
import { parseModelMetadata } from '../game/model-metadata.ts';

interface Triangle { points: [Vector3, Vector3, Vector3]; color: Color; layer: string }
interface Frame { name: string; x: number; y: number; width: number; height: number; originX: number; originY: number; worldWidth: number; worldHeight: number }
const root = new URL('../', import.meta.url);
const tile = 256;
const light = new Vector3(-.5, 1, .7).normalize();
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

function layerOf(object: Object3D): string {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const part: unknown = node.userData.game_part, ruin: unknown = node.userData.game_ruin;
    if (typeof part === 'string') return `part:${part}`;
    if (typeof ruin === 'string') return `ruin:${ruin}`;
  }
  return 'top';
}

function trianglesOf(object: Object3D): Triangle[] {
  const triangles: Triangle[] = [];
  object.updateMatrixWorld(true);
  object.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const geometry: BufferGeometry = node.geometry;
    const positions = geometry.getAttribute('position'), index = geometry.index;
    const count = index?.count ?? positions.count;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (let at = 0; at < count; at += 3) {
      const group = geometry.groups.find(group => at >= group.start && at < group.start + group.count);
      const material = materials[group?.materialIndex ?? 0];
      if (!(material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial)) throw new Error(`Unsupported material in ${node.name}`);
      const point = (offset: number) => new Vector3().fromBufferAttribute(positions, index ? index.getX(at + offset) : at + offset).applyMatrix4(node.matrixWorld);
      const points: Triangle['points'] = [point(0), point(1), point(2)];
      const normal = new Vector3().subVectors(points[1], points[0]).cross(new Vector3().subVectors(points[2], points[0])).normalize();
      const shade = material instanceof MeshBasicMaterial ? 1 : .63 + Math.max(0, normal.dot(light)) * .62;
      const color = material.color.clone().multiplyScalar(shade).convertLinearToSRGB();
      triangles.push({ points, color, layer: layerOf(node) });
    }
  });
  return triangles;
}

function raster(triangles: Triangle[], direction: Vector3, name: string, y: number, bounds: Box3, horizontal = false): { image: PNG; frame: Frame } {
  const forward = direction.clone().normalize(), upAxis = horizontal ? new Vector3(1, 0, 0) : direction.y > .999 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(upAxis, forward).normalize(), up = new Vector3().crossVectors(forward, right);
  const project = (v: Vector3) => new Vector3(v.dot(right), v.dot(up), v.dot(forward));
  const projected = triangles.map(t => ({ ...t, points: t.points.map(project) }));
  const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
  const scale = (tile - 16) / Math.max(size.x, size.y);
  const image = new PNG({ width: tile, height: tile });
  const depth = new Float64Array(tile * tile).fill(-Infinity);
  for (const triangle of projected) {
    const points = triangle.points.map(p => ({ x: (p.x - center.x) * scale + tile / 2, y: tile / 2 - (p.y - center.y) * scale, z: p.z }));
    const [a, b, c] = points;
    if (!a || !b || !c) throw new Error('Triangle must have three points');
    const edge = (p: typeof a, q: typeof a, x: number, y: number) => (x - p.x) * (q.y - p.y) - (y - p.y) * (q.x - p.x);
    const area = edge(a, b, c.x, c.y);
    if (Math.abs(area) < 1e-8) continue;
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))), maxX = Math.min(tile - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))), maxY = Math.min(tile - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const wa = edge(b, c, px + .5, py + .5) / area, wb = edge(c, a, px + .5, py + .5) / area, wc = 1 - wa - wb;
      if (wa < 0 || wb < 0 || wc < 0) continue;
      const z = wa * a.z + wb * b.z + wc * c.z, at = py * tile + px;
      if (z <= (depth[at] ?? -Infinity)) continue;
      depth[at] = z;
      image.data[at * 4] = Math.round(Math.min(1, triangle.color.r) * 255);
      image.data[at * 4 + 1] = Math.round(Math.min(1, triangle.color.g) * 255);
      image.data[at * 4 + 2] = Math.round(Math.min(1, triangle.color.b) * 255);
      image.data[at * 4 + 3] = 255;
    }
  }
  let left = tile - 1, top = tile - 1, rightEdge = 0, bottom = 0;
  for (let py = 0; py < tile; py++) for (let px = 0; px < tile; px++) if (image.data[(py * tile + px) * 4 + 3]) {
    left = Math.min(left, px); top = Math.min(top, py); rightEdge = Math.max(rightEdge, px); bottom = Math.max(bottom, py);
  }
  if (rightEdge < left) { left = top = rightEdge = bottom = 0; }
  const width = rightEdge - left + 1, height = bottom - top + 1;
  return { image, frame: { name, x: left, y: y + top, width, height, originX: (tile / 2 - center.x * scale - left) / width, originY: (tile / 2 + center.y * scale - top) / height, worldWidth: width / scale, worldHeight: height / scale } };
}

function projectionBounds(triangles: Triangle[], direction: Vector3, horizontal = false): Box3 {
  const forward = direction.clone().normalize(), upAxis = horizontal ? new Vector3(1, 0, 0) : direction.y > .999 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(upAxis, forward).normalize(), up = new Vector3().crossVectors(forward, right);
  const bounds = new Box3();
  for (const triangle of triangles) for (const point of triangle.points) bounds.expandByPoint(new Vector3(point.dot(right), point.dot(up), point.dot(forward)));
  return bounds;
}

await mkdir(new URL('game/public/assets/sprites/', root), { recursive: true });
const assets = [];
for (const id of ALL_MODEL_IDS) {
  const bytes = await readFile(new URL(`game/public/assets/models/${id}.glb`, root));
  const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const triangles = trianglesOf(model.scene), intact = triangles.filter(t => !t.layer.startsWith('ruin:'));
  let combatStretch = 1;
  const propellers: { x: number; y: number }[] = [];
  model.scene.traverse(node => {
    const metadata = parseModelMetadata(node.userData);
    if (metadata.combatStretch !== undefined) combatStretch = metadata.combatStretch;
    if (node.name.startsWith('propeller_')) { const position = node.getWorldPosition(new Vector3()); propellers.push({ x: position.x, y: position.z }); }
  });
  const direction = new Vector3(0, 1, 0), previewDirection = new Vector3(2, 8, 4);
  const bounds = projectionBounds(intact, direction);
  const elevation = (layer: string) => Math.max(...triangles.filter(t => t.layer === layer).flatMap(t => t.points.map(point => point.y)));
  const layers = ['top', ...[...new Set(triangles.map(t => t.layer).filter(layer => layer !== 'top'))].sort((a, b) => elevation(a) - elevation(b))];
  const sheet = new PNG({ width: tile, height: tile * (layers.length + 1) });
  const frames: Frame[] = [];
  for (const [index, layer] of layers.entries()) {
    const { image, frame } = raster(triangles.filter(t => t.layer === layer), direction, layer, index * tile, bounds);
    PNG.bitblt(image, sheet, 0, 0, tile, tile, 0, index * tile); frames.push(frame);
  }
  const naval = id.startsWith('historic-') || ['carrier', ...Object.keys(HULLS)].includes(id) || NEW_ARCHIVE.some(entry => entry.modelId === id && entry.category === 'submarine');
  const preview = raster(intact, previewDirection, 'preview', layers.length * tile, projectionBounds(intact, previewDirection, naval), naval);
  PNG.bitblt(preview.image, sheet, 0, 0, tile, tile, 0, layers.length * tile); frames.push(preview.frame);
  let cursorX = 1, cursorY = 1, rowHeight = 0;
  const packedFrames = frames.map(frame => {
    if (cursorX + frame.width + 1 > tile) { cursorX = 1; cursorY += rowHeight + 2; rowHeight = 0; }
    const packed = { ...frame, x: cursorX, y: cursorY };
    cursorX += frame.width + 2; rowHeight = Math.max(rowHeight, frame.height);
    return packed;
  });
  const packed = new PNG({ width: tile, height: 2 ** Math.ceil(Math.log2(cursorY + rowHeight + 1)) });
  for (const [index, frame] of frames.entries()) {
    const destination = packedFrames[index];
    if (!destination) throw new Error('Missing packed frame');
    PNG.bitblt(sheet, packed, frame.x, frame.y, frame.width, frame.height, destination.x, destination.y);
  }
  const output = PNG.sync.write(packed, { colorType: 6 });
  await writeFile(new URL(`game/public/assets/sprites/${id}.png`, root), output);
  assets.push({ id, file: `${id}.png`, sourceHash: hash(bytes), hash: hash(output), bytes: output.length, combatStretch, propellers, frames: packedFrames });
}
await writeFile(new URL('game/sprite-manifest.json', root), JSON.stringify({ version: 1, generatorHash: hash(await readFile(new URL('scripts/sprites.ts', root))), assets }) + '\n');
console.info(JSON.stringify({ sprites: assets.length, bytes: assets.reduce((total, asset) => total + asset.bytes, 0) }));
