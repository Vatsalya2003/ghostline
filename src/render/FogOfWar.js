import * as THREE from 'three';
import { GROUND_SIZE, getEnvironment } from './Scene.js';

// Three tiers, not two.
//
//   UNKNOWN   — never been swept. Nearly black, with a slow crawl of signal
//               noise so it reads as "no data" rather than "empty floor".
//   EXPLORED  — swept earlier this mission. Lifted, but cold and flat: you
//               remember the ground, you are not looking at it now.
//   VISIBLE   — inside a live sensor cone. The cones draw additively on top of
//               this plane, so lit area still means visible area.
//
// Explored is held in a small canvas that each unit's cone stamps a wedge into
// as it sweeps. 128x128 over a 30-unit board is ~23cm per texel — far finer
// than the frontier softness, so nothing reads as blocky.

const DEFAULT_MEM = 128;
const UPDATE_HZ = 12;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uMemory;
  uniform float uTime;
  uniform float uUnknown;    // opacity over never-swept ground
  uniform float uExplored;   // opacity over remembered ground
  uniform vec3  uColor;
  uniform vec3  uEdgeColor;
  uniform float uReveal;     // 0..1 global curtain, used on mission start
  varying vec2  vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y);
  }

  void main() {
    float mem = texture2D(uMemory, vUv).r;

    // The frontier is a band, not a line — the eye reads a soft boundary as
    // "sensor horizon" and a hard one as a texture seam.
    float known = smoothstep(0.06, 0.62, mem);
    float alpha = mix(uUnknown, uExplored, known);

    vec3 color = uColor;

    // Unknown ground gets a slow noise crawl. Very low amplitude: it should
    // register as grain you notice only once you look for it.
    float grain = noise(vec2(vUv * 36.0 + vec2(uTime * 0.05, uTime * -0.037)));
    alpha += (1.0 - known) * (grain - 0.5) * 0.085;

    // The overlay is a square plane laid over open terrain. Ending it on a
    // hard edge draws a diamond on the landscape and announces itself as a
    // quad; fading the last of it out lets the haze dissolve into distance.
    float border = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5));
    alpha *= 1.0 - smoothstep(0.36, 0.5, border);

    // A faint lit rim exactly on the frontier, so the edge of what you know
    // is a thing you can see rather than a thing you infer.
    float edge = smoothstep(0.0, 0.22, known) * smoothstep(0.62, 0.30, known);
    float breathe = 0.80 + 0.20 * sin(uTime * 1.3 + vUv.x * 7.0);
    color = mix(color, uEdgeColor, edge * 0.55 * breathe);
    alpha -= edge * 0.10;

    // Mission-start curtain: fog lifts from full black down to its real value.
    alpha = mix(1.0, alpha, uReveal);

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export class FogOfWar {
  // `size` is the board the veil covers and `height` is the ground it lies on.
  // Both used to be fixed: a flat 30-unit quad at y = 0.01. On open terrain
  // that is wrong twice over — it stops short of what the camera can see, and
  // being flat it stands *proud of every hollow*, so the camera looks at the
  // underside of an opaque slab wherever the ground dips below a centimetre.
  // On the seabed that painted two enormous hard-edged black wedges across
  // the map, which read as missing geometry rather than as fog.
  constructor(scene, { size = GROUND_SIZE, height = null, memSize = DEFAULT_MEM } = {}) {
    this.size = size;
    this.mem = memSize;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.mem;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.mem, this.mem);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMemory: { value: this.texture },
        uTime: { value: 0 },
        // Three environments, three curtains. Daylight cannot use a black
        // one — unswept ground reads as a hole punched in the landscape —
        // and underwater it has to be the colour of the water, or the veil
        // looks like sand lying on top of the sea.
        ...(() => {
          const env = getEnvironment();
          // The veil now covers the whole visible board rather than a
          // 30-unit square, so the old opacity blacked the map out entirely.
          // Unswept seabed should read as unlit and flat — you can make out
          // the shape of the ground, the way sonar would give it to you —
          // while colour and detail stay the reward for putting a light on it.
          if (env === 'undersea') return {
            uUnknown: { value: 0.26 },
            uExplored: { value: 0.10 },
            uColor: { value: new THREE.Color(0x0a2f38) },
            uEdgeColor: { value: new THREE.Color(0x67d4dc) },
          };
          if (env === 'day') return {
            uUnknown: { value: 0.34 },
            uExplored: { value: 0.13 },
            uColor: { value: new THREE.Color(0xcfc0a6) },
            uEdgeColor: { value: new THREE.Color(0xffffff) },
          };
          return {
            uUnknown: { value: 0.78 },
            uExplored: { value: 0.46 },
            uColor: { value: new THREE.Color(0x05070a) },
            uEdgeColor: { value: new THREE.Color(0x0d2a2a) },
          };
        })(),
        uReveal: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    });

    // Drape it over the terrain rather than floating it above the origin.
    // Enough segments that the veil hugs the ripples instead of tenting over
    // them, and lifted a few centimetres so it never z-fights the sediment.
    const segs = height ? 160 : 1;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    if (height) {
      const p = geo.attributes.position;
      // Local +y maps to world -z once the plane is laid flat — the same flip
      // the terrain itself uses, and it has to match or the veil slides off
      // the hills it is meant to be covering.
      for (let i = 0; i < p.count; i++) p.setZ(i, height(p.getX(i), -p.getY(i)));
      p.needsUpdate = true;
      geo.computeVertexNormals();
    }
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    // Clear of the ripple crests when draped, hard on the deck when flat.
    this.mesh.position.y = height ? 0.12 : 0.01;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'fog';
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.acc = 0;
    this.dirty = true;
  }

  // World (x, z) -> canvas pixels. CanvasTexture uploads flipped, which lands
  // +z at increasing canvas y — so both axes read straight through.
  toPixels(x, z) {
    return [(0.5 + x / this.size) * this.mem, (0.5 + z / this.size) * this.mem];
  }

  // Stamp one unit's current cone into the memory. Wedge, not disc: a unit
  // does not learn what is behind it.
  stamp(unit) {
    const { x, z } = unit.group.position;
    const [px, py] = this.toPixels(x, z);
    const scale = unit.cone?.mesh?.scale?.x ?? 1;
    const range = (unit.baseRange ?? 8.5) * scale;
    const rPx = (range / this.size) * this.mem;
    const half = THREE.MathUtils.degToRad((unit.coneFov ?? 58) / 2);

    // heading 0 faces +z, which is +y in canvas space.
    const facing = Math.PI / 2 - unit.heading;
    const ctx = this.ctx;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, rPx, facing - half, facing + half);
    ctx.closePath();
    ctx.clip();

    const grad = ctx.createRadialGradient(px, py, 0, px, py, rPx);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.72, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillRect(px - rPx, py - rPx, rPx * 2, rPx * 2);
    ctx.restore();

    // Always know your own footing, whichever way you are pointing.
    const near = (1.9 / this.size) * this.mem;
    ctx.save();
    const g2 = ctx.createRadialGradient(px, py, 0, px, py, near);
    g2.addColorStop(0, 'rgba(255,255,255,0.9)');
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(px, py, near, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Reveal a patch regardless of who can see it — drone sweeps, breaches.
  revealAt(x, z, radius = 6) {
    const [px, py] = this.toPixels(x, z);
    const rPx = (radius / this.size) * this.mem;
    const ctx = this.ctx;
    ctx.save();
    const grad = ctx.createRadialGradient(px, py, 0, px, py, rPx);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(px, py, rPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.dirty = true;
  }

  clear() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.mem, this.mem);
    this.dirty = true;
  }

  // Mission start: hold the board black for a beat, then lift the curtain.
  lift(duration = 1.4) {
    this.material.uniforms.uReveal.value = 0;
    this.liftRate = 1 / Math.max(duration, 0.1);
  }

  update(units, dt, t) {
    this.material.uniforms.uTime.value = t;

    const rev = this.material.uniforms.uReveal;
    if (rev.value < 1 && this.liftRate) {
      rev.value = Math.min(1, rev.value + this.liftRate * dt);
    }

    // Stamping every frame would upload 64 KB 60 times a second for no visible
    // gain — the frontier moves far slower than that.
    this.acc += dt;
    if (this.acc < 1 / UPDATE_HZ) return;
    this.acc = 0;

    for (const u of units) this.stamp(u);
    this.texture.needsUpdate = true;
  }
}

export function createFogOfWar(scene, opts) {
  return new FogOfWar(scene, opts);
}
