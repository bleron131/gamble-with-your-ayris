// Optionale Challenges pro Stockwerk (2–3 je Etage). Sie blockieren NIE das Freischalten:
// Das nächste Stockwerk hängt weiterhin nur am Ziel-Pot. Wer eine Challenge schafft, bekommt
// einmalig 🍆 (pro Spieler gespeichert, kein Farming). Fortschritt zählt für die ganze Gruppe.
//
// Typen:
//   win      – N gewonnene Runden in einem Spiel (game) bzw. beliebig (game: null)
//   streak   – N Team-Gewinne in Folge (Unentschieden zählen nicht, Verluste setzen zurück)
//   variety  – in N verschiedenen Spielen mindestens eine Runde gewonnen
//   bigwin   – ein Gewinn von mindestens mult × Einsatz
//   bigstake – eine gewonnene Runde mit Einsatz ≥ f × Stockwerk-Ziel
//   naturals – N Blackjacks (21 mit zwei Karten)
//   straight – Einzelzahl beim Roulette getroffen
//   tie      – Tie beim Baccarat gewonnen
//   point    – Point beim Craps getroffen
//   flush    – Flush oder besser beim Hold'em
//   slottier – Slot-Gewinn mindestens der Stufe tier (big / mega / jackpot)
//   makka    – eine Runde während MAKKA-LUCK gewonnen
//   pot      – Team-Pot erreicht f × Ziel (auf diesem Stockwerk)
//   fast     – Ziel innerhalb von sec Sekunden nach Betreten erreicht
//   leave    – mit mindestens f × Ziel zur Shishabar zurückgekehrt
//   allwin   – jedes Gruppenmitglied hat mindestens N Runden gewonnen
//   spins    – N Slot-Spins (egal ob gewonnen)

const C = (id, type, reward, text, extra = {}) => ({ id, type, reward, text, ...extra });

export const CHALLENGES = {
  1: [
    C('f1-slots', 'win', 1, 'Gewinne 3 Slot-Spins', { game: 'slots', goal: 3 }),
    C('f1-bj', 'win', 1, 'Gewinne 2 Blackjack-Hände', { game: 'blackjack', goal: 2 }),
    C('f1-leave', 'leave', 2, 'Kehre mit ≥150% des Ziels zur Shishabar zurück', { f: 1.5 }),
  ],
  2: [
    C('f2-roulette', 'win', 1, 'Gewinne 3 Roulette-Runden', { game: 'roulette', goal: 3 }),
    C('f2-streak', 'streak', 2, 'Schafft 3 Gewinne in Folge', { goal: 3 }),
    C('f2-leave', 'leave', 2, 'Kehre mit ≥150% des Ziels zurück', { f: 1.5 }),
  ],
  3: [
    C('f3-wheel', 'win', 1, 'Gewinne 2× am Glücksrad', { game: 'wheel', goal: 2 }),
    C('f3-variety', 'variety', 2, 'Gewinnt in 3 verschiedenen Spielen', { goal: 3 }),
    C('f3-big', 'bigwin', 2, 'Ein Gewinn von mindestens ×5 Einsatz', { mult: 5 }),
  ],
  4: [
    C('f4-bacc', 'win', 1, 'Gewinne 3 Baccarat-Runden', { game: 'baccarat', goal: 3 }),
    C('f4-fast', 'fast', 2, 'Erreicht das Ziel in unter 8 Minuten', { sec: 480 }),
    C('f4-leave', 'leave', 2, 'Kehre mit ≥150% des Ziels zurück', { f: 1.5 }),
  ],
  5: [
    C('f5-craps', 'win', 1, 'Gewinne 2 Craps-Runden', { game: 'craps', goal: 2 }),
    C('f5-makka', 'makka', 2, 'Gewinne eine Runde während MAKKA LUCK', {}),
    C('f5-slotbig', 'slottier', 2, 'Slot-Gewinn der Stufe BIG oder höher', { tier: 'big' }),
  ],
  6: [
    C('f6-poker', 'win', 1, "Gewinne 2 Hold'em-Hände", { game: 'poker', goal: 2 }),
    C('f6-streak', 'streak', 2, 'Schafft 4 Gewinne in Folge', { goal: 4 }),
    C('f6-leave', 'leave', 2, 'Kehre mit ≥150% des Ziels zurück', { f: 1.5 }),
  ],
  7: [
    C('f7-high', 'win', 1, 'Gewinne 3× an High-Limit Slots', { game: 'highslots', goal: 3 }),
    C('f7-natural', 'naturals', 2, 'Zieh einen Blackjack', { goal: 1 }),
    C('f7-pot', 'pot', 2, 'Team-Pot erreicht 125% des Ziels', { f: 1.25 }),
  ],
  8: [
    C('f8-straight', 'straight', 3, 'Treffe eine Einzelzahl beim Roulette', {}),
    C('f8-variety', 'variety', 2, 'Gewinnt in 4 verschiedenen Spielen', { goal: 4 }),
    C('f8-leave', 'leave', 2, 'Kehre mit ≥150% des Ziels zurück', { f: 1.5 }),
  ],
  9: [
    C('f9-tie', 'tie', 3, 'Gewinne einen Tie beim Baccarat', {}),
    C('f9-big', 'bigwin', 2, 'Ein Gewinn von mindestens ×10 Einsatz', { mult: 10 }),
    C('f9-fast', 'fast', 2, 'Erreicht das Ziel in unter 10 Minuten', { sec: 600 }),
  ],
  10: [
    C('f10-bj', 'win', 1, 'Gewinne 5 Blackjack-Hände', { game: 'blackjack', goal: 5 }),
    C('f10-streak', 'streak', 3, 'Schafft 5 Gewinne in Folge', { goal: 5 }),
    C('f10-leave', 'leave', 2, 'Kehre mit ≥150% des Ziels zurück', { f: 1.5 }),
  ],
  11: [
    C('f11-point', 'point', 2, 'Triff einen Point beim Craps', {}),
    C('f11-wheel', 'win', 1, 'Gewinne 3× am Glücksrad', { game: 'wheel', goal: 3 }),
    C('f11-pot', 'pot', 2, 'Team-Pot erreicht 130% des Ziels', { f: 1.3 }),
  ],
  12: [
    C('f12-flush', 'flush', 3, "Flush oder besser beim Hold'em", {}),
    C('f12-variety', 'variety', 2, 'Gewinnt in 5 verschiedenen Spielen', { goal: 5 }),
    C('f12-leave', 'leave', 2, 'Kehre mit ≥150% des Ziels zurück', { f: 1.5 }),
  ],
  13: [
    C('f13-highroll', 'bigstake', 2, 'Gewinne eine Runde mit ≥10% des Ziels als Einsatz', { f: 0.1 }),
    C('f13-mega', 'slottier', 3, 'Slot-Gewinn der Stufe MEGA oder Jackpot', { tier: 'mega' }),
    C('f13-fast', 'fast', 2, 'Erreicht das Ziel in unter 12 Minuten', { sec: 720 }),
  ],
  14: [
    C('f14-naturals', 'naturals', 2, 'Zieht 2 Blackjacks', { goal: 2 }),
    C('f14-allwin', 'allwin', 2, 'Jedes Gruppenmitglied gewinnt mindestens 3 Runden', { goal: 3 }),
    C('f14-leave', 'leave', 3, 'Kehre mit ≥150% des Ziels zurück', { f: 1.5 }),
  ],
  15: [
    C('f15-straight', 'straight', 3, 'Treffe eine Einzelzahl beim Roulette', {}),
    C('f15-variety', 'variety', 2, 'Gewinnt in 6 verschiedenen Spielen', { goal: 6 }),
    C('f15-pot', 'pot', 3, 'Team-Pot erreicht 120% des Ziels', { f: 1.2 }),
  ],
};

export const ALL_CHALLENGES = Object.values(CHALLENGES).flat();
export const CHALLENGE_BY_ID = Object.fromEntries(ALL_CHALLENGES.map(c => [c.id, c]));
export const challengesFor = n => CHALLENGES[n] || [];
export const isChallengeId = id => typeof id === 'string' && !!CHALLENGE_BY_ID[id];

// Ältere Spielstände: die frühere „150%-Bonus-Challenge“ pro Stockwerk entspricht der neuen leave-Challenge
export function legacyChallengeIds(floors) {
  const out = [];
  for (const n of floors || []) { const c = challengesFor(+n).find(x => x.type === 'leave'); if (c) out.push(c.id); }
  return out;
}

const TIER_ORDER = ['small', 'medium', 'big', 'mega', 'jackpot'];

// Zielwert für die Fortschrittsanzeige
export function challengeGoal(c) {
  return c.goal || 1;
}

// Fortschritt-Tracker für eine Stockwerk-Session (läuft serverseitig im Room)
export function newTracker(n) {
  return { floor: n, startedAt: Date.now(), wins: {}, winsAny: 0, streak: 0, bestStreak: 0, games: [], naturals: 0, spins: 0, playerWins: {}, flags: {}, done: [] };
}

// Ein Runden-Ergebnis verbuchen; gibt nichts zurück – der Room prüft danach mit progress()
export function trackResult(tr, r) {
  if (r.game === 'slots' || r.game === 'highslots') tr.spins++;
  if (r.blackjacks) tr.naturals += r.blackjacks;
  if (!(r.stake > 0)) return;
  if (r.net > 0) {
    tr.wins[r.game] = (tr.wins[r.game] || 0) + 1;
    tr.winsAny++;
    tr.streak++;
    tr.bestStreak = Math.max(tr.bestStreak, tr.streak);
    if (!tr.games.includes(r.game)) tr.games.push(r.game);
    tr.playerWins[r.pid] = (tr.playerWins[r.pid] || 0) + 1;
    const mult = (r.net + r.stake) / r.stake;
    tr.flags.bestMult = Math.max(tr.flags.bestMult || 0, mult);
    if (r.target) tr.flags.bestStakeFrac = Math.max(tr.flags.bestStakeFrac || 0, r.stake / r.target);
    if (r.straight) tr.flags.straight = true;
    if (r.tieWin) tr.flags.tie = true;
    if (r.pointHit) tr.flags.point = true;
    if (r.pokerCat >= 5) tr.flags.flush = true;
    if (r.makka) tr.flags.makka = true;
    if (r.tier) tr.flags.tier = Math.max(tr.flags.tier ?? -1, TIER_ORDER.indexOf(r.tier));
  } else if (r.net < 0) tr.streak = 0;
}

// Aktueller Fortschritt einer Challenge: { prog, goal }
export function progress(c, tr, ctx) {
  const goal = challengeGoal(c);
  const f = tr.flags;
  let prog = 0;
  switch (c.type) {
    case 'win': prog = c.game ? tr.wins[c.game] || 0 : tr.winsAny; break;
    case 'streak': prog = tr.bestStreak; break;
    case 'variety': prog = tr.games.length; break;
    case 'bigwin': prog = (f.bestMult || 0) >= c.mult ? 1 : 0; break;
    case 'bigstake': prog = (f.bestStakeFrac || 0) >= c.f ? 1 : 0; break;
    case 'naturals': prog = tr.naturals; break;
    case 'straight': prog = f.straight ? 1 : 0; break;
    case 'tie': prog = f.tie ? 1 : 0; break;
    case 'point': prog = f.point ? 1 : 0; break;
    case 'flush': prog = f.flush ? 1 : 0; break;
    case 'slottier': prog = (f.tier ?? -1) >= TIER_ORDER.indexOf(c.tier) ? 1 : 0; break;
    case 'makka': prog = f.makka ? 1 : 0; break;
    case 'pot': prog = ctx.pot >= ctx.target * c.f ? 1 : 0; break;
    case 'fast': prog = f.targetMs != null && f.targetMs <= c.sec * 1000 ? 1 : 0; break;
    case 'leave': prog = (f.leaveFrac || 0) >= c.f ? 1 : 0; break;
    case 'allwin': {
      const ids = ctx.players || [];
      prog = ids.length ? Math.min(...ids.map(id => tr.playerWins[id] || 0)) : 0;
      break;
    }
    case 'spins': prog = tr.spins; break;
  }
  return { prog: Math.min(prog, goal), goal };
}
