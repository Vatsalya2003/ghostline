// Drives the six turns from mission data. Knows nothing about what a turn
// contains — every line, value and grade comes out of the mission file.
export class TurnManager {
  constructor(mission, state) {
    this.mission = mission;
    this.state = state;
    this.listeners = {};
    this.probesUsed = new Set();
  }

  on(event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this.listeners[event] || []) fn(payload);
  }

  get turn() {
    return this.mission.turns[this.state.turnIndex] || null;
  }

  start() {
    this.state.reset();
    this.probesUsed.clear();
    this.emit('start', this.mission);
    this.enterTurn();
    return this.turn;
  }

  enterTurn() {
    const turn = this.turn;
    if (!turn) return this.endMission('complete');
    Object.assign(this.state.statuses, turn.statuses || {});
    this.emit('turn', turn);
    return turn;
  }

  // Which of this turn's actions the player can actually press right now.
  availableActions() {
    const turn = this.turn;
    if (!turn) return [];
    return turn.actions.map((action) => {
      const outcome = turn.outcomes[action] || {};
      let disabled = false;
      let reason = '';
      if (outcome.consumesDrone && this.state.drones <= 0) {
        disabled = true;
        reason = 'NO DRONES';
      }
      if (outcome.consumesTurn === false && this.probesUsed.has(`${turn.id}:${action}`)) {
        disabled = true;
        reason = 'USED';
      }
      return { action, disabled, reason, probe: outcome.consumesTurn === false };
    });
  }

  // Health-sensitive variants let one turn read differently depending on how
  // the squad is doing, without branching logic living in code.
  resolveVariant(outcome) {
    const alt = outcome.altIfHealthAbove;
    if (alt && this.state.health > alt.threshold) return { ...outcome, ...alt };
    const below = outcome.altIfHealthBelow;
    if (below && this.state.health < below.threshold) return { ...outcome, ...below };
    // Fire variants let one turn read differently depending on whether the
    // player set the building alight eight turns ago.
    const fireAbove = outcome.altIfFireAbove;
    if (fireAbove && this.state.fire > fireAbove.threshold) return { ...outcome, ...fireAbove };
    const fireBelow = outcome.altIfFireBelow;
    if (fireBelow && this.state.fire < fireBelow.threshold) return { ...outcome, ...fireBelow };
    return outcome;
  }

  choose(action) {
    const turn = this.turn;
    if (!turn || this.state.missionOver) return null;
    const raw = turn.outcomes[action];
    if (!raw) return null;

    const available = this.availableActions().find((a) => a.action === action);
    if (available?.disabled) return null;

    const outcome = this.resolveVariant(raw);

    // Probe: adds information, does not end the turn or get graded.
    if (outcome.consumesTurn === false) {
      this.probesUsed.add(`${turn.id}:${action}`);
      // Thinking is not free once the building is alight.
      this.state.applyFire(this.state.fireLit ? (this.mission.fireSpreadPerProbe || 0) : 0);
      this.state.pushLog(outcome.log);
      const probe = { turn, action, outcome, probe: true };
      this.emit('probe', probe);
      return probe;
    }

    if (outcome.consumesDrone) this.state.drones -= 1;
    if (outcome.relayOnline) this.state.relayOnline = true;
    if (outcome.revealHostiles) this.state.hostilesRevealed = true;
    if (outcome.hostageKilled) this.state.hostageKilled = true;
    if (outcome.hostagesMoved) this.state.hostagesMoved = true;
    if (outcome.igniteFire) this.state.fireLit = true;

    this.state.applyFire(outcome.fireDelta);
    this.state.applyHealth(outcome.healthDelta);
    this.state.record(turn.id, action, outcome.tag, outcome.note);
    this.state.pushLog(outcome.log);

    const resolution = { turn, action, outcome, probe: false, health: this.state.health };
    this.emit('resolve', resolution);

    if (this.state.health <= 0) {
      this.endMission('lost');
    } else if (this.cookedOff()) {
      this.endMission('cookoff');
    } else if (outcome.endsMission) {
      this.endMission(outcome.endsMission);
    }
    return resolution;
  }

  // Called by the presentation layer once the outcome has finished playing.
  // The stack goes up on its own once the fire reaches it. A loss condition
  // that has nothing to do with squad health — the clock you started yourself.
  cookedOff() {
    const t = this.mission.cookoffThreshold;
    return !!t && this.state.fire >= t;
  }

  advanceTurn() {
    if (this.state.missionOver) return null;
    this.state.applyFire(this.state.fireLit ? (this.mission.fireSpreadPerTurn || 0) : 0);
    if (this.cookedOff()) return this.endMission('cookoff');
    this.state.turnIndex += 1;
    if (this.state.turnIndex >= this.mission.turns.length) {
      return this.endMission(this.state.relayOnline ? 'complete' : 'partial');
    }
    return this.enterTurn();
  }

  endMission(outcome) {
    if (this.state.missionOver) return null;
    this.state.missionOver = true;
    // Completing the mission having shot a hostage is not the same ending.
    this.state.outcome = (outcome === 'complete' && this.state.hostageKilled) ? 'costly' : outcome;
    const summary = this.state.summary();
    this.emit('end', summary);
    return summary;
  }
}
