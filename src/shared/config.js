// Zentrale Spielkonfiguration: Stockwerke, Limits, Items, Belohnungen.
// Alle Beträge sind rein virtuelle Spielwährung – kein echtes Geld.

export const START_CAPITAL = 7500;
// Anteil des Stockwerk-Startkapitals, den die Mafia nach einem Bankrott übrig lässt.
// (Der Run endet nicht komplett, damit 15 Stockwerke realistisch schaffbar bleiben.)
export const MAFIA_KEEP_FRACTION = 0.75;
export const FINAL_TARGET = 500_000_000;
export const MAX_PLAYERS = 6;
export const LOADOUT_SLOTS = 4;

// Ayri-Glück: Chance, dass ein verlorener Ausgang einmal neu ausgewürfelt wird.
// Steigt mit jeder weiteren verlorenen Runde, damit lange Pechsträhnen selten werden.
export function luckChance(lossStreak) {
  return Math.min(0.4, 0.08 + Math.max(0, lossStreak - 2) * 0.08);
}

export const GAME_NAMES = {
  slots: 'Slots',
  roulette: 'Roulette',
  blackjack: 'Blackjack',
  baccarat: 'Baccarat',
  craps: 'Craps',
  poker: "Casino Hold'em",
  wheel: 'Glücksrad',
  highslots: 'High-Limit Slots',
};

export const GAME_ICONS = {
  slots: '🎰', roulette: '🎡', blackjack: '🃏', baccarat: '🂡', craps: '🎲', poker: '♠️', wheel: '🎯', highslots: '💎',
};

// Max-Einsatz pro Runde als Anteil am Stockwerk-Ziel. Spiele mit hohen Multiplikatoren sind
// stärker begrenzt, damit ein Level nicht mit einer normalen kleinen Wette trivial wird,
// grosse Risiken (z.B. 40% des Ziels auf Rot) aber bewusst möglich bleiben.
const MAX_FACTOR = {
  slots: 0.03,
  highslots: 0.06,
  roulette: 0.4, // Summe aller Chips pro Spin
  blackjack: 0.2, // pro Hand (Double/Split erhöhen das Risiko)
  baccarat: 0.3,
  craps: 0.2,
  poker: 0.1, // Ante (Call = 2× Ante)
  wheel: 0.06, // pro Feld
};
const MIN_FACTOR = {
  slots: 0.001, highslots: 0.005, roulette: 0.001, blackjack: 0.002, baccarat: 0.002,
  craps: 0.002, poker: 0.002, wheel: 0.001,
};

export function niceRound(v) {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const steps = [1, 2, 2.5, 5, 10];
  let best = steps[0];
  for (const s of steps) if (Math.abs(n - s) < Math.abs(n - best)) best = s;
  return Math.round(best * p);
}

const FLOOR_DEFS = [
  { target: 10_000, games: ['slots'], name: 'Hinterhof-Spielhalle', tier: 0 },
  { target: 25_000, games: ['slots', 'roulette'], name: 'Neon Corner', tier: 0 },
  { target: 50_000, games: ['slots', 'roulette'], name: 'Lucky Basement', tier: 0 },
  { target: 100_000, games: ['roulette', 'blackjack'], name: 'Downtown Casino', tier: 1 },
  { target: 250_000, games: ['slots', 'roulette', 'blackjack'], name: 'Golden Palm', tier: 1 },
  { target: 500_000, games: ['roulette', 'blackjack', 'wheel'], name: 'Fortune Hall', tier: 1 },
  { target: 1_000_000, games: ['roulette', 'blackjack', 'baccarat'], name: 'Millionaires Club', tier: 2 },
  { target: 2_500_000, games: ['slots', 'roulette', 'baccarat', 'craps'], name: 'Velvet Lounge', tier: 2 },
  { target: 5_000_000, games: ['roulette', 'blackjack', 'baccarat', 'craps'], name: 'Sapphire Room', tier: 2 },
  { target: 10_000_000, games: ['roulette', 'blackjack', 'baccarat', 'poker'], name: 'VIP Royale', tier: 3 },
  { target: 25_000_000, games: ['roulette', 'craps', 'poker', 'highslots'], name: 'Diamond Deck', tier: 3 },
  { target: 50_000_000, games: ['roulette', 'blackjack', 'baccarat', 'poker', 'highslots'], name: 'Platinum Sky', tier: 3 },
  { target: 100_000_000, games: ['roulette', 'blackjack', 'baccarat', 'craps', 'poker', 'highslots'], name: 'High-Roller-Etage', tier: 4 },
  { target: 250_000_000, games: ['roulette', 'blackjack', 'baccarat', 'craps', 'poker', 'wheel', 'highslots'], name: 'Luxus-High-Roller-Casino', tier: 4 },
  { target: 500_000_000, games: ['slots', 'roulette', 'blackjack', 'baccarat', 'craps', 'poker', 'wheel', 'highslots'], name: 'FINAL CASINO FLOOR', tier: 5 },
];

export const FLOORS = FLOOR_DEFS.map((d, i) => {
  const n = i + 1;
  const limits = {};
  for (const g of d.games) {
    limits[g] = {
      min: Math.max(5, niceRound(d.target * MIN_FACTOR[g])),
      max: niceRound(d.target * MAX_FACTOR[g]),
    };
  }
  // Roulette: Einzelzahl separat begrenzt (35:1)
  if (limits.roulette) limits.roulette.straightMax = niceRound(d.target * 0.02);
  if (limits.baccarat) limits.baccarat.tieMax = niceRound(d.target * 0.03);
  if (limits.craps) limits.craps.propMax = niceRound(d.target * 0.02);
  return { n, ...d, limits, minBet: Math.min(...Object.values(limits).map(l => l.min)) };
});

export function floorDef(n) { return FLOORS[n - 1]; }

// Tische pro Stockwerk – deterministisch, damit Server und Client dieselben IDs/Positionen kennen.
export function floorTables(n) {
  const f = floorDef(n);
  const list = [];
  const counts = { slots: 3, highslots: 2, roulette: n >= 10 ? 2 : 1, blackjack: n >= 9 ? 2 : 1, baccarat: 1, craps: 1, poker: n >= 13 ? 2 : 1, wheel: 1 };
  for (const g of f.games) {
    const c = counts[g] || 1;
    for (let i = 0; i < c; i++) list.push({ id: `${g}-${i}`, type: g, index: i });
  }
  return list;
}

// Dildo-Belohnungen (einmalig pro Spieler & Stockwerk → kein Farming)
export const FLOOR_REWARDS = [5, 5, 6, 6, 8, 8, 10, 10, 12, 12, 15, 15, 20, 20, 30];
// Bonus-Challenge pro Stockwerk: Verlasse das Stockwerk mit mindestens 150% des Ziels.
export const CHALLENGE_FACTOR = 1.5;
export const CHALLENGE_REWARDS = [3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 10, 10, 12, 12, 20];

// usage: 'single' = einmal verwendbar (verbraucht), 'perLevel' = permanent, einmal pro Level
export const ITEMS = {
  pokal: {
    name: 'Pokal', icon: '🏆', cost: 10, usage: 'single', mode: 'arm',
    desc: 'Vor einem Gewinn aktivieren: 50% Gewinn ×2 – oder der Gewinn ist weg.',
  },
  shisha: {
    name: 'Glücks-Shisha', icon: '💨', cost: 12, usage: 'single', mode: 'arm',
    desc: 'Nächste 5 Runden: Gewinne +50%, aber jeder Verlust kostet 25% extra.',
  },
  luckyhat: {
    name: 'Lucky Hat', icon: '🎩', cost: 15, usage: 'perLevel', mode: 'retry',
    desc: 'Einmal pro Level: eine verlorene Slots-, Roulette-, Rad- oder Craps-Runde wiederholen.',
  },
  goldcoin: {
    name: 'Golden Coin', icon: '🪙', cost: 20, usage: 'single', mode: 'arm',
    desc: 'Vor einer Wette werfen: GOLD = Gewinn doppelt, SCHWARZ = Verlust doppelt.',
  },
  insurance: {
    name: 'Ayri-Versicherung', icon: '📄', cost: 25, usage: 'single', mode: 'arm',
    desc: 'Die nächste verlorene Runde wird zu 50% erstattet.',
  },
  joker: {
    name: 'Joker Card', icon: '🃏', cost: 30, usage: 'perLevel', mode: 'blackjack',
    desc: 'Blackjack, einmal pro Level: zuletzt gezogene Karte zurückgeben und neu ziehen.',
  },
  briefcase: {
    name: 'Mafia Briefcase', icon: '💼', cost: 40, usage: 'single', mode: 'passive',
    desc: 'Bei Bankrott: Mafia bestechen – zweite Chance mit 30% des Stockwerk-Startkapitals.',
  },
  devildice: {
    name: 'Devil Dice', icon: '😈', cost: 50, usage: 'perLevel', mode: 'arm',
    desc: 'Einmal pro Level auf einen Gewinn: 50% ×3 – 50% Gewinn weg UND Einsatz nochmal verloren.',
  },
  crown: {
    name: 'Ayris Crown', icon: '👑', cost: 100, usage: 'perLevel', mode: 'retry',
    desc: 'Endgame. Einmal pro Level: JEDE verlorene Wette zurücksetzen und erneut ausführen.',
  },
};

export const RETRY_GAMES_HAT = ['slots', 'highslots', 'roulette', 'wheel', 'craps'];

export const ACHIEVEMENTS = {
  first_win: { name: 'Anfängerglück', desc: 'Erste gewonnene Runde', reward: 2 },
  big_bet: { name: 'All-in-Mentalität', desc: 'Mindestens 50% des Team-Pots in einer Runde gesetzt', reward: 4 },
  jackpot: { name: 'JACKPOT!', desc: 'Drei Kronen am Slot', reward: 10 },
  straight_up: { name: 'Volltreffer', desc: 'Einzelzahl beim Roulette getroffen', reward: 5 },
  blackjack5: { name: 'Natural Talent', desc: '5 Blackjacks', reward: 5 },
  bacc_tie: { name: 'Gleichstand', desc: 'Tie beim Baccarat gewonnen', reward: 5 },
  craps_point: { name: 'Point Maker', desc: 'Point beim Craps getroffen', reward: 3 },
  poker_flush: { name: 'Flush Royale', desc: 'Flush oder besser beim Hold\'em', reward: 5 },
  wheel50: { name: 'Rad des Schicksals', desc: '50× auf dem Glücksrad', reward: 10 },
  millionaire: { name: 'Millionäre', desc: 'Team-Pot ≥ $1\'000\'000', reward: 5 },
  hundred_m: { name: 'Hundert Mio.', desc: 'Team-Pot ≥ $100\'000\'000', reward: 15 },
  mafia: { name: 'Schlafen bei den Fischen', desc: 'Von der Mafia erwischt', reward: 3 },
  item5: { name: 'Gadget-Fan', desc: '5 Spezialgegenstände benutzt', reward: 3 },
  game_complete: { name: 'Ayris Legende', desc: '$500\'000\'000 auf Stock 15 erreicht', reward: 25 },
  double_win: { name: 'AYRI JACKPOT', desc: 'Double or Loss gewonnen', reward: 50 },
  double_loss: { name: 'Hättet ihr mal genommen', desc: 'Double or Loss verloren', reward: 5 },
};

// Kosmetik, die durch Fortschritt freigeschaltet wird (Bedingung: abgeschlossenes Stockwerk / Achievement)
export const COSMETIC_UNLOCKS = {
  'hat:crown': { floor: 15, label: 'Stock 15 abschliessen' },
  'hat:tophat': { floor: 10, label: 'Stock 10 abschliessen' },
  'jewelry:diamond': { floor: 12, label: 'Stock 12 abschliessen' },
  'jewelry:goldchain': { floor: 5, label: 'Stock 5 abschliessen' },
  'glasses:star': { floor: 7, label: 'Stock 7 abschliessen' },
  'jacket:gold': { floor: 13, label: 'Stock 13 abschliessen' },
  'accessory:moneybag': { floor: 8, label: 'Stock 8 abschliessen' },
  'accessory:trophy': { achievement: 'double_win', label: 'Double or Loss gewinnen' },
};

export function fmtMoney(v) {
  const neg = v < 0;
  const s = Math.floor(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return (neg ? '-$' : '$') + s;
}

export function fmtShort(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return '$' + +(v / 1e9).toFixed(2) + ' Mrd.';
  if (a >= 1e6) return '$' + +(v / 1e6).toFixed(2) + ' Mio.';
  if (a >= 1e4) return '$' + +(v / 1e3).toFixed(1) + 'k';
  return fmtMoney(v);
}
