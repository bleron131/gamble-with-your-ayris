// Run-Statistik über alle Stockwerke eines Runs (für die RUN-BILANZ nach Stock 15) und Team-Awards.
// Pro Spieler nach Namen geführt, damit ein Reconnect keine doppelten oder verlorenen Werte erzeugt.
export function newRunStats(pot, startedAt = Date.now()) {
  return { startedAt, startPot: pot, staked: 0, won: 0, lost: 0, rounds: 0, wins: 0, losses: 0, rushes: 0, challenges: 0, floors: 0, players: {} };
}

export function runPlayer(rs, name) {
  return rs.players[name] || (rs.players[name] = { name, staked: 0, won: 0, lost: 0, rounds: 0, maxWin: 0, maxWinGame: null, bestStreak: 0, worstStreak: 0, dildos: 0 });
}

// Aus einem gespeicherten Spielstand übernehmen (nur Zahlen, nichts Fremdes)
export function sanitizeRunStats(raw, pot) {
  if (!raw || typeof raw !== 'object') return null;
  const n = v => (Number.isFinite(+v) ? +v : 0);
  const rs = newRunStats(n(raw.startPot) || pot, n(raw.startedAt) || Date.now());
  for (const k of ['staked', 'won', 'lost', 'rounds', 'wins', 'losses', 'rushes', 'challenges', 'floors']) rs[k] = n(raw[k]);
  for (const [name, p] of Object.entries(raw.players || {}).slice(0, 12)) {
    const q = runPlayer(rs, String(name).slice(0, 16));
    for (const k of ['staked', 'won', 'lost', 'rounds', 'maxWin', 'bestStreak', 'worstStreak', 'dildos']) q[k] = n(p?.[k]);
    q.maxWinGame = typeof p?.maxWinGame === 'string' ? p.maxWinGame.slice(0, 20) : null;
  }
  return rs;
}

// Team-Awards aus echten Run-Daten
export function computeAwards(rs) {
  const ps = Object.values(rs?.players || {}).filter(p => p.rounds > 0 || p.dildos > 0);
  if (!ps.length) return [];
  const best = (key, fn = p => p[key]) => ps.reduce((a, p) => (fn(p) > fn(a) ? p : a), ps[0]);
  const net = p => p.won - p.lost;
  const out = [];
  const king = best('net', net);
  out.push({ id: 'king', icon: '🏆', title: 'KING OF THE CASINO', desc: 'Bester Nettogewinn', who: king.name, value: net(king), fmt: 'money' });
  const donor = ps.reduce((a, p) => (net(p) < net(a) ? p : a), ps[0]);
  if (net(donor) < 0) out.push({ id: 'donator', icon: '💀', title: 'CASINO DONATOR', desc: 'Grösster Nettoverlust', who: donor.name, value: net(donor), fmt: 'money' });
  const hot = best('bestStreak');
  if (hot.bestStreak > 0) out.push({ id: 'hot', icon: '🔥', title: 'HOT HAND', desc: 'Längste Gewinnserie', who: hot.name, value: hot.bestStreak, fmt: 'count' });
  const cold = best('worstStreak');
  if (cold.worstStreak > 0) out.push({ id: 'cold', icon: '🧊', title: 'COLD HAND', desc: 'Längste Verlustserie', who: cold.name, value: cold.worstStreak, fmt: 'count' });
  const hit = best('maxWin');
  if (hit.maxWin > 0) out.push({ id: 'hit', icon: '💰', title: 'BIGGEST HIT', desc: 'Höchster Einzelgewinn', who: hit.name, value: hit.maxWin, fmt: 'money', game: hit.maxWinGame });
  const degen = best('staked');
  if (degen.staked > 0) out.push({ id: 'degen', icon: '🎲', title: 'DEGENERATE', desc: 'Höchster Gesamteinsatz', who: degen.name, value: degen.staked, fmt: 'money' });
  const dk = best('dildos');
  if (dk.dildos > 0) out.push({ id: 'dildo', icon: '🍆', title: 'DILDO KING', desc: 'Meiste 🍆 verdient', who: dk.name, value: dk.dildos, fmt: 'dildos' });
  return out;
}
