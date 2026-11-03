// Einheitliches 3D-Einsatzpult (Prompt 12) – „Das Casino selbst ist das Interface“.
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

const KEY_W = 0.088, KEY_H = 0.064, GAP = 0.012, MARGIN = 0.026, DISP_H = 0.13;
const COLS = 4;
const INNER_W = COLS * KEY_W + (COLS - 1) * GAP;
const PAD_W = INNER_W + MARGIN * 2;
const ACT_H = 0.078, BIG_H = 0.092;
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
    this.face = new THREE.Group();
    this.face.userData.noBake = true; // Pult ändert Grösse/Knöpfe zur Laufzeit → nie zusammenfassen
    this.group.add(this.face);
    this.raw = null;          // gewünschter Einsatz (null = Minimum)
    this.typing = '';         // laufende Eingabe über den Ziffernblock
    this.keys = [];           // { mesh, label, action, t }
    this.acts = [];           // gespiegelte Aktionsknöpfe
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
    const f = this.face;
    this.plate = mesh(new THREE.BoxGeometry(1, 1, 0.03), M.std('#15121f', 0.35, 0.5), 0, 0, -0.016, { cast: false });
    this.rim = mesh(new THREE.BoxGeometry(1, 1, 0.012), M.glow(this.opts.color || '#2bd9fe', 1.2), 0, 0, -0.034, { cast: false });
    f.add(this.rim, this.plate);
    // Display
    this.dcanvas = document.createElement('canvas');
    this.dcanvas.width = 512; this.dcanvas.height = Math.round(512 * DISP_H / INNER_W);
    this.dtex = new THREE.CanvasTexture(this.dcanvas);
    this.dtex.colorSpace = THREE.SRGBColorSpace;
    this.display = new THREE.Mesh(new THREE.PlaneGeometry(INNER_W, DISP_H), new THREE.MeshBasicMaterial({ map: this.dtex, toneMapped: false }));
    this.display.position.set(0, -MARGIN - DISP_H / 2, 0.002);
    this.display.userData.noBake = true;
    f.add(this.display);
    // Ziffernblock + Schnellwahl
    const top = -MARGIN - DISP_H - GAP * 1.4;
    KEYS.forEach((row, r) => row.forEach((k, c) => {
      const color = QUICK.has(k) ? '#ffb703' : k === 'C' ? '#e63946' : '#3d3d5c';
      const cap = capMaterial(k, color, KEY_W, KEY_H, true);
      const mats = cap.mats.slice(); mats[4] = cap.face.clone(); // eigenes Material je Taste (Hover-Leuchten)
      const m = new THREE.Mesh(keyGeo, mats);
      m.scale.set(KEY_W, KEY_H, 1);
      m.position.set(-INNER_W / 2 + KEY_W / 2 + c * (KEY_W + GAP), top - KEY_H / 2 - r * (KEY_H + GAP), 0);
      m.userData.noBake = true;
      const key = { mesh: m, label: k, t: 0, kind: 'key' };
      m.userData.padKey = key;
      if (this.opts.walkUp) m.userData.slotButton = { label: () => this.keyLabel(k), action: () => this.press(key), padKey: key };
      f.add(m);
      this.keys.push(key);
    }));
    this.keysBottom = top - 4 * KEY_H - 3 * GAP;
    this.actGroup = new THREE.Group();
    f.add(this.actGroup);
    // Ständer bzw. Tischarm (wird in place() ausgerichtet)
    this.post = mesh(new THREE.CylinderGeometry(0.018, 0.024, 1, 10), M.std('#b8b8c8', 0.25, 0.9), 0, 0, 0, { cast: false });
    this.foot = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.03, 20), M.std('#22202c', 0.4, 0.6), 0, 0, 0, { cast: false });
    this.post.userData.noBake = this.foot.userData.noBake = true;
    this.group.add(this.post, this.foot);
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
    g.strokeStyle = this.flashT > 0 ? '#ffffff' : '#2bd9fe'; g.lineWidth = 5; g.strokeRect(4, 4, W - 8, H - 8);
    g.textBaseline = 'middle';
    g.font = 'bold 22px "Nunito", Arial'; g.fillStyle = '#9fefff';
    g.textAlign = 'left'; g.fillText(`MIN: ${fmtMoney(l.min)}`, 18, 24);
    g.textAlign = 'right'; g.fillText(`MAX: ${fmtMoney(l.max)}`, W - 18, 24);
    let txt = fmtMoney(shown);
    let size = 58;
    g.font = `${size}px "Bungee", Impact`;
    while (g.measureText(txt).width > W - 40 && size > 24) { size -= 3; g.font = `${size}px "Bungee", Impact`; }
    g.textAlign = 'center';
    g.fillStyle = out ? '#ff6b6b' : v > this.pot ? '#ff9f1c' : '#ffe066';
    g.fillText(txt, W / 2, H * 0.52);
    g.font = 'bold 19px "Nunito", Arial';
    g.fillStyle = out ? '#ff9a9a' : '#c9b8e8';
    const line = out ? `wird zu ${fmtMoney(v)}` : status || (v > this.pot ? 'Nicht genug im Team-Pot' : 'EINSATZ');
    g.fillText(line.length > 46 ? line.slice(0, 45) + '…' : line, W / 2, H - 20);
    this.dtex.needsUpdate = true;
  }

  // ── Gespiegelte Aktionsknöpfe ──
  attach(panel) { this.panel = panel; this.sig = ''; this.sync(true); }
  detach() { this.panel = null; this.sig = ''; this.setActions([]); this.status = ''; this.refresh(); }

  visibleIn(b) {
    for (let e = b; e && e !== this.panel; e = e.parentElement) {
      if (e.style?.display === 'none' || e.hidden || e.classList?.contains('hidden')) return false;
    }
    return true;
  }

  collect() {
    const p = this.panel;
    if (!p) return [];
    const rows = [];
    let pair = [];
    const flush = () => { if (pair.length) { rows.push(pair); pair = []; } };
    for (const b of p.querySelectorAll('button')) {
      if (b.closest('.noMirror, .betamount, .chips, .mtile, .ktile') || b.classList.contains('mtile') || b.classList.contains('ktile')) continue;
      if (!this.visibleIn(b)) continue;
      const { label, sub } = cleanLabel(b.textContent || '');
      if (!label) continue;
      const it = { el: b, label, sub, color: colorFor(b, label), disabled: !!b.disabled, seg: b.parentElement?.classList.contains('seg') ? b.parentElement : null, big: b.classList.contains('big') && b.classList.contains('primary') };
      if (it.seg) {
        const last = rows[rows.length - 1];
        flush();
        const lim = it.label.length + it.sub.length > 5 ? 3 : 5; // lange Beschriftungen: höchstens 3 pro Reihe
        if (last && last[0]?.seg === it.seg && last.length < lim) last.push(it); else rows.push([it]);
        continue;
      }
      if (it.big) { flush(); rows.push([it]); continue; }
      pair.push(it);
      if (pair.length === 2) flush();
    }
    flush();
    return rows;
  }

  sync(force) {
    const status = this.view.statusText?.() ?? this.panel?.querySelector('.info')?.textContent ?? '';
    if (status !== this.status) { this.status = status; this.refresh(); }
    const rows = this.usable() ? this.collect() : [];
    const sig = rows.map(r => r.map(i => `${i.label}~${i.sub}~${i.color}~${i.disabled}`).join(',')).join('/');
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.setActions(rows);
  }

  setActions(rows) {
    // Bestehende Meshes wiederverwenden, nur Texte/Farben neu zeichnen
    const flat = rows.flat();
    while (this.acts.length > flat.length) { const a = this.acts.pop(); this.actGroup.remove(a.mesh); a.cap.tex.dispose(); a.cap.face.dispose(); }
    let y = this.keysBottom - GAP * 1.6;
    let i = 0;
    for (const row of rows) {
      const big = row.length === 1 && row[0].big;
      const h = big ? BIG_H : row[0].seg ? ACT_H * 0.82 : ACT_H;
      const w = (INNER_W - (row.length - 1) * GAP) / row.length;
      row.forEach((it, c) => {
        let a = this.acts[i];
        const key = `${it.label}|${it.sub}|${it.color}|${it.disabled}|${(w / h).toFixed(2)}`;
        if (!a || a.ratio !== (w / h).toFixed(2)) {
          if (a) { this.actGroup.remove(a.mesh); a.cap.tex.dispose(); a.cap.face.dispose(); }
          const cap = capMaterial('', it.color, w, h, false);
          const m = new THREE.Mesh(keyGeo, cap.mats);
          m.userData.noBake = true;
          a = { mesh: m, cap, t: 0, kind: 'act', ratio: (w / h).toFixed(2) };
          m.userData.padKey = a;
          if (this.opts.walkUp) m.userData.slotButton = { label: () => a.label, action: () => this.press(a), padKey: a };
          this.actGroup.add(m);
          this.acts[i] = a;
        }
        if (a.key !== key) {
          a.key = key;
          drawCap(a.cap.canvas, it.label, it.disabled ? '#3a3a44' : it.color, it.sub);
          a.cap.tex.needsUpdate = true;
          a.cap.mats[0].color.set(new THREE.Color(it.color).multiplyScalar(0.35));
        }
        a.el = it.el; a.label = it.sub ? `${it.label} (${it.sub})` : it.label; a.disabled = it.disabled;
        a.mesh.scale.set(w, h, 1);
        a.mesh.position.set(-INNER_W / 2 + w / 2 + c * (w + GAP), y - h / 2, 0);
        i++;
      });
      y -= h + GAP;
    }
    this.bottom = rows.length ? y + GAP : this.keysBottom;
    this.layout();
  }

  layout() {
    const H = -(this.bottom ?? this.keysBottom) + MARGIN;
    this.plate.scale.set(PAD_W, H, 1);
    this.plate.position.y = -H / 2;
    this.rim.scale.set(PAD_W + 0.02, H + 0.02, 1);
    this.rim.position.y = -H / 2;
    this.height = H;
    // Zu hohe Pulte (viele Optionen) etwas verkleinern, damit alles im Blick bleibt
    const s = (this.opts.scale || 1) * Math.min(1, (this.opts.maxH || 0.7) / H);
    this.face.scale.setScalar(s);
    this.placePost();
  }

  // Pult in Tischkoordinaten platzieren: ausgerichtet auf die Sitz-Kamera (immer im Blick, rechts unten)
  place() {
    const v = this.view, o = this.opts;
    if (o.pos) {
      this.group.position.copy(o.pos);
      this.group.rotation.set(o.tilt ?? -0.35, o.yaw ?? -0.3, 0, 'YXZ');
    } else {
      const cam = v.camLocal.clone(), look = v.lookLocal.clone();
      const fwd = look.clone().sub(cam).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const d = o.dist || 0.92;
      const p = cam.clone().addScaledVector(fwd, d).addScaledVector(right, d * (o.right ?? 0.5)).addScaledVector(up, d * (o.up ?? 0.3));
      this.group.position.copy(p);
      const m = new THREE.Matrix4().lookAt(cam, p, up); // +z zeigt zur Kamera
      this.group.quaternion.setFromRotationMatrix(m);
    }
    this.placePost();
  }

  placePost() {
    if (!this.post) return;
    this.group.updateMatrix();
    const s = this.face.scale.x;
    const bottomLocal = new THREE.Vector3(0, -this.height * s, -0.03);
    const inv = new THREE.Matrix4().copy(this.group.matrix).invert();
    const b = bottomLocal.clone().applyMatrix4(this.group.matrix); // im Tischraum
    const fp = this.view.footprint || { w: 0, d: 0 };
    const inside = Math.abs(b.x) < fp.w / 2 + 0.05 && Math.abs(b.z - (fp.oz || 0)) < fp.d / 2 + 0.05;
    const floorY = inside ? (this.view.tableTopY ?? 0.84) : 0;
    const len = Math.max(0.05, b.y - floorY);
    // Post senkrecht im Tischraum → in Pult-Koordinaten umrechnen
    const mid = new THREE.Vector3(b.x, floorY + len / 2, b.z).applyMatrix4(inv);
    this.post.position.copy(mid);
    this.post.scale.set(1, len, 1);
    this.post.quaternion.copy(this.group.quaternion).invert();
    this.foot.visible = !inside && !this.opts.noFoot;
    this.foot.position.copy(new THREE.Vector3(b.x, floorY + 0.015, b.z).applyMatrix4(inv));
    this.foot.quaternion.copy(this.post.quaternion);
    this.post.visible = !this.opts.noPost;
  }

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
    // Performance: weit weg unsichtbar, mittlere Distanz nur Platte + Display (wenige Draw Calls)
    const vis = mine || dist < 14;
    this.group.visible = vis;
    if (!vis) return;
    const detail = mine || dist < 7;
    if (detail !== this.detail) { this.detail = detail; for (const k of this.keys) k.mesh.visible = detail; this.actGroup.visible = detail; }
    if (mine && this.panel) { this.syncT -= dt; if (this.syncT <= 0) { this.syncT = 0.15; this.sync(); } }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.dkey = ''; this.drawDisplay(); } }
    else if ((this.potT = (this.potT || 0) + dt) > 0.5) { this.potT = 0; this.drawDisplay(); }
    // Hover-Highlight + Drück-Animation
    const hov = mine || this.opts.walkUp ? (this.hovered || (this.opts.walkUp ? app.hoverButton?.padKey : null)) : null;
    if (hov !== this.lastHov) { this.lastHov = hov; this.settle = 0.6; }
    if (this.settle > 0) this.settle -= dt;
    if (!detail || (!mine && !(this.settle > 0) && !this.animating)) return;
    this.animating = false;
    for (const k of [...this.keys, ...this.acts]) {
      if (k.t > 0) { k.t = Math.max(0, k.t - dt); this.animating = true; }
      const press = k.t > 0 ? Math.sin((k.t / 0.22) * Math.PI) : 0;
      k.mesh.position.z = -press * 0.014;
      const face = k.mesh.material[4];
      const target = k === hov ? 0.75 : k.t > 0 ? 1.0 : k.disabled ? 0.08 : 0.2;
      face.emissiveIntensity += (target - face.emissiveIntensity) * Math.min(1, dt * 14);
    }
  }
}
