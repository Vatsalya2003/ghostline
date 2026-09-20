// What the commander knows about the ground, as data.
//
// DOM-free on purpose, the same way Gamepad.js is: the projection, the
// discovery test and every rule about what may be drawn are pure functions
// over plain objects, so `node scripts/map-test.mjs` can drive the whole
// surface without a browser. The canvas work lives in src/ui/TacticalMap.js
// and does nothing this file has not already decided.
//
// The one rule that matters here: THE MAP MAY NOT KNOW MORE THAN THE SQUAD.
// Mission data holds the truth about where the hostiles are; the map is given
// that truth and is expected not to draw it. A contact appears when the game
// says the squad found it, and it appears at the certainty the squad earned —
// a sensor return is a POSSIBLE contact, an eye on it is a CONFIRMED one.
// Drawing a hypothesis as a fact is the exact failure the mission is about.

// Marker kinds. The renderer picks a glyph per kind; nothing else branches.
export const MARKER = {
  UNIT: 'unit',
  DRONE: 'drone',
  OBJECTIVE: 'objective',
  PLACE: 'place',
  CONTACT: 'contact',
  HAZARD: 'hazard',
};

// How well the squad knows a thing. Ordered weakest to strongest — the
// renderer leans on that order, and so does upgrade().
export const CERTAINTY = {
  UNRESOLVED: 'unresolved',   // something is there, we cannot say what
  POSSIBLE: 'possible',       // a sensor says so; no eye on it
  CONFIRMED: 'confirmed',     // seen, or verified by the drone
  CLEARED: 'cleared',         // looked at, nothing there
};

const CERTAINTY_RANK = {
  [CERTAINTY.UNRESOLVED]: 0,
  [CERTAINTY.POSSIBLE]: 1,
  [CERTAINTY.CONFIRMED]: 2,
  [CERTAINTY.CLEARED]: 2,
};

// How a place got onto the map. A briefing is not an observation, and the
// renderer draws the difference — hollow for briefed, solid for seen.
export const SOURCE = {
  BRIEFED: 'briefed',         // the mission told us before we left
  OBSERVED: 'observed',       // the squad's own sensors
  DRONE: 'drone',             // recon sortie
  AI: 'ai',                   // the squad AI's assessment, which can be wrong
};

// Discovery is a 0..1 reading, not a boolean: the fog memory is a blurred
// stamp and its edges are genuinely partial. Anything at or above this counts
// as ground the squad has been given a look at.
export const KNOWN_AT = 0.28;

// ---------------------------------------------------------------- projection
// World (x, z) -> map pixels, and back. Held as a class because the full map
// pans and zooms and the minimap does not, and both want the same maths.
//
// `span` is how many world units the shorter axis of the view covers. Smaller
// span = closer in.
export class MapView {
  constructor({ width = 1, height = 1, span = 30, cx = 0, cz = 0 } = {}) {
    this.width = width;
    this.height = height;
    this.span = span;
    this.cx = cx;
    this.cz = cz;
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    return this;
  }

  // Pixels per world unit. Derived from the shorter axis so a wide panel shows
  // more ground sideways rather than squashing the board.
  get scale() { return Math.min(this.width, this.height) / this.span; }

  toScreen(x, z) {
    const s = this.scale;
    return [
      this.width / 2 + (x - this.cx) * s,
      this.height / 2 + (z - this.cz) * s,
    ];
  }

  toWorld(px, py) {
    const s = this.scale;
    return [
      this.cx + (px - this.width / 2) / s,
      this.cz + (py - this.height / 2) / s,
    ];
  }

  // Is this world point inside the view at all? Used to skip work and to keep
  // off-board markers from being drawn outside their panel.
  contains(x, z, margin = 0) {
    const [px, py] = this.toScreen(x, z);
    return px >= -margin && px <= this.width + margin
      && py >= -margin && py <= this.height + margin;
  }
}

// Zoom and pan limits. Far enough out to hold the whole board and a little
// air around it; close enough in to read one corner of the compound. Beyond
// either end the map stops being a map.
export function clampSpan(span, bounds) {
  const board = Math.max(bounds?.size ?? 30, 1);
  return Math.min(board * 1.25, Math.max(board * 0.18, span));
}

// Don't let the player drag the board off screen. You may pan until the edge
// of the view meets the edge of the board and no further, so a wide view that
// already holds everything is pinned to the middle and a tight one can still
// reach any corner of the compound.
export function clampCentre(cx, cz, span, bounds) {
  const board = Math.max(bounds?.size ?? 30, 1);
  const slack = Math.max(0, (board - span) / 2);
  return [
    Math.min(slack, Math.max(-slack, cx)),
    Math.min(slack, Math.max(-slack, cz)),
  ];
}

// ----------------------------------------------------------------- discovery
// The fog of war already keeps the authoritative record of what the squad has
// been given a look at: a greyscale memory canvas, black where nothing has
// swept. Rather than keep a second copy that could drift out of step with the
// 3D board, the map samples that same memory.
//
// `sample(px, py)` returns 0..1 for a pixel in that memory. The browser passes
// one backed by getImageData; the tests pass a fake. Nothing else differs.
export class Discovery {
  constructor({ sample = null, mem = 128, size = 30 } = {}) {
    this.sample = sample;
    this.mem = mem;
    this.size = size;
  }

  // Same mapping FogOfWar.toPixels uses. If the two ever disagree the map is
  // lying about the world, so it is written the one way on purpose.
  toPixels(x, z) {
    return [(0.5 + x / this.size) * this.mem, (0.5 + z / this.size) * this.mem];
  }

  // 0..1. With no sampler installed nothing is known — a map with no fog data
  // shows the briefing and the squad, not the whole compound.
  at(x, z) {
    if (!this.sample) return 0;
    const [px, py] = this.toPixels(x, z);
    if (px < 0 || py < 0 || px >= this.mem || py >= this.mem) return 0;
    return this.sample(Math.floor(px), Math.floor(py));
  }

  isKnown(x, z) { return this.at(x, z) >= KNOWN_AT; }
}

// ------------------------------------------------------------------- markers
// One marker, as the renderer receives it. Kept deliberately flat.
function marker({ id, kind, x, z, label = null, certainty = CERTAINTY.CONFIRMED,
                  source = SOURCE.OBSERVED, status = null, state = null,
                  radius = 0, known = true }) {
  return { id, kind, x, z, label, certainty, source, status, state, radius, known };
}

// A contact may only ever be strengthened, never quietly downgraded — once the
// drone has eyes on something, a later sensor guess does not make it doubtful
// again.
function upgrade(existing, next) {
  if (!existing) return next;
  return CERTAINTY_RANK[next.certainty] > CERTAINTY_RANK[existing.certainty] ? next : existing;
}

// ----------------------------------------------------------------- the model
// Assembles the marker list. Everything it draws from is passed in — it holds
// no opinion about which mission is running and no coordinates of its own.
export class MapModel {
  constructor({ bounds = { size: 30 }, discovery = new Discovery() } = {}) {
    this.bounds = bounds;
    this.discovery = discovery;
    this.contacts = new Map();     // id -> marker, accumulated as they are found
    this.hazards = new Map();
    this.droneTrack = null;        // { x, z, tx, tz } while a sortie is up
    this.visited = [];             // squad breadcrumb, for the route line
  }

  reset() {
    this.contacts.clear();
    this.hazards.clear();
    this.droneTrack = null;
    this.visited = [];
  }

  // --- things the game tells us it found -----------------------------------

  // A contact the squad has actually acquired. `certainty` is the caller's to
  // decide, because only the caller knows whether an eye or a sensor found it.
  addContact({ id, x, z, certainty = CERTAINTY.POSSIBLE, source = SOURCE.OBSERVED, label = null }) {
    const next = marker({ id, kind: MARKER.CONTACT, x, z, label, certainty, source });
    this.contacts.set(id, upgrade(this.contacts.get(id), next));
    return this.contacts.get(id);
  }

  // Hazards grow. A fire that has spread is the same hazard with a bigger
  // radius, not a second marker.
  addHazard({ id, x, z, radius = 1.5, label = null, state = null, source = SOURCE.OBSERVED }) {
    this.hazards.set(id, marker({
      id, kind: MARKER.HAZARD, x, z, label, radius, state, source,
      certainty: CERTAINTY.CONFIRMED,
    }));
    return this.hazards.get(id);
  }

  setDrone(track) { this.droneTrack = track; }

  // Breadcrumb of where the squad has actually been, thinned so a six-turn
  // mission does not accumulate a thousand points.
  trackSquad(x, z) {
    const last = this.visited[this.visited.length - 1];
    if (last && Math.hypot(x - last[0], z - last[1]) < 1.2) return;
    this.visited.push([x, z]);
    if (this.visited.length > 64) this.visited.shift();
  }

  // --- assembly ------------------------------------------------------------

  // Your own units are never fogged: you always know where your squad is, and
  // a lost unit keeps its last known position rather than vanishing.
  unitMarkers(units = []) {
    return units.map((u) => marker({
      id: u.id,
      kind: MARKER.UNIT,
      x: u.x,
      z: u.z,
      label: u.id,
      status: u.status || 'healthy',
      state: u.lost ? 'lost' : null,
      certainty: CERTAINTY.CONFIRMED,
    }));
  }

  // Briefed places — the objective, the entry point, the extraction. A
  // commander has these before the squad steps off, so they are always drawn;
  // what changes is whether the ground under them has actually been seen.
  placeMarkers(places = {}, { objective = null } = {}) {
    return Object.entries(places).map(([id, p]) => {
      const known = this.discovery.isKnown(p.x, p.z);
      return marker({
        id,
        kind: id === objective ? MARKER.OBJECTIVE : MARKER.PLACE,
        x: p.x,
        z: p.z,
        label: p.label || id,
        known,
        source: known ? SOURCE.OBSERVED : SOURCE.BRIEFED,
        certainty: known ? CERTAINTY.CONFIRMED : CERTAINTY.UNRESOLVED,
      });
    });
  }

  // Contacts and hazards are only ever drawn where the squad has been given a
  // look. Something found and then left behind stays on the map — you do not
  // forget a shooter because you walked away from them.
  foundMarkers() {
    return [...this.contacts.values(), ...this.hazards.values()];
  }

  droneMarker() {
    const d = this.droneTrack;
    if (!d) return null;
    return marker({
      id: 'DRONE',
      kind: MARKER.DRONE,
      x: d.x,
      z: d.z,
      label: 'DRONE',
      source: SOURCE.DRONE,
      certainty: CERTAINTY.CONFIRMED,
    });
  }

  // Everything the renderer should draw, in one pass.
  build({ units = [], places = {}, objective = null } = {}) {
    const out = [
      ...this.placeMarkers(places, { objective }),
      ...this.foundMarkers(),
      ...this.unitMarkers(units),
    ];
    const drone = this.droneMarker();
    if (drone) out.push(drone);
    return out;
  }
}
