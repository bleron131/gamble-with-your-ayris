import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { floorDef, FLOORS } from '../src/shared/config.js';
import { CHALLENGES, ALL_CHALLENGES, challengesFor, legacyChallengeIds } from '../src/shared/challenges.js';

function fakeConn() {
  const msgs = [];
  return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), rewards: () => msgs.filter(m => m.t === 'reward') };
}
function setup(n = 1, profiles = [{}]) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-0002');
  const conns = [], ids = [];
  profiles.forEach((pr, i) => { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name: 'P' + i, ...pr })); });
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };
const fakeWin = (room, pid, type, stake, payout, extra = {}) => room.settle(pid, room.session.tables[`${type}-0`], { stake, payout, ...extra });

test('Jedes Stockwerk hat 2–3 eindeutige Challenges mit 1–3 🍆', () => {
  assert.equal(Object.keys(CHALLENGES).length, FLOORS.length);
  for (const f of FLOORS) {
    const list = challengesFor(f.n);
    assert.ok(list.length >= 2 && list.length <= 3, `Stock ${f.n}`);
    for (const c of list) {
      assert.ok(c.reward >= 1 && c.reward <= 3);
      if (c.game) assert.ok(f.games.includes(c.game), `${c.id}: Spiel ${c.game} gibt es auf Stock ${f.n}`);
    }
  }
  assert.equal(new Set(ALL_CHALLENGES.map(c => c.id)).size, ALL_CHALLENGES.length);
});

test('Challenge: 3 Slot-Gewinne → Belohnung einmal pro Spieler, Fortschritt im Snapshot', () => {
  const { room, conns, ids } = setup(1, [{}, {}]);
  room.enterFloor(1);
  for (let i = 0; i < 2; i++) fakeWin(room, ids[0], 'slots', 100, 300);
  let ch = room.snapshot().session.challenges.find(c => c.id === 'f1-slots');
  assert.deepEqual([ch.prog, ch.goal, ch.done], [2, 3, false]);
  fakeWin(room, ids[1], 'slots', 100, 300);
  ch = room.snapshot().session.challenges.find(c => c.id === 'f1-slots');
  assert.equal(ch.done, true);
  for (const c of conns) assert.deepEqual(c.rewards().map(r => r.challenge), ['f1-slots']);
  // Weitere Gewinne → keine zweite Belohnung
  fakeWin(room, ids[0], 'slots', 100, 300);
  assert.equal(conns[0].rewards().length, 1);
  teardown(room);
});

test('Challenge bereits früher geschafft → keine erneute Belohnung (gespeichert pro Spieler)', () => {
  const { room, conns, ids } = setup(1, [{ challenges: ['f1-bj'] }, {}]);
  room.enterFloor(1);
  fakeWin(room, ids[0], 'blackjack', 100, 200);
  fakeWin(room, ids[0], 'blackjack', 100, 200);
  assert.equal(conns[0].rewards().filter(r => r.challenge === 'f1-bj').length, 0);
  assert.equal(conns[1].rewards().filter(r => r.challenge === 'f1-bj').length, 1);
  teardown(room);
});

test('Challenges blockieren nie: Ziel erreicht → nächstes Stockwerk frei, auch ohne Challenge', () => {
  const { room, ids } = setup(1);
  room.enterFloor(1);
  room.pot = floorDef(1).target - 50;
  fakeWin(room, ids[0], 'blackjack', 100, 100 + 60); // 1 BJ-Gewinn – Challenge (2) nicht erfüllt
  assert.equal(room.campaign.unlocked, 2);
  assert.ok(!room.session.tracker.done.includes('f1-bj'));
  teardown(room);
});

test('Leave-Challenge: mit ≥150% zurück; Gewinnserie wird durch Verlust zurückgesetzt', () => {
  const { room, conns, ids } = setup(1);
  room.enterFloor(2);
  fakeWin(room, ids[0], 'roulette', 100, 200);
  fakeWin(room, ids[0], 'roulette', 100, 200);
  fakeWin(room, ids[0], 'roulette', 100, 0);
  fakeWin(room, ids[0], 'roulette', 100, 200);
  assert.ok(!room.session.tracker.done.includes('f2-streak'));
  room.pot = floorDef(2).target * 1.6;
  room.leaveFloor('return');
  assert.ok(conns[0].rewards().some(r => r.challenge === 'f2-leave'));
  teardown(room);
});

test('Alte Bonus-Challenge (Stockwerk-Liste) wird auf die neue leave-Challenge abgebildet', () => {
  assert.deepEqual(legacyChallengeIds([1, 3, 4]), ['f1-leave', 'f4-leave']);
  const { room, conns, ids } = setup(1, [{ challengeFloors: [1] }]);
  room.enterFloor(1);
  room.pot = floorDef(1).target * 2;
  room.leaveFloor('return');
  assert.ok(!conns[0].rewards().some(r => r.challenge === 'f1-leave'));
  teardown(room);
});

test('Spezial-Challenges: Blackjack, Einzelzahl, MAKKA-Gewinn, schnelles Ziel', () => {
  const { room, conns, ids } = setup(1);
  room.enterFloor(7);
  fakeWin(room, ids[0], 'blackjack', 100, 250, { blackjacks: 1 });
  assert.ok(conns[0].rewards().some(r => r.challenge === 'f7-natural'));
  room.leaveFloor('return');
  room.enterFloor(5);
  const t = room.session.tables['craps-0'];
  t.roundMods = { makka: true };
  room.settle(ids[0], t, { stake: 100, payout: 200 });
  assert.ok(conns[0].rewards().some(r => r.challenge === 'f5-makka'));
  room.leaveFloor('return');
  room.enterFloor(4);
  mock.timers.tick(60_000);
  room.pot = floorDef(4).target - 10;
  fakeWin(room, ids[0], 'baccarat', 100, 200);
  assert.ok(conns[0].rewards().some(r => r.challenge === 'f4-fast'));
  teardown(room);
});
