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
  //
  // Conditions are resolved through GameState, so a turn can branch on the
  // state of a single machine — `when: 'beta2Down'` — as readily as on a
  // mission flag.
  resolveTurn(turn) {
    if (!turn?.variants) return turn;
    for (const v of turn.variants) {
      if (v.when && !this.state.test(v.when)) continue;
      if (v.unless && this.state.test(v.unless)) continue;
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
    if (!turn) return this.endMission(this.completionOutcome());
    // Scripted statuses are what the turn expects the squad to look like. A
    // machine that has since been wrecked keeps reading DAMAGED — GameState
    // arbitrates, so the script cannot quietly promote a wreck back to a
    // merely glitchy sensor.
    for (const [id, status] of Object.entries(turn.statuses || {})) this.state.setStatus(id, status);
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
  //
  // An order you cannot afford is not an order. Anything an outcome spends —
  // a drone off the rack, rounds out of the squad's magazines, the one
  // grenade — is checked against what is actually left, and so is the squad
  // itself: a plan that needs a machine that is down cannot be given.
  availableActions() {
    const turn = this.turn;
    if (!turn) return [];
    return turn.actions.map((action) => {
      const outcome = this.resolveOutcome(turn.outcomes[action] || {});
      const probe = outcome.consumesTurn === false;
      let disabled = false;
      let reason = '';

      for (const [kind, amount] of Object.entries(costOf(outcome))) {
        if (this.state.available(kind) >= amount) continue;
        disabled = true;
        reason = kind === 'drones' ? 'NO DRONES' : `NO ${kind.toUpperCase()}`;
        break;
      }
      if (!disabled) {
        const missing = toArray(outcome.requiresUnit).find((id) => this.state.isDown(id));
        if (missing) { disabled = true; reason = `${missing} DOWN`; }
      }
      if (!disabled && outcome.requiresOperational
          && this.state.operationalUnits().length < outcome.requiresOperational) {
        disabled = true;
        reason = 'SQUAD DOWN';
      }
      if (!disabled && probe && this.probesUsed.has(`${turn.id}:${action}`)) {
        disabled = true;
        reason = 'USED';
      }
      return { action, disabled, reason, probe };
    });
  }

  // One outcome can read several ways depending on what has already happened.
  // Most specific first: a named condition, then the health bands, then the
  // outcome as written. Conditions come from GameState, so mission data can
  // branch on a single machine's state without any logic living in the file.
  //   variants: [{ when: 'beta2Down', log: '…', tag: '…' }]
  resolveOutcome(outcome) {
    if (!outcome) return outcome;
    let resolved = outcome;
    for (const v of outcome.variants || []) {
      if (v.when && !this.state.test(v.when)) continue;
      if (v.unless && this.state.test(v.unless)) continue;
      const { when, unless, ...overrides } = v;
      resolved = { ...outcome, ...overrides };
      break;
    }
    const above = resolved.altIfHealthAbove;
    if (above && this.state.health > above.threshold) resolved = { ...resolved, ...above };
    const below = resolved.altIfHealthBelow;
    if (below && this.state.health < below.threshold) resolved = { ...resolved, ...below };
    return this.withSquadMoves(resolved);
  }

  // A machine that is down does not march. Filtering the move order here means
  // the renderer, the log and the event bus all see the same squad without any
  // of them having to work out who is still standing.
  withSquadMoves(outcome) {
    if (!outcome?.moves) return outcome;
    const entries = Object.entries(outcome.moves).filter(([id]) => !this.state.isDown(id));
    if (entries.length === Object.keys(outcome.moves).length) return outcome;
    return { ...outcome, moves: Object.fromEntries(entries) };
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

    const outcome = this.resolveOutcome(raw);

    // Everything the order costs, taken out of the squad in one place: the
    // drone off the rack, the rounds out of the magazines that fired them.
    // Probes pay too — a look that costs a sensor sweep has to actually spend
    // the sweep, or the limit is decoration.
    this.state.spend(costOf(outcome), { turn: turn.id });

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

    // `relayOnline` was mission 1's only completion flag. Missions now name
    // their own via `setsFlag`, and the mission's primary objective says
    // which flag decides a complete run.
    if (outcome.relayOnline) this.state.relayOnline = true;
    if (outcome.setsFlag) {
      this.state[outcome.setsFlag] = true;
      this.state.flags[outcome.setsFlag] = true;
    }
    if (outcome.revealHostiles) {
      this.state.hostilesRevealed = true;
      events.emit(GAME_EVENT.HOSTILES_REVEALED, { turn });
    }

    const previousHealth = this.state.health;
    this.applyConsequences(turn, outcome);
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
    if (outcome.fx === 'scan' || costOf(outcome).drones) {
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

  // What the outcome did to the squad, in the order the fiction happens: the
  // machine the mission names as the casualty is hit first, then whatever the
  // engagement cost the squad is spread across the ones still standing.
  //
  // The other way round would pour damage into a robot that is about to be
  // destroyed anyway and quietly spare the survivors — the hit would show up
  // on the bar and nowhere else, which is the thing this layer exists to stop.
  applyConsequences(turn, outcome) {
    if (outcome.damages) this.state.applyDamages(outcome.damages, { turn: turn.id });
    // `unitLost` is the field the Director already plays the wreck sequence
    // from, so state and presentation read the same word. `losesUnit` is
    // accepted as well — one mechanic, not two spellings that drift apart.
    for (const id of toArray(outcome.unitLost ?? outcome.losesUnit)) {
      this.state.loseUnit(id, { turn: turn.id, cause: outcome.tag || 'outcome' });
    }
    for (const id of toArray(outcome.unitDisabled ?? outcome.disablesUnit)) {
      this.state.disableUnit(id, { turn: turn.id, cause: outcome.tag || 'outcome' });
    }
    if (outcome.healthDelta) {
      this.state.applyHealth(outcome.healthDelta, {
        impactUnit: outcome.impactUnit, turn: turn.id, cause: outcome.tag || 'outcome',
      });
    }
  }

  // Called by the presentation layer once the outcome has finished playing.
  advanceTurn() {
    if (this.state.missionOver) return null;
    this.state.turnIndex += 1;
    if (this.state.turnIndex >= this.mission.turns.length) {
      return this.endMission(this.completionOutcome());
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

  // A run is COMPLETE only when every objective the mission declares came out
  // met: the job it was sent to do, and the squad it was supposed to bring
  // back. Finishing the task with a machine left on the ground is a partial
  // success, and the debrief should say so.
  completionOutcome() {
    for (const objective of this.mission.objectives || []) {
      if (objective.flag && !this.state[objective.flag]) return 'partial';
      if (objective.survive && this.state.losses().length) return 'partial';
    }
    return 'complete';
  }

  endMission(outcome) {
    if (this.state.missionOver) return null;
    this.state.missionOver = true;
    this.state.outcome = outcome;
    // Nothing came back. The roster has to say what the ending says, or the
    // debrief will list recovered machines under SQUAD LOST.
    if (outcome === 'lost') this.state.markSquadLost({ turn: this.turn?.id ?? null });
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

// Everything an order takes out of the squad, as one ledger. `consumesDrone`
// predates the ledger and still means what it always meant.
//   spends: { rounds: 11, grenades: 1 }
function costOf(outcome) {
  const cost = { ...(outcome?.spends || {}) };
  if (outcome?.consumesDrone) cost.drones = (cost.drones || 0) + 1;
  return cost;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
