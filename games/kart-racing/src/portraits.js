// Character portraits rendered in-engine from the actual 3D racer models (so menus/HUD always match the karts).
import * as THREE from 'three';
import { createRacerModel, hasRacer } from './racers.js';

const cache = new Map();

/**
 * Render a head-and-shoulders portrait (transparent background) for each character.
 * Returns Map id -> dataURL. Uses the shared renderer with an offscreen render target.
 */
export function renderPortraits(renderer, characters, size = 256) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x7a5f86, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3, 4); scene.add(key);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 50);
  // Render each portrait into a corner of the main canvas and copy it with drawImage (no readPixels stall).
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const src = renderer.domElement;
  const pr = renderer.getPixelRatio();
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevVP = renderer.getViewport(new THREE.Vector4()), prevSc = renderer.getScissor(new THREE.Vector4()), prevScT = renderer.getScissorTest();
  const css = size / pr;             // viewport is in CSS pixels
  const head = new THREE.Vector3();
  renderer.setRenderTarget(null);
  for (const c of characters) {
    if (!hasRacer(c.id)) continue;
    let m;
    try { m = createRacerModel(c); } catch (e) { continue; }
    scene.add(m.root);
    m.animate({ dt: 0.016, speed: 0, steer: 0.15 });
    m.root.updateMatrixWorld(true);
    const hb = m.skeleton.bones.find((b) => b.name === 'head');
    if (hb) hb.getWorldPosition(head); else head.set(0, 1.35, -0.2);
    head.y += 0.12;
    cam.position.set(head.x + 0.75, head.y + 0.12, head.z + 2.05);
    cam.lookAt(head.x, head.y - 0.02, head.z);
    renderer.setViewport(0, 0, css, css); renderer.setScissor(0, 0, css, css); renderer.setScissorTest(true);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    g.clearRect(0, 0, size, size);
    g.drawImage(src, 0, src.height - size, size, size, 0, 0, size, size);
    cache.set(c.id, canvas.toDataURL('image/png'));
    scene.remove(m.root); m.dispose();
  }
  renderer.setScissorTest(prevScT); renderer.setScissor(prevSc); renderer.setViewport(prevVP);
  renderer.setClearColor(prevClear, prevAlpha);
  return cache;
}

export const portraitOf = (id) => cache.get(id) || '';
