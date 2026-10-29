// Gemeinsame Bausteine für Casinotische: Chips, Karten, Dealer, Animationen.
import * as THREE from 'three';
import { cardTexture, cardBackTexture, chipSideTexture, chipTopTexture, chipColorFor, feltTexture } from '../textures.js';
import { Character, npcAppearance } from '../character.js';
import { M, mesh } from '../world/props.js';
import { fmtShort } from '../../shared/config.js';

// ───────────────────────── Animationen ─────────────────────────
export const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBounce: t => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375; return n1 * (t -= 2.625 / d1) * t + 0.984375; },
};

export class Animator {
  constructor() { this.list = []; }
  add(duration, fn, done, delay = 0) {
    const a = { t: -delay, duration, fn, done };
    this.list.push(a);
    return a;
  }
  clear() { this.list = []; }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.t += dt;
      if (a.t < 0) continue;
      const k = Math.min(1, a.t / a.duration);
      a.fn(k);
      if (k >= 1) { this.list.splice(i, 1); a.done?.(); }
    }
  }
}

// ───────────────────────── Karten ─────────────────────────
const CARD_W = 0.16, CARD_H = 0.23;
const cardGeo = new THREE.BoxGeometry(CARD_W, 0.003, CARD_H);
cardGeo.userData.shared = true;
const edgeMat = new THREE.MeshStandardMaterial({ color: '#d8d4ca', roughness: 0.6 });
const backMat = () => new THREE.MeshStandardMaterial({ map: cardBackTexture(), roughness: 0.6, color: '#d0d0d0' });
let sharedBack = null;
const faceMats = new Map();

export function cardMesh(card) {
  sharedBack ||= backMat();
  let face = sharedBack;
  if (card) {
    const k = card.r + '-' + card.s;
    if (!faceMats.has(k)) faceMats.set(k, new THREE.MeshStandardMaterial({ map: cardTexture(card), roughness: 0.6, color: '#d0d0d0' }));
    face = faceMats.get(k);
  }
  // Box-Materialien: +x, -x, +y (oben = Vorderseite), -y (Rückseite), +z, -z
  const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, face, sharedBack, edgeMat, edgeMat]);
  m.castShadow = true;
  m.userData.card = card;
  return m;
}

export function setCardFace(m, card) {
  if (!card) return;
  const k = card.r + '-' + card.s;
  if (!faceMats.has(k)) faceMats.set(k, new THREE.MeshStandardMaterial({ map: cardTexture(card), roughness: 0.6, color: '#d0d0d0' }));
  m.material = [edgeMat, edgeMat, faceMats.get(k), sharedBack, edgeMat, edgeMat];
  m.userData.card = card;
}

// Karte vom Shoe zur Zielposition fliegen lassen (lokale Koordinaten der Tischgruppe)
export function dealCard(anim, parent, card, from, to, { delay = 0, faceUp = true, rotY = 0, onLand } = {}) {
  const m = cardMesh(card);
  m.position.copy(from);
  m.rotation.set(Math.PI, rotY, 0);
  m.visible = delay <= 0;
  parent.add(m);
  anim.add(0.45, k => {
    m.visible = true;
    const e = ease.outCubic(k);
    m.position.lerpVectors(from, to, e);
    m.position.y += Math.sin(k * Math.PI) * 0.12;
    m.rotation.x = faceUp ? Math.PI * (1 - e) : Math.PI;
    m.rotation.z = Math.sin(k * Math.PI) * 0.2;
  }, () => onLand?.(), delay);
  return m;
}

export function flipCard(anim, m, card, delay = 0) {
  setCardFace(m, card);
  m.rotation.x = Math.PI;
  const y0 = m.position.y;
  anim.add(0.4, k => { m.rotation.x = Math.PI * (1 - ease.inOutCubic(k)); m.position.y = y0 + Math.sin(k * Math.PI) * 0.06; }, null, delay);
}

// ───────────────────────── Chips ─────────────────────────
const BASE_DENOMS = [1, 5, 25, 100, 500, 1000, 5000, 25000, 100000, 500000, 1e6, 5e6, 25e6, 100e6];
export function denominations(min, max) {
  const lo = BASE_DENOMS.filter(d => d <= min).pop() || 1;
  const list = BASE_DENOMS.filter(d => d >= lo && d <= max);
  while (list.length > 6) list.shift();
  if (!list.length) list.push(min);
  return list;
}

const chipGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.009, 24);
chipGeo.userData.shared = true;
const chipMatCache = new Map();
function chipMats(value, base) {
  const color = chipColorFor(value, base);
  const k = color + fmtShort(value);
  if (!chipMatCache.has(k)) {
    const side = new THREE.MeshStandardMaterial({ map: chipSideTexture(color), roughness: 0.4 });
    const top = new THREE.MeshStandardMaterial({ map: chipTopTexture(color, fmtShort(value).replace('$', '')), roughness: 0.4 });
    chipMatCache.set(k, [side, top, top]);
  }
  return chipMatCache.get(k);
}

export function chipStack(amount, base = 1, maxChips = 14) {
  const g = new THREE.Group();
  if (amount <= 0) return g;
  const denoms = BASE_DENOMS.filter(d => d >= base / 5).reverse();
  let rest = amount;
  const chips = [];
  for (const d of denoms) {
    while (rest >= d && chips.length < maxChips) { chips.push(d); rest -= d; }
  }
  if (!chips.length) chips.push(base);
  chips.reverse();
  chips.sort((a, b) => b - a);
  chips.forEach((d, i) => {
    const c = new THREE.Mesh(chipGeo, chipMats(d, base));
    c.position.y = 0.0045 + i * 0.0092;
    c.rotation.y = Math.random() * 6;
    c.position.x = (Math.random() - 0.5) * 0.003;
    c.castShadow = true;
    g.add(c);
  });
  g.userData.amount = amount;
  return g;
}

// Chip-Wurf-Animation zu einer Position
export function tossChips(anim, parent, amount, base, from, to) {
  const s = chipStack(amount, base, 6);
  s.position.copy(from);
  parent.add(s);
  anim.add(0.4, k => { s.position.lerpVectors(from, to, ease.outCubic(k)); s.position.y += Math.sin(k * Math.PI) * 0.15; }, () => parent.remove(s));
}

// ───────────────────────── Dealer & Tisch ─────────────────────────
export function makeDealer(tier, seed) {
  const d = new Character(npcAppearance(tier >= 3 ? 'vipdealer' : 'dealer', seed), { npc: 'dealer' });
  d.setName(['Marco', 'Lena', 'Viktor', 'Sofia', 'Jamal', 'Yuki', 'Enzo', 'Aylin'][seed % 8] + ' (Dealer)', '#9be7ff');
  return d;
}

export function feltMaterial(color, tex) {
  return new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : color, map: tex || feltTexture(color), roughness: 0.95 });
}

export function tableRim(shape, tier) {
  const rimColor = tier >= 4 ? '#1a0a05' : tier >= 2 ? '#3a1a0a' : '#4a2a12';
  return new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.35, metalness: 0.1 });
}

// Halbrunder Kartentisch (Blackjack, Baccarat, Poker): runde Spielerseite bei +z, Dealer bei -z
export function halfMoonTable(feltTex, tier) {
  const g = new THREE.Group();
  const R = 1.25;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, R, 0, Math.PI, false);
  shape.lineTo(-R, -0.35);
  shape.lineTo(R, -0.35);
  shape.closePath();
  const top = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 40 });
  top.rotateX(Math.PI / 2);
  const pos = top.attributes.position, uv = top.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + R) / (2 * R), 1 - (pos.getZ(i) + 0.35) / (R + 0.35));
  g.add(mesh(top, new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95 }), 0, 0.82, 0));
  const pts = new THREE.EllipseCurve(0, 0, R, R, 0, Math.PI, false).getPoints(40).map(p => new THREE.Vector3(p.x, 0, p.y));
  const path = new THREE.CatmullRomCurve3(pts);
  g.add(mesh(new THREE.TubeGeometry(path, 60, 0.07, 10), new THREE.MeshStandardMaterial({ color: tier >= 3 ? '#2a0a10' : '#2a1206', roughness: 0.5 }), 0, 0.82, 0));
  g.add(mesh(new THREE.BoxGeometry(2 * R + 0.1, 0.08, 0.1), tableRim(null, tier), 0, 0.8, -0.38));
  g.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.78, 24), tableRim(null, tier), 0, 0.39, 0.3));
  if (tier >= 2) g.add(mesh(new THREE.TubeGeometry(path, 60, 0.012, 6), M.gold(), 0, 0.75, 0));
  return g;
}

export function stool(tier) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), M.std(tier >= 3 ? '#7a1230' : '#2a1a3a', 0.8), 0, 0.7, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), tier >= 2 ? M.gold() : M.std('#888', 0.3, 0.8), 0, 0.35, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), tier >= 2 ? M.gold() : M.std('#888', 0.3, 0.8), 0, 0.015, 0));
  return g;
}

export function cardShoe() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), M.std('#151515', 0.4), 0, 0.06, 0));
  g.add(mesh(new THREE.BoxGeometry(0.13, 0.09, 0.27), M.std('#7a1230', 0.6), 0, 0.09, 0.02));
  return g;
}

// Basis für alle Tischansichten
export class TableView {
  constructor(app, def, floorDef) {
    this.app = app;
    this.def = def;
    this.floor = floorDef;
    this.limits = floorDef.limits[def.type];
    this.tier = floorDef.tier;
    this.group = new THREE.Group();
    this.anim = new Animator();
    this.state = null;
    this.lastState = null;
    // Lokale Kamera-Pose beim Sitzen und Stehposition des Spielers
    this.seatLocal = new THREE.Vector3(0, 0, 1.25);
    this.camLocal = new THREE.Vector3(0, 1.55, 1.25);
    this.lookLocal = new THREE.Vector3(0, 0.8, 0);
    this.radius = 1.2;
    this.footprint = { w: 2.6, d: 2 };
  }
  place(x, z, rotY) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = rotY;
    this.group.updateMatrixWorld(true);
  }
  toWorld(v) { return v.clone().applyMatrix4(this.group.matrixWorld); }
  seatPose() {
    return { stand: this.toWorld(this.seatLocal), cam: this.toWorld(this.camLocal), look: this.toWorld(this.lookLocal), yaw: this.group.rotation.y + Math.PI };
  }
  addColliders(world) {
    const p = this.toWorld(new THREE.Vector3(0, 0, this.footprint.oz || 0));
    const r = this.group.rotation.y;
    const swap = Math.abs(Math.sin(r)) > 0.7;
    const w = swap ? this.footprint.d : this.footprint.w, d = swap ? this.footprint.w : this.footprint.d;
    world.addBox(p.x, p.z, w, d);
  }
  interactPos() { return this.toWorld(this.seatLocal.clone().multiplyScalar(1.05)); }
  get mine() { return this.state && this.state.occupant === this.app.me; }
  get denoms() { return denominations(this.limits.min, this.limits.max); }
  setState(ts) { this.lastState = this.state; this.state = ts; this.onState(ts, this.lastState); }
  onState() {}
  tick(dt, t) { this.anim.update(dt); this.update?.(dt, t); }
  onEvent() {}
  buildPanel() { return null; }
  refreshPanel() {}
  pick() { return false; }
  hover() { return null; }
}

// Text-Schild als Sprite (Handwerte, Ergebnisse)
export class TextSprite {
  constructor(w = 0.4, h = 0.1) {
    this.c = document.createElement('canvas');
    this.c.width = 512; this.c.height = 128;
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.sprite.material.color.setScalar(0.88);
    this.sprite.scale.set(w, h, 1);
    this.sprite.renderOrder = 8;
    this.text = null;
    this.set('');
  }
  set(text, color = '#ffffff', bg = 'rgba(10,6,20,0.75)') {
    const key = text + color + bg;
    if (key === this.text) return;
    this.text = key;
    const g = this.c.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    this.sprite.visible = !!text;
    if (!text) return;
    g.font = 'bold 64px "Nunito", Arial';
    const w = Math.min(500, g.measureText(text).width + 60);
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(256 - w / 2, 14, w, 100, 50); g.fill();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 66);
    this.tex.needsUpdate = true;
  }
}

// Gleicht Kartenmeshes mit dem Server-Zustand ab und animiert neue Karten
export class CardSet {
  constructor(view, shoePos) {
    this.view = view;
    this.shoePos = shoePos;
    this.meshes = new Map();
  }
  clear(animated = true) {
    for (const m of this.meshes.values()) {
      if (animated) {
        const from = m.position.clone();
        const to = this.shoePos.clone().add(new THREE.Vector3(-0.6, 0, -0.2));
        this.view.anim.add(0.4, k => { m.position.lerpVectors(from, to, ease.inOutCubic(k)); }, () => this.view.group.remove(m));
      } else this.view.group.remove(m);
    }
    this.meshes.clear();
  }
  // items: [{ key, card (oder null = verdeckt), pos: Vector3, rotY }]
  sync(items, { delayStep = 0.25, sound = true } = {}) {
    const keep = new Set(items.map(i => i.key));
    for (const [k, m] of this.meshes) if (!keep.has(k)) { this.view.group.remove(m); this.meshes.delete(k); }
    let d = 0;
    for (const it of items) {
      const m = this.meshes.get(it.key);
      if (!m) {
        const nm = dealCard(this.view.anim, this.view.group, it.card, this.shoePos, it.pos, { delay: d, faceUp: !!it.card, rotY: it.rotY || 0, onLand: () => sound && sfx_card() });
        nm.userData.faceUp = !!it.card;
        this.meshes.set(it.key, nm);
        d += delayStep;
      } else {
        if (!m.userData.faceUp && it.card) { flipCard(this.view.anim, m, it.card, d); m.userData.faceUp = true; d += delayStep; sound && sfx_flip(); }
        if (m.position.distanceTo(it.pos) > 0.001) {
          const from = m.position.clone(), to = it.pos.clone();
          this.view.anim.add(0.3, k => m.position.lerpVectors(from, to, ease.outCubic(k)));
        }
      }
    }
    return d;
  }
}

let sfxRef = null;
export function bindSfx(s) { sfxRef = s; }
function sfx_card() { sfxRef?.card(); }
function sfx_flip() { sfxRef?.flip(); }
