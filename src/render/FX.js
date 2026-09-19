import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './Scene.js';

// Impacts, drone scans, hostile markers. Deterministic — every burst uses a
// fixed pattern so the demo plays back the same way every time.
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.hostiles = [];
  }

  burst(x, z, { color = PALETTE.red, count = 22, spread = 2.2, life = 0.75 } = {}) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const speed = spread * (0.45 + ((i * 37) % 11) / 18);
      pos[i * 3] = x; pos[i * 3 + 1] = 0.6; pos[i * 3 + 2] = z;
      vel.push(new THREE.Vector3(Math.sin(a) * speed, 1.4 + ((i * 13) % 7) / 6, Math.cos(a) * speed));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size: 0.18, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(points);
    this.active.push({ points, vel, age: 0, life });
  }

  // Expanding ring — drone sweep, breach shock, relay pulse.
  ring(x, z, { color = PALETTE.cyan, radius = 6, duration = 0.9 } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.45, 64),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    mesh.renderOrder = 12;
    this.scene.add(mesh);
    gsap.to(mesh.scale, { x: radius, y: radius, z: radius, duration, ease: 'power2.out' });
    gsap.to(mesh.material, {
      opacity: 0, duration, ease: 'power1.in',
      onComplete: () => { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); },
    });
  }

  hitFlash(unit) {
    // Outlined characters flash the rim; box placeholders flash emissive.
    if (unit.rim) {
      unit.rim.flash();
    } else {
      for (const p of unit.group.userData.tintParts) {
        const from = p.material.emissiveIntensity;
        gsap.fromTo(p.material, { emissiveIntensity: 5 }, { emissiveIntensity: from, duration: 0.6 });
      }
    }
    gsap.fromTo(unit.group.position, { y: 0.25 }, { y: 0, duration: 0.5, ease: 'bounce.out' });
    this.burst(unit.position.x, unit.position.z);
  }

  revealHostiles(positions) {
    for (const [x, z] of positions) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.3, 0.7),
        new THREE.MeshStandardMaterial({
          color: PALETTE.red, emissive: PALETTE.red, emissiveIntensity: 0.8, flatShading: true,
        })
      );
      body.position.y = 0.65;
      body.castShadow = true;
      g.add(body);
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.7, 4),
        new THREE.MeshBasicMaterial({
          color: PALETTE.red, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = 0.05;
      g.add(marker);
      g.position.set(x, 0, z);
      g.scale.setScalar(0.01);
      this.scene.add(g);
      gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2)' });
      gsap.to(marker.rotation, { z: Math.PI * 2, duration: 6, repeat: -1, ease: 'none' });
      this.hostiles.push(g);
      this.ring(x, z, { color: PALETTE.red, radius: 3, duration: 0.7 });
    }
  }

  clearHostiles() {
    for (const h of this.hostiles) this.scene.remove(h);
    this.hostiles = [];
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      const arr = p.points.geometry.attributes.position.array;
      for (let j = 0; j < p.vel.length; j++) {
        p.vel[j].y -= 4.2 * dt;
        arr[j * 3] += p.vel[j].x * dt;
        arr[j * 3 + 1] = Math.max(0.05, arr[j * 3 + 1] + p.vel[j].y * dt);
        arr[j * 3 + 2] += p.vel[j].z * dt;
      }
      p.points.geometry.attributes.position.needsUpdate = true;
      p.points.material.opacity = Math.max(0, 1 - p.age / p.life);
      if (p.age >= p.life) {
        this.scene.remove(p.points);
        p.points.geometry.dispose();
        p.points.material.dispose();
        this.active.splice(i, 1);
      }
    }
  }
}
