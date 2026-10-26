// Harborlight Bay — Mediterranean-style seaside town. Promenade start along the sea, a stone bridge over the harbour
// inlet, a lighthouse headland, uphill town streets with bunting, a terrace jump down to the beach where crabs scuttle
// across the road, a shallow ford, and back to the promenade. Variant 'night' = Lantern Night (unlockable).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as E from '../envkit.js';
import { toonMaterial, outlineMaterial, computeOutlineNormals, TIME } from '../toon.js';
import { texClone } from '../assets.js';

const S = 1.15; // layout scale (world = points * S)
const SEA = 0;  // water level

// coast line (world z of the shore) and the harbour inlet
const coastZ = (x) => -30 - 10 * E.fbm(x * 0.012 + 3, 1.7, 2) + (x < -120 ? (x + 120) * 0.08 : 0);
const inletHalf = (z) => 34 + 8 * E.fbm(z * 0.03, 5.1, 2);
const INLET_X = 232, INLET_HEAD = 128;
const LIGHTHOUSE = { x: 478, z: -42 };

function landFactor(x, z) {
  const c = coastZ(x);
  let f = E.smoothstep(c - 7, c + 7, z);
  // inlet cuts into the land up to its rounded head
  const dx = Math.abs(x - INLET_X) - inletHalf(z);
  const inside = E.smoothstep(4, -6, dx) * E.smoothstep(INLET_HEAD + 10, INLET_HEAD - 12, z);
  f *= 1 - inside;
  // lighthouse point juts out into the sea
  const dl = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
  f = Math.max(f, E.smoothstep(46, 30, dl));
  return f;
}
function natural(x, z) {
  const lf = landFactor(x, z);
  let land = 1.3 + 12.5 * E.smoothstep(-10, 290, z) + 3.5 * E.fbm(x * 0.012, z * 0.012, 3);
  land += 55 * Math.pow(E.smoothstep(300, 520, z), 1.4) * (0.6 + 0.4 * E.fbm(x * 0.006, z * 0.006, 3)); // hills behind town
  land += 26 * E.smoothstep(560, 760, Math.abs(x - 110)) * E.smoothstep(-50, 120, z);                   // side hills
  const dl = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
  land = Math.max(land, 9 * E.smoothstep(40, 12, dl) + 2);
  const beach = E.smoothstep(-260, -40, -x) * 0; // reserved
  void beach;
  return E.lerp(-7 - 3 * E.fbm(x * 0.02, z * 0.02, 2), land, lf);
}

export default {
  id: 'harbor',
  name: 'Harborlight Bay',
  nameZh: '灯塔湾',
  music: 'harbor',
  scale: S,
  halfWidth: 12,
  runoff: 7,
  runoffZones: [{ from: 6.6, to: 13.4, runoff: 4.5 }],
  points: [
    [0, 1, 0], [90, 1, 0], [160, 2.6, 2], [240, 3, 4], [310, 2, 10], [360, 3, 60], [350, 6, 140], [300, 9, 200],
    [220, 11, 225], [130, 12, 215], [60, 11, 245], [-20, 10, 225], [-90, 8, 250], [-160, 6, 215], [-200, 4, 150],
    [-210, 2.2, 80], [-180, 1, 20], [-120, 0.7, -30], [-60, 0.8, -25], [-30, 1, -5],
  ],
  bridges: [{ from: 1.72, to: 2.92 }],
  boostPads: [{ at: 4.55, lats: [-5, 5], stagger: false }, { at: 10.5, lats: [-6, 0, 6] }, { at: 18.2, lats: ['race', 'race'] }],
  ramps: [{ at: 15.25, hw: 11, h: 1.8 }],
  itemRows: [0.9, 5.3, 8.6, 12.2, 16.1, 18.6],
  zones: [{ type: 'splash', from: 17.2, to: 17.55, lat: 0, hw: 17 }],
  pierBottom: -8,
  style: {
    roadTex: 'textures/common/road_harbor.webp', roadTint: 0xf2ece6, roadAlongScale: 26,
    offroadTex: 'textures/common/grass.webp', offroadScale: 7,
    deckTex: 'textures/common/cobble.webp', deckTint: 0xffffff,
    wallTex: 'textures/common/cobble.webp', wallTint: 0xf2e6d0, wallTexLen: 6, wallTop: 0xfff4dc,
    railTex: 'textures/common/cobble.webp', railTint: 0xfff0dc, pierColor: 0xe9dcc3, pierTex: 'textures/common/cobble.webp',
    curbA: '#e2366f', curbB: '#fff4dc', boostA: '#19b5a5', boostB: '#7ff5e6', rampA: '#ff8a1e', rampB: '#fff4dc',
    tireColors: [0xe2366f, 0xfff4dc, 0x19b5a5, 0xfff4dc],
    lineColor: 0xfff4dc, dashColor: 0xffd23f,
    zones: {
      splash: { material: () => E.shallowWaterMaterial() },
    },
  },
  buildEnvironment,
};

function buildEnvironment(ctx) {
  const { L, root, keep, quality, hazards, variant } = ctx;
  const night = variant === 'night';
  const rnd = E.mulberry(4242);
  const updaters = [];

  // ------------------------------------------------------------------ sky, light, fog
  const sunDir = night ? new THREE.Vector3(-0.3, 0.55, 0.6) : new THREE.Vector3(0.45, 0.55, 0.62);
  E.createSky(ctx, night
    ? { top: 0x141a45, horizon: 0x5a3f86, bottom: 0x2a2550, sunDir, sunColor: 0xd8e4ff, sunSize: 2.5, stars: true }
    : { top: 0x3fa8e8, horizon: 0xfff0d2, bottom: 0xbfe6f5, sunDir, sunColor: 0xfff2cf, clouds: 'textures/sky/clouds_day.webp', cloudLow: -0.01, cloudHigh: 0.26, cloudRepeat: 3 });
  const lights = E.setupLights(ctx, night
    ? { sunDir, sunColor: 0x9fb3ff, sunIntensity: 0.9, hemiSky: 0x5a5fb0, hemiGround: 0x2a2040, hemiIntensity: 0.9, fog: 0x2e2856, fogNear: 160, fogFar: 900, rimColor: 0xffc46b, rimStrength: 0.55 }
    : { sunDir, sunColor: 0xfff0d6, sunIntensity: 2.7, hemiSky: 0xd8eeff, hemiGround: 0x9b7f6a, hemiIntensity: 1.15, fog: 0xf6ead4, fogNear: 260, fogFar: 1350, rimColor: 0xfff1d6, rimStrength: 0.3 });

  // ------------------------------------------------------------------ terrain + sea
  const terrain = E.buildTerrain(ctx, {
    size: 2000, seg: 250, center: [120, 120], natural,
    tex: ['textures/common/grass.webp', 'textures/common/sand.webp', 'textures/common/rock_grey.webp'], scale: [9, 8, 12],
    weights: (x, y, z, slope) => {
      const sand = E.smoothstep(SEA + 3.0, SEA + 1.6, y);
      const rock = Math.min(1, E.smoothstep(0.25, 0.42, slope) + E.smoothstep(40, 30, Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z)) * 0.8);
      return [Math.max(0, 1 - sand) * (1 - rock), sand * (1 - rock), rock];
    },
    tint: (x, y, z) => {
      const c = new THREE.Color(0xffffff);
      c.lerp(new THREE.Color(0xc9e6a0), E.fbm(x * 0.01, z * 0.01, 2) * 0.35);
      if (night) c.multiplyScalar(0.9);
      return c;
    },
  });
  const heightAt = terrain.heightAt;
  E.buildWater(ctx, {
    level: SEA, center: [120, 120], depthSpan: 2000,
    depthAt: (x, z) => SEA - natural(x, z),
    deep: night ? 0x16306a : 0x1679a8, shallow: night ? 0x2a5f9a : 0x2bc4c9, foam: night ? 0xc8d8ff : 0xfff4dc, sunDir, sparkle: night ? 0.4 : 1,
  });

  const spot = E.makeSpot(L, [{ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 30 }]);
  const inTown = (z) => z > 160;
  const ink = ctx.inkMat;

  // ------------------------------------------------------------------ town houses (facade atlas + tiled roofs)
  {
    const facade = texClone('textures/harbor/facades.webp', { repeat: false }); if (facade) keep(facade);
    const roofTex = texClone('textures/common/roof_tiles.webp'); if (roofTex) keep(roofTex);
    const wallMat = keep(toonMaterial({ map: facade, color: night ? 0xb9b4d6 : 0xffffff }));
    const roofMat = keep(toonMaterial({ map: roofTex, color: night ? 0xa58fb8 : 0xffffff }));
    const walls = [], roofs = [], windows = [];
    const placed = [];
    const addHouse = (x, z, yaw, w, d, h, variantIdx) => {
      const y0 = heightAt(x, z) - 1;
      const u0 = (variantIdx % 2) * 0.5, v0 = variantIdx < 2 ? 0.5 : 0;   // atlas quadrant (texture v up)
      const g = new THREE.BoxGeometry(w, h + 1, d);
      const uv = g.attributes.uv;
      // faces: +x, -x, +y, -y, +z, -z (4 verts each). Front (+z) & back (-z) use the facade, sides a plaster strip.
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const i = f * 4 + k; const u = uv.getX(i), v = uv.getY(i);
        if (f === 4 || f === 5) uv.setXY(i, u0 + 0.02 + u * 0.46, v0 + 0.02 + v * 0.46);
        else uv.setXY(i, u0 + 0.03 + u * 0.03, v0 + 0.3 + v * 0.1);
      }
      g.rotateY(yaw).translate(x, y0 + (h + 1) / 2, z);
      walls.push(g);
      // gable roof along the house width
      const rh = 2.2 + w * 0.12;
      const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.5, 0), new THREE.Vector2(w / 2 + 0.5, 0), new THREE.Vector2(0, rh)]);
      const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 1, bevelEnabled: false });
      rg.translate(0, 0, -(d + 1) / 2);
      const ruv = rg.attributes.uv; for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 0.25, ruv.getY(i) * 0.25);
      rg.rotateY(yaw).translate(x, y0 + h + 1, z);
      roofs.push(rg);
      if (night) windows.push({ x, y: y0 + h * 0.55, z, yaw, w });
      placed.push({ x, z, r: Math.max(w, d) * 0.7 });
    };
    const step = Math.round(11 / L.ds);
    for (let i = 0; i < L.N; i += step) {
      if (!inTown(L.pz[i])) continue;
      for (const side of [1, -1]) {
        for (let row = 0; row < 2; row++) {
          const wall = side > 0 ? L.wallR[i] : L.wallL[i];
          const w = 7 + rnd() * 3, d = 7 + rnd() * 3, h = 7 + rnd() * 7 + (row ? 4 : 0);
          const lat = side * (wall + 2.5 + d / 2 + row * 13 + rnd() * 1.5);
          const p = E.frameAt(L, i, lat);
          if (!spot(p.x, p.z, 2 + d / 2 - 0.5).ok) continue;
          if (placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + Math.max(w, d) * 0.6)) continue;
          if (landFactor(p.x, p.z) < 0.98) continue;
          const yaw = Math.atan2(-side * L.rx[i], -side * L.rz[i]); // front faces the road
          addHouse(p.x, p.z, yaw, w, d, h, (rnd() * 4) | 0);
        }
      }
    }
    // a few houses along the promenade's town side + near the inlet
    for (let i = Math.round(L.N * 0.92); i < L.N + Math.round(L.N * 0.08); i += step) {
      const ii = i % L.N;
      const wall = L.wallR[ii];
      const p = E.frameAt(L, ii, wall + 9);
      if (!spot(p.x, p.z, 6).ok || placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 6)) continue;
      addHouse(p.x, p.z, Math.atan2(-L.rx[ii], -L.rz[ii]), 8 + rnd() * 2, 8, 8 + rnd() * 5, (rnd() * 4) | 0);
    }
    if (walls.length) {
      const wg = keep(mergeGeometries(walls)); walls.forEach((g) => g.dispose()); computeOutlineNormals(wg);
      const rg = keep(mergeGeometries(roofs)); roofs.forEach((g) => g.dispose()); computeOutlineNormals(rg);
      const wm = new THREE.Mesh(wg, wallMat); wm.castShadow = quality.shadows !== false; wm.receiveShadow = true; wm.name = 'houses'; root.add(wm);
      const rm = new THREE.Mesh(rg, roofMat); rm.castShadow = quality.shadows !== false; rm.name = 'roofs'; root.add(rm);
      if (quality.outlines !== false) { root.add(new THREE.Mesh(wg, ink)); root.add(new THREE.Mesh(rg, ink)); }
    }
    if (night && windows.length) {
      // warm glowing window panes on lantern night
      const panes = [];
      for (const wnd of windows) for (let k = 0; k < 3; k++) {
        const g = new THREE.PlaneGeometry(1.1, 1.4).translate((k - 1) * wnd.w * 0.28, 0, 0).rotateY(wnd.yaw);
        const fx = Math.sin(wnd.yaw), fz = Math.cos(wnd.yaw);
        g.translate(wnd.x + fx * (4.7), wnd.y + (k % 2) * 2.5, wnd.z + fz * (4.7));
        panes.push(g);
      }
      const pg = keep(mergeGeometries(panes)); panes.forEach((g) => g.dispose());
      root.add(new THREE.Mesh(pg, keep(new THREE.MeshBasicMaterial({ color: 0xffc46b }))));
    }
    // bunting across the town streets
    const lines = [];
    for (let i = 0; i < L.N; i += Math.round(36 / L.ds)) {
      if (!inTown(L.pz[i])) continue;
      const a = E.frameAt(L, i, L.wallR[i] + 1.5), b = E.frameAt(L, i, -L.wallL[i] - 1.5);
      a.y = L.py[i] + 8.5; b.y = L.py[i] + 8.5;
      lines.push({ a, b, sag: 1.6 });
    }
    E.bunting(ctx, lines);
  }

  // ------------------------------------------------------------------ lighthouse landmark
  let beam = null;
  {
    const gy = heightAt(LIGHTHOUSE.x, LIGHTHOUSE.z);
    const parts = [];
    parts.push(E.paint(new THREE.CylinderGeometry(9, 12, 6, 12).translate(0, gy - 1, 0), 0xb9b0a3));
    const prof = [];
    for (let k = 0; k <= 10; k++) prof.push(new THREE.Vector2(3.4 - k * 0.12, k * 2.4));
    for (let k = 0; k < 5; k++) {
      const seg = new THREE.LatheGeometry(prof.slice(k * 2, k * 2 + 3), 20).translate(0, gy + 2, 0);
      parts.push(E.paint(seg, k % 2 ? 0xfff4dc : 0xe2366f));
    }
    const top = gy + 2 + 24;
    parts.push(E.paint(new THREE.CylinderGeometry(3.3, 3.3, 0.6, 20).translate(0, top + 0.3, 0), 0x2b1d2e));
    parts.push(E.paint(new THREE.CylinderGeometry(3.6, 3.6, 0.3, 20).translate(0, top + 0.6, 0), 0xfff4dc));
    parts.push(E.paint(new THREE.ConeGeometry(2.6, 2.4, 20).translate(0, top + 5.6, 0), 0xe2366f));
    parts.push(E.paint(new THREE.SphereGeometry(0.5, 10, 8).translate(0, top + 7, 0), 0xffd23f));
    const g = keep(E.mergePainted(parts));
    g.translate(LIGHTHOUSE.x, 0, LIGHTHOUSE.z);
    const m = new THREE.Mesh(g, keep(toonMaterial({ vertexColors: true })));
    m.castShadow = quality.shadows !== false; m.name = 'lighthouse';
    root.add(m);
    if (quality.outlines !== false) root.add(new THREE.Mesh(g, ink));
    const lamp = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.2, 2.2, 3.6, 16)), keep(new THREE.MeshBasicMaterial({ color: night ? 0xfff2a0 : 0xfff6d0 })));
    lamp.position.set(LIGHTHOUSE.x, top + 2.6, LIGHTHOUSE.z); root.add(lamp);
    const beamGeo = keep(new THREE.ConeGeometry(7, 90, 20, 1, true).translate(0, -45, 0).rotateZ(Math.PI / 2));
    beam = new THREE.Mesh(beamGeo, keep(new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: night ? 0.22 : 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
    beam.position.copy(lamp.position);
    root.add(beam);
    updaters.push((dt, t) => { beam.rotation.y = t * 0.6; });
  }

  // ------------------------------------------------------------------ trees: umbrella pines, cypresses, bushes
  {
    const pines = [], cypress = [], bushes = [], flowers = [];
    let guard = 0;
    while ((pines.length < 260 || cypress.length < 160 || bushes.length < 300) && guard++ < 60000) {
      const x = -520 + rnd() * 1300, z = -60 + rnd() * 700;
      if (landFactor(x, z) < 0.99) continue;
      const s = spot(x, z, 5);
      if (!s.ok) continue;
      const y = heightAt(x, z);
      if (y < SEA + 2.4) continue;
      if (inTown(z) && s.d < 32) continue;           // keep the house rows clear
      const r = rnd();
      if (r < 0.4 && pines.length < 260) pines.push({ x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.9 + rnd() * 0.6 });
      else if (r < 0.65 && cypress.length < 160) cypress.push({ x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
      else if (bushes.length < 300) { bushes.push({ x, y: y - 0.1, z, r: rnd() * 6.28, s: 0.7 + rnd() * 0.7 }); if (rnd() < 0.5) flowers.push({ x: x + 1, y: y + 0.6, z, r: rnd() * 6.28, s: 1, color: [0xe2366f, 0xffd23f, 0xfff4dc, 0xb46cff][(rnd() * 4) | 0] }); }
    }
    const pineG = keep(E.mergePainted([
      E.paint(new THREE.CylinderGeometry(0.3, 0.5, 8, 7).translate(0, 4, 0).rotateZ(0.08), 0x8a5a3c),
      E.paint(new THREE.SphereGeometry(4.2, 10, 6).scale(1.25, 0.42, 1.1).translate(0.6, 8.6, 0), 0x4f8a3a),
      E.paint(new THREE.SphereGeometry(3.0, 9, 6).scale(1.2, 0.45, 1).translate(-1.6, 8.2, 1.2), 0x5f9d45),
    ]));
    const cypG = keep(E.mergePainted([
      E.paint(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 6).translate(0, 0.6, 0), 0x8a5a3c),
      E.paint(new THREE.SphereGeometry(1.4, 9, 10).scale(1, 4.2, 1).translate(0, 6, 0), 0x2f6b3a),
    ]));
    const bushG = keep(E.mergePainted([E.paint(new THREE.IcosahedronGeometry(1.4, 1).scale(1.2, 0.8, 1.1).translate(0, 0.7, 0), 0x5f9d45)]));
    const flowerG = keep(E.mergePainted([E.paint(new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.6, 1), 0xffffff)], 0.6));
    const vm = keep(toonMaterial({ vertexColors: true, color: night ? 0x8f8fc0 : 0xffffff }));
    E.instanced(ctx, pineG, vm, pines, { ink: 1, name: 'pines' });
    E.instanced(ctx, cypG, vm, cypress, { ink: 1, name: 'cypress' });
    E.instanced(ctx, bushG, vm, bushes, { ink: 1, cast: false, name: 'bushes' });
    E.instanced(ctx, flowerG, keep(toonMaterial({ color: 0xffffff })), flowers, { cast: false, name: 'flowers' });
  }

  // ------------------------------------------------------------------ promenade: critter crowd on terraced steps, lamps, flags, banners
  {
    const stepGeos = [];
    const spots = [];
    const i0 = Math.round(L.N * 0.955), i1 = L.N + Math.round(L.N * 0.04);
    for (let ii = i0; ii < i1; ii += Math.round(1.6 / L.ds)) {
      const i = ii % L.N;
      const wall = L.wallR[i];
      for (let tier = 0; tier < 4; tier++) {
        const p = E.frameAt(L, i, wall + 1.8 + tier * 1.4);
        const y = L.py[i] + tier * 0.75;
        if (ii % Math.round(8 / L.ds) === 0) {
          stepGeos.push(E.paint(new THREE.BoxGeometry(8.4, y - L.py[i] + 1.2, 1.45).rotateY(L.head[i]).translate(p.x, L.py[i] + (y - L.py[i] + 1.2) / 2 - 0.6, p.z), tier % 2 ? 0xf2e6d0 : 0xe9d9bd));
        }
        if (rnd() < 0.75) spots.push({ x: p.x + (rnd() - 0.5) * 0.3, y: y + 0.6, z: p.z + (rnd() - 0.5) * 0.3, r: Math.atan2(-L.rx[i], -L.rz[i]) + (rnd() - 0.5) * 0.5, s: 0.95 + rnd() * 0.2 });
      }
    }
    if (stepGeos.length) {
      const g = keep(E.mergePainted(stepGeos));
      const m = new THREE.Mesh(g, keep(toonMaterial({ vertexColors: true }))); m.receiveShadow = true; m.name = 'steps'; root.add(m);
    }
    // spectators on the inner side of the bridge approach and at the lighthouse corner too
    for (let k = 0; k < 40; k++) {
      const i = Math.round(L.N * (0.2 + rnd() * 0.05));
      const p = E.frameAt(L, i, -(L.wallL[i] + 2 + rnd() * 3));
      if (landFactor(p.x, p.z) < 0.99) continue;
      spots.push({ x: p.x, y: heightAt(p.x, p.z) + 0.1, z: p.z, r: Math.atan2(L.rx[i], L.rz[i]), s: 1 });
    }
    E.crowd(ctx, spots);

    // street lamps along the promenade (sea side) and town
    const lampSpots = [];
    for (let i = 0; i < L.N; i += Math.round(24 / L.ds)) {
      const z = L.pz[i];
      if (!(inTown(z) || i > L.N * 0.9 || i < L.N * 0.08)) continue;
      for (const side of [1, -1]) {
        const lat = side * ((side > 0 ? L.wallR[i] : L.wallL[i]) + 1.1);
        const p = E.frameAt(L, i, lat);
        lampSpots.push({ x: p.x, y: L.py[i], z: p.z, r: 0 });
      }
    }
    const postG = keep(E.mergePainted([
      E.paint(new THREE.CylinderGeometry(0.12, 0.18, 5.2, 6).translate(0, 2.6, 0), 0x2b1d2e),
      E.paint(new THREE.CylinderGeometry(0.35, 0.25, 0.25, 6).translate(0, 5.25, 0), 0x2b1d2e),
      E.paint(new THREE.ConeGeometry(0.45, 0.45, 6).translate(0, 6.15, 0), 0x2b1d2e),
    ]));
    E.instanced(ctx, postG, keep(toonMaterial({ vertexColors: true })), lampSpots, { ink: 0, name: 'lampPosts', keepAll: true });
    const bulbG = keep(new THREE.SphereGeometry(0.42, 10, 8).translate(0, 5.7, 0));
    E.instanced(ctx, bulbG, keep(new THREE.MeshBasicMaterial({ color: night ? 0xffd27a : 0xfff4dc })), lampSpots, { cast: false, name: 'lampBulbs', keepAll: true });
    if (night) {
      // warm light pools on the road under each lamp (cheap fake lights)
      const poolG = keep(new THREE.CircleGeometry(5.5, 20).rotateX(-Math.PI / 2).translate(0, 0.06, 0));
      const poolM = keep(new THREE.MeshBasicMaterial({ color: 0xffb54a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      E.instanced(ctx, poolG, poolM, lampSpots, { cast: false, receive: false, name: 'lightPools', keepAll: true });
    }

    // flags near the start + sponsor banners on the promenade walls
    const flagSpots = [];
    for (let k = -4; k <= 4; k++) {
      const i = (k * Math.round(14 / L.ds) + L.N) % L.N;
      const p = E.frameAt(L, i, -(L.wallL[i] + 1.4));
      flagSpots.push({ x: p.x, y: L.py[i] - 0.5, z: p.z, r: L.head[i] + Math.PI / 2, color: [0xe2366f, 0xffd23f, 0x19b5a5, 0xff8a1e][(k + 8) % 4] });
    }
    E.flags(ctx, flagSpots);
    const banners = ['textures/ui/banner_fizz.webp', 'textures/ui/banner_acorn.webp', 'textures/ui/banner_paw.webp', 'textures/ui/banner_zoomies.webp'];
    const bspots = [];
    [0.03, 0.07, 0.86, 0.9, 0.24, 0.28, 0.72].forEach((t, k) => bspots.push({ i: Math.round(t * L.N), side: k % 2 ? 1 : -1, tex: banners[k % banners.length] }));
    E.bannerBoards(ctx, bspots);
  }

  // ------------------------------------------------------------------ boats in the inlet and at sea
  {
    const hull = new THREE.BoxGeometry(2.6, 1.3, 7.5, 1, 1, 3);
    const hp = hull.attributes.position;
    for (let v = 0; v < hp.count; v++) { const z = hp.getZ(v); if (z > 2) hp.setX(v, hp.getX(v) * (1 - (z - 2) / 2.2)); if (hp.getY(v) < 0) hp.setX(v, hp.getX(v) * 0.75); }
    const boatG = keep(E.mergePainted([
      E.paint(hull, 0xfff4dc),
      E.paint(new THREE.BoxGeometry(2.7, 0.35, 6.4).translate(0, 0.35, -0.3), 0x19b5a5),
      E.paint(new THREE.CylinderGeometry(0.1, 0.1, 8, 5).translate(0, 4.6, 0), 0x8a5a3c),
      E.paint(new THREE.ConeGeometry(2.4, 6.6, 3).scale(0.06, 1, 1).translate(0, 4.6, -1.3), 0xfff4dc),
      E.paint(new THREE.ConeGeometry(1.4, 4.4, 3).scale(0.06, 1, 1).translate(0, 3.6, 1.6), 0xe2366f),
    ]));
    const list = [];
    const boatSpots = [[INLET_X - 8, 40], [INLET_X + 12, 85], [INLET_X - 12, 105], [INLET_X + 6, -70], [120, -110], [-60, -120], [330, -140], [560, -60], [40, -220]];
    boatSpots.forEach(([x, z], k) => list.push({ x, y: SEA - 0.1, z, r: rnd() * 6.28, s: 1.3, ph: rnd() * 6 }));
    const boats = E.instanced(ctx, boatG, keep(toonMaterial({ vertexColors: true })), list, { ink: 1, name: 'boats' });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1.3, 1.3, 1.3), p = new THREE.Vector3();
    updaters.push((dt, t) => {
      list.forEach((b, k) => {
        e.set(Math.sin(t * 0.9 + b.ph) * 0.05, b.r + Math.sin(t * 0.2 + b.ph) * 0.1, Math.sin(t * 1.2 + b.ph) * 0.07, 'YXZ');
        p.set(b.x, b.y + Math.sin(t * 1.4 + b.ph) * 0.2, b.z);
        boats.setMatrixAt(k, m4.compose(p, q.setFromEuler(e), sc));
      });
      boats.instanceMatrix.needsUpdate = true;
    });
    // wooden pier on the inlet's west shore
    const plank = texClone('textures/common/wood_planks.webp'); if (plank) keep(plank);
    const pierParts = [];
    const pz0 = 30;
    pierParts.push(new THREE.BoxGeometry(5, 0.5, 60).translate(INLET_X - inletHalf(60) + 14, SEA + 1.2, pz0 + 30));
    for (let k = 0; k < 8; k++) pierParts.push(new THREE.CylinderGeometry(0.35, 0.35, 5, 6).translate(INLET_X - inletHalf(60) + 14 + (k % 2 ? 2.2 : -2.2), SEA - 1, pz0 + 4 + (k >> 1) * 15));
    const pg = keep(mergeGeometries(pierParts.map((g) => g.toNonIndexed()))); pierParts.forEach((g) => g.dispose());
    const pm = new THREE.Mesh(pg, keep(toonMaterial({ map: plank }))); pm.castShadow = quality.shadows !== false; root.add(pm);
  }

  // ------------------------------------------------------------------ gulls circling over the harbour
  {
    const gullG = new THREE.BufferGeometry();
    gullG.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.4, -1.4, 0.35, -0.1, 0, 0, -0.3, 0, 0, 0.4, 0, 0, -0.3, 1.4, 0.35, -0.1]), 3));
    gullG.computeVertexNormals(); keep(gullG);
    const gm = keep(toonMaterial({ color: 0xffffff, side: THREE.DoubleSide, rim: false, cacheKey: 'gull', vertex: `
      #ifdef USE_INSTANCING
        float gph = instanceMatrix[3].x * 0.13;
        transformed.y += abs(position.x) * sin(uTime * 7.0 + gph) * 0.45;
      #endif` }));
    const list = [];
    for (let k = 0; k < (night ? 0 : 14); k++) list.push({ cx: k < 7 ? LIGHTHOUSE.x - 30 : INLET_X, cz: k < 7 ? LIGHTHOUSE.z + 20 : 40, rad: 20 + rnd() * 40, y: 22 + rnd() * 18, sp: 0.2 + rnd() * 0.3, ph: rnd() * 6.28, x: 0, z: 0, s: 1.5 });
    if (list.length) {
      const gulls = E.instanced(ctx, gullG, gm, list, { cast: false, name: 'gulls' });
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1.5, 1.5, 1.5), p = new THREE.Vector3();
      updaters.push((dt, t) => {
        list.forEach((g, k) => {
          const a = g.ph + t * g.sp;
          p.set(g.cx + Math.cos(a) * g.rad, g.y + Math.sin(t * 0.5 + g.ph) * 2, g.cz + Math.sin(a) * g.rad);
          q.setFromAxisAngle(up, -a);
          gulls.setMatrixAt(k, m4.compose(p, q, sc));
        });
        gulls.instanceMatrix.needsUpdate = true;
      });
    }
  }

  // ------------------------------------------------------------------ hazard: crabs scuttling across the beach road
  {
    const a = L.atCP(16.55), b = L.atCP(17.15);
    const crabG = keep(E.mergePainted([
      E.paint(new THREE.SphereGeometry(0.75, 12, 8).scale(1.3, 0.55, 1).translate(0, 0.55, 0), 0xe2502f),
      E.paint(new THREE.SphereGeometry(0.32, 8, 6).scale(1, 0.7, 1.3).translate(0.95, 0.75, 0.75), 0xe2502f),
      E.paint(new THREE.SphereGeometry(0.32, 8, 6).scale(1, 0.7, 1.3).translate(-0.95, 0.75, 0.75), 0xe2502f),
      E.paint(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 5).translate(0.25, 1.05, 0.35), 0xe2502f),
      E.paint(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 5).translate(-0.25, 1.05, 0.35), 0xe2502f),
      E.paint(new THREE.SphereGeometry(0.13, 8, 6).translate(0.25, 1.35, 0.35), 0xfff4dc),
      E.paint(new THREE.SphereGeometry(0.13, 8, 6).translate(-0.25, 1.35, 0.35), 0xfff4dc),
      E.paint(new THREE.SphereGeometry(0.07, 6, 4).translate(0.25, 1.37, 0.46), 0x2b1d2e),
      E.paint(new THREE.SphereGeometry(0.07, 6, 4).translate(-0.25, 1.37, 0.46), 0x2b1d2e),
      ...[-1, 1].flatMap((s) => [0.3, 0, -0.3].map((z) => E.paint(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 4).rotateZ(s * 1.0).translate(s * 0.95, 0.3, z), 0xb83a22))),
    ], 0.5));
    const crabs = [];
    const count = 6;
    for (let k = 0; k < count; k++) {
      const i = Math.round(a + ((b - a + L.N) % L.N) * (k + 0.5) / count) % L.N;
      crabs.push({ i, ph: rnd() * 6.28, sp: 0.35 + rnd() * 0.25, x: 0, y: 0, z: 0, r: 0, s: 1.4 });
      hazards.push({ position: new THREE.Vector3(), radius: 1.5, kind: 'spin', type: 'crab' });
    }
    const crabMesh = E.instanced(ctx, crabG, keep(toonMaterial({ vertexColors: true })), crabs, { ink: 1, name: 'crabs' });
    void crabMesh;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1.4, 1.4, 1.4), p = new THREE.Vector3();
    const span = L.halfWidth + 4;
    updaters.push((dt, t) => {
      crabs.forEach((c, k) => {
        const lat = Math.sin(t * c.sp + c.ph) * span;
        E.frameAt(L, c.i, lat, p);
        p.y = L.py[c.i] + Math.abs(Math.sin(t * 9 + k)) * 0.08;
        e.set(0, L.head[c.i] + Math.PI / 2 + Math.sin(t * 6 + k) * 0.15, 0);
        crabMesh.setMatrixAt(k, m4.compose(p, q.setFromEuler(e), sc));
        hazards[k].position.copy(p);
      });
      crabMesh.instanceMatrix.needsUpdate = true;
    });
  }

  if (night) {
    // lantern strings over the promenade + occasional fireworks are added by effects (bus 'env:fireworks')
    const lines = [];
    for (let i = Math.round(L.N * 0.9); i < L.N + Math.round(L.N * 0.1); i += Math.round(20 / L.ds)) {
      const ii = i % L.N;
      const a2 = E.frameAt(L, ii, L.wallR[ii] + 1.2), b2 = E.frameAt(L, ii, -L.wallL[ii] - 1.2);
      a2.y = b2.y = L.py[ii] + 7.5;
      lines.push({ a: a2, b: b2, sag: 1.2 });
    }
    const lanternMat = keep(new THREE.MeshBasicMaterial({ color: 0xffb54a }));
    const lg = keep(new THREE.SphereGeometry(0.35, 8, 6).scale(1, 1.3, 1));
    const list = [];
    for (const ln of lines) for (let k = 1; k < 10; k++) { const t = k / 10; const v = new THREE.Vector3().lerpVectors(ln.a, ln.b, t); v.y -= Math.sin(t * Math.PI) * ln.sag; list.push({ x: v.x, y: v.y - 0.4, z: v.z, color: [0xffb54a, 0xff6f91, 0x7ff5e6, 0xffd23f][k % 4] }); }
    E.instanced(ctx, lg, lanternMat, list, { cast: false, name: 'lanterns', keepAll: true });
  }

  return {
    sunLight: lights.sun,
    heightAt,
    setShadowFocus: lights.setShadowFocus,
    update(dt, t) { for (const u of updaters) u(dt, t); },
    dispose() { lights.dispose(); },
  };
}
