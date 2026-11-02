// Dynamische Systeme pro Stockwerk (Prompt 10), autoritativ im Room – alle Spieler sehen dasselbe:
//  • Floor Modifier: ~30 % Chance beim Betreten, höchstens einer, gilt für das ganze Stockwerk.
//  • Rush Events: genau 30 Sekunden, mit Pause dazwischen. Regel: Der Bonus gilt für Runden, die WÄHREND des Rushs
//    gestartet werden, und nur wenn sie spätestens 15 Sekunden nach Rush-Ende abgerechnet sind (kein Behalten des Bonus).
import { rand } from './rng.js';

export const MODIFIER_CHANCE = 0.3;
export const MODIFIERS = {
  hot: { name: 'HOT FLOOR', icon: '🔥', desc: 'Gewinne +15 % – dafür höhere Mindesteinsätze (×1.5)', minScale: 1.5, winBonus: 0.15 },
  risk: { name: 'RISK NIGHT', icon: '💀', desc: 'Gewinne −10 %, dafür +3 🍆 für alle beim Abschluss', winBonus: -0.1, extraDildos: 3 },
  lucky: { name: 'LUCKY FLOOR', icon: '🍀', desc: 'Etwas mehr Glück bei allen Casino-Spielen', luck: 0.1 },
  double: { name: 'DOUBLE CASH', icon: '💰', desc: 'Gewinne ab 3× Einsatz bekommen noch ×1.5 auf den Gewinn', bigBonus: 0.5 },
  jackpot: { name: 'JACKPOT NIGHT', icon: '🎰', desc: 'Seltene Slot-Jackpots kommen etwas häufiger', jackpot: 0.0015 },
  highroller: { name: 'HIGH ROLLER', icon: '👑', desc: 'Mindesteinsätze ×2, Maximaleinsätze ×1.5, Gewinne +10 %', minScale: 2, maxScale: 1.5, winBonus: 0.1 },
};
export const MYSTERY = { name: '??? MYSTERY MODIFIER', icon: '❓', desc: 'Der Effekt wird nach dem ersten Casino-Spiel enthüllt' };

export const RUSH_MS = 30000;
export const RUSH_GRACE_MS = 15000;
export const RUSHES = {
  blackjack: { name: 'BLACKJACK RUSH', icon: '🃏', desc: 'Blackjack-Gewinne +25 %', games: ['blackjack'], winBonus: 0.25 },
  slot: { name: 'SLOT RUSH', icon: '🎰', desc: 'Kleine und mittlere Slot-Gewinne kommen häufiger', games: ['slots', 'highslots'], luck: 0.3 },
  roulette: { name: 'ROULETTE RUSH', icon: '🔴⚫', desc: 'Roulette-Gewinne +15 %', games: ['roulette'], winBonus: 0.15 },
  crash: { name: 'CRASH RUSH', icon: '📈', desc: 'Crash-Cashouts bekommen +20 % Bonus-Multiplikator', games: ['crash'], winBonus: 0.2 },
  plinko: { name: 'PLINKO RUSH', icon: '🔵', desc: 'Plinko-Felder ab 2× zahlen ×1.5', games: ['plinko'], bigBonus: 0.5, bigFrom: 2 },
  dildo: { name: 'DILDO RUSH', icon: '🍆', desc: 'Jede abgeschlossene Runde: kleine Chance auf +1 🍆', dildoChance: 0.12, dildoCap: 3 },
  highroller: { name: 'HIGH ROLLER RUSH', icon: '👑', desc: 'Maximaleinsätze ×2', maxScale: 2 },
  jackpot: { name: 'JACKPOT RUSH', icon: '💰', desc: 'Slot-Jackpots etwas wahrscheinlicher', games: ['slots', 'highslots'], jackpot: 0.003 },
};

const between = (a, b) => a + rand() * (b - a);

// Einsatzgrenzen mit Modifier (Mindesteinsatz/Maximum) und High-Roller-Rush – gemeinsam für Server und Client
export function scaledLimits(base, modId, rushId) {
  if (!base) return base;
  const m = MODIFIERS[modId], r = RUSHES[rushId];
  let min = base.min, max = base.max;
  if (m?.minScale) min = Math.round(min * m.minScale);
  if (m?.maxScale) max = Math.round(max * m.maxScale);
  if (r?.maxScale) max = Math.round(max * r.maxScale);
  if (min === base.min && max === base.max) return base;
  return { ...base, min: Math.min(min, max), max };
}

export class FloorDynamics {
  // In den automatischen Tests standardmässig aus (deterministische Ergebnisse); dynamics.test.js schaltet es ein
  static enabled = !(typeof process !== 'undefined' && process.env?.NODE_TEST_CONTEXT);
  constructor(room) { this.room = room; this.modifier = null; this.rush = null; this.nextRush = Infinity; this.rushCount = 0; }

  // Beim Betreten eines Stockwerks: vielleicht ein Modifier, erster Rush nach einer Weile
  reset(scene) {
    this.modifier = null;
    this.rush = null;
    this.nextRush = scene === 'floor' && FloorDynamics.enabled ? Date.now() + between(70, 140) * 1000 : Infinity;
    if (scene !== 'floor' || !FloorDynamics.enabled) return;
    if (rand() < MODIFIER_CHANCE) {
      const ids = Object.keys(MODIFIERS);
      const mystery = rand() < 0.2;
      this.modifier = { id: ids[Math.floor(rand() * ids.length)], hidden: mystery };
      const m = MODIFIERS[this.modifier.id];
      this.room.event({ kind: 'modifier', phase: 'start', ...(mystery ? { id: 'mystery', ...MYSTERY } : { id: this.modifier.id, name: m.name, icon: m.icon, desc: m.desc }) });
    }
  }

  get mod() { return this.modifier ? MODIFIERS[this.modifier.id] : null; }

  // Nach dem ersten Casino-Spiel: Mystery-Modifier enthüllen
  reveal() {
    const md = this.modifier;
    if (!md?.hidden) return;
    md.hidden = false;
    const m = MODIFIERS[md.id];
    this.room.event({ kind: 'modifier', phase: 'reveal', id: md.id, name: m.name, icon: m.icon, desc: m.desc });
    this.room.markDirty();
  }

  rushActive() { return this.rush && Date.now() < this.rush.endsAt ? this.rush : null; }

  tick() {
    const r = this.room;
    if (r.scene !== 'floor' || !r.session || r.session.ending || !r.players.size) return;
    const now = Date.now();
    if (this.rush && now >= this.rush.endsAt) {
      r.event({ kind: 'rush', phase: 'end', id: this.rush.id, name: RUSHES[this.rush.id].name });
      this.rush = null;
      this.nextRush = now + between(140, 240) * 1000; // sinnvolle Pause bis zum nächsten Rush
      r.markDirty();
    }
    if (!this.rush && now >= this.nextRush) this.startRush();
  }

  startRush(id) {
    const ids = Object.keys(RUSHES);
    const games = new Set(Object.values(this.room.session?.tables || {}).map(t => t.type));
    // nur Rushes, deren Spiel es auf diesem Stockwerk gibt
    const ok = ids.filter(k => !RUSHES[k].games || RUSHES[k].games.some(g => games.has(g)));
    id ||= ok[Math.floor(rand() * ok.length)];
    const def = RUSHES[id];
    this.rush = { id, startedAt: Date.now(), endsAt: Date.now() + RUSH_MS, dildos: {} };
    this.rushCount++;
    this.room.event({ kind: 'rush', phase: 'start', id, name: def.name, icon: def.icon, desc: def.desc, ms: RUSH_MS });
    this.room.markDirty();
  }

  // Wird beim Start einer Runde gemerkt (Room.startRound)
  roundMods(type) {
    const r = this.rushActive();
    if (!r) return null;
    const def = RUSHES[r.id];
    if (def.games && !def.games.includes(type)) return null;
    return { id: r.id, until: r.endsAt + RUSH_GRACE_MS };
  }

  // Einsatzgrenzen inkl. Modifier (Mindesteinsatz) und High-Roller-Rush (Maximum) – Kopie, nie das Original ändern
  limits(base) {
    return scaledLimits(base, this.modifier?.id, this.rushActive()?.id);
  }

  luckBonus(type, mods) {
    let b = this.mod?.luck || 0;
    const rush = mods?.rush && Date.now() <= mods.rush.until ? RUSHES[mods.rush.id] : null;
    if (rush?.luck && (!rush.games || rush.games.includes(type))) b += rush.luck;
    return b;
  }

  jackpotChance(type, mods) {
    if (type !== 'slots' && type !== 'highslots') return 0;
    let c = this.mod?.jackpot || 0;
    const rush = mods?.rush && Date.now() <= mods.rush.until ? RUSHES[mods.rush.id] : null;
    if (rush?.jackpot) c += rush.jackpot;
    return c;
  }

  // Auszahlung nach Modifier & Rush anpassen (nur auf den Gewinnanteil); gibt neue Auszahlung + Effekt-Texte zurück
  adjustPayout(type, stake, payout, mods) {
    const effects = [];
    if (!(stake > 0) || !(payout > stake)) return { payout, effects };
    let net = payout - stake;
    const m = this.mod;
    if (m && !this.modifier.hidden) {
      if (m.winBonus) { net *= 1 + m.winBonus; effects.push(`${m.icon} ${m.name} ${m.winBonus > 0 ? '+' : ''}${Math.round(m.winBonus * 100)}%`); }
      if (m.bigBonus && payout >= stake * 3) { net *= 1 + m.bigBonus; effects.push(`${m.icon} DOUBLE CASH ×1.5`); }
    } else if (m && this.modifier.hidden) {
      // Mystery wirkt schon, wird aber erst nach dem Ergebnis gezeigt
      if (m.winBonus) net *= 1 + m.winBonus;
      if (m.bigBonus && payout >= stake * 3) net *= 1 + m.bigBonus;
    }
    const rush = mods?.rush && Date.now() <= mods.rush.until ? RUSHES[mods.rush.id] : null;
    if (rush && (!rush.games || rush.games.includes(type))) {
      if (rush.winBonus) { net *= 1 + rush.winBonus; effects.push(`${rush.icon} RUSH +${Math.round(rush.winBonus * 100)}%`); }
      if (rush.bigBonus && payout >= stake * (rush.bigFrom || 3)) { net *= 1 + rush.bigBonus; effects.push(`${rush.icon} RUSH ×1.5`); }
    }
    return { payout: Math.floor(stake + net), effects };
  }

  // DILDO RUSH: kleine Chance auf +1 🍆 pro abgeschlossener Runde (pro Spieler gedeckelt, kein Farming)
  dildoRoll(pid, mods) {
    const rush = mods?.rush && Date.now() <= mods.rush.until ? this.rush : null;
    if (!rush || rush.id !== 'dildo' || rush !== this.rush) return false;
    const def = RUSHES.dildo;
    if ((rush.dildos[pid] || 0) >= def.dildoCap) return false;
    if (rand() >= def.dildoChance) return false;
    rush.dildos[pid] = (rush.dildos[pid] || 0) + 1;
    return true;
  }

  snapshot() {
    const md = this.modifier, r = this.rushActive();
    return {
      modifier: md ? (md.hidden ? { id: 'mystery', ...MYSTERY } : { id: md.id, name: MODIFIERS[md.id].name, icon: MODIFIERS[md.id].icon, desc: MODIFIERS[md.id].desc }) : null,
      rush: r ? { id: r.id, name: RUSHES[r.id].name, icon: RUSHES[r.id].icon, desc: RUSHES[r.id].desc, leftMs: Math.max(0, r.endsAt - Date.now()) } : null,
      rushCount: this.rushCount,
    };
  }
}
