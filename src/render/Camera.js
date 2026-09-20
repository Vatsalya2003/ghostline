import * as THREE from 'three';

// Orthographic, ~45 deg elevation. Tactical diorama framing — no perspective
// camera, so there is no "camera clipped inside a wall" class of bug.
//
// One rig, one writer. Pan, zoom, punch and shake all feed *targets* on
// camera.userData; `updateCamera` is the only thing that touches
// camera.position and the projection, once per frame. Before this, a pan tween
// and a shake loop both wrote the transform on their own schedules and fought
// each other on every impact beat.
export const VIEW_SIZE = 18;

const DIST = 40;
const ELEV = THREE.MathUtils.degToRad(45);
const AZIM = THREE.MathUtils.degToRad(45);
const QUARTER = Math.PI / 2;
const TURN_TIME = 0.4;

// Azimuth is the ONLY thing the player can rotate. Orthographic projection
// and the 45 degree elevation are fixed, because the whole tactical read —
// cone shapes, unit spacing, how far things are from each other — depends on
// the board being drawn the same way every time. Free rotation would let a
// player put themselves in a view where the game is unreadable and then
// report that as a bug.
let azimuth = AZIM;
let azimuthFrom = AZIM;
let azimuthTo = AZIM;
let turnT = 1;

// Mutated in place, never reassigned: everything that imported this before
// the view could rotate still sees the live value.
export const OFFSET = new THREE.Vector3();

function recomputeOffset() {
  OFFSET.set(
    DIST * Math.cos(ELEV) * Math.sin(azimuth),
    DIST * Math.sin(ELEV),
    DIST * Math.cos(ELEV) * Math.cos(azimuth)
  );
}
recomputeOffset();

// Snap the view a quarter turn. Anything that needs to know which way the
// screen is pointing must ask — `cameraBasis()` — rather than assuming
// screen-right is +x,-z, which is only true at the default azimuth.
export function rotateView(dir = 1) {
  if (turnT < 1) return false;          // ignore input mid-turn
  azimuthFrom = azimuth;
  azimuthTo = azimuth + Math.sign(dir) * QUARTER;
  turnT = 0;
  return true;
}

export const viewAzimuth = () => azimuth;

// Screen basis in the xz plane. `forward` is into the screen, `right` is
// screen-right, both flat.
export function cameraBasis() {
  const len = Math.hypot(OFFSET.x, OFFSET.z) || 1;
  const fwd = { x: -OFFSET.x / len, z: -OFFSET.z / len };
  return { forward: fwd, right: { x: -fwd.z, z: fwd.x } };
}

export function resetView() {
  azimuth = azimuthFrom = azimuthTo = AZIM;
  turnT = 1;
  recomputeOffset();
}

// Critically damped spring. Reaches the target without overshoot and, unlike a
// tween, survives being retargeted mid-flight — a second pan blends out of the
// first one's velocity instead of snapping.
function smoothDamp(current, target, vel, key, smoothTime, dt) {
  const omega = 2 / Math.max(smoothTime, 0.0001);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (vel[key] + omega * change) * dt;
  vel[key] = (vel[key] - omega * temp) * exp;
  return target + (change + temp) * exp;
}

// The canvas no longer fills the window — it owns the left column only, so
// every aspect calculation has to come from the element, not the viewport.
export function stageSize() {
  const stage = document.getElementById('stage');
  const w = stage?.clientWidth || window.innerWidth;
  const h = stage?.clientHeight || window.innerHeight;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}
export function stageAspect() {
  const { w, h } = stageSize();
  return w / h;
}

export function createCamera() {
  const aspect = stageAspect();
  const camera = new THREE.OrthographicCamera(
    (-VIEW_SIZE * aspect) / 2, (VIEW_SIZE * aspect) / 2,
    VIEW_SIZE / 2, -VIEW_SIZE / 2,
    0.1, 200
  );
  camera.userData = {
    focus: new THREE.Vector3(0, 0, 0),      // where the rig is looking now
    target: new THREE.Vector3(0, 0, 0),     // where it is heading
    vel: { x: 0, z: 0, view: 0, punch: 0, wide: 0 },
    shake: new THREE.Vector3(0, 0, 0),
    smoothTime: 0.5,
    view: VIEW_SIZE,                        // current ortho height
    viewTarget: VIEW_SIZE,
    viewSmooth: 0.5,
    punch: 0,                               // transient zoom kick, decays to 0
    trauma: 0,                              // 0..1, drives shake amplitude
    traumaDecay: 2.2,
    swayPhase: 0,
    sway: 0.06,                             // idle drift, deliberately tiny
    appliedView: -1,
    // Player-held wide view (TACTICAL / Y). Additive on top of whatever the
    // director has set, so holding it never clobbers a scripted zoom.
    wide: 0,
    wideTarget: 0,
  };
  camera.position.copy(OFFSET);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function applyCameraTransform(camera) {
  const d = camera.userData;
  camera.position.copy(d.focus).add(OFFSET).add(d.shake);
}

function applyProjection(camera, view) {
  const d = camera.userData;
  if (Math.abs(view - d.appliedView) < 0.0005) return;
  d.appliedView = view;
  const aspect = stageAspect();
  camera.left = (-view * aspect) / 2;
  camera.right = (view * aspect) / 2;
  camera.top = view / 2;
  camera.bottom = -view / 2;
  camera.updateProjectionMatrix();
}

// Called once per frame from the render loop. Nothing else moves the camera.
export function updateCamera(camera, dt, t = 0) {
  const d = camera.userData;
  const step = Math.min(dt, 0.05);

  d.focus.x = smoothDamp(d.focus.x, d.target.x, d.vel, 'x', d.smoothTime, step);
  d.focus.z = smoothDamp(d.focus.z, d.target.z, d.vel, 'z', d.smoothTime, step);
  d.view = smoothDamp(d.view, d.viewTarget, d.vel, 'view', d.viewSmooth, step);
  d.punch = smoothDamp(d.punch, 0, d.vel, 'punch', 0.28, step);
  d.wide = smoothDamp(d.wide, d.wideTarget, d.vel, 'wide', 0.22, step);

  // Quarter-turn snap. Eased by hand rather than tweened so it stays
  // deterministic and cannot be left half-finished by a paused timeline.
  if (turnT < 1) {
    turnT = Math.min(1, turnT + step / TURN_TIME);
    const k = turnT * turnT * (3 - 2 * turnT);      // smoothstep
    azimuth = azimuthFrom + (azimuthTo - azimuthFrom) * k;
    if (turnT >= 1) azimuth = azimuthTo;
    recomputeOffset();
  }

  // Shake decays on trauma squared, so it falls away fast and never lingers
  // as a low-level wobble. Deterministic sinusoids, no Math.random — the demo
  // has to play back identically every time.
  if (d.trauma > 0) {
    d.trauma = Math.max(0, d.trauma - d.traumaDecay * step);
    const k = d.trauma * d.trauma;
    const p = t * 58;
    d.shake.set(
      Math.sin(p) * k * 1.4,
      Math.sin(p * 1.7) * k * 0.85,
      Math.cos(p * 1.3) * k * 1.4
    );
  } else if (d.shake.lengthSq() > 0) {
    d.shake.set(0, 0, 0);
  }

  // Idle sway: a few centimetres of drift so a held shot is never dead still.
  // Small enough that it never costs the player their read of the board.
  if (d.sway > 0) {
    d.swayPhase += step;
    d.shake.x += Math.sin(d.swayPhase * 0.31) * d.sway;
    d.shake.z += Math.cos(d.swayPhase * 0.23) * d.sway;
  }

  applyProjection(camera, Math.max(3, d.view + d.punch + d.wide));
  applyCameraTransform(camera);
}

// duration is kept for call-site compatibility and read as "settle by roughly
// this long" — the spring is ~95% there at 2.2x its smooth time.
export function panCamera(camera, x, z, duration = 1.1) {
  const d = camera.userData;
  d.target.x = x;
  d.target.z = z;
  d.smoothTime = Math.max(0.12, duration * 0.45);
  return d.target;
}

// Snap with no travel — used on mission start so a restart does not fly the
// camera across the map from wherever the last run ended.
export function cutCamera(camera, x, z, view = null) {
  const d = camera.userData;
  d.target.set(x, 0, z);
  d.focus.set(x, 0, z);
  d.vel.x = d.vel.z = 0;
  if (view !== null) {
    d.viewTarget = view;
    d.view = view;
    d.vel.view = 0;
  }
  d.punch = 0;
  d.trauma = 0;
  d.wide = d.wideTarget = 0;
  // A restart must not inherit a half-finished quarter turn.
  azimuthFrom = azimuthTo = azimuth;
  turnT = 1;
  applyProjection(camera, d.view);
  applyCameraTransform(camera);
}

export function zoomCamera(camera, viewSize, duration = 1.0) {
  const d = camera.userData;
  d.viewTarget = viewSize;
  d.viewSmooth = Math.max(0.12, duration * 0.45);
  return d.viewTarget;
}

// Frame a unit (or anything with a .position) without changing zoom.
export function focusOn(camera, target, duration = 0.9) {
  const p = target?.position || target;
  if (!p) return;
  panCamera(camera, p.x, p.z, duration);
}

// ---------------------------------------------------------------- player input
// The player nudges the same `target` the director pans to, so the two never
// fight: a scripted pan simply retargets and the spring blends out of whatever
// the stick was doing. Clamped to the playable area so the board cannot be
// pushed off screen and lost.
export const PAN_BOUNDS = { minX: -14, maxX: 14, minZ: -14, maxZ: 14 };
export const ZOOM_RANGE = { min: 9, max: 30 };

// dx/dz are in world units for this frame; caller scales by dt.
export function nudgeCamera(camera, dx, dz) {
  if (!dx && !dz) return;
  const d = camera.userData;
  d.target.x = THREE.MathUtils.clamp(d.target.x + dx, PAN_BOUNDS.minX, PAN_BOUNDS.maxX);
  d.target.z = THREE.MathUtils.clamp(d.target.z + dz, PAN_BOUNDS.minZ, PAN_BOUNDS.maxZ);
  // Tighter spring while the stick is live, or the camera lags behind the
  // thumb and feels like it is on elastic.
  d.smoothTime = 0.16;
}

// Relative zoom from the triggers. Positive `amount` zooms in (smaller view).
export function nudgeZoom(camera, amount) {
  if (!amount) return;
  const d = camera.userData;
  d.viewTarget = THREE.MathUtils.clamp(d.viewTarget - amount, ZOOM_RANGE.min, ZOOM_RANGE.max);
  d.viewSmooth = 0.18;
}

// Hold-to-widen tactical overview. Additive, so it composes with the
// director's zoom instead of overwriting it.
export function setWideView(camera, on, amount = 13) {
  camera.userData.wideTarget = on ? amount : 0;
}

// Short zoom kick that springs back. Negative amount pushes in. Reads as
// emphasis without taking the board away from the player like a real zoom does.
export function punchZoom(camera, amount = -1.2) {
  const d = camera.userData;
  d.punch += amount;
  d.vel.punch = 0;
}

// Kept at its old signature. strength maps to trauma, duration to decay rate,
// so every existing `shakeCamera(cam, 0.7, 0.5)` call site still reads right.
export function shakeCamera(camera, strength = 0.5, duration = 0.45) {
  const d = camera.userData;
  d.trauma = Math.min(1, d.trauma + THREE.MathUtils.clamp(strength, 0, 1.5));
  d.traumaDecay = 1 / Math.max(duration, 0.1);
}

export function resizeCamera(camera, renderer) {
  camera.userData.appliedView = -1;   // force a projection rebuild at the new aspect
  applyProjection(camera, Math.max(3, camera.userData.view + camera.userData.punch + camera.userData.wide));
  const { w, h } = stageSize();
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
