import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';
import { PLACES, reconTarget } from './Level.js';

// Where a recon sortie goes, and how the board says so before it gets there.
//
// The drone used to fly to a place the *renderer* picked from the turn number.
// That works for one rehearsed mission and breaks the moment the mission file
// changes shape: a new turn order, a reskin, a second mission, and the aircraft
// is flying to coordinates that belong to a map nobody is looking at.
//
// So destinations resolve from data, in this order, first hit wins:
//
//   1. outcome.site / turn.recon   — the mission names the ground for this
//                                    choice. A key into the gazetteer, or a
//                                    literal { x, z } if it wants to be exact.
//   2. mission.sites[key]          — the mission's own gazetteer, so a mission
//                                    set somewhere else declares its own places
//                                    without a line changing in here.
//   3. outcome.reveal              — the mission names a level object. Its real
//                                    world position wins over any table: this
//                                    is the actual prop the player is about to
//                                    be shown.
//   4. the level gazetteer         — PLACES, resolved by name.
//   5. Level.reconTarget()         — the existing per-turn fallback, so Dry
//                                    Creek keeps flying its rehearsed sorties
//                                    with no mission-data change at all.
//
// Everything downstream (the drone, the marker, the fog reveal, the camera)
// takes the resolved record, so all four always agree about where the sortie
// went.

const DEFAULT_HOVER = 3.2;

function record(key, site, source) {
  return {
    key,
    source,
    x: site.x,
    z: site.z,
    y: site.y ?? 0.04,
    hover: site.hover ?? DEFAULT_HOVER,
    label: site.label || String(key).replace(/[-_]/g, ' ').toUpperCase(),
  };
}

// A site reference may be a key into a gazetteer, the name of a thing standing
// in the level, or a literal position. All three are worth accepting: named
// places survive a map edit, level objects are exactly where the prop is, and a
// literal lets a mission point at ground nothing has named yet.
export function fromRef(ref, { mission = null, level = null } = {}) {
  if (!ref || ref === true) return null;
  if (typeof ref === 'object') {
    if (typeof ref.x !== 'number' || typeof ref.z !== 'number') return null;
    return record(ref.key || 'site', ref, 'mission-data');
  }
  const declared = mission?.sites?.[ref];
  if (declared) return record(ref, declared, 'mission-sites');
  if (PLACES[ref]) return record(ref, PLACES[ref], 'level-gazetteer');
  // A prop in the level, by name. Its own position beats any table.
  const object = level?.[ref];
  if (object?.position) {
    return record(ref, { x: object.position.x, z: object.position.z }, 'level-object');
  }
  return null;
}

export function resolveSite({ mission, turn, outcome, level } = {}) {
  const ctx = { mission, level };

  // Outcome first, then turn: what this particular choice named beats the
  // turn's default, which beats anything inferred.
  const named = fromRef(outcome?.site, ctx);
  if (named) return named;

  // The mission named a thing in the level. Use where that thing actually
  // stands, not where a table guesses it stands.
  const object = outcome?.reveal && level?.[outcome.reveal];
  if (object?.position) {
    const site = PLACES[outcome.reveal] || {};
    return record(outcome.reveal, {
      ...site,
      x: object.position.x,
      z: object.position.z,
    }, 'level-object');
  }

  const byTurn = fromRef(turn?.recon, ctx);
  if (byTurn) return byTurn;

  const legacy = reconTarget({ turnId: turn?.id, reveal: outcome?.reveal });
  return record(legacy.key, legacy, 'turn-table');
}

// ----------------------------------------------------------------- the marker
//
// The sortie's destination, painted on the ground before the drone leaves and
// held until it has been read. Three states, and they are the beats the player
// is meant to be able to follow:
//
//   tasked    amber, opening — an order has been given, nothing is known yet
//   scanning  amber, tight and spinning — the aircraft is on station
//   surveyed  cyan, settled — this ground has been read
//
// Deliberately the same visual family as ObjectiveMarkers: a thin ring, a
// square bracket and a label. A recon target is a temporary objective, and it
// should look like one.

const RING_GEO = new THREE.RingGeometry(0.62, 0.72, 44);
const BRACKET_GEO = new THREE.RingGeometry(1.02, 1.16, 4);

const STATE = {
  tasked: { color: PALETTE.amber, ring: 0.7, bracket: 0.5, spin: 0.9, text: 'RECON TASKED' },
  scanning: { color: PALETTE.amber, ring: 0.95, bracket: 0.8, spin: 2.4, text: 'SCANNING' },
  surveyed: { color: PALETTE.cyan, ring: 0.55, bracket: 0.32, spin: 0.2, text: 'SURVEYED' },
};

function labelTexture(title, sub) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Drawn white and tinted by the sprite material, so one canvas follows the
  // marker through amber tasking and cyan completion.
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 46px ui-monospace, Menlo, monospace';
  ctx.fillText(title.slice(0, 22), 256, 44);

  ctx.globalAlpha = 0.72;
  ctx.font = '30px ui-monospace, Menlo, monospace';
  ctx.fillText(sub.slice(0, 26), 256, 92);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class ReconMarker {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'recon-target';
    this.group.visible = false;

    this.ring = this.flat(RING_GEO, 0.7, 12);
    this.bracket = this.flat(BRACKET_GEO, 0.5, 12);

    this.labelMat = new THREE.SpriteMaterial({
      color: PALETTE.amber, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
    });
    this.label = new THREE.Sprite(this.labelMat);
    this.label.scale.set(2.6, 0.65, 1);
    this.label.position.y = 1.45;
    this.label.renderOrder = 13;

    this.group.add(this.ring, this.bracket, this.label);
    scene.add(this.group);

    this.state = null;
    this.site = null;
    this.texture = null;
  }

  flat(geo, opacity, renderOrder) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: PALETTE.amber, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = renderOrder;
    return mesh;
  }

  // An order has been given. The marker lands on the ground the drone is about
  // to fly to — before it launches, so the player can see where it is going
  // rather than work it out from where it ends up.
  task(site, caption = '') {
    // The last sortie's marker fades out on a delay, and that fade owns this
    // marker's opacity and its onComplete hides the group. A new tasking
    // arriving first would be wiped by it a second later — so every tween
    // from the previous sortie dies here, before this one is set up.
    this.killTweens();

    this.site = site;
    this.group.position.set(site.x, site.y ?? 0.04, site.z);
    this.group.visible = true;

    this.texture?.dispose();
    this.texture = labelTexture(site.label, caption || STATE.tasked.text);
    this.labelMat.map = this.texture;
    this.labelMat.needsUpdate = true;

    gsap.fromTo(this.group.scale,
      { x: 1.8, y: 1.8, z: 1.8 },
      { x: 1, y: 1, z: 1, duration: 0.5, ease: 'power3.out' });
    gsap.fromTo(this.labelMat, { opacity: 0 }, { opacity: 0.92, duration: 0.4 });
    this.setState('tasked');
  }

  setState(name, caption = null) {
    const spec = STATE[name];
    if (!spec || !this.site) return;
    this.state = name;
    const color = new THREE.Color(spec.color);

    for (const [part, target] of [[this.ring, spec.ring], [this.bracket, spec.bracket]]) {
      gsap.killTweensOf(part.material);
      gsap.to(part.material.color, { r: color.r, g: color.g, b: color.b, duration: 0.35 });
      gsap.to(part.material, { opacity: target, duration: 0.35 });
    }
    gsap.to(this.labelMat.color, { r: color.r, g: color.g, b: color.b, duration: 0.35 });

    this.texture?.dispose();
    this.texture = labelTexture(this.site.label, caption || spec.text);
    this.labelMat.map = this.texture;
    this.labelMat.needsUpdate = true;

    if (name === 'surveyed') {
      gsap.fromTo(this.ring.scale,
        { x: 1, y: 1, z: 1 },
        { x: 1.45, y: 1.45, z: 1.45, duration: 0.5, yoyo: true, repeat: 1, ease: 'power2.out' });
    }
  }

  // The ground has been read. The marker hangs around long enough to be seen,
  // then leaves — it is a report, not a permanent fixture.
  complete({ linger = 3.2, caption = null } = {}) {
    if (!this.site) return;
    this.setState('surveyed', caption);
    gsap.killTweensOf(this.labelMat);
    gsap.to(this.labelMat, { opacity: 0, duration: 1.1, delay: linger });
    gsap.to([this.ring.material, this.bracket.material], {
      opacity: 0, duration: 1.1, delay: linger,
      onComplete: () => { this.group.visible = false; this.site = null; },
    });
  }

  killTweens() {
    gsap.killTweensOf([
      this.group.scale, this.ring.scale, this.labelMat, this.labelMat.color,
      this.ring.material, this.ring.material.color,
      this.bracket.material, this.bracket.material.color,
    ]);
  }

  clear() {
    this.killTweens();
    this.group.visible = false;
    this.group.scale.setScalar(1);
    this.ring.scale.setScalar(1);
    this.labelMat.opacity = 0;
    this.site = null;
    this.state = null;
  }

  update(dt, t) {
    if (!this.group.visible || !this.state) return;
    const spec = STATE[this.state];
    this.bracket.rotation.z = -t * spec.spin;
    // Tighter, faster breath while the aircraft is actually reading the ground.
    const rate = this.state === 'scanning' ? 5.2 : 1.7;
    const depth = this.state === 'scanning' ? 0.09 : 0.05;
    this.ring.scale.setScalar(1 + Math.sin(t * rate) * depth);
  }

  dispose() {
    this.scene.remove(this.group);
    this.ring.material.dispose();
    this.bracket.material.dispose();
    this.labelMat.dispose();
    this.texture?.dispose();
  }
}
