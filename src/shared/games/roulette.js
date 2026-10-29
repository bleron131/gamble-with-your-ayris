// Europäisches Roulette (37 Fächer) mit "La Partage": bei 0 gibt es auf einfache Chancen die Hälfte zurück.
import { randInt } from '../rng.js';

export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const OUTSIDE = {
  red: { label: 'ROT', pay: 1, test: n => RED.has(n), even: true },
  black: { label: 'SCHWARZ', pay: 1, test: n => n > 0 && !RED.has(n), even: true },
  even: { label: 'GERADE', pay: 1, test: n => n > 0 && n % 2 === 0, even: true },
  odd: { label: 'UNGERADE', pay: 1, test: n => n % 2 === 1, even: true },
  low: { label: '1-18', pay: 1, test: n => n >= 1 && n <= 18, even: true },
  high: { label: '19-36', pay: 1, test: n => n >= 19, even: true },
  d1: { label: '1. DUTZEND', pay: 2, test: n => n >= 1 && n <= 12 },
  d2: { label: '2. DUTZEND', pay: 2, test: n => n >= 13 && n <= 24 },
  d3: { label: '3. DUTZEND', pay: 2, test: n => n >= 25 && n <= 36 },
  c1: { label: '1. KOLONNE', pay: 2, test: n => n > 0 && n % 3 === 1 },
  c2: { label: '2. KOLONNE', pay: 2, test: n => n > 0 && n % 3 === 2 },
  c3: { label: '3. KOLONNE', pay: 2, test: n => n > 0 && n % 3 === 0 },
};

export function spotLabel(spot) {
  if (spot.startsWith('n')) return 'ZAHL ' + spot.slice(1);
  return OUTSIDE[spot]?.label || spot;
}

export function isValidSpot(spot) {
  if (OUTSIDE[spot]) return true;
  if (/^n\d{1,2}$/.test(spot)) { const n = +spot.slice(1); return n >= 0 && n <= 36; }
  return false;
}

export function payoutFor(spot, amount, n) {
  if (spot.startsWith('n')) return +spot.slice(1) === n ? amount * 36 : 0;
  const o = OUTSIDE[spot];
  if (o.test(n)) return amount * (o.pay + 1);
  if (n === 0 && o.even) return Math.floor(amount / 2); // La Partage
  return 0;
}

export const rouletteGame = {
  type: 'roulette',
  init() {
    return { phase: 'idle', bets: [], result: null, spinId: 0, history: [] };
  },
  start(ctx, table, payload) {
    const raw = Array.isArray(payload.bets) ? payload.bets : [];
    const merged = {};
    for (const b of raw) {
      if (!isValidSpot(b.spot)) return ctx.fail('Ungültiges Feld');
      const a = Math.floor(b.amount);
      if (!(a > 0)) return ctx.fail('Ungültiger Einsatz');
      merged[b.spot] = (merged[b.spot] || 0) + a;
    }
    const bets = Object.entries(merged).map(([spot, amount]) => ({ spot, amount }));
    if (!bets.length) return ctx.fail('Setze zuerst Chips auf den Tisch');
    const total = bets.reduce((a, b) => a + b.amount, 0);
    const lim = ctx.limits;
    if (total < lim.min) return ctx.fail(`Mindesteinsatz: ${ctx.money(lim.min)}`);
    if (total > lim.max) return ctx.fail(`Tischlimit: ${ctx.money(lim.max)} pro Spin`);
    for (const b of bets) if (b.spot.startsWith('n') && b.amount > lim.straightMax)
      return ctx.fail(`Maximum auf Einzelzahl: ${ctx.money(lim.straightMax)}`);
    const label = bets.slice(0, 3).map(b => `${ctx.money(b.amount)} AUF ${spotLabel(b.spot)}`).join(', ') + (bets.length > 3 ? ' …' : '');
    if (!ctx.debit(total, { label })) return;
    const n = randInt(37);
    let payout = 0, straight = false;
    for (const b of bets) {
      const p = payoutFor(b.spot, b.amount, n);
      payout += p;
      if (p > 0 && b.spot.startsWith('n')) straight = true;
    }
    const s = table.state;
    s.phase = 'spinning';
    s.bets = bets;
    s.result = n;
    s.spinId++;
    ctx.busy(true);
    ctx.later(8200, () => {
      s.phase = 'idle';
      s.history = [n, ...s.history].slice(0, 14);
      ctx.settle({
        stake: total, payout, straight, roulette: n,
        detail: `Kugel: ${n} ${n === 0 ? 'GRÜN' : RED.has(n) ? 'ROT' : 'SCHWARZ'}`,
        replay: { bets },
      });
    });
  },
};
