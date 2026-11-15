export type CraftId = 'falcon' | 'swift' | 'turtle';
export type Difficulty = 'normal' | 'easy';
export type GameStatus = 'menu' | 'playing' | 'paused' | 'upgrade' | 'gameover' | 'victory';
export type AirKind = 'scout' | 'gunship' | 'dart' | 'interceptor' | 'diver' | 'torpedo' | 'heavy-bomber';
export type ShipKind = 'patrol-boat' | 'destroyer' | 'cruiser' | 'battleship' | 'fleet-carrier' | 'coastal-battery' | 'oil-depot' | 'transport';
export type EnemyKind = AirKind | ShipKind | 'boss';
export type PartId = 'aa-port' | 'aa-starboard' | 'bridge' | 'flight-deck';
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
  id: number; type: EnemyKind; layer: 'air' | 'surface'; hp: number; maxHp: number; radius: number;
  age: number; fireTimer: number; phase: number; dead: boolean; heading: number; hitFlash?: number;
}
export interface EnemyPlane extends EnemyBase {
  type: AirKind; layer: 'air'; originX: number; speed: number; direction: number;
  action: 'cruise' | 'warning' | 'dive'; actionTime: number; lockedX: number; variant: boolean; launchAge?: number;
}
export interface ShipPart extends Point { id: PartId; name: string; radius: number; hp: number; maxHp: number; fireTimer: number }
export interface Ship extends EnemyBase {
  type: ShipKind | 'boss'; layer: 'surface'; hull: ShipKind; parts: ShipPart[];
  appearance?: HistoricalShipId;
  halfWidth: number; halfLength: number; speed: number; originX: number; launchTimer: number; salvoTimer: number; final: boolean;
}
export interface Boss extends Ship { type: 'boss'; hull: 'battleship' | 'fleet-carrier' }
export type Enemy = EnemyPlane | Ship;
export interface Bullet extends Point {
  vx: number; vy: number; damage: number; radius: number; critical?: boolean;
  kind: 'laser' | 'missile' | 'ordnance'; dead: boolean;
  targetX?: number; targetY?: number; flight?: number; duration?: number;
}
export interface EnemyBullet extends Point { vx: number; vy: number; radius: number; color: 'orange' | 'pink'; dead?: boolean }
export interface Pickup extends Point { type: 'xp' | 'health' | 'bomb'; amount?: number; radius: number; dead: boolean; magnetized?: boolean }
export interface Wreck extends Point { hull: ShipKind; heading: number; age: number; scale: number; appearance?:HistoricalShipId }
export interface SurfaceTorpedo extends Point { vx: number; vy: number; age: number; dead: boolean }
export interface Convoy extends Point { hp: number; maxHp: number; saved: boolean; dead: boolean }
export interface Result { victory: boolean; score: number; kills: number; wave: number; time: number }
export interface EventMap {
  start: undefined; pause: undefined; resume: undefined; menu: undefined; shoot: undefined; shieldHit: undefined;
  wave: { wave: number }; boss: { final: boolean }; bossDefeated: { final?: boolean };
  partDestroyed: Point & { name: string }; ordnance: Point; navalSalvo: Point;
  escort: { saved: boolean };
  explosion: Point & { size: number; layer?: 'air' | 'surface' }; hit: Point & { critical?: boolean }; hurt: Point; bomb: Point;
  pickup: { text: string }; upgrade: { choices: Upgrade[]; level: number }; upgraded: { upgrade: Upgrade }; end: Result;
}
export type EmptyEvent = { [K in keyof EventMap]: EventMap[K] extends undefined ? K : never }[keyof EventMap];
export type DataEvent = Exclude<keyof EventMap, EmptyEvent>;
export type GameEvent = { [K in keyof EventMap]: { type: K } & (EventMap[K] extends undefined ? object : EventMap[K]) }[keyof EventMap];
import type { HistoricalShipId } from './naval-history.ts';
