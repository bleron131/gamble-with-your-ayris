// Dauerhafter Spielstand im Browser (localStorage).
import { START_CAPITAL, ACHIEVEMENTS } from '../shared/config.js';
import { defaultCampaign } from '../shared/room.js';
import { defaultAppearance } from './character.js';

const KEY = 'ayris-save-v1';

export function defaultStats() {
  return {
    wagered: 0, won: 0, lost: 0, biggestWin: 0, biggestLoss: 0,
    rouletteWins: 0, blackjackWins: 0, blackjacks: 0, slotJackpots: 0, baccaratWins: 0, crapsWins: 0, pokerWins: 0, wheelWins: 0,
    hands: 0, spins: 0, rounds: 0, roundsWon: 0, floorsCompleted: 0, floorsFailed: 0, mafiaVisits: 0,
    doubleAttempts: 0, doubleWins: 0, doubleLosses: 0, highestPot: START_CAPITAL,
    dildosEarned: 0, dildosSpent: 0, itemsUsed: 0, takes: 0, makkas: 0,
  };
}

function defaults() {
  return {
    name: 'Ayri' + Math.floor(Math.random() * 900 + 100),
    appearance: defaultAppearance(),
    dildos: 0,
    inventory: {},
    loadout: [],
    rewardedFloors: [],
    challengeFloors: [],
    campaign: defaultCampaign(),
    run: { pot: START_CAPITAL, finalUnlocked: false, startedAt: Date.now() },
    stats: defaultStats(),
    achievements: {},
    history: [], // abgeschlossene Runs (Take / Double)
    settings: { master: 0.8, music: 0.55, sfx: 0.9, sensitivity: 1, bloom: true, shadows: true },
  };
}

let data = null;

export function load() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      data = { ...d, ...s, appearance: { ...d.appearance, ...s.appearance }, stats: { ...d.stats, ...s.stats }, settings: { ...d.settings, ...s.settings }, campaign: { ...d.campaign, ...s.campaign } };
      return data;
    }
  } catch { /* ohne Speicher weiterspielen */ }
  data = d;
  return data;
}

export function get() { return data || load(); }

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignorieren */ }
  }, 200);
}

export function profile() {
  const s = get();
  return {
    name: s.name, appearance: s.appearance, rewardedFloors: s.rewardedFloors, challengeFloors: s.challengeFloors,
    campaign: s.campaign, run: s.run,
  };
}

export const MAKKA_PRICE = 1;

// Kauft einen MAKKA an der Bar: zieht genau 1 Dildo ab, sonst nichts
export function buyMakka() {
  const s = get();
  if (s.dildos < MAKKA_PRICE) return false;
  s.dildos -= MAKKA_PRICE;
  s.stats.dildosSpent += MAKKA_PRICE;
  s.stats.makkas = (s.stats.makkas || 0) + 1;
  save();
  return true;
}

export function addDildos(n, earned = true) {
  const s = get();
  s.dildos += n;
  if (earned) s.stats.dildosEarned += n;
  save();
}

export function unlockAchievement(id) {
  const s = get();
  if (s.achievements[id] || !ACHIEVEMENTS[id]) return false;
  s.achievements[id] = Date.now();
  addDildos(ACHIEVEMENTS[id].reward);
  return true;
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
  data = defaults();
}
