// Shishabar-Lobby: begehbarer Treffpunkt mit Bar, Lounge, Shop, Spiegel, Hall of Fame und Aufzug.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { World } from './base.js';
import { M, mesh, sofa, lowTable, shisha, plant, palm, neonSign, barCounter, pendantLamp, rug, elevator, speaker, painting, labelPlane } from './props.js';
import { woodTexture, wallpaperTexture, tileTexture } from '../textures.js';
import { Character, npcAppearance } from '../character.js';
import { fmtMoney, FLOORS } from '../../shared/config.js';

const W = 26, D = 20, H = 4.6;

export class LobbyWorld extends World {
  constructor(app) {
    super(app);
    this.mode = 'third';
    this.kind = 'lobby';
    const s = this.scene;
    s.background = new THREE.Color('#120814');
    s.fog = new THREE.Fog('#120814', 18, 40);
    this.spawn = { x: 0, z: -D / 2 + 1.1, yaw: 0, inElevator: true };
    this.buildRoom();
    this.buildLights();
    this.buildBar();
    this.buildLounge();
    this.buildShop();
    this.buildWardrobe();
    this.buildHall();
    this.buildElevator();
    this.addRoomWalls(-W / 2, W / 2, -D / 2, D / 2);
  }

  buildRoom() {
    const s = this.scene;
    const floor = mesh(new THREE.PlaneGeometry(W, D), M.std('#5a3a22', 0.55, 0.05, { map: woodTexture('#4a2c18') }), 0, 0, 0, { cast: false });
    floor.material.map = floor.material.map.clone(); floor.material.map.needsUpdate = true; floor.material.map.repeat.set(8, 6);
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const wallMat = M.std('#3a1a2a', 0.85, 0, { map: wallpaperTexture('#2a0f20', '#e8b65a') });
    const walls = [[0, -D / 2, W, 0], [0, D / 2, W, Math.PI], [-W / 2, 0, D, Math.PI / 2], [W / 2, 0, D, -Math.PI / 2]];
    for (const [x, z, w, ry] of walls) {
      const m = mesh(new THREE.PlaneGeometry(w, H), wallMat, x, H / 2, z, { cast: false });
      m.rotation.y = ry;
      s.add(m);
      // Holzvertäfelung unten
      const p = mesh(new THREE.PlaneGeometry(w, 1.1), M.std('#2a160c', 0.5, 0, { map: woodTexture('#2a160c') }), x, 0.55, z, { cast: false });
      p.rotation.y = ry;
      p.position.add(new THREE.Vector3(Math.sin(ry) * 0.02, 0, Math.cos(ry) * 0.02));
      s.add(p);
      const trim = mesh(new THREE.BoxGeometry(w, 0.06, 0.06), M.gold(), x, 1.12, z, { cast: false });
      trim.rotation.y = ry;
      trim.position.add(new THREE.Vector3(Math.sin(ry) * 0.04, 0, Math.cos(ry) * 0.04));
      s.add(trim);
    }
    const ceil = mesh(new THREE.PlaneGeometry(W, D), M.std('#1a0c14', 0.9), 0, H, 0, { cast: false });
    ceil.rotation.x = Math.PI / 2;
    s.add(ceil);
    // Deckenbalken mit LED
    for (let i = -2; i <= 2; i++) {
      s.add(mesh(new THREE.BoxGeometry(W, 0.2, 0.3), M.std('#2a160c', 0.6), 0, H - 0.1, i * 4, { cast: false }));
      s.add(mesh(new THREE.BoxGeometry(W, 0.03, 0.04), M.glow(i % 2 ? '#ff3cac' : '#7b5cff', 1.8), 0, H - 0.21, i * 4 + 0.16, { cast: false }));
    }
    // Neon-Schilder
    // Hauptlogo: eine zentrierte Zeile, Leinwand im Seitenverhältnis der Fläche (keine Verzerrung), Schrift passt sich an
    const n1 = neonSign('GAMBLE WITH YOUR AYRIS', '#ff3cac', 10.8, 1.25, { w: 2048, h: 237, size: 150, glow: 0.7 });
    n1.position.set(0, 3.88, D / 2 - 0.05); n1.rotation.y = Math.PI; s.add(n1);
    // Logo wird nie von den Hängelampen davor verdeckt
    n1.material.depthTest = false;
    n1.renderOrder = 5;
    const n2 = neonSign('SHISHA LOUNGE', '#2bd9fe', 4.2, 1);
    n2.position.set(-W / 2 + 0.05, 3.3, 3.5); n2.rotation.y = Math.PI / 2; s.add(n2);
    const n3 = neonSign('AYRI SHOP', '#ffd97a', 3.2, 0.8);
    n3.position.set(W / 2 - 0.05, 3.4, -2.5); n3.rotation.y = -Math.PI / 2; s.add(n3);
    // Dekoration
    for (const [x, z] of [[-11.8, -8.8], [11.8, -8.8], [11.8, 8.8], [-11.8, 8.8], [-3.3, -9.1], [3.3, -9.1]]) {
      const p = palm(2.6); p.position.set(x, 0, z); s.add(p); this.addCircle(x, z, 0.4);
    }
    for (const [x, z] of [[-7, 9.4], [7, 9.4]]) { const pt = painting(1.6, 1.1, x > 0 ? 300 : 20); pt.position.set(x, 2.3, z); pt.rotation.y = Math.PI; s.add(pt); }
    for (const x of [-5.2, 5.2]) { const sp = speaker(); sp.position.set(x, 0, -9.5); s.add(sp); this.addBox(x, -9.5, 0.6, 0.6); }
  }

  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#ffcf9a', '#3a1830', 0.9));
    s.add(new THREE.AmbientLight('#ffffff', 0.18));
    const key = new THREE.DirectionalLight('#ffd9b0', 0.9);
    key.position.set(4, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(this.app.engine.q.shadowMap, this.app.engine.q.shadowMap);
    Object.assign(key.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 1, far: 30 });
    key.shadow.bias = -0.0005;
    s.add(key);
    const warm = [[-8, 3.5, 2], [0, 3.6, 1], [7, 3.5, 4], [0, 3.5, -6], [-9, 3, -5]];
    for (const [x, y, z] of warm) { const l = new THREE.PointLight('#ffb36b', 9, 14, 1.4); l.position.set(x, y, z); s.add(l); }
    const pink = new THREE.PointLight('#ff3cac', 5, 10, 1.5); pink.position.set(0, 3, 8.5); s.add(pink);
    const cyan = new THREE.PointLight('#2bd9fe', 4, 9, 1.5); cyan.position.set(-11, 2.8, 3.5); s.add(cyan);
    // Hängelampen
    for (const [x, z] of [[-6, 1.5], [-3, 5], [3, 5], [6, 1.5], [0, 2.5]]) { const p = pendantLamp(); p.position.set(x, 3.2, z); s.add(p); }
  }

  buildBar() {
    const s = this.scene;
    const bar = barCounter(6.5);
    bar.position.set(-W / 2 + 2.6, 0, -2);
    bar.rotation.y = Math.PI / 2;
    s.add(bar);
    this.addBox(-W / 2 + 2.6, -2, 0.9, 6.8);
    this.addBox(-W / 2 + 1.2, -2, 0.6, 6.8);
    const tender = new Character(npcAppearance('bartender', 2), { npc: 'bartender' });
    tender.root.position.set(-W / 2 + 1.75, 0, -2);
    tender.root.rotation.y = Math.PI / 2;
    tender.setName('Kemal (Bar)', '#9be7ff');
    s.add(tender.root);
    this.npcs = [tender];
    this.updaters.push(dt => tender.update(dt));
    const lines = [
      'Kemal: „Ein alkoholfreier Ayris-Spritz für dich. Geht aufs Haus!“',
      'Kemal: „Ich hab mal $500 auf Rot gesetzt… es war Schwarz. Seitdem mixe ich nur noch.“',
      'Kemal: „Die Mafia im Casino versteht keinen Spass. Behaltet immer etwas im Pot!“',
      'Kemal: „Doppelt oder nichts? Mein Cousin hat das gemacht. Er wohnt jetzt bei mir.“',
      'Kemal: „Der Aufzug fährt nur dorthin, wo ihr schon wart – oder einen Stock höher.“',
      'Kemal: „Wassermelone-Minze ist heute die beste Sorte. Vertrau mir.“',
    ];
    let li = 0;
    this.addInteract({
      pos: new THREE.Vector3(-W / 2 + 3.6, 0, -2), radius: 1.8, verb: 'BAR / MAKKA', label: 'Bar: MAKKA kaufen (1 🍆) · mit Kemal reden',
      action: () => {
        tender.setAnim('point');
        setTimeout(() => tender.setAnim('idle'), 1500);
        this.app.ui.openBar(() => lines[li++ % lines.length]);
      },
    });
  }

  buildLounge() {
    const s = this.scene;
    const groups = [[-5.5, 3.5, '#7a1230', '#2a9df4'], [1, 5.5, '#1d3557', '#ff3cac'], [6.8, 6, '#4a1a5a', '#2bd9fe'], [-1.5, 0.2, '#2a5a3a', '#ffd166']];
    this.shishas = [];
    let seed = 0;
    for (const [x, z, col, shCol] of groups) {
      const r = rug(4.2, 3.4, '#5b1a2e', '#e8c36a');
      r.position.set(x, 0, z); s.add(r);
      const t = lowTable(0.55);
      t.position.set(x, 0, z); s.add(t);
      this.addCircle(x, z, 0.6);
      const sh = shisha(shCol);
      sh.position.set(x, 0.45, z); s.add(sh);
      this.shishas.push(sh);
      for (const [dx, dz, ry] of [[0, -1.35, 0], [0, 1.35, Math.PI], [-1.5, 0, Math.PI / 2]]) {
        const so = sofa(col, dx === -1.5 ? 1.6 : 2.4);
        so.position.set(x + dx, 0, z + dz); so.rotation.y = ry; s.add(so);
        if (dx === -1.5) this.addBox(x + dx, z + dz, 0.8, 1.6); else this.addBox(x + dx, z + dz, 2.4, 0.8);
      }
      // Gäste-NPCs
      if (seed < 3) {
        const g = new Character(npcAppearance('guest', seed + 3));
        g.root.position.set(x + 0.5, 0.38, z - 1.25);
        g.setAnim('sit');
        g.root.rotation.y = 0;
        s.add(g.root);
        this.updaters.push(dt => g.update(dt));
      }
      seed++;
    }
    let smokeT = 0;
    this.updaters.push((dt, t) => {
      smokeT -= dt;
      for (const sh of this.shishas) {
        const coal = sh.children.find(c => c.userData.coal);
        if (coal) coal.material.emissiveIntensity = 2.5 + Math.sin(t * 3 + sh.position.x) * 1;
      }
      if (smokeT < 0) {
        smokeT = 0.18;
        const sh = this.shishas[Math.floor(Math.random() * this.shishas.length)];
        const p = sh.position.clone().add(new THREE.Vector3(0, 0.85, 0));
        this.particles.emit({ pos: p, vel: [(Math.random() - 0.5) * 0.15, 0.35, (Math.random() - 0.5) * 0.15], life: 4, size: 0.25, grow: 1.2, opacity: 0.25, color: '#e8e0ff' });
      }
    });
  }

  buildShop() {
    const s = this.scene;
    const x = W / 2 - 2.2, z = -2.5;
    const counter = mesh(new THREE.BoxGeometry(1, 1.05, 4), M.std('#3a1050', 0.4, 0.2), x, 0.525, z);
    s.add(counter);
    s.add(mesh(new THREE.BoxGeometry(1.1, 0.06, 4.1), M.gold(), x, 1.08, z));
    s.add(mesh(new THREE.BoxGeometry(0.02, 0.04, 4), M.glow('#ffd97a', 2), x - 0.51, 0.2, z, { cast: false }));
    this.addBox(x, z, 1.1, 4.1);
    // Vitrine mit Items
    const shelf = mesh(new THREE.BoxGeometry(0.5, 2.4, 4), M.std('#1a0a24', 0.5), W / 2 - 0.4, 1.2, z);
    s.add(shelf);
    this.addBox(W / 2 - 0.4, z, 0.6, 4);
    const items = [
      () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.12, 0.05, 0.2), M.gold(), 0, 0.15, 0)); g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.05), M.gold())); return g; },
      () => mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24), M.gold()),
      () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 24), M.std('#111'))); g.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.18, 24), M.std('#111'), 0, 0.1, 0)); return g; },
      () => mesh(new THREE.BoxGeometry(0.3, 0.2, 0.08), M.std('#3a2a1a', 0.4, 0.3)),
      () => mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), M.std('#b3122e', 0.3)),
      () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), M.gold())); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 6), M.gold(), Math.cos(a) * 0.11, 0.08, Math.sin(a) * 0.11)); } return g; },
    ];
    this.shopItems = [];
    items.forEach((fn, i) => {
      const o = fn();
      o.position.set(W / 2 - 0.55, 0.9 + (i % 3) * 0.6, z - 1.2 + Math.floor(i / 3) * 2.4 * 0.5 + (i % 2) * 0.3);
      s.add(o);
      this.shopItems.push(o);
    });
    const shopLight = new THREE.PointLight('#ffd97a', 4, 5, 1.5);
    shopLight.position.set(W / 2 - 1.5, 2.6, z);
    s.add(shopLight);
    this.updaters.push(dt => { for (const o of this.shopItems) o.rotation.y += dt; });
    const keeper = new Character(npcAppearance('shopkeeper', 1), { npc: 'staff' });
    keeper.root.position.set(x + 0.8, 0, z);
    keeper.root.rotation.y = -Math.PI / 2;
    keeper.setName('Ayri (Shop)', '#ffd97a');
    s.add(keeper.root);
    this.updaters.push(dt => keeper.update(dt));
    this.addInteract({ pos: new THREE.Vector3(x - 1, 0, z), radius: 2, verb: 'KAUFEN', label: 'AYRI SHOP öffnen', action: () => this.app.ui.openShop() });
  }

  buildWardrobe() {
    const s = this.scene;
    const x = -8.5, z = D / 2 - 0.15;
    // Echter Spiegel kostet einen zweiten Render-Durchgang – auf "Niedrig" eine glänzende Spiegelfläche
    const mirror = this.app.engine.quality === 'low'
      ? new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), new THREE.MeshStandardMaterial({ color: '#9aa4b4', metalness: 1, roughness: 0.08 }))
      : new Reflector(new THREE.PlaneGeometry(2.2, 2.6), { textureWidth: this.app.engine.quality === 'medium' ? 256 : 512, textureHeight: this.app.engine.quality === 'medium' ? 320 : 640, color: '#b8c0cc' });
    mirror.position.set(x, 1.6, z);
    mirror.rotation.y = Math.PI;
    s.add(mirror);
    const frame = mesh(new THREE.BoxGeometry(2.5, 2.9, 0.08), M.gold(), x, 1.6, z + 0.06);
    s.add(frame);
    const lbl = neonSign('LOOK', '#ff3cac', 1.6, 0.45);
    lbl.position.set(x, 3.3, z - 0.05); lbl.rotation.y = Math.PI; s.add(lbl);
    // Kleiderständer
    const rack = new THREE.Group();
    rack.position.set(x + 2.3, 0, z - 0.6);
    rack.add(mesh(new THREE.BoxGeometry(1.4, 0.04, 0.04), M.gold(), 0, 1.7, 0));
    for (const sx of [-0.7, 0.7]) rack.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.7), M.gold(), sx, 0.85, 0));
    const cols = ['#e63946', '#1d3557', '#ffd60a', '#2a9d8f', '#9b5de5'];
    cols.forEach((c, i) => { const shirt = mesh(new THREE.BoxGeometry(0.05, 0.6, 0.45), M.std(c, 0.9), -0.5 + i * 0.25, 1.35, 0); rack.add(shirt); });
    s.add(rack);
    this.addBox(x + 2.3, z - 0.6, 1.5, 0.5);
    this.addInteract({ pos: new THREE.Vector3(x, 0, z - 1.4), radius: 2, verb: 'ANPASSEN', label: 'Charakter anpassen (Spiegel)', action: () => this.app.ui.openEditor() });
  }

  buildHall() {
    const s = this.scene;
    const x = 4.5, z = D / 2 - 0.1;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
    this.hallCanvas = c;
    this.hallTex = new THREE.CanvasTexture(c);
    this.hallTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), new THREE.MeshBasicMaterial({ map: this.hallTex, toneMapped: false }));
    board.material.color.setScalar(0.9);
    board.position.set(x, 2.2, z - 0.05);
    board.rotation.y = Math.PI;
    s.add(board);
    s.add(mesh(new THREE.BoxGeometry(3.4, 2.2, 0.06), M.gold(), x, 2.2, z));
    this.addInteract({ pos: new THREE.Vector3(x, 0, z - 1.4), radius: 2, verb: 'ANSEHEN', label: 'Hall of Fame & Statistiken', action: () => this.app.ui.openStats() });
    this.refreshHall();
  }

  refreshHall() {
    const st = this.app.state;
    const save = this.app.save;
    const c = this.hallCanvas, g = c.getContext('2d');
    g.fillStyle = '#0d0612'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#ffd97a'; g.lineWidth = 6; g.strokeRect(12, 12, 1000, 616);
    g.fillStyle = '#ffd97a'; g.font = '64px "Bungee", Impact'; g.textAlign = 'center';
    g.fillText('HALL OF FAME', 512, 96);
    g.font = 'bold 38px "Nunito", Arial'; g.textAlign = 'left';
    const camp = st?.campaign || save.campaign;
    const rows = [
      ['Stockwerke (aktueller Run)', `${(st ? camp.completed : save.run.completed || []).length} / ${FLOORS.length}`],
      ['Bestes Stockwerk (alle Runs)', (save.campaign.everCompleted || []).length ? `Stock ${Math.max(...save.campaign.everCompleted)}` : '—'],
      ['Höchster Team-Pot', fmtMoney(Math.max(camp.highestPot || 0, save.stats.highestPot || 0))],
      ['Bester Gewinn (Finale)', camp.bestWinnings ? fmtMoney(camp.bestWinnings) : '—'],
      ['Höchstes Double', camp.bestDouble ? fmtMoney(camp.bestDouble) : '—'],
      ['Aktueller Team-Pot', fmtMoney(st?.pot ?? save.run.pot)],
      ['Gruppen-Code', st?.code && st.code !== 'SOLO' ? st.code : 'Solo'],
    ];
    rows.forEach(([k, v], i) => {
      g.fillStyle = '#e8d9ff'; g.fillText(k, 70, 178 + i * 64);
      g.fillStyle = '#ffffff'; g.textAlign = 'right'; g.fillText(v, 954, 178 + i * 64); g.textAlign = 'left';
    });
    this.hallTex.needsUpdate = true;
  }

  buildElevator() {
    const s = this.scene;
    const el = elevator({ label: 'AUFZUG ZU DEN CASINOS' });
    el.position.set(0, 0, -D / 2 + 2);
    s.add(el);
    this.elevator = el;
    el.userData.snap(true);
    this.updaters.push(dt => el.userData.update(dt));
    addElevatorColliders(this, 0, -D / 2 + 2);
    this.addInteract({ pos: new THREE.Vector3(0, 0, -D / 2 + 2.2), radius: 2.2, verb: 'AUFZUG', label: 'Aufzug – Stockwerk wählen', action: () => this.app.ui.openElevator() });
    const floorSign = labelPlane(['STOCKWERKE', '1 – 15'], 1.1, 0.55, { size: 60 });
    floorSign.position.set(2.6, 1.9, -D / 2 + 0.06);
    s.add(floorSign);
  }

  onState() { this.refreshHall(); }
}

// Kabinenwände (Kabine 2.4 m breit, 1.8 m tief hinter der Türöffnung bei z0)
export function addElevatorColliders(world, x0, z0, dir = 1) {
  world.addBox(x0 - 1.25, z0 - dir * 0.9, 0.1, 1.9);
  world.addBox(x0 + 1.25, z0 - dir * 0.9, 0.1, 1.9);
  world.addBox(x0, z0 - dir * 1.85, 2.6, 0.1);
  world.addBox(x0 - 1.6, z0, 0.6, 0.3);
  world.addBox(x0 + 1.6, z0, 0.6, 0.3);
}
