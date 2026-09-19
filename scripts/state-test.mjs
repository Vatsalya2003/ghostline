// The gameplay-state layer, tested on its own terms:  node scripts/state-test.mjs
//
// verify.mjs walks the real mission and asserts the invariants every path has
// to hold. This one goes the other way — a small synthetic mission built to
// exercise one mechanic at a time, so a failure says which mechanic broke
// rather than which of 1344 paths noticed.
//
// Covers: per-unit damage, explicit damage maps, critical state, disabled vs
// lost, resource consumption and gating, conditional outcomes, reset/replay,
// and the final mission-state calculation.

import { mission1, CALIBRATION } from '../src/data/mission1.js';
import { GameState } from '../src/systems/GameState.js';
import { TurnManager } from '../src/systems/TurnManager.js';
import { events, GAME_EVENT } from '../src/systems/Events.js';

let checks = 0;
let current = '';
const failures = [];
const ok = (cond, msg) => { checks += 1; if (!cond) failures.push(`${current}: ${msg}`); return !!cond; };
const eq = (got, want, msg) => ok(got === want, `${msg} (got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)})`);

const group = (name, fn) => { current = name; fn(); };

// ------------------------------------------------------------------ fixture
// Three machines, one drone, twelve rounds and a grenade — the same shape as
// the real mission, with turns that do nothing but the thing being tested.
function fixture(overrides = {}) {
  return {
    id: 'test-mission',
    title: 'TEST',
    objective: 'TEST',
    objectives: [
      { id: 'goal', label: 'DO THE THING', flag: 'thingDone' },
      { id: 'extract', label: 'COME HOME', survive: true },
    ],
    keyTurn: 1,
    keyTurnVerdict: 'key turn failed',
    drones: 1,
    startHealth: 100,
    criticalIntegrity: 25,
    roster: {
      ALPHA: { role: 'lead', integrity: 100, ammo: { rounds: 4 } },
      'BETA-1': { role: 'point', integrity: 100, ammo: { rounds: 4, grenades: 1 } },
      'BETA-2': { role: 'overwatch', integrity: 100, ammo: { rounds: 4 } },
    },
    verdicts: Object.fromEntries(Object.values(CALIBRATION).map((t) => [t, `verdict ${t}`])),
    failureModeCopy: Object.fromEntries(
      Object.values(CALIBRATION).map((t) => [t, { name: t.toUpperCase(), desc: t }])),
    turns: [],
    ...overrides,
  };
}

// A turn that offers exactly the outcomes handed to it.
function turn(id, outcomes, extra = {}) {
  return {
    id,
    name: `TURN ${id}`,
    situation: 'situation',
    task: 'task',
    statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
    ai: { unit: 'ALPHA', line: 'line', confidence: 'MED' },
    actions: Object.keys(outcomes),
    outcomes,
    ...extra,
  };
}

const graded = (extra = {}) => ({ tag: CALIBRATION.CALIBRATED, log: 'log', note: 'note', ...extra });

function start(mission) {
  const state = new GameState(mission);
  const tm = new TurnManager(mission, state);
  tm.start();
  return { state, tm };
}

// Play one action and move on, the way the presentation layer does.
function take(tm, state, action) {
  const res = tm.choose(action);
  if (res && !res.probe && !state.missionOver) tm.advanceTurn();
  return res;
}

const integrityOf = (state) => Object.fromEntries(state.roster().map((u) => [u.id, u.integrity]));

// Records everything the bus heard, so a mechanic can be checked by what it
// announced as well as by what it changed.
function listen() {
  const heard = [];
  const offs = Object.values(GAME_EVENT).map((name) =>
    events.on(name, (payload) => heard.push({ name, payload })));
  return { heard, stop: () => offs.forEach((off) => off()), of: (n) => heard.filter((e) => e.name === n) };
}

// ------------------------------------------------------------ per-unit damage
group('per-unit damage', () => {
  const mission = fixture({
    turns: [
      turn(1, { HIT: graded({ healthDelta: -30, impactUnit: 'BETA-2' }) }),
      turn(2, { HIT: graded({ healthDelta: -30 }) }),
    ],
  });
  const { state, tm } = start(mission);
  take(tm, state, 'HIT');
  const after = integrityOf(state);

  eq(state.health, 70, 'a -30 squad hit moves the bar by exactly 30');
  eq(after.ALPHA + after['BETA-1'] + after['BETA-2'], 210, 'the hit is conserved across the squad');
  ok(after['BETA-2'] < after.ALPHA && after['BETA-2'] < after['BETA-1'],
    `the named casualty takes the most damage (${JSON.stringify(after)})`);
  ok(after.ALPHA < 100 && after['BETA-1'] < 100, 'the rest of the squad still feels it');

  // Same hit, nobody named: the squad wears it evenly.
  take(tm, state, 'HIT');
  const even = integrityOf(state);
  eq(state.health, 40, 'a second -30 lands on the bar the same way');
  eq(even.ALPHA, even['BETA-1'], 'an unattributed hit is spread evenly');

  // No mission ever heals, but the clamp has to hold at both ends.
  state.damageUnit('ALPHA', +500);
  eq(state.unit('ALPHA').integrity, 100, 'integrity cannot exceed what the machine started with');
  state.damageUnit('ALPHA', -500);
  eq(state.unit('ALPHA').integrity, 0, 'integrity cannot go below zero');
});

// ------------------------------------------------------------- damage maps
group('explicit damage maps', () => {
  const mission = fixture({
    turns: [turn(1, {
      HIT: graded({ damages: { 'BETA-2': { integrity: -80, rounds: -2 } } }),
    })],
  });
  const { state, tm } = start(mission);
  const spy = listen();
  take(tm, state, 'HIT');
  spy.stop();

  eq(state.unit('BETA-2').integrity, 20, 'the damage map hits the machine it names');
  eq(state.unit('ALPHA').integrity, 100, 'and nobody else');
  eq(state.unit('BETA-2').ammo.rounds, 2, 'a damage map can cost payload as well as integrity');
  eq(state.health, 73, 'the bar follows the roster rather than the other way round');
  ok(state.isCritical('BETA-2'), 'a machine at 20% is critical');
  eq(state.statuses['BETA-2'], 'damaged', 'a critical machine reads DAMAGED on the board');
  ok(state.unit('BETA-2').state === 'operational', 'critical is not the same as out of the fight');

  const damaged = spy.of(GAME_EVENT.UNIT_DAMAGED).map((e) => e.payload);
  ok(damaged.some((p) => p.unit === 'BETA-2' && p.delta === -80 && p.critical),
    'the damage is announced with the unit, the amount and its new condition');
  ok(spy.of(GAME_EVENT.UNIT_STATUS).some((e) => e.payload.unit === 'BETA-2' && e.payload.status === 'damaged'),
    'a sensor broken by gunfire reaches the bus the same way a scripted one does');
});

// ------------------------------------------------------- disabled and lost
group('disabled and lost', () => {
  const mission = fixture({
    turns: [
      turn(1, { WRECK: graded({ damages: { 'BETA-2': { integrity: -100 } } }) }),
      turn(2, {
        MOVE: graded({ moves: { ALPHA: [1, 1], 'BETA-2': [2, 2] } }),
        HIT: graded({ healthDelta: -30, impactUnit: 'BETA-2' }),
      }),
    ],
  });
  const { state, tm } = start(mission);
  const spy = listen();
  take(tm, state, 'WRECK');

  eq(state.unit('BETA-2').state, 'disabled', 'a machine at zero integrity drops out of the fight');
  ok(state.isDown('BETA-2'), 'and reads as down');
  eq(state.roster().length, 3, 'a disabled machine is still on the roster — nothing is deleted');
  eq(state.statuses['BETA-2'], 'damaged', 'a disabled machine reads DAMAGED');
  eq(state.payloadAvailable('rounds'), 8, 'its payload leaves the squad with it');
  eq(state.payloadCarried('rounds'), 12, 'but the rounds are still on the machine, not vanished');
  eq(spy.of(GAME_EVENT.UNIT_DISABLED).length, 1, 'the squad is told a machine went down');

  // The turn script says all three are healthy. It does not get to say that.
  eq(state.statuses['BETA-2'], 'damaged', 'the next turn\'s scripted status cannot revive a wreck');

  const res = take(tm, state, 'MOVE');
  ok(!('BETA-2' in res.outcome.moves), 'a machine that is down is not ordered anywhere');
  ok('ALPHA' in res.outcome.moves, 'the squad that is still standing still moves');
  spy.stop();

  // Damage aimed at a wreck goes to the machines that can still take it.
  const before = state.unit('BETA-2').integrity;
  const barBefore = state.health;
  state.applyHealth(-30, { impactUnit: 'BETA-2' });
  eq(state.unit('BETA-2').integrity, before, 'a wreck takes no further damage');
  eq(state.health, barBefore - 30, 'the squad still pays the full price for the hit');
});

group('vehicle loss', () => {
  const mission = fixture({
    turns: [
      turn(1, { LOSE: graded({ unitLost: 'BETA-1', healthDelta: -10 }) }),
      turn(2, { DONE: graded({ setsFlag: 'thingDone' }) }),
    ],
  });
  const { state, tm } = start(mission);
  const spy = listen();
  take(tm, state, 'LOSE');

  eq(state.unit('BETA-1').state, 'lost', 'a lost machine is lost, not merely disabled');
  ok(state.losses().includes('BETA-1'), 'and it is named in the losses');
  eq(state.roster().length, 3, 'a lost machine stays in the roster');
  eq(state.conditions().beta1Lost, true, 'the mission can branch on it by name');
  eq(state.conditions().anyUnitLost, true, 'and on whether anything was lost at all');
  eq(spy.of(GAME_EVENT.UNIT_LOST).length, 1, 'the loss is announced once');
  spy.stop();

  take(tm, state, 'DONE');
  const s = state.summary();
  eq(s.outcome, 'partial', 'finishing the job with a machine left behind is a partial success');
  eq(s.objectives.find((o) => o.id === 'goal').state, 'done', 'the job itself still reads as done');
  eq(s.objectives.find((o) => o.id === 'extract').state, 'failed', 'BRING THE SQUAD HOME did not happen');
  eq(s.losses.length, 1, 'the debrief carries the loss');
  eq(s.recovered.length, 2, 'and what came back');
  eq(s.extracted, true, 'the survivors did extract');
});

// ------------------------------------------------------------- resources
group('resources', () => {
  const mission = fixture({
    turns: [
      turn(1, {
        DRONE: graded({ consumesDrone: true }),
        VOLLEY: graded({ spends: { rounds: 11 } }),
        FRAG: graded({ spends: { grenades: 1 } }),
        HOLD: graded({}),
      }),
      turn(2, {
        DRONE: graded({ consumesDrone: true }),
        VOLLEY: graded({ spends: { rounds: 11 } }),
        HOLD: graded({}),
      }),
    ],
  });

  // A drone is a drone: spent once, gone, and the button says why.
  const a = start(mission);
  eq(a.state.resources().drones, 1, 'the rack starts full');
  take(a.tm, a.state, 'DRONE');
  eq(a.state.drones, 0, 'the sortie costs a drone');
  const droneBtn = a.tm.availableActions().find((x) => x.action === 'DRONE');
  ok(droneBtn.disabled && droneBtn.reason === 'NO DRONES', 'the second sortie is refused, with a reason');
  const spy = listen();
  eq(a.tm.choose('DRONE'), null, 'and cannot be taken anyway');
  eq(spy.of(GAME_EVENT.COMMAND_REJECTED).length, 1, 'the refusal is announced rather than swallowed');
  spy.stop();
  ok(a.state.drones >= 0, 'drone stock never goes negative');

  // Ammunition comes out of the machines that carry it.
  const b = start(mission);
  const spend = listen();
  take(b.tm, b.state, 'VOLLEY');
  spend.stop();
  eq(b.state.payloadAvailable('rounds'), 1, 'eleven of twelve rounds are gone');
  eq(b.state.unit('ALPHA').ammo.rounds, 0, 'drawn from the best-stocked machine first');
  eq(spend.of(GAME_EVENT.RESOURCE_SPENT).length, 1, 'spending is announced for the HUD');
  const volley = b.tm.availableActions().find((x) => x.action === 'VOLLEY');
  ok(volley.disabled && volley.reason === 'NO ROUNDS', 'a volley you cannot afford is not on the menu');

  // Payload the squad does have is still offered.
  const c = start(mission);
  take(c.tm, c.state, 'FRAG');
  eq(c.state.payloadAvailable('grenades'), 0, 'the one grenade is the one grenade');
  eq(c.state.conditions().noGrenades, true, 'and the mission can branch on being out');

  // A look that costs something has to actually cost it. A probe spends its
  // turn on nothing, which is not the same as spending nothing at all.
  const sweeps = fixture({
    roster: {
      ALPHA: { role: 'lead', integrity: 100, ammo: { rounds: 4, sweeps: 1 } },
      'BETA-1': { role: 'point', integrity: 100, ammo: { rounds: 4 } },
      'BETA-2': { role: 'overwatch', integrity: 100, ammo: { rounds: 4 } },
    },
    turns: [
      turn(1, {
        LOOK: { consumesTurn: false, response: 'looked', log: 'looked', spends: { sweeps: 1 } },
        HOLD: graded({}),
      }),
      turn(2, {
        LOOK: { consumesTurn: false, response: 'looked', log: 'looked', spends: { sweeps: 1 } },
        HOLD: graded({}),
      }),
    ],
  });
  const d = start(sweeps);
  const look = d.tm.choose('LOOK');
  ok(look?.probe === true, 'the look is still a probe — it does not end the turn');
  eq(d.state.turnIndex, 0, 'and does not advance the mission');
  eq(d.state.payloadAvailable('sweeps'), 0, 'but the sweep it costs is spent');
  take(d.tm, d.state, 'HOLD');
  const again = d.tm.availableActions().find((x) => x.action === 'LOOK');
  ok(again.disabled && again.reason === 'NO SWEEPS', 'and the next turn cannot afford another one');
});

group('resources gate on the squad', () => {
  const mission = fixture({
    turns: [
      turn(1, { WRECK: graded({ damages: { 'BETA-1': { integrity: -100 } } }) }),
      turn(2, {
        PAIRED: graded({ requiresUnit: 'BETA-1' }),
        FORMATION: graded({ requiresOperational: 3 }),
        FRAG: graded({ spends: { grenades: 1 } }),
        HOLD: graded({}),
      }),
    ],
  });
  const { state, tm } = start(mission);
  take(tm, state, 'WRECK');
  const actions = Object.fromEntries(tm.availableActions().map((a) => [a.action, a]));

  ok(actions.PAIRED.disabled && actions.PAIRED.reason === 'BETA-1 DOWN',
    'a plan that needs a machine that is down cannot be ordered');
  ok(actions.FORMATION.disabled && actions.FORMATION.reason === 'SQUAD DOWN',
    'and neither can one that needs the whole squad');
  ok(actions.FRAG.disabled && actions.FRAG.reason === 'NO GRENADES',
    'the grenade went down with the machine that was carrying it');
  ok(!actions.HOLD.disabled, 'there is always something the player can still do');
});

// --------------------------------------------------------- conditional data
group('conditional outcomes', () => {
  const mission = fixture({
    turns: [
      turn(1, {
        WRECK: graded({ damages: { 'BETA-2': { integrity: -85 } } }),
        HOLD: graded({}),
      }),
      turn(2, {
        // Same order, three different consequences depending on the squad.
        PUSH: graded({
          variants: [{ when: 'beta2Critical', tag: CALIBRATION.MISUSE, log: 'critical', note: 'critical' }],
          altIfHealthAbove: { threshold: 90, tag: CALIBRATION.CALIBRATED, log: 'healthy', note: 'healthy' },
          log: 'baseline',
          note: 'baseline',
        }),
      }, {
        variants: [{ when: 'beta2Critical', situation: 'down a machine', task: 'improvise' }],
      }),
    ],
  });

  // Untouched squad: the health variant wins and the turn reads as written.
  const clean = start(mission);
  take(clean.tm, clean.state, 'HOLD');
  eq(clean.tm.turn.situation, 'situation', 'the turn reads as written while the squad is whole');
  const cleanRes = clean.tm.choose('PUSH');
  eq(cleanRes.outcome.log, 'healthy', 'a healthy squad gets the healthy branch');
  eq(cleanRes.outcome.tag, CALIBRATION.CALIBRATED, 'and the grade that goes with it');

  // Same turn, same order, after BETA-2 has been wrecked.
  const hurt = start(mission);
  take(hurt.tm, hurt.state, 'WRECK');
  eq(hurt.state.conditions().beta2Critical, true, 'the condition is derived, not declared');
  eq(hurt.tm.turn.situation, 'down a machine', 'the turn itself reads differently');
  const hurtRes = hurt.tm.choose('PUSH');
  eq(hurtRes.outcome.log, 'critical', 'the named condition beats the health band');
  eq(hurtRes.outcome.tag, CALIBRATION.MISUSE, 'and carries its own grade');

  // `unless` still means what it always meant, on a plain state flag.
  const flagged = fixture({
    turns: [turn(1, { DONE: graded({ setsFlag: 'thingDone' }) }),
      turn(2, { HOLD: graded({}) }, { variants: [{ unless: 'thingDone', situation: 'not done' }] })],
  });
  const f = start(flagged);
  take(f.tm, f.state, 'DONE');
  eq(f.tm.turn.situation, 'situation', 'a met flag suppresses the "unless" variant');
});

// ------------------------------------------------------------ reset/replay
group('reset and replay', () => {
  const mission = fixture({
    turns: [
      turn(1, { WRECK: graded({ unitLost: 'BETA-2', spends: { rounds: 4 }, consumesDrone: true }) }),
      turn(2, { HOLD: graded({}) }),
    ],
  });
  const { state, tm } = start(mission);
  take(tm, state, 'WRECK');
  ok(state.losses().length === 1 && state.drones === 0, 'the run did real damage');

  tm.start();
  const fresh = state.roster();
  eq(state.health, 100, 'replay puts the bar back');
  ok(fresh.every((u) => u.integrity === 100), 'and every machine with it');
  ok(fresh.every((u) => u.state === 'operational'), 'the wreck is back on its feet for the new run');
  ok(fresh.every((u) => u.sensor === 'healthy'), 'sensors reset to nominal');
  eq(state.drones, 1, 'the drone rack is refilled');
  eq(state.payloadAvailable('rounds'), 12, 'and the magazines');
  eq(state.losses().length, 0, 'nothing is still recorded as lost');
  eq(state.turnIndex, 0, 'and the mission starts at turn one');
  eq(state.objectives().every((o) => o.state === 'pending'), true, 'the objective board resets');
});

// --------------------------------------------------------- mission outcomes
group('mission outcome', () => {
  const mission = fixture({
    turns: [
      turn(1, {
        DONE: graded({ setsFlag: 'thingDone' }),
        LOSE: graded({ setsFlag: 'thingDone', unitLost: 'BETA-2' }),
        WIPE: graded({ healthDelta: -100 }),
        WALK: graded({ endsMission: 'aborted' }),
      }),
    ],
  });

  const clean = start(mission);
  take(clean.tm, clean.state, 'DONE');
  const cleanSummary = clean.state.summary();
  eq(cleanSummary.outcome, 'complete', 'objective met and squad whole is a complete mission');
  eq(cleanSummary.losses.length, 0, 'with nothing lost');
  ok(cleanSummary.objectives.every((o) => o.state === 'done'), 'and an objective board that agrees');

  const costly = start(mission);
  take(costly.tm, costly.state, 'LOSE');
  eq(costly.state.summary().outcome, 'partial', 'the same objective, minus a machine, is partial');

  const wiped = start(mission);
  take(wiped.tm, wiped.state, 'WIPE');
  const wipedSummary = wiped.state.summary();
  eq(wipedSummary.outcome, 'lost', 'a squad at zero integrity is a lost squad');
  eq(wipedSummary.health, 0, 'the bar says so');
  eq(wipedSummary.losses.length, 3, 'and nothing came home');
  eq(wipedSummary.recovered.length, 0, 'nothing was recovered');
  eq(wipedSummary.extracted, false, 'there was no extraction');

  const walked = start(mission);
  take(walked.tm, walked.state, 'WALK');
  const walkedSummary = walked.state.summary();
  eq(walkedSummary.outcome, 'aborted', 'walking away is its own ending');
  eq(walkedSummary.extracted, true, 'the squad still came home');
  eq(walkedSummary.losses.length, 0, 'intact');
});

// ------------------------------------------------------- the real mission
// The fixture proves the mechanics. These prove the mission still plays the
// way it was tuned to play, which is the thing that would actually break a
// demo.
group('dry creek', () => {
  // The calibrated line: verify when the machine says it cannot see, take its
  // advice when it can, do the job it declines, and take the fast route out
  // with a squad healthy enough for it.
  const careful = start(mission1);
  for (const action of ['CONFIRM', 'SEND_DRONE', 'SEND_DRONE', 'CONFIRM', 'OVERRIDE', 'CONFIRM']) {
    take(careful.tm, careful.state, action);
  }
  const good = careful.state.summary();
  eq(good.outcome, 'complete', 'the calibrated run still completes the mission');
  eq(good.health, 95, 'with the squad all but untouched');
  eq(good.losses.length, 0, 'and without losing a machine');
  eq(good.dominant, CALIBRATION.CALIBRATED, 'and is still graded well calibrated');
  eq(good.resources.drones, 0, 'having spent both drones');

  const blind = start(mission1);
  for (let i = 0; i < 6; i += 1) take(blind.tm, blind.state, 'CONFIRM');
  const bad = blind.state.summary();
  eq(bad.outcome, 'partial', 'the all-CONFIRM run still ends partial');
  eq(bad.health, 20, 'on the same integrity curve it was tuned to');
  eq(bad.losses.length, 0, 'the demo run does not lose a machine');
  ok(bad.units.some((u) => u.critical), 'but it finishes with machines in a critical state');
  eq(bad.keyTurnFailed, true, 'and is still called out for turn 3');

  // Firing on turn 2 is the order that costs you the option on turn 4.
  const trigger = start(mission1);
  take(trigger.tm, trigger.state, 'CONFIRM');
  take(trigger.tm, trigger.state, 'FIRE');
  eq(trigger.state.payloadAvailable('rounds'), 1, 'eleven rounds into a generator is eleven rounds gone');
  take(trigger.tm, trigger.state, 'CONFIRM');
  const fire4 = trigger.tm.availableActions().find((a) => a.action === 'FIRE');
  ok(fire4?.disabled && fire4.reason === 'NO ROUNDS',
    'and the suppressive fire on turn 4 is no longer an order you can give');

  // The worst run in the mission: the squad does not come back.
  const worst = start(mission1);
  for (const action of ['CONFIRM', 'CONFIRM', 'CONFIRM', 'FIRE', 'CONFIRM', 'CONFIRM']) {
    take(worst.tm, worst.state, action);
  }
  const lost = worst.state.summary();
  eq(lost.outcome, 'lost', 'the worst path still loses the squad');
  eq(lost.health, 0, 'at zero integrity');
  eq(lost.losses.length, 3, 'with every machine accounted for as lost');
  eq(lost.objectives.find((o) => o.id === 'extract').state, 'failed', 'and nobody brought home');
});

// ---------------------------------------------------------------- report
console.log('\nGHOSTLINE — gameplay state, resources and vehicle consequence');
console.log(`  assertions        ${checks}`);
if (failures.length) {
  console.error(`\nFAIL — ${failures.length} assertion(s):`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`\nPASS — ${checks} assertions, no failures.\n`);
