import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { floorDef } from '../src/shared/config.js';
import { crashMultAt, crashMsFor, DUCKS, DUCK_STEPS, PLINKO_PAYS, MONEY_WHEEL, minesMult, hiloOdds } from '../src/shared/games/arcade.js';
import { seedRandom } from '../src/shared/rng.js';

// Reproduzierbar: fester Seed, damit Deploys nicht an seltenen Zufallsfällen scheitern
seedRandom(+(process.env.ARCADE_SEED || 7));

function fakeConn() { const msgs = []; return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), results: () => msgs.filter(m => m.t === 'event' && m.ev.kind === 'result').map(m => m.ev), errors: () => msgs.filter(m => m.t === 'error').map(m => m.msg) }; }
function setup(n = 1) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-0006');
  const conns = [], ids = [];
  for (let i = 0; i < n; i++) { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name: 'P' + i })); }
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };
const tick = (ms) => { for (let t = 0; t < ms; t += 100) mock.timers.tick(100); };

test('Neue Spiele sind auf den Stockwerken verteilt und haben Limits', () => {
  const { room } = setup(1);
  room.enterFloor(1);
  assert.ok(room.session.tables['hilo-0']);
  room.leaveFloor('return'); room.enterFloor(11);
  for (const g of ['hilo', 'mines', 'crash', 'plinko', 'keno', 'moneywheel', 'tower', 'penguin', 'duck', 'streetcraps']) {
    assert.ok(room.session.tables[`${g}-0`], g);
    assert.ok(floorDef(11).limits[g].min > 0, g);
  }
  teardown(room);
});

test('Crash: Einsatz wird abgebucht, Cashout zahlt Einsatz × Multiplikator, Ergebnis für alle gleich', () => {
  const { room, conns, ids } = setup(2);
  room.enterFloor(3);
  room.pot = 100_000;
  room.handle(ids[0], { t: 'table.sit', id: 'crash-0' });
  room.handle(ids[0], { t: 'table.start', id: 'crash-0', payload: { bet: 1000 } });
  assert.equal(room.pot, 99_000);
  const t = room.session.tables['crash-0'];
  const crash = t.secret.crash;
  if (crash > 1.25) {
    tick(crashMsFor(1.2) + 50);
    room.handle(ids[0], { t: 'table.action', id: 'crash-0', action: 'cashout' });
    const m = t.state.cashed;
    assert.ok(m >= 1.2 && m < crash);
    assert.equal(room.pot, 99_000 + Math.floor(1000 * m));
  }
  tick(crashMsFor(crash) + 200);
  assert.equal(t.state.phase, 'crashed');
  assert.equal(t.state.crash, crash);
  assert.equal(t.busy, false);
  // Alle Spieler bekommen dasselbe Ergebnis
  assert.deepEqual(conns[0].results().map(r => r.net), conns[1].results().map(r => r.net));
  // Ledger: dem Spieler zugeordnet
  assert.equal(room.session.ledger.points.at(-1).pid, ids[0]);
  teardown(room);
});

test('Crash mit Auto-Cashout; Multiplikator wächst exponentiell', () => {
  assert.equal(crashMultAt(0), 1);
  assert.ok(Math.abs(crashMultAt(crashMsFor(2)) - 2) < 0.02);
  const { room, ids } = setup(1);
  room.enterFloor(3);
  room.handle(ids[0], { t: 'table.sit', id: 'crash-0' });
  let wins = 0, losses = 0;
  for (let i = 0; i < 30; i++) {
    const pot = room.pot;
    room.handle(ids[0], { t: 'table.start', id: 'crash-0', payload: { bet: 1000, auto: 1.5 } });
    tick(crashMsFor(room.session.tables['crash-0'].secret.crash) + 300);
    if (room.pot > pot) { wins++; assert.equal(room.pot - pot, 500); } else { losses++; assert.equal(pot - room.pot, 1000); }
  }
  assert.ok(wins > 5 && losses > 0, `${wins}/${losses}`);
  teardown(room);
});

test('HiLo: Gewinnchance/Multiplikator, Cashout erst nach richtigem Tipp, Push bei gleicher Karte', () => {
  assert.deepEqual(hiloOdds(1, 'lo').count, 0);
  assert.equal(hiloOdds(7, 'hi').count, 6);
  const { room, conns, ids } = setup(1);
  room.enterFloor(1);
  room.handle(ids[0], { t: 'table.sit', id: 'hilo-0' });
  room.handle(ids[0], { t: 'table.start', id: 'hilo-0', payload: { bet: 100 } });
  room.handle(ids[0], { t: 'table.action', id: 'hilo-0', action: 'cash' });
  assert.ok(conns[0].errors().some(e => e.includes('mindestens einmal')));
  const s = room.session.tables['hilo-0'].state;
  for (let k = 0; k < 50 && s.phase === 'play' && s.steps < 1; k++) room.handle(ids[0], { t: 'table.action', id: 'hilo-0', action: s.card.r <= 7 ? 'hi' : 'lo' });
  if (s.phase === 'play') {
    const pot = room.pot;
    room.handle(ids[0], { t: 'table.action', id: 'hilo-0', action: 'cash' });
    assert.equal(room.pot - pot, Math.floor(100 * s.mult));
  }
  teardown(room);
});

test('Mines: Multiplikator steigt mit Minenzahl; Aufstehen mitten in der Runde cashed aus bzw. erstattet', () => {
  assert.ok(minesMult(10, 1) > minesMult(3, 1));
  const { room, ids } = setup(1);
  room.enterFloor(2);
  room.handle(ids[0], { t: 'table.sit', id: 'mines-0' });
  const pot0 = room.pot;
  room.handle(ids[0], { t: 'table.start', id: 'mines-0', payload: { bet: 200, mines: 3 } });
  room.handle(ids[0], { t: 'table.leave' });
  assert.equal(room.pot, pot0); // kein Feld geöffnet → Einsatz zurück
  assert.equal(room.players.get(ids[0]).seat, null);
  room.handle(ids[0], { t: 'table.sit', id: 'mines-0' });
  room.handle(ids[0], { t: 'table.start', id: 'mines-0', payload: { bet: 200, mines: 3 } });
  const t = room.session.tables['mines-0'];
  const safe = [...Array(25).keys()].find(i => !t.secret.mines.includes(i));
  room.handle(ids[0], { t: 'table.action', id: 'mines-0', action: `pick:${safe}` });
  const mult = t.state.mult;
  room.handle(ids[0], { t: 'table.leave' });
  assert.equal(room.pot, pot0 - 200 + Math.floor(200 * mult));
  teardown(room);
});

test('Disconnect während Dragon Tower / Penguin: kein Geldverlust durch Abbruch, Tisch wird frei', () => {
  const { room, ids } = setup(2);
  room.enterFloor(9);
  room.pot = 1_000_000;
  const bt = floorDef(9).limits.tower.min, bp = floorDef(9).limits.penguin.min;
  room.handle(ids[0], { t: 'table.sit', id: 'tower-0' });
  room.handle(ids[0], { t: 'table.start', id: 'tower-0', payload: { bet: bt, mode: 'easy' } });
  room.handle(ids[1], { t: 'table.sit', id: 'penguin-0' });
  room.handle(ids[1], { t: 'table.start', id: 'penguin-0', payload: { bet: bp, mode: 'easy' } });
  assert.equal(room.pot, 1_000_000 - bt - bp);
  room.leave(ids[0]);
  room.leave(ids[1]);
  assert.equal(room.pot, 1_000_000);
  assert.equal(room.session.tables['tower-0'].occupant, null);
  assert.equal(room.session.tables['tower-0'].busy, false);
  teardown(room);
});

test('Plinko-Pfad bestimmt das Fach; Money Wheel und Duck Race: Ergebnis steht fest, Gewinner-Ente kommt zuerst an', () => {
  const { room, ids } = setup(1);
  room.enterFloor(10);
  room.pot = 1e8;
  const B = g => floorDef(10).limits[g].min;
  room.handle(ids[0], { t: 'table.sit', id: 'plinko-0' });
  room.handle(ids[0], { t: 'table.start', id: 'plinko-0', payload: { bet: B('plinko'), risk: 'high' } });
  const ps = room.session.tables['plinko-0'].state;
  assert.equal(ps.slot, ps.path.reduce((a, b) => a + b, 0));
  assert.equal(ps.mult, PLINKO_PAYS.high[ps.slot]);
  const before = room.pot;
  tick(3600);
  assert.equal(room.pot, before + Math.floor(B('plinko') * ps.mult));
  room.handle(ids[0], { t: 'table.leave' });
  room.handle(ids[0], { t: 'table.sit', id: 'duck-0' });
  for (let i = 0; i < 10; i++) {
    room.handle(ids[0], { t: 'table.start', id: 'duck-0', payload: { bet: B('duck'), pick: i % 5 } });
    const d = room.session.tables['duck-0'].state;
    const finals = d.track.map(tr => tr[DUCK_STEPS - 1]);
    assert.equal(finals.indexOf(Math.max(...finals)), d.winner);
    tick(7800);
  }
  room.handle(ids[0], { t: 'table.leave' });
  room.handle(ids[0], { t: 'table.sit', id: 'moneywheel-0' });
  room.handle(ids[0], { t: 'table.start', id: 'moneywheel-0', payload: { bet: B('moneywheel') } });
  const w = room.session.tables['moneywheel-0'].state;
  const pot = room.pot;
  tick(6400);
  assert.equal(room.pot, pot + Math.floor(B('moneywheel') * MONEY_WHEEL[w.result]));
  teardown(room);
});

test('Keno & Street Craps: Treffer/Würfel stimmen mit der Auszahlung überein', () => {
  const { room, ids } = setup(1);
  room.enterFloor(11);
  room.pot = 1e8;
  const B = g => floorDef(11).limits[g].min;
  room.handle(ids[0], { t: 'table.sit', id: 'keno-0' });
  room.handle(ids[0], { t: 'table.start', id: 'keno-0', payload: { bet: B('keno'), picks: [1, 2, 3, 4, 5] } });
  const k = room.session.tables['keno-0'].state;
  assert.equal(k.drawn.length, 10);
  assert.equal(k.hits, k.drawn.filter(n => k.picks.includes(n)).length);
  tick(5000);
  room.handle(ids[0], { t: 'table.leave' });
  room.handle(ids[0], { t: 'table.sit', id: 'streetcraps-0' });
  const pot = room.pot;
  const b = B('streetcraps');
  room.handle(ids[0], { t: 'table.start', id: 'streetcraps-0', payload: { bet: b, pick: 'seven' } });
  const sc = room.session.tables['streetcraps-0'].state;
  tick(2800);
  const sum = sc.dice[0] + sc.dice[1];
  assert.equal(room.pot - pot, sum === 7 ? Math.floor(b * 5.6) - b : -b);
  teardown(room);
});
