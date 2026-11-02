import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { floorDef } from '../src/shared/config.js';
import { isDeveloperTestPlayer } from '../src/shared/dev.js';
import { crashMsFor, TOWER_LEVELS } from '../src/shared/games/arcade.js';
import { handTotal } from '../src/shared/games/blackjack.js';

function fakeConn() { const msgs = []; return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), results: pid => msgs.filter(m => m.t === 'event' && m.ev.kind === 'result' && (!pid || m.ev.pid === pid)).map(m => m.ev) }; }
function setup(names) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-0008');
  const conns = [], ids = [];
  for (const name of names) { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name })); }
  room.campaign.unlocked = 15;
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };
const tick = ms => { for (let t = 0; t < ms; t += 100) mock.timers.tick(100); };

test('Testmodus nur bei exakt „Ayri000“', () => {
  assert.equal(isDeveloperTestPlayer({ name: 'Ayri000' }), true);
  for (const n of ['ayri000', 'AYRI000', 'Ayri00', 'Ayri0000', 'Ayri000 ', ' Ayri000', 'Ayri 000', 'Ayri000x', '']) assert.equal(isDeveloperTestPlayer({ name: n }), false, JSON.stringify(n));
  assert.equal(isDeveloperTestPlayer(null), false);
});

// Eine Runde pro Spiel mit Mindesteinsatz spielen; gibt das Nettoergebnis zurück
function playRound(room, conn, pid, game, payload = {}) {
  const id = `${game}-0`;
  const t = room.session.tables[id];
  const B = room.makeCtx(pid, t).limits.min;
  room.handle(pid, { t: 'table.sit', id });
  const before = conn.results(pid).length;
  const act = a => room.handle(pid, { t: 'table.action', id, action: a });
  room.handle(pid, { t: 'table.start', id, payload: { bet: B, ...payload } });
  const s = t.state;
  if (game === 'blackjack') { tick(1600); for (let k = 0; k < 6 && s.phase === 'player'; k++) { act(handTotal(s.hands[s.active].cards).total < 14 ? 'hit' : 'stand'); tick(300); } }
  if (game === 'poker') { tick(2000); act('call'); }
  if (game === 'craps') { tick(3500); for (let k = 0; k < 30 && s.point !== null; k++) { room.handle(pid, { t: 'table.start', id, payload: { bets: {} } }); tick(3500); } }
  if (game === 'crash') { tick(crashMsFor(3)); act('cashout'); }
  if (game === 'hilo') { for (let k = 0; k < 3; k++) act(s.card.r <= 7 ? 'hi' : 'lo'); act('cash'); }
  if (game === 'mines') { for (let k = 0; k < 6; k++) act(`pick:${k}`); act('cash'); }
  if (game === 'tower') { for (let k = 0; k < TOWER_LEVELS; k++) act('pick:0'); }
  if (game === 'penguin') { for (let k = 0; k < 4; k++) act('go'); act('cash'); }
  tick(12000);
  room.handle(pid, { t: 'table.leave' });
  const res = conn.results(pid).slice(before);
  return res.reduce((a, r) => a + r.net, 0);
}

const GAMES = [
  ['slots'], ['blackjack'], ['roulette', { bets: [{ spot: 'n17', amount: 0 }] }], ['baccarat', { bets: { tie: 0 } }], ['craps', { bets: { pass: 0 } }],
  ['poker'], ['wheel', { bets: { x50: 0 } }], ['crash'], ['hilo'], ['mines', { mines: 10 }], ['tower', { mode: 'hard' }], ['penguin', { mode: 'hard' }],
  ['plinko', { risk: 'high' }], ['keno', { picks: [1, 2, 3, 4, 5, 6, 7, 8] }], ['moneywheel'], ['duck', { pick: 4 }], ['streetcraps', { pick: 'seven' }],
];

test('Ayri000 gewinnt jede eigene Runde in allen Spielen (normale Multiplikatoren)', () => {
  const { room, conns, ids } = setup(['Ayri000']);
  room.pot = 1e12;
  room.enterFloor(15);
  for (const [game, extra] of GAMES) {
    for (let r = 0; r < 4; r++) {
      const p = JSON.parse(JSON.stringify(extra || {}));
      const t = room.session.tables[`${game}-0`];
      const min = room.makeCtx(ids[0], t).limits.min;
      // Tischspiele mit Einzelwetten: Mindesteinsatz eintragen
      if (p.bets && Array.isArray(p.bets)) p.bets.forEach(b => { b.amount = Math.max(min, b.amount); });
      else if (p.bets) for (const k of Object.keys(p.bets)) p.bets[k] = game === 'baccarat' && k === 'tie' ? floorDef(15).limits.baccarat.min : min;
      const net = playRound(room, conns[0], ids[0], game, p);
      assert.ok(net > 0, `${game} Runde ${r + 1}: ${net}`);
    }
  }
  teardown(room);
});

test('Andere Spieler im selben Raum behalten normale Chancen', () => {
  const { room, conns, ids } = setup(['Ayri000', 'Kumpel', 'ayri000']);
  room.pot = 1e12;
  room.enterFloor(15);
  for (const idx of [1, 2]) {
    let losses = 0;
    for (let r = 0; r < 40; r++) if (playRound(room, conns[idx], ids[idx], 'roulette', { bets: [{ spot: 'n17', amount: floorDef(15).limits.roulette.min }] }) < 0) losses++;
    assert.ok(losses > 20, `Spieler ${idx}: nur ${losses} Verluste`);
  }
  teardown(room);
});
