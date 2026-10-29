// Slots: 3 Walzen × 3 Reihen, 1/3/5 Gewinnlinien.
// Party-Balancing: Die Krone ist WILD (ersetzt jedes Symbol), zwei gleiche Symbole auf Walze 1+2 zahlen ebenfalls.
import { randInt } from '../rng.js';

export const SYMBOLS = ['cherry', 'lemon', 'bell', 'bar', 'seven', 'diamond', 'crown'];
const C = 0, L = 1, B = 2, R = 3, S = 4, D = 5, K = 6;

// Walzenstreifen gleichmässig aus Symbol-Häufigkeiten aufbauen
function buildStrip(counts) {
  const pos = [];
  counts.forEach((c, s) => { for (let i = 0; i < c; i++) pos.push([(i + 0.5) / c + s * 0.013, s]); });
  return pos.sort((a, b) => a[0] - b[0]).map(p => p[1]);
}

export const VARIANTS = {
  // ohne Ayri-Glück ~100 % RTP, mit Glück ~105 %; gut jeder dritte Spin gewinnt
  normal: {
    strip: buildStrip([9, 6, 3, 2, 2, 1, 1]),
    // Auszahlung in Vielfachen des Linieneinsatzes
    pay3: { [C]: 4, [L]: 5, [B]: 6, [R]: 10, [S]: 20, [D]: 40, [K]: 500 },
    pay2: { [C]: 2, [L]: 2, [B]: 2, [R]: 3, [S]: 3, [D]: 4 },
  },
  // High-Limit: seltener, dafür grössere Gewinne und häufigere Wilds
  high: {
    strip: buildStrip([8, 6, 4, 2, 2, 1, 2]),
    pay3: { [C]: 2, [L]: 2, [B]: 3, [R]: 6, [S]: 12, [D]: 25, [K]: 300 },
    pay2: { [C]: 2, [L]: 2, [B]: 2, [R]: 2, [S]: 3, [D]: 3 },
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
  const rest = syms.filter(x => x !== K);
  if (!rest.length) return v.pay3[K];
  const t = rest[0];
  if (syms.every(x => x === t || x === K)) return v.pay3[t];
  const first = syms[0] === K ? syms[1] : syms[0];
  if ((syms[0] === syms[1] || syms[0] === K || syms[1] === K) && first !== K && v.pay2[first]) return v.pay2[first];
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
    const syms = LINES[li].map((row, reel) => grid[reel][row]);
    const m = lineWin(v, syms);
    if (m > 0) {
      payout += m * lineBet;
      wins.push({ line: li, mult: m });
      if (syms.every(x => x === K)) jackpot = true;
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
    let r = spin(variant, bet, lines);
    let lucky = false;
    // Ayri-Glück: ein verlorener Spin wird manchmal (häufiger nach Pechsträhnen) neu gedreht
    if (r.payout < bet && ctx.lucky?.()) {
      const r2 = spin(variant, bet, lines);
      if (r2.payout > r.payout) { r = r2; lucky = r2.payout > bet; }
    }
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
        lucky,
        detail: r.jackpot ? 'JACKPOT!' : r.payout > 0 ? `Gewinn ${ctx.money(r.payout)}` : 'Kein Gewinn',
        replay: { bet, lines },
      });
    });
  },
});
