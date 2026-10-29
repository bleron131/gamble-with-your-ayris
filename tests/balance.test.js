import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../scripts/balance.js';
import { GAMES } from '../src/shared/room.js';
import { luckChance } from '../src/shared/config.js';

// Party-Balancing: spürbar fairer als ein echtes Casino, aber Verlieren bleibt möglich.
for (const type of Object.keys(GAMES)) {
  test(`Balancing ${type}: Auszahlung leicht über 100 %, kein Dauergewinn`, () => {
    const r = simulate(type, 15000);
    assert.ok(r.rtp > 0.97 && r.rtp < 1.2, `RTP ${r.rtp}`);
    assert.ok(r.lossRate > 0.3, `Verlustquote ${r.lossRate}`);
    assert.ok(r.winRate > 0.15, `Gewinnquote ${r.winRate}`);
  });
}

test('Ayri-Glück steigt mit der Pechsträhne und ist gedeckelt', () => {
  assert.ok(luckChance(0) < luckChance(5));
  assert.ok(luckChance(100) <= 0.4);
});
