// Eigene Identität für jedes der 15 Stockwerke: Architektur, Boden, Wände, Licht, Möbel, Deko, Musik und NPCs.
// Stockwerk 1 ist eine schäbige Hinterhof-Spielhalle, die mittleren Etagen werden professioneller,
// ab Stock 10 wird es extrem luxuriös.
import * as THREE from 'three';
import { M, mesh, neonSign, plant, palm, pillar, chandelier, pendantLamp, sofa, skylineWindow, painting, velvetRope } from './props.js';
import { woodTexture, skylineTexture } from '../textures.js';

// floor/wall: [kind, a, b, c] · trim: Sockel/Abschluss · lamps: Deckenbeleuchtung · props: Set-Pieces dieses Stockwerks
export const FLOOR_STYLES = {
  1: { name: 'Hinterhof', floor: ['concrete', '#5a5852', '#4a4842', '#888'], wall: ['brick', '#6a3a2a', '#5a2e22', '#3a3430'], ceil: '#1c1a18', H: 3.6,
    light: '#d8f0ff', lights: 0.75, neon: '#7cff6b', trim: 'dark', pillars: 'concrete', lamps: 'tube', plant: 'none', windows: null, bar: false, vip: false,
    props: ['vending', 'vending', 'bins', 'boxes', 'boxes', 'plasticChairs', 'graffiti'], signs: ['OPEN 24/7', 'NO REFUNDS'], music: 'lofi', npc: { count: 4, kind: 'shabby' } },
  2: { name: 'Neon', floor: ['checker', '#141414', '#2a0a2a', '#ff3cac'], wall: ['stripes', '#120818', '#1a0a26', '#ff3cac'], ceil: '#07040c', H: 4.2,
    light: '#ff9ce0', lights: 0.85, neon: '#2bd9fe', trim: 'neon', pillars: 'neon', lamps: 'spot', plant: 'none', windows: null, bar: false, vip: false,
    props: ['arcade', 'arcade', 'arcade', 'neonPalm', 'neonPalm', 'bins'], signs: ['NEON CORNER', 'PLAY', 'WIN WIN WIN'], music: 'synth', npc: { count: 5, kind: 'casual' } },
  3: { name: 'Keller', floor: ['wood', '#4a2e1a', '#3e2614', '#222'], wall: ['brick', '#5a3424', '#4a2a1c', '#2a2420'], ceil: '#1a120c', H: 3.4,
    light: '#ffc27a', lights: 0.85, neon: '#ffb347', trim: 'wood', pillars: 'wood', lamps: 'bulbs', plant: 'plant', windows: null, bar: true, vip: false, beams: true,
    props: ['barrels', 'barrels', 'crates', 'crates', 'stringLights', 'dartboard'], signs: ['LUCKY BASEMENT'], music: 'lofi', npc: { count: 6, kind: 'casual' } },
  4: { name: 'Downtown', floor: ['tiles', '#d8d2c4', '#bdb5a4', '#8a6a3a'], wall: ['stripes', '#2a3040', '#323a4c', '#c9a050'], ceil: '#14161c', H: 4.8,
    light: '#fff4e0', lights: 1.0, neon: '#ffd97a', trim: 'chrome', pillars: 'deco', lamps: 'pendant', plant: 'plant', windows: 'day', bar: true, vip: false,
    props: ['kiosk', 'plants', 'plants', 'benches'], signs: ['DOWNTOWN'], music: 'jazz', npc: { count: 7, kind: 'smart' } },
  5: { name: 'Palmen', floor: ['sand', '#d9c08a', '#c8ab70', '#efe0b0'], wall: ['bamboo', '#c8a060', '#9a7038', '#5a3a18'], ceil: '#2a1e10', H: 5,
    light: '#ffe2a8', lights: 1.05, neon: '#7cff6b', trim: 'wood', pillars: 'bamboo', lamps: 'pendant', plant: 'palm', windows: null, bar: true, vip: false,
    props: ['tiki', 'tiki', 'tiki', 'tiki', 'palms', 'palms', 'parrot'], signs: ['ALOHA', 'GOLDEN PALM'], music: 'tropical', npc: { count: 7, kind: 'tropical' } },
  6: { name: 'Fortune', floor: ['carpet2', '#6a0f12', '#7a1416', '#e2b65a'], wall: ['damask', '#7a1012', '#a01818', '#ffd97a'], ceil: '#200606', H: 5,
    light: '#ffcf9a', lights: 1.05, neon: '#ffd700', trim: 'gold', pillars: 'red', lamps: 'lanterns', plant: 'plant', windows: null, bar: true, vip: false,
    props: ['luckyCat', 'luckyCat', 'dragon', 'gong'], signs: ['FORTUNE HALL', '福'], music: 'pentatonic', npc: { count: 8, kind: 'smart' } },
  7: { name: 'Club', floor: ['wood', '#5a3418', '#4a2a12', '#222'], wall: ['wood', '#4a2a14', '#3e2410', '#d4af37'], ceil: '#140c06', H: 5,
    light: '#ffd9a0', lights: 1.0, neon: '#ffd97a', trim: 'gold', pillars: 'marble', lamps: 'chandelier', plant: 'plant', windows: null, bar: true, vip: true,
    props: ['bookshelf', 'bookshelf', 'fireplace', 'leatherSofa', 'leatherSofa'], signs: ['MILLIONAIRES CLUB'], music: 'jazz', npc: { count: 8, kind: 'smart' } },
  8: { name: 'Velvet', floor: ['carpet', 2], wall: ['velvet', '#4a0f5a', '#2a0838', '#000'], ceil: '#10040f', H: 5.2,
    light: '#e8a8ff', lights: 1.05, neon: '#ff3cac', trim: 'gold', pillars: 'gold', lamps: 'chandelier', plant: 'none', windows: null, bar: true, vip: true,
    props: ['stage', 'curtains', 'curtains', 'ropes'], signs: ['VELVET LOUNGE'], music: 'jazz', npc: { count: 9, kind: 'smart' } },
  9: { name: 'Sapphire', floor: ['ice', '#9fd8ff', '#3a7ab8', '#ffffff'], wall: ['stripes', '#0a2a4a', '#0e3460', '#7cf9ff'], ceil: '#030a16', H: 5.4,
    light: '#bfe6ff', lights: 1.1, neon: '#7cf9ff', trim: 'chrome', pillars: 'crystal', lamps: 'chandelier', plant: 'none', windows: null, bar: true, vip: true,
    props: ['aquarium', 'aquarium', 'crystals', 'crystals'], signs: ['SAPPHIRE ROOM'], music: 'ambient', npc: { count: 9, kind: 'vip' } },
  10: { name: 'Royale', floor: ['carpet', 4], wall: ['damask', '#3a0a10', '#5a1018', '#ffd97a'], ceil: '#140306', H: 5.8,
    light: '#ffe7b0', lights: 1.2, neon: '#ffd97a', trim: 'gold', pillars: 'gold', lamps: 'chandelier', plant: 'palm', windows: 'night', bar: true, vip: true, redCarpet: true,
    props: ['banners', 'banners', 'throne', 'lions'], signs: ['VIP ROYALE'], music: 'royal', npc: { count: 10, kind: 'vip' } },
  11: { name: 'Deck', floor: ['deck', '#8a5a30', '#7a4e28', '#c9c9c9'], wall: ['wood', '#e8e0d0', '#d8d0c0', '#1a3a6a'], ceil: '#0c1422', H: 5.4,
    light: '#fff4dc', lights: 1.15, neon: '#7cf9ff', trim: 'chrome', pillars: 'chrome', lamps: 'pendant', plant: 'palm', windows: 'sea', bar: true, vip: true,
    props: ['portholes', 'shipWheel', 'lifeRings', 'railing'], signs: ['DIAMOND DECK'], music: 'tropical', npc: { count: 10, kind: 'vip' } },
  12: { name: 'Sky', floor: ['tiles', '#2a2e38', '#1e222a', '#c0c8d8'], wall: ['stars', '#05081a', '#101a3a', '#ffffff'], ceil: '#02030a', ceilStars: true, H: 6,
    light: '#dfe8ff', lights: 1.2, neon: '#c0c8ff', trim: 'chrome', pillars: 'chrome', lamps: 'spot', plant: 'palm', windows: 'night', bar: true, vip: true,
    props: ['telescope', 'plants', 'plants', 'lounge'], signs: ['PLATINUM SKY'], music: 'synth', npc: { count: 11, kind: 'vip' } },
  13: { name: 'High Roller', floor: ['carpet', 4], wall: ['stripes', '#0a0a0a', '#141414', '#d4af37'], ceil: '#050403', H: 6,
    light: '#ffe7b0', lights: 1.25, neon: '#ffd97a', trim: 'gold', pillars: 'gold', lamps: 'chandelier', plant: 'palm', windows: 'night', bar: true, vip: true, luxury: true, redCarpet: true,
    props: ['goldBars', 'goldBars', 'statues'], signs: ['HIGH ROLLER'], music: 'royal', npc: { count: 11, kind: 'royal' } },
  14: { name: 'Luxus', floor: ['carpet', 5], wall: ['damask', '#2a1c08', '#3a280c', '#ffd97a'], ceil: '#0a0702', H: 6.2,
    light: '#fff0c8', lights: 1.3, neon: '#ffd700', trim: 'gold', pillars: 'gold', lamps: 'chandelier', plant: 'palm', windows: 'night', bar: true, vip: true, luxury: true, redCarpet: true,
    props: ['waterfall', 'statues', 'statues', 'goldBars'], signs: ['LUXUS'], music: 'royal', npc: { count: 12, kind: 'royal' } },
  15: { name: 'Final', floor: ['carpet', 5], wall: ['stripes', '#0a0612', '#120a1f', '#ffd700'], ceil: '#04020a', ceilStars: true, H: 6.6,
    light: '#fff2d0', lights: 1.35, neon: '#ffd700', trim: 'gold', pillars: 'gold', lamps: 'chandelier', plant: 'palm', windows: 'night', bar: true, vip: true, luxury: true, redCarpet: true,
    props: ['crownGiant', 'chipPyramid', 'chipPyramid', 'lightShow', 'statues'], signs: ['THE ULTIMATE CASINO'], music: 'royal', npc: { count: 12, kind: 'royal' } },
};
export const floorStyle = n => FLOOR_STYLES[n] || FLOOR_STYLES[1];

// ───────────────────────── Platzsuche für Deko ─────────────────────────
// Bodenplatz an einer Wand (Rücken zur Wand) oder frei im Raum, ohne Tische, Laufwege, Aufzug und Mafia-Bühne
function floorSpot(w, r, wallFirst = true) {
  const { W, D } = w;
  const cands = [];
  const step = 1.4;
  if (wallFirst) {
    for (let x = -W / 2 + 1.5; x < W / 2 - 1.5; x += step) cands.push([x, -D / 2 + r + 0.35, 0]);
    for (let z = -D / 2 + 1.5; z < D / 2 - 1.5; z += step) { cands.push([-W / 2 + r + 0.35, z, Math.PI / 2]); cands.push([W / 2 - r - 0.35, z, -Math.PI / 2]); }
  } else {
    for (let x = -W / 2 + 2; x < W / 2 - 2; x += step) for (let z = -D / 2 + 2; z < D / 2 - 2; z += step) cands.push([x, z, Math.random() * Math.PI * 2]);
  }
  // Zufällige, aber pro Stockwerk feste Reihenfolge
  let seed = w.n * 9301 + cands.length;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  for (const [x, z, ry] of cands) if (w.isFree(x, z, r)) { w.decoBlocks.push({ x, z, r }); return { x, z, ry }; }
  return null;
}
function place(w, obj, r, wallFirst = true, collide = true) {
  const p = floorSpot(w, r, wallFirst);
  if (!p) return null;
  obj.position.set(p.x, obj.position.y, p.z);
  obj.rotation.y = p.ry;
  obj.userData.static ??= true;
  w.scene.add(obj);
  if (collide) w.addCircle(p.x, p.z, r * 0.8);
  return obj;
}
// Stelle an einer Wand (Höhe y), z. B. für Schilder, Bullaugen, Vorhänge
function wallSpot(w, width) {
  const { W, D } = w;
  const opts = [];
  for (let x = -W / 2 + 2; x < W / 2 - 2; x += 1.2) opts.push({ x, z: -D / 2 + 0.06, ry: 0 });
  for (let z = -D / 2 + 3; z < D / 2 - 6; z += 1.2) { opts.push({ x: -W / 2 + 0.06, z, ry: Math.PI / 2 }); opts.push({ x: W / 2 - 0.06, z, ry: -Math.PI / 2 }); }
  let seed = w.n * 7 + 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  for (const o of opts) {
    if (w.wallUsed.some(u => Math.hypot(u.x - o.x, u.z - o.z) < (u.w + width) / 2 + 0.3)) continue;
    w.wallUsed.push({ ...o, w: width });
    return o;
  }
  return null;
}
function onWall(w, obj, width, y) {
  const o = wallSpot(w, width);
  if (!o) return null;
  obj.position.set(o.x, y, o.z);
  obj.rotation.y = o.ry;
  w.scene.add(obj);
  return obj;
}

// ───────────────────────── Set-Pieces ─────────────────────────
const glowCache = {};
const glowMat = (c, i = 2) => (glowCache[c + i] ||= Object.assign(M.glow(c, i), { userData: { shared: true } }));

export const PROPS = {
  vending(w) {
    const g = new THREE.Group();
    const col = ['#c8102e', '#1d6fd8', '#20a050'][w.decoBlocks.length % 3];
    g.add(mesh(new THREE.BoxGeometry(0.9, 1.9, 0.75), M.std(col, 0.5, 0.2), 0, 0.95, 0));
    g.add(mesh(new THREE.BoxGeometry(0.6, 1.2, 0.02), glowMat('#e8f6ff', 1.2), -0.08, 1.15, 0.38, { cast: false }));
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 8), M.std(['#ff5050', '#ffd23c', '#50a0ff', '#50ff90'][(i + k) % 4], 0.4), -0.28 + k * 0.2, 0.75 + i * 0.27, 0.32));
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.4, 0.03), M.std('#222', 0.4), 0.33, 1.2, 0.38));
    place(w, g, 0.6);
  },
  bins(w) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.75, 14), M.std('#3a4a3a', 0.7, 0.3), 0, 0.375, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 14), M.std('#2a3a2a', 0.6, 0.3), 0, 0.77, 0));
    for (let i = 0; i < 3; i++) { const c = mesh(new THREE.SphereGeometry(0.08, 6, 5), M.std('#d8d0b8', 0.9), (i - 1) * 0.12, 0.84, 0.05 * i); g.add(c); }
    place(w, g, 0.35);
  },
  boxes(w) {
    const g = new THREE.Group();
    const cb = M.std('#a0784a', 0.9);
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), cb, 0, 0.225, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.4, 0.45), cb, 0.05, 0.65, 0.02));
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.35, 0.4), cb, 0.55, 0.175, 0.15));
    place(w, g, 0.55);
  },
  plasticChairs(w) {
    const g = new THREE.Group();
    const pm = M.std('#e8e8e8', 0.6);
    for (const dx of [-0.35, 0.35]) {
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.04, 0.45), pm, dx, 0.45, 0));
      g.add(mesh(new THREE.BoxGeometry(0.45, 0.45, 0.04), pm, dx, 0.68, -0.2));
      for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), pm, dx + lx, 0.225, lz));
    }
    place(w, g, 0.6);
  },
  graffiti(w) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.font = '90px "Bungee", Impact'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#111'; g.strokeText('AYRIS', 256, 128);
    const grd = g.createLinearGradient(0, 0, 512, 0); grd.addColorStop(0, '#ff3cac'); grd.addColorStop(0.5, '#ffd23c'); grd.addColorStop(1, '#2bd9fe');
    g.fillStyle = grd; g.fillText('AYRIS', 256, 128);
    g.fillStyle = '#fff'; g.font = '28px "Bungee", Impact'; g.fillText('was here', 380, 200);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    onWall(w, new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9 })), 2.4, 1.6);
  },
  arcade(w) {
    const g = new THREE.Group();
    const col = ['#3a0a5a', '#0a2a5a', '#5a0a2a'][w.decoBlocks.length % 3];
    g.add(mesh(new THREE.BoxGeometry(0.75, 1.75, 0.8), M.std(col, 0.5), 0, 0.875, 0));
    const scr = M.glow('#2bd9fe', 1.6);
    const screen = mesh(new THREE.PlaneGeometry(0.55, 0.42), scr, 0, 1.3, 0.405, { cast: false });
    g.add(screen);
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.08, 0.3), M.std('#111', 0.4), 0, 0.95, 0.45));
    g.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), M.glow('#ff3cac', 2), -0.15, 1.01, 0.48));
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.16, 0.05), glowMat('#ff3cac', 1.4), 0, 1.66, 0.41, { cast: false }));
    if (place(w, g, 0.6)) w.updaters.push((dt, t) => scr.emissive.setHSL((t * 0.15 + g.position.x * 0.1) % 1, 0.9, 0.5));
  },
  neonPalm(w) {
    const g = new THREE.Group();
    const trunk = glowMat('#ffb347', 2.2), leaf = glowMat('#7cff6b', 2.2);
    for (let i = 0; i < 6; i++) { const s = mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 12), trunk, 0, 0.3 + i * 0.3, 0, { cast: false }); s.rotation.x = Math.PI / 2; g.add(s); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const l = mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 16, Math.PI * 0.8), leaf, Math.cos(a) * 0.3, 2.0, Math.sin(a) * 0.3, { cast: false }); l.rotation.set(Math.PI / 2, 0, a); g.add(l); }
    place(w, g, 0.6);
  },
  barrels(w) {
    const g = new THREE.Group();
    const wood = M.std('#6a4020', 0.8, 0, { map: woodTexture('#6a4020') }), ring = M.std('#444', 0.4, 0.8);
    for (const [x, y, z] of [[0, 0, 0], [0.62, 0, 0.1], [0.3, 0.75, 0.05]]) {
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.72, 16), wood, x, y + 0.36, z));
      for (const yy of [0.12, 0.6]) g.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 16), ring, x, y + yy, z));
    }
    place(w, g, 0.75);
  },
  crates(w) {
    const g = new THREE.Group();
    const wood = M.std('#9a7040', 0.85, 0, { map: woodTexture('#9a7040') });
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), wood, 0, 0.35, 0));
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), wood, 0.1, 0.98, 0));
    place(w, g, 0.6);
  },
  stringLights(w) {
    const { W, D, H } = w;
    const bulb = glowMat('#ffcf7a', 2.5);
    for (let k = 0; k < 4; k++) {
      const z = -D / 2 + (k + 1) * D / 5;
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, x = -W / 2 + 0.5 + t * (W - 1);
        const y = H - 0.25 - Math.sin(t * Math.PI) * 0.6;
        const b = mesh(new THREE.SphereGeometry(0.05, 8, 6), bulb, x, y, z, { cast: false });
        b.userData.noLod = true;
        w.scene.add(b);
      }
    }
  },
  dartboard(w) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const ring = mesh(new THREE.CylinderGeometry(0.3 - i * 0.055, 0.3 - i * 0.055, 0.03 + i * 0.002, 24), M.std(i % 2 ? '#111' : '#e8e0c8', 0.7), 0, 0, 0); ring.rotation.x = Math.PI / 2; g.add(ring); }
    g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), M.std('#c8102e', 0.5), 0, 0, 0.03));
    onWall(w, g, 0.8, 1.7);
  },
  kiosk(w) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.1, 20), M.std('#2a3040', 0.4, 0.4), 0, 0.55, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20), M.std('#c9a050', 0.3, 0.8), 0, 1.13, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 10), M.std('#c9a050', 0.3, 0.8), 0, 1.75, 0));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 0.05), glowMat('#ffd97a', 1.2), 0, 2.4, 0, { cast: false }));
    place(w, g, 0.75, false);
  },
  plants(w) { const p = plant(1.6); place(w, p, 0.45); },
  palms(w) { const p = palm(3); place(w, p, 0.5); },
  benches(w) {
    const g = new THREE.Group();
    const wd = M.std('#6a4a2a', 0.7), mt = M.std('#222', 0.4, 0.7);
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), wd, 0, 0.45, 0));
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.4, 0.05), wd, 0, 0.7, -0.2));
    for (const x of [-0.8, 0.8]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.45), mt, x, 0.225, 0));
    place(w, g, 1.0);
  },
  tiki(w) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 8), M.std('#6a4020', 0.8), 0, 0.85, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.2, 10), M.std('#3a2210', 0.8), 0, 1.75, 0));
    const flame = mesh(new THREE.ConeGeometry(0.09, 0.3, 10), M.glow('#ff8a2a', 3), 0, 2.0, 0, { cast: false });
    g.add(flame);
    if (place(w, g, 0.3)) w.updaters.push((dt, t) => { const k = 1 + Math.sin(t * 13 + g.position.x) * 0.12 + Math.sin(t * 7.3) * 0.08; flame.scale.set(k, 1.1 / k + 0.1, k); });
  },
  parrot(w) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), M.std('#6a4020', 0.8), 0, 0.7, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), M.std('#6a4020', 0.8), 0, 1.4, 0).rotateZ(Math.PI / 2));
    const bird = new THREE.Group(); bird.position.set(0.05, 1.55, 0);
    bird.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), M.std('#e8302a', 0.5), 0, 0, 0));
    bird.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), M.std('#ffd23c', 0.5), 0, 0.12, 0.03));
    bird.add(mesh(new THREE.ConeGeometry(0.03, 0.07, 6), M.std('#222', 0.4), 0, 0.11, 0.1).rotateX(Math.PI / 2));
    bird.add(mesh(new THREE.ConeGeometry(0.05, 0.25, 6), M.std('#2a7ad8', 0.5), 0, -0.12, -0.08).rotateX(-2.6));
    g.add(bird);
    if (place(w, g, 0.4)) { bird.userData.noBake = true; w.updaters.push((dt, t) => { bird.rotation.y = Math.sin(t * 0.8) * 0.6; bird.position.y = 1.55 + Math.abs(Math.sin(t * 3)) * 0.02; }); }
  },
  luckyCat(w) {
    const g = new THREE.Group();
    const wm = M.std('#f8f4ec', 0.4), gm = M.gold();
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), M.std('#7a1012', 0.6), 0, 0.3, 0));
    g.add(mesh(new THREE.SphereGeometry(0.28, 16, 12), wm, 0, 0.85, 0));
    g.add(mesh(new THREE.SphereGeometry(0.24, 16, 12), wm, 0, 1.25, 0.02));
    for (const s of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.07, 0.14, 8), wm, s * 0.14, 1.46, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), gm, 0, 0.85, 0.27).rotateX(Math.PI / 2));
    g.add(mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 16), M.std('#c8102e', 0.5), 0, 1.08, 0.08).rotateX(Math.PI / 2));
    const paw = new THREE.Group(); paw.position.set(0.24, 1.05, 0.05);
    paw.add(mesh(new THREE.CapsuleGeometry(0.06, 0.18, 4, 8), wm, 0, 0.12, 0));
    g.add(paw);
    if (place(w, g, 0.55)) { paw.userData.noBake = true; w.updaters.push((dt, t) => { paw.rotation.x = Math.sin(t * 3 + g.position.z) * 0.5 - 0.2; }); }
  },
  dragon(w) {
    const g = new THREE.Group();
    const gm = M.gold();
    g.add(mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.4, 20), M.std('#3a0606', 0.5), 0, 0.2, 0));
    const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector3(Math.sin(t * Math.PI * 3) * 0.35, 0.5 + t * 1.6, Math.cos(t * Math.PI * 3) * 0.35)); }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.09, 8), gm));
    const head = pts.at(-1);
    g.add(mesh(new THREE.SphereGeometry(0.17, 14, 10), gm, head.x, head.y + 0.08, head.z));
    for (const s of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.04, 0.22, 6), gm, head.x + s * 0.09, head.y + 0.28, head.z - 0.05));
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), M.glow('#ff2020', 2.5), head.x + s * 0.07, head.y + 0.12, head.z + 0.14, { cast: false }));
    place(w, g, 0.8);
  },
  gong(w) {
    const g = new THREE.Group();
    const wd = M.std('#3a0606', 0.5);
    for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.1, 2, 0.1), wd, x, 1, 0));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), wd, 0, 2, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 28), M.gold(), 0, 1.25, 0).rotateX(Math.PI / 2));
    place(w, g, 0.8);
  },
  bookshelf(w) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.8, 2.4, 0.4), M.std('#3a2210', 0.6), 0, 1.2, 0));
    const cols = ['#7a1230', '#1d3557', '#2a5a3a', '#c9a050', '#4a2a5a'];
    for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) g.add(mesh(new THREE.BoxGeometry(0.15, 0.4 + (i * 7 % 3) * 0.05, 0.3), M.std(cols[(i + r) % 5], 0.7), -0.72 + i * 0.18, 0.35 + r * 0.55, 0.06));
    if (!onWall(w, g, 1.9, 0)) return;
    w.addCircle(g.position.x, g.position.z, 0.5);
    // Geheimnis (nur im ersten Regal): ein rotes Buch steht etwas vor – E zieht daran
    if (w.secretShelf || w.n !== 7) return;
    w.secretShelf = true;
    const book = mesh(new THREE.BoxGeometry(0.15, 0.45, 0.3), M.std('#b3122e', 0.5), 0.54, 1.47, 0.14);
    book.userData.noBake = true;
    g.add(book);
    const fwd = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
    const pos = g.position.clone().addScaledVector(fwd, 0.9);
    w.addInteract({ pos, radius: 0.9, verb: '???', label: '???', enabled: () => !w.app.hasSecret('club_book'),
      action: () => { book.rotation.x = -0.5; book.position.z = 0.22; w.app.findSecret('club_book'); } });
  },
  fireplace(w) {
    const g = new THREE.Group();
    const st = M.std('#d8cfc0', 0.5, 0, {});
    g.add(mesh(new THREE.BoxGeometry(2.2, 1.6, 0.6), st, 0, 0.8, 0));
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.9, 0.1), M.std('#111', 0.9), 0, 0.6, 0.27));
    const fire = mesh(new THREE.ConeGeometry(0.35, 0.6, 12), M.glow('#ff7a1a', 3), 0, 0.45, 0.2, { cast: false });
    g.add(fire);
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.1, 0.7), M.std('#3a2210', 0.5), 0, 1.65, 0));
    if (onWall(w, g, 2.4, 0)) { fire.userData.noBake = true; w.addCircle(g.position.x, g.position.z, 0.8); w.updaters.push((dt, t) => { const k = 1 + Math.sin(t * 11) * 0.1 + Math.sin(t * 17) * 0.06; fire.scale.set(k, 1 / k, k); }); }
  },
  leatherSofa(w) { const s = sofa('#4a2410', 2.2); place(w, s, 1.2); },
  stage(w) {
    const { D, W } = w;
    const g = new THREE.Group();
    g.position.set(-W / 4, 0, -D / 2 + 1.6);
    g.add(mesh(new THREE.BoxGeometry(4, 0.3, 2.2), M.std('#1a0a1a', 0.4), 0, 0.15, 0));
    g.add(mesh(new THREE.BoxGeometry(4.1, 0.06, 2.3), M.gold(), 0, 0.31, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6), M.std('#222', 0.3, 0.8), 0, 1.05, 0));
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), M.std('#333', 0.3, 0.8), 0, 1.82, 0));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe0ff', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.set(0, 1.9, 0);
    g.add(cone);
    if (w.isFree(g.position.x, g.position.z, 1.5)) { w.scene.add(g); w.addBox(g.position.x, g.position.z, 4, 2.2); w.decoBlocks.push({ x: g.position.x, z: g.position.z, r: 2.2 }); }
  },
  curtains(w) {
    const geo = new THREE.PlaneGeometry(2.2, 3.4, 24, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.07);
    geo.computeVertexNormals();
    onWall(w, mesh(geo, M.std('#5a0a6a', 0.95), 0, 0, 0, { cast: false }), 2.2, 1.75);
  },
  ropes(w) { const r = velvetRope(2.4); place(w, r, 1.2, false); },
  aquarium(w) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(3.2, 2.2, 0.3), M.std('#0a1420', 0.4, 0.4), 0, 1.4, -0.05));
    const water = mesh(new THREE.PlaneGeometry(3, 1.9), M.glow('#1a6ab8', 0.9), 0, 1.4, 0.11, { cast: false });
    g.add(water);
    const fish = [];
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Group();
      f.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), M.glow(['#ffb347', '#ff3cac', '#7cff6b', '#ffd23c'][i % 4], 1.2), 0, 0, 0, { cast: false }));
      f.add(mesh(new THREE.ConeGeometry(0.06, 0.1, 6), M.glow('#ffd23c', 1), -0.1, 0, 0, { cast: false }).rotateZ(Math.PI / 2));
      f.scale.set(1.3, 0.8, 0.5);
      f.position.set(-1.2 + i * 0.45, 0.8 + (i * 0.37 % 1.4), 0.14);
      f.userData.noBake = true;
      g.add(f); fish.push(f);
    }
    if (onWall(w, g, 3.3, 0)) { w.addCircle(g.position.x, g.position.z, 0.6); w.updaters.push((dt, t) => fish.forEach((f, i) => { f.position.x = Math.sin(t * (0.3 + i * 0.07) + i) * 1.3; f.rotation.y = Math.cos(t * (0.3 + i * 0.07) + i) > 0 ? 0 : Math.PI; f.position.y = 0.6 + (i * 0.37 % 1.4) + Math.sin(t + i) * 0.08; })); }
  },
  crystals(w) {
    const g = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: '#7cc8ff', emissive: '#2a6ab8', emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 5; i++) { const c = mesh(new THREE.OctahedronGeometry(0.3 + (i % 3) * 0.12), cm, (i - 2) * 0.22, 0.5 + (i % 2) * 0.3, (i % 2) * 0.2, { cast: false }); c.scale.y = 2.2; g.add(c); }
    place(w, g, 0.7, false);
  },
  banners(w) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#8a0f24'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#ffd97a'; g.fillRect(0, 0, 128, 10); g.beginPath(); g.moveTo(0, 230); g.lineTo(64, 256); g.lineTo(128, 230); g.lineTo(128, 256); g.lineTo(0, 256); g.fill();
    g.font = '64px serif'; g.textAlign = 'center'; g.fillText('♛', 64, 130);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 2; i++) onWall(w, new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide })), 1.0, w.H - 1.5);
  },
  throne(w) {
    const g = new THREE.Group();
    const gm = M.gold(), red = M.std('#8a0f24', 0.8);
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), M.std('#2a0a0a', 0.5), 0, 0.15, 0));
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.7), gm, 0, 0.55, 0));
    g.add(mesh(new THREE.BoxGeometry(0.66, 0.12, 0.6), red, 0, 0.86, 0.02));
    g.add(mesh(new THREE.BoxGeometry(0.8, 1.6, 0.12), gm, 0, 1.4, -0.32));
    g.add(mesh(new THREE.BoxGeometry(0.6, 1.3, 0.04), red, 0, 1.35, -0.25));
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.1, 12, 8), gm, s * 0.4, 2.25, -0.32));
    place(w, g, 0.9);
  },
  lions(w) {
    for (let k = 0; k < 2; k++) {
      const g = new THREE.Group();
      const gm = M.gold();
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.6, 1.1), M.std('#2a0a0a', 0.5), 0, 0.3, 0));
      g.add(mesh(new THREE.SphereGeometry(0.32, 14, 10), gm, 0, 0.95, -0.15));
      g.add(mesh(new THREE.SphereGeometry(0.3, 14, 10), gm, 0, 1.25, 0.18));
      g.add(mesh(new THREE.TorusGeometry(0.28, 0.1, 8, 16), gm, 0, 1.25, 0.15));
      for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8), gm, s * 0.15, 0.8, 0.35));
      place(w, g, 0.7);
    }
  },
  portholes(w) {
    const sea = new THREE.MeshBasicMaterial({ color: '#ffffff', map: skylineTexture(false), toneMapped: false });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.TorusGeometry(0.42, 0.08, 10, 28), M.std('#b08d57', 0.3, 0.8), 0, 0, 0.02, { cast: false }));
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.4, 28), sea);
      g.add(glass);
      onWall(w, g, 1.0, 2.2);
    }
  },
  shipWheel(w) {
    const g = new THREE.Group();
    const wd = M.std('#6a3a18', 0.6);
    g.add(mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 28), wd));
    for (let i = 0; i < 8; i++) { const sp = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), wd); sp.rotation.z = i / 8 * Math.PI; g.add(sp); }
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12), M.std('#b08d57', 0.3, 0.8)).rotateX(Math.PI / 2));
    onWall(w, g, 1.4, 2.0);
  },
  lifeRings(w) {
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 8; k++) { const seg = mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 6, Math.PI / 4), M.std(k % 2 ? '#ffffff' : '#d81e2a', 0.6)); seg.rotation.z = k * Math.PI / 4; g.add(seg); }
      onWall(w, g, 0.9, 1.8);
    }
  },
  railing(w) {
    const { W, D } = w;
    const ch = M.std('#c0c8d0', 0.2, 0.9);
    const z = -D / 2 + 0.5;
    for (let x = -W / 2 + 2; x < W / 2 - 2; x += 1.2) {
      if (Math.abs(x - W / 4) < 2 || Math.abs(x + W / 2 - 3) < 1.6) continue;
      w.scene.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), ch, x, 0.5, z));
    }
    w.scene.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, W - 4, 8), ch, 0, 1.0, z).rotateZ(Math.PI / 2));
  },
  telescope(w) {
    const g = new THREE.Group();
    const br = M.std('#b08d57', 0.3, 0.8);
    for (let i = 0; i < 3; i++) { const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), br, Math.cos(i * 2.1) * 0.22, 0.6, Math.sin(i * 2.1) * 0.22); leg.rotation.set(Math.sin(i * 2.1) * 0.3, 0, -Math.cos(i * 2.1) * 0.3); g.add(leg); }
    const tube = mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 14), br, 0, 1.35, 0.1);
    tube.rotation.x = -1.1;
    g.add(tube);
    if (!place(w, g, 0.5)) return;
    const fwd = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
    w.addInteract({ pos: g.position.clone().addScaledVector(fwd, -0.7), radius: 1, verb: 'SCHAUEN', label: 'Durch das Teleskop schauen',
      action: () => { if (!w.app.findSecret('sky_star')) w.app.ui.toast('✨ Der Ayri-Stern funkelt dir zu.', 'info'); } });
  },
  lounge(w) { const s = sofa('#c0c8d8', 2.2); place(w, s, 1.2); },
  goldBars(w) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1, 0.9, 1), M.std('#111', 0.3, 0.4), 0, 0.45, 0));
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3 - y; x++) g.add(mesh(new THREE.BoxGeometry(0.25, 0.1, 0.12), M.gold(), -0.25 + x * 0.27 + y * 0.135, 0.95 + y * 0.1, 0));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.95), M.glass('#ffffff', 0.12));
    glass.position.y = 1.2;
    g.add(glass);
    place(w, g, 0.7, false);
  },
  statues(w) {
    const g = new THREE.Group();
    const gm = M.gold();
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.8, 16), M.std('#1a1a1a', 0.3), 0, 0.4, 0));
    g.add(mesh(new THREE.CapsuleGeometry(0.2, 0.6, 6, 12), gm, 0, 1.3, 0));
    g.add(mesh(new THREE.SphereGeometry(0.36, 16, 12), gm, 0, 2.05, 0));
    const arm = mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 8), gm, 0.25, 1.85, 0); arm.rotation.z = -2.4; g.add(arm);
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), gm, 0.42, 2.18, 0).rotateZ(-0.5));
    place(w, g, 0.6);
  },
  waterfall(w) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    for (let x = 0; x < 64; x += 4) { g.fillStyle = `rgba(255,${200 + Math.random() * 55},${80 + Math.random() * 80},${0.5 + Math.random() * 0.5})`; g.fillRect(x, 0, 3, 256); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,220,0.8)'; g.fillRect(Math.random() * 64, Math.random() * 256, 2, 14); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, w.H - 0.6), new THREE.MeshStandardMaterial({ map: t, emissive: '#ffd27a', emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.6 }));
    if (onWall(w, m, 3.5, (w.H - 0.6) / 2 + 0.05)) w.updaters.push(dt => { t.offset.y += dt * 0.35; });
  },
  chipPyramid(w) {
    const g = new THREE.Group();
    const cols = ['#d8262f', '#151515', '#7b3fc4', '#f2a516', '#1d6fd8'];
    for (let l = 0; l < 4; l++) for (let x = 0; x < 4 - l; x++) for (let z = 0; z < 4 - l; z++) {
      const stackH = 4;
      for (let k = 0; k < stackH; k++) g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), M.std(cols[(l + x + z + k) % 5], 0.4), (x - (3 - l) / 2) * 0.34, l * stackH * 0.065 + k * 0.065 + 0.03, (z - (3 - l) / 2) * 0.34));
    }
    place(w, g, 0.9, false);
  },
  crownGiant(w) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(1, 1.15, 1, 28), M.std('#111', 0.2, 0.4), 0, 0.5, 0));
    const crown = new THREE.Group(); crown.position.y = 1.9;
    crown.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 28), M.gold()));
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; crown.add(mesh(new THREE.ConeGeometry(0.16, 0.6, 8), M.gold(), Math.cos(a) * 0.75, 0.5, Math.sin(a) * 0.75)); crown.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), M.glow(['#ff2b5a', '#2bd9fe', '#7cff6b'][i % 3], 1.6), Math.cos(a) * 0.82, 0.05, Math.sin(a) * 0.82)); }
    crown.userData.noBake = true;
    g.add(crown);
    const p = floorSpot(w, 1.6, false);
    if (p) { g.position.set(p.x, 0, p.z); w.scene.add(g); w.addCircle(p.x, p.z, 1.2); w.updaters.push(dt => { crown.rotation.y += dt * 0.3; }); }
  },
  lightShow(w) {
    const cols = ['#ff3cac', '#2bd9fe', '#ffd700', '#7cff6b'];
    const cones = [];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.4, w.H, 20, 1, true), new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      c.position.set((i - 1.5) * w.W / 5, w.H / 2, -w.D / 6);
      c.userData.noBake = true;
      w.scene.add(c); cones.push(c);
    }
    w.updaters.push((dt, t) => cones.forEach((c, i) => { c.rotation.z = Math.sin(t * 0.7 + i) * 0.35; c.rotation.x = Math.cos(t * 0.5 + i * 2) * 0.25; }));
  },
};

export function buildProps(w, keys) {
  for (const k of keys || []) PROPS[k]?.(w);
}

// Zusätzliche Neon-Schilder an freien Wandstellen
export function buildSigns(w, signs, color) {
  for (const txt of signs || []) {
    const width = Math.min(4, 0.9 + txt.length * 0.28);
    onWall(w, neonSign(txt, color, width, 0.7), width, w.H - 1.1);
  }
}

// Deckenbeleuchtung je Stil (rein visuell – die echten Lichter bleiben wenige Punktlichter)
export function buildLamps(w, kind, color) {
  const { W, D, H } = w;
  const s = w.scene;
  switch (kind) {
    case 'tube': {
      const flicker = [];
      for (let x = -W / 2 + 3; x < W / 2 - 2; x += 4) for (let z = -D / 2 + 3; z < D / 2 - 3; z += 5) {
        const m = mesh(new THREE.BoxGeometry(1.4, 0.06, 0.14), M.glow('#e8f6ff', 2), x, H - 0.08, z, { cast: false });
        s.add(m);
        if ((x * 7 + z * 3) % 5 < 1) flicker.push(m);
      }
      // Billige Neonröhren: ein paar flackern
      w.updaters.push((dt, t) => { for (const m of flicker) m.material.emissiveIntensity = Math.sin(t * 23 + m.position.x) > 0.85 || Math.random() < 0.02 ? 0.2 : 2; });
      break;
    }
    case 'bulbs':
      for (let x = -W / 2 + 3; x < W / 2 - 2; x += 3.5) for (let z = -D / 2 + 3; z < D / 2 - 3; z += 4) {
        s.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), M.std('#111'), x, H - 0.3, z, { cast: false }));
        s.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), glowMat('#ffcf7a', 3), x, H - 0.65, z, { cast: false }));
      }
      break;
    case 'lanterns':
      for (let x = -W / 2 + 3; x < W / 2 - 2; x += 3) for (let z = -D / 2 + 3; z < D / 2 - 4; z += 3.5) {
        const g = new THREE.Group(); g.position.set(x, H - 0.9, z); g.userData.static = true;
        const ball = mesh(new THREE.SphereGeometry(0.3, 14, 10), glowMat('#ff3a2a', 1.4), 0, 0, 0, { cast: false });
        ball.scale.set(1, 1.25, 1);
        g.add(ball);
        g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12), M.gold(), 0, 0.4, 0, { cast: false }));
        g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12), M.gold(), 0, -0.4, 0, { cast: false }));
        g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.6, 4), M.std('#111'), 0, 0.75, 0, { cast: false }));
        s.add(g);
      }
      break;
    case 'spot':
      for (let x = -W / 2 + 3; x < W / 2 - 2; x += 4) for (const z of [-D / 4, D / 8]) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, H - 0.3, 18, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        c.position.set(x, (H - 0.3) / 2, z);
        s.add(c);
        s.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 12), M.std('#111', 0.4, 0.6), x, H - 0.1, z, { cast: false }));
      }
      break;
    case 'chandelier': {
      const n = Math.min(5, Math.max(2, Math.round(W / 9)));
      for (let i = 0; i < n; i++) { const c = chandelier(1 + (w.tier >= 4 ? 0.3 : 0)); c.position.set((i - (n - 1) / 2) * (W / n), H - 1.2, 0); s.add(c); }
      break;
    }
    case 'pendant': default:
      for (let x = -W / 2 + 4; x < W / 2 - 2; x += 5) { const p = pendantLamp(color); p.position.set(x, H - 1.3, 0); s.add(p); }
  }
}

// Säulen je Stil
export function buildPillars(w, kind) {
  if (kind === 'none') return;
  const { W, D, H } = w;
  const mats = {
    concrete: M.std('#8a8680', 0.9), wood: M.std('#5a3418', 0.7), bamboo: M.std('#c8a060', 0.7), red: M.std('#a01818', 0.5), chrome: M.std('#d0d4dc', 0.15, 0.95),
    neon: null, crystal: null, deco: null, marble: null, gold: null,
  };
  for (const sx of [-1, 1]) for (const z of [-D / 4, D / 4]) {
    const x = sx * (W / 2 - 3.2);
    if (Math.abs(z) < 2 || !w.isFree(x, z, 1.1)) continue;
    let p;
    if (kind === 'marble' || kind === 'gold' || kind === 'deco') p = pillar(H, kind !== 'deco', 0.32);
    else if (kind === 'crystal') {
      p = new THREE.Group();
      p.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, H, 6), new THREE.MeshStandardMaterial({ color: '#9fd8ff', emissive: '#2a6ab8', emissiveIntensity: 0.5, roughness: 0.05, transparent: true, opacity: 0.6 }), 0, H / 2, 0, { cast: false }));
    } else if (kind === 'neon') {
      p = new THREE.Group();
      p.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, H, 12), M.std('#0a0a12', 0.4), 0, H / 2, 0));
      for (let i = 0; i < 3; i++) p.add(mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 20), glowMat(['#ff3cac', '#2bd9fe', '#7cff6b'][i], 2.2), 0, 0.8 + i * (H - 1.2) / 2, 0, { cast: false }).rotateX(Math.PI / 2));
    } else {
      p = new THREE.Group();
      p.add(mesh(new THREE.BoxGeometry(0.5, H, 0.5), mats[kind] || mats.concrete, 0, H / 2, 0));
      if (kind === 'bamboo') for (let i = 1; i < 6; i++) p.add(mesh(new THREE.BoxGeometry(0.54, 0.05, 0.54), M.std('#7a5020', 0.7), 0, i * H / 6, 0));
    }
    p.position.set(x, 0, z);
    p.userData.static = true;
    w.scene.add(p);
    w.addCircle(x, z, 0.45);
    w.decoBlocks.push({ x, z, r: 0.6 });
  }
}

// Fenster je Stil: Tag-Skyline, Nacht-Skyline oder Meer
export function buildWindows(w, kind) {
  if (!kind) return;
  const { W, D, H } = w;
  if (kind === 'sea') {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(D - 8, 18), H - 2), new THREE.MeshBasicMaterial({ map: skylineTexture(false), toneMapped: false, color: '#9fd8ff' }));
    sea.position.set(-W / 2 + 0.05, H / 2 + 0.3, 0); sea.rotation.y = Math.PI / 2;
    w.scene.add(sea);
    return;
  }
  const win = skylineWindow(Math.min(D - 8, 16), H - 1.6, kind === 'night');
  win.position.set(-W / 2 + 0.04, H / 2 + 0.2, 0);
  win.rotation.y = Math.PI / 2;
  w.scene.add(win);
  w.wallUsed.push({ x: -W / 2, z: 0, w: Math.min(D - 8, 16) });
}

export { painting };
