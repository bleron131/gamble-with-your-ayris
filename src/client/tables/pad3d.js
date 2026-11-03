// Einheitliches 3D-Einsatzpult (Prompt 12/14) – „Das Casino selbst ist das Interface“.
// Prompt 14: freistehendes Terminal mit Standfuss auf dem Boden neben der Station, Panel auf Augenhöhe,
// deutlich grössere Tasten/Display; die Spielaktionen liegen als physische Knopfleiste direkt an der Station.
// Jede Station (Tisch, Automat, Arcade-Maschine) hat rechts/unten-rechts ein physisches Pult mit:
//  • Display:  MIN: $…  MAX: $…  und dem grossen aktuellen Einsatz
//  • Ziffernblock 1–9, C, 0, 000 und Schnellwahl MIN, 1/4, 1/2, MAX (Anteil vom verfügbaren Team-Pot, in den Limits)
//  • grossen, beleuchteten Aktionsknöpfen (DEAL, HIT, CASH OUT, Modus …) direkt am Pult
// Die Aktionsknöpfe werden aus der (unsichtbaren) Spiellogik-Leiste der Station gespiegelt: Sichtbarkeit,
// Beschriftung und Aktivierung kommen 1:1 aus dem Spielzustand, ein Klick löst dieselbe Aktion aus.
// Kompatibel zu BetAmount/ChipPicker: .value, .set(), .limits, .refresh(), .el
import * as THREE from 'three';
import { M, mesh } from '../world/props.js';
import { fmtMoney } from '../../shared/config.js';
import { sfx } from '../audio.js';

// Prompt 14: freistehendes Terminal, deutlich grössere Tasten und Display (≈1.7×)
const KEY_W = 0.15, KEY_H = 0.105, GAP = 0.02, MARGIN = 0.04, DISP_H = 0.25;
const COLS = 4;
const INNER_W = COLS * KEY_W + (COLS - 1) * GAP;
const PAD_W = INNER_W + MARGIN * 2;
const SEG_H = 0.085;
const RAIL_W = 0.27, RAIL_H = 0.135, RAIL_BIG = 0.36;
export const KIOSK = { top: 1.82, half: 0.42, gap: 0.3 }; // Oberkante Panel, halbe Breite, Abstand zur Station
const KEYS = [['7', '8', '9', 'MIN'], ['4', '5', '6', '1/4'], ['1', '2', '3', '1/2'], ['C', '0', '000', 'MAX']];
const QUICK = new Set(['MIN', '1/4', '1/2', 'MAX']);

const keyGeo = new THREE.BoxGeometry(1, 1, 0.022);
keyGeo.translate(0, 0, 0.011);
keyGeo.userData.shared = true;

// Beschriftete Kappe (Canvas) – Ziffern teilen sich die Materialien über alle Pulte
const capCache = new Map();
function drawCap(canvas, label, color, sub) {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d');
  const c = new THREE.Color(color);
  const dark = c.clone().multiplyScalar(0.42).getStyle(), light = c.clone().lerp(new THREE.Color('#ffffff'), 0.35).getStyle();
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, light); grd.addColorStop(0.5, c.getStyle()); grd.addColorStop(1, dark);
  g.clearRect(0, 0, W, H);
  g.fillStyle = grd;
  g.beginPath(); g.roundRect(3, 3, W - 6, H - 6, H * 0.22); g.fill();
  g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.stroke();
  const bright = c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.62;
  g.fillStyle = bright ? '#120d05' : '#ffffff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const fit = (txt, size, max, font) => { g.font = `${size}px ${font}`; while (g.measureText(txt).width > max && size > 12) { size -= 2; g.font = `${size}px ${font}`; } };
  if (sub) {
    fit(label, H * 0.42, W * 0.9, '"Bungee", Impact, sans-serif'); g.fillText(label, W / 2, H * 0.38);
    fit(sub, H * 0.26, W * 0.9, 'bold "Nunito", Arial, sans-serif'); g.fillText(sub, W / 2, H * 0.74);
  } else { fit(label, H * 0.56, W * 0.88, '"Bungee", Impact, sans-serif'); g.fillText(label, W / 2, H * 0.53); }
}
function capMaterial(label, color, w, h, shared) {
  const key = `${label}|${color}|${(w / h).toFixed(2)}`;
  if (shared && capCache.has(key)) return capCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = Math.max(48, Math.round(256 * h / w));
  drawCap(canvas, label, color);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.2, roughness: 0.45, transparent: true });
  const side = M.std(new THREE.Color(color).multiplyScalar(0.35), 0.5);
  const mats = [side, side, side, side, face, side];
  const out = { mats, face, canvas, tex };
  if (shared) capCache.set(key, out);
  return out;
}

// Farbe eines gespiegelten Knopfs aus seiner Klasse ableiten
function colorFor(b, label) {
  if (b.style.background) return b.style.background;
  const c = b.classList;
  if (c.contains('item')) return '#9d4edd';
  if (c.contains('red')) return '#e63946';
  if (c.contains('blue')) return '#3a86ff';
  if (c.contains('green')) return '#2a9d8f';
  if (c.contains('black')) return '#2b2b33';
  if (b.parentElement?.classList.contains('seg')) return c.contains('sel') ? '#ffd60a' : '#56566e';
  if (/CASH|NEHMEN/.test(label)) return '#ff9f1c';
  if (c.contains('primary')) return '#2ecc71';
  return '#4a7fd0';
}

function cleanLabel(t) {
  t = t.replace(/\s+/g, ' ').trim().replace(/\s*\((?:[A-Z]|LEERTASTE)\)\s*$/, '');
  const m = t.match(/^(.*?)\s*\((.+)\)$/);
  if (m && m[1]) return { label: m[1], sub: m[2] };
  const cash = t.match(/^(CASH OUT|GEWINN NEHMEN)\s+(.+)$/);
  if (cash) return { label: cash[1], sub: cash[2] };
  return { label: t, sub: '' };
}

export class Pad3D {
  constructor(view, opts = {}) {
    this.view = view;
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.name = 'pad3d';
    this.group.userData.noBake = true; // Terminal ändert Knöpfe zur Laufzeit → nie zusammenfassen
    // Freistehendes Terminal (Standfuss auf dem Boden, Panel auf Augenhöhe) und Aktionsleiste an der Station
    this.kiosk = new THREE.Group();
    this.face = new THREE.Group();
    this.kiosk.add(this.face);
    this.rail = new THREE.Group();
    this.group.add(this.kiosk, this.rail);
    this.raw = null;          // gewünschter Einsatz (null = Minimum)
    this.typing = '';         // laufende Eingabe über den Ziffernblock
    this.keys = [];           // Ziffern + Schnellwahl
    this.acts = [];           // gespiegelte Knöpfe (Optionen am Terminal, Aktionen an der Leiste)
    this.sig = '';
    this.syncT = 0;
    this.hovered = null;
    this.el = document.createElement('div'); // Platzhalter für alte Panel-Layouts (wird nie angezeigt)
    this.el.style.display = 'none';
    this.build();
  }

  // ── BetAmount-/ChipPicker-kompatible Schnittstelle ──
  get limits() { return this.view.limits; }
  set limits(_) { this.refresh(); }
  get pot() { return Math.max(0, this.view.app.pot || 0); }
  get value() {
    const l = this.limits;
    const v = this.raw === null ? l.min : this.raw;
    return Math.max(l.min, Math.min(l.max, Math.floor(v)));
  }
  set(v, { silent = false } = {}) {
    this.raw = Math.floor(+v || 0);
    this.typing = '';
    this.refresh();
    if (!silent) this.changed();
  }
  render() {}
  refresh() { this.drawDisplay(); }
  changed() {
    if (!this.opts.onChange) return;
    clearTimeout(this.commitT);
    this.commitT = setTimeout(() => this.opts.onChange(this.value), this.opts.delay || 260);
  }

  // ── Aufbau ──
  build() {
    const f = this.face, k = this.kiosk;
    const dark = M.std('#15121f', 0.35, 0.5), metal = M.std('#9a9aac', 0.25, 0.9);
    // Gehäuse hinter dem Panel (Höhe passt sich an), dicke Säule, schwerer Standfuss
    this.housing = mesh(new THREE.BoxGeometry(1, 1, 0.09), dark, 0, 0, -0.05, { cast: true });
    this.rim = mesh(new THREE.BoxGeometry(1, 1, 0.02), M.glow(this.opts.color || '#2bd9fe', 1.2), 0, 0, -0.1, { cast: false });
    f.add(this.housing, this.rim);
    this.column = mesh(new THREE.BoxGeometry(0.16, 1, 0.12), metal, 0, 0.5, -0.06);
    this.foot = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.06, 28), M.std('#22202c', 0.4, 0.6), 0, 0.03, 0);
    this.footRing = mesh(new THREE.TorusGeometry(0.32, 0.012, 6, 32), M.glow(this.opts.color || '#2bd9fe', 1.4), 0, 0.062, 0, { cast: false });
    this.footRing.rotation.x = Math.PI / 2;
    k.add(this.column, this.foot, this.footRing);
    // Display (oben, auf Augenhöhe)
    this.dcanvas = document.createElement('canvas');
    this.dcanvas.width = 768; this.dcanvas.height = Math.round(768 * DISP_H / INNER_W);
    this.dtex = new THREE.CanvasTexture(this.dcanvas);
    this.dtex.colorSpace = THREE.SRGBColorSpace;
    this.display = new THREE.Mesh(new THREE.PlaneGeometry(INNER_W, DISP_H), new THREE.MeshBasicMaterial({ map: this.dtex, toneMapped: false }));
    this.display.position.set(0, -MARGIN - DISP_H / 2, 0.002);
    f.add(this.display);
    // Ziffernblock + Schnellwahl
    const top = -MARGIN - DISP_H - GAP * 1.5;
    KEYS.forEach((row, r) => row.forEach((lbl, c) => {
      const color = QUICK.has(lbl) ? '#ffb703' : lbl === 'C' ? '#e63946' : '#3d3d5c';
      const cap = capMaterial(lbl, color, KEY_W, KEY_H, true);
      const mats = cap.mats.slice(); mats[4] = cap.face.clone(); // eigenes Material je Taste (Hover-Leuchten)
      const m = new THREE.Mesh(keyGeo, mats);
      m.scale.set(KEY_W, KEY_H, 1.4);
      m.position.set(-INNER_W / 2 + KEY_W / 2 + c * (KEY_W + GAP), top - KEY_H / 2 - r * (KEY_H + GAP), 0);
      const key = { mesh: m, label: lbl, t: 0, kind: 'key' };
      m.userData.padKey = key;
      if (this.opts.walkUp) m.userData.slotButton = { label: () => this.keyLabel(lbl), action: () => this.press(key), padKey: key };
      f.add(m);
      this.keys.push(key);
    }));
    this.keysBottom = top - 4 * KEY_H - 3 * GAP;
    this.optGroup = new THREE.Group();
    f.add(this.optGroup);
    // Aktionsleiste (PLAY, HIT, CASH OUT …) – physische Knöpfe direkt an der Station
    this.railPlate = mesh(new THREE.BoxGeometry(1, 1, 0.03), M.std('#0d0b14', 0.4, 0.4), 0, 0, -0.018, { cast: false });
    this.railPlate.visible = false;
    this.rail.add(this.railPlate);
    this.actGroup = new THREE.Group();
    this.rail.add(this.actGroup);
    this.layout();
    this.drawDisplay();
  }

  keyLabel(k) {
    if (k === 'C') return 'C – Eingabe löschen';
    if (k === 'MIN') return `MIN – ${fmtMoney(this.limits.min)}`;
    if (k === 'MAX') return `MAX – ${fmtMoney(Math.min(this.limits.max, this.pot))}`;
    if (k === '1/4' || k === '1/2') return `${k} vom Pot – ${fmtMoney(this.quick(k))}`;
    return `Ziffer ${k}`;
  }
  quick(k) {
    const l = this.limits, pot = this.pot;
    const v = k === 'MIN' ? l.min : k === 'MAX' ? Math.min(l.max, pot) : Math.floor(pot * (k === '1/4' ? 0.25 : 0.5));
    return Math.max(l.min, Math.min(l.max, v));
  }

  // Taste drücken (Klick, Tippen oder Tastatur)
  press(key) {
    if (!this.usable()) { sfx.denied(); return; }
    key.t = 0.22;
    this.settle = 0.6;
    const k = key.label;
    if (key.kind === 'act') { sfx.button(); key.el?.click(); this.syncT = 0.05; return; }
    if (QUICK.has(k)) { sfx.chip(); this.set(this.quick(k)); this.flash(); return; }
    sfx.click();
    if (k === 'C') { this.typing = ''; this.raw = 0; this.refresh(); this.changed(); return; }
    let t = this.typing || '';
    if (k === '000') t = (t || String(this.value)) + '000';
    else t += k;
    t = t.replace(/^0+(?=\d)/, '').slice(0, 13);
    this.typing = t;
    this.raw = +t || 0;
    this.refresh();
    this.changed();
  }
  pressLabel(k) { const key = this.keys.find(x => x.label === k); if (key) this.press(key); }
  usable() { return this.opts.walkUp || this.view.app.player?.seated === this.view; }
  flash() { this.flashT = 0.35; }

  // Anzeigen
  drawDisplay() {
    const g = this.dcanvas.getContext('2d'), W = this.dcanvas.width, H = this.dcanvas.height;
    const l = this.limits;
    if (!l) return;
    const status = this.status || '';
    const typed = this.typing;
    const shown = typed ? +typed : this.raw === null ? l.min : this.raw;
    const out = shown < l.min || shown > l.max;
    const v = this.value;
    const key = [l.min, l.max, shown, v, status, this.flashT > 0, this.pot >= v].join('|');
    if (key === this.dkey) return;
    this.dkey = key;
    g.fillStyle = '#04060c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = this.flashT > 0 ? '#ffffff' : '#2bd9fe'; g.lineWidth = 7; g.strokeRect(5, 5, W - 10, H - 10);
    g.textBaseline = 'middle';
    g.font = 'bold 34px "Nunito", Arial'; g.fillStyle = '#9fefff';
    g.textAlign = 'left'; g.fillText(`MIN ${fmtMoney(l.min)}`, 22, 34);
    g.textAlign = 'right'; g.fillText(`MAX ${fmtMoney(l.max)}`, W - 22, 34);
    let txt = fmtMoney(shown);
    let size = 104;
    g.font = `${size}px "Bungee", Impact`;
    while (g.measureText(txt).width > W - 40 && size > 24) { size -= 3; g.font = `${size}px "Bungee", Impact`; }
    g.textAlign = 'center';
    g.fillStyle = out ? '#ff6b6b' : v > this.pot ? '#ff9f1c' : '#ffe066';
    g.fillText(txt, W / 2, H * 0.53);
    g.font = 'bold 28px "Nunito", Arial';
    g.fillStyle = out ? '#ff9a9a' : '#c9b8e8';
    const line = out ? `wird zu ${fmtMoney(v)}` : status || (v > this.pot ? 'Nicht genug im Team-Pot' : 'EINSATZ');
    g.fillText(line.length > 44 ? line.slice(0, 43) + '…' : line, W / 2, H - 28);
    this.dtex.needsUpdate = true;
  }

  // ── Gespiegelte Knöpfe: Optionen ans Terminal, Aktionen an die Leiste der Station ──
  attach(panel) { this.panel = panel; this.sig = ''; this.sync(true); }
  detach() { this.panel = null; this.sig = ''; this.setActions([], []); this.status = ''; this.refresh(); }

  visibleIn(b) {
    for (let e = b; e && e !== this.panel; e = e.parentElement) {
      if (e.style?.display === 'none' || e.hidden || e.classList?.contains('hidden')) return false;
    }
    return true;
  }

  collect() {
    const p = this.panel;
    const opts = [], acts = [];
    if (!p) return { opts, acts };
    for (const b of p.querySelectorAll('button')) {
      if (b.closest('.noMirror, .betamount, .chips, .mtile, .ktile') || b.classList.contains('mtile') || b.classList.contains('ktile')) continue;
      if (!this.visibleIn(b)) continue;
      const { label, sub } = cleanLabel(b.textContent || '');
      if (!label) continue;
      const it = { el: b, label, sub, color: colorFor(b, label), disabled: !!b.disabled, seg: b.parentElement?.classList.contains('seg') ? b.parentElement : null, big: b.classList.contains('big') && b.classList.contains('primary') };
      if (it.seg) {
        const last = opts[opts.length - 1];
        const lim = it.label.length + it.sub.length > 5 ? 3 : 5; // lange Beschriftungen: höchstens 3 pro Reihe
        if (last && last[0].seg === it.seg && last.length < lim) last.push(it); else opts.push([it]);
      } else acts.push(it);
    }
    return { opts, acts };
  }

  sync(force) {
    const status = this.view.statusText?.() ?? this.panel?.querySelector('.info')?.textContent ?? '';
    if (status !== this.status) { this.status = status; this.refresh(); }
    const { opts, acts } = this.usable() ? this.collect() : { opts: [], acts: [] };
    const sig = [...opts.flat(), null, ...acts].map(i => (i ? `${i.label}~${i.sub}~${i.color}~${i.disabled}` : '|')).join(',');
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.setActions(opts, acts);
  }

  // Knopf-Mesh wiederverwenden (nur Text/Farbe neu zeichnen)
  button(i, it, w, h, parent) {
    let a = this.acts[i];
    const ratio = (w / h).toFixed(2);
    if (!a || a.ratio !== ratio || a.parent !== parent) {
      if (a) { a.parent.remove(a.mesh); a.cap.tex.dispose(); a.cap.face.dispose(); }
      const cap = capMaterial('', it.color, w, h, false);
      const m = new THREE.Mesh(keyGeo, cap.mats);
      a = { mesh: m, cap, t: 0, kind: 'act', ratio, parent };
      m.userData.padKey = a;
      if (this.opts.walkUp) m.userData.slotButton = { label: () => a.label, action: () => this.press(a), padKey: a };
      parent.add(m);
      this.acts[i] = a;
    }
    const key = `${it.label}|${it.sub}|${it.color}|${it.disabled}|${ratio}`;
    if (a.key !== key) {
      a.key = key;
      drawCap(a.cap.canvas, it.label, it.disabled ? '#3a3a44' : it.color, it.sub);
      a.cap.tex.needsUpdate = true;
      a.cap.mats[0].color.set(new THREE.Color(it.color).multiplyScalar(0.35));
    }
    a.el = it.el; a.label = it.sub ? `${it.label} (${it.sub})` : it.label; a.disabled = it.disabled;
    a.mesh.scale.set(w, h, 1.4);
    return a;
  }

  setActions(opts, acts) {
    let i = 0;
    // Optionen (Minen, Schwierigkeit, Ente …) unter dem Ziffernblock
    let y = this.keysBottom - GAP * 1.8;
    for (const row of opts) {
      const w = (INNER_W - (row.length - 1) * GAP) / row.length;
      row.forEach((it, c) => { const a = this.button(i++, it, w, SEG_H, this.optGroup); a.mesh.position.set(-INNER_W / 2 + w / 2 + c * (w + GAP), y - SEG_H / 2, 0); });
      y -= SEG_H + GAP;
    }
    this.bottom = opts.length ? y + GAP : this.keysBottom;
    // Aktionen als Reihe grosser Knöpfe an der Station (höchstens 4 pro Reihe, Hauptaktion breiter)
    const rows = [];
    for (const it of acts) { const last = rows[rows.length - 1]; if (last && last.length < 4) last.push(it); else rows.push([it]); }
    let ry = 0, maxW = 0;
    rows.forEach(row => {
      const ws = row.map(it => (it.big ? RAIL_BIG : RAIL_W));
      const total = ws.reduce((p, q) => p + q, 0) + (row.length - 1) * GAP;
      maxW = Math.max(maxW, total);
      let x = -total / 2;
      row.forEach((it, c) => { const a = this.button(i++, it, ws[c], RAIL_H, this.actGroup); a.mesh.position.set(x + ws[c] / 2, ry - RAIL_H / 2, 0); x += ws[c] + GAP; });
      ry -= RAIL_H + GAP;
    });
    while (this.acts.length > i) { const a = this.acts.pop(); a.parent.remove(a.mesh); a.cap.tex.dispose(); a.cap.face.dispose(); }
    this.railPlate.visible = rows.length > 0;
    if (rows.length) { const hgt = -ry + GAP; this.railPlate.scale.set(maxW + 0.06, hgt + 0.04, 1); this.railPlate.position.set(0, -hgt / 2 + GAP / 2, -0.018); }
    this.layout();
  }

  layout() {
    const H = -(this.bottom ?? this.keysBottom) + MARGIN;
    this.housing.scale.set(PAD_W + 0.04, H + 0.04, 1);
    this.housing.position.y = -H / 2;
    this.rim.scale.set(PAD_W + 0.08, H + 0.08, 1);
    this.rim.position.y = -H / 2;
    this.height = H;
    // Panel hängt von der festen Oberkante nach unten, leicht nach hinten geneigt; Säule bis knapp unter das Panel
    this.face.position.set(0, KIOSK.top, 0.02);
    this.face.rotation.x = -0.16;
    const bottomY = KIOSK.top - H * Math.cos(0.16);
    this.column.scale.set(1, Math.max(0.3, bottomY + 0.05), 1);
    this.column.position.y = Math.max(0.3, bottomY + 0.05) / 2;
  }

  // Terminal neben der Station auf den Boden stellen, zur Spielposition gedreht; Leiste an die Station
  place() {
    const v = this.view, o = this.opts;
    const S = v.S || 1; // skalierte Maschinen: Terminal behält seine echte Grösse
    this.kiosk.scale.setScalar(1 / S);
    const kp = o.kiosk || v.kioskLocal?.() || new THREE.Vector3((v.footprint?.w || 2) / 2 + (KIOSK.gap + KIOSK.half) / S, 0, v.seatLocal.z - 0.95 / S);
    this.kiosk.position.set(kp.x, 0, kp.z);
    const target = o.faceTo || v.camLocal;
    this.kiosk.rotation.set(0, Math.atan2(target.x - kp.x, target.z - kp.z), 0);
    this.kioskLocal = kp;
    const rp = v.railLocal?.() || new THREE.Vector3(v.seatLocal.x + (v.railShift || 0), (v.tableTopY ?? 0.86) + 0.07, v.seatLocal.z - 0.38);
    this.rail.position.copy(rp);
    this.rail.rotation.set(v.railTilt ?? -1.0, 0, 0);
  }
  // Welt-Position des Terminals (für den Collider)
  kioskWorld() { return this.view.toWorld(new THREE.Vector3(this.kioskLocal.x, 0, this.kioskLocal.z)); }

  meshes() { return [...this.keys.map(k => k.mesh), ...this.acts.map(a => a.mesh)]; }

  hit(raycaster) {
    if (!this.group.visible) return null;
    const hits = raycaster.intersectObjects(this.meshes(), false);
    return hits[0]?.object.userData.padKey || null;
  }
  pick(raycaster) {
    const k = this.hit(raycaster);
    if (!k) return false;
    if (k.kind === 'act' && k.disabled) { sfx.denied(); return true; }
    this.press(k);
    return true;
  }
  hover(raycaster) {
    const k = this.hit(raycaster);
    this.hovered = k;
    if (!k) return null;
    return k.kind === 'act' ? k.label : this.keyLabel(k.label);
  }

  // Tastatur: Ziffern, Backspace = C
  onKey(code) {
    const d = code.match(/^(?:Digit|Numpad)(\d)$/);
    if (d) { this.pressLabel(d[1]); return true; }
    if (code === 'Backspace' || code === 'Delete' || code === 'NumpadDecimal') { this.pressLabel('C'); return true; }
    return false;
  }

  update(dt) {
    const app = this.view.app;
    const dist = app.distanceTo?.(this.view.group.position) ?? 0;
    const mine = app.player?.seated === this.view;
    // Performance: weit weg unsichtbar, mittlere Distanz ohne Tasten (wenige Draw Calls)
    const vis = mine || dist < 16;
    this.group.visible = vis;
    if (!vis) return;
    const detail = mine || dist < 8;
    if (detail !== this.detail) { this.detail = detail; for (const k of this.keys) k.mesh.visible = detail; this.optGroup.visible = this.actGroup.visible = detail; }
    if (mine && this.panel) { this.syncT -= dt; if (this.syncT <= 0) { this.syncT = 0.15; this.sync(); } }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.dkey = ''; this.drawDisplay(); } }
    else if ((this.potT = (this.potT || 0) + dt) > 0.5) { this.potT = 0; this.drawDisplay(); }
    // Hover-Highlight + Drück-Animation (nur in Reichweite: eigenes Terminal bzw. Automat direkt davor)
    const near = mine || (this.opts.walkUp && dist < 3);
    const hov = near ? (this.hovered || (this.opts.walkUp ? app.hoverButton?.padKey : null)) : null;
    if (hov !== this.lastHov) { this.lastHov = hov; this.settle = 0.6; }
    if (this.settle > 0) this.settle -= dt;
    if (!detail || (!mine && !(this.settle > 0) && !this.animating)) return;
    this.animating = false;
    for (const k of [...this.keys, ...this.acts]) {
      if (k.t > 0) { k.t = Math.max(0, k.t - dt); this.animating = true; }
      const press = k.t > 0 ? Math.sin((k.t / 0.22) * Math.PI) : 0;
      k.mesh.position.z = -press * 0.016;
      const face = k.mesh.material[4];
      const target = k === hov ? 0.75 : k.t > 0 ? 1.0 : k.disabled ? 0.08 : 0.2;
      face.emissiveIntensity += (target - face.emissiveIntensity) * Math.min(1, dt * 14);
    }
  }
}
