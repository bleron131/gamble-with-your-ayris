// Slots: 3 Walzen × 3 Reihen, 5 Gewinnlinien, direkt am Automaten bedient.
// Party-Balancing: Gewinne zahlen in Vielfachen des GESAMTEINSATZES (beste Linie voll, jede weitere
// Gewinnlinie zur Hälfte). Die Krone ist WILD, leere Felder zahlen nichts. Dazu der AYRI-Multiplikator.
import { randInt, rand } from '../rng.js';
import { slotTopMultiplier, jackpotBoost } from '../config.js';

export const SYMBOLS = ['cherry', 'lemon', 'bell', 'bar', 'seven', 'diamond', 'crown', 'blank'];
const C = 0, L = 1, B = 2, R = 3, S = 4, D = 5, K = 6, BL = 7;
export const EXTRA_LINE_SHARE = 0.5;

// Walzenstreifen gleichmässig aus Symbol-Häufigkeiten aufbauen
function buildStrip(counts) {
  const pos = [];
  counts.forEach((c, s) => { for (let i = 0; i < c; i++) pos.push([(i + 0.5) / c + s * 0.013, s]); });
  return pos.sort((a, b) => a[0] - b[0]).map(p => p[1]);
}

export const VARIANTS = {
  // Rund jeder vierte Spin gewinnt (mit Ayri-Glück eher jeder dritte), ein Treffer bringt meist 2.5–5× den Einsatz zurück
  normal: {
    strip: buildStrip([7, 6, 2, 2, 1, 1, 1, 6]),
    // Auszahlung in Vielfachen des Gesamteinsatzes (Jackpot wächst mit dem Stockwerk)
    pay3: { [C]: 2, [L]: 2.5, [B]: 3, [R]: 4, [S]: 6, [D]: 12, [K]: 250 },
  },
  // High-Limit: etwas seltener, dafür grössere Treffer
  high: {
    strip: buildStrip([7, 5, 3, 2, 2, 1, 1, 6]),
    pay3: { [C]: 2, [L]: 3, [B]: 4, [R]: 5, [S]: 8, [D]: 15, [K]: 240 },
  },
};

// AYRI-Multiplikator auf Gewinne: ×2, ×3, ×5 und ein seltener Top-Multiplikator, der mit dem Stockwerk wächst.
// Der Top-Multiplikator wird mit steigendem Wert seltener, damit der Erwartungswert gleich bleibt.
export function rollMultiplier(floor = 1) {
  const top = slotTopMultiplier(floor);
  const r = rand();
  if (r < 0.1 / top) return top;
  if (r < 0.1 / top + 0.02) return 5;
  if (r < 0.1 / top + 0.07) return 3;
  if (r < 0.1 / top + 0.19) return 2;
  return 1;
}

// Linien: Reihenindex pro Walze
export const LINES = [
  [1, 1, 1], // Mitte
  [0, 0, 0], // oben
  [2, 2, 2], // unten
  [0, 1, 2], // Diagonale
  [2, 1, 0], // Diagonale
];

// Gewinnfaktor einer Linie (× Gesamteinsatz) – drei gleiche, Krone ersetzt alles ausser Leerfeldern
export function lineWin(v, syms) {
  if (syms.includes(BL)) return 0;
  const rest = syms.filter(x => x !== K);
  if (!rest.length) return v.pay3[K];
  const t = rest[0];
  return syms.every(x => x === t || x === K) ? v.pay3[t] : 0;
}

// Gewinnstufe aus Nettogewinn / Einsatz (für Anzeige, Sound und Effekte auf allen Clients)
export function winTier(net, stake, jackpot = false) {
  if (jackpot) return 'jackpot';
  if (!(net > 0) || !(stake > 0)) return net < 0 ? 'loss' : 'push';
  const x = net / stake;
  if (x >= 20) return 'mega';
  if (x >= 7) return 'big';
  if (x >= 2.5) return 'medium';
  return 'small';
}

export function spin(variantName, totalBet, lineCount = 5, floor = 1) {
  const v = VARIANTS[variantName];
  const n = v.strip.length;
  const stops = [randInt(n), randInt(n), randInt(n)];
  const grid = stops.map(s => [v.strip[(s - 1 + n) % n], v.strip[s], v.strip[(s + 1) % n]]); // grid[reel][row]
  const wins = [];
  let jackpot = false;
  for (let li = 0; li < lineCount; li++) {
    const syms = LINES[li].map((row, reel) => grid[reel][row]);
    let m = lineWin(v, syms);
    if (m > 0) {
      if (syms.every(x => x === K)) { jackpot = true; m = Math.round(m * jackpotBoost(floor)); }
      wins.push({ line: li, mult: m });
    }
  }
  // Beste Linie zählt voll, jede weitere zur Hälfte
  const sorted = wins.map(w => w.mult).sort((a, b) => b - a);
  const factor = sorted.reduce((s, m, i) => s + (i ? m * EXTRA_LINE_SHARE : m), 0);
  const multiplier = factor > 0 && !jackpot ? rollMultiplier(floor) : 1;
  return { stops, grid, payout: Math.floor(factor * totalBet * multiplier), wins, jackpot, multiplier };
}

// Server-Logik
export const slotsGame = (variant) => ({
  type: variant === 'high' ? 'highslots' : 'slots',
  walkUp: true,
  init() {
    return { phase: 'idle', stops: [0, 0, 0], wins: [], lines: 5, bet: 0, spinId: 0, win: 0, multiplier: 1, spinner: null, spinnerName: null, tier: null };
  },
  start(ctx, table, payload) {
    const lines = 5;
    const bet = Math.floor(payload.bet);
    const lim = ctx.limits;
    if (!(bet >= lim.min && bet <= lim.max)) return ctx.fail(`Einsatz muss zwischen ${ctx.money(lim.min)} und ${ctx.money(lim.max)} liegen`);
    // Einsatz wird beim Start sofort aus dem Team-Pot reserviert (abgebucht)
    if (!ctx.debit(bet, { label: `SPIN ${ctx.money(bet)}` })) return;
    const floor = ctx.floor || 1;
    let r = spin(variant, bet, lines, floor);
    let lucky = false;
    // Ayri-Glück: ein verlorener Spin wird manchmal (häufiger nach Pechsträhnen) neu gedreht
    if (r.payout < bet && ctx.lucky?.()) {
      const r2 = spin(variant, bet, lines, floor);
      if (r2.payout > r.payout) { r = r2; lucky = r2.payout > bet; }
    }
    const s = table.state;
    s.phase = 'spinning';
    s.stops = r.stops;
    s.wins = r.wins;
    s.multiplier = r.multiplier;
    s.win = r.payout;
    s.jackpot = r.jackpot;
    s.tier = winTier(r.payout - bet, bet, r.jackpot);
    s.lines = lines;
    s.bet = bet;
    s.spinner = ctx.pid || null;
    s.spinnerName = ctx.playerName || null;
    s.spinId++;
    ctx.busy(true);
    ctx.later(2600, () => {
      s.phase = 'idle';
      ctx.settle({
        stake: bet,
        payout: r.payout,
        jackpot: r.jackpot,
        lucky,
        multiplier: r.multiplier,
        detail: r.jackpot ? 'JACKPOT!' : r.payout > 0 ? `Gewinn ${ctx.money(r.payout)}${r.multiplier > 1 ? ` (AYRI ×${r.multiplier})` : ''}` : 'Kein Gewinn',
        replay: { bet, lines },
      });
    });
  },
});
