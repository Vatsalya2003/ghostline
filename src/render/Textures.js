import * as THREE from 'three';

// PBR surfaces for geometry that has no UVs.
//
// WHY TRIPLANAR: every prop in the CC0 environment kit ships without a
// TEXCOORD_0 attribute — `barrel.glb`, `container.glb` and `supply-crate.glb`
// are all position/normal only. UV-mapped textures are therefore not an option
// on the props at all, and the compound was flat-shaded colour as a result.
// Triplanar projection samples the material in world space along the three
// cardinal planes and blends by face normal, so a surface texture lands on any
// mesh regardless of what its author did or did not unwrap.
//
// It also solves the terrain's other problem for free: a world-space
// projection does not stretch on a slope the way a planar UV does.
//
// HOW IT DEGRADES: the maps are fetched after the scene is already on screen.
// Until they land — or forever, if `public/assets/textures` is missing — every
// sampler holds a neutral 1x1 value (white albedo, white roughness, flat
// normal) which multiplies out to exactly the flat-colour material the scene
// had before. A missing texture is a softer look, never a black prop and never
// a failed frame. Same contract as AssetLoader and the audio synth fallback.
//
// Sources and licences: public/assets/textures/SOURCES.md.

const BASE = `${import.meta.env?.BASE_URL || '/'}assets/textures/`;

export const textureErrors = [];

// Software WebGL (llvmpipe, SwiftShader) runs the headless screenshot and e2e
// passes at a couple of frames a second. Nine texture fetches per fragment is
// the wrong thing to ask of it.
//
// The low tier keeps the *projection* — all three axes for albedo — and drops
// the two maps that cost the other six fetches. An earlier version dropped to
// a single Y-planar sample instead, which is a third of the cost and looks
// broken: a planar Y projection smears vertically down every wall in the
// compound, because a vertical face has no variation along the axis being
// projected. Cheap is not worth wrong. Three taps, correct on every face.
//
// `?tier=high` or `?tier=low` forces it, which is how the headless screenshot
// harness gets a look at what a real GPU will actually draw.
let tier = 'high';
// `tier` has a default so a material built before any renderer exists still
// gets a shader; `tierKnown` records whether that default has been checked
// against an actual GPU yet. Only the resolution choice cares — see HAS_4K.
let tierKnown = false;
export const renderTier = () => tier;

function forcedTier() {
  if (typeof location === 'undefined') return null;
  const t = new URLSearchParams(location.search).get('tier');
  return t === 'high' || t === 'low' ? t : null;
}

export function detectTier(renderer) {
  tierKnown = true;
  const forced = forcedTier();
  if (forced) {
    tier = forced;
    console.log(`[textures] tier forced to ${tier}`);
    return tier;
  }
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|softwarerasterizer|mesa offscreen/i.test(name)) tier = 'low';
    console.log(`[textures] GPU "${name || 'unknown'}" — tier ${tier}`);
  } catch {
    /* no debug info extension: assume a real GPU and carry on */
  }
  return tier;
}

// --------------------------------------------------------------- resolution

// The library ships every slot at 2048 and three slots at 4096, and the tier
// picks which directory to read at load time:
//
//   <slot>/2k/albedo.jpg   every slot — and everything 'low' will ever fetch
//   <slot>/4k/albedo.jpg   the three surfaces that fill the frame
//
// WHY NOT 4K EVERYWHERE: a 4096² map is 67 MB of VRAM once it is decoded to
// RGBA, and a third again for its mip chain. Three maps for each of eleven
// slots at that size is about 3 GB, which thrashes or kills most GPUs and is
// far worse on the software rasteriser the headless harness runs on. The JPEG
// on disk is 6 MB; the decoded footprint is the cost that matters, and it does
// not care how well the file compressed.
//
// WHY THESE THREE: `scale` is in world units, so it decides how much screen a
// texel gets. The terrain runs at 0.33 and the pad at 0.38 — one repeat every
// three metres, across the widest surfaces on the board. A prop runs at 3 to 5,
// which puts a whole repeat inside about twenty screen pixels at the tactical
// zoom; a 4K map there would buy several hundred megabytes of mip levels that
// nothing ever samples. `ground-sand` stays at 2K for the same reason from the
// other direction: the depot ground shader only reads its albedo, and only as
// a partial splat weight over the dirt.
//
// 'low' cannot reach a 4K file, and neither can code that runs before the GPU
// has been looked at. Both guards are deliberate: `tierKnown` is the one that
// matters, because `tier` defaults to 'high' and a set built at module scope
// would otherwise commit to 4K on a software rasteriser. A headless run
// fetching three 4096² concrete maps it could never sample is exactly what
// this cost before the guard went in.
const HAS_4K = new Set(['ground-dirt', 'ground-gravel', 'concrete']);

export const setResolution = (name) =>
  (tierKnown && tier === 'high' && HAS_4K.has(name) ? '4k' : '2k');

// ------------------------------------------------------------------ loading

const loader = new THREE.TextureLoader();
const sets = new Map();     // name -> { albedo, normal, rough }

function neutral(rgb) {
  const data = new Uint8Array([...rgb, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

// Held at module scope: every material that has not resolved yet points at
// these, and they must stay valid for the life of the page.
const NEUTRAL = {
  albedo: neutral([255, 255, 255]),   // multiplies to no change
  normal: neutral([128, 128, 255]),   // flat tangent-space normal
  rough:  neutral([255, 255, 255]),   // roughness unscaled
};

function loadMap(set, file, srgb) {
  const url = `${BASE}${set}/${setResolution(set)}/${file}`;
  const tex = loader.load(
    url,
    undefined,
    undefined,
    () => {
      // Missing map: leave the slot neutral rather than sampling a blank
      // black texture, which would paint the prop black.
      textureErrors.push(url);
    },
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// A named PBR set from public/assets/textures/<name>/.
//
// The low tier samples albedo only, so it does not fetch the other two maps —
// two thirds of the library left on disk. That matters more than the bytes
// suggest: a software rasteriser decodes and uploads a 2048² JPEG slowly
// enough that loading all three tripled time-to-first-frame and pushed the
// headless e2e run past its twenty-second boot budget. A map the shader will
// not read is not worth a millisecond.
//
// Between the two, low draws eleven 2048² albedos and nothing else — about
// 250 MB decoded with mips, against roughly 1.3 GB for high.
//
// BUILT ON FIRST ACCESS, NOT ON THE CALL. `MAT` in DepotLevel.js is a
// module-scope table of finished materials, so it runs fadeMat() — and asks
// for its sets — while the module graph is still evaluating. That is before
// any renderer exists and therefore before detectTier() has looked at the GPU,
// so building eagerly pinned those four sets (concrete, metal-corrugated,
// metal-plate, metal-rust) to the default tier. The observed symptom was a
// SwiftShader run pulling concrete/4k/albedo.jpg, normal.jpg and rough.jpg —
// three 4096² maps onto a rasteriser that does not even compile the code to
// sample them, plus five more maps the low shader ignores. Eleven fetches
// where nineteen used to be.
//
// (Materials.js is not affected: its SURFACE table is plain data and
// surfaceMaterial() builds on demand, which is already late enough.)
//
// Nothing reads a map until shader-compile time — `compile()` here and the
// ground's onBeforeCompile in Depot.js are the only readers, and both run on
// the first render, long after detectTier(). So deferring to the getter puts
// the decision in the right order without DepotLevel or Materials having to
// change how they declare a table.
export function textureSet(name) {
  const hit = sets.get(name);
  if (hit) return hit;

  let maps = null;
  const build = () => {
    if (maps) return maps;
    const full = tier === 'high';
    maps = {
      albedo: loadMap(name, 'albedo.jpg', true),
      normal: full ? loadMap(name, 'normal.jpg', false) : NEUTRAL.normal,
      rough:  full ? loadMap(name, 'rough.jpg', false) : NEUTRAL.rough,
    };
    return maps;
  };
  const set = {
    get albedo() { return build().albedo; },
    get normal() { return build().normal; },
    get rough() { return build().rough; },
    // For preloadTextures and for a check that wants to know whether the
    // fetch has actually been kicked off, as opposed to merely registered.
    get fetched() { return maps !== null; },
    force: build,
  };
  sets.set(name, set);
  return set;
}

// Fetch a set's maps up front so the swap from flat colour to surface happens
// behind the title card rather than a few seconds into the mission.
// Runs immediately after detectTier() in createRenderer, which is what makes
// it safe to force the build here: the tier is known by this point, so these
// sets fetch the right resolution and do it up front rather than on the frame
// that first needs them.
export function preloadTextures(names) {
  for (const n of names) textureSet(n).force();
  return Promise.resolve();
}

// Reachable from the console and from the headless harness without a main.js
// edit — same reasoning as Events.js and Voice.js. A missing texture degrades
// silently by design, which is right for the demo and wrong for a test: this
// is how a check can assert the surfaces actually loaded.
if (typeof window !== 'undefined') {
  window.GHOSTLINE = Object.assign(window.GHOSTLINE || {}, {
    textures: {
      errors: textureErrors,
      tier: () => tier,
      loaded: () => [...sets.entries()].filter(([, s]) => s.fetched).map(([n]) => n),
      registered: () => [...sets.keys()],
      // Which directory each fetched slot actually resolved to. The point of
      // this is for a check to assert the low tier never named a 4K file —
      // reading the branch above and believing it is not the same thing.
      resolutions: () => Object.fromEntries([...sets.entries()]
        .filter(([, s]) => s.fetched).map(([n]) => [n, setResolution(n)])),
    },
  });
}

// ------------------------------------------------------------------- shader

// One blend exponent for everything. Sharper than this and the seam between
// planes reads as a hard line on a curved surface; softer and a wall corner
// turns to mush.
const GLSL_COMMON = /* glsl */`
// three declares normalMatrix in the vertex prefix only. The object-space
// projection needs it here to get its perturbed normal into view space, and a
// uniform declared in both stages links to the one the renderer already sets
// per object — so this costs a line and no plumbing.
uniform mat3 normalMatrix;
uniform sampler2D uTriAlbedo;
uniform sampler2D uTriNormal;
uniform sampler2D uTriRough;
uniform float uTriScale;
uniform float uTriNormalScale;
uniform float uTriRoughLift;
uniform float uTriAlbedoMix;
varying vec3 vTriPos;
varying vec3 vTriNrm;

vec3 triBlendWeights(vec3 n) {
  vec3 b = pow(abs(n), vec3(4.0));
  return b / max(dot(b, vec3(1.0)), 1e-4);
}
`;

const GLSL_ALBEDO = /* glsl */`
  vec3 triN = normalize(vTriNrm);
  vec3 triW = triBlendWeights(triN);
  vec2 triUvX = vTriPos.zy * uTriScale;
  vec2 triUvY = vTriPos.xz * uTriScale;
  vec2 triUvZ = vTriPos.xy * uTriScale;
  vec3 triCol = texture2D(uTriAlbedo, triUvX).rgb * triW.x
              + texture2D(uTriAlbedo, triUvY).rgb * triW.y
              + texture2D(uTriAlbedo, triUvZ).rgb * triW.z;
  // The detail map MODULATES the surface, it does not replace it.
  //
  // A photographic albedo averages around 0.35 luminance. Multiplying it
  // straight into a material that already has a colour — and, on the terrain
  // and the pad, into a macro map underneath as well — multiplies two albedos
  // together and lands at a tenth of the brightness either was authored for.
  // That is what turned the whole installation into brown mud.
  //
  // Mixing toward white instead keeps all of the texture's variation and lets
  // each surface choose how much of its own value it gives up for it.
  diffuseColor.rgb *= mix(vec3(1.0), triCol, uTriAlbedoMix);
`;

// Low tier keeps the full projection and loses only the other two maps, so
// the saving is in fetches rather than in correctness.
const GLSL_ALBEDO_LOW = GLSL_ALBEDO;

const GLSL_ROUGH = /* glsl */`
float roughnessFactor = roughness;
{
  vec3 rn = normalize(vTriNrm);
  vec3 rw = triBlendWeights(rn);
  float r = texture2D(uTriRough, vTriPos.zy * uTriScale).g * rw.x
          + texture2D(uTriRough, vTriPos.xz * uTriScale).g * rw.y
          + texture2D(uTriRough, vTriPos.xy * uTriScale).g * rw.z;
  // Lift keeps a very smooth source map from turning a weathered prop into a
  // mirror under the low sun.
  roughnessFactor *= mix(1.0, r, 0.85) + uTriRoughLift;
  roughnessFactor = clamp(roughnessFactor, 0.04, 1.0);
}
`;

// No roughness map on the low tier: the material's own constant stands in.
const GLSL_ROUGH_LOW = 'float roughnessFactor = roughness;';

// Whiteout blending: the three tangent-space samples are swizzled into world
// orientation and summed, rather than averaged as vectors, which is what keeps
// detail alive across the blend instead of cancelling it out.
const GLSL_NORMAL = /* glsl */`
{
  vec3 wn = normalize(vTriNrm);
  vec3 bw = triBlendWeights(wn);
  vec3 tx = texture2D(uTriNormal, vTriPos.zy * uTriScale).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(uTriNormal, vTriPos.xz * uTriScale).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(uTriNormal, vTriPos.xy * uTriScale).xyz * 2.0 - 1.0;
  tx = vec3(tx.xy + wn.zy, abs(tx.z) * wn.x);
  ty = vec3(ty.xy + wn.xz, abs(ty.z) * wn.y);
  tz = vec3(tz.xy + wn.xy, abs(tz.z) * wn.z);
  vec3 triNormal = normalize(tx.zyx * bw.x + ty.xzy * bw.y + tz.xyz * bw.z);
  triNormal = normalize(mix(wn, triNormal, uTriNormalScale));
  normal = normalize(TRI_TO_VIEW);
}
`;

const VERTEX_PARS = /* glsl */`
varying vec3 vTriPos;
varying vec3 vTriNrm;
`;

const VERTEX_BODY = /* glsl */`
  vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vTriNrm = normalize(mat3(modelMatrix) * objectNormal);
`;

// InstancedMesh applies its per-instance matrix inside project_vertex, after
// the point where `transformed` is still in object space — so the world
// position has to be rebuilt here or every instance samples the texture as if
// it were sitting at the origin.
const VERTEX_BODY_INSTANCED = /* glsl */`
  vTriPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vTriNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
`;

// Object space, for anything that moves under its own power. A world-space
// projection on a walking robot slides the texture across the chassis as it
// crosses the compound — the surface reads as a projected slide rather than
// as paint. Dropping modelMatrix pins the projection to the model instead, so
// it walks with the unit.
//
// It has to be `transformed`, NOT the raw `position` attribute. These are
// skinned meshes, and a skinned mesh's bind-pose positions are not the shape:
// squad-walker.glb's POSITION accessors span 0.02 x 0.06 x 0.03 units, with
// every bit of the robot's actual size living in the bone matrices. Projecting
// the raw attribute samples a couple of texels for the whole chassis, which
// looks exactly like the flat colour this was meant to replace. `transformed`
// is post-skinning and has the model's real extent.
const VERTEX_BODY_OBJECT = /* glsl */`
  vTriPos = transformed;
  vTriNrm = normalize(objectNormal);
`;

// Where the perturbed normal has to end up. World-space projections carry a
// world normal and need the view matrix; object-space ones are already in the
// space normalMatrix is built to convert from.
const TO_VIEW = {
  world: '(viewMatrix * vec4(triNormal, 0.0)).xyz',
  object: 'normalMatrix * triNormal',
};

// Shared by every triplanar material, so they all compile to one program.
function compile(shader) {
  const { set, scale, normalScale, roughLift, albedoMix, instanced, space } = this.userData.tri;
  const low = tier === 'low';

  shader.uniforms.uTriAlbedo = { value: set.albedo };
  shader.uniforms.uTriNormal = { value: set.normal };
  shader.uniforms.uTriRough = { value: set.rough };
  shader.uniforms.uTriScale = { value: scale };
  shader.uniforms.uTriNormalScale = { value: normalScale };
  shader.uniforms.uTriRoughLift = { value: roughLift };
  shader.uniforms.uTriAlbedoMix = { value: albedoMix };

  const body = space === 'object' ? VERTEX_BODY_OBJECT
    : instanced ? VERTEX_BODY_INSTANCED
    : VERTEX_BODY;

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${body}`);

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL_COMMON}`)
    .replace('#include <map_fragment>',
      `#include <map_fragment>\n${low ? GLSL_ALBEDO_LOW : GLSL_ALBEDO}`)
    .replace('#include <roughnessmap_fragment>', low ? GLSL_ROUGH_LOW : GLSL_ROUGH);

  // Normal perturbation is the first thing to go on the low tier: it is the
  // most expensive of the three and the least visible at a tactical zoom.
  if (!low) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_maps>',
        GLSL_NORMAL.replace('TRI_TO_VIEW', TO_VIEW[space] || TO_VIEW.world));
  }
}

// `scale` is in world units: 0.5 means the texture repeats every two metres.
// Tune it per surface — a concrete wall wants a coarser repeat than a crate.
// In object space the unit is the model file's own, so the number is whatever
// that model happens to measure and has to be tuned against it.
export function triplanarMaterial({
  set,
  color = 0xffffff,
  roughness = 1.0,
  metalness = 0.0,
  scale = 0.5,
  normalScale = 1.0,
  roughLift = 0.0,
  // How much of the surface's own value the detail albedo is allowed to take.
  // 1.0 is a straight multiply; the terrain and the concrete pad run far
  // lower because a macro map is already carrying their colour.
  albedoMix = 0.8,
  emissive = 0x000000,
  emissiveIntensity = 0,
  instanced = false,
  space = 'world',
} = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
    // Triplanar normals replace the interpolated ones outright, so flat
    // shading would only fight the map. Smooth is correct here.
    flatShading: false,
  });

  mat.userData.tri = {
    set: textureSet(set),
    scale,
    normalScale,
    roughLift,
    albedoMix,
    instanced,
    space,
  };
  mat.onBeforeCompile = compile;
  // Same source for every instance, so one program serves the whole compound.
  // `map` is part of the key because a caller may hang a non-repeating macro
  // texture on top of the triplanar detail (the terrain and the concrete pad
  // both do) — that flips USE_MAP, which is a different program.
  mat.customProgramCacheKey = function key() {
    return `tri:${space}:${instanced ? 'i' : 'u'}:${tier}:${this.map ? 'm' : '-'}`;
  };
  return mat;
}
