import * as THREE from 'three';

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
export const SURFACE = {
  concrete:    { color: 0x2c332f, roughness: 0.95, metalness: 0.02 },
  concreteDim: { color: 0x212724, roughness: 0.96, metalness: 0.02 },
  steel:       { color: 0x39423f, roughness: 0.62, metalness: 0.55 },
  steelDark:   { color: 0x252c2a, roughness: 0.70, metalness: 0.50 },
  steelLight:  { color: 0x4b5652, roughness: 0.55, metalness: 0.60 },
  rubber:      { color: 0x14181a, roughness: 0.95, metalness: 0.02 },
  // Corrosion, pulled well down in saturation. The kit's safety orange is a
  // daylight colour; left anywhere near full strength it turns every pipe run
  // in the compound chocolate brown and drags the whole board warm.
  rust:        { color: 0x463228, roughness: 0.95, metalness: 0.12 },
  rustDark:    { color: 0x2e241c, roughness: 0.96, metalness: 0.10 },
  hazard:      { color: 0x6a5228, roughness: 0.82, metalness: 0.20 },
  paintRed:    { color: 0x452421, roughness: 0.90, metalness: 0.08 },
  paintGreen:  { color: 0x28322a, roughness: 0.90, metalness: 0.08 },
  wood:        { color: 0x33281f, roughness: 0.98, metalness: 0.00 },
  glass:       { color: 0x1c2a2c, roughness: 0.25, metalness: 0.30, emissive: 0x0c2422, emissiveIntensity: 0.30 },
  // Squad and hostile chassis. Deliberately lighter than the compound around
  // them: a unit has to stay readable through fog and under a cone, and the
  // props are allowed to sink into the dark in a way the robots are not.
  armour:      { color: 0x4a5752, roughness: 0.55, metalness: 0.42 },
  armourDark:  { color: 0x333e3a, roughness: 0.64, metalness: 0.36 },
  armourTrim:  { color: 0x66756e, roughness: 0.46, metalness: 0.55 },
  // Powered surfaces. The only things in the compound that give off light, so
  // they carry the eye — keep them rare, and keep them *dim*. Under ACES at
  // this exposure anything much above 0.5 on a saturated colour clips to flat
  // white and the prop stops reading as an object.
  screen:      { color: 0x16302f, roughness: 0.40, metalness: 0.20, emissive: 0x2f8f8a, emissiveIntensity: 0.42 },
  lamp:        { color: 0x6d6350, roughness: 0.45, metalness: 0.10, emissive: 0xe0aa72, emissiveIntensity: 0.85 },
  signage:     { color: 0x5d6763, roughness: 0.80, metalness: 0.10 },
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
  const mat = new THREE.MeshStandardMaterial({
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
      const surface = overrides[kitName] || KIT_SURFACE[kitName] || 'concrete';

      if (isolateSet.has(kitName)) {
        // One copy per kit material name, not per mesh: a robot's eye is split
        // across several primitives and they must all tint together.
        if (!isolated[kitName]) {
          const own = surfaceMaterial(surface, { flatShading }).clone();
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
