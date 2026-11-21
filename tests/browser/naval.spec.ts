import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {CAMPAIGN_STAGES, WAVES} from '../../game/campaign.ts';

test('campaign shows all waves and wraps, with keyboard navigation back to controls', async({page})=>{
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click();
  await page.locator('#help-tab-campaign').click();
  await expect(page.locator('#campaign-roster')).toHaveText('轻型战斗机');
  for(const wave of WAVES) {
    await expect(page.locator('#campaign-name')).toHaveText(wave.name);
    await expect(page.locator('#campaign-objective')).toHaveText(wave.objective);
    await page.locator('#campaign-next').click();
  }
  await expect(page.locator('#campaign-name')).toHaveText(WAVES[0].name);
  await page.locator('#help-tab-campaign').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#help-tab-controls')).toBeFocused();
  await expect(page.locator('#help-controls-panel')).toBeVisible();
});

test('the handbook shows the San Carlos landing briefing with bay and shore headings', async ({ page }) => {
  const ids = CAMPAIGN_STAGES.map(stage => stage.mission.id);
  await page.addInitScript(missionIds => {
    localStorage.setItem('sky-strike:campaignCleared', JSON.stringify(missionIds));
    localStorage.setItem('sky-strike:campaignMission', JSON.stringify('ice-passage'));
  }, ids);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled();
  await page.locator('#help-button').click();
  await page.locator('#help-tab-campaign').click();
  await expect(page.locator('#campaign-stage')).toHaveText('圣卡洛斯湾登陆');
  const headings = ['湾口巡线', '湾内航道', '运输船队', '近岸追击', '铁岳决战', '舰队补给', '锚地警戒', '舰载机群', '湾口突破', '赤潮终局'];
  for (const heading of headings) {
    await expect(page.locator('#campaign-name')).toHaveText(heading);
    await page.locator('#campaign-next').click();
  }
});

test('automatic ordnance breaks rendered boss parts and deck destruction updates the HUD', async({page})=>{
  await page.goto('/'); await page.locator('#start-button').click();
  await page.evaluate(async()=>{ const { required } = await import('/dom.ts');
    const {game}=await import('/main.ts');
    game.wave=5; game.time=10; game.enemies=[]; game.events=[]; game.player.invincible=100;
    game.stacks.power=5; game.stacks.rapid=5;
    const boss=game.spawnBoss(); boss.y=218;
    game.player.x=boss.x+required(boss.parts[0]).x;
    // Follow the same horizontal alignment while the ship slowly patrols.
    boss.originX=game.player.x-required(boss.parts[0]).x;
  });
  await expect(page.locator('#boss-name')).toContainText('铁岳');
  const target=await page.evaluate(async()=>{ const { required } = await import('/dom.ts');
    const {game}=await import('/main.ts');
    required(game.boss).age=0; required(game.boss).originX=game.player.x-required(required(game.boss).parts[0]).x;
    return required(required(game.boss).parts[0]).maxHp;
  });
  expect(target).toBe(390);
  await expect(page.locator('#boss-parts [aria-label="左舷防空炮已摧毁"]')).toBeVisible({timeout:6000});
  await expect(page.locator('#bomb-count')).toHaveText('× 3');
  const hull=await page.evaluate(async()=>{ const { required } = await import('/dom.ts');
    const {game}=await import('/main.ts');
    return {hp:required(game.boss).hp,max:required(game.boss).maxHp,layer:required(game.boss).layer};
  });
  expect(hull.layer).toBe('surface'); expect(hull.hp).toBeLessThan(hull.max); expect(hull.hp).toBeGreaterThan(0);
  await page.evaluate(async()=>{
    const {game}=await import('/main.ts');
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
