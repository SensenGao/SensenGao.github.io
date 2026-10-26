// Zoomies GP (built on Turbo Kart Rally, MIT) — bootstrap, renderer + quality presets, loading, world lifecycle,
// race loop, game-mode sessions (Grand Prix, Quick Race, Time Trial, Missions) and the debug/test API.
import * as THREE from 'three';
import { bus } from './events.js';
import { CHARACTERS, RACE, PHYSICS, PAINTS, CUPS, GP_POINTS, DIFFICULTY, characterById, trackByKey } from './config.js';
import { RaceManager } from './race.js';
import { HUD } from './hud.js';
import { Menu } from './menu.js';
import { Screens } from './screens.js';
import { AudioEngine } from './audio.js';
import { InputController } from './input.js';
import { TouchControls } from './touch.js';
import { Kart, resolveKartCollisions } from './kart.js';
import { AIDriver } from './ai.js';
import { ItemSystem } from './items.js';
import { Effects } from './effects.js';
import { ChaseCamera } from './camera.js';
import { createTrack } from './track.js';
import { registerRacerGLB, createRacerModel, hasRacer, racerTemplate } from './racers.js';
import { renderPortraits, portraitOf } from './portraits.js';
import { loadManifest, loadGroup, groupFiles, getAsset } from './assets.js';
import { TIME } from './toon.js';
import * as Save from './save.js';
import { PRESETS, detectPreset, resolvePreset } from './quality.js';
import { MISSIONS, missionById, createMissionRuntime } from './missions.js';
import { GhostRecorder, GhostPlayer } from './ghost.js';
import { createPodium } from './podium.js';
import { t } from './i18n.js';

// ---------------------------------------------------------------------------------------------
// Deterministic RNG for captures/tests: ?seed=123 replaces Math.random with a seeded generator.
// ---------------------------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
if (params.has('seed')) {
  let a = (parseInt(params.get('seed'), 10) || 1) >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Error isolation: one failing subsystem must never freeze the loop. Log once per error type.
// ---------------------------------------------------------------------------------------------
const seenErrors = new Set();
function report(tag, err) {
  const key = tag + '|' + (err && err.message);
  if (seenErrors.has(key)) return;
  seenErrors.add(key);
  console.error(`[${tag}]`, err);
}
function safe(tag, fn) {
  try { return fn(); } catch (err) { report(tag, err); return undefined; }
}

// ---------------------------------------------------------------------------------------------
// Save, quality, renderer
// ---------------------------------------------------------------------------------------------
const save = Save.loadSave();
if (!save.autoQuality) { save.autoQuality = detectPreset(); Save.persist(); }
let quality = resolvePreset(params.get('quality') || save.settings.quality, save.autoQuality);

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 30, 60);
const fallbackScene = new THREE.Scene();
fallbackScene.background = new THREE.Color(0x2b1d2e);

let composer = null, bloom = null, renderPass = null;
async function setupPost() {
  if (!quality.bloom) { composer = null; return; }
  const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(fallbackScene, camera);
  composer.addPass(renderPass);
  bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.28, 0.4, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  onResize();
}
// Dynamic resolution: a multiplier on the preset's pixel ratio, lowered when frames stay slow, raised with headroom.
const dyn = { scale: 1, slowT: 0, fastT: 0, avg: 16.7 };
function applyQuality() {
  const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, quality.pixelRatioMax) * quality.pixelRatioScale * dyn.scale);
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = !!quality.shadows;
  onResize();
}
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  if (bloom) bloom.setSize(w / 2, h / 2);
}
window.addEventListener('resize', onResize);
applyQuality();

// ---------------------------------------------------------------------------------------------
// UI, input, audio
// ---------------------------------------------------------------------------------------------
const input = new InputController();
const audio = new AudioEngine();
audio.setVolumes?.(save.settings.music, save.settings.sfx, save.settings.muted, save.settings.voice, save.settings.voiceMuted);
const hud = new HUD(uiRoot);
const touch = new TouchControls(uiRoot, input);
const app = {
  startSession: (s) => startSession(s),
  resume: () => resume(),
  restartRace: () => endRace({ restart: true }),
  quitRace: () => endRace({ quit: true }),
  portrait: (id) => portraitOf(id),
  get quality() { return quality; },
  get autoQuality() { return save.autoQuality; },
  settingsChanged: (k, v) => settingsChanged(k, v),
  input,
  audio,
};
const menu = new Menu(uiRoot, app);
const screens = new Screens(uiRoot, app);
hud.setPortraitProvider((c) => portraitOf(c.id));

function settingsChanged(key, value) {
  if (key === 'music' || key === 'sfx' || key === 'muted') audio.setVolumes?.(save.settings.music, save.settings.sfx, save.settings.muted, save.settings.voice, save.settings.voiceMuted);
  if (key === 'quality') {
    const prevBloom = quality.bloom;
    quality = resolvePreset(value, save.autoQuality);
    dyn.scale = 1;
    applyQuality();
    if (prevBloom !== quality.bloom) setupPost();
    hud.toast(t('set.quality') + ': ' + t('q.' + quality.name));
  }
  if (key === 'lang') { menu.refresh?.(); hud.refresh?.(); touch.refresh?.(); }
}

// ---------------------------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------------------------
let state = 'boot';
let prevState = null;
let world = null;
let podium = null;
let introTimer = 0;
let time = 0;
const clock = new THREE.Clock();
const NEUTRAL = Object.freeze({ throttle: 0, brake: 0, steer: 0, drift: false, item: false, lookBack: false });
const RACE_STATES = new Set(['intro', 'countdown', 'racing', 'finished']);

function setState(s) {
  if (state === s) return;
  state = s;
  document.body.dataset.state = s;
  bus.emit('game:state', { state: s });
  touch.setVisible(RACE_STATES.has(s) && s !== 'finished');
}

// ---------------------------------------------------------------------------------------------
// Racer models
// ---------------------------------------------------------------------------------------------
function paintFor(character, paintId) {
  const p = PAINTS.find((x) => x.id === paintId);
  const tpl = racerTemplate(character.id);
  if (!p || !p.colors || !tpl || !tpl.meta || !tpl.meta.paint) return null;
  const from = tpl.meta.paint.map((h) => parseInt(String(h).replace('#', ''), 16));
  const to = from.map((_, k) => p.colors[Math.min(k, p.colors.length - 1)]);
  return { from, to };
}
function fallbackKartModel(character) {
  const root = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color: character ? character.color : 0xff0000 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 2.3), mat);
  body.position.y = 0.55; body.castShadow = true; root.add(body);
  const anchors = {};
  for (const [n, x, y, z] of [['exhaustL', 0.4, 0.5, -1.3], ['exhaustR', -0.4, 0.5, -1.3], ['wheelRL', 0.8, 0.05, -0.8], ['wheelRR', -0.8, 0.05, -0.8],
    ['wheelFL', 0.8, 0.3, 0.8], ['wheelFR', -0.8, 0.3, 0.8], ['itemHold', 0, 0.6, -1.8]]) {
    const o = new THREE.Object3D(); o.position.set(x, y, z); root.add(o); anchors[n] = o;
  }
  return { root, anchors, animate() {}, setShrunk(s) { root.scale.setScalar(s); }, dispose() { body.geometry.dispose(); mat.dispose(); } };
}
function makeKartModel(character, opts = {}) {
  if (hasRacer(character.id)) {
    try { return createRacerModel(character, opts); } catch (e) { report('racer.model', e); }
  }
  return fallbackKartModel(character);
}

// ---------------------------------------------------------------------------------------------
// World lifecycle
// ---------------------------------------------------------------------------------------------
const trackDefs = {};
async function loadTrackDef(id) {
  if (!trackDefs[id]) trackDefs[id] = (await import(`./tracks/${id}.js`)).default;
  return trackDefs[id];
}
async function ensureTrackAssets(trackKey, onProgress) {
  const tr = trackByKey(trackKey);
  await loadGroup(groupFiles('track:' + tr.id), onProgress);
  return loadTrackDef(tr.id);
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

/**
 * opts: { mode: 'race'|'attract', trackKey, racers: [character] (index 0 = player in race mode), cls, laps,
 *         paint, grid (player grid slot), items: true|false|'ball'|'attack', ghost, mission, startItem }
 */
function buildWorld(opts) {
  const { mode, trackKey } = opts;
  const tr = trackByKey(trackKey);
  const def = trackDefs[tr.id];
  const w = { mode, opts, trackKey, karts: [], ais: [], playerAI: null, player: null, scene: new THREE.Scene(), hazardsOn: true };
  w.track = createTrack(w.scene, renderer, def, { quality, variant: tr.variant || null });
  const night = tr.variant === 'night' || tr.id === 'frost';
  const chars = opts.racers;
  for (let i = 0; i < chars.length; i++) {
    const character = chars[i];
    const isPlayer = mode === 'race' && i === 0;
    const model = makeKartModel(character, { paint: isPlayer ? paintFor(character, opts.paint) : null, headlights: night });
    const kart = new Kart({ scene: w.scene, track: w.track, character, isPlayer, index: i, model });
    w.karts.push(kart);
    if (isPlayer) w.player = kart;
  }
  // grid: player in slot opts.grid (default mid-pack), others shuffled
  const n = w.karts.length;
  const gridOrder = new Array(n);
  const rest = shuffle(w.karts.filter((k) => k !== w.player));
  if (w.player) gridOrder[Math.min(n - 1, opts.grid ?? Math.min(n - 1, 4 + ((Math.random() * 2) | 0)))] = w.player;
  for (let i = 0; i < n; i++) if (!gridOrder[i]) gridOrder[i] = rest.shift();
  w.race = new RaceManager({ track: w.track, karts: w.karts, player: w.player, laps: opts.laps || RACE.laps, silent: mode !== 'race' });
  w.race.placeOnGrid(gridOrder);
  for (const k of w.karts) {
    if (k === w.player) continue;
    w.ais.push(safe('ai.ctor', () => new AIDriver(k, w.track, { difficulty: mode === 'race' ? (opts.cls || 'zoom') : 'turbo' })));
  }
  if (opts.items !== false) {
    const filter = opts.items === 'ball' ? ['ball'] : opts.items === 'attack' ? ['ball', 'bee', 'gum', 'comet', 'bell'] : null;
    w.items = safe('items.ctor', () => new ItemSystem({ scene: w.scene, track: w.track, karts: w.karts, filter }));
  }
  w.effects = safe('effects.ctor', () => new Effects(w.scene, camera, { quality, theme: def.effects || null }));
  w.chase = new ChaseCamera(camera);
  w.ctx = { karts: w.karts, player: w.player || w.karts[0], itemSystem: w.items || null, time: 0 };
  if (w.player) safe('camera.snap', () => w.chase.snap(w.player));
  if (opts.ghost) {
    const gc = characterById(opts.ghost.char);
    w.ghost = new GhostPlayer(opts.ghost, makeKartModel(gc, { ghost: true }), w.scene);
  }
  if (mode === 'race' && opts.timeTrial) w.recorder = new GhostRecorder();
  if (opts.mission) w.mission = createMissionRuntime(opts.mission, w);
  if (opts.hazardBoost) for (const h of w.track.hazards) h.radius *= 1.25;
  if (renderPass) renderPass.scene = w.scene;
  return w;
}

function disposeWorld() {
  const w = world;
  world = null;
  if (renderPass) renderPass.scene = fallbackScene;
  if (!w) return;
  safe('dispose.mission', () => w.mission && w.mission.dispose());
  safe('dispose.ghost', () => w.ghost && w.ghost.dispose());
  safe('dispose.items', () => w.items && w.items.dispose && w.items.dispose());
  safe('dispose.effects', () => w.effects && w.effects.dispose && w.effects.dispose());
  for (const k of w.karts) safe('dispose.kart', () => k.dispose && k.dispose());
  safe('dispose.track', () => w.track && w.track.dispose && w.track.dispose());
  safe('dispose.race', () => w.race && w.race.dispose());
  safe('dispose.ai', () => { for (const a of [...w.ais, w.playerAI]) a && a.dispose && a.dispose(); });
  safe('dispose.chase', () => w.chase && w.chase.dispose && w.chase.dispose());
  safe('dispose.scene', () => {
    const seen = new Set();
    const dispTex = (m) => {
      for (const key in m) {
        const v = m[key];
        if (v && v.isTexture && !seen.has(v) && !(v.userData && v.userData.shared)) { seen.add(v); v.dispose(); }
      }
    };
    w.scene.traverse((o) => {
      if (o.isSkinnedMesh) return;            // racer geometry/materials are shared templates
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    });
    w.scene.clear();
    void dispTex;
  });
  renderer.renderLists.dispose();
}

// ---------------------------------------------------------------------------------------------
// Attract mode (title / menus): AI racers lapping a track behind the menus
// ---------------------------------------------------------------------------------------------
async function buildAttract(trackKey = 'harbor') {
  disposeWorld();
  try {
    await ensureTrackAssets(trackKey);
    const racers = CHARACTERS.filter((c) => Save.racerUnlocked(c)).slice(0, 8);
    world = buildWorld({ mode: 'attract', trackKey, racers, items: true, laps: 99 });
    world.race.startImmediately();
    attractCam.targetIndex = 0; attractCam.switchT = 0;
    uiRoot.classList.remove('no-world');
  } catch (e) {
    report('attract', e);
    disposeWorld();
    uiRoot.classList.add('no-world');
  }
}

async function goToMenu() {
  hud.hide();
  screens.hide();
  audio.setPaused(false);
  audio.setGameplayActive(false);
  disposePodium();
  if (!world || world.mode !== 'attract') {
    menu.showLoading(t('loading'));
    await buildAttract('harbor');
  }
  menu.showMain();
  setState('menu');
  audio.playMusic('menu');
  const news = Save.collectNewUnlocks();
  if (news.length) await screens.unlocks(news);
}

// ---------------------------------------------------------------------------------------------
// Races
// ---------------------------------------------------------------------------------------------
let raceDone = null;   // resolver for the running race promise
let raceResultPayload = null;

/** Build and run one race. Resolves with { results, mission, quit, restart, ... }. */
async function runRace(opts) {
  hud.hide(); screens.hide(); menu.hideAll();
  audio.setPaused(false);
  audio.stopMusic();
  setState('loading');
  const tr = trackByKey(opts.trackKey);
  menu.showLoading(t('loading.track') + ' · ' + t.label(tr), 0);
  try {
    await ensureTrackAssets(opts.trackKey, (p) => menu.setLoading(p));
  } catch (e) { report('track.assets', e); }
  await new Promise((r) => setTimeout(r, 30));
  disposeWorld();
  try {
    world = buildWorld({ mode: 'race', ...opts });
  } catch (e) {
    report('buildWorld', e);
    menu.showLoading('RACE FAILED TO LOAD — SEE CONSOLE');
    await new Promise((r) => setTimeout(r, 2000));
    return { quit: true };
  }
  introTimer = 0;
  seenErrors.clear();
  hud.reset({ player: world.player, track: world.track, laps: world.race.laps, mode: opts.session || 'quick', items: opts.items !== false });
  hud.setPanel(null);
  hud.show();
  menu.hideAll();
  audio.setGameplayActive(true);
  uiRoot.classList.remove('no-world');
  setState('intro');
  showIntroCard(opts);
  return new Promise((resolve) => { raceDone = resolve; });
}

function endRace(payload) {
  if (!raceDone) return;
  const r = raceDone; raceDone = null;
  if (state === 'paused') { menu.hidePause(); audio.setPaused(false); }
  hud.hide();
  setState('results');
  r(payload);
}

let introCard = null;
function showIntroCard(opts) {
  if (!introCard) introCard = Object.assign(document.createElement('div'), { className: 'intro-card' });
  uiRoot.appendChild(introCard);
  const tr = trackByKey(opts.trackKey);
  let sub = '';
  if (opts.mission) sub = t('m.brief') + ' · ' + t.label(opts.mission);
  else if (opts.timeTrial) sub = t('menu.tt');
  else sub = `${DIFFICULTY[opts.cls || 'zoom'] ? t('class.' + (opts.cls || 'zoom')) : ''} · ${world.race.laps} ${t('laps')}`;
  if (opts.raceLabel) sub = opts.raceLabel + ' · ' + sub;
  introCard.innerHTML = `<div class="ic-sub">${sub}</div><div class="ic-name">${t.label(tr)}</div>${opts.mission ? `<div class="ic-goal">${t.field(opts.mission, 'goal')}</div>` : ''}<div class="ic-skip">${t('race.skip')}</div>`;
  introCard.classList.remove('show'); void introCard.offsetWidth; introCard.classList.add('show');
}
function hideIntroCard() { if (introCard) introCard.classList.remove('show'); }

function beginCountdown() {
  if (state !== 'intro' || !world) return;
  hideIntroCard();
  world.race.startCountdown();
  setState('countdown');
  safe('camera.snap', () => world.chase.snap(world.player));
}

function pause() {
  if (!RACE_STATES.has(state) || !raceDone) return;
  prevState = state;
  setState('paused');
  menu.showPause();
  audio.setPaused(true);
}
function resume() {
  if (state !== 'paused') return;
  menu.hidePause();
  setState(prevState || 'racing');
  audio.setPaused(false);
  clock.getDelta();
}

bus.on('race:go', () => {
  if (!world || world.mode !== 'race') return;
  if (state === 'countdown' || (state === 'paused' && prevState === 'countdown')) {
    if (state === 'paused') prevState = 'racing'; else setState('racing');
    audio.playMusic(trackByKey(world.trackKey).music || 'harbor');
  }
  if (world.opts.startItem && world.player) { world.player.item = world.opts.startItem; world.player.itemCount = world.opts.startItem === 'fizz3' ? 3 : 1; }
  world.lapStart = 0;
});
bus.on('race:finish', (d) => {
  if (!world || !d || !d.kart || !d.kart.isPlayer) return;
  setState('finished');
  world.playerAI = safe('ai.player', () => new AIDriver(world.player, world.track, { difficulty: 'chill' }));
});
bus.on('race:end', (d) => {
  if (!world || world.mode !== 'race' || !raceDone) return;
  const results = (d && d.results) || world.race.computeResults();
  const payload = { results, laps: world.race.laps, player: world.player, lapTimes: world.player.lapTimes.slice(), mission: world.mission ? world.mission.result : null, ghost: world.newGhost || null };
  setTimeout(() => endRace(payload), 300);
});
bus.on('mission:end', (res) => {
  if (!world || !world.mission || !raceDone) return;
  // timed missions end the race right away; lap-based ones end when the player crosses the line
  setState('finished');
  world.playerAI = world.playerAI || safe('ai.player', () => new AIDriver(world.player, world.track, { difficulty: 'chill' }));
  const payload = { results: world.race.computeResults(), mission: res, player: world.player, laps: world.race.laps, lapTimes: world.player.lapTimes.slice() };
  setTimeout(() => endRace(payload), 1500);
});
bus.on('race:lap', (d) => {
  if (!world || !d || d.kart !== world.player) return;
  world.lapStart = world.race.raceTime;
});
// Time Trial ghosts are flying laps, start line to start line: record them and replay the best one
bus.on('race:cross', (d) => {
  if (!world || !d || d.kart !== world.player) return;
  const now = d.time;
  if (world.recorder && world.crossT != null) {
    const lt = now - world.crossT;
    const g = world.recorder.finish(lt, { char: world.player.character.id, track: world.trackKey });
    if (lt > 5 && (!world.bestGhost || lt < world.bestGhost.lapTime)) world.bestGhost = g;
  }
  if (world.recorder) world.recorder.reset();
  world.crossT = now;
});

// ---------------------------------------------------------------------------------------------
// Sessions (mode flows)
// ---------------------------------------------------------------------------------------------
let session = null;

function pickRivals(player, count = 7) {
  const pool = CHARACTERS.filter((c) => c.id !== player.id && Save.racerUnlocked(c));
  const locked = CHARACTERS.filter((c) => c.id !== player.id && !Save.racerUnlocked(c));
  const out = shuffle(pool).slice(0, count);
  while (out.length < count && locked.length) out.push(locked.shift());
  return out;
}

async function startSession(s) {
  session = { ...s };
  const player = characterById(s.racerId || save.lastRacer);
  save.lastRacer = player.id; if (s.paint) save.paint[player.id] = s.paint; Save.persist();
  try {
    if (s.mode === 'gp') await runGrandPrix(player, s);
    else if (s.mode === 'tt') await runTimeTrial(player, s);
    else if (s.mode === 'mission') await runMission(player, s);
    else await runQuick(player, s);
  } catch (e) { report('session', e); }
  session = null;
  await goToMenu();
}

async function runQuick(player, s) {
  const rivals = pickRivals(player);
  for (;;) {
    const res = await runRace({ trackKey: s.trackKey, racers: [player, ...rivals], cls: s.cls, laps: s.laps || 3, paint: s.paint, session: 'quick' });
    if (res.quit) return;
    if (res.restart) continue;
    audio.playMusic('results');
    const best = res.lapTimes && res.lapTimes.length ? Math.min(...res.lapTimes) : null;
    const act = await screens.raceResults({ results: res.results, laps: res.laps, title: titleFor(res.results), bestLap: best, buttons: [{ id: 'again', label: t('res.again'), primary: true }, { id: 'menu', label: t('menu') }] });
    if (act !== 'again') return;
  }
}

async function runGrandPrix(player, s) {
  const cup = CUPS.find((c) => c.id === s.cupId) || CUPS[0];
  const rivals = pickRivals(player);
  const field = [player, ...rivals];
  const points = Object.fromEntries(field.map((c) => [c.id, 0]));
  for (let r = 0; r < cup.races.length; r++) {
    let res;
    for (;;) {
      res = await runRace({ trackKey: cup.races[r], racers: field, cls: s.cls, laps: 3, paint: s.paint, session: 'gp', raceLabel: t('race.n', { n: r + 1, of: cup.races.length }) });
      if (res.quit) return;
      if (!res.restart) break;
    }
    const gained = {};
    res.results.forEach((row, i) => { const p = GP_POINTS[i] || 0; points[row.character.id] += p; gained[row.character.id] = p; });
    audio.playMusic('results');
    await screens.raceResults({ results: res.results, laps: res.laps, title: titleFor(res.results), sub: t.label(cup) + ' · ' + t('race.n', { n: r + 1, of: cup.races.length }), points: gained, buttons: [{ id: 'next', label: t('continue'), primary: true }] });
    const table = field.map((c) => ({ character: c, pts: points[c.id], gained: gained[c.id], isPlayer: c.id === player.id })).sort((a, b) => b.pts - a.pts);
    const last = r === cup.races.length - 1;
    const act = await screens.standings({ rows: table, title: t('gp.standings'), sub: t.label(cup) + ' · ' + t('gp.after', { n: r + 1, of: cup.races.length }), buttons: [{ id: 'next', label: last ? t('gp.podium') : t('gp.next'), primary: true }, { id: 'quit', label: t('pause.quit') }] });
    if (act === 'quit') return;
  }
  // podium
  const table = field.map((c) => ({ character: c, pts: points[c.id] })).sort((a, b) => b.pts - a.pts);
  const place = table.findIndex((r) => r.character.id === player.id) + 1;
  const trophy = place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : null;
  if (trophy) Save.recordTrophy(cup.id, s.cls, trophy);
  await showPodium(table.slice(0, 3).map((r) => r.character), player, trophy, cup);
}

async function showPodium(top3, player, trophy, cup) {
  hud.hide(); disposeWorld();
  podium = safe('podium', () => createPodium(renderer, top3, { makeModel: (c) => makeKartModel(c, {}), quality }));
  if (podium && renderPass) renderPass.scene = podium.scene;
  setState('podium');
  audio.playMusic('podium');
  bus.emit('podium:show', { trophy });
  await screens.podium({ top3, player, trophy, cup, buttons: [{ id: 'ok', label: t('continue'), primary: true }] });
  disposePodium();
}
function disposePodium() { if (podium) { safe('podium.dispose', () => podium.dispose()); podium = null; } }

async function runTimeTrial(player, s) {
  for (;;) {
    const saved = Save.loadGhost(s.trackKey);
    const res = await runRace({ trackKey: s.trackKey, racers: [player], laps: 3, paint: s.paint, items: false, timeTrial: true, startItem: 'fizz3', ghost: saved, session: 'tt', grid: 0 });
    if (res.quit) return;
    if (res.restart) continue;
    const best = res.lapTimes && res.lapTimes.length ? Math.min(...res.lapTimes) : null;
    const total = res.results.find((r) => r.isPlayer)?.time;
    const newBestLap = Save.recordBestLap(s.trackKey, best);
    if (newBestLap) bus.emit('tt:record');
    Save.recordBestRace(s.trackKey, total);
    let ghostSaved = false;
    if (newBestLap && lastBestGhost) ghostSaved = Save.saveGhost(s.trackKey, lastBestGhost);
    audio.playMusic('results');
    const act = await screens.ttResult({ trackKey: s.trackKey, total, lapTimes: res.lapTimes, best, record: save.bestLap[s.trackKey], newBest: newBestLap, ghostSaved, buttons: [{ id: 'again', label: t('retry'), primary: true }, { id: 'menu', label: t('menu') }] });
    if (act !== 'again') return;
  }
}
let lastBestGhost = null;
bus.on('race:end', () => { if (world && world.bestGhost) lastBestGhost = world.bestGhost; });

async function runMission(player, s) {
  let def = missionById(s.missionId) || MISSIONS[0];
  for (;;) {
    const ro = def.race || {};
    const racers = ro.racers > 1 ? [player, ...pickRivals(player, ro.racers - 1)] : [player];
    const res = await runRace({ trackKey: def.track, racers, cls: ro.cls || 'zoom', laps: ro.laps || 1, paint: s.paint, items: ro.items ?? false, grid: ro.grid ?? 0, mission: def, hazardBoost: ro.hazardBoost, session: 'mission' });
    if (res.quit) return;
    if (res.restart) continue;
    const r = res.mission || { score: 0, stars: 0, failed: true };
    const improved = Save.recordStars(def.id, r.stars, def.lowerIsBetter ? null : r.score);
    audio.playMusic('results');
    const idx = MISSIONS.indexOf(def);
    const buttons = [{ id: 'again', label: t('retry'), primary: !(r.stars > 0) }, { id: 'menu', label: t('menu') }];
    if (idx < MISSIONS.length - 1) buttons.splice(1, 0, { id: 'next', label: t('next'), primary: r.stars > 0 });
    const act = await screens.missionResult({ def, result: r, improved, best: save.stars[def.id] | 0, buttons });
    const news = Save.collectNewUnlocks();
    if (news.length) await screens.unlocks(news);
    if (act === 'next') { def = MISSIONS[idx + 1]; continue; }
    if (act !== 'again') return;
  }
}

function titleFor(results) {
  const me = results.find((r) => r.isPlayer);
  return me ? (me.place === 1 ? t('res.victory') : me.place <= 3 ? t('res.podium') : t('res.done')) : t('res.results');
}

// ---------------------------------------------------------------------------------------------
// Keyboard (global)
// ---------------------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  audio.unlock?.();
  if (e.code === 'KeyM' && !e.repeat) {
    Save.setSetting('muted', !save.settings.muted);
    settingsChanged('muted');
    hud.toast(save.settings.muted ? 'SOUND OFF' : 'SOUND ON');
    return;
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (state === 'paused') { if (!menu.subPageOpen?.()) resume(); }
    else if (RACE_STATES.has(state)) pause();
    return;
  }
  if (state === 'intro' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && !e.repeat) beginCountdown();
}, { capture: true });
canvas.addEventListener('pointerdown', () => { audio.unlock?.(); if (state === 'intro') beginCountdown(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (state === 'racing' || state === 'countdown')) pause(); });
bus.on('touch:pause', () => { if (RACE_STATES.has(state)) pause(); });
bus.on('touch:skip', () => { if (state === 'intro') beginCountdown(); });
// stop the page from scrolling / zooming on mobile while playing
for (const ev of ['touchmove', 'gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => { if (e.cancelable && !e.target.closest?.('.scrollable')) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

// ---------------------------------------------------------------------------------------------
// Attract-mode camera
// ---------------------------------------------------------------------------------------------
const attractCam = {
  targetIndex: 0, switchT: 0, angle: 0,
  pos: new THREE.Vector3(0, 40, 80), look: new THREE.Vector3(), init: false,
  _p: new THREE.Vector3(), _l: new THREE.Vector3(),
};
function updateAttractCamera(dt) {
  const w = world;
  const ac = attractCam;
  ac.angle += dt * 0.16;
  let target = null;
  const focusId = menu.focusRacer && menu.focusRacer();
  if (w && w.karts.length) {
    if (focusId) target = w.karts.find((k) => k.character.id === focusId) || null;
    if (!target) {
      ac.switchT -= dt;
      if (ac.switchT <= 0) {
        ac.switchT = 9;
        const st = w.race.standings;
        const pick = st[(Math.random() * Math.min(4, st.length)) | 0];
        ac.targetIndex = w.karts.indexOf(pick);
      }
      target = w.karts[ac.targetIndex] || w.karts[0];
    }
  }
  if (target) {
    const close = !!focusId;
    const r = close ? 7.5 : 14 + Math.sin(ac.angle * 0.7) * 3;
    const h = target.heading || 0;
    const a = h + (close ? Math.PI * 0.75 + Math.sin(ac.angle * 1.6) * 0.5 : ac.angle);
    ac._p.set(target.position.x + Math.sin(a) * r, target.position.y + (close ? 2.6 : 5 + Math.sin(ac.angle * 0.5) * 2), target.position.z + Math.cos(a) * r);
    ac._l.set(target.position.x, target.position.y + (close ? 1.1 : 1.5), target.position.z);
    const v = target.velocity;
    if (v) { const lead = 1 / 2.5; ac._p.addScaledVector(v, lead); ac._l.addScaledVector(v, lead); }
  } else {
    let cx = 0, cz = 0, span = 200;
    const mm = w && w.track && w.track.minimap && w.track.minimap.bounds;
    if (mm) { cx = (mm.minX + mm.maxX) / 2; cz = (mm.minZ + mm.maxZ) / 2; span = Math.max(mm.maxX - mm.minX, mm.maxZ - mm.minZ); }
    ac._p.set(cx + Math.cos(ac.angle) * span * 0.6, span * 0.3, cz + Math.sin(ac.angle) * span * 0.6);
    ac._l.set(cx, 0, cz);
  }
  const k = ac.init ? 1 - Math.exp(-dt * 2.5) : 1;
  ac.init = true;
  ac.pos.lerp(ac._p, k); ac.look.lerp(ac._l, k);
  camera.position.copy(ac.pos);
  camera.lookAt(ac.look);
  if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------------------------
let playerInput = null;
const debug = { autopilot: false, manual: false, fps: 0, frameMs: 0 };
const _hz = new THREE.Vector3();

function checkHazards(w) {
  const hz = w.track.hazards;
  if (!hz || !hz.length) return;
  for (const h of hz) {
    if (h.active === false) continue;
    for (const k of w.karts) {
      const dx = k.position.x - h.position.x, dz = k.position.z - h.position.z, dy = k.position.y - h.position.y;
      const r = h.radius + (k.radius || 1.3);
      if (dx * dx + dz * dz < r * r && Math.abs(dy) < 3) {
        if (k.applyHit(h.kind || 'spin')) bus.emit('kart:hazard', { kart: k, hazard: h });
      }
    }
  }
}

// Steering assist (default on in Chill): when the player is not steering hard or drifting, gently turn towards a
// point ahead on the road and away from the walls. Real input always wins over the assist.
const _aT = new THREE.Vector3();
function assistOn(w) {
  const a = save.settings.assist || 'auto';
  if (a === 'off' || !w.opts || w.opts.timeTrial) return false;
  return a === 'on' || (DIFFICULTY[w.opts.cls] && DIFFICULTY[w.opts.cls].assist) || false;
}
function steeringAssist(w, k) {
  const inp = k.input;
  if (k.drifting || k.airborne || Math.abs(k.speed) < 6) return;
  const tr = w.track;
  const look = Math.min(30, 10 + Math.abs(k.speed) * 0.45) / tr.length;
  tr.pointAtLat(k.trackT + look, Math.max(-6, Math.min(6, k.lateral * 0.4)), _aT);
  const want = Math.atan2(_aT.x - k.position.x, _aT.z - k.position.z);
  let d = want - k.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
  const help = Math.max(-1, Math.min(1, -d * 2.2));
  const user = inp.steer || 0;
  const strength = Math.abs(user) > 0.6 ? 0.15 : 0.55;   // mostly yields to the player
  inp.steer = Math.max(-1, Math.min(1, user + help * strength * (1 - Math.abs(user) * 0.5)));
}

function simulate(w, dt) {
  time += dt;
  TIME.value = time;
  w.ctx.time = time;
  const racing = w.mode === 'race';
  const player = w.player;
  if (racing && player) {
    const raw = safe('input.getInput', () => input.getInput());
    safe('input.pause', () => input.consumePressed('pause') && state !== 'paused' && pause());
    playerInput = raw || NEUTRAL;
    if (save.settings.autoAccel && touch.active && playerInput.brake < 0.5) playerInput.throttle = 1;
    if (debug.autopilot && !w.playerAI && !player.controlsLocked) {
      w.playerAI = safe('ai.player', () => new AIDriver(player, w.track, { difficulty: 'turbo' }));
    }
    if ((player.finished || debug.autopilot || (w.mission && w.mission.done)) && w.playerAI) {
      safe('ai.player', () => w.playerAI.update(dt, w.ctx));
      if (debug.autopilot && w.opts.mission && player.item && Math.random() < 0.05) player.input.item = true;
    } else if (player.controlsLocked) {
      player.input = { ...NEUTRAL };
    } else {
      player.input = raw || { ...NEUTRAL };
      if (assistOn(w)) safe('assist', () => steeringAssist(w, player));
    }
  }
  for (let i = 0; i < w.ais.length; i++) {
    const ai = w.ais[i];
    if (ai) try { ai.update(dt, w.ctx); } catch (e) { report('ai.update', e); }
  }
  for (let i = 0; i < w.karts.length; i++) {
    try { w.karts[i].update(dt); } catch (e) { report('kart.update', e); }
  }
  safe('resolveKartCollisions', () => resolveKartCollisions(w.karts));
  if (w.items) safe('items.update', () => w.items.update(dt, time));
  safe('hazards', () => checkHazards(w));
  safe('race.update', () => w.race.update(dt));
  if (w.mission) safe('mission.update', () => w.mission.update(dt));
  if (w.recorder && player && w.crossT != null && w.race.phase === 'racing' && !player.finished) safe('ghost.rec', () => w.recorder.sample(w.race.raceTime - w.crossT, player));
  if (w.ghost && w.race.phase === 'racing') safe('ghost.play', () => w.ghost.update(w.crossT != null ? w.race.raceTime - w.crossT : -1, dt));
  if (w.effects) safe('effects.update', () => w.effects.update(dt, w.karts));
  safe('track.update', () => w.track.update && w.track.update(dt, time));
  const focus = racing ? player : (w.karts[attractCam.targetIndex] || w.karts[0]);
  if (focus) safe('track.setShadowFocus', () => w.track.setShadowFocus(focus.position));
  if (racing && state === 'intro') {
    introTimer += dt;
    if (introTimer > 4.0) beginCountdown();
  }
}

function tick(dt, rawDt, doRender) {
  safe('menu.update', () => menu.update(rawDt, state));
  safe('screens.update', () => screens.update(rawDt));
  const w = world;
  if (podium) {
    time += dt; TIME.value = time;
    safe('podium.update', () => podium.update(dt, camera));
  } else if (w) {
    const running = state !== 'paused' && state !== 'loading' && state !== 'boot';
    if (running) simulate(w, dt);
    if (w.mode === 'race' && w.player) {
      if (state !== 'paused') {
        const mode = state === 'intro' ? 'intro' : state === 'countdown' ? 'countdown' : state === 'finished' ? 'finish' : 'race';
        const lookBack = !!(state === 'racing' && playerInput && playerInput.lookBack);
        safe('camera.update', () => w.chase.update(dt, w.player, { lookBack, mode, shake: save.settings.shake }));
      }
      safe('hud.update', () => hud.update(dt, { player: w.player, karts: w.karts, race: w.race, itemSystem: w.items, track: w.track, time, mission: w.mission, ghost: w.ghost, bestLap: w.opts.timeTrial ? save.bestLap[w.trackKey] : null, lapStart: w.lapStart || 0 }));
    } else {
      updateAttractCamera(dt);
    }
    safe('audio.update', () => audio.update(dt, { player: w.player, karts: w.karts, camera }));
  } else {
    updateAttractCamera(dt);
    safe('audio.update', () => audio.update(dt, { camera }));
  }
  if (doRender) render(dt);
}

function render(dt) {
  if (world && !podium) {
    const md = quality.kartInkDist ?? 100;
    for (const k of world.karts) if (k.model && k.model.setInkDistance) k.model.setInkDistance(k.position.distanceTo(camera.position), md);
  }
  const scene = podium ? podium.scene : world ? world.scene : fallbackScene;
  const cam = podium ? podium.camera : camera;
  renderer.info.reset();
  try {
    if (composer) { renderPass.scene = scene; renderPass.camera = cam; composer.render(dt); }
    else renderer.render(scene, cam);
  } catch (e) { report('render', e); }
  lastInfo.calls = renderer.info.render.calls; lastInfo.triangles = renderer.info.render.triangles;
  safe('turntable', () => renderTurntable(dt));
}
const lastInfo = { calls: 0, triangles: 0 };

// ---------------------------------------------------------------------------------------------
// Racer-select turntable: the chosen racer spins on a little stage drawn into the menu's stage rectangle
// ---------------------------------------------------------------------------------------------
const turntable = { scene: null, cam: null, model: null, key: '', angle: 0, silhouette: null };
function renderTurntable(dt) {
  const info = menu.turntableInfo && menu.turntableInfo();
  if (!info) return;
  if (!turntable.scene) {
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xfff4dc, 0x7a5f86, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(3, 5, 4); sc.add(key);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.2, 0.25, 48), new THREE.MeshToonMaterial({ color: 0xfff4dc }));
    disc.position.y = -0.13; sc.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.06, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2b1d2e }));
    rim.position.y = 0.0; sc.add(rim);
    // backdrop: a big cream "sticker" disc behind the kart so it reads over the busy menu background
    const back = new THREE.Mesh(new THREE.CircleGeometry(2.55, 48), new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false }));
    const backRim = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.75, 48), new THREE.MeshBasicMaterial({ color: 0x2b1d2e, toneMapped: false }));
    back.position.set(0, 1.25, -2.2); backRim.position.copy(back.position); sc.add(back, backRim);
    turntable.backdrop = [back, backRim];
    turntable.scene = sc;
    turntable.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    turntable.silhouette = new THREE.MeshBasicMaterial({ color: 0x2b1d2e });
  }
  const k = `${info.id}|${info.paint}|${info.locked}`;
  if (k !== turntable.key) {
    if (turntable.model) { turntable.scene.remove(turntable.model.root); turntable.model.dispose(); }
    const c = characterById(info.id);
    turntable.model = makeKartModel(c, { paint: paintFor(c, info.paint), outline: !info.locked });
    if (info.locked) turntable.model.root.traverse((o) => { if (o.isMesh) o.material = turntable.silhouette; });
    turntable.scene.add(turntable.model.root);
    turntable.key = k;
  }
  turntable.angle += dt * 0.8;
  const m = turntable.model;
  m.root.rotation.y = turntable.angle;
  m.animate && m.animate({ dt, speed: 0, steer: Math.sin(turntable.angle * 1.3) * 0.3, time: turntable.angle });
  const r = info.rect;
  const cam = turntable.cam;
  cam.aspect = r.width / r.height; cam.updateProjectionMatrix();
  const fit = Math.max(2.6 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), 2.4 / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect));
  cam.position.set(0, 1.7, fit * 0.6); cam.lookAt(0, 0.9, 0);
  for (const b of turntable.backdrop) b.lookAt(cam.position);
  const H = window.innerHeight;
  renderer.setScissorTest(true);
  renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
  renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
  renderer.clearDepth();
  const ac = renderer.autoClear; renderer.autoClear = false;
  renderer.render(turntable.scene, cam);
  renderer.autoClear = ac;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
}

let fpsAcc = 0, fpsN = 0;
function updateDynamicResolution(rawDt) {
  if (rawDt > 0.25 || document.hidden) return;              // tab switch / hitch: ignore
  const ms = rawDt * 1000;
  dyn.avg += (ms - dyn.avg) * 0.08;
  if (dyn.avg > 20) { dyn.slowT += rawDt; dyn.fastT = 0; } else if (dyn.avg < 13.5) { dyn.fastT += rawDt; dyn.slowT = 0; } else { dyn.slowT = 0; dyn.fastT = 0; }
  if (dyn.slowT > 3 && dyn.scale > 0.55) { dyn.scale = Math.max(0.55, dyn.scale - 0.15); dyn.slowT = 0; applyQuality(); }
  else if (dyn.fastT > 5 && dyn.scale < 1) { dyn.scale = Math.min(1, dyn.scale + 0.1); dyn.fastT = 0; applyQuality(); }
}
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  if (debug.manual) return;
  updateDynamicResolution(rawDt);
  fpsAcc += rawDt; fpsN++;
  if (fpsAcc > 1) { debug.fps = fpsN / fpsAcc; debug.frameMs = 1000 * fpsAcc / fpsN; fpsAcc = 0; fpsN = 0; }
  tick(Math.min(rawDt, 1 / 30), rawDt, true);
}

// ---------------------------------------------------------------------------------------------
// Boot: loading screen with real byte progress, then the title
// ---------------------------------------------------------------------------------------------
async function boot() {
  document.body.dataset.state = 'boot';
  document.documentElement.lang = save.settings.lang === 'zh' ? 'zh' : 'en';
  menu.showLoading(t('loading'), 0);
  requestAnimationFrame(frame);
  await setupPost();
  await loadManifest();
  const core = groupFiles('core');
  const firstTrack = groupFiles('track:harbor');
  await loadGroup([...core, ...firstTrack], (p) => menu.setLoading(p * 0.95));
  for (const p of core.filter((x) => x.endsWith('.glb'))) {
    const id = p.split('/').pop().replace('.glb', '');
    const buf = getAsset(p);
    if (buf) await registerRacerGLB(id, buf).catch((e) => report('racer.load ' + id, e));
  }
  safe('portraits', () => renderPortraits(renderer, CHARACTERS));
  menu.setLoading(1);
  await buildAttract('harbor');
  menu.showTitle();
  setState('title');
  audio.playMusic('menu');
  // announcer lines load in the background (small mp3s)
  loadGroup(groupFiles('audio')).then(() => {
    const map = {};
    for (const p of groupFiles('audio')) if (p.startsWith('audio/voice/')) map[p.split('/').pop().replace('.mp3', '')] = getAsset(p);
    audio.setVoiceData(map);
  }).catch((e) => report('voice', e));
}
boot();

// ---------------------------------------------------------------------------------------------
// Debug / test hook
// ---------------------------------------------------------------------------------------------
window.__game = {
  get state() { return state; },
  get world() { return world; },
  get session() { return session; },
  get quality() { return quality; },
  dyn,
  audio, hud, menu, screens, renderer, camera, bus, save: Save, input, touch,
  startSession: (s) => startSession(s),
  goToMenu,
  skipIntro: () => beginCountdown(),
  errors: () => [...seenErrors],
  pause, resume,
  /** Put the player on its final lap just behind the line. */
  toFinalLap() {
    const w = world; if (!w || !w.player) return;
    w.race.debugSetLap(w.player, w.race.laps);
    if (w.race.laps > 1) bus.emit('race:finalLap', {});
  },
  /** Instantly finish the player's race. */
  finishPlayer() {
    const w = world; if (!w || !w.player) return;
    w.race.debugSetLap(w.player, w.race.laps + 1);
    w.race._finish(w.player);
  },
  PHYSICS,
  debug,
  setManual(on = true) { debug.manual = !!on; clock.getDelta(); },
  step(n = 1, dt = 1 / 60, doRender = false) {
    for (let i = 0; i < n; i++) tick(dt, dt, doRender && i === n - 1);
    return this.snapshot();
  },
  render() { render(1 / 60); return { ...lastInfo }; },
  snapshot() {
    const w = world;
    const p = w && w.player;
    return {
      state,
      raceTime: w && w.race ? w.race.raceTime : 0,
      player: p ? { x: p.position.x, y: p.position.y, z: p.position.z, speed: p.speed, lap: p.lap, place: p.place, t: p.trackT, item: p.item, finished: p.finished, surface: p.surface } : null,
      karts: w ? w.karts.map((k) => ({ id: k.character && k.character.id, place: k.place, lap: k.lap, progress: k.raceProgress, finished: k.finished })) : [],
      mission: w && w.mission ? { ...w.mission.st, result: w.mission.result } : null,
    };
  },
  renderInfo() { const i = renderer.info; return { calls: lastInfo.calls, triangles: lastInfo.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0 }; },
  setQuality(name) { Save.setSetting('quality', name); settingsChanged('quality', name); },
  PRESETS,
};
