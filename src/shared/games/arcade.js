// Arcade-Casino-Spiele (Prompt 10): Crash, HiLo, Mines, Dragon Tower, Plinko, Keno, Money Wheel, Duck Race,
// Penguin Cross, Street Craps. Alle Ergebnisse werden autoritativ im Room (Server bzw. Solo-Raum) bestimmt –
// Animationen auf den Clients spielen nur ab, was hier feststeht. Auszahlungen liegen leicht über 100 %
// (Arcade-Casino, wie die übrigen Spiele), grosse Multiplikatoren bleiben selten, nichts ist garantiert.
import { rand, randInt } from '../rng.js';
import { devReroll } from '../dev.js';

const round2 = v => Math.floor(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function takeBet(ctx, payload, label) {
  const bet = Math.floor(+payload.bet || 0);
  const l = ctx.limits;
  if (!(bet >= l.min && bet <= l.max)) { ctx.fail(`Einsatz: ${ctx.money(l.min)} – ${ctx.money(l.max)}`); return 0; }
  if (!ctx.debit(bet, { label: `${ctx.money(bet)} ${label}` })) return 0;
  return bet;
}

// ───────────────────────── CRASH ─────────────────────────
// Multiplikator m(t) = e^(0.12·t). Absturzpunkt: 3 % sofort bei 1.00×, sonst P(Crash ≥ x) ≈ 1.02 / x.
export const CRASH_RATE = 0.12;
export const CRASH_MAX = 250;
export const crashMultAt = ms => Math.min(CRASH_MAX, round2(Math.exp(CRASH_RATE * Math.max(0, ms) / 1000)));
export const crashMsFor = m => Math.log(Math.max(1, m)) / CRASH_RATE * 1000;
export function rollCrash() {
  if (rand() < 0.03) return 1;
  return clamp(round2(1.05 / (1 - rand())), 1.01, CRASH_MAX);
}

export const crashGame = {
  type: 'crash',
  init() { return { phase: 'idle', roundId: 0, bet: 0, auto: 0, cashed: null, crash: null, startedAt: 0, history: [] }; },
  setup(t) { t.secret = {}; },
  canLeave() { return null; },
  start(ctx, table, payload) {
    const s = table.state;
    if (s.phase === 'running') return ctx.fail('Runde läuft bereits');
    const auto = +payload.auto > 0 ? clamp(round2(+payload.auto), 1.01, 100) : 0;
    const bet = takeBet(ctx, payload, 'AUF CRASH');
    if (!bet) return;
    let crash = rollCrash();
    let lucky = false;
    if (crash < 1.3 && ctx.lucky?.()) { const c2 = rollCrash(); if (c2 > crash) { crash = c2; lucky = true; } }
    if (ctx.dev) crash = CRASH_MAX; // Developer-Testmodus: kein Crash vor dem Cashout (danach crasht es kurz darauf)
    const sec = table.secret || (table.secret = {});
    Object.assign(sec, { crash, t0: Date.now(), lucky, bet, dev: !!ctx.dev });
    Object.assign(s, { phase: 'running', roundId: s.roundId + 1, bet, auto, cashed: null, crash: null, startedAt: sec.t0 });
    ctx.busy(true);
    const rid = s.roundId;
    if (auto && auto < crash) ctx.later(crashMsFor(auto), () => { if (s.roundId === rid) this.cashout(ctx, table, auto); });
    sec.crashAt = (c) => ctx.later(crashMsFor(c), () => {
      if (s.roundId !== rid || sec.crash !== c) return;
      s.phase = 'crashed';
      s.crash = c;
      s.history = [c, ...s.history].slice(0, 12);
      if (s.cashed === null) ctx.settle({ stake: bet, payout: 0, detail: `CRASHED @ ${c.toFixed(2)}×`, crash: c, multiplier: c });
      else { ctx.busy(false); ctx.changed(); }
    });
    sec.crashAt(crash);
  },
  cashout(ctx, table, at) {
    const s = table.state, sec = table.secret;
    if (s.phase !== 'running' || s.cashed !== null) return;
    const m = at || crashMultAt(Date.now() - sec.t0);
    if (m >= sec.crash) return; // zu spät – der Crash kommt gleich
    s.cashed = m;
    // Developer-Testmodus: nach dem Cashout crasht es bald (für alle Zuschauer ganz normal sichtbar)
    if (sec.dev) { const c = Math.min(CRASH_MAX, round2(Math.max(m * 1.12, m + 0.15))); sec.crash = c; sec.crashAt(c); }
    ctx.settle({ stake: s.bet, payout: Math.floor(s.bet * m), keepBusy: true, multiplier: m, crashCash: m, lucky: sec.lucky, detail: `Cashout bei ${m.toFixed(2)}×` });
  },
  action(ctx, table, action) { if (action === 'cashout') this.cashout(ctx, table); },
  // Aufstehen/Verbindungsabbruch während der Runde: automatisch zum aktuellen Multiplikator auscashen
  forceFinish(ctx, table) { if (table.state.phase === 'running' && table.state.cashed === null) this.cashout(ctx, table); },
};

// ───────────────────────── HILO ─────────────────────────
// Karten A(1) … K(13), unendlicher Stapel. Gleiche Karte = PUSH (kein Gewinn, kein Verlust, weiter mit der neuen Karte).
// Richtig geraten: Multiplikator × 0.99 · 12 / (Anzahl gewinnender Ränge).
export const HILO_STEP_EDGE = 0.99;
export const hiloOdds = (r, dir) => { const c = dir === 'hi' ? 13 - r : r - 1; return { count: c, chance: c / 12, mult: c ? round2(HILO_STEP_EDGE * 12 / c) : 0 }; };
const drawCard = () => ({ r: 1 + randInt(13), s: randInt(4) });

export const hiloGame = {
  type: 'hilo',
  init() { return { phase: 'idle', roundId: 0, bet: 0, card: null, prev: null, mult: 1, steps: 0, last: null, trail: [] }; },
  setup(t) { t.secret = {}; },
  canLeave() { return null; },
  start(ctx, table, payload) {
    const s = table.state;
    if (s.phase === 'play') return ctx.fail('Runde läuft bereits');
    const bet = takeBet(ctx, payload, 'AUF HILO');
    if (!bet) return;
    const card = drawCard();
    Object.assign(s, { phase: 'play', roundId: s.roundId + 1, bet, card, prev: null, mult: 1, steps: 0, last: null, trail: [card] });
    table.secret = { lucky: false };
    ctx.busy(true);
  },
  action(ctx, table, action) {
    const s = table.state;
    if (s.phase !== 'play') return;
    if (action === 'cash') return this.cash(ctx, table);
    if (action !== 'hi' && action !== 'lo') return;
    const o = hiloOdds(s.card.r, action);
    if (!o.count) return ctx.fail(action === 'hi' ? 'Höher als König geht nicht' : 'Tiefer als Ass geht nicht');
    let next = drawCard();
    const cur = s.card;
    const ok = c => (action === 'hi' ? c.r > cur.r : c.r < cur.r);
    // Ayri-Glück höchstens einmal pro Runde: eine falsche Karte wird neu gezogen (bleibt Zufall)
    if (next.r !== s.card.r && !ok(next) && !table.secret.lucky && ctx.lucky?.()) { table.secret.lucky = true; next = drawCard(); }
    if (ctx.dev) next = devReroll(next, drawCard, c => (ok(c) ? 1 : 0), 0);
    s.prev = s.card;
    s.card = next;
    s.trail = [...s.trail, next].slice(-12);
    if (next.r === s.prev.r) { s.last = 'push'; ctx.changed(); return; }
    if (ok(next)) {
      s.mult = round2(s.mult * o.mult);
      s.steps++;
      s.last = 'win';
      if (s.steps >= 25 || s.mult >= 5000) return this.cash(ctx, table);
      ctx.changed();
      return;
    }
    s.last = 'lose';
    s.phase = 'done';
    ctx.settle({ stake: s.bet, payout: 0, detail: `HiLo: ${s.steps} richtig, dann daneben`, multiplier: s.mult });
  },
  cash(ctx, table) {
    const s = table.state;
    if (s.phase !== 'play' || s.steps < 1) return ctx.fail('Erst mindestens einmal richtig tippen');
    s.phase = 'done';
    s.last = 'cash';
    ctx.settle({ stake: s.bet, payout: Math.floor(s.bet * s.mult), multiplier: s.mult, lucky: table.secret.lucky, detail: `HiLo: ${s.steps} richtig, ×${s.mult.toFixed(2)}` });
  },
  forceFinish(ctx, table) {
    const s = table.state;
    if (s.phase !== 'play') return;
    if (s.steps >= 1) this.cash(ctx, table);
    else { s.phase = 'done'; ctx.settle({ stake: s.bet, payout: s.bet, detail: 'HiLo abgebrochen – Einsatz zurück' }); }
  },
};

// ───────────────────────── MINES ─────────────────────────
// 5×5 Felder, 1–20 Minen. Multiplikator = 1.02 × faire Quote (je mehr Minen, desto schneller steigt er).
export const MINES_TILES = 25;
export const minesMult = (m, k) => { let f = 1; for (let i = 0; i < k; i++) f *= (MINES_TILES - i) / (MINES_TILES - m - i); return k ? round2(1.02 * f) : 1; };

export const minesGame = {
  type: 'mines',
  init() { return { phase: 'idle', roundId: 0, bet: 0, mines: 3, open: [], board: null, mult: 1, hit: null }; },
  setup(t) { t.secret = {}; },
  canLeave() { return null; },
  start(ctx, table, payload) {
    const s = table.state;
    if (s.phase === 'play') return ctx.fail('Runde läuft bereits');
    const mines = clamp(Math.floor(+payload.mines || 3), 1, 20);
    const bet = takeBet(ctx, payload, `AUF MINES (${mines} Minen)`);
    if (!bet) return;
    const cells = Array.from({ length: MINES_TILES }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) { const j = randInt(i + 1); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    table.secret = { mines: cells.slice(0, mines) };
    Object.assign(s, { phase: 'play', roundId: s.roundId + 1, bet, mines, open: [], board: null, mult: 1, hit: null });
    ctx.busy(true);
  },
  action(ctx, table, action) {
    const s = table.state;
    if (s.phase !== 'play') return;
    if (action === 'cash') return this.cash(ctx, table);
    const m = /^pick:(\d+)$/.exec(action);
    if (!m) return;
    const i = +m[1];
    if (i < 0 || i >= MINES_TILES || s.open.includes(i)) return;
    if (table.secret.mines.includes(i) && ctx.dev) {
      // Developer-Testmodus: die Mine liegt dann eben woanders (gleiche Anzahl Minen)
      const free = [...Array(MINES_TILES).keys()].filter(k => k !== i && !table.secret.mines.includes(k) && !s.open.includes(k));
      if (free.length) table.secret.mines = table.secret.mines.map(k => (k === i ? free[randInt(free.length)] : k));
    }
    if (table.secret.mines.includes(i)) {
      s.hit = i;
      s.phase = 'done';
      s.board = table.secret.mines;
      ctx.settle({ stake: s.bet, payout: 0, detail: `Mine! nach ${s.open.length} sicheren Feldern`, multiplier: s.mult });
      return;
    }
    s.open = [...s.open, i];
    s.mult = minesMult(s.mines, s.open.length);
    if (s.open.length >= MINES_TILES - s.mines) return this.cash(ctx, table);
    ctx.changed();
  },
  cash(ctx, table) {
    const s = table.state;
    if (s.phase !== 'play' || !s.open.length) return ctx.fail('Erst ein Feld öffnen');
    s.phase = 'done';
    s.board = table.secret.mines;
    ctx.settle({ stake: s.bet, payout: Math.floor(s.bet * s.mult), multiplier: s.mult, detail: `Mines: ${s.open.length} Felder, ×${s.mult.toFixed(2)}` });
  },
  forceFinish(ctx, table) {
    const s = table.state;
    if (s.phase !== 'play') return;
    if (s.open.length) this.cash(ctx, table);
    else { s.phase = 'done'; ctx.settle({ stake: s.bet, payout: s.bet, detail: 'Mines abgebrochen – Einsatz zurück' }); }
  },
};

// ───────────────────────── DRAGON TOWER ─────────────────────────
export const TOWER_LEVELS = 8;
export const TOWER_MODES = { easy: { tiles: 4, safe: 3, name: 'LEICHT' }, medium: { tiles: 3, safe: 2, name: 'MITTEL' }, hard: { tiles: 2, safe: 1, name: 'SCHWER' } };
export const TOWER_TOP_BONUS = 1.25; // die oberste Ebene ist besonders wertvoll
export const towerMult = (mode, k) => { const d = TOWER_MODES[mode]; return k ? round2(1.02 * Math.pow(d.tiles / d.safe, k) * (k >= TOWER_LEVELS ? TOWER_TOP_BONUS : 1)) : 1; };

export const towerGame = {
  type: 'tower',
  init() { return { phase: 'idle', roundId: 0, bet: 0, mode: 'easy', level: 0, picks: [], board: null, mult: 1, fail: null }; },
  setup(t) { t.secret = {}; },
  canLeave() { return null; },
  start(ctx, table, payload) {
    const s = table.state;
    if (s.phase === 'play') return ctx.fail('Runde läuft bereits');
    const mode = TOWER_MODES[payload.mode] ? payload.mode : 'easy';
    const bet = takeBet(ctx, payload, `AUF DRAGON TOWER (${TOWER_MODES[mode].name})`);
    if (!bet) return;
    const d = TOWER_MODES[mode];
    // Pro Ebene: welche Felder sind sicher?
    const board = Array.from({ length: TOWER_LEVELS }, () => {
      const idx = Array.from({ length: d.tiles }, (_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = randInt(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      return idx.slice(0, d.safe);
    });
    table.secret = { board };
    Object.assign(s, { phase: 'play', roundId: s.roundId + 1, bet, mode, level: 0, picks: [], board: null, mult: 1, fail: null });
    ctx.busy(true);
  },
  action(ctx, table, action) {
    const s = table.state;
    if (s.phase !== 'play') return;
    if (action === 'cash') return this.cash(ctx, table);
    const m = /^pick:(\d+)$/.exec(action);
    if (!m) return;
    const i = +m[1], d = TOWER_MODES[s.mode];
    if (i < 0 || i >= d.tiles) return;
    s.picks = [...s.picks, i];
    // Developer-Testmodus: das gewählte Feld ist sicher
    if (ctx.dev && !table.secret.board[s.level].includes(i)) table.secret.board[s.level] = [i, ...table.secret.board[s.level].slice(1)];
    if (!table.secret.board[s.level].includes(i)) {
      s.fail = { level: s.level, tile: i };
      s.phase = 'done';
      s.board = table.secret.board;
      ctx.settle({ stake: s.bet, payout: 0, detail: `Dragon Tower: Drache auf Ebene ${s.level + 1}`, multiplier: s.mult });
      return;
    }
    s.level++;
    s.mult = towerMult(s.mode, s.level);
    if (s.level >= TOWER_LEVELS) return this.cash(ctx, table);
    ctx.changed();
  },
  cash(ctx, table) {
    const s = table.state;
    if (s.phase !== 'play' || !s.level) return ctx.fail('Erst eine Ebene schaffen');
    s.phase = 'done';
    s.board = table.secret.board;
    ctx.settle({ stake: s.bet, payout: Math.floor(s.bet * s.mult), multiplier: s.mult, towerTop: s.level >= TOWER_LEVELS, detail: `Dragon Tower: Ebene ${s.level}, ×${s.mult.toFixed(2)}` });
  },
  forceFinish(ctx, table) {
    const s = table.state;
    if (s.phase !== 'play') return;
    if (s.level) this.cash(ctx, table);
    else { s.phase = 'done'; ctx.settle({ stake: s.bet, payout: s.bet, detail: 'Dragon Tower abgebrochen – Einsatz zurück' }); }
  },
};

// ───────────────────────── PENGUIN CROSS ─────────────────────────
export const PENGUIN_LANES = 10;
export const PENGUIN_MODES = { easy: { p: 0.85, name: 'LEICHT' }, medium: { p: 0.72, name: 'MITTEL' }, hard: { p: 0.55, name: 'SCHWER' } };
export const penguinMult = (mode, k) => (k ? round2(1.02 * Math.pow(1 / PENGUIN_MODES[mode].p, k)) : 1);

export const penguinGame = {
  type: 'penguin',
  init() { return { phase: 'idle', roundId: 0, bet: 0, mode: 'easy', lane: 0, mult: 1, fail: null }; },
  setup(t) { t.secret = {}; },
  canLeave() { return null; },
  start(ctx, table, payload) {
    const s = table.state;
    if (s.phase === 'play') return ctx.fail('Runde läuft bereits');
    const mode = PENGUIN_MODES[payload.mode] ? payload.mode : 'easy';
    const bet = takeBet(ctx, payload, `AUF PENGUIN CROSS (${PENGUIN_MODES[mode].name})`);
    if (!bet) return;
    // An welchem Abschnitt scheitert der Pinguin? (geometrisch verteilt; Ayri-Glück kann einen sehr frühen Sturz einmal neu würfeln)
    const roll = () => { let k = 1; while (k <= PENGUIN_LANES && rand() < PENGUIN_MODES[mode].p) k++; return k; };
    let fail = roll();
    if (fail <= 1 && ctx.lucky?.()) fail = Math.max(fail, roll());
    if (ctx.dev) fail = PENGUIN_LANES + 1; // Developer-Testmodus: jeder Abschnitt gelingt
    table.secret = { fail };
    Object.assign(s, { phase: 'play', roundId: s.roundId + 1, bet, mode, lane: 0, mult: 1, fail: null });
    ctx.busy(true);
  },
  action(ctx, table, action) {
    const s = table.state;
    if (s.phase !== 'play') return;
    if (action === 'cash') return this.cash(ctx, table);
    if (action !== 'go') return;
    const next = s.lane + 1;
    if (next === table.secret.fail) {
      s.fail = next;
      s.phase = 'done';
      ctx.settle({ stake: s.bet, payout: 0, detail: `Penguin Cross: erwischt auf Abschnitt ${next}`, multiplier: s.mult });
      return;
    }
    s.lane = next;
    s.mult = penguinMult(s.mode, next);
    if (next >= PENGUIN_LANES) return this.cash(ctx, table);
    ctx.changed();
  },
  cash(ctx, table) {
    const s = table.state;
    if (s.phase !== 'play' || !s.lane) return ctx.fail('Erst einen Abschnitt überqueren');
    s.phase = 'done';
    ctx.settle({ stake: s.bet, payout: Math.floor(s.bet * s.mult), multiplier: s.mult, detail: `Penguin Cross: ${s.lane} Abschnitte, ×${s.mult.toFixed(2)}` });
  },
  forceFinish(ctx, table) {
    const s = table.state;
    if (s.phase !== 'play') return;
    if (s.lane) this.cash(ctx, table);
    else { s.phase = 'done'; ctx.settle({ stake: s.bet, payout: s.bet, detail: 'Penguin Cross abgebrochen – Einsatz zurück' }); }
  },
};

// ───────────────────────── PLINKO ─────────────────────────
// 12 Reihen Pins, jede Reihe links/rechts (50/50). Fach = Anzahl Rechts-Abpraller. Die Animation folgt exakt dem Pfad.
export const PLINKO_ROWS = 12;
export const PLINKO_PAYS = {
  low: [8, 3, 1.6, 1.3, 1.1, 1.05, 0.6, 1.05, 1.1, 1.3, 1.6, 3, 8],
  medium: [26, 9, 3.4, 1.8, 1.2, 0.7, 0.4, 0.7, 1.2, 1.8, 3.4, 9, 26],
  high: [60, 16, 6, 2.6, 1.2, 0.4, 0.2, 0.4, 1.2, 2.6, 6, 16, 60],
};

export const plinkoGame = {
  type: 'plinko',
  init() { return { phase: 'idle', roundId: 0, bet: 0, risk: 'low', path: [], slot: 6, mult: 0 }; },
  start(ctx, table, payload) {
    const s = table.state;
    if (table.busy) return ctx.fail('Die Kugel fällt noch');
    const risk = PLINKO_PAYS[payload.risk] ? payload.risk : 'low';
    const bet = takeBet(ctx, payload, `AUF PLINKO (${risk.toUpperCase()})`);
    if (!bet) return;
    const drop = () => Array.from({ length: PLINKO_ROWS }, () => (rand() < 0.5 ? 1 : 0));
    let path = drop();
    const pay = p => PLINKO_PAYS[risk][p.reduce((a, b) => a + b, 0)];
    let lucky = false;
    if (pay(path) < 1 && ctx.lucky?.()) { const p2 = drop(); if (pay(p2) > pay(path)) { path = p2; lucky = pay(p2) > 1; } }
    if (ctx.dev) path = devReroll(path, drop, pay, 1);
    const slot = path.reduce((a, b) => a + b, 0);
    const mult = PLINKO_PAYS[risk][slot];
    Object.assign(s, { phase: 'drop', roundId: s.roundId + 1, bet, risk, path, slot, mult });
    ctx.busy(true);
    ctx.later(3400, () => {
      s.phase = 'idle';
      ctx.settle({ stake: bet, payout: Math.floor(bet * mult), multiplier: mult, lucky, detail: `Plinko ${risk.toUpperCase()}: ${mult}×` });
    });
  },
};

// ───────────────────────── KENO ─────────────────────────
// 40 Zahlen, 1–8 wählen, 10 werden gezogen. Auszahlung (× Einsatz) nach Treffern.
export const KENO_N = 40, KENO_DRAW = 10;
export const KENO_PAYS = {
  1: [0, 3.8],
  2: [0, 1.5, 5.6],
  3: [0, 0.9, 2.6, 14],
  4: [0, 0.5, 2, 5.4, 32],
  5: [0, 0, 1.5, 4, 15, 100],
  6: [0, 0, 1.1, 2.4, 7, 40, 300],
  7: [0, 0, 0.5, 2, 5, 17, 110, 600],
  8: [0, 0, 0.5, 1.5, 3, 9, 40, 250, 1000],
};

export const kenoGame = {
  type: 'keno',
  init() { return { phase: 'idle', roundId: 0, bet: 0, picks: [], drawn: [], hits: 0, mult: 0 }; },
  start(ctx, table, payload) {
    const s = table.state;
    if (table.busy) return ctx.fail('Ziehung läuft noch');
    const picks = [...new Set((Array.isArray(payload.picks) ? payload.picks : []).map(n => Math.floor(+n)).filter(n => n >= 1 && n <= KENO_N))].slice(0, 8);
    if (!picks.length) return ctx.fail('Wähle 1 bis 8 Zahlen');
    const bet = takeBet(ctx, payload, `AUF KENO (${picks.length} Zahlen)`);
    if (!bet) return;
    const drawOnce = () => { const all = Array.from({ length: KENO_N }, (_, i) => i + 1); for (let i = all.length - 1; i > 0; i--) { const j = randInt(i + 1); [all[i], all[j]] = [all[j], all[i]]; } return all.slice(0, KENO_DRAW); };
    const payFor = d => KENO_PAYS[picks.length][d.filter(n => picks.includes(n)).length];
    let drawn = drawOnce();
    let lucky = false;
    if (payFor(drawn) < 1 && ctx.lucky?.()) { const d2 = drawOnce(); if (payFor(d2) > payFor(drawn)) { drawn = d2; lucky = payFor(d2) > 1; } }
    if (ctx.dev) drawn = devReroll(drawn, drawOnce, payFor, 1);
    const hits = drawn.filter(n => picks.includes(n)).length;
    const mult = KENO_PAYS[picks.length][hits];
    Object.assign(s, { phase: 'draw', roundId: s.roundId + 1, bet, picks, drawn, hits, mult });
    ctx.busy(true);
    ctx.later(KENO_DRAW * 380 + 800, () => {
      s.phase = 'idle';
      ctx.settle({ stake: bet, payout: Math.floor(bet * mult), multiplier: mult, lucky, detail: `Keno: ${hits}/${picks.length} Treffer`, replay: { picks } });
    });
  },
};

// ───────────────────────── MONEY WHEEL ─────────────────────────
// 80 Felder; Auszahlung = Einsatz × Feldwert.
const MW_COUNTS = [[0, 40], [0.5, 16], [1, 11], [1.5, 6], [2, 3], [3, 1], [5, 1], [10, 1], [25, 1]];
function buildMoneyWheel() {
  const total = MW_COUNTS.reduce((a, [, c]) => a + c, 0);
  const slots = new Array(total).fill(null);
  for (const [v, c] of [...MW_COUNTS].sort((a, b) => a[1] - b[1])) {
    for (let i = 0; i < c; i++) {
      let idx = Math.floor((i + 0.37) * total / c) % total;
      while (slots[idx] !== null) idx = (idx + 1) % total;
      slots[idx] = v;
    }
  }
  return slots;
}
export const MONEY_WHEEL = buildMoneyWheel();

export const moneywheelGame = {
  type: 'moneywheel',
  init() { return { phase: 'idle', roundId: 0, bet: 0, result: 0, history: [] }; },
  start(ctx, table, payload) {
    const s = table.state;
    if (table.busy) return ctx.fail('Das Rad dreht noch');
    const bet = takeBet(ctx, payload, 'AUF DAS MONEY WHEEL');
    if (!bet) return;
    let result = randInt(MONEY_WHEEL.length);
    let lucky = false;
    if (MONEY_WHEEL[result] < 1 && ctx.lucky?.()) { const r2 = randInt(MONEY_WHEEL.length); if (MONEY_WHEEL[r2] > MONEY_WHEEL[result]) { result = r2; lucky = MONEY_WHEEL[r2] > 1; } }
    if (ctx.dev) result = devReroll(result, () => randInt(MONEY_WHEEL.length), r => MONEY_WHEEL[r], 1);
    const mult = MONEY_WHEEL[result];
    Object.assign(s, { phase: 'spin', roundId: s.roundId + 1, bet, result });
    ctx.busy(true);
    ctx.later(6200, () => {
      s.phase = 'idle';
      s.history = [mult, ...s.history].slice(0, 10);
      ctx.settle({ stake: bet, payout: Math.floor(bet * mult), multiplier: mult, lucky, detail: `Money Wheel: ${mult}×` });
    });
  },
};

// ───────────────────────── DUCK RACE ─────────────────────────
// 5 Enten mit unterschiedlicher Form; Quote = 0.9 / Siegchance (Ayri-Glück hebt die Auszahlung auf gut 100 %). Das Rennen (Zwischenstände) wird hier vorausberechnet:
// Führungswechsel sind möglich, aber die Gewinner-Ente kommt garantiert als erste ins Ziel.
export const DUCKS = [
  { name: 'FARUK', color: '#ffd60a', p: 0.30 },
  { name: 'ERLAF', color: '#ff4fa3', p: 0.25 },
  { name: 'YARL', color: '#2bd9fe', p: 0.20 },
  { name: 'SABIN', color: '#7cff6b', p: 0.15 },
  { name: 'QUACKY', color: '#c084ff', p: 0.10 },
].map(d => ({ ...d, odds: round2(0.9 / d.p) })); // mit Ayri-Glück insgesamt leicht über 100 %
export const DUCK_STEPS = 14;
function pickDuck() { let r = rand(); for (let i = 0; i < DUCKS.length; i++) { r -= DUCKS[i].p; if (r <= 0) return i; } return DUCKS.length - 1; }
function raceTrack(winner) {
  const finals = DUCKS.map((_, i) => (i === winner ? 1 : 0.86 + rand() * 0.12));
  return DUCKS.map((_, i) => {
    const inc = Array.from({ length: DUCK_STEPS }, () => 0.4 + rand() * 1.2);
    const sum = inc.reduce((a, b) => a + b, 0);
    let acc = 0;
    return inc.map(v => { acc += v; return +(acc / sum * finals[i]).toFixed(3); });
  });
}

export const duckGame = {
  type: 'duck',
  init() { return { phase: 'idle', roundId: 0, bet: 0, pick: 0, winner: null, track: null, history: [] }; },
  start(ctx, table, payload) {
    const s = table.state;
    if (table.busy) return ctx.fail('Das Rennen läuft noch');
    const pick = clamp(Math.floor(+payload.pick || 0), 0, DUCKS.length - 1);
    const bet = takeBet(ctx, payload, `AUF ${DUCKS[pick].name.toUpperCase()}`);
    if (!bet) return;
    let winner = pickDuck();
    let lucky = false;
    if (winner !== pick && ctx.lucky?.()) { const w2 = pickDuck(); if (w2 === pick) { winner = w2; lucky = true; } }
    if (ctx.dev) winner = pick;
    Object.assign(s, { phase: 'race', roundId: s.roundId + 1, bet, pick, winner, track: raceTrack(winner) });
    ctx.busy(true);
    ctx.later(7600, () => {
      s.phase = 'idle';
      s.history = [winner, ...s.history].slice(0, 10);
      const won = winner === pick;
      ctx.settle({ stake: bet, payout: won ? Math.floor(bet * DUCKS[pick].odds) : 0, multiplier: won ? DUCKS[pick].odds : 0, lucky, detail: `Duck Race: ${DUCKS[winner].name} gewinnt` });
    });
  },
};

// ───────────────────────── STREET CRAPS ─────────────────────────
// Ein Wurf mit zwei Würfeln. HOCH (8–12) und TIEF (2–6) zahlen 2.25×, SIEBEN und PASCH (gleiche Augen) je 5.6×.
export const STREET_BETS = {
  high: { name: 'HOCH (8–12)', pays: 2.25, wins: (a, b) => a + b >= 8 },
  low: { name: 'TIEF (2–6)', pays: 2.25, wins: (a, b) => a + b <= 6 },
  seven: { name: 'SIEBEN', pays: 5.6, wins: (a, b) => a + b === 7 },
  doubles: { name: 'PASCH', pays: 5.6, wins: (a, b) => a === b },
};

export const streetcrapsGame = {
  type: 'streetcraps',
  init() { return { phase: 'idle', roundId: 0, bet: 0, pick: 'high', dice: [3, 4], history: [] }; },
  start(ctx, table, payload) {
    const s = table.state;
    if (table.busy) return ctx.fail('Die Würfel rollen noch');
    const pick = STREET_BETS[payload.pick] ? payload.pick : 'high';
    const def = STREET_BETS[pick];
    const bet = takeBet(ctx, payload, `AUF ${def.name}`);
    if (!bet) return;
    const roll = () => [1 + randInt(6), 1 + randInt(6)];
    let dice = roll();
    let lucky = false;
    if (!def.wins(...dice) && ctx.lucky?.()) { const d2 = roll(); if (def.wins(...d2)) { dice = d2; lucky = true; } }
    if (ctx.dev) dice = devReroll(dice, roll, d => (def.wins(...d) ? 1 : 0), 0);
    Object.assign(s, { phase: 'roll', roundId: s.roundId + 1, bet, pick, dice });
    ctx.busy(true);
    ctx.later(2600, () => {
      s.phase = 'idle';
      s.history = [dice, ...s.history].slice(0, 10);
      const won = def.wins(...dice);
      ctx.settle({ stake: bet, payout: won ? Math.floor(bet * def.pays) : 0, multiplier: won ? def.pays : 0, lucky, detail: `Street Craps: ${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}` });
    });
  },
};

export const ARCADE_GAMES = {
  crash: crashGame, hilo: hiloGame, mines: minesGame, tower: towerGame, penguin: penguinGame,
  plinko: plinkoGame, keno: kenoGame, moneywheel: moneywheelGame, duck: duckGame, streetcraps: streetcrapsGame,
};
