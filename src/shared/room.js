// Autoritativer Spielraum. Läuft auf dem Node-Server (Multiplayer) oder im Browser (Solo).
// JavaScript ist single-threaded: jede Nachricht wird vollständig verarbeitet, bevor die nächste
// beginnt. Einsätze werden synchron gegen den Team-Pot geprüft und abgebucht – zwei gleichzeitige
// Wetten auf denselben Betrag können daher nie beide akzeptiert werden (kein Geld-Duplizieren).
import {
  START_CAPITAL, MAFIA_KEEP_FRACTION, FLOORS, floorDef, floorTables, ITEMS, RETRY_GAMES_HAT,
  FLOOR_REWARDS, CHALLENGE_FACTOR, CHALLENGE_REWARDS, LOADOUT_SLOTS, MAX_PLAYERS, fmtMoney, GAME_NAMES,
} from './config.js';
import { rand } from './rng.js';
import { slotsGame } from './games/slots.js';
import { rouletteGame } from './games/roulette.js';
import { blackjackGame } from './games/blackjack.js';
import { baccaratGame } from './games/baccarat.js';
import { crapsGame } from './games/craps.js';
import { pokerGame } from './games/poker.js';
import { wheelGame } from './games/wheel.js';

export const GAMES = {
  slots: slotsGame('normal'),
  highslots: slotsGame('high'),
  roulette: rouletteGame,
  blackjack: blackjackGame,
  baccarat: baccaratGame,
  craps: crapsGame,
  poker: pokerGame,
  wheel: wheelGame,
};

// Finale Shishabar: Alle Spieler müssen bis zum Mitarbeiter laufen (z kleiner als dieser Wert)
export const FINAL_COUNTER_Z = -27;

const VOTE_TIMEOUT = 25000;

export function defaultCampaign() {
  return { unlocked: 1, completed: [], gameComplete: false, highestPot: START_CAPITAL, bestWinnings: 0, bestDouble: 0, finishedAt: null, runs: 0 };
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
    this.run = { finalUnlocked: false, startedAt: Date.now() };
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
  }

  // ───────────────────────── Verbindungen ─────────────────────────
  join(conn, profile = {}) {
    if (this.players.size >= MAX_PLAYERS) { conn.send({ t: 'error', msg: 'Gruppe ist voll' }); return null; }
    const id = 'p' + this.nextId++;
    const p = {
      id, conn,
      name: String(profile.name || 'Spieler').slice(0, 16),
      appearance: profile.appearance || {},
      rewarded: new Set(profile.rewardedFloors || []),
      challenged: new Set(profile.challengeFloors || []),
      inventory: {}, loadout: [], used: {}, armed: {}, shishaRounds: 0,
      seat: null, pose: { p: [0, 0, 0], r: 0, a: 'idle' }, poseDirty: true,
      joinedAt: Date.now(),
    };
    if (!this.hostId) {
      this.hostId = id;
      // Der Gruppenersteller bringt seinen gespeicherten Fortschritt mit
      if (profile.campaign) this.campaign = { ...defaultCampaign(), ...profile.campaign };
      if (profile.run && Number.isFinite(profile.run.pot) && profile.run.pot >= 0) {
        this.pot = Math.floor(profile.run.pot);
        this.run = { finalUnlocked: !!profile.run.finalUnlocked, startedAt: profile.run.startedAt || Date.now() };
      }
    }
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

  flushMoves() {
    const moves = {};
    let any = false;
    for (const p of this.players.values()) if (p.poseDirty) { moves[p.id] = p.pose; p.poseDirty = false; any = true; }
    if (any) this.broadcast({ t: 'moves', moves });
  }

  snapshot() {
    const players = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, appearance: p.appearance, seat: p.seat, loadout: p.loadout,
      inventory: p.inventory, used: p.used, armed: p.armed, shishaRounds: p.shishaRounds, pose: p.pose,
    }));
    let session = null;
    if (this.session) {
      const tables = {};
      for (const [id, t] of Object.entries(this.session.tables)) tables[id] = { id, type: t.type, occupant: t.occupant, busy: t.busy, state: t.state, canRetry: t.lastRound };
      session = { entryPot: this.session.entryPot, targetReached: this.session.targetReached, ending: this.session.ending, tables };
    }
    return {
      code: this.code, hostId: this.hostId, players, pot: this.pot, campaign: this.campaign, run: this.run,
      scene: this.scene, floor: this.floor, session, vote: this.vote && { ...this.vote },
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
            p.pose = { p: msg.p, r: +msg.r || 0, a: String(msg.a || 'idle').slice(0, 12), pitch: +msg.pitch || 0 };
            p.poseDirty = true;
          }
          break;
        case 'profile':
          if (msg.name) p.name = String(msg.name).slice(0, 16);
          if (msg.appearance && typeof msg.appearance === 'object') p.appearance = msg.appearance;
          this.markDirty();
          break;
        case 'loadout': this.setLoadout(p, msg); break;
        case 'emote': this.event({ kind: 'emote', pid: id, e: String(msg.e).slice(0, 12) }); break;
        case 'vote.start': this.startVote(p, msg.type, msg.data || {}); break;
        case 'vote.cast': this.castVote(p, !!msg.yes); break;
        case 'table.sit': this.sit(p, msg.id); break;
        case 'table.leave': this.leaveTable(p); break;
        case 'table.start': this.tableStart(p, msg.id, msg.payload || {}); break;
        case 'table.action': this.tableAction(p, msg.id, String(msg.action)); break;
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
    };
    if (!labels[type]) return;
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
        if (this.pot < floorDef(n).minBet) return `Zu wenig Geld: Mindesteinsatz auf Stock ${n} ist ${fmtMoney(floorDef(n).minBet)}`;
        return null;
      }
      case 'return':
        if (this.scene !== 'floor' || !this.session) return 'Nicht im Casino';
        if (this.session.ending) return 'Zu spät…';
        if (Object.values(this.session.tables).some(t => t.busy)) return 'Erst alle laufenden Runden beenden';
        return null;
      case 'final':
        if (this.scene !== 'lobby') return 'Nur aus der Shishabar möglich';
        if (!this.run.finalUnlocked) return 'Erst $500\'000\'000 auf Stock 15 erreichen';
        return null;
      case 'take':
      case 'double':
        if (this.scene !== 'final' || this.finalBusy) return 'Nicht möglich';
        for (const p of this.players.values()) if (!(p.pose.p[2] < FINAL_COUNTER_Z)) return 'Alle Spieler müssen zum Mitarbeiter laufen';
        return null;
      case 'newrun':
        if (this.scene !== 'lobby') return 'Nur in der Shishabar möglich';
        return null;
    }
    return 'Unbekannt';
  }

  executeVote(type, data) {
    switch (type) {
      case 'travel': return this.enterFloor(Math.floor(data.floor));
      case 'return': return this.leaveFloor('return');
      case 'final': return this.changeScene('final');
      case 'take': return this.finalTake();
      case 'double': return this.finalDouble();
      case 'newrun': return this.newRun('manual');
    }
  }

  changeScene(scene, extra = {}) {
    this.scene = scene;
    for (const p of this.players.values()) p.seat = null;
    this.event({ kind: 'scene', scene, floor: this.floor, ...extra });
    this.markDirty();
  }

  newRun(reason) {
    this.pot = START_CAPITAL;
    this.run = { finalUnlocked: false, startedAt: Date.now() };
    this.campaign.runs = (this.campaign.runs || 0) + 1;
    this.event({ kind: 'newrun', reason, pot: this.pot });
    this.markDirty();
  }

  // ───────────────────────── Stockwerke ─────────────────────────
  enterFloor(n) {
    const tables = {};
    for (const def of floorTables(n)) {
      const game = GAMES[def.type];
      const t = { id: def.id, type: def.type, state: game.init(), occupant: null, busy: false, lastRound: {}, roundMods: null };
      game.setup?.(t);
      tables[def.id] = t;
    }
    this.floor = n;
    this.session = { entryPot: this.pot, targetReached: false, ending: false, tables };
    for (const p of this.players.values()) { p.used = {}; p.armed = {}; p.shishaRounds = 0; }
    this.changeScene('floor', { entryPot: this.pot });
  }

  leaveFloor(reason) {
    const n = this.floor;
    const f = floorDef(n);
    if (reason === 'return' && this.pot >= f.target * CHALLENGE_FACTOR) {
      for (const p of this.players.values()) {
        if (p.challenged.has(n)) continue;
        p.challenged.add(n);
        p.conn.send({ t: 'reward', dildos: CHALLENGE_REWARDS[n - 1], reason: `Bonus-Challenge Stock ${n}: mit ≥150% des Ziels verlassen`, challenge: n });
      }
    }
    this.session = null;
    const from = n;
    this.floor = null;
    for (const p of this.players.values()) { p.armed = {}; p.shishaRounds = 0; }
    this.changeScene('lobby', { from, reason, pot: this.pot });
  }

  checkTarget() {
    const s = this.session;
    if (!s || s.targetReached) return;
    const n = this.floor;
    const f = floorDef(n);
    if (this.pot < f.target) return;
    s.targetReached = true;
    const firstTime = !this.campaign.completed.includes(n);
    if (firstTime) {
      this.campaign.completed.push(n);
      this.campaign.completed.sort((a, b) => a - b);
    }
    const unlockedBefore = this.campaign.unlocked;
    this.campaign.unlocked = Math.min(FLOORS.length, Math.max(this.campaign.unlocked, n + 1));
    for (const p of this.players.values()) {
      if (p.rewarded.has(n)) continue;
      p.rewarded.add(n);
      p.conn.send({ t: 'reward', dildos: FLOOR_REWARDS[n - 1], reason: `Stock ${n} zum ersten Mal abgeschlossen`, floor: n });
    }
    if (n === FLOORS.length) {
      this.run.finalUnlocked = true;
      if (!this.campaign.gameComplete) this.campaign.finishedAt = Date.now();
      this.campaign.gameComplete = true;
    }
    this.event({ kind: 'target', floor: n, firstTime, newFloor: this.campaign.unlocked > unlockedBefore ? this.campaign.unlocked : null, final: n === FLOORS.length });
  }

  checkBankrupt() {
    const s = this.session;
    if (this.scene !== 'floor' || !s || s.ending) return;
    if (Object.values(s.tables).some(t => t.busy)) return;
    const f = floorDef(this.floor);
    if (this.pot >= f.minBet) return;
    // Mafia Briefcase eines Spielers rettet die Gruppe
    for (const p of this.players.values()) {
      if (p.loadout.includes('briefcase') && (p.inventory.briefcase || 0) > 0) {
        this.consume(p, 'briefcase');
        const bonus = Math.max(f.minBet * 5, Math.floor(s.entryPot * 0.3));
        this.pot += bonus;
        this.event({ kind: 'briefcase', pid: p.id, name: p.name, amount: bonus });
        this.markDirty();
        return;
      }
    }
    s.ending = true;
    for (const t of Object.values(s.tables)) t.occupant = null;
    for (const p of this.players.values()) p.seat = null;
    const keep = Math.max(START_CAPITAL, Math.floor(s.entryPot * MAFIA_KEEP_FRACTION));
    this.event({ kind: 'mafia', floor: this.floor, keep });
    this.markDirty();
    this.later(10500, () => {
      this.pot = Math.max(this.pot, keep);
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
    if (t.occupant && t.occupant !== p.id) return this.error(p.id, `${this.players.get(t.occupant)?.name || 'Jemand'} spielt hier gerade`);
    if (p.seat && p.seat !== id) { this.leaveTable(p); if (p.seat) return; }
    t.occupant = p.id;
    p.seat = id;
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

  tableStart(p, id, payload) {
    const t = this.getTable(p, id);
    if (!t) return;
    if (t.occupant !== p.id) return this.error(p.id, 'Setz dich zuerst an den Tisch');
    const game = GAMES[t.type];
    const idleish = !t.busy || (t.type === 'craps' && t.state.phase === 'idle');
    if (!idleish) return this.error(p.id, 'Runde läuft bereits');
    const wasBusy = t.busy;
    const rollBefore = JSON.stringify(t.state.spinId ?? t.state.dealId ?? t.state.rollId);
    game.start(this.makeCtx(p.id, t), t, payload);
    const started = JSON.stringify(t.state.spinId ?? t.state.dealId ?? t.state.rollId) !== rollBefore;
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

  makeCtx(pid, table) {
    const room = this;
    const f = floorDef(this.floor);
    return {
      limits: f.limits[table.type],
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
    payout = Math.floor(payout);
    this.pot += payout;
    const extra = Math.min(extraLoss, this.pot);
    this.pot -= extra;
    const net = payout - extra - stake;
    const f = floorDef(this.floor);
    table.roundMods = null;
    table.busy = !!r.keepBusy;
    if (net < 0 && stake > 0 && r.replay) table.lastRound[pid] = { game: table.type, replay: r.replay, loss: -net };
    else table.lastRound[pid] = null;
    if (this.pot > this.campaign.highestPot) this.campaign.highestPot = this.pot;
    const bigWin = net > 0 && (net >= stake * 8 || net >= f.target * 0.1);
    this.event({
      kind: 'result', pid, name: p?.name || '?', game: table.type, tableId: table.id,
      stake, payout: payout - extra, net, detail: r.detail, jackpot: !!r.jackpot, bigWin, effects,
      straight: r.straight, blackjacks: r.blackjacks, tieWin: r.tieWin, pointHit: r.pointHit,
      pokerCat: r.pokerCat, wheel: r.wheel, newStake: r.newStake, pot: this.pot,
    });
    this.markDirty();
    this.checkTarget();
    this.checkBankrupt();
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
    if (t.occupant !== p.id || t.busy) return this.error(p.id, 'Gerade nicht möglich');
    const last = t.lastRound[p.id];
    if (!last) return this.error(p.id, 'Keine verlorene Runde zum Wiederholen');
    if (item === 'luckyhat' && !RETRY_GAMES_HAT.includes(t.type)) return this.error(p.id, 'Lucky Hat wirkt nur bei Slots, Roulette, Rad und Craps');
    if (!this.canUseItem(p, item)) return this.error(p.id, 'Item nicht verfügbar');
    this.markUsed(p, item);
    t.lastRound[p.id] = null;
    this.pot += last.loss;
    this.event({ kind: 'item', pid: p.id, name: p.name, item, msg: `${ITEMS[item].name}: Runde wird zurückgesetzt (${fmtMoney(last.loss)} zurück)!` });
    this.tableStart(p, tableId, last.replay);
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

  finalDouble() {
    this.finalBusy = true;
    const result = rand() < 0.5 ? 'green' : 'red';
    const amount = this.pot;
    this.event({ kind: 'coin', result, amount });
    this.markDirty();
    this.later(7600, () => {
      if (result === 'green') {
        this.pot = amount * 2;
        this.campaign.bestDouble = Math.max(this.campaign.bestDouble || 0, this.pot);
        this.campaign.bestWinnings = Math.max(this.campaign.bestWinnings || 0, this.pot);
      } else this.pot = 0;
      this.event({ kind: 'doubleResult', result, amount: this.pot, before: amount });
      this.later(10000, () => this.endFinal());
    });
  }

  endFinal() {
    this.finalBusy = false;
    this.newRun('final');
    this.changeScene('lobby', { from: 'final' });
  }
}

export { GAME_NAMES };
