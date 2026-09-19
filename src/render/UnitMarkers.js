import * as THREE from 'three';
import { STATUS_COLOR } from './Units.js';

// Ground markers under each robot: who is who, who is being talked about, and
// who just took a hit — read off the board instead of off the HUD.
//
// Deliberately additive to the units rather than part of them. The chassis
// belongs to whoever is building the models; these are separate meshes that
// only read a unit's position, heading and status. If the robots get replaced
// with real assets, none of this needs to change.
//
// Cost: two ring meshes per unit, geometry shared across all six, no
// per-frame allocation. Six extra draw calls total.

const BASE_GEO = new THREE.RingGeometry(0.52, 0.60, 40);
const FOCUS_GEO = new THREE.RingGeometry(0.72, 0.78, 4);   // square bracket
const MARKER_Y = 0.035;

function ringMesh(geo, color, opacity, renderOrder) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = MARKER_Y;
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  return mesh;
}

export class UnitMarkers {
  constructor(scene, units) {
    this.scene = scene;
    this.entries = units.map((unit, i) => {
      const base = ringMesh(BASE_GEO, STATUS_COLOR[unit.status] || 0x4ce0d8, 0.32, 11);
      const focus = ringMesh(FOCUS_GEO, STATUS_COLOR[unit.status] || 0x4ce0d8, 0, 11);
      scene.add(base, focus);
      return {
        unit, base, focus,
        // Offset phases so three idle robots do not breathe in lockstep,
        // which looks mechanical in the worst way.
        phase: i * 2.1,
        flare: 0,
        lastStatus: unit.status,
        badgeY: unit.badge ? unit.badge.position.y : null,
      };
    });
    this.color = new THREE.Color();
  }

  // Ring flare on a unit — a hit landed, or a sensor just went.
  flare(unitId, amount = 1) {
    const e = this.entries.find((x) => x.unit.id === unitId);
    if (e) e.flare = amount;
  }

  update(dt, t) {
    for (const e of this.entries) {
      const { unit, base, focus } = e;

      base.position.x = unit.group.position.x;
      base.position.z = unit.group.position.z;
      focus.position.x = unit.group.position.x;
      focus.position.z = unit.group.position.z;

      // Status changes flare the ring on their way through, so a unit
      // degrading is an event on the board and not only in the HUD.
      if (unit.status !== e.lastStatus) {
        e.lastStatus = unit.status;
        e.flare = 1;
      }
      this.color.set(STATUS_COLOR[unit.status] || 0x4ce0d8);
      base.material.color.copy(this.color);
      focus.material.color.copy(this.color);

      e.phase += dt;
      const breathe = 0.86 + 0.14 * Math.sin(e.phase * 1.6);

      if (e.flare > 0) {
        e.flare = Math.max(0, e.flare - dt * 1.8);
        const k = e.flare;
        base.scale.setScalar(breathe + k * 1.5);
        base.material.opacity = 0.30 + k * 0.7;
      } else {
        base.scale.setScalar(breathe);
        base.material.opacity = unit.status === 'healthy' ? 0.30 : 0.46;
      }

      // Focus bracket: square, counter-rotating, only on the unit under
      // discussion. Shape differs from the round base ring so the two never
      // read as one thicker ring.
      const wanted = unit.focused ? 1 : 0;
      const cur = focus.material.opacity;
      focus.material.opacity = cur + (wanted * 0.75 - cur) * Math.min(1, dt * 7);
      if (focus.material.opacity > 0.01) {
        focus.rotation.z = -t * 0.6;
        focus.scale.setScalar(1 + 0.07 * Math.sin(t * 2.6 + e.phase));
      }

      // Badge bob — a few centimetres, enough that a held shot is not static.
      if (e.badgeY !== null && unit.badge) {
        unit.badge.position.y = e.badgeY + Math.sin(e.phase * 1.3) * 0.045;
      }
    }
  }

  dispose() {
    for (const e of this.entries) {
      this.scene.remove(e.base, e.focus);
      e.base.material.dispose();
      e.focus.material.dispose();
    }
    this.entries = [];
  }
}
