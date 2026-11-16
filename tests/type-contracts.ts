import type { Boss, Bullet, EntityId, GameEvent, Pickup } from '../game/types.ts';
import type { ModelRevision } from '../game/model-review.ts';
import type { Preferences } from '../game/storage.ts';

// These compile-only checks fail if domain boundaries become permissive again.
export function typeContracts({ entity, revision, preferences }: { entity: EntityId; revision: ModelRevision; preferences: Preferences }): void {
  // @ts-expect-error A boss must be a battleship or carrier.
  const boss: Boss['hull'] = 'transport';
  // @ts-expect-error A falling bomb must carry its target and timing.
  const ordnance: Bullet = { kind: 'ordnance', x: 0, y: 0, vx: 0, vy: 0, damage: 1, radius: 1, dead: false };
  // @ts-expect-error Experience pickups always carry an amount.
  const pickup: Pickup = { type: 'xp', x: 0, y: 0, radius: 1, dead: false };
  // @ts-expect-error A wave event always carries the wave number.
  const event: GameEvent = { type: 'wave' };
  // @ts-expect-error Raw primitives cannot substitute for verified identifiers.
  const rawId: EntityId = 1;
  // @ts-expect-error A raw string cannot substitute for a verified model revision.
  const rawRevision: ModelRevision = 'revision';
  // @ts-expect-error Parsed difficulty cannot contain arbitrary stored strings.
  const difficulty: Preferences['difficulty'] = 'unknown';
  void [boss, ordnance, pickup, event, rawId, rawRevision, difficulty, entity, revision, preferences];
}
