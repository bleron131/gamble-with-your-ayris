// Trophäen: Bedingungen (aus dem dauerhaften Spielstand) und 3D-Modelle für die Vitrine in der Shishabar
// und das Penthouse. Nicht freigeschaltete Trophäen erscheinen als dunkle Silhouetten.
import * as THREE from 'three';
import * as Save from '../save.js';
import { fmtMoney } from '../../shared/config.js';

export const TROPHIES = [
  { id: 'bronze', name: 'BRONZE AYRI', desc: 'Stock 5 geschafft', color: '#cd7f32', shape: 'cup', check: s => (s.campaign.everCompleted || []).includes(5) },
  { id: 'silver', name: 'SILBER AYRI', desc: 'Stock 10 geschafft', color: '#d8d8e0', shape: 'cup', check: s => (s.campaign.everCompleted || []).includes(10) },
  { id: 'gold', name: 'GOLDEN AYRI', desc: 'Alle 15 Stockwerke abgeschlossen', color: '#ffcf40', shape: 'big', check: s => (s.campaign.everCompleted || []).includes(15), detail: s => (s.records?.bestPot ? `Grösster Team-Pot: ${fmtMoney(s.records.bestPot)}` : '') },
  { id: 'prestige', name: 'PRESTIGE-STERN', desc: 'Ersten Prestige-Run gestartet', color: '#9b5de5', shape: 'star', check: s => (s.campaign.prestige || 0) >= 1 },
  { id: 'veteran', name: 'CASINO-VETERAN', desc: '10 Runs bis zum Finale gespielt', color: '#2bd9fe', shape: 'cup', check: s => (s.history || []).length >= 10 },
  { id: 'jackpot', name: 'JACKPOT-TROPHÄE', desc: 'Einen Slot-Jackpot geknackt', color: '#ff3cac', shape: 'diamond', check: s => (s.stats.slotJackpots || 0) >= 1, detail: s => (s.records?.slots ? `Grösster Slot-Gewinn: ${fmtMoney(s.records.slots)}` : '') },
  { id: 'fire', name: 'FEUER-TROPHÄE', desc: '10 Siege in Folge', color: '#ff7a1a', shape: 'flame', check: s => (s.records?.winStreak || 0) >= 10, detail: s => `Längste Gewinnserie: ${s.records?.winStreak || 0}` },
  { id: 'secrets', name: 'GEHEIMNIS-TROPHÄE', desc: 'Alle Geheimnisse gefunden', color: '#7cff6b', shape: 'diamond', check: s => !!s.achievements?.secret_hunter },
];

// Neue Trophäen mit Datum und Run-Nummer festhalten; gibt die neu verdienten zurück
export function updateTrophies() {
  const s = Save.get();
  s.trophies ||= {};
  const fresh = [];
  for (const t of TROPHIES) {
    if (s.trophies[t.id] || !t.check(s)) continue;
    s.trophies[t.id] = { at: Date.now(), run: (s.campaign.runs || 0) + 1, detail: t.detail?.(s) || '' };
    fresh.push(t);
  }
  if (fresh.length) Save.save();
  return fresh;
}

const mat = (c, locked) => new THREE.MeshStandardMaterial(locked ? { color: '#141018', roughness: 0.9 } : { color: c, metalness: 0.85, roughness: 0.22, emissive: c, emissiveIntensity: 0.08 });

export function trophyModel(t, locked, scale = 1) {
  const g = new THREE.Group();
  const m = mat(t.color, locked);
  const base = new THREE.MeshStandardMaterial({ color: locked ? '#0c0a10' : '#1a1a1a', roughness: 0.5 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), base));
  const add = (geo, y, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
  if (t.shape === 'cup' || t.shape === 'big') {
    const k = t.shape === 'big' ? 1.35 : 1;
    add(new THREE.CylinderGeometry(0.02 * k, 0.03 * k, 0.12 * k, 12), 0.09 * k);
    add(new THREE.CylinderGeometry(0.11 * k, 0.04 * k, 0.16 * k, 20, 1, true), 0.23 * k);
    for (const sx of [-1, 1]) { const h = add(new THREE.TorusGeometry(0.04 * k, 0.012 * k, 8, 16), 0.24 * k); h.position.x = sx * 0.11 * k; h.rotation.y = Math.PI / 2; }
  } else if (t.shape === 'star') {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.05 : 0.12, a = i / 10 * Math.PI * 2 + Math.PI / 2; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    add(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8), 0.09);
    const st = add(new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }), 0.27); st.position.z = -0.015;
  } else if (t.shape === 'diamond') {
    add(new THREE.OctahedronGeometry(0.11), 0.2);
  } else if (t.shape === 'flame') {
    add(new THREE.ConeGeometry(0.08, 0.26, 12), 0.2);
    add(new THREE.SphereGeometry(0.075, 12, 10), 0.12);
  }
  g.scale.setScalar(scale);
  g.userData.noBake = true;
  return g;
}
