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

  // Scan beam. A cone hanging off the gimbal, hidden until the drone is
  // actually inspecting something — this is the visual that says "it is
  // looking at *this* spot" rather than "it is flying around".
  const beamMat = new THREE.MeshBasicMaterial({
    color: PALETTE.cyan, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1, 18, 1, true), beamMat);
  beam.position.y = -0.5;       // apex at the gimbal, opening downward
  beam.renderOrder = 9;
  beam.visible = false;
  gimbal.add(beam);

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

  root.userData = { body, gimbal, lens: lensMat, rotors, beam, beamMat };
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

    const { body, gimbal, lens, rotors, beam, beamMat } = this.group.userData;
    this.body = body;
    this.gimbal = gimbal;
    this.lens = lens;
    this.rotors = rotors;
    this.beam = beam;
    this.beamMat = beamMat;

    this.power = 0;        // 0 docked, 1 flying — drives rotor speed and bob
    this.spin = 0;
    this.flying = false;
    // Tweened by the sortie; update() renders it through a flicker, so the
    // two never fight over beamMat.opacity.
    this.beamLevel = 0;
    this.bank = 0;

    // Ground light the drone casts while it sweeps. One unshadowed point,
    // switched off between sweeps so it costs nothing for most of the mission.
    this.lamp = new THREE.PointLight(PALETTE.cyan, 0, 7, 2);
    this.lamp.castShadow = false;
    scene.add(this.lamp);
  }

  // Fly a reconnaissance sortie: launch from `from`, transit to `to`, orbit
  // and inspect it, then come home and land.
  //
  // `to` may carry a `hover` height (a mast needs more clearance than open
  // ground) and a `key` naming the place, which is what makes turn 2's
  // outbuilding sortie visibly a different flight from turn 4's divider run.
  //
  // Returns a promise that settles when the drone is back on the deck — or
  // immediately, if the sortie is aborted by a restart.
  // `onScan` fires when it is on station and the beam opens — the moment it
  // starts reading. `onRead` fires when it has finished reading and before it
  // turns for home, which is when its findings are worth anything: a report
  // that arrives before the aircraft has looked is not a report.
  // `hold` is how long it reads the ground for. Long enough to be a scan
  // rather than a flyby, short enough that a six-turn mission with two sorties
  // in it does not outgrow the pitch slot.
  sweep(from, to, { onScan = null, onRead = null, hold = 1.15 } = {}) {
    if (this.flying) return Promise.resolve();
    this.flying = true;
    this.target = to.key || null;

    const cruise = to.hover || CRUISE_Y;
    // Where it leaves from. A hand-launched aircraft starts in the operator's
    // hands, not on the deck between their feet — the caller passes the
    // release point so the player can see who put it in the air. It still
    // comes home to DOCK_Y, because landing is not a catch.
    const launchY = from.y ?? DOCK_Y;
    this.group.visible = true;
    this.group.position.set(from.x, launchY, from.z);
    this.faceTowards(to.x, to.z, 0);

    const a = new THREE.Vector3(from.x, launchY, from.z);
    const b = new THREE.Vector3(to.x, cruise, to.z);
    const span = Math.hypot(b.x - a.x, b.z - a.z);

    // Transit time scales with distance, so a short hop to the perimeter does
    // not take as long as a run across the compound to the relay mast. The
    // flight reads as a journey rather than a fixed-length animation.
    const transit = THREE.MathUtils.clamp(span * 0.16, 0.8, 2.2);

    // Lateral bow on the flight path. A drone sliding along a straight line
    // between two points looks like a tween; a shallow curve, banked into,
    // looks like something flying.
    const bowSign = ((Math.round(to.x + to.z) % 2) === 0) ? 1 : -1;
    const bow = Math.min(span * 0.18, 2.4) * bowSign;
    const nx = -(b.z - a.z) / Math.max(span, 1e-3);
    const nz = (b.x - a.x) / Math.max(span, 1e-3);

    const tl = gsap.timeline();
    this.tl = tl;

    // Spin up on the deck before it leaves the ground.
    tl.to(this, { power: 1, duration: 0.45, ease: 'power2.in' }, 0);
    // A drone released at chest height is already flying; it climbs away
    // rather than lifting off, and it does so a beat sooner.
    const climbAt = launchY > DOCK_Y + 0.3 ? 0.05 : 0.25;
    tl.to(this.group.position, { y: cruise, duration: 0.8, ease: 'power2.out' }, climbAt);

    // Transit. Position is driven by hand rather than by three separate
    // tweens, so the arc, the bank and the heading all stay in step.
    const out = { p: 0 };
    tl.to(out, {
      p: 1, duration: transit, ease: 'power2.inOut',
      onUpdate: () => {
        const k = out.p;
        const arc = Math.sin(k * Math.PI);           // 0 at both ends
        this.group.position.x = a.x + (b.x - a.x) * k + nx * bow * arc;
        this.group.position.z = a.z + (b.z - a.z) * k + nz * bow * arc;
        this.group.position.y = a.y + (b.y - a.y) * k + arc * 0.5;
        this.bank = -bowSign * arc * 0.28;
        this.faceTowards(b.x, b.z, 0.2);
      },
    }, 0.55);

    const arrive = 0.55 + transit;

    // On station: gimbal tips down, beam opens, lamp comes up, and the drone
    // orbits the point it is inspecting instead of parking over it.
    tl.call(() => { this.inspecting = true; this.orbit = { x: b.x, z: b.z, y: cruise }; }, null, arrive);
    tl.to(this.gimbal.rotation, { x: 1.0, duration: 0.45, ease: 'power2.out' }, arrive);
    tl.to(this.lamp, { intensity: 13, duration: 0.4 }, arrive);
    tl.to(this, { beamLevel: 0.22, duration: 0.35 }, arrive);
    tl.call(() => { if (onScan) onScan(); }, null, arrive + 0.35);

    const leave = arrive + hold;
    tl.call(() => { if (onRead) onRead(); }, null, leave);
    tl.call(() => { this.inspecting = false; }, null, leave);
    tl.to(this.gimbal.rotation, { x: 0, duration: 0.45, ease: 'power2.inOut' }, leave);
    tl.to(this.lamp, { intensity: 0, duration: 0.5 }, leave);
    tl.to(this, { beamLevel: 0, duration: 0.4 }, leave);

    // Home, on the mirrored bow so the return leg is visibly its own flight.
    const back = { p: 0 };
    tl.to(back, {
      p: 1, duration: transit, ease: 'power2.inOut',
      onUpdate: () => {
        const k = back.p;
        const arc = Math.sin(k * Math.PI);
        this.group.position.x = b.x + (a.x - b.x) * k - nx * bow * arc;
        this.group.position.z = b.z + (a.z - b.z) * k - nz * bow * arc;
        this.bank = bowSign * arc * 0.28;
        this.faceTowards(a.x, a.z, 0.25);
      },
    }, leave + 0.45);

    const home = leave + 0.45 + transit;
    tl.to(this.group.position, { y: DOCK_Y, duration: 0.7, ease: 'power2.in' }, home);
    tl.to(this, { power: 0, duration: 0.6, ease: 'power2.out' }, home + 0.2);
    tl.call(() => this.land());

    return new Promise((resolve) => { this.settle = resolve; });
  }

  // End of sortie, however it ended.
  //
  // Settling the promise here rather than off the timeline's onComplete
  // matters: killing a timeline's children does not fire its onComplete, so an
  // aborted sweep used to strand whatever was awaiting it. A stranded await in
  // the Director is not a hang — the continuation runs later, against the
  // *next* mission.
  land() {
    this.flying = false;
    this.inspecting = false;
    this.target = null;
    this.orbit = null;
    this.bank = 0;
    this.group.visible = false;
    this.beamLevel = 0;
    this.beamMat.opacity = 0;
    this.lamp.intensity = 0;
    this.tl = null;
    const settle = this.settle;
    this.settle = null;
    if (settle) settle();
  }

  // Mission restart. Aborts any sortie in flight and puts the drone back on
  // the deck, so a replay never starts with last run's aircraft still up.
  reset() {
    // Kill the timeline itself, not just its targets. Killing only the targets
    // leaves the timeline alive with its callbacks unfired — the exact shape
    // of the restart-mid-sweep bug.
    this.tl?.kill();
    gsap.killTweensOf([this, this.group.position, this.gimbal.rotation, this.lamp]);
    this.power = 0;
    this.gimbal.rotation.set(0, 0, 0);
    this.group.position.set(0, DOCK_Y, 0);
    this.land();                 // settles any promise still waiting on us
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

    // On station: a slow orbit around the point being inspected. This is the
    // difference between "the drone arrived" and "the drone is looking at
    // something" — and it is legible from the tactical camera in a way a
    // hovering dot is not.
    if (this.inspecting && this.orbit) {
      this.orbitPhase = (this.orbitPhase || 0) + dt * 1.05;
      const r = 0.95;
      this.group.position.x = this.orbit.x + Math.sin(this.orbitPhase) * r;
      this.group.position.z = this.orbit.z + Math.cos(this.orbitPhase) * r;
      // Keep the nose on the thing it is inspecting, not on the flight path.
      this.faceTowards(this.orbit.x, this.orbit.z, 0.3);
      this.bank = 0.16;
    }

    const hover = this.power * 0.05;
    this.body.position.y = Math.sin(t * 4.1) * hover;
    // Bank into the turn, with the idle wobble on top.
    this.body.rotation.z = (this.bank || 0) + Math.sin(t * 2.3) * hover * 0.9;
    this.body.rotation.x = Math.cos(t * 1.7) * hover * 0.7;

    // The gimbal sweeps side to side whenever the drone is up, so the sensor
    // never looks parked. It sweeps wider while actually inspecting.
    const sweepWidth = this.inspecting ? 0.75 : 0.55;
    this.gimbal.rotation.y = Math.sin(t * 1.9) * sweepWidth * this.power;

    // Stretch the scan cone so it always reaches the ground, whatever height
    // the drone is holding, and let it breathe while it reads.
    if (this.beamLevel > 0.001) {
      this.beam.visible = true;
      const drop = Math.max(0.6, this.group.position.y / Math.max(this.group.scale.y, 1e-3));
      this.beam.scale.set(1, drop, 1);
      this.beam.position.y = -drop * 0.5;
      this.beamMat.opacity = this.beamLevel * (0.75 + 0.25 * Math.sin(t * 6.5));
    } else if (this.beam.visible) {
      this.beam.visible = false;
      this.beamMat.opacity = 0;
    }

    this.lamp.position.set(this.group.position.x, this.group.position.y - 0.2, this.group.position.z);
  }
}
