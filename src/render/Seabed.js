import * as THREE from 'three';

// ============================================================================
// TEST RANGE 9 — the seabed, built for BLACK CURRENT
// ============================================================================
//
// The map is the mission. Every feature here exists because a turn needs it:
//
//   (-6, 6)   survey pillars      turn 1 baseline — the charted things
//   (-1, 1)   old charted fix     turn 2 — where the survey said it was
//   (3, -2)   drag scar           turn 3 — the furrow between the two fixes
//   (6, -5)   the channel         turn 4 — trench with hard flow at the floor
//   (4, -7)   Range Instrument 7  turn 5 — where it actually ended up
//
// The scar physically joins the turn-2 position to the turn-5 position. A
// player who looks at the seabed can read the answer off it before ANCHOR
// ever concedes the point — which is the whole design.

export const SEABED_SIZE = 200;

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

// The drag scar: from the old charted fix to where the package sits now.
const SCAR_FROM = new THREE.Vector2(-1, 1);
const SCAR_TO = new THREE.Vector2(4, -7);

function segmentDistance(x, z, a, b) {
  const abx = b.x - a.x, abz = b.y - a.y;
  const t = Math.max(0, Math.min(1,
    ((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.y + abz * t));
}

// The channel — a trench running north-east, with ridges either side. This is
// the turn-4 hazard, and it has to read as a place you could be pushed into.
const CHANNEL_A = new THREE.Vector2(14, -1);
const CHANNEL_B = new THREE.Vector2(0, -13);

export function seabedHeight(x, z) {
  // Broad sediment relief, gentler than dry land — water sorts the grain.
  const relief = (fbm(x * 0.014 + 5, z * 0.014 - 3, 4) - 0.5) * 5.4;
  const ripples = Math.sin(x * 0.42 + fbm(x * 0.05, z * 0.05, 2) * 4) * 0.08;
  let h = relief + ripples;

  // Ridges flanking the channel, then the trench cut between them.
  const cd = segmentDistance(x, z, CHANNEL_A, CHANNEL_B);
  h += Math.exp(-Math.pow((cd - 7.5) / 3.4, 2)) * 3.2;     // shoulders
  h -= Math.exp(-Math.pow(cd / 3.8, 2)) * 5.6;             // the cut

  // The scar: a shallow furrow with spoil pushed up either side.
  const sd = segmentDistance(x, z, SCAR_FROM, SCAR_TO);
  h -= Math.exp(-Math.pow(sd / 1.25, 2)) * 0.5;
  h += Math.exp(-Math.pow((sd - 2.0) / 1.1, 2)) * 0.22;

  // Flat pad under the survey pillars — they were set on prepared ground.
  const pd = Math.hypot(x + 6, z - 6);
  h *= THREE.MathUtils.smoothstep(pd, 3.5, 9.0) * 0.85 + 0.15;

  return h;
}

// ---------------------------------------------------------------- material

function makeSeabedTexture(px = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const toPx = (w) => ((w + SEABED_SIZE / 2) / SEABED_SIZE) * px;

  // Sediment base. Everything down here is a desaturated green-grey — colour
  // is the first thing water takes away.
  const step = 8;
  for (let py = 0; py < px; py += step) {
    for (let pxx = 0; pxx < px; pxx += step) {
      const wx = (pxx / px) * SEABED_SIZE - SEABED_SIZE / 2;
      const wz = (py / px) * SEABED_SIZE - SEABED_SIZE / 2;
      const n = fbm(wx * 0.035 + 2, wz * 0.035 + 7, 3);
      const h = seabedHeight(wx, wz);

      // Fines settle in the hollows and go darker; crests are scoured pale.
      // Cool and desaturated at source rather than tinted afterwards — a
      // warm texture under a green tint still reads as sand under a filter.
      let r = 56 + n * 24 + h * 4;
      let g = 74 + n * 26 + h * 4;
      let b = 72 + n * 24 + h * 3;

      // Exposed hardpan on the ridge tops.
      if (h > 1.6) { r += 14; g += 14; b += 12; }
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(pxx, py, step, step);
    }
  }

  // The scar, drawn as freshly turned sediment — darker channel, pale spoil.
  const scarPath = (w, style) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = (w / SEABED_SIZE) * px;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(toPx(SCAR_FROM.x), toPx(SCAR_FROM.y));
    ctx.lineTo(toPx(SCAR_TO.x), toPx(SCAR_TO.y));
    ctx.stroke();
  };
  scarPath(5.0, 'rgba(126,142,132,0.30)');   // spoil either side
  scarPath(2.2, 'rgba(38,50,48,0.55)');      // the furrow itself

  // Marine growth: patchy, favouring anything raised and hard.
  for (let i = 0; i < 520; i++) {
    const wx = (rand(i + 900) - 0.5) * SEABED_SIZE;
    const wz = (rand(i + 1900) - 0.5) * SEABED_SIZE;
    if (seabedHeight(wx, wz) < 0.4) continue;
    ctx.fillStyle = rand(i + 2900) > 0.5
      ? 'rgba(84,112,86,0.26)' : 'rgba(66,96,92,0.22)';
    ctx.beginPath();
    ctx.arc(toPx(wx), toPx(wz), 6 + rand(i + 3900) * 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shell hash and stones.
  for (let i = 0; i < 22000; i++) {
    const x = rand(i + 5000) * px, y = rand(i + 9000) * px;
    const s = 1 + rand(i + 14000) * 2.6;
    const tone = rand(i + 19000);
    ctx.fillStyle = tone > 0.74 ? 'rgba(172,188,180,0.34)'
      : tone > 0.42 ? 'rgba(34,44,44,0.30)' : 'rgba(104,120,114,0.22)';
    ctx.fillRect(x, y, s, s);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function detailTexture(px = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 20000; i++) {
    const x = rand(i + 41000) * px, y = rand(i + 52000) * px;
    const v = rand(i + 63000);
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.04 + v * 0.1})`
                            : `rgba(0,0,0,${0.04 + (1 - v) * 0.1})`;
    ctx.fillRect(x, y, 1 + rand(i + 74000) * 2, 1 + rand(i + 85000) * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(64, 64);
  return tex;
}

// ---------------------------------------------------------------- growth

// Weed and soft coral, instanced. Clusters on hard, raised ground — the same
// rule that puts vegetation in the hollows on land, inverted, because down
// here what matters is something to hold on to.
function growth(scene) {
  const group = new THREE.Group();
  group.name = 'marine-growth';

  const WEED = 2600, CORAL = 380, ROCK = 460;

  const blade = new THREE.PlaneGeometry(0.4, 1.1);
  blade.translate(0, 0.55, 0);
  const weedGeo = blade;

  const weed = new THREE.InstancedMesh(weedGeo, new THREE.MeshStandardMaterial({
    color: 0x5f8f72, roughness: 1.0, side: THREE.DoubleSide,
    transparent: true, opacity: 0.85,
  }), WEED);
  const coral = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({
      color: 0x7b6a5a, roughness: 0.95, flatShading: true,
    }), CORAL);
  const rock = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({
      color: 0x6b7168, roughness: 0.96, flatShading: true,
    }), ROCK);
  rock.castShadow = coral.castShadow = true;
  rock.receiveShadow = coral.receiveShadow = weed.receiveShadow = true;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();

  const fill = (mesh, count, seed, o) => {
    let placed = 0;
    for (let i = 0; placed < count && i < count * 30; i++) {
      const cluster = Math.floor(i / 6);
      const cx = (rand(cluster + seed) - 0.5) * SEABED_SIZE * 0.85;
      const cz = (rand(cluster + seed + 2000) - 0.5) * SEABED_SIZE * 0.85;
      const x = cx + (rand(i + seed + 5000) - 0.5) * (o.spread ?? 5);
      const z = cz + (rand(i + seed + 8000) - 0.5) * (o.spread ?? 5);

      const h = seabedHeight(x, z);
      // Nothing settles in the scoured trench or on the fresh drag scar.
      if (segmentDistance(x, z, CHANNEL_A, CHANNEL_B) < 3.0) continue;
      if (segmentDistance(x, z, SCAR_FROM, SCAR_TO) < 2.2) continue;
      if (h < (o.minHeight ?? -0.4)) continue;
      if (rand(i + seed + 11000) > (o.chance ?? 0.7)) continue;

      const s = o.min + rand(i + seed + 14000) * (o.max - o.min);
      e.set(o.tilt ? (rand(i + seed + 17000) - 0.5) * 0.5 : 0,
            rand(i + seed + 20000) * Math.PI * 2,
            o.tilt ? (rand(i + seed + 23000) - 0.5) * 0.5 : 0);
      q.setFromEuler(e);
      pos.set(x, h + (o.sink ?? 0) * s, z);
      scl.set(s, s * (o.squash ?? 1), s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(placed, m);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    return placed;
  };

  const counts = {
    weed: fill(weed, WEED, 3000, { min: 0.5, max: 1.6, spread: 4, minHeight: 0.1, chance: 0.8 }),
    coral: fill(coral, CORAL, 31000, { min: 0.22, max: 0.75, spread: 6, squash: 0.7, sink: -0.2, minHeight: 0.6, chance: 0.6, tilt: true }),
    rock: fill(rock, ROCK, 61000, { min: 0.25, max: 1.4, spread: 11, squash: 0.65, sink: -0.3, minHeight: -0.8, chance: 0.7, tilt: true }),
  };
  group.add(weed, coral, rock);
  scene.add(group);
  console.log(`[seabed] growth — weed ${counts.weed}, coral ${counts.coral}, rock ${counts.rock} (3 instanced draws)`);
  return group;
}

// ---------------------------------------------------------------- water

// Marine snow. Detritus falling through the column — the cheapest, most
// recognisable signal that the camera is underwater and not in fog.
function marineSnow(scene) {
  const COUNT = 1400;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const fall = new Float32Array(COUNT);
  const sway = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (rand(i + 100) - 0.5) * 80;
    positions[i * 3 + 1] = rand(i + 500) * 26;
    positions[i * 3 + 2] = (rand(i + 900) - 0.5) * 80;
    fall[i] = 0.18 + rand(i + 1300) * 0.5;
    sway[i] = rand(i + 1700) * 6.283;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xd8e8e4, size: 0.06, transparent: true, opacity: 0.5,
    depthWrite: false, sizeAttenuation: true, fog: true,
  }));
  points.name = 'marine-snow';
  points.frustumCulled = false;
  scene.add(points);

  return {
    points,
    update(dt, t) {
      const p = geometry.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        p[i * 3 + 1] -= fall[i] * dt;
        p[i * 3] += Math.sin(t * 0.3 + sway[i]) * dt * 0.09;   // drift on the current
        if (p[i * 3 + 1] < -1) p[i * 3 + 1] = 26;
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

// The water column itself: light from the surface above, black below. Depth
// is the only thing that matters to how this reads.
function waterColumn(scene) {
  const geometry = new THREE.SphereGeometry(300, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSurface: { value: new THREE.Color(0x2b7f8e) },
      uMid: { value: new THREE.Color(0x0d3a44) },
      uDeep: { value: new THREE.Color(0x04161b) },
    },
    vertexShader: `varying vec3 vW;
      void main(){ vW=(modelMatrix*vec4(position,1.0)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 uSurface,uMid,uDeep; varying vec3 vW;
      void main(){ float h=normalize(vW).y;
        vec3 c=mix(uMid,uSurface,smoothstep(0.1,0.85,h));
        c=mix(uDeep,c,smoothstep(-0.45,0.02,h));
        gl_FragColor=vec4(c,1.0);}`,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'water-column';
  dome.frustumCulled = false;
  scene.add(dome);
  return dome;
}

export function createSeabed(scene) {
  const segments = 200;
  const geometry = new THREE.PlaneGeometry(SEABED_SIZE, SEABED_SIZE, segments, segments);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, seabedHeight(pos.getX(i), pos.getY(i)));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const macro = makeSeabedTexture();
  const detail = detailTexture();
  const material = new THREE.MeshStandardMaterial({
    map: macro,
    // Water strips red first. Tinting the whole floor green-grey is what
    // stops a sand-coloured seabed reading as a desert dune with a filter.
    color: 0x9fbcb4,
    roughness: 0.98, metalness: 0.0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;')
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec3 grit = texture2D(uDetail, vMapUv * 64.0).rgb;
        diffuseColor.rgb *= (0.68 + grit * 0.64);
      `);
  };

  const floor = new THREE.Mesh(geometry, material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  floor.name = 'seabed';
  scene.add(floor);

  const dome = waterColumn(scene);
  const flora = growth(scene);
  const snow = marineSnow(scene);

  return { terrain: floor, dome, vegetation: flora, dust: snow, height: seabedHeight };
}
