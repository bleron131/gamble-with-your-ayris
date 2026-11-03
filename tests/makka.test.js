import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as Save from '../src/client/save.js';
import { Room } from '../src/shared/room.js';
import { MAKKA_BAR, MAKKA_LUCK_MS, START_CAPITAL } from '../src/shared/config.js';
import { simulate } from '../scripts/balance.js';

test('MAKKA kostet genau 1 Dildo und ist ohne Dildos nicht kaufbar', () => {
  const s = Save.load();
  s.dildos = 3;
  assert.equal(Save.buyMakka(), true);
  assert.equal(s.dildos, 2);
  s.dildos = 0;
  assert.equal(Save.buyMakka(), false);
  assert.equal(s.dildos, 0);
});

test('MAKKA im Multiplayer: Trinken wird allen gezeigt, Effekt-Flags reisen nur mit dem Trinkenden', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const room = new Room('AYRI-0002');
  const msgs = [[], []];
  const ids = [0, 1].map(i => room.join({ send: m => msgs[i].push(JSON.parse(JSON.stringify(m))) }, { name: 'P' + i, makka: i === 0 ? 1 : 0 }));
  room.handle(ids[0], { t: 'drink', phase: 'drink' });
  room.handle(ids[0], { t: 'move', p: [1, 0, 1], r: 0, a: 'walk', fx: 'z' });
  mock.timers.tick(100);
  assert.ok(msgs[1].some(m => m.t === 'event' && m.ev.kind === 'drink' && m.ev.pid === ids[0]));
  const moves = msgs[1].filter(m => m.t === 'moves').at(-1).moves;
  assert.equal(moves[ids[0]].fx, 'z');
  assert.ok(!moves[ids[1]] || !moves[ids[1]].fx);
  // Kein Einfluss auf den Team-Pot
  assert.equal(room.pot, 7500);
  room.destroy();
  mock.timers.reset();
});

// ───────────────────────── MAKKA als Item + MAKKA-LUCK (Prompt 7) ─────────────────────────
function setup(players = 2, makka = 0) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-0003');
  const conns = [];
  const ids = [];
  for (let i = 0; i < players; i++) {
    const msgs = [];
    conns.push({ msgs, errors: () => msgs.filter(m => m.t === 'error').map(m => m.msg), events: k => msgs.filter(m => m.t === 'event' && m.ev.kind === k).map(m => m.ev) });
    ids.push(room.join({ send: m => msgs.push(JSON.parse(JSON.stringify(m))) }, { name: 'P' + i, makka, campaign: { unlocked: 15 } }));
  }
  return { room, conns, ids };
}
const done = room => { room.destroy(); mock.timers.reset(); };
const atBar = (room, id) => { room.handle(id, { t: 'move', p: [MAKKA_BAR.x + 0.5, 0, MAKKA_BAR.z], r: 0, a: 'idle' }); };

test('MAKKA nur an der Bar in der Shishabar kaufbar; landet im Inventar und bleibt beim Stockwerkwechsel', () => {
  const { room, conns, ids } = setup(1);
  room.handle(ids[0], { t: 'move', p: [5, 0, 5], r: 0, a: 'idle' });
  room.handle(ids[0], { t: 'makka.buy' });
  assert.equal(room.players.get(ids[0]).makka, 0);
  assert.ok(conns[0].errors().some(e => e.includes('Bar')));
  atBar(room, ids[0]);
  room.handle(ids[0], { t: 'makka.buy' });
  room.handle(ids[0], { t: 'makka.buy' });
  assert.equal(room.players.get(ids[0]).makka, 2);
  assert.equal(conns[0].events('drink').filter(e => e.phase === 'buy').length, 2);
  // Im Casino kann man keinen MAKKA kaufen, aber die gekauften sind mit dabei
  room.enterFloor(3);
  atBar(room, ids[0]);
  room.handle(ids[0], { t: 'makka.buy' });
  assert.equal(room.players.get(ids[0]).makka, 2);
  assert.equal(room.snapshot().players[0].makka, 2);
  done(room);
});

test('MAKKA im Casino: −1, MAKKA LUCK 10 s für die Gruppe, zweiter MAKKA verlängert nur, stapelt nicht', () => {
  const { room, conns, ids } = setup(2, 2);
  room.enterFloor(2);
  room.handle(ids[0], { t: 'drink', phase: 'drink' });
  assert.equal(room.players.get(ids[0]).makka, 1);
  assert.ok(room.makkaActive());
  assert.ok(conns[1].events('makkaLuck').length === 1 && conns[1].events('makkaLuck')[0].ms === MAKKA_LUCK_MS);
  mock.timers.tick(5000);
  room.handle(ids[0], { t: 'drink', phase: 'drink' });
  assert.equal(room.players.get(ids[0]).makka, 0);
  // Feste Stärke: der Bonus ist ein einzelnes Flag, nur die Dauer wird erneuert
  assert.ok(Math.abs(room.makkaLuckUntil - (Date.now() + MAKKA_LUCK_MS)) < 5);
  room.handle(ids[0], { t: 'drink', phase: 'drink' }); // keiner mehr übrig
  assert.ok(conns[0].errors().some(e => e.includes('keinen MAKKA')));
  mock.timers.tick(MAKKA_LUCK_MS + 10);
  assert.equal(room.makkaActive(), false);
  done(room);
});

test('MAKKA in der Shishabar: Schwindel, aber kein Luck-Boost; Rundenstart während MAKKA zählt komplett', () => {
  const { room, conns, ids } = setup(1, 2);
  room.handle(ids[0], { t: 'drink', phase: 'drink' });
  assert.equal(room.players.get(ids[0]).makka, 1);
  assert.equal(room.makkaActive(), false);
  assert.equal(conns[0].events('drink').at(-1).luck, false);
  room.enterFloor(1);
  mock.timers.tick(3000);
  room.handle(ids[0], { t: 'drink', phase: 'drink' });
  mock.timers.tick(MAKKA_LUCK_MS - 500); // noch 0.5 s MAKKA
  room.handle(ids[0], { t: 'slot.spin', id: 'slots-0' });
  const t = room.session.tables['slots-0'];
  assert.equal(t.roundMods?.makka, true);
  mock.timers.tick(3000); // MAKKA ist abgelaufen, der Spin galt trotzdem mit Bonus
  assert.equal(room.makkaActive(), false);
  // Danach wieder normale Chancen
  room.handle(ids[0], { t: 'slot.spin', id: 'slots-0' });
  assert.ok(!t.roundMods?.makka);
  done(room);
});

test('MAKKA LUCK verbessert die Chancen spürbar, garantiert aber keinen Gewinn (alle Spiele)', () => {
  process.env.FLOOR = '15';
  for (const type of ['slots', 'roulette', 'baccarat', 'craps', 'poker', 'wheel', 'blackjack']) {
    const normal = simulate(type, 20000, true, false);
    const makka = simulate(type, 20000, true, true);
    assert.ok(makka.winRate > normal.winRate + 0.01, `${type}: ${normal.winRate} → ${makka.winRate}`);
    assert.ok(makka.lossRate > 0.2, `${type} Verlustquote mit MAKKA ${makka.lossRate}`);
  }
});

test('Cocktail: jeder dritte Drink bringt Schwindel, nie Luck; nur mit Cocktail im Outfit', () => {
  const { room, conns, ids } = setup(1);
  room.handle(ids[0], { t: 'drink', phase: 'cocktail' });
  assert.ok(conns[0].errors().some(e => e.includes('Cocktail')));
  room.handle(ids[0], { t: 'profile', appearance: { accessory: 'cocktail' } });
  room.enterFloor(1);
  const ns = [];
  for (let k = 0; k < 6; k++) { room.handle(ids[0], { t: 'drink', phase: 'cocktail' }); mock.timers.tick(2000); }
  for (const e of conns[0].events('drink')) if (e.phase === 'cocktail') ns.push(e.n);
  assert.deepEqual(ns, [1, 2, 3, 1, 2, 3]);
  assert.equal(room.makkaActive(), false);
  assert.equal(room.pot, START_CAPITAL);
  done(room);
});

test('Shisha rauchen: alle sehen es, nur in der Shishabar, kein Spieleffekt', () => {
  const { room, conns, ids } = setup(2);
  room.handle(ids[0], { t: 'smoke', i: 2 });
  assert.deepEqual(conns[1].events('smoke').map(e => [e.pid, e.i]), [[ids[0], 2]]);
  room.handle(ids[0], { t: 'smoke', i: 2 }); // direkt nochmal: ignoriert (läuft noch)
  assert.equal(conns[1].events('smoke').length, 1);
  room.enterFloor(1);
  mock.timers.tick(5000);
  room.handle(ids[1], { t: 'smoke', i: 0 });
  assert.equal(conns[0].events('smoke').length, 1);
  assert.equal(room.pot, START_CAPITAL);
  done(room);
});
