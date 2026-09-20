import { events, GAME_EVENT } from './Events.js';

// Drives the six turns from mission data. Knows nothing about what a turn
// contains — every line, value and grade comes out of the mission file.
//
// Two audiences: the presentation layer subscribes with `on()` and drives the
// Director from it; everything else (audio, FX, voice, telemetry) listens on
// the shared bus in Events.js so it never has to be wired in here by hand.
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
    return this.resolveTurn(this.mission.turns[this.state.turnIndex] || null);
  }

  // A turn's framing can depend on what has already happened. The extraction
  // turn must not open with "relay handled" if the player never brought it up.
  // Mirrors altIfHealthAbove on outcomes: variants live in mission data, the
  // rule for picking one lives here, and the first match wins.
  //   variants: [{ unless: 'relayOnline', situation: '…', task: '…' }]
  resolveTurn(turn) {
    if (!turn?.variants) return turn;
    for (const v of turn.variants) {
      if (v.when && !this.state[v.when]) continue;
      if (v.unless && this.state[v.unless]) continue;
      const { when, unless, ...overrides } = v;
      return { ...turn, ...overrides };
    }
    return turn;
  }

  start() {
    this.state.reset();
    this.probesUsed.clear();
    this.emit('start', this.mission);
    events.emit(GAME_EVENT.MISSION_START, { mission: this.mission });
    this.enterTurn();
    return this.turn;
  }

  enterTurn() {
    const turn = this.turn;
    if (!turn) return this.endMission('complete');
    for (const [id, status] of Object.entries(turn.statuses || {})) {
      const previous = this.state.statuses[id];
      this.state.statuses[id] = status;
      if (previous !== status) {
        events.emit(GAME_EVENT.UNIT_STATUS, { unit: id, status, previous });
      }
    }
    this.emit('turn', turn);
    events.emit(GAME_EVENT.TURN_START, {
      turn, index: this.state.turnIndex, total: this.mission.turns.length,
    });
    // The recommendation and the state of the sensor it came from, together —
    // the pairing the whole mission is about, so nothing downstream has to
    // re-derive it.
    const sourceStatus = this.state.statuses[turn.ai.unit] || 'healthy';
    events.emit(GAME_EVENT.AI_RECOMMENDATION, {
      turn,
      unit: turn.ai.unit,
      via: turn.ai.via || null,
      confidence: turn.ai.confidence,
      line: turn.ai.line,
      sourceStatus,
      suspect: sourceStatus !== 'healthy',
    });
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
    return outcome;
  }

  choose(action) {
    const turn = this.turn;
    if (!turn || this.state.missionOver) return null;
    const raw = turn.outcomes[action];
    if (!raw) {
      events.emit(GAME_EVENT.COMMAND_REJECTED, { turn, action, reason: 'NOT OFFERED' });
      return null;
    }

    const available = this.availableActions().find((a) => a.action === action);
    if (available?.disabled) {
      events.emit(GAME_EVENT.COMMAND_REJECTED, { turn, action, reason: available.reason });
      return null;
    }

    const outcome = this.resolveVariant(raw);

    // Probe: adds information, does not end the turn or get graded.
    if (outcome.consumesTurn === false) {
      this.probesUsed.add(`${turn.id}:${action}`);
      this.state.pushLog(outcome.log);
      const probe = { turn, action, outcome, probe: true };
      this.emit('probe', probe);
      events.emit(GAME_EVENT.PROBE_USED, { turn, action, response: outcome.response });
      if (outcome.fx === 'scan' || outcome.fx === 'nightvision') {
        events.emit(GAME_EVENT.SENSOR_SCAN, {
          turn, action, source: outcome.fx, dronesLeft: this.state.drones,
        });
      }
      return probe;
    }

    if (outcome.consumesDrone) this.state.drones -= 1;
    // `relayOnline` was mission 1's only completion flag. Missions now name
    // their own via `setsFlag`, and the mission's primary objective says
    // which flag decides a complete run.
    if (outcome.relayOnline) this.state.relayOnline = true;
    // A single outcome can satisfy more than one objective — evacuating the
    // hostages both records the evacuation and accounts for them.
    if (outcome.setsFlag) {
      for (const flag of [].concat(outcome.setsFlag)) this.state[flag] = true;
    }
    if (outcome.revealHostiles) {
      this.state.hostilesRevealed = true;
      events.emit(GAME_EVENT.HOSTILES_REVEALED, { turn });
    }

    const previousHealth = this.state.health;
    this.state.applyHealth(outcome.healthDelta);
    this.state.record(turn.id, action, outcome.tag, outcome.note);
    this.state.pushLog(outcome.log);

    if (this.state.health !== previousHealth) {
      events.emit(GAME_EVENT.HEALTH_CHANGED, {
        health: this.state.health,
        delta: this.state.health - previousHealth,
        previous: previousHealth,
      });
    }

    const resolution = { turn, action, outcome, probe: false, health: this.state.health };
    this.emit('resolve', resolution);

    const detail = { turn, action, outcome, tag: outcome.tag };
    events.emit(GAME_EVENT.COMMAND_ISSUED, detail);
    // "Confirmed" here means took the machine's recommendation, not pressed a
    // button — that distinction is the thing the mission is measuring.
    events.emit(action === 'CONFIRM' ? GAME_EVENT.PLAYER_CONFIRMED : GAME_EVENT.PLAYER_REJECTED, detail);
    if (outcome.fx === 'scan' || outcome.consumesDrone) {
      events.emit(GAME_EVENT.SENSOR_SCAN, {
        turn, action, source: outcome.fx || 'drone', dronesLeft: this.state.drones,
      });
    }
    if (outcome.moves) events.emit(GAME_EVENT.UNITS_ORDERED, { turn, moves: outcome.moves });
    this.announceObjectives();
    events.emit(GAME_EVENT.TURN_END, detail);

    if (this.state.health <= 0) {
      this.endMission('lost');
    } else if (outcome.endsMission) {
      this.endMission(outcome.endsMission);
    }
    return resolution;
  }

  // Called by the presentation layer once the outcome has finished playing.
  advanceTurn() {
    if (this.state.missionOver) return null;
    this.state.turnIndex += 1;
    if (this.state.turnIndex >= this.mission.turns.length) {
      return this.endMission(this.primaryObjectiveMet() ? 'complete' : 'partial');
    }
    return this.enterTurn();
  }

  // Objectives are derived from mission state rather than tracked separately,
  // so they cannot drift out of step with what actually happened.
  announceObjectives() {
    for (const change of this.state.settleObjectives()) {
      events.emit(
        change.state === 'done' ? GAME_EVENT.OBJECTIVE_COMPLETED : GAME_EVENT.OBJECTIVE_FAILED,
        { id: change.id, label: change.label },
      );
    }
  }

  // EVERY objective carrying a `flag` has to be met for a surviving run to
  // count as complete. This used to check only the first one, which was
  // indistinguishable from correct while every mission had exactly one — and
  // wrong the moment one had two. Ammunition Depot has both a depot to
  // destroy and hostages to account for, and under the old rule a player who
  // flattened the depot after shooting an unarmed civilian was told MISSION
  // COMPLETE, which is the precise opposite of what that mission teaches.
  //
  // Single-flag missions are unaffected: every() over one element is that
  // element.
  primaryObjectiveMet() {
    const flagged = (this.mission.objectives || []).filter((o) => o.flag);
    if (!flagged.length) return true;
    return flagged.every((o) => !!this.state[o.flag]);
  }

  endMission(outcome) {
    if (this.state.missionOver) return null;
    this.state.missionOver = true;
    this.state.outcome = outcome;
    this.announceObjectives();
    const summary = this.state.summary();
    this.emit('end', summary);
    events.emit(GAME_EVENT.MISSION_END, { outcome, summary });
    events.emit(
      outcome === 'complete' ? GAME_EVENT.MISSION_SUCCESS : GAME_EVENT.MISSION_FAILURE,
      { summary, outcome },
    );
    return summary;
  }
}
