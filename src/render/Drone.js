import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';
import { surfaceMaterial } from './Materials.js';

// The recon drone. SEND_DRONE is the player's one way to buy certainty in a
// game about trusting a machine, and until now it was a sound and an expanding
// ring — nothing ever left the ground.
//
// Built in code rather than loaded. The CC0 kits behind the rest of this scene
// have no quadcopter; their nearest flying asset is a gold pod with arms, which
// is 290 KB and reads as a cartoon enemy, not as reconnaissance equipment. A
// quadcopter is booms, rotors, a body and a gimbal — geometry that is quicker
// to author than to search for, lands at ~4 KB, and lets the rotors and the
// sensor head be separate objects the animation can actually drive.

const ROTOR_SPIN = 34;       // rad/s at full power — fast enough to blur
const CRUISE_Y = 3.2;
const DOCK_Y = 0.55;

function buildDrone() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shell = surfaceMaterial('armour');
  const dark = surfaceMaterial('rubber');
  const trim = surfaceMaterial('armourTrim');

  // Centre hull — a flattened hex, wider than tall.
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.16, 6), shell);
  hull.rotation.y = Math.PI / 6;
  body.add(hull);

  // Sensor gimbal slung underneath, and the lens it looks through. The lens is
  // the drone's status light: it is what the player watches during a sweep.
  const gimbal = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), dark);
  const lensMat = new THREE.MeshStandardMaterial({
    color: PALETTE.cyan, emissive: PALETTE.cyan, emissiveIntensity: 2.4,
    roughness: 0.3, flatShading: true,
  });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.04, 8), lensMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.1;
  gimbal.add(ball, lens);
  gimbal.position.y = -0.14;
  body.add(gimbal);

  // Four booms at 45 degrees, each with a motor can and a rotor disc.
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const bx = Math.sin(a) * 0.33;
    const bz = Math.cos(a) * 0.33;

    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.34), trim);
    boom.position.set(bx / 2, 0.01, bz / 2);
    boom.rotation.y = a;
    body.add(boom);

    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.075, 8), dark);
    can.position.set(bx, 0.05, bz);
    body.add(can);

    // A spinning disc reads as a rotor at this zoom where modelled blades do
    // not — at 34 rad/s individual blades would strobe against the frame rate.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 14),
      new THREE.MeshBasicMaterial({
        color: 0x9fd8d2, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(bx, 0.1, bz);
    body.add(disc);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.006, 0.026), trim);
    blade.position.set(bx, 0.1, bz);
    body.add(blade);
    rotors.push(blade, disc);
  }

  // Navigation lights: red port, green starboard. Tiny, but they are the
  // detail that makes the thing read as an aircraft rather than a prop.
  for (const [dx, colour] of [[-0.3, 0xff5a4a], [0.3, 0x63ff9a]]) {
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 6, 5),
      new THREE.MeshStandardMaterial({
        color: colour, emissive: colour, emissiveIntensity: 2.2, flatShading: true,
      })
    );
    nav.position.set(dx, 0.0, -0.16);
    body.add(nav);
  }

  for (const o of body.children) { o.castShadow = true; }

  root.userData = { body, gimbal, lens: lensMat, rotors };
  return root;
}

export class Drone {
  constructor(scene) {
    this.scene = scene;
    this.group = buildDrone();
    this.group.name = 'recon-drone';
    // Built at roughly true scale (~0.7 m across) and then pushed up a third.
    // At the mission's default ortho height of 15 units a real-scale drone is
    // about twelve pixels and reads as a speck; this keeps it small next to a
    // walker while still being legible as an aircraft.
    this.group.scale.setScalar(1.35);
    this.group.visible = false;
    this.group.position.y = DOCK_Y;
    scene.add(this.group);

    const { body, gimbal, lens, rotors } = this.group.userData;
    this.body = body;
    this.gimbal = gimbal;
    this.lens = lens;
    this.rotors = rotors;

    this.power = 0;        // 0 docked, 1 flying — drives rotor speed and bob
    this.spin = 0;
    this.flying = false;

    // Ground light the drone casts while it sweeps. One unshadowed point,
    // switched off between sweeps so it costs nothing for most of the mission.
    this.lamp = new THREE.PointLight(PALETTE.cyan, 0, 7, 2);
    this.lamp.castShadow = false;
    scene.add(this.lamp);
  }

  // Launch from `from`, sweep `to`, hold for the scan, come home and land.
  // Returns a promise that settles when the drone is back on the deck, so the
  // Director can keep its beat timing in one place.
  sweep(from, to, { onScan = null, hold = 1.1 } = {}) {
    if (this.flying) return Promise.resolve();
    this.flying = true;

    this.group.visible = true;
    this.group.position.set(from.x, DOCK_Y, from.z);
    this.faceTowards(to.x, to.z, 0);

    const tl = gsap.timeline();
    // Spin up before it leaves the ground.
    tl.to(this, { power: 1, duration: 0.45, ease: 'power2.in' }, 0);
    tl.to(this.group.position, { y: CRUISE_Y, duration: 0.85, ease: 'power2.out' }, 0.25);
    tl.to(this.group.position, {
      x: to.x, z: to.z, duration: 1.0, ease: 'power2.inOut',
      onUpdate: () => this.faceTowards(to.x, to.z, 0.25),
    }, 0.6);

    // Sensor head tips down into the sweep, then levels off.
    tl.to(this.gimbal.rotation, { x: 0.85, duration: 0.5, ease: 'power2.out' }, 1.2);
    tl.to(this.lamp, { intensity: 11, duration: 0.4 }, 1.3);
    tl.call(() => { if (onScan) onScan(); }, null, 1.6);
    tl.to(this.gimbal.rotation, { x: 0, duration: 0.5, ease: 'power2.inOut' }, 1.6 + hold);
    tl.to(this.lamp, { intensity: 0, duration: 0.6 }, 1.6 + hold);

    // Home and land.
    tl.to(this.group.position, {
      x: from.x, z: from.z, duration: 1.0, ease: 'power2.inOut',
      onUpdate: () => this.faceTowards(from.x, from.z, 0.3),
    }, 2.3 + hold);
    tl.to(this.group.position, { y: DOCK_Y, duration: 0.7, ease: 'power2.in' }, 3.1 + hold);
    tl.to(this, { power: 0, duration: 0.6, ease: 'power2.out' }, 3.4 + hold);
    tl.call(() => { this.flying = false; this.group.visible = false; });

    return new Promise((resolve) => { tl.eventCallback('onComplete', resolve); });
  }

  // Mission restart. Kills any sweep in flight and puts the drone back on the
  // deck, so a replay never starts with last run's aircraft still airborne.
  reset() {
    gsap.killTweensOf([this, this.group.position, this.gimbal.rotation, this.lamp]);
    this.flying = false;
    this.power = 0;
    this.lamp.intensity = 0;
    this.gimbal.rotation.set(0, 0, 0);
    this.group.visible = false;
    this.group.position.set(0, DOCK_Y, 0);
  }

  faceTowards(x, z, duration = 0.3) {
    const dx = x - this.group.position.x;
    const dz = z - this.group.position.z;
    if (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3) return;
    const target = Math.atan2(dx, dz);
    if (duration === 0) { this.group.rotation.y = target; return; }
    // Short, cheap chase rather than a tween per frame — this is called from
    // inside an onUpdate and must not allocate.
    const cur = this.group.rotation.y;
    let delta = target - cur;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.group.rotation.y = cur + delta * 0.12;
  }

  setColor(hex) {
    this.lens.color.set(hex);
    this.lens.emissive.set(hex);
    this.lamp.color.set(hex);
  }

  update(dt, t) {
    if (!this.group.visible) return;

    // Rotors spin with power; the body bobs and banks only while airborne.
    this.spin += ROTOR_SPIN * this.power * dt;
    for (let i = 0; i < this.rotors.length; i++) {
      // Alternate direction between diagonals, as a real quad does.
      this.rotors[i].rotation.y = i % 4 < 2 ? this.spin : -this.spin;
    }

    const hover = this.power * 0.05;
    this.body.position.y = Math.sin(t * 4.1) * hover;
    this.body.rotation.z = Math.sin(t * 2.3) * hover * 0.9;
    this.body.rotation.x = Math.cos(t * 1.7) * hover * 0.7;

    // The gimbal scans side to side whenever the drone is up, so the sensor
    // never looks parked.
    this.gimbal.rotation.y = Math.sin(t * 1.9) * 0.55 * this.power;

    this.lamp.position.set(this.group.position.x, this.group.position.y - 0.2, this.group.position.z);
  }
}
