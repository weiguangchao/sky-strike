import { required } from '../support.ts';
import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';
import {HISTORICAL_SHIPS,NAVIES} from '../../game/naval-history.ts';

async function openFleet(page:import('@playwright/test').Page):Promise<void> {
  await page.goto('/');await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click();await page.locator('#help-tab-archive').click();
  await page.locator('#archive-category').selectOption('surface');
}
async function ready(page:import('@playwright/test').Page):Promise<void> {
  await expect(page.locator('#archive-status')).toBeEmpty();
  await expect(page.locator('#help-ready')).toBeEnabled();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}

test('all 148 historical ships have real local previews and every navy filters and wraps',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const requested:string[]=[];page.on('request',request=>{if(request.url().includes('/assets/models/'))requested.push(request.url());});
  await page.goto('/');await expect(page.locator('#start-button')).toBeEnabled();
  expect(requested.filter(url=>url.includes('/historic-'))).toHaveLength(0);
  await page.locator('#help-button').click();await page.locator('#help-tab-archive').click();
  await page.locator('#archive-category').selectOption('surface');
  for(const navy of NAVIES) {
    await page.locator('#archive-country').selectOption(navy.id);
    const entries=HISTORICAL_SHIPS.filter(ship=>ship.navy===navy.id);
    for(const [index,ship] of entries.entries()) {
      await expect(page.locator('#archive-name')).toHaveText(ship.name);await ready(page);
      await expect(page.locator('#archive-count')).toHaveText(`${index+1} / ${entries.length}`);
      await expect(page.locator('#archive-source')).toHaveAttribute('href',ship.source);
      const image=PNG.sync.read(await page.locator('#intel-canvas').screenshot());
      let bright=0;const tones=new Set<number>();
      for(let at=0;at<image.data.length;at+=4) {
        const r=required(image.data[at]),g=required(image.data[at+1]),b=required(image.data[at+2]);
        if(r>85&&g>b*.80){bright++;tones.add(((r>>4)<<8)|((g>>4)<<4)|(b>>4));}
      }
      expect(bright,`${ship.id}: visible hull and superstructure`).toBeGreaterThan(100);
      expect(tones.size,`${ship.id}: multiple visible materials`).toBeGreaterThan(8);
      await page.locator('#archive-next').click();
    }
    await expect(page.locator('#archive-name')).toHaveText(required(entries[0]).name);
  }
  expect(errors).toEqual([]);
});

test('failed historical downloads can retry and stale requests cannot replace another tab',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  let fail=true;
  await page.route('**/historic-iowa.glb',async route=>{if(fail)await route.abort();else await route.continue();});
  await openFleet(page);
  await expect(page.locator('#archive-status')).toContainText('加载失败');
  await expect(page.locator('#help-ready')).toHaveText('重试加载');
  fail=false;await page.locator('#help-ready').click();await ready(page);
  await page.locator('#close-help').click();
  await page.unroute('**/historic-iowa.glb');
  const { promise: gate, resolve: release } = Promise.withResolvers<void>();
  await page.route('**/historic-iowa.glb',async route=>{await gate;await route.continue();});
  await page.reload();await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click();await page.locator('#help-tab-archive').click();
  await page.locator('#archive-category').selectOption('surface');
  await expect(page.locator('#archive-status')).toHaveText('模型载入中');
  await page.locator('#help-tab-intel').click();await expect(page.locator('#intel-name')).toHaveText('轻型战斗机');
  const before=await page.locator('#intel-canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL());
  const response=page.waitForResponse('**/historic-iowa.glb');release();await response;
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(await page.locator('#intel-canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL())).toBe(before);
  await expect(page.locator('#intel-name')).toHaveText('轻型战斗机');
});

test('a selected prototype persists and its battle and wreck keep that identity',async({page})=>{
  await openFleet(page);await page.locator('#archive-country').selectOption('de');await ready(page);
  await expect(page.locator('#archive-name')).toHaveText('俾斯麦');
  await page.locator('#help-ready').click();await page.locator('#start-button').click();
  const result=await page.evaluate(async()=>{
    const {game}=await import('/main.ts');
    game.step=()=>{};game.wave=5;game.time=10;game.enemies=[];game.events=[];
    const boss=game.spawnBoss();boss.x=240;boss.y=260;
    return {appearance:boss.appearance,hp:boss.hp};
  });
  expect(result).toEqual({appearance:'bismarck',hp:2800});
  await expect(page.locator('#boss-name')).toContainText('俾斯麦');
  await page.locator('#help-button').click();await page.locator('#help-tab-archive').click();
  await page.locator('#archive-country').selectOption('us');
  await page.locator('#archive-entry').selectOption('iowa');await ready(page);
  await expect(page.locator('#help-ready')).toHaveText('下次出击使用');
  await page.locator('#help-ready').click();
  expect(await page.evaluate(async()=>{
    const {game}=await import('/main.ts');
    return game.fleetAppearance.battleship;
  })).toBe('bismarck');
  const identity=await page.evaluate(async()=>{ const { required } = await import('/dom.ts');
    const {game}=await import('/main.ts');
    game.damageEnemy(required(game.boss),99999);return required(game.wrecks[0]).appearance;
  });
  expect(identity).toBe('bismarck');
  await page.reload();await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click();await page.locator('#help-tab-archive').click();
  await page.locator('#archive-category').selectOption('surface');
  await page.locator('#archive-entry').selectOption('iowa');await ready(page);
  await expect(page.locator('#help-ready')).toHaveText('已选用 · 返回');
});

test('the fleet stays inside short phone and landscape windows with long ship names',async({page})=>{
  await openFleet(page);
  for(const [width,height] of [[320,568],[390,510],[568,320],[740,280]] as const) {
    await page.setViewportSize({width,height});
    for(const navy of ['us','ro','jp']) {
      await page.locator('#archive-country').selectOption(navy);await ready(page);
      if(navy==='us') {await page.locator('#archive-entry').selectOption('truxtun');await ready(page);}
      const layout=await page.locator('#help-dialog').evaluate(dialog=>({h:dialog.clientHeight,sh:dialog.scrollHeight,w:dialog.clientWidth,sw:dialog.scrollWidth,rect:dialog.getBoundingClientRect().toJSON(),controls:[...dialog.querySelectorAll('button,select,a')].filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect().toJSON())}));
      expect(layout.sh,`${width}×${height}: vertical overflow`).toBeLessThanOrEqual(layout.h);
      expect(layout.sw).toBeLessThanOrEqual(layout.w);
      for(const rect of layout.controls) {
        expect(rect.left).toBeGreaterThanOrEqual(layout.rect.left);expect(rect.right).toBeLessThanOrEqual(layout.rect.right);
        expect(rect.top).toBeGreaterThanOrEqual(layout.rect.top);expect(rect.bottom).toBeLessThanOrEqual(layout.rect.bottom);
      }
    }
  }
});

test('US class filters, direct selection and empty results stay coherent across tabs and persist into combat',async({page})=>{
  await openFleet(page);
  await page.locator('#archive-country').selectOption('us');
  await page.locator('#archive-category').selectOption('fleet-carrier');
  await expect(page.locator('#archive-entry option')).toHaveCount(23);
  await page.locator('#archive-entry').selectOption('gerald-ford');await ready(page);
  await expect(page.locator('#archive-name')).toHaveText('杰拉尔德·福特级');
  await expect(page.locator('#archive-role')).toContainText('2017年外观');
  await page.locator('#archive-era').selectOption('modern');await ready(page);
  await expect(page.locator('#archive-entry option')).toHaveCount(2);
  await page.locator('#archive-entry').selectOption('gerald-ford');await ready(page);
  await page.locator('#help-ready').click();await page.locator('#start-button').click();
  const battle=await page.evaluate(async()=>{
    const {game}=await import('/main.ts');
    game.step=()=>{};game.wave=10;game.enemies=[];
    const boss=game.spawnBoss();boss.x=240;boss.y=260;
    return {id:boss.appearance,hp:boss.hp};
  });
  expect(battle).toEqual({id:'gerald-ford',hp:4400});
  await page.reload();await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click();await page.locator('#help-tab-archive').click();
  await page.locator('#archive-category').selectOption('surface');
  await page.locator('#archive-entry').selectOption('gerald-ford');await ready(page);
  await expect(page.locator('#help-ready')).toHaveText('已选用 · 返回');
  await page.locator('#archive-category').selectOption('fleet-carrier');
  await page.locator('#archive-country').selectOption('jp');
  await page.locator('#archive-era').selectOption('modern');
  await expect(page.locator('#archive-count')).toHaveText('0 / 0');
  await expect(page.locator('#help-ready')).toHaveText('返回作战');
  await expect(page.locator('#help-ready')).toBeEnabled();
  await expect(page.locator('#archive-entry')).toBeDisabled();
  await expect(page.locator('#archive-source')).toBeHidden();
  await page.locator('#help-tab-intel').click();await page.locator('#help-tab-archive').click();
  await expect(page.locator('#help-ready')).toHaveText('返回作战');
  await expect(page.locator('#help-ready')).toBeEnabled();
  await page.locator('#archive-era').selectOption('all');await ready(page);
  await expect(page.locator('#help-ready')).toBeEnabled();
});
