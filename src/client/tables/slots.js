// Spielautomat zum Hingehen: drei echte 3D-Walzen, BET-Anzeige, BET −/+ und ein grosser SPIN-Knopf am Gerät.
// Jeder Automat hat seinen eigenen Einsatz; mehrere Automaten können gleichzeitig drehen.
import * as THREE from 'three';
import { TableView, TextSprite, ease } from './common.js';
import { M, mesh, neonSign } from '../world/props.js';
import { reelTexture } from '../textures.js';
import { VARIANTS, SYMBOLS, LINES } from '../../shared/games/slots.js';
import { fmtMoney } from '../../shared/config.js';
import { sfx, sfxAt, playJackpotMusic } from '../audio.js';

const REEL_R = 0.5;
const REEL_Z = -0.38;
const DESK_TILT = 0.32;

const TIER_TEXT = { small: 'WIN', medium: 'NICE WIN', big: 'BIG WIN', mega: 'MEGA WIN', jackpot: 'JACKPOT' };
const TIER_COLOR = { loss: '#9a9aa8', push: '#ffffff', small: '#7cff6b', medium: '#5cf2ff', big: '#ffd23c', mega: '#ff5cf0', jackpot: '#ffffff' };

export class SlotView extends TableView {
  constructor(app, def, floor) {
    super(app, def, floor);
    this.high = def.type === 'highslots';
    this.variant = VARIANTS[this.high ? 'high' : 'normal'];
    this.N = this.variant.strip.length;
    this.walkUp = true;
    this.ownFeedback = true;
    this.seatLocal.set(0, 0, 0.95);
    this.footprint = { w: 1.0, d: 1.3, oz: -0.3 };
    this.radius = 1.35;
    this.buttons = [];
    this.flash = 0;
    this.celebrate = null;
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
    // Leuchtrahmen ums Walzenfenster (blinkt bei Gewinnen)
    this.frameMat = M.glow(this.high ? '#ffd97a' : '#ff3cac', 0.6);
    for (const [w, h2, x, y] of [[0.84, 0.025, 0, 1.465], [0.84, 0.025, 0, 1.035], [0.025, 0.43, -0.41, 1.25], [0.025, 0.43, 0.41, 1.25]]) g.add(mesh(new THREE.BoxGeometry(w, h2, 0.02), this.frameMat, x, y, 0.225, { cast: false }));
    // Schräges Bedienpult mit BET −, BET + und dem grossen SPIN-Knopf
    const desk = new THREE.Group();
    desk.position.set(0, 1.0, 0.24);
    desk.rotation.x = DESK_TILT;
    desk.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.32), M.std('#111', 0.4), 0, -0.025, 0));
    g.add(desk);
    this.desk = desk;
    this.addButton('bet-', 'BET', '−', -0.3, 0.052, '#2bd9fe', () => this.app.slotBet(this.def.id, -1));
    this.addButton('bet+', 'BET', '+', -0.12, 0.052, '#2bd9fe', () => this.app.slotBet(this.def.id, 1));
    this.addButton('spin', null, 'SPIN', 0.2, 0.085, '#3cff7a', () => this.app.slotSpin(this.def.id));
    // BET-Anzeige: gut lesbar direkt über dem Pult an der Front
    this.betCanvas = document.createElement('canvas'); this.betCanvas.width = 512; this.betCanvas.height = 144;
    this.betTex = new THREE.CanvasTexture(this.betCanvas);
    this.betTex.colorSpace = THREE.SRGBColorSpace;
    this.betTex.anisotropy = 4;
    const betDisp = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.146), new THREE.MeshBasicMaterial({ map: this.betTex, toneMapped: false }));
    betDisp.material.color.setScalar(0.92);
    betDisp.position.set(0, 0.82, 0.36);
    g.add(betDisp);
    g.add(mesh(new THREE.BoxGeometry(0.56, 0.18, 0.01), trim, 0, 0.82, 0.347, { cast: false }));
    // Münzschale
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.12), M.std('#0a0a0a', 0.3, 0.8), 0, 0.42, 0.38));
    g.add(mesh(new THREE.BoxGeometry(0.52, 0.02, 0.14), trim, 0, 0.39, 0.38));
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
    g.add(mesh(new THREE.PlaneGeometry(0.78, 0.4), M.glass('#ffffff', 0.08), 0, 1.25, 0.2, { cast: false }));
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
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    this.winCanvas = c;
    this.winTex = new THREE.CanvasTexture(c);
    this.winTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.165), new THREE.MeshBasicMaterial({ map: this.winTex, toneMapped: false }));
    disp.material.color.setScalar(0.92);
    disp.position.set(0, 1.585, 0.23);
    g.add(disp);
    this.setWinDisplay('PLAY ME');
    // Hebel (Deko, bewegt sich beim Spin mit)
    this.lever = new THREE.Group();
    this.lever.position.set(0.5, 1.15, 0.05);
    const hub = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16), trim, 0, 0, 0);
    hub.rotation.z = Math.PI / 2;
    this.lever.add(hub);
    this.lever.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), trim, 0.03, 0.2, 0));
    this.lever.add(mesh(new THREE.SphereGeometry(0.05, 16, 12), M.std('#d90429', 0.3), 0.03, 0.42, 0));
    g.add(this.lever);
    // Lichter oben
    this.bulbs = [];
    for (let i = 0; i < 8; i++) {
      const b = mesh(new THREE.SphereGeometry(0.022, 8, 6), M.glow('#ffd97a', 2), -0.42 + i * 0.12, 1.99, 0.2, { cast: false });
      g.add(b);
      this.bulbs.push(b);
    }
    // Wer gerade spielt + aufsteigende Gewinnbeträge
    this.tag = new TextSprite(0.62, 0.155);
    this.tag.sprite.position.set(0, 2.22, 0.1);
    g.add(this.tag.sprite);
    this.pops = [];
    this.drawBet(0);
  }

  // Physischer Knopf mit beschrifteter Kappe (Raycast-Ziel)
  addButton(id, small, big, x, r, color, action) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 110, 20, 128, 128, 128);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.25, color); grd.addColorStop(1, new THREE.Color(color).multiplyScalar(0.45).getStyle());
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#0b0b14'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.85)';
    if (small) {
      g.font = '62px "Bungee", Impact'; g.strokeText(small, 128, 82); g.fillText(small, 128, 82);
      g.font = 'bold 130px "Nunito", Arial'; g.strokeText(big, 128, 168); g.fillText(big, 128, 168);
    } else { g.font = '72px "Bungee", Impact'; g.strokeText(big, 128, 132); g.fillText(big, 128, 132); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const cap = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.35 });
    const side = M.std(new THREE.Color(color).multiplyScalar(0.5), 0.4);
    const grp = new THREE.Group();
    grp.position.set(x, 0, id === 'spin' ? 0.02 : 0.04);
    const ring = mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.012, 32), M.std('#c9c9d2', 0.25, 0.9), 0, 0.006, 0, { cast: false });
    const m = mesh(new THREE.CylinderGeometry(r, r, 0.03, 32), [side, cap, side], 0, 0.022, 0, { cast: false });
    m.rotation.y = Math.PI / 2; // Beschriftung zum Spieler ausrichten
    grp.add(ring, m);
    this.desk.add(grp);
    const btn = { id, mesh: m, cap, action, t: 0, label: () => this.buttonLabel(id) };
    m.userData.slotButton = btn;
    ring.userData.slotButton = btn;
    this.buttons.push(btn);
    return btn;
  }

  buttonLabel(id) {
    const bet = this.state?.state?.bet || 0;
    if (id === 'spin') return `SPIN – Einsatz ${fmtMoney(bet)}`;
    return id === 'bet+' ? 'BET + (Einsatz erhöhen)' : 'BET − (Einsatz senken)';
  }

  // Knopf drücken: Kappe fährt ein, leuchtet kurz auf
  pressButton(id) {
    const b = this.buttons.find(x => x.id === id);
    if (b) b.t = 0.28;
  }

  pickMeshes() { return this.buttons.map(b => b.mesh); }

  drawBet(bet, flash = false) {
    const g = this.betCanvas.getContext('2d');
    const W = 512, H = 144;
    g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = flash ? '#ffffff' : '#2bd9fe'; g.lineWidth = 6; g.strokeRect(5, 5, W - 10, H - 10);
    g.textBaseline = 'middle';
    g.fillStyle = '#9fefff'; g.font = '44px "Bungee", Impact'; g.textAlign = 'left';
    g.fillText('BET', 26, H / 2 + 2);
    const txt = bet ? fmtMoney(bet) : '–';
    let size = 74;
    g.font = `${size}px "Bungee", Impact`;
    while (g.measureText(txt).width > 340 && size > 30) { size -= 4; g.font = `${size}px "Bungee", Impact`; }
    g.fillStyle = flash ? '#ffffff' : '#ffe066'; g.textAlign = 'right';
    g.fillText(txt, W - 24, H / 2 + 4);
    this.betTex.needsUpdate = true;
  }

  setWinDisplay(text, color = '#ffcf40') {
    const g = this.winCanvas.getContext('2d');
    g.fillStyle = '#100505'; g.fillRect(0, 0, 512, 128);
    let size = 62;
    g.font = `${size}px "Bungee", Impact`;
    while (g.measureText(text).width > 480 && size > 24) { size -= 3; g.font = `${size}px "Bungee", Impact`; }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
    this.winTex.needsUpdate = true;
  }

  applyReels() { this.reels.forEach((r, i) => { r.rotation.x = this.reelAngles[i]; }); }

  get mine() { return this.state?.state?.spinner === this.app.me && this.state?.busy; }

  onState(ts, prev) {
    const s = ts.state;
    if (!prev || prev.state.betId !== s.betId || prev.state.bet !== s.bet) {
      this.drawBet(s.bet, !!prev);
      if (prev) { this.betFlash = 0.35; this.pressButton(s.bet > prev.state.bet ? 'bet+' : 'bet-'); }
    }
    if (!prev || prev.state.spinId === s.spinId) {
      if (!prev && s.stops) { this.reelAngles = s.stops.map(st => this.angleFor(st)); this.applyReels(); }
      this.refreshTag();
      return;
    }
    this.spin(s);
    this.refreshTag();
  }

  refreshTag() {
    const ts = this.state;
    const s = ts?.state;
    if (ts?.busy && s?.spinnerName) this.tag.set(`🎰 ${s.spinnerName}`, s.spinner === this.app.me ? '#7cff6b' : '#ffe066');
    else this.tag.set('');
  }

  spin(s) {
    for (const m of this.lineMeshes) m.visible = false;
    this.setWinDisplay('GOOD LUCK', '#ff3cac');
    this.spinning = true;
    this.celebrate = null;
    this.pending = null;
    this.pressButton('spin');
    const vol = this.volume();
    sfxAt(vol, () => sfx.button());
    sfxAt(vol, () => sfx.lever());
    this.anim.add(0.5, k => { this.lever.rotation.x = Math.sin(k * Math.PI) * 1.1; });
    const starts = this.reelAngles.slice();
    // Walzen starten nacheinander und stoppen nacheinander
    s.stops.forEach((stop, i) => {
      const dur = 1.3 + i * 0.45;
      let target = this.angleFor(stop);
      while (target < starts[i] + Math.PI * 2 * (4 + i)) target += Math.PI * 2;
      this.anim.add(dur, k => {
        const e = k < 0.7 ? k / 0.7 * 0.85 : 0.85 + ease.outBack((k - 0.7) / 0.3) * 0.15;
        this.reelAngles[i] = starts[i] + (target - starts[i]) * e;
        this.reels[i].rotation.x = this.reelAngles[i];
      }, () => { sfxAt(this.volume(), () => sfx.reelStop()); if (i === 2) this.afterSpin(s); }, 0.12 + i * 0.12);
    });
  }

  afterSpin(s) {
    this.spinning = false;
    for (const w of s.wins) this.lineMeshes[w.line].visible = true;
    if (this.pending) { this.feedback(this.pending); this.pending = null; }
    else if (s.win > 0) this.setWinDisplay(`WIN ${fmtMoney(s.win)}`, '#7cff6b');
    else this.setWinDisplay('NO WIN', '#9a9aa8');
  }

  // Ergebnis vom Server (mit Item-Effekten); läuft erst, wenn die Walzen stehen
  onEvent(ev) {
    if (ev.kind !== 'result') return;
    if (this.spinning) this.pending = ev;
    else this.feedback(ev);
  }

  volume() {
    const d = this.app.distanceTo(this.group.position);
    return Math.max(0, Math.min(1, 1.25 - d / 9));
  }

  feedback(ev) {
    const tier = ev.tier || (ev.net > 0 ? 'small' : 'loss');
    const mine = ev.pid === this.app.me;
    const vol = mine ? 1 : this.volume();
    const near = vol > 0.15;
    const world = this.app.world;
    const ui = this.app.ui;
    const amount = fmtMoney(ev.net);
    const color = TIER_COLOR[tier] || '#fff';
    this.refreshTag();
    if (tier === 'loss' || tier === 'push') {
      this.setWinDisplay(tier === 'push' ? 'PUSH' : 'NO WIN', color);
      if (mine) sfx.slotLoss();
      return;
    }
    const multi = ev.multiplier > 1 ? ` ×${ev.multiplier}` : '';
    this.setWinDisplay(`${TIER_TEXT[tier]} +${amount}`, tier === 'jackpot' ? '#ffd700' : color);
    this.popAmount(`+${amount}${multi}`, color, tier);
    const levels = { small: 1, medium: 2, big: 3, mega: 4, jackpot: 5 };
    const lv = levels[tier];
    this.celebrate = { t: [0, 1.2, 2.5, 4, 5.5, 8][lv], lv };
    const tray = this.toWorld(new THREE.Vector3(0, 0.5, 0.42));
    const top = this.toWorld(new THREE.Vector3(0, 2.0, 0.25));
    if (lv >= 2 && world?.particles) this.coinBurst(tray, lv === 2 ? 30 : lv === 3 ? 60 : 110);
    if (lv >= 3) world?.flashAt?.(top, lv);
    if (lv >= 4 && world?.particles) world.particles.confetti(top, lv === 5 ? 220 : 120, 2.5);
    sfxAt(vol, () => {
      if (lv === 1) sfx.smallWin();
      else if (lv === 2) sfx.mediumWin();
      else if (lv === 3) sfx.bigWin();
      else if (lv === 4) sfx.megaWin();
      else sfx.jackpot();
    });
    if (lv === 5 && near) playJackpotMusic(8);
    // Grosse Gewinnanzeige auf dem Bildschirm ab BIG WIN (für den Spieler selbst immer, für andere in der Nähe)
    if (lv >= 3 && (mine || near)) {
      const who = mine ? '' : `${ev.name}: `;
      ui.bigText(TIER_TEXT[tier], `${who}+${amount}${multi}`, lv === 5 ? 'jackpot' : lv === 4 ? 'mega' : 'win', lv === 5 ? 5500 : lv === 4 ? 4200 : 3200);
      if (mine) { this.app.engine.shake = lv === 5 ? 1.2 : lv === 4 ? 0.7 : 0.35; this.app.hands?.play('cheer'); }
    } else if (lv === 2 && mine) ui.bigText(TIER_TEXT[tier], `+${amount}${multi}`, 'nice', 1800);
  }

  coinBurst(pos, n) {
    const ps = this.app.world.particles;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    for (let i = 0; i < n; i++) {
      const v = fwd.clone().multiplyScalar(0.8 + Math.random() * 1.6).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.5 + Math.random() * 2.2, (Math.random() - 0.5) * 1.6));
      setTimeout(() => ps.emit({ pos: pos.clone(), vel: v.toArray(), life: 1.6 + Math.random() * 0.6, size: 0.07, grow: 0, opacity: 1, color: i % 4 ? '#ffd23c' : '#7cff6b', gravity: 6, additive: true }), i * 18);
    }
  }

  popAmount(text, color, tier) {
    const sp = new TextSprite(tier === 'small' ? 0.5 : tier === 'medium' ? 0.62 : 0.8, tier === 'small' ? 0.125 : tier === 'medium' ? 0.155 : 0.2);
    sp.set(text, color, 'rgba(10,6,20,0.82)');
    sp.sprite.position.set(0, 1.75, 0.45);
    this.group.add(sp.sprite);
    this.pops.push({ sp, t: 0, life: tier === 'small' ? 2 : 3 });
  }

  update(dt, t) {
    if (this.spinning && Math.random() < 0.5 && this.volume() > 0.5) sfx.reelTick();
    const c = this.celebrate;
    if (c) { c.t -= dt; if (c.t <= 0) this.celebrate = null; }
    const party = !!this.celebrate;
    this.bulbs.forEach((b, i) => {
      const on = party ? Math.sin(t * (10 + c.lv * 4) + i * 1.3) > 0 : this.spinning ? Math.sin(t * 20 + i) > 0 : Math.sin(t * 2 + i * 0.8) > 0.3;
      b.material.emissiveIntensity = on ? (party ? 4 : 3) : 0.3;
      if (party && c.lv >= 3) b.material.emissive.setHSL((t * 0.8 + i / 8) % 1, 1, 0.55);
      else b.material.emissive.set('#ffd97a');
    });
    this.frameMat.emissiveIntensity = party ? 1.2 + Math.max(0, Math.sin(t * 16)) * (0.6 + c.lv * 0.5) : this.spinning ? 0.9 : 0.6;
    // Knopfanimation
    for (const b of this.buttons) {
      const hover = this.app.hoverButton === b;
      if (b.t > 0) b.t -= dt;
      const k = b.t > 0 ? Math.sin((b.t / 0.28) * Math.PI) : 0;
      b.mesh.position.y = 0.022 - k * 0.016;
      const idle = b.id === 'spin' && !this.state?.busy ? 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 4)) : 0.35;
      b.cap.emissiveIntensity = idle + k * 1.4 + (hover ? 0.35 : 0);
    }
    if (this.betFlash > 0) { this.betFlash -= dt; if (this.betFlash <= 0) this.drawBet(this.state?.state?.bet || 0); }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = p.t / p.life;
      p.sp.sprite.position.y = 1.75 + k * 0.7;
      p.sp.sprite.material.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      if (k >= 1) { this.group.remove(p.sp.sprite); p.sp.tex.dispose(); p.sp.sprite.material.dispose(); this.pops.splice(i, 1); }
    }
  }
}
