// Optionale Events auf den Casino-Stockwerken (autoritativ im Room, synchron für alle):
//  • Co-op-Events: TEAM RUSH, LUCKY STREAK, CASINO TOUR – Belohnung für die ganze Gruppe, Scheitern kostet nichts.
//  • High-Roller-Events: Ein besonderer NPC erscheint und fordert zum Würfel-Duell heraus (kostenlos, ohne Team-Pot).
// Beides blockiert nie den Fortschritt und verändert weder Pot noch Gewinnchancen.
import { rand } from './rng.js';
import { floorDef, fmtMoney } from './config.js';
import { FLOOR_SPOTS } from './npcs.js';

export const COOP_EVENTS = {
  rush: { name: 'TEAM RUSH', icon: '⚡', sec: 300, reward: 3, desc: g => `Gewinnt zusammen ${fmtMoney(g.money)} in 5 Minuten` },
  streak: { name: 'LUCKY STREAK', icon: '🍀', sec: 240, reward: 3, desc: () => 'Schafft 5 Team-Gewinne in Folge' },
  tour: { name: 'CASINO TOUR', icon: '🗺️', sec: 300, reward: 2, desc: () => 'Gewinnt in 3 verschiedenen Spielen' },
};

export const HIGH_ROLLERS = {
  highroller: { name: 'High Roller', title: 'High-Roller-Bezwinger', minFloor: 3 },
  champion: { name: 'Casino Champion', title: 'Champion', minFloor: 5 },
  vipdealer: { name: 'VIP Dealer', title: 'Kartenkönig', minFloor: 7 },
  millionaire: { name: 'Millionär', title: 'Millionärsschreck', minFloor: 9 },
  mystery: { name: 'Mysteriöser Spieler', title: 'Mysteriös', minFloor: 11 },
};
export const HR_FIRST_REWARD = 5;
export const HR_REPEAT_REWARD = 1;

const between = (a, b) => a + rand() * (b - a);
const roll = () => 1 + Math.floor(rand() * 6);

export class EventDirector {
  constructor(room) {
    this.room = room;
    this.coop = null;
    this.hr = null;
    this.nextCoop = 0;
    this.nextHr = 0;
  }

  // Neues Stockwerk: Zeitpunkte für die ersten Events festlegen
  reset(scene) {
    this.coop = null;
    this.hr = null;
    const now = Date.now();
    this.nextCoop = scene === 'floor' ? now + between(75, 120) * 1000 : Infinity;
    this.nextHr = scene === 'floor' ? now + between(50, 110) * 1000 : Infinity;
  }

  get floor() { return this.room.floor; }
  active() { const r = this.room; return r.scene === 'floor' && r.session && !r.session.ending && r.players.size > 0; }

  tick() {
    const now = Date.now();
    if (!this.active()) return;
    const c = this.coop;
    if (c && now > c.endsAt && !c.done) {
      this.room.event({ kind: 'coop', phase: 'fail', id: c.id, name: COOP_EVENTS[c.id].name });
      this.coop = null;
      this.nextCoop = now + between(150, 240) * 1000;
      this.room.markDirty();
    }
    if (!this.coop && now >= this.nextCoop) this.startCoop();
    const h = this.hr;
    if (h && !h.duel && now > h.until) {
      this.room.event({ kind: 'hr', phase: 'leave', id: h.id, name: h.name });
      this.hr = null;
      this.nextHr = now + between(200, 320) * 1000;
      this.room.markDirty();
    }
    if (!this.hr && now >= this.nextHr) this.spawnHr();
  }

  // ───────────────────────── Co-op ─────────────────────────
  startCoop(id) {
    const ids = Object.keys(COOP_EVENTS);
    id ||= ids[Math.floor(rand() * ids.length)];
    const def = COOP_EVENTS[id];
    const f = floorDef(this.floor, this.room.prestige);
    const goal = id === 'rush' ? Math.max(100, Math.round(f.target * 0.2)) : id === 'streak' ? 5 : 3;
    this.coop = { id, goal, prog: 0, games: [], endsAt: Date.now() + def.sec * 1000, done: false };
    this.room.event({ kind: 'coop', phase: 'start', id, name: def.name, desc: def.desc({ money: goal }), goal, sec: def.sec });
    this.room.markDirty();
  }

  // Jedes Rundenergebnis (aus Room.settle)
  onResult({ game, stake, net }) {
    const c = this.coop;
    if (!c || c.done || !(stake > 0)) return;
    if (c.id === 'rush' && net > 0) c.prog = Math.min(c.goal, c.prog + net);
    if (c.id === 'streak') c.prog = net > 0 ? c.prog + 1 : net < 0 ? 0 : c.prog;
    if (c.id === 'tour' && net > 0 && !c.games.includes(game)) { c.games.push(game); c.prog = c.games.length; }
    if (c.prog >= c.goal) {
      c.done = true;
      const def = COOP_EVENTS[c.id];
      this.room.event({ kind: 'coop', phase: 'done', id: c.id, name: def.name, reward: def.reward });
      for (const p of this.room.players.values()) p.conn.send({ t: 'reward', dildos: def.reward, reason: `CO-OP-EVENT ${def.name} geschafft`, kind: 'event' });
      this.coop = null;
      this.nextCoop = Date.now() + between(180, 300) * 1000;
    }
    this.room.markDirty();
  }

  // ───────────────────────── High Roller ─────────────────────────
  spawnHr(id) {
    const options = Object.entries(HIGH_ROLLERS).filter(([, d]) => d.minFloor <= this.floor).map(([k]) => k);
    if (!options.length) { this.nextHr = Infinity; return; }
    id ||= options[Math.floor(rand() * options.length)];
    const def = HIGH_ROLLERS[id];
    this.hr = { id, name: def.name, spot: `wander:${Math.floor(rand() * FLOOR_SPOTS.wander)}`, until: Date.now() + 150000, duel: null };
    this.room.event({ kind: 'hr', phase: 'arrive', id, name: def.name });
    this.room.markDirty();
  }

  // Würfel-Duell, Best of 3 (Gleichstand wird neu gewürfelt). Kostenlos – kein Einsatz aus dem Team-Pot.
  challenge(p) {
    const h = this.hr;
    if (!this.active() || !h) return this.room.error(p.id, 'Gerade ist kein High Roller hier');
    if (h.duel) return this.room.error(p.id, `${this.room.players.get(h.duel.pid)?.name || 'Jemand'} duelliert sich gerade`);
    h.duel = { pid: p.id, name: p.name, score: [0, 0], round: 0 };
    this.room.event({ kind: 'hr', phase: 'duel', id: h.id, name: h.name, pid: p.id, player: p.name });
    this.room.markDirty();
    this.duelStep();
  }

  duelStep() {
    const h = this.hr;
    if (!h?.duel) return;
    this.room.later(1600, () => {
      if (this.hr !== h || !h.duel) return;
      const d = h.duel;
      if (!this.room.players.has(d.pid)) { h.duel = null; this.room.markDirty(); return; }
      const pr = [roll(), roll()], nr = [roll(), roll()];
      const ps = pr[0] + pr[1], ns = nr[0] + nr[1];
      if (ps > ns) d.score[0]++; else if (ns > ps) d.score[1]++;
      d.round++;
      this.room.event({ kind: 'hr', phase: 'round', id: h.id, name: h.name, pid: d.pid, player: d.name, p: pr, n: nr, score: [...d.score] });
      if (d.score[0] < 2 && d.score[1] < 2 && d.round < 9) return this.duelStep();
      const win = d.score[0] > d.score[1];
      this.room.event({ kind: 'hr', phase: 'end', id: h.id, name: h.name, pid: d.pid, player: d.name, win, title: HIGH_ROLLERS[h.id].title });
      const p = this.room.players.get(d.pid);
      if (win && p) {
        const first = !p.hrWon.has(h.id);
        p.hrWon.add(h.id);
        p.conn.send({ t: 'reward', dildos: first ? HR_FIRST_REWARD : HR_REPEAT_REWARD, reason: `HIGH-ROLLER-EVENT: ${h.name} besiegt${first ? ` – Titel „${HIGH_ROLLERS[h.id].title}“` : ''}`, kind: 'event', hr: h.id, title: first ? HIGH_ROLLERS[h.id].title : null });
      }
      // Nach dem Duell verabschiedet sich der High Roller
      this.room.later(2500, () => {
        if (this.hr !== h) return;
        this.room.event({ kind: 'hr', phase: 'leave', id: h.id, name: h.name });
        this.hr = null;
        this.nextHr = Date.now() + between(200, 320) * 1000;
        this.room.markDirty();
      });
    });
  }

  snapshot() {
    const now = Date.now();
    const c = this.coop, h = this.hr;
    return {
      coop: c && { id: c.id, name: COOP_EVENTS[c.id].name, icon: COOP_EVENTS[c.id].icon, desc: COOP_EVENTS[c.id].desc({ money: c.goal }), goal: c.goal, prog: c.prog, leftMs: Math.max(0, c.endsAt - now) },
      hr: h && { id: h.id, name: h.name, spot: h.spot, duel: h.duel && { pid: h.duel.pid, score: h.duel.score } },
    };
  }
}
