import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import manifest from '../game/sprite-manifest.json';
import { ALL_MODEL_IDS, MODEL_IDS } from '../game/models.ts';

const root = new URL('../', import.meta.url);
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

export async function checkSprites(): Promise<void> {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.generatorHash, hash(await readFile(new URL('scripts/sprites.ts', root))), 'Sprite generator changed: run npm run sprites:build');
  assert.deepEqual(manifest.assets.map(asset => asset.id), ALL_MODEL_IDS);
  let total = 0, initial = 0;
  for (const asset of manifest.assets) {
    const source = await readFile(new URL(`game/public/assets/models/${asset.id}.glb`, root));
    assert.equal(asset.sourceHash, hash(source), `${asset.id}: source changed; rebuild sprites`);
    const bytes = await readFile(new URL(`game/public/assets/sprites/${asset.file}`, root));
    assert.equal(asset.hash, hash(bytes), `${asset.id}: sprite hash`);
    assert.equal(asset.bytes, bytes.length);
    total += bytes.length;
    if (MODEL_IDS.some(id => id === asset.id)) initial += bytes.length;
    const image = PNG.sync.read(bytes);
    assert.equal(image.width, 256);
    for (const name of ['top', 'preview']) assert.ok(asset.frames.some(frame => frame.name === name), `${asset.id}: missing ${name}`);
    for (const frame of asset.frames) {
      assert.ok(frame.width > 0 && frame.height > 0 && frame.x >= 0 && frame.y >= 0 && frame.x + frame.width <= image.width && frame.y + frame.height <= image.height, `${asset.id}/${frame.name}: frame outside sheet`);
      assert.ok([frame.originX, frame.originY, frame.worldWidth, frame.worldHeight].every(Number.isFinite));
      assert.ok(frame.worldWidth > 0 && frame.worldHeight > 0);
      let visible = 0;
      for (let y = frame.y; y < frame.y + frame.height; y++) for (let x = frame.x; x < frame.x + frame.width; x++) if (image.data[(y * image.width + x) * 4 + 3]) visible++;
      assert.ok(visible > 0, `${asset.id}/${frame.name}: empty sprite`);
      if (frame.name.startsWith('part:') && asset.id !== 'carrier') assert.ok(asset.frames.some(candidate => candidate.name === frame.name.replace('part:', 'ruin:')), `${asset.id}: missing wreck layer`);
    }
    assert.ok(bytes.length < 100_000, `${asset.id}: sprite exceeds mobile budget`);
  }
  assert.ok(initial < 600_000, 'Startup sprite download exceeds 600 KB');
  assert.ok(total < 4_000_000, 'Sprite library exceeds 4 MB');
  console.info(JSON.stringify({ sprites: manifest.assets.length, initialBytes: initial, totalBytes: total }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await checkSprites();
