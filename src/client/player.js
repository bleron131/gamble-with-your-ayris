// Lokaler Spieler: First-Person (Casino) bzw. Third-Person (Shishabar) mit Kollision.
import * as THREE from 'three';

const EYE = 1.32;

export class LocalPlayer {
  constructor(app) {
    this.app = app;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDist = 3.6;
    this.moving = false;
    this.anim = 'idle';
    this.seated = null;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.stepT = 0;
  }

  spawn(world, index = 0) {
    const s = world.spawn;
    const off = (index % 3 - 1) * 0.6;
    const back = Math.floor(index / 3) * 0.6;
    const fwd = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    this.pos.set(s.x, 0, s.z).addScaledVector(right, off).addScaledVector(fwd, -back * 0.5);
    this.yaw = s.yaw;
    this.camYaw = s.yaw;
    this.pitch = 0;
    this.seated = null;
    this.snapCamera = true;
  }

  sit(view) {
    this.seated = view;
    const p = view.seatPose();
    this.pos.copy(p.stand).setY(0);
    this.yaw = p.yaw;
  }

  stand() {
    if (!this.seated) return;
    const p = this.seated.seatPose();
    this.seated = null;
    this.pos.copy(p.stand).setY(0);
    this.yaw = p.yaw;
    this.pitch = -0.15;
  }

  update(dt, input, world, camera) {
    const settings = this.app.save.settings;
    const sens = 0.0022 * (settings.sensitivity || 1);
    const first = world.mode === 'first';
    this.moving = false;
    if (this.emoteT > 0) { this.emoteT -= dt; this.anim = this.emote; } else if (this.anim !== 'walk') this.anim = 'idle';
    if (this.app.cinematic) {
      this.camPos.lerp(this.app.cinematic.pos, Math.min(1, dt * 2));
      this.camLook.lerp(this.app.cinematic.look, Math.min(1, dt * 2));
      camera.position.copy(this.camPos);
      camera.lookAt(this.camLook);
      return;
    }
    if (this.seated) {
      const p = this.seated.seatPose();
      this.camPos.lerp(p.cam, Math.min(1, dt * 5));
      this.camLook.lerp(p.look, Math.min(1, dt * 5));
      camera.position.copy(this.camPos);
      camera.lookAt(this.camLook);
      this.anim = 'idle';
      return;
    }
    // Maus-Look
    if (input.enabled && (input.locked || input.dragging)) {
      if (first) {
        this.yaw -= input.mouseDX * sens;
        this.pitch = THREE.MathUtils.clamp(this.pitch - input.mouseDY * sens, -1.3, 1.2);
      } else {
        this.camYaw -= input.mouseDX * sens;
        this.camPitch = THREE.MathUtils.clamp(this.camPitch + input.mouseDY * sens, -0.1, 1.1);
      }
    }
    if (!first) this.camDist = THREE.MathUtils.clamp(this.camDist + input.wheel * 0.4, 1.8, 7);
    // Bewegung
    const f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    if (f || r) {
      const baseYaw = first ? this.yaw : this.camYaw;
      const fwd = new THREE.Vector3(Math.sin(baseYaw), 0, Math.cos(baseYaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const dir = fwd.multiplyScalar(f).addScaledVector(right, r).normalize();
      const speed = input.down('ShiftLeft') || input.down('ShiftRight') ? 5.2 : 3.2;
      this.pos.addScaledVector(dir, speed * dt);
      this.moving = true;
      if (!first) {
        const target = Math.atan2(dir.x, dir.z);
        let d = target - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * Math.min(1, dt * 12);
      }
      this.stepT -= dt * (speed / 3.2);
      if (this.stepT < 0) { this.stepT = 0.36; this.app.sfx.step(0.03); }
    }
    world.collide(this.pos, 0.3);
    if (this.moving) this.emoteT = 0;
    if (!(this.emoteT > 0)) this.anim = this.moving ? 'walk' : 'idle';
    // Kamera
    if (first) {
      const target = new THREE.Vector3(this.pos.x, EYE + (this.moving ? Math.sin(performance.now() / 90) * 0.025 : 0), this.pos.z);
      camera.position.copy(target);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(this.pitch, this.yaw + Math.PI, 0);
      this.camPos.copy(camera.position);
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      this.camLook.copy(camera.position).add(dir);
    } else {
      const head = new THREE.Vector3(this.pos.x, 1.35, this.pos.z);
      const back = new THREE.Vector3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
      const want = head.clone().addScaledVector(back, this.camDist);
      want.y = Math.max(0.4, Math.min(4.2, want.y));
      this.clampCamera(head, want, world);
      if (this.snapCamera) { this.camPos.copy(want); this.camLook.copy(head); this.snapCamera = false; }
      this.camPos.lerp(want, Math.min(1, dt * 8));
      this.camLook.lerp(head, Math.min(1, dt * 10));
      camera.position.copy(this.camPos);
      camera.lookAt(this.camLook);
    }
  }

  // Kamera nicht durch Wände: entlang der Linie Kopf→Kamera gegen Kollisionsboxen prüfen
  clampCamera(head, want, world) {
    const m = 0.18;
    const p = new THREE.Vector3();
    let ok = 0;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      p.lerpVectors(head, want, t);
      let blocked = false;
      for (const c of world.colliders) {
        if (c.type !== 'box') continue;
        if (p.x > c.minX - m && p.x < c.maxX + m && p.z > c.minZ - m && p.z < c.maxZ + m) { blocked = true; break; }
      }
      if (blocked) break;
      ok = t;
    }
    if (ok < 1) { want.lerpVectors(head, want, Math.max(0.12, ok)); want.y += (1 - ok) * 0.8; }
  }

  playEmote(a, dur = 2.6) { this.emote = a; this.emoteT = dur; }

  pose() {
    return { p: [+this.pos.x.toFixed(3), 0, +this.pos.z.toFixed(3)], r: +this.yaw.toFixed(3), a: this.seated ? 'idle' : this.anim, pitch: +this.pitch.toFixed(2) };
  }
}
