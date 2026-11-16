import Phaser from 'phaser';
import { WIDTH, HEIGHT, TAKEOFF_DURATION } from './engine.ts';
import type { Game } from './engine.ts';
import type { GameEvent, Ship, ShipKind } from './types.ts';
import { HULLS } from './campaign.ts';
import { historicalModel } from './naval-history.ts';
import { unitModel } from './models.ts';
import type { ModelId } from './models.ts';
import { SpriteLibrary, spriteAsset, spriteFrame } from './sprites.ts';
import { VISUAL_SIGNALS } from './visual-style.ts';

class SpritePool {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private used = 0;
  constructor(private readonly scene: Phaser.Scene, private readonly layer: Phaser.GameObjects.Container) {}
  begin(): void { this.used = 0; }
  draw(id: ModelId, frameName: string, x: number, y: number, sx: number, sy = sx, rotation = 0, alpha = 1): Phaser.GameObjects.Image {
    const frame = spriteFrame(id, frameName);
    let image = this.images[this.used++];
    if (!image) { image = this.scene.add.image(0, 0, id, frameName); this.layer.add(image); this.images.push(image); }
    image.setTexture(id, frameName).setOrigin(frame.originX, frame.originY).setPosition(x, y)
      .setDisplaySize(frame.worldWidth * sx, frame.worldHeight * sy).setRotation(rotation).setAlpha(alpha).setVisible(true).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    return image;
  }
  finish(): void { for (let i = this.used; i < this.images.length; i++) this.images[i]?.setVisible(false); }
}

export class Renderer {
  readonly library: SpriteLibrary;
  private readonly root: Phaser.GameObjects.Container;
  private readonly sea: Phaser.GameObjects.TileSprite;
  private readonly islands: SpritePool;
  private readonly ships: SpritePool;
  private readonly aircraft: SpritePool;
  private readonly bullets: SpritePool;
  private readonly pickups: SpritePool;
  private readonly hostile: SpritePool;
  private readonly wakes: Phaser.GameObjects.Graphics;
  private readonly surface: Phaser.GameObjects.Graphics;
  private readonly shadows: Phaser.GameObjects.Graphics;
  private readonly rotors: Phaser.GameObjects.Graphics;
  private readonly hitPoint: Phaser.GameObjects.Graphics;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly rings = new Set<Phaser.GameObjects.Arc>();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private time = 0;
  private previousX = WIDTH / 2;
  private bank = 0;
  private effectsPaused = false;

  constructor(private readonly scene: Phaser.Scene, private readonly combat: Game) {
    this.library = new SpriteLibrary(scene);
    this.root = scene.add.container(0, 0).setScale(.5);
    for (const [key, deep, shallow] of [['sea-day', '#123954', '#1c455e'], ['sea-storm', '#172f50', '#203e5b']] as const) {
      const texture = scene.textures.createCanvas(key, 128, 128);
      if (!texture) throw new Error('Sea texture could not be created');
      const context = texture.context;
      context.fillStyle = deep; context.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
        if (Math.sin(y * .08 + Math.sin(x * .04) * 1.4) > .1) { context.fillStyle = shallow; context.fillRect(x, y, 4, 4); }
        if ((x * 7 + y * 3) % 101 < 4) { context.fillStyle = '#28546a'; context.fillRect(x, y, 8, 2); }
      }
      texture.refresh();
    }
    this.sea = scene.add.tileSprite(0, 0, WIDTH, HEIGHT, 'sea-day').setOrigin(0);
    this.root.add(this.sea);
    const layer = () => { const layer = scene.add.container(); this.root.add(layer); return layer; };
    const graphics = () => { const graphics = scene.add.graphics(); this.root.add(graphics); return graphics; };
    this.islands = new SpritePool(scene, layer());
    this.wakes = graphics(); this.ships = new SpritePool(scene, layer()); this.surface = graphics();
    this.shadows = graphics(); this.aircraft = new SpritePool(scene, layer()); this.rotors = graphics();
    this.bullets = new SpritePool(scene, layer());
    const spark = scene.add.graphics().fillStyle(0xffffff).fillRect(0, 0, 4, 4);
    spark.generateTexture('spark', 4, 4); spark.destroy();
    this.sparks = scene.add.particles(0, 0, 'spark', { emitting: false, lifespan: { min: 260, max: 650 }, speed: { min: 16, max: 90 }, scale: { start: 1.6, end: .2 }, alpha: { start: .85, end: 0 }, tint: [0xffd184, 0xe49a4b, 0x53626a], maxParticles: 350 });
    this.root.add(this.sparks);
    this.pickups = new SpritePool(scene, layer()); this.hitPoint = graphics(); this.hostile = new SpritePool(scene, layer());
  }

  event(event: GameEvent): void {
    if (event.type === 'start' || event.type === 'menu') {
      this.sparks.killAll(); this.scene.tweens.killAll();
      for (const ring of this.rings) ring.destroy();
      this.rings.clear(); this.scene.cameras.main.resetFX(); this.bank = 0; this.previousX = WIDTH / 2;
    }
    if (event.type === 'explosion' || event.type === 'hurt' || event.type === 'ordnance' || event.type === 'partDestroyed' || event.type === 'navalSalvo') {
      const strength = event.type === 'explosion' ? event.size : event.type === 'ordnance' ? .65 : .9;
      this.sparks.explode(Math.round(18 * strength), event.x, event.y);
      if (!this.reducedMotion && event.type !== 'ordnance' && event.type !== 'navalSalvo') this.scene.cameras.main.shake(100, strength * .002);
    }
    if (event.type === 'bomb' || event.type === 'shieldHit') {
      const ring = this.scene.add.circle(this.combat.player.x, this.combat.player.y, 8).setStrokeStyle(2, event.type === 'bomb' ? 0xf2dfaf : 0xa9be8c, .8);
      this.root.add(ring); this.rings.add(ring); this.root.moveBelow<Phaser.GameObjects.GameObject>(ring, this.sparks);
      this.scene.tweens.add({ targets: ring, scale: event.type === 'bomb' ? 110 : 10, alpha: 0, duration: this.reducedMotion ? 180 : 650, onComplete: () => { this.rings.delete(ring); ring.destroy(); } });
      if (!this.reducedMotion && event.type === 'bomb') this.scene.cameras.main.shake(160, .006);
    }
  }

  private plane(id: ModelId, x: number, y: number, scale: number, rotation = 0, alpha = 1): void {
    const frame = spriteFrame(id, 'top');
    this.shadows.fillStyle(0x071b2b, .22).fillEllipse(x + 9, y + 14, frame.worldWidth * scale * .85, frame.worldHeight * scale * .5);
    this.aircraft.draw(id, 'top', x, y, scale, scale, rotation, alpha);
    const flicker = this.reducedMotion ? .3 : .25 + Math.sin(this.time * 65) * .1;
    for (const rotor of spriteAsset(id).propellers) {
      const rx = rotor.x * scale, ry = rotor.y * scale;
      this.rotors.lineStyle(2, 0xd6e1ce, flicker * alpha).lineBetween(x + rx * Math.cos(rotation) - ry * Math.sin(rotation) - scale * .28, y + rx * Math.sin(rotation) + ry * Math.cos(rotation), x + rx * Math.cos(rotation) - ry * Math.sin(rotation) + scale * .28, y + rx * Math.sin(rotation) + ry * Math.cos(rotation));
    }
  }

  private ship(id: ModelId, hull: ShipKind, x: number, y: number, heading: number, parts?: Ship['parts'], alpha = 1, sinking = false): void {
    const asset = spriteAsset(id), scale = HULLS[hull].scale, sx = scale * asset.combatStretch;
    for (const frame of asset.frames) {
      const partId = frame.name.split(':')[1];
      if (frame.name === 'preview') continue;
      if (frame.name.startsWith('part:') && (sinking || parts?.some(part => part.id === partId && part.hp <= 0))) continue;
      if (frame.name.startsWith('ruin:') && !sinking && !parts?.some(part => part.id === partId && part.hp <= 0)) continue;
      this.ships.draw(id, frame.name, x, y, sx, scale, -heading + (sinking ? (1 - alpha) * .3 : 0), alpha);
    }
    if (alpha > .55) this.wake(x, y, HULLS[hull].halfWidth, HULLS[hull].halfLength, alpha);
  }

  private wake(x: number, y: number, halfWidth: number, halfLength: number, alpha = 1): void {
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) this.wakes.fillStyle(i < 2 ? 0x62878a : 0x3a6171, alpha * .8).fillRect(x + side * (halfWidth * .28 + i * 3), y + halfLength * .91 + i * 8, 3, 7 + i);
  }

  private flame(x: number, y: number, size = 1): void {
    const flicker = this.reducedMotion ? 1 : .8 + Math.sin(this.time * 15 + x) * .2;
    this.surface.fillStyle(0x424d49, .8).fillRect(x - 4 * size, y - 10 * size, 10 * size, 11 * size)
      .fillStyle(0xe8a04f).fillRect(x - 4 * size, y - 4 * size, 8 * size, 10 * size * flicker)
      .fillStyle(0xffde87).fillRect(x - 2 * size, y, 4 * size, 5 * size);
  }

  render(dt: number): void {
    const game = this.combat, active = game.status === 'playing', menu = game.status === 'menu';
    if (active || (menu && !this.reducedMotion)) this.time += dt;
    const paused = !active;
    if (paused !== this.effectsPaused) {
      this.effectsPaused = paused;
      if (paused) { this.scene.tweens.pauseAll(); this.sparks.pause(); this.scene.cameras.main.resetFX(); }
      else { this.scene.tweens.resumeAll(); this.sparks.resume(); }
    }
    const pools = [this.islands, this.ships, this.aircraft, this.bullets, this.pickups, this.hostile];
    for (const pool of pools) pool.begin();
    for (const graphics of [this.wakes, this.surface, this.shadows, this.rotors, this.hitPoint]) graphics.clear();
    this.sea.setTexture(game.wave > 5 && !menu ? 'sea-storm' : 'sea-day'); this.sea.tilePositionY = -this.time * 18;
    this.islands.draw('island', 'top', 15, (this.time * 18 + 260) % 1250 - 260, 46);
    this.islands.draw('island', 'top', 500, (this.time * 18 + 760) % 1500 - 300, 37);
    if (menu || (game.wave === 1 && game.time < 5)) {
      const launching = !menu, y = launching ? 525 + Math.max(0, game.time - .35) * 150 : (this.time * 13 + 180) % 1400 - 200;
      this.ship('carrier', 'fleet-carrier', launching ? 240 : 400, y, 0);
    }
    if (menu) this.plane(game.craft, 240, 390, 85, this.reducedMotion ? 0 : Math.sin(this.time * .7) * .035);
    else {
      for (const wreck of game.wrecks) this.ship(wreck.appearance ? historicalModel(wreck.appearance) : wreck.hull, wreck.hull, wreck.x, wreck.y, wreck.heading, undefined, Math.max(0, 1 - (wreck.age / 3.2) ** 2), true);
      for (const enemy of game.enemies) {
        if (enemy.dead) continue;
        if (enemy.layer === 'surface') {
          this.ship(enemy.appearance ? historicalModel(enemy.appearance) : enemy.hull, enemy.hull, enemy.x, enemy.y, enemy.heading, enemy.parts);
          const selected = enemy.parts.filter(part => part.hp > 0 && Math.abs(game.player.x - enemy.x - part.x) < 22 && enemy.y + part.y < game.player.y - 25).sort((a, b) => Math.abs(game.player.x - enemy.x - a.x) - Math.abs(game.player.x - enemy.x - b.x))[0];
          for (const part of enemy.parts) {
            const x = enemy.x + part.x, y = enemy.y + part.y, r = part.radius;
            if (part.hp <= 0) { this.flame(x, y, part.id === 'flight-deck' ? 1 : .7); continue; }
            if (part === selected) {
              this.surface.lineStyle(1.5, 0xe8b65b, .85);
              for (const sx of [-1, 1]) for (const sy of [-1, 1]) this.surface.lineBetween(x + sx * r, y + sy * r, x + sx * (r - 5), y + sy * r).lineBetween(x + sx * r, y + sy * r, x + sx * r, y + sy * (r - 5));
            }
            if (part === selected || part.hp < part.maxHp) this.surface.fillStyle(part === selected ? 0xe8b65b : 0x8f9d7c).fillRect(x - 13, y - r - 5, 26 * part.hp / part.maxHp, 2);
          }
        } else {
          this.plane(unitModel(enemy.type, enemy.variant), enemy.x, enemy.y, enemy.type === 'heavy-bomber' ? 31 : enemy.type === 'gunship' ? 27 : 18, enemy.heading);
          if (enemy.type === 'diver' && enemy.action === 'warning') {
            this.surface.lineStyle(2, 0xb99554, .6);
            for (let fraction = .05; fraction < 1; fraction += .06) this.surface.lineBetween(enemy.x + (enemy.lockedX - enemy.x) * fraction, enemy.y + (HEIGHT - enemy.y) * fraction, enemy.x + (enemy.lockedX - enemy.x) * (fraction + .025), enemy.y + (HEIGHT - enemy.y) * (fraction + .025));
          }
        }
      }
      const convoy = game.convoy;
      if (convoy && !convoy.dead && !convoy.saved) {
        this.ship('transport', 'transport', convoy.x, convoy.y, 0);
        this.surface.fillStyle(0x77bed1).fillRect(convoy.x, convoy.y - 25, 14, 10).fillStyle(0xe9eed9).fillRect(convoy.x, convoy.y - 25, 2, 20);
      }
      for (const torpedo of game.surfaceTorpedoes) {
        this.wakes.lineStyle(3, 0x8cabad).lineBetween(torpedo.x, torpedo.y - 5, torpedo.x, torpedo.y + 5);
        for (let i = 1; i <= 4; i++) this.wakes.fillStyle(0x577982, .7).fillRect(torpedo.x - torpedo.vx * .075 * i, torpedo.y - torpedo.vy * .075 * i, 2 + i, 5);
      }
      const player = game.player;
      this.bank += (Phaser.Math.Clamp((player.x - this.previousX) * .02, -.16, .16) - this.bank) * Math.min(1, dt * 9); this.previousX = player.x;
      if (game.status !== 'gameover') {
        const alpha = game.takingOff || this.reducedMotion || player.invincible <= 0 || Math.floor(this.time * 8) % 2 === 0 ? 1 : .35;
        this.plane(game.craft, player.x, player.y, game.takingOff ? 17 + 6 * (game.time / TAKEOFF_DURATION) ** 2 : 23, this.bank, alpha);
        for (let i = 0; i < (game.stacks.drone || 0); i++) this.plane(game.craft, player.x + (i === 0 ? -43 : 43), player.y + 10, 12);
        if (player.shield) {
          this.hitPoint.fillStyle(0xb7c393, .9);
          for (const side of [-1, 1]) this.hitPoint.fillRect(player.x + side * 33 - 2, player.y - 4, 4, 8).fillRect(player.x - 4, player.y + side * 33 - 2, 8, 4);
        }
        this.hitPoint.fillStyle(0x071422).fillCircle(player.x, player.y, 6).fillStyle(0xfff1cb).fillCircle(player.x, player.y, 3.5);
      }
      for (const bullet of game.bullets) {
        if (bullet.kind === 'ordnance') {
          this.bullets.draw('enemy-aimed', 'top', bullet.x, bullet.y, 3.5 / spriteFrame('enemy-aimed', 'top').worldWidth, 6 / spriteFrame('enemy-aimed', 'top').worldHeight, Math.atan2(bullet.vy, bullet.vx) + Math.PI / 2).setTint(0xffe9a8).setTintMode(Phaser.TintModes.FILL);
          this.surface.lineStyle(1, 0xe8b65b, .65).strokeCircle(bullet.target.x, bullet.target.y, 6);
        } else this.bullets.draw('enemy-aimed', 'top', bullet.x, bullet.y, 3 / spriteFrame('enemy-aimed', 'top').worldWidth, 14 / spriteFrame('enemy-aimed', 'top').worldHeight, Math.atan2(bullet.vy, bullet.vx) + Math.PI / 2).setTint(bullet.critical ? 0xffda80 : 0xffedac).setTintMode(Phaser.TintModes.FILL);
      }
      for (const pickup of game.pickups) {
        const signal = VISUAL_SIGNALS[pickup.type], frame = spriteFrame(signal.model, 'top');
        this.pickups.draw(signal.model, 'top', pickup.x, pickup.y, signal.size / frame.worldWidth, signal.size / frame.worldHeight);
      }
      for (const bullet of game.enemyBullets) {
        const signal = bullet.color === 'pink' ? VISUAL_SIGNALS.aimed : VISUAL_SIGNALS.danger, frame = spriteFrame(signal.model, 'top');
        this.hostile.draw(signal.model, 'top', bullet.x, bullet.y, signal.size / frame.worldWidth, signal.size / frame.worldHeight, bullet.color === 'pink' ? Math.atan2(bullet.vy, bullet.vx) + Math.PI / 2 : 0);
      }
    }
    for (const pool of pools) pool.finish();
  }
}
