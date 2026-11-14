import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, UPGRADES, WIDTH, HEIGHT } from '../game/engine.js';

function random(seed = 42) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function advance(game, seconds, input = {}) { for (let i = 0; i < seconds * 60; i++) game.step(1 / 60, input); }

test('keyboard movement is normalized, bounded, and stops while paused', () => {
  const game = new Game(random()); game.start();
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
  const game = new Game(random()); game.start(); game.spawnTimer = 99; game.player.invincible = 0;
  const hp = game.player.hp;
  game.enemyBullets.push({ x: game.player.x + 22, y: game.player.y, vx: 0, vy: 0, radius: 4 });
  game.step(.01); assert.equal(game.player.hp, hp);
  game.enemyBullets.push({ x: game.player.x, y: game.player.y, vx: 0, vy: 0, radius: 4 });
  game.step(.01); assert.equal(game.player.hp, hp - 1);
  game.hurt(); assert.equal(game.player.hp, hp - 1);
});

test('energy levels up once, offers unique upgrades, and freezes combat until selected', () => {
  const game = new Game(random()); game.start(); game.xp = game.nextXp + 5;
  game.step(.01);
  assert.equal(game.status, 'upgrade'); assert.equal(game.level, 2); assert.equal(game.xp, 5);
  assert.equal(new Set(game.choices.map(u => u.id)).size, 3);
  const time = game.time; advance(game, 1); assert.equal(game.time, time);
  assert.equal(game.chooseUpgrade(-1), false);
  const selected = game.choices[0]; assert.equal(game.chooseUpgrade(0), true);
  assert.equal(game.status, 'playing'); assert.equal(game.stacks[selected.id], 1);
  assert.equal(game.chooseUpgrade(0), false);
});

test('bomb removes bullets and regular enemies, damages boss, and grants safety', () => {
  const game = new Game(random()); game.start(); game.wave = 5; game.spawnBoss();
  const boss = game.boss; const hp = boss.hp;
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
  const game = new Game(random()); game.start(); game.spawnTimer = 999; game.status = 'upgrade';
  game.choices = [UPGRADES.find(u => u.id === 'shield')]; game.chooseUpgrade(0);
  game.player.invincible = 0; const hp = game.player.hp; game.hurt();
  assert.equal(game.player.hp, hp); assert.equal(game.player.shield, false);
  advance(game, 15.1); assert.equal(game.player.shield, true);
  game.status = 'upgrade'; game.choices = [UPGRADES.find(u => u.id === 'armor')]; game.chooseUpgrade(0);
  assert.equal(game.player.maxHp, hp + 1); assert.equal(game.player.hp, hp + 1);
});

test('defeat emits one result and restart clears all previous run state', () => {
  const game = new Game(random()); game.start('turtle', 'easy');
  assert.equal(game.player.hp, 9);
  game.score = 1200; game.player.hp = 1; game.player.invincible = 0;
  game.hurt(); game.hurt();
  assert.equal(game.status, 'gameover'); assert.equal(game.drainEvents().filter(e => e.type === 'end').length, 1);
  game.start('swift'); assert.equal(game.score, 0); assert.equal(game.wave, 1); assert.equal(game.level, 1);
  assert.equal(game.player.hp, 4); assert.equal(game.bombs, 3); assert.deepEqual(game.stacks, {});
});

test('a seeded full sortie reaches both bosses and victory without stalled waves', () => {
  const game = new Game(random(71)); game.start();
  const waves = new Set(); const bosses = new Set();
  let steps = 0;
  while (!['victory', 'gameover'].includes(game.status) && steps < 60 * 540) {
    steps++;
    game.player.invincible = 100;
    if (game.status === 'upgrade') {
      const index = game.choices.findIndex(u => ['power', 'spread', 'rapid', 'drone', 'missile'].includes(u.id));
      game.chooseUpgrade(Math.max(0, index));
    }
    let x = WIDTH / 2;
    if (game.boss) { x = game.boss.x; bosses.add(game.wave); }
    else if (game.pickups.length) x = game.pickups[0].x;
    game.step(1 / 60, { target: { x, y: HEIGHT - 130 } });
    waves.add(game.wave);
  }
  assert.equal(game.status, 'victory', `stalled at wave ${game.wave}, time ${game.time}`);
  assert.equal(waves.size, 10); assert.deepEqual([...bosses], [5, 10]);
  assert.ok(game.kills > 100); assert.ok(game.level > 5); assert.ok(game.score > 20000);
});
