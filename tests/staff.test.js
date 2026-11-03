// Prompt 15: STAFF ROOMS – Zugang nur für den Developer-Testspieler „Ayri000“ (zentral über dev.js), pro Spieler
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { canAccessStaffRooms, devPermissions } from '../src/shared/dev.js';

function fakeConn() {
  const msgs = [];
  return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), errors: () => msgs.filter(m => m.t === 'error').map(m => m.msg), events: k => msgs.filter(m => m.t === 'event' && m.ev.kind === k).map(m => m.ev) };
}
function setup(names) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-STF');
  const conns = [], ids = [];
  names.forEach(n => { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name: n, campaign: { unlocked: 15 } })); });
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };

test('Staff-Berechtigung nur bei exakt „Ayri000“', () => {
  assert.equal(canAccessStaffRooms({ name: 'Ayri000' }), true);
  assert.equal(devPermissions({ name: 'Ayri000' }).winAll, true);
  for (const n of ['ayri000', 'AYRI000', 'Ayri000 ', ' Ayri000', 'Ayri001', 'Ayri00', '']) assert.equal(canAccessStaffRooms({ name: n }), false, JSON.stringify(n));
  assert.equal(canAccessStaffRooms(null), false);
});

test('Nur Ayri000 kann die STAFF-Tür öffnen/schliessen; Zustand für alle sichtbar, neue Szene = Tür zu', () => {
  const { room, conns, ids } = setup(['Bleron', 'Ayri000']);
  room.enterFloor(1);
  // normaler Spieler: verweigert, Tür bleibt zu
  room.handle(ids[0], { t: 'staffdoor', open: true });
  assert.equal(!!room.staffDoorOpen, false);
  assert.ok(conns[0].errors().some(e => e.includes('ZUTRITT VERWEIGERT')));
  // Ayri000: öffnet
  room.handle(ids[1], { t: 'staffdoor', open: true });
  assert.equal(room.staffDoorOpen, true);
  assert.equal(room.snapshot().staffDoor, true);
  assert.equal(conns[0].events('staffdoor').length, 1, 'alle sehen die offene Tür');
  // normaler Spieler kann sie auch nicht schliessen
  room.handle(ids[0], { t: 'staffdoor', open: false });
  assert.equal(room.staffDoorOpen, true);
  room.handle(ids[1], { t: 'staffdoor', open: false });
  assert.equal(room.staffDoorOpen, false);
  room.handle(ids[1], { t: 'staffdoor', open: true });
  room.leaveFloor?.('return');
  assert.equal(!!room.staffDoorOpen, false, 'Szenenwechsel schliesst die Tür');
  // nur auf Stockwerken
  room.handle(ids[1], { t: 'staffdoor', open: true });
  assert.equal(!!room.staffDoorOpen, false);
  teardown(room);
});

test('Reconnect: Berechtigung wird wieder anhand des Namens bestimmt', () => {
  const { room, ids } = setup(['Ayri000']);
  room.enterFloor(2);
  room.leave(ids[0]);
  const c = fakeConn();
  const id2 = room.join(c, { name: 'Ayri000' });
  room.handle(id2, { t: 'staffdoor', open: true });
  assert.equal(room.staffDoorOpen, true);
  const c3 = fakeConn();
  const id3 = room.join(c3, { name: 'ayri000' });
  room.handle(id3, { t: 'staffdoor', open: false });
  assert.equal(room.staffDoorOpen, true);
  teardown(room);
});
