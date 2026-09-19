import * as THREE from 'three';

// ============================================================================
// TEST RANGE 9 — the seabed, built for BLACK CURRENT
// ============================================================================
//
// One continuous place, not six dioramas. Every mission location sits on the
// same sediment sheet, and two long linear features run the whole way across
// it so the eye can travel between them without a cut:
//
//   the cable trench   — the range was wired once, pillars to channel
//   the drag scar      — the furrow the package ploughed getting where it is
//
//   (-6,  6)  survey pillars      turn 1 baseline — the charted things
//   (-1,  1)  old charted fix     turn 2 — where the survey said it was
//   ( 3, -2)  drag scar           turn 3 — the furrow between the two fixes
//   ( 6, -5)  the channel         turn 4 — trench with hard flow at the floor
//   ( 4, -7)  Range Instrument 7  turn 5 — where it actually ended up
//
// The scar physically joins the turn-2 position to the turn-5 position, so a
// player who reads the seabed gets there before ANCHOR concedes the point.
//
// ---------------------------------------------------------------------------
// Why this is colourful when 240 m of water should be black
// ---------------------------------------------------------------------------
// Because the AUVs carry survey lights, which is how anything is ever seen at
// this depth. Real survey footage is exactly this: a travelling pool of vivid
// colour — orange sponges, pink coralline crust, white carbonate sand — with
// blue-black nothing a few metres outside it. So the sediment is authored WARM
// and the water is what takes the colour away, rather than the sediment being
// authored grey and then tinted. A grey floor under a green tint reads as a
// desert with a filter on; a warm floor under real water reads as a seabed.
//
// It also means lit == known, which is the game's whole mechanic.

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

const smoothstep = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------- geography

// The drag scar: from the old charted fix to where the package sits now.
export const SCAR_FROM = new THREE.Vector2(-1, 1);
export const SCAR_TO = new THREE.Vector2(4, -7);

// The channel — a trench running north-east with ridges either side. The
// turn-4 hazard, and it has to read as somewhere you could be pushed into.
export const CHANNEL_A = new THREE.Vector2(61, 41);
export const CHANNEL_B = new THREE.Vector2(-47, -55);

// The cable trench: the range's own spine. Runs from behind the survey
// pillars, past the junction, and dives into the channel — which is why
// there is hardware scattered along it in the first place.
export const CABLE = [
  new THREE.Vector2(-16, 12),
  new THREE.Vector2(-7, 6.5),
  new THREE.Vector2(-1.5, 3.2),
  new THREE.Vector2(2.5, 0.2),
  new THREE.Vector2(7, -4),
];

function segmentDistance(x, z, a, b) {
  const abx = b.x - a.x, abz = b.y - a.y;
  const t = Math.max(0, Math.min(1,
    ((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.y + abz * t));
}

export function polylineDistance(x, z, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, segmentDistance(x, z, pts[i], pts[i + 1]));
  }
  return d;
}

// Local bearing of the bottom current, as a smooth field. Sand ripples form
// perpendicular to flow, so this one function decides which way every ripple
// on the range points — which is what stops them reading as wallpaper.
export function currentBearing(x, z) {
  return fbm(x * 0.016 + 13, z * 0.016 - 6, 2) * 2.4 + 0.6;
}

// ---------------------------------------------------------------- elevation

export function seabedHeight(x, z) {
  // Broad basin. Low amplitude and long wavelength — water sorts grain far
  // more evenly than wind does, and big relief here just buries the props.
  let h = (fbm(x * 0.011 + 5, z * 0.011 - 3, 3) - 0.5) * 3.0;

  // Bedforms: dune fields a dozen metres across, the mid-scale that stops the
  // basin reading as one smooth bowl.
  h += (fbm(x * 0.055 - 2, z * 0.055 + 8, 2) - 0.5) * 0.85;

  // Hardpan terraces — where the sediment sheet has been scoured off and the
  // rock beneath shows through. These are the only places the filter feeders
  // have anything to hold on to, so the biology follows this line.
  const ledge = fbm(x * 0.031 + 21, z * 0.031 + 4, 2);
  const hard = smoothstep(ledge, 0.56, 0.76);
  h += hard * 0.95;

  // Sand waves in the geometry, ripples in the texture. The split matters:
  // a 200 m plane at 300 segments samples every 0.67 m, so anything shorter
  // than about three metres cannot be modelled — it aliases into long smooth
  // swells. At 3.6 m the old "ripples" were exactly that size, and wherever
  // the current ran along the view diagonal they projected into wide bands up
  // the screen that looked like a rendering fault. Real ripples are under a
  // metre apart, so they live in the map where there is resolution for them.
  const dir = currentBearing(x, z);
  const u = x * Math.cos(dir) + z * Math.sin(dir);
  h += Math.sin(u * 1.9) * 0.038 * (1 - hard * 0.85);

  // Ridges flanking the channel, then the trench cut between them. Kept
  // shallow enough that an overhead-ish camera still sees the floor.
  //
  // The wobble is not decoration. Distance-to-a-line-segment has perfectly
  // parallel iso-contours, so a trench cut straight from it comes out as a
  // geometric primitive with rounded ends — which is exactly what it looked
  // like from above. Warping the distance field makes the channel meander the
  // way scoured ground actually does.
  const wob = (fbm(x * 0.055 + 31, z * 0.055 - 17, 2) - 0.5) * 3.6;
  const cd = segmentDistance(x, z, CHANNEL_A, CHANNEL_B) + wob;
  h += Math.exp(-Math.pow((cd - 6.4) / 3.0, 2)) * 1.9;     // shoulders
  h -= Math.exp(-Math.pow(cd / 3.1, 2)) * 3.4;             // the cut

  // The cable trench: a shallow, narrow, man-made groove. Straight-edged
  // where nature is not, which is exactly why it reads as engineering.
  const kd = polylineDistance(x, z, CABLE);
  h -= Math.exp(-Math.pow(kd / 0.55, 2)) * 0.34;

  // The scar: a furrow with spoil pushed up either side. Narrow and sharp —
  // this is the mission's evidence and it has to survive the zoom.
  // Barely any wobble on the scar: a mass dragged by a steady tide tracks
  // close to straight, and that straightness is what makes it read as towed
  // rather than as another piece of terrain.
  const sd = segmentDistance(x, z, SCAR_FROM, SCAR_TO)
    + (fbm(x * 0.2 + 3, z * 0.2 - 8, 2) - 0.5) * 0.4;
  h -= Math.exp(-Math.pow(sd / 0.95, 2)) * 0.6;
  h += Math.exp(-Math.pow((sd - 1.7) / 0.85, 2)) * 0.3;

  // Prepared ground under the survey pillars. They were set level on purpose
  // and eighteen months of sediment has not changed that.
  // Same trick as the channel: a clean radial falloff leaves a visible disc
  // on the seabed, so the edge of the prepared ground is broken up.
  const pd = Math.hypot(x + 6, z - 6) + (fbm(x * 0.13 + 7, z * 0.13 + 3, 2) - 0.5) * 2.6;
  const flat = smoothstep(pd, 3.2, 9.0);
  h = h * (0.16 + 0.84 * flat) + (1 - flat) * 0.3;

  return h;
}

// ---------------------------------------------------------------- material

// Macro colour map. Built from a coarse field (heights and noise, which are
// expensive) bilinearly sampled up to full texture resolution, then given its
// fine detail per-pixel (ripple shading, grain, shell hash) which is cheap.
// Sampling the height function four million times would cost seconds.
function makeSeabedTexture(px = 2048) {
  const t0 = performance.now();
  const G = 192;                              // coarse field resolution
  const H = new Float32Array(G * G);
  const N = new Float32Array(G * G);
  const M = new Float32Array(G * G);
  const D = new Float32Array(G * G);          // ripple bearing

  for (let j = 0; j < G; j++) {
    const wz = (j / (G - 1)) * SEABED_SIZE - SEABED_SIZE / 2;
    for (let i = 0; i < G; i++) {
      const wx = (i / (G - 1)) * SEABED_SIZE - SEABED_SIZE / 2;
      const k = j * G + i;
      H[k] = seabedHeight(wx, wz);
      N[k] = fbm(wx * 0.030 + 2, wz * 0.030 + 7, 3);
      M[k] = fbm(wx * 0.115 - 9, wz * 0.115 + 3, 2);
      D[k] = currentBearing(wx, wz);
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

  const W = SEABED_SIZE / px;                 // world metres per pixel

  // Sediment palette. Warm carbonate — this is the decision the whole look
  // rests on. See the note at the top of the file.
  for (let py = 0; py < px; py++) {
    const fy = py / (px - 1);
    const wz = fy * SEABED_SIZE - SEABED_SIZE / 2;
    for (let pxx = 0; pxx < px; pxx++) {
      const fx = pxx / (px - 1);
      const wx = fx * SEABED_SIZE - SEABED_SIZE / 2;

      const h = sample(H, fx, fy);
      const n = sample(N, fx, fy);
      const m = sample(M, fx, fy);
      const dir = sample(D, fx, fy);

      // Clean shell sand, mottled.
      let r = 163 + n * 46 + m * 22;
      let g = 151 + n * 43 + m * 20;
      let b = 124 + n * 37 + m * 18;

      // Fines and organic matter settle in the hollows: darker, greener.
      const low = smoothstep(h, 0.35, -1.4);
      r += (78 - r) * low * 0.62;
      g += (92 - g) * low * 0.62;
      b += (70 - b) * low * 0.62;

      // Scoured crests and hardpan: paler, with pink coralline crust, which
      // is the one genuinely bright colour on a real temperate seabed.
      const high = smoothstep(h, 0.85, 2.1);
      const pink = high * smoothstep(m, 0.45, 0.8);
      r += (206 - r) * high * 0.5 + pink * 34;
      g += (188 - g) * high * 0.5 + pink * 2;
      b += (176 - b) * high * 0.5 + pink * 12;

      // Ripple shading, at the scale sand actually ripples: crests roughly
      // 0.9 m apart, with a finer set over the top. 2048 px over 200 m is
      // 0.1 m per texel, so this is the layer that has room for them.
      const u = wx * Math.cos(dir) + wz * Math.sin(dir);
      const rip = Math.sin(u * 7.0) * 0.5 + Math.sin(u * 16.5 + 1.7) * 0.2
                + Math.sin(u * 1.9) * 0.22;
      const ripAmt = (1 - high * 0.8) * 20;
      r += rip * ripAmt; g += rip * ripAmt; b += rip * ripAmt * 0.85;

      // Grain. A hash rather than a noise call — four million pixels.
      const grain = rand(pxx * 0.7 + py * 311.1) - 0.5;
      r += grain * 26; g += grain * 25; b += grain * 22;

      // Shell hash: bright carbonate fragments, sparse and hard-edged.
      const shell = rand(pxx * 13.1 + py * 7.7 + 91.3);
      if (shell > 0.9965) { r = 232; g = 226; b = 208; }
      else if (shell < 0.0022) { r *= 0.42; g *= 0.44; b *= 0.42; }

      const k = (py * px + pxx) * 4;
      data[k] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[k + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[k + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // --- painted features, on top of the sediment -------------------------
  const toPx = (w) => ((w + SEABED_SIZE / 2) / SEABED_SIZE) * px;
  const stroke = (pts, width, style, cap = 'round') => {
    ctx.strokeStyle = style;
    ctx.lineWidth = (width / SEABED_SIZE) * px;
    ctx.lineCap = cap;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(toPx(pts[0].x), toPx(pts[0].y));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(toPx(pts[i].x), toPx(pts[i].y));
    ctx.stroke();
  };

  // Bacterial mats and algal film — big soft patches of colour on the flats.
  for (let i = 0; i < 900; i++) {
    const wx = (rand(i + 700) - 0.5) * SEABED_SIZE;
    const wz = (rand(i + 1700) - 0.5) * SEABED_SIZE;
    const h = seabedHeight(wx, wz);
    const tone = rand(i + 2700);
    ctx.fillStyle = h > 0.8
      ? (tone > 0.6 ? 'rgba(198,124,126,0.20)' : 'rgba(150,108,72,0.20)')   // coralline / iron stain
      : (tone > 0.5 ? 'rgba(84,108,72,0.20)' : 'rgba(96,116,94,0.16)');     // olive mat
    ctx.beginPath();
    ctx.arc(toPx(wx), toPx(wz), 8 + rand(i + 3700) * 34, 0, Math.PI * 2);
    ctx.fill();
  }

  // The cable trench: a dark groove with the spoil berm still alongside it.
  stroke(CABLE, 1.5, 'rgba(120,112,92,0.34)');
  stroke(CABLE, 0.7, 'rgba(40,44,40,0.62)');

  // The trench floor of the channel — scoured to gravel, no fines left.
  stroke([CHANNEL_A, CHANNEL_B], 5.5, 'rgba(70,80,78,0.40)');
  stroke([CHANNEL_A, CHANNEL_B], 2.6, 'rgba(126,126,116,0.26)');

  // The scar. Fresh spoil either side, dark furrow down the middle — the one
  // feature on this map the player has to be able to read at a glance.
  stroke([SCAR_FROM, SCAR_TO], 4.2, 'rgba(196,182,152,0.46)');
  stroke([SCAR_FROM, SCAR_TO], 1.8, 'rgba(44,46,40,0.60)');

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  console.log(`[seabed] macro texture ${px}px in ${(performance.now() - t0) | 0}ms`);
  return tex;
}

// Tiling grit, multiplied in below the macro map so the floor keeps detail
// right up to the camera without a 8k texture.
function detailTexture(px = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(px, px);
  for (let i = 0; i < px * px; i++) {
    const v = rand(i * 1.37 + 5.1);
    const c = 128 + (v - 0.5) * 120;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = c;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------------------------------------------------------------- biology

// One canvas, one gorgonian fan silhouette. Branching drawn rather than
// modelled: a sea fan is mostly holes, and geometry that is mostly holes is
// geometry you should be paying for in alpha instead.
function fanTexture(px = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, px, px);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  const branch = (x, y, ang, len, w, depth) => {
    if (depth > 5 || len < 2) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    const s = rand(depth * 31 + x * 0.7 + y * 1.3);
    branch(x2, y2, ang - 0.34 - s * 0.2, len * 0.74, w * 0.78, depth + 1);
    branch(x2, y2, ang + 0.34 + s * 0.2, len * 0.74, w * 0.78, depth + 1);
  };
  branch(px / 2, px - 6, -Math.PI / 2, px * 0.24, 6, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A tapered, slightly bent blade. A flat rectangle reads as a scrap of paper
// standing on the floor — which is precisely how the first pass of this map
// looked — and the taper is what fixes it.
function bladeGeometry(segments = 4) {
  const pos = [], uv = [], idx = [];
  const H = 1.0, W = 0.075;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = W * (1 - t * 0.82);
    const bend = t * t * 0.28;
    pos.push(-w, t * H, bend, w, t * H, bend);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Three blades per instance, fanned out. Seagrass grows in tufts, never as
// lone spikes, and one tuft costs the same as one spike.
function tuftGeometry() {
  const geos = [];
  for (let i = 0; i < 3; i++) {
    const g = bladeGeometry();
    g.rotateY(i * 2.1);
    g.rotateZ((rand(i * 7.3) - 0.5) * 0.4);
    g.translate((rand(i * 3.1) - 0.5) * 0.12, 0, (rand(i * 5.9) - 0.5) * 0.12);
    geos.push(g);
  }
  return mergeGeometries(geos);
}

function mergeGeometries(geos) {
  const pos = [], uv = [], idx = [];
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position.array, u = g.attributes.uv.array;
    const ix = g.index.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < u.length; i++) uv.push(u[i]);
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + offset);
    offset += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Everything soft down here moves with the current. One shared uniform, a
// dozen lines of vertex shader, and the whole range stops being a still life.
function addSway(material, uniforms, amount = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uSway = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        uniform float uSway;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 iOrigin = vec3(0.0);
        #endif
        float phase = iOrigin.x * 0.7 + iOrigin.z * 0.55;
        // Stiffness rises toward the holdfast: the tip travels, the base does not.
        float stiff = smoothstep(0.0, 1.0, transformed.y);
        float wave = sin(uTime * 1.25 + phase) * 0.6 + sin(uTime * 0.53 + phase * 1.7) * 0.4;
        transformed.x += wave * stiff * 0.20 * uSway;
        transformed.z += cos(uTime * 0.9 + phase * 1.3) * stiff * 0.12 * uSway;
      `);
  };
}

// Six species, five draw calls, and per-instance colour so one call carries a
// whole palette. The placement rules are biology, not scatter: filter feeders
// need hard ground and moving water, grass needs soft ground and shelter, and
// nothing at all lives on eighteen-month-old scour.
function growth(scene, uniforms) {
  const group = new THREE.Group();
  group.name = 'marine-growth';

  const hard = (x, z) => smoothstep(fbm(x * 0.031 + 21, z * 0.031 + 4, 2), 0.56, 0.76);
  const channelD = (x, z) => segmentDistance(x, z, CHANNEL_A, CHANNEL_B);
  const scarD = (x, z) => segmentDistance(x, z, SCAR_FROM, SCAR_TO);

  const fanTex = fanTexture();

  const SPECIES = [
    {
      name: 'seagrass', count: 2400, seed: 3000, spread: 3.4, cluster: 7,
      geo: tuftGeometry(),
      mat: new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 1.0, side: THREE.DoubleSide,
        transparent: true, opacity: 0.94, alphaTest: 0.2,
      }),
      colors: [0x4e7c3e, 0x628c48, 0x3f6a38, 0x76a054, 0x557a52],
      min: 0.30, max: 0.72, sway: 1.0,
      ok: (x, z, h) => h > -0.3 && hard(x, z) < 0.5 && channelD(x, z) > 4.2,
    },
    {
      name: 'sponge', count: 560, seed: 31000, spread: 2.6, cluster: 4,
      geo: new THREE.CylinderGeometry(0.42, 0.28, 1.0, 9, 1, true),
      mat: new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.86, side: THREE.DoubleSide, flatShading: true,
      }),
      // The orange is not decoration. Barrel sponges really are that colour,
      // and under a white survey light they are the first thing you see.
      colors: [0xc4632c, 0xd8813a, 0xa8482a, 0xd9a24a, 0xb8553c],
      min: 0.22, max: 0.62, sink: 0.12,
      // Hard ground, and they crowd the channel shoulders where the flow
      // brings them food. That is why the trench edge looks alive.
      ok: (x, z, h) => hard(x, z) > 0.35 && h > 0.4 &&
        (channelD(x, z) < 11 ? true : rand(x * 3.1 + z * 7.7) > 0.55),
    },
    {
      name: 'fan', count: 300, seed: 47000, spread: 3.0, cluster: 3,
      geo: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
      mat: new THREE.MeshStandardMaterial({
        color: 0xffffff, map: fanTex, alphaMap: fanTex, roughness: 1.0,
        side: THREE.DoubleSide, transparent: true, alphaTest: 0.35,
      }),
      colors: [0xa8374f, 0x8e3a6b, 0xc0506a, 0xd0705a, 0x7e3a78],
      min: 0.5, max: 1.15, sway: 0.55,
      // Sea fans stand across the flow to strain it, so they only go where
      // there is flow: the shoulders of the channel.
      ok: (x, z, h) => h > 0.5 && channelD(x, z) > 3.6 && channelD(x, z) < 12,
    },
    {
      name: 'softcoral', count: 700, seed: 61000, spread: 2.2, cluster: 5,
      geo: new THREE.IcosahedronGeometry(1, 1),
      mat: new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.92, flatShading: true,
      }),
      colors: [0xd8a93f, 0xb8c65e, 0xcc6a94, 0x62b0a2, 0xd07a4a],
      min: 0.10, max: 0.26, sink: 0.35, squash: 0.68,
      ok: (x, z, h) => hard(x, z) > 0.25 && h > 0.15,
    },
    {
      name: 'rubble', count: 900, seed: 83000, spread: 7.0, cluster: 9,
      geo: new THREE.DodecahedronGeometry(1, 0),
      mat: new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.95, flatShading: true,
      }),
      colors: [0x9a9284, 0x8b8478, 0xa89a8e, 0xb08e88, 0x77736a],
      min: 0.16, max: 0.85, sink: 0.42, squash: 0.6, tilt: true,
      ok: (x, z, h) => h > -1.6,
    },
  ];

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
  const report = [];

  for (const sp of SPECIES) {
    const mesh = new THREE.InstancedMesh(sp.geo, sp.mat, sp.count);
    mesh.name = sp.name;
    mesh.castShadow = sp.name === 'rubble' || sp.name === 'sponge';
    mesh.receiveShadow = true;
    if (sp.sway) addSway(sp.mat, uniforms, sp.sway);

    let placed = 0;
    for (let i = 0; placed < sp.count && i < sp.count * 60; i++) {
      // Clustered, never uniform. Nothing in nature is evenly spaced, and an
      // even scatter is the single loudest tell that a world was generated.
      const c = Math.floor(i / sp.cluster);
      const cx = (rand(c + sp.seed) - 0.5) * SEABED_SIZE * 0.8;
      const cz = (rand(c + sp.seed + 2000) - 0.5) * SEABED_SIZE * 0.8;
      const x = cx + (rand(i + sp.seed + 5000) - 0.5) * sp.spread;
      const z = cz + (rand(i + sp.seed + 8000) - 0.5) * sp.spread;

      const h = seabedHeight(x, z);
      // Scoured trench floor and the fresh drag scar stay bare. The bare scar
      // is the proof of recency — growth on it would undo the whole story.
      if (channelD(x, z) < 2.6) continue;
      if (scarD(x, z) < 2.0) continue;
      if (!sp.ok(x, z, h)) continue;

      const s = sp.min + rand(i + sp.seed + 14000) * (sp.max - sp.min);
      e.set(sp.tilt ? (rand(i + sp.seed + 17000) - 0.5) * 0.7 : 0,
            rand(i + sp.seed + 20000) * Math.PI * 2,
            sp.tilt ? (rand(i + sp.seed + 23000) - 0.5) * 0.7 : 0);
      q.setFromEuler(e);
      pos.set(x, h - (sp.sink ?? 0) * s, z);
      scl.set(s, s * (sp.squash ?? 1), s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(placed, m);

      // Per-instance colour: one draw call, a whole palette. Each pick is
      // jittered so a species reads as a population, not as five swatches.
      const base = sp.colors[(rand(i + sp.seed + 26000) * sp.colors.length) | 0];
      col.setHex(base);
      const j = (rand(i + sp.seed + 29000) - 0.5) * 0.22;
      col.offsetHSL((rand(i + sp.seed + 31000) - 0.5) * 0.04, j * 0.5, j);
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
  console.log(`[seabed] biology — ${report.join(', ')} (${SPECIES.length} instanced draws)`);
  return group;
}

// ---------------------------------------------------------------- water

// Marine snow. Detritus falling through the column — the cheapest, most
// recognisable signal that the camera is underwater and not in fog. Round
// sprites: square points read as confetti, which is how the first pass looked.
function snowSprite(px = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  return new THREE.CanvasTexture(canvas);
}

function marineSnow(scene) {
  const COUNT = 2600;
  const SPAN = 74;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  const fall = new Float32Array(COUNT);
  const sway = new Float32Array(COUNT);
  const sizes = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (rand(i + 100) - 0.5) * SPAN;
    positions[i * 3 + 1] = rand(i + 500) * 22 - 1;
    positions[i * 3 + 2] = (rand(i + 900) - 0.5) * SPAN;
    fall[i] = 0.10 + rand(i + 1300) * 0.26;
    sway[i] = rand(i + 1700) * 6.283;
    sizes[i] = 0.022 + rand(i + 2100) * 0.070;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  // Custom point material so each mote keeps its own size — a uniform size
  // gives the whole field one apparent distance and kills the depth read.
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: snowSprite() },
      uScale: { value: 600 },
      uFogColor: { value: new THREE.Color(0x14454f) },
      uFogNear: { value: 16 }, uFogFar: { value: 78 },
    },
    vertexShader: `
      attribute float size;
      uniform float uScale;
      uniform float uFogNear;
      uniform float uFogFar;
      varying float vAlpha;
      varying float vFog;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // Orthographic: no perspective divide to ride on, so size is set
        // straight from the attribute against the projection scale.
        gl_PointSize = size * uScale * projectionMatrix[1][1];
        vFog = smoothstep(uFogNear, uFogFar, -mv.z);
        vAlpha = 0.30 + size * 4.0;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uFogColor;
      varying float vAlpha;
      varying float vFog;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        if (t.a < 0.02) discard;
        vec3 c = mix(vec3(0.85, 0.92, 0.90), uFogColor, vFog * 0.8);
        gl_FragColor = vec4(c, t.a * vAlpha * (1.0 - vFog * 0.75));
      }`,
    transparent: true, depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'marine-snow';
  points.frustumCulled = false;
  scene.add(points);

  return {
    points,
    update(dt, t) {
      const p = geometry.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        p[i * 3 + 1] -= fall[i] * dt;
        p[i * 3] += Math.sin(t * 0.3 + sway[i]) * dt * 0.10;      // drift on the current
        p[i * 3 + 2] += Math.cos(t * 0.21 + sway[i]) * dt * 0.06;
        if (p[i * 3 + 1] < -2) p[i * 3 + 1] = 21;
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
      uSurface: { value: new THREE.Color(0x3a97a6) },
      uMid: { value: new THREE.Color(0x14505d) },
      uDeep: { value: new THREE.Color(0x061c23) },
    },
    vertexShader: `varying vec3 vW;
      void main(){ vW=(modelMatrix*vec4(position,1.0)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform vec3 uSurface,uMid,uDeep; varying vec3 vW;
      void main(){ float h=normalize(vW).y;
        vec3 c=mix(uMid,uSurface,smoothstep(0.1,0.9,h));
        c=mix(uDeep,c,smoothstep(-0.5,0.05,h));
        gl_FragColor=vec4(c,1.0);}`,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'water-column';
  dome.frustumCulled = false;
  scene.add(dome);
  return dome;
}

// There are deliberately no light shafts here. Nothing reaches 240 metres to
// cast them, and as geometry they came out as four wide planes that projected
// into flat vertical bands across the board — they read as smudges on the
// lens, not as light in water. The column dome, the fog falloff and the
// marine snow carry "deep" on their own.

// ---------------------------------------------------------------- lights

// Survey lights. This is the justification for every colour on the range: at
// 240 metres nothing is lit until a vehicle lights it, so the units carry
// their own pool of white light with them. Parented to the unit groups, which
// means they follow every move for free and never need a frame hook.
//
// Unshadowed points — three of them, no shadow maps, no tuning.
export function attachSurveyLights(units) {
  const lights = [];
  for (const unit of units) {
    const host = unit.group || unit;
    // Bright, broad and slow-falling. This is the only warm light on the
    // range and every colour the player sees is downstream of it, so it has
    // to beat the ambient rather than tint it.
    const light = new THREE.PointLight(0xffe9c8, 34, 20, 1.8);
    light.position.set(0, 1.5, 0.8);
    light.castShadow = false;
    light.name = `survey-light-${unit.id || ''}`;
    host.add(light);
    lights.push(light);
  }
  console.log(`[seabed] ${lights.length} survey lights attached to the fleet`);
  return lights;
}

// ---------------------------------------------------------------- assembly

export function createSeabed(scene) {
  const uniforms = { uTime: { value: 0 } };

  const segments = 300;
  const geometry = new THREE.PlaneGeometry(SEABED_SIZE, SEABED_SIZE, segments, segments);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // NOTE the minus. A PlaneGeometry laid flat with rotation.x = -PI/2 sends
    // local +y to world -z, so sampling the field at the raw local y builds
    // the whole seabed mirrored against its own height function. Everything
    // placed by seabedHeight() — the instrument, the trench props, the scar
    // hardware — then sits at a height the ground does not have. Measured:
    // Range Instrument 7 was 2.7 m under the sediment, which is why the map
    // looked like it was missing half its objects.
    pos.setZ(i, seabedHeight(pos.getX(i), -pos.getY(i)));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const macro = makeSeabedTexture();
  const detail = detailTexture();
  const material = new THREE.MeshStandardMaterial({
    map: macro,
    // Near-white. The sediment's colour lives in the texture, and water plus
    // the survey lights do the rest — tinting the material green here is what
    // flattened the first pass into one dead wash.
    color: 0xf2f2ee,
    roughness: 0.96, metalness: 0.0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail };
    shader.uniforms.uTime = uniforms.uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform sampler2D uDetail;
        uniform float uTime;

        float h21(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float n2(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
                     mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        // Caustics. At this depth they are the AUVs' own light refracting
        // through moving water rather than sunlight, so they are slow and
        // shallow — but they are the difference between a floor and a floor
        // with water on top of it.
        float caustic(vec2 p, float t) {
          vec2 i = p;
          float c = 0.0;
          for (int n = 0; n < 3; n++) {
            float tt = t * (1.0 - (2.6 / float(n + 1)));
            i = p + vec2(cos(tt - i.x) + sin(tt + i.y),
                         sin(tt - i.y) + cos(tt + i.x));
            c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.12),
                                   p.y / (cos(i.y + tt) / 0.12)));
          }
          c /= 3.0;
          c = 1.16 - pow(c, 1.4);
          return clamp(pow(abs(c), 7.0), 0.0, 1.0);
        }
      `)
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec3 grit = texture2D(uDetail, vMapUv * 96.0).rgb;
        diffuseColor.rgb *= (0.80 + grit * 0.40);

        vec2 wp = vec2(vMapUv.x - 0.5, 0.5 - vMapUv.y) * ${SEABED_SIZE.toFixed(1)};

        // Sediment mottling across the scales the macro map cannot hold.
        float mott = n2(wp * 0.42) * 0.55 + n2(wp * 1.6) * 0.30 + n2(wp * 4.7) * 0.15;
        diffuseColor.rgb *= 0.80 + mott * 0.42;
        // Fines and organic matter go green where they collect.
        diffuseColor.rgb = mix(diffuseColor.rgb,
                               diffuseColor.rgb * vec3(0.84, 0.96, 0.80),
                               smoothstep(0.46, 0.82, mott) * 0.45);

        float up = clamp(vNormal.y, 0.0, 1.0);
        float ca = caustic(wp * 0.32, uTime * 0.22) * up;
        diffuseColor.rgb += vec3(0.20, 0.26, 0.24) * ca;
      `);
  };

  const floor = new THREE.Mesh(geometry, material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  floor.name = 'seabed';
  scene.add(floor);

  const dome = waterColumn(scene);
  const flora = growth(scene, uniforms);
  const snow = marineSnow(scene);

  return {
    terrain: floor,
    dome,
    vegetation: flora,
    height: seabedHeight,
    // main.js ticks this as `terrain.dust.update(dt, t)`. Everything that
    // moves on this map hangs off it, so there is one clock and one hook.
    dust: {
      points: snow.points,
      update(dt, t) {
        uniforms.uTime.value = t;
        snow.update(dt, t);
      },
    },
  };
}
