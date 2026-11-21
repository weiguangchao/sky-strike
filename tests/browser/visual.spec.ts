import { required } from '../support.ts';
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
  await page.evaluate(async boss => { const { required } = await import('/dom.ts');
    const { game } = await import('/main.ts');
    game.start({ craft: 'falcon' });
    game.step = () => {};
    game.wave = boss ? 10 : 3;
    game.level = 4;
    game.score = 12750;
    game.player.x = 240; game.player.y = 650; game.player.invincible = 0;
    if (boss) {
      const boss = game.spawnBoss(); boss.x = 240; required(game.boss).y = 180; required(game.boss).hp *= .58;
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
      if(expected.every((value,channel)=>Math.abs(required(image.data[index+channel])-value)<22)) count++;
    }
  }
  return count;
}

async function expectCombatDetails(page: Page): Promise<void> {
  const image=PNG.sync.read(await page.locator('#battlefield').screenshot());
  expect(coloredPixels(image,240,650,'#fff1cb',4),'solid player hit point').toBeGreaterThan(0);
  expect(coloredPixels(image,240,650,'#071422',7),'dark player hit point outline').toBeGreaterThan(0);
  expect(coloredPixels(image,405,360,VISUAL_SIGNALS.aimed.color,9),'aimed shot core on small screens').toBeGreaterThan(1);
  const bossBottom=await page.locator('#boss-hud').evaluate(async element=>{ const { required } = await import('/dom.ts');
    const field=required(document.querySelector('#battlefield')).getBoundingClientRect();
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
  expect(required(image.data[seaIndex+2])-required(image.data[seaIndex]),'ocean should be blue, not gray').toBeGreaterThan(40);
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
  expect(required(bomb).y+required(bomb).height).toBeLessThanOrEqual(568);
});

test('combat overlays leave incoming shots visible on desktop and small phones', async ({ page }) => {
  test.setTimeout(60000);
  await mkdir(output,{recursive:true});
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  // Start the frozen fixture directly from the menu, so no live announcement timer exists.
  for (const [width,height] of [[1440,1000],[390,844],[320,568]] as const) {
    await page.setViewportSize({width,height});
    await fixture(page);
    await page.evaluate(async () => {
      const { game } = await import('/main.ts');
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
      const shots=await banner.evaluate(async (element,boss)=>{ const { required } = await import('/dom.ts');
        element.innerHTML=boss?'<strong>敌方首领接近</strong>':'<strong>敌机编队接近</strong>';
        element.classList.add('visible');
        element.classList.toggle('boss-warning',boss);
        element.style.visibility='hidden';
        const bounds=element.getBoundingClientRect();
        const field=required(document.querySelector('#battlefield')).getBoundingClientRect();
        const range=document.createRange();
        const title=required(required(element.querySelector('strong')).firstChild);
        range.setStart(title,2); range.setEnd(title,3);
        const glyph=range.getBoundingClientRect();
        return [
          {x:240,y:(bounds.top-field.top+5)/field.height*760,glyph:false},
          {x:48,y:(bounds.top-field.top+bounds.height*.5)/field.height*760,glyph:false},
          {x:(glyph.left+glyph.width/2-field.left)/field.width*480,y:(glyph.top+glyph.height/2-field.top)/field.height*760,glyph:true},
        ];
      },boss);
      await page.evaluate(async shots=>{
        const { game } = await import('/main.ts');
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
        const { game } = await import('/main.ts');
        game.enemyBullets=[];
      });
      await settleFrame(page);
      const emptyOverlay=PNG.sync.read(await battlefield.screenshot());
      const scale=overlay.width/480;
      for (const shot of shots) {
        let coreIndex=-1;
        for(let y=Math.floor((shot.y-4)*scale);y<(shot.y+4)*scale;y++) for(let x=Math.floor((shot.x-4)*scale);x<(shot.x+4)*scale;x++) {
          const i=(y*control.width+x)*4;
          if(required(control.data[i])>required(control.data[i+1])*2 && required(control.data[i])>required(control.data[i+2])*1.5 && (coreIndex<0 || required(control.data[i])>required(control.data[coreIndex]))) coreIndex=i;
        }
        expect(coreIndex,'uncovered reference shot is red').toBeGreaterThanOrEqual(0);
        // Compare against the same lettering without a shot, so bright text cannot fake visibility.
        const signal=(required(overlay.data[coreIndex])-required(emptyOverlay.data[coreIndex]))/required(control.data[coreIndex]);
        expect(signal,`enemy remains visible ${shot.glyph?'behind title glyph':'under background'} at ${width}×${height}`).toBeGreaterThan(.3);
        if (!shot.glyph) {
          const brightness=required(overlay.data[coreIndex])/required(control.data[coreIndex]);
          expect(brightness,`shot remains visible under ${boss?'boss':'wave'} banner at ${width}×${height}`).toBeGreaterThan(.4);
          expect(brightness,'banner really darkens the shot, rather than disappearing').toBeLessThan(.97);
          expect(required(overlay.data[coreIndex])).toBeGreaterThan(required(overlay.data[coreIndex+1])*1.8);
        }
      }
      await page.evaluate(async shots=>{
        const { game } = await import('/main.ts');
        game.enemyBullets=shots.map(({x,y})=>({x,y,vx:0,vy:90,radius:4,color:'orange',dead:false}));
      },shots);
      await settleFrame(page);
      await page.screenshot({path:`${output}/${boss?'boss-warning':'announcement'}-${width}x${height}.png`});
      await expect(banner).toHaveCSS('opacity','0.6');
    }
  }
});

test.describe('retina pixel rendering', () => {
  test.use({ deviceScaleFactor: 2 });

  test('keeps a crisp raster and readable combat signals after resizing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#start-button')).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px "Flight Arcade"'))).toBe(true);

    for (const [width, height] of [[1440, 1000], [390, 844], [320, 568]] as const) {
      await page.setViewportSize({ width, height });
      await fixture(page, true);
      const raster = await page.locator('#game-canvas').evaluate(async (canvas: HTMLCanvasElement) => { const { required } = await import('/dom.ts'); return ({
        width: canvas.width, height: canvas.height,
        antialias: required(required(canvas.getContext('webgl') ?? canvas.getContext('webgl2')).getContextAttributes()).antialias,
        scaling: getComputedStyle(canvas).imageRendering,
      }); });
      // Check the real drawing buffer: CSS alone can disguise a full-resolution render.
      expect(raster).toEqual({ width: 240, height: 380, antialias: false, scaling: 'pixelated' });
      const preview = await page.locator('#craft-canvas').evaluate((canvas: HTMLCanvasElement) => ({
        width: canvas.width, height: canvas.height, scaling: getComputedStyle(canvas).imageRendering,
      }));
      expect(preview).toEqual({ width: 160, height: 100, scaling: 'pixelated' });
      await expectCombatDetails(page);
      const image = PNG.sync.read(await page.locator('#game-canvas').screenshot());
      for (const [key, x] of [['xp', 120], ['health', 240], ['bomb', 360]] as const) {
        expect(coloredPixels(image, x, 360, VISUAL_SIGNALS[key].color, 15), `${key} at DPR 2`).toBeGreaterThan(8);
      }
    }
  });
});

test('naval hulls and damaged parts keep enemy shots, supplies and the aircraft hit point visible', async({page})=>{
  await page.goto('/'); await expect(page.locator('#start-button')).toBeEnabled();
  for(const [width,height] of [[1440,1000],[390,844],[320,568]] as const) {
    await page.setViewportSize({width,height});
    await fixture(page,true);
    await page.evaluate(async()=>{ const { required } = await import('/dom.ts');
      const {game}=await import('/main.ts');
      required(game.boss).x=240;required(game.boss).y=240;
      game.damagePart(required(game.boss),'aa-port',99999);
      game.events=[];game.player.x=240;game.player.y=240;game.player.invincible=0;
      game.pickups=[{type:'xp',x:240,y:310,amount:9,radius:11,dead:false}];
      game.enemyBullets=[{x:240,y:190,vx:0,vy:0,radius:4,color:'orange',dead:false},{x:240,y:280,vx:0,vy:0,radius:4,color:'pink',dead:false}];
      game.bullets=[];
    });
    await settleFrame(page);
    const image=PNG.sync.read(await page.locator('#game-canvas').screenshot());
    expect(coloredPixels(image,240,190,VISUAL_SIGNALS.danger.color,8)).toBeGreaterThan(1);
    expect(coloredPixels(image,240,280,VISUAL_SIGNALS.aimed.color,8)).toBeGreaterThan(1);
    expect(coloredPixels(image,240,310,VISUAL_SIGNALS.xp.color,15)).toBeGreaterThan(5);
    expect(coloredPixels(image,240,240,'#fff1cb',5),'aircraft hit point above a carrier').toBeGreaterThan(0);
    await page.screenshot({path:`${output}/naval-layers-${width}x${height}.png`});
  }
});

test('sinking keeps the tilted hull visible before it submerges completely',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');await expect(page.locator('#start-button')).toBeEnabled();
  await fixture(page,true);
  await page.evaluate(async()=>{ const { required } = await import('/dom.ts');
    const {game}=await import('/main.ts');
    required(game.boss).y=240;required(game.boss).x=240;
    game.damageEnemy(required(game.boss),99999);game.events=[];game.enemyBullets=[];game.bullets=[];game.pickups=[];
  });
  const deckPixels=async()=>{
    await settleFrame(page);
    const image=PNG.sync.read(await page.locator('#game-canvas').screenshot());
    let count=0;const scale=image.width/480;
    for(let y=Math.floor(60*scale);y<430*scale;y++) for(let x=Math.floor(150*scale);x<330*scale;x++) {
      const i=(y*image.width+x)*4;
      if(required(image.data[i])>required(image.data[i+1])*1.15&&required(image.data[i+1])>required(image.data[i+2])*1.2)count++;
    }
    return count;
  };
  const afloat=await deckPixels();expect(afloat).toBeGreaterThan(1000);
  await page.evaluate(async()=>{ const { required } = await import('/dom.ts');
    const {game}=await import('/main.ts');required(game.wrecks[0]).age=1;
  });
  expect(await deckPixels(),'partly submerged deck remains visible at one second').toBeGreaterThan(afloat*.2);
  await page.screenshot({path:`${output}/carrier-sinking.png`});
  await page.evaluate(async()=>{ const { required } = await import('/dom.ts');
    const {game}=await import('/main.ts');required(game.wrecks[0]).age=3.15;
  });
  expect(await deckPixels(),'the hull eventually passes below the sea surface').toBeLessThan(afloat*.1);
});
