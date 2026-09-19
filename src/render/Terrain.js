import * as THREE from 'three';
import { GROUND_SIZE } from './Scene.js';

// The world outside the wire.
//
// The compound slab is GROUND_SIZE across and everything past it used to be
// void. This puts the base in a place: open soil running to the horizon,
// gravel spill where vehicles have turned, scrub, rocks and a low ridge line
// so the eye has something to stop on.
//
// Everything here is procedural and deterministic — no texture downloads, no
// Math.random, so the demo comes up identical every run.

export const TERRAIN_SIZE = 190;

const rand = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// Warm, dusty, and varied enough that a 190-unit plane does not read as one
// flat colour. Tiled 9x across the plane.
function makeSoilTexture(px = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#7d6146';
  ctx.fillRect(0, 0, px, px);

  // Broad tonal drift — sun-bleached patches against damp, darker earth.
  const tones = ['#8a6b4c', '#6d543c', '#94775a', '#5f4a35', '#a08663'];
  for (let i = 0; i < 300; i++) {
    const x = rand(i) * px;
    const y = rand(i + 500) * px;
    const r = 40 + rand(i + 1000) * 190;
    ctx.fillStyle = tones[Math.floor(rand(i + 1500) * tones.length)];
    ctx.globalAlpha = 0.16 + rand(i + 2000) * 0.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Dry scrub and lichen — the only greens out here, kept muted.
  for (let i = 0; i < 260; i++) {
    const x = rand(i + 3000) * px;
    const y = rand(i + 3600) * px;
    const r = 6 + rand(i + 4200) * 26;
    ctx.fillStyle = rand(i + 4800) > 0.5 ? 'rgba(104,110,64,0.30)' : 'rgba(126,124,78,0.24)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grit and pebbles, bright side and shadow side so it catches the sun.
  for (let i = 0; i < 9000; i++) {
    const x = rand(i + 6000) * px;
    const y = rand(i + 7000) * px;
    const s = 1 + rand(i + 8000) * 3.2;
    const light = rand(i + 9000);
    ctx.fillStyle = light > 0.72 ? 'rgba(196,176,144,0.40)'
      : light > 0.45 ? 'rgba(60,44,31,0.34)'
      : 'rgba(150,126,96,0.22)';
    ctx.fillRect(x, y, s, s);
  }

  // Dried-out cracks in the harder pans.
  ctx.strokeStyle = 'rgba(48,34,23,0.30)';
  for (let i = 0; i < 90; i++) {
    let x = rand(i + 11000) * px;
    let y = rand(i + 12000) * px;
    ctx.lineWidth = 0.8 + rand(i + 12500) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let seg = 0; seg < 5; seg++) {
      x += (rand(i * 7 + seg) - 0.5) * 90;
      y += (rand(i * 7 + seg + 400) - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.anisotropy = 8;
  return tex;
}

// Gentle undulation, flattened to nothing near the compound so the slab, the
// walls and every prop still sit flush on y=0.
function displace(geometry) {
  const pos = geometry.attributes.position;
  const flatTo = GROUND_SIZE * 0.62;    // fully flat inside this radius
  const blendTo = GROUND_SIZE * 1.25;   // full height past this one

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);           // plane is still in XY before rotation
    const d = Math.max(Math.abs(x), Math.abs(y));
    const mask = THREE.MathUtils.smoothstep(d, flatTo, blendTo);

    const h =
      Math.sin(x * 0.055) * Math.cos(y * 0.043) * 1.5 +
      Math.sin(x * 0.017 + 1.7) * 2.4 +
      Math.cos(y * 0.021 - 0.6) * 2.0 +
      Math.sin((x + y) * 0.13) * 0.35;

    pos.setZ(i, h * mask);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

// Rocks and scrub, instanced. Nothing inside the wire, nothing on the road.
function scatter(scene) {
  const group = new THREE.Group();
  group.name = 'terrain-scatter';

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x8a7a66, roughness: 0.95, metalness: 0.02, flatShading: true,
  });
  const scrubGeo = new THREE.IcosahedronGeometry(1, 0);
  const scrubMat = new THREE.MeshStandardMaterial({
    color: 0x6f7245, roughness: 1.0, metalness: 0.0, flatShading: true,
  });

  const ROCKS = 190;
  const SCRUB = 260;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  const scrub = new THREE.InstancedMesh(scrubGeo, scrubMat, SCRUB);
  rocks.castShadow = scrub.castShadow = true;
  rocks.receiveShadow = scrub.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const place = (mesh, count, seed, minR, maxR, squash) => {
    let placed = 0;
    for (let i = 0; placed < count && i < count * 6; i++) {
      const a = rand(i + seed) * Math.PI * 2;
      const r = GROUND_SIZE * 0.72 + rand(i + seed + 700) * (TERRAIN_SIZE * 0.42);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = minR + rand(i + seed + 1400) * (maxR - minR);
      q.setFromEuler(new THREE.Euler(rand(i + seed + 2100) * 0.5, rand(i + seed + 2800) * Math.PI * 2, 0));
      m.compose(
        new THREE.Vector3(x, -s * 0.25, z),
        q,
        new THREE.Vector3(s, s * squash, s)
      );
      mesh.setMatrixAt(placed, m);
      placed++;
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  place(rocks, ROCKS, 20000, 0.35, 1.5, 0.75);
  place(scrub, SCRUB, 40000, 0.4, 1.1, 0.45);

  group.add(rocks, scrub);
  scene.add(group);
  return group;
}

export function createTerrain(scene) {
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 160, 160);
  displace(geometry);

  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: makeSoilTexture(),
      roughness: 0.98,
      metalness: 0.0,
    })
  );
  terrain.rotation.x = -Math.PI / 2;
  // Just under the compound slab so the slab always wins the depth test.
  terrain.position.y = -0.04;
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  scene.add(terrain);

  const scatterGroup = scatter(scene);

  return { terrain, scatter: scatterGroup };
}
