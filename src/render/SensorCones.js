import * as THREE from 'three';
import { LIGHT_MODE } from './Scene.js';

// The signature visual. Flat wedge meshes on the ground with additive
// blending — deliberately NOT SpotLights (no shadow maps, no tuning, and it
// stays predictable for a rehearsed demo).

const CONE_Y = 0.02;

// Sector fan. uv.x = normalised radius (0 apex, 1 rim), uv.y = normalised
// angle across the wedge. The shader does the rest.
function wedgeGeometry(radius, angleDeg, radialSegs = 24, angularSegs = 64) {
  const angle = THREE.MathUtils.degToRad(angleDeg);
  const geo = new THREE.BufferGeometry();
  const pos = [];
  const uv = [];
  const idx = [];

  for (let i = 0; i <= radialSegs; i++) {
    const r = (i / radialSegs) * radius;
    for (let j = 0; j <= angularSegs; j++) {
      const t = j / angularSegs;
      const a = -angle / 2 + t * angle;
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      uv.push(i / radialSegs, t);
    }
  }

  const stride = angularSegs + 1;
  for (let i = 0; i < radialSegs; i++) {
    for (let j = 0; j < angularSegs; j++) {
      const a = i * stride + j;
      idx.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3  uColor;
  uniform float uTime;
  uniform float uDegraded;   // 0 = clean, 1 = fully broken
  uniform float uOpacity;
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
    float r = vUv.x;            // 0 at the unit, 1 at the rim
    float a = vUv.y;            // 0..1 across the wedge

    // --- shared shape -------------------------------------------------
    // Bright near the unit, falling off toward the rim; crisp side edges.
    float radial = smoothstep(1.0, 0.5, r) * 0.42 + 0.14;
    float edges  = smoothstep(0.0, 0.035, a) * smoothstep(1.0, 0.965, a);
    float rimGlow = smoothstep(0.86, 0.995, r) * smoothstep(1.0, 0.985, r) * 1.6;

    // Slow outward scan pulse — reads as "actively sensing".
    float pulse = 0.12 * smoothstep(0.35, 0.0, abs(fract(uTime * 0.22) - r));

    float alpha = (radial + rimGlow + pulse) * edges;
    vec3  color = uColor;

    // --- degradation ---------------------------------------------------
    if (uDegraded > 0.0) {
      // Jagged, chewed-up rim: the usable range varies along the wedge and
      // keeps shifting, so the cone never settles into a clean shape.
      float rim = 0.72 + 0.26 * noise(vec2(a * 9.0, uTime * 1.3));
      alpha *= smoothstep(rim, rim - 0.16, r);

      // Whole angular bands drop out and come back — broken edges.
      float band = floor(a * 11.0);
      float drop = step(0.22, hash(vec2(band, floor(uTime * 5.0))));
      alpha *= mix(1.0, drop, uDegraded);

      // Dense static across the surface.
      float static_ = noise(vec2(a * 70.0, r * 70.0 - uTime * 9.0));
      float speckle = noise(vec2(a * 240.0 + uTime * 30.0, r * 180.0));
      alpha *= mix(1.0, 0.35 + 0.95 * static_, uDegraded * 0.8);
      alpha += uDegraded * 0.18 * step(0.93, speckle) * edges;

      // Global flicker — the panel-light stutter that reads from across a room.
      float flicker = 0.45 + 0.55 * noise(vec2(uTime * 7.0, 3.7));
      flicker *= (hash(vec2(floor(uTime * 13.0), 1.0)) > 0.06) ? 1.0 : 0.15;
      alpha *= mix(1.0, flicker, uDegraded);

      // Hot amber flashes in the static.
      color = mix(color, vec3(1.0, 0.86, 0.6), uDegraded * 0.35 * static_);
    }

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * uOpacity);
  }
`;

export class SensorCone {
  constructor({
    color = 0x4ce0d8,
    range = 9,
    fov = 70,
    degraded = 0,
    opacity = 0.62,
  } = {}) {
    this.baseRange = range;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: { value: 0 },
        uDegraded: { value: degraded },
        uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      // Additive can only brighten, so it vanishes on a light ground.
      // Normal blending paints the wedge on instead; multiply was tried and
      // barely darkened a light cyan against a near-white floor.
      blending: LIGHT_MODE ? THREE.NormalBlending : THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(wedgeGeometry(range, fov), this.material);
    this.mesh.position.y = CONE_Y;
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
  }

  // Follow a unit: cones move and rotate with whatever they are attached to.
  attachTo(object3D) {
    this.follow = object3D;
    return this;
  }

  set degraded(v) { this.material.uniforms.uDegraded.value = v; }
  get degraded() { return this.material.uniforms.uDegraded.value; }

  setHeading(radians) { this.mesh.rotation.y = radians; }

  update(t) {
    this.material.uniforms.uTime.value = t;
    if (this.follow) {
      this.mesh.position.x = this.follow.position.x;
      this.mesh.position.z = this.follow.position.z;
    }
  }

  addTo(scene) { scene.add(this.mesh); return this; }
}
