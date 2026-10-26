// Racer models: loads the baked SDF racer GLBs and turns each into one skinned toon mesh (+ ink outline, + glass).
// createRacerModel(character, { paint }) -> KartModel { root, anchors, animate(), setShrunk(), dispose() }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toonMaterial, outlineMaterial, addOutline } from './toon.js';

const templates = new Map();   // id -> template
const loader = new GLTFLoader();

const _v = new THREE.Vector3();

/** Parse a racer GLB (ArrayBuffer) into a reusable template. */
export async function registerRacerGLB(id, arrayBuffer) {
  const gltf = await loader.parseAsync(arrayBuffer, '');
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const boneNodes = [];
  const meshNodes = [];
  scene.traverse((o) => {
    if (o.isMesh) meshNodes.push(o);
    else if (o !== scene && !o.isMesh && !(o.userData && o.userData.material)) boneNodes.push(o);
  });
  const root = boneNodes.find((b) => b.name === 'root') || boneNodes[0];
  const boneInfo = boneNodes.map((b) => ({
    name: b.name,
    parent: b.parent && boneNodes.includes(b.parent) ? b.parent.name : null,
    local: b.position.clone(),
    world: new THREE.Vector3().setFromMatrixPosition(b.matrixWorld),
    extras: { ...(b.userData || {}) },
  }));
  const boneIndex = new Map(boneInfo.map((b, i) => [b.name, i]));

  // merge mesh nodes into model-space geometry, grouped as opaque (toon + glow) and glass
  const groups = { opaque: [], glass: [] };
  for (const mn of meshNodes) {
    const kind = mn.userData.material || (mn.material && mn.material.name) || 'toon';
    const bone = mn.userData.bone || (mn.parent && mn.parent.name) || 'root';
    (kind === 'glass' ? groups.glass : groups.opaque).push({ mn, kind, bi: boneIndex.get(bone) ?? 0 });
  }
  const build = (list) => {
    if (!list.length) return null;
    let nv = 0, ni = 0;
    for (const { mn } of list) { nv += mn.geometry.attributes.position.count; ni += mn.geometry.index.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), O = new Float32Array(nv * 3), G = new Float32Array(nv);
    const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
    const I = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const { mn, kind, bi } of list) {
      const g = mn.geometry, pos = g.attributes.position, nrm = g.attributes.normal, col = g.attributes.color, ol = g.attributes._outline;
      const n = pos.count;
      for (let i = 0; i < n; i++) {
        _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mn.matrixWorld);
        P[(vo + i) * 3] = _v.x; P[(vo + i) * 3 + 1] = _v.y; P[(vo + i) * 3 + 2] = _v.z;
        N[(vo + i) * 3] = nrm.getX(i); N[(vo + i) * 3 + 1] = nrm.getY(i); N[(vo + i) * 3 + 2] = nrm.getZ(i);
        if (col) { C[(vo + i) * 3] = col.getX(i); C[(vo + i) * 3 + 1] = col.getY(i); C[(vo + i) * 3 + 2] = col.getZ(i); }
        else { C[(vo + i) * 3] = 1; C[(vo + i) * 3 + 1] = 0; C[(vo + i) * 3 + 2] = 1; }
        if (ol) { O[(vo + i) * 3] = ol.getX(i); O[(vo + i) * 3 + 1] = ol.getY(i); O[(vo + i) * 3 + 2] = ol.getZ(i); }
        G[vo + i] = kind === 'glow' ? 1 : 0;
        SI[(vo + i) * 4] = bi; SW[(vo + i) * 4] = 1;
      }
      const idx = g.index;
      for (let k = 0; k < idx.count; k++) I[io + k] = idx.getX(k) + vo;
      vo += n; io += idx.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('outlineN', new THREE.BufferAttribute(O, 3));
    geo.setAttribute('glow', new THREE.BufferAttribute(G, 1));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    geo.setIndex(new THREE.BufferAttribute(nv < 65536 ? Uint16Array.from(I) : I, 1));
    geo.computeBoundingSphere();
    geo.boundingSphere.radius *= 1.3; // animated bones move a little
    return geo;
  };
  const tpl = {
    id,
    bones: boneInfo,
    opaque: build(groups.opaque),
    glass: build(groups.glass),
    anchors: (root && root.userData && root.userData.anchors) || {},
    meta: (root && root.userData && root.userData.meta) || {},
  };
  // geometry/materials of the parsed gltf are no longer needed
  for (const mn of meshNodes) mn.geometry.dispose();
  templates.set(id, tpl);
  return tpl;
}

export function hasRacer(id) { return templates.has(id); }
export function racerTemplate(id) { return templates.get(id) || null; }

/** Rest-pose bounding box (model space) of the head bone and everything parented to it (ears, horns, helmet...). */
export function racerHeadBounds(id) {
  const tpl = templates.get(id);
  if (!tpl) return null;
  const names = new Set(['head']);
  let grew = true;
  while (grew) { grew = false; for (const b of tpl.bones) if (b.parent && names.has(b.parent) && !names.has(b.name)) { names.add(b.name); grew = true; } }
  const idx = new Set(tpl.bones.map((b, i) => (names.has(b.name) ? i : -1)).filter((i) => i >= 0));
  const box = new THREE.Box3();
  for (const g of [tpl.opaque, tpl.glass]) {
    if (!g) continue;
    const pos = g.attributes.position, si = g.attributes.skinIndex;
    for (let i = 0; i < pos.count; i++) if (idx.has(si.getX(i))) box.expandByPoint(_v.set(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  return box.isEmpty() ? null : box;
}

let _sharedMats = null;
function sharedMaterials() {
  if (_sharedMats) return _sharedMats;
  _sharedMats = {
    toon: toonMaterial({ vertexColors: true, glowAttr: true }),
    ink: outlineMaterial({ width: 0.02 }),
    glass: new THREE.MeshToonMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false }),
    ghost: toonMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: true, color: 0xa8f0ff, emissive: 0x2a6f8a, rim: true }),
    bubble: new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }',
      fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
        void main(){
          float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
          // hexagon-ish cells
          vec2 q = vec2(atan(vP.z, vP.x) * 3.0, vP.y * 3.2);
          vec2 c = fract(q) - 0.5;
          float cell = smoothstep(0.42, 0.48, max(abs(c.x) * 1.15 + abs(c.y) * 0.6, abs(c.y) * 1.2));
          vec3 col = hue(fract(vP.y * 0.25 + uTime * 0.4 + atan(vP.z, vP.x) * 0.16));
          gl_FragColor = vec4(mix(col, vec3(1.0), 0.35), clamp(f * 0.85 + cell * 0.35, 0.0, 0.9));
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff3c4 }),
    beam: new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  _sharedMats.glass.gradientMap = _sharedMats.toon.gradientMap;
  return _sharedMats;
}
let _bubbleGeo = null, _beamGeo = null, _lampGeo = null;

/** Recolour vertices close to `from` (sRGB hex) to `to` (paint jobs). Returns a new geometry sharing other attributes. */
function repaint(geo, from, to) {
  const g = geo.clone();
  const col = g.attributes.color;
  const a = new THREE.Color(from), b = new THREE.Color(to); // THREE.Color stores linear values
  for (let i = 0; i < col.count; i++) {
    const dr = col.getX(i) - a.r, dg = col.getY(i) - a.g, db = col.getZ(i) - a.b;
    if (dr * dr + dg * dg + db * db < 0.0025) col.setXYZ(i, b.r, b.g, b.b);
  }
  col.needsUpdate = true;
  return g;
}

/**
 * Create a kart model instance for a character ({ id, ... }). opts.paint = { from: [hex...], to: [hex...] } recolours.
 */
export function createRacerModel(character, opts = {}) {
  const tpl = templates.get(character.id);
  if (!tpl) throw new Error(`racer ${character.id} not loaded`);
  const mats = sharedMaterials();
  const root = new THREE.Group();
  root.name = `racer-${character.id}`;
  // bones
  const bones = tpl.bones.map((b) => { const bone = new THREE.Bone(); bone.name = b.name; bone.position.copy(b.local); bone.userData = b.extras; return bone; });
  const byName = new Map(bones.map((b) => [b.name, b]));
  tpl.bones.forEach((b, i) => { if (b.parent) byName.get(b.parent).add(bones[i]); });
  const rootBone = byName.get('root') || bones[0];
  root.add(rootBone);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  let geo = tpl.opaque;
  const owned = [];
  if (opts.paint && opts.paint.from) {
    geo = tpl.opaque;
    for (let k = 0; k < opts.paint.from.length; k++) { const g2 = repaint(geo, opts.paint.from[k], opts.paint.to[k]); if (geo !== tpl.opaque) geo.dispose(); geo = g2; }
    owned.push(geo);
  }
  const body = new THREE.SkinnedMesh(geo, opts.ghost ? mats.ghost : mats.toon);
  body.bind(skeleton);
  body.castShadow = !opts.ghost; body.receiveShadow = !opts.ghost;
  body.name = 'body';
  root.add(body);
  let ink = null;
  if (!opts.ghost && opts.outline !== false) {
    ink = addOutline(body, mats.ink);
    ink.frustumCulled = true;
  }
  let glass = null;
  if (tpl.glass && !opts.ghost) {
    glass = new THREE.SkinnedMesh(tpl.glass, mats.glass);
    glass.bind(skeleton);
    glass.renderOrder = 2;
    root.add(glass);
  }

  // anchors as Object3D children (effects read world positions from them)
  const anchors = {};
  for (const [name, p] of Object.entries(tpl.anchors || {})) {
    const o = new THREE.Object3D(); o.name = name; o.position.fromArray(p); root.add(o); anchors[name] = o;
  }
  for (const [n, d] of [['exhaustL', [0.3, 0.6, -1.2]], ['exhaustR', [-0.3, 0.6, -1.2]], ['itemHold', [0, 0.7, -1.6]], ['wheelRL', [0.75, 0.05, -0.75]], ['wheelRR', [-0.75, 0.05, -0.75]], ['wheelFL', [0.72, 0.3, 0.8]], ['wheelFR', [-0.72, 0.3, 0.8]]]) {
    if (!anchors[n]) { const o = new THREE.Object3D(); o.position.fromArray(d); root.add(o); anchors[n] = o; }
  }

  // night headlights: glowing lenses + a soft additive beam on the road ahead
  let beams = null;
  if (opts.headlights && !opts.ghost) {
    _lampGeo ||= new THREE.SphereGeometry(0.13, 10, 8);
    _beamGeo ||= new THREE.PlaneGeometry(4.2, 11).rotateX(-Math.PI / 2).translate(0, 0.06, 7.2);
    for (const n of ['headlightL', 'headlightR']) {
      const a = anchors[n]; if (!a) continue;
      const l = new THREE.Mesh(_lampGeo, mats.lamp); l.position.copy(a.position); root.add(l);
    }
    beams = new THREE.Mesh(_beamGeo, mats.beam); beams.renderOrder = 3; root.add(beams);
  }
  // Prism Shield bubble (shown while kart.starTimer > 0)
  _bubbleGeo ||= new THREE.SphereGeometry(1.75, 24, 16).scale(1, 0.85, 1.25).translate(0, 0.95, 0);
  const bubble = new THREE.Mesh(_bubbleGeo, mats.bubble);
  bubble.visible = false; bubble.renderOrder = 4;
  root.add(bubble);

  // animation state
  const B = {};
  for (const b of bones) B[b.name] = b;
  const rest = new Map(bones.map((b) => [b, b.quaternion.clone()]));
  const wheels = bones.filter((b) => b.userData.anim === 'wheel');
  const extras = bones.filter((b) => ['wag', 'spin', 'wobble', 'flap'].includes(b.userData.anim));
  let spinAngle = 0, bob = 0, lean = 0, headTilt = 0, steerAng = 0, t = 0;
  const e = new THREE.Euler();

  return {
    root,
    anchors,
    skeleton,
    character,
    animate({ dt = 0.016, speed = 0, steer = 0, drifting = false, driftDir = 0, boosting = false, airborne = false, spin = 0, star = false, throttle = 0, time } = {}) {
      t += dt;
      const sp = Math.abs(speed);
      if (bubble.visible !== !!star) bubble.visible = !!star;
      if (star) { mats.bubble.uniforms.uTime.value = t; bubble.scale.setScalar(1 + Math.sin(t * 9) * 0.04); }
      // wheels
      for (const w of wheels) {
        const r = w.userData.radius || 0.36;
        if (w === wheels[0]) spinAngle += (speed / r) * dt;
        e.set(spinAngle, w.userData.front ? -steer * 0.45 : 0, 0, 'YXZ');
        w.quaternion.setFromEuler(e);
      }
      // body bob (engine idle + road rumble)
      const rumble = airborne ? 0 : Math.sin(t * (18 + sp * 0.6)) * (0.006 + Math.min(0.012, sp * 0.0004));
      bob += ((boosting ? -0.02 : 0) + rumble - bob) * Math.min(1, dt * 20);
      if (B.body) B.body.position.y = bob;
      // driver leans into turns / drift
      const target = (-steer * 0.16) + (drifting ? -driftDir * 0.12 : 0);
      lean += (target - lean) * Math.min(1, dt * 8);
      if (B.driver) { e.set(boosting ? -0.12 : 0, 0, lean, 'XYZ'); B.driver.quaternion.setFromEuler(e); }
      headTilt += ((-steer * 0.22 + (drifting ? driftDir * 0.15 : 0)) - headTilt) * Math.min(1, dt * 6);
      if (B.head) { e.set(Math.sin(t * 2.2) * 0.03, headTilt, -lean * 0.4, 'XYZ'); B.head.quaternion.setFromEuler(e); }
      steerAng += (steer * 1.2 - steerAng) * Math.min(1, dt * 14);
      if (B.steer) {
        const tilt = (B.steer.userData.tilt || 30) * Math.PI / 180;
        _v.set(0, -Math.sin(tilt), Math.cos(tilt));
        B.steer.quaternion.setFromAxisAngle(_v, steerAng);
      }
      // character extras
      for (const b of extras) {
        const u = b.userData; const amp = u.amp ?? 0.3; const spd = u.speed ?? 4;
        if (u.anim === 'spin') { b.rotateOnAxis(_v.fromArray(u.axis || [0, 0, 1]), (u.speed ?? 25) * dt * (0.4 + Math.min(1, sp / 30))); }
        else if (u.anim === 'wag') { e.set(0, Math.sin(t * spd) * amp, Math.sin(t * spd * 0.5) * amp * 0.3); b.quaternion.copy(rest.get(b)).multiply(new THREE.Quaternion().setFromEuler(e)); }
        else if (u.anim === 'wobble' || u.anim === 'flap') {
          const ph = u.phase || 0; const ax = u.axis || [1, 0, 0];
          const ang = Math.sin(t * spd + ph) * amp * (u.anim === 'flap' ? (0.4 + Math.min(1, sp / 25)) : 1) - (u.anim === 'flap' ? Math.min(0.5, sp * 0.012) : 0);
          b.quaternion.copy(rest.get(b)).multiply(new THREE.Quaternion().setFromAxisAngle(_v.fromArray(ax), ang));
        }
      }
    },
    /** Hide the ink hull beyond `maxDist` metres from the camera (it is sub-pixel there anyway). */
    setInkDistance(dist, maxDist) { if (ink) ink.visible = dist < maxDist; },
    setShrunk(s) { root.scale.setScalar(s); },
    dispose() {
      root.parent && root.parent.remove(root);
      owned.forEach((g) => g.dispose());
      skeleton.dispose();
    },
  };
}
