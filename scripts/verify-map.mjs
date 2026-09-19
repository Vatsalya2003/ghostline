// Drives the real game in a real browser and checks the tactical map against
// the game state behind it — that the minimap draws, that map coordinates
// correspond to actual world positions, that the overlay opens and navigates,
// and, most of all, that the map does not show the player things the squad has
// not found.
//
//   node scripts/verify-map.mjs [url]        default: build + serve dist/
//
// `scripts/map-test.mjs` proves the rules in Node. This proves they survived
// contact with the canvas, the DOM and the input layer.

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

const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

const browser = await Browser.launch({ port: 9341 });
const page = await browser.open(`${URL_BASE}/`);

try {
  await page.waitFor(() => !!window.OP?.map, { what: 'app boot' });

  // ------------------------------------------------------------- the minimap
  const mini = await page.eval(() => {
    const c = document.getElementById('minimap');
    return { present: !!c, w: c?.width || 0, h: c?.height || 0 };
  });
  ok(mini.present, 'no minimap canvas in the HUD');

  await page.eval(() => document.getElementById('btn-begin').click());
  await page.eval(() => document.getElementById('btn-deploy').click());
  await page.waitFor(ready, { tries: 200, every: 250, what: 'turn 1' });

  // It has to be sized and actually painted, not just present in the DOM.
  const painted = await page.eval(() => {
    const c = document.getElementById('minimap');
    if (!c.width || !c.height) return { sized: false };
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      // Anything brighter than the near-black background counts as ink.
      if (d[i] > 30 || d[i + 1] > 30 || d[i + 2] > 30) lit++;
    }
    return { sized: true, lit, total: d.length / 4 };
  });
  ok(painted.sized, 'the minimap canvas was never given a size');
  ok(painted.lit > 50, `the minimap drew almost nothing (${painted.lit} lit pixels)`);

  // ------------------------------------------- coordinates mean what they say
  // Project a unit's real world position through the map's own view and check
  // the pixel lands where the maths says it should. A map that disagrees with
  // the board is worse than no map.
  const coords = await page.eval(() => {
    const map = window.OP.map;
    const u = window.OP.squad.lead;
    const view = map.miniView;
    const [sx, sy] = view.toScreen(u.position.x, u.position.z);
    const [bx, bz] = view.toWorld(sx, sy);
    const [ox, oy] = view.toScreen(0, 0);
    return {
      inside: sx >= 0 && sx <= view.width && sy >= 0 && sy <= view.height,
      roundTripX: Math.abs(bx - u.position.x),
      roundTripZ: Math.abs(bz - u.position.z),
      centreX: Math.abs(ox - view.width / 2),
      centreY: Math.abs(oy - view.height / 2),
    };
  });
  ok(coords.inside, 'the squad projects outside its own minimap');
  ok(coords.roundTripX < 0.01 && coords.roundTripZ < 0.01,
    'world→map→world does not round-trip');
  ok(coords.centreX < 0.01 && coords.centreY < 0.01,
    'the world origin does not land at the centre of the map');

  // --------------------------------------------------- squad, live and marked
  const squad = await page.eval(() => {
    const marks = window.OP.map.markers.filter((m) => m.kind === 'unit');
    return {
      count: marks.length,
      ids: marks.map((m) => m.id).sort(),
      matchesWorld: marks.every((m) => {
        const u = window.OP.squad.all.find((x) => x.id === m.id);
        return u && Math.abs(u.position.x - m.x) < 0.001 && Math.abs(u.position.z - m.z) < 0.001;
      }),
    };
  });
  ok(squad.count === 3, `expected 3 unit markers, got ${squad.count}`);
  ok(squad.matchesWorld, 'a unit marker is not at its unit’s world position');

  // ------------------------------------------------ what the player knows yet
  // Turn 1: the squad is outside the wire. The relay is briefed, not observed,
  // and nothing has been shot at, so there must be no contacts on the board.
  const early = await page.eval(() => {
    const map = window.OP.map;
    return {
      contacts: map.markers.filter((m) => m.kind === 'contact').length,
      hostilesInWorld: window.OP.fx.hostiles.length,
      briefed: map.markers.filter((m) => m.source === 'briefed').map((m) => m.id),
      objective: map.markers.find((m) => m.kind === 'objective')?.id || null,
    };
  });
  ok(early.contacts === 0, `the map showed ${early.contacts} contacts before any were found`);
  ok(early.briefed.length > 0,
    'nothing was marked briefed-but-unobserved — the fog gate is not running');
  ok(!!early.objective, 'the mission objective has no marker on the map');

  // --------------------------------------------------------- the overlay: M
  await page.eval(press, 'm');
  const opened = await page.eval(() => ({
    open: window.OP.map.open,
    visible: !document.getElementById('screen-map').classList.contains('hidden'),
    span: window.OP.map.fullView.span,
  }));
  ok(opened.open && opened.visible, 'pressing M did not open the tactical map');

  const nav = await page.eval(() => {
    const map = window.OP.map;
    const before = { span: map.fullView.span, cx: map.fullView.cx };
    map.handle('zoomIn');
    const zoomed = map.fullView.span;
    map.handle('navRight');
    const panned = map.fullView.cx;
    // Drive it well past the edge of the board and make sure it stops.
    for (let i = 0; i < 400; i++) map.handle('navRight');
    const pinned = map.fullView.cx;
    for (let i = 0; i < 60; i++) map.handle('zoomOut');
    const widest = map.fullView.span;
    for (let i = 0; i < 60; i++) map.handle('zoomIn');
    const tightest = map.fullView.span;
    return { before, zoomed, panned, pinned, widest, tightest,
      board: map.bounds.size };
  });
  ok(nav.zoomed < nav.before.span, 'zoom in did not close the view');
  ok(nav.panned > nav.before.cx, 'pan right did not move the view');
  ok(Math.abs(nav.pinned) <= nav.board / 2,
    `panning ran off the board (centre ${nav.pinned})`);
  ok(nav.widest <= nav.board * 1.25 + 0.001,
    `zoomed out past the limit (${nav.widest})`);
  ok(nav.tightest >= nav.board * 0.18 - 0.001,
    `zoomed in past the limit (${nav.tightest})`);

  const fullPainted = await page.eval(() => {
    const c = document.getElementById('map-canvas');
    if (!c.width || !c.height) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 30 || d[i + 1] > 30 || d[i + 2] > 30) lit++;
    return lit;
  });
  ok(fullPainted > 200, `the full map drew almost nothing (${fullPainted} lit pixels)`);

  // Marker selection — how a controller reads the board, since a pad has no
  // pointer.
  const selected = await page.eval(() => {
    const map = window.OP.map;
    map.handle('confirm');
    const first = map.selected;
    map.handle('confirm');
    return { first, second: map.selected, readout: document.getElementById('map-readout').textContent };
  });
  ok(selected.first === 0 && selected.second === 1, 'marker selection does not step');
  ok(/\S/.test(selected.readout), 'the readout says nothing about the selected marker');

  await page.eval(press, 'm');
  ok(await page.eval(() => !window.OP.map.open && document.getElementById('screen-map').classList.contains('hidden')),
    'pressing M again did not close the map');

  // ------------------------------------------------------------ recon sortie
  // Send the drone and catch it while it is still up: it must be on the map,
  // at its own position, with a destination to fly to.
  await page.waitFor(ready, { tries: 200, every: 250, what: 'command bar' });

  await page.eval(() => {
    const btn = document.querySelector('#commands button[data-action="SEND_DRONE"]');
    if (btn && !btn.disabled) btn.click();
  });
  await page.waitFor(() => window.OP.fx.drone.flying, { tries: 80, every: 100, what: 'drone launch' });

  // Software WebGL renders this at a frame or two a second, and the map is
  // updated from the render loop — so wait for it to have *seen* the launch
  // rather than racing the next frame.
  await page.waitFor(() => !!window.OP.map.model.droneTrack,
    { tries: 60, every: 250, what: 'the map to pick up the sortie' });

  const flight = await page.eval(() => {
    const map = window.OP.map;
    const d = map.markers.find((m) => m.kind === 'drone');
    return {
      onMap: !!d,
      track: map.model.droneTrack,
      matches: d && Math.abs(d.x - window.OP.fx.drone.group.position.x) < 0.001,
    };
  });
  ok(flight.onMap, 'the drone is flying but is not on the map');
  ok(flight.matches, 'the drone marker is not at the drone’s position');
  ok(flight.track && typeof flight.track.tx === 'number',
    'the drone has no destination on the map — "I sent it THERE" is not visible');

  // The marker tracks the aircraft rather than sitting where it launched.
  //
  // Not a timing test, deliberately. Software WebGL gives the whole sortie
  // about one frame, and the transit is a tween that finishes inside a single
  // tick — there is no motion left to sample from out here. So this moves the
  // drone and checks the marker went with it, which is the binding that could
  // actually break: a marker that captured the launch point once would pass
  // every other check on this page and still be wrong.
  const followed = await page.eval(() => {
    const map = window.OP.map;
    const drone = window.OP.fx.drone;
    const before = { ...map.model.droneTrack };
    const from = drone.group.position.x;
    drone.group.position.x = from + 2.5;
    map.update(0.016);
    const after = { ...map.model.droneTrack };
    drone.group.position.x = from;
    map.update(0.016);
    return { before, after, restored: map.model.droneTrack?.x };
  });
  ok(Math.abs((followed.after.x - followed.before.x) - 2.5) < 0.001,
    `the drone marker did not follow the drone (${followed.before.x} → ${followed.after.x})`);

  await page.waitFor(() => !window.OP.fx.drone.flying, { tries: 200, every: 100, what: 'drone recovery' });
  ok(await page.waitFor(() => !window.OP.map.markers.some((m) => m.kind === 'drone'),
    { tries: 60, every: 250, what: 'the drone marker to clear' }).then(() => true).catch(() => false),
    'the drone marker outlived the sortie');

  // The ground it scanned is now known, and the map should say so.
  ok(await page.waitFor(() => window.OP.map.markers
    .some((m) => m.source === 'observed' && m.kind !== 'unit'),
  { tries: 60, every: 250, what: 'ground to become observed' }).then(() => true).catch(() => false),
  'nothing became observed after a recon sortie');

  // ------------------------------------------------- contacts, once they exist
  // Play on until the game actually puts hostiles on the board, then check the
  // map picked them up — and only then.
  for (let i = 0; i < 6; i++) {
    await page.waitFor(ready, { tries: 200, every: 250, what: `turn ${i + 2}` });
    const done = await page.eval(() => !!window.OP.state.missionOver
      || window.OP.fx.hostiles.length > 0);
    if (done) break;
    await page.eval(() => {
      const btn = document.querySelector('#commands button:not([disabled])');
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  const revealed = await page.eval(() => ({
    inWorld: window.OP.fx.hostiles.length,
    onMap: window.OP.map.markers.filter((m) => m.kind === 'contact').length,
    certainties: window.OP.map.markers.filter((m) => m.kind === 'contact').map((m) => m.certainty),
  }));
  if (revealed.inWorld > 0) {
    ok(revealed.onMap === revealed.inWorld,
      `${revealed.inWorld} hostiles on the board, ${revealed.onMap} on the map`);
    ok(revealed.certainties.every((c) => c === 'confirmed'),
      'a hostile the squad has seen is not marked confirmed');
  } else {
    console.log('  (no hostiles were revealed on this path — contact check skipped)');
  }

  // ------------------------------------------------------------------ replay
  await page.eval(() => window.OP.startMission());
  await page.waitFor(() => window.OP.map.model.contacts.size === 0
    && window.OP.map.model.visited.length <= 1,
  { tries: 60, every: 250, what: 'the map to reset' }).catch(() => {});
  const afterReplay = await page.eval(() => {
    const map = window.OP.map;
    return {
      contacts: map.model.contacts.size,
      hazards: map.model.hazards.size,
      route: map.model.visited.length,
      drone: !!map.model.droneTrack,
      open: map.open,
    };
  });
  ok(afterReplay.contacts === 0, 'replay left contacts on the map');
  ok(afterReplay.hazards === 0, 'replay left hazards on the map');
  ok(afterReplay.route <= 1, 'replay left the old route on the map');
  ok(!afterReplay.drone, 'replay left a drone on the map');

  // ----------------------------------------------------------------- hygiene
  const mapRequests = page.failedRequests.filter((r) => !/favicon/.test(r));
  ok(mapRequests.length === 0, `assets failed to load: ${mapRequests.slice(0, 3).join('; ')}`);
  ok(page.pageErrors.length === 0, `page errors: ${page.pageErrors.slice(0, 3).join(' | ')}`);
} finally {
  browser.close();
  statics?.server.close();
}

console.log(`\n${checks - failures.length}/${checks} map checks passed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length ? 1 : 0);
