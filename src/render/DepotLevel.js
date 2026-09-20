import * as THREE from 'three';
import { spawnProp } from './AssetLoader.js';
import { triplanarMaterial } from './Textures.js';
import { depotHeight } from './Depot.js';
import {
  WIRE, GATE, WALLS, ROOMS, OUTBUILDINGS, ZONES, FIRE_SOURCE,
} from '../data/depot-layout.js';

// ============================================================================
// COMPOUND 14 — the installation
// ============================================================================
//
// Built entirely from src/data/depot-layout.js. Nothing in here invents a
// coordinate.
//
// Returns the same contract as createLevel() so the Director runs unchanged:
// { group, door, tower, beacon, generator, relayConsole }. Roles re-cast —
//   tower / beacon  →  the ammunition stack and its charge indicator. Turn
//                      10's `relay` FX fires on it: that beat IS the detonation.
//   door            →  the holding room's door.
//   generator       →  the plant in the corridor, the EM source for turn 7.
//
// Every wall and roof mesh is registered on `fadeables` so the camera can see
// through them — see CameraOcclusion in main.js. They are built transparent
// from the start: switching a material to transparent at runtime forces a
// shader recompile and drops a frame exactly when the squad walks indoors.

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
    const e = 2.0;
    const dx = depotHeight(x + e, z) - depotHeight(x - e, z);
    const dz = depotHeight(x, z + e) - depotHeight(x, z - e);
    object.rotation.x = clamp(Math.atan2(dz, 2 * e), -MAX_TILT, MAX_TILT);
    object.rotation.z = clamp(-Math.atan2(dx, 2 * e), -MAX_TILT, MAX_TILT);
  }
  return object;
}

// ---------------------------------------------------------------- materials

// Transparent from birth, opacity 1. See the note at the top.
//
// `tex` names a CC0 PBR set (see src/render/Textures.js) projected triplanar.
// The compound's walls are extruded boxes with no UVs, so a projection is the
// only way to get aggregate into concrete and corrugation into a roof — and it
// keeps the fade contract intact, because the result is still one
// MeshStandardMaterial the occlusion system can drive `opacity` on.
//
// Base colours are lifted above the old flat values: the detail albedo
// multiplies into them, so the pre-texture colour would come out a stop dark.
const fadeMat = (color, roughness = 0.94, metalness = 0.02, tex = null) => {
  const mat = tex
    ? triplanarMaterial({ color, roughness, metalness, ...tex })
    : new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  mat.transparent = true;
  mat.opacity = 1;
  mat.depthWrite = true;
  return mat;
};

const MAT = {
  wall: fadeMat(0xc6b89e, 0.94, 0.02, { set: 'concrete', scale: 0.3, albedoMix: 0.45, normalScale: 0.9 }),
  wallInner: fadeMat(0xb1a58d, 0.94, 0.02, { set: 'concrete', scale: 0.34, albedoMix: 0.45, normalScale: 0.8 }),
  concrete: fadeMat(0xb0a695, 0.95, 0.02, { set: 'concrete', scale: 0.32, albedoMix: 0.45, normalScale: 0.9 }),
  concreteDark: fadeMat(0x857e70, 0.96, 0.02, { set: 'concrete', scale: 0.3, albedoMix: 0.45, normalScale: 0.9 }),
  // Corrugated sheet over the magazines, not poured concrete.
  roof: fadeMat(0x716a5e, 0.88, 0.12, { set: 'metal-plate', scale: 0.6, albedoMix: 0.45, normalScale: 0.9 }),
  metal: fadeMat(0x938d7f, 0.60, 0.55, { set: 'metal-plate', scale: 0.75, albedoMix: 0.5 }),
  rust: fadeMat(0xa2663b, 0.92, 0.15, { set: 'metal-rust', scale: 1.0, albedoMix: 0.5 }),
  // Rubber and shadowed trim. Deliberately untextured: at this value the
  // detail map is invisible and the extra fetches are not worth a black edge.
  dark: fadeMat(0x3a3833, 0.9, 0.2),
  // Swept hardstanding underfoot, finer than the wall aggregate.
  floor: fadeMat(0x968e80, 0.97, 0.02, { set: 'concrete', scale: 0.42, albedoMix: 0.45, normalScale: 0.7 }),
};

function box(w, h, d, mat, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- walls

const WALL_H = 3.4, WALL_T = 0.3;

// One authored segment becomes a run of panels with the doorways left out and
// a lintel dropped over each. Panels rather than one long box because a real
// wall is precast sections, and the joints are what make it read as built.
//
// A box is long on local +x, so aligning it to the run needs atan2(-dz, dx).
// Using atan2(dx, dz) puts every panel *across* the wall — that is exactly
// how the first version of this came out, as a zigzag of notches.
function buildWall(group, seg, fadeables, height = WALL_H, mat = MAT.wall) {
  // One material per wall RUN, not per panel and not shared across the whole
  // compound. Shared would fade every wall in the building when one of them
  // blocks the camera; per-panel would pop a single section out of a wall and
  // read as a hole. A run is the unit the eye already treats as one thing.
  const runMat = mat.clone();
  const capMatRun = MAT.concreteDark.clone();
  const meshes = [];

  const [ax, az] = seg.a, [bx, bz] = seg.b;
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  const ang = Math.atan2(-dz, dx);

  // Turn the door fractions into keep-out spans along the run.
  const gaps = (seg.doors || []).map((d) => {
    const c = d.at * len;
    return [c - d.width / 2, c + d.width / 2, d];
  }).sort((p, q) => p[0] - q[0]);

  const spans = [];
  let cursor = 0;
  for (const [g0, g1] of gaps) {
    if (g0 > cursor) spans.push([cursor, Math.min(g0, len)]);
    cursor = Math.max(cursor, g1);
  }
  if (cursor < len) spans.push([cursor, len]);

  const put = (from, to, h, yBase) => {
    const l = to - from;
    if (l <= 0.02) return;
    const mid = (from + to) / 2;
    const px = ax + (dx / len) * mid;
    const pz = az + (dz / len) * mid;
    const m = box(l, h, WALL_T, runMat, px, depotHeight(px, pz) + yBase + h / 2, pz, ang);
    group.add(m);
    meshes.push(m);
  };

  for (const [s0, s1] of spans) put(s0, s1, height, 0);

  // Lintel over each doorway, so the gap reads as a door and not a hole.
  for (const [g0, g1, d] of gaps) {
    const head = d.height ?? 2.3;
    put(g0, g1, height - head, head);
  }

  // Capping course along the whole run, doorways included.
  const capMid = len / 2;
  const cx = ax + (dx / len) * capMid, cz = az + (dz / len) * capMid;
  const cap = box(len, 0.16, WALL_T + 0.1, capMatRun,
                  cx, depotHeight(cx, cz) + height + 0.08, cz, ang);
  group.add(cap);
  meshes.push(cap);

  fadeables.push({ id: seg.tag || 'wall', materials: [runMat, capMatRun], meshes });
}

// ---------------------------------------------------------------- perimeter

function perimeter(group, fadeables) {
  const H = 2.8;
  const { minX, maxX, minZ, maxZ } = WIRE;

  // West face, split around the service gate — the only way in.
  const gateLo = GATE.z - GATE.width / 2;
  const gateHi = GATE.z + GATE.width / 2;

  const runs = [
    { a: [minX, maxZ], b: [maxX, maxZ] },        // north
    { a: [maxX, maxZ], b: [maxX, minZ] },        // east
    { a: [maxX, minZ], b: [minX, minZ] },        // south
    { a: [minX, minZ], b: [minX, gateLo] },      // west, below the gate
    { a: [minX, gateHi], b: [minX, maxZ] },      // west, above the gate
  ];
  for (const r of runs) buildWall(group, { ...r, doors: [] }, fadeables, H, MAT.concrete);

  // Posts at the corners and along the runs.
  for (const r of runs) {
    const [ax, az] = r.a, [bx, bz] = r.b;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 4.0));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const post = box(0.46, H + 0.3, 0.46, MAT.concreteDark,
                       px, depotHeight(px, pz) + (H + 0.3) / 2, pz);
      group.add(post);
    }
  }

  // The gate: two leaves, one pushed open.
  for (const [dz, rot] of [[GATE.width / 2 - 0.4, 0.0], [-GATE.width / 2 + 0.4, 0.5]]) {
    const leaf = new THREE.Group();
    leaf.add(box(0.12, 2.4, GATE.width / 2 - 0.2, MAT.metal, 0, 1.2, 0));
    for (let i = 0; i < 5; i++) {
      leaf.add(box(0.07, 2.1, 0.07, MAT.dark, 0, 1.2, -0.7 + i * 0.35));
    }
    onGround(leaf, GATE.x, GATE.z + dz, { rotY: rot, tiltToSlope: false });
    group.add(leaf);
  }

  // Guard tower on the north-west corner, overlooking the gate.
  const tower = new THREE.Group();
  for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
    tower.add(box(0.22, 4.4, 0.22, MAT.metal, lx, 2.2, lz));
  }
  tower.add(box(2.4, 0.16, 2.4, MAT.concreteDark, 0, 4.4, 0));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    tower.add(box(2.4, 0.9, 0.12, MAT.metal, Math.sin(a) * 1.15, 4.9, Math.cos(a) * 1.15, a));
  }
  tower.add(box(2.8, 0.14, 2.8, MAT.roof, 0, 5.8, 0));
  onGround(tower, minX + 2.0, maxZ - 2.0, { tiltToSlope: false });
  group.add(tower);
}

// ---------------------------------------------------------------- rooms

function roomFloorAndRoof(group, room, fadeables, roofs) {
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const w = maxX - minX, d = maxZ - minZ;
  const y = depotHeight(cx, cz);

  const floor = box(w, 0.12, d, MAT.floor, cx, y + 0.06, cz);
  floor.receiveShadow = true;
  floor.castShadow = false;
  group.add(floor);

  const roofMat = MAT.roof.clone();
  const roof = box(w + 0.4, 0.26, d + 0.4, roofMat, cx, y + room.height + 0.13, cz);
  group.add(roof);
  const roofMeshes = [roof];
  const entry = { zone: room.zone, bounds: room.bounds, materials: [roofMat], meshes: roofMeshes };
  roofs.push(entry);

  // Parapet, so the roof reads as a roof and not a lid.
  for (const [pw, pd, px, pz] of [
    [w + 0.5, 0.18, cx, minZ - 0.2], [w + 0.5, 0.18, cx, maxZ + 0.2],
    [0.18, d + 0.5, minX - 0.2, cz], [0.18, d + 0.5, maxX + 0.2, cz],
  ]) {
    const p = box(pw, 0.34, pd, roofMat, px, y + room.height + 0.4, pz);
    group.add(p);
    roofMeshes.push(p);
  }
}

// A free-standing outbuilding in the yard: four walls with a door in one.
function outbuilding(group, spec, fadeables) {
  const { minX, maxX, minZ, maxZ } = spec.bounds;
  const sides = {
    N: { a: [minX, maxZ], b: [maxX, maxZ] },
    S: { a: [minX, minZ], b: [maxX, minZ] },
    W: { a: [minX, minZ], b: [minX, maxZ] },
    E: { a: [maxX, minZ], b: [maxX, maxZ] },
  };
  for (const [name, seg] of Object.entries(sides)) {
    const doors = (spec.doors || []).filter((d) => d.wall === name)
      .map((d) => ({ at: d.at, width: d.width }));
    buildWall(group, { ...seg, doors }, fadeables, spec.height, MAT.wall);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const y = depotHeight(cx, cz);
  const roofMat = MAT.roof.clone();
  const roof = box(maxX - minX + 0.4, 0.24, maxZ - minZ + 0.4, roofMat,
                   cx, y + spec.height + 0.12, cz);
  group.add(roof);
  fadeables.push({ id: `${spec.id}-roof`, materials: [roofMat], meshes: [roof] });
  group.add(box(maxX - minX, 0.1, maxZ - minZ, MAT.floor, cx, y + 0.05, cz));
}

// ---------------------------------------------------------------- hazard

// Fire and smoke. One particle system; the mission moves it and turns it up.
// Visual only — no mechanic hangs off it. It is the storyline's clock, made
// something you can see closing on the ammunition room.
function hazard(group) {
  const root = new THREE.Group();
  root.name = 'compound-hazard';

  const COUNT = 420;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const kind = new Float32Array(COUNT);        // 0 flame, 1 smoke
  for (let i = 0; i < COUNT; i++) {
    seed[i] = rand(i + 7);
    kind[i] = i < COUNT * 0.3 ? 0 : 1;
    pos[i * 3] = (rand(i + 31) - 0.5) * 2.0;
    pos[i * 3 + 1] = rand(i + 61) * 4;
    pos[i * 3 + 2] = (rand(i + 91) - 0.5) * 2.0;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('kind', new THREE.BufferAttribute(kind, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uIntensity: { value: 0 },
      uSpread: { value: 3.0 }, uScale: { value: 700 },
    },
    vertexShader: `
      attribute float seed; attribute float kind;
      uniform float uTime, uIntensity, uSpread, uScale;
      varying float vKind; varying float vLife;
      void main() {
        float speed = mix(2.0, 0.85, kind);
        float life = fract(seed + uTime * speed * 0.14);
        vLife = life; vKind = kind;
        vec3 p = position;
        p.y = mix(0.15, mix(5.0, 11.0, kind), life) * (0.6 + uIntensity * 0.4);
        float spread = life * uSpread * mix(0.5, 1.6, kind);
        p.x += sin(seed * 31.0 + uTime * 0.6) * spread;
        p.z += cos(seed * 17.0 + uTime * 0.45) * spread;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(0.45, 2.6, kind) * (0.35 + life * 1.5) * (0.5 + uIntensity * 0.5);
        gl_PointSize = size * uScale * projectionMatrix[1][1] * 0.1;
      }`,
    fragmentShader: `
      uniform float uIntensity;
      varying float vKind; varying float vLife;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.05, length(d));
        if (a < 0.02) discard;
        vec3 flame = mix(vec3(1.0, 0.90, 0.58), vec3(0.92, 0.26, 0.08), vLife);
        vec3 smoke = mix(vec3(0.34, 0.32, 0.31), vec3(0.15, 0.14, 0.14), vLife);
        vec3 c = mix(flame, smoke, vKind);
        float fade = mix(1.0 - vLife, (1.0 - vLife) * 0.55, vKind);
        gl_FragColor = vec4(c, a * fade * uIntensity * mix(0.9, 0.38, vKind));
      }`,
    transparent: true, depthWrite: false,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  root.add(points);

  const light = new THREE.PointLight(0xff7a2a, 0, 26, 2);
  light.position.set(0, 2.4, 0);
  root.add(light);

  root.visible = false;
  onGround(root, FIRE_SOURCE.x, FIRE_SOURCE.z, { tiltToSlope: false });
  group.add(root);

  return {
    group: root,
    material,
    light,
    // level 0 = out. 1 = the fuel store alight, back in the yard.
    // 2 = smoke has reached the corridor. 3 = it is on the ammunition room.
    setStage(level, at, spread = 3.0, density = 1) {
      root.visible = level > 0;
      if (!root.visible) return;
      if (at) onGround(root, at.x, at.z, { tiltToSlope: false });
      material.uniforms.uIntensity.value = Math.min(1, 0.45 + density * 0.55);
      material.uniforms.uSpread.value = spread;
      light.intensity = level >= 2 ? 10 : 24;
      light.distance = 18 + spread * 2;
    },
    update(dt, t) { material.uniforms.uTime.value = t; },
  };
}

// ---------------------------------------------------------------- props

const PROPS = [
  // --- the yard
  ['container', -6.5, 2.0, { size: 2.6, rot: 0.08 }],
  ['container', -6.2, -1.2, { size: 2.6, rot: 0.05 }],
  // The east-corner crate stack. The turn-4 contact stands behind THIS, so
  // it has to be at his shoulder rather than somewhere else in the yard.
  ['supply-crate', 7.6, 4.2, { height: 1.2, rot: 0.15 }],
  ['supply-crate', 8.8, 4.6, { height: 1.0, rot: 0.5 }],
  ['supply-crate', 7.9, 5.4, { height: 0.9, rot: 0.3 }],
  ['barrel', 6.6, 3.6, { height: 0.95, rot: 0.4 }],
  ['barrel', 2.6, 6.6, { height: 0.95, rot: 0.9 }],
  ['drum', -2.0, 3.6, { height: 1.0, rot: 0.2 }],
  ['sign-hazard', 4.2, 7.2, { size: 1.1, rot: 0.4 }],
  ['fuel-can', 4.4, 9.4, { height: 0.6, rot: 0.3 }],
  ['propane-tank', 6.8, 9.6, { height: 1.6, rot: 0.5 }],
  ['storage-tank', 7.4, 7.0, { height: 3.2, rot: 0.0 }],

  // --- the gate
  ['floodlight', -7.4, 10.5, { height: 4.2, rot: 2.6 }],
  ['sign-hazard', -7.6, 4.5, { size: 1.0, rot: 1.2 }],

  // --- the holding room (inside)
  ['terminal', 5.4, -8.6, { height: 1.1, rot: 1.1 }],
  ['supply-crate', 13.4, -1.6, { height: 0.8, rot: 0.3 }],

  // --- the corridor: the plant that throws the EM
  ['ac-stacked', 20.2, -6.2, { height: 1.7, rot: 0.2 }],
  ['pipe-straight', 17.0, -9.2, { size: 2.6, rot: 0.0 }],
  ['cable-thick', 19.0, -9.3, { height: 0.9, rot: 0.1, anchor: 'top' }],

  // --- the ammunition room
  ['supply-crate', 24.5, -17.0, { height: 1.1, rot: 0.1 }],
  ['supply-crate', 26.2, -17.4, { height: 1.0, rot: 0.4 }],
  ['supply-crate', 28.0, -16.6, { height: 1.1, rot: 0.2 }],
  ['supply-crate', 29.4, -13.0, { height: 0.9, rot: 0.5 }],
  ['barrel', 30.2, -18.2, { height: 0.95, rot: 0.2 }],
  ['sign-hazard', 23.2, -5.4, { size: 1.2, rot: 3.3 }],

  // --- outside the wire
  ['antenna-mast', -13.0, -6.0, { height: 5.0, rot: 0.1 }],
  ['railing', -12.0, 16.0, { size: 2.4, rot: 0.2 }],
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
  const fadeables = [];
  const roofs = [];

  perimeter(group, fadeables);

  // The building complex, from the shared wall list. Built once each, so
  // HOLDING and CORRIDOR genuinely share an edge rather than having two walls
  // a few centimetres apart with a seam between them.
  for (const seg of WALLS) {
    const room = ROOMS.find((r) => seg.tag && seg.tag.startsWith(r.zone.toLowerCase().split('_')[0]));
    buildWall(group, seg, fadeables, room?.height ?? 3.4, MAT.wall);
  }
  for (const room of ROOMS) roomFloorAndRoof(group, room, fadeables, roofs);
  for (const spec of OUTBUILDINGS) outbuilding(group, spec, fadeables);

  // The holding room door — the Director's breach beat reaches for this.
  const holdingDoor = box(2.2, 2.3, 0.16, MAT.metal, 0, 0, 0);
  onGround(holdingDoor, 7.3, 0, { tiltToSlope: false });
  holdingDoor.position.y += 1.15;
  holdingDoor.name = 'holding-door';
  holdingDoor.material = MAT.metal.clone();
  holdingDoor.material.emissive = new THREE.Color(0x4ce0d8);
  holdingDoor.material.emissiveIntensity = 0.18;
  group.add(holdingDoor);
  fadeables.push({ id: 'holding-door', materials: [holdingDoor.material], meshes: [holdingDoor] });

  // The filing cabinet the sixth figure is behind. Small, and the most
  // important object in the mission.
  const cabinet = box(1.0, 1.5, 0.7, MAT.dark, 0, 0, 0);
  onGround(cabinet, 11.8, -7.4, { rotY: 0.3, tiltToSlope: false });
  cabinet.position.y += 0.75;
  cabinet.name = 'cabinet';
  group.add(cabinet);

  // The generator plant in the corridor — turn 7's EM source.
  const genUnit = box(2.4, 1.5, 1.4, MAT.metal, 0, 0, 0);
  onGround(genUnit, 20.4, -8.6, { rotY: 0.1 });
  genUnit.position.y += 0.75;
  genUnit.name = 'generator';
  group.add(genUnit);

  // The ammunition stack and its charge indicator. `tower` and `beacon` in
  // the level contract, so turn 10's `relay` FX detonates exactly here.
  const stack = new THREE.Group();
  stack.name = 'ammunition-stack';
  for (let i = 0; i < 10; i++) {
    const row = i % 5, tier = Math.floor(i / 5);
    stack.add(box(1.5, 0.85, 1.1, MAT.concreteDark,
                  -2.6 + row * 1.3, 0.45 + tier * 0.9, 0));
  }
  stack.add(box(7.4, 0.14, 1.5, MAT.metal, 0, 1.86, 0));
  onGround(stack, 27, -13.5, { rotY: 0.04, tiltToSlope: false });
  group.add(stack);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 9),
    new THREE.MeshStandardMaterial({
      color: 0xffb08a, emissive: 0xe0524c, emissiveIntensity: 1.4,
    })
  );
  beacon.position.set(0, 2.3, 0);
  beacon.name = 'charge-indicator';
  stack.add(beacon);

  const chargePanel = box(0.8, 1.0, 0.24, MAT.dark, -3.6, 0.5, 0.8);
  chargePanel.name = 'charge-panel';
  stack.add(chargePanel);

  // THE DEMOLITION CHARGE. Hidden until the squad actually plants it on turn
  // 9 — before that the mission has only ever said the word "charge", and a
  // player watching the board had no way to tell the difference between a
  // charge being set and a number changing in a log line.
  const charge = new THREE.Group();
  charge.name = 'demolition-charge';
  charge.visible = false;

  const satchelMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f28, roughness: 0.85, metalness: 0.1, flatShading: true,
  });
  const tapeMat = new THREE.MeshStandardMaterial({
    color: 0xc7a23a, roughness: 0.9, flatShading: true,
  });

  // Satchel, strapped flat against the stack.
  charge.add(box(1.25, 0.55, 0.42, satchelMat, 0, 0, 0));
  charge.add(box(1.32, 0.10, 0.45, tapeMat, 0, 0.16, 0));
  charge.add(box(1.32, 0.10, 0.45, tapeMat, 0, -0.16, 0));

  // Detonator block and its arming light.
  charge.add(box(0.34, 0.26, 0.20, MAT.dark, 0.42, 0.30, 0.20));
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xff6b60, emissive: 0xe0524c, emissiveIntensity: 0,
    })
  );
  lamp.position.set(0.42, 0.46, 0.22);
  lamp.name = 'charge-lamp';
  charge.add(lamp);

  // Det cord running down into the stack — the detail that makes it read as
  // placed by hand rather than dropped in.
  for (let i = 0; i < 5; i++) {
    const seg = box(0.05, 0.05, 0.22, tapeMat,
                    -0.2 - i * 0.14, -0.30 - i * 0.07, 0.18 + i * 0.03);
    seg.rotation.z = 0.5 + i * 0.08;
    charge.add(seg);
  }

  charge.position.set(-1.1, 1.55, 0.72);
  charge.rotation.y = 0.18;
  stack.add(charge);

  const fire = hazard(group);
  placeProps(group, PROPS);

  scene.add(group);
  console.log(`[depot] Compound 14 — ${WALLS.length} shared wall runs, ${ROOMS.length} rooms, `
    + `${OUTBUILDINGS.length} outbuildings, ${fadeables.length} fadeable meshes`);

  return {
    group,
    door: holdingDoor,
    tower: stack,
    beacon,
    charge,
    chargeLamp: lamp,
    generator: genUnit,
    relayConsole: chargePanel,
    fire,
    fadeables,
    roofs,
    zones: ZONES,
  };
}
