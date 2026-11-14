import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { mkdir } from 'node:fs/promises';
import { VISUAL_SIGNALS } from '../../game/visual-style.ts';

const output = '.artifacts/visual-qa';

async function settleFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function fixture(page: Page, boss = false): Promise<void> {
  await page.evaluate(async boss => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
    game.start('falcon','normal');
    game.step = () => {};
    game.wave = boss ? 10 : 3;
    game.level = 4;
    game.score = 12750;
    game.player.x = 240; game.player.y = 650; game.player.invincible = 0;
    if (boss) {
      game.spawnBoss(); game.boss.x = 240; game.boss.y = 180; game.boss.hp *= .58;
    } else {
      game.spawnEnemy('scout',80,185); game.spawnEnemy('gunship',240,210); game.spawnEnemy('dart',395,185);
    }
    game.pickups = [
      {type:'xp',x:120,y:360,amount:9,radius:11,dead:false},
      {type:'health',x:240,y:360,radius:13,dead:false},
      {type:'bomb',x:360,y:360,radius:13,dead:false},
      {type:'xp',x:185,y:485,amount:9,radius:11,dead:false},
      {type:'xp',x:300,y:535,amount:9,radius:11,dead:false},
    ];
    game.enemyBullets = [];
    for (let row=0;row<(boss?8:5);row++) for (let col=0;col<(boss?8:5);col++) {
      game.enemyBullets.push({x:45+col*(boss?55:92)+(row%2)*8,y:285+row*(boss?36:56),vx:0,vy:90,radius:4,color:(row+col)%3===0?'pink':'orange',dead:false});
    }
    game.enemyBullets.push({x:75,y:360,vx:0,vy:90,radius:4,color:'orange',dead:false});
    game.enemyBullets.push({x:405,y:360,vx:0,vy:90,radius:4,color:'pink',dead:false});
    game.bullets = [];
    for(let i=0;i<5;i++) for(const dx of [-8,8]) game.bullets.push({x:240+dx,y:600-i*66,vx:0,vy:-690,damage:9,radius:4,kind:'laser',dead:false});
    game.events = [];
  },boss);
  await settleFrame(page);
  await page.locator('#wave-announcement').evaluate(element => element.classList.remove('visible'));
}

function coloredPixels(image: PNG, x: number, y: number, hex: string, radius: number): number {
  const expected = [1,3,5].map(index => parseInt(hex.slice(index,index+2),16));
  const scale = image.width/480;
  let count = 0;
  for(let py=Math.max(0,Math.floor((y-radius)*scale));py<Math.min(image.height,(y+radius)*scale);py++) {
    for(let px=Math.max(0,Math.floor((x-radius)*scale));px<Math.min(image.width,(x+radius)*scale);px++) {
      const index=(py*image.width+px)*4;
      if(expected.every((value,channel)=>Math.abs(image.data[index+channel]-value)<22)) count++;
    }
  }
  return count;
}

async function expectCombatDetails(page: Page): Promise<void> {
  const image=PNG.sync.read(await page.locator('#battlefield').screenshot());
  expect(coloredPixels(image,240,650,'#fff1cb',4),'solid player hit point').toBeGreaterThan(0);
  expect(coloredPixels(image,240,650,'#071422',7),'dark player hit point outline').toBeGreaterThan(0);
  expect(coloredPixels(image,405,360,VISUAL_SIGNALS.aimed.color,9),'aimed shot core on small screens').toBeGreaterThan(1);
  const bossBottom=await page.locator('#boss-hud').evaluate(element=>{
    const field=document.querySelector('#battlefield')!.getBoundingClientRect();
    return (element.getBoundingClientRect().bottom-field.top)/field.height*760;
  });
  expect(bossBottom,'boss HUD remains above its cruising position').toBeLessThan(130);
}

test('combat colors stay distinct in the rendered framebuffer and have shape-only evidence', async ({ page }) => {
  test.setTimeout(60000);
  await mkdir(output,{recursive:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.screenshot({path:`${output}/desktop-hangar.png`});
  await page.locator('#start-button').click();
  await fixture(page);
  const canvas = page.locator('#game-canvas');
  const image = PNG.sync.read(await canvas.screenshot());
  for(const [key,x] of [['xp',120],['health',240],['bomb',360]] as const) {
    expect(coloredPixels(image,x,360,VISUAL_SIGNALS[key].color,15),key).toBeGreaterThan(8);
  }
  expect(coloredPixels(image,75,360,VISUAL_SIGNALS.danger.color,7)).toBeGreaterThan(2);
  expect(coloredPixels(image,405,360,VISUAL_SIGNALS.aimed.color,7)).toBeGreaterThan(2);
  const seaIndex=(Math.round(270*image.width/480)*image.width+Math.round(450*image.width/480))*4;
  expect(image.data[seaIndex+2]-image.data[seaIndex],'ocean should be blue, not gray').toBeGreaterThan(40);
  await page.screenshot({path:`${output}/desktop-mixed-combat.png`});
  await fixture(page,true);
  await expectCombatDetails(page);
  await page.screenshot({path:`${output}/desktop-boss.png`});
  await page.locator('#battlefield').evaluate(element=>{element.style.filter='grayscale(1)';});
  await page.screenshot({path:`${output}/desktop-grayscale.png`});
  await page.locator('#battlefield').evaluate(element=>{element.style.filter='none';});
  await page.setViewportSize({width:390,height:844});
  await settleFrame(page);
  await expectCombatDetails(page);
  await page.screenshot({path:`${output}/mobile-boss.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  await page.setViewportSize({width:320,height:568});
  await settleFrame(page);
  await expectCombatDetails(page);
  await page.screenshot({path:`${output}/small-phone-combat.png`});
  const bomb=await page.locator('#bomb-button').boundingBox();
  expect(bomb!.y+bomb!.height).toBeLessThanOrEqual(568);
});

test('combat overlays leave incoming shots visible on desktop and small phones', async ({ page }) => {
  test.setTimeout(60000);
  await mkdir(output,{recursive:true});
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  // Start the frozen fixture directly from the menu, so no live announcement timer exists.
  for (const [width,height] of [[1440,1000],[390,844],[320,568]]) {
    await page.setViewportSize({width,height});
    await fixture(page);
    await page.evaluate(async () => {
      const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
      game.player.y=100;
      game.enemyBullets=[80,240,400].map(x=>({x,y:90,vx:0,vy:90,radius:4,color:'orange',dead:false}));
      game.bullets=[];
    });
    await settleFrame(page);
    const battlefield=page.locator('#battlefield');
    const hud=page.locator('#game-hud');
    await hud.evaluate(element=>{element.style.visibility='hidden';});
    const rawImage=PNG.sync.read(await battlefield.screenshot());
    const rawRed=coloredPixels(rawImage,240,90,VISUAL_SIGNALS.danger.color,7);
    expect(rawRed,'control shot is rendered').toBeGreaterThan(0);
    await hud.evaluate(element=>{element.style.visibility='';});
    await settleFrame(page);
    const image=PNG.sync.read(await battlefield.screenshot());
    expect(coloredPixels(image,240,90,VISUAL_SIGNALS.danger.color,7),`enemy shot below HUD at ${width}×${height}`).toBeGreaterThanOrEqual(rawRed*.75);
    await page.screenshot({path:`${output}/top-${width}x${height}.png`});

    for (const boss of [false,true]) {
      const banner=page.locator('#wave-announcement');
      const shots=await banner.evaluate((element,boss)=>{
        element.innerHTML=boss?'<span>WARNING · BOSS APPROACHING</span><strong>敌方首领接近</strong>':'<span>WAVE 03</span><strong>敌机编队接近</strong>';
        element.classList.add('visible');
        element.classList.toggle('boss-warning',boss);
        element.style.visibility='hidden';
        const bounds=element.getBoundingClientRect();
        const field=document.querySelector('#battlefield')!.getBoundingClientRect();
        const range=document.createRange();
        const title=element.querySelector('strong')!.firstChild!;
        range.setStart(title,2); range.setEnd(title,3);
        const glyph=range.getBoundingClientRect();
        return [
          {x:240,y:(bounds.top-field.top+5)/field.height*760,glyph:false},
          {x:48,y:(bounds.top-field.top+bounds.height*.5)/field.height*760,glyph:false},
          {x:(glyph.left+glyph.width/2-field.left)/field.width*480,y:(glyph.top+glyph.height/2-field.top)/field.height*760,glyph:true},
        ];
      },boss);
      await page.evaluate(async shots=>{
        const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
        game.enemyBullets=shots.map(({x,y})=>({x,y,vx:0,vy:90,radius:4,color:'orange',dead:false}));
      },shots);
      await settleFrame(page);
      const control=PNG.sync.read(await battlefield.screenshot());
      await banner.evaluate(element=>{element.style.visibility='';});
      await expect(banner).toHaveCSS('opacity','0.6');
      await expect(banner).toBeVisible();
      await settleFrame(page);
      const overlay=PNG.sync.read(await battlefield.screenshot());
      await page.evaluate(async()=>{
        const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
        game.enemyBullets=[];
      });
      await settleFrame(page);
      const emptyOverlay=PNG.sync.read(await battlefield.screenshot());
      const scale=overlay.width/480;
      for (const shot of shots) {
        let coreIndex=-1;
        for(let y=Math.floor((shot.y-4)*scale);y<(shot.y+4)*scale;y++) for(let x=Math.floor((shot.x-4)*scale);x<(shot.x+4)*scale;x++) {
          const i=(y*control.width+x)*4;
          if(control.data[i]>control.data[i+1]*2 && control.data[i]>control.data[i+2]*1.5 && (coreIndex<0 || control.data[i]>control.data[coreIndex])) coreIndex=i;
        }
        expect(coreIndex,'uncovered reference shot is red').toBeGreaterThanOrEqual(0);
        // Compare against the same lettering without a shot, so bright text cannot fake visibility.
        const signal=(overlay.data[coreIndex]-emptyOverlay.data[coreIndex])/control.data[coreIndex];
        expect(signal,`enemy remains visible ${shot.glyph?'behind title glyph':'under background'} at ${width}×${height}`).toBeGreaterThan(.3);
        if (!shot.glyph) {
          const brightness=overlay.data[coreIndex]/control.data[coreIndex];
          expect(brightness,`shot remains visible under ${boss?'boss':'wave'} banner at ${width}×${height}`).toBeGreaterThan(.4);
          expect(brightness,'banner really darkens the shot, rather than disappearing').toBeLessThan(.97);
          expect(overlay.data[coreIndex]).toBeGreaterThan(overlay.data[coreIndex+1]*1.8);
        }
      }
      await page.evaluate(async shots=>{
        const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
        game.enemyBullets=shots.map(({x,y})=>({x,y,vx:0,vy:90,radius:4,color:'orange',dead:false}));
      },shots);
      await settleFrame(page);
      await page.screenshot({path:`${output}/${boss?'boss-warning':'announcement'}-${width}x${height}.png`});
      await expect(banner).toHaveCSS('opacity','0.6');
    }
  }
});
