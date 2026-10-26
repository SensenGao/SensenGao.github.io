// Dev-only track viewer: ?track=harbor&variant=night&ts=0,0.1,...&w=640&h=360&cols=3&overview=1&quality=medium
import * as THREE from 'three';
import { createTrack } from '../src/track.js';
import { loadGroup, loadManifest } from '../src/assets.js';
import { TIME } from '../src/toon.js';
import { registerRacerGLB, createRacerModel } from '../src/racers.js';
import { getAsset } from '../src/assets.js';

const q = new URLSearchParams(location.search);
const trackId = q.get('track') || 'harbor';
const ts = (q.get('ts') || '0,0.08,0.17,0.3,0.42,0.55,0.68,0.8,0.9').split(',').map(Number);
const W = +(q.get('w') || 480), H = +(q.get('h') || 270), cols = +(q.get('cols') || 3);
const overview = q.get('overview') !== '0';
const camH = +(q.get('camh') || 4.2), camB = +(q.get('camb') || 9), camL = +(q.get('caml') || 0);
const n = ts.length + (overview ? 1 : 0);
const rows = Math.ceil(n / cols);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W * cols, H * rows);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);
renderer.info.autoReset = false;
window.__done = false;
(async () => {
  const def = (await import(`../src/tracks/${trackId}.js`)).default;
  await loadManifest();
  const m = await loadManifest();
  await loadGroup([...(m.groups['track:' + trackId] || []), ...(m.groups.core || []).filter((p) => !p.endsWith('.glb')), 'models/racers/fennix.glb']);
  const scene = new THREE.Scene();
  const t0 = performance.now();
  const track = createTrack(scene, renderer, def, { quality: { shadows: true, outlines: true, shadowMap: 2048 }, variant: q.get('variant') });
  console.log('track length', Math.round(track.length));
  const buildMs = performance.now() - t0;
  // a few karts on the grid for scale
  try {
    await registerRacerGLB('fennix', getAsset('models/racers/fennix.glb'));
    for (let k = 0; k < 4; k++) {
      const mdl = createRacerModel({ id: 'fennix' });
      const sp = track.startPositions[k];
      mdl.root.position.copy(sp.position); mdl.root.rotation.y = sp.heading; scene.add(mdl.root);
    }
  } catch (e) { console.warn('no kart', e.message); }
  const cam = new THREE.PerspectiveCamera(62, W / H, 0.1, 3000);
  TIME.value = 3;
  track.update(0.016, 3);
  let k = 0;
  const stats = [];
  for (const t of ts) {
    const p = track.getPointAt(t), tan = track.getTangentAt(t);
    cam.position.set(p.x - tan.x * camB + tan.z * camL, p.y + camH, p.z - tan.z * camB - tan.x * camL);
    cam.lookAt(p.x + tan.x * 6, p.y + 1.3, p.z + tan.z * 6);
    track.setShadowFocus(p);
    const x = (k % cols) * W, y = (rows - 1 - Math.floor(k / cols)) * H;
    renderer.setViewport(x, y, W, H); renderer.setScissor(x, y, W, H);
    renderer.info.reset();
    renderer.render(scene, cam);
    stats.push({ t, calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
    k++;
  }
  if (overview) {
    const b = track.minimap.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    cam.position.set(cx + span * 0.35, span * 0.75, cz + span * 0.75); cam.lookAt(cx, 0, cz);
    track.setShadowFocus(new THREE.Vector3(cx, 0, cz));
    const x = (k % cols) * W, y = (rows - 1 - Math.floor(k / cols)) * H;
    renderer.setViewport(x, y, W, H); renderer.setScissor(x, y, W, H);
    renderer.render(scene, cam);
  }
  const heavy = [];
  scene.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; const tri = (g.index ? g.index.count : g.attributes.position.count) / 3; const cnt = o.isInstancedMesh ? o.count : 1; heavy.push([o.name || o.type, Math.round(tri * cnt), cnt]); } });
  heavy.sort((a, b) => b[1] - a[1]);
  window.__stats = { heavy: heavy.slice(0, 15), buildMs: Math.round(buildMs), views: stats, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  window.__done = true;
})().catch((e) => { console.error(e); window.__err = String(e.stack || e); window.__done = true; });
