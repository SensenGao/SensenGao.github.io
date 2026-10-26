// Items: Surprise Crystals (pickups), roulette, projectiles & hazards. See ARCHITECTURE.md §3.
// Our item set: fizz / fizz3 (boost), gum (dropped spin trap), ball (straight bouncer), bee (homing drone),
// prism (invincibility), bell (shrinks rivals), comet (seeks the leader).
import * as THREE from 'three';
import { PHYSICS, ITEMS } from './config.js';
import { bus } from './events.js';
import { createItemModel, crystalGeometry, crystalMaterial, pawGeometry, pawMaterial, ink } from './itemmodels.js';

// ---------------------------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------------------------
const BOX_RESPAWN = 2.0;
const BOX_SCALE_IN = 0.4;
const BOX_PICK_RADIUS = 1.2;
const ROULETTE_PLAYER = 1.6;
const ROULETTE_AI_MIN = 0.45;
const ROULETTE_AI_MAX = 0.9;
const USE_COOLDOWN = 0.28;
const OWNER_GRACE = 0.4;

const SHELL_RADIUS = 0.75;
const SHELL_HOVER = 0.05;          // extra clearance of projectile bottom above ground
const BALL_SPEED = 62;
const BALL_LIFE = 8;
const BALL_BOUNCES = 5;
const BEE_SPEED = 58;
const BEE_LIFE = 11;
const BEE_TURN = 6.5;              // rad/s steering
const BEE_DIRECT_DIST = 28;
const COMET_SPEED = 78;
const COMET_ALT = 7;
const COMET_LIFE = 30;
const COMET_HOVER_TIME = 1.0;
const COMET_RADIUS = 8;
const GUM_RADIUS = 0.8;
const MAX_GUMS = 24;
const MAX_SHELLS = 24;

// Weighted distribution by place (1..8). Columns follow ITEM_ORDER.
const WEIGHTS = [
  /*1*/ [10, 0, 45, 37, 8, 0, 0, 0],
  /*2*/ [22, 4, 22, 24, 24, 2, 0, 2],
  /*3*/ [24, 10, 12, 18, 30, 3, 0, 3],
  /*4*/ [22, 18, 8, 12, 30, 6, 1, 3],
  /*5*/ [20, 26, 5, 8, 27, 10, 2, 2],
  /*6*/ [18, 30, 3, 5, 24, 14, 4, 2],
  /*7*/ [12, 34, 0, 3, 20, 22, 7, 2],
  /*8*/ [8, 36, 0, 0, 16, 28, 10, 2],
];
const ITEM_ORDER = ['fizz', 'fizz3', 'gum', 'ball', 'bee', 'prism', 'bell', 'comet'];
const ROULETTE_CYCLE = ITEMS && ITEMS.length ? ITEMS : ITEM_ORDER;

// scratch
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

function finite(n, d = 0) { return Number.isFinite(n) ? n : d; }
function wrap01(t) { t %= 1; return t < 0 ? t + 1 : t; }
function kartForward(kart, out) {
  const h = finite(kart.heading, kart.object3D?.rotation?.y ?? 0);
  return out.set(Math.sin(h), 0, Math.cos(h));
}
function kartRadius(kart) { return finite(kart.radius, PHYSICS.kartRadius); }

// Projectile/hazard visuals: holder (positioned by the sim) > inner (spin/bob) > model
function buildItemVisual(type) {
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(createItemModel(type));
  holder.add(inner);
  holder.userData.type = type;
  holder.userData.inner = inner;
  return holder;
}

// ---------------------------------------------------------------------------------------------
// ItemSystem
// ---------------------------------------------------------------------------------------------
export class ItemSystem {
  constructor({ scene, track, karts, filter = null }) {
    this.scene = scene;
    this.filter = filter;   // optional list of allowed items (missions)
    this.track = track;
    this.karts = karts || [];
    this.group = new THREE.Group();
    this.group.name = 'ItemSystem';
    scene?.add(this.group);
    this.time = 0;

    this.boxes = [];
    this.entities = [];   // active projectiles/hazards
    this.pools = new Map(); // type -> holder[]
    this.roulettes = new Map(); // kart -> { timer, duration, display, cycleTimer, final }
    this.kartState = new Map(); // kart -> { prevItem, cooldown }
    this._hazards = [];
    this._rouletteOut = { spinning: false, displayItem: null };

    const positions = track?.itemBoxPositions || [];
    // all crystals are drawn with three instanced meshes (body, ink outline, glowing paw)
    const n = Math.max(1, positions.length);
    this.boxMesh = new THREE.InstancedMesh(crystalGeometry(), crystalMaterial(), n);
    this.boxInk = new THREE.InstancedMesh(crystalGeometry(), ink(), n);
    this.boxInk.instanceMatrix = this.boxMesh.instanceMatrix;
    this.pawMesh = new THREE.InstancedMesh(pawGeometry(), pawMaterial(), n);
    for (const m of [this.boxMesh, this.boxInk, this.pawMesh]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
    this.boxMesh.castShadow = true;
    this.boxMesh.count = this.boxInk.count = this.pawMesh.count = positions.length;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      if (!p) continue;
      const base = new THREE.Vector3(finite(p.x), finite(p.y), finite(p.z));
      try {
        const info = track.getSurfaceInfo?.(base);
        if (info && Number.isFinite(info.height) && base.y < info.height + 1.1) base.y = info.height + 1.3;
      } catch (_) { /* ignore */ }
      this.boxes.push({ base, active: true, timer: 0, scaleT: 1, phase: i * 0.7, index: this.boxes.length });
    }
  }

  // ------------------------------------------------------------------ public API
  update(dt, time) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.time = Number.isFinite(time) ? time : this.time + dt;
    try { this._updateBoxes(dt); } catch (err) { console.error('[items] boxes', err); }
    try { this._updateRoulettes(dt); } catch (err) { console.error('[items] roulette', err); }
    try { this._updateUse(dt); } catch (err) { console.error('[items] use', err); }
    try { this._updateEntities(dt); } catch (err) { console.error('[items] entities', err); }
  }

  getHazards() {
    const out = this._hazards;
    out.length = 0;
    for (const e of this.entities) {
      if (e.dead || !e.hazard) continue;
      if (e.type === 'comet') continue;
      if (e.type === 'gum' && e.flying) continue;
      out.push(e.hazard);
    }
    const th = this.track && this.track.hazards;
    if (th) for (const h of th) if (h.active !== false) out.push(h);
    return out;
  }

  rouletteState(kart) {
    const o = this._rouletteOut;
    const r = kart ? this.roulettes.get(kart) : null;
    if (r) { o.spinning = true; o.displayItem = r.display; }
    else { o.spinning = false; o.displayItem = kart?.item ?? null; }
    o.count = kart?.itemCount ?? 0;
    return o;
  }

  dispose() {
    for (const e of this.entities) this._release(e.holder);
    this.entities.length = 0;
    this.extraHazards = null;
    this.roulettes.clear();
    this.kartState.clear();
    this.scene?.remove(this.group);
    for (const m of [this.boxMesh, this.boxInk, this.pawMesh]) m && m.dispose();
    this.boxes.length = 0;
    this.pools.clear();
  }

  // ------------------------------------------------------------------ boxes
  _updateBoxes(dt) {
    const t = this.time;
    for (const b of this.boxes) {
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) { b.active = true; b.scaleT = 0; }
        else { _m4.makeScale(0, 0, 0); this.boxMesh.setMatrixAt(b.index, _m4); this.pawMesh.setMatrixAt(b.index, _m4); continue; }
      }
      if (b.scaleT < 1) b.scaleT = Math.min(1, b.scaleT + dt / BOX_SCALE_IN);
      // easeOutBack
      const x = b.scaleT, c1 = 1.9, c3 = c1 + 1;
      const s = x >= 1 ? 1 : Math.max(0.001, 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2));
      _v1.set(b.base.x, b.base.y + Math.sin(t * 2.4 + b.phase) * 0.22, b.base.z);
      _e.set(Math.sin(t * 1.3 + b.phase) * 0.2, t * 1.6 + b.phase, Math.cos(t * 1.1 + b.phase) * 0.15);
      _q.setFromEuler(_e);
      this.boxMesh.setMatrixAt(b.index, _m4.compose(_v1, _q, _s.setScalar(s)));
      _e.set(0, t * -2.2 + b.phase, 0); _q.setFromEuler(_e);
      this.pawMesh.setMatrixAt(b.index, _m4.compose(_v1, _q, _s.setScalar(s * (0.95 + Math.sin(t * 5 + b.phase) * 0.08))));

      if (b.scaleT < 0.5) continue;
      for (const k of this.karts) {
        if (!k || !k.position) continue;
        const r = kartRadius(k) + BOX_PICK_RADIUS;
        const dx = k.position.x - b.base.x, dz = k.position.z - b.base.z;
        const dy = (k.position.y + 0.6) - b.base.y;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 2.6) {
          this._pickupBox(b, k);
          break;
        }
      }
    }
    this.boxMesh.instanceMatrix.needsUpdate = true;
    this.pawMesh.instanceMatrix.needsUpdate = true;
  }

  _pickupBox(b, kart) {
    b.active = false;
    b.timer = BOX_RESPAWN;
    bus.emit('item:pickup', { kart, position: b.base });
    if (kart.item == null && !this.roulettes.has(kart) && !kart.finished) {
      const final = this._rollItem(kart);
      const dur = kart.isPlayer ? ROULETTE_PLAYER : ROULETTE_AI_MIN + Math.random() * (ROULETTE_AI_MAX - ROULETTE_AI_MIN);
      this.roulettes.set(kart, { timer: 0, duration: dur, final, display: ROULETTE_CYCLE[(Math.random() * ROULETTE_CYCLE.length) | 0], cycleTimer: 0 });
      bus.emit('item:roulette', { kart });
    }
  }

  _rollItem(kart) {
    const n = Math.max(1, this.karts.length);
    let place = finite(kart.place, Math.ceil(n / 2));
    place = Math.min(Math.max(place, 1), n);
    // map place onto the 8-row table
    const row = n <= 1 ? 3 : Math.round(((place - 1) / (n - 1)) * 7);
    const weights = WEIGHTS[Math.min(7, Math.max(0, row))];
    const cometActive = this.entities.some((e) => e.type === 'comet' && !e.dead)
      || this.karts.some((k) => k && k.item === 'comet');
    const allowed = (it) => !(it === 'comet' && (cometActive || place === 1)) && (!this.filter || this.filter.includes(it));
    let total = 0;
    for (let i = 0; i < ITEM_ORDER.length; i++) if (allowed(ITEM_ORDER[i])) total += weights[i];
    let r = Math.random() * total;
    for (let i = 0; i < ITEM_ORDER.length; i++) {
      if (!allowed(ITEM_ORDER[i])) continue;
      r -= weights[i];
      if (r <= 0 && weights[i] > 0) return ITEM_ORDER[i];
    }
    return this.filter ? this.filter[0] : 'gum';
  }

  _updateRoulettes(dt) {
    for (const [kart, r] of this.roulettes) {
      r.timer += dt;
      r.cycleTimer -= dt;
      const remaining = r.duration - r.timer;
      if (r.cycleTimer <= 0) {
        // slow down near the end
        r.cycleTimer = remaining < 0.4 ? 0.14 : 0.07;
        let idx = ROULETTE_CYCLE.indexOf(r.display);
        idx = (idx + 1 + ((Math.random() * 2) | 0)) % ROULETTE_CYCLE.length;
        r.display = ROULETTE_CYCLE[idx];
      }
      if (r.timer >= r.duration) {
        this.roulettes.delete(kart);
        kart.item = r.final;
        kart.itemCount = r.final === 'fizz3' ? 3 : 1;
        this._getState(kart).cooldown = 0.2; // avoid instant-fire if the button is still being tapped
        bus.emit('item:got', { kart, item: r.final });
      }
    }
  }

  _getState(kart) {
    let s = this.kartState.get(kart);
    if (!s) { s = { prevItem: false, cooldown: 0 }; this.kartState.set(kart, s); }
    return s;
  }

  // ------------------------------------------------------------------ using items
  _updateUse(dt) {
    for (const kart of this.karts) {
      if (!kart) continue;
      const s = this._getState(kart);
      s.cooldown = Math.max(0, s.cooldown - dt);
      const pressed = !!kart.input?.item;
      const edge = pressed && !s.prevItem;
      s.prevItem = pressed;
      if (!edge || s.cooldown > 0) continue;
      if (kart.item == null || this.roulettes.has(kart)) continue;
      if (kart.controlsLocked && !kart.finished) continue;
      s.cooldown = USE_COOLDOWN;
      this._useItem(kart);
    }
  }

  _useItem(kart) {
    const item = kart.item;
    let consumed = true;
    try {
      switch (item) {
        case 'fizz':
        case 'fizz3':
          kart.applyBoost?.(PHYSICS.fizzBoostTime, 1);
          break;
        case 'gum': this._spawnGum(kart); break;
        case 'ball': this._spawnShell(kart, 'ball'); break;
        case 'bee': this._spawnShell(kart, 'bee'); break;
        case 'comet': this._spawnComet(kart); break;
        case 'prism': kart.startStar?.(PHYSICS.prismTime); break;
        case 'bell': this._bell(kart); break;
        default: consumed = true;
      }
    } catch (err) {
      console.error('[items] use failed', item, err);
    }
    bus.emit('item:use', { kart, item: item === 'fizz3' ? 'fizz' : item });
    if (consumed) {
      const count = finite(kart.itemCount, 1) - 1;
      if (item === 'fizz3' && count > 0) {
        kart.itemCount = count;
      } else {
        kart.item = null;
        kart.itemCount = 0;
      }
    }
  }

  _bell(by) {
    bus.emit('item:bell', { by });
    for (const k of this.karts) {
      if (!k || k === by) continue;
      if (finite(k.starTimer) > 0) continue;
      k.applyHit?.('shrink');
      // lose held item (and roulette)
      if (k.item != null || this.roulettes.has(k)) {
        k.item = null; k.itemCount = 0; this.roulettes.delete(k);
      }
      bus.emit('item:hit', { kart: k, item: 'bell', by });
    }
  }

  // ------------------------------------------------------------------ pools
  _acquire(type) {
    const list = this.pools.get(type);
    let h = list && list.length ? list.pop() : null;
    if (!h) h = buildItemVisual(type);
    h.visible = true;
    h.scale.setScalar(1);
    h.rotation.set(0, 0, 0);
    this.group.add(h);
    return h;
  }

  _release(holder) {
    if (!holder) return;
    this.group.remove(holder);
    const type = holder.userData.type;
    if (!this.pools.has(type)) this.pools.set(type, []);
    this.pools.get(type).push(holder);
  }

  _groundHeight(pos, e) {
    const tr = this.track;
    if (!tr?.getSurfaceInfo) return pos.y;
    try {
      const info = tr.getSurfaceInfo(pos, e ? e.t : undefined);
      if (info) {
        if (e && Number.isFinite(info.t)) e.t = info.t;
        if (Number.isFinite(info.height)) return info.height;
      }
    } catch (_) { /* ignore */ }
    return pos.y;
  }

  _makeEntity(type, owner, pos) {
    const e = {
      type, owner, dead: false, age: 0,
      pos: pos.clone(), vel: new THREE.Vector3(),
      t: finite(owner?.trackT, undefined),
      bounces: 0, life: 0, flying: false,
      holder: this._acquire(type),
      target: null, phase: 'travel', hoverTimer: 0, spin: Math.random() * 6,
      radius: type === 'gum' ? GUM_RADIUS : SHELL_RADIUS,
    };
    e.hazard = { position: e.pos, radius: e.radius, type, velocity: e.vel, owner };
    e.holder.position.copy(e.pos);
    this.entities.push(e);
    this._enforceCaps(type);
    return e;
  }

  _enforceCaps(type) {
    const cap = type === 'gum' ? MAX_GUMS : MAX_SHELLS;
    let count = 0;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.dead) continue;
      const isGum = e.type === 'gum';
      if ((type === 'gum') !== isGum) continue;
      count++;
      if (count > cap) this._kill(e, true);
    }
  }

  _spawnGum(kart) {
    const fwd = kartForward(kart, _v1);
    const throwForward = !!kart.input?.throwForward;
    const r = kartRadius(kart);
    if (throwForward) {
      _v2.copy(kart.position).addScaledVector(fwd, r + 1.2);
      _v2.y += 1.2;
      const e = this._makeEntity('gum', kart, _v2);
      e.flying = true;
      e.vel.copy(fwd).multiplyScalar(Math.max(0, finite(kart.speed)) + 24);
      e.vel.y = 11;
    } else {
      _v2.copy(kart.position).addScaledVector(fwd, -(r + 1.1));
      const e = this._makeEntity('gum', kart, _v2);
      e.pos.y = this._groundHeight(e.pos, e);
      e.holder.rotation.y = Math.random() * Math.PI * 2;
    }
  }

  _spawnShell(kart, type) {
    const fwd = kartForward(kart, _v1);
    const back = !!kart.input?.lookBack;
    const dir = back ? -1 : 1;
    const r = kartRadius(kart);
    _v2.copy(kart.position).addScaledVector(fwd, dir * (r + SHELL_RADIUS + 0.6));
    const e = this._makeEntity(type, kart, _v2);
    e.pos.y = this._groundHeight(e.pos, e) + SHELL_HOVER;
    const base = Math.max(0, finite(kart.speed) * (back ? 0 : 1));
    const speed = (type === 'bee' ? BEE_SPEED : BALL_SPEED) + base * 0.35;
    e.vel.copy(fwd).multiplyScalar(dir * speed);
    e.speed = speed;
    if (type === 'bee') {
      e.target = back ? null : this._kartAhead(kart);
      e.homing = !back;
    }
  }

  _spawnComet(kart) {
    _v2.copy(kart.position);
    _v2.y += 2.5;
    const e = this._makeEntity('comet', kart, _v2);
    e.t = finite(kart.trackT, e.t);
    if (!Number.isFinite(e.t)) {
      try { e.t = this.track.getSurfaceInfo(kart.position)?.t ?? 0; } catch (_) { e.t = 0; }
    }
    e.phase = 'rise';
    e.alt = 2.5;
    e.target = this._leader();
  }

  _leader() {
    let best = null, bestScore = -Infinity;
    for (const k of this.karts) {
      if (!k) continue;
      let score;
      if (Number.isFinite(k.place)) score = -k.place * 1000;
      else if (Number.isFinite(k.raceProgress)) score = k.raceProgress;
      else score = finite(k.trackT);
      if (score > bestScore) { bestScore = score; best = k; }
    }
    return best;
  }

  _kartAhead(kart) {
    if (Number.isFinite(kart.place) && kart.place > 1) {
      for (const k of this.karts) if (k && k !== kart && k.place === kart.place - 1) return k;
    }
    if (Number.isFinite(kart.place) && kart.place === 1) return null;
    // fallback: nearest kart in front
    const fwd = kartForward(kart, _v3);
    let best = null, bestD = Infinity;
    for (const k of this.karts) {
      if (!k || k === kart || !k.position) continue;
      _v2.subVectors(k.position, kart.position);
      if (_v2.dot(fwd) <= 0) continue;
      const d = _v2.lengthSq();
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  // ------------------------------------------------------------------ simulation
  _updateEntities(dt) {
    const ents = this.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      e.age += dt;
      switch (e.type) {
        case 'gum': this._simGum(e, dt); break;
        case 'ball': this._simShell(e, dt, false); break;
        case 'bee': this._simShell(e, dt, true); break;
        case 'comet': this._simComet(e, dt); break;
        default: break;
      }
    }
    this._collide();
    // compact
    let w = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) this._release(e.holder);
      else ents[w++] = e;
    }
    ents.length = w;
  }

  _simGum(e, dt) {
    if (e.flying) {
      e.vel.y -= PHYSICS.gravity * 0.8 * dt;
      e.pos.addScaledVector(e.vel, dt);
      const wall = this._wall(e.pos, e.radius);
      if (wall) {
        _v1.copy(wall.normal); _v1.y = 0; _v1.normalize();
        e.pos.addScaledVector(_v1, wall.depth);
        const vn = e.vel.dot(_v1);
        if (vn < 0) e.vel.addScaledVector(_v1, -1.6 * vn);
      }
      const g = this._groundHeight(e.pos, e);
      if (e.pos.y <= g && e.vel.y < 0) { e.pos.y = g; e.flying = false; e.vel.set(0, 0, 0); }
      e.holder.rotation.x += dt * 9;
    } else {
      e.holder.rotation.x *= Math.max(0, 1 - dt * 12);
      // settle wobble right after dropping
      if (e.age < 0.6) e.holder.scale.setScalar(1 + Math.sin(e.age * 18) * 0.15 * (1 - e.age / 0.6));
      else e.holder.scale.setScalar(1);
    }
    e.holder.position.copy(e.pos);
  }

  _wall(pos, r) {
    const tr = this.track;
    if (!tr?.resolveWall) return null;
    try {
      const w = tr.resolveWall(pos, r);
      if (w && w.normal && Number.isFinite(w.depth)) return w;
    } catch (_) { /* ignore */ }
    return null;
  }

  _simShell(e, dt, isRed) {
    e.life += dt;
    const maxLife = isRed ? BEE_LIFE : BALL_LIFE;
    if (e.life > maxLife) { this._kill(e, true); return; }

    if (isRed && e.homing && e.age > 0.18) this._steerBee(e, dt);

    const steps = Math.max(1, Math.ceil((e.vel.length() * dt) / 1.2));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      e.pos.x += e.vel.x * sdt;
      e.pos.z += e.vel.z * sdt;
      const wall = this._wall(e.pos, e.radius);
      if (wall) {
        _v1.copy(wall.normal); _v1.y = 0;
        if (_v1.lengthSq() < 1e-6) continue;
        _v1.normalize();
        e.pos.addScaledVector(_v1, wall.depth + 0.02);
        const vn = e.vel.x * _v1.x + e.vel.z * _v1.z;
        if (vn < 0) {
          e.vel.x -= 2 * vn * _v1.x;
          e.vel.z -= 2 * vn * _v1.z;
          e.bounces++;
          if (!isRed && e.bounces > BALL_BOUNCES) { this._kill(e, true); return; }
          if (isRed && !e.homing) { this._kill(e, true); return; }
        }
      }
    }
    const g = this._groundHeight(e.pos, e) + SHELL_HOVER;
    // follow the ground but allow short falls off ramps
    if (e.pos.y > g + 0.05) { e.vel.y -= PHYSICS.gravity * dt; e.pos.y += e.vel.y * dt; if (e.pos.y < g) { e.pos.y = g; e.vel.y = 0; } }
    else { e.pos.y = g; e.vel.y = 0; }
    e.spin += dt * 16;
    const h = e.holder;
    h.position.copy(e.pos);
    if (isRed) {
      // the Buzz Drone faces where it flies and bobs
      h.rotation.set(0, Math.atan2(e.vel.x, e.vel.z), Math.sin(e.life * 14) * 0.15);
      h.position.y += 0.35 + Math.sin(e.life * 11) * 0.12;
    } else {
      h.rotation.set(0, e.spin, 0);
      h.position.y += Math.abs(Math.sin(e.life * 9)) * 0.35;   // bouncy ball hops along
    }
  }

  _steerBee(e, dt) {
    const tr = this.track;
    let tgt = e.target;
    if (tgt && (tgt.finished && tgt.place == null)) tgt = null;
    const desired = _v1;
    let direct = false;
    if (tgt && tgt.position) {
      _v2.subVectors(tgt.position, e.pos); _v2.y = 0;
      const d = _v2.length();
      if (d < BEE_DIRECT_DIST) { desired.copy(_v2); direct = true; }
    }
    if (!direct) {
      if (tr?.getPointAt && Number.isFinite(e.t) && Number.isFinite(tr.length) && tr.length > 0) {
        const la = 14 / tr.length;
        try {
          const p = tr.getPointAt(wrap01(e.t + la));
          if (p) desired.set(p.x - e.pos.x, 0, p.z - e.pos.z);
          else desired.copy(e.vel);
        } catch (_) { desired.copy(e.vel); }
      } else if (tgt && tgt.position) {
        desired.subVectors(tgt.position, e.pos); desired.y = 0;
      } else desired.copy(e.vel);
    }
    desired.y = 0;
    if (desired.lengthSq() < 1e-6) return;
    const cur = Math.atan2(e.vel.x, e.vel.z);
    const want = Math.atan2(desired.x, desired.z);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = (direct ? BEE_TURN * 1.6 : BEE_TURN) * dt;
    const na = cur + Math.max(-turn, Math.min(turn, diff));
    const sp = e.speed || BEE_SPEED;
    e.vel.x = Math.sin(na) * sp;
    e.vel.z = Math.cos(na) * sp;
  }

  _simComet(e, dt) {
    e.life += dt;
    const tr = this.track;
    // retarget current leader
    const leader = this._leader();
    if (leader) e.target = leader;
    const tgt = e.target;
    e.spin += dt * 10;
    if (e.life > COMET_LIFE || !tgt || !tgt.position) { this._explodeComet(e); return; }

    if (e.phase === 'rise') {
      e.alt = Math.min(COMET_ALT, e.alt + dt * 12);
      if (e.alt >= COMET_ALT - 0.01) e.phase = 'travel';
    }
    if (e.phase === 'rise' || e.phase === 'travel') {
      _v2.subVectors(tgt.position, e.pos); _v2.y = 0;
      const dist = _v2.length();
      if (dist < 22) { e.phase = 'seek'; }
      else if (tr?.getPointAt && Number.isFinite(tr.length) && tr.length > 0) {
        e.t = wrap01(finite(e.t) + (COMET_SPEED * dt) / tr.length);
        let p = null;
        try { p = tr.getPointAt(e.t); } catch (_) { p = null; }
        if (p) {
          // blend toward centerline point (smooth)
          const k = Math.min(1, dt * 8);
          e.pos.x += (p.x - e.pos.x) * k;
          e.pos.z += (p.z - e.pos.z) * k;
          e.pos.y += (p.y + e.alt - e.pos.y) * k;
        }
      } else {
        _v2.normalize();
        e.pos.addScaledVector(_v2, COMET_SPEED * dt);
      }
    }
    if (e.phase === 'seek') {
      _v2.subVectors(tgt.position, e.pos); _v2.y = 0;
      const dist = _v2.length();
      const step = Math.min(dist, (COMET_SPEED * 0.9 + finite(tgt.speed) * 0.5) * dt);
      if (dist > 1e-3) e.pos.addScaledVector(_v2.normalize(), step);
      e.pos.y += (tgt.position.y + COMET_ALT - e.pos.y) * Math.min(1, dt * 5);
      if (dist < 2.0) { e.phase = 'hover'; e.hoverTimer = 0; }
    }
    if (e.phase === 'hover') {
      e.hoverTimer += dt;
      const f = e.hoverTimer / COMET_HOVER_TIME;
      const ang = e.hoverTimer * 9;
      const rad = 1.4 * (1 - f);
      e.pos.x = tgt.position.x + Math.cos(ang) * rad;
      e.pos.z = tgt.position.z + Math.sin(ang) * rad;
      const alt = COMET_ALT * (1 - f) + 1.6 * f + Math.sin(e.hoverTimer * 20) * 0.1;
      e.pos.y = tgt.position.y + alt;
      e.spin += dt * 20 * f;
      if (f >= 1) { this._explodeComet(e); return; }
    }
    const h = e.holder;
    // nose along the direction of travel; nose-down while hovering over the target
    if (!e._prev) e._prev = e.pos.clone();
    const dx = e.pos.x - e._prev.x, dz = e.pos.z - e._prev.z;
    if (e.phase === 'hover') h.rotation.set(Math.PI / 2 * Math.min(1, e.hoverTimer / COMET_HOVER_TIME), h.rotation.y, 0);
    else if (dx * dx + dz * dz > 1e-6) h.rotation.set(0, Math.atan2(dx, dz), Math.sin(e.life * 8) * 0.25);
    e._prev.copy(e.pos);
    h.position.copy(e.pos);
  }

  _explodeComet(e) {
    // on target after hovering; otherwise (timed out / lost target) explode where it is
    const pos = (e.phase === 'hover' && e.target?.position) ? _v3.copy(e.target.position) : _v3.copy(e.pos);
    if (e.phase !== 'hover') pos.y = this._groundHeight(pos, null);
    bus.emit('item:explode', { position: pos.clone(), radius: COMET_RADIUS, kind: 'comet' });
    for (const k of this.karts) {
      if (!k || !k.position) continue;
      const dx = k.position.x - pos.x, dz = k.position.z - pos.z, dy = k.position.y - pos.y;
      if (dx * dx + dz * dz < COMET_RADIUS * COMET_RADIUS && Math.abs(dy) < 6) this._hitKart(k, 'tumble', 'comet', e.owner);
    }
    e.dead = true;
  }

  _hitKart(kart, kind, item, by) {
    if (finite(kart.starTimer) > 0 || finite(kart.invulnTimer) > 0) return false;
    kart.applyHit?.(kind);
    bus.emit('item:hit', { kart, item, by });
    return true;
  }

  _kill(e, fx) {
    if (e.dead) return;
    e.dead = true;
    if (fx && e.type !== 'gum') bus.emit('item:explode', { position: e.pos.clone(), radius: 1.6, kind: 'small' });
  }

  _collide() {
    const ents = this.entities;
    const karts = this.karts;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.type === 'comet') continue;
      if (e.type === 'gum' && e.flying && e.vel.y > 0) continue;
      // vs karts
      for (const k of karts) {
        if (!k || !k.position) continue;
        if (k === e.owner && e.age < OWNER_GRACE) continue;
        const r = kartRadius(k) + e.radius;
        const dx = k.position.x - e.pos.x, dz = k.position.z - e.pos.z;
        const dy = (k.position.y + 0.4) - e.pos.y;
        if (dx * dx + dz * dz > r * r || Math.abs(dy) > 1.9) continue;
        if (finite(k.starTimer) > 0) {
          // starred karts smash items
          e.dead = true;
          bus.emit('item:explode', { position: e.pos.clone(), radius: 1.4, kind: 'small' });
          break;
        }
        if (e.type === 'gum') {
          if (this._hitKart(k, 'spin', 'gum', e.owner) || finite(k.invulnTimer) <= 0) e.dead = true;
          else continue; // invulnerable karts pass over bananas
        } else {
          this._hitKart(k, 'tumble', e.type, e.owner);
          this._kill(e, true);
        }
        break;
      }
      if (e.dead) continue;
      // shells vs other items
      if (e.type === 'gum') continue;
      for (let j = 0; j < ents.length; j++) {
        if (j === i) continue;
        const o = ents[j];
        if (o.dead || o.type === 'comet') continue;
        if (o.type === 'gum' && o.flying) continue;
        if (e.age < 0.1 && o.owner === e.owner && o.type !== 'gum') continue;
        const r = e.radius + o.radius;
        const dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z, dy = o.pos.y - e.pos.y;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 1.5) {
          this._kill(e, true);
          o.dead = true;
          break;
        }
      }
    }
  }
}
