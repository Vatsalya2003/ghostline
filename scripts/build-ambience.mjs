// Generates the looping ambient beds. These are synthesised rather than
// sampled: a wind or room-tone recording that loops without a seam is hard to
// find under CC0, and something generated from periodic functions whose
// periods divide the loop length is seamless by construction. It is also
// original work, so there is no licence to track.
//
//   node scripts/build-ambience.mjs      (needs ffmpeg with libvorbis)
//
// Output: public/audio/ambient-field.ogg, ambient-interior.ogg,
//         ambient-tension.ogg, radio-carrier.ogg, drone-loop.ogg, and the
//         servo / drone-launch / distant-* one-shots.
//
// The existing CC0 `ambient-loop.ogg` is NOT touched — it stays the base
// console bed. These layer on top of it (see src/systems/Soundscape.js).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio');
const TMP = path.join(OUT, '.tmp-amb');
const SR = 22050;

// ------------------------------------------------------------------ helpers
// Seeded, so a rebuild produces byte-identical beds and a diff stays honest.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
}

// One-pole lowpass. Cheap, and the gentle slope is what a distant sound has.
function lowpass(buf, cutoff) {
  const a = Math.exp(-2 * Math.PI * cutoff / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) { y = (1 - a) * buf[i] + a * y; buf[i] = y; }
  return buf;
}

function highpass(buf, cutoff) {
  const a = Math.exp(-2 * Math.PI * cutoff / SR);
  let yPrev = 0, xPrev = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    yPrev = a * (yPrev + x - xPrev);
    xPrev = x;
    buf[i] = yPrev;
  }
  return buf;
}

// Wrap the tail back over the head so the loop point is inaudible. The extra
// `fade` seconds are generated, then folded in and discarded.
function seamless(buf, loopLen, fadeLen) {
  const out = new Float32Array(loopLen);
  out.set(buf.subarray(0, loopLen));
  for (let i = 0; i < fadeLen; i++) {
    const w = i / fadeLen;                       // equal-power crossfade
    const a = Math.cos(w * Math.PI / 2);
    const b = Math.sin(w * Math.PI / 2);
    out[i] = out[i] * b + buf[loopLen + i] * a;
  }
  return out;
}

function normalise(buf, targetRmsDb) {
  let sum = 0;
  for (const v of buf) sum += v * v;
  const rms = Math.sqrt(sum / buf.length) || 1e-9;
  let g = (10 ** (targetRmsDb / 20)) / rms;
  // Never let the gain push a peak into the ceiling.
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  if (peak * g > 0.89) g = 0.89 / peak;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

async function writeWav(file, buf) {
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf[i] * 32767))), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22); head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 2, 28);
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  await writeFile(file, Buffer.concat([head, data]));
}

// ------------------------------------------------------------------- layers

// Exterior: moving air. Gusts come from three LFOs whose periods divide the
// loop exactly, so the swell never lands on the seam.
function field(seconds = 24) {
  const fade = 2;
  const n = Math.floor(SR * (seconds + fade));
  const rand = rng(90210);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = rand();
  lowpass(buf, 620);
  highpass(buf, 70);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const gust = 0.55
      + 0.28 * Math.sin(2 * Math.PI * t / seconds)
      + 0.12 * Math.sin(2 * Math.PI * 3 * t / seconds + 1.1)
      + 0.05 * Math.sin(2 * Math.PI * 7 * t / seconds + 2.3);
    buf[i] *= gust;
  }
  return normalise(seamless(buf, SR * seconds, SR * fade), -39);
}

// Interior: mains hum and its harmonics, a little beating between them, a
// noise floor, and a faint whine off a transformer.
function interior(seconds = 24) {
  const fade = 2;
  const n = Math.floor(SR * (seconds + fade));
  const rand = rng(1337);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = rand() * 0.35;
  lowpass(buf, 380);

  const partials = [[50, 0.50], [100, 0.30], [150, 0.16], [200, 0.09], [250, 0.05]];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [f, amp] of partials) {
      // A whole number of cycles per loop keeps every partial phase-continuous.
      const cyc = Math.round(f * seconds) / seconds;
      v += amp * Math.sin(2 * Math.PI * cyc * t);
    }
    // Slow flutter, one full cycle per loop.
    v *= 0.9 + 0.1 * Math.sin(2 * Math.PI * t / seconds);
    const whineCyc = Math.round(1180 * seconds) / seconds;
    v += 0.035 * Math.sin(2 * Math.PI * whineCyc * t)
       * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t / seconds));
    buf[i] += v;
  }
  return normalise(seamless(buf, SR * seconds, SR * fade), -38);
}

// Unease. Held under the mix only while something is wrong, so it can sit a
// little louder than the other beds without ever being the thing you notice.
function tension(seconds = 16) {
  const fade = 2;
  const n = Math.floor(SR * (seconds + fade));
  const buf = new Float32Array(n);
  const tones = [[38, 0.55], [57, 0.35], [76, 0.12]];
  const rand = rng(4242);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [f, amp] of tones) {
      const cyc = Math.round(f * seconds) / seconds;
      v += amp * Math.sin(2 * Math.PI * cyc * t);
    }
    // Two beats per loop — a slow breath, not a pulse.
    v *= 0.72 + 0.28 * Math.sin(2 * Math.PI * 2 * t / seconds - Math.PI / 2);
    v += rand() * 0.02;
    buf[i] = v;
  }
  lowpass(buf, 220);
  return normalise(seamless(buf, SR * seconds, SR * fade), -34);
}

// The carrier you hear between words once a transmission is open. Short, and
// quiet enough that it reads as "the channel is live", not as noise.
function carrier(seconds = 4) {
  const fade = 0.5;
  const n = Math.floor(SR * (seconds + fade));
  const rand = rng(777);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = rand();
  highpass(buf, 400);
  lowpass(buf, 3000);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    buf[i] *= 0.8 + 0.2 * Math.sin(2 * Math.PI * 5 * t / seconds);
  }
  return normalise(seamless(buf, SR * seconds, SR * fade), -42);
}

// ---------------------------------------------------------------- one-shots

// A servo is a short pitch ramp with mechanical grain on it. Kenney has no
// servo, and a footstep alone does not read as a machine walking.
function servo() {
  const secs = 0.34;
  const n = Math.floor(SR * secs);
  const buf = new Float32Array(n);
  const rand = rng(5150);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / secs / SR;
    const f = 150 + 110 * Math.sin(Math.PI * t);      // up then back down
    phase += 2 * Math.PI * f / SR;
    // Square-ish, so it has the buzz of a stepper rather than a pure tone.
    const sq = Math.tanh(Math.sin(phase) * 2.6);
    const env = Math.min(1, t * 14) * Math.exp(-3.1 * t);
    buf[i] = (sq * 0.5 + rand() * 0.22) * env;
  }
  lowpass(buf, 2600);
  highpass(buf, 120);
  return normalise(buf, -27);
}

// Drone rotors: four close partials beating against each other.
function droneLoop(seconds = 2) {
  const fade = 0.4;
  const n = Math.floor(SR * (seconds + fade));
  const buf = new Float32Array(n);
  const rand = rng(8080);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [f, a] of [[142, 0.4], [147, 0.3], [284, 0.16], [431, 0.08]]) {
      const cyc = Math.round(f * seconds) / seconds;
      v += a * Math.sin(2 * Math.PI * cyc * t);
    }
    v += rand() * 0.18;
    buf[i] = v;
  }
  bandish(buf);
  return normalise(seamless(buf, SR * seconds, SR * fade), -30);
}

function bandish(buf) { highpass(buf, 110); lowpass(buf, 3800); return buf; }

function droneLaunch() {
  const secs = 1.0;
  const n = Math.floor(SR * secs);
  const buf = new Float32Array(n);
  const rand = rng(9001);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / secs / SR;
    const f = 90 + 220 * t * t;           // spin-up
    phase += 2 * Math.PI * f / SR;
    const env = Math.min(1, t * 6) * (1 - 0.25 * t);
    buf[i] = (Math.sin(phase) * 0.45 + Math.sin(phase * 2.03) * 0.2 + rand() * 0.3) * env;
  }
  bandish(buf);
  return normalise(buf, -26);
}

// Sparse, distant, and quiet. These are the difference between a room tone and
// a place: something out there settles every so often and the silence between
// orders stops sounding like the game has stopped.
function distantClank() {
  const secs = 1.4;
  const n = Math.floor(SR * secs);
  const buf = new Float32Array(n);
  const rand = rng(2468);
  // A few inharmonic partials struck together reads as metal, not as a note.
  const partials = [[176, 1.0], [263, 0.6], [389, 0.35], [612, 0.15]];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [f, a] of partials) v += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-2.6 * t);
    buf[i] = v * 0.5 + rand() * 0.25 * Math.exp(-26 * t);
  }
  // Distance is mostly a lowpass and a slow front edge.
  lowpass(buf, 900);
  lowpass(buf, 900);
  return normalise(buf, -33);
}

function distantThump() {
  const secs = 1.6;
  const n = Math.floor(SR * secs);
  const buf = new Float32Array(n);
  const rand = rng(1357);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 68 * Math.exp(-2.2 * t) + 31;
    phase += 2 * Math.PI * f / SR;
    buf[i] = (Math.sin(phase) * 0.8 + rand() * 0.3 * Math.exp(-14 * t)) * Math.exp(-3.4 * t);
  }
  lowpass(buf, 420);
  return normalise(buf, -32);
}

// The console in front of the player, not the field: a relay dropping out.
function relayTick() {
  const secs = 0.13;
  const n = Math.floor(SR * secs);
  const buf = new Float32Array(n);
  const rand = rng(97531);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    buf[i] = rand() * Math.exp(-90 * t) + 0.4 * Math.sin(2 * Math.PI * 760 * t) * Math.exp(-70 * t);
  }
  highpass(buf, 300);
  lowpass(buf, 4200);
  return normalise(buf, -34);
}

// ------------------------------------------------------------------- build
const JOBS = [
  ['ambient-field', field(), 'ogg'],
  ['ambient-interior', interior(), 'ogg'],
  ['ambient-tension', tension(), 'ogg'],
  ['radio-carrier', carrier(), 'ogg'],
  ['drone-loop', droneLoop(), 'ogg'],
  ['servo', servo(), 'mp3'],
  ['drone-launch', droneLaunch(), 'mp3'],
  ['distant-clank', distantClank(), 'mp3'],
  ['distant-thump', distantThump(), 'mp3'],
  ['relay-tick', relayTick(), 'mp3'],
];

async function main() {
  await mkdir(TMP, { recursive: true });
  for (const [name, buf, fmt] of JOBS) {
    const wav = path.join(TMP, `${name}.wav`);
    await writeWav(wav, buf);
    const out = path.join(OUT, `${name}.${fmt}`);
    const enc = fmt === 'ogg'
      ? ['-c:a', 'libvorbis', '-q:a', '2']
      : ['-c:a', 'libmp3lame', '-q:a', '6'];
    await run('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ac', '1', ...enc, out]);
    const { size } = (await import('node:fs')).statSync(out);
    const secs = buf.length / SR;
    console.log(`${name.padEnd(18)} ${secs.toFixed(1).padStart(5)}s  ${String(Math.round(size / 1024)).padStart(4)} KB`);
  }
  await rm(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
