import type { CraftId, Craft, Difficulty, Upgrade, GameStatus, Player, Enemy, EnemyPlane, Boss, Bullet, EnemyBullet, Pickup, Input, Point, GameEvent, EventMap, EmptyEvent, DataEvent } from './types.ts';

export const WIDTH = 480;
export const HEIGHT = 760;

export const CRAFTS: Record<CraftId, Craft> = {
  falcon: { name: '游隼', code: 'F-01', role: '均衡型战机', description: '椭圆翼、单发螺旋桨与双联机炮。<br>可靠的前线主力战斗机。', power: 4, speed: 4, armor: 4, hp: 5, damage: 9, rate: .22, move: 305, color: '#a5e2e8' },
  swift: { name: '雨燕', code: 'S-02', role: '高速型战机', description: '海军蓝涂装，轻型螺旋桨战机。<br>高速机动，穿过敌方防线。', power: 4, speed: 6, armor: 2, hp: 4, damage: 7, rate: .16, move: 375, color: '#edc69b' },
  turtle: { name: '玄武', code: 'H-03', role: '重装型战机', description: '双发动机、双尾撑与重型装甲。<br>以大口径机炮为编队护航。', power: 5, speed: 2, armor: 6, hp: 7, damage: 13, rate: .28, move: 250, color: '#bad3be' },
};

export const UPGRADES: Upgrade[] = [
  { id: 'spread', name: '交叉火力', description: '增加一组侧向弹道，弹幕覆盖更广。', icon: 'crosshair', max: 3, rare: true },
  { id: 'rapid', name: '急速供弹', description: '射击间隔缩短 18%，火力持续倾泻。', icon: 'bolt', max: 5 },
  { id: 'power', name: '高爆弹头', description: '所有武器伤害提升 25%。', icon: 'crosshair', max: 5 },
  { id: 'drone', name: '护航僚机', description: '增加一架僚机，协同发射机炮。', icon: 'plane', max: 2, rare: true },
  { id: 'missile', name: '追踪火箭', description: '自动发射追踪火箭，锁定最近敌机。', icon: 'bolt', max: 3, rare: true },
  { id: 'repair', name: '战地维修', description: '立刻回复 2 点装甲，重返战场。', icon: 'shield', max: Infinity },
  { id: 'armor', name: '复合装甲', description: '装甲上限 +1，并回复 2 点装甲。', icon: 'shield', max: 3 },
  { id: 'magnet', name: '补给回收', description: '补给回收范围 +85，经验获取 +15%。', icon: 'crosshair', max: 2 },
  { id: 'shield', name: '应急装甲', description: '获得护盾，每 15 秒抵挡一次伤害。', icon: 'shield', max: 2, rare: true },
  { id: 'bomb', name: '航弹补给', description: '补充 2 枚炸弹，炸弹伤害提升 20%。', icon: 'bolt', max: Infinity },
  { id: 'critical', name: '致命校准', description: '暴击率 +15%，暴击造成双倍伤害。', icon: 'crosshair', max: 4 },
  { id: 'speed', name: '高辛烷燃油', description: '移动速度 +15%，受击无敌时间 +0.3 秒。', icon: 'plane', max: 3 },
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const distance2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export class Game {
  readonly random: () => number;
  events: GameEvent[] = [];
  status: GameStatus = 'menu';
  craft!: CraftId;
  difficulty!: Difficulty;
  time!: number;
  score!: number;
  kills!: number;
  wave!: number;
  waveTime!: number;
  spawnTimer!: number;
  fireTimer!: number;
  missileTimer!: number;
  level!: number;
  xp!: number;
  nextXp!: number;
  bombs!: number;
  stacks: Partial<Record<Upgrade['id'], number>> = {};
  choices: Upgrade[] = [];
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  enemyBullets: EnemyBullet[] = [];
  pickups: Pickup[] = [];
  boss: Boss | null = null;
  bossDefeated!: boolean;
  bossDelay!: number;
  shieldTimer!: number;
  player!: Player;

  constructor(random = Math.random) {
    this.random = random;
    this.events = [];
    this.start('falcon', 'normal');
    this.status = 'menu';
    this.events = [];
  }

  emit(type: EmptyEvent): void;
  emit<K extends DataEvent>(type: K, data: EventMap[K]): void;
  emit(type: keyof EventMap, data?: EventMap[DataEvent]): void { this.events.push({ type, ...data } as GameEvent); }
  drainEvents() { return this.events.splice(0); }

  start(craft: CraftId = 'falcon', difficulty: Difficulty = 'normal') {
    this.craft = CRAFTS[craft] ? craft : 'falcon';
    this.difficulty = difficulty;
    const spec = CRAFTS[this.craft];
    this.status = 'playing';
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.wave = 1;
    this.waveTime = 0;
    this.spawnTimer = 1;
    this.fireTimer = 0;
    this.missileTimer = 1;
    this.level = 1;
    this.xp = 0;
    this.nextXp = 42;
    this.bombs = 3;
    this.stacks = {};
    this.choices = [];
    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.pickups = [];
    this.boss = null;
    this.bossDefeated = false;
    this.bossDelay = 0;
    this.shieldTimer = 0;
    this.player = { x: WIDTH / 2, y: HEIGHT - 135, hp: spec.hp + (difficulty === 'easy' ? 2 : 0), maxHp: spec.hp + (difficulty === 'easy' ? 2 : 0), radius: 6, invincible: 2, shield: false };
    this.events = [];
    this.emit('start');
    this.emit('wave', { wave: this.wave });
  }

  get damage() { return CRAFTS[this.craft].damage * (1 + .25 * (this.stacks.power || 0)); }
  get movementSpeed() { return CRAFTS[this.craft].move * (1 + .15 * (this.stacks.speed || 0)); }
  get fireRate() { return CRAFTS[this.craft].rate * (.82 ** (this.stacks.rapid || 0)); }
  pause() { if (this.status === 'playing') { this.status = 'paused'; this.emit('pause'); } }
  resume() { if (this.status === 'paused') { this.status = 'playing'; this.emit('resume'); } }
  menu() { this.status = 'menu'; this.emit('menu'); }

  move(dx: number, dy: number, dt: number) {
    const length = Math.hypot(dx, dy);
    if (!length) return;
    this.player.x = clamp(this.player.x + dx / length * this.movementSpeed * dt, 24, WIDTH - 24);
    this.player.y = clamp(this.player.y + dy / length * this.movementSpeed * dt, 100, HEIGHT - 45);
  }

  step(dt: number, input: Input = {}) {
    if (this.status !== 'playing') return;
    dt = Math.min(Math.max(dt, 0), .05);
    this.time += dt;
    this.waveTime += dt;
    const p = this.player;
    p.invincible = Math.max(0, p.invincible - dt);
    this.move(input.x || 0, input.y || 0, dt);
    if (input.target) {
      const dx = input.target.x - p.x, dy = input.target.y - p.y;
      const length = Math.hypot(dx, dy), amount = Math.min(length, this.movementSpeed * 1.9 * dt);
      if (length > 1) { p.x = clamp(p.x + dx / length * amount, 24, WIDTH - 24); p.y = clamp(p.y + dy / length * amount, 100, HEIGHT - 45); }
    }
    if (this.stacks.shield && !p.shield) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) p.shield = true;
    }
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) { this.fire(); this.fireTimer = this.fireRate; }
    if (this.stacks.missile) {
      this.missileTimer -= dt;
      if (this.missileTimer <= 0 && this.enemies.length) { this.fireMissile(); this.missileTimer = 1.35; }
    }
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.checkLevel();
  }

  fire() {
    const p = this.player, critical = this.random() < .15 * (this.stacks.critical || 0);
    const damage = this.damage * (critical ? 2 : 1);
    const bullet = (x: number, y: number, angle = 0, scale = 1) => this.bullets.push({ x, y, vx: Math.sin(angle) * 690, vy: -Math.cos(angle) * 690, damage: damage * scale, radius: 4, critical, kind: 'laser', dead: false });
    bullet(p.x - 8, p.y - 24); bullet(p.x + 8, p.y - 24);
    for (let i = 1; i <= (this.stacks.spread || 0); i++) { bullet(p.x - 12, p.y - 16, -.15 * i, .72); bullet(p.x + 12, p.y - 16, .15 * i, .72); }
    for (let i = 0; i < (this.stacks.drone || 0); i++) bullet(p.x + (i === 0 ? -43 : 43), p.y + 5, 0, .85);
    this.emit('shoot');
  }

  fireMissile() {
    for (let i = 0; i < (this.stacks.missile || 0); i++) this.bullets.push({ x: this.player.x + (i - ((this.stacks.missile || 0) - 1) / 2) * 17, y: this.player.y - 15, vx: (i - .5) * 35, vy: -280, damage: this.damage * 4, radius: 7, kind: 'missile', dead: false });
  }

  updateWaves(dt: number) {
    if (this.wave % 5 === 0) {
      if (!this.boss && !this.bossDefeated) this.spawnBoss();
      if (this.bossDefeated) {
        this.bossDelay -= dt;
        if (this.bossDelay <= 0) {
          if (this.wave === 10) this.finish(true);
          else this.nextWave();
        }
      }
      return;
    }
    const duration = 15 + this.wave * .8;
    this.spawnTimer -= dt;
    if (this.waveTime < duration && this.spawnTimer <= 0 && this.enemies.length < 17) {
      const formation = this.random() < .42;
      const type = this.wave > 1 && this.random() < .28 ? 'gunship' : this.wave > 2 && this.random() < .3 ? 'dart' : 'scout';
      const count = formation ? 3 : 1, center = 95 + this.random() * (WIDTH - 190);
      for (let i = 0; i < count; i++) this.spawnEnemy(type, clamp(center + (i - (count - 1) / 2) * 60, 35, WIDTH - 35), -30 - i * 28);
      this.spawnTimer = Math.max(.44, 1.15 - this.wave * .065) + this.random() * .4;
    }
    if (this.waveTime > duration && (this.enemies.length === 0 || this.waveTime > duration + 6)) this.nextWave();
  }

  nextWave() {
    this.wave++;
    this.waveTime = 0;
    this.spawnTimer = 1.5;
    this.bossDefeated = false;
    if (this.wave === 6) { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2); this.bombs = Math.min(5, this.bombs + 1); }
    this.emit('wave', { wave: this.wave });
  }

  spawnEnemy(type: EnemyPlane['type'], x: number, y: number) {
    const gunship = type === 'gunship', dart = type === 'dart';
    const scale = 1 + (this.wave - 1) * .11;
    const e: EnemyPlane = { type, x, y, originX: x, age: 0, phase: this.random() * Math.PI * 2, hp: (gunship ? 75 : dart ? 24 : 21) * scale, maxHp: (gunship ? 75 : dart ? 24 : 21) * scale, radius: gunship ? 23 : 16, speed: (gunship ? 54 : dart ? 145 : 90) + this.wave * 4, fireTimer: 1 + this.random() * 1.8, dead: false };
    this.enemies.push(e);
    return e;
  }

  spawnBoss() {
    const final = this.wave === 10;
    this.boss = { type: 'boss', x: WIDTH / 2, y: -120, age: 0, hp: final ? 4700 : 2500, maxHp: final ? 4700 : 2500, radius: 64, fireTimer: 2.5, pattern: 0, phase: 0, dead: false, final };
    this.enemies.push(this.boss);
    this.emit('boss', { final });
  }

  updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age += dt;
      if (e.type === 'boss') {
        e.y = Math.min(153, e.y + 56 * dt);
        e.x = WIDTH / 2 + Math.sin(e.age * .55) * 108;
        if (e.y < 95) continue;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          const enraged = e.hp < e.maxHp * .45;
          if (e.pattern % 3 === 0) {
            const count = enraged ? 17 : 13;
            for (let i = 0; i < count; i++) { const a = Math.PI * i / (count - 1); this.enemyShot(e.x + Math.cos(a) * 40, e.y + 27, Math.cos(a), Math.sin(a), enraged ? 143 : 116, 'pink'); }
          } else if (e.pattern % 3 === 1) {
            for (const offset of [-42, 42]) this.aimedSpread(e.x + offset, e.y + 32, enraged ? 7 : 5, .16, 165);
          } else {
            for (let i = 0; i < 22; i++) { const a = i * Math.PI * 2 / 22 + e.age * .3; this.enemyShot(e.x, e.y + 25, Math.cos(a), Math.sin(a), 102, 'orange'); }
          }
          e.pattern++;
          e.fireTimer = (enraged ? .86 : 1.22) * (e.final ? .8 : 1);
        }
      } else {
        e.y += e.speed * dt;
        e.x = e.originX + Math.sin(e.age * (e.type === 'dart' ? 2.2 : 1.1) + e.phase) * (e.type === 'gunship' ? 15 : 38);
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.y > 25 && e.y < HEIGHT - 160) {
          if (e.type === 'gunship') this.aimedSpread(e.x, e.y + 15, 3 + (this.wave > 6 ? 2 : 0), .2, 120 + this.wave * 3);
          else this.aimedSpread(e.x, e.y + 13, 1, 0, 105 + this.wave * 4);
          e.fireTimer = e.type === 'dart' ? 3.5 : 2 + this.random();
        }
      }
      if (this.player.invincible <= 0 && distance2(e, this.player) < (e.radius + this.player.radius) ** 2) {
        this.hurt();
        if (e.type !== 'boss') this.damageEnemy(e, 99999);
      }
      if (e.y > HEIGHT + 70) e.dead = true;
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  enemyShot(x: number, y: number, dx: number, dy: number, speed: number, color: EnemyBullet['color'] = 'orange') {
    const factor = this.difficulty === 'easy' ? .72 : 1;
    this.enemyBullets.push({ x, y, vx: dx * speed * factor, vy: dy * speed * factor, radius: 4, color, dead: false });
  }

  aimedSpread(x: number, y: number, count: number, gap: number, speed: number) {
    const angle = Math.atan2(this.player.y - y, this.player.x - x);
    for (let i = 0; i < count; i++) { const a = angle + (i - (count - 1) / 2) * gap; this.enemyShot(x, y, Math.cos(a), Math.sin(a), speed); }
  }

  updateBullets(dt: number) {
    for (const b of this.bullets) {
      if (b.kind === 'missile') {
        let target, nearest = Infinity;
        for (const e of this.enemies) { const d = distance2(b, e); if (!e.dead && d < nearest) { target = e; nearest = d; } }
        if (target) { const a = Math.atan2(target.y - b.y, target.x - b.x); b.vx += (Math.cos(a) * 400 - b.vx) * Math.min(1, dt * 5); b.vy += (Math.sin(a) * 400 - b.vy) * Math.min(1, dt * 5); }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      for (const e of this.enemies) {
        if (!e.dead && distance2(b, e) < (b.radius + e.radius) ** 2) { b.dead = true; this.damageEnemy(e, b.damage); this.emit('hit', { x: b.x, y: b.y, critical: b.critical }); break; }
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead && b.y > -40 && b.y < HEIGHT + 30 && b.x > -40 && b.x < WIDTH + 40);
    for (const b of this.enemyBullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (this.player.invincible <= 0 && distance2(b, this.player) < (b.radius + this.player.radius) ** 2) { b.dead = true; this.hurt(); }
    }
    this.enemyBullets = this.enemyBullets.filter(b => !b.dead && b.y > -80 && b.y < HEIGHT + 30 && b.x > -30 && b.x < WIDTH + 30);
  }

  damageEnemy(e: Enemy, damage: number) {
    if (e.dead) return;
    e.hp -= damage; e.hitFlash = .08;
    if (e.hp > 0) return;
    e.dead = true;
    this.kills++;
    const isBoss = e.type === 'boss';
    this.score += isBoss ? 3500 : e.type === 'gunship' ? 220 : e.type === 'dart' ? 120 : 100;
    this.emit('explosion', { x: e.x, y: e.y, size: isBoss ? 4 : e.type === 'gunship' ? 1.5 : 1 });
    if (isBoss) {
      this.boss = null; this.bossDefeated = true; this.bossDelay = 2.6;
      this.enemyBullets = [];
      this.xp += 65;
      this.emit('bossDefeated', { final: e.final });
    } else {
      this.pickups.push({ x: e.x, y: e.y, type: 'xp', amount: e.type === 'gunship' ? 17 : 9, radius: 11, dead: false });
      const chance = this.random();
      if (chance < .035) this.pickups.push({ x: e.x + 15, y: e.y - 10, type: 'health', radius: 13, dead: false });
      else if (chance > .986) this.pickups.push({ x: e.x + 15, y: e.y - 10, type: 'bomb', radius: 13, dead: false });
    }
  }

  updatePickups(dt: number) {
    for (const item of this.pickups) {
      const distance = Math.sqrt(distance2(item, this.player));
      if (distance < 110 + (this.stacks.magnet || 0) * 85 || item.magnetized) {
        item.magnetized = true;
        if (distance > 0) { item.x += (this.player.x - item.x) / distance * 480 * dt; item.y += (this.player.y - item.y) / distance * 480 * dt; }
      } else item.y += (item.type === 'xp' ? 88 : 65) * dt;
      if (distance2(item, this.player) < 23 ** 2) {
        item.dead = true;
        if (item.type === 'xp') { this.xp += (item.amount || 0) * (1 + .15 * (this.stacks.magnet || 0)); this.score += 10; }
        if (item.type === 'health') { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1); this.emit('pickup', { text: '装甲 +1' }); }
        if (item.type === 'bomb') { this.bombs = Math.min(5, this.bombs + 1); this.emit('pickup', { text: '炸弹 +1' }); }
      }
    }
    this.pickups = this.pickups.filter(p => !p.dead && p.y < HEIGHT + 20);
  }

  hurt() {
    if (this.status !== 'playing' || this.player.invincible > 0) return;
    if (this.player.shield) {
      this.player.shield = false;
      this.shieldTimer = 15 / (this.stacks.shield || 1);
      this.player.invincible = 1.1;
      this.emit('shieldHit');
      return;
    }
    this.player.hp--;
    this.player.invincible = 1.7 + .3 * (this.stacks.speed || 0);
    this.emit('hurt', { x: this.player.x, y: this.player.y });
    if (this.player.hp <= 0) this.finish(false);
  }

  bomb() {
    if (this.status !== 'playing' || this.bombs <= 0) return false;
    this.bombs--;
    this.enemyBullets = [];
    this.player.invincible = Math.max(this.player.invincible, 2);
    for (const e of this.enemies) this.damageEnemy(e, e.type === 'boss' ? 460 * (1 + .2 * (this.stacks.bomb || 0)) : 99999);
    for (const p of this.pickups) p.magnetized = true;
    this.emit('bomb', { x: this.player.x, y: this.player.y });
    return true;
  }

  checkLevel() {
    if (this.status !== 'playing' || this.xp < this.nextXp || (this.bossDefeated && this.wave === 10)) return;
    this.xp -= this.nextXp;
    this.level++;
    this.nextXp = Math.round(42 + (this.level - 1) * 17);
    const pool = UPGRADES.filter(u => (this.stacks[u.id] || 0) < u.max && (u.id !== 'repair' || this.player.hp < this.player.maxHp));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.choices = pool.slice(0, 3);
    this.status = 'upgrade';
    this.emit('upgrade', { choices: this.choices, level: this.level });
  }

  chooseUpgrade(index: number) {
    if (this.status !== 'upgrade' || !Number.isInteger(index) || !this.choices[index]) return false;
    const upgrade = this.choices[index];
    this.stacks[upgrade.id] = (this.stacks[upgrade.id] || 0) + 1;
    if (upgrade.id === 'armor') this.player.maxHp++;
    if (upgrade.id === 'repair' || upgrade.id === 'armor') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
    if (upgrade.id === 'bomb') this.bombs = Math.min(5, this.bombs + 2);
    if (upgrade.id === 'shield') this.player.shield = true;
    this.status = 'playing';
    this.player.invincible = Math.max(this.player.invincible, .8);
    this.choices = [];
    this.emit('upgraded', { upgrade });
    return true;
  }

  finish(victory: boolean) {
    if (this.status !== 'playing') return;
    this.status = victory ? 'victory' : 'gameover';
    if (victory) this.score += 5000 + this.player.hp * 300;
    this.emit('end', { victory, score: this.score, kills: this.kills, wave: this.wave, time: this.time });
  }
}
