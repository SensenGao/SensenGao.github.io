// Menus: loading, title, main menu, mode setup flows (cup / class / track / racer + paint), missions, settings,
// credits and the pause menu. "Sticker" UI; navigable with keyboard, gamepad (polled), mouse and touch.
import { bus } from './events.js';
import { CHARACTERS, PAINTS, CUPS, TRACKS, CLASS_ORDER, DIFFICULTY } from './config.js';
import { MISSIONS } from './missions.js';
import * as Save from './save.js';
import { assetURL, uiURL } from './assets.js';
import { t, lang } from './i18n.js';
import { CREDITS_HTML } from './credits.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
const STAT_KEYS = ['speed', 'accel', 'handling', 'weight'];
function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const stars = (n, of = 3) => Array.from({ length: of }, (_, i) => `<i class="star${i < n ? ' on' : ''}"></i>`).join('');

export class Menu {
  constructor(uiRoot, app) {
    this.uiRoot = uiRoot;
    this.app = app;
    this.root = el('div', 'menus', uiRoot);
    this.stack = [];          // pages
    this.page = null;
    this.screen = null;
    this._buildLoading();
    this._buildTitle();
    this.pauseEl = null;
    this._focusRacer = null;
    this._resetArm = false;
  }

  // ------------------------------------------------------------------ loading
  _buildLoading() {
    this.loadEl = el('div', 'screen loading-screen hidden', this.uiRoot);
    this.loadEl.innerHTML = `
      <div class="load-logo"><img src="${uiURL('ui/logo.webp')}" alt="Zoomies GP" onerror="this.style.display='none'"></div>
      <div class="load-text">LOADING</div>
      <div class="load-bar"><div class="load-fill"></div></div>
      <div class="load-pct">0%</div>`;
    this.loadText = this.loadEl.querySelector('.load-text');
    this.loadFill = this.loadEl.querySelector('.load-fill');
    this.loadPct = this.loadEl.querySelector('.load-pct');
  }
  showLoading(text = 'LOADING', p = null) {
    this._closeAll();
    this.loadEl.classList.remove('hidden');
    this.loadText.textContent = text;
    this.setLoading(p == null ? 0 : p);
    this.screen = 'loading';
  }
  setLoading(p) {
    const v = Math.max(0, Math.min(1, p || 0));
    this.loadFill.style.width = (v * 100).toFixed(1) + '%';
    this.loadPct.textContent = Math.round(v * 100) + '%';
  }

  // ------------------------------------------------------------------ title
  _buildTitle() {
    this.titleEl = el('div', 'screen title-screen hidden', this.uiRoot);
    this.titleEl.addEventListener('click', () => { if (this.screen === 'title') this._leaveTitle(); });
  }
  _leaveTitle() {
    this.app.audio.unlock?.();
    this._sfx('confirm');
    if (!this._welcomed) { this._welcomed = true; setTimeout(() => bus.emit('ui:welcome'), 250); }
    this.showMain();
  }
  showTitle() {
    this._closeAll();
    this.titleEl.innerHTML = `
      <div class="title-vignette"></div>
      <img class="title-logo" src="${uiURL('ui/logo.webp')}" alt="Zoomies GP">
      <div class="title-tag">${t('title.tag')}</div>
      <button class="sticker start-btn">${t('start')} ▶</button>
      <div class="press-start">${t('title.press')}</div>
      <div class="title-foot">${t('controls')}</div>`;
    this.titleEl.classList.remove('hidden');
    this.screen = 'title';
    this.app.input?.clearLatches?.();
  }

  // ------------------------------------------------------------------ generic pages
  /**
   * Push a page. spec: { cls, title, build(body, page) -> items[], cols, onBack, footer }
   * items: [{ el, activate(), left(), right(), disabled }]
   */
  push(spec) {
    if (this.page) this.page.el.classList.add('hidden');
    const p = { spec, el: el('div', 'screen page ' + (spec.cls || ''), this.root), items: [], focus: 0, cols: spec.cols || 1 };
    p.el.innerHTML = `<div class="page-head"><button class="back-btn">◀ ${t('back')}</button><div class="page-title">${spec.title || ''}</div><div class="page-extra"></div></div><div class="page-body"></div>`;
    p.el.querySelector('.back-btn').addEventListener('click', () => this.back());
    if (!spec.onBack && this.stack.length === 0 && spec.root) p.el.querySelector('.back-btn').style.visibility = 'hidden';
    p.body = p.el.querySelector('.page-body');
    p.extra = p.el.querySelector('.page-extra');
    this.stack.push(p);
    this.page = p;
    this.app.input?.clearLatches?.();
    this._render(p);
    this.screen = 'page';
    return p;
  }
  _render(p) {
    p.body.innerHTML = '';
    p.items = p.spec.build(p.body, p) || [];
    p.items.forEach((it, i) => {
      it.el.classList.add('focusable');
      if (it.disabled) it.el.classList.add('disabled');
      it.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && p.focus !== i) { p.focus = i; this._applyFocus(p); this._sfx('move'); } });
      it.el.addEventListener('click', () => { p.focus = i; this._applyFocus(p); this._activate(p, it); });
    });
    p.focus = Math.min(p.focus, Math.max(0, p.items.length - 1));
    this._applyFocus(p);
  }
  refreshPage() { if (this.page) { const f = this.page.focus; this._render(this.page); this.page.focus = f; this._applyFocus(this.page); } }
  _applyFocus(p) {
    p.items.forEach((it, i) => it.el.classList.toggle('focus', i === p.focus));
    const it = p.items[p.focus];
    if (it && it.onFocus) it.onFocus();
    if (it && it.el.scrollIntoView && p.spec.scroll) it.el.scrollIntoView({ block: 'nearest' });
  }
  _activate(p, it) {
    if (!it) return;
    if (it.disabled) { this._sfx('error'); it.el.classList.remove('shake'); void it.el.offsetWidth; it.el.classList.add('shake'); return; }
    this._sfx('confirm');
    it.activate && it.activate();
  }
  back() {
    if (!this.page) return;
    const p = this.page;
    if (p.spec.onBack) { p.spec.onBack(); return; }
    if (this.stack.length <= 1) return;
    this._sfx('back');
    this.stack.pop();
    p.el.remove();
    this.page = this.stack[this.stack.length - 1];
    this.page.el.classList.remove('hidden');
    this.refreshPage();
  }
  _closeAll() {
    for (const p of this.stack) p.el.remove();
    this.stack = []; this.page = null;
    this.titleEl.classList.add('hidden');
    this.loadEl.classList.add('hidden');
    this._focusRacer = null;
    this.screen = null;
  }
  hideAll() { this._closeAll(); this.hidePause(); }
  refresh() { if (this.screen === 'title') this.showTitle(); else this.refreshPage(); if (this.pauseEl) { this.hidePause(); this.showPause(); } }
  focusRacer() { return this.screen === 'page' ? this._focusRacer : null; }
  /** Racer-select turntable: { id, paint, locked, rect } while the racer page is on screen. */
  turntableInfo() {
    const tt = this._turn;
    if (!tt || this.screen !== 'page' || !this.page || !tt.el.isConnected || this.page.el.classList.contains('hidden')) return null;
    const r = tt.el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return null;
    return { id: tt.id, paint: tt.paint, locked: tt.locked, rect: r };
  }
  subPageOpen() { return !!(this.pauseEl && this.pauseSub); }

  _sfx(kind) { bus.emit(kind === 'move' ? 'ui:move' : kind === 'back' ? 'ui:back' : kind === 'error' ? 'ui:error' : 'ui:confirm'); }

  // ------------------------------------------------------------------ main menu
  showMain() {
    this._closeAll();
    const total = Save.totalStars();
    const sv = Save.save();
    this.push({
      cls: 'main-menu', title: '', root: true,
      onBack: () => this.showTitle(),
      build: (body) => {
        body.innerHTML = `<img class="main-logo" src="${uiURL('ui/logo.webp')}" alt="Zoomies GP"><div class="main-cols"><div class="main-list"></div><div class="main-side"></div></div>`;
        const list = body.querySelector('.main-list');
        const side = body.querySelector('.main-side');
        const trophies = CUPS.map((c) => {
          const tr = sv.trophies[c.id] || {};
          return `<div class="trophy-row"><span>${t.label(c)}</span>${CLASS_ORDER.map((k) => `<b class="cup ${tr[k] || 'none'}" title="${t('class.' + k)}">${t('class.' + k)[0]}</b>`).join('')}</div>`;
        }).join('');
        side.innerHTML = `<div class="sticker side-card"><div class="side-stars"><img src="${uiURL('ui/icons/star.webp')}" alt=""> <span>${t('menu.stars', { n: total })}</span></div><div class="side-title">${t('menu.trophies')}</div>${trophies}</div>`;
        const items = [];
        const entries = [
          ['gp', 'menu.gp', () => this.flowGP()], ['quick', 'menu.quick', () => this.flowQuick()], ['tt', 'menu.tt', () => this.flowTT()],
          ['missions', 'menu.missions', () => this.flowMissions()], ['settings', 'menu.settings', () => this.showSettings()], ['credits', 'menu.credits', () => this.showCredits()],
        ];
        entries.forEach(([id, key, fn], i) => {
          const b = el('button', 'sticker main-btn btn-' + id, list, `<span class="mb-title">${t(key)}</span>${t(key + '.sub') !== key + '.sub' ? `<span class="mb-sub">${t(key + '.sub')}</span>` : ''}`);
          b.style.setProperty('--tilt', ((i % 2 ? 1 : -1) * 0.8) + 'deg');
          items.push({ el: b, activate: fn });
        });
        return items;
      },
    });
  }

  // ------------------------------------------------------------------ flows
  flowGP() {
    const sel = { mode: 'gp' };
    this._pickCup((cup) => { sel.cupId = cup.id; this._pickClass((cls) => { sel.cls = cls; this._pickRacer(sel); }); });
  }
  flowQuick() {
    const sel = { mode: 'quick', laps: 3 };
    this._pickTrack((tr) => { sel.trackKey = tr.key; this._pickClass((cls) => { sel.cls = cls; this._pickRacer(sel); }); });
  }
  flowTT() {
    const sel = { mode: 'tt' };
    this._pickTrack((tr) => { sel.trackKey = tr.key; this._pickRacer(sel); }, true);
  }
  flowMissions() {
    const sv = Save.save();
    this.push({
      cls: 'missions-page', title: t('menu.missions'), cols: 5,
      build: (body, page) => {
        page.extra.innerHTML = `<span class="hdr-stars"><img src="${uiURL('ui/icons/star.webp')}" alt="">${Save.totalStars()} / ${MISSIONS.length * 3}</span>`;
        const grid = el('div', 'mission-grid', body);
        const info = el('div', 'sticker mission-info', body);
        return MISSIONS.map((m, i) => {
          const tr = TRACKS.find((x) => x.key === m.track);
          const card = el('button', 'sticker mission-card', grid, `<div class="mc-num">${i + 1}</div><div class="mc-name">${t.label(m)}</div><div class="mc-track">${t.label(tr)}</div><div class="mc-stars">${stars(sv.stars[m.id] | 0)}</div>`);
          card.classList.add('track-' + tr.id);
          return {
            el: card,
            onFocus: () => { info.innerHTML = `<div class="mi-name">${t.label(m)}</div><div class="mi-goal">${t.field(m, 'goal')}</div><div class="mi-track">${t.label(tr)}</div>`; },
            activate: () => this._pickRacer({ mode: 'mission', missionId: m.id }),
          };
        });
      },
    });
  }

  _pickCup(next) {
    const sv = Save.save();
    this.push({
      cls: 'cup-page', title: t('choose.cup'), cols: CUPS.length,
      build: (body) => {
        const row = el('div', 'card-row', body);
        return CUPS.map((cup) => {
          const ok = Save.cupUnlocked(cup);
          const tr = sv.trophies[cup.id] || {};
          const tracks = cup.races.map((k) => t.label(TRACKS.find((x) => x.key === k))).join('<br>');
          const card = el('button', 'sticker cup-card', row, `
            <img class="cup-icon" src="${uiURL('ui/icons/trophy.webp')}" alt="">
            <div class="cup-name">${t.label(cup)}</div>
            <div class="cup-tracks">${ok ? tracks : '<i class="lock"></i>' + Save.unlockText(cup.unlock, t)}</div>
            <div class="cup-trophies">${CLASS_ORDER.map((k) => `<b class="cup ${tr[k] || 'none'}">${t('class.' + k)}</b>`).join('')}</div>`);
          if (!ok) card.classList.add('locked');
          return { el: card, disabled: !ok, activate: () => next(cup) };
        });
      },
    });
  }
  _pickClass(next) {
    this.push({
      cls: 'class-page', title: t('choose.class'), cols: 3,
      build: (body) => {
        const row = el('div', 'card-row', body);
        return CLASS_ORDER.map((k, i) => {
          const card = el('button', 'sticker class-card class-' + k, row, `<div class="class-speed">${'▶'.repeat(i + 1)}</div><div class="class-name">${t('class.' + k)}</div><div class="class-sub">${t('class.' + k + '.sub')}</div>`);
          return { el: card, activate: () => next(k) };
        });
      },
    });
    if (this.page) this.page.focus = 1, this._applyFocus(this.page);
  }
  _pickTrack(next, tt = false) {
    const sv = Save.save();
    this.push({
      cls: 'track-page', title: t('choose.track'), cols: TRACKS.length,
      build: (body) => {
        const row = el('div', 'card-row', body);
        return TRACKS.map((tr) => {
          const ok = Save.trackUnlocked(tr);
          const best = tt ? sv.bestLap[tr.key] : null;
          const card = el('button', 'sticker track-card track-' + tr.thumb, row, `
            <div class="tc-thumb" style="background-image:url('${uiURL('ui/thumbs/' + tr.thumb + '.webp')}')"></div>
            <div class="tc-name">${t.label(tr)}</div>
            <div class="tc-sub">${ok ? (tt ? (best ? t('tt.best') + ' ' + fmt(best) : t('tt.noghost')) : '') : '<i class="lock"></i>' + Save.unlockText(tr.unlock, t)}</div>`);
          if (!ok) card.classList.add('locked');
          return { el: card, disabled: !ok, activate: () => next(tr) };
        });
      },
    });
  }

  _pickRacer(sel) {
    const sv = Save.save();
    const startIdx = Math.max(0, CHARACTERS.findIndex((c) => c.id === sv.lastRacer));
    let paintIdx = {};
    this.push({
      cls: 'racer-page', title: t('choose.racer'), cols: 5,
      build: (body, page) => {
        body.innerHTML = '<div class="racer-grid"></div><div class="racer-side"><div class="rp-stage"></div><div class="sticker racer-panel"></div></div>';
        const grid = body.querySelector('.racer-grid');
        const panel = body.querySelector('.racer-panel');
        const stage = body.querySelector('.rp-stage');
        const items = CHARACTERS.map((c, i) => {
          const ok = Save.racerUnlocked(c);
          const card = el('button', 'sticker racer-card', grid, `
            <div class="rc-portrait" style="--kc:${hex(c.color)}">${this.app.portrait(c.id) ? `<img src="${this.app.portrait(c.id)}" alt="">` : `<span>${c.name[0]}</span>`}</div>
            <div class="rc-name">${ok ? t.label(c) : '???'}</div>`);
          card.style.setProperty('--kc', hex(c.color));
          if (!ok) card.classList.add('locked');
          const showPanel = () => {
            this._focusRacer = null;
            const unlockedPaints = PAINTS.filter((p) => Save.paintUnlocked(p));
            let pi = paintIdx[c.id];
            if (pi == null) { const want = sv.paint[c.id] || 'stock'; pi = Math.max(0, unlockedPaints.findIndex((p) => p.id === want)); paintIdx[c.id] = pi; }
            const paint = unlockedPaints[pi] || PAINTS[0];
            this._turn = { id: c.id, paint: paint.id, locked: !ok, el: stage };
            panel.innerHTML = ok ? `
              <div class="rp-name">${t.label(c)}</div>
              <div class="rp-species">${t.field(c, 'species')} · ${t.field(c, 'kart')}</div>
              <div class="rp-stats">${STAT_KEYS.map((k) => `<div class="stat"><span>${t('stat.' + k)}</span><div class="bar">${[1, 2, 3, 4, 5].map((v) => `<i class="${v <= c.stats[k] ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}</div>
              <div class="rp-paint"><span>${t('paint')}</span><button class="arrow pl">◀</button><b>${t.label(paint)}</b><button class="arrow pr">▶</button><em>${PAINTS.length - unlockedPaints.length ? '<i class="lock"></i>' + (PAINTS.length - unlockedPaints.length) : ''}</em></div>
              <button class="sticker go-btn">${t('start')} ▶</button>` : `
              <div class="rp-name">???</div><div class="rp-lock"><i class="lock"></i>${Save.unlockText(c.unlock, t)}</div>`;
            const cyc = (d) => { paintIdx[c.id] = (pi + d + unlockedPaints.length) % unlockedPaints.length; this._sfx('move'); showPanel(); };
            panel.querySelector('.pl')?.addEventListener('click', (e) => { e.stopPropagation(); cyc(-1); });
            panel.querySelector('.pr')?.addEventListener('click', (e) => { e.stopPropagation(); cyc(1); });
            panel.querySelector('.go-btn')?.addEventListener('click', () => go());
            page._cyc = cyc;
          };
          const go = () => {
            const unlockedPaints = PAINTS.filter((p) => Save.paintUnlocked(p));
            const paint = unlockedPaints[paintIdx[c.id] || 0] || PAINTS[0];
            this._sfx('confirm');
            this.app.startSession({ ...sel, racerId: c.id, paint: paint.id });
          };
          return { el: card, disabled: !ok, onFocus: showPanel, activate: go, left: null };
        });
        page.focus = startIdx;
        return items;
      },
    });
  }

  // ------------------------------------------------------------------ settings & credits
  showSettings(fromPause = false) {
    const s = Save.settings();
    const qName = (q) => (q === 'auto' ? t('q.auto', { p: t('q.' + (this.app.autoQuality || 'medium')) }) : t('q.' + q));
    const rows = [
      { key: 'music', label: 'set.music', get: () => Math.round(s.music * 10), fmt: (v) => `${'■'.repeat(v)}${'□'.repeat(10 - v)}`, step: (d) => { Save.setSetting('music', Math.max(0, Math.min(1, Math.round(s.music * 10 + d) / 10))); this.app.settingsChanged('music'); } },
      { key: 'sfx', label: 'set.sfx', get: () => Math.round(s.sfx * 10), fmt: (v) => `${'■'.repeat(v)}${'□'.repeat(10 - v)}`, step: (d) => { Save.setSetting('sfx', Math.max(0, Math.min(1, Math.round(s.sfx * 10 + d) / 10))); this.app.settingsChanged('sfx'); bus.emit('ui:move'); } },
      { key: 'voice', label: 'set.voice', get: () => Math.round((s.voice ?? 0.9) * 10), fmt: (v) => `${'■'.repeat(v)}${'□'.repeat(10 - v)}`, step: (d) => { Save.setSetting('voice', Math.max(0, Math.min(1, Math.round((s.voice ?? 0.9) * 10 + d) / 10))); this.app.settingsChanged('voice'); this.app.audio.say?.('go'); } },
      { key: 'voiceMuted', label: 'set.voiceMute', get: () => !s.voiceMuted, fmt: (v) => (v ? t('on') : t('off')), step: () => { Save.setSetting('voiceMuted', !s.voiceMuted); this.app.settingsChanged('voiceMuted'); } },
      { key: 'muted', label: 'set.mute', get: () => s.muted, fmt: (v) => (v ? t('on') : t('off')), step: () => { Save.setSetting('muted', !s.muted); this.app.settingsChanged('muted'); } },
      { key: 'quality', label: 'set.quality', get: () => s.quality, fmt: qName, step: (d) => { const opts = ['auto', 'low', 'medium', 'high']; const i = (opts.indexOf(s.quality) + d + opts.length) % opts.length; Save.setSetting('quality', opts[i]); this.app.settingsChanged('quality', opts[i]); } },
      { key: 'lang', label: 'set.lang', get: () => s.lang, fmt: (v) => (v === 'zh' ? '中文' : 'English'), step: () => { Save.setSetting('lang', s.lang === 'zh' ? 'en' : 'zh'); document.documentElement.lang = s.lang; this.app.settingsChanged('lang'); } },
      { key: 'assist', label: 'set.assist', get: () => s.assist || 'auto', fmt: (v) => t('assist.' + v), step: (d) => { const o = ['auto', 'on', 'off']; Save.setSetting('assist', o[(o.indexOf(s.assist || 'auto') + d + 3) % 3]); } },
      { key: 'shake', label: 'set.shake', get: () => s.shake, fmt: (v) => (v ? t('on') : t('off')), step: () => Save.setSetting('shake', !s.shake) },
      { key: 'autoAccel', label: 'set.auto', get: () => s.autoAccel, fmt: (v) => (v ? t('on') : t('off')), step: () => Save.setSetting('autoAccel', !s.autoAccel) },
    ];
    if (!fromPause) rows.push({ key: 'reset', label: 'set.reset', get: () => this._resetArm, fmt: (v) => (v ? t('set.reset.confirm') : '✖'), step: () => { if (this._resetArm) { Save.resetProgress(); this._resetArm = false; bus.emit('ui:confirm'); } else this._resetArm = true; } });
    const spec = {
      cls: 'settings-page', title: t('set.title'),
      build: (body) => {
        const box = el('div', 'sticker settings-box', body);
        return rows.map((r) => {
          const row = el('div', 'set-row', box, `<span class="set-lbl">${t(r.label)}</span><span class="set-val"><button class="arrow">◀</button><b>${r.fmt(r.get())}</b><button class="arrow">▶</button></span>`);
          const [l, rr] = row.querySelectorAll('.arrow');
          const upd = () => { row.querySelector('b').textContent = r.fmt(r.get()); };
          l.addEventListener('click', (e) => { e.stopPropagation(); r.step(-1); upd(); if (r.key === 'lang') this.refreshPage(); });
          rr.addEventListener('click', (e) => { e.stopPropagation(); r.step(1); upd(); if (r.key === 'lang') this.refreshPage(); });
          return { el: row, activate: () => { r.step(1); upd(); if (r.key === 'lang') this.refreshPage(); }, left: () => { r.step(-1); upd(); if (r.key === 'lang') this.refreshPage(); }, right: () => { r.step(1); upd(); if (r.key === 'lang') this.refreshPage(); } };
        });
      },
    };
    if (fromPause) { spec.onBack = () => this._closePauseSub(); }
    const p = this.push(spec);
    if (fromPause) { this.pauseSub = p; p.el.classList.add('over-pause'); }
  }
  showCredits() {
    this.push({
      cls: 'credits-page', title: t('credits.title'), scroll: true,
      build: (body) => {
        const box = el('div', 'sticker credits-box scrollable', body, CREDITS_HTML(lang()));
        return [{ el: box, activate: () => {}, up: () => { box.scrollTop -= 60; }, down: () => { box.scrollTop += 60; } }];
      },
    });
  }

  // ------------------------------------------------------------------ pause
  showPause() {
    if (this.pauseEl) return;
    this.app.input?.clearLatches?.();
    const p = this.pauseEl = el('div', 'screen pause-screen', this.uiRoot);
    p.innerHTML = `<div class="sticker pause-box"><div class="pause-title">${t('pause.title')}</div><div class="pause-list"></div><div class="pause-help">${t('controls')}</div></div>`;
    const list = p.querySelector('.pause-list');
    const acts = [['resume', 'pause.resume', () => this.app.resume()], ['restart', 'pause.restart', () => this.app.restartRace()], ['settings', 'pause.settings', () => this.showSettings(true)], ['quit', 'pause.quit', () => this.app.quitRace()]];
    this.pausePage = { el: p, items: [], focus: 0, cols: 1, spec: { onBack: () => this.app.resume() } };
    this.pausePage.items = acts.map(([id, key, fn]) => {
      const b = el('button', 'sticker pause-btn', list, t(key));
      const it = { el: b, activate: fn };
      b.addEventListener('click', () => { this._sfx('confirm'); fn(); });
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { this.pausePage.focus = acts.findIndex((a) => a[0] === id); this._applyFocus(this.pausePage); } });
      return it;
    });
    this._applyFocus(this.pausePage);
  }
  _closePauseSub() {
    if (this.pauseSub) { this.pauseSub.el.remove(); this.stack = this.stack.filter((x) => x !== this.pauseSub); this.pauseSub = null; this.page = this.stack[this.stack.length - 1] || null; this._sfx('back'); }
  }
  hidePause() {
    this._closePauseSub();
    if (this.pauseEl) { this.pauseEl.remove(); this.pauseEl = null; this.pausePage = null; }
  }

  // ------------------------------------------------------------------ input (keyboard + gamepad polling)
  update(dt, gameState) {
    const inp = this.app.input;
    if (!inp) return;
    const press = (a) => inp.consumePressed(a);
    if (this.screen === 'title') {
      if (press('confirm') || press('accelerate')) this._leaveTitle();
      return;
    }
    let p = null;
    if (this.pauseEl && !this.pauseSub) p = this.pausePage;
    else if (this.page && (this.screen === 'page' || this.pauseSub)) p = this.page;
    if (!p) { ['up', 'down', 'left', 'right', 'confirm', 'back'].forEach((a) => press(a)); return; }
    const n = p.items.length;
    const cols = p.cols || 1;
    const it = p.items[p.focus];
    const move = (d) => { if (!n) return; p.focus = (p.focus + d + n) % n; this._applyFocus(p); this._sfx('move'); };
    if (press('left')) { if (it && it.left) it.left(); else if (it && p === this.page && p._cyc && it.onFocus && cols > 1 && false) p._cyc(-1); else if (cols > 1) move(-1); }
    if (press('right')) { if (it && it.right) it.right(); else if (cols > 1) move(1); }
    if (press('up')) { if (it && it.up) it.up(); else move(-cols); }
    if (press('down')) { if (it && it.down) it.down(); else move(cols); }
    if (press('item') && p._cyc) p._cyc(1);
    if (press('confirm')) this._activate(p, p.items[p.focus]);
    if (press('back')) { if (p === this.pausePage) this.app.resume(); else this.back(); }
  }
}

function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; }
