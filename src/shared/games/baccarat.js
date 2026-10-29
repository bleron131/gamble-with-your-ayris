// Punto Banco Baccarat mit klassischen Drittkarten-Regeln. Party-Regeln: Banker 1:1 (ohne Kommission), Player 1.05:1, Tie 9:1.
import { Shoe } from '../rng.js';

export const bacValue = c => (c.r >= 10 ? 0 : c.r);
export const bacTotal = cards => cards.reduce((a, c) => a + bacValue(c), 0) % 10;

export function playCoup(draw) {
  const p = [draw(), draw()];
  const b = [draw(), draw()];
  let pt = bacTotal(p), bt = bacTotal(b);
  if (pt < 8 && bt < 8) {
    let p3 = null;
    if (pt <= 5) { p3 = draw(); p.push(p3); }
    if (p3 === null) {
      if (bt <= 5) b.push(draw());
    } else {
      const v = bacValue(p3);
      const drawB = bt <= 2 || (bt === 3 && v !== 8) || (bt === 4 && v >= 2 && v <= 7) ||
        (bt === 5 && v >= 4 && v <= 7) || (bt === 6 && (v === 6 || v === 7));
      if (drawB) b.push(draw());
    }
  }
  pt = bacTotal(p); bt = bacTotal(b);
  return { player: p, banker: b, pt, bt, winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie' };
}

export const baccaratGame = {
  type: 'baccarat',
  init() {
    return { phase: 'idle', bets: {}, player: [], banker: [], winner: null, dealId: 0, history: [] };
  },
  setup(table) {
    table.shoe = new Shoe(8);
  },
  start(ctx, table, payload) {
    const lim = ctx.limits;
    const bets = {};
    let total = 0;
    for (const k of ['player', 'banker', 'tie']) {
      const a = Math.floor(payload.bets?.[k] || 0);
      if (a < 0) return ctx.fail('Ungültiger Einsatz');
      if (a > 0) { bets[k] = a; total += a; }
    }
    if (!total) return ctx.fail('Setze auf Player, Banker oder Tie');
    if (total < lim.min) return ctx.fail(`Mindesteinsatz: ${ctx.money(lim.min)}`);
    if ((bets.player || 0) + (bets.banker || 0) > lim.max) return ctx.fail(`Tischlimit: ${ctx.money(lim.max)}`);
    if ((bets.tie || 0) > lim.tieMax) return ctx.fail(`Tie-Limit: ${ctx.money(lim.tieMax)}`);
    const label = Object.entries(bets).map(([k, a]) => `${ctx.money(a)} AUF ${k.toUpperCase()}`).join(', ');
    if (!ctx.debit(total, { label })) return;
    if (table.shoe.needsShuffle()) table.shoe.reshuffle();
    const coupPay = c => c.winner === 'tie'
      ? (bets.tie || 0) * 10 + (bets.player || 0) + (bets.banker || 0)
      : c.winner === 'player' ? Math.floor((bets.player || 0) * 2.05) : (bets.banker || 0) * 2;
    let coup = playCoup(() => table.shoe.draw());
    let lucky = false;
    if (coupPay(coup) < total && ctx.lucky?.()) {
      const c2 = playCoup(() => table.shoe.draw());
      if (coupPay(c2) > coupPay(coup)) { coup = c2; lucky = coupPay(c2) > total; }
    }
    const s = table.state;
    s.phase = 'dealing';
    s.bets = bets;
    s.player = coup.player;
    s.banker = coup.banker;
    s.winner = null;
    s.dealId++;
    ctx.busy(true);
    const payout = coupPay(coup);
    const cards = coup.player.length + coup.banker.length;
    ctx.later(1800 + cards * 650, () => {
      s.phase = 'idle';
      s.winner = coup.winner;
      s.history = [coup.winner, ...s.history].slice(0, 16);
      ctx.settle({
        stake: total, payout, baccarat: coup.winner, lucky, tieWin: coup.winner === 'tie' && bets.tie > 0,
        detail: `Player ${coup.pt} – Banker ${coup.bt}: ${coup.winner.toUpperCase()}`,
        replay: { bets },
      });
    });
  },
};
