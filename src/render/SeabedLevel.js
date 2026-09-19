import * as THREE from 'three';
import { spawnProp } from './AssetLoader.js';
import { seabedHeight } from './Seabed.js';

// ============================================================================
// TEST RANGE 9 — the installation
// ============================================================================
//
// Returns the same shape as createLevel() so the Director keeps working
// unchanged: { group, door, tower, beacon, generator, relayConsole }. The
// roles are re-cast for this mission —
//
//   tower / beacon  →  RANGE INSTRUMENT 7, the anomaly. Turn 5's `relay` FX
//                      pulses on it, which is exactly right: that is the
//                      moment the thing is finally identified.
//   generator       →  the old junction box on the cable trench.
//   door            →  unused down here, but the contract has to hold.
//
// Geography matches the mission turn by turn. The drag scar runs from the
// survey's charted fix to where the package actually is, so a player who
// reads the seabed gets there before ANCHOR concedes.

const SCAR_FROM = new THREE.Vector2(-1, 1);
const SCAR_TO = new THREE.Vector2(4, -7);

function onSeabed(object, x, z, { sink = 0, rotY = 0, tiltToSlope = true } = {}) {
  object.position.set(x, seabedHeight(x, z) - sink, z);
  object.rotation.y = rotY;
  if (tiltToSlope) {
    // Sample the slope and lie with it. Nothing on a seabed sits level.
    const e = 0.9;
    const dx = seabedHeight(x + e, z) - seabedHeight(x - e, z);
    const dz = seabedHeight(x, z + e) - seabedHeight(x, z - e);
    object.rotation.x = Math.atan2(dz, 2 * e);
    object.rotation.z = -Math.atan2(dx, 2 * e);
  }
  return object;
}

// Props, placed in composed groups rather than scattered.
const INSTALLATION = [
  // --- turn 1: the survey pillars. Charted, static, and the baseline the
  // whole mission is measured against.
  ['column', -7.4, 6.8, { height: 3.0 }],
  ['column', -5.0, 7.2, { height: 3.0 }],
  ['column', -7.0, 4.4, { height: 3.0 }],
  ['column', -4.6, 4.8, { height: 3.0 }],
  ['sign-hazard', -6.0, 8.4, { size: 1.0, rot: 0.3 }],

  // --- the cable trench: this range was wired once. The trench is why
  // there is junction hardware out here at all.
  ['cable-long', -3.0, 3.6, { height: 1.2, rot: 0.5, anchor: 'top' }],
  ['cable-thick', -0.6, 2.2, { height: 1.0, rot: 0.42, anchor: 'top' }],
  ['pipe-straight', 1.6, 0.4, { size: 2.4, rot: 0.45 }],
  ['pipe-corner', 3.0, -1.2, { size: 2.0, rot: 0.9 }],
  ['terminal', -2.2, 4.4, { height: 1.0, rot: 0.7 }],

  // --- turn 2: the charted fix. An empty mooring block with its chain
  // still shackled to nothing — this is where the package used to be.
  ['battery', -1.4, 1.6, { height: 0.5, rot: 0.2 }],
  ['barrel', -0.4, 0.4, { height: 0.9, rot: 0.6 }],

  // --- turn 4: the channel. Instrument frames on the shoulders, because
  // somebody once wanted readings from the flow that runs through it.
  ['strut-long', 10.6, -3.6, { height: 2.6, rot: 0.3 }],
  ['strut', 8.8, -6.4, { size: 1.0, rot: 0.8 }],
  ['railing', 11.4, -1.6, { size: 2.2, rot: 0.25 }],

  // --- turn 5: what is left around the package's resting place. Scoured
  // ground, shed hardware, a drum that came off the same mooring.
  ['drum', 6.0, -8.4, { height: 1.0, rot: 0.15 }],
  ['fuel-can', 5.0, -9.0, { height: 0.55, rot: 0.5 }],
  ['supply-crate', 2.4, -8.6, { height: 0.7, rot: 0.32 }],

  // --- background: an abandoned test platform, half buried, giving the eye
  // something with scale on the far side of the range.
  ['container', -12.5, -8.0, { size: 2.8, rot: 0.6 }],
  ['storage-tank', -14.0, -5.0, { height: 2.0, rot: 0.1 }],
  ['ac-stacked', -11.0, -5.6, { height: 1.4, rot: 0.4 }],
  ['antenna-array', -13.0, -10.5, { height: 1.2, rot: 0.8 }],
];

function placeProps(group, table) {
  for (const [name, x, z, opts = {}] of table) {
    const { group: holder, ready } = spawnProp(name, {
      height: opts.height, size: opts.size,
      anchor: opts.anchor || 'ground', rotY: opts.rot || 0,
    });
    onSeabed(holder, x, z, { rotY: opts.rot || 0 });
    ready.then((asset) => {
      if (!asset) return;
      asset.model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = (opts.height || opts.size || 1) > 0.5;
        child.receiveShadow = true;
        // Everything down here has been in the water for years. Knock the
        // specular off and push it green-grey; clean kit reads as dropped-in.
        if (child.material) {
          child.material.roughness = Math.min(1, (child.material.roughness ?? 0.7) + 0.25);
          child.material.metalness = Math.max(0, (child.material.metalness ?? 0.3) - 0.2);
          if (child.material.color) child.material.color.lerp(new THREE.Color(0x6f8079), 0.32);
        }
      });
    });
    group.add(holder);
  }
}

// RANGE INSTRUMENT 7 — the anomaly. Four metres of hull, part buried, with
// the sheared mooring plate and trailing chain that give the game away.
function rangeInstrument(group) {
  const pkg = new THREE.Group();
  pkg.name = 'range-instrument-7';

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x6d7a72, roughness: 0.82, metalness: 0.35, flatShading: true,
  });
  const growthMat = new THREE.MeshStandardMaterial({
    color: 0x55705a, roughness: 1.0, flatShading: true,
  });

  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 3.6, 12), hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.rotation.y = 0.35;
  hull.position.y = 0.45;
  hull.castShadow = hull.receiveShadow = true;
  pkg.add(hull);

  // End caps and the instrument mast it was moored by.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), hullMat);
  cap.position.set(1.72, 0.45, 0.62);
  pkg.add(cap);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.5, 6), hullMat);
  mast.position.set(-0.9, 1.15, 0.2);
  mast.rotation.z = 0.4;
  pkg.add(mast);

  // Marine growth along the upper surface — it has been down here a while.
  for (let i = 0; i < 9; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + (i % 3) * 0.06, 0), growthMat);
    blob.position.set(-1.5 + i * 0.4, 0.95, -0.1 + (i % 2) * 0.3);
    pkg.add(blob);
  }

  // The sheared mooring plate and its chain, trailing back up the scar.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), hullMat);
  plate.position.set(-1.9, 0.08, -0.4);
  plate.rotation.y = 0.5;
  pkg.add(plate);

  const linkMat = new THREE.MeshStandardMaterial({
    color: 0x55605c, roughness: 0.9, metalness: 0.45,
  });
  const dir = SCAR_FROM.clone().sub(SCAR_TO).normalize();
  for (let i = 0; i < 14; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 6, 10), linkMat);
    const d = 1.9 + i * 0.42;
    link.position.set(dir.x * d - 1.4, 0.1 + Math.sin(i * 1.3) * 0.04, dir.y * d - 0.2);
    link.rotation.x = Math.PI / 2;
    link.rotation.z = i * 0.6;
    pkg.add(link);
  }

  // The active emission source — turn 5's `relay` FX pulses on this, and it
  // is the one thing on the range that is lit.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0x8fd8e0, emissive: 0x4ce0d8, emissiveIntensity: 1.6,
    })
  );
  beacon.position.set(-0.9, 1.95, 0.2);
  beacon.name = 'instrument-beacon';
  pkg.add(beacon);

  onSeabed(pkg, SCAR_TO.x, SCAR_TO.y, { sink: 0.25, rotY: 0.6 });
  group.add(pkg);
  return { tower: pkg, beacon };
}

export function createSeabedLevel(scene) {
  const group = new THREE.Group();
  group.name = 'range-9';

  placeProps(group, INSTALLATION);
  const { tower, beacon } = rangeInstrument(group);

  // The junction box on the cable trench — stands in for `generator`.
  const junction = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.8, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x5c6a64, roughness: 0.95, flatShading: true })
  );
  junction.castShadow = junction.receiveShadow = true;
  onSeabed(junction, 0.8, 2.6, { sink: 0.15, rotY: 0.4 });
  junction.name = 'junction-box';
  group.add(junction);

  // Contract placeholder: there is no door on a seabed, but the Director's
  // breach beat reaches for one and mission 2 never fires it.
  const door = new THREE.Object3D();
  door.name = 'unused-door';
  group.add(door);

  scene.add(group);
  return { group, door, tower, beacon, generator: junction, relayConsole: junction };
}
