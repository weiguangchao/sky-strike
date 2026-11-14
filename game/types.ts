export type CraftId = 'falcon' | 'swift' | 'turtle';
export type Difficulty = 'normal' | 'easy';
export type GameStatus = 'menu' | 'playing' | 'paused' | 'upgrade' | 'gameover' | 'victory';
export type EnemyKind = 'scout' | 'gunship' | 'dart' | 'boss';
export type UpgradeId = 'spread' | 'rapid' | 'power' | 'drone' | 'missile' | 'repair' | 'armor' | 'magnet' | 'shield' | 'bomb' | 'critical' | 'speed';
export interface Point { x: number; y: number }
export interface Input { x?: number; y?: number; target?: Point }
export interface Craft {
  name: string; code: string; role: string; description: string;
  power: number; speed: number; armor: number; hp: number; damage: number; rate: number; move: number; color: string;
}
export interface Upgrade { id: UpgradeId; name: string; description: string; icon: string; max: number; rare?: boolean }
export interface Player extends Point { hp: number; maxHp: number; radius: number; invincible: number; shield: boolean }
interface EnemyBase extends Point {
  type: EnemyKind; hp: number; maxHp: number; radius: number; age: number; fireTimer: number; phase: number; dead: boolean;
  hitFlash?: number;
}
export interface EnemyPlane extends EnemyBase { type: Exclude<EnemyKind, 'boss'>; originX: number; speed: number }
export interface Boss extends EnemyBase { type: 'boss'; pattern: number; final: boolean }
export type Enemy = EnemyPlane | Boss;
export interface Bullet extends Point { vx: number; vy: number; damage: number; radius: number; critical?: boolean; kind: 'laser' | 'missile'; dead: boolean }
export interface EnemyBullet extends Point { vx: number; vy: number; radius: number; color: 'orange' | 'pink'; dead?: boolean }
export interface Pickup extends Point { type: 'xp' | 'health' | 'bomb'; amount?: number; radius: number; dead: boolean; magnetized?: boolean }
export interface Result { victory: boolean; score: number; kills: number; wave: number; time: number }
export interface EventMap {
  start: undefined; pause: undefined; resume: undefined; menu: undefined; shoot: undefined; shieldHit: undefined;
  wave: { wave: number }; boss: { final: boolean }; bossDefeated: { final?: boolean };
  explosion: Point & { size: number }; hit: Point & { critical?: boolean }; hurt: Point; bomb: Point;
  pickup: { text: string }; upgrade: { choices: Upgrade[]; level: number }; upgraded: { upgrade: Upgrade }; end: Result;
}
export type EmptyEvent = { [K in keyof EventMap]: EventMap[K] extends undefined ? K : never }[keyof EventMap];
export type DataEvent = Exclude<keyof EventMap, EmptyEvent>;
export type GameEvent = { [K in keyof EventMap]: { type: K } & (EventMap[K] extends undefined ? object : EventMap[K]) }[keyof EventMap];
