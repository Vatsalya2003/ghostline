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
    this.turnIndex = 0;
    this.statuses = { LEAD: 'healthy', 'UNIT-2': 'healthy', 'UNIT-3': 'healthy' };
    this.calibration = [];       // { turn, action, tag, note }
    this.log = [];
    this.relayOnline = false;
    this.hostilesRevealed = false;
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
    };
  }
}
