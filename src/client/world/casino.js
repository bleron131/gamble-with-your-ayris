// Casino-Stockwerk: Raum, Dekoration je nach Luxusstufe, Tische, Dealer, Mafia-Sequenz.
import * as THREE from 'three';
import { World } from './base.js';
import { addElevatorColliders } from './lobby.js';
import { M, mesh, neonSign, chandelier, pillar, plant, palm, velvetRope, skylineWindow, elevator, barCounter, painting, labelPlane, pendantLamp, sofa } from './props.js';
import { carpetTexture, marbleTexture, wallpaperTexture, tileTexture } from '../textures.js';
import { floorDef, floorTables, fmtMoney, GAME_NAMES, GAME_ICONS } from '../../shared/config.js';
import { Character, npcAppearance } from '../character.js';
import { SlotView } from '../tables/slots.js';
import { RouletteView } from '../tables/roulette.js';
import { BlackjackView } from '../tables/blackjack.js';
import { BaccaratView } from '../tables/baccarat.js';
import { CrapsView } from '../tables/craps.js';
import { PokerView } from '../tables/poker.js';
import { WheelView } from '../tables/wheel.js';

const VIEWS = { slots: SlotView, highslots: SlotView, roulette: RouletteView, blackjack: BlackjackView, baccarat: BaccaratView, craps: CrapsView, poker: PokerView, wheel: WheelView };

const THEMES = [
  { wall: '#2a1a14', accent: '#a07850', ceil: '#141010', light: '#ffe2b8', neon: '#ff3cac', lights: 0.9 },
  { wall: '#1a1430', accent: '#c9a050', ceil: '#100c1c', light: '#ffd9a0', neon: '#2bd9fe', lights: 1.0 },
  { wall: '#2a0f2f', accent: '#e2b65a', ceil: '#140814', light: '#ffd28a', neon: '#ff3cac', lights: 1.1 },
  { wall: '#0f1a30', accent: '#e8c36a', ceil: '#080c18', light: '#fff0c8', neon: '#7cf9ff', lights: 1.15 },
  { wall: '#2a0a0a', accent: '#f0cf7a', ceil: '#140505', light: '#ffe7b0', neon: '#ffd97a', lights: 1.25 },
  { wall: '#120a1f', accent: '#ffd97a', ceil: '#07040c', light: '#fff2d0', neon: '#ffd700', lights: 1.35 },
];

export class CasinoWorld extends World {
  constructor(app, n) {
    super(app);
    this.mode = 'first';
    this.kind = 'floor';
    this.n = n;
    this.def = floorDef(n);
    this.tier = this.def.tier;
    this.theme = THEMES[this.tier];
    const tables = floorTables(n);
    const centerCount = tables.filter(t => !['slots', 'highslots', 'wheel'].includes(t.type)).length;
    this.W = Math.max(16, 12 + Math.ceil(centerCount / 2) * 6) + this.tier * 2;
    this.D = 16 + this.tier * 3 + (centerCount > 4 ? 6 : 0) + (centerCount > 0 ? 2 : 0);
    this.H = 4.5 + this.tier * 0.6;
    const s = this.scene;
    s.background = new THREE.Color(this.theme.ceil);
    s.fog = new THREE.Fog(this.theme.ceil, 20, 50 + this.tier * 6);
    this.spawn = { x: 0, z: this.D / 2 - 1.1, yaw: Math.PI, inElevator: true };
    this.lightsList = [];
    this.buildRoom();
    this.buildLights();
    this.initFlash();
    this.buildDecor();
    if (this.tier >= 4) this.buildLuxury();
    this.views = {};
    this.buildTables(tables);
    this.buildElevator();
    this.buildInfoBoard();
    this.buildGuests();
    this.addRoomWalls(-this.W / 2, this.W / 2, -this.D / 2, this.D / 2);
    this.updaters.push((dt, t) => { for (const v of Object.values(this.views)) v.tick(dt, t); });
  }

  buildRoom() {
    const { W, D, H, tier, theme } = this;
    const s = this.scene;
    const carpet = carpetTexture(tier).clone();
    carpet.needsUpdate = true;
    carpet.repeat.set(W / 4, D / 4);
    const floor = mesh(new THREE.PlaneGeometry(W, D), M.std('#ffffff', 0.95, 0, { map: carpet }), 0, 0, 0, { cast: false });
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    if (tier >= 3) {
      // Marmorrahmen um den Teppich
      for (const [x, z, w, d] of [[0, D / 2 - 1, W, 2], [0, -D / 2 + 1, W, 2], [W / 2 - 1, 0, 2, D], [-W / 2 + 1, 0, 2, D]]) {
        const m = mesh(new THREE.PlaneGeometry(w, d), M.std('#ffffff', 0.15, 0.05, { map: marbleTexture(tier >= 5 ? '#1a1a1a' : '#f1ece4', tier >= 5 ? 'rgba(255,215,120,0.4)' : undefined) }), x, 0.005, z, { cast: false });
        m.rotation.x = -Math.PI / 2;
        s.add(m);
      }
    }
    const wallMat = M.std('#ffffff', 0.85, 0, { map: wallpaperTexture(theme.wall, theme.accent) });
    wallMat.map = wallMat.map.clone(); wallMat.map.needsUpdate = true; wallMat.map.repeat.set(W / 6, 1.5);
    for (const [x, z, w, ry] of [[0, -D / 2, W, 0], [0, D / 2, W, Math.PI], [-W / 2, 0, D, Math.PI / 2], [W / 2, 0, D, -Math.PI / 2]]) {
      const m = mesh(new THREE.PlaneGeometry(w, H), wallMat, x, H / 2, z, { cast: false });
      m.rotation.y = ry;
      s.add(m);
      const off = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
      const base = mesh(new THREE.BoxGeometry(w, 0.25, 0.08), tier >= 2 ? M.gold() : M.std('#1a0f08', 0.5), x, 0.125, z, { cast: false });
      base.rotation.y = ry; base.position.addScaledVector(off, 0.04); s.add(base);
      const top = mesh(new THREE.BoxGeometry(w, 0.15, 0.12), tier >= 1 ? M.gold() : M.std('#3a2a1a'), x, H - 0.1, z, { cast: false });
      top.rotation.y = ry; top.position.addScaledVector(off, 0.06); s.add(top);
    }
    const ceil = mesh(new THREE.PlaneGeometry(W, D), M.std(theme.ceil, 0.9), 0, H, 0, { cast: false });
    ceil.rotation.x = Math.PI / 2;
    s.add(ceil);
    // Deckenkassetten
    for (let x = -W / 2 + 3; x < W / 2 - 1; x += 6) {
      s.add(mesh(new THREE.BoxGeometry(0.25, 0.3, D), tier >= 2 ? M.gold() : M.std('#2a1a10'), x, H - 0.15, 0, { cast: false }));
    }
    // Neonleiste
    for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) s.add(mesh(new THREE.BoxGeometry(W, 0.04, 0.04), M.glow(theme.neon, 2), 0, H - 0.35, z, { cast: false }));
  }

  buildLights() {
    const { W, D, H, tier, theme } = this;
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(theme.light, '#20101a', 0.5 + tier * 0.05);
    s.add(this.hemi);
    s.add(new THREE.AmbientLight('#ffffff', 0.08));
    const key = new THREE.DirectionalLight(theme.light, 0.8);
    key.position.set(5, 16, 8);
    key.castShadow = true;
    const q = this.app.engine.q;
    key.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    const ext = Math.max(W, D) / 2 + 2;
    Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 40 });
    key.shadow.bias = -0.0005;
    s.add(key);
    this.keyLight = key;
    // Höchstens 3×3 Punktlichter (Performance); auf niedrigeren Stufen weniger, dafür heller
    const [nx, nz] = q.lights >= 9 ? [3, 3] : q.lights >= 6 ? [3, 2] : [2, 2];
    const boost = 9 / (nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const l = new THREE.PointLight(theme.light, 9 * theme.lights * boost, Math.max(W, D) / (nx === 3 ? 2.2 : 1.7), 1.4);
      l.position.set(-W / 2 + (i + 0.5) * W / nx, H - 0.6, -D / 2 + (j + 0.5) * D / nz);
      s.add(l);
      this.lightsList.push(l);
    }
  }

  buildDecor() {
    const { W, D, H, tier, theme } = this;
    const s = this.scene;
    // Etagenschild
    const title = neonSign(`STOCK ${this.n}`, theme.neon, 3, 0.75);
    title.position.set(0, H - 0.9, D / 2 - 0.06);
    title.rotation.y = Math.PI;
    s.add(title);
    const name = neonSign(this.def.name.toUpperCase(), '#ffd97a', Math.min(W - 4, 8), 1, { size: this.def.name.length > 16 ? 80 : 110 });
    name.position.set(0, H - 1.0, -D / 2 + 0.06);
    s.add(name);
    // Pflanzen & Säulen
    const corners = [[-W / 2 + 1, -D / 2 + 1], [W / 2 - 1, -D / 2 + 1], [-W / 2 + 1, D / 2 - 1.2], [W / 2 - 1, D / 2 - 1.2]];
    for (const [x, z] of corners) { const p = tier >= 2 ? palm(2.8) : plant(1.5); p.position.set(x, 0, z); s.add(p); this.addCircle(x, z, 0.4); }
    if (tier >= 1) {
      for (const sx of [-1, 1]) for (const z of [-D / 4, D / 4]) {
        const x = sx * (W / 2 - 3.2);
        if (Math.abs(z) < 2) continue;
        const pl = pillar(H, tier >= 3, 0.32);
        pl.position.set(x, 0, z);
        s.add(pl);
        this.addCircle(x, z, 0.45);
      }
    }
    if (tier >= 2) {
      for (let i = 0; i < Math.min(5, 1 + tier); i++) {
        const c = chandelier(0.8 + tier * 0.15);
        c.position.set((i - (Math.min(5, 1 + tier) - 1) / 2) * (W / Math.min(5, 1 + tier)), H - 1.2, 0);
        s.add(c);
      }
    } else {
      for (let x = -W / 2 + 4; x < W / 2 - 2; x += 5) { const p = pendantLamp(theme.light); p.position.set(x, H - 1.3, 0); s.add(p); }
    }
    // Panoramafenster in den Luxusetagen
    if (tier >= 3) {
      const win = skylineWindow(Math.min(D - 8, 16), H - 1.6, true);
      win.position.set(-W / 2 + 0.04, H / 2 + 0.2, 0);
      win.rotation.y = Math.PI / 2;
      s.add(win);
    } else {
      for (let i = 0; i < 2; i++) { const p = painting(1.8, 1.2, 30 + i * 140 + this.n * 20); p.position.set(-W / 2 + 0.06, 2.2, (i ? 1 : -1) * D / 5); p.rotation.y = Math.PI / 2; s.add(p); }
    }
    // Bar (ab Stufe 1), luxuriöser ab Stufe 3
    if (tier >= 1) {
      const bar = barCounter(tier >= 3 ? 6 : 4.5, tier >= 4 ? '#140808' : '#3a1f10');
      bar.position.set(W / 2 - 2.2, 0, -D / 2 + 5);
      bar.rotation.y = -Math.PI / 2;
      s.add(bar);
      this.addBox(W / 2 - 2.2, -D / 2 + 5, 0.9, tier >= 3 ? 6.3 : 4.8);
      this.addBox(W / 2 - 0.9, -D / 2 + 5, 0.6, tier >= 3 ? 6.3 : 4.8);
      const bt = new Character(npcAppearance('bartender', this.n));
      bt.root.position.set(W / 2 - 1.5, 0, -D / 2 + 5);
      bt.root.rotation.y = -Math.PI / 2;
      s.add(bt.root);
      this.updaters.push(dt => bt.update(dt));
    }
    // VIP-Lounge mit Absperrung
    if (tier >= 2) {
      const vx = W / 2 - 3, vz = D / 2 - 4.5;
      const so = sofa('#7a1230', 2.4); so.position.set(vx + 0.6, 0, vz); so.rotation.y = -Math.PI / 2; s.add(so);
      this.addBox(vx + 0.6, vz, 0.9, 2.4);
      const rope = velvetRope(2.4); rope.position.set(vx - 1.2, 0, vz); rope.rotation.y = Math.PI / 2; s.add(rope);
      this.addBox(vx - 1.2, vz, 0.2, 2.4);
      const vip = neonSign('VIP', '#ffd97a', 1.2, 0.5); vip.position.set(W / 2 - 0.06, 2.6, vz); vip.rotation.y = -Math.PI / 2; s.add(vip);
    }
    // Personaltür für die Mafia
    const door = new THREE.Group();
    door.position.set(-W / 2 + 3, 0, -D / 2 + 0.05);
    const leaf = mesh(new THREE.BoxGeometry(1.4, 2.6, 0.08), M.std('#2a1a10', 0.5), 0.7, 1.3, 0);
    const pivot = new THREE.Group();
    pivot.position.set(-0.7, 0, 0);
    pivot.add(leaf);
    door.add(pivot);
    door.add(mesh(new THREE.BoxGeometry(1.6, 0.1, 0.12), M.gold(), 0, 2.65, 0));
    const staff = labelPlane(['STAFF ONLY'], 0.9, 0.22, { size: 70, bg: '#3a0a0a', fg: '#fff', border: null });
    staff.position.set(0, 2.25, 0.06);
    door.add(staff);
    s.add(door);
    this.mafiaDoor = pivot;
    this.mafiaDoorPos = new THREE.Vector3(door.position.x, 0, door.position.z + 1);
  }

  // High-Roller-Etagen: roter Teppich, Geldbrunnen, Riesen-Chips, goldene Statuen
  buildLuxury() {
    const { W, D, tier } = this;
    const s = this.scene;
    const carpet = mesh(new THREE.PlaneGeometry(2.4, D / 2 - 2), M.std('#8a0f24', 0.9), 0, 0.01, D / 4, { cast: false });
    carpet.rotation.x = -Math.PI / 2;
    s.add(carpet);
    for (const sx of [-1.25, 1.25]) { const e = mesh(new THREE.BoxGeometry(0.06, 0.02, D / 2 - 2), M.gold(), sx, 0.012, D / 4, { cast: false }); s.add(e); }
    // Geldbrunnen in der Mitte
    const fz = -D / 16;
    const f = new THREE.Group();
    f.position.set(0, 0, fz);
    f.add(mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.5, 40), M.std('#f1ece4', 0.2, 0, { map: marbleTexture() }), 0, 0.25, 0));
    f.add(mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.05, 40), new THREE.MeshStandardMaterial({ color: '#2bd9fe', emissive: '#0a6a8a', emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.3 }), 0, 0.46, 0));
    f.add(mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.4, 20), M.gold(), 0, 1.1, 0));
    f.add(mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.15, 30), M.gold(), 0, 1.85, 0));
    // Goldene Krone oben
    const crown = new THREE.Group();
    crown.position.y = 2.1;
    crown.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 24), M.gold()));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; crown.add(mesh(new THREE.ConeGeometry(0.1, 0.35, 8), M.gold(), Math.cos(a) * 0.42, 0.3, Math.sin(a) * 0.42)); }
    crown.add(mesh(new THREE.SphereGeometry(0.12, 16, 12), M.glow('#ff2b5a', 1.5), 0, 0.05, 0.45));
    f.add(crown);
    s.add(f);
    this.addCircle(0, fz, 1.8);
    this.updaters.push((dt, t) => { crown.rotation.y += dt * 0.4; });
    let coinT = 0;
    this.updaters.push(dt => {
      coinT -= dt;
      if (coinT < 0) {
        coinT = 0.12;
        const a = Math.random() * Math.PI * 2;
        this.particles.emit({ pos: new THREE.Vector3(Math.cos(a) * 0.8, 1.9, fz + Math.sin(a) * 0.8), vel: [Math.cos(a) * 0.6, 1.2, Math.sin(a) * 0.6], life: 1.4, size: 0.12, grow: 0, opacity: 0.9, color: '#ffd23c', gravity: 3, additive: true });
      }
    });
    // Riesige Millionen-Chips
    const chipCols = ['#d8262f', '#151515', '#7b3fc4', '#f2a516'];
    for (let i = 0; i < 4; i++) {
      const x = (i < 2 ? -1 : 1) * (W / 2 - 4.6), z = (i % 2 ? 1 : -1) * (D / 2 - 9);
      const stack = new THREE.Group();
      stack.position.set(x, 0, z);
      for (let k = 0; k < 6; k++) {
        const c = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 32), M.std(chipCols[(i + k) % 4], 0.35), 0, 0.08 + k * 0.17, 0);
        c.rotation.y = k * 0.4;
        stack.add(c);
        stack.add(mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 32), M.std('#ffffff', 0.4), 0, 0.08 + k * 0.17, 0).rotateX(Math.PI / 2));
      }
      const lbl = neonSign('$1M', '#ffd97a', 1.2, 0.4);
      lbl.position.set(0, 1.4, 0);
      stack.add(lbl);
      s.add(stack);
      this.addCircle(x, z, 0.6);
    }
    if (tier >= 5) {
      const big = neonSign('THE ULTIMATE CASINO', '#ffd700', 9, 1.4);
      big.position.set(0, this.H - 2.4, -D / 2 + 0.1);
      s.add(big);
    }
  }

  buildTables(defs) {
    const { W, D } = this;
    const slots = defs.filter(d => d.type === 'slots');
    const high = defs.filter(d => d.type === 'highslots');
    const wheel = defs.filter(d => d.type === 'wheel');
    const center = defs.filter(d => !['slots', 'highslots', 'wheel'].includes(d.type));
    const add = (def, x, z, rot) => {
      const V = VIEWS[def.type];
      const v = new V(this.app, def, this.def);
      v.place(x, z, rot);
      this.scene.add(v.group);
      v.addColliders(this);
      for (const npc of [v.dealer, v.stick, v.host]) {
        if (!npc) continue;
        const wp = npc.root.getWorldPosition(new THREE.Vector3());
        this.addCircle(wp.x, wp.z, 0.35);
      }
      this.views[def.id] = v;
      const ip = v.interactPos();
      this.addInteract({
        pos: ip, radius: v.radius, table: v,
        verb: () => (v.state?.occupant && v.state.occupant !== this.app.me ? 'ZUSCHAUEN' : 'SETZEN'),
        label: () => {
          const ts = v.state;
          if (v.walkUp) {
            if (ts?.busy) return `${GAME_ICONS[def.type]} ${ts.state.spinnerName || 'Jemand'} dreht gerade…`;
            return `SPIN ${fmtMoney(ts?.state.bet || 0)} · [R] BET + · [F] BET − · oder Knöpfe am Automaten klicken`;
          }
          const occ = ts?.occupant && ts.occupant !== this.app.me ? this.app.playerName(ts.occupant) : null;
          return occ ? `${GAME_ICONS[def.type]} ${GAME_NAMES[def.type]} – ${occ} spielt (zuschauen)` : `${GAME_ICONS[def.type]} ${GAME_NAMES[def.type]} spielen (${fmtMoney(v.limits.min)} – ${fmtMoney(v.limits.max)})`;
        },
        action: () => this.app.sitAt(def.id),
      });
      // Lampe über dem Tisch
      if (!['slots', 'highslots', 'wheel'].includes(def.type)) {
        const lamp = new THREE.Group();
        lamp.position.copy(v.group.position).setY(this.H - 1.4);
        lamp.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), this.tier >= 2 ? M.gold() : M.std('#222', 0.4, 0.5), 0, 0, 0, { cast: false }));
        lamp.add(mesh(new THREE.BoxGeometry(1.5, 0.02, 0.42), M.glow(this.theme.light, 2.5), 0, -0.05, 0, { cast: false }));
        lamp.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4), M.std('#111'), 0, 0.7, 0, { cast: false }));
        lamp.rotation.y = rot;
        this.scene.add(lamp);
      }
    };
    // Slots an der Westwand (Blick nach Osten), High-Limit an der Ostwand
    slots.forEach((d, i) => add(d, -W / 2 + 0.75, -((slots.length - 1) / 2 - i) * 1.4 + 1, Math.PI / 2));
    high.forEach((d, i) => add(d, W / 2 - 0.75, ((high.length - 1) / 2 - i) * 1.4 + 2, -Math.PI / 2));
    wheel.forEach(d => add(d, (W / 4), -D / 2 + 1.1, 0));
    // Tische in zwei Reihen in der Mitte
    const rows = center.length > 3 ? 2 : 1;
    const perRow = Math.ceil(center.length / rows);
    const usable = W - 11;
    center.forEach((d, i) => {
      const row = Math.floor(i / perRow), col = i % perRow;
      const inRow = Math.min(perRow, center.length - row * perRow);
      const x = inRow === 1 ? 0 : -usable / 2 + col * usable / (inRow - 1);
      const z = rows === 1 ? -1 : (row === 0 ? -D / 4 + 0.5 : D / 8);
      add(d, x, z, 0);
    });
  }

  buildElevator() {
    const s = this.scene;
    const el = elevator({ label: 'SHISHABAR', frame: this.tier >= 2 ? '#d4af37' : '#a8a8b0' });
    el.position.set(0, 0, this.D / 2 - 2);
    el.rotation.y = Math.PI;
    s.add(el);
    el.userData.setDisplay(String(this.n));
    el.userData.snap(false);
    this.elevator = el;
    this.updaters.push(dt => el.userData.update(dt));
    addElevatorColliders(this, 0, this.D / 2 - 2, -1);
    this.addInteract({ pos: new THREE.Vector3(0, 0, this.D / 2 - 2.2), radius: 2.2, verb: 'AUFZUG', label: 'Aufzug – zurück zur Shishabar', action: () => this.app.requestReturn() });
  }

  buildInfoBoard() {
    const s = this.scene;
    const c = document.createElement('canvas'); c.width = 768; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#0d0612'; g.fillRect(0, 0, 768, 512);
    g.strokeStyle = '#ffd97a'; g.lineWidth = 6; g.strokeRect(10, 10, 748, 492);
    g.fillStyle = '#ffd97a'; g.font = '44px "Bungee", Impact'; g.textAlign = 'center';
    g.fillText(`ZIEL: ${fmtMoney(this.def.target)}`, 384, 80);
    g.font = 'bold 30px "Nunito", Arial'; g.textAlign = 'left';
    Object.entries(this.def.limits).forEach(([k, l], i) => {
      g.fillStyle = '#fff';
      g.fillText(`${GAME_NAMES[k]}`, 50, 150 + i * 44);
      g.textAlign = 'right'; g.fillStyle = '#e8d9ff';
      g.fillText(`${fmtMoney(l.min)} – ${fmtMoney(l.max)}`, 718, 150 + i * 44);
      g.textAlign = 'left';
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    board.material.color.setScalar(0.9);
    board.position.set(3.4, 2.2, this.D / 2 - 0.06);
    board.rotation.y = Math.PI;
    s.add(board);
  }

  // Gäste-NPCs nur an freien Stellen (nicht an Tischen, Sitzplätzen oder im Aufzug)
  buildGuests() {
    const { W, D, tier } = this;
    const blocked = [];
    for (const v of Object.values(this.views)) {
      blocked.push({ p: v.group.position, r: 2.4 });
      blocked.push({ p: v.seatPose().stand, r: 1.6 });
    }
    blocked.push({ p: new THREE.Vector3(0, 0, D / 2 - 2), r: 3.5 });
    blocked.push({ p: this.mafiaDoorPos, r: 1.5 });
    blocked.push({ p: new THREE.Vector3(0, 0, D / 2 - 5), r: 3.4 }); // Bühne der Mafia-Szene freihalten
    this.guests = [];
    const count = 2 + tier;
    let seed = 0;
    for (let i = 0; i < count; i++) {
      let pos = null;
      for (let k = 0; k < 40 && !pos; k++) {
        const c = new THREE.Vector3((Math.random() - 0.5) * (W - 4), 0, (Math.random() - 0.5) * (D - 4));
        if (blocked.every(b => c.distanceTo(b.p) > b.r)) pos = c;
      }
      if (!pos) continue;
      const look = npcAppearance(tier >= 3 && i % 2 ? 'vipdealer' : 'guest', i + this.n * 3 + seed++);
      if (tier >= 4) Object.assign(look, { hat: ['tophat', 'fedora', 'crown', 'none'][i % 4], jewelry: 'goldchain', jacket: i % 2 ? 'gold' : 'blazer' });
      const g = new Character(look);
      g.root.position.copy(pos);
      g.root.rotation.y = Math.random() * 6;
      g.setAnim(i % 3 === 0 ? 'dance' : 'idle');
      this.scene.add(g.root);
      this.addCircle(pos.x, pos.z, 0.35);
      blocked.push({ p: pos, r: 1.2 });
      this.guests.push(g);
      this.updaters.push(dt => g.update(dt));
    }
  }

  // Kurzer farbiger Lichtblitz an einem Automaten (BIG WIN und mehr) – ein gemeinsames Licht für alle Geräte
  flashAt(pos, level = 3) {
    this.initFlash();
    const f = this.flashLight;
    f.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
    f.userData = { t: level >= 5 ? 6 : level >= 4 ? 4 : 2.5, max: level >= 5 ? 6 : level >= 4 ? 4 : 2.5, peak: level >= 5 ? 9 : level >= 4 ? 7 : 4.5 };
  }

  // Schon beim Aufbau anlegen, damit beim ersten Gewinn keine Shader neu kompiliert werden
  initFlash() {
    if (!this.flashLight) {
      this.flashLight = new THREE.PointLight('#ffd23c', 0, 5, 2);
      this.scene.add(this.flashLight);
      this.updaters.push((dt, t) => {
        const f = this.flashLight;
        if (f.userData.t > 0) {
          f.userData.t -= dt;
          f.intensity = Math.max(0, f.userData.t) / f.userData.max * f.userData.peak * (0.6 + 0.4 * Math.abs(Math.sin(t * 18)));
          f.color.setHSL((t * 0.7) % 1, 1, 0.6);
        } else f.intensity = 0;
      });
    }
  }

  // ───────────────────────── Mafia ─────────────────────────
  // Bühne für die Mafia-Szene: freier Bereich vor dem Aufzug, unabhängig davon, wo die Spieler gerade stehen
  mafiaStage(n) {
    const z0 = this.D / 2;
    const players = Array.from({ length: n }, (_, i) => new THREE.Vector3((i - (n - 1) / 2) * 0.95, 0, z0 - 6.1));
    // Halbkreis vor dem Team, damit aus der Kameraperspektive alle vier zu sehen sind
    const mafia = [0, 1, 2, 3].map(i => new THREE.Vector3((i - 1.5) * 0.95, 0, z0 - 3.8 - (i === 0 || i === 3 ? 0.45 : 0)));
    return {
      players, mafia,
      from: new THREE.Vector3(0, 0, z0 - 1.0),
      center: new THREE.Vector3(0, 0, z0 - 5.0),
      cam: { pos: new THREE.Vector3(-1.4, 4.2, z0 - 9.9), look: new THREE.Vector3(0, 0.85, z0 - 4.8) },
      camEnd: new THREE.Vector3(-1.1, 3.8, z0 - 9.2),
      box: new THREE.Box3(new THREE.Vector3(-2.8, 0, z0 - 7.0), new THREE.Vector3(2.8, 2.4, z0 - 2.6)),
    };
  }

  // Rotes Licht: Musik ist schon aus, das Casino färbt sich bedrohlich rot
  mafiaLights() {
    for (const l of this.lightsList) { l.color.set('#ff2020'); l.intensity *= 0.5; }
    this.keyLight.color.set('#ff4040');
    this.keyLight.intensity = 0.3;
    this.hemi.color.set('#ff3030');
    this.hemi.groundColor.set('#300000');
    this.hemi.intensity = 0.45;
    this.scene.environmentIntensity = 0.08;
    this.scene.fog.color.set('#200000');
    this.scene.background = new THREE.Color('#120000');
    for (const g of this.guests) g.setAnim('sad');
    this.updaters.push((dt, t) => {
      for (const l of this.lightsList) l.intensity = (Math.sin(t * 9 + l.position.x) > -0.3 ? 4 : 1.5);
    });
  }

  // Alles ausblenden, was zwischen Kamera und Bühne steht oder in die Bühne hineinragt (Tische, Automaten, Deko, Gäste)
  clearStage(stage, keep) {
    const cam = stage.cam.pos;
    const box = new THREE.Box3();
    for (const o of this.scene.children) {
      if (keep.has(o) || o.isLight || o.isCamera || o.isSprite || !o.visible) continue;
      box.setFromObject(o);
      if (box.isEmpty()) continue;
      const size = box.getSize(new THREE.Vector3());
      if (size.x > 8 || size.z > 8) continue; // Boden, Decke, Wände
      if (box.intersectsBox(stage.box) || box.clone().expandByScalar(0.4).containsPoint(cam)) { o.visible = false; o.userData.hiddenForMafia = true; }
    }
  }

  hideOccluders(camPos, targets, keep) {
    const rc = new THREE.Raycaster();
    rc.camera = this.app.engine.camera; // für Namensschilder (Sprites) in Gruppen
    const objs = this.scene.children.filter(o => o.visible && !keep.has(o) && !o.isSprite && !o.isLight && !o.isCamera);
    for (const t of targets) {
      const dir = t.clone().sub(camPos);
      const dist = dir.length();
      rc.set(camPos, dir.normalize());
      rc.far = dist - 0.25;
      for (const hit of rc.intersectObjects(objs, true)) {
        let o = hit.object;
        if (o.isSprite) continue;
        while (o.parent && o.parent !== this.scene) o = o.parent;
        if (keep.has(o)) continue;
        const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
        if (size.x > 8 || size.z > 8) continue;
        o.visible = false;
      }
    }
  }

  // Die Mafia kommt aus dem Aufzug und baut sich vor dem Team auf
  startMafia(stage) {
    this.elevator.userData.setOpen(true);
    this.mafia = [];
    const center = stage.center;
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const m = new Character(npcAppearance('mafia', i));
        m.setName(['Don Ayrone', 'Big Tony', 'Luigi', 'Vinnie'][i], '#ff6b6b');
        m.root.position.copy(stage.from).add(new THREE.Vector3((i - 1.5) * 0.45, 0, 0));
        m.root.rotation.y = Math.PI;
        m.setAnim('walk');
        this.scene.add(m.root);
        this.mafia.push(m);
        const goal = stage.mafia[i];
        const from = m.root.position.clone();
        // Zeitbasiert (Echtzeit), damit die Mafia auch bei niedriger Bildrate pünktlich vor der Explosion ankommt
        const t0 = performance.now(), dur = 2300;
        let arrived = false;
        this.updaters.push(dt => {
          m.update(dt);
          if (arrived) return;
          const k = Math.min(1, (performance.now() - t0) / dur);
          const d = goal.clone().sub(from).setY(0);
          m.root.position.lerpVectors(from, goal, k);
          m.root.rotation.y = Math.atan2(d.x, d.z);
          if (k >= 1) {
            arrived = true;
            m.setAnim(i === 0 ? 'point' : i === 3 ? 'facepalm' : 'idle');
            m.root.rotation.y = Math.atan2(center.x - m.root.position.x, center.z - 0.85 - m.root.position.z);
          }
        });
      }, i * 380);
    }
  }

  explode(pos) {
    for (let i = 0; i < 60; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      this.particles.emit({ pos: pos.clone().add(new THREE.Vector3(0, 1, 0)), vel: dir.multiplyScalar(2 + Math.random() * 4).toArray(), life: 2.5 + Math.random(), size: 0.8, grow: 3, opacity: 0.85, color: i % 3 ? '#555' : '#ff8a2a' });
    }
    for (let i = 0; i < 20; i++) this.particles.emit({ pos: pos.clone().add(new THREE.Vector3(0, 1, 0)), vel: [(Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6], life: 0.8, size: 1.2, grow: 2, opacity: 1, color: '#ffd23c', additive: true });
    const flash = new THREE.PointLight('#ffb347', 80, 25);
    flash.position.copy(pos).setY(2);
    this.scene.add(flash);
    let t = 0;
    this.updaters.push(dt => { t += dt; flash.intensity = Math.max(0, 80 - t * 120); });
    for (const m of this.mafia || []) m.root.visible = false;
  }
}
