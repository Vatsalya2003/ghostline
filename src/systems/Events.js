// A one-way notice board for gameplay moments.
//
// The mission spine (TurnManager / GameState) announces what happened; anything
// that wants to react — audio, camera, FX, voice, telemetry — subscribes here
// instead of being threaded through the Director by hand. Nothing in the
// gameplay layer reads a subscriber back, so a system can be added or removed
// without the turn logic changing shape.
//
//   import { events, GAME_EVENT } from './systems/Events.js';
//   const off = events.on(GAME_EVENT.AI_RECOMMENDATION, ({ unit, confidence }) => { … });
//
// Also reachable without importing, for console work and for systems wired up
// outside the module graph:  window.GHOSTLINE.events

export const GAME_EVENT = {
  // ---- mission
  MISSION_START: 'missionStart',       // { mission }
  MISSION_END: 'missionEnd',           // { outcome, summary }
  MISSION_SUCCESS: 'missionSuccess',   // { summary }   objective met
  MISSION_FAILURE: 'missionFailure',   // { summary, outcome }  partial / aborted / lost

  // ---- turns
  TURN_START: 'turnStart',             // { turn, index, total }
  TURN_END: 'turnEnd',                 // { turn, action, outcome, tag }

  // ---- the AI, and what the player does with it
  AI_RECOMMENDATION: 'aiRecommendation', // { turn, unit, via, confidence, line, sourceStatus, suspect }
  COMMAND_ISSUED: 'commandIssued',       // { turn, action, outcome, tag }
  PLAYER_CONFIRMED: 'playerConfirmed',   // { turn, action, tag }  took the recommendation
  PLAYER_REJECTED: 'playerRejected',     // { turn, action, tag }  did something else
  PROBE_USED: 'probeUsed',               // { turn, action, response }  info, no turn spent
  COMMAND_REJECTED: 'commandRejected',   // { turn, action, reason }  not available right now

  // ---- world
  SENSOR_SCAN: 'sensorScan',           // { turn, action, source, dronesLeft }
  UNITS_ORDERED: 'unitsOrdered',       // { turn, moves }  squad told to move
  UNIT_STATUS: 'unitStatus',           // { unit, status, previous }
  HEALTH_CHANGED: 'healthChanged',     // { health, delta, previous }
  HOSTILES_REVEALED: 'hostilesRevealed', // { turn }

  // ---- objectives
  OBJECTIVE_COMPLETED: 'objectiveCompleted', // { id, label }
  OBJECTIVE_FAILED: 'objectiveFailed',       // { id, label }

  // Emitted by the presentation layer, not by the spine. Listed here so the
  // names stay in one place and two systems cannot invent two spellings.
  UNIT_SELECTED: 'unitSelected',       // { unit }   player highlighted a unit
  UNIT_FOCUSED: 'unitFocused',         // { unit }   game put the eye on a unit
  UNIT_MOVED: 'unitMoved',             // { unit, x, z }
  DEBRIEF_SHOWN: 'debriefShown',       // { summary }
};

class EventBus {
  constructor() { this.listeners = new Map(); }

  // Returns an unsubscribe function, so a caller never has to keep the
  // reference it passed in.
  on(name, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (payload) => { off(); fn(payload); });
    return off;
  }

  off(name, fn) { this.listeners.get(name)?.delete(fn); }

  // A listener that throws must not take the mission down with it — a bad
  // audio hook should cost you a sound, not the demo.
  emit(name, payload = {}) {
    const subs = this.listeners.get(name);
    if (!subs?.size) return;
    for (const fn of [...subs]) {
      try { fn(payload, name); }
      catch (err) { console.error(`[events] "${name}" listener failed`, err); }
    }
  }

  clear() { this.listeners.clear(); }
}

export const events = new EventBus();

// Exposed deliberately: systems added late in a jam should not need a main.js
// edit (and a merge conflict) just to hear about a turn change.
if (typeof window !== 'undefined') {
  window.GHOSTLINE = Object.assign(window.GHOSTLINE || {}, { events, GAME_EVENT });
}
