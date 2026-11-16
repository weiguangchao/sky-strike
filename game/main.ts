import { element as $, canvas as canvasElement, button, select, dialog, anchor } from './dom.ts';
import { isCraftId, isDifficulty } from './types.ts';
import { readStorage, writeStorage, parsePreferences } from './storage.ts';
import type { CraftId, Difficulty, Point, Result } from './types.ts';
import { Game, CRAFTS, UPGRADES, WIDTH, HEIGHT } from './engine.ts';
import { UNIT_INFO, WAVES, waveInfo, unitInfo } from './campaign.ts';
import { Renderer } from './render.ts';
import { Sound } from './audio.ts';
import { trackViewport } from './viewport.ts';
import { VISUAL_SIGNALS } from './visual-style.ts';
import { DEFAULT_FLEET, NAVAL_HULLS, historicalShip } from './naval-history.ts';
import type { FleetSelection } from './naval-history.ts';
import { ARCHIVE_COUNTRIES, filterArchive } from './historical-archive.ts';
import { modelReviewStatus, reviewLabel, parseRevisions, parseReviewLedger } from './model-review.ts';
import revisions from './archive-revisions.json';
import reviewLedger from './model-reviews.json';

const modelRevisions = parseRevisions(revisions);
const ledger = parseReviewLedger(reviewLedger);

for (const [name, signal] of Object.entries(VISUAL_SIGNALS)) document.documentElement.style.setProperty(`--${name}`, signal.color);

const preferences = parsePreferences({ craft: readStorage('craft'), difficulty: readStorage('difficulty'), best: readStorage('best'), flights: readStorage('flights'), fleet: readStorage('fleet'), sound: readStorage('sound') });
let selectedCraft = preferences.craft;
let difficulty = preferences.difficulty;
let bestScore = preferences.best;
let flights = preferences.flights;
const selectedFleet: FleetSelection = preferences.fleet;
export const game = new Game();
game.craft = selectedCraft;
const renderer = new Renderer({ canvas: canvasElement('game-canvas'), previewCanvas: canvasElement('craft-canvas'), game, intelCanvas: canvasElement('intel-canvas') });
const sound = new Sound(preferences.sound);
const keys = new Set<string>();
let pointer: { id: number; position: Point; target: Point } | null = null;
let announcementTimer = 0;
let announcementText = '';
let healthKey = '';
let uiTimer = 0;
let helpPaused = false;
let previousStatus = '';
const pad = (n: number) => String(Math.floor(n)).padStart(6, '0');
const waveNum = (n: number) => String(n).padStart(2, '0');
const elapsed = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function updateRecord() {
  $('best-score').textContent = pad(bestScore);
}

function selectCraft(id: CraftId) {
  if (game.status !== 'menu') return;
  selectedCraft = id;
  game.craft = id;
  writeStorage({ key: 'craft', value: id });
  const c = CRAFTS[id];
  document.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach(button => { const active = button.dataset.craft === id; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  $('craft-name').textContent = c.name;
  $('craft-role').textContent = c.role.replace('战机', '');
  for (const [stat, value] of [['power', c.power], ['speed', c.speed], ['armor', c.armor]] as const) $('stat-' + stat).innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < value ? 'filled' : ''}"></i>`).join('');
  renderer.selectCraft(id);
}

function setDifficulty(mode: Difficulty) {
  if (game.status !== 'menu') return;
  difficulty = mode;
  writeStorage({ key: 'difficulty', value: mode });
  document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => { const active = button.dataset.difficulty === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}

function start() {
  sound.unlock();
  keys.clear(); pointer = null;
  game.fleetAppearance={...selectedFleet};
  game.start({ craft: selectedCraft, difficulty });
  $('build-list').textContent = '等待首次升级';
  $('run-build').hidden = false;
  healthKey = '';
  processEvents();
  syncState();
  syncHud();
  $('game-canvas').focus({ preventScroll: true });
}

async function goHome() {
  keys.clear(); pointer = null;
  if(document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* The browser may already be leaving fullscreen. */ }
  }
  game.menu();
  $('sector-label').textContent = '破晓海域';
  announcementTimer = 0;
  $('wave-announcement').classList.remove('visible');
  $('run-build').hidden = true;
  selectCraft(selectedCraft);
  processEvents(); syncState();
  $('start-button').focus({ preventScroll: true });
}

function togglePause() {
  keys.clear(); pointer = null;
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
  sound.unlock(); keys.clear(); pointer = null;
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
  document.querySelectorAll<HTMLButtonElement>('[data-craft], [data-difficulty]').forEach(button => { button.disabled = inRun; });
  if (state !== previousStatus) {
    if (state === 'paused') $('resume-button').focus({ preventScroll: true });
    if (state === 'upgrade') $('upgrade-options').querySelector('button')?.focus({ preventScroll: true });
    if (state === 'gameover' || state === 'victory') $('retry-button').focus({ preventScroll: true });
    previousStatus = state;
  }
}

function syncHud() {
  $('score').textContent = pad(game.score);
  $('wave').textContent = waveNum(game.wave);
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
  $('sector-label').textContent = game.wave>5?'风暴防线':'破晓海域';
  $('boss-hud').hidden = !game.boss;
  if (game.boss) {
    const percent = Math.max(0, game.boss.hp / game.boss.maxHp * 100);
    $('boss-fill').style.width = `${percent}%`;
    $('boss-percent').textContent = `${Math.ceil(percent)}%`;
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
  $('result-title').textContent = event.victory ? '作战胜利' : '出击结束';
  $('result-score').textContent = pad(event.score);
  $('result-best').hidden = !isBest;
  $('result-kills').textContent = String(event.kills);
  $('result-wave').textContent = `${waveNum(event.wave)}/10`;
  $('result-time').textContent = elapsed(event.time);
  updateRecord();
}

function processEvents() {
  for (const event of game.drainEvents()) {
    renderer.event(event); sound.play(event.type);
    if (event.type === 'wave') {
      if (event.wave % 5 === 0) announce({ title: '敌方首领接近', boss: true, duration: 3.3 });
      else if (event.wave === 6) announce({ title: '风暴防线 · 补给抵达', boss: false, duration: 3 });
      else announce({ title: event.wave === 1 ? '友军航母 · 起飞' : event.wave === 2 ? '对准舰船 · 自动投弹' : waveInfo(event.wave).name });
    }
    if (event.type === 'bossDefeated') announce({ title: event.final ? '赤潮已击沉' : '铁岳已击沉', boss: false, duration: 2.4 });
    if (event.type === 'upgrade') { keys.clear(); pointer = null; upgradeChoices(); }
    if (event.type === 'upgraded') {
      $('build-list').innerHTML = Object.entries(game.stacks).flatMap(([id, count]) => {
        const upgrade = UPGRADES.find(upgrade => upgrade.id === id);
        return upgrade ? [`<span class="build-chip">${upgrade.name}${count > 1 ? ` ×${count}` : ''}</span>`] : [];
      }).join('');
    }
    if (event.type === 'partDestroyed') announce({ title: `${event.name}已摧毁`, boss: false, duration: 1.5 });
    if (event.type === 'escort') announce({ title: event.saved ? '护航完成 · 航弹补给' : '运输船损失 · 继续作战', boss: false, duration: 2 });
    if (event.type === 'pickup') announce({ title: event.text, boss: false, duration: 1.4 });
    if (event.type === 'end') { keys.clear(); pointer = null; showResults(event); announcementTimer = 0; $('wave-announcement').classList.remove('visible'); }
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

function clearInput() { keys.clear(); pointer = null; }
function autoPause() { clearInput(); game.pause(); processEvents(); syncState(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('keydown', event => {
  if (dialog('help-dialog').open || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key) && game.status === 'playing') event.preventDefault();
  if (event.repeat && [' ', 'b', 'p', 'escape', 'm'].includes(key)) return;
  if (key === 'm') { event.preventDefault(); toggleSound(); }
  if ((key === 'p' || key === 'escape') && (game.status === 'playing' || game.status === 'paused')) { event.preventDefault(); togglePause(); return; }
  if ((key === ' ' || key === 'b') && game.status === 'playing') { event.preventDefault(); game.bomb(); processEvents(); syncHud(); }
  if (['1', '2', '3'].includes(key) && game.status === 'upgrade') { event.preventDefault(); chooseUpgrade(Number(key) - 1); }
  if (game.status === 'playing') keys.add(key);
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));

const canvas = canvasElement('game-canvas');
function pointerPosition(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect(), scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
  return { x: (event.clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale, y: (event.clientY - rect.top - (rect.height - HEIGHT * scale) / 2) / scale };
}
canvas.addEventListener('pointerdown', event => {
  if (game.status !== 'playing') return;
  event.preventDefault(); sound.unlock();
  canvas.setPointerCapture(event.pointerId);
  pointer = { id: event.pointerId, position: pointerPosition(event), target: { x: game.player.x, y: game.player.y } };
});
canvas.addEventListener('pointermove', event => {
  if (!pointer || pointer.id !== event.pointerId || game.status !== 'playing') return;
  event.preventDefault(); const position = pointerPosition(event);
  pointer.target.x = Math.max(24, Math.min(WIDTH - 24, pointer.target.x + (position.x - pointer.position.x) * 1.12));
  pointer.target.y = Math.max(100, Math.min(HEIGHT - 45, pointer.target.y + (position.y - pointer.position.y) * 1.12));
  pointer.position = position;
});
const releasePointer = (event: PointerEvent) => { if (pointer?.id === event.pointerId) pointer = null; };
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', releasePointer);
canvas.addEventListener('contextmenu', event => event.preventDefault());

$('start-button').addEventListener('click', start);
$('retry-button').addEventListener('click', start);
$('pause-restart').addEventListener('click', start);
$('pause-button').addEventListener('click', togglePause);
$('resume-button').addEventListener('click', togglePause);
$('quit-button').addEventListener('click', goHome);
$('result-home').addEventListener('click', goHome);
$('bomb-button').addEventListener('click', () => { sound.unlock(); game.bomb(); processEvents(); syncHud(); });
document.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach(button => button.addEventListener('click', () => { if (isCraftId(button.dataset.craft)) selectCraft(button.dataset.craft); }));
document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => button.addEventListener('click', () => { if (isDifficulty(button.dataset.difficulty)) setDifficulty(button.dataset.difficulty); }));
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
let intelIndex = 0;
let campaignIndex = 0;
let activeHelp='controls';
let archiveEntries = filterArchive({});
let archiveIndex = 0, archiveRequest = 0;
type ArchiveLoad = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed' } | { kind: 'empty' };
let archiveLoad: ArchiveLoad = { kind: 'empty' };
let archiveDetailsOpen = false;
const ordinaryHelpReady=$('help-ready').innerHTML;
for (const country of ARCHIVE_COUNTRIES) {
  const option = document.createElement('option');
  option.value = country.id; option.textContent = country.name;
  $('archive-country').append(option);
}
function archiveShip() {
  const entry = archiveEntries[archiveIndex];
  return entry?.category === 'surface' ? historicalShip(entry.id) : undefined;
}
function archiveActionLabel(): void {
  const ship = archiveShip(), actionButton = button('help-ready');
  $('archive-info').hidden = activeHelp !== 'archive' || archiveDetailsOpen || !ship;
  actionButton.disabled = !!ship && !archiveDetailsOpen && archiveLoad.kind !== 'ready' && archiveLoad.kind !== 'failed';
  actionButton.textContent = archiveDetailsOpen ? '返回图鉴' : (archiveLoad.kind === 'failed') ? '重试加载' : !archiveEntries.length ? '返回作战' :
    !ship ? '资料说明' : archiveLoad.kind !== 'ready' ? '载入模型…' : selectedFleet[ship.hull] === ship.id ? '已选用 · 返回' :
    game.status === 'menu' ? '使用本舰' : '下次出击使用';
}
function setArchiveDetails({ open, focus = false }: { open: boolean; focus?: boolean }): void {
  archiveDetailsOpen = open;
  $('archive-details').hidden = !open;
  for (const id of ['archive-card', 'archive-controls', 'archive-coverage']) $(id).hidden = open;
  archiveActionLabel();
  if (focus) $(open ? 'archive-details-title' : archiveShip() ? 'archive-info' : 'help-ready').focus({ preventScroll: true });
}
async function showArchive(index: number): Promise<void> {
  const request = ++archiveRequest;
  archiveLoad = { kind: 'loading' };
  archiveIndex = archiveEntries.length ? (index + archiveEntries.length) % archiveEntries.length : 0;
  setArchiveDetails({ open: false });
  $('archive-illustration').classList.add('loading');
  const entry = archiveEntries[archiveIndex];
  if (!entry) {
    archiveLoad = { kind: 'empty' };
    $('archive-name').textContent = '没有符合条件的型号';
    $('archive-role').textContent = '';
    $('archive-count').textContent = '0 / 0';
    $('archive-shape').textContent = '当前目录仍在补录，请调整筛选。';
    $('archive-review').textContent = '';
    $('archive-source').hidden = true;
    $('archive-status').textContent = '暂无模型';
    return;
  }
  $('archive-name').textContent = entry.name;
  const ship = archiveShip();
  const className = ship?.className && ship.className !== entry.name ? `${ship.className} · ` : '';
  $('archive-role').textContent = `${ARCHIVE_COUNTRIES.find(country => country.id === entry.country)?.name ?? entry.country} · ${className}${entry.year}年外观 · ${entry.kind}`;
  $('archive-count').textContent = `${archiveIndex + 1} / ${archiveEntries.length}`;
  $('archive-shape').textContent = entry.feature;
  $('archive-shape').title = entry.note;
  $('archive-note').textContent = entry.note;
  $('archive-reference-list').replaceChildren(...[...new Set([entry.source, ...entry.references])].map((url, index) => {
    const item = document.createElement('li'), link = document.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = index === 0 ? '主要史料 ↗' : `补充资料 ${index} ↗`;
    link.setAttribute('aria-label', `${entry.name}的${index === 0 ? '主要史料' : '补充资料'}，${new URL(url).hostname}，打开新标签页`);
    item.append(link); return item;
  }));
  const revision = modelRevisions.get(entry.modelId);
  const status = modelReviewStatus({ modelId: entry.modelId, revision, ledger });
  $('archive-review').textContent = reviewLabel(status);
  $('archive-review').dataset.state = status.state;
  select('archive-entry').value = entry.id;
  const source = anchor('archive-source');
  source.href = entry.source; source.hidden = false;
  source.setAttribute('aria-label', `${entry.name}的历史资料，打开新标签页`);
  $('archive-status').textContent = '模型载入中';
  try {
    await renderer.loadArchiveModel(entry.modelId);
    if (request !== archiveRequest || activeHelp !== 'archive') return;
    renderer.selectArchiveModel(entry.modelId, entry.category !== 'aircraft');
    $('intel-canvas').setAttribute('aria-label', `${entry.name} ${entry.year}年像素模型`);
    archiveLoad = { kind: 'ready' };
    $('archive-status').textContent = '';
    $('archive-illustration').classList.remove('loading');
    archiveActionLabel();
  } catch {
    if (request !== archiveRequest || activeHelp !== 'archive') return;
    archiveLoad = { kind: 'failed' };
    $('archive-status').textContent = '模型加载失败，请重试';
    archiveActionLabel();
  }
}
function filterCenturyArchive(): void {
  const category = select('archive-category').value;
  const surfaceKind = ['fleet-carrier', 'cruiser', 'destroyer', 'battleship', 'patrol-boat', 'transport'].includes(category);
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
function showIntel(index: number) {
  intelIndex = (index + UNIT_INFO.length) % UNIT_INFO.length;
  const unit=unitInfo(intelIndex);
  $('intel-name').textContent=unit.name;
  $('intel-role').textContent=unit.role;
  $('intel-shape').textContent=unit.silhouette;
  $('intel-tactic').textContent=unit.tactic;
  $('intel-count').textContent=`${waveNum(intelIndex+1)} / ${UNIT_INFO.length}`;
  renderer.selectIntel(unit.id);
}
function showCampaign(index: number) {
  campaignIndex=(index+WAVES.length)%WAVES.length;
  const wave=waveInfo(campaignIndex + 1);
  $('campaign-stage').textContent=campaignIndex===4||campaignIndex===9?'旗舰攻坚':'空海联合作战';
  $('campaign-name').textContent=wave.name;
  $('campaign-objective').textContent=wave.objective;
  const ids=[...wave.air,...wave.sea];
  if(campaignIndex===2||campaignIndex===7) ids.push('heavy-bomber');
  $('campaign-roster').textContent=ids.map(id=>UNIT_INFO.find(unit=>unit.id===id)?.name ?? id).join(' / ');
  $('campaign-count').textContent=`${waveNum(campaignIndex+1)} / 10 波`;
}
function showHelpPanel(id: string) {
  activeHelp=id;
  if (id !== 'archive') setArchiveDetails({ open: false });
  $('help-dialog').classList.toggle('archive-open', id==='archive');
  if (id !== 'archive') archiveRequest++;
  if (id !== 'archive') {
    $('archive-info').hidden = true;
    button('help-ready').disabled = false;
    $('help-ready').innerHTML = ordinaryHelpReady;
  }
  for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-help]')) {
    const active=tab.dataset.help===id;
    tab.setAttribute('aria-selected',String(active));
    tab.tabIndex=active?0:-1;
    $(`help-${tab.dataset.help}-panel`).hidden=!active;
  }
  if(id==='intel') {
    $('intel-illustration').append($('intel-canvas'));
    $('intel-canvas').setAttribute('aria-label','作战单位三维预览');
    showIntel(intelIndex);
  }
  if(id==='campaign') showCampaign(campaignIndex);
  if(id==='archive') { $('archive-illustration').append($('intel-canvas')); void showArchive(archiveIndex); }
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
$('intel-prev').addEventListener('click',()=>showIntel(intelIndex-1));
$('intel-next').addEventListener('click',()=>showIntel(intelIndex+1));
$('campaign-prev').addEventListener('click',()=>showCampaign(campaignIndex-1));
$('campaign-next').addEventListener('click',()=>showCampaign(campaignIndex+1));
document.querySelectorAll<HTMLButtonElement>('[data-open-help]').forEach(button=>button.addEventListener('click', () => { helpPaused = game.status === 'playing'; if (helpPaused) autoPause(); showHelpPanel('controls'); dialog('help-dialog').showModal(); }));
$('close-help').addEventListener('click', () => dialog('help-dialog').close());
$('archive-info').addEventListener('click', () => setArchiveDetails({ open: true, focus: true }));
$('help-ready').addEventListener('click', () => {
  if (activeHelp === 'archive') {
    if (archiveDetailsOpen) { setArchiveDetails({ open: false, focus: true }); return; }
    if ((archiveLoad.kind === 'failed')) { void showArchive(archiveIndex); return; }
    const ship = archiveShip();
    if (ship) {
      if (archiveLoad.kind !== 'ready') return;
      selectedFleet[ship.hull] = ship.id;
      writeStorage({ key: 'fleet', value: selectedFleet });
      if (game.status === 'menu') game.fleetAppearance = { ...selectedFleet };
    } else if (archiveEntries.length) { setArchiveDetails({ open: true, focus: true }); return; }
  }
  dialog('help-dialog').close();
});
dialog('help-dialog').addEventListener('close', () => { archiveRequest++; if (helpPaused && game.status === 'paused') { game.resume(); processEvents(); syncState(); } helpPaused = false; });

const stopViewportTracking=trackViewport(clearInput);
import.meta.hot?.dispose(stopViewportTracking);

await renderer.init();
await Promise.all(NAVAL_HULLS.map(async hull=>{
  try {await renderer.loadHistorical(selectedFleet[hull]);}
  catch {selectedFleet[hull]=DEFAULT_FLEET[hull];}
}));
game.fleetAppearance={...selectedFleet};
selectCraft(selectedCraft); setDifficulty(difficulty); updateRecord(); syncSound(); syncState();
button('start-button').disabled = false;
let lastTime = performance.now();
function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, .05); lastTime = now;
  const x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const y = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  game.step(dt, pointer ? { x, y, target: pointer.target } : { x, y });
  processEvents();
  if (game.status === 'playing' || game.status === 'menu') {
    if (announcementTimer > 0) { announcementTimer -= dt; if (announcementTimer <= 0) $('wave-announcement').classList.remove('visible'); }
  }
  syncState();
  uiTimer += dt;
  if (uiTimer > .08 && game.status !== 'menu') { syncHud(); uiTimer = 0; }
  renderer.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
