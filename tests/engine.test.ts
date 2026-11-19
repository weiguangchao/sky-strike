import { required } from './support.ts';
import test from 'node:test';
import { UNIT_NAMES } from '../game/campaign.ts';
import type { Input } from '../game/types.ts';
import assert from 'node:assert/strict';
import { Game, UPGRADES, WIDTH, HEIGHT } from '../game/engine.ts';

function random(seed = 42) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function advance(game: Game, seconds: number, input: Input = {}) { for (let i = 0; i < seconds * 60; i++) game.step(1 / 60, input); }

test('keyboard movement is normalized, bounded, and stops while paused', () => {
  const game = new Game(random()); game.start({  });
  const start = { ...game.player };
  advance(game, .1, { x: 1, y: -1 });
  assert.ok(Math.abs(Math.hypot(game.player.x - start.x, game.player.y - start.y) - game.movementSpeed * .1) < .01);
  advance(game, 2, { x: -1, y: 1 });
  assert.equal(game.player.x, 24); assert.equal(game.player.y, HEIGHT - 45);
  game.pause(); const snapshot = JSON.stringify(game);
  advance(game, 3, { x: 1 });
  assert.equal(JSON.stringify(game), snapshot);
  game.resume(); advance(game, .1, { x: 1 }); assert.ok(game.player.x > 24);
});

test('only central hitbox takes damage, then invulnerability prevents repeated hits', () => {
  const game = new Game(random()); game.start({  }); game.spawnTimer = 99; game.player.invincible = 0;
  const hp = game.player.hp;
  game.enemyBullets.push({ x: game.player.x + 22, y: game.player.y, vx: 0, vy: 0, radius: 4, color: 'orange' });
  game.step(.01); assert.equal(game.player.hp, hp);
  game.enemyBullets.push({ x: game.player.x, y: game.player.y, vx: 0, vy: 0, radius: 4, color: 'orange' });
  game.step(.01); assert.equal(game.player.hp, hp - 1);
  game.hurt(); assert.equal(game.player.hp, hp - 1);
});

test('energy levels up once, offers unique upgrades, and freezes combat until selected', () => {
  const game = new Game(random()); game.start({  }); game.xp = game.nextXp + 5;
  game.step(.01);
  assert.equal(game.status, 'upgrade'); assert.equal(game.level, 2); assert.equal(game.xp, 5);
  assert.equal(new Set(game.choices.map(u => u.id)).size, 3);
  const time = game.time; advance(game, 1); assert.equal(game.time, time);
  assert.equal(game.chooseUpgrade(-1), false);
  const selected = required(game.choices[0]); assert.equal(game.chooseUpgrade(0), true);
  assert.equal(game.status, 'playing'); assert.equal(required(game.stacks[selected.id]), 1);
  assert.equal(game.chooseUpgrade(0), false);
});

test('bomb removes bullets and regular enemies, damages boss, and grants safety', () => {
  const game = new Game(random()); game.start({  }); game.wave = 5; game.spawnBoss();
  const boss = required(game.boss); const hp = boss.hp;
  game.spawnEnemy('gunship', 100, 150);
  game.enemyShot(250, 200, 0, 1, 100);
  assert.equal(game.bomb(), true);
  assert.equal(game.bombs, 2); assert.equal(game.enemyBullets.length, 0);
  assert.ok(boss.hp < hp && boss.hp > 0);
  assert.equal(game.enemies.filter(e => !e.dead && e.type !== 'boss').length, 0);
  assert.equal(game.kills, 1); assert.ok(game.player.invincible >= 2);
  game.bombs = 0; assert.equal(game.bomb(), false);
});

test('shield absorbs a hit, regenerates, and armor repair respects maximum health', () => {
  const game = new Game(random()); game.start({  }); game.spawnTimer = 999; game.status = 'upgrade';
  game.choices = [required(UPGRADES.find(u => u.id === 'shield'))]; game.chooseUpgrade(0);
  game.player.invincible = 0; const hp = game.player.hp; game.hurt();
  assert.equal(game.player.hp, hp); assert.equal(game.player.shield, false);
  advance(game, 15.1); assert.equal(game.player.shield, true);
  game.status = 'upgrade'; game.choices = [required(UPGRADES.find(u => u.id === 'armor'))]; game.chooseUpgrade(0);
  assert.equal(game.player.maxHp, hp + 1); assert.equal(game.player.hp, hp + 1);
});

test('defeat emits one result and restart clears all previous run state', () => {
  const game = new Game(random()); game.start({ craft: 'turtle', difficulty: 'easy' });
  assert.equal(game.player.hp, 9);
  game.score = 1200; game.player.hp = 1; game.player.invincible = 0;
  game.hurt(); game.hurt();
  assert.equal(game.status, 'gameover'); assert.equal(game.drainEvents().filter(e => e.type === 'end').length, 1);
  game.start({ craft: 'swift' }); assert.equal(game.score, 0); assert.equal(game.wave, 1); assert.equal(game.level, 1);
  assert.equal(game.player.hp, 4); assert.equal(game.bombs, 3); assert.deepEqual(game.stacks, {});
});

for(const craft of ['falcon','swift','turtle'] as const) for(const difficulty of ['normal','easy'] as const) {
  test(`${craft}/${difficulty}: seeded sortie covers all 15 unit classes and both naval bosses`,()=>{
    const game=new Game(random(71)); game.start({ craft: craft, difficulty: difficulty });
    const waves=new Set<number>(),bosses=new Set<number>(),units=new Set<string>();
    let steps=0;
    while(!['victory','gameover'].includes(game.status)&&steps<60*540) {
      steps++; game.player.invincible=100;
      if(game.status==='upgrade') {
        const index=game.choices.findIndex(u=>['power','spread','rapid','drone','missile'].includes(u.id));
        game.chooseUpgrade(Math.max(0,index));
      }
      let x=WIDTH/2;
      if(game.boss) { x=game.boss.x; bosses.add(game.wave); }
      else if(game.pickups.length) x=required(game.pickups[0]).x;
      game.step(1/60,{target:{x,y:HEIGHT-130}});
      waves.add(game.wave);
      for(const enemy of game.enemies) units.add(enemy.layer==='surface'?enemy.hull:enemy.type);
      assert.ok(game.enemies.filter(e=>e.layer==='air').length<=17);
      assert.ok(game.enemyBullets.length<=520);
    }
    assert.equal(game.status,'victory',`stalled at wave ${game.wave}, time ${game.time}`);
    assert.equal(waves.size,10); assert.deepEqual([...bosses],[5,10]);
    assert.deepEqual([...units].sort(),Object.keys(UNIT_NAMES).sort());
    assert.ok(game.kills>100); assert.ok(game.level>5); assert.ok(game.score>20000);
  });
}

test('takeoff protects the aircraft and delays enemy spawns and weapons without blocking movement', () => {
  const game=new Game(random()); game.start({  });
  advance(game,2,{x:1});
  assert.equal(game.takingOff,true); assert.equal(game.enemies.length,0); assert.equal(game.bullets.length,0);
  assert.ok(game.player.invincible>0); assert.ok(game.player.x>240);
  advance(game,.5);
  assert.equal(game.takingOff,false); assert.ok(game.bullets.length>0);
});

test('aircraft pass over ships safely; cannon and tracking rockets only hit airborne enemies', () => {
  const game=new Game(random()); game.start({  }); game.wave=4; game.player.invincible=0;
  const ship=game.spawnShip('destroyer',240,game.player.y);
  const hp=game.player.hp, hull=ship.hp;
  game.updateEnemies(.01);
  assert.equal(game.player.hp,hp);
  game.bullets.push({x:ship.x,y:ship.y,vx:0,vy:0,damage:100,radius:4,kind:'laser',dead:false});
  game.updateBullets(.01); assert.equal(ship.hp,hull);
  const plane=game.spawnEnemy('scout',ship.x,ship.y);
  game.updateBullets(.01); assert.equal(plane.dead,true); assert.equal(ship.hp,hull);
  game.bullets=[{x:ship.x,y:ship.y+50,vx:0,vy:-280,damage:100,radius:4,kind:'missile',dead:false}];
  game.updateBullets(.01); assert.equal(required(game.bullets[0]).vx,0); assert.equal(ship.hp,hull);
  game.enemyShot(game.player.x,game.player.y,0,0,0);
  game.updateBullets(.01); assert.equal(game.player.hp,hp-1);
});

test('automatic anti-ship ordnance requires alignment, lands on the surface, and spends no manual bombs', () => {
  const game=new Game(random()); game.start({  }); game.wave=4;
  const ship=game.spawnShip('destroyer',100,280), hull=ship.hp;
  assert.equal(game.fireOrdnance(),false);
  game.player.x=ship.x+required(ship.parts[0]).x;
  assert.equal(game.fireOrdnance(),true); assert.equal(game.bombs,3);
  assert.equal(required(game.bullets[0]).kind,'ordnance');
  game.updateBullets(.1); assert.equal(ship.hp,hull,'the weapon must fall before dealing damage');
  game.updateBullets(1.1);
  assert.ok(ship.hp<hull); assert.ok(required(ship.parts[0]).hp<required(ship.parts[0]).maxHp);
  const before=ship.hp;
  game.impactOrdnance({x:ship.x,y:ship.y+ship.halfLength*.8},30);
  assert.ok(ship.hp<before,'intact parts must never make the hull immune');
});

test('destroying AA suppresses its own fire and losing the bridge disrupts coordinated attacks', () => {
  const game=new Game(random()); game.start({  }); game.wave=5;
  const ship=game.spawnBoss(); ship.y=218;
  game.damagePart(ship,'aa-port',9999);
  game.damagePart(ship,'aa-port',9999);
  assert.equal(game.drainEvents().filter(e=>e.type==='partDestroyed').length,1);
  game.damagePart(ship,'bridge',9999);
  ship.fireTimer=0; ship.parts.forEach(part=>part.fireTimer=0);
  game.updateEnemies(.01);
  assert.equal(game.enemyBullets.length,3,'only the intact right AA group can fire');
  assert.ok(required(ship.parts.find(part=>part.id==='aa-starboard')).fireTimer>2.5,'bridge loss slows the remaining AA');
  game.damagePart(ship,'aa-starboard',9999);
  game.enemyBullets=[]; game.updateEnemies(3);
  assert.equal(game.enemyBullets.length,0);
});

test('the carrier launches small deck squadrons; destroying its deck stops new launches only', () => {
  const game=new Game(random()); game.start({  }); game.wave=10;
  const carrier=game.spawnBoss(); carrier.y=218; carrier.launchTimer=0;
  game.updateEnemies(.01);
  const squadron=game.enemies.filter(e=>e.layer==='air');
  assert.equal(squadron.length,2);
  assert.ok(squadron.every(e=>e.layer==='air'&&e.launchAge===0&&Math.abs(e.x-carrier.x)<30));
  game.damagePart(carrier,'flight-deck',9999); carrier.launchTimer=0;
  game.updateEnemies(.5);
  assert.deepEqual(game.enemies.filter(e=>e.layer==='air').map(e=>e.id),squadron.map(e=>e.id));
  assert.ok(squadron.every(e=>e.y<carrier.y-45),'launched aircraft continue flying after deck loss');
});

test('dive bombers show a warning, lock a fixed route, and do not home after the warning', () => {
  const game=new Game(random()); game.start({  }); game.wave=7;
  const diver=game.spawnEnemy('diver',180,151);
  game.updateEnemies(.01); assert.equal(diver.action,'warning');
  const locked=diver.lockedX; game.player.x=440;
  game.updateEnemies(.85); assert.equal(diver.action,'dive'); assert.equal(diver.lockedX,locked);
  const heading=diver.heading; game.player.x=24;
  game.updateEnemies(.1); assert.equal(diver.heading,heading); assert.ok(diver.y>170);
});

test('surface torpedoes never hurt aircraft and escort loss does not end the sortie', () => {
  const game=new Game(random()); game.start({  }); game.wave=3; game.spawnTimer=999;
  game.player.invincible=0;
  game.surfaceTorpedoes.push({x:game.player.x,y:game.player.y,vx:0,vy:0,age:0,dead:false});
  game.step(.01); assert.equal(game.player.hp,5);
  const convoy=required(game.convoy);
  for(let i=0;i<3;i++) game.surfaceTorpedoes.push({x:convoy.x,y:convoy.y,vx:0,vy:0,age:0,dead:false});
  game.step(.01);
  assert.equal(convoy.dead,true); assert.equal(game.status,'playing');
  assert.ok(game.drainEvents().some(e=>e.type==='escort'&&!e.saved));
});

test('surviving escort rewards a bomb, oil depots explode locally, and wrecks sink out of the scene', () => {
  const game=new Game(random()); game.start({  }); game.wave=3;
  game.convoy={x:355,y:350,hp:2,maxHp:3,saved:false,dead:false};
  game.nextWave(); assert.equal(game.convoy.saved,true); assert.equal(game.score,600);
  assert.ok(game.pickups.some(p=>p.type==='bomb'));
  const depot=game.spawnShip('oil-depot',180,240), boat=game.spawnShip('patrol-boat',210,250);
  game.enemyShot(180,240,0,1,100); game.enemyShot(450,240,0,1,100);
  game.damageEnemy(depot,9999);
  assert.equal(boat.dead,true); assert.equal(game.enemyBullets.length,1);
  assert.equal(game.wrecks.length,2);
  game.pickups=[]; game.xp=0; game.nextXp=Infinity; game.spawnTimer=999;
  advance(game,3.3); assert.equal(game.wrecks.length,0);
  game.start({  }); assert.equal(game.convoy,null); assert.equal(game.surfaceTorpedoes.length,0);
});
