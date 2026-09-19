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
    // Fire is a second resource that only ever moves one way. It is lit by
    // impatience and fed by hesitation, which is what gives the free probes
    // a price and makes verification a real decision instead of a free one.
    this.fire = this.mission.startFire || 0;
    this.fireLit = false;
    this.turnIndex = 0;
    this.statuses = { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' };
    this.calibration = [];       // { turn, action, tag, note }
    this.log = [];
    this.relayOnline = false;
    this.hostilesRevealed = false;
    this.hostageKilled = false;
    this.hostagesMoved = false;
    this.missionOver = false;
    this.outcome = null;          // 'complete' | 'lost' | 'aborted'
  }

  applyFire(delta) {
    if (!delta) return this.fire;
    this.fire = Math.max(0, Math.min(100, this.fire + delta));
    if (this.fire > 0) this.fireLit = true;
    return this.fire;
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
      fire: this.fire,
      hostageKilled: this.hostageKilled,
      hostagesMoved: this.hostagesMoved,
    };
  }
}
