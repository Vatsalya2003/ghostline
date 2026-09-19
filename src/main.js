import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRenderer, createScene, createPlaceholderUnits, PALETTE } from './render/Scene.js';
import { createCamera, resizeCamera } from './render/Camera.js';
import { SensorCone } from './render/SensorCones.js';
import { createFogOfWar } from './render/FogOfWar.js';

const canvas = document.getElementById('scene');
const renderer = createRenderer(canvas);
const camera = createCamera();
const { scene } = createScene();
const units = createPlaceholderUnits(scene);
const [lead, unit2, unit3] = units;

createFogOfWar(scene);

// Clean cone — long, steady, cyan.
const cleanCone = new SensorCone({ color: PALETTE.cyan, range: 9.5, fov: 72, degraded: 0 })
  .attachTo(lead)
  .addTo(scene);
cleanCone.setHeading(THREE.MathUtils.degToRad(35));

// Degraded cone — half the range, flickering, noisy, broken edges.
const brokenCone = new SensorCone({ color: PALETTE.amber, range: 4.75, fov: 72, degraded: 1 })
  .attachTo(unit2)
  .addTo(scene);
brokenCone.setHeading(THREE.MathUtils.degToRad(-120));

// A third, healthy cone so the contrast has a baseline.
const baselineCone = new SensorCone({ color: PALETTE.cyan, range: 8, fov: 60, degraded: 0, opacity: 0.45 })
  .attachTo(unit3)
  .addTo(scene);
baselineCone.setHeading(THREE.MathUtils.degToRad(150));

// Temporary, for checking framing only. Remove before step 5.
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

window.addEventListener('resize', () => resizeCamera(camera, renderer));

const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  cleanCone.update(t);
  brokenCone.update(t);
  baselineCone.update(t);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// Console handles while there is no UI yet.
window.OP = { scene, camera, renderer, units, cones: { cleanCone, brokenCone, baselineCone } };
