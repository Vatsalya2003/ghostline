import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';
import { SensorCone } from './SensorCones.js';
import { spawnModel } from './AssetLoader.js';
import { meshesUsing } from './Materials.js';

// Squad robots. A CC0 low-poly walker (see public/assets/SOURCES.md) carrying
// a skeletal Idle/Walk rig, re-tinted into the GHOSTLINE palette on load.
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
const MODEL_HEIGHT = 1.45;
const UNIT_MODEL = 'squad-walker';

// Kit material -> GHOSTLINE surface, for this model only. `Main` is the body
// shell, `Main2` the feet and shoulder pads, `Edge` the frame around the eye;
// the two Grey slots are the weapon housing. `Eye` is isolated instead of
// mapped: it is the status light and each unit tints its own copy.
const UNIT_SURFACES = {
  Main: 'armour',
  Main2: 'armourDark',
  Edge: 'armourTrim',
  Grey: 'steelDark',
  LightGrey: 'steel',
  Dark: 'rubber',
};

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
  const pod = new THREE.Mesh(new THREE.OctahedronGeometry(0.115), mat(color, { emissive: 1.5 }));
  pod.position.y = 1.50;
  mast.castShadow = true;
  g.add(mast, pod);
  g.userData.pod = pod;
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
    this.group.position.set(x, 0, z);
    this.group.scale.setScalar(1.2);
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

  // Swap the stand-in for the real walker once its file lands.
  loadModel() {
    const { group, ready } = spawnModel(UNIT_MODEL, {
      height: MODEL_HEIGHT,
      skinned: true,                 // rebuild the skeleton per instance
      isolate: ['Eye'],              // status light, tinted per unit
      overrides: UNIT_SURFACES,
    });
    this.group.add(group);

    this.modelReady = ready.then((res) => {
      if (!res) return null;         // file missing — keep the stand-in
      this.group.remove(this.fallback);
      disposeTree(this.fallback);
      this.fallback = null;
      this.model = res.model;

      // The eye is the unit's own material copy, so it joins the tint set.
      // One representative mesh is enough: every mesh sharing the material
      // changes with it, and FX.hitFlash would otherwise tween it five times.
      const eye = res.tinted.Eye;
      const eyeMesh = eye ? meshesUsing(res.model, eye)[0] : null;
      this.group.userData.tintParts = [
        this.statusPod.userData.pod,
        ...(eyeMesh ? [eyeMesh] : []),
      ];

      this.mixer = new THREE.AnimationMixer(res.model);
      this.clips = {};
      for (const clip of res.animations) {
        // Clips are exported as "CharacterArmature|Idle".
        this.clips[clip.name.split('|').pop()] = clip;
      }
      this.play('Idle');

      // Re-apply whatever status the mission already put us in: the swap can
      // land after turn 1 has already broken somebody's sensor.
      this.setStatus(this.status, { animate: false });
      return res;
    });
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
      x, z, duration, ease: 'power2.inOut',
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
