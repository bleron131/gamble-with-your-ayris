// Prompt 12: kompakte, in Bereiche gegliederte Stockwerke – alle Stationen passen überschneidungsfrei
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutFloor } from '../src/client/world/layout.js';
import { floorTables } from '../src/shared/config.js';

const ov = (a, b) => a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;

for (const opts of [{ bar: false, vip: false }, { bar: true, vip: false }, { bar: true, vip: true }]) {
  test(`Layout aller 15 Stockwerke (${JSON.stringify(opts)})`, () => {
    for (let n = 1; n <= 15; n++) {
      const defs = floorTables(n);
      const L = layoutFloor(defs, opts);
      assert.ok(L, `Stock ${n}: kein Layout`);
      assert.equal(L.plan.length, defs.length, `Stock ${n}: alle Stationen platziert`);
      // kompakter als früher (alte Formel bis ~47 × 40 m), auch mit Terminals neben jeder Station
      assert.ok(L.W * L.D <= 1100, `Stock ${n}: Fläche ${L.W}×${L.D}`);
      for (const p of L.plan) {
        for (const r of [p.rect, p.standRect]) {
          assert.ok(r.x0 >= -L.W / 2 - 1e-6 && r.x1 <= L.W / 2 + 1e-6 && r.z0 >= -L.D / 2 - 1e-6 && r.z1 <= L.D / 2 + 1e-6, `Stock ${n}: ${p.def.id} ausserhalb`);
          for (const z of L.zones) assert.ok(!ov(r, z), `Stock ${n}: ${p.def.id} in Zone ${z.name}`);
        }
      }
      for (let i = 0; i < L.plan.length; i++) for (let j = i + 1; j < L.plan.length; j++) {
        const a = L.plan[i], b = L.plan[j];
        assert.ok(!ov(a.rect, b.rect) && !ov(a.rect, b.standRect) && !ov(b.rect, a.standRect), `Stock ${n}: ${a.def.id} ↔ ${b.def.id}`);
      }
      // Bereiche: Slots links, Tische in der Mitte, Eye-Catcher an der Rückwand
      const slot = L.plan.filter(p => p.def.type === 'slots'), center = L.plan.filter(p => p.center);
      assert.ok(slot.every(p => p.x < Math.min(...center.map(c => c.x))), `Stock ${n}: Slots links der Tische`);
      assert.ok(slot.some(p => p.line === 'slotA') && (slot.length < 2 || slot.some(p => p.line === 'slotB')), `Stock ${n}: Slot-Insel Rücken an Rücken`);
      for (const p of L.plan.filter(q => q.def.type === 'wheel')) assert.ok(p.wall, `Glücksrad an einer Wand (${p.line})`);
    }
  });
}
