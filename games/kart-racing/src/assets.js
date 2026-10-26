// Asset loading: every binary asset lives on Hugging Face (Sensen02/games-assets, folder kart-racing/) and is
// fetched from ONE pinned commit so the CDN never serves a mixed set. Local dev serves the staging copy instead.
import * as THREE from 'three';

export const HF_REPO = 'Sensen02/games-assets';
export const HF_COMMIT = 'f38bf23a9ef805975282067024eaa82163830f2b';
const HF_BASE = `https://huggingface.co/datasets/${HF_REPO}/resolve/${HF_COMMIT}/kart-racing/`;

const params = new URLSearchParams(location.search);
const isLocalDev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !params.has('hf');
/** Base URL for assets (trailing slash). `?hf` on localhost forces the Hugging Face copy. */
export const ASSET_BASE = isLocalDev && location.pathname.includes('/site/')
  ? location.pathname.slice(0, location.pathname.indexOf('/site/')) + '/hfdata/kart-racing/'
  : HF_BASE;

let manifest = null;           // { files: { path: bytes }, groups: { name: [path...] } }
const cache = new Map();       // path -> decoded asset
const pending = new Map();     // path -> Promise

export function assetURL(path) { return ASSET_BASE + path; }

export async function loadManifest() {
  if (manifest) return manifest;
  try {
    const r = await fetch(assetURL('manifest.json'), { cache: 'no-cache' });
    manifest = await r.json();
  } catch (e) {
    console.warn('[assets] manifest unavailable, continuing with procedural fallbacks');
    manifest = { files: {}, groups: {} };
  }
  return manifest;
}

export function groupFiles(name) { return (manifest && manifest.groups && manifest.groups[name]) || []; }

/** Fetch with byte progress. onBytes(delta) is called as chunks arrive. */
async function fetchBytes(path, onBytes) {
  const r = await fetch(assetURL(path));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); onBytes(b.byteLength); return b; }
  const reader = r.body.getReader();
  const chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.byteLength; onBytes(value.byteLength);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out.buffer;
}

const blobURLs = new Map();     // path -> object URL of the downloaded bytes (reused by <img> in the UI)
/** URL for an image used in the DOM: the already-downloaded blob when available (no second network fetch). */
export function uiURL(path) { return blobURLs.get(path) || assetURL(path); }

function decodeImage(buf, path) {
  return new Promise((resolve, reject) => {
    const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
    const url = URL.createObjectURL(new Blob([buf], { type }));
    const img = new Image();
    img.onload = () => { blobURLs.set(path, url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed ' + path)); };
    img.src = url;
  });
}

/** Load one asset (deduplicated). Images resolve to HTMLImageElement, others to ArrayBuffer. */
export function loadAsset(path, onBytes = () => {}) {
  if (cache.has(path)) return Promise.resolve(cache.get(path));
  if (pending.has(path)) return pending.get(path);
  const p = (async () => {
    const buf = await fetchBytes(path, onBytes);
    const isImg = /\.(webp|png|jpg)$/.test(path);
    const val = isImg ? await decodeImage(buf, path) : buf;
    cache.set(path, val);
    pending.delete(path);
    return val;
  })();
  pending.set(path, p);
  return p;
}

/**
 * Load a list of paths with aggregate progress (0..1) from known byte sizes in the manifest.
 * Failures are logged once and skipped (callers fall back to procedural assets).
 */
export async function loadGroup(paths, onProgress = () => {}) {
  await loadManifest();
  const sizes = paths.map((p) => (manifest.files && manifest.files[p]) || 50000);
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  let done = 0;
  const report = () => onProgress(Math.min(1, done / total));
  report();
  await Promise.all(paths.map(async (p, i) => {
    if (cache.has(p)) { done += sizes[i]; report(); return; }
    let got = 0;
    try {
      await loadAsset(p, (d) => { got += d; done += d; report(); });
    } catch (e) {
      console.warn('[assets] failed', p, e.message);
    }
    done += Math.max(0, sizes[i] - got); report();
  }));
  onProgress(1);
}

export function getAsset(path) { return cache.get(path) || null; }

const texCache = new Map();
/**
 * THREE texture for an image asset (shared per path+opts). Returns null when the image is not loaded.
 * opts: { repeat = true, srgb = true, anisotropy = 8 }
 */
export function getTexture(path, { repeat = true, srgb = true, anisotropy = 8 } = {}) {
  const key = `${path}|${repeat}|${srgb}`;
  if (texCache.has(key)) return texCache.get(key);
  const img = cache.get(path);
  if (!img) return null;
  const t = new THREE.Texture(img);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  t.userData.shared = true;   // world dispose must not dispose shared textures
  texCache.set(key, t);
  return t;
}

/** A per-use clone of a shared texture (own repeat/offset; shares the GPU image). */
export function texClone(path, opts) {
  const t = getTexture(path, opts);
  if (!t) return null;
  const c = t.clone();
  c.userData.shared = false;
  c.needsUpdate = true;
  return c;
}
