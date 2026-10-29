// Roulette: 3D-Kessel mit drehendem Rad, rollender Kugel und klickbarem Tableau.
// Wetten werden am Tisch vorbereitet und bleiben nach jedem Spin liegen (Rebet mit einem Klick auf SPIN).
import * as THREE from 'three';
import { TableView, chipStack, makeDealer, ease, stool, capButton } from './common.js';
import { M, mesh } from '../world/props.js';
import { rouletteLayout, rouletteRotorTexture, woodTexture } from '../textures.js';
import { WHEEL_ORDER, RED, spotLabel, insideNumbers, insideSpot } from '../../shared/games/roulette.js';
import { h, clear } from '../ui/dom.js';
import { ChipPicker, actionButton, limitLine } from '../ui/betpanel.js';
import { fmtMoney } from '../../shared/config.js';
import { sfx, sfxAt, say, setDuck } from '../audio.js';

const LAYOUT_W = 1.6, LAYOUT_D = 0.64, LAYOUT_X = 0.42;
const WHEEL_X = -0.95;
const N = WHEEL_ORDER.length;
const POCKET_R = 0.255, TRACK_R = 0.37;
const TIER_TEXT = { small: 'WIN', medium: 'NICE WIN', big: 'BIG WIN', mega: 'MEGA WIN', jackpot: 'JACKPOT' };

export class RouletteView extends TableView {
  constructor(app, def, floor) {
    super(app, def, floor);
    this.seatLocal.set(0.35, 0, 0.95);
    // Etwas höher und nach links versetzt, damit Rad und Tableau neben dem Wett-Panel gut sichtbar sind
    this.camLocal.set(0.15, 2.3, 1.45);
    this.lookLocal.set(0.62, 0.78, -0.05);
    this.footprint = { w: 2.9, d: 1.3 };
    this.ownFeedback = true;
    this.layout = rouletteLayout();
    this.build();
  }

  build() {
    const g = this.group;
    const wood = M.std('#3a1a0a', 0.35, 0.1, { map: woodTexture('#4a2410') });
    // Tischkörper
    g.add(mesh(new THREE.BoxGeometry(2.8, 0.1, 1.2), wood, 0, 0.77, 0));
    for (const [x, z] of [[-1.25, -0.45], [1.25, -0.45], [-1.25, 0.45], [1.25, 0.45]]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.72), wood, x, 0.36, z));
    g.add(mesh(new THREE.BoxGeometry(2.9, 0.06, 1.3), this.tier >= 2 ? M.gold() : wood, 0, 0.84, 0)).children.at(-1).scale.set(1, 1, 1);
    const felt = mesh(new THREE.PlaneGeometry(2.78, 1.18), M.std('#0c6a39', 0.95), 0, 0.875, 0, { cast: false });
    felt.rotation.x = -Math.PI / 2;
    g.add(felt);
    // Tableau
    this.layoutMesh = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT_W, LAYOUT_D), new THREE.MeshStandardMaterial({ map: this.layout.texture, roughness: 0.9 }));
    this.layoutMesh.rotation.x = -Math.PI / 2;
    this.layoutMesh.position.set(LAYOUT_X, 0.878, 0.02);
    this.layoutMesh.receiveShadow = true;
    g.add(this.layoutMesh);
    this.hoverMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false }));
    this.hoverMesh.rotation.x = -Math.PI / 2;
    this.hoverMesh.visible = false;
    g.add(this.hoverMesh);
    this.chipGroup = new THREE.Group();
    g.add(this.chipGroup);
    // Kessel
    const wheel = new THREE.Group();
    wheel.position.set(WHEEL_X, 0.88, 0);
    g.add(wheel);
    this.wheel = wheel;
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(0.3 + t * 0.17, 0.02 + Math.pow(t, 2) * 0.09)); }
    pts.push(new THREE.Vector2(0.49, 0.11), new THREE.Vector2(0.5, 0.0));
    const bowl = mesh(new THREE.LatheGeometry(pts, 64), M.std('#5a2a10', 0.3, 0.1, { map: woodTexture('#6a3416'), side: THREE.DoubleSide }));
    wheel.add(bowl);
    wheel.add(mesh(new THREE.TorusGeometry(0.495, 0.015, 8, 64), M.gold(), 0, 0.11, 0)).children.at(-1).rotation.x = Math.PI / 2;
    // Diamanten (Ablenker) auf der Bahn
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; wheel.add(mesh(new THREE.OctahedronGeometry(0.012), M.gold(), Math.cos(a) * 0.36, 0.055, Math.sin(a) * 0.36)); }
    // Rotor
    const rotor = new THREE.Group();
    wheel.add(rotor);
    this.rotor = rotor;
    const disc = mesh(new THREE.CircleGeometry(0.31, 74), new THREE.MeshStandardMaterial({ map: rouletteRotorTexture(), roughness: 0.35, metalness: 0.1 }), 0, 0.025, 0, { cast: false });
    disc.rotation.x = -Math.PI / 2;
    rotor.add(disc);
    // Fachstege
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2;
      const fret = mesh(new THREE.BoxGeometry(0.075, 0.012, 0.003), M.gold(), Math.cos(a) * 0.27, 0.032, Math.sin(a) * 0.27, { cast: false });
      fret.rotation.y = -a;
      rotor.add(fret);
    }
    // Drehkreuz
    rotor.add(mesh(new THREE.ConeGeometry(0.05, 0.12, 16), M.gold(), 0, 0.09, 0));
    for (let i = 0; i < 4; i++) {
      const arm = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18), M.gold(), 0, 0.12, 0);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = i * Math.PI / 4;
      rotor.add(arm);
    }
    this.ball = mesh(new THREE.SphereGeometry(0.014, 16, 12), M.std('#ffffff', 0.15), TRACK_R, 0.07, 0);
    wheel.add(this.ball);
    this.ballAngle = 0;
    this.ballR = POCKET_R;
    this.placeBallInPocket(0);
    // Ergebnis-Anzeige
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    this.histCanvas = c;
    this.histTex = new THREE.CanvasTexture(c); this.histTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: this.histTex, toneMapped: false }));
    const post = new THREE.Group();
    post.position.set(-1.5, 0, -0.45);
    post.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6), M.gold(), 0, 0.8, 0));
    board.material.color.setScalar(0.9);
    board.position.set(0, 1.7, 0);
    board.rotation.y = 0.6;
    post.add(board);
    g.add(post);
    this.drawHistory([]);
    // Dealer
    this.dealer = makeDealer(this.tier, this.def.index + 1);
    this.dealer.root.position.set(WHEEL_X - 1.0, 0, -0.1);
    this.dealer.root.rotation.y = Math.PI / 2;
    g.add(this.dealer.root);
    for (const x of [-0.2, 0.35, 0.9]) { const s = stool(this.tier); s.position.set(x, 0, 0.95); s.scale.setScalar(0.85); g.add(s); }
    // Gewinnzahl-Markierung (Dolly) auf dem Tableau
    this.dolly = new THREE.Group();
    this.dolly.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.05, 20), M.gold(), 0, 0.025, 0, { cast: false }));
    this.dolly.add(mesh(new THREE.SphereGeometry(0.018, 14, 10), M.glow('#ffffff', 1.2), 0, 0.06, 0, { cast: false }));
    this.dolly.visible = false;
    g.add(this.dolly);
    // TOTAL BET-Anzeige hinter dem Tableau (für alle sichtbar)
    this.totalCanvas = document.createElement('canvas'); this.totalCanvas.width = 768; this.totalCanvas.height = 160;
    this.totalTex = new THREE.CanvasTexture(this.totalCanvas); this.totalTex.colorSpace = THREE.SRGBColorSpace; this.totalTex.anisotropy = 4;
    const tb = new THREE.Group();
    tb.position.set(LAYOUT_X, 0.88, -0.52);
    tb.add(mesh(new THREE.BoxGeometry(0.74, 0.17, 0.03), M.std('#111', 0.4), 0, 0.17, -0.02));
    const tPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.146), new THREE.MeshBasicMaterial({ map: this.totalTex, toneMapped: false }));
    tPlane.material.color.setScalar(0.92);
    tPlane.position.set(0, 0.17, 0);
    tb.add(tPlane);
    tb.add(mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), this.tier >= 2 ? M.gold() : M.std('#222', 0.3, 0.6), 0, 0.05, -0.02));
    tb.rotation.x = -0.2;
    g.add(tb);
    this.drawTotal(0);
    // Grosser physischer SPIN-Knopf vorne rechts am Tisch
    const sb = capButton(null, 'SPIN', 0.075, '#3cff7a');
    sb.group.position.set(1.18, 0.875, 0.42);
    g.add(sb.group);
    this.spinButton = { id: 'spin', mesh: sb.mesh, ring: sb.ring, cap: sb.cap, t: 0 };
  }

  drawHistory(hist) {
    const g = this.histCanvas.getContext('2d');
    g.fillStyle = '#0a0505'; g.fillRect(0, 0, 512, 128);
    g.font = 'bold 54px "Nunito", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    hist.slice(0, 8).forEach((n, i) => {
      g.fillStyle = n === 0 ? '#19c463' : RED.has(n) ? '#ff3b4e' : '#e8e8e8';
      g.fillText(String(n), 40 + i * 62, 66);
    });
    if (!hist.length) { g.fillStyle = '#ffd97a'; g.fillText('ROULETTE', 256, 66); }
    this.histTex.needsUpdate = true;
  }

  drawTotal(total, locked = false) {
    const g = this.totalCanvas.getContext('2d');
    const W = 768, H = 160;
    g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = locked ? '#ff3cac' : '#ffd97a'; g.lineWidth = 6; g.strokeRect(5, 5, W - 10, H - 10);
    g.textBaseline = 'middle';
    g.fillStyle = locked ? '#ff9ad8' : '#ffe9a8'; g.font = '46px "Bungee", Impact'; g.textAlign = 'left';
    g.fillText(locked ? 'IM SPIEL' : 'TOTAL BET', 28, H / 2 + 2);
    const txt = fmtMoney(total);
    let size = 78;
    g.font = `${size}px "Bungee", Impact`;
    while (g.measureText(txt).width > 380 && size > 30) { size -= 4; g.font = `${size}px "Bungee", Impact`; }
    g.fillStyle = total ? '#ffd23c' : '#777'; g.textAlign = 'right';
    g.fillText(txt, W - 28, H / 2 + 4);
    this.totalTex.needsUpdate = true;
  }

  pocketLocalAngle(n) { return WHEEL_ORDER.indexOf(n) / N * Math.PI * 2; }

  placeBallInPocket(n) {
    this.ballPocket = n;
    this.ballR = POCKET_R;
  }

  // Raycast → Wettfeld (inkl. Split, Street, Corner und Six Line an den Kanten der Zahlenfelder)
  spotAt(raycaster) {
    const hit = raycaster.intersectObject(this.layoutMesh)[0];
    if (!hit?.uv) return null;
    const L = this.layout;
    const x = hit.uv.x * L.W, y = (1 - hit.uv.y) * L.H;
    const gx = (x - L.x0) / L.cw, gy = (y - L.y0) / L.ch;
    if (gx >= 0 && gx < 12 && gy >= 0 && gy < 3.12) {
      const E = 0.2;
      const col = Math.floor(gx), fx = gx - col;
      const num = (c, r) => c * 3 + (3 - r);
      const sideV = fx > 1 - E && col < 11 ? 1 : fx < E && col > 0 ? -1 : 0;
      if (gy > 2.88) {
        // Unterkante der Zahlenreihe: Street (3 Zahlen) bzw. an der Spaltengrenze Six Line (6 Zahlen)
        if (sideV) { const c = Math.min(col, col + sideV); return this.spot(insideSpot([1, 2, 3, 4, 5, 6].map(i => c * 3 + i))); }
        return this.spot(insideSpot([1, 2, 3].map(i => col * 3 + i)));
      }
      const row = Math.floor(gy), fy = gy - row;
      const sideH = fy > 1 - E && row < 2 ? 1 : fy < E && row > 0 ? -1 : 0;
      if (sideV && sideH) return this.spot(insideSpot([num(col, row), num(col + sideV, row), num(col, row + sideH), num(col + sideV, row + sideH)]));
      if (sideV) return this.spot(insideSpot([num(col, row), num(col + sideV, row)]));
      if (sideH) return this.spot(insideSpot([num(col, row), num(col, row + sideH)]));
    }
    return L.regions.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
  }

  // Feld → Pixelbereich auf dem Tableau (Innenwetten liegen auf Kanten/Ecken der Zahlenfelder)
  spot(spot) {
    const L = this.layout;
    const r = L.regions.find(x => x.spot === spot);
    if (r) return r;
    const nums = insideNumbers(spot);
    if (!nums) return null;
    const centers = nums.map(n => ({ x: L.x0 + Math.floor((n - 1) / 3) * L.cw + L.cw / 2, y: L.y0 + (2 - ((n - 1) % 3)) * L.ch + L.ch / 2 }));
    let cx = centers.reduce((a, c) => a + c.x, 0) / centers.length;
    let cy = centers.reduce((a, c) => a + c.y, 0) / centers.length;
    if (nums.length === 3 || nums.length === 6) cy = L.y0 + L.ch * 3;
    const sz = 34;
    return { spot, cx, cy, x: cx - sz / 2, y: cy - sz / 2, w: sz, h: sz, inside: true };
  }

  regionToLocal(r, cx = r.cx, cy = r.cy) {
    return new THREE.Vector3(LAYOUT_X - LAYOUT_W / 2 + cx / this.layout.W * LAYOUT_W, 0.88, 0.02 - LAYOUT_D / 2 + cy / this.layout.H * LAYOUT_D);
  }

  hitSpin(raycaster) { return raycaster.intersectObjects([this.spinButton.mesh, this.spinButton.ring], false).length > 0; }

  hover(raycaster) {
    this.hoverSpin = false;
    if (!this.mine) { this.hoverMesh.visible = false; return null; }
    if (this.hitSpin(raycaster)) { this.hoverSpin = true; this.hoverMesh.visible = false; return `SPIN (${fmtMoney(this.preparedTotal)})`; }
    if (this.state?.busy) { this.hoverMesh.visible = false; return null; }
    const r = this.spotAt(raycaster);
    if (!r) { this.hoverMesh.visible = false; return null; }
    const p = this.regionToLocal(r);
    this.hoverMesh.position.set(p.x, 0.881, p.z);
    this.hoverMesh.scale.set(r.w / this.layout.W * LAYOUT_W, r.h / this.layout.H * LAYOUT_D, 1);
    this.hoverMesh.visible = true;
    return `${spotLabel(r.spot)} (+${fmtMoney(this.picker?.value || 0)} · Rechtsklick −)`;
  }

  hoverLabel(lbl) { return this.hoverSpin ? `Klick: ${lbl}` : `Klick: Chip auf ${lbl}`; }

  pick(raycaster, button) {
    if (!this.mine) return false;
    if (this.hitSpin(raycaster)) { this.doSpin(); return true; }
    if (this.state?.busy) { sfx.denied(); return false; }
    const r = this.spotAt(raycaster);
    if (!r) return false;
    if (button === 2) this.edit('remove', r.spot, this.picker.value);
    else { this.edit('add', r.spot, this.picker.value); this.app.hands?.play('toss'); }
    sfx.chip();
    return true;
  }

  edit(op, spot, amount) {
    if (this.state?.busy) { sfx.denied(); return; }
    this.app.send({ t: 'table.edit', id: this.def.id, edit: { op, spot, amount } });
  }

  // Chips stammen aus dem Server-Zustand und sind damit für alle Spieler synchron
  renderChips(bets) {
    clear(this.chipGroup);
    for (const [spot, amount] of Object.entries(bets)) {
      const r = this.spot(spot);
      if (!r) continue;
      const st = chipStack(amount, this.limits.min);
      st.position.copy(this.regionToLocal(r));
      if (r.inside) st.scale.setScalar(0.85);
      this.chipGroup.add(st);
    }
  }

  get prepared() { return this.state?.state?.prepared || {}; }
  get preparedTotal() { return Object.values(this.prepared).reduce((a, b) => a + b, 0); }

  syncChips() {
    const ts = this.state;
    if (!ts) return;
    const s = ts.state;
    const locked = ts.busy && s.bets?.length;
    const bets = locked ? Object.fromEntries(s.bets.map(b => [b.spot, b.amount])) : this.prepared;
    this.renderChips(bets);
    this.drawTotal(Object.values(bets).reduce((a, b) => a + b, 0), !!locked);
  }

  onState(ts, prev) {
    const s = ts.state;
    if (!prev) {
      this.drawHistory(s.history);
      if (s.result !== null) this.placeBallInPocket(s.result);
    }
    if (prev && prev.state.spinId !== s.spinId) this.startSpin(s);
    if (prev && prev.state.history[0] !== s.history[0] && s.phase === 'idle') this.drawHistory(s.history);
    if (!prev || prev.state.editId !== s.editId || prev.busy !== ts.busy || prev.state.spinId !== s.spinId) this.syncChips();
    this.refreshPanel();
  }

  startSpin(s) {
    this.dolly.visible = false;
    this.spinButton.t = 0.3;
    const T = 7.6, Tb = 6.4;
    const R0 = this.rotor.rotation.y, dR = Math.PI * 2 * 2.2;
    const B0 = this.currentBallAngle();
    const target = this.pocketLocalAngle(s.result);
    const Rend = R0 + dR * ease.outCubic(Tb / T);
    let finalB = target - Rend;
    // Kugel läuft gegen den Rotor (abnehmender Winkel)
    let dB = B0 - finalB;
    dB = ((dB % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) + Math.PI * 2 * 7;
    this.ballPocket = null;
    this.spinning = true;
    this.landed = false;
    this.landedAt = 0;
    this.pendingResult = null;
    this.spinResult = s.result;
    const audible = () => this.app.distanceTo?.(this.group.position) < 7 || this.app.ballCam?.view === this;
    if (audible()) { sfx.button(); sfx.rouletteSpin(Tb); setTimeout(() => audible() && say('Rien ne va plus!', 'fr-FR'), 2500); }
    this.dealer.setAnim('deal');
    setTimeout(() => this.dealer.setAnim('idle'), 1200);
    let lastPocket = -1, lastTick = 0, ducked = false;
    // Echtzeit statt Bildzeit: die Kugel landet auch bei niedriger Bildrate pünktlich vor dem Ergebnis
    this.spinT0 = performance.now();
    this.spinDur = T;
    this.spinStep = k => {
      const t = k * T;
      this.rotor.rotation.y = R0 + dR * ease.outCubic(k);
      if (t < Tb) {
        const kb = t / Tb;
        this.ballAngle = B0 - dB * (1 - Math.pow(1 - kb, 2.2));
        const drop = kb < 0.62 ? 0 : (kb - 0.62) / 0.38;
        const bounce = drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * Math.PI * 4)) * (1 - drop) * 0.03 : 0;
        this.ballR = TRACK_R - (TRACK_R - POCKET_R) * ease.inOutCubic(drop) + bounce;
        this.ballY = 0.07 - 0.03 * ease.inOutCubic(drop) + bounce * 0.8;
        // Spannung: Musik leiser, einzelne Klack-Geräusche über den Fachstegen, je langsamer desto deutlicher
        if (kb > 0.55 && !ducked && audible()) { ducked = true; this.ducked = true; setDuck(true); }
        if (drop > 0) {
          const rel = this.ballAngle + this.rotor.rotation.y;
          const pocket = Math.floor(((rel / (Math.PI * 2)) * N + 0.5 + N * 100)) % N;
          const now = performance.now();
          if (pocket !== lastPocket && now - lastTick > 35 && audible()) { lastTick = now; sfx.ballTick(0.05 + drop * 0.08); }
          lastPocket = pocket;
        }
      } else if (!this.landed) {
        this.landed = true;
        this.landedAt = performance.now();
        this.ballPocket = s.result;
        if (audible()) sfx.ballClack();
        // Ergebnis erst nach dem KLACK und einer kurzen Pause zeigen
        if (this.pendingResult) { const ev = this.pendingResult; this.pendingResult = null; setTimeout(() => this.showResult(ev), 700); }
      }
    };
    this.spinDone = () => {
      this.spinning = false;
      this.ballPocket = s.result;
      this.showDolly(s.result);
    };
  }

  showDolly(n) {
    const r = this.spot('n' + n);
    if (!r) return;
    const p = this.regionToLocal(r);
    this.dolly.position.set(p.x, 0.88, p.z);
    this.dolly.visible = true;
  }

  // Ergebnis kommt nach einer kurzen Pause nach dem KLACK: Gewinnzahl + Gewinn/Verlust
  onEvent(ev) {
    if (ev.kind !== 'result' || typeof ev.roulette !== 'number') return;
    if (this.spinStep && !this.landed) { this.pendingResult = ev; return; }
    const wait = this.landedAt ? Math.max(0, 700 - (performance.now() - this.landedAt)) : 0;
    if (wait) setTimeout(() => this.showResult(ev), wait); else this.showResult(ev);
  }

  showResult(ev) {
    const n = ev.roulette;
    const mine = ev.pid === this.app.me;
    const watching = this.app.ballCam?.view === this;
    const near = this.app.distanceTo(this.group.position) < 8;
    this.showDolly(n);
    if (this.ducked) { this.ducked = false; if (!this.app.highRiskTables.size) setDuck(false); }
    if (near || watching) say(`${n}, ${n === 0 ? 'Zero' : RED.has(n) ? 'Rot' : 'Schwarz'}`);
    if (mine || near || watching) {
      const color = n === 0 ? 'GREEN' : RED.has(n) ? 'RED' : 'BLACK';
      const who = mine ? '' : `${ev.name}: `;
      const tier = ev.tier;
      let sub, cls = n === 0 ? 'rgreen' : RED.has(n) ? 'rred' : 'rblack';
      if (ev.net > 0) sub = `${who}${TIER_TEXT[tier] || 'WIN'} +${fmtMoney(ev.net)}`;
      else if (ev.net < 0) sub = `${who}KEIN GEWINN −${fmtMoney(-ev.net)}`;
      else sub = `${who}PUSH`;
      this.app.ui.bigText(`${n} ${color}`, sub, cls, 2600);
      const vol = mine || watching ? 1 : 0.6;
      sfxAt(vol, () => {
        if (ev.net <= 0) { if (mine) sfx.lose(); }
        else if (tier === 'mega') sfx.megaWin();
        else if (tier === 'big') sfx.bigWin();
        else if (tier === 'medium') sfx.mediumWin();
        else sfx.smallWin();
      });
      if (ev.net > 0 && (tier === 'big' || tier === 'mega') && this.app.world?.particles) this.app.world.particles.confetti(this.toWorld(new THREE.Vector3(LAYOUT_X, 1.6, 0)), tier === 'mega' ? 160 : 90, 2);
    }
    // Kugelkamera hält kurz auf dem Ergebnis und kehrt dann automatisch zurück
    if (watching) this.app.ballCam.until = performance.now() + 1700;
  }

  currentBallAngle() {
    if (this.ballPocket !== null && this.ballPocket !== undefined) return this.pocketLocalAngle(this.ballPocket) - this.rotor.rotation.y;
    return this.ballAngle;
  }

  // Kugelkamera: filmische Nahaufnahme, die der Kugel folgt (mit begrenzter Drehgeschwindigkeit, damit es nicht ruckelt)
  ballCamPose(dt, bc) {
    const lp = this.ball.position;
    const a = Math.atan2(lp.z, lp.x);
    const settled = this.ballPocket !== null && this.ballPocket !== undefined;
    const close = settled ? 1 : THREE.MathUtils.clamp((TRACK_R - this.ballR) / (TRACK_R - POCKET_R), 0, 1);
    // Kamera schaut der Kugel leicht hinterher (die Kugel läuft mit abnehmendem Winkel)
    const want = a + 0.55 - close * 0.15;
    if (bc.orbit === undefined) bc.orbit = want;
    let d = want - bc.orbit;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const maxV = settled ? 3 : 1.6 + close * 3;
    bc.orbit += THREE.MathUtils.clamp(d, -maxV * dt, maxV * dt);
    const R = THREE.MathUtils.lerp(0.66, 0.5, close), Y = THREE.MathUtils.lerp(0.42, 0.24, close);
    const camLocal = new THREE.Vector3(Math.cos(bc.orbit) * R, Y, Math.sin(bc.orbit) * R);
    const lookLocal = lp.clone().multiplyScalar(0.85 - close * 0.1).setY(0.03);
    const camW = this.wheel.localToWorld(camLocal);
    const lookW = this.wheel.localToWorld(lookLocal);
    bc.pos.lerp(camW, Math.min(1, dt * 4));
    bc.look.lerp(lookW, Math.min(1, dt * (settled ? 4 : 7)));
  }

  update(dt) {
    if (this.spinStep) {
      const k = Math.min(1, (performance.now() - this.spinT0) / (this.spinDur * 1000));
      this.spinStep(k);
      if (k >= 1) { const done = this.spinDone; this.spinStep = null; done(); }
    }
    if (!this.spinning) this.rotor.rotation.y += dt * 0.15;
    let a, r = this.ballR, y = this.ballY ?? 0.04;
    if (this.ballPocket !== null && this.ballPocket !== undefined) { a = this.pocketLocalAngle(this.ballPocket) - this.rotor.rotation.y; r = POCKET_R; y = 0.04; }
    else a = this.ballAngle;
    this.ball.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    this.dealer.update(dt);
    const b = this.spinButton;
    if (b.t > 0) b.t -= dt;
    const k = b.t > 0 ? Math.sin((b.t / 0.3) * Math.PI) : 0;
    b.mesh.position.y = 0.022 - k * 0.016;
    const ready = this.mine && !this.state?.busy && this.preparedTotal > 0;
    b.cap.emissiveIntensity = (ready ? 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(performance.now() / 250)) : 0.3) + k * 1.4 + (this.hoverSpin ? 0.35 : 0);
  }

  buildPanel() {
    this.picker = new ChipPicker(this.denoms, this.limits.min, () => this.refreshPanel());
    this.selEl = h('div.selchip');
    this.totalEl = h('div.betval.big');
    this.listEl = h('div.betlist');
    const quick = h('div.quick');
    for (const [spot, label] of [['red', 'ROT'], ['black', 'SCHWARZ'], ['even', 'GERADE'], ['odd', 'UNGERADE'], ['low', '1-18'], ['high', '19-36'], ['d1', '1-12'], ['d2', '13-24'], ['d3', '25-36'], ['c1', 'Spalte 1'], ['c2', 'Spalte 2'], ['c3', 'Spalte 3']]) {
      quick.append(h('button.small', { class: spot === 'red' ? 'red' : spot === 'black' ? 'black' : '', onclick: () => { this.edit('add', spot, this.picker.value); sfx.chip(); this.app.hands?.play('toss'); } }, label));
    }
    this.spinBtn = actionButton('SPIN', () => this.doSpin(), 'primary big');
    this.clearBtn = actionButton('CLEAR BET', () => this.edit('clear'));
    this.undoBtn = actionButton('UNDO LAST CHIP', () => this.edit('undo'));
    this.doubleBtn = actionButton('×2', () => this.edit('double'));
    this.camHint = h('div.phint');
    this.panel = h('div.tablepanel',
      h('div.ptitle', '🎡 ROULETTE'),
      limitLine(this.limits, ` · Einzelzahl max ${fmtMoney(this.limits.straightMax)}`),
      h('div.betrow', h('span.lbl', 'SELECTED CHIP:'), this.selEl),
      this.picker.el,
      h('div.phint', 'Klick = Chip setzen · Rechtsklick = Chip weg · Linien/Ecken = Split, Street, Corner, Six Line. Chips bleiben nach dem Spin liegen.'),
      quick,
      h('div.betrow', h('span.lbl', 'TOTAL BET:'), this.totalEl),
      this.listEl,
      h('div.actions', this.clearBtn, this.undoBtn, this.doubleBtn),
      h('div.actions', this.spinBtn),
      this.camHint,
      h('div.keys', 'LEERTASTE = Spin · C = Kugelkamera · ESC = Aufstehen'),
    );
    this.refreshPanel();
    return this.panel;
  }

  doSpin() {
    if (this.state?.busy) { sfx.denied(); return; }
    const total = this.preparedTotal;
    if (!total) { sfx.denied(); this.app.ui.toast('Setze zuerst Chips auf das Tableau', 'warn'); return; }
    if (total > this.app.pot) { sfx.denied(); this.app.ui.toast(`Nicht genug im Team-Pot für ${fmtMoney(total)}`, 'error'); return; }
    this.spinButton.t = 0.3;
    sfx.button();
    this.app.tableStart(this.def.id, {});
  }

  onKey(code) {
    if (code === 'Space') { this.doSpin(); return true; }
    if (code === 'KeyC') { this.app.toggleBallCam(this); return true; }
    if (code === 'KeyZ' || code === 'Backspace') { this.edit('undo'); return true; }
    return false;
  }

  refreshPanel() {
    if (!this.panel) return;
    const total = this.preparedTotal;
    this.selEl.textContent = fmtMoney(this.picker.value);
    this.totalEl.textContent = fmtMoney(total);
    this.totalEl.classList.toggle('danger', total > this.app.pot || total > this.limits.max);
    clear(this.listEl);
    for (const [spot, amount] of Object.entries(this.prepared)) {
      this.listEl.append(h('span.tag', { title: 'Klick: einen Chip wegnehmen', onclick: () => { this.edit('remove', spot, this.picker.value); sfx.chip(); } }, `${spotLabel(spot)}: ${fmtMoney(amount)}`));
    }
    const busy = !!this.state?.busy;
    this.spinBtn.disabled = busy || !total;
    for (const b of [this.clearBtn, this.undoBtn, this.doubleBtn]) b.disabled = busy;
    this.spinBtn.textContent = busy ? 'RIEN NE VA PLUS…' : `SPIN ${fmtMoney(total)}`;
    this.camHint.textContent = busy ? (this.app.ballCam?.view === this ? 'C – Kamera verlassen' : 'C – Kugelkamera') : '';
  }
}
