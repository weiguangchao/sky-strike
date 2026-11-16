import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';
import {mkdir} from 'node:fs/promises';
import {UNIT_INFO,WAVES} from '../../game/campaign.ts';

test('every air and sea unit has a visible local 3D catalog preview and campaign pages wrap', async({page})=>{
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click();
  await page.getByRole('tab',{name:'作战单位',exact:true}).click();
  for(const [index,unit] of UNIT_INFO.entries()) {
    await expect(page.locator('#intel-name')).toHaveText(unit.name);
    await expect(page.locator('#intel-count')).toHaveText(`${String(index+1).padStart(2,'0')} / 15`);
    const preview=PNG.sync.read(await page.locator('#intel-canvas').screenshot());
    let modelPixels=0;
    for(let i=0;i<preview.data.length;i+=4) if(Math.max(preview.data[i],preview.data[i+1],preview.data[i+2])>140) modelPixels++;
    expect(modelPixels,`${unit.id} should have visible model geometry`).toBeGreaterThan(30);
    await page.locator('#intel-next').click();
  }
  await expect(page.locator('#intel-name')).toHaveText(UNIT_INFO[0].name);
  await page.locator('#help-tab-campaign').click();
  for(const wave of WAVES) {
    await expect(page.locator('#campaign-name')).toHaveText(wave.name);
    await expect(page.locator('#campaign-objective')).toHaveText(wave.objective);
    await page.locator('#campaign-next').click();
  }
  await expect(page.locator('#campaign-name')).toHaveText(WAVES[0].name);
  await page.locator('#help-tab-campaign').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#help-tab-intel')).toBeFocused();
  await expect(page.locator('#help-intel-panel')).toBeVisible();
});

test('automatic ordnance breaks rendered boss parts and deck destruction updates the HUD', async({page})=>{
  await page.goto('/'); await page.locator('#start-button').click();
  await page.evaluate(async()=>{
    const {game}=await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
    game.wave=5; game.time=10; game.enemies=[]; game.events=[]; game.player.invincible=100;
    game.stacks.power=5; game.stacks.rapid=5;
    const boss=game.spawnBoss(); boss.y=218;
    game.player.x=boss.x+boss.parts[0].x;
    // Follow the same horizontal alignment while the ship slowly patrols.
    boss.originX=game.player.x-boss.parts[0].x;
  });
  await expect(page.locator('#boss-name')).toContainText('铁岳');
  const target=await page.evaluate(async()=>{
    const {game}=await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
    game.boss.age=0; game.boss.originX=game.player.x-game.boss.parts[0].x;
    return game.boss.parts[0].maxHp;
  });
  expect(target).toBe(390);
  await expect(page.locator('#boss-parts [aria-label="左舷防空炮已摧毁"]')).toBeVisible({timeout:6000});
  await expect(page.locator('#bomb-count')).toHaveText('× 3');
  const hull=await page.evaluate(async()=>{
    const {game}=await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
    return {hp:game.boss.hp,max:game.boss.maxHp,layer:game.boss.layer};
  });
  expect(hull.layer).toBe('surface'); expect(hull.hp).toBeLessThan(hull.max); expect(hull.hp).toBeGreaterThan(0);
  await page.evaluate(async()=>{
    const {game}=await import(document.querySelector<HTMLScriptElement>('script[src*="/main.ts"]')!.src);
    game.wave=10;game.enemies=[];game.bullets=[];game.enemyBullets=[];game.bossDefeated=false;
    const carrier=game.spawnBoss();carrier.y=218;carrier.launchTimer=99;
    game.player.x=carrier.x;
  });
  await expect(page.locator('#boss-name')).toContainText('赤潮');
  await expect(page.locator('#boss-parts [aria-label="飞行甲板已摧毁"]')).toBeVisible({timeout:7000});
  await expect(page.locator('#bomb-count')).toHaveText('× 3');
  await mkdir('.artifacts/air-sea-design',{recursive:true});
  await page.screenshot({path:'.artifacts/air-sea-design/verified-deck-destruction.png'});
});

test('every redesigned ship fills its catalog preview without cropping or losing material separation',async({page})=>{
  await page.goto('/');await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click();await page.locator('#help-tab-intel').click();
  for(let i=0;i<7;i++)await page.locator('#intel-next').click();
  // Isolate model pixels from the illustration frame's rounded border and grid.
  await page.locator('#intel-illustration').evaluate((element:HTMLElement)=>{element.style.borderColor='transparent';element.style.borderRadius='0';element.style.background='#162936';});
  const ships=new Set(['巡逻艇','驱逐舰','防空巡洋舰','铁岳','赤潮','敌方运输船']);
  for(let i=7;i<15;i++) {
    const name=(await page.locator('#intel-name').textContent())!;
    if(ships.has(name)) {
      const preview=PNG.sync.read(await page.locator('#intel-canvas').screenshot());
      let minX=preview.width,minY=preview.height,maxX=0,maxY=0;
      const tones=new Map<number,number>();
      for(let y=0;y<preview.height;y++)for(let x=0;x<preview.width;x++) {
        const at=(y*preview.width+x)*4,r=preview.data[at],g=preview.data[at+1],b=preview.data[at+2];
        if(r>65&&r>b*.86&&g>b*.93) {
          minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
          const tone=((r>>4)<<8)|((g>>4)<<4)|(b>>4);tones.set(tone,(tones.get(tone)||0)+1);
        }
      }
      expect(maxX-minX,`${name}: show the ship instead of empty framing`).toBeGreaterThan(preview.width*.55);
      expect(minX).toBeGreaterThanOrEqual(3);expect(minY).toBeGreaterThanOrEqual(3);
      expect(maxX).toBeLessThan(preview.width-3);expect(maxY).toBeLessThan(preview.height-3);
      expect([...tones.values()].filter(count=>count>4).length,`${name}: visible hull/deck/superstructure tones`).toBeGreaterThanOrEqual(4);
    }
    await page.locator('#intel-next').click();
  }
});
