// The world's own noise, as opposed to the game's feedback noises.
//
// Everything here subscribes to the Events bus rather than being called by
// anything, which is what that bus is for: Director still plays the beats it
// always played, and this layer fills the space around them without a single
// line moving in the turn spine.
//
// It owns four things:
//   1. where a sound is      — projects world x/z to a stereo position
//   2. movement              — footsteps and servos, from actual motion
//   3. the beds              — exterior / interior / unease, faded per turn
//   4. the quiet             — sparse distant events, so a held moment still
//                              sounds like somewhere rather than like nothing
//
// The mission is six turns in and out of one compound, so which bed is up is
// a property of the turn. `interior` is listed on the turn in mission data if
// it is ever worth overriding; otherwise it is inferred from the turn's name.

import * as THREE from 'three';
import { audio } from './Audio.js';
import { isPaused } from './Pause.js';
import { events, GAME_EVENT } from './Events.js';

// A step every this-many world units of travel. Three units moving at once is
// already busy; more steps than this turns a squad into a stampede.
const STEP_DISTANCE = 0.95;
// Never two step sounds closer together than this, whoever made them.
const STEP_MIN_GAP = 0.07;

// Sparse events: one somewhere in this window, then a new window.
const DETAIL_MIN = 6.5;
const DETAIL_MAX = 15;

// Seeded, and re-seeded on every mission start. The project's rule is that the
// demo has to be rehearsable, and background texture that lands in a different
// place on every run is the kind of thing that makes a presenter second-guess
// what they just heard. Same seed, same compound, every time.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 0x6057417;

// Turns fought inside the compound. Turn 3 breaches, 5 is at the console.
const INTERIOR_TURNS = new Set([3, 4, 5]);

// Where the contacts stand when they resolve. Mirrors the first marker in
// Director's fx.revealHostiles() call — if that moves, the sound should follow
// it, but being a metre out only shifts the pan slightly and is not worth
// threading a position through the event for.
const HOSTILE_AT = [4.2, -0.6];

export class Soundscape {
  constructor({ camera, squad, state, level }) {
    this.camera = camera;
    this.squad = squad;
    this.state = state;
    this.level = level;

    this.prev = new Map();        // unit id -> last position
    this.travel = new Map();      // unit id -> distance since its last step
    this.lastStepAt = 0;
    this.stepParity = 0;
    this.detailAt = DETAIL_MIN;
    this.rand = rng(SEED);
    this.clock = 0;
    this.droneOut = 0;            // seconds of drone flight left
    this.turn = null;
    this.over = false;            // mission ended — stop populating the world

    this.v = new THREE.Vector3();
    this.installSpatial();
    this.subscribe();
  }

  // ------------------------------------------------------------- the wiring
  subscribe() {
    events.on(GAME_EVENT.MISSION_START, () => this.reset());
    events.on(GAME_EVENT.TURN_START, ({ turn }) => this.enterTurn(turn));

    // Unease follows the two things a commander should be uneasy about.
    events.on(GAME_EVENT.UNIT_STATUS, () => this.syncMood());
    events.on(GAME_EVENT.HEALTH_CHANGED, ({ delta }) => {
      this.syncMood();
      // Losing the squad's last third earns a warning of its own; the tension
      // bed alone is too quiet to register as news.
      if (delta < 0 && this.state.health > 0 && this.state.health <= 30) {
        setTimeout(() => audio.alarm(), 900);
      }
    });

    // A drone going out: launch, rotors while it is up, and a reading landing.
    events.on(GAME_EVENT.SENSOR_SCAN, ({ source }) => this.droneFlight(source));

    // Contacts resolving out of the fog is a detection, and nothing else in
    // the mission plays a sound for it.
    events.on(GAME_EVENT.HOSTILES_REVEALED,
      () => setTimeout(() => audio.detect(...HOSTILE_AT), 500));

    // One place for every refused command — mouse, number key or pad alike.
    events.on(GAME_EVENT.COMMAND_REJECTED, () => audio.deny());

    // The mission is over the moment this fires; the debrief lands about a
    // second later, behind a fade. Let the compound recede under the resolving
    // tone instead of holding a tension bed under a screen of numbers.
    events.on(GAME_EVENT.MISSION_END, () => this.windDown());
  }

  // Tension goes first and fastest — it is the one bed that would read as the
  // mission still being live. The room tone under everything is left alone: a
  // debrief in total silence sounds like the game crashed.
  windDown() {
    this.over = true;
    this.droneOut = 0;
    audio.setLayer('droneLoop', 0, 0.6);
    audio.setLayer('tension', 0, 1.2);
    audio.setLayer('field', 0, 2.4);
    audio.setLayer('interior', 0, 2.4);
  }

  // ---------------------------------------------------------------- spatial
  // Pan follows where the thing actually is on screen, so the camera and the
  // stereo image never disagree. Projecting through the live camera means this
  // keeps working whatever the camera rig does — pans, zooms, the wide view.
  installSpatial() {
    audio.setSpatialResolver((x, z) => {
      if (!this.camera) return null;
      this.v.set(x, 0.5, z).project(this.camera);
      const pan = Math.max(-1, Math.min(1, this.v.x));
      // Off-screen sounds are further away, not absent: they still report,
      // just quieter. Fully off-screen bottoms out at a third of level.
      const off = Math.max(0, Math.max(Math.abs(this.v.x), Math.abs(this.v.y)) - 1);
      const gain = 1 / (1 + off * 1.6);
      return { pan: pan * 0.8, gain: Math.max(0.33, gain) };
    });
  }

  // ------------------------------------------------------------------ turns
  // Which bed is up is a property of the turn: the squad is either outside the
  // wire or inside the compound. `interior` can be set on a turn in mission
  // data to override the inference.
  enterTurn(turn) {
    this.turn = turn;
    const interior = turn.interior ?? INTERIOR_TURNS.has(turn.id);
    audio.setLayer('interior', interior ? 1 : 0, 3.0);
    audio.setLayer('field', interior ? 0.18 : 1, 3.0);
    this.syncMood();
  }

  // Unease tracks the two things that should make a commander uncomfortable:
  // a sensor they cannot trust, and a squad that cannot take another hit.
  syncMood() {
    const broken = Object.values(this.state.statuses || {}).some((s) => s && s !== 'healthy');
    const hurt = this.state.health <= 40;
    const level = broken && hurt ? 1 : broken ? 0.62 : hurt ? 0.45 : 0;
    audio.setLayer('tension', level, 2.5);
  }

  // Only sounds Director does not already play belong here — doubling a beat
  // is worse than missing one. Director owns the sweep itself (`audio.scan`);
  // this is the launch before it and the reading after it.
  droneFlight(source) {
    if (source === 'nightvision') return;      // no airframe involved
    const from = this.squad.lead?.position;
    audio.droneLaunch(from?.x, from?.z);
    this.droneOut = 3.4;
    audio.setLayer('droneLoop', 0.9, 0.35);
    setTimeout(() => audio.objective(), 1500);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    // A distant clank landing behind the debrief numbers reads as the compound
    // still being out there with someone in it. The mission is over.
    if (isPaused() || this.over || !audio.ctx) return;
    this.clock += dt;
    this.steps();
    this.detail(dt);

    if (this.droneOut > 0) {
      this.droneOut -= dt;
      if (this.droneOut <= 0) audio.setLayer('droneLoop', 0, 0.9);
    }
  }

  // Footsteps come from motion that actually happened rather than from a
  // scripted cue, so they stay in step with the tween however it is timed and
  // a unit that does not move stays quiet.
  steps() {
    for (const unit of this.squad.all) {
      const p = unit.position;
      let last = this.prev.get(unit.id);
      if (!last) { this.prev.set(unit.id, { x: p.x, z: p.z }); continue; }

      const moved = Math.hypot(p.x - last.x, p.z - last.z);
      last.x = p.x;
      last.z = p.z;
      if (moved < 1e-5) { this.travel.set(unit.id, 0); continue; }

      const total = (this.travel.get(unit.id) || 0) + moved;
      if (total < STEP_DISTANCE) { this.travel.set(unit.id, total); continue; }
      // Hold the distance until the step is actually spent. Charging it here
      // and then bailing on the gap below loses the sound *and* the distance,
      // which is how three units moving inside one frame — every frame, once
      // the renderer is slow enough that a whole tween lands between two of
      // them — end up walking in silence.
      const now = audio.t;
      if (now - this.lastStepAt < STEP_MIN_GAP) { this.travel.set(unit.id, total); continue; }
      this.travel.set(unit.id, total - STEP_DISTANCE);
      this.lastStepAt = now;

      audio.moveStep(p.x, p.z);
      // Servo on alternate steps only — under every step it becomes a drone.
      if ((this.stepParity++ & 1) === 0) audio.servo(p.x, p.z);
    }
  }

  // One distant event per window, placed somewhere plausible and never on the
  // player. Quiet enough to be noticed only in the gaps.
  detail(dt) {
    this.detailAt -= dt;
    if (this.detailAt > 0) return;
    this.detailAt = DETAIL_MIN + this.rand() * (DETAIL_MAX - DETAIL_MIN);

    const roll = this.rand();
    if (roll < 0.34) {
      // The console in front of the commander, so it is not placed in world.
      audio.relayTick();
    } else if (roll < 0.7) {
      audio.clank(...this.somewhere());
    } else {
      audio.thump(...this.somewhere());
    }
  }

  // A point out in the compound, away from wherever the squad is standing.
  somewhere() {
    const a = this.rand() * Math.PI * 2;
    const r = 9 + this.rand() * 7;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  reset() {
    this.over = false;
    this.prev.clear();
    this.travel.clear();
    this.rand = rng(SEED);
    this.detailAt = DETAIL_MIN;
    this.droneOut = 0;
    audio.setLayer('droneLoop', 0, 0.2);
    audio.setLayer('tension', 0, 0.8);
  }
}
