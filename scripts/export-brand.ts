import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const directory = 'game/public/assets/brand';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});

try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { name, width, height, scale } of [
    { name: 'sky-strike-logo', width: 304, height: 64, scale: 4 },
    { name: 'sky-strike-mark', width: 64, height: 64, scale: 8 },
    { name: 'sky-strike-logo-small', width: 152, height: 32, scale: 4 },
    { name: 'sky-strike-mark-small', width: 32, height: 32, scale: 8 },
  ]) {
    const svg = await readFile(`${directory}/${name}.svg`, 'utf8');
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>
      html, body { margin: 0; width: ${width}px; height: ${height}px; background: transparent; }
      svg { display: block; width: ${width}px; height: ${height}px; }
    </style>${svg}`);
    await page.evaluate(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });

    const source = PNG.sync.read(await page.screenshot({ omitBackground: true }));
    const output = new PNG({ width: width * scale, height: height * scale });
    for (let y = 0; y < output.height; y++) {
      for (let x = 0; x < output.width; x++) {
        const offset = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
        source.data.copy(output.data, (y * output.width + x) * 4, offset, offset + 4);
      }
    }
    await writeFile(`${directory}/${name}.png`, PNG.sync.write(output));
    console.info(JSON.stringify({ asset: name, width: output.width, height: output.height, sampling: 'nearest' }));
  }
} finally {
  await browser.close();
}
