import * as THREE from 'three';
import { GROUND_SIZE, PALETTE } from './Scene.js';

// Dark plane over the ground: everything not inside a cone reads as unknown.
// Cones draw additively on top of this, so lit area = visible area.
export function createFogOfWar(scene) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshBasicMaterial({
      color: PALETTE.fog,
      transparent: true,
      opacity: PALETTE.fogOpacity,
      depthWrite: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  mesh.renderOrder = 5;
  mesh.name = 'fog';
  scene.add(mesh);
  return mesh;
}
