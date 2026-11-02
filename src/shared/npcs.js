// NPC-Regie (läuft autoritativ im Room → alle Spieler sehen dieselben NPCs an denselben Plätzen).
// Der Server kennt nur logische Plätze ("slot:slots-0", "seat:3", "bar:1" …); wo diese im Raum liegen,
// berechnet jeder Client aus dem (deterministischen) Raumaufbau. Echte Spieler haben IMMER Vorrang:
// Benutzt ein Spieler einen Automaten, Tisch oder Sitz, auf dem ein NPC ist, geht der NPC sofort weg.
import { rand } from './rng.js';
import { floorTables } from './config.js';

// ───────────────────────── Sitzplätze in der Shishabar ─────────────────────────
// Gleiche Geometrie wie world/lobby.js (Sofagruppen um die Shisha-Tische, Barhocker an Kemals Bar).
export const LOUNGE_GROUPS = [[-5.5, 3.5], [1, 5.5], [6.8, 6], [-1.5, 0.2]];
export const SOFA_Y = 0.38; // Höhe des Charakter-Ursprungs beim Sitzen auf dem Sofa
export const STOOL_Y = 0.63; // … auf dem Barhocker

function buildSeats() {
  const seats = [];
  const fwd = 0.1; // Sitzfläche liegt etwas vor der Sofamitte
  LOUNGE_GROUPS.forEach(([x, z], g) => {
    // Sofa vorne (Blick +z), hinten (Blick -z), seitlich (Blick +x)
    for (const lx of [-0.8, 0, 0.8]) seats.push({ x: x + lx, z: z - 1.35 + fwd, ry: 0, y: SOFA_Y, furn: `g${g}a`, shisha: g, kind: 'sofa' });
    for (const lx of [-0.8, 0, 0.8]) seats.push({ x: x - lx, z: z + 1.35 - fwd, ry: Math.PI, y: SOFA_Y, furn: `g${g}b`, shisha: g, kind: 'sofa' });
    for (const lx of [-0.4, 0.4]) seats.push({ x: x - 1.5 + fwd, z: z - lx, ry: Math.PI / 2, y: SOFA_Y, furn: `g${g}c`, shisha: g, kind: 'sofa' });
  });
  // Barhocker (Bar bei x = -10.4, z = -2, um 90° gedreht; Hocker 0.75 m vor dem Tresen)
  for (let i = 0; i < 5; i++) seats.push({ x: -9.65, z: -2 + 2.65 - i * 1.1, ry: -Math.PI / 2, y: STOOL_Y, furn: 'bar', shisha: -1, kind: 'stool' });
  // Standposition zum Aufstehen: etwas vor dem Sitz in Blickrichtung
  for (const s of seats) {
    const d = s.kind === 'stool' ? 0.55 : 0.62;
    s.sx = s.x + Math.sin(s.ry) * d;
    s.sz = s.z + Math.cos(s.ry) * d;
  }
  return seats.map((s, i) => ({ i, ...s }));
}
export const LOBBY_SEATS = buildSeats();
export const SEAT_REACH = 2.4; // so nah muss ein Spieler am Sitz sein, um ihn zu nehmen

// ───────────────────────── NPC-Anzahl & Plätze ─────────────────────────
export const npcCountFor = (scene, floor) => scene === 'lobby' ? 12 : scene === 'floor' ? Math.min(12, 4 + Math.round(floor * 0.55)) : 0;
export const FLOOR_SPOTS = { bar: 4, talk: 6, wander: 10 };
// Stock 1 (Hinterhof) und 2 (Neon Corner) haben keine Bar (siehe client/world/styles.js)
export const floorHasBar = n => n >= 3;
export const LOBBY_SPOTS = { talk: 6, wander: 8 };

const pick = arr => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + rand() * (b - a);

export class NpcDirector {
  constructor(room) {
    this.room = room;
    this.list = [];
    this.scene = null;
    this.nextId = 1;
  }

  reset(scene, floor) {
    this.scene = scene;
    this.floor = floor;
    this.list = [];
    const n = npcCountFor(scene, floor);
    const now = Date.now();
    for (let i = 0; i < n; i++) {
      const npc = { id: 'n' + this.nextId++, seed: Math.floor(rand() * 1e6), spot: null, until: 0, react: null, rn: 0, nextReact: 0 };
      this.list.push(npc);
      // Zu Beginn schon verteilt (nicht alle gleichzeitig an der Tür)
      this.assign(npc, now, true);
    }
  }

  // Ist ein Platz gerade von einem echten Spieler belegt?
  playerUses(spot) {
    const r = this.room;
    const [kind, id] = spot.split(':');
    if (kind === 'seat') return [...r.players.values()].some(p => p.lseat === +id);
    if (!r.session) return false;
    const t = r.session.tables[id];
    if (!t) return false;
    if (kind === 'slot') return t.busy || !!(t.holder && t.holder.until > Date.now() && r.players.has(t.holder.pid));
    if (kind === 'table') return !!t.occupant || t.busy;
    return false;
  }

  taken(spot, except) {
    if (spot.startsWith('watch:')) return false;
    if (this.room.events?.hr?.spot === spot) return true; // dort steht der High Roller
    return this.list.some(n => n !== except && n.spot === spot) || this.playerUses(spot);
  }

  freeSpots(kind, except) {
    const out = [];
    if (this.scene === 'lobby') {
      if (kind === 'seat') LOBBY_SEATS.forEach(s => out.push(`seat:${s.i}`));
      else if (LOBBY_SPOTS[kind]) for (let i = 0; i < LOBBY_SPOTS[kind]; i++) out.push(`${kind}:${i}`);
    } else if (this.scene === 'floor') {
      const defs = floorTables(this.floor);
      const walkUp = d => d.type === 'slots' || d.type === 'highslots';
      if (kind === 'slot') defs.filter(walkUp).forEach(d => out.push(`slot:${d.id}`));
      else if (kind === 'table') defs.filter(d => !walkUp(d)).forEach(d => out.push(`table:${d.id}`));
      else if (kind === 'watch') defs.filter(d => !walkUp(d)).forEach(d => out.push(`watch:${d.id}`));
      else if (kind === 'bar' && !floorHasBar(this.floor)) return [];
      else if (FLOOR_SPOTS[kind]) for (let i = 0; i < FLOOR_SPOTS[kind]; i++) out.push(`${kind}:${i}`);
    }
    return out.filter(s => !this.taken(s, except));
  }

  // Neue Tätigkeit wählen (gewichtet), Dauer festlegen
  assign(npc, now, initial = false) {
    const lobby = this.scene === 'lobby';
    const table = lobby
      ? [['seat', 0.5, 25, 60], ['talk', 0.32, 14, 32], ['wander', 0.18, 6, 14]]
      : [['slot', 0.34, 15, 40], ['table', 0.18, 20, 45], ['bar', 0.14, 12, 28], ['talk', 0.14, 10, 25], ['watch', 0.08, 8, 16], ['wander', 0.12, 5, 12]];
    let roll = rand();
    let choice = table[table.length - 1];
    for (const row of table) { if ((roll -= row[1]) <= 0) { choice = row; break; } }
    let spots = this.freeSpots(choice[0], npc);
    // Gesprächsplätze paarweise füllen: bevorzugt neben einem NPC, der schon dort steht
    if (choice[0] === 'talk' && spots.length) {
      const partner = spots.find(s => { const k = +s.split(':')[1]; return this.list.some(n => n.spot === `talk:${k ^ 1}`); });
      if (partner) spots = [partner];
    }
    if (!spots.length) { choice = table[table.length - 1]; spots = this.freeSpots(choice[0], npc); }
    if (!spots.length) { npc.until = now + 3000; return; }
    npc.spot = pick(spots);
    const dur = between(choice[2], choice[3]) * 1000;
    npc.until = now + (initial ? dur * between(0.2, 1) : dur);
    npc.nextReact = now + between(4000, 9000);
  }

  // Spieler übernimmt einen Platz → NPC geht sofort (keine „besetzt“-Meldung für den Spieler)
  evict(spot) {
    let changed = false;
    for (const n of this.list) {
      if (n.spot !== spot) continue;
      const now = Date.now();
      const spots = this.freeSpots('wander', n);
      n.spot = spots.length ? pick(spots) : null;
      n.until = now + between(5000, 9000);
      n.nextReact = now + between(3000, 6000);
      n.react = 'yield'; n.rn++;
      changed = true;
    }
    if (changed) this.room.npcsDirty();
    return changed;
  }

  // Reaktionen passend zur Tätigkeit (Jubeln/Ärgern am Automaten, Trinken an der Bar, Shisha auf dem Sofa …)
  reactionFor(npc) {
    const kind = npc.spot?.split(':')[0];
    if (kind === 'slot' || kind === 'table') return rand() < 0.3 ? 'win' : 'lose';
    if (kind === 'bar') return 'drink';
    if (kind === 'talk') return pick(['talk', 'talk', 'laugh']);
    if (kind === 'watch') return pick(['cheer', 'talk', 'lose']);
    if (kind === 'seat') {
      const s = LOBBY_SEATS[+npc.spot.split(':')[1]];
      return s?.shisha >= 0 && rand() < 0.65 ? 'smoke' : s?.kind === 'stool' ? 'drink' : 'talk';
    }
    return pick(['idle', 'dance', 'idle']);
  }

  tick() {
    if (!this.list.length || !this.room.players.size) return;
    const now = Date.now();
    let changed = false;
    for (const n of this.list) {
      // Platz inzwischen von einem Spieler belegt (z. B. Spieler setzt sich) → sofort weg
      if (n.spot && this.playerUses(n.spot)) { this.evict(n.spot); changed = true; continue; }
      if (now >= n.until) { this.assign(n, now); n.react = null; changed = true; }
      else if (now >= n.nextReact) {
        n.react = this.reactionFor(n);
        n.rn++;
        n.nextReact = now + between(6000, 13000);
        changed = true;
      }
    }
    if (changed) this.room.npcsDirty();
  }

  snapshot() {
    return this.list.map(n => ({ id: n.id, s: n.seed, spot: n.spot, r: n.react, rn: n.rn }));
  }
}
