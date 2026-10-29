// Roulette: 3D-Kessel mit drehendem Rad, rollender Kugel und klickbarem Tableau.
import * as THREE from 'three';
import { TableView, chipStack, makeDealer, ease, stool } from './common.js';
import { M, mesh } from '../world/props.js';
import { rouletteLayout, rouletteRotorTexture, woodTexture } from '../textures.js';
import { WHEEL_ORDER, RED, spotLabel } from '../../shared/games/roulette.js';
import { h, clear } from '../ui/dom.js';
import { ChipPicker, actionButton, limitLine } from '../ui/betpanel.js';
import { fmtMoney } from '../../shared/config.js';
import { sfx, say } from '../audio.js';

const LAYOUT_W = 1.6, LAYOUT_D = 0.64, LAYOUT_X = 0.42;
const WHEEL_X = -0.95;
const N = WHEEL_ORDER.length;
const POCKET_R = 0.255, TRACK_R = 0.37;

export class RouletteView extends TableView {
  constructor(app, def, floor) {
    super(app, def, floor);
    this.seatLocal.set(0.35, 0, 0.95);
    this.camLocal.set(0.3, 2.15, 1.4);
    this.lookLocal.set(0.45, 0.8, -0.1);
    this.footprint = { w: 2.9, d: 1.3 };
    this.pending = {}; // spot → Betrag (eigene, noch nicht gesetzte Wette)
    this.lastBets = null;
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

  pocketLocalAngle(n) { return WHEEL_ORDER.indexOf(n) / N * Math.PI * 2; }

  placeBallInPocket(n) {
    this.ballPocket = n;
    this.ballR = POCKET_R;
  }

  // Raycast → Wettfeld
  spotAt(raycaster) {
    const hit = raycaster.intersectObject(this.layoutMesh)[0];
    if (!hit?.uv) return null;
    const x = hit.uv.x * this.layout.W, y = (1 - hit.uv.y) * this.layout.H;
    return this.layout.regions.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
  }

  regionToLocal(r, cx = r.cx, cy = r.cy) {
    return new THREE.Vector3(LAYOUT_X - LAYOUT_W / 2 + cx / this.layout.W * LAYOUT_W, 0.88, 0.02 - LAYOUT_D / 2 + cy / this.layout.H * LAYOUT_D);
  }

  hover(raycaster) {
    if (!this.mine || this.state?.busy) { this.hoverMesh.visible = false; return null; }
    const r = this.spotAt(raycaster);
    if (!r) { this.hoverMesh.visible = false; return null; }
    const p = this.regionToLocal(r);
    this.hoverMesh.position.set(p.x, 0.881, p.z);
    this.hoverMesh.scale.set(r.w / this.layout.W * LAYOUT_W, r.h / this.layout.H * LAYOUT_D, 1);
    this.hoverMesh.visible = true;
    return spotLabel(r.spot);
  }

  pick(raycaster, button) {
    if (!this.mine || this.state?.busy) return false;
    const r = this.spotAt(raycaster);
    if (!r) return false;
    if (button === 2) delete this.pending[r.spot];
    else {
      const max = r.spot.startsWith('n') ? this.limits.straightMax : this.limits.max;
      this.pending[r.spot] = Math.min(max, (this.pending[r.spot] || 0) + this.picker.value);
      this.app.hands?.play('toss');
    }
    sfx.chip();
    this.renderChips(this.pending);
    this.refreshPanel();
    return true;
  }

  renderChips(bets) {
    clear(this.chipGroup);
    for (const [spot, amount] of Object.entries(bets)) {
      const r = this.layout.regions.find(x => x.spot === spot);
      if (!r) continue;
      const st = chipStack(amount, this.limits.min);
      st.position.copy(this.regionToLocal(r));
      this.chipGroup.add(st);
    }
  }

  onState(ts, prev) {
    const s = ts.state;
    if (!prev) {
      this.drawHistory(s.history);
      if (s.result !== null) this.placeBallInPocket(s.result);
    }
    if (prev && prev.state.spinId !== s.spinId) this.startSpin(s);
    if (prev && prev.state.history[0] !== s.history[0] && s.phase === 'idle') this.drawHistory(s.history);
    if (!ts.busy && prev?.busy) {
      setTimeout(() => { if (!this.state?.busy) { this.renderChips(this.mine ? this.pending : {}); } }, 2500);
    }
    this.refreshPanel();
  }

  startSpin(s) {
    const bets = {};
    for (const b of s.bets) bets[b.spot] = b.amount;
    this.renderChips(bets);
    if (this.mine) { this.lastBets = { ...this.pending }; this.pending = {}; }
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
    const near = this.app.distanceTo?.(this.group.position) < 7;
    if (near) { sfx.rouletteSpin(Tb); setTimeout(() => say('Rien ne va plus!', 'fr-FR'), 2500); }
    this.dealer.setAnim('deal');
    setTimeout(() => this.dealer.setAnim('idle'), 1200);
    let bounced = false;
    this.anim.add(T, k => {
      const t = k * T;
      this.rotor.rotation.y = R0 + dR * ease.outCubic(k);
      if (t < Tb) {
        const kb = t / Tb;
        this.ballAngle = B0 - dB * (1 - Math.pow(1 - kb, 2.2));
        const drop = kb < 0.62 ? 0 : (kb - 0.62) / 0.38;
        const bounce = drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * Math.PI * 4)) * (1 - drop) * 0.03 : 0;
        this.ballR = TRACK_R - (TRACK_R - POCKET_R) * ease.inOutCubic(drop) + bounce;
        this.ballY = 0.07 - 0.03 * ease.inOutCubic(drop) + bounce * 0.8;
        if (drop > 0.2 && !bounced) { bounced = true; if (near) sfx.ballBounce(); }
      } else {
        this.ballPocket = s.result;
      }
    }, () => {
      this.spinning = false;
      this.ballPocket = s.result;
      if (near) say(`${s.result}, ${s.result === 0 ? 'Zero' : RED.has(s.result) ? 'Rot' : 'Schwarz'}`);
    });
  }

  currentBallAngle() {
    if (this.ballPocket !== null && this.ballPocket !== undefined) return this.pocketLocalAngle(this.ballPocket) - this.rotor.rotation.y;
    return this.ballAngle;
  }

  update(dt) {
    if (!this.spinning) this.rotor.rotation.y += dt * 0.15;
    let a, r = this.ballR, y = this.ballY ?? 0.04;
    if (this.ballPocket !== null && this.ballPocket !== undefined) { a = this.pocketLocalAngle(this.ballPocket) - this.rotor.rotation.y; r = POCKET_R; y = 0.04; }
    else a = this.ballAngle;
    this.ball.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    this.dealer.update(dt);
  }

  get pendingTotal() { return Object.values(this.pending).reduce((a, b) => a + b, 0); }

  buildPanel() {
    this.picker = new ChipPicker(this.denoms, this.limits.min);
    this.totalEl = h('div.betval');
    this.listEl = h('div.betlist');
    const quick = h('div.quick');
    for (const [spot, label] of [['red', 'ROT'], ['black', 'SCHWARZ'], ['even', 'GERADE'], ['odd', 'UNGERADE'], ['low', '1-18'], ['high', '19-36'], ['d1', '1-12'], ['d2', '13-24'], ['d3', '25-36']]) {
      quick.append(h('button.small', { class: spot === 'red' ? 'red' : spot === 'black' ? 'black' : '', onclick: () => { this.pending[spot] = Math.min(this.limits.max, (this.pending[spot] || 0) + this.picker.value); sfx.chip(); this.app.hands?.play('toss'); this.renderChips(this.pending); this.refreshPanel(); } }, label));
    }
    this.spinBtn = actionButton('SPIN', () => this.doSpin(), 'primary big');
    this.panel = h('div.tablepanel',
      h('div.ptitle', '🎡 ROULETTE'),
      limitLine(this.limits, ` · Einzelzahl max ${fmtMoney(this.limits.straightMax)}`),
      h('div.phint', 'Chip wählen und auf das Tableau klicken (Rechtsklick entfernt). Einzelzahl zahlt 36:1, bei 0 gibt es alle Aussenwetten zurück.'),
      this.picker.el,
      quick,
      h('div.betrow', h('span', 'Einsatz:'), this.totalEl),
      this.listEl,
      h('div.actions',
        actionButton('Löschen', () => { this.pending = {}; this.renderChips({}); this.refreshPanel(); }),
        actionButton('Wiederholen', () => { if (this.lastBets) { this.pending = { ...this.lastBets }; this.renderChips(this.pending); this.refreshPanel(); } }),
        actionButton('×2', () => { for (const k in this.pending) this.pending[k] *= 2; this.renderChips(this.pending); this.refreshPanel(); }),
        this.spinBtn,
      ),
      h('div.keys', 'LEERTASTE = Spin · ESC = Aufstehen'),
    );
    this.refreshPanel();
    return this.panel;
  }

  doSpin() {
    if (this.state?.busy) return;
    const bets = Object.entries(this.pending).map(([spot, amount]) => ({ spot, amount }));
    if (!bets.length) { this.app.ui.toast('Setze zuerst Chips auf das Tableau', 'warn'); return; }
    this.app.tableStart(this.def.id, { bets });
  }

  onKey(code) { if (code === 'Space') { this.doSpin(); return true; } return false; }

  refreshPanel() {
    if (!this.panel) return;
    const total = this.pendingTotal;
    this.totalEl.textContent = fmtMoney(total);
    this.totalEl.classList.toggle('danger', total > this.app.pot || total > this.limits.max);
    clear(this.listEl);
    for (const [spot, amount] of Object.entries(this.pending)) this.listEl.append(h('span.tag', `${spotLabel(spot)}: ${fmtMoney(amount)}`));
    this.spinBtn.disabled = !!this.state?.busy;
  }
}
