import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { floorDef } from '../src/shared/config.js';
import { FloorDynamics, RUSH_MS, RUSH_GRACE_MS, MODIFIERS } from '../src/shared/dynamics.js';

FloorDynamics.enabled = true;
function fakeConn() { const msgs = []; return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), events: k => msgs.filter(m => m.t === 'event' && m.ev.kind === k).map(m => m.ev), rewards: () => msgs.filter(m => m.t === 'reward') }; }
function setup(n = 1, names) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-0007');
  const conns = [], ids = [];
  for (let i = 0; i < n; i++) { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name: names?.[i] || 'P' + i })); }
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };
const tick = s => { for (let i = 0; i < s; i++) mock.timers.tick(1000); };
const play = (room, pid, type, stake, payout) => { room.pot -= stake; room.settle(pid, room.session.tables[`${type}-0`], { stake, payout }); };

test('Floor Modifier: ungefähr 30 % der Stockwerke, höchstens einer, im Snapshot für alle', () => {
  const { room } = setup(1);
  let n = 0;
  for (let i = 0; i < 300; i++) { room.enterFloor(1); if (room.dyn.modifier) n++; room.leaveFloor('return'); }
  assert.ok(n > 60 && n < 130, `${n}/300`);
  teardown(room);
});

test('HIGH ROLLER erhöht Mindest- und Maximaleinsatz; HOT FLOOR erhöht Gewinne (nur den Gewinnanteil)', () => {
  const { room, ids } = setup(1);
  room.enterFloor(1);
  room.dyn.modifier = { id: 'highroller', hidden: false };
  const ctx = room.makeCtx(ids[0], room.session.tables['blackjack-0']);
  const base = floorDef(1).limits.blackjack;
  assert.equal(ctx.limits.min, base.min * 2);
  assert.equal(ctx.limits.max, Math.round(base.max * 1.5));
  assert.equal(floorDef(1).limits.blackjack.min, base.min); // Original unverändert
  room.dyn.modifier = { id: 'hot', hidden: false };
  const pot = room.pot;
  play(room, ids[0], 'blackjack', 100, 200);
  assert.equal(room.pot - pot, 115);
  play(room, ids[0], 'blackjack', 100, 0);
  assert.equal(room.pot - pot, 15);
  teardown(room);
});

test('MYSTERY: erst verdeckt, nach dem ersten Spiel enthüllt; RISK NIGHT gibt beim Abschluss Extra-🍆', () => {
  const { room, conns, ids } = setup(1);
  room.enterFloor(1);
  room.dyn.modifier = { id: 'risk', hidden: true };
  assert.equal(room.snapshot().dyn.modifier.id, 'mystery');
  play(room, ids[0], 'slots', 100, 0);
  assert.equal(room.snapshot().dyn.modifier.id, 'risk');
  assert.ok(conns[0].events('modifier').some(e => e.phase === 'reveal'));
  room.pot = floorDef(1).target + 1;
  room.checkTarget();
  assert.equal(conns[0].rewards().filter(r => r.reason.includes(MODIFIERS.risk.name)).length, 1);
  teardown(room);
});

test('Rush dauert genau 30 Sekunden; Bonus nur für Runden, die im Rush starten und rechtzeitig enden', () => {
  const { room, conns, ids } = setup(1);
  room.enterFloor(1);
  room.dyn.startRush('blackjack');
  assert.ok(room.snapshot().dyn.rush.leftMs <= RUSH_MS);
  const t = room.session.tables['blackjack-0'];
  t.roundMods = { rush: room.dyn.roundMods('blackjack') };
  const pot = room.pot;
  room.settle(ids[0], t, { stake: 100, payout: 200 }); // Einsatz war schon abgebucht: Auszahlung 100 + 100 × 1.25
  assert.equal(room.pot - pot, 225);
  tick(29); assert.ok(room.dyn.rushActive());
  tick(2); assert.equal(room.dyn.rushActive(), null);
  assert.ok(conns[0].events('rush').some(e => e.phase === 'end'));
  // Runde im Rush gestartet, aber erst lange nach dem Ende abgerechnet → kein Bonus
  room.dyn.startRush('blackjack');
  t.roundMods = { rush: room.dyn.roundMods('blackjack') };
  tick(RUSH_MS / 1000 + RUSH_GRACE_MS / 1000 + 2);
  const pot2 = room.pot;
  room.settle(ids[0], t, { stake: 100, payout: 200 });
  assert.equal(room.pot - pot2, 200);
  // Runde nach dem Rush gestartet → kein Bonus
  assert.equal(room.dyn.roundMods('blackjack'), null);
  teardown(room);
});

test('DILDO RUSH ist pro Spieler gedeckelt; Rushes kommen mit Pause, nicht dauerhaft', () => {
  const { room, conns, ids } = setup(1);
  room.enterFloor(1);
  room.dyn.startRush('dildo');
  const mods = { rush: room.dyn.roundMods('slots') };
  let got = 0;
  for (let i = 0; i < 200; i++) if (room.dyn.dildoRoll(ids[0], mods)) got++;
  assert.equal(got, 3);
  tick(31);
  const starts = () => conns[0].events('rush').filter(e => e.phase === 'start').length;
  const before = starts();
  tick(130);
  assert.equal(starts(), before); // mindestens 140 s Pause
  teardown(room);
});

test('Hot Streak: 🍆 bei 5 und 10 Siegen in Folge – auch nach Reconnect nicht doppelt', () => {
  const { room, conns, ids } = setup(1, ['Ayri']);
  room.enterFloor(1);
  for (let i = 0; i < 10; i++) play(room, ids[0], 'slots', 100, 300);
  assert.deepEqual(conns[0].rewards().filter(r => r.kind === 'streak').map(r => r.dildos), [1, 2]);
  assert.equal(room.snapshot().players[0].hot, 10);
  room.leave(ids[0]);
  const c2 = fakeConn();
  const id2 = room.join(c2, { name: 'Ayri' });
  for (let i = 0; i < 10; i++) play(room, id2, 'slots', 100, 300);
  assert.equal(c2.rewards().filter(r => r.kind === 'streak').length, 0);
  play(room, id2, 'slots', 100, 0);
  assert.equal(room.players.get(id2).hot, 0);
  assert.equal(room.players.get(id2).cold, 1);
  teardown(room);
});
