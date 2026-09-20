import * as THREE from 'three';
import { OFFSET } from './Camera.js';

// ============================================================================
// SEEING INSIDE BUILDINGS
// ============================================================================
//
// The camera is orthographic at a fixed 45 degrees, which is the right framing
// for a tactical board and the wrong one for a room with a roof on it. Turns 5
// and 6 of Ammunition Depot happen indoors and are decided entirely on what is
// visible in that room — so the building has to get out of the way.
//
// Two mechanisms, deliberately separate:
//
//   ROOFS   hide outright when a unit is inside that room's footprint. A roof
//           is never something you want to see through; you want it gone.
//   WALLS   fade only while they are actually between the camera and a unit.
//           Faded, not hidden — you still need to read the room's shape.
//
// Cost control: the raycast runs at 12 Hz, not per frame, and a material is
// only retargeted when its state actually changes. Tweening every wall every
// tick was the naive version and it cost more than the shadows did.
//
// Nothing here touches sensor cones, badges, markers or FX. It only ever
// looks at the mesh list the level handed over.

const RAY_HZ = 12;
const FADE_TIME = 0.2;
const FADED = 0.15;
const RAY_BACK = 80;          // how far back along the view to start the ray

export class Occlusion {
  constructor({ fadeables = [], roofs = [], units = [] } = {}) {
    // Flatten to one mesh list for the raycaster, with a back-reference so a
    // hit can be resolved to the group it belongs to.
    this.groups = fadeables.map((g, i) => ({
      ...g,
      index: i,
      current: 1,
      target: 1,
    }));
    for (const g of this.groups) {
      for (const m of g.meshes) m.userData.fadeGroup = g;
    }
    this.meshes = this.groups.flatMap((g) => g.meshes);

    this.roofs = roofs.map((r) => ({ ...r, hidden: false }));
    this.units = units;

    this.raycaster = new THREE.Raycaster();
    this.origin = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.acc = 0;
    this.blocking = new Set();
    this.enabled = true;
  }

  // A unit counts as inside a room if its footprint is within the bounds.
  // Deliberately generous at the edges: standing in the doorway should lift
  // the roof, not flicker it.
  unitInside(unit, bounds, pad = 0.8) {
    const { x, z } = unit.group.position;
    return x > bounds.minX - pad && x < bounds.maxX + pad
        && z > bounds.minZ - pad && z < bounds.maxZ + pad;
  }

  recompute() {
    // --- roofs: off if anyone is in the room ---------------------------
    for (const roof of this.roofs) {
      const occupied = this.units.some((u) => this.unitInside(u, roof.bounds));
      if (occupied === roof.hidden) continue;
      roof.hidden = occupied;
      for (const m of roof.meshes) m.visible = !occupied;
    }

    // --- walls: fade what is actually in the way ------------------------
    const blocking = new Set();
    // Orthographic: every ray runs along the same direction, so the ray to a
    // unit starts behind it along the view axis rather than at the camera
    // position. Using the camera position would be a perspective ray and
    // would miss walls near the edges of the board.
    this.dir.set(-OFFSET.x, -OFFSET.y, -OFFSET.z).normalize();

    for (const unit of this.units) {
      if (!unit?.group) continue;
      const p = unit.group.position;
      this.origin.set(p.x, p.y + 1.0, p.z).addScaledVector(this.dir, -RAY_BACK);
      this.raycaster.set(this.origin, this.dir);
      this.raycaster.far = RAY_BACK - 0.6;
      for (const hit of this.raycaster.intersectObjects(this.meshes, false)) {
        const g = hit.object.userData.fadeGroup;
        if (g) blocking.add(g.index);
      }
    }
    this.blocking = blocking;

    for (const g of this.groups) {
      g.target = blocking.has(g.index) ? FADED : 1;
    }
  }

  update(dt) {
    if (!this.enabled) return;
    this.acc += dt;
    if (this.acc >= 1 / RAY_HZ) {
      this.acc = 0;
      this.recompute();
    }

    // Ease toward the target. Hand-rolled rather than tweened: a material can
    // be retargeted twice a second and a stack of competing tweens on the
    // same opacity is how you get a wall that never settles.
    const step = Math.min(dt, 0.05) / FADE_TIME;
    for (const g of this.groups) {
      if (Math.abs(g.current - g.target) < 0.004) {
        if (g.current !== g.target) {
          g.current = g.target;
          for (const m of g.materials) m.opacity = g.current;
        }
        continue;
      }
      g.current += Math.sign(g.target - g.current) * Math.min(step, Math.abs(g.target - g.current));
      for (const m of g.materials) {
        m.opacity = g.current;
        // A wall you can see through should not also be catching the sun.
        m.depthWrite = g.current > 0.85;
      }
    }
  }

  // Mission restart: everything solid and visible again.
  reset() {
    for (const g of this.groups) {
      g.current = g.target = 1;
      for (const m of g.materials) { m.opacity = 1; m.depthWrite = true; }
    }
    for (const roof of this.roofs) {
      roof.hidden = false;
      for (const m of roof.meshes) m.visible = true;
    }
  }
}

export function createOcclusion(opts) { return new Occlusion(opts); }
