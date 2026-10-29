// Lokaler Spieler: First-Person (Casino) bzw. Third-Person (Shishabar) mit Kollision.
import * as THREE from 'three';
import { Jumper } from './jump.js';

const EYE = 1.32;
const BASE_FOV = 70;
const DIZZY_TIME = 10;

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
    this.lastMouse = -10;
    this.lastKeys = '';
    this.basisYaw = 0;
    this.dizzyEnd = 0;
    this.drinkEnd = 0;
    this.hasBottle = false;
    this.time = 0;
    this.jump = new Jumper();
  }

  // Trinken & Schwindel laufen auf Echtzeit, damit sie unabhängig von der Bildrate exakt 2.4 s bzw. 10 s dauern
  get dizzyT() { return Math.max(0, (this.dizzyEnd - performance.now()) / 1000); }
  get drinkT() { return Math.max(0, (this.drinkEnd - performance.now()) / 1000); }
  startDrink(sec) { this.drinkEnd = performance.now() + sec * 1000; }

  // Schwindel nach MAKKA: weich ein- und ausblenden
  startDizzy() { this.dizzyEnd = performance.now() + DIZZY_TIME * 1000; }
  get dizzyK() {
    if (!(this.dizzyT > 0)) return 0;
    const k = Math.min(1, (DIZZY_TIME - this.dizzyT) / 0.8, this.dizzyT / 1.6);
    return k * k * (3 - 2 * k);
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
    this.jump.reset();
    this.snapCamera = true;
  }

  sit(view) {
    this.seated = view;
    this.jump.reset();
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
    this.time += dt;
    const dz = this.dizzyK;
    this.applyFov(camera, dz);
    if (this.emoteT > 0) { this.emoteT -= dt; this.anim = this.emote; } else if (this.anim !== 'walk') this.anim = 'idle';
    if (this.app.cinematic) {
      this.camPos.lerp(this.app.cinematic.pos, Math.min(1, dt * 3));
      this.camLook.lerp(this.app.cinematic.look, Math.min(1, dt * 3));
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
    // Maus-Look (manuelle Kamera hat immer Vorrang vor der automatischen Ausrichtung)
    if (input.enabled && (input.locked || input.dragging)) {
      if (input.mouseDX || input.mouseDY) this.lastMouse = this.time;
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
    const manual = this.time - this.lastMouse < 0.8;
    const keys = f + ',' + r;
    // Bewegungsbasis bleibt fest, solange dieselben Tasten gedrückt sind – so kann die Kamera
    // der Laufrichtung folgen, ohne dass sich die Richtung dabei mitdreht.
    if (keys !== this.lastKeys || manual) this.basisYaw = first ? this.yaw : this.camYaw;
    this.lastKeys = keys;
    if (f || r) {
      const fwd = new THREE.Vector3(Math.sin(this.basisYaw), 0, Math.cos(this.basisYaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const dir = fwd.multiplyScalar(f).addScaledVector(right, r).normalize();
      if (dz > 0) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), dz * (0.35 * Math.sin(this.time * 1.3) + 0.15 * Math.sin(this.time * 3.7)));
      const speed = (input.down('ShiftLeft') || input.down('ShiftRight') ? 5.2 : 3.2) * (1 - dz * 0.15);
      this.pos.addScaledVector(dir, speed * dt);
      this.moving = true;
      const target = Math.atan2(dir.x, dir.z);
      if (!first) {
        // Charakter dreht sich zügig in Laufrichtung, die Kamera folgt weich mit kurzer Verzögerung
        this.yaw += angleDiff(target, this.yaw) * Math.min(1, dt * 12);
        if (!manual) this.camYaw += angleDiff(this.yaw, this.camYaw) * Math.min(1, dt * 2.4 * (1 - dz * 0.5));
      } else if (!manual && r !== 0) {
        // First-Person ohne Mausbewegung: seitliches Laufen dreht die Sicht weich in die Laufrichtung
        this.yaw += angleDiff(target, this.yaw) * Math.min(1, dt * 2.6);
      }
      this.stepT -= dt * (speed / 3.2);
      if (this.stepT < 0 && !this.jump.airborne) { this.stepT = 0.36; this.app.sfx.step(0.03); }
    }
    world.collide(this.pos, 0.3);
    // Springen (Leertaste): nur am Boden, Kollision bleibt aktiv – kein Sprung durch Wände
    if (input.hit('Space') && this.jump.tryJump()) { this.app.sfx.jump(); this.emoteT = 0; }
    if (this.jump.step(dt) === 'land') this.app.sfx.land();
    this.pos.y = this.jump.y;
    if (this.moving || this.jump.airborne) this.emoteT = 0;
    if (!(this.emoteT > 0)) this.anim = this.jump.airborne ? 'jump' : this.moving ? 'walk' : 'idle';
    // Schwindel: Kamera schwankt, rollt leicht und reagiert verzögert
    const sway = dz ? { roll: dz * (0.13 * Math.sin(this.time * 0.9) + 0.04 * Math.sin(this.time * 2.3)), side: dz * 0.28 * Math.sin(this.time * 0.7), up: dz * 0.09 * Math.sin(this.time * 1.1) } : null;
    // Kamera
    if (first) {
      const bobY = this.moving && !this.jump.airborne ? Math.sin(performance.now() / 90) * 0.025 : 0;
      const target = new THREE.Vector3(this.pos.x, EYE + this.jump.y - this.jump.landDip + bobY, this.pos.z);
      camera.position.copy(target);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(this.pitch + (sway ? sway.up * 0.6 : 0), this.yaw + Math.PI + (sway ? sway.side * 0.25 : 0), sway ? sway.roll : 0);
      if (sway) camera.position.add(new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(sway.side * 0.4)).add(new THREE.Vector3(0, sway.up, 0));
      this.camPos.copy(camera.position);
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      this.camLook.copy(camera.position).add(dir);
    } else {
      const head = new THREE.Vector3(this.pos.x, 1.35 + this.jump.y * 0.6 - this.jump.landDip, this.pos.z);
      const back = new THREE.Vector3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
      const want = head.clone().addScaledVector(back, this.camDist);
      want.y = Math.max(0.4, Math.min(4.2, want.y));
      this.clampCamera(head, want, world);
      if (this.snapCamera) { this.camPos.copy(want); this.camLook.copy(head); this.snapCamera = false; }
      const lag = 1 - dz * 0.6;
      this.camPos.lerp(want, Math.min(1, dt * 8 * lag));
      this.camLook.lerp(head, Math.min(1, dt * 10 * lag));
      camera.position.copy(this.camPos);
      if (sway) {
        const side = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
        camera.position.addScaledVector(side, sway.side).add(new THREE.Vector3(0, sway.up, 0));
      }
      camera.lookAt(this.camLook);
      if (sway) camera.rotateZ(sway.roll);
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

  // Sichtfeld: Normalwert, beim Schwindel langsames Zoomen hinein und heraus
  applyFov(camera, dz) {
    const fov = BASE_FOV + dz * (5 * Math.sin(this.time * 0.8) + 2.5);
    if (Math.abs(camera.fov - fov) > 0.001) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  playEmote(a, dur = 2.6) { this.emote = a; this.emoteT = dur; }

  // Sichtbare Effekte für Mitspieler: b = Flasche in der Hand, d = trinkt, z = schwindelig
  get fx() { return (this.hasBottle ? 'b' : '') + (this.drinkT > 0 ? 'd' : '') + (this.dizzyT > 0 ? 'z' : ''); }

  pose() {
    return { p: [+this.pos.x.toFixed(3), +this.jump.y.toFixed(2), +this.pos.z.toFixed(3)], r: +this.yaw.toFixed(3), a: this.seated ? 'idle' : this.anim, pitch: +this.pitch.toFixed(2), fx: this.fx };
  }
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
