// Record a scripted playthrough as a video.
//
// Software WebGL renders this at a handful of frames a second, so recording in
// real time and playing back in real time would be a slideshow. Instead the
// capture runs as fast as the renderer will give frames, and ffmpeg plays them
// back at a steady rate — the result is a smooth, slightly sped-up showcase
// rather than a stuttering document of how slow the test machine is.
//
//   node scripts/record.mjs out.mp4
//
// PLAN drives the mission from the title card to the debrief. It is not a
// clean sweep: turn 3 is scored MISUSE and the run ends OBJECTIVE FAILED at
// 28% integrity. Every entry is a legal action for its turn, which is what
// this script is for — a showcase of the whole arc, not a winning line. The
// camera work and the map are scripted at the beats where they say something.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { serve } from './serve.mjs';
import { Browser } from './cdp.mjs';

const out = process.argv[2] || 'ghostline.mp4';
const dir = '/tmp/claude-1000/-home-nikhil-tech-jam-hackathon/4a87a044-f9ac-4266-849a-f71cb010b7e1/scratchpad/frames';
const FPS = Number(process.env.FPS || 14);

// All 11 turns. Legal choices throughout; the outcome is a partial failure.
const PLAN = ['CONFIRM', 'SEND_DRONE', 'QUIET_TAKEDOWN', 'THERMAL_SWEEP', 'THERMAL_SWEEP',
              'ENTER_ENGAGE', 'HOLD_FIRE', 'CROSS_CHECK', 'EVAC_HOSTAGES', 'SHORT_FUSE', 'CONFIRM'];

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const { server, port } = await serve('dist');
const browser = await Browser.launch({ port: 9470 });
let n = 0;
let recording = true;

async function grab(page) {
  try {
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    writeFileSync(`${dir}/f${String(n++).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'));
  } catch { /* a dropped frame is not worth ending the take for */ }
}

try {
  // Start on the title screen so the recording opens where a player does.
  const page = await browser.open(`http://127.0.0.1:${port}/`);
  await page.waitFor(() => !!window.OP, { tries: 300, what: 'boot' });

  // Pump frames continuously in the background for the whole take.
  const pump = (async () => { while (recording) await grab(page); })();

  const hold = (ms) => new Promise((r) => setTimeout(r, ms));

  await hold(2600);                                    // title card
  await page.eval(() => document.getElementById('btn-begin')?.click());
  await hold(3200);                                    // briefing
  await page.eval(() => document.getElementById('btn-deploy')?.click());
  await hold(5200);                                    // deploy push-in

  for (let i = 0; i < PLAN.length; i++) {
    const action = PLAN[i];
    // Wait for the beat to hand control back before issuing the next order.
    await page.waitFor(() => !window.OP.director.busy, { tries: 260, every: 250, what: `idle before ${action}` })
      .catch(() => {});
    await page.eval((a) => {
      const btn = [...document.querySelectorAll('#commands .cmd')]
        .find((b) => (b.dataset.action || b.textContent).toUpperCase().includes(a));
      if (btn) btn.click();
    }, action);

    // Open the tactical map once, on the turn after the first sortie, so the
    // recording shows what the player actually reads it for.
    if (i === 2) { await hold(1200); await page.eval(() => window.OP.map?.show()); await hold(3200);
                   await page.eval(() => window.OP.map?.hide()); }
    await hold(900);
  }

  // Let the debrief land and sit on it.
  await page.waitFor(() => !document.getElementById('screen-debrief')?.classList.contains('hidden'),
    { tries: 240, every: 250, what: 'debrief' }).catch(() => {});
  await hold(5000);

  recording = false;
  await pump;
  console.log(`captured ${n} frames`);
  if (page.consoleErrors.length) console.log('console errors:', page.consoleErrors.slice(0, 5));
} finally {
  recording = false;
  browser.close();
  server.close();
}

execFileSync('ffmpeg', [
  '-y', '-framerate', String(FPS), '-i', `${dir}/f%05d.jpg`,
  '-vf', 'scale=1600:-2:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', out,
], { stdio: 'pipe' });
console.log(`wrote ${out}`);
