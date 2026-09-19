import * as THREE from 'three';
import gsap from 'gsap';

// Orthographic, ~45 deg elevation. Tactical diorama framing — no perspective
// camera, so there is no "camera clipped inside a wall" class of bug.
export const VIEW_SIZE = 18;

const DIST = 40;
const ELEV = THREE.MathUtils.degToRad(45);
const AZIM = THREE.MathUtils.degToRad(45);

export const OFFSET = new THREE.Vector3(
  DIST * Math.cos(ELEV) * Math.sin(AZIM),
  DIST * Math.sin(ELEV),
  DIST * Math.cos(ELEV) * Math.cos(AZIM)
);

export function createCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    (-VIEW_SIZE * aspect) / 2, (VIEW_SIZE * aspect) / 2,
    VIEW_SIZE / 2, -VIEW_SIZE / 2,
    0.1, 200
  );
  camera.userData.focus = new THREE.Vector3(0, 0, 0);
  camera.userData.shake = new THREE.Vector3(0, 0, 0);
  camera.position.copy(OFFSET);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function applyCameraTransform(camera) {
  camera.position.copy(camera.userData.focus).add(OFFSET).add(camera.userData.shake);
}

export function panCamera(camera, x, z, duration = 1.1) {
  return gsap.to(camera.userData.focus, {
    x, z, duration, ease: 'power2.inOut',
    onUpdate: () => applyCameraTransform(camera),
  });
}

export function zoomCamera(camera, viewSize, duration = 1.0) {
  const state = { v: camera.top * 2 };
  return gsap.to(state, {
    v: viewSize, duration, ease: 'power2.inOut',
    onUpdate: () => {
      const aspect = window.innerWidth / window.innerHeight;
      camera.left = (-state.v * aspect) / 2;
      camera.right = (state.v * aspect) / 2;
      camera.top = state.v / 2;
      camera.bottom = -state.v / 2;
      camera.updateProjectionMatrix();
    },
  });
}

export function shakeCamera(camera, strength = 0.5, duration = 0.45) {
  const s = camera.userData.shake;
  const start = performance.now();
  // Deterministic decay shake — no Math.random, the demo must be rehearsable.
  function step() {
    const elapsed = (performance.now() - start) / 1000;
    const k = Math.max(0, 1 - elapsed / duration);
    if (k <= 0) {
      s.set(0, 0, 0);
      applyCameraTransform(camera);
      return;
    }
    const p = elapsed * 58;
    s.set(Math.sin(p) * strength * k, Math.sin(p * 1.7) * strength * 0.6 * k, Math.cos(p * 1.3) * strength * k);
    applyCameraTransform(camera);
    requestAnimationFrame(step);
  }
  step();
}

export function resizeCamera(camera, renderer) {
  const aspect = window.innerWidth / window.innerHeight;
  const v = camera.top * 2;
  camera.left = (-v * aspect) / 2;
  camera.right = (v * aspect) / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
