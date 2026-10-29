// Grosses Glücksrad mit Multiplikator-Feldern.
import * as THREE from 'three';
import { TableView, chipStack, makeDealer, ease, TextSprite } from './common.js';
import { M, mesh, neonSign } from '../world/props.js';
import { wheelTexture, WHEEL_COLORS } from '../textures.js';
import { WHEEL_SEGMENTS, WHEEL_PAYS } from '../../shared/games/wheel.js';
import { h, clear } from '../ui/dom.js';
import { ChipPicker, actionButton, limitLine } from '../ui/betpanel.js';
import { fmtMoney } from '../../shared/config.js';
import { sfx } from '../audio.js';

const N = WHEEL_SEGMENTS.length;
const KEYS = Object.keys(WHEEL_PAYS);

export class WheelView extends TableView {
  constructor(app, def, floor) {
    super(app, def, floor);
    this.seatLocal.set(0, 0, 1.9);
    this.camLocal.set(0, 1.75, 3.3);
    this.lookLocal.set(0, 1.55, 0);
    this.footprint = { w: 3, d: 1.6, oz: 0.3 };
    this.pending = {};
    this.build();
  }

  build() {
    const g = this.group;
    // Ständer
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.4, 0.6), M.gold(), 0, 0.2, -0.2));
    g.add(mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), M.gold(), 0, 1.0, -0.25));
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, 2.05, -0.1);
    g.add(this.wheel);
    const face = mesh(new THREE.CircleGeometry(1.25, 108), new THREE.MeshStandardMaterial({ map: wheelTexture(), roughness: 0.45 }), 0, 0, 0.058, { cast: false });
    this.wheel.add(face);
    this.wheel.add(mesh(new THREE.CylinderGeometry(1.28, 1.28, 0.1, 108), M.std('#5b3a12', 0.4)).rotateX(Math.PI / 2));
    // Stifte
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2;
      this.wheel.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08), M.gold(), Math.cos(a) * 1.22, Math.sin(a) * 1.22, 0.09).rotateX(Math.PI / 2));
    }
    this.lights = [];
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      const b = mesh(new THREE.SphereGeometry(0.035, 8, 6), M.glow('#ffd97a', 2), Math.cos(a) * 1.36, 2.05 + Math.sin(a) * 1.36, -0.1, { cast: false });
      g.add(b);
      this.lights.push(b);
    }
    // Zeiger
    this.flapper = new THREE.Group();
    this.flapper.position.set(0, 3.42, 0.08);
    const tri = new THREE.Shape(); tri.moveTo(-0.08, 0.05); tri.lineTo(0.08, 0.05); tri.lineTo(0, -0.18); tri.closePath();
    this.flapper.add(mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false }), M.std('#d90429', 0.3)));
    g.add(this.flapper);
    const sign = neonSign('WHEEL OF AYRIS', '#ff3cac', 2.2, 0.45);
    sign.position.set(0, 3.75, -0.1);
    g.add(sign);
    // Wett-Tisch
    g.add(mesh(new THREE.BoxGeometry(2.6, 0.8, 0.8), M.std('#2a1206', 0.4), 0, 0.4, 0.95));
    this.spotMeshes = {};
    KEYS.forEach((k, i) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = WHEEL_COLORS[k]; x.fillRect(0, 0, 128, 128);
      x.strokeStyle = '#ffd97a'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 120);
      x.fillStyle = k === 'x50' ? '#ffd700' : '#fff'; x.font = '44px "Bungee", Impact'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(k.slice(1), 64, 56);
      x.font = 'bold 20px Arial'; x.fillText(`${WHEEL_PAYS[k]}:1`, 64, 100);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = mesh(new THREE.PlaneGeometry(0.38, 0.38), M.std('#fff', 0.8, 0, { map: t }), -1.05 + i * 0.42, 0.805, 0.95, { cast: false });
      m.rotation.x = -Math.PI / 2;
      m.userData.spot = k;
      g.add(m);
      this.spotMeshes[k] = m;
    });
    this.chips = new THREE.Group(); g.add(this.chips);
    this.host = makeDealer(this.tier, this.def.index + 4);
    this.host.root.position.set(1.0, 0, 0.1);
    this.host.root.rotation.y = -0.4;
    g.add(this.host.root);
    this.label = new TextSprite(0.9, 0.2); this.label.sprite.position.set(0, 0.6, 0.4); this.wheel.parent.add(this.label.sprite);
    this.label.sprite.position.set(0, 3.95 + 0.25, 0);
    this.wheel.rotation.z = Math.PI / 2;
    this.lastIdx = -1;
  }

  segAtPointer() {
    const rot = this.wheel.rotation.z - Math.PI / 2;
    return ((Math.round(rot / (Math.PI * 2) * N) % N) + N) % N;
  }

  renderChips(bets) {
    clear(this.chips);
    for (const [k, v] of Object.entries(bets)) {
      if (!v) continue;
      const st = chipStack(v, this.limits.min);
      st.position.copy(this.spotMeshes[k].position).setY(0.81);
      this.chips.add(st);
    }
  }

  onState(ts, prev) {
    const s = ts.state;
    if (!prev) { this.wheel.rotation.z = Math.PI / 2 + s.result / N * Math.PI * 2; this.refreshPanel(); return; }
    if (prev.state.spinId !== s.spinId) {
      this.renderChips(s.bets);
      if (this.mine) { this.last = { ...this.pending }; this.pending = {}; }
      this.label.set('');
      const start = this.wheel.rotation.z;
      let target = Math.PI / 2 + s.result / N * Math.PI * 2;
      while (target < start + Math.PI * 2 * 4) target += Math.PI * 2;
      this.spinning = true;
      this.host.setAnim('point');
      this.anim.add(6.2, k => { this.wheel.rotation.z = start + (target - start) * ease.outCubic(k); }, () => {
        this.spinning = false;
        this.host.setAnim('idle');
        const seg = WHEEL_SEGMENTS[s.result];
        this.label.set(`${seg.slice(1)}×`, seg === 'x50' ? '#ffd700' : '#ffffff');
      });
    }
    if (prev.busy && !ts.busy) setTimeout(() => { if (!this.state?.busy) this.renderChips(this.mine ? this.pending : {}); }, 2500);
    this.refreshPanel();
  }

  update(dt, t) {
    this.host.update(dt);
    const idx = this.segAtPointer();
    if (idx !== this.lastIdx) {
      this.lastIdx = idx;
      if (this.spinning) {
        this.flapper.rotation.z = 0.35;
        if (this.app.distanceTo?.(this.group.position) < 9) sfx.wheelTick(0.05);
      }
    }
    this.flapper.rotation.z *= 0.85;
    this.lights.forEach((b, i) => { b.material.emissiveIntensity = (this.spinning ? Math.sin(t * 16 + i) > 0 : Math.sin(t * 2 + i * 0.5) > 0) ? 3 : 0.4; });
  }

  spotAt(raycaster) {
    const hit = raycaster.intersectObjects(Object.values(this.spotMeshes))[0];
    return hit?.object.userData.spot || null;
  }
  hover(raycaster) { if (!this.mine || this.state?.busy) return null; const s = this.spotAt(raycaster); return s ? `${s.slice(1)}× (zahlt ${WHEEL_PAYS[s]}:1)` : null; }
  pick(raycaster, button) {
    if (!this.mine || this.state?.busy) return false;
    const s = this.spotAt(raycaster);
    if (!s) return false;
    this.addBet(s, button === 2);
    return true;
  }

  addBet(k, remove) {
    if (remove) delete this.pending[k];
    else { this.pending[k] = Math.min(this.limits.max, (this.pending[k] || 0) + this.picker.value); this.app.hands?.play('toss'); }
    sfx.chip();
    this.renderChips(this.pending);
    this.refreshPanel();
  }

  buildPanel() {
    this.picker = new ChipPicker(this.denoms, this.limits.min);
    this.listEl = h('div.betlist');
    this.totalEl = h('div.betval');
    const quick = h('div.quick');
    for (const k of KEYS) quick.append(h('button.small', { style: { background: WHEEL_COLORS[k], color: k === 'x1' ? '#111' : '#fff' }, onclick: () => this.addBet(k) }, `${k.slice(1)}× (${WHEEL_PAYS[k]}:1)`));
    this.spinBtn = actionButton('RAD DREHEN', () => this.spin(), 'primary big');
    this.panel = h('div.tablepanel',
      h('div.ptitle', '🎯 GLÜCKSRAD'),
      limitLine(this.limits, ' pro Feld'),
      h('div.phint', 'Setze auf eine oder mehrere Zahlen. Bleibt das Rad dort stehen, zahlt es den Multiplikator.'),
      this.picker.el, quick,
      h('div.betrow', h('span', 'Einsatz:'), this.totalEl),
      this.listEl,
      h('div.actions',
        actionButton('Löschen', () => { this.pending = {}; this.renderChips({}); this.refreshPanel(); }),
        actionButton('Wiederholen', () => { if (this.last) { this.pending = { ...this.last }; this.renderChips(this.pending); this.refreshPanel(); } }),
        this.spinBtn),
      h('div.keys', 'LEERTASTE = Drehen · ESC = Aufstehen'),
    );
    this.refreshPanel();
    return this.panel;
  }

  spin() {
    if (this.state?.busy) return;
    if (!Object.keys(this.pending).length) { this.app.ui.toast('Setze zuerst auf ein Feld', 'warn'); return; }
    this.app.tableStart(this.def.id, { bets: this.pending });
  }

  onKey(code) { if (code === 'Space') { this.spin(); return true; } return false; }

  refreshPanel() {
    if (!this.panel) return;
    const total = Object.values(this.pending).reduce((a, b) => a + b, 0);
    this.totalEl.textContent = fmtMoney(total);
    this.totalEl.classList.toggle('danger', total > this.app.pot);
    clear(this.listEl);
    for (const [k, v] of Object.entries(this.pending)) this.listEl.append(h('span.tag', `${k.slice(1)}×: ${fmtMoney(v)}`));
    this.spinBtn.disabled = !!this.state?.busy;
  }
}
