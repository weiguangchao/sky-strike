import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('fullscreen HUD follows the fitted portrait canvas instead of the window width', async ({ page }) => {
  await mkdir('.artifacts/release',{recursive:true});
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#start-button').click();
  await page.evaluate(async()=>{
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
    game.step=()=>{};
    game.wave=5; game.spawnBoss(); game.boss!.y=153;
    game.enemyBullets=[{x:240,y:90,vx:0,vy:90,radius:4,color:'orange',dead:false}];
    game.events=[];
  });
  for (const [width,height] of [[1920,1080],[1366,768],[1280,720],[1024,600],[960,540],[844,390],[568,320],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    if(await page.locator('#fullscreen-button').isVisible()) await page.locator('#fullscreen-button').click();
    else {
      await page.locator('#pause-button').click();
      await page.locator('#pause-fullscreen').click();
      await page.locator('#resume-button').click();
    }
    await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('battlefield');
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const layout=await page.evaluate(()=>{
      const canvas=document.querySelector('#game-canvas')!.getBoundingClientRect();
      const hud=document.querySelector('#game-hud')!.getBoundingClientRect();
      const boss=document.querySelector('#boss-hud')!.getBoundingClientRect();
      const bomb=document.querySelector('#bomb-button')!.getBoundingClientRect();
      const xp=document.querySelector('.xp-track')!.getBoundingClientRect();
      return {canvas:canvas.toJSON(),hud:hud.toJSON(),boss:boss.toJSON(),bomb:bomb.toJSON(),xpBottom:xp.bottom,bossBottom:(boss.bottom-canvas.top)/canvas.height*760};
    });
    await page.screenshot({path:`.artifacts/release/fullscreen-${width}x${height}.png`});
    expect(layout.bossBottom,'boss bar stays above the cruising boss').toBeLessThan(130);
    expect(layout.xpBottom,'score and health rows stay above the boss bar').toBeLessThanOrEqual(layout.boss.top);
    expect(layout.canvas.width/layout.canvas.height).toBeCloseTo(480/760,2);
    expect(layout.hud.width).toBeCloseTo(layout.canvas.width,0);
    expect(layout.hud.left).toBeCloseTo(layout.canvas.left,0);
    expect(layout.canvas.right).toBeLessThanOrEqual(width+1);
    expect(layout.canvas.bottom).toBeLessThanOrEqual(height+1);
    expect(layout.bomb.left).toBeGreaterThanOrEqual(layout.canvas.left);
    expect(layout.bomb.right).toBeLessThanOrEqual(layout.canvas.right);
    expect(layout.bomb.bottom).toBeLessThanOrEqual(layout.canvas.bottom);
    await page.evaluate(()=>document.exitFullscreen());
  }
});
