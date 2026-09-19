// Drives the real game in a real browser and checks that the sound actually
// happens — every file loads and decodes, every beat that should make a noise
// makes one, and the AI's lines play from the bundled clips rather than
// falling through to speechSynthesis.
//
//   node scripts/verify-audio.mjs [url]        default: build + serve dist/
//
// Chrome runs with --mute-audio, so this proves the graph ran, not that it
// sounded good. What it sounds like still needs ears — see SOURCES.md.

import { execFileSync } from 'node:child_process';
import { Browser } from './cdp.mjs';
import { serve } from './serve.mjs';

let URL_BASE = process.argv[2];
let statics = null;
if (!URL_BASE) {
  console.log('building…');
  execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
  statics = await serve(new URL('../dist', import.meta.url).pathname);
  URL_BASE = `http://127.0.0.1:${statics.port}`;
}

let checks = 0;
const failures = [];
const ok = (cond, msg) => { checks++; if (!cond) failures.push(msg); return !!cond; };

const ready = () => !window.OP.director.busy
  && [...document.querySelectorAll('#commands button')].some((b) => !b.disabled);

const browser = await Browser.launch({ port: 9337 });
const page = await browser.open(`${URL_BASE}/`);

try {
  await page.waitFor(() => !!window.OP?.audio, { what: 'app boot' });

  // Wrap every sound method on the live bus so the log records what the game
  // asked for, and whether a real sample or the synth fallback answered.
  await page.eval(() => {
    const a = window.OP.audio;
    window.__SFX = [];
    window.__LAYERS = [];
    window.__SLOTS = [];
    const proto = Object.getPrototypeOf(a);

    // play() is the only place that decides sample-or-synth, so instrument it
    // rather than guessing from the method name — several methods share a slot
    // (beep uses `hover`, missionSuccess uses `success`) and naming alone would
    // report those as fallbacks when they are not.
    const play = a.play.bind(a);
    a.play = (key, ...rest) => {
      const hit = play(key, ...rest);
      window.__SLOTS.push({ key, hit });
      return hit;
    };

    for (const k of Object.getOwnPropertyNames(proto)) {
      if (k === 'constructor' || typeof a[k] !== 'function') continue;
      if (k === 'setLayer') {
        const orig = a[k].bind(a);
        a[k] = (name, target, secs) => {
          window.__LAYERS.push({ name, target });
          return orig(name, target, secs);
        };
        continue;
      }
      if (['play', 'tone', 'noise', 'noiseBuffer', 'prefetch', 'decodeAll',
        'startAmbient', 'startLayers', 'setSpatialResolver', 'duck', 'unduck',
        'unlock', 'setMuted', 'toggleMute'].includes(k)) continue;
      const orig = a[k].bind(a);
      a[k] = (...args) => {
        window.__SFX.push({ m: k });
        return orig(...args);
      };
    }
    return true;
  });

  // ---------------------------------------------------------------- loading
  await page.eval(() => document.getElementById('btn-begin').click());
  await page.waitFor(() => window.OP.audio.ctx
    && Object.keys(window.OP.audio.buffers).length >= 20, { what: 'samples decoded' });

  const load = await page.eval(() => {
    const a = window.OP.audio;
    return {
      ctx: a.ctx.state,
      decoded: Object.keys(a.buffers).sort(),
      layers: Object.keys(a.layers).sort(),
      voiceReady: !!window.GHOSTLINE.voiceBank.manifest,
      voiceLines: Object.keys(window.GHOSTLINE.voiceBank.manifest?.lines || {}).length,
    };
  });

  const WANT_SLOTS = ['radioOpen', 'radioClose', 'select', 'hover', 'alert', 'glitch',
    'impact', 'scan', 'moveStep', 'confirm', 'breach', 'success', 'fail', 'type',
    'nightvision', 'deny', 'detect', 'objective', 'servo', 'droneLaunch',
    'clank', 'thump', 'relayTick', 'ambient', 'field', 'interior', 'tension',
    'carrier', 'droneLoop'];
  const missing = WANT_SLOTS.filter((s) => !load.decoded.includes(s));
  ok(missing.length === 0, `sample slots failed to decode: ${missing.join(', ')}`);
  ok(load.layers.length === 5, `expected 5 looping beds, got ${load.layers.length}`);
  ok(load.voiceReady, 'voice manifest did not load');
  ok(load.voiceLines === 36, `voice manifest has ${load.voiceLines} lines, expected 36`);

  // ------------------------------------------------------------------ run
  await page.eval(() => document.getElementById('btn-deploy').click());

  // A run that hits the beats worth hearing: a probe, a drone, the breach
  // turn, a grenade, the override, and the walk out.
  const PLAN = ['ASK_WHY', 'CONFIRM', 'SEND_DRONE', 'GRENADE', 'CONFIRM', 'OVERRIDE', 'NIGHT_VISION', 'CONFIRM'];
  for (const action of PLAN) {
    await page.waitFor(ready, { tries: 200, every: 250, what: `command bar before ${action}` });
    const clicked = await page.eval((a) => {
      const btn = document.querySelector(`#commands button[data-action="${a}"]`);
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    }, action);
    if (!clicked) continue;
    await new Promise((r) => setTimeout(r, 400));
  }

  // Deliberately ask for something this turn does not offer, from the same
  // path the pad uses, and check it is answered rather than swallowed.
  await page.eval(() => window.GHOSTLINE.events.emit('commandRejected',
    { action: 'FIRE', reason: 'TEST' }));

  await page.waitFor(() => !document.getElementById('screen-debrief').classList.contains('hidden'),
    { tries: 260, every: 250, what: 'debrief' });

  const heard = await page.eval(() => {
    const counts = {};
    for (const e of window.__SFX) counts[e.m] = (counts[e.m] || 0) + 1;
    // Per slot: how often a real sample answered, and how often it did not.
    const slots = {};
    for (const s of window.__SLOTS) {
      slots[s.key] ||= { hit: 0, miss: 0 };
      slots[s.key][s.hit ? 'hit' : 'miss'] += 1;
    }
    return { counts, slots, layers: window.__LAYERS };
  });

  // A miss after the pack has decoded means a file is missing or unnamed; a
  // miss before it has is just the first click beating the decoder, which is
  // what the fallback is for.
  const starved = Object.entries(heard.slots)
    .filter(([, v]) => v.miss > 0 && v.hit === 0)
    .map(([k]) => k);
  ok(starved.length === 0, `slots that never played a sample: ${starved.join(', ')}`);

  // Every one of these is a moment a player sees happen; none of them should
  // be silent.
  const MUST_HEAR = ['select', 'confirm', 'radioOpen', 'radioClose', 'beep', 'typeTick',
    'moveStep', 'servo', 'impact', 'glitch', 'breach', 'scan', 'droneLaunch',
    'objective', 'detect', 'alert', 'deny', 'missionSuccess'];
  const silent = MUST_HEAR.filter((m) => !heard.counts[m]);
  ok(silent.length === 0, `no sound fired for: ${silent.join(', ')}`);

  const bedsUsed = [...new Set(heard.layers.map((l) => l.name))].sort();
  ok(bedsUsed.includes('interior') && bedsUsed.includes('field'),
    `exterior/interior beds never crossfaded (saw: ${bedsUsed.join(', ')})`);
  ok(bedsUsed.includes('carrier'), 'radio carrier never opened under a transmission');
  ok(bedsUsed.includes('tension'), 'tension bed never engaged');

  // The whole point of bundling the voice: no line should have fallen through.
  const playedVoice = await page.eval(() => {
    const vb = window.GHOSTLINE.voiceBank;
    return [...vb.buffers.keys()].filter((f) => vb.buffers.get(f)).length;
  });
  ok(playedVoice > 0, 'no bundled voice clip ever decoded');

  // The run above only reaches the lines its plan reaches. Decode the rest too
  // — a clip that cannot be decoded would silently fall through to Web Speech
  // on the one playthrough that happens to hit it.
  const voice = await page.eval(async () => {
    const vb = window.GHOSTLINE.voiceBank;
    const files = [...new Set(Object.values(vb.manifest.lines).map((l) => l.file))];
    await Promise.all(files.map((f) => vb.buffer(f)));
    return {
      total: files.length,
      decoded: files.filter((f) => vb.buffers.get(f)).length,
      failed: files.filter((f) => !vb.buffers.get(f)),
    };
  });
  ok(voice.failed.length === 0, `voice clips failed to decode: ${voice.failed.join(', ')}`);
  ok(voice.decoded === voice.total, `${voice.decoded}/${voice.total} voice clips decoded`);

  const audioRequests = page.failedRequests.filter((r) => /audio|voice/.test(r));
  ok(audioRequests.length === 0, `audio assets failed to load: ${audioRequests.join('; ')}`);
  ok(page.pageErrors.length === 0, `page errors: ${page.pageErrors.slice(0, 3).join(' | ')}`);

  // ---------------------------------------------------------------- report
  const order = Object.entries(heard.counts).sort((a, b) => b[1] - a[1]);
  console.log('\nsounds fired');
  for (const [m, n] of order) console.log(`  ${m.padEnd(16)} ${String(n).padStart(3)}`);
  console.log('\nsample slots used (hit = a real file answered)');
  for (const [k, v] of Object.entries(heard.slots).sort()) {
    console.log(`  ${k.padEnd(14)} hit ${String(v.hit).padStart(3)}${v.miss ? `   miss ${v.miss} (before decode)` : ''}`);
  }
  console.log(`\nbeds faded: ${bedsUsed.join(', ')}`);
  console.log(`voice clips played in this run: ${playedVoice}`);
  console.log(`voice clips decodable: ${voice.decoded} / ${voice.total}`);
  console.log(`samples decoded: ${load.decoded.length} slots`);
} finally {
  browser.close();
  statics?.server.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length ? 1 : 0);
