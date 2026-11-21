import { archiveServiceCountries } from './archive-service-countries.ts';
import { archiveServiceYears } from './archive-service-years.ts';
import { element as $, canvas as canvasElement, button, select, dialog, anchor } from './dom.ts';
import { isCraftId, isGameMode } from './types.ts';
import { readStorage, writeStorage, parseCampaignProgress, parsePreferences } from './storage.ts';
import type { CraftId, GameMode, Input, Result, Sortie } from './types.ts';
import { Game, CRAFTS, UPGRADES } from './engine.ts';
import { CAMPAIGN_STAGES, CHAPTERS, UNIT_NAMES, WAVES_PER_MISSION, firstUnclearedStageIndex, isStageUnlocked, stageAt, waveInfo } from './campaign.ts';
import { GameRuntime } from './runtime.ts';
import { Sound } from './audio.ts';
import { trackViewport } from './viewport.ts';
import { VISUAL_SIGNALS } from './visual-style.ts';
import { DEFAULT_FLEET, NAVAL_HULLS, historicalShip } from './naval-history.ts';
import type { FleetSelection } from './naval-history.ts';
import { ARCHIVE_COUNTRIES, ARCHIVE_SURFACE_HULLS, archiveDisplayCategory, filterArchive } from './historical-archive.ts';

for (const [name, signal] of Object.entries(VISUAL_SIGNALS)) document.documentElement.style.setProperty(`--${name}`, signal.color);

const preferences = parsePreferences({
  craft: readStorage('craft'),
  mode: readStorage('mode'),
  campaignCleared: readStorage('campaignCleared'),
  campaignMission: readStorage('campaignMission'),
  campaignProgress: readStorage('campaignProgress'),
  campaignSelection: readStorage('campaignSelection'),
  endlessChapter: readStorage('endlessChapter'),
  best: readStorage('best'),
  flights: readStorage('flights'),
  fleet: readStorage('fleet'),
  sound: readStorage('sound'),
});
let selectedCraft = preferences.craft;
let mode = preferences.mode;
const campaignCleared = new Set(preferences.campaignCleared);
let campaignSelection = CAMPAIGN_STAGES.findIndex(stage => stage.mission.id === preferences.campaignMission);
let endlessChapter = preferences.endlessChapter;
let nextMission: number | undefined;
let bestScore = preferences.best;
let flights = preferences.flights;
const selectedFleet: FleetSelection = preferences.fleet;
export const game = new Game();
game.craft = selectedCraft;
const sound = new Sound(preferences.sound);
const modalOpen = () => dialog('help-dialog').open || dialog('mission-dialog').open;
export const runtime = new GameRuntime({ canvas: canvasElement('game-canvas'), previewCanvas: canvasElement('craft-canvas'), archiveCanvas: canvasElement('archive-canvas'), combat: game, frame, keydown: handleKey, allowInput: () => !modalOpen(), unlockSound: () => sound.unlock() });
let announcementTimer = 0;
let announcementText = '';
let healthKey = '';
let uiTimer = 0;
let helpPaused = false;
let previousStatus = '';
let initializationFailed = false;
const pad = (n: number) => String(Math.floor(n)).padStart(6, '0');
const waveNum = (n: number) => String(n).padStart(2, '0');
const elapsed = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function updateRecord() {
  $('best-score').textContent = pad(bestScore);
}

function selectedSortie(): Sortie {
  return mode === 'endless'
    ? { kind: 'endless', chapter: CHAPTERS[endlessChapter] ?? CHAPTERS[0] }
    : { kind: 'campaign', stage: stageAt(campaignSelection) };
}

function selectCraft(id: CraftId) {
  if (game.status !== 'menu') return;
  const sortie = selectedSortie();
  const chapter = sortie.kind === 'campaign' ? sortie.stage.chapter : sortie.chapter;
  if (!chapter.craft.includes(id)) return;
  selectedCraft = id;
  game.craft = id;
  writeStorage({ key: 'craft', value: id });
  const c = CRAFTS[id];
  document.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach(button => { const active = button.dataset.craft === id; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  $('craft-name').textContent = c.name;
  $('craft-role').textContent = c.role.replace('战机', '');
  for (const [stat, value] of [['power', c.power], ['speed', c.speed], ['armor', c.armor]] as const) $('stat-' + stat).innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < value ? 'filled' : ''}"></i>`).join('');
  runtime.selectCraft(id);
}

function syncMissionSelection() {
  const sortie = selectedSortie();
  const chapter = sortie.kind === 'campaign' ? sortie.stage.chapter : sortie.chapter;
  const campaign = sortie.kind === 'campaign';
  const mission = campaign ? sortie.stage.mission : chapter.missions[0];
  $('mission-era').textContent = chapter.name;
  $('mission-name').textContent = campaign ? mission.name : '无尽出击';
  $('mission-meta').textContent = campaign ? `${WAVES_PER_MISSION} 波攻势 · 8–12 分钟` : `从${mission.name}开始 · 连续攻势`;
  $('mission-open-label').textContent = campaign ? '选择战役' : '选择起始章节';
  $('sector-label').textContent = campaign ? mission.name : `无尽 · ${mission.name}`;
  for (const control of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    const active = control.dataset.mode === mode;
    control.classList.toggle('active', active);
    control.setAttribute('aria-pressed', String(active));
  }
  select('chapter-select').replaceChildren(...CHAPTERS.map((entry, index) => {
    const first = CAMPAIGN_STAGES.findIndex(stage => stage.chapter === entry);
    const locked = campaign && !isStageUnlocked(first, campaignCleared);
    const option = new Option(entry.name + (locked ? '（未解锁）' : ''), String(index), false, entry === chapter);
    option.disabled = locked;
    return option;
  }));
  select('mission-select').replaceChildren(...CAMPAIGN_STAGES.flatMap((stage, index) => {
    if (stage.chapter !== chapter) return [];
    const locked = !isStageUnlocked(index, campaignCleared);
    const label = campaignCleared.has(stage.mission.id) ? '（已通关）' : locked ? '（未解锁）' : '';
    const option = new Option(stage.mission.name + label, String(index), false, index === campaignSelection);
    option.disabled = locked;
    return [option];
  }));
  $('mission-select-field').hidden = !campaign;
  $('mission-progress').textContent = campaign
    ? `已通关 ${campaignCleared.size} / ${CAMPAIGN_STAGES.length} · 每关 8–12 分钟`
    : '从所选章节起飞，依序轮转，直至坠毁。';
  for (const control of document.querySelectorAll<HTMLButtonElement>('[data-craft]')) {
    const craft = control.dataset.craft;
    control.hidden = !isCraftId(craft) || !chapter.craft.includes(craft);
  }
  selectCraft(chapter.craft.includes(selectedCraft) ? selectedCraft : chapter.craft[0]);
}

function setMode(next: GameMode) {
  if (game.status !== 'menu') return;
  mode = next;
  writeStorage({ key: 'mode', value: mode });
  syncMissionSelection();
}

function selectMission(index: number) {
  campaignSelection = index;
  writeStorage({ key: 'campaignMission', value: stageAt(index).mission.id });
}

function refreshCampaignClears() {
  const saved = parseCampaignProgress(readStorage('campaignCleared'), readStorage('campaignProgress'));
  for (const id of saved) campaignCleared.add(id);
}

function start(sortie = selectedSortie()) {
  if (initializationFailed) { location.reload(); return; }
  if (!runtime.isReady) return;
  sound.unlock();
  clearInput();
  game.fleetAppearance={...selectedFleet};
  game.start({ craft: selectedCraft, sortie });
  selectedCraft = game.craft;
  nextMission = undefined;
  $('build-list').textContent = '等待首次升级';
  $('run-build').hidden = false;
  healthKey = '';
  processEvents();
  syncState();
  syncHud();
  $('game-canvas').focus({ preventScroll: true });
}

async function goHome() {
  clearInput();
  if(document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* The browser may already be leaving fullscreen. */ }
  }
  game.menu();
  announcementTimer = 0;
  $('wave-announcement').classList.remove('visible');
  $('run-build').hidden = true;
  syncMissionSelection();
  processEvents(); syncState();
  $('start-button').focus({ preventScroll: true });
}

function togglePause() {
  clearInput();
  if (game.status === 'playing') game.pause();
  else if (game.status === 'paused') { sound.unlock(); game.resume(); }
  processEvents(); syncState();
}

function announce({ title, boss = false, duration = 2.4 }: { title: string; boss?: boolean; duration?: number }) {
  const html = `<strong>${title}</strong>`;
  if (html !== announcementText) { $('wave-announcement').innerHTML = html; announcementText = html; }
  $('wave-announcement').classList.add('visible');
  $('wave-announcement').classList.toggle('boss-warning', boss);
  announcementTimer = duration;
}

function upgradeChoices() {
  $('upgrade-options').replaceChildren(...game.choices.map((upgrade, index) => {
    const option = document.createElement('button');
    option.className = `upgrade-card${upgrade.rare ? ' rare' : ''}`;
    const rank = game.stacks[upgrade.id] ? `<span class="upgrade-rank">${(game.stacks[upgrade.id] || 0) + 1} 级</span>` : '';
    option.innerHTML = `<span class="upgrade-icon"><svg><use href="#i-${upgrade.icon}"/></svg></span><span class="upgrade-card-content"><strong>${upgrade.name}${rank}</strong><p>${upgrade.description}</p></span><span class="upgrade-number">${index + 1}</span>`;
    option.addEventListener('click', () => chooseUpgrade(index));
    return option;
  }));
}

function chooseUpgrade(index: number) {
  if (!game.chooseUpgrade(index)) return;
  sound.unlock(); clearInput();
  processEvents(); syncState(); syncHud();
  $('game-canvas').focus({ preventScroll: true });
}

function syncState() {
  const state = game.status;
  const inRun = state !== 'menu';
  document.body.classList.toggle('battle-active', inRun);
  $('start-screen').hidden = state !== 'menu';
  $('game-hud').hidden = !inRun;
  $('battle-bottom').hidden = state !== 'playing';
  $('pause-screen').hidden = state !== 'paused';
  $('upgrade-screen').hidden = state !== 'upgrade';
  $('result-screen').hidden = state !== 'gameover' && state !== 'victory';
  $('boss-hud').hidden = !game.boss || state === 'menu';
  if (state !== previousStatus) {
    document.querySelectorAll<HTMLButtonElement>('[data-craft], [data-mode], .mission-open').forEach(button => { button.disabled = inRun; });
    runtime.resize();
    if (state === 'paused') $('resume-button').focus({ preventScroll: true });
    if (state === 'upgrade') $('upgrade-options').querySelector('button')?.focus({ preventScroll: true });
    if (state === 'gameover' || state === 'victory') $('retry-button').focus({ preventScroll: true });
    previousStatus = state;
  }
}

function syncHud() {
  $('score').textContent = pad(game.score);
  $('wave').textContent = waveNum(game.wave);
  $('wave-total').textContent = game.sortie.kind === 'campaign' ? `/ ${WAVES_PER_MISSION} 波` : '波';
  $('level').textContent = String(game.level);
  $('xp-fill').style.width = `${Math.min(100, game.xp / game.nextXp * 100)}%`;
  $('bomb-count').textContent = `× ${game.bombs}`;
  button('bomb-button').disabled = game.bombs === 0;
  const currentHealth = `${game.player.hp}/${game.player.maxHp}`;
  if (healthKey !== currentHealth) {
    healthKey = currentHealth;
    $('health').innerHTML = Array.from({ length: game.player.maxHp }, (_, i) => `<i class="health-point${i >= game.player.hp ? ' empty' : ''}"></i>`).join('');
    $('health').setAttribute('aria-label', `装甲 ${game.player.hp} / ${game.player.maxHp}`);
  }
  const escort = game.convoy && !game.convoy.dead && !game.convoy.saved ? game.convoy : null;
  $('weapon-level').textContent = escort ? `护航 ${escort.hp}/${escort.maxHp} · 自动对舰` : '机炮对空 · 自动对舰';
  $('sector-label').textContent = game.activeStage.mission.name;
  $('boss-hud').hidden = !game.boss;
  if (game.boss) {
    const percent = Math.max(0, game.boss.hp / game.boss.maxHp * 100);
    $('boss-fill').style.width = `${percent}%`;
    $('boss-percent').textContent = `${Math.ceil(percent)}%`;
    $('boss-timer').textContent = elapsed(Math.ceil(game.bossTimeLeft));
    const prototype=game.boss.appearance&&historicalShip(game.boss.appearance);
    $('boss-name').textContent = `${game.boss.final?'赤潮':'铁岳'}${prototype?' · '+prototype.name:''}`;
    const names = { 'aa-port':'左炮', 'aa-starboard':'右炮', bridge:'舰桥', 'flight-deck':'甲板' };
    const html = game.boss.parts.map(part=>`<span class="${part.hp<=0?'destroyed':''}" aria-label="${part.name}${part.hp<=0?'已摧毁':'可攻击'}">${part.hp<=0?'×':'◇'} ${names[part.id]}</span>`).join('');
    if($('boss-parts').innerHTML!==html) $('boss-parts').innerHTML=html;
  }
}

function showResults(event: Result) {
  flights++;
  writeStorage({ key: 'flights', value: flights });
  const isBest = event.score > bestScore;
  if (isBest) { bestScore = event.score; writeStorage({ key: 'best', value: bestScore }); }
  const sortie = game.sortie;
  if (event.outcome === 'victory' && sortie.kind === 'campaign') {
    const index = CAMPAIGN_STAGES.findIndex(stage => stage.mission === sortie.stage.mission);
    refreshCampaignClears();
    const previousFrontier = firstUnclearedStageIndex(campaignCleared);
    if (index >= 0 && !campaignCleared.has(sortie.stage.mission.id)) {
      campaignCleared.add(sortie.stage.mission.id);
      writeStorage({ key: 'campaignCleared', value: [...campaignCleared] });
    }
    const following = index === previousFrontier ? firstUnclearedStageIndex(campaignCleared) : index + 1;
    if (index >= 0 && isStageUnlocked(following, campaignCleared)) nextMission = following;
  }
  $('result-title').textContent = event.outcome === 'victory' ? '作战胜利' : event.outcome === 'timeout' ? '旗舰未击沉' : '出击结束';
  $('retry-label').textContent = nextMission === undefined ? '再次出击' : '下一战役';
  $('result-score').textContent = pad(event.score);
  $('result-best').hidden = !isBest;
  $('result-kills').textContent = String(event.kills);
  $('result-wave').textContent = sortie.kind === 'campaign' ? `${waveNum(event.wave)}/${WAVES_PER_MISSION}` : waveNum(event.wave);
  $('result-time').textContent = elapsed(event.time);
  updateRecord();
}

function processEvents() {
  for (const event of game.drainEvents()) {
    runtime.event(event); sound.play(event.type);
    if (event.type === 'wave') {
      const wave = game.missionWave;
      if (wave % 5 === 0) announce({ title: '敌方首领接近', boss: true, duration: 3.3 });
      else if (wave === 6) announce({ title: '舰队补给抵达', duration: 3 });
      else if (event.wave === 1) announce({ title: '友军航母 · 起飞' });
      else if (wave === 1) announce({ title: game.activeStage.mission.name });
      else announce({ title: waveInfo(wave, game.activeStage.mission).name });
    }
    if (event.type === 'bossDefeated') announce({ title: event.final ? '赤潮已击沉' : '铁岳已击沉', boss: false, duration: 2.4 });
    if (event.type === 'upgrade') { clearInput(); upgradeChoices(); }
    if (event.type === 'upgraded') {
      $('build-list').innerHTML = Object.entries(game.stacks).flatMap(([id, count]) => {
        const upgrade = UPGRADES.find(upgrade => upgrade.id === id);
        return upgrade ? [`<span class="build-chip">${upgrade.name}${count > 1 ? ` ×${count}` : ''}</span>`] : [];
      }).join('');
    }
    if (event.type === 'partDestroyed') announce({ title: `${event.name}已摧毁`, boss: false, duration: 1.5 });
    if (event.type === 'escort') announce({ title: event.saved ? '护航完成 · 航弹补给' : '运输船损失 · 继续作战', boss: false, duration: 2 });
    if (event.type === 'pickup') announce({ title: event.text, boss: false, duration: 1.4 });
    if (event.type === 'end') { clearInput(); showResults(event); announcementTimer = 0; $('wave-announcement').classList.remove('visible'); }
  }
}

function toggleSound() {
  sound.enabled = !sound.enabled;
  if (sound.enabled) { sound.unlock(); sound.tone({ from: 660, to: 880, duration: .12, volume: .05 }); }
  writeStorage({ key: 'sound', value: sound.enabled });
  syncSound();
}
function syncSound() {
  document.querySelectorAll<HTMLButtonElement>('.sound-button').forEach(button => {
    const label = sound.enabled ? '关闭声音' : '开启声音';
    button.setAttribute('aria-label', label); button.title = label;
    button.querySelector('use')?.setAttribute('href', sound.enabled ? '#i-sound' : '#i-mute');
  });
}

function clearInput() { runtime.clearInput(); }
function autoPause() { clearInput(); game.pause(); processEvents(); syncState(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);
window.addEventListener('resize', () => runtime.resize());
function handleKey(event: KeyboardEvent): void {
  if (modalOpen() || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key) && game.status === 'playing') event.preventDefault();
  if (event.repeat && [' ', 'b', 'p', 'escape', 'm'].includes(key)) return;
  if (key === 'm') { event.preventDefault(); toggleSound(); }
  if ((key === 'p' || key === 'escape') && (game.status === 'playing' || game.status === 'paused')) { event.preventDefault(); togglePause(); return; }
  if ((key === ' ' || key === 'b') && game.status === 'playing') { event.preventDefault(); game.bomb(); processEvents(); syncHud(); }
  if (['1', '2', '3'].includes(key) && game.status === 'upgrade') { event.preventDefault(); chooseUpgrade(Number(key) - 1); }
}
canvasElement('game-canvas').addEventListener('contextmenu', event => event.preventDefault());

$('start-button').addEventListener('click', () => start());
$('retry-button').addEventListener('click', () => {
  if (nextMission === undefined) start(game.sortie);
  else {
    selectMission(nextMission);
    start({ kind: 'campaign', stage: stageAt(campaignSelection) });
  }
});
$('pause-restart').addEventListener('click', () => start(game.sortie));
$('pause-button').addEventListener('click', togglePause);
$('resume-button').addEventListener('click', togglePause);
$('quit-button').addEventListener('click', goHome);
$('result-home').addEventListener('click', goHome);
$('bomb-button').addEventListener('click', () => { sound.unlock(); game.bomb(); processEvents(); syncHud(); });
document.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach(button => button.addEventListener('click', () => { if (isCraftId(button.dataset.craft)) selectCraft(button.dataset.craft); }));
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => { if (isGameMode(button.dataset.mode)) setMode(button.dataset.mode); }));
for (const id of ['mission-open', 'mission-open-compact']) {
  $(id).addEventListener('click', () => {
    if (game.status !== 'menu') return;
    refreshCampaignClears();
    syncMissionSelection();
    dialog('mission-dialog').showModal();
  });
}
$('close-mission').addEventListener('click', () => dialog('mission-dialog').close());
$('chapter-select').addEventListener('change', () => {
  const index = Number(select('chapter-select').value);
  const chapter = CHAPTERS[index];
  if (game.status !== 'menu' || !chapter) return;
  if (mode === 'endless') {
    endlessChapter = index;
    writeStorage({ key: 'endlessChapter', value: index });
  } else {
    const frontier = firstUnclearedStageIndex(campaignCleared);
    const unlocked = CAMPAIGN_STAGES[frontier]?.chapter === chapter
      ? frontier
      : CAMPAIGN_STAGES.reduce((latest, stage, index) =>
        stage.chapter === chapter && campaignCleared.has(stage.mission.id) ? index : latest, -1);
    if (unlocked < 0) return;
    selectMission(unlocked);
  }
  syncMissionSelection();
});
$('mission-select').addEventListener('change', () => {
  const index = Number(select('mission-select').value);
  if (game.status !== 'menu' || !isStageUnlocked(index, campaignCleared)) return;
  selectMission(index);
  syncMissionSelection();
});
document.querySelectorAll<HTMLButtonElement>('.sound-button').forEach(button => button.addEventListener('click', toggleSound));
function syncFullscreen() {
  const label=document.fullscreenElement?'退出全屏':'全屏游戏';
  document.querySelectorAll<HTMLButtonElement>('[data-fullscreen]').forEach(button=>{
    button.hidden=!document.fullscreenEnabled;
    button.setAttribute('aria-label',label); button.title=label;
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-fullscreen]').forEach(button=>button.addEventListener('click',async()=>{
  try {
    if(document.fullscreenElement) await document.exitFullscreen();
    else await $('battlefield').requestFullscreen();
  } catch { button.title='浏览器暂未允许全屏'; }
}));
document.addEventListener('fullscreenchange',syncFullscreen);
syncFullscreen();
let campaignIndex = 0;
let activeHelp='controls';
let archiveEntries = filterArchive({});
let archiveIndex = 0, archiveRequest = 0;
const archiveCard = $('archive-card');
archiveCard.addEventListener('keydown', event => {
  if ((event.key !== 'PageDown' && event.key !== 'PageUp') || archiveCard.scrollHeight <= archiveCard.clientHeight) return;
  event.preventDefault();
  const direction = event.key === 'PageDown' ? 1 : -1;
  archiveCard.scrollBy({ top: direction * archiveCard.clientHeight, behavior: 'instant' });
});
for (const country of ARCHIVE_COUNTRIES) {
  const option = document.createElement('option');
  option.value = country.id; option.textContent = country.id === 'ru' ? '俄罗斯' : country.name;
  $('archive-country').append(option);
}
/** Each feature is its own span and the separators stay as text, so the description reads the same in both layouts. */
function showFeatures(feature: string): void {
  const clauses = feature.split(' · ');
  const items = clauses.flatMap((text, index) => {
    const item = document.createElement('span');
    const bullet = document.createElement('span');
    const words = document.createElement('span');
    bullet.className = 'fleet-feature-bullet'; bullet.setAttribute('aria-hidden', 'true');
    words.className = 'fleet-feature-text';
    // Phrases end after 与／、 or before a number, so a wrap lands between words rather than inside 双联 or 收起轮.
    for (const phrase of text.split(/(?<=[与、／])|(?<=[^0-9A-Za-z.\s-])(?=[0-9])/)) {
      const block = document.createElement('span');
      block.className = 'fleet-feature-phrase';
      // Numbers keep their unit and Latin designations stay whole, so a wrap never splits 203毫米 or HS6A.
      for (const part of phrase.split(/([0-9A-Za-z.-]+(?:毫米|厘米|千米|公里|海里|英寸|英尺|万吨|米|吨|节|年)?)/)) {
        if (!part) continue;
        if (!/[0-9A-Za-z]/.test(part)) { block.append(part); continue; }
        const unit = document.createElement('span');
        unit.className = 'fleet-feature-unit'; unit.textContent = part;
        block.append(unit);
      }
      words.append(block);
    }
    // The separator closes the clause's last phrase, so the paragraph can break after it but never before it.
    if (index < clauses.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'fleet-feature-separator'; separator.textContent = ' ·';
      words.lastElementChild?.append(separator);
    }
    item.className = 'fleet-feature'; item.append(bullet, words);
    return index < clauses.length - 1 ? [item, ' '] : [item];
  });
  $('archive-shape').replaceChildren(...items);
}
/**
 * Features become a ruled list that fills the column when it fits, in the same type size on every entry. A card that is a
 * few pixels short keeps a compact list without rules; only when even that overflows do the features stay one paragraph
 * that wraps between phrases, as the original description did. In windows too short for any, the card may scroll.
 */
function fitArchiveFeatures(): void {
  const listable = $('archive-shape').querySelectorAll('.fleet-feature').length > 1;
  archiveCard.dataset.features = 'list';
  if (listable) for (const size of ['regular', 'compact']) {
    archiveCard.dataset.featureSize = size;
    if (archiveCard.scrollHeight <= archiveCard.clientHeight) return;
  }
  archiveCard.dataset.features = 'inline';
  archiveCard.dataset.featureSize = 'regular';
}
new ResizeObserver(fitArchiveFeatures).observe(archiveCard);
void document.fonts.ready.then(fitArchiveFeatures);
async function showArchive(index: number): Promise<void> {
  const request = ++archiveRequest;
  archiveIndex = archiveEntries.length ? (index + archiveEntries.length) % archiveEntries.length : 0;
  archiveCard.scrollTo({ top: 0, behavior: 'instant' });
  $('archive-illustration').classList.add('loading');
  const entry = archiveEntries[archiveIndex];
  if (!entry) {
    $('archive-name').textContent = '没有符合条件的型号';
    $('archive-nation').textContent = '';
    $('archive-service').textContent = '';
    $('archive-role').textContent = '';
    $('archive-count').textContent = '0 / 0';
    showFeatures('当前目录仍在补录，请调整筛选。');
    $('archive-operators').textContent = '';
    $('archive-source').hidden = true;
    fitArchiveFeatures();
    $('archive-status').textContent = '暂无图像';
    return;
  }
  const name = $('archive-name');
  const [first, ...rest] = entry.name.split('·');
  name.textContent = first ?? '';
  for (const part of rest) name.append('·', document.createElement('wbr'), part);
  const ship = entry.category === 'surface' ? historicalShip(entry.id) : undefined;
  const soviet = ship?.navy === 'su' || entry.id === 'project-971' || entry.id === 'mig21pf';
  const appearanceCountry = entry.country === 'ru' ? soviet ? '苏联' : '俄罗斯' :
    ARCHIVE_COUNTRIES.find(country => country.id === entry.country)?.name ?? entry.country;
  const serviceCountries = archiveServiceCountries(entry);
  const operators = serviceCountries.map(id => id === 'ru' ? '俄罗斯' : ARCHIVE_COUNTRIES.find(country => country.id === id)?.name ?? id);
  const operatorsLabel = entry.id === 'c46a' || entry.id === 'c119c' ? '系列曾服役' : '曾服役';
  const service = archiveServiceYears(entry.id);
  const category = archiveDisplayCategory(entry);
  $('archive-nation').textContent = appearanceCountry;
  $('archive-service').textContent = service.label;
  $('archive-role').textContent = service.scope ? `${category} · ${service.scope}` : category;
  // Each country name stays whole; the line may only break after a ／.
  $('archive-operators').replaceChildren(...serviceCountries.length > 1 ? [`${operatorsLabel}：`, ...operators.map((country, index) => {
    const name = document.createElement('span');
    name.className = 'fleet-operator'; name.textContent = index < operators.length - 1 ? `${country}／` : country;
    return name;
  })] : []);
  $('archive-count').textContent = `${archiveIndex + 1} / ${archiveEntries.length}`;
  showFeatures(entry.feature);
  $('archive-shape').title = entry.note;
  select('archive-entry').value = entry.id;
  const source = anchor('archive-source');
  source.href = entry.source; source.hidden = false;
  source.setAttribute('aria-label', `${entry.name}的历史资料，打开新标签页`);
  // Text and layout are final before the first await, so the card never shows a stale fit while the sprite loads.
  fitArchiveFeatures();
  $('archive-status').textContent = '图像载入中';
  try {
    await runtime.loadArchiveModel(entry.modelId);
    if (request !== archiveRequest || activeHelp !== 'archive') return;
    runtime.selectArchiveModel(entry.modelId);
    $('archive-canvas').setAttribute('aria-label', `${entry.name} ${entry.year}年像素精灵`);
    $('archive-status').textContent = '';
    $('archive-illustration').classList.remove('loading');
  } catch {
    if (request !== archiveRequest || activeHelp !== 'archive') return;
    $('archive-status').textContent = '图像加载失败';
  }
}
function filterCenturyArchive(): void {
  const category = select('archive-category').value;
  const surfaceKind = ARCHIVE_SURFACE_HULLS.some(hull => hull === category);
  archiveEntries = filterArchive({ country: select('archive-country').value, category: surfaceKind ? 'surface' : category, era: select('archive-era').value })
    .filter(entry => !surfaceKind || historicalShip(entry.id)?.hull === category);
  $('archive-entry').replaceChildren(...archiveEntries.map(entry => {
    const option = document.createElement('option');
    option.value = entry.id; option.textContent = entry.name; return option;
  }));
  for (const id of ['archive-entry', 'archive-prev', 'archive-next']) (id === 'archive-entry' ? select(id) : button(id)).disabled = !archiveEntries.length;
  if (activeHelp === 'archive') void showArchive(0);
}
for (const id of ['archive-country', 'archive-category', 'archive-era']) $(id).addEventListener('change', filterCenturyArchive);
$('archive-prev').addEventListener('click', () => { void showArchive(archiveIndex - 1); });
$('archive-next').addEventListener('click', () => { void showArchive(archiveIndex + 1); });
$('archive-entry').addEventListener('change', () => { void showArchive(archiveEntries.findIndex(entry => entry.id === select('archive-entry').value)); });
filterCenturyArchive();
function showCampaign(index: number) {
  campaignIndex=(index+WAVES_PER_MISSION)%WAVES_PER_MISSION;
  const sortie = selectedSortie();
  const mission = game.status !== 'menu'
    ? game.activeStage.mission
    : sortie.kind === 'campaign' ? sortie.stage.mission : sortie.chapter.missions[0];
  const wave=waveInfo(campaignIndex + 1, mission);
  $('campaign-stage').textContent=mission.name;
  $('campaign-name').textContent=wave.name;
  $('campaign-objective').textContent=wave.objective;
  const ids=[...wave.air,...wave.sea];
  if(campaignIndex===2||campaignIndex===7) ids.push('heavy-bomber');
  $('campaign-roster').textContent=ids.map(id=>UNIT_NAMES[id]).join(' / ');
  $('campaign-count').textContent=`${waveNum(campaignIndex+1)} / ${WAVES_PER_MISSION} 波`;
}
function showHelpPanel(id: string) {
  activeHelp=id;
  if (id !== 'archive') archiveRequest++;
  for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-help]')) {
    const active=tab.dataset.help===id;
    tab.setAttribute('aria-selected',String(active));
    tab.tabIndex=active?0:-1;
    $(`help-${tab.dataset.help}-panel`).hidden=!active;
  }
  if(id==='campaign') showCampaign(campaignIndex);
  if(id==='archive') void showArchive(archiveIndex);
}
const helpTabs=[...document.querySelectorAll<HTMLButtonElement>('[data-help]')];
helpTabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>showHelpPanel(tab.dataset.help ?? 'controls'));
  tab.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?helpTabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+helpTabs.length)%helpTabs.length;
    const tab = helpTabs[next];
    if (tab) { showHelpPanel(tab.dataset.help ?? 'controls'); tab.focus(); }
  });
});
$('campaign-prev').addEventListener('click',()=>showCampaign(campaignIndex-1));
$('campaign-next').addEventListener('click',()=>showCampaign(campaignIndex+1));
document.querySelectorAll<HTMLButtonElement>('[data-open-help]').forEach(button=>button.addEventListener('click', () => { helpPaused = game.status === 'playing'; if (helpPaused) autoPause(); showHelpPanel('controls'); dialog('help-dialog').showModal(); }));
$('close-help').addEventListener('click', () => dialog('help-dialog').close());
dialog('help-dialog').addEventListener('close', () => { archiveRequest++; if (helpPaused && game.status === 'paused') { game.resume(); processEvents(); syncState(); } helpPaused = false; });

const stopViewportTracking=trackViewport(() => { clearInput(); runtime.resize(); });
import.meta.hot?.dispose(() => { stopViewportTracking(); runtime.destroy(); });

try {
  await runtime.init();
  await Promise.all(NAVAL_HULLS.map(async hull=>{
    try {await runtime.loadHistorical(selectedFleet[hull]);}
    catch {selectedFleet[hull]=DEFAULT_FLEET[hull];}
  }));
  game.fleetAppearance={...selectedFleet};
  syncMissionSelection(); updateRecord(); syncSound(); syncState();
  button('start-button').disabled = false;
} catch {
  initializationFailed = true;
  button('start-button').textContent = '重新加载';
  button('start-button').disabled = false;
}
function frame(dt: number, input: Input): void {
  game.step(dt, input);
  processEvents();
  if (game.status === 'playing' || game.status === 'menu') {
    if (announcementTimer > 0) { announcementTimer -= dt; if (announcementTimer <= 0) $('wave-announcement').classList.remove('visible'); }
  }
  syncState();
  uiTimer += dt;
  if (uiTimer > .08 && game.status !== 'menu') { syncHud(); uiTimer = 0; }
}
