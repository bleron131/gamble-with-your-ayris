// Grosses Glücksrad (Big-Six-Stil) mit Multiplikator-Feldern.
import { randInt } from '../rng.js';

export const WHEEL_PAYS = { x1: 1, x3: 3, x6: 6, x12: 12, x25: 25, x50: 50 };
const COUNTS = { x1: 26, x3: 13, x6: 8, x12: 4, x25: 2, x50: 1 };

// Felder gleichmässig verteilt anordnen
function buildSegments() {
  const total = Object.values(COUNTS).reduce((a, b) => a + b, 0);
  const slots = new Array(total).fill(null);
  const order = ['x50', 'x25', 'x12', 'x6', 'x3', 'x1'];
  for (const k of order) {
    const c = COUNTS[k];
    for (let i = 0; i < c; i++) {
      let idx = Math.floor((i + 0.5) * total / c) % total;
      while (slots[idx] !== null) idx = (idx + 1) % total;
      slots[idx] = k;
    }
  }
  return slots;
}
export const WHEEL_SEGMENTS = buildSegments();

export const wheelGame = {
  type: 'wheel',
  init() {
    return { phase: 'idle', bets: {}, result: 0, spinId: 0, history: [] };
  },
  start(ctx, table, payload) {
    const bets = {};
    let total = 0;
    for (const k of Object.keys(WHEEL_PAYS)) {
      const a = Math.floor(payload.bets?.[k] || 0);
      if (a < 0) return ctx.fail('Ungültiger Einsatz');
      if (a > 0) {
        if (a < ctx.limits.min) return ctx.fail(`Mindesteinsatz pro Feld: ${ctx.money(ctx.limits.min)}`);
        if (a > ctx.limits.max) return ctx.fail(`Maximum pro Feld: ${ctx.money(ctx.limits.max)}`);
        bets[k] = a;
        total += a;
      }
    }
    if (total <= 0) return ctx.fail('Keine Wette platziert');
    const label = Object.entries(bets).map(([k, a]) => `${ctx.money(a)} AUF ${k.toUpperCase()}`).join(', ');
    if (!ctx.debit(total, { label })) return;
    const pay = i => { const k = WHEEL_SEGMENTS[i]; return bets[k] ? bets[k] * (WHEEL_PAYS[k] + 1) : 0; };
    let result = randInt(WHEEL_SEGMENTS.length);
    let lucky = false;
    if (pay(result) < total && ctx.lucky?.()) {
      const r2 = randInt(WHEEL_SEGMENTS.length);
      if (pay(r2) > pay(result)) { result = r2; lucky = pay(r2) > total; }
    }
    const seg = WHEEL_SEGMENTS[result];
    const payout = pay(result);
    const s = table.state;
    s.phase = 'spinning';
    s.bets = bets;
    s.result = result;
    s.spinId++;
    ctx.busy(true);
    ctx.later(6500, () => {
      s.phase = 'idle';
      s.history = [seg, ...s.history].slice(0, 12);
      ctx.settle({
        stake: total, payout, wheel: seg, lucky,
        detail: `Rad: ${seg.toUpperCase()}`,
        replay: { bets },
      });
    });
  },
};
