// 20 SANA 768P drafts refined to 2K by SANA-Refiner (SANA-IC step 10000) and Open-H3-IC (release step 6000, up3 + Sharp 1.0).
// Media from window.MEDIA_BASE (HF on the public page), cases.json from window.DATA_BASE; both default to media/.
// One vertically stacked video per case and mode (top = left side, bottom = right side),
// split on a native-2K canvas so both sides stay frame-locked. Idle sweep until dragged; 1x/2x/4x zoom around a
// double-clicked focus point; style filters and a thumbnail grid.
(() => {
  const W = 2560, H = 1440;
  const MEDIA = window.MEDIA_BASE || 'media/', DATA = window.DATA_BASE || 'media/';
  const IN = 'SANA 768P 输入（双三次放大）';
  const NAME = { h3: 'Open-H3-IC · 2K', s10k: 'SANA-Refiner 10000 步 · 2K' };
  const ORDER = ['s10k_h3', 'in_s10k', 'in_h3'];
  const BTN = { s10k_h3: 'SANA-Refiner ⟷ Open-H3-IC', in_s10k: 'SANA ⟷ SANA-Refiner', in_h3: 'SANA ⟷ Open-H3-IC' };
  const MODES = {};
  const buildModes = () => ORDER.forEach(m => {
    const [a, b] = m.split('_').map(k => k === 'in' ? 'src' : k);
    MODES[m] = [a === 'src' ? IN : NAME[a], NAME[b]];
  });
  buildModes();
  const $ = s => document.querySelector(s);
  const box = $('#wipe'), v = box.querySelector('video'), cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
  const handle = box.querySelector('.handle'), bl = $('#badge-l'), br = $('#badge-r'), ztag = $('#zoomtag');
  let segs = []; const zooms = [...document.querySelectorAll('#zooms button')];
  const grid = $('#grid'), filters = $('#filters');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  cv.width = W; cv.height = H;
  let cases = [], shown = [], cur = -1, mode = 's10k_h3', split = .5, touched = false, t0 = performance.now();
  let poster = null, visible = true, zoom = 1, fx = .5, fy = .5;

  const draw = () => {
    if (!touched && !reduce.matches) split = .5 + .32 * Math.sin((performance.now() - t0) / 1600);
    handle.style.left = (split * 100) + '%';
    box.setAttribute('aria-valuenow', String(Math.round(split * 100)));
    const src = v.readyState >= 2 && v.videoWidth ? v : (poster && poster.complete && poster.naturalWidth ? poster : null);
    if (!src) return;
    const sw = W / zoom, sh = H / zoom;
    const sx0 = Math.min(W - sw, Math.max(0, fx * W - sw / 2)), sy0 = Math.min(H - sh, Math.max(0, fy * H - sh / 2));
    const cut = split * W;                       // canvas x of the split
    const srcCut = sx0 + cut / zoom;             // matching source x
    if (cut > 0) ctx.drawImage(src, sx0, sy0, srcCut - sx0, sh, 0, 0, cut, H);
    if (cut < W) ctx.drawImage(src, srcCut, H + sy0, sx0 + sw - srcCut, sh, cut, 0, W - cut, H);
  };
  const loop = () => { if (visible) draw(); requestAnimationFrame(loop); };
  const play = () => { if (reduce.matches) return; const p = v.play(); if (p && p.catch) p.catch(() => {}); };

  const setMode = m => {
    const c = cases[cur]; if (!c || !c.modes[m]) return;
    mode = m;
    segs.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    [bl.textContent, br.textContent] = MODES[m];
    const t = v.currentTime || 0;
    v.src = MEDIA + c.modes[m]; v.load(); play();
    v.addEventListener('loadeddata', () => { try { v.currentTime = t; } catch (e) {} play(); }, { once: true });
  };
  const select = i => {
    if (i < 0 || i >= cases.length) return;
    cur = i;
    const c = cases[i];
    segs.forEach(b => { b.disabled = !c.modes[b.dataset.mode]; });
    if (!c.modes[mode]) mode = ORDER.find(m => c.modes[m]);
    $('#title').textContent = c.title;
    $('#style').textContent = c.style || '';
    $('#caption').textContent = c.caption || '';
    $('#count').textContent = `${shown.indexOf(i) + 1 || '–'} / ${shown.length}`;
    poster = new Image(); poster.src = MEDIA + c.poster;
    touched = false; t0 = performance.now(); split = .5;
    v.removeAttribute('src');
    setMode(mode);
    grid.querySelectorAll('.card').forEach(el => el.setAttribute('aria-current', String(+el.dataset.i === i)));
    try { history.replaceState(null, '', '#' + c.id); } catch (e) {}
  };
  const step = d => { const k = shown.indexOf(cur); const n = shown[(Math.max(k, 0) + d + shown.length) % shown.length]; select(n); };

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

  const render = style => {
    shown = cases.map((c, i) => i).filter(i => !style || cases[i].style === style);
    grid.innerHTML = '';
    for (const i of shown) {
      const c = cases[i], b = document.createElement('button');
      b.className = 'card'; b.type = 'button'; b.dataset.i = i; b.setAttribute('aria-current', String(i === cur));
      const tags = ['s10k', 'h3'].filter(k => c.modes['in_' + k]).map(k => ({ s10k: 'SANA-R', h3: 'H3-IC' })[k]);
      b.innerHTML = `<img loading="lazy" alt="" src="${MEDIA}${c.thumb}"><div class="t"><small></small><span></span></div><div class="m">${tags.map(t => `<i>${t}</i>`).join('')}</div>`;
      b.querySelector('small').textContent = c.style; b.querySelector('span').textContent = c.title;
      b.addEventListener('click', () => { select(i); $('.stage').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      grid.appendChild(b);
    }
    $('#gcount').textContent = `${shown.length} 条`;
    if (cur >= 0) $('#count').textContent = `${shown.indexOf(cur) + 1 || '–'} / ${shown.length}`;
  };

  Promise.all([fetch(DATA + 'cases.json', { cache: 'no-cache' }).then(r => r.json()), Promise.resolve({})]).then(([list, meta]) => {
    cases = list;
    const bar = $('#modes'); bar.innerHTML = '';
    segs = ORDER.filter(m => cases.some(c => c.modes[m])).map(m => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.mode = m; b.textContent = BTN[m];
      b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => setMode(m)); bar.appendChild(b); return b;
    });
    if (meta.sol_step) {
      for (const k of ['sol', 'sol070', 'sol060']) NAME[k] = NAME[k].replace('SOL Refiner', `SOL 第 ${meta.sol_step} 步`);
      buildModes();
      $('#sol-step').textContent = meta.sol_step >= 5000 ? '第 5000 步' : `第 ${meta.sol_step} 步（训练至 5000 中）`;
    }
    if (mode && cur >= 0) [bl.textContent, br.textContent] = MODES[mode];
    const n = m => cases.filter(c => c.modes[m]).length;
    $('#n-all').textContent = cases.length;
    const styles = [...new Set(cases.map(c => c.style))].filter(Boolean);
    const counts = Object.fromEntries(styles.map(s => [s, cases.filter(c => c.style === s).length]));
    // groups stay in spec order: clips with both outputs first
    const mk = (label, style) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-pressed', String(!style));
      b.addEventListener('click', () => { filters.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(style); });
      filters.appendChild(b);
    };
    mk(`全部 ${cases.length}`, ''); styles.slice(0, 7).forEach(s => mk(`${s} ${counts[s]}`, s));
    render('');
    const h = decodeURIComponent(location.hash.slice(1)), k = cases.findIndex(c => c.id === h);
    select(k >= 0 ? k : 0);
    requestAnimationFrame(loop);
  });
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; if (!visible) v.pause(); else play(); })).observe(box);
})();
