import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';
import { SensorCone } from './SensorCones.js';
import { spawnModel } from './AssetLoader.js';

// Squad robots. A CC0 humanoid mech (see public/assets/SOURCES.md) — head,
// torso, shoulders, two arms with hands, pelvis, two legs — carrying a
// skeletal rig, a baked panel-and-rust atlas, and a rifle in its right hand.
//
// The model streams in. Until it lands — and permanently, if the file is
// missing — the hand-built chassis below stands in, so the mission is never
// blocked on a download. Same fallback contract the audio system uses.
export const STATUS = {
  HEALTHY: 'healthy',
  GLITCH: 'glitch',
  DAMAGED: 'damaged',
};

// Each robot wears its number over its head so you can tell whose cone is
// whose on the ground. Same number appears on its HUD chip.
export const UNIT_BADGE = {
  ALPHA: '1',
  'BETA-1': '2',
  'BETA-2': '3',
};

// Cone outline style per unit — 0 solid, 1 dashed, 2 double. Colour on the
// cone stays semantic (cyan / amber / red = status), so callsign identity goes
// on the border instead. Three overlapping cones stay tellable apart without
// the status read losing its colour channel. See suggestion-bug.md #5, opt C.
export const UNIT_EDGE_STYLE = {
  ALPHA: 0,
  'BETA-1': 1,
  'BETA-2': 2,
};

export const STATUS_COLOR = {
  [STATUS.HEALTHY]: PALETTE.cyan,
  [STATUS.GLITCH]: PALETTE.amber,
  [STATUS.DAMAGED]: PALETTE.red,
};

function badgeTexture(text) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Drawn in white and tinted by the sprite material, so one texture can
  // follow the unit through healthy / glitch / damaged.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.strokeRect(20, 20, size - 40, size - 40);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 62px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildBadge(text, color) {
  const material = new THREE.SpriteMaterial({
    map: badgeTexture(text),
    color,
    transparent: true,
    depthTest: false,   // always legible, never buried in a wall
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(0.72);
  sprite.position.y = 2.05;
  sprite.renderOrder = 20;
  return sprite;
}

function mat(color, { emissive = 0.3 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: emissive,
    roughness: 0.55,
    metalness: 0.15,
    flatShading: true,
  });
}

// Model height in the unit's own local space. The group is scaled 1.2 on top
// of this, landing the walker at ~1.74 world units — the same on-screen mass
// the hand-built chassis had, so camera framing and cone geometry are
// unaffected by the swap.
// Where the ground is. Units used to be pinned at y = 0, which is correct on
// mission 1's flat compound pad and wrong everywhere else: on the depot the
// terrain runs from +1.3 at the overwatch rise to -3.0 in the ammunition
// room, so the squad started the mission buried inside a hill — badges and
// sensor cones visible, robots not — and would have finished it hovering
// three metres over the floor.
//
// main.js hands this over once the environment is known. Missions with no
// terrain keep y = 0 exactly as before.
let groundSampler = null;
export function setGroundSampler(fn) { groundSampler = typeof fn === 'function' ? fn : null; }
export const groundAt = (x, z) => (groundSampler ? groundSampler(x, z) : 0);

const MODEL_HEIGHT = 1.45;
const UNIT_MODEL = 'squad-mech';
const UNIT_WEAPON = 'squad-rifle';

// The mech carries one baked atlas (`George_Texture`) rather than a dozen flat
// kit slots, so there is no surface table for the body — Materials.js keeps the
// atlas intact via KEEP_ORIGINAL and the panel lines, rust and hazard stripes
// painted into it do the mechanical detail that a retint would have thrown
// away. The rifle is ordinary kit geometry and still gets mapped.
// Deliberately a shade lighter than the mech's own paint. At tactical zoom a
// rifle rendered in the same value as the arm holding it stops being a rifle
// and becomes a lump on the silhouette.
const WEAPON_SURFACES = {
  Main: 'steel',
  Grey: 'steelLight',
  White: 'steelLight',
  Black: 'steelDark',
};

// Length of the rifle in world metres, and where it sits relative to the
// right hand. Tuned against the carry pose the arms are grafted into below.
const WEAPON_LENGTH = 0.62;
const WEAPON_OFFSET = { x: 0.015, y: -0.005, z: 0.055 };

// Three liveries off one download. The atlas is a weathered olive-and-grey
// bake, so these are tints multiplied into it rather than replacement colours:
// they hold the same paintwork and separate the three units by value, which is
// what has to survive a unit standing in shadow under a sensor cone. ALPHA is
// the brightest because it is the one you are usually looking for.
//
// `lift` is a very dim self-illumination in the unit's own colour. The darker
// two liveries multiply an already-dark bake, and a robot whose shadow side
// has crushed to black has lost the panel lines and the rust that are the
// whole reason for keeping the texture. The lift puts a floor under them
// without touching the lit side.
const UNIT_LIVERY = {
  ALPHA:    { tint: 0xeef2e8, roughness: 0.54, metalness: 0.38, scale: 1.20, lift: 0.00 },
  'BETA-1': { tint: 0xaab4a2, roughness: 0.64, metalness: 0.30, scale: 1.15, lift: 0.07 },
  'BETA-2': { tint: 0x79826e, roughness: 0.74, metalness: 0.22, scale: 1.27, lift: 0.16 },
};

// The one material on the mech, by its name in the file.
const ATLAS_MATERIAL = 'George_Texture';

function disposeTree(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // Shared palette materials outlive any one mesh; only the stand-in's own
    // throwaway materials are ours to free.
    for (const m of mats) if (m && !m.name?.startsWith('surface:')) m.dispose();
  });
}

// Stand-in until the model lands, and the permanent body if it never does.
function buildChassis(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.6), mat(0x243330, { emissive: 0.05 }));
  body.position.y = 0.62;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.42), mat(0x2d3f3b, { emissive: 0.05 }));
  head.position.y = 1.08;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), mat(color, { emissive: 1.6 }));
  visor.position.set(0, 1.09, 0.22);
  const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.78), mat(0x1b2624, { emissive: 0.02 }));
  trackL.position.set(-0.42, 0.18, 0);
  const trackR = trackL.clone();
  trackR.position.x = 0.42;

  for (const m of [body, head, visor, trackL, trackR]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.userData.tintParts = [visor];
  return g;
}

// Mast-mounted sensor pod, built in code and kept whichever body is in use.
//
// The walker's eye is the loud status read, but it faces forward, and on a
// 45-degree tactical camera a unit facing away shows you nothing. The pod sits
// on top where the camera can always see it, so "BETA-1 is amber" survives the
// unit turning its back on you.
function buildStatusPod(color) {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 6), mat(0x1b2422, { emissive: 0.02 }));
  mast.position.y = 1.30;
  // Emissive kept under 1: ACES clips a saturated colour to flat white well
  // before then, and a white lozenge over every robot reads as a rendering
  // fault rather than as "this unit is nominal". See Materials.js on `screen`.
  const pod = new THREE.Mesh(new THREE.OctahedronGeometry(0.095), mat(color, { emissive: 0.85 }));
  pod.position.y = 1.50;
  mast.castShadow = true;
  g.add(mast, pod);
  g.userData.pod = pod;
  return g;
}

// ---------------------------------------------------------------------------
// ARM RETARGETING
//
// The mech's Idle, Shoot and SwordSlash clips leave one or both arms in the
// rest pose, which on this rig is a 90-degree T-pose with the arms straight
// out. That is not a loader bug and it is not a broken mixer: the clips
// genuinely carry two identical keyframes on UpperArm.L/R. Quaternius authored
// the weapon poses only into the `_Holding` variants, and there is no
// `Idle_Holding` in the pack.
//
// So the carry pose is lifted off Walk_Holding's right arm — the pose the
// artist built for a robot with something in its hands — and grafted onto the
// clips that are missing it. The left arm is the mirror of the right: the
// export mirrors .L/.R pairs across the YZ plane, which for these quaternions
// is exactly (x, -y, -z, w). Verified against the bind pose, where UpperArm.L
// is precisely the (x, -y, -z, w) of UpperArm.R.
//
// Bone names arrive here without their dots: GLTFLoader runs every node name
// through PropertyBinding.sanitizeNodeName, which strips `.`, so `UpperArm.R`
// in the file is `UpperArmR` at runtime and the track names match it.
const ARM_PAIRS = [['UpperArmR', 'UpperArmL'], ['LowerArmR', 'LowerArmL']];

const mirrorQuat = (v, i = 0) => [v[i], -v[i + 1], -v[i + 2], v[i + 3]];

const quatTrack = (clip, node) => clip.tracks.find((t) => t.name === `${node}.quaternion`);

function constantTrack(node, quat, duration) {
  return new THREE.QuaternionKeyframeTrack(
    `${node}.quaternion`, [0, duration], [...quat, ...quat],
  );
}

function mirroredTrack(src, node) {
  const values = new Float32Array(src.values.length);
  for (let i = 0; i < values.length; i += 4) {
    const q = mirrorQuat(src.values, i);
    values[i] = q[0]; values[i + 1] = q[1]; values[i + 2] = q[2]; values[i + 3] = q[3];
  }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, src.times.slice(), values);
}

function replaceTrack(clip, track) {
  const i = clip.tracks.findIndex((t) => t.name === track.name);
  if (i >= 0) clip.tracks[i] = track; else clip.tracks.push(track);
}

// Built once per loaded file and shared by all three units. An AnimationClip
// is read-only data as far as a mixer is concerned, so three mixers driving
// three skeletons can share one set of clips — same bargain the geometry gets.
const clipCache = new WeakMap();

function tacticalClips(animations) {
  const hit = clipCache.get(animations);
  if (hit) return hit;

  const src = {};
  for (const c of animations) src[c.name.split('|').pop()] = c;

  // The pose the artist built for a robot holding something.
  const carry = {};
  for (const [right] of ARM_PAIRS) {
    const t = src.Walk_Holding && quatTrack(src.Walk_Holding, right);
    if (t) carry[right] = Array.from(t.values.slice(0, 4));
  }

  const out = {};
  const take = (as, from) => (src[from] ? (out[as] = src[from].clone()) : null);

  // Idle: both hands on the weapon, torso and head still breathing. The head
  // track is untouched and it is the one that sells a robot standing watch.
  const idle = take('Idle', 'Idle');
  if (idle) {
    for (const [right, left] of ARM_PAIRS) {
      if (!carry[right]) continue;
      replaceTrack(idle, constantTrack(right, carry[right], idle.duration));
      replaceTrack(idle, constantTrack(left, mirrorQuat(carry[right]), idle.duration));
    }
  }

  // Walking and running already lock the right arm onto the weapon and swing
  // the left, which is what a patrol looks like. Left exactly as authored.
  take('Walk', 'Walk_Holding');
  take('Run', 'Run_Holding');

  // Shoot raises the right arm into an aim and puts recoil on it, and forgets
  // the left entirely. Mirroring the whole right-arm track — times and all —
  // gives a two-handed aim that recoils with it, for nothing.
  const shoot = take('Shoot', 'Shoot');
  if (shoot) {
    for (const [right, left] of ARM_PAIRS) {
      const t = quatTrack(shoot, right);
      if (t) replaceTrack(shoot, mirroredTrack(t, left));
    }
  }

  // Ordnance. SwordSlash is an overarm swing that starts and ends on the carry
  // pose, which is as close to an overarm throw as this rig has. The left hand
  // stays on the weapon while the right one throws.
  const attack = take('Attack', 'SwordSlash');
  if (attack) {
    for (const [right, left] of ARM_PAIRS) {
      if (carry[right]) replaceTrack(attack, constantTrack(left, mirrorQuat(carry[right]), attack.duration));
    }
  }

  // Death already animates both arms across 44 keys. Nothing to fix.
  take('Death', 'Death');
  take('Hit', 'HitRecieve_1');

  clipCache.set(animations, out);
  return out;
}

// ---------------------------------------------------------------------------
// Parent something to a bone, positioned in the UNIT's frame rather than the
// bone's.
//
// Bone local axes on a Blender export are not the axes anyone would guess —
// the forearm's own +Y runs down the length of the bone, and its rest rotation
// is baked into the skeleton — so composing the offset in bone space means
// guessing. Instead the object is placed in world space, where "forward" is
// the direction the robot is facing, and handed to Object3D.attach(), which
// reparents it without moving it and bakes the local transform out of the
// difference. From then on it rides the bone through every clip.
const _bonePos = new THREE.Vector3();
const _unitQuat = new THREE.Quaternion();

function attachToBone(bone, object, { anchor, offset, rotation, unit }) {
  bone.updateWorldMatrix(true, false);
  unit.updateWorldMatrix(true, false);
  unit.getWorldQuaternion(_unitQuat);

  object.quaternion.copy(_unitQuat);
  if (rotation) object.quaternion.multiply(rotation);
  object.position.copy(offset).applyQuaternion(_unitQuat).add(anchor || _bonePos.setFromMatrixPosition(bone.matrixWorld));
  bone.attach(object);
}

// Where the hand actually is. A bone's origin is its head, so LowerArm.R sits
// at the elbow — half a forearm away from anywhere a rifle should be. The palm
// bones hang off the wrist, so their centroid is the grip.
function handAnchor(model, out = new THREE.Vector3()) {
  const palms = ['PalmIR', 'PalmPR', 'PalmTR', 'PalmRR']
    .map((n) => model.getObjectByName(n))
    .filter(Boolean);
  if (!palms.length) return null;
  out.set(0, 0, 0);
  const v = new THREE.Vector3();
  for (const p of palms) { p.updateWorldMatrix(true, false); out.add(p.getWorldPosition(v)); }
  return out.divideScalar(palms.length);
}

// The rifle is modelled down its own +X with +Z up (verified against the
// pack's modular parts: Barrel_AR_1 runs to +X, Magazine_AR hangs to -Z).
// The unit faces its own +Z. This maps one onto the other.
const WEAPON_ROTATION = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, 1),   // rifle +X (muzzle) -> unit forward
    new THREE.Vector3(1, 0, 0),   // rifle +Y (thickness) -> unit right
    new THREE.Vector3(0, 1, 0),   // rifle +Z (top) -> up
  ),
);

// The unit's status light, on the head where the camera can read it.
//
// The walker this replaced shipped an `Eye` material that could be isolated
// and tinted per instance; the mech has one baked atlas and no such slot, so
// the sensor is built here instead and parented to the head bone. It inherits
// the head's idle motion, which is the part that makes it look like something
// is actually looking.
function buildVisor(color) {
  const g = new THREE.Group();
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.038, 0.025), mat(color, { emissive: 0.9 }));
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.05), mat(0x1b2422, { emissive: 0.02 }));
  hood.position.y = 0.042;
  hood.castShadow = true;
  g.add(hood, lens);
  g.userData.lens = lens;
  return g;
}

// Role kit, bolted to the back of the torso.
//
// Three robots off one file separate by colour, and colour is the first thing
// a 45-degree camera and a fog layer take away from you. A different lump on
// each back separates them by silhouette as well — and the back is what this
// camera mostly sees, so it is the cheapest place to spend the polygons.
function buildLoadout(id) {
  const g = new THREE.Group();
  const shell = (w, h, d, color = 0x3d4740) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, { emissive: 0.03 }));

  if (id === 'ALPHA') {
    // Command: a dish on a short mast. The unit doing the talking is the one
    // carrying the radio.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.19, 6), mat(0x232b28, { emissive: 0.02 }));
    mast.position.y = 0.16;
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.018, 10), mat(0x46524b, { emissive: 0.05 }));
    dish.position.set(0, 0.27, -0.04);
    dish.rotation.x = Math.PI / 2.5;
    g.add(shell(0.28, 0.2, 0.1), mast, dish);
  } else if (id === 'BETA-1') {
    // Recon: low profile, nothing that snags, one rearward sensor.
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.02), mat(0x5c6d63, { emissive: 0.14 }));
    lens.position.set(0.06, 0.01, -0.055);
    g.add(shell(0.24, 0.14, 0.085), lens);
  } else {
    // Heavy: twin cells and a feed running up over the shoulder.
    const a = shell(0.12, 0.29, 0.13); a.position.x = -0.085;
    const b = shell(0.12, 0.29, 0.13); b.position.x = 0.085;
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), mat(0x1c2422, { emissive: 0.02 }));
    feed.position.set(0.02, 0.2, 0.02);
    feed.rotation.z = 0.45;
    g.add(a, b, feed);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export class Unit {
  constructor({ id, x = 0, z = 0, heading = 0, coneRange = 8.5, coneFov = 70, scene }) {
    this.id = id;
    this.status = STATUS.HEALTHY;
    this.heading = heading;

    this.group = new THREE.Group();
    this.fallback = buildChassis(STATUS_COLOR[STATUS.HEALTHY]);
    this.statusPod = buildStatusPod(STATUS_COLOR[STATUS.HEALTHY]);
    this.group.add(this.fallback, this.statusPod);
    this.group.userData.tintParts = [
      ...this.fallback.userData.tintParts,
      this.statusPod.userData.pod,
    ];

    this.badge = buildBadge(UNIT_BADGE[id] || '?', STATUS_COLOR[STATUS.HEALTHY]);
    this.group.add(this.badge);
    this.group.position.set(x, groundAt(x, z), z);
    this.group.scale.setScalar((UNIT_LIVERY[id] || UNIT_LIVERY.ALPHA).scale);
    this.group.rotation.y = heading;
    this.group.name = id;
    scene.add(this.group);

    this.loadModel();

    this.cone = new SensorCone({
      color: STATUS_COLOR[STATUS.HEALTHY],
      range: coneRange,
      fov: coneFov,
      degraded: 0,
      // Kept low: three cones overlap constantly and additive blending
      // blows out to white if each one is strong on its own.
      opacity: 0.24,
      edgeStyle: UNIT_EDGE_STYLE[id] ?? 0,
    }).attachTo(this.group).addTo(scene);
    this.cone.setHeading(heading);
    this.baseRange = coneRange;
    this.coneFov = coneFov;
    this.scene = scene;
  }

  // Swap the stand-in for the real mech once its file lands.
  loadModel() {
    const { group, ready } = spawnModel(UNIT_MODEL, {
      height: MODEL_HEIGHT,
      skinned: true,                 // rebuild the skeleton per instance
    });
    this.group.add(group);

    // The rifle is a second, much smaller download that lands in the mech's
    // right hand. It is requested now so the two are usually in flight
    // together; if it never arrives the robot simply stands there empty-handed
    // rather than the mission stalling. Same contract as everything else here.
    const weapon = spawnModel(UNIT_WEAPON, {
      size: WEAPON_LENGTH,
      anchor: 'center',              // keep the rifle's own origin, at the grip
      overrides: WEAPON_SURFACES,
    });

    this.modelReady = ready.then((res) => {
      if (!res) return null;         // file missing — keep the stand-in
      this.group.remove(this.fallback);
      disposeTree(this.fallback);
      this.fallback = null;
      this.model = res.model;

      this.applyLivery(res.model);

      // Head-mounted sensor, tinted per unit and parented to the head bone so
      // it carries the idle's head motion. This is what replaces the walker's
      // isolated `Eye` material — the mech has one baked atlas and no slot to
      // isolate, so the light is built rather than found.
      const head = res.model.getObjectByName('Head');
      this.visor = buildVisor(STATUS_COLOR[this.status]);
      if (head) {
        attachToBone(head, this.visor, {
          anchor: null,
          offset: new THREE.Vector3(0, 0.085, 0.115),
          unit: this.group,
        });
      } else {
        this.visor.position.set(0, 1.45, 0.2);
        this.group.add(this.visor);
      }

      // Role kit on the back of the torso, riding the chest bone so it leans
      // with the robot instead of hovering behind it.
      const chest = res.model.getObjectByName('Chest');
      if (chest) {
        attachToBone(chest, buildLoadout(this.id), {
          anchor: null,
          offset: new THREE.Vector3(0, 0.1, -0.17),
          unit: this.group,
        });
      }

      this.group.userData.tintParts = [
        this.statusPod.userData.pod,
        this.visor.userData.lens,
      ];

      this.mixer = new THREE.AnimationMixer(res.model);
      // Clips are exported as "RobotArmature|Idle", and several of them need
      // their arms rebuilt before they are fit to play. See tacticalClips.
      this.clips = tacticalClips(res.animations);

      this.weaponReady = weapon.ready.then((w) => {
        if (!w) return null;
        this.armWith(weapon.group);
        return w;
      });

      this.play('Idle');

      // Re-apply whatever status the mission already put us in: the swap can
      // land after turn 1 has already broken somebody's sensor.
      this.setStatus(this.status, { animate: false });
      return res;
    });
  }

  // This unit's own copy of the atlas material, tinted to its livery — and
  // relit, which matters more.
  //
  // The mech ships its material under KHR_materials_unlit, so GLTFLoader hands
  // back a MeshBasicMaterial: the robots arrive rendering the raw bake at full
  // brightness, ignoring the key light, the cold ambient and every shadow in
  // the compound. Three bright green stickers walking over a lit scene. So the
  // material is rebuilt as a standard one around the same texture — same
  // download, same GPU memory, but now the squad is lit by the same lights as
  // the ground it is standing on.
  //
  // All three robots also clone one parsed file, so they arrive sharing a
  // single material and recolouring it in place would repaint the whole squad.
  // One copy per unit is the whole cost of telling ALPHA from BETA-2.
  applyLivery(model) {
    const livery = UNIT_LIVERY[this.id] || UNIT_LIVERY.ALPHA;
    const own = new Map();
    model.traverse((obj) => {
      if (!obj.isMesh && !obj.isSkinnedMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const next = mats.map((m) => {
        if (m?.name !== ATLAS_MATERIAL) return m;
        if (!own.has(m.uuid)) {
          const copy = new THREE.MeshStandardMaterial({
            map: m.map,
            color: livery.tint,
            roughness: livery.roughness,
            metalness: livery.metalness,
            side: m.side,
            // Smooth, not faceted. The chassis is round-shouldered and its
            // panel breaks are painted into the bake; faceting it would only
            // fight the texture that is doing the work.
            flatShading: false,
          });
          if (livery.lift) {
            copy.emissive.setHex(livery.tint);
            copy.emissiveIntensity = livery.lift;
            // The bake doubles as the emissive map, so the lift follows the
            // paintwork instead of flooding the whole chassis evenly.
            copy.emissiveMap = m.map;
          }
          copy.name = ATLAS_MATERIAL;
          own.set(m.uuid, copy);
        }
        return own.get(m.uuid);
      });
      obj.material = Array.isArray(obj.material) ? next : next[0];
    });
  }

  // Put the rifle in the right hand.
  //
  // The rig is posed into its carry stance first. The mixer may not have run
  // yet, or may be mid-clip, and the fit has to be measured against the pose
  // the robot actually holds the weapon in — not against the T-pose it binds
  // in. Writing the bones directly is safe: the next mixer.update overwrites
  // them, and the rifle keeps the local transform baked out of this frame.
  armWith(weapon) {
    const model = this.model;
    const hand = model.getObjectByName('LowerArmR');
    if (!hand) return;

    const idle = this.clips?.Idle;
    if (idle) {
      for (const [right, left] of ARM_PAIRS) {
        for (const node of [right, left]) {
          const track = quatTrack(idle, node);
          const bone = model.getObjectByName(node);
          if (track && bone) bone.quaternion.fromArray(track.values, 0);
        }
      }
    }
    model.updateMatrixWorld(true);

    const anchor = handAnchor(model);
    attachToBone(hand, weapon, {
      anchor,
      offset: new THREE.Vector3(WEAPON_OFFSET.x, WEAPON_OFFSET.y, WEAPON_OFFSET.z),
      rotation: WEAPON_ROTATION,
      unit: this.group,
    });
    this.weapon = weapon;
  }

  // Cross-fade to a clip. No-op if the rig has not arrived or lacks it.
  play(name, { fade = 0.25, timeScale = 1 } = {}) {
    const clip = this.clips?.[name];
    if (!this.mixer || !clip) return null;
    const next = this.mixer.clipAction(clip);
    if (this.current === next) { next.timeScale = timeScale; return next; }
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    next.timeScale = timeScale;
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
    this.currentName = name;
    return next;
  }

  // A hurt robot idles slower; a glitching one twitches. Costs one number and
  // it reads immediately at tactical zoom.
  idleForStatus() {
    const scale = this.status === STATUS.DAMAGED ? 0.45
      : this.status === STATUS.GLITCH ? 1.55
      : 1;
    this.play('Idle', { timeScale: scale });
  }

  get position() { return this.group.position; }

  // Put a unit somewhere, on the ground. Used by deploy and by the mission
  // restart, both of which used to drop units at y = 0 regardless.
  placeAt(x, z, heading = this.heading) {
    this.group.position.set(x, groundAt(x, z), z);
    this.group.rotation.y = heading;
    this.heading = heading;
    this.cone.mesh.rotation.y = heading;
  }

  // Marks this unit as the one under discussion: brighter cone border, and
  // the marker ring (if UnitMarkers is running) opens up around it.
  setFocus(on) {
    this.focused = !!on;
    gsap.to(this.cone.material.uniforms.uFocus, {
      value: on ? 1 : 0, duration: 0.35, ease: 'power2.out',
    });
  }

  // One ripple out through this unit's own cone — a reading it just took.
  ping(duration = 0.9, amplitude = 1) { this.cone.pulse(duration, amplitude); }

  setStatus(status, { animate = true } = {}) {
    this.status = status;
    const color = new THREE.Color(STATUS_COLOR[status]);
    for (const part of this.group.userData.tintParts) {
      part.material.color.copy(color);
      part.material.emissive.copy(color);
    }
    this.cone.material.uniforms.uColor.value.copy(color);
    this.badge.material.color.copy(color);

    const degraded = status === STATUS.HEALTHY ? 0 : status === STATUS.GLITCH ? 1 : 0.65;
    const range = status === STATUS.HEALTHY ? this.baseRange
      : status === STATUS.GLITCH ? this.baseRange * 0.45
      : this.baseRange * 0.7;

    // A broken cone has to stay loud, not fade away: the static eats a lot of
    // alpha, so push opacity up as degradation rises.
    const opacity = status === STATUS.HEALTHY ? 0.24 : 0.52;

    if (this.currentName !== 'Walk' && !this.down) this.idleForStatus();

    if (animate) {
      gsap.to(this.cone.material.uniforms.uDegraded, { value: degraded, duration: 0.9 });
      gsap.to(this.cone.material.uniforms.uOpacity, { value: opacity, duration: 0.9 });
      this.setConeRange(range, 0.9);
    } else {
      this.cone.degraded = degraded;
      this.cone.material.uniforms.uOpacity.value = opacity;
      this.setConeRange(range, 0);
    }
  }

  // Rebuilding geometry per frame would be wasteful; scaling the wedge is the
  // cheap way to shrink range and it keeps the shader's uv space intact.
  setConeRange(range, duration = 0.6) {
    const target = range / this.baseRange;
    if (duration === 0) {
      this.cone.mesh.scale.setScalar(target);
    } else {
      gsap.to(this.cone.mesh.scale, { x: target, y: target, z: target, duration, ease: 'power2.out' });
    }
  }

  faceTowards(x, z, duration = 0.35) {
    const dx = x - this.group.position.x;
    const dz = z - this.group.position.z;
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
    let target = Math.atan2(dx, dz);
    // Take the short way round.
    const current = this.heading;
    while (target - current > Math.PI) target -= Math.PI * 2;
    while (target - current < -Math.PI) target += Math.PI * 2;
    this.heading = target;
    gsap.to(this.group.rotation, { y: target, duration, ease: 'power2.out' });
    gsap.to(this.cone.mesh.rotation, { y: target, duration, ease: 'power2.out' });
  }

  moveTo(x, z, duration = 0.4, { run = false } = {}) {
    this.faceTowards(x, z, Math.min(duration, 0.3));
    // A damaged unit limps rather than marches. The clip is the same one; the
    // playback rate carries the whole read.
    //
    // `run` is for the beats where the squad is leaving somewhere rather than
    // advancing into it — an extraction with a fuse running should not look
    // like a patrol.
    const clip = run && this.clips?.Run && this.status !== STATUS.DAMAGED ? 'Run' : 'Walk';
    this.play(clip, { fade: 0.18, timeScale: this.status === STATUS.DAMAGED ? 0.6 : 1.15 });
    return gsap.to(this.group.position, {
      x, y: groundAt(x, z), z, duration, ease: 'power2.inOut',
      onComplete: () => this.idleForStatus(),
    });
  }

  // One burst, then back to whatever this unit's idle is. The clip is shorter
  // than the tracers it goes with, so the return to idle is scheduled rather
  // than hung off the clip ending — otherwise the rig snaps back to neutral
  // while rounds are still visibly in the air.
  fire(hold = 0.9) {
    if (!this.play('Shoot', { fade: 0.1 })) return;
    gsap.delayedCall(hold, () => {
      if (this.currentName === 'Shoot') this.idleForStatus();
    });
  }

  // Overarm throw for ordnance.
  throwOrdnance(hold = 0.8) {
    if (!this.play('Attack', { fade: 0.1 })) return;
    gsap.delayedCall(hold, () => {
      if (this.currentName === 'Attack') this.idleForStatus();
    });
  }

  // A unit that is lost stays down. One-shot, clamped at the last frame, and
  // it deliberately does not return to idle — a wreck on the board for the
  // rest of the mission is the point.
  fall() {
    const action = this.play('Death', { fade: 0.15 });
    if (!action) return;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    this.down = true;
  }

  // Cleared by a mission restart, which reuses the same unit objects.
  standUp() {
    this.down = false;
    this.idleForStatus();
  }

  // Walk an authored waypoint list, facing each next point before moving to
  // it. No pathfinding anywhere in this project: a solver that picks a
  // different route on a slow frame is exactly what ruins a rehearsed run.
  //
  // Returns a promise that settles when the last leg lands, so the Director
  // can hold the beat without depending on tween callbacks firing.
  async followPath(points, { duration = 2.4, run = false, offset = null } = {}) {
    if (!points || points.length < 2) return;
    // Leg time proportional to leg length, so the pace is even rather than
    // each leg taking the same time regardless of how far it is.
    const legs = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const [px, pz] = points[i - 1], [qx, qz] = points[i];
      const len = Math.hypot(qx - px, qz - pz);
      legs.push({ to: points[i], from: points[i - 1], len });
      total += len;
    }
    if (total < 0.001) return;

    const clip = run && this.clips?.Run && this.status !== STATUS.DAMAGED ? 'Run' : 'Walk';
    this.play(clip, { fade: 0.2, timeScale: this.status === STATUS.DAMAGED ? 0.6 : 1.15 });

    for (const leg of legs) {
      // Formation offset is applied in the frame of the leg, so the flankers
      // stay left and right of the direction of travel round a corner rather
      // than swapping sides.
      const [qx, qz] = leg.to;
      const dx = qx - leg.from[0], dz = qz - leg.from[1];
      const len = Math.hypot(dx, dz) || 1;
      const fx = dx / len, fz = dz / len;
      const rx = -fz, rz = fx;
      const tx = qx + (offset ? offset.side * rx - offset.back * fx : 0);
      const tz = qz + (offset ? offset.side * rz - offset.back * fz : 0);

      this.faceTowards(tx, tz, 0.22);
      const legTime = Math.max(0.12, duration * (leg.len / total));
      await new Promise((resolve) => {
        gsap.to(this.group.position, {
          x: tx, y: groundAt(tx, tz), z: tz,
          duration: legTime, ease: 'none', onComplete: resolve,
        });
      });
    }
    if (!this.down) this.idleForStatus();
  }

  // Signature unchanged — main.js calls update(t) with elapsed seconds — so
  // the frame delta the mixer needs is derived here rather than plumbed
  // through the render loop.
  update(t) {
    this.cone.update(t);
    if (this.mixer) {
      const dt = this.lastT === undefined ? 0 : Math.min(t - this.lastT, 0.1);
      this.mixer.update(dt);
    }
    this.lastT = t;
  }
}

// Face the compound door at (2.6, 2) with a slight fan so the cones read as
// three separate sensors rather than one blob.
function headingToward(x, z, tx = 2.6, tz = 2) {
  return Math.atan2(tx - x, tz - z);
}

export function createSquad(scene) {
  const spec = [
    { id: 'ALPHA', x: -5.5, z: 7.5, range: 9.5, fan: 0 },
    { id: 'BETA-1', x: -8.0, z: 5.0, range: 8.5, fan: -0.30 },
    { id: 'BETA-2', x: -3.0, z: 8.5, range: 8.5, fan: 0.30 },
  ];
  const [lead, unit2, unit3] = spec.map(({ id, x, z, range, fan }) => new Unit({
    id, x, z, coneRange: range, coneFov: 58,
    heading: headingToward(x, z) + fan,
    scene,
  }));
  return { lead, unit2, unit3, all: [lead, unit2, unit3] };
}
