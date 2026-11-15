/**
 * CRAFT WARP — Web Audio sound engine.
 * Plays project sounds (decoded from asset data URLs) plus the built-in
 * library, which is synthesised on the fly so the editor ships with zero
 * audio files.
 */
import { getAsset, assetKey } from './renderer.js';

const SAMPLE_RATE = 22050;

export class AudioEngine {
  constructor(project) {
    this.project = project;
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.active = new Set();
    this.muted = false;
  }

  setProject(project) { this.project = project; }

  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  async bufferFor(sound) {
    if (!sound) return null;
    const key = assetKey(sound);
    if (this.buffers.has(key)) return this.buffers.get(key);
    const asset = getAsset(this.project, key);
    if (!asset?.dataUrl) return null;
    const ctx = this.ensure();
    if (!ctx) return null;
    try {
      const res = await fetch(asset.dataUrl);
      const arrayBuffer = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(key, decoded);
      return decoded;
    } catch {
      this.buffers.set(key, null);
      return null;
    }
  }

  resolveSound(target, name) {
    const list = target?.sounds || this.project?.targets?.[0]?.sounds || [];
    return list.find((s) => s.name === name) || list[0] || null;
  }

  /** fire-and-forget playback (start sound) */
  play(target, name, volume = 100) {
    if (this.muted) return null;
    const ctx = this.ensure();
    if (!ctx) return null;
    const sound = this.resolveSound(target, name);
    if (!sound) return null;
    const promise = this.bufferFor(sound).then((buffer) => {
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, volume / 100));
      src.connect(gain).connect(this.master);
      src.start();
      this.active.add(src);
      src.onended = () => this.active.delete(src);
    });
    return promise;
  }

  /** blocking playback for "play sound until done" */
  playUntilDone(target, name, volume = 100) {
    return new Promise((resolve) => {
      if (this.muted) return resolve();
      const ctx = this.ensure();
      if (!ctx) return resolve();
      const sound = this.resolveSound(target, name);
      if (!sound) return resolve();
      this.bufferFor(sound).then((buffer) => {
        if (!buffer) return resolve();
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume / 100));
        src.connect(gain).connect(this.master);
        src.onended = () => { this.active.delete(src); resolve(); };
        this.active.add(src);
        src.start();
      }).catch(() => resolve());
    });
  }

  playAsset(asset, volume = 100) {
    const ctx = this.ensure();
    if (!ctx || !asset?.dataUrl) return Promise.resolve();
    return fetch(asset.dataUrl)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buffer) => new Promise((resolve) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume / 100));
        src.connect(gain).connect(this.master);
        src.onended = resolve;
        src.start();
      }))
      .catch(() => {});
  }

  stopAll() {
    for (const src of this.active) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this.active.clear();
  }
}

/* ------------------------------------------------------------------ synths */
function wavFromSamples(samples, sampleRate = SAMPLE_RATE) {
  const frames = samples.length;
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, frames * 2, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const render = (duration, fn) => {
  const frames = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    out[i] = fn(t) * Math.min(1, (frames - i) / 200);
  }
  return out;
};

const env = (t, attack, decay) => Math.min(1, t / Math.max(1e-4, attack)) * Math.exp(-t / Math.max(1e-4, decay));

const SYNTHS = {
  pop: () => render(0.16, (t) => Math.sin(2 * Math.PI * (880 - 2400 * t) * t) * env(t, 0.005, 0.06)),
  coin: () => render(0.42, (t) => {
    const f = t < 0.08 ? 988 : 1319;
    return (Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.35 + Math.sin(2 * Math.PI * f * 2 * t) * 0.2) * env(t, 0.004, 0.16);
  }),
  zap: () => render(0.3, (t) => {
    const f = 700 - 1800 * t;
    return (Math.sin(2 * Math.PI * f * t) * 0.6 + (Math.random() * 2 - 1) * 0.25) * env(t, 0.003, 0.09);
  }),
  laser: () => render(0.28, (t) => Math.sin(2 * Math.PI * (1400 - 4000 * t) * t) * env(t, 0.002, 0.07)),
  boing: () => render(0.5, (t) => Math.sin(2 * Math.PI * (220 + 120 * Math.sin(2 * Math.PI * 9 * t)) * t) * env(t, 0.01, 0.22)),
  drum: () => render(0.35, (t) => (Math.sin(2 * Math.PI * 90 * t) * 0.6 + (Math.random() * 2 - 1) * 0.4 * Math.exp(-t * 40)) * env(t, 0.001, 0.14)),
  meow: () => render(0.55, (t) => {
    const f = 480 + 300 * Math.sin(Math.PI * Math.min(1, t / 0.45)) + 18 * Math.sin(2 * Math.PI * 22 * t);
    return Math.sin(2 * Math.PI * f * t) * env(t, 0.02, 0.3);
  }),
  chirp: () => render(0.4, (t) => {
    const f = 1600 + 900 * Math.sin(2 * Math.PI * 6 * t) + 400 * t;
    return Math.sin(2 * Math.PI * f * t) * env(t, 0.02, 0.2);
  }),
  whoosh: () => render(0.6, (t) => {
    const noise = Math.random() * 2 - 1;
    return noise * Math.sin(Math.PI * Math.min(1, t / 0.6)) * 0.35;
  }),
  bell: () => render(1.1, (t) => {
    const f = 1320;
    return (Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 2.01 * t) * 0.2 + Math.sin(2 * Math.PI * f * 3.02 * t) * 0.1) * env(t, 0.002, 0.45);
  }),
  click: () => render(0.06, (t) => (Math.sin(2 * Math.PI * 1800 * t) * 0.4) * env(t, 0.001, 0.02)),
  tada: () => render(1.0, (t) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const idx = Math.min(notes.length - 1, Math.floor(t / 0.12));
    return Math.sin(2 * Math.PI * notes[idx] * t) * env(t - idx * 0.12, 0.005, 0.35) * 0.6;
  }),
  jump: () => render(0.24, (t) => Math.sin(2 * Math.PI * (300 + 2200 * t) * t) * env(t, 0.003, 0.08)),
  splash: () => render(0.55, (t) => (Math.random() * 2 - 1) * Math.exp(-t * 6) * Math.sin(2 * Math.PI * 300 * t) * 0.5),
};

export const SOUND_LIBRARY = [
  { name: 'Pop', synth: 'pop' },
  { name: 'Coin', synth: 'coin' },
  { name: 'Zap', synth: 'zap' },
  { name: 'Laser', synth: 'laser' },
  { name: 'Boing', synth: 'boing' },
  { name: 'Drum', synth: 'drum' },
  { name: 'Meow', synth: 'meow' },
  { name: 'Chirp', synth: 'chirp' },
  { name: 'Whoosh', synth: 'whoosh' },
  { name: 'Bell', synth: 'bell' },
  { name: 'Click', synth: 'click' },
  { name: 'Tada', synth: 'tada' },
  { name: 'Jump', synth: 'jump' },
  { name: 'Splash', synth: 'splash' },
];

/** Build a library sound as { dataUrl, sampleCount, rate, ext } for project.assets */
export function synthesizeSound(kind) {
  const fn = SYNTHS[kind] || SYNTHS.pop;
  const samples = fn();
  const wav = wavFromSamples(samples);
  return {
    dataUrl: `data:audio/wav;base64,${bytesToBase64(wav)}`,
    ext: 'wav',
    sampleCount: samples.length,
    rate: SAMPLE_RATE,
  };
}
