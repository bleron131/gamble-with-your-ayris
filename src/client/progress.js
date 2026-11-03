// Permanenter Fortschritt des Spielers: Kosmetik-Freischaltungen, Emotes, Glücks-Kosmetik, Geheimnisse.
// Alles ist rein kosmetisch bzw. gibt nur winzige 🍆-Boni – kein Einfluss auf Team-Pot oder Gewinnchancen.
import { COSMETIC_UNLOCKS, LUCKY_COSMETICS, SECRETS } from '../shared/config.js';
import * as Save from './save.js';

export const BASE_EMOTES = [['cheer', '🙌', 'Jubeln'], ['dance', '💃', 'Tanzen'], ['sad', '😢', 'Traurig'], ['facepalm', '🤦', 'Facepalm'], ['point', '👉', 'Zeigen']];
export const EXTRA_EMOTES = [['bow', '🙇', 'Verbeugen'], ['dab', '😎', 'Dab'], ['money', '💸', 'Geld werfen']];

// null = frei, sonst Text, wie man es freischaltet
export function cosmeticLock(key) {
  const u = COSMETIC_UNLOCKS[key];
  if (!u) return null;
  const s = Save.get();
  const ever = s.campaign.everCompleted || [];
  if (u.floor && (ever.includes(u.floor) || (s.run.completed || []).includes(u.floor))) return null;
  if (u.achievement && s.achievements[u.achievement]) return null;
  if (u.challenges && (s.challenges || []).length >= u.challenges) return null;
  if (u.secrets && (s.secrets || []).length >= u.secrets) return null;
  if (u.event && (s.events || []).includes(u.event)) return null;
  if (u.prestige && (s.campaign.prestige || 0) >= u.prestige) return null;
  if (u.shop && (s.cosmetics || []).includes(key)) return null;
  return u.label;
}

export function unlockedEmotes() {
  return [...BASE_EMOTES, ...EXTRA_EMOTES.filter(([e]) => !cosmeticLock(`emote:${e}`))];
}

// Getragene Glücks-Kosmetik (für sich selbst oder andere Spieler anhand ihres Aussehens)
export function wornLucky(appearance = {}) {
  return Object.entries(LUCKY_COSMETICS).filter(([k]) => { const [cat, val] = k.split(':'); return appearance[cat] === val; }).map(([, d]) => d);
}

// Alle Kosmetik-Schlüssel, die gerade frei sind – für die Meldung „NEUES ITEM“
export function freeCosmetics() {
  return Object.keys(COSMETIC_UNLOCKS).filter(k => !cosmeticLock(k));
}

export function hasSecret(id) { return (Save.get().secrets || []).includes(id); }
export function secretCount() { return (Save.get().secrets || []).length; }
export const SECRET_TOTAL = Object.keys(SECRETS).length;

// Lieblingsspiel = meistgespieltes Spiel
export function favoriteGame(stats) {
  const g = stats.games || {};
  let best = null;
  for (const [k, v] of Object.entries(g)) if (!best || v > g[best]) best = k;
  return best;
}

// ───────────────────────── Persönliche Rekorde (dauerhaft, pro Spieler) ─────────────────────────
// fmt: 'money' | 'mult' | 'count' | 'time' (Sekunden, kleiner ist besser) | 'dildos'
export const RECORDS = {
  bestWin: { name: 'Höchster Einzelgewinn', fmt: 'money' },
  worstLoss: { name: 'Grösster Einzelverlust', fmt: 'money' },
  bestBalance: { name: 'Höchster eigener Geldstand (Bilanz)', fmt: 'money' },
  bestPot: { name: 'Grösster Team-Pot', fmt: 'money' },
  winStreak: { name: 'Längste Gewinnserie', fmt: 'count' },
  lossStreak: { name: 'Längste Verlustserie', fmt: 'count' },
  crashMult: { name: 'Höchster erfolgreicher Crash-Multiplikator', fmt: 'mult' },
  bj: { name: 'Grösster Blackjack-Gewinn', fmt: 'money' },
  roulette: { name: 'Grösster Roulette-Gewinn', fmt: 'money' },
  slots: { name: 'Grösster Slot-Gewinn', fmt: 'money' },
  plinko: { name: 'Grösster Plinko-Gewinn', fmt: 'money' },
  mines: { name: 'Grösster Mines-Gewinn', fmt: 'money' },
  tower: { name: 'Grösster Dragon-Tower-Gewinn', fmt: 'money' },
  runDildos: { name: 'Meiste 🍆 in einem Run', fmt: 'dildos' },
  fastestRun: { name: 'Schnellster Abschluss aller 15 Stockwerke', fmt: 'time', lower: true },
  floorNetBest: { name: 'Grösster Nettogewinn auf einem Stockwerk', fmt: 'money' },
  floorNetWorst: { name: 'Grösster Nettoverlust auf einem Stockwerk', fmt: 'money' },
};

export function fmtRecord(key, v) {
  const f = RECORDS[key]?.fmt;
  if (v === undefined || v === null) return '—';
  if (f === 'mult') return `${(+v).toFixed(2)}×`;
  if (f === 'count') return String(v);
  if (f === 'dildos') return `${v} 🍆`;
  if (f === 'time') { const s = Math.round(v); return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  return '$' + Math.floor(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

// Neuen Wert prüfen; gibt { old, value } zurück, wenn ein Rekord gebrochen wurde (sonst null)
export function checkRecord(key, value) {
  const def = RECORDS[key];
  if (!def || !Number.isFinite(value) || value <= 0) return null;
  const s = Save.get();
  s.records ||= {};
  const old = s.records[key];
  const better = old === undefined || (def.lower ? value < old : value > old);
  if (!better) return null;
  s.records[key] = value;
  Save.save();
  return { old, value };
}
