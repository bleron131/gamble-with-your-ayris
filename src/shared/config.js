// Zentrale Spielkonfiguration: Stockwerke, Limits, Items, Belohnungen.
// Alle Beträge sind rein virtuelle Spielwährung – kein echtes Geld.

export const START_CAPITAL = 7500;
// MAKKA: nur an Kemals Bar in der Shishabar (Position der Bar, Radius für den Kauf), als Item mitnehmbar.
// Im Casino getrunken: 10 Sekunden MAKKA-LUCK für die ganze Gruppe (feste Stärke, kein Stapeln).
export const MAKKA_BAR = { x: -9.4, z: -2, r: 3.4 };
export const MAKKA_MAX = 20;
export const MAKKA_LUCK_MS = 10000;
export const MAKKA_LUCK_BONUS = 0.55; // zusätzliche Chance, dass ein verlorener Ausgang neu ausgewürfelt wird
export const FINAL_TARGET = 500_000_000;
export const MAX_PLAYERS = 6;
export const LOADOUT_SLOTS = 4;

// Ayri-Glück: Chance, dass ein verlorener Ausgang einmal neu ausgewürfelt wird.
// Steigt mit jeder weiteren verlorenen Runde, damit lange Pechsträhnen selten werden.
// Prompt 10: spürbar spielerfreundlicher (Arcade-Casino) – schon nach einer Niederlage etwas Glück,
// danach steigt es zügig, damit sehr lange Verlustserien selten werden. Nie garantiert.
export function luckChance(lossStreak) {
  return Math.min(0.55, 0.14 + Math.max(0, lossStreak - 1) * 0.09);
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
  // Prompt 10: Arcade-Casino-Spiele
  hilo: 'HiLo', mines: 'Mines', crash: 'Crash', plinko: 'Plinko', keno: 'Keno', moneywheel: 'Money Wheel',
  tower: 'Dragon Tower', penguin: 'Penguin Cross', duck: 'Duck Race', streetcraps: 'Street Craps',
};

export const GAME_ICONS = {
  slots: '🎰', roulette: '🎡', blackjack: '🃏', baccarat: '🂡', craps: '🎲', poker: '♠️', wheel: '🎯', highslots: '💎',
  hilo: '🔼', mines: '💣', crash: '📈', plinko: '🔵', keno: '🔢', moneywheel: '🎡', tower: '🐉', penguin: '🐧', duck: '🦆', streetcraps: '🎲',
};
// Arcade-Stationen stehen an den Wänden (Automaten/Terminals), nicht als Tische in der Raummitte
export const ARCADE_TYPES = ['hilo', 'mines', 'crash', 'plinko', 'keno', 'moneywheel', 'tower', 'penguin', 'duck', 'streetcraps'];

// Max-Einsatz pro Runde als Anteil am Stockwerk-Ziel. Spiele mit hohen Multiplikatoren sind
// stärker begrenzt, damit ein Level nicht mit einer normalen kleinen Wette trivial wird,
// grosse Risiken (z.B. 40% des Ziels auf Rot) aber bewusst möglich bleiben.
const MAX_FACTOR = {
  slots: 0.1, // Stock 1: bis $1'000 pro Spin
  highslots: 0.2,
  roulette: 0.4, // Summe aller Chips pro Spin
  blackjack: 0.25, // pro Hand (Double/Split erhöhen das Risiko)
  baccarat: 0.3,
  craps: 0.25,
  poker: 0.15, // Ante (Call = 2× Ante)
  wheel: 0.12, // pro Feld
  hilo: 0.1, mines: 0.1, crash: 0.12, plinko: 0.1, keno: 0.1, moneywheel: 0.12, tower: 0.08, penguin: 0.1, duck: 0.12, streetcraps: 0.2,
};
const MIN_FACTOR = {
  slots: 0.005, highslots: 0.02, roulette: 0.002, blackjack: 0.005, baccarat: 0.005,
  craps: 0.005, poker: 0.005, wheel: 0.002,
  hilo: 0.004, mines: 0.004, crash: 0.004, plinko: 0.003, keno: 0.003, moneywheel: 0.004, tower: 0.004, penguin: 0.004, duck: 0.004, streetcraps: 0.005,
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

// Spiele bauen sich auf: Ein Spiel, das auf einem Stockwerk eingeführt wird, bleibt auf allen höheren erhalten.
// Prompt 10: früh einfache Spiele (HiLo, Mines), in der Mitte Crash/Plinko/Keno/Money Wheel, spät Dragon Tower,
// dazu Penguin Cross, Duck Race und Street Craps als Arcade-Stationen.
export const GAME_INTRO = {
  slots: 1, blackjack: 1, hilo: 1, mines: 2, roulette: 2, wheel: 3, crash: 3, baccarat: 4, plinko: 4,
  craps: 5, keno: 5, poker: 6, moneywheel: 6, highslots: 7, tower: 8, penguin: 9, duck: 10, streetcraps: 11,
};
export const gamesForFloor = n => Object.keys(GAME_INTRO).filter(g => GAME_INTRO[g] <= n);

const FLOOR_DEFS = [
  { target: 10_000, name: 'Hinterhof-Spielhalle', tier: 0 },
  { target: 25_000, name: 'Neon Corner', tier: 0 },
  { target: 50_000, name: 'Lucky Basement', tier: 0 },
  { target: 100_000, name: 'Downtown Casino', tier: 1 },
  { target: 250_000, name: 'Golden Palm', tier: 1 },
  { target: 500_000, name: 'Fortune Hall', tier: 1 },
  { target: 1_000_000, name: 'Millionaires Club', tier: 2 },
  { target: 2_500_000, name: 'Velvet Lounge', tier: 2 },
  { target: 5_000_000, name: 'Sapphire Room', tier: 2 },
  { target: 10_000_000, name: 'VIP Royale', tier: 3 },
  { target: 25_000_000, name: 'Diamond Deck', tier: 3 },
  { target: 50_000_000, name: 'Platinum Sky', tier: 3 },
  { target: 100_000_000, name: 'High-Roller-Etage', tier: 4 },
  { target: 250_000_000, name: 'Luxus-High-Roller-Casino', tier: 4 },
  { target: 500_000_000, name: 'FINAL CASINO FLOOR', tier: 5 },
].map((d, i) => ({ ...d, games: gamesForFloor(i + 1) }));

// Prestige: Nach dem Finale beginnt ein neuer Run auf höherer Prestige-Stufe – Ziele (und damit Min/Max-Einsätze)
// steigen um 50 % pro Stufe. Das Startkapital bleibt gleich, also wird jede Stufe etwas anspruchsvoller.
export const PRESTIGE_MAX = 10;
export const prestigeScale = p => 1 + 0.5 * Math.max(0, Math.min(PRESTIGE_MAX, Math.floor(p) || 0));

function makeFloor(d, i, scale = 1) {
  const n = i + 1;
  // Ziel auf zwei signifikante Stellen runden (15'000, 37'500 → 38'000 …)
  const raw = d.target * scale, p10 = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1));
  d = { ...d, target: Math.round(raw / p10) * p10 };
  const limits = {};
  for (const g of d.games) {
    limits[g] = {
      min: Math.max(5, niceRound(d.target * MIN_FACTOR[g])),
      max: niceRound(d.target * MAX_FACTOR[g]),
    };
  }
  // Roulette: Einzelzahl separat begrenzt (35:1)
  if (limits.roulette) limits.roulette.straightMax = niceRound(d.target * 0.04);
  if (limits.baccarat) limits.baccarat.tieMax = niceRound(d.target * 0.03);
  if (limits.craps) limits.craps.propMax = niceRound(d.target * 0.04);
  return { n, ...d, limits, minBet: Math.min(...Object.values(limits).map(l => l.min)) };
}

export const FLOORS = FLOOR_DEFS.map((d, i) => makeFloor(d, i));
const prestigeCache = new Map();
export function floorDef(n, prestige = 0) {
  if (!prestige) return FLOORS[n - 1];
  const key = `${n}:${prestige}`;
  if (!prestigeCache.has(key)) prestigeCache.set(key, makeFloor(FLOOR_DEFS[n - 1], n - 1, prestigeScale(prestige)));
  return prestigeCache.get(key);
}

// Einsatzstufen der Spielautomaten (1 – 2.5 – 5 – 10 …) zwischen Minimum und Maximum des Stockwerks
export function slotSteps(n, type = 'slots', prestige = 0) {
  const l = floorDef(n, prestige).limits[type];
  if (!l) return [];
  const steps = [];
  for (let e = 0; e < 12; e++) for (const m of [1, 2.5, 5]) {
    const v = m * Math.pow(10, e);
    if (v >= l.min && v <= l.max) steps.push(v);
  }
  if (!steps.includes(l.min)) steps.unshift(l.min);
  if (!steps.includes(l.max)) steps.push(l.max);
  return [...new Set(steps)].sort((a, b) => a - b);
}

// Je höher das Stockwerk, desto höher der Top-Multiplikator und der Jackpot
export const slotTopMultiplier = n => 10 + (n - 1) * 2; // Stock 1: ×10 … Stock 15: ×38
export const jackpotBoost = n => 1 + (n - 1) * 0.08; // Stock 15: Jackpot ×2.1

// Tische pro Stockwerk – deterministisch, damit Server und Client dieselben IDs/Positionen kennen.
export function floorTables(n) {
  const f = floorDef(n);
  const list = [];
  // Höhere Stockwerke = mehr Auswahl: zusätzliche Automaten und Tische der beliebten Spiele
  const counts = {
    slots: n <= 4 ? 3 : n <= 9 ? 4 : 5,
    blackjack: n <= 4 ? 1 : n <= 9 ? 2 : 3,
    roulette: n <= 7 ? 1 : 2,
    wheel: 1,
    baccarat: n <= 10 ? 1 : 2,
    craps: 1,
    poker: n <= 11 ? 1 : 2,
    highslots: n <= 11 ? 2 : 3,
    crash: n >= 12 ? 2 : 1, // High-Roller-Crash auf den obersten Stockwerken
  };
  for (const g of f.games) {
    const c = counts[g] || 1;
    for (let i = 0; i < c; i++) list.push({ id: `${g}-${i}`, type: g, index: i });
  }
  return list;
}

// Dildo-Belohnungen (einmalig pro Spieler & Stockwerk → kein Farming)
export const FLOOR_REWARDS = [5, 5, 6, 6, 8, 8, 10, 10, 12, 12, 15, 15, 20, 20, 30];
// Optionale Challenges pro Stockwerk: siehe challenges.js

// Preise nach Seltenheit (max. 25 🍆): Common 2–5 · Uncommon 5–8 · Rare 8–12 · Epic 12–18 · Legendary 18–25
// usage: 'single' = einmal verwendbar (verbraucht), 'perLevel' = permanent, einmal pro Level
export const ITEMS = {
  pokal: {
    name: 'Pokal', icon: '🏆', cost: 3, usage: 'single', mode: 'arm',
    desc: 'Vor einem Gewinn aktivieren: 50% Gewinn ×2 – oder der Gewinn ist weg.',
  },
  shisha: {
    name: 'Glücks-Shisha', icon: '💨', cost: 4, usage: 'single', mode: 'arm',
    desc: 'Nächste 5 Runden: Gewinne +50%, aber jeder Verlust kostet 25% extra.',
  },
  luckyhat: {
    name: 'Lucky Hat', icon: '🎩', cost: 6, usage: 'perLevel', mode: 'retry',
    desc: 'Einmal pro Level: eine verlorene Slots-, Roulette-, Rad- oder Craps-Runde wiederholen.',
  },
  goldcoin: {
    name: 'Golden Coin', icon: '🪙', cost: 7, usage: 'single', mode: 'arm',
    desc: 'Vor einer Wette werfen: GOLD = Gewinn doppelt, SCHWARZ = Verlust doppelt.',
  },
  insurance: {
    name: 'Ayri-Versicherung', icon: '📄', cost: 9, usage: 'single', mode: 'arm',
    desc: 'Die nächste verlorene Runde wird zu 50% erstattet.',
  },
  joker: {
    name: 'Joker Card', icon: '🃏', cost: 12, usage: 'perLevel', mode: 'blackjack',
    desc: 'Blackjack, einmal pro Level: zuletzt gezogene Karte zurückgeben und neu ziehen.',
  },
  briefcase: {
    name: 'Mafia Briefcase', icon: '💼', cost: 15, usage: 'single', mode: 'passive',
    desc: 'Bei Bankrott: Mafia bestechen – zweite Chance mit 30% des Stockwerk-Startkapitals.',
  },
  devildice: {
    name: 'Devil Dice', icon: '😈', cost: 18, usage: 'perLevel', mode: 'arm',
    desc: 'Einmal pro Level auf einen Gewinn: 50% ×3 – 50% Gewinn weg UND Einsatz nochmal verloren.',
  },
  crown: {
    name: 'Ayris Crown', icon: '👑', cost: 25, usage: 'perLevel', mode: 'retry',
    desc: 'Endgame. Einmal pro Level: JEDE verlorene Wette zurücksetzen und erneut ausführen.',
  },
};

export const RETRY_GAMES_HAT = ['slots', 'highslots', 'roulette', 'wheel', 'craps'];

export const ACHIEVEMENTS = {
  first_win: { name: 'FIRST WIN', desc: 'Erste gewonnene Runde', reward: 2 },
  bj_master: { name: 'BLACKJACK MASTER', desc: '25 Blackjack-Runden gewonnen', reward: 8 },
  high_roller: { name: 'HIGH ROLLER', desc: 'Mindestens $10\'000 in einer einzigen Runde gewonnen', reward: 5 },
  unlucky: { name: 'UNLUCKY BASTARD', desc: '5 Runden in Folge verloren', reward: 3 },
  tourist: { name: 'CASINO TOURIST', desc: '5 verschiedene Stockwerke besucht', reward: 4 },
  top_floor: { name: 'TOP FLOOR', desc: 'Stock 15 betreten', reward: 10 },
  secret_hunter: { name: 'SECRET HUNTER', desc: 'Alle 5 Geheimnisse gefunden', reward: 15 },
  big_bet: { name: 'All-in-Mentalität', desc: 'Mindestens 50% des Team-Pots in einer Runde gesetzt', reward: 4 },
  jackpot: { name: 'JACKPOT!', desc: 'Drei Kronen am Slot', reward: 10 },
  straight_up: { name: 'Volltreffer', desc: 'Einzelzahl beim Roulette getroffen', reward: 5 },
  blackjack5: { name: 'Natural Talent', desc: '5 Blackjacks', reward: 5 },
  bacc_tie: { name: 'Gleichstand', desc: 'Tie beim Baccarat gewonnen', reward: 5 },
  craps_point: { name: 'Point Maker', desc: 'Point beim Craps getroffen', reward: 3 },
  poker_flush: { name: 'Flush Royale', desc: 'Flush oder besser beim Hold\'em', reward: 5 },
  wheel50: { name: 'Rad des Schicksals', desc: '50× auf dem Glücksrad', reward: 10 },
  millionaire: { name: 'MILLIONAIRE', desc: 'Team-Pot ≥ $1\'000\'000', reward: 5 },
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
  // Prompt 8: Challenges, Achievements, Stockwerke, Geheimnisse, High-Roller-Events und AYRI SHOP
  'hat:party': { challenges: 3, label: '3 Challenges abschliessen' },
  'top:casino': { floor: 3, label: 'Stock 3 abschliessen' },
  'jacket:tux': { floor: 9, label: 'Stock 9 abschliessen' },
  'jacket:velvet': { challenges: 20, label: '20 Challenges abschliessen' },
  'mask:domino': { challenges: 10, label: '10 Challenges abschliessen' },
  'mask:bandit': { achievement: 'mafia', label: 'Von der Mafia erwischt werden' },
  'mask:venetian': { secrets: 2, label: '2 Geheimnisse finden' },
  'glasses:heart': { achievement: 'first_win', label: 'Achievement FIRST WIN' },
  'pants:gold': { achievement: 'millionaire', label: 'Achievement MILLIONAIRE' },
  'shoes:goldsneakers': { achievement: 'bj_master', label: 'Achievement BLACKJACK MASTER' },
  'hat:diamondhat': { achievement: 'high_roller', label: 'Achievement HIGH ROLLER (oder High-Roller-Event gewinnen)', event: 'highroller' },
  'hat:casinocrown': { achievement: 'top_floor', label: 'Achievement TOP FLOOR' },
  'hat:luckyhat': { shop: 10, label: 'Im AYRI SHOP für 10 🍆' },
  'glasses:golden': { shop: 16, label: 'Im AYRI SHOP für 16 🍆' },
  'jewelry:luckychain': { shop: 12, label: 'Im AYRI SHOP für 12 🍆' },
  'emote:bow': { challenges: 5, label: '5 Challenges abschliessen' },
  'emote:dab': { achievement: 'tourist', label: 'Achievement CASINO TOURIST' },
  'emote:money': { shop: 5, label: 'Im AYRI SHOP für 5 🍆' },
  'hat:prestigecrown': { prestige: 1, label: 'Prestige 1 erreichen (Finale schaffen)' },
  'jewelry:prestigestar': { prestige: 2, label: 'Prestige 2 erreichen' },
  'jacket:prestige': { prestige: 3, label: 'Prestige 3 erreichen' },
};

// Glücks-Kosmetik: nur winzige Boni (kein spürbarer Spielvorteil, kein Einfluss auf Pot oder Gewinnchancen)
//   bonus: Chance auf +1 🍆 zusätzlich bei einer 🍆-Belohnung · sparkle: Glitzern bei eigenen Gewinnen ·
//   challenge: +1 🍆 auf Challenge-Belohnungen
export const LUCKY_COSMETICS = {
  'hat:luckyhat': { name: 'Lucky Hat 🍀', bonus: 0.05, sparkle: '#7cff6b' },
  'glasses:golden': { name: 'Golden Glasses', bonus: 0.05, sparkle: '#ffd700' },
  'jewelry:luckychain': { name: 'Lucky Chain', bonus: 0.05, sparkle: '#7cff6b' },
  'hat:diamondhat': { name: 'Diamond Hat', bonus: 0.08, sparkle: '#9be7ff' },
  'hat:casinocrown': { name: 'Casino Crown', bonus: 0.08, sparkle: '#ffd700', challenge: 1 },
};

// Geheimnisse & Easter Eggs (nicht alle sind markiert) – einmalig pro Spieler
export const SECRETS = {
  lobby_dildo: { name: 'Goldener Dildo hinter der Bar', reward: 3 },
  code_ayri: { name: 'Geheimcode', reward: 2 },
  rare_npc: { name: 'Mr. Goldfinger getroffen', reward: 3 },
  club_book: { name: 'Das geheime Buch im Millionaires Club', reward: 3 },
  sky_star: { name: 'Der Ayri-Stern (Teleskop)', reward: 3 },
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
