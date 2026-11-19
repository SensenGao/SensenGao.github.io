// SANA-test wipe viewer. One vertically stacked video per case and mode (top = left side, bottom = right side), split on
// a 2560x1440 canvas so both sides stay frame-locked. Cases are grouped into test categories (meta.cats: tab row, own
// conclusions) and data subgroups (filter chips). Media (mp4/jpg) load from window.MEDIA_BASE, case/meta json from
// window.DATA_BASE (both default to media/).
(() => {
  const W = 2560, H = 1440;
  const MEDIA = window.MEDIA_BASE || 'media/', DATA = window.DATA_BASE || 'media/';
  const $ = s => document.querySelector(s);
  const box = $('#wipe'), v = box.querySelector('video'), cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
  const handle = box.querySelector('.handle'), bl = $('#badge-l'), br = $('#badge-r'), ztag = $('#zoomtag');
  const zooms = [...document.querySelectorAll('#zooms button')], bar = $('#modes');
  const grid = $('#grid'), filters = $('#filters'), tabs = $('#cats');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  cv.width = W; cv.height = H;
  let cases = [], shown = [], cur = -1, mode = '', split = .5, touched = false, t0 = performance.now();
  let poster = null, visible = true, zoom = 1, fx = .5, fy = .5, BTN = {}, CATS = [], cat = '', group = '';

  const draw = () => {
    if (!touched && !reduce.matches) split = .5 + .32 * Math.sin((performance.now() - t0) / 1600);
    handle.style.left = (split * 100) + '%';
    box.setAttribute('aria-valuenow', String(Math.round(split * 100)));
    const src = v.readyState >= 2 && v.videoWidth ? v : (poster && poster.complete && poster.naturalWidth ? poster : null);
    if (!src) return;
    const sw = W / zoom, sh = H / zoom;
    const sx0 = Math.min(W - sw, Math.max(0, fx * W - sw / 2)), sy0 = Math.min(H - sh, Math.max(0, fy * H - sh / 2));
    const cut = split * W, srcCut = sx0 + cut / zoom;
    if (src === poster) { ctx.drawImage(src, sx0, sy0, sw, sh, 0, 0, W, H); return; }
    if (cut > 0) ctx.drawImage(src, sx0, sy0, srcCut - sx0, sh, 0, 0, cut, H);
    if (cut < W) ctx.drawImage(src, srcCut, H + sy0, sx0 + sw - srcCut, sh, cut, 0, W - cut, H);
  };
  const loop = () => { if (visible) draw(); requestAnimationFrame(loop); };
  const play = () => { if (reduce.matches) return; const p = v.play(); if (p && p.catch) p.catch(() => {}); };

  const buttons = c => {
    bar.innerHTML = '';
    const ms = Object.keys(c.modes);
    for (const m of ms) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.mode = m;
      b.textContent = BTN[m] || `${c.modes[m].l} ⟷ ${c.modes[m].r}`;
      b.setAttribute('aria-pressed', String(m === mode)); b.addEventListener('click', () => setMode(m)); bar.appendChild(b);
    }
    return ms;
  };
  const setMode = m => {
    const c = cases[cur]; if (!c || !c.modes[m]) return;
    mode = m;
    bar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    bl.textContent = c.modes[m].l; br.textContent = c.modes[m].r;
    const t = v.currentTime || 0;
    v.src = MEDIA + c.modes[m].f; v.load();
    v.addEventListener('loadeddata', () => { try { v.currentTime = t; } catch (e) {} play(); }, { once: true });
  };
  const select = i => {
    if (i < 0 || i >= cases.length) return;
    const c = cases[i];
    if (c.cat !== cat) setCat(c.cat, '', false);
    cur = i;
    const ms = buttons(c);
    if (!c.modes[mode]) mode = ms[0];
    $('#title').textContent = c.title;
    $('#style').textContent = c.group_zh || '';
    $('#caption').textContent = c.caption || '';
    $('#count').textContent = `${shown.indexOf(i) + 1 || '–'} / ${shown.length}`;
    poster = new Image(); poster.src = MEDIA + c.poster;
    touched = false; t0 = performance.now(); split = .5;
    v.removeAttribute('src');
    setMode(mode);
    grid.querySelectorAll('.card').forEach(el => el.setAttribute('aria-current', String(+el.dataset.i === i)));
    try { history.replaceState(null, '', '#' + c.id); } catch (e) {}
  };
  const step = d => { const k = shown.indexOf(cur); select(shown[(Math.max(k, 0) + d + shown.length) % shown.length]); };

  const render = () => {
    shown = cases.map((c, i) => i).filter(i => cases[i].cat === cat && (!group || cases[i].group === group));
    grid.innerHTML = '';
    for (const i of shown) {
      const c = cases[i], b = document.createElement('button');
      b.className = 'card'; b.type = 'button'; b.dataset.i = i; b.setAttribute('aria-current', String(i === cur));
      b.innerHTML = `<img loading="lazy" alt="" src="${MEDIA}${c.thumb}"><div class="t"><small></small><span></span></div><div class="m"><i>${Object.keys(c.modes).length} 种对比</i></div>`;
      b.querySelector('small').textContent = c.group_zh; b.querySelector('span').textContent = c.title;
      b.addEventListener('click', () => { select(i); $('.stage').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      grid.appendChild(b);
    }
    $('#gcount').textContent = `${shown.length} 条`;
    if (cur >= 0) $('#count').textContent = `${shown.indexOf(cur) + 1 || '–'} / ${shown.length}`;
  };
  const chips = () => {
    filters.innerHTML = '';
    const C = CATS.find(x => x.id === cat) || { groups: [] };
    const mk = (label, g) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(g === group));
      b.addEventListener('click', () => { group = g; chips(); render(); });
      filters.appendChild(b);
    };
    mk(`全部 ${cases.filter(c => c.cat === cat).length}`, '');
    if (C.groups.length > 1) C.groups.forEach(([g, zh]) => mk(`${zh} ${cases.filter(c => c.cat === cat && c.group === g).length}`, g));
  };
  const setCat = (id, g, pickFirst = true) => {
    cat = id; group = g || '';
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.cat === id)));
    const C = CATS.find(x => x.id === id) || {};
    $('#catdesc').textContent = C.desc || '';
    $('#notes').innerHTML = C.notes_html || '';
    chips(); render();
    if (pickFirst && shown.length) select(shown[0]);
  };

  zooms.forEach(b => b.addEventListener('click', () => {
    zoom = +b.dataset.z; zooms.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    ztag.textContent = zoom > 1 ? `${zoom}× 放大 · 双击改变中心` : '原图 · 双击后可放大查看';
  }));
  $('#prev').addEventListener('click', () => step(-1));
  $('#next').addEventListener('click', () => step(1));
  $('#play').addEventListener('click', () => { if (v.paused) play(); else v.pause(); });
  $('#full').addEventListener('click', () => { const s = $('.stage'); if (document.fullscreenElement) document.exitFullscreen(); else if (s.requestFullscreen) s.requestFullscreen(); });
  const pos = e => { const r = box.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  let drag = false;
  box.addEventListener('pointerdown', e => { drag = true; box.setPointerCapture(e.pointerId); split = Math.min(1, Math.max(0, pos(e)[0])); touched = true; });
  box.addEventListener('pointermove', e => { if (drag) split = Math.min(1, Math.max(0, pos(e)[0])); });
  box.addEventListener('pointerup', () => { drag = false; });
  box.addEventListener('pointercancel', () => { drag = false; });
  box.addEventListener('dblclick', e => {
    const [px, py] = pos(e);
    const sw = 1 / zoom, x0 = Math.min(1 - sw, Math.max(0, fx - sw / 2)), y0 = Math.min(1 - sw, Math.max(0, fy - sw / 2));
    fx = x0 + px * sw; fy = y0 + py * sw;
    if (zoom === 1) zooms.find(b => b.dataset.z === '2').click();
  });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { touched = true; split = Math.min(1, Math.max(0, split + (e.key === 'ArrowLeft' ? -.04 : .04))); e.preventDefault(); }
    if (e.key === '[') step(-1);
    if (e.key === ']') step(1);
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); $('#play').click(); }
  });

  Promise.all([fetch(DATA + 'cases.json', { cache: 'no-cache' }).then(r => r.json()),
               fetch(DATA + 'meta.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))]).then(([list, meta]) => {
    cases = list; BTN = meta.buttons || {}; CATS = meta.cats || [];
    if (meta.summary_html) $('#summary').innerHTML = meta.summary_html;
    tabs.innerHTML = '';
    for (const C of CATS) {
      const n = cases.filter(c => c.cat === C.id).length; if (!n) continue;
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.cat = C.id;
      b.innerHTML = '<span></span><b></b>'; b.querySelector('span').textContent = C.zh; b.querySelector('b').textContent = `${n} 条`;
      b.addEventListener('click', () => setCat(C.id, ''));
      tabs.appendChild(b);
    }
    const h = decodeURIComponent(location.hash.slice(1)), k = cases.findIndex(c => c.id === h);
    if (k >= 0) { setCat(cases[k].cat, '', false); select(k); } else setCat((CATS[0] || {}).id || '', '');
    requestAnimationFrame(loop);
  });
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (!visible) v.pause(); else play(); })).observe(box);
})();
