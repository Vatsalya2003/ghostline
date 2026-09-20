import * as THREE from 'three';
import gsap from 'gsap';
import { createRenderer, createScene } from './render/Scene.js';
import { createCamera, resizeCamera, updateCamera, cutCamera, zoomCamera } from './render/Camera.js';
import { createFogOfWar } from './render/FogOfWar.js';
import { createLevel, PLACES } from './render/Level.js';
import { createSeabedLevel } from './render/SeabedLevel.js';
import { createDepotLevel } from './render/DepotLevel.js';
import { attachSurveyLights } from './render/Seabed.js';
import { createOcclusion } from './render/Occlusion.js';
import { createActors } from './render/Actors.js';
import { FIRE_SOURCE, SMOKE_STAGES, ACTORS } from './data/depot-layout.js';
import { createSquad, setGroundSampler } from './render/Units.js';
import { FX } from './render/FX.js';
import { UnitMarkers } from './render/UnitMarkers.js';
import { ObjectiveMarkers, OBJECTIVE_PLACE } from './render/ObjectiveMarkers.js';
import { selectedMission } from './data/missions.js';

// Which mission this session is running. Everything downstream takes the
// mission as a parameter already, so selection is a single binding.
const chosen = selectedMission();
const mission1 = chosen.mission;
import { GameState } from './systems/GameState.js';
import { TurnManager } from './systems/TurnManager.js';
import { Director } from './systems/Director.js';
import { events, GAME_EVENT } from './systems/Events.js';
import { Input } from './systems/Input.js';
import { audio } from './systems/Audio.js';
import { Soundscape } from './systems/Soundscape.js';
import { initVoices, stopSpeaking } from './systems/Dialogue.js';
import { CommsPanel } from './ui/CommsPanel.js';
import { CommandBar } from './ui/CommandBar.js';
import { StatusHUD } from './ui/StatusHUD.js';
import { MissionLog } from './ui/MissionLog.js';
import { Debrief } from './ui/Debrief.js';
import { Screens } from './ui/Screens.js';
import { ScreenFX } from './ui/ScreenFX.js';
import { Prompts } from './ui/Prompts.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { TacticalMap } from './ui/TacticalMap.js';

// Beat timing is driven by timers, so tweens must keep real time even after a
// frame hitch. With lag smoothing on, GSAP freezes tween time across a long
// frame and the visuals drift out of step with the scripted sequence.
gsap.ticker.lagSmoothing(0);

// ---------------------------------------------------------------- render
const canvas = document.getElementById('scene');
const renderer = createRenderer(canvas);
const camera = createCamera();
const { scene, terrain } = createScene({ environment: mission1.environment, renderer });
// The veil has to cover what the camera can actually see and lie on the
// ground it is hiding. On the seabed both matter: the board is far wider than
// the old 30-unit quad, and the terrain has hollows a flat veil would tent
// over. Mission 1's flat compound keeps the original defaults.
const fog = createFogOfWar(scene, mission1.environment === 'undersea'
  ? { size: 110, height: terrain.height, memSize: 256 }
  : mission1.environment === 'depot'
    ? { size: 120, height: terrain.height, memSize: 256 }
    : {});
const level = mission1.environment === 'undersea' ? createSeabedLevel(scene)
  : mission1.environment === 'depot' ? createDepotLevel(scene)
  : createLevel(scene);
// Tell the units where the ground is before anything places them.
setGroundSampler(terrain?.height || null);
const squad = createSquad(scene);
// At 240 metres nothing is lit until a vehicle lights it. The survey lights
// parent to the unit groups, so they travel with the fleet for free — and the
// pool of warm light they carry is the only reason the seabed has any colour.
if (mission1.environment === 'undersea') attachSurveyLights(squad.all);
// Roofs lift and walls fade while the squad is inside a building. Turns 5 and
// 6 of Ammunition Depot are decided on what is visible in one room, so this is
// the difference between a playable turn and a guess.
const occlusion = level.fadeables
  ? createOcclusion({ fadeables: level.fadeables, roofs: level.roofs, units: squad.all })
  : null;
// The guards and the hostages. Ammunition Depot asks the player to decide who
// is in a room; until these existed the room was empty and the decision was a
// guess about a sentence.
const actors = mission1.environment === 'depot' ? createActors(scene, ACTORS) : null;

const fx = new FX(scene);
const markers = new UnitMarkers(scene, squad.all);
// The gazetteer for the world actually being played. A mission that declares
// its own `sites` owns its ground outright (Compound 14 derives them from the
// depot layout); Dry Creek falls back to the level's PLACES. The seabed has no
// ground gazetteer at all, so it gets nothing rather than another map's.
const places = mission1.sites
  || (mission1.environment === 'undersea' ? {} : PLACES);
const objectiveJoin = mission1.objectiveSites || OBJECTIVE_PLACE;

// Objectives as places on the board, not just rows in the corner.
const objectiveMarkers = new ObjectiveMarkers(scene, mission1.objectives, {
  places, join: objectiveJoin,
});
// The key light is the one thing events borrow to make the world react.
// Looked up rather than returned, so Scene.js stays untouched.
const keyLight = scene.children.find((o) => o.isDirectionalLight && o.castShadow)
  || scene.children.find((o) => o.isDirectionalLight);
updateCamera(camera, 0);

// Where each unit starts. A mission can override it with a `deploy` block,
// because the engine's defaults are placed for mission 1's compound and mean
// nothing on another map.
const HOME = squad.all.map((u) => {
  const d = mission1.deploy;
  if (!d?.stand) return { unit: u, x: u.position.x, z: u.position.z, heading: u.heading };
  const off = d.formation?.[u.id] || { side: 0, back: 0 };
  // Offsets are in the frame of travel; at deploy the squad faces the route,
  // which from the south rise is north-east.
  const fx = 0.6, fz = -0.8;
  const rx = -fz, rz = fx;
  return {
    unit: u,
    x: d.stand[0] + off.side * rx - off.back * fx,
    z: d.stand[1] + off.side * rz - off.back * fz,
    heading: Math.atan2(fx, fz),
  };
});

// ---------------------------------------------------------------- game
const state = new GameState(mission1);
const turnManager = new TurnManager(mission1, state);

const ui = {
  comms: new CommsPanel({ onType: () => audio.typeTick() }),
  commandBar: new CommandBar(handleAction),
  hud: new StatusHUD(mission1),
  log: new MissionLog(),
};
const screenFX = new ScreenFX();

// The tactical map reads the live game — squad, drone, the level's own fire
// and the fog's memory — rather than being told about it. Its gazetteer is
// passed in, so it draws the world that is actually loaded and cannot inherit
// another mission's coordinates.
const tacticalMap = new TacticalMap({
  squad,
  fx,
  fog,
  state,
  level,
  places,
  objectivePlaces: objectiveJoin,
  mission: mission1,
});

const director = new Director({ camera, squad, fx, ui, turnManager, state, level, fog, screenFX, keyLight, markers, actors });
// Ambient beds, footsteps and stereo placement. Subscribes to Events on its
// own, so it needs nothing from the turn spine beyond a frame tick.
const soundscape = new Soundscape({ camera, squad, state, level });
const debrief = new Debrief(mission1, replay);
// One mission, so BEGIN goes straight to its briefing.
const screens = new Screens(mission1, {
  onBegin: () => { audio.unlock(); audio.select(); screens.hideTitle(); screens.showBriefing(); },
  onDeploy: () => { audio.select(); screens.hideBriefing(); startMission(); },
});

let pendingEnd = null;
// Bumped by every deploy and restart. A beat that was in flight when the player
// hit RESTART finishes against the *old* mission, and without this its
// continuation would advance a turn in the new one. Any long beat can strand a
// promise — a tween killed mid-flight may never fire its onComplete — so the
// guard is on the continuation rather than on any one system.
let missionRun = 0;

turnManager.on('turn', (turn) => { safely('turn intro', () => director.enterTurn(turn)); });
turnManager.on('end', (summary) => { pendingEnd = summary; });

// ---------------------------------------------------------------- hud wiring
// Everything below reacts to the mission rather than being called by it, so the
// turn spine stays free of HUD detail. See src/systems/Events.js.
events.on(GAME_EVENT.TURN_START, ({ turn }) => {
  ui.log.pushTurn(turn);
  ui.hud.setObjectives(state.objectives());
  objectiveMarkers.sync(state.objectives());
  // Clear the previous turn's line before the intro plays. Turn 3's intro runs
  // for the better part of ten seconds, and leaving the last answer sitting in
  // the comms panel through a breach reads as the squad still talking.
  ui.comms.reset?.();
  // Show exactly the people this turn declares — nobody lingers into a room
  // they were never in.
  actors?.showForTurn(turn.id, state);
});

// What a command did to the people on the board. Driven off the outcome so
// the mission owns it, the same as every other consequence.
events.on(GAME_EVENT.TURN_END, ({ turn, outcome }) => {
  if (!outcome) return;
  actors?.applyOutcome(outcome);
  // A sweep reveals the room inside the turn that ran it, not at the start
  // of the next one — otherwise the player reads "six bodies in there" and
  // is looking at an empty room until they press something else.
  actors?.showForTurn(turn.id, state);
  // …and the roof comes off, because the squad is sensing that room from
  // outside a shut door. Without this the sweep populates a room the player
  // still cannot see into.
  if (state.roomSensed) occlusion?.reveal('HOLDING');
});

// Being seen. The compound reacts, the hostages are moved off the board the
// AI described, and a clock the player cannot argue with starts running.
events.on(GAME_EVENT.ALARM_RAISED, ({ responseIn }) => {
  ui.hud.setAlarm({ alarmed: true, responseIn });
  ui.log.push('COMPOUND ALERTED — RESPONSE FORCE INBOUND');
  screenFX.flash('breach', 600);
  audio.alarm?.();
  actors?.onAlarm();
});

// Command changing hands. Loud and immediate: a banner centre screen for
// three seconds, because the next voice the player hears belongs to a
// different robot and finding that out from a name in the comms panel is too
// quiet a way to learn it.
let handoverTimer = null;
events.on(GAME_EVENT.LEAD_CHANGED, ({ from, to, reason }) => {
  ui.log.push(`COMMAND HANDOVER — ${from} → ${to}${reason ? ` · ${reason}` : ''}`);
  ui.hud.setLead?.(to);
  markers?.flare?.(to);
  director.focusUnit?.(to);
  audio.alert?.();

  const box = document.getElementById('handover');
  if (box) {
    document.getElementById('handover-why').textContent =
      reason || `${from} can no longer command.`;
    document.getElementById('handover-to').textContent = `${to} HAS THE SQUAD`;
    box.classList.remove('hidden');
    clearTimeout(handoverTimer);
    handoverTimer = setTimeout(() => box.classList.add('hidden'), 3000);
  }
});

events.on(GAME_EVENT.RESPONSE_TICK, ({ responseIn }) => {
  ui.hud.setAlarm({ alarmed: true, responseIn });
  if (responseIn > 0) ui.log.push(`RESPONSE FORCE — ${responseIn} TURN${responseIn === 1 ? '' : 'S'}`);
});

events.on(GAME_EVENT.MISSION_START, () => {
  ui.hud.setObjectives(state.objectives());
  objectiveMarkers.sync(state.objectives());
});

for (const name of [GAME_EVENT.OBJECTIVE_COMPLETED, GAME_EVENT.OBJECTIVE_FAILED]) {
  events.on(name, ({ id, label }) => {
    ui.hud.setObjectives(state.objectives());
    objectiveMarkers.sync(state.objectives());
    const row = document.querySelector(`.obj[data-objective="${id}"]`);
    if (row) row.classList.add('just-done');
    ui.log.push(`OBJECTIVE ${name === GAME_EVENT.OBJECTIVE_COMPLETED ? 'MET' : 'FAILED'} — ${label}`);
  });
}

// The Director sets `busy` on the way in and clears it on the way out. A throw
// anywhere in a beat — a missing model, an FX call against a system that has
// not loaded — used to leave it set forever, which locks the command bar and
// ends the demo with no way back. Recover the turn instead: log it loudly, hand
// control back, and let the player keep playing.
async function safely(what, fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(`[ghostline] ${what} failed to play`, err);
    director.busy = false;
    ui.commandBar.render(turnManager.availableActions());
    ui.commandBar.setLocked(state.missionOver);
    return false;
  }
}

async function handleAction(action) {
  if (director.busy) { ui.comms.skip(); return; }
  const run = missionRun;
  const resolution = turnManager.choose(action);
  // A command the turn will not accept must not sound like an order that
  // landed. choose() emits COMMAND_REJECTED on the way out and Soundscape
  // answers it with the deny tone, so there is nothing to play here.
  if (!resolution) return;
  // Taking the AI's recommendation gets its own affirmative, so agreeing with
  // the machine sounds different from any other order you give.
  if (action === 'CONFIRM') audio.confirm(); else audio.select();

  if (resolution.probe) {
    await safely('probe', () => director.playProbe(resolution));
    return;
  }

  await safely('outcome', () => director.playOutcome(resolution));

  // The mission was restarted while this outcome was playing. Everything below
  // belongs to a run that no longer exists.
  if (run !== missionRun) return;

  if (pendingEnd) return endMission();
  turnManager.advanceTurn();
  if (pendingEnd) endMission();
}

async function endMission() {
  const run = missionRun;
  const summary = pendingEnd;
  pendingEnd = null;
  ui.commandBar.setLocked(true);
  ui.commandBar.clear();
  stopSpeaking();
  director.clearFocus();
  // Only a completed objective gets the resolving tone; a surviving squad that
  // never brought the relay up does not.
  if (summary.outcome === 'complete') audio.missionSuccess();
  else audio.missionFail();
  // Let the board settle and fade before the numbers land on top of it —
  // cutting straight to the debrief threw away the ending.
  const success = summary.outcome === 'complete';
  if (success) zoomCamera(camera, 20, 1.2);
  ui.hud.setObjectives(summary.objectives);
  await screenFX.fadeOut(success ? 'success' : 'failure', 950);
  // Restarted during the fade — do not drop last run's debrief over the new one.
  if (run !== missionRun) return;
  debrief.show(summary);
  events.emit(GAME_EVENT.DEBRIEF_SHOWN, { summary });
}

function startMission() {
  missionRun += 1;
  pendingEnd = null;
  director.reset();
  ui.log.clear();
  debrief.hide();
  for (const h of HOME) {
    h.unit.placeAt(h.x, h.z, h.heading);
    h.unit.setStatus('healthy', { animate: false });
  }
  // Mission 1's breach door. Missions set somewhere without one hand back a
  // placeholder, so only reset it if there is actually a door to reset.
  if (level.door?.material) {
    level.door.rotation.set(0, 0, 0);
    level.door.position.set(2.6, 0.855, 2);
    level.door.material.emissiveIntensity = 0.18;
  }
  // Deploy push-in: cut wide over the treeline, then settle to tactical range.
  // A cut-then-ease means a restart never flies the camera across the map from
  // wherever the last run happened to end.
  cutCamera(camera, -5, 6.2, 26);
  zoomCamera(camera, 15, 1.7);
  fog.clear();
  fog.lift(1.6);
  occlusion?.reset();
  director.resetCharge?.();
  actors?.reset();
  screenFX.reset();
  screenFX.deploySweep();
  input?.clearUnitSelection();
  turnManager.start();
  ui.hud.setHealth(state.health);
  ui.hud.setDrones(state.drones);
  ui.hud.setAlarm({ alarmed: false, responseIn: null });
}

function replay() {
  audio.select();
  debrief.hide();
  screenFX.fadeClear();
  if (screens.seenBriefing) startMission();
  else { screens.showBriefing(); }
}

// ---------------------------------------------------------------- input
// Restart and abort are reachable from the pause menu, so they need to put the
// screens back in a sane state as well as the mission.
function restartMission() {
  screens.hideTitle();
  screens.hideBriefing();
  screenFX.fadeClear();
  input.clearUnitSelection();
  startMission();
}

function abortToTitle() {
  stopSpeaking();
  state.missionOver = true;
  pendingEnd = null;
  ui.commandBar.setLocked(true);
  ui.commandBar.clear();
  director.clearFocus();
  input.clearUnitSelection();
  debrief.hide();
  screens.hideBriefing();
  screenFX.fadeClear();
  screens.showTitle();
}

const prompts = new Prompts();
let pauseMenu = null;

const input = new Input({
  commandBar: ui.commandBar,
  comms: ui.comms,
  camera,
  squad,
  hud: ui.hud,
  prompts,
  isBusy: () => director.busy,
  onAction: (action) => {
    if (director.busy) { ui.comms.skip(); return; }
    const allowed = turnManager.availableActions().find((a) => a.action === action && !a.disabled);
    if (allowed) handleAction(action);
    // A pad button bound to a command this turn does not offer never reaches
    // choose(), so nothing would answer it. Silence reads as a dropped input.
    else if (!state.missionOver) {
      events.emit(GAME_EVENT.COMMAND_REJECTED, { turn: turnManager.turn, action, reason: 'NOT AVAILABLE' });
    }
  },
  onSkip: () => ui.comms.skip(),
  onPause: (pane) => pauseMenu?.toggle(pane),
  onMap: () => tacticalMap.toggle(),
});

pauseMenu = new PauseMenu({
  mission: mission1,
  input,
  onRestart: restartMission,
  onAbort: abortToTitle,
  getTurn: () => turnManager.turn,
});

// The side panel only shows the last few lines. This holds the mission and
// opens the whole transcript, which is the thing a player actually wants when
// the debrief asks them to remember what happened on turn 4.
document.getElementById('log-open')?.addEventListener('click', () => {
  audio.select();
  pauseMenu.show('log');
});

// Highest priority first. Contexts are picked by what is *visible*, so this
// list can never disagree with the screen.
input.addContext({
  name: 'pause',
  priority: 100,
  allowCamera: false,
  isActive: () => pauseMenu.open,
  handle: (control) => pauseMenu.handle(control),
  pick: (i) => {
    const el = pauseMenu.ring.items[i];
    if (!el || el.disabled) return false;
    el.click();
    return true;
  },
  prompts: () => pauseMenu.prompts(),
});
// Below the pause menu — pausing over an open map should still show the menu —
// and above the mission, so pan and zoom drive the map rather than the camera
// while it is up.
input.addContext({
  name: 'map',
  priority: 80,
  allowCamera: false,
  isActive: () => tacticalMap.open,
  handle: (control) => tacticalMap.handle(control),
  pick: () => false,
  prompts: () => tacticalMap.prompts(),
});
input.addContext(input.screenContext({
  name: 'debrief', priority: 60,
  el: document.getElementById('screen-debrief'),
  ring: debrief.ring, label: 'RUN IT AGAIN',
}));
input.addContext(input.screenContext({
  name: 'briefing', priority: 50,
  el: document.getElementById('screen-briefing'),
  ring: screens.briefingRing, label: 'DEPLOY',
  onCancel: () => { screens.hideBriefing(); screens.showTitle(); },
}));
input.addContext(input.screenContext({
  name: 'title', priority: 40,
  el: document.getElementById('screen-title'),
  ring: screens.titleRing, label: 'BEGIN MISSION',
}));
// The fallback: no screen up means the mission has the controls.
input.addContext(input.missionContext({ isActive: () => true }));

initVoices();
ui.hud.setTurn(null);
ui.hud.setHealth(100);
ui.hud.setDrones(mission1.drones);
ui.hud.setStatuses(state.statuses, state.ammo);

window.addEventListener('resize', () => resizeCamera(camera, renderer));
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// ---------------------------------------------------------------- rehearsal
// ?skip=1 drops straight into the mission; ?auto=CONFIRM,SEND_DRONE,... plays
// a scripted run. Used for demo rehearsal and for testing without a human.
const params = new URLSearchParams(location.search);
if (params.has('skip') || params.has('auto')) {
  screens.hideTitle();
  screens.hideBriefing();
  startMission();
} else if (params.has('deploy')) {
  // Straight to the briefing, skipping the title. Kept for rehearsal.
  screens.hideTitle();
  screens.showBriefing();
}
// ?ui=pause|intel|controls opens the overlay straight away — demo rehearsal,
// and the only way to check these screens in a headless capture.
if (params.has('ui')) {
  const pane = params.get('ui') === 'pause' ? 'menu' : params.get('ui');
  pauseMenu.show(pane);
}
if (params.has('auto')) {
  const plan = params.get('auto').split(',').map((a) => a.trim()).filter(Boolean);
  let i = 0;
  const step = () => {
    if (i >= plan.length || state.missionOver) return;
    if (!director.busy) handleAction(plan[i++]);
    setTimeout(step, 400);
  };
  setTimeout(step, 2500);
}

// ---------------------------------------------------------------- fire
// Compound 14 burns through the back half of its mission. The fire is built
// once and parked at zero; the mission turns it up. Level 1 is the fuel store
// alight, level 2 is through the roofline and into the sensor picture — which
// is the honest reason turn 7's readings are noisy.
function updateFire(dt, t) {
  const fire = level.fire;
  if (!fire) return;
  fire.update(dt, t);
  const turn = turnManager.turn?.id ?? 0;

  // Stage 1 is the fuel store in the yard, lit by the player's own round.
  // Stages 2 and 3 are the smoke reaching the corridor and then the
  // ammunition room — the storyline's clock, made something you can see
  // closing rather than a number in a log line.
  let stage = 0, at = null, spread = 3.0, density = 0.6;
  if (state.fireStarted) { stage = 1; at = FIRE_SOURCE; spread = 3.0; density = 0.6; }
  for (const s of SMOKE_STAGES) {
    if (turn >= s.fromTurn) {
      stage = stage === 0 ? 2 : stage + 1;
      at = s.at; spread = s.spread; density = s.density;
    }
  }
  if (fire.stage !== stage) {
    fire.stage = stage;
    fire.setStage(stage, at, spread, density);
  }
}

// ---------------------------------------------------------------- loop
// THREE.Clock is deprecated in r186. Timer is the replacement and wants an
// explicit update() before either value is read.
const clock = new THREE.Timer();
function tick() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsed();
  squad.all.forEach((u) => u.update(t));
  fx.update(dt);
  fog.update(squad.all, dt, t);
  markers.update(dt, t);
  objectiveMarkers.update(dt, t);
  tacticalMap.update(dt);
  soundscape.update(dt);
  terrain?.dust.update(dt, t);
  updateFire(dt, t);
  occlusion?.update(dt);
  actors?.update(t);
  input.poll(dt);
  updateCamera(camera, dt, t);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// Console handles for tuning and for the plan's step-5 check.
window.OP = { occlusion, actors, screens, map: tacticalMap, ui, state, turnManager, director, squad, camera, scene, fog, fx, screenFX, input, pauseMenu, audio, soundscape, mission: mission1, startMission };
