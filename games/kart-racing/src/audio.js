// Fully procedural WebAudio engine: player engine, SFX, and a lookahead-scheduled multi-style music sequencer
// with one original song per track plus menu / results / podium themes.
import { bus } from './events.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------------------------
// Songs (all original). Steps are 16th notes; 16 steps per bar. Melody entries: [step, midi, lengthInSteps].
// Each song picks a drum groove, a lead voice and an accompaniment style for the sequencer below.
// ---------------------------------------------------------------------------------------------
const B = (root, chord, mel, fill) => ({ root, chord, mel, fill: !!fill });
const SONGS = {
  // main menu: breezy chill-hop in G
  menu: { bpm: 96, drums: 'chill', lead: 'soft', comp: 'pad', bass: [0, null, null, 7, 12, null, 7, null], bars: [
    B(43, [59, 62, 67, 71], [[0, 74, 4], [4, 76, 2], [6, 74, 2], [8, 71, 6], [14, 69, 2]]),
    B(40, [55, 59, 64, 67], [[0, 71, 4], [4, 74, 4], [8, 76, 4], [12, 79, 4]]),
    B(36, [55, 60, 64, 67], [[0, 79, 3], [3, 76, 1], [4, 74, 4], [8, 72, 4], [12, 71, 4]]),
    B(38, [54, 57, 62, 66], [[0, 69, 6], [6, 71, 2], [8, 74, 8]]),
    B(43, [59, 62, 67, 71], [[0, 79, 2], [2, 78, 2], [4, 79, 4], [8, 83, 4], [12, 81, 4]]),
    B(40, [55, 59, 64, 67], [[0, 79, 4], [4, 76, 4], [8, 74, 6], [14, 76, 2]]),
    B(36, [55, 60, 64, 67], [[0, 72, 4], [4, 76, 2], [6, 79, 2], [8, 84, 4], [12, 83, 4]]),
    B(38, [54, 57, 62, 66], [[0, 81, 8], [8, 78, 4], [12, 74, 4]], true),
  ] },
  // Harborlight Bay: sunny calypso-ska in C with a marimba lead and off-beat skank chords
  harbor: { bpm: 148, drums: 'ska', lead: 'marimba', comp: 'skank', bass: [0, 12, 7, 12, 0, 12, 7, 5], bars: [
    B(36, [60, 64, 67], [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 76, 1], [7, 77, 1], [8, 79, 3], [11, 76, 1], [12, 74, 2], [14, 72, 2]]),
    B(45, [57, 60, 64], [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 69, 2], [8, 72, 4], [12, 76, 2], [14, 74, 2]]),
    B(41, [57, 60, 65], [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 74, 2], [10, 77, 2], [12, 81, 4]]),
    B(43, [55, 59, 62], [[0, 79, 3], [3, 77, 1], [4, 76, 2], [6, 74, 2], [8, 71, 2], [10, 74, 2], [12, 79, 4]]),
    B(36, [60, 64, 67], [[0, 84, 2], [2, 79, 2], [4, 76, 2], [6, 79, 2], [8, 84, 3], [11, 83, 1], [12, 81, 2], [14, 79, 2]]),
    B(40, [55, 59, 64], [[0, 79, 2], [2, 76, 2], [4, 71, 2], [6, 76, 2], [8, 79, 4], [12, 83, 4]]),
    B(41, [57, 60, 65], [[0, 81, 3], [3, 79, 1], [4, 77, 2], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 69, 4]]),
    B(43, [55, 59, 62], [[0, 71, 2], [2, 74, 2], [4, 77, 2], [6, 79, 2], [8, 83, 2], [10, 86, 2], [12, 84, 4]], true),
  ] },
  // Sunset Canyon: galloping surf-western in A minor with a twangy lead
  canyon: { bpm: 162, drums: 'gallop', lead: 'twang', comp: 'strum', bass: [0, 0, 7, 0, 0, 0, 7, 12], bars: [
    B(45, [57, 60, 64], [[0, 69, 3], [3, 72, 1], [4, 76, 4], [8, 74, 2], [10, 72, 2], [12, 71, 2], [14, 69, 2]]),
    B(43, [55, 59, 62], [[0, 67, 3], [3, 71, 1], [4, 74, 4], [8, 72, 2], [10, 71, 2], [12, 69, 4]]),
    B(41, [53, 57, 60], [[0, 65, 2], [2, 69, 2], [4, 72, 4], [8, 71, 2], [10, 69, 2], [12, 67, 2], [14, 65, 2]]),
    B(40, [56, 59, 64], [[0, 64, 4], [4, 68, 2], [6, 71, 2], [8, 76, 6], [14, 74, 2]]),
    B(45, [57, 60, 64], [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2], [8, 76, 3], [11, 74, 1], [12, 72, 4]]),
    B(36, [55, 60, 64], [[0, 79, 2], [2, 76, 2], [4, 72, 2], [6, 67, 2], [8, 72, 3], [11, 74, 1], [12, 76, 4]]),
    B(38, [57, 62, 66], [[0, 78, 2], [2, 74, 2], [4, 69, 2], [6, 74, 2], [8, 78, 2], [10, 81, 2], [12, 78, 4]]),
    B(40, [56, 59, 64], [[0, 76, 2], [2, 75, 1], [3, 76, 1], [4, 80, 2], [6, 83, 2], [8, 88, 4], [12, 83, 2], [14, 80, 2]], true),
  ] },
  // Aurora Pines: sparkly sleigh-electro in D minor with bell lead
  frost: { bpm: 138, drums: 'electro', lead: 'bell', comp: 'arp', bass: [0, 0, 12, 0, 0, 0, 12, 7], bars: [
    B(38, [62, 65, 69], [[0, 74, 2], [2, 77, 2], [4, 81, 2], [6, 77, 2], [8, 79, 2], [10, 77, 2], [12, 76, 2], [14, 74, 2]]),
    B(34, [58, 62, 65], [[0, 74, 2], [2, 77, 2], [4, 82, 2], [6, 81, 2], [8, 77, 4], [12, 74, 4]]),
    B(41, [57, 60, 65], [[0, 72, 2], [2, 77, 2], [4, 81, 2], [6, 84, 2], [8, 81, 2], [10, 77, 2], [12, 79, 4]]),
    B(36, [55, 60, 64], [[0, 76, 2], [2, 79, 2], [4, 84, 4], [8, 79, 2], [10, 76, 2], [12, 72, 4]]),
    B(38, [62, 65, 69], [[0, 86, 2], [2, 84, 2], [4, 81, 2], [6, 77, 2], [8, 81, 2], [10, 84, 2], [12, 86, 4]]),
    B(34, [58, 62, 65], [[0, 82, 2], [2, 81, 2], [4, 77, 2], [6, 74, 2], [8, 77, 4], [12, 82, 4]]),
    B(43, [55, 58, 62], [[0, 79, 2], [2, 82, 2], [4, 86, 2], [6, 82, 2], [8, 79, 2], [10, 77, 2], [12, 74, 4]]),
    B(45, [57, 61, 64], [[0, 73, 2], [2, 76, 2], [4, 81, 2], [6, 85, 2], [8, 88, 4], [12, 85, 4]], true),
  ] },
  // Lantern Night: warm synthwave in F
  night: { bpm: 122, drums: 'electro', lead: 'saw', comp: 'pad', bass: [0, 0, 0, 12, 0, 0, 7, 12], bars: [
    B(41, [57, 60, 64, 65], [[0, 72, 4], [4, 76, 4], [8, 77, 6], [14, 76, 2]]),
    B(40, [55, 59, 62, 64], [[0, 74, 4], [4, 71, 4], [8, 67, 8]]),
    B(38, [57, 60, 62, 65], [[0, 69, 2], [2, 72, 2], [4, 77, 4], [8, 76, 4], [12, 74, 4]]),
    B(36, [55, 60, 64, 67], [[0, 72, 8], [8, 76, 4], [12, 79, 4]]),
    B(34, [58, 62, 65, 69], [[0, 81, 4], [4, 79, 4], [8, 77, 4], [12, 74, 4]]),
    B(45, [57, 60, 64, 67], [[0, 76, 6], [6, 74, 2], [8, 72, 8]]),
    B(43, [55, 58, 62, 65], [[0, 70, 2], [2, 74, 2], [4, 77, 4], [8, 79, 4], [12, 82, 4]]),
    B(36, [55, 60, 64, 67], [[0, 84, 8], [8, 79, 4], [12, 76, 4]], true),
  ] },
  // results / standings: bouncy shuffle in C
  results: { bpm: 112, drums: 'chill', lead: 'marimba', comp: 'skank', bass: [0, null, 7, null, 12, null, 7, null], bars: [
    B(36, [60, 64, 67], [[0, 72, 2], [4, 76, 2], [8, 79, 4], [12, 76, 4]]),
    B(41, [57, 60, 65], [[0, 77, 2], [4, 81, 2], [8, 84, 4], [12, 81, 4]]),
    B(43, [55, 59, 62], [[0, 79, 2], [4, 83, 2], [8, 86, 4], [12, 83, 2], [14, 79, 2]]),
    B(36, [60, 64, 67], [[0, 84, 6], [8, 79, 4], [12, 72, 4]], true),
  ] },
  // podium: triumphant march in Bb
  podium: { bpm: 116, drums: 'march', lead: 'brass', comp: 'strum', bass: [0, null, 7, null, 0, null, 7, 5], bars: [
    B(34, [58, 62, 65], [[0, 70, 3], [3, 70, 1], [4, 74, 4], [8, 77, 6], [14, 74, 2]]),
    B(39, [58, 63, 67], [[0, 75, 3], [3, 74, 1], [4, 72, 4], [8, 79, 8]]),
    B(41, [57, 60, 65], [[0, 77, 3], [3, 75, 1], [4, 74, 4], [8, 72, 4], [12, 69, 4]]),
    B(34, [58, 62, 65], [[0, 70, 4], [4, 74, 4], [8, 82, 8]], true),
  ] },
};
SONGS.race = SONGS.harbor;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.8;
    this.gameplay = false;       // gameplay SFX/engine active (race states)
    this.paused = false;
    this.camera = null;
    this.player = null;
    this.songName = null;
    this.tempoScale = 1;
    this._pendingSong = null;
    this._rouletteTimer = 0;
    this._rouletteActive = false;
    this._offs = [];

    this._onGesture = () => this.unlock();
    window.addEventListener('pointerdown', this._onGesture);
    window.addEventListener('keydown', this._onGesture);
    window.addEventListener('touchstart', this._onGesture);
    this._subscribe();
  }

  // ------------------------------------------------------------------ setup
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { console.warn('[audio] no AudioContext', e); return; }
      this._buildGraph();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this._pendingSong !== null && this.ctx) {
      const s = this._pendingSong; this._pendingSong = null; this.playMusic(s);
    }
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);

    this.musicGain = ctx.createGain(); this.musicGain.gain.value = this._musicLevel(); this.musicGain.connect(this.master);
    this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = 0.9 * (this.sfxVol ?? 0.8) / 0.8; this.sfxGain.connect(this.master);
    this.voiceGain = ctx.createGain(); this.voiceGain.gain.value = this.voiceMuted ? 0 : (this.voiceVol ?? 0.9) * 1.1; this.voiceGain.connect(this.master);
    this._decodeVoices();

    // shared noise buffer (2 s)
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // -- engine: two detuned oscillators + sub through a lowpass
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 400; this.engFilter.Q.value = 3;
    this.engA = ctx.createOscillator(); this.engA.type = 'sawtooth'; this.engA.frequency.value = 60;
    this.engB = ctx.createOscillator(); this.engB.type = 'square'; this.engB.frequency.value = 60; this.engB.detune.value = 14;
    this.engSub = ctx.createOscillator(); this.engSub.type = 'sine'; this.engSub.frequency.value = 30;
    const gA = ctx.createGain(); gA.gain.value = 0.5;
    const gB = ctx.createGain(); gB.gain.value = 0.28;
    const gS = ctx.createGain(); gS.gain.value = 0.6;
    this.engA.connect(gA); this.engB.connect(gB); this.engSub.connect(gS);
    gA.connect(this.engFilter); gB.connect(this.engFilter); gS.connect(this.engFilter);
    // a little "putt-putt" amplitude wobble
    this.engLfo = ctx.createOscillator(); this.engLfo.frequency.value = 18;
    this.engLfoGain = ctx.createGain(); this.engLfoGain.gain.value = 0.25;
    this.engAm = ctx.createGain(); this.engAm.gain.value = 0.75;
    this.engLfo.connect(this.engLfoGain); this.engLfoGain.connect(this.engAm.gain);
    this.engFilter.connect(this.engAm); this.engAm.connect(this.engGain); this.engGain.connect(this.sfxGain);
    for (const o of [this.engA, this.engB, this.engSub, this.engLfo]) o.start();

    // -- drift screech: looping noise through a resonant bandpass
    this.drSrc = ctx.createBufferSource(); this.drSrc.buffer = this.noiseBuf; this.drSrc.loop = true;
    this.drFilter = ctx.createBiquadFilter(); this.drFilter.type = 'bandpass'; this.drFilter.frequency.value = 1500; this.drFilter.Q.value = 6;
    this.drGain = ctx.createGain(); this.drGain.gain.value = 0;
    this.drSrc.connect(this.drFilter); this.drFilter.connect(this.drGain); this.drGain.connect(this.sfxGain);
    this.drSrc.start();

    // -- music scheduler
    this._step = 0; this._nextTime = 0;
    this._sched = setInterval(() => this._schedule(), 25);
  }

  _subscribe() {
    const on = (n, f) => this._offs.push(bus.on(n, (d) => { if (this.ctx) { try { f(d || {}); } catch (e) { console.warn('[audio]', n, e); } } }));
    const isP = (k) => k && k.isPlayer;
    on('race:countdown', (d) => { this.beep(440, 0.18, 'square', 0.14); this.say(String(d.n)); });
    on('race:go', () => { this.beep(880, 0.55, 'square', 0.16); this.beep(1760, 0.4, 'sine', 0.06); this.say('go'); });
    on('tt:record', () => this.say('record'));
    on('mission:end', (d) => { if (d && d.stars > 0) setTimeout(() => this.say('mission'), 600); });
    on('ui:welcome', () => this.say('welcome'));
    on('race:lap', (d) => { if (isP(d.kart)) this.lapChime(); });
    on('race:finalLap', () => { this.finalLapJingle(); this.tempoScale = 1.12; setTimeout(() => this.say('final'), 300); });
    on('race:finish', (d) => { if (isP(d.kart)) { this.fanfare(d.place); this.say(d.place === 1 ? 'win' : 'finish'); } });
    on('kart:driftLevel', (d) => { if (isP(d.kart) && d.level > 0) this.sparkTick(d.level); });
    on('kart:miniTurbo', (d) => { if (isP(d.kart)) this.whoosh(0.3 + 0.15 * (d.level || 1), 1 + 0.2 * (d.level || 1)); });
    on('kart:boost', (d) => { if (isP(d.kart) && d.source !== 'miniTurbo') this.whoosh(0.6, 1); });
    on('kart:hit', (d) => { if (isP(d.kart)) this.hitSound(d.kind); else this.atPos(d.kart && d.kart.position, 0.5, (g) => this.hitSound(d.kind, g)); });
    on('kart:wallBump', (d) => { if (isP(d.kart)) this.thud(clamp(d.intensity ?? 0.5, 0.1, 1)); });
    on('kart:bump', (d) => { if (isP(d.a) || isP(d.b)) this.thud(clamp((d.intensity ?? 0.5) * 0.7, 0.1, 0.8), 180); });
    on('kart:jump', (d) => { if (isP(d.kart)) this.boing(); });
    on('kart:land', (d) => { if (isP(d.kart)) this.thud(0.35, 90); });
    on('item:pickup', (d) => { if (isP(d.kart)) this.chime(); });
    on('item:roulette', (d) => { if (isP(d.kart)) { this._rouletteActive = true; this._rouletteTimer = 0; this._rouletteElapsed = 0; } });
    on('item:got', (d) => { if (isP(d.kart)) { this._rouletteActive = false; this.gotItem(); } });
    on('item:use', (d) => { if (isP(d.kart)) this.throwSound(d.item); });
    on('item:hit', (d) => { if (isP(d.by) && !isP(d.kart)) this.beep(1320, 0.12, 'square', 0.08); });
    on('item:explode', (d) => { const small = d.kind === 'small' || (d.radius != null && d.radius < 3); this.atPos(d.position, small ? 0.35 : 1, (g) => (small ? this.pop(g) : this.explosion(g))); });
    on('item:bell', () => this.bellRing());
    on('mission:collect', () => this.chime());
    on('mission:miss', () => this.uiClick(3));
    on('ui:error', () => this.uiClick(3));
    on('ui:move', () => this.uiClick(0));
    on('ui:confirm', () => this.uiClick(1));
    on('ui:back', () => this.uiClick(2));
  }

  // ------------------------------------------------------------------ public controls
  setGameplayActive(on) { this.gameplay = !!on; if (!on) { this._rouletteActive = false; this.tempoScale = 1; } }
  setPaused(p) {
    this.paused = !!p;
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(this._musicLevel(), this.ctx.currentTime, 0.1);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    return this.muted;
  }
  setVolume(v) { this.volume = clamp(v, 0, 1); if (this.master && !this.muted) this.master.gain.value = this.volume; }
  /** Settings: music / sfx / announcer volume 0..1, global mute and announcer mute. */
  setVolumes(music = 0.6, sfx = 0.8, muted = false, voice = 0.9, voiceMuted = false) {
    this.musicVol = clamp(music, 0, 1); this.sfxVol = clamp(sfx, 0, 1); this.muted = !!muted;
    this.voiceVol = clamp(voice ?? 0.9, 0, 1); this.voiceMuted = !!voiceMuted;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.voiceGain) this.voiceGain.gain.setTargetAtTime(this.voiceMuted ? 0 : this.voiceVol * 1.1, t, 0.05);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.03);
    this.musicGain.gain.setTargetAtTime((this.paused ? 0.14 : 0.42) * this.musicVol / 0.6, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(0.9 * this.sfxVol / 0.8, t, 0.05);
  }
  // ------------------------------------------------------------------ announcer voice lines
  /** map id -> ArrayBuffer (mp3); decoded once the AudioContext exists. */
  setVoiceData(map) { this.voiceRaw = { ...(this.voiceRaw || {}), ...map }; this._decodeVoices(); }
  _decodeVoices() {
    if (!this.ctx || !this.voiceRaw) return;
    this.voiceBuf = this.voiceBuf || {};
    for (const [id, buf] of Object.entries(this.voiceRaw)) {
      if (this.voiceBuf[id] || !buf) continue;
      this.voiceBuf[id] = 'pending';
      this.ctx.decodeAudioData(buf.slice(0)).then((b) => {
        this.voiceBuf[id] = b;
        // a line requested while it was still decoding plays if it is still timely
        if (this._wantSay && this._wantSay.id === id && performance.now() - this._wantSay.at < 1500) { this._wantSay = null; this.say(id); }
      }).catch(() => { delete this.voiceBuf[id]; });
    }
  }
  /** Play an announcer line (ducks the music a little). */
  say(id) {
    if (!this.ctx || this.muted || this.voiceMuted || !this.voiceBuf) return;
    const b = this.voiceBuf[id];
    if (b === 'pending') { this._wantSay = { id, at: performance.now() }; return; }
    if (!b) return;
    if (this._voiceSrc) { try { this._voiceSrc.stop(); } catch (e) { /* ignore */ } }
    const src = this.ctx.createBufferSource(); src.buffer = b; src.connect(this.voiceGain); src.start();
    this._voiceSrc = src;
    const g = this.musicGain.gain, t = this.ctx.currentTime;
    g.setTargetAtTime(this._musicLevel() * 0.45, t, 0.05); g.setTargetAtTime(this._musicLevel(), t + b.duration, 0.25);
  }

  _musicLevel() { return (this.paused ? 0.14 : 0.42) * (this.musicVol ?? 0.6) / 0.6; }

  playMusic(name) {
    if (!this.ctx) { this._pendingSong = name; return; }
    if (name === this.songName) return;
    this.songName = name;
    this.tempoScale = 1;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.08;
    // quick dip to hide the switch
    const g = this.musicGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(0.0, t); g.linearRampToValueAtTime(this._musicLevel(), t + 0.4);
  }
  stopMusic() { this.songName = null; this._pendingSong = null; }

  update(dt, { player, karts, camera } = {}) {
    this.player = player || null;
    this.camera = camera || this.camera;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const live = this.gameplay && !this.paused && player;
    // engine
    if (live) {
      const sp = Math.abs(player.speed || 0);
      const boosting = (player.boostTimer > 0) || (player.starTimer > 0);
      const shrunk = player.shrinkTimer > 0 ? 1.5 : 1;
      let f = (48 + sp * 2.3 + (boosting ? 22 : 0)) * shrunk;
      if (player.airborne) f *= 1.12;
      this.engA.frequency.setTargetAtTime(f, t, 0.06);
      this.engB.frequency.setTargetAtTime(f * 1.005, t, 0.06);
      this.engSub.frequency.setTargetAtTime(f * 0.5, t, 0.06);
      this.engLfo.frequency.setTargetAtTime(10 + sp * 0.6, t, 0.1);
      this.engFilter.frequency.setTargetAtTime(260 + sp * 45 + (boosting ? 900 : 0), t, 0.08);
      this.engGain.gain.setTargetAtTime(0.13 + Math.min(sp, 40) * 0.0016, t, 0.1);
      // drift screech
      const drifting = player.drifting && sp > 6 && !player.airborne;
      this.drGain.gain.setTargetAtTime(drifting ? 0.06 : 0, t, drifting ? 0.04 : 0.08);
      this.drFilter.frequency.setTargetAtTime(1300 + (player.driftLevel || 0) * 280 + Math.sin(t * 13) * 120, t, 0.05);
    } else {
      this.engGain.gain.setTargetAtTime(0, t, 0.12);
      this.drGain.gain.setTargetAtTime(0, t, 0.05);
    }
    // roulette ticks (stop after 3 s as a safety net)
    if (this._rouletteActive && live) {
      this._rouletteTimer -= dt; this._rouletteElapsed += dt;
      if (this._rouletteTimer <= 0) { this._rouletteTimer = 0.075; this.beep(1100 + Math.random() * 500, 0.03, 'square', 0.05); }
      if (this._rouletteElapsed > 3) this._rouletteActive = false;
    }
  }

  // ------------------------------------------------------------------ helpers
  _env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  _osc(type, freq, t, dur, peak, dest, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain(); this._env(g, t, attack, peak, Math.max(0.02, dur));
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + attack + dur + 0.05);
    return { o, g };
  }
  _noise(t, dur, peak, filterType, freq, q = 1, dest) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    const g = ctx.createGain(); this._env(g, t, 0.003, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    const off = Math.random() * Math.max(0, 1.9 - dur);
    s.start(t, off); s.stop(t + dur + 0.05);
    return { s, f, g };
  }
  atPos(pos, maxGain, fn) {
    if (!this.gameplay) return;
    let g = maxGain;
    if (pos && this.camera) {
      const d = this.camera.position.distanceTo(pos);
      g = maxGain * clamp(1 - d / 140, 0, 1);
    }
    if (g > 0.03) fn(g);
  }

  // ------------------------------------------------------------------ SFX
  beep(freq, dur, type = 'square', vol = 0.15) {
    if (!this.ctx) return;
    this._osc(type, freq, this.ctx.currentTime, dur, vol);
  }
  uiClick(kind) {
    const t = this.ctx.currentTime;
    if (kind === 0) this._osc('triangle', 880, t, 0.05, 0.12);
    else if (kind === 1) { this._osc('square', 660, t, 0.06, 0.09); this._osc('square', 990, t + 0.06, 0.1, 0.09); }
    else if (kind === 3) { this._osc('square', 220, t, 0.12, 0.08); this._osc('square', 180, t + 0.08, 0.14, 0.08); }
    else this._osc('triangle', 440, t, 0.08, 0.12);
  }
  bellRing() {
    // big brass bell: inharmonic partials with a long decay + a whoosh of the shrink wave
    const t = this.ctx.currentTime;
    for (const [mult, vol, dur] of [[1, 0.2, 2.2], [2.01, 0.1, 1.6], [2.76, 0.07, 1.2], [5.4, 0.04, 0.8], [0.5, 0.1, 2.4]]) this._osc('sine', 330 * mult, t, dur, vol);
    const n = this._noise(t + 0.05, 0.8, 0.15, 'bandpass', 3000, 1.5);
    n.f.frequency.exponentialRampToValueAtTime(300, t + 0.8);
  }
  chime() {
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((m, i) => this._osc('triangle', mtof(m + 12), t + i * 0.045, 0.18, 0.12));
    this._osc('sine', mtof(96), t + 0.18, 0.3, 0.05);
  }
  gotItem() {
    const t = this.ctx.currentTime;
    this._osc('square', mtof(84), t, 0.07, 0.07);
    this._osc('square', mtof(91), t + 0.07, 0.16, 0.07);
  }
  sparkTick(level) {
    const t = this.ctx.currentTime;
    const base = [0, 76, 81, 88][level] || 88;
    this._osc('sine', mtof(base + 12), t, 0.1, 0.1);
    this._osc('triangle', mtof(base + 19), t + 0.04, 0.12, 0.06);
  }
  whoosh(dur = 0.6, pitch = 1) {
    const t = this.ctx.currentTime;
    const n = this._noise(t, dur, 0.28, 'bandpass', 400 * pitch, 1.2);
    n.f.frequency.exponentialRampToValueAtTime(3200 * pitch, t + dur * 0.5);
    n.f.frequency.exponentialRampToValueAtTime(900, t + dur);
    const o = this._osc('sawtooth', 120 * pitch, t, dur, 0.06);
    o.o.frequency.exponentialRampToValueAtTime(420 * pitch, t + dur * 0.8);
  }
  hitSound(kind, vol = 1) {
    const t = this.ctx.currentTime;
    if (kind === 'shrink') {
      const o = this._osc('square', 900, t, 0.5, 0.1 * vol);
      o.o.frequency.exponentialRampToValueAtTime(200, t + 0.5);
      return;
    }
    const o = this._osc('square', 700, t, 0.6, 0.12 * vol);
    o.o.frequency.exponentialRampToValueAtTime(120, t + 0.6);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 22;
    const lg = this.ctx.createGain(); lg.gain.value = 60;
    lfo.connect(lg); lg.connect(o.o.frequency); lfo.start(t); lfo.stop(t + 0.7);
    this._noise(t, 0.15, 0.25 * vol, 'lowpass', 1800);
  }
  thud(intensity = 0.5, freq = 120) {
    const t = this.ctx.currentTime;
    const o = this._osc('sine', freq, t, 0.18, 0.35 * intensity);
    o.o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    this._noise(t, 0.08, 0.18 * intensity, 'lowpass', 600);
  }
  boing() {
    const t = this.ctx.currentTime;
    const o = this._osc('triangle', 220, t, 0.25, 0.1);
    o.o.frequency.exponentialRampToValueAtTime(660, t + 0.2);
  }
  throwSound(item) {
    const t = this.ctx.currentTime;
    if (item === 'fizz' || item === 'fizz3') return; // kart:boost {source:'item'} plays the whoosh
    if (item === 'prism') {
      [72, 76, 79, 84, 88, 91].forEach((m, i) => this._osc('square', mtof(m), t + i * 0.05, 0.1, 0.06));
      return;
    }
    if (item === 'bell') return; // item:bell plays the bell ring
    const n = this._noise(t, 0.25, 0.22, 'bandpass', 2400, 2);
    n.f.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    const o = this._osc('square', 500, t, 0.15, 0.05);
    o.o.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
  }
  explosion(vol = 1) {
    const t = this.ctx.currentTime;
    const n = this._noise(t, 1.1, 0.6 * vol, 'lowpass', 2400, 0.7);
    n.f.frequency.exponentialRampToValueAtTime(120, t + 1.0);
    const o = this._osc('sine', 110, t, 0.9, 0.7 * vol);
    o.o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
  }
  pop(vol = 1) {
    const t = this.ctx.currentTime;
    this._noise(t, 0.18, 0.4 * vol, 'bandpass', 1400, 0.8);
    const o = this._osc('square', 320, t, 0.12, 0.12 * vol);
    o.o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
  }
  zap() {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) this._noise(t + i * 0.05 + Math.random() * 0.03, 0.08, 0.3, 'highpass', 2500 + Math.random() * 3000, 1);
    const o = this._osc('sawtooth', 1800, t, 0.8, 0.12);
    o.o.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    const o2 = this._osc('sine', 60, t + 0.05, 0.9, 0.4);
    o2.o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
  }
  lapChime() {
    const t = this.ctx.currentTime;
    [79, 84, 88].forEach((m, i) => this._osc('square', mtof(m), t + i * 0.09, 0.14, 0.08));
    this._osc('triangle', mtof(91), t + 0.27, 0.4, 0.1);
  }
  finalLapJingle() {
    const t = this.ctx.currentTime;
    const seq = [[72, 0], [72, 0.12], [72, 0.24], [76, 0.36], [79, 0.6], [84, 0.84]];
    for (const [m, dt] of seq) { this._osc('square', mtof(m), t + dt, 0.14, 0.09); this._osc('triangle', mtof(m - 12), t + dt, 0.14, 0.08); }
    this._osc('square', mtof(88), t + 1.08, 0.6, 0.09);
    this._osc('triangle', mtof(76), t + 1.08, 0.6, 0.08);
  }
  fanfare(place = 1) {
    const t = this.ctx.currentTime + 0.05;
    const good = place <= 3;
    const seq = good
      ? [[72, 0, 0.12], [76, 0.14, 0.12], [79, 0.28, 0.12], [84, 0.42, 0.36], [79, 0.8, 0.12], [84, 0.94, 0.9]]
      : [[72, 0, 0.2], [71, 0.24, 0.2], [69, 0.48, 0.2], [67, 0.72, 0.8]];
    for (const [m, dt, d] of seq) {
      this._osc('square', mtof(m), t + dt, d, 0.09);
      this._osc('triangle', mtof(m - 12), t + dt, d, 0.1);
      if (good) this._osc('sawtooth', mtof(m + 7), t + dt, d, 0.025);
    }
    if (good) this._noise(t + 0.94, 1.2, 0.08, 'highpass', 6000);
  }

  // ------------------------------------------------------------------ music sequencer
  _schedule() {
    if (!this.ctx || !this.songName || this.ctx.state !== 'running') return;
    const song = SONGS[this.songName];
    if (!song) return;
    const now = this.ctx.currentTime;
    if (this._nextTime < now - 0.2) this._nextTime = now + 0.02; // tab was asleep
    const stepDur = 60 / (song.bpm * this.tempoScale) / 4;
    while (this._nextTime < now + 0.13) {
      try { this._playStep(song, this._step, this._nextTime, stepDur); } catch (e) { /* never break the scheduler */ }
      this._nextTime += stepDur;
      this._step = (this._step + 1) % (song.bars.length * 16);
    }
  }

  _mOsc(type, midi, t, dur, vol, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(mtof(midi), t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
      o.connect(f); last = f;
    }
    last.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  _kick(t, vol = 0.6) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.3);
  }
  _snare(t, vol = 0.3) {
    this._noise(t, 0.16, vol, 'highpass', 1500, 0.7, this.musicGain);
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol * 0.8, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.12);
  }
  _hat(t, vol = 0.08, open = false) { this._noise(t, open ? 0.12 : 0.035, vol, 'highpass', 7500, 0.8, this.musicGain); }

  _lead(kind, m, t, dur) {
    switch (kind) {
      case 'marimba': this._mOsc('triangle', m, t, Math.min(dur, 0.22), 0.09); this._mOsc('sine', m + 12, t, 0.08, 0.03); break;
      case 'twang': { const o = this._mOsc('sawtooth', m, t, dur * 0.95, 0.05, 2600); this._vibrato(o, t, dur, 7, 9); this._mOsc('square', m - 12, t, dur * 0.6, 0.02, 1200); break; }
      case 'bell': this._mOsc('sine', m, t, Math.max(0.35, dur), 0.08); this._mOsc('sine', m + 19, t, 0.25, 0.025); this._mOsc('triangle', m + 12, t, 0.15, 0.02); break;
      case 'saw': { const o = this._mOsc('sawtooth', m, t, dur * 0.95, 0.04, 1800); this._vibrato(o, t, dur, 5, 6); this._mOsc('triangle', m - 12, t, dur, 0.03); break; }
      case 'brass': this._mOsc('sawtooth', m, t, dur * 0.9, 0.05, 1600); this._mOsc('square', m - 12, t, dur * 0.9, 0.025, 900); break;
      case 'soft': this._mOsc('sine', m, t, dur, 0.07); this._mOsc('triangle', m + 12, t, Math.min(dur, 0.3), 0.012); break;
      default: { const o = this._mOsc('square', m, t, dur * 0.95, 0.05, 4200); if (dur > 0.25) this._vibrato(o, t, dur, 6, 6); }
    }
  }
  _vibrato(o, t, dur, rate, depth) {
    if (!o || dur < 0.25) return;
    const l = this.ctx.createOscillator(); l.frequency.value = rate;
    const lg = this.ctx.createGain(); lg.gain.value = depth;
    l.connect(lg); lg.connect(o.detune); l.start(t + 0.1); l.stop(t + dur);
  }

  _playStep(song, step, t, sd) {
    const barIdx = Math.floor(step / 16) % song.bars.length;
    const s = step % 16;
    const bar = song.bars[barIdx];
    const ch = bar.chord;
    // ---- drums
    switch (song.drums) {
      case 'ska':
        if (s === 0 || s === 8 || (bar.fill && s === 14)) this._kick(t, 0.5);
        if (s === 4 || s === 12) this._snare(t, 0.22);
        if (s % 2 === 0) this._hat(t, s % 4 === 2 ? 0.06 : 0.03, s % 4 === 2);
        if (bar.fill && s >= 12) this._snare(t, 0.1 + (s - 12) * 0.04);
        break;
      case 'gallop':
        if (s === 0 || s === 8) this._kick(t, 0.55);
        if (s === 4 || s === 12) this._snare(t, 0.24);
        if (s % 4 !== 1) this._hat(t, s % 4 === 0 ? 0.05 : 0.03);
        if (bar.fill && s >= 12) this._snare(t, 0.12 + (s - 12) * 0.05);
        break;
      case 'electro':
        if (s % 4 === 0) this._kick(t, 0.5);
        if (s === 4 || s === 12) this._snare(t, 0.2);
        this._hat(t, s % 2 ? 0.025 : 0.012);
        if (s % 4 === 2) this._noise(t, 0.05, 0.03, 'highpass', 9000, 1, this.musicGain); // sleigh shimmer
        if (bar.fill && s >= 12 && s % 2 === 0) this._snare(t, 0.12);
        break;
      case 'march':
        if (s % 8 === 0) this._kick(t, 0.55);
        if (s % 4 === 2 || (s >= 12 && s % 2 === 0 && bar.fill)) this._snare(t, 0.16);
        if (s % 2 === 0) this._hat(t, 0.02);
        break;
      default: // chill
        if (s === 0 || s === 10) this._kick(t, 0.32);
        if (s === 8) this._snare(t, 0.1);
        if (s % 2 === 0) this._hat(t, s % 4 === 2 ? 0.03 : 0.015);
    }
    // ---- bass (8ths)
    if (s % 2 === 0 && song.bass) {
      const off = song.bass[s / 2];
      if (off != null) this._mOsc(song.drums === 'chill' ? 'sine' : 'sawtooth', bar.root + off, t, sd * 1.7, song.drums === 'chill' ? 0.16 : 0.12, 800);
    }
    // ---- accompaniment
    switch (song.comp) {
      case 'skank': if (s % 4 === 2) for (const m of ch) this._mOsc('square', m + 12, t, sd * 0.7, 0.018, 2500); break;
      case 'strum': if (s === 0 || s === 6 || s === 8 || s === 14) ch.forEach((m, i) => this._mOsc('triangle', m, t + i * 0.012, sd * 1.5, 0.03)); break;
      case 'arp': this._mOsc('sine', [ch[0], ch[1], ch[2], ch[0] + 12][s % 4] + 12, t, sd * 0.9, 0.03); break;
      default: // pad
        if (s === 0) for (const m of ch) this._mOsc('triangle', m, t, sd * 15, 0.024, 1400);
        if (s % 2 === 0) { const order = [0, 1, 2, ch.length - 1, 2, 1, 2, ch.length - 1]; this._mOsc('sine', ch[order[s / 2] % ch.length] + 12, t, sd * 1.8, 0.028); }
    }
    // ---- lead
    for (const [st, m, len] of bar.mel) if (st === s) this._lead(song.lead, m, t, sd * len);
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs = [];
    clearInterval(this._sched);
    window.removeEventListener('pointerdown', this._onGesture);
    window.removeEventListener('keydown', this._onGesture);
    window.removeEventListener('touchstart', this._onGesture);
    try { this.ctx && this.ctx.close(); } catch (e) { /* ignore */ }
  }
}
