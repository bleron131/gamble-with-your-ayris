import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { floorDef, START_CAPITAL, MAFIA_KEEP_FRACTION } from '../src/shared/config.js';
import { bestHand, compareScore } from '../src/shared/games/poker.js';
import { handTotal } from '../src/shared/games/blackjack.js';
import { playCoup } from '../src/shared/games/baccarat.js';

function fakeConn() {
  const msgs = [];
  return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), errors: () => msgs.filter(m => m.t === 'error').map(m => m.msg) };
}

function setup(players = 2, campaign) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const room = new Room('AYRI-0001');
  const conns = [];
  const ids = [];
  for (let i = 0; i < players; i++) {
    const c = fakeConn();
    conns.push(c);
    ids.push(room.join(c, { name: 'P' + i, campaign: i === 0 ? campaign : undefined }));
  }
  return { room, conns, ids };
}

function teardown(room) { room.destroy(); mock.timers.reset(); }

test('Team-Pot: zwei gleichzeitige Einsätze desselben Betrags → nur einer wird akzeptiert', () => {
  const { room, conns, ids } = setup(2, { unlocked: 2 });
  room.enterFloor(2);
  room.pot = 10_000;
  room.handle(ids[0], { t: 'table.sit', id: 'roulette-0' });
  room.handle(ids[1], { t: 'table.sit', id: 'slots-0' });
  // Spieler A setzt $10'000 auf Rot, Spieler B versucht gleichzeitig $500 am Slot (Pot ist danach leer)
  room.handle(ids[0], { t: 'table.start', id: 'roulette-0', payload: { bets: [{ spot: 'red', amount: 10_000 }] } });
  room.handle(ids[1], { t: 'table.start', id: 'slots-0', payload: { bet: 500, lines: 5 } });
  assert.equal(room.pot, 0);
  assert.equal(room.session.tables['slots-0'].busy, false);
  assert.ok(conns[1].errors().some(e => e.includes('Nicht genug')));
  teardown(room);
});

test('Einsätze werden sofort abgebucht und Gewinne nach der Animation gutgeschrieben', () => {
  const { room, ids } = setup(1);
  room.enterFloor(1);
  room.handle(ids[0], { t: 'table.sit', id: 'slots-0' });
  room.handle(ids[0], { t: 'table.start', id: 'slots-0', payload: { bet: 100, lines: 5 } });
  assert.equal(room.pot, START_CAPITAL - 100);
  mock.timers.tick(3000);
  assert.equal(room.session.tables['slots-0'].busy, false);
  assert.ok(room.pot >= START_CAPITAL - 100);
  teardown(room);
});

test('Ziel erreicht → Level bleibt abgeschlossen, auch wenn der Pot wieder fällt; Pot wird übernommen', () => {
  const { room, ids, conns } = setup(1);
  room.enterFloor(1);
  room.pot = 9_990;
  room.handle(ids[0], { t: 'table.sit', id: 'slots-0' });
  // Gewinn simulieren
  room.settle(ids[0], room.session.tables['slots-0'], { stake: 0, payout: 2_510 });
  assert.equal(room.pot, 12_500);
  assert.ok(room.campaign.completed.includes(1));
  assert.equal(room.campaign.unlocked, 2);
  assert.ok(conns[0].msgs.some(m => m.t === 'reward' && m.floor === 1));
  // Weitergamblen & verlieren
  room.pot = 7_000;
  room.leaveFloor('return');
  assert.ok(room.campaign.completed.includes(1));
  assert.equal(room.campaign.unlocked, 2);
  room.enterFloor(2);
  assert.equal(room.session.entryPot, 7_000);
  assert.equal(room.pot, 7_000);
  teardown(room);
});

test('Kein Dildo-Farming: Belohnung pro Stockwerk nur einmal', () => {
  const { room, ids, conns } = setup(1);
  for (let i = 0; i < 3; i++) {
    room.enterFloor(1);
    room.pot = 20_000;
    room.checkTarget();
    room.leaveFloor('return');
  }
  assert.equal(conns[0].msgs.filter(m => m.t === 'reward' && m.floor === 1).length, 1);
  assert.equal(conns[0].msgs.filter(m => m.t === 'reward' && m.challenge === 1).length, 1);
  teardown(room);
});

test('Bankrott → Mafia → zurück in die Shishabar', () => {
  const { room, ids, conns } = setup(1, { unlocked: 3 });
  room.pot = 40_000;
  room.enterFloor(3);
  room.pot = 10; // unter Mindesteinsatz
  room.checkBankrupt();
  assert.ok(conns[0].msgs.some(m => m.t === 'event' && m.ev.kind === 'mafia'));
  mock.timers.tick(11_000);
  assert.equal(room.scene, 'lobby');
  assert.equal(room.pot, Math.max(START_CAPITAL, Math.floor(40_000 * MAFIA_KEEP_FRACTION)));
  teardown(room);
});

test('Mafia Briefcase rettet einmalig', () => {
  const { room, ids } = setup(1, { unlocked: 3 });
  room.handle(ids[0], { t: 'loadout', items: ['briefcase'], inventory: { briefcase: 1 } });
  room.pot = 40_000;
  room.enterFloor(3);
  room.pot = 10;
  room.checkBankrupt();
  assert.equal(room.scene, 'floor');
  assert.ok(room.pot >= floorDef(3).minBet);
  assert.equal(room.players.get(ids[0]).inventory.briefcase, 0);
  teardown(room);
});

test('Double or Loss braucht alle Spieler', () => {
  const { room, ids } = setup(2);
  room.scene = 'final';
  room.pot = 600_000_000;
  for (const p of room.players.values()) p.pose.p = [0, 0, -30];
  room.handle(ids[0], { t: 'vote.start', type: 'double' });
  assert.ok(room.vote);
  assert.equal(room.finalBusy, false);
  room.handle(ids[1], { t: 'vote.cast', yes: true });
  assert.equal(room.vote, null);
  assert.equal(room.finalBusy, true);
  mock.timers.tick(8000);
  assert.ok(room.pot === 1_200_000_000 || room.pot === 0);
  mock.timers.tick(11000);
  assert.equal(room.scene, 'lobby');
  assert.equal(room.pot, START_CAPITAL);
  teardown(room);
});

test('Stockwerk-Wechsel per Aufzug erfordert Freischaltung', () => {
  const { room, ids, conns } = setup(1);
  room.handle(ids[0], { t: 'vote.start', type: 'travel', data: { floor: 5 } });
  assert.equal(room.scene, 'lobby');
  assert.ok(conns[0].errors().some(e => e.includes('gesperrt')));
  room.handle(ids[0], { t: 'vote.start', type: 'travel', data: { floor: 1 } });
  assert.equal(room.scene, 'floor');
  teardown(room);
});

test('Blackjack-Runde läuft vollständig durch', () => {
  const { room, ids } = setup(1, { unlocked: 4 });
  room.pot = 50_000;
  room.enterFloor(4);
  room.handle(ids[0], { t: 'table.sit', id: 'blackjack-0' });
  for (let i = 0; i < 30; i++) {
    room.handle(ids[0], { t: 'table.start', id: 'blackjack-0', payload: { bet: 500 } });
    for (let k = 0; k < 6 && room.session.tables['blackjack-0'].state.phase === 'player'; k++)
      room.handle(ids[0], { t: 'table.action', id: 'blackjack-0', action: handTotal(room.session.tables['blackjack-0'].state.hands[room.session.tables['blackjack-0'].state.active].cards).total < 15 ? 'hit' : 'stand' });
    for (let k = 0; k < 30; k++) mock.timers.tick(500);
    assert.equal(room.session.tables['blackjack-0'].busy, false);
    assert.equal(room.session.tables['blackjack-0'].state.phase, 'done');
  }
  teardown(room);
});

test('Poker-Handbewertung', () => {
  const c = (r, s) => ({ r, s });
  const royal = bestHand([c(1, 0), c(13, 0), c(12, 0), c(11, 0), c(10, 0), c(2, 1), c(3, 2)]);
  assert.equal(royal[0], 9);
  const wheel = bestHand([c(1, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 0), c(9, 1), c(13, 2)]);
  assert.deepEqual(wheel.slice(0, 2), [4, 5]);
  const fh = bestHand([c(3, 0), c(3, 1), c(3, 2), c(9, 3), c(9, 0), c(1, 1), c(13, 2)]);
  assert.equal(fh[0], 6);
  assert.ok(compareScore(royal, fh) > 0);
});

test('Baccarat-Ergebnisse sind gültig', () => {
  const deck = [];
  for (let i = 0; i < 1000; i++) deck.push({ r: (i % 13) + 1, s: i % 4 });
  for (let i = 0; i < 100; i++) {
    const coup = playCoup(() => deck[Math.floor(Math.random() * deck.length)]);
    assert.ok(coup.player.length >= 2 && coup.player.length <= 3);
    assert.ok(['player', 'banker', 'tie'].includes(coup.winner));
  }
});
