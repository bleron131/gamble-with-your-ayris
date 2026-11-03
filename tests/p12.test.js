// Prompt 12: exakter Slot-Einsatz vom 3D-Pult, Gratis-MAKKA an der Casino-Bar (ohne Glücks-Effekt)
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room, BAR_COOLDOWN_MS } from '../src/shared/room.js';
import { floorDef } from '../src/shared/config.js';

function fakeConn() {
  const msgs = [];
  return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), errors: () => msgs.filter(m => m.t === 'error').map(m => m.msg) };
}
function setup(players = 2, campaign) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-P12');
  const conns = [], ids = [];
  for (let i = 0; i < players; i++) { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name: 'P' + i, campaign: i === 0 ? campaign : undefined })); }
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };

test('3D-Pult: slot.setbet setzt exakten Betrag in den Limits, Sperre gilt weiter', () => {
  const { room, conns, ids } = setup(2, { unlocked: 2 });
  room.enterFloor(2);
  const lim = floorDef(2).limits.slots;
  const t = room.session.tables['slots-0'];
  room.handle(ids[0], { t: 'slot.setbet', id: 'slots-0', bet: lim.min + 7 });
  assert.equal(t.state.bet, lim.min + 7);
  room.handle(ids[0], { t: 'slot.setbet', id: 'slots-0', bet: lim.max * 10 });
  assert.equal(t.state.bet, lim.max);
  room.handle(ids[0], { t: 'slot.setbet', id: 'slots-0', bet: 1 });
  assert.equal(t.state.bet, lim.min);
  room.handle(ids[0], { t: 'slot.setbet', id: 'slots-0', bet: 'abc' });
  assert.equal(t.state.bet, lim.min);
  // Spieler B kann den Einsatz nicht verstellen, solange A den Automaten hält
  room.handle(ids[1], { t: 'slot.setbet', id: 'slots-0', bet: lim.min * 3 });
  assert.equal(t.state.bet, lim.min);
  assert.ok(conns[1].errors().length > 0);
  teardown(room);
});

test('Casino-Bar: Gratis-MAKKA nur auf Stockwerken, mit Pause, ohne MAKKA LUCK', () => {
  const { room, ids } = setup(1, { unlocked: 3 });
  const seen = [];
  const orig = room.event.bind(room);
  room.event = ev => { seen.push(ev); return orig(ev); };
  room.handle(ids[0], { t: 'drink', phase: 'bar' }); // in der Shishabar: nichts
  assert.equal(seen.filter(e => e.phase === 'bar').length, 0);
  room.enterFloor(3);
  room.handle(ids[0], { t: 'drink', phase: 'bar' });
  room.handle(ids[0], { t: 'drink', phase: 'bar' }); // zu schnell
  const bars = seen.filter(e => e.kind === 'drink' && e.phase === 'bar');
  assert.equal(bars.length, 1);
  assert.ok(typeof bars[0].flavor === 'string' && bars[0].flavor.length);
  assert.equal(seen.filter(e => e.kind === 'makkaLuck').length, 0);
  assert.ok(!(room.makkaLuckUntil > Date.now()));
  mock.timers.tick(BAR_COOLDOWN_MS + 10);
  room.handle(ids[0], { t: 'drink', phase: 'bar' });
  assert.equal(seen.filter(e => e.kind === 'drink' && e.phase === 'bar').length, 2);
  teardown(room);
});
