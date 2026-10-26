// Shared environment building blocks used by every track theme (src/tracks/*.js):
// painted sky dome, sun + hemisphere light with a camera-following shadow box, fog, splat-textured terrain that
// blends into the road corridor, stylised water, instancing/scatter helpers, critter crowds, bunting, flags and
// weather particles. Everything is toon-lit to match the "Ink & Paint" style.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, outlineMaterial, addOutline, computeOutlineNormals, TIME, RIM } from './toon.js';
import { texClone } from './assets.js';

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export function hash(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), u), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f + o * 17.3, z * f - o * 9.1); norm += a; f *= 2.03; a *= 0.5; }
  return s / norm;
}
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Give a geometry a single vertex colour (so differently coloured parts can be merged). */
export function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
/** Merge painted parts, recompute normals, add outline normals. */
export function mergePainted(parts, outline = 1) {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  parts.forEach((p) => p.dispose());
  computeOutlineNormals(g, outline);
  return g;
}

// =============================================================================================
// Sky
// =============================================================================================
/**
 * Painted sky dome: vertical gradient, sun disc + glow, optional cloud band texture (wraps around the
 * horizon), optional stars and animated aurora curtains.
 */
export function createSky(ctx, o) {
  const { root, keep } = ctx;
  const cloudsTex = o.clouds ? texClone(o.clouds, { repeat: true }) : null;
  if (cloudsTex) { cloudsTex.wrapS = THREE.RepeatWrapping; cloudsTex.wrapT = THREE.ClampToEdgeWrapping; keep(cloudsTex); }
  const mat = keep(new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(o.top) }, uHorizon: { value: new THREE.Color(o.horizon) }, uBottom: { value: new THREE.Color(o.bottom ?? o.horizon) },
      uSunDir: { value: o.sunDir.clone().normalize() }, uSunColor: { value: new THREE.Color(o.sunColor ?? 0xfff2cf) }, uSunSize: { value: o.sunSize ?? 1 },
      uClouds: { value: cloudsTex }, uHasClouds: { value: cloudsTex ? 1 : 0 }, uCloudTint: { value: new THREE.Color(o.cloudTint ?? 0xffffff) },
      uCloudY: { value: new THREE.Vector2(o.cloudLow ?? -0.02, o.cloudHigh ?? 0.32) }, uCloudRepeat: { value: o.cloudRepeat ?? 3 },
      uStars: { value: o.stars ? 1 : 0 }, uAurora: { value: o.aurora ? 1 : 0 }, uTime: TIME,
      uAuroraA: { value: new THREE.Color(o.auroraA ?? 0x59f2b8) }, uAuroraB: { value: new THREE.Color(o.auroraB ?? 0xb46cff) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uCloudTint, uAuroraA, uAuroraB;
      uniform float uSunSize, uHasClouds, uCloudRepeat, uStars, uAurora, uTime;
      uniform vec2 uCloudY;
      uniform sampler2D uClouds;
      varying vec3 vDir;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        // banded (cel) gradient: smooth base, then gently posterised
        float g = pow(smoothstep(0.0, 0.62, y), 0.8);
        g = mix(g, floor(g * 6.0 + 0.5) / 6.0, 0.35);
        vec3 col = y > 0.0 ? mix(uHorizon, uTop, g) : mix(uHorizon, uBottom, smoothstep(0.0, -0.2, y));
        float az = atan(d.z, d.x) / 6.2831853 + 0.5;
        if (uStars > 0.5 && y > 0.0) {
          vec2 sp = vec2(az * 900.0, y * 300.0);
          float s = step(0.996, h21(floor(sp))) * smoothstep(0.02, 0.25, y);
          s *= 0.6 + 0.4 * sin(uTime * 3.0 + h21(floor(sp) + 3.1) * 40.0);
          col += vec3(s);
        }
        if (uAurora > 0.5 && y > 0.02) {
          float a = 0.0;
          for (int k = 0; k < 3; k++) {
            float fk = float(k);
            float x = az * (5.0 + fk * 2.0) + uTime * (0.02 + fk * 0.01) + fk * 1.7;
            float wave = vn(vec2(x * 3.0, fk * 4.0 + uTime * 0.05)) * 0.18;
            float band = 0.22 + fk * 0.09 + wave;
            float curtain = smoothstep(0.0, 0.05, y - band + 0.06) * (1.0 - smoothstep(0.0, 0.22 + fk * 0.05, y - band));
            float rays = 0.55 + 0.45 * vn(vec2(x * 22.0, uTime * 0.3 + fk));
            a += curtain * rays * (0.65 - fk * 0.15);
          }
          vec3 ac = mix(uAuroraA, uAuroraB, smoothstep(0.25, 0.6, y));
          col += ac * a * 0.9;
        }
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (smoothstep(0.9990 - 0.0006 * uSunSize, 0.9994 - 0.0006 * uSunSize, sd) * 1.6 + pow(sd, 40.0) * 0.35 + pow(sd, 5.0) * 0.12);
        if (uHasClouds > 0.5) {
          float v = (y - uCloudY.x) / (uCloudY.y - uCloudY.x);
          if (v > 0.0 && v < 1.0) {
            vec4 c = texture2D(uClouds, vec2(az * uCloudRepeat, v));
            col = mix(col, c.rgb * uCloudTint, c.a);
          }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
  }));
  const geo = keep(new THREE.SphereGeometry(900, 48, 24));
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false; sky.renderOrder = -1000; sky.name = 'sky';
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  root.add(sky);
  return { mesh: sky, material: mat };
}

// =============================================================================================
// Lights + fog
// =============================================================================================
export function setupLights(ctx, o) {
  const { scene, quality } = ctx;
  const sunDir = o.sunDir.clone().normalize();
  const hemi = new THREE.HemisphereLight(o.hemiSky ?? 0xcfe8ff, o.hemiGround ?? 0x8a6f86, o.hemiIntensity ?? 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(o.sunColor ?? 0xfff0d8, o.sunIntensity ?? 2.6);
  const shadows = quality.shadows !== false;
  sun.castShadow = shadows;
  const SH = quality.shadowExtent ?? 70;
  const MAP = quality.shadowMap ?? 2048;
  if (shadows) {
    sun.shadow.mapSize.set(MAP, MAP);
    Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 600 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
  }
  scene.add(sun, sun.target);
  const texel = (SH * 2) / MAP;
  function setShadowFocus(v) {
    if (!v || !isFinite(v.x)) return;
    const fx = Math.round(v.x / texel) * texel, fz = Math.round(v.z / texel) * texel;
    sun.target.position.set(fx, v.y || 0, fz);
    sun.position.set(fx, v.y || 0, fz).addScaledVector(sunDir, 250);
    sun.target.updateMatrixWorld();
  }
  scene.fog = new THREE.Fog(o.fog ?? 0xcfe8fb, o.fogNear ?? 260, o.fogFar ?? 1300);
  scene.background = new THREE.Color(o.fog ?? 0xcfe8fb);
  RIM.color.value.set(o.rimColor ?? 0xfff1d6);
  RIM.strength.value = o.rimStrength ?? 0.35;
  return {
    sun, hemi, setShadowFocus, sunDir,
    dispose() {
      scene.remove(hemi, sun, sun.target);
      if (sun.shadow && sun.shadow.map) sun.shadow.map.dispose();
      scene.fog = null; scene.background = null;
    },
  };
}

// =============================================================================================
// Track corridor helpers
// =============================================================================================
/** spot(x, z, minClear): is (x,z) at least `minClear` metres outside the barrier? also returns distance & sample. */
export function makeSpot(L, exclusions = []) {
  return function spot(x, z, minClear = 3) {
    for (const e of exclusions) if ((x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r) return { ok: false };
    const q = L.nearest(x, z, true);
    if (q.i < 0) return { ok: true, d: 1e9, i: -1, lat: 0 };
    const i = q.i, d = Math.sqrt(q.d2);
    const lat = (x - L.px[i]) * L.rx[i] + (z - L.pz[i]) * L.rz[i];
    const wall = lat >= 0 ? L.wallR[i] : L.wallL[i];
    if (d < wall + minClear) return { ok: false, d: d - wall, i, lat };
    return { ok: true, d: d - wall, i, lat };
  };
}

/** Sample index i and lateral offset (+ right) -> world point on the centerline frame. */
export function frameAt(L, i, lat, out = new THREE.Vector3()) {
  i = ((i % L.N) + L.N) % L.N;
  return out.set(L.px[i] + L.rx[i] * lat, L.py[i], L.pz[i] + L.rz[i] * lat);
}

// =============================================================================================
// Terrain
// =============================================================================================
/**
 * Height-field terrain that eases into the road corridor. natural(x, z) gives the untouched land height.
 * Texturing: up to 3 painted textures splatted by per-vertex weights + a vertex tint.
 * o = { size, seg, center:[x,z], natural, weights(x,y,z,slope,near) -> [a,b,c], tint(x,y,z,...) -> Color|null,
 *       tex: [pathA, pathB, pathC], scale: [mA, mB, mC] (metres per tile), corridorMargin, corridorWidth, drop }
 */
export function buildTerrain(ctx, o) {
  const { L, root, keep } = ctx;
  const cx = o.center ? o.center[0] : (L.bounds.minX + L.bounds.maxX) / 2;
  const cz = o.center ? o.center[1] : (L.bounds.minZ + L.bounds.maxZ) / 2;
  const corridor = { w: 0, y: 0, d: 0, wall: 0, i: -1 };
  const margin = o.corridorMargin ?? 4, width = o.corridorWidth ?? 55, drop = o.drop ?? 0.6;
  function corridorAt(x, z) {
    const q = L.nearest(x, z, true);
    corridor.i = q.i;
    if (q.i < 0) { corridor.w = 0; corridor.d = 1e9; return corridor; }
    const i = q.i, d = Math.sqrt(q.d2);
    const lat = (x - L.px[i]) * L.rx[i] + (z - L.pz[i]) * L.rz[i];
    const wall = lat >= 0 ? L.wallR[i] : L.wallL[i];
    corridor.d = d; corridor.wall = wall; corridor.y = L.py[i];
    corridor.w = (1 - smoothstep(wall + margin, wall + width, d)) * (1 - L.bridge[i]);
    return corridor;
  }
  function heightAt(x, z) {
    const n = o.natural(x, z);
    const c = corridorAt(x, z);
    return c.w > 0 ? lerp(n, c.y - drop, c.w) : n;
  }
  const SIZE = o.size ?? 1900, SEG = Math.round((o.seg ?? 260) * (ctx.quality.terrainDetail ?? 1));
  const geo = keep(new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2));
  geo.translate(cx, 0, cz);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  const near = new Float32Array(pos.count);
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    pos.setY(k, heightAt(x, z));
    near[k] = corridor.w;
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const W = new Float32Array(pos.count * 3);
  const C = new Float32Array(pos.count * 3);
  const tint = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const slope = 1 - nrm.getY(k);
    const w = o.weights ? o.weights(x, y, z, slope, near[k]) : [1, 0, 0];
    const s = (w[0] + w[1] + w[2]) || 1;
    W[k * 3] = w[0] / s; W[k * 3 + 1] = w[1] / s; W[k * 3 + 2] = w[2] / s;
    tint.setRGB(1, 1, 1);
    if (o.tint) { const t = o.tint(x, y, z, slope, near[k]); if (t) tint.copy(t); }
    C[k * 3] = tint.r; C[k * 3 + 1] = tint.g; C[k * 3 + 2] = tint.b;
  }
  geo.setAttribute('splat', new THREE.BufferAttribute(W, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  const texs = (o.tex || []).map((p) => { const t = p ? texClone(p) : null; if (t) keep(t); return t; });
  const scales = o.scale || [8, 8, 8];
  const mat = keep(splatMaterial(texs, scales, o.baseColor ?? 0xffffff));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.name = 'terrain';
  root.add(mesh);
  return { mesh, heightAt, natural: o.natural, corridorAt };
}

/** Toon material that blends up to three world-projected (XZ) textures by the `splat` attribute. */
export function splatMaterial(texs, scales, baseColor = 0xffffff) {
  const m = toonMaterial({ color: baseColor, vertexColors: true, rim: false, cacheKey: 'splat' });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.tA = { value: texs[0] || null }; sh.uniforms.tB = { value: texs[1] || texs[0] || null }; sh.uniforms.tC = { value: texs[2] || texs[0] || null };
    sh.uniforms.sc = { value: new THREE.Vector3(1 / scales[0], 1 / (scales[1] || scales[0]), 1 / (scales[2] || scales[0])) };
    sh.uniforms.hasT = { value: texs[0] ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec2 vWXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tA, tB, tC;\nuniform vec3 sc;\nuniform float hasT;\nvarying vec3 vSplat;\nvarying vec2 vWXZ;')
      .replace('#include <map_fragment>', `
        if (hasT > 0.5) {
          vec3 a = texture2D(tA, vWXZ * sc.x).rgb;
          vec3 b = texture2D(tB, vWXZ * sc.y).rgb;
          vec3 c = texture2D(tC, vWXZ * sc.z).rgb;
          vec3 tcol = a * vSplat.x + b * vSplat.y + c * vSplat.z;
          diffuseColor.rgb *= tcol;
        }`);
  };
  return m;
}

// =============================================================================================
// Water
// =============================================================================================
/** Stylised toon water plane (banded colour by depth, animated foam lines, sparkles). depthAt(x,z) -> metres. */
export function buildWater(ctx, o) {
  const { root, keep, L } = ctx;
  const size = o.size ?? 4000;
  const res = 192;
  const cx = o.center ? o.center[0] : (L.bounds.minX + L.bounds.maxX) / 2;
  const cz = o.center ? o.center[1] : (L.bounds.minZ + L.bounds.maxZ) / 2;
  const span = o.depthSpan ?? 1900;
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = cx - span / 2 + (i + 0.5) / res * span, z = cz - span / 2 + (j + 0.5) / res * span;
    const d = Math.min(1, Math.max(0, o.depthAt(x, z) / (o.depthScale ?? 8)));
    data[(j * res + i) * 4] = d * 255; data[(j * res + i) * 4 + 3] = 255;
  }
  const depthTex = keep(new THREE.DataTexture(data, res, res, THREE.RGBAFormat));
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter; depthTex.needsUpdate = true;
  const mat = keep(new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDeep: { value: new THREE.Color(o.deep ?? 0x1679a8) }, uShallow: { value: new THREE.Color(o.shallow ?? 0x2bc4c9) },
      uFoam: { value: new THREE.Color(o.foam ?? 0xfff4dc) }, uSunDir: { value: (o.sunDir || new THREE.Vector3(0.3, 0.8, -0.5)).clone().normalize() },
      uDepth: { value: depthTex }, uBounds: { value: new THREE.Vector3(cx - span / 2, cz - span / 2, span) }, uTime: TIME,
      uSpark: { value: o.sparkle ?? 1 },
    }]),
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uDeep, uShallow, uFoam, uSunDir; uniform sampler2D uDepth; uniform vec3 uBounds; uniform float uTime, uSpark;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vWorld.xz;
        vec2 duv = (p - uBounds.xy) / uBounds.z;
        float depth = 1.0;
        if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) depth = texture2D(uDepth, duv).r;
        float n = vn(p * 0.08 + uTime * 0.05) * 0.6 + vn(p * 0.21 - uTime * 0.08) * 0.4;
        float band = floor((depth + (n - 0.5) * 0.12) * 4.0) / 4.0;     // cel bands by depth
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.9, band));
        // drifting highlight streaks
        float streak = smoothstep(0.78, 0.8, vn(vec2(p.x * 0.05 + uTime * 0.12, p.y * 0.18))) * 0.18;
        col += streak;
        // shore foam rings
        float ring = sin(depth * 34.0 - uTime * 1.8 + n * 4.0);
        float foam = smoothstep(0.82, 0.92, ring) * (1.0 - smoothstep(0.08, 0.3, depth)) + (1.0 - smoothstep(0.015, 0.05, depth));
        col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.9);
        float sp = step(0.988, vn(p * 1.3 + uTime * 0.7)) * uSpark;
        col += sp * vec3(1.0, 0.97, 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  }));
  const geo = keep(new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2));
  const water = new THREE.Mesh(geo, mat);
  water.position.set(cx, o.level ?? 0, cz);
  water.name = 'water';
  water.receiveShadow = false;
  root.add(water);
  return { mesh: water, material: mat };
}

// =============================================================================================
// Instancing
// =============================================================================================
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
/**
 * InstancedMesh from a list of { x, y, z, r (yaw), s, sx, sy, sz, tilt, tilt2, color }. Adds an ink outline if `ink`.
 */
export function instanced(ctx, geo, material, list, { cast = true, receive = true, ink = 0, name = '', colors = null, inkMat = null, keepAll = false } = {}) {
  const { root, quality } = ctx;
  // lower presets thin out large decor sets (trees, rocks, crowds) deterministically
  const density = quality.props ?? 1;
  if (!keepAll && density < 1 && list.length > 40) list = list.filter((it, k) => hash(k * 7 + 3, list.length) < density);
  const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
  list.forEach((it, k) => {
    _e.set(it.tilt || 0, it.r || 0, it.tilt2 || 0, 'YXZ');
    _q.setFromEuler(_e);
    const s = it.s ?? 1;
    _s.set(s * (it.sx || 1), s * (it.sy || 1), s * (it.sz || 1));
    im.setMatrixAt(k, _m4.compose(_p.set(it.x, it.y, it.z), _q, _s));
    const c = colors ? colors(it, k) : it.color;
    if (c != null) im.setColorAt(k, c.isColor ? c : new THREE.Color(c));
  });
  im.count = list.length;
  im.castShadow = cast && quality.shadows !== false; im.receiveShadow = receive;
  im.name = name;
  root.add(im);
  if (ink && quality.outlines !== false && geo.attributes.outlineN) addOutline(im, inkMat || ctx.inkMat);
  return im;
}

// =============================================================================================
// Critter crowd (spectators are generic critters, consistent with the roster)
// =============================================================================================
let critterGeos = null;
function critterGeometries() {
  if (critterGeos) return critterGeos;
  const eyes = (y, z, sp = 0.11) => [-1, 1].map((s) => paint(new THREE.SphereGeometry(0.055, 4, 3).translate(s * sp, y, z), 0x2b1d2e));
  const head = (extra) => mergePainted([paint(new THREE.SphereGeometry(0.3, 8, 6).scale(1, 0.92, 0.95).translate(0, 1.32, 0), 0xffffff),
    paint(new THREE.SphereGeometry(0.13, 6, 4).scale(1.1, 0.8, 0.8).translate(0, 1.24, 0.24), 0xfff4dc), ...eyes(1.38, 0.25), ...extra], 1);
  const cone = (x, y, z, r, h, rz = 0) => paint(new THREE.ConeGeometry(r, h, 4).rotateZ(rz).translate(x, y, z), 0xffffff);
  const sph = (x, y, z, r, sx = 1, sy = 1, sz = 1) => paint(new THREE.SphereGeometry(r, 6, 4).scale(sx, sy, sz).translate(x, y, z), 0xffffff);
  critterGeos = {
    body: mergePainted([paint(new THREE.CapsuleGeometry(0.3, 0.5, 2, 7).translate(0, 0.62, 0), 0xffffff),
      paint(new THREE.CylinderGeometry(0.07, 0.07, 0.45, 4).rotateZ(2.6).translate(0.36, 1.0, 0.05), 0xffffff),
      paint(new THREE.CylinderGeometry(0.07, 0.07, 0.45, 4).rotateZ(-2.6).translate(-0.36, 1.0, 0.05), 0xffffff)], 1),
    heads: [
      head([cone(0.17, 1.6, 0, 0.1, 0.24, -0.35), cone(-0.17, 1.6, 0, 0.1, 0.24, 0.35)]),            // cat / fox
      head([sph(0.21, 1.56, 0, 0.1), sph(-0.21, 1.56, 0, 0.1)]),                                      // bear / mouse
      head([sph(0.1, 1.78, 0, 0.07, 1, 3, 0.6), sph(-0.1, 1.78, 0, 0.07, 1, 3, 0.6)]),                // bunny
      head([paint(new THREE.TorusGeometry(0.12, 0.04, 4, 6, Math.PI).translate(0.2, 1.52, 0), 0xffffff), paint(new THREE.TorusGeometry(0.12, 0.04, 4, 6, Math.PI).rotateY(Math.PI).translate(-0.2, 1.52, 0), 0xffffff)]), // ram-ish
    ],
  };
  return critterGeos;
}

const BOUNCE = `
  #ifdef USE_INSTANCING
    float ph = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 0.71;
    float jumper = step(0.4, fract(ph * 0.173));
    float hop = jumper * max(0.0, sin(uTime * (6.0 + fract(ph) * 3.0) + ph)) * 0.35;
    transformed.y += hop;
    transformed.x += sin(uTime * 2.0 + ph) * 0.04 * position.y;
  #endif`;

/**
 * Place critter spectators: spots = [{ x, y, z, r }]. Fur colours vary per instance.
 */
export function crowd(ctx, spots, { palette = [0xf0b46a, 0x8a5a3c, 0xaab4bf, 0xffa6c9, 0xfbfbf7, 0x5a5a66, 0xd63c8c, 0x6b9a5b, 0xe9c46a, 0x9fb3e6], shirts = [0xe2366f, 0x19b5a5, 0xffd23f, 0x6b4bc4, 0xff8a1e, 0xfff4dc] } = {}) {
  const { keep } = ctx;
  if (!spots.length) return [];
  const g = critterGeometries();
  const mat = keep(toonMaterial({ vertexColors: true, vertex: BOUNCE, cacheKey: 'crowd' }));
  const ink = ctx.quality.crowdOutlines ? keep(outlineMaterial({ width: 0.025, vertex: BOUNCE, cacheKey: 'crowd', fadeStart: 60, fadeEnd: 110 })) : null;
  const rnd = mulberry(spots.length * 13 + 7);
  const out = [];
  const bodies = instanced(ctx, g.body, mat, spots, { cast: false, colors: () => new THREE.Color(shirts[(rnd() * shirts.length) | 0]), ink: ink ? 1 : 0, inkMat: ink, name: 'crowdBodies' });
  out.push(bodies);
  const groups = g.heads.map(() => []);
  spots.forEach((s, k) => groups[(rnd() * groups.length) | 0].push(s));
  groups.forEach((list, h) => {
    if (!list.length) return;
    out.push(instanced(ctx, g.heads[h], mat, list, { cast: false, colors: () => new THREE.Color(palette[(rnd() * palette.length) | 0]), ink: ink ? 1 : 0, inkMat: ink, name: 'crowdHeads' + h }));
  });
  return out;
}

// =============================================================================================
// Bunting (pennant strings) and flags
// =============================================================================================
/** lines = [{ a: Vector3, b: Vector3, sag }]; triangles hang from a catenary and flutter. */
export function bunting(ctx, lines, { colors = [0xe2366f, 0xffd23f, 0x19b5a5, 0xff8a1e, 0xfff4dc, 0x6b4bc4], spacing = 1.1 } = {}) {
  const { keep } = ctx;
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.42, 0, 0, 0.42, 0, 0, 0, -0.85, 0]), 3));
  tri.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  keep(tri);
  const list = [];
  const rope = [];
  const v = new THREE.Vector3();
  for (const ln of lines) {
    const L = ln.a.distanceTo(ln.b);
    const n = Math.max(2, Math.floor(L / spacing));
    const yaw = Math.atan2(ln.b.x - ln.a.x, ln.b.z - ln.a.z) - Math.PI / 2;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      v.lerpVectors(ln.a, ln.b, t); v.y -= Math.sin(t * Math.PI) * (ln.sag ?? L * 0.06);
      if (k < n) list.push({ x: v.x, y: v.y, z: v.z, r: yaw, color: colors[k % colors.length] });
      rope.push(v.clone());
    }
  }
  const mat = keep(toonMaterial({ side: THREE.DoubleSide, rim: false, cacheKey: 'bunting', vertex: `
    #ifdef USE_INSTANCING
      float bph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.4;
      transformed.z += sin(uTime * 5.0 + bph) * 0.18 * (-position.y);
    #endif` }));
  return instanced(ctx, tri, mat, list, { cast: false, name: 'bunting' });
}

/** Waving flags on poles: spots = [{ x, y, z, r, color, h }]. */
export function flags(ctx, spots) {
  const { keep } = ctx;
  if (!spots.length) return null;
  const poleGeo = keep(new THREE.CylinderGeometry(0.08, 0.11, 7, 6).translate(0, 3.5, 0));
  computeOutlineNormals(poleGeo);
  const flagGeo = keep(new THREE.PlaneGeometry(2.6, 1.6, 10, 3).translate(1.3, 6.1, 0));
  const poleMat = keep(toonMaterial({ color: 0xfff4dc }));
  const flagMat = keep(toonMaterial({ side: THREE.DoubleSide, cacheKey: 'flag', vertex: `
    #ifdef USE_INSTANCING
      float fph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
      float fw = clamp(position.x / 2.6, 0.0, 1.0);
      transformed.z += sin(uTime * 6.0 - position.x * 1.7 + fph) * 0.38 * fw;
      transformed.y += sin(uTime * 3.7 - position.x * 1.2 + fph) * 0.1 * fw;
    #endif` }));
  instanced(ctx, poleGeo, poleMat, spots, { name: 'flagPoles', ink: 1 });
  return instanced(ctx, flagGeo, flagMat, spots, { cast: false, name: 'flags' });
}

// =============================================================================================
// Weather / ambient particles (follow the camera)
// =============================================================================================
/**
 * Falling/drifting points around the camera. type: 'snow' | 'dust' | 'petals' | 'embers'.
 */
export function weather(ctx, { type = 'snow', count = 3000, area = 90, height = 45, color = 0xffffff, size = 0.35, speed = 3.2, wind = [1.2, 0.4] } = {}) {
  const { root, keep } = ctx;
  const n = Math.round(count * (ctx.quality.particles ?? 1));
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  const rnd = mulberry(99 + n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * area; pos[i * 3 + 1] = rnd() * height; pos[i * 3 + 2] = (rnd() - 0.5) * area; seed[i] = rnd(); }
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = keep(new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uCam: { value: new THREE.Vector3() }, uArea: { value: area }, uH: { value: height }, uColor: { value: new THREE.Color(color) },
      uSize: { value: size }, uSpeed: { value: speed }, uWind: { value: new THREE.Vector2(wind[0], wind[1]) }, uScale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime, uArea, uH, uSize, uSpeed, uScale; uniform vec3 uCam; uniform vec2 uWind;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * uSpeed * (0.7 + seed * 0.6);
        p.y = mod(p.y - t, uH);
        p.x += uWind.x * uTime + sin(uTime * 0.9 + seed * 30.0) * 1.2;
        p.z += uWind.y * uTime + cos(uTime * 0.7 + seed * 20.0) * 1.2;
        vec3 w = vec3(mod(p.x - uCam.x + uArea * 0.5, uArea) - uArea * 0.5 + uCam.x, p.y + uCam.y - uH * 0.35, mod(p.z - uCam.z + uArea * 0.5, uArea) - uArea * 0.5 + uCam.z);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale / max(1.0, -mv.z) * (0.6 + seed * 0.8);
        vA = smoothstep(uArea * 0.5, uArea * 0.3, length(w.xz - uCam.xz));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.3, d) * vA;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  }));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.name = 'weather-' + type;
  pts.onBeforeRender = (r, s, cam) => { mat.uniforms.uCam.value.copy(cam.position); mat.uniforms.uScale.value = r.domElement.height * 0.5; };
  root.add(pts);
  return pts;
}

// =============================================================================================
// Sponsor banner boards along the barriers
// =============================================================================================
/** Billboards standing just behind the wall: spots = [{ i (sample), side (+1 right/-1 left), tex }]. */
export function bannerBoards(ctx, spots, { w = 9, h = 2.4, lift = 1.3 } = {}) {
  const { L, keep, root } = ctx;
  const byTex = new Map();
  for (const s of spots) { if (!byTex.has(s.tex)) byTex.set(s.tex, []); byTex.get(s.tex).push(s); }
  for (const [path, list] of byTex) {
    const t = texClone(path, { repeat: false }); if (!t) continue; keep(t);
    const mat = keep(toonMaterial({ map: t, rim: false }));
    const backMat = keep(toonMaterial({ color: 0x2b1d2e }));
    const parts = [], backs = [];
    for (const s of list) {
      const i = ((s.i % L.N) + L.N) % L.N;
      const wall = s.side > 0 ? L.wallR[i] : L.wallL[i];
      const p = frameAt(L, i, s.side * (wall + 0.9));
      const yaw = Math.atan2(-s.side * L.rx[i], -s.side * L.rz[i]); // face the road
      const g = new THREE.PlaneGeometry(w, h).rotateY(yaw).translate(p.x, p.y + lift + h / 2, p.z);
      parts.push(g);
      backs.push(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.2).rotateY(yaw).translate(p.x - Math.sin(yaw) * 0.12, p.y + lift + h / 2, p.z - Math.cos(yaw) * 0.12));
      for (const sx of [-1, 1]) backs.push(new THREE.CylinderGeometry(0.12, 0.12, lift + 0.2, 6).translate(p.x + Math.cos(yaw) * sx * (w / 2 - 0.4), p.y + (lift + 0.2) / 2, p.z - Math.sin(yaw) * sx * (w / 2 - 0.4)));
    }
    const g = keep(mergeGeometries(parts)); parts.forEach((x) => x.dispose());
    const b = keep(mergeGeometries(backs.map((x) => { x.deleteAttribute('uv'); return x; }))); backs.forEach((x) => x.dispose());
    const m1 = new THREE.Mesh(g, mat); m1.name = 'banners'; root.add(m1);
    const m2 = new THREE.Mesh(b, backMat); m2.castShadow = ctx.quality.shadows !== false; root.add(m2);
  }
}

/** Animated shallow-water sheet for fords/puddles laid over the road (transparent, cel-banded ripples). */
export function shallowWaterMaterial({ color = 0x46c4d8, foam = 0xe6fbff, opacity = 0.62 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: TIME, uCol: { value: new THREE.Color(color) }, uFoam: { value: new THREE.Color(foam) }, uOp: { value: opacity } }]),
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uOp; uniform vec3 uCol, uFoam; varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_fragment>
      void main() {
        float w = sin(vW.x * 2.1 + uTime * 2.6) * 0.5 + sin(vW.z * 1.7 - uTime * 2.1) * 0.5;
        float r = step(0.86, fract(w * 0.9 + vW.x * 0.11 + vW.z * 0.09));
        vec3 col = mix(uCol, uFoam, r * 0.35);
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        gl_FragColor = vec4(col, uOp * edge);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}
