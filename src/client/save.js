// Dauerhafter Spielstand im Browser (localStorage).
import { START_CAPITAL, ACHIEVEMENTS } from '../shared/config.js';
import { defaultCampaign } from '../shared/room.js';
import { legacyChallengeIds, isChallengeId } from '../shared/challenges.js';
import { defaultAppearance } from './character.js';
import { isTouchDevice } from './touch.js';

const KEY = 'ayris-save-v1';

export function defaultStats() {
  return {
    wagered: 0, won: 0, lost: 0, biggestWin: 0, biggestLoss: 0,
    rouletteWins: 0, blackjackWins: 0, blackjacks: 0, slotJackpots: 0, baccaratWins: 0, crapsWins: 0, pokerWins: 0, wheelWins: 0,
    hands: 0, spins: 0, rounds: 0, roundsWon: 0, floorsCompleted: 0, floorsFailed: 0, mafiaVisits: 0,
    doubleAttempts: 0, doubleWins: 0, doubleLosses: 0, highestPot: START_CAPITAL,
    dildosEarned: 0, dildosSpent: 0, itemsUsed: 0, takes: 0, makkas: 0,
    // Prompt 8: Spielzeit (Sekunden), Runden je Spiel, besuchte Stockwerke, Challenges, Pechsträhnen
    playtime: 0, games: {}, floorsVisited: [], challengesDone: 0, lossStreak: 0, bestLossStreak: 0, highestPotRun: 0,
  };
}

function defaults() {
  return {
    name: 'Ayri' + Math.floor(Math.random() * 900 + 100),
    appearance: defaultAppearance(),
    dildos: 0,
    makka: 0, // MAKKA im Inventar (der Server führt die Anzahl, gespeichert wird sie hier)
    inventory: {},
    loadout: [],
    rewardedFloors: [],
    challengeFloors: [], // alt (vor den neuen Challenges)
    challenges: [], // erledigte Challenge-IDs (permanent, pro Spieler)
    cosmetics: [], // im AYRI SHOP gekaufte Kosmetik (z. B. 'hat:luckyhat')
    secrets: [], // gefundene Geheimnisse
    events: [], // gewonnene Events (z. B. 'highroller')
    titles: [], // erspielte Titel
    campaign: defaultCampaign(),
    // Aktueller Run (wird bei einer Niederlage komplett ersetzt); campaign enthält nur permanente Rekorde
    run: { id: null, pot: START_CAPITAL, finalUnlocked: false, startedAt: Date.now(), unlocked: 1, completed: [] },
    stats: defaultStats(),
    achievements: {},
    history: [], // abgeschlossene Runs (Take / Double)
    settings: { master: 0.8, music: 0.55, sfx: 0.9, song: 'lobby', sensitivity: 1, touchSensitivity: 1, bloom: true, shadows: true, quality: null, fpsLimit: null },
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
      autoGraphics(data.settings);
      migrateRun(data, s);
      return data;
    }
  } catch { /* ohne Speicher weiterspielen */ }
  data = d;
  autoGraphics(data.settings);
  return data;
}

// Ältere Spielstände: Stockwerke lagen in campaign – jetzt gehören sie zum Run, je abgeschlossene Stockwerke sind permanent
function migrateRun(d, raw) {
  const c = raw.campaign || {};
  d.run = { ...d.run };
  if (!Array.isArray(d.run.completed)) d.run.completed = Array.isArray(c.completed) ? c.completed : [];
  if (!Number.isFinite(d.run.unlocked)) d.run.unlocked = Number.isFinite(c.unlocked) ? c.unlocked : 1;
  d.campaign.everCompleted = [...new Set([...(c.everCompleted || []), ...(c.completed || []), ...d.run.completed])].sort((a, b) => a - b);
  d.challenges = [...new Set([...(Array.isArray(d.challenges) ? d.challenges : []), ...legacyChallengeIds(d.challengeFloors)])].filter(isChallengeId);
}

// Grafik beim ersten Start: PC = Hoch (wie bisher), Handy/Tablet = AUTO (Stufe nach Gerät + gemessener Bildrate, FPS AUTO).
// gfx: 2 = Version der Mobile-Grafik; ältere automatisch gewählte Handy-Einstellungen werden einmalig auf AUTO gestellt.
function autoGraphics(st) {
  const touch = isTouchDevice();
  if (touch && st.gfx !== 2) { st.quality = 'auto'; st.fpsLimit = 'auto'; st.bloom = true; st.shadows = true; }
  if (!st.quality) st.quality = touch ? 'auto' : 'high';
  if (st.fpsLimit === null || st.fpsLimit === undefined) st.fpsLimit = touch ? 'auto' : 0;
  if (touch) st.gfx = 2;
}

export function get() { return data || load(); }

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignorieren */ }
  }, 200);
}

// Sofort speichern (z. B. vor dem Verlassen zur Startseite)
export function saveNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignorieren */ }
}

export function profile() {
  const s = get();
  return {
    name: s.name, appearance: s.appearance, rewardedFloors: s.rewardedFloors, challenges: s.challenges,
    makka: s.makka || 0,
    hrWon: s.hrWon || [],
    campaign: s.campaign, run: s.run,
  };
}

export const MAKKA_PRICE = 1;

// Bezahlt einen MAKKA an der Bar (nachdem der Server den Kauf bestätigt hat): genau 1 Dildo
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
