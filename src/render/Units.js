import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';
import { SensorCone } from './SensorCones.js';

// Low-poly flat-shaded robots, built in code. No external model files, so the
// build stays offline-safe and there is no GLTF scale/orientation fight.
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

    this.group = buildChassis(STATUS_COLOR[STATUS.HEALTHY]);
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

  moveTo(x, z, duration = 0.4) {
    this.faceTowards(x, z, Math.min(duration, 0.3));
    return gsap.to(this.group.position, {
      x, z, duration, ease: 'power2.inOut',
    });
  }

  update(t) { this.cone.update(t); }
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
