import * as THREE from 'three';
import { spawnProp } from './AssetLoader.js';
import { seabedHeight, CABLE } from './Seabed.js';

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

const MAX_TILT = THREE.MathUtils.degToRad(10);
const clamp = THREE.MathUtils.clamp;

function onSeabed(object, x, z,
                  { sink = 0, rotY = 0, tiltToSlope = true, maxTilt = MAX_TILT } = {}) {
  object.position.set(x, seabedHeight(x, z) - sink, z);
  object.rotation.set(0, rotY, 0);
  if (tiltToSlope) {
    // Wide baseline, and clamped. A 0.9 m sample straddles a single sand
    // ripple and reads its flank as a 30-degree hillside — which is what
    // stood every prop on this map up at an angle nothing on a seabed sits
    // at, and made the range look like a dropped toybox.
    const e = 2.2;
    const dx = seabedHeight(x + e, z) - seabedHeight(x - e, z);
    const dz = seabedHeight(x, z + e) - seabedHeight(x, z - e);
    object.rotation.x = clamp(Math.atan2(dz, 2 * e), -maxTilt, maxTilt);
    object.rotation.z = clamp(-Math.atan2(dx, 2 * e), -maxTilt, maxTilt);
  }
  return object;
}

// Walk the cable polyline at a fixed step, staying on the bottom. Used for
// both the cable itself and the mooring chain: anything long and flexible on
// a seabed follows the ground, and rotating it as one rigid body — which is
// what the chain used to do — throws it into the water column.
function alongGround(points, step, sink) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.y + (b.y - a.y) * t;
      out.push(new THREE.Vector3(x, seabedHeight(x, z) - sink, z));
    }
  }
  const last = points[points.length - 1];
  out.push(new THREE.Vector3(last.x, seabedHeight(last.x, last.y) - sink, last.y));
  return out;
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

// The trunk cable. One continuous object running the length of the range,
// lying in its own trench, passing every place the mission visits. This is
// what ties six camera positions into one location instead of six sets:
// wherever the player is looking, the cable is going somewhere else.
function trunkCable(group) {
  const path = alongGround(CABLE, 0.6, 0.12);
  const curve = new THREE.CatmullRomCurve3(path, false, 'catmullrom', 0.4);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(curve, path.length * 2, 0.11, 6, false),
    new THREE.MeshStandardMaterial({ color: 0x3a4038, roughness: 0.95, metalness: 0.1 })
  );
  cable.castShadow = cable.receiveShadow = true;
  cable.name = 'trunk-cable';
  group.add(cable);

  // Concrete tie-down saddles every few metres. Regular spacing is the tell
  // that says "installed" against a seabed where nothing else is regular.
  const saddleMat = new THREE.MeshStandardMaterial({
    color: 0x8a8574, roughness: 1.0, flatShading: true,
  });
  for (let i = 6; i < path.length; i += 11) {
    const pt = path[i];
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.34), saddleMat);
    onSeabed(saddle, pt.x, pt.z, { sink: 0.1, rotY: i * 0.4 });
    saddle.castShadow = saddle.receiveShadow = true;
    group.add(saddle);
  }
  return cable;
}

// RANGE INSTRUMENT 7 — the anomaly. Four metres of hull, part buried, with
// the sheared mooring plate and the chain that gives the game away.
function rangeInstrument(group) {
  const pkg = new THREE.Group();
  pkg.name = 'range-instrument-7';

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xb4a894, roughness: 0.78, metalness: 0.32, flatShading: true,
  });
  const growthMat = new THREE.MeshStandardMaterial({
    color: 0x6f8a5c, roughness: 1.0, flatShading: true,
  });
  const rustMat = new THREE.MeshStandardMaterial({
    color: 0x9c5f38, roughness: 0.95, metalness: 0.12, flatShading: true,
  });

  // Lying on its side, nose down into the sediment it ploughed into. The
  // attitude is the story: this thing arrived here sideways, under tow.
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.58, 3.8, 14), hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.rotation.x = 0.12;
  hull.position.set(0, 0.5, 0);
  hull.castShadow = hull.receiveShadow = true;
  pkg.add(hull);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 9), hullMat);
  cap.position.set(1.9, 0.46, 0);
  cap.castShadow = true;
  pkg.add(cap);

  // Banding and a rusted collar — something that has been down here long
  // enough to have a history, not a clean grey cylinder.
  for (const [x, r] of [[-1.2, 0.67], [0.4, 0.67]]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 14), rustMat);
    band.rotation.z = Math.PI / 2;
    band.position.set(x, 0.5, 0);
    pkg.add(band);
  }

  // The instrument mast it was moored by, bent where it took the load.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.6, 7), hullMat);
  mast.position.set(-1.0, 1.25, 0.18);
  mast.rotation.z = 0.42;
  mast.castShadow = true;
  pkg.add(mast);

  // Marine growth along the upper surface. It only grows on the top, which
  // is how you know the hull has not rolled since it settled.
  for (let i = 0; i < 11; i++) {
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.13 + (i % 3) * 0.07, 0), growthMat);
    blob.position.set(-1.7 + i * 0.36, 1.02 - (i % 2) * 0.06, -0.12 + (i % 3) * 0.22);
    pkg.add(blob);
  }

  // The sheared mooring plate: the actual cause, sitting in plain sight.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.72), rustMat);
  plate.position.set(-2.0, 0.12, -0.35);
  plate.rotation.set(0.2, 0.5, 0.1);
  plate.castShadow = true;
  pkg.add(plate);

  // The one lit thing on the range. Turn 5's `relay` FX pulses on it, which
  // is exactly the beat where the anomaly is finally identified.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 12, 9),
    new THREE.MeshStandardMaterial({
      color: 0x9fe4ea, emissive: 0x4ce0d8, emissiveIntensity: 1.8,
    })
  );
  beacon.position.set(-1.0, 2.0, 0.18);
  beacon.name = 'instrument-beacon';
  pkg.add(beacon);

  // Nearly level: a 4-tonne package settles flat, and letting the terrain
  // sampler tip it put the whole assembly on its ear.
  onSeabed(pkg, SCAR_TO.x, SCAR_TO.y, {
    sink: 0.3, rotY: 0.55, maxTilt: THREE.MathUtils.degToRad(5),
  });
  group.add(pkg);

  // The chain, laid in world space along the scar rather than parented to the
  // hull. Parenting it meant the package's own tilt swung a seven-metre tail
  // up into the water column — the bounding box came out nine metres tall.
  // It belongs on the bottom, in the furrow it helped cut.
  const chain = new THREE.Group();
  chain.name = 'mooring-chain';
  const linkMat = new THREE.MeshStandardMaterial({
    color: 0x6e6455, roughness: 0.88, metalness: 0.5,
  });
  const dir = SCAR_FROM.clone().sub(SCAR_TO).normalize();
  const linkGeo = new THREE.TorusGeometry(0.15, 0.05, 6, 10);
  for (let i = 0; i < 22; i++) {
    const d = 2.1 + i * 0.34;
    const x = SCAR_TO.x + dir.x * d;
    const z = SCAR_TO.y + dir.y * d;
    const link = new THREE.Mesh(linkGeo, linkMat);
    link.position.set(x, seabedHeight(x, z) + 0.07, z);
    // Alternate links stand on edge, the way a real chain lies.
    link.rotation.set(i % 2 ? Math.PI / 2 : 0, Math.atan2(dir.x, dir.y), 0);
    link.castShadow = link.receiveShadow = true;
    chain.add(link);
  }
  group.add(chain);

  return { tower: pkg, beacon };
}

export function createSeabedLevel(scene) {
  const group = new THREE.Group();
  group.name = 'range-9';

  placeProps(group, INSTALLATION);
  trunkCable(group);
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
