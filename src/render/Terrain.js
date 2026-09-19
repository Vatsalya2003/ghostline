import * as THREE from 'three';

// ============================================================================
// THE WORLD OUTSIDE THE WIRE — semi-arid military installation
// ============================================================================
//
// Biome is fixed and singular: dry high desert, the kind of place a relay
// station gets built because nobody lives there. Bleached soil, gravel pans,
// dead grass in the hollows where water last collected, rock breaking through
// the ridges. No jungle, no snow, no grass lawn.
//
// What makes ground read as real, in order of how much it matters:
//   1. it is not flat, and the un-flatness has a cause (drainage, vehicles)
//   2. the material changes across it, and the changes follow the terrain
//   3. it carries the marks of use — roads go somewhere, ruts follow roads
//   4. vegetation clusters where water would collect, never on a grid
//   5. something exists past the playable area
//
// Everything is procedural and seeded. No texture downloads, no Math.random:
// the offline rule and the rehearsable-demo rule both still apply.

export const TERRAIN_SIZE = 220;

// Where the access road runs: in from the south-west, up to the compound gate.
const ROAD = [
  new THREE.Vector2(-86, 62),
  new THREE.Vector2(-52, 40),
  new THREE.Vector2(-28, 26),
  new THREE.Vector2(-12, 14),
  new THREE.Vector2(-2, 6),
  new THREE.Vector2(2.6, 2.5),
];
const ROAD_HALF_WIDTH = 2.6;

const rand = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// Value noise, so terrain and scatter agree about where the hollows are.
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => rand(a * 157.31 + b * 311.7);
  return (
    h(xi, yi) * (1 - u) * (1 - v) +
    h(xi + 1, yi) * u * (1 - v) +
    h(xi, yi + 1) * (1 - u) * v +
    h(xi + 1, yi + 1) * u * v
  );
}

function fbm(x, y, octaves = 4) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

// Distance from a point to the road centreline, in world units.
function roadDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i], b = ROAD[i + 1];
    const abx = b.x - a.x, aby = b.y - a.y;
    const t = Math.max(0, Math.min(1,
      ((x - a.x) * abx + (z - a.y) * aby) / (abx * abx + aby * aby)));
    const dx = x - (a.x + abx * t), dz = z - (a.y + aby * t);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

// Inside this, the ground is the compound's business and must stay flat.
const COMPOUND = new THREE.Vector2(3, -3);
const PAD_HALF = 7.5;

function compoundMask(x, z) {
  const d = Math.max(Math.abs(x - COMPOUND.x), Math.abs(z - COMPOUND.y));
  // Flat under the pad, full relief a short way out. Terrain now comes right
  // up to the wire instead of stopping 15 units short of it.
  return THREE.MathUtils.smoothstep(d, PAD_HALF + 1.5, PAD_HALF + 14);
}

// Height field. Every term has a reason: broad relief, a drainage hollow that
// runs east, wind-cut ridges, and a road that cuts and fills to stay level.
export function terrainHeight(x, z) {
  const relief = (fbm(x * 0.012 + 11, z * 0.012 - 7, 4) - 0.5) * 9.0;
  const dunes = Math.sin(x * 0.055 + z * 0.02) * Math.cos(z * 0.047) * 0.75;
  const grit = (fbm(x * 0.35, z * 0.35, 2) - 0.5) * 0.28;

  // A shallow wadi draining east — the reason vegetation lives where it does.
  const wadi = -1.9 * Math.exp(-Math.pow((z - 34 - Math.sin(x * 0.03) * 7) / 11, 2));

  let h = (relief + dunes + wadi) * compoundMask(x, z) + grit * compoundMask(x, z);

  // The road is graded: it flattens what it crosses and leaves a low berm.
  const rd = roadDistance(x, z);
  if (rd < 14) {
    const onRoad = 1 - THREE.MathUtils.smoothstep(rd, ROAD_HALF_WIDTH, 11);
    const berm = Math.exp(-Math.pow((rd - ROAD_HALF_WIDTH - 1.1) / 1.5, 2)) * 0.34;
    h = THREE.MathUtils.lerp(h, h * 0.18 - 0.12, onRoad) + berm * compoundMask(x, z);
  }
  return h;
}

// ---------------------------------------------------------------- materials

// One non-repeating macro map over the whole plane. Repetition is the single
// biggest tell that ground is fake, so the large-scale variation never tiles;
// a small tiling grit map multiplied on top carries the close-up detail.
function makeMacroTexture(px = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const toPx = (w) => ((w + TERRAIN_SIZE / 2) / TERRAIN_SIZE) * px;

  ctx.fillStyle = '#8a6f52';
  ctx.fillRect(0, 0, px, px);

  // Regional soil variation, driven by the same noise as the height field so
  // the colour follows the landform instead of floating free of it.
  const step = 8;
  for (let py = 0; py < px; py += step) {
    for (let pxx = 0; pxx < px; pxx += step) {
      const wx = (pxx / px) * TERRAIN_SIZE - TERRAIN_SIZE / 2;
      const wz = (py / px) * TERRAIN_SIZE - TERRAIN_SIZE / 2;
      const n = fbm(wx * 0.03 + 3, wz * 0.03 + 9, 3);
      const h = terrainHeight(wx, wz);

      // High ground is wind-scoured and pale; hollows hold fines and darken.
      let r = 112 + n * 40 + h * 4;
      let g = 91 + n * 35 + h * 3;
      let b = 66 + n * 28 + h * 2;

      // Gravel pans on the flats.
      if (n > 0.62) { r += 13; g += 12; b += 11; }
      // Dead grass in the wadi.
      const wadiness = Math.exp(-Math.pow((wz - 34) / 13, 2));
      if (wadiness > 0.35 && n > 0.4) { r -= 22; g -= 8; b -= 34; }

      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(pxx, py, step, step);
    }
  }

  // Gravel apron around the compound — spill from when it was built.
  const acx = toPx(COMPOUND.x), acy = toPx(COMPOUND.y);
  const apron = ctx.createRadialGradient(acx, acy, (PAD_HALF / TERRAIN_SIZE) * px,
    acx, acy, ((PAD_HALF + 11) / TERRAIN_SIZE) * px);
  apron.addColorStop(0, 'rgba(150,136,112,0.26)');
  apron.addColorStop(1, 'rgba(176,164,140,0)');
  ctx.fillStyle = apron;
  ctx.fillRect(0, 0, px, px);

  // The road, and the two ruts worn into it by everything that ever drove in.
  const roadPath = (width, style) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(toPx(ROAD[0].x), toPx(ROAD[0].y));
    for (let i = 1; i < ROAD.length; i++) ctx.lineTo(toPx(ROAD[i].x), toPx(ROAD[i].y));
    ctx.stroke();
  };
  roadPath((ROAD_HALF_WIDTH * 2.6 / TERRAIN_SIZE) * px, 'rgba(134,120,98,0.44)');
  roadPath((ROAD_HALF_WIDTH * 1.7 / TERRAIN_SIZE) * px, 'rgba(150,136,112,0.48)');

  // Ruts, offset either side of the centreline.
  for (const off of [-0.62, 0.62]) {
    ctx.strokeStyle = 'rgba(96,78,56,0.42)';
    ctx.lineWidth = (0.42 / TERRAIN_SIZE) * px;
    ctx.beginPath();
    for (let i = 0; i < ROAD.length; i++) {
      const p = ROAD[i];
      const q = ROAD[Math.min(i + 1, ROAD.length - 1)];
      const nx = -(q.y - p.y), nz = (q.x - p.x);
      const len = Math.hypot(nx, nz) || 1;
      const x = p.x + (nx / len) * off, z = p.y + (nz / len) * off;
      if (i === 0) ctx.moveTo(toPx(x), toPx(z)); else ctx.lineTo(toPx(x), toPx(z));
    }
    ctx.stroke();
  }

  // Turning circle where vehicles swung round short of the gate.
  ctx.strokeStyle = 'rgba(150,134,110,0.38)';
  ctx.lineWidth = (1.5 / TERRAIN_SIZE) * px;
  ctx.beginPath();
  ctx.arc(toPx(-14), toPx(16), ((7.5) / TERRAIN_SIZE) * px, 0.4, 4.6);
  ctx.stroke();

  // Scattered stones and dark mineral flecks, denser on the pans.
  for (let i = 0; i < 26000; i++) {
    const x = rand(i + 4000) * px;
    const y = rand(i + 9000) * px;
    const s = 1 + rand(i + 14000) * 3.4;
    const tone = rand(i + 19000);
    ctx.fillStyle = tone > 0.7 ? 'rgba(206,192,166,0.45)'
      : tone > 0.4 ? 'rgba(74,58,40,0.34)'
      : 'rgba(150,128,98,0.26)';
    ctx.fillRect(x, y, s, s);
  }

  // Dried mud cracks, only in the hollows where water actually stood.
  ctx.strokeStyle = 'rgba(58,44,30,0.26)';
  for (let i = 0; i < 260; i++) {
    const wx = (rand(i + 31000) - 0.5) * TERRAIN_SIZE;
    const wz = 34 + (rand(i + 32000) - 0.5) * 26;
    let x = toPx(wx), y = toPx(wz);
    ctx.lineWidth = 0.7 + rand(i + 33000) * 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let seg = 0; seg < 4; seg++) {
      x += (rand(i * 9 + seg) - 0.5) * 34;
      y += (rand(i * 9 + seg + 600) - 0.5) * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Tiling grit, multiplied over the macro map to carry close-up detail.
function makeDetailTexture(px = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 24000; i++) {
    const x = rand(i + 77000) * px;
    const y = rand(i + 88000) * px;
    const s = 1 + rand(i + 99000) * 2.2;
    const v = rand(i + 111000);
    ctx.fillStyle = v > 0.5
      ? `rgba(255,255,255,${0.05 + v * 0.14})`
      : `rgba(0,0,0,${0.05 + (1 - v) * 0.13})`;
    ctx.fillRect(x, y, s, s);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 70);
  return tex;
}

function groundMaterial() {
  const macro = makeMacroTexture();
  const detail = makeDetailTexture();

  const material = new THREE.MeshStandardMaterial({
    map: macro,
    roughness: 0.97,
    metalness: 0.0,
  });

  // Two-scale blend: non-repeating colour, tiling grit. Doing it in the
  // shader avoids a second UV set and a second draw.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;')
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec3 grit = texture2D(uDetail, vMapUv * 70.0).rgb;
        diffuseColor.rgb *= (0.62 + grit * 0.76);
      `);
  };
  return material;
}

// ---------------------------------------------------------------- vegetation

// Dry grass blades on crossed quads. Cheap, and at a 45-degree camera the
// cross reads as a tuft from every angle the player can actually get.
function grassTuftGeometry() {
  const blade = new THREE.PlaneGeometry(0.62, 0.52, 1, 1);
  blade.translate(0, 0.26, 0);
  const geos = [];
  for (let i = 0; i < 3; i++) {
    const g = blade.clone();
    g.rotateY((i / 3) * Math.PI);
    geos.push(g);
  }
  const merged = mergeGeometries(geos);
  blade.dispose();
  return merged;
}

// Minimal merge — three.js ships BufferGeometryUtils but importing the whole
// module for one concat is not worth the bytes.
function mergeGeometries(list) {
  let vertexCount = 0, indexCount = 0;
  for (const g of list) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : 0;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const index = new Uint16Array(indexCount);
  let vo = 0, io = 0;
  for (const g of list) {
    position.set(g.attributes.position.array, vo * 3);
    normal.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

function grassTexture(px = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, px, px);
  for (let i = 0; i < 26; i++) {
    const x = 8 + rand(i + 5) * (px - 16);
    const lean = (rand(i + 60) - 0.5) * 34;
    const h = px * (0.45 + rand(i + 120) * 0.5);
    const w = 1.6 + rand(i + 180) * 2.4;
    const dry = rand(i + 240);
    ctx.strokeStyle = dry > 0.62 ? 'rgba(178,158,104,0.95)'
      : dry > 0.3 ? 'rgba(146,132,86,0.92)'
      : 'rgba(112,110,66,0.90)';
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, px);
    ctx.quadraticCurveTo(x + lean * 0.4, px - h * 0.55, x + lean, px - h);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Where plants can live: away from the compound, off the road, and biased
// hard toward the hollows where the last rain went.
function vegetationDensity(x, z) {
  // Nothing grows on the concrete, and the apron is kept clear.
  if (Math.max(Math.abs(x - COMPOUND.x), Math.abs(z - COMPOUND.y)) < PAD_HALF + 1.2) return 0;
  if (roadDistance(x, z) < ROAD_HALF_WIDTH + 1.0) return 0;

  const clump = fbm(x * 0.045 + 21, z * 0.045 - 13, 3);
  const wadi = Math.exp(-Math.pow((z - 34 - Math.sin(x * 0.03) * 7) / 13, 2));
  const d = clump * 0.75 + wadi * 0.85;

  // Hard threshold, so there is bare ground between clusters instead of an
  // even carpet. Uniform coverage is what makes procedural scatter look
  // procedural.
  return d < 0.42 ? 0 : Math.min(1, (d - 0.42) / 0.34);
}

function scatterVegetation(scene) {
  const group = new THREE.Group();
  group.name = 'vegetation';

  const GRASS = 7600, SHRUB = 900, ROCK = 520, DEBRIS = 320;

  const grass = new THREE.InstancedMesh(
    grassTuftGeometry(),
    new THREE.MeshStandardMaterial({
      map: grassTexture(), transparent: true, alphaTest: 0.42,
      side: THREE.DoubleSide, roughness: 1.0, metalness: 0.0,
    }),
    GRASS
  );
  grass.receiveShadow = true;

  const shrub = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: 0x6a6540, roughness: 1.0, metalness: 0.0, flatShading: true,
    }),
    SHRUB
  );
  shrub.castShadow = shrub.receiveShadow = true;

  const rock = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: 0x8d8271, roughness: 0.94, metalness: 0.02, flatShading: true,
    }),
    ROCK
  );
  rock.castShadow = rock.receiveShadow = true;

  // Flat stone litter — reads as gravel spill at this camera angle.
  const debris = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: 0x776a58, roughness: 1.0, metalness: 0.0, flatShading: true,
    }),
    DEBRIS
  );

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  const fill = (mesh, count, seed, opts) => {
    let placed = 0;
    for (let i = 0; placed < count && i < count * 40; i++) {
      // Cluster seeds, then jitter around them: natural distributions are
      // clumped, and a uniform random spray never looks like one.
      const cluster = Math.floor(i / 7);
      const cx = (rand(cluster + seed) - 0.5) * TERRAIN_SIZE * 0.92;
      const cz = (rand(cluster + seed + 3000) - 0.5) * TERRAIN_SIZE * 0.92;
      const spread = opts.spread ?? 6;
      const x = cx + (rand(i + seed + 6000) - 0.5) * spread;
      const z = cz + (rand(i + seed + 9000) - 0.5) * spread;

      const density = vegetationDensity(x, z);
      if (density <= 0) continue;
      if (rand(i + seed + 12000) > density * (opts.chance ?? 1)) continue;

      const s = opts.min + rand(i + seed + 15000) * (opts.max - opts.min);
      e.set(
        opts.tilt ? (rand(i + seed + 18000) - 0.5) * 0.4 : 0,
        rand(i + seed + 21000) * Math.PI * 2,
        opts.tilt ? (rand(i + seed + 24000) - 0.5) * 0.4 : 0
      );
      q.setFromEuler(e);
      pos.set(x, terrainHeight(x, z) + (opts.sink ?? 0) * s, z);
      scl.set(s, s * (opts.squash ?? 1), s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(placed, m);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    return placed;
  };

  const counts = {
    grass: fill(grass, GRASS, 1000, { min: 0.55, max: 1.5, spread: 7, chance: 1.0 }),
    shrub: fill(shrub, SHRUB, 50000, { min: 0.35, max: 1.15, spread: 9, squash: 0.62, sink: -0.25, chance: 0.72, tilt: true }),
    rock: fill(rock, ROCK, 70000, { min: 0.22, max: 1.25, spread: 14, squash: 0.7, sink: -0.3, chance: 0.75, tilt: true }),
    debris: fill(debris, DEBRIS, 90000, { min: 0.12, max: 0.4, spread: 5, squash: 0.4, sink: -0.2, chance: 0.9, tilt: true }),
  };

  group.add(grass, shrub, rock, debris);
  scene.add(group);
  console.log(`[terrain] vegetation — grass ${counts.grass}, shrub ${counts.shrub}, ` +
    `rock ${counts.rock}, debris ${counts.debris} (4 instanced draw calls)`);
  return group;
}

// ---------------------------------------------------------------- backdrop

// Ridge lines past the playable area. They are silhouettes — the fog does the
// work, and their only job is to stop the world ending at the draw distance.
function createBackdrop(scene) {
  const group = new THREE.Group();
  group.name = 'backdrop';

  const ridgeMat = new THREE.MeshStandardMaterial({
    color: 0x6e6352, roughness: 1.0, metalness: 0.0, flatShading: true,
  });

  for (let ring = 0; ring < 2; ring++) {
    const radius = 150 + ring * 78;
    const count = 26 + ring * 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.3;
      const jitter = (rand(i + ring * 700) - 0.5) * 26;
      const r = radius + jitter;
      const h = 10 + rand(i + ring * 1300) * (ring ? 46 : 22);
      const w = 40 + rand(i + ring * 1900) * 70;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(w * 0.5, h, 6, 1), ridgeMat);
      hill.position.set(Math.cos(a) * r, h * 0.5 - 6 - ring * 3, Math.sin(a) * r);
      hill.rotation.y = rand(i + ring * 2500) * Math.PI;
      hill.scale.z = 0.5 + rand(i + ring * 3100) * 0.5;
      hill.castShadow = false;
      hill.receiveShadow = false;
      group.add(hill);
    }
  }

  // A line of masts on the far ridge — this place is part of a network.
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x4e4a42, roughness: 0.9 });
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + i * 0.16;
    const r = 168 + rand(i + 400) * 30;
    const h = 12 + rand(i + 800) * 10;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, h, 5), mastMat);
    mast.position.set(Math.cos(a) * r, h * 0.5, Math.sin(a) * r);
    group.add(mast);
  }

  scene.add(group);
  return group;
}

// ---------------------------------------------------------------- atmosphere

// Dust hanging in the air. Slow, sparse, and the single cheapest thing that
// makes a scene feel like it has air in it.
function createDust(scene) {
  const COUNT = 700;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const drift = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (rand(i + 200) - 0.5) * 90;
    positions[i * 3 + 1] = 0.4 + rand(i + 600) * 9;
    positions[i * 3 + 2] = (rand(i + 1000) - 0.5) * 90;
    drift[i] = 0.3 + rand(i + 1400) * 0.9;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xd8c7a6, size: 0.075, transparent: true, opacity: 0.4,
    depthWrite: false, sizeAttenuation: true, fog: true,
  }));
  points.name = 'dust';
  points.frustumCulled = false;
  scene.add(points);

  return {
    points,
    update(dt) {
      const p = geometry.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        p[i * 3] += drift[i] * dt * 0.55;
        p[i * 3 + 1] += Math.sin((p[i * 3] + i) * 0.4) * dt * 0.05;
        if (p[i * 3] > 45) p[i * 3] = -45;
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- assembly

export function createTerrain(scene) {
  const segments = 220;
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segments, segments);

  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Plane is still in XY here; Y becomes world Z after the rotation below.
    pos.setZ(i, terrainHeight(pos.getX(i), pos.getY(i)));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const terrain = new THREE.Mesh(geometry, groundMaterial());
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.05;   // just under the compound slab
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  scene.add(terrain);

  const vegetation = scatterVegetation(scene);
  const backdrop = createBackdrop(scene);
  const dust = createDust(scene);

  return { terrain, vegetation, backdrop, dust, height: terrainHeight };
}
