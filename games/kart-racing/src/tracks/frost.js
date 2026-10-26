// Aurora Pines — a snowy pine forest at night under a green/violet aurora, with falling snow. Start/finish runs through a
// log-cabin village, the road sweeps up the east hillside into a snow-bank cutting and a timber-portal tunnel along the
// ridge, drops through a hairpin onto a downhill run where snowballs roll across the road before a jump ramp, swings
// around a lantern-lit S-bend, runs west past the forest and crosses the frozen lake (ice patches!) back to the village.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as E from '../envkit.js';
import { toonMaterial, computeOutlineNormals, TIME } from '../toon.js';
import { texClone } from '../assets.js';

const S = 1;            // layout scale (points are already in metres)
const ICE_Y = 0.5;      // frozen lake surface
const LAKE = { x: -232, z: 60, r: 84 };
const lakeDist = (x, z) => Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.12) + (E.fbm(x * 0.018 + 7, z * 0.018, 2) - 0.5) * 34;
const lakeF = (x, z) => E.smoothstep(LAKE.r + 6, LAKE.r - 12, lakeDist(x, z));

// night palette (PROGRESS.md: snow #EAF2FF / shade #9FB3E6, ice #9EE6FF, warm windows #FFC46B, candy red/cream)
const C = {
  snow: 0xeef4ff, pine: 0x2a6a52, pine2: 0x23594a, bark: 0x5a3a2a, wood: 0x6b4226, woodDark: 0x4a2c1c,
  candy: 0xe2366f, cream: 0xfff4dc, warm: 0xffc46b, amber: 0xffb54a, cyan: 0x9fe8ff, ink: 0x2b1d2e, stone: 0x8a90a8,
};

/** Soft-edged ice sheet for the road ice zones (world-projected texture, moonlit tint, sheen + glints). */
function iceZoneMaterial(map) {
  if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true; }
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMap: { value: null }, uTint: { value: new THREE.Color(0xa8cdf2) }, uHas: { value: map ? 1 : 0 },
    }]),
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uTime, uHas; uniform vec3 uTint; varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_fragment>
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 tex = uHas > 0.5 ? texture2D(uMap, vW.xz * 0.09).rgb : vec3(0.7, 0.9, 1.0);
        vec3 col = tex * uTint * 0.5;
        float streak = smoothstep(0.62, 0.66, vn(vec2(vW.x * 0.06 + vW.z * 0.05, vW.z * 0.25 - vW.x * 0.1)));
        col += vec3(0.55, 0.75, 0.95) * streak * 0.25;
        float sp = step(0.985, vn(vW.xz * 2.1 + floor(uTime * 3.0) * 0.37));
        col += sp * vec3(0.9, 0.97, 1.0);
        float n = vn(vW.xz * 0.35) * 0.6 + vn(vW.xz * 1.1) * 0.4;
        float ex = min(vUv.x, 1.0 - vUv.x) * 9.0, ey = min(vUv.y, 1.0 - vUv.y) * 7.0;
        float e = min(ex, ey) - n * 0.75;
        float a = smoothstep(0.05, 0.25, e);
        float rim = a * (1.0 - smoothstep(0.25, 0.55, e));
        col = mix(col, vec3(0.75, 0.85, 1.0), rim * 0.6);
        gl_FragColor = vec4(col, a * 0.93);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}
function iceMaterial(map) {
  const m = iceZoneMaterial(map);
  m.uniforms.uMap.value = map;
  m.uniforms.uTime = TIME;
  return m;
}

export default {
  id: 'frost',
  name: 'Aurora Pines',
  nameZh: '极光松林',
  music: 'frost',
  scale: S,
  halfWidth: 11.5,
  runoff: 6.5,
  runoffZones: [{ from: 6.8, to: 10.0, runoff: 3.2 }, { from: 25.3, to: 28.7, runoff: 4.5 }],
  points: [
    [-60, 3, 0], [40, 3, 0], [120, 3.5, 4], [185, 5, 30], [215, 8, 90], [222, 12, 160], [210, 16, 230], [170, 19, 280],
    [100, 21, 300], [20, 22, 305], [-55, 22, 298], [-105, 22, 290], [-133, 22, 278], [-145, 22, 250], [-133, 21.5, 222],
    [-105, 21, 210], [-50, 18, 207], [15, 13.5, 210], [95, 9.5, 205], [127, 8.5, 192], [140, 8, 160], [127, 7.5, 128],
    [95, 6.5, 115], [20, 4.5, 115], [-70, 2.5, 118], [-150, 1.1, 105], [-185, 0.9, 90], [-200, 0.9, 55], [-185, 0.9, 20], [-150, 1.7, 3],
  ],
  bridges: [],
  boostPads: [{ at: 4.45, lats: ['race', 'race'] }, { at: 16.95, lats: [-4.5, 4.5], stagger: false }, { at: 23.3, lats: [-6, 0, 6] }],
  ramps: [{ at: 17.3, hw: 10, h: 1.8 }],
  itemRows: [1.3, 5.5, 10.2, 15.4, 22.5, 26.4],
  zones: [
    { type: 'ice', from: 25.55, to: 26.15, lat: -3, hw: 7 },
    { type: 'ice', from: 26.6, to: 27.3, lat: 2.5, hw: 8 },
    { type: 'ice', from: 27.7, to: 28.3, lat: -1, hw: 9 },
  ],
  style: {
    roadTex: 'textures/common/road_frost.webp', roadTint: 0xffffff, roadAlongScale: 24,
    offroadTex: 'textures/common/snow.webp', offroadTint: 0xdfe7ff, offroadScale: 8,
    deckTex: 'textures/common/wood_planks.webp',
    wallTex: 'textures/frost/candy_barrier.webp', wallTint: 0xffffff, wallTexLen: 5.2, wallTop: 0xf2f6ff,
    railTex: 'textures/common/log_wall.webp',
    curbA: '#e2366f', curbB: '#f4f8ff', boostA: '#1fb8ff', boostB: '#b9f6ff', rampA: '#ff8a1e', rampB: '#fff4dc', rampSide: 0xe2366f,
    gantryA: '#fff4dc', gantryB: '#e2366f',
    tires: false,
    lineColor: 0xf4f8ff, dashColor: 0xffd23f, dashAlpha: 0.85,
    zones: { ice: { tex: 'textures/common/ice.webp', material: (t) => iceMaterial(t) } },
  },
  buildEnvironment,
};

// ---------------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------------
/** Extrude a cross-section profile along centreline samples a..b (b may exceed N). profile(i, ii) -> [[lat, dy], ...].
 *  UVs: u = arc length across the profile / uScale, v = distance along / vScale. */
function extrudeRange(L, a, b, profile, { uScale = 8, vScale = 8, step = 1 } = {}) {
  const N = L.N;
  const rings = [];
  for (let ii = a; ii < b; ii += step) rings.push(ii);
  rings.push(b);
  const m = profile(((a % N) + N) % N, a).length;
  const pos = new Float32Array(rings.length * m * 3), uv = new Float32Array(rings.length * m * 2);
  let p = 0, q = 0;
  for (const ii of rings) {
    const i = ((Math.round(ii) % N) + N) % N;
    const prof = profile(i, ii);
    let acc = 0;
    for (let j = 0; j < m; j++) {
      const [lat, dy] = prof[j];
      if (j > 0) acc += Math.hypot(lat - prof[j - 1][0], dy - prof[j - 1][1]);
      pos[p++] = L.px[i] + L.rx[i] * lat; pos[p++] = L.py[i] + dy; pos[p++] = L.pz[i] + L.rz[i] * lat;
      uv[q++] = acc / uScale; uv[q++] = (ii - a) * L.ds / vScale;
    }
  }
  const idx = [];
  for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < m - 1; j++) {
    const A = r * m + j, B = r * m + j + 1, Cc = (r + 1) * m + j, D = (r + 1) * m + j + 1;
    idx.push(A, B, Cc, B, D, Cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Snow-capped pine: stacked cones with white snow caps. */
function pineGeometry(tiers, radial, trunkH = 2.2) {
  const parts = [E.paint(new THREE.CylinderGeometry(0.3, 0.45, trunkH + 0.6, 4, 1, true).translate(0, trunkH / 2 - 0.3, 0), C.bark)];
  let y = trunkH - 0.8, r = 3.1, h = 4.2;
  for (let k = 0; k < tiers; k++) {
    parts.push(E.paint(new THREE.ConeGeometry(r, h, radial).translate(0, y + h / 2, 0), k % 2 ? C.pine : C.pine2));
    parts.push(E.paint(new THREE.ConeGeometry(r * 0.57, h * 0.48, radial, 1, true).translate(0, y + h * 0.76, 0), C.snow));
    y += h * 0.55; r *= 0.72; h *= 0.84;
  }
  return E.mergePainted(parts);
}

/** Radial soft-falloff disc (vertex colours) for additive fake light pools. */
function poolGeometry() {
  const g = new THREE.RingGeometry(0.001, 1, 16, 2).rotateX(-Math.PI / 2);
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    const rr = Math.min(1, Math.hypot(p.getX(k), p.getZ(k)));
    const v = Math.pow(1 - rr, 1.7);
    c[k * 3] = c[k * 3 + 1] = c[k * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------
function buildEnvironment(ctx) {
  const { L, root, keep, quality, hazards } = ctx;
  const N = L.N;
  const rnd = E.mulberry(7331);
  const updaters = [];
  const ink = ctx.inkMat;
  const shadows = quality.shadows !== false, outlines = quality.outlines !== false;
  const wrap = (i) => ((Math.round(i) % N) + N) % N;
  const range = (from, to) => { const a = L.atCP(from); let b = L.atCP(to); if (b <= a) b += N; return [a, b]; };
  const inR = (i, [a, b]) => { i = wrap(i); return (i >= a && i <= b) || (i + N >= a && i + N <= b); };
  const grade = (i) => (L.py[wrap(i + 2)] - L.py[wrap(i - 2)]) / (4 * L.ds);
  const addMesh = (geo, mat, { cast = true, receive = true, name = '', outline = false } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast && shadows; m.receiveShadow = receive; m.name = name; root.add(m);
    if (outline && outlines) { if (!geo.attributes.outlineN) computeOutlineNormals(geo); const o = new THREE.Mesh(geo, ink); o.name = name + ':ink'; root.add(o); }
    return m;
  };
  const tex = (path, rep) => { const t = texClone(path); if (t) { keep(t); if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); } } return t; };

  // feature ranges (sample indices)
  const TUN = range(8.35, 9.2);
  const CUT1 = [L.atCP(6.75), TUN[0]];
  const CUT2 = [TUN[1], L.atCP(9.95) + (L.atCP(9.95) < TUN[1] ? N : 0)];
  const VILLAGE = range(29.35, 1.85);
  const LAKEROAD = range(25.2, 28.8);
  const START = range(29.55, 0.75);
  const SNOWBALLS = range(16.05, 16.75);
  const inCut = (i) => inR(i, CUT1) || inR(i, TUN) || inR(i, CUT2);

  // ------------------------------------------------------------------ sky, moonlight, fog
  const sunDir = new THREE.Vector3(0.8, 0.38, -0.46);
  E.createSky(ctx, { top: 0x101540, horizon: 0x3b2d6b, bottom: 0x1d1a44, sunDir, sunColor: 0xe4ecff, sunSize: 4.5, stars: true, aurora: true, auroraA: 0x59f2b8, auroraB: 0xb46cff });
  const lights = E.setupLights(ctx, {
    sunDir, sunColor: 0xa9c0ff, sunIntensity: 1.25, hemiSky: 0x6f7fd2, hemiGround: 0x2e2856, hemiIntensity: 0.9,
    fog: 0x2a2b64, fogNear: 150, fogFar: 760, rimColor: 0x9fe8ff, rimStrength: 0.6,
  });

  // ------------------------------------------------------------------ height field: smooth blend of road heights + hills
  const CX = (L.bounds.minX + L.bounds.maxX) / 2, CZ = (L.bounds.minZ + L.bounds.maxZ) / 2;
  const TSIZE = 1700;
  const GC = 10, GN = Math.ceil(TSIZE / GC) + 3, gx0 = CX - TSIZE / 2 - GC, gz0 = CZ - TSIZE / 2 - GC;
  const GH = new Float32Array(GN * GN), GD = new Float32Array(GN * GN);
  {
    const sx = [], sy = [], sz = [];
    for (let i = 0; i < N; i += 4) { sx.push(L.px[i]); sy.push(L.py[i]); sz.push(L.pz[i]); }
    const n = sx.length;
    for (let gz = 0; gz < GN; gz++) for (let gx = 0; gx < GN; gx++) {
      const x = gx0 + gx * GC, z = gz0 + gz * GC;
      let sw = 0, sh = 0, md = 1e18;
      for (let k = 0; k < n; k++) {
        const dx = sx[k] - x, dz = sz[k] - z, d2 = dx * dx + dz * dz;
        if (d2 < md) md = d2;
        const w = 1 / ((d2 + 900) * (d2 + 900));
        sw += w; sh += w * sy[k];
      }
      GH[gz * GN + gx] = sh / sw; GD[gz * GN + gx] = Math.sqrt(md);
    }
  }
  const grid = (G, x, z) => {
    const fx = Math.min(GN - 1.001, Math.max(0, (x - gx0) / GC)), fz = Math.min(GN - 1.001, Math.max(0, (z - gz0) / GC));
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
    const a = G[iz * GN + ix], b = G[iz * GN + ix + 1], c = G[(iz + 1) * GN + ix], d = G[(iz + 1) * GN + ix + 1];
    return E.lerp(E.lerp(a, b, u), E.lerp(c, d, u), v);
  };
  function natural(x, z) {
    const base = grid(GH, x, z), d = grid(GD, x, z);
    let h = base - 0.6 + E.smoothstep(24, 130, d) * (2 + 26 * E.fbm(x * 0.007 + 5, z * 0.007, 3));
    const R = Math.hypot(x - CX, (z - CZ) * 1.15);
    h += 26 * E.smoothstep(1.05, 0.3, Math.hypot((x - 55) / 210, (z - 315) / 110));   // ridge the tunnel cuts through
    h += 120 * Math.pow(E.smoothstep(380, 820, R), 1.25) * (0.5 + 0.5 * E.fbm(x * 0.005 + 2, z * 0.005, 3));
    return E.lerp(h, ICE_Y - 2.4, lakeF(x, z));
  }
  const terrain = E.buildTerrain(ctx, {
    size: TSIZE, seg: 165, center: [CX, CZ], natural, corridorWidth: 36,
    tex: ['textures/common/snow.webp', 'textures/common/rock_grey.webp', 'textures/common/snow.webp'], scale: [10, 9, 23],
    weights: (x, y, z, slope) => {
      const rock = E.smoothstep(0.3, 0.48, slope + (E.fbm(x * 0.05, z * 0.05, 2) - 0.5) * 0.25);
      const big = E.fbm(x * 0.01 + 3, z * 0.01, 2);
      return [(1 - rock) * big, rock, (1 - rock) * (1 - big)];
    },
    tint: (x, y, z, slope, near) => {
      const c = new THREE.Color(0xd9e1fb);
      c.lerp(new THREE.Color(0xa9b8ec), E.smoothstep(0.35, 0.75, E.fbm(x * 0.012, z * 0.012, 3)) * 0.55);
      return c;
    },
  });
  const heightAt = terrain.heightAt;

  // ------------------------------------------------------------------ frozen lake
  {
    // fan following the lake outline (so the ice never shows outside the basin)
    const pos = [LAKE.x, ICE_Y, LAKE.z], uv = [LAKE.x / 26, LAKE.z / 26], idx = [];
    const SEG = 96;
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let R = 0;
      for (let r = 0; r < 220; r += 2) if (lakeF(LAKE.x + dx * r, LAKE.z + dz * r) > 0.02) R = r;
      const x = LAKE.x + dx * (R + 5), z = LAKE.z + dz * (R + 5);
      pos.push(x, ICE_Y, z); uv.push(x / 26, z / 26);
      idx.push(0, 1 + ((k + 1) % SEG), 1 + k);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = keep(toonMaterial({ map: tex('textures/frost/lake_ice.webp', 1), color: 0xd2e6ff, emissive: 0x1d4466, rim: false }));
    addMesh(g, m, { cast: false, name: 'frozenLake' });
  }

  const spot = E.makeSpot(L, []);
  const placed = [];              // big props: { x, z, r }
  const free = (x, z, r) => !placed.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < (q.r + r) ** 2);

  // shared batches
  const props = [];               // painted static props (one merged mesh + ink)
  const glowGeos = [];            // painted unlit (MeshBasic vertexColors) glowing bits
  const pools = [];               // { x, y, z, r, tilt, s, color }
  const bulbs = [];               // { x, y, z, color }  string lights / small lamps
  const P = (geo, color) => props.push(E.paint(geo, color));
  const Gl = (geo, color) => glowGeos.push(E.paint(geo, color));

  // ------------------------------------------------------------------ snow-bank cutting + tunnel
  const shellPines = [];
  {
    const snowMat = keep(toonMaterial({ map: tex('textures/common/snow.webp'), color: 0xd6def9 }));
    const rockMat = keep(toonMaterial({ map: tex('textures/common/rock_grey.webp'), color: 0xa4aad6, rim: false }));
    const banks = [];
    const bankProfile = (side, e, bump) => {
      const W = (i) => (side > 0 ? L.wallR[i] : L.wallL[i]);
      return (i) => {
        const w = W(i), f = (v) => E.lerp(-0.7, v, e(i));
        const b = bump(i);
        const pts = [[w + 0.7, f(1.15)], [w + 1.9, f(3.2 + b * 0.5)], [w + 4.2, f(5.4 + b)], [w + 9, f(6.6 + b)], [w + 16, f(4.4 + b * 0.5)], [w + 28, -2.6]];
        return side > 0 ? pts : pts.map(([l, y]) => [-l, y]).reverse();
      };
    };
    const bump = (side) => (i) => 1.6 * (E.fbm(i * 0.035 + (side > 0 ? 0 : 50), 3.3, 2) - 0.3);
    for (const [a, b, fadeIn, fadeOut] of [[CUT1[0], CUT1[1], true, false], [CUT2[0], CUT2[1], false, true]]) {
      const ramp = 35 / L.ds;
      const e = (i) => {
        let ii = i; if (ii < a - 1) ii += N;
        return (fadeIn ? E.smoothstep(a, a + ramp, ii) : 1) * (fadeOut ? E.smoothstep(b, b - ramp, ii) : 1);
      };
      for (const side of [1, -1]) banks.push(extrudeRange(L, a, b, bankProfile(side, e, bump(side)), { uScale: 9, vScale: 9, step: 2 }));
    }
    const bg = keep(mergeGeometries(banks)); banks.forEach((g) => g.dispose());
    addMesh(bg, snowMat, { name: 'snowbanks', cast: true });

    // tunnel: inner rock arch, outer snow shell, portal faces, log portal frames, icicles, ceiling lamps
    const K = 14, ARCH_H = 8.2;
    const archPt = (i, k) => {
      const phi = (k / K) * Math.PI, c = Math.cos(phi);
      const w = (c >= 0 ? L.wallR[i] : L.wallL[i]) + 0.7;
      return [w * c, 1.2 + ARCH_H * Math.sin(phi)];
    };
    // snow dome over the arch that hugs the hillside (never dips below the terrain, so it reads as one hill)
    const shellCache = new Map();
    const shellPt = (i, k) => {
      const key = i * 100 + k;
      if (shellCache.has(key)) return shellCache.get(key);
      const phi = (k / K) * Math.PI, c = Math.cos(phi);
      const w = (c >= 0 ? L.wallR[i] : L.wallL[i]) + 34;
      const lat = w * c, f = Math.abs(c);
      const dome = 12.2 + 1.6 * E.fbm(i * 0.04, c * 2, 2) - 15 * f * f;
      const p = E.frameAt(L, i, lat);
      const res = [lat, Math.max(dome, heightAt(p.x, p.z) - L.py[i] + 0.25)];
      shellCache.set(key, res);
      return res;
    };
    const arch = extrudeRange(L, TUN[0], TUN[1], (i) => Array.from({ length: K + 1 }, (_, k) => archPt(i, k)), { uScale: 7, vScale: 7 });
    const shell = extrudeRange(L, TUN[0], TUN[1], (i) => Array.from({ length: K + 1 }, (_, k) => shellPt(i, K - k)), { uScale: 9, vScale: 9 });
    // portal faces at each end: a stone ring around the arch (rock) + snow from the ring out to the dome, facing out
    const midPt = (i, k) => {
      const phi = (k / K) * Math.PI, c = Math.cos(phi);
      const w = (c >= 0 ? L.wallR[i] : L.wallL[i]) + 3.6;
      return [w * c, 1.2 + (ARCH_H + 2.6) * Math.sin(phi)];
    };
    const strip = (i, dir, inner, outer, uvs) => {
      const pos = [], uv = [];
      const W3 = ([lat, dy]) => [L.px[i] + L.rx[i] * lat, L.py[i] + dy, L.pz[i] + L.rz[i] * lat];
      for (let k = 0; k < K; k++) {
        const a0 = inner(i, k), a1 = inner(i, k + 1), s0 = outer(i, k), s1 = outer(i, k + 1);
        for (const v of [a0, s0, a1, a1, s0, s1]) { pos.push(...W3(v)); uv.push(v[0] / uvs, v[1] / uvs); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      // orient so the face looks out of the tunnel (flip winding if needed)
      const va = new THREE.Vector3(...pos.slice(0, 3)), vb = new THREE.Vector3(...pos.slice(3, 6)), vc = new THREE.Vector3(...pos.slice(6, 9));
      const nrm = vb.clone().sub(va).cross(vc.clone().sub(va));
      if (Math.sign(nrm.x * L.tx[i] + nrm.z * L.tz[i]) !== dir) {
        const pa = g.attributes.position.array, ua = g.attributes.uv.array;
        for (let t = 0; t < pa.length / 9; t++) {
          for (let c = 0; c < 3; c++) { const tmp = pa[t * 9 + 3 + c]; pa[t * 9 + 3 + c] = pa[t * 9 + 6 + c]; pa[t * 9 + 6 + c] = tmp; }
          for (let c = 0; c < 2; c++) { const tmp = ua[t * 6 + 2 + c]; ua[t * 6 + 2 + c] = ua[t * 6 + 4 + c]; ua[t * 6 + 4 + c] = tmp; }
        }
      }
      g.computeVertexNormals();
      return g;
    };
    const faces = [], snowFaces = [];
    for (const [end, dir] of [[TUN[0], -1], [TUN[1], 1]]) {
      const i = wrap(end);
      const W3 = ([lat, dy]) => [L.px[i] + L.rx[i] * lat, L.py[i] + dy, L.pz[i] + L.rz[i] * lat];
      faces.push(strip(i, dir, archPt, midPt, 4));
      snowFaces.push(strip(i, dir, midPt, shellPt, 9));
      // log portal frame along the arch opening + icicles + a lantern each side
      const pts = [];
      for (let k = 0; k <= K; k++) { const [lat, dy] = archPt(i, k); const w = W3([lat * 1.04, dy + 0.25]); pts.push(new THREE.Vector3(w[0] + L.tx[i] * dir * 0.4, w[1], w[2] + L.tz[i] * dir * 0.4)); }
      pts.unshift(pts[0].clone().setY(L.py[i] - 0.5)); pts.push(pts[pts.length - 1].clone().setY(L.py[i] - 0.5));
      P(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.75, 7, false), C.wood);
      for (let k = 3; k <= K - 3; k++) {
        const [lat, dy] = archPt(i, k + 0.5);
        const w = W3([lat, dy - 0.2]);
        const len = 0.8 + rnd() * 1.2;
        Gl(new THREE.ConeGeometry(0.22, len, 5).rotateX(Math.PI).translate(w[0] + L.tx[i] * dir * 0.7, w[1] - len / 2, w[2] + L.tz[i] * dir * 0.7), 0xbfeaff);
      }
      placed.push({ x: L.px[i], z: L.pz[i], r: 30 });
    }
    const fg = keep(mergeGeometries([arch.toNonIndexed(), ...faces]));
    arch.dispose(); faces.forEach((g) => g.dispose());
    addMesh(fg, rockMat, { name: 'tunnelArch', cast: true });
    const sg = keep(mergeGeometries([shell.toNonIndexed(), ...snowFaces])); shell.dispose(); snowFaces.forEach((g) => g.dispose());
    addMesh(sg, keep(toonMaterial({ map: tex('textures/common/snow.webp'), color: 0xd3dcf8 })), { name: 'tunnelShell', cast: true });
    // a few pines growing on top of the tunnel hill
    for (let ii = TUN[0] + 6 / L.ds; ii < TUN[1] - 6 / L.ds; ii += 7 / L.ds) {
      const i = wrap(ii);
      for (const side of [1, -1]) {
        if (rnd() < 0.35) continue;
        const k = 2 + rnd() * 3.5, kk = side > 0 ? k : K - k;
        const [lat, dy] = shellPt(i, K - kk);
        const p = E.frameAt(L, i, lat);
        shellPines.push({ x: p.x, y: L.py[i] + dy - 0.6, z: p.z, r: rnd() * 6.28, s: 0.6 + rnd() * 0.5 });
      }
    }
    // ceiling lamps + light pools inside the tunnel
    for (let ii = TUN[0] + Math.round(8 / L.ds); ii < TUN[1] - 4 / L.ds; ii += Math.round(13 / L.ds)) {
      const i = wrap(ii);
      const y = L.py[i] + 1.2 + ARCH_H - 0.35;
      Gl(new THREE.BoxGeometry(4.5, 0.25, 0.9).rotateY(L.head[i]).translate(L.px[i], y, L.pz[i]), 0xffd890);
      pools.push({ x: L.px[i], y: L.py[i] + 0.07, z: L.pz[i], r: L.head[i], tilt: -Math.atan(grade(i)), s: 8, color: 0x9a6a30 });
    }
  }

  // ------------------------------------------------------------------ village: log cabins along the start straight
  {
    const atlas = tex('textures/frost/cabin_atlas.webp');
    const glow = tex('textures/frost/cabin_glow.webp');
    const wallMat = keep(toonMaterial({ map: atlas, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 1.6 }));
    const roofMat = keep(toonMaterial({ map: tex('textures/common/snow.webp'), color: 0xf2f6ff }));
    const walls = [], roofs = [];
    const lights = [0xffc46b, 0xe2366f, 0x7ff5e6, 0xffd23f, 0x9fe8ff];
    const addCabin = (x, z, yaw, variant, big = false) => {
      const w = big ? 9 : 7.6, d = 7.5 + rnd(), h = big ? 5.4 : 4.4, rh = 3.2;
      const cs = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([a, b]) => heightAt(x + Math.cos(yaw) * a + Math.sin(yaw) * b, z - Math.sin(yaw) * a + Math.cos(yaw) * b));
      const y0 = Math.min(...cs) - 0.2;
      const xf = (g) => g.rotateY(yaw).translate(x, y0, z);
      const g = new THREE.BoxGeometry(w, h + 1, d);
      const uv = g.attributes.uv;
      const u0 = variant ? 0.5 : 0;
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const ix = f * 4 + k, u = uv.getX(ix), v = uv.getY(ix);
        if (f === 4 || f === 5) uv.setXY(ix, u0 + 0.01 + u * 0.48, 0.5 + 0.02 + v * 0.47);
        else uv.setXY(ix, 0.02 + u * 0.55, 0.02 + v * 0.4);
      }
      walls.push(xf(g.translate(0, (h + 1) / 2 - 1, 0)));
      // gable (logs)
      const gab = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh)]), { depth: d, bevelEnabled: false });
      gab.translate(0, h, -d / 2);
      const gp = gab.attributes.position, guv = gab.attributes.uv;
      for (let k = 0; k < gp.count; k++) guv.setXY(k, 0.05 + ((gp.getX(k) + w / 2) / w) * 0.5, 0.05 + ((gp.getY(k) - h) / rh) * 0.25);
      walls.push(xf(gab));
      // snowy roof slabs + dark fascia
      const a = Math.atan2(rh, w / 2), sl = Math.hypot(w / 2, rh) + 1.0;
      for (const s of [1, -1]) {
        const cx = s * Math.cos(a) * (sl / 2 - 0.5), cy = h + rh - Math.sin(a) * (sl / 2 - 0.5);
        roofs.push(xf(new THREE.BoxGeometry(sl, 0.7, d + 1.6).translate(0, 0.35, 0).rotateZ(-s * a).translate(cx, cy + 0.05, 0)));
        P(xf(new THREE.BoxGeometry(sl + 0.1, 0.25, d + 1.7).rotateZ(-s * a).translate(cx, cy - 0.1, 0)), C.woodDark);
      }
      // chimney
      P(xf(new THREE.BoxGeometry(1.1, 3.2, 1.1).translate(w * 0.22, h + rh * 0.6 + 0.6, -d * 0.2)), C.stone);
      P(xf(new THREE.BoxGeometry(1.4, 0.45, 1.4).translate(w * 0.22, h + rh * 0.6 + 2.3, -d * 0.2)), C.snow);
      // string lights along the front gable eaves
      const fz = d / 2 + 0.85;
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, lx = (t - 0.5) * (w + 1.2), ly = h + rh - Math.abs(t - 0.5) * 2 * (rh + 0.5) - 0.1;
        const v = new THREE.Vector3(lx, ly, fz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        bulbs.push({ x: x + v.x, y: y0 + v.y, z: z + v.z, color: lights[k % lights.length] });
      }
      // warm window light spilling onto the snow
      const fx = Math.sin(yaw), fzz = Math.cos(yaw);
      pools.push({ x: x + fx * (d / 2 + 2.6), y: heightAt(x + fx * (d / 2 + 2.6), z + fzz * (d / 2 + 2.6)) + 0.12, z: z + fzz * (d / 2 + 2.6), r: yaw, s: 4.2, sx: 1.7, color: 0xffa040 });
      placed.push({ x, z, r: Math.max(w, d) * 0.75 });
    };
    const step = Math.round(15 / L.ds);
    let n = 0;
    for (let ii = VILLAGE[0]; ii <= VILLAGE[1]; ii += step) {
      const i = wrap(ii);
      for (const side of [1, -1]) {
        if (side < 0 && inR(i, START)) continue;           // grandstand side at the start
        for (let row = 0; row < (side > 0 ? 2 : 1); row++) {
          const wall = side > 0 ? L.wallR[i] : L.wallL[i];
          const lat = side * (wall + 8.5 + row * 17 + rnd() * 2);
          const p = E.frameAt(L, i, lat);
          if (!spot(p.x, p.z, 6).ok || !free(p.x, p.z, 5.5) || lakeF(p.x, p.z) > 0.01) continue;
          const yaw = Math.atan2(-side * L.rx[i], -side * L.rz[i]) + (rnd() - 0.5) * 0.15;
          addCabin(p.x, p.z, yaw, (n++) % 2, row === 1 && rnd() < 0.5);
        }
      }
    }
    // a few cabins on the lake shore and by the S-bend
    for (const [cp, side, dist] of [[24.4, 1, 14], [24.8, -1, 12], [21.0, -1, 12], [22.2, 1, 10], [19.6, -1, 12], [2.6, 1, 10]]) {
      const i = L.atCP(cp), wall = side > 0 ? L.wallR[i] : L.wallL[i];
      const p = E.frameAt(L, i, side * (wall + dist));
      if (!spot(p.x, p.z, 6).ok || !free(p.x, p.z, 6) || lakeF(p.x, p.z) > 0.01) continue;
      addCabin(p.x, p.z, Math.atan2(-side * L.rx[i], -side * L.rz[i]), (n++) % 2);
    }
    const wg = keep(mergeGeometries(walls.map((g) => (g.index ? g.toNonIndexed() : g)))); walls.forEach((g) => g.dispose());
    computeOutlineNormals(wg);
    addMesh(wg, wallMat, { name: 'cabins', outline: true });
    const rg = keep(mergeGeometries(roofs.map((g) => (g.index ? g.toNonIndexed() : g)))); roofs.forEach((g) => g.dispose());
    computeOutlineNormals(rg);
    addMesh(rg, roofMat, { name: 'cabinRoofs', outline: true });
  }

  // ------------------------------------------------------------------ grandstand + critter crowd at the start
  {
    const spots = [];
    for (let ii = START[0]; ii < START[1]; ii += Math.round(1.6 / L.ds)) {
      const i = wrap(ii);
      const wall = L.wallL[i];
      for (let tier = 0; tier < 4; tier++) {
        const p = E.frameAt(L, i, -(wall + 2.6 + tier * 1.4));
        const y = L.py[i] + tier * 0.75;
        if ((ii - START[0]) % Math.round(8 / L.ds) === 0) {
          P(new THREE.BoxGeometry(8.4, y - L.py[i] + 1.8, 1.45).rotateY(L.head[i]).translate(p.x, L.py[i] + (y - L.py[i] + 1.8) / 2 - 1.2, p.z), tier % 2 ? C.wood : 0x7a5034);
          P(new THREE.BoxGeometry(8.5, 0.18, 1.5).rotateY(L.head[i]).translate(p.x, y + 0.66, p.z), C.snow);
        }
        if (rnd() < 0.62) spots.push({ x: p.x + (rnd() - 0.5) * 0.3, y: y + 0.6, z: p.z + (rnd() - 0.5) * 0.3, r: Math.atan2(L.rx[i], L.rz[i]) + (rnd() - 0.5) * 0.5, s: 0.95 + rnd() * 0.2 });
      }
      placed.push({ x: E.frameAt(L, i, -(wall + 5)).x, z: E.frameAt(L, i, -(wall + 5)).z, r: 5 });
    }
    E.crowd(ctx, spots, {
      palette: [0xf0b46a, 0x8a5a3c, 0xaab4bf, 0xfbfbf7, 0x5a5a66, 0xffa6c9, 0xe9c46a, 0x9fb3e6, 0xd8834a],
      shirts: [0xe2366f, 0x19b5a5, 0xffd23f, 0x6b4bc4, 0x3a7bd5, 0xf4f8ff, 0x2a9d6a],
    });
  }

  // ------------------------------------------------------------------ lamp posts with light pools, string lights, candy poles
  {
    const lampSpots = [];
    const addLamp = (i, side) => {
      const wall = side > 0 ? L.wallR[i] : L.wallL[i];
      const p = E.frameAt(L, i, side * (wall + 2.4));
      const dx = -side * L.rx[i], dz = -side * L.rz[i];       // toward the road
      const yaw = Math.atan2(-dz, dx);
      lampSpots.push({ x: p.x, y: L.py[i], z: p.z, r: yaw });
      const lx = p.x + dx * 3.6, lz = p.z + dz * 3.6;
      const lat = side * (wall + 2.4 - 3.6);
      const reach = Math.min(7.5, wall - Math.abs(lat) + 5.5);
      const c = E.frameAt(L, i, side * Math.max(2, Math.abs(lat) - reach * 0.55));
      pools.push({ x: c.x, y: L.py[i] + 0.07, z: c.z, r: L.head[i], tilt: -Math.atan(grade(i)), s: reach, color: 0xffb04a });
      bulbs.push({ x: lx, y: L.py[i] + 6.3, z: lz, color: 0xffd27a, big: true });
      return p;
    };
    let k = 0;
    const villageLamps = [];
    for (let ii = 0; ii < N; ii += Math.round(16 / L.ds)) {
      const i = ii;
      if (inR(i, TUN) || inR(i, CUT1) || inR(i, CUT2)) continue;
      const vil = inR(i, VILLAGE);
      if (!vil && (ii / Math.round(16 / L.ds)) % 2) continue;              // every 32 m outside the village
      const side = vil ? 1 : ((k++ % 2) ? 1 : -1);
      if (vil) {
        const a = addLamp(i, 1);
        if (!inR(i, START)) { const b = addLamp(i, -1); villageLamps.push([a, b, i]); }
      } else addLamp(i, side);
    }
    // post: pole + arm toward the road (+x local) + hanging lantern frame
    const postG = keep(E.mergePainted([
      E.paint(new THREE.CylinderGeometry(0.13, 0.2, 13, 6).translate(0, 0.5, 0), C.ink),
      E.paint(new THREE.CylinderGeometry(0.08, 0.08, 3.8, 5).rotateZ(Math.PI / 2).translate(1.8, 6.9, 0), C.ink),
      E.paint(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 4).translate(3.6, 6.85, 0), C.ink),
      E.paint(new THREE.ConeGeometry(0.55, 0.45, 6).translate(3.6, 6.7, 0), C.ink),
      E.paint(new THREE.CylinderGeometry(0.3, 0.22, 0.15, 6).translate(3.6, 5.9, 0), C.ink),
      E.paint(new THREE.SphereGeometry(0.4, 6, 4).scale(1, 0.4, 1).translate(0, 7.05, 0), C.snow),
      E.paint(new THREE.ConeGeometry(0.42, 0.18, 6).translate(3.6, 6.98, 0), C.snow),
    ]));
    E.instanced(ctx, postG, keep(toonMaterial({ vertexColors: true })), lampSpots, { name: 'lampPosts', keepAll: true, cast: true });
    // string lights across the village street between facing lamps
    const lines = [];
    villageLamps.forEach(([a, b, i], n) => {
      const A = a.clone().setY(L.py[i] + 7.2), B = b.clone().setY(L.py[i] + 7.2);
      if (n % 2 === 0) lines.push({ a: A, b: B, sag: 1.4 });
      const cnt = 16;
      for (let q = 1; q < cnt; q++) {
        const t = q / cnt, v = new THREE.Vector3().lerpVectors(A, B, t); v.y -= Math.sin(t * Math.PI) * 1.4 + 0.25;
        if (n % 2 === 1) bulbs.push({ x: v.x, y: v.y, z: v.z, color: [0xffc46b, 0xe2366f, 0x7ff5e6, 0xffd23f][q % 4] });
      }
    });
    E.bunting(ctx, lines, { colors: [0xe2366f, 0xf4f8ff, 0x2a9d6a, 0xffd23f, 0x6b4bc4, 0x7ff5e6] });

    // candy-striped marker poles with glowing reflector caps on the barriers
    const poles = [], caps = [];
    const tight = (side) => { const t = new Uint8Array(N); for (let i = 0; i < N; i++) { const outer = side > 0 ? L.kS[i] > 1 / 55 : L.kS[i] < -1 / 55; if (outer) for (let q = -20; q <= 20; q++) t[wrap(i + q)] = 1; } return t; };
    const tR = tight(1), tL = tight(-1);
    for (let i = 0; i < N; i += Math.round(10 / L.ds)) {
      if (inR(i, TUN)) continue;
      for (const side of [1, -1]) {
        if ((side > 0 ? tR : tL)[i]) continue;
        const wall = side > 0 ? L.wallR[i] : L.wallL[i];
        const p = E.frameAt(L, i, side * (wall + 0.35));
        poles.push({ x: p.x, y: L.py[i] + 1.2, z: p.z, r: rnd() * 6 });
        caps.push({ x: p.x, y: L.py[i] + 2.7, z: p.z, color: side > 0 ? 0xff6f91 : 0x9fe8ff });
      }
    }
    // one open cylinder, 5 bands coloured per triangle (red/cream)
    const pg = new THREE.CylinderGeometry(0.13, 0.13, 1.5, 5, 5, true).translate(0, 0.75, 0).toNonIndexed();
    { const pp = pg.attributes.position, col = new Float32Array(pp.count * 3), cr = new THREE.Color(C.candy), cc = new THREE.Color(C.cream);
      for (let t = 0; t < pp.count; t += 3) { const yc = (pp.getY(t) + pp.getY(t + 1) + pp.getY(t + 2)) / 3; const c = Math.floor(yc / 0.3) % 2 ? cc : cr; for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (t + v) * 3); }
      pg.setAttribute('color', new THREE.BufferAttribute(col, 3)); pg.deleteAttribute('uv'); pg.computeVertexNormals(); }
    E.instanced(ctx, keep(pg), keep(toonMaterial({ vertexColors: true, rim: false })), poles, { name: 'candyPoles', keepAll: true, cast: false });
    E.instanced(ctx, keep(new THREE.IcosahedronGeometry(0.26, 0)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })), caps, { name: 'reflectors', keepAll: true, cast: false, receive: false });
  }

  // ------------------------------------------------------------------ chevron boards on the outside of the big turns
  {
    const chev = tex('textures/frost/chevron.webp');
    const mat = keep(toonMaterial({ map: chev, emissiveMap: chev, emissive: 0x777777, rim: false }));
    const boards = [];
    for (const [from, to] of [[11.2, 14.6], [18.4, 22.2], [25.6, 28.6], [2.8, 3.8]]) {
      const [a, b] = range(from, to);
      for (let ii = a; ii < b; ii += Math.round(13 / L.ds)) {
        const i = wrap(ii);
        if (Math.abs(L.kS[i]) < 1 / 70) continue;
        const side = L.kS[i] < 0 ? -1 : 1;           // kS < 0 = right turn -> outside is the left
        const wall = side > 0 ? L.wallR[i] : L.wallL[i];
        const p = E.frameAt(L, i, side * (wall + 2.1));
        const yaw = Math.atan2(-side * L.rx[i], -side * L.rz[i]);
        const g = new THREE.PlaneGeometry(4.4, 2.2);
        // arrows (pointing +u) should point along the travel direction
        const ux = Math.cos(yaw), uz = -Math.sin(yaw);
        if (ux * L.tx[i] + uz * L.tz[i] < 0) { const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k)); }
        boards.push(g.rotateY(yaw).translate(p.x, L.py[i] + 2.6, p.z));
        P(new THREE.BoxGeometry(4.6, 2.4, 0.15).rotateY(yaw).translate(p.x - Math.sin(yaw) * 0.1, L.py[i] + 2.6, p.z - Math.cos(yaw) * 0.1), C.ink);
        for (const sx of [-1.6, 1.6]) P(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 5).translate(p.x + ux * sx, L.py[i] + 0.9, p.z + uz * sx), C.ink);
      }
    }
    if (boards.length) { const g = keep(mergeGeometries(boards)); boards.forEach((b) => b.dispose()); addMesh(g, mat, { name: 'chevrons', cast: false }); }
  }

  // ------------------------------------------------------------------ banners + flags at the start
  {
    const banners = ['textures/ui/banner_zoomies.webp', 'textures/ui/banner_fizz.webp', 'textures/ui/banner_acorn.webp', 'textures/ui/banner_paw.webp'];
    const bspots = [];
    [[0.6, 1], [5.2, -1], [15.6, 1], [22.8, -1], [23.8, 1], [29.0, 1]].forEach(([cp, side], k) => bspots.push({ i: L.atCP(cp), side, tex: banners[k % banners.length] }));
    E.bannerBoards(ctx, bspots);
    const flagSpots = [];
    for (let k = -3; k <= 3; k++) {
      const i = wrap(k * Math.round(13 / L.ds));
      const p = E.frameAt(L, i, L.wallR[i] + 1.5);
      flagSpots.push({ x: p.x, y: L.py[i] - 0.5, z: p.z, r: L.head[i] + Math.PI / 2, color: [0xe2366f, 0x2a9d6a, 0xffd23f, 0x6b4bc4][(k + 8) % 4] });
    }
    E.flags(ctx, flagSpots);
  }

  // ------------------------------------------------------------------ ice-fishing huts on the lake, snowmen, rocks
  {
    let huts = 0;
    for (let g = 0; g < 400 && huts < 4; g++) {
      const x = LAKE.x - 70 + rnd() * 120, z = LAKE.z - 70 + rnd() * 140;
      if (lakeF(x, z) < 0.99 || !spot(x, z, 14).ok || !free(x, z, 8)) continue;
      const yaw = rnd() * 6.28, col = [C.candy, 0x19b5a5, 0xffd23f, 0x6b4bc4][huts++];
      const xf = (geo) => geo.rotateY(yaw).translate(x, ICE_Y, z);
      P(xf(new THREE.BoxGeometry(3.2, 2.6, 2.6).translate(0, 1.3, 0)), col);
      P(xf(new THREE.ConeGeometry(2.6, 1.4, 4).rotateY(Math.PI / 4).scale(1.05, 1, 0.85).translate(0, 3.3, 0)), C.snow);
      Gl(xf(new THREE.PlaneGeometry(0.9, 0.8).translate(0, 1.6, 1.31)), C.warm);
      pools.push({ x: x + Math.sin(yaw) * 2.6, y: ICE_Y + 0.05, z: z + Math.cos(yaw) * 2.6, r: yaw, s: 3, color: 0xff9a40 });
      placed.push({ x, z, r: 4 });
    }
    // snowmen
    const smG = keep(E.mergePainted([
      E.paint(new THREE.SphereGeometry(1.0, 10, 7).translate(0, 0.85, 0), C.snow),
      E.paint(new THREE.SphereGeometry(0.72, 10, 7).translate(0, 2.2, 0), C.snow),
      E.paint(new THREE.SphereGeometry(0.52, 9, 6).translate(0, 3.25, 0), C.snow),
      E.paint(new THREE.ConeGeometry(0.1, 0.55, 6).rotateX(Math.PI / 2).translate(0, 3.25, 0.72), 0xff8a1e),
      E.paint(new THREE.SphereGeometry(0.07, 5, 4).translate(0.17, 3.4, 0.46), C.ink),
      E.paint(new THREE.SphereGeometry(0.07, 5, 4).translate(-0.17, 3.4, 0.46), C.ink),
      E.paint(new THREE.SphereGeometry(0.08, 5, 4).translate(0, 2.35, 0.7), C.ink),
      E.paint(new THREE.SphereGeometry(0.08, 5, 4).translate(0, 2.0, 0.71), C.ink),
      E.paint(new THREE.TorusGeometry(0.5, 0.13, 5, 10).rotateX(Math.PI / 2).translate(0, 2.8, 0), C.candy),
      E.paint(new THREE.BoxGeometry(0.22, 0.75, 0.08).translate(0.3, 2.45, 0.5).rotateZ(0.2), C.candy),
      E.paint(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.05, 1).translate(0, 3.48, 0), C.candy),
      E.paint(new THREE.TorusGeometry(0.47, 0.1, 4, 10).rotateX(Math.PI / 2).translate(0, 3.5, 0), C.cream),
      E.paint(new THREE.SphereGeometry(0.16, 6, 5).translate(0, 4.05, 0), C.cream),
      E.paint(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 4).rotateZ(1.0).translate(1.1, 2.45, 0), C.bark),
      E.paint(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 4).rotateZ(-1.1).translate(-1.1, 2.5, 0), C.bark),
    ]));
    const snowmen = [];
    for (const [cp, side, d] of [[0.4, 1, 4], [1.6, -1, 4], [29.6, 1, 5], [12.6, -1, 4], [13.6, -1, 5], [3.3, -1, 4], [17.8, 1, 5], [20.3, -1, 4], [23.2, 1, 4], [26.0, 1, 7], [27.6, 1, 6], [6.2, 1, 4], [10.4, -1, 4], [19.0, -1, 4]]) {
      const i = L.atCP(cp), wall = side > 0 ? L.wallR[i] : L.wallL[i];
      const p = E.frameAt(L, i, side * (wall + d));
      if (!free(p.x, p.z, 1.5)) continue;
      const y = lakeF(p.x, p.z) > 0.6 ? Math.max(ICE_Y, heightAt(p.x, p.z)) : heightAt(p.x, p.z);
      snowmen.push({ x: p.x, y: y - 0.15, z: p.z, r: Math.atan2(-side * L.rx[i], -side * L.rz[i]) + (rnd() - 0.5) * 0.6, s: 0.9 + rnd() * 0.3 });
      placed.push({ x: p.x, z: p.z, r: 1.6 });
    }
    E.instanced(ctx, smG, keep(toonMaterial({ vertexColors: true })), snowmen, { ink: 1, name: 'snowmen' });
    // boulders poking out of the snow
    const rockG = keep(E.mergePainted([
      E.paint(new THREE.DodecahedronGeometry(1.2, 0).scale(1.3, 0.8, 1.1), 0x7d84a0),
      E.paint(new THREE.DodecahedronGeometry(1.0, 0).scale(1.25, 0.35, 1.05).translate(0, 0.55, 0), C.snow),
    ]));
    const rocks = [];
    for (let g = 0; g < 3000 && rocks.length < 90; g++) {
      const x = CX - 420 + rnd() * 840, z = CZ - 360 + rnd() * 720;
      const s = spot(x, z, 3);
      if (!s.ok || s.d > 120 || lakeF(x, z) > 0.05 || !free(x, z, 3)) continue;
      if (s.i >= 0 && inCut(s.i) && s.d < 30) continue;
      rocks.push({ x, y: heightAt(x, z) - 0.25, z, r: rnd() * 6.28, s: 0.7 + rnd() * 1.4 });
    }
    E.instanced(ctx, rockG, keep(toonMaterial({ vertexColors: true })), rocks, { ink: 1, name: 'rocks', cast: false });
  }

  // ------------------------------------------------------------------ pine forest (near: shadows + ink, far: cheap)
  {
    const near = [], far = [];
    for (let g = 0; g < 90000 && (near.length < 460 || far.length < 1050); g++) {
      const x = CX - 700 + rnd() * 1400, z = CZ - 620 + rnd() * 1240;
      if (lakeF(x, z) > 0.02) continue;
      const s = spot(x, z, 4.5);
      if (!s.ok) continue;
      if (s.i >= 0 && inCut(s.i) && s.d < 32) continue;
      if (s.i >= 0 && inR(s.i, VILLAGE) && s.d < 34 && E.hash(x | 0, z | 0) < 0.8) continue;
      if (!free(x, z, 3)) continue;
      const clump = E.fbm(x * 0.012 + 9, z * 0.012, 2);
      if (clump < 0.36 || (clump < 0.46 && rnd() < 0.5)) continue;
      const y = heightAt(x, z);
      const it = { x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.75 + rnd() * 0.75 + (s.d > 80 ? 0.4 : 0) };
      if (s.d < 70) { if (near.length < 460) near.push(it); } else if (far.length < 1050) far.push(it);
    }
    near.push(...shellPines);
    const mat = keep(toonMaterial({ vertexColors: true }));
    // split into quadrants so frustum culling can skip the forest behind the camera
    const quad = (list) => [0, 1, 2, 3].map((q) => list.filter((it) => ((it.x > CX) ? 1 : 0) + ((it.z > CZ) ? 2 : 0) === q));
    const gN = keep(pineGeometry(3, 7)), gF = keep(pineGeometry(3, 5));
    quad(near).forEach((l, q) => l.length && E.instanced(ctx, gN, mat, l, { ink: 1, name: 'pinesNear' + q, cast: true }));
    quad(far).forEach((l, q) => l.length && E.instanced(ctx, gF, mat, l, { ink: 1, name: 'pinesFar' + q, cast: false }));
  }

  // ------------------------------------------------------------------ merged static props + glow bits + light pools + bulbs
  if (props.length) addMesh(keep(E.mergePainted(props)), keep(toonMaterial({ vertexColors: true })), { name: 'props', outline: true });
  if (glowGeos.length) {
    const g = keep(mergeGeometries(glowGeos)); glowGeos.forEach((x) => x.dispose());
    addMesh(g, keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), { name: 'glow', cast: false, receive: false });
  }
  E.instanced(ctx, keep(poolGeometry()), keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })), pools, { name: 'lightPools', keepAll: true, cast: false, receive: false });
  E.instanced(ctx, keep(new THREE.OctahedronGeometry(0.22, 0)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })), bulbs.map((b) => ({ ...b, s: b.big ? 2.3 : 1 })), { name: 'bulbs', keepAll: true, cast: false, receive: false });

  // ------------------------------------------------------------------ hazard: snowballs rolling down the hillside across the road
  {
    const ballR = 1.7;
    const ballG = keep(E.mergePainted([
      E.paint(new THREE.IcosahedronGeometry(1, 2), C.snow),
      E.paint(new THREE.IcosahedronGeometry(0.35, 0).translate(0.75, 0.55, 0.2), 0xdbe5ff),
      E.paint(new THREE.IcosahedronGeometry(0.3, 0).translate(-0.6, -0.4, 0.6), 0xdbe5ff),
    ]));
    const balls = [];
    const count = 4;
    for (let k = 0; k < count; k++) {
      const i = wrap(SNOWBALLS[0] + (SNOWBALLS[1] - SNOWBALLS[0]) * (k + 0.5) / count);
      const pr = E.frameAt(L, i, 30), pl = E.frameAt(L, i, -30);
      const up = heightAt(pr.x, pr.z) > heightAt(pl.x, pl.z) ? 1 : -1;
      balls.push({ i, up, ph: k / count + rnd() * 0.1, per: 6.5 + rnd() * 1.5, x: 0, y: 0, z: 0, s: ballR });
      hazards.push({ position: new THREE.Vector3(), radius: ballR + 0.2, kind: 'spin', type: 'snowball', active: false });
    }
    const h0 = hazards.length - count;
    const mesh = E.instanced(ctx, ballG, keep(toonMaterial({ vertexColors: true })), balls, { ink: 1, name: 'snowballs' });
    mesh.frustumCulled = false; mesh.children.forEach((c) => { c.frustumCulled = false; });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), axis = new THREE.Vector3();
    updaters.push((dt, t) => {
      balls.forEach((b, k) => {
        const i = b.i, wall = Math.max(L.wallR[i], L.wallL[i]);
        const A = wall + 26;
        const f = ((t / b.per + b.ph) % 1 + 1) % 1;
        const lat = b.up * (A - 2 * A * f);
        E.frameAt(L, i, lat, p);
        const al = Math.abs(lat);
        let y = al < wall ? L.py[i] : Math.max(heightAt(p.x, p.z), L.py[i] - 0.6);
        const hop = al > wall - 2.5 && al < wall + 3.5 ? Math.sin(Math.PI * (al - (wall - 2.5)) / 6) * 2.0 : 0;
        const grow = E.smoothstep(0, 0.08, f) * E.smoothstep(1, 0.9, f);
        const r = ballR * (0.3 + 0.7 * grow);
        p.y = y + r + hop;
        axis.set(L.tx[i], 0, L.tz[i]).normalize();
        q.setFromAxisAngle(axis, b.up * 2 * A * f / ballR);
        mesh.setMatrixAt(k, m4.compose(p, q, sc.setScalar(r)));
        const hz = hazards[h0 + k];
        hz.position.copy(p);
        hz.active = al < L.halfWidth + 2 && grow > 0.5;
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------------ falling snow
  E.weather(ctx, { type: 'snow', count: 3200, area: 95, height: 46, color: 0xeaf2ff, size: 0.13, speed: 2.4, wind: [1.1, 0.6] });

  return {
    sunLight: lights.sun,
    heightAt,
    setShadowFocus: lights.setShadowFocus,
    update(dt, t) { for (const u of updaters) u(dt, t); },
    dispose() { lights.dispose(); },
  };
}
