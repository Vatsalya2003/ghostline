// The AI's voice, baked ahead of time.
//
// WHY NOT speechSynthesis ALONE: the browser's voice list is not an asset you
// can rely on. It differs per browser and per OS, Firefox on Linux often has
// nothing usable, and the API will not tell you how long a line will take —
// which means the caption typewriter can never be paced to it. A bundled clip
// is the same on every machine, needs no network, and reports its own
// duration, so the caption and the voice land together.
//
// Web Speech is still wired up underneath: if a line has no clip, or the
// manifest is missing, or the browser cannot decode Opus, the line is spoken
// the old way. Captions never depend on either — see CommsPanel.
//
// Clips are built by scripts/build-voice.mjs. Credits in public/voice/SOURCES.md.

import { audio } from './Audio.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'voice/';

class VoiceBank {
  constructor() {
    this.manifest = null;
    this.fetches = new Map();   // file -> Promise<ArrayBuffer|null>
    this.buffers = new Map();   // file -> AudioBuffer|null
    this.active = null;
    this.ready = this.loadManifest();
  }

  async loadManifest() {
    try {
      const res = await fetch(`${BASE}manifest.json`);
      if (!res.ok) return false;
      this.manifest = await res.json();
    } catch {
      return false;                       // no bundle — speechSynthesis covers it
    }
    // Pull the bytes down in the background. Decoding waits for a context.
    for (const line of Object.values(this.manifest.lines || {})) this.fetchClip(line.file);
    return true;
  }

  fetchClip(file) {
    if (this.fetches.has(file)) return this.fetches.get(file);
    const p = (async () => {
      try {
        const res = await fetch(BASE + file);
        return res.ok ? await res.arrayBuffer() : null;
      } catch { return null; }
    })();
    this.fetches.set(file, p);
    return p;
  }

  entry(text) { return this.manifest?.lines?.[text] || null; }

  // How long the clip for this line runs, without playing it. Lets the caption
  // be paced before the first character lands.
  durationOf(text) { return this.entry(text)?.dur ?? null; }

  async buffer(file) {
    if (this.buffers.has(file)) return this.buffers.get(file);
    const bytes = await this.fetchClip(file);
    if (!bytes || !audio.ctx) return null;
    let decoded = null;
    try {
      decoded = await audio.ctx.decodeAudioData(bytes.slice(0));
    } catch {
      decoded = null;                     // browser cannot do Opus — fall back
    }
    this.buffers.set(file, decoded);
    return decoded;
  }

  stop() {
    if (!this.active) return;
    try { this.active.stop(); } catch { /* already ended */ }
    this.active = null;
  }

  // Plays the bundled clip and resolves to its duration in seconds, or to null
  // if there is no usable clip — the caller then falls back to Web Speech.
  async play(text) {
    await this.ready;
    const entry = this.entry(text);
    if (!entry || !audio.ctx || !audio.enabled) return null;
    const buf = await this.buffer(entry.file);
    if (!buf) return null;

    this.stop();
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(audio.voiceBus || audio.master);
    src.onended = () => { if (this.active === src) this.active = null; };
    src.start();
    this.active = src;
    return buf.duration;
  }
}

export const voiceBank = new VoiceBank();

// Same reasoning as Events.js: reachable from the console and from the
// headless audio check without a main.js edit.
if (typeof window !== 'undefined') {
  window.GHOSTLINE = Object.assign(window.GHOSTLINE || {}, { voiceBank });
}
