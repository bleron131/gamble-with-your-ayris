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
