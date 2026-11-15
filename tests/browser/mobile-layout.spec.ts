import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

async function settle(page:Page) {
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}
async function expectMaximumField(page:Page) {
  await settle(page);
  const bounds=await page.evaluate(()=>{
    const css=getComputedStyle(document.body);
    const value=(key:string)=>parseFloat(css.getPropertyValue(key));
    const top=value('--viewport-top')+value('--safe-top');
    const left=value('--viewport-left')+value('--safe-left');
    const width=value('--viewport-width')-value('--safe-left')-value('--safe-right');
    const height=value('--viewport-height')-value('--safe-top')-value('--safe-bottom');
    const canvas=document.querySelector('#game-canvas')!.getBoundingClientRect();
    return {top,left,width,height,canvas:canvas.toJSON(),scrollX,scrollY};
  });
  // A full, undistorted 480:760 field should be as large as its available rectangle allows.
  expect(bounds.canvas.width).toBeCloseTo(Math.min(bounds.width,bounds.height*480/760),0);
  expect(bounds.canvas.height).toBeCloseTo(Math.min(bounds.height,bounds.width*760/480),0);
  expect(bounds.canvas.left).toBeGreaterThanOrEqual(bounds.left-.5);
  expect(bounds.canvas.top).toBeGreaterThanOrEqual(bounds.top-.5);
  expect(bounds.canvas.right).toBeLessThanOrEqual(bounds.left+bounds.width+.5);
  expect(bounds.canvas.bottom).toBeLessThanOrEqual(bounds.top+bounds.height+.5);
  expect(bounds.canvas.width/bounds.canvas.height).toBeCloseTo(480/760,3);
  expect(bounds.scrollX).toBe(0);expect(bounds.scrollY).toBe(0);
  return bounds.canvas;
}
async function expectTouchControls(page:Page) {
  const field=await page.locator('#game-canvas').boundingBox();
  for(const id of ['pause-button','bomb-button']) {
    const rect=await page.locator('#'+id).boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(44);expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x).toBeGreaterThanOrEqual(field!.x);
    expect(rect!.y).toBeGreaterThanOrEqual(field!.y);
    expect(rect!.x+rect!.width).toBeLessThanOrEqual(field!.x+field!.width+.5);
    expect(rect!.y+rect!.height).toBeLessThanOrEqual(field!.y+field!.height+.5);
  }
}
async function viewport(page:Page,values:{width:number;height:number;offsetTop?:number;offsetLeft?:number;scale?:number}) {
  await page.evaluate(values=>{
    for(const [name,value] of Object.entries({offsetTop:0,offsetLeft:0,scale:1,...values})) Object.defineProperty(window.visualViewport!,name,{configurable:true,value});
    window.visualViewport!.dispatchEvent(new Event('resize'));
  },values);
  await settle(page);
}

test.describe('phone visible viewport',()=>{
  test.use({viewport:{width:393,height:663},isMobile:true,hasTouch:true});

  test('combat uses the largest complete portrait field with no site chrome or clipped touch controls',async({page})=>{
    await page.goto('/');await page.locator('#start-button').click();
    await page.evaluate(async()=>{const{game}=await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);game.wave=5;game.spawnBoss();game.boss.y=180;game.player.invincible=100;game.events=[];});
    await expect(page.locator('.site-header')).toBeHidden();await expect(page.locator('.frame-top')).toBeHidden();
    for(const [width,height] of [[393,663],[390,624],[320,480],[375,667],[430,740],[390,844],[844,390]]) {
      await page.setViewportSize({width,height});
      await expectMaximumField(page);await expectTouchControls(page);
      const visual=await page.evaluate(()=>{
        const face=document.querySelector('.pause-face')!.getBoundingClientRect();
        const boss=document.querySelector('#boss-hud')!.getBoundingClientRect();
        return {overlap:face.left<boss.right&&face.right>boss.left&&face.top<boss.bottom&&face.bottom>boss.top};
      });
      expect(visual.overlap,`pause face must not cover boss text at ${width}×${height}`).toBe(false);
    }
    const pause=await page.locator('#pause-button').boundingBox();
    await page.mouse.click(pause!.x+2,pause!.y+pause!.height-2);
    await expect(page.locator('#pause-screen')).toBeVisible();await page.locator('#resume-button').click();
    await page.setViewportSize({width:393,height:663});await settle(page);
    await mkdir('.artifacts/mobile-viewport',{recursive:true});
    await page.screenshot({path:'.artifacts/mobile-viewport/verified-portrait.png'});
    await page.locator('#pause-button').click();
    await expect(page.locator('#pause-help')).toBeVisible();
    await page.locator('#quit-button').click();
    await expect(page.locator('.site-header')).toBeVisible();await expect(page.locator('[data-craft="swift"]')).toBeVisible();
  });

  test('visual viewport changes and safe areas refit combat and dialogs without requiring fullscreen',async({page})=>{
    await page.setViewportSize({width:393,height:844});
    await page.goto('/');await page.locator('#start-button').click();
    await page.evaluate(()=>{
      const root=document.documentElement;
      root.style.setProperty('--safe-top','47px');root.style.setProperty('--safe-bottom','34px');
      root.style.setProperty('--safe-left','8px');root.style.setProperty('--safe-right','8px');
    });
    for(const height of [580,663,750,600]) {
      await viewport(page,{width:393,height,offsetTop:12});
      await expectMaximumField(page);await expectTouchControls(page);
      expect(await page.evaluate(()=>document.fullscreenElement)).toBeNull();
    }
    await page.locator('#pause-button').click();
    await page.locator('#pause-help').click();
    const dialog=await page.locator('#help-dialog').boundingBox();
    expect(dialog!.y).toBeGreaterThanOrEqual(12+47);
    expect(dialog!.y+dialog!.height).toBeLessThanOrEqual(12+600-34);
    expect(await page.locator('#help-dialog').evaluate(el=>el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.locator('#close-help').click();
    await expect(page.locator('#pause-screen')).toBeVisible();
    await page.locator('#resume-button').click();
    await page.evaluate(async()=>{const {game}=await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);game.xp=game.nextXp;});
    await expect(page.locator('#upgrade-screen')).toBeVisible();
    const field=await expectMaximumField(page);
    for(const rect of await page.locator('.upgrade-card').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().toJSON()))) {
      expect(rect.top).toBeGreaterThanOrEqual(field.y);expect(rect.bottom).toBeLessThanOrEqual(field.bottom);
    }
    await page.locator('.upgrade-card').first().click();
  });

  test('all handbook pages fit toolbar-reduced portrait and landscape safe regions',async({page})=>{
    test.setTimeout(120000);
    await page.goto('/');await page.locator('#start-button').click();
    for(const scenario of [
      {width:393,height:844,visibleHeight:600,top:47,bottom:34,left:8,right:8,offsetTop:12},
      {width:393,height:844,visibleHeight:520,top:47,bottom:34,left:8,right:8,offsetTop:12},
      {width:844,height:390,visibleHeight:320,top:0,bottom:21,left:0,right:0,offsetTop:0},
    ]) {
      await page.setViewportSize({width:scenario.width,height:scenario.height});
      await page.evaluate(scenario=>{
        const root=document.documentElement;
        root.style.setProperty('--safe-top',`${scenario.top}px`);root.style.setProperty('--safe-bottom',`${scenario.bottom}px`);
        root.style.setProperty('--safe-left',`${scenario.left}px`);root.style.setProperty('--safe-right',`${scenario.right}px`);
      },scenario);
      await viewport(page,{width:scenario.width,height:scenario.visibleHeight,offsetTop:scenario.offsetTop});
      await page.locator('#pause-button').click();await page.locator('#pause-help').click();
      for(const [panel,pages] of [['controls',1],['intel',15],['campaign',10],['fleet',72]] as const) {
        await page.locator(`#help-tab-${panel}`).click();
        for(let i=0;i<pages;i++) {
          if(panel==='fleet')await expect(page.locator('#fleet-status')).toBeEmpty();
          await settle(page);
          const layout=await page.locator('#help-dialog').evaluate(element=>({
            rect:element.getBoundingClientRect().toJSON(),height:element.clientHeight,scrollHeight:element.scrollHeight,
            width:element.clientWidth,scrollWidth:element.scrollWidth,
            controls:[...element.querySelectorAll('button')].filter(button=>button.getClientRects().length).map(button=>button.getBoundingClientRect().toJSON()),
          }));
          expect(layout.scrollHeight,`${panel} ${i+1} at ${scenario.width}×${scenario.visibleHeight}`).toBeLessThanOrEqual(layout.height);
          expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
          expect(layout.rect.top).toBeGreaterThanOrEqual(scenario.offsetTop+scenario.top);
          expect(layout.rect.bottom).toBeLessThanOrEqual(scenario.offsetTop+scenario.visibleHeight-scenario.bottom);
          for(const button of layout.controls) {
            expect(button.top).toBeGreaterThanOrEqual(layout.rect.top);expect(button.bottom).toBeLessThanOrEqual(layout.rect.bottom);
            expect(button.left).toBeGreaterThanOrEqual(layout.rect.left);expect(button.right).toBeLessThanOrEqual(layout.rect.right);
          }
          if(panel!=='controls') await page.locator(`#${panel}-next`).click();
        }
        await page.screenshot({path:`.artifacts/mobile-viewport/safe-${panel}-${scenario.width}x${scenario.visibleHeight}.png`});
      }
      await page.locator('#close-help').click();await page.locator('#resume-button').click();
    }
  });

  test('pause keeps handbook, sound and fullscreen reachable and returns to the same flight',async({page,browserName})=>{
    await page.goto('/');await page.locator('#start-button').click();await page.locator('#pause-button').click();
    await page.locator('#pause-help').click();await expect(page.locator('#help-dialog')).toBeVisible();
    await page.locator('#help-tab-intel').click();await expect(page.locator('#intel-canvas')).toBeVisible();
    await page.locator('#help-ready').click();await expect(page.locator('#pause-screen')).toBeVisible();
    await page.locator('.pause-tools .sound-button').click();
    await expect(page.locator('.pause-tools .sound-button')).toHaveAttribute('aria-label','关闭声音');
    if(browserName==='chromium') {
      await expect(page.locator('#pause-fullscreen')).toBeVisible();
      await page.locator('#pause-fullscreen').click();
      await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('battlefield');
      await expect(page.locator('#pause-fullscreen')).toHaveAttribute('aria-label','退出全屏');
      await page.locator('#pause-help').click();await expect(page.locator('#help-dialog')).toBeVisible();
      await page.locator('#close-help').click();
      await page.locator('#quit-button').click();
      await expect.poll(()=>page.evaluate(()=>document.fullscreenElement)).toBeNull();
      await expect(page.locator('.site-header')).toBeVisible();
      await page.locator('[data-craft="swift"]').click();
      await page.locator('#start-button').click();await page.locator('#pause-button').click();
    }
    await page.locator('#resume-button').click();await expect(page.locator('#pause-screen')).toBeHidden();
    await expectMaximumField(page);
  });

  test('viewport resizing releases an in-progress touch drag instead of moving the player unexpectedly',async({page,context,browserName})=>{
    test.skip(browserName!=='chromium','Real touch input in this regression uses Chromium CDP.');
    await page.goto('/');await page.locator('#start-button').click();
    const touch=await context.newCDPSession(page);
    const field=await page.locator('#game-canvas').boundingBox();
    const x=field!.x+field!.width/2,y=field!.y+field!.height*.7;
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    const initial=await page.evaluate(async()=>(await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src)).game.player.x);
    await viewport(page,{width:393,height:550});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+80,y}]});
    await settle(page);
    expect(await page.evaluate(async()=>(await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src)).game.player.x)).toBe(initial);
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expectMaximumField(page);
  });

  test('native pinch zoom does not trigger game relayout and unsupported fullscreen keeps play available',async({page})=>{
    await page.addInitScript(()=>Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false}));
    await page.goto('/');await page.locator('#start-button').click();
    const original=await page.locator('#game-canvas').boundingBox();
    await viewport(page,{width:196.5,height:331.5,scale:2});
    expect(await page.locator('#game-canvas').boundingBox()).toEqual(original);
    await viewport(page,{width:393,height:640,scale:1});await expectMaximumField(page);
    await page.locator('#pause-button').click();await expect(page.locator('#pause-fullscreen')).toBeHidden();
    await expect(page.locator('#pause-help')).toBeVisible();
    await page.locator('#resume-button').click();await expect(page.locator('#bomb-button')).toBeVisible();
  });

  test('browsers without VisualViewport fall back to window size and keep the complete field',async({page})=>{
    await page.addInitScript(()=>Object.defineProperty(window,'visualViewport',{configurable:true,value:null}));
    await page.goto('/');await page.locator('#start-button').click();
    await expectMaximumField(page);
    await page.setViewportSize({width:375,height:580});await expectMaximumField(page);
    await expectTouchControls(page);
  });
});
