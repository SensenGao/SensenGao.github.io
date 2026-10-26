// Sunset Canyon — red-rock desert canyon at sunset. A packed red-dirt road leaves the critter grandstands, sweeps
// round a long bend between striped mesas, crosses a wooden trestle over a creek gorge, climbs under a natural rock
// arch, drops through two switchback hairpins between mesas, launches over a dry-wash gap and runs a narrow canyon
// where boulders roll down a scree slope across the road. Hot-air balloons drift overhead, tumbleweeds roll by.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as E from '../envkit.js';
import { toonMaterial, outlineMaterial, computeOutlineNormals } from '../toon.js';
import { texClone } from '../assets.js';

const S = 1.15;          // layout scale (world = points * S)
const HW = 11.5;         // road half width
const GORGE_FLOOR = -15; // creek gorge bed under the trestle
const CREEK = -13.4;     // creek water level
const ROCK_T = 30; 
const CROWD = [0xf0b46a, 0x8a5a3c, 0xaab4bf, 0xffa6c9, 0xfbfbf7, 0x5a5a66, 0xd98a4e, 0xe9c46a, 0xc9a0dc, 0x9fb3e6];      // metres per strata texture tile on cliffs
const CAP_UV = [0.19, 0.574]; // a flat light-sandstone texel of the strata texture (used for mesa tops)

// palette (PROGRESS.md: Sunset Canyon)
const C = {
  rock: 0xc4502e, rockLight: 0xe07a3f, rockDark: 0x8c3a2b, sand: 0xebb26a, sage: 0x6b9a5b, timber: 0x7a4a2a,
  cream: 0xfff4dc, berry: 0xe2366f, teal: 0x19b5a5, gold: 0xffd23f, orange: 0xff8a1e, purple: 0x5b3c9e, ink: 0x2b1d2e,
};

export default {
  id: 'canyon',
  name: 'Sunset Canyon',
  nameZh: '夕阳峡谷',
  music: 'canyon',
  scale: S,
  halfWidth: HW,
  runoff: 6.5,
  points: [
    [0, 3, 0], [130, 3, 0], [230, 4, 15], [310, 6, 70], [345, 9, 150], [350, 11, 230], [335, 13, 300], [280, 15, 345],
    [200, 16, 360], [130, 16, 360], [90, 15.5, 360], [38, 14.5, 352], [28, 13, 312], [50, 11.5, 290], [100, 10, 288],
    [170, 9, 290], [205, 8.5, 282], [222, 8, 250], [200, 7.5, 222], [150, 7, 220], [60, 6, 220], [0, 5, 195],
    [-45, 4, 150], [-60, 3.5, 95], [-55, 3, 45], [-35, 3, 10],
  ],
  bridges: [{ from: 4.14, to: 5.02 }, { from: 19.22, to: 19.5 }],
  boostPads: [{ at: 0.55, lats: ['race', 'race'] }, { at: 3.5, lats: [-5, 5], stagger: false }, { at: 13.5, lats: [-6, 0, 6] }],
  ramps: [{ at: 19.06, hw: 10.5, h: 1.9 }],
  itemRows: [1.3, 6.5, 9.3, 14.6, 18.5, 21.35],
  zones: [{ type: 'deck', from: 4.14, to: 5.02, lat: 0, hw: HW }, { type: 'deck', from: 19.22, to: 19.5, lat: 0, hw: HW }],
  pierBottom: GORGE_FLOOR,
  style: {
    roadTex: 'textures/common/road_canyon.webp', roadTint: 0xffffff, roadAlongScale: 24,
    offroadTex: 'textures/common/sand.webp', offroadTint: 0xd9905c, offroadScale: 8,
    deckTex: 'textures/common/wood_planks.webp', deckTint: 0xf2d6b8,
    wallTex: 'textures/common/wood_planks.webp', wallTint: 0xffe4c8, wallTexLen: 5, wallTop: 0x8a5a3c,
    railTex: 'textures/common/wood_planks.webp', railTint: 0xffe4c8, pierSpan: 1e6,
    curbA: '#e2366f', curbB: '#fff4dc', boostA: '#19b5a5', boostB: '#7ff5e6', rampA: '#ff8a1e', rampB: '#fff4dc', rampSide: 0x7a4a2a,
    gantryA: '#fff4dc', gantryB: '#c4502e',
    tires: false,
    lineColor: 0xfff4dc, dashColor: 0xfff4dc, dashAlpha: 0.55,
    zones: {
      deck: { tex: 'textures/common/wood_planks.webp', scale: 3, color: 0xffeedd },
    },
  },
  buildEnvironment,
};

// ------------------------------------------------------------------------------------------------ geometry helpers
/** Box with world-scaled UVs (T metres per texture tile); the long side runs along the texture's u axis. */
function woodBox(w, h, d, T = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; const u = uv.getX(i) * dims[f][0] / T, v = uv.getY(i) * dims[f][1] / T;
    if (f !== 2 && f !== 3 && dims[f][1] > dims[f][0]) uv.setXY(i, v, u); else uv.setXY(i, u, v);
  }
  return g;
}
const _up = new THREE.Vector3(0, 1, 0);
/** Wooden beam (box) from a to b. */
function beam(a, b, t, T = 3) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const g = woodBox(t, len, t, T);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
/** Painted cylinder from a to b. */
function rod(a, b, r, color, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return E.paint(g, color);
}
/** Indexed grid geometry from rows of vertices (rows x cols), with uv + colour. Ensures outward winding via `outward`. */
function gridGeometry(pos, uv, col, rows, cols, outward) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const idx = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  if (outward) {
    // flip winding if the normals point inwards
    let s = 0; const n = g.attributes.normal, p = g.attributes.position;
    for (let k = 0; k < p.count; k += 7) { const o = outward(k); s += n.getX(k) * o[0] + n.getY(k) * o[1] + n.getZ(k) * o[2]; }
    if (s < 0) {
      for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
      g.setIndex(idx); g.computeVertexNormals();
    }
  }
  return g;
}

// ================================================================================================== environment
function buildEnvironment(ctx) {
  const { L, root, keep, quality, hazards } = ctx;
  const rnd = E.mulberry(7311);
  const updaters = [];
  const ink = ctx.inkMat;
  const shadows = quality.shadows !== false, outlines = quality.outlines !== false;
  const N = L.N;
  const wrapI = (i) => ((i % N) + N) % N;
  const CX = (L.bounds.minX + L.bounds.maxX) / 2, CZ = (L.bounds.minZ + L.bounds.maxZ) / 2;

  // ------------------------------------------------------------------ sky, low sun, fog
  const sunDir = new THREE.Vector3(-0.82, 0.4, 0.4).normalize();
  E.createSky(ctx, {
    top: 0x4a2f8c, horizon: 0xffa95a, bottom: 0xf09a5c, sunDir, sunColor: 0xfff0b8, sunSize: 3.2,
    clouds: 'textures/sky/clouds_sunset.webp', cloudLow: -0.03, cloudHigh: 0.3, cloudRepeat: 3,
  });
  const lights = E.setupLights(ctx, {
    sunDir, sunColor: 0xffe4c8, sunIntensity: 2.3, hemiSky: 0xb9a0e0, hemiGround: 0xa0604e, hemiIntensity: 1.65,
    fog: 0xf4a468, fogNear: 240, fogFar: 1250, rimColor: 0xffb877, rimStrength: 0.45,
  });

  // ------------------------------------------------------------------ key layout frames
  const frame = (i) => {
    i = wrapI(i);
    const hl = Math.hypot(L.tx[i], L.tz[i]) || 1;
    return { i, x: L.px[i], y: L.py[i], z: L.pz[i], tx: L.tx[i] / hl, tz: L.tz[i] / hl, rx: L.rx[i], rz: L.rz[i] };
  };
  const local = (f, x, z) => { const dx = x - f.x, dz = z - f.z; return { lat: dx * f.rx + dz * f.rz, along: dx * f.tx + dz * f.tz }; };
  const runs = [];
  { // bridge runs (trestle + dry-wash gap) from the layout's smoothed bridge mask
    let start = 0; while (L.bridge[start] >= 0.5) start++;
    let a = -1;
    for (let k = 1; k <= N; k++) { const i = (start + k) % N; const on = L.bridge[i] >= 0.5; if (on && a < 0) a = start + k; if (!on && a >= 0) { runs.push([a, start + k - 1]); a = -1; } }
  }
  runs.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
  const trestleRun = runs[0], gapRun = runs[1];
  const GF = frame(Math.round((trestleRun[0] + trestleRun[1]) / 2)); // gorge crossing
  const WF = frame(Math.round((gapRun[0] + gapRun[1]) / 2));         // dry-wash gap
  const washFloor = WF.y - 9;
  const BF = frame(L.atCP(22.25));                                    // boulder canyon

  // gorge: runs across the trestle, meanders out east to the horizon, dead-ends in a box canyon on the infield side
  function gorge(x, z) {
    const q = local(GF, x, z); const u = -q.lat;
    const mean = Math.sin(u * 0.011 + 0.6) * 30 * E.smoothstep(45, 160, Math.abs(u));
    const widen = 1 + 0.6 * E.smoothstep(150, 500, u);
    return { d: Math.abs(q.along - mean) / widen, end: E.smoothstep(-80, -52, u), u };
  }
  const gorgeF = (x, z) => { const g = gorge(x, z); return E.smoothstep(27, 15, g.d) * g.end; };
  function washD(x, z) { const q = local(WF, x, z); return Math.abs(q.lat) < 95 ? Math.abs(q.along) : 1e9; }
  const washF = (x, z) => { const q = local(WF, x, z); return E.smoothstep(15, 7, Math.abs(q.along)) * E.smoothstep(95, 65, Math.abs(q.lat)); };
  // scree slope west of the boulder canyon
  const hill = (x, z) => { const q = local(BF, x, z); return 26 * E.smoothstep(-26, -80, q.lat) * E.smoothstep(130, 70, Math.abs(q.along)); };

  function base(x, z) {
    let h = 3 + 13 * E.smoothstep(-20, 480, z) + 4 * (E.fbm(x * 0.007, z * 0.007, 3) - 0.5);
    const r = Math.hypot(x - CX, z - CZ);
    h += 60 * E.smoothstep(430, 800, r) * (0.55 + 0.45 * E.fbm(x * 0.004 + 9, z * 0.004 - 3, 3));
    h += hill(x, z);
    return h;
  }
  function natural(x, z) {
    let h = base(x, z);
    const g = gorgeF(x, z);
    if (g > 0) h = E.lerp(h, GORGE_FLOOR + 2.2 * E.fbm(x * 0.05, z * 0.05, 2), g);
    const w = washF(x, z);
    if (w > 0) h = E.lerp(h, Math.min(h, washFloor), w);
    return h;
  }

  // ------------------------------------------------------------------ terrain + creek
  const sandTint = new THREE.Color(0xd9905c);
  const terrain = E.buildTerrain(ctx, {
    size: 1700, seg: 170, center: [CX, CZ], natural, corridorMargin: 3,
    tex: ['textures/common/sand.webp', 'textures/common/rock_canyon.webp', 'textures/common/road_canyon.webp'], scale: [8, 26, 16],
    weights: (x, y, z, slope, near) => {
      const rock = Math.min(1, E.smoothstep(0.16, 0.36, slope) + gorgeF(x, z) * 0.6);
      const dirt = (1 - near) * E.smoothstep(0.5, 0.68, E.fbm(x * 0.01 + 4, z * 0.01, 3)) * 0.85;
      return [(1 - rock) * (1 - dirt), rock, (1 - rock) * dirt];
    },
    tint: (x, y, z, slope, near) => {
      const c = sandTint.clone();
      c.lerp(new THREE.Color(0xc87650), (1 - near) * E.fbm(x * 0.012 + 2, z * 0.012, 2) * 0.8);
      return c;
    },
  });
  const heightAt = terrain.heightAt;
  E.buildWater(ctx, {
    level: CREEK, center: [CX, CZ], size: 1700, depthSpan: 1700, depthScale: 4,
    depthAt: (x, z) => CREEK - natural(x, z),
    deep: 0x23707e, shallow: 0x3aa9a6, foam: 0xfff4dc, sunDir, sparkle: 0.8,
  });

  // ------------------------------------------------------------------ placement bookkeeping
  const spot = E.makeSpot(L);
  const circles = [];   // keep-out circles for mesas
  const capsules = [];  // keep-out capsules (rails, boulder lanes)
  const inCapsule = (x, z, c) => {
    const vx = c.bx - c.ax, vz = c.bz - c.az;
    const t = Math.min(1, Math.max(0, ((x - c.ax) * vx + (z - c.az) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(x - c.ax - vx * t, z - c.az - vz * t) < c.r;
  };
  const nearStart = (s) => s.i >= 0 && (s.i > N - 110 || s.i < 175) && s.d < 55;
  function blockedM(x, z, margin) {
    const s = spot(x, z, margin);
    if (!s.ok || nearStart(s)) return true;
    const g = gorge(x, z); if (g.end > 0.3 && g.d < 12.5) return true;
    if (washD(x, z) < 8.5) return true;
    for (const c of circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    for (const c of capsules) if (inCapsule(x, z, c)) return true;
    return false;
  }

  // ------------------------------------------------------------------ start-area layout (before mesas so they keep clear)
  const iTower = L.atCP(0.45);
  const towerP = E.frameAt(L, iTower, L.wallR[iTower] + 26);
  circles.push({ x: towerP.x, z: towerP.z, r: 14 });
  // mine-cart line: from beside the water tower into a mesa in the infield
  const mineA = E.frameAt(L, iTower, L.wallR[iTower] + 14);
  mineA.x -= L.tx[iTower] * 30; mineA.z -= L.tz[iTower] * 30;
  const mineDir = new THREE.Vector3(L.tx[iTower] * 0.55 + L.rx[iTower] * 0.83, 0, L.tz[iTower] * 0.55 + L.rz[iTower] * 0.83).normalize();
  const MINE_LEN = 120;
  const mineB = mineA.clone().addScaledVector(mineDir, MINE_LEN);
  capsules.push({ ax: mineA.x - mineDir.x * 10, az: mineA.z - mineDir.z * 10, bx: mineB.x - mineDir.x * 3, bz: mineB.z - mineDir.z * 3, r: 7 });

  // boulder lanes
  const lanes = [21.75, 22.3, 22.85].map((cp) => {
    const i = L.atCP(cp);
    const a = E.frameAt(L, i, -88), b = E.frameAt(L, i, 44);
    capsules.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: 8.5 });
    return { i };
  });

  // ------------------------------------------------------------------ mesas, buttes, canyon walls, arch (one merged rock mesh)
  const rockTex = texClone('textures/common/rock_canyon.webp'); if (rockTex) keep(rockTex);
  const rockMat = keep(toonMaterial({ map: rockTex, vertexColors: true }));
  const nearRock = [], farRock = [];
  const mesas = [];
  const tints = [0xffffff, 0xffe8d8, 0xffd2c0, 0xfff0e4, 0xe8bcb0, 0xffdcc8, 0xf2cad6, 0xffe6b8];
  const tmpC = new THREE.Color();

  function addTier(cx, cz, radii, f, y0, y1, tint, vOff, out, skirt = false, tT = ROCK_T) {
    const K = radii.length;
    const rings = skirt
      ? [[y0, 1.32], [y0 + 3 + (y1 - y0) * 0.12, 1.1], [y0 + 3 + (y1 - y0) * 0.22, 1.02], [E.lerp(y0, y1, 0.6), 0.99], [y1 - Math.min(1.4, (y1 - y0) * 0.2), 0.975], [y1, 0.92]]
      : [[y0, 1.03], [E.lerp(y0, y1, 0.55), 1.0], [y1 - Math.min(1.4, (y1 - y0) * 0.2), 0.985], [y1, 0.92]];
    const pos = [], uv = [], col = [];
    const seed = (cx * 13 + cz * 7) | 0;
    let ringNo = 0;
    for (const [y, rs] of rings) {
      ringNo++;
      let per = 0, px0 = 0, pz0 = 0;
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * Math.PI * 2, r = radii[k % K] * f * rs * (1 + 0.07 * (E.hash(k % K, ringNo * 7 + seed) - 0.5));
        const x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
        if (k > 0) per += Math.hypot(x - px0, z - pz0);
        px0 = x; pz0 = z;
        pos.push(x, y, z);
        uv.push(per / tT, y / tT + vOff);
        const sh = 0.72 + 0.28 * E.smoothstep(y0 + 2, y0 + (y1 - y0) * 0.7, y);
        tmpC.copy(tint).multiplyScalar(sh); col.push(tmpC.r, tmpC.g, tmpC.b);
      }
    }
    const sg = gridGeometry(pos, uv, col, rings.length, K + 1, (k) => { const x = pos[k * 3] - cx, z = pos[k * 3 + 2] - cz; return [x, 0, z]; });
    const flat = sg.toNonIndexed(); sg.dispose(); flat.computeVertexNormals();   // faceted, painterly rock
    out.push(flat);
    // cap (light sandstone band of the strata texture)
    const cp = [cx, y1 + 0.15, cz], cuv = [...CAP_UV], cc = [tint.r, tint.g, tint.b];
    for (let k = 0; k <= K; k++) {
      const th = (k / K) * Math.PI * 2, r = radii[k % K] * f * 0.92;
      const x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
      cp.push(x, y1, z); cuv.push(...CAP_UV); cc.push(tint.r, tint.g, tint.b);
    }
    const ci = [];
    for (let k = 1; k <= K; k++) ci.push(0, k + 1, k);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    cg.setIndex(ci); cg.computeVertexNormals();
    if (cg.attributes.normal.getY(1) < 0) { for (let k = 0; k < ci.length; k += 3) { const t = ci[k + 1]; ci[k + 1] = ci[k + 2]; ci[k + 2] = t; } cg.setIndex(ci); cg.computeVertexNormals(); }
    out.push(cg.toNonIndexed()); cg.dispose();
  }

  /** o = { x, z, R, H, tiers, asp, rot, K, margin, clip, far, top, minR } */
  function mesa(o) {
    const { x, z } = o;
    const K = o.K || 16;
    const margin = o.margin ?? 4;
    if (o.clip !== false && blockedM(x, z, margin)) return null;
    const radii = new Float32Array(K);
    const ph = rnd() * 6.28, ph2 = rnd() * 6.28, asp = o.asp || 1, rot = o.rot ?? rnd() * Math.PI;
    for (let k = 0; k < K; k++) {
      const th = (k / K) * Math.PI * 2;
      const c = Math.cos(th - rot), s = Math.sin(th - rot);
      let r = o.R / Math.sqrt(c * c + s * s * asp * asp);
      r *= 1 + 0.14 * Math.sin(2 * th + ph) + 0.08 * Math.sin(5 * th + ph2) + 0.3 * (E.vnoise(k * 1.3, ph * 10) - 0.5);
      if (o.clip !== false) {
        let t = 0;
        while (t < r) { const t2 = Math.min(r, t + 2); if (blockedM(x + Math.cos(th) * t2, z + Math.sin(th) * t2, margin)) break; t = t2; }
        r = t;
      }
      radii[k] = Math.max(1.5, r);
    }
    for (let p = 0; p < 3; p++) for (let k = 0; k < K; k++) radii[k] = Math.min(radii[k], (radii[(k + K - 1) % K] + radii[(k + 1) % K]) / 2 + 2.5);
    let avg = 0; for (let k = 0; k < K; k++) avg += radii[k]; avg /= K;
    if (avg < (o.minR ?? 4)) return null;
    let gmin = heightAt(x, z), gsum = 0, gn = 0;
    for (let k = 0; k < K; k += 2) {
      const th = (k / K) * Math.PI * 2;
      for (const f of [0.55, 1.04]) { const h = heightAt(x + Math.cos(th) * radii[k] * f, z + Math.sin(th) * radii[k] * f); gmin = Math.min(gmin, h); gsum += h; gn++; }
    }
    const gavg = gsum / gn;
    const yb = gmin - 3;
    const top = o.top ?? gavg + o.H;
    const T = o.tiers ?? 1;
    const fr = T === 1 ? [1] : T === 2 ? [1, 0.6 + rnd() * 0.15] : [1, 0.74, 0.48];
    const fh = T === 1 ? [1] : T === 2 ? [0.58 + rnd() * 0.15, 1] : [0.45, 0.76, 1];
    const tint = new THREE.Color(o.tint ?? tints[(rnd() * tints.length) | 0]);
    const vOff = rnd(), tT = ROCK_T * (0.8 + rnd() * 0.45);
    const out = o.far ? farRock : nearRock;
    let yPrev = yb;
    for (let j = 0; j < T; j++) {
      const y1 = Math.max(gavg + 3, E.lerp(gavg, top, fh[j]));
      const y0 = j === 0 ? yb : yPrev - 0.6;
      addTier(x, z, radii, fr[j] * (j === 0 && o.skirt !== false ? 0.8 : 1), y0, y1, tint, vOff, out, j === 0 && o.skirt !== false, tT);
      yPrev = y1;
    }
    let rmax = 0; for (let k = 0; k < K; k++) rmax = Math.max(rmax, radii[k]);
    const m = { x, z, radii, K, rmax, top };
    mesas.push(m);
    return m;
  }
  const mesaR = (m, ang) => { const K = m.K; let a = ang / (Math.PI * 2) * K; a = ((a % K) + K) % K; const k0 = Math.floor(a), f = a - k0; return E.lerp(m.radii[k0], m.radii[(k0 + 1) % K], f); };
  function insideMesa(x, z, pad = 1) {
    for (const m of mesas) {
      const dx = x - m.x, dz = z - m.z, d2 = dx * dx + dz * dz;
      if (d2 > (m.rmax + pad) ** 2) continue;
      if (Math.sqrt(d2) < mesaR(m, Math.atan2(dz, dx)) * 1.03 + pad) return true;
    }
    return false;
  }

  // --- the natural arch the road passes under
  const iArch = L.atCP(8.45);
  const archInfo = (() => {
    const f = frame(iArch);
    const A = Math.max(L.wallL[iArch], L.wallR[iArch]) + 11, B = 21;
    const NS = 44, M = 16;
    const pos = [], uv = [], col = [], ctr = [];
    const tint = new THREE.Color(0xffe6d6);
    for (let s = 0; s <= NS; s++) {
      const th = -0.3 + (Math.PI + 0.6) * s / NS;
      const cl = Math.cos(th) * A, cy = Math.sin(th) * B;
      const dX = -Math.sin(th) * A, dY = Math.cos(th) * B, dl = Math.hypot(dX, dY);
      const nR = dY / dl, nY = -dX / dl;
      const leg = 1 - Math.max(0, Math.sin(th));
      const thick = 4.6 + 4.6 * leg * leg, wide = 6.0 + 4.0 * leg * leg;
      let per = 0, lx = 0, ly = 0, lz = 0;
      for (let j = 0; j <= M; j++) {
        const a = (j / M) * Math.PI * 2;
        const n = 1 + 0.22 * (E.vnoise(s * 0.55, (j % M) * 0.8 + 3) - 0.5);
        const sq = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.55);
        const o1 = sq(Math.cos(a)) * thick * n, o2 = sq(Math.sin(a)) * wide * n;
        const lat = cl + nR * o1, y = f.y + cy + nY * o1;
        const x = f.x + f.rx * lat + f.tx * o2, z = f.z + f.rz * lat + f.tz * o2;
        if (j > 0) per += Math.hypot(x - lx, y - ly, z - lz);
        lx = x; ly = y; lz = z;
        pos.push(x, y, z); ctr.push(f.x + f.rx * cl, f.y + cy, f.z + f.rz * cl);
        uv.push(per / ROCK_T * 1.4, y / ROCK_T + 0.3);
        const sh = 0.8 + 0.2 * E.smoothstep(f.y - 4, f.y + 14, y);
        col.push(tint.r * sh, tint.g * sh, tint.b * sh);
      }
    }
    const ag = gridGeometry(pos, uv, col, NS + 1, M + 1, (k) => [pos[k * 3] - ctr[k * 3], pos[k * 3 + 1] - ctr[k * 3 + 1], pos[k * 3 + 2] - ctr[k * 3 + 2]]);
    nearRock.push(ag.toNonIndexed()); ag.dispose();
    return { f, A, B };
  })();
  // buttes the arch legs grow out of
  for (const sd of [-1, 1]) {
    const p = E.frameAt(L, iArch, sd * (archInfo.A + 14));
    mesa({ x: p.x, z: p.z, R: 15, H: sd < 0 ? 30 : 16, tiers: 2, margin: 6, asp: 1.3, rot: Math.atan2(L.tz[iArch], L.tx[iArch]) });
  }

  // --- canyon walls hugging chosen sections of road
  const wallSections = [
    { from: 1.9, to: 3.8, side: -1, R: [16, 26], H: [18, 34], gap: [14, 40], tiers: 2, p: 0.6 },
    { from: 5.3, to: 7.0, side: -1, R: [18, 28], H: [26, 42], gap: [8, 28], tiers: 2, p: 0.7 },
    { from: 7.0, to: 10.0, side: -1, R: [18, 30], H: [32, 48], gap: [5, 14], tiers: 2, p: 0.85 },
    { from: 10.2, to: 12.8, side: 1, R: [16, 24], H: [22, 34], gap: [3, 6], tiers: 3, p: 1 },
    { from: 13.3, to: 15.2, side: -1, R: [14, 22], H: [20, 32], gap: [2, 6], tiers: 2, p: 1 },
    { from: 15.3, to: 17.8, side: 1, R: [16, 26], H: [22, 36], gap: [8, 24], tiers: 2, p: 0.6 },
    { from: 18.2, to: 20.0, side: -1, R: [14, 22], H: [18, 30], gap: [2, 6], tiers: 2, p: 1 },
    { from: 20.6, to: 23.7, side: -1, R: [14, 22], H: [28, 42], gap: [2, 6], tiers: 2, p: 1 },
    { from: 20.8, to: 23.6, side: 1, R: [14, 22], H: [20, 32], gap: [3, 10], tiers: 1, p: 0.8 },
  ];
  for (const sec of wallSections) {
    const a = L.atCP(sec.from), b0 = L.atCP(sec.to), b = b0 >= a ? b0 : b0 + N;
    let i = a;
    while (i < b) {
      const R = E.lerp(sec.R[0], sec.R[1], rnd());
      const ii = wrapI(i);
      const wall = sec.side > 0 ? L.wallR[ii] : L.wallL[ii];
      const p = E.frameAt(L, ii, sec.side * (wall + 4 + R * 0.75 + E.lerp(sec.gap[0], sec.gap[1], rnd())));
      if (rnd() < sec.p) mesa({ x: p.x, z: p.z, R, H: E.lerp(sec.H[0], sec.H[1], rnd()), tiers: 1 + ((rnd() * sec.tiers) | 0), asp: 1.2 + rnd() * 0.5, rot: Math.atan2(L.tz[ii], L.tx[ii]), margin: 3.5 + rnd() * 3 });
      i += Math.round((R * 1.25) / L.ds);
    }
  }
  // --- infield landmarks: a big three-tier mesa, buttes and hoodoo spires
  const inf = (x, z) => [x * S, z * S];
  [[165, 115, 52, 58, 3], [255, 175, 22, 44, 2], [70, 140, 20, 36, 2], [120, 255, 16, 30, 2], [80, 320, 18, 30, 3], [280, 290, 18, 38, 2],
    [-120, 60, 26, 40, 2], [-150, 200, 30, 48, 2], [40, 420, 26, 44, 2], [150, 450, 30, 50, 2], [300, 420, 26, 40, 2], [440, 300, 28, 46, 2],
    [430, 60, 30, 40, 2], [330, -60, 26, 34, 2], [170, -90, 30, 38, 2], [20, -100, 24, 30, 2], [-110, -60, 26, 36, 2], [-40, 290, 20, 34, 3]]
    .forEach(([x, z, R, H, t]) => { const [wx, wz] = inf(x, z); mesa({ x: wx, z: wz, R, H, tiers: t, margin: 5 }); });
  for (let k = 0; k < 40; k++) { // thin hoodoo spires
    const x = L.bounds.minX - 120 + rnd() * (L.bounds.maxX - L.bounds.minX + 240);
    const z = L.bounds.minZ - 120 + rnd() * (L.bounds.maxZ - L.bounds.minZ + 240);
    if (insideMesa(x, z, 10)) continue;
    mesa({ x, z, R: 4 + rnd() * 4, H: 14 + rnd() * 18, tiers: 3, K: 9, margin: 6, minR: 2.5 });
  }
  // --- gorge walls: elongated strata blocks lining both sides of the gorge; flush with the rim near the trestle so the
  //     view down into the gorge stays open, taller further out
  {
    const gc = (u) => { const v = Math.sin(u * 0.011 + 0.6) * 30 * E.smoothstep(45, 160, Math.abs(u)); return [GF.x - GF.rx * u + GF.tx * v, GF.z - GF.rz * u + GF.tz * v]; };
    for (let u = -72; u < 660;) {
      const R = 11 + rnd() * 7;
      const [x0, z0] = gc(u), [x1, z1] = gc(u + 2);
      const dx = (x1 - x0) / 2, dz = (z1 - z0) / 2, dl = Math.hypot(dx, dz);
      const nx = -dz / dl, nz = dx / dl;   // across the gorge
      const widen = 1 + 0.6 * E.smoothstep(150, 500, u);
      for (const sd of [-1, 1]) {
        const off = 13 * widen + R / 2.2 * 0.85;
        const x = x0 + nx * off * sd, z = z0 + nz * off * sd;
        const rim = base(x, z);
        mesa({ x, z, R, asp: 2.2, rot: Math.atan2(dz, dx), top: Math.abs(u) < 60 ? rim - 0.4 : rim + rnd() * 8, tiers: Math.abs(u) < 60 ? 1 : 1 + ((rnd() * 2) | 0), margin: 5, K: 14, skirt: false, minR: 3 });
      }
      u += R * 1.5;
    }
  }
  // --- dry wash under the jump gap: low strata blocks line its banks so it reads as a crack in the desert floor
  for (const sd of [-1, 1]) for (let lat = 24; lat < 92;) {
    const R = 8 + rnd() * 5;
    for (const bank of [-1, 1]) {
      const p = E.frameAt(L, WF.i, sd * lat);
      const x = p.x + WF.tx * bank * (8.5 + R / 2.2 * 0.8), z = p.z + WF.tz * bank * (8.5 + R / 2.2 * 0.8);
      mesa({ x, z, R, asp: 2.2, rot: Math.atan2(WF.rz, WF.rx), top: base(x, z) - 0.3 + (lat > 50 ? rnd() * 3 : 0), margin: 4, K: 12, skirt: false, minR: 2.5 });
    }
    lat += R * 1.4;
  }
  // --- far skyline of big mesas
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2 + rnd() * 0.15, r = 560 + rnd() * 200;
    const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
    mesa({ x, z, R: 40 + rnd() * 50, H: 40 + rnd() * 60, tiers: 1 + ((rnd() * 2) | 0), clip: false, far: true, K: 18, asp: 1 + rnd() });
  }
  // --- mine mesa at the end of the cart line
  const mineMesa = mesa({ x: mineB.x + mineDir.x * 24, z: mineB.z + mineDir.z * 24, R: 22, H: 26, tiers: 2, margin: 5, rot: Math.atan2(mineDir.z, mineDir.x), asp: 1.1 });

  { // merge the near rock into 4 quadrant chunks so frustum culling (main + shadow pass) can skip what is not seen
    const chunks = [[], [], [], []];
    for (const g of nearRock) {
      g.computeBoundingSphere(); const c = g.boundingSphere.center;
      chunks[(c.x > CX ? 1 : 0) + (c.z > CZ ? 2 : 0)].push(g);
    }
    chunks.forEach((list, k) => {
      if (!list.length) return;
      const g = keep(mergeGeometries(list)); list.forEach((x) => x.dispose());
      computeOutlineNormals(g);
      const m = new THREE.Mesh(g, rockMat); m.name = 'mesas' + k; m.castShadow = shadows; m.receiveShadow = true; root.add(m);
      if (outlines) { const o = new THREE.Mesh(g, ink); o.name = 'mesas' + k + ':ink'; root.add(o); }
    });
  }
  if (farRock.length) {
    const farG = keep(mergeGeometries(farRock)); farRock.forEach((g) => g.dispose());
    const m = new THREE.Mesh(farG, rockMat); m.name = 'farMesas'; m.receiveShadow = false; root.add(m);
  }

  // ------------------------------------------------------------------ wooden trestle bents under the bridges
  {
    const woodTex = texClone('textures/common/wood_planks.webp'); if (woodTex) keep(woodTex);
    const woodMat = keep(toonMaterial({ map: woodTex, color: 0xffffff }));
    const parts = [];
    const DECK = 2.4;
    const P = (i, lat, y) => { const p = E.frameAt(L, i, lat); p.y = y; return p; };
    for (const [a, b] of [trestleRun, gapRun]) {
      const stepN = Math.max(1, Math.round(7.5 / L.ds));
      const bents = [];
      for (let ii = a + Math.round(stepN * 0.4); ii <= b - Math.round(stepN * 0.3); ii += stepN) {
        const i = wrapI(ii);
        const top = L.py[i] - DECK;
        const lats = [-(HW + 0.8), -HW * 0.35, HW * 0.35, HW + 0.8];
        const floorAt = (lat) => { const p = E.frameAt(L, i, lat); return heightAt(p.x, p.z) - 0.8; };
        const fl = Math.min(...lats.map((l) => floorAt(l * 1.15)));
        const hgt = top - fl;
        if (hgt < 1.5) continue;
        const batter = 0.07;
        const lv = [];
        for (const lat of lats) {
          const outer = Math.abs(lat) > HW;
          const bl = lat + (outer ? Math.sign(lat) * batter * hgt : 0);
          parts.push(beam(P(i, lat, top + 0.2), P(i, bl, fl), outer ? 0.95 : 0.75));
          lv.push([lat, bl]);
        }
        parts.push(beam(P(i, -(HW + 1.6), top - 0.3), P(i, HW + 1.6, top - 0.3), 0.6));   // cap
        const levels = Math.max(1, Math.round(hgt / 5.5));
        const latAt = (k, y) => { const t = (top - y) / hgt; return E.lerp(lv[k][0], lv[k][1], t); };
        let prevY = top - 0.3;
        for (let q = 1; q <= levels; q++) {
          const y = top - 0.3 - (hgt - 0.6) * q / levels;
          if (q < levels) parts.push(beam(P(i, latAt(0, y) - 0.5, y), P(i, latAt(3, y) + 0.5, y), 0.55));
          parts.push(beam(P(i, latAt(0, prevY), prevY), P(i, latAt(3, y), y), 0.42));
          parts.push(beam(P(i, latAt(3, prevY), prevY), P(i, latAt(0, y), y), 0.42));
          prevY = y;
        }
        bents.push({ i, top, levels, hgt, latAt });
      }
      // timber guard posts + top rail along both deck edges, so the trestle reads from the driver's seat
      const postStep = Math.max(1, Math.round(5 / L.ds));
      for (const sd of [-1, 1]) {
        let prev = null;
        for (let ii = a; ii <= b; ii += postStep) {
          const i = wrapI(ii);
          const lat = sd * (HW + 1.55);
          const bot = P(i, lat, L.py[i] - 0.4), top = P(i, lat, L.py[i] + 2.5);
          parts.push(beam(bot, top, 0.5));
          if (prev) {
            parts.push(beam(prev.top.clone().setY(prev.top.y - 0.15), top.clone().setY(top.y - 0.15), 0.32));
            parts.push(beam(prev.bot.clone().setY(prev.bot.y + 1.5), top.clone().setY(top.y - 0.4), 0.2));
          }
          prev = { bot, top };
        }
      }
      // longitudinal stringers / ties between bents
      for (let k = 0; k + 1 < bents.length; k++) {
        const b1 = bents[k], b2 = bents[k + 1];
        const n = Math.min(b1.levels, b2.levels);
        for (let q = 1; q < n; q++) {
          for (const side of [0, 3]) {
            const y1 = b1.top - 0.3 - (b1.hgt - 0.6) * q / b1.levels, y2 = b2.top - 0.3 - (b2.hgt - 0.6) * q / b2.levels;
            parts.push(beam(P(b1.i, b1.latAt(side, y1), y1), P(b2.i, b2.latAt(side, y2), y2), 0.32));
          }
        }
      }
    }
    // timber gate over the road at the trestle entrance, carrying the SUNSET GORGE sign
    {
      const i = wrapI(trestleRun[0] - Math.round(4 / L.ds));
      const y0 = L.py[i];
      const pl = P(i, -(HW + 2.6), y0 - 1), pr = P(i, HW + 2.6, y0 - 1);
      parts.push(beam(pl, pl.clone().setY(y0 + 10.5), 1.0), beam(pr, pr.clone().setY(y0 + 10.5), 1.0));
      parts.push(beam(P(i, -(HW + 4.2), y0 + 9.6), P(i, HW + 4.2, y0 + 9.6), 0.9));
      for (const sd of [-1, 1]) parts.push(beam(P(i, sd * (HW + 2.6), y0 + 6.4), P(i, sd * (HW - 1.2), y0 + 9.4), 0.5));
      const signTex = texClone('textures/canyon/sign_gorge.webp', { repeat: false }); if (signTex) keep(signTex);
      const f = frame(i);
      const yaw = Math.atan2(-f.tx, -f.tz);  // face the approaching karts
      const sg = new THREE.PlaneGeometry(10.5, 7).rotateY(yaw);
      const back = 0.55;
      sg.translate(f.x - f.tx * back, y0 + 13.4, f.z - f.tz * back);
      const sm = new THREE.Mesh(keep(sg), keep(toonMaterial(signTex ? { map: signTex, rim: false } : { color: 0x9a6238, rim: false })));
      sm.name = 'gorgeSign'; root.add(sm);
      parts.push(woodBox(11.1, 7.6, 0.4).rotateY(yaw).translate(f.x, y0 + 13.4, f.z));
      parts.push(beam(P(i, -4.5, y0 + 9.6), P(i, -4.5, y0 + 10.4), 0.4), beam(P(i, 4.5, y0 + 9.6), P(i, 4.5, y0 + 10.4), 0.4));
    }
    if (parts.length) {
      const g = keep(mergeGeometries(parts.map((p) => p.toNonIndexed()))); parts.forEach((p) => p.dispose());
      computeOutlineNormals(g);
      const m = new THREE.Mesh(g, woodMat); m.name = 'trestle'; m.castShadow = shadows; m.receiveShadow = true; root.add(m);
    }
  }

  // ------------------------------------------------------------------ painted props: water tower, mine portal, rails, grandstand, bunting poles
  const bigParts = [], smallParts = [];
  {
    // water tower
    const gy = heightAt(towerP.x, towerP.z);
    const T = [];
    const legH = 13, tankR = 5, tankH = 6.5;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      const top = new THREE.Vector3(Math.cos(a) * 3.6, legH, Math.sin(a) * 3.6), bot = new THREE.Vector3(Math.cos(a) * 4.6, -1.5, Math.sin(a) * 4.6);
      T.push(rod(bot, top, 0.32, C.timber));
      const a2 = a + Math.PI / 2;
      const top2 = new THREE.Vector3(Math.cos(a2) * 3.6, legH, Math.sin(a2) * 3.6), bot2 = new THREE.Vector3(Math.cos(a2) * 4.6, -1.5, Math.sin(a2) * 4.6);
      T.push(rod(new THREE.Vector3().lerpVectors(bot, top, 0.15), new THREE.Vector3().lerpVectors(bot2, top2, 0.6), 0.14, 0x5e3a22, 4));
      T.push(rod(new THREE.Vector3().lerpVectors(bot2, top2, 0.15), new THREE.Vector3().lerpVectors(bot, top, 0.6), 0.14, 0x5e3a22, 4));
    }
    T.push(E.paint(new THREE.CylinderGeometry(tankR + 0.4, tankR + 0.4, 0.5, 16).translate(0, legH + 0.25, 0), 0x5e3a22));
    T.push(E.paint(new THREE.CylinderGeometry(tankR, tankR, tankH, 16).translate(0, legH + 0.5 + tankH / 2, 0), 0x9a6238));
    for (const y of [1.4, tankH - 1.2]) T.push(E.paint(new THREE.CylinderGeometry(tankR + 0.12, tankR + 0.12, 0.35, 16).translate(0, legH + 0.5 + y, 0), 0x3d2a2e));
    T.push(E.paint(new THREE.ConeGeometry(tankR + 0.7, 3.4, 16).translate(0, legH + 0.5 + tankH + 1.7, 0), C.berry));
    T.push(E.paint(new THREE.SphereGeometry(0.5, 8, 6).translate(0, legH + 0.5 + tankH + 3.6, 0), C.gold));
    T.push(E.paint(new THREE.BoxGeometry(5.2, 1.8, 0.2).translate(0, legH + 0.5 + tankH / 2, tankR + 0.05), C.cream));
    for (const g of T) { g.translate(towerP.x, gy, towerP.z); bigParts.push(g); }

    // mine-cart rails, ties and the mine portal
    const railPts = [];
    for (let d = -6; d <= MINE_LEN + 4; d += 3) {
      const p = mineA.clone().addScaledVector(mineDir, d); p.y = heightAt(p.x, p.z) + 0.25; railPts.push(p);
    }
    const side = new THREE.Vector3(-mineDir.z, 0, mineDir.x);
    for (let k = 0; k + 1 < railPts.length; k++) {
      for (const s of [-0.75, 0.75]) smallParts.push(rod(railPts[k].clone().addScaledVector(side, s).setY(railPts[k].y + 0.22), railPts[k + 1].clone().addScaledVector(side, s).setY(railPts[k + 1].y + 0.22), 0.09, 0x4a3b45, 4));
      for (let q = 0; q < 2; q++) {
        const p = new THREE.Vector3().lerpVectors(railPts[k], railPts[k + 1], q * 0.5);
        smallParts.push(E.paint(new THREE.BoxGeometry(2.3, 0.22, 0.45).rotateY(Math.atan2(-side.z, side.x)).translate(p.x, p.y, p.z), 0x6b4428));
      }
    }
    if (mineMesa) {
      const ang = Math.atan2(-mineDir.z, -mineDir.x);
      const r = mesaR(mineMesa, ang);
      const face = new THREE.Vector3(mineMesa.x + Math.cos(ang) * (r - 1.0), 0, mineMesa.z + Math.sin(ang) * (r - 1.0));
      face.y = heightAt(face.x, face.z);
      const yaw = Math.atan2(mineDir.x, mineDir.z);
      const portal = [
        E.paint(new THREE.BoxGeometry(5.6, 6.4, 3.5).translate(0, 3.0, 1.2), 0x24161f),   // dark tunnel mouth
        E.paint(new THREE.BoxGeometry(0.8, 7.2, 0.8).translate(-3.2, 3.4, -0.6), C.timber),
        E.paint(new THREE.BoxGeometry(0.8, 7.2, 0.8).translate(3.2, 3.4, -0.6), C.timber),
        E.paint(new THREE.BoxGeometry(8.4, 0.9, 1.0).translate(0, 7.1, -0.6), C.timber),
        E.paint(new THREE.BoxGeometry(5.0, 1.2, 0.25).translate(0, 8.3, -0.8), C.cream),
      ];
      for (const g of portal) { g.rotateY(yaw + Math.PI).translate(face.x, face.y - 0.4, face.z); bigParts.push(g); }
    }

    // grandstand on the outfield side of the start straight
    const i0 = N - Math.round(55 / L.ds), i1 = N + Math.round(55 / L.ds);
    const crowdSpots = [];
    for (let ii = i0; ii < i1; ii += Math.round(1.6 / L.ds)) {
      const i = wrapI(ii);
      const wall = L.wallL[i];
      for (let tier = 0; tier < 5; tier++) {
        const p = E.frameAt(L, i, -(wall + 2.2 + tier * 1.5));
        const y = L.py[i] + tier * 0.8;
        if (ii % Math.round(6 / L.ds) === 0) {
          bigParts.push(E.paint(new THREE.BoxGeometry(1.55, y - L.py[i] + 1.4, 6.4).rotateY(L.head[i]).translate(p.x, L.py[i] + (y - L.py[i] + 1.4) / 2 - 0.8, p.z), tier % 2 ? 0x9a6238 : 0x7a4a2a));
        }
        if (rnd() < 0.55) crowdSpots.push({ x: p.x + (rnd() - 0.5) * 0.3, y: y + 0.6, z: p.z + (rnd() - 0.5) * 0.3, r: Math.atan2(L.rx[i], L.rz[i]) + (rnd() - 0.5) * 0.5, s: 0.95 + rnd() * 0.2 });
      }
      // striped awning over the back rows
      if (ii % Math.round(6 / L.ds) === 0) {
        const pa = E.frameAt(L, i, -(wall + 9.6)), pf = E.frameAt(L, i, -(wall + 2.6));
        bigParts.push(E.paint(new THREE.CylinderGeometry(0.16, 0.16, 9, 5).translate(pa.x, L.py[i] + 4.5, pa.z), C.timber));
        const k = Math.round((ii - i0) / Math.round(6 / L.ds));
        const roof = new THREE.BoxGeometry(8.4, 0.25, 6.0);
        const g = E.paint(roof, k % 2 ? C.cream : C.teal);
        g.rotateX(0).rotateY(L.head[i]);
        // tilt towards the road
        const tilt = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(L.tx[i], 0, L.tz[i]).normalize(), 0.22);
        g.applyMatrix4(tilt);
        const mid = pa.clone().lerp(pf, 0.5);
        g.translate(mid.x, L.py[i] + 8.3, mid.z);
        bigParts.push(g);
      }
    }
    E.crowd(ctx, crowdSpots, { palette: CROWD });
    // a second, separate (separately culled) group of spectators by the jump
    crowdSpots.length = 0;
    for (const [cp, sd, n] of [[19.0, 1, 22], [19.0, -1, 14]]) {
      for (let k = 0; k < n; k++) {
        const i = wrapI(L.atCP(cp) + Math.round((rnd() - 0.5) * 22 / L.ds));
        const wall = sd > 0 ? L.wallR[i] : L.wallL[i];
        const p = E.frameAt(L, i, sd * (wall + 1.6 + rnd() * 4));
        if (washF(p.x, p.z) > 0.05 || gorgeF(p.x, p.z) > 0.02 || insideMesa(p.x, p.z, 0.5)) continue;
        crowdSpots.push({ x: p.x, y: heightAt(p.x, p.z) + 0.05, z: p.z, r: Math.atan2(-sd * L.rx[i], -sd * L.rz[i]), s: 1 });
      }
    }
    E.crowd(ctx, crowdSpots, { palette: CROWD });

    // bunting poles + bunting across the start straight
    const lines = [];
    for (const d of [-34, 26, 70]) {
      const i = wrapI(Math.round(d / L.ds));
      const a = E.frameAt(L, i, L.wallR[i] + 1.4), b = E.frameAt(L, i, -(L.wallL[i] + 1.4));
      for (const p of [a, b]) bigParts.push(E.paint(new THREE.CylinderGeometry(0.22, 0.3, 10.5, 6).translate(p.x, L.py[i] + 4.5, p.z), C.timber));
      a.y = b.y = L.py[i] + 9.3;
      lines.push({ a, b, sag: 1.8 });
    }
    E.bunting(ctx, lines, { colors: [C.berry, C.gold, C.teal, C.orange, C.cream, 0x6b4bc4] });

    // flags along the start straight
    const flagSpots = [];
    for (let k = -4; k <= 5; k++) {
      const i = wrapI(k * Math.round(13 / L.ds));
      const sd = k % 2 ? 1 : -1;
      const wall = sd > 0 ? L.wallR[i] : L.wallL[i];
      const p = E.frameAt(L, i, sd * (wall + 1.2));
      flagSpots.push({ x: p.x, y: L.py[i] - 0.5, z: p.z, r: L.head[i] + Math.PI / 2, color: [C.berry, C.gold, C.teal, C.orange][(k + 8) % 4] });
    }
    E.flags(ctx, flagSpots);

    // sponsor banners
    const banners = ['textures/canyon/banner_cactus.webp', 'textures/canyon/banner_balloons.webp', 'textures/ui/banner_fizz.webp'];
    const bspots = [];
    [[0.25, 1], [1.6, -1], [9.4, -1], [13.9, -1], [18.7, 1], [21.25, 1], [24.2, 1]].forEach(([cp, sd], k) => bspots.push({ i: L.atCP(cp), side: sd, tex: banners[k % banners.length] }));
    E.bannerBoards(ctx, bspots);
  }
  if (bigParts.length) {
    const g = keep(E.mergePainted(bigParts));
    const m = new THREE.Mesh(g, keep(toonMaterial({ vertexColors: true }))); m.name = 'props'; m.castShadow = shadows; m.receiveShadow = true; root.add(m);
    if (outlines) root.add(new THREE.Mesh(g, ink));
  }
  if (smallParts.length) {
    const g = keep(E.mergePainted(smallParts, 0));
    const m = new THREE.Mesh(g, keep(toonMaterial({ vertexColors: true }))); m.name = 'rails'; m.receiveShadow = true; root.add(m);
  }

  // ------------------------------------------------------------------ mine carts (animated, ping-pong into the mine)
  {
    const cartG = keep(E.mergePainted([
      E.paint(new THREE.CylinderGeometry(1.25, 0.95, 1.2, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.35).translate(0, 1.05, 0), 0x8a5a3c),
      E.paint(new THREE.BoxGeometry(1.95, 0.18, 2.6).translate(0, 1.62, 0), 0x4a3b45),
      ...[[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].map(([x, z]) => E.paint(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 10).rotateZ(Math.PI / 2).translate(x, 0.4, z), 0x3d2a2e)),
      E.paint(new THREE.IcosahedronGeometry(0.55, 0).translate(-0.35, 1.75, 0.3), C.gold),
      E.paint(new THREE.IcosahedronGeometry(0.5, 0).translate(0.35, 1.8, -0.35), 0xffe27a),
      E.paint(new THREE.IcosahedronGeometry(0.45, 0).translate(0.1, 1.95, 0.55), C.gold),
    ]));
    const carts = [{ ph: 0 }, { ph: 0.5 }].map((c) => ({ ...c, x: 0, y: 0, z: 0 }));
    const cm = E.instanced(ctx, cartG, keep(toonMaterial({ vertexColors: true })), carts, { ink: 1, name: 'mineCarts' });
    cm.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1.2, 1.2, 1.2), p = new THREE.Vector3();
    q.setFromAxisAngle(_up, Math.atan2(mineDir.x, mineDir.z));
    updaters.push((dt, t) => {
      carts.forEach((c, k) => {
        const u = ((t * 0.045 + c.ph) % 1);
        const d = (0.5 - 0.5 * Math.cos(u * Math.PI * 2)) * (MINE_LEN + 8);
        p.copy(mineA).addScaledVector(mineDir, d - 2);
        p.y = heightAt(p.x, p.z) + 0.25;
        cm.setMatrixAt(k, m4.compose(p, q, sc));
      });
      cm.instanceMatrix.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------------ desert flora + rocks
  {
    const saguaro = (arms) => {
      const parts = [E.paint(new THREE.CapsuleGeometry(0.62, 6.2, 1, 6).translate(0, 3.6, 0), 0x4f8f4a)];
      arms.forEach(([ang, y, out, up]) => {
        const dx = Math.cos(ang), dz = Math.sin(ang);
        parts.push(E.paint(new THREE.CylinderGeometry(0.4, 0.4, out, 5, 1, true).rotateZ(Math.PI / 2).rotateY(-ang).translate(dx * out / 2, y, dz * out / 2), 0x4f8f4a));
        parts.push(E.paint(new THREE.CapsuleGeometry(0.42, up, 1, 4).translate(dx * out, y + up / 2, dz * out), 0x5a9a50));
      });
      parts.push(E.paint(new THREE.SphereGeometry(0.28, 6, 4).translate(0, 7.35, 0), 0xffa6c9));
      return keep(E.mergePainted(parts));
    };
    const sagA = saguaro([[0, 3.2, 1.6, 2.4], [Math.PI, 4.2, 1.4, 1.8], [Math.PI / 2, 4.9, 1.1, 1.2]]);
    const pear = keep(E.mergePainted([
      E.paint(new THREE.SphereGeometry(0.75, 7, 4).scale(1, 1.15, 0.32).translate(0, 0.8, 0), 0x6b9a5b),
      E.paint(new THREE.SphereGeometry(0.6, 7, 4).scale(1, 1.15, 0.32).rotateY(0.9).rotateZ(0.5).translate(0.75, 1.75, 0.1), 0x76a865),
      E.paint(new THREE.SphereGeometry(0.55, 7, 4).scale(1, 1.15, 0.32).rotateY(-0.6).rotateZ(-0.45).translate(-0.7, 1.6, -0.1), 0x76a865),
      E.paint(new THREE.SphereGeometry(0.2, 5, 3).translate(0.95, 2.45, 0.1), C.berry),
      E.paint(new THREE.SphereGeometry(0.2, 5, 3).translate(-0.9, 2.25, -0.1), 0xffa6c9),
      E.paint(new THREE.SphereGeometry(0.2, 5, 3).translate(0.05, 1.7, 0), C.berry),
    ], 0.6));
    const bushG = keep(E.mergePainted([
      E.paint(new THREE.IcosahedronGeometry(1.1, 0).scale(1.3, 0.75, 1.15).translate(0, 0.55, 0), 0xffffff),
      E.paint(new THREE.IcosahedronGeometry(0.8, 0).scale(1.2, 0.8, 1).translate(0.8, 0.45, 0.3), 0xe8e8e8),
    ]));
    const rockG = keep(E.mergePainted([E.paint(new THREE.DodecahedronGeometry(1, 0).scale(1.3, 0.75, 1.05).translate(0, 0.35, 0), 0xffffff)]));
    const sags = [], pears = [], bushes = [], rocks = [];
    let guard = 0;
    const bx0 = L.bounds.minX - 260, bx1 = L.bounds.maxX + 260, bz0 = L.bounds.minZ - 260, bz1 = L.bounds.maxZ + 260;
    // loose scree boulders resting on the slope above the boulder lanes
    for (const ln of lanes) for (let k = 0; k < 9; k++) {
      const lat = 30 + rnd() * 50, off = (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 7);
      const p = E.frameAt(L, ln.i + Math.round(off / L.ds), -lat);
      if (spot(p.x, p.z, 3).ok && !insideMesa(p.x, p.z, 1)) rocks.push({ x: p.x, y: heightAt(p.x, p.z) - 0.5, z: p.z, r: rnd() * 6.28, s: 1.2 + rnd() * 1.6, tilt: (rnd() - 0.5) * 0.5, color: [C.rock, C.rockLight, C.rockDark][(rnd() * 3) | 0] });
    }
    while ((sags.length < 90 || pears.length < 70 || bushes.length < 300 || rocks.length < 240) && guard++ < 80000) {
      let x, z;
      if (rnd() < 0.7) { // most flora lines the road where it is seen
        const i = (rnd() * N) | 0, sd = rnd() < 0.5 ? -1 : 1;
        const p = E.frameAt(L, i, sd * ((sd > 0 ? L.wallR[i] : L.wallL[i]) + 3 + Math.pow(rnd(), 1.6) * 70));
        x = p.x; z = p.z;
      } else { x = bx0 + rnd() * (bx1 - bx0); z = bz0 + rnd() * (bz1 - bz0); }
      const s = spot(x, z, 3);
      if (!s.ok) continue;
      if (gorgeF(x, z) > 0.05 || washF(x, z) > 0.05) continue;
      if (insideMesa(x, z, 1.2)) continue;
      if (Math.hypot(x - towerP.x, z - towerP.z) < 9) continue;
      if (capsules.some((c) => inCapsule(x, z, { ...c, r: 3.5 }))) continue;
      const y = heightAt(x, z);
      const r = rnd();
      const near = s.d < 60;
      if (r < 0.2 && sags.length < 90) sags.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.5, tilt: (rnd() - 0.5) * 0.08 });
      else if (r < 0.36 && pears.length < 70) pears.push({ x, y: y - 0.1, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.6 });
      else if (r < 0.72 && bushes.length < 300) bushes.push({ x, y: y - 0.15, z, r: rnd() * 6.28, s: 0.7 + rnd() * 0.8, color: [0x8fa860, 0x6b9a5b, 0xa3a86a, 0x7c8f55][(rnd() * 4) | 0] });
      else if (rocks.length < 240) { const sc = near ? 0.6 + rnd() * 1.4 : 1 + rnd() * 3; rocks.push({ x, y: y - 0.25 * sc, z, r: rnd() * 6.28, s: sc, tilt: (rnd() - 0.5) * 0.4, color: [C.rock, C.rockLight, C.rockDark, 0xb8603a][(rnd() * 4) | 0] }); }
    }
    const vm = keep(toonMaterial({ vertexColors: true }));
    E.instanced(ctx, sagA, vm, sags, { ink: 1, name: 'saguaros' });
    E.instanced(ctx, pear, vm, pears, { cast: false, name: 'pricklyPear' });
    E.instanced(ctx, bushG, vm, bushes, { cast: false, ink: 1, name: 'scrub' });
    E.instanced(ctx, rockG, vm, rocks, { ink: 1, name: 'rocks' });
  }

  // ------------------------------------------------------------------ hot-air balloons drifting over the canyon (one draw call, shader drift)
  {
    const DRIFT = `
      float bph = uv.x * 2.37;
      transformed.x += sin(uTime * 0.045 + bph) * 32.0;
      transformed.z += cos(uTime * 0.037 + bph * 1.7) * 32.0;
      transformed.y += sin(uTime * 0.35 + bph * 3.0) * 2.2;`;
    const sets = [[C.teal, C.cream], [C.berry, C.cream], [C.orange, C.purple], [C.gold, C.berry], [C.teal, C.gold], [0x6b4bc4, C.cream]];
    const spots = [[60, 70, 200], [250, 85, 110], [420, 95, 330], [120, 75, 500], [-80, 80, 360], [250, 100, -60], [480, 120, 80]];
    const parts = [];
    spots.forEach(([x, y, z], k) => {
      const [cA, cB] = sets[k % sets.length];
      const prof = [new THREE.Vector2(0.9, -0.6)];
      for (let q = 0; q <= 12; q++) { const v = q / 12; prof.push(new THREE.Vector2(Math.max(0.001, 5.4 * Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * v)), 0.75)), v * 11.5)); }
      const sc = 1.9 + (k % 3) * 0.3;
      const bp = [];
      const G = 12;
      for (let gq = 0; gq < G; gq++) bp.push(E.paint(new THREE.LatheGeometry(prof, 2, (gq / G) * Math.PI * 2, Math.PI * 2 / G), gq % 2 ? cA : cB));
      bp.push(E.paint(new THREE.CylinderGeometry(1.0, 0.9, 1.0, 8).translate(0, -4.2, 0), 0x8a5a3c));
      for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + Math.PI / 4; bp.push(rod(new THREE.Vector3(Math.cos(a) * 0.8, -3.7, Math.sin(a) * 0.8), new THREE.Vector3(Math.cos(a) * 0.9, -0.5, Math.sin(a) * 0.9), 0.05, 0x3d2a2e, 3)); }
      for (const g of bp) {
        g.scale(sc, sc, sc).translate(x * S, y, z * S);
        const n = g.attributes.position.count;
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).map((_, j) => (j % 2 ? 0 : k)), 2));
        parts.push(g);
      }
    });
    const g = keep(mergeGeometries(parts)); parts.forEach((p) => p.dispose());
    computeOutlineNormals(g);
    const m = new THREE.Mesh(g, keep(toonMaterial({ vertexColors: true, vertex: DRIFT, cacheKey: 'balloon' })));
    m.frustumCulled = false; m.name = 'balloons'; root.add(m);
    if (outlines) {
      const o = new THREE.Mesh(g, keep(outlineMaterial({ width: 0.03, vertex: DRIFT, cacheKey: 'balloon', minPixelsAt: 10, maxScale: 14, fadeStart: 380, fadeEnd: 560 })));
      o.frustumCulled = false; root.add(o);
    }
  }

  // ------------------------------------------------------------------ tumbleweeds (animated)
  {
    const twParts = [];
    for (let k = 0; k < 4; k++) twParts.push(E.paint(new THREE.TorusGeometry(0.85, 0.07, 3, 12).rotateX(k * 0.8).rotateY(k * 1.3), k % 2 ? 0xb08850 : 0x9a7444));
    twParts.push(E.paint(new THREE.IcosahedronGeometry(0.6, 0), 0x8a6a3c));
    const twG = keep(E.mergePainted(twParts, 0.5));
    const count = Math.max(4, Math.round(16 * (quality.particles ?? 1)));
    const list = [];
    const wind = 0.6;
    let guard = 0;
    while (list.length < count && guard++ < 4000) {
      const x = L.bounds.minX - 60 + rnd() * (L.bounds.maxX - L.bounds.minX + 120), z = L.bounds.minZ - 60 + rnd() * (L.bounds.maxZ - L.bounds.minZ + 120);
      const a = wind + (rnd() - 0.5) * 0.6, dx = Math.cos(a), dz = Math.sin(a), len = 70 + rnd() * 60;
      let ok = true;
      for (let d = 0; d <= len && ok; d += 4) { const px = x + dx * d, pz = z + dz * d; if (insideMesa(px, pz, 1.5) || gorgeF(px, pz) > 0.05 || washF(px, pz) > 0.1) ok = false; }
      if (!ok) continue;
      // prefer paths that pass near the road so they are seen
      if (!list.length || rnd() < 0.8) { let near = false; for (let d = 0; d <= len; d += 8) { const s = spot(x + dx * d, z + dz * d, 0); if (!s.ok || s.d < 25) { near = true; break; } } if (!near) continue; }
      list.push({ x0: x, z0: z, dx, dz, len, sp: 4 + rnd() * 3, ph: rnd() * 200, r: 1.0 + rnd() * 0.6, x, y: 0, z });
    }
    const tw = E.instanced(ctx, twG, keep(toonMaterial({ vertexColors: true })), list, { cast: true, name: 'tumbleweeds' });
    tw.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3(), axis = new THREE.Vector3();
    updaters.push((dt, t) => {
      list.forEach((w, k) => {
        const along = (t * w.sp + w.ph) % w.len;
        p.set(w.x0 + w.dx * along, 0, w.z0 + w.dz * along);
        const s = w.r * E.smoothstep(0, 5, along) * E.smoothstep(w.len, w.len - 5, along);
        let g = heightAt(p.x, p.z);
        const sp = spot(p.x, p.z, 0);
        if (sp.i >= 0 && sp.d < 4) g = Math.max(g, L.py[sp.i]) + (sp.d > -3 ? 1.6 * Math.max(0, 1 - Math.abs(sp.d - 0.3) / 2.5) : 0);
        p.y = g + s * 0.85 + Math.abs(Math.sin(along * 0.45)) * 1.1;
        axis.set(w.dz, 0, -w.dx);
        q.setFromAxisAngle(axis, along / Math.max(0.3, w.r));
        tw.setMatrixAt(k, m4.compose(p, q, sv.setScalar(Math.max(0.001, s))));
      });
      tw.instanceMatrix.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------------ hazard: boulders rolling down the scree slope across the canyon road
  {
    const bg = new THREE.IcosahedronGeometry(1, 2);
    const bp = bg.attributes.position;
    for (let k = 0; k < bp.count; k++) {
      const x = bp.getX(k), y = bp.getY(k), z = bp.getZ(k);
      const n = 1 + 0.14 * (E.vnoise(x * 2.1 + 5, z * 2.1 + y * 1.3) - 0.5) * 2;
      bp.setXYZ(k, x * n, y * n * 0.94, z * n);
    }
    const cols = [];
    const nonIdx = bg;
    const np = nonIdx.attributes.position;
    for (let k = 0; k < np.count; k += 3) {
      const f = E.hash(k, 7) < 0.18 ? new THREE.Color(C.rock) : E.hash(k, 3) < 0.45 ? new THREE.Color(0xf0a060) : new THREE.Color(C.rockLight);
      for (let j = 0; j < 3; j++) cols.push(f.r, f.g, f.b);
    }
    nonIdx.deleteAttribute('uv');
    nonIdx.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    nonIdx.computeVertexNormals();
    computeOutlineNormals(nonIdx);
    keep(nonIdx);
    const R = 2.8;
    const boulders = lanes.map((ln, k) => ({ ...ln, ph: k * 4.1, x: 0, y: -100, z: 0, s: R }));
    const bm = E.instanced(ctx, nonIdx, keep(toonMaterial({ vertexColors: true })), boulders, { ink: 1, name: 'boulders' });
    bm.frustumCulled = false;
    boulders.forEach(() => hazards.push({ position: new THREE.Vector3(0, -100, 0), radius: R + 0.3, kind: 'tumble', type: 'boulder', active: false }));
    const LAT0 = -84, LAT1 = 40, SPEED = 10.5, PERIOD = 13;
    // sinkhole decals where the boulders vanish on the infield side
    const pitG = new THREE.CircleGeometry(3.6, 18).rotateX(-Math.PI / 2);
    const pits = lanes.map((ln) => { const p = E.frameAt(L, ln.i, LAT1 - 2); return { x: p.x, y: heightAt(p.x, p.z) + 0.08, z: p.z, s: 1 }; });
    E.instanced(ctx, keep(pitG), keep(new THREE.MeshBasicMaterial({ color: 0x3a2228, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), pits, { cast: false, receive: false, name: 'sinkholes' });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3(), axis = new THREE.Vector3();
    updaters.push((dt, t) => {
      boulders.forEach((b, k) => {
        const tt = (t + b.ph) % PERIOD;
        const lat = LAT0 + tt * SPEED;
        const i = b.i;
        const wall = lat >= 0 ? L.wallR[i] : L.wallL[i];
        E.frameAt(L, i, Math.min(lat, LAT1), p);
        let y;
        const al = Math.abs(lat);
        if (al <= wall + 0.4) y = L.py[i] + R;
        else y = Math.max(heightAt(p.x, p.z), L.py[i] - 0.6) + R;
        y += 1.7 * Math.max(0, 1 - ((al - wall - 0.35) / 2.8) ** 2);   // hop the fence
        y += Math.abs(Math.sin(lat * 0.35)) * 0.25;
        let s = R;
        if (lat > LAT1 - 6) { const f = E.smoothstep(LAT1 - 6, LAT1, lat); y -= f * (2 * R + 1); s = R * (1 - 0.5 * f); }
        if (lat > LAT1) s = 0.001;
        p.y = y;
        axis.set(L.tx[i], 0, L.tz[i]).normalize();
        q.setFromAxisAngle(axis, lat / R);
        bm.setMatrixAt(k, m4.compose(p, q, sv.setScalar(s)));
        const hz = hazards[k];
        hz.position.copy(p);
        hz.active = al < wall + 2 && lat <= LAT1;
      });
      bm.instanceMatrix.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------------ warm dust motes in the air
  E.weather(ctx, { type: 'dust', count: 300, area: 90, height: 30, color: 0xffdcb0, size: 0.03, speed: 0.35, wind: [2.2, 0.8] });

  return {
    sunLight: lights.sun,
    heightAt,
    setShadowFocus: lights.setShadowFocus,
    update(dt, t) { for (const u of updaters) u(dt, t); },
    dispose() { lights.dispose(); },
  };
}
