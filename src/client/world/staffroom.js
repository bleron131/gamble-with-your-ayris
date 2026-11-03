// STAFF ROOM hinter der „STAFF ONLY“-Tür jedes Stockwerks (Prompt 15): geheimes Hinterzimmer im Rotlicht-Look –
// rote/pinke Neons, Samtsofas, Separee-Vorhang, Champagner-Bar, Personal-NPCs. Rein atmosphärisch, nichts Explizites.
// Zutritt nur mit Staff-Berechtigung (Developer-Testspieler Ayri000) – geprüft pro Spieler: Normale Spieler stoßen
// auch bei offener Tür an eine Sperre im Türrahmen, die Tür öffnen/schliessen kann nur, wer berechtigt ist.
import * as THREE from 'three';
import { M, mesh, neonSign, sofa, barCounter, labelPlane } from './props.js';
import { Character, npcAppearance } from '../character.js';

export const STAFF = { w: 6.2, d: 5.4, h: 3.2, door: 1.4 };

// dx = Türmitte (x) an der Rückwand z = -D/2
export function buildStaffRoom(world, dx) {
  const s = world.scene, D = world.D;
  const z1 = -D / 2, z0 = z1 - STAFF.d;
  const x0 = dx - 2.6, x1 = x0 + STAFF.w, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = STAFF.h;
  const g = new THREE.Group();
  // Raum: selbstleuchtende dunkle Rot-/Violett-Töne (kein zusätzliches Licht → keine Mehrkosten im Rest der Szene)
  const wall = new THREE.MeshStandardMaterial({ color: '#2a0614', emissive: '#3a0418', emissiveIntensity: 0.55, roughness: 0.9 });
  const floor = new THREE.MeshStandardMaterial({ color: '#3a0a1a', emissive: '#22030c', emissiveIntensity: 0.6, roughness: 0.7 });
  const ceil = new THREE.MeshStandardMaterial({ color: '#12020a', emissive: '#1a0210', emissiveIntensity: 0.5 });
  const fl = mesh(new THREE.PlaneGeometry(STAFF.w, STAFF.d), floor, cx, 0.002, cz, { cast: false }); fl.rotation.x = -Math.PI / 2; g.add(fl);
  const ce = mesh(new THREE.PlaneGeometry(STAFF.w, STAFF.d), ceil, cx, H, cz, { cast: false }); ce.rotation.x = Math.PI / 2; g.add(ce);
  for (const [x, z, w, ry] of [[cx, z0, STAFF.w, 0], [x0, cz, STAFF.d, Math.PI / 2], [x1, cz, STAFF.d, -Math.PI / 2]]) {
    const m = mesh(new THREE.PlaneGeometry(w, H), wall, x, H / 2, z, { cast: false }); m.rotation.y = ry; g.add(m);
  }
  // Rückseite der Casino-Wand (Innenseite des Hinterzimmers) mit Türöffnung
  for (const [a, b] of [[x0, dx - STAFF.door / 2 - 0.05], [dx + STAFF.door / 2 + 0.05, x1]]) {
    const m = mesh(new THREE.PlaneGeometry(b - a, H), wall, (a + b) / 2, H / 2, z1 - 0.01, { cast: false }); m.rotation.y = Math.PI; g.add(m);
  }
  const over = mesh(new THREE.PlaneGeometry(STAFF.door + 0.1, H - 2.7), wall, dx, 2.7 + (H - 2.7) / 2, z1 - 0.01, { cast: false }); over.rotation.y = Math.PI; g.add(over);
  // Neon-Leisten oben, roter Teppich, Schilder
  for (const [x, z, w, d] of [[cx, z0 + 0.03, STAFF.w, 0.04], [x0 + 0.03, cz, 0.04, STAFF.d], [x1 - 0.03, cz, 0.04, STAFF.d]]) g.add(mesh(new THREE.BoxGeometry(w, 0.05, d), M.glow('#ff2e88', 2.2), x, H - 0.12, z, { cast: false }));
  const rug = mesh(new THREE.PlaneGeometry(3.2, 2.4), M.std('#8a0f2e', 0.95), cx + 0.4, 0.01, cz - 0.3, { cast: false }); rug.rotation.x = -Math.PI / 2; g.add(rug);
  const sign = neonSign('PRIVATE LOUNGE', '#ff3c8c', 2.6, 0.55); sign.position.set(cx + 0.4, 2.45, z0 + 0.06); g.add(sign);
  const heart = neonSign('♥', '#ff2e63', 0.7, 0.6); heart.position.set(x1 - 0.06, 2.2, cz - 0.6); heart.rotation.y = -Math.PI / 2; g.add(heart);
  const staffSign = labelPlane(['STAFF ONLY · NO CAMERAS'], 1.6, 0.25, { size: 52, bg: '#1a0008', fg: '#ff9ac4', border: null });
  staffSign.position.set(dx, 2.95, z1 - 0.03); staffSign.rotation.y = Math.PI; g.add(staffSign);
  // Lounge: zwei Samtsofas, Tischchen mit Champagner
  const so1 = sofa('#7a0f2e', 2.2); so1.position.set(cx + 0.4, 0, z0 + 0.55); g.add(so1);
  world.addBox(cx + 0.4, z0 + 0.55, 2.3, 0.9, 0.9, 0.5);
  const so2 = sofa('#5a0a3a', 1.8); so2.position.set(x1 - 0.55, 0, cz - 0.1); so2.rotation.y = -Math.PI / 2; g.add(so2);
  world.addBox(x1 - 0.55, cz - 0.1, 0.9, 1.9, 0.9, 0.5);
  const tbl = new THREE.Group();
  tbl.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 24), M.std('#120408', 0.2, 0.3), 0, 0.48, 0));
  tbl.add(mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.46, 10), M.gold(), 0, 0.23, 0));
  const bucket = mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.18, 14), M.std('#d0d4dc', 0.15, 0.95), 0.12, 0.6, 0); tbl.add(bucket);
  tbl.add(mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.3, 10), M.std('#0f3a1a', 0.2, 0.3), 0.12, 0.72, 0));
  tbl.position.set(cx + 0.5, 0, cz - 0.4); g.add(tbl);
  world.addCircle(cx + 0.5, cz - 0.4, 0.5, 0.5);
  // Champagner-Bar an der linken Wand
  const bar = barCounter(2.6, '#1a0408'); bar.position.set(x0 + 0.65, 0, cz - 0.3); bar.rotation.y = Math.PI / 2; g.add(bar);
  world.addBox(x0 + 0.65, cz - 0.3, 0.9, 2.8, 1.15);
  // Separee: Samtvorhang in der Ecke (halb geöffnet)
  const curtainMat = M.std('#6a0a24', 0.95);
  for (let i = 0; i < 6; i++) { const c = mesh(new THREE.CylinderGeometry(0.09, 0.11, H - 0.2, 8), curtainMat, x1 - 0.3 - i * 0.16, (H - 0.2) / 2, z0 + 1.5 + Math.sin(i) * 0.05, { cast: false }); if (i > 3) c.position.x -= 0.5; g.add(c); }
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.05, 0.05), M.gold(), x1 - 0.9, H - 0.18, z0 + 1.5, { cast: false }));
  // Personal: Barkeeperin und Türsteher
  const bt = new Character(npcAppearance('bartender', 7)); bt.root.position.set(x0 + 0.25, 0, cz - 0.3); bt.root.rotation.y = Math.PI / 2; bt.setName?.('Roxy (Bar)', '#ff9ac4'); g.add(bt.root);
  const bouncer = new Character(npcAppearance('mafia', 3)); bouncer.root.position.set(dx + 1.2, 0, z1 - 0.7); bouncer.root.rotation.y = -0.6; bouncer.setName?.('Bruno (Security)', '#ffd97a'); g.add(bouncer.root);
  world.addCircle(dx + 1.2, z1 - 0.7, 0.32);
  world.updaters.push((dt, t) => { bt.update(dt); bouncer.update(dt); heart.scale.setScalar(1 + Math.sin(t * 3) * 0.06); });
  s.add(g);
  // Wände des Hinterzimmers (Kollision)
  const T = 0.3;
  world.addBox(cx, z0 - T / 2, STAFF.w + 2 * T, T);
  world.addBox(x0 - T / 2, cz, T, STAFF.d);
  world.addBox(x1 + T / 2, cz, T, STAFF.d);
  return { x0, x1, z0, z1, group: g };
}
