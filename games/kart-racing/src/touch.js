// On-screen touch controls for phones/tablets (landscape): analog steering pad on the left, GAS / BRAKE / DRIFT /
// ITEM buttons on the right, pause button top-right. Multi-touch via pointer events; writes into InputController.touch.
import { bus } from './events.js';
import { t } from './i18n.js';

const isTouchDevice = () => new URLSearchParams(location.search).has('touch') ||
  ((navigator.maxTouchPoints || 0) > 0 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

export class TouchControls {
  constructor(uiRoot, input) {
    this.input = input;
    this.active = isTouchDevice();
    this.visible = false;
    this.root = document.createElement('div');
    this.root.className = 'touch-ui hidden';
    uiRoot.appendChild(this.root);
    this.rotate = document.createElement('div');
    this.rotate.className = 'rotate-hint hidden';
    uiRoot.appendChild(this.rotate);
    this.pointers = new Map();   // pointerId -> control name
    this._build();
    if (this.active) {
      document.body.classList.add('touch-device');
      input.touch.active = true;
      const check = () => this._orientation();
      window.addEventListener('resize', check);
      window.addEventListener('orientationchange', check);
      check();
    }
  }

  _build() {
    this.root.innerHTML = `
      <div class="t-steer"><div class="t-steer-track"></div><div class="t-knob"></div><span class="t-l">◀</span><span class="t-r">▶</span></div>
      <button class="t-btn t-gas" data-c="gas"><span>${t('touch.gas')}</span></button>
      <button class="t-btn t-brake" data-c="brake"><span>${t('touch.brake')}</span></button>
      <button class="t-btn t-drift" data-c="drift"><span>${t('touch.drift')}</span></button>
      <button class="t-btn t-item" data-c="item"><span>${t('touch.item')}</span></button>
      <button class="t-btn t-look" data-c="look"><span>↺</span></button>
      <button class="t-pause" data-c="pause">II</button>`;
    this.rotate.innerHTML = `<div class="rot-phone">📱</div><div>${t('rotate')}</div>`;
    this.steerEl = this.root.querySelector('.t-steer');
    this.knob = this.root.querySelector('.t-knob');
    const down = (e) => {
      const target = e.target.closest('[data-c], .t-steer');
      if (!target) return;
      e.preventDefault();
      const c = target.classList.contains('t-steer') ? 'steer' : target.dataset.c;
      this.pointers.set(e.pointerId, c);
      try { target.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      if (c === 'steer') this._steerMove(e);
      else if (c === 'item') this.input.pressTouch('item');
      else if (c === 'pause') bus.emit('touch:pause');
      target.classList.add('down');
      this._sync();
      bus.emit('touch:skip');
    };
    const move = (e) => { if (this.pointers.get(e.pointerId) === 'steer') { e.preventDefault(); this._steerMove(e); this._sync(); } };
    const up = (e) => {
      const c = this.pointers.get(e.pointerId);
      if (!c) return;
      this.pointers.delete(e.pointerId);
      const el = c === 'steer' ? this.steerEl : this.root.querySelector(`[data-c="${c}"]`);
      if (el && ![...this.pointers.values()].includes(c)) el.classList.remove('down');
      if (c === 'steer') { this.steer = 0; this.knob.style.transform = 'translate(-50%, -50%)'; }
      this._sync();
    };
    this.steer = 0;
    if (this._bound) return;
    this._bound = true;
    this.root.addEventListener('pointerdown', down, { passive: false });
    this.root.addEventListener('pointermove', move, { passive: false });
    this.root.addEventListener('pointerup', up);
    this.root.addEventListener('pointercancel', up);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _steerMove(e) {
    const r = this.steerEl.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dz = 0.1;
    const v = Math.abs(x) < dz ? 0 : Math.sign(x) * Math.min(1, (Math.abs(x) - dz) / (0.85 - dz));
    this.steer = v;
    this.knob.style.transform = `translate(calc(-50% + ${Math.max(-1, Math.min(1, x)) * r.width * 0.38}px), -50%)`;
  }

  _sync() {
    const held = new Set(this.pointers.values());
    const tc = this.input.touch;
    tc.steer = held.has('steer') ? this.steer : 0;
    tc.throttle = held.has('gas') ? 1 : 0;
    tc.brake = held.has('brake') ? 1 : 0;
    tc.drift = held.has('drift');
    tc.lookBack = held.has('look');
  }

  _orientation() {
    const portrait = window.innerHeight > window.innerWidth;
    this.rotate.classList.toggle('hidden', !(this.active && portrait));
  }

  setVisible(v) {
    this.visible = !!v && this.active;
    this.root.classList.toggle('hidden', !this.visible);
    if (!this.visible) { this.pointers.clear(); this._sync(); this.root.querySelectorAll('.down').forEach((e) => e.classList.remove('down')); }
  }
  refresh() { this._build(); }
}
