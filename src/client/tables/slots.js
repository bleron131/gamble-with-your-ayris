// Spielautomat mit drei echten 3D-Walzen, Hebel und Gewinnlinien.
import * as THREE from 'three';
import { TableView, stool, ease } from './common.js';
import { M, mesh, neonSign } from '../world/props.js';
import { reelTexture } from '../textures.js';
import { VARIANTS, SYMBOLS, LINES } from '../../shared/games/slots.js';
import { h } from '../ui/dom.js';
import { BetAmount, actionButton, limitLine } from '../ui/betpanel.js';
import { fmtMoney } from '../../shared/config.js';
import { sfx } from '../audio.js';

const REEL_R = 0.5;
const REEL_Z = -0.38;

export class SlotView extends TableView {
  constructor(app, def, floor) {
    super(app, def, floor);
    this.high = def.type === 'highslots';
    this.variant = VARIANTS[this.high ? 'high' : 'normal'];
    this.N = this.variant.strip.length;
    this.seatLocal.set(0, 0, 0.95);
    this.camLocal.set(0, 1.5, 1.12);
    this.lookLocal.set(0.22, 1.32, 0);
    this.footprint = { w: 1.0, d: 1.3, oz: -0.3 };
    this.radius = 1.3;
    this.lines = 5;
    this.build();
    this.reelAngles = [0, 1, 2].map(() => this.angleFor(Math.floor(Math.random() * this.N)));
    this.applyReels();
  }

  angleFor(stop) { return Math.PI * 2 * (this.N - stop - 0.5) / this.N; }

  build() {
    const g = this.group;
    const body = this.high ? M.std('#1a1208', 0.25, 0.6) : M.std(['#7a1230', '#1d3557', '#4a1a5a'][this.def.index % 3], 0.35, 0.3);
    const trim = this.high ? M.gold() : M.std('#d8d8e0', 0.2, 0.9);
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.95, 0.7), body, 0, 0.475, 0));
    // Oberes Gehäuse als Paneele mit Walzenfenster (1.05 – 1.45)
    g.add(mesh(new THREE.BoxGeometry(0.05, 1.0, 1.15), body, -0.45, 1.45, -0.375));
    g.add(mesh(new THREE.BoxGeometry(0.05, 1.0, 1.15), body, 0.45, 1.45, -0.375));
    g.add(mesh(new THREE.BoxGeometry(0.95, 0.05, 1.15), body, 0, 1.95, -0.375));
    g.add(mesh(new THREE.BoxGeometry(0.9, 1.0, 0.05), M.std('#050505', 0.8), 0, 1.45, -0.95));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.05), body, 0, 1.7, 0.2));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.1, 0.05), body, 0, 1.0, 0.2));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.05), body, sx * 0.42, 1.25, 0.2));
    for (const sx of [-1.5, -0.5, 0.5, 1.5]) g.add(mesh(new THREE.BoxGeometry(0.02, 0.4, 0.03), trim, sx * 0.23, 1.25, 0.19));
    g.add(mesh(new THREE.BoxGeometry(0.96, 0.05, 0.75), trim, 0, 0.95, 0));
    // Schräges Bedienpult
    const desk = mesh(new THREE.BoxGeometry(0.9, 0.05, 0.3), M.std('#111', 0.4), 0, 0.98, 0.22);
    desk.rotation.x = -0.25;
    g.add(desk);
    for (let i = 0; i < 3; i++) {
      const b = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M.glow(['#ff3c3c', '#ffd23c', '#3cff7a'][i], 1.5), -0.2 + i * 0.2, 1.01, 0.24);
      b.rotation.x = -0.25;
      g.add(b);
    }
    // Walzen (grosser Radius, nur die Front ist sichtbar)
    this.reels = [];
    for (let i = 0; i < 3; i++) {
      const tex = reelTexture(this.variant.strip, SYMBOLS, this.high);
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(REEL_R, REEL_R, 0.21, 72, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 }));
      reel.rotation.z = Math.PI / 2;
      const holder = new THREE.Group();
      holder.position.set(-0.23 + i * 0.23, 1.25, REEL_Z);
      holder.add(reel);
      g.add(holder);
      this.reels.push(holder);
    }
    const glass = mesh(new THREE.PlaneGeometry(0.78, 0.4), M.glass('#ffffff', 0.08), 0, 1.25, 0.2, { cast: false });
    g.add(glass);
    // Gewinnlinien-Anzeiger
    this.lineMeshes = LINES.map((rows) => {
      const pts = rows.map((r, reel) => new THREE.Vector3(-0.23 + reel * 0.23, 1.25 + (1 - r) * 0.129, 0.21));
      const curve = new THREE.CatmullRomCurve3([pts[0].clone().setX(-0.38), ...pts, pts[2].clone().setX(0.38)], false, 'catmullrom', 0);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.008, 6), M.glow('#ff2bd6', 3));
      m.visible = false;
      g.add(m);
      return m;
    });
    // Oberes Schild
    const sign = neonSign(this.high ? 'HIGH LIMIT' : ['LUCKY 7', 'AYRI SPIN', 'FRUIT RUSH'][this.def.index % 3], this.high ? '#ffd97a' : ['#ff3cac', '#2bd9fe', '#7cff6b'][this.def.index % 3], 0.95, 0.3);
    sign.position.set(0, 1.82, 0.23);
    g.add(sign);
    // Gewinnanzeige
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    this.winCanvas = c;
    this.winTex = new THREE.CanvasTexture(c);
    this.winTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), new THREE.MeshBasicMaterial({ map: this.winTex, toneMapped: false }));
    disp.position.set(0, 1.58, 0.23);
    g.add(disp);
    this.setWinDisplay('PLAY ME');
    // Hebel
    this.lever = new THREE.Group();
    this.lever.position.set(0.5, 1.15, 0.05);
    this.lever.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16), trim, 0, 0, 0)).children[0].rotation.z = Math.PI / 2;
    const arm = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), trim, 0.03, 0.2, 0);
    this.lever.add(arm);
    this.lever.add(mesh(new THREE.SphereGeometry(0.05, 16, 12), M.std('#d90429', 0.3), 0.03, 0.42, 0));
    g.add(this.lever);
    // Lichter oben
    this.bulbs = [];
    for (let i = 0; i < 8; i++) {
      const b = mesh(new THREE.SphereGeometry(0.022, 8, 6), M.glow('#ffd97a', 2), -0.42 + i * 0.12, 1.99, 0.2, { cast: false });
      g.add(b);
      this.bulbs.push(b);
    }
    const st = stool(this.tier);
    st.position.set(0, 0, 0.85);
    st.scale.setScalar(0.9);
    g.add(st);
  }

  setWinDisplay(text, color = '#ffcf40') {
    const g = this.winCanvas.getContext('2d');
    g.fillStyle = '#100505'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 10;
    g.font = '34px "Bungee", Impact'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
    this.winTex.needsUpdate = true;
  }

  applyReels() { this.reels.forEach((r, i) => { r.rotation.x = this.reelAngles[i]; }); }

  onState(ts, prev) {
    const s = ts.state;
    if (!prev || prev.state.spinId === s.spinId) {
      if (!prev && s.stops) { this.reelAngles = s.stops.map(st => this.angleFor(st)); this.applyReels(); }
      this.refreshPanel();
      return;
    }
    this.spin(s);
    this.refreshPanel();
  }

  spin(s) {
    for (const m of this.lineMeshes) m.visible = false;
    this.setWinDisplay('GOOD LUCK', '#ff3cac');
    this.spinning = true;
    sfx.lever();
    // Hebel ziehen
    this.anim.add(0.5, k => { this.lever.rotation.x = Math.sin(k * Math.PI) * 1.1; });
    const starts = this.reelAngles.slice();
    s.stops.forEach((stop, i) => {
      const dur = 1.3 + i * 0.5;
      let target = this.angleFor(stop);
      while (target < starts[i] + Math.PI * 2 * (4 + i)) target += Math.PI * 2;
      this.anim.add(dur, k => {
        // Gleichmässig schnell, dann sanft abbremsen mit kleinem Rückfedern
        const e = k < 0.7 ? k / 0.7 * 0.85 : 0.85 + ease.outBack((k - 0.7) / 0.3) * 0.15;
        this.reelAngles[i] = starts[i] + (target - starts[i]) * e;
        this.reels[i].rotation.x = this.reelAngles[i];
      }, () => { sfx.reelStop(); if (i === 2) this.afterSpin(s); }, 0.25);
    });
  }

  afterSpin(s) {
    this.spinning = false;
    let total = 0;
    for (const w of s.wins) { this.lineMeshes[w.line].visible = true; total += w.mult; }
    const lineBet = s.bet / s.lines;
    if (s.wins.length) this.setWinDisplay('WIN ' + fmtMoney(Math.floor(total * lineBet)), '#7cff6b');
    else this.setWinDisplay('NO WIN', '#888');
    this.flash = s.wins.length ? 3 : 0;
  }

  update(dt, t) {
    if (this.spinning && Math.random() < 0.5) sfx.reelTick && this.mine && sfx.reelTick();
    this.bulbs.forEach((b, i) => {
      const on = this.spinning || this.flash > 0 ? Math.sin(t * 20 + i) > 0 : Math.sin(t * 2 + i * 0.8) > 0.3;
      b.material.emissiveIntensity = on ? 3 : 0.3;
    });
    if (this.flash > 0) this.flash -= dt;
  }

  buildPanel() {
    this.bet = new BetAmount(this.limits, () => this.app.pot, this.denoms, this.limits.min);
    this.linesEl = h('div.seg');
    for (const n of [1, 3, 5]) this.linesEl.append(h('button', { 'data-n': n, onclick: () => { this.lines = n; this.renderLines(); sfx.click(); } }, `${n} ${n === 1 ? 'Linie' : 'Linien'}`));
    this.renderLines();
    this.spinBtn = actionButton('SPIN', () => this.doSpin(), 'primary big');
    const pay = this.variant.pay3;
    this.panel = h('div.tablepanel',
      h('div.ptitle', this.high ? '💎 HIGH-LIMIT SLOTS' : '🎰 SLOTS'),
      limitLine(this.limits),
      this.linesEl,
      this.bet.el,
      h('div.actions', this.spinBtn),
      h('details.paytable', h('summary', 'Gewinntabelle (× Linieneinsatz)'),
        h('div', `👑👑👑 JACKPOT ${pay[6]}× · 💎💎💎 ${pay[5]}× · 7️⃣7️⃣7️⃣ ${pay[4]}× · BAR×3 ${pay[3]}× · 🔔×3 ${pay[2]}× · 🍋×3 ${pay[1]}× · 🍒×3 ${pay[0]}× · 🍒🍒 ${this.variant.cherry2}× · 🍒 ${this.variant.cherry1}×`)),
      h('div.keys', 'LEERTASTE = Spin · ESC = Aufstehen'),
    );
    return this.panel;
  }

  renderLines() {
    for (const b of this.linesEl.children) b.classList.toggle('sel', +b.dataset.n === this.lines);
  }

  doSpin() {
    if (!this.state || this.state.busy) return;
    let bet = this.bet.value;
    bet = Math.max(this.lines, Math.floor(bet / this.lines) * this.lines);
    this.app.hands?.play('pull');
    this.app.tableStart(this.def.id, { bet, lines: this.lines });
  }

  onKey(code) { if (code === 'Space') { this.doSpin(); return true; } return false; }

  refreshPanel() {
    if (!this.panel) return;
    this.bet.refresh();
    this.spinBtn.disabled = !!this.state?.busy;
  }
}
