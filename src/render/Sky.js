import * as THREE from 'three';

// Vertical gradient sky on a back-side sphere. Cheaper and more controllable
// than a cubemap, and it needs no asset — which the offline rule requires.
export function createSky(scene, { top = 0x2f6ea8, horizon = 0xd9a86a, ground = 0x6b543c } = {}) {
  const geometry = new THREE.SphereGeometry(320, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uGround: { value: new THREE.Color(ground) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uGround;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld).y;
        // Tight warm band at the horizon, cool above, dirt haze below.
        vec3 sky = mix(uHorizon, uTop, smoothstep(0.0, 0.45, h));
        vec3 col = mix(uGround, sky, smoothstep(-0.12, 0.02, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'sky';
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}
