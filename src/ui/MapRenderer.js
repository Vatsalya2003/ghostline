// Draws a tactical map onto a 2D canvas. Shared by the HUD minimap and the
// full overlay — they differ by size, span and how much detail they ask for,
// not by code.
//
// Everything drawn here comes from MapModel. This file decides what a marker
// LOOKS like and nothing about whether it may be seen; if it is in the list it
// gets drawn. That split is deliberate — the rule about what the player knows
// is testable in Node, and the part that needs a browser is only ever paint.
//
// House style: sharp corners, 1px strokes, monospace, uppercase, no fills that
// are not doing work. It should read as a sensor console, not a street map.

import { MARKER, CERTAINTY, SOURCE } from '../systems/MapModel.js';
import { UNIT_BADGE } from '../render/Units.js';

export const PALETTE = {
  cyan: '#4ce0d8',
  amber: '#e0a84c',
  red: '#e0524c',
  dim: '#4a5a52',
  bg: '#0a0d0a',
  grid: 'rgba(76, 224, 216, 0.10)',
  gridMajor: 'rgba(76, 224, 216, 0.20)',
  unknown: 'rgba(6, 9, 8, 0.82)',
};

// Unit status -> colour. The same three colours the badges, the HUD chips and
// the sensor cones use; a robot must not be one colour in the world and
// another on the map.
const STATUS_COLOUR = {
  healthy: PALETTE.cyan,
  glitch: PALETTE.amber,
  damaged: PALETTE.red,
  lost: PALETTE.dim,
};

// The number the robot wears over its head in the 3D world, so the marker, the
// badge and the HUD chip are all the same character for the same unit.
function badgeOf(id, index) {
  return UNIT_BADGE[id] ?? String(index + 1);
}

function px(v) { return Math.round(v) + 0.5; }   // crisp 1px strokes

// ------------------------------------------------------------------- terrain
// A grid, not a graticule. Fine lines every `step` world units and a brighter
// one every fifth, so the eye can judge distance without anything being
// labelled.
function drawGrid(ctx, view, { step = 2 } = {}) {
  const [x0, z0] = view.toWorld(0, 0);
  const [x1, z1] = view.toWorld(view.width, view.height);
  const startX = Math.floor(x0 / step) * step;
  const startZ = Math.floor(z0 / step) * step;

  ctx.lineWidth = 1;
  for (let x = startX; x <= x1; x += step) {
    const [sx] = view.toScreen(x, 0);
    ctx.strokeStyle = x % (step * 5) === 0 ? PALETTE.gridMajor : PALETTE.grid;
    ctx.beginPath();
    ctx.moveTo(px(sx), 0);
    ctx.lineTo(px(sx), view.height);
    ctx.stroke();
  }
  for (let z = startZ; z <= z1; z += step) {
    const [, sy] = view.toScreen(0, z);
    ctx.strokeStyle = z % (step * 5) === 0 ? PALETTE.gridMajor : PALETTE.grid;
    ctx.beginPath();
    ctx.moveTo(0, px(sy));
    ctx.lineTo(view.width, px(sy));
    ctx.stroke();
  }
}

// The edge of the playable board, so "there is nothing over there" is visible
// rather than implied.
function drawBounds(ctx, view, bounds) {
  const half = (bounds?.size ?? 30) / 2;
  const [x0, y0] = view.toScreen(-half, -half);
  const [x1, y1] = view.toScreen(half, half);
  ctx.strokeStyle = 'rgba(76, 224, 216, 0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(px(x0), px(y0), x1 - x0, y1 - y0);
  ctx.setLineDash([]);
}

// Structure footprints — the compound, drawn as plan-view outlines. These are
// the shapes the level already has; nothing is invented here.
function drawFootprints(ctx, view, footprints = []) {
  for (const f of footprints) {
    const [cx, cy] = view.toScreen(f.x, f.z);
    const w = f.w * view.scale;
    const d = f.d * view.scale;
    ctx.save();
    ctx.translate(cx, cy);
    if (f.rot) ctx.rotate(f.rot);
    ctx.fillStyle = 'rgba(76, 224, 216, 0.06)';
    ctx.strokeStyle = 'rgba(76, 224, 216, 0.30)';
    ctx.lineWidth = 1;
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeRect(px(-w / 2), px(-d / 2), w, d);
    ctx.restore();
  }
}

// ----------------------------------------------------------------------- fog
// The undiscovered board, painted over everything drawn so far.
//
// This is the fog of war's own memory canvas — the same 128px greyscale the 3D
// veil samples — stretched over the view and used as a stencil. Using the
// source of truth rather than a copy is the only way the map and the world can
// be guaranteed to agree about what has been swept.
function drawFog(ctx, view, fogCanvas, bounds) {
  if (!fogCanvas) return;
  const half = (bounds?.size ?? 30) / 2;
  const [x0, y0] = view.toScreen(-half, -half);
  const [x1, y1] = view.toScreen(half, half);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  const scratch = drawFog.scratch ||= document.createElement('canvas');
  const sctx = scratch.getContext('2d');
  const sw = Math.max(1, Math.ceil(w));
  const sh = Math.max(1, Math.ceil(h));
  if (scratch.width !== sw || scratch.height !== sh) {
    scratch.width = sw;
    scratch.height = sh;
  }
  sctx.clearRect(0, 0, sw, sh);

  // Start opaque, then punch out everything the squad has discovered: the
  // memory is white where swept, so it erases exactly the swept ground.
  sctx.globalCompositeOperation = 'source-over';
  sctx.fillStyle = PALETTE.unknown;
  sctx.fillRect(0, 0, sw, sh);
  sctx.globalCompositeOperation = 'destination-out';
  sctx.drawImage(fogCanvas, 0, 0, sw, sh);
  sctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(scratch, x0, y0, w, h);

  // Outside the board is unknown too, and stays that way all mission.
  ctx.fillStyle = PALETTE.unknown;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, view.width, view.height);
  ctx.rect(x0, y0, w, h);
  ctx.fill('evenodd');
  ctx.restore();
}

// ---------------------------------------------------------------- sensors
// Live sensor coverage — what the squad can see *right now*, as opposed to the
// fog, which is everywhere it has ever looked. Drawing both is the whole idea
// of the game in one panel: a unit can be reporting confidently about ground
// its cone no longer covers.
//
// The facing maths is lifted from FogOfWar.stamp so the wedge on the map and
// the wedge stamped into the fog memory are the same wedge.
function drawCones(ctx, view, cones = []) {
  for (const c of cones) {
    const [x, y] = view.toScreen(c.x, c.z);
    const r = (c.range || 8.5) * view.scale;
    const facing = Math.PI / 2 - (c.heading || 0);
    const half = ((c.fov ?? 58) * Math.PI / 180) / 2;
    const broken = c.status === 'glitch';
    const colour = broken ? '224, 168, 76' : '76, 224, 216';

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, facing - half, facing + half);
    ctx.closePath();
    ctx.fillStyle = `rgba(${colour}, ${broken ? 0.07 : 0.10})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${colour}, ${broken ? 0.75 : 0.45})`;
    ctx.lineWidth = 1;
    // A broken cone is drawn broken: dashed edge, so it reads as unreliable
    // at a glance rather than only by its colour.
    if (broken) ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.restore();
  }
}

// --------------------------------------------------------------------- route
// Where the squad has actually walked. A memory of the route, not a plan.
function drawRoute(ctx, view, points = []) {
  if (points.length < 2) return;
  ctx.strokeStyle = 'rgba(76, 224, 216, 0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  points.forEach(([x, z], i) => {
    const [sx, sy] = view.toScreen(x, z);
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

// A line from the squad to the objective: which way is the job, and how far.
function drawBearing(ctx, view, from, to) {
  if (!from || !to) return;
  const [ax, ay] = view.toScreen(from.x, from.z);
  const [bx, by] = view.toScreen(to.x, to.z);
  ctx.strokeStyle = 'rgba(224, 168, 76, 0.30)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ------------------------------------------------------------------- glyphs
function diamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

function triangle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.9, y + r * 0.7);
  ctx.lineTo(x - r * 0.9, y + r * 0.7);
  ctx.closePath();
}

function cross(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
}

function label(ctx, x, y, text, colour, { size = 8, align = 'center' } = {}) {
  if (!text) return;
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colour;
  ctx.fillText(String(text).toUpperCase(), x, y);
}

// ------------------------------------------------------------------ markers
function drawUnit(ctx, view, m, index, { detail }) {
  const [x, y] = view.toScreen(m.x, m.z);
  const lost = m.state === 'lost';
  const colour = lost ? STATUS_COLOUR.lost : (STATUS_COLOUR[m.status] || PALETTE.cyan);
  const r = detail ? 7 : 5;

  ctx.lineWidth = 1;
  ctx.strokeStyle = colour;
  ctx.fillStyle = lost ? 'transparent' : 'rgba(10, 13, 10, 0.85)';

  // A square carrying the badge number, the same number the robot wears in the
  // world and in the HUD chip.
  ctx.beginPath();
  ctx.rect(px(x - r), px(y - r), r * 2, r * 2);
  if (!lost) ctx.fill();
  ctx.stroke();

  if (lost) {
    // A lost unit stays on the board at its last known position, struck
    // through. Vanishing would quietly rewrite what happened.
    ctx.strokeStyle = PALETTE.red;
    cross(ctx, x, y, r * 0.8);
    ctx.stroke();
  } else {
    label(ctx, x, y + 0.5, badgeOf(m.id, index), colour, { size: detail ? 9 : 8 });
  }

  // A broken sensor gets a ring, so the unit you cannot trust is findable on
  // the map without reading the colour.
  if (m.status === 'glitch') {
    ctx.strokeStyle = PALETTE.amber;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (detail) label(ctx, x, y + r + 8, m.label, colour, { size: 8 });
}

function drawObjective(ctx, view, m, { detail }) {
  const [x, y] = view.toScreen(m.x, m.z);
  const seen = m.source !== SOURCE.BRIEFED;
  const r = detail ? 8 : 6;
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.amber;
  diamond(ctx, x, y, r);
  if (seen) {
    ctx.fillStyle = 'rgba(224, 168, 76, 0.35)';
    ctx.fill();
  } else {
    // Briefed but never actually observed: hollow, and dashed. The commander
    // was told it is there. Nobody has looked.
    ctx.setLineDash([2, 2]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(224, 168, 76, 0.45)';
  ctx.beginPath();
  ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.stroke();

  if (detail) label(ctx, x, y + r + 10, m.label, PALETTE.amber);
}

function drawPlace(ctx, view, m, { detail }) {
  const [x, y] = view.toScreen(m.x, m.z);
  const seen = m.source !== SOURCE.BRIEFED;
  const colour = seen ? PALETTE.cyan : PALETTE.dim;
  const r = detail ? 4 : 3;
  ctx.lineWidth = 1;
  ctx.strokeStyle = colour;
  if (!seen) ctx.setLineDash([2, 2]);
  ctx.strokeRect(px(x - r), px(y - r), r * 2, r * 2);
  ctx.setLineDash([]);
  if (detail) label(ctx, x, y + r + 8, m.label, colour);
}

function drawContact(ctx, view, m, { detail }) {
  const [x, y] = view.toScreen(m.x, m.z);
  const r = detail ? 6 : 4.5;
  ctx.lineWidth = 1;

  if (m.certainty === CERTAINTY.CONFIRMED) {
    // Seen. This one is real and the map is allowed to say so.
    ctx.strokeStyle = PALETTE.red;
    cross(ctx, x, y, r);
    ctx.stroke();
    if (detail) label(ctx, x, y + r + 9, 'HOSTILE', PALETTE.red);
    return;
  }
  if (m.certainty === CERTAINTY.CLEARED) {
    ctx.strokeStyle = PALETTE.dim;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (detail) label(ctx, x, y + r + 9, 'CLEARED', PALETTE.dim);
    return;
  }

  // Everything else is a hypothesis, and has to look like one: a hollow
  // dashed triangle with a question over it, never the confirmed glyph.
  ctx.strokeStyle = PALETTE.amber;
  ctx.setLineDash([2, 2]);
  triangle(ctx, x, y, r);
  ctx.stroke();
  ctx.setLineDash([]);
  if (detail) {
    label(ctx, x, y + r + 10,
      m.certainty === CERTAINTY.UNRESOLVED ? 'UNRESOLVED' : 'POSSIBLE', PALETTE.amber);
  }
}

function drawHazard(ctx, view, m, { detail }) {
  const [x, y] = view.toScreen(m.x, m.z);
  const r = Math.max(4, (m.radius || 1.5) * view.scale);

  // The extent is the point: a hazard is an area you cannot route through,
  // not a pin. It grows as the mission does.
  ctx.fillStyle = 'rgba(224, 82, 76, 0.13)';
  ctx.strokeStyle = 'rgba(224, 82, 76, 0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = PALETTE.red;
  triangle(ctx, x, y, detail ? 6 : 4.5);
  ctx.stroke();
  label(ctx, x, y + (detail ? 2 : 1.5), '!', PALETTE.red, { size: detail ? 8 : 7 });
  if (detail && m.label) label(ctx, x, y + r + 10, m.label, PALETTE.red);
}

function drawDrone(ctx, view, m, track, { detail }) {
  const [x, y] = view.toScreen(m.x, m.z);

  // Where it was sent. "I sent the drone THERE" has to be visible while it is
  // still on its way.
  if (track && typeof track.tx === 'number') {
    const [tx, ty] = view.toScreen(track.tx, track.tz);
    ctx.strokeStyle = 'rgba(76, 224, 216, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(tx, ty, detail ? 7 : 5, 0, Math.PI * 2);
    ctx.stroke();
    cross(ctx, tx, ty, detail ? 3.5 : 2.5);
    ctx.stroke();
    if (detail) label(ctx, tx, ty + 16, 'SCAN', PALETTE.cyan);
  }

  const r = detail ? 6 : 4.5;
  ctx.strokeStyle = PALETTE.cyan;
  ctx.fillStyle = 'rgba(10, 13, 10, 0.9)';
  ctx.lineWidth = 1;
  diamond(ctx, x, y, r);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r - 3, y);
  ctx.lineTo(x + r + 3, y);
  ctx.stroke();
  if (detail) label(ctx, x, y - r - 8, 'DRONE', PALETTE.cyan);
}

// -------------------------------------------------------------------- draw
// One frame. `detail` turns on labels and larger glyphs — off for the minimap,
// on for the overlay, which is the only difference between the two.
export function drawMap(ctx, {
  view,
  markers = [],
  fogCanvas = null,
  bounds = { size: 30 },
  footprints = [],
  route = [],
  cones = [],
  droneTrack = null,
  detail = false,
  grid = true,
} = {}) {
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, view.width, view.height);

  if (grid) drawGrid(ctx, view, { step: detail ? 2 : 5 });
  drawFootprints(ctx, view, footprints);
  drawRoute(ctx, view, route);

  // Fog goes over the terrain and under the markers: the squad's own icons are
  // never hidden by it, but the ground they have not swept is.
  drawFog(ctx, view, fogCanvas, bounds);
  // Over the fog: coverage is what the squad has *now*, not what it remembers.
  drawCones(ctx, view, cones);
  drawBounds(ctx, view, bounds);

  const objective = markers.find((m) => m.kind === MARKER.OBJECTIVE);
  const lead = markers.find((m) => m.kind === MARKER.UNIT);
  if (detail) drawBearing(ctx, view, lead, objective);

  let unitIndex = 0;
  for (const m of markers) {
    switch (m.kind) {
      case MARKER.PLACE: drawPlace(ctx, view, m, { detail }); break;
      case MARKER.OBJECTIVE: drawObjective(ctx, view, m, { detail }); break;
      case MARKER.HAZARD: drawHazard(ctx, view, m, { detail }); break;
      case MARKER.CONTACT: drawContact(ctx, view, m, { detail }); break;
      case MARKER.DRONE: drawDrone(ctx, view, m, droneTrack, { detail }); break;
      case MARKER.UNIT: drawUnit(ctx, view, m, unitIndex++, { detail }); break;
      default: break;
    }
  }
}
