// Item visuals (our own designs): Surprise Crystal pickup, Gum Blob, Bouncer Ball, Buzz Drone, Crown Comet.
// All toon-lit, vertex coloured, with ink outlines. Geometries/materials are cached and shared.
import * as THREE from 'three';
import { toonMaterial, outlineMaterial, computeOutlineNormals } from './toon.js';
import { paint } from './envkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const merged = (parts, outline = 1) => { const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))); parts.forEach((p) => p.dispose()); g.computeVertexNormals(); computeOutlineNormals(g, outline); return g; };

export const ink = () => once('ink', () => outlineMaterial({ width: 0.025, minPixelsAt: 10 }));
export const vcToon = () => once('vc', () => toonMaterial({ vertexColors: true }));

/** Faceted rainbow crystal (pickup). Flat-shaded facets in pastel rainbow, glowing paw inside. */
export function crystalGeometry() {
  return once('crystalGeo', () => {
    const g = new THREE.OctahedronGeometry(0.85, 1);   // polyhedra are already non-indexed (flat facets)
    g.scale(1, 1.18, 1);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const rainbow = [0xff8cc6, 0xffd23f, 0x7ff5e6, 0x9fb3ff, 0xc9a0ff, 0xffb37a].map((h) => new THREE.Color(h));
    for (let f = 0; f < pos.count / 3; f++) {
      const c = rainbow[f % rainbow.length];
      for (let k = 0; k < 3; k++) { col[(f * 3 + k) * 3] = c.r; col[(f * 3 + k) * 3 + 1] = c.g; col[(f * 3 + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    computeOutlineNormals(g, 1);
    return g;
  });
}
/** A little paw print (glowing) that floats inside the crystal. */
export function pawGeometry() {
  return once('pawGeo', () => {
    const parts = [new THREE.SphereGeometry(0.2, 10, 8).scale(1.1, 0.9, 0.5).translate(0, -0.08, 0)];
    for (const [x, y] of [[-0.2, 0.15], [-0.07, 0.25], [0.07, 0.25], [0.2, 0.15]]) parts.push(new THREE.SphereGeometry(0.075, 8, 6).scale(1, 1.2, 0.5).translate(x, y, 0));
    const g = mergeGeometries(parts.map((p) => p.toNonIndexed())); parts.forEach((p) => p.dispose());
    return g;
  });
}
export const crystalMaterial = () => once('crystalMat', () => toonMaterial({ vertexColors: true, transparent: true, opacity: 0.88 }));
export const pawMaterial = () => once('pawMat', () => new THREE.MeshBasicMaterial({ color: 0xfff4dc }));

function gumGeometry() {
  return once('gum', () => merged([
    paint(new THREE.SphereGeometry(0.62, 16, 10).scale(1.25, 0.42, 1.1).translate(0, 0.18, 0), 0xff7fbf),
    paint(new THREE.SphereGeometry(0.3, 10, 8).scale(1, 0.6, 1).translate(0.55, 0.12, 0.3), 0xff7fbf),
    paint(new THREE.SphereGeometry(0.25, 10, 8).scale(1, 0.6, 1).translate(-0.5, 0.1, -0.35), 0xff7fbf),
    paint(new THREE.SphereGeometry(0.33, 14, 10).translate(-0.05, 0.62, 0.05), 0xffb3d9),
    paint(new THREE.SphereGeometry(0.09, 8, 6).translate(0.07, 0.76, 0.27), 0xffffff),
  ]));
}
function ballGeometry() {
  return once('ball', () => {
    const g = new THREE.SphereGeometry(0.55, 20, 14).toNonIndexed();
    const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
    const bands = [0x19b5a5, 0xffd23f, 0xe2366f, 0xfff4dc].map((h) => new THREE.Color(h));
    for (let f = 0; f < pos.count / 3; f++) {
      const y = (pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3;
      const c = bands[Math.min(3, Math.floor((y / 0.55 + 1) * 2))];
      for (let k = 0; k < 3; k++) { col[(f * 3 + k) * 3] = c.r; col[(f * 3 + k) * 3 + 1] = c.g; col[(f * 3 + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv'); g.computeVertexNormals(); computeOutlineNormals(g, 1);
    g.translate(0, 0.55, 0);
    return g;
  });
}
function beeGeometry() {
  return once('bee', () => {
    const body = new THREE.SphereGeometry(0.5, 18, 12).scale(0.9, 0.85, 1.15).toNonIndexed();
    const pos = body.attributes.position; const col = new Float32Array(pos.count * 3);
    const y = new THREE.Color(0xffd23f), k = new THREE.Color(0x2b1d2e);
    for (let i = 0; i < pos.count; i++) { const c = Math.floor((pos.getZ(i) + 0.6) / 0.22) % 2 ? k : y; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    body.setAttribute('color', new THREE.BufferAttribute(col, 3)); body.deleteAttribute('uv');
    return merged([
      body,
      paint(new THREE.SphereGeometry(0.24, 12, 8).scale(1, 1, 0.5).translate(0, 0.08, 0.55), 0xffffff),
      paint(new THREE.SphereGeometry(0.13, 10, 8).scale(1, 1, 0.5).translate(0, 0.08, 0.64), 0xe2363f),
      paint(new THREE.SphereGeometry(0.4, 10, 6).scale(1, 0.12, 0.55).rotateZ(0.5).translate(0.42, 0.42, -0.05), 0xd8f6ff),
      paint(new THREE.SphereGeometry(0.4, 10, 6).scale(1, 0.12, 0.55).rotateZ(-0.5).translate(-0.42, 0.42, -0.05), 0xd8f6ff),
      paint(new THREE.ConeGeometry(0.1, 0.3, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.68), 0x2b1d2e),
    ]).translate(0, 0.55, 0);
  });
}
function cometGeometry() {
  return once('comet', () => {
    const crown = [];
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; crown.push(paint(new THREE.ConeGeometry(0.09, 0.28, 4).translate(Math.cos(a) * 0.24, 0.12, Math.sin(a) * 0.24).rotateX(Math.PI / 2).translate(0, 0, 0.82), 0xffd23f)); }
    return merged([
      paint(new THREE.CylinderGeometry(0.38, 0.42, 1.3, 16).rotateX(Math.PI / 2), 0x6b4bc4),
      paint(new THREE.ConeGeometry(0.38, 0.7, 16).rotateX(Math.PI / 2).translate(0, 0, 1.0), 0xfff4dc),
      paint(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 16).rotateX(Math.PI / 2).translate(0, 0, 0.66), 0xffd23f),
      ...crown,
      ...[0, 1, 2, 3].map((i) => paint(new THREE.BoxGeometry(0.06, 0.5, 0.45).translate(0, 0.42, -0.5).rotateZ(i * Math.PI / 2), 0xe2366f)),
    ]).translate(0, 0.9, 0);
  });
}
function flameGeometry() {
  return once('flame', () => new THREE.ConeGeometry(0.34, 1.6, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0.9, -1.45));
}
const flameMat = () => once('flameMat', () => new THREE.MeshBasicMaterial({ color: 0xffa34a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));

/** Build a world model for an item type. Returns a Group (origin at the bottom centre). */
export function createItemModel(type) {
  const g = new THREE.Group();
  const add = (geo, mat = vcToon(), outline = true) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m);
    if (outline && geo.attributes.outlineN) m.add(new THREE.Mesh(geo, ink()));
    return m;
  };
  switch (type) {
    case 'crystal': {
      const m = add(crystalGeometry(), crystalMaterial());
      m.position.y = 0;
      const paw = new THREE.Mesh(pawGeometry(), pawMaterial()); g.add(paw);
      break;
    }
    case 'gum': add(gumGeometry()); break;
    case 'ball': add(ballGeometry()); break;
    case 'bee': { const b = add(beeGeometry()); b.name = 'bee'; break; }
    case 'comet': { add(cometGeometry()); const f = new THREE.Mesh(flameGeometry(), flameMat()); f.name = 'flame'; g.add(f); break; }
    default: add(ballGeometry());
  }
  g.userData.type = type;
  return g;
}
