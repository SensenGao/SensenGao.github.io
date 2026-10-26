// Grand Prix podium: a festive stage with the top-three karts on numbered blocks, a golden trophy, bunting,
// falling confetti and a slowly orbiting camera.
import * as THREE from 'three';
import { toonMaterial, outlineMaterial, computeOutlineNormals, RIM } from './toon.js';
import { paint, mergePainted, mulberry } from './envkit.js';

function numberTexture(n, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 128, 128);
  g.font = '900 96px "Luckiest Guy", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#2b1d2e'; g.strokeText(String(n), 64, 72);
  g.fillStyle = '#fff4dc'; g.fillText(String(n), 64, 72);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createPodium(renderer, top3, { makeModel }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5ec8f2);
  scene.fog = new THREE.Fog(0x9fdcf5, 60, 160);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  RIM.color.value.set(0xfff1d6); RIM.strength.value = 0.35;
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x8a6f86, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(8, 16, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
  scene.add(sun);
  const ink = keep(outlineMaterial({ width: 0.03 }));

  // stage + ground
  const ground = new THREE.Mesh(keep(new THREE.CircleGeometry(120, 48).rotateX(-Math.PI / 2)), keep(toonMaterial({ color: 0x8fd352 })));
  ground.receiveShadow = true; scene.add(ground);
  const stageG = keep(mergePainted([
    paint(new THREE.CylinderGeometry(11, 11.5, 0.8, 40).translate(0, 0.4, 0), 0xfff4dc),
    paint(new THREE.CylinderGeometry(11.6, 11.6, 0.3, 40).translate(0, 0.15, 0), 0xe2366f),
  ]));
  const stage = new THREE.Mesh(stageG, keep(toonMaterial({ vertexColors: true }))); stage.receiveShadow = true; scene.add(stage);
  scene.add(new THREE.Mesh(stageG, ink));

  // blocks: 2nd (left), 1st (centre), 3rd (right)
  const spots = [{ x: 0, h: 3.2, col: '#ffd23f' }, { x: -4.4, h: 2.2, col: '#c9d6e3' }, { x: 4.4, h: 1.5, col: '#f0a162' }];
  const models = [];
  spots.forEach((s, i) => {
    const bg = keep(new THREE.BoxGeometry(4, s.h, 4).translate(0, s.h / 2 + 0.8, 0)); computeOutlineNormals(bg);
    const tex = keep(numberTexture(i + 1, s.col));
    const side = keep(toonMaterial({ color: new THREE.Color(s.col) }));
    const front = keep(toonMaterial({ map: tex }));
    const block = new THREE.Mesh(bg, [side, side, side, side, front, side]);
    block.position.x = s.x; block.castShadow = true; block.receiveShadow = true; scene.add(block);
    const o = new THREE.Mesh(bg, ink); o.position.x = s.x; scene.add(o);
    const c = top3[i];
    if (c) {
      const m = makeModel(c);
      m.root.position.set(s.x, s.h + 0.8, 0.2);
      m.root.rotation.y = -s.x * 0.06;
      scene.add(m.root);
      models.push(m);
    }
  });

  // trophy above the winner
  const prof = [[0, 0], [0.9, 0], [0.9, 0.15], [0.35, 0.3], [0.25, 0.9], [0.5, 1.1], [1.0, 1.5], [1.15, 2.4], [1.05, 2.45], [0.9, 1.7], [0.0, 1.45]].map(([a, b]) => new THREE.Vector2(a, b));
  const cupG = keep(mergePainted([
    paint(new THREE.LatheGeometry(prof, 28), 0xffcf3a),
    paint(new THREE.TorusGeometry(0.55, 0.12, 8, 20, Math.PI).rotateZ(-Math.PI / 2).translate(1.2, 1.9, 0), 0xffcf3a),
    paint(new THREE.TorusGeometry(0.55, 0.12, 8, 20, Math.PI).rotateZ(Math.PI / 2).translate(-1.2, 1.9, 0), 0xffcf3a),
    paint(new THREE.SphereGeometry(0.28, 12, 8).scale(1, 1, 0.4).translate(0, 1.85, 1.0), 0xe2366f),
  ]));
  const trophy = new THREE.Group();
  const tm = new THREE.Mesh(cupG, keep(toonMaterial({ vertexColors: true }))); tm.castShadow = true; trophy.add(tm); trophy.add(new THREE.Mesh(cupG, ink));
  trophy.position.set(0, 8.3, 0); trophy.scale.setScalar(0.8); scene.add(trophy);

  // bunting arcs + balloons ring
  const rnd = mulberry(7);
  const balloonG = keep(mergePainted([paint(new THREE.SphereGeometry(0.9, 12, 10).scale(1, 1.2, 1), 0xffffff), paint(new THREE.CylinderGeometry(0.02, 0.02, 3, 3).translate(0, -2.5, 0), 0x2b1d2e)]));
  const N = 22;
  const balloons = new THREE.InstancedMesh(balloonG, keep(toonMaterial({ vertexColors: true })), N);
  const cols = [0xe2366f, 0xffd23f, 0x19b5a5, 0xff8a1e, 0x6b4bc4, 0xfff4dc];
  const bl = [];
  for (let i = 0; i < N; i++) { const a = Math.PI * (1.08 + 0.84 * i / (N - 1)); bl.push({ a, r: 13 + rnd() * 4, y: 4 + rnd() * 6, ph: rnd() * 6 }); balloons.setColorAt(i, new THREE.Color(cols[i % cols.length])); }
  scene.add(balloons);

  // confetti
  const CN = 500;
  const confG = keep(new THREE.PlaneGeometry(0.22, 0.32));
  const conf = new THREE.InstancedMesh(confG, keep(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), CN);
  const cf = [];
  for (let i = 0; i < CN; i++) { cf.push({ x: (rnd() - 0.5) * 26, y: rnd() * 22, z: (rnd() - 0.5) * 16, vy: 1.5 + rnd() * 2, sp: rnd() * 6, ph: rnd() * 6 }); conf.setColorAt(i, new THREE.Color(cols[i % cols.length])); }
  conf.frustumCulled = false; scene.add(conf);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let t = 0;
  return {
    scene, camera,
    update(dt) {
      t += dt;
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      const a = Math.sin(t * 0.25) * 0.45;
      camera.position.set(Math.sin(a) * 19, 6.5 + Math.sin(t * 0.3) * 0.6, Math.cos(a) * 19);
      camera.lookAt(0, 3.6, 0);
      trophy.rotation.y = t * 1.2; trophy.position.y = 8.3 + Math.sin(t * 2) * 0.2;
      models.forEach((m, i) => { m.animate({ dt, speed: 0, steer: Math.sin(t * 3 + i) * 0.4, time: t }); m.root.position.y = spots[i].h + 0.8 + Math.max(0, Math.sin(t * 4 + i * 1.3)) * 0.35; });
      // balloons float in a half-ring behind the stage
      bl.forEach((b, i) => { p.set(Math.cos(b.a) * b.r, b.y + Math.sin(t + b.ph) * 0.4, Math.sin(b.a) * b.r - 2); balloons.setMatrixAt(i, m4.compose(p, q.identity(), s.set(1, 1, 1))); });
      balloons.instanceMatrix.needsUpdate = true;
      cf.forEach((c, i) => {
        c.y -= c.vy * dt; if (c.y < 0.5) c.y += 22;
        e.set(t * c.sp + c.ph, t * 2 + c.ph, 0); q.setFromEuler(e);
        p.set(c.x + Math.sin(t * 1.3 + c.ph) * 0.8, c.y, c.z);
        conf.setMatrixAt(i, m4.compose(p, q, s.set(1, 1, 1)));
      });
      conf.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      models.forEach((m) => m.dispose());
      balloons.dispose(); conf.dispose();
      disposables.forEach((d) => d.dispose && d.dispose());
      if (sun.shadow.map) sun.shadow.map.dispose();
      scene.clear();
    },
  };
}
