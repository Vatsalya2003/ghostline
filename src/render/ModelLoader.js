import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Mixamo FBX loading, kept in one place so the swap to GLB later touches
// exactly this file.
//
// ⚠ ASSET WARNING: every file in /public/models is a ~98MB full character
// export with embedded 4K textures — the "animation only" files included.
// Loading all 30 would be ~2.8GB. We load the character plus a curated set
// of clips, and throw away the redundant meshes that come with them.

export const MODEL_PATH = '/models/AI_ARMBOT.fbx';

// Mixamo exports in centimetres.
export const MODEL_SCALE = 0.01;

// Measured from the bind pose (shoulder-to-shoulder cross up): this character
// faces -Z, while our sensor wedges point +Z. Half a turn brings them into
// line. The idle clip skews the torso a further ~20 degrees, which is the
// animation, not the rig.
export const MODEL_FACING_OFFSET = Math.PI;

// Clip name → file. There is no plain "idle" export in /public/models, so
// the walk-to-idle transition stands in as the resting pose.
export const CLIP_FILES = {
  idle: 'rifle-crouch-walk-to-idle.fbx',
  walk: 'walk-forward.fbx',
  glitch: 'sensor-error.fbx',
  hit: 'death-from-the-front.fbx',
};

export const DEFAULT_CLIP = 'idle';

const loader = new FBXLoader();

function load(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

// Mixamo clips carry hip translation. Our movement is GSAP tweening the unit
// group, so root motion would fight it and slide the character off its tile.
function stripRootMotion(clip) {
  clip.tracks = clip.tracks.filter(
    (track) => !/(mixamorig.*Hips)\.position$/i.test(track.name)
  );
  return clip;
}

function logBounds(object, label) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  console.log(
    `[model] ${label} bounds — w ${size.x.toFixed(2)} h ${size.y.toFixed(2)} ` +
    `d ${size.z.toFixed(2)} | centre y ${centre.y.toFixed(2)} | ` +
    `feet y ${box.min.y.toFixed(2)}`
  );
  return { box, size, centre };
}

export async function loadCharacter() {
  const t0 = performance.now();
  const root = await load(MODEL_PATH);
  const loadMs = performance.now() - t0;

  // Raw, before scaling — tells us straight away if this really is centimetres.
  logBounds(root, 'raw (as exported)');

  root.scale.setScalar(MODEL_SCALE);
  root.updateMatrixWorld(true);
  const { box } = logBounds(root, `scaled x${MODEL_SCALE}`);

  // Drop the model so its feet sit on y=0 regardless of the export's origin.
  const footOffset = -box.min.y;

  root.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;   // skinned bounds go stale when animated
    }
  });

  const clips = new Map();
  if (root.animations?.length) {
    clips.set('base', stripRootMotion(root.animations[0]));
  }

  console.log(`[model] character loaded in ${(loadMs / 1000).toFixed(2)}s`);

  return { root, clips, footOffset, loadMs };
}

// Each animation file drags a whole redundant character along with it; we
// keep the AnimationClip and let the rest be garbage collected.
export async function loadClips(clips = CLIP_FILES) {
  const out = new Map();
  for (const [name, file] of Object.entries(clips)) {
    const t0 = performance.now();
    try {
      const fbx = await load(`/models/${file}`);
      if (!fbx.animations?.length) {
        console.warn(`[model] ${file} contains no animation — skipped`);
        continue;
      }
      const clip = stripRootMotion(fbx.animations[0]);
      clip.name = name;              // every Mixamo clip is called "mixamo.com"
      out.set(name, clip);
      console.log(`[model] clip "${name}" from ${file} in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
    } catch (err) {
      console.warn(`[model] failed to load clip "${name}" from ${file}`, err);
    }
  }
  return out;
}
