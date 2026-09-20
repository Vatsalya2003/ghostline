// Exhaustive walk of the turn spine. Enumerates every committing-action path
// through the mission, exercises every probe, and asserts the invariants the
// demo depends on. Pure logic — no DOM, no Three.js. Run:  node scripts/verify.mjs
import { mission1, CALIBRATION, ACTION_LABELS, CONFIDENCE } from '../src/data/mission1.js';
import { MISSIONS } from '../src/data/missions.js';
import { GameState } from '../src/systems/GameState.js';
import { TurnManager } from '../src/systems/TurnManager.js';
import { events, GAME_EVENT } from '../src/systems/Events.js';
import { readFileSync } from 'node:fs';

const TAGS = new Set(Object.values(CALIBRATION));
const ENDINGS = new Set(['complete', 'partial', 'aborted', 'lost']);

let checks = 0;
const failures = [];
// Which mission a failing assertion belongs to. The data-shape pass runs over
// every mission in the registry, so "turn 3 CONFIRM has a debrief note" has to
// say which mission's turn 3 it means.
let scope = '';
function ok(cond, msg) {
  checks += 1;
  if (!cond) failures.push(scope ? `${scope} — ${msg}` : msg);
  return !!cond;
}

// ---------------------------------------------------------------- data shape
// Content errors are the cheapest thing to catch and the most likely thing a
// new mission introduces, so they are checked before any path is walked.
//
// Runs over EVERY mission in the registry rather than just the one the path
// walk below exercises — the whole promise of the architecture is that a new
// mission is a data file, and this is the pass that holds a data file to it.
function checkData(m) {
  ok(m.turns.length > 0, 'mission has turns');
  ok(typeof m.objective === 'string' && m.objective, 'mission has an objective');
  ok(m.turns.some((t) => t.id === m.keyTurn), `keyTurn ${m.keyTurn} names a real turn`);
  ok(typeof m.keyTurnVerdict === 'string' && m.keyTurnVerdict, 'keyTurnVerdict copy exists');

  for (const tag of TAGS) {
    ok(typeof m.verdicts[tag] === 'string' && m.verdicts[tag], `verdict copy for "${tag}"`);
    ok(m.failureModeCopy[tag]?.name, `debrief row copy for "${tag}"`);
  }

  ok(Array.isArray(m.objectives) && m.objectives.length > 0, 'mission declares objectives');
  for (const o of m.objectives || []) {
    ok(!!o.id && !!o.label, `objective "${o.id}" has an id and a label`);
    ok(!!o.flag || !!o.survive, `objective "${o.id}" says how it is met (flag or survive)`);
  }

  // ---------------------------------------------------------------- the squad
  // A roster the engine cannot read is a squad with no state behind it, which
  // is the failure this whole layer exists to prevent.
  const roster = m.roster || m.fleet;
  ok(!!roster && Object.keys(roster).length > 0, 'mission declares a roster');
  const unitIds = new Set(Object.keys(roster || {}));
  const payloadKinds = new Set();
  for (const [id, spec] of Object.entries(roster || {})) {
    ok(typeof (spec.integrity ?? m.startHealth) === 'number', `roster "${id}" starts with integrity`);
    for (const [kind, n] of Object.entries(spec.ammo || {})) {
      ok(typeof n === 'number' && n >= 0, `roster "${id}" payload "${kind}" is a count`);
      payloadKinds.add(kind);
    }
  }
  ok(typeof m.criticalIntegrity === 'number', 'mission says what counts as critical damage');

  // Every mechanical field an outcome declares has to name something real —
  // a unit that exists, a payload the squad actually carries. A typo here is
  // a resource that silently never gets spent.
  for (const turn of m.turns) {
    for (const [action, o] of Object.entries(turn.outcomes)) {
      const what = `turn ${turn.id} ${action}`;
      for (const variant of [o, o.altIfHealthAbove, o.altIfHealthBelow, ...(o.variants || [])].filter(Boolean)) {
        for (const [kind, n] of Object.entries(variant.spends || {})) {
          ok(kind === 'drones' || payloadKinds.has(kind), `${what}: spends "${kind}", which the squad carries`);
          ok(typeof n === 'number' && n > 0, `${what}: spends a positive amount of "${kind}"`);
        }
        for (const id of [variant.unitLost, variant.losesUnit, variant.unitDisabled,
          variant.disablesUnit, variant.requiresUnit, variant.impactUnit].flat()) {
          if (id) ok(unitIds.has(id), `${what}: names unit "${id}", which is on the roster`);
        }
        for (const id of Object.keys(variant.damages || {})) {
          ok(unitIds.has(id), `${what}: damages "${id}", which is on the roster`);
        }
      }
      for (const v of o.variants || []) {
        ok(!!v.when || !!v.unless, `${what}: outcome variant states a condition`);
        ok(Object.keys(v).some((k) => k !== 'when' && k !== 'unless'), `${what}: outcome variant overrides something`);
      }
    }
  }

  for (const turn of m.turns) {
    const where = `turn ${turn.id} (${turn.name})`;
    for (const v of turn.variants || []) {
      ok(!!v.when || !!v.unless, `${where}: variant states a condition`);
      const keys = Object.keys(v).filter((k) => k !== 'when' && k !== 'unless');
      ok(keys.length > 0, `${where}: variant overrides something`);
      for (const k of keys) ok(k in turn, `${where}: variant key "${k}" exists on the turn`);
    }
    ok(typeof turn.situation === 'string' && turn.situation, `${where}: has situation text`);
    ok(typeof turn.task === 'string' && turn.task, `${where}: has task text`);
    ok(CONFIDENCE[turn.ai?.confidence], `${where}: ai.confidence "${turn.ai?.confidence}" is a known level`);
    ok(typeof turn.ai?.line === 'string' && turn.ai.line, `${where}: ai has a line`);

    for (const action of turn.actions) {
      ok(ACTION_LABELS[action], `${where}: action "${action}" has a button label`);
      ok(turn.outcomes[action], `${where}: action "${action}" has an outcome`);
    }
    for (const action of Object.keys(turn.outcomes)) {
      ok(turn.actions.includes(action), `${where}: outcome "${action}" is offered in actions`);
    }

    const committing = turn.actions.filter((a) => turn.outcomes[a]?.consumesTurn !== false);
    ok(committing.length > 0, `${where}: has at least one turn-ending action`);

    for (const action of turn.actions) {
      const o = turn.outcomes[action];
      const what = `${where}: ${action}`;
      if (o.consumesTurn === false) {
        ok(typeof o.response === 'string' && o.response, `${what}: probe has a response`);
        ok(!o.tag, `${what}: probe is ungraded`);
        ok(!o.healthDelta, `${what}: probe costs no health`);
      } else {
        ok(TAGS.has(o.tag), `${what}: graded with a known tag (got "${o.tag}")`);
        ok(typeof o.note === 'string' && o.note, `${what}: has a debrief note`);
        ok(typeof o.log === 'string' && o.log, `${what}: has a mission-log line`);
        for (const alt of [o.altIfHealthAbove, o.altIfHealthBelow].filter(Boolean)) {
          ok(typeof alt.threshold === 'number', `${what}: health variant has a threshold`);
          ok(TAGS.has(alt.tag ?? o.tag), `${what}: health variant tag is known`);
          ok(typeof (alt.note ?? o.note) === 'string', `${what}: health variant has a note`);
        }
        if (o.endsMission) ok(ENDINGS.has(o.endsMission), `${what}: endsMission "${o.endsMission}" is a known ending`);
      }
    }
  }
}

// ---------------------------------------------------------------- voice
// Clips are keyed by the exact line text, so editing a word in mission1.js
// silently orphans its clip and that line falls back to Web Speech — which on
// a machine with no speech engine is silence. Cheapest possible guard: every
// spoken line must still resolve to a clip.
//   Re-bake after any dialogue edit:  node scripts/build-voice.mjs
function spokenLines() {
  const out = [];
  for (const turn of mission1.turns) {
    out.push({ where: `turn ${turn.id} AI line`, text: turn.ai.line });
    for (const [action, o] of Object.entries(turn.outcomes)) {
      const variants = [['', o], ['/high', o.altIfHealthAbove], ['/low', o.altIfHealthBelow],
        ...(o.variants || []).map((v, i) => [`/variant${i}`, v])];
      for (const [label, variant] of variants) {
        if (variant?.response) {
          out.push({ where: `turn ${turn.id} ${action}${label} response`, text: variant.response });
        }
      }
    }
  }
  return out;
}

function checkVoice() {
  const manifestPath = new URL('../public/voice/manifest.json', import.meta.url);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    // No baked voice in this checkout — Web Speech covers it. Not a failure.
    console.log('  voice             no manifest, skipped');
    return;
  }
  const have = new Set(Object.keys(manifest.lines || {}));
  const lines = spokenLines();
  let missing = 0;
  for (const { where, text } of lines) {
    if (!ok(have.has(text), `${where}: has a baked voice clip — re-run scripts/build-voice.mjs`)) missing += 1;
  }
  console.log(`  voice             ${lines.length - missing} / ${lines.length} lines baked`);
}

// ---------------------------------------------------------------- path walk
const endings = {};
const tagTotals = {};
const seenOutcomes = new Set();
const lostSeen = new Set();
const disabledSeen = new Set();
const ROSTER_SIZE = Object.keys(mission1.roster || mission1.fleet || {}).length;
let paths = 0;
let deepestHealth = 100;

function walk(plan) {
  const state = new GameState(mission1);
  const tm = new TurnManager(mission1, state);

  // Listen on the shared bus so the integration hooks are exercised on every
  // path, not just asserted to exist.
  const heard = {};
  const offs = Object.values(GAME_EVENT).map((name) =>
    events.on(name, () => { heard[name] = (heard[name] || 0) + 1; }));

  tm.start();
  ok(heard[GAME_EVENT.MISSION_START] === 1, `[${plan.join(' > ')}]: missionStart fired once`);

  for (const action of plan) {
    if (state.missionOver) break;
    const turn = tm.turn;
    const where = `[${plan.join(' > ')}] turn ${turn.id}`;

    // Every turn must leave the player something they can actually press.
    const enabled = tm.availableActions().filter((a) => !a.disabled && !a.probe);
    ok(enabled.length > 0, `${where}: at least one command is pressable`);

    // Probes first: information without spending the turn, and only once each.
    for (const probe of tm.availableActions().filter((a) => a.probe && !a.disabled)) {
      const before = { turn: state.turnIndex, health: state.health, graded: state.calibration.length };
      const res = tm.choose(probe.action);
      ok(res?.probe === true, `${where}: ${probe.action} resolves as a probe`);
      ok(state.turnIndex === before.turn, `${where}: ${probe.action} did not advance the turn`);
      ok(state.health === before.health, `${where}: ${probe.action} did not change health`);
      ok(state.calibration.length === before.graded, `${where}: ${probe.action} was not graded`);
      ok(tm.choose(probe.action) === null, `${where}: ${probe.action} cannot be spent twice`);
    }

    // The extraction turn must not claim the relay is handled when it is dark.
    if (turn.variants) {
      const raw = mission1.turns.find((t) => t.id === turn.id);
      const swapped = turn.situation !== raw.situation || turn.task !== raw.task;
      ok(swapped === !state.relayOnline,
        `${where}: turn text matches mission state (relayOnline=${state.relayOnline})`);
    }

    const before = {
      drones: state.drones,
      graded: state.calibration.length,
      resources: state.resources(),
      integrity: Object.fromEntries(state.roster().map((u) => [u.id, u.integrity])),
      down: new Set(state.roster().filter((u) => !u.operational).map((u) => u.id)),
    };
    const issued = heard[GAME_EVENT.COMMAND_ISSUED] || 0;
    const res = tm.choose(action);
    if (!res) continue;                       // not offered on this turn; skip
    ok((heard[GAME_EVENT.COMMAND_ISSUED] || 0) === issued + 1,
      `${where}: commandIssued fired once for "${action}"`);
    ok((heard[action === 'CONFIRM' ? GAME_EVENT.PLAYER_CONFIRMED : GAME_EVENT.PLAYER_REJECTED] || 0) > 0,
      `${where}: "${action}" announced as ${action === 'CONFIRM' ? 'confirmed' : 'rejected'}`);
    seenOutcomes.add(`${turn.id}:${action}`);

    ok(res.probe === false, `${where}: ${action} commits the turn`);
    ok(state.calibration.length === before.graded + 1, `${where}: ${action} recorded exactly one grade`);
    ok(state.drones >= 0, `${where}: drone stock never goes negative (got ${state.drones})`);
    ok(state.drones <= before.drones, `${where}: drone stock never increases`);
    ok(state.health >= 0 && state.health <= 100, `${where}: health stays in range (got ${state.health})`);
    deepestHealth = Math.min(deepestHealth, state.health);

    // ------------------------------------------------------ the squad itself
    // SQUAD INTEGRITY is a summary of three machines, not a pool of its own:
    // if the bar and the roster can disagree, per-unit damage is decorative.
    const roster = state.roster();
    ok(roster.length === ROSTER_SIZE, `${where}: the squad is still ${ROSTER_SIZE} machines (got ${roster.length})`);
    ok(state.health === Math.round(roster.reduce((n, u) => n + u.integrity, 0) / roster.length),
      `${where}: squad integrity is the average of the units (bar ${state.health})`);
    for (const u of roster) {
      ok(u.integrity >= 0 && u.integrity <= u.maxIntegrity,
        `${where}: ${u.id} integrity in range (got ${u.integrity})`);
      ok(u.integrity <= before.integrity[u.id], `${where}: ${u.id} never repairs itself mid-mission`);
      if (!u.operational) {
        ok(u.integrity === 0, `${where}: ${u.id} is ${u.state} with zero integrity (got ${u.integrity})`);
        ok(u.sensor === 'damaged', `${where}: ${u.id} reads DAMAGED while it is ${u.state}`);
      }
      // Out is out. A wreck that quietly returns to duty would make every
      // decision downstream of losing it meaningless.
      if (before.down.has(u.id)) ok(!u.operational, `${where}: ${u.id} stays down once it is down`);
      if (u.state === 'lost') lostSeen.add(u.id);
      if (u.state === 'disabled') disabledSeen.add(u.id);
    }
    for (const [kind, n] of Object.entries(state.resources())) {
      ok(n >= 0, `${where}: "${kind}" never goes negative (got ${n})`);
      ok(n <= before.resources[kind], `${where}: "${kind}" never refills mid-mission`);
    }

    if (!state.missionOver) tm.advanceTurn();
  }
  if (!state.missionOver) tm.endMission(tm.completionOutcome());

  // ------------------------------------------------------------ the summary
  const s = state.summary();
  const trail = `[${plan.join(' > ')}]`;
  ok(ENDINGS.has(s.outcome), `${trail}: ends with a known outcome (got "${s.outcome}")`);
  ok(typeof s.verdict === 'string' && s.verdict, `${trail}: debrief has a verdict line`);
  ok(s.health >= 0 && s.health <= 100, `${trail}: final health in range`);

  const graded = s.decisions.length;
  const counted = Object.values(s.counts).reduce((a, b) => a + b, 0);
  ok(counted === graded, `${trail}: debrief counts (${counted}) match decisions made (${graded})`);

  // The two-score rule: praise is only ever for a run with no failures.
  const failures_ = graded - (s.counts[CALIBRATION.CALIBRATED] || 0);
  if (s.dominant === CALIBRATION.CALIBRATED) {
    ok(failures_ === 0, `${trail}: "calibrated" verdict only on a clean run (had ${failures_} failures)`);
  } else {
    ok(failures_ > 0, `${trail}: a failure verdict implies at least one failure`);
    ok(s.counts[s.dominant] > 0, `${trail}: named failure mode "${s.dominant}" was actually scored`);
  }

  // The mission names turn 3 as its lesson. Failing it must be flagged.
  const keyEntry = s.decisions.find((d) => d.turn === mission1.keyTurn);
  const keyFailed = !!keyEntry && keyEntry.tag !== CALIBRATION.CALIBRATED;
  ok(s.keyTurnFailed === keyFailed, `${trail}: key-turn flag matches what happened on turn ${mission1.keyTurn}`);
  ok(!!s.keyTurnLine === keyFailed, `${trail}: key-turn callout present exactly when the key turn failed`);

  // Surviving is not the same as succeeding: only a live relay completes.
  if (s.outcome === 'complete') ok(s.relayOnline, `${trail}: MISSION COMPLETE implies the relay came up`);
  if (s.outcome === 'lost') ok(s.health === 0, `${trail}: SQUAD LOST implies zero integrity`);

  // ------------------------------------------------------------ objectives
  const objectives = Object.fromEntries(s.objectives.map((o) => [o.id, o.state]));
  ok(s.objectives.length === mission1.objectives.length, `${trail}: every objective is reported`);
  ok(objectives.relay === (s.relayOnline ? 'done' : 'failed'),
    `${trail}: relay objective matches the relay (${objectives.relay}, online=${s.relayOnline})`);
  ok(objectives.extract === (s.outcome === 'lost' || s.losses.length ? 'failed' : 'done'),
    `${trail}: extraction objective matches the squad (${objectives.extract}, outcome=${s.outcome}, lost=${s.losses.length})`);
  ok(s.objectives.every((o) => o.state !== 'pending'), `${trail}: no objective is left pending`);
  // MISSION COMPLETE must mean both objectives met, and nothing less.
  ok((s.outcome === 'complete') === s.objectives.every((o) => o.state === 'done'),
    `${trail}: MISSION COMPLETE agrees with the objective board`);

  // ------------------------------------------------------- squad consequence
  // The ending has to describe the squad that actually finished the mission.
  ok(s.units.length === ROSTER_SIZE, `${trail}: every machine is still reported at the debrief`);
  ok(s.losses.every((id) => s.units.find((u) => u.id === id)?.state === 'lost'),
    `${trail}: the loss list agrees with the roster`);
  ok(s.recovered.length + s.losses.length === ROSTER_SIZE,
    `${trail}: every machine is either recovered or lost`);
  ok(s.extracted === (s.outcome !== 'lost'), `${trail}: extraction flag matches the ending`);
  if (s.outcome === 'lost') ok(s.losses.length === ROSTER_SIZE, `${trail}: SQUAD LOST means nothing came home`);
  if (s.outcome === 'complete') {
    ok(s.losses.length === 0, `${trail}: MISSION COMPLETE implies the whole squad came home`);
  }
  for (const [kind, n] of Object.entries(s.resources)) {
    ok(n >= 0, `${trail}: "${kind}" ends non-negative (got ${n})`);
  }

  // ------------------------------------------------------------ hooks
  ok(heard[GAME_EVENT.MISSION_END] === 1, `${trail}: missionEnd fired once`);
  ok((heard[GAME_EVENT.MISSION_SUCCESS] || 0) + (heard[GAME_EVENT.MISSION_FAILURE] || 0) === 1,
    `${trail}: exactly one of missionSuccess / missionFailure fired`);
  ok(!!heard[GAME_EVENT.MISSION_SUCCESS] === (s.outcome === 'complete'),
    `${trail}: missionSuccess fires only on a completed objective`);
  ok((heard[GAME_EVENT.TURN_START] || 0) === (heard[GAME_EVENT.AI_RECOMMENDATION] || 0),
    `${trail}: every turn carried an AI recommendation`);
  ok((heard[GAME_EVENT.OBJECTIVE_COMPLETED] || 0) + (heard[GAME_EVENT.OBJECTIVE_FAILED] || 0)
     === mission1.objectives.length,
    `${trail}: each objective resolved exactly once`);
  for (const off of offs) off();

  endings[s.outcome] = (endings[s.outcome] || 0) + 1;
  for (const [tag, n] of Object.entries(s.counts)) tagTotals[tag] = (tagTotals[tag] || 0) + n;
  paths += 1;
}

function enumerate(index, plan) {
  const turn = mission1.turns[index];
  if (!turn) return walk(plan);
  const committing = turn.actions.filter((a) => turn.outcomes[a].consumesTurn !== false);
  for (const action of committing) {
    if (turn.outcomes[action].endsMission) walk([...plan, action]);
    else enumerate(index + 1, [...plan, action]);
  }
}

// ---------------------------------------------------------------- run
for (const entry of MISSIONS) {
  scope = entry.name;
  checkData(entry.mission);
}
scope = '';
enumerate(0, []);

const totalOutcomes = mission1.turns.reduce(
  (n, t) => n + t.actions.filter((a) => t.outcomes[a].consumesTurn !== false).length, 0);

console.log(`\nGHOSTLINE — turn spine verification`);
console.log(`  paths walked      ${paths}`);
console.log(`  assertions        ${checks}`);
console.log(`  outcomes covered  ${seenOutcomes.size} / ${totalOutcomes}`);
console.log(`  lowest health     ${deepestHealth}%`);
console.log(`  endings reached   ${Object.entries(endings).map(([k, v]) => `${k}:${v}`).join('  ')}`);
console.log(`  squad             ${ROSTER_SIZE} machines · disabled on some path: ${[...disabledSeen].join(', ') || 'none'} · lost: ${[...lostSeen].join(', ') || 'none'}`);
checkVoice();
console.log(`  grades scored     ${Object.entries(tagTotals).map(([k, v]) => `${k}:${v}`).join('  ')}`);

ok(seenOutcomes.size === totalOutcomes, `every turn-ending outcome is reachable`);
for (const ending of ENDINGS) ok(endings[ending] > 0, `ending "${ending}" is reachable`);
for (const tag of TAGS) ok(tagTotals[tag] > 0, `grade "${tag}" is reachable`);
// Losing a machine has to be something the mission can actually do to you, or
// the disabled/lost states are scenery.
ok(disabledSeen.size > 0, 'a machine can be disabled somewhere in the mission');
ok(lostSeen.size > 0, 'a machine can be lost somewhere in the mission');

if (failures.length) {
  const shown = [...new Set(failures)].slice(0, 25);
  console.error(`\nFAIL — ${failures.length} assertion(s), ${new Set(failures).size} distinct:`);
  for (const f of shown) console.error(`  · ${f}`);
  if (new Set(failures).size > shown.length) console.error(`  · …and ${new Set(failures).size - shown.length} more`);
  process.exit(1);
}
console.log(`\nPASS — ${checks} assertions, no failures.\n`);
