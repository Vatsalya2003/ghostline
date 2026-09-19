import * as THREE from 'three';
import gsap from 'gsap';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PALETTE } from './Scene.js';
import { SensorCone } from './SensorCones.js';
import {
  loadCharacter, loadClips, MODEL_FACING_OFFSET, DEFAULT_CLIP,
} from './ModelLoader.js';
import { attachRifle } from './Weapon.js';

// Squad units: a Mixamo skinned character per robot, with the procedural
// chassis kept as a fallback if the model fails to load.
//
// Load order matters here. createSquad() returns immediately with box
// stand-ins so the game can boot and the title screen can show; attachModels()
// then swaps in the skinned character behind it. Badge, sensor cone, status
// tint and position all survive the swap.
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
  const pod = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), mat(color, { emissive: 0.9 }));
  pod.position.set(0, 1.34, -0.05);

  for (const m of [body, head, visor, trackL, trackR, pod]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.userData.tintParts = [visor, pod];
  return g;
}

export class Unit {
  constructor({ id, x = 0, z = 0, heading = 0, coneRange = 8.5, coneFov = 70, scene }) {
    this.id = id;
    this.status = STATUS.HEALTHY;
    this.heading = heading;

    this.group = new THREE.Group();
    this.chassis = buildChassis(STATUS_COLOR[STATUS.HEALTHY]);
    this.group.add(this.chassis);
    this.tintParts = this.chassis.userData.tintParts;
    this.mixer = null;
    this.actions = new Map();
    this.currentClip = null;

    // FX.hitFlash() reaches in via group.userData.tintParts — keep it pointed
    // at whatever chassis is currently mounted.
    this.group.userData.tintParts = this.tintParts;

    this.badge = buildBadge(UNIT_BADGE[id] || '?', STATUS_COLOR[STATUS.HEALTHY]);
    this.group.add(this.badge);
    this.group.position.set(x, 0, z);
    this.group.scale.setScalar(1.2);
    this.group.rotation.y = heading;
    this.group.name = id;
    scene.add(this.group);

    this.cone = new SensorCone({
      color: STATUS_COLOR[STATUS.HEALTHY],
      range: coneRange,
      fov: coneFov,
      degraded: 0,
      // Kept low: three cones overlap constantly and additive blending
      // blows out to white if each one is strong on its own.
      opacity: 0.24,
    }).attachTo(this.group).addTo(scene);
    this.cone.setHeading(heading);
    this.baseRange = coneRange;
    this.coneFov = coneFov;
    this.scene = scene;
  }

  get position() { return this.group.position; }

  setStatus(status, { animate = true } = {}) {
    this.status = status;
    const color = new THREE.Color(STATUS_COLOR[status]);
    if (this.modelMaterial) {
      this.modelMaterial.color.copy(color);
      this.modelMaterial.emissive.copy(color);
      this.modelMaterial.emissiveIntensity = status === STATUS.HEALTHY ? 0.35 : 0.6;
    } else {
      for (const part of this.tintParts) {
        part.material.color.copy(color);
        part.material.emissive.copy(color);
      }
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

  // Swap the box stand-in for a skinned clone. SkeletonUtils.clone() is
  // required — Object3D.clone() shares the skeleton and every unit ends up
  // playing the same animation on the same bones.
  setModel(character, clips) {
    const model = cloneSkinned(character.root);
    model.position.y = character.footOffset;
    model.rotation.y = MODEL_FACING_OFFSET;

    // The FBX references its textures by absolute paths from Mixamo's export
    // machine, so nothing resolves and the stock materials render black. The
    // art direction calls for untextured flat-shaded units anyway, so give
    // the character one palette material per unit — which also makes status
    // tinting a single assignment instead of a traversal.
    this.modelMaterial = new THREE.MeshStandardMaterial({
      color: STATUS_COLOR[this.status],
      emissive: STATUS_COLOR[this.status],
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.25,
      flatShading: true,
    });

    model.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      child.material = this.modelMaterial;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    });

    this.group.remove(this.chassis);
    this.chassis = model;
    this.group.add(model);
    // FX.hitFlash() animates emissiveIntensity on whatever is in tintParts.
    this.tintParts = [{ material: this.modelMaterial, userData: { emissiveOnly: true } }];
    this.group.userData.tintParts = this.tintParts;
    this.group.scale.setScalar(1.0);   // model carries its own scale

    // Parented to the hand bone, so it follows every clip without extra work.
    this.rifle = attachRifle(model);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions.clear();
    for (const [name, clip] of clips) {
      this.actions.set(name, this.mixer.clipAction(clip));
    }
    this.currentClip = null;

    const first = this.actions.has(DEFAULT_CLIP) ? DEFAULT_CLIP : [...this.actions.keys()][0];
    if (first) this.playAnimation(first, 0);

    this.setStatus(this.status, { animate: false });
    return this;
  }

  playAnimation(name, fade = 0.3) {
    const next = this.actions.get(name);
    if (!next || this.currentClip === name) return false;

    const previous = this.currentClip ? this.actions.get(this.currentClip) : null;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (previous && fade > 0) {
      next.crossFadeFrom(previous, fade, false);
    } else if (previous) {
      previous.stop();
    }
    this.currentClip = name;
    return true;
  }

  moveTo(x, z, duration = 0.4) {
    this.faceTowards(x, z, Math.min(duration, 0.3));
    const walking = this.playAnimation('walk');
    return gsap.to(this.group.position, {
      x, z, duration, ease: 'power2.inOut',
      onComplete: () => { if (walking) this.playAnimation(DEFAULT_CLIP); },
    });
  }

  update(t, dt = 0) {
    this.cone.update(t);
    if (this.mixer) this.mixer.update(dt);
  }
}

// Face the compound door at (2.6, 2) with a slight fan so the cones read as
// three separate sensors rather than one blob.
function headingToward(x, z, tx = 2.6, tz = 2) {
  return Math.atan2(tx - x, tz - z);
}

// Loads the character and clips once, then clones per unit. Call after
// createSquad(); the squad plays as boxes until this resolves.
export async function attachModels(squad) {
  try {
    const [character, clips] = await Promise.all([loadCharacter(), loadClips()]);
    if (character.clips.size && !clips.size) {
      for (const [k, v] of character.clips) clips.set(k, v);
    }
    for (const unit of squad.all) unit.setModel(character, clips);
    console.log(`[model] ${squad.all.length} units skinned, clips: ${[...clips.keys()].join(', ') || 'none'}`);
    return true;
  } catch (err) {
    console.warn('[model] load failed — staying on box placeholders', err);
    return false;
  }
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
