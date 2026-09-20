import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';
import { Drone } from './Drone.js';
import { CombatFX } from './CombatFX.js';
import { ReconMarker } from './ReconSites.js';
import { spawnModel, preload } from './AssetLoader.js';
import { groundAt } from './Units.js';

// Impacts, drone scans, hostile markers. Deterministic — every burst uses a
// fixed pattern so the demo plays back the same way every time.
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.hostiles = [];
    this.drone = new Drone(scene);
    // Gunfire, grenades, explosions and strike sparks. Kept in its own system
    // because all of it is positional and none of it is about a unit's own
    // materials, which is what the methods below deal in.
    this.combat = new CombatFX(scene);
    // Where the next sortie is going, painted on the ground before it leaves.
    this.recon = new ReconMarker(scene);
    // Hostiles are not revealed until the ambush, five turns in. Fetching a
    // 695 KB rig at that exact moment would stall the beat the mission turns
    // on, so it is warmed now while the title card is still up.
    preload(['hostile-heavy']);
    // FX.update takes only dt, so elapsed time for the drone's hover and
    // rotor phase is accumulated here rather than threaded through main.js.
    this.clock = 0;
  }

  // A recon sortie. `to` is a resolved place from Level.PLACES — it carries a
  // hover height and a key naming the ground, so turn 2's outbuilding run and
  // turn 4's divider run are visibly different flights.
  //
  // `onArrive` fires when the drone is actually on station and looking down,
  // not when the order is given: that is the moment the sweep's consequences
  // (fog lifting, contacts painting) should land, so what the player sees is
  // caused by the aircraft rather than coincident with it.
  // Returns both halves of the sortie, because the turn cares about them
  // separately: `read` settles when the aircraft has finished looking and its
  // findings are allowed to land, `home` when it is back on the deck. A report
  // that arrives while the drone is still on the pad is not a report, and it
  // was the reason the one tool the player has for buying certainty read as
  // decoration.
  droneSweep(from, to, { color = PALETTE.cyan, radius = 7, onArrive = null, tasking = '' } = {}) {
    this.drone.setColor(color);
    this.recon.task(to, tasking);

    let settle = null;
    const read = new Promise((resolve) => { settle = resolve; });

    const home = this.drone.sweep(from, to, {
      // On station: the ground lights up and the marker says it is being read.
      onScan: () => {
        this.recon.setState('scanning');
        this.ring(to.x, to.z, { color, radius, duration: 1.1 });
        if (onArrive) onArrive(to);
      },
      // Finished reading: only now is there anything to report.
      onRead: () => settle(to),
    });
    // A sortie killed by a restart never reaches either callback. Settling on
    // the way home as well means nothing can be left awaiting an aircraft that
    // no longer exists.
    home.then(() => settle(null));

    return { read, home };
  }

  // A sensor sweep laid over ground rather than flown to it. THERMAL_SWEEP
  // and ACOUSTIC are taken from outside a closed door — nothing leaves the
  // squad, so the read has to be legible as a wash over the room itself
  // rather than as an aircraft going somewhere. Three parts, all deterministic:
  // a warm panel the size of the room, a bar that travels the length of it,
  // and a bloom wherever the sweep found a body.
  //
  // `area` is a footprint in world space: { minX, maxX, minZ, maxZ }.
  areaSweep(area, { color = 0xff9a4d, duration = 2.0, blooms = [] } = {}) {
    const minX = Math.min(area.minX, area.maxX);
    const maxX = Math.max(area.minX, area.maxX);
    const minZ = Math.min(area.minZ, area.maxZ);
    const maxZ = Math.max(area.minZ, area.maxZ);
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    // Sample the real floor. The depot's rooms sit at three different heights
    // and a sweep pinned to y=0 draws itself through the ammo room's ceiling.
    const y = groundAt(cx, cz) + 0.09;

    const group = new THREE.Group();
    group.renderOrder = 13;
    this.scene.add(group);

    // The wash. Flat-laid, so the plane's local +y runs along world -z.
    const wash = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    wash.rotation.x = -Math.PI / 2;
    wash.position.set(cx, y, cz);
    wash.renderOrder = 13;
    group.add(wash);

    // The footprint's edge, so the player can see exactly what was swept and
    // what was not.
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)),
      new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(cx, y + 0.01, cz);
    group.add(edge);

    // The travelling bar. Starts at the near edge and crosses the room once.
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(w, Math.max(0.35, d * 0.06)),
      new THREE.MeshBasicMaterial({
        color: 0xfff0d0, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(cx, y + 0.03, maxZ);
    group.add(bar);

    gsap.to(wash.material, { opacity: 0.30, duration: duration * 0.3, ease: 'power2.out' });
    gsap.to(edge.material, { opacity: 0.85, duration: duration * 0.25, ease: 'power2.out' });
    gsap.to(bar.position, { z: minZ, duration: duration * 0.72, ease: 'none' });

    // Heat blooms, dropped as the bar reaches each one so the sweep looks like
    // it is finding them rather than announcing them all at once.
    for (const [bx, bz] of blooms) {
      const t = d > 0 ? ((maxZ - bz) / d) * (duration * 0.72) : 0;
      gsap.delayedCall(Math.max(0, t), () => {
        this.ring(bx, bz, { color, radius: 2.4, duration: 0.9 });
        this.burst(bx, bz, { color, count: 10, spread: 0.5, life: 0.7 });
      });
    }

    gsap.to([wash.material, edge.material, bar.material], {
      opacity: 0, duration: duration * 0.35, delay: duration * 0.65, ease: 'power1.in',
      onComplete: () => {
        this.scene.remove(group);
        group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
      },
    });
  }

  // The sortie's findings have landed. Marks the ground as read.
  reconResult(caption = null) { this.recon.complete({ linger: 2.6, caption }); }

  // ---- combat, forwarded so callers only need the one fx handle ----------
  gunfire(from, to, opts) { this.combat.gunfire(from, to, opts); }
  grenade(from, to, opts) { return this.combat.grenade(from, to, opts); }
  explosion(at, opts) { this.combat.explosion(at, opts); }
  unitHit(at, opts) { this.combat.unitHit(at, opts); }

  burst(x, z, { color = PALETTE.red, count = 22, spread = 2.2, life = 0.75 } = {}) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const speed = spread * (0.45 + ((i * 37) % 11) / 18);
      pos[i * 3] = x; pos[i * 3 + 1] = 0.6; pos[i * 3 + 2] = z;
      vel.push(new THREE.Vector3(Math.sin(a) * speed, 1.4 + ((i * 13) % 7) / 6, Math.cos(a) * speed));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size: 0.18, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(points);
    this.active.push({ points, vel, age: 0, life });
  }

  // Expanding ring — drone sweep, breach shock, relay pulse.
  ring(x, z, { color = PALETTE.cyan, radius = 6, duration = 0.9 } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.45, 64),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    mesh.renderOrder = 12;
    this.scene.add(mesh);
    gsap.to(mesh.scale, { x: radius, y: radius, z: radius, duration, ease: 'power2.out' });
    gsap.to(mesh.material, {
      opacity: 0, duration, ease: 'power1.in',
      onComplete: () => { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); },
    });
  }

  hitFlash(unit) {
    const parts = unit.group.userData.tintParts;
    for (const p of parts) {
      const from = p.material.emissiveIntensity;
      gsap.fromTo(p.material, { emissiveIntensity: 5 }, { emissiveIntensity: from, duration: 0.6 });
    }
    gsap.fromTo(unit.group.position, { y: 0.25 }, { y: 0, duration: 0.5, ease: 'bounce.out' });
    this.burst(unit.position.x, unit.position.z);
  }

  // Hostile contacts. A heavier CC0 walker than the squad's, tinted red — the
  // silhouette does the work at tactical zoom, the colour only confirms it.
  // Each contact also keeps its rotating ground marker, which is what makes it
  // legible once the fog closes back over it.
  revealHostiles(positions) {
    for (const [x, z] of positions) {
      const g = new THREE.Group();

      const { group: model, ready } = spawnModel('hostile-heavy', {
        height: 1.55,
        skinned: true,
        isolate: ['Eye'],
        overrides: {
          Main: 'paintRed', Main2: 'rustDark', Edge: 'steelDark',
          Dark: 'rubber', Grey: 'steelDark', LightGrey: 'steel',
          Orange: 'rust', LightGreen: 'paintGreen',
        },
      });
      g.add(model);

      // The isolated eye material defaults to the squad's cyan. Left alone it
      // blows out white under ACES and a hostile reads like a friendly, so it
      // is repainted the moment the model lands.
      ready.then((res) => {
        const eye = res?.tinted?.Eye;
        if (!eye) return;
        eye.color.set(PALETTE.red);
        eye.emissive.set(PALETTE.red);
        eye.emissiveIntensity = 1.7;
      });

      // Low emissive core under the model, so a contact still reads as a hot
      // shape if its file never arrives.
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.34, 0.34),
        new THREE.MeshStandardMaterial({
          color: PALETTE.red, emissive: PALETTE.red, emissiveIntensity: 0.8, flatShading: true,
        })
      );
      body.position.y = 0.65;
      body.castShadow = true;
      g.add(body);
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.7, 4),
        new THREE.MeshBasicMaterial({
          color: PALETTE.red, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = 0.05;
      g.add(marker);
      g.position.set(x, 0, z);
      g.scale.setScalar(0.01);
      this.scene.add(g);
      gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2)' });
      gsap.to(marker.rotation, { z: Math.PI * 2, duration: 6, repeat: -1, ease: 'none' });
      this.hostiles.push(g);
      this.ring(x, z, { color: PALETTE.red, radius: 3, duration: 0.7 });
    }
  }

  // Called on mission restart alongside clearHostiles.
  resetDrone() {
    this.drone.reset();
    this.combat.clear();
    this.recon.clear();
  }

  clearHostiles() {
    for (const h of this.hostiles) {
      this.scene.remove(h);
      // Replay re-reveals the same contacts; without this each run leaves a
      // full walker's geometry behind on the GPU.
      h.traverse((o) => {
        if (!o.isMesh && !o.isSkinnedMesh) return;
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m && !m.name?.startsWith('surface:')) m.dispose();
      });
    }
    this.hostiles = [];
  }

  update(dt) {
    this.clock += dt;
    this.drone.update(dt, this.clock);
    this.combat.update(dt);
    this.recon.update(dt, this.clock);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      const arr = p.points.geometry.attributes.position.array;
      for (let j = 0; j < p.vel.length; j++) {
        p.vel[j].y -= 4.2 * dt;
        arr[j * 3] += p.vel[j].x * dt;
        arr[j * 3 + 1] = Math.max(0.05, arr[j * 3 + 1] + p.vel[j].y * dt);
        arr[j * 3 + 2] += p.vel[j].z * dt;
      }
      p.points.geometry.attributes.position.needsUpdate = true;
      p.points.material.opacity = Math.max(0, 1 - p.age / p.life);
      if (p.age >= p.life) {
        this.scene.remove(p.points);
        p.points.geometry.dispose();
        p.points.material.dispose();
        this.active.splice(i, 1);
      }
    }
  }
}
