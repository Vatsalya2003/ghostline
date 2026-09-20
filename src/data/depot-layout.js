// ============================================================================
// COMPOUND 14 — layout
// ============================================================================
//
// The geometry of the depot, as data. DepotLevel.js builds from this and
// nothing else; mission3.js names zones and never coordinates.
//
// The ten turns are a squad walking through ONE facility, so the layout is
// authored as a single contiguous footprint you can trace by eye:
//
//     OVERWATCH ─→ PERIMETER ─→ YARD ─→ HOLDING ─→ CORRIDOR ─→ AMMO_ROOM
//      outside      the gate    open     interior   interior    interior
//
// Walls are explicit segments with door gaps rather than per-room boxes,
// because adjoining rooms have to *share* an edge. Four rooms each building
// their own four walls gives you eight walls down the middle of the building
// and a visible seam wherever two of them meet.

// ---------------------------------------------------------------- zones

export const ZONES = {
  OVERWATCH: {
    id: 'OVERWATCH',
    label: 'SOUTH RISE',
    anchor: { x: -18, z: 14 },
    zoom: 22,
    bounds: { minX: -34, maxX: -9, minZ: 4, maxZ: 28 },
    interior: false,
  },
  PERIMETER: {
    id: 'PERIMETER',
    label: 'SERVICE GATE',
    anchor: { x: -7, z: 8 },
    zoom: 17,
    bounds: { minX: -14, maxX: 0, minZ: 2, maxZ: 14 },
    interior: false,
  },
  YARD: {
    id: 'YARD',
    label: 'THE YARD',
    anchor: { x: 4, z: 3 },
    zoom: 18,
    bounds: { minX: -9, maxX: 8, minZ: -4, maxZ: 13 },
    interior: false,
  },
  HOLDING: {
    id: 'HOLDING',
    label: 'HOLDING ROOM',
    anchor: { x: 9.5, z: -5 },
    // Tight, because turns 5 and 6 are decided on what is visible in this
    // room and nothing else. Turn 6 is the highest-stakes call in the game.
    zoom: 12,
    bounds: { minX: 4, maxX: 15, minZ: -10, maxZ: 0 },
    interior: true,
  },
  CORRIDOR: {
    id: 'CORRIDOR',
    label: 'SERVICE CORRIDOR',
    anchor: { x: 18.5, z: -7.5 },
    zoom: 11,
    bounds: { minX: 15, maxX: 22, minZ: -10, maxZ: -5 },
    interior: true,
  },
  AMMO_ROOM: {
    id: 'AMMO_ROOM',
    label: 'AMMUNITION ROOM',
    anchor: { x: 27, z: -12 },
    zoom: 15,
    bounds: { minX: 22, maxX: 32, minZ: -20, maxZ: -4 },
    interior: true,
  },
};

export const ZONE_ORDER = ['OVERWATCH', 'PERIMETER', 'YARD', 'HOLDING', 'CORRIDOR', 'AMMO_ROOM'];

export function zone(id) { return ZONES[id] || null; }

// ---------------------------------------------------------------- perimeter

// The wire. One closed run with a single service gate on the west face, which
// is the only way in and therefore the only way the route can start.
export const WIRE = { minX: -9, maxX: 33, minZ: -24, maxZ: 14 };
export const GATE = { x: -9, z: 7.5, width: 4.0 };

// ---------------------------------------------------------------- structures

// The building complex, authored as shared wall segments. `doors` are gaps,
// given as a fraction along the segment plus a width in metres.
//
// Segments 4 and 8 are the shared edges — HOLDING to CORRIDOR and CORRIDOR to
// AMMO_ROOM. Each is built once, with the connecting doorway in it.
export const WALLS = [
  // --- HOLDING
  { a: [4, 0], b: [15, 0], doors: [{ at: 0.30, width: 2.4 }], tag: 'holding-n' },
  { a: [4, 0], b: [4, -10], doors: [], tag: 'holding-w' },
  { a: [4, -10], b: [15, -10], doors: [], tag: 'holding-s' },
  { a: [15, 0], b: [15, -5], doors: [], tag: 'holding-e-upper' },

  // --- shared: HOLDING <-> CORRIDOR
  { a: [15, -5], b: [15, -10], doors: [{ at: 0.5, width: 2.2 }], tag: 'holding-corridor' },

  // --- CORRIDOR
  { a: [15, -5], b: [22, -5], doors: [], tag: 'corridor-n' },
  { a: [15, -10], b: [22, -10], doors: [], tag: 'corridor-s' },

  // --- shared: CORRIDOR <-> AMMO_ROOM
  { a: [22, -5], b: [22, -10], doors: [{ at: 0.5, width: 2.2 }], tag: 'corridor-ammo' },

  // --- AMMO_ROOM
  { a: [22, -4], b: [32, -4], doors: [], tag: 'ammo-n' },
  { a: [22, -4], b: [22, -5], doors: [], tag: 'ammo-w-upper' },
  { a: [22, -10], b: [22, -20], doors: [], tag: 'ammo-w-lower' },
  { a: [22, -20], b: [32, -20], doors: [], tag: 'ammo-s' },
  { a: [32, -4], b: [32, -20], doors: [], tag: 'ammo-e' },
];

// Roofs, keyed to the zone they cover so the camera can hide exactly one.
export const ROOMS = [
  { zone: 'HOLDING', bounds: { minX: 4, maxX: 15, minZ: -10, maxZ: 0 }, height: 3.4 },
  { zone: 'CORRIDOR', bounds: { minX: 15, maxX: 22, minZ: -10, maxZ: -5 }, height: 3.0 },
  { zone: 'AMMO_ROOM', bounds: { minX: 22, maxX: 32, minZ: -20, maxZ: -4 }, height: 4.2 },
];

// Outbuildings in the yard. Separate structures, deliberately — the yard has
// to read as open ground with things standing in it.
export const OUTBUILDINGS = [
  { id: 'guardhouse', bounds: { minX: -5, maxX: -0.5, minZ: 6, maxZ: 10.5 }, height: 2.8,
    doors: [{ wall: 'S', at: 0.5, width: 1.6 }] },
  { id: 'storage-block', bounds: { minX: -3, maxX: 3.5, minZ: -3.5, maxZ: 0.5 }, height: 3.2,
    doors: [{ wall: 'N', at: 0.7, width: 1.6 }] },
];

// ---------------------------------------------------------------- traversal

// Authored waypoint paths. No pathfinding anywhere in this project: the demo
// is rehearsed and has to replay identically, and a solver that picks a
// different route on a slow frame is exactly the kind of thing that ruins a
// live run. Every point here was placed by hand to clear a doorway.
export const PATHS = {
  'OVERWATCH>PERIMETER': [[-18, 14], [-14, 12], [-11, 9.5], [-9.6, 7.5]],
  // Crosses the SOUTH of the yard. The patrol works the north end, which is
  // where the forty-second gap is — so "crosses in the gap, no contact" has
  // to be a route that visibly stays away from them.
  'PERIMETER>YARD': [[-9.6, 7.5], [-6.5, 6.6], [-2.5, 4.0], [1.0, 2.2], [3.5, 1.5]],
  'YARD>HOLDING': [[3.5, 1.5], [6.2, 1.6], [7.3, 0.8], [7.3, -1.6], [8.6, -4]],
  'HOLDING>CORRIDOR': [[8.6, -4], [11.5, -6], [13.8, -7.5], [16.6, -7.5]],
  'CORRIDOR>AMMO_ROOM': [[16.6, -7.5], [20.5, -7.5], [23.2, -8.4], [25.5, -11.5]],
  // The way out, on the fuse. Back through the building and across the yard.
  'AMMO_ROOM>OVERWATCH': [[25.5, -11.5], [20.5, -7.5], [13.8, -7.5], [7.3, -1.6],
                          [3.5, 1.5], [-2.5, 4.0], [-9.6, 7.5], [-14, 11], [-18, 14]],
};

export function pathBetween(fromZone, toZone) {
  return PATHS[`${fromZone}>${toZone}`] || null;
}

// Formation. BETA-1 and BETA-2 hold station on ALPHA: one back and left, one
// back and right, in the frame of travel. Offsets rather than absolute points
// so the formation survives a rotated camera and a curved path, and they
// never stack on the lead.
export const FORMATION = {
  ALPHA: { side: 0, back: 0 },
  'BETA-1': { side: -1.7, back: 1.9 },
  'BETA-2': { side: 1.7, back: 1.9 },
};

// Where the squad stands at rest in each zone, as the lead unit's position.
export const ZONE_STAND = {
  OVERWATCH: [-18, 14],
  PERIMETER: [-9.6, 7.5],
  YARD: [3.5, 1.5],
  HOLDING: [8.6, -4],
  CORRIDOR: [16.6, -7.5],
  AMMO_ROOM: [25.5, -11.5],
};

// ---------------------------------------------------------------- hazard

// Where the fire lives, and where the smoke is at each stage. Visual only —
// no mechanics hang off this, it is the storyline's clock made visible.
export const FIRE_SOURCE = { x: 5.5, z: 8.5 };
export const SMOKE_STAGES = [
  { fromTurn: 7, at: { x: 18.5, z: -7.5 }, spread: 5.5, density: 0.55 },
  { fromTurn: 9, at: { x: 23.5, z: -9.5 }, spread: 7.5, density: 1.0 },
];

// ---------------------------------------------------------------- the people

// Who is on the board, where, and on which turns. Placed against the zones
// above, so they land in the rooms the mission actually talks about.
//
// The guards in the yard are on turns 3-4 because that is the security phase;
// the room is populated for 5-6 and the hostages stay visible afterwards,
// because "where did the hostages end up" is exactly what turn 8 asks the
// player to weigh and they should be able to look.
//
// `unresolved` is the sixth figure. It is deliberately NOT a civilian until
// the player resolves it — drawing a person there would answer the question
// the turn is asking.
export const ACTORS = [
  // No north-wall sentry on the board. Turn 2's drone still reports one
  // behind the storage block and ADVANCE still walks into him — but he stays
  // a report rather than a figure, because putting him on screen made three
  // enemies visible on the approach where the mission wants two.

  // --- the yard patrol, at their original posts. Kept here by request.
  { id: 'guard-a', kind: 'hostile', at: [1.5, 6.2], face: 2.3, turns: [3, 4] },
  { id: 'guard-b', kind: 'hostile', at: [-2.4, 4.0], face: 0.7, turns: [3, 4] },

  // --- turn 4: the contact at the east corner, half behind the crate stack.
  // Out at the corner rather than at the squad's elbow: at 1.1 m the line
  // "a third figure at the east corner" and the picture disagreed, and a
  // contact you need a drone to identify cannot be standing next to you.
  // Still an UNRESOLVED civilian rather than a guard — that is the design
  // brief, not a placement: he is a maintenance worker, and drawing him as
  // either thing answers the question turn 4 asks.
  { id: 'guard-cover', kind: 'civilian', state: 'unresolved', pose: 'crouch',
    at: [8.6, 3.4], face: 3.9, turns: [4, 5, 6, 7, 8, 9, 10, 11] },

  // --- INSIDE THE HOLDING ROOM ------------------------------------------
  //
  // Nobody here is on the board until the squad has sensed the room. That is
  // the whole point of the beat: you cannot see into it, you can only put
  // thermal and acoustic on the wall and reason about what comes back. Every
  // one of these carries `requiresFlag: 'roomSensed'`.
  //
  // Two armed men, posted in opposite corners, stationary. Stationary and
  // carrying is what the sensor read gives you, and stationary-and-carrying
  // in a room full of seated people is how you work out they are guards
  // without ever having seen one.
  { id: 'guard-corner-a', kind: 'hostile', at: [5.4, -1.6], face: 3.6,
    turns: [6], requiresFlag: 'roomSensed' },
  { id: 'guard-corner-b', kind: 'hostile', at: [13.4, -8.6], face: 0.6,
    turns: [6], requiresFlag: 'roomSensed' },

  // The four bound civilians. Low and still on thermal, which is the other
  // half of the read.
  { id: 'hostage-1', kind: 'civilian', pose: 'seated', at: [8.2, -6.6], face: 1.1,
    turns: [6, 7, 8, 9, 10, 11], requiresFlag: 'roomSensed' },
  { id: 'hostage-2', kind: 'civilian', pose: 'seated', at: [9.2, -7.6], face: 1.0,
    turns: [6, 7, 8, 9, 10, 11], requiresFlag: 'roomSensed' },
  { id: 'hostage-3', kind: 'civilian', pose: 'seated', at: [8.0, -8.5], face: 0.8,
    turns: [6, 7, 8, 9, 10, 11], requiresFlag: 'roomSensed' },
  { id: 'hostage-4', kind: 'civilian', pose: 'seated', at: [9.6, -9.0], face: 0.9,
    turns: [6, 7, 8, 9, 10, 11], requiresFlag: 'roomSensed' },

  // THE SIXTH FIGURE. The sweep finds a body and cannot classify it — small,
  // still, behind a filing cabinet, no metal on it and no clear outline. It
  // stays an unresolved contact through the breach and into turn 7, which is
  // the turn the whole mission is built on.
  { id: 'sixth', kind: 'civilian', state: 'unresolved', pose: 'crouch',
    at: [12.9, -6.6], face: 2.6, turns: [6, 7, 8, 9, 10, 11],
    requiresFlag: 'roomSensed' },

];
