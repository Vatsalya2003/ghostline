// SFX synthesised in the browser with Web Audio. No sample files, so the
// build stays offline with nothing to download and nothing to license.
// Howler is installed and ready if the team later drops Kenney .mp3s into
// /public/audio — swap the bodies of these methods for Howl instances.

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ambient = null;
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
    this.startAmbient();
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

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
    if (!this.ctx || this.ambient) return;
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
  }

  radioOpen()  { this.noise({ dur: 0.16, gain: 0.10, band: 2200, q: 1.2, sweepTo: 900 }); }
  radioClose() { this.noise({ dur: 0.12, gain: 0.07, band: 900, q: 1.2, sweepTo: 2400 }); }
  beep()       { this.tone(880, { dur: 0.06, gain: 0.10 }); }
  select()     { this.tone(660, { dur: 0.09, gain: 0.12, slideTo: 990 }); }
  alert()      { this.tone(420, { dur: 0.20, gain: 0.14, type: 'sawtooth' }); setTimeout(() => this.tone(420, { dur: 0.20, gain: 0.12, type: 'sawtooth' }), 240); }
  impact()     { this.noise({ dur: 0.45, gain: 0.30, band: 220, q: 0.5 }); this.tone(70, { dur: 0.35, gain: 0.25, type: 'sine', slideTo: 38 }); }
  breach()     { this.noise({ dur: 0.8, gain: 0.38, band: 160, q: 0.4 }); this.tone(55, { dur: 0.7, gain: 0.3, type: 'sine', slideTo: 30 }); }
  scan()       { this.tone(1200, { dur: 0.5, gain: 0.10, type: 'sine', slideTo: 2600 }); this.noise({ dur: 0.5, gain: 0.05, band: 3000, q: 2 }); }
  glitch()     { this.noise({ dur: 0.6, gain: 0.22, band: 3200, q: 0.7, sweepTo: 400 }); this.tone(220, { dur: 0.5, gain: 0.12, type: 'sawtooth', slideTo: 90 }); }
  relay()      { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, { dur: 0.18, gain: 0.12, type: 'triangle' }), i * 110)); }
  alarm()      { [0, 1, 2].forEach((i) => setTimeout(() => this.tone(700, { dur: 0.28, gain: 0.14, type: 'square', slideTo: 350 }), i * 300)); }
  typeTick()   { this.tone(1500 + ((this.ctx ? this.ctx.currentTime * 97 : 0) % 60), { dur: 0.012, gain: 0.02, type: 'square' }); }
}

export const audio = new AudioBus();
