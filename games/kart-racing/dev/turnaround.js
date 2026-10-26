// Dev-only: renders front / three-quarter / side / back / face close-up for racers. ?ids=a,b&src=../../hfdata/kart-racing/models/racers/
import * as THREE from 'three';
import { registerRacerGLB, createRacerModel } from '../src/racers.js';
import { RIM } from '../src/toon.js';

const q = new URLSearchParams(location.search);
const ids = (q.get('ids') || 'fennix').split(',');
const src = q.get('src') || '../../hfdata/kart-racing/models/racers/';
const views = (q.get('views') || 'front,threequarter,side,back,face').split(',');
const cell = +(q.get('cell') || 300);
const W = cell * views.length, H = cell * ids.length;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.setScissorTest(true);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfff4dc, 0x8a6f86, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 8, 6); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xf3dfb8 }));
ground.receiveShadow = true; scene.add(ground);
const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const V = {
  front: { pos: [0, 1.3, 6.2], look: [0, 0.8, 0] },
  threequarter: { pos: [4.3, 2.3, 4.6], look: [0, 0.75, 0] },
  side: { pos: [6.4, 1.2, 0], look: [0, 0.8, 0] },
  back: { pos: [-2.2, 2.0, -5.6], look: [0, 0.8, 0] },
  face: { pos: [0.9, 1.55, 2.0], look: [0, 1.35, -0.2], fov: 26 },
};
const lbl = document.getElementById('lbl');
window.__done = false;
(async () => {
  const errors = [];
  for (let r = 0; r < ids.length; r++) {
    const id = ids[r];
    let model;
    try {
      const buf = await (await fetch(src + id + '.glb?t=' + Date.now())).arrayBuffer();
      await registerRacerGLB(id, buf);
      model = createRacerModel({ id });
    } catch (e) { errors.push(id + ': ' + e.message); continue; }
    scene.add(model.root);
    model.animate({ dt: 0.016, speed: 0, steer: 0 });
    model.root.updateMatrixWorld(true);
    views.forEach((v, c) => {
      const s = V[v];
      cam.position.fromArray(s.pos); cam.fov = s.fov || 30; cam.aspect = 1; cam.updateProjectionMatrix(); cam.lookAt(...s.look);
      const x = c * cell, y = H - (r + 1) * cell;
      renderer.setViewport(x, y, cell, cell); renderer.setScissor(x, y, cell, cell);
      renderer.setClearColor(0xfff4dc); renderer.clear();
      renderer.render(scene, cam);
    });
    const d = document.createElement('div'); d.textContent = id.toUpperCase(); d.style.left = '8px'; d.style.top = (r * cell + 6) + 'px'; lbl.appendChild(d);
    const info = renderer.info.render;
    console.log(id, 'tris/frame', info.triangles, 'calls', info.calls);
    scene.remove(model.root); model.dispose();
  }
  window.__errors = errors;
  window.__done = true;
})();
