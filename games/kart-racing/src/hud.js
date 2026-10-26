// In-race HUD: DOM/CSS "sticker" overlay in #ui-root plus two small canvases (minimap, speedometer).
// Also shows mode panels: mission objective + timer + stars, Time Trial lap / best / ghost delta.
import { bus } from './events.js';
import { ITEMS, ITEM_INFO, CHARACTERS } from './config.js';
import { formatTime } from './race.js';
import { assetURL, uiURL } from './assets.js';
import { t } from './i18n.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};
export const PLACE_COLORS = ['#ffd23f', '#e3ecf5', '#f0a162', '#7ff5e6', '#7ff5e6', '#7ff5e6', '#ff8cc6', '#ff6f91'];

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

function restartAnim(e, cls) {
  e.classList.remove(cls);
  void e.offsetWidth; // reflow to restart CSS animation
  e.classList.add(cls);
}

// Item icons: painted images (ui/icons/*.webp on the asset host)
export function itemIcon(type) {
  const info = ITEM_INFO[type];
  return info ? uiURL(info.icon) : '';
}

// ---------------------------------------------------------------------------------------------
export class HUD {
  constructor(uiRoot) {
    this.uiRoot = uiRoot;
    this.root = el('div', 'hud hidden', uiRoot);
    this.portraitFn = null;
    this.player = null;
    this.track = null;
    this._offs = [];
    this._last = {};
    this._rouletteTimer = 0;
    this._rouletteIdx = 0;
    this._lastItemKey = '';
    this._standKey = '';
    this.active = false;

    const r = this.root;
    // top-left: lap + timer + splits
    this.tl = el('div', 'hud-tl', r);
    this.lapEl = el('div', 'hud-lap sticker', this.tl, `<span class="lbl">${t('race.lap')}</span><span class="val">1</span><span class="of">/3</span>`);
    this.lapVal = this.lapEl.querySelector('.val');
    this.lapOf = this.lapEl.querySelector('.of');
    this.timerEl = el('div', 'hud-timer', this.tl, '0:00.00');
    this.splitsEl = el('div', 'hud-splits', this.tl);

    // top-centre item slot
    this.itemWrap = el('div', 'hud-item', r);
    this.itemSlot = el('div', 'item-slot', this.itemWrap);
    this.itemImg = el('img', 'item-img', this.itemSlot);
    this.itemImg.alt = '';
    this.itemCount = el('div', 'item-count', this.itemSlot);
    this.itemHint = el('div', 'item-hint', this.itemWrap, 'E / SHIFT');
    this.itemName = el('div', 'item-name', this.itemWrap, '');

    // right side standings
    this.standEl = el('div', 'hud-standings', r);
    this.standRows = [];
    for (let i = 0; i < 8; i++) {
      const row = el('div', 'st-row', this.standEl, '<span class="st-pos"></span><span class="st-chip"></span><span class="st-name"></span>');
      this.standRows.push({ row, pos: row.querySelector('.st-pos'), chip: row.querySelector('.st-chip'), name: row.querySelector('.st-name') });
    }

    // bottom-left minimap
    this.mapWrap = el('div', 'hud-minimap', r);
    this.mapCanvas = el('canvas', '', this.mapWrap);
    this.mapCanvas.width = this.mapCanvas.height = 440;
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapBg = null;

    // bottom-right: speedo + place
    this.br = el('div', 'hud-br', r);
    this.speedo = el('div', 'hud-speedo', this.br);
    this.speedCanvas = el('canvas', '', this.speedo);
    this.speedCanvas.width = this.speedCanvas.height = 320;
    this.speedCtx = this.speedCanvas.getContext('2d');
    this.speedText = el('div', 'speed-val', this.speedo, '0');
    el('div', 'speed-unit', this.speedo, 'km/h');
    this.driftPill = el('div', 'drift-pill', this.speedo, 'DRIFT');
    this.placeEl = el('div', 'hud-place', this.br, '<span class="num">1</span><span class="suf">st</span>');
    this.placeNum = this.placeEl.querySelector('.num');
    this.placeSuf = this.placeEl.querySelector('.suf');

    // overlays
    this.countEl = el('div', 'hud-countdown', r);
    this.bannerEl = el('div', 'hud-banner', r);
    this.wrongEl = el('div', 'hud-wrongway', r, `<div class="ww-arrow"></div><div class="ww-text">${t('race.wrong')}</div>`);
    this.panel = el('div', 'hud-panel sticker hidden', r);
    this.flashEl = el('div', 'hud-flash', uiRoot);
    this.finishEl = el('div', 'hud-finish', r);
    this.lapPop = el('div', 'hud-lappop', r);

    // results (outside .hud so it stays visible independently)
    this.resultsEl = el('div', 'results hidden', uiRoot);
    this._resultsKey = null;

    this.toastEl = el('div', 'toast', uiRoot);

    this._subscribe();
  }

  setPortraitProvider(fn) { this.portraitFn = fn; }
  portrait(character) {
    if (!character) return '';
    const key = character.id;
    this._portraits = this._portraits || new Map();
    if (this._portraits.has(key)) return this._portraits.get(key);
    let url = '';
    try { if (this.portraitFn) url = this.portraitFn(character) || ''; } catch (e) { url = ''; }
    this._portraits.set(key, url);
    return url;
  }

  _subscribe() {
    const on = (n, f) => this._offs.push(bus.on(n, (d) => { if (this.active) f(d || {}); }));
    on('race:countdown', (d) => this.showCount(String(d.n), 'n' + d.n));
    on('race:go', () => { this.showCount(t('race.go'), 'go'); clearTimeout(this._cdT); this._cdT = setTimeout(() => this.countEl.classList.remove('show'), 1100); });
    on('race:finalLap', () => this.banner(t('race.final'), 'final'));
    on('race:lap', (d) => {
      if (d.kart && d.kart.isPlayer) {
        restartAnim(this.lapEl, 'pulse');
        if (d.lapTime != null) { this.lapPop.textContent = formatTime(d.lapTime); restartAnim(this.lapPop, 'show'); }
      }
    });
    on('race:wrongWay', (d) => this.wrongEl.classList.toggle('show', !!d.active));
    on('item:bell', (d) => { if (!(d.by && d.by.isPlayer)) restartAnim(this.flashEl, 'flash'); else restartAnim(this.flashEl, 'flash-soft'); });
    on('mission:collect', () => { if (this.panel) restartAnim(this.panel, 'pulse'); });
    on('race:finish', (d) => {
      if (d.kart && d.kart.isPlayer) {
        const p = d.place || 1;
        this.finishEl.innerHTML = `<div class="fin-title">${t('race.finish')}</div><div class="fin-place" style="color:${PLACE_COLORS[p - 1] || '#fff'}">${p}<small>${ordinal(p)}</small></div>`;
        restartAnim(this.finishEl, 'show');
        this.wrongEl.classList.remove('show');
      }
    });
    on('item:got', (d) => { if (d.kart && d.kart.isPlayer) restartAnim(this.itemSlot, 'got'); });
    on('kart:hit', (d) => { if (d.kart && d.kart.isPlayer) restartAnim(this.root, 'shake'); });
  }

  // ------------------------------------------------------------------ lifecycle
  show() { this.active = true; this.root.classList.remove('hidden'); }
  hide() { this.active = false; this.root.classList.add('hidden'); }

  reset({ player, track, laps, mode = 'quick', items = true }) {
    this.player = player;
    this.track = track;
    this.laps = laps;
    this.mode = mode;
    this.root.classList.toggle('no-items', !items);
    this.root.classList.toggle('solo', mode === 'tt' || mode === 'mission');
    this._panelKey = '';
    this._last = {};
    this._standKey = '';
    this._lastItemKey = '';
    this.splitsEl.innerHTML = '';
    this.countEl.className = 'hud-countdown';
    this.bannerEl.className = 'hud-banner';
    this.wrongEl.classList.remove('show');
    this.finishEl.className = 'hud-finish';
    this.lapPop.className = 'hud-lappop';
    this.hideResults();
    this._buildMinimap(track);
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    restartAnim(this.toastEl, 'show');
  }

  showCount(text, cls) {
    this.countEl.textContent = text;
    this.countEl.className = 'hud-countdown';
    void this.countEl.offsetWidth;
    this.countEl.className = `hud-countdown show ${cls}`;
  }

  banner(text, cls = '') {
    this.bannerEl.textContent = text;
    this.bannerEl.className = 'hud-banner';
    void this.bannerEl.offsetWidth;
    this.bannerEl.className = `hud-banner show ${cls}`;
  }

  // ------------------------------------------------------------------ minimap
  _buildMinimap(track) {
    this.mapBg = null;
    const mm = track && track.minimap;
    if (!mm || !mm.points || mm.points.length < 2) { this.mapWrap.style.display = 'none'; return; }
    this.mapWrap.style.display = '';
    const W = this.mapCanvas.width, pad = 34;
    const b = mm.bounds || this._bounds(mm.points);
    const spanX = Math.max(1, b.maxX - b.minX), spanZ = Math.max(1, b.maxZ - b.minZ);
    const scale = (W - pad * 2) / Math.max(spanX, spanZ);
    const ox = (W - spanX * scale) / 2, oz = (W - spanZ * scale) / 2;
    this._map = { minX: b.minX, minZ: b.minZ, scale, ox, oz };
    const c = document.createElement('canvas'); c.width = c.height = W;
    const g = c.getContext('2d');
    const path = () => {
      g.beginPath();
      mm.points.forEach((p, i) => { const [x, y] = this._mp(p.x, p.z); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.closePath();
    };
    g.lineJoin = 'round'; g.lineCap = 'round';
    const rw = Math.max(10, (track.roadWidth || 24) * scale);
    path(); g.strokeStyle = '#2b1d2e'; g.lineWidth = rw + 16; g.stroke();
    path(); g.strokeStyle = '#fff4dc'; g.lineWidth = rw + 6; g.stroke();
    path(); g.strokeStyle = '#7a6f80'; g.lineWidth = rw; g.stroke();
    // start line
    const p0 = mm.points[0], p1 = mm.points[1];
    const [x0, y0] = this._mp(p0.x, p0.z), [x1, y1] = this._mp(p1.x, p1.z);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    g.save(); g.translate(x0, y0); g.rotate(ang);
    for (let i = -3; i < 3; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#111';
      g.fillRect(j * 5 - 5, i * (rw / 6), 5, rw / 6);
    }
    g.restore();
    this.mapBg = c;
  }
  _bounds(pts) {
    const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of pts) { b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z); }
    return b;
  }
  _mp(x, z) {
    const m = this._map;
    return [m.ox + (x - m.minX) * m.scale, m.oz + (z - m.minZ) * m.scale];
  }

  _drawMinimap(karts, player, time, itemSystem) {
    if (!this.mapBg) return;
    const g = this.mapCtx, W = this.mapCanvas.width;
    g.clearRect(0, 0, W, W);
    g.drawImage(this.mapBg, 0, 0);
    if (this.track && this.track.itemBoxPositions) {
      g.fillStyle = 'rgba(226,54,111,0.85)';
      for (const p of this.track.itemBoxPositions) { const [x, y] = this._mp(p.x, p.z); g.fillRect(x - 3, y - 3, 6, 6); }
    }
    if (itemSystem && typeof itemSystem.getHazards === 'function') {
      let hz = null;
      try { hz = itemSystem.getHazards(); } catch (e) { hz = null; }
      if (hz) {
        for (const h of hz) {
          if (!h || !h.position) continue;
          const [x, y] = this._mp(h.position.x, h.position.z);
          g.fillStyle = h.type === 'gum' ? '#ff8cc6' : h.type === 'crab' ? '#e2502f' : '#ffd23f';
          g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
        }
      }
    }
    // opponents first (back to front by place), then player on top
    for (let i = karts.length - 1; i >= 0; i--) {
      const k = karts[i];
      if (k === player || !k.position) continue;
      const [x, y] = this._mp(k.position.x, k.position.z);
      g.fillStyle = k.character ? hex(k.character.color) : '#ccc';
      g.strokeStyle = '#2b1d2e'; g.lineWidth = 4;
      g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (player && player.position) {
      const [x, y] = this._mp(player.position.x, player.position.z);
      const pulse = 1 + Math.sin(time * 6) * 0.15;
      g.fillStyle = 'rgba(255,210,63,0.5)';
      g.beginPath(); g.arc(x, y, 24 * pulse, 0, Math.PI * 2); g.fill();
      // heading arrow
      const h = player.heading || 0;
      const dx = Math.sin(h), dz = Math.cos(h);
      g.save(); g.translate(x, y); g.rotate(Math.atan2(dz, dx));
      g.fillStyle = player.character ? hex(player.character.color) : '#f33';
      g.strokeStyle = '#2b1d2e'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(20, 0); g.lineTo(-12, 13); g.lineTo(-6, 0); g.lineTo(-12, -13); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  // ------------------------------------------------------------------ speedometer
  _drawSpeedo(speed, boosting, maxShown = 60) {
    const g = this.speedCtx, W = this.speedCanvas.width, cx = W / 2, cy = W / 2, r = W * 0.4;
    g.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.lineCap = 'round';
    g.lineWidth = 26; g.strokeStyle = 'rgba(43,29,46,0.18)';
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    const f = Math.min(1, Math.abs(speed) / maxShown);
    const grd = g.createLinearGradient(0, W, W, 0);
    if (boosting) { grd.addColorStop(0, '#e2366f'); grd.addColorStop(1, '#ff8a1e'); }
    else { grd.addColorStop(0, '#19b5a5'); grd.addColorStop(0.7, '#ffd23f'); grd.addColorStop(1, '#ff8a1e'); }
    g.strokeStyle = grd; g.lineWidth = 18;
    if (f > 0.005) { g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * f); g.stroke(); }
    // ticks
    g.strokeStyle = 'rgba(43,29,46,0.7)'; g.lineWidth = 4;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (a1 - a0) * i / 10;
      const r1 = r - 26, r2 = r - (i % 5 === 0 ? 44 : 36);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
    }
  }

  // ------------------------------------------------------------------ per-frame
  setPanel(html) { this._panelHTML = html; }
  refresh() {
    if (this.lapEl) this.lapEl.querySelector('.lbl').textContent = t('race.lap');
    const ww = this.wrongEl && this.wrongEl.querySelector('.ww-text'); if (ww) ww.textContent = t('race.wrong');
  }

  _updatePanel({ player, race, mission, ghost, bestLap, lapStart }) {
    let html = '';
    if (mission) {
      const h = mission.hud();
      const def = mission.def;
      const timeStr = h.time != null ? `<div class="mp-time${h.time < 10 ? ' low' : ''}">${Math.max(0, h.time).toFixed(1)}s</div>` : '';
      html = `<div class="mp-name">${t.label(def)}</div><div class="mp-val">${h.value} <small>${h.unit || ''}</small></div>${timeStr}<div class="mp-stars">${[0, 1, 2].map((i) => `<i class="star${i < h.stars ? ' on' : ''}"></i>`).join('')}</div>`;
    } else if (this.mode === 'tt' && race) {
      const cur = race.phase === 'racing' ? Math.max(0, race.raceTime - (lapStart || 0)) : 0;
      html = `<div class="mp-name">${t('menu.tt')}</div><div class="tt-row"><span>${t('race.lap')}</span><b>${formatTime(cur)}</b></div><div class="tt-row"><span>${t('race.best')}</span><b>${bestLap ? formatTime(bestLap) : '--:--.--'}</b></div>${ghost ? `<div class="tt-row ghost"><span>${t('race.ghost')}</span><b>${formatTime(ghost.ghost.lapTime)}</b></div>` : ''}`;
    }
    if (html !== this._panelKey) {
      this._panelKey = html;
      this.panel.innerHTML = html;
      this.panel.classList.toggle('hidden', !html);
    }
  }

  update(dt, { player, karts, race, itemSystem, time = 0, mission = null, ghost = null, bestLap = null, lapStart = 0 } = {}) {
    if (!this.active || !player) return;
    const L = this._last;
    this._updatePanel({ player, race, mission, ghost, bestLap, lapStart });

    // lap
    const laps = race ? race.laps : this.laps || 3;
    const lap = Math.max(1, Math.min(laps, player.lap || 1));
    if (L.lap !== lap || L.laps !== laps) {
      if (L.lap != null && lap > L.lap) restartAnim(this.lapEl, 'pulse');
      L.lap = lap; L.laps = laps;
      this.lapVal.textContent = lap; this.lapOf.textContent = '/' + laps;
      this.lapEl.classList.toggle('final', lap === laps && laps > 1);
    }

    // timer
    const rt = race ? (race.phase === 'racing' || race.phase === 'done' ? (player.finished ? player.finishTime : race.raceTime) : 0) : 0;
    const ts = formatTime(rt);
    if (L.ts !== ts) { L.ts = ts; this.timerEl.textContent = ts; }

    // splits
    const lt = player.lapTimes || [];
    if (L.splits !== lt.length) {
      L.splits = lt.length;
      const best = lt.length ? Math.min(...lt) : 0;
      this.splitsEl.innerHTML = lt.map((t, i) => `<div class="split${t === best && lt.length > 1 ? ' best' : ''}"><span>L${i + 1}</span>${formatTime(t)}</div>`).join('');
    }

    // place
    const place = player.place || 1;
    if (L.place !== place) {
      L.place = place;
      this.placeNum.textContent = place;
      this.placeSuf.textContent = ordinal(place);
      this.placeEl.style.setProperty('--pc', PLACE_COLORS[place - 1] || '#fff');
      restartAnim(this.placeEl, 'bump');
    }

    // item slot
    let spinning = false, display = null;
    if (itemSystem && typeof itemSystem.rouletteState === 'function') {
      try { const rs = itemSystem.rouletteState(player); if (rs) { spinning = !!rs.spinning; display = rs.displayItem || null; } } catch (e) { /* ignore */ }
    }
    let key;
    if (spinning) {
      this._rouletteTimer -= dt;
      if (this._rouletteTimer <= 0) { this._rouletteTimer = 0.07; this._rouletteIdx = (this._rouletteIdx + 1) % ITEMS.length; }
      const shown = display && ITEMS.includes(display) ? display : ITEMS[this._rouletteIdx];
      key = 'spin:' + shown;
      if (key !== this._lastItemKey) this.itemImg.src = itemIcon(shown);
    } else if (player.item) {
      const count = player.itemCount || 1;
      key = 'item:' + player.item + ':' + count;
      if (key !== this._lastItemKey) {
        this.itemImg.src = itemIcon(player.item);
        this.itemCount.textContent = count > 1 ? '×' + count : '';
        this.itemName.textContent = t.label(ITEM_INFO[player.item]);
      }
    } else {
      key = 'none';
    }
    if (key !== this._lastItemKey) {
      this._lastItemKey = key;
      const has = key !== 'none';
      this.itemImg.style.visibility = has ? 'visible' : 'hidden';
      this.itemSlot.classList.toggle('spinning', spinning);
      this.itemSlot.classList.toggle('filled', has && !spinning);
      if (!player.item || spinning) { this.itemCount.textContent = ''; this.itemName.textContent = ''; }
      this.itemHint.style.opacity = has && !spinning ? 1 : 0;
    }

    // speedometer (km/h-ish: units/s * 3.6)
    const sp = Math.abs(player.speed || 0);
    const boosting = player.boostTimer > 0 || player.starTimer > 0;
    this._drawSpeedo(sp, boosting);
    const kmh = Math.round(sp * 3.6);
    if (L.kmh !== kmh) { L.kmh = kmh; this.speedText.textContent = kmh; }
    if (L.boost !== boosting) { L.boost = boosting; this.speedo.classList.toggle('boost', boosting); }
    const dl = player.drifting ? (player.driftLevel || 0) : -1;
    if (L.dl !== dl) {
      L.dl = dl;
      this.driftPill.className = 'drift-pill' + (dl >= 0 ? ' show lvl' + dl : '');
      this.driftPill.textContent = dl >= 3 ? 'ULTRA' : dl === 2 ? 'SUPER' : dl === 1 ? 'MINI' : 'DRIFT';
    }

    // standings
    const standings = (race && race.standings) || karts || [];
    const sk = standings.map((k) => k.index).join(',');
    if (sk !== this._standKey) {
      this._standKey = sk;
      for (let i = 0; i < this.standRows.length; i++) {
        const row = this.standRows[i], k = standings[i];
        if (!k) { row.row.style.display = 'none'; continue; }
        row.row.style.display = '';
        row.pos.textContent = i + 1;
        row.chip.style.background = k.character ? hex(k.character.color) : '#888';
        row.name.textContent = k.character ? t.label(k.character) : '?';
        row.row.classList.toggle('me', k === player);
      }
    }

    this._drawMinimap(standings, player, time, itemSystem);
  }

  hideResults() {
    if (this._resKey) { window.removeEventListener('keydown', this._resKey); this._resKey = null; }
    this.resultsEl.classList.remove('show');
    this.resultsEl.classList.add('hidden');
    this.resultsEl.innerHTML = '';
  }

  get resultsVisible() { return !!this._resKey || this.resultsEl.classList.contains('show'); }

  dispose() {
    for (const off of this._offs) off();
    this._offs = [];
    this.hideResults();
    this.root.remove(); this.flashEl.remove(); this.resultsEl.remove(); this.toastEl.remove();
  }
}

export { CHARACTERS };
