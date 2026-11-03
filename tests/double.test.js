// Prompt 13: Double or Loss im Penthouse – echtes 50/50, Ayri000 gewinnt immer, Ergebnis nur einmal
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { rollDouble } from '../src/shared/dev.js';
import { rand, seedRandom } from '../src/shared/rng.js';

function fakeConn() {
  const msgs = [];
  return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), events: kind => msgs.filter(m => m.t === 'event' && m.ev.kind === kind).map(m => m.ev), errors: () => msgs.filter(m => m.t === 'error').map(m => m.msg) };
}
function setup(names, profile = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-DBL');
  const conns = [], ids = [];
  names.forEach((name, i) => { const c = fakeConn(); conns.push(c); ids.push(room.join(c, { name, ...(i === 0 ? profile : {}) })); });
  return { room, conns, ids };
}
const teardown = room => { room.destroy(); mock.timers.reset(); };
function toPenthouse(room, pot = 600_000_000) {
  room.scene = 'final';
  room.run.finalUnlocked = true;
  room.pot = pot;
  for (const p of room.players.values()) p.pose.p = [0, 0, -30];
}

test('Zufall: 10.000 Entscheidungen ergeben etwa 50 % DOUBLE und 50 % LOSS (echter Zufall, kein Seed)', () => {
  seedRandom(null); // kryptografischer Zufall wie im Spiel
  let green = 0;
  for (let i = 0; i < 10000; i++) if (rollDouble(false, rand) === 'green') green++;
  assert.ok(green > 4700 && green < 5300, `DOUBLE ${green}/10000`);
  // Ayri000: immer DOUBLE
  for (let i = 0; i < 1000; i++) assert.equal(rollDouble(true, rand), 'green');
  seedRandom(20261103);
});

test('Double or Loss über den Room: Gewinn verdoppelt exakt, Verlust = genau der Einsatz, Auszahlung nur einmal', () => {
  seedRandom(null);
  let wins = 0, losses = 0;
  for (let k = 0; k < 40; k++) {
    const { room, conns, ids } = setup(['P0']);
    toPenthouse(room, 123_456_789);
    room.handle(ids[0], { t: 'vote.start', type: 'double' });
    // Spam / zweiter Klick: kein zweites Würfeln
    room.handle(ids[0], { t: 'vote.start', type: 'double' });
    room.handle(ids[0], { t: 'vote.start', type: 'take' });
    assert.equal(conns[0].events('coin').length, 1);
    assert.equal(room.pot, 123_456_789, 'Pot ändert sich erst bei der Enthüllung');
    mock.timers.tick(7700);
    const res = conns[0].events('doubleResult');
    assert.equal(res.length, 1);
    if (res[0].result === 'green') { wins++; assert.equal(room.pot, 246_913_578); assert.equal(res[0].amount, 246_913_578); }
    else { losses++; assert.equal(room.pot, 0); }
    assert.equal(res[0].before, 123_456_789);
    mock.timers.tick(11000);
    assert.equal(room.scene, 'lobby');
    assert.equal(conns[0].events('doubleResult').length, 1);
    teardown(room);
  }
  assert.ok(wins > 5 && losses > 5, `${wins} Gewinne / ${losses} Verluste`);
  seedRandom(20261103);
});

test('Ayri000 gewinnt Double or Loss immer – andere Auslöser haben normale Chancen', () => {
  for (let k = 0; k < 20; k++) {
    const { room, conns, ids } = setup(['Ayri000']);
    toPenthouse(room);
    room.handle(ids[0], { t: 'vote.start', type: 'double' });
    mock.timers.tick(7700);
    assert.equal(conns[0].events('doubleResult')[0].result, 'green');
    assert.equal(room.pot, 1_200_000_000);
    teardown(room);
  }
  // Ein anderer Spieler löst aus (Ayri000 stimmt nur zu) → normale Chancen, Ayri000 beeinflusst sie nicht
  seedRandom(null);
  let losses = 0;
  for (let k = 0; k < 30; k++) {
    const { room, conns, ids } = setup(['Bleron', 'Ayri000']);
    toPenthouse(room);
    room.handle(ids[0], { t: 'vote.start', type: 'double' });
    room.handle(ids[1], { t: 'vote.cast', yes: true });
    mock.timers.tick(7700);
    if (conns[0].events('doubleResult')[0].result === 'red') losses++;
    teardown(room);
  }
  assert.ok(losses > 3, `Verluste ${losses}/30`);
  seedRandom(20261103);
});

test('Kein Neuwürfeln: gespeichertes Ergebnis wird beim Neuladen übernommen und schliesst den Run ab', () => {
  const { room, conns, ids } = setup(['P0'], { run: { id: 'run-x', pot: 500_000_000, finalUnlocked: true, startedAt: Date.now(), double: { result: 'red', before: 500_000_000 } } });
  assert.equal(room.run.double.result, 'red');
  mock.timers.tick(10);
  const res = conns[0].events('doubleResult');
  assert.equal(res.length, 1);
  assert.equal(res[0].result, 'red');
  assert.equal(room.scene, 'lobby');
  assert.notEqual(room.run.id, 'run-x', 'Run ist beendet – keine zweite Chance');
  assert.ok(!room.run.double);
  teardown(room);
  void ids;
});
