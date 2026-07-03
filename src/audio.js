// Procedural sound engine - every sound is synthesized with WebAudio
// (filtered noise bursts + oscillator blips), no audio files, matching the
// game's no-assets approach. Positional sounds get distance gain + stereo pan.

import { B, isWater } from './blocks.js';

// block id -> sound material family
function materialOf(blockId) {
  switch (blockId) {
    case B.LOG: case B.PLANKS: case B.CRAFTING_TABLE: return 'wood';
    case B.GRASS: case B.DIRT: return 'grass';
    case B.SAND: case B.GRAVEL: return 'sand';
    case B.LEAVES: case B.WOOL: case B.TALL_GRASS:
    case B.FLOWER_YELLOW: case B.FLOWER_RED: return 'soft';
    case B.GLASS: return 'glass';
    default: return isWater(blockId) ? 'water' : 'stone';
  }
}

// noise tap parameters per family
const MATERIALS = {
  stone: { freq: 850, q: 1.0, dur: 0.075, gain: 0.35, filter: 'bandpass' },
  wood: { freq: 360, q: 1.4, dur: 0.09, gain: 0.42, filter: 'bandpass' },
  grass: { freq: 720, q: 0.6, dur: 0.08, gain: 0.3, filter: 'lowpass' },
  sand: { freq: 1500, q: 0.8, dur: 0.11, gain: 0.26, filter: 'bandpass' },
  soft: { freq: 500, q: 0.5, dur: 0.06, gain: 0.2, filter: 'lowpass' },
  glass: { freq: 2600, q: 2.0, dur: 0.07, gain: 0.3, filter: 'bandpass' },
  water: { freq: 1000, q: 0.5, dur: 0.15, gain: 0.25, filter: 'lowpass' },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuf = null;
    this.counts = {}; // event counters (used by tests / debugging)
    this.listener = { x: 0, z: 0, yaw: 0 };
  }

  // must be called from a user gesture
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);

      // shared 1s white noise buffer
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  count(name) {
    this.counts[name] = (this.counts[name] || 0) + 1;
  }

  updateListener(x, z, yaw) {
    this.listener = { x, z, yaw };
  }

  // distance gain + stereo pan for a world position; null if inaudible
  spatial(pos) {
    if (!pos) return { gain: 1, pan: 0 };
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 26) return null;
    const gain = Math.max(0.05, 1 - dist / 26);
    // angle of source relative to facing direction
    const facing = this.listener.yaw;
    const ang = Math.atan2(dx, -dz); // world angle (matches yaw convention)
    const rel = ang + facing;
    return { gain, pan: Math.max(-1, Math.min(1, Math.sin(rel) * 0.8)) };
  }

  out(gain, pan, t) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.master);
    return g;
  }

  // short filtered noise burst with exponential decay
  tap({ freq = 800, q = 1, dur = 0.08, gain = 0.3, filter = 'bandpass', pan = 0, when = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq * (0.85 + Math.random() * 0.3);
    f.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(env);
    env.connect(this.out(1, pan, t));
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // oscillator blip with pitch glide
  blip({ from = 400, to = 400, dur = 0.1, type = 'sine', gain = 0.3, pan = 0, when = 0, vibrato = 0, filterFreq = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    let lfo = null, lfoGain = null;
    if (vibrato > 0) {
      lfo = this.ctx.createOscillator();
      lfo.frequency.value = vibrato;
      lfoGain = this.ctx.createGain();
      lfoGain.gain.value = from * 0.06;
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur);
    }
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (filterFreq > 0) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      o.connect(f);
      node = f;
    }
    node.connect(env);
    env.connect(this.out(1, pan, t));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ---------- game events ----------

  dig(blockId) {
    const m = MATERIALS[materialOf(blockId)];
    this.tap({ ...m, gain: m.gain * 0.7 });
    this.count('dig');
  }

  breakBlock(blockId) {
    const m = MATERIALS[materialOf(blockId)];
    this.tap({ ...m, dur: m.dur * 1.6, gain: m.gain * 1.25 });
    this.tap({ ...m, freq: m.freq * 0.55, dur: m.dur * 1.4, gain: m.gain * 0.8, when: 0.02 });
    this.count('break');
  }

  place(blockId) {
    const m = MATERIALS[materialOf(blockId)];
    this.tap({ ...m, freq: m.freq * 1.15, dur: m.dur, gain: m.gain });
    this.count('place');
  }

  step(blockId) {
    const m = MATERIALS[materialOf(blockId)];
    this.tap({ ...m, dur: 0.05, gain: m.gain * 0.35 });
    this.count('step');
  }

  splash() {
    this.tap({ freq: 1200, q: 0.4, dur: 0.3, gain: 0.4, filter: 'lowpass' });
    this.tap({ freq: 500, q: 0.4, dur: 0.4, gain: 0.3, filter: 'lowpass', when: 0.05 });
    this.count('splash');
  }

  hurt() {
    this.blip({ from: 320, to: 160, dur: 0.13, type: 'sawtooth', gain: 0.4, filterFreq: 1200 });
    this.count('hurt');
  }

  death() {
    for (let i = 0; i < 3; i++) {
      this.blip({ from: 300 - i * 60, to: 120 - i * 25, dur: 0.2, type: 'sawtooth', gain: 0.35, when: i * 0.16, filterFreq: 900 });
    }
    this.count('death');
  }

  eat() {
    for (let i = 0; i < 3; i++) {
      this.tap({ freq: 700 + Math.random() * 300, q: 0.7, dur: 0.06, gain: 0.3, filter: 'lowpass', when: i * 0.11 });
    }
    this.count('eat');
  }

  pop() { // item pickup
    this.blip({ from: 340, to: 750, dur: 0.08, type: 'sine', gain: 0.35 });
    this.count('pop');
  }

  click() {
    this.blip({ from: 1300, to: 1300, dur: 0.03, type: 'square', gain: 0.12, filterFreq: 2500 });
    this.count('click');
  }

  craft() {
    this.tap({ ...MATERIALS.wood, gain: 0.3 });
    this.blip({ from: 500, to: 800, dur: 0.07, gain: 0.2, when: 0.04 });
    this.count('craft');
  }

  attackSwing() {
    this.tap({ freq: 700, q: 0.3, dur: 0.09, gain: 0.12, filter: 'highpass' });
    this.count('swing');
  }

  // mob voices, positional
  mob(type, event, pos) {
    const s = this.ready ? this.spatial(pos) : null;
    if (!s) return;
    const louder = event === 'hurt' ? 1.4 : event === 'death' ? 1.6 : 1;
    const g = s.gain * louder;
    if (type === 'zombie') {
      this.blip({ from: 95, to: 70, dur: 0.7, type: 'sawtooth', gain: 0.35 * g, vibrato: 4.5, filterFreq: 320, pan: s.pan });
    } else if (type === 'pig') {
      this.blip({ from: 260, to: 185, dur: 0.11, type: 'square', gain: 0.28 * g, filterFreq: 850, pan: s.pan });
      this.blip({ from: 195, to: 245, dur: 0.09, type: 'square', gain: 0.24 * g, filterFreq: 850, when: 0.13, pan: s.pan });
    } else if (type === 'sheep') {
      this.blip({ from: 330, to: 280, dur: 0.45, type: 'sawtooth', gain: 0.22 * g, vibrato: 9, filterFreq: 1200, pan: s.pan });
    }
    this.count('mob-' + type);
  }
}
