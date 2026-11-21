import { required } from '../support.ts';
import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { ARCHIVE, HANDBOOK_ARCHIVE, NEW_ARCHIVE } from '../../game/historical-archive.ts';

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
  await expect(page.locator('#archive-entry option')).toHaveCount(HANDBOOK_ARCHIVE.length);
  expect(await page.locator('#archive-entry option').evaluateAll(options => new Set(options.map(option => option.getAttribute('value'))).size)).toBe(HANDBOOK_ARCHIVE.length);
  await expect(page.locator('#archive-review')).toHaveCount(0);
  await expect(page.locator('#archive-category option')).toHaveText(['全部类别', '飞机', '潜艇', '航空母舰', '巡洋舰', '驱逐舰', '战列舰']);
  await expect(page.locator('#archive-category optgroup')).toHaveCount(0);
  await expect(page.locator('#archive-entry option[value="pt-109"], #archive-entry option[value="john-w-brown"]')).toHaveCount(0);
  await expect(page.locator('#help-dialog').getByRole('tab')).toHaveText(['操作', '战役', '图鉴']);
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
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const screenshot = await page.locator('#archive-canvas').screenshot();
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
  await page.locator('#archive-country').selectOption('cn');
  await page.locator('#archive-era').selectOption('ww1');
  await expect(page.locator('#archive-name')).toHaveText('没有符合条件的型号');
  await expect(page.locator('#archive-next')).toBeDisabled();
  await page.locator('#help-tab-campaign').click();
  await expect(page.locator('#campaign-name')).toHaveText('黑尔戈兰湾海战');
  expect(errors).toEqual([]);
});

test('archive retries failed downloads and discards late downloads after a tab switch', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let fail = true;
  await page.route('**/archive-sopwith-camel.png', async route => { if (fail) await route.abort(); else await route.continue(); });
  await openArchive(page); await page.locator('#archive-category').selectOption('aircraft');
  await page.locator('#archive-entry').selectOption('sopwith-camel');
  await expect(page.locator('#archive-status')).toContainText('加载失败');
  await expect(page.locator('#help-dialog .primary-button')).toHaveCount(0);
  fail = false;
  await page.locator('#help-tab-campaign').click();
  await page.locator('#help-tab-archive').click(); await ready(page);
  await expect(page.locator('#archive-entry')).toHaveValue('sopwith-camel');
  await expect(page.locator('#archive-canvas')).toBeVisible();
  await page.locator('#close-help').click(); await page.unroute('**/archive-sopwith-camel.png');
  const { promise: gate, resolve: release } = Promise.withResolvers<void>();
  await page.route('**/archive-sopwith-camel.png', async route => { await gate; await route.continue(); });
  await page.reload(); await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click(); await page.locator('#help-tab-archive').click();
  await page.locator('#archive-category').selectOption('aircraft');
  await page.locator('#archive-entry').selectOption('sopwith-camel');
  await expect(page.locator('#archive-status')).toHaveText('图像载入中');
  await page.locator('#help-tab-campaign').click();
  await expect(page.locator('#archive-canvas')).toBeHidden();
  const before = await page.locator('#archive-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const response = page.waitForResponse('**/archive-sopwith-camel.png'); release(); await response;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.locator('#archive-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
});

test('served-country filters share one class model and label its original appearance', async ({ page }) => {
  await openArchive(page);
  await page.locator('#archive-category').selectOption('submarine');
  for (const [width, height] of [[320, 568], [740, 280]] as const) {
    await page.setViewportSize({ width, height });
    for (const spec of [{ country: 'jp', id: 'gato', nation: '美国' }, { country: 'it', id: 'type-212a', nation: '德国' }, { country: 'ru', id: 'type-viic', nation: '德国' }]) {
      await page.locator('#archive-country').selectOption(spec.country);
      await expect(page.locator(`#archive-entry option[value="${spec.id}"]`)).toHaveCount(1);
      await page.locator('#archive-entry').selectOption(spec.id); await ready(page);
      await expect(page.locator('#archive-nation')).toHaveText(spec.nation);
      await expect(page.locator('#archive-operators')).toContainText('曾服役：');
      await expectDialogFits(page, `${spec.id} operator ${width}×${height}`);
    }
  }
});

test('handbook tabs and archive controls fit small portrait and landscape windows', async ({ page }) => {
  await openArchive(page); await page.locator('#archive-category').selectOption('aircraft'); await ready(page);
  for (const [width, height] of [[320, 568], [350, 568], [360, 568], [390, 510], [568, 320], [740, 280]] as const) {
    await page.setViewportSize({ width, height });
    for (const id of ['sopwith-camel', 'a6m5', 'cg4a']) {
      await page.locator('#archive-entry').selectOption(id); await ready(page);
      await expectDialogFits(page, `${id} ${width}×${height}`);
    }
  }
});

test('ship metadata, page number and title stay aligned when descriptions wrap', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openArchive(page);
  await page.evaluate(() => document.fonts.ready);
  const layouts = [];
  for (const label of ['哥萨克', '贝尔法斯特', '光辉', '密苏里', '巴尔的摩', '大和']) {
    await page.locator('#archive-entry').selectOption({ label }); await ready(page);
    // The ruled list fills the column to one height; the paragraph fallback is where descriptions wrap to different heights.
    await page.locator('#archive-card').evaluate((card: HTMLElement) => { card.dataset.features = 'inline'; });
    const meta = required(await page.locator('.fleet-meta').boundingBox());
    const role = required(await page.locator('#archive-role').boundingBox());
    const service = required(await page.locator('#archive-service').boundingBox());
    const count = required(await page.locator('#archive-count').boundingBox());
    const name = required(await page.locator('#archive-name').boundingBox());
    const source = required(await page.locator('#archive-source').boundingBox());
    const description = required(await page.locator('#archive-shape').boundingBox());
    const sourceCenter = source.y + source.height / 2;
    expect(sourceCenter).toBeGreaterThan(name.y);
    expect(sourceCenter).toBeLessThan(name.y + name.height);
    expect(source.x).toBeGreaterThan(name.x + name.width);
    expect(source.x + source.width).toBeCloseTo(meta.x + meta.width);
    layouts.push({ roleTop: role.y, serviceTop: service.y, countTop: count.y, nameTop: name.y, sourceTop: source.y,
      descriptionTop: description.y, descriptionHeight: description.height });
  }
  const first = required(layouts[0]);
  const belfast = required(layouts[1]);
  expect(belfast.descriptionHeight).toBeGreaterThan(first.descriptionHeight);
  for (const layout of layouts.slice(1)) {
    expect(layout.roleTop).toBeCloseTo(first.roleTop, 1);
    expect(layout.serviceTop).toBeCloseTo(first.serviceTop, 1);
    expect(layout.countTop).toBeCloseTo(first.countTop, 1);
    expect(layout.nameTop).toBeCloseTo(first.nameTop, 1);
    expect(layout.sourceTop).toBeCloseTo(first.sourceTop, 1);
    expect(layout.descriptionTop).toBeCloseTo(first.descriptionTop, 1);
  }
});

test('the archive shows service years and ship classes as separate facts', async ({ page }) => {
  await openArchive(page);
  for (const entry of [
    { id: 'nimitz', nation: '美国', service: '1975–至今', category: '尼米兹级' },
    { id: 'gerald-ford', nation: '美国', service: '2017–至今', category: '福特级' },
    { id: 'iowa', nation: '美国', service: '1943–1990', category: '衣阿华级' },
    { id: 'rafale-c', nation: '法国', service: '2006–至今', category: '喷气战斗机' },
    { id: 'mig21pf', nation: '苏联', service: '1961年首批交付', category: '喷气战斗机' },
    { id: 'type-093-early', nation: '中国', service: '2019年仍在役', category: '093型商级' },
    { id: 'type-092-refit', nation: '中国', service: '2019年列入名录', category: '092型夏级 · 在役状态有异说' },
    { id: 'type-091-late', nation: '中国', service: '2019年仍在役', category: '091型汉级' },
    { id: 'type-094-early', nation: '中国', service: '2019年仍在役', category: '094型晋级' },
    { id: 'type-039-original', nation: '中国', service: '2019年仍在役', category: '039型宋级' },
    { id: 'type-039a', nation: '中国', service: '2019年仍在役', category: '039A型元级' },
    { id: 'maestrale', nation: '意大利', service: '1934–1943', category: '西北风级' },
    { id: 'p51d', nation: '美国', service: '1944–1957', category: '螺旋桨战斗机 · 美国服役期' },
    { id: 'sauro-first-series', nation: '意大利', service: '1980–2002', category: '萨乌罗级 · 代表艇服役期' },
    { id: 'type-viic', nation: '德国', service: '1940–1945', category: 'VII C型 · 德国服役期' },
    { id: 'oberon', nation: '英国', service: '1960–1993', category: '奥伯龙级 · 英国服役期' },
    { id: 'independence', nation: '美国', service: '1943–1956', category: '独立级 · 美国服役期' },
    { id: 'charles-adams', nation: '美国', service: '1960–1993', category: '查尔斯·F·亚当斯级 · 美国服役期' },
    { id: 'kidd', nation: '美国', service: '1981–1999', category: '基德级 DDG-993 · 美国服役期' },
    { id: 'giulio-cesare', nation: '意大利', service: '1914–1948', category: '加富尔伯爵级 · 意大利服役期' },
  ]) {
    await page.locator('#archive-entry').selectOption(entry.id);
    await ready(page);
    await expect(page.locator('#archive-nation')).toHaveText(entry.nation);
    await expect(page.locator('#archive-service')).toHaveText(entry.service);
    await expect(page.locator('#archive-role')).toHaveText(entry.category);
  }
  await page.setViewportSize({ width: 320, height: 420 });
  await page.locator('#archive-entry').selectOption('gerald-ford'); await ready(page);
  const classWord = await page.locator('#archive-name').evaluate(name => {
    const word = name.lastChild;
    if (!word) return null;
    const range = document.createRange();
    range.selectNodeContents(word);
    return { text: word.textContent, lines: range.getClientRects().length };
  });
  expect(classWord).toEqual({ text: '福特级', lines: 1 });
});

test('changing entry height keeps the archive header and pager at the same screen position', async ({ page }) => {
  await openArchive(page);
  await page.evaluate(() => document.fonts.ready);
  const entry = page.locator('#archive-entry');
  const next = page.locator('#archive-next');
  for (const [width, height] of [[1280, 900], [320, 420], [320, 275], [320, 260], [479, 280], [480, 280], [360, 601], [650, 280], [480, 420], [549, 280], [551, 280]] as const) {
    await page.setViewportSize({ width, height });
    const positions = [];
    for (const id of ['iowa', 'mig21pf', 'mb326', 'c46a', 'c119c', 'type-039-original']) {
      await entry.selectOption(id); await ready(page);
      await expectDialogFits(page, `${id} ${width}×${height}`);
      const cardFits = await page.locator('#archive-card').evaluate(card => card.scrollHeight <= card.clientHeight);
      expect(cardFits, `${id} card fits at ${width}×${height}`).toBe(true);
      const name = required(await page.locator('#archive-name').boundingBox());
      const number = required(await page.locator('#archive-count').boundingBox());
      const pager = required(await next.boundingBox());
      positions.push({ title: name.y, number: number.y, pager: pager.y });
    }
    for (const position of positions.slice(1)) {
      expect(position, `title, page number and pager at ${width}×${height}`).toEqual(positions[0]);
    }
    const pager = required(await next.boundingBox());
    const x = pager.x + pager.width / 2;
    const y = pager.y + pager.height / 2;
    await page.mouse.click(x, y);
    await expect(entry).toHaveValue('c46a');
    await page.mouse.click(x, y);
    await expect(entry).toHaveValue('c47a');
  }
});

test('in an extremely short window the archive card alone can scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 200 });
  await openArchive(page);
  const entry = page.locator('#archive-entry');
  const card = page.locator('#archive-card');
  const next = page.locator('#archive-next');
  await entry.selectOption('c46a'); await ready(page);
  const pager = required(await next.boundingBox());
  await page.locator('#archive-source').focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => card.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect(await next.boundingBox()).toEqual(pager);
  await page.mouse.click(pager.x + pager.width / 2, pager.y + pager.height / 2);
  await expect(entry).toHaveValue('c47a');
  expect(await card.evaluate(node => node.scrollTop)).toBe(0);
  expect(await page.locator('#help-dialog').evaluate(dialog => dialog.scrollHeight <= dialog.clientHeight)).toBe(true);
});

test('the source link stays visible in short viewports and opens its own tab by keyboard', async ({ page }) => {
  await openArchive(page); await ready(page);
  const handbook = page.locator('#help-dialog');
  const source = page.locator('#help-archive-panel').getByRole('link');
  await expect(handbook.locator('button:not(#close-help, [role="tab"], .handbook-pager button)')).toHaveCount(0);
  for (const [width, height] of [[320, 568], [320, 420], [390, 510], [480, 280], [568, 320], [740, 280]] as const) {
    await page.setViewportSize({ width, height });
    for (const id of ['iowa', 'charles-adams', 'sopwith-camel', 'spad-xiii', 'c46a', 'c119c', 'gato']) {
      const entry = required(ARCHIVE.find(item => item.id === id));
      await page.locator('#archive-entry').selectOption(id); await ready(page);
      await expect(source).toBeVisible();
      await expect(source).toHaveText('史料 ↗');
      await expect(source).toHaveAttribute('href', entry.source);
      await expectDialogFits(page, `${id} ${width}×${height}`);
    }
  }
  const sourceURL = required(await source.getAttribute('href'));
  await page.context().route(sourceURL, route => route.fulfill({ contentType: 'text/plain', body: 'Historical source' }));
  await source.focus();
  const [sourceTab] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('Enter')]);
  await expect(sourceTab).toHaveURL(sourceURL);
  await sourceTab.close();
  await expect(handbook).toBeVisible();
  await page.locator('#help-tab-campaign').click();
  await expect(page.locator('#campaign-next')).toBeVisible();
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

for (const spec of [
  { id: 'type-viic', category: 'submarine' },
  { id: 'c46a', category: 'aircraft' },
  { id: 'c47a', category: 'aircraft' },
  { id: 'c119c', category: 'aircraft' },
]) test(`multi-operator metadata fits narrow short handbooks: ${spec.id}`, async ({ page }) => {
  await openArchive(page);
  await page.locator('#archive-category').selectOption(spec.category);
  await page.locator('#archive-entry').selectOption(spec.id); await ready(page);
  for (const viewport of [{ width: 320, height: 480 }, { width: 320, height: 450 }, { width: 393, height: 480 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await expectDialogFits(page, `${spec.id} ${viewport.width}×${viewport.height}`);
  }
});

const FEATURE_SIZES = [[1280, 900], [650, 451], [568, 320], [740, 280], [480, 450], [393, 844], [360, 568], [340, 568], [320, 568], [340, 300], [320, 300], [320, 275]] as const;
async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('archive features fill the copy column as a ruled list and fall back to the original paragraph without scrolling', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openArchive(page); await page.evaluate(() => document.fonts.ready);
  await page.locator('#archive-entry').selectOption('lexington'); await ready(page);
  await expect(page.locator('#archive-role')).toHaveText('列克星敦级');
  await expect(page.locator('#archive-shape')).toHaveText('战巡船体 · 巨型右舷烟囱 · 直通甲板');
  await expect(page.locator('#archive-card')).toHaveAttribute('data-features', 'list');
  for (const [width, height] of FEATURE_SIZES) {
    await page.setViewportSize({ width, height }); await settle(page);
    const report = await page.evaluate(() => {
      const select = document.querySelector<HTMLSelectElement>('#archive-entry');
      const card = document.querySelector<HTMLElement>('#archive-card');
      const art = document.querySelector('#archive-illustration');
      const shape = document.querySelector('#archive-shape');
      const operators = document.querySelector('#archive-operators');
      const copy = document.querySelector('.fleet-copy');
      if (!select || !card || !art || !shape || !operators || !copy) return { failures: ['missing archive elements'], lists: [], sizes: {} };
      // Narrow cards place the features in the cell beside the sprite, so they start on its top edge.
      const narrow = getComputedStyle(copy).display === 'contents';
      const failures: string[] = [];
      const lists: string[] = [];
      const sizes: Record<string, string[]> = {};
      const fontSizes = new Set<string>();
      for (const option of select.options) {
        select.value = option.value; select.dispatchEvent(new Event('change'));
        const id = option.value;
        // showArchive renders and fits synchronously; a stale name means we would be measuring the previous entry.
        if (document.querySelector('#archive-name')?.textContent !== option.text) { failures.push(`${id}: measured before the entry rendered`); continue; }
        const frame = art.getBoundingClientRect();
        if (card.scrollHeight > card.clientHeight) failures.push(`${id}: card scrolls`);
        const line = operators.getClientRects().length ? operators.getBoundingClientRect() : undefined;
        // Wide cards put the operators line under the features beside the sprite; narrow cards run it under the sprite.
        if (line && line.top >= frame.bottom - 0.5 && line.left > frame.left + 0.5) failures.push(`${id}: operators line under the sprite does not span the card`);
        const beside = line && line.top < frame.bottom - 0.5 ? line : undefined;
        // Smaller steps are used only when the ruled list genuinely overflows: compact only when regular does, the paragraph
        // only when compact does.
        const size = card.dataset.features === 'list' ? card.dataset.featureSize ?? '' : 'paragraph';
        sizes[size] = [...sizes[size] ?? [], id];
        const overflows = (featureSize: string) => {
          card.dataset.features = 'list'; card.dataset.featureSize = featureSize;
          return card.scrollHeight > card.clientHeight;
        };
        for (const step of { compact: ['regular'], paragraph: ['regular', 'compact'] }[size] ?? []) {
          if (!overflows(step)) failures.push(`${id}: used ${size} although the ${step} list fits`);
        }
        card.dataset.features = size === 'paragraph' ? 'inline' : 'list'; card.dataset.featureSize = size === 'paragraph' ? 'regular' : size;
        // Every entry shows its features in the same type size, list or paragraph.
        for (const node of [shape, ...shape.querySelectorAll('.fleet-feature')]) fontSizes.add(getComputedStyle(node).fontSize);
        if (card.dataset.features !== 'list') {
          if (narrow && Math.abs(shape.getBoundingClientRect().top - frame.top) > 1) failures.push(`${id}: paragraph does not start at the sprite top`);
          continue;
        }
        lists.push(id);
        if (beside && Math.abs(beside.bottom - frame.bottom) > 1) failures.push(`${id}: operators line leaves the sprite frame`);
        const rows = [...shape.querySelectorAll('.fleet-feature')];
        // Rows share the column down to the operators line (less its top margin) or the sprite frame.
        const margin = parseFloat(getComputedStyle(operators).marginTop);
        const gap = (beside ? beside.top - margin : frame.bottom) - (rows.at(-1)?.getBoundingClientRect().bottom ?? 0);
        if (Math.abs(gap) > 1) failures.push(`${id}: ${Math.round(gap)}px gap under the feature list`);
        if (narrow && Math.abs(shape.getBoundingClientRect().top - frame.top) > 1) failures.push(`${id}: list does not start at the sprite top`);
        for (const separator of shape.querySelectorAll('.fleet-feature-separator')) {
          const style = getComputedStyle(separator);
          // Hidden from sight, not from screen readers.
          if (style.display === 'none' || style.visibility !== 'visible' || separator.getBoundingClientRect().width > 1) failures.push(`${id}: separator is not visually hidden but readable`);
        }
        for (const row of rows) {
          const words = row.querySelector('.fleet-feature-text');
          const bullet = row.querySelector('.fleet-feature-bullet')?.getBoundingClientRect();
          if (!words || !bullet) { failures.push(`${id}: feature row is incomplete`); continue; }
          // Measure real glyphs (separators are clipped out of the list) to count lines and find the first one.
          const range = document.createRange();
          const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest('.fleet-feature-separator') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
          const glyphs: DOMRect[] = [];
          for (let node = walker.nextNode(); node instanceof Text; node = walker.nextNode()) {
            for (let index = 0; index < node.data.length; index++) { range.setStart(node, index); range.setEnd(node, index + 1); glyphs.push(range.getBoundingClientRect()); }
          }
          const lines = new Set(glyphs.map(glyph => Math.round(glyph.top))).size;
          const style = getComputedStyle(row);
          if (row.getBoundingClientRect().height < lines * parseFloat(style.lineHeight) + parseFloat(style.borderBottomWidth) - 0.5) failures.push(`${id}: squeezed feature row ${words.textContent}`);
          const first = glyphs[0];
          if (!first || Math.abs(bullet.top + bullet.height / 2 - (first.top + first.height / 2)) > 2) failures.push(`${id}: bullet is off the first line of ${words.textContent}`);
        }
      }
      if (fontSizes.size !== 1) failures.push(`feature text uses ${[...fontSizes].join(', ')}`);
      return { failures, lists, sizes };
    });
    expect(report.failures, `${width}×${height}`).toEqual([]);
    if (width === 1280) {
      for (const id of ['lexington', 'iowa', 'p51d', 'type-viic']) expect(report.lists, `${id} uses the list at the desktop frame`).toContain(id);
      expect(report.sizes['compact'], 'C-46A keeps a list on the desktop frame').toEqual(['c46a']);
    }
  }
});

test('archive feature and operator lines wrap between words', async ({ page }) => {
  test.setTimeout(90_000);
  await openArchive(page); await page.evaluate(() => document.fonts.ready);
  // Phrases end after 与／、 or before a number; numbers keep their units and countries stay whole.
  const phrases = { mogami: ['改装后五座双联', '203毫米炮'], c47a: ['双扇货舱门与', '半露收起轮'], charger: ['美军军马／', '英军复仇者舰型'], cg4a: ['宽货舱与', '整体开启式机首'] };
  for (const [id, expected] of Object.entries(phrases)) {
    await page.locator('#archive-entry').selectOption(id); await ready(page);
    const clause = page.locator('#archive-shape .fleet-feature-text').filter({ hasText: expected.join('') });
    await expect(clause.locator('.fleet-feature-phrase'), id).toHaveText(expected.map((phrase, index) => index === expected.length - 1 ? new RegExp(`^${phrase}( ·)?$`) : phrase));
  }
  await page.locator('#archive-entry').selectOption('mogami'); await ready(page);
  await expect(page.locator('#archive-shape .fleet-feature-unit')).toHaveText(['203毫米']);
  // Every number keeps the unit that follows it, so new data such as 40节 cannot split from its unit.
  const looseNumbers = await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('#archive-entry');
    if (!select) return ['missing archive elements'];
    const loose: string[] = [];
    for (const option of select.options) {
      select.value = option.value; select.dispatchEvent(new Event('change'));
      for (const unit of document.querySelectorAll('#archive-shape .fleet-feature-unit')) {
        const next = unit.nextSibling?.textContent?.[0] ?? '';
        if (/^\d+(\.\d+)?$/.test(unit.textContent ?? '') && /\p{Script=Han}/u.test(next)) loose.push(`${option.value}: ${unit.textContent}${next}`);
      }
    }
    return loose;
  });
  expect(looseNumbers).toEqual([]);
  await page.locator('#archive-entry').selectOption('type-viic'); await ready(page);
  await expect(page.locator('#archive-operators')).toHaveText('曾服役：法国／英国／俄罗斯／德国');
  await expect(page.locator('#archive-operators .fleet-operator')).toHaveText(['法国／', '英国／', '俄罗斯／', '德国']);
  for (const [width, height] of FEATURE_SIZES) {
    await page.setViewportSize({ width, height }); await settle(page);
    const failures = await page.evaluate(() => {
      const select = document.querySelector<HTMLSelectElement>('#archive-entry');
      const card = document.querySelector<HTMLElement>('#archive-card');
      const shape = document.querySelector('#archive-shape');
      if (!select || !card || !shape) return ['missing archive elements'];
      const tops = (node: Element) => new Set([...node.getClientRects()].map(rect => Math.round(rect.top)));
      const lineHeight = (node: Element) => parseFloat(getComputedStyle(node).lineHeight);
      const result: string[] = [];
      for (const option of select.options) {
        select.value = option.value; select.dispatchEvent(new Event('change'));
        const id = option.value;
        if (document.querySelector('#archive-name')?.textContent !== option.text) { result.push(`${id}: measured before the entry rendered`); continue; }
        const list = card.dataset.features === 'list';
        for (const unit of shape.querySelectorAll('.fleet-feature-unit')) if (tops(unit).size > 1) result.push(`${id}: ${unit.textContent} splits across lines`);
        for (const country of document.querySelectorAll('#archive-operators .fleet-operator')) if (tops(country).size > 1) result.push(`${id}: ${country.textContent} splits across lines`);
        // A phrase wraps inside itself only when it is wider than the line it sits on.
        for (const phrase of shape.querySelectorAll('.fleet-feature-phrase')) {
          const container = (list ? phrase.closest('.fleet-feature-text') : shape)?.getBoundingClientRect();
          const box = phrase.getBoundingClientRect();
          if (container && box.height > lineHeight(phrase) * 1.5 && box.width < container.width - 1) result.push(`${id}: ${phrase.textContent} wraps inside a phrase`);
        }
        // In the paragraph a separator ends its line; it never starts one.
        if (!list) for (const separator of shape.querySelectorAll('.fleet-feature-separator')) {
          const dot = separator.firstChild;
          const before = separator.previousSibling;
          if (!(dot instanceof Text) || !before) continue;
          const range = document.createRange();
          range.setStart(dot, 1); range.setEnd(dot, 2);
          const dotTop = Math.round(range.getBoundingClientRect().top);
          range.selectNodeContents(before);
          const last = [...range.getClientRects()].at(-1);
          if (last && Math.round(last.top) !== dotTop) result.push(`${id}: a line starts with a separator`);
        }
      }
      return result;
    });
    expect(failures, `${width}×${height}`).toEqual([]);
  }
});
