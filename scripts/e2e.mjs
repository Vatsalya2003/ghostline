// Drives the real game in a real browser and walks a full mission end to end.
//   node scripts/e2e.mjs [url]            default http://localhost:5173
// Needs a dev/preview server already serving the app. Asserts the whole loop:
// OBSERVE → INTERPRET → COMMAND → TRUST/QUESTION → EXECUTE → CONSEQUENCES → DEBRIEF.
import { execFileSync } from 'node:child_process';
import { Browser } from './cdp.mjs';
import { serve } from './serve.mjs';

// Default to a freshly built dist/ on a private port. Pointing this at the dev
// server instead works, but HMR will reload the page mid-mission whenever
// anyone saves a file, which reads as a spurious failure.
let URL_BASE = process.argv[2];
let statics = null;
if (!URL_BASE) {
  console.log('building…');
  execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
  statics = await serve(new URL('../dist', import.meta.url).pathname);
  URL_BASE = `http://127.0.0.1:${statics.port}`;
  console.log(`serving dist/ at ${URL_BASE}`);
}

let checks = 0;
const failures = [];
const ok = (cond, msg) => { checks++; if (!cond) failures.push(msg); return !!cond; };

// The AI's line is typed out a character at a time; the command bar unlocks
// only once the Director is done, which is the real "your move" signal.
const ready = () => !window.OP.director.busy
  && [...document.querySelectorAll('#commands button')].some((b) => !b.disabled);

const snapshot = () => {
  const s = window.OP.state;
  const btns = [...document.querySelectorAll('#commands button')].map((b) => ({
    action: b.dataset.action, disabled: b.disabled,
    hint: b.querySelector('.hint')?.textContent || '',
  }));
  return {
    turnIndex: s.turnIndex, health: s.health, drones: s.drones,
    statuses: { ...s.statuses }, relayOnline: s.relayOnline, missionOver: s.missionOver,
    turnCount: document.getElementById('turn-count').textContent,
    turnName: document.getElementById('turn-name').textContent,
    objectives: [...document.querySelectorAll('#objective .obj')]
      .map((o) => ({ id: o.dataset.objective, state: o.className.replace('obj ', '').split(' ')[0] })),
    turnMarks: [...document.querySelectorAll('#log-lines .turn-mark')].map((m) => m.textContent),
    situation: document.getElementById('situation-text').textContent,
    task: document.getElementById('task-text').textContent,
    comms: document.getElementById('comms-text').textContent,
    source: document.getElementById('comms-source').textContent,
    relay: document.getElementById('comms-relay').textContent,
    confidence: document.getElementById('conf-label').textContent,
    confLit: document.querySelectorAll('#conf-bar .conf-seg.on').length,
    suspect: document.getElementById('confidence').classList.contains('suspect'),
    confNote: document.getElementById('conf-note').textContent,
    healthText: document.getElementById('health-value').textContent,
    dronePips: document.querySelectorAll('#drone-pips .pip.full').length,
    logLines: document.querySelectorAll('#log-lines > div').length,
    buttons: btns,
    unitPos: Object.fromEntries(window.OP.squad.all.map((u) => [
      u.id, [+u.position.x.toFixed(2), +u.position.z.toFixed(2)]])),
    unitStatus: Object.fromEntries(window.OP.squad.all.map((u) => [u.id, u.status])),
    debriefOpen: !document.getElementById('screen-debrief').classList.contains('hidden'),
  };
};

const press = (action) => {
  const btn = document.querySelector(`#commands button[data-action="${action}"]`);
  if (!btn) return 'missing';
  if (btn.disabled) return 'disabled';
  btn.click();
  return 'clicked';
};

async function diag(page, why) {
  console.error(`\n   STALLED — ${why}`);
  try {
    const s = await page.eval(() => ({
      busy: window.OP?.director?.busy, over: window.OP?.state?.missionOver,
      turnIndex: window.OP?.state?.turnIndex, health: window.OP?.state?.health,
      comms: document.getElementById('comms-text')?.textContent?.slice(0, 90),
      buttons: [...document.querySelectorAll('#commands button')]
        .map((b) => `${b.dataset.action}${b.disabled ? '(off)' : ''}`),
      debrief: !document.getElementById('screen-debrief')?.classList.contains('hidden'),
      locked: window.OP?.ui?.commandBar?.locked,
    }));
    console.error('   state  ', JSON.stringify(s));
    // A 50ms timer that takes ~1000ms means the browser is throttling us, not
    // that the game is stuck. Distinguishing those two cost an hour once.
    const timing = await page.eval(`(async () => {
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 50));
      const timer = performance.now() - t0;
      const t1 = performance.now();
      await new Promise((r) => requestAnimationFrame(r));
      return { timer50ms: Math.round(timer), rafMs: Math.round(performance.now() - t1),
               hidden: document.hidden, vis: document.visibilityState };
    })()`);
    console.error('   timing ', JSON.stringify(timing),
      timing.timer50ms > 300 ? '  <-- BROWSER THROTTLING, not a game stall' : '');
  } catch (e) { console.error('   state unavailable:', e.message); }
  const errs = page.consoleErrors.concat(page.pageErrors);
  console.error('   errors ', errs.length ? errs.slice(0, 6).join('\n           ') : '(none reported)');
  const missing = [...new Set(page.failedRequests)];
  console.error('   missing', missing.length ? missing.slice(0, 8).join('\n           ') : '(none)');
}

async function run(page, plan, label) {
  console.log(`\n── ${label}`);
  await page.waitFor(() => !!window.OP, { tries: 80, what: 'game boot' });
  try {
    await page.waitFor(ready, { tries: 240, what: 'turn 1 command bar' });
  } catch (e) { await diag(page, `${label}: turn 1 never handed over control`); throw e; }

  let prev = await page.eval(snapshot);
  ok(prev.turnIndex === 0, `${label}: mission starts on turn 1`);
  ok(prev.health === 100, `${label}: starts at full integrity`);
  ok(/TURN 1 \/ 6/.test(prev.turnCount), `${label}: turn counter reads "TURN 1 / 6" (got "${prev.turnCount}")`);
  ok(prev.comms.length > 5, `${label}: AI spoke on turn 1`);
  ok(prev.confidence === 'HIGH', `${label}: turn 1 confidence is HIGH (got "${prev.confidence}")`);
  ok(prev.confLit === 3, `${label}: HIGH lights all three confidence segments (got ${prev.confLit})`);
  ok(prev.objectives.length === 2, `${label}: both objectives are on screen during play (got ${prev.objectives.length})`);
  ok(prev.objectives.every((o) => o.state === 'pending'), `${label}: both objectives start pending`);
  ok(prev.turnMarks.length === 1 && /TURN 1/.test(prev.turnMarks[0]),
    `${label}: the log opens with a turn 1 rule (got ${JSON.stringify(prev.turnMarks)})`);

  const seen = [];
  for (const action of plan) {
    const before = prev;
    const res = await page.eval(press, action);
    ok(res === 'clicked', `${label}: turn ${before.turnIndex + 1} — "${action}" was pressable (got ${res})`);
    if (res !== 'clicked') break;

    try {
      await page.waitFor(
        () => window.OP.state.missionOver
          ? !window.OP.director.busy
          : (!window.OP.director.busy
             && [...document.querySelectorAll('#commands button')].some((b) => !b.disabled)),
        { tries: 360, what: `resolution of ${action}` });
    } catch (e) {
      await diag(page, `${label}: turn ${before.turnIndex + 1} "${action}" never resolved`);
      throw e;
    }

    const now = await page.eval(snapshot);
    seen.push({ action, before, now });
    console.log(`   T${before.turnIndex + 1} ${action.padEnd(11)} → T${now.turnIndex + 1}` +
      ` hp ${now.health}  drones ${now.drones}  over:${now.missionOver}  debrief:${now.debriefOpen}`);

    // A committing order must move the mission on; a probe must not.
    if (!now.missionOver && now.turnIndex === before.turnIndex) {
      ok(now.comms !== before.comms, `${label}: probe "${action}" answered with new information`);
      ok(now.health === before.health, `${label}: probe "${action}" cost no integrity`);
    } else if (!now.missionOver) {
      ok(now.turnIndex === before.turnIndex + 1,
        `${label}: "${action}" advanced exactly one turn (${before.turnIndex} → ${now.turnIndex})`);
      ok(/TURN \d \/ 6/.test(now.turnCount), `${label}: turn counter stays well-formed`);
      ok(now.turnName !== 'STANDBY', `${label}: turn ${now.turnIndex + 1} has a name`);
      ok(now.comms.length > 5, `${label}: AI made a recommendation on turn ${now.turnIndex + 1}`);
      ok(now.situation.length > 5 && now.task.length > 5,
        `${label}: turn ${now.turnIndex + 1} states the situation and the call`);
      ok(now.buttons.length > 0, `${label}: turn ${now.turnIndex + 1} offers commands`);
      ok(now.buttons.some((b) => !b.disabled), `${label}: turn ${now.turnIndex + 1} has a pressable command`);
      ok(now.turnMarks.length === now.turnIndex + 1,
        `${label}: one turn rule per turn in the log (${now.turnMarks.length} for turn ${now.turnIndex + 1})`);
      // The objective board has to agree with the mission, live.
      const relayRow = now.objectives.find((o) => o.id === 'relay');
      ok(relayRow?.state === (now.relayOnline ? 'done' : 'pending'),
        `${label}: relay objective reads "${relayRow?.state}" with relayOnline=${now.relayOnline}`);
    }

    ok(now.health >= 0 && now.health <= 100, `${label}: integrity stays in range (${now.health})`);
    ok(now.healthText === `${now.health}%`, `${label}: HUD integrity matches state (${now.healthText} vs ${now.health})`);
    ok(now.drones >= 0, `${label}: drone stock never goes negative`);
    ok(now.dronePips === now.drones, `${label}: drone pips match stock (${now.dronePips} vs ${now.drones})`);
    ok(now.logLines >= before.logLines, `${label}: mission log only grows within a run`);

    // Any button the game shows as unavailable must actually be unpressable.
    for (const b of now.buttons) {
      if (b.hint === 'NO DRONES') ok(b.disabled, `${label}: "NO DRONES" button is disabled, not just labelled`);
      if (b.hint === 'USED') ok(b.disabled, `${label}: spent probe "${b.action}" is disabled, not just labelled`);
    }
    if (now.drones === 0) {
      const drone = now.buttons.find((b) => b.action === 'SEND_DRONE');
      if (drone) ok(drone.disabled, `${label}: SEND DRONE is disabled once the rack is empty`);
    }

    prev = now;
    if (now.missionOver) break;
  }
  return { last: prev, seen };
}

// ---------------------------------------------------------------- go
const browser = await Browser.launch({ port: 9334, profile: '/tmp/ghostline-e2e-profile' });
let page;
try {
  page = await browser.open(`${URL_BASE}/?skip=1`);

  // ---- run A: the calibrated run. Should complete with the relay live.
  const a = await run(page, ['CONFIRM', 'SEND_DRONE', 'SEND_DRONE', 'CONFIRM', 'OVERRIDE', 'FALL_BACK'], 'careful run');

  const t3 = a.seen[2];
  ok(t3.before.source === 'BETA-1', `turn 3: the recommendation comes from BETA-1 (got "${t3.before.source}")`);
  ok(/ALPHA/.test(t3.before.relay), `turn 3: the line is shown as relayed via ALPHA (got "${t3.before.relay}")`);
  ok(t3.before.confidence === 'HIGH', `turn 3: stated confidence is HIGH`);
  ok(t3.before.unitStatus['BETA-1'] === 'glitch', `turn 3: BETA-1's sensor is visibly degraded before the player chooses`);
  ok(t3.before.suspect, `turn 3: the confidence meter is flagged suspect`);
  ok(/DEGRADED/.test(t3.before.confNote), `turn 3: "SOURCE DEGRADED" is on the meter (got "${t3.before.confNote}")`);
  ok(t3.before.statuses['BETA-1'] === 'glitch', `turn 3: the HUD carries BETA-1's glitch too`);

  const moved = a.seen.some((s) => JSON.stringify(s.before.unitPos) !== JSON.stringify(s.now.unitPos));
  ok(moved, `units physically execute the orders they are given`);

  try {
    await page.waitFor(() => !document.getElementById('screen-debrief').classList.contains('hidden'),
      { tries: 160, what: 'debrief' });
  } catch (e) { await diag(page, 'careful run: debrief never opened'); throw e; }
  const dbA = await page.eval(() => ({
    result: document.getElementById('mission-result').textContent,
    sub: document.getElementById('mission-sub').textContent,
    verdict: document.getElementById('verdict').textContent,
    keyLine: document.getElementById('key-turn-line').textContent,
    rows: [...document.querySelectorAll('#mode-rows .mode-row')].map((r) => ({
      name: r.querySelector('span').textContent.split('\n')[0].trim(),
      n: +r.querySelector('.n').textContent,
    })),
    decisions: document.querySelectorAll('#decision-list .d').length,
    head: document.getElementById('debrief-head').textContent,
    outcome: window.OP.state.outcome,
    relayOnline: window.OP.state.relayOnline,
    objectives: [...document.querySelectorAll('#objective .obj')]
      .map((o) => ({ id: o.dataset.objective, state: o.className.replace('obj ', '').split(' ')[0] })),
  }));
  ok(dbA.outcome === 'complete', `careful run: MISSION COMPLETE (got "${dbA.outcome}")`);
  ok(dbA.relayOnline, `careful run: the relay is live`);
  ok(/MISSION COMPLETE/.test(dbA.result), `careful run: debrief headline reads MISSION COMPLETE`);
  ok(dbA.decisions === 6, `careful run: debrief lists all six decisions (got ${dbA.decisions})`);
  ok(dbA.objectives.every((o) => o.state === 'done'),
    `careful run: both objectives read as met (${JSON.stringify(dbA.objectives)})`);
  ok(dbA.keyLine === '', `careful run: no turn-3 callout, because turn 3 was handled`);
  ok(dbA.verdict.length > 10, `careful run: a verdict line is written`);
  const totalA = dbA.rows.reduce((n, r) => n + r.n, 0);
  ok(totalA === 6, `careful run: calibration counts total six (got ${totalA})`);
  console.log(`   outcome ${dbA.outcome} · ${dbA.head}`);
  console.log(`   verdict "${dbA.verdict.slice(0, 78)}…"`);

  // ---- run B: replay from the debrief, then trust everything.
  await page.eval(() => document.getElementById('btn-replay').click());
  await page.waitFor(() => window.OP.state.turnIndex === 0 && !window.OP.state.missionOver,
    { tries: 60, what: 'mission restart' });
  // Checked here, not after the run: turn 3 of the replay reveals hostiles
  // again quite correctly, so the reset has to be measured before that.
  const leftovers = await page.eval(() => ({
    hostiles: window.OP.director.fx.hostiles.length,
    particles: window.OP.fx.active.length,
    doorY: +window.OP.director.level?.door?.position.y.toFixed(2),
  }));
  ok(leftovers.hostiles === 0, `replay: no hostile markers left over (found ${leftovers.hostiles})`);

  const b = await run(page, ['CONFIRM', 'CONFIRM', 'CONFIRM', 'CONFIRM', 'CONFIRM', 'CONFIRM'], 'all-CONFIRM run');

  const fresh = b.seen[0].before;
  ok(fresh.health === 100, `replay: integrity reset to 100 (got ${fresh.health})`);
  ok(fresh.drones === 2, `replay: drone rack refilled (got ${fresh.drones})`);
  ok(fresh.turnMarks.length === 1, `replay: mission log cleared (got ${fresh.turnMarks.length} turn rules)`);
  ok(fresh.objectives.every((o) => o.state === 'pending'), `replay: objective board reset to pending`);
  ok(Object.values(fresh.unitStatus).every((s) => s === 'healthy'), `replay: all sensors back to nominal`);
  ok(!fresh.relayOnline, `replay: relay is dark again`);

  await page.waitFor(() => !document.getElementById('screen-debrief').classList.contains('hidden'),
    { tries: 160, what: 'second debrief' });
  const dbB = await page.eval(() => ({
    outcome: window.OP.state.outcome,
    health: window.OP.state.health,
    result: document.getElementById('mission-result').textContent,
    verdict: document.getElementById('verdict').textContent,
    keyLine: document.getElementById('key-turn-line').textContent,
    objectives: [...document.querySelectorAll('#objective .obj')]
      .map((o) => ({ id: o.dataset.objective, state: o.className.replace('obj ', '').split(' ')[0] })),
    turn6situation: window.OP.turnManager.mission.turns[5].situation,
  }));
  ok(dbB.objectives.find((o) => o.id === 'relay')?.state === 'failed',
    `all-CONFIRM run: relay objective reads as failed`);
  ok(dbB.objectives.find((o) => o.id === 'extract')?.state === 'done',
    `all-CONFIRM run: the squad still got home — the two scores disagree, as designed`);
  ok(dbB.outcome === 'partial', `all-CONFIRM run: OBJECTIVE FAILED (got "${dbB.outcome}")`);
  ok(dbB.health > 0 && dbB.health < 100, `all-CONFIRM run: survives, but hurt (got ${dbB.health}%)`);
  ok(dbB.keyLine.length > 10, `all-CONFIRM run: turn 3 is called out by name`);
  ok(/never asked where it came from|confidence value/i.test(dbB.verdict),
    `all-CONFIRM run: verdict names complacency (got "${dbB.verdict.slice(0, 60)}…")`);
  console.log(`   outcome ${dbB.outcome} · ${dbB.health}% integrity`);
  console.log(`   key turn "${dbB.keyLine.slice(0, 78)}…"`);

  // ---- run C: ABORT at the objective. Ends the mission a turn early, which is
  // a different code path — the turn never advances, endMission fires straight
  // out of choose().
  await page.eval(() => document.getElementById('btn-replay').click());
  await page.waitFor(() => window.OP.state.turnIndex === 0 && !window.OP.state.missionOver,
    { tries: 60, what: 'mission restart for the abort run' });
  const c = await run(page, ['CONFIRM', 'SEND_DRONE', 'SEND_DRONE', 'CONFIRM', 'ABORT'], 'abort run');
  ok(c.last.missionOver, `abort run: ABORT ended the mission at turn 5`);
  ok(c.last.turnIndex === 4, `abort run: stopped on turn 5, never reached extraction (index ${c.last.turnIndex})`);

  await page.waitFor(() => !document.getElementById('screen-debrief').classList.contains('hidden'),
    { tries: 160, what: 'abort debrief' });
  const dbC = await page.eval(() => ({
    outcome: window.OP.state.outcome,
    result: document.getElementById('mission-result').textContent,
    decisions: document.querySelectorAll('#decision-list .d').length,
    objectives: [...document.querySelectorAll('#objective .obj')]
      .map((o) => ({ id: o.dataset.objective, state: o.className.replace('obj ', '').split(' ')[0] })),
  }));
  ok(dbC.outcome === 'aborted', `abort run: outcome is "aborted" (got "${dbC.outcome}")`);
  ok(/ABORT/.test(dbC.result), `abort run: debrief headline reads MISSION ABORTED (got "${dbC.result}")`);
  ok(dbC.decisions === 5, `abort run: five decisions graded, not six (got ${dbC.decisions})`);
  ok(dbC.objectives.find((o) => o.id === 'relay')?.state === 'failed',
    `abort run: relay objective failed`);
  ok(dbC.objectives.find((o) => o.id === 'extract')?.state === 'done',
    `abort run: the squad still came home`);
  console.log(`   outcome ${dbC.outcome} · ${dbC.decisions} decisions graded`);

  // ---- run D: restart in the middle of a beat. A tween killed mid-flight can
  // strand the promise playOutcome is awaiting; the stranded continuation used
  // to advance a turn in the mission that started after it.
  await page.eval(() => document.getElementById('btn-replay').click());
  await page.waitFor(() => window.OP.state.turnIndex === 0 && !window.OP.state.missionOver,
    { tries: 60, what: 'mission restart for the interrupt run' });
  await page.waitFor(ready, { tries: 240, what: 'turn 1 for the interrupt run' });

  console.log('\n── restart-mid-beat run');
  const interrupted = await page.eval(() => {
    document.querySelector('#commands button[data-action="SEND_DRONE"]').click();
    return window.OP.director.busy;
  });
  ok(interrupted, 'restart-mid-beat: the order was accepted and a beat is playing');
  // Yank the mission out from under it, the way PAUSE > RESTART does.
  await page.eval(() => window.OP.startMission());
  await page.waitFor(ready, { tries: 240, what: 'turn 1 after the interrupt' });

  const afterRestart = await page.eval(snapshot);
  ok(afterRestart.turnIndex === 0, `restart-mid-beat: new mission is on turn 1 (got ${afterRestart.turnIndex + 1})`);
  ok(afterRestart.health === 100, `restart-mid-beat: integrity reset (got ${afterRestart.health})`);
  ok(afterRestart.drones === 2, `restart-mid-beat: drone rack refilled (got ${afterRestart.drones})`);

  // The real check: give the stranded beat time to land and confirm it does not
  // silently advance the new mission past turn 1.
  await new Promise((r) => setTimeout(r, 12000));
  const settled = await page.eval(snapshot);
  ok(settled.turnIndex === 0,
    `restart-mid-beat: a stale beat did not skip a turn (still turn ${settled.turnIndex + 1})`);
  ok(!settled.debriefOpen, 'restart-mid-beat: no stale debrief dropped over the new mission');
  ok(settled.turnMarks.length === 1,
    `restart-mid-beat: log shows one turn, not two (got ${settled.turnMarks.length})`);
  console.log(`   survived the interrupt · still turn ${settled.turnIndex + 1}, ${settled.health}%`);

  // ---- the browser's own complaints
  const noisy = page.consoleErrors.concat(page.pageErrors)
    .filter((e) => !/favicon|Autoplay|AudioContext|user gesture|SwiftShader|GroupMarker|404/i.test(e));
  ok(noisy.length === 0, `no page exceptions or console errors:\n      ${noisy.slice(0, 5).join('\n      ')}`);
  const missing = [...new Set(page.failedRequests)].filter((r) => !/favicon/i.test(r));
  ok(missing.length === 0, `every asset the game asks for exists:\n      ${missing.slice(0, 8).join('\n      ')}`);
} finally {
  browser.close();
  statics?.server.close();
}

console.log(`\n  assertions ${checks}`);
if (failures.length) {
  console.error(`\nFAIL — ${failures.length}:`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`\nPASS — full mission flow verified in Chromium.\n`);
