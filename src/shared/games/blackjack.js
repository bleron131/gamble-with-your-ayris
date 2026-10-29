// Blackjack: 6 Decks, Dealer steht auf Soft 17, Blackjack zahlt 3:2, Double, Split (bis 4 Hände).
import { Shoe } from '../rng.js';

export function cardValue(c) {
  return c.r === 1 ? 11 : Math.min(10, c.r);
}

export function handTotal(cards) {
  let t = 0, aces = 0;
  for (const c of cards) {
    if (!c) continue;
    t += cardValue(c);
    if (c.r === 1) aces++;
  }
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}

export const isBlackjack = cards => cards.length === 2 && handTotal(cards).total === 21;

export const blackjackGame = {
  type: 'blackjack',
  init() {
    return { phase: 'idle', hands: [], active: 0, dealer: [], dealId: 0, message: '', jokerable: false };
  },
  setup(table) {
    table.shoe = new Shoe(6);
    table.secret = { hole: null };
  },
  start(ctx, table, payload) {
    const s = table.state;
    if (s.phase !== 'idle' && s.phase !== 'done') return ctx.fail('Runde läuft bereits');
    const bet = Math.floor(payload.bet);
    if (!(bet >= ctx.limits.min && bet <= ctx.limits.max)) return ctx.fail(`Einsatz: ${ctx.money(ctx.limits.min)} – ${ctx.money(ctx.limits.max)}`);
    if (!ctx.debit(bet, { label: `${ctx.money(bet)} AUF BLACKJACK` })) return;
    if (table.shoe.needsShuffle()) table.shoe.reshuffle();
    const d = () => table.shoe.draw();
    const p1 = d(), d1 = d(), p2 = d(), hole = d();
    table.secret.hole = hole;
    table.secret.firstBet = bet;
    s.hands = [{ cards: [p1, p2], bet, doubled: false, done: false, result: null }];
    s.dealer = [d1, null];
    s.active = 0;
    s.phase = 'player';
    s.message = '';
    s.dealId++;
    s.jokerable = false;
    ctx.busy(true);
    const dealerBJ = isBlackjack([d1, hole]);
    const playerBJ = isBlackjack(s.hands[0].cards);
    // Dealer schaut bei Ass/10 nach Blackjack
    if (dealerBJ && (d1.r === 1 || cardValue(d1) === 10)) {
      s.phase = 'dealer';
      ctx.later(1400, () => { s.dealer[1] = hole; finish(ctx, table); });
    } else if (playerBJ) {
      s.hands[0].done = true;
      s.phase = 'dealer';
      ctx.later(1400, () => { s.dealer[1] = hole; finish(ctx, table); });
    }
    ctx.changed();
  },
  action(ctx, table, action) {
    const s = table.state;
    const hand = s.hands[s.active];
    if (s.phase === 'joker') {
      if (action === 'joker') return useJoker(ctx, table);
      if (action === 'accept') { s.phase = 'player'; s.jokerable = false; hand.done = true; return advance(ctx, table); }
      return ctx.fail('Joker benutzen oder akzeptieren');
    }
    if (s.phase !== 'player' || !hand) return ctx.fail('Gerade nicht möglich');
    const draw = () => table.shoe.draw();
    switch (action) {
      case 'hit': {
        hand.cards.push(draw());
        afterDraw(ctx, table, false);
        break;
      }
      case 'stand':
        hand.done = true;
        s.jokerable = false;
        advance(ctx, table);
        break;
      case 'double': {
        if (hand.cards.length !== 2) return ctx.fail('Double nur mit zwei Karten');
        if (!ctx.debit(hand.bet, { label: `DOUBLE ${ctx.money(hand.bet)}` })) return;
        hand.bet *= 2;
        hand.doubled = true;
        hand.cards.push(draw());
        afterDraw(ctx, table, true);
        break;
      }
      case 'split': {
        if (hand.cards.length !== 2 || cardValue(hand.cards[0]) !== cardValue(hand.cards[1])) return ctx.fail('Split nur mit gleichwertigen Karten');
        if (s.hands.length >= 4) return ctx.fail('Maximal 4 Hände');
        if (!ctx.debit(hand.bet, { label: `SPLIT ${ctx.money(hand.bet)}` })) return;
        const aces = hand.cards[0].r === 1;
        const second = { cards: [hand.cards.pop(), draw()], bet: hand.bet, doubled: false, done: false, result: null, splitAces: aces };
        hand.cards.push(draw());
        hand.splitAces = aces;
        s.hands.splice(s.active + 1, 0, second);
        if (aces) { hand.done = true; second.done = true; }
        s.jokerable = false;
        if (handTotal(hand.cards).total === 21) hand.done = true;
        advance(ctx, table);
        break;
      }
      case 'joker':
        if (!s.jokerable) return ctx.fail('Keine Karte zum Zurückgeben');
        return useJoker(ctx, table);
      default:
        return ctx.fail('Unbekannte Aktion');
    }
  },
  // Spieler verlässt das Spiel mitten in der Runde → automatisch stehen bleiben
  forceFinish(ctx, table) {
    const s = table.state;
    if (s.phase === 'player' || s.phase === 'joker') {
      for (const h of s.hands) h.done = true;
      s.jokerable = false;
      s.phase = 'player';
      advance(ctx, table);
    }
  },
};

function afterDraw(ctx, table, isDouble) {
  const s = table.state;
  const hand = s.hands[s.active];
  const t = handTotal(hand.cards).total;
  s.jokerable = ctx.canUseItem('joker');
  if (t > 21) {
    if (s.jokerable) { s.phase = 'joker'; s.message = 'BUST! Joker Card benutzen?'; ctx.changed(); return; }
    hand.done = true;
  } else if (t === 21 || isDouble) {
    hand.done = true;
  }
  if (hand.done) s.jokerable = false;
  advance(ctx, table);
}

function useJoker(ctx, table) {
  const s = table.state;
  const hand = s.hands[s.active];
  if (!ctx.useItem('joker')) return ctx.fail('Joker Card nicht verfügbar');
  hand.cards.pop();
  hand.cards.push(table.shoe.draw());
  s.jokerable = false;
  s.message = 'JOKER! Neue Karte gezogen';
  s.phase = 'player';
  const t = handTotal(hand.cards).total;
  if (t >= 21 || hand.doubled) hand.done = true;
  advance(ctx, table);
}

function advance(ctx, table) {
  const s = table.state;
  while (s.active < s.hands.length && s.hands[s.active].done) {
    s.active++;
    // Zweite Split-Hand: automatisch auf 21 prüfen
    const h = s.hands[s.active];
    if (h && !h.done && handTotal(h.cards).total === 21) h.done = true;
  }
  if (s.active >= s.hands.length) {
    s.active = s.hands.length - 1;
    s.phase = 'dealer';
    ctx.changed();
    ctx.later(700, () => { s.dealer[1] = table.secret.hole; ctx.changed(); dealerPlay(ctx, table); });
    return;
  }
  ctx.changed();
}

function dealerPlay(ctx, table) {
  const s = table.state;
  const allBust = s.hands.every(h => handTotal(h.cards).total > 21);
  const onlyBJ = s.hands.length === 1 && isBlackjack(s.hands[0].cards);
  const t = handTotal(s.dealer).total;
  if (!allBust && !onlyBJ && t < 17) {
    ctx.later(800, () => {
      s.dealer.push(table.shoe.draw());
      ctx.changed();
      dealerPlay(ctx, table);
    });
    return;
  }
  ctx.later(700, () => finish(ctx, table));
}

function finish(ctx, table) {
  const s = table.state;
  const dealerCards = s.dealer;
  const dt = handTotal(dealerCards).total;
  const dBJ = isBlackjack(dealerCards);
  let stake = 0, payout = 0, blackjacks = 0, wins = 0;
  for (const h of s.hands) {
    stake += h.bet;
    const pt = handTotal(h.cards).total;
    const pBJ = isBlackjack(h.cards) && s.hands.length === 1;
    if (pBJ && !dBJ) { h.result = 'BLACKJACK'; payout += h.bet + Math.floor(h.bet * 1.5); blackjacks++; wins++; }
    else if (pt > 21) h.result = 'BUST';
    else if (dBJ && !pBJ) h.result = 'VERLOREN';
    else if (pBJ && dBJ) { h.result = 'PUSH'; payout += h.bet; }
    else if (dt > 21 || pt > dt) { h.result = 'GEWONNEN'; payout += h.bet * 2; wins++; }
    else if (pt === dt) { h.result = 'PUSH'; payout += h.bet; }
    else h.result = 'VERLOREN';
  }
  s.phase = 'done';
  s.message = s.hands.map(h => h.result).join(' / ');
  s.jokerable = false;
  ctx.settle({
    stake, payout, blackjacks, handsWon: wins,
    detail: `Dealer ${dt > 21 ? 'BUST' : dt} – ${s.message}`,
    replay: { bet: table.secret.firstBet },
  });
}
