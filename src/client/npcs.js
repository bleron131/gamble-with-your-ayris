// Client-Seite der NPCs: Der Server sagt nur, WELCHER NPC an WELCHEM logischen Platz ist.
// Hier wird daraus eine Position im Raum, ein Laufweg (A* auf einem Raster über die Kollisionen),
// die passende Animation (gehen, sitzen, spielen, jubeln, ärgern, trinken, Shisha rauchen, reden …).
// Leistung: Animationen naher NPCs jedes Frame, ferne nur gedrosselt; sehr ferne werden ausgeblendet.
import * as THREE from 'three';
import { Character, npcLook } from './character.js';
import { LOBBY_SEATS } from '../shared/npcs.js';
import { TextSprite } from './tables/common.js';

const CELL = 0.4;
const WALK = 1.35;

// ───────────────────────── Raster & Wegfindung ─────────────────────────
class NavGrid {
  constructor(world, minX, maxX, minZ, maxZ) {
    this.world = world;
    this.minX = minX; this.minZ = minZ;
    this.w = Math.ceil((maxX - minX) / CELL);
    this.h = Math.ceil((maxZ - minZ) / CELL);
    this.block = new Uint8Array(this.w * this.h);
    const p = new THREE.Vector3();
    const boxes = world.colliders.filter(c => c.type === 'box');
    const circles = world.colliders.filter(c => c.type === 'circle');
    const r = 0.32;
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      p.set(minX + (i + 0.5) * CELL, 0, minZ + (j + 0.5) * CELL);
      let b = 0;
      for (const c of boxes) if (p.x > c.minX - r && p.x < c.maxX + r && p.z > c.minZ - r && p.z < c.maxZ + r) { b = 1; break; }
      if (!b) for (const c of circles) if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (c.r + r) ** 2) { b = 1; break; }
      this.block[j * this.w + i] = b;
    }
  }
  cell(x, z) { return [Math.floor((x - this.minX) / CELL), Math.floor((z - this.minZ) / CELL)]; }
  center(i, j) { return new THREE.Vector3(this.minX + (i + 0.5) * CELL, 0, this.minZ + (j + 0.5) * CELL); }
  free(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.block[j * this.w + i]; }
  // Nächste freie Zelle (Ziel liegt oft direkt an einem Automaten / Sofa)
  nearestFree(i, j) {
    if (this.free(i, j)) return [i, j];
    for (let rad = 1; rad < 8; rad++) for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
      if (this.free(i + di, j + dj)) return [i + di, j + dj];
    }
    return null;
  }
  // Sichtlinie auf dem Raster (für das Glätten des Weges)
  los(a, b) {
    const d = a.distanceTo(b), n = Math.ceil(d / (CELL * 0.5));
    for (let k = 1; k < n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
      const [i, j] = this.cell(x, z);
      if (!this.free(i, j)) return false;
    }
    return true;
  }
  path(from, to) {
    const s = this.nearestFree(...this.cell(from.x, from.z));
    const g = this.nearestFree(...this.cell(to.x, to.z));
    if (!s || !g) return [to.clone()];
    const W = this.w, start = s[1] * W + s[0], goal = g[1] * W + g[0];
    const cost = new Float32Array(W * this.h).fill(Infinity);
    const prev = new Int32Array(W * this.h).fill(-1);
    const heap = [[0, start]];
    cost[start] = 0;
    const hx = goal % W, hz = Math.floor(goal / W);
    let iter = 0;
    while (heap.length && iter++ < 20000) {
      const [, cur] = heapPop(heap);
      if (cur === goal) break;
      const ci = cur % W, cj = Math.floor(cur / W);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue; // keine Ecken schneiden
        const nk = nj * W + ni, nc = cost[cur] + (di && dj ? 1.414 : 1);
        if (nc < cost[nk]) { cost[nk] = nc; prev[nk] = cur; heapPush(heap, [nc + Math.hypot(ni - hx, nj - hz), nk]); }
      }
    }
    if (prev[goal] < 0 && goal !== start) return [to.clone()];
    const cells = [];
    for (let k = goal; k !== -1; k = prev[k]) cells.push(this.center(k % W, Math.floor(k / W)));
    cells.reverse();
    // Glätten: Punkte überspringen, solange Sichtlinie besteht
    const out = [];
    let a = from.clone();
    let idx = 0;
    while (idx < cells.length) {
      let far = idx;
      for (let k = cells.length - 1; k > idx; k--) if (this.los(a, cells[k])) { far = k; break; }
      out.push(cells[far]);
      a = cells[far];
      idx = far + 1;
    }
    out.push(to.clone());
    return out;
  }
}
function heapPush(h, v) { h.push(v); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; }
  }
  return top;
}

// Freie Stehplätze (deterministisch je Raum): nicht in Kollisionen, nicht an Interaktionen, nicht am Aufzug
export function freeStandSpots(world, bounds, count, seed, extraBlocked = []) {
  const [minX, maxX, minZ, maxZ] = bounds;
  const cands = [];
  for (let x = minX + 1.5; x < maxX - 1.5; x += 1.1) for (let z = minZ + 1.5; z < maxZ - 1.5; z += 1.1) cands.push(new THREE.Vector3(x, 0, z));
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  const out = [];
  const q = new THREE.Vector3();
  const spawn = new THREE.Vector3(world.spawn.x, 0, world.spawn.z);
  for (const c of cands) {
    if (out.length >= count) break;
    q.copy(c);
    world.collide(q, 0.55);
    if (q.distanceTo(c) > 0.01) continue;
    if (c.distanceTo(spawn) < 3.2) continue;
    if (world.interactables.some(it => Math.hypot(it.pos.x - c.x, it.pos.z - c.z) < (it.radius || 1.6) + 0.4)) continue;
    if (extraBlocked.some(b => Math.hypot(b.x - c.x, b.z - c.z) < b.r)) continue;
    if (out.some(o => o.distanceTo(c) < 1.6)) continue;
    out.push(c);
  }
  return out;
}

// ───────────────────────── NPC-Steuerung ─────────────────────────
export class NpcController {
  constructor(app, world) {
    this.app = app;
    this.world = world;
    this.npcs = new Map();
    this.frame = 0;
    this.grid = null;
  }

  navGrid() {
    if (!this.grid) {
      const [minX, maxX, minZ, maxZ] = this.world.npcBounds();
      this.grid = new NavGrid(this.world, minX, maxX, minZ, maxZ);
    }
    return this.grid;
  }

  sync(list = []) {
    const seen = new Set();
    for (const d of list) {
      seen.add(d.id);
      let n = this.npcs.get(d.id);
      if (!n) n = this.spawn(d);
      if (d.spot !== n.spot) this.goTo(n, d.spot);
      if (d.rn !== n.rn) { n.rn = d.rn; if (d.r) this.react(n, d.r); }
    }
    for (const [id, n] of this.npcs) if (!seen.has(id)) { n.char.root.removeFromParent(); n.char.dispose?.(); this.npcs.delete(id); }
  }

  spawn(d) {
    // Seltener NPC (Geheimnis): Mr. Goldfinger im goldenen Anzug – für alle Spieler derselbe (aus dem Seed)
    const rare = d.s % 23 === 0;
    const look = npcLook(this.world.npcKind?.() || 'casual', d.s);
    if (rare) Object.assign(look, { jacket: 'gold', pants: 'gold', shoes: 'goldsneakers', hat: 'tophat', glasses: 'golden', jewelry: 'goldchain', accessory: 'moneybag' });
    const char = new Character(look);
    if (rare) char.setName('Mr. Goldfinger', '#ffd700');
    char.t = (d.s % 100) / 10; // nicht alle im Gleichschritt
    const n = { id: d.id, rare, char, spot: null, rn: d.rn, path: [], pose: 'stand', target: null, react: null, reactT: 0, acc: 0, sitK: 0 };
    this.world.scene.add(char.root);
    this.npcs.set(d.id, n);
    // Neu im Raum: direkt am Platz (nicht durch den Raum laufen)
    const sp = d.spot && this.world.npcSpot(d.spot);
    if (sp) {
      n.spot = d.spot;
      n.target = sp;
      char.root.position.set(sp.x, sp.pose === 'sit' ? sp.y : 0, sp.z);
      char.root.rotation.y = sp.ry;
      n.pose = sp.pose === 'sit' ? 'sit' : 'stand';
      n.sitK = n.pose === 'sit' ? 1 : 0;
      char.setAnim(n.pose === 'sit' ? 'sit' : 'idle');
    } else {
      const fs = this.world.npcSpot('wander:0') || { x: 0, z: 0, ry: 0 };
      char.root.position.set(fs.x, 0, fs.z);
    }
    return n;
  }

  goTo(n, spot) {
    n.spot = spot;
    const sp = spot && this.world.npcSpot(spot);
    if (!sp) { n.path = []; n.target = null; return; }
    n.target = sp;
    const root = n.char.root;
    const from = new THREE.Vector3(root.position.x, 0, root.position.z);
    // Wer sitzt, steht zuerst auf (zur Standposition vor dem Sitz)
    if (n.pose === 'sit' && n.standFrom) { from.copy(n.standFrom); root.position.set(from.x, 0, from.z); }
    n.pose = 'stand';
    n.sitK = 0;
    const approach = new THREE.Vector3(sp.ax ?? sp.x, 0, sp.az ?? sp.z);
    n.path = from.distanceTo(approach) < 0.25 ? [] : this.navGrid().path(from, approach);
    n.react = null;
  }

  react(n, r) {
    const c = n.char;
    n.react = r;
    n.reactT = r === 'smoke' ? 3.4 : r === 'drink' ? 2.4 : r === 'talk' ? 2.2 : r === 'dance' ? 5 : 2.2;
    if (n.path.length) return; // unterwegs: nur Reaktionen im Stehen/Sitzen zeigen
    const sitting = n.pose === 'sit';
    // Am Automaten dreht der NPC sichtbar (Ergebnis nur optisch)
    if ((r === 'win' || r === 'lose') && n.spot?.startsWith('slot:')) {
      const v = this.world.views?.[n.spot.slice(5)];
      if (v?.npcPlay) { c.setAnim('point'); v.npcPlay(r === 'win'); setTimeout(() => { if (n.react === r) c.setAnim(r === 'win' ? 'cheer' : 'sad'); }, 1900); n.reactT = 3.8; return; }
    }
    switch (r) {
      case 'win': if (!sitting) c.setAnim('cheer'); break;
      case 'lose': if (!sitting) c.setAnim(Math.random() < 0.5 ? 'sad' : 'facepalm'); break;
      case 'cheer': if (!sitting) c.setAnim('cheer'); break;
      case 'dance': if (!sitting) c.setAnim('dance'); break;
      case 'talk': case 'laugh': if (!sitting) c.setAnim('point'); break;
      case 'drink': c.setFx('c'); break;
      case 'smoke': {
        const seat = n.target?.seat;
        if (seat && seat.shisha >= 0 && this.world.smokeAt) { c.setFx('s'); this.world.smokeAt(c, seat.shisha); }
        break;
      }
    }
  }

  update(dt, camera) {
    this.frame++;
    if (this.hrChar) {
      const c = this.hrChar;
      // zum nächsten Spieler drehen, Ring pulsiert
      const p = this.app.player.pos;
      c.root.rotation.y += angleDiff(Math.atan2(p.x - c.root.position.x, p.z - c.root.position.z), c.root.rotation.y) * Math.min(1, dt * 2);
      c.ring.material.opacity = 0.45 + 0.3 * Math.sin(performance.now() / 300);
      c.update(dt);
    }
    const cam = camera.position;
    const far = this.app.engine?.mobile ? 24 : 38;
    for (const n of this.npcs.values()) {
      const c = n.char, root = c.root;
      // Laufen
      if (n.path.length) {
        const tgt = n.path[0];
        const dx = tgt.x - root.position.x, dz = tgt.z - root.position.z;
        const d = Math.hypot(dx, dz);
        const step = WALK * dt;
        if (d <= step) { root.position.x = tgt.x; root.position.z = tgt.z; n.path.shift(); }
        else { root.position.x += dx / d * step; root.position.z += dz / d * step; }
        root.position.y = 0;
        root.rotation.y += angleDiff(Math.atan2(dx, dz), root.rotation.y) * Math.min(1, dt * 8);
        c.setAnim('walk');
        if (!n.path.length) this.arrive(n);
      } else if (n.target) {
        const sp = n.target;
        if (n.pose === 'sit' && n.sitK < 1) {
          // Hinsetzen: sanft vom Stehplatz auf den Sitz
          n.sitK = Math.min(1, n.sitK + dt * 2.5);
          const k = n.sitK * n.sitK * (3 - 2 * n.sitK);
          root.position.set(n.standFrom.x + (sp.x - n.standFrom.x) * k, sp.y * k, n.standFrom.z + (sp.z - n.standFrom.z) * k);
        }
        root.rotation.y += angleDiff(sp.ry, root.rotation.y) * Math.min(1, dt * 6);
        if (n.reactT > 0) {
          n.reactT -= dt;
          if (n.reactT <= 0) { c.setFx(''); c.setAnim(n.pose === 'sit' ? 'sit' : sp.anim || 'idle'); n.react = null; }
        }
      }
      // Sichtbarkeit & gedrosselte Animation
      const dist = root.position.distanceTo(cam);
      root.visible = dist < far;
      if (!root.visible) continue;
      n.acc += dt;
      const every = dist < 14 ? 1 : dist < 24 ? 2 : 4;
      if (this.frame % every === 0) { c.update(n.acc); n.acc = 0; }
    }
  }

  arrive(n) {
    const sp = n.target, c = n.char;
    if (sp.pose === 'sit') {
      n.pose = 'sit';
      n.sitK = 0;
      n.standFrom = c.root.position.clone();
      c.setAnim('sit');
    } else {
      c.root.position.set(sp.x, 0, sp.z);
      c.setAnim(sp.anim || 'idle');
    }
  }

  // High-Roller-Event: besonderer NPC mit Namensschild und goldenem Lichtkegel am Boden
  syncHr(hr) {
    if (!hr) { if (this.hrChar) { this.hrChar.root.removeFromParent(); this.hrChar.dispose?.(); this.hrChar = null; this.hrId = null; } return; }
    if (this.hrChar && this.hrId === hr.id + hr.spot) return;
    this.syncHr(null);
    const sp = this.world.npcSpot(hr.spot);
    if (!sp) return;
    const looks = {
      highroller: { jacket: 'blazer', jacketColor: '#1a1a1a', top: 'shirt', pants: 'suit', shoes: 'loafers', hat: 'fedora', glasses: 'shades', jewelry: 'goldchain', accessory: 'moneybag' },
      champion: { jacket: 'gold', top: 'shirt', pants: 'suit', shoes: 'goldsneakers', hat: 'crown', jewelry: 'diamond', accessory: 'trophy' },
      vipdealer: { jacket: 'tux', top: 'shirt', pants: 'suit', shoes: 'loafers', hat: 'tophat', glasses: 'monocle', jewelry: 'watch' },
      millionaire: { jacket: 'velvet', top: 'casino', pants: 'gold', shoes: 'loafers', hat: 'diamondhat', glasses: 'golden', jewelry: 'goldchain' },
      mystery: { jacket: 'leather', jacketColor: '#111', top: 'hoodie', topColor: '#111111', pants: 'suit', pantsColor: '#111111', hat: 'fedora', mask: 'venetian', glasses: 'none' },
    };
    const c = new Character({ ...npcLook('vip', hr.id.length * 7919), ...looks[hr.id] });
    c.setName(`🎩 ${hr.name}`, '#ffd700');
    c.root.position.set(sp.x, 0, sp.z);
    c.root.rotation.y = sp.ry;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: '#ffd700', transparent: true, opacity: 0.7, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    c.root.add(ring);
    c.ring = ring;
    this.world.scene.add(c.root);
    this.hrChar = c;
    this.hrId = hr.id + hr.spot;
  }
  hrSay(text, color) {
    const c = this.hrChar;
    if (!c) return;
    c.setAnim('deal');
    clearTimeout(this.hrT);
    this.hrT = setTimeout(() => c.setAnim('idle'), 900);
    // Würfelergebnis als Schild über dem Kopf (für alle sichtbar)
    if (!c.say) { c.say = new TextSprite(1.2, 0.3); c.say.sprite.position.y = 2.15; c.root.add(c.say.sprite); }
    c.say.set(text, color);
    clearTimeout(this.sayT);
    this.sayT = setTimeout(() => c.say?.set(''), 1500);
  }
  hrReact(win) {
    const c = this.hrChar;
    if (!c) return;
    c.setAnim(win ? 'facepalm' : 'cheer');
    clearTimeout(this.hrT);
    this.hrT = setTimeout(() => c.setAnim('idle'), 2400);
  }

  // Alle NPCs reagieren (z. B. Jackpot): stehende jubeln und drehen sich zur Quelle
  cheerAll(pos) {
    for (const n of this.npcs.values()) {
      if (n.path.length) continue;
      const c = n.char;
      if (n.pose !== 'sit') { c.setAnim(Math.random() < 0.7 ? 'cheer' : 'dance'); if (pos && n.target) n.target = { ...n.target, ry: Math.atan2(pos.x - c.root.position.x, pos.z - c.root.position.z) }; }
      n.react = 'cheer';
      n.reactT = 3 + Math.random() * 1.5;
    }
  }

  // Ist Mr. Goldfinger in Reichweite (und das Geheimnis noch nicht gefunden)?
  rareNear(pos) {
    if (this.app.hasSecret('rare_npc')) return false;
    for (const n of this.npcs.values()) if (n.rare && Math.hypot(n.char.root.position.x - pos.x, n.char.root.position.z - pos.z) < 1.4) return true;
    return false;
  }

  dispose() {
    for (const n of this.npcs.values()) n.char.root.removeFromParent();
    this.npcs.clear();
  }
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Platz-Auflösung für die Shishabar (Sitze aus der gemeinsamen Liste, Steh-/Gesprächsplätze frei im Raum)
export function loungeSpot(world, spot) {
  const [kind, k] = spot.split(':');
  const i = +k;
  if (kind === 'seat') {
    const s = LOBBY_SEATS[i];
    if (!s) return null;
    return { x: s.x, z: s.z, y: s.y, ry: s.ry, pose: 'sit', ax: s.sx, az: s.sz, seat: s };
  }
  return standSpot(world, kind, i);
}

// Gesprächs- (paarweise gegenüber) und Schlenderplätze auf freien Stellen im Raum
export function standSpot(world, kind, i) {
  const spots = world.npcStandSpots();
  if (kind === 'talk') {
    const base = spots[Math.floor(i / 2) % spots.length];
    if (!base) return null;
    const side = i % 2 ? 1 : -1;
    return { x: base.x + side * 0.55, z: base.z, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, pose: 'stand' };
  }
  const p = spots[(i + 3) % spots.length];
  return p ? { x: p.x, z: p.z, ry: (i * 1.7) % (Math.PI * 2), pose: 'stand' } : null;
}
