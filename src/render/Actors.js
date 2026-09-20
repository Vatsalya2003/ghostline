import * as THREE from 'three';
import gsap from 'gsap';
import { groundAt } from './Units.js';
import { spawnModel } from './AssetLoader.js';
import { surfaceMaterial } from './Materials.js';

// ============================================================================
// THE PEOPLE
// ============================================================================
//
// Ammunition Depot is a mission about deciding who is in a room. The player is
// told about six figures, given a filing cabinet to look at, and asked whether
// to shoot one of them. That decision is made by looking at the board, so the
// board has to carry it: a captive and a shooter must be tellable apart across
// a room, at tactical zoom, without reading a word of the briefing.
//
// These used to be hand-built boxes. Boxes could carry "dark vs pale" and
// "standing vs seated" and nothing else — and a mission whose whole mechanic
// is *is that a person or a threat* cannot be argued on a stack of cubes.
// They are now rigged CC0 characters (Quaternius, public domain — see
// public/assets/SOURCES.md), posed by hand through their bones.
//
// TWO KINDS, and they are separated on every axis available:
//
//   HOSTILE   modular_men/Swat. Black tactical rig, helmet and visor, on
//             their feet, a rifle in both hands. Different MODEL, not just a
//             different colour — the silhouette says it before the palette.
//   CIVILIAN  modular_men/Worker and modular_women/Worker. Depot staff: hard
//             hat, hi-vis vest, work trousers. Two models so four hostages in
//             one room are not four copies of one man.
//
// Colour alone would not be enough — cyan, amber and red already mean things
// about the player's own squad on this board — so posture and restraint do
// most of the work. The hostages are on the floor with their wrists tied and
// a tether running down to a floor anchor. That is a shape, and shapes read
// at forty units where a hex code does not.
//
// NOBODY IS ANIMATED. These files ship with a rig and no clips, which is the
// right trade here: this room is a held frame, not a firefight, and a posed
// figure costs no mixer and no per-frame skinning update. The poses are bone
// rotations applied once, on load — see POSES and swingBone below.
//
// UNRESOLVED is the important state and is deliberately NOT a person. A figure
// the AI cannot classify is a dashed amber marker with no body at all, because
// the whole point of turn 6 is that you do not know what it is yet. Drawing it
// as either kind would answer the question the mission is asking.

// ---------------------------------------------------------------- the models

// Kit material name -> GHOSTLINE surface, per file. Character kits name their
// own materials (`Skin`, `Swat`, `Worker_Vest`) and several of those names
// collide with the prop table in Materials.js — `Eye` maps to the squad's
// emissive status tint, which would hand every hostage glowing cyan eyes, and
// anything unmapped falls through to concrete, which would hand them all
// concrete faces. Every material on these files is therefore named here.
//
// The two worker files disagree about what `Brown` means — trousers on the
// man, irises on the woman — so they get one map each rather than a shared one.
const GUARD_SURFACES = {
  Swat_Black: 'tacticalCloth',
  Swat: 'tacticalRig',
  Skin: 'skin',
  Visor: 'visor',
};

const WORKER_M_SURFACES = {
  Skin: 'skin',
  Worker_Yellow: 'hiVis',       // hard hat
  Worker_Vest: 'civVest',
  LightBrown: 'civCloth',       // shirt
  Brown: 'civTrouser',
  Brown2: 'civTrouserDark',
  Black: 'boot',
  Grey: 'boot',
  Eyebrows: 'hair',
  Moustache: 'hair',
  Eye: 'eyeDark',
};

const WORKER_F_SURFACES = {
  Skin: 'skin',
  Worker_Yellow: 'hiVis',
  Worker_Vest: 'civVest',
  White: 'civCloth',
  DarkBrown: 'hair',
  Brown: 'eyeDark',
  Brown_02: 'civTrouser',
  Brown2: 'civTrouserDark',
  Black: 'boot',
};

// World-space surfaces on purpose: an object-space projection samples the
// rifle's own file units, which are a hundredth of a metre across, and the
// whole weapon comes out one flat texel.
const RIFLE_SURFACES = {
  Main: 'steel', Grey: 'steel', White: 'steelLight', Black: 'steelDark',
};

const GUARD = { model: 'guard-swat', height: 1.82, surfaces: GUARD_SURFACES };
const CIVILIANS = [
  { model: 'civilian-worker', height: 1.74, surfaces: WORKER_M_SURFACES },
  { model: 'civilian-worker-f', height: 1.66, surfaces: WORKER_F_SURFACES },
];

const RIFLE_MODEL = 'rifle-ar';
const RIFLE_LENGTH = 0.78;

// --------------------------------------------------------------- the posing

// These rigs arrive in a T-pose with no animation clips, so every figure has
// to be posed here or the room fills up with people being crucified.
//
// A pose is a list of bone directions in the FIGURE'S OWN FRAME:
//
//     +Y up      +Z the way the figure is facing      +X its left
//
// (the character's right hand is at -X, which is what you get when +Z is
// forward and the frame is right-handed).
//
// Bones are listed parent-first. Each one is *swung* from where the rigger
// left it rather than rotated to an absolute orientation — see swingBone.
//
// `drop` sinks the whole body so a seated figure's weight lands on the floor
// instead of on its bind-pose feet. It is in the model file's own units and
// gets scaled with the figure.
const POSES = {
  // Armed and on their feet. The legs keep the bind pose, which is already a
  // standing one; everything from the waist up goes on the weapon. The right
  // hand is back at the hip, the left is forward and across — so the barrel
  // lies over the chest and sticks out past the left shoulder, which is the
  // read the whole mission hangs on: a shape, not a colour.
  guard: {
    drop: 0,
    bones: [
      ['Abdomen', [0, 0.995, 0.09]],
      ['Chest', [0, 0.995, -0.09]],
      ['Head', [0, 0.99, 0.12]],
      ['UpperArm.R', [-0.32, -0.90, -0.28]],
      ['LowerArm.R', [0.30, -0.30, 0.91]],
      ['Hand.R', [0.26, -0.22, 0.94]],
      ['UpperArm.L', [0.36, -0.82, 0.44]],
      ['LowerArm.L', [-0.50, -0.26, 0.83]],
      ['Hand.L', [-0.55, -0.22, 0.81]],
    ],
  },

  // A civilian on their feet: shoulders rolled in, head down, and both hands
  // held together in front at the waist where the tie can be seen. Nobody
  // stands like this unless something is being done to them.
  standBound: {
    drop: 0,
    bones: [
      ['Abdomen', [0, 0.99, 0.13]],
      ['Chest', [0, 0.98, 0.16]],
      ['Head', [0, 0.96, 0.28]],
      ['UpperArm.R', [-0.20, -0.96, 0.18]],
      ['LowerArm.R', [0.56, -0.42, 0.72]],
      ['Hand.R', [0.50, -0.40, 0.77]],
      ['UpperArm.L', [0.20, -0.96, 0.18]],
      ['LowerArm.L', [-0.56, -0.42, 0.72]],
      ['Hand.L', [-0.50, -0.40, 0.77]],
    ],
  },

  // On the floor, knees up, wrists together over the lap. This is the pose the
  // mission is decided on, so it is built to be unmistakable from above: half
  // the height of a guard, no weapon line, and the hands pinned to one point.
  seated: {
    drop: 0.73,
    bones: [
      ['Hips', [0, 0.96, -0.28]],
      ['Abdomen', [0, 0.96, -0.26]],
      ['Torso', [0, 0.99, 0.12]],
      ['Chest', [0, 0.98, 0.18]],
      ['Head', [0, 0.94, 0.33]],
      // Knees ABOVE the hips. Nobody sits like this on a chair, which is the
      // point: the pose has to say floor even when the floor is not in frame.
      ['UpperLeg.R', [-0.17, 0.66, 0.73]],
      ['LowerLeg.R', [-0.04, -0.93, 0.36]],
      ['Foot.R', [0, -0.12, 0.99]],
      ['UpperLeg.L', [0.17, 0.66, 0.73]],
      ['LowerLeg.L', [0.04, -0.93, 0.36]],
      ['Foot.L', [0, -0.12, 0.99]],
      ['UpperArm.R', [-0.26, -0.90, 0.35]],
      ['LowerArm.R', [0.55, 0.12, 0.83]],
      ['Hand.R', [0.45, 0.05, 0.89]],
      ['UpperArm.L', [0.26, -0.90, 0.35]],
      ['LowerArm.L', [-0.55, 0.12, 0.83]],
      ['Hand.L', [-0.45, 0.05, 0.89]],
    ],
  },

  // Folded down small behind cover. Deep squat, head tucked, hands pulled in
  // to the chest — the shape of someone trying not to be found.
  crouch: {
    drop: 0.46,
    bones: [
      ['Hips', [0, 0.96, 0.28]],
      ['Abdomen', [0, 0.93, 0.36]],
      ['Torso', [0, 0.96, 0.28]],
      ['Chest', [0, 0.97, 0.24]],
      ['Head', [0, 0.92, 0.39]],
      ['UpperLeg.R', [-0.16, -0.36, 0.92]],
      ['LowerLeg.R', [0, -0.60, -0.80]],
      ['Foot.R', [0, -0.10, 0.99]],
      ['UpperLeg.L', [0.16, -0.36, 0.92]],
      ['LowerLeg.L', [0, -0.60, -0.80]],
      ['Foot.L', [0, -0.10, 0.99]],
      ['UpperArm.R', [-0.22, -0.86, 0.46]],
      ['LowerArm.R', [0.60, 0.25, 0.76]],
      ['Hand.R', [0.50, 0.20, 0.84]],
      ['UpperArm.L', [0.22, -0.86, 0.46]],
      ['LowerArm.L', [-0.60, 0.25, 0.76]],
      ['Hand.L', [-0.50, 0.20, 0.84]],
    ],
  },
};

const POSE_FOR = { stand: 'standBound', seated: 'seated', crouch: 'crouch' };

const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Rotation accumulated from `root` (exclusive) down to `node` (inclusive) —
// i.e. where this bone is pointing in the figure's own frame.
function chainQuat(node, root, out = new THREE.Quaternion()) {
  out.identity();
  for (let n = node; n && n !== root; n = n.parent) out.premultiply(n.quaternion);
  return out;
}

// Swing a bone to point along `dir`, keeping the twist the rig was authored
// with.
//
// The obvious implementation — build the rotation that takes +Y to `dir` and
// write it in — is wrong, and wrong in a way that is hard to see coming: the
// shortest rotation from +Y carries no information about roll, so an arm swung
// down from a T-pose comes out with its elbow rotated to an arbitrary angle
// and bends sideways. Swinging from the BIND direction instead leaves every
// bone's authored roll intact and only moves it where it was asked to go,
// which is what an animator's FK handle does.
//
// `bind` holds each bone's figure-space orientation captured before anything
// was touched. Parents are posed first, so the parent term below is the live,
// already-posed chain while the bone's own term is still its rest pose.
function swingBone(bone, root, bind, dir, roll = 0) {
  const bindQ = bind.get(bone);
  if (!bindQ) return;
  const from = _v.copy(_up).applyQuaternion(bindQ).normalize();
  const to = _v2.set(dir[0], dir[1], dir[2]).normalize();
  const want = new THREE.Quaternion().setFromUnitVectors(from, to).multiply(bindQ);
  if (roll) want.premultiply(new THREE.Quaternion().setFromAxisAngle(to, roll));
  bone.quaternion.copy(chainQuat(bone.parent, root).invert().multiply(want));
}

// GLTFLoader sanitises node names on the way in: a dot is a reserved
// character in three's animation property paths, so the rig's `UpperArm.R`
// arrives as `UpperArmR` on the Object3D. The tables above are written in the
// rig's own names — which is what you see in Blender and in the .glb — so
// both sides of every lookup come through here.
//
// Missing this is silent and very confusing: the dotless bones (Hips, Chest,
// Head) pose, every limb stays in its T-pose, and the room fills with people
// being crucified six inches under the floor.
const boneKey = (name) => name.replace(/[.:[\]/]/g, '');

function boneMap(root) {
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[boneKey(o.name)] = o; });
  return bones;
}

function applyPose(root, bones, pose, jitter = 0) {
  const bind = new Map();
  for (const b of Object.values(bones)) bind.set(b, chainQuat(b, root));
  for (const [name, dir, roll] of pose.bones) {
    const bone = bones[boneKey(name)];
    if (bone) swingBone(bone, root, bind, dir, roll || 0);
  }
  // A room of identical people is a room of props. One small head turn each,
  // deterministic per actor, is enough to break the copy-paste read without
  // costing a second pose table.
  if (jitter && bones.Neck) bones.Neck.rotation.y += jitter;
}

// CLOSE THE HANDS.
//
// The rigs ship with the fingers splayed flat, which is correct for a T-pose
// and wrong for everyone in this room: these people are either gripping a
// weapon or tied at the wrists, and a spread hand reads as neither. Left
// alone it looks, at close zoom, like six people doing jazz hands.
//
// Derived from the hand rather than hard-coded, because the three files do
// not agree on the rig: the SWAT hand numbers its finger bones 2-3-4 and the
// women's 1-2-3. So the curl direction is measured — fingers close toward the
// palm, and which side the palm is on falls out of the handedness of the
// cross product of the finger direction with the thumb's. Each joint is bent
// a little further than its parent, which is what makes a fist instead of a
// flat hand rotated at the knuckle.
const FINGER = /^(Index|Middle|Ring|Pinky)\d/;

function depthFrom(bone, stop) {
  let d = 0;
  for (let n = bone; n && n !== stop; n = n.parent) d += 1;
  return d;
}

function curlFingers(root, bones, step = 0.45) {
  root.updateMatrixWorld(true);
  for (const side of ['R', 'L']) {
    const hand = bones[`Hand${side}`];
    const tip = bones[`Middle4${side}`] || bones[`Middle3${side}`];
    const thumb = bones[`Thumb3${side}`] || bones[`Thumb2${side}`];
    if (!hand || !tip || !thumb) continue;

    const h = root.worldToLocal(worldOf(hand, new THREE.Vector3()));
    const f = root.worldToLocal(worldOf(tip, new THREE.Vector3())).sub(h).normalize();
    const t = root.worldToLocal(worldOf(thumb, new THREE.Vector3())).sub(h).normalize();
    const palm = new THREE.Vector3().crossVectors(f, t)
      .multiplyScalar(side === 'R' ? -1 : 1);
    if (palm.lengthSq() < 0.05) continue;    // thumb in line with the fingers
    palm.normalize();

    const digits = Object.entries(bones)
      .filter(([name, bone]) => name.endsWith(side) && FINGER.test(name)
        && depthFrom(bone, hand) > 0 && depthFrom(bone, hand) < 8)
      .map(([, bone]) => bone)
      .sort((a, b) => depthFrom(a, hand) - depthFrom(b, hand));

    const bind = new Map();
    for (const b of digits) bind.set(b, chainQuat(b, root));
    for (const b of digits) {
      const from = _up.clone().applyQuaternion(bind.get(b)).normalize();
      const perp = palm.clone().sub(from.clone().multiplyScalar(palm.dot(from)));
      if (perp.lengthSq() < 1e-6) continue;
      const a = step * depthFrom(b, hand);
      const dir = from.multiplyScalar(Math.cos(a))
        .add(perp.normalize().multiplyScalar(Math.sin(a)));
      swingBone(b, root, bind, [dir.x, dir.y, dir.z]);
    }
  }
}

// Accumulated uniform scale from `node` up to `stop` (exclusive). These rigs
// carry a x100 armature scale, so anything parented to a bone has to be told
// what a metre is.
function accumScale(node, stop) {
  let s = 1;
  for (let n = node; n && n !== stop; n = n.parent) s *= n.scale.x;
  return s;
}

// A box spanning two points. Restraints are straight runs between two things
// that have already been measured, which is all a cable tie or a tether is.
function link(a, b, w, mat, extra = 0) {
  const d = _v.subVectors(b, a);
  const len = Math.max(d.length() + extra, 0.02);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, len), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize());
  m.castShadow = true;
  return m;
}

const _p = new THREE.Vector3();
const worldOf = (obj, out) => out.setFromMatrixPosition(obj.matrixWorld);

// THE RESTRAINT. Measured off the posed skeleton rather than guessed: the tie
// is drawn between wherever the two wrists actually ended up, so it stays on
// them whatever the pose does.
//
// Deliberately overscaled. This is the cue turns 5 to 7 are decided on, and a
// correctly-sized cable tie at tactical zoom is two pixels of nothing.
function restrain(body, bones, { tether = false } = {}) {
  const hl = bones[boneKey('Hand.L')];
  const hr = bones[boneKey('Hand.R')];
  if (!hl || !hr) return;

  const mat = surfaceMaterial('restraint');
  const pl = body.worldToLocal(worldOf(hl, new THREE.Vector3()));
  const pr = body.worldToLocal(worldOf(hr, new THREE.Vector3()));
  body.add(link(pr, pl, 0.055, mat, 0.13));

  if (!tether) return;

  // Down to the floor between the knees, where nothing else is, so the line is
  // never buried in a thigh. The player should be able to see what is holding
  // them there, not infer it from a sentence in the log.
  const mid = pl.clone().add(pr).multiplyScalar(0.5);
  const anchor = new THREE.Vector3(mid.x, 0.03, mid.z + 0.08);
  body.add(link(mid, anchor, 0.028, mat));

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 0.06, 8), surfaceMaterial('steelDark'),
  );
  plate.position.copy(anchor).setY(0.025);
  plate.castShadow = true;
  body.add(plate);
}

// THE RIFLE, in the hand rather than near it.
//
// Parented to the right hand bone, then turned so the barrel runs through the
// left hand — which means the weapon lands in both hands for any arm pose,
// instead of being hand-placed against one of them and floating off the other.
function holdRifle(body, bones) {
  const hand = bones[boneKey('Hand.R')];
  const support = bones[boneKey('Hand.L')];
  if (!hand) return;

  const mount = new THREE.Group();
  mount.name = 'rifle-mount';
  mount.scale.setScalar(1 / accumScale(hand, body));
  hand.add(mount);

  const { group: rifle } = spawnModel(RIFLE_MODEL, {
    size: RIFLE_LENGTH, anchor: 'center', overrides: RIFLE_SURFACES,
  });
  mount.add(rifle);

  if (!support) return;
  body.updateMatrixWorld(true);

  // Everything below is in mount space, which the scale above has made
  // metre-sized again. The file's origin sits at the grip and the barrel runs
  // toward -X, so -X is what has to end up pointing at the support hand.
  const target = mount.worldToLocal(worldOf(support, new THREE.Vector3()));
  const dir = target.clone().normalize();
  const ex = dir.clone().negate();
  const upLocal = _p.copy(_up)
    .applyQuaternion(mount.getWorldQuaternion(new THREE.Quaternion()).invert());
  const ey = upLocal.clone().sub(ex.clone().multiplyScalar(upLocal.dot(ex)));
  if (ey.lengthSq() < 1e-6) ey.set(0, 1, 0);
  ey.normalize();
  const ez = new THREE.Vector3().crossVectors(ex, ey);
  rifle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
}

// ------------------------------------------------------------- the fallbacks

// The stand-in, on screen until the file lands and forever if it never does.
// Same contract as the units and the audio: a missing asset is a coarser
// mission, never a missing one. It is the blocky figure these actors used to
// be, on the same surfaces the real models get, so the swap is a sharpening
// rather than a recolour.
function blockFigure(armed, pose) {
  const g = new THREE.Group();
  const cloth = surfaceMaterial(armed ? 'tacticalCloth' : 'civCloth');
  const trim = surfaceMaterial(armed ? 'tacticalRig' : 'hiVis');
  const skin = surfaceMaterial('skin');
  const gear = surfaceMaterial(armed ? 'tacticalRig' : 'civVest');

  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };

  const seated = pose === 'seated';
  const crouch = pose === 'crouch';
  const legH = seated ? 0.36 : crouch ? 0.46 : 0.78;
  const torsoY = legH + (seated ? 0.32 : crouch ? 0.30 : 0.42);

  for (const side of [-1, 1]) {
    const leg = box(0.17, legH, 0.19, cloth, side * 0.13, legH / 2, 0);
    if (seated) { leg.rotation.x = -1.15; leg.position.set(side * 0.13, 0.20, 0.22); }
    g.add(leg);
  }
  g.add(box(0.46, seated ? 0.58 : 0.62, 0.27, cloth, 0, torsoY, 0));
  g.add(box(0.48, 0.16, 0.30, trim, 0, torsoY + 0.16, 0));
  const headY = torsoY + (seated ? 0.44 : 0.48);
  g.add(box(0.24, 0.26, 0.24, skin, 0, headY, 0));
  g.add(box(0.28, 0.10, 0.28, armed ? gear : trim, 0, headY + 0.17, 0));

  for (const side of [-1, 1]) {
    const arm = box(0.13, 0.48, 0.14, cloth, side * 0.29, torsoY + 0.05, 0);
    if (!armed) { arm.rotation.x = -0.9; arm.position.set(side * 0.17, torsoY - 0.02, 0.22); }
    else { arm.rotation.x = -0.55; arm.position.set(side * 0.26, torsoY + 0.02, 0.10); }
    g.add(arm);
  }

  if (armed) {
    const rifle = new THREE.Group();
    rifle.add(box(0.07, 0.07, 0.84, gear, 0, 0, 0));
    rifle.add(box(0.06, 0.16, 0.16, gear, 0, -0.10, -0.18));
    rifle.position.set(0.10, torsoY + 0.06, 0.28);
    rifle.rotation.set(0.12, -0.35, 0);
    g.add(rifle);
  } else {
    const bind = surfaceMaterial('restraint');
    g.add(box(0.26, 0.10, 0.13, bind, 0, torsoY - 0.14, 0.41));
    if (seated) {
      const tether = box(0.05, 0.05, 0.52, bind, 0, torsoY - 0.16, 0.14);
      tether.rotation.x = 0.22;
      g.add(tether);
    }
  }
  return g;
}

function disposeTree(root) {
  root.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
}

// One person: a group that can be parented and positioned right now, with the
// real figure landing inside it when the file arrives.
function person(kindName, poseName, variant = 0, jitter = 0) {
  const body = new THREE.Group();
  const armed = kindName === 'hostile';
  const look = armed ? GUARD : CIVILIANS[variant % CIVILIANS.length];
  // A hostile is always on his feet with the weapon up, whatever the table
  // says about posture — the pose field describes civilians.
  const pose = armed ? POSES.guard : (POSES[POSE_FOR[poseName]] || POSES.standBound);

  const fallback = blockFigure(armed, poseName);
  body.add(fallback);

  const { group, ready } = spawnModel(look.model, {
    height: look.height,
    skinned: true,            // rebuild the skeleton per instance
    overrides: look.surfaces,
    // These faces are modelled smooth. Faceting them, which is right for the
    // compound's hard-edged props, turns a head into a gemstone.
    flatShading: false,
  });
  body.add(group);

  ready.then((res) => {
    if (!res) return;         // file missing — the stand-in stays
    body.remove(fallback);
    disposeTree(fallback);

    // `drop` is in the file's units; the figure has been scaled to a real
    // height since, so the sink has to come with it.
    const s = res.bounds?.size?.y ? look.height / res.bounds.size.y : 1;
    group.position.y = -(pose.drop || 0) * s;

    const bones = boneMap(res.model);
    applyPose(res.model, bones, pose, jitter);
    curlFingers(res.model, bones);
    body.updateMatrixWorld(true);

    if (armed) holdRifle(body, bones);
    else restrain(body, bones, { tether: poseName === 'seated' });
  });

  return body;
}

// The ground marker under a figure. This is what makes them findable at
// tactical zoom, where a 1.8-unit figure is forty pixels tall.
function marker(color, { dashed = false } = {}) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, dashed ? 0.50 : 0.52, dashed ? 16 : 28, 1,
      0, dashed ? Math.PI * 2 : Math.PI * 2),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: dashed ? 0.55 : 0.8,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.renderOrder = 8;
  return ring;
}

// An unresolved contact. Not a person — a shape the sensors have registered
// and cannot classify. Drawn as a tall thin marker so it reads as "something
// is there" without telling the player what.
function unresolved() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe0a84c, transparent: true, opacity: 0.85, depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Spans 0.55 to 2.25 so the upper bars clear a 1.5-unit filing cabinet.
  // An unresolved contact the player cannot actually see is not a decision.
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.16), mat);
    bar.position.y = 0.55 + i * 0.42;
    bar.renderOrder = 9;
    g.add(bar);
    const bar2 = bar.clone();
    bar2.rotation.y = Math.PI / 2;
    g.add(bar2);
  }
  g.userData.bars = g.children;
  return g;
}

const KIND = {
  hostile: { armed: true, ring: 0xe0524c },
  civilian: { armed: false, ring: 0xe0a84c },
};

export class Actors {
  constructor(scene, specs = []) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'actors';
    this.byId = new Map();

    let civilians = 0;

    for (const spec of specs) {
      const kind = KIND[spec.kind] || KIND.hostile;
      const holder = new THREE.Group();
      holder.name = `actor-${spec.id}`;

      // Which of the two civilian models this one is. Assigned in table order
      // so the four in the holding room alternate rather than landing as four
      // copies of the same man.
      const variant = spec.kind === 'civilian' ? civilians++ : 0;
      const jitter = ((variant % 3) - 1) * 0.18;

      const body = spec.state === 'unresolved'
        ? unresolved()
        : person(spec.kind, spec.pose || 'stand', variant, jitter);
      holder.add(body);

      const ring = marker(spec.state === 'unresolved' ? 0xe0a84c : kind.ring,
                          { dashed: spec.state === 'unresolved' });
      holder.add(ring);

      holder.position.set(spec.at[0], groundAt(spec.at[0], spec.at[1]), spec.at[1]);
      holder.rotation.y = spec.face ?? 0;
      holder.visible = false;
      this.group.add(holder);

      this.byId.set(spec.id, {
        spec, holder, body, ring, variant, jitter,
        kind: spec.kind, down: false, resolved: spec.state !== 'unresolved',
      });
    }

    scene.add(this.group);
    console.log(`[actors] ${this.byId.size} figures placed`);
  }

  // Show exactly the set this turn declares, and walk anyone whose circuit
  // moves them on.
  //
  // The walking is not decoration. A patrol that stands still while the squad
  // crosses the yard makes a liar of the turn that says "crosses in the gap,
  // no contact" — the board has to agree with the line, or the player is
  // being told one thing and shown another.
  // `flags` is the live GameState, so an actor can be gated on something the
  // player has actually done. The room's occupants are gated on the sweep:
  // before it they are not on the board at all, because the whole point of
  // the beat is that you cannot see into that room — you can only sense it.
  showForTurn(turnId, flags = {}) {
    for (const a of this.byId.values()) {
      // Anyone already down stays down and stays visible. The whole reason
      // for putting people on the board is that a decision leaves something
      // behind — hiding the body turns it back into a number changing.
      const gate = a.spec.requiresFlag;
      const allowed = !gate || !!flags[gate];
      const on = a.down || (allowed && (a.spec.turns || []).includes(turnId));

      if (on && !a.down) this.walkTo(a, turnId);

      if (a.holder.visible === on) continue;
      a.holder.visible = on;
      if (on) {
        a.holder.scale.setScalar(0.9);
        gsap.to(a.holder.scale, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'back.out(2)' });
      }
    }
  }

  // Move an actor to wherever its circuit puts it this turn. Walks if it is
  // already on screen, snaps if it is arriving.
  walkTo(a, turnId) {
    const step = a.spec.move?.[turnId];
    const at = step?.at || a.spec.at;
    const face = step?.face ?? a.spec.face ?? 0;
    const y = groundAt(at[0], at[1]);
    if (Math.abs(a.holder.position.x - at[0]) < 0.01
        && Math.abs(a.holder.position.z - at[1]) < 0.01) return;

    if (!a.holder.visible) {
      a.holder.position.set(at[0], y, at[1]);
      a.holder.rotation.y = face;
      return;
    }
    gsap.to(a.holder.position, { x: at[0], y, z: at[1], duration: 2.2, ease: 'none' });
    gsap.to(a.holder.rotation, { y: face, duration: 0.6, ease: 'power2.out' });
  }

  // Where an actor is right now — the Director aims tracers at this.
  positionOf(id) {
    const a = this.byId.get(id);
    return a ? a.holder.position : null;
  }

  // Turn 6: the figure behind the cabinet stands up and turns out to be a
  // person. Replacing the marker with a body IS the reveal, so it is one call.
  resolve(id, kind = 'civilian', pose = 'crouch') {
    const a = this.byId.get(id);
    if (!a || a.resolved) return;
    a.holder.remove(a.body);
    const k = KIND[kind] || KIND.civilian;
    a.body = person(kind, pose, a.variant, a.jitter);
    a.holder.add(a.body);
    a.holder.remove(a.ring);
    a.ring = marker(k.ring);
    a.holder.add(a.ring);
    a.resolved = true;
    a.kind = kind;
    a.holder.scale.setScalar(0.85);
    gsap.to(a.holder.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2)' });
  }

  // Taken down. Falls flat and stays on the board — a body you can still see
  // is the difference between a decision having a cost and a number changing.
  drop(id) {
    const a = this.byId.get(id);
    if (!a || a.down) return;
    a.down = true;
    gsap.to(a.holder.rotation, { x: -Math.PI / 2 * 0.86, duration: 0.5, ease: 'power2.in' });
    gsap.to(a.holder.position, { y: a.holder.position.y + 0.12, duration: 0.5 });
    gsap.to(a.ring.material, { opacity: 0.25, duration: 0.5 });
  }

  // Everything a mission outcome can say about the people on the board.
  applyOutcome(outcome = {}) {
    for (const id of [].concat(outcome.dropActors || [])) this.drop(id);
    for (const [id, how] of Object.entries(outcome.resolveActors || {})) {
      this.resolve(id, how.kind, how.pose);
    }
  }

  // The compound knows. Hostages get moved out of the room the AI described —
  // which is the point: every reading the player was given about that room is
  // now stale, and they were told so only by the alarm going off.
  onAlarm() {
    let moved = 0;
    for (const a of this.byId.values()) {
      if (a.down || a.kind !== 'civilian') continue;
      // Herded toward the back of the building, away from the doorway.
      const dx = -1.6 - moved * 0.5;
      const dz = -2.2 - (moved % 2) * 0.8;
      const x = a.holder.position.x + dx;
      const z = a.holder.position.z + dz;
      gsap.to(a.holder.position, {
        x, y: groundAt(x, z), z, duration: 2.6, ease: 'power1.inOut',
      });
      moved += 1;
    }
    // Everyone still standing is now looking for you.
    for (const a of this.byId.values()) {
      if (a.down || a.kind !== 'hostile') continue;
      a.ring.material.color.setHex(0xff3b30);
      gsap.to(a.ring.material, { opacity: 1, duration: 0.4, yoyo: true, repeat: 5 });
    }
    this.alarmed = true;
    return moved;
  }

  reset() {
    this.alarmed = false;
    for (const a of this.byId.values()) {
      a.down = false;
      a.holder.rotation.set(0, a.spec.face ?? 0, 0);
      a.holder.position.set(a.spec.at[0], groundAt(a.spec.at[0], a.spec.at[1]), a.spec.at[1]);
      a.holder.scale.setScalar(1);
      a.holder.visible = false;
      a.ring.material.opacity = a.spec.state === 'unresolved' ? 0.55 : 0.8;
    }
  }

  // Unresolved contacts pulse, so an unclassified return never sits there
  // looking like a settled fact.
  update(t) {
    for (const a of this.byId.values()) {
      if (a.resolved || !a.holder.visible) continue;
      const k = 0.65 + 0.35 * Math.sin(t * 3.2);
      for (const bar of a.body.children) bar.material.opacity = 0.35 + k * 0.5;
    }
  }
}

export function createActors(scene, specs) { return new Actors(scene, specs); }
