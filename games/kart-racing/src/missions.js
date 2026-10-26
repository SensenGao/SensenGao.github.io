// Missions: 10 short challenges with 1–3 star ratings. Each definition configures the race (track, rivals,
// items, laps/timer) and a runtime that spawns its objects (gems, balloons, gates) and scores the run.
import * as THREE from 'three';
import { bus } from './events.js';
import { toonMaterial, outlineMaterial, computeOutlineNormals } from './toon.js';
import { paint, mergePainted } from './envkit.js';
import { t } from './i18n.js';

/**
 * type: drift | gems | targets | overtake | clean | gates | ultra | pads | dodge | hits
 * stars: thresholds for 1/2/3 stars (higher score is better unless `lowerIsBetter`).
 * race: overrides for the race (racers, items, laps, grid, startItem, itemFilter, timer).
 */
export const MISSIONS = [
  { id: 'drift-school', track: 'harbor', type: 'drift', time: 45, stars: [4, 8, 12],
    name: 'Drift School', zh: '漂移学校', goal: 'Fire as many mini-turbos as you can in 45 s', goalZh: '45 秒内尽可能多地触发迷你加速',
    race: { racers: 1, items: false, laps: 9 } },
  { id: 'gem-rush', track: 'canyon', type: 'gems', time: 60, stars: [12, 22, 32],
    name: 'Gem Rush', zh: '宝石冲刺', goal: 'Grab the gems along the canyon road before time runs out', goalZh: '在时间耗尽前收集峡谷路上的宝石',
    race: { racers: 1, items: false, laps: 9 } },
  { id: 'target-practice', track: 'harbor', type: 'targets', time: 75, stars: [6, 9, 12],
    name: 'Target Practice', zh: '靶场练习', goal: 'Pop the balloons with Bouncer Balls (endless supply)', goalZh: '用弹弹球打爆气球（无限补给）',
    race: { racers: 1, items: 'ball', laps: 9 } },
  { id: 'overtake', track: 'frost', type: 'overtake', stars: [3, 2, 1], lowerIsBetter: true,
    name: 'Overtake Frenzy', zh: '超车狂欢', goal: 'Start last and finish as high as you can in one lap', goalZh: '从最后一名出发，一圈内尽量冲到前面',
    race: { racers: 8, items: true, laps: 1, grid: 7, cls: 'chill' } },
  { id: 'clean-lap', track: 'canyon', type: 'clean', stars: [0, 0, 0], lowerIsBetter: true,
    name: 'Clean Lap', zh: '零失误圈', goal: 'Finish a fast lap without touching a single wall', goalZh: '不碰任何墙壁地完成快速一圈',
    race: { racers: 1, items: false, laps: 1 } },
  { id: 'slalom', track: 'frost', type: 'gates', time: 70, stars: [8, 11, 14],
    name: 'Slalom Gates', zh: '障碍门滑行', goal: 'Drive through the flag gates in order', goalZh: '按顺序穿过旗门',
    race: { racers: 1, items: false, laps: 9 } },
  { id: 'purple-power', track: 'frost', type: 'ultra', time: 60, stars: [1, 2, 4],
    name: 'Purple Power', zh: '紫色力量', goal: 'Charge full purple (Ultra) mini-turbos — ice helps!', goalZh: '蓄满紫色（极限）迷你加速——冰面有帮助！',
    race: { racers: 1, items: false, laps: 9 } },
  { id: 'boost-chain', track: 'harbor', type: 'pads', time: 50, stars: [2, 4, 6],
    name: 'Boost Chain', zh: '加速连锁', goal: 'Hit as many boost pads as you can in 50 s', goalZh: '50 秒内踩中尽可能多的加速板',
    race: { racers: 1, items: false, laps: 9 } },
  { id: 'boulder-dash', track: 'canyon', type: 'dodge', stars: [2, 1, 0], lowerIsBetter: true,
    name: 'Boulder Dash', zh: '巨石闪避', goal: 'Finish a lap with as few hazard hits as possible', goalZh: '尽量少被障碍物撞到地完成一圈',
    race: { racers: 1, items: false, laps: 1, hazardBoost: true } },
  { id: 'item-master', track: 'harbor', type: 'hits', stars: [2, 4, 6],
    name: 'Item Master', zh: '道具大师', goal: 'Hit rivals with your items during a 2-lap race', goalZh: '在两圈比赛中用道具击中对手',
    race: { racers: 8, items: 'attack', laps: 2, grid: 4, cls: 'zoom' } },
];
export const missionById = (id) => MISSIONS.find((m) => m.id === id);

export function starsFor(def, score) {
  if (score == null) return 0;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const th = def.stars[i];
    if (def.lowerIsBetter ? score <= th : score >= th) n = i + 1;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

/**
 * Create the runtime for a mission inside a built world ({ scene, track, player, items, race, karts }).
 * Returns { update(dt), hud() -> { label, value, sub, time }, done, result, dispose() }.
 */
export function createMissionRuntime(def, world) {
  const track = world.track, player = world.player;
  const L = track.layout;
  const offs = [];
  const on = (n, f) => offs.push(bus.on(n, f));
  const group = new THREE.Group(); group.name = 'mission'; world.scene.add(group);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const st = { score: 0, timeLeft: def.time ?? null, started: false, done: false, failed: false, extra: 0 };
  const rt = { def, st, done: false, result: null };
  let thresholds = def.stars;

  // Clean Lap thresholds scale with the track length (average speed 32 / 36 / 39 m/s)
  if (def.type === 'clean') thresholds = [track.length / 32, track.length / 36, track.length / 39];
  if (def.type === 'clean' || def.type === 'dodge') st.timeLeft = Math.round(track.length / 15);
  rt.thresholds = thresholds;

  const finish = (success = true) => {
    if (st.done) return;
    st.done = true; rt.done = true;
    const score = st.score;
    const stars = success ? starsFor({ ...def, stars: thresholds }, score) : 0;
    rt.result = { score, stars, success, failed: !success || stars === 0, thresholds };
    bus.emit('mission:end', rt.result);
  };

  on('race:go', () => { st.started = true; });
  on('race:finish', (d) => {
    if (!d || d.kart !== player) return;
    if (def.type === 'overtake') { st.score = d.place; finish(true); }
    else if (def.type === 'clean') { st.score = d.time; finish(!st.failed); }
    else if (def.type === 'dodge') { finish(true); }
    else if (def.type === 'hits') finish(true);
  });

  // ---------------------------------------------------------------- per-type setup
  let objects = null;   // { mesh, list:[{pos, alive}], radius, onCollect }
  const spinItems = [];
  if (def.type === 'drift') on('kart:miniTurbo', (d) => { if (d.kart === player && st.started && !st.done) st.score++; });
  if (def.type === 'ultra') on('kart:miniTurbo', (d) => { if (d.kart === player && d.level >= 3 && st.started && !st.done) st.score++; });
  if (def.type === 'pads') on('kart:boost', (d) => { if (d.kart === player && d.source === 'pad' && st.started && !st.done) st.score++; });
  if (def.type === 'clean') on('kart:wallBump', (d) => { if (d.kart === player && st.started && !st.done) { st.failed = true; finish(false); } });
  if (def.type === 'dodge') on('kart:hit', (d) => { if (d.kart === player && st.started && !st.done) st.score++; });
  if (def.type === 'hits') on('item:hit', (d) => { if (d.by === player && d.kart !== player && st.started && !st.done) st.score++; });
  if (def.type === 'overtake') st.score = 8;

  if (def.type === 'gems') {
    // 40 gems along the racing line with a weaving lateral offset
    const geo = keep(mergePainted([paint(new THREE.OctahedronGeometry(0.75, 0).scale(1, 1.3, 1), 0x19b5a5), paint(new THREE.OctahedronGeometry(0.42, 0).scale(1, 1.3, 1).translate(0, 0, 0.36), 0x7ff5e6)]));
    const list = [];
    const n = 40;
    for (let k = 0; k < n; k++) {
      const t = (k + 1) / (n + 1) * 0.98 + 0.01;
      const lat = Math.sin(k * 0.9) * (L.halfWidth - 3.5);
      const p = track.pointAtLat(t, lat); p.y += 1.3;
      list.push({ pos: p, alive: true, ph: k * 0.7 });
    }
    objects = makeInstanced(geo, list, 2.4, () => { st.score++; bus.emit('mission:collect', { kind: 'gem' }); });
  }
  if (def.type === 'targets') {
    const balloon = keep(mergePainted([
      paint(new THREE.SphereGeometry(1.1, 14, 10).scale(1, 1.2, 1), 0xffffff),
      paint(new THREE.ConeGeometry(0.22, 0.3, 8).rotateX(Math.PI).translate(0, -1.35, 0), 0xffffff),
      paint(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 3).translate(0, -2.5, 0), 0x2b1d2e),
      paint(new THREE.SphereGeometry(0.25, 8, 6).translate(0.4, 0.5, 0.75), 0xfff4dc),
    ]));
    const list = [];
    const cols = [0xe2366f, 0xffd23f, 0x19b5a5, 0xff8a1e, 0x6b4bc4];
    for (let k = 0; k < 12; k++) {
      const t = 0.04 + k * 0.08;
      const lat = ((k % 3) - 1) * (L.halfWidth - 4);
      const p = track.pointAtLat(t, lat); p.y += 3.2;
      list.push({ pos: p, alive: true, ph: k, color: cols[k % cols.length] });
    }
    objects = makeInstanced(balloon, list, 1.6, () => { st.score++; bus.emit('mission:collect', { kind: 'balloon' }); }, { projectiles: true });
  }
  if (def.type === 'gates') {
    // 15 gates: two candy poles + banner, alternating lateral offsets
    const pole = keep(mergePainted([paint(new THREE.CylinderGeometry(0.22, 0.22, 5, 8).translate(0, 2.5, 0), 0xfff4dc), paint(new THREE.SphereGeometry(0.4, 10, 8).translate(0, 5.2, 0), 0xe2366f)]));
    const bannerG = keep(new THREE.BoxGeometry(1, 0.9, 0.12)); computeOutlineNormals(bannerG);
    const poles = [], banners = [];
    const gates = [];
    for (let k = 0; k < 15; k++) {
      const t = 0.05 + k * (0.9 / 15);
      const lat = ((k % 2) * 2 - 1) * 3.5;
      const hw = 4.4;
      const s = t * L.N;
      gates.push({ t, lat, hw, s, passed: false, missed: false, idx: k });
      const a = track.pointAtLat(t, lat - hw), b = track.pointAtLat(t, lat + hw);
      poles.push({ pos: a, alive: true }, { pos: b, alive: true });
      const c = a.clone().lerp(b, 0.5); c.y += 4.3;
      banners.push({ pos: c, yaw: Math.atan2(b.x - a.x, b.z - a.z), w: a.distanceTo(b) });
    }
    const poleMesh = makeStatic(pole, poles.map((o) => ({ pos: o.pos, yaw: 0, s: [1, 1, 1] })), toonMaterial({ vertexColors: true }));
    const banMat = keep(toonMaterial({ color: 0xffffff }));
    const banMesh = makeStatic(bannerG, banners.map((b) => ({ pos: b.pos, yaw: b.yaw + Math.PI / 2, s: [b.w, 1, 1] })), banMat, true);
    banners.forEach((b, k) => banMesh.setColorAt(k, new THREE.Color(k === 0 ? 0xffd23f : 0x19b5a5)));
    banMesh.instanceColor && (banMesh.instanceColor.needsUpdate = true);
    rt._gates = gates;
    let next = 0;
    let prevT = null;
    spinItems.push(() => {
      if (!st.started || st.done || next >= gates.length) return;
      const tt = player.trackT;
      if (prevT == null) { prevT = tt; return; }
      const g = gates[next];
      const crossed = prevT < g.t && tt >= g.t && tt - prevT < 0.2;
      prevT = tt;
      if (!crossed) return;
      if (Math.abs(player.lateral - g.lat) <= g.hw + 0.6) { st.score++; g.passed = true; bus.emit('mission:collect', { kind: 'gate' }); }
      else { g.missed = true; bus.emit('mission:miss', { kind: 'gate' }); }
      banMesh.setColorAt(next, new THREE.Color(g.passed ? 0x6bd66b : 0x8a7f88));
      next++;
      if (next < gates.length) banMesh.setColorAt(next, new THREE.Color(0xffd23f));
      banMesh.instanceColor.needsUpdate = true;
      if (next >= gates.length) finish(true);
    });
    void poleMesh;
  }

  function makeStatic(geo, list, mat, ink = true) {
    keep(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, k) => { _e.set(0, o.yaw || 0, 0); _q.setFromEuler(_e); _s.set(...(o.s || [1, 1, 1])); mesh.setMatrixAt(k, _m.compose(o.pos, _q, _s)); });
    mesh.castShadow = true; group.add(mesh);
    if (ink && geo.attributes.outlineN) { const o = new THREE.InstancedMesh(geo, keep(outlineMaterial({ width: 0.03 })), list.length); o.instanceMatrix = mesh.instanceMatrix; group.add(o); }
    return mesh;
  }

  function makeInstanced(geo, list, radius, onCollect, { projectiles = false } = {}) {
    const mat = keep(toonMaterial({ vertexColors: true }));
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const ink = new THREE.InstancedMesh(geo, keep(outlineMaterial({ width: 0.03 })), list.length);
    ink.instanceMatrix = mesh.instanceMatrix;
    list.forEach((o, k) => { if (o.color != null) mesh.setColorAt(k, new THREE.Color(o.color)); });
    mesh.frustumCulled = ink.frustumCulled = false;
    mesh.castShadow = true;
    group.add(mesh, ink);
    const obj = { mesh, list, radius, onCollect, projectiles, t: 0 };
    return obj;
  }

  function updateObjects(dt) {
    if (!objects) return;
    const o = objects; o.t += dt;
    const ents = projectilesOf(world.items);
    o.list.forEach((it, k) => {
      if (it.alive) {
        // collect by kart
        const dx = player.position.x - it.pos.x, dz = player.position.z - it.pos.z, dy = player.position.y + 1 - it.pos.y;
        let hit = !o.projectiles && dx * dx + dz * dz < o.radius * o.radius && Math.abs(dy) < 3;
        if (o.projectiles) {
          for (const e of ents) {
            const ex = e.pos.x - it.pos.x, ez = e.pos.z - it.pos.z, ey = e.pos.y + 0.6 - (it.pos.y - 0.4);
            if (ex * ex + ez * ez + ey * ey * 0.25 < (o.radius + 1) ** 2) { hit = true; e.dead = true; bus.emit('item:explode', { position: it.pos.clone(), radius: 1.5, kind: 'pop' }); break; }
          }
        }
        if (hit && st.started && !st.done) { it.alive = false; it.pop = 0; o.onCollect(it); }
      }
      let sc = 1;
      if (!it.alive) { it.pop = (it.pop || 0) + dt; sc = Math.max(0, 1 - it.pop * 5) * (1 + it.pop * 3); }
      _e.set(0, o.t * 1.8 + (it.ph || 0), 0); _q.setFromEuler(_e);
      _p.copy(it.pos); _p.y += Math.sin(o.t * 2 + (it.ph || 0)) * 0.25;
      o.mesh.setMatrixAt(k, _m.compose(_p, _q, _s.setScalar(sc)));
    });
    o.mesh.instanceMatrix.needsUpdate = true;
  }

  // the Bouncer Ball refills itself in Target Practice; Boulder Dash doubles the hazards' threat
  let refill = 0;
  function itemSupport(dt) {
    if (def.race.items === 'ball' && st.started && !st.done) {
      if (!player.item) { refill += dt; if (refill > 0.45) { player.item = 'ball'; player.itemCount = 1; refill = 0; } }
    }
  }

  rt.update = (dt) => {
    if (st.done) return;
    if (st.started && st.timeLeft != null) {
      st.timeLeft -= dt;
      if (st.timeLeft <= 0) {
        st.timeLeft = 0;
        if (def.type === 'clean' || def.type === 'dodge') finish(false);
        else finish(true);
        return;
      }
    }
    if (def.type === 'overtake') st.score = player.place || 8;
    if (def.type === 'clean' && world.race) st.score = world.race.raceTime;
    updateObjects(dt);
    for (const f of spinItems) f(dt);
    itemSupport(dt);
    if (def.type === 'gems' && objects && objects.list.every((g) => !g.alive)) finish(true);
    if (def.type === 'targets' && objects && objects.list.every((g) => !g.alive)) finish(true);
  };

  /** Next objective ahead of the player as { t, lat } (used by the keyboard test bot, could drive a HUD arrow). */
  rt.nextTarget = () => {
    const tp = player.trackT;
    const ahead = (t) => { let d = t - tp; if (d < 0) d += 1; return d; };
    let best = null, bd = 0.06;   // look up to ~6% of a lap ahead
    const consider = (t, lat) => { const d = ahead(t); if (d > 0.002 && d < bd) { bd = d; best = { t, lat }; } };
    if (objects) for (const it of objects.list) { if (!it.alive) continue; if (it.t == null) { const info = track.getSurfaceInfo(it.pos); it.t = info.t; it.lat = info.lateral; } consider(it.t, it.lat); }
    if (def.type === 'pads') for (const pad of track.boostPads || []) consider(pad.t, pad.lateral);
    if (rt._gates) { const g = rt._gates.find((x) => !x.passed && !x.missed); if (g) consider(g.t, g.lat); }
    return best;
  };

  rt.hud = () => {
    const unit = t('unit.' + def.type);
    let value = String(st.score);
    if (def.type === 'clean') value = formatT(st.score);
    if (def.type === 'overtake') value = ordinalNum(st.score);
    if (def.type === 'gems') value = `${st.score}/${objects ? objects.list.length : 0}`;
    if (def.type === 'targets') value = `${st.score}/${objects ? objects.list.length : 0}`;
    if (def.type === 'gates') value = `${st.score}/15`;
    return { value, unit, time: st.timeLeft, stars: starsFor({ ...def, stars: thresholds }, st.score), failed: st.failed };
  };

  rt.dispose = () => {
    offs.forEach((f) => f());
    world.scene.remove(group);
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    disposables.forEach((d) => d.dispose && d.dispose());
  };
  return rt;
}

function projectilesOf(items) {
  if (!items || !items.entities) return [];
  return items.entities.filter((e) => !e.dead && (e.type === 'ball' || e.type === 'bee'));
}
function formatT(t) { if (!(t >= 0)) return '--'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; }
function ordinalNum(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
