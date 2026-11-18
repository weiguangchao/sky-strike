import type { AirKind, ShipKind } from './types.ts';
import { HISTORICAL_SHIPS, historicalModel } from './naval-history.ts';
import type { HistoricalModelId } from './naval-history.ts';
import { NEW_ARCHIVE } from './historical-archive.ts';
import type { ArchiveModelId } from './historical-archive.ts';

export const MODEL_IDS = ['falcon', 'swift', 'turtle', 'scout', 'dart', 'gunship', 'boss', 'boss-final', 'carrier', 'island', 'pickup-xp', 'pickup-health', 'pickup-bomb', 'enemy-round', 'enemy-aimed', 'interceptor', 'diver', 'torpedo', 'patrol-boat', 'destroyer', 'cruiser', 'battleship', 'fleet-carrier', 'coastal-battery', 'oil-depot', 'transport'] as const;
export const HISTORICAL_MODEL_IDS=HISTORICAL_SHIPS.map(ship=>historicalModel(ship.id)).filter((id):id is HistoricalModelId=>id.startsWith('historic-'));
export const ARCHIVE_MODEL_IDS = NEW_ARCHIVE.map(entry => entry.modelId);
export const ALL_MODEL_IDS=[...MODEL_IDS,...HISTORICAL_MODEL_IDS,...ARCHIVE_MODEL_IDS];
const SCENERY_MODEL_IDS = ['island', 'pickup-xp', 'pickup-health', 'pickup-bomb', 'enemy-round', 'enemy-aimed', 'coastal-battery', 'oil-depot'] as const;
export const VEHICLE_MODEL_IDS = ALL_MODEL_IDS.filter(id => !SCENERY_MODEL_IDS.some(scenery => scenery === id));
export type ModelId = typeof MODEL_IDS[number] | HistoricalModelId | ArchiveModelId;
export function unitModel(id: AirKind | ShipKind, variant = false): ModelId { return id === 'heavy-bomber' ? (variant ? 'boss-final' : 'boss') : id; }
