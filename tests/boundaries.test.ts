import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAMPAIGN_STAGES, CHAPTERS, isStageUnlocked, sixteenMissionFrontier } from '../game/campaign.ts';
import { HANDBOOK_ARCHIVE } from '../game/historical-archive.ts';
import { parsePreferences, parseStoredValue } from '../game/storage.ts';
import { DEFAULT_FLEET } from '../game/naval-history.ts';
import { parseModelMetadata } from '../game/model-metadata.ts';
import { isEntityId } from '../game/types.ts';
import { isModelRevision, parseRevisions } from '../game/model-review.ts';

test('all thirty-two historical battles keep timeline order, eight per chapter, with matching sources in code and docs', () => {
  const expected = [
    '黑尔戈兰湾海战', '布罗德十四海战', '多格尔沙洲海战', '达达尼尔海峡海战', '日德兰海战', '奥特朗托海峡海战', '泽布吕赫突袭', '通德恩空袭',
    '塔兰托空袭', '追击俾斯麦号', '珊瑚海海战', '中途岛海战', '北角海战', '菲律宾海海战', '莱特湾海战', '吴港空袭',
    '仁川登陆', '塞得港登陆', '特里登特行动', '拉塔基亚海战', '圣卡洛斯湾登陆', '锡德拉湾之战', '真诚意志行动', '祈祷螳螂行动',
    '布比延海战', '科威特外海炮击', '慎重武力行动', '科索沃空中战役', '阿富汗空中战役', '法奥半岛登陆', '亚丁湾反海盗行动', '统一保护者行动',
  ];
  assert.deepEqual(CAMPAIGN_STAGES.map(stage => stage.mission.name), expected);
  assert.deepEqual(CHAPTERS.map(chapter => chapter.missions.length), [8, 8, 8, 8]);
  const years = CAMPAIGN_STAGES.map(stage => stage.mission.history.year);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  assert.equal(new Set(CAMPAIGN_STAGES.map(stage => stage.mission.id)).size, CAMPAIGN_STAGES.length);
  const guide = readFileSync(new URL('../dcos/feature/gameplay.md', import.meta.url), 'utf8');
  const sources = [...guide.matchAll(/^\| (\d{4}) \| ([^|]+?) \| \[[^\]]+\]\((https:\/\/[^)]+)\) \|$/gm)];
  assert.deepEqual(
    sources.map(row => [Number(row[1]), row[2], row[3]]),
    CAMPAIGN_STAGES.map(({ mission }) => [mission.history.year, mission.name, mission.history.source]),
  );
});

test('mission briefings link only to handbook archive entries, each at most once', () => {
  const archive = new Set(HANDBOOK_ARCHIVE.map(entry => entry.id));
  for (const { mission } of CAMPAIGN_STAGES) {
    const ids = mission.history.archive.map(reference => reference.id);
    assert.ok(ids.every(id => archive.has(id)), mission.name);
    assert.equal(new Set(ids).size, ids.length, mission.name);
    assert.ok(mission.history.summary.length <= 75, `${mission.name} briefing fits the handbook card`);
    assert.match(mission.history.date, new RegExp(`^${mission.history.year}年`), mission.name);
  }
});

test('storage decodes legacy values and versioned values while rejecting broken or future data', () => {
  assert.equal(parseStoredValue('"swift"'), 'swift');
  assert.deepEqual(parseStoredValue('{"battleship":"richelieu"}'), { battleship: 'richelieu' });
  assert.equal(parseStoredValue('{"version":1,"value":"turtle"}'), 'turtle');
  for (const value of [null, '{', '{"version":2,"value":"swift"}', '{"version":1}']) assert.equal(parseStoredValue(value), null);
});

test('preferences reject malformed primitives and keep valid fleet selections', () => {
  const preferences = parsePreferences({ craft: {}, mode: 'impossible', campaignCleared: 'invalid', campaignSixteenOrder: 'invalid', campaignMission: {}, campaignProgress: 100, campaignSelection: 2, endlessChapter: -1, best: -1, flights: Infinity, fleet: { battleship: 'richelieu', destroyer: 'akagi' }, sound: 'false' });
  assert.equal(preferences.craft, 'falcon');
  assert.equal(preferences.mode, 'campaign');
  assert.deepEqual(preferences.campaignCleared, []);
  assert.equal(preferences.campaignSixteenOrder, false);
  assert.equal(preferences.campaignMission, 'dawn-seas');
  assert.equal(preferences.endlessChapter, 0);
  assert.equal(preferences.best, 0);
  assert.equal(preferences.flights, 0);
  assert.equal(preferences.sound, false);
  assert.deepEqual(preferences.fleet, { ...DEFAULT_FLEET, battleship: 'richelieu' });
  const valid = { craft: 'turtle', mode: 'endless', campaignCleared: ['dawn-seas', 'blockade-route'], campaignSixteenOrder: true, campaignMission: 'fog-convoy', endlessChapter: 3, best: 42, flights: 2, fleet: null, sound: true };
  assert.deepEqual(parsePreferences({ ...valid, campaignProgress: null, campaignSelection: null }), { ...valid, fleet: DEFAULT_FLEET });
  const saved = ['dawn-seas', 'dawn-seas', null, 'blockade-route', 'unknown'];
  const deduplicated = parsePreferences({ ...valid, campaignCleared: saved, campaignMission: 'coral-sea', campaignProgress: 8, campaignSelection: 7 });
  assert.deepEqual(deduplicated.campaignCleared, valid.campaignCleared);
  assert.equal(deduplicated.campaignMission, 'fog-convoy');
});

test('legacy campaign indices migrate to the matching missions rather than newly inserted stages', () => {
  const legacy = { craft: null, mode: null, campaignCleared: null, campaignSixteenOrder: null, campaignMission: null, campaignProgress: 5, campaignSelection: 4, endlessChapter: null, best: null, flights: null, fleet: null, sound: null };
  const migrated = parsePreferences(legacy);
  assert.deepEqual(migrated.campaignCleared, ['dawn-seas', 'blockade-route', 'coral-sea', 'island-counteroffensive', 'polar-patrol']);
  assert.equal(migrated.campaignMission, 'polar-patrol');
  assert.equal(migrated.campaignSixteenOrder, true);
  assert.equal(parsePreferences({ ...legacy, campaignSelection: 5 }).campaignMission, 'fog-convoy');
  assert.equal(parsePreferences({ ...legacy, campaignProgress: 8, campaignSelection: 7 }).campaignMission, 'skyline');
});

test('a sixteen-mission save keeps following its old order while inserted battles unlock along the timeline', () => {
  const empty = { craft: null, mode: null, campaignCleared: null, campaignSixteenOrder: null, campaignMission: null, campaignProgress: null, campaignSelection: null, endlessChapter: null, best: null, flights: null, fleet: null, sound: null };
  const sixteen = parsePreferences({ ...empty, campaignCleared: ['dawn-seas', 'blockade-route', 'fog-convoy', 'tide-break'], campaignMission: 'coral-sea' });
  assert.equal(sixteen.campaignSixteenOrder, true);
  assert.equal(sixteen.campaignMission, 'coral-sea');
  assert.equal(parsePreferences({ ...empty, campaignCleared: sixteen.campaignCleared, campaignMission: 'taranto' }).campaignMission, 'coral-sea');
  const cleared = new Set(sixteen.campaignCleared);
  const unlocked = (id: string) => isStageUnlocked(CAMPAIGN_STAGES.findIndex(stage => stage.mission.id === id), cleared, true);
  assert.ok(unlocked('coral-sea'));
  assert.ok(unlocked('broad-fourteens'));
  assert.ok(!unlocked('dardanelles'));
  assert.ok(!unlocked('taranto'));
  assert.ok(!unlocked('island-counteroffensive'));
  // Clearing the kept mission opens the next one in the old order, as the sixteen-mission release did.
  cleared.add('coral-sea');
  assert.ok(unlocked('island-counteroffensive'));
  assert.ok(!unlocked('north-cape'));
  assert.equal(sixteenMissionFrontier(cleared), CAMPAIGN_STAGES.findIndex(stage => stage.mission.id === 'island-counteroffensive'));
  assert.equal(sixteenMissionFrontier(new Set(CAMPAIGN_STAGES.map(stage => stage.mission.id))), -1);
  // A new save is settled on its first load, so clearing the first battle opens only the next one on the timeline.
  const current = parsePreferences({ ...empty, campaignCleared: ['dawn-seas'], campaignSixteenOrder: false, campaignMission: 'blockade-route' });
  assert.equal(current.campaignSixteenOrder, false);
  assert.equal(current.campaignMission, 'broad-fourteens');
  assert.equal(parsePreferences(empty).campaignSixteenOrder, false);
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
