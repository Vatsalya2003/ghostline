import * as THREE from 'three';
import { PALETTE, addPractical } from './Scene.js';
import { spawnProp } from './AssetLoader.js';
import { surfaceMaterial } from './Materials.js';

// Relay Station 7 — an abandoned industrial compound.
//
// The shell is still built in code. Its dimensions are load-bearing: the
// mission file moves units to literal coordinates, the breach beat drops a
// door at x 2.6, and the camera pans to fixed marks. A modular wall kit would
// have to be cut to those numbers anyway, so the walls stay procedural and
// the CC0 kit is spent where it actually shows — the clutter that makes the
// place read as a facility somebody used to work in.
//
// Everything below the shell is placement data. See public/assets/SOURCES.md
// for what each prop is and where it came from.

const WALL_H = 1.8;
const WALL_T = 0.4;

// Compound footprint. Referenced by the layout tables further down, so moving
// a wall moves the things that lean on it.
const NORTH = -8;
const SOUTH = 2;
const WEST = -2;
const EAST = 8;
const DOOR_X = 2.6;
const DOOR_W = 2.0;

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A wall run with a plinth, a capping beam and regular pilasters. Three boxes
// per segment instead of one, which is what stops a 10-metre slab reading as
// a grey rectangle under a flat key light — the ribs catch it and give the
// eye something to measure the compound against.
function wallRun(group, { x, z, length, axis, height = WALL_H }) {
  const body = surfaceMaterial('concrete');
  const trim = surfaceMaterial('concreteDim');
  const along = axis === 'x';
  const w = along ? length : WALL_T;
  const d = along ? WALL_T : length;

  group.add(box(w, height, d, body, x, height / 2, z));
  group.add(box(along ? length : WALL_T * 1.5, 0.22, along ? WALL_T * 1.5 : length, trim, x, 0.11, z));
  group.add(box(along ? length : WALL_T * 1.3, 0.16, along ? WALL_T * 1.3 : length, trim, x, height - 0.05, z));

  // Pilasters every ~2.4 units, inset slightly so they read as structure.
  const count = Math.max(2, Math.round(length / 2.4));
  for (let i = 0; i <= count; i++) {
    const t = -length / 2 + (i / count) * length;
    const px = along ? x + t : x;
    const pz = along ? z : z + t;
    group.add(box(along ? 0.3 : WALL_T + 0.16, height * 0.92, along ? WALL_T + 0.16 : 0.3,
      trim, px, height * 0.46, pz));
  }
}

// -------------------------------------------------------- recon & objectives
//
// Named places in the compound, in world coordinates. The mission file talks
// about "the outbuilding", "the divider", "the entry" in prose and moves units
// to literal numbers; it has no table of where those words point. Rather than
// push coordinates into mission data — which is gameplay's file, and which
// would be a second source of truth for the same positions — the presentation
// layer keeps its own gazetteer here and resolves by name.
//
// `hover` is how high the drone sits over the place while it inspects it;
// taller structures need more clearance than open ground.
// `y` is the height a ground marker has to sit at to clear whatever is already
// standing there — the relay mast has a 0.3-unit plinth, and a marker ring laid
// on the floor would be swallowed by it.
export const PLACES = {
  perimeter:   { x: -3.6, z: 2.6, y: 0.10, hover: 3.0, label: 'PERIMETER' },
  outbuilding: { x: -5.5, z: -1.5, y: 0.02, hover: 3.2, label: 'W OUTBUILDING' },
  entry:       { x: 2.6, z: -0.4, y: 0.10, hover: 3.2, label: 'ENTRY HALL' },
  divider:     { x: 3.2, z: -5.4, y: 0.10, hover: 3.4, label: 'INTERIOR DIVIDER' },
  relay:       { x: 5.5, z: -5.5, y: 0.34, hover: 4.6, label: 'RELAY MAST' },
  console:     { x: 1.2, z: -5.0, y: 0.14, hover: 3.0, label: 'RELAY CONSOLE' },
  extraction:  { x: -6.5, z: 5.2, y: 0.02, hover: 3.2, label: 'EXTRACTION' },
};

// Which place a recon sweep goes to, by turn. The mission's four SEND_DRONE
// beats each describe a different piece of ground, and the player is supposed
// to be able to see that the drone went somewhere different each time.
const RECON_BY_TURN = {
  1: 'perimeter',     // APPROACH  — "route confirmed clear, as reported"
  2: 'outbuilding',   // CONTACT   — "drone sweeps the outbuilding"
  3: 'entry',         // BREACH    — "drone enters first"
  4: 'divider',       // INTERIOR  — "drone clears the divider"
  5: 'console',       // RELAY
  6: 'extraction',    // EXTRACT
};

// `outcome.reveal` names a level object directly; it wins over the turn table
// because it is the mission file being explicit about where to look.
const REVEAL_PLACE = {
  generator: 'outbuilding',
  tower: 'relay',
  relayConsole: 'console',
  door: 'entry',
};

// Resolve a recon destination from whatever the turn happens to carry.
// Falls back to the relay — the mission objective — so a turn that grows a
// new drone option later still sends the aircraft somewhere sensible.
export function reconTarget({ turnId, reveal } = {}) {
  const key = (reveal && REVEAL_PLACE[reveal])
    || RECON_BY_TURN[turnId]
    || 'relay';
  return { key, ...PLACES[key] };
}

// Deterministic scatter. Every run of the demo has to look identical, so
// nothing here touches Math.random.
function jitter(seed, spread = 1) {
  return (Math.sin(seed * 127.1) * 43758.5453 % 1) * spread;
}

// -------------------------------------------------------------- prop layout
// [prop, x, z, { rotation in turns, and either height or size in world units }]
//
// `size` fits the model's largest dimension and is what flat props want; a
// floor pipe asked for a height would inflate sevenfold. See AssetLoader.

const PERIMETER = [
  // Comms mast cluster on the north-east corner — the reason the place exists.
  ['antenna-mast', 7.2, -7.2, { height: 3.4, rot: 0.12 }],
  ['antenna-mast', 6.4, -7.6, { height: 2.4, rot: 0.61 }],
  ['antenna-array', -1.2, -7.3, { height: 1.1, rot: 0.3 }],
  // Plant against the north and east walls.
  ['storage-tank', -0.6, -7.2, { height: 1.9, rot: 0.0 }],
  ['storage-tank', 0.4, -7.2, { height: 1.9, rot: 0.5 }],
  ['ac-unit', 4.4, -7.4, { height: 0.9, rot: 0.0 }],
  ['ac-stacked', 5.4, -7.4, { height: 1.5, rot: 0.0 }],
  ['vent', 7.6, -4.2, { size: 1.1, rot: 0.25 }],
  ['vent', 7.6, -2.6, { size: 1.1, rot: 0.25 }],
  ['pipe-bundle', 7.5, -6.0, { size: 3.0, rot: 0.25 }],
  ['pipe-bundle', -1.5, -3.4, { size: 3.0, rot: 0.25 }],
  ['cable-thick', 7.7, -5.0, { height: 1.5, rot: 0.0, anchor: 'top' }],
  ['cable-long', -1.8, -5.8, { height: 1.7, rot: 0.0, anchor: 'top' }],
  ['strut-long', 7.8, -1.2, { height: 2.6, rot: 0.25 }],
  ['strut', 1.0, -7.7, { size: 0.9, rot: 0.0 }],
  // Two gantry columns. The compound is otherwise all low horizontals, and a
  // pair of verticals inside the wire gives the eye something to measure the
  // walkers against once they are through the breach.
  ['column', 2.3, -3.1, { height: 3.0, rot: 0.0 }],
  ['column', 6.0, -3.1, { height: 3.0, rot: 0.0 }],
];

const INTERIOR = [
  // Cover and working clutter inside the compound.
  ['container', 5.8, -2.0, { size: 2.6, rot: 0.02 }],
  ['container', 5.6, -0.2, { size: 2.6, rot: 0.51 }],
  ['supply-crate', 4.3, -1.4, { height: 0.75, rot: 0.08 }],
  ['supply-crate', 4.6, -0.7, { height: 0.75, rot: 0.34 }],
  ['supply-crate', 0.6, 0.4, { height: 0.75, rot: 0.17 }],
  ['barrel', 6.8, -3.4, { height: 1.0, rot: 0.0 }],
  ['barrel', 7.1, -3.0, { height: 1.0, rot: 0.2 }],
  ['barrel', 2.0, -0.9, { height: 1.0, rot: 0.4 }],
  ['drum', 6.5, -0.9, { height: 1.1, rot: 0.1 }],
  ['propane-tank', 3.9, -6.6, { height: 1.2, rot: 0.33 }],
  ['propane-tank', 4.4, -6.4, { height: 1.2, rot: 0.08 }],
  ['fuel-can', 1.9, -3.2, { height: 0.6, rot: 0.42 }],
  ['battery', 1.7, -4.4, { height: 0.5, rot: 0.1 }],
  // Powered kit clustered around the relay console.
  ['terminal-bank', 0.2, -5.6, { height: 2.0, rot: 0.02 }],
  ['terminal', 2.3, -5.6, { height: 1.1, rot: 0.75 }],
  ['monitor', 2.4, -4.6, { height: 1.0, rot: 0.75 }],
  ['console', 0.0, -4.2, { height: 1.7, rot: 0.25 }],
  // A defence emplacement nobody is manning any more.
  ['turret', 6.6, -6.4, { size: 1.8, rot: 0.62 }],
  ['sign-hazard', 3.2, -2.4, { size: 1.2, rot: 0.0 }],
  ['railing', 3.2, -1.5, { size: 2.4, rot: 0.0 }],
  ['pipe-straight', 1.0, -1.6, { size: 2.6, rot: 0.0 }],
  ['pipe-corner', -0.9, -1.6, { size: 2.2, rot: 0.5 }],
];

// Outside the wire, on the squad's approach. Sparser — it has to stay legible
// as "open ground you cross" and never compete with the compound.
const APPROACH = [
  ['fence', -6.6, 3.4, { height: 1.3, rot: 0.02 }],
  ['fence', -5.9, 3.4, { height: 1.3, rot: 0.0 }],
  ['fence', -5.2, 3.45, { height: 1.3, rot: 0.04 }],
  ['fence', -3.6, 3.5, { height: 1.3, rot: 0.98 }],
  ['sign-hazard', -4.4, 3.4, { size: 1.0, rot: 0.1 }],
  ['supply-crate', -7.4, 6.4, { height: 0.8, rot: 0.12 }],
  ['barrel', -6.9, 5.6, { height: 1.0, rot: 0.0 }],
  ['drum', -2.2, 6.2, { height: 1.1, rot: 0.3 }],
  ['container', -9.0, 2.6, { size: 2.6, rot: 0.14 }],
  ['pipe-straight', -8.6, -1.0, { size: 2.8, rot: 0.12 }],
  ['strut', -7.0, 0.2, { size: 1.0, rot: 0.3 }],
  ['floodlight', -9.4, 4.2, { height: 3.2, rot: 0.55 }],
  ['floodlight', 9.0, 1.2, { height: 3.2, rot: 0.18 }],
  ['antenna-mast', -10.2, -3.0, { height: 2.8, rot: 0.4 }],
];

// Props flat enough that their shadow is a smear under their own footprint.
// The key light is the only shadow caster in the scene and it re-renders every
// caster each frame, so dropping the floor clutter out of that pass is free
// frame time for a shadow nobody can see at a 45-degree camera.
const NO_SHADOW_BELOW = 0.5;

function placeProps(group, table) {
  for (const [name, x, z, opts = {}] of table) {
    const { group: holder, ready } = spawnProp(name, {
      height: opts.height,
      size: opts.size,
      rotY: (opts.rot || 0) * Math.PI * 2,
      // A few kit props hang from their top (cable drops). Keeping their own
      // origin and lifting them by hand is cheaper than re-authoring the file.
      anchor: opts.anchor === 'top' ? 'center' : 'ground',
    });
    holder.position.set(x, opts.anchor === 'top' ? (opts.height || 1) : 0, z);
    group.add(holder);

    ready.then((res) => {
      if (!res) return;
      // Reproduce the scale AssetLoader applied, to get the prop's real height
      // in world units: `height` sets it directly, `size` fits the largest
      // dimension and the height falls out of the model's own proportions.
      const b = res.bounds.size;
      const worldHeight = opts.height
        ? opts.height
        : b.y * (opts.size / Math.max(b.x, b.y, b.z));
      if (worldHeight >= NO_SHADOW_BELOW) return;
      res.model.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    });
  }
}

// Angular rubble, built in code. The CC0 rock models in this kit ship Draco
// compressed, and pulling in a WASM decoder to save 12 KB of geometry is a
// bad trade for an offline demo — these are six triangles each and land in
// the same visual slot.
function rubbleField(group, spots) {
  const mat = surfaceMaterial('concreteDim');
  for (const [x, z, s, seed] of spots) {
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
    chunk.position.set(x, s * 0.34, z);
    chunk.rotation.set(jitter(seed) * 3, jitter(seed + 1) * 6, jitter(seed + 2) * 3);
    chunk.scale.set(1, 0.55 + jitter(seed + 3, 0.3), 1);
    chunk.castShadow = true;
    chunk.receiveShadow = true;
    group.add(chunk);
  }
}

export function createLevel(scene) {
  const group = new THREE.Group();
  group.name = 'level';

  // ------------------------------------------------------------- the shell
  const southLeftLen = (DOOR_X - DOOR_W / 2) - WEST;
  const southRightLen = EAST - (DOOR_X + DOOR_W / 2);

  wallRun(group, { x: (WEST + EAST) / 2, z: NORTH, length: EAST - WEST + WALL_T, axis: 'x' });
  wallRun(group, { x: WEST, z: (NORTH + SOUTH) / 2, length: SOUTH - NORTH + WALL_T, axis: 'z' });
  wallRun(group, { x: EAST, z: (NORTH + SOUTH) / 2, length: SOUTH - NORTH + WALL_T, axis: 'z' });
  wallRun(group, { x: WEST + southLeftLen / 2, z: SOUTH, length: southLeftLen, axis: 'x' });
  wallRun(group, { x: EAST - southRightLen / 2, z: SOUTH, length: southRightLen, axis: 'x' });

  // Interior divider, so the inside turn has something to move behind.
  wallRun(group, { x: 3.2, z: -5.4, length: 5.0, axis: 'z', height: WALL_H * 0.9 });

  // A collapsed stretch of the east wall. Nothing gameplay reads it, but a
  // compound with one breach already in it makes the one you blow feel like
  // part of a place rather than a scripted effect.
  rubbleField(group, [
    [8.1, -3.9, 0.42, 3], [7.6, -3.5, 0.3, 7], [8.5, -4.4, 0.34, 11],
    [8.8, -3.4, 0.26, 19], [7.3, -4.3, 0.22, 23],
    [2.6, 2.9, 0.24, 31], [3.4, 2.7, 0.2, 37], [1.8, 3.0, 0.18, 41],
    [-2.4, 0.6, 0.28, 43], [-2.7, -0.2, 0.22, 47],
  ]);

  // Concrete apron under the compound: a slab the walls sit on, a shade off
  // the open ground so the footprint of the facility is legible from above
  // even where the fog has not been lifted.
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(EAST - WEST + 2.2, 0.08, SOUTH - NORTH + 2.2),
    surfaceMaterial('concreteDim')
  );
  apron.position.set((WEST + EAST) / 2, 0.04, (NORTH + SOUTH) / 2);
  apron.receiveShadow = true;
  group.add(apron);

  // -------------------------------------------------------------- the door
  // Kept a single Mesh with its own material: the breach beat tweens
  // door.rotation, door.position and door.material.emissiveIntensity, and
  // main.js resets all three on restart.
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x35302a, emissive: PALETTE.amber, emissiveIntensity: 0.18,
    roughness: 0.7, metalness: 0.35, flatShading: true,
  });
  const door = box(DOOR_W, WALL_H * 0.95, 0.3, doorMat, DOOR_X, WALL_H * 0.47, SOUTH);
  door.name = 'breach-door';
  group.add(door);

  // Frame around the doorway. A separate group, so it stays standing when the
  // door itself is blown off its hinges.
  const frame = surfaceMaterial('steelDark');
  group.add(box(0.28, WALL_H + 0.2, 0.5, frame, DOOR_X - DOOR_W / 2 - 0.1, (WALL_H + 0.2) / 2, SOUTH));
  group.add(box(0.28, WALL_H + 0.2, 0.5, frame, DOOR_X + DOOR_W / 2 + 0.1, (WALL_H + 0.2) / 2, SOUTH));
  group.add(box(DOOR_W + 0.7, 0.26, 0.5, frame, DOOR_X, WALL_H + 0.07, SOUTH));

  // --------------------------------------------------------- the generator
  // Turn 2's false alarm. Dead on purpose — nothing on it is emissive.
  const gen = new THREE.Group();
  gen.add(box(1.6, 1.2, 1.2, surfaceMaterial('steelDark'), 0, 0.6, 0));
  gen.add(box(1.75, 0.16, 1.35, surfaceMaterial('concreteDim'), 0, 0.08, 0));
  gen.add(box(0.3, 0.9, 0.3, surfaceMaterial('rust'), 0.5, 1.5, 0));
  gen.add(box(0.22, 0.22, 1.3, surfaceMaterial('rust'), -0.55, 0.95, 0));
  gen.position.set(-5.5, 0, -1.5);
  gen.name = 'generator';
  group.add(gen);
  placeProps(gen, [
    ['ac-unit', 1.4, 0.2, { height: 0.85, rot: 0.25 }],
    ['barrel', -1.3, 0.8, { height: 1.0, rot: 0.1 }],
    ['fuel-can', -1.1, -0.6, { height: 0.6, rot: 0.2 }],
  ]);

  // ------------------------------------------------------- the relay tower
  // The objective. A lattice mast rather than a smooth box: it has to read as
  // communications infrastructure from across the board, and a silhouette of
  // struts does that where a cylinder does not.
  const towerSteel = surfaceMaterial('steelLight');
  const tower = new THREE.Group();
  tower.add(box(1.7, 0.3, 1.7, surfaceMaterial('concreteDim'), 0, 0.15, 0));

  const LEG = 0.5;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box(0.16, 3.5, 0.16, towerSteel, sx * LEG, 1.9, sz * LEG);
    // Taper the mast: legs lean in toward the platform.
    leg.rotation.set(sz * 0.045, 0, -sx * 0.045);
    tower.add(leg);
  }
  for (const y of [0.9, 1.9, 2.9]) {
    tower.add(box(LEG * 2.1, 0.09, 0.1, towerSteel, 0, y, -LEG));
    tower.add(box(LEG * 2.1, 0.09, 0.1, towerSteel, 0, y, LEG));
    tower.add(box(0.1, 0.09, LEG * 2.1, towerSteel, -LEG, y, 0));
    tower.add(box(0.1, 0.09, LEG * 2.1, towerSteel, LEG, y, 0));
  }
  tower.add(box(1.5, 0.16, 1.5, towerSteel, 0, 3.62, 0));

  // Beacon. Director tweens beacon.material.emissiveIntensity on the relay
  // beat, so it keeps its own material.
  const beaconMat = new THREE.MeshStandardMaterial({
    color: PALETTE.cyan, emissive: PALETTE.cyan, emissiveIntensity: 2.2, flatShading: true,
  });
  const beacon = box(0.3, 0.3, 0.3, beaconMat, 0, 3.86, 0);
  beacon.name = 'beacon';
  beacon.castShadow = false;
  tower.add(beacon);

  tower.position.set(5.5, 0, -5.5);
  tower.name = 'relay-tower';
  group.add(tower);
  placeProps(tower, [
    ['antenna-array', 0, 0, { height: 1.0 }],          // dish on the platform
    ['antenna-mast', -0.5, 0.3, { height: 1.5, rot: 0.2 }],
  ]);
  // Lift the platform kit onto the deck rather than the floor.
  for (const child of tower.children.slice(-2)) child.position.y = 3.7;

  // ----------------------------------------------------- the relay console
  // A cabinet with a lit panel, not a glowing cube. The emissive is kept low:
  // under ACES an intensity of 0.4 on full cyan clips to white and the console
  // stops reading as an object at all.
  const consoleBody = new THREE.Group();
  consoleBody.add(box(1.0, 0.9, 0.7, surfaceMaterial('steelDark'), 0, 0.45, 0));
  consoleBody.add(box(1.1, 0.1, 0.8, surfaceMaterial('concreteDim'), 0, 0.05, 0));

  const consoleMat = new THREE.MeshStandardMaterial({
    color: 0x16302f, emissive: PALETTE.cyan, emissiveIntensity: 0.9,
    roughness: 0.4, flatShading: true,
  });
  const relayConsole = box(0.74, 0.44, 0.06, consoleMat, 0, 0.62, 0.36);
  relayConsole.name = 'relay-console';
  consoleBody.add(relayConsole);
  consoleBody.position.set(1.2, 0, -5.0);
  group.add(consoleBody);

  // ------------------------------------------------------------ the dress
  placeProps(group, PERIMETER);
  placeProps(group, INTERIOR);
  placeProps(group, APPROACH);

  // Practical lights. Four, unshadowed, matched to fixtures that are
  // actually in the scene — the two floodlights on the approach, the glow off
  // the terminal bank, and the relay mast. The beacon's own emissive is what
  // the Director tweens on the relay beat; this light only pools it onto the
  // platform so the objective is findable before that beat ever fires.
  addPractical(scene, { x: -9.4, y: 3.0, z: 4.2, color: 0xffc07a, intensity: 9, distance: 9 });
  addPractical(scene, { x: 9.0, y: 3.0, z: 1.2, color: 0xffc07a, intensity: 9, distance: 9 });
  addPractical(scene, { x: 0.6, y: 1.4, z: -5.2, color: 0x4ce0d8, intensity: 5, distance: 6 });
  // On the relay mast. Small radius, so it pools on the platform and marks the
  // objective from across the board without lighting the compound.
  addPractical(scene, { x: 5.5, y: 3.9, z: -5.5, color: 0x4ce0d8, intensity: 6, distance: 5.5 });

  scene.add(group);
  return { group, door, tower, beacon, generator: gen, relayConsole };
}
