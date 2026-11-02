import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { floorDef } from '../src/shared/config.js';
import { HR_FIRST_REWARD, HR_REPEAT_REWARD } from '../src/shared/events.js';

function fakeConn() {
  const msgs = [];
  return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), rewards: () => msgs.filter(m => m.t === 'reward'), events: k => msgs.filter(m => m.t === 'event' && m.ev.kind === k).map(m => m.ev) };
}
function setup(n = 2, profiles = []) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-0004');
  const conns = [], ids = [];
  for (let i = 0; i < n; i++) { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name: 'P' + i, ...(profiles[i] || {}) })); }
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };
const win = (room, pid, type, stake, payout) => room.settle(pid, room.session.tables[`${type}-0`], { stake, payout });

test('Co-op-Events starten von selbst auf einem Stockwerk und nicht in der Shishabar', () => {
  const { room, conns } = setup(1);
  for (let i = 0; i < 200; i++) mock.timers.tick(1000);
  assert.equal(conns[0].events('coop').length, 0);
  room.enterFloor(1);
  for (let i = 0; i < 130; i++) mock.timers.tick(1000);
  assert.ok(conns[0].events('coop').some(e => e.phase === 'start'));
  assert.ok(room.snapshot().events.coop);
  teardown(room);
});

test('LUCKY STREAK: 5 Team-Gewinne in Folge → alle bekommen 🍆; Verlust setzt zurück', () => {
  const { room, conns, ids } = setup(2);
  room.enterFloor(1);
  room.events.startCoop('streak');
  for (let i = 0; i < 3; i++) win(room, ids[i % 2], 'slots', 100, 300);
  win(room, ids[0], 'slots', 100, 0);
  assert.equal(room.events.coop.prog, 0);
  for (let i = 0; i < 5; i++) win(room, ids[i % 2], 'slots', 100, 300);
  assert.equal(room.events.coop, null);
  for (const c of conns) assert.ok(c.rewards().some(r => r.kind === 'event'));
  teardown(room);
});

test('TEAM RUSH läuft ab → kein Nachteil, Pot unverändert', () => {
  const { room, conns } = setup(1);
  room.enterFloor(2);
  room.events.startCoop('rush');
  assert.equal(room.events.coop.goal, floorDef(2).target * 0.2);
  const pot = room.pot;
  for (let i = 0; i < 310; i++) mock.timers.tick(1000);
  assert.ok(conns[0].events('coop').some(e => e.phase === 'fail'));
  assert.equal(room.pot, pot);
  teardown(room);
});

test('CASINO TOUR: Gewinne in 3 verschiedenen Spielen', () => {
  const { room, conns, ids } = setup(1);
  room.enterFloor(3);
  room.events.startCoop('tour');
  win(room, ids[0], 'slots', 100, 300);
  win(room, ids[0], 'slots', 100, 300);
  win(room, ids[0], 'blackjack', 100, 200);
  assert.equal(room.events.coop.prog, 2);
  win(room, ids[0], 'wheel', 100, 200);
  assert.ok(conns[0].rewards().some(r => r.kind === 'event'));
  teardown(room);
});

test('High Roller: Duell ist kostenlos, nur einer gleichzeitig, Sieger bekommt Titel nur beim ersten Mal', () => {
  const { room, conns, ids } = setup(2, [{}, { hrWon: ['highroller'] }]);
  room.enterFloor(5);
  room.pot = 100000;
  room.events.spawnHr('highroller');
  room.handle(ids[0], { t: 'hr.challenge' });
  room.handle(ids[1], { t: 'hr.challenge' });
  assert.ok(conns[1].msgs.some(m => m.t === 'error' && m.msg.includes('duelliert')));
  for (let i = 0; i < 30; i++) mock.timers.tick(1000);
  const end = conns[0].events('hr').find(e => e.phase === 'end');
  assert.ok(end);
  assert.equal(room.pot, 100000);
  const rw = conns[0].rewards().filter(r => r.hr === 'highroller');
  if (end.win) { assert.equal(rw.length, 1); assert.equal(rw[0].dildos, HR_FIRST_REWARD); assert.ok(rw[0].title); } else assert.equal(rw.length, 0);
  assert.equal(room.events.hr, null);
  // Zweiter Spieler hat diesen High Roller schon besiegt → nur kleine Belohnung
  room.events.spawnHr('highroller');
  room.handle(ids[1], { t: 'hr.challenge' });
  for (let i = 0; i < 30; i++) mock.timers.tick(1000);
  const end2 = conns[1].events('hr').filter(e => e.phase === 'end').pop();
  const rw2 = conns[1].rewards().filter(r => r.hr === 'highroller');
  if (end2.win) assert.equal(rw2[0].dildos, HR_REPEAT_REWARD);
  teardown(room);
});

test('High Roller erscheint erst ab Stock 3 und geht nach Ablauf wieder', () => {
  const { room, conns } = setup(1);
  room.enterFloor(1);
  for (let i = 0; i < 400; i++) mock.timers.tick(1000);
  assert.equal(conns[0].events('hr').length, 0);
  room.leaveFloor('return');
  room.enterFloor(4);
  for (let i = 0; i < 120; i++) mock.timers.tick(1000);
  assert.ok(conns[0].events('hr').some(e => e.phase === 'arrive'));
  for (let i = 0; i < 160; i++) mock.timers.tick(1000);
  assert.ok(conns[0].events('hr').some(e => e.phase === 'leave'));
  teardown(room);
});

test('Prestige: Finale geschafft → neuer Run auf Prestige 1 mit höheren Zielen, permanenter Fortschritt bleibt', async () => {
  const { prestigeScale } = await import('../src/shared/config.js');
  const { room, conns } = setup(1, [{ campaign: { everCompleted: [1, 2, 3], gameComplete: true } }]);
  room.pot = 600_000_000;
  room.endFinal();
  assert.equal(room.campaign.prestige, 1);
  assert.equal(room.pot, 7500);
  assert.equal(room.campaign.unlocked, 1);
  assert.deepEqual(room.campaign.everCompleted, [1, 2, 3]);
  assert.ok(conns[0].events('prestige').some(e => e.level === 1));
  assert.equal(floorDef(1, 1).target, floorDef(1).target * prestigeScale(1));
  room.enterFloor(1);
  assert.equal(room.challengeCtx().target, 15000);
  assert.ok(room.session.tables['slots-0'].state.bet >= floorDef(1, 1).limits.slots.min);
  teardown(room);
});
