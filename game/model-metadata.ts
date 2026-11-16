import { isNavalHull } from './naval-history.ts';
import type { NavalHull } from './naval-history.ts';

export interface ModelMetadata {
  waterline: { halfWidth: number; halfLength: number } | undefined;
  navalRole: NavalHull | undefined;
  combatStretch: number | undefined;
  part: string | undefined;
  ruin: string | undefined;
}

/** Three.js extras are untyped JSON. Decode them once before using model nodes. */
export function parseModelMetadata(input: unknown): ModelMetadata {
  const result: ModelMetadata = { waterline: undefined, navalRole: undefined, combatStretch: undefined, part: undefined, ruin: undefined };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  if ('waterline_beam' in input && 'waterline_length' in input
    && typeof input.waterline_beam === 'number' && Number.isFinite(input.waterline_beam) && input.waterline_beam > 0
    && typeof input.waterline_length === 'number' && Number.isFinite(input.waterline_length) && input.waterline_length > 0) {
    result.waterline = { halfWidth: input.waterline_beam, halfLength: input.waterline_length };
  }
  if ('game_role' in input && isNavalHull(input.game_role)) result.navalRole = input.game_role;
  if ('combat_stretch' in input && typeof input.combat_stretch === 'number' && Number.isFinite(input.combat_stretch) && input.combat_stretch > 0) result.combatStretch = input.combat_stretch;
  if ('game_part' in input && typeof input.game_part === 'string') result.part = input.game_part;
  if ('game_ruin' in input && typeof input.game_ruin === 'string') result.ruin = input.game_ruin;
  return result;
}
