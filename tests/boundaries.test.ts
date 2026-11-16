import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferences, parseStoredValue } from '../game/storage.ts';
import { DEFAULT_FLEET } from '../game/naval-history.ts';
import { parseModelMetadata } from '../game/model-metadata.ts';
import { isEntityId } from '../game/types.ts';
import { isModelRevision, parseRevisions } from '../game/model-review.ts';

test('storage decodes legacy values and versioned values while rejecting broken or future data', () => {
  assert.equal(parseStoredValue('"swift"'), 'swift');
  assert.deepEqual(parseStoredValue('{"battleship":"richelieu"}'), { battleship: 'richelieu' });
  assert.equal(parseStoredValue('{"version":1,"value":"turtle"}'), 'turtle');
  for (const value of [null, '{', '{"version":2,"value":"swift"}', '{"version":1}']) assert.equal(parseStoredValue(value), null);
});

test('preferences reject malformed primitives and keep valid fleet selections', () => {
  const preferences = parsePreferences({ craft: {}, difficulty: 'impossible', best: -1, flights: Infinity, fleet: { battleship: 'richelieu', destroyer: 'akagi' }, sound: 'false' });
  assert.equal(preferences.craft, 'falcon');
  assert.equal(preferences.difficulty, 'normal');
  assert.equal(preferences.best, 0);
  assert.equal(preferences.flights, 0);
  assert.equal(preferences.sound, false);
  assert.deepEqual(preferences.fleet, { ...DEFAULT_FLEET, battleship: 'richelieu' });
  const valid = parsePreferences({ craft: 'turtle', difficulty: 'easy', best: 42, flights: 2, fleet: null, sound: true });
  assert.deepEqual({ ...valid, fleet: undefined }, { craft: 'turtle', difficulty: 'easy', best: 42, flights: 2, fleet: undefined, sound: true });
});

test('model extras accept real naval metadata and reject nonfinite or malformed geometry', () => {
  assert.deepEqual(parseModelMetadata({ waterline_beam: 1, waterline_length: 4, game_role: 'destroyer', combat_stretch: 1.4, game_part: 'bridge' }), { waterline: { halfWidth: 1, halfLength: 4 }, navalRole: 'destroyer', combatStretch: 1.4, part: 'bridge', ruin: undefined });
  const empty = parseModelMetadata(null);
  for (const input of [{ waterline_beam: Infinity, waterline_length: 4 }, { waterline_beam: 1, waterline_length: -4 }, { game_role: '../../unknown', combat_stretch: NaN, game_part: 4 }, []]) assert.deepEqual(parseModelMetadata(input), empty);
});

test('semantic identifiers and model revisions are verified before entering domain code', () => {
  assert.equal(isEntityId(0), true);
  for (const id of [-1, NaN, Infinity, .5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(isEntityId(id), false);
  const revision = 'a'.repeat(64);
  assert.equal(isModelRevision(revision), true);
  assert.equal(parseRevisions({ example: revision }).get('example'), revision);
  for (const value of ['a', 1, null, '../asset']) assert.equal(isModelRevision(value), false);
  assert.throws(() => parseRevisions({ example: 'bad' }), /Invalid model revision/);
});
