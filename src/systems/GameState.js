import { CALIBRATION } from '../data/mission1.js';

// Pure state. No DOM, no Three.js — so the whole turn spine can be exercised
// from node or the console.
export class GameState {
  constructor(mission) {
    this.mission = mission;
    this.reset();
  }

  reset() {
    this.health = this.mission.startHealth;
    this.drones = this.mission.drones;
    // ---- navigated missions ----
    this.room = this.mission.startRoom || null;
    this.explored = new Set();   // rooms stood in
    this.scouted = new Set();    // rooms actually LOOKED INTO (drone or entry)
    this.mapped = new Set();     // rooms known to exist from intel, contents unknown
    this.cleared = new Set();    // rooms whose hostiles are down
    this.keyResolved = false;
    this.hostagesExtracted = false;
    // Unlimited moves until somebody sees you. Then six.
    this.alarm = false;
    this.movesLeft = null;
    this.turnIndex = 0;
    this.statuses = { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' };
    this.calibration = [];       // { turn, action, tag, note }
    this.log = [];
    this.relayOnline = false;
    this.hostilesRevealed = false;
    this.hostageKilled = false;
    this.missionOver = false;
    this.outcome = null;          // 'complete' | 'lost' | 'aborted'
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
    const key = this.mission.keyTurn ?? this.mission.keyRoom;
    if (!key) return null;
    // Navigated missions key on a room name; turn missions key on a number.
    const room = this.mission.rooms?.[key];
    const label = room ? room.name : key;
    const entries = this.calibration.filter((d) => d.turn === label);
    if (!entries.length) {
      // Never resolved the key room at all — that is its own failure.
      return this.mission.keyRoom && this.missionOver && !this.keyResolved
        ? { turn: label, action: 'NONE', tag: CALIBRATION.DISUSE, note: 'Left unresolved.' }
        : null;
    }
    const bad = entries.find((d) => d.tag !== CALIBRATION.CALIBRATED);
    return bad || null;
  }

  // Failing the key room by getting it wrong and never opening its door at
  // all are different mistakes, and telling a player they "fired on it" when
  // they never went in reads as a bug.
  keyTurnLine() {
    const failure = this.keyTurnFailure();
    if (!failure) return null;
    const room = this.mission.keyRoom;
    const never = room && !this.explored?.has(room);
    return (never && this.mission.keyRoomUnopenedVerdict)
      || this.mission.keyTurnVerdict
      || this.mission.keyRoomVerdict;
  }

  summary() {
    return {
      outcome: this.outcome,
      health: this.health,
      counts: this.counts(),
      dominant: this.dominantTag(),
      verdict: this.mission.verdicts[this.dominantTag()],
      keyTurnFailed: !!this.keyTurnFailure(),
      keyTurnLine: this.keyTurnLine(),
      decisions: [...this.calibration],
      relayOnline: this.relayOnline,
      hostageKilled: this.hostageKilled,
      hostagesExtracted: this.hostagesExtracted,
      alarm: this.alarm,
      movesLeft: this.movesLeft,
      roomsExplored: this.explored.size,
      dronesLeft: this.drones,
    };
  }
}
