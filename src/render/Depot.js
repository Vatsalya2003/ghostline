import * as THREE from 'three';
import {
  WIRE, GATE, FIRE_SOURCE, WALLS, ROOMS, OUTBUILDINGS, PATHS, ZONES,
} from '../data/depot-layout.js';
import { textureSet, renderTier, triplanarMaterial } from './Textures.js';

// ============================================================================
// COMPOUND 14 — the ground, built for AMMUNITION DEPOT
// ============================================================================
//
// One continuous place. The mission walks a single diagonal from outside the
// wire in the south-west to the ammunition bunker in the east, and the ground
// has to carry that walk without a cut:
//
//   (-9,  9)  the south rise        turn 1  — raised, scrub, outside the wire
//   (-3,  4)  the north wall        turn 2  — the storage block occludes it
//   ( 1,  3)  the yard              turn 3  — open hardstanding, patrol circuit
//   ( 5,  0)  the east corner       turn 4  — crate stacks, half cover
//   ( 8, -5)  the west room         turns 5-6 — inside the main building
//   (12, -3)  the service corridor  turn 7  — generator hall, EM
//   (16, -9)  the ammunition room   turns 8-9 — the objective
//
// The ground itself tells you where the wire is: scrub and dirt outside,
// compacted hardstanding inside, and vehicle tracks running from the gate to
// every building that has ever taken a delivery. You should be able to see
// the shape of the compound with every structure deleted.
//
// ---------------------------------------------------------------------------
// HOW THE SURFACE IS BUILT — three scales, none of which repeat together
// ---------------------------------------------------------------------------
//
//   MACRO   a 1536px canvas covering the whole 180 m board, so it cannot tile
//           by construction. It carries ZONE IDENTITY: which patch of ground
//           you are standing on, and everything that has happened to it —
//           hardstanding, gravel apron, scraped soil at the wall bases, ruts,
//           the worn fan outside every doorway, fuel staining, dry grass.
//           Every coordinate it uses comes out of src/data/depot-layout.js.
//
//   SPLAT   a 640px RGBA companion that says which real PBR set belongs where
//           (R gravel, G dust/sand, B compaction, A organic) so the shader can
//           blend three surfaces rather than tinting one.
//
//   MICRO   the CC0 dirt/gravel/sand sets, sampled in WORLD space at about a
//           four-metre repeat. A single repeat at that size tiles obviously,
//           so the soil is sampled TWICE — once straight and once transposed
//           and 2.4x coarser — and crossfaded by a slow noise. Two grids that
//           never line up have no period for the eye to find.
//
// The three multiply together. None of them is allowed to darken the board:
// the micro detail is divided by each set's measured mean albedo first, so it
// contributes grain and relief and not a stop of exposure.

export const DEPOT_SIZE = 180;

const rand = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => rand(a * 157.31 + b * 311.7);
  return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) +
         h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v;
}

function fbm(x, y, octaves = 4) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * freq, y * freq) * amp;
    norm += amp; amp *= 0.5; freq *= 2.07;
  }
  return sum / norm;
}

const smoothstep = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;

// GLSL argument order, and — unlike THREE.MathUtils.smoothstep — it ramps the
// other way when edge0 > edge1. Half the fields below are "fades out as the
// distance grows", which that version silently returns 0 for.
const sstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- geography

// The wire and the gate come from the layout data — one source of truth, so
// the ground's hardstanding edge and the wall that stands on it cannot drift
// apart.
export { WIRE, GATE };

// Vehicle tracks: gate to yard, yard to the building complex, yard to the
// fuel store. Regular, worn, and going somewhere — the thing that says "this
// place is used" rather than "this place was generated".
export const TRACKS = [
  [new THREE.Vector2(-18, 8), new THREE.Vector2(GATE.x, GATE.z),
   new THREE.Vector2(-3, 5), new THREE.Vector2(3, 2)],
  [new THREE.Vector2(3, 2), new THREE.Vector2(10, -1.5), new THREE.Vector2(19, -2.5),
   new THREE.Vector2(27, -3)],
  [new THREE.Vector2(3, 2), new THREE.Vector2(FIRE_SOURCE.x, FIRE_SOURCE.z)],
];

// How far inside the wire a point is. Negative outside, positive inside.
export function insideWire(x, z) {
  const dx = Math.min(x - WIRE.minX, WIRE.maxX - x);
  const dz = Math.min(z - WIRE.minZ, WIRE.maxZ - z);
  // Warped boundary. A clean rectangle comes out as a hard-edged pale diamond
  // stamped on the hillside — it was the single most artificial thing on the
  // map. Graded ground spills unevenly and gets driven over at the edges.
  const wob = (fbm(x * 0.085 + 17, z * 0.085 - 5, 2) - 0.5) * 2.8;
  return Math.min(dx, dz) + wob;
}

function segDist(x, z, a, b) {
  const abx = b.x - a.x, abz = b.y - a.y;
  const t = clamp(((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz), 0, 1);
  return Math.hypot(x - (a.x + abx * t), z - (a.y + abz * t));
}

function polylineDistance(lines, x, z) {
  let d = Infinity;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      d = Math.min(d, segDist(x, z, line[i], line[i + 1]));
    }
  }
  return d;
}

export function trackDistance(x, z) {
  return polylineDistance(TRACKS, x, z);
}

// --- what the mission actually walks on -------------------------------------
//
// PATHS is the authored route. A route that has been walked a hundred times
// before the mission starts is a worn line in the dust, narrower than a
// vehicle track and not in the same place. The return leg retraces the
// outbound one, so it is skipped rather than counted twice.
const FOOT_LINES = Object.entries(PATHS)
  .filter(([k]) => !k.startsWith('AMMO_ROOM>'))
  .map(([, pts]) => pts.map(([x, z]) => new THREE.Vector2(x, z)));

export function pathDistance(x, z) {
  return polylineDistance(FOOT_LINES, x, z);
}

// --- what is standing on it -------------------------------------------------

// Room and outbuilding footprints, straight from the layout. The ground reacts
// to them: soil scraped bare where a wall shades it, a dark drip line under
// the roof edge, and a gravel apron out to a couple of metres.
const FOOTPRINTS = [
  ...ROOMS.map((r) => r.bounds),
  ...OUTBUILDINGS.map((o) => o.bounds),
];

function rectDistance(x, z, b) {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  if (dx > 0 || dz > 0) return Math.hypot(dx, dz);
  return -Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
}

export function structureDistance(x, z) {
  let d = Infinity;
  for (const b of FOOTPRINTS) d = Math.min(d, rectDistance(x, z, b));
  return d;
}

// --- where people go in and out ---------------------------------------------
//
// Every door gap in the layout, plus the service gate. A doorway is the one
// place on a compound where the ground is polished rather than churned: it is
// walked on constantly and driven on never.
function doorPoints() {
  const out = [];
  for (const seg of WALLS) {
    const [ax, az] = seg.a, [bx, bz] = seg.b;
    for (const d of seg.doors || []) {
      out.push([ax + (bx - ax) * d.at, az + (bz - az) * d.at]);
    }
  }
  for (const o of OUTBUILDINGS) {
    const b = o.bounds;
    const sides = {
      N: [[b.minX, b.maxZ], [b.maxX, b.maxZ]],
      S: [[b.minX, b.minZ], [b.maxX, b.minZ]],
      W: [[b.minX, b.minZ], [b.minX, b.maxZ]],
      E: [[b.maxX, b.minZ], [b.maxX, b.maxZ]],
    };
    for (const d of o.doors || []) {
      const [p, q] = sides[d.wall] || sides.S;
      out.push([p[0] + (q[0] - p[0]) * d.at, p[1] + (q[1] - p[1]) * d.at]);
    }
  }
  out.push([GATE.x, GATE.z]);
  return out;
}

export const DOORS = doorPoints();

function doorDistance(x, z) {
  let d = Infinity;
  for (const [dx, dz] of DOORS) d = Math.min(d, Math.hypot(x - dx, z - dz));
  return d;
}

// --- where things leak ------------------------------------------------------
//
// FIRE_SOURCE is the fuel store: the storyline sets it alight on turn 7, so
// it is where the drums are, and drums leak. The gate apron and the yard
// junction are where vehicles idle; (27, -3) is the head of the delivery
// track at the ammunition room. Radius in metres.
const OIL_SOURCES = [
  [FIRE_SOURCE.x, FIRE_SOURCE.z, 3.4, 1.0],
  [GATE.x + 2.6, GATE.z, 2.8, 0.7],
  [3, 2, 3.6, 0.8],
  [26.5, -3.2, 3.0, 0.7],
];

// ---------------------------------------------------------------- elevation

export function depotHeight(x, z) {
  // The hillside the compound was cut into. High to the south-west — which is
  // why overwatch on turn 1 can see over the wall at all — falling away east.
  let h = (fbm(x * 0.013 + 4, z * 0.013 - 2, 3) - 0.5) * 4.2;
  h += (-x * 0.055 + z * 0.045) * 1.15;

  // Mid-scale ground: erosion gullies and spoil, only outside the wire.
  h += (fbm(x * 0.07 - 6, z * 0.07 + 3, 2) - 0.5) * 0.9;

  // The cut-and-fill platform. A compound is bulldozed level before anything
  // is built on it, and that hard flat edge against a sloping hillside is the
  // single clearest "people did this" signal on the whole map.
  const inside = insideWire(x, z);
  const pad = smoothstep(inside, -1.4, 1.6);
  h = h * (1 - pad) + 0.18 * pad;

  // The gate apron stays flat right through the wall line, so vehicles are
  // not driving up a step to get in.
  const gd = Math.hypot(x - GATE.x, z - GATE.z);
  h = h * (1 - Math.exp(-Math.pow(gd / 4.0, 2)) * 0.85) + Math.exp(-Math.pow(gd / 4.0, 2)) * 0.85 * 0.18;

  // Spoil berm thrown up along the outside of the cut.
  h += Math.exp(-Math.pow((inside + 1.6) / 1.5, 2)) * 0.55 * smoothstep(-inside, -2.5, 1.0);

  // Worn tracks: compacted, slightly sunk, with a crown between the ruts.
  const td = trackDistance(x, z);
  h -= Math.exp(-Math.pow(td / 1.5, 2)) * 0.13;
  h += Math.exp(-Math.pow(td / 0.32, 2)) * 0.045;

  return h;
}

// ---------------------------------------------------------------- material

// Zone colours, in sRGB bytes. Every one of these is a real patch of ground
// somewhere on the compound rather than a shade of the same beige, and the
// blend between any two of them is a smoothstep over metres — there is no
// hard edge anywhere on the board except the one the bulldozer cut.
const C = {
  soilWarm:  [170, 141, 101],   // the dry hillside, sun side
  soilCool:  [139, 128, 108],   // the same hillside where it holds moisture
  grassDry:  [143, 134,  86],   // burnt-off grass, late in the season
  pan:       [136, 133, 122],   // graded hardstanding inside the wire
  gravel:    [154, 151, 143],   // crushed stone apron around the buildings
  scraped:   [120,  99,  73],   // soil turned over and never re-grown
  road:      [106,  90,  69],   // compacted vehicle route
  rut:       [ 84,  71,  54],   // the two wheel lines inside it
  wear:      [163, 157, 143],   // polished ground outside a doorway
  dust:      [188, 180, 160],   // ammunition-handling dust film
  oil:       [ 38,  32,  26],   // spilt fuel, soaked in
};

const AMMO_BOUNDS = ZONES.AMMO_ROOM.bounds;

// Field resolution for the zone pass. 640 over 180 m is 28 cm a cell, which
// resolves a wheel rut and costs a fraction of evaluating five distance
// fields per pixel of a 1536px canvas.
const FIELD = 640;

function buildZoneFields(G) {
  const n = G * G;
  const cr = new Float32Array(n), cg = new Float32Array(n), cb = new Float32Array(n);
  const sR = new Float32Array(n), sG = new Float32Array(n);
  const sB = new Float32Array(n), sA = new Float32Array(n);

  for (let j = 0; j < G; j++) {
    const wz = (j / (G - 1)) * DEPOT_SIZE - DEPOT_SIZE / 2;
    for (let i = 0; i < G; i++) {
      const wx = (i / (G - 1)) * DEPOT_SIZE - DEPOT_SIZE / 2;
      const k = j * G + i;

      const inside = insideWire(wx, wz);
      const td = trackDistance(wx, wz);
      const pd = pathDistance(wx, wz);
      const sd = structureDistance(wx, wz);
      const dd = doorDistance(wx, wz);

      const tone  = fbm(wx * 0.011 - 9, wz * 0.011 + 21, 2);   // which soil
      const shade = fbm(wx * 0.033 + 1, wz * 0.033 + 5, 3);    // old macro noise
      const grass = fbm(wx * 0.085 + 31, wz * 0.085 - 13, 3);  // where it grows
      const mottle = fbm(wx * 0.26 - 4, wz * 0.26 + 8, 2);     // fine soil break

      // --- 1. the hillside. Two soils, not one beige.
      const t = sstep(0.36, 0.68, tone);
      let r = C.soilWarm[0] * (1 - t) + C.soilCool[0] * t;
      let g = C.soilWarm[1] * (1 - t) + C.soilCool[1] * t;
      let b = C.soilWarm[2] * (1 - t) + C.soilCool[2] * t;
      const lift = (shade - 0.5) * 40;
      r += lift; g += lift * 0.86; b += lift * 0.7;

      // --- 2. dry grass, only outside the wire and off the tracks.
      const out = sstep(0.4, 4.5, -inside);
      const gw = sstep(0.50, 0.80, grass) * out * sstep(1.6, 4.0, td);
      r += (C.grassDry[0] - r) * gw * 0.62;
      g += (C.grassDry[1] - g) * gw * 0.62;
      b += (C.grassDry[2] - b) * gw * 0.62;

      // --- 3. inside the wire it is graded hardstanding.
      const pad = sstep(-0.5, 1.8, inside);
      r += (C.pan[0] - r) * pad * 0.84;
      g += (C.pan[1] - g) * pad * 0.84;
      b += (C.pan[2] - b) * pad * 0.84;

      // --- 4. crushed-stone apron: out to 7 m of a building, and a big one
      // at the gate where every delivery stops. The outer edge is warped by
      // several metres of noise — stone gets spread by shovel and then kicked
      // about for a decade, and an apron that is a perfect offset of the
      // building it surrounds is the giveaway that nobody spread it.
      const gateD = Math.hypot(wx - GATE.x, wz - GATE.z);
      const apronEdge = sd + (fbm(wx * 0.13 + 44, wz * 0.13 - 8, 2) - 0.5) * 4.4;
      const apron = clamp(pad * (sstep(7.0, 1.0, apronEdge) * 0.9
        + Math.exp(-Math.pow(gateD / 5.5, 2)) * 0.8), 0, 1);
      r += (C.gravel[0] - r) * apron * 0.55;
      g += (C.gravel[1] - g) * apron * 0.55;
      b += (C.gravel[2] - b) * apron * 0.55;

      // --- 5. bare scraped soil hard against every wall, and the dark drip
      // line the roof edge has been pouring onto for years.
      const scrape = sd > 0 ? sstep(2.6, 0.1, sd) : 0;
      r += (C.scraped[0] - r) * scrape * 0.5;
      g += (C.scraped[1] - g) * scrape * 0.5;
      b += (C.scraped[2] - b) * scrape * 0.5;
      const drip = sd > 0 ? Math.exp(-Math.pow((sd - 0.4) / 0.3, 2)) : 0;
      r *= 1 - drip * 0.22; g *= 1 - drip * 0.22; b *= 1 - drip * 0.2;

      // --- 6. the perimeter wall does the same thing at a smaller scale.
      const wall = Math.exp(-Math.pow(inside / 1.2, 2));
      r += (C.scraped[0] - r) * wall * 0.3;
      g += (C.scraped[1] - g) * wall * 0.3;
      b += (C.scraped[2] - b) * wall * 0.3;

      // --- 7. vehicle route, worn down to compacted dirt, with two ruts.
      const track = Math.exp(-Math.pow(td / 1.35, 2));
      r += (C.road[0] - r) * track * 0.66;
      g += (C.road[1] - g) * track * 0.66;
      b += (C.road[2] - b) * track * 0.66;
      const rutW = Math.exp(-Math.pow((td - 0.62) / 0.24, 2));
      r += (C.rut[0] - r) * rutW * 0.55;
      g += (C.rut[1] - g) * rutW * 0.55;
      b += (C.rut[2] - b) * rutW * 0.55;

      // --- 8. the line people walk. Narrower than a tyre and not where the
      // tyres go — this is the route the mission itself takes.
      const foot = Math.exp(-Math.pow(pd / 0.85, 2)) * sstep(-2.0, 0.5, inside);
      r += (C.road[0] - r) * foot * 0.3;
      g += (C.road[1] - g) * foot * 0.3;
      b += (C.road[2] - b) * foot * 0.3;

      // --- 9. the fan of polished ground outside every door and the gate.
      const door = Math.exp(-Math.pow(dd / 1.7, 2));
      r += (C.wear[0] - r) * door * 0.4;
      g += (C.wear[1] - g) * door * 0.4;
      b += (C.wear[2] - b) * door * 0.4;

      // --- 10. ammunition handling. Everything within reach of the magazine
      // door carries a pale film of it.
      const ammo = sstep(11.0, 1.0, rectDistance(wx, wz, AMMO_BOUNDS)) * pad;
      r += (C.dust[0] - r) * ammo * 0.28;
      g += (C.dust[1] - g) * ammo * 0.28;
      b += (C.dust[2] - b) * ammo * 0.28;

      // --- 11. fuel. Blotched by noise rather than a clean disc, because a
      // spill follows the camber and the cracks, not a compass.
      let oil = 0;
      for (const [ox, oz, rad, amt] of OIL_SOURCES) {
        const d = Math.hypot(wx - ox, wz - oz);
        oil = Math.max(oil, Math.exp(-Math.pow(d / rad, 2)) * amt);
      }
      oil *= 0.25 + fbm(wx * 0.55 + 61, wz * 0.55 - 17, 3) * 1.1;
      oil = clamp(oil, 0, 1);
      r += (C.oil[0] - r) * oil * 0.55;
      g += (C.oil[1] - g) * oil * 0.55;
      b += (C.oil[2] - b) * oil * 0.55;

      // --- 12. fine mottling so no two square metres match.
      const mo = 0.92 + mottle * 0.16;
      cr[k] = r * mo; cg[k] = g * mo; cb[k] = b * mo;

      // --- and which real surface the shader should sample here.
      sR[k] = clamp(pad * 0.3 + apron * 0.75 + track * 0.2, 0, 1);
      sG[k] = clamp(ammo * 0.55 + door * 0.35 + sstep(0.62, 0.95, shade) * out * 0.45, 0, 1);
      sB[k] = clamp(track * 0.85 + foot * 0.55 + door * 0.6 + oil * 0.9 + pad * 0.22, 0, 1);
      sA[k] = clamp(gw * (1 - pad), 0, 1);
    }
  }
  return { cr, cg, cb, sR, sG, sB, sA };
}

function makeGroundTexture(px = 1536) {
  const t0 = performance.now();
  const G = FIELD;
  const F = buildZoneFields(G);
  const tField = performance.now();

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(px, px);
  const data = img.data;

  // One set of bilinear weights per pixel, reused across the three channels —
  // the expensive part of an upsample is working out where you are, not the
  // three lerps that follow.
  for (let py = 0; py < px; py++) {
    const fy = clamp((py / (px - 1)) * (G - 1), 0, G - 1.001);
    const jj = fy | 0, ty = fy - jj;
    const row0 = jj * G, row1 = row0 + G;
    for (let pxx = 0; pxx < px; pxx++) {
      const fx = clamp((pxx / (px - 1)) * (G - 1), 0, G - 1.001);
      const ii = fx | 0, tx = fx - ii;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty, w11 = tx * ty;
      const a = row0 + ii, b = row1 + ii;

      let r = F.cr[a] * w00 + F.cr[a + 1] * w10 + F.cr[b] * w01 + F.cr[b + 1] * w11;
      let g = F.cg[a] * w00 + F.cg[a + 1] * w10 + F.cg[b] * w01 + F.cg[b + 1] * w11;
      let bl = F.cb[a] * w00 + F.cb[a + 1] * w10 + F.cb[b] * w01 + F.cb[b + 1] * w11;

      // Per-pixel grain. The PBR sets underneath carry the real grain; this is
      // only here to break the bilinear upsample's smoothness so the macro map
      // never reads as a gradient.
      const grain = rand(pxx * 0.73 + py * 311.7) - 0.5;
      r += grain * 22; g += grain * 20; bl += grain * 16;

      // Grit and stones, at macro scale: the ones big enough to see from the
      // tactical camera. Denser on the gravel apron.
      const gravelHere = F.sR[a];
      const stone = rand(pxx * 11.3 + py * 7.1 + 41.7);
      const stoneCut = 0.9972 - gravelHere * 0.0035;
      if (stone > stoneCut) { r = 190 + grain * 20; g = 182 + grain * 20; bl = 164 + grain * 18; }
      else if (stone < 0.0026 + gravelHere * 0.002) { r *= 0.52; g *= 0.52; bl *= 0.52; }

      const k = (py * px + pxx) * 4;
      data[k] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[k + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[k + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
      data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const toPx = (w) => ((w + DEPOT_SIZE / 2) / DEPOT_SIZE) * px;
  const scale = px / DEPOT_SIZE;

  // Sharp marks, drawn on top of the field pass because they are smaller than
  // a field cell and would be smeared away by the upsample.

  // Drip stains and spot leaks where vehicles and drums stand.
  for (const [cx, cz, count, spread] of [
    [GATE.x + 2.6, GATE.z, 70, 4.0],
    [3, 2, 100, 5.5],
    [FIRE_SOURCE.x, FIRE_SOURCE.z, 120, 3.4],
    [26.5, -3.2, 70, 4.2],
  ]) {
    for (let i = 0; i < count; i++) {
      const s = rand(i + cx * 31 + cz * 17);
      const a = rand(i + 700 + cx) * Math.PI * 2;
      const rr = Math.sqrt(rand(i + 1400 + cz)) * spread;
      ctx.fillStyle = s > 0.6 ? 'rgba(24,20,16,0.26)' : 'rgba(44,36,28,0.16)';
      ctx.beginPath();
      ctx.ellipse(toPx(cx + Math.cos(a) * rr), toPx(cz + Math.sin(a) * rr),
                  (0.22 + s * 0.7) * scale, (0.16 + s * 0.5) * scale,
                  a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Tyre scrub where a vehicle turns: arcs, not blobs. The gate and the yard
  // junction are the two places a lorry has to swing.
  ctx.lineCap = 'round';
  for (const [cx, cz, seed] of [[GATE.x + 3.4, GATE.z - 0.4, 12], [3.2, 1.8, 77], [25.8, -3.4, 131]]) {
    for (let i = 0; i < 14; i++) {
      const a0 = rand(i + seed) * Math.PI * 2;
      const rr = 1.6 + rand(i + seed + 400) * 3.4;
      const sweep = 0.5 + rand(i + seed + 800) * 1.1;
      ctx.strokeStyle = `rgba(58,48,36,${0.10 + rand(i + seed + 1200) * 0.13})`;
      ctx.lineWidth = (0.10 + rand(i + seed + 1600) * 0.16) * scale;
      ctx.beginPath();
      ctx.arc(toPx(cx), toPx(cz), rr * scale, a0, a0 + sweep);
      ctx.stroke();
    }
  }

  // Scattered small debris inside the wire — chips of concrete, a dropped
  // fastener, the stuff that ends up on a working yard and never gets swept.
  for (let i = 0; i < 2600; i++) {
    const x = (rand(i + 5501) - 0.5) * DEPOT_SIZE * 0.55 + 6;
    const z = (rand(i + 9901) - 0.5) * DEPOT_SIZE * 0.5 - 2;
    if (insideWire(x, z) < 0.6) continue;
    if (structureDistance(x, z) < 0.4) continue;
    const s = rand(i + 13000);
    ctx.fillStyle = s > 0.5
      ? `rgba(176,170,152,${0.35 + s * 0.3})`
      : `rgba(58,50,40,${0.25 + s * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(toPx(x), toPx(z), (0.05 + s * 0.14) * scale, (0.04 + s * 0.1) * scale,
                s * 6.28, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  console.log(`[depot] ground macro ${px}px (zones ${G}² ${(tField - t0) | 0}ms, `
    + `paint ${(performance.now() - tField) | 0}ms)`);
  return { tex, fields: F, size: G };
}

// The companion splat. Same fields, no upsample — it is a blend mask and the
// GPU's own bilinear filter is exactly the right amount of smoothing for one.
function makeSplatTexture(F, G) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = G;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(G, G);
  for (let i = 0; i < G * G; i++) {
    img.data[i * 4] = F.sR[i] * 255;
    img.data[i * 4 + 1] = F.sG[i] * 255;
    img.data[i * 4 + 2] = F.sB[i] * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  // Blend weights, not colour: an sRGB decode here would bend every mask.
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// Organic weight rides in its own single-channel map rather than the splat's
// alpha, because a canvas with a varying alpha gets premultiplied on readback
// and the mask comes out coupled to the colour underneath it.
function makeOrganicTexture(F, G) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = G;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(G, G);
  for (let i = 0; i < G * G; i++) {
    const v = F.sA[i] * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function detailTexture(px = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(px, px);
  for (let i = 0; i < px * px; i++) {
    const v = rand(i * 1.41 + 3.3);
    const c = 128 + (v - 0.5) * 118;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = c;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ------------------------------------------------------------ ground shader

// Measured means of the three ground sets, in LINEAR light (WebGL2 decodes an
// sRGB texture in hardware, so this is what the sampler actually returns).
// Dividing the detail by its own mean is what lets it be mixed in at strength
// without costing a stop of exposure — the thing that turned the compound to
// mud the last time a photographic albedo went in raw.
const MEAN_DIRT   = 'vec3(0.1917, 0.1384, 0.0782)';
const MEAN_GRAVEL = 'vec3(0.1490, 0.1512, 0.1393)';
const MEAN_SAND   = 'vec3(0.6069, 0.4868, 0.3009)';

const GROUND_COMMON = /* glsl */`
uniform sampler2D uDetail;
uniform sampler2D uSplat;
uniform sampler2D uOrganic;
uniform sampler2D uDirt;
uniform sampler2D uGravel;
uniform sampler2D uSand;
uniform sampler2D uDirtN;
uniform sampler2D uGravelN;
uniform float uDetailMix;
uniform float uGroundNormal;
varying vec3 vGndNrm;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// Four world-space taps for the surface, at two scales that share no period.
const GROUND_ALBEDO_HIGH = /* glsl */`
  vec2 uvA = gWP * 0.26;
  vec2 uvB = gWP.yx * 0.109 + vec2(3.7, 11.3);
  float gBlend = smoothstep(0.30, 0.70, n2(gWP * 0.042));
  vec3 gSoil = mix(texture2D(uDirt, uvA).rgb, texture2D(uDirt, uvB).rgb, gBlend);
  vec3 gGrav = texture2D(uGravel, gWP * 0.33).rgb;
  vec3 gSand = texture2D(uSand, gWP * 0.21).rgb;
`;

// Low tier drops the second soil tap and the sand. Gravel stays, because the
// contrast between crushed stone and soil IS the zone read and losing it puts
// the compound back on one continuous sheet.
const GROUND_ALBEDO_LOW = /* glsl */`
  vec2 uvA = gWP * 0.26;
  vec3 gSoil = texture2D(uDirt, uvA).rgb;
  vec3 gGrav = texture2D(uGravel, gWP * 0.33).rgb;
  vec3 gSand = gSoil;
`;

function groundAlbedo(low) {
  return /* glsl */`
  #include <map_fragment>
  vec2 gWP = vec2(vMapUv.x - 0.5, 0.5 - vMapUv.y) * ${DEPOT_SIZE.toFixed(1)};
  vec4 gSplat = texture2D(uSplat, vMapUv);
  float gOrganic = texture2D(uOrganic, vMapUv).r;
  float wGravel = gSplat.r;
  float wSand = gSplat.g * ${low ? '0.0' : '1.0'};
  float gComp = gSplat.b;
  float wDirt = clamp(1.0 - wGravel - wSand, 0.0, 1.0);
  float wSum = max(wDirt + wGravel + wSand, 1e-3);
${low ? GROUND_ALBEDO_LOW : GROUND_ALBEDO_HIGH}
  vec3 gDet = (gSoil * wDirt + gGrav * wGravel + gSand * wSand) / wSum;
  vec3 gMean = (${MEAN_DIRT} * wDirt + ${MEAN_GRAVEL} * wGravel + ${MEAN_SAND} * wSand) / wSum;
  gDet = clamp(gDet / max(gMean, vec3(0.02)), vec3(0.4), vec3(1.8));
  // Compacted ground has been rolled flat: the grain is still there, it just
  // reads at half the contrast. Organic litter goes the other way.
  float gk = uDetailMix * (1.0 - gComp * 0.45) * (1.0 + gOrganic * 0.25);
  diffuseColor.rgb *= mix(vec3(1.0), gDet, gk);

  vec3 grit = texture2D(uDetail, vMapUv * 110.0).rgb;
  diffuseColor.rgb *= (0.90 + grit * 0.20);
  float gM = n2(gWP * 0.5) * 0.55 + n2(gWP * 1.8) * 0.3 + n2(gWP * 5.2) * 0.15;
  diffuseColor.rgb *= 0.88 + gM * 0.26;
`;
}

// Roughness is not one number for the whole board. Rolled track and soaked
// fuel are near-smooth and catch the low sun; dry grass and turned soil eat it.
const GROUND_ROUGH = /* glsl */`
float roughnessFactor = roughness;
{
  float rk = 1.0 - gComp * 0.30 + gOrganic * 0.07;
  rk += (n2(gWP * 0.75 + 13.0) - 0.5) * 0.16;
  roughnessFactor = clamp(roughnessFactor * rk, 0.36, 1.0);
}
`;

// The plane is flat-ish and horizontal, so a full tangent frame is wasted
// work: a tangent-space normal on a +Y surface lands on world (x, z, -y), and
// adding that to the interpolated normal gives the relief without a second
// matrix. The macro displacement is already in vGndNrm, so slopes keep theirs.
const GROUND_NORMAL = /* glsl */`
{
  vec3 nA = texture2D(uDirtN, uvA).xyz * 2.0 - 1.0;
  vec3 nB = texture2D(uGravelN, gWP * 0.33).xyz * 2.0 - 1.0;
  vec3 tn = mix(nA, nB, wGravel);
  float k = uGroundNormal * (1.0 - gComp * 0.6);
  vec3 wn = normalize(vGndNrm + vec3(tn.x, 0.0, -tn.y) * k);
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`;

// ---------------------------------------------------------------- scrub

// Dry hillside scrub. Mostly outside the wire — inside is bulldozed and driven
// on, and nothing grows on hardstanding. That boundary does as much to draw
// the compound as the wall does.
//
// But "nothing" is too clean. A working yard has weeds in the strip along the
// wall where no wheel ever goes, and it has rubble: chips off the kerb, spoil
// that was never carted away, stones tracked in on tyres. Those two species
// are placed INSIDE the wire under their own rules, which is what stops the
// hardstanding reading as a swept floor.
function scrub(scene, uniforms) {
  const group = new THREE.Group();
  group.name = 'depot-scrub';

  const tuft = new THREE.BufferGeometry();
  {
    const pos = [], uv = [], idx = [];
    for (let b = 0; b < 4; b++) {
      const a = b * 1.6, base = b * 4;
      const dx = Math.cos(a) * 0.05, dz = Math.sin(a) * 0.05;
      const lean = 0.2 + rand(b) * 0.3;
      pos.push(-0.07 + dx, 0, dz, 0.07 + dx, 0, dz,
               -0.03 + dx + Math.cos(a) * lean, 0.8, dz + Math.sin(a) * lean,
                0.03 + dx + Math.cos(a) * lean, 0.8, dz + Math.sin(a) * lean);
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    tuft.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tuft.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tuft.setIndex(idx);
    tuft.computeVertexNormals();
  }

  // Outside the wire, off the vehicle route.
  const wild = (x, z) => insideWire(x, z) < -1.2 && trackDistance(x, z) > 2.2;

  // Inside the wire, off everything that gets used. Weeds and rubble survive
  // in the dead strip against a wall and nowhere else.
  const dead = (x, z) => insideWire(x, z) > 0.9
    && structureDistance(x, z) > 0.7
    && trackDistance(x, z) > 1.7
    && pathDistance(x, z) > 1.1;

  const SPECIES = [
    { name: 'grass', count: 4200, seed: 900, geo: tuft, spread: 5, cluster: 8,
      colors: [0x9a8c52, 0xa89a60, 0x86794a, 0xb0a06a], min: 0.4, max: 1.1, accept: wild,
      mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, transparent: true, alphaTest: 0.2 }), sway: 1 },
    { name: 'bush', count: 620, seed: 4100, geo: new THREE.IcosahedronGeometry(1, 0), spread: 7, cluster: 4,
      colors: [0x5f6b3e, 0x6f7a48, 0x515c36, 0x7d8450], min: 0.35, max: 1.0, squash: 0.62, sink: 0.25, tilt: true, accept: wild,
      mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98, flatShading: true }) },
    // Field stone on the hillside, now carrying the real rock set rather than
    // a flat grey facet. One instanced draw, three taps, and a dodecahedron
    // stops reading as a dodecahedron.
    { name: 'rock', count: 540, seed: 7700, geo: new THREE.DodecahedronGeometry(1, 0), spread: 10, cluster: 6,
      colors: [0x9e9488, 0xada396, 0x857c71, 0xb6aa98], min: 0.2, max: 0.9, squash: 0.6, sink: 0.35, tilt: true, accept: wild,
      mat: instancedRock(1.3) },
    // The weed line along the inside of the wall. Sparse, short, and the
    // single cheapest way to say "this yard is maintained, but not today".
    { name: 'weeds', count: 900, seed: 15500, geo: tuft, spread: 2.4, cluster: 3,
      colors: [0x8d8248, 0x9b8f56, 0x7a7040, 0x6f7a42], min: 0.22, max: 0.5, sway: 1,
      accept: (x, z) => dead(x, z)
        && (Math.abs(insideWire(x, z)) < 3.0 || structureDistance(x, z) < 2.6),
      mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, transparent: true, alphaTest: 0.2 }) },
    // Rubble and tracked-in stone on the hardstanding. Small — a 25 cm stone
    // on a tactical zoom reads as a bin bag, and a scatter of them reads as
    // damage rather than as a yard that has not been swept since spring.
    { name: 'rubble', count: 820, seed: 21300, geo: new THREE.DodecahedronGeometry(1, 0), spread: 4.5, cluster: 5,
      colors: [0xc0b9a9, 0xd0c8b6, 0xa79e90, 0x8f8578], min: 0.035, max: 0.11, squash: 0.5, sink: 0.4, tilt: true,
      accept: (x, z) => dead(x, z) && structureDistance(x, z) < 11,
      mat: instancedRock(7.5, 0.5) },
  ];

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
  const report = [];

  for (const sp of SPECIES) {
    const mesh = new THREE.InstancedMesh(sp.geo, sp.mat, sp.count);
    mesh.name = sp.name;
    mesh.castShadow = sp.name !== 'grass' && sp.name !== 'weeds';
    mesh.receiveShadow = true;
    if (sp.sway) addSway(sp.mat, uniforms);

    // Inside-the-wire species scatter over the compound footprint; the wild
    // ones scatter over the whole board.
    const span = sp.accept === wild ? DEPOT_SIZE * 0.82 : 46;
    const ox = sp.accept === wild ? 0 : 12;
    const oz = sp.accept === wild ? 0 : -4;

    let placed = 0;
    for (let i = 0; placed < sp.count && i < sp.count * 60; i++) {
      const c = Math.floor(i / sp.cluster);
      const cx = ox + (rand(c + sp.seed) - 0.5) * span;
      const cz = oz + (rand(c + sp.seed + 2000) - 0.5) * span;
      const x = cx + (rand(i + sp.seed + 5000) - 0.5) * sp.spread;
      const z = cz + (rand(i + sp.seed + 8000) - 0.5) * sp.spread;

      if (!sp.accept(x, z)) continue;
      if (rand(i + sp.seed + 11000) > 0.72) continue;

      const h = depotHeight(x, z);
      const s = sp.min + rand(i + sp.seed + 14000) * (sp.max - sp.min);
      e.set(sp.tilt ? (rand(i + sp.seed + 17000) - 0.5) * 0.6 : 0,
            rand(i + sp.seed + 20000) * Math.PI * 2,
            sp.tilt ? (rand(i + sp.seed + 23000) - 0.5) * 0.6 : 0);
      q.setFromEuler(e);
      pos.set(x, h - (sp.sink ?? 0) * s, z);
      scl.set(s, s * (sp.squash ?? 1), s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(placed, m);

      const base = sp.colors[(rand(i + sp.seed + 26000) * sp.colors.length) | 0];
      col.setHex(base);
      const j = (rand(i + sp.seed + 29000) - 0.5) * 0.2;
      col.offsetHSL((rand(i + sp.seed + 31000) - 0.5) * 0.03, j * 0.4, j);
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    report.push(`${sp.name} ${placed}`);
  }

  scene.add(group);
  console.log(`[depot] scrub — ${report.join(', ')} (${SPECIES.length} instanced draws)`);
  return group;
}

// Stone, projected in world space and tinted per instance. `scale` is in world
// units and has to be tuned against the instance size: rubble is a tenth of a
// metre across, so a repeat that suits a boulder covers it in one texel.
function instancedRock(scale, albedoMix = 0.72) {
  const mat = triplanarMaterial({
    set: 'rock', color: 0xffffff, roughness: 0.95, metalness: 0.0,
    scale, normalScale: 0.75, albedoMix, instanced: true,
  });
  mat.vertexColors = true;
  return mat;
}

function addSway(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iO = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 iO = vec3(0.0);
        #endif
        float ph = iO.x * 0.8 + iO.z * 0.6;
        float st = smoothstep(0.0, 1.0, transformed.y);
        transformed.x += sin(uTime * 1.6 + ph) * st * 0.11;
        transformed.z += cos(uTime * 1.2 + ph * 1.4) * st * 0.07;
      `);
  };
}

// ---------------------------------------------------------------- air

// Dust hanging in low evening light. The compound is dry and everything that
// moves through it lifts some.
function dust(scene) {
  const COUNT = 1500, SPAN = 80;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const drift = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (rand(i + 11) - 0.5) * SPAN;
    positions[i * 3 + 1] = rand(i + 51) * 12;
    positions[i * 3 + 2] = (rand(i + 91) - 0.5) * SPAN;
    sizes[i] = 0.018 + rand(i + 131) * 0.05;
    drift[i] = rand(i + 171) * 6.283;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 620 }, uColor: { value: new THREE.Color(0xd8c4a0) } },
    vertexShader: `
      attribute float size; uniform float uScale; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * uScale * projectionMatrix[1][1];
        vA = 0.16 + size * 3.0;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(d));
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor, a * vA);
      }`,
    transparent: true, depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'depot-dust';
  points.frustumCulled = false;
  scene.add(points);

  return {
    points,
    update(dt, t) {
      const p = geometry.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        p[i * 3] += Math.sin(t * 0.22 + drift[i]) * dt * 0.22;
        p[i * 3 + 1] += Math.sin(t * 0.4 + drift[i] * 1.7) * dt * 0.06;
        p[i * 3 + 2] += Math.cos(t * 0.17 + drift[i]) * dt * 0.16;
        if (p[i * 3] > SPAN / 2) p[i * 3] -= SPAN;
        if (p[i * 3] < -SPAN / 2) p[i * 3] += SPAN;
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- assembly

export function createDepotGround(scene) {
  const uniforms = { uTime: { value: 0 } };

  const segments = 280;
  const geometry = new THREE.PlaneGeometry(DEPOT_SIZE, DEPOT_SIZE, segments, segments);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Local +y maps to world -z once the plane is laid flat. Sampling the raw
    // local y builds the map mirrored against its own height function, which
    // puts every prop at a height the ground does not have.
    pos.setZ(i, depotHeight(pos.getX(i), -pos.getY(i)));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const { tex: macro, fields, size: fieldSize } = makeGroundTexture();
  const splat = makeSplatTexture(fields, fieldSize);
  const organic = makeOrganicTexture(fields, fieldSize);
  const detail = detailTexture();
  const low = renderTier() === 'low';

  const dirt = textureSet('ground-dirt');
  const gravel = textureSet('ground-gravel');
  const sand = textureSet('ground-sand');

  const material = new THREE.MeshStandardMaterial({
    map: macro, color: 0xf4f0e8, roughness: 0.97, metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail };
    shader.uniforms.uSplat = { value: splat };
    shader.uniforms.uOrganic = { value: organic };
    shader.uniforms.uDirt = { value: dirt.albedo };
    shader.uniforms.uGravel = { value: gravel.albedo };
    shader.uniforms.uSand = { value: sand.albedo };
    shader.uniforms.uDirtN = { value: dirt.normal };
    shader.uniforms.uGravelN = { value: gravel.normal };
    shader.uniforms.uDetailMix = { value: low ? 0.42 : 0.52 };
    shader.uniforms.uGroundNormal = { value: 0.85 };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGndNrm;')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\nvGndNrm = normalize(mat3(modelMatrix) * objectNormal);');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GROUND_COMMON}`)
      .replace('#include <map_fragment>', groundAlbedo(low))
      .replace('#include <roughnessmap_fragment>', GROUND_ROUGH);

    // Relief is the first thing to go on a software rasteriser: two more
    // fetches for a bump the tactical zoom barely resolves.
    if (!low) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', GROUND_NORMAL);
    }
  };
  material.customProgramCacheKey = () => `depot-ground:${low ? 'low' : 'high'}`;

  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  ground.name = 'depot-ground';
  scene.add(ground);

  const flora = scrub(scene, uniforms);
  const motes = dust(scene);

  return {
    terrain: ground,
    vegetation: flora,
    height: depotHeight,
    dust: {
      points: motes.points,
      update(dt, t) { uniforms.uTime.value = t; motes.update(dt, t); },
    },
  };
}
