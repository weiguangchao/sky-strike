import { MODEL_IDS } from '../../game/models.ts';
import { CHAPTERS } from '../../game/campaign.ts';
import { required } from '../support.ts';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

test('legacy preferences load and new selections persist in versioned storage', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sky-strike:craft', JSON.stringify('swift'));
    localStorage.setItem('sky-strike:difficulty', JSON.stringify('easy'));
  });
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('[data-craft="swift"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.briefing [data-mode="campaign"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-craft="turtle"]').click();
  expect(await page.evaluate(() => localStorage.getItem('sky-strike:craft'))).toBe('{"version":1,"value":"turtle"}');
  await page.locator('#start-button').click();
  expect(await page.evaluate(async () => (await import('/main.ts')).game.player.maxHp)).toBe(7);
});

test('malformed and unsupported preferences fall back without blocking flight', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sky-strike:craft', '{"version":2,"value":"swift"}');
    localStorage.setItem('sky-strike:mode', '"invalid"');
    localStorage.setItem('sky-strike:campaignSelection', '5');
    localStorage.setItem('sky-strike:best', '{');
    localStorage.setItem('sky-strike:sound', '"false"');
  });
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#best-score')).toHaveText('000000');
  await expect(page.locator('[data-craft="falcon"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.briefing [data-mode="campaign"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mission-name')).toHaveText('黑尔戈兰湾海战');
  await page.locator('#start-button').click();
  expect(await page.evaluate(async () => (await import('/main.ts')).game.player.maxHp)).toBe(5);
});

test('desktop sortie: selection, keyboard, bomb, pause, upgrade, results and record', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始出击' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始出击' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/desktop-hangar.png', fullPage: true });
  await page.getByRole('tab', { name: '雨燕' }).click();
  await expect(page.locator('#craft-name')).toHaveText('雨燕');
  await page.getByRole('button', { name: '无尽', exact: true }).click();
  await page.getByRole('button', { name: '开始出击' }).click();
  const initial = await page.evaluate(async () => { const { game } = await import('/main.ts'); return { x: game.player.x, hp: game.player.hp, craft: game.craft }; });
  expect(initial.craft).toBe('swift'); expect(initial.hp).toBe(4);
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => page.evaluate(async () => (await import('/main.ts')).game.player.x)).toBeLessThan(initial.x - 20);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Space'); await expect(page.locator('#bomb-count')).toHaveText('× 2');
  await page.keyboard.press('p'); await expect(page.locator('#pause-screen')).toBeVisible();
  const pausedTime = await page.evaluate(async () => (await import('/main.ts')).game.time);
  await page.waitForTimeout(160);
  expect(await page.evaluate(async () => (await import('/main.ts')).game.time)).toBe(pausedTime);
  await page.getByRole('button', { name: '继续作战' }).click();
  await page.evaluate(async () => { const { game } = await import('/main.ts'); game.xp = game.nextXp; });
  await expect(page.locator('.upgrade-card')).toHaveCount(3);
  await page.keyboard.press('1');
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  await expect(page.locator('#build-list .build-chip')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/desktop-battle.png', fullPage: true });
  await page.evaluate(async () => { const { game } = await import('/main.ts'); game.score = 12345; game.player.hp = 1; game.player.shield = false; game.player.invincible = 0; game.hurt(); });
  await expect(page.locator('#result-screen')).toBeVisible();
  await expect(page.locator('#result-score')).toHaveText('012345');
  await page.getByRole('button', { name: '再次出击' }).click();
  await expect(page.locator('#score')).toHaveText('000000');
  await page.reload();
  await expect(page.locator('#best-score')).toHaveText('012345');
  await expect(page.locator('#craft-name')).toHaveText('雨燕');
  await expect(page.locator('.briefing [data-mode="endless"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('phone: touch movement, pause, upgrades and controls fit the viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-hangar.png', fullPage: true });
  await page.getByRole('button', { name: '开始出击' }).tap();
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('战场没有显示');
  const initialX = await page.evaluate(async () => (await import('/main.ts')).game.player.x);
  const touch = await context.newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 170, y: box.y + 400 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 240, y: box.y + 380 }] });
  await page.waitForTimeout(250);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(async () => (await import('/main.ts')).game.player.x)).toBeGreaterThan(initialX + 30);
  await page.getByRole('button', { name: '投放高爆航弹' }).tap();
  await expect(page.locator('#bomb-count')).toHaveText('× 2');
  await page.getByRole('button', { name: '暂停游戏' }).tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.getByRole('button', { name: '继续作战' }).tap();
  await page.evaluate(async () => { const { game } = await import('/main.ts'); game.xp = game.nextXp; });
  await expect(page.locator('#upgrade-screen')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-upgrade.png', fullPage: true });
  await page.locator('.upgrade-card').nth(1).tap();
  const bottom = await page.locator('#bomb-button').boundingBox();
  if (!bottom) throw new Error('航弹按钮没有显示');
  expect(bottom.y + bottom.height).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-battle.png', fullPage: true });
  expect(errors).toEqual([]); await context.close();
});

test('handbook pauses a live flight, closes, and restores play', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始出击' }).click();
  await page.getByRole('button', { name: '作战手册' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/main.ts')).game.status)).toBe('paused');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(async () => (await import('/main.ts')).game.status)).toBe('playing');
});

test('boss HUD, stage resupply and final victory resolve correctly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始出击' }).click();
  await page.evaluate(async () => {
    const { game } = await import('/main.ts');
    game.wave = 5; game.enemies = []; game.player.invincible = 100;
    game.emit({ type: 'wave', wave: 5 });
  });
  await expect(page.locator('#boss-hud')).toBeVisible();
  await expect(page.locator('#boss-name')).toContainText('铁岳');
  await page.evaluate(async () => { const { required } = await import('/dom.ts');  const { game } = await import('/main.ts'); game.damageEnemy(required(game.boss), 99999); game.xp = 0; });
  await expect(page.locator('#wave')).toHaveText('06', { timeout: 6000 });
  await expect(page.locator('#sector-label')).toHaveText('黑尔戈兰湾海战');
  await page.evaluate(async () => { const { game } = await import('/main.ts'); game.wave = 10; game.enemies = []; game.bossDefeated = false; });
  await expect(page.locator('#boss-name')).toContainText('赤潮');
  await page.evaluate(async () => { const { required } = await import('/dom.ts');  const { game } = await import('/main.ts'); game.damageEnemy(required(game.boss), 99999); });
  await expect(page.locator('#result-title')).toHaveText('作战胜利', { timeout: 6000 });
  await expect(page.locator('#result-wave')).toHaveText('10/10');
});

async function sinkFinalCarrier(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { game } = await import('/main.ts');
    game.wave = 10;
    game.waveTime = 0;
    game.damageEnemy(game.spawnBoss(), 99999);
    game.bossDelay = 0;
  });
}

test('campaign victory unlocks the next mission and then the next chapter, with a different hangar roster', async ({ page }) => {
  test.setTimeout(90_000);
  const firstWar = CHAPTERS[0].missions.map(mission => mission.name);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.getByRole('tab', { name: '雨燕' }).click();
  await expect(page.locator('#mission-era')).toHaveText('第一次世界大战');
  await page.getByRole('button', { name: '选择战役' }).click();
  await expect(page.locator('#mission-history-note')).toHaveText('战役取名自历史，关卡为架空演绎。');
  await expect(page.locator('#chapter-select option')).toHaveText([
    '第一次世界大战', '第二次世界大战（未解锁）', '冷战（未解锁）', '现代（未解锁）',
  ]);
  await expect(page.locator('#mission-select option')).toHaveText(firstWar.map((name, index) => index ? `${name}（未解锁）` : name));
  await expect(page.locator('#mission-select option:disabled')).toHaveCount(7);
  await expect(page.locator('#chapter-select option[value="1"]')).toBeDisabled();
  await page.locator('#close-mission').click();
  await page.locator('#start-button').click();
  for (const name of firstWar.slice(1)) {
    await sinkFinalCarrier(page);
    await page.getByRole('button', { name: '下一战役' }).click();
    await expect(page.locator('#sector-label')).toHaveText(name);
  }
  await sinkFinalCarrier(page);
  await expect(page.locator('#result-title')).toHaveText('作战胜利');
  await page.locator('#result-home').click();
  await page.reload();
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.getByRole('button', { name: '选择战役' }).click();
  await expect(page.locator('#mission-select option')).toHaveText(firstWar.map(name => `${name}（已通关）`));
  await expect(page.locator('#mission-progress')).toContainText('8 / 32');
  const picker = page.getByRole('dialog', { name: '游戏模式' });
  await picker.getByRole('combobox', { name: '章节' }).selectOption('1');
  await expect(page.locator('#chapter-select option[value="2"]')).toBeDisabled();
  await expect(picker.getByRole('combobox', { name: '战役' })).toHaveValue('8');
  await expect(page.locator('#mission-select option:disabled')).toHaveCount(7);
  await page.locator('#close-mission').click();
  await expect(page.getByRole('tab', { name: '雨燕' })).toBeHidden();
  await expect(page.getByRole('tab', { name: '游隼' })).toHaveAttribute('aria-selected', 'true');
  await page.locator('#start-button').click();
  await expect(page.locator('#sector-label')).toHaveText('塔兰托空袭');
});

test('old campaign saves keep completed sorties and continue the old order while inserted battles unlock in order', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sky-strike:campaignProgress', '{"version":1,"value":5}');
    localStorage.setItem('sky-strike:campaignSelection', '{"version":1,"value":5}');
  });
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#mission-name')).toHaveText('日德兰海战');
  expect(await page.evaluate(() => localStorage.getItem('sky-strike:campaignSixteenOrder'))).toBe('{"version":1,"value":true}');
  await page.getByRole('button', { name: '选择战役' }).click();
  await expect(page.locator('#mission-progress')).toContainText('5 / 32');
  await expect(page.locator('#mission-select option')).toHaveText([
    '黑尔戈兰湾海战（已通关）', '布罗德十四海战', '多格尔沙洲海战（已通关）', '达达尼尔海峡海战（未解锁）',
    '日德兰海战', '奥特朗托海峡海战（未解锁）', '泽布吕赫突袭（未解锁）', '通德恩空袭（未解锁）',
  ]);
  await expect(page.locator('#chapter-select option[value="3"]')).toBeDisabled();
  await page.locator('#chapter-select').selectOption('2');
  await expect(page.locator('#mission-select option')).toHaveText(['仁川登陆（已通关）', ...required(CHAPTERS[2]).missions.slice(1).map(mission => `${mission.name}（未解锁）`)]);
  await page.locator('#chapter-select').selectOption('0');
  await expect(page.locator('#mission-select')).toHaveValue('1');
  await page.locator('#mission-select').selectOption('4');
  await page.locator('#close-mission').click();
  await page.locator('#start-button').click();
  await expect(page.locator('#sector-label')).toHaveText('日德兰海战');
  await sinkFinalCarrier(page);
  await page.getByRole('button', { name: '下一战役' }).click();
  await expect(page.locator('#sector-label')).toHaveText('奥特朗托海峡海战');
  await sinkFinalCarrier(page);
  await page.getByRole('button', { name: '下一战役' }).click();
  await expect(page.locator('#sector-label')).toHaveText('菲律宾海海战');
  await page.reload();
  await expect(page.locator('#mission-name')).toHaveText('菲律宾海海战');
});

test('mobile can start endless from a locked campaign chapter and continues after its carrier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#mission-open-compact').click();
  const picker = page.getByRole('dialog', { name: '游戏模式' });
  await expect(picker.getByLabel('章节').locator('option[value="3"]')).toBeDisabled();
  await picker.getByRole('button', { name: '无尽' }).click();
  await expect(picker.getByRole('option')).toHaveText(['第一次世界大战', '第二次世界大战', '冷战', '现代']);
  await picker.getByLabel('章节').selectOption('3');
  await expect(picker.getByLabel('战役', { exact: true })).toBeHidden();
  await picker.getByRole('button', { name: '关闭游戏模式' }).click();
  await expect(page.getByRole('tab', { name: '玄武' })).toBeHidden();
  await page.locator('#start-button').click();
  expect(await page.evaluate(async () => (await import('/main.ts')).game.activeStage.mission.name)).toBe('布比延海战');
  await sinkFinalCarrier(page);
  await expect(page.locator('#wave')).toHaveText('11');
  expect(await page.evaluate(async () => (await import('/main.ts')).game.activeStage.mission.name)).toBe('科威特外海炮击');
  await expect(page.locator('#wave-total')).toHaveText('波');
  await expect(page.locator('#result-screen')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('sky-strike:campaignCleared'))).toBeNull();
});

test('Phaser 4 loads local 2D sprites before takeoff without requesting GLB assets', async ({ page }) => {
  const loaded = new Map<string, number>();
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/assets/sprites/') && path.endsWith('.png')) loaded.set(path, response.status());
  });
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  expect(loaded.size).toBe(MODEL_IDS.length);
  expect([...loaded.values()]).toEqual(Array(MODEL_IDS.length).fill(200));
  const contexts = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const previewCanvas = document.querySelector<HTMLCanvasElement>('#craft-canvas');
    if (!canvas || !previewCanvas) throw new Error('Game canvases are unavailable');
    const main = canvas.getContext('webgl') ?? canvas.getContext('webgl2');
    const preview = previewCanvas.getContext('2d');
    return { version: canvas.dataset.engineVersion, main: !!main, preview: !!preview,
      glb: performance.getEntriesByType('resource').some(entry => entry.name.endsWith('.glb')) };
  });
  expect(contexts).toEqual({ version: '4.2.1', main: true, preview: true, glb: false });
});

test('losing focus freezes combat and clears held Phaser movement keys', async ({ page }) => {
  await page.goto('/'); await page.locator('#start-button').click();
  const initial = await page.evaluate(async () => (await import('/main.ts')).game.player.x);
  await page.keyboard.down('d');
  await expect.poll(() => page.evaluate(async () => (await import('/main.ts')).game.player.x)).toBeGreaterThan(initial + 20);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pause-screen')).toBeVisible();
  const frozen = await page.evaluate(async () => { const { game } = await import('/main.ts'); return { x: game.player.x, time: game.time }; });
  await page.waitForTimeout(160);
  expect(await page.evaluate(async () => (await import('/main.ts')).game.time)).toBe(frozen.time);
  await page.locator('#resume-button').click(); await page.waitForTimeout(160);
  expect(await page.evaluate(async () => (await import('/main.ts')).game.player.x)).toBe(frozen.x);
  await page.keyboard.up('d');
});

test('a failed startup sprite can reload successfully without an unhandled error', async ({ page }) => {
  let fail = true;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/assets/sprites/falcon.png', route => fail ? route.abort() : route.continue());
  await page.goto('/');
  await expect(page.locator('#start-button')).toHaveText('重新加载');
  fail = false; await page.locator('#start-button').click();
  await expect(page.locator('#start-button')).toHaveText('开始出击');
  await expect(page.locator('#start-button')).toBeEnabled(); await page.locator('#start-button').click();
  await expect(page.locator('#game-hud')).toBeVisible(); expect(errors).toEqual([]);
});

test('startup works without the newer Promise.withResolvers API', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(Promise, 'withResolvers', { configurable: true, value: undefined }));
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await expect(page.locator('#game-hud')).toBeVisible();
  expect(errors).toEqual([]);
});

test('archive opened during startup draws the selected model when loading finishes', async ({ page }) => {
  const gate = Promise.withResolvers<void>();
  await page.route('**/assets/sprites/falcon.png', async route => { await gate.promise; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  try {
    await page.locator('#help-button').click(); await page.locator('#help-tab-archive').click();
    await page.locator('#archive-category').selectOption('aircraft');
    await page.locator('#archive-entry').selectOption('a6m5');
    await expect(page.locator('#start-button')).toBeDisabled();
    const selected = await page.locator('#archive-name').textContent();
    gate.resolve();
    await expect(page.locator('#start-button')).toBeEnabled();
    await expect(page.locator('#archive-name')).toHaveText(selected ?? '');
    await expect(page.locator('#archive-canvas')).toBeVisible();
    await expect.poll(() => page.locator('#archive-canvas').evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d');
      return context ? context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0) : false;
    })).toBe(true);
  } finally { gate.resolve(); }
});

test('desktop mouse drags remain continuous over the bomb button until release', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/'); await page.locator('#start-button').click();
  const field = await page.locator('#game-canvas').boundingBox();
  const bomb = await page.locator('#bomb-button').boundingBox();
  if (!field || !bomb) throw new Error('Missing battlefield controls');
  await page.evaluate(async () => {
    const { game } = await import('/main.ts');
    game.player.x = 140; game.player.y = 400; game.player.invincible = 100; game.time = 10; game.spawnTimer = 999;
  });
  const start = { x: bomb.x - 25, y: bomb.y - 45 };
  const over = { x: bomb.x + bomb.width / 2, y: bomb.y + bomb.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(over.x, over.y, { steps: 8 });
  const expectedOver = Math.min(456, 140 + (over.x - start.x) / field.width * 480 * 1.12);
  await expect.poll(() => page.evaluate(async () => (await import('/main.ts')).game.player.x)).toBeCloseTo(expectedOver, 0);
  await page.mouse.move(start.x + 15, start.y, { steps: 8 });
  const expectedBack = 140 + 15 / field.width * 480 * 1.12;
  await expect.poll(() => page.evaluate(async () => (await import('/main.ts')).game.player.x)).toBeCloseTo(expectedBack, 0);
  await page.mouse.up(); await page.mouse.move(start.x + 80, start.y);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(async () => (await import('/main.ts')).game.player.x)).toBeCloseTo(expectedBack, 0);
  await expect(page.locator('#bomb-count')).toHaveText('× 3');
  await page.locator('#bomb-button').click();
  await expect(page.locator('#bomb-count')).toHaveText('× 2');
});
