// Craps: Würfeltisch mit physisch animierten Würfeln, Point-Puck und Wettfeldern.
import * as THREE from 'three';
import { TableView, chipStack, makeDealer, ease, TextSprite } from './common.js';
import { M, mesh } from '../world/props.js';
import { crapsLayout, diceFaceTexture, woodTexture } from '../textures.js';
import { CRAPS_BETS } from '../../shared/games/craps.js';
import { h, clear } from '../ui/dom.js';
import { ChipPicker, actionButton, limitLine } from '../ui/betpanel.js';
import { fmtMoney } from '../../shared/config.js';
import { sfx } from '../audio.js';

const LW = 2.2, LD = 1.0;
// Würfelflächen: +x=3, -x=4, +y=1, -y=6, +z=2, -z=5
const FACE_ROT = {
  1: new THREE.Euler(0, 0, 0), 6: new THREE.Euler(Math.PI, 0, 0), 2: new THREE.Euler(-Math.PI / 2, 0, 0),
  5: new THREE.Euler(Math.PI / 2, 0, 0), 3: new THREE.Euler(0, 0, Math.PI / 2), 4: new THREE.Euler(0, 0, -Math.PI / 2),
};

function makeDie() {
  const mats = [3, 4, 1, 6, 2, 5].map(n => new THREE.MeshStandardMaterial({ map: diceFaceTexture(n), roughness: 0.25 }));
  const d = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mats);
  d.castShadow = true;
  return d;
}

export class CrapsView extends TableView {
  constructor(app, def, floor) {
    super(app, def, floor);
    this.seatLocal.set(0.2, 0, 1.15);
    this.camLocal.set(0.2, 1.65, 1.2);
    this.lookLocal.set(0.05, 0.8, -0.1);
    this.footprint = { w: 2.8, d: 1.6 };
    this.layout = crapsLayout();
    this.pending = {};
    this.build();
  }

  build() {
    const g = this.group;
    const wood = M.std('#2a1206', 0.35, 0.1, { map: woodTexture('#3a1a08') });
    g.add(mesh(new THREE.BoxGeometry(2.6, 0.75, 1.4), wood, 0, 0.375, 0));
    // Rahmen / Banden
    const rail = this.tier >= 3 ? M.gold() : M.std('#5a2a10', 0.3, 0.2);
    for (const [x, z, w, d] of [[0, -0.72, 2.7, 0.1], [0, 0.72, 2.7, 0.1], [-1.32, 0, 0.1, 1.5], [1.32, 0, 0.1, 1.5]]) g.add(mesh(new THREE.BoxGeometry(w, 0.22, d), wood, x, 0.86, z));
    for (const [x, z, w, d] of [[0, -0.72, 2.72, 0.12], [0, 0.72, 2.72, 0.12], [-1.33, 0, 0.12, 1.52], [1.33, 0, 0.12, 1.52]]) g.add(mesh(new THREE.BoxGeometry(w, 0.03, d), rail, x, 0.985, z));
    // Gummi-Pyramiden an der Rückwand
    const pyr = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.2), M.std('#1a1a1a', 0.9));
    pyr.position.set(0, 0.86, -0.665);
    g.add(pyr);
    this.layoutMesh = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), new THREE.MeshStandardMaterial({ map: this.layout.texture, roughness: 0.9 }));
    this.layoutMesh.rotation.x = -Math.PI / 2;
    this.layoutMesh.position.set(0, 0.752, 0.05);
    this.layoutMesh.receiveShadow = true;
    g.add(this.layoutMesh);
    const surround = mesh(new THREE.PlaneGeometry(2.55, 1.35), M.std('#0b5f8a', 0.95), 0, 0.751, 0, { cast: false });
    surround.rotation.x = -Math.PI / 2;
    g.add(surround);
    this.hoverMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.22, depthWrite: false }));
    this.hoverMesh.rotation.x = -Math.PI / 2; this.hoverMesh.visible = false; g.add(this.hoverMesh);
    this.chips = new THREE.Group(); g.add(this.chips);
    this.dice = [makeDie(), makeDie()];
    this.dice.forEach((d, i) => { d.position.set(-0.1 + i * 0.12, 0.783, -0.25); d.rotation.copy(FACE_ROT[i ? 4 : 3]); g.add(d); });
    // Puck
    this.puck = new THREE.Group();
    const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 24), M.std('#111'));
    this.puck.add(pm);
    this.puckTop = new THREE.Mesh(new THREE.CircleGeometry(0.048, 24), new THREE.MeshBasicMaterial({ color: '#111' }));
    this.puckTop.rotation.x = -Math.PI / 2; this.puckTop.position.y = 0.011;
    this.puck.add(this.puckTop);
    g.add(this.puck);
    this.setPuck(null);
    this.stick = makeDealer(this.tier, this.def.index + 2);
    this.stick.root.position.set(0, 0, -1.05);
    g.add(this.stick.root);
    this.label = new TextSprite(0.7, 0.16); this.label.sprite.position.set(0, 1.3, -0.2); g.add(this.label.sprite);
  }

  setPuck(point) {
    const tex = (on) => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = on ? '#fff' : '#111'; x.beginPath(); x.arc(32, 32, 32, 0, Math.PI * 2); x.fill();
      x.fillStyle = on ? '#111' : '#fff'; x.font = 'bold 24px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(on ? 'ON' : 'OFF', 32, 34);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    this.puckTop.material.map?.dispose();
    this.puckTop.material.map = tex(!!point);
    this.puckTop.material.color.set('#fff');
    this.puckTop.material.needsUpdate = true;
    if (point) {
      const cx = this.layout.pointX(point);
      this.puck.position.set(-LW / 2 + cx / this.layout.W * LW, 0.765, 0.05 - LD / 2 + 50 / this.layout.H * LD);
    } else this.puck.position.set(-LW / 2 + 400 / this.layout.W * LW, 0.765, 0.05 - LD / 2 + 60 / this.layout.H * LD);
  }

  regionLocal(spot) {
    const r = this.layout.regions.find(x => x.spot === spot);
    return new THREE.Vector3(-LW / 2 + r.cx / this.layout.W * LW, 0.755, 0.05 - LD / 2 + r.cy / this.layout.H * LD);
  }

  spotAt(raycaster) {
    const hit = raycaster.intersectObject(this.layoutMesh)[0];
    if (!hit?.uv) return null;
    const x = hit.uv.x * this.layout.W, y = (1 - hit.uv.y) * this.layout.H;
    return this.layout.regions.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
  }

  hover(raycaster) {
    if (!this.mine || this.state?.state.phase !== 'idle') { this.hoverMesh.visible = false; return null; }
    const r = this.spotAt(raycaster);
    if (!r) { this.hoverMesh.visible = false; return null; }
    const p = this.regionLocal(r.spot);
    this.hoverMesh.position.set(p.x, 0.756, p.z);
    this.hoverMesh.scale.set(r.w / this.layout.W * LW, r.h / this.layout.H * LD, 1);
    this.hoverMesh.visible = true;
    return CRAPS_BETS[r.spot].label;
  }

  pick(raycaster, button) {
    if (!this.mine || this.state?.state.phase !== 'idle') return false;
    const r = this.spotAt(raycaster);
    if (!r) return false;
    this.addBet(r.spot, button === 2);
    return true;
  }

  addBet(spot, remove) {
    const s = this.state.state;
    if (remove) { delete this.pending[spot]; }
    else {
      if ((spot === 'pass' || spot === 'dontpass') && s.point !== null) return this.app.ui.toast('Line-Wetten nur beim Come-out-Wurf', 'warn');
      if (spot === 'odds' && (s.point === null || !s.bets.pass)) return this.app.ui.toast('Odds nur mit Pass Line und aktivem Point', 'warn');
      this.pending[spot] = (this.pending[spot] || 0) + this.picker.value;
      this.app.hands?.play('toss');
    }
    sfx.chip();
    this.renderChips();
    this.refreshPanel();
  }

  renderChips() {
    clear(this.chips);
    const s = this.state?.state;
    const all = { ...(s?.bets || {}) };
    if (this.mine) for (const [k, v] of Object.entries(this.pending)) all[k] = (all[k] || 0) + v;
    for (const [k, v] of Object.entries(all)) {
      if (!v) continue;
      const st = chipStack(v, this.limits.min);
      st.position.copy(this.regionLocal(k));
      this.chips.add(st);
    }
  }

  onState(ts, prev) {
    const s = ts.state;
    if (!prev) { this.setPuck(s.point); this.renderChips(); this.refreshPanel(); return; }
    if (prev.state.rollId !== s.rollId) {
      if (this.mine) { this.lastPending = { ...this.pending }; this.pending = {}; }
      this.renderChips();
      this.throwDice(s.dice);
      this.label.set('');
    } else if (s.phase === 'idle' && prev.state.phase === 'rolling') {
      this.setPuck(s.point);
      this.renderChips();
      const sum = s.dice[0] + s.dice[1];
      this.label.set(`${sum}${s.point ? '' : prev.state.point && (sum === 7 || sum === prev.state.point) ? (sum === 7 ? ' – SEVEN OUT' : ' – POINT!') : ''}`, '#ffd97a');
    } else this.renderChips();
    this.refreshPanel();
  }

  throwDice([a, b]) {
    const near = this.app.distanceTo?.(this.group.position) < 7;
    if (near) sfx.dice();
    this.stick.setAnim('point');
    setTimeout(() => this.stick.setAnim('idle'), 1500);
    [a, b].forEach((v, i) => {
      const die = this.dice[i];
      const start = new THREE.Vector3(0.2 + i * 0.08, 1.05, 0.62);
      const wall = new THREE.Vector3(-0.2 + Math.random() * 0.5 + i * 0.1, 0.8, -0.6);
      const end = new THREE.Vector3(-0.45 + Math.random() * 0.8 + i * 0.12, 0.783, -0.25 + Math.random() * 0.3);
      const yaw = Math.random() * Math.PI * 2;
      const qFinal = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)).multiply(new THREE.Quaternion().setFromEuler(FACE_ROT[v]));
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const turns = Math.PI * 2 * (5 + Math.random() * 2);
      const tmp = new THREE.Quaternion();
      let hit = false;
      this.anim.add(2.5, k => {
        if (k < 0.4) {
          const t = k / 0.4;
          die.position.lerpVectors(start, wall, t);
          die.position.y = THREE.MathUtils.lerp(start.y, 0.8, t) + Math.sin(t * Math.PI) * 0.35;
        } else {
          if (!hit) { hit = true; if (near) sfx.diceHit(); }
          const t = (k - 0.4) / 0.6;
          die.position.lerpVectors(wall, end, ease.outCubic(t));
          die.position.y = 0.783 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.12 * Math.pow(1 - t, 2);
        }
        const rem = 1 - ease.outCubic(k);
        tmp.setFromAxisAngle(axis, turns * rem);
        die.quaternion.copy(qFinal).multiply(tmp);
      }, null, i * 0.05);
    });
  }

  update(dt) { this.stick.update(dt); }

  buildPanel() {
    this.picker = new ChipPicker(this.denoms, this.limits.min);
    this.listEl = h('div.betlist');
    this.info = h('div.info');
    const quick = h('div.quick');
    for (const k of Object.keys(CRAPS_BETS)) quick.append(h('button.small', { onclick: () => this.addBet(k) }, CRAPS_BETS[k].label));
    this.rollBtn = actionButton('🎲 WÜRFELN', () => this.roll(), 'primary big');
    this.panel = h('div.tablepanel',
      h('div.ptitle', '🎲 CRAPS'),
      limitLine(this.limits, ` · Props max ${fmtMoney(this.limits.propMax)}`),
      h('div.hint', 'Come-out: 7/11 gewinnt, 2/3/12 verliert, sonst wird ein Point gesetzt. Point vor der 7 = Gewinn.'),
      this.info,
      this.picker.el,
      quick,
      this.listEl,
      h('div.actions',
        actionButton('Löschen', () => { this.pending = {}; this.renderChips(); this.refreshPanel(); }),
        actionButton('Wiederholen', () => { if (this.lastPending) { this.pending = { ...this.lastPending }; if (this.state.state.point !== null) { delete this.pending.pass; delete this.pending.dontpass; } this.renderChips(); this.refreshPanel(); } }),
        this.rollBtn,
      ),
      h('div.keys', 'LEERTASTE = Würfeln · ESC = Aufstehen'),
    );
    this.refreshPanel();
    return this.panel;
  }

  roll() {
    const s = this.state?.state;
    if (!s || s.phase !== 'idle') return;
    this.app.hands?.play('roll');
    this.app.tableStart(this.def.id, { bets: this.pending });
  }

  onKey(code) { if (code === 'Space') { this.roll(); return true; } return false; }

  refreshPanel() {
    if (!this.panel || !this.state) return;
    const s = this.state.state;
    clear(this.info);
    this.info.append(h('div', s.point ? `POINT: ${s.point} – würfle den Point vor der 7!` : 'COME-OUT-WURF'));
    clear(this.listEl);
    for (const [k, v] of Object.entries(s.bets)) this.listEl.append(h('span.tag.on', `${CRAPS_BETS[k].label}: ${fmtMoney(v)}`));
    for (const [k, v] of Object.entries(this.pending)) this.listEl.append(h('span.tag', `+ ${CRAPS_BETS[k].label}: ${fmtMoney(v)}`));
    this.rollBtn.disabled = s.phase !== 'idle';
  }
}
