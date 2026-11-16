import { required } from '../support.ts';
import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { ARCHIVE, NEW_ARCHIVE } from '../../game/historical-archive.ts';

async function openArchive(page: import('@playwright/test').Page) {
  await page.goto('/'); await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click(); await page.locator('#help-tab-archive').click();
}
async function ready(page: import('@playwright/test').Page) { await expect(page.locator('#archive-status')).toHaveText(''); }

async function expectDialogFits(page: import('@playwright/test').Page, context: string) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const layout = await page.locator('#help-dialog').evaluate(dialog => ({ h: dialog.clientHeight, sh: dialog.scrollHeight, w: dialog.clientWidth, sw: dialog.scrollWidth, rect: dialog.getBoundingClientRect().toJSON(), elements: [...dialog.querySelectorAll('button,select,a,p,h3')].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().toJSON()) }));
  expect(layout.sh, `${context}: vertical overflow`).toBeLessThanOrEqual(layout.h);
  expect(layout.sw, `${context}: horizontal overflow`).toBeLessThanOrEqual(layout.w);
  for (const rect of layout.elements) {
    expect(rect.left).toBeGreaterThanOrEqual(layout.rect.left);
    expect(rect.right).toBeLessThanOrEqual(layout.rect.right);
    expect(rect.top).toBeGreaterThanOrEqual(layout.rect.top);
    expect(rect.bottom).toBeLessThanOrEqual(layout.rect.bottom);
  }
}

test('new aircraft and submarine models load lazily, filter, wrap and expose real local previews', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const requested: string[] = [], errors: string[] = [];
  page.on('request', request => { if (request.url().includes('/archive-') && request.url().endsWith('.png')) requested.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await expect(page.locator('#start-button')).toBeEnabled();
  expect(requested).toHaveLength(0);
  await page.locator('#help-button').click(); await page.locator('#help-tab-archive').click(); await ready(page);
  await expect(page.locator('#archive-entry option')).toHaveCount(ARCHIVE.length);
  expect(await page.locator('#archive-entry option').evaluateAll(options => new Set(options.map(option => option.getAttribute('value'))).size)).toBe(ARCHIVE.length);
  await expect(page.locator('#help-dialog').getByRole('tab')).toHaveText(['操作', '作战单位', '战役', '历史图鉴']);
  await page.locator('#help-tab-archive').focus();
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#help-tab-controls')).toBeFocused();
  await page.keyboard.press('End'); await expect(page.locator('#help-tab-archive')).toBeFocused();
  await ready(page);
  for (const category of ['aircraft', 'submarine']) {
    await page.locator('#archive-category').selectOption(category); await ready(page);
    const entries = NEW_ARCHIVE.filter(entry => entry.category === category);
    await expect(page.locator('#archive-entry option')).toHaveCount(entries.length);
    for (const entry of entries) {
      await page.locator('#archive-entry').selectOption(entry.id); await ready(page);
      await expect(page.locator('#archive-name')).toHaveText(entry.name);
      await expect(page.locator('#archive-source')).toHaveAttribute('href', entry.source);
      await expect(page.locator('#archive-review')).not.toBeEmpty();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const screenshot = await page.locator('#intel-canvas').screenshot();
      const image = PNG.sync.read(screenshot);
      let visible = 0;
      for (let at = 0; at < image.data.length; at += 4) if (required(image.data[at]) + required(image.data[at + 1]) + required(image.data[at + 2]) > 270) visible++;
      expect(visible, `${entry.id}: exported sprites must be visible`).toBeGreaterThan(100);
      await writeFile(testInfo.outputPath(`${entry.modelId}-handbook.png`), screenshot);
    }
    await page.locator('#archive-next').click(); await ready(page);
    await expect(page.locator('#archive-name')).toHaveText(required(entries[0]).name);
  }
  for (const era of ['ww1', 'interwar-ww2', 'cold-war', 'modern']) {
    await page.locator('#archive-era').selectOption(era); await ready(page);
    await expect(page.locator('#archive-entry option')).not.toHaveCount(0);
  }
  await page.locator('#archive-country').selectOption('se');
  await expect(page.locator('#archive-name')).toHaveText('没有符合条件的型号');
  await expect(page.locator('#archive-next')).toBeDisabled();
  await page.locator('#help-tab-intel').click();
  await expect(page.locator('#intel-name')).toHaveText('轻型战斗机');
  expect(errors).toEqual([]);
});

test('archive retries failed downloads and discards late downloads after a tab switch', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let fail = true;
  await page.route('**/archive-sopwith-camel.png', async route => { if (fail) await route.abort(); else await route.continue(); });
  await openArchive(page); await page.locator('#archive-category').selectOption('aircraft');
  await expect(page.locator('#archive-status')).toContainText('加载失败');
  await expect(page.locator('#help-ready')).toHaveText('重试加载');
  fail = false; await page.locator('#help-ready').click(); await ready(page);
  await page.locator('#close-help').click(); await page.unroute('**/archive-sopwith-camel.png');
  const { promise: gate, resolve: release } = Promise.withResolvers<void>();
  await page.route('**/archive-sopwith-camel.png', async route => { await gate; await route.continue(); });
  await page.reload(); await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click(); await page.locator('#help-tab-archive').click();
  await page.locator('#archive-category').selectOption('aircraft');
  await expect(page.locator('#archive-status')).toHaveText('图像载入中');
  await page.locator('#help-tab-intel').click();
  const before = await page.locator('#intel-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const response = page.waitForResponse('**/archive-sopwith-camel.png'); release(); await response;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.locator('#intel-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
});

test('four handbook tabs and archive controls fit small portrait and landscape windows', async ({ page }) => {
  await openArchive(page); await page.locator('#archive-category').selectOption('aircraft'); await ready(page);
  for (const [width, height] of [[320, 568], [350, 568], [360, 568], [390, 510], [568, 320], [740, 280]] as const) {
    await page.setViewportSize({ width, height });
    for (const id of ['sopwith-camel', 'a6m5']) {
      await page.locator('#archive-entry').selectOption(id); await ready(page);
      await expectDialogFits(page, `${id} ${width}×${height}`);
    }
  }
});

test('historical notes and supplemental sources are available by touch and keyboard in short viewports', async ({ page }) => {
  test.setTimeout(90_000);
  await openArchive(page); await ready(page);
  for (const [width, height] of [[320, 568], [320, 420], [390, 510], [568, 320], [740, 280]] as const) {
    await page.setViewportSize({ width, height });
    for (const id of ['iowa', 'f16a', 'sopwith-camel', 'gripen-c', 'nautilus', 'oberon', 'f86a', 'mirage2000c', 'spitfire-ia', 'p51d', 'gato', 'a6m5', 'mig21pf', 'rafale-c']) {
      const entry = required(ARCHIVE.find(item => item.id === id));
      await page.locator('#archive-entry').selectOption(id); await ready(page);
      const infoButton = page.locator(entry.category === 'surface' ? '#archive-info' : '#help-ready');
      await expect(infoButton).toHaveText('资料说明');
      await infoButton.focus(); await page.keyboard.press('Enter');
      await expect(page.locator('#archive-details-title')).toBeFocused();
      await expect(page.locator('#archive-note')).toHaveText(entry.note);
      const references = [...new Set([entry.source, ...entry.references])];
      const links = page.locator('#archive-reference-list a');
      await expect(links).toHaveCount(references.length);
      for (const [index, url] of references.entries()) await expect(links.nth(index)).toHaveAttribute('href', url);
      await page.keyboard.press('Tab'); await expect(links.first()).toBeFocused();
      await expectDialogFits(page, `${id} details ${width}×${height}`);
      await page.locator('#help-ready').click();
      await expect(page.locator('#archive-details')).toBeHidden();
      await expect(page.locator('#archive-name')).toHaveText(entry.name);
      await expect(infoButton).toHaveText('资料说明');
      await expect(infoButton).toBeFocused();
    }
  }
});

test('review evidence renders both 2D views of each new sprite', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/'); await expect(page.locator('#start-button')).toBeEnabled();
  const moduleURL = `/@fs${fileURLToPath(new URL('../../scripts/sprite-views.ts', import.meta.url))}`;
  const evidenceDir = testInfo.outputPath('council-views'); await mkdir(evidenceDir, { recursive: true });
  for (const entry of NEW_ARCHIVE) {
    const views: string[] = await page.evaluate(async ({ moduleURL, modelId }) => {
      const { spriteViews } = await import(moduleURL); return spriteViews(modelId);
    }, { moduleURL, modelId: entry.modelId });
    expect(views).toHaveLength(2);
    const sheet = new PNG({ width: 1280, height: 400 });
    for (const [index, data] of views.entries()) {
      const frame = PNG.sync.read(Buffer.from(required(data.split(',')[1]), 'base64'));
      PNG.bitblt(frame, sheet, 0, 0, frame.width, frame.height, (index % 2) * 640, Math.floor(index / 2) * 400);
    }
    await writeFile(`${evidenceDir}/${entry.modelId}.png`, PNG.sync.write(sheet));
  }
});
