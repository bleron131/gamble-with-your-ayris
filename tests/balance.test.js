import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../scripts/balance.js';
import { GAMES } from '../src/shared/room.js';
import { luckChance } from '../src/shared/config.js';
import { seedRandom } from '../src/shared/rng.js';

// Party-Balancing: spürbar fairer als ein echtes Casino, aber Verlieren bleibt möglich.
for (const type of Object.keys(GAMES)) {
  test(`Balancing ${type}: Auszahlung leicht über 100 %, kein Dauergewinn`, () => {
    // Slots mit vielen Runden, damit seltene Jackpots den Mittelwert nicht verzerren
    // Fester Seed: das Ergebnis ist reproduzierbar (keine zufällig fehlschlagenden Deploys)
    seedRandom(20261102);
    const r = simulate(type, type.includes('slots') ? 120000 : 15000);
    seedRandom(null);
    assert.ok(r.rtp > 0.97 && r.rtp < 1.2, `RTP ${r.rtp}`);
    // Mines mit nur 1 Mine und wenigen Feldern ist bewusst sicher, aber kaum lohnend
    assert.ok(r.lossRate > (type === 'mines' ? 0.2 : 0.3), `Verlustquote ${r.lossRate}`);
    // Langschuss-Spiele (eine von 5 Enten, Glücksrad mit vielen 0×-Feldern) gewinnen naturgemäss seltener, aber höher
    const longShot = ['duck', 'moneywheel'].includes(type);
    assert.ok(r.winRate > (longShot ? 0.15 : 0.3), `Gewinnquote ${r.winRate}`);
    // Prompt 10: sehr lange Verlustserien werden selten (Ayri-Glück steigt schneller)
    assert.ok(r.maxLossRun < (longShot ? 40 : 30), `längste Pechsträhne ${r.maxLossRun}`);
  });
}

test('Ayri-Glück steigt mit der Pechsträhne und ist gedeckelt', () => {
  assert.ok(luckChance(0) < luckChance(5));
  assert.ok(luckChance(100) <= 0.55);
  assert.ok(luckChance(0) > 0 && luckChance(0) < 0.2);
});
