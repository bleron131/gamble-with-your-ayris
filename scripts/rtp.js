// Exakte RTP-Berechnung für Slots, Glücksrad und Roulette (Balancing-Hilfe).
import { VARIANTS, lineWin } from '../src/shared/games/slots.js';
import { WHEEL_SEGMENTS, WHEEL_PAYS } from '../src/shared/games/wheel.js';
import { FLOORS, fmtMoney } from '../src/shared/config.js';

for (const [name, v] of Object.entries(VARIANTS)) {
  const n = v.strip.length;
  let ev = 0, hits = 0, jp = 0;
  for (const a of v.strip) for (const b of v.strip) for (const c of v.strip) {
    const m = lineWin(v, [a, b, c]);
    ev += m;
    if (m > 0) hits++;
    if (a === 6 && b === 6 && c === 6) jp++;
  }
  const tot = n ** 3;
  console.log(`Slots ${name}: RTP ${(ev / tot * 100).toFixed(2)}%  Trefferquote/Linie ${(hits / tot * 100).toFixed(1)}%  Jackpot 1/${Math.round(tot / jp)}`);
}

const segs = WHEEL_SEGMENTS.length;
for (const [k, mult] of Object.entries(WHEEL_PAYS)) {
  const cnt = WHEEL_SEGMENTS.filter(s => s === k).length;
  console.log(`Rad ${k}: ${cnt}/${segs} RTP ${(cnt * (mult + 1) / segs * 100).toFixed(2)}%`);
}

console.log('\nStockwerke:');
for (const f of FLOORS) {
  console.log(`${String(f.n).padStart(2)} ${f.name.padEnd(26)} Ziel ${fmtMoney(f.target).padStart(14)}  ` +
    Object.entries(f.limits).map(([g, l]) => `${g} ${fmtMoney(l.min)}-${fmtMoney(l.max)}`).join(' | '));
}
