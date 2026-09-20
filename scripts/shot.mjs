// Headless screenshots of the real build, for judging the environment from the
// gameplay camera rather than from a description of it.
//
//   npm run build && node scripts/shot.mjs out.png
//   node scripts/shot.mjs out.png '?skip=1&auto=CONFIRM,SEND_DRONE'
//   CAM=wide node scripts/shot.mjs out.png
//
// Two things bite every time and are handled here rather than being
// rediscovered:
//
//   1. Software WebGL renders this at a couple of frames a second, so the
//      1.6s mission-start curtain takes ~16s of wall clock and the fog of war
//      is still most of the way down long after the page "loaded". The fog is
//      forced up before the capture.
//   2. Textures stream in after the first frame. Capturing on DOM ready gets
//      the untextured fallback, which is exactly the thing being checked.
//      The shot waits for the texture set to have decoded.

import { writeFileSync } from 'node:fs';
import { serve } from './serve.mjs';
import { Browser } from './cdp.mjs';

const out = process.argv[2] || 'shot.png';
const query = process.argv[3] || '?skip=1';
const settle = Number(process.env.SETTLE || 9000);

const { server, port } = await serve('dist');
const browser = await Browser.launch({ port: 9444 });

try {
  const page = await browser.open(`http://127.0.0.1:${port}/${query}`);
  await page.waitFor(() => !!window.OP, { tries: 120, what: 'game boot' });

  // Fog of war fully up: the map is what is being looked at, not the reveal.
  await page.eval(() => {
    const fog = window.OP.scene.getObjectByName('fog');
    if (fog?.material?.uniforms?.uReveal) fog.material.uniforms.uReveal.value = 1;
  });

  // Camera framings worth comparing. The rig is the only thing allowed to
  // write camera.position (see Camera.js), so reframing means moving its
  // targets — setting position directly is overwritten on the next frame.
  //
  //   CAM=wide    the whole installation and the ground around it
  //   CAM=close   roughly what the player sees mid-turn
  //   CAM=detail  in on the compound, for judging surfaces
  //   CAM=x,z,v   arbitrary: focus x/z and orthographic view height
  const cam = process.env.CAM;
  if (cam) {
    const FRAMES = { wide: [2, -2, 40], close: [3, -3, 16], detail: [4, -4, 7] };
    const frame = FRAMES[cam] || cam.split(',').map(Number);
    await page.eval(([x, z, view]) => {
      const d = window.OP.camera.userData;
      d.target.set(x, 0, z);
      d.focus.set(x, 0, z);
      d.viewTarget = view;
      d.view = view;
      d.sway = 0;                 // a still frame for comparison shots
    }, frame);
  }

  // Let the textures land and the light settle.
  await new Promise((r) => setTimeout(r, settle));

  const state = await page.eval(() => ({
    tier: window.GHOSTLINE?.textures?.tier?.() ?? null,
    sets: window.GHOSTLINE?.textures?.loaded?.().length ?? 0,
    missing: window.GHOSTLINE?.textures?.errors ?? [],
  }));

  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(data, 'base64'));

  console.log(`wrote ${out}`);
  if (page.consoleErrors.length) console.log('console errors:', page.consoleErrors.slice(0, 8));
  if (page.pageErrors.length) console.log('page errors:', page.pageErrors.slice(0, 8));
  const missing = page.failedRequests.filter((r) => !/favicon/.test(r));
  if (missing.length) console.log(`failed requests (${missing.length}):`, missing.slice(0, 12));
  console.log(`tier ${state.tier} · ${state.sets} texture sets`
    + (state.missing.length ? ` · MISSING ${state.missing.length}: ${state.missing.slice(0, 4)}` : ' · all maps loaded'));
} finally {
  browser.close();
  server.close();
}
