// Finale Shishabar: Nacht, Skyline, ruhige Lounge – am Ende der Mitarbeiter mit zwei Knöpfen.
import * as THREE from 'three';
import { World } from './base.js';
import { addElevatorColliders } from './lobby.js';
import { M, mesh, sofa, lowTable, shisha, palm, neonSign, chandelier, skylineWindow, elevator, rug, labelPlane, pillar } from './props.js';
import { marbleTexture, coinFaceTexture } from '../textures.js';
import { Character, npcAppearance } from '../character.js';
import { ease } from '../tables/common.js';
import { FINAL_COUNTER_Z } from '../../shared/room.js';

const W = 14, Z0 = 8, Z1 = -36, H = 6;

export class FinalWorld extends World {
  constructor(app) {
    super(app);
    this.mode = 'third';
    this.kind = 'final';
    const s = this.scene;
    s.background = new THREE.Color('#05061a');
    s.fog = new THREE.Fog('#070818', 25, 60);
    this.spawn = { x: 0, z: Z0 - 1.1, yaw: Math.PI, inElevator: true };
    this.anim = [];
    this.build();
    this.addRoomWalls(-W / 2, W / 2, Z1, Z0);
  }

  build() {
    const s = this.scene;
    const D = Z0 - Z1, cz = (Z0 + Z1) / 2;
    const floor = mesh(new THREE.PlaneGeometry(W, D), M.std('#ffffff', 0.12, 0.05, { map: marbleTexture('#1a1418', 'rgba(255,215,140,0.35)') }), 0, 0, cz, { cast: false });
    floor.material.map = floor.material.map.clone(); floor.material.map.needsUpdate = true; floor.material.map.repeat.set(4, 12);
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const ceil = mesh(new THREE.PlaneGeometry(W, D), M.std('#0a0810', 0.9), 0, H, cz, { cast: false });
    ceil.rotation.x = Math.PI / 2;
    s.add(ceil);
    // Panoramafenster links & rechts
    for (const side of [-1, 1]) {
      const win = skylineWindow(D - 4, H - 0.6, true);
      win.position.set(side * (W / 2 - 0.02), H / 2, cz);
      win.rotation.y = -side * Math.PI / 2;
      s.add(win);
    }
    for (const [z, ry] of [[Z0, Math.PI], [Z1, 0]]) {
      const wall = mesh(new THREE.PlaneGeometry(W, H), M.std('#1a1020', 0.8), 0, H / 2, z, { cast: false });
      wall.rotation.y = ry;
      s.add(wall);
    }
    s.add(new THREE.HemisphereLight('#ffd9a8', '#1a1030', 0.35));
    const moon = new THREE.DirectionalLight('#9fb4ff', 0.5);
    moon.position.set(-10, 15, -10);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 50 });
    s.add(moon);
    for (let z = Z0 - 5; z > Z1; z -= 8) {
      const l = new THREE.PointLight('#ffb36b', 7, 12, 1.5);
      l.position.set(0, 4, z);
      s.add(l);
      const c = chandelier(1.3);
      c.position.set(0, H - 1.4, z);
      s.add(c);
    }
    // Lounge-Gruppen entlang des Weges
    let i = 0;
    for (let z = Z0 - 6; z > FINAL_COUNTER_Z + 2; z -= 7, i++) {
      for (const side of [-1, 1]) {
        const x = side * 4;
        const r = rug(3.6, 3, '#2a0a20', '#ffd97a'); r.position.set(x, 0, z); s.add(r);
        const t = lowTable(0.5, '#111'); t.position.set(x, 0, z); s.add(t);
        this.addCircle(x, z, 0.6);
        const sh = shisha(i % 2 ? '#ffd97a' : '#b388ff'); sh.position.set(x, 0.45, z); s.add(sh);
        const so = sofa('#1a1030', 2.4); so.position.set(x + side * 1.4, 0, z); so.rotation.y = -side * Math.PI / 2; s.add(so);
        this.addBox(x + side * 1.4, z, 0.9, 2.4);
      }
      const pl = pillar(H, true, 0.3);
      pl.position.set(-6.2, 0, z - 3.5); s.add(pl);
      const pr = pillar(H, true, 0.3);
      pr.position.set(6.2, 0, z - 3.5); s.add(pr);
    }
    for (const [x, z] of [[-6, Z0 - 1], [6, Z0 - 1], [-6, Z1 + 1], [6, Z1 + 1]]) { const p = palm(3); p.position.set(x, 0, z); s.add(p); this.addCircle(x, z, 0.4); }
    // Ruhige Gäste
    for (let k = 0; k < 4; k++) {
      const g = new Character(npcAppearance('guest', k + 20));
      g.root.position.set((k % 2 ? 1 : -1) * 4.6, 0.38, Z0 - 6 - Math.floor(k / 2) * 7 + 0.6);
      g.root.rotation.y = (k % 2 ? -1 : 1) * Math.PI / 2;
      g.setAnim('sit');
      s.add(g.root);
      this.updaters.push(dt => g.update(dt));
    }
    // Aufzug
    const el = elevator({ label: '???' });
    el.position.set(0, 0, Z0 - 2);
    el.rotation.y = Math.PI;
    el.userData.setDisplay('★');
    el.userData.snap(false);
    s.add(el);
    this.elevator = el;
    this.updaters.push(dt => el.userData.update(dt));
    addElevatorColliders(this, 0, Z0 - 2, -1);
    this.buildCounter();
    let smoke = 0;
    this.updaters.push(dt => {
      smoke -= dt;
      if (smoke < 0) { smoke = 0.4; this.particles.emit({ pos: new THREE.Vector3((Math.random() < 0.5 ? -4 : 4), 1.3, Z0 - 6 - Math.floor(Math.random() * 3) * 7), vel: [0, 0.3, 0], life: 4, size: 0.3, grow: 1.2, opacity: 0.2 }); }
    });
  }

  buildCounter() {
    const s = this.scene;
    const cz = Z1 + 3.2;
    // Tisch des Mitarbeiters
    s.add(mesh(new THREE.BoxGeometry(3.2, 1.0, 1.0), M.std('#140a06', 0.3, 0.2), 0, 0.5, cz));
    s.add(mesh(new THREE.BoxGeometry(3.3, 0.05, 1.1), M.std('#ffffff', 0.1, 0.1, { map: marbleTexture('#f6f0e6') }), 0, 1.025, cz));
    s.add(mesh(new THREE.BoxGeometry(3.3, 0.04, 0.02), M.glow('#ffd97a', 2), 0, 0.2, cz + 0.51, { cast: false }));
    this.addBox(0, cz, 3.3, 1.1);
    this.tableTop = new THREE.Vector3(0, 1.06, cz + 0.15);
    const staff = new Character(npcAppearance('staff', 0), { npc: 'staff' });
    staff.root.position.set(0, 0, cz - 0.9);
    staff.setName('Monsieur Ayris', '#ffd97a');
    s.add(staff.root);
    this.staff = staff;
    this.updaters.push(dt => staff.update(dt));
    const sign = neonSign('THE FINAL DECISION', '#ffd97a', 6, 1.2);
    sign.position.set(0, 4.4, Z1 + 0.06);
    s.add(sign);
    // Zwei grosse Knöpfe auf Säulen
    this.buttons = {};
    for (const [key, x, color, label] of [['take', -2.6, '#19c463', ['TAKE THE', 'WINNINGS']], ['double', 2.6, '#e0283a', ['DOUBLE', 'OR LOSS']]]) {
      const g = new THREE.Group();
      g.position.set(x, 0, cz + 1.2);
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.0, 24), M.std('#1a1a1a', 0.3, 0.6)));
      g.children[0].position.y = 0.5;
      g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 24), M.gold(), 0, 1.03, 0));
      const btn = mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glow(color, 1.2), 0, 1.06, 0);
      g.add(btn);
      const lbl = labelPlane(label, 1.6, 0.8, { bg: '#0d0612', fg: color, border: color, size: 70, glow: 0.6 });
      lbl.position.set(0, 2.0, 0);
      g.add(lbl);
      s.add(g);
      this.addCircle(x, cz + 1.2, 0.5);
      this.buttons[key] = btn;
      this.addInteract({
        pos: new THREE.Vector3(x, 0, cz + 2.0), radius: 1.5,
        label: key === 'take' ? 'TAKE THE WINNINGS drücken' : 'DOUBLE OR LOSS drücken',
        action: () => { this.pressButton(key); this.app.requestFinal(key); },
        enabled: () => !this.flipping,
      });
    }
    this.updaters.push((dt, t) => { for (const b of Object.values(this.buttons)) b.material.emissiveIntensity = 1 + Math.sin(t * 3) * 0.4; });
    // Münze
    const coinGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.018, 48);
    const side = M.gold();
    this.coin = new THREE.Mesh(coinGeo, [side, new THREE.MeshStandardMaterial({ map: coinFaceTexture(true), roughness: 0.3, metalness: 0.4 }), new THREE.MeshStandardMaterial({ map: coinFaceTexture(false), roughness: 0.3, metalness: 0.4 })]);
    this.coin.castShadow = true;
    this.coin.position.copy(this.tableTop).add(new THREE.Vector3(0.5, 0, -0.2));
    s.add(this.coin);
    this.coinRest = this.coin.position.clone();
    this.coinLight = new THREE.PointLight('#ffd97a', 0, 3);
    s.add(this.coinLight);
  }

  pressButton(key) {
    const b = this.buttons[key];
    let t = 0;
    this.updaters.push(dt => { t += dt; b.position.y = 1.06 - Math.max(0, Math.sin(Math.min(1, t / 0.3) * Math.PI)) * 0.06; });
  }

  // Physischer Münzwurf, Ergebnis vom Server
  flipCoin(result, onLanded) {
    this.flipping = true;
    const coin = this.coin;
    const staff = this.staff;
    const hand = new THREE.Vector3(0.25, 1.35, this.tableTop.z - 0.65);
    const land = this.tableTop.clone().add(new THREE.Vector3(0, 0.009, 0.05));
    const start = coin.position.clone();
    staff.setAnim('point');
    const flips = 9;
    // Grün (DOUBLE) = +y-Fläche oben → Endrotation 0 · Rot (LOSS) = π
    const finalX = result === 'green' ? Math.PI * 2 * flips : Math.PI * 2 * flips + Math.PI;
    let t = 0;
    let landedSnd = false;
    const total = 6.2;
    this.updaters.push(dt => {
      if (!this.flipping && t > total) return;
      t += dt;
      this.coinLight.position.copy(coin.position).add(new THREE.Vector3(0, 0.5, 0.3));
      this.coinLight.intensity = t < total ? 3 : 1.5;
      if (t < 1.0) {
        // Mitarbeiter nimmt die Münze
        const k = ease.inOutCubic(t / 1.0);
        coin.position.lerpVectors(start, hand, k);
        coin.rotation.x = 0;
      } else if (t < 1.5) {
        coin.position.copy(hand);
        staff.setAnim('throw');
      } else if (t < 4.3) {
        if (t - dt < 1.5) this.app.sfx.coinFlip();
        const k = (t - 1.5) / 2.8;
        coin.position.lerpVectors(hand, land, k);
        coin.position.y = THREE.MathUtils.lerp(hand.y, land.y, k) + Math.sin(k * Math.PI) * 2.6;
        coin.rotation.x = finalX * ease.outCubic(k) - 0.5 * (1 - k);
        coin.rotation.z = Math.sin(k * 7) * 0.2 * (1 - k);
        staff.setAnim('idle');
      } else if (t < 5.0) {
        if (!landedSnd) { landedSnd = true; this.app.sfx.coinLand(); }
        const k = (t - 4.3) / 0.7;
        coin.position.copy(land);
        coin.position.y += Math.abs(Math.sin(k * Math.PI * 3)) * 0.06 * (1 - k);
        coin.rotation.x = finalX + Math.sin(k * Math.PI * 4) * 0.25 * (1 - k);
        coin.rotation.z = 0;
      } else {
        coin.position.copy(land);
        coin.rotation.x = finalX;
        if (this.flipping) {
          this.flipping = false;
          onLanded?.();
        }
      }
    });
  }

  staffReact(result) {
    const st = this.staff;
    if (result === 'green') { st.setAnim('cheer'); setTimeout(() => st.setAnim('dance'), 2500); }
    else {
      // Schaut die Spieler humorvoll an
      st.setAnim('point');
      st.head.rotation.y = 0;
      setTimeout(() => { st.setAnim('facepalm'); }, 1800);
      setTimeout(() => { st.setAnim('idle'); st.head.rotation.z = 0.25; }, 4000);
    }
  }

  get cinematic() {
    return { pos: this.tableTop.clone().add(new THREE.Vector3(1.6, 1.4, 3.2)), look: this.tableTop.clone().add(new THREE.Vector3(0, 0.7, 0)) };
  }
}
