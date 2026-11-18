import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Vector3 } from 'three';
import { PNG } from 'pngjs';
import { VEHICLE_MODEL_IDS } from '../game/models.ts';
import { ARCHIVE } from '../game/historical-archive.ts';
import manifest from '../game/sprite-manifest.json';
import { currentRevisions } from './model-audit.ts';
import { trianglesOf, projectionBounds, raster } from './sprites.ts';

const root = new URL('../', import.meta.url);
const output = new URL('../.artifacts/model-rebuild/evidence/', import.meta.url);
await mkdir(output, { recursive: true });
const revisions = await currentRevisions();
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const uri = (bytes: Uint8Array) => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
const rows: string[] = [], index = [];
const style = `<style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#162936;color:#f3e5b4;font:14px system-ui}h1{font-size:22px;margin:0 0 8px}p{color:#b3c2bd;margin:0 0 16px}.row,.head{display:grid;grid-template-columns:170px 210px 210px 210px 130px 210px;align-items:center;gap:6px}.row{height:156px;border-top:1px solid #45605d}.row img{width:100%;height:148px;object-fit:contain;image-rendering:pixelated}.row .front{height:110px}.row .live{width:192px;height:120px;margin:auto;border:1px solid #45605d;background:#203b43}.name{overflow-wrap:anywhere}small{display:block;color:#a4b6ae;margin-top:6px;font-size:11px}.head{font-weight:bold;margin-bottom:8px}.head>*{text-align:center}.head>:first-child{text-align:left}</style>`;
try {
  for (const [at, id] of VEHICLE_MODEL_IDS.entries()) {
    const bytes = await readFile(new URL(`game/public/assets/models/${id}.glb`, root));
    const model = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    const intact = trianglesOf(model.scene).filter(triangle => !triangle.layer.startsWith('ruin:'));
    const entry = ARCHIVE.find(item => item.modelId === id);
    const naval = entry?.category !== 'aircraft' && (entry !== undefined || ['carrier', 'patrol-boat', 'destroyer', 'cruiser', 'battleship', 'fleet-carrier', 'transport'].includes(id));
    const views = [
      { name: 'hero', direction: naval ? new Vector3(7, 5, 8) : new Vector3(5, 6, 7), horizontal: false },
      { name: 'plan', direction: new Vector3(0, 1, 0), horizontal: naval },
      { name: 'profile', direction: new Vector3(naval ? 1 : -1, .001, 0), horizontal: false },
      { name: 'front', direction: new Vector3(0, .001, -1), horizontal: false },
    ];
    const images = [];
    for (const view of views) {
      const { image, frame } = raster(intact, view.direction, view.name, 0, projectionBounds(intact, view.direction, view.horizontal), view.horizontal, 640);
      const png = PNG.sync.write(image);
      await writeFile(new URL(`${id}-${view.name}.png`, output), png);
      const crop = new PNG({ width: frame.width, height: frame.height });
      PNG.bitblt(image, crop, frame.x, frame.y, frame.width, frame.height, 0, 0);
      images.push(`<img class="${view.name}" src="${uri(PNG.sync.write(crop))}">`);
    }
    const rearDirection = new Vector3(0, .001, 1);
    const rear = raster(intact, rearDirection, 'rear', 0, projectionBounds(intact, rearDirection), false, 640);
    await writeFile(new URL(`${id}-rear.png`, output), PNG.sync.write(rear.image));
    const sprite = manifest.assets.find(asset => asset.id === id);
    const frame = sprite?.frames.find(frame => frame.name === 'preview');
    if (!sprite || !frame || sprite.sourceHash !== hash(bytes)) throw new Error(`${id}: sprites must be rebuilt before evidence`);
    const sheet = PNG.sync.read(await readFile(new URL(`game/public/assets/sprites/${sprite.file}`, root)));
    const live = new PNG({ width: 192, height: 120 });
    const scale = Math.min(192 * .88 / frame.width, 120 * .88 / frame.height);
    const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const source = ((frame.y + Math.min(frame.height - 1, Math.floor(y / height * frame.height))) * sheet.width + frame.x + Math.min(frame.width - 1, Math.floor(x / width * frame.width))) * 4;
      const target = ((Math.round((120 - height) / 2) + y) * 192 + Math.round((192 - width) / 2) + x) * 4;
      sheet.data.copy(live.data, target, source, source + 4);
    }
    const preview = PNG.sync.write(live);
    await writeFile(new URL(`${id}-live.png`, output), preview);
    const revision = revisions[id];
    rows.push(`<div class="row"><div class="name">${id}<small>${entry?.name ?? '基础作战载具'}<br>${revision?.slice(0, 16)}</small></div>${images.join('')}<img class="live" src="${uri(preview)}"></div>`);
    index.push({ id, revision, sourceHash: hash(bytes), spriteHash: sprite.hash, triangles: intact.length, board: Math.floor(at / 15) + 1 });
    if (rows.length === 15 || at === VEHICLE_MODEL_IDS.length - 1) {
      const board = String(Math.floor(at / 15) + 1).padStart(2, '0');
      const html = `${style}<h1>Sky Strike · 模型实物审阅 ${board}</h1><p>全库 ${VEHICLE_MODEL_IDS.length} 个载具；640px 源几何四视图 + 图鉴原生 192×120 PNG。舰船／潜艇舰艏朝右上，顶／侧测试图向右。</p><div class="head"><span>型号 / 版本</span><span>源几何斜视</span><span>源几何顶视</span><span>源几何侧视</span><span>源几何正视</span><span>实际图鉴 PNG</span></div>${rows.join('')}`;
      await writeFile(new URL(`board-${board}.html`, output), html);
      await page.setContent(html);
      await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())); });
      await page.screenshot({ path: fileURLToPath(new URL(`board-${board}.png`, output)), fullPage: true });
      console.info(JSON.stringify({ board, models: rows.length }));
      rows.length = 0;
    }
  }
  await writeFile(new URL('index.json', output), JSON.stringify({ generated: new Date().toISOString(), models: index }, null, 2) + '\n');
} finally { await browser.close(); }
