import * as THREE from 'three';

// Status as a silhouette outline instead of a full-body tint, so the
// character keeps whatever materials the FBX shipped with.
//
// Inverted-hull technique: a second copy of the skinned mesh, expanded along
// its normals and rendered back-faces-only. The expansion is injected before
// the skinning chunk so the outline deforms with the animation instead of
// floating off the bones.

// Displacement happens in bind space, which for this rig is centimetres —
// the root carries the 0.01 scale. So 2.2 here is ~0.022 world units.
const THICKNESS = 2.2;

function outlineMaterial(color) {
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  material.userData.thickness = { value: THICKNESS };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = material.userData.thickness;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uThickness;')
      // begin_vertex sets `transformed`; the skinning chunk runs after it, so
      // displacing here means the outline is skinned along with the mesh.
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += objectNormal * uThickness;'
      );
  };
  return material;
}

export class StatusRim {
  constructor(model, color) {
    this.meshes = [];
    this.materials = [];

    const sources = [];
    model.traverse((child) => {
      if (child.isSkinnedMesh || child.isMesh) sources.push(child);
    });

    for (const source of sources) {
      const material = outlineMaterial(color);
      let shell;
      if (source.isSkinnedMesh) {
        // Shares geometry and skeleton — no extra skinning cost beyond the
        // second draw call.
        shell = new THREE.SkinnedMesh(source.geometry, material);
        shell.bind(source.skeleton, source.bindMatrix);
      } else {
        shell = new THREE.Mesh(source.geometry, material);
      }
      shell.name = `${source.name}__rim`;
      shell.frustumCulled = false;
      shell.castShadow = false;
      shell.receiveShadow = false;
      shell.renderOrder = -1;
      source.parent.add(shell);
      shell.position.copy(source.position);
      shell.quaternion.copy(source.quaternion);
      shell.scale.copy(source.scale);

      this.meshes.push(shell);
      this.materials.push(material);
    }
  }

  setColor(color) {
    for (const material of this.materials) material.color.set(color);
  }

  // Broken sensors get a fatter, pulsing outline; healthy units sit steady.
  setPulse(active) {
    this.pulsing = active;
    if (!active) {
      for (const material of this.materials) {
        material.userData.thickness.value = THICKNESS;
        material.opacity = 0.95;
      }
    }
  }

  // Hit feedback: blow the outline out white, then settle back.
  flash(duration = 0.45) {
    const base = this.materials.map((m) => m.color.clone());
    const t0 = performance.now();
    const step = () => {
      const k = 1 - Math.min(1, (performance.now() - t0) / (duration * 1000));
      if (k <= 0) {
        this.materials.forEach((m, i) => {
          m.color.copy(base[i]);
          m.userData.thickness.value = THICKNESS;
        });
        return;
      }
      this.materials.forEach((m, i) => {
        m.color.copy(base[i]).lerp(new THREE.Color(0xffffff), k);
        m.userData.thickness.value = THICKNESS * (1 + k * 2.2);
      });
      requestAnimationFrame(step);
    };
    step();
  }

  update(t) {
    if (!this.pulsing) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 7.0);
    for (const material of this.materials) {
      material.userData.thickness.value = THICKNESS * (1.0 + pulse * 1.1);
      material.opacity = 0.65 + 0.35 * pulse;
    }
  }
}
