import { isCraftId, isDifficulty } from './types.ts';
import { fleetSelection } from './naval-history.ts';

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

export function readStorage(key: keyof Preferences): unknown {
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

export function parsePreferences(input: { craft: unknown; difficulty: unknown; best: unknown; flights: unknown; fleet: unknown; sound: unknown }) {
  return {
    craft: isCraftId(input.craft) ? input.craft : 'falcon',
    difficulty: isDifficulty(input.difficulty) ? input.difficulty : 'normal',
    best: parseCounter(input.best),
    flights: parseCounter(input.flights),
    fleet: fleetSelection(input.fleet),
    sound: input.sound === true,
  };
}

export type Preferences = ReturnType<typeof parsePreferences>;
