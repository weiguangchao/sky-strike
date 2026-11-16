import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function settleFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function captureLayout(page: Page, state: string, width: number, height: number): Promise<void> {
  if (width !== 1440 && width !== 390 && width !== 320) return;
  await mkdir('.artifacts/visual-qa', { recursive: true });
  await settleFrame(page);
  await page.screenshot({ path: `.artifacts/visual-qa/${state}-${width}x${height}.png` });
}

async function expectWithinWindow(page: Page, selectors: string[], containerSelector?: string) {
  const layout = await page.evaluate(async ({ selectors, containerSelector }) => { const { required } = await import('/dom.ts'); return ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    bounds: containerSelector ? required(document.querySelector(containerSelector)).getBoundingClientRect().toJSON() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
    elements: selectors.flatMap(selector => [...document.querySelectorAll(selector)]
      .filter(element => element.getClientRects().length)
      .map(element => ({ selector, ...element.getBoundingClientRect().toJSON() }))),
  }); }, { selectors, containerSelector });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height);
  for (const rect of layout.elements) {
    expect(rect.left, `${rect.selector} left at ${layout.width}×${layout.height}`).toBeGreaterThanOrEqual(layout.bounds.left - 1);
    expect(rect.top, `${rect.selector} top at ${layout.width}×${layout.height}`).toBeGreaterThanOrEqual(layout.bounds.top - 1);
    expect(rect.right, `${rect.selector} right at ${layout.width}×${layout.height}`).toBeLessThanOrEqual(layout.bounds.right + 1);
    expect(rect.bottom, `${rect.selector} bottom at ${layout.width}×${layout.height}`).toBeLessThanOrEqual(layout.bounds.bottom + 1);
  }
}

async function expectHandbook(page: Page, width: number, height: number): Promise<void> {
  await page.getByRole('button', { name: '作战手册' }).click();
  await expectWithinWindow(page, ['#help-dialog', '#close-help', '#help-ready']);
  await expectWithinWindow(page, ['#close-help', '#help-ready', '.help-controls', '.handbook-signals', '.help-notes'], '#help-dialog');
  const handbook = await page.locator('#help-dialog').evaluate(element => ({ height:element.clientHeight, scrollHeight:element.scrollHeight, width:element.clientWidth, scrollWidth:element.scrollWidth }));
  expect(handbook.scrollHeight, `handbook height at ${width}×${height}`).toBeLessThanOrEqual(handbook.height);
  expect(handbook.scrollWidth, `handbook width at ${width}×${height}`).toBeLessThanOrEqual(handbook.width);
  if (width===390 || width===320 || height<=390) {
    await mkdir('.artifacts/visual-qa',{recursive:true});
    await page.screenshot({path:`.artifacts/visual-qa/handbook-${width}x${height}.png`});
  }
  await page.locator('#help-ready').click();
}

test('window resizing keeps the complete hangar and every combat dialog on screen', async ({ page }) => {
  test.setTimeout(60000);
  const sizes: [number, number][] = [[1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1024, 600], [820, 1180], [768, 1024], [390, 844], [375, 667], [360, 640], [320, 568], [844, 390]];
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await settleFrame(page);
    await expectWithinWindow(page, ['.site-header', '.briefing', '.game-section', '.loadout-panel', '.site-footer', '#start-button', '[data-craft]']);
    const aspect = await page.locator('#game-canvas').evaluate(canvas => canvas.clientWidth / canvas.clientHeight);
    expect(aspect).toBeCloseTo(480 / 760, 2);
    await captureLayout(page, 'hangar', width, height);
    await expectHandbook(page,width,height);
    await page.getByRole('button', { name: '开始出击' }).click();
    await expectWithinWindow(page, ['.game-section', '#pause-button', '#bomb-button']);
    await page.getByRole('button', { name: '暂停游戏' }).click();
    await expectWithinWindow(page, ['#pause-screen .dialog-content', '#resume-button', '#pause-restart', '#quit-button'], '#battlefield');
    await captureLayout(page, 'paused', width, height);
    await page.getByRole('button', { name: '继续作战' }).click();
    await page.evaluate(async () => { const { game } = await import('/main.ts'); game.xp = game.nextXp; });
    await expect(page.locator('#upgrade-screen')).toBeVisible();
    await expectWithinWindow(page, ['.upgrade-heading', '.upgrade-card'], '#battlefield');
    await captureLayout(page, 'upgrade', width, height);
    await page.locator('.upgrade-card').first().click();
    await page.evaluate(async () => { const { game } = await import('/main.ts'); game.player.hp = 1; game.player.shield = false; game.player.invincible = 0; game.hurt(); });
    await expect(page.locator('#result-screen')).toBeVisible();
    await expectWithinWindow(page, ['#result-screen .dialog-content', '#retry-button', '#result-home'], '#battlefield');
    await captureLayout(page, 'result', width, height);
    await page.getByRole('button', { name: '返回机库', exact: true }).click();
    await expect(page.locator('#start-screen')).toBeVisible();
  }
  for (const [width,height] of [[667,375],[740,360],[568,320]] as const) {
    await page.setViewportSize({width,height});
    await settleFrame(page);
    await expectHandbook(page,width,height);
  }
  await page.mouse.wheel(0, 800);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});


test('catalog and campaign content fit small portrait and landscape windows without scrolling', async({page})=>{
  test.setTimeout(60000);
  await page.goto('/'); await expect(page.locator('#start-button')).toBeEnabled();
  for(const [width,height] of [[390,844],[320,568],[568,320]] as const) {
    await page.setViewportSize({width,height}); await settleFrame(page);
    await page.locator('#help-button').click();
    for(const [panel,pages] of [['intel',15],['campaign',10]] as const) {
      await page.locator(`#help-tab-${panel}`).click();
      for(let i=0;i<pages;i++) {
        await expectWithinWindow(page,[`#help-${panel}-panel`,'#help-ready','#close-help'],'#help-dialog');
        const bounds=await page.locator('#help-dialog').evaluate(element=>({h:element.clientHeight,sh:element.scrollHeight,w:element.clientWidth,sw:element.scrollWidth}));
        expect(bounds.sh,`${panel} page ${i+1} at ${width}×${height}`).toBeLessThanOrEqual(bounds.h);
        expect(bounds.sw).toBeLessThanOrEqual(bounds.w);
        await page.locator(`#${panel}-next`).click();
      }
      await page.screenshot({path:`.artifacts/visual-qa/${panel}-${width}x${height}.png`});
    }
    await page.locator('#help-ready').click();
  }
});
