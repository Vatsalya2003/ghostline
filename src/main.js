import * as THREE from 'three';
import { createRenderer, createScene } from './render/Scene.js';
import { createCamera, resizeCamera, applyCameraTransform, panCamera } from './render/Camera.js';
import { createFogOfWar } from './render/FogOfWar.js';
import { createLevel } from './render/Level.js';
import { createSquad, STATUS } from './render/Units.js';

const canvas = document.getElementById('scene');
const renderer = createRenderer(canvas);
const camera = createCamera();
const { scene, ground } = createScene();

createFogOfWar(scene);
const level = createLevel(scene);
const squad = createSquad(scene);

// Step 4 check: click a tile, the selected unit glides there, cone follows.
let selected = squad.lead;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

canvas.addEventListener('pointerdown', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const onUnit = raycaster.intersectObjects(squad.all.map((u) => u.group), true)[0];
  if (onUnit) {
    let o = onUnit.object;
    while (o.parent && !squad.all.some((u) => u.group === o)) o = o.parent;
    selected = squad.all.find((u) => u.group === o) || selected;
    return;
  }

  const hit = raycaster.intersectObject(ground)[0];
  if (!hit) return;
  // Snap to tile centres.
  const x = Math.floor(hit.point.x) + 0.5;
  const z = Math.floor(hit.point.z) + 0.5;
  selected.moveTo(x, z);
});

window.addEventListener('resize', () => resizeCamera(camera, renderer));
applyCameraTransform(camera);

const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  squad.all.forEach((u) => u.update(t));
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

window.OP = { scene, camera, renderer, squad, level, STATUS, panCamera };
