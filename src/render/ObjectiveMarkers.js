import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';
import { PLACES } from './Level.js';

// Objectives as places on the board, not rows in the HUD.
//
// The objective list already lives in mission data and is already drawn in the
// corner of the screen. What was missing is that "RESTORE THE RELAY" named
// somewhere the player could point at. These put a small, quiet marker on the
// ground at the actual world position, so the HUD row and the thing in the
// compound are visibly the same object.
//
// Deliberately restrained. The brief for this scene is a dark facility you
// read by sensor light; a floating waypoint diamond the size of a building
// would undo that. The marker is a thin ground ring with a short riser, it
// pulses slowly, and it is scaled to the prop it sits on.
//
// Cost: two shared geometries, one material per marker, no per-frame
// allocation. Three markers, six draw calls.

const RING_GEO = new THREE.RingGeometry(0.78, 0.90, 48);
const TICK_GEO = new THREE.RingGeometry(1.04, 1.13, 4);   // square bracket
const MARKER_Y = 0.045;

const STATE_COLOR = {
  pending: PALETTE.cyan,
  done: 0x63ff9a,
  failed: PALETTE.red,
};

function flatRing(geo, color, opacity, renderOrder) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = MARKER_Y;
  mesh.renderOrder = renderOrder;
  return mesh;
}

// Which place each mission objective sits on. Mission data names objectives by
// id; Level names the ground by key. This is the one line that joins them.
export const OBJECTIVE_PLACE = {
  relay: 'relay',
  extract: 'extraction',
};

export class ObjectiveMarkers {
  constructor(scene, objectives = []) {
    this.scene = scene;
    this.markers = new Map();

    for (const obj of objectives) {
      const placeKey = OBJECTIVE_PLACE[obj.id];
      const place = placeKey && PLACES[placeKey];
      if (!place) continue;      // an objective with nowhere to stand is HUD-only

      const group = new THREE.Group();
      group.position.set(place.x, place.y || 0, place.z);
      group.name = `objective-${obj.id}`;

      const ring = flatRing(RING_GEO, STATE_COLOR.pending, 0.62, 11);
      const bracket = flatRing(TICK_GEO, STATE_COLOR.pending, 0.40, 11);

      // A short riser off the ground. Gives the marker a little height so it
      // is not lost under a prop's own footprint from a 45-degree camera,
      // without becoming a waypoint pillar.
      const riser = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.9, 5),
        new THREE.MeshBasicMaterial({
          color: STATE_COLOR.pending,
          transparent: true,
          opacity: 0.38,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      riser.position.y = 0.45;
      riser.renderOrder = 11;

      group.add(ring, bracket, riser);
      scene.add(group);

      this.markers.set(obj.id, {
        group, ring, bracket, riser,
        state: 'pending',
        phase: this.markers.size * 1.7,   // stagger the pulses
      });
    }
  }

  // pending / done / failed, matching the HUD's own objective states.
  setState(id, state) {
    const m = this.markers.get(id);
    if (!m || m.state === state) return;
    m.state = state;
    const color = new THREE.Color(STATE_COLOR[state] || STATE_COLOR.pending);

    for (const part of [m.ring, m.bracket, m.riser]) {
      gsap.to(part.material.color, {
        r: color.r, g: color.g, b: color.b, duration: 0.5, ease: 'power2.out',
      });
    }
    // A resolved objective stops asking for attention.
    const settle = state === 'pending' ? 1 : 0.55;
    gsap.to(m.ring.material, { opacity: 0.62 * settle, duration: 0.6 });
    gsap.to(m.riser.material, { opacity: 0.38 * settle, duration: 0.6 });

    if (state === 'done') {
      gsap.fromTo(m.group.scale,
        { x: 1, y: 1, z: 1 },
        { x: 1.5, y: 1.5, z: 1.5, duration: 0.45, yoyo: true, repeat: 1, ease: 'power2.out' });
    }
  }

  // Read the objective board straight off GameState.objectives(), which is the
  // same array the HUD renders — so a marker cannot disagree with its own row.
  sync(objectives = []) {
    for (const obj of objectives) this.setState(obj.id, obj.state);
  }

  update(dt, t) {
    for (const m of this.markers.values()) {
      // Slow breath on the ring, slow counter-rotation on the bracket. Both
      // stop mattering once the objective resolves, so the pending one is the
      // one that moves.
      const live = m.state === 'pending' ? 1 : 0.25;
      const breath = 0.82 + 0.18 * Math.sin(t * 1.6 + m.phase);
      m.ring.scale.setScalar(1 + (breath - 1) * 0.35 * live);
      m.bracket.rotation.z = -t * 0.28 * live;
      m.riser.scale.y = breath;
    }
  }

  dispose() {
    for (const m of this.markers.values()) {
      this.scene.remove(m.group);
      for (const part of [m.ring, m.bracket, m.riser]) part.material.dispose();
      m.riser.geometry.dispose();
    }
    this.markers.clear();
  }
}
