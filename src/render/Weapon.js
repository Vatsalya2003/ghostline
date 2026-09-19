import * as THREE from 'three';

// Procedural rifle, parented to the hand bone so it inherits every animation
// for free. Deliberately box geometry — a placeholder that reads as a weapon
// silhouette at tactical zoom, swappable for a model later.

// Mixamo rigs live at centimetre scale inside a root scaled by MODEL_SCALE,
// so anything parented to a bone has to cancel that out to come back to
// world-sized.
const BONE_SCALE_COMPENSATION = 100;

// Tuned by eye against the idle pose. Local to the right hand bone.
const GRIP_POSITION = new THREE.Vector3(0.06, 0.04, 0.02);
const GRIP_ROTATION = new THREE.Euler(0, Math.PI / 2, Math.PI / 2);

export const RIGHT_HAND_BONE = /RightHand$/i;

function part(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function buildRifle() {
  // Light enough to read as a silhouette against a near-black scene at
  // tactical zoom — the first pass at 0x1a201e vanished completely.
  const body = new THREE.MeshStandardMaterial({
    color: 0x47524e, roughness: 0.45, metalness: 0.55, flatShading: true,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x5c6a65, roughness: 0.4, metalness: 0.65, flatShading: true,
  });

  const rifle = new THREE.Group();
  rifle.name = 'rifle';
  rifle.add(part(0.60, 0.07, 0.07, body, 0.12, 0, 0));     // receiver + barrel
  rifle.add(part(0.10, 0.14, 0.06, accent, -0.04, -0.09, 0)); // grip
  rifle.add(part(0.20, 0.09, 0.06, accent, -0.22, 0.01, 0));  // stock
  rifle.add(part(0.16, 0.05, 0.05, accent, 0.06, 0.07, 0));   // optic
  rifle.add(part(0.06, 0.10, 0.05, body, 0.22, -0.07, 0));    // foregrip
  return rifle;
}

// Returns the rifle, or null if the rig has no right hand bone.
export function attachRifle(model) {
  let hand = null;
  model.traverse((child) => {
    if (!hand && child.isBone && RIGHT_HAND_BONE.test(child.name)) hand = child;
  });
  if (!hand) {
    console.warn('[weapon] no right-hand bone found — rifle not attached');
    return null;
  }

  const rifle = buildRifle();
  rifle.scale.setScalar(BONE_SCALE_COMPENSATION);
  rifle.position.copy(GRIP_POSITION).multiplyScalar(BONE_SCALE_COMPENSATION);
  rifle.rotation.copy(GRIP_ROTATION);
  hand.add(rifle);
  return rifle;
}
