// SFX play from CC0 samples in /public/audio, bundled locally so the build
// stays offline. Every sound falls back to the original Web Audio synth if its
// file is missing or fails to decode — delete /public/audio and the game still
// makes noise, just a thinner version of it.
//
// Sample credits and the source-to-slot mapping live in public/audio/SOURCES.md.

const BASE = (import.meta.env?.BASE_URL || '/') + 'audio/';

// slot -> [filename, playback gain]. Files are already level-matched at build
// time; these gains are the last bit of in-context balance.
const SAMPLES = {
  radioOpen:  ['radio-open.mp3', 0.9],
  radioClose: ['radio-close.mp3', 0.9],
  select:     ['ui-select.mp3', 1.0],
  hover:      ['ui-hover.mp3', 1.0],
  alert:      ['alert.mp3', 1.0],
  glitch:     ['glitch.mp3', 1.0],
  impact:     ['impact.mp3', 1.0],
  scan:       ['drone-scan.mp3', 1.0],
  moveStep:   ['move-step.mp3', 1.0],
  confirm:    ['confirm.mp3', 1.0],
  breach:     ['explosion.mp3', 1.0],
  success:    ['mission-success.mp3', 1.0],
  fail:       ['mission-fail.mp3', 1.0],
  type:       ['typing.mp3', 1.0],
  nightvision:['nightvision.mp3', 1.0],
  // Vorbis for the bed: mp3 carries encoder padding, which clicks at the seam.
  ambient:    ['ambient-loop.ogg', 1.0],
};

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ambient = null;
    this.buffers = {};
    this.raw = null;      // fetched ArrayBuffers, awaiting a context to decode with
    this.typeCount = 0;
    this.prefetch();
  }

  // Fetching needs no user gesture, so get the bytes in flight immediately and
  // only decode once unlock() gives us a context.
  prefetch() {
    if (typeof fetch !== 'function') return;
    this.raw = Promise.all(
      Object.entries(SAMPLES).map(async ([key, [file]]) => {
        try {
          const res = await fetch(BASE + file);
          if (!res.ok) return [key, null];
          return [key, await res.arrayBuffer()];
        } catch { return [key, null]; }
      }),
    );
  }

  async decodeAll() {
    if (!this.raw || !this.ctx) return;
    const entries = await this.raw;
    await Promise.all(entries.map(async ([key, bytes]) => {
      if (!bytes) return;
      try {
        this.buffers[key] = await this.ctx.decodeAudioData(bytes.slice(0));
      } catch { /* leave the slot empty; the synth fallback covers it */ }
    }));
    this.startAmbient();
  }

  // Browsers require a user gesture before audio starts.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { this.enabled = false; return; }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.decodeAll();
    this.startAmbient();   // synth bed until the sample finishes decoding
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  // Returns true if a sample covered it, so callers can skip the synth path.
  play(key, gainScale = 1, delay = 0) {
    const buf = this.buffers[key];
    if (!buf || !this.ctx || !this.enabled) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = (SAMPLES[key]?.[1] ?? 1) * gainScale;
    src.connect(g).connect(this.master);
    src.start(this.t + delay);
    return true;
  }

  // ------------------------------------------------------- synth fallbacks
  noiseBuffer(seconds = 1) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Deterministic pseudo-noise — same texture every run.
    let seed = 1337;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x3fffffff) - 1;
    }
    return buf;
  }

  tone(freq, { dur = 0.12, type = 'square', gain = 0.16, slideTo = null } = {}) {
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, this.t + dur);
    g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(gain, this.t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(this.t + dur + 0.02);
  }

  noise({ dur = 0.25, gain = 0.12, band = 1400, q = 0.8, sweepTo = null } = {}) {
    if (!this.ctx || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(Math.max(dur, 0.2));
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(band, this.t);
    filter.Q.value = q;
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, this.t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    src.stop(this.t + dur + 0.02);
  }

  // Low room tone under everything — cheap, and the silence feels wrong without it.
  startAmbient() {
    if (!this.ctx || !this.enabled) return;
    const buf = this.buffers.ambient;
    // Once the sample lands, retire the synth bed and loop the real one.
    if (buf && this.ambientIsSynth !== false) {
      if (this.ambient) { try { this.ambient.stop(); } catch { /* already stopped */ } }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 1;
      src.connect(g).connect(this.master);
      src.start();
      this.ambient = src;
      this.ambientIsSynth = false;
      return;
    }
    if (this.ambient) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    this.ambient = src;
    this.ambientIsSynth = true;
  }

  // ------------------------------------------------------------- the API
  radioOpen()  { if (!this.play('radioOpen'))  this.noise({ dur: 0.16, gain: 0.10, band: 2200, q: 1.2, sweepTo: 900 }); }
  radioClose() { if (!this.play('radioClose')) this.noise({ dur: 0.12, gain: 0.07, band: 900, q: 1.2, sweepTo: 2400 }); }
  select()     { if (!this.play('select'))     this.tone(660, { dur: 0.09, gain: 0.12, slideTo: 990 }); }
  hover()      { if (!this.play('hover'))      this.tone(1200, { dur: 0.03, gain: 0.03 }); }
  confirm()    { if (!this.play('confirm'))    this.tone(660, { dur: 0.09, gain: 0.12, slideTo: 990 }); }
  // A log line landing — the quietest tick we have.
  beep()       { if (!this.play('hover', 1.6)) this.tone(880, { dur: 0.06, gain: 0.10 }); }
  moveStep()   { if (!this.play('moveStep'))   this.tone(880, { dur: 0.06, gain: 0.10 }); }
  alert()      { if (!this.play('alert'))    { this.tone(420, { dur: 0.20, gain: 0.14, type: 'sawtooth' }); setTimeout(() => this.tone(420, { dur: 0.20, gain: 0.12, type: 'sawtooth' }), 240); } }
  impact()     { if (!this.play('impact'))   { this.noise({ dur: 0.45, gain: 0.30, band: 220, q: 0.5 }); this.tone(70, { dur: 0.35, gain: 0.25, type: 'sine', slideTo: 38 }); } }
  breach()     { if (!this.play('breach'))   { this.noise({ dur: 0.8, gain: 0.38, band: 160, q: 0.4 }); this.tone(55, { dur: 0.7, gain: 0.3, type: 'sine', slideTo: 30 }); } }
  scan()       { if (!this.play('scan'))     { this.tone(1200, { dur: 0.5, gain: 0.10, type: 'sine', slideTo: 2600 }); this.noise({ dur: 0.5, gain: 0.05, band: 3000, q: 2 }); } }
  glitch()     { if (!this.play('glitch'))   { this.noise({ dur: 0.6, gain: 0.22, band: 3200, q: 0.7, sweepTo: 400 }); this.tone(220, { dur: 0.5, gain: 0.12, type: 'sawtooth', slideTo: 90 }); } }
  nightvision(){ if (!this.play('nightvision')) this.scan(); }
  // The relay coming up is the objective landing — it gets the objective tone.
  relay()      { if (!this.play('success'))  { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, { dur: 0.18, gain: 0.12, type: 'triangle' }), i * 110)); } }
  missionSuccess() { if (!this.play('success')) this.relay(); }
  missionFail()    { if (!this.play('fail'))    this.tone(220, { dur: 1.2, gain: 0.16, type: 'sine', slideTo: 60 }); }
  // Two hits, so a warning still reads as a warning rather than a single blip.
  alarm()      { if (!this.play('alert')) { [0, 1, 2].forEach((i) => setTimeout(() => this.tone(700, { dur: 0.28, gain: 0.14, type: 'square', slideTo: 350 }), i * 300)); return; } this.play('alert', 0.85, 0.32); }
  // Every other character — one per char turns into a buzz at 30ms/char.
  typeTick()   {
    if (++this.typeCount % 2) return;
    if (!this.play('type')) this.tone(1500 + ((this.ctx ? this.ctx.currentTime * 97 : 0) % 60), { dur: 0.012, gain: 0.02, type: 'square' });
  }
}

export const audio = new AudioBus();
