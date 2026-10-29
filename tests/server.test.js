// End-to-End-Test des Multiplayer-Servers über echte WebSockets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import { START_CAPITAL } from '../src/shared/config.js';

const PORT = 18000 + Math.floor(Math.random() * 1000);

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', d => {
    const m = JSON.parse(d);
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  });
  return {
    ws, inbox,
    send: m => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 4000) => new Promise((res, rej) => {
      const hit = inbox.find(pred);
      if (hit) return res(hit);
      const w = { pred, res };
      waiters.push(w);
      setTimeout(() => rej(new Error('Timeout')), ms);
    }),
    open: () => once(ws, 'open'),
  };
}

test('Zwei Spieler: Join-Code, gemeinsamer Pot, Aufzug-Abstimmung, synchronisierte Wetten', async () => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  try {
    await new Promise(r => srv.stdout.on('data', d => { if (String(d).includes('läuft')) r(); }));
    const a = client(), b = client();
    await Promise.all([a.open(), b.open()]);
    a.send({ t: 'create', profile: { name: 'Anna' } });
    const wa = await a.wait(m => m.t === 'welcome');
    assert.match(wa.code, /^AYRI-\d{4}$/);
    b.send({ t: 'join', code: wa.code.replace('AYRI-', ''), profile: { name: 'Ben' } });
    const wb = await b.wait(m => m.t === 'welcome');
    assert.equal(wb.code, wa.code);
    const st = await a.wait(m => m.t === 'state' && m.state.players.length === 2);
    assert.deepEqual(st.state.players.map(p => p.name).sort(), ['Anna', 'Ben']);
    // Bewegungen werden weitergeleitet
    b.send({ t: 'move', p: [1, 0, 2], r: 0.5, a: 'walk' });
    const mv = await a.wait(m => m.t === 'moves' && m.moves[wb.you]);
    assert.deepEqual(mv.moves[wb.you].p, [1, 0, 2]);
    // Aufzug: braucht beide Stimmen
    a.send({ t: 'vote.start', type: 'travel', data: { floor: 1 } });
    await b.wait(m => m.t === 'state' && m.state.vote?.type === 'travel');
    b.send({ t: 'vote.cast', yes: true });
    await a.wait(m => m.t === 'event' && m.ev.kind === 'scene' && m.ev.scene === 'floor');
    await b.wait(m => m.t === 'event' && m.ev.kind === 'scene' && m.ev.scene === 'floor');
    // Beide setzen sich an Slots und setzen gleichzeitig
    a.send({ t: 'table.sit', id: 'slots-0' });
    b.send({ t: 'table.sit', id: 'slots-1' });
    a.send({ t: 'table.start', id: 'slots-0', payload: { bet: 100, lines: 5 } });
    b.send({ t: 'table.start', id: 'slots-1', payload: { bet: 50, lines: 5 } });
    const betSeen = await b.wait(m => m.t === 'event' && m.ev.kind === 'bet' && m.ev.name === 'Anna');
    assert.equal(betSeen.ev.amount, 100);
    const potState = await a.wait(m => m.t === 'state' && m.state.pot === START_CAPITAL - 150);
    assert.ok(potState);
    const res = await b.wait(m => m.t === 'event' && m.ev.kind === 'result' && m.ev.name === 'Anna', 5000);
    assert.equal(res.ev.stake, 100);
    a.ws.close(); b.ws.close();
  } finally {
    srv.kill();
  }
});
