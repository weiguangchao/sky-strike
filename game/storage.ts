import { isCraftId, isGameMode } from './types.ts';
import { fleetSelection } from './naval-history.ts';
import { CAMPAIGN_STAGES, CHAPTERS, firstUnclearedStageIndex, isStageUnlocked, stageAt } from './campaign.ts';

// Version 1 stored a cleared count and a selected index in this fixed order.
const LEGACY_MISSIONS = [
  'dawn-seas', 'blockade-route', 'coral-sea', 'island-counteroffensive',
  'polar-patrol', 'deep-sea-watch', 'offshore-screen', 'skyline',
];

/** Storage owns JSON decoding; consumers only see parsed preferences. */
export function parseStoredValue(serialized: string | null): unknown {
  try {
    const input: unknown = JSON.parse(serialized ?? 'null');
    if (input && typeof input === 'object' && 'version' in input) {
      return input.version === 1 && 'value' in input ? input.value : null;
    }
    return input;
  } catch { return null; }
}

export function readStorage(key: keyof PreferencesInput): unknown {
  try { return parseStoredValue(localStorage.getItem(`sky-strike:${key}`)); }
  catch { return null; }
}

type StorageWrite = { [Key in keyof Preferences]: { key: Key; value: Preferences[Key] } }[keyof Preferences];
export function writeStorage({ key, value }: StorageWrite): void {
  try { localStorage.setItem(`sky-strike:${key}`, JSON.stringify({ version: 1, value })); }
  catch { /* Play remains available without storage. */ }
}

export function parseCounter(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function parseCampaignProgress(ids: unknown, legacyProgress: unknown): string[] {
  const count = parseCounter(legacyProgress);
  const saved = Array.isArray(ids)
    ? new Set<unknown>(ids)
    : new Set(count <= LEGACY_MISSIONS.length ? LEGACY_MISSIONS.slice(0, count) : []);
  return CAMPAIGN_STAGES.map(stage => stage.mission.id).filter(id => saved.has(id));
}

function parseCampaignSelection(id: unknown, legacySelection: unknown, cleared: ReadonlySet<string>): string {
  const saved = id ?? LEGACY_MISSIONS[parseCounter(legacySelection)];
  const index = CAMPAIGN_STAGES.findIndex(stage => stage.mission.id === saved);
  if (index < 0) return stageAt(0).mission.id;
  if (isStageUnlocked(index, cleared)) return stageAt(index).mission.id;
  return stageAt(firstUnclearedStageIndex(cleared)).mission.id;
}

export function parsePreferences(input: PreferencesInput) {
  const campaignCleared = parseCampaignProgress(input.campaignCleared, input.campaignProgress);
  const endlessChapter = parseCounter(input.endlessChapter);
  return {
    craft: isCraftId(input.craft) ? input.craft : 'falcon',
    mode: isGameMode(input.mode) ? input.mode : 'campaign',
    campaignCleared,
    campaignMission: parseCampaignSelection(input.campaignMission, input.campaignSelection, new Set(campaignCleared)),
    endlessChapter: endlessChapter < CHAPTERS.length ? endlessChapter : 0,
    best: parseCounter(input.best),
    flights: parseCounter(input.flights),
    fleet: fleetSelection(input.fleet),
    sound: input.sound === true,
  };
}

type PreferencesInput = Record<'craft' | 'mode' | 'campaignCleared' | 'campaignMission' | 'campaignProgress' | 'campaignSelection' | 'endlessChapter' | 'best' | 'flights' | 'fleet' | 'sound', unknown>;
export type Preferences = ReturnType<typeof parsePreferences>;
