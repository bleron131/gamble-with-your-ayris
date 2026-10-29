// Simuliert alle Casinospiele mit den echten Spielmodulen und misst Gewinnquote & Auszahlungsquote (RTP).
// Nutzung: node scripts/balance.js [Runden]
import { GAMES } from '../src/shared/room.js';
import { floorDef, luckChance } from '../src/shared/config.js';
import { handTotal, cardValue } from '../src/shared/games/blackjack.js';

const N = +process.argv[2] || 20000;
const FLOOR = 15;

// Spieler mit Pechsträhnen-Zähler wie im Raum
export function simulate(type, rounds = N, withLuck = true) {
  const game = GAMES[type];
  const limits = floorDef(FLOOR).limits[type] || floorDef(FLOOR).limits.roulette;
  const table = { id: type, type, state: game.init(), busy: false };
  game.setup?.(table);
  let staked = 0, paid = 0, wins = 0, losses = 0, played = 0, streak = 0, maxLossRun = 0, lossRun = 0;
  const queue = [];
  const ctx = {
    limits, money: v => '$' + v,
    fail: m => { throw new Error(type + ': ' + m); },
    debit: () => true, refund() {}, busy() {}, changed() {},
    later: (ms, fn) => queue.push(fn),
    canUseItem: () => false, useItem: () => false,
    lucky: () => withLuck && Math.random() < luckChance(streak),
    settle: r => {
      if (!r.stake && !r.payout) return;
      staked += r.stake; paid += r.payout; played++;
      if (r.payout > r.stake) { wins++; streak = 0; lossRun = 0; }
      else if (r.payout < r.stake) { losses++; streak++; lossRun++; maxLossRun = Math.max(maxLossRun, lossRun); }
    },
  };
  const flush = () => { while (queue.length) queue.shift()(); };
  const bet = limits.min * 10;
  for (let i = 0; i < rounds; i++) {
    switch (type) {
      case 'slots': case 'highslots': game.start(ctx, table, { bet: bet - (bet % 5), lines: 5 }); break;
      case 'roulette': game.start(ctx, table, { bets: [{ spot: ['red', 'black', 'odd', 'd2', 'n17'][i % 5], amount: i % 5 === 4 ? limits.min : bet }] }); break;
      case 'wheel': game.start(ctx, table, { bets: { [['x1', 'x3', 'x1', 'x6', 'x1'][i % 5]]: bet } }); break;
      case 'baccarat': game.start(ctx, table, { bets: { [i % 2 ? 'banker' : 'player']: bet } }); break;
      case 'craps': {
        const s = table.state;
        game.start(ctx, table, { bets: s.point === null && !s.bets.pass ? { pass: bet } : i % 3 === 0 ? { field: bet } : {} });
        break;
      }
      case 'blackjack': {
        game.start(ctx, table, { bet });
        flush();
        for (let k = 0; k < 8 && table.state.phase === 'player'; k++) {
          const h = table.state.hands[table.state.active];
          const t = handTotal(h.cards).total;
          const up = cardValue(table.state.dealer[0]);
          const act = h.cards.length === 2 && (t === 10 || t === 11) && up < 10 ? 'double' : t < 12 || (t < 17 && up >= 7) ? 'hit' : 'stand';
          game.action(ctx, table, act);
          flush();
        }
        break;
      }
      case 'poker': {
        game.start(ctx, table, { bet });
        game.action(ctx, table, 'call');
        break;
      }
    }
    flush();
  }
  return { type, rtp: paid / staked, winRate: wins / played, lossRate: losses / played, maxLossRun };
}


if (import.meta.url === `file://${process.argv[1]}`) {
  for (const t of Object.keys(GAMES)) {
    const r = simulate(t);
    console.log(`${t.padEnd(10)} RTP ${(r.rtp * 100).toFixed(1).padStart(6)}%   Gewinnquote ${(r.winRate * 100).toFixed(1).padStart(5)}%   Verlustquote ${(r.lossRate * 100).toFixed(1).padStart(5)}%   längste Pechsträhne ${r.maxLossRun}`);
  }
}
