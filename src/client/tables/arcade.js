// 3D-Stationen der Arcade-Casino-Spiele (Prompt 10). Jede Station ist ein Automat/Terminal im Raum mit einem
// grossen Bildschirm (Canvas-Textur), den alle Spieler sehen. Plinko, Money Wheel, Duck Race und Street Craps
// sind zusätzlich echte 3D-Maschinen (Pins + Kugel, Rad, Rennbahn, Würfel). Bedient wird über das Tischpanel.
// Alles, was angezeigt wird, kommt aus dem Server-Zustand – die Animationen spielen nur das feste Ergebnis ab.
import * as THREE from 'three';
import { TableView, ease } from './common.js';
import { M, mesh, neonSign } from '../world/props.js';
import { diceFaceTexture } from '../textures.js';
import { h, clear } from '../ui/dom.js';
import { BetAmount, actionButton, limitLine } from '../ui/betpanel.js';
import { fmtMoney, fmtShort } from '../../shared/config.js';
import { sfx, sfxAt } from '../audio.js';
import {
  crashMultAt, hiloOdds, minesMult, MINES_TILES, TOWER_LEVELS, TOWER_MODES, towerMult, PENGUIN_LANES, PENGUIN_MODES, penguinMult,
  PLINKO_ROWS, PLINKO_PAYS, KENO_N, KENO_PAYS, KENO_DRAW, MONEY_WHEEL, DUCKS, DUCK_STEPS, STREET_BETS,
} from '../../shared/games/arcade.js';

const FONT = '"Bungee", Impact, sans-serif';
const UI = '"Nunito", Arial, sans-serif';
const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT = ['♠', '♥', '♦', '♣'];
const STYLE = {
  crash: { color: '#2bd9fe', title: 'CRASH', body: '#0d1a2a' },
  hilo: { color: '#ff3cac', title: 'HILO', body: '#2a0d22' },
  mines: { color: '#7cff6b', title: 'MINES', body: '#0d2a14' },
  tower: { color: '#ff7a1a', title: 'DRAGON TOWER', body: '#2a140a' },
  penguin: { color: '#9be7ff', title: 'PENGUIN CROSS', body: '#0a1a2a' },
  keno: { color: '#ffd60a', title: 'KENO', body: '#2a240a' },
  plinko: { color: '#c084ff', title: 'PLINKO', body: '#1a0d2a' },
  moneywheel: { color: '#ffd700', title: 'MONEY WHEEL', body: '#2a1a05' },
  duck: { color: '#ffd60a', title: 'DUCK RACE', body: '#0a2a2a' },
  streetcraps: { color: '#ff5a5a', title: 'STREET CRAPS', body: '#2a0a0a' },
};

// ───────────────────────── Basis: Automat mit Bildschirm ─────────────────────────
class ArcadeView extends TableView {
  constructor(app, def, floor, opts = {}) {
    super(app, def, floor);
    this.st = STYLE[def.type];
    this.cabW = opts.w || 1.5;
    this.seatLocal.set(0, 0, 1.15);
    this.camLocal.set(0, 1.62, 1.35);
    this.lookLocal.set(0, opts.lookY || 1.5, 0);
    this.radius = 1.3;
    this.footprint = { w: this.cabW + 0.1, d: 1.0, oz: -0.05 };
    this.resultDelay = 0;
    this.dirty = true;
    this.build(opts);
  }

  build(opts) {
    const g = this.group, w = this.cabW;
    const body = M.std(this.st.body, 0.45, 0.2);
    const H = opts.h || 2.3;
    g.add(mesh(new THREE.BoxGeometry(w, H, 0.8), body, 0, H / 2, -0.15));
    g.add(mesh(new THREE.BoxGeometry(w + 0.06, 0.06, 0.86), M.glow(this.st.color, 1.6), 0, H, -0.15, { cast: false }));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.04, H - 0.1, 0.04), M.glow(this.st.color, 1.4), sx * (w / 2 + 0.01), H / 2, 0.26, { cast: false }));
    // Bedienpult
    const deck = mesh(new THREE.BoxGeometry(w - 0.1, 0.12, 0.45), M.std('#111', 0.4, 0.3), 0, 1.0, 0.35);
    deck.rotation.x = -0.35;
    g.add(deck);
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16), M.glow(['#7cff6b', '#ffd60a', '#ff3cac'][i], 1.8), (i - 1) * 0.3, 1.08, 0.38, { cast: false }));
    // Bildschirm
    if (!opts.noScreen) {
      const sw = opts.screenW || w - 0.2, sh = opts.screenH || 0.95;
      this.canvas = document.createElement('canvas');
      this.canvas.width = 640; this.canvas.height = Math.round(640 * sh / sw);
      this.ctx = this.canvas.getContext('2d');
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
      scr.position.set(0, opts.screenY || 1.6, 0.255);
      scr.userData.noBake = true;
      g.add(scr);
      this.screen = scr;
    }
    const sign = neonSign(this.st.title, this.st.color, Math.min(w + 0.2, 2.6), 0.42);
    sign.position.set(0, H + 0.32, -0.1);
    g.add(sign);
    this.buildExtra?.(opts);
  }

  get s() { return this.state?.state; }
  near() { return this.app.distanceTo(this.group.position) < 16; }
  vol() { return this.mine ? 1 : Math.max(0, 1 - this.app.distanceTo(this.group.position) / 12); }

  onState(ts, prev) {
    const s = ts.state;
    if (!prev || prev.state.roundId !== s.roundId) { this.roundT0 = performance.now(); this.onRound?.(s, prev?.state); }
    this.onChange?.(s, prev?.state);
    this.dirty = true;
    this.refreshPanel();
  }

  onEvent(ev) {
    if (ev.kind !== 'result') return;
    const v = this.vol();
    if (v <= 0.05) return;
    sfxAt(v, () => (ev.net > 0 ? (ev.net >= ev.stake * 5 ? sfx.bigWin() : sfx.smallWin()) : ev.net < 0 ? sfx.slotLoss() : sfx.pop()));
  }

  // Bildschirm nur neu zeichnen, wenn sich etwas ändert oder eine Animation läuft (gedrosselt)
  update(dt, t) {
    this.tick2?.(dt, t);
    if (!this.ctx) return;
    this.acc = (this.acc || 0) + dt;
    const animating = this.animating?.();
    if (!this.dirty && !(animating && this.acc > 1 / 24)) return;
    if (!this.near() && !this.dirty) return;
    this.acc = 0;
    this.dirty = false;
    const g = this.ctx, W = this.canvas.width, Hh = this.canvas.height;
    g.fillStyle = '#07040f'; g.fillRect(0, 0, W, Hh);
    this.draw(g, W, Hh, t);
    g.strokeStyle = this.st.color; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, Hh - 6);
    this.tex.needsUpdate = true;
  }

  draw(g, W, H) { this.label(g, W / 2, H / 2, this.st.title, 48, this.st.color); }
  label(g, x, y, text, size = 28, color = '#fff', font = FONT, align = 'center') {
    g.font = `${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(text, x, y);
  }
  idleText(g, W, H) { if (!this.s || this.s.phase === 'idle') this.label(g, W / 2, H - 26, this.state?.occupant ? 'EINSATZ WÄHLEN' : '[E] SPIELEN', 22, '#b9a8d0', UI); }

  // ── Panel ──
  basePanel(title, hint, extra = []) {
    this.bet = new BetAmount(this.limits, () => this.app.pot, this.denoms, this.limits.min);
    this.statusEl = h('div.betval');
    this.panel = h('div.tablepanel',
      h('div.ptitle', title),
      limitLine(this.limits),
      h('div.phint', hint),
      ...extra,
      this.bet.el,
      h('div.betrow', h('span', 'Status:'), this.statusEl),
      this.actions = h('div.actions'),
      h('div.keys', 'ESC = Aufstehen'),
    );
    this.refreshPanel();
    return this.panel;
  }
  start(payload = {}) {
    if (this.state?.busy) return;
    if (this.bet.value > this.app.pot) { this.app.ui.toast('Nicht genug im Team-Pot', 'error'); return; }
    this.app.tableStart(this.def.id, { bet: this.bet.value, ...payload });
  }
  act(a) { this.app.tableAction(this.def.id, a); }
  seg(options, cur, onPick) {
    const el = h('div.seg');
    for (const [v, l] of options) el.append(h('button', { class: v === cur ? 'sel' : '', onclick: e => { onPick(v); for (const b of el.children) b.classList.toggle('sel', b === e.target); sfx.click(); } }, l));
    return el;
  }
  buildPanel() { return this.basePanel(this.st.title, ''); }
  refreshPanel() {}
}

// ───────────────────────── CRASH ─────────────────────────
class CrashView extends ArcadeView {
  constructor(app, def, floor) { super(app, def, floor, { w: 1.9, screenW: 1.7, screenH: 1.05, screenY: 1.65 }); this.auto = 0; }
  elapsed() {
    const s = this.s;
    if (!s || s.phase !== 'running') return 0;
    // eigener Startzeitpunkt (nahezu ohne Uhrenabweichung) oder bei spätem Einstieg aus der Serverzeit geschätzt
    const local = this.roundT0 ? performance.now() - this.roundT0 : 0;
    return Math.max(local, s.startedAt ? Date.now() - s.startedAt - 150 : 0);
  }
  curMult() { const s = this.s; if (!s) return 1; if (s.phase === 'crashed') return s.crash; return s.phase === 'running' ? crashMultAt(this.elapsed()) : 1; }
  animating() { return this.s?.phase === 'running'; }
  onChange(s, prev) {
    if (prev && prev.phase === 'running' && s.phase === 'crashed') {
      const v = this.vol();
      if (v > 0.05) sfxAt(v, () => sfx.explosion());
      if (this.near()) this.app.world.particles?.confetti(this.toWorld(new THREE.Vector3(0, 2, 0.4)), 30, 1.2);
    }
    if (prev && prev.cashed === null && s.cashed !== null && this.vol() > 0.05) sfxAt(this.vol(), () => sfx.coins());
  }
  tick2() { if (this.animating()) this.refreshMultBtn(); }
  draw(g, W, H) {
    const s = this.s || {};
    const m = this.curMult();
    // Verlauf
    const pad = 40, gw = W - pad * 2, gh = H - 120;
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(pad, 60 + gh * i / 4); g.lineTo(W - pad, 60 + gh * i / 4); g.stroke(); }
    if (s.phase === 'running' || s.phase === 'crashed') {
      const tMax = Math.max(4000, s.phase === 'crashed' ? Math.log(s.crash) / 0.12 * 1000 : this.elapsed());
      const mMax = Math.max(2, m * 1.15);
      g.beginPath();
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const tt = i / steps * (s.phase === 'crashed' ? Math.log(s.crash) / 0.12 * 1000 : this.elapsed());
        const mm = crashMultAt(tt);
        const x = pad + tt / tMax * gw, y = 60 + gh - (mm - 1) / (mMax - 1) * gh;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.strokeStyle = s.phase === 'crashed' ? '#ff4d4d' : '#2bd9fe'; g.lineWidth = 6; g.stroke();
    }
    const crashed = s.phase === 'crashed';
    this.label(g, W / 2, H / 2 - 10, `${m.toFixed(2)}×`, 110, crashed ? '#ff4d4d' : s.cashed ? '#7cff6b' : '#ffffff');
    if (crashed) this.label(g, W / 2, H / 2 + 70, `CRASHED @ ${s.crash.toFixed(2)}`, 36, '#ff4d4d');
    if (s.cashed) this.label(g, W / 2, 34, `CASHOUT ${s.cashed.toFixed(2)}× = ${fmtMoney(Math.floor(s.bet * s.cashed))}`, 26, '#7cff6b', UI);
    else if (s.phase === 'running') this.label(g, W / 2, 34, `Einsatz ${fmtMoney(s.bet)}${s.auto ? ` · Auto ${s.auto.toFixed(2)}×` : ''}`, 24, '#ffd97a', UI);
    (s.history || []).slice(0, 8).forEach((c, i) => this.label(g, 60 + i * 74, H - 26, `${c.toFixed(2)}`, 20, c >= 2 ? '#7cff6b' : '#ff6b6b', UI));
    this.idleText(g, W, H);
  }
  buildPanel() {
    this.autoEl = h('input', { type: 'number', min: 0, step: 0.1, value: '', placeholder: 'aus', style: { width: '80px' } });
    return this.basePanel('📈 CRASH', 'Der Multiplikator steigt, bis er zufällig abstürzt. Rechtzeitig CASH OUT drücken: Einsatz × Multiplikator. Optional automatischer Cashout.',
      [h('div.betrow', h('span', 'Auto-Cashout bei'), this.autoEl, h('span', '×'))]);
  }
  refreshMultBtn() { if (this.cashBtn && this.s?.phase === 'running' && this.s.cashed === null) this.cashBtn.textContent = `CASH OUT ${fmtMoney(Math.floor(this.s.bet * this.curMult()))}`; }
  refreshPanel() {
    if (!this.panel) return;
    const s = this.s || {};
    clear(this.actions);
    const running = s.phase === 'running';
    if (running && s.cashed === null && this.mine) {
      this.cashBtn = actionButton('CASH OUT', () => this.act('cashout'), 'primary big');
      this.actions.append(this.cashBtn);
      this.refreshMultBtn();
    } else this.actions.append(actionButton(running ? 'Warte auf den Crash…' : 'START', () => this.start({ auto: +this.autoEl.value || 0 }), 'primary big'));
    this.actions.lastChild.disabled = running && !(s.cashed === null && this.mine);
    this.statusEl.textContent = running ? (s.cashed ? `Ausgecasht bei ${s.cashed.toFixed(2)}×` : 'Läuft…') : s.phase === 'crashed' ? `Crash bei ${s.crash.toFixed(2)}×` : 'Bereit';
  }
  onKey(code) { if (code === 'Space') { if (this.s?.phase === 'running') this.act('cashout'); else this.start({ auto: +this.autoEl?.value || 0 }); return true; } return false; }
}

// ───────────────────────── HILO ─────────────────────────
function drawCard(g, x, y, w, c, faceUp = true) {
  const hgt = w * 1.4;
  g.fillStyle = faceUp ? '#fbf8f1' : '#7a1230';
  g.beginPath(); g.roundRect(x - w / 2, y - hgt / 2, w, hgt, w * 0.08); g.fill();
  if (!faceUp || !c) return;
  const red = c.s === 1 || c.s === 2;
  g.fillStyle = red ? '#d0182b' : '#141414';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${w * 0.42}px ${UI}`; g.fillText(RANK[c.r], x, y - hgt * 0.12);
  g.font = `${w * 0.36}px ${UI}`; g.fillText(SUIT[c.s], x, y + hgt * 0.22);
}
class HiloView extends ArcadeView {
  draw(g, W, H) {
    const s = this.s || {};
    if (!s.card) { this.label(g, W / 2, H / 2 - 20, 'HÖHER ODER TIEFER?', 40, this.st.color); this.idleText(g, W, H); return; }
    const k = Math.min(1, (performance.now() - (this.flipT || 0)) / 350);
    drawCard(g, W / 2, H / 2 - 10, 150 * (0.85 + 0.15 * k), s.card);
    (s.trail || []).slice(-7, -1).forEach((c, i) => drawCard(g, 70 + i * 62, H - 60, 52, c));
    this.label(g, W - 110, 70, `${s.mult.toFixed(2)}×`, 44, s.last === 'lose' ? '#ff4d4d' : '#ffd97a');
    this.label(g, W - 110, 115, `${s.steps} richtig`, 22, '#b9a8d0', UI);
    if (s.phase === 'play') {
      const hi = hiloOdds(s.card.r, 'hi'), lo = hiloOdds(s.card.r, 'lo');
      this.label(g, 110, 70, `▲ ${Math.round(hi.chance * 100)}% · ${hi.mult ? hi.mult.toFixed(2) + '×' : '—'}`, 22, '#7cff6b', UI);
      this.label(g, 110, 110, `▼ ${Math.round(lo.chance * 100)}% · ${lo.mult ? lo.mult.toFixed(2) + '×' : '—'}`, 22, '#ff9f43', UI);
    }
    const msg = { win: 'RICHTIG!', lose: 'DANEBEN!', push: 'GLEICH = PUSH', cash: `GEWINN ${fmtMoney(Math.floor(s.bet * s.mult))}` }[s.last];
    if (msg) this.label(g, W / 2, 40, msg, 30, s.last === 'lose' ? '#ff4d4d' : s.last === 'push' ? '#ffd97a' : '#7cff6b');
  }
  animating() { return performance.now() - (this.flipT || 0) < 400; }
  onChange(s, prev) {
    if (prev && prev.card && s.card && (prev.card.r !== s.card.r || prev.card.s !== s.card.s || prev.trail?.length !== s.trail?.length)) { this.flipT = performance.now(); if (this.vol() > 0.05) sfxAt(this.vol(), () => sfx.flip()); }
  }
  buildPanel() { return this.basePanel('🔼 HILO', 'Ist die nächste Karte höher oder tiefer? Richtig = Multiplikator steigt, falsch = Einsatz weg. Gleiche Karte = PUSH (nichts passiert, weiter mit der neuen Karte). Ass ist tief, König hoch.'); }
  refreshPanel() {
    if (!this.panel) return;
    const s = this.s || {};
    clear(this.actions);
    if (s.phase === 'play' && this.mine) {
      const hi = hiloOdds(s.card.r, 'hi'), lo = hiloOdds(s.card.r, 'lo');
      const b1 = actionButton(`▲ HÖHER (${Math.round(hi.chance * 100)}% · ${hi.mult.toFixed(2)}×)`, () => this.act('hi'), 'big');
      const b2 = actionButton(`▼ TIEFER (${Math.round(lo.chance * 100)}% · ${lo.mult.toFixed(2)}×)`, () => this.act('lo'), 'big');
      b1.disabled = !hi.count; b2.disabled = !lo.count;
      const cash = actionButton(`GEWINN NEHMEN ${fmtMoney(Math.floor(s.bet * s.mult))}`, () => this.act('cash'), 'primary big');
      cash.disabled = s.steps < 1;
      this.actions.append(b1, b2, cash);
      this.statusEl.textContent = `${s.mult.toFixed(2)}× · ${s.steps} richtig`;
    } else {
      this.actions.append(actionButton('KARTE ZIEHEN', () => this.start(), 'primary big'));
      this.statusEl.textContent = s.last === 'lose' ? 'Daneben – nochmal?' : 'Bereit';
    }
  }
  onKey(code) {
    const s = this.s;
    if (s?.phase === 'play') { if (code === 'ArrowUp' || code === 'KeyW') { this.act('hi'); return true; } if (code === 'ArrowDown' || code === 'KeyS') { this.act('lo'); return true; } if (code === 'Space') { this.act('cash'); return true; } }
    else if (code === 'Space') { this.start(); return true; }
    return false;
  }
}

// ───────────────────────── MINES ─────────────────────────
class MinesView extends ArcadeView {
  constructor(app, def, floor) { super(app, def, floor, { screenH: 1.05, screenY: 1.65 }); this.minesSel = 3; }
  draw(g, W, H) {
    const s = this.s || {};
    const size = Math.min(W - 220, H - 40) / 5, ox = 30, oy = (H - size * 5) / 2;
    const open = new Set(s.open || []), mines = new Set(s.board || []);
    const boom = performance.now() - (this.boomT || 0);
    for (let i = 0; i < MINES_TILES; i++) {
      const x = ox + (i % 5) * size, y = oy + Math.floor(i / 5) * size;
      const isOpen = open.has(i), isMine = mines.has(i);
      g.fillStyle = s.hit === i ? (boom < 600 && Math.floor(boom / 80) % 2 ? '#ffd60a' : '#ff2e2e') : isOpen ? '#123d22' : isMine ? '#3a1414' : '#2a2a40';
      g.beginPath(); g.roundRect(x + 4, y + 4, size - 8, size - 8, 10); g.fill();
      if (isOpen) this.label(g, x + size / 2, y + size / 2, '💎', size * 0.5, '#7cff6b', UI);
      else if (isMine) this.label(g, x + size / 2, y + size / 2, '💣', size * 0.5, '#fff', UI);
    }
    const rx = W - 100;
    this.label(g, rx, 70, `${(s.mult || 1).toFixed(2)}×`, 40, '#7cff6b');
    this.label(g, rx, 115, `${s.mines || this.minesSel} Minen`, 22, '#b9a8d0', UI);
    if (s.phase === 'play') this.label(g, rx, 160, `nächstes: ${minesMult(s.mines, (s.open?.length || 0) + 1).toFixed(2)}×`, 18, '#ffd97a', UI);
    if (s.phase === 'done') this.label(g, rx, H - 60, s.hit !== null && s.hit !== undefined ? 'BOOM!' : 'GEWINN!', 30, s.hit !== null && s.hit !== undefined ? '#ff4d4d' : '#7cff6b');
  }
  animating() { return performance.now() - (this.boomT || 0) < 700; }
  onChange(s, prev) {
    if (prev && prev.hit === null && s.hit !== null && s.hit !== undefined) {
      this.boomT = performance.now();
      if (this.vol() > 0.05) sfxAt(this.vol(), () => sfx.explosion());
      if (this.near()) this.app.world.particles?.emit && this.burst();
    } else if (prev && (s.open?.length || 0) > (prev.open?.length || 0) && this.vol() > 0.05) sfxAt(this.vol(), () => sfx.pop());
  }
  burst() { const p = this.toWorld(new THREE.Vector3(0, 1.65, 0.4)); for (let i = 0; i < 26; i++) this.app.world.particles.emit({ pos: p.clone(), vel: [(Math.random() - 0.5) * 3, Math.random() * 2.5, Math.random() * 2], life: 0.9, size: 0.12, grow: 0.3, opacity: 0.9, color: i % 2 ? '#ff6b1a' : '#ffd60a', gravity: 3, additive: true }); }
  buildPanel() {
    this.grid = h('div.minegrid');
    return this.basePanel('💣 MINES', 'Felder öffnen: 💎 = Multiplikator steigt, 💣 = Einsatz weg. Jederzeit CASH OUT. Mehr Minen = schneller steigender Multiplikator.',
      [h('div.betrow', h('span', 'Minen:'), this.seg([1, 3, 5, 10, 20].map(n => [n, String(n)]), this.minesSel, v => { this.minesSel = v; this.dirty = true; })), this.grid]);
  }
  refreshPanel() {
    if (!this.panel) return;
    const s = this.s || {};
    const play = s.phase === 'play' && this.mine;
    clear(this.grid);
    const open = new Set(s.open || []), mines = new Set(s.board || []);
    for (let i = 0; i < MINES_TILES; i++) {
      const b = h('button.mtile', { class: open.has(i) ? 'open' : mines.has(i) ? 'mine' : '', onclick: () => { if (play && !open.has(i)) this.act(`pick:${i}`); } }, open.has(i) ? '💎' : mines.has(i) ? '💣' : '');
      b.disabled = !play || open.has(i);
      this.grid.append(b);
    }
    clear(this.actions);
    if (play) {
      const c = actionButton(`CASH OUT ${fmtMoney(Math.floor(s.bet * s.mult))}`, () => this.act('cash'), 'primary big');
      c.disabled = !(s.open?.length);
      this.actions.append(c);
      this.statusEl.textContent = `${s.mult.toFixed(2)}× · nächstes Feld ${minesMult(s.mines, s.open.length + 1).toFixed(2)}×`;
    } else {
      this.actions.append(actionButton('START', () => this.start({ mines: this.minesSel }), 'primary big'));
      this.statusEl.textContent = s.phase === 'done' ? (s.hit !== null && s.hit !== undefined ? 'Mine erwischt' : 'Ausgecasht') : 'Bereit';
    }
  }
  onKey(code) { if (code === 'Space') { if (this.s?.phase === 'play') this.act('cash'); else this.start({ mines: this.minesSel }); return true; } return false; }
}

// ───────────────────────── DRAGON TOWER ─────────────────────────
class TowerView extends ArcadeView {
  constructor(app, def, floor) { super(app, def, floor, { h: 2.8, screenW: 1.1, screenH: 1.6, screenY: 1.85, lookY: 1.8 }); this.mode = 'easy'; }
  draw(g, W, H) {
    const s = this.s || {};
    const mode = s.mode || this.mode, d = TOWER_MODES[mode];
    const lh = (H - 90) / TOWER_LEVELS, tw = (W - 80) / d.tiles;
    for (let lv = 0; lv < TOWER_LEVELS; lv++) {
      const y = H - 40 - (lv + 1) * lh;
      const cur = s.phase === 'play' && lv === s.level;
      this.label(g, 30, y + lh / 2, `${towerMult(mode, lv + 1).toFixed(1)}×`, 15, cur ? '#ffd97a' : '#7a6a90', UI, 'left');
      for (let t = 0; t < d.tiles; t++) {
        const x = 70 + t * tw;
        const safeReveal = s.board?.[lv]?.includes(t);
        const failHere = s.fail?.level === lv && s.fail.tile === t;
        g.fillStyle = failHere ? '#ff2e2e' : lv < s.level && s.picks?.[lv] === t ? '#1f7a3a' : cur ? '#3a2a60' : s.board ? (safeReveal ? '#183a24' : '#3a1414') : '#221a33';
        g.beginPath(); g.roundRect(x + 4, y + 3, tw - 8, lh - 6, 8); g.fill();
        if (failHere) this.label(g, x + tw / 2, y + lh / 2, '🐉', lh * 0.6, '#fff', UI);
        else if (lv < s.level && s.picks?.[lv] === t) this.label(g, x + tw / 2, y + lh / 2, '🥚', lh * 0.55, '#fff', UI);
        else if (s.board && !safeReveal) this.label(g, x + tw / 2, y + lh / 2, '🐉', lh * 0.45, '#ff9f43', UI);
      }
    }
    this.label(g, W / 2, 26, `${(s.mult || 1).toFixed(2)}× · ${TOWER_MODES[mode].name}`, 26, '#ffd97a');
  }
  onChange(s, prev) {
    if (prev && s.level > prev.level && this.vol() > 0.05) sfxAt(this.vol(), () => sfx.ding());
    if (prev && !prev.fail && s.fail && this.vol() > 0.05) sfxAt(this.vol(), () => sfx.explosion());
  }
  buildPanel() {
    this.tiles = h('div.towerrow');
    return this.basePanel('🐉 DRAGON TOWER', 'Klettere Ebene für Ebene: wähle ein Feld – Ei = weiter, Drache = Einsatz weg. Nach jeder Ebene auscashen möglich. Die oberste Ebene gibt einen Extra-Bonus.',
      [h('div.betrow', h('span', 'Schwierigkeit:'), this.seg(Object.entries(TOWER_MODES).map(([k, v]) => [k, v.name]), this.mode, v => { this.mode = v; this.dirty = true; })), this.tiles]);
  }
  refreshPanel() {
    if (!this.panel) return;
    const s = this.s || {};
    const play = s.phase === 'play' && this.mine;
    clear(this.tiles);
    if (play) for (let t = 0; t < TOWER_MODES[s.mode].tiles; t++) this.tiles.append(actionButton(`Feld ${t + 1}`, () => this.act(`pick:${t}`), 'big'));
    clear(this.actions);
    if (play) {
      const c = actionButton(`CASH OUT ${fmtMoney(Math.floor(s.bet * s.mult))}`, () => this.act('cash'), 'primary big');
      c.disabled = !s.level;
      this.actions.append(c);
      this.statusEl.textContent = `Ebene ${s.level + 1}/${TOWER_LEVELS} · nächste ${towerMult(s.mode, s.level + 1).toFixed(2)}×`;
    } else {
      this.actions.append(actionButton('TURM BETRETEN', () => this.start({ mode: this.mode }), 'primary big'));
      this.statusEl.textContent = s.fail ? `Drache auf Ebene ${s.fail.level + 1}` : s.phase === 'done' ? 'Ausgecasht' : 'Bereit';
    }
  }
  onKey(code) {
    const s = this.s;
    if (s?.phase === 'play') { const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[code]; if (n !== undefined && n < TOWER_MODES[s.mode].tiles) { this.act(`pick:${n}`); return true; } if (code === 'Space') { this.act('cash'); return true; } }
    else if (code === 'Space') { this.start({ mode: this.mode }); return true; }
    return false;
  }
}

// ───────────────────────── PENGUIN CROSS ─────────────────────────
class PenguinView extends ArcadeView {
  constructor(app, def, floor) { super(app, def, floor, { screenH: 1.05, screenY: 1.65 }); this.mode = 'easy'; }
  draw(g, W, H, t) {
    const s = this.s || {};
    const mode = s.mode || this.mode;
    const lw = (W - 120) / (PENGUIN_LANES + 1);
    for (let i = 0; i <= PENGUIN_LANES; i++) {
      const x = 60 + i * lw;
      g.fillStyle = i === 0 ? '#dff6ff' : i % 2 ? '#2a5a8a' : '#24507a';
      g.fillRect(x, 60, lw - 2, H - 120);
      if (i > 0) {
        this.label(g, x + lw / 2, 40, `${penguinMult(mode, i).toFixed(1)}×`, 16, i <= (s.lane || 0) ? '#7cff6b' : '#b9a8d0', UI);
        // Eisschollen / Robben als Gefahr
        const yy = 80 + ((t * 60 * (0.6 + (i % 3) * 0.3) + i * 70) % (H - 160));
        this.label(g, x + lw / 2, yy, i === s.fail ? '💦' : '🦭', 26, '#fff', UI);
      }
    }
    const lane = s.fail ? s.fail : s.lane || 0;
    const k = Math.min(1, (performance.now() - (this.moveT || 0)) / 400);
    const fromX = 60 + ((this.prevLane ?? lane) + 0.5) * lw, toX = 60 + (lane + 0.5) * lw;
    const px = fromX + (toX - fromX) * ease.outCubic(k);
    this.label(g, px, H / 2 - Math.sin(k * Math.PI) * 30, s.fail ? '😵' : '🐧', 44, '#fff', UI);
    this.label(g, W / 2, H - 30, `${(s.mult || 1).toFixed(2)}× · ${PENGUIN_MODES[mode].name}`, 24, s.fail ? '#ff4d4d' : '#ffd97a');
  }
  animating() { return this.near(); }
  onChange(s, prev) {
    if (prev && (s.lane !== prev.lane || (!prev.fail && s.fail))) { this.prevLane = prev.lane; this.moveT = performance.now(); if (this.vol() > 0.05) sfxAt(this.vol(), () => (s.fail ? sfx.aww() : sfx.boing())); }
    if (prev && prev.roundId !== s.roundId) { this.prevLane = 0; this.moveT = 0; }
  }
  buildPanel() {
    return this.basePanel('🐧 PENGUIN CROSS', 'Bring den Pinguin über die Eisbahnen. Jeder geschaffte Abschnitt erhöht den Multiplikator – WEITER oder CASH OUT. Erwischt = Einsatz weg.',
      [h('div.betrow', h('span', 'Schwierigkeit:'), this.seg(Object.entries(PENGUIN_MODES).map(([k, v]) => [k, v.name]), this.mode, v => { this.mode = v; this.dirty = true; }))]);
  }
  refreshPanel() {
    if (!this.panel) return;
    const s = this.s || {};
    clear(this.actions);
    if (s.phase === 'play' && this.mine) {
      this.actions.append(actionButton(`WEITER (${penguinMult(s.mode, s.lane + 1).toFixed(2)}×)`, () => this.act('go'), 'big'));
      const c = actionButton(`CASH OUT ${fmtMoney(Math.floor(s.bet * s.mult))}`, () => this.act('cash'), 'primary big');
      c.disabled = !s.lane;
      this.actions.append(c);
      this.statusEl.textContent = `Abschnitt ${s.lane}/${PENGUIN_LANES} · ${s.mult.toFixed(2)}×`;
    } else {
      this.actions.append(actionButton('LOS GEHT’S', () => this.start({ mode: this.mode }), 'primary big'));
      this.statusEl.textContent = s.fail ? `Erwischt auf Abschnitt ${s.fail}` : s.phase === 'done' ? 'Ausgecasht' : 'Bereit';
    }
  }
  onKey(code) {
    const s = this.s;
    if (s?.phase === 'play') { if (code === 'KeyW' || code === 'ArrowUp' || code === 'Enter') { this.act('go'); return true; } if (code === 'Space') { this.act('cash'); return true; } }
    else if (code === 'Space') { this.start({ mode: this.mode }); return true; }
    return false;
  }
}

// ───────────────────────── KENO ─────────────────────────
class KenoView extends ArcadeView {
  constructor(app, def, floor) { super(app, def, floor, { screenH: 1.05, screenY: 1.65 }); this.picks = []; this.resultDelay = 0; }
  shown() { const s = this.s; if (!s?.drawn?.length) return []; if (s.phase !== 'draw') return s.drawn; const n = Math.floor((performance.now() - (this.roundT0 || 0)) / 380); return s.drawn.slice(0, Math.min(KENO_DRAW, n)); }
  animating() { return this.s?.phase === 'draw'; }
  draw(g, W, H) {
    const s = this.s || {};
    const picks = new Set(s.phase !== 'idle' || s.picks?.length ? (this.mine || !this.picks.length ? s.picks || [] : this.picks) : this.picks);
    const drawn = new Set(this.shown());
    const cols = 8, cw = (W - 40) / cols, ch = (H - 110) / 5;
    for (let i = 1; i <= KENO_N; i++) {
      const x = 20 + ((i - 1) % cols) * cw, y = 20 + Math.floor((i - 1) / cols) * ch;
      const p = picks.has(i), d = drawn.has(i);
      g.fillStyle = p && d ? '#ffd60a' : d ? '#3a2a80' : p ? '#2a5a3a' : '#1c1830';
      g.beginPath(); g.roundRect(x + 3, y + 3, cw - 6, ch - 6, 8); g.fill();
      this.label(g, x + cw / 2, y + ch / 2, String(i), 24, p && d ? '#111' : '#fff', UI);
    }
    const hits = [...drawn].filter(n => picks.has(n)).length;
    this.label(g, W / 2, H - 45, s.drawn?.length ? `${hits} Treffer${s.phase === 'idle' ? ` · ${s.mult}×` : ''}` : 'Wähle 1–8 Zahlen', 30, '#ffd97a');
  }
  onChange(s, prev) { if (prev && prev.roundId !== s.roundId) { const v = this.vol(); for (let i = 0; i < KENO_DRAW; i++) setTimeout(() => { if (v > 0.05) sfxAt(v, () => sfx.ballTick?.() || sfx.pop()); this.refreshPanel(); }, i * 380); } }
  buildPanel() {
    this.board = h('div.kenogrid');
    this.payEl = h('div.phint');
    return this.basePanel('🔢 KENO', 'Wähle 1 bis 8 Zahlen. Es werden 10 von 40 Zahlen gezogen – je mehr Treffer, desto höher die Auszahlung.', [this.board, this.payEl]);
  }
  refreshPanel() {
    if (!this.panel) return;
    const s = this.s || {};
    const busy = !!this.state?.busy;
    const drawn = new Set(this.shown());
    clear(this.board);
    for (let i = 1; i <= KENO_N; i++) {
      const on = this.picks.includes(i);
      this.board.append(h('button.ktile', { class: [on ? 'on' : '', drawn.has(i) ? 'drawn' : ''].join(' '), disabled: busy ? true : null, onclick: () => { if (on) this.picks = this.picks.filter(n => n !== i); else if (this.picks.length < 8) this.picks.push(i); sfx.chip(); this.dirty = true; this.refreshPanel(); } }, String(i)));
    }
    const pays = KENO_PAYS[this.picks.length];
    this.payEl.textContent = pays ? 'Auszahlung: ' + pays.map((v, i) => v ? `${i} Treffer ${v}×` : null).filter(Boolean).join(' · ') : 'Noch keine Zahlen gewählt';
    clear(this.actions);
    this.actions.append(actionButton('Zufällig', () => { const pool = Array.from({ length: KENO_N }, (_, i) => i + 1).sort(() => Math.random() - 0.5); this.picks = pool.slice(0, Math.max(1, this.picks.length || 5)); this.dirty = true; this.refreshPanel(); }));
    this.actions.append(actionButton('Löschen', () => { this.picks = []; this.dirty = true; this.refreshPanel(); }));
    const go = actionButton(busy ? 'Ziehung läuft…' : 'ZIEHEN', () => { if (!this.picks.length) return this.app.ui.toast('Wähle mindestens eine Zahl', 'warn'); this.start({ picks: this.picks }); }, 'primary big');
    go.disabled = busy;
    this.actions.append(go);
    this.statusEl.textContent = busy ? `${drawn.size}/${KENO_DRAW} gezogen` : s.drawn?.length ? `${s.hits} Treffer · ${s.mult}×` : `${this.picks.length} Zahlen gewählt`;
  }
  onKey(code) { if (code === 'Space') { if (this.picks.length) this.start({ picks: this.picks }); return true; } return false; }
}

// ───────────────────────── PLINKO (3D) ─────────────────────────
class PlinkoView extends ArcadeView {
  constructor(app, def, floor) { super(app, def, floor, { w: 2.0, h: 3.0, noScreen: true, lookY: 1.95 }); this.risk = 'low'; this.resultDelay = 0; this.camLocal.set(0, 1.95, 2.6); }
  buildExtra() {
    const g = this.group;
    const board = mesh(new THREE.BoxGeometry(1.8, 2.0, 0.05), M.std('#140a24', 0.5, 0.1), 0, 1.95, 0.26);
    g.add(board);
    this.dx = 0.12; this.dy = 0.13; this.top = 2.75;
    const pinGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8);
    const pinMat = M.glow('#e8d9ff', 1.2);
    for (let r = 0; r < PLINKO_ROWS; r++) for (let i = 0; i <= r + 2; i++) {
      const p = new THREE.Mesh(pinGeo, pinMat);
      p.rotation.x = Math.PI / 2;
      p.position.set((i - (r + 2) / 2) * this.dx, this.top - (r + 1) * this.dy, 0.3);
      g.add(p);
    }
    // Fächer mit Multiplikator-Anzeige (wird je nach Risiko neu beschriftet)
    this.slotCanvas = document.createElement('canvas'); this.slotCanvas.width = 1024; this.slotCanvas.height = 96;
    this.slotTex = new THREE.CanvasTexture(this.slotCanvas); this.slotTex.colorSpace = THREE.SRGBColorSpace;
    const slots = new THREE.Mesh(new THREE.PlaneGeometry(13 * this.dx, 0.12), new THREE.MeshBasicMaterial({ map: this.slotTex, toneMapped: false }));
    slots.position.set(0, this.top - (PLINKO_ROWS + 1) * this.dy - 0.04, 0.3);
    slots.userData.noBake = true;
    g.add(slots);
    this.ball = mesh(new THREE.SphereGeometry(0.035, 16, 12), M.glow('#ffd60a', 1.5), 0, this.top, 0.32, { cast: false });
    this.ball.visible = false;
    this.ball.userData.noBake = true;
    g.add(this.ball);
    this.drawSlots('low');
  }
  drawSlots(risk, hit = -1) {
    const g = this.slotCanvas.getContext('2d'), w = 1024 / 13;
    g.clearRect(0, 0, 1024, 96);
    PLINKO_PAYS[risk].forEach((m, i) => {
      g.fillStyle = i === hit ? '#ffffff' : m >= 10 ? '#ff2e63' : m >= 2 ? '#ff9f43' : m >= 1 ? '#ffd60a' : '#5a4a80';
      g.beginPath(); g.roundRect(i * w + 3, 6, w - 6, 84, 10); g.fill();
      g.fillStyle = '#111'; g.font = `bold ${m >= 100 ? 26 : 32}px ${UI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${m}×`, i * w + w / 2, 48);
    });
    this.slotTex.needsUpdate = true;
  }
  onRound(s, prev) {
    if (!prev) { this.drawSlots(s.risk); return; }
    this.drawSlots(s.risk);
    // Kugel folgt exakt dem Server-Pfad: pro Reihe ein Abpraller nach links oder rechts
    const pts = [new THREE.Vector3(0, this.top + 0.05, 0.32)];
    let rights = 0;
    s.path.forEach((b, r) => { rights += b; pts.push(new THREE.Vector3((rights - (r + 1) / 2) * this.dx, this.top - (r + 1) * this.dy - 0.05, 0.32)); });
    pts.push(new THREE.Vector3((s.slot - PLINKO_ROWS / 2) * this.dx, this.top - (PLINKO_ROWS + 1) * this.dy, 0.32));
    this.ball.visible = true;
    const seg = 3.0 / (pts.length - 1);
    pts.slice(1).forEach((p, i) => {
      const a = pts[i];
      this.anim.add(seg, k => { this.ball.position.set(a.x + (p.x - a.x) * k, a.y + (p.y - a.y) * k * k + Math.sin(k * Math.PI) * 0.03, 0.32); }, () => { if (this.vol() > 0.05 && i < pts.length - 2) sfxAt(this.vol() * 0.6, () => sfx.ballTick?.()); if (i === pts.length - 2) { this.drawSlots(s.risk, s.slot); if (this.vol() > 0.05) sfxAt(this.vol(), () => (s.mult >= 2 ? sfx.coins() : sfx.reelStop())); } }, i * seg);
    });
  }
  buildPanel() {
    return this.basePanel('🔵 PLINKO', 'Die Kugel fällt durch 12 Reihen Pins und landet in einem Fach – der Multiplikator gilt für deinen Einsatz. Höheres Risiko = extremere Felder.',
      [h('div.betrow', h('span', 'Risiko:'), this.seg([['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']], this.risk, v => { this.risk = v; this.drawSlots(v); }))]);
  }
  refreshPanel() {
    if (!this.panel) return;
    const busy = !!this.state?.busy;
    clear(this.actions);
    const b = actionButton(busy ? 'Kugel fällt…' : 'KUGEL FALLEN LASSEN', () => this.start({ risk: this.risk }), 'primary big');
    b.disabled = busy;
    this.actions.append(b);
    const s = this.s || {};
    this.statusEl.textContent = busy ? 'Kugel fällt…' : s.roundId ? `Letztes Fach: ${s.mult}×` : 'Bereit';
  }
  onKey(code) { if (code === 'Space') { this.start({ risk: this.risk }); return true; } return false; }
}

// ───────────────────────── MONEY WHEEL (3D) ─────────────────────────
const MW_COLORS = { 0: '#2a2a3a', 0.5: '#5a4a80', 1: '#2a9d8f', 1.5: '#3a86ff', 2: '#ffd60a', 3: '#ff9f43', 5: '#ff3cac', 10: '#e63946', 25: '#ffd700' };
class MoneyWheelView extends ArcadeView {
  constructor(app, def, floor) { super(app, def, floor, { w: 2.4, h: 1.0, noScreen: true, lookY: 2.1 }); }
  buildExtra() {
    const g = this.group, N = MONEY_WHEEL.length;
    g.add(mesh(new THREE.BoxGeometry(0.2, 2.2, 0.2), M.gold(), 0, 1.6, -0.3));
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, 2.45, -0.1);
    g.add(this.wheel);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
    const x = c.getContext('2d');
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2;
      x.beginPath(); x.moveTo(512, 512); x.arc(512, 512, 500, a0, a1); x.closePath();
      x.fillStyle = MW_COLORS[MONEY_WHEEL[i]]; x.fill();
      x.strokeStyle = '#ffd97a'; x.lineWidth = 2; x.stroke();
      x.save(); x.translate(512, 512); x.rotate((a0 + a1) / 2);
      x.fillStyle = MONEY_WHEEL[i] >= 10 ? '#111' : '#fff'; x.font = `bold ${MONEY_WHEEL[i] >= 10 ? 30 : 24}px ${UI}`; x.textAlign = 'right'; x.textBaseline = 'middle';
      x.fillText(`${MONEY_WHEEL[i]}×`, 488, 0); x.restore();
    }
    x.fillStyle = '#1a0f05'; x.beginPath(); x.arc(512, 512, 90, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffd700'; x.font = `56px ${FONT}`; x.textAlign = 'center'; x.fillText('$', 512, 516);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.wheel.add(mesh(new THREE.CircleGeometry(1.15, 96), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }), 0, 0, 0.06, { cast: false }));
    this.wheel.add(mesh(new THREE.CylinderGeometry(1.19, 1.19, 0.1, 96), M.gold()).rotateX(Math.PI / 2));
    const tri = new THREE.Shape(); tri.moveTo(-0.08, 0.05); tri.lineTo(0.08, 0.05); tri.lineTo(0, -0.2); tri.closePath();
    this.pointer = mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: false }), M.std('#d90429', 0.3), 0, 2.45 + 1.28, 0.06);
    g.add(this.pointer);
    this.wheel.rotation.z = 0;
    this.lastSeg = -1;
  }
  segAt() { const N = MONEY_WHEEL.length; return ((Math.round(-this.wheel.rotation.z / (Math.PI * 2) * N - 0.5) % N) + N) % N; }
  angleFor(i) { const N = MONEY_WHEEL.length; return -((i + 0.5) / N) * Math.PI * 2; }
  onRound(s, prev) {
    if (!prev) { this.wheel.rotation.z = this.angleFor(s.result); return; }
    const start = this.wheel.rotation.z;
    let target = this.angleFor(s.result);
    while (target > start - Math.PI * 2 * 4) target -= Math.PI * 2;
    this.spinning = true;
    this.anim.add(6.0, k => { this.wheel.rotation.z = start + (target - start) * ease.outCubic(k); }, () => { this.spinning = false; this.wheel.rotation.z = target; });
  }
  update() {
    const seg = this.segAt();
    if (this.spinning && seg !== this.lastSeg) { this.pointer.rotation.z = 0.3; if (this.vol() > 0.1) sfx.wheelTick?.(0.04 * this.vol()); }
    this.lastSeg = seg;
    this.pointer.rotation.z *= 0.85;
  }
  buildPanel() { return this.basePanel('🎡 MONEY WHEEL', 'Setz einen Betrag, das Rad dreht sich – das Feld unter dem Zeiger multipliziert deinen Einsatz (0× bis 25×).'); }
  refreshPanel() {
    if (!this.panel) return;
    const busy = !!this.state?.busy;
    clear(this.actions);
    const b = actionButton(busy ? 'Rad dreht…' : 'RAD DREHEN', () => this.start(), 'primary big');
    b.disabled = busy;
    this.actions.append(b);
    const s = this.s || {};
    this.statusEl.textContent = busy ? 'Rad dreht…' : s.history?.length ? `Zuletzt: ${s.history.slice(0, 5).map(v => v + '×').join(' · ')}` : 'Bereit';
  }
  onKey(code) { if (code === 'Space') { this.start(); return true; } return false; }
}

// ───────────────────────── DUCK RACE (3D) ─────────────────────────
class DuckView extends ArcadeView {
  constructor(app, def, floor) { super(app, def, floor, { w: 3.2, h: 1.0, noScreen: true, lookY: 1.1 }); this.pick = 0; this.camLocal.set(0, 1.9, 1.6); }
  buildExtra() {
    const g = this.group;
    this.trackLen = 2.6;
    const water = mesh(new THREE.BoxGeometry(3.0, 0.06, 0.9), new THREE.MeshStandardMaterial({ color: '#1e7fb8', roughness: 0.2, metalness: 0.1 }), 0, 1.03, -0.15, { cast: false });
    g.add(water);
    for (let i = 0; i <= DUCKS.length; i++) g.add(mesh(new THREE.BoxGeometry(3.0, 0.03, 0.02), M.std('#ffffff', 0.5), 0, 1.07, -0.6 + i * 0.18, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.05, 0.9), M.std('#ff2e63', 0.4), this.trackLen / 2, 1.08, -0.15, { cast: false }));
    const finish = neonSign('ZIEL', '#ff2e63', 0.6, 0.2); finish.position.set(this.trackLen / 2, 1.45, -0.6); g.add(finish);
    this.ducks = DUCKS.map((d, i) => {
      const dk = new THREE.Group();
      const yel = M.std(d.color, 0.5);
      const body = mesh(new THREE.SphereGeometry(0.07, 12, 10), yel, 0, 0, 0);
      body.scale.set(1.3, 0.9, 1);
      dk.add(body);
      const head = mesh(new THREE.SphereGeometry(0.045, 10, 8), yel, 0.06, 0.07, 0);
      const beak = mesh(new THREE.ConeGeometry(0.02, 0.05, 8), M.std('#ff7a1a', 0.5), 0.11, 0.065, 0); beak.rotation.z = -Math.PI / 2;
      dk.add(head, beak);
      dk.position.set(-this.trackLen / 2, 1.12, -0.51 + i * 0.18);
      dk.userData.noBake = true;
      g.add(dk);
      return dk;
    });
    this.boardCanvas = document.createElement('canvas'); this.boardCanvas.width = 512; this.boardCanvas.height = 240;
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas); this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.56), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
    board.position.set(0, 1.8, -0.6); board.userData.noBake = true; g.add(board);
    this.drawBoard();
  }
  drawBoard(text) {
    const g = this.boardCanvas.getContext('2d');
    g.fillStyle = '#07040f'; g.fillRect(0, 0, 512, 240);
    DUCKS.forEach((d, i) => {
      const y = 30 + i * 32;
      g.fillStyle = d.color; g.font = `bold 24px ${UI}`; g.textAlign = 'left'; g.fillText(`${i + 1}. ${d.name}`, 24, y);
      g.fillStyle = '#fff'; g.textAlign = 'right'; g.fillText(`${d.odds}×`, 488, y);
    });
    g.fillStyle = '#ffd97a'; g.font = `28px ${FONT}`; g.textAlign = 'center'; g.fillText(text || 'DUCK RACE', 256, 222);
    this.boardTex.needsUpdate = true;
  }
  onRound(s, prev) {
    if (!prev) return;
    this.race = { t0: performance.now(), track: s.track, winner: s.winner };
    this.drawBoard('START!');
    if (this.vol() > 0.05) sfxAt(this.vol(), () => sfx.ding());
  }
  update(dt, t) {
    const r = this.race;
    this.ducks.forEach((dk, i) => { dk.position.y = 1.12 + Math.sin(t * 6 + i) * 0.01; });
    if (!r) return;
    const T = 7.0, k = Math.min(1, (performance.now() - r.t0) / 1000 / T);
    const f = k * (DUCK_STEPS - 1);
    const i0 = Math.floor(f), i1 = Math.min(DUCK_STEPS - 1, i0 + 1), u = f - i0;
    this.ducks.forEach((dk, i) => {
      const tr = r.track[i];
      const p = (tr[i0] + (tr[i1] - tr[i0]) * u);
      dk.position.x = -this.trackLen / 2 + p * this.trackLen;
      dk.rotation.z = Math.sin(t * 12 + i) * 0.08;
    });
    if (k >= 1 && !r.done) { r.done = true; this.drawBoard(`🏆 ${DUCKS[r.winner].name}!`); if (this.vol() > 0.05) sfxAt(this.vol(), () => sfx.cheer?.() || sfx.ding()); }
  }
  buildPanel() {
    return this.basePanel('🦆 DUCK RACE', 'Setz auf eine Ente – gewinnt sie das Rennen, zahlt sie ihre Quote. Die Führung kann im Rennen mehrfach wechseln.',
      [h('div.betrow', h('span', 'Ente:'), this.seg(DUCKS.map((d, i) => [i, `${d.name} ${d.odds}×`]), this.pick, v => { this.pick = v; }))]);
  }
  refreshPanel() {
    if (!this.panel) return;
    const busy = !!this.state?.busy;
    clear(this.actions);
    const b = actionButton(busy ? 'Rennen läuft…' : 'RENNEN STARTEN', () => this.start({ pick: this.pick }), 'primary big');
    b.disabled = busy;
    this.actions.append(b);
    const s = this.s || {};
    this.statusEl.textContent = busy ? `Du setzt auf ${DUCKS[s.pick].name}` : s.history?.length ? `Letzter Sieger: ${DUCKS[s.history[0]].name}` : 'Bereit';
  }
  onKey(code) { if (code === 'Space') { this.start({ pick: this.pick }); return true; } return false; }
}

// ───────────────────────── STREET CRAPS (3D) ─────────────────────────
const DIE_ROT = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] };
class StreetCrapsView extends ArcadeView {
  constructor(app, def, floor) { super(app, def, floor, { w: 2.0, h: 0.9, noScreen: true, lookY: 0.95 }); this.pick = 'high'; this.camLocal.set(0, 1.85, 1.4); }
  buildExtra() {
    const g = this.group;
    g.add(mesh(new THREE.BoxGeometry(1.9, 0.05, 1.1), M.std('#0d5a2e', 0.9), 0, 0.93, -0.05, { cast: false }));
    for (const [x, z, w, d] of [[0, -0.6, 1.95, 0.08], [0, 0.5, 1.95, 0.08], [-0.97, -0.05, 0.08, 1.15], [0.97, -0.05, 0.08, 1.15]]) g.add(mesh(new THREE.BoxGeometry(w, 0.12, d), M.std('#3a1a0a', 0.5), x, 0.98, z));
    const mats = [3, 4, 1, 6, 2, 5].map(n => new THREE.MeshStandardMaterial({ map: diceFaceTexture(n, true), roughness: 0.3 }));
    this.dice = [0, 1].map(i => { const d = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mats); d.position.set(-0.15 + i * 0.3, 1.0, 0.1); d.castShadow = true; d.userData.noBake = true; g.add(d); return d; });
    const rules = document.createElement('canvas'); rules.width = 512; rules.height = 128;
    const x = rules.getContext('2d'); x.fillStyle = '#0d5a2e'; x.fillRect(0, 0, 512, 128); x.fillStyle = '#fff'; x.font = `bold 22px ${UI}`; x.textAlign = 'center';
    x.fillText('HOCH 8–12: 2.25× · TIEF 2–6: 2.25×', 256, 44); x.fillText('SIEBEN: 5.6× · PASCH: 5.6×', 256, 90);
    const t = new THREE.CanvasTexture(rules); t.colorSpace = THREE.SRGBColorSpace;
    const plate = mesh(new THREE.PlaneGeometry(1.3, 0.32), new THREE.MeshBasicMaterial({ map: t }), 0, 0.957, -0.35, { cast: false }); plate.rotation.x = -Math.PI / 2; g.add(plate);
    this.showDice([3, 4]);
  }
  showDice(v) { v.forEach((n, i) => { const r = DIE_ROT[n]; this.dice[i].rotation.set(r[0], r[1], r[2]); this.dice[i].position.set(-0.15 + i * 0.3, 1.0, 0.1); }); }
  onRound(s, prev) {
    if (!prev) { this.showDice(s.dice); return; }
    // Wurf von vorne über den Tisch, Endlage zeigt exakt die Server-Augen
    this.dice.forEach((d, i) => {
      const from = new THREE.Vector3(-0.5 + i * 0.2, 1.35, 0.45), to = new THREE.Vector3(-0.15 + i * 0.32, 1.0, -0.15 + i * 0.08);
      const r = DIE_ROT[s.dice[i]], spin = [6 + i * 2, 4 + i, 5 - i];
      this.anim.add(1.6, k => {
        const e = ease.outCubic(k);
        d.position.lerpVectors(from, to, e);
        d.position.y = 1.0 + Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * 0.3;
        d.rotation.set(r[0] + spin[0] * (1 - e) * Math.PI, r[1] + spin[1] * (1 - e) * Math.PI, r[2] + spin[2] * (1 - e) * Math.PI);
      }, () => { d.rotation.set(r[0], r[1], r[2]); if (i === 1 && this.vol() > 0.05) sfxAt(this.vol(), () => sfx.diceHit?.()); });
    });
    if (this.vol() > 0.05) sfxAt(this.vol(), () => sfx.dice?.());
  }
  buildPanel() {
    return this.basePanel('🎲 STREET CRAPS', 'Ein Wurf, zwei Würfel. HOCH = Summe 8–12, TIEF = Summe 2–6 (je 2.25×), SIEBEN = Summe 7, PASCH = zwei gleiche Augen (je 5.6×). Alles andere verliert.',
      [h('div.betrow', h('span', 'Tipp:'), this.seg(Object.entries(STREET_BETS).map(([k, v]) => [k, `${v.name} ${v.pays}×`]), this.pick, v => { this.pick = v; }))]);
  }
  refreshPanel() {
    if (!this.panel) return;
    const busy = !!this.state?.busy;
    clear(this.actions);
    const b = actionButton(busy ? 'Würfel rollen…' : 'WÜRFELN', () => this.start({ pick: this.pick }), 'primary big');
    b.disabled = busy;
    this.actions.append(b);
    const s = this.s || {};
    this.statusEl.textContent = busy ? 'Würfel rollen…' : s.roundId ? `Letzter Wurf: ${s.dice[0]} + ${s.dice[1]} = ${s.dice[0] + s.dice[1]}` : 'Bereit';
  }
  onKey(code) { if (code === 'Space') { this.start({ pick: this.pick }); return true; } return false; }
}

export const ARCADE_VIEWS = {
  crash: CrashView, hilo: HiloView, mines: MinesView, tower: TowerView, penguin: PenguinView,
  keno: KenoView, plinko: PlinkoView, moneywheel: MoneyWheelView, duck: DuckView, streetcraps: StreetCrapsView,
};
// Breite an der Wand (für die Platzierung im Raum)
export const ARCADE_WIDTH = { crash: 2.1, hilo: 1.7, mines: 1.7, tower: 1.7, penguin: 1.7, keno: 1.7, plinko: 2.2, moneywheel: 2.6, duck: 3.4, streetcraps: 2.2 };
export { fmtShort };
