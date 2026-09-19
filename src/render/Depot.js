import * as THREE from 'three';

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

// ---------------------------------------------------------------- geography

// The wire. Everything inside this rectangle is compound; everything outside
// is the hillside the squad walked in over.
export const WIRE = { minX: -2.5, maxX: 21, minZ: -15, maxZ: 8.5 };
export const GATE = new THREE.Vector2(-2.5, 5.5);

// Vehicle tracks: gate to yard, yard to the bunker, yard to the fuel store.
// Regular, worn, and going somewhere — the thing that says "this place is
// used" rather than "this place was generated".
export const TRACKS = [
  [new THREE.Vector2(-9, 5.5), new THREE.Vector2(-2.5, 5.5),
   new THREE.Vector2(3, 3.5), new THREE.Vector2(9, 1.5)],
  [new THREE.Vector2(9, 1.5), new THREE.Vector2(13, -3), new THREE.Vector2(16.5, -8)],
  [new THREE.Vector2(9, 1.5), new THREE.Vector2(7.5, 3.5)],
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

export function trackDistance(x, z) {
  let d = Infinity;
  for (const line of TRACKS) {
    for (let i = 0; i < line.length - 1; i++) {
      d = Math.min(d, segDist(x, z, line[i], line[i + 1]));
    }
  }
  return d;
}

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

  // Spoil berm thrown up along the outside of the cut.
  h += Math.exp(-Math.pow((inside + 1.6) / 1.5, 2)) * 0.55 * smoothstep(-inside, -2.5, 1.0);

  // Worn tracks: compacted, slightly sunk, with a crown between the ruts.
  const td = trackDistance(x, z);
  h -= Math.exp(-Math.pow(td / 1.5, 2)) * 0.13;
  h += Math.exp(-Math.pow(td / 0.32, 2)) * 0.045;

  return h;
}

// ---------------------------------------------------------------- material

function makeGroundTexture(px = 2048) {
  const t0 = performance.now();
  const G = 176;
  const H = new Float32Array(G * G);
  const N = new Float32Array(G * G);
  const I = new Float32Array(G * G);

  for (let j = 0; j < G; j++) {
    const wz = (j / (G - 1)) * DEPOT_SIZE - DEPOT_SIZE / 2;
    for (let i = 0; i < G; i++) {
      const wx = (i / (G - 1)) * DEPOT_SIZE - DEPOT_SIZE / 2;
      const k = j * G + i;
      H[k] = depotHeight(wx, wz);
      N[k] = fbm(wx * 0.033 + 1, wz * 0.033 + 5, 3);
      I[k] = insideWire(wx, wz);
    }
  }
  const sample = (F, fx, fy) => {
    const x = clamp(fx * (G - 1), 0, G - 1.001);
    const y = clamp(fy * (G - 1), 0, G - 1.001);
    const i = x | 0, j = y | 0, tx = x - i, ty = y - j;
    const a = F[j * G + i], b = F[j * G + i + 1];
    const c = F[(j + 1) * G + i], d = F[(j + 1) * G + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(px, px);
  const data = img.data;

  for (let py = 0; py < px; py++) {
    const fy = py / (px - 1);
    const wz = fy * DEPOT_SIZE - DEPOT_SIZE / 2;
    for (let pxx = 0; pxx < px; pxx++) {
      const fx = pxx / (px - 1);
      const wx = fx * DEPOT_SIZE - DEPOT_SIZE / 2;
      const n = sample(N, fx, fy);
      const inside = sample(I, fx, fy);

      // Dry hillside: warm ochre earth with paler dust on the high ground.
      let r = 150 + n * 54;
      let g = 126 + n * 46;
      let b = 92 + n * 36;

      // Inside the wire it is compacted hardstanding — greyer, flatter,
      // and stained by everything that has ever been parked on it.
      const pad = smoothstep(inside, -0.5, 1.8);
      r += (138 - r) * pad * 0.82;
      g += (134 - g) * pad * 0.82;
      b += (122 - b) * pad * 0.82;

      // Vehicle tracks worn down to bare compacted dirt.
      const td = trackDistance(wx, wz);
      const track = Math.exp(-Math.pow(td / 1.35, 2));
      r += (108 - r) * track * 0.62;
      g += (92 - g) * track * 0.62;
      b += (70 - b) * track * 0.62;
      // The two ruts inside the track, darker still.
      const rut = Math.exp(-Math.pow((td - 0.62) / 0.2, 2));
      r -= rut * 22; g -= rut * 20; b -= rut * 16;

      const grain = rand(pxx * 0.73 + py * 311.7) - 0.5;
      r += grain * 30; g += grain * 27; b += grain * 22;

      // Grit and stones.
      const stone = rand(pxx * 11.3 + py * 7.1 + 41.7);
      if (stone > 0.9972) { r = 196; g = 186; b = 166; }
      else if (stone < 0.0026) { r *= 0.5; g *= 0.5; b *= 0.5; }

      const k = (py * px + pxx) * 4;
      data[k] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[k + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[k + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const toPx = (w) => ((w + DEPOT_SIZE / 2) / DEPOT_SIZE) * px;

  // Oil and fuel staining where vehicles stand. Clustered at the gate, the
  // fuel store and the bunker apron, because that is where things park.
  for (const [cx, cz, count, spread] of [[-1, 5.5, 60, 4], [8, 1.5, 90, 6], [16, -8, 60, 5]]) {
    for (let i = 0; i < count; i++) {
      const s = rand(i + cx * 31 + cz * 17);
      const a = rand(i + 700 + cx) * Math.PI * 2;
      const rr = Math.sqrt(rand(i + 1400 + cz)) * spread;
      ctx.fillStyle = s > 0.6 ? 'rgba(28,24,20,0.20)' : 'rgba(46,38,30,0.14)';
      ctx.beginPath();
      ctx.ellipse(toPx(cx + Math.cos(a) * rr), toPx(cz + Math.sin(a) * rr),
                  (0.25 + s * 0.8) / DEPOT_SIZE * px, (0.18 + s * 0.6) / DEPOT_SIZE * px,
                  a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  console.log(`[depot] ground texture ${px}px in ${(performance.now() - t0) | 0}ms`);
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

// ---------------------------------------------------------------- scrub

// Dry hillside scrub. Only outside the wire — inside is bulldozed and driven
// on, and nothing grows on hardstanding. That boundary does as much to draw
// the compound as the wall does.
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

  const SPECIES = [
    { name: 'grass', count: 4200, seed: 900, geo: tuft, spread: 5, cluster: 8,
      colors: [0x9a8c52, 0xa89a60, 0x86794a, 0xb0a06a], min: 0.4, max: 1.1,
      mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, transparent: true, alphaTest: 0.2 }), sway: 1 },
    { name: 'bush', count: 620, seed: 4100, geo: new THREE.IcosahedronGeometry(1, 0), spread: 7, cluster: 4,
      colors: [0x5f6b3e, 0x6f7a48, 0x515c36, 0x7d8450], min: 0.35, max: 1.0, squash: 0.62, sink: 0.25, tilt: true,
      mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98, flatShading: true }) },
    { name: 'rock', count: 540, seed: 7700, geo: new THREE.DodecahedronGeometry(1, 0), spread: 10, cluster: 6,
      colors: [0x8a8175, 0x9a9083, 0x736b61, 0xa39887], min: 0.2, max: 0.9, squash: 0.6, sink: 0.35, tilt: true,
      mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, flatShading: true }) },
  ];

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
  const report = [];

  for (const sp of SPECIES) {
    const mesh = new THREE.InstancedMesh(sp.geo, sp.mat, sp.count);
    mesh.name = sp.name;
    mesh.castShadow = sp.name !== 'grass';
    mesh.receiveShadow = true;
    if (sp.sway) addSway(sp.mat, uniforms);

    let placed = 0;
    for (let i = 0; placed < sp.count && i < sp.count * 50; i++) {
      const c = Math.floor(i / sp.cluster);
      const cx = (rand(c + sp.seed) - 0.5) * DEPOT_SIZE * 0.82;
      const cz = (rand(c + sp.seed + 2000) - 0.5) * DEPOT_SIZE * 0.82;
      const x = cx + (rand(i + sp.seed + 5000) - 0.5) * sp.spread;
      const z = cz + (rand(i + sp.seed + 8000) - 0.5) * sp.spread;

      // Nothing inside the wire, nothing on a track, and thinning out as the
      // ground gets stony high up.
      if (insideWire(x, z) > -1.2) continue;
      if (trackDistance(x, z) < 2.2) continue;
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

  const macro = makeGroundTexture();
  const detail = detailTexture();
  const material = new THREE.MeshStandardMaterial({
    map: macro, color: 0xf4f0e8, roughness: 0.97, metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform sampler2D uDetail;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
                     mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
        }
      `)
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec3 grit = texture2D(uDetail, vMapUv * 110.0).rgb;
        diffuseColor.rgb *= (0.82 + grit * 0.36);
        vec2 wp = vec2(vMapUv.x - 0.5, 0.5 - vMapUv.y) * ${DEPOT_SIZE.toFixed(1)};
        float m = n2(wp * 0.5) * 0.55 + n2(wp * 1.8) * 0.3 + n2(wp * 5.2) * 0.15;
        diffuseColor.rgb *= 0.84 + m * 0.34;
      `);
  };

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
