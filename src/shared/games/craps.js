// Craps: Pass/Don't Pass mit Point, Odds (echte Quoten), Field und One-Roll-Wetten.
import { randInt } from '../rng.js';

export const CRAPS_BETS = {
  pass: { label: 'PASS LINE', line: true },
  dontpass: { label: "DON'T PASS", line: true },
  odds: { label: 'ODDS', line: true },
  field: { label: 'FIELD' },
  any7: { label: 'ANY 7', prop: true },
  anycraps: { label: 'ANY CRAPS', prop: true },
  yo: { label: 'YO 11', prop: true },
};

const ODDS_PAY = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };

export function resolveRoll(state, a, b) {
  const sum = a + b;
  const bets = state.bets;
  let stake = 0, payout = 0;
  const notes = [];
  const take = (k, mult) => { // mult = Gesamtrückzahlung als Vielfaches (0 = verloren)
    const v = bets[k] || 0;
    if (!v) return;
    stake += v;
    const p = Math.floor(v * mult);
    payout += p;
    if (mult > 1) notes.push(`${CRAPS_BETS[k].label} gewinnt`);
    delete bets[k];
  };
  // One-Roll
  if (bets.field) take('field', sum === 2 ? 3 : sum === 12 ? 4 : [3, 4, 9, 10, 11].includes(sum) ? 2 : 0);
  if (bets.any7) take('any7', sum === 7 ? 5 : 0);
  if (bets.anycraps) take('anycraps', [2, 3, 12].includes(sum) ? 8 : 0);
  if (bets.yo) take('yo', sum === 11 ? 16 : 0);
  let pointHit = false;
  if (state.point === null) {
    if (sum === 7 || sum === 11) { take('pass', 2); take('dontpass', 0); }
    else if (sum === 2 || sum === 3) { take('pass', 0); take('dontpass', 2); }
    else if (sum === 12) { take('pass', 0); take('dontpass', 1); }
    else { state.point = sum; notes.push(`POINT ${sum}`); }
  } else if (sum === state.point) {
    const [n, d] = ODDS_PAY[state.point];
    take('pass', 2); take('odds', 1 + n / d); take('dontpass', 0);
    notes.push('POINT GETROFFEN!');
    state.point = null;
    pointHit = true;
  } else if (sum === 7) {
    take('pass', 0); take('odds', 0); take('dontpass', 2);
    notes.push('SEVEN OUT');
    state.point = null;
  }
  return { stake, payout, notes, pointHit };
}

export const crapsGame = {
  type: 'craps',
  init() {
    return { phase: 'idle', point: null, bets: {}, dice: [3, 4], rollId: 0, history: [] };
  },
  outstanding(table) {
    return Object.values(table.state.bets).reduce((a, b) => a + b, 0);
  },
  canLeave(table) {
    if (table.state.phase !== 'idle') return 'Würfel rollen noch';
    const b = table.state.bets;
    if (table.state.point !== null && (b.pass || b.dontpass || b.odds)) return 'Line-Wetten laufen noch – würfle bis zur Entscheidung';
    return null;
  },
  start(ctx, table, payload) {
    const s = table.state;
    if (s.phase !== 'idle') return ctx.fail('Würfel rollen noch');
    const lim = ctx.limits;
    const add = {};
    let total = 0;
    for (const k of Object.keys(CRAPS_BETS)) {
      const a = Math.floor(payload.bets?.[k] || 0);
      if (a < 0) return ctx.fail('Ungültiger Einsatz');
      if (a > 0) { add[k] = a; total += a; }
    }
    if ((add.pass || add.dontpass) && s.point !== null) return ctx.fail('Line-Wetten nur beim Come-out-Wurf');
    if (add.odds && (s.point === null || !(s.bets.pass))) return ctx.fail('Odds nur mit Pass Line und aktivem Point');
    const after = { ...s.bets };
    for (const [k, a] of Object.entries(add)) after[k] = (after[k] || 0) + a;
    if ((after.pass || 0) + (after.dontpass || 0) > lim.max) return ctx.fail(`Line-Limit: ${ctx.money(lim.max)}`);
    if ((after.odds || 0) > (after.pass || 0) * 3) return ctx.fail('Odds max. 3× Pass Line');
    if ((after.field || 0) > lim.max) return ctx.fail(`Field-Limit: ${ctx.money(lim.max)}`);
    for (const k of ['any7', 'anycraps', 'yo']) if ((after[k] || 0) > lim.propMax) return ctx.fail(`Limit ${CRAPS_BETS[k].label}: ${ctx.money(lim.propMax)}`);
    for (const [k, a] of Object.entries(add)) if (a < lim.min && k !== 'odds') return ctx.fail(`Mindesteinsatz: ${ctx.money(lim.min)}`);
    const outstanding = Object.values(after).reduce((x, y) => x + y, 0);
    if (outstanding <= 0) return ctx.fail('Platziere zuerst eine Wette');
    if (total > 0) {
      const label = Object.entries(add).map(([k, a]) => `${ctx.money(a)} AUF ${CRAPS_BETS[k].label}`).join(', ');
      if (!ctx.debit(total, { label })) return;
    }
    s.bets = after;
    const a = randInt(6) + 1, b = randInt(6) + 1;
    s.phase = 'rolling';
    s.dice = [a, b];
    s.rollId++;
    ctx.busy(true);
    ctx.later(3300, () => {
      const res = resolveRoll(s, a, b);
      s.phase = 'idle';
      s.history = [a + b, ...s.history].slice(0, 14);
      const keep = this.outstanding(table) > 0;
      ctx.settle({
        stake: res.stake, payout: res.payout, craps: a + b, pointHit: res.pointHit,
        detail: `Würfel: ${a} + ${b} = ${a + b}${res.notes.length ? ' – ' + res.notes.join(', ') : ''}`,
        replay: { bets: add },
        keepBusy: keep,
        newStake: total,
      });
    });
  },
  // Verbindungsabbruch: offene Wetten zurückerstatten
  forceFinish(ctx, table) {
    if (table.state.phase !== 'idle') return; // Wurf wird regulär abgerechnet
    const out = this.outstanding(table);
    table.state.bets = {};
    table.state.point = null;
    if (out > 0) ctx.refund(out);
    ctx.busy(false);
  },
};
