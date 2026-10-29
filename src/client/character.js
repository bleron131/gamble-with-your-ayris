// Cartoon-Charaktere: grosser runder Kopf, kleiner Körper, kurze Arme & Beine.
import * as THREE from 'three';
import { nameTagTexture } from './textures.js';

export const OPTIONS = {
  skin: ['#ffe0c2', '#f2c9a0', '#e0ac7e', '#c68642', '#8d5524', '#5c3a1e', '#ffd34e', '#9fd8a6'],
  hair: [['none', 'Glatze'], ['short', 'Kurz'], ['spiky', 'Stachelig'], ['afro', 'Afro'], ['long', 'Lang'], ['mohawk', 'Irokese'], ['bun', 'Dutt'], ['curly', 'Locken'], ['quiff', 'Tolle']],
  hairColor: ['#1b1210', '#3b2414', '#7a4a21', '#c98c3a', '#f1d27a', '#d64b2a', '#e8e8e8', '#3d6bff', '#ff4fa3', '#41c26a'],
  eyes: [['round', 'Rund'], ['big', 'Riesig'], ['sleepy', 'Müde'], ['happy', 'Fröhlich'], ['angry', 'Grimmig'], ['small', 'Klein']],
  eyeColor: ['#3a2a1a', '#2c6bd6', '#2e8b57', '#777', '#9b2fbf'],
  brows: [['normal', 'Normal'], ['thick', 'Buschig'], ['angry', 'Böse'], ['raised', 'Erstaunt'], ['uni', 'Monobraue'], ['none', 'Keine']],
  beard: [['none', 'Keiner'], ['stubble', 'Dreitage'], ['full', 'Vollbart'], ['goatee', 'Ziegenbart'], ['mustache', 'Schnauzer'], ['chinstrap', 'Kinnbart']],
  top: [['tshirt', 'T-Shirt'], ['hoodie', 'Hoodie'], ['tank', 'Tanktop'], ['shirt', 'Hemd'], ['polo', 'Polo']],
  topColor: ['#e63946', '#ffffff', '#1d3557', '#2a9d8f', '#f4a261', '#111111', '#9b5de5', '#ffd60a', '#f15bb5', '#06d6a0'],
  pants: [['jeans', 'Jeans'], ['shorts', 'Shorts'], ['suit', 'Anzughose'], ['jogger', 'Jogger']],
  pantsColor: ['#2b4c7e', '#111111', '#6b4f2a', '#888888', '#e8e2d0', '#7a1230', '#1d6b3a'],
  shoes: [['sneakers', 'Sneaker'], ['boots', 'Stiefel'], ['sandals', 'Sandalen'], ['loafers', 'Lackschuhe']],
  shoesColor: ['#ffffff', '#111111', '#7a4a21', '#e63946', '#ffd700'],
  jacket: [['none', 'Keine'], ['leather', 'Lederjacke'], ['blazer', 'Blazer'], ['track', 'Trainingsjacke'], ['gold', 'Goldjacke']],
  jacketColor: ['#1a1a1a', '#7a1230', '#1d3557', '#f2f2f2', '#2a9d8f', '#6b4f2a'],
  hat: [['none', 'Keine'], ['cap', 'Cap'], ['beanie', 'Mütze'], ['fedora', 'Fedora'], ['fez', 'Fes'], ['cowboy', 'Cowboyhut'], ['tophat', 'Zylinder'], ['crown', 'Krone']],
  hatColor: ['#1a1a1a', '#e63946', '#1d3557', '#f2f2f2', '#c98c3a', '#9b5de5'],
  glasses: [['none', 'Keine'], ['round', 'Rund'], ['shades', 'Sonnenbrille'], ['monocle', 'Monokel'], ['star', 'Sternbrille']],
  jewelry: [['none', 'Keiner'], ['chain', 'Silberkette'], ['goldchain', 'Goldkette'], ['earrings', 'Ohrringe'], ['watch', 'Uhr'], ['diamond', 'Diamant-Kette']],
  accessory: [['none', 'Keins'], ['rose', 'Rose'], ['cocktail', 'Cocktail'], ['dice', 'Glückswürfel'], ['moneybag', 'Geldsack'], ['trophy', 'Pokal']],
};

export function defaultAppearance() {
  const r = a => a[Math.floor(Math.random() * a.length)];
  return {
    skin: r(OPTIONS.skin.slice(0, 6)), hair: r(['short', 'spiky', 'curly', 'quiff', 'afro']), hairColor: r(OPTIONS.hairColor.slice(0, 6)),
    eyes: 'round', eyeColor: '#3a2a1a', brows: 'normal', beard: r(['none', 'none', 'stubble', 'mustache']),
    top: 'tshirt', topColor: r(OPTIONS.topColor), pants: 'jeans', pantsColor: '#2b4c7e', shoes: 'sneakers', shoesColor: '#ffffff',
    jacket: 'none', jacketColor: '#1a1a1a', hat: 'none', hatColor: '#1a1a1a', glasses: 'none', jewelry: 'none', accessory: 'none',
  };
}

const geoCache = new Map();
function geo(key, fn) { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); }
const sphere = (r, w = 24, h = 16) => geo(`s${r}${w}${h}`, () => new THREE.SphereGeometry(r, w, h));
const capsule = (r, l) => geo(`c${r}${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 12));
const cyl = (rt, rb, h, s = 20) => geo(`y${rt}${rb}${h}${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const box = (x, y, z) => geo(`b${x}${y}${z}`, () => new THREE.BoxGeometry(x, y, z));
const torus = (r, t, arc) => geo(`t${r}${t}${arc}`, () => new THREE.TorusGeometry(r, t, 8, 20, arc));

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0, ...opts.extra });
}

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

export class Character {
  constructor(appearance = defaultAppearance(), { name = null, npc = null } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.anim = 'idle';
    this.t = Math.random() * 10;
    this.blinkT = 2 + Math.random() * 3;
    this.target = null;
    this.speed = 0;
    this.build(appearance, npc);
    if (name) this.setName(name);
  }

  setName(name, color) {
    if (this.tag) { this.root.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture(name, color), depthWrite: false, transparent: true }));
    sp.scale.set(0.9, 0.225, 1);
    sp.position.y = 1.72;
    sp.renderOrder = 10;
    this.tag = sp;
    this.root.add(sp);
  }

  dispose() {
    this.root.traverse(o => { if (o.isMesh && o.material && !o.material.shared) o.material.dispose?.(); });
  }

  rebuild(appearance) {
    this.root.remove(this.body);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.build(appearance);
  }

  build(a, npc) {
    this.appearance = { ...defaultAppearance(), ...a };
    a = this.appearance;
    const B = this.body;
    const skin = mat(a.skin, { rough: 0.55 });
    const top = mat(a.topColor);
    const pants = mat(a.pantsColor, { rough: 0.8 });
    const shoe = mat(a.shoesColor, { rough: a.shoes === 'loafers' ? 0.2 : 0.7 });
    const dark = mat('#141014');
    const white = mat('#ffffff', { rough: 0.2 });
    this.skinMat = skin;

    // Beine
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    this.legL.position.set(-0.09, 0.3, 0); this.legR.position.set(0.09, 0.3, 0);
    for (const [leg] of [[this.legL], [this.legR]]) {
      const long = a.pants !== 'shorts';
      leg.add(mesh(capsule(0.072, 0.14), long ? pants : skin, 0, -0.13, 0));
      if (!long) leg.add(mesh(cyl(0.085, 0.08, 0.08), pants, 0, -0.03, 0));
      const s = mesh(sphere(0.085), shoe, 0, -0.27, 0.035);
      s.scale.set(1, a.shoes === 'boots' ? 0.85 : 0.6, 1.45);
      leg.add(s);
      if (a.shoes === 'boots') leg.add(mesh(cyl(0.078, 0.08, 0.12), shoe, 0, -0.2, 0));
      if (a.shoes === 'sneakers') { const sole = mesh(box(0.15, 0.03, 0.24), white, 0, -0.31, 0.035); leg.add(sole); }
      B.add(leg);
    }
    // Hüfte
    B.add(mesh(cyl(0.17, 0.16, 0.12), pants, 0, 0.33, 0));
    // Torso
    const torso = mesh(capsule(0.19, 0.16), a.top === 'tank' ? skin : top, 0, 0.53, 0);
    torso.scale.set(1.05, 1, 0.9);
    B.add(torso);
    if (a.top === 'tank') { const tk = mesh(capsule(0.195, 0.1), top, 0, 0.5, 0); tk.scale.set(1.04, 1, 0.92); B.add(tk); }
    if (a.top === 'hoodie') {
      const hood = mesh(torus(0.15, 0.05, Math.PI * 2), top, 0, 0.74, -0.06); hood.rotation.x = Math.PI / 2.4; B.add(hood);
      const pocket = mesh(box(0.2, 0.08, 0.02), mat(new THREE.Color(a.topColor).multiplyScalar(0.8)), 0, 0.45, 0.17); B.add(pocket);
    }
    if (a.top === 'shirt' || a.top === 'polo') {
      const collar = mesh(torus(0.11, 0.03, Math.PI * 2), a.top === 'shirt' ? white : top, 0, 0.73, 0.0); collar.rotation.x = Math.PI / 2; B.add(collar);
      for (let i = 0; i < (a.top === 'shirt' ? 3 : 2); i++) B.add(mesh(sphere(0.015, 8, 6), white, 0, 0.66 - i * 0.07, 0.175));
    }
    // Jacke
    if (a.jacket !== 'none') {
      const jc = a.jacket === 'gold' ? '#d4af37' : a.jacketColor;
      const jm = mat(jc, { rough: a.jacket === 'leather' ? 0.35 : a.jacket === 'gold' ? 0.25 : 0.7, metal: a.jacket === 'gold' ? 0.8 : 0 });
      for (const side of [-1, 1]) {
        const half = mesh(capsule(0.2, 0.15), jm, side * 0.06, 0.53, -0.01);
        half.scale.set(0.62, 1.02, 0.95);
        B.add(half);
        const lapel = mesh(box(0.05, 0.2, 0.02), jm, side * 0.07, 0.6, 0.17); lapel.rotation.z = side * 0.3; B.add(lapel);
      }
      if (a.jacket === 'track') for (const side of [-1, 1]) B.add(mesh(box(0.02, 0.3, 0.02), white, side * 0.13, 0.55, 0.15));
      this.jacketMat = jm;
    }
    // Arme
    const sleeve = this.jacketMat || (a.top === 'tank' ? skin : top);
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    this.armL.position.set(-0.22, 0.66, 0); this.armR.position.set(0.22, 0.66, 0);
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]]) {
      const upper = mesh(capsule(0.058, 0.17), sleeve, side * 0.02, -0.13, 0);
      arm.add(upper);
      const hand = mesh(sphere(0.07), skin, side * 0.025, -0.3, 0.01);
      arm.add(hand);
      arm.rotation.z = side * 0.18;
      B.add(arm);
      if (side === 1) this.handR = hand; else this.handL = hand;
    }
    if (a.jewelry === 'watch') this.armL.add(mesh(cyl(0.065, 0.065, 0.04), mat('#d4af37', { metal: 0.9, rough: 0.2 }), -0.025, -0.24, 0.01));
    // Hals & Kopf
    B.add(mesh(cyl(0.07, 0.08, 0.08), skin, 0, 0.76, 0));
    this.head = new THREE.Group();
    this.head.position.set(0, 1.08, 0);
    B.add(this.head);
    const H = this.head;
    const headM = mesh(sphere(0.37, 32, 24), skin);
    headM.scale.set(1, 0.95, 0.95);
    H.add(headM);
    // Ohren
    for (const s of [-1, 1]) { const e = mesh(sphere(0.07), skin, s * 0.36, -0.02, 0); e.scale.set(0.6, 1, 0.8); H.add(e); }
    // Nase & Mund
    const nose = mesh(sphere(0.055), mat(new THREE.Color(a.skin).multiplyScalar(0.92)), 0, -0.05, 0.35);
    nose.scale.set(1, 0.9, 0.9);
    H.add(nose);
    this.mouth = mesh(torus(0.085, 0.018, Math.PI), mat('#5a1a1a'), 0, -0.15, 0.31);
    this.mouth.rotation.z = Math.PI;
    this.mouth.rotation.x = -0.25;
    H.add(this.mouth);
    // Augen
    const eyeR = a.eyes === 'big' ? 0.11 : a.eyes === 'small' ? 0.06 : 0.088;
    this.eyes = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.13, 0.07, 0.3);
      const w = mesh(sphere(eyeR), white);
      w.scale.set(1, 1.2, 0.6);
      g.add(w);
      const pupil = mesh(sphere(eyeR * 0.5), mat(a.eyeColor, { rough: 0.2 }), 0, 0, eyeR * 0.45);
      pupil.scale.set(1, 1.15, 0.5);
      g.add(pupil);
      g.add(mesh(sphere(eyeR * 0.15, 8, 6), white, eyeR * 0.15, eyeR * 0.2, eyeR * 0.7));
      if (a.eyes === 'sleepy' || a.eyes === 'angry') {
        const lid = mesh(new THREE.SphereGeometry(eyeR * 1.08, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin);
        lid.scale.set(1.05, 1.2, 0.68);
        lid.position.y = a.eyes === 'sleepy' ? -eyeR * 0.15 : 0;
        if (a.eyes === 'angry') lid.rotation.z = -s * 0.5;
        g.add(lid);
      }
      if (a.eyes === 'happy') { w.scale.y = 0.5; pupil.visible = false; const arc = mesh(torus(eyeR * 0.7, 0.012, Math.PI), dark, 0, -0.01, eyeR * 0.5); g.add(arc); }
      H.add(g);
      this.eyes.push(g);
    }
    // Augenbrauen
    if (a.brows !== 'none') {
      const hm = mat(a.hairColor, { rough: 0.9 });
      if (a.brows === 'uni') H.add(mesh(box(0.34, 0.035, 0.03), hm, 0, 0.21, 0.31));
      else for (const s of [-1, 1]) {
        const b = mesh(box(0.12, a.brows === 'thick' ? 0.05 : 0.028, 0.03), hm, s * 0.13, a.brows === 'raised' ? 0.25 : 0.2, 0.32);
        b.rotation.z = a.brows === 'angry' ? s * 0.35 : a.brows === 'raised' ? -s * 0.15 : -s * 0.05;
        H.add(b);
      }
    }
    // Bart
    const hairM = mat(a.hairColor, { rough: 0.9 });
    if (a.beard === 'full' || a.beard === 'chinstrap' || a.beard === 'stubble') {
      const bm = a.beard === 'stubble' ? new THREE.MeshStandardMaterial({ color: a.hairColor, transparent: true, opacity: 0.35, roughness: 1 }) : hairM;
      const beard = mesh(new THREE.SphereGeometry(0.375, 24, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.4), bm);
      beard.scale.set(1.01, 0.97, 0.98);
      if (a.beard === 'chinstrap') beard.scale.set(1.02, 0.97, 0.99);
      H.add(beard);
      if (a.beard === 'full') { const m = mesh(capsule(0.03, 0.14), hairM, 0, -0.1, 0.34); m.rotation.z = Math.PI / 2; H.add(m); }
    }
    if (a.beard === 'goatee') H.add(mesh(sphere(0.07), hairM, 0, -0.27, 0.27));
    if (a.beard === 'mustache') { const m = mesh(capsule(0.032, 0.14), hairM, 0, -0.1, 0.34); m.rotation.z = Math.PI / 2; H.add(m); }
    // Haare
    this.buildHair(H, a, hairM);
    // Hut
    this.buildHat(H, a);
    // Brille
    this.buildGlasses(H, a);
    // Schmuck
    if (a.jewelry === 'chain' || a.jewelry === 'goldchain' || a.jewelry === 'diamond') {
      const cm = mat(a.jewelry === 'chain' ? '#d8d8d8' : '#ffcf40', { metal: 0.95, rough: 0.2 });
      const ch = mesh(torus(0.15, 0.018, Math.PI * 2), cm, 0, 0.71, 0.05); ch.rotation.x = Math.PI / 2.3; B.add(ch);
      if (a.jewelry === 'diamond') B.add(mesh(new THREE.OctahedronGeometry(0.05), mat('#9be7ff', { metal: 0.3, rough: 0.05, extra: { emissive: '#4ac', emissiveIntensity: 0.4 } }), 0, 0.6, 0.2));
      else B.add(mesh(sphere(0.035), cm, 0, 0.6, 0.19));
    }
    if (a.jewelry === 'earrings') for (const s of [-1, 1]) H.add(mesh(torus(0.03, 0.008, Math.PI * 2), mat('#ffcf40', { metal: 0.9, rough: 0.2 }), s * 0.37, -0.1, 0.02));
    // Accessoire (in der rechten Hand)
    this.buildAccessory(a);
    if (npc) this.applyNpc(npc);
  }

  buildHair(H, a, hm) {
    const top = (r = 0.385, cut = 0.42) => { const m = mesh(new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, Math.PI * cut), hm); m.scale.set(1, 0.98, 0.98); m.rotation.x = -0.18; return m; };
    switch (a.hair) {
      case 'short': H.add(top()); break;
      case 'quiff': { H.add(top()); const q = mesh(capsule(0.1, 0.18), hm, 0, 0.32, 0.18); q.rotation.x = 1.2; q.scale.set(1.5, 1, 1); H.add(q); break; }
      case 'spiky': H.add(top(0.38, 0.38)); for (let i = 0; i < 9; i++) { const a2 = (i / 9) * Math.PI * 2; const c = mesh(geo('cone', () => new THREE.ConeGeometry(0.07, 0.2, 8)), hm, Math.cos(a2) * 0.2, 0.3, Math.sin(a2) * 0.2 - 0.02); c.rotation.set(Math.sin(a2) * 0.6, 0, -Math.cos(a2) * 0.6); H.add(c); } break;
      case 'afro': { const af = mesh(sphere(0.5, 24, 16), hm, 0, 0.15, -0.08); af.scale.set(1, 0.85, 0.95); H.add(af); break; }
      case 'long': { H.add(top(0.39, 0.5)); const back = mesh(capsule(0.3, 0.3), hm, 0, -0.15, -0.18); back.scale.set(1.15, 1, 0.6); H.add(back); break; }
      case 'mohawk': for (let i = 0; i < 6; i++) H.add(mesh(box(0.06, 0.16, 0.1), hm, 0, 0.36 - Math.abs(i - 2.5) * 0.02, 0.22 - i * 0.1)); break;
      case 'bun': H.add(top()); H.add(mesh(sphere(0.14), hm, 0, 0.4, -0.12)); break;
      case 'curly': for (let i = 0; i < 26; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * 1.0; H.add(mesh(sphere(0.085, 10, 8), hm, Math.sin(ph) * Math.cos(th) * 0.36, Math.cos(ph) * 0.35, Math.sin(ph) * Math.sin(th) * 0.36 - 0.03)); } break;
    }
  }

  buildHat(H, a) {
    const hm = mat(a.hat === 'crown' ? '#ffcf40' : a.hatColor, { metal: a.hat === 'crown' ? 0.9 : 0, rough: a.hat === 'crown' ? 0.2 : 0.7 });
    const y = a.hair === 'afro' ? 0.5 : 0.3;
    switch (a.hat) {
      case 'cap': { const c = mesh(new THREE.SphereGeometry(0.395, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hm, 0, 0.02, 0); H.add(c); const brim = mesh(cyl(0.2, 0.2, 0.02), hm, 0, 0.18, 0.32); brim.scale.set(1, 1, 0.8); H.add(brim); break; }
      case 'beanie': { const c = mesh(new THREE.SphereGeometry(0.4, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), hm, 0, 0.03, 0); H.add(c); H.add(mesh(sphere(0.08), mat('#fff'), 0, 0.42, 0)); break; }
      case 'fedora': H.add(mesh(cyl(0.6, 0.6, 0.03), hm, 0, y, 0)); H.add(mesh(cyl(0.27, 0.32, 0.25), hm, 0, y + 0.13, 0)); H.add(mesh(cyl(0.325, 0.325, 0.05), mat('#111'), 0, y + 0.04, 0)); break;
      case 'fez': H.add(mesh(cyl(0.2, 0.25, 0.28), mat('#b3122e'), 0, y + 0.08, 0)); H.add(mesh(capsule(0.012, 0.18), mat('#111'), 0.12, y + 0.05, 0.1)); break;
      case 'cowboy': { const br = mesh(cyl(0.65, 0.65, 0.03), hm, 0, y, 0); br.scale.set(1, 1, 0.8); H.add(br); H.add(mesh(cyl(0.25, 0.3, 0.28), hm, 0, y + 0.14, 0)); break; }
      case 'tophat': H.add(mesh(cyl(0.45, 0.45, 0.03), mat('#111'), 0, y, 0)); H.add(mesh(cyl(0.27, 0.27, 0.45), mat('#111'), 0, y + 0.23, 0)); H.add(mesh(cyl(0.275, 0.275, 0.07), mat('#7a1230'), 0, y + 0.06, 0)); break;
      case 'crown': {
        H.add(mesh(cyl(0.26, 0.26, 0.12, 24), hm, 0, y + 0.06, 0));
        for (let i = 0; i < 8; i++) { const a2 = i / 8 * Math.PI * 2; H.add(mesh(geo('crc', () => new THREE.ConeGeometry(0.05, 0.14, 6)), hm, Math.cos(a2) * 0.24, y + 0.18, Math.sin(a2) * 0.24)); }
        H.add(mesh(sphere(0.04), mat('#e63946', { rough: 0.1 }), 0, y + 0.06, 0.26));
        break;
      }
    }
  }

  buildGlasses(H, a) {
    const fm = mat('#111', { rough: 0.3 });
    switch (a.glasses) {
      case 'round': for (const s of [-1, 1]) H.add(mesh(torus(0.085, 0.012, Math.PI * 2), fm, s * 0.13, 0.07, 0.36)); H.add(mesh(box(0.08, 0.012, 0.012), fm, 0, 0.08, 0.37)); break;
      case 'shades': { const lens = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.05, metalness: 0.6 }); for (const s of [-1, 1]) { const l = mesh(box(0.17, 0.11, 0.02), lens, s * 0.13, 0.07, 0.37); H.add(l); } H.add(mesh(box(0.42, 0.025, 0.02), fm, 0, 0.12, 0.37)); break; }
      case 'monocle': H.add(mesh(torus(0.09, 0.012, Math.PI * 2), mat('#d4af37', { metal: 0.9, rough: 0.2 }), 0.13, 0.07, 0.37)); break;
      case 'star': {
        const sm = mat('#ff4fa3', { rough: 0.3, extra: { emissive: '#ff4fa3', emissiveIntensity: 0.3 } });
        for (const s of [-1, 1]) { const st = mesh(geo('star', () => starGeometry()), sm, s * 0.14, 0.07, 0.37); H.add(st); }
        break;
      }
    }
  }

  buildAccessory(a) {
    const g = new THREE.Group();
    g.position.set(0.03, -0.3, 0.06);
    switch (a.accessory) {
      case 'rose': g.add(mesh(cyl(0.01, 0.01, 0.25), mat('#2f8a2f'), 0, 0.08, 0)); g.add(mesh(sphere(0.05), mat('#d90429'), 0, 0.22, 0)); break;
      case 'cocktail': { const cone = mesh(geo('cone2', () => new THREE.ConeGeometry(0.08, 0.1, 16, 1, true)), new THREE.MeshStandardMaterial({ color: '#ff8fcf', transparent: true, opacity: 0.7, side: THREE.DoubleSide }), 0, 0.12, 0); cone.rotation.x = Math.PI; g.add(cone); } g.add(mesh(cyl(0.008, 0.008, 0.1), mat('#ddd'), 0, 0.03, 0)); break;
      case 'dice': g.add(mesh(box(0.09, 0.09, 0.09), mat('#d61f2c'), 0, 0.02, 0.03)); break;
      case 'moneybag': g.add(mesh(sphere(0.11), mat('#c9a66b', { rough: 0.9 }), 0, -0.08, 0)); g.add(mesh(cyl(0.03, 0.05, 0.05), mat('#c9a66b'), 0, 0.03, 0)); break;
      case 'trophy': { const gm = mat('#ffcf40', { metal: 0.9, rough: 0.2 }); g.add(mesh(cyl(0.07, 0.03, 0.12), gm, 0, 0.1, 0)); g.add(mesh(cyl(0.02, 0.02, 0.06), gm, 0, 0.02, 0)); g.add(mesh(cyl(0.05, 0.05, 0.02), gm, 0, -0.01, 0)); break; }
    }
    this.armR.add(g);
    this.accessory = g;
  }

  applyNpc(kind) {
    // NPC-Outfits: Dealer, Mafia, Barkeeper
    if (kind === 'dealer' || kind === 'bartender' || kind === 'staff') {
      const bow = mesh(box(0.12, 0.05, 0.03), mat('#7a1230'), 0, 0.72, 0.17);
      this.body.add(bow);
    }
  }

  // ───────────────────────── Animation ─────────────────────────
  setAnim(a) { this.anim = a; }

  // Effekte von Mitspielern (b = Flasche, d = trinkt, z = schwindelig)
  setFx(fx = '') {
    this.fx = fx;
    const wantBottle = fx.includes('b') || fx.includes('d');
    if (wantBottle && !this.bottle) {
      this.bottle = makkaBottle(1.6);
      // In der Faust gehalten: Flaschenhals zeigt quer zum Arm (beim Trinken Richtung Mund)
      this.bottle.rotation.x = Math.PI / 2;
      this.bottle.position.set(0.03, -0.31, -0.13);
      this.armR.add(this.bottle);
    } else if (!wantBottle && this.bottle) { this.armR.remove(this.bottle); this.bottle = null; }
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    let legSwing = 0, armSwing = 0, bob = 0, armUp = 0, headTilt = 0, sway = 0;
    const fx = this.fx || '';
    const L = this.legL, R = this.legR;
    switch (this.anim) {
      case 'walk': legSwing = Math.sin(t * 11) * 0.65; armSwing = legSwing * 0.8; bob = Math.abs(Math.sin(t * 11)) * 0.05; break;
      case 'cheer': armUp = 2.6 + Math.sin(t * 14) * 0.3; bob = Math.abs(Math.sin(t * 7)) * 0.18; break;
      case 'sad': headTilt = 0.45; armSwing = 0; bob = -0.02; break;
      case 'dance': sway = Math.sin(t * 6) * 0.25; armUp = 1.2 + Math.sin(t * 12) * 0.8; bob = Math.abs(Math.sin(t * 6)) * 0.08; legSwing = Math.sin(t * 12) * 0.2; break;
      case 'facepalm': headTilt = 0.3; break;
      case 'sit': break;
      case 'deal': armSwing = 0; break;
      default: bob = Math.sin(t * 2) * 0.012; armSwing = Math.sin(t * 1.5) * 0.04;
    }
    L.rotation.x = legSwing; R.rotation.x = -legSwing;
    this.body.position.y = bob;
    this.body.rotation.z = sway;
    if (this.anim === 'cheer' || this.anim === 'dance') {
      this.armL.rotation.set(0, 0, -armUp);
      this.armR.rotation.set(0, 0, armUp);
    } else if (this.anim === 'facepalm') {
      this.armR.rotation.set(-2.2, 0, 0.5);
      this.armL.rotation.set(0, 0, -0.18);
    } else if (this.anim === 'deal' || this.anim === 'throw') {
      const k = Math.sin(t * 6) * 0.5;
      this.armR.rotation.set(-1.1 + k * 0.4, 0, 0.3);
      this.armL.rotation.set(-0.9 - k * 0.3, 0, -0.3);
    } else if (this.anim === 'point') {
      this.armR.rotation.set(-1.5, 0, 0.1);
      this.armL.rotation.set(0, 0, -0.18);
    } else {
      this.armL.rotation.set(-armSwing, 0, -0.18);
      this.armR.rotation.set(armSwing, 0, 0.18);
    }
    this.head.rotation.x = headTilt;
    this.head.rotation.z = 0;
    // Flasche halten / trinken
    if (fx.includes('d')) {
      const k = 0.5 + 0.5 * Math.sin(t * 2.2);
      this.armR.rotation.set(-2.5 - k * 0.3, 0, 0.45);
      this.head.rotation.x = -0.45 - k * 0.1;
    } else if (this.bottle) {
      this.armR.rotation.set(-0.9, 0, 0.25);
    }
    // Schwindel: schwankender Gang
    if (fx.includes('z')) {
      this.body.rotation.z = Math.sin(t * 2.1) * 0.18 + Math.sin(t * 5.3) * 0.04;
      this.body.position.x = Math.sin(t * 1.4) * 0.06;
      this.head.rotation.z = Math.sin(t * 1.7 + 1) * 0.25;
    } else this.body.position.x = 0;
    if (this.anim === 'sit') { L.rotation.x = -1.4; R.rotation.x = -1.4; this.body.position.y = -0.2; }
    // Blinzeln
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 && this.blinkT > 0;
    for (const e of this.eyes) e.scale.y = blink ? 0.1 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    // Netzwerk-Interpolation
    if (this.target) {
      const p = this.root.position;
      const k = Math.min(1, dt * 12);
      const dx = this.target.p[0] - p.x, dz = this.target.p[2] - p.z;
      p.x += dx * k; p.y += (this.target.p[1] - p.y) * k; p.z += dz * k;
      let dr = this.target.r - this.root.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      this.root.rotation.y += dr * k;
    }
  }
}

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.045 : 0.1;
    const a = i / 10 * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
}

// MAKKA: klare, leicht grünliche Limonadenflasche mit pinker Füllung und eigenem Etikett
let makkaLabel = null;
function makkaLabelTexture() {
  if (makkaLabel) return makkaLabel;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff4f9'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#e8187a'; g.fillRect(0, 0, 512, 16); g.fillRect(0, 112, 512, 16);
  g.fillStyle = '#c3005f'; g.font = '64px "Bungee", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const x of [128, 384]) { g.fillText('MAKKA', x, 58); }
  g.font = 'bold 18px "Nunito", Arial'; g.fillStyle = '#7a1230';
  for (const x of [128, 384]) g.fillText('AYRI LIMONADE', x, 97);
  makkaLabel = new THREE.CanvasTexture(c);
  makkaLabel.colorSpace = THREE.SRGBColorSpace;
  return makkaLabel;
}

export function makkaBottle(scale = 1) {
  const g = new THREE.Group();
  const prof = [[0.0, 0], [0.034, 0], [0.036, 0.01], [0.036, 0.1], [0.03, 0.13], [0.016, 0.165], [0.013, 0.2], [0.014, 0.205], [0.0, 0.205]];
  const glassPts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(glassPts, 24), new THREE.MeshStandardMaterial({ color: '#cff7d6', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, depthWrite: false }));
  g.add(glass);
  const liquidPts = [[0, 0.004], [0.031, 0.004], [0.032, 0.1], [0.026, 0.125], [0.012, 0.15], [0, 0.15]].map(([r, y]) => new THREE.Vector2(r, y));
  const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidPts, 20), new THREE.MeshStandardMaterial({ color: '#ff3fa4', emissive: '#a0105a', emissiveIntensity: 0.35, transparent: true, opacity: 0.9, roughness: 0.2 }));
  g.add(liquid);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0365, 0.0365, 0.05, 24, 1, true), new THREE.MeshStandardMaterial({ map: makkaLabelTexture(), roughness: 0.5 }));
  label.position.y = 0.06;
  g.add(label);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 14), new THREE.MeshStandardMaterial({ color: '#e8187a', roughness: 0.3, metalness: 0.5 }));
  cap.position.y = 0.211;
  g.add(cap);
  g.scale.setScalar(scale);
  g.userData.liquid = liquid;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Fertige NPC-Looks
export function npcAppearance(kind, seed = 0) {
  const skins = OPTIONS.skin.slice(0, 6);
  const base = { ...defaultAppearance(), skin: skins[seed % skins.length], accessory: 'none', glasses: 'none', jewelry: 'none' };
  switch (kind) {
    case 'dealer': return { ...base, top: 'shirt', topColor: '#ffffff', jacket: 'blazer', jacketColor: '#111111', pants: 'suit', pantsColor: '#111111', shoes: 'loafers', shoesColor: '#111111', hair: ['short', 'quiff', 'bun', 'none'][seed % 4], hairColor: OPTIONS.hairColor[seed % 5], beard: seed % 3 === 0 ? 'mustache' : 'none', hat: 'none' };
    case 'vipdealer': return { ...npcAppearance('dealer', seed), jacket: 'blazer', jacketColor: '#7a1230', jewelry: 'watch', glasses: seed % 2 ? 'monocle' : 'none' };
    case 'mafia': return { ...base, top: 'shirt', topColor: '#222222', jacket: 'blazer', jacketColor: '#151515', pants: 'suit', pantsColor: '#151515', shoes: 'loafers', shoesColor: '#111111', hat: 'fedora', hatColor: '#1a1a1a', glasses: 'shades', beard: ['stubble', 'full', 'mustache', 'goatee'][seed % 4], brows: 'angry', eyes: 'angry', hair: 'short', hairColor: '#1b1210', jewelry: 'goldchain' };
    case 'bartender': return { ...base, top: 'shirt', topColor: '#f2f2f2', jacket: 'none', pants: 'suit', pantsColor: '#222', hair: 'quiff', hairColor: '#1b1210', beard: 'full', hat: 'none' };
    case 'shopkeeper': return { ...base, top: 'shirt', topColor: '#9b5de5', jacket: 'gold', pants: 'suit', pantsColor: '#111', hat: 'fez', glasses: 'round', beard: 'mustache', jewelry: 'goldchain', accessory: 'moneybag' };
    case 'staff': return { ...base, skin: '#c68642', top: 'shirt', topColor: '#ffffff', jacket: 'blazer', jacketColor: '#0f0f18', pants: 'suit', pantsColor: '#0f0f18', shoes: 'loafers', shoesColor: '#111', hair: 'short', hairColor: '#e8e8e8', beard: 'full', brows: 'thick', glasses: 'round', jewelry: 'watch' };
    case 'guest': return { ...defaultAppearance(), top: OPTIONS.top[seed % 5][0], hat: ['none', 'none', 'cap', 'fez', 'fedora'][seed % 5] };
  }
  return base;
}

// ───────────────────────── First-Person-Hände ─────────────────────────
export class FPHands {
  constructor(appearance) {
    this.group = new THREE.Group();
    this.t = 0;
    this.action = null;
    this.actionT = 0;
    this.item = null;
    this.build(appearance);
  }
  build(a) {
    this.group.clear();
    const skin = mat(a.skin, { rough: 0.55 });
    const sleeveColor = a.jacket !== 'none' ? (a.jacket === 'gold' ? '#d4af37' : a.jacketColor) : a.top === 'tank' ? a.skin : a.topColor;
    const sleeve = mat(sleeveColor);
    this.hands = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(capsule(0.05, 0.3), sleeve);
      arm.rotation.x = Math.PI / 2;
      arm.position.z = 0.17;
      g.add(arm);
      const hand = new THREE.Mesh(sphere(0.065), skin);
      hand.scale.set(1, 0.8, 1.2);
      g.add(hand);
      const thumb = new THREE.Mesh(sphere(0.028), skin);
      thumb.position.set(-s * 0.05, 0.02, -0.02);
      g.add(thumb);
      g.position.set(s * 0.26, -0.27, -0.45);
      g.userData.base = g.position.clone();
      g.userData.side = s;
      this.group.add(g);
      this.hands.push(g);
    }
    this.group.traverse(o => { if (o.isMesh) { o.renderOrder = 5; o.castShadow = false; } });
  }
  play(action) { this.action = action; this.actionT = 0; }
  holdItem(obj) {
    if (this.item) this.hands[1].remove(this.item);
    this.item = obj;
    if (obj) { obj.position.set(0, 0.09, -0.04); this.hands[1].add(obj); this.itemT = 2.5; }
  }
  update(dt, moving, seated) {
    this.t += dt;
    const bobK = moving ? 1 : 0.2;
    for (const h of this.hands) {
      const s = h.userData.side;
      const b = h.userData.base;
      h.position.set(
        b.x * (seated ? 1.25 : 1) + Math.sin(this.t * (moving ? 9 : 1.5)) * 0.012 * bobK * s,
        b.y + Math.abs(Math.cos(this.t * (moving ? 9 : 1.5))) * 0.018 * bobK + (seated ? -0.1 : 0),
        b.z + (seated ? 0.02 : 0),
      );
      h.rotation.set(0, 0, 0);
    }
    if (this.action) {
      this.actionT += dt;
      const k = Math.min(1, this.actionT / 0.5);
      const arc = Math.sin(k * Math.PI);
      const h = this.hands[1];
      if (this.action === 'toss') { h.position.z -= arc * 0.25; h.position.y += arc * 0.1; h.rotation.x = -arc * 0.8; }
      else if (this.action === 'tap') { h.position.y -= arc * 0.08; h.position.z -= arc * 0.12; }
      else if (this.action === 'pull') { h.position.y -= arc * 0.18; h.rotation.x = arc * 0.6; }
      else if (this.action === 'cheer') { for (const hh of this.hands) { hh.position.y += arc * 0.35; } }
      else if (this.action === 'roll') { h.position.z -= arc * 0.3; h.rotation.x = -arc * 1.4; h.position.y += arc * 0.15; }
      if (k >= 1) this.action = null;
    }
    if (this.item) {
      this.itemT -= dt;
      this.item.rotation.y += dt * 3;
      this.hands[1].position.y += 0.08;
      if (this.itemT < 0) this.holdItem(null);
    }
  }
}
