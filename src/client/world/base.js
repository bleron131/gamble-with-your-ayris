// Basisklasse für begehbare 3D-Welten (Lobby, Casino, Finale).
import * as THREE from 'three';
import { smokeTexture, confettiTexture } from '../textures.js';
import { bakeStatic, referencedObjects } from '../bake.js';

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

  // h = Höhe des Hindernisses (niedrige Möbel blockieren die Third-Person-Kamera nicht, wenn sie darüber schwebt)
  // top = begehbare Oberkante (Sofas, Tische …): wer höher ist, läuft darüber und kann darauf stehen
  addBox(cx, cz, w, d, h = 9, top) { const c = { type: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h }; if (top !== undefined) c.top = top; this.colliders.push(c); return c; }
  addCircle(x, z, r, top) { const c = { type: 'circle', x, z, r }; if (top !== undefined) c.top = top; this.colliders.push(c); return c; }
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
        if (c.off) continue; // abgeschaltet (z. B. offene Staff-Tür für Berechtigte)
        if (c.top !== undefined && p.y >= c.top - 0.06) continue; // darüber (gesprungen oder darauf stehend)
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

  // Detail-LOD (Handy): kleine Teile von Tischen/Automaten und Gesichtsdetails von NPCs werden in der Ferne ausgeblendet
  setupLod() {
    const details = [];
    const v = new THREE.Vector3(), sc = new THREE.Vector3();
    this.scene.updateMatrixWorld(true);
    const npcs = [];
    const walk = o => {
      for (const c of o.children) {
        if (c.userData.character) { npcs.push(c); continue; }
        if (c.isMesh) {
          if (!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
          c.getWorldScale(sc);
          if (c.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z) < 0.07) details.push({ o: c, p: c.getWorldPosition(v.clone()) });
        }
        walk(c);
      }
    };
    walk(this.scene);
    this.lod = { details, npcs, t: 0, dist: -1 };
  }

  updateLod(camera, dist, dt) {
    const L = this.lod;
    if (!L || (L.t += dt) < 0.3 && L.dist === dist) return;
    L.t = 0;
    if (!dist) { if (L.dist !== 0) for (const d of L.details) d.o.visible = true; L.dist = 0; return; }
    L.dist = dist;
    const cp = camera.position;
    for (const d of L.details) d.o.visible = d.p.distanceTo(cp) < dist;
    for (const r of L.npcs) { const near = r.position.distanceTo(cp) < dist * 1.2; for (const o of r.userData.details || []) o.visible = near; }
  }

  // Raum, Wände und als statisch markierte Deko je Material zusammenfassen (weniger Draw Calls)
  bakeWorld() {
    const keep = referencedObjects(this);
    for (const c of this.scene.children) if (!(c.isMesh || c.userData.static)) keep.add(c);
    this.bakedParts = bakeStatic(this.scene, { keep });
  }

  // Beim Raumwechsel alles freigeben, was nur zu diesem Raum gehört (Geometrien, Materialien, Canvas-Texturen).
  // Geteilte Ressourcen (Karten, Chips, gecachte Texturen und Materialien) bleiben erhalten.
  dispose() {
    for (const p of this.particles.list) p.s.material.dispose();
    this.particles.list = [];
    this.particles.dispose();
    const mats = new Set();
    this.scene.traverse(o => {
      if (typeof o.getRenderTarget === 'function') o.getRenderTarget()?.dispose(); // Spiegel (Reflector)
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) if (m && !m.userData?.shared) mats.add(m);
    });
    for (const m of mats) {
      for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap']) {
        const t = m[k];
        if (t && !t.userData?.cached) t.dispose();
      }
      m.dispose();
    }
    this.updaters = [];
  }
}

// Einfaches Sprite-Partikelsystem (Shisha-Rauch, Konfetti, Explosionen)
const _dir = new THREE.Vector3();

export class Particles {
  static density = 1;
  static max = 600; // Obergrenze gleichzeitiger Partikel (auf Handys kleiner)
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.poolC = [];
    this.poolS = [];
  }
  // Kamera (von der App gesetzt): Partikel weit weg oder hinter der Kamera werden gar nicht erst erzeugt
  static camera = null;
  static range = 45;
  emit(opts) {
    // Weniger Partikel auf niedrigen Grafikstufen (Konfetti/Rauch bleiben sichtbar, nur dünner)
    if (Particles.density < 1 && Math.random() > Particles.density) return;
    if (this.list.length >= Particles.max) return;
    const cam = Particles.camera;
    if (cam && opts.pos) {
      const dx = opts.pos.x - cam.position.x, dy = opts.pos.y - cam.position.y, dz = opts.pos.z - cam.position.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > Particles.range * Particles.range) return;
      // hinter der Kamera (mit etwas Spielraum für Partikel, die ins Bild fliegen)
      if (d2 > 16) { cam.getWorldDirection(_dir); if (dx * _dir.x + dy * _dir.y + dz * _dir.z < -2) return; }
    }
    this.spawn(opts);
  }
  // Sprites und Materialien werden wiederverwendet (Pool) statt für jedes Partikel neu erzeugt und entsorgt
  spawn({ pos, vel = [0, 0.3, 0], life = 3, size = 0.3, grow = 0.4, color = '#ffffff', opacity = 0.45, gravity = 0, type = 'smoke', spin = 0, additive = false }) {
    const pool = type === 'confetti' ? this.poolC : this.poolS;
    let s = pool.pop();
    if (!s) {
      const mat = type === 'confetti'
        ? new THREE.SpriteMaterial({ map: confettiTexture(), transparent: true, depthWrite: false })
        : new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false });
      s = new THREE.Sprite(mat);
    }
    const m = s.material;
    m.color.set(color);
    m.rotation = 0;
    if (type !== 'confetti') {
      m.opacity = opacity;
      const blend = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (m.blending !== blend) { m.blending = blend; m.needsUpdate = true; }
    } else m.opacity = 1;
    s.position.copy(pos);
    s.scale.setScalar(size);
    s.visible = true;
    this.scene.add(s);
    this.list.push({ s, vel: new THREE.Vector3(...vel), life, max: life, size, grow, gravity, opacity, type, spin });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.s);
        const pool = p.type === 'confetti' ? this.poolC : this.poolS;
        if (pool.length < 300) pool.push(p.s); else p.s.material.dispose();
        this.list[i] = this.list[this.list.length - 1]; this.list.pop();
        continue;
      }
      p.vel.y -= p.gravity * dt;
      if (p.type === 'confetti') { p.vel.x *= 0.99; p.vel.z *= 0.99; p.vel.y = Math.max(p.vel.y, -1.2); }
      p.s.position.addScaledVector(p.vel, dt);
      const k = 1 - p.life / p.max;
      if (p.type === 'confetti') { p.s.material.rotation += p.spin * dt; p.s.scale.set(p.size, p.size * Math.abs(Math.sin(p.life * 6)) + 0.01, 1); }
      else { p.s.scale.setScalar(p.size + p.grow * k); p.s.material.opacity = p.opacity * (1 - k) * Math.min(1, k * 6); }
    }
  }
  dispose() {
    for (const s of [...this.poolC, ...this.poolS]) s.material.dispose();
    this.poolC = []; this.poolS = [];
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
