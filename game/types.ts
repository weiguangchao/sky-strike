import type { HistoricalShipId } from './naval-history.ts';

export const CRAFT_IDS = ['falcon', 'swift', 'turtle'] as const;
export type CraftId = typeof CRAFT_IDS[number];
export const isCraftId = (input: unknown): input is CraftId => CRAFT_IDS.some(id => id === input);
export const isDifficulty = (input: unknown): input is Difficulty => input === 'normal' || input === 'easy';
export type EntityId = number & { readonly __brand: 'EntityId' };
export const isEntityId = (input: number): input is EntityId => Number.isSafeInteger(input) && input >= 0;
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
  id: EntityId; hp: number; maxHp: number; radius: number;
  age: number; fireTimer: number; phase: number; dead: boolean; heading: number; hitFlash?: number;
}
export interface EnemyPlane extends EnemyBase {
  type: AirKind; layer: 'air'; originX: number; speed: number; direction: number;
  action: 'cruise' | 'warning' | 'dive'; actionTime: number; lockedX: number; variant: boolean; launchAge?: number;
}
export interface ShipPart extends Point { id: PartId; name: string; radius: number; hp: number; maxHp: number; fireTimer: number }
interface ShipBase extends EnemyBase {
  layer: 'surface'; parts: ShipPart[];
  appearance: HistoricalShipId | undefined;
  halfWidth: number; halfLength: number; speed: number; originX: number; launchTimer: number; salvoTimer: number; final: boolean;
}
export type Boss = ShipBase & ({ type: 'boss'; hull: 'battleship'; final: false } | { type: 'boss'; hull: 'fleet-carrier'; final: true });
export type Ship = Boss | { [Hull in ShipKind]: ShipBase & { type: Hull; hull: Hull } }[ShipKind];
export type Enemy = EnemyPlane | Ship;
interface BulletBase extends Point {
  vx: number; vy: number; damage: number; radius: number; dead: boolean;
}
export type Bullet =
  | (BulletBase & { kind: 'laser' | 'missile'; critical?: boolean })
  | (BulletBase & { kind: 'ordnance'; target: Point; flight: number; duration: number });
export interface EnemyBullet extends Point { vx: number; vy: number; radius: number; color: 'orange' | 'pink'; dead?: boolean }
interface PickupBase extends Point { radius: number; dead: boolean; magnetized?: boolean }
export type Pickup = (PickupBase & { type: 'xp'; amount: number }) | (PickupBase & { type: 'health' | 'bomb' });
export interface Wreck extends Point { hull: ShipKind; heading: number; age: number; scale: number; appearance?: HistoricalShipId | undefined }
export interface SurfaceTorpedo extends Point { vx: number; vy: number; age: number; dead: boolean }
export interface Convoy extends Point { hp: number; maxHp: number; saved: boolean; dead: boolean }
export interface Result { victory: boolean; score: number; kills: number; wave: number; time: number }
export type GameEvent =
  | { type: 'start' | 'pause' | 'resume' | 'menu' | 'shoot' | 'shieldHit' }
  | { type: 'wave'; wave: number }
  | { type: 'boss' | 'bossDefeated'; final: boolean }
  | (Point & { type: 'partDestroyed'; name: string })
  | (Point & { type: 'ordnance' | 'navalSalvo' | 'hurt' | 'bomb' })
  | { type: 'escort'; saved: boolean }
  | (Point & { type: 'explosion'; size: number; layer: 'air' | 'surface' })
  | (Point & { type: 'hit'; critical: boolean })
  | { type: 'pickup'; text: string }
  | { type: 'upgrade'; choices: Upgrade[]; level: number }
  | { type: 'upgraded'; upgrade: Upgrade }
  | (Result & { type: 'end' });
