// Post-race screens: race results, Grand Prix standings, podium overlay, Time Trial and mission results, unlock
// announcements. Each method returns a Promise that resolves with the id of the button the player picked.
import { bus } from './events.js';
import { trackByKey } from './config.js';
import { assetURL, uiURL } from './assets.js';
import { t } from './i18n.js';
import { formatTime } from './race.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
const ordinal = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
const PLACE_COLORS = ['#ffd23f', '#e3ecf5', '#f0a162', '#fff4dc', '#fff4dc', '#fff4dc', '#fff4dc', '#fff4dc'];
const starRow = (n, big = false) => [0, 1, 2].map((i) => `<i class="star${i < n ? ' on' : ''}${big ? ' big' : ''}" style="--d:${0.4 + i * 0.25}s"></i>`).join('');

export class Screens {
  constructor(uiRoot, app) {
    this.uiRoot = uiRoot;
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'screen post-screen hidden';
    uiRoot.appendChild(this.el);
    this.buttons = [];
    this.sel = 0;
    this.resolve = null;
    this.armT = 0;
  }

  hide() {
    this.el.classList.add('hidden');
    this.el.classList.remove('show');
    this.el.innerHTML = '';
    this.buttons = [];
    if (this.resolve) { const r = this.resolve; this.resolve = null; r('menu'); }
  }

  _open(html, buttons, cls = '') {
    this.el.className = 'screen post-screen ' + cls;
    this.el.innerHTML = `<div class="sticker post-panel">${html}<div class="post-buttons"></div></div>`;
    const bar = this.el.querySelector('.post-buttons');
    this.buttons = (buttons || []).map((b, i) => {
      const e = document.createElement('button');
      e.className = 'sticker post-btn' + (b.primary ? ' primary' : '');
      e.textContent = b.label;
      e.addEventListener('click', () => this._pick(i));
      e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') { this.sel = i; this._focus(); } });
      bar.appendChild(e);
      return { ...b, el: e };
    });
    this.sel = Math.max(0, this.buttons.findIndex((b) => b.primary));
    this._focus();
    this.armT = 0.6;     // ignore presses from the race that just ended
    this.app.input?.clearLatches?.();
    requestAnimationFrame(() => this.el.classList.add('show'));
    return new Promise((res) => { this.resolve = res; });
  }
  _focus() { this.buttons.forEach((b, i) => b.el.classList.toggle('focus', i === this.sel)); }
  _pick(i) {
    if (this.armT > 0) return;
    const b = this.buttons[i];
    if (!b || !this.resolve) return;
    bus.emit('ui:confirm');
    const r = this.resolve; this.resolve = null;
    this.el.classList.remove('show');
    this.el.classList.add('hidden');
    r(b.id);
  }

  update(dt) {
    if (!this.resolve) return;
    if (this.armT > 0) { this.armT -= dt; this.app.input?.clearLatches?.(); return; }
    const inp = this.app.input;
    if (!inp) return;
    const n = this.buttons.length;
    if (inp.consumePressed('left') || inp.consumePressed('up')) { this.sel = (this.sel - 1 + n) % n; this._focus(); bus.emit('ui:move'); }
    if (inp.consumePressed('right') || inp.consumePressed('down')) { this.sel = (this.sel + 1) % n; this._focus(); bus.emit('ui:move'); }
    if (inp.consumePressed('confirm')) this._pick(this.sel);
  }

  _portrait(c) {
    const src = this.app.portrait(c.id);
    return `<div class="res-portrait" style="--kc:${hex(c.color)}">${src ? `<img src="${src}" alt="">` : `<span>${c.name[0]}</span>`}</div>`;
  }

  // ------------------------------------------------------------------ race results
  raceResults({ results, laps, title, sub, points, bestLap, buttons }) {
    const rows = results.map((r, i) => `
      <div class="res-row${r.isPlayer ? ' me' : ''}" style="--d:${0.15 + i * 0.06}s">
        <div class="res-place" style="color:${PLACE_COLORS[r.place - 1]}">${r.place}<small>${ordinal(r.place)}</small></div>
        ${this._portrait(r.character)}
        <div class="res-name">${t.label(r.character)}${r.isPlayer ? ` <em>${t('res.you')}</em>` : ''}</div>
        <div class="res-best">${r.bestLap ? t('res.bestlap') + ' ' + formatTime(r.bestLap) : ''}</div>
        <div class="res-time">${r.estimated ? '~' : ''}${formatTime(r.time)}</div>
        ${points ? `<div class="res-pts">+${points[r.character.id] || 0}</div>` : ''}
      </div>`).join('');
    const html = `<div class="post-title">${title}</div><div class="post-sub">${sub || `${laps} ${t('laps')} · ${t('res.results')}`}</div><div class="res-table">${rows}</div>`;
    return this._open(html, buttons, 'results-screen');
  }

  // ------------------------------------------------------------------ GP standings
  standings({ rows, title, sub, buttons }) {
    const max = Math.max(1, ...rows.map((r) => r.pts));
    const html = `<div class="post-title">${title}</div><div class="post-sub">${sub}</div><div class="stand-table">${rows.map((r, i) => `
      <div class="stand-row${r.isPlayer ? ' me' : ''}" style="--d:${0.1 + i * 0.07}s">
        <div class="res-place" style="color:${PLACE_COLORS[i]}">${i + 1}</div>
        ${this._portrait(r.character)}
        <div class="res-name">${t.label(r.character)}</div>
        <div class="stand-bar"><i style="--w:${(r.pts / max) * 100}%;--kc:${hex(r.character.color)}"></i></div>
        <div class="stand-pts">${r.pts} <small>${t('gp.pts')}</small>${r.gained ? `<em>+${r.gained}</em>` : ''}</div>
      </div>`).join('')}</div>`;
    return this._open(html, buttons, 'standings-screen');
  }

  // ------------------------------------------------------------------ podium overlay (3D scene drawn behind)
  podium({ top3, player, trophy, cup, buttons }) {
    const msg = trophy ? t('gp.trophy.' + trophy) : t('gp.trophy.none');
    const html = `<div class="post-title">${t('gp.podium')}</div><div class="post-sub">${t.label(cup)}</div>
      <div class="podium-names">${top3.map((c, i) => `<div class="pn pn${i + 1}"><b>${i + 1}</b> ${t.label(c)}</div>`).join('')}</div>
      <div class="trophy-banner ${trophy || 'none'}">${trophy ? `<img src="${uiURL('ui/icons/trophy.webp')}" alt="">` : ''}<span>${msg}</span></div>`;
    void player;
    return this._open(html, buttons, 'podium-screen');
  }

  // ------------------------------------------------------------------ time trial
  ttResult({ trackKey, total, lapTimes, best, record, newBest, ghostSaved, buttons }) {
    const tr = trackByKey(trackKey);
    const html = `<div class="post-title">${newBest ? t('res.newbest') : t('menu.tt')}</div><div class="post-sub">${t.label(tr)}</div>
      <div class="tt-grid">
        <div class="tt-big"><span>${t('res.time')}</span><b>${formatTime(total)}</b></div>
        <div class="tt-laps">${(lapTimes || []).map((l, i) => `<div class="${l === best ? 'best' : ''}"><span>${t('race.lap')} ${i + 1}</span>${formatTime(l)}</div>`).join('')}</div>
        <div class="tt-big"><span>${t('tt.best')}</span><b>${formatTime(record)}</b></div>
      </div>
      ${ghostSaved ? `<div class="tt-ghost">${t('tt.newghost')}</div>` : ''}`;
    return this._open(html, buttons, 'tt-screen');
  }

  // ------------------------------------------------------------------ missions
  missionResult({ def, result, improved, best, buttons }) {
    const ok = result.stars > 0;
    const fmtScore = def.type === 'clean' ? formatTime(result.score) : def.type === 'overtake' ? result.score + ordinal(result.score) : String(result.score);
    const th = (result.thresholds || def.stars).map((v) => (def.type === 'clean' ? formatTime(v) : def.type === 'overtake' ? v + ordinal(v) : v));
    const html = `<div class="post-title">${ok ? t('m.complete') : t('m.failed')}</div><div class="post-sub">${t.label(def)}</div>
      <div class="mission-stars">${starRow(result.stars, true)}</div>
      <div class="mission-score">${fmtScore}</div>
      <div class="mission-th">${th.map((v, i) => `<span>${'★'.repeat(i + 1)} ${v}</span>`).join('')}</div>
      ${improved ? `<div class="tt-ghost">${t('res.newbest')}</div>` : ''}
      <div class="mission-best">${t('m.stars')}: ${starRow(best)}</div>`;
    return this._open(html, buttons, 'mission-screen');
  }

  // ------------------------------------------------------------------ unlocks
  async unlocks(list) {
    for (const u of list) {
      let body = '';
      if (u.kind === 'racer') body = `${this._portrait(u.obj)}<div class="unlock-name">${t.label(u.obj)}</div>`;
      else body = `<div class="unlock-name">${t.label(u.obj)}</div>`;
      await this._open(`<div class="post-title">${t('unlock.new')}</div><div class="unlock-body">${body}</div>`, [{ id: 'ok', label: t('continue'), primary: true }], 'unlock-screen');
    }
  }
}
