import * as THREE from 'three';

export const PALETTE = {
  bg: 0x0a0d0a,
  cyan: 0x4ce0d8,
  amber: 0xe0a84c,
  red: 0xe0524c,
  dim: 0x4a5a52,
};

export const GROUND_SIZE = 30;

// Procedural grid texture — kept in-code so nothing loads from disk or a CDN.
function makeGridTexture(tiles = GROUND_SIZE, px = 64) {
  const size = tiles * px;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#131a16';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(96, 132, 120, 0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= tiles; i++) {
    const p = i * px + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, 0); ctx.lineTo(p, size);
    ctx.moveTo(0, p); ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Heavier line every 5 tiles for readable scale.
  ctx.strokeStyle = 'rgba(120, 170, 156, 0.9)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= tiles; i += 5) {
    const p = i * px + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, 0); ctx.lineTo(p, size);
    ctx.moveTo(0, p); ctx.lineTo(size, p);
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(PALETTE.bg, 1);
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.bg);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({
      map: makeGridTexture(),
      roughness: 0.95,
      metalness: 0.0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  const key = new THREE.DirectionalLight(0xbfe8e2, 1.5);
  key.position.set(8, 14, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 50;
  const s = GROUND_SIZE * 0.75;
  key.shadow.camera.left = -s;
  key.shadow.camera.right = s;
  key.shadow.camera.top = s;
  key.shadow.camera.bottom = -s;
  key.shadow.bias = -0.0005;
  scene.add(key);

  scene.add(new THREE.AmbientLight(0x2a3a38, 1.1));

  return { scene, ground };
}

// Step-1 stand-ins for the squad. Replaced by models in step 4 if assets allow.
export function createPlaceholderUnits(scene) {
  const specs = [
    { name: 'ALPHA', color: PALETTE.cyan, pos: [-3, 0, 2] },
    { name: 'BETA-1', color: PALETTE.amber, pos: [1, 0, -1] },
    { name: 'BETA-2', color: PALETTE.cyan, pos: [4, 0, 3] },
  ];

  return specs.map(({ name, color, pos }) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.4, 0.9),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        roughness: 0.6,
        metalness: 0.1,
        flatShading: true,
      })
    );
    mesh.position.set(pos[0], 0.7, pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    scene.add(mesh);
    return mesh;
  });
}
