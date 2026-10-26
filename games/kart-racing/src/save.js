// Persistent progress + settings in localStorage. Every storage access is wrapped in try/catch so private
// windows (or blocked storage) still work with an in-memory save.
import { CHARACTERS, PAINTS, TRACKS, CUPS, CLASS_ORDER } from './config.js';
import { bus } from './events.js';

const KEY = 'zoomiesgp.save.v1';
const GHOST_PREFIX = 'zoomiesgp.ghost.v1.';

const DEFAULT = () => ({
  v: 1,
  settings: { music: 0.6, sfx: 0.8, voice: 0.9, muted: false, voiceMuted: false, quality: 'auto', lang: 'en', shake: true, autoAccel: false, assist: 'auto' },
  stars: {},            // missionId -> best stars (0..3)
  missionBest: {},      // missionId -> best score
  trophies: {},         // cupId -> { chill: 'gold'|'silver'|'bronze', zoom: ..., turbo: ... }
  bestLap: {},          // trackKey -> seconds
  bestRace: {},         // trackKey -> seconds (3 laps)
  lastRacer: 'fennix',
  paint: {},            // racerId -> paintId
  seen: [],             // unlock ids already announced
  autoQuality: null,    // preset picked on first load
});

let data = DEFAULT();
let storageOK = true;

function readRaw(k) { try { return window.localStorage.getItem(k); } catch (e) { storageOK = false; return null; } }
function writeRaw(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { storageOK = false; return false; } }

export function loadSave() {
  const raw = readRaw(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const d = DEFAULT();
      data = { ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings || {}) } };
    } catch (e) { data = DEFAULT(); }
  }
  return data;
}
export function persist() { writeRaw(KEY, JSON.stringify(data)); }
export const save = () => data;
export const storageAvailable = () => storageOK;
export function setSetting(k, v) { data.settings[k] = v; persist(); bus.emit('settings:changed', { key: k, value: v }); }
export const settings = () => data.settings;

// ------------------------------------------------------------------ progress
export function totalStars() { return Object.values(data.stars).reduce((a, b) => a + (b | 0), 0); }

const TROPHY_RANK = { bronze: 1, silver: 2, gold: 3 };
export function recordTrophy(cupId, cls, trophy) {
  if (!trophy) return false;
  const t = (data.trophies[cupId] ||= {});
  const prev = t[cls];
  if (!prev || TROPHY_RANK[trophy] > TROPHY_RANK[prev]) { t[cls] = trophy; persist(); return true; }
  return false;
}
export function recordStars(missionId, stars, score) {
  const prev = data.stars[missionId] | 0;
  let improved = false;
  if (stars > prev) { data.stars[missionId] = stars; improved = true; }
  if (score != null && (data.missionBest[missionId] == null || score > data.missionBest[missionId])) data.missionBest[missionId] = score;
  persist();
  return improved;
}
export function recordBestLap(trackKey, t) {
  if (!(t > 0)) return false;
  if (data.bestLap[trackKey] == null || t < data.bestLap[trackKey]) { data.bestLap[trackKey] = t; persist(); return true; }
  return false;
}
export function recordBestRace(trackKey, t) {
  if (!(t > 0)) return false;
  if (data.bestRace[trackKey] == null || t < data.bestRace[trackKey]) { data.bestRace[trackKey] = t; persist(); return true; }
  return false;
}

/** Does the save satisfy an unlock rule ({ stars } | { trophy, minClass, gold })? */
export function meets(rule) {
  if (!rule) return true;
  if (rule.stars != null && totalStars() < rule.stars) return false;
  if (rule.trophy) {
    const t = data.trophies[rule.trophy] || {};
    const minIdx = CLASS_ORDER.indexOf(rule.minClass || 'chill');
    const ok = CLASS_ORDER.some((c, i) => i >= minIdx && t[c] && (!rule.gold || t[c] === 'gold'));
    if (!ok) return false;
  }
  return true;
}
export function unlockText(rule, t) {
  if (!rule) return '';
  if (rule.stars != null) return t('unlock.stars', { n: rule.stars });
  if (rule.trophy) {
    const cup = CUPS.find((c) => c.id === rule.trophy);
    const cupName = cup ? t.label(cup) : rule.trophy;
    if (rule.gold) return t('unlock.gold', { cup: cupName, cls: t('class.' + rule.minClass) });
    if (rule.minClass && rule.minClass !== 'chill') return t('unlock.trophyClass', { cup: cupName, cls: t('class.' + rule.minClass) });
    return t('unlock.trophy', { cup: cupName });
  }
  return '';
}
export const racerUnlocked = (c) => meets(c.unlock);
export const paintUnlocked = (p) => meets(p.unlock);
export const trackUnlocked = (tr) => meets(tr.unlock);
export const cupUnlocked = (c) => meets(c.unlock);

/** Unlocks that are now satisfied but not yet announced. Marks them as seen. */
export function collectNewUnlocks() {
  const out = [];
  const check = (id, rule, kind, obj) => { if (rule && meets(rule) && !data.seen.includes(id)) { data.seen.push(id); out.push({ id, kind, obj }); } };
  CHARACTERS.forEach((c) => check('racer:' + c.id, c.unlock, 'racer', c));
  PAINTS.forEach((p) => check('paint:' + p.id, p.unlock, 'paint', p));
  TRACKS.forEach((tr) => check('track:' + tr.key, tr.unlock, 'track', tr));
  CUPS.forEach((c) => check('cup:' + c.id, c.unlock, 'cup', c));
  if (out.length) persist();
  return out;
}

// ------------------------------------------------------------------ ghosts (Time Trial best lap)
export function saveGhost(trackKey, ghost) {
  try { return writeRaw(GHOST_PREFIX + trackKey, JSON.stringify(ghost)); } catch (e) { return false; }
}
export function loadGhost(trackKey) {
  const raw = readRaw(GHOST_PREFIX + trackKey);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export function resetProgress() {
  const s = data.settings;
  data = DEFAULT(); data.settings = s; persist();
  try { for (const tr of TRACKS) window.localStorage.removeItem(GHOST_PREFIX + tr.key); } catch (e) { /* ignore */ }
}
