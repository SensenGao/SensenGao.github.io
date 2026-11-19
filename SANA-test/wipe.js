// SANA-test page: sections read top to bottom; each section (meta.sections) with cases gets its own wipe viewer, mode
// buttons, sample gallery and subgroup chips. One vertically stacked video per case and mode (top = left side, bottom =
// right side), split on a 2560x1440 canvas so both sides stay frame-locked. Media from window.MEDIA_BASE, json from
// window.DATA_BASE (both default to media/). Only viewers on screen draw and play.
(() => {
  const W = 2560, H = 1440;
  const MEDIA = window.MEDIA_BASE || 'media/', DATA = window.DATA_BASE || 'media/';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const ICON = {
    prev: '<path d="M15 18l-6-6 6-6"/>', next: '<path d="M9 18l6-6-6-6"/>', play: '<path d="M8 5v14M16 5v14"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  };
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const TEMPLATE = `
    <div class="stage">
      <div class="wipe" tabindex="0" role="slider" aria-label="拖动对比左右两侧" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
        <video muted loop playsinline preload="metadata"></video><canvas></canvas>
        <span class="badge l"></span><span class="badge r"></span>
        <span class="zoomtag">原图 · 双击后可放大查看</span>
        <div class="handle" aria-hidden="true"><span>${svg('<path d="M9 6l-6 6 6 6M15 6l6 6-6 6"/>')}</span></div>
      </div>
      <div class="bar">
        <div class="seg modes" role="group" aria-label="对比模式"></div>
        <div class="tools">
          <div class="seg zooms" role="group" aria-label="放大">
            <button type="button" data-z="1" aria-pressed="true">1×</button><button type="button" data-z="2" aria-pressed="false">2×</button><button type="button" data-z="4" aria-pressed="false">4×</button>
          </div>
          <button class="icon prev" type="button" aria-label="上一个">${svg(ICON.prev)}</button>
          <button class="icon play" type="button" aria-label="播放 / 暂停">${svg(ICON.play)}</button>
          <button class="icon next" type="button" aria-label="下一个">${svg(ICON.next)}</button>
          <button class="icon full" type="button" aria-label="全屏">${svg(ICON.full)}</button>
        </div>
      </div>
      <div class="meta"><h2><span class="tag"></span><span class="title"></span></h2><span class="count"></span><p class="caption"></p></div>
    </div>
    <div class="gallery">
      <div class="ghead"><h3>样例 <span class="count gcount"></span></h3><div class="filters"></div></div>
      <div class="grid"></div>
    </div>`;

  let BTN = {}, active = null;
  const viewers = [];

  class Viewer {
    constructor(root, cases, groups) {
      root.insertAdjacentHTML('beforeend', TEMPLATE);
      const q = s => root.querySelector(s);
      Object.assign(this, { root, cases, groups, q, shown: [], cur: -1, mode: '', split: .5, touched: false, t0: performance.now(),
        poster: null, visible: false, zoom: 1, fx: .5, fy: .5, group: groups.length > 1 ? groups[0][0] : '' });
      this.box = q('.wipe'); this.v = this.box.querySelector('video'); this.cv = this.box.querySelector('canvas');
      this.ctx = this.cv.getContext('2d'); this.cv.width = W; this.cv.height = H;
      this.handle = q('.handle'); this.bl = q('.badge.l'); this.br = q('.badge.r'); this.ztag = q('.zoomtag');
      this.bar = q('.modes'); this.grid = q('.grid'); this.filters = q('.filters');
      this.zooms = [...root.querySelectorAll('.zooms button')];
      this.bind(); this.chips(); this.render(); if (this.shown.length) this.select(this.shown[0], false);
      new IntersectionObserver(es => es.forEach(e => {
        this.visible = e.isIntersecting;
        if (!this.visible) this.v.pause(); else { if (!this.v.getAttribute('src') && this.cur >= 0) this.setMode(this.mode); this.play(); }
      })).observe(this.box);
    }
    play() { if (reduce.matches || !this.visible) return; const p = this.v.play(); if (p && p.catch) p.catch(() => {}); }
    draw() {
      if (!this.touched && !reduce.matches) this.split = .5 + .32 * Math.sin((performance.now() - this.t0) / 1600);
      this.handle.style.left = (this.split * 100) + '%';
      this.box.setAttribute('aria-valuenow', String(Math.round(this.split * 100)));
      const v = this.v, P = this.poster;
      const src = v.readyState >= 2 && v.videoWidth ? v : (P && P.complete && P.naturalWidth ? P : null);
      if (!src) return;
      const sw = W / this.zoom, sh = H / this.zoom;
      const sx0 = Math.min(W - sw, Math.max(0, this.fx * W - sw / 2)), sy0 = Math.min(H - sh, Math.max(0, this.fy * H - sh / 2));
      const cut = this.split * W, srcCut = sx0 + cut / this.zoom, ctx = this.ctx;
      if (src === P) { ctx.drawImage(src, sx0, sy0, sw, sh, 0, 0, W, H); return; }
      if (cut > 0) ctx.drawImage(src, sx0, sy0, srcCut - sx0, sh, 0, 0, cut, H);
      if (cut < W) ctx.drawImage(src, srcCut, H + sy0, sx0 + sw - srcCut, sh, cut, 0, W - cut, H);
    }
    buttons(c) {
      this.bar.innerHTML = '';
      for (const m of Object.keys(c.modes)) {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.mode = m;
        b.textContent = BTN[m] || `${c.modes[m].l} ⟷ ${c.modes[m].r}`;
        b.setAttribute('aria-pressed', String(m === this.mode)); b.addEventListener('click', () => this.setMode(m));
        this.bar.appendChild(b);
      }
      return Object.keys(c.modes);
    }
    setMode(m) {
      const c = this.cases[this.cur]; if (!c || !c.modes[m]) return;
      this.mode = m;
      this.bar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
      this.bl.textContent = c.modes[m].l; this.br.textContent = c.modes[m].r;
      if (!this.visible) { this.v.removeAttribute('src'); return; }      // load media only when the section is on screen
      const t = this.v.currentTime || 0;
      this.v.src = MEDIA + c.modes[m].f; this.v.load();
      this.v.addEventListener('loadeddata', () => { try { this.v.currentTime = t; } catch (e) {} this.play(); }, { once: true });
    }
    select(i, scroll = true) {
      if (i < 0 || i >= this.cases.length) return;
      this.cur = i; const c = this.cases[i];
      const ms = this.buttons(c); if (!c.modes[this.mode]) this.mode = ms[0];
      this.bar.style.display = ms.length > 1 ? '' : 'none';
      this.q('.title').textContent = c.title; this.q('.tag').textContent = c.group_zh || '';
      this.q('.caption').textContent = c.caption || '';
      this.q('.meta .count').textContent = `${this.shown.indexOf(i) + 1 || '–'} / ${this.shown.length}`;
      this.poster = new Image(); this.poster.src = MEDIA + c.poster;
      this.touched = false; this.t0 = performance.now(); this.split = .5;
      this.v.removeAttribute('src'); this.setMode(this.mode);
      this.grid.querySelectorAll('.card').forEach(el => el.setAttribute('aria-current', String(+el.dataset.i === i)));
      if (scroll) { active = this; this.q('.stage').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    step(d) { const k = this.shown.indexOf(this.cur); this.select(this.shown[(Math.max(k, 0) + d + this.shown.length) % this.shown.length], false); }
    render() {
      this.shown = this.cases.map((c, i) => i).filter(i => !this.group || this.cases[i].group === this.group);
      this.grid.innerHTML = '';
      for (const i of this.shown) {
        const c = this.cases[i], b = document.createElement('button');
        b.className = 'card'; b.type = 'button'; b.dataset.i = i; b.setAttribute('aria-current', String(i === this.cur));
        b.innerHTML = `<img loading="lazy" alt="" src="${MEDIA}${c.thumb}"><div class="t"><small></small><span></span></div><div class="m"><i>${Object.keys(c.modes).length} 种对比</i></div>`;
        b.querySelector('small').textContent = c.group_zh; b.querySelector('span').textContent = c.title;
        b.addEventListener('click', () => this.select(i));
        this.grid.appendChild(b);
      }
      this.q('.gcount').textContent = `${this.shown.length} 条`;
    }
    chips() {
      this.filters.innerHTML = '';
      const mk = (label, g) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(g === this.group));
        b.addEventListener('click', () => { this.group = g; this.chips(); this.render(); if (this.shown.length && !this.shown.includes(this.cur)) this.select(this.shown[0], false); });
        this.filters.appendChild(b);
      };
      if (this.groups.length > 1) {
        mk(`全部 ${this.cases.length}`, '');
        this.groups.forEach(([g, zh]) => { const n = this.cases.filter(c => c.group === g).length; if (n) mk(`${zh} ${n}`, g); });
      }
    }
    bind() {
      const box = this.box;
      this.zooms.forEach(b => b.addEventListener('click', () => {
        this.zoom = +b.dataset.z; this.zooms.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        this.ztag.textContent = this.zoom > 1 ? `${this.zoom}× 放大 · 双击改变中心` : '原图 · 双击后可放大查看';
      }));
      this.q('.prev').addEventListener('click', () => this.step(-1));
      this.q('.next').addEventListener('click', () => this.step(1));
      this.q('.play').addEventListener('click', () => { if (this.v.paused) this.play(); else this.v.pause(); });
      this.q('.full').addEventListener('click', () => { const s = this.q('.stage'); if (document.fullscreenElement) document.exitFullscreen(); else if (s.requestFullscreen) s.requestFullscreen(); });
      const pos = e => { const r = box.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
      let drag = false;
      box.addEventListener('pointerdown', e => { active = this; drag = true; box.setPointerCapture(e.pointerId); this.split = Math.min(1, Math.max(0, pos(e)[0])); this.touched = true; });
      box.addEventListener('pointermove', e => { if (drag) this.split = Math.min(1, Math.max(0, pos(e)[0])); });
      box.addEventListener('pointerup', () => { drag = false; });
      box.addEventListener('pointercancel', () => { drag = false; });
      box.addEventListener('focus', () => { active = this; });
      box.addEventListener('dblclick', e => {
        const [px, py] = pos(e), sw = 1 / this.zoom;
        const x0 = Math.min(1 - sw, Math.max(0, this.fx - sw / 2)), y0 = Math.min(1 - sw, Math.max(0, this.fy - sw / 2));
        this.fx = x0 + px * sw; this.fy = y0 + py * sw;
        if (this.zoom === 1) this.zooms.find(b => b.dataset.z === '2').click();
      });
    }
  }

  document.addEventListener('keydown', e => {
    const a = active || viewers.find(x => x.visible); if (!a || e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { a.touched = true; a.split = Math.min(1, Math.max(0, a.split + (e.key === 'ArrowLeft' ? -.04 : .04))); e.preventDefault(); }
    if (e.key === '[') a.step(-1);
    if (e.key === ']') a.step(1);
  });
  const loop = () => { for (const x of viewers) if (x.visible) x.draw(); requestAnimationFrame(loop); };

  Promise.all([fetch(DATA + 'cases.json', { cache: 'no-cache' }).then(r => r.json()),
               fetch(DATA + 'meta.json', { cache: 'no-cache' }).then(r => r.json())]).then(([cases, meta]) => {
    BTN = meta.buttons || {};
    if (meta.summary_html) document.querySelector('#summary').innerHTML = meta.summary_html;
    const main = document.querySelector('#sections'), toc = document.querySelector('#toc');
    for (const S of meta.sections) {
      const sec = document.createElement(S.appendix ? 'details' : 'section');
      sec.className = 'sec'; sec.id = S.id;
      const head = S.appendix ? `<summary><span class="num">附录</span>${S.title}</summary>` : `<header class="sechead"><span class="num">${S.num}</span><h2>${S.title}</h2></header>`;
      sec.innerHTML = head + (S.lede ? `<p class="seclede">${S.lede}</p>` : '') + (S.body_html || '');
      main.appendChild(sec);
      if (!S.appendix) toc.insertAdjacentHTML('beforeend', `<a href="#${S.id}"><b>${S.num}</b>${S.title}</a>`);
      for (const U of (S.subs || [{ id: S.id }])) {
        const list = cases.filter(c => c.sec === U.id);
        if (!list.length) continue;
        if (U.title) sec.insertAdjacentHTML('beforeend', `<div class="subhead" id="${U.id}"><h3>${U.title}</h3><span>${list.length} 条</span></div>` + (U.lede ? `<p class="sublede">${U.lede}</p>` : ''));
        const host = document.createElement('div'); host.className = 'viewer'; sec.appendChild(host);
        viewers.push(new Viewer(host, list, []));
      }
      if (S.notes_html) sec.insertAdjacentHTML('beforeend', `<div class="notes">${S.notes_html}</div>`);
    }
    requestAnimationFrame(loop);
  });
})();
