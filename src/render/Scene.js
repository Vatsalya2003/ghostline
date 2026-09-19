import * as THREE from 'three';
import { createSky } from './Sky.js';
import { createTerrain } from './Terrain.js';

// 'day'   — late evening at a semi-arid installation: low sun, long shadows,
//            warm key against a cool sky, practical lights doing real work.
// 'night'  — the original cold compound, untouched.
// Every light, the fog, the sky and the fog-of-war read this constant.
export const ENVIRONMENT = 'day';

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
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
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
  if (ENVIRONMENT === 'day') renderer.toneMappingExposure = 1.0;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ENVIRONMENT === 'day' ? 0x6f7d8c : PALETTE.bg);

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
  scene.fog = ENVIRONMENT === 'day'
    ? new THREE.Fog(0xb49878, 46, 230)
    : new THREE.Fog(0x0b1211, 40, 78);

  // The concrete only covers what the compound actually stands on. It used
  // to be a 30-unit slab — four times the footprint of the building — which
  // read as a giant flat plate with a hard diamond edge, and was the single
  // most artificial thing in the frame. Outside the wire is now soil.
  const PAD = 15;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(PAD, PAD),
    new THREE.MeshStandardMaterial({
      map: makeGroundTexture(),
      // Worn concrete, not fresh screed. Bright pads read as unused.
      color: ENVIRONMENT === 'day' ? 0x9c917f : 0xa8b4ae,
      roughness: 0.97,
      metalness: 0.02,
    })
  );
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
  const day = ENVIRONMENT === 'day';

  // Key: cold moonlight at night, a low warm sun by day.
  // Low and warm: the long raking shadows are what give flat ground its
  // shape. A high sun flattens terrain into a texture swatch.
  const key = new THREE.DirectionalLight(day ? 0xffc98a : 0xc2e4de, day ? 2.35 : 2.9);
  key.position.set(day ? 26 : 8, day ? 9 : 14, day ? 15 : 6);
  key.castShadow = true;
  key.shadow.mapSize.set(day ? 3072 : 2048, day ? 3072 : 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = day ? 140 : 50;
  const s = GROUND_SIZE * (day ? 1.5 : 0.75);
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
  const rim = new THREE.DirectionalLight(day ? 0x6d90bd : 0x9a7f5e, day ? 0.7 : 1.0);
  rim.position.set(-11, 7, -9);
  rim.name = 'rim-light';
  scene.add(rim);

  // Sky/ground bounce. A hemisphere costs the same as an ambient and gives
  // the tops of things a cold sky and their undersides a dead floor, which is
  // most of what sells "outdoors at night" on flat-shaded geometry.
  // By day this is the big one: blue sky above, warm soil bounce below.
  const bounce = day
    ? new THREE.HemisphereLight(0x7d9cc4, 0x8a6a45, 1.25)
    : new THREE.HemisphereLight(0x44635f, 0x0d1311, 1.45);
  scene.add(bounce);

  // Floor of ambient so nothing ever goes fully to black.
  // Deliberately low. Uniform ambient is what makes a scene read as a
  // render; the contrast between lit and unlit ground is the depth cue.
  scene.add(new THREE.AmbientLight(day ? 0x54606b : 0x22302d, day ? 0.3 : 0.8));

  let sky = null;
  let terrain = null;
  if (day) {
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
