import * as THREE from 'three';
import { createSky } from './Sky.js';
import { createTerrain } from './Terrain.js';
import { createSeabed } from './Seabed.js';
import { createDepotGround } from './Depot.js';
import { detectTier, renderTier, preloadTextures, triplanarMaterial } from './Textures.js';

// 'day'   — late evening at a semi-arid installation: low sun, long shadows,
//            warm key against a cool sky, practical lights doing real work.
// 'night'  — the original cold compound, untouched.
// Every light, the fog, the sky and the fog-of-war read this constant.
export const ENVIRONMENT = 'day';

// The environment actually in force this session. createScene() sets it from
// the mission, and anything built afterwards — the fog of war especially —
// has to read this rather than the default constant above.
let activeEnvironment = ENVIRONMENT;
export const getEnvironment = () => activeEnvironment;

export const PALETTE = {
  bg: 0x0a0d0a,
  cyan: 0x4ce0d8,
  amber: 0xe0a84c,
  red: 0xe0524c,
  dim: 0x4a5a52,
};

export const GROUND_SIZE = 30;

// Ground texture, drawn in code so nothing loads from disk or a CDN.
//
// This was a bright debug grid. A grid is right for a tactical display and
// wrong for a place — so the concrete now carries the weight (patchy wear,
// blast staining, expansion joints) and the grid survives only as a faint
// survey overlay you read when you look for it.
function makeGroundTexture(tiles = GROUND_SIZE, px = 32) {
  const size = tiles * px;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#121714';
  ctx.fillRect(0, 0, size, size);

  // Deterministic wear. No Math.random anywhere in the render path: the demo
  // is rehearsed and has to come up identical every time.
  const rand = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  // Broad patches of lighter and darker screed.
  for (let i = 0; i < 260; i++) {
    const x = rand(i) * size;
    const y = rand(i + 900) * size;
    const r = 14 + rand(i + 1800) * 74;
    const light = rand(i + 2700) > 0.55;
    ctx.fillStyle = light ? 'rgba(46,58,52,0.16)' : 'rgba(8,11,10,0.20)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine grit, so the surface does not go flat under the key light.
  for (let i = 0; i < 5200; i++) {
    const x = rand(i + 5000) * size;
    const y = rand(i + 7000) * size;
    ctx.fillStyle = rand(i + 9000) > 0.5 ? 'rgba(58,72,64,0.13)' : 'rgba(5,8,7,0.16)';
    ctx.fillRect(x, y, 1.6, 1.6);
  }

  // Expansion joints every 5 tiles — the slab's own structure.
  ctx.strokeStyle = 'rgba(6,9,8,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= tiles; i += 5) {
    const q = i * px + 0.5;
    ctx.beginPath();
    ctx.moveTo(q, 0); ctx.lineTo(q, size);
    ctx.moveTo(0, q); ctx.lineTo(size, q);
    ctx.stroke();
  }

  // Survey grid, barely there. It reads as an overlay on the world rather
  // than as the world's own texture.
  ctx.strokeStyle = 'rgba(78,116,106,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= tiles; i++) {
    const q = i * px + 0.5;
    ctx.beginPath();
    ctx.moveTo(q, 0); ctx.lineTo(q, size);
    ctx.moveTo(0, q); ctx.lineTo(size, q);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Sized to the stage column, not the viewport — the map no longer owns the
  // whole window. `false` keeps CSS in charge of the element's box.
  const stage = document.getElementById('stage');
  renderer.setSize(stage?.clientWidth || window.innerWidth,
                   stage?.clientHeight || window.innerHeight, false);
  // Shadows off: cheaper, and the compound reads better without a hard
  // raking shadow lying across every figure the player has to identify.
  renderer.shadowMap.enabled = false;
  // PCFSoftShadowMap is gone in three r186 — the renderer warns and silently
  // uses PCFShadowMap anyway. Naming it is the same picture with a clean
  // console. VSM is the real soft option and costs more than this demo needs.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Filmic tone mapping with a little headroom. The scene is almost entirely
  // dark surfaces punctuated by hot emissive cyan; linear output clips those
  // highlights to flat white and crushes everything else into the background.
  // ACES keeps the beacon and the sensor eyes reading as *bright* rather than
  // as blown, and holds separation down in the shadows where most of the
  // compound lives.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.setClearColor(ENVIRONMENT === 'day' ? 0x6f7d8c : PALETTE.bg, 1);
  // Low sun, so less exposure lift than a scene lit by emissives alone — but
  // enough to keep the shadow side off the floor.
  if (ENVIRONMENT === 'day') renderer.toneMappingExposure = 1.15;
  // Set again by createScene() once the environment is known — undersea runs
  // darker than anything on the surface.
  renderer.userData = { ...(renderer.userData || {}), baseExposure: renderer.toneMappingExposure };

  // Has to happen before any material is built: the surface tier decides
  // whether triplanar sampling compiles in at all.
  detectTier(renderer);
  preloadTextures([
    'ground-dirt', 'ground-gravel', 'concrete', 'sandbag',
    'metal-plate', 'metal-rust', 'metal-painted', 'wood-planks', 'rock',
  ]);
  return renderer;
}

export function createScene({ environment = ENVIRONMENT, renderer = null } = {}) {
  const undersea = environment === 'undersea';
  const depot = environment === 'depot';
  activeEnvironment = environment;
  // Deep water is dark, but an unreadable board is not a style. The survey
  // lights on the vehicles carry the contrast; the exposure just has to keep
  // the rest of the range above the floor.
  if (undersea && renderer) renderer.toneMappingExposure = 1.3;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(
    undersea ? 0x0d323b : ENVIRONMENT === 'day' ? 0x6f7d8c : PALETTE.bg);

  // Distance haze, linear and deliberately narrow-banded.
  //
  // Exponential fog is the wrong tool here. The camera is orthographic and
  // sits a fixed 40 units back, so *everything* on the board is at roughly the
  // same depth — FogExp2 applies as a near-uniform 50% wash and simply makes
  // the scene darker without making it deeper. Linear fog with near set past
  // the camera distance leaves the near half untouched and only softens the
  // far corner, which is the depth cue that was actually wanted.
  // Haze colour has to match the horizon or the far corner reads as a hole.
  // Matched to the horizon band of the sky. Set past the playable area so
  // the compound stays crisp and only the ridges soften — the haze is depth,
  // not a wash over the gameplay.
  // Water kills range fast. The fog starts close and finishes well inside
  // the map, which is what makes the place feel enclosed rather than open.
  scene.fog = undersea
    ? new THREE.Fog(0x123f49, 30, 108)
    : ENVIRONMENT === 'day'
      ? new THREE.Fog(0xb49878, 46, 230)
      : new THREE.Fog(0x0b1211, 40, 78);

  // The concrete only covers what the compound actually stands on. It used
  // to be a 30-unit slab — four times the footprint of the building — which
  // read as a giant flat plate with a hard diamond edge, and was the single
  // most artificial thing in the frame. Outside the wire is now soil.
  // Sized to the compound it belongs to. At 15 it overhung the walls by two
  // and a half metres on every side, and a pale slab with a hard diamond edge
  // sitting proud of the building is the most artificial thing a flat-lit
  // scene can contain.
  const PAD = 12.4;
  // Same two-scale idea as the terrain: the canvas map carries this slab's own
  // history (wear patches, blast staining, expansion joints, the survey
  // overlay) and never repeats, while the concrete set underneath carries the
  // aggregate and the relief that makes it take light like a poured surface.
  const padMaterial = triplanarMaterial({
    set: 'concrete',
    // Worn concrete, not fresh screed. Bright pads read as unused.
    color: ENVIRONMENT === 'day' ? 0xcfc5b2 : 0xd8e2dc,
    roughness: 0.97,
    metalness: 0.02,
    scale: 0.38,
    normalScale: 0.8,
    albedoMix: 0.5,      // the canvas map is the colour; see Terrain.js
  });
  padMaterial.map = makeGroundTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(PAD, PAD), padMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(3, 0, -3);   // centred on the compound, not the origin
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // ------------------------------------------------------------- lighting
  // Four sources total, one of them shadow-casting. Everything else that
  // glows in this scene is an emissive material, which costs nothing per
  // light and cannot blow the fragment budget on a demo laptop.

  // Key: high, cold, off the north-east. Moonlight, not a studio light.
  const day = (ENVIRONMENT === 'day' || depot) && !undersea;

  // Key: cold moonlight at night, a low warm sun by day.
  // Low and warm: the long raking shadows are what give flat ground its
  // shape. A high sun flattens terrain into a texture swatch.
  // Undersea: the only real light comes near-straight down from the surface,
  // cold and already half absorbed by the time it reaches 280 metres.
  const key = new THREE.DirectionalLight(
    undersea ? 0xd6e6e0 : day ? 0xffd4a0 : 0xc2e4de,
    undersea ? 1.55 : day ? 3.0 : 2.9);
  key.position.set(undersea ? 24 : depot ? 62 : day ? 26 : 8,
                   undersea ? 56 : depot ? 44 : day ? 9 : 14,
                   undersea ? 32 : depot ? 38 : day ? 15 : 6);
  key.castShadow = false;
  // A 3072 shadow map is re-rendered every frame with every caster in the
  // compound in it. On a real GPU that is free; on a software rasteriser it is
  // most of the frame, and it is the single biggest reason a headless run
  // crawls. The low tier takes a quarter of the resolution — visibly softer
  // up close, invisible at a tactical zoom, and several times the frame rate.
  const shadowRes = renderTier() === 'low' ? 1024 : (day ? 3072 : 2048);
  key.shadow.mapSize.set(shadowRes, shadowRes);
  key.shadow.camera.near = undersea ? 10 : 1;
  // The shadow frustum has to enclose everything the camera can see, or the
  // ground outside it samples the clamped edge of the shadow map and goes
  // fully black. On the seabed that showed up as two enormous hard-edged
  // wedges of void across the map — it read as missing geometry, and it was
  // a 22-unit shadow camera over a 200-unit floor.
  key.shadow.camera.far = undersea ? 180 : depot ? 220 : day ? 140 : 50;
  // Has to enclose everything the camera can reach, or the ground outside it
  // samples the clamped edge of the shadow map and goes dark — which reads as
  // a pale lit diamond stamped on a dark plain rather than as a lighting bug.
  const s = undersea ? 48 : depot ? 72 : GROUND_SIZE * (day ? 1.5 : 0.75);
  key.shadow.camera.left = -s;
  key.shadow.camera.right = s;
  key.shadow.camera.top = s;
  key.shadow.camera.bottom = -s;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.name = 'key-light';
  scene.add(key);

  // Rim from the opposite corner. No shadow, low intensity, and slightly warm
  // against the cold key — this is the light that separates a dark robot from
  // the dark ground it is standing on.
  // Cool fill from the opposite side — sky light in the shadows, which is
  // what actually happens at dusk and what stops shadows reading as black.
  const rim = new THREE.DirectionalLight(day ? 0x8fb0d8 : 0x9a7f5e, day ? 1.25 : 1.0);
  rim.position.set(-11, 7, -9);
  rim.name = 'rim-light';
  scene.add(rim);

  // Sky/ground bounce. A hemisphere costs the same as an ambient and gives
  // the tops of things a cold sky and their undersides a dead floor, which is
  // most of what sells "outdoors at night" on flat-shaded geometry.
  // By day this is the big one: blue sky above, warm soil bounce below.
  const bounce = undersea
    ? new THREE.HemisphereLight(0x4a93a6, 0x8a7550, 1.0)
    : day
      ? new THREE.HemisphereLight(0xa8c4e4, 0xa08462, 2.1)
      : new THREE.HemisphereLight(0x44635f, 0x0d1311, 1.45);
  scene.add(bounce);

  // Floor of ambient so nothing ever goes fully to black.
  // Deliberately low. Uniform ambient is what makes a scene read as a
  // render; the contrast between lit and unlit ground is the depth cue.
  scene.add(new THREE.AmbientLight(undersea ? 0x2a555f : day ? 0x7b8892 : 0x22302d, undersea ? 0.30 : day ? 0.75 : 0.8));

  let sky = null;
  let terrain = null;
  if (undersea) {
    terrain = createSeabed(scene);
    ground.visible = false;   // no concrete pad on a seabed
  } else if (depot) {
    sky = createSky(scene, {
      top: 0x35506f,
      horizon: 0xd79a62,
      ground: 0x7a6248,
    });
    terrain = createDepotGround(scene);
    ground.visible = false;   // the compound lays its own hardstanding
  } else if (day) {
    sky = createSky(scene, {
      top: 0x35506f,        // deep blue overhead
      horizon: 0xd79a62,    // sun band, low and warm
      ground: 0x7a6248,     // dust haze below the horizon line
    });
    terrain = createTerrain(scene);
  }

  return { scene, ground, keyLight: key, rimLight: rim, bounce, sky, terrain };
}

// Practical lights. Unshadowed points, added by the level for the handful of
// fixtures that are meant to be lit: the relay beacon and the two floodlights
// on the approach. Deliberately capped — the brief for this scene is a dark
// compound with a few working lamps, and a dozen dynamic lights would cost
// more than the look is worth.
export function addPractical(scene, { x, y, z, color = 0xffc98a, intensity = 6, distance = 9 }) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.set(x, y, z);
  light.castShadow = false;
  scene.add(light);
  return light;
}
