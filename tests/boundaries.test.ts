import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAMPAIGN_STAGES } from '../game/campaign.ts';
import { parsePreferences, parseStoredValue } from '../game/storage.ts';
import { DEFAULT_FLEET } from '../game/naval-history.ts';
import { parseModelMetadata } from '../game/model-metadata.ts';
import { isEntityId } from '../game/types.ts';
import { isModelRevision, parseRevisions } from '../game/model-review.ts';

test('all sixteen historical battle names and source rows follow campaign order', () => {
  const expected = [
    '黑尔戈兰湾海战', '多格尔沙洲海战', '日德兰海战', '奥特朗托海峡海战',
    '珊瑚海海战', '中途岛海战', '菲律宾海海战', '吴港空袭',
    '仁川登陆', '塞得港登陆', '圣卡洛斯湾登陆', '祈祷螳螂行动',
    '科索沃空中战役', '阿富汗空中战役', '法奥半岛登陆', '统一保护者行动',
  ];
  assert.deepEqual(CAMPAIGN_STAGES.map(stage => stage.mission.name), expected);
  const guide = readFileSync(new URL('../dcos/feature/gameplay.md', import.meta.url), 'utf8');
  const sources = [...guide.matchAll(/^\| (\d{4}) \| ([^|]+?) \| \[[^\]]+\]\(https:\/\/[^)]+\) \|$/gm)];
  assert.deepEqual(sources.map(row => row[2]), expected);
  assert.deepEqual(sources.map(row => Number(row[1])), [
    1914, 1915, 1916, 1917, 1942, 1942, 1944, 1945, 1950, 1956, 1982, 1988, 1999, 2001, 2003, 2011,
  ]);
});

test('storage decodes legacy values and versioned values while rejecting broken or future data', () => {
  assert.equal(parseStoredValue('"swift"'), 'swift');
  assert.deepEqual(parseStoredValue('{"battleship":"richelieu"}'), { battleship: 'richelieu' });
  assert.equal(parseStoredValue('{"version":1,"value":"turtle"}'), 'turtle');
  for (const value of [null, '{', '{"version":2,"value":"swift"}', '{"version":1}']) assert.equal(parseStoredValue(value), null);
});

test('preferences reject malformed primitives and keep valid fleet selections', () => {
  const preferences = parsePreferences({ craft: {}, mode: 'impossible', campaignCleared: 'invalid', campaignMission: {}, campaignProgress: 100, campaignSelection: 2, endlessChapter: -1, best: -1, flights: Infinity, fleet: { battleship: 'richelieu', destroyer: 'akagi' }, sound: 'false' });
  assert.equal(preferences.craft, 'falcon');
  assert.equal(preferences.mode, 'campaign');
  assert.deepEqual(preferences.campaignCleared, []);
  assert.equal(preferences.campaignMission, 'dawn-seas');
  assert.equal(preferences.endlessChapter, 0);
  assert.equal(preferences.best, 0);
  assert.equal(preferences.flights, 0);
  assert.equal(preferences.sound, false);
  assert.deepEqual(preferences.fleet, { ...DEFAULT_FLEET, battleship: 'richelieu' });
  const valid = { craft: 'turtle', mode: 'endless', campaignCleared: ['dawn-seas', 'blockade-route'], campaignMission: 'fog-convoy', endlessChapter: 3, best: 42, flights: 2, fleet: null, sound: true };
  assert.deepEqual(parsePreferences({ ...valid, campaignProgress: null, campaignSelection: null }), { ...valid, fleet: DEFAULT_FLEET });
  const saved = ['dawn-seas', 'dawn-seas', null, 'blockade-route', 'unknown'];
  const deduplicated = parsePreferences({ ...valid, campaignCleared: saved, campaignMission: 'coral-sea', campaignProgress: 8, campaignSelection: 7 });
  assert.deepEqual(deduplicated.campaignCleared, valid.campaignCleared);
  assert.equal(deduplicated.campaignMission, 'fog-convoy');
});

test('legacy campaign indices migrate to the matching missions rather than newly inserted stages', () => {
  const legacy = { craft: null, mode: null, campaignCleared: null, campaignMission: null, campaignProgress: 5, campaignSelection: 4, endlessChapter: null, best: null, flights: null, fleet: null, sound: null };
  const migrated = parsePreferences(legacy);
  assert.deepEqual(migrated.campaignCleared, ['dawn-seas', 'blockade-route', 'coral-sea', 'island-counteroffensive', 'polar-patrol']);
  assert.equal(migrated.campaignMission, 'polar-patrol');
  assert.equal(parsePreferences({ ...legacy, campaignSelection: 5 }).campaignMission, 'fog-convoy');
  assert.equal(parsePreferences({ ...legacy, campaignProgress: 8, campaignSelection: 7 }).campaignMission, 'skyline');
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
