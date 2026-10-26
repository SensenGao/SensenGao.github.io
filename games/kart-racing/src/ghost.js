// Time Trial ghost: records the player's lap (20 Hz samples of position + heading) and replays the best lap
// as a translucent kart. Ghosts are stored per track in localStorage (see save.js), quantised to keep them small.
const RATE = 20;              // samples per second
const Q = 100;                // centimetre precision

export class GhostRecorder {
  constructor() { this.reset(); }
  reset() { this.samples = []; this.acc = 0; this.t = 0; }
  /** call every sim step during a lap; lapTime = seconds since the lap started */
  sample(lapTime, kart) {
    if (lapTime < this.samples.length / 4 / RATE) return;   // 4 numbers per sample
    const p = kart.position;
    this.samples.push(Math.round(p.x * Q), Math.round(p.y * Q), Math.round(p.z * Q), Math.round(kart.heading * 1000));
  }
  /** Package the recorded lap. */
  finish(lapTime, meta) {
    const out = { v: 1, rate: RATE, lapTime, ...meta, data: this.samples.slice() };
    this.reset();
    return out;
  }
}

export class GhostPlayer {
  /** ghost: data from GhostRecorder.finish; model: KartModel (translucent) */
  constructor(ghost, model, scene) {
    this.ghost = ghost; this.model = model; this.scene = scene;
    this.n = Math.floor((ghost.data || []).length / 4);
    scene.add(model.root);
    model.root.visible = false;
  }
  /** lapTime: seconds into the player's current lap */
  update(lapTime, dt = 0.016) {
    const g = this.ghost, d = g.data, n = this.n;
    if (n < 2) { this.model.root.visible = false; return; }
    const f = lapTime * g.rate;
    const i = Math.floor(f);
    if (i < 0 || i >= n - 1) { this.model.root.visible = false; return; }
    const a = i * 4, b = (i + 1) * 4, u = f - i;
    const r = this.model.root;
    r.visible = true;
    r.position.set((d[a] + (d[b] - d[a]) * u) / Q, (d[a + 1] + (d[b + 1] - d[a + 1]) * u) / Q, (d[a + 2] + (d[b + 2] - d[a + 2]) * u) / Q);
    let h0 = d[a + 3] / 1000, h1 = d[b + 3] / 1000;
    let dh = h1 - h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    r.rotation.y = h0 + dh * u;
    const dx = d[b] - d[a], dz = d[b + 2] - d[a + 2];
    const speed = Math.hypot(dx, dz) / Q * g.rate;
    this.model.animate({ dt, speed, steer: Math.max(-1, Math.min(1, -dh * 8)), time: lapTime });
  }
  dispose() { this.scene.remove(this.model.root); this.model.dispose(); }
}
