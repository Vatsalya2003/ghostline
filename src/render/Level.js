import * as THREE from 'three';
import { PALETTE } from './Scene.js';

// The industrial compound. Walls block nothing mechanically yet — they are
// read by the player as cover and by the camera as a place to breach.
const WALL_H = 1.8;

function wallMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x1d2724, roughness: 0.9, metalness: 0.05, flatShading: true,
  });
}

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function createLevel(scene) {
  const group = new THREE.Group();
  group.name = 'level';
  const wm = wallMat();

  // Compound shell: x -2..8, z -8..2, with a gap in the south wall.
  const segments = [
    [10, -8, 0.4, 10],        // north wall  (w, z, d, xSpanCenterless)
  ];
  void segments;

  const walls = [
    box(10.4, WALL_H, 0.4, wm, 3, WALL_H / 2, -8),   // north
    box(0.4, WALL_H, 10.4, wm, -2, WALL_H / 2, -3),  // west
    box(0.4, WALL_H, 10.4, wm, 8, WALL_H / 2, -3),   // east
    box(3.6, WALL_H, 0.4, wm, -0.2, WALL_H / 2, 2),  // south-left
    box(4.4, WALL_H, 0.4, wm, 5.8, WALL_H / 2, 2),   // south-right
  ];
  walls.forEach((w) => group.add(w));

  // Breach door — the gap between the two south segments, turn 3.
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x35302a, emissive: PALETTE.amber, emissiveIntensity: 0.18,
    roughness: 0.7, metalness: 0.3, flatShading: true,
  });
  const door = box(2.0, WALL_H * 0.95, 0.3, doorMat, 2.6, WALL_H * 0.47, 2);
  door.name = 'breach-door';
  group.add(door);

  // Interior divider so the interior turn has geometry to hide behind.
  group.add(box(0.35, WALL_H, 5.0, wm, 3.2, WALL_H / 2, -5.4));

  // Dead generator — turn 2's false alarm. Unlit on purpose.
  const gen = new THREE.Group();
  gen.add(box(1.6, 1.2, 1.2, new THREE.MeshStandardMaterial({
    color: 0x2a2f2c, roughness: 0.85, flatShading: true,
  }), 0, 0.6, 0));
  gen.add(box(0.3, 0.9, 0.3, new THREE.MeshStandardMaterial({
    color: 0x1a1f1d, roughness: 0.9, flatShading: true,
  }), 0.5, 1.5, 0));
  gen.position.set(-5.5, 0, -1.5);
  gen.name = 'generator';
  group.add(gen);

  // Relay tower — the objective.
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x263533, emissive: PALETTE.cyan, emissiveIntensity: 0.12,
    roughness: 0.6, metalness: 0.35, flatShading: true,
  });
  const tower = new THREE.Group();
  tower.add(box(1.2, 3.4, 1.2, towerMat, 0, 1.7, 0));
  tower.add(box(1.9, 0.25, 1.9, towerMat, 0, 3.5, 0));
  const beacon = box(0.35, 0.35, 0.35, new THREE.MeshStandardMaterial({
    color: PALETTE.cyan, emissive: PALETTE.cyan, emissiveIntensity: 2.2, flatShading: true,
  }), 0, 3.85, 0);
  beacon.name = 'beacon';
  tower.add(beacon);
  tower.position.set(5.5, 0, -5.5);
  tower.name = 'relay-tower';
  group.add(tower);

  // Relay console — turn 5.
  const consoleMat = new THREE.MeshStandardMaterial({
    color: 0x2b3a37, emissive: PALETTE.cyan, emissiveIntensity: 0.4,
    roughness: 0.5, flatShading: true,
  });
  const relayConsole = box(1.0, 0.9, 0.7, consoleMat, 1.2, 0.45, -5.0);
  relayConsole.name = 'relay-console';
  group.add(relayConsole);

  // Crates and debris — cover and texture.
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a2e, roughness: 0.95, flatShading: true,
  });
  const crates = [
    [-3.5, 4.0, 0.9], [-2.2, 4.6, 0.7], [0.5, 0.2, 0.8], [4.5, -1.5, 1.0],
    [6.6, -3.2, 0.7], [-0.8, -6.2, 0.9], [6.2, 0.4, 0.8], [-6.5, 1.2, 0.7],
  ];
  for (const [x, z, s] of crates) {
    const c = box(s, s, s, crateMat, x, s / 2, z);
    c.rotation.y = (x * 13.7 + z * 7.3) % Math.PI; // deterministic scatter
    group.add(c);
  }

  scene.add(group);
  return { group, door, tower, beacon, generator: gen, relayConsole };
}
