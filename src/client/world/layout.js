// Raumplanung der Casino-Stockwerke (Prompt 12) – ohne Three.js, damit sie im Test läuft.
// Das Casino ist in erkennbare Bereiche gegliedert (ohne Schilder, nur durch Raumgestaltung):
//   SLOTS (links: Automaten-Insel + High-Limit-Reihe), TABLE GAMES (Mitte: Tischinseln),
//   ARCADE / DIGITAL GAMES (rechts: Wandreihe + freistehende Insel), Eye-Catcher (Rückwand: Glücksrad,
//   Money Wheel, Plinko, Duck Race, Penguin Cross), BAR/LOUNGE (hinten rechts). Vom Aufzug führt ein freier
//   Hauptweg (Plaza, gleichzeitig Bühne der Mafia-Szene) in den Raum.
// Der Raum ist so klein wie möglich, aber mit genug Platz: gesucht wird die kleinste Fläche, auf der alle Stationen
// samt Spielerplatz überschneidungsfrei Platz finden.

// Grösse der Arcade-Stationen (Faktor) und ihre Grundbreite
export const ARCADE_SCALE = { crash: 1.4, plinko: 1.35, tower: 1.3, penguin: 1.25, duck: 1.25, moneywheel: 1.3, keno: 1.3, mines: 1.2, hilo: 1.15, streetcraps: 1.15 };
export const ARCADE_BASE_WIDTH = { crash: 2.1, hilo: 2.2, mines: 1.7, tower: 1.7, penguin: 3.4, keno: 1.7, plinko: 2.2, moneywheel: 2.6, duck: 3.4, streetcraps: 2.2 };
export const ARCADE_WIDTH = Object.fromEntries(Object.entries(ARCADE_BASE_WIDTH).map(([k, w]) => [k, +(w * (ARCADE_SCALE[k] || 1)).toFixed(2)]));

const ARCADE = Object.keys(ARCADE_BASE_WIDTH);
const EYE = ['wheel', 'moneywheel', 'plinko', 'duck', 'penguin'];
const PLAZA = { hw: 3.6, d: 8 };           // freier Hauptweg vom Aufzug
const CELL = { w: 3.5, back: 1.55, front: 2.25, aisle: 1.15 }; // Tischinsel inkl. Stühle und Laufweg

// Abmessungen einer Station in lokalen Koordinaten (Spieler steht auf der +z-Seite)
export function itemDims(type) {
  if (type === 'slots' || type === 'highslots') return { w: 1.45, back: 0.95, front: 1.45, bf: 0.4 };
  if (type === 'wheel') return { w: 3.7, back: 0.6, front: 2.6, bf: 1.15 };
  if (ARCADE.includes(type)) { const S = ARCADE_SCALE[type] || 1; return { w: ARCADE_WIDTH[type] + 0.35, back: 0.66 * S, front: 1.85 * S, bf: 0.62 * S }; }
  return { w: CELL.w, back: CELL.back, front: CELL.front, bf: 1.3, center: true };
}

// Achsparalleles Rechteck einer Station: Körper (body) und Spielerplatz davor (stand)
function rects(x, z, rot, d) {
  const fx = Math.round(Math.sin(rot)), fz = Math.round(Math.cos(rot)); // Blickrichtung des Spielers zur Station: -f
  const hw = d.w / 2;
  const box = (a, b) => {
    // Bereich lokal z ∈ [a, b], x ∈ [-hw, hw] → Welt
    const xs = fz !== 0 ? [x - hw, x + hw] : [x + fx * a, x + fx * b].sort((p, q) => p - q);
    const zs = fz !== 0 ? [z + fz * a, z + fz * b].sort((p, q) => p - q) : [z - hw, z + hw];
    return { x0: xs[0], x1: xs[1], z0: zs[0], z1: zs[1] };
  };
  return { body: box(-d.back, d.bf), stand: box(d.bf, d.front) };
}
const overlap = (a, b, m = 0) => a.x0 - m < b.x1 && a.x1 + m > b.x0 && a.z0 - m < b.z1 && a.z1 + m > b.z0;

// Plan für eine feste Raumgrösse – null, wenn nicht alles passt
export function planFloor(defs, W, D, opts = {}) {
  return planVariant(defs, W, D, opts, 0) || planVariant(defs, W, D, opts, 1) || (opts.bar ? planVariant(defs, W, D, opts, 2) : null);
}

// Varianten: 0 = Arcade nur als freistehende Insel, 1 = Insel + Wandreihe rechts,
// 2 = Insel links neben der Bar/Lounge (beginnt ganz hinten) + Wandreihe rechts vor der Lounge
function planVariant(defs, W, D, { bar = false, vip = false } = {}, variant) {
  const rightWallOn = variant > 0;
  const zones = [
    { name: 'plaza', x0: -PLAZA.hw, x1: PLAZA.hw, z0: D / 2 - PLAZA.d, z1: D / 2 },
    { name: 'door', x0: -W / 2 + 1.0, x1: -W / 2 + 5.0, z0: -D / 2, z1: -D / 2 + 2.4 },
    ...(bar ? [{ name: 'bar', x0: W / 2 - 4.9, x1: W / 2, z0: -D / 2, z1: -D / 2 + 11.8 }] : []),
    ...(vip ? [{ name: 'vip', x0: W / 2 - 6.2, x1: W / 2, z0: D / 2 - 7.2, z1: D / 2 - 1.8 }] : []),
    // Pflanzen in den Ecken
    { name: 'corner', x0: -W / 2, x1: -W / 2 + 1.5, z0: -D / 2, z1: -D / 2 + 1.5 },
    { name: 'corner', x0: W / 2 - 1.5, x1: W / 2, z0: -D / 2, z1: -D / 2 + 1.5 },
    { name: 'corner', x0: -W / 2, x1: -W / 2 + 1.5, z0: D / 2 - 1.7, z1: D / 2 },
    { name: 'corner', x0: W / 2 - 1.5, x1: W / 2, z0: D / 2 - 1.7, z1: D / 2 },
  ];
  const by = t => defs.filter(d => d.type === t);
  const slots = by('slots'), high = by('highslots');
  const eye = defs.filter(d => EYE.includes(d.type)).sort((a, b) => itemDims(b.type).w - itemDims(a.type).w);
  const arcade = defs.filter(d => ARCADE.includes(d.type) && !EYE.includes(d.type)).sort((a, b) => itemDims(b.type).w - itemDims(a.type).w);
  const centerDefs = [];
  const byType = {};
  for (const d of defs) if (itemDims(d.type).center) (byType[d.type] ||= []).push(d);
  for (let k = 0; centerDefs.length < Object.values(byType).flat().length; k++) for (const l of Object.values(byType)) if (l[k]) centerDefs.push(l[k]);

  // ── Linien: Stationen nebeneinander, Rückseite an einer Wand oder an der Inselmitte ──
  const lines = {};
  const mk = (name, axis, at, a, b, rot, wall) => { lines[name] = { name, axis, at, a, b, rot, wall, cur: a, items: [] }; };
  const leftWall = high.length > 0;
  const slotBack = 0.95, slotFront = 1.45;
  const lSpine = leftWall ? -W / 2 + slotBack + slotFront + 1.3 + slotFront + slotBack : -W / 2 + slotFront + slotBack + 0.4;
  const leftEnd = (slots.length ? lSpine + slotBack + slotFront : leftWall ? -W / 2 + slotBack + slotFront : -W / 2 + 0.5);
  const zA = -D / 2 + 2.7, zB = D / 2 - 2.0;
  // Slot-Insel (Rücken an Rücken) mittig in der Tiefe
  const islandLen = Math.ceil(slots.length / 2) * 1.45;
  const iz0 = Math.max(zA, (zA + zB) / 2 - islandLen / 2 - 1);
  mk('slotA', 'z', lSpine, iz0, zB, -Math.PI / 2);
  mk('slotB', 'z', lSpine, iz0, zB, Math.PI / 2);
  if (leftWall) mk('leftWall', 'z', -W / 2, zA + 0.6, zB, Math.PI / 2, true);
  // Arcade rechts: Wandreihe + freistehende Insel
  const aB = 0.93, aF = 2.6; // grösste Tiefe hinten/vorne
  const rz0 = bar ? -D / 2 + 12 : -D / 2 + 1.8, rz1 = vip ? D / 2 - 7.4 : D / 2 - 1.8;
  if (rightWallOn) mk('rightWall', 'z', W / 2, rz0, rz1, -Math.PI / 2, true);
  // Inselmitte: mit Wandreihe teilen sich die Spielerplätze einen Gang, sonst reicht der Platz bis zur Wand
  const rSpine = variant === 2 ? W / 2 - 5.0 - aB - aF : rightWallOn ? W / 2 - 2 * aB - 2 * aF + 0.6 : W / 2 - aB - aF - 0.2;
  const riz0 = bar && rSpine + aB + aF > W / 2 - 5.0 ? -D / 2 + 12.2 : -D / 2 + 2.6;
  mk('arcA', 'z', rSpine, riz0, D / 2 - 2.2, Math.PI / 2);
  mk('arcB', 'z', rSpine, riz0, D / 2 - 2.2, -Math.PI / 2);
  // Rückwand: Eye-Catcher
  mk('back', 'x', -D / 2, Math.max(-W / 2 + 5.2, leftEnd + 0.6), bar ? W / 2 - 5.0 : W / 2 - 1.6, 0, true);
  // Vorderwand links/rechts neben dem Aufzug
  mk('frontL', 'x', D / 2, Math.max(-W / 2 + 1.6, leftEnd + 0.6), -PLAZA.hw - 0.4, Math.PI, true);
  mk('frontR', 'x', D / 2, PLAZA.hw + 0.4, vip ? W / 2 - 6.4 : W / 2 - 1.6, Math.PI, true);

  const plan = [];
  const placeIn = (def, order) => {
    const d = itemDims(def.type);
    for (const ln of order.map(n => lines[n]).filter(Boolean)) {
      if (ln.cur + d.w > ln.b + 1e-6) continue;
      const c = ln.cur + d.w / 2;
      ln.cur += d.w;
      let x, z;
      // Rückseite an der Linie: Mittelpunkt um "back" nach vorne versetzt
      const off = d.back;
      if (ln.axis === 'z') { z = c; x = ln.at + Math.sin(ln.rot) * off; }
      else { x = c; z = ln.at + Math.cos(ln.rot) * off; }
      plan.push({ def, x, z, rot: ln.rot, line: ln.name, wall: !!ln.wall, arcade: ARCADE.includes(def.type) ? d.w - 0.35 : 0, dims: d });
      return true;
    }
    return false;
  };
  // Inseln abwechselnd von beiden Seiten befüllen (Rücken an Rücken, gleich lang)
  for (const [i, d] of slots.entries()) if (!placeIn(d, i % 2 ? ['slotB', 'slotA', 'leftWall', 'frontL'] : ['slotA', 'slotB', 'leftWall', 'frontL'])) return null;
  for (const d of high) if (!placeIn(d, ['leftWall', 'slotB', 'frontL'])) return null;
  for (const d of eye) if (!placeIn(d, ['back', 'rightWall', 'arcA', 'arcB', 'frontR', 'frontL'])) return null;
  for (const [i, d] of arcade.entries()) if (!placeIn(d, i % 2 ? ['arcB', 'arcA', 'rightWall', 'frontR', 'back', 'frontL'] : ['arcA', 'arcB', 'rightWall', 'frontR', 'back', 'frontL'])) return null;
  // Ungenutzte Arcade-Insel: Mitte darf weiter nach rechts (kompakter)
  const islandUsed = plan.some(p => p.line === 'arcA' || p.line === 'arcB');
  const rightUsed = plan.some(p => p.line === 'rightWall');
  const backDepth = plan.some(p => p.line === 'back') ? Math.max(...plan.filter(p => p.line === 'back').map(p => p.dims.back + p.dims.front)) : 1.6;
  // ── Tischinseln in der Mitte ──
  const cx0 = leftEnd + 0.7;
  const cx1 = (islandUsed ? rSpine - aB - aF : rightUsed ? W / 2 - aB - aF : bar ? W / 2 - 5.0 : W / 2 - 1.0) - 0.5;
  const cz0 = -D / 2 + backDepth + 0.5;
  const cells = [];
  for (let z = cz0 + CELL.back; z + CELL.front <= D / 2 - 0.8; z += CELL.back + CELL.front + CELL.aisle) {
    const cols = Math.floor((cx1 - cx0) / CELL.w);
    for (let c = 0; c < cols; c++) cells.push({ x: cx0 + (cx1 - cx0 - cols * CELL.w) / 2 + (c + 0.5) * CELL.w, z });
  }
  const taken = [];
  for (const p of plan) { const r = rects(p.x, p.z, p.rot, p.dims); taken.push(r.body, r.stand); }
  const okCell = c => { const r = rects(c.x, c.z, 0, itemDims('blackjack')); const all = { x0: r.body.x0, x1: r.body.x1, z0: r.body.z0, z1: r.stand.z1 }; return !zones.some(zn => overlap(all, zn)) && !taken.some(t => overlap(all, t, 0.3)); };
  const free = cells.filter(okCell).sort((a, b) => a.z - b.z || Math.abs(a.x) - Math.abs(b.x));
  if (free.length < centerDefs.length) return null;
  const chosen = free.slice(0, centerDefs.length).sort((a, b) => a.z - b.z || a.x - b.x);
  centerDefs.forEach((d, i) => plan.push({ def: d, x: chosen[i].x, z: chosen[i].z, rot: 0, center: true, line: 'center', dims: itemDims(d.type) }));

  // ── Prüfung: kein Körper überlappt etwas, Spielerplätze nicht in Zonen/Körpern, alles im Raum ──
  const R = plan.map(p => ({ p, ...rects(p.x, p.z, p.rot, p.dims) }));
  for (let i = 0; i < R.length; i++) {
    const a = R[i];
    for (const r of [a.body, a.stand]) {
      if (r.x0 < -W / 2 - 1e-6 || r.x1 > W / 2 + 1e-6 || r.z0 < -D / 2 - 1e-6 || r.z1 > D / 2 + 1e-6) return null;
      if (zones.some(zn => overlap(r, zn))) return null;
    }
    for (let j = i + 1; j < R.length; j++) {
      const b = R[j];
      if (overlap(a.body, b.body, -0.01) || overlap(a.body, b.stand, -0.01) || overlap(b.body, a.stand, -0.01)) return null;
    }
  }
  for (const p of plan) { const r = rects(p.x, p.z, p.rot, p.dims); p.rect = { x0: r.body.x0, x1: r.body.x1, z0: r.body.z0, z1: r.body.z1 }; p.standRect = r.stand; }
  // Bereiche (für Bodengestaltung)
  const area = list => { if (!list.length) return null; const rs = list.map(p => ({ ...p.rect, x0: Math.min(p.rect.x0, p.standRect.x0), x1: Math.max(p.rect.x1, p.standRect.x1), z0: Math.min(p.rect.z0, p.standRect.z0), z1: Math.max(p.rect.z1, p.standRect.z1) })); return { x0: Math.min(...rs.map(r => r.x0)), x1: Math.max(...rs.map(r => r.x1)), z0: Math.min(...rs.map(r => r.z0)), z1: Math.max(...rs.map(r => r.z1)) }; };
  const areas = {
    slots: area(plan.filter(p => p.def.type === 'slots' || p.def.type === 'highslots')),
    tables: area(plan.filter(p => p.center)),
    arcade: area(plan.filter(p => p.line === 'arcA' || p.line === 'arcB' || p.line === 'rightWall')),
    stage: area(plan.filter(p => p.line === 'back')),
    lounge: bar ? { x0: W / 2 - 4.9, x1: W / 2, z0: -D / 2, z1: -D / 2 + 11.8 } : null,
  };
  return { W, D, plan, zones, areas, rows: [...new Set(plan.filter(p => p.center).map(p => +p.z.toFixed(2)))].sort((a, b) => a - b) };
}

// Kleinste passende Raumgrösse (Fläche), Seitenverhältnis in vernünftigen Grenzen
export function layoutFloor(defs, opts = {}) {
  let best = null;
  const minW = opts.minW || 16, minD = opts.minD || 15;
  for (let D = minD; D <= 40; D++) {
    for (let W = Math.max(minW, Math.ceil(D * 0.8)); W <= Math.min(52, D * 2); W++) {
      if (best && W * D >= best.W * best.D) break;
      const r = planFloor(defs, W, D, opts);
      if (r) { best = r; break; }
    }
  }
  return best;
}
