import * as THREE from 'three';
import gsap from 'gsap';
import { groundAt } from './Units.js';
import { triplanarMaterial } from './Textures.js';

// ============================================================================
// THE PEOPLE
// ============================================================================
//
// Ammunition Depot is a mission about deciding who is in a room, and until now
// the room was empty. The player was told about six figures, given a filing
// cabinet to look at, and asked to decide whether to shoot one of them. That
// is not a decision, it is a guess about a sentence.
//
// So: simple low-poly figures, built in code like everything else here — no
// downloaded meshes, nothing to license, and they cost one draw call each.
//
// TWO KINDS, and they have to be tellable apart from across a room at
// tactical zoom, because that is the entire mechanic:
//
//   HOSTILE   dark tactical gear, red band, rifle held across the body,
//             standing square. Reads as armed at a glance.
//   CIVILIAN  pale clothing, no rifle, and posture does the work — seated
//             with the shoulders down, or crouched small behind cover.
//
// Colour alone would not be enough: the player is looking at a board where
// cyan/amber/red already mean something about their own squad. So the
// silhouettes differ too — a rifle is a shape, and a seated figure is half
// the height of a standing one.
//
// UNRESOLVED is the important state. A figure the AI cannot actually see is
// drawn as a dashed outline with a question mark, not as a person — because
// the whole point of turn 6 is that you do not know what it is yet.

// Lifted well above the compound's own palette. These are the only meshes on
// the board the player is asked to *identify*, and at tactical zoom under a
// dusk key they were reading as silhouettes against silhouettes.
const HOSTILE = {
  cloth: 0x5e666e, trim: 0xff5a4a, skin: 0xd2a684, gear: 0x434a53,
};
const CIVILIAN = {
  cloth: 0xf0e8d2, trim: 0xa9bcc8, skin: 0xe2b894, gear: 0x9a9184,
};

function box(w, h, d, mat, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// One humanoid, about 1.7 units tall standing. Deliberately blocky: it has to
// read at a glance from forty units away, and a detailed figure at this scale
// is a smudge with a higher triangle count.
function figure(palette, { armed = false, pose = 'stand' } = {}) {
  const g = new THREE.Group();
  // Surfaced, like everything else in the compound. These were the last
  // flat-colour meshes on the board, which made the people read as diagrams
  // standing in a textured room.
  //
  // Object space, not world: a world projection slides across a figure as it
  // is placed, and these are the meshes the player is asked to look hardest
  // at. Scale is in the figure's own units — a 1.7-unit person wants a few
  // repeats across the torso, not a fraction of one.
  //
  // Cloth takes the coarse weave; webbing and rifle take painted metal. Skin
  // is left untextured on purpose: a fabric normal on a face reads as damage.
  const cloth = triplanarMaterial({
    set: 'sandbag', color: palette.cloth, roughness: 0.92, metalness: 0.0,
    scale: 3.4, space: 'object', normalScale: 0.6, albedoMix: 0.55,
  });
  const trim = triplanarMaterial({
    set: 'sandbag', color: palette.trim, roughness: 0.85, metalness: 0.05,
    scale: 4.0, space: 'object', normalScale: 0.5, albedoMix: 0.5,
  });
  const skin = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.95, flatShading: true });
  const gear = triplanarMaterial({
    set: 'metal-painted', color: palette.gear, roughness: 0.7, metalness: 0.3,
    scale: 5.0, space: 'object', normalScale: 0.7, albedoMix: 0.6,
  });

  const seated = pose === 'seated';
  const crouch = pose === 'crouch';
  const legH = seated ? 0.36 : crouch ? 0.46 : 0.78;
  const torsoY = legH + (seated ? 0.32 : crouch ? 0.30 : 0.42);

  // Legs. Seated figures get them folded forward instead of standing.
  for (const side of [-1, 1]) {
    const leg = box(0.17, legH, 0.19, cloth, side * 0.13, legH / 2, 0);
    if (seated) { leg.rotation.x = -1.15; leg.position.set(side * 0.13, 0.20, 0.22); }
    g.add(leg);
  }

  const torso = box(0.46, seated ? 0.58 : 0.62, 0.27, cloth, 0, torsoY, seated ? 0.02 : 0);
  g.add(torso);

  // The identifying band — a plate carrier on a hostile, a collar on a
  // civilian. Same geometry, opposite meaning, which is the point.
  g.add(box(0.48, 0.16, 0.30, trim, 0, torsoY + 0.16, seated ? 0.02 : 0));

  const headY = torsoY + (seated ? 0.44 : 0.48);
  g.add(box(0.24, 0.26, 0.24, skin, 0, headY, seated ? 0.02 : 0));
  // Helmet / hair, so the head is not a floating cube.
  g.add(box(0.28, 0.10, 0.28, armed ? gear : trim, 0, headY + 0.17, seated ? 0.02 : 0));

  // Arms. A civilian's are forward and together — bound at the wrists.
  for (const side of [-1, 1]) {
    const arm = box(0.13, 0.48, 0.14, cloth, side * 0.29, torsoY + 0.05, 0);
    if (!armed) { arm.rotation.x = -0.9; arm.position.set(side * 0.17, torsoY - 0.02, 0.22); }
    else { arm.rotation.x = -0.55; arm.position.set(side * 0.26, torsoY + 0.02, 0.10); }
    g.add(arm);
  }

  if (armed) {
    // Held across the body. A rifle is the single clearest "this one is a
    // threat" cue available at this scale, so it is chunky on purpose.
    const rifle = new THREE.Group();
    rifle.add(box(0.07, 0.07, 0.84, gear, 0, 0, 0));
    rifle.add(box(0.06, 0.16, 0.16, gear, 0, -0.10, -0.18));
    rifle.position.set(0.10, torsoY + 0.06, 0.28);
    rifle.rotation.set(0.12, -0.35, 0);
    g.add(rifle);
  } else {
    // BOUND WRISTS. This is the cue turns 5 to 7 are decided on, so it is
    // drawn to be legible from across the room rather than to be subtle: a
    // pale band at the wrists, and — for a seated figure — the tether running
    // back to the conduit the mission says they are tied to. A player who can
    // see the tie does not have to infer it from a sentence.
    const bindMat = new THREE.MeshStandardMaterial({
      color: 0xd8d2c4, roughness: 0.85, metalness: 0.05, flatShading: true,
    });
    const wrists = box(0.26, 0.10, 0.13, bindMat, 0, torsoY - 0.14, 0.41);
    g.add(wrists);

    if (seated) {
      // Tether back to the wall run. Thin, slack-looking, and deliberately
      // the same pale colour as the band so the two read as one restraint.
      const tether = box(0.05, 0.05, 0.52, bindMat, 0, torsoY - 0.16, 0.14);
      tether.rotation.x = 0.22;
      g.add(tether);
    }
  }

  return g;
}

// The ground marker under a figure. This is what makes them findable at
// tactical zoom, where a 1.7-unit figure is forty pixels tall.
function marker(color, { dashed = false } = {}) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, dashed ? 0.50 : 0.68, dashed ? 16 : 28, 1,
      0, dashed ? Math.PI * 2 : Math.PI * 2),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: dashed ? 0.55 : 1.0,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.renderOrder = 8;
  return ring;
}

// An unresolved contact. Not a person — a shape the sensors have registered
// and cannot classify. Drawn as a tall thin marker so it reads as "something
// is there" without telling the player what.
function unresolved() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe0a84c, transparent: true, opacity: 0.85, depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Spans 0.55 to 2.25 so the upper bars clear a 1.5-unit filing cabinet.
  // An unresolved contact the player cannot actually see is not a decision.
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.16), mat);
    bar.position.y = 0.55 + i * 0.42;
    bar.renderOrder = 9;
    g.add(bar);
    const bar2 = bar.clone();
    bar2.rotation.y = Math.PI / 2;
    g.add(bar2);
  }
  g.userData.bars = g.children;
  return g;
}

// The overhead indicator. A ring on the floor tells you where someone is; it
// does not survive a wall, a crate or a shallow camera. This does: a fat
// emissive chevron floating above the head, drawn with depth testing off so it
// stays legible through the compound, RED for armed and GREEN for a hostage.
//
// It is deliberately not amber — amber is the unresolved marker, and an
// unresolved contact never gets one of these.
function beacon(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.95,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  // Tip down, pointing at the head it belongs to.
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.52, 4), mat);
  cone.rotation.x = Math.PI;
  cone.rotation.y = Math.PI / 4;
  cone.position.y = 2.42;
  g.add(cone);
  // A bar over the cone widens the thing horizontally, which is the axis a
  // tactical camera has the most of.
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.10, 0.10), mat);
  bar.position.y = 2.82;
  g.add(bar);
  for (const m of g.children) m.renderOrder = 40;
  g.userData.mat = mat;
  g.userData.baseY = 0;
  return g;
}

const KIND = {
  hostile:  { palette: HOSTILE,  armed: true,  ring: 0xff3b30, beacon: 0xff3b30 },
  civilian: { palette: CIVILIAN, armed: false, ring: 0x3cf07a, beacon: 0x3cf07a },
};

export class Actors {
  constructor(scene, specs = []) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'actors';
    this.byId = new Map();

    for (const spec of specs) {
      const kind = KIND[spec.kind] || KIND.hostile;
      const holder = new THREE.Group();
      holder.name = `actor-${spec.id}`;

      const body = spec.state === 'unresolved'
        ? unresolved()
        : figure(kind.palette, { armed: kind.armed, pose: spec.pose || 'stand' });
      holder.add(body);

      const ring = marker(spec.state === 'unresolved' ? 0xe0a84c : kind.ring,
                          { dashed: spec.state === 'unresolved' });
      holder.add(ring);

      // Unresolved contacts do not get one: you have not been told what it is.
      let mark = null;
      if (spec.state !== 'unresolved') { mark = beacon(kind.beacon); holder.add(mark); }

      holder.position.set(spec.at[0], groundAt(spec.at[0], spec.at[1]), spec.at[1]);
      holder.rotation.y = spec.face ?? 0;
      holder.visible = false;
      this.group.add(holder);

      this.byId.set(spec.id, {
        spec, holder, body, ring, mark,
        kind: spec.kind, down: false, resolved: spec.state !== 'unresolved',
      });
    }

    scene.add(this.group);
    console.log(`[actors] ${this.byId.size} figures placed`);
  }

  // Show exactly the set this turn declares, and walk anyone whose circuit
  // moves them on.
  //
  // The walking is not decoration. A patrol that stands still while the squad
  // crosses the yard makes a liar of the turn that says "crosses in the gap,
  // no contact" — the board has to agree with the line, or the player is
  // being told one thing and shown another.
  // `flags` is the live GameState, so an actor can be gated on something the
  // player has actually done. The room's occupants are gated on the sweep:
  // before it they are not on the board at all, because the whole point of
  // the beat is that you cannot see into that room — you can only sense it.
  showForTurn(turnId, flags = {}) {
    for (const a of this.byId.values()) {
      // Anyone already down stays down and stays visible. The whole reason
      // for putting people on the board is that a decision leaves something
      // behind — hiding the body turns it back into a number changing.
      const gate = a.spec.requiresFlag;
      const allowed = !gate || !!flags[gate];
      const on = a.down || (allowed && (a.spec.turns || []).includes(turnId));

      if (on && !a.down) this.walkTo(a, turnId);

      if (a.holder.visible === on) continue;
      a.holder.visible = on;
      if (on) {
        a.holder.scale.setScalar(0.9);
        gsap.to(a.holder.scale, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'back.out(2)' });
      }
    }
  }

  // Move an actor to wherever its circuit puts it this turn. Walks if it is
  // already on screen, snaps if it is arriving.
  walkTo(a, turnId) {
    const step = a.spec.move?.[turnId];
    const at = step?.at || a.spec.at;
    const face = step?.face ?? a.spec.face ?? 0;
    const y = groundAt(at[0], at[1]);
    if (Math.abs(a.holder.position.x - at[0]) < 0.01
        && Math.abs(a.holder.position.z - at[1]) < 0.01) return;

    if (!a.holder.visible) {
      a.holder.position.set(at[0], y, at[1]);
      a.holder.rotation.y = face;
      return;
    }
    gsap.to(a.holder.position, { x: at[0], y, z: at[1], duration: 2.2, ease: 'none' });
    gsap.to(a.holder.rotation, { y: face, duration: 0.6, ease: 'power2.out' });
  }

  // Where an actor is right now — the Director aims tracers at this.
  positionOf(id) {
    const a = this.byId.get(id);
    return a ? a.holder.position : null;
  }

  // Turn 6: the figure behind the cabinet stands up and turns out to be a
  // person. Replacing the marker with a body IS the reveal, so it is one call.
  resolve(id, kind = 'civilian', pose = 'crouch') {
    const a = this.byId.get(id);
    if (!a || a.resolved) return;
    a.holder.remove(a.body);
    const k = KIND[kind] || KIND.civilian;
    a.body = figure(k.palette, { armed: k.armed, pose });
    a.holder.add(a.body);
    a.holder.remove(a.ring);
    a.ring = marker(k.ring);
    a.holder.add(a.ring);
    if (a.mark) a.holder.remove(a.mark);
    a.mark = beacon(k.beacon);
    a.holder.add(a.mark);
    a.resolved = true;
    a.kind = kind;
    a.holder.scale.setScalar(0.85);
    gsap.to(a.holder.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2)' });
  }

  // Taken down. Falls flat and stays on the board — a body you can still see
  // is the difference between a decision having a cost and a number changing.
  drop(id) {
    const a = this.byId.get(id);
    if (!a || a.down) return;
    a.down = true;
    gsap.to(a.holder.rotation, { x: -Math.PI / 2 * 0.86, duration: 0.5, ease: 'power2.in' });
    gsap.to(a.holder.position, { y: a.holder.position.y + 0.12, duration: 0.5 });
    gsap.to(a.ring.material, { opacity: 0.25, duration: 0.5 });
    if (a.mark) gsap.to(a.mark.userData.mat, { opacity: 0.22, duration: 0.5 });
  }

  // Everything a mission outcome can say about the people on the board.
  applyOutcome(outcome = {}) {
    for (const id of [].concat(outcome.dropActors || [])) this.drop(id);
    for (const [id, how] of Object.entries(outcome.resolveActors || {})) {
      this.resolve(id, how.kind, how.pose);
    }
  }

  // The compound knows. Hostages get moved out of the room the AI described —
  // which is the point: every reading the player was given about that room is
  // now stale, and they were told so only by the alarm going off.
  onAlarm() {
    let moved = 0;
    for (const a of this.byId.values()) {
      if (a.down || a.kind !== 'civilian') continue;
      // Herded toward the back of the building, away from the doorway.
      const dx = -1.6 - moved * 0.5;
      const dz = -2.2 - (moved % 2) * 0.8;
      const x = a.holder.position.x + dx;
      const z = a.holder.position.z + dz;
      gsap.to(a.holder.position, {
        x, y: groundAt(x, z), z, duration: 2.6, ease: 'power1.inOut',
      });
      moved += 1;
    }
    // Everyone still standing is now looking for you.
    for (const a of this.byId.values()) {
      if (a.down || a.kind !== 'hostile') continue;
      a.ring.material.color.setHex(0xff3b30);
      a.mark?.userData.mat.color.setHex(0xff3b30);
      gsap.to(a.ring.material, { opacity: 1, duration: 0.4, yoyo: true, repeat: 5 });
    }
    this.alarmed = true;
    return moved;
  }

  reset() {
    this.alarmed = false;
    for (const a of this.byId.values()) {
      a.down = false;
      a.holder.rotation.set(0, a.spec.face ?? 0, 0);
      a.holder.position.set(a.spec.at[0], groundAt(a.spec.at[0], a.spec.at[1]), a.spec.at[1]);
      a.holder.scale.setScalar(1);
      a.holder.visible = false;
      if (a.mark) a.mark.userData.mat.opacity = 0.95;
      a.ring.material.opacity = a.spec.state === 'unresolved' ? 0.55 : 1.0;
    }
  }

  // Unresolved contacts pulse, so an unclassified return never sits there
  // looking like a settled fact.
  update(t) {
    for (const a of this.byId.values()) {
      if (!a.holder.visible) continue;
      if (a.mark && !a.down) a.mark.position.y = Math.sin(t * 2.4) * 0.09;
      if (a.resolved) continue;
      const k = 0.65 + 0.35 * Math.sin(t * 3.2);
      for (const bar of a.body.children) bar.material.opacity = 0.35 + k * 0.5;
    }
  }
}

export function createActors(scene, specs) { return new Actors(scene, specs); }
