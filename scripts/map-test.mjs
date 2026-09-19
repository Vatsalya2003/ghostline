// Headless tests for the tactical map's model. `node scripts/map-test.mjs`
//
// Why this exists: the map's job is to be *right about what the player knows*,
// and that is a claim about logic, not about pixels. MapModel.js is DOM-free
// for the same reason Gamepad.js is, so the projection, the discovery test and
// every rule about what may be drawn can be driven from Node against a fake
// fog memory.
//
// This proves the map cannot draw what the squad has not found. It does not
// prove the canvas puts the glyph on the right pixel — that needs a browser,
// and `scripts/e2e.mjs` covers it there.

import {
  MapModel, MapView, Discovery, MARKER, CERTAINTY, SOURCE, KNOWN_AT,
  clampSpan, clampCentre,
} from '../src/systems/MapModel.js';

let passed = 0, failed = 0;
const fails = [];

function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
function eq(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
function near(name, got, want, tol = 1e-6) {
  check(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}`);
}

// A fog memory with a disc of discovered ground stamped into it, shaped like
// the real one: 128 px over 30 world units, black = never swept.
function fakeFog(discs = [], { mem = 128, size = 30 } = {}) {
  return new Discovery({
    mem,
    size,
    sample: (px, py) => {
      for (const [wx, wz, r] of discs) {
        const cx = (0.5 + wx / size) * mem;
        const cy = (0.5 + wz / size) * mem;
        const rp = (r / size) * mem;
        if (Math.hypot(px - cx, py - cy) <= rp) return 1;
      }
      return 0;
    },
  });
}

const PLACES = {
  entry:      { x: 2.6, z: -0.4, label: 'ENTRY HALL' },
  relay:      { x: 5.5, z: -5.5, label: 'RELAY MAST' },
  extraction: { x: -6.5, z: 5.2, label: 'EXTRACTION' },
};

// ------------------------------------------------------------------ projection
{
  const v = new MapView({ width: 200, height: 200, span: 30 });
  eq('world origin lands at the centre of the view', v.toScreen(0, 0), [100, 100]);
  eq('+x is right and +z is down, matching the fog memory', v.toScreen(15, 15), [200, 200]);
  eq('-x/-z reaches the opposite corner', v.toScreen(-15, -15), [0, 0]);

  const [wx, wz] = v.toWorld(200, 200);
  near('toWorld inverts toScreen (x)', wx, 15);
  near('toWorld inverts toScreen (z)', wz, 15);

  const off = new MapView({ width: 200, height: 200, span: 30, cx: 5, cz: -5 });
  eq('panning the centre moves the world under it', off.toScreen(5, -5), [100, 100]);

  const zoomed = new MapView({ width: 200, height: 200, span: 15 });
  near('halving the span doubles the scale', zoomed.scale, 200 / 15);

  const wide = new MapView({ width: 400, height: 200, span: 30 });
  near('scale follows the shorter axis', wide.scale, 200 / 30);
  check('a wide panel shows more ground sideways', wide.contains(-25, 0));

  check('a point inside the view is contained', v.contains(0, 0));
  check('a point past the edge is not', !v.contains(40, 0));
}

// ----------------------------------------------------------------------- limits
{
  const bounds = { size: 30 };
  near('zoom stops before the board is a dot', clampSpan(999, bounds), 30 * 1.25);
  near('zoom stops before the map is meaningless', clampSpan(0.001, bounds), 30 * 0.18);
  near('a sensible span is left alone', clampSpan(12, bounds), 12);

  const [cx, cz] = clampCentre(500, -500, 8, bounds);
  check('panning cannot leave the board behind', Math.abs(cx) <= 15 && Math.abs(cz) <= 15);
  eq('a wide view is pinned to the middle', clampCentre(9, 9, 30, bounds), [0, 0]);
}

// -------------------------------------------------------------------- discovery
{
  const fog = fakeFog([[0, 0, 5]]);
  check('swept ground reads as known', fog.isKnown(0, 0));
  check('the edge of the sweep is still known', fog.isKnown(4, 0));
  check('ground nobody looked at is unknown', !fog.isKnown(12, 12));
  check('off the board is unknown, not an exception', !fog.isKnown(500, 500));
  near('the discovery reading is 0..1', fog.at(0, 0), 1);

  const blind = new Discovery();
  check('with no fog data nothing is known', !blind.isKnown(0, 0));
  check('KNOWN_AT is a partial threshold, not 1', KNOWN_AT > 0 && KNOWN_AT < 1);
}

// ------------------------------------------------------------ what may be drawn
{
  const m = new MapModel({ discovery: fakeFog([[2.6, -0.4, 4]]) });

  const places = m.placeMarkers(PLACES, { objective: 'relay' });
  const byId = Object.fromEntries(places.map((p) => [p.id, p]));

  check('the objective is marked as the objective', byId.relay.kind === MARKER.OBJECTIVE);
  check('other briefed places are plain places', byId.entry.kind === MARKER.PLACE);
  check('every briefed place is on the map', places.length === 3);

  check('ground the squad has swept reads as observed', byId.entry.source === SOURCE.OBSERVED);
  check('ground only the briefing knows reads as briefed', byId.relay.source === SOURCE.BRIEFED);
  check('a briefed-but-unseen place is not claimed as confirmed',
    byId.relay.certainty === CERTAINTY.UNRESOLVED);
  check('a seen place is confirmed', byId.entry.certainty === CERTAINTY.CONFIRMED);
  check('the unseen objective still carries its label', byId.relay.label === 'RELAY MAST');
}

// ------------------------------------------------- the map may not know too much
{
  const m = new MapModel({ discovery: fakeFog([[0, 0, 6]]) });

  // The whole point. Mission data knows where the shooters are; until the game
  // says the squad found them, the model has nothing to hand the renderer.
  eq('a contact nobody found is not on the map', m.foundMarkers(), []);

  m.addContact({ id: 'c1', x: 4.2, z: -0.6, certainty: CERTAINTY.POSSIBLE, source: SOURCE.AI });
  const found = m.foundMarkers();
  check('a found contact appears', found.length === 1);
  check('a sensor contact is possible, not confirmed', found[0].certainty === CERTAINTY.POSSIBLE);
  check('and it remembers the AI told us', found[0].source === SOURCE.AI);

  m.addContact({ id: 'c1', x: 4.2, z: -0.6, certainty: CERTAINTY.CONFIRMED, source: SOURCE.DRONE });
  check('eyes on it upgrades the same contact', m.foundMarkers()[0].certainty === CERTAINTY.CONFIRMED);
  check('upgrading does not duplicate the marker', m.foundMarkers().length === 1);

  m.addContact({ id: 'c1', x: 4.2, z: -0.6, certainty: CERTAINTY.POSSIBLE, source: SOURCE.AI });
  check('a later guess cannot un-confirm what was seen',
    m.foundMarkers()[0].certainty === CERTAINTY.CONFIRMED);

  m.addContact({ id: 'c2', x: 1.6, z: -1.8, certainty: CERTAINTY.CLEARED });
  check('a second contact is its own marker', m.foundMarkers().length === 2);
}

// ---------------------------------------------------------------------- hazards
{
  const m = new MapModel({ discovery: fakeFog([[0, 0, 30]]) });
  m.addHazard({ id: 'fire', x: 3, z: 3, radius: 1.5, state: 'smouldering' });
  eq('a hazard carries its extent', m.hazards.get('fire').radius, 1.5);

  m.addHazard({ id: 'fire', x: 3, z: 3, radius: 6, state: 'spreading' });
  check('a hazard that grows is the same marker', m.hazards.size === 1);
  eq('the hazard grew rather than duplicating', m.hazards.get('fire').radius, 6);
  eq('and its state moved with it', m.hazards.get('fire').state, 'spreading');
}

// ------------------------------------------------------------------ your squad
{
  const m = new MapModel({ discovery: fakeFog([]) });   // nothing swept at all
  const units = [
    { id: 'ALPHA', x: 0, z: 3, status: 'healthy' },
    { id: 'BETA-1', x: 2, z: 3, status: 'glitch' },
    { id: 'BETA-2', x: -2, z: 3, status: 'damaged', lost: true },
  ];
  const marks = m.unitMarkers(units);

  check('your own squad is never fogged', marks.length === 3);
  check('each unit is its own marker', new Set(marks.map((u) => u.id)).size === 3);
  check('a broken sensor shows on the marker', marks[1].status === 'glitch');
  check('a lost unit is still represented', marks[2].state === 'lost');
  check('a lost unit keeps its last known position', marks[2].x === -2 && marks[2].z === 3);
}

// ---------------------------------------------------------------------- drone
{
  const m = new MapModel({ discovery: fakeFog([]) });
  check('no sortie, no drone marker', m.droneMarker() === null);

  m.setDrone({ x: 1, z: 2, tx: 5, tz: -5 });
  const d = m.droneMarker();
  check('a drone in flight is on the map', d.kind === MARKER.DRONE);
  eq('at its live position', [d.x, d.z], [1, 2]);

  m.setDrone({ x: 3, z: 0, tx: 5, tz: -5 });
  eq('which moves as it flies', [m.droneMarker().x, m.droneMarker().z], [3, 0]);

  m.setDrone(null);
  check('and clears when the sortie ends', m.droneMarker() === null);
}

// ------------------------------------------------------------------- the route
{
  const m = new MapModel({ discovery: fakeFog([]) });
  m.trackSquad(0, 0);
  m.trackSquad(0, 0.3);
  eq('a squad standing still does not lay breadcrumbs', m.visited.length, 1);
  m.trackSquad(0, 4);
  eq('a squad that moved does', m.visited.length, 2);

  for (let i = 0; i < 200; i++) m.trackSquad(i * 2, 0);
  check('the trail is bounded', m.visited.length <= 64);
}

// ------------------------------------------------------------------- assembly
{
  const m = new MapModel({ discovery: fakeFog([[2.6, -0.4, 4]]) });
  m.addContact({ id: 'c1', x: 4.2, z: -0.6 });
  m.setDrone({ x: 0, z: 0, tx: 1, tz: 1 });
  const all = m.build({
    units: [{ id: 'ALPHA', x: 0, z: 3, status: 'healthy' }],
    places: PLACES,
    objective: 'relay',
  });

  const kinds = all.map((k) => k.kind);
  check('one pass returns every layer', kinds.includes(MARKER.UNIT)
    && kinds.includes(MARKER.CONTACT) && kinds.includes(MARKER.DRONE)
    && kinds.includes(MARKER.OBJECTIVE) && kinds.includes(MARKER.PLACE));
  check('units are drawn last, over the terrain furniture',
    kinds.lastIndexOf(MARKER.UNIT) > kinds.indexOf(MARKER.PLACE));
  check('every marker has a world position',
    all.every((k) => typeof k.x === 'number' && typeof k.z === 'number'));
  check('every marker has an id', all.every((k) => !!k.id));
}

// ---------------------------------------------------------------------- replay
{
  const m = new MapModel({ discovery: fakeFog([[0, 0, 10]]) });
  m.addContact({ id: 'c1', x: 4, z: 4 });
  m.addHazard({ id: 'fire', x: 1, z: 1 });
  m.setDrone({ x: 0, z: 0, tx: 1, tz: 1 });
  m.trackSquad(9, 9);

  m.reset();
  eq('replay forgets the contacts', m.contacts.size, 0);
  eq('replay forgets the hazards', m.hazards.size, 0);
  check('replay grounds the drone', m.droneMarker() === null);
  eq('replay forgets where the squad walked', m.visited.length, 0);
  eq('and the board is empty again', m.build({ places: {} }), []);
}

// ---------------------------------------------------------------- no hardcoding
{
  // The model is handed its geography. If it ever grows coordinates of its own
  // this fails, which is the point: a map that knows where the relay is cannot
  // be reused by a second mission.
  const m = new MapModel({ discovery: fakeFog([]) });
  eq('an empty mission draws an empty board', m.build({ places: {} }), []);

  const elsewhere = m.build({
    places: { rig: { x: -11, z: 9, label: 'RIG' } },
    objective: 'rig',
    units: [{ id: 'AUV-1', x: -11, z: 8, status: 'healthy' }],
  });
  check('a mission with different geography just works', elsewhere.length === 2);
  check('and its objective is the one it named',
    elsewhere.find((k) => k.kind === MARKER.OBJECTIVE).id === 'rig');
}

// ----------------------------------------------------------------- report
const total = passed + failed;
console.log(`\n${failed ? 'FAIL' : 'PASS'}  ${passed}/${total} map checks`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(failed ? 1 : 0);
