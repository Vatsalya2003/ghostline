import * as THREE from 'three';
import gsap from 'gsap';
import { createRenderer, createScene } from './render/Scene.js';
import { createCamera, resizeCamera, applyCameraTransform, panCamera, zoomCamera } from './render/Camera.js';
import { createFogOfWar } from './render/FogOfWar.js';
import { createLevel } from './render/Level.js';
import { createSquad } from './render/Units.js';
import { FX } from './render/FX.js';
import { mission1 } from './data/mission1.js';
import { depot } from './data/depot.js';
import { GameState } from './systems/GameState.js';
import { TurnManager } from './systems/TurnManager.js';
import { RoomManager } from './systems/RoomManager.js';
import { Director } from './systems/Director.js';
import { Input } from './systems/Input.js';
import { audio } from './systems/Audio.js';
import { initVoices, stopSpeaking } from './systems/Dialogue.js';
import { CommsPanel } from './ui/CommsPanel.js';
import { CommandBar } from './ui/CommandBar.js';
import { StatusHUD } from './ui/StatusHUD.js';
import { MissionLog } from './ui/MissionLog.js';
import { Debrief } from './ui/Debrief.js';
import { Screens } from './ui/Screens.js';
import { FacilityMap } from './ui/FacilityMap.js';

// Beat timing is driven by timers, so tweens must keep real time even after a
// frame hitch. With lag smoothing on, GSAP freezes tween time across a long
// frame and the visuals drift out of step with the scripted sequence.
gsap.ticker.lagSmoothing(0);

// ---------------------------------------------------------------- render
const canvas = document.getElementById('scene');
const renderer = createRenderer(canvas);
const camera = createCamera();
const { scene } = createScene();
createFogOfWar(scene);
const level = createLevel(scene);
const squad = createSquad(scene);
const fx = new FX(scene);
applyCameraTransform(camera);

const HOME = squad.all.map((u) => ({
  unit: u, x: u.position.x, z: u.position.z, heading: u.heading,
}));

// ---------------------------------------------------------------- game
// AMMUNITION DEPOT is the mission. ?m=relay brings back the six-turn relay
// mission — kept working as the parachute, not deleted.
const MISSIONS = { depot, relay: mission1 };
const mission = MISSIONS[new URLSearchParams(location.search).get('m')] || depot;

const state = new GameState(mission);
// A navigated mission walks a room graph; a turn mission walks a list. Both
// expose choose()/availableActions() so the presentation layer cannot tell.
const turnManager = mission.navigated
  ? new RoomManager(mission, state)
  : new TurnManager(mission, state);

const ui = {
  comms: new CommsPanel({ onType: () => audio.typeTick() }),
  commandBar: new CommandBar(handleAction),
  hud: new StatusHUD(mission),
  log: new MissionLog(),
  map: mission.navigated ? new FacilityMap(mission) : null,
};

const director = new Director({ camera, squad, fx, ui, turnManager, state, level });
const debrief = new Debrief(mission, replay);
const screens = new Screens(mission, {
  onBegin: () => { audio.unlock(); audio.select(); screens.hideTitle(); screens.showBriefing(); },
  onDeploy: () => { audio.select(); screens.hideBriefing(); startMission(); },
});

let pendingEnd = null;

turnManager.on('turn', (turn) => { director.enterTurn(turn); });
turnManager.on('room', (payload) => { director.enterRoom(payload); });
turnManager.on('end', (summary) => { pendingEnd = summary; });

async function handleAction(action) {
  if (director.busy) { ui.comms.skip(); return; }
  audio.select();
  const resolution = turnManager.choose(action);
  if (!resolution) return;

  if (resolution.probe) {
    await director.playProbe(resolution);
    return;
  }

  await director.playOutcome(resolution);

  if (pendingEnd) return endMission();
  // Navigated missions settle after the outcome has played, so the player
  // sees the consequence before the next room arrives.
  if (mission.navigated) turnManager.commit(resolution);
  else turnManager.advanceTurn();
  if (pendingEnd) endMission();
}

function endMission() {
  const summary = pendingEnd;
  pendingEnd = null;
  ui.commandBar.setLocked(true);
  ui.commandBar.clear();
  stopSpeaking();
  debrief.show(summary);
}

function startMission() {
  pendingEnd = null;
  director.reset();
  ui.log.clear();
  debrief.hide();
  for (const h of HOME) {
    h.unit.group.position.set(h.x, 0, h.z);
    h.unit.group.rotation.y = h.heading;
    h.unit.heading = h.heading;
    h.unit.cone.mesh.rotation.y = h.heading;
    h.unit.setStatus('healthy', { animate: false });
  }
  level.door.rotation.set(0, 0, 0);
  level.door.position.set(2.6, 0.855, 2);
  level.door.material.emissiveIntensity = 0.18;
  zoomCamera(camera, 15, 0.6);
  panCamera(camera, -5, 6.2, 0.8);
  turnManager.start();
  ui.hud.setHealth(state.health);
  ui.hud.setDrones(state.drones);
  ui.hud.setAlarm(state.alarm, state.movesLeft);
  ui.map?.update(state);
}

function replay() {
  audio.select();
  debrief.hide();
  if (screens.seenBriefing) startMission();
  else { screens.showBriefing(); }
}

const input = new Input({
  commandBar: ui.commandBar,
  onAction: (action) => {
    if (director.busy) { ui.comms.skip(); return; }
    const allowed = turnManager.availableActions().find((a) => a.action === action && !a.disabled);
    if (allowed) handleAction(action);
  },
  onSkip: () => ui.comms.skip(),
});

initVoices();
if (mission.navigated) ui.hud.setRoom(null, state); else ui.hud.setTurn(null);
ui.hud.setHealth(mission.startHealth);
ui.hud.setAlarm(false, null);
ui.hud.setDrones(mission.drones);
ui.hud.setStatuses(state.statuses);

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
}
if (params.has('auto')) {
  // Bare compass directions are accepted so a rehearsal URL reads as a route:
  // ?auto=NORTH,EAST,NORTH,SEND_DRONE  drops a judge on the holding room door.
  const DIRS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
  const plan = params.get('auto').split(',').map((a) => a.trim().toUpperCase())
    .filter(Boolean).map((a) => (DIRS.includes(a) ? `MOVE_${a}` : a));
  let i = 0;
  const step = () => {
    if (i >= plan.length || state.missionOver) return;
    if (!director.busy) handleAction(plan[i++]);
    setTimeout(step, 400);
  };
  setTimeout(step, 2500);
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();
  squad.all.forEach((u) => u.update(t));
  fx.update(dt);
  input.poll();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// Console handles for tuning and for the plan's step-5 check.
window.OP = { state, turnManager, director, squad, camera, scene, mission, startMission };
