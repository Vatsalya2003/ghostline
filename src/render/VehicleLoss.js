import gsap from 'gsap';
import { PALETTE } from './Scene.js';
import { wait } from '../systems/Pause.js';

// A vehicle being lost, as something the player watches happen.
//
// The failure this avoids is the one every tactical game makes: a unit's health
// reaches zero and it is deleted between frames. The player is told, in text,
// that they lost something they never saw fail. In a game about whether to
// trust a machine, a machine dying off screen is the worst possible beat.
//
// So a loss is a sequence, and it is deliberately slow enough to read:
//
//   CRITICAL    sparks off the chassis, the frame flashes
//   UNSTABLE    it staggers — the walk is gone, it is being held up
//   SHUTDOWN    emissives die, the sensor cone collapses to nothing
//   COLLAPSE    it goes down on its side and stays down
//   WRECK       it keeps smoking for the rest of the mission
//
// The wreck is never removed. It sits where it fell, on the ground the player
// sent it to, smoking, for every turn that follows.

// Gaps between beats, in seconds.
//
// Paced on Pause.wait rather than on gsap's clock, for the same reason the
// Director sequences turns that way. gsap runs on the render ticker with lag
// smoothing off, so one long frame — a model landing, a machine under load, a
// headless capture — advances every scheduled callback at once and the whole
// sequence fires on a single tick. Timers keep real time whatever the frame
// rate does, and they hold their remaining time across a pause, so pausing
// mid-collapse pauses the collapse instead of letting it finish behind the
// menu. The tweens themselves stay on gsap; only the beats are timed here.
const BEAT = {
  unstable: 0.45,
  shutdown: 0.7,
  collapse: 0.8,
  settled: 0.8,
};

// Everything this sequence changes on a unit, so a replay can put it all back.
// setStatus() restores colour, cone range and cone opacity on its own; these
// are the ones nothing else owns.
export function restoreVehicle(unit) {
  if (!unit?.group) return;
  gsap.killTweensOf(unit.group.rotation);
  gsap.killTweensOf(unit.group.position);
  unit.group.rotation.z = 0;
  unit.group.rotation.x = 0;
  unit.group.position.y = 0;
  unit.lost = false;
  unit.smoking = false;

  for (const part of unit.group.userData.tintParts || []) {
    // Only parts this sequence actually dimmed carry a recorded base. A unit
    // that never died must not have its emissive rewritten to a guess.
    if (part.userData?.baseEmissive === undefined) continue;
    gsap.killTweensOf(part.material);
    part.material.emissiveIntensity = part.userData.baseEmissive;
  }
  if (unit.badge) {
    gsap.killTweensOf(unit.badge.material);
    unit.badge.material.opacity = 1;
  }
  if (unit.mixer) unit.mixer.timeScale = 1;
}

// `unit` is a Unit from Units.js; `hazards` and `combat` are the FX systems
// that own smoke and sparks. Returns a promise that settles when the wreck has
// come to rest, so the Director can hold the turn open for it.
//
// `mode` follows the two states gameplay distinguishes (see GameState):
//   disabled  out of the fight, still on the board — it shuts down and smokes
//   lost      destroyed — the same fall, ending in a fire that keeps burning
export async function playVehicleLoss(unit, { mode = 'disabled', hazards = null, combat = null, onBeat = null } = {}) {
  if (!unit?.group || unit.lost) return false;
  unit.lost = true;
  const destroyed = mode === 'lost';

  const at = unit.position;
  const beat = (name) => { if (onBeat) onBeat(name); };
  const sparks = (y, count, spread) => combat?.sparks(
    { x: at.x, y, z: at.z }, { count, color: 0xffb257, spread });

  // --- CRITICAL -----------------------------------------------------------
  beat('critical');
  unit.setStatus('damaged');
  combat?.unitHit(at, { color: PALETTE.red });
  combat?.sparks({ x: at.x, y: 1.25, z: at.z }, { count: 12, color: 0xffcf9a, spread: 1.4 });

  // --- UNSTABLE -----------------------------------------------------------
  // A stagger, not a wobble: two hard lurches with the recovery getting worse.
  await wait(BEAT.unstable);
  beat('unstable');
  if (unit.mixer) unit.mixer.timeScale = 0.45;
  gsap.timeline()
    .to(unit.group.rotation, { z: 0.16, x: -0.07, duration: 0.22, ease: 'power2.out' })
    .to(unit.group.rotation, { z: -0.1, x: 0.04, duration: 0.3, ease: 'power1.inOut' })
    .to(unit.group.rotation, { z: 0.2, duration: 0.35, ease: 'power1.inOut' });
  sparks(1.0, 5, 0.8);

  // --- SHUTDOWN -----------------------------------------------------------
  await wait(BEAT.shutdown);
  beat('shutdown');
  if (unit.mixer) unit.mixer.timeScale = 0;
  for (const part of unit.group.userData.tintParts || []) {
    part.userData = part.userData || {};
    if (part.userData.baseEmissive === undefined) {
      part.userData.baseEmissive = part.material.emissiveIntensity;
    }
    gsap.to(part.material, { emissiveIntensity: 0.04, duration: 0.7, ease: 'power2.in' });
  }
  if (unit.badge) gsap.to(unit.badge.material, { opacity: 0.25, duration: 0.7 });

  // The cone is the unit's voice in this game. It going to nothing is the
  // clearest possible statement that this vehicle is no longer contributing.
  unit.setConeRange(0.001, 0.8);
  const coneOpacity = unit.cone?.material?.uniforms?.uOpacity;
  if (coneOpacity) gsap.to(coneOpacity, { value: 0, duration: 0.8 });
  sparks(1.15, 5, 0.8);

  // --- COLLAPSE -----------------------------------------------------------
  await wait(BEAT.collapse);
  beat('collapse');
  gsap.to(unit.group.rotation, { z: 1.12, x: 0.12, duration: 0.75, ease: 'power3.in' });
  gsap.to(unit.group.position, { y: -0.16, duration: 0.8, ease: 'power3.in' });

  // --- WRECK --------------------------------------------------------------
  await wait(BEAT.settled);
  beat(destroyed ? 'destroyed' : 'wreck');
  combat?.debris({ x: at.x, y: 0.2, z: at.z }, { count: 7, spread: 1.1 });
  if (destroyed) {
    // Destroyed rather than disabled: whatever it was carrying goes up, and
    // the wreck burns for the rest of the mission.
    combat?.explosion({ x: at.x, y: 0.5, z: at.z }, { radius: 2.4, color: 0xffa24a, debris: 10 });
    hazards?.ignite(at.x, at.z, {
      key: `wreck:${unit.id}`, intensity: 0.85, growth: 0.1, follow: unit.group,
    });
  } else {
    sparks(0.35, 8, 1.3);
    hazards?.plume({ x: at.x, z: at.z }, {
      key: `wreck:${unit.id}`, intensity: 0.7, follow: unit.group,
    });
  }
  return true;
}

// A machine that is hurt but still standing: it smokes from here on, so the
// board carries the damage the HUD is reporting. Idempotent — a unit already
// smoking does not start a second plume.
export function markCritical(unit, { hazards = null, combat = null } = {}) {
  if (!unit?.group || unit.lost || unit.smoking) return false;
  unit.smoking = true;
  combat?.sparks({ x: unit.position.x, y: 1.1, z: unit.position.z },
    { count: 7, color: 0xffcf9a, spread: 0.9 });
  hazards?.plume({ x: unit.position.x, z: unit.position.z }, {
    key: `damage:${unit.id}`,
    intensity: 0.34,
    follow: unit.group,
  });
  return true;
}
