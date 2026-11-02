// Stockwerk-Bilanz: End-of-Level-Auswertung mit Geldverlauf pro Spieler (Liniendiagramm), Spielerkarten und Zusammenfassung.
// Die Daten kommen vom Server (Room.ledger) – jede Runde ist dem Spieler zugeordnet, der gesetzt hat.
import { h, clear } from './dom.js';
import { fmtMoney, fmtShort, GAME_NAMES, GAME_ICONS, ITEMS, FLOORS } from '../../shared/config.js';
import { sfx } from '../audio.js';

// Linienfarben pro Spieler in fester Reihenfolge (validierte kategoriale Palette für dunkle Flächen, max. 6 Spieler)
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmtMoney(Math.abs(v)).replace('-', '');
const gameName = g => GAME_NAMES[g] || (g === 'briefcase' ? 'Mafia Briefcase' : ITEMS[g]?.name) || g;
const gameIcon = g => GAME_ICONS[g] || (g === 'briefcase' ? '💼' : ITEMS[g]?.icon) || '';

export function openBalance(ui, b) {
  const app = ui.app;
  const L = b.ledger;
  const players = Object.values(L.players);
  // Reihenfolge = Beitrittsreihenfolge (fest) → Farbe folgt dem Spieler, nicht dem Rang
  players.forEach((p, i) => { p.color = SERIES[i % SERIES.length]; p.net = p.balance - p.start; });
  const byId = Object.fromEntries(players.map(p => [p.id, p]));
  const myReward = b.rewards?.[app.me];

  // ── Zusammenfassung ──
  const sorted = [...players].sort((a, c) => c.net - a.net);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  let topWin = null, topStake = null;
  for (const pt of L.points) {
    if (pt.net > 0 && (!topWin || pt.net > topWin.net)) topWin = pt;
    if (pt.stake > 0 && (!topStake || pt.stake > topStake.stake)) topStake = pt;
  }
  const rounds = players.reduce((a, p) => a + p.rounds, 0);
  const nameOf = id => byId[id]?.name || '?';

  const chartWrap = h('div.bchart');
  const tip = h('div.btip.hidden');
  chartWrap.append(tip);

  const cls = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const cards = h('div.bcards', ...players.map(p => h('div.bcard', { class: p.id === app.me ? 'me' : '' },
    h('div.bname', h('span.bsw', { style: { background: p.color } }), p.name, p.id === best?.id && players.length > 1 && p.net > 0 ? h('span.mvp', ' ⭐ MVP') : null),
    h('div.brow', h('span', 'Start'), h('b', fmtMoney(p.start))),
    h('div.brow', h('span', 'Einsatz gesamt'), h('b', fmtMoney(p.staked))),
    h('div.brow', h('span', 'Gewonnen'), h('b.pos', `+${fmtMoney(p.won)}`)),
    h('div.brow', h('span', 'Verloren'), h('b', { class: p.lost > 0 ? 'neg' : '' }, p.lost > 0 ? `−${fmtMoney(p.lost)}` : fmtMoney(0))),
    h('div.brow.bnet', h('span', 'Netto'), h('b', { class: cls(p.net) }, signed(p.net))),
    h('div.brow', h('span', 'Ende'), h('b', fmtMoney(p.balance))),
    b.rewards && p.id in b.rewards ? h('div.brew', b.rewards[p.id] > 0 ? `+${b.rewards[p.id]} 🍆` : '🍆 bereits erhalten') : null,
  )));

  const sumItem = (icon, label, value, sub) => h('div.bsum', h('div.bsi', icon), h('div', h('div.bsl', label), h('div.bsv', value), sub ? h('div.bss', sub) : null));
  const summary = h('div.bsums',
    sumItem('🏆', 'Grösster Gewinner', best ? best.name : '—', best ? signed(best.net) : ''),
    sumItem('💀', 'Grösster Verlierer', worst && players.length > 1 ? worst.name : worst?.net < 0 ? worst.name : '—', worst && (players.length > 1 || worst.net < 0) ? signed(worst.net) : ''),
    sumItem('💰', 'Höchster Einzelgewinn', topWin ? `+${fmtMoney(topWin.net)}` : '—', topWin ? `${nameOf(topWin.pid)} · ${gameName(topWin.game)}` : ''),
    sumItem('🔥', 'Grösster Einsatz', topStake ? fmtMoney(topStake.stake) : '—', topStake ? `${nameOf(topStake.pid)} · ${gameName(topStake.game)}` : ''),
    sumItem('🎰', 'Gespielte Runden', String(rounds), ''),
    players.length > 1 && best?.net > 0 ? sumItem('⭐', 'MVP des Stockwerks', best.name, `bestes Nettoergebnis ${signed(best.net)}`) : null,
  );

  // Tabellenansicht der Datenpunkte (Barrierefreiheit: Werte auch ohne Farbe/Diagramm lesbar)
  const table = h('details.btable', h('summary', `Alle ${L.points.length} Runden als Tabelle`),
    h('div.btscroll', h('table',
      h('thead', h('tr', ...['#', 'Spieler', 'Spiel', 'Einsatz', 'Ergebnis', 'Stand'].map(t => h('th', t)))),
      h('tbody', ...L.points.slice(-300).map(pt => h('tr',
        h('td', String(pt.i)), h('td', nameOf(pt.pid)), h('td', `${gameIcon(pt.game)} ${gameName(pt.game)}`),
        h('td', fmtMoney(pt.stake)), h('td', { class: cls(pt.net) }, signed(pt.net)), h('td', fmtMoney(pt.bal))))))));

  const n = b.floor;
  const canNext = !b.last && n < FLOORS.length;
  const actions = h('div.actions.bactions',
    canNext
      ? h('button.primary.big', { onclick: () => { sfx.click(); ui.closeModal(); app.send({ t: 'vote.start', type: 'next' }); } }, 'WEITER ZUM NÄCHSTEN STOCKWERK')
      : app.finale?.runId === app.state?.run?.id
        ? h('button.primary.big', { onclick: () => { sfx.click(); ui.closeModal(); openRunBalance(ui, app.finale); } }, 'WEITER ZUR RUN-BILANZ')
        : h('button.primary.big', { onclick: () => { sfx.click(); ui.closeModal(); app.send({ t: 'vote.start', type: 'return' }); } }, 'WEITER ZUR SHISHABAR'),
    canNext ? h('button.big', { onclick: () => { sfx.click(); ui.closeModal(); app.send({ t: 'vote.start', type: 'return' }); } }, 'Zur Shishabar') : null,
    h('button.big', { onclick: () => { sfx.click(); ui.closeModal(); ui.toast('Weitergamblen – das Stockwerk bleibt abgeschlossen!', 'info'); } }, 'Hier weiterspielen'),
  );

  ui.openModal(h('div.balance',
    h('div.bhead',
      h('h2.btitle', `STOCKWERK ${n} – BILANZ`),
      h('div.btarget', `Ziel erreicht: ${fmtMoney(b.target)}`, h('span.bfloor', ` · ${b.name}`)),
      myReward !== undefined ? h('div.breward', { class: myReward > 0 ? 'new' : 'old' }, myReward > 0 ? `Stockwerk geschafft! +${myReward} 🍆` : 'Stockwerk geschafft! (🍆 für dieses Stockwerk bereits erhalten)') : null,
      b.last ? h('div.bfinal', '💰 DAS SPIEL IST GESCHAFFT! Im Aufzug wartet etwas Geheimes: ???') : null,
    ),
    chartWrap,
    cards,
    summary,
    table,
    actions,
  ), 'wide balancemodal');
  requestAnimationFrame(() => drawChart(chartWrap, tip, players, L));
  sfx.bigWin?.();
}

// ── Liniendiagramm: x = Reihenfolge der Runden auf dem Stockwerk, y = Kontostand; eine Linie pro Spieler ──
function drawChart(wrap, tip, players, L) {
  const W = Math.max(320, wrap.clientWidth || 860), H = Math.max(170, Math.min(340, Math.round(W * 0.38), Math.round(window.innerHeight * 0.48)));
  const pad = { l: 96, r: 92, t: 14, b: 26 };
  const series = players.map(p => ({ p, pts: [{ i: 0, bal: p.start, net: 0, game: null }, ...L.points.filter(pt => pt.pid === p.id)] }));
  const maxI = Math.max(1, L.seq);
  let lo = Infinity, hi = -Infinity;
  for (const s of series) for (const pt of s.pts) { lo = Math.min(lo, pt.bal); hi = Math.max(hi, pt.bal); }
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo = Math.max(0, lo - span * 0.08); hi += span * 0.08;
  const X = i => pad.l + (i / maxI) * (W - pad.l - pad.r);
  const Y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Geldverlauf pro Spieler auf diesem Stockwerk' });
  // Raster & Achsen (zurückhaltend); bei kleiner Spanne volle Beträge statt gerundeter Kurzform
  const fine = (hi - lo) / Math.max(1, hi) < 0.15;
  for (let k = 0; k <= 4; k++) {
    const v = lo + (hi - lo) * k / 4, y = Y(v);
    root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'grid' }));
    const t = svg('text', { x: pad.l - 8, y: y + 4, class: 'ax', 'text-anchor': 'end' }); t.textContent = fine ? fmtMoney(Math.round(v)) : fmtShort(v); root.append(t);
  }
  const xl = svg('text', { x: pad.l, y: H - 6, class: 'ax' }); xl.textContent = 'Start'; root.append(xl);
  const xr = svg('text', { x: W - pad.r, y: H - 6, class: 'ax', 'text-anchor': 'end' }); xr.textContent = `Runde ${maxI}`; root.append(xr);
  // Linien (animiert von links nach rechts), Endpunkt-Beschriftung mit Namen
  const showMarkers = L.points.length <= 160;
  const labels = [];
  series.forEach((s, si) => {
    const d = s.pts.map((pt, k) => `${k ? 'L' : 'M'}${X(pt.i).toFixed(1)},${Y(pt.bal).toFixed(1)}`).join(' ');
    const path = svg('path', { d, class: 'line', stroke: s.p.color });
    root.append(path);
    const len = path.getTotalLength?.() || 2000;
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    path.style.animation = `bdraw 1.8s ${0.15 * si}s cubic-bezier(.4,0,.2,1) forwards`;
    if (showMarkers) for (const pt of s.pts.slice(1)) {
      const c = svg('circle', { cx: X(pt.i), cy: Y(pt.bal), r: 4, fill: s.p.color, class: 'mark' });
      c.style.animationDelay = `${0.6 + (pt.i / maxI) * 1.4 + 0.15 * si}s`;
      root.append(c);
    }
    const last = s.pts[s.pts.length - 1];
    // Gestrichelte Fortsetzung bis zur letzten Runde: der Endstand bleibt am rechten Rand ablesbar
    if (last.i < maxI) {
      const tail = svg('path', { d: `M${X(last.i).toFixed(1)},${Y(last.bal).toFixed(1)} L${X(maxI).toFixed(1)},${Y(last.bal).toFixed(1)}`, class: 'tail', stroke: s.p.color });
      tail.style.animationDelay = `${1.7 + 0.15 * si}s`;
      root.append(tail);
    }
    labels.push({ y: Y(last.bal), x: X(maxI), text: s.p.name, color: s.p.color, si });
  });
  // Direkte Beschriftung am Linienende (Kollisionen vertikal auseinanderschieben)
  labels.sort((a, c) => a.y - c.y);
  for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 14) labels[k].y = labels[k - 1].y + 14;
  for (const lb of labels) {
    const g = svg('g', { class: 'elabel' });
    g.style.animationDelay = `${1.7 + 0.15 * lb.si}s`;
    const dot = svg('circle', { cx: W - pad.r + 10, cy: lb.y, r: 4, fill: lb.color });
    const t = svg('text', { x: W - pad.r + 18, y: lb.y + 4, class: 'lbl' }); t.textContent = lb.text.length > 10 ? lb.text.slice(0, 9) + '…' : lb.text;
    g.append(dot, t);
    root.append(g);
  }
  // Hover: nächster Datenpunkt (Fadenkreuz + Tooltip: Spieler, Spiel, Stand, Veränderung)
  const cross = svg('line', { y1: pad.t, y2: H - pad.b, class: 'cross', visibility: 'hidden' });
  const ring = svg('circle', { r: 6, class: 'ring', visibility: 'hidden' });
  root.append(cross, ring);
  const hit = svg('rect', { x: pad.l - 6, y: 0, width: W - pad.l - pad.r + 12, height: H, fill: 'transparent' });
  root.append(hit);
  const all = series.flatMap(s => s.pts.slice(1).map(pt => ({ pt, s })));
  const move = e => {
    const r = root.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height);
    let bestD = Infinity, bestP = null;
    for (const a of all) { const d = (X(a.pt.i) - mx) ** 2 + ((Y(a.pt.bal) - my) * 0.6) ** 2; if (d < bestD) { bestD = d; bestP = a; } }
    if (!bestP || bestD > 60 ** 2) return leave();
    const { pt, s } = bestP;
    const x = X(pt.i), y = Y(pt.bal);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
    ring.setAttribute('cx', x); ring.setAttribute('cy', y); ring.setAttribute('stroke', s.p.color); ring.setAttribute('visibility', 'visible');
    clear(tip);
    tip.append(h('div.tn', h('span.bsw', { style: { background: s.p.color } }), s.p.name), h('div.tg', `${gameIcon(pt.game)} ${gameName(pt.game)}`), h('div.tb', fmtMoney(pt.bal)), h('div.td', { class: pt.net > 0 ? 'pos' : pt.net < 0 ? 'neg' : '' }, signed(pt.net)));
    tip.classList.remove('hidden');
    const tx = x / W * r.width, ty = y / H * r.height;
    tip.style.left = `${Math.min(r.width - 150, Math.max(4, tx + 12))}px`;
    tip.style.top = `${Math.max(4, ty - 70)}px`;
  };
  const leave = () => { tip.classList.add('hidden'); cross.setAttribute('visibility', 'hidden'); ring.setAttribute('visibility', 'hidden'); };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
  // Legende (immer bei ≥ 2 Spielern; bei einem Spieler nennt der Titel die Linie)
  const legend = players.length > 1 ? h('div.blegend', ...players.map(p => h('span.bleg', h('span.bsw', { style: { background: p.color } }), p.name))) : h('div.blegend', h('span.bleg', 'Dein Geldverlauf auf diesem Stockwerk'));
  wrap.prepend(legend);
  wrap.append(root);
}

// ───────────────────────── RUN-BILANZ (nach Stock 15) ─────────────────────────
const fmtAward = a => (a.fmt === 'money' ? (a.value < 0 ? '−' + fmtMoney(-a.value) : fmtMoney(a.value)) : a.fmt === 'dildos' ? `${a.value} 🍆` : `${a.value} in Folge`);
export function openRunBalance(ui, f) {
  const app = ui.app, st = f.stats;
  const save = app.save;
  const mins = Math.round(f.durationMs / 60000);
  const time = `${Math.floor(mins / 60)} h ${mins % 60} min`;
  const row = (k, v, cls = '') => h('div.brow', h('span', k), h('b', { class: cls }, v));
  const myDildos = st.players?.[app.mePlayer?.name]?.dildos ?? 0;
  const stats = h('div.bcards',
    h('div.bcard', h('div.bname', '💰 Geld'), row('Startkapital', fmtMoney(st.startPot)), row('Finaler Team-Pot', fmtMoney(f.pot)), row('Gewonnen', `+${fmtMoney(st.won)}`, 'pos'), row('Verloren', `−${fmtMoney(st.lost)}`, 'neg'), row('Gesamteinsatz', fmtMoney(st.staked))),
    h('div.bcard', h('div.bname', '🎰 Runden'), row('Casino-Runden', String(st.rounds)), row('Gewonnen', String(st.wins), 'pos'), row('Verloren', String(st.losses), 'neg'), row('Rush Events', String(st.rushes)), row('Benötigte Zeit', time)),
    h('div.bcard', h('div.bname', '🏅 Fortschritt'), row('Verdiente 🍆 (du)', `${myDildos} 🍆`), row('Challenges (Team)', String(st.challenges)), row('Gefundene Secrets (du)', `${(save.secrets || []).length}`), row('Stockwerke geschafft', `${st.floors}/15`)),
  );
  const awards = h('div.bsums', ...(f.awards || []).map(a => h('div.bsum.award', h('div.bsi', a.icon), h('div', h('div.bsl', a.title), h('div.bsv', a.who), h('div.bss', `${a.desc}: ${fmtAward(a)}`)))));
  ui.openModal(h('div.balance',
    h('div.bhead', h('h2.btitle', 'RUN BILANZ'), h('div.btarget', `ALLE 15 STOCKWERKE · ${fmtMoney(f.pot)}`), h('div.breward.new', '🏆 YOU BEAT THE CASINO')),
    stats,
    h('h3', 'TEAM-AWARDS'),
    awards,
    h('div.actions.bactions',
      h('button.primary.big', { onclick: () => { sfx.click(); ui.closeModal(); app.send({ t: 'vote.start', type: 'final' }); } }, 'ZUM CASINO PENTHOUSE'),
      h('button.big', { onclick: () => { sfx.click(); ui.closeModal(); } }, 'Hier weiterspielen'),
    ),
    h('div.subtle.small', 'Im Penthouse wartet die finale Entscheidung (TAKE oder DOUBLE). Danach kannst du freiwillig einen Prestige-Run starten.'),
  ), 'wide balancemodal');
}

// Phase 1 des Finales: grosse Erfolgsanimation
export function finaleSplash(ui) {
  const el = h('div.finalesplash', h('div.f1', 'FLOOR 15 COMPLETE'), h('div.f2', 'YOU BEAT THE CASINO'));
  ui.overlay.append(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 5000);
}
