// Drives real mission scenarios in a real browser and checks that what the
// player is supposed to *see* actually happened, at the place it should have
// happened at.
//
//   node scripts/verify-fx.mjs [url]        default: build + serve dist/
//   node scripts/verify-fx.mjs --shots      also write PNGs to /tmp for a look
//
// The rule this enforces, which is the one easy to break by accident: every
// effect is at a world position that something in the mission actually
// occupies. A drone that always flies to the same coordinate, a fire lit in an
// empty field, a tracer from nowhere — all of those pass a "did it render"
// check and fail this one.
//
// Covers: recon sortie destinations and their phase sequence, gunfire and
// ordnance geometry, fire ignition and turn-on-turn escalation, the vehicle
// loss sequence, and that a restart puts all of it back.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Browser } from './cdp.mjs';
import { serve } from './serve.mjs';

const SHOTS = process.argv.includes('--shots');
let URL_BASE = process.argv.find((a) => a.startsWith('http'));
let statics = null;
if (!URL_BASE) {
  console.log('building…');
  execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
  statics = await serve(new URL('../dist', import.meta.url).pathname);
  URL_BASE = `http://127.0.0.1:${statics.port}`;
}

let checks = 0;
const failures = [];
const ok = (cond, msg) => {
  checks++;
  if (!cond) failures.push(msg);
  return !!cond;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const ready = () => !window.OP.director.busy
  && [...document.querySelectorAll('#commands button')].some((b) => !b.disabled);

const browser = await Browser.launch({ port: 9338 });
const page = await browser.open(`${URL_BASE}/?skip=1`);

async function shot(name) {
  if (!SHOTS) return;
  // Software WebGL renders the reveal slowly; force the veil up so a capture
  // is of the board rather than of the fog.
  await page.eval(() => {
    const fog = window.OP.scene.getObjectByName('fog');
    if (fog?.material?.uniforms?.uReveal) fog.material.uniforms.uReveal.value = 1;
  });
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  const path = `/tmp/ghostline-fx-${name}.png`;
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`  shot: ${path}`);
}

async function act(action, what = action) {
  await page.waitFor(ready, { tries: 400, every: 250, what: `command bar before ${what}` });
  return page.eval((a) => {
    const btn = document.querySelector(`#commands button[data-action="${a}"]`);
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }, action);
}

const restart = async () => {
  await page.eval(() => window.OP.startMission());
  await page.waitFor(ready, { tries: 400, every: 250, what: 'turn 1 after restart' });
};

// Records the sortie from inside the sortie, at each phase, rather than
// sampling it over the wire.
//
// Sampling does not work here and the reason is worth writing down: software
// WebGL renders this scene at well under one frame a second, and the project
// runs gsap with lag smoothing off so that beat timing survives a hitch. A
// frame that takes three seconds therefore advances the whole five-second
// sortie in one tick — the aircraft is on the pad, then it is home, and no
// poll on any interval ever sees it in the air.
//
// Hooking the phase callbacks reads correctly anyway: gsap renders a
// timeline's children in time order, so inside the arrival callback the
// transit is finished and the flight home has not started. What a phase
// reports is what the player would see at that phase, at any frame rate.
const RECORDER = () => {
  const { fx } = window.OP;
  const d = fx.drone;
  window.__sortie = { phases: [], tasked: null };

  const mark = (phase) => window.__sortie.phases.push({
    phase,
    x: d.group.position.x, y: d.group.position.y, z: d.group.position.z,
    beam: d.beamLevel, lamp: d.lamp.intensity,
    inspecting: !!d.inspecting, flying: d.flying, target: d.target,
    marker: fx.recon.state, visible: d.group.visible,
  });

  if (!d.__realSweep) d.__realSweep = d.sweep.bind(d);
  if (!d.__realLand) d.__realLand = d.land.bind(d);

  d.sweep = (from, to, opts = {}) => {
    window.__sortie.tasked = fx.recon.site
      ? { key: fx.recon.site.key, label: fx.recon.site.label, x: fx.recon.site.x, z: fx.recon.site.z }
      : null;
    const flight = d.__realSweep(from, to, {
      ...opts,
      onScan: () => { opts.onScan?.(); mark('scan'); },
      onRead: () => { opts.onRead?.(); mark('read'); },
    });
    // Marked after the call, not before: sweep() is what puts the aircraft on
    // its launch point, so reading the position first reports wherever the
    // last sortie left it.
    mark('launch');
    return flight;
  };
  d.land = () => { mark('land'); d.__realLand(); };
  return true;
};

try {
  await page.waitFor(() => !!window.OP?.fx, { tries: 200, what: 'app boot' });
  await page.waitFor(ready, { tries: 400, every: 250, what: 'turn 1 command bar' });

  // ------------------------------------------------------- 1. recon sorties
  //
  // Two drones, two different pieces of ground. The mission names both; the
  // aircraft has to actually go to them.
  const sorties = [];
  for (const turn of [1, 2]) {
    await page.eval(RECORDER);
    const clicked = await act('SEND_DRONE', `drone on turn ${turn}`);
    ok(clicked, `turn ${turn}: SEND_DRONE was available`);
    if (!clicked) break;

    // Mid-sortie capture, for a human to look at afterwards. Best effort: the
    // assertions below read the tape, not the picture.
    if (turn === 2 && SHOTS) {
      await new Promise((r) => setTimeout(r, 1800));
      await shot('recon-inflight');
    }

    // Let the whole sortie run, then read the tape.
    const recovered = await page.waitFor(() => (window.__sortie.phases.some((p) => p.phase === 'land')
      && !window.OP.fx.drone.flying && !window.OP.fx.drone.group.visible) || null,
    { tries: 400, every: 150, what: `turn ${turn} sortie to complete` });
    ok(recovered, `turn ${turn}: drone returned and is back on the deck`);

    const tape = await page.eval(() => window.__sortie);
    const tasked = tape.tasked;
    ok(tasked, `turn ${turn}: a destination was painted on the ground before the aircraft moved`);
    if (!tasked) break;

    const phase = (name) => tape.phases.find((p) => p.phase === name);
    const launch = phase('launch');
    const onStation = phase('scan');
    const read = phase('read');
    const landed = phase('land');

    // The order is the sequence the player is meant to be able to follow.
    ok(tape.phases.map((p) => p.phase).sort().join(',') === 'land,launch,read,scan'
      && tape.phases[tape.phases.length - 1].phase === 'land'
      && tape.phases.findIndex((p) => p.phase === 'scan') < tape.phases.findIndex((p) => p.phase === 'read'),
      `turn ${turn}: sortie ran COMMAND → LAUNCH → SCAN → RESULT → RETURN (got ${tape.phases.map((p) => p.phase).join(',') || 'nothing'})`);

    // LAUNCH — it starts at the squad, not at the target.
    ok(launch && Math.hypot(launch.x - tasked.x, launch.z - tasked.z) > 2,
      `turn ${turn}: it launched from the squad, ${launch ? Math.hypot(launch.x - tasked.x, launch.z - tasked.z).toFixed(1) : '?'} units off target`);

    // ARRIVAL / SCAN — over the ground it was sent to, beam and lamp on.
    const closest = onStation ? Math.hypot(onStation.x - tasked.x, onStation.z - tasked.z) : Infinity;
    ok(onStation && onStation.y > 1.5, `turn ${turn}: it was holding height over the target`);
    ok(onStation && onStation.beam > 0 && onStation.lamp > 0,
      `turn ${turn}: scan beam and lamp came on over the target`);
    ok(onStation && onStation.marker === 'scanning',
      `turn ${turn}: target marker read SCANNING while it was reading the ground (was ${onStation?.marker})`);
    ok(onStation && onStation.target === tasked.key,
      `turn ${turn}: the aircraft's own destination is the tasked place`);

    // RESULT — it had finished reading before anything was reported, and it
    // was still over the target when it did.
    ok(!!read, `turn ${turn}: a finding was reported`);
    ok(read && Math.hypot(read.x - tasked.x, read.z - tasked.z) < 1.6,
      `turn ${turn}: the finding was reported from over the target`);

    const expected = await page.eval((t) => {
      // What the mission itself says this sortie is for, resolved the same way
      // the Director resolves it — but read off the mission file, not off the
      // renderer, so this is a check and not a tautology.
      const mission = window.OP.mission;
      const turnData = mission.turns.find((x) => x.id === t);
      const outcome = turnData.outcomes.SEND_DRONE;
      return { recon: turnData.recon || null, reveal: outcome.reveal || null };
    }, turn);

    sorties.push({ turn, tasked, onStation, expected });

    // The whole point: it inspected the ground it was sent to. The orbit it
    // flies while reading is about a unit across, hence the tolerance.
    ok(closest < 1.6,
      `turn ${turn}: drone inspected ${tasked.key} — closest approach ${closest.toFixed(2)} units from the marker`);

    // The destination is the one the mission named, not a turn-number guess.
    if (expected.reveal) {
      const prop = await page.eval((name) => {
        const o = window.OP.director.level[name];
        return o?.position ? { x: o.position.x, z: o.position.z } : null;
      }, expected.reveal);
      ok(prop && near(tasked.x, prop.x, 0.6) && near(tasked.z, prop.z, 0.6),
        `turn ${turn}: sortie went to the ${expected.reveal} itself, where it actually stands`);
    } else if (expected.recon) {
      ok(tasked.key === expected.recon,
        `turn ${turn}: sortie went to the mission's declared site (${tasked.key} vs ${expected.recon})`);
    }

    // The marker settles to SURVEYED once the finding has landed.
    const surveyed = await page.waitFor(() => (window.OP.fx.recon.state === 'surveyed') || null,
      { tries: 120, every: 150, what: `turn ${turn} marker resolving to surveyed` });
    ok(surveyed, `turn ${turn}: target marker resolves to SURVEYED`);

    // RETURN — it comes home rather than parking over the target.
    ok(landed && Math.hypot(landed.x - launch.x, landed.z - launch.z) < 2.5,
      `turn ${turn}: it came home to where it launched from`);
  }

  if (sorties.length === 2) {
    const [a, b] = sorties;
    const apart = Math.hypot(a.tasked.x - b.tasked.x, a.tasked.z - b.tasked.z);
    ok(apart > 3,
      `two sorties went to different ground (${a.tasked.key} → ${b.tasked.key}, ${apart.toFixed(1)} units apart)`);
    ok(a.tasked.label && b.tasked.label && a.tasked.label !== b.tasked.label,
      `each sortie is labelled with where it went (${a.tasked.label} / ${b.tasked.label})`);
  }

  // ------------------------------------------------- 2. gunfire and its fire
  //
  // Rounds into the generator: tracers exist while they are in the air, and
  // what the mission says caught fire is on fire, at the generator's own
  // position.
  await restart();
  await act('CONFIRM', 'turn 1 advance');
  const fired = await act('FIRE', 'turn 2 fire');
  ok(fired, 'turn 2: FIRE was available');

  const combatLive = await page.waitFor(() => {
    const n = window.OP.fx.combat.live.length;
    return n > 0 ? n : null;
  }, { tries: 120, every: 80, what: 'tracers in the air' });
  ok(combatLive > 0, `gunfire put ${combatLive} objects on the board`);

  const fire = await page.waitFor(() => {
    const h = window.OP.fx.hazards.list.find((x) => x.key === 'generator');
    return h ? { key: h.key, x: h.x, z: h.z, intensity: h.intensity, flames: h.flames.length } : null;
  }, { tries: 200, every: 150, what: 'the generator catching fire' });

  const generator = await page.eval(() => {
    const g = window.OP.director.level.generator;
    return g?.position ? { x: g.position.x, z: g.position.z } : null;
  });
  ok(generator && near(fire.x, generator.x, 0.6) && near(fire.z, generator.z, 0.6),
    `the fire is at the generator, not at a guess (fire ${fire.x.toFixed(1)},${fire.z.toFixed(1)} vs prop ${generator?.x.toFixed(1)},${generator?.z.toFixed(1)})`);
  ok(fire.flames > 0, 'the fire has a flame body');
  await shot('fire-lit');

  // ---------------------------------------------- 3. it gets worse each turn
  const before = fire.intensity;
  await act('CONFIRM', 'turn 3 confirm');          // breach turn, walks into it
  const after = await page.waitFor(() => {
    const h = window.OP.fx.hazards.list.find((x) => x.key === 'generator');
    return h && h.intensity > 0 ? h.intensity : null;
  }, { tries: 200, every: 150, what: 'fire intensity next turn' });
  ok(after > before,
    `the fire escalates turn on turn (${before.toFixed(2)} → ${after.toFixed(2)})`);

  const hazardCount = await page.eval(() => window.OP.fx.hazards.list.map((h) => ({
    key: h.key, x: +h.x.toFixed(2), z: +h.z.toFixed(2), intensity: +h.intensity.toFixed(2),
  })));
  // The breach charge leaves the door frame burning, so by now there are two
  // fires and they are in different places.
  ok(hazardCount.length >= 2, `the breach left its own fire (${hazardCount.length} burning)`);
  const distinct = new Set(hazardCount.map((h) => `${h.x},${h.z}`)).size;
  ok(distinct === hazardCount.length, 'every fire is at its own position');

  const occlusion = await page.eval((p) => window.OP.fx.hazards.occlusionAt(p.x, p.z),
    { x: hazardCount[0].x, z: hazardCount[0].z });
  ok(occlusion > 0, `smoke reports occlusion over its own fire (${occlusion.toFixed(2)})`);
  await shot('two-fires');

  // ------------------------------------------------------ 4. losing a vehicle
  //
  // Driven through the event GameState emits, so this checks the seam the
  // gameplay layer actually uses rather than a private entry point.
  await restart();
  const beforeLoss = await page.eval(() => {
    const u = window.OP.squad.all.find((x) => x.id === 'BETA-2');
    return { inScene: !!u.group.parent, tilt: u.group.rotation.z, cone: u.cone.material.uniforms.uOpacity.value };
  });
  ok(beforeLoss.inScene && Math.abs(beforeLoss.tilt) < 0.01, 'BETA-2 starts upright and in the scene');

  await page.eval(() => window.GHOSTLINE.events.emit('unitDisabled',
    { unit: 'BETA-2', integrity: 0, turn: 1, cause: 'test' }));
  const queued = await page.eval(() => window.OP.director.pendingLoss.map((p) => `${p.id}:${p.mode}`));
  ok(queued.includes('BETA-2:disabled'),
    `the loss is queued off the gameplay event rather than played on top of the shot that caused it (${queued.join(',') || 'nothing queued'})`);

  // The sequence is queued deliberately — it plays on the next beat, not on
  // top of whatever is on screen. Drive that beat, recording the beats as the
  // sequence reports them.
  const beats = await page.eval(async () => {
    window.__beats = [];
    const director = window.OP.director;
    const realLoss = director.fx.vehicleLoss.bind(director.fx);
    director.fx.vehicleLoss = (unit, opts = {}) => realLoss(unit, {
      ...opts,
      onBeat: (name) => { window.__beats.push(name); opts.onBeat?.(name); },
    });
    await director.playPendingLosses();
    director.fx.vehicleLoss = realLoss;
    return window.__beats;
  });
  ok(beats.join(',') === 'critical,unstable,shutdown,collapse,wreck',
    `the loss plays as a sequence, in order (got: ${beats.join(',') || 'nothing'})`);

  // The tweens the last beat started still need real time to finish.
  const lost = await page.waitFor(() => {
    const u = window.OP.squad.all.find((x) => x.id === 'BETA-2');
    const wreck = window.OP.fx.hazards.list.find((h) => h.key === 'wreck:BETA-2');
    // Wait for the fall itself to finish, not just for the beat that starts it.
    if (!wreck || u.group.rotation.z < 1.0) return null;
    return {
      inScene: !!u.group.parent,
      tilt: u.group.rotation.z,
      cone: u.cone.material.uniforms.uOpacity.value,
      coneScale: u.cone.mesh.scale.x,
      smoke: wreck.intensity,
      follows: !!wreck.follow,
    };
  }, { tries: 300, every: 150, what: 'the loss sequence to settle' });

  ok(lost.inScene, 'a lost vehicle stays in the scene — it is a wreck, not a deletion');
  ok(lost.tilt > 0.8, `it went down rather than standing there dimmed (tilt ${lost.tilt.toFixed(2)} rad)`);
  ok(lost.cone < 0.02 && lost.coneScale < 0.05, 'its sensor cone collapsed to nothing');
  ok(lost.smoke > 0 && lost.follows, 'the wreck smokes, and the plume is attached to it');
  await shot('vehicle-lost');

  // -------------------------------------------------- 5. a restart undoes it
  await restart();
  const reset = await page.eval(() => {
    const u = window.OP.squad.all.find((x) => x.id === 'BETA-2');
    return {
      tilt: u.group.rotation.z,
      y: u.group.position.y,
      lost: !!u.lost,
      cone: u.cone.material.uniforms.uOpacity.value,
      hazards: window.OP.fx.hazards.list.length,
      marker: window.OP.fx.recon.group.visible,
      drone: window.OP.fx.drone.group.visible,
    };
  });
  ok(Math.abs(reset.tilt) < 0.01 && Math.abs(reset.y) < 0.01 && !reset.lost,
    'the wreck stands back up on replay');
  ok(reset.cone > 0.1, 'its cone comes back');
  ok(reset.hazards === 0, `every fire is out on replay (${reset.hazards} left)`);
  ok(!reset.marker && !reset.drone, 'no recon marker or aircraft left over from the last run');

  // ------------------------------------------------------------- 6. clean run
  const errors = [...page.pageErrors, ...page.consoleErrors]
    // Three reports a failed shader compile through console.error, which is
    // the only way a particle system fails: it renders nothing and says so
    // here. Everything in this file draws through one, so this is load-bearing.
    .filter((e) => !/favicon/i.test(e));
  ok(errors.length === 0, `console is clean: ${errors.slice(0, 3).join(' | ')}`);

  console.log('\nrecon sorties');
  for (const s of sorties) {
    console.log(`  turn ${s.turn}  → ${s.tasked.label.padEnd(16)} (${s.tasked.x.toFixed(1)}, ${s.tasked.z.toFixed(1)})  declared: ${s.expected.reveal || s.expected.recon}`);
  }
  console.log('\nfires burning at the end of the combat run');
  for (const h of hazardCount) console.log(`  ${String(h.key).padEnd(12)} (${h.x}, ${h.z})  intensity ${h.intensity}`);
} finally {
  browser.close();
  statics?.server.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length ? 1 : 0);
