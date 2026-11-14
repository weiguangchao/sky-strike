import { test, expect } from '@playwright/test';

test('desktop sortie: selection, keyboard, bomb, pause, upgrade, results and record', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始出击' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始出击' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/desktop-hangar.png', fullPage: true });
  await page.getByRole('tab', { name: '雨燕' }).click();
  await expect(page.locator('#craft-name')).toHaveText('雨燕');
  await page.getByRole('button', { name: '休闲', exact: true }).click();
  await page.getByRole('button', { name: '开始出击' }).click();
  const initial = await page.evaluate(async () => { const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src); return { x: game.player.x, hp: game.player.hp, craft: game.craft }; });
  expect(initial.craft).toBe('swift'); expect(initial.hp).toBe(6);
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => page.evaluate(async () => (await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src)).game.player.x)).toBeLessThan(initial.x - 20);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Space'); await expect(page.locator('#bomb-count')).toHaveText('× 2');
  await page.keyboard.press('p'); await expect(page.locator('#pause-screen')).toBeVisible();
  const pausedTime = await page.evaluate(async () => (await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src)).game.time);
  await page.waitForTimeout(160);
  expect(await page.evaluate(async () => (await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src)).game.time)).toBe(pausedTime);
  await page.getByRole('button', { name: '继续作战' }).click();
  await page.evaluate(async () => { const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src); game.xp = game.nextXp; });
  await expect(page.locator('.upgrade-card')).toHaveCount(3);
  await page.keyboard.press('1');
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  await expect(page.locator('#build-list .build-chip')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/desktop-battle.png', fullPage: true });
  await page.evaluate(async () => { const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src); game.score = 12345; game.player.hp = 1; game.player.shield = false; game.player.invincible = 0; game.hurt(); });
  await expect(page.locator('#result-screen')).toBeVisible();
  await expect(page.locator('#result-score')).toHaveText('012345');
  await page.getByRole('button', { name: '再次出击' }).click();
  await expect(page.locator('#score')).toHaveText('000000');
  await page.reload();
  await expect(page.locator('#best-score')).toHaveText('012345');
  await expect(page.locator('#craft-name')).toHaveText('雨燕');
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
  const initialX = await page.evaluate(async () => (await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src)).game.player.x);
  const touch = await context.newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 170, y: box.y + 400 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 240, y: box.y + 380 }] });
  await page.waitForTimeout(250);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(async () => (await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src)).game.player.x)).toBeGreaterThan(initialX + 30);
  await page.getByRole('button', { name: '投放高爆航弹' }).tap();
  await expect(page.locator('#bomb-count')).toHaveText('× 2');
  await page.getByRole('button', { name: '暂停游戏' }).tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.getByRole('button', { name: '继续作战' }).tap();
  await page.evaluate(async () => { const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src); game.xp = game.nextXp; });
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
  expect(await page.evaluate(async () => (await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src)).game.status)).toBe('paused');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(async () => (await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src)).game.status)).toBe('playing');
});

test('boss HUD, stage resupply and final victory resolve correctly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始出击' }).click();
  await page.evaluate(async () => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
    game.wave = 5; game.enemies = []; game.player.invincible = 100;
    game.emit('wave', { wave: 5 });
  });
  await expect(page.locator('#boss-hud')).toBeVisible();
  await expect(page.locator('#boss-name')).toContainText('玄鲸');
  await page.evaluate(async () => { const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src); game.damageEnemy(game.boss, 99999); game.xp = 0; });
  await expect(page.locator('#wave')).toHaveText('06', { timeout: 6000 });
  await expect(page.locator('#sector-label')).toContainText('风暴防线');
  await page.evaluate(async () => { const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src); game.wave = 10; game.enemies = []; game.bossDefeated = false; });
  await expect(page.locator('#boss-name')).toContainText('赤霄');
  await page.evaluate(async () => { const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src); game.damageEnemy(game.boss, 99999); });
  await expect(page.locator('#result-title')).toHaveText('这片天空，属于你。', { timeout: 6000 });
  await expect(page.locator('#result-wave')).toHaveText('10/10');
});

test('Blender models load locally before takeoff and both canvases use WebGL', async ({ page }) => {
  const loaded = new Map<string, number>();
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/assets/models/') && path.endsWith('.glb')) loaded.set(path, response.status());
  });
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  expect(loaded.size).toBe(15);
  expect([...loaded.values()]).toEqual(Array(15).fill(200));
  const contexts = await page.evaluate(() => {
    const main = document.querySelector<HTMLCanvasElement>('#game-canvas')!.getContext('webgl2');
    const preview = document.querySelector<HTMLCanvasElement>('#craft-canvas')!.getContext('webgl2');
    return { main: !!main, preview: !!preview, depth: main?.getParameter(main.DEPTH_BITS) };
  });
  expect(contexts.main).toBe(true);
  expect(contexts.preview).toBe(true);
  expect(contexts.depth).toBeGreaterThan(0);
});
