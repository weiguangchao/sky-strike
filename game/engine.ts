import { isEntityId } from './types.ts';
import type { EntityId } from './types.ts';
import type { CraftId, Craft, Difficulty, Upgrade, GameStatus, Player, Enemy, EnemyPlane, Boss, Ship, ShipPart, ShipKind, PartId, Bullet, EnemyBullet, Pickup, Input, Point, GameEvent, Wreck, SurfaceTorpedo, Convoy } from './types.ts';
import { HULLS, waveInfo } from './campaign.ts';
import { DEFAULT_FLEET, historicalShip, navalShape, isNavalHull } from './naval-history.ts';
import type { FleetSelection } from './naval-history.ts';

export const WIDTH = 480;
export const HEIGHT = 760;
export const TAKEOFF_DURATION = 2.4;

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
const SHIP_IDENTITIES = {
  'patrol-boat': { type: 'patrol-boat', hull: 'patrol-boat' },
  destroyer: { type: 'destroyer', hull: 'destroyer' },
  cruiser: { type: 'cruiser', hull: 'cruiser' },
  battleship: { type: 'battleship', hull: 'battleship' },
  'fleet-carrier': { type: 'fleet-carrier', hull: 'fleet-carrier' },
  'coastal-battery': { type: 'coastal-battery', hull: 'coastal-battery' },
  'oil-depot': { type: 'oil-depot', hull: 'oil-depot' },
  transport: { type: 'transport', hull: 'transport' },
} satisfies { [Hull in ShipKind]: { type: Hull; hull: Hull } };

export class Game {
  fleetAppearance:FleetSelection={...DEFAULT_FLEET};
  readonly random: () => number;
  events: GameEvent[] = [];
  status: GameStatus = 'menu';
  craft: CraftId = 'falcon';
  difficulty: Difficulty = 'normal';
  time: number = 0;
  score: number = 0;
  kills: number = 0;
  wave: number = 1;
  waveTime: number = 0;
  spawnTimer: number = 1;
  fireTimer: number = 0;
  missileTimer: number = 1;
  ordnanceTimer: number = .4;
  level: number = 1;
  xp: number = 0;
  nextXp: number = 42;
  bombs: number = 3;
  stacks: Partial<Record<Upgrade['id'], number>> = {};
  choices: Upgrade[] = [];
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  enemyBullets: EnemyBullet[] = [];
  pickups: Pickup[] = [];
  wrecks: Wreck[] = [];
  surfaceTorpedoes: SurfaceTorpedo[] = [];
  convoy: Convoy | null = null;
  boss: Boss | null = null;
  bossDefeated: boolean = false;
  bossDelay: number = 0;
  shieldTimer: number = 0;
  player: Player = { x: WIDTH / 2, y: HEIGHT - 135, hp: 5, maxHp: 5, radius: 6, invincible: TAKEOFF_DURATION, shield: false };
  private nextId = 0;
  private milestones = new Set<number>();

  constructor(random = Math.random) {
    this.random = random;
    this.start({ craft: 'falcon', difficulty: 'normal' });
    this.status = 'menu';
    this.events = [];
  }

  emit(event: GameEvent): void { this.events.push(event); }
  private allocateId(): EntityId {
    const id = this.nextId++;
    if (!isEntityId(id)) throw new Error('Entity identifier exhausted');
    return id;
  }
  drainEvents() { return this.events.splice(0); }

  start({ craft = 'falcon', difficulty = 'normal' }: { craft?: CraftId; difficulty?: Difficulty } = {}) {
    this.craft = craft;
    this.difficulty = difficulty;
    const spec = CRAFTS[this.craft];
    this.status = 'playing';
    this.time = this.score = this.kills = this.waveTime = 0;
    this.wave = this.level = 1;
    this.spawnTimer = 1;
    this.fireTimer = 0;
    this.missileTimer = 1;
    this.ordnanceTimer = .4;
    this.xp = 0;
    this.nextXp = 42;
    this.bombs = 3;
    this.stacks = {};
    this.choices = [];
    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.pickups = [];
    this.wrecks = [];
    this.surfaceTorpedoes = [];
    this.convoy = null;
    this.boss = null;
    this.bossDefeated = false;
    this.bossDelay = this.shieldTimer = 0;
    this.nextId = 0;
    this.milestones.clear();
    const hp = spec.hp + (difficulty === 'easy' ? 2 : 0);
    this.player = { x: WIDTH / 2, y: HEIGHT - 135, hp, maxHp: hp, radius: 6, invincible: TAKEOFF_DURATION, shield: false };
    this.events = [];
    this.emit({ type: 'start' });
    this.emit({ type: 'wave', wave: this.wave });
  }

  get takingOff() { return this.wave === 1 && this.time < TAKEOFF_DURATION; }
  get damage() { return CRAFTS[this.craft].damage * (1 + .25 * (this.stacks.power || 0)); }
  get movementSpeed() { return CRAFTS[this.craft].move * (1 + .15 * (this.stacks.speed || 0)); }
  get fireRate() { return CRAFTS[this.craft].rate * (.82 ** (this.stacks.rapid || 0)); }
  pause() { if (this.status === 'playing') { this.status = 'paused'; this.emit({ type: 'pause' }); } }
  resume() { if (this.status === 'paused') { this.status = 'playing'; this.emit({ type: 'resume' }); } }
  menu() { this.status = 'menu'; this.emit({ type: 'menu' }); }

  move(dx: number, dy: number, dt: number) {
    const length = Math.hypot(dx, dy);
    if (!length) return;
    this.player.x = clamp(this.player.x + dx / length * this.movementSpeed * dt, 24, WIDTH - 24);
    this.player.y = clamp(this.player.y + dy / length * this.movementSpeed * dt, 100, HEIGHT - 45);
  }

  step(dt: number, input: Input = {}) {
    if (this.status !== 'playing') return;
    dt = clamp(dt, 0, .05);
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
    if (!this.takingOff) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) { this.fire(); this.fireTimer = this.fireRate; }
      if (this.stacks.missile) {
        this.missileTimer -= dt;
        if (this.missileTimer <= 0 && this.enemies.some(e => e.layer === 'air' && !e.dead)) { this.fireMissile(); this.missileTimer = 1.35; }
      }
      this.ordnanceTimer -= dt;
      if (this.ordnanceTimer <= 0 && this.fireOrdnance()) this.ordnanceTimer = .78 * (.9 ** (this.stacks.rapid || 0));
      this.updateWaves(dt);
    }
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateSea(dt);
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
    this.emit({ type: 'shoot' });
  }

  fireMissile() {
    for (let i = 0; i < (this.stacks.missile || 0); i++) this.bullets.push({ x: this.player.x + (i - ((this.stacks.missile || 0) - 1) / 2) * 17, y: this.player.y - 15, vx: (i - .5) * 35, vy: -280, damage: this.damage * 4, radius: 7, kind: 'missile', dead: false });
  }

  /** A separate automatic weapon: aligning with a ship does not spend manual bombs. */
  fireOrdnance() {
    const p = this.player;
    let target: Point | undefined, targetShip: Ship | undefined, nearest = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.layer !== 'surface' || e.y + e.halfLength < 15 || e.y > p.y + e.halfLength) continue;
      const aligned = e.parts.filter(part => part.hp > 0 && Math.abs(e.x + part.x - p.x) < 20 && e.y + part.y < p.y - 25);
      const part = aligned.sort((a, b) => Math.abs(e.x + a.x - p.x) - Math.abs(e.x + b.x - p.x))[0];
      const point = part ? { x: e.x + part.x, y: e.y + part.y } : Math.abs(e.x - p.x) < e.halfWidth + 8 ? { x: p.x, y: clamp(e.y, 20, p.y - 30) } : undefined;
      if (point && point.y >= 10 && p.y - point.y < nearest) { target = point; targetShip = e; nearest = p.y - point.y; }
    }
    if (!target) return false;
    const duration = clamp(nearest / 620, .35, 1.05);
    if (targetShip) {
      target.y += targetShip.type === 'boss' ? Math.min(218-targetShip.y, targetShip.speed*duration) : targetShip.speed*duration;
      if (targetShip.type === 'boss') target.x += Math.cos(targetShip.age*.23)*42*.23*duration;
    }
    this.bullets.push({ x: p.x, y: p.y - 12, vx: (target.x - p.x) / duration, vy: (target.y - (p.y - 12)) / duration, target, flight: 0, duration, radius: 17, damage: this.damage * 10, kind: 'ordnance', dead: false });
    return true;
  }

  updateWaves(dt: number) {
    if (this.wave % 5 === 0) {
      if (!this.boss && !this.bossDefeated) this.spawnBoss();
      if (this.bossDefeated) {
        this.bossDelay -= dt;
        if (this.bossDelay <= 0) { if (this.wave === 10) this.finish(true); else this.nextWave(); }
      }
      return;
    }
    const plan = waveInfo(this.wave);
    const duration = 17 + this.wave * .6;
    if (!this.milestones.has(0)) {
      this.milestones.add(0);
      plan.sea.forEach((kind, i) => this.spawnShip(kind, plan.sea.length === 1 ? 240 : 100 + i * 140, -70 - i * 105));
      if (this.wave === 3) this.convoy = { x: 355, y: 600, hp: 3, maxHp: 3, saved: false, dead: false };
      if (this.wave === 3 || this.wave === 8) { const elite = this.spawnEnemy('heavy-bomber', 240, -75); elite.variant = this.wave === 8; }
    }
    if (this.waveTime > 9 && !this.milestones.has(1)) {
      this.milestones.add(1);
      const reinforcement = plan.sea[0];
      if (reinforcement) this.spawnShip(reinforcement, 110 + this.random() * 260, -85);
    }
    this.spawnTimer -= dt;
    if (this.waveTime < duration && this.spawnTimer <= 0 && this.enemies.filter(e => e.layer === 'air').length < 15) {
      const type = plan.air[Math.floor(this.random() * plan.air.length)];
      if (!type) return;
      const count = type === 'scout' && this.random() < .5 ? 3 : 1;
      const center = 90 + this.random() * 300;
      for (let i = 0; i < count; i++) this.spawnEnemy(type, clamp(center + (i - (count - 1) / 2) * 58, 35, WIDTH - 35), -35 - i * 35);
      this.spawnTimer = Math.max(.72, 1.35 - this.wave * .05) + this.random() * .35;
    }
    if (this.waveTime > duration && (!this.enemies.some(e => !e.dead) || this.waveTime > duration + 7)) this.nextWave();
  }

  nextWave() {
    if (this.convoy && !this.convoy.dead && !this.convoy.saved) this.resolveEscort(true);
    this.wave++;
    this.waveTime = 0;
    this.spawnTimer = 1.2;
    this.milestones.clear();
    this.bossDefeated = false;
    if (this.wave === 6) { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2); this.bombs = Math.min(5, this.bombs + 1); this.emit({ type: 'pickup', text: '舰队补给 · 装甲 +2 / 航弹 +1' }); }
    this.emit({ type: 'wave', wave: this.wave });
  }

  spawnEnemy(type: EnemyPlane['type'], x: number, y: number) {
    const heavy = type === 'heavy-bomber', gunship = type === 'gunship';
    const health = (heavy ? 430 : gunship ? 75 : type === 'torpedo' ? 52 : 24) * (1 + (this.wave - 1) * .09);
    const direction = this.random() < .5 ? 1 : -1;
    const e: EnemyPlane = { id: this.allocateId(), type, layer: 'air', x: type === 'interceptor' ? (direction > 0 ? -35 : WIDTH + 35) : x, y: type === 'interceptor' ? 100 + this.random() * 180 : y, originX: x, age: 0, phase: this.random() * Math.PI * 2, hp: health, maxHp: health, radius: heavy ? 42 : gunship ? 23 : 16, speed: (heavy ? 34 : gunship ? 54 : type === 'dart' ? 145 : type === 'torpedo' ? 66 : 90) + this.wave * 3, fireTimer: 1 + this.random() * 1.8, dead: false, heading: Math.PI, direction, action: 'cruise', actionTime: 0, lockedX: x, variant: false };
    this.enemies.push(e);
    return e;
  }

  private shipState(hull: ShipKind, x: number, y: number, boss: boolean) {
    const spec = HULLS[hull];
    const health = spec.hp * (boss ? 1 : 1 + this.wave * .035);
    const ship = { id: this.allocateId(), layer: 'surface', x, y, originX: x, hp: health, maxHp: health, radius: spec.halfWidth, halfWidth: spec.halfWidth, halfLength: spec.halfLength, speed: spec.speed, age: 0, fireTimer: 2, phase: 0, heading: 0, dead: false, parts: Array<ShipPart>(), launchTimer: 7, salvoTimer: 4, final: hull === 'fleet-carrier', appearance: isNavalHull(hull) ? this.fleetAppearance[hull] : undefined } satisfies Omit<Ship, 'type' | 'hull'>;
    const reference=ship.appearance&&historicalShip(ship.appearance);
    const shape=reference?navalShape(reference):undefined;
    const add = (id: PartId, name: string, px: number, py: number, hp: number, radius = 17) => {
      const point=shape?.parts[id];
      ship.parts.push({ id, name, x:point && shape ? point.x*spec.scale*shape.combatStretch : px, y:point?point.y*spec.scale:py, hp, maxHp:hp, radius, fireTimer:1.8+this.random() });
    };
    if (hull !== 'oil-depot' && hull !== 'transport') {
      add('aa-port', '左舷防空炮', -spec.halfWidth * .63, spec.halfLength * .15, boss ? 390 : hull === 'patrol-boat' ? 70 : 130, boss ? 21 : 15);
      if (hull !== 'patrol-boat' && hull !== 'coastal-battery') add('aa-starboard', '右舷防空炮', spec.halfWidth * .63, spec.halfLength * .15, boss ? 390 : 130, boss ? 21 : 15);
      if (hull !== 'coastal-battery' && hull !== 'patrol-boat') add('bridge', '舰桥', hull === 'fleet-carrier' ? spec.halfWidth * .68 : 0, -spec.halfLength * .37, boss ? 510 : 160, boss ? 23 : 16);
    }
    if (hull === 'fleet-carrier') add('flight-deck', '飞行甲板', 0, spec.halfLength * .34, 720, 32);
    return ship;
  }

  spawnShip(hull: ShipKind, x: number, y: number): Ship {
    const ship: Ship = { ...this.shipState(hull, x, y, false), ...SHIP_IDENTITIES[hull] };
    this.enemies.push(ship);
    return ship;
  }

  spawnBoss() {
    const final = this.wave === 10;
    const hull = final ? 'fleet-carrier' : 'battleship';
    const identity = final ? { type: 'boss', hull: 'fleet-carrier', final: true } as const : { type: 'boss', hull: 'battleship', final: false } as const;
    this.boss = { ...this.shipState(hull, WIDTH / 2, -170, true), ...identity };
    this.enemies.push(this.boss);
    this.emit({ type: 'boss', final });
    return this.boss;
  }

  updateEnemies(dt: number) {
    for (const e of [...this.enemies]) {
      if (e.dead) continue;
      e.age += dt;
      e.hitFlash = Math.max(0, (e.hitFlash || 0) - dt);
      if (e.layer === 'surface') this.updateShip(e, dt);
      else {
        this.updatePlane(e, dt);
        if (this.player.invincible <= 0 && distance2(e, this.player) < (e.radius + this.player.radius) ** 2) { this.hurt(); this.damageEnemy(e, 99999); }
      }
      if (e.y > HEIGHT + (e.layer === 'surface' ? e.halfLength + 30 : 70) || e.x < -100 || e.x > WIDTH + 100) e.dead = true;
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  private updatePlane(e: EnemyPlane, dt: number) {
    if (e.launchAge !== undefined && e.launchAge < 2.2) {
      e.launchAge += dt;
      e.heading = clamp(e.launchAge - 1.2, 0, 1) * Math.PI;
      e.x += Math.sin(e.heading) * 100 * dt;
      e.y -= Math.cos(e.heading) * 100 * dt;
      e.originX = e.x;
      e.phase = -e.age * 1.1;
      return;
    }
    if(e.action !== 'dive') e.heading = Math.PI;
    if (e.type === 'interceptor') { e.x += e.direction * 155 * dt; e.y += 21 * dt; e.heading = e.direction > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else if (e.type === 'diver') {
      e.actionTime += dt;
      if (e.action === 'cruise') {
        e.y += 65 * dt;
        if (e.y > 150) { e.action = 'warning'; e.actionTime = 0; e.lockedX = this.player.x; }
      } else if (e.action === 'warning') {
        if (e.actionTime >= .85) { e.action = 'dive'; e.actionTime = 0; e.heading = Math.PI - Math.atan2(e.lockedX - e.x, HEIGHT - e.y); }
      } else { e.x += Math.sin(e.heading) * 340 * dt; e.y -= Math.cos(e.heading) * 340 * dt; }
    } else {
      e.y += e.speed * dt;
      e.x = e.originX + Math.sin(e.age * (e.type === 'dart' ? 2.2 : 1.1) + e.phase) * (e.type === 'heavy-bomber' ? 42 : e.type === 'gunship' ? 15 : 30);
    }
    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && e.y > 25 && e.y < HEIGHT - 160 && e.action !== 'warning') {
      if (e.type === 'torpedo') {
        const target = this.convoy && !this.convoy.dead && !this.convoy.saved ? this.convoy : { x: e.x + 70 * e.direction, y: HEIGHT + 100 };
        const angle = Math.atan2(target.y - e.y, target.x - e.x);
        this.surfaceTorpedoes.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 125, vy: Math.sin(angle) * 125, age: 0, dead: false });
        this.aimedSpread(e.x, e.y, 1, 0, 110);
      } else this.aimedSpread(e.x, e.y + 15, e.type === 'heavy-bomber' ? 7 : e.type === 'gunship' ? 3 : 1, .18, 110 + this.wave * 3);
      e.fireTimer = e.type === 'torpedo' ? 3.2 : e.type === 'heavy-bomber' ? 2.1 : 2.8 + this.random();
    }
  }

  private updateShip(e: Ship, dt: number) {
    if (e.type === 'boss') {
      e.y = Math.min(218, e.y + e.speed * dt);
      e.x = e.originX + Math.sin(e.age * .23) * 42;
    } else e.y += e.speed * dt;
    if (e.y < 20) return;
    const bridge = e.parts.find(p => p.id === 'bridge');
    const disrupted = bridge && bridge.hp <= 0 ? 1.65 : 1;
    for (const part of e.parts) {
      if (part.hp <= 0 || !part.id.startsWith('aa-')) continue;
      part.fireTimer -= dt;
      if (part.fireTimer > 0) continue;
      const count = e.type === 'boss' ? (e.hp < e.maxHp * .45 ? 5 : 3) : e.hull === 'cruiser' ? 3 : 1;
      this.aimedSpread(e.x + part.x, e.y + part.y, count, .19, e.type === 'boss' ? 140 : 115);
      part.fireTimer = (e.type === 'boss' ? 1.7 : 2.6) * disrupted * (e.hull === 'fleet-carrier' ? .9 : 1);
    }
    e.fireTimer -= dt;
    if (e.type === 'boss' && bridge && bridge.hp > 0 && e.fireTimer <= 0) {
      const count = e.final ? 13 : 11;
      for (let i = 0; i < count; i++) { const angle = .2 + i * (Math.PI - .4) / (count - 1); this.enemyShot(e.x, e.y - 30, Math.cos(angle), Math.sin(angle), 110, 'pink'); }
      e.fireTimer = e.hp < e.maxHp * .45 ? 2.2 : 3.1;
    }
    if (e.hull === 'fleet-carrier' && e.parts.some(p => p.id === 'flight-deck' && p.hp > 0)) {
      e.launchTimer -= dt;
      if (e.launchTimer <= 0 && this.enemies.filter(a => a.layer === 'air').length < 10) {
        for (const offset of [-24, 24]) {
          const plane = this.spawnEnemy(e.phase % 2 === 0 ? 'scout' : 'torpedo', clamp(e.x + offset, 35, WIDTH - 35), e.y - 45);
          plane.launchAge = 0;
          plane.heading = 0;
        }
        e.phase++;
        e.launchTimer = 6 * disrupted;
      }
    }
    e.salvoTimer -= dt;
    if ((e.hull === 'battleship' || e.hull === 'destroyer') && e.salvoTimer <= 0) { this.emit({ type: 'navalSalvo', x: e.x, y: e.y - e.halfLength * .6 }); e.salvoTimer = 5.5; }
  }

  enemyShot(x: number, y: number, dx: number, dy: number, speed: number, color: EnemyBullet['color'] = 'orange') {
    const factor = this.difficulty === 'easy' ? .72 : 1;
    if (this.enemyBullets.length >= 520) return;
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
        for (const e of this.enemies) { const d = distance2(b, e); if (!e.dead && e.layer === 'air' && d < nearest) { target = e; nearest = d; } }
        if (target) { const a = Math.atan2(target.y - b.y, target.x - b.x); b.vx += (Math.cos(a) * 400 - b.vx) * Math.min(1, dt * 5); b.vy += (Math.sin(a) * 400 - b.vy) * Math.min(1, dt * 5); }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.kind === 'ordnance') {
        b.flight += dt;
        if (b.flight >= b.duration) {
          b.dead = true;
          this.impactOrdnance(b.target, b.damage);
        }
        continue;
      }
      for (const e of this.enemies) {
        if (!e.dead && e.layer === 'air' && distance2(b, e) < (b.radius + e.radius) ** 2) { b.dead = true; this.damageEnemy(e, b.damage); this.emit({ type: 'hit', x: b.x, y: b.y, critical: b.critical ?? false }); break; }
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead && b.y > -40 && b.y < HEIGHT + 30 && b.x > -40 && b.x < WIDTH + 40);
    for (const b of this.enemyBullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (this.player.invincible <= 0 && distance2(b, this.player) < (b.radius + this.player.radius) ** 2) { b.dead = true; this.hurt(); }
    }
    this.enemyBullets = this.enemyBullets.filter(b => !b.dead && b.y > -80 && b.y < HEIGHT + 30 && b.x > -30 && b.x < WIDTH + 30);
  }

  impactOrdnance(point: Point, damage: number) {
    this.emit({ type: 'ordnance', ...point });
    for (const e of this.enemies) {
      if (e.dead || e.layer !== 'surface' || Math.abs(point.x - e.x) > e.halfWidth + 13 || Math.abs(point.y - e.y) > e.halfLength + 13) continue;
      const part = e.parts.find(p => p.hp > 0 && distance2(point, { x: e.x + p.x, y: e.y + p.y }) < (p.radius + 12) ** 2);
      if (part) this.damagePart(e, part.id, damage);
      this.damageEnemy(e, damage * (part ? .75 : 1));
      break;
    }
  }

  damagePart(ship: Ship, id: PartId, damage: number) {
    const part = ship.parts.find(p => p.id === id);
    if (ship.dead || !part || part.hp <= 0) return;
    part.hp = Math.max(0, part.hp - damage);
    if (part.hp === 0) { this.score += 120; this.emit({ type: 'partDestroyed', x: ship.x + part.x, y: ship.y + part.y, name: part.name }); }
  }

  damageEnemy(e: Enemy, damage: number) {
    if (e.dead) return;
    e.hp -= damage; e.hitFlash = .08;
    if (e.hp > 0) return;
    e.hp = 0;
    e.dead = true;
    this.kills++;
    const isBoss = e.type === 'boss', heavy = e.type === 'heavy-bomber';
    this.score += e.layer === 'surface' ? HULLS[e.hull].score : heavy ? 700 : e.type === 'gunship' ? 220 : e.type === 'dart' ? 120 : 100;
    this.emit({ type: 'explosion', x: e.x, y: e.y, size: isBoss ? 4 : e.layer === 'surface' || heavy ? 2 : 1, layer: e.layer });
    if (e.layer === 'surface') {
      this.wrecks.push({ x: e.x, y: e.y, hull: e.hull, heading: e.heading, age: 0, scale: HULLS[e.hull].scale, appearance:e.appearance });
      if (e.hull === 'oil-depot') {
        this.enemyBullets = this.enemyBullets.filter(b => distance2(b, e) > 150 ** 2);
        for (const nearby of this.enemies) if (nearby !== e && !nearby.dead && distance2(e, nearby) < 140 ** 2) this.damageEnemy(nearby, 240);
      }
    }
    if (isBoss && e.layer === 'surface') {
      this.boss = null; this.bossDefeated = true; this.bossDelay = 3;
      this.enemyBullets = [];
      this.xp += 65;
      this.emit({ type: 'bossDefeated', final: e.final });
    } else {
      this.pickups.push({ x: e.x, y: e.y, type: 'xp', amount: e.layer === 'surface' ? 24 : heavy ? 45 : e.type === 'gunship' ? 17 : 9, radius: 11, dead: false });
      const chance = this.random();
      if (e.type === 'transport' || chance < .035) this.pickups.push({ x: e.x + 15, y: e.y - 10, type: 'health', radius: 13, dead: false });
      else if (chance > .986) this.pickups.push({ x: e.x + 15, y: e.y - 10, type: 'bomb', radius: 13, dead: false });
    }
  }

  private updateSea(dt: number) {
    for (const wreck of this.wrecks) { wreck.age += dt; wreck.y += 12 * dt; }
    this.wrecks = this.wrecks.filter(w => w.age < 3.2);
    const convoy = this.convoy;
    if (convoy && !convoy.dead && !convoy.saved) { convoy.y -= 18 * dt; if (convoy.y < 75) this.resolveEscort(true); }
    for (const torpedo of this.surfaceTorpedoes) {
      torpedo.age += dt; torpedo.x += torpedo.vx * dt; torpedo.y += torpedo.vy * dt;
      if (convoy && !convoy.dead && !convoy.saved && Math.abs(torpedo.x - convoy.x) < 27 && Math.abs(torpedo.y - convoy.y) < 62) {
        torpedo.dead = true; convoy.hp--;
        this.emit({ type: 'ordnance', x: torpedo.x, y: torpedo.y });
        if (convoy.hp <= 0) this.resolveEscort(false);
      }
    }
    this.surfaceTorpedoes = this.surfaceTorpedoes.filter(t => !t.dead && t.age < 8 && t.y < HEIGHT + 80 && t.x > -40 && t.x < WIDTH + 40);
  }

  private resolveEscort(saved: boolean) {
    if (!this.convoy || this.convoy.saved || this.convoy.dead) return;
    this.convoy.saved = saved;
    this.convoy.dead = !saved;
    if (saved) { this.score += 600; this.pickups.push({ x: this.player.x, y: this.player.y - 50, type: 'bomb', radius: 13, dead: false }); }
    else { this.wrecks.push({ x: this.convoy.x, y: this.convoy.y, hull: 'transport', heading: 0, age: 0, scale: HULLS.transport.scale }); this.emit({ type: 'explosion', ...this.convoy, size: 2, layer: 'surface' }); }
    this.emit({ type: 'escort', saved });
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
        if (item.type === 'xp') { this.xp += item.amount * (1 + .15 * (this.stacks.magnet || 0)); this.score += 10; }
        if (item.type === 'health') { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1); this.emit({ type: 'pickup', text: '装甲 +1' }); }
        if (item.type === 'bomb') { this.bombs = Math.min(5, this.bombs + 1); this.emit({ type: 'pickup', text: '炸弹 +1' }); }
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
      this.emit({ type: 'shieldHit' });
      return;
    }
    this.player.hp--;
    this.player.invincible = 1.7 + .3 * (this.stacks.speed || 0);
    this.emit({ type: 'hurt', x: this.player.x, y: this.player.y });
    if (this.player.hp <= 0) this.finish(false);
  }

  bomb() {
    if (this.status !== 'playing' || this.bombs <= 0) return false;
    this.bombs--;
    this.enemyBullets = [];
    this.surfaceTorpedoes = [];
    this.player.invincible = Math.max(this.player.invincible, 2);
    const damage = 460 * (1 + .2 * (this.stacks.bomb || 0));
    for (const e of [...this.enemies]) {
      if (e.layer === 'surface') {
        for (const part of e.parts) this.damagePart(e, part.id, damage * .8);
        this.damageEnemy(e, damage);
      } else this.damageEnemy(e, e.type === 'heavy-bomber' ? damage : 99999);
    }
    for (const p of this.pickups) p.magnetized = true;
    this.emit({ type: 'bomb', x: this.player.x, y: this.player.y });
    return true;
  }

  checkLevel() {
    if (this.status !== 'playing' || this.xp < this.nextXp || (this.bossDefeated && this.wave === 10)) return;
    this.xp -= this.nextXp;
    this.level++;
    this.nextXp = Math.round(42 + (this.level - 1) * 17);
    const pool = UPGRADES.filter(u => (this.stacks[u.id] || 0) < u.max && (u.id !== 'repair' || this.player.hp < this.player.maxHp));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const a = pool[i], b = pool[j];
      if (a && b) { pool[i] = b; pool[j] = a; }
    }
    this.choices = pool.slice(0, 3);
    this.status = 'upgrade';
    this.emit({ type: 'upgrade', choices: this.choices, level: this.level });
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
    this.emit({ type: 'upgraded', upgrade });
    return true;
  }

  finish(victory: boolean) {
    if (this.status !== 'playing') return;
    this.status = victory ? 'victory' : 'gameover';
    if (victory) this.score += 5000 + this.player.hp * 300;
    this.emit({ type: 'end', victory, score: this.score, kills: this.kills, wave: this.wave, time: this.time });
  }
}
