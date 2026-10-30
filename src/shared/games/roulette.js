// Europäisches Roulette (37 Fächer), Party-Regeln: Einzelzahl zahlt 36:1 und bei 0 gibt es auf alle Aussenwetten den Einsatz zurück.
// Wetten werden am Tisch vorbereitet (Chips bleiben nach dem Spin liegen) und erst beim SPIN aus dem Team-Pot abgebucht.
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

// Innenwetten: "i:" + aufsteigende Zahlen, z. B. i:17-20 (Split), i:1-2-3 (Street), i:1-2-4-5 (Corner), i:1-2-3-4-5-6 (Six Line)
export const INSIDE_NAMES = { 2: 'SPLIT', 3: 'STREET', 4: 'CORNER', 6: 'SIX LINE' };
export function insideNumbers(spot) {
  if (!/^i:\d{1,2}(-\d{1,2}){1,5}$/.test(spot)) return null;
  const nums = spot.slice(2).split('-').map(Number);
  for (let i = 1; i < nums.length; i++) if (!(nums[i] > nums[i - 1])) return null;
  const [a] = nums;
  if (nums.some(n => n < 1 || n > 36)) return null;
  const is = arr => arr.length === nums.length && arr.every((v, i) => v === nums[i]);
  switch (nums.length) {
    case 2: return (nums[1] - a === 3 || (nums[1] - a === 1 && a % 3 !== 0)) ? nums : null;
    case 3: return a % 3 === 1 && is([a, a + 1, a + 2]) ? nums : null;
    case 4: return a % 3 !== 0 && a <= 32 && is([a, a + 1, a + 3, a + 4]) ? nums : null;
    case 6: return a % 3 === 1 && a <= 31 && is([a, a + 1, a + 2, a + 3, a + 4, a + 5]) ? nums : null;
    default: return null;
  }
}
export const insideSpot = nums => 'i:' + [...nums].sort((x, y) => x - y).join('-');

export function spotLabel(spot) {
  if (spot.startsWith('n')) return 'ZAHL ' + spot.slice(1);
  const nums = insideNumbers(spot);
  if (nums) return `${INSIDE_NAMES[nums.length]} ${nums.length === 3 || nums.length === 6 ? nums[0] + '–' + nums.at(-1) : nums.join('/')}`;
  return OUTSIDE[spot]?.label || spot;
}

export function isValidSpot(spot) {
  if (typeof spot !== 'string') return false;
  if (OUTSIDE[spot]) return true;
  if (/^n\d{1,2}$/.test(spot)) { const n = +spot.slice(1); return n >= 0 && n <= 36; }
  return !!insideNumbers(spot);
}

// Höchstbetrag pro Feld: Einzelzahl straightMax, Innenwetten anteilig mehr, Aussenwetten bis zum Tischlimit
export function spotMax(spot, lim) {
  if (spot.startsWith('n')) return lim.straightMax;
  const nums = insideNumbers(spot);
  if (nums) return Math.min(lim.max, lim.straightMax * nums.length);
  return lim.max;
}

export function payoutFor(spot, amount, n) {
  if (spot.startsWith('n')) return +spot.slice(1) === n ? amount * 37 : 0;
  const nums = insideNumbers(spot);
  if (nums) return nums.includes(n) ? amount * (36 / nums.length) : 0; // Split 17:1, Street 11:1, Corner 8:1, Six Line 5:1
  const o = OUTSIDE[spot];
  if (o.test(n)) return amount * (o.pay + 1);
  if (n === 0) return amount; // Zero: Aussenwetten zurück
  return 0;
}

export const rouletteGame = {
  type: 'roulette',
  init() {
    return { phase: 'idle', bets: [], result: null, spinId: 0, history: [], prepared: {}, undo: [], editId: 0 };
  },
  // Vorbereitete Wette bearbeiten (nur zwischen zwei Spins): Chip setzen, Feld verringern, letzten Chip zurück, alles löschen, verdoppeln
  edit(ctx, table, { op, spot, amount } = {}) {
    const s = table.state;
    if (table.busy) return ctx.fail('Rien ne va plus – die Kugel rollt noch');
    const lim = ctx.limits;
    const total = () => Object.values(s.prepared).reduce((a, b) => a + b, 0);
    amount = Math.floor(amount);
    switch (op) {
      case 'add': {
        if (!isValidSpot(spot)) return ctx.fail('Ungültiges Feld');
        if (!(amount > 0)) return ctx.fail('Ungültiger Chip');
        const cur = s.prepared[spot] || 0;
        const add = Math.min(amount, spotMax(spot, lim) - cur, lim.max - total());
        if (add <= 0) return ctx.fail(cur >= spotMax(spot, lim) ? `Maximum auf ${spotLabel(spot)}: ${ctx.money(spotMax(spot, lim))}` : `Tischlimit: ${ctx.money(lim.max)} pro Spin`);
        s.prepared[spot] = cur + add;
        s.undo.push({ spot, amount: add });
        break;
      }
      case 'remove': {
        if (!s.prepared[spot]) return;
        const sub = amount > 0 ? Math.min(amount, s.prepared[spot]) : s.prepared[spot];
        s.prepared[spot] -= sub;
        if (!s.prepared[spot]) delete s.prepared[spot];
        s.undo.push({ spot, amount: -sub });
        break;
      }
      case 'undo': {
        const last = s.undo.pop();
        if (!last) return;
        if (last.clear) { s.prepared = last.clear; break; }
        const v = (s.prepared[last.spot] || 0) - last.amount;
        if (v > 0) s.prepared[last.spot] = v; else delete s.prepared[last.spot];
        break;
      }
      case 'clear':
        if (!Object.keys(s.prepared).length) return;
        s.undo.push({ clear: { ...s.prepared } });
        s.prepared = {};
        break;
      case 'double': {
        const t = total();
        if (!t) return;
        if (t * 2 > lim.max) return ctx.fail(`Tischlimit: ${ctx.money(lim.max)} pro Spin`);
        if (Object.entries(s.prepared).some(([k, v]) => v * 2 > spotMax(k, lim))) return ctx.fail('Ein Feld würde sein Maximum überschreiten');
        s.undo.push({ clear: { ...s.prepared } });
        for (const k in s.prepared) s.prepared[k] *= 2;
        break;
      }
      default: return;
    }
    if (s.undo.length > 60) s.undo.splice(0, s.undo.length - 60);
    s.editId++;
    ctx.changed();
  },
  // Spieler steht auf: vorbereitete Chips gehen zurück (nichts wurde abgebucht)
  forceFinish(ctx, table) {
    if (table.busy) return;
    table.state.prepared = {};
    table.state.undo = [];
    table.state.editId++;
  },
  start(ctx, table, payload) {
    // Ohne explizite Wetten wird die vorbereitete Wette gespielt (Rebet: Chips bleiben nach jedem Spin liegen)
    const raw = Array.isArray(payload.bets) ? payload.bets : Object.entries(table.state.prepared || {}).map(([spot, amount]) => ({ spot, amount }));
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
    for (const b of bets) if (b.amount > spotMax(b.spot, lim))
      return ctx.fail(`Maximum auf ${spotLabel(b.spot)}: ${ctx.money(spotMax(b.spot, lim))}`);
    const label = bets.slice(0, 3).map(b => `${ctx.money(b.amount)} AUF ${spotLabel(b.spot)}`).join(', ') + (bets.length > 3 ? ' …' : '');
    if (!ctx.debit(total, { label })) return;
    const total0 = total;
    const evalSpin = n => bets.reduce((a, b) => a + payoutFor(b.spot, b.amount, n), 0);
    let n = randInt(37);
    let lucky = false;
    // Ayri-Glück: verlorener Spin wird manchmal neu geworfen
    if (evalSpin(n) < total0 && ctx.lucky?.()) {
      const n2 = randInt(37);
      if (evalSpin(n2) > evalSpin(n)) { n = n2; lucky = evalSpin(n2) > total0; }
    }
    let payout = 0, straight = false;
    for (const b of bets) {
      const p = payoutFor(b.spot, b.amount, n);
      payout += p;
      if (p > 0 && b.spot.startsWith('n')) straight = true;
    }
    payout = Math.floor(payout);
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
        stake: total, payout, straight, roulette: n, lucky,
        detail: `Kugel: ${n} ${n === 0 ? 'GRÜN' : RED.has(n) ? 'ROT' : 'SCHWARZ'}`,
        replay: { bets },
      });
    });
  },
};
