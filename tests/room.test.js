import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/shared/room.js';
import { floorDef, START_CAPITAL, slotSteps } from '../src/shared/config.js';
import { winTier, spin } from '../src/shared/games/slots.js';
import { bestHand, compareScore } from '../src/shared/games/poker.js';
import { handTotal } from '../src/shared/games/blackjack.js';
import { playCoup } from '../src/shared/games/baccarat.js';

function fakeConn() {
  const msgs = [];
  return { msgs, send: m => msgs.push(JSON.parse(JSON.stringify(m))), errors: () => msgs.filter(m => m.t === 'error').map(m => m.msg) };
}

function setup(players = 2, campaign) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
  const room = new Room('AYRI-0001');
  const conns = [];
  const ids = [];
  for (let i = 0; i < players; i++) {
    const c = fakeConn();
    conns.push(c);
    ids.push(room.join(c, { name: 'P' + i, campaign: i === 0 ? campaign : undefined }));
  }
  return { room, conns, ids };
}

function teardown(room) { room.destroy(); mock.timers.reset(); }

test('Team-Pot: zwei gleichzeitige Einsätze desselben Betrags → nur einer wird akzeptiert', () => {
  const { room, conns, ids } = setup(2, { unlocked: 2 });
  room.enterFloor(2);
  room.pot = 10_000;
  room.handle(ids[0], { t: 'table.sit', id: 'roulette-0' });
  // Spieler A setzt $10'000 auf Rot, Spieler B drückt gleichzeitig SPIN am Automaten (Pot ist danach leer)
  room.handle(ids[0], { t: 'table.start', id: 'roulette-0', payload: { bets: [{ spot: 'red', amount: 10_000 }] } });
  room.handle(ids[1], { t: 'slot.spin', id: 'slots-0' });
  assert.equal(room.pot, 0);
  assert.equal(room.session.tables['slots-0'].busy, false);
  assert.ok(conns[1].errors().some(e => e.includes('Nicht genug')));
  teardown(room);
});

test('Einsätze werden sofort abgebucht und Gewinne nach der Animation gutgeschrieben', () => {
  const { room, ids } = setup(1);
  room.enterFloor(1);
  const bet = room.session.tables['slots-0'].state.bet;
  room.handle(ids[0], { t: 'slot.spin', id: 'slots-0' });
  assert.equal(room.pot, START_CAPITAL - bet);
  assert.equal(room.session.tables['slots-0'].busy, true);
  mock.timers.tick(3000);
  assert.equal(room.session.tables['slots-0'].busy, false);
  assert.ok(room.pot >= START_CAPITAL - bet);
  teardown(room);
});

test('Ziel erreicht → Level bleibt abgeschlossen, auch wenn der Pot wieder fällt; Pot wird übernommen', () => {
  const { room, ids, conns } = setup(1);
  room.enterFloor(1);
  room.pot = 9_990;
  room.handle(ids[0], { t: 'table.sit', id: 'slots-0' });
  // Gewinn simulieren
  room.settle(ids[0], room.session.tables['slots-0'], { stake: 0, payout: 2_510 });
  assert.equal(room.pot, 12_500);
  assert.ok(room.campaign.completed.includes(1));
  assert.equal(room.campaign.unlocked, 2);
  assert.ok(conns[0].msgs.some(m => m.t === 'reward' && m.floor === 1));
  // Weitergamblen & verlieren
  room.pot = 7_000;
  room.leaveFloor('return');
  assert.ok(room.campaign.completed.includes(1));
  assert.equal(room.campaign.unlocked, 2);
  room.enterFloor(2);
  assert.equal(room.session.entryPot, 7_000);
  assert.equal(room.pot, 7_000);
  teardown(room);
});

test('Kein Dildo-Farming: Belohnung pro Stockwerk nur einmal', () => {
  const { room, ids, conns } = setup(1);
  for (let i = 0; i < 3; i++) {
    room.enterFloor(1);
    room.pot = 20_000;
    room.checkTarget();
    room.leaveFloor('return');
  }
  assert.equal(conns[0].msgs.filter(m => m.t === 'reward' && m.floor === 1).length, 1);
  assert.equal(conns[0].msgs.filter(m => m.t === 'reward' && m.challenge === 1).length, 1);
  teardown(room);
});

test('Bankrott → Mafia → zurück in die Shishabar mit komplett neuem Run', () => {
  const { room, ids, conns } = setup(1, { unlocked: 3, completed: [1, 2] });
  room.pot = 40_000;
  room.enterFloor(3);
  room.pot = 10; // unter Mindesteinsatz
  room.checkBankrupt();
  assert.ok(conns[0].msgs.some(m => m.t === 'event' && m.ev.kind === 'mafia' && m.ev.runLost));
  mock.timers.tick(11_000);
  assert.equal(room.scene, 'lobby');
  assert.equal(room.pot, START_CAPITAL);
  assert.equal(room.campaign.unlocked, 1);
  assert.deepEqual(room.campaign.completed, []);
  teardown(room);
});

test('Mafia Briefcase rettet einmalig', () => {
  const { room, ids } = setup(1, { unlocked: 3 });
  room.handle(ids[0], { t: 'loadout', items: ['briefcase'], inventory: { briefcase: 1 } });
  room.pot = 40_000;
  room.enterFloor(3);
  room.pot = 10;
  room.checkBankrupt();
  assert.equal(room.scene, 'floor');
  assert.ok(room.pot >= floorDef(3).minBet);
  assert.equal(room.players.get(ids[0]).inventory.briefcase, 0);
  teardown(room);
});

test('Double or Loss braucht alle Spieler', () => {
  const { room, ids } = setup(2);
  room.scene = 'final';
  room.pot = 600_000_000;
  for (const p of room.players.values()) p.pose.p = [0, 0, -30];
  room.handle(ids[0], { t: 'vote.start', type: 'double' });
  assert.ok(room.vote);
  assert.equal(room.finalBusy, false);
  room.handle(ids[1], { t: 'vote.cast', yes: true });
  assert.equal(room.vote, null);
  assert.equal(room.finalBusy, true);
  mock.timers.tick(8000);
  assert.ok(room.pot === 1_200_000_000 || room.pot === 0);
  mock.timers.tick(11000);
  assert.equal(room.scene, 'lobby');
  assert.equal(room.pot, START_CAPITAL);
  teardown(room);
});

test('Stockwerk-Wechsel per Aufzug erfordert Freischaltung', () => {
  const { room, ids, conns } = setup(1);
  room.handle(ids[0], { t: 'vote.start', type: 'travel', data: { floor: 5 } });
  assert.equal(room.scene, 'lobby');
  assert.ok(conns[0].errors().some(e => e.includes('gesperrt')));
  room.handle(ids[0], { t: 'vote.start', type: 'travel', data: { floor: 1 } });
  assert.equal(room.scene, 'floor');
  teardown(room);
});

test('Blackjack-Runde läuft vollständig durch', () => {
  const { room, ids } = setup(1, { unlocked: 4 });
  room.pot = 50_000;
  room.enterFloor(4);
  room.handle(ids[0], { t: 'table.sit', id: 'blackjack-0' });
  for (let i = 0; i < 30; i++) {
    room.handle(ids[0], { t: 'table.start', id: 'blackjack-0', payload: { bet: 500 } });
    for (let k = 0; k < 6 && room.session.tables['blackjack-0'].state.phase === 'player'; k++)
      room.handle(ids[0], { t: 'table.action', id: 'blackjack-0', action: handTotal(room.session.tables['blackjack-0'].state.hands[room.session.tables['blackjack-0'].state.active].cards).total < 15 ? 'hit' : 'stand' });
    for (let k = 0; k < 30; k++) mock.timers.tick(500);
    assert.equal(room.session.tables['blackjack-0'].busy, false);
    assert.equal(room.session.tables['blackjack-0'].state.phase, 'done');
  }
  teardown(room);
});

test('Poker-Handbewertung', () => {
  const c = (r, s) => ({ r, s });
  const royal = bestHand([c(1, 0), c(13, 0), c(12, 0), c(11, 0), c(10, 0), c(2, 1), c(3, 2)]);
  assert.equal(royal[0], 9);
  const wheel = bestHand([c(1, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 0), c(9, 1), c(13, 2)]);
  assert.deepEqual(wheel.slice(0, 2), [4, 5]);
  const fh = bestHand([c(3, 0), c(3, 1), c(3, 2), c(9, 3), c(9, 0), c(1, 1), c(13, 2)]);
  assert.equal(fh[0], 6);
  assert.ok(compareScore(royal, fh) > 0);
});

test('Baccarat-Ergebnisse sind gültig', () => {
  const deck = [];
  for (let i = 0; i < 1000; i++) deck.push({ r: (i % 13) + 1, s: i % 4 });
  for (let i = 0; i < 100; i++) {
    const coup = playCoup(() => deck[Math.floor(Math.random() * deck.length)]);
    assert.ok(coup.player.length >= 2 && coup.player.length <= 3);
    assert.ok(['player', 'banker', 'tie'].includes(coup.winner));
  }
});

// ───────────────────────── Begehbare Spielautomaten ─────────────────────────
test('Automat: BET −/+ wechselt durch die Stockwerk-Stufen, jeder Automat hat seinen eigenen Einsatz', () => {
  const { room, ids } = setup(1);
  room.enterFloor(1);
  const steps = slotSteps(1, 'slots');
  assert.ok(steps.length >= 4 && steps[0] === floorDef(1).limits.slots.min && steps.at(-1) === floorDef(1).limits.slots.max);
  const t0 = room.session.tables['slots-0'], t1 = room.session.tables['slots-1'];
  assert.notEqual(t0.state.bet, t1.state.bet);
  const i = steps.indexOf(t0.state.bet);
  room.handle(ids[0], { t: 'slot.bet', id: 'slots-0', dir: 1 });
  assert.equal(t0.state.bet, steps[i + 1]);
  room.handle(ids[0], { t: 'slot.bet', id: 'slots-0', dir: -1 });
  room.handle(ids[0], { t: 'slot.bet', id: 'slots-0', dir: -1 });
  assert.equal(t0.state.bet, steps[i - 1]);
  for (let k = 0; k < 30; k++) room.handle(ids[0], { t: 'slot.bet', id: 'slots-0', dir: 1 });
  assert.equal(t0.state.bet, steps.at(-1));
  assert.equal(t1.state.bet, steps[Math.min(steps.length - 1, Math.floor(steps.length * 0.3) + 1)]);
  teardown(room);
});

test('Automat: während der Drehung kann niemand den Einsatz ändern oder erneut drehen', () => {
  const { room, ids, conns } = setup(2);
  room.enterFloor(1);
  const t = room.session.tables['slots-0'];
  const bet = t.state.bet;
  room.handle(ids[0], { t: 'slot.spin', id: 'slots-0' });
  room.handle(ids[0], { t: 'slot.bet', id: 'slots-0', dir: 1 });
  room.handle(ids[0], { t: 'slot.spin', id: 'slots-0' });
  room.handle(ids[1], { t: 'slot.spin', id: 'slots-0' });
  room.handle(ids[1], { t: 'slot.bet', id: 'slots-0', dir: 1 });
  assert.equal(t.state.bet, bet);
  assert.equal(room.pot, START_CAPITAL - bet);
  assert.ok(conns[1].errors().some(e => e.includes('dreht gerade')));
  mock.timers.tick(3000);
  assert.equal(t.busy, false);
  assert.equal(t.occupant, null);
  // Kurz danach hält P0 den Automaten noch – P1 wird freundlich abgewiesen
  room.handle(ids[1], { t: 'slot.bet', id: 'slots-0', dir: 1 });
  assert.equal(t.state.bet, bet);
  assert.ok(conns[1].errors().some(e => e.includes('spielt gerade')));
  mock.timers.tick(4500);
  room.handle(ids[1], { t: 'slot.bet', id: 'slots-0', dir: 1 });
  assert.notEqual(t.state.bet, bet);
  teardown(room);
});

test('Automaten: mehrere Geräte drehen gleichzeitig, der Pot wird beim Start reserviert und nie negativ', () => {
  const { room, ids, conns } = setup(2);
  room.enterFloor(1);
  const ts = room.session.tables;
  for (const id of ['slots-0', 'slots-1', 'slots-2']) ts[id].state.bet = 1000;
  room.pot = 2500;
  // Zwei Spieler gleichzeitig an verschiedenen Automaten, P0 zusätzlich an einem dritten
  room.handle(ids[0], { t: 'slot.spin', id: 'slots-0' });
  room.handle(ids[1], { t: 'slot.spin', id: 'slots-1' });
  room.handle(ids[0], { t: 'slot.spin', id: 'slots-2' });
  assert.equal(ts['slots-0'].busy, true);
  assert.equal(ts['slots-1'].busy, true);
  assert.equal(ts['slots-2'].busy, false);
  assert.equal(room.pot, 500);
  assert.ok(conns[0].errors().some(e => e.includes('Nicht genug')));
  assert.equal(ts['slots-0'].state.spinner, ids[0]);
  assert.equal(ts['slots-1'].state.spinnerName, 'P1');
  const results = () => conns[0].msgs.filter(m => m.t === 'event' && m.ev.kind === 'result');
  mock.timers.tick(3000);
  assert.equal(results().length, 2);
  const paid = results().reduce((s, m) => s + m.ev.payout, 0);
  assert.equal(room.pot, 500 + paid);
  for (const r of results()) assert.ok(['loss', 'small', 'medium', 'big', 'mega', 'jackpot'].includes(r.ev.tier));
  teardown(room);
});

test('Automaten: Spieler werden nicht an einen Automaten gesetzt, Spin-Ergebnis wird an alle gesendet', () => {
  const { room, ids, conns } = setup(2);
  room.enterFloor(1);
  room.handle(ids[0], { t: 'table.sit', id: 'slots-0' });
  assert.equal(room.players.get(ids[0]).seat, null);
  room.handle(ids[0], { t: 'slot.spin', id: 'slots-0' });
  mock.timers.tick(30);
  const st = conns[1].msgs.filter(m => m.t === 'state').at(-1).state;
  assert.equal(st.session.tables['slots-0'].state.phase, 'spinning');
  assert.equal(st.session.tables['slots-0'].state.stops.length, 3);
  mock.timers.tick(3000);
  assert.ok(conns[1].msgs.some(m => m.t === 'event' && m.ev.kind === 'result' && m.ev.tableId === 'slots-0'));
  teardown(room);
});

test('Gewinnstufen: klein, mittel, gross, mega, Jackpot', () => {
  assert.equal(winTier(-500, 500), 'loss');
  assert.equal(winTier(500, 500), 'small');
  assert.equal(winTier(1500, 500), 'medium');
  assert.equal(winTier(5000, 500), 'big');
  assert.equal(winTier(15000, 500), 'mega');
  assert.equal(winTier(1, 500, true), 'jackpot');
});

test('Slots: ein Treffer bringt mindestens das Doppelte des Einsatzes zurück', () => {
  let hits = 0;
  for (let i = 0; i < 20000; i++) {
    const r = spin('normal', 1000, 5, 1);
    if (r.payout > 0) { hits++; assert.ok(r.payout >= 2000, `Auszahlung ${r.payout}`); }
  }
  assert.ok(hits > 3000 && hits < 7000, `Treffer ${hits}`);
});

test('Sprung: natürlicher Bogen, kein Luft- oder Doppelsprung, neuer Sprung erst nach Bodenkontakt', async () => {
  const { Jumper, JUMP } = await import('../src/client/jump.js');
  const j = new Jumper();
  assert.equal(j.tryJump(), true);
  let peak = 0, t = 0, landed = false;
  assert.equal(j.tryJump(), false); // kein Doppelsprung direkt nach dem Absprung
  while (t < 2 && !landed) {
    landed = j.step(1 / 30) === 'land';
    t += 1 / 30;
    peak = Math.max(peak, j.y);
    if (!landed) assert.equal(j.tryJump(), false); // kein Sprung in der Luft
  }
  assert.ok(landed, 'landet wieder');
  const expectedPeak = JUMP.v0 ** 2 / (2 * JUMP.gravity);
  assert.ok(Math.abs(peak - expectedPeak) < 0.05, `Höhe ${peak}`);
  assert.ok(t > 0.5 && t < 0.7, `Flugzeit ${t}`);
  assert.equal(j.y, 0);
  assert.equal(j.tryJump(), false); // Bunny-Hop gesperrt: direkt nach der Landung noch nicht
  j.step(JUMP.minGround + 0.01);
  assert.equal(j.tryJump(), true);
  // Grosse Bildzeit-Sprünge (Ruckler) dürfen nicht durch den Boden fallen
  j.step(0.5);
  assert.ok(j.y >= 0);
});

// ───────────────────────── Roulette: vorbereitete Wetten & Rebet ─────────────────────────
test('Roulette: Chips setzen bucht nichts ab, SPIN bucht den Total Bet ab, Chips bleiben für den nächsten Spin liegen', () => {
  const { room, ids, conns } = setup(2, { unlocked: 2 });
  room.enterFloor(2);
  room.pot = 100_000;
  const t = room.session.tables['roulette-0'];
  room.handle(ids[0], { t: 'table.sit', id: 'roulette-0' });
  const edit = (who, e) => room.handle(ids[who], { t: 'table.edit', id: 'roulette-0', edit: e });
  edit(0, { op: 'add', spot: 'red', amount: 5000 });
  edit(0, { op: 'add', spot: 'n17', amount: 500 });
  edit(0, { op: 'add', spot: 'n17', amount: 500 });
  edit(0, { op: 'add', spot: 'even', amount: 2000 });
  edit(0, { op: 'add', spot: 'n8', amount: 500 });
  edit(1, { op: 'add', spot: 'black', amount: 5000 }); // Zuschauer darf nichts verändern
  assert.deepEqual(t.state.prepared, { red: 5000, n17: 1000, even: 2000, n8: 500 });
  assert.equal(room.pot, 100_000);
  edit(0, { op: 'undo' });
  assert.equal(t.state.prepared.n8, undefined);
  edit(0, { op: 'remove', spot: 'n17', amount: 500 });
  assert.equal(t.state.prepared.n17, 500);
  edit(0, { op: 'add', spot: 'n17', amount: 500 });
  // SPIN: 8'000 werden genau einmal abgebucht
  room.handle(ids[0], { t: 'table.start', id: 'roulette-0', payload: {} });
  assert.equal(room.pot, 92_000);
  assert.equal(t.busy, true);
  // Während die Kugel rollt: keine Änderungen, kein zweiter Spin
  edit(0, { op: 'add', spot: 'odd', amount: 1000 });
  room.handle(ids[0], { t: 'table.start', id: 'roulette-0', payload: {} });
  assert.equal(room.pot, 92_000);
  assert.equal(t.state.prepared.odd, undefined);
  assert.ok(conns[0].errors().some(e => e.includes('rollt')));
  mock.timers.tick(9000);
  const res = conns[0].msgs.filter(m => m.t === 'event' && m.ev.kind === 'result').at(-1).ev;
  assert.equal(res.stake, 8000);
  assert.equal(typeof res.roulette, 'number');
  assert.equal(room.pot, 92_000 + res.payout);
  // Rebet: dieselben Chips liegen noch, nächster SPIN bucht erneut 8'000 ab
  assert.deepEqual(t.state.prepared, { red: 5000, n17: 1000, even: 2000 });
  const before = room.pot;
  room.handle(ids[0], { t: 'table.start', id: 'roulette-0', payload: {} });
  assert.equal(room.pot, before - 8000);
  mock.timers.tick(9000);
  edit(0, { op: 'clear' });
  assert.deepEqual(t.state.prepared, {});
  edit(0, { op: 'undo' });
  assert.equal(t.state.prepared.red, 5000);
  teardown(room);
});

test('Roulette: nicht genug im Pot → kein Spin, nichts abgebucht; Aufstehen räumt die Chips ab', () => {
  const { room, ids, conns } = setup(1, { unlocked: 2 });
  room.enterFloor(2);
  room.pot = 3000;
  const t = room.session.tables['roulette-0'];
  room.handle(ids[0], { t: 'table.sit', id: 'roulette-0' });
  room.handle(ids[0], { t: 'table.edit', id: 'roulette-0', edit: { op: 'add', spot: 'red', amount: 5000 } });
  room.handle(ids[0], { t: 'table.start', id: 'roulette-0', payload: {} });
  assert.equal(room.pot, 3000);
  assert.equal(t.busy, false);
  assert.ok(conns[0].errors().some(e => e.includes('Nicht genug')));
  room.handle(ids[0], { t: 'table.leave' });
  assert.deepEqual(t.state.prepared, {});
  teardown(room);
});

test('Roulette: Split, Street, Corner und Six Line werden geprüft und richtig ausgezahlt', async () => {
  const { isValidSpot, payoutFor, insideSpot } = await import('../src/shared/games/roulette.js');
  for (const s of ['i:17-20', 'i:17-18', 'i:1-2-3', 'i:1-2-4-5', 'i:31-32-33-34-35-36']) assert.ok(isValidSpot(s), s);
  for (const s of ['i:3-4', 'i:1-5', 'i:2-3-4', 'i:3-4-6-7', 'i:34-35-36-37', 'i:2-1', 'x']) assert.ok(!isValidSpot(s), s);
  assert.equal(insideSpot([20, 17]), 'i:17-20');
  assert.equal(payoutFor('i:17-20', 100, 20), 1800);
  assert.equal(payoutFor('i:1-2-3', 100, 2), 1200);
  assert.equal(payoutFor('i:1-2-4-5', 100, 5), 900);
  assert.equal(payoutFor('i:1-2-3-4-5-6', 100, 6), 600);
  assert.equal(payoutFor('i:1-2-3-4-5-6', 100, 7), 0);
});

// ───────────────────────── Run-Reset (Prompt 5) ─────────────────────────
const lastState = c => c.msgs.filter(m => m.t === 'state').at(-1).state;

test('Run: neuer Run startet mit $7\'500, nur Stock 1 offen; Stock 1 abschliessen schaltet Stock 2 frei', () => {
  const { room, ids, conns } = setup(1);
  assert.equal(room.pot, START_CAPITAL);
  assert.equal(room.campaign.unlocked, 1);
  assert.deepEqual(room.campaign.completed, []);
  assert.match(room.run.id, /^run_/);
  room.handle(ids[0], { t: 'vote.start', type: 'travel', data: { floor: 2 } });
  assert.notEqual(room.scene, 'floor');
  assert.ok(conns[0].errors().some(e => e.includes('gesperrt')));
  room.enterFloor(1);
  room.pot = 10_000;
  room.checkTarget();
  assert.equal(room.campaign.unlocked, 2);
  assert.deepEqual(room.campaign.completed, [1]);
  teardown(room);
});

test('Run verloren nach Stock 8: $7\'500, 0/15, nur Stock 1, neue Run-ID, alte Tischzustände weg, alle Spieler synchron', () => {
  const { room, ids, conns } = setup(2, { unlocked: 8, completed: [1, 2, 3, 4, 5, 6, 7] });
  room.pot = 2_300_000;
  const oldRun = room.run.id;
  room.enterFloor(8);
  const tables = room.session.tables;
  const rid = Object.keys(tables).find(k => k.startsWith('roulette'));
  room.handle(ids[0], { t: 'table.sit', id: rid });
  room.handle(ids[0], { t: 'table.edit', id: rid, edit: { op: 'add', spot: 'red', amount: floorDef(8).limits.roulette.min } });
  room.handle(ids[1], { t: 'item.arm', item: 'pokal' });
  room.pot = 1; // alles verloren
  room.handle(ids[0], { t: 'table.leave' });
  room.checkBankrupt();
  mock.timers.tick(11_000);
  mock.timers.tick(50);
  assert.equal(room.scene, 'lobby');
  assert.equal(room.session, null);
  assert.equal(room.pot, START_CAPITAL);
  assert.equal(room.campaign.unlocked, 1);
  assert.deepEqual(room.campaign.completed, []);
  assert.notEqual(room.run.id, oldRun);
  assert.equal(room.run.finalUnlocked, false);
  for (const p of room.players.values()) { assert.deepEqual(p.armed, {}); assert.equal(p.seat, null); }
  // Beide Spieler erhalten denselben neuen Run-Zustand
  for (const c of conns) {
    const st = lastState(c);
    assert.equal(st.pot, START_CAPITAL);
    assert.equal(st.campaign.unlocked, 1);
    assert.equal(st.campaign.completed.length, 0);
    assert.equal(st.run.id, room.run.id);
  }
  // Aufzug: Stockwerke 2–15 sind gesperrt
  for (const n of [2, 8, 15]) {
    room.handle(ids[0], { t: 'vote.start', type: 'travel', data: { floor: n } });
    assert.equal(room.vote, null);
  }
  // Permanente Rekorde bleiben (z. B. je abgeschlossene Stockwerke für Kosmetik)
  assert.deepEqual(room.campaign.everCompleted, [1, 2, 3, 4, 5, 6, 7]);
  // Neue Fortschritte gelten nur für diesen Run
  room.enterFloor(1);
  room.pot = 10_000;
  room.checkTarget();
  assert.equal(room.campaign.unlocked, 2);
  teardown(room);
});

test('Run verloren: keine 🍆-Belohnungen oder -Abzüge; nach normaler Rückkehr bleiben Stockwerke offen', () => {
  const { room, ids, conns } = setup(1, { unlocked: 5, completed: [1, 2, 3, 4] });
  room.pot = 300_000;
  room.enterFloor(5);
  room.pot = 600_000;
  room.checkTarget(); // Stock 5 geschafft → bis 6 frei
  room.handle(ids[0], { t: 'vote.start', type: 'return' });
  assert.equal(room.scene, 'lobby');
  assert.equal(room.campaign.unlocked, 6);
  assert.deepEqual(room.campaign.completed, [1, 2, 3, 4, 5]);
  assert.equal(room.pot, 600_000);
  // Altes Stockwerk erneut besuchen, ohne zu verlieren → nichts wird zurückgesetzt
  const runId = room.run.id;
  room.enterFloor(2);
  room.leaveFloor('return');
  assert.equal(room.campaign.unlocked, 6);
  assert.equal(room.run.id, runId);
  // Jetzt verlieren: 🍆 werden weder vergeben noch abgezogen (die liegen im Spielstand des Spielers)
  const rewardsBefore = conns[0].msgs.filter(m => m.t === 'reward' || m.t === 'itemConsumed').length;
  room.enterFloor(6);
  room.pot = 1;
  room.checkBankrupt();
  mock.timers.tick(11_000);
  assert.equal(conns[0].msgs.filter(m => m.t === 'reward' || m.t === 'itemConsumed').length, rewardsBefore);
  assert.equal(room.campaign.unlocked, 1);
  teardown(room);
});

test('Spielstand: gespeicherter Run bringt seine Stockwerke mit, ein neuer Run (andere ID) übernimmt keine alten Stockwerke', () => {
  const { room } = setup(0);
  const c = fakeConn();
  room.join(c, { name: 'Host', campaign: { unlocked: 1, completed: [], everCompleted: [1, 2, 3] }, run: { id: 'run_abc', pot: 50_000, unlocked: 4, completed: [1, 2, 3] } });
  assert.equal(room.run.id, 'run_abc');
  assert.equal(room.pot, 50_000);
  assert.equal(room.campaign.unlocked, 4);
  room.newRun('mafia');
  assert.notEqual(room.run.id, 'run_abc');
  assert.equal(room.campaign.unlocked, 1);
  assert.deepEqual(room.campaign.completed, []);
  teardown(room);
});
