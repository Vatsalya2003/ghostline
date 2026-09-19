// Pre-renders every AI line in the mission to a bundled, radio-processed
// voice clip. Output lands in /public/voice as Ogg Opus plus a manifest the
// runtime looks lines up in by their exact text.
//
// WHY BAKE IT: browser speechSynthesis is not a dependable asset. The voice
// list differs per browser and OS, Firefox on Linux frequently has none, and
// the timing is unknowable — which means the caption typewriter can never be
// paced to it. A bundled clip is identical on every machine, works offline,
// and reports its own duration, so the caption lands with the voice.
// Web Speech stays wired as the fallback (see src/systems/Voice.js).
//
// REQUIREMENTS (build time only — nothing here ships to the browser):
//   piper   https://github.com/OHF-Voice/piper1-gpl   pip install piper-tts
//   ffmpeg  with libopus
//
// USAGE:
//   PIPER_PYTHON=/path/to/venv/bin/python PIPER_VOICES=/path/to/voices \
//     node scripts/build-voice.mjs
//
// Synthesis goes through scripts/piper_batch.py rather than the piper CLI, so
// each model is loaded once instead of once per line.
//
// Voice models must be PUBLIC DOMAIN or CC0 — see public/voice/SOURCES.md.
// Several popular Piper voices (ryan, amy, hfc_*) are CC BY-NC and are
// deliberately NOT used: this is a judged competition and the sound brief
// rules out non-commercial assets.

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mission1 } from '../src/data/mission1.js';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'voice');
const TMP = path.join(OUT, '.tmp');

const PYTHON = process.env.PIPER_PYTHON || 'python3';
const VOICE_DIR = process.env.PIPER_VOICES || path.join(ROOT, '.voices');
const DRIVER = path.join(ROOT, 'scripts', 'piper_batch.py');

// Two voices, so the unit a reading came from is audible and not just a label.
// Turn 3 turns on a confident call from BETA-1 relayed through ALPHA; hearing
// a different speaker is the point.
const VOICES = {
  ALPHA:    { model: 'en_US-ljspeech-high', length: 0.97 },
  'BETA-1': { model: 'en_US-joe-medium',    length: 0.97 },
};
const DEFAULT_VOICE = 'ALPHA';

// Radio band, hard AGC, a little saturation. `relay` is a second hop: narrower
// and dirtier. The UI already prints RELAYED VIA, so this is describing
// something the player is told, not leaking a hidden tell.
//
// Deliberately NOT modelled: sensor damage. A unit with a broken sensor must
// still sound clean and certain — the whole mission rests on the player not
// getting a free audio cue that the data is bad.
const PROFILES = {
  direct: 'highpass=f=320,highpass=f=320,lowpass=f=3300,lowpass=f=3300,'
        + 'acompressor=threshold=-20dB:ratio=8:attack=3:release=90:makeup=5,'
        + 'asoftclip=type=atan:threshold=0.85',
  relay:  'highpass=f=430,highpass=f=430,lowpass=f=2700,lowpass=f=2700,'
        + 'acompressor=threshold=-22dB:ratio=10:attack=2:release=70:makeup=6,'
        + 'asoftclip=type=atan:threshold=0.72',
};
// alimiter normalises back to 0 dB unless level is disabled, which would
// undo the headroom it is there to protect. loudnorm then sets the true peak.
const TAIL = 'aresample=16000,alimiter=level=disabled:limit=0.92,'
           + 'loudnorm=I=-18:TP=-1.5:LRA=7';

// An em dash in a line is a gap in time, not punctuation — "Entering — CONTACT."
// is two transmissions. Synthesise the halves apart and leave carrier silence
// between them.
const GAP = 0.55;

function collectLines() {
  const out = new Map();   // text -> { unit, via }
  const add = (text, unit, via) => {
    if (!text || out.has(text)) return;
    out.set(text, { unit, via: via || null });
  };
  for (const t of mission1.turns) {
    add(t.ai.line, t.ai.unit, t.ai.via);
    for (const o of Object.values(t.outcomes || {})) {
      // A probe answers in the AI's own voice; an outcome is ALPHA reporting back.
      const unit = o.consumesTurn === false ? t.ai.unit : 'ALPHA';
      const via = o.consumesTurn === false ? t.ai.via : null;
      add(o.response, unit, via);
      for (const key of ['altIfHealthAbove', 'altIfHealthBelow']) {
        if (o[key]?.response) add(o[key].response, 'ALPHA', null);
      }
    }
  }
  return out;
}

const idFor = (text) => createHash('sha1').update(text).digest('hex').slice(0, 12);

async function duration(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  return Math.round(parseFloat(stdout.trim()) * 1000) / 1000;
}

function synthAll(jobs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [DRIVER], { stdio: ['pipe', 'inherit', 'inherit'] });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0
      ? resolve()
      : reject(new Error(`piper_batch.py exited ${code}`))));
    proc.stdin.end(JSON.stringify(jobs));
  });
}

// Halves of an em-dash line are separate transmissions with a real gap.
const segmentsOf = (text) => text.split('—').map((s) => s.trim()).filter(Boolean);

async function buildLine(text, meta, i, total) {
  const id = idFor(text);
  const profile = meta.via ? 'relay' : 'direct';
  const wavs = segmentsOf(text).map((_, p) => path.join(TMP, `${id}-${p}.wav`));

  const raw = path.join(TMP, `${id}-raw.wav`);
  if (wavs.length === 1) {
    await run('ffmpeg', ['-v', 'error', '-y', '-i', wavs[0], '-c', 'copy', raw]);
  } else {
    const args = ['-v', 'error', '-y'];
    for (const w of wavs) args.push('-i', w);
    // concat, with a silence source spliced between each pair of halves
    const inputs = [];
    let filter = '';
    for (let n = 0; n < wavs.length; n++) {
      inputs.push(`[${n}:a]`);
      if (n < wavs.length - 1) {
        filter += `aevalsrc=0:d=${GAP}:s=22050:c=mono[s${n}];`;
        inputs.push(`[s${n}]`);
      }
    }
    filter += `${inputs.join('')}concat=n=${inputs.length}:v=0:a=1[out]`;
    args.push('-filter_complex', filter, '-map', '[out]', raw);
    await run('ffmpeg', args);
  }

  const outFile = path.join(OUT, `${id}.ogg`);
  await run('ffmpeg', [
    '-v', 'error', '-y', '-i', raw,
    '-af', `${PROFILES[profile]},${TAIL}`,
    '-c:a', 'libopus', '-b:a', '20k', '-ac', '1', '-application', 'voip',
    outFile,
  ]);

  const dur = await duration(outFile);
  process.stdout.write(
    `[${String(i + 1).padStart(2)}/${total}] ${id} ${meta.unit.padEnd(7)}`
    + `${profile.padEnd(7)}${String(dur).padStart(6)}s  ${text.slice(0, 48)}\n`);
  return { id, dur, unit: meta.unit, via: meta.via, profile };
}

async function main() {
  const lines = collectLines();
  await mkdir(TMP, { recursive: true });

  // Drop clips whose text no longer exists, so edits to mission1.js do not
  // leave orphans in the bundle.
  const keep = new Set([...lines.keys()].map(idFor));
  for (const f of await readdir(OUT).catch(() => [])) {
    if (f.endsWith('.ogg') && !keep.has(f.replace('.ogg', ''))) {
      await rm(path.join(OUT, f));
      console.log(`removed orphan ${f}`);
    }
  }

  const manifest = { version: 1, voices: {}, lines: {} };
  for (const [unit, v] of Object.entries(VOICES)) manifest.voices[unit] = v.model;

  const entries = [...lines.entries()];

  // One synthesis pass for everything, grouped by model so each one loads once.
  const jobs = [];
  for (const [text, meta] of entries) {
    const id = idFor(text);
    const voice = VOICES[meta.unit] || VOICES[DEFAULT_VOICE];
    segmentsOf(text).forEach((part, p) => jobs.push({
      text: part,
      model: path.join(VOICE_DIR, `${voice.model}.onnx`),
      length: voice.length,
      out: path.join(TMP, `${id}-${p}.wav`),
    }));
  }
  jobs.sort((a, b) => a.model.localeCompare(b.model));
  console.log(`synthesising ${jobs.length} segments across ${entries.length} lines\n`);
  await synthAll(jobs);

  for (let i = 0; i < entries.length; i++) {
    const [text, meta] = entries[i];
    const r = await buildLine(text, meta, i, entries.length);
    manifest.lines[text] = { file: `${r.id}.ogg`, dur: r.dur, unit: r.unit, profile: r.profile };
  }

  await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  await rm(TMP, { recursive: true, force: true });

  const files = (await readdir(OUT)).filter((f) => f.endsWith('.ogg'));
  let bytes = 0;
  for (const f of files) bytes += (await import('node:fs')).statSync(path.join(OUT, f)).size;
  const secs = Object.values(manifest.lines).reduce((a, l) => a + l.dur, 0);
  console.log(`\n${files.length} clips · ${secs.toFixed(1)}s speech · ${(bytes / 1024).toFixed(0)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
