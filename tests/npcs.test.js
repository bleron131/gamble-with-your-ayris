import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { LOBBY_SEATS, npcCountFor } from '../src/shared/npcs.js';

function fakeConn() {
  const msgs = [];
  return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), errors: () => msgs.filter(m => m.t === 'error') };
}
function setup(n = 2) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-0003');
  const conns = [], ids = [];
  for (let i = 0; i < n; i++) { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name: 'P' + i })); }
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };
const moveTo = (room, id, x, z) => room.handle(id, { t: 'move', p: [x, 0, z], r: 0, a: 'idle' });

test('Sitzplätze: 4 Sofagruppen mit je 8 Plätzen + 5 Barhocker', () => {
  assert.equal(LOBBY_SEATS.length, 4 * 8 + 5);
  assert.equal(LOBBY_SEATS.filter(s => s.kind === 'stool').length, 5);
});

test('Zwei Spieler drücken gleichzeitig E auf denselben Sitz → nur einer bekommt ihn, der andere keinen Fehler', () => {
  const { room, conns, ids } = setup(2);
  const seat = LOBBY_SEATS[0];
  // Alle anderen Plätze auf diesem Sofa belegt → kein Ausweichplatz
  for (const id of ids) moveTo(room, id, seat.sx, seat.sz);
  room.handle(ids[0], { t: 'seat.take', i: seat.i });
  room.handle(ids[1], { t: 'seat.take', i: seat.i });
  const a = room.players.get(ids[0]), b = room.players.get(ids[1]);
  assert.equal(a.lseat, seat.i);
  assert.notEqual(b.lseat, seat.i);
  // Zweiter Spieler bekommt den Nachbarplatz auf demselben Sofa (oder nichts) – aber nie eine Fehlermeldung
  if (b.lseat != null) assert.equal(LOBBY_SEATS[b.lseat].furn, seat.furn);
  assert.equal(conns[1].errors().length, 0);
  teardown(room);
});

test('Sitz zu weit weg → nichts passiert; Weglaufen gibt den Sitz frei', () => {
  const { room, ids } = setup(1);
  const seat = LOBBY_SEATS[5];
  moveTo(room, ids[0], seat.x + 8, seat.z);
  room.handle(ids[0], { t: 'seat.take', i: seat.i });
  assert.equal(room.players.get(ids[0]).lseat, null);
  moveTo(room, ids[0], seat.sx, seat.sz);
  room.handle(ids[0], { t: 'seat.take', i: seat.i });
  assert.equal(room.players.get(ids[0]).lseat, seat.i);
  moveTo(room, ids[0], seat.x + 5, seat.z);
  assert.equal(room.players.get(ids[0]).lseat, null);
  teardown(room);
});

test('NPC sitzt auf dem Sitz → Spieler setzt sich, NPC steht sofort auf', () => {
  const { room, ids } = setup(1);
  const seat = LOBBY_SEATS[3];
  const npc = room.npcs.list[0];
  npc.spot = `seat:${seat.i}`;
  moveTo(room, ids[0], seat.sx, seat.sz);
  room.handle(ids[0], { t: 'seat.take', i: seat.i });
  assert.equal(room.players.get(ids[0]).lseat, seat.i);
  assert.notEqual(npc.spot, `seat:${seat.i}`);
  assert.equal(npc.react, 'yield');
  teardown(room);
});

test('NPC am Automaten → Spieler drückt SPIN, NPC geht sofort, ohne „besetzt“-Meldung', () => {
  const { room, conns, ids } = setup(1);
  room.enterFloor(1);
  assert.equal(room.npcs.list.length, npcCountFor('floor', 1));
  const npc = room.npcs.list[0];
  npc.spot = 'slot:slots-1';
  room.handle(ids[0], { t: 'slot.spin', id: 'slots-1' });
  assert.notEqual(npc.spot, 'slot:slots-1');
  assert.equal(conns[0].errors().length, 0);
  assert.equal(room.session.tables['slots-1'].busy, true);
  teardown(room);
});

test('NPC am Tisch → Spieler setzt sich, NPC macht Platz; NPCs wählen nie einen von Spielern benutzten Platz', () => {
  const { room, ids } = setup(1);
  room.enterFloor(1);
  const npc = room.npcs.list[0];
  npc.spot = 'table:blackjack-0';
  room.handle(ids[0], { t: 'table.sit', id: 'blackjack-0' });
  assert.equal(room.players.get(ids[0]).seat, 'blackjack-0');
  assert.notEqual(npc.spot, 'table:blackjack-0');
  for (let i = 0; i < 200; i++) mock.timers.tick(1000);
  assert.ok(room.npcs.list.every(n => n.spot !== 'table:blackjack-0'));
  // Keine zwei NPCs am selben Platz
  const spots = room.npcs.list.map(n => n.spot).filter(s => s && !s.startsWith('watch:'));
  assert.equal(new Set(spots).size, spots.length);
  teardown(room);
});

test('NPCs: Szenenwechsel setzt die NPCs neu, Snapshot enthält sie', () => {
  const { room } = setup(1);
  assert.equal(room.snapshot().npcs.length, npcCountFor('lobby'));
  room.enterFloor(8);
  assert.equal(room.snapshot().npcs.length, npcCountFor('floor', 8));
  assert.ok(room.snapshot().npcs.every(n => n.spot));
  teardown(room);
});
