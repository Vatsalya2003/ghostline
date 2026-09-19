import * as THREE from 'three';
import { spawnProp } from './AssetLoader.js';
import { depotHeight, insideWire, WIRE, GATE } from './Depot.js';

// ============================================================================
// COMPOUND 14 — the installation
// ============================================================================
//
// Returns the same contract as createLevel() so the Director runs unchanged:
// { group, door, tower, beacon, generator, relayConsole }. The roles are
// re-cast for this mission —
//
//   tower / beacon  →  the AMMUNITION BUNKER and its charge indicator. Turn
//                      10's `relay` FX fires on it, which is exactly right:
//                      that beat is the detonation.
//   door            →  the main building's entry door, used by the breach beat.
//   generator       →  the generator hall, the EM source behind turn 7.
//   relayConsole    →  the charge panel on the bunker.
//
// The buildings are placed so the mission's ten camera positions walk a single
// line through the compound from the gate to the bunker. Nothing is decorative
// — the storage block exists because turn 2 needs something to hide a wall
// behind, and the fuel store exists because turn 3 needs something to catch
// fire.

const rand = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const MAX_TILT = THREE.MathUtils.degToRad(6);
const clamp = THREE.MathUtils.clamp;

function onGround(object, x, z, { sink = 0, rotY = 0, tiltToSlope = true } = {}) {
  object.position.set(x, depotHeight(x, z) - sink, z);
  object.rotation.set(0, rotY, 0);
  if (tiltToSlope) {
    // Wide baseline and clamped: a short sample straddles a single rut and
    // reads its flank as a hillside, which stands props up at silly angles.
    const e = 2.0;
    const dx = depotHeight(x + e, z) - depotHeight(x - e, z);
    const dz = depotHeight(x, z + e) - depotHeight(x, z - e);
    object.rotation.x = clamp(Math.atan2(dz, 2 * e), -MAX_TILT, MAX_TILT);
    object.rotation.z = clamp(-Math.atan2(dx, 2 * e), -MAX_TILT, MAX_TILT);
  }
  return object;
}

// ---------------------------------------------------------------- materials

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xa79d8c, roughness: 0.95, metalness: 0.02 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x7e7668, roughness: 0.96, metalness: 0.02 }),
  render: new THREE.MeshStandardMaterial({ color: 0xbcae95, roughness: 0.93, metalness: 0.02 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x6b6459, roughness: 0.88, metalness: 0.12 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.6, metalness: 0.55 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x9a6038, roughness: 0.92, metalness: 0.15 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x3a3833, roughness: 0.9, metalness: 0.2 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xc0b393, roughness: 0.98, metalness: 0 }),
};

function box(w, h, d, mat, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = true;
  return m;
}

// A building with real walls and a doorway, not a solid block. The camera sits
// at 45 degrees and looks over the near wall, so the inside is visible and has
// to actually be a room — turns 5 and 6 happen in one.
function shed(group, {
  x, z, w, d, h, rotY = 0, mat = MAT.render, roofMat = MAT.roof,
  door = null, open = false, name = 'building',
}) {
  const b = new THREE.Group();
  b.name = name;
  const t = 0.22;                              // wall thickness
  const y = depotHeight(x, z);

  const wall = (ww, dd, px, pz) => {
    const m = box(ww, h, dd, mat, px, h / 2, pz);
    b.add(m);
    return m;
  };

  // Back and two sides always. The front wall gets a doorway cut into it by
  // building it as two piers and a lintel.
  wall(w, t, 0, -d / 2);
  wall(t, d, -w / 2, 0);
  wall(t, d, w / 2, 0);

  const doorW = door?.width ?? 1.6;
  const doorH = door?.height ?? Math.min(2.2, h - 0.3);
  const off = door?.offset ?? 0;
  const leftW = (w / 2 + off) - doorW / 2;
  const rightW = (w / 2 - off) - doorW / 2;
  if (leftW > 0.05) wall(leftW, t, -w / 2 + leftW / 2, d / 2);
  if (rightW > 0.05) wall(rightW, t, w / 2 - rightW / 2, d / 2);
  const lintel = box(doorW, h - doorH, t, mat, off, doorH + (h - doorH) / 2, d / 2);
  b.add(lintel);

  // Roof, unless the mission needs to see in from above.
  if (!open) {
    const roof = box(w + 0.35, 0.22, d + 0.35, roofMat, 0, h + 0.11, 0);
    b.add(roof);
    // A parapet reads as a real roof rather than a lid.
    b.add(box(w + 0.45, 0.3, 0.16, mat, 0, h + 0.32, -(d / 2 + 0.14)));
    b.add(box(w + 0.45, 0.3, 0.16, mat, 0, h + 0.32, d / 2 + 0.14));
  }

  // Floor slab, so an open building is not a hole in the ground.
  b.add(box(w, 0.1, d, MAT.concreteDark, 0, 0.05, 0));

  b.position.set(x, y, z);
  b.rotation.y = rotY;
  group.add(b);
  return b;
}

// ---------------------------------------------------------------- perimeter

// The wall, built as panels with posts between them. Panels, not one long
// box: a compound wall is precast sections and the joints are what make it
// read as built rather than extruded.
function perimeter(group) {
  const wall = new THREE.Group();
  wall.name = 'perimeter';
  const H = 2.6, T = 0.3, PANEL = 3.0;

  const run = (ax, az, bx, bz, skip = null) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / PANEL));
    const ang = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i < n; i++) {
      const t0 = (i + 0.5) / n;
      const px = ax + (bx - ax) * t0;
      const pz = az + (bz - az) * t0;
      if (skip && Math.hypot(px - skip.x, pz - skip.y) < skip.r) continue;
      const seg = box(len / n - 0.1, H, T, MAT.concrete, 0, 0, 0);
      seg.position.set(px, depotHeight(px, pz) + H / 2 - 0.1, pz);
      seg.rotation.y = ang;
      wall.add(seg);
      // Capping course, a shade darker.
      const cap = box(len / n - 0.05, 0.14, T + 0.12, MAT.concreteDark, 0, 0, 0);
      cap.position.set(px, depotHeight(px, pz) + H - 0.03, pz);
      cap.rotation.y = ang;
      wall.add(cap);
    }
    // Posts at the panel joints.
    for (let i = 0; i <= n; i++) {
      const t0 = i / n;
      const px = ax + (bx - ax) * t0;
      const pz = az + (bz - az) * t0;
      if (skip && Math.hypot(px - skip.x, pz - skip.y) < skip.r) continue;
      const post = box(0.42, H + 0.25, 0.42, MAT.concreteDark, 0, 0, 0);
      post.position.set(px, depotHeight(px, pz) + (H + 0.25) / 2 - 0.1, pz);
      post.rotation.y = ang;
      wall.add(post);
    }
  };

  const { minX, maxX, minZ, maxZ } = WIRE;
  run(minX, maxZ, maxX, maxZ);                              // north
  run(maxX, maxZ, maxX, minZ);                              // east
  run(maxX, minZ, minX, minZ);                              // south
  run(minX, minZ, minX, maxZ, { x: GATE.x, y: GATE.y, r: 2.4 });   // west, with the gate

  // The gate itself: two sliding leaves, one pushed open.
  const leaf = (px, pz, rot) => {
    const l = new THREE.Group();
    const frame = box(0.12, 2.3, 2.2, MAT.metal, 0, 1.15, 0);
    l.add(frame);
    for (let i = 0; i < 6; i++) l.add(box(0.07, 2.0, 0.07, MAT.dark, 0, 1.15, -0.95 + i * 0.38));
    l.position.set(px, depotHeight(px, pz), pz);
    l.rotation.y = rot;
    wall.add(l);
    return l;
  };
  leaf(GATE.x, GATE.y + 1.5, 0.0);
  leaf(GATE.x - 0.3, GATE.y - 2.0, 0.45);

  // Guard tower on the north-west corner, overlooking the gate.
  const tower = new THREE.Group();
  const tx = minX + 1.4, tz = maxZ - 1.4;
  for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    tower.add(box(0.22, 4.2, 0.22, MAT.metal, lx, 2.1, lz));
  }
  tower.add(box(2.2, 0.16, 2.2, MAT.concreteDark, 0, 4.2, 0));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    tower.add(box(2.2, 0.9, 0.12, MAT.metal, Math.sin(a) * 1.05, 4.7, Math.cos(a) * 1.05, a));
  }
  tower.add(box(2.6, 0.14, 2.6, MAT.roof, 0, 5.6, 0));
  for (const [lx, lz] of [[-1.0, -1.0], [1.0, 1.0]]) tower.add(box(0.1, 0.9, 0.1, MAT.metal, lx, 5.1, lz));
  onGround(tower, tx, tz, { tiltToSlope: false });
  wall.add(tower);

  group.add(wall);
  return wall;
}

// ---------------------------------------------------------------- fire

// The fire. Starts as scenery in phase 2, degrades the sensors in phase 4 and
// is a clock in phase 5 — so it is built once, parked at zero, and turned up
// by the mission rather than spawned and despawned.
function fireSource(group, x, z) {
  const fire = new THREE.Group();
  fire.name = 'compound-fire';
  fire.visible = false;

  const COUNT = 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const kind = new Float32Array(COUNT);        // 0 flame, 1 smoke
  for (let i = 0; i < COUNT; i++) {
    seed[i] = rand(i + 5) ;
    kind[i] = i < COUNT * 0.42 ? 0 : 1;
    pos[i * 3] = (rand(i + 31) - 0.5) * 2.4;
    pos[i * 3 + 1] = rand(i + 61) * 6;
    pos[i * 3 + 2] = (rand(i + 91) - 0.5) * 2.4;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('kind', new THREE.BufferAttribute(kind, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uScale: { value: 700 } },
    vertexShader: `
      attribute float seed; attribute float kind;
      uniform float uTime, uIntensity, uScale;
      varying float vKind; varying float vLife;
      void main() {
        float speed = mix(2.2, 1.1, kind);
        float life = fract(seed + uTime * speed * 0.16);
        vLife = life; vKind = kind;
        vec3 p = position;
        // Rise, spread as it cools, and lean downwind.
        p.y = mix(0.2, mix(7.0, 16.0, kind), life) * (0.55 + uIntensity * 0.45);
        float spread = life * mix(1.6, 5.0, kind);
        p.x += sin(seed * 31.0 + uTime * 0.7) * spread + life * 2.6;
        p.z += cos(seed * 17.0 + uTime * 0.5) * spread + life * 1.1;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(0.5, 2.4, kind) * (0.4 + life * 1.4) * (0.5 + uIntensity * 0.5);
        gl_PointSize = size * uScale * projectionMatrix[1][1] * 0.1;
      }`,
    fragmentShader: `
      uniform float uIntensity;
      varying float vKind; varying float vLife;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.05, length(d));
        if (a < 0.02) discard;
        // Flame runs white-hot at the base through orange to red as it rises.
        vec3 flame = mix(vec3(1.0, 0.92, 0.62), vec3(0.92, 0.26, 0.08), vLife);
        vec3 smoke = mix(vec3(0.32, 0.30, 0.29), vec3(0.16, 0.15, 0.15), vLife);
        vec3 c = mix(flame, smoke, vKind);
        float fade = mix(1.0 - vLife, (1.0 - vLife) * 0.5, vKind);
        gl_FragColor = vec4(c, a * fade * uIntensity * mix(0.9, 0.42, vKind));
      }`,
    transparent: true, depthWrite: false,
    blending: THREE.NormalBlending,
  });
  // Flames add light; smoke must not. Two draws would be tidier, but the
  // kind attribute already separates them and additive smoke glows.
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  fire.add(points);

  // The fire throws real light on the compound once it is going.
  const light = new THREE.PointLight(0xff7a2a, 0, 26, 2);
  light.position.set(0, 2.4, 0);
  fire.add(light);

  onGround(fire, x, z, { tiltToSlope: false });
  group.add(fire);

  return {
    group: fire,
    material,
    light,
    // 0 = out, 1 = the fuel store is alight, 2 = it is through the roofline.
    setLevel(level) {
      const v = Math.max(0, Math.min(2, level));
      fire.visible = v > 0;
      material.uniforms.uIntensity.value = v * 0.5;
      light.intensity = v * 26;
      light.distance = 20 + v * 14;
    },
    update(dt, t) { material.uniforms.uTime.value = t; },
  };
}

// ---------------------------------------------------------------- props

const PROPS = [
  // --- the yard: things that get delivered and parked
  ['container', 6.0, 4.6, { size: 2.6, rot: 0.1 }],
  ['container', 9.4, 4.2, { size: 2.6, rot: 0.08 }],
  ['supply-crate', 4.6, 0.4, { height: 1.0, rot: 0.25 }],
  ['supply-crate', 5.4, -0.6, { height: 0.9, rot: 0.6 }],
  ['supply-crate', 5.0, 1.3, { height: 0.8, rot: 0.1 }],
  ['barrel', 6.4, -0.2, { height: 0.95, rot: 0.4 }],
  ['barrel', 6.9, 0.7, { height: 0.95, rot: 0.9 }],
  ['drum', 3.2, 2.1, { height: 1.0, rot: 0.2 }],

  // --- the fuel store, east side of the yard. Turn 3 sets this alight.
  ['storage-tank', 8.6, 3.4, { height: 3.2, rot: 0.0 }],
  ['propane-tank', 7.2, 4.4, { height: 1.6, rot: 0.5 }],
  ['fuel-can', 6.6, 3.0, { height: 0.6, rot: 0.3 }],
  ['sign-hazard', 7.0, 2.2, { size: 1.1, rot: 0.4 }],

  // --- the gate
  ['floodlight', -1.2, 7.4, { height: 4.2, rot: 2.6 }],
  ['sign-hazard', -1.4, 3.6, { size: 1.0, rot: 1.2 }],
  ['fence', 0.6, 7.8, { size: 2.2, rot: 0.0 }],

  // --- generator hall: the EM source behind turn 7
  ['ac-stacked', 12.6, -1.4, { height: 1.8, rot: 0.2 }],
  ['ac-unit', 13.8, -0.6, { height: 1.2, rot: 0.6 }],
  ['pipe-bundle', 11.4, -2.6, { size: 2.2, rot: 0.3 }],
  ['pipe-straight', 13.6, -4.6, { size: 2.6, rot: 1.2 }],
  ['cable-thick', 12.0, -5.4, { height: 1.0, rot: 0.5, anchor: 'top' }],
  ['antenna-mast', 14.6, 1.2, { height: 5.0, rot: 0.1 }],

  // --- the bunker apron
  ['crate', 14.4, -10.4, { height: 0.9, rot: 0.2 }],
  ['supply-crate', 18.2, -10.0, { height: 1.0, rot: 0.5 }],
  ['barrel', 18.6, -6.6, { height: 0.95, rot: 0.2 }],
  ['floodlight', 13.4, -11.0, { height: 4.0, rot: 5.1 }],
  ['sign-hazard', 15.0, -6.2, { size: 1.2, rot: 3.3 }],

  // --- the main building approach
  ['terminal', 6.4, -3.2, { height: 1.1, rot: 1.1 }],
  ['vent', 10.6, -7.4, { height: 0.8, rot: 0.2 }],
  ['railing', 6.0, -8.6, { size: 2.4, rot: 0.0 }],
];

function placeProps(group, table) {
  for (const [name, x, z, opts = {}] of table) {
    const { group: holder, ready } = spawnProp(name, {
      height: opts.height, size: opts.size,
      anchor: opts.anchor || 'ground', rotY: opts.rot || 0,
    });
    onGround(holder, x, z, { rotY: opts.rot || 0 });
    ready.then((asset) => {
      if (!asset) return;
      asset.model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        // Dust settles on everything in a dry compound. Pushing the props
        // toward the ground's own colour is what stops them reading as
        // clean kit dropped onto a photograph.
        if (child.material && child.material.color) {
          child.material.color.lerp(new THREE.Color(0xb3a68c), 0.22);
          child.material.roughness = Math.min(1, (child.material.roughness ?? 0.7) + 0.18);
        }
      });
    });
    group.add(holder);
  }
}

// ---------------------------------------------------------------- assembly

export function createDepotLevel(scene) {
  const group = new THREE.Group();
  group.name = 'compound-14';

  perimeter(group);

  // --- turn 2: the storage block. It exists to occlude the north wall, and
  // the service door with the live alarm contact is on its far side.
  shed(group, { x: 2.5, z: 6.4, w: 7.0, d: 4.2, h: 3.4, rotY: 0.04,
                mat: MAT.concrete, name: 'storage-block',
                door: { width: 1.4, offset: 2.0 } });
  const serviceDoor = box(1.3, 2.1, 0.14, MAT.rust, 0, 0, 0);
  onGround(serviceDoor, 2.2, 8.35, { tiltToSlope: false });
  serviceDoor.position.y += 1.05;
  serviceDoor.name = 'service-door';
  group.add(serviceDoor);

  // --- turns 5-6: the main building. Open-roofed, because the hostage room
  // is inside it and the whole mission turns on being able to see in.
  const main = shed(group, { x: 9.0, z: -6.0, w: 11.0, d: 7.5, h: 3.2, rotY: 0.02,
                             mat: MAT.render, open: true, name: 'main-building',
                             door: { width: 2.0, offset: -3.2 } });
  // An internal partition making the west room a room. Turn 5's six figures
  // are in the west half; the corridor to the generator hall runs east.
  main.add(box(0.2, 3.2, 5.4, MAT.render, 0.6, 1.6, -0.6));
  main.add(box(0.2, 1.0, 2.0, MAT.render, 0.6, 2.7, 2.4));   // doorway head

  // The filing cabinet the sixth figure is behind. It is small, and it is the
  // most important object on the map.
  const cabinet = box(0.9, 1.5, 0.6, MAT.dark, 0, 0, 0);
  onGround(cabinet, 10.2, -8.0, { rotY: 0.3, tiltToSlope: false });
  cabinet.position.y += 0.75;
  cabinet.name = 'cabinet';
  group.add(cabinet);

  const mainDoor = box(2.0, 2.3, 0.16, MAT.metal, 0, 0, 0);
  onGround(mainDoor, 5.8, -2.3, { rotY: 0.02, tiltToSlope: false });
  mainDoor.position.y += 1.15;
  mainDoor.name = 'main-door';
  mainDoor.material = MAT.metal.clone();
  mainDoor.material.emissive = new THREE.Color(0x4ce0d8);
  mainDoor.material.emissiveIntensity = 0.18;
  group.add(mainDoor);

  // --- turn 7: the generator hall. Closed, humming, and the reason BETA-1's
  // sidescan cannot be trusted in the corridor beside it.
  const genHall = shed(group, { x: 13.5, z: -2.0, w: 5.6, d: 4.6, h: 3.0, rotY: -0.05,
                                mat: MAT.concrete, name: 'generator-hall',
                                door: { width: 1.5, offset: -1.4 } });
  const genUnit = box(2.4, 1.4, 1.6, MAT.metal, 0, 0, 0);
  onGround(genUnit, 12.2, 0.6, { rotY: 0.2 });
  genUnit.position.y += 0.7;
  genUnit.name = 'generator';
  group.add(genUnit);

  // --- turns 8-9: the ammunition bunker. Half-buried, earth-bermed, blast
  // wall across the door. It should read as the hardest thing on the map.
  const bunker = new THREE.Group();
  bunker.name = 'ammunition-bunker';
  bunker.add(box(9.0, 3.6, 6.4, MAT.concreteDark, 0, 1.8, 0));
  // Earth berm banked up the sides.
  for (const s of [-1, 1]) {
    const berm = new THREE.Mesh(new THREE.BoxGeometry(9.6, 2.4, 2.2), MAT.sand);
    berm.position.set(0, 1.1, s * 3.9);
    berm.rotation.x = s * 0.30;
    berm.castShadow = berm.receiveShadow = true;
    bunker.add(berm);
  }
  bunker.add(box(9.8, 0.5, 7.2, MAT.concrete, 0, 3.75, 0));      // roof slab
  bunker.add(box(3.4, 0.4, 7.6, MAT.sand, 0, 4.15, 0));          // earth cover
  // Blast wall standing off the door, which is how these are actually built.
  bunker.add(box(0.5, 3.0, 4.4, MAT.concreteDark, -5.4, 1.5, 0.6));
  const blastDoor = box(0.3, 2.6, 2.6, MAT.metal, -4.6, 1.3, -0.8);
  bunker.add(blastDoor);
  onGround(bunker, 16.5, -9.0, { rotY: 0.06, tiltToSlope: false });
  group.add(bunker);

  // The charge indicator. Turn 10's `relay` FX pulses on this — the detonation.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 9),
    new THREE.MeshStandardMaterial({
      color: 0xffb08a, emissive: 0xe0524c, emissiveIntensity: 1.4,
    })
  );
  beacon.position.set(-4.4, 2.9, -0.8);
  beacon.name = 'charge-indicator';
  bunker.add(beacon);

  const chargePanel = box(0.8, 1.0, 0.24, MAT.dark, -4.9, 1.0, 1.4);
  chargePanel.name = 'charge-panel';
  bunker.add(chargePanel);

  // --- the fuel store fire, parked at zero until the mission lights it.
  const fire = fireSource(group, 8.4, 3.4);

  placeProps(group, PROPS);

  scene.add(group);
  console.log('[depot] Compound 14 built — wall, gate, tower, 4 structures, bunker, fire');

  return {
    group,
    door: mainDoor,
    tower: bunker,
    beacon,
    generator: genUnit,
    relayConsole: chargePanel,
    fire,
    serviceDoor,
    storageBlock: group.getObjectByName('storage-block'),
    genHall,
  };
}
