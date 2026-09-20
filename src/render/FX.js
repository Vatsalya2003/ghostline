import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';
import { Drone } from './Drone.js';
import { CombatFX } from './CombatFX.js';
import { Hazards } from './Hazards.js';
import { ReconMarker } from './ReconSites.js';
import { playVehicleLoss, restoreVehicle, markCritical } from './VehicleLoss.js';
import { spawnModel, preload } from './AssetLoader.js';

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
    // What the board remembers: fires that grow turn on turn, the smoke off
    // them, and the scars they leave. Everything above is an event; this is
    // state.
    this.hazards = new Hazards(scene);
    // Where the next sortie is going, painted before it leaves.
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
  // separately: `read` is when the aircraft has finished looking and its
  // findings are allowed to land, `home` is when it is back on the deck. The
  // turn waits for the first and lets the flight home play out underneath it.
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

  // The sortie's findings have landed. Marks the ground as read.
  reconResult(caption = null) { this.recon.complete({ linger: 2.6, caption }); }

  // ---- combat, forwarded so callers only need the one fx handle ----------
  gunfire(from, to, opts) { this.combat.gunfire(from, to, opts); }
  grenade(from, to, opts) { return this.combat.grenade(from, to, opts); }
  explosion(at, opts) { this.combat.explosion(at, opts); }
  unitHit(at, opts) { this.combat.unitHit(at, opts); }

  // ---- the world reacting, same one handle -------------------------------
  //
  // A fire is lit by something that happened at a place: rounds into a
  // generator, a charge on a door, ordnance in a room. Never decoratively.
  ignite(x, z, opts) { return this.hazards.ignite(x, z, opts); }
  escalateHazards() { return this.hazards.escalate(); }

  // A vehicle going down, as a sequence the player can watch. Returns a
  // promise that settles once the wreck has come to rest.
  vehicleLoss(unit, opts = {}) {
    return playVehicleLoss(unit, { hazards: this.hazards, combat: this.combat, ...opts });
  }

  // Hurt but still in the fight: it smokes from here on.
  markCritical(unit) { return markCritical(unit, { hazards: this.hazards, combat: this.combat }); }

  restoreVehicle(unit) { restoreVehicle(unit); }

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

  // Called on mission restart alongside clearHostiles. Everything this layer
  // has put in the world goes with it — a replay must not start with last
  // run's fires still burning or its recon marker still on the ground.
  resetDrone() {
    this.drone.reset();
    this.combat.clear();
    this.hazards.clear();
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
    this.hazards.update(dt, this.clock);
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
