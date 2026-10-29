import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as Save from '../src/client/save.js';
import { Room } from '../src/shared/room.js';

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
  const ids = [0, 1].map(i => room.join({ send: m => msgs[i].push(JSON.parse(JSON.stringify(m))) }, { name: 'P' + i }));
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
