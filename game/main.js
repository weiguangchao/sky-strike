import { Game, CRAFTS, UPGRADES, WIDTH, HEIGHT } from './engine.js';
import { Renderer, drawAircraft } from './render.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
const storage = {
  read(key, fallback) { try { return JSON.parse(localStorage.getItem(`sky-strike:${key}`)) ?? fallback; } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(`sky-strike:${key}`, JSON.stringify(value)); } catch { /* Play remains available without storage. */ } },
};
let selectedCraft = storage.read('craft', 'falcon');
if (!CRAFTS[selectedCraft]) selectedCraft = 'falcon';
let difficulty = storage.read('difficulty', 'normal');
if (!['normal', 'easy'].includes(difficulty)) difficulty = 'normal';
let bestScore = Number(storage.read('best', 0)) || 0;
let flights = Number(storage.read('flights', 0)) || 0;
export const game = new Game();
game.craft = selectedCraft;
const renderer = new Renderer($('game-canvas'), game);
const sound = new Sound(Boolean(storage.read('sound', false)));
const keys = new Set();
let pointer = null;
let announcementTimer = 0;
let announcementText = '';
let healthKey = '';
let uiTimer = 0;
let helpPaused = false;
let previousStatus = '';
const pad = n => String(Math.floor(n)).padStart(6, '0');
const waveNum = n => String(n).padStart(2, '0');
const elapsed = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function updateRecord() {
  $('best-score').textContent = pad(bestScore);
  $('record-note').textContent = flights ? `已完成 ${flights} 次出击 · 下一次，飞得更远` : '你的王牌之路，从这里开始';
}

function selectCraft(id) {
  if (game.status !== 'menu' || !CRAFTS[id]) return;
  selectedCraft = id;
  game.craft = id;
  storage.write('craft', id);
  const c = CRAFTS[id];
  document.querySelectorAll('[data-craft]').forEach(button => { const active = button.dataset.craft === id; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  $('craft-name').textContent = c.name;
  $('craft-role').textContent = c.role;
  $('craft-code').textContent = c.code;
  $('craft-description').innerHTML = c.description;
  $('hero-craft-caption').textContent = `${c.code} ${c.name} / ${c.role}`;
  document.querySelector('.frame-bottom>span:last-child').firstChild.textContent = `${c.code} `;
  for (const [stat, value] of [['power', c.power], ['speed', c.speed], ['armor', c.armor]]) $('stat-' + stat).innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < value ? 'filled' : ''}"></i>`).join('');
  const ctx = $('craft-canvas').getContext('2d');
  ctx.clearRect(0, 0, 480, 300);
  drawAircraft(ctx, 242, 150, 2.1, id, 0, -.24, false);
}

function setDifficulty(mode) {
  if (game.status !== 'menu') return;
  difficulty = mode;
  storage.write('difficulty', mode);
  document.querySelectorAll('[data-difficulty]').forEach(button => { const active = button.dataset.difficulty === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('difficulty-description').textContent = mode === 'easy' ? '额外装甲，较慢弹速，轻松享受飞行' : '经典弹幕挑战，完整作战体验';
}

function start() {
  sound.unlock();
  keys.clear(); pointer = null;
  game.start(selectedCraft, difficulty);
  $('build-list').textContent = '等待首次升级';
  $('run-build').hidden = false;
  healthKey = '';
  processEvents();
  syncState();
  syncHud();
  $('game-canvas').focus({ preventScroll: true });
}

function goHome() {
  keys.clear(); pointer = null;
  game.menu();
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

function announce(top, title, boss = false, duration = 2.4) {
  const html = `<span>${top}</span><strong>${title}</strong>`;
  if (html !== announcementText) { $('wave-announcement').innerHTML = html; announcementText = html; }
  $('wave-announcement').classList.add('visible');
  $('wave-announcement').classList.toggle('boss-warning', boss);
  announcementTimer = duration;
}

function upgradeChoices() {
  $('upgrade-options').replaceChildren(...game.choices.map((upgrade, index) => {
    const button = document.createElement('button');
    button.className = `upgrade-card${upgrade.rare ? ' rare' : ''}`;
    button.innerHTML = `<span class="upgrade-icon"><svg><use href="#i-${upgrade.icon}"/></svg></span><span class="upgrade-card-content"><strong>${upgrade.name}<small>${upgrade.rare ? '稀有' : '强化'}${game.stacks[upgrade.id] ? ` · ${game.stacks[upgrade.id] + 1} 级` : ''}</small></strong><p>${upgrade.description}</p></span><span class="upgrade-number">${index + 1}</span>`;
    button.addEventListener('click', () => chooseUpgrade(index));
    return button;
  }));
}

function chooseUpgrade(index) {
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
  $('flight-status').textContent = { menu: '等待飞行员就位', playing: '航线已锁定 · 作战进行中', paused: '作战已暂停', upgrade: '能量充足 · 选择强化', gameover: '任务结束 · 等待再次出击', victory: '作战完成 · 制空权已夺回' }[state];
  document.querySelectorAll('[data-craft], [data-difficulty]').forEach(button => { button.disabled = inRun; });
  if (state !== previousStatus) {
    if (state === 'paused') $('resume-button').focus({ preventScroll: true });
    if (state === 'upgrade') $('upgrade-options').firstElementChild?.focus({ preventScroll: true });
    if (state === 'gameover' || state === 'victory') $('retry-button').focus({ preventScroll: true });
    previousStatus = state;
  }
}

function syncHud() {
  $('score').textContent = pad(game.score);
  $('wave').textContent = waveNum(game.wave);
  $('level').textContent = game.level;
  $('xp-fill').style.width = `${Math.min(100, game.xp / game.nextXp * 100)}%`;
  $('bomb-count').textContent = `× ${game.bombs}`;
  $('bomb-button').disabled = game.bombs === 0;
  const currentHealth = `${game.player.hp}/${game.player.maxHp}`;
  if (healthKey !== currentHealth) {
    healthKey = currentHealth;
    $('health').innerHTML = Array.from({ length: game.player.maxHp }, (_, i) => `<i class="health-point${i >= game.player.hp ? ' empty' : ''}"></i>`).join('');
    $('health').setAttribute('aria-label', `装甲 ${game.player.hp} / ${game.player.maxHp}`);
  }
  $('weapon-level').textContent = game.stacks.spread ? `${2 + game.stacks.spread * 2} 联散射机炮` : '双联机炮';
  $('sector-label').textContent = game.wave > 5 ? '第 02 航区 · 风暴防线' : '第 01 航区 · 破晓海域';
  $('boss-hud').hidden = !game.boss;
  if (game.boss) {
    const percent = Math.max(0, game.boss.hp / game.boss.maxHp * 100);
    $('boss-fill').style.width = `${percent}%`;
    $('boss-percent').textContent = `${Math.ceil(percent)}%`;
    $('boss-name').textContent = game.boss.final ? '终极防线 · 赤霄' : '空中堡垒 · 玄鲸';
  }
}

function showResults(event) {
  flights++;
  storage.write('flights', flights);
  const isBest = event.score > bestScore;
  if (isBest) { bestScore = event.score; storage.write('best', bestScore); }
  $('result-kicker').textContent = event.victory ? 'MISSION COMPLETE' : 'FLIGHT ENDED';
  $('result-title').textContent = event.victory ? '这片天空，属于你。' : '下一次，飞得更远。';
  $('result-subtitle').textContent = event.victory ? '敌方防线已突破。王牌，欢迎归航。' : '每一次坠落，都是下一场传奇的起点。';
  $('result-score').textContent = pad(event.score);
  $('result-best').textContent = isBest ? 'NEW RECORD · 刷新个人最高纪录' : `个人最高纪录 ${pad(bestScore)}`;
  $('result-kills').textContent = event.kills;
  $('result-wave').textContent = `${waveNum(event.wave)}/10`;
  $('result-time').textContent = elapsed(event.time);
  updateRecord();
}

function processEvents() {
  for (const event of game.drainEvents()) {
    renderer.event(event); sound.play(event.type);
    if (event.type === 'wave') {
      if (event.wave % 5 === 0) announce('WARNING · BOSS APPROACHING', '敌方首领接近', true, 3.3);
      else if (event.wave === 6) announce('SECTOR 02 · STORM FRONT', '风暴防线 · 补给抵达', false, 3);
      else announce(`WAVE ${waveNum(event.wave)} / 10`, event.wave === 1 ? '破晓海域 · 出击' : '新一波敌机来袭');
    }
    if (event.type === 'bossDefeated') announce('TARGET DESTROYED', event.final ? '制空权已夺回' : '首领已击破', false, 2.4);
    if (event.type === 'upgrade') { keys.clear(); pointer = null; upgradeChoices(); }
    if (event.type === 'upgraded') {
      $('build-list').innerHTML = Object.entries(game.stacks).map(([id, count]) => `<span class="build-chip">${UPGRADES.find(u => u.id === id).name}${count > 1 ? ` ×${count}` : ''}</span>`).join('');
    }
    if (event.type === 'pickup') announce('SUPPLY COLLECTED', event.text, false, 1.4);
    if (event.type === 'end') { keys.clear(); pointer = null; showResults(event); announcementTimer = 0; $('wave-announcement').classList.remove('visible'); }
  }
}

function toggleSound() {
  sound.enabled = !sound.enabled;
  if (sound.enabled) { sound.unlock(); sound.tone(660, 880, .12, .05); }
  storage.write('sound', sound.enabled);
  syncSound();
}
function syncSound() {
  document.querySelectorAll('.sound-button').forEach(button => {
    const label = sound.enabled ? '关闭声音' : '开启声音';
    button.setAttribute('aria-label', label); button.title = label;
    button.querySelector('use').setAttribute('href', sound.enabled ? '#i-sound' : '#i-mute');
  });
}

function clearInput() { keys.clear(); pointer = null; }
function autoPause() { clearInput(); game.pause(); processEvents(); syncState(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('keydown', event => {
  if ($('help-dialog').open || event.ctrlKey || event.metaKey || event.altKey) return;
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

const canvas = $('game-canvas');
function pointerPosition(event) {
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
const releasePointer = event => { if (pointer?.id === event.pointerId) pointer = null; };
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
document.querySelectorAll('[data-craft]').forEach(button => button.addEventListener('click', () => selectCraft(button.dataset.craft)));
document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => setDifficulty(button.dataset.difficulty)));
document.querySelectorAll('.sound-button').forEach(button => button.addEventListener('click', toggleSound));
$('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('battlefield').requestFullscreen) await $('battlefield').requestFullscreen();
    else { $('fullscreen-button').title = '当前浏览器使用竖屏模式即可畅玩'; announce('FLIGHT READY', '竖屏就绪，直接出击', false, 2); }
  } catch { $('fullscreen-button').title = '请在浏览器中允许全屏'; }
});
$('help-button').addEventListener('click', () => { helpPaused = game.status === 'playing'; if (helpPaused) autoPause(); $('help-dialog').showModal(); });
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('help-ready').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('close', () => { if (helpPaused && game.status === 'paused') { game.resume(); processEvents(); syncState(); } helpPaused = false; });

selectCraft(selectedCraft); setDifficulty(difficulty); updateRecord(); syncSound(); syncState();
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, .05); lastTime = now;
  const x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const y = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  game.step(dt, { x, y, target: pointer?.target });
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
