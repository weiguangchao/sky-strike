import {test,expect} from '@playwright/test';
import {readFile,readdir} from 'node:fs/promises';
import {HISTORICAL_SHIPS} from '../../game/naval-history.ts';

async function gameCharacters():Promise<string> {
  const files=(await readdir('game')).filter(name=>/\.(ts|html|css)$/.test(name));
  const content=await Promise.all(files.map(name=>readFile(`game/${name}`,'utf8')));
  return [...new Set(content.join('').match(/\p{Script=Han}/gu))].join('');
}

test('the local pixel font actually draws all game Chinese, including every historical ship name',async({page,browserName})=>{
  const fontRequests:string[]=[];
  page.on('request',request=>{if(request.resourceType()==='font')fontRequests.push(request.url());});
  await page.goto('/');await expect(page.locator('#start-button')).toBeEnabled();
  await page.evaluate(()=>document.fonts.ready);
  const characters=await gameCharacters();expect(characters).toContain('苍');
  for(const ship of HISTORICAL_SHIPS)for(const character of ship.name.match(/\p{Script=Han}/gu)||[])expect(characters,ship.id).toContain(character);
  const loaded=await page.evaluate(async text=>(await document.fonts.load('24px "Flight Pixel"',text)).map(face=>({family:face.family,status:face.status})),characters);
  expect(loaded).toEqual([{family:'Flight Pixel',status:'loaded'}]);
  if(browserName==='chromium') {
    await page.evaluate(characters=>{
      const probe=document.createElement('span');probe.id='pixel-font-coverage';probe.textContent=characters;
      probe.style.cssText='position:fixed;top:0;left:0;width:500px;opacity:0;pointer-events:none;font:24px "Flight Pixel"';
      document.body.append(probe);
    },characters);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const session=await page.context().newCDPSession(page);await session.send('DOM.enable');await session.send('CSS.enable');
    const {root}=await session.send('DOM.getDocument');
    const {nodeId}=await session.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pixel-font-coverage'});
    const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every(font=>font.isCustomFont&&font.familyName.includes('Fusion Pixel')),JSON.stringify(fonts)).toBe(true);
    await page.locator('#pixel-font-coverage').evaluate(node=>node.remove());await session.detach();
  }
  for(const selector of ['#start-button','.start-heading h2','#help-button','[data-craft]']) {
    const style=await page.locator(selector).first().evaluate(node=>({family:getComputedStyle(node).fontFamily,synthesis:getComputedStyle(node).fontSynthesis}));
    expect(style.family).toContain('Flight Pixel');expect(style.synthesis).toBe('none');
  }
  expect(fontRequests.every(url=>new URL(url).origin===new URL(page.url()).origin)).toBe(true);
  expect(fontRequests.filter(url=>url.includes('fusion-pixel-12px'))).toHaveLength(1);
});

test('font failure leaves the hangar, handbook and flight operable',async({page})=>{
  await page.route('**/fusion-pixel-12px*.woff2',route=>route.abort());
  await page.setViewportSize({width:390,height:700});
  await page.goto('/');await expect(page.locator('#start-button')).toBeEnabled();await page.evaluate(()=>document.fonts.ready);
  await page.locator('#help-button').click();await expect(page.locator('#help-dialog')).toBeVisible();
  const fit=await page.locator('#help-dialog').evaluate(dialog=>dialog.scrollHeight<=dialog.clientHeight&&dialog.scrollWidth<=dialog.clientWidth);expect(fit).toBe(true);
  await page.locator('#close-help').click();await page.locator('#start-button').click();await expect(page.locator('#game-hud')).toBeVisible();
  await page.locator('#pause-button').click();await expect(page.locator('#resume-button')).toBeVisible();
});
