import { CALIBRATION } from '../data/mission1.js';

// Pure state. No DOM, no Three.js — so the whole turn spine can be exercised
// from node or the console.
export class GameState {
  constructor(mission) {
    this.mission = mission;
    this.reset();
  }

  // Every state flag this mission can raise: the ones its objectives read,
  // plus anything an outcome sets. Collected from the data so a replay clears
  // the mission actually loaded rather than the one this file was written
  // against. Computed once — the mission does not change under us.
  missionFlags() {
    if (this._flags) return this._flags;
    const flags = new Set(['relayOnline', 'hostilesRevealed', 'alarmed']);
    for (const o of this.mission.objectives || []) if (o.flag) flags.add(o.flag);
    for (const turn of this.mission.turns || []) {
      for (const outcome of Object.values(turn.outcomes || {})) {
        for (const variant of [outcome, outcome.altIfHealthAbove, outcome.altIfHealthBelow]) {
          if (variant?.setsFlag) for (const f of [].concat(variant.setsFlag)) flags.add(f);
        }
      }
    }
    this._flags = [...flags];
    return this._flags;
  }

  reset() {
    this.health = this.mission.startHealth;
    this.drones = this.mission.drones;
    this.turnIndex = 0;
    this.statuses = { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' };
    this.calibration = [];       // { turn, action, tag, note }
    this.log = [];
    // Was `this.relayOnline = false` and nothing else — mission 1's flag,
    // hardcoded. Any other mission's objectives stayed raised across a
    // replay, so RUN IT AGAIN opened with the previous run's objectives
    // already ticked and its endings mis-scored.
    for (const flag of this.missionFlags()) this[flag] = false;
    this.missionOver = false;
    this.outcome = null;          // 'complete' | 'partial' | 'aborted' | 'lost'
    this.objectiveSeen = {};      // id -> last state announced

    // The compound knowing you are in it. Once raised this never clears for
    // the rest of the run: the alarm is not a penalty you can pay off, it is
    // a state the mission continues inside. See raiseAlarm().
    this.alarmed = false;
    this.alarmTurn = null;
    this.responseIn = null;       // turns left before the response force lands

    // Who is talking to the commander. ALPHA until something happens to her,
    // and then whoever the mission promotes. Held as state rather than
    // hardcoded so renaming the squad is a change in one data file.
    this.lead = this.mission.lead || 'ALPHA';

    // Units that can no longer be handed the squad: destroyed, or relieved
    // because something happened to them. Command never walks backwards into
    // one of these — handing the squad back to the robot whose camera was
    // shot out two turns ago is worse than not handing it over at all.
    this.unfit = new Set();
  }

  // Who takes over when the current lead can no longer command. Walks the
  // mission's chain of command and returns the first name still standing.
  // Returns null if there is nobody left, which is not a handover — it is a
  // different ending, and the caller decides that.
  nextInCommand() {
    const chain = this.mission.succession || [];
    for (const id of chain) {
      if (id !== this.lead && !this.unfit.has(id)) return id;
    }
    return null;
  }

  // Spotted. Everything after this is a reaction rather than a decision,
  // which is the whole point — so it caps the ending at `partial` however
  // well the rest of the run goes, and starts a clock that can lose it.
  raiseAlarm(turnId, responseTurns) {
    if (this.alarmed) return false;
    this.alarmed = true;
    this.alarmTurn = turnId;
    this.responseIn = responseTurns;
    return true;
  }

  // Command handover. Returns the outgoing lead so the presentation layer
  // can say who lost it, or null if nothing changed.
  promote(unitId) {
    if (!unitId || unitId === this.lead) return null;
    const previous = this.lead;
    // Whoever is being replaced is out of the chain for good. Without this,
    // succession walks back up the list and returns the squad to a unit that
    // was relieved for cause.
    this.unfit.add(previous);
    this.lead = unitId;
    return previous;
  }

  // Called once per turn advance while the alarm is up.
  tickResponse() {
    if (!this.alarmed || this.responseIn === null) return null;
    this.responseIn = Math.max(0, this.responseIn - 1);
    return this.responseIn;
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

  applyHealth(delta) {
    this.health = Math.max(0, Math.min(100, this.health + (delta || 0)));
    return this.health;
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
      alarmed: this.alarmed,
      alarmTurn: this.alarmTurn,
      lead: this.lead,
      hostageKilled: !!this.hostageKilled,
      keyTurnFailed: !!this.keyTurnFailure(),
      keyTurnLine: this.keyTurnFailure() ? this.mission.keyTurnVerdict : null,
      decisions: [...this.calibration],
      relayOnline: this.relayOnline,
      objectives: this.objectives(),
    };
  }
}
