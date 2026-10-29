// Slots: 3 Walzen × 3 Reihen, 1/3/5 Gewinnlinien.
import { randInt } from '../rng.js';

export const SYMBOLS = ['cherry', 'lemon', 'bell', 'bar', 'seven', 'diamond', 'crown'];
const C = 0, L = 1, B = 2, R = 3, S = 4, D = 5, K = 6;

// Walzenstreifen (Häufigkeit bestimmt Wahrscheinlichkeit)
const STRIP_NORMAL = [C, L, B, C, R, L, S, C, B, L, D, C, R, L, B, C, K, L, R, C, B, S, L, D];
const STRIP_HIGH = [C, L, B, R, C, S, L, D, B, C, K, L, R, B, C, S, D, L, C, R, D, B, L, C];

export const VARIANTS = {
  normal: {
    strip: STRIP_NORMAL,
    // Auszahlung in Vielfachen des Linieneinsatzes
    pay3: { [C]: 8, [L]: 10, [B]: 20, [R]: 40, [S]: 100, [D]: 150, [K]: 1000 },
    cherry2: 3, cherry1: 1,
  },
  high: {
    strip: STRIP_HIGH,
    pay3: { [C]: 6, [L]: 10, [B]: 20, [R]: 35, [S]: 70, [D]: 90, [K]: 2500 },
    cherry2: 3, cherry1: 0.5,
  },
};

// Linien: Reihenindex pro Walze
export const LINES = [
  [1, 1, 1], // Mitte
  [0, 0, 0], // oben
  [2, 2, 2], // unten
  [0, 1, 2], // Diagonale
  [2, 1, 0], // Diagonale
];

export function lineWin(v, syms) {
  const [a, b, c] = syms;
  if (a === b && b === c) return v.pay3[a];
  if (a === C && b === C) return v.cherry2;
  if (a === C) return v.cherry1;
  return 0;
}

export function spin(variantName, totalBet, lineCount) {
  const v = VARIANTS[variantName];
  const n = v.strip.length;
  const stops = [randInt(n), randInt(n), randInt(n)];
  const grid = stops.map(s => [v.strip[(s - 1 + n) % n], v.strip[s], v.strip[(s + 1) % n]]); // grid[reel][row]
  const lineBet = totalBet / lineCount;
  let payout = 0;
  const wins = [];
  let jackpot = false;
  for (let li = 0; li < lineCount; li++) {
    const rows = LINES[li];
    const syms = rows.map((row, reel) => grid[reel][row]);
    const m = lineWin(v, syms);
    if (m > 0) {
      payout += m * lineBet;
      wins.push({ line: li, mult: m });
      if (syms[0] === K && syms[1] === K && syms[2] === K) jackpot = true;
    }
  }
  return { stops, grid, payout: Math.floor(payout), wins, jackpot };
}

// Server-Logik
export const slotsGame = (variant) => ({
  type: variant === 'high' ? 'highslots' : 'slots',
  init() {
    return { phase: 'idle', stops: [0, 0, 0], wins: [], lines: 5, bet: 0, spinId: 0 };
  },
  start(ctx, table, payload) {
    const lines = [1, 3, 5].includes(payload.lines) ? payload.lines : 5;
    const bet = Math.floor(payload.bet);
    const lim = ctx.limits;
    if (!(bet >= lim.min && bet <= lim.max)) return ctx.fail(`Einsatz muss zwischen ${lim.min} und ${lim.max} liegen`);
    if (bet % lines !== 0 && bet < lines) return ctx.fail('Einsatz zu klein für Linien');
    if (!ctx.debit(bet, { label: `SPIN ${ctx.money(bet)}` })) return;
    const r = spin(variant, bet, lines);
    const s = table.state;
    s.phase = 'spinning';
    s.stops = r.stops;
    s.wins = r.wins;
    s.lines = lines;
    s.bet = bet;
    s.spinId++;
    ctx.busy(true);
    ctx.later(2600, () => {
      s.phase = 'idle';
      ctx.settle({
        stake: bet,
        payout: r.payout,
        jackpot: r.jackpot,
        detail: r.jackpot ? 'JACKPOT!' : r.payout > 0 ? `Gewinn ${ctx.money(r.payout)}` : 'Kein Gewinn',
        replay: { bet, lines },
      });
    });
  },
});
