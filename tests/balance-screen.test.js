import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { floorDef, FLOOR_REWARDS, ITEMS, COSMETIC_UNLOCKS } from '../src/shared/config.js';

function fakeConn() {
  const msgs = [];
  return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), events: k => msgs.filter(m => m.t === 'event' && m.ev.kind === k).map(m => m.ev), rewards: () => msgs.filter(m => m.t === 'reward') };
}
function setup(n = 2, profiles = []) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-0005');
  const conns = [], ids = [];
  for (let i = 0; i < n; i++) { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name: 'Ayri ' + (i + 1), ...(profiles[i] || {}) })); }
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };
const play = (room, pid, type, stake, payout) => room.settle(pid, room.session.tables[`${type}-0`], { stake, payout });

test('Bilanz: Startkapital wird aufgeteilt, jede Runde dem Spieler zugeordnet, Summe = Team-Pot', () => {
  const { room, ids } = setup(2);
  room.pot = 10_001;
  room.enterFloor(1);
  const L = room.session.ledger;
  assert.equal(L.players[ids[0]].start + L.players[ids[1]].start, 10_001);
  // Einsätze werden wie im Spiel zuerst abgebucht, dann ausgezahlt
  room.pot -= 500; play(room, ids[0], 'blackjack', 500, 1000);
  room.pot -= 300; play(room, ids[1], 'slots', 300, 0);
  room.pot -= 200; play(room, ids[1], 'slots', 200, 600);
  const a = L.players[ids[0]], b = L.players[ids[1]];
  assert.deepEqual([a.staked, a.won, a.lost, a.rounds, a.balance - a.start], [500, 500, 0, 1, 500]);
  assert.deepEqual([b.staked, b.won, b.lost, b.rounds, b.balance - b.start], [500, 400, 300, 2, 100]);
  assert.equal(a.balance + b.balance, room.pot);
  assert.equal(L.points.length, 3);
  assert.deepEqual(L.points.map(p => [p.pid, p.game, p.net]), [[ids[0], 'blackjack', 500], [ids[1], 'slots', -300], [ids[1], 'slots', 400]]);
  assert.ok(L.points.every(p => Number.isFinite(p.bal) && p.i > 0));
  teardown(room);
});

test('Ziel erreicht → Bilanz-Event an alle, Stockwerk-🍆 für alle Spieler genau einmal', () => {
  const { room, conns, ids } = setup(2, [{}, { rewardedFloors: [1] }]);
  room.enterFloor(1);
  room.pot = floorDef(1).target - 100;
  play(room, ids[0], 'slots', 100, 400);
  for (const c of conns) {
    const b = c.events('balance');
    assert.equal(b.length, 1);
    assert.equal(b[0].floor, 1);
    assert.equal(b[0].target, floorDef(1).target);
    assert.equal(Object.keys(b[0].ledger.players).length, 2);
  }
  assert.deepEqual(conns[0].events('balance')[0].rewards, { [ids[0]]: FLOOR_REWARDS[0], [ids[1]]: 0 });
  assert.equal(conns[0].rewards().filter(r => r.floor === 1).length, 1);
  assert.equal(conns[1].rewards().filter(r => r.floor === 1).length, 0);
  // Weiter gewinnen auf demselben Stockwerk → keine zweite Bilanz, keine weiteren 🍆
  play(room, ids[0], 'slots', 100, 400);
  assert.equal(conns[0].events('balance').length, 1);
  teardown(room);
});

test('WEITER ZUM NÄCHSTEN STOCKWERK: Vote „next“ führt direkt ins nächste Stockwerk', () => {
  const { room, ids } = setup(1);
  room.enterFloor(1);
  room.handle(ids[0], { t: 'vote.start', type: 'next' });
  assert.equal(room.floor, 1); // Ziel noch nicht erreicht
  room.pot = floorDef(1).target + 10;
  room.checkTarget();
  room.handle(ids[0], { t: 'vote.start', type: 'next' });
  assert.equal(room.floor, 2);
  assert.equal(room.scene, 'floor');
  assert.equal(room.session.ledger.floor, 2);
  teardown(room);
});

test('Shop-Preise: kein kaufbares Item über 25 🍆, günstigste ab 2–3 🍆', () => {
  const prices = [...Object.values(ITEMS).map(i => i.cost), ...Object.values(COSMETIC_UNLOCKS).filter(u => u.shop).map(u => u.shop)];
  assert.ok(prices.every(p => p >= 2 && p <= 25), prices.join(','));
  assert.ok(Math.min(...prices) <= 3);
  assert.equal(Math.max(...Object.values(ITEMS).map(i => i.cost)), 25);
});
