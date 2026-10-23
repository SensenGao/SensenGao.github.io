// SoL-Engine blog behaviour: navigation state, teaser scroll, demo, synchronized comparisons,
// the resolution ladder, chart grow-in and bar tooltips. No dependencies.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // Highlight the nav link of the section in view.
  const links = [...document.querySelectorAll('nav a')];
  const targets = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-20% 0px -70% 0px' });
    targets.forEach(t => io.observe(t));
  }

  // Teaser card recedes as the article scrolls in.
  const card = document.querySelector('.teaser-card'), cue = document.querySelector('.intro-cue'), copy = document.querySelector('.hero-split .hero-copy');
  if (card) {
    const mq = matchMedia('(max-width:720px),(prefers-reduced-motion:reduce)'); let raf = 0;
    const apply = () => {
      raf = 0;
      if (mq.matches) { for (const el of [card, cue, copy]) if (el) el.style.transform = el.style.opacity = ''; return; }
      const h = card.offsetHeight || 1, p = Math.min(1, Math.max(0, scrollY / (h * .8))), e = p * p * (3 - 2 * p);
      card.style.transform = `scale(${1 - e * .08})`; card.style.opacity = String(1 - e * .55);
      if (cue) cue.style.opacity = String(Math.max(0, 1 - p * 3));
      if (copy) copy.style.opacity = String(.35 + .65 * Math.min(1, p * 1.6));
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(apply); };
    addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); mq.addEventListener?.('change', req); apply();
  }

  const play = v => { const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}); }); };

  // Demo film: "Watch the demo" scrolls to it and plays; it plays muted while in view.
  const demo = document.querySelector('#demo video');
  if (demo) {
    document.querySelector('[data-play-demo]')?.addEventListener('click', e => {
      e.preventDefault();
      const r = demo.getBoundingClientRect();
      scrollTo({ top: scrollY + r.top - Math.max(16, (innerHeight - r.height) / 2), behavior: reduce.matches ? 'auto' : 'smooth' });
      history.replaceState(null, '', '#demo'); play(demo);
    });
    const fig = demo.closest('.demo-media'), btn = document.createElement('button');
    if (demo.hasAttribute('data-silent')) btn.style.display = 'none';
    btn.type = 'button'; btn.className = 'demo-unmute'; btn.textContent = 'Tap for sound'; btn.hidden = !demo.muted;
    fig.style.position = 'relative'; fig.appendChild(btn);
    btn.addEventListener('click', () => { demo.muted = false; play(demo); btn.hidden = true; });
    demo.addEventListener('volumechange', () => { btn.hidden = !demo.muted; });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => {
      if (reduce.matches) return;
      if (e.isIntersecting) { if (demo.paused) play(demo); } else if (!demo.paused) demo.pause();
    }), { threshold: .5 }).observe(demo);
  }

  // Posters load when a video comes near the viewport.
  const vids = [...document.querySelectorAll('video[data-poster]')];
  const setPoster = v => { if (!v.getAttribute('poster')) v.poster = v.dataset.poster; };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { setPoster(e.target); io.unobserve(e.target); } }), { rootMargin: '600px 0px' });
    vids.forEach(v => io.observe(v));
  } else vids.forEach(setPoster);

  // Only one comparison or gallery clip plays at a time.
  const groups = new Set();
  const soloStop = except => groups.forEach(g => { if (g !== except) g.stop(); });
  document.querySelectorAll('.gallery video').forEach(v => {
    const g = { stop: () => { if (!v.paused) v.pause(); } };
    groups.add(g); v.addEventListener('play', () => soloStop(g));
  });

  const ready = v => new Promise(r => {
    if (v.readyState >= 3) return r();
    v.addEventListener('canplay', () => r(), { once: true });
    v.preload = 'auto'; if (v.networkState === 0 || v.readyState === 0) v.load();
  });
  const fmt = (t, d) => `${t.toFixed(2)} / ${d.toFixed(2)} s`;

  // Fetch a clip completely before it plays. Streaming several 2K files at once stalls on ordinary connections, and a
  // stalled lead makes synchronized panes jump; from memory they play smoothly and in step. Falls back to streaming.
  const fetchClip = (v, onBytes) => v._loaded ||= (async () => {
    const url = v.querySelector('source')?.src || v.src;
    try {
      const r = await fetch(url);
      if (!r.ok || !r.body) throw new Error(String(r.status));
      const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = [];
      let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onBytes(got, total); }
      v.src = URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
    } catch (e) { onBytes(1, 1); }
    await ready(v);
  })();
  const progress = (vs, show) => {
    const seen = new Map();
    return v => (got, total) => {
      seen.set(v, [got, total || got]);
      let a = 0, b = 0; for (const [g, t] of seen.values()) { a += g; b += t; }
      show(Math.min(99, Math.round(a / Math.max(b, 1) * 100 * seen.size / vs.length)));
    };
  };

  // Detail zoom follows the pointer: the same relative point in every pane.
  const zoomable = (fig, area) => {
    const z = fig.querySelector('.sync-zoom'); if (!z) return;
    z.addEventListener('click', () => { const on = !fig.classList.contains('is-zoomed'); fig.classList.toggle('is-zoomed', on); z.setAttribute('aria-pressed', String(on)); });
    area.addEventListener('pointermove', e => {
      if (!fig.classList.contains('is-zoomed')) return;
      const pane = e.target.closest('.pane,.ladder-stage'); if (!pane) return;
      const r = pane.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)), y = Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100));
      fig.style.setProperty('--fx', x.toFixed(1) + '%'); fig.style.setProperty('--fy', y.toFixed(1) + '%');
    });
  };

  // Synchronized figures: the lead video drives the others.
  document.querySelectorAll('[data-sync]').forEach(fig => {
    const vs = [...fig.querySelectorAll('video')], lead = fig.querySelector('video[data-lead]') || vs[0], fol = vs.filter(v => v !== lead);
    const btn = fig.querySelector('.sync-play'), seek = fig.querySelector('.sync-seek'), time = fig.querySelector('.sync-time');
    const dur = parseFloat(fig.dataset.duration); let on = false, raf = 0, primed = null, rate = 1, loading = false;
    const ui = () => { const t = Math.min(lead.currentTime, dur); time.textContent = loading ? time.textContent : fmt(t, dur); seek.value = String(Math.round(t / dur * 1000)); btn.textContent = on ? 'Pause' : 'Play'; btn.setAttribute('aria-pressed', String(on)); };
    const tick = () => {
      raf = 0; if (!on) return;
      const t = lead.currentTime;
      if (lead.readyState >= 3) for (const f of fol) { if (f.seeking || f.readyState < 3) continue; if (Math.abs(f.currentTime - t) > .1) f.currentTime = t; if (f.paused) f.play().catch(() => {}); }
      ui(); raf = requestAnimationFrame(tick);
    };
    const g = {
      stop() { on = false; vs.forEach(v => v.pause()); ui(); },
      async start() {
        soloStop(g); on = true; ui();
        if (!primed) {
          loading = true; time.textContent = 'Loading 0%';
          const track = progress(vs, pct => { if (loading) time.textContent = `Loading ${pct}%`; });
          primed = Promise.all(vs.map(v => fetchClip(v, track(v))));
        }
        await primed; loading = false; if (!on) { ui(); return; }
        const t = lead.currentTime; fol.forEach(f => { f.currentTime = t; }); vs.forEach(v => { v.playbackRate = rate; v.loop = true; });
        await Promise.all(vs.map(v => v.play().catch(() => {}))); if (!raf) raf = requestAnimationFrame(tick);
      },
    };
    groups.add(g);
    btn.addEventListener('click', () => on ? g.stop() : g.start());
    lead.addEventListener('pause', () => { if (on && !lead.ended) g.stop(); });
    lead.addEventListener('seeked', ui);
    seek.addEventListener('input', () => { const t = seek.value / 1000 * dur; vs.forEach(v => { v.currentTime = t; }); ui(); });
    fig.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => {
      rate = parseFloat(b.dataset.rate); vs.forEach(v => { v.playbackRate = rate; });
      fig.querySelectorAll('[data-rate]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    }));
    zoomable(fig, fig);
    ui();
  });

  // Resolution ladder: only the selected tier decodes; switching keeps the playback time.
  document.querySelectorAll('.ladder').forEach(fig => {
    const tiers = [...fig.querySelectorAll('.tier')], tabs = [...fig.querySelectorAll('[role=tab]')];
    const btn = fig.querySelector('.sync-play'), seek = fig.querySelector('.sync-seek'), time = fig.querySelector('.sync-time');
    const dur = parseFloat(fig.dataset.duration); let on = false, raf = 0;
    let cur = tiers.find(t => t.classList.contains('is-active')).querySelector('video');
    const ui = () => { const t = Math.min(cur.currentTime, dur); time.textContent = fmt(t, dur); seek.value = String(Math.round(t / dur * 1000)); btn.textContent = on ? 'Pause' : 'Play'; btn.setAttribute('aria-pressed', String(on)); };
    const tick = () => { raf = 0; if (!on) return; ui(); raf = requestAnimationFrame(tick); };
    const g = {
      stop() { on = false; cur.pause(); ui(); },
      async start() { soloStop(g); on = true; ui(); cur.loop = true; await load(cur); if (!on) return; await cur.play().catch(() => {}); if (!raf) raf = requestAnimationFrame(tick); },
    };
    groups.add(g);
    const select = async key => {
      const next = tiers.find(t => t.dataset.tier === key); if (!next) return;
      const v = next.querySelector('video'); if (v === cur) return;
      const t = cur.currentTime, was = on;
      tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tier === key)));
      if (!v.getAttribute('poster') && v.dataset.poster) v.poster = v.dataset.poster;
      await load(v); v.currentTime = t; v.loop = true;
      if (was) { v.playbackRate = cur.playbackRate; await v.play().catch(() => {}); }
      tiers.forEach(x => x.classList.toggle('is-active', x === next));
      const old = cur; cur = v; old.pause(); ui();
    };
    const stage = fig.querySelector('.ladder-stage');
    async function load(v) {
      const label = v.closest('.tier').dataset.tier.toUpperCase();
      fig.classList.add('is-loading'); stage.dataset.loading = `Loading ${label}…`;
      await fetchClip(v, (got, total) => { stage.dataset.loading = `Loading ${label} ${total ? Math.round(got / total * 100) : 0}%`; });
      fig.classList.remove('is-loading');
    }
    tabs.forEach(b => b.addEventListener('click', () => select(b.dataset.tier)));
    btn.addEventListener('click', () => on ? g.stop() : g.start());
    seek.addEventListener('input', () => { cur.currentTime = seek.value / 1000 * dur; ui(); });
    tiers.forEach(t => t.querySelector('video').addEventListener('seeked', ui));
    zoomable(fig, fig.querySelector('.ladder-stage'));
    ui();
  });

  // Charts grow in once when they scroll into view.
  const charts = [...document.querySelectorAll('.gfig,.hchart')];
  if (!reduce.matches && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-anim');
    charts.forEach(c => c.classList.add('chart-pending'));
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.remove('chart-pending'); io.unobserve(e.target); } }), { threshold: .35 });
    charts.forEach(c => io.observe(c));
  }

  // Bar tooltips (values are also printed beside every bar).
  const tip = document.querySelector('.tip');
  if (tip) {
    document.querySelectorAll('[data-tip]').forEach(el => {
      el.addEventListener('pointermove', e => {
        tip.textContent = el.dataset.tip; tip.hidden = false;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = Math.min(innerWidth - w - 10, Math.max(10, e.clientX + 14)) + 'px';
        let top = e.clientY + 16; if (top + h > innerHeight - 8) top = e.clientY - h - 12;
        tip.style.top = Math.max(8, top) + 'px';
      });
      el.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
  }
  window.blogReady = true;
})();
