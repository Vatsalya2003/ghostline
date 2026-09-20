import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { retint, cloneSurface } from './Materials.js';

// GLB loading for the whole scene.
//
// Three rules the rest of the render code relies on:
//
//   1. Every file is fetched exactly once and parsed once. Instances are
//      clones, so three ALPHA-class walkers cost one download and one parse.
//   2. Materials are remapped to the GHOSTLINE palette at parse time, before
//      anything is shown, and then shared across clones. See Materials.js.
//   3. Nothing here ever blocks. Models stream in while the title card is up;
//      callers get a group immediately and the geometry lands inside it when
//      it arrives. If a file is missing or corrupt the caller's own fallback
//      geometry stays on screen and the mission still plays — same contract
//      the audio system uses for its synth fallback.
//
// Kit models arrive at wildly different scales (a trashcan measures 6.7 units
// tall, a crate 0.5) and are not consistently anchored to the floor. Callers
// therefore ask for a real-world height and get it, whatever the file says.

// Root-relative paths only resolve when the app is served from the domain
// root. Audio.js and Voice.js already derive theirs from BASE_URL; these two
// were the last absolute URLs in the app, and with `base: './'` they were the
// one thing that would still have gone looking at the host root for models
// that live beside index.html.
const BASE = import.meta.env?.BASE_URL || '/';
const MODELS = `${BASE}assets/models`;
const ENVIRONMENT = `${BASE}assets/environment`;

const loader = new GLTFLoader();
const cache = new Map();   // url -> Promise<{ scene, animations }>

export const assetErrors = [];

function load(url) {
  const hit = cache.get(url);
  if (hit) return hit;

  const p = new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations || [] }),
      undefined,
      (err) => {
        // Never reject: a missing prop must not take the mission down with it.
        assetErrors.push({ url, message: err?.message || String(err) });
        console.warn(`[assets] ${url} failed to load — falling back`, err);
        resolve(null);
      }
    );
  });

  cache.set(url, p);
  return p;
}

export const modelUrl = (name) => `${MODELS}/${name}.glb`;
export const propUrl = (name) => `${ENVIRONMENT}/${name}.glb`;

// Parse once, retint once, then hand out clones.
//
// The tint options are part of the key: the same file requested with a
// different override table is a different prepared asset, and silently
// handing back the first caller's colours would be a very quiet bug.
async function prepared(url, tintOptions) {
  const key = `${url}::${JSON.stringify(tintOptions)}`;
  if (cache.has(key)) return cache.get(key);

  const p = load(url).then((asset) => {
    if (!asset) return null;
    retint(asset.scene, tintOptions);
    asset.scene.updateMatrixWorld(true);

    // Measured here, on the source, and reused by every clone.
    //
    // This is not just a saving. A freshly cloned skinned mesh has bone
    // matrices that have not been evaluated yet, and Box3.setFromObject reads
    // straight through them — the walker measures 46 units tall and lands on
    // screen at 4% scale. The source has a settled bind pose, so it is the
    // only thing worth measuring.
    const box = new THREE.Box3().setFromObject(asset.scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    asset.bounds = { size, minY: box.min.y };
    return asset;
  });

  cache.set(key, p);
  return p;
}

// Scale a model and sit it on y = 0, using the bounds measured on the source.
//
// Two ways to ask for a size, because one is not enough. `height` is right for
// anything that stands up — a mast, a barrel, a terminal. `size` fits the
// model's *largest* dimension instead, which is the only sane option for flat
// props: a floor pipe is 2.4 long and 0.2 tall, and asking for it to be 1.5
// tall inflates it sevenfold into a chocolate-brown aqueduct.
//
// `anchor: 'center'` keeps the model's own origin, for things that hang or
// are placed by their middle rather than their base.
function normalise(object, bounds, { height, size, anchor = 'ground' }) {
  if (!bounds || !(bounds.size.y > 1e-5)) return;

  let s = 1;
  if (size) s = size / Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  else if (height) s = height / bounds.size.y;

  if (s !== 1) object.scale.multiplyScalar(s);
  if (anchor === 'ground') object.position.y -= bounds.minY * s;
}

// An instance of a model, delivered asynchronously into a group you can
// position and parent right now.
//
// Returns { group, ready } — `ready` resolves with { model, animations,
// tinted } once the file lands, or with null if it never does.
export function spawn(url, {
  height = null,
  size = null,
  anchor = 'ground',
  rotY = 0,
  skinned = false,
  overrides = {},
  isolate = [],
  flatShading = true,
} = {}) {
  const group = new THREE.Group();

  const ready = prepared(url, { overrides, isolate, flatShading }).then((asset) => {
    if (!asset) return null;

    // Skinned meshes need the skeleton rebuilt against the cloned bones;
    // Object3D.clone() would leave every instance driven by the original.
    const model = skinned ? cloneSkinned(asset.scene) : asset.scene.clone(true);

    // Isolated materials are per-instance by definition — a second clone of
    // the source's copy, so two walkers can hold different status colours.
    const tinted = {};
    if (isolate.length) {
      const own = new Map();
      model.traverse((obj) => {
        if (!obj.isMesh && !obj.isSkinnedMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const next = mats.map((m) => {
          if (!m?.name?.startsWith('tint:')) return m;
          if (!own.has(m.name)) {
            // cloneSurface, not clone: a plain clone drops the triplanar
            // compile hook and the instance comes out untextured.
            const copy = cloneSurface(m);
            own.set(m.name, copy);
            tinted[m.name.slice(5)] = copy;
          }
          return own.get(m.name);
        });
        obj.material = Array.isArray(obj.material) ? next : next[0];
      });
    }

    normalise(model, asset.bounds, { height, size, anchor });
    model.rotation.y += rotY;
    group.add(model);
    return { model, animations: asset.animations, tinted, bounds: asset.bounds };
  });

  return { group, ready };
}

export const spawnModel = (name, opts) => spawn(modelUrl(name), opts);
export const spawnProp = (name, opts) => spawn(propUrl(name), opts);

// Warm the cache for everything the mission needs, so the swap from fallback
// geometry to real models happens behind the title card rather than mid-beat.
// Fire-and-forget: the returned promise is for tests and the verify script.
export function preload(names = [], props = []) {
  return Promise.all([
    ...names.map((n) => load(modelUrl(n))),
    ...props.map((n) => load(propUrl(n))),
  ]);
}
