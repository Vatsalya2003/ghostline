// SFX play from CC0 samples in /public/audio, bundled locally so the build
// stays offline. Every sound falls back to the original Web Audio synth if its
// file is missing or fails to decode — delete /public/audio and the game still
// makes noise, just a thinner version of it.
//
// Sample credits and the source-to-slot mapping live in public/audio/SOURCES.md.
//
// Routing:
//   master ── sfx        one-shots, positioned or not
//          ── ambient    the looping beds, duckable as one group
//          ── voice      AI transmissions (src/systems/Voice.js plays into it)
//
// One-shots can be placed in the world: pass an x/z and the sound is panned
// and attenuated to where the thing that made it actually is. Calls with no
// position behave exactly as they always did, so nothing had to be rewired.

import { onPauseChange } from './Pause.js';

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
  // Feedback the original pack did not cover — see scripts/build-sfx.mjs.
  deny:       ['ui-deny.mp3', 1.0],
  detect:     ['detect.mp3', 1.0],
  objective:  ['objective.mp3', 1.0],
  servo:      ['servo.mp3', 1.0],
  droneLaunch:['drone-launch.mp3', 1.0],
  // Sparse world detail. Played by Soundscape, never by a game event.
  clank:      ['distant-clank.mp3', 1.0],
  thump:      ['distant-thump.mp3', 1.0],
  relayTick:  ['relay-tick.mp3', 1.0],
  // Vorbis for the beds: mp3 carries encoder padding, which clicks at the seam.
  ambient:    ['ambient-loop.ogg', 1.0],
  field:      ['ambient-field.ogg', 1.0],
  interior:   ['ambient-interior.ogg', 1.0],
  tension:    ['ambient-tension.ogg', 1.0],
  carrier:    ['radio-carrier.ogg', 1.0],
  droneLoop:  ['drone-loop.ogg', 1.0],
};

// Beds are started once and held at zero gain, then faded. Starting a source
// on demand costs a click; a gain ramp does not.
const LAYERS = ['field', 'interior', 'tension', 'carrier', 'droneLoop'];

// The carrier is part of the transmission, not part of the world, so it rides
// the voice bus. On the ambient bus it would be ducked by the very line it is
// supposed to be carrying, which would leave the gaps between words silent —
// exactly the thing it exists to fill.
const VOICE_LAYERS = new Set(['carrier']);

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ambient = null;
    this.buffers = {};
    this.raw = null;      // fetched ArrayBuffers, awaiting a context to decode with
    this.typeCount = 0;
    this.layers = {};     // name -> { src, gain, target }
    this.muted = false;
    this.spatial = null;  // (x, z) -> { pan, gain }, installed by Soundscape
    this.prefetch();

    // A paused game is a silent one. Suspending the context stops the beds and
    // anything in flight without tearing down state.
    onPauseChange((paused) => {
      if (!this.ctx) return;
      if (paused) this.ctx.suspend?.();
      else if (this.enabled && !this.muted) this.ctx.resume?.();
    });
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
    this.startLayers();
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

    // Three groups so the beds can duck under a transmission without the
    // one-shots ducking with them.
    this.sfxBus = this.ctx.createGain();
    this.ambientBus = this.ctx.createGain();
    this.voiceBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambientBus.connect(this.master);
    this.voiceBus.connect(this.master);

    this.decodeAll();
    this.startAmbient();   // synth bed until the sample finishes decoding
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  setMuted(muted) {
    this.muted = !!muted;
    if (!this.master) return;
    this.master.gain.cancelScheduledValues(this.t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.t, 0.05);
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ------------------------------------------------------------- spatial
  // Soundscape installs the resolver, because working out where a world point
  // lands on screen needs the camera and this file does not know about three.
  setSpatialResolver(fn) { this.spatial = fn; }

  // Returns true if a sample covered it, so callers can skip the synth path.
  // `at` places the sound in the world: [x, z].
  play(key, gainScale = 1, delay = 0, at = null) {
    const buf = this.buffers[key];
    if (!buf || !this.ctx || !this.enabled) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    let gain = (SAMPLES[key]?.[1] ?? 1) * gainScale;

    let node = g;
    if (at && this.spatial) {
      const placed = this.spatial(at[0], at[1]);
      if (placed) {
        gain *= placed.gain;
        if (typeof this.ctx.createStereoPanner === 'function') {
          const panner = this.ctx.createStereoPanner();
          panner.pan.value = Math.max(-1, Math.min(1, placed.pan));
          g.connect(panner);
          node = panner;
        }
      }
    }
    g.gain.value = gain;
    src.connect(g);
    node.connect(this.sfxBus || this.master);
    src.start(this.t + delay);
    return true;
  }

  // ------------------------------------------------------------- the beds
  startLayers() {
    if (!this.ctx || !this.ambientBus) return;
    for (const name of LAYERS) {
      if (this.layers[name] || !this.buffers[name]) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(VOICE_LAYERS.has(name) ? this.voiceBus : this.ambientBus);
      src.start();
      this.layers[name] = { src, gain, target: 0 };
    }
  }

  // Fade a bed to a level. Cheap enough to call every turn.
  setLayer(name, target, seconds = 2.0) {
    const layer = this.layers[name];
    if (!layer) return;
    layer.target = target;
    layer.gain.gain.cancelScheduledValues(this.t);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, this.t);
    layer.gain.gain.linearRampToValueAtTime(target, this.t + seconds);
  }

  // Pull the beds down so a transmission sits on top of them, then let go.
  duck(amount = 0.45, seconds = 0.25) {
    if (!this.ambientBus) return;
    const g = this.ambientBus.gain;
    g.cancelScheduledValues(this.t);
    g.setValueAtTime(g.value, this.t);
    g.linearRampToValueAtTime(amount, this.t + seconds);
  }

  unduck(seconds = 0.7) {
    if (!this.ambientBus) return;
    const g = this.ambientBus.gain;
    g.cancelScheduledValues(this.t);
    g.setValueAtTime(g.value, this.t);
    g.linearRampToValueAtTime(1, this.t + seconds);
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
    osc.connect(g).connect(this.sfxBus || this.master);
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
    src.connect(filter).connect(g).connect(this.sfxBus || this.master);
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
      src.connect(g).connect(this.ambientBus || this.master);
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
    src.connect(filter).connect(g).connect(this.ambientBus || this.master);
    src.start();
    this.ambient = src;
    this.ambientIsSynth = true;
  }

  // ------------------------------------------------------------- the API
  // Every method takes an optional world position. Omitting it is the old
  // behaviour: dead centre, full level.
  radioOpen()  { if (!this.play('radioOpen'))  this.noise({ dur: 0.16, gain: 0.10, band: 2200, q: 1.2, sweepTo: 900 }); }
  radioClose() { if (!this.play('radioClose')) this.noise({ dur: 0.12, gain: 0.07, band: 900, q: 1.2, sweepTo: 2400 }); }
  select()     { if (!this.play('select'))     this.tone(660, { dur: 0.09, gain: 0.12, slideTo: 990 }); }
  hover()      { if (!this.play('hover'))      this.tone(1200, { dur: 0.03, gain: 0.03 }); }
  confirm()    { if (!this.play('confirm'))    this.tone(660, { dur: 0.09, gain: 0.12, slideTo: 990 }); }
  // Refusing a press: a disabled command, or an order the turn does not allow.
  deny()       { if (!this.play('deny'))       this.tone(300, { dur: 0.12, gain: 0.10, type: 'square', slideTo: 180 }); }
  // A log line landing — the quietest tick we have.
  beep()       { if (!this.play('hover', 1.6)) this.tone(880, { dur: 0.06, gain: 0.10 }); }
  moveStep(x, z)  { if (!this.play('moveStep', 1, 0, pos(x, z))) this.tone(880, { dur: 0.06, gain: 0.10 }); }
  // The mechanical half of a step. Layered under moveStep by Soundscape so a
  // robot walking sounds like a machine and not a boot.
  servo(x, z)     { if (!this.play('servo', 1, 0, pos(x, z))) this.tone(260, { dur: 0.12, gain: 0.05, type: 'sawtooth', slideTo: 400 }); }
  alert()      { if (!this.play('alert'))    { this.tone(420, { dur: 0.20, gain: 0.14, type: 'sawtooth' }); setTimeout(() => this.tone(420, { dur: 0.20, gain: 0.12, type: 'sawtooth' }), 240); } }
  impact(x, z) { if (!this.play('impact', 1, 0, pos(x, z))) { this.noise({ dur: 0.45, gain: 0.30, band: 220, q: 0.5 }); this.tone(70, { dur: 0.35, gain: 0.25, type: 'sine', slideTo: 38 }); } }
  breach(x, z) { if (!this.play('breach', 1, 0, pos(x, z))) { this.noise({ dur: 0.8, gain: 0.38, band: 160, q: 0.4 }); this.tone(55, { dur: 0.7, gain: 0.3, type: 'sine', slideTo: 30 }); } }
  scan(x, z)   { if (!this.play('scan', 1, 0, pos(x, z)))   { this.tone(1200, { dur: 0.5, gain: 0.10, type: 'sine', slideTo: 2600 }); this.noise({ dur: 0.5, gain: 0.05, band: 3000, q: 2 }); } }
  glitch(x, z) { if (!this.play('glitch', 1, 0, pos(x, z))) { this.noise({ dur: 0.6, gain: 0.22, band: 3200, q: 0.7, sweepTo: 400 }); this.tone(220, { dur: 0.5, gain: 0.12, type: 'sawtooth', slideTo: 90 }); } }
  nightvision(){ if (!this.play('nightvision')) this.scan(); }
  // Something on the feed resolved into a contact.
  detect(x, z) { if (!this.play('detect', 1, 0, pos(x, z))) { this.tone(300, { dur: 0.12, gain: 0.12, type: 'square' }); setTimeout(() => this.tone(300, { dur: 0.12, gain: 0.12, type: 'square' }), 170); } }
  // An objective landing, short of the mission ending.
  objective()  { if (!this.play('objective')) this.tone(392, { dur: 0.5, gain: 0.12, type: 'triangle' }); }
  droneLaunch(x, z) { if (!this.play('droneLaunch', 1, 0, pos(x, z))) this.tone(90, { dur: 0.8, gain: 0.12, type: 'sawtooth', slideTo: 300 }); }
  // World detail. No synth fallback on purpose: if the files are missing the
  // right answer is silence, not an oscillator imitating a distant building.
  clank(x, z)  { this.play('clank', 1, 0, pos(x, z)); }
  thump(x, z)  { this.play('thump', 1, 0, pos(x, z)); }
  relayTick()  { this.play('relayTick'); }
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

// Both coordinates or neither — a half-given position would pan to the wrong
// place, which is worse than not panning at all.
function pos(x, z) {
  return (typeof x === 'number' && typeof z === 'number') ? [x, z] : null;
}

export const audio = new AudioBus();
