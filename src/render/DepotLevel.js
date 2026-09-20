import * as THREE from 'three';
import { spawnProp } from './AssetLoader.js';
import { triplanarMaterial } from './Textures.js';
import { cloneSurface } from './Materials.js';
import { depotHeight } from './Depot.js';
import {
  WIRE, GATE, WALLS, ROOMS, OUTBUILDINGS, ZONES, FIRE_SOURCE,
} from '../data/depot-layout.js';

// ============================================================================
// COMPOUND 14 — the installation
// ============================================================================
//
// Built entirely from src/data/depot-layout.js. Nothing in here invents a
// coordinate.
//
// Returns the same contract as createLevel() so the Director runs unchanged:
// { group, door, tower, beacon, generator, relayConsole }. Roles re-cast —
//   tower / beacon  →  the ammunition stack and its charge indicator. Turn
//                      10's `relay` FX fires on it: that beat IS the detonation.
//   door            →  the holding room's door.
//   generator       →  the plant in the corridor, the EM source for turn 7.
//
// Every wall and roof mesh is registered on `fadeables` so the camera can see
// through them — see CameraOcclusion in main.js. They are built transparent
// from the start: switching a material to transparent at runtime forces a
// shader recompile and drops a frame exactly when the squad walks indoors.

const rand = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const MAX_TILT = THREE.MathUtils.degToRad(6);
const clamp = THREE.MathUtils.clamp;

function onGround(object, x, z, { sink = 0, rotY = 0, tiltToSlope = true } = {}) {
  object.position.set(x, depotHeight(x, z) - sink, z);
  object.rotation.set(0, rotY, 0);
  if (tiltToSlope) {
    const e = 2.0;
    const dx = depotHeight(x + e, z) - depotHeight(x - e, z);
    const dz = depotHeight(x, z + e) - depotHeight(x, z - e);
    object.rotation.x = clamp(Math.atan2(dz, 2 * e), -MAX_TILT, MAX_TILT);
    object.rotation.z = clamp(-Math.atan2(dx, 2 * e), -MAX_TILT, MAX_TILT);
  }
  return object;
}

// ---------------------------------------------------------------- materials

// Transparent from birth, opacity 1. See the note at the top.
//
// `tex` names a CC0 PBR set (see src/render/Textures.js) projected triplanar.
// The compound's walls are extruded boxes with no UVs, so a projection is the
// only way to get aggregate into concrete and corrugation into a roof — and it
// keeps the fade contract intact, because the result is still one
// MeshStandardMaterial the occlusion system can drive `opacity` on.
//
// `wx` names a WEATHERING PROGRAM — see the block below. The PBR set gives a
// surface its grain; the weathering gives it a history, and history is what
// the compound was missing. A concrete panel is not a concrete panel because
// it has aggregate in it, it is one because it has a joint every 2.4 m, a
// streak under the capping course and half a metre of yard thrown up its base.
//
// Base colours are lifted above the old flat values: the detail albedo
// multiplies into them, so the pre-texture colour would come out a stop dark.
const fadeMat = (color, roughness = 0.94, metalness = 0.02, tex = null, wx = null) => {
  const mat = tex
    ? triplanarMaterial({ color, roughness, metalness, ...tex })
    : new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  mat.transparent = true;
  mat.opacity = 1;
  mat.depthWrite = true;
  if (wx) weather(mat, wx);
  return mat;
};

// ---------------------------------------------------------------- weathering

// Everything the surface tells you that the geometry does not.
//
// These run on TOP of the triplanar detail, in the same world space it uses:
// the projection already carries `vTriPos` and `vTriNrm` as varyings, so the
// weathering costs no extra plumbing and no extra vertex work — only the
// arithmetic, and nearly all of it is noise rather than texture fetches, which
// is what keeps it affordable on the software rasteriser.
//
// Anchors matter. The triplanar injection appends itself to <map_fragment> and
// replaces <roughnessmap_fragment> and <normal_fragment_maps> outright, so
// weathering hangs off the chunks that come immediately AFTER each of those —
// <color_fragment>, <metalnessmap_fragment> and
// <clearcoat_normal_fragment_begin> (empty without USE_CLEARCOAT, and the only
// safe seam left after the normal has been built).

const WX_COMMON = /* glsl */`
uniform float uWxBase;
uniform float uWxTop;
uniform float uWxSeed;
uniform float uWxDirt;
uniform vec2 uWxStain;
uniform float uWxStainR;
float wxH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wxN(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wxH(i), wxH(i + vec2(1.0, 0.0)), f.x),
             mix(wxH(i + vec2(0.0, 1.0)), wxH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wxFbm(vec2 p) { return wxN(p) * 0.60 + wxN(p * 2.3) * 0.28 + wxN(p * 5.1) * 0.12; }
// GLSL leaves smoothstep UNDEFINED when edge0 >= edge1. Every driver this has
// been run on happens to evaluate the descending ramp anyway, which is exactly
// the kind of thing that works until the demo is on someone else's laptop.
// Everything below that wants a falling edge asks for it by name.
float wxFall(float e0, float e1, float x) { return 1.0 - smoothstep(e0, e1, x); }
`;

// Poured and precast concrete, outdoors.
const WX_WALL = /* glsl */`
float wxRough = 1.0, wxMetalK = 1.0, wxHeight = 0.0;
{
  vec3 wn = normalize(vTriNrm);
  float up = clamp(wn.y, 0.0, 1.0);
  float y = vTriPos.y - uWxBase;                       // metres above the footing
  float run = vTriPos.x + vTriPos.z + uWxSeed;         // along the wall, either axis
  // The aggregate grain, before anything below tints it — this is the only
  // part of the relief that comes from the scanned surface rather than from
  // the history drawn on top of it.
  float grain = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));

  // Pour patches. No two panels of a wall this old are the same colour, and
  // a compound of identical panels is the thing that reads as generated.
  // Two scales: slab-sized blotches, and the finer mottling of a bad pour.
  float pour = wxFbm(vec2(run * 0.23, vTriPos.y * 0.17)) * 0.72
             + wxFbm(vec2(run * 0.95, vTriPos.y * 0.8) + 5.0) * 0.28;
  diffuseColor.rgb *= 0.74 + pour * 0.56;
  // The cool grey of cement against the warm cast of old sand-heavy mix, by
  // patch. A concrete wall is never one hue, and the difference between the
  // two is most of what stops it reading as painted cardboard. Held tight:
  // the key light is already 0xffd4a0, and a warm cast on top of a warm sun
  // is what turned the first pass of these walls the colour of plywood.
  diffuseColor.rgb *= mix(vec3(1.035, 1.010, 0.965), vec3(0.955, 0.975, 1.0),
                          smoothstep(0.35, 0.72, pour));

  // Precast joints between panels. A vertical every 2.4 m, and a LIFT JOINT
  // where the pour was stopped overnight — one per panel, at a height that
  // varies with the panel, because a horizontal line at the same height along
  // a whole building is a plank edge and turns concrete into cladding. That
  // is exactly what the regular 1.2 m shutter line here used to do.
  float panel = floor(run / 2.4);
  float jv = abs(fract(run / 2.4 + 0.5) - 0.5) * 2.4;
  float liftY = 0.9 + wxN(vec2(panel, 3.0)) * 1.5;
  float jh = abs(y - liftY);
  float joint = max(wxFall(0.0, 0.055, jv), wxFall(0.0, 0.030, jh) * 0.45);
  diffuseColor.rgb *= 1.0 - joint * 0.45 * (1.0 - up);

  // Runoff off the capping course. Thin, irregularly spaced, strongest under
  // the cap and washed out well before the base. Grey-green, not brown: this
  // is washed cement dust and algae, and a warm streak on a warm wall is wood.
  float sf = wxFbm(vec2(run * 2.7, y * 0.16));
  float streak = smoothstep(0.46, 0.84, sf)
               * smoothstep(0.08, 0.55, y / max(uWxTop, 0.6)) * (1.0 - up);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.56, 0.54), streak * 0.9);

  // Splash. Every vehicle that has driven past has thrown the yard at the
  // bottom half-metre, and rain has run the rest back down. The edge is a
  // ragged tide line, not a band — a clean one reads as a painted plinth.
  float edge = 0.34 + wxFbm(vec2(run * 1.4, 4.0)) * 0.62;
  float splash = wxFall(0.0, edge, y) * (1.0 - up) * uWxDirt;
  splash *= 0.55 + wxFbm(vec2(run * 3.0, y * 2.4) + 17.0) * 0.9;
  splash = clamp(splash, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.068, 0.047), splash * 0.72);

  // Spalling: chipped faces show paler, sharper aggregate.
  float chip = smoothstep(0.88, 0.965, wxFbm(vec2(run * 6.5, vTriPos.y * 5.5) + 31.0));
  diffuseColor.rgb += chip * 0.10 * (1.0 - splash);

  // Sun-bleached tops, wet-dark undersides.
  diffuseColor.rgb *= 1.0 + up * 0.10 - clamp(-wn.y, 0.0, 1.0) * 0.22;

  wxRough = 1.0 + splash * 0.10 + joint * 0.05 - chip * 0.10;
  // Metres, because WX_BUMP divides it by the world size of a pixel. A 45 mm
  // recess at a joint, a 16 mm spall, and a few millimetres of aggregate.
  wxHeight = -joint * 0.045 + chip * 0.016 + (pour - 0.5) * 0.007 + (grain - 0.25) * 0.020;
}
`;

// Corrugated sheet over the magazines. The roof is modelled as a slab, so the
// profile has to come from here — and a roof with no profile is the single
// flattest thing a compound seen from above can contain.
const WX_ROOF = /* glsl */`
float wxRough = 1.0, wxMetalK = 1.0, wxHeight = 0.0;
{
  vec3 wn = normalize(vTriNrm);
  float up = clamp(wn.y, 0.0, 1.0);

  // The rib profile itself comes from the metal-corrugated NORMAL map, which
  // is a real one-axis relief scan (see SOURCES.md) — so it lights correctly
  // from any sun angle instead of being a painted stripe, and it does not
  // moiré the way an analytic sinusoid across a ten-metre slab does. What is
  // left here is everything the scan cannot know: where this particular roof
  // has been leaking, laid and walked on.
  float rib = 0.5 + 0.5 * sin(vTriPos.x * 17.4);   // valley/crest hint only

  // Sheet laps across the run, and the fixing line down each one.
  float lap = wxFall(0.0, 0.09, abs(fract(vTriPos.z / 2.2 + 0.5) - 0.5) * 2.2);
  diffuseColor.rgb *= 1.0 - lap * 0.20 * up;

  // Rust blooming out of the fixings and creeping along the laps. Kept off
  // full saturation: a roof that has gone properly orange pulls harder than
  // anything else on the board and this is not what the eye should land on.
  float rf = wxFbm(vec2(vTriPos.x * 0.55, vTriPos.z * 0.55) + uWxSeed);
  float rust = max(smoothstep(0.66, 0.95, rf), lap * smoothstep(0.52, 0.88, rf)) * up;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.145, 0.082, 0.047), rust * 0.42);

  // Grit and blown dust that has settled in the valleys and stayed there.
  float grime = smoothstep(0.30, 0.78, wxFbm(vec2(vTriPos.x * 0.19, vTriPos.z * 0.19) + 9.0))
              * up * (1.0 - rib * 0.55);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.150, 0.140, 0.116), grime * 0.50 * uWxDirt);

  // The fascia under the edge is in permanent shadow and permanently filthy.
  diffuseColor.rgb *= 1.0 - (1.0 - up) * 0.18;

  wxRough = 1.0 + rust * 0.30 + grime * 0.26 - up * 0.06;
  wxMetalK = clamp(1.0 - rust * 0.85 - grime * 0.55, 0.0, 1.0);
  // The ribs come from the scan. This is only the step where one sheet laps
  // over the next, and the pitting where the rust has eaten through.
  wxHeight = -lap * 0.012 - rust * 0.005;
}
`;

// Relief from the surface's own history, with no extra texture fetch.
//
// `wxHeight` is assembled by each weathering program out of the fields it has
// ALREADY evaluated — joint depth, spalling, the pour, the sampled albedo's
// own luminance. Screen-space derivatives turn that into a gradient and the
// gradient into a normal (the standard derivative-bump construction: build the
// surface frame from dFdx/dFdy of the world position, so the result is correct
// on any face without a tangent attribute — which none of this geometry has).
//
// It matters most on concrete. Concrete036's normal map measures σ 7 where the
// dirt is σ 27 — the set is nearly flat, which is documented upstream and is
// exactly why a textured wall still read as painted card. A joint the shader
// draws but does not indent is a line, not a joint.
const WX_BUMP = /* glsl */`
{
  vec3 dpx = dFdx(vTriPos), dpy = dFdy(vTriPos);
  float dhx = dFdx(wxHeight), dhy = dFdy(wxHeight);
  vec3 wn = normalize(vTriNrm);
  vec3 r1 = cross(dpy, wn), r2 = cross(wn, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  vec3 bumped = normalize(abs(det) * wn - grad);
  normal = normalize(mix(normal, (viewMatrix * vec4(bumped, 0.0)).xyz, 0.85));
}
`;

// Interior slab: swept, but worn, jointed and stained under whatever leaks.
const WX_FLOOR = /* glsl */`
float wxRough = 1.0, wxMetalK = 1.0, wxHeight = 0.0;
{
  diffuseColor.rgb *= 0.84 + wxFbm(vTriPos.xz * 0.32 + uWxSeed) * 0.34;

  float jx = wxFall(0.0, 0.055, abs(fract(vTriPos.x / 2.5 + 0.5) - 0.5) * 2.5);
  float jz = wxFall(0.0, 0.055, abs(fract(vTriPos.z / 2.5 + 0.5) - 0.5) * 2.5);
  diffuseColor.rgb *= 1.0 - max(jx, jz) * 0.38;

  // Whatever this room holds has leaked. The caller says where and how far.
  float sd = length(vTriPos.xz - uWxStain) / max(uWxStainR, 0.3);
  float stain = clamp(exp(-sd * sd) * (0.25 + wxFbm(vTriPos.xz * 1.3) * 1.3), 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.030, 0.026, 0.021), stain * 0.65);

  // Handling dust, thickest where nobody walks.
  float film = smoothstep(0.38, 0.86, wxFbm(vTriPos.xz * 0.52 + 21.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.28, 0.235), film * uWxDirt * 0.40);

  // Scuff arcs where crates get dragged round.
  float scuff = smoothstep(0.88, 0.98, wxFbm(vTriPos.xz * 2.6 + 57.0));
  diffuseColor.rgb *= 1.0 - scuff * 0.16;

  wxRough = 1.0 - stain * 0.40 + film * 0.06;
  wxHeight = -max(jx, jz) * 0.030 - scuff * 0.004;
}
`;

// Painted steel that has been outdoors for a decade: gate leaves, the door,
// the tower legs, the plant housing.
const WX_METAL = /* glsl */`
float wxRough = 1.0, wxMetalK = 1.0, wxHeight = 0.0;
{
  float y = vTriPos.y - uWxBase;
  float f = wxFbm(vTriPos.xz * 1.5 + vec2(vTriPos.y * 0.8) + uWxSeed);

  // Paint fails from the bottom up and from every fixing outwards.
  float rust = clamp(smoothstep(0.56, 0.86, f) + wxFall(0.0, 0.8, y) * 0.5 * uWxDirt, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.155, 0.063, 0.028), rust * 0.66);

  // Drag scratches: bare metal, brighter and much smoother than the paint.
  float sc = smoothstep(0.90, 0.985, wxFbm(vec2((vTriPos.x + vTriPos.z) * 8.0, vTriPos.y * 1.1)));
  diffuseColor.rgb += sc * 0.14;

  diffuseColor.rgb *= 0.88 + wxFbm(vTriPos.xz * 0.5 + 77.0) * 0.26;

  wxRough = 1.0 + rust * 0.34 - sc * 0.45;
  wxMetalK = clamp(1.0 - rust * 0.8 + sc * 0.5, 0.0, 1.0);
  wxHeight = rust * 0.004 - sc * 0.0015;
}
`;

const WX = { wall: WX_WALL, roof: WX_ROOF, floor: WX_FLOOR, metal: WX_METAL };

// Attach a weathering program to an already-built triplanar material.
//
// The triplanar's own compile hook runs first and is left untouched, so the
// two are independent: the surface set can change without touching the
// history, and vice versa.
function weather(mat, spec) {
  const { kind } = spec;
  const body = WX[kind];
  if (!body) return mat;

  mat.userData.weather = {
    kind,
    base: spec.base ?? 0,
    top: spec.top ?? 3.4,
    seed: spec.seed ?? 0,
    dirt: spec.dirt ?? 1,
    stain: spec.stain ?? [1e4, 1e4],
    stainR: spec.stainR ?? 1,
  };

  const baseCompile = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey;

  mat.onBeforeCompile = function compileWeathered(shader, renderer) {
    baseCompile.call(this, shader, renderer);
    const w = this.userData.weather;
    shader.uniforms.uWxBase = { value: w.base };
    shader.uniforms.uWxTop = { value: w.top };
    shader.uniforms.uWxSeed = { value: w.seed };
    shader.uniforms.uWxDirt = { value: w.dirt };
    shader.uniforms.uWxStain = { value: new THREE.Vector2(w.stain[0], w.stain[1]) };
    shader.uniforms.uWxStainR = { value: w.stainR };

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WX_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${WX[w.kind]}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * wxRough, 0.05, 1.0);
        metalnessFactor = clamp(metalnessFactor * wxMetalK, 0.0, 1.0);`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <clearcoat_normal_fragment_begin>',
        `#include <clearcoat_normal_fragment_begin>\n${WX_BUMP}`);
  };
  mat.customProgramCacheKey = function key() {
    return `${baseKey.call(this)}|wx:${kind}`;
  };
  return mat;
}

// THREE's clone() carries NEITHER onBeforeCompile NOR customProgramCacheKey.
//
// This was live in the compound and invisible: every wall run, every capping
// course and every roof in Compound 14 went through `MAT.wall.clone()`, came
// out with no compile hook, and rendered as flat untinted colour — the whole
// installation was a set of cream boxes while the props around it carried
// full PBR. Anything that needs its own copy of a fadeable surface goes
// through here now, and `overrides` is where a run gets its own footing
// height, its own seed and its own amount of dirt.
function cloneFade(source, overrides = null) {
  // THREE.Material.copy() deep-copies userData through JSON.stringify, and a
  // THREE.Texture sitting in there serialises its decoded image to a base64
  // data URL on the way. With a triplanar set hanging off every surface that
  // is three JPEGs re-encoded through a canvas per wall run, at boot, on the
  // main thread. Hiding userData across the clone costs two lines; the real
  // references are reattached below, which is all any caller wanted anyway.
  const src = source.userData;
  source.userData = {};
  const copy = source.clone();
  source.userData = src;

  copy.userData = {};
  if (src.tri) {
    copy.userData.tri = src.tri;          // shared: the compile hook only reads it
    copy.onBeforeCompile = source.onBeforeCompile;
    copy.customProgramCacheKey = source.customProgramCacheKey;
  }
  if (src.weather) copy.userData.weather = { ...src.weather, ...(overrides || {}) };

  copy.transparent = true;
  copy.opacity = 1;
  copy.depthWrite = true;
  return copy;
}

// Roughness and metalness are deliberately NOT one pair of numbers across the
// compound: poured concrete sits near 1.0 and 0, a galvanised roof is
// half-metal and a third smoother, painted steel is smoother still until the
// paint fails, and the interior slab is polished by boots where the exterior
// is not. The weathering programs then push each of them around per fragment.
const MAT = {
  // Cool grey-beige, not cream. The ground is warm tan for eighty metres in
  // every direction; a warm wall on warm ground is why the compound read as
  // one continuous material, and pulling the concrete a few degrees cold
  // separates every structure from the pan it stands on without touching the
  // exposure. The `scale` numbers put roughly one aggregate repeat every two
  // and a half metres, which is the size real exposed aggregate reads at.
  wall: fadeMat(0xc2c2bb, 0.96, 0.02,
    { set: 'concrete', scale: 0.40, albedoMix: 0.66, normalScale: 1.2 },
    { kind: 'wall', top: 3.4, dirt: 0.85 }),
  wallInner: fadeMat(0xaeaea6, 0.93, 0.02,
    { set: 'concrete', scale: 0.46, albedoMix: 0.62, normalScale: 0.9 },
    { kind: 'wall', top: 3.4, dirt: 0.35 }),
  concrete: fadeMat(0xb9b9b1, 0.97, 0.02,
    { set: 'concrete', scale: 0.36, albedoMix: 0.66, normalScale: 1.15 },
    { kind: 'wall', top: 2.8, dirt: 1.0 }),
  concreteDark: fadeMat(0x8b8b82, 0.98, 0.02,
    { set: 'concrete', scale: 0.32, albedoMix: 0.62, normalScale: 1.1 },
    { kind: 'wall', top: 2.8, dirt: 1.0 }),
  // Corrugated sheet over the magazines, not poured concrete.
  //
  // `scale` 0.55 puts one repeat of the scan every 1.8 m, and the scan has
  // eleven ribs across it — a 165 mm pitch, which is what profiled roofing
  // sheet actually measures. Galvanised and dusty rather than painted, so the
  // metalness is held well under a half: at 0.6 the low sun turns every crest
  // into a blown white line and the roof becomes the brightest thing on the
  // board, which is the last place the eye should be pulled.
  roof: fadeMat(0x8e8a7c, 0.82, 0.26,
    { set: 'metal-corrugated', scale: 0.55, albedoMix: 0.58, normalScale: 1.0 },
    { kind: 'roof', dirt: 1.0 }),
  metal: fadeMat(0x9a9384, 0.58, 0.60,
    { set: 'metal-plate', scale: 0.75, albedoMix: 0.52 },
    { kind: 'metal', dirt: 0.9 }),
  rust: fadeMat(0xa2663b, 0.92, 0.15, { set: 'metal-rust', scale: 1.0, albedoMix: 0.5 }),
  // Rubber and shadowed trim. Deliberately untextured: at this value the
  // detail map is invisible and the extra fetches are not worth a black edge.
  dark: fadeMat(0x3a3833, 0.9, 0.2),
  // Swept hardstanding underfoot, finer than the wall aggregate and polished
  // where boots go. Each room clones this with its own stain source.
  floor: fadeMat(0xa79e90, 0.90, 0.03,
    { set: 'concrete', scale: 0.46, albedoMix: 0.58, normalScale: 0.55 },
    { kind: 'floor', dirt: 0.8, stainR: 2.0 }),
};

// Everything in the yard has been standing in the same dust.
//
// This has to go through a COPY. surfaceMaterial() hands out one shared
// material per surface, so tinting a prop's material in place walks the tint
// into every other mesh that asked for the same surface — the squad's own
// chassis and weapon housing included, which is how three grey robots ended
// up the colour of the ground they were standing on. Worse, it compounds: each
// prop lerped the shared material a further 22% toward dust.
//
// One dusted copy per source material, cached, so the compound still draws
// with a handful of programs rather than one per mesh.
const dustCache = new Map();
function dusted(source) {
  const hit = dustCache.get(source);
  if (hit) return hit;
  const copy = cloneSurface(source);
  copy.color.lerp(new THREE.Color(0xb3a68c), 0.22);
  copy.roughness = Math.min(1, (copy.roughness ?? 0.7) + 0.18);
  dustCache.set(source, copy);
  return copy;
}

function box(w, h, d, mat, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- walls

const WALL_H = 3.4, WALL_T = 0.3;

// One authored segment becomes a run of panels with the doorways left out and
// a lintel dropped over each. Panels rather than one long box because a real
// wall is precast sections, and the joints are what make it read as built.
//
// A box is long on local +x, so aligning it to the run needs atan2(-dz, dx).
// Using atan2(dx, dz) puts every panel *across* the wall — that is exactly
// how the first version of this came out, as a zigzag of notches.
function buildWall(group, seg, fadeables, height = WALL_H, mat = MAT.wall, dirt = null) {
  const [ax, az] = seg.a, [bx, bz] = seg.b;
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  const ang = Math.atan2(-dz, dx);

  // One material per wall RUN, not per panel and not shared across the whole
  // compound. Shared would fade every wall in the building when one of them
  // blocks the camera; per-panel would pop a single section out of a wall and
  // read as a hole. A run is the unit the eye already treats as one thing.
  //
  // It is also where the compound stops being one repeated wall. Each run
  // gets its own noise seed, its own footing height so the splash zone sits
  // on the ground the run actually stands on, and a small value offset — a
  // dozen panels of exactly one grey is what reads as generated, and the
  // difference between them does not have to be large to break that.
  const seed = rand((ax * 31.7 + az * 11.3 + bx * 7.1 + bz * 3.3) * 0.5) * 97;
  const foot = depotHeight((ax + bx) / 2, (az + bz) / 2);
  const runMat = cloneFade(mat, {
    base: foot, top: height, seed, dirt: dirt ?? mat.userData.weather?.dirt ?? 1,
  });
  runMat.color.offsetHSL((rand(seed) - 0.5) * 0.012, (rand(seed + 5) - 0.5) * 0.05,
                         (rand(seed + 9) - 0.5) * 0.07);
  runMat.roughness = clamp(runMat.roughness + (rand(seed + 13) - 0.5) * 0.08, 0.4, 1);
  const capMatRun = cloneFade(MAT.concreteDark, {
    base: foot + height, top: 0.4, seed: seed + 41, dirt: 0.25,
  });
  const meshes = [];

  // Turn the door fractions into keep-out spans along the run.
  const gaps = (seg.doors || []).map((d) => {
    const c = d.at * len;
    return [c - d.width / 2, c + d.width / 2, d];
  }).sort((p, q) => p[0] - q[0]);

  const spans = [];
  let cursor = 0;
  for (const [g0, g1] of gaps) {
    if (g0 > cursor) spans.push([cursor, Math.min(g0, len)]);
    cursor = Math.max(cursor, g1);
  }
  if (cursor < len) spans.push([cursor, len]);

  const put = (from, to, h, yBase) => {
    const l = to - from;
    if (l <= 0.02) return;
    const mid = (from + to) / 2;
    const px = ax + (dx / len) * mid;
    const pz = az + (dz / len) * mid;
    const m = box(l, h, WALL_T, runMat, px, depotHeight(px, pz) + yBase + h / 2, pz, ang);
    group.add(m);
    meshes.push(m);
  };

  for (const [s0, s1] of spans) put(s0, s1, height, 0);

  // Lintel over each doorway, so the gap reads as a door and not a hole.
  for (const [g0, g1, d] of gaps) {
    const head = d.height ?? 2.3;
    put(g0, g1, height - head, head);
  }

  // Capping course along the whole run, doorways included.
  const capMid = len / 2;
  const cx = ax + (dx / len) * capMid, cz = az + (dz / len) * capMid;
  const cap = box(len, 0.16, WALL_T + 0.1, capMatRun,
                  cx, depotHeight(cx, cz) + height + 0.08, cz, ang);
  group.add(cap);
  meshes.push(cap);

  fadeables.push({ id: seg.tag || 'wall', materials: [runMat, capMatRun], meshes });
}

// ---------------------------------------------------------------- perimeter

function perimeter(group, fadeables) {
  const H = 2.8;
  const { minX, maxX, minZ, maxZ } = WIRE;

  // West face, split around the service gate — the only way in.
  const gateLo = GATE.z - GATE.width / 2;
  const gateHi = GATE.z + GATE.width / 2;

  const runs = [
    { a: [minX, maxZ], b: [maxX, maxZ] },        // north
    { a: [maxX, maxZ], b: [maxX, minZ] },        // east
    { a: [maxX, minZ], b: [minX, minZ] },        // south
    { a: [minX, minZ], b: [minX, gateLo] },      // west, below the gate
    { a: [minX, gateHi], b: [minX, maxZ] },      // west, above the gate
  ];
  for (const r of runs) buildWall(group, { ...r, doors: [] }, fadeables, H, MAT.concrete);

  // Posts at the corners and along the runs.
  for (const r of runs) {
    const [ax, az] = r.a, [bx, bz] = r.b;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 4.0));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const post = box(0.46, H + 0.3, 0.46, MAT.concreteDark,
                       px, depotHeight(px, pz) + (H + 0.3) / 2, pz);
      group.add(post);
    }
  }

  // The gate: two leaves, one pushed open.
  for (const [dz, rot] of [[GATE.width / 2 - 0.4, 0.0], [-GATE.width / 2 + 0.4, 0.5]]) {
    const leaf = new THREE.Group();
    leaf.add(box(0.12, 2.4, GATE.width / 2 - 0.2, MAT.metal, 0, 1.2, 0));
    for (let i = 0; i < 5; i++) {
      leaf.add(box(0.07, 2.1, 0.07, MAT.dark, 0, 1.2, -0.7 + i * 0.35));
    }
    onGround(leaf, GATE.x, GATE.z + dz, { rotY: rot, tiltToSlope: false });
    group.add(leaf);
  }

  // Guard tower on the north-west corner, overlooking the gate.
  const tower = new THREE.Group();
  for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
    tower.add(box(0.22, 4.4, 0.22, MAT.metal, lx, 2.2, lz));
  }
  tower.add(box(2.4, 0.16, 2.4, MAT.concreteDark, 0, 4.4, 0));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    tower.add(box(2.4, 0.9, 0.12, MAT.metal, Math.sin(a) * 1.15, 4.9, Math.cos(a) * 1.15, a));
  }
  tower.add(box(2.8, 0.14, 2.8, MAT.roof, 0, 5.8, 0));
  onGround(tower, minX + 2.0, maxZ - 2.0, { tiltToSlope: false });
  group.add(tower);
}

// ---------------------------------------------------------------- rooms

function roomFloorAndRoof(group, room, fadeables, roofs) {
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const w = maxX - minX, d = maxZ - minZ;
  const y = depotHeight(cx, cz);

  // The slab carries what the room is FOR. The corridor is a plant room and
  // the plant leaks, so its stain sits under the generator; the magazine is
  // where ammunition is handled, so its floor is filmed with the dust of it;
  // the holding room is just a room people have been kept in. Coordinates come
  // from the zone's own anchor, never from a number typed in here.
  const anchor = ZONES[room.zone]?.anchor || { x: cx, z: cz };
  const FLOOR_ROLE = {
    CORRIDOR: { stain: [anchor.x + 1.5, anchor.z - 1.0], stainR: 2.8, dirt: 0.7 },
    AMMO_ROOM: { stain: [anchor.x, anchor.z], stainR: 1.4, dirt: 1.35 },
    HOLDING: { stain: [anchor.x - 2.0, anchor.z - 2.0], stainR: 1.6, dirt: 0.55 },
  };
  const floorMat = cloneFade(MAT.floor, {
    seed: rand(cx * 13.1 + cz * 7.7) * 61,
    base: y,
    ...(FLOOR_ROLE[room.zone] || {}),
  });
  const floor = box(w, 0.12, d, floorMat, cx, y + 0.06, cz);
  floor.receiveShadow = true;
  floor.castShadow = false;
  group.add(floor);

  const roofMat = cloneFade(MAT.roof, {
    base: y + room.height, top: 0.5, seed: rand(cx * 3.9 + cz * 17.3) * 53,
  });
  const roof = box(w + 0.4, 0.26, d + 0.4, roofMat, cx, y + room.height + 0.13, cz);
  group.add(roof);
  const roofMeshes = [roof];
  const entry = { zone: room.zone, bounds: room.bounds, materials: [roofMat], meshes: roofMeshes };
  roofs.push(entry);

  // Parapet, so the roof reads as a roof and not a lid.
  for (const [pw, pd, px, pz] of [
    [w + 0.5, 0.18, cx, minZ - 0.2], [w + 0.5, 0.18, cx, maxZ + 0.2],
    [0.18, d + 0.5, minX - 0.2, cz], [0.18, d + 0.5, maxX + 0.2, cz],
  ]) {
    const p = box(pw, 0.34, pd, roofMat, px, y + room.height + 0.4, pz);
    group.add(p);
    roofMeshes.push(p);
  }
}

// A free-standing outbuilding in the yard: four walls with a door in one.
function outbuilding(group, spec, fadeables) {
  const { minX, maxX, minZ, maxZ } = spec.bounds;
  const sides = {
    N: { a: [minX, maxZ], b: [maxX, maxZ] },
    S: { a: [minX, minZ], b: [maxX, minZ] },
    W: { a: [minX, minZ], b: [minX, maxZ] },
    E: { a: [maxX, minZ], b: [maxX, maxZ] },
  };
  for (const [name, seg] of Object.entries(sides)) {
    const doors = (spec.doors || []).filter((d) => d.wall === name)
      .map((d) => ({ at: d.at, width: d.width }));
    buildWall(group, { ...seg, doors }, fadeables, spec.height, MAT.wall, 1.0);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const y = depotHeight(cx, cz);
  const roofMat = cloneFade(MAT.roof, {
    base: y + spec.height, top: 0.4, seed: rand(cx * 23.7 + cz * 5.1) * 71,
  });
  const roof = box(maxX - minX + 0.4, 0.24, maxZ - minZ + 0.4, roofMat,
                   cx, y + spec.height + 0.12, cz);
  group.add(roof);
  fadeables.push({ id: `${spec.id}-roof`, materials: [roofMat], meshes: [roof] });
  const floorMat = cloneFade(MAT.floor, { base: y, dirt: 1.0, seed: rand(cx + cz) * 29 });
  group.add(box(maxX - minX, 0.1, maxZ - minZ, floorMat, cx, y + 0.05, cz));
}

// ---------------------------------------------------------------- hazard

// Fire and smoke. One particle system; the mission moves it and turns it up.
// Visual only — no mechanic hangs off it. It is the storyline's clock, made
// something you can see closing on the ammunition room.
function hazard(group) {
  const root = new THREE.Group();
  root.name = 'compound-hazard';

  const COUNT = 420;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const kind = new Float32Array(COUNT);        // 0 flame, 1 smoke
  for (let i = 0; i < COUNT; i++) {
    seed[i] = rand(i + 7);
    kind[i] = i < COUNT * 0.3 ? 0 : 1;
    pos[i * 3] = (rand(i + 31) - 0.5) * 2.0;
    pos[i * 3 + 1] = rand(i + 61) * 4;
    pos[i * 3 + 2] = (rand(i + 91) - 0.5) * 2.0;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('kind', new THREE.BufferAttribute(kind, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uIntensity: { value: 0 },
      uSpread: { value: 3.0 }, uScale: { value: 700 },
    },
    vertexShader: `
      attribute float seed; attribute float kind;
      uniform float uTime, uIntensity, uSpread, uScale;
      varying float vKind; varying float vLife;
      void main() {
        float speed = mix(2.0, 0.85, kind);
        float life = fract(seed + uTime * speed * 0.14);
        vLife = life; vKind = kind;
        vec3 p = position;
        p.y = mix(0.15, mix(5.0, 11.0, kind), life) * (0.6 + uIntensity * 0.4);
        float spread = life * uSpread * mix(0.5, 1.6, kind);
        p.x += sin(seed * 31.0 + uTime * 0.6) * spread;
        p.z += cos(seed * 17.0 + uTime * 0.45) * spread;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(0.45, 2.6, kind) * (0.35 + life * 1.5) * (0.5 + uIntensity * 0.5);
        gl_PointSize = size * uScale * projectionMatrix[1][1] * 0.1;
      }`,
    fragmentShader: `
      uniform float uIntensity;
      varying float vKind; varying float vLife;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.05, length(d));
        if (a < 0.02) discard;
        vec3 flame = mix(vec3(1.0, 0.90, 0.58), vec3(0.92, 0.26, 0.08), vLife);
        vec3 smoke = mix(vec3(0.34, 0.32, 0.31), vec3(0.15, 0.14, 0.14), vLife);
        vec3 c = mix(flame, smoke, vKind);
        float fade = mix(1.0 - vLife, (1.0 - vLife) * 0.55, vKind);
        gl_FragColor = vec4(c, a * fade * uIntensity * mix(0.9, 0.38, vKind));
      }`,
    transparent: true, depthWrite: false,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  root.add(points);

  const light = new THREE.PointLight(0xff7a2a, 0, 26, 2);
  light.position.set(0, 2.4, 0);
  root.add(light);

  root.visible = false;
  onGround(root, FIRE_SOURCE.x, FIRE_SOURCE.z, { tiltToSlope: false });
  group.add(root);

  return {
    group: root,
    material,
    light,
    // level 0 = out. 1 = the fuel store alight, back in the yard.
    // 2 = smoke has reached the corridor. 3 = it is on the ammunition room.
    setStage(level, at, spread = 3.0, density = 1) {
      root.visible = level > 0;
      if (!root.visible) return;
      if (at) onGround(root, at.x, at.z, { tiltToSlope: false });
      material.uniforms.uIntensity.value = Math.min(1, 0.45 + density * 0.55);
      material.uniforms.uSpread.value = spread;
      light.intensity = level >= 2 ? 10 : 24;
      light.distance = 18 + spread * 2;
    },
    update(dt, t) { material.uniforms.uTime.value = t; },
  };
}

// ---------------------------------------------------------------- props

const PROPS = [
  // --- the yard
  ['container', -6.5, 2.0, { size: 2.6, rot: 0.08 }],
  ['container', -6.2, -1.2, { size: 2.6, rot: 0.05 }],
  // The east-corner crate stack. The turn-4 contact stands behind THIS, so
  // it has to be at his shoulder rather than somewhere else in the yard.
  ['supply-crate', 7.6, 4.2, { height: 1.2, rot: 0.15 }],
  ['supply-crate', 8.8, 4.6, { height: 1.0, rot: 0.5 }],
  ['supply-crate', 7.9, 5.4, { height: 0.9, rot: 0.3 }],
  ['barrel', 6.6, 3.6, { height: 0.95, rot: 0.4 }],
  ['barrel', 2.6, 6.6, { height: 0.95, rot: 0.9 }],
  ['drum', -2.0, 3.6, { height: 1.0, rot: 0.2 }],
  ['sign-hazard', 4.2, 7.2, { size: 1.1, rot: 0.4 }],
  ['fuel-can', 4.4, 9.4, { height: 0.6, rot: 0.3 }],
  ['propane-tank', 6.8, 9.6, { height: 1.6, rot: 0.5 }],
  ['storage-tank', 7.4, 7.0, { height: 3.2, rot: 0.0 }],

  // --- the gate
  ['floodlight', -7.4, 10.5, { height: 4.2, rot: 2.6 }],
  ['sign-hazard', -7.6, 4.5, { size: 1.0, rot: 1.2 }],

  // --- the holding room (inside)
  ['terminal', 5.4, -8.6, { height: 1.1, rot: 1.1 }],
  ['supply-crate', 13.4, -1.6, { height: 0.8, rot: 0.3 }],

  // --- the corridor: the plant that throws the EM
  ['ac-stacked', 20.2, -6.2, { height: 1.7, rot: 0.2 }],
  ['pipe-straight', 17.0, -9.2, { size: 2.6, rot: 0.0 }],
  ['cable-thick', 19.0, -9.3, { height: 0.9, rot: 0.1, anchor: 'top' }],

  // --- the ammunition room
  ['supply-crate', 24.5, -17.0, { height: 1.1, rot: 0.1 }],
  ['supply-crate', 26.2, -17.4, { height: 1.0, rot: 0.4 }],
  ['supply-crate', 28.0, -16.6, { height: 1.1, rot: 0.2 }],
  ['supply-crate', 29.4, -13.0, { height: 0.9, rot: 0.5 }],
  ['barrel', 30.2, -18.2, { height: 0.95, rot: 0.2 }],
  ['sign-hazard', 23.2, -5.4, { size: 1.2, rot: 3.3 }],

  // --- outside the wire
  ['antenna-mast', -13.0, -6.0, { height: 5.0, rot: 0.1 }],
  ['railing', -12.0, 16.0, { size: 2.4, rot: 0.2 }],
];

function placeProps(group, table) {
  for (const [name, x, z, opts = {}] of table) {
    const { group: holder, ready } = spawnProp(name, {
      height: opts.height, size: opts.size,
      anchor: opts.anchor || 'ground', rotY: opts.rot || 0,
    });
    onGround(holder, x, z, { rotY: opts.rot || 0 });
    ready.then((asset) => {
      if (!asset) return;
      asset.model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material && child.material.color) child.material = dusted(child.material);
      });
    });
    group.add(holder);
  }
}

// ---------------------------------------------------------------- assembly

export function createDepotLevel(scene) {
  const group = new THREE.Group();
  group.name = 'compound-14';
  const fadeables = [];
  const roofs = [];

  perimeter(group, fadeables);

  // The building complex, from the shared wall list. Built once each, so
  // HOLDING and CORRIDOR genuinely share an edge rather than having two walls
  // a few centimetres apart with a seam between them.
  for (const seg of WALLS) {
    const room = ROOMS.find((r) => seg.tag && seg.tag.startsWith(r.zone.toLowerCase().split('_')[0]));
    buildWall(group, seg, fadeables, room?.height ?? 3.4, MAT.wall);
  }
  for (const room of ROOMS) roomFloorAndRoof(group, room, fadeables, roofs);
  for (const spec of OUTBUILDINGS) outbuilding(group, spec, fadeables);

  // The holding room door — the Director's breach beat reaches for this.
  const holdingDoor = box(2.2, 2.3, 0.16, MAT.metal, 0, 0, 0);
  onGround(holdingDoor, 7.3, 0, { tiltToSlope: false });
  holdingDoor.position.y += 1.15;
  holdingDoor.name = 'holding-door';
  // Its own copy, because the occlusion system fades it independently — and
  // through cloneFade, so it keeps its surface. The weathering is turned down:
  // this door is opened several times a day and the paint on it shows it.
  holdingDoor.material = cloneFade(MAT.metal, { base: depotHeight(7.3, 0), dirt: 0.45, seed: 17 });
  holdingDoor.material.emissive = new THREE.Color(0x4ce0d8);
  holdingDoor.material.emissiveIntensity = 0.18;
  group.add(holdingDoor);
  fadeables.push({ id: 'holding-door', materials: [holdingDoor.material], meshes: [holdingDoor] });

  // The filing cabinet the sixth figure is behind. Small, and the most
  // important object in the mission.
  const cabinet = box(1.0, 1.5, 0.7, MAT.dark, 0, 0, 0);
  onGround(cabinet, 11.8, -7.4, { rotY: 0.3, tiltToSlope: false });
  cabinet.position.y += 0.75;
  cabinet.name = 'cabinet';
  group.add(cabinet);

  // The generator plant in the corridor — turn 7's EM source.
  const genUnit = box(2.4, 1.5, 1.4, MAT.metal, 0, 0, 0);
  onGround(genUnit, 20.4, -8.6, { rotY: 0.1 });
  genUnit.position.y += 0.75;
  genUnit.name = 'generator';
  group.add(genUnit);

  // The ammunition stack and its charge indicator. `tower` and `beacon` in
  // the level contract, so turn 10's `relay` FX detonates exactly here.
  const stack = new THREE.Group();
  stack.name = 'ammunition-stack';
  for (let i = 0; i < 10; i++) {
    const row = i % 5, tier = Math.floor(i / 5);
    stack.add(box(1.5, 0.85, 1.1, MAT.concreteDark,
                  -2.6 + row * 1.3, 0.45 + tier * 0.9, 0));
  }
  stack.add(box(7.4, 0.14, 1.5, MAT.metal, 0, 1.86, 0));
  onGround(stack, 27, -13.5, { rotY: 0.04, tiltToSlope: false });
  group.add(stack);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 9),
    new THREE.MeshStandardMaterial({
      color: 0xffb08a, emissive: 0xe0524c, emissiveIntensity: 1.4,
    })
  );
  beacon.position.set(0, 2.3, 0);
  beacon.name = 'charge-indicator';
  stack.add(beacon);

  const chargePanel = box(0.8, 1.0, 0.24, MAT.dark, -3.6, 0.5, 0.8);
  chargePanel.name = 'charge-panel';
  stack.add(chargePanel);

  // THE DEMOLITION CHARGE. Hidden until the squad actually plants it on turn
  // 9 — before that the mission has only ever said the word "charge", and a
  // player watching the board had no way to tell the difference between a
  // charge being set and a number changing in a log line.
  const charge = new THREE.Group();
  charge.name = 'demolition-charge';
  charge.visible = false;

  const satchelMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f28, roughness: 0.85, metalness: 0.1, flatShading: true,
  });
  const tapeMat = new THREE.MeshStandardMaterial({
    color: 0xc7a23a, roughness: 0.9, flatShading: true,
  });

  // Satchel, strapped flat against the stack.
  charge.add(box(1.25, 0.55, 0.42, satchelMat, 0, 0, 0));
  charge.add(box(1.32, 0.10, 0.45, tapeMat, 0, 0.16, 0));
  charge.add(box(1.32, 0.10, 0.45, tapeMat, 0, -0.16, 0));

  // Detonator block and its arming light.
  charge.add(box(0.34, 0.26, 0.20, MAT.dark, 0.42, 0.30, 0.20));
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xff6b60, emissive: 0xe0524c, emissiveIntensity: 0,
    })
  );
  lamp.position.set(0.42, 0.46, 0.22);
  lamp.name = 'charge-lamp';
  charge.add(lamp);

  // Det cord running down into the stack — the detail that makes it read as
  // placed by hand rather than dropped in.
  for (let i = 0; i < 5; i++) {
    const seg = box(0.05, 0.05, 0.22, tapeMat,
                    -0.2 - i * 0.14, -0.30 - i * 0.07, 0.18 + i * 0.03);
    seg.rotation.z = 0.5 + i * 0.08;
    charge.add(seg);
  }

  charge.position.set(-1.1, 1.55, 0.72);
  charge.rotation.y = 0.18;
  stack.add(charge);

  const fire = hazard(group);
  placeProps(group, PROPS);

  scene.add(group);
  console.log(`[depot] Compound 14 — ${WALLS.length} shared wall runs, ${ROOMS.length} rooms, `
    + `${OUTBUILDINGS.length} outbuildings, ${fadeables.length} fadeable meshes`);

  return {
    group,
    door: holdingDoor,
    tower: stack,
    beacon,
    charge,
    chargeLamp: lamp,
    generator: genUnit,
    relayConsole: chargePanel,
    fire,
    fadeables,
    roofs,
    zones: ZONES,
  };
}
