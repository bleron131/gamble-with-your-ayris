// Casino Hold'em gegen den NPC-Dealer. Ante → Flop → Call (2× Ante) oder Fold.
// Party-Regel: Dealer qualifiziert sich erst mit einem Paar Sechsen oder besser.
import { Shoe } from '../rng.js';

export const HAND_NAMES = ['High Card', 'Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush', 'Royal Flush'];

// Bewertet 5 Karten → [Kategorie, Tiebreaker...]
function eval5(cards) {
  const ranks = cards.map(c => (c.r === 1 ? 14 : c.r)).sort((a, b) => b - a);
  const flush = cards.every(c => c.s === cards[0].s);
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5;
  }
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts).map(([r, c]) => [c, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byGroup = groups.map(g => g[1]);
  if (straightHigh && flush) return [straightHigh === 14 ? 9 : 8, straightHigh];
  if (groups[0][0] === 4) return [7, ...byGroup];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...byGroup];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...byGroup];
  if (groups[0][0] === 2) return [1, ...byGroup];
  return [0, ...ranks];
}

export function compareScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function bestHand(cards) {
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const five = cards.filter((_, i) => i !== a && i !== b);
    if (n === 7) { const sc = eval5(five); if (!best || compareScore(sc, best) > 0) best = sc; }
  }
  if (n === 5) best = eval5(cards);
  return best;
}

// Ante-Auszahlung (Gewinn-Vielfaches) nach Spielerhand
const ANTE_PAY = { 9: 100, 8: 20, 7: 10, 6: 3, 5: 2 };
export const antePay = cat => ANTE_PAY[cat] || 1;

export const pokerGame = {
  type: 'poker',
  init() {
    return { phase: 'idle', ante: 0, call: 0, player: [], dealer: [], board: [], result: null, dealId: 0, playerHand: '', dealerHand: '' };
  },
  setup(table) {
    table.shoe = new Shoe(1);
    table.secret = {};
  },
  start(ctx, table, payload) {
    const s = table.state;
    if (s.phase === 'decide' || s.phase === 'showdown') return ctx.fail('Runde läuft bereits');
    const ante = Math.floor(payload.bet);
    if (!(ante >= ctx.limits.min && ante <= ctx.limits.max)) return ctx.fail(`Ante: ${ctx.money(ctx.limits.min)} – ${ctx.money(ctx.limits.max)}`);
    if (!ctx.debit(ante, { label: `ANTE ${ctx.money(ante)} AM POKERTISCH` })) return;
    table.shoe.reshuffle();
    const d = () => table.shoe.draw();
    const player = [d(), d()];
    const dealer = [d(), d()];
    const board = [d(), d(), d(), d(), d()];
    table.secret = { dealer, board, ante };
    s.phase = 'decide';
    s.ante = ante;
    s.call = 0;
    s.player = player;
    s.dealer = [null, null];
    s.board = board.slice(0, 3);
    s.result = null;
    s.dealId++;
    s.playerHand = HAND_NAMES[bestHandPartial(player.concat(s.board))[0]];
    s.dealerHand = '';
    ctx.busy(true);
    ctx.changed();
  },
  action(ctx, table, action) {
    const s = table.state;
    if (s.phase !== 'decide') return ctx.fail('Gerade nicht möglich');
    if (action === 'call') {
      if (!ctx.debit(s.ante * 2, { label: `CALL ${ctx.money(s.ante * 2)}` })) return;
      s.call = s.ante * 2;
      showdown(ctx, table, false);
    } else if (action === 'fold') {
      showdown(ctx, table, true);
    } else ctx.fail('Unbekannte Aktion');
  },
  forceFinish(ctx, table) {
    if (table.state.phase === 'decide') showdown(ctx, table, true);
  },
};

function bestHandPartial(cards) {
  if (cards.length === 5) return eval5(cards);
  return bestHand(cards);
}

function showdown(ctx, table, folded) {
  const s = table.state;
  const sec = table.secret;
  s.phase = 'showdown';
  s.board = sec.board.slice();
  ctx.changed();
  ctx.later(1500, () => {
    const ps = bestHand(s.player.concat(s.board));
    let ds = bestHand(sec.dealer.concat(s.board));
    let lucky = false;
    // Ayri-Glück: schlägt der Dealer den Spieler, bekommt er manchmal neue Karten
    if (!folded && compareScore(ps, ds) < 0 && ctx.lucky?.()) {
      const alt = [table.shoe.draw(), table.shoe.draw()];
      const as = bestHand(alt.concat(s.board));
      if (compareScore(ps, as) > 0) { sec.dealer = alt; ds = as; lucky = true; }
    }
    s.dealer = sec.dealer;
    s.playerHand = HAND_NAMES[ps[0]];
    s.dealerHand = HAND_NAMES[ds[0]];
    const stake = s.ante + s.call;
    let payout = 0, res;
    if (folded) res = 'FOLD';
    else {
      const qualifies = ds[0] >= 2 || (ds[0] === 1 && ds[1] >= 6);
      const cmp = compareScore(ps, ds);
      if (!qualifies) { res = 'DEALER QUALIFIZIERT NICHT'; payout = s.ante * (1 + antePay(ps[0])) + s.call; }
      else if (cmp > 0) { res = 'GEWONNEN'; payout = s.ante * (1 + antePay(ps[0])) + s.call * 2; }
      else if (cmp === 0) { res = 'PUSH'; payout = stake; }
      else res = 'VERLOREN';
    }
    s.result = res;
    ctx.later(1200, () => {
      s.phase = 'idle';
      ctx.settle({
        stake, payout, pokerCat: folded ? -1 : ps[0], lucky,
        detail: `${s.playerHand} vs. ${s.dealerHand} – ${res}`,
        replay: { bet: sec.ante },
      });
    });
    ctx.changed();
  });
}
