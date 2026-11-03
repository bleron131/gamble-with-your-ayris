// Autoritativer Spielraum. Läuft auf dem Node-Server (Multiplayer) oder im Browser (Solo).
// JavaScript ist single-threaded: jede Nachricht wird vollständig verarbeitet, bevor die nächste
// beginnt. Einsätze werden synchron gegen den Team-Pot geprüft und abgebucht – zwei gleichzeitige
// Wetten auf denselben Betrag können daher nie beide akzeptiert werden (kein Geld-Duplizieren).
import {
  START_CAPITAL, FLOORS, floorDef, floorTables, PRESTIGE_MAX, prestigeScale, ITEMS, RETRY_GAMES_HAT,
  FLOOR_REWARDS, LOADOUT_SLOTS, MAX_PLAYERS, fmtMoney, GAME_NAMES, luckChance, slotSteps, MAKKA_BAR, MAKKA_MAX, MAKKA_LUCK_MS, MAKKA_LUCK_BONUS,
} from './config.js';
import { rand } from './rng.js';
import { NpcDirector, LOBBY_SEATS, SEAT_REACH } from './npcs.js';
import { EventDirector, HIGH_ROLLERS } from './events.js';
import { FloorDynamics, MODIFIERS } from './dynamics.js';
import { newRunStats, runPlayer, sanitizeRunStats, computeAwards } from './runstats.js';
import { isDeveloperTestPlayer, rollDouble } from './dev.js';
import { challengesFor, isChallengeId, legacyChallengeIds, newTracker, trackResult, progress as challengeProgress } from './challenges.js';
import { slotsGame, winTier } from './games/slots.js';
import { rouletteGame } from './games/roulette.js';
import { blackjackGame } from './games/blackjack.js';
import { baccaratGame } from './games/baccarat.js';
import { crapsGame } from './games/craps.js';
import { pokerGame } from './games/poker.js';
import { wheelGame } from './games/wheel.js';
import { ARCADE_GAMES } from './games/arcade.js';

const SLOT_HOLD_MS = 4000;
export const BAR_COOLDOWN_MS = 12000;
export const BAR_FLAVORS = ['Classic', 'Mango', 'Wassermelone', 'Zitrone', 'Cola-Kirsch', 'Pfirsich', 'Blaue Himbeere', 'Mystery 🤫'];

export const GAMES = {
  slots: slotsGame('normal'),
  highslots: slotsGame('high'),
  roulette: rouletteGame,
  blackjack: blackjackGame,
  baccarat: baccaratGame,
  craps: crapsGame,
  poker: pokerGame,
  wheel: wheelGame,
  ...ARCADE_GAMES,
};

// Finale Shishabar: Alle Spieler müssen bis zum Mitarbeiter laufen (z kleiner als dieser Wert)
export const FINAL_COUNTER_Z = -27;

const VOTE_TIMEOUT = 25000;

// unlocked/completed gehören zum AKTUELLEN Run (werden bei einem neuen Run zurückgesetzt);
// alles andere ist permanenter Fortschritt (Rekorde, je abgeschlossene Stockwerke für Kosmetik).
export function defaultCampaign() {
  return { unlocked: 1, completed: [], everCompleted: [], prestige: 0, gameComplete: false, highestPot: START_CAPITAL, bestWinnings: 0, bestDouble: 0, finishedAt: null, runs: 0 };
}

export function makeRunId() {
  return 'run_' + Date.now().toString(36) + Math.floor(rand() * 1e6).toString(36);
}

function cleanFloors(list) {
  return Array.isArray(list) ? [...new Set(list.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= FLOORS.length))].sort((a, b) => a - b) : [];
}

export function makeJoinCode() {
  const n = Math.floor(rand() * 9000) + 1000;
  return `AYRI-${n}`;
}

export class Room {
  constructor(code, { onEmpty } = {}) {
    this.code = code;
    this.players = new Map();
    this.hostId = null;
    this.pot = START_CAPITAL;
    this.campaign = defaultCampaign();
    this.run = { id: makeRunId(), finalUnlocked: false, startedAt: Date.now() };
    this.runStats = newRunStats(START_CAPITAL);
    this.scene = 'lobby';
    this.floor = null;
    this.session = null;
    this.vote = null;
    this.finalBusy = false;
    this.timers = new Set();
    this.dirty = false;
    this.onEmpty = onEmpty;
    this.nextId = 1;
    this.moveTimer = setInterval(() => this.flushMoves(), 66);
    // NPCs: Regie läuft serverseitig, damit alle Spieler dieselben NPCs sehen
    this.npcs = new NpcDirector(this);
    this.npcs.reset('lobby');
    this.events = new EventDirector(this);
    this.dyn = new FloorDynamics(this);
    this.streakKeys = new Set(); // Streak-Belohnungen: einmal pro Spieler(name), Run, Stockwerk und Stufe
    this.npcTimer = setInterval(() => { this.npcs.tick(); this.events.tick(); this.dyn.tick(); }, 1000);
  }

  // Prestige-Stufe (permanent im Fortschritt des Gruppenerstellers)
  get prestige() { return this.campaign.prestige || 0; }

  // ───────────────────────── Verbindungen ─────────────────────────
  join(conn, profile = {}) {
    if (this.players.size >= MAX_PLAYERS) { conn.send({ t: 'error', msg: 'Gruppe ist voll' }); return null; }
    const id = 'p' + this.nextId++;
    const p = {
      id, conn,
      name: String(profile.name || 'Spieler').slice(0, 16),
      appearance: profile.appearance || {},
      rewarded: new Set(profile.rewardedFloors || []),
      chDone: new Set([...(Array.isArray(profile.challenges) ? profile.challenges.filter(isChallengeId) : []), ...legacyChallengeIds(profile.challengeFloors)]),
      inventory: {}, loadout: [], used: {}, armed: {}, shishaRounds: 0, lossStreak: 0,
      makka: Math.max(0, Math.min(MAKKA_MAX, Math.floor(+profile.makka) || 0)), cocktails: 0, smokeAt: 0,
      hrWon: new Set((Array.isArray(profile.hrWon) ? profile.hrWon : []).filter(k => HIGH_ROLLERS[k])),
      hot: 0, cold: 0,
      seat: null, lseat: null, pose: { p: [0, 0, 0], r: 0, a: 'idle' }, poseDirty: true,
      joinedAt: Date.now(),
    };
    if (!this.hostId) {
      this.hostId = id;
      // Der Gruppenersteller bringt seinen gespeicherten Fortschritt mit
      if (profile.campaign) this.campaign = { ...defaultCampaign(), ...profile.campaign };
      const r = profile.run;
      if (r && Number.isFinite(r.pot) && r.pot >= 0) {
        this.pot = Math.floor(r.pot);
        this.run = { id: typeof r.id === 'string' ? r.id.slice(0, 40) : makeRunId(), finalUnlocked: !!r.finalUnlocked, startedAt: r.startedAt || Date.now() };
        // Double or Loss war schon entschieden (z. B. Neuladen während der Münze): Ergebnis bleibt, wird nicht neu gewürfelt
        const d = r.double;
        if (d && (d.result === 'green' || d.result === 'red') && Number.isFinite(d.before) && d.before >= 0) this.run.double = { result: d.result, before: Math.floor(d.before), after: d.result === 'green' ? Math.floor(d.before) * 2 : 0 };
        // Run-Fortschritt (Stockwerke) gehört zum gespeicherten Run
        if (Array.isArray(r.completed)) this.campaign.completed = cleanFloors(r.completed);
        if (Number.isFinite(r.unlocked)) this.campaign.unlocked = Math.max(1, Math.min(FLOORS.length, Math.floor(r.unlocked)));
        const rs = sanitizeRunStats(r.stats, this.pot);
        this.runStats = rs || newRunStats(START_CAPITAL, this.run.startedAt);
      }
      this.campaign.completed = cleanFloors(this.campaign.completed);
      this.campaign.unlocked = Math.max(1, Math.min(FLOORS.length, Math.floor(this.campaign.unlocked) || 1));
      this.campaign.everCompleted = cleanFloors([...(this.campaign.everCompleted || []), ...this.campaign.completed]);
      if (this.run.double) this.later(0, () => this.resolveSavedDouble());
    }
    // 🍆-Belohnungen pro Run mitzählen (für DILDO KING) – jede reward-Nachricht läuft hier durch
    const raw = conn;
    p.conn = { send: m => { if (m?.t === 'reward' && m.dildos > 0) runPlayer(this.runStats, p.name).dildos += m.dildos; raw.send(m); } };
    this.players.set(id, p);
    conn.send({ t: 'welcome', you: id, code: this.code, state: this.snapshot() });
    this.event({ kind: 'join', pid: id, name: p.name });
    this.markDirty();
    return id;
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.seat && this.session) {
      const table = this.session.tables[p.seat];
      if (table) {
        GAMES[table.type].forceFinish?.(this.makeCtx(id, table), table);
        table.occupant = null;
      }
    }
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value || null;
    this.event({ kind: 'leave', pid: id, name: p.name });
    if (this.vote) this.checkVote();
    this.markDirty();
    if (this.players.size === 0) this.onEmpty?.(this);
  }

  destroy() {
    clearInterval(this.moveTimer);
    clearInterval(this.npcTimer);
    clearTimeout(this.npcTimerPending);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  later(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); this.markDirty(); }, ms);
    this.timers.add(t);
    return t;
  }

  send(id, msg) { this.players.get(id)?.conn.send(msg); }
  broadcast(msg) { for (const p of this.players.values()) p.conn.send(msg); }
  event(ev) { this.broadcast({ t: 'event', ev: { ...ev, at: Date.now() } }); }
  error(id, msg) { this.send(id, { t: 'error', msg }); }

  markDirty() {
    if (this.dirty) return;
    this.dirty = true;
    setTimeout(() => { this.dirty = false; this.broadcast({ t: 'state', state: this.snapshot() }); }, 25);
  }

  // NPC-Änderungen als kleine eigene Nachricht (statt jedes Mal den ganzen Spielzustand zu senden)
  npcsDirty() {
    if (this.npcTimerPending) return;
    this.npcTimerPending = setTimeout(() => { this.npcTimerPending = null; this.broadcast({ t: 'npcs', npcs: this.npcs.snapshot() }); }, 40);
  }

  flushMoves() {
    const moves = {};
    let any = false;
    for (const p of this.players.values()) if (p.poseDirty) { moves[p.id] = p.pose; p.poseDirty = false; any = true; }
    if (any) this.broadcast({ t: 'moves', moves });
  }

  snapshot() {
    const players = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, appearance: p.appearance, seat: p.seat, loadout: p.loadout,
      inventory: p.inventory, used: p.used, armed: p.armed, shishaRounds: p.shishaRounds, pose: p.pose, makka: p.makka, lseat: p.lseat, hot: p.hot,
    }));
    let session = null;
    if (this.session) {
      const tables = {};
      for (const [id, t] of Object.entries(this.session.tables)) tables[id] = { id, type: t.type, occupant: t.occupant, busy: t.busy, state: t.state, canRetry: t.lastRound };
      session = { entryPot: this.session.entryPot, targetReached: this.session.targetReached, ending: this.session.ending, tables, challenges: this.challengeStatus() };
    }
    return {
      code: this.code, hostId: this.hostId, players, pot: this.pot, campaign: this.campaign, run: this.run,
      makkaLuckMs: Math.max(0, (this.makkaLuckUntil || 0) - Date.now()),
      scene: this.scene, floor: this.floor, session, vote: this.vote && { ...this.vote },
      npcs: this.npcs.snapshot(),
      runStats: this.runStats,
      events: this.events.snapshot(),
      dyn: this.dyn.snapshot(),
    };
  }

  // ───────────────────────── Nachrichten ─────────────────────────
  handle(id, msg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg !== 'object') return;
    try {
      switch (msg.t) {
        case 'move':
          if (Array.isArray(msg.p) && msg.p.length === 3 && msg.p.every(Number.isFinite)) {
            p.pose = { p: [msg.p[0], Math.max(0, Math.min(1.5, msg.p[1])), msg.p[2]], r: +msg.r || 0, a: String(msg.a || 'idle').slice(0, 12), pitch: +msg.pitch || 0, fx: String(msg.fx || '').slice(0, 6) };
            p.poseDirty = true;
            // Wer sich vom Sitz entfernt, gibt ihn frei (Sicherheitsnetz, falls seat.leave verloren geht)
            const st = p.lseat != null && LOBBY_SEATS[p.lseat];
            if (st && Math.hypot(p.pose.p[0] - st.x, p.pose.p[2] - st.z) > 1.6) { p.lseat = null; this.markDirty(); }
          }
          break;
        case 'profile':
          if (msg.name) p.name = String(msg.name).slice(0, 16);
          if (msg.appearance && typeof msg.appearance === 'object') p.appearance = msg.appearance;
          this.markDirty();
          break;
        case 'loadout': this.setLoadout(p, msg); break;
        case 'emote': this.event({ kind: 'emote', pid: id, e: String(msg.e).slice(0, 12) }); break;
        case 'makka.buy': this.buyMakka(p); break;
        case 'drink':
          if (msg.phase === 'drink') this.drinkMakka(p);
          else if (msg.phase === 'cocktail') this.drinkCocktail(p);
          else if (msg.phase === 'bar') this.barDrink(p);
          break;
        case 'smoke': this.smoke(p, msg.i); break;
        case 'seat.take': this.takeSeat(p, msg.i); break;
        case 'hr.challenge': this.events.challenge(p); break;
        case 'seat.leave': if (p.lseat != null) { p.lseat = null; this.markDirty(); } break;
        case 'vote.start': this.startVote(p, msg.type, msg.data || {}); break;
        case 'vote.cast': this.castVote(p, !!msg.yes); break;
        case 'table.sit': this.sit(p, msg.id); break;
        case 'slot.bet': this.slotBet(p, msg.id, msg.dir); break;
        case 'slot.setbet': this.slotSetBet(p, msg.id, msg.bet); break;
        case 'slot.spin': this.slotSpin(p, msg.id); break;
        case 'table.leave': this.leaveTable(p); break;
        case 'table.start': this.tableStart(p, msg.id, msg.payload || {}); break;
        case 'table.action': this.tableAction(p, msg.id, String(msg.action)); break;
        case 'table.edit': this.tableEdit(p, msg.id, msg.edit || {}); break;
        case 'item.arm': this.armItem(p, msg.item); break;
        case 'item.disarm': this.disarmItem(p, msg.item); break;
        case 'item.retry': this.retry(p, msg.item, msg.id); break;
        case 'ping': p.conn.send({ t: 'pong', at: msg.at }); break;
      }
    } catch (e) {
      console.error('Room error', e);
      this.error(id, 'Interner Fehler');
    }
  }

  setLoadout(p, msg) {
    if (this.scene === 'floor') return this.error(p.id, 'Ausrüstung nur in der Shishabar ändern');
    const inv = {};
    for (const [k, v] of Object.entries(msg.inventory || {})) if (ITEMS[k] && Number.isFinite(v) && v > 0) inv[k] = Math.floor(v);
    p.inventory = inv;
    p.loadout = (Array.isArray(msg.items) ? msg.items : []).filter((k, i, a) => ITEMS[k] && inv[k] > 0 && a.indexOf(k) === i).slice(0, LOADOUT_SLOTS);
    this.markDirty();
  }

  // ───────────────────────── Abstimmungen ─────────────────────────
  startVote(p, type, data) {
    if (this.vote) return this.error(p.id, 'Es läuft bereits eine Abstimmung');
    const why = this.voteBlocked(type, data);
    if (why) return this.error(p.id, why);
    const labels = {
      travel: `Mit dem Aufzug zu Stock ${data.floor} fahren?`,
      return: 'Zurück zur Shishabar?',
      final: 'Mit dem Aufzug nach ??? fahren?',
      take: `TAKE THE WINNINGS – ${fmtMoney(this.pot)} sichern?`,
      double: `DOUBLE OR LOSS – ${fmtMoney(this.pot)} → ${fmtMoney(this.pot * 2)} oder $0. ARE YOU SURE?`,
      newrun: `Neuen Run mit ${fmtMoney(START_CAPITAL)} starten? (Team-Pot ${fmtMoney(this.pot)} geht verloren)`,
      next: `Weiter zu Stock ${(this.floor || 0) + 1}?`,
      prestige: `PRESTIGE ${this.prestige + 1} starten? Neuer Run mit höheren Zielen – 🍆, Kosmetik, Rekorde und Trophäen bleiben.`,
    };
    if (!labels[type]) return;
    if (type === 'double') data = { ...data, by: p.id }; // wer die Entscheidung auslöst (Ayri000-Regel)
    if (this.players.size === 1) return this.executeVote(type, data);
    this.vote = { type, data, by: p.id, byName: p.name, label: labels[type], yes: [p.id], no: [], expires: Date.now() + VOTE_TIMEOUT };
    const v = this.vote;
    this.later(VOTE_TIMEOUT, () => { if (this.vote === v) { this.vote = null; this.event({ kind: 'toast', msg: 'Abstimmung abgelaufen' }); } });
    this.markDirty();
  }

  castVote(p, yes) {
    const v = this.vote;
    if (!v) return;
    if (!yes) {
      this.vote = null;
      this.event({ kind: 'toast', msg: `${p.name} hat abgelehnt` });
      this.markDirty();
      return;
    }
    if (!v.yes.includes(p.id)) v.yes.push(p.id);
    this.checkVote();
    this.markDirty();
  }

  checkVote() {
    const v = this.vote;
    if (!v) return;
    if ([...this.players.keys()].every(id => v.yes.includes(id))) {
      this.vote = null;
      const why = this.voteBlocked(v.type, v.data);
      if (why) { this.event({ kind: 'toast', msg: why }); return; }
      this.executeVote(v.type, v.data);
    }
  }

  voteBlocked(type, data) {
    switch (type) {
      case 'travel': {
        const n = Math.floor(data.floor);
        if (this.scene !== 'lobby') return 'Nur aus der Shishabar möglich';
        if (!(n >= 1 && n <= FLOORS.length)) return 'Ungültiges Stockwerk';
        if (n > this.campaign.unlocked) return 'Stockwerk noch gesperrt';
        if (this.pot < floorDef(n, this.prestige).minBet) return `Zu wenig Geld: Mindesteinsatz auf Stock ${n} ist ${fmtMoney(floorDef(n, this.prestige).minBet)}`;
        return null;
      }
      case 'return':
        if (this.scene === 'final') return this.finalBusy ? 'Nicht möglich' : null; // zurück aus dem Penthouse
        if (this.scene !== 'floor' || !this.session) return 'Nicht im Casino';
        if (this.session.ending) return 'Zu spät…';
        if (Object.values(this.session.tables).some(t => t.busy)) return 'Erst alle laufenden Runden beenden';
        return null;
      case 'final':
        // Ins CASINO PENTHOUSE: aus der Shishabar oder direkt nach dem Ziel auf Stock 15; nach dem ersten Sieg auch später zum Feiern
        if (this.scene === 'floor') {
          if (this.floor !== FLOORS.length || !this.session?.targetReached) return 'Nur nach dem Ziel auf Stock 15';
          if (Object.values(this.session.tables).some(t => t.busy)) return 'Erst alle laufenden Runden beenden';
        } else if (this.scene !== 'lobby') return 'Nur aus der Shishabar möglich';
        if (!this.run.finalUnlocked && !this.campaign.gameComplete) return 'Erst $500\'000\'000 auf Stock 15 erreichen';
        return null;
      case 'take':
      case 'double':
        if (this.scene !== 'final' || this.finalBusy || !this.run.finalUnlocked) return 'Nicht möglich';
        if (this.run.double) return 'Die Entscheidung ist bereits gefallen';
        for (const p of this.players.values()) if (!(p.pose.p[2] < FINAL_COUNTER_Z)) return 'Alle Spieler müssen zum Mitarbeiter laufen';
        return null;
      case 'newrun':
        if (this.scene !== 'lobby') return 'Nur in der Shishabar möglich';
        return null;
      case 'prestige':
        // Freiwillig: erst nach geschafftem Finale, aus der Shishabar oder dem Penthouse
        if (this.scene !== 'lobby' && this.scene !== 'final') return 'Nur in der Shishabar oder im Penthouse';
        if (this.finalBusy) return 'Nicht möglich';
        if (!this.campaign.prestigeReady) return 'Erst Stock 15 schaffen und das Finale spielen';
        if (this.prestige >= PRESTIGE_MAX) return 'Höchste Prestige-Stufe erreicht';
        return null;
      case 'next': {
        // Nach der Bilanz direkt mit dem Aufzug ins nächste Stockwerk (nur wenn das Ziel erreicht ist)
        if (this.scene !== 'floor' || !this.session || this.session.ending) return 'Nicht im Casino';
        if (!this.session.targetReached) return 'Erst das Ziel erreichen';
        const n = this.floor + 1;
        if (n > FLOORS.length) return 'Das war das oberste Stockwerk';
        if (n > this.campaign.unlocked) return 'Stockwerk noch gesperrt';
        if (Object.values(this.session.tables).some(t => t.busy)) return 'Erst alle laufenden Runden beenden';
        if (this.pot < floorDef(n, this.prestige).minBet) return `Zu wenig Geld für Stock ${n}`;
        return null;
      }
    }
    return 'Unbekannt';
  }

  executeVote(type, data) {
    switch (type) {
      case 'travel': return this.enterFloor(Math.floor(data.floor));
      case 'return': return this.scene === 'final' ? this.changeScene('lobby', { from: 'final' }) : this.leaveFloor('return');
      case 'final': {
        if (this.scene === 'floor') { this.session = null; this.floor = null; }
        return this.changeScene('final');
      }
      case 'take': return this.finalTake();
      case 'double': return this.finalDouble(data?.by);
      case 'newrun': return this.newRun('manual');
      case 'next': return this.nextFloor();
      case 'prestige': return this.startPrestige();
    }
  }

  changeScene(scene, extra = {}) {
    this.scene = scene;
    for (const p of this.players.values()) { p.seat = null; p.lseat = null; }
    this.events.reset(scene);
    this.npcs.reset(scene, this.floor);
    this.event({ kind: 'scene', scene, floor: this.floor, ...extra });
    this.dyn.reset(scene);
    this.markDirty();
  }

  // Neuer Run: ALLER Run-Fortschritt wird zurückgesetzt (Pot, freigeschaltete/abgeschlossene Stockwerke,
  // Casino-Zustände, temporäre Effekte) und eine neue Run-ID vergeben. Permanentes (Rekorde, 🍆, Kosmetik) bleibt.
  newRun(reason) {
    const oldId = this.run.id;
    this.pot = START_CAPITAL;
    this.run = { id: makeRunId(), finalUnlocked: false, startedAt: Date.now() };
    this.runStats = newRunStats(START_CAPITAL);
    this.campaign.unlocked = 1;
    this.campaign.completed = [];
    this.campaign.runs = (this.campaign.runs || 0) + 1;
    if (this.session) for (const t of Object.values(this.session.tables)) { t.occupant = null; t.busy = false; t.lastRound = {}; t.roundMods = null; }
    this.vote = null;
    for (const p of this.players.values()) { p.used = {}; p.armed = {}; p.shishaRounds = 0; p.lossStreak = 0; p.seat = null; }
    this.makkaLuckUntil = 0;
    this.event({ kind: 'newrun', reason, pot: this.pot, runId: this.run.id, oldRunId: oldId });
    this.markDirty();
  }

  // ───────────────────────── Stockwerke ─────────────────────────
  enterFloor(n) {
    const tables = {};
    for (const def of floorTables(n)) {
      const game = GAMES[def.type];
      const t = { id: def.id, type: def.type, state: game.init(), occupant: null, busy: false, lastRound: {}, roundMods: null };
      game.setup?.(t);
      // Jeder Automat startet mit eigenem Einsatz (verschiedene Stufen je Gerät)
      if (game.walkUp) {
        const steps = slotSteps(n, def.type, this.prestige);
        t.state.bet = steps[Math.min(steps.length - 1, Math.floor(steps.length * 0.3) + def.index)];
      }
      tables[def.id] = t;
    }
    this.floor = n;
    this.session = { entryPot: this.pot, targetReached: false, ending: false, tables, tracker: newTracker(n) };
    this.session.ledger = this.newLedger(n);
    for (const p of this.players.values()) { p.used = {}; p.armed = {}; p.shishaRounds = 0; }
    this.changeScene('floor', { entryPot: this.pot });
  }

  // ───────────────────────── MAKKA, Cocktail, Shisha ─────────────────────────
  makkaActive() { return Date.now() < (this.makkaLuckUntil || 0); }

  // MAKKA gibt es nur an Kemals Bar in der Shishabar (der Server prüft Szene und Position)
  buyMakka(p) {
    if (this.scene !== 'lobby') return this.error(p.id, 'MAKKA gibt es nur an der Bar in der Shishabar');
    const [x, , z] = p.pose.p;
    if (Math.hypot(x - MAKKA_BAR.x, z - MAKKA_BAR.z) > MAKKA_BAR.r) return this.error(p.id, 'Geh zuerst zu Kemal an die Bar');
    if (p.makka >= MAKKA_MAX) return this.error(p.id, `Mehr als ${MAKKA_MAX} MAKKA kannst du nicht tragen`);
    p.makka++;
    this.event({ kind: 'drink', pid: p.id, name: p.name, phase: 'buy', count: p.makka });
    this.markDirty();
  }

  // Gratis-MAKKA an der Casino-Bar (Prompt 12): reine Show – Trink-Animation und Geschmack, KEIN Glücks-Effekt,
  // damit die bezahlte MAKKA LUCK nicht umgangen werden kann. Kurze Pause zwischen zwei Drinks.
  barDrink(p) {
    if (this.scene !== 'floor') return;
    const now = Date.now();
    if (now < (p.barUntil || 0) || now < (p.drinkUntil || 0)) return;
    p.barUntil = now + BAR_COOLDOWN_MS;
    p.drinkUntil = now + 2000;
    const flavor = BAR_FLAVORS[Math.floor(rand() * BAR_FLAVORS.length)];
    this.event({ kind: 'drink', pid: p.id, name: p.name, phase: 'bar', flavor });
  }

  drinkMakka(p) {
    if (!(p.makka > 0)) return this.error(p.id, 'Du hast keinen MAKKA – kauf einen an der Bar in der Shishabar');
    if (Date.now() < (p.drinkUntil || 0)) return;
    p.makka--;
    p.drinkUntil = Date.now() + 2400;
    const casino = this.scene === 'floor' && this.session && !this.session.ending;
    this.event({ kind: 'drink', pid: p.id, name: p.name, phase: 'drink', count: p.makka, luck: casino });
    if (casino) {
      // Feste Stärke: weiteres Trinken erneuert nur die Dauer
      this.makkaLuckUntil = Date.now() + MAKKA_LUCK_MS;
      this.event({ kind: 'makkaLuck', pid: p.id, name: p.name, ms: MAKKA_LUCK_MS });
    }
    this.markDirty();
  }

  // Outfit-Cocktail: jeder dritte Drink macht schwindlig – kein Einfluss auf Glück oder Team-Pot
  drinkCocktail(p) {
    if (p.appearance?.accessory !== 'cocktail') return this.error(p.id, 'Rüste zuerst den Cocktail im Outfit aus');
    if (Date.now() < (p.drinkUntil || 0)) return;
    p.drinkUntil = Date.now() + 1800;
    p.cocktails = (p.cocktails % 3) + 1;
    this.event({ kind: 'drink', pid: p.id, name: p.name, phase: 'cocktail', n: p.cocktails });
  }

  // Shisha in der Shishabar rauchen (rein sozial, keine Wirkung auf das Spiel)
  smoke(p, i) {
    if (this.scene !== 'lobby') return;
    if (Date.now() < p.smokeAt) return;
    p.smokeAt = Date.now() + 3600;
    this.event({ kind: 'smoke', pid: p.id, name: p.name, i: Math.max(0, Math.min(9, Math.floor(+i) || 0)) });
  }

  // Sitzplatz in der Shishabar: Wer zuerst kommt, sitzt. Ist der Platz schon von einem Spieler belegt,
  // gibt es den nächsten freien Platz auf demselben Möbelstück – sonst passiert einfach nichts (keine Fehlermeldung).
  // NPCs machen echten Spielern sofort Platz.
  takeSeat(p, i) {
    if (this.scene !== 'lobby') return;
    const seat = LOBBY_SEATS[Math.floor(+i)];
    if (!seat) return;
    const [x, , z] = p.pose.p;
    const near = s => Math.hypot(x - s.x, z - s.z) <= SEAT_REACH;
    const busy = s => [...this.players.values()].some(q => q !== p && q.lseat === s.i);
    let target = !busy(seat) && near(seat) ? seat : null;
    if (!target && near(seat)) target = LOBBY_SEATS.filter(s => s.furn === seat.furn && !busy(s) && near(s)).sort((a, b) => Math.hypot(a.x - seat.x, a.z - seat.z) - Math.hypot(b.x - seat.x, b.z - seat.z))[0] || null;
    if (!target) return;
    p.lseat = target.i;
    this.npcs.evict(`seat:${target.i}`);
    this.markDirty();
  }

  // Freiwilliger Prestige-Run: höhere Stufe, Run beginnt neu (permanenter Fortschritt bleibt)
  startPrestige() {
    this.campaign.prestige = Math.min(PRESTIGE_MAX, this.prestige + 1);
    this.campaign.prestigeReady = false;
    this.event({ kind: 'prestige', level: this.campaign.prestige, scale: prestigeScale(this.campaign.prestige) });
    this.newRun('prestige');
    if (this.scene !== 'lobby') this.changeScene('lobby', { from: 'final' });
    this.markDirty();
  }

  // Direkt ins nächste Stockwerk (Aufzug von Stock n zu n+1); zählt wie „zurückkehren“ für die Leave-Challenge
  nextFloor() {
    const n = this.floor;
    const tr = this.session?.tracker;
    if (tr) { tr.flags.leaveFrac = this.pot / floorDef(n, this.prestige).target; this.checkChallenges(); }
    this.makkaLuckUntil = 0;
    for (const p of this.players.values()) { p.armed = {}; p.shishaRounds = 0; }
    this.enterFloor(n + 1);
  }

  // ───────────────────────── Stockwerk-Bilanz (Geldverlauf pro Spieler) ─────────────────────────
  // Der Team-Pot beim Betreten wird gleichmässig auf die anwesenden Spieler verteilt (Summe = Pot).
  // Jede Runde wird dem Spieler zugeordnet, der gesetzt hat: Einsatz, Gewinn/Verlust, Stand danach.
  newLedger(n) {
    const ids = [...this.players.keys()];
    const share = Math.floor(this.pot / Math.max(1, ids.length));
    const players = {};
    ids.forEach((id, i) => {
      const start = i === 0 ? this.pot - share * (ids.length - 1) : share;
      players[id] = this.ledgerPlayer(id, start);
    });
    return { floor: n, target: floorDef(n, this.prestige).target, entryPot: this.pot, startedAt: Date.now(), seq: 0, players, points: [] };
  }

  ledgerPlayer(id, start) {
    return { id, name: this.players.get(id)?.name || '?', start, balance: start, staked: 0, won: 0, lost: 0, rounds: 0, maxWin: 0, maxWinGame: null, maxStake: 0, maxStakeGame: null };
  }

  ledgerAdd(pid, game, stake, payout) {
    const L = this.session?.ledger;
    if (!L) return;
    const pl = L.players[pid] || (L.players[pid] = this.ledgerPlayer(pid, 0));
    const net = payout - stake;
    pl.name = this.players.get(pid)?.name || pl.name;
    pl.balance += net;
    pl.staked += stake;
    if (net > 0) pl.won += net; else pl.lost += -net;
    if (stake > 0) pl.rounds++;
    if (net > pl.maxWin) { pl.maxWin = net; pl.maxWinGame = game; }
    if (stake > pl.maxStake) { pl.maxStake = stake; pl.maxStakeGame = game; }
    L.seq++;
    if (L.points.length < 1500) L.points.push({ i: L.seq, pid, game, stake, payout, net, bal: pl.balance, t: Date.now() - L.startedAt });
  }

  leaveFloor(reason) {
    const n = this.floor;
    const f = floorDef(n, this.prestige);
    const tr = this.session?.tracker;
    if (reason === 'return' && tr && !this.session.ending) {
      tr.flags.leaveFrac = this.pot / f.target;
      this.checkChallenges();
    }
    this.session = null;
    this.makkaLuckUntil = 0;
    const from = n;
    this.floor = null;
    for (const p of this.players.values()) { p.armed = {}; p.shishaRounds = 0; }
    this.changeScene('lobby', { from, reason, pot: this.pot });
  }

  checkTarget() {
    const s = this.session;
    if (!s || s.targetReached) return;
    const n = this.floor;
    const f = floorDef(n, this.prestige);
    if (this.pot < f.target) return;
    s.targetReached = true;
    const firstTime = !this.campaign.completed.includes(n);
    if (firstTime) {
      this.campaign.completed.push(n);
      this.campaign.completed.sort((a, b) => a - b);
    }
    if (!this.campaign.everCompleted.includes(n)) this.campaign.everCompleted = cleanFloors([...this.campaign.everCompleted, n]);
    const unlockedBefore = this.campaign.unlocked;
    this.campaign.unlocked = Math.min(FLOORS.length, Math.max(this.campaign.unlocked, n + 1));
    // Stockwerk-Belohnung: feste 🍆 für ALLE Spieler, aber pro Spieler und Stockwerk nur einmal (unabhängig von Challenges)
    const floorRewards = {};
    for (const p of this.players.values()) {
      if (p.rewarded.has(n)) { floorRewards[p.id] = 0; continue; }
      p.rewarded.add(n);
      floorRewards[p.id] = FLOOR_REWARDS[n - 1];
      p.conn.send({ t: 'reward', dildos: FLOOR_REWARDS[n - 1], reason: `Stockwerk ${n} geschafft!`, floor: n });
    }
    // RISK NIGHT: zusätzliche 🍆 für alle beim Abschluss (einmal pro Stockwerk-Besuch)
    if (this.dyn.mod?.extraDildos && !s.riskPaid) {
      s.riskPaid = true;
      for (const p of this.players.values()) p.conn.send({ t: 'reward', dildos: this.dyn.mod.extraDildos, reason: `${MODIFIERS.risk.name}: Bonus für den Abschluss`, kind: 'event' });
    }
    // Automatische Bilanz für alle (Geldverlauf, Einsätze, Gewinne/Verluste pro Spieler)
    if (s.ledger) this.lastBalance = { floor: n, name: f.name, target: f.target, pot: this.pot, rewards: floorRewards, reward: FLOOR_REWARDS[n - 1], ledger: s.ledger, last: n === FLOORS.length };
    const tr = s.tracker;
    if (tr && tr.flags.targetMs == null) tr.flags.targetMs = Date.now() - tr.startedAt;
    if (firstTime) this.runStats.floors++;
    const finale = n === FLOORS.length && !this.run.finalUnlocked;
    if (n === FLOORS.length) {
      this.run.finalUnlocked = true;
      if (!this.campaign.gameComplete) this.campaign.finishedAt = Date.now();
      this.campaign.gameComplete = true;
    }
    this.event({ kind: 'target', floor: n, firstTime, newFloor: this.campaign.unlocked > unlockedBefore ? this.campaign.unlocked : null, final: n === FLOORS.length });
    if (this.lastBalance?.floor === n) this.event({ kind: 'balance', ...this.lastBalance });
    // Grosses Finale: FLOOR 15 COMPLETE → Bilanz → RUN-BILANZ mit Team-Awards (einmal pro Run)
    if (finale) this.event({ kind: 'finale', pot: this.pot, runId: this.run.id, durationMs: Date.now() - this.run.startedAt, stats: this.runStats, awards: computeAwards(this.runStats) });
  }

  checkBankrupt() {
    const s = this.session;
    if (this.scene !== 'floor' || !s || s.ending) return;
    if (Object.values(s.tables).some(t => t.busy)) return;
    const f = floorDef(this.floor, this.prestige);
    if (this.pot >= f.minBet) return;
    // Mafia Briefcase eines Spielers rettet die Gruppe
    for (const p of this.players.values()) {
      if (p.loadout.includes('briefcase') && (p.inventory.briefcase || 0) > 0) {
        this.consume(p, 'briefcase');
        const bonus = Math.max(f.minBet * 5, Math.floor(s.entryPot * 0.3));
        this.pot += bonus;
        this.ledgerAdd(p.id, 'briefcase', 0, bonus);
        this.event({ kind: 'briefcase', pid: p.id, name: p.name, amount: bonus });
        this.markDirty();
        return;
      }
    }
    s.ending = true;
    for (const t of Object.values(s.tables)) t.occupant = null;
    for (const p of this.players.values()) p.seat = null;
    // Bankrott = Run verloren: nach der Mafia-Sequenz beginnt ein komplett neuer Run für die ganze Gruppe
    this.event({ kind: 'mafia', floor: this.floor, keep: START_CAPITAL, runLost: true });
    this.markDirty();
    const runId = this.run.id;
    this.later(10500, () => {
      if (this.run.id !== runId) return;
      this.newRun('mafia');
      this.leaveFloor('mafia');
    });
  }

  // ───────────────────────── Tische ─────────────────────────
  getTable(p, id) {
    if (this.scene !== 'floor' || !this.session || this.session.ending) { this.error(p.id, 'Nicht im Casino'); return null; }
    const t = this.session.tables[id];
    if (!t) { this.error(p.id, 'Tisch nicht gefunden'); return null; }
    return t;
  }

  sit(p, id) {
    const t = this.getTable(p, id);
    if (!t) return;
    if (GAMES[t.type].walkUp) return this.error(p.id, 'Spielautomaten werden direkt am Gerät bedient');
    if (t.occupant && t.occupant !== p.id) return this.error(p.id, `${this.players.get(t.occupant)?.name || 'Jemand'} spielt hier gerade`);
    if (p.seat && p.seat !== id) { this.leaveTable(p); if (p.seat) return; }
    t.occupant = p.id;
    p.seat = id;
    this.npcs.evict(`table:${id}`);
    this.markDirty();
  }

  leaveTable(p) {
    if (!p.seat || !this.session) { p.seat = null; return; }
    const t = this.session.tables[p.seat];
    if (t) {
      const game = GAMES[t.type];
      const why = game.canLeave ? game.canLeave(t) : (t.busy ? 'Runde läuft noch' : null);
      if (why) return this.error(p.id, why);
      game.forceFinish?.(this.makeCtx(p.id, t), t);
      t.occupant = null;
    }
    p.seat = null;
    this.markDirty();
    this.checkBankrupt();
  }

  // ───────────────────────── Spielautomaten (begehbar) ─────────────────────────
  // Wer gerade an einem Automaten dreht oder den Einsatz verstellt, hält ihn kurz – so können
  // zwei Spieler nicht gleichzeitig an derselben Maschine widersprüchliche Änderungen machen.
  slotLock(p, t) {
    const now = Date.now();
    if (t.busy && t.occupant && t.occupant !== p.id) { this.error(p.id, `${this.players.get(t.occupant)?.name || 'Jemand'} dreht gerade an diesem Automaten`); return false; }
    if (t.busy) { this.error(p.id, 'Walzen drehen noch'); return false; }
    if (t.holder && t.holder.pid !== p.id && t.holder.until > now && this.players.has(t.holder.pid)) {
      this.error(p.id, `${this.players.get(t.holder.pid).name} spielt gerade an diesem Automaten`);
      return false;
    }
    t.holder = { pid: p.id, until: now + SLOT_HOLD_MS };
    this.npcs.evict(`slot:${t.id}`);
    return true;
  }

  slotBet(p, id, dir) {
    const t = this.getTable(p, id);
    if (!t || !GAMES[t.type].walkUp) return;
    if (!this.slotLock(p, t)) return;
    const steps = slotSteps(this.floor, t.type, this.prestige);
    let i = steps.indexOf(t.state.bet);
    if (i < 0) i = steps.findIndex(v => v >= t.state.bet);
    i = Math.max(0, Math.min(steps.length - 1, i + (dir > 0 ? 1 : -1)));
    t.state.bet = steps[i];
    t.state.betBy = p.name;
    t.state.betId = (t.state.betId || 0) + 1;
    this.markDirty();
  }

  // Exakter Einsatz vom 3D-Pult: auf die (ggf. durch Modifier/Rush skalierten) Limits begrenzt
  slotSetBet(p, id, bet) {
    const t = this.getTable(p, id);
    if (!t || !GAMES[t.type].walkUp) return;
    bet = Math.floor(+bet);
    if (!Number.isFinite(bet) || bet <= 0) return;
    if (!this.slotLock(p, t)) return;
    const lim = this.dyn.limits(floorDef(this.floor, this.prestige).limits[t.type], t.type);
    t.state.bet = Math.max(lim.min, Math.min(lim.max, bet));
    t.state.betBy = p.name;
    t.state.betId = (t.state.betId || 0) + 1;
    this.markDirty();
  }

  slotSpin(p, id, betOverride) {
    const t = this.getTable(p, id);
    if (!t || !GAMES[t.type].walkUp) return;
    if (!this.slotLock(p, t)) return;
    const bet = betOverride || t.state.bet;
    if (bet > this.pot) return this.error(p.id, `Nicht genug im Team-Pot für ${fmtMoney(bet)} (${fmtMoney(this.pot)})`);
    t.occupant = p.id;
    this.startRound(p, t, { bet, lines: 5 });
    if (!t.busy) t.occupant = null;
  }

  tableStart(p, id, payload) {
    const t = this.getTable(p, id);
    if (!t) return;
    if (GAMES[t.type].walkUp) return this.slotSpin(p, id);
    if (t.occupant !== p.id) return this.error(p.id, 'Setz dich zuerst an den Tisch');
    this.startRound(p, t, payload);
  }

  startRound(p, t, payload) {
    const id = t.id;
    const game = GAMES[t.type];
    const idleish = !t.busy || (t.type === 'craps' && t.state.phase === 'idle');
    if (!idleish) return this.error(p.id, 'Runde läuft bereits');
    const wasBusy = t.busy;
    const rollBefore = JSON.stringify(t.state.spinId ?? t.state.dealId ?? t.state.rollId);
    // MAKKA-LUCK gilt für die ganze Runde, wenn sie gestartet wird, solange der Boost läuft (auch wenn er währenddessen abläuft)
    if (this.makkaActive()) t.roundMods = { ...(t.roundMods || {}), makka: true };
    // Rush-Regel: zählt für Runden, die während des Rushs starten (Abrechnung bis 15 s nach Rush-Ende)
    const rushMods = this.dyn.roundMods(t.type);
    if (rushMods) t.roundMods = { ...(t.roundMods || {}), rush: rushMods };
    game.start(this.makeCtx(p.id, t), t, payload);
    const started = JSON.stringify(t.state.spinId ?? t.state.dealId ?? t.state.rollId) !== rollBefore;
    if (!started && t.roundMods?.makka && !t.busy) delete t.roundMods.makka;
    if (started) {
      t.lastRound[p.id] = null;
      // Golden Coin wird beim Start einer Wette geworfen
      if (p.armed.goldcoin && !t.roundMods?.coin) {
        const side = rand() < 0.5 ? 'gold' : 'black';
        t.roundMods = { ...(t.roundMods || {}), coin: side };
        delete p.armed.goldcoin;
        this.consume(p, 'goldcoin');
        this.event({ kind: 'item', pid: p.id, name: p.name, item: 'goldcoin', result: side, msg: side === 'gold' ? 'GOLD! Gewinn wird verdoppelt' : 'SCHWARZ! Verlust wird verdoppelt' });
      }
    } else if (!wasBusy) t.busy = false;
    this.markDirty();
  }

  tableAction(p, id, action) {
    const t = this.getTable(p, id);
    if (!t) return;
    if (t.occupant !== p.id) return this.error(p.id, 'Nicht dein Tisch');
    const game = GAMES[t.type];
    if (!game.action) return;
    game.action(this.makeCtx(p.id, t), t, action);
    this.markDirty();
  }

  // Vorbereitete Wette am Tisch bearbeiten (z. B. Roulette-Chips) – nur wer am Tisch sitzt, nichts wird abgebucht
  tableEdit(p, id, edit) {
    const t = this.getTable(p, id);
    if (!t) return;
    if (t.occupant !== p.id) return this.error(p.id, 'Setz dich zuerst an den Tisch');
    const game = GAMES[t.type];
    if (!game.edit) return;
    game.edit(this.makeCtx(p.id, t), t, { op: String(edit.op), spot: String(edit.spot || ''), amount: +edit.amount || 0 });
    this.markDirty();
  }

  makeCtx(pid, table) {
    const room = this;
    const f = floorDef(this.floor, this.prestige);
    return {
      limits: this.dyn.limits(f.limits[table.type], table.type),
      get jackpotChance() { return room.dyn.jackpotChance(table.type, table.roundMods); },
      floor: this.floor,
      pid,
      playerName: this.players.get(pid)?.name,
      money: fmtMoney,
      fail(msg) { room.error(pid, msg); },
      debit(amount, { label } = {}) {
        amount = Math.floor(amount);
        if (!(amount > 0)) { room.error(pid, 'Ungültiger Einsatz'); return false; }
        if (amount > room.pot) { room.error(pid, `Nicht genug im Team-Pot (${fmtMoney(room.pot)})`); return false; }
        const before = room.pot;
        room.pot -= amount;
        const p = room.players.get(pid);
        const highRisk = amount >= before * 0.25 && amount >= f.target * 0.05;
        room.event({ kind: 'bet', pid, name: p?.name || '?', amount, label, game: table.type, tableId: table.id, highRisk, share: amount / before });
        room.markDirty();
        return true;
      },
      refund(amount) { room.pot += Math.floor(amount); room.markDirty(); },
      busy(b) { table.busy = b; },
      later(ms, fn) { room.later(ms, fn); },
      changed() { room.markDirty(); },
      canUseItem(item) { return room.canUseItem(room.players.get(pid), item); },
      useItem(item) {
        const p = room.players.get(pid);
        if (!room.canUseItem(p, item)) return false;
        room.markUsed(p, item);
        room.event({ kind: 'item', pid, name: p.name, item, msg: `${ITEMS[item].name} eingesetzt!` });
        return true;
      },
      // Ayri-Glück (nach Pechsträhnen) – während MAKKA-LUCK deutlich häufiger, aber nie garantiert
      lucky() {
        const p = room.players.get(pid);
        if (!p) return false;
        const base = Math.min(0.9, luckChance(p.lossStreak) + room.dyn.luckBonus(table.type, table.roundMods));
        const bonus = table.roundMods?.makka ? MAKKA_LUCK_BONUS : 0;
        return rand() < base + (1 - base) * bonus;
      },
      get makka() { return !!table.roundMods?.makka; },
      // Developer-Testmodus (nur exakt „Ayri000“): Spiele wählen für diesen Spieler ein gewinnendes Ergebnis
      get dev() { return isDeveloperTestPlayer(room.players.get(pid)); },
      settle(r) { room.settle(pid, table, r); },
    };
  }

  // Auszahlung inkl. Item-Effekten
  settle(pid, table, r) {
    let { stake, payout } = r;
    const p = this.players.get(pid);
    const mods = table.roundMods || {};
    let extraLoss = 0;
    const effects = [];
    if (stake > 0 && p) {
      if (p.shishaRounds > 0) {
        p.shishaRounds--;
        if (payout > stake) { payout = stake + Math.floor((payout - stake) * 1.5); effects.push('💨 Shisha +50%'); }
        else if (payout < stake) { extraLoss += Math.floor(stake * 0.25); effects.push('💨 Shisha -25%'); }
      }
      if (mods.coin === 'gold' && payout > stake) { payout = stake + (payout - stake) * 2; effects.push('🪙 Gold ×2'); }
      if (mods.coin === 'black' && payout < stake) { extraLoss += stake; effects.push('🪙 Schwarz: doppelter Verlust'); }
      if (p.armed.pokal && payout > stake) {
        delete p.armed.pokal;
        this.consume(p, 'pokal');
        const ok = rand() < 0.5;
        payout = ok ? payout * 2 : 0;
        this.event({ kind: 'item', pid, name: p.name, item: 'pokal', result: ok ? 'win' : 'lose', msg: ok ? 'POKAL: GEWINN ×2!' : 'POKAL: Gewinn verloren!' });
      }
      if (p.armed.devildice && payout > stake) {
        delete p.armed.devildice;
        this.markUsed(p, 'devildice');
        const ok = rand() < 0.5;
        if (ok) payout *= 3; else { payout = 0; extraLoss += stake; }
        this.event({ kind: 'item', pid, name: p.name, item: 'devildice', result: ok ? 'win' : 'lose', msg: ok ? 'DEVIL DICE: GEWINN ×3!' : 'DEVIL DICE: Alles weg + Einsatz nochmal!' });
      }
      if (p.armed.insurance && payout < stake) {
        delete p.armed.insurance;
        this.consume(p, 'insurance');
        const back = Math.floor((stake - payout) * 0.5);
        payout += back;
        this.event({ kind: 'item', pid, name: p.name, item: 'insurance', msg: `VERSICHERUNG zahlt ${fmtMoney(back)}` });
      }
    }
    // Floor Modifier & Rush (nur auf den Gewinnanteil)
    if (stake > 0) { const adj = this.dyn.adjustPayout(table.type, stake, payout, mods); payout = adj.payout; effects.push(...adj.effects); }
    payout = Math.floor(payout);
    this.pot += payout;
    const extra = Math.min(extraLoss, this.pot);
    this.pot -= extra;
    const net = payout - extra - stake;
    const f = floorDef(this.floor, this.prestige);
    table.roundMods = null;
    table.busy = !!r.keepBusy;
    if (GAMES[table.type].walkUp) { table.occupant = null; table.holder = { pid, until: Date.now() + SLOT_HOLD_MS }; }
    const tier = winTier(net, stake, !!r.jackpot);
    if (net < 0 && stake > 0 && r.replay) table.lastRound[pid] = { game: table.type, replay: r.replay, loss: -net };
    else table.lastRound[pid] = null;
    if (p && stake > 0) p.lossStreak = net < 0 ? p.lossStreak + 1 : net > 0 ? 0 : p.lossStreak;
    if (p && stake > 0) this.trackStreak(p, net);
    if (this.pot > this.campaign.highestPot) this.campaign.highestPot = this.pot;
    const bigWin = net > 0 && (net >= stake * 8 || net >= f.target * 0.1);
    this.event({
      kind: 'result', pid, name: p?.name || '?', game: table.type, tableId: table.id,
      stake, payout: payout - extra, net, detail: r.detail, jackpot: !!r.jackpot, bigWin, effects, tier, multiplier: r.multiplier,
      straight: r.straight, blackjacks: r.blackjacks, tieWin: r.tieWin, pointHit: r.pointHit,
      pokerCat: r.pokerCat, wheel: r.wheel, roulette: r.roulette, newStake: r.newStake, pot: this.pot, lucky: !!r.lucky && net > 0,
    });
    if (stake > 0 || payout > 0) this.ledgerAdd(pid, table.type, stake, payout - extra);
    if (stake > 0) {
      const rs = this.runStats, rp = runPlayer(rs, p?.name || this.session?.ledger?.players[pid]?.name || '?');
      rs.staked += stake; rs.rounds++; rp.staked += stake; rp.rounds++;
      if (net > 0) { rs.won += net; rs.wins++; rp.won += net; if (net > rp.maxWin) { rp.maxWin = net; rp.maxWinGame = table.type; } }
      else if (net < 0) { rs.lost += -net; rs.losses++; rp.lost += -net; }
    }
    const tr = this.session?.tracker;
    if (tr && p) trackResult(tr, { pid, game: table.type, stake, net, blackjacks: r.blackjacks, straight: r.straight, tieWin: r.tieWin, pointHit: r.pointHit, pokerCat: r.pokerCat, makka: !!mods.makka, tier: GAMES[table.type].walkUp ? tier : null, target: f.target });
    if (p && stake > 0) this.events.onResult({ game: table.type, stake, net });
    if (stake > 0) {
      this.dyn.reveal();
      if (p && this.dyn.dildoRoll(p.name, mods)) p.conn.send({ t: 'reward', dildos: 1, reason: 'DILDO RUSH', kind: 'rush' });
    }
    this.markDirty();
    this.checkTarget();
    this.checkChallenges();
    this.checkBankrupt();
  }

  // ───────────────────────── Hot/Loss-Streaks (pro Spieler) ─────────────────────────
  // Streaks sind vor allem Prestige & Statistik. Kleine 🍆 bei 5 und 10 Siegen in Folge – einmal pro Spieler,
  // Run, Stockwerk und Stufe (auch nach Reconnect nicht doppelt).
  trackStreak(p, net) {
    if (net > 0) { p.hot++; p.cold = 0; } else if (net < 0) { p.cold++; p.hot = 0; } else return;
    const rp = runPlayer(this.runStats, p.name);
    rp.bestStreak = Math.max(rp.bestStreak, p.hot);
    rp.worstStreak = Math.max(rp.worstStreak, p.cold);
    const n = net > 0 ? p.hot : p.cold;
    if ([2, 3, 5, 10, 15, 20].includes(n)) this.event({ kind: 'streak', pid: p.id, name: p.name, hot: net > 0, n });
    if (net > 0 && (n === 5 || n === 10)) {
      const key = `${p.name}|${this.run.id}|${this.floor}|${n}`;
      if (!this.streakKeys.has(key)) {
        this.streakKeys.add(key);
        p.conn.send({ t: 'reward', dildos: n === 5 ? 1 : 2, reason: n === 5 ? 'ON FIRE – 5 Siege in Folge' : 'UNSTOPPABLE – 10 Siege in Folge', kind: 'streak' });
      }
    }
  }

  // ───────────────────────── Challenges (optional, blockieren nie) ─────────────────────────
  challengeCtx() {
    return { pot: this.pot, target: floorDef(this.floor, this.prestige).target, players: [...this.players.keys()] };
  }

  challengeStatus() {
    const tr = this.session?.tracker;
    if (!tr || !this.floor) return [];
    const ctx = this.challengeCtx();
    return challengesFor(this.floor).map(c => ({ id: c.id, ...challengeProgress(c, tr, ctx), done: tr.done.includes(c.id) }));
  }

  checkChallenges() {
    const tr = this.session?.tracker;
    if (!tr || !this.floor) return;
    const ctx = this.challengeCtx();
    for (const c of challengesFor(this.floor)) {
      if (tr.done.includes(c.id)) continue;
      const { prog, goal } = challengeProgress(c, tr, ctx);
      if (prog < goal) continue;
      tr.done.push(c.id);
      this.runStats.challenges++;
      this.event({ kind: 'challenge', id: c.id, floor: this.floor, text: c.text, reward: c.reward });
      // Belohnung einmalig pro Spieler (wer sie schon früher geschafft hat, bekommt nichts doppelt)
      for (const p of this.players.values()) {
        if (p.chDone.has(c.id)) continue;
        p.chDone.add(c.id);
        p.conn.send({ t: 'reward', dildos: c.reward, reason: `CHALLENGE ABGESCHLOSSEN: ${c.text}`, challenge: c.id, kind: 'challenge' });
      }
      this.markDirty();
    }
  }

  // ───────────────────────── Items ─────────────────────────
  canUseItem(p, item) {
    if (!p || !ITEMS[item] || !p.loadout.includes(item) || !((p.inventory[item] || 0) > 0)) return false;
    if (ITEMS[item].usage === 'perLevel' && p.used[item]) return false;
    return true;
  }

  consume(p, item) {
    p.inventory[item] = Math.max(0, (p.inventory[item] || 0) - 1);
    p.conn.send({ t: 'itemConsumed', item });
    this.markDirty();
  }

  markUsed(p, item) {
    if (ITEMS[item].usage === 'single') this.consume(p, item);
    else p.used[item] = true;
    this.markDirty();
  }

  armItem(p, item) {
    if (this.scene !== 'floor' || this.session?.ending) return this.error(p.id, 'Items nur im Casino');
    if (!this.canUseItem(p, item)) return this.error(p.id, 'Item nicht verfügbar');
    const def = ITEMS[item];
    if (def.mode !== 'arm') return this.error(p.id, 'Dieses Item wird anders benutzt');
    if (item === 'shisha') {
      if (p.shishaRounds > 0) return this.error(p.id, 'Shisha läuft noch');
      this.consume(p, 'shisha');
      p.shishaRounds = 5;
      this.event({ kind: 'item', pid: p.id, name: p.name, item, msg: 'GLÜCKS-SHISHA: 5 Runden heisses Glück!' });
    } else {
      p.armed[item] = true;
      this.event({ kind: 'item', pid: p.id, name: p.name, item, armed: true, msg: `${def.name} aktiviert` });
    }
    this.markDirty();
  }

  disarmItem(p, item) {
    if (p.armed[item]) { delete p.armed[item]; this.markDirty(); }
  }

  retry(p, item, tableId) {
    if (!['luckyhat', 'crown'].includes(item)) return;
    const t = this.getTable(p, tableId);
    if (!t) return;
    const walkUp = GAMES[t.type].walkUp;
    if ((!walkUp && t.occupant !== p.id) || t.busy) return this.error(p.id, 'Gerade nicht möglich');
    const last = t.lastRound[p.id];
    if (!last) return this.error(p.id, 'Keine verlorene Runde zum Wiederholen');
    if (item === 'luckyhat' && !RETRY_GAMES_HAT.includes(t.type)) return this.error(p.id, 'Lucky Hat wirkt nur bei Slots, Roulette, Rad und Craps');
    if (!this.canUseItem(p, item)) return this.error(p.id, 'Item nicht verfügbar');
    this.markUsed(p, item);
    t.lastRound[p.id] = null;
    this.pot += last.loss;
    this.ledgerAdd(p.id, item, 0, last.loss);
    this.event({ kind: 'item', pid: p.id, name: p.name, item, msg: `${ITEMS[item].name}: Runde wird zurückgesetzt (${fmtMoney(last.loss)} zurück)!` });
    if (walkUp) this.slotSpin(p, tableId, last.replay.bet);
    else this.tableStart(p, tableId, last.replay);
  }

  // ───────────────────────── Finale ─────────────────────────
  finalTake() {
    this.finalBusy = true;
    const amount = this.pot;
    this.campaign.bestWinnings = Math.max(this.campaign.bestWinnings || 0, amount);
    this.event({ kind: 'take', amount, date: Date.now() });
    this.markDirty();
    this.later(11000, () => this.endFinal());
  }

  // Ergebnis wird EINMAL bestimmt und sofort im Run gespeichert (Host speichert ihn mit): Neuladen, Disconnect oder
  // erneutes Öffnen würfeln nicht neu. Der Pot ändert sich genau einmal – bei der Enthüllung nach der Münz-Animation.
  finalDouble(byId) {
    if (this.finalBusy || this.run.double) return;
    this.finalBusy = true;
    const starter = this.players.get(byId);
    const result = rollDouble(isDeveloperTestPlayer(starter), rand);
    const before = this.pot;
    const after = result === 'green' ? before * 2 : 0;
    this.run.double = { result, before, after };
    this.event({ kind: 'coin', result, amount: before });
    this.markDirty();
    const runId = this.run.id;
    this.later(7600, () => {
      if (this.run.id !== runId || this.run.double?.applied) return;
      this.applyDouble();
      this.later(10000, () => this.endFinal());
    });
  }

  applyDouble() {
    const d = this.run.double;
    if (!d || d.applied) return;
    d.applied = true;
    this.pot = d.after; // Verlust: genau der eingesetzte Betrag (nie negativ), Gewinn: exakt verdoppelt
    if (d.result === 'green') {
      this.campaign.bestDouble = Math.max(this.campaign.bestDouble || 0, d.after);
      this.campaign.bestWinnings = Math.max(this.campaign.bestWinnings || 0, d.after);
    }
    this.event({ kind: 'doubleResult', result: d.result, amount: d.after, before: d.before });
    this.markDirty();
  }

  // Beim Laden eines Spielstands mit bereits gefallener Entscheidung: Ergebnis übernehmen und den Run abschliessen
  resolveSavedDouble() {
    const d = this.run.double;
    if (!d) return;
    this.applyDouble();
    this.event({ kind: 'toast', msg: `Double or Loss stand bereits fest: ${d.result === 'green' ? 'DOUBLE' : 'LOSS'}` });
    this.endFinal();
  }

  endFinal() {
    this.finalBusy = false;
    // Finale gespielt → der Run ist vorbei. Prestige wird NICHT automatisch gestartet: es wird nur freigeschaltet
    this.campaign.prestigeReady = this.prestige < PRESTIGE_MAX;
    this.newRun('final');
    this.changeScene('lobby', { from: 'final' });
  }
}

export { GAME_NAMES };
