// Derives the three feedback sounds the original pack did not cover, from the
// same CC0 Kenney packs the rest of /public/audio came out of — so they sit in
// the same sonic family rather than sounding bolted on.
//
//   KENNEY_SRC=/path/to/packs node scripts/build-sfx.mjs
//
// KENNEY_SRC should contain the three pack checkouts (any nesting):
//   Interface Sounds · Sci-Fi Sounds · Impact Sounds — all CC0 1.0.
// See public/audio/SOURCES.md.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio');
const TMP = path.join(OUT, '.tmp-sfx');
const SRC = process.env.KENNEY_SRC || path.join(ROOT, '.kenney');

// Find a source file by name anywhere under SRC — the pack mirrors nest
// differently from each other and pinning exact paths is not worth it.
async function find(name) {
  const stack = [SRC];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === name || e.name.replace(/\.(ogg|wav)$/, '') === name) return p;
    }
  }
  throw new Error(`source sound not found under ${SRC}: ${name}`);
}

// Levels are matched by measured RMS against the ladder already in SOURCES.md,
// not by ear — the same method the original pack used.
const JOBS = [
  {
    // Refusing a press. Fires whenever a disabled command is chosen, which on a
    // pad is easy to do repeatedly, so it is short, dark and unexciting.
    out: 'ui-deny.mp3', src: 'error_004', rms: -24,
    filter: 'lowpass=f=2400,highpass=f=180,atrim=0:0.12,afade=t=out:st=0.09:d=0.03',
  },
  {
    // Something resolved on the feed. Two low blips — a contact report, not an
    // alarm; `alert` already owns alarm.
    out: 'detect.mp3', src: 'bong_001', rms: -19,
    filter: 'asetrate=44100*0.72,aresample=44100,lowpass=f=1800,'
          + 'adelay=0|0,apad=pad_dur=0.34,'
          + 'atrim=0:0.46',
    double: 0.17,
  },
  {
    // An objective landing. Warm, single, resolving — deliberately smaller than
    // mission-success so the end of the mission still outranks it.
    out: 'objective.mp3', src: 'bong_001', rms: -23,
    filter: 'asetrate=44100*0.88,aresample=44100,lowpass=f=3200,apad=pad_dur=0.5,atrim=0:0.62,'
          + 'afade=t=out:st=0.42:d=0.2',
  },
];

async function build(job) {
  const src = await find(job.src);
  const work = path.join(TMP, `${job.out}.wav`);

  if (job.double) {
    // Layer the clip over a delayed copy of itself for the second blip.
    const ms = Math.round(job.double * 1000);
    await run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-i', src,
      '-filter_complex',
      `[0:a]${job.filter}[a];[1:a]${job.filter},adelay=${ms}|${ms},volume=0.8[b];`
      + '[a][b]amix=inputs=2:normalize=0[out]',
      '-map', '[out]', '-ac', '1', work]);
  } else {
    await run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', job.filter, '-ac', '1', work]);
  }

  // Measure, then apply exactly the gain that lands on the target RMS, with a
  // limiter so MP3 encoder overshoot cannot push a peak over the ceiling.
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', work, '-af', 'volumedetect',
    '-f', 'null', '/dev/null']).catch((e) => e);
  const mean = parseFloat(/mean_volume:\s*(-?[\d.]+)/.exec(stderr)?.[1] ?? '-20');
  const gain = (job.rms - mean).toFixed(2);

  // Lossy encoding overshoots the PCM peak, so the number that matters is the
  // peak of the *encoded* file. Encode, measure, and pull the ceiling down
  // until it clears -0.5 dBFS — the bar the rest of the pack was held to.
  const out = path.join(OUT, job.out);
  let ceiling = 0.89;
  let peak = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    await run('ffmpeg', ['-v', 'error', '-y', '-i', work,
      '-af', `volume=${gain}dB,alimiter=level=disabled:limit=${ceiling.toFixed(3)}`,
      '-c:a', 'libmp3lame', '-q:a', '5', '-ac', '1', out]);
    const { stderr: enc } = await run('ffmpeg', ['-hide_banner', '-i', out, '-af', 'volumedetect',
      '-f', 'null', '/dev/null']).catch((e) => e);
    peak = parseFloat(/max_volume:\s*(-?[\d.]+)/.exec(enc)?.[1] ?? '0');
    if (peak <= -0.5) break;
    ceiling *= 10 ** ((-0.8 - peak) / 20);
  }

  const { size } = await stat(out);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', out]);
  console.log(`${job.out.padEnd(16)} from ${job.src.padEnd(12)} `
    + `${parseFloat(stdout).toFixed(2)}s  ${String(Math.round(size / 1024)).padStart(3)} KB  `
    + `rms ${job.rms} (${gain > 0 ? '+' : ''}${gain} dB)  peak ${peak.toFixed(1)} dBFS`);
}

async function main() {
  await mkdir(TMP, { recursive: true });
  for (const job of JOBS) await build(job);
  await rm(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
