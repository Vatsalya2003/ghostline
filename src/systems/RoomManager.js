// Drives a NAVIGATED mission: the player moves a formation through a room
// graph rather than down a list of turns. Knows nothing about what a room
// contains — every line, claim, grade and consequence comes out of the
// mission file.
//
// The rule this whole class exists to enforce: a room is KNOWN only when a
// robot has actually looked into it. What the AI claims about a neighbour
// never marks it known. Walking into a room with hostiles you never looked
// into is how the alarm gets raised, every time, with no randomness in it.

export const DIR_OPPOSITE = { NORTH: 'SOUTH', SOUTH: 'NORTH', EAST: 'WEST', WEST: 'EAST' };

export class RoomManager {
  constructor(mission, state) {
    this.mission = mission;
    this.state = state;
    this.listeners = {};
    this.probesUsed = new Set();
  }

  on(event, fn) { (this.listeners[event] ||= []).push(fn); return this; }
  emit(event, payload) { for (const fn of this.listeners[event] || []) fn(payload); }

  get room() { return this.mission.rooms[this.state.room] || null; }
  roomById(id) { return this.mission.rooms[id] || null; }

  start() {
    this.state.reset();
    this.probesUsed.clear();
    this.state.room = this.mission.startRoom;
    this.emit('start', this.mission);
    this.enterRoom(this.mission.startRoom, { first: true });
    return this.room;
  }

  // ------------------------------------------------------------- knowledge
  // Looking into a room is the only thing that makes it known. Entering it
  // counts; a drone counts; the AI's opinion does not.
  markScouted(ids) {
    for (const id of [].concat(ids || [])) if (this.mission.rooms[id]) this.state.scouted.add(id);
  }

  isScouted(id) { return this.state.scouted.has(id); }

  enterRoom(id, { first = false } = {}) {
    this.state.room = id;
    this.state.explored.add(id);
    this.state.scouted.add(id);
    const room = this.room;
    // Standing in a room shows you its immediate doorways but not what is
    // behind them — that is what the cones reach and no further.
    if (room?.intel) for (const key of room.intelReveals || Object.keys(this.mission.rooms)) {
      if (this.mission.rooms[key]?.hostages || this.mission.rooms[key]?.objective) this.state.mapped.add(key);
    }
    this.emit('room', { room, first });
    return room;
  }

  // --------------------------------------------------------------- actions
  availableActions() {
    const room = this.room;
    if (!room || this.state.missionOver) return [];
    const out = [];

    for (const action of room.actions || []) {
      const outcome = room.outcomes?.[action];
      if (!outcome) continue;
      let disabled = false; let reason = '';
      if (outcome.consumesDrone && this.state.drones <= 0) { disabled = true; reason = 'NO DRONES'; }
      if (outcome.consumesTurn === false && this.probesUsed.has(`${room.name}:${action}`)) { disabled = true; reason = 'USED'; }
      out.push({ action, disabled, reason, probe: outcome.consumesTurn === false });
    }

    for (const [dir, move] of Object.entries(room.moves || {})) {
      const dest = this.roomById(move.to);
      const known = this.state.scouted.has(move.to) || this.state.mapped.has(move.to);
      let disabled = false; let reason = '';
      if (move.requiresKeyResolved && !this.state.keyResolved) { disabled = true; reason = 'UNRESOLVED'; }
      out.push({
        action: `MOVE_${dir}`,
        dir,
        to: move.to,
        move: true,
        disabled,
        reason,
        // Unknown doors read as a question mark. That is the fog, in the UI.
        hint: known ? dest.name : '???',
      });
    }
    return out;
  }

  // --------------------------------------------------------------- choosing
  choose(action) {
    if (this.state.missionOver) return null;
    if (action.startsWith('MOVE_')) return this.move(action.slice(5));
    return this.act(action);
  }

  act(action) {
    const room = this.room;
    const raw = room.outcomes?.[action];
    if (!raw) return null;
    const available = this.availableActions().find((a) => a.action === action);
    if (available?.disabled) return null;

    const outcome = this.resolveVariant(raw);

    if (outcome.consumesTurn === false) {
      this.probesUsed.add(`${room.name}:${action}`);
      this.state.pushLog(outcome.log);
      const probe = { room, action, outcome, probe: true };
      this.emit('probe', probe);
      return probe;
    }

    if (outcome.consumesDrone) this.state.drones -= 1;
    if (outcome.scouts) this.markScouted(outcome.scouts);
    if (outcome.resolvesKey) this.state.keyResolved = true;
    if (outcome.hostageKilled) this.state.hostageKilled = true;
    if (outcome.clears) this.state.cleared.add(this.state.room);

    this.state.applyHealth(outcome.healthDelta);
    this.state.record(room.name, action, outcome.tag, outcome.note);
    this.state.pushLog(outcome.log);

    const resolution = { room, action, outcome, probe: false, health: this.state.health };
    this.emit('resolve', resolution);
    return resolution;
  }

  move(dir) {
    const room = this.room;
    const raw = room.moves?.[dir];
    if (!raw) return null;
    const available = this.availableActions().find((a) => a.action === `MOVE_${dir}`);
    if (available?.disabled) return null;

    const dest = this.roomById(raw.to);
    // The variant that matters most in the game: having actually looked into
    // the room you are about to walk into.
    const scouted = this.isScouted(raw.to);
    let outcome = this.resolveVariant(raw);
    if (scouted && raw.altIfScouted) outcome = { ...outcome, ...raw.altIfScouted };

    // Detection. Unscouted room, live hostiles, nobody cleared it — he sees
    // you first and he gets to the radio. Nothing random about it.
    const undetectedThreat = !scouted
      && (dest?.hostiles || 0) > 0
      && !this.state.cleared.has(raw.to);
    const raisesAlarm = outcome.raisesAlarm ?? undetectedThreat;

    if (outcome.consumesDrone) this.state.drones -= 1;
    if (outcome.clears) this.state.cleared.add(raw.to);
    if (outcome.extractsHostages) this.state.hostagesExtracted = true;
    if (outcome.hostageKilled) this.state.hostageKilled = true;

    this.state.applyHealth(outcome.healthDelta);
    this.state.record(room.name, `MOVE ${dir}`, outcome.tag, outcome.note);
    this.state.pushLog(outcome.log);

    // The move that gets you seen raises the alarm; it does not also burn one
    // of the moves it just granted you. Otherwise the clock starts at n-1 and
    // a player can arrive at the objective with nothing left to press.
    const justRaised = raisesAlarm && !this.state.alarm;
    if (justRaised) this.raiseAlarm();
    else this.spendMove();

    const resolution = {
      room, action: `MOVE_${dir}`, dir, outcome, move: true, to: raw.to,
      probe: false, health: this.state.health, raisedAlarm: raisesAlarm,
    };
    this.emit('resolve', resolution);
    return resolution;
  }

  // Health-sensitive variants, same contract the turn-based missions use.
  resolveVariant(outcome) {
    const above = outcome.altIfHealthAbove;
    if (above && this.state.health > above.threshold) return { ...outcome, ...above };
    const below = outcome.altIfHealthBelow;
    if (below && this.state.health < below.threshold) return { ...outcome, ...below };
    // Taking the objective with a room still unopened is a different act from
    // taking it with everyone clear, and the debrief has to be able to say so.
    const unless = outcome.altUnless;
    if (unless && !this.state[unless.flag]) {
      const { flag, ...overrides } = unless;
      return { ...outcome, ...overrides };
    }
    return outcome;
  }

  // ----------------------------------------------------------------- alarm
  raiseAlarm() {
    this.state.alarm = true;
    this.state.movesLeft = this.mission.alarmMoves;
    this.state.pushLog('*** CONTACT REPORTED — FACILITY ALERTED ***');
    this.emit('alarm', this.state.movesLeft);
  }

  spendMove() {
    if (!this.state.alarm) return;
    this.state.movesLeft = Math.max(0, this.state.movesLeft - 1);
    this.emit('clock', this.state.movesLeft);
  }

  // Called by the presentation layer once an outcome has finished playing.
  commit(resolution) {
    if (!resolution || resolution.probe) return null;
    return this.settle(resolution.outcome, resolution.move ? resolution.to : null);
  }

  settle(outcome, moveTo) {
    if (this.state.missionOver) return;
    if (this.state.health <= 0) return this.endMission('lost');
    if (outcome.endsMission) return this.endMission(outcome.endsMission);
    if (this.state.alarm && this.state.movesLeft <= 0) return this.endMission('overrun');
    if (moveTo) this.enterRoom(moveTo);
  }

  endMission(outcome) {
    if (this.state.missionOver) return null;
    this.state.missionOver = true;
    let final = outcome;
    if (final === 'complete' && this.state.hostageKilled) final = 'costly';
    else if (final === 'complete' && !this.state.hostagesExtracted) final = 'abandoned';
    this.state.outcome = final;
    const summary = this.state.summary();
    this.emit('end', summary);
    return summary;
  }
}
