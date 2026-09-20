import * as THREE from 'three';
import gsap from 'gsap';

// Fires, smoke and the ground they scar — the part of the board that remembers
// what happened on it.
//
// Everything else in the FX layer is an event: it flashes, it is read, it is
// gone. This is the opposite. A generator the squad put rounds into is still
// burning three turns later, and burning harder, because nobody put it out.
// That is the whole job of this file — to let the environment say "this is
// getting worse" without a line of HUD text saying it.
//
// Rules it keeps:
//
//   * Nothing ignites decoratively. Every fire is lit by a call naming a world
//     position where something actually happened.
//   * No Math.random. Embers, smoke and flicker are all seeded off an
//     incrementing counter, so a rehearsed demo plays back identically.
//   * Fixed pools. A hazard allocates its particles once and recycles them;
//     an eight-minute mission with four fires burning costs the same as one.
//
// Smoke also degrades what can be seen through it. This file reports that as a
// number (`occlusionAt`) rather than reaching into the sensor cones, which
// belong to someone else — see the note in `drone-combat-notes.md`.

// Smoke drifts one way for the whole mission. A fire whose smoke wanders looks
// like a particle system; a compound where everything leans the same way looks
// like weather.
const WIND = new THREE.Vector2(0.42, -0.26);

const MAX_LIGHTS = 3;
const SMOKE_POOL = 30;
const EMBER_POOL = 14;

// Deterministic pseudo-random in [0,1).
function rand(seed) {
  const v = Math.sin(seed * 91.7 + 43.1) * 43758.5453;
  return v - Math.floor(v);
}

// Soft round puff, drawn once and shared by every hazard in the mission.
let PUFF = null;
function puffTexture() {
  if (PUFF) return PUFF;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  PUFF = new THREE.CanvasTexture(canvas);
  PUFF.colorSpace = THREE.SRGBColorSpace;
  return PUFF;
}

// Points with a size and an alpha per particle.
//
// PointsMaterial carries one size and one opacity for the whole system, which
// cannot describe smoke: a plume is particles of different ages, and age is
// exactly size and alpha. Twenty lines of GLSL buys one draw call per plume
// instead of one per puff.
//
// The camera is orthographic, so screen size does not fall off with depth —
// `uScale` is pixels per world unit, pulled off the live projection matrix in
// onBeforeRender so it stays right through every zoom the player makes.
function particleSystem(count, { color, blending, sizeScale = 1 }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: puffTexture() },
      uColor: { value: new THREE.Color(color) },
      uScale: { value: 40 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      uniform float uScale;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uScale);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        if (vAlpha <= 0.001) discard;
        gl_FragColor = vec4(uColor, tex.a * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 14;
  points.onBeforeRender = (renderer, scene, camera) => {
    // Ortho projection: element 5 is 2/(top-bottom), so half the drawing
    // buffer height times that is pixels per world unit.
    const m = camera.projectionMatrix.elements;
    const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    material.uniforms.uScale.value = Math.max(1, (h * 0.5) * Math.abs(m[5]) * sizeScale);
  };
  return points;
}

class Hazard {
  constructor(scene, { x, z, key, intensity, growth, max, flame, follow }) {
    this.scene = scene;
    this.key = key;
    this.x = x;
    this.z = z;
    this.follow = follow || null;      // a wreck's plume rides the wreck
    this.intensity = intensity;
    this.growth = growth;
    this.max = max;
    this.hasFlame = flame;
    this.seed = Math.round((x * 31.7 + z * 17.3) * 100) + 7;
    this.clock = 0;
    this.out = false;

    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    scene.add(this.group);

    // ---- flame body: stacked additive cones, each on its own flicker phase.
    //
    // Three, not one: a wide dim base that reads as the seat of the fire at
    // tactical zoom, the body above it, and a small bright core. One cone
    // reads as a candle from the camera this game is played at.
    this.flames = [];
    if (flame) {
      // Saturated oranges, not near-white. The scene tone-maps with ACES and
      // an additive near-white core blows out to a flat pale card; keeping the
      // hot centre at a deep amber is what reads as fire through it.
      const spec = [
        [0.62, 1.4, 0xff4d0a, 0.38],
        [0.55, 2.0, 0xff8c1a, 0.75],
        [0.3, 1.25, 0xffc457, 0.85],
      ];
      for (let i = 0; i < spec.length; i++) {
        const [r, h, colour, opacity] = spec[i];
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(r, h, 9, 1, true),
          new THREE.MeshBasicMaterial({
            color: colour, transparent: true, opacity,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          })
        );
        cone.position.y = h * 0.5;
        cone.userData = { baseR: r, baseH: h, phase: i * 2.1 + rand(this.seed + i) * 3 };
        this.group.add(cone);
        this.flames.push(cone);
      }
    }

    // ---- scorch: the mark left behind, which outlives the flame.
    this.scorch = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({ color: 0x0d0f0c, transparent: true, opacity: 0.0, depthWrite: false })
    );
    this.scorch.rotation.x = -Math.PI / 2;
    this.scorch.position.y = 0.012;
    this.scorch.renderOrder = 3;
    this.group.add(this.scorch);

    // ---- particles.
    this.smoke = particleSystem(SMOKE_POOL, {
      // Warm grey rather than neutral: smoke off burning fuel and paint picks
      // up the fire under it, and a neutral grey column on a sand-coloured
      // compound reads as fog.
      color: 0x59544e, blending: THREE.NormalBlending, sizeScale: 1,
    });
    this.embers = particleSystem(EMBER_POOL, {
      color: 0xffb257, blending: THREE.AdditiveBlending, sizeScale: 0.4,
    });
    scene.add(this.smoke, this.embers);

    this.smokeParts = this.makeParts(SMOKE_POOL, 'smoke');
    this.emberParts = this.makeParts(EMBER_POOL, 'ember');
  }

  makeParts(count, kind) {
    const parts = [];
    for (let i = 0; i < count; i++) {
      const p = { kind, age: 0, life: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1 };
      // Stagger the pool's first cycle so a fire does not start with one solid
      // clump of smoke leaving the ground together.
      p.age = (i / count) * 2.6;
      p.life = 0;
      parts.push(p);
    }
    return parts;
  }

  respawn(p) {
    const s = ++this.seed;
    const spread = this.hasFlame ? 0.34 : 0.22;
    const cx = this.follow ? this.follow.position.x : this.x;
    const cz = this.follow ? this.follow.position.z : this.z;

    if (p.kind === 'smoke') {
      p.pos.set(
        cx + (rand(s) - 0.5) * spread,
        (this.hasFlame ? 0.7 : 0.5) + rand(s + 3) * 0.3,
        cz + (rand(s + 7) - 0.5) * spread
      );
      p.vel.set(
        WIND.x * (0.5 + rand(s + 11) * 0.6),
        0.75 + rand(s + 13) * 0.5 + this.intensity * 0.5,
        WIND.y * (0.5 + rand(s + 17) * 0.6)
      );
      p.life = 2.6 + rand(s + 19) * 1.8;
      p.size = 0.55 + rand(s + 23) * 0.5;
    } else {
      p.pos.set(cx + (rand(s) - 0.5) * 0.3, 0.35, cz + (rand(s + 5) - 0.5) * 0.3);
      p.vel.set((rand(s + 9) - 0.5) * 0.5, 1.6 + rand(s + 15) * 1.4, (rand(s + 21) - 0.5) * 0.5);
      p.life = 0.7 + rand(s + 27) * 0.6;
      p.size = 0.07 + rand(s + 31) * 0.06;
    }
    p.age = 0;
  }

  // One turn has passed and nobody dealt with it.
  escalate() {
    if (this.out) return;
    this.intensity = Math.min(this.max, this.intensity + this.growth);
  }

  // Put it out — for a mission that gives the player a way to.
  extinguish(duration = 2.0) {
    this.out = true;
    gsap.to(this, { intensity: 0, duration, ease: 'power2.in' });
  }

  update(dt, t) {
    this.clock += dt;
    const live = this.intensity;

    // Flames: flicker on two phases so the body never pulses as one shape.
    for (const cone of this.flames) {
      const { baseR, baseH, phase } = cone.userData;
      const flicker = 0.82 + 0.18 * Math.sin(t * 9.1 + phase) + 0.08 * Math.sin(t * 21.3 + phase * 2);
      // Fire grows mostly upward: a fire twice as big is twice as tall and
      // only half again as wide, which is what stops a big one reading as a
      // bonfire-shaped blob on the floor.
      const scale = Math.max(0.001, 0.55 + live * 0.6);
      cone.scale.set(scale * flicker, Math.max(0.001, live) * (0.85 + flicker * 0.3), scale * flicker);
      cone.position.y = baseH * 0.5 * Math.max(0.001, live) * (0.85 + flicker * 0.3);
      cone.material.opacity = Math.min(1, live * 1.2) * (baseR > 0.9 ? 0.5 : 0.85);
      cone.visible = live > 0.02;
    }

    // Scorch grows with the fire and stays once it is out.
    const scorchR = 0.9 + this.intensity * 1.5;
    this.scorch.scale.setScalar(THREE.MathUtils.lerp(this.scorch.scale.x || 1, scorchR, Math.min(1, dt * 1.5)));
    this.scorch.material.opacity = Math.min(0.42, 0.12 + this.intensity * 0.22);

    this.stepParticles(this.smokeParts, this.smoke, dt, live);
    if (this.hasFlame) this.stepParticles(this.emberParts, this.embers, dt, live);
  }

  stepParticles(parts, system, dt, live) {
    const pos = system.geometry.attributes.position.array;
    const sizes = system.geometry.attributes.aSize.array;
    const alphas = system.geometry.attributes.aAlpha.array;

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.age += dt;

      if (p.age >= p.life) {
        // A dying fire stops feeding the plume: fewer particles come back, and
        // the column thins out instead of switching off.
        const density = p.kind === 'smoke' ? live * 1.15 : live;
        if (live <= 0.02 || (i / parts.length) > density) {
          alphas[i] = 0;
          continue;
        }
        this.respawn(p);
      }

      p.vel.y -= (p.kind === 'ember' ? 2.4 : 0.06) * dt;
      p.pos.addScaledVector(p.vel, dt);

      const k = p.age / p.life;
      pos[i * 3] = p.pos.x;
      pos[i * 3 + 1] = p.pos.y;
      pos[i * 3 + 2] = p.pos.z;

      if (p.kind === 'smoke') {
        // Smoke expands as it cools and thins as it rises. It has to carry the
        // fire from across the compound — the flame itself is only a metre of
        // it — so the column is deliberately the loud part.
        sizes[i] = p.size * (0.8 + k * 2.6) * (0.9 + live * 0.6);
        alphas[i] = Math.min(1, live) * 0.72 * Math.sin(Math.min(1, k * 1.5) * Math.PI) * (1 - k * 0.2);
      } else {
        sizes[i] = p.size * (1 - k * 0.4);
        alphas[i] = Math.max(0, 1 - k) * Math.min(1, live);
      }
    }

    system.geometry.attributes.position.needsUpdate = true;
    system.geometry.attributes.aSize.needsUpdate = true;
    system.geometry.attributes.aAlpha.needsUpdate = true;
  }

  dispose() {
    gsap.killTweensOf(this);
    this.scene.remove(this.group, this.smoke, this.embers);
    for (const cone of this.flames) { cone.geometry.dispose(); cone.material.dispose(); }
    this.scorch.geometry.dispose();
    this.scorch.material.dispose();
    for (const s of [this.smoke, this.embers]) { s.geometry.dispose(); s.material.dispose(); }
  }
}

export class Hazards {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.lights = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = new THREE.PointLight(0xff9a3c, 0, 9, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.clock = 0;
  }

  // Something caught. `key` lets a later call find this fire again — igniting
  // the same key twice feeds the existing fire rather than stacking a second
  // one on the same square metre.
  ignite(x, z, { key = null, intensity = 0.5, growth = 0.22, max = 1.35, flame = true, follow = null } = {}) {
    const existing = key && this.list.find((h) => h.key === key);
    if (existing) {
      existing.out = false;
      existing.intensity = Math.min(existing.max, Math.max(existing.intensity, intensity) + 0.15);
      return existing;
    }
    const hazard = new Hazard(this.scene, { x, z, key, intensity, growth, max, flame, follow });
    this.list.push(hazard);
    return hazard;
  }

  // Smoke with no fire under it: a wrecked vehicle, a shorted panel. Follows
  // its object if given one, so a wreck that settles takes its plume with it.
  plume(at, { key = null, intensity = 0.55, follow = null, growth = 0 } = {}) {
    return this.ignite(at.x, at.z, { key, intensity, growth, max: 1, flame: false, follow });
  }

  // Called once per turn. Every fire still burning gets worse.
  escalate() {
    for (const h of this.list) h.escalate();
    return this.list.length;
  }

  extinguish(key, duration = 2.0) {
    const h = this.list.find((x) => x.key === key);
    h?.extinguish(duration);
    return !!h;
  }

  // How much smoke sits over a point, 0..1.
  //
  // Nothing in this build consumes it yet: the sensor cones belong to another
  // system and quietly shrinking someone else's cone from in here is how two
  // systems end up disagreeing about what the player can see. It is exported
  // so that when the cone owner wants smoke to blind a sensor, the number is
  // already here and already agrees with what is on screen.
  occlusionAt(x, z) {
    let worst = 0;
    for (const h of this.list) {
      const cx = h.follow ? h.follow.position.x : h.x;
      const cz = h.follow ? h.follow.position.z : h.z;
      const d = Math.hypot(x - cx, z - cz);
      const reach = 1.6 + h.intensity * 2.6;
      if (d > reach) continue;
      worst = Math.max(worst, (1 - d / reach) * Math.min(1, h.intensity));
    }
    return worst;
  }

  get burning() { return this.list.filter((h) => h.intensity > 0.05).length; }

  clear() {
    for (const h of this.list) h.dispose();
    this.list.length = 0;
    for (const l of this.lights) { gsap.killTweensOf(l); l.intensity = 0; }
  }

  update(dt, t) {
    this.clock += dt;
    for (const h of this.list) h.update(dt, t);

    // Light the three biggest fires and let the rest burn unlit. A fire is a
    // light source on a dark compound; four of them fighting for the same
    // three lights would flicker as they swapped, so the order is stable.
    const lit = this.list
      .filter((h) => h.hasFlame && h.intensity > 0.05)
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, MAX_LIGHTS);

    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const h = lit[i];
      if (!h) { light.intensity = 0; continue; }
      const flicker = 0.78 + 0.22 * Math.sin(t * 11.3 + i * 2.2) + 0.1 * Math.sin(t * 27.1 + i);
      light.position.set(h.x, 0.9 + h.intensity * 0.4, h.z);
      light.intensity = h.intensity * 9 * flicker;
      light.distance = 5 + h.intensity * 5;
    }
  }
}
