// Exhaustive walk of the turn spine. Enumerates every committing-action path
// through the mission, exercises every probe, and asserts the invariants the
// demo depends on. Pure logic — no DOM, no Three.js. Run:  node scripts/verify.mjs
import { CALIBRATION, ACTION_LABELS, CONFIDENCE } from '../src/data/mission1.js';
import { MISSIONS } from '../src/data/missions.js';
import { GameState } from '../src/systems/GameState.js';
import { TurnManager } from '../src/systems/TurnManager.js';
import { events, GAME_EVENT } from '../src/systems/Events.js';
import { readFileSync } from 'node:fs';

const TAGS = new Set(Object.values(CALIBRATION));
const ENDINGS = new Set(['complete', 'partial', 'aborted', 'lost']);

let checks = 0;
const failures = [];
function ok(cond, msg) {
  checks += 1;
  if (!cond) failures.push(msg);
  return !!cond;
}

// ---------------------------------------------------------------- data shape
// Content errors are the cheapest thing to catch and the most likely thing a
// new mission introduces, so they are checked before any path is walked.
function checkData(mission) {
  const m = mission;
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
function spokenLines(mission) {
  const out = [];
  for (const turn of mission.turns) {
    out.push({ where: `turn ${turn.id} AI line`, text: turn.ai.line });
    for (const [action, o] of Object.entries(turn.outcomes)) {
      for (const [label, variant] of [['', o], ['/high', o.altIfHealthAbove], ['/low', o.altIfHealthBelow]]) {
        if (variant?.response) {
          out.push({ where: `turn ${turn.id} ${action}${label} response`, text: variant.response });
        }
      }
    }
  }
  return out;
}

function checkVoice(mission) {
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
  const lines = spokenLines(mission);
  const baked = lines.filter(({ text }) => have.has(text)).length;

  // A mission with no clips at all is an unbaked mission, not a broken one —
  // it runs on Web Speech and captions, which is a supported path. Asserting
  // per line would turn "we have not baked mission 3 yet" into 78 failures
  // and bury anything real. A PARTIALLY baked mission is the dangerous case:
  // it means a line was edited after the bake and its clip is now orphaned.
  if (baked === 0) {
    console.log(`    voice             not baked — Web Speech + captions`);
    return;
  }
  let missing = 0;
  for (const { where, text } of lines) {
    if (!ok(have.has(text), `${where}: has a baked voice clip — re-run scripts/build-voice.mjs`)) missing += 1;
  }
  console.log(`    voice             ${lines.length - missing} / ${lines.length} lines baked`);
}

// ---------------------------------------------------------------- path walk
const endings = {};
const tagTotals = {};
const seenOutcomes = new Set();
let paths = 0;
let deepestHealth = 100;

function walk(mission, plan) {
  const state = new GameState(mission);
  const tm = new TurnManager(mission, state);

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

    // A turn with variants must not describe a world it is not in — the
    // extraction turn cannot claim the relay is handled when it is dark. The
    // flag being tested comes from the variant's own `unless`, so this holds
    // for any mission rather than only for the one that has a relay.
    if (turn.variants) {
      const raw = mission.turns.find((t) => t.id === turn.id);
      const swapped = turn.situation !== raw.situation || turn.task !== raw.task;
      const flag = raw.variants.find((v) => v.unless)?.unless;
      if (flag) {
        ok(swapped === !state[flag],
          `${where}: turn text matches mission state (${flag}=${!!state[flag]})`);
      }
    }

    const before = { drones: state.drones, graded: state.calibration.length };
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

    if (!state.missionOver) tm.advanceTurn();
  }
  // The walk can stop short of the last turn when a plan is truncated. End it
  // the way advanceTurn would, from the mission's own primary objective.
  if (!state.missionOver) tm.endMission(tm.primaryObjectiveMet() ? 'complete' : 'partial');

  // ------------------------------------------------------------ the summary
  // summary() only carries mission 1's relayOnline flag by name, so every
  // flag-based assertion below reads the live state instead. Keeping that out
  // of GameState is deliberate: the turn spine is correct and this is a
  // property of the test, not of the game.
  const flags = Object.fromEntries(
    (mission.objectives || []).filter((o) => o.flag).map((o) => [o.flag, !!state[o.flag]]));
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
  const keyEntry = s.decisions.find((d) => d.turn === mission.keyTurn);
  const keyFailed = !!keyEntry && keyEntry.tag !== CALIBRATION.CALIBRATED;
  ok(s.keyTurnFailed === keyFailed, `${trail}: key-turn flag matches what happened on turn ${mission.keyTurn}`);
  ok(!!s.keyTurnLine === keyFailed, `${trail}: key-turn callout present exactly when the key turn failed`);

  // Surviving is not the same as succeeding: only the primary objective
  // completes a run. Which flag that is comes from the mission, so this holds
  // for a relay, a resolved anomaly or a flattened depot alike.
  const primary = (mission.objectives || []).find((o) => o.flag);
  if (s.outcome === 'complete' && primary) {
    ok(flags[primary.flag],
      `${trail}: MISSION COMPLETE implies ${primary.id} (${primary.flag}) is set`);
  }
  if (s.outcome === 'lost') ok(s.health === 0, `${trail}: SQUAD LOST implies zero integrity`);

  // ------------------------------------------------------------ objectives
  const objectives = Object.fromEntries(s.objectives.map((o) => [o.id, o.state]));
  ok(s.objectives.length === mission.objectives.length, `${trail}: every objective is reported`);
  // Every flagged objective must agree with the state flag that drives it.
  for (const o of (mission.objectives || []).filter((x) => x.flag)) {
    ok(objectives[o.id] === (flags[o.flag] ? 'done' : 'failed'),
      `${trail}: objective "${o.id}" matches flag ${o.flag} (${objectives[o.id]}, flag=${flags[o.flag]})`);
  }
  // …and every survive-based objective with whether the squad came home.
  const survivor = (mission.objectives || []).find((x) => x.survive);
  if (survivor) ok(objectives[survivor.id] === (s.outcome === 'lost' ? 'failed' : 'done'),
    `${trail}: "${survivor.id}" matches the ending (${objectives[survivor.id]}, outcome=${s.outcome})`);
  ok(s.objectives.every((o) => o.state !== 'pending'), `${trail}: no objective is left pending`);
  // MISSION COMPLETE must mean every objective met, and nothing less.
  ok((s.outcome === 'complete') === s.objectives.every((o) => o.state === 'done'),
    `${trail}: MISSION COMPLETE agrees with the objective board`);

  // ------------------------------------------------------------ hooks
  ok(heard[GAME_EVENT.MISSION_END] === 1, `${trail}: missionEnd fired once`);
  ok((heard[GAME_EVENT.MISSION_SUCCESS] || 0) + (heard[GAME_EVENT.MISSION_FAILURE] || 0) === 1,
    `${trail}: exactly one of missionSuccess / missionFailure fired`);
  ok(!!heard[GAME_EVENT.MISSION_SUCCESS] === (s.outcome === 'complete'),
    `${trail}: missionSuccess fires only on a completed objective`);
  ok((heard[GAME_EVENT.TURN_START] || 0) === (heard[GAME_EVENT.AI_RECOMMENDATION] || 0),
    `${trail}: every turn carried an AI recommendation`);
  ok((heard[GAME_EVENT.OBJECTIVE_COMPLETED] || 0) + (heard[GAME_EVENT.OBJECTIVE_FAILED] || 0)
     === mission.objectives.length,
    `${trail}: each objective resolved exactly once`);
  for (const off of offs) off();

  endings[s.outcome] = (endings[s.outcome] || 0) + 1;
  for (const [tag, n] of Object.entries(s.counts)) tagTotals[tag] = (tagTotals[tag] || 0) + n;
  paths += 1;
}

// Full enumeration is 3^n-ish in the number of turns. Six turns is 1,344
// paths and runs in two seconds; ten turns is about a quarter of a million and
// would run for minutes, which means nobody would run it. So: enumerate up to
// a budget, and then guarantee the coverage assertions separately by walking
// one targeted path per outcome. The invariants the demo rests on — every
// outcome reachable, every ending reachable, every grade reachable — stay
// genuinely proven rather than sampled.
let truncated = false;

function enumerate(mission, index, plan) {
  if (paths >= PATH_BUDGET) { truncated = true; return; }
  const turn = mission.turns[index];
  if (!turn) return walk(mission, plan);
  const committing = turn.actions.filter((a) => turn.outcomes[a].consumesTurn !== false);
  for (const action of committing) {
    if (paths >= PATH_BUDGET) { truncated = true; return; }
    if (turn.outcomes[action].endsMission) walk(mission, [...plan, action]);
    else enumerate(mission, index + 1, [...plan, action]);
  }
}

// The cheapest committing action on a turn — used to build a filler route to
// whichever turn we actually want to test.
function defaultAction(turn) {
  const committing = turn.actions.filter((a) => turn.outcomes[a].consumesTurn !== false);
  return committing.find((a) => !turn.outcomes[a].endsMission) || committing[0];
}

// One walk per outcome: fill the turns before it with defaults, take the
// outcome under test, then fill the rest. Guarantees outcome, ending and
// grade coverage regardless of whether enumeration was truncated.
function coverEveryOutcome(mission) {
  for (let i = 0; i < mission.turns.length; i++) {
    const turn = mission.turns[i];
    const committing = turn.actions.filter((a) => turn.outcomes[a].consumesTurn !== false);
    for (const action of committing) {
      const plan = [];
      for (let j = 0; j < i; j++) plan.push(defaultAction(mission.turns[j]));
      plan.push(action);
      if (!turn.outcomes[action].endsMission) {
        for (let j = i + 1; j < mission.turns.length; j++) plan.push(defaultAction(mission.turns[j]));
      }
      walk(mission, plan);
    }
  }
}

// ---------------------------------------------------------------- run
const PATH_BUDGET = Number(process.env.GHOSTLINE_PATHS || 40000);

console.log(`\nGHOSTLINE — turn spine verification`);

for (const entry of MISSIONS) {
  const mission = entry.mission;
  const before = { paths, checks };
  truncated = false;
  seenOutcomes.clear();
  Object.keys(endings).forEach((k) => delete endings[k]);
  Object.keys(tagTotals).forEach((k) => delete tagTotals[k]);
  deepestHealth = 100;

  checkData(mission);
  enumerate(mission, 0, []);
  coverEveryOutcome(mission);

  const totalOutcomes = mission.turns.reduce(
    (n, t) => n + t.actions.filter((a) => t.outcomes[a].consumesTurn !== false).length, 0);

  console.log(`\n  ${entry.name}  (${mission.turns.length} turns)`);
  console.log(`    paths walked      ${paths - before.paths}${truncated ? ` (capped at ${PATH_BUDGET})` : ''}`);
  console.log(`    assertions        ${checks - before.checks}`);
  console.log(`    outcomes covered  ${seenOutcomes.size} / ${totalOutcomes}`);
  console.log(`    lowest health     ${deepestHealth}%`);
  console.log(`    endings reached   ${Object.entries(endings).map(([k, v]) => `${k}:${v}`).join('  ')}`);
  checkVoice(mission);
  console.log(`    grades scored     ${Object.entries(tagTotals).map(([k, v]) => `${k}:${v}`).join('  ')}`);

  ok(seenOutcomes.size === totalOutcomes, `${entry.name}: every turn-ending outcome is reachable`);
  for (const tag of TAGS) ok(tagTotals[tag] > 0, `${entry.name}: grade "${tag}" is reachable`);
  // Not every mission can reach every ending — a mission with no ABORT cannot
  // be aborted — so this asserts the ones its own data actually offers.
  for (const ending of ENDINGS) {
    const offered = ending !== 'aborted'
      || mission.turns.some((t) => Object.values(t.outcomes).some((o) => o.endsMission && o.tag));
    if (offered) ok(endings[ending] > 0, `${entry.name}: ending "${ending}" is reachable`);
  }
}

if (failures.length) {
  const shown = [...new Set(failures)].slice(0, 25);
  console.error(`\nFAIL — ${failures.length} assertion(s), ${new Set(failures).size} distinct:`);
  for (const f of shown) console.error(`  · ${f}`);
  if (new Set(failures).size > shown.length) console.error(`  · …and ${new Set(failures).size - shown.length} more`);
  process.exit(1);
}
console.log(`\nPASS — ${checks} assertions across ${MISSIONS.length} missions, no failures.\n`);
