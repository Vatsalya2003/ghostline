import * as THREE from 'three';
import { triplanarMaterial } from './Textures.js';

// Surface palette for the compound.
//
// The CC0 kits these models come from are lit for bright daylight scenes —
// mid greys, saturated safety orange, white plastic. Dropped into GHOSTLINE
// unchanged they read as a toy sci-fi arena under our key light, which is
// exactly the look the art direction is trying to avoid.
//
// So every kit material is remapped by name to a surface below before the
// model is ever shown. One table, applied once per loaded file, and every
// prop in the level lands in the same cold concrete-and-steel range as the
// hand-built geometry it is replacing.
//
// SURFACES ARE NOW TEXTURED. `tex` names a CC0 PBR set under
// public/assets/textures and the surface becomes a triplanar material — the
// kit geometry carries no UVs, so world-space projection is the only way to
// get a real surface onto it. See Textures.js.
//
// `color` is a tint multiplied *into* the albedo map, so these are lifted well
// above where they sat when they were the finished colour: a mid-grey texture
// over the old 0x2c332f concrete lands at roughly a third the brightness it
// needs. Untextured surfaces (the emissive ones) keep their original values.
export const SURFACE = {
  concrete:    { color: 0x2c332f, roughness: 0.95, metalness: 0.02,
                 tex: { set: 'concrete', scale: 0.34, roughLift: 0.05 } },
  concreteDim: { color: 0x212724, roughness: 0.96, metalness: 0.02,
                 tex: { set: 'concrete', scale: 0.30, roughLift: 0.05 } },
  steel:       { color: 0x39423f, roughness: 0.62, metalness: 0.55,
                 tex: { set: 'metal-plate', scale: 0.75 } },
  steelDark:   { color: 0x252c2a, roughness: 0.70, metalness: 0.50,
                 tex: { set: 'metal-plate', scale: 0.75 } },
  steelLight:  { color: 0x4b5652, roughness: 0.55, metalness: 0.60,
                 tex: { set: 'metal-plate', scale: 0.9 } },
  rubber:      { color: 0x14181a, roughness: 0.95, metalness: 0.02 },
  // Corrosion, pulled well down in saturation. The kit's safety orange is a
  // daylight colour; left anywhere near full strength it turns every pipe run
  // in the compound chocolate brown and drags the whole board warm.
  rust:        { color: 0x463228, roughness: 0.95, metalness: 0.12,
                 tex: { set: 'metal-rust', scale: 1.0 } },
  rustDark:    { color: 0x2e241c, roughness: 0.96, metalness: 0.10,
                 tex: { set: 'metal-rust', scale: 1.0 } },
  hazard:      { color: 0x6a5228, roughness: 0.82, metalness: 0.20,
                 tex: { set: 'metal-painted', scale: 0.9 } },
  paintRed:    { color: 0x452421, roughness: 0.90, metalness: 0.08,
                 tex: { set: 'metal-painted', scale: 0.9 } },
  paintGreen:  { color: 0x28322a, roughness: 0.90, metalness: 0.08,
                 tex: { set: 'metal-painted', scale: 0.9 } },
  // Weathered timber, not fresh pine. The kit's `LightWood` is what the guard
  // towers and pallets are made of, and at full warmth a tower reads as
  // playground equipment against a grey compound.
  wood:        { color: 0x33281f, roughness: 0.98, metalness: 0.00,
                 tex: { set: 'wood-planks', scale: 0.95 } },
  glass:       { color: 0x1c2a2c, roughness: 0.25, metalness: 0.30, emissive: 0x0c2422, emissiveIntensity: 0.30 },
  // Squad and hostile chassis. Deliberately lighter than the compound around
  // them: a unit has to stay readable through fog and under a cone, and the
  // props are allowed to sink into the dark in a way the robots are not.
  //
  // Object space, not world: a world-projected texture slides across a walking
  // robot as it crosses the compound.
  //
  // Scale is in the MODEL FILE's units, which are not world units and not
  // obvious — `squad-walker.glb` settles to a 1.29 x 0.91 x 0.89 box, so a
  // scale of 3.2 puts about three repeats across the robot's height. Sub-1
  // values here do not mean "subtle", they mean the whole chassis is covered
  // by a fraction of one tile, which reads as a blotch.
  armour:      { color: 0x4a5752, roughness: 0.55, metalness: 0.42,
                 tex: { set: 'metal-painted', scale: 3.2, space: 'object', normalScale: 0.7 } },
  armourDark:  { color: 0x333e3a, roughness: 0.64, metalness: 0.36,
                 tex: { set: 'metal-painted', scale: 3.2, space: 'object', normalScale: 0.7 } },
  armourTrim:  { color: 0x66756e, roughness: 0.46, metalness: 0.55,
                 tex: { set: 'metal-plate', scale: 4.2, space: 'object', normalScale: 0.6 } },
  // Powered surfaces. The only things in the compound that give off light, so
  // they carry the eye — keep them rare, and keep them *dim*. Under ACES at
  // this exposure anything much above 0.5 on a saturated colour clips to flat
  // white and the prop stops reading as an object.
  screen:      { color: 0x16302f, roughness: 0.40, metalness: 0.20, emissive: 0x2f8f8a, emissiveIntensity: 0.42 },
  lamp:        { color: 0x6d6350, roughness: 0.45, metalness: 0.10, emissive: 0xe0aa72, emissiveIntensity: 0.85 },
  signage:     { color: 0x5d6763, roughness: 0.80, metalness: 0.10,
                 tex: { set: 'metal-painted', scale: 1.2, normalScale: 0.5 } },
  // Sandbags. Coarse weave at a scale where a single bag reads as one bag —
  // too fine and an emplacement turns into a tweed blanket.
  sandbag:     { color: 0x9e8f6d, roughness: 1.0, metalness: 0.0,
                 tex: { set: 'sandbag', scale: 1.7, normalScale: 1.0 } },
  // The earth thrown up over a magazine. Same soil set as the terrain at a
  // coarser repeat, so the berm is made of the ground it came out of without
  // reading as a scaled copy of it. Kept a shade *under* the surrounding pan:
  // a berm lit by the same sun should not be the brightest thing on the board,
  // and at a tan tint these came out as three sand dunes that pulled the eye
  // clean off the compound.
  // Scale is the whole game here. At 0.2 one repeat spans five metres, the
  // soil's grain is magnified into fibres and the berm reads as a haystack —
  // which is a very specific kind of wrong on a military installation. Around
  // 0.6 the grain is soil-sized, and the normal is held well back so the
  // magnified relief does not corrugate it.
  berm:        { color: 0x8d8268, roughness: 1.0, metalness: 0.0,
                 tex: { set: 'ground-dirt', scale: 0.6, normalScale: 0.55, albedoMix: 0.3 } },
  gravel:      { color: 0xb9ae99, roughness: 1.0, metalness: 0.0,
                 tex: { set: 'ground-gravel', scale: 0.5, normalScale: 0.9 } },
  // --- PEOPLE. The guards and the hostages (Actors.js).
  //
  // These are the only meshes in the compound the player is asked to tell
  // apart from each other, so they are allowed to sit brighter and warmer
  // than the concrete they stand on — a hostage who sinks into the floor is
  // a hostage nobody spares.
  //
  // Character models are SKINNED, so any texture here has to be object space:
  // a world projection slides across a figure as it is walked or herded, and
  // the object-space unit is the model's own (~1.75 for a person), so the
  // scale numbers are repeats-per-body-height rather than per-metre.
  //
  // Skin, hair and eyes stay untextured on purpose: a fabric normal on a face
  // reads as damage, and at tactical zoom a head is thirty pixels.
  skin:        { color: 0xc49472, roughness: 0.92, metalness: 0.0 },
  hair:        { color: 0x2a2018, roughness: 0.96, metalness: 0.0 },
  eyeDark:     { color: 0x15110d, roughness: 0.50, metalness: 0.0 },
  // Helmet visor. Dark and a little wet — never emissive: cyan and amber
  // already mean something about the player's own squad on this board.
  visor:       { color: 0x16222b, roughness: 0.22, metalness: 0.60 },
  // Tactical black, and the plate carrier over it. The guards read as a
  // silhouette first, so the two stay close in value and far from the
  // civilians' warm cloth.
  tacticalCloth: { color: 0x4a545b, roughness: 0.92, metalness: 0.04,
                 tex: { set: 'sandbag', scale: 4.0, space: 'object', normalScale: 0.5, albedoMix: 0.35 } },
  tacticalRig: { color: 0x6b7680, roughness: 0.68, metalness: 0.28,
                 tex: { set: 'metal-painted', scale: 4.6, space: 'object', normalScale: 0.6, albedoMix: 0.40 } },
  // Depot workers. The hard hat and the vest are the whole read at forty
  // units: warm, light, and nothing like the black rig opposite them.
  hiVis:       { color: 0xc7a441, roughness: 0.84, metalness: 0.02,
                 tex: { set: 'metal-painted', scale: 4.6, space: 'object', normalScale: 0.4, albedoMix: 0.30 } },
  civVest:     { color: 0xa66037, roughness: 0.90, metalness: 0.0,
                 tex: { set: 'sandbag', scale: 4.4, space: 'object', normalScale: 0.5, albedoMix: 0.35 } },
  civCloth:    { color: 0xaba492, roughness: 0.95, metalness: 0.0,
                 tex: { set: 'sandbag', scale: 4.4, space: 'object', normalScale: 0.6, albedoMix: 0.40 } },
  civTrouser:  { color: 0x5e5240, roughness: 0.95, metalness: 0.0,
                 tex: { set: 'sandbag', scale: 4.4, space: 'object', normalScale: 0.5, albedoMix: 0.35 } },
  civTrouserDark: { color: 0x3d3529, roughness: 0.95, metalness: 0.0,
                 tex: { set: 'sandbag', scale: 4.4, space: 'object', normalScale: 0.5, albedoMix: 0.35 } },
  boot:        { color: 0x1a1b1d, roughness: 0.90, metalness: 0.06 },
  // Cable ties and the tether off them. Pale on purpose — this is the cue
  // turns 5 to 7 are decided on and it has to survive being forty pixels tall.
  restraint:   { color: 0xd9d3c3, roughness: 0.80, metalness: 0.05 },
  // Placeholder for anything the unit/drone code re-tints per instance. The
  // colour here is never seen — setStatus overwrites it on the first frame.
  tint:        { color: 0x4ce0d8, roughness: 0.40, metalness: 0.35, emissive: 0x4ce0d8, emissiveIntensity: 1.60 },
};

// Kit material name -> surface. Names are stable across a whole Quaternius
// pack, so one entry here covers every prop that uses it.
//
// Collisions are real: `Main` is pale grey on the sci-fi props and orange on
// the robots. Callers pass an `overrides` map for their own file to settle
// that locally rather than renaming anything inside the .glb.
const KIT_SURFACE = {
  // structure
  Main: 'concrete',
  Main2: 'concreteDim',
  Grey: 'steel',
  DarkGrey: 'steelDark',
  LightGrey: 'steelLight',
  MetalLight: 'steelLight',
  Black: 'rubber',
  Dark: 'rubber',
  Pipes: 'steelDark',
  Edge: 'steelLight',
  // weathering and warning paint
  Orange: 'rust',
  Accent: 'hazard',
  DarkAccent: 'rustDark',
  Red: 'paintRed',
  DarkRed: 'paintRed',
  White: 'steelLight',
  DarkGreen: 'paintGreen',
  Wood: 'wood',
  LightWood: 'wood',
  // powered
  Screen: 'screen',
  Light: 'lamp',
  Glass: 'glass',
  Texture_Signs: 'signage',
  Eye: 'tint',
  // depot kit — see public/assets/SOURCES.md §6
  Sack: 'sandbag',
  Wood_Light: 'wood',
  Celing: 'steelDark',
  'pavement.065': 'concreteDim',
};

// Kit materials that carry their own baked texture atlas.
//
// Remapping one of these to a flat surface throws away the only thing that
// makes the prop legible: the stencilling on an ammunition box is what says
// "ammunition", and a truck with its markings painted out is a grey wedge.
// They keep their own material and are only knocked back to the scene's
// roughness range so they do not read as showroom plastic.
const KEEP_ORIGINAL = new Set([
  'Atlas', 'Atlas.047', 'M_PCL_Flat_Palette', 'Headlights', 'BrakeLight',
  'George_Texture',
]);

// ...but an atlas authored for a different game is still authored for a
// different game. The truck's is a bright municipal yellow, which arrives as
// the single hottest thing on the board and pulls the eye straight off the
// compound. Multiplying the whole atlas by a drab tint keeps every region's
// relationship to every other — cab still lighter than tyres, markings still
// legible — while landing the vehicle in the same dust range as the ground it
// is parked on.
const KEEP_TINT = {
  Atlas: 0x6f6b4e,              // military-truck — yellow to olive drab
  Headlights: 0xb8b09a,
  BrakeLight: 0x7a3a34,
  'Atlas.047': 0x9c9384,        // gate-barrier — knocked back, stripes kept
  M_PCL_Flat_Palette: 0xa9a08a, // ammo-crate — stencilling stays readable
  George_Texture: 0x9aa494,     // squad mech — drab base; Units.js tints per unit
};

// One THREE material per surface, shared by every mesh that asks for it.
// Draw calls are unaffected but memory and shader compiles are, and it keeps
// a global tweak (say, lifting every concrete surface) to a single object.
const cache = new Map();

export function surfaceMaterial(name, { flatShading = true } = {}) {
  const key = `${name}:${flatShading}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const spec = SURFACE[name] || SURFACE.concrete;

  // A textured surface ignores `flatShading`: the triplanar normal replaces
  // the interpolated one outright, so faceting it would only fight the map.
  const mat = spec.tex
    ? triplanarMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      emissive: spec.emissive ?? 0x000000,
      emissiveIntensity: spec.emissiveIntensity ?? 0,
      ...spec.tex,
    })
    : new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      emissive: spec.emissive ?? 0x000000,
      emissiveIntensity: spec.emissiveIntensity ?? 0,
      flatShading,
    });

  mat.name = `surface:${name}`;
  cache.set(key, mat);
  return mat;
}

// THREE.Material.clone() runs userData through JSON, which turns a texture
// reference into a plain object, and it does not carry onBeforeCompile or
// customProgramCacheKey across at all — so a cloned triplanar material comes
// out silently untextured. Anything that needs its own copy of a surface has
// to go through here.
export function cloneSurface(material) {
  const copy = material.clone();
  const tri = material.userData?.tri;
  if (tri) {
    copy.userData.tri = tri;      // shared: the compile hook only reads it
    copy.onBeforeCompile = material.onBeforeCompile;
    copy.customProgramCacheKey = material.customProgramCacheKey;
  }
  return copy;
}

// Swap every material on a loaded model for its mapped surface.
//
// `overrides` maps kit material name -> surface name and wins over the table
// above. `isolate` lists kit material names that must NOT be shared — the
// caller intends to tint them per instance (unit status colour, drone lens),
// so each one gets its own copy.
export function retint(root, { overrides = {}, isolate = [], flatShading = true } = {}) {
  const isolated = {};
  const isolateSet = new Set(isolate);

  root.traverse((obj) => {
    if (!obj.isMesh && !obj.isSkinnedMesh) return;
    const source = Array.isArray(obj.material) ? obj.material : [obj.material];

    const mapped = source.map((m) => {
      const kitName = m?.name || '';

      // An atlas-textured material is left alone unless the caller asked for
      // it by name. Done once on the shared source, so every clone inherits it.
      if (m && KEEP_ORIGINAL.has(kitName) && !overrides[kitName]) {
        m.roughness = Math.max(m.roughness ?? 1, 0.72);
        m.metalness = Math.min(m.metalness ?? 0, 0.15);
        if (KEEP_TINT[kitName]) m.color.setHex(KEEP_TINT[kitName]);
        return m;
      }

      const surface = overrides[kitName] || KIT_SURFACE[kitName] || 'concrete';

      if (isolateSet.has(kitName)) {
        // One copy per kit material name, not per mesh: a robot's eye is split
        // across several primitives and they must all tint together.
        if (!isolated[kitName]) {
          const own = cloneSurface(surfaceMaterial(surface, { flatShading }));
          own.name = `tint:${kitName}`;
          isolated[kitName] = own;
        }
        return isolated[kitName];
      }
      return surfaceMaterial(surface, { flatShading });
    });

    obj.material = Array.isArray(obj.material) ? mapped : mapped[0];
    obj.castShadow = true;
    obj.receiveShadow = true;
  });

  // Meshes keyed by the kit material they were tinted with, so callers can
  // drive emissive pulses without re-walking the tree.
  return isolated;
}

// Collect the meshes using an isolated material, for hit flashes and the like.
export function meshesUsing(root, material) {
  const out = [];
  root.traverse((obj) => {
    if (!obj.isMesh && !obj.isSkinnedMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (mats.includes(material)) out.push(obj);
  });
  return out;
}
