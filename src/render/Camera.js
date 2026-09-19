import * as THREE from 'three';

// Orthographic, ~45 deg elevation. Tactical diorama framing — no perspective
// camera, so there is no "camera inside a wall" class of bug.
export const VIEW_SIZE = 16;

export function createCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    (-VIEW_SIZE * aspect) / 2,
    (VIEW_SIZE * aspect) / 2,
    VIEW_SIZE / 2,
    -VIEW_SIZE / 2,
    0.1,
    200
  );

  const dist = 30;
  const elev = THREE.MathUtils.degToRad(45);
  const azim = THREE.MathUtils.degToRad(45);
  camera.position.set(
    dist * Math.cos(elev) * Math.sin(azim),
    dist * Math.sin(elev),
    dist * Math.cos(elev) * Math.cos(azim)
  );
  camera.lookAt(0, 0, 0);
  return camera;
}

export function resizeCamera(camera, renderer) {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-VIEW_SIZE * aspect) / 2;
  camera.right = (VIEW_SIZE * aspect) / 2;
  camera.top = VIEW_SIZE / 2;
  camera.bottom = -VIEW_SIZE / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
