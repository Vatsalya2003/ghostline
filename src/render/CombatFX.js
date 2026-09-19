import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';

// Gunfire, grenades, explosions and impacts — as things that happen at a
// place on the board.
//
// The mission already had all of this in its prose and its audio: rounds into
// a generator, a frag into an unverified room, two shooters in BETA-1's blind
// arc. None of it was visible. The player heard an impact and watched a number
// in the HUD change, and had to take the game's word for where it happened.
//
// Everything here is positional. A muzzle flash is at the muzzle of the unit
// that fired, a tracer runs from that unit to what it shot at, the grenade
// leaves the thrower's hand and lands where it detonates. If you cannot say
// which two world positions an effect connects, it does not belong in this
// file.
//
// Budget: effects are short-lived and pooled by geometry. Tracers, sparks and
// debris all draw from shared geometry and allocate their own material only
// (needed — each fades independently). Nothing here survives longer than about
// two seconds, so the live count stays in the low tens even on the loudest
// beat in the mission.

const SHARED = {
  // Unit-length tracer with its base on the origin, so scaling Y extends it
  // forward out of the muzzle instead of outward from its own centre.
  tracer: new THREE.CylinderGeometry(0.035, 0.012, 1, 5).translate(0, 0.5, 0),
  spark: new THREE.SphereGeometry(0.05, 4, 3),
  debris: new THREE.TetrahedronGeometry(0.11),
  flash: new THREE.SphereGeometry(0.22, 8, 6),
  shell: new THREE.SphereGeometry(0.5, 12, 10),
  ring: new THREE.RingGeometry(0.42, 0.5, 40),
};

// Deterministic pseudo-random. The demo is rehearsed and every playthrough has
// to come up identical, so nothing in this file calls Math.random.
function rand(seed) {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function additive(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

// Height the squad's weapons sit at, in world units. The walker's gun is on
// its shoulder line, a little over half its height.
const MUZZLE_Y = 1.15;
const CHEST_Y = 0.95;

// How many muzzle flashes and blasts can be lit at once. Four covers the
// loudest beat in the mission — three units firing plus a detonation.
const LIGHT_POOL = 4;

export class CombatFX {
  constructor(scene) {
    this.scene = scene;
    this.live = [];          // { obj, mats, until } — swept in update()
    this.clock = 0;
    this.seed = 0;

    // Pooled lights, added once and never removed.
    //
    // This is not a micro-optimisation. Three keys its shader programs partly
    // on the number of lights in the scene, so adding a PointLight for a
    // muzzle flash and removing it again changes that count twice and can cost
    // a program recompile across every material on screen — a visible hitch,
    // on the exact frame something just exploded. Holding a fixed pool at zero
    // intensity keeps the count constant for the whole mission.
    this.lights = [];
    this.nextLight = 0;
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 6, 2);
      l.castShadow = false;
      l.visible = true;
      scene.add(l);
      this.lights.push(l);
    }
  }

  // Borrow a light, place it, and let it decay. Round-robin: if more flashes
  // fire than the pool holds, the oldest is re-aimed rather than dropped.
  flashLight(at, { color = 0xffd48a, intensity = 9, distance = 4.5, fade = 0.15 } = {}) {
    const light = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % this.lights.length;
    gsap.killTweensOf(light);
    light.color.set(color);
    light.distance = distance;
    light.position.copy(at);
    light.intensity = intensity;
    gsap.to(light, { intensity: 0, duration: fade, ease: 'power2.in' });
    return light;
  }

  // Register a throwaway object so update() can bin it on schedule, whatever
  // tween is driving its look.
  track(obj, life, mats = []) {
    this.scene.add(obj);
    this.live.push({ obj, mats, until: this.clock + life });
    return obj;
  }

  // ------------------------------------------------------------- gunfire
  //
  // One burst: flash at the muzzle, a handful of tracers down the line of
  // fire, sparks where they land. `from` and `to` are world {x, z}.
  gunfire(from, to, { rounds = 5, color = 0xffd48a, spread = 0.5 } = {}) {
    const a = new THREE.Vector3(from.x, MUZZLE_Y, from.z);
    const b = new THREE.Vector3(to.x, CHEST_Y, to.z);
    const dir = new THREE.Vector3().subVectors(b, a);
    const range = dir.length();
    if (range < 1e-3) return;
    dir.normalize();

    this.muzzleFlash(a, dir, color);

    // Tracers are stretched quads along the line of fire rather than modelled
    // rounds: at this camera a 9mm-sized sphere is sub-pixel, and a streak is
    // what reads as "shots went that way" anyway.
    for (let i = 0; i < rounds; i++) {
      const s = ++this.seed;
      const jitterX = (rand(s) - 0.5) * spread;
      const jitterZ = (rand(s + 41) - 0.5) * spread;
      const end = b.clone().add(new THREE.Vector3(jitterX, (rand(s + 7) - 0.5) * 0.3, jitterZ));

      // Deliberately fatter than a real round. At the tactical camera a
      // to-scale tracer is a couple of pixels and reads as dirt on the screen;
      // this is sized to be legible as a line of fire from where the player
      // actually sits.
      //
      // The geometry is shifted so its base sits on the mesh origin. Scaling a
      // centred cylinder grows it from its middle, which reads as a streak
      // appearing in mid-air; this way it leaves the muzzle.
      const tracer = new THREE.Mesh(SHARED.tracer, additive(color, 0.85));
      const length = a.distanceTo(end);
      tracer.position.copy(a);
      tracer.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().subVectors(end, a).normalize()
      );
      tracer.scale.set(1, 0.001, 1);
      this.track(tracer, 0.95, [tracer.material]);

      const delay = i * 0.07;
      const travel = 0.14;
      // Grow, hold, then fade. The hold matters: without it the whole streak
      // lives inside half a second, and on a frame that runs long the tracer
      // can go from nothing to gone between two ticks and never be drawn at
      // full length at all.
      const hold = 0.12;
      gsap.to(tracer.scale, { y: length, duration: travel, delay, ease: 'none' });
      gsap.to(tracer.material, {
        opacity: 0, duration: 0.32, delay: delay + travel + hold, ease: 'power2.in',
      });

      // Sparks where it lands.
      gsap.delayedCall(delay + travel, () => this.sparks(end, { count: 4, color, spread: 0.7 }));
    }
  }

  muzzleFlash(at, dir, color = 0xffd48a) {
    const flash = new THREE.Mesh(SHARED.flash, additive(color, 1));
    flash.position.copy(at).add(dir.clone().multiplyScalar(0.34));
    flash.scale.setScalar(0.6);
    this.track(flash, 0.16, [flash.material]);
    gsap.to(flash.scale, { x: 1.5, y: 0.9, z: 1.5, duration: 0.1, ease: 'power2.out' });
    gsap.to(flash.material, { opacity: 0, duration: 0.12, ease: 'power2.in' });

    // A one-frame lick of light, off the pool. It is what makes a shot feel
    // like it lit the wall it was fired past.
    this.flashLight(flash.position, { color, intensity: 9, distance: 4.5, fade: 0.15 });
  }

  // ------------------------------------------------------------ grenades
  //
  // Leaves the thrower, arcs, lands, detonates. The arc is the point: the
  // player should be able to watch it go and know where it is going to land
  // before it does.
  grenade(from, to, { fuse = 0.85, onDetonate = null } = {}) {
    const a = new THREE.Vector3(from.x, MUZZLE_Y, from.z);
    const b = new THREE.Vector3(to.x, 0.12, to.z);

    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.11, 0),
      new THREE.MeshStandardMaterial({
        color: 0x2f3a33, emissive: 0x8fe6c0, emissiveIntensity: 0.5,
        roughness: 0.6, flatShading: true,
      })
    );
    body.position.copy(a);
    body.castShadow = true;
    this.track(body, fuse + 0.05, [body.material]);

    // A blinking tail so the eye can follow it against a dark compound.
    const tail = new THREE.Mesh(SHARED.spark, additive(0x8fe6c0, 0.85));
    tail.position.copy(a);
    this.track(tail, fuse + 0.05, [tail.material]);

    const apex = Math.max(1.6, a.distanceTo(b) * 0.42);
    const t = { p: 0 };
    gsap.to(t, {
      p: 1, duration: fuse, ease: 'none',
      onUpdate: () => {
        const k = t.p;
        body.position.lerpVectors(a, b, k);
        // Parabola on top of the straight line — real throw, not a slide.
        body.position.y = a.y + (b.y - a.y) * k + apex * 4 * k * (1 - k);
        body.rotation.x += 0.22;
        body.rotation.z += 0.17;
        tail.position.copy(body.position);
        tail.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(k * 26));
      },
      onComplete: () => {
        this.explosion(b, { radius: 2.4, color: 0xffb257 });
        if (onDetonate) onDetonate();
      },
    });
  }

  // ---------------------------------------------------------- explosions
  //
  // Flash, then an expanding shell that cools from white through amber to
  // smoke, a ground ring, debris and sparks. Kept short and kept low: this is
  // a tactical display and an explosion that whites out the board costs the
  // player the information they are meant to be reading.
  explosion(at, { radius = 3, color = 0xffb257, debris = 9 } = {}) {
    const p = at.isVector3 ? at.clone() : new THREE.Vector3(at.x, at.y ?? 0.3, at.z);

    // 1. Flash — one frame of white, before any shape resolves.
    const flash = new THREE.Mesh(SHARED.flash, additive(0xfff3d6, 1));
    flash.position.copy(p);
    flash.scale.setScalar(radius * 0.5);
    this.track(flash, 0.2, [flash.material]);
    gsap.to(flash.scale, { x: radius, y: radius, z: radius, duration: 0.14, ease: 'power3.out' });
    gsap.to(flash.material, { opacity: 0, duration: 0.18, ease: 'power2.in' });

    // 2. Fireball — cools as it grows, and goes translucent rather than
    //    vanishing, so it reads as smoke on the way out.
    const shellMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xfff0cc), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const shell = new THREE.Mesh(SHARED.shell, shellMat);
    shell.position.copy(p);
    shell.scale.setScalar(0.35);
    this.track(shell, 0.95, [shellMat]);
    gsap.to(shell.scale, { x: radius * 0.9, y: radius * 0.75, z: radius * 0.9, duration: 0.55, ease: 'power2.out' });
    gsap.to(shell.position, { y: p.y + radius * 0.35, duration: 0.9, ease: 'power1.out' });
    gsap.to(shellMat.color, { r: 1, g: 0.42, b: 0.12, duration: 0.3 });
    gsap.to(shellMat, { opacity: 0, duration: 0.7, delay: 0.2, ease: 'power2.in' });

    // 3. Ground shock ring.
    const ring = new THREE.Mesh(SHARED.ring, additive(color, 0.85));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.05, p.z);
    ring.renderOrder = 12;
    ring.scale.setScalar(0.3);
    this.track(ring, 0.8, [ring.material]);
    gsap.to(ring.scale, { x: radius * 1.6, y: radius * 1.6, z: radius * 1.6, duration: 0.7, ease: 'power2.out' });
    gsap.to(ring.material, { opacity: 0, duration: 0.7, ease: 'power1.in' });

    // 4. Light, off the pool, dying with the fireball.
    this.flashLight(p.clone().setY(p.y + 0.4),
      { color, intensity: 26, distance: radius * 4, fade: 0.6 });

    this.debris(p, { count: debris, spread: radius * 0.75 });
    this.sparks(p, { count: 10, color: 0xffd9a0, spread: radius * 0.5 });
  }

  // Thrown chunks with a bounce. Deterministic fan, not a random spray.
  debris(at, { count = 8, spread = 2 } = {}) {
    for (let i = 0; i < count; i++) {
      const s = ++this.seed;
      const a = (i / count) * Math.PI * 2 + rand(s) * 0.6;
      const speed = spread * (0.55 + rand(s + 13) * 0.6);

      const chunk = new THREE.Mesh(SHARED.debris, new THREE.MeshStandardMaterial({
        color: 0x2a322e, roughness: 0.95, flatShading: true,
      }));
      chunk.position.copy(at);
      chunk.castShadow = true;
      this.track(chunk, 1.3, [chunk.material]);

      const tx = at.x + Math.sin(a) * speed;
      const tz = at.z + Math.cos(a) * speed;
      const peak = 0.8 + rand(s + 29) * 1.1;

      const t = { p: 0 };
      gsap.to(t, {
        p: 1, duration: 1.1, ease: 'none',
        onUpdate: () => {
          const k = t.p;
          chunk.position.x = at.x + (tx - at.x) * k;
          chunk.position.z = at.z + (tz - at.z) * k;
          chunk.position.y = Math.max(0.06, at.y + peak * 4 * k * (1 - k));
          chunk.rotation.x += 0.16;
          chunk.rotation.y += 0.11;
        },
      });
      gsap.to(chunk.material, { opacity: 0, transparent: true, duration: 0.3, delay: 0.95 });
    }
  }

  // Small hot points. Used on bullet strikes and inside explosions.
  sparks(at, { count = 6, color = 0xffd48a, spread = 0.9 } = {}) {
    const origin = at.isVector3 ? at : new THREE.Vector3(at.x, at.y ?? 0.4, at.z);
    for (let i = 0; i < count; i++) {
      const s = ++this.seed;
      const a = (i / count) * Math.PI * 2 + rand(s) * 0.9;
      const speed = spread * (0.4 + rand(s + 17) * 0.8);

      const spark = new THREE.Mesh(SHARED.spark, additive(color, 1));
      spark.position.copy(origin);
      this.track(spark, 0.45, [spark.material]);

      gsap.to(spark.position, {
        x: origin.x + Math.sin(a) * speed,
        z: origin.z + Math.cos(a) * speed,
        y: Math.max(0.05, origin.y + 0.35 + rand(s + 23) * 0.4),
        duration: 0.35, ease: 'power2.out',
      });
      gsap.to(spark.material, { opacity: 0, duration: 0.3, delay: 0.1 });
      gsap.to(spark.scale, { x: 0.3, y: 0.3, z: 0.3, duration: 0.35 });
    }
  }

  // A unit taking a hit: sparks off the chassis and a short smoke puff. The
  // chassis flash and the bounce stay in FX.hitFlash, which already owns the
  // unit's own materials.
  unitHit(at, { color = PALETTE.red } = {}) {
    const p = new THREE.Vector3(at.x, CHEST_Y, at.z);
    this.sparks(p, { count: 8, color: 0xffcf9a, spread: 1.1 });

    const puff = new THREE.Mesh(SHARED.shell, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    puff.position.copy(p);
    puff.scale.setScalar(0.3);
    this.track(puff, 0.6, [puff.material]);
    gsap.to(puff.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.45, ease: 'power2.out' });
    gsap.to(puff.material, { opacity: 0, duration: 0.45, ease: 'power1.in' });
  }

  // Everything this system has put in the scene, gone. Called on restart.
  clear() {
    for (const item of this.live) {
      gsap.killTweensOf(item.obj);
      gsap.killTweensOf(item.obj.position);
      gsap.killTweensOf(item.obj.scale);
      for (const m of item.mats) { gsap.killTweensOf(m); m.dispose(); }
      this.scene.remove(item.obj);
    }
    this.live.length = 0;
    for (const l of this.lights) { gsap.killTweensOf(l); l.intensity = 0; }
  }

  update(dt) {
    this.clock += dt;
    // Sweep from the back so splicing does not skip the next entry.
    for (let i = this.live.length - 1; i >= 0; i--) {
      const item = this.live[i];
      if (this.clock < item.until) continue;
      this.scene.remove(item.obj);
      for (const m of item.mats) m.dispose();
      // Geometry is shared and must outlive the instance; only the one-off
      // tracer/grenade/debris geometries are the instance's own to free.
      if (item.obj.geometry && !Object.values(SHARED).includes(item.obj.geometry)) {
        item.obj.geometry.dispose();
      }
      this.live.splice(i, 1);
    }
  }
}
