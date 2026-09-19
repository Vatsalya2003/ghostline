import { CALIBRATION } from '../data/mission1.js';
import { events, GAME_EVENT } from './Events.js';

// Pure state. No DOM, no Three.js — so the whole turn spine can be exercised
// from node or the console.
//
// The squad is three machines, not one health bar. Each unit carries its own
// integrity, its own payload and its own failure state, and SQUAD INTEGRITY —
// the number on the HUD — is the average of the three. That ordering matters:
// the units are the truth and the bar is a summary of them, so "BETA-2 took
// critical damage" is a thing that happened to BETA-2 rather than a number
// subtracted from a pool that has no idea which robot it belongs to.
//
// A mission declares its squad in `roster` (mission 2 calls the same block
// `fleet`). Missions that declare neither still work: three units at full
// integrity, which is what mission 1 shipped with.

const DEFAULT_CRITICAL = 25;

// A machine that is hit takes this much of a squad-level hit; the rest is
// split between the ones still standing. High enough that the unit the
// outcome names is visibly the casualty, low enough that the others still
// feel it.
const FOCUS_SHARE = 0.6;

const UNIT_STATE = { OPERATIONAL: 'operational', DISABLED: 'disabled', LOST: 'lost' };

export class GameState {
  constructor(mission) {
    this.mission = mission;
    this.reset();
  }

  reset() {
    this.units = buildRoster(this.mission);
    this.unitOrder = Object.keys(this.units);
    this.criticalIntegrity = this.mission.criticalIntegrity ?? DEFAULT_CRITICAL;
    this.drones = this.mission.drones;
    this.turnIndex = 0;
    this.statuses = Object.fromEntries(this.unitOrder.map((id) => [id, 'healthy']));
    this.calibration = [];       // { turn, action, tag, note }
    this.log = [];
    this.relayOnline = false;
    this.hostilesRevealed = false;
    this.missionOver = false;
    this.outcome = null;          // 'complete' | 'partial' | 'aborted' | 'lost'
    this.objectiveSeen = {};      // id -> last state announced
  }

  // ---------------------------------------------------------------- the squad
  // SQUAD INTEGRITY is derived, never stored. Nothing can subtract from the bar
  // without saying which machine paid for it.
  get health() {
    if (!this.unitOrder.length) return 0;
    const total = this.unitOrder.reduce((sum, id) => sum + this.units[id].integrity, 0);
    return Math.round(total / this.unitOrder.length);
  }

  unit(id) { return this.units[id] || null; }

  isDown(id) { return this.units[id]?.state !== UNIT_STATE.OPERATIONAL; }

  isCritical(id) {
    const u = this.units[id];
    return !!u && u.state === UNIT_STATE.OPERATIONAL && u.integrity <= this.criticalIntegrity;
  }

  operationalUnits() {
    return this.unitOrder.map((id) => this.units[id]).filter((u) => u.state === UNIT_STATE.OPERATIONAL);
  }

  losses() { return this.unitOrder.filter((id) => this.units[id].state === UNIT_STATE.LOST); }

  disabledUnits() { return this.unitOrder.filter((id) => this.units[id].state === UNIT_STATE.DISABLED); }

  // What the UI needs to draw a squad panel, in one call. Sensor status lives
  // in `statuses` because the renderer and the Director both write it; this
  // merges the two views so nobody has to join them by hand.
  roster() {
    return this.unitOrder.map((id) => {
      const u = this.units[id];
      return {
        id,
        role: u.role,
        integrity: u.integrity,
        maxIntegrity: u.maxIntegrity,
        state: u.state,
        sensor: this.statuses[id] || 'healthy',
        critical: this.isCritical(id),
        operational: u.state === UNIT_STATE.OPERATIONAL,
        ammo: { ...u.ammo },
        damagedOn: u.damagedOn,
        downedOn: u.downedOn,
      };
    });
  }

  // Sensor status, with the one rule the scripted statuses cannot be allowed to
  // override: a machine that is down reads DAMAGED for the rest of the mission.
  // Turn data sets BETA-1 to 'glitch' on every turn from 3 onward, and without
  // this a robot that had since been wrecked would quietly go back to reporting
  // a merely glitchy sensor.
  // Announced from here rather than from the caller, so a sensor that breaks
  // because the mission said so and one that breaks because the machine was
  // shot both arrive on the bus the same way, exactly once.
  setStatus(id, status) {
    const effective = this.isDown(id) || this.isCritical(id) ? 'damaged' : status;
    const previous = this.statuses[id];
    const changed = previous !== effective;
    this.statuses[id] = effective;
    if (changed) events.emit(GAME_EVENT.UNIT_STATUS, { unit: id, status: effective, previous });
    return { status: effective, previous, changed };
  }

  syncStatus(id) { return this.setStatus(id, this.statuses[id] || 'healthy'); }

  // ---------------------------------------------------------------- damage
  // One machine, one amount. Everything that hurts the squad ends up here, so
  // there is exactly one place where a unit can cross into disabled.
  damageUnit(id, delta, { turn = null, cause = null } = {}) {
    const u = this.units[id];
    if (!u || !delta) return 0;
    // A wreck cannot be wrecked further. Keeping it in the roster and refusing
    // the hit is the difference between "lost" and "deleted".
    if (u.state === UNIT_STATE.LOST) return 0;

    const before = u.integrity;
    u.integrity = clamp(before + Math.round(delta), 0, u.maxIntegrity);
    const applied = u.integrity - before;
    if (!applied) return 0;
    if (applied < 0 && u.damagedOn === null) u.damagedOn = turn;

    this.syncStatus(id);
    events.emit(GAME_EVENT.UNIT_DAMAGED, {
      unit: id, delta: applied, integrity: u.integrity,
      critical: this.isCritical(id), turn, cause,
    });
    if (u.integrity === 0 && u.state === UNIT_STATE.OPERATIONAL) this.disableUnit(id, { turn, cause });
    return applied;
  }

  // Integrity gone: out of the fight, still on the board. A disabled machine is
  // recovered at extraction — which is what keeps it distinguishable from one
  // that was destroyed outright.
  disableUnit(id, { turn = null, cause = null } = {}) {
    const u = this.units[id];
    if (!u || u.state !== UNIT_STATE.OPERATIONAL) return false;
    u.integrity = 0;
    u.state = UNIT_STATE.DISABLED;
    u.downedOn = turn;
    this.syncStatus(id);
    events.emit(GAME_EVENT.UNIT_DISABLED, { unit: id, turn, cause, integrity: 0 });
    return true;
  }

  // Destroyed. Its payload leaves the squad with it, it stops being ordered
  // anywhere, and it counts against BRING THE SQUAD HOME at the debrief.
  loseUnit(id, { turn = null, cause = null } = {}) {
    const u = this.units[id];
    if (!u || u.state === UNIT_STATE.LOST) return false;
    u.integrity = 0;
    u.state = UNIT_STATE.LOST;
    u.downedOn ??= turn;
    this.syncStatus(id);
    events.emit(GAME_EVENT.UNIT_LOST, { unit: id, turn, cause });
    return true;
  }

  // An outcome naming what it did to whom: { 'BETA-2': { integrity: -70 } },
  // or the shorthand { 'BETA-2': -70 }. Anything that is not integrity is
  // payload — mission 2 spends battery this way.
  applyDamages(damages, { turn = null, cause = 'damages' } = {}) {
    for (const [id, spec] of Object.entries(damages || {})) {
      if (!this.units[id]) continue;
      if (typeof spec === 'number') { this.damageUnit(id, spec, { turn, cause }); continue; }
      const { integrity, destroy, ...payload } = spec;
      for (const [kind, amount] of Object.entries(payload)) {
        this.adjustAmmo(id, kind, amount);
      }
      if (integrity) this.damageUnit(id, integrity, { turn, cause });
      if (destroy) this.loseUnit(id, { turn, cause });
    }
  }

  // A squad-level hit, spread over the machines that can still absorb one.
  //
  // The pool is `delta × roster size`, so the squad average moves by exactly
  // `delta` — the curve every turn in the mission was tuned against — while the
  // unit the outcome names takes the larger share of it. Once a machine bottoms
  // out the remainder moves to whoever is still standing, so losing a robot
  // makes the next hit land harder on the two that are left rather than
  // quietly disappearing into a wreck.
  applyHealth(delta, { impactUnit = null, turn = null, cause = 'squad' } = {}) {
    const step = Math.round(delta || 0);
    if (!step) return this.health;
    let remaining = step * this.unitOrder.length;

    // Four passes is more than enough for three units; the guard is against a
    // pool that cannot be spent at all, not against deep recursion.
    for (let pass = 0; pass < 4 && remaining !== 0; pass += 1) {
      const targets = this.operationalUnits()
        .filter((u) => (remaining < 0 ? u.integrity > 0 : u.integrity < u.maxIntegrity))
        .map((u) => u.id);
      if (!targets.length) break;
      for (const [id, amount] of shareOut(remaining, targets, pass === 0 ? impactUnit : null)) {
        remaining -= this.damageUnit(id, amount, { turn, cause });
      }
    }
    return this.health;
  }

  // ---------------------------------------------------------------- resources
  // Payload is carried by the machines, not by the mission. A disabled robot's
  // rounds are still in the roster and no longer available to the squad, which
  // is the point: losing a unit costs you what it was carrying.
  payloadKinds() {
    const kinds = new Set();
    for (const id of this.unitOrder) for (const k of Object.keys(this.units[id].ammo)) kinds.add(k);
    return [...kinds];
  }

  payloadAvailable(kind) {
    return this.operationalUnits().reduce((n, u) => n + (u.ammo[kind] || 0), 0);
  }

  payloadCarried(kind) {
    return this.unitOrder.reduce((n, id) => n + (this.units[id].ammo[kind] || 0), 0);
  }

  available(kind) {
    return kind === 'drones' ? this.drones : this.payloadAvailable(kind);
  }

  canSpend(cost) {
    return Object.entries(cost || {}).every(([kind, amount]) => this.available(kind) >= amount);
  }

  // Draws from the best-stocked machine first, roster order breaking ties, so
  // the same order always spends the same way — the demo has to be rehearsable.
  adjustAmmo(id, kind, delta) {
    const u = this.units[id];
    if (!u || !delta) return 0;
    const before = u.ammo[kind] || 0;
    u.ammo[kind] = Math.max(0, before + delta);
    return u.ammo[kind] - before;
  }

  spend(cost, { turn = null } = {}) {
    const spent = {};
    for (const [kind, amount] of Object.entries(cost || {})) {
      if (!amount) continue;
      if (kind === 'drones') {
        const take = Math.min(this.drones, amount);
        this.drones -= take;
        spent.drones = take;
        continue;
      }
      let left = amount;
      const carriers = this.operationalUnits()
        .filter((u) => (u.ammo[kind] || 0) > 0)
        .sort((a, b) => (b.ammo[kind] - a.ammo[kind])
          || this.unitOrder.indexOf(a.id) - this.unitOrder.indexOf(b.id));
      for (const u of carriers) {
        if (left <= 0) break;
        left += this.adjustAmmo(u.id, kind, -Math.min(u.ammo[kind], left));
      }
      spent[kind] = amount - left;
    }
    if (Object.keys(spent).length) {
      events.emit(GAME_EVENT.RESOURCE_SPENT, { spent, turn, remaining: this.resources() });
    }
    return spent;
  }

  // Everything finite, in one shape the HUD can render without knowing which
  // mission it is looking at.
  resources() {
    const out = { drones: this.drones };
    for (const kind of this.payloadKinds()) out[kind] = this.payloadAvailable(kind);
    return out;
  }

  // ---------------------------------------------------------------- conditions
  // Named, derived facts a mission can branch on: `unless: 'relayOnline'`,
  // `when: 'beta2Critical'`. Mission data stays declarative and the rules for
  // what a name means stay here, in one place, testable without a browser.
  conditions() {
    const c = {
      relayOnline: !!this.relayOnline,
      hostilesRevealed: !!this.hostilesRevealed,
      missionOver: !!this.missionOver,
      squadCritical: this.health <= this.criticalIntegrity,
      squadIntact: this.unitOrder.every((id) => this.units[id].integrity === this.units[id].maxIntegrity),
      anyUnitDown: this.unitOrder.some((id) => this.isDown(id)),
      anyUnitLost: this.losses().length > 0,
      allUnitsDown: this.unitOrder.every((id) => this.isDown(id)),
      noDrones: this.drones <= 0,
      dronesLeft: this.drones > 0,
    };
    for (const id of this.unitOrder) {
      const key = unitKey(id);
      const u = this.units[id];
      c[`${key}Operational`] = u.state === UNIT_STATE.OPERATIONAL;
      c[`${key}Damaged`] = u.integrity < u.maxIntegrity;
      c[`${key}Critical`] = this.isCritical(id);
      c[`${key}Disabled`] = u.state === UNIT_STATE.DISABLED;
      c[`${key}Lost`] = u.state === UNIT_STATE.LOST;
      c[`${key}Down`] = this.isDown(id);
    }
    for (const kind of this.payloadKinds()) {
      c[`no${capitalise(kind)}`] = this.payloadAvailable(kind) <= 0;
    }
    return c;
  }

  // Mission data names a condition; state answers it. Falling through to a
  // plain state field keeps every `unless: 'relayOnline'` already in the
  // missions working unchanged.
  test(name) {
    if (!name) return false;
    const c = this.conditions();
    return name in c ? !!c[name] : !!this[name];
  }

  // ---------------------------------------------------------------- objectives
  // Derived from mission state rather than tracked alongside it, so the HUD,
  // the log and the debrief cannot end up disagreeing about what was achieved.
  //   { flag: 'relayOnline' }  met the moment that state flag turns true
  //   { survive: true }        resolves only when the mission ends
  objectiveState(objective) {
    if (objective.flag) {
      if (this[objective.flag]) return 'done';
      return this.missionOver ? 'failed' : 'pending';
    }
    if (objective.survive) {
      // A machine that was recovered still came home. One that was destroyed
      // did not, and no amount of finishing the job makes that line true.
      if (this.losses().length) return 'failed';
      if (!this.missionOver) return 'pending';
      return this.outcome === 'lost' ? 'failed' : 'done';
    }
    return 'pending';
  }

  objectives() {
    return (this.mission.objectives || []).map((o) => ({
      id: o.id, label: o.label, state: this.objectiveState(o),
    }));
  }

  // Only what has changed since the last call, so a caller can announce
  // transitions without keeping its own copy of the previous state.
  settleObjectives() {
    const changed = [];
    for (const o of this.objectives()) {
      if (this.objectiveSeen[o.id] === o.state) continue;
      this.objectiveSeen[o.id] = o.state;
      if (o.state !== 'pending') changed.push(o);
    }
    return changed;
  }

  // Nothing came back. Called when the mission ends with the squad lost, so
  // the roster says what the ending says.
  markSquadLost({ turn = null } = {}) {
    for (const id of this.unitOrder) this.loseUnit(id, { turn, cause: 'squad-lost' });
  }

  record(turn, action, tag, note) {
    if (!tag) return;
    this.calibration.push({ turn, action, tag, note });
  }

  pushLog(text) {
    if (!text) return;
    this.log.push(text);
  }

  counts() {
    const out = Object.fromEntries(Object.values(CALIBRATION).map((t) => [t, 0]));
    for (const entry of this.calibration) out[entry.tag] += 1;
    return out;
  }

  // The verdict names the habit to fix. Praise is only for a clean run —
  // outnumbering your mistakes with good calls is not the same as trusting
  // well, and saying otherwise lets a player walk out of the ambush turn
  // being told they read the sensor correctly.
  dominantTag() {
    const counts = this.counts();
    let worst = null;
    let worstN = 0;
    for (const [tag, n] of Object.entries(counts)) {
      if (tag === CALIBRATION.CALIBRATED) continue;
      if (n > worstN) { worst = tag; worstN = n; }
    }
    return worst || CALIBRATION.CALIBRATED;
  }

  // The mission names one turn as the lesson it is built around. Failing it
  // gets called out by name, however the rest of the run went.
  keyTurnFailure() {
    const keyTurn = this.mission.keyTurn;
    if (!keyTurn) return null;
    const entry = this.calibration.find((d) => d.turn === keyTurn);
    if (!entry || entry.tag === CALIBRATION.CALIBRATED) return null;
    return entry;
  }

  summary() {
    return {
      outcome: this.outcome,
      health: this.health,
      counts: this.counts(),
      dominant: this.dominantTag(),
      verdict: this.mission.verdicts[this.dominantTag()],
      keyTurnFailed: !!this.keyTurnFailure(),
      keyTurnLine: this.keyTurnFailure() ? this.mission.keyTurnVerdict : null,
      decisions: [...this.calibration],
      relayOnline: this.relayOnline,
      objectives: this.objectives(),
      // What is left of the squad, and of everything it was carrying. The
      // debrief is scored on the mission and on the trust calls separately;
      // this is the third thing a commander actually wants to know.
      units: this.roster(),
      losses: this.losses(),
      disabled: this.disabledUnits(),
      recovered: this.unitOrder.filter((id) => this.units[id].state !== UNIT_STATE.LOST),
      extracted: this.missionOver && this.outcome !== 'lost',
      resources: this.resources(),
    };
  }
}

// ------------------------------------------------------------------ helpers

// A mission declares its squad as `roster`; mission 2 calls the same block
// `fleet`. Either way it is a map of unit id to starting condition, and a
// mission that declares neither gets the three machines mission 1 shipped with.
function buildRoster(mission) {
  const declared = mission.roster || mission.fleet || {
    ALPHA: {}, 'BETA-1': {}, 'BETA-2': {},
  };
  const full = mission.startHealth ?? 100;
  const units = {};
  for (const [id, spec] of Object.entries(declared)) {
    const { integrity, role, ammo, battery, ...rest } = spec || {};
    const max = integrity ?? full;
    units[id] = {
      id,
      role: role || '',
      integrity: max,
      maxIntegrity: max,
      state: UNIT_STATE.OPERATIONAL,
      // Anything numeric the mission hangs on a unit is payload it can spend:
      // rounds and grenades on the ground, battery underwater.
      ammo: { ...(ammo || {}), ...(battery === undefined ? {} : { battery }), ...numericOnly(rest) },
      damagedOn: null,
      downedOn: null,
    };
  }
  return units;
}

function numericOnly(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === 'number'));
}

// 'BETA-1' -> 'beta1', so a mission can write `when: 'beta1Down'`.
function unitKey(id) { return id.toLowerCase().replace(/[^a-z0-9]/g, ''); }

function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Integer split of `total` across `ids` that sums to exactly `total`, with the
// named unit carrying the larger share. Largest remainder first, so it is the
// same split every run — the project's no-randomness rule applies to damage as
// much as it does to particles.
function shareOut(total, ids, focus) {
  if (!ids.length) return [];
  if (ids.length === 1) return [[ids[0], total]];
  const weighted = focus && ids.includes(focus);
  const raw = ids.map((id) => {
    if (!weighted) return total / ids.length;
    return id === focus ? total * FOCUS_SHARE : (total * (1 - FOCUS_SHARE)) / (ids.length - 1);
  });
  const out = raw.map((v) => Math.trunc(v));
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: Math.abs(v - Math.trunc(v)) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest !== 0; k = (k + 1) % order.length) {
    const step = Math.sign(rest);
    out[order[k].i] += step;
    rest -= step;
  }
  return ids.map((id, i) => [id, out[i]]);
}
