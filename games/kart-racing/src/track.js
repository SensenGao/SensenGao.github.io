// Data-driven track builder. createTrack(scene, renderer, def, opts) -> Track (see ARCHITECTURE.md §1).
// A track definition (src/tracks/*.js) gives control points, features (boost pads, ramps, item rows, bridges,
// surface zones), a visual style and an environment builder. This file builds the road, curbs, run-off, barriers,
// pads, ramps, start gantry, and the physics/AI queries (surface info, walls, racing line).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bus } from './events.js';
import * as TX from './track-textures.js';
import { texClone } from './assets.js';
import { toonMaterial, outlineMaterial, computeOutlineNormals } from './toon.js';

const N = 2000;                 // centerline samples
const GRID_CELL = 40;

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function smoothCircular(arr, radius, passes = 1) {
  let src = Float32Array.from(arr);
  const n = src.length;
  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(n);
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[(k + n) % n];
    const w = 2 * radius + 1;
    for (let i = 0; i < n; i++) {
      dst[i] = sum / w;
      sum += src[(i + radius + 1) % n] - src[(i - radius + n) % n];
    }
    src = dst;
  }
  return src;
}

/** Road material: toon-lit painted texture + edge lines and centre dashes drawn in the shader (crisp at any distance). */
function roadMaterial(map, style) {
  const m = toonMaterial({ map, color: style.roadTint ?? 0xffffff, rim: false });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.lineColor = { value: new THREE.Color(style.lineColor ?? 0xfff4dc) };
    sh.uniforms.dashColor = { value: new THREE.Color(style.dashColor ?? 0xfff4dc) };
    sh.uniforms.dashAlpha = { value: style.dashAlpha ?? 0.75 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 roadUV;\nvarying vec2 vRoad;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = roadUV;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoad;\nuniform vec3 lineColor;\nuniform vec3 dashColor;\nuniform float dashAlpha;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float a = vRoad.x;                 // 0..1 across
          float aw = fwidth(a) * 1.5;
          float edge = smoothstep(0.035 - aw, 0.035, a) * (1.0 - smoothstep(0.05, 0.05 + aw, a))
                     + smoothstep(0.95 - aw, 0.95, a) * (1.0 - smoothstep(0.965, 0.965 + aw, a));
          float dash = step(0.5, fract(vRoad.y / 9.0)) * (smoothstep(0.492 - aw, 0.492, a) * (1.0 - smoothstep(0.508, 0.508 + aw, a)));
          diffuseColor.rgb = mix(diffuseColor.rgb, lineColor, clamp(edge, 0.0, 1.0) * 0.92);
          diffuseColor.rgb = mix(diffuseColor.rgb, dashColor, dash * dashAlpha);
        }`);
  };
  m.customProgramCacheKey = () => 'road-toon';
  return m;
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} def   track definition (see src/tracks/*.js)
 * @param {object} opts  { quality: preset object, variant }
 */
export function createTrack(scene, renderer, def, opts = {}) {
  const quality = opts.quality || {};
  const style = def.style || {};
  const HALF_W = def.halfWidth || 12;
  const SCALE = def.scale || 1;
  const CP = def.points;
  const root = new THREE.Group();
  root.name = 'track';
  scene.add(root);
  const disposables = [];
  const track = {};
  const inkMat = outlineMaterial({ width: 0.03, minPixelsAt: 12, maxScale: 5, fadeStart: 110, fadeEnd: 200 });
  disposables.push(inkMat);

  // ------------------------------------------------------------------ centerline
  const pts = CP.map(([x, y, z]) => new THREE.Vector3(x * SCALE, y, z * SCALE));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  curve.arcLengthDivisions = 6000;
  curve.updateArcLengths();
  const length = curve.getLength();
  const ds = length / N;

  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const tx = new Float32Array(N), ty = new Float32Array(N), tz = new Float32Array(N);
  const rx = new Float32Array(N), rz = new Float32Array(N);
  const head = new Float32Array(N);
  const _p = new THREE.Vector3(), _t = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const u = i / N;
    curve.getPointAt(u, _p);
    curve.getTangentAt(u, _t).normalize();
    px[i] = _p.x; py[i] = _p.y; pz[i] = _p.z;
    tx[i] = _t.x; ty[i] = _t.y; tz[i] = _t.z;
    const hl = Math.hypot(_t.x, _t.z) || 1;
    rx[i] = -_t.z / hl; rz[i] = _t.x / hl;
    head[i] = Math.atan2(_t.x, _t.z);
  }

  const kRaw = new Float32Array(N);
  for (let i = 0; i < N; i++) kRaw[i] = wrapAngle(head[(i + 1) % N] - head[(i - 1 + N) % N]) / (2 * ds);
  const kS = smoothCircular(kRaw, 6, 2);
  const kWide = smoothCircular(kRaw, 22, 3);

  // ------------------------------------------------------------------ spatial grid (needed for CP lookups)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
  }
  const gx0 = minX - 200, gz0 = minZ - 200;
  const gw = Math.ceil((maxX - minX + 400) / GRID_CELL), gh = Math.ceil((maxZ - minZ + 400) / GRID_CELL);
  const grid = Array.from({ length: gw * gh }, () => []);
  for (let i = 0; i < N; i++) {
    const cx = Math.floor((px[i] - gx0) / GRID_CELL), cz = Math.floor((pz[i] - gz0) / GRID_CELL);
    grid[cz * gw + cx].push(i);
  }
  let _nd2 = 0;
  function nearestGrid(x, z, noFallback = false) {
    const cx = Math.floor((x - gx0) / GRID_CELL), cz = Math.floor((z - gz0) / GRID_CELL);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 2; r++) {
      for (let j = cz - r; j <= cz + r; j++) {
        if (j < 0 || j >= gh) continue;
        for (let k = cx - r; k <= cx + r; k++) {
          if (k < 0 || k >= gw) continue;
          if (r === 2 && j > cz - 2 && j < cz + 2 && k > cx - 2 && k < cx + 2) continue;
          const cell = grid[j * gw + k];
          for (let m = 0; m < cell.length; m++) {
            const i = cell[m];
            const dx = px[i] - x, dz = pz[i] - z, d = dx * dx + dz * dz;
            if (d < bd) { bd = d; best = i; }
          }
        }
      }
      if (best >= 0 && bd <= (GRID_CELL * r) * (GRID_CELL * r)) { _nd2 = bd; return best; }
    }
    if (noFallback) { _nd2 = Infinity; return -1; }
    for (let i = 0; i < N; i++) {
      const dx = px[i] - x, dz = pz[i] - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    _nd2 = bd;
    return best;
  }
  // sample index nearest to a fractional control-point position (e.g. 10.45 = 45% from CP10 to CP11)
  const atCP = (cpf) => {
    const n = CP.length;
    const i0 = ((Math.floor(cpf) % n) + n) % n, i1 = (i0 + 1) % n, f = cpf - Math.floor(cpf);
    const x = (CP[i0][0] + (CP[i1][0] - CP[i0][0]) * f) * SCALE;
    const z = (CP[i0][2] + (CP[i1][2] - CP[i0][2]) * f) * SCALE;
    return nearestGrid(x, z);
  };
  // fraction of a sample range [a, b] (wrapping) in [0, 1] for membership tests
  const inRange = (i, a, b) => (a <= b ? i >= a && i <= b : i >= a || i <= b);

  // ------------------------------------------------------------------ bridges (deck instead of ground)
  let bridge = new Float32Array(N);
  for (const br of def.bridges || []) {
    const a = atCP(br.from), b = atCP(br.to);
    for (let i = 0; i < N; i++) if (inRange(i, a, b)) bridge[i] = 1;
  }
  bridge = smoothCircular(bridge, 6, 1);

  // wall offsets (distance from centerline to barrier inner face)
  const RUNOFF = def.runoff ?? 7;
  const runoffAt = new Float32Array(N).fill(RUNOFF);
  for (const z of def.runoffZones || []) {
    const a = atCP(z.from), b = atCP(z.to);
    for (let i = 0; i < N; i++) if (inRange(i, a, b)) runoffAt[i] = z.runoff;
  }
  const runoffS = smoothCircular(runoffAt, 25, 2);
  const wallBase = (side) => {
    const w = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const outer = side > 0 ? Math.max(0, kS[i]) : Math.max(0, -kS[i]);
      w[i] = HALF_W + runoffS[i] + Math.min(6, outer * 700);
    }
    return w;
  };
  const innerClamp = (w, side) => {
    for (let i = 0; i < N; i++) {
      const inner = side > 0 ? Math.max(0, -kS[i]) : Math.max(0, kS[i]);
      if (inner > 1e-4) w[i] = Math.min(w[i], 1 / inner - 5);
      w[i] = Math.max(HALF_W + 1.5, w[i]);
      w[i] = w[i] * (1 - bridge[i]) + (HALF_W + 1.2) * bridge[i];
    }
    return w;
  };
  const wallR = innerClamp(smoothCircular(innerClamp(wallBase(1), 1), 18, 2), 1);
  const wallL = innerClamp(smoothCircular(innerClamp(wallBase(-1), -1), 18, 2), -1);
  const maxWall = Math.max(...wallR, ...wallL);

  // racing line lateral offsets
  const maxOff = HALF_W - 3;
  const apex = new Float32Array(N);
  for (let i = 0; i < N; i++) apex[i] = -clamp(kWide[i] * 160, -1, 1) * maxOff;
  const lookA = Math.round(32 / ds);
  let race = new Float32Array(N);
  for (let i = 0; i < N; i++) race[i] = clamp(apex[i] - 0.55 * apex[(i + lookA) % N], -maxOff, maxOff);
  race = smoothCircular(race, 14, 2);

  const WIN = 45;
  function nearest(x, z, hintT) {
    if (typeof hintT === 'number' && isFinite(hintT)) {
      const c = Math.round((((hintT % 1) + 1) % 1) * N);
      let best = -1, bd = Infinity, bk = 0;
      for (let k = -WIN; k <= WIN; k++) {
        const i = (c + k + N) % N;
        const dx = px[i] - x, dz = pz[i] - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; bk = k; }
      }
      const lim = maxWall + 8;
      if (bd < lim * lim && Math.abs(bk) < WIN) { _nd2 = bd; return best; }
    }
    return nearestGrid(x, z);
  }

  const proj = { a: 0, b: 1, f: 0, s: 0, lat: 0, y: 0, cx: 0, cz: 0, rx: 0, rz: 0 };
  function project(x, z, hintT) {
    const i = nearest(x, z, hintT);
    const n = (i + 1) % N, p = (i - 1 + N) % N;
    const along = (x - px[i]) * tx[i] + (z - pz[i]) * tz[i];
    const a = along >= 0 ? i : p, b = along >= 0 ? n : i;
    const sx = px[b] - px[a], sz = pz[b] - pz[a];
    const L2 = sx * sx + sz * sz || 1;
    const f = clamp(((x - px[a]) * sx + (z - pz[a]) * sz) / L2, 0, 1);
    const cx = px[a] + sx * f, cz = pz[a] + sz * f;
    let rxi = rx[a] + (rx[b] - rx[a]) * f, rzi = rz[a] + (rz[b] - rz[a]) * f;
    const rl = Math.hypot(rxi, rzi) || 1; rxi /= rl; rzi /= rl;
    proj.a = a; proj.b = b; proj.f = f;
    proj.s = a + f;
    proj.cx = cx; proj.cz = cz;
    proj.y = py[a] + (py[b] - py[a]) * f;
    proj.rx = rxi; proj.rz = rzi;
    proj.lat = (x - cx) * rxi + (z - cz) * rzi;
    return proj;
  }

  const lerpArr = (arr, a, b, f) => arr[a] + (arr[b] - arr[a]) * f;
  const idxAtDist = (d) => ((((d / ds) % N) + N) % N);

  // ------------------------------------------------------------------ features
  const PAD_LEN = Math.max(3, Math.round(7 / ds));
  const boostPads = [];
  for (const c of def.boostPads || []) {
    const i = atCP(c.at);
    const step = Math.round((c.step ?? 16) / ds);
    (c.lats || [0]).forEach((lat, k) => {
      const s0 = (((i + (c.stagger === false ? 0 : k * step)) % N) + N) % N;
      boostPads.push({ s0, len: PAD_LEN, lat: lat === 'race' ? race[s0] : lat, hw: c.hw ?? 2.6 });
    });
  }
  const RAMP_LEN = Math.max(4, Math.round(9 / ds));
  const ramps = (def.ramps || []).map((r) => ({ s0: atCP(r.at), len: RAMP_LEN, hw: r.hw ?? 10, h: r.h ?? 1.7 }));
  const itemBoxPositions = [];
  for (const at of def.itemRows || []) {
    const i = atCP(at);
    for (const lat of [-8, -4, 0, 4, 8]) itemBoxPositions.push(new THREE.Vector3(px[i] + rx[i] * lat, py[i] + 1.4, pz[i] + rz[i] * lat));
  }
  // surface zones: ice / splash (shallow water) / sand traps on the road
  const zones = (def.zones || []).map((z) => ({ type: z.type, a: atCP(z.from), b: atCP(z.to), lat: z.lat ?? 0, hw: z.hw ?? HALF_W + 3 }));

  // ------------------------------------------------------------------ public queries
  const wrapDelta = (s, s0) => { let d = s - s0; if (d < 0) d += N; return d; };
  const _normal = new THREE.Vector3();
  const _info = { height: 0, normal: _normal, surface: 'road', t: 0, lateral: 0, onRoad: true, zone: null };

  /** NOTE: returns a shared object — copy what you need before the next call. */
  function getSurfaceInfo(pos, hintT) {
    if (!pos || !isFinite(pos.x) || !isFinite(pos.z)) {
      _normal.set(0, 1, 0);
      Object.assign(_info, { height: 0, surface: 'road', t: 0, lateral: 0, onRoad: true, zone: null });
      return _info;
    }
    const pr = project(pos.x, pos.z, hintT);
    const { a, b, f } = pr;
    const lat = pr.lat;
    const t = (pr.s / N) % 1;
    let height = pr.y;
    const Tx = lerpArr(tx, a, b, f), Ty = lerpArr(ty, a, b, f), Tz = lerpArr(tz, a, b, f);
    _normal.set(-pr.rz * Ty, pr.rz * Tx - pr.rx * Tz, pr.rx * Ty).normalize();
    const onRoad = Math.abs(lat) <= HALF_W;
    let surface = onRoad ? 'road' : 'offroad';
    let zone = null;
    for (let k = 0; k < zones.length; k++) {
      const z = zones[k];
      if (inRange(a, z.a, z.b) && Math.abs(lat - z.lat) <= z.hw) { zone = z.type; break; }
    }
    if (onRoad) {
      for (let k = 0; k < ramps.length; k++) {
        const r = ramps[k];
        const d = wrapDelta(pr.s, r.s0);
        if (d <= r.len && Math.abs(lat) <= r.hw) {
          const slope = r.h / (r.len * ds);
          height += slope * d * ds;
          surface = 'jump';
          _normal.set(_normal.x - Tx * slope, _normal.y - Ty * slope, _normal.z - Tz * slope).normalize();
          break;
        }
      }
      if (surface === 'road') {
        for (let k = 0; k < boostPads.length; k++) {
          const p = boostPads[k];
          if (wrapDelta(pr.s, p.s0) <= p.len && Math.abs(lat - p.lat) <= p.hw) { surface = 'boost'; break; }
        }
      }
    }
    if (zone && surface !== 'boost' && surface !== 'jump') surface = zone;
    _info.height = height; _info.surface = surface; _info.t = t; _info.lateral = lat; _info.onRoad = onRoad; _info.zone = zone;
    return _info;
  }

  const _wallN = new THREE.Vector3();
  const _wall = { normal: _wallN, depth: 0 };
  function resolveWall(pos, radius = 1.3) {
    if (!pos || !isFinite(pos.x) || !isFinite(pos.z)) return null;
    const pr = project(pos.x, pos.z);
    const wr = lerpArr(wallR, pr.a, pr.b, pr.f), wl = lerpArr(wallL, pr.a, pr.b, pr.f);
    if (pr.lat + radius > wr) { _wallN.set(-pr.rx, 0, -pr.rz); _wall.depth = pr.lat + radius - wr; return _wall; }
    if (-pr.lat + radius > wl) { _wallN.set(pr.rx, 0, pr.rz); _wall.depth = -pr.lat + radius - wl; return _wall; }
    return null;
  }

  const getPointAt = (t, out) => curve.getPointAt((((t % 1) + 1) % 1), out || new THREE.Vector3());
  const getTangentAt = (t, out) => curve.getTangentAt((((t % 1) + 1) % 1), out || new THREE.Vector3()).normalize();
  function getRacingLine(t, out) {
    const s = (((t % 1) + 1) % 1) * N;
    const a = Math.floor(s) % N, b = (a + 1) % N, f = s - Math.floor(s);
    const off = race[a] + (race[b] - race[a]) * f;
    const x = lerpArr(px, a, b, f), y = lerpArr(py, a, b, f), z = lerpArr(pz, a, b, f);
    let rxi = lerpArr(rx, a, b, f), rzi = lerpArr(rz, a, b, f);
    const rl = Math.hypot(rxi, rzi) || 1; rxi /= rl; rzi /= rl;
    return (out || new THREE.Vector3()).set(x + rxi * off, y, z + rzi * off);
  }
  /** World position at progress t and lateral offset (m, + = right). */
  function pointAtLat(t, lat, out) {
    const s = (((t % 1) + 1) % 1) * N;
    const a = Math.floor(s) % N, b = (a + 1) % N, f = s - Math.floor(s);
    let rxi = lerpArr(rx, a, b, f), rzi = lerpArr(rz, a, b, f);
    const rl = Math.hypot(rxi, rzi) || 1; rxi /= rl; rzi /= rl;
    return (out || new THREE.Vector3()).set(lerpArr(px, a, b, f) + rxi * lat, lerpArr(py, a, b, f), lerpArr(pz, a, b, f) + rzi * lat);
  }

  const startPositions = [];
  for (let k = 0; k < 8; k++) {
    const back = 8 + k * 5.2;
    const s = idxAtDist(length - back);
    const a = Math.floor(s) % N, b = (a + 1) % N, f = s - Math.floor(s);
    const lat = k % 2 === 0 ? -4.5 : 4.5;
    const x = lerpArr(px, a, b, f) + lerpArr(rx, a, b, f) * lat;
    const z = lerpArr(pz, a, b, f) + lerpArr(rz, a, b, f) * lat;
    startPositions.push({ position: new THREE.Vector3(x, lerpArr(py, a, b, f), z), heading: Math.atan2(lerpArr(tx, a, b, f), lerpArr(tz, a, b, f)) });
  }

  const minimap = { points: [], bounds: { minX, maxX, minZ, maxZ } };
  for (let i = 0; i < 256; i++) {
    const j = Math.floor(i * N / 256);
    minimap.points.push({ x: px[j], z: pz[j] });
  }

  // ------------------------------------------------------------------ geometry helpers
  function extrude(i0, i1, profile, { across = null, acrossScale = 1, alongScale = 1, alongSign = 1, swap = false, step = 1, roadUV = false } = {}) {
    const rings = [];
    for (let i = i0; i < i1; i += step) rings.push(i);
    rings.push(i1);
    const m = profile(((i0 % N) + N) % N, i0).length;
    const pos = new Float32Array(rings.length * m * 3);
    const uv = new Float32Array(rings.length * m * 2);
    const ruv = roadUV ? new Float32Array(rings.length * m * 2) : null;
    let p = 0, q = 0;
    for (const ii of rings) {
      const i = ((Math.round(ii) % N) + N) % N;
      const prof = profile(i, ii);
      const along = (ii - i0) * ds / alongScale * alongSign;
      for (let j = 0; j < m; j++) {
        const [lat, dy] = prof[j];
        pos[p++] = px[i] + rx[i] * lat;
        pos[p++] = py[i] + dy;
        pos[p++] = pz[i] + rz[i] * lat;
        const ac = across ? across[j] : lat / acrossScale;
        if (ruv) { ruv[q] = across ? across[j] : 0; ruv[q + 1] = (ii - i0) * ds; }
        if (swap) { uv[q++] = along; uv[q++] = ac; } else { uv[q++] = ac; uv[q++] = along; }
      }
    }
    const idx = [];
    for (let r = 0; r < rings.length - 1; r++) {
      for (let j = 0; j < m - 1; j++) {
        const A = r * m + j, B = r * m + j + 1, C = (r + 1) * m + j, D = (r + 1) * m + j + 1;
        idx.push(A, B, C, B, D, C);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (ruv) g.setAttribute('roadUV', new THREE.BufferAttribute(ruv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function runs(pred, minLen = 1) {
    const out = [];
    const flags = new Uint8Array(N);
    for (let i = 0; i < N; i++) flags[i] = pred(i) ? 1 : 0;
    if (flags.every((v) => v)) return [[0, N]];
    if (flags.every((v) => !v)) return [];
    let start = 0;
    while (flags[start]) start++;
    let runStart = -1;
    for (let k = 1; k <= N; k++) {
      const i = start + k;
      const v = flags[i % N];
      if (v && runStart < 0) runStart = i;
      if (!v && runStart >= 0) { if (i - runStart >= minLen) out.push([runStart - 1, i]); runStart = -1; }
    }
    return out;
  }

  const addMesh = (geo, mat, { cast = false, receive = true, name = '', ink = 0 } = {}) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast && quality.shadows !== false; mesh.receiveShadow = receive; mesh.name = name;
    root.add(mesh);
    disposables.push(geo);
    if (ink && quality.outlines !== false) {
      computeOutlineNormals(geo, ink);
      const o = new THREE.Mesh(geo, inkMat); o.name = name + ':ink'; root.add(o);
    }
    return mesh;
  };
  const mat = (m) => { disposables.push(m); if (m.map && !m.map.userData.shared) disposables.push(m.map); return m; };
  const tex = (path, fallback, repeat) => {
    const t = (path && texClone(path)) || (fallback ? fallback() : null);
    if (t && repeat) t.repeat.set(repeat[0], repeat[1]);
    return t;
  };

  // ------------------------------------------------------------------ road surface
  const roadTex = tex(style.roadTex, TX.makeAsphaltTexture);
  const roadMat = mat(roadMaterial(roadTex, style));
  addMesh(extrude(0, N, () => [[-HALF_W, 0], [0, 0], [HALF_W, 0]], { across: [0, 0.5, 1], alongScale: style.roadAlongScale ?? 24, step: 1, roadUV: true }), roadMat, { name: 'road' });

  // Curbs through corners
  const curbMat = mat(toonMaterial({ map: TX.makeCurbTexture(style.curbA ?? '#e2366f', style.curbB ?? '#fff4dc'), rim: false }));
  const curbMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (Math.abs(kS[i]) > 1 / 240 && bridge[i] < 0.2) {
    for (let k = -30; k <= 30; k++) curbMask[(i + k + N) % N] = 1;
  }
  for (let i = 0; i < N; i++) if (bridge[i] > 0.05) curbMask[i] = 0;
  const curbGeos = [];
  for (const [a, b] of runs((i) => curbMask[i], 10)) {
    curbGeos.push(extrude(a, b, () => [[HALF_W - 1.4, 0.0], [HALF_W - 1.1, 0.08], [HALF_W + 0.7, 0.08], [HALF_W + 0.9, -0.05]], { across: [0, 0.15, 0.9, 1], alongScale: 4 }));
    curbGeos.push(extrude(a, b, () => [[-HALF_W - 0.9, -0.05], [-HALF_W - 0.7, 0.08], [-HALF_W + 1.1, 0.08], [-HALF_W + 1.4, 0.0]], { across: [0, 0.1, 0.85, 1], alongScale: 4 }));
  }
  if (curbGeos.length) addMesh(mergeGeometries(curbGeos), curbMat, { name: 'curbs' });
  curbGeos.forEach((g) => g.dispose());

  // Run-off bands (grass/sand/snow) + bridge deck
  const offTex = tex(style.offroadTex, TX.makeGrassTexture);
  const offMat = mat(toonMaterial({ map: offTex, color: style.offroadTint ?? 0xffffff, rim: false }));
  const deckTex = tex(style.deckTex, TX.makeConcreteTexture);
  const deckMat = mat(toonMaterial({ map: deckTex, color: style.deckTint ?? 0xffffff, rim: false }));
  const bandGeos = [], deckGeos = [];
  const offScale = style.offroadScale ?? 8;
  for (const [a, b] of runs((i) => bridge[i] < 0.5, 5)) {
    bandGeos.push(extrude(a, b, (i) => [[HALF_W - 0.2, -0.03], [wallR[i] + 0.35, -0.03]], { acrossScale: offScale, alongScale: offScale }));
    bandGeos.push(extrude(a, b, (i) => [[-wallL[i] - 0.35, -0.03], [-HALF_W + 0.2, -0.03]], { acrossScale: offScale, alongScale: offScale }));
  }
  const bridgeRuns = runs((i) => bridge[i] >= 0.5, 5);
  const DECK = style.deckDepth ?? 2.4;
  for (const [a, b] of bridgeRuns) {
    deckGeos.push(extrude(a, b, (i) => [[HALF_W - 0.2, -0.02], [wallR[i] + 0.8, -0.02]], { acrossScale: 4, alongScale: 4 }));
    deckGeos.push(extrude(a, b, (i) => [[-wallL[i] - 0.8, -0.02], [-HALF_W + 0.2, -0.02]], { acrossScale: 4, alongScale: 4 }));
    deckGeos.push(extrude(a, b, (i) => [[wallR[i] + 0.8, -0.02], [wallR[i] + 0.8, -DECK]], { acrossScale: 4, alongScale: 4 }));
    deckGeos.push(extrude(a, b, (i) => [[-wallL[i] - 0.8, -DECK], [-wallL[i] - 0.8, -0.02]], { acrossScale: 4, alongScale: 4 }));
    deckGeos.push(extrude(a, b, (i) => [[wallR[i] + 0.8, -DECK], [-wallL[i] - 0.8, -DECK]], { acrossScale: 4, alongScale: 4 }));
  }
  if (bandGeos.length) addMesh(mergeGeometries(bandGeos), offMat, { name: 'offroad' });
  if (deckGeos.length) addMesh(mergeGeometries(deckGeos), deckMat, { name: 'deck', cast: true });
  bandGeos.forEach((g) => g.dispose()); deckGeos.forEach((g) => g.dispose());

  // Zone decals (ice sheets, shallow water fords) drawn just above the road
  const zoneMeshes = [];
  for (const z of zones) {
    const zs = style.zones && style.zones[z.type];
    if (!zs) continue;
    const t = tex(zs.tex, null);
    const zm = mat(zs.material ? zs.material(t) : toonMaterial({ map: t, color: zs.color ?? 0xffffff, transparent: !!zs.opacity, opacity: zs.opacity ?? 1, rim: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const b = z.b >= z.a ? z.b : z.b + N;
    const g = zs.material
      ? extrude(z.a, b, () => [[z.lat - z.hw, 0.035], [z.lat + z.hw, 0.035]], { across: [0, 1], alongScale: Math.max(1, (b - z.a)) * ds })
      : extrude(z.a, b, () => [[z.lat - z.hw, 0.03], [z.lat + z.hw, 0.03]], { across: [0, (2 * z.hw) / (zs.scale ?? 10)], alongScale: zs.scale ?? 10 });
    zoneMeshes.push(addMesh(g, zm, { name: 'zone-' + z.type }));
  }

  // ------------------------------------------------------------------ barriers
  const barrierType = (side) => {
    const typ = new Array(N);
    const tight = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const outer = side > 0 ? kS[i] > 1 / 55 : kS[i] < -1 / 55;
      if (outer && style.tires !== false) for (let k = -18; k <= 18; k++) tight[(i + k + N) % N] = 1;
    }
    for (let i = 0; i < N; i++) typ[i] = bridge[i] >= 0.5 ? 'rail' : tight[i] ? 'tires' : 'wall';
    return typ;
  };
  const typeR = barrierType(1), typeL = barrierType(-1);

  const wallTex = tex(style.wallTex, TX.makeBarrierTexture);
  const wallMat = mat(toonMaterial({ map: wallTex, color: style.wallTint ?? 0xffffff }));
  const wallTopMat = mat(toonMaterial({ color: style.wallTop ?? 0xfff4dc }));
  const railMat = mat(toonMaterial({ map: tex(style.railTex, TX.makeRailTexture), color: style.railTint ?? 0xffffff }));
  const WALL_H = style.wallHeight ?? 1.25, WALL_T = style.wallThickness ?? 0.7, TEX_LEN = style.wallTexLen ?? 9.6;
  const vMap = (y) => (y + 0.05) / (WALL_H + 0.05);
  const wallFaces = [], wallTops = [], railFaces = [];
  for (const side of [1, -1]) {
    const typ = side > 0 ? typeR : typeL;
    const W = side > 0 ? wallR : wallL;
    for (const kind of ['wall', 'rail']) {
      const faces = kind === 'wall' ? wallFaces : railFaces;
      const bottom = kind === 'rail' ? -DECK : -1.5;
      const h = kind === 'rail' ? (style.railHeight ?? 1.1) : WALL_H;
      for (const [a, b] of runs((i) => typ[i] === kind, 4)) {
        if (side > 0) {
          faces.push(extrude(a, b, (i) => [[W[i], bottom], [W[i], h]], { across: [vMap(bottom), vMap(h)], alongScale: TEX_LEN, alongSign: -1, swap: true }));
          wallTops.push(extrude(a, b, (i) => [[W[i], h], [W[i] + WALL_T, h]], { across: [0, 1], alongScale: TEX_LEN }));
          faces.push(extrude(a, b, (i) => [[W[i] + WALL_T, h], [W[i] + WALL_T, bottom]], { across: [vMap(h), vMap(bottom)], alongScale: TEX_LEN, swap: true }));
        } else {
          faces.push(extrude(a, b, (i) => [[-W[i] - WALL_T, bottom], [-W[i] - WALL_T, h]], { across: [vMap(bottom), vMap(h)], alongScale: TEX_LEN, alongSign: -1, swap: true }));
          wallTops.push(extrude(a, b, (i) => [[-W[i] - WALL_T, h], [-W[i], h]], { across: [0, 1], alongScale: TEX_LEN }));
          faces.push(extrude(a, b, (i) => [[-W[i], h], [-W[i], bottom]], { across: [vMap(h), vMap(bottom)], alongScale: TEX_LEN, swap: true }));
        }
      }
    }
  }
  if (wallFaces.length) addMesh(mergeGeometries(wallFaces), wallMat, { cast: true, name: 'walls' });
  if (railFaces.length) {
    if (railMat.map) railMat.map.repeat.set(1 / 2.5, 1);
    addMesh(mergeGeometries(railFaces), railMat, { cast: true, name: 'rails' });
  }
  if (wallTops.length) addMesh(mergeGeometries(wallTops), wallTopMat, { cast: false, name: 'wallTops' });
  [...wallFaces, ...railFaces, ...wallTops].forEach((g) => g.dispose());

  // Tyre stacks (instanced) on the outside of tight corners
  if (style.tires !== false) {
    const TR = 0.9;
    const tireGeo = new THREE.CylinderGeometry(TR, TR, 0.42, 12, 1);
    const tireMat = mat(toonMaterial({}));
    const places = [];
    for (const side of [1, -1]) {
      const typ = side > 0 ? typeR : typeL;
      const W = side > 0 ? wallR : wallL;
      for (const [a, b] of runs((i) => typ[i] === 'tires', 4)) {
        let acc = 1e9, lx = 0, lz = 0, stack = 0;
        for (let ii = a; ii <= b; ii++) {
          const i = ii % N;
          const lat = side * (W[i] + TR);
          const x = px[i] + rx[i] * lat, z = pz[i] + rz[i] * lat;
          acc += Math.hypot(x - lx, z - lz); lx = x; lz = z;
          if (acc >= TR * 1.95) { acc = 0; places.push({ x, y: py[i], z, stack: stack++ }); }
        }
      }
    }
    const tc = style.tireColors || [0xe2366f, 0xfff4dc, 0x19b5a5, 0xfff4dc];
    const colors = tc.map((c) => new THREE.Color(c));
    const dark = new THREE.Color(0x2e2a33);
    const im = new THREE.InstancedMesh(tireGeo, tireMat, Math.max(1, places.length * 3));
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (const p of places) {
      for (let l = 0; l < 3; l++) {
        m4.makeRotationY(p.stack * 0.7 + l);
        m4.setPosition(p.x, p.y + 0.21 + l * 0.44, p.z);
        im.setMatrixAt(n, m4);
        im.setColorAt(n, l === 1 ? colors[(p.stack % 2) * 2] : (l === 0 ? dark : colors[1]));
        n++;
      }
    }
    im.count = n;
    im.castShadow = quality.shadows !== false; im.receiveShadow = true;
    im.name = 'tires';
    root.add(im);
    disposables.push(tireGeo);
  }

  // Bridge piers
  if (bridgeRuns.length) {
    const pierGeo = new THREE.BoxGeometry(1, 1, 1);
    const pierMat = mat(toonMaterial({ map: tex(style.pierTex, null), color: style.pierColor ?? 0xd9d4c7 }));
    const mats = [];
    for (const [a, b] of bridgeRuns) {
      const span = Math.round((style.pierSpan ?? 26) / ds);
      for (let ii = a + Math.round(span / 2); ii < b - span / 3; ii += span) {
        const i = ii % N;
        const top = py[i] - DECK, bottom = (def.pierBottom ?? (py[i] - 30));
        const hgt = top - bottom;
        const m4 = new THREE.Matrix4().makeRotationY(head[i]);
        m4.scale(new THREE.Vector3(wallR[i] + wallL[i] - 2, hgt, 2.6));
        const off = (wallR[i] - wallL[i]) / 2;
        m4.setPosition(px[i] + rx[i] * off, bottom + hgt / 2, pz[i] + rz[i] * off);
        mats.push(m4);
      }
    }
    const im = new THREE.InstancedMesh(pierGeo, pierMat, Math.max(1, mats.length));
    mats.forEach((m4, k) => im.setMatrixAt(k, m4));
    im.count = mats.length;
    im.castShadow = quality.shadows !== false; im.receiveShadow = true;
    root.add(im);
    disposables.push(pierGeo);
  }

  // ------------------------------------------------------------------ boost pads & ramps
  const boostTex = TX.makeBoostTexture(style.boostA, style.boostB);
  const boostMat = mat(new THREE.MeshBasicMaterial({ map: boostTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  boostMat.color.setScalar(1.15);
  if (boostPads.length) {
    const geos = boostPads.map((p) => extrude(p.s0, p.s0 + p.len, () => [[p.lat - p.hw, 0.045], [p.lat + p.hw, 0.045]], { across: [0, 1], alongScale: p.len * ds / 2 }));
    addMesh(mergeGeometries(geos), boostMat, { name: 'boostPads' });
    geos.forEach((g) => g.dispose());
  }
  if (ramps.length) {
    const rampMat = mat(toonMaterial({ map: TX.makeRampTexture(style.rampA, style.rampB), side: THREE.DoubleSide }));
    const sideMat = mat(toonMaterial({ color: style.rampSide ?? 0xffd23f, side: THREE.DoubleSide }));
    const tops = [], sides = [];
    for (const r of ramps) {
      const hAt = (ii) => r.h * clamp((ii - r.s0) / r.len, 0, 1);
      tops.push(extrude(r.s0, r.s0 + r.len, (i, ii) => [[-r.hw, hAt(ii) + 0.03], [r.hw, hAt(ii) + 0.03]], { across: [0, 1], alongScale: r.len * ds }));
      sides.push(extrude(r.s0, r.s0 + r.len, (i, ii) => [[r.hw, hAt(ii) + 0.03], [r.hw, -0.1]], { across: [0, 1] }));
      sides.push(extrude(r.s0, r.s0 + r.len, (i, ii) => [[-r.hw, -0.1], [-r.hw, hAt(ii) + 0.03]], { across: [0, 1] }));
      const e = (r.s0 + r.len) % N;
      sides.push(extrude(e, e + 0.001, (i, ii) => ii === e ? [[-r.hw, r.h + 0.03], [r.hw, r.h + 0.03]] : [[-r.hw, -0.1], [r.hw, -0.1]], { across: [0, 1] }));
    }
    addMesh(mergeGeometries(tops), rampMat, { cast: true, name: 'ramps' });
    addMesh(mergeGeometries(sides), sideMat, { cast: true, name: 'rampSides' });
    [...tops, ...sides].forEach((g) => g.dispose());
  }

  // ------------------------------------------------------------------ start line, grid, gantry
  const decalMat = (o) => mat(toonMaterial({ rim: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...o }));
  {
    const chk = TX.makeCheckerTexture(12, 2, '#2b1d2e', '#fff4dc');
    const w = Math.max(2, Math.round(1.5 / ds));
    addMesh(extrude(N - w, N + w, () => [[-HALF_W, 0.02], [HALF_W, 0.02]], { across: [0, 1], alongScale: 2 * w * ds }), decalMat({ map: chk }), { name: 'startLine' });
    const slotGeos = [];
    for (const sp of startPositions) {
      const h = sp.heading;
      const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
      const right = new THREE.Vector3(-Math.cos(h), 0, Math.sin(h));
      const addBar = (w2, l2, offF, offR) => {
        const g = new THREE.PlaneGeometry(w2, l2).rotateX(-Math.PI / 2).rotateY(h);
        const c = sp.position.clone().addScaledVector(fwd, offF).addScaledVector(right, offR);
        g.translate(c.x, c.y + 0.025, c.z);
        slotGeos.push(g);
      };
      addBar(3.6, 0.35, 2.0, 0);
      addBar(0.3, 1.6, 1.3, 1.65);
      addBar(0.3, 1.6, 1.3, -1.65);
    }
    addMesh(mergeGeometries(slotGeos), decalMat({ color: 0xfff4dc }), { name: 'gridMarks' });
    slotGeos.forEach((g) => g.dispose());
  }

  const lamps = [];
  {
    const g = new THREE.Group();
    g.position.set(px[0], py[0], pz[0]);
    g.rotation.y = head[0];
    const xL = wallL[0] + 2.2, xR = -(wallR[0] + 2.2);
    const pillarMat = mat(toonMaterial({ map: TX.makeStripeTexture(style.gantryA ?? '#fff4dc', style.gantryB ?? '#e2366f', 10) }));
    pillarMat.map.rotation = Math.PI / 2;
    const pGeo = new THREE.CylinderGeometry(0.9, 1.1, 12, 16);
    computeOutlineNormals(pGeo);
    disposables.push(pGeo);
    for (const x of [xL, xR]) {
      const p = new THREE.Mesh(pGeo, pillarMat);
      p.position.set(x, 6, 0); p.castShadow = quality.shadows !== false; g.add(p);
      if (quality.outlines !== false) p.add(new THREE.Mesh(pGeo, inkMat));
    }
    const span = xL - xR + 2.5;
    const bannerTex = texClone('textures/ui/banner_zoomies.webp', { repeat: false }) || TX.makeBannerTexture('ZOOMIES GP');
    if (!bannerTex.userData.shared) disposables.push(bannerTex);
    const beamSide = mat(toonMaterial({ color: style.gantryB ?? 0xe2366f }));
    const bannerMat = mat(toonMaterial({ map: bannerTex }));
    const beamGeo = new THREE.BoxGeometry(span, 3.6, 1.4);
    disposables.push(beamGeo);
    const beam = new THREE.Mesh(beamGeo, [beamSide, beamSide, beamSide, beamSide, bannerMat, bannerMat]);
    beam.position.set((xL + xR) / 2, 11, 0); beam.castShadow = quality.shadows !== false;
    g.add(beam);
    const houseGeo = new THREE.BoxGeometry(6.5, 2, 0.8);
    disposables.push(houseGeo);
    const house = new THREE.Mesh(houseGeo, mat(toonMaterial({ color: 0x2b1d2e })));
    house.position.set(0, 8.2, -0.4); g.add(house);
    const lampGeo = new THREE.SphereGeometry(0.62, 16, 12);
    disposables.push(lampGeo);
    for (let k = 0; k < 3; k++) {
      const lm = mat(new THREE.MeshBasicMaterial({ color: 0x331a22 }));
      const lamp = new THREE.Mesh(lampGeo, lm);
      lamp.position.set((k - 1) * 2, 8.2, -0.85);
      g.add(lamp); lamps.push(lm);
    }
    root.add(g);
  }
  const setLamps = (n, color) => {
    lamps.forEach((m, k) => m.color.setHex(k < n ? color : 0x331a22));
  };
  let lampTimer = 0;
  const unsub = [
    bus.on('race:countdown', (d) => { const n = d && d.n; setLamps(n === 3 ? 1 : n === 2 ? 2 : 3, 0xff3b2f); lampTimer = 0; }),
    bus.on('race:go', () => { setLamps(3, 0x3dff7a); lampTimer = 3; }),
  ];

  // ------------------------------------------------------------------ environment
  const layout = {
    N, ds, length, px, py, pz, rx, rz, tx, tz, head, kS, wallL, wallR, bridge, halfWidth: HALF_W, race,
    nearest: (x, z, noFallback = false) => { const i = nearestGrid(x, z, noFallback); return { i, d2: _nd2 }; },
    atCP, inRange, pointAtLat,
    bounds: { minX, maxX, minZ, maxZ },
    boostPads, ramps, startPositions, zones,
  };
  const hazards = [];   // { position: Vector3, radius, kind: 'spin'|'tumble'|'slow', active?: bool }
  let env = { update() {}, dispose() {} };
  if (typeof def.buildEnvironment === 'function') {
    env = def.buildEnvironment({ scene, renderer, root, L: layout, quality, hazards, keep: (x) => { disposables.push(x); return x; }, inkMat, variant: opts.variant || null, track }) || env;
  }

  Object.assign(track, {
    id: def.id,
    name: def.name,
    def,
    curve,
    length,
    roadWidth: HALF_W * 2,
    startPositions,
    itemBoxPositions,
    minimap,
    getSurfaceInfo,
    resolveWall,
    getPointAt,
    getTangentAt,
    getRacingLine,
    pointAtLat,
    hazards,
    zones,
    layout,
    boostPads: boostPads.map((p) => ({ t: p.s0 / N, lateral: p.lat, length: p.len * ds, halfWidth: p.hw })),
    jumpRamps: ramps.map((r) => ({ t: r.s0 / N, length: r.len * ds, halfWidth: r.hw, height: r.h })),
    sunLight: env.sunLight,
    heightAt: env.heightAt || null,
    getWallOffsets(t) {
      const s = (((t % 1) + 1) % 1) * N, a = Math.floor(s) % N, b = (a + 1) % N, f = s - Math.floor(s);
      return { left: lerpArr(wallL, a, b, f), right: lerpArr(wallR, a, b, f) };
    },
    setShadowFocus(v) { env.setShadowFocus && env.setShadowFocus(v); },
    update(dt, time) {
      try {
        const tt = typeof time === 'number' ? time : 0;
        boostTex.offset.y = -((tt * 1.6) % 1);
        if (lampTimer > 0) { lampTimer -= dt || 0; if (lampTimer <= 0) setLamps(0, 0); }
        env.update && env.update(dt || 0, tt);
      } catch (e) { /* never throw in the frame loop */ }
    },
    dispose() {
      unsub.forEach((u) => u && u());
      try { env.dispose && env.dispose(); } catch (e) { /* ignore */ }
      root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      disposables.forEach((d) => d && d.dispose && d.dispose());
      scene.remove(root);
    },
  });
  return track;
}
