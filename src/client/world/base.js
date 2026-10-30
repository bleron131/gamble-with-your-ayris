// Basisklasse für begehbare 3D-Welten (Lobby, Casino, Finale).
import * as THREE from 'three';
import { smokeTexture, confettiTexture } from '../textures.js';

export class World {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.colliders = [];
    this.interactables = [];
    this.updaters = [];
    this.mode = 'third';
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.particles = new Particles(this.scene);
    this.updaters.push((dt) => this.particles.update(dt));
  }

  addBox(cx, cz, w, d) { this.colliders.push({ type: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }); }
  addCircle(x, z, r) { this.colliders.push({ type: 'circle', x, z, r }); }
  addInteract(o) { this.interactables.push({ radius: 1.6, ...o }); return o; }

  // Wände eines rechteckigen Raums
  addRoomWalls(minX, maxX, minZ, maxZ, t = 0.5) {
    this.addBox((minX + maxX) / 2, minZ - t / 2, maxX - minX + t * 2, t);
    this.addBox((minX + maxX) / 2, maxZ + t / 2, maxX - minX + t * 2, t);
    this.addBox(minX - t / 2, (minZ + maxZ) / 2, t, maxZ - minZ);
    this.addBox(maxX + t / 2, (minZ + maxZ) / 2, t, maxZ - minZ);
  }

  collide(p, r = 0.3) {
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.colliders) {
        if (c.type === 'box') {
          const nx = Math.max(c.minX, Math.min(p.x, c.maxX));
          const nz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
          const dx = p.x - nx, dz = p.z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; }
            else {
              // innerhalb der Box: kürzester Ausweg
              const opts = [[c.minX - r - p.x, 0], [c.maxX + r - p.x, 0], [0, c.minZ - r - p.z], [0, c.maxZ + r - p.z]];
              opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
              p.x += opts[0][0]; p.z += opts[0][1];
            }
          }
        } else {
          const dx = p.x - c.x, dz = p.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + r;
          if (d < min && d > 1e-6) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min; }
        }
      }
    }
  }

  nearestInteract(pos) {
    let best = null, bd = Infinity;
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const d = Math.hypot(pos.x - it.pos.x, pos.z - it.pos.z);
      if (d < it.radius && d < bd) { bd = d; best = it; }
    }
    return best;
  }

  update(dt, t) { for (const u of this.updaters) u(dt, t); }

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    });
  }
}

// Einfaches Sprite-Partikelsystem (Shisha-Rauch, Konfetti, Explosionen)
export class Particles {
  static density = 1;
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.smokeMat = new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0.5 });
  }
  emit(opts) {
    // Weniger Partikel auf niedrigen Grafikstufen (Konfetti/Rauch bleiben sichtbar, nur dünner)
    if (Particles.density < 1 && Math.random() > Particles.density) return;
    this.spawn(opts);
  }
  spawn({ pos, vel = [0, 0.3, 0], life = 3, size = 0.3, grow = 0.4, color = '#ffffff', opacity = 0.45, gravity = 0, type = 'smoke', spin = 0, additive = false }) {
    const mat = type === 'confetti'
      ? new THREE.SpriteMaterial({ map: confettiTexture(), color, transparent: true, depthWrite: false })
      : new THREE.SpriteMaterial({ map: smokeTexture(), color, transparent: true, depthWrite: false, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.list.push({ s, vel: new THREE.Vector3(...vel), life, max: life, size, grow, gravity, opacity, type, spin });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.s); p.s.material.dispose(); this.list.splice(i, 1); continue; }
      p.vel.y -= p.gravity * dt;
      if (p.type === 'confetti') { p.vel.x *= 0.99; p.vel.z *= 0.99; p.vel.y = Math.max(p.vel.y, -1.2); }
      p.s.position.addScaledVector(p.vel, dt);
      const k = 1 - p.life / p.max;
      if (p.type === 'confetti') { p.s.material.rotation += p.spin * dt; p.s.scale.set(p.size, p.size * Math.abs(Math.sin(p.life * 6)) + 0.01, 1); }
      else { p.s.scale.setScalar(p.size + p.grow * k); p.s.material.opacity = p.opacity * (1 - k) * Math.min(1, k * 6); }
    }
  }
  confetti(center, count = 120, spread = 3) {
    const cols = ['#ff3cac', '#ffd97a', '#2bd9fe', '#7cff6b', '#ff6b35', '#b388ff'];
    for (let i = 0; i < count; i++) {
      this.emit({
        pos: new THREE.Vector3(center.x + (Math.random() - 0.5) * spread, center.y + Math.random() * 1.5, center.z + (Math.random() - 0.5) * spread),
        vel: [(Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3],
        life: 3 + Math.random() * 2, size: 0.07, color: cols[i % cols.length], gravity: 3, type: 'confetti', spin: (Math.random() - 0.5) * 10,
      });
    }
  }
}
