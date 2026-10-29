// Wiederverwendbare 3D-Requisiten.
import * as THREE from 'three';
import { neonTexture, woodTexture, marbleTexture, skylineTexture, signTexture } from '../textures.js';

export const M = {
  std: (color, rough = 0.6, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }),
  gold: () => new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.25, metalness: 0.9 }),
  brass: () => new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 0.35, metalness: 0.8 }),
  glow: (color, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }),
  glass: (color = '#88ccff', opacity = 0.35) => new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.05, metalness: 0.2 }),
};

export function mesh(geo, mat, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function roundedBox(w, h, d, r = 0.05) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r); shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d); shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.6, bevelSegments: 3, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, r, 0);
  return g;
}

export function sofa(color = '#7a1230', len = 2.2) {
  const g = new THREE.Group();
  const fab = M.std(color, 0.9);
  const dark = M.std(new THREE.Color(color).multiplyScalar(0.7), 0.9);
  g.add(mesh(roundedBox(len, 0.35, 0.8, 0.08), fab, 0, 0.12, 0));
  g.add(mesh(roundedBox(len, 0.6, 0.22, 0.08), dark, 0, 0.3, -0.36));
  for (const s of [-1, 1]) g.add(mesh(roundedBox(0.22, 0.45, 0.8, 0.08), dark, s * (len / 2 - 0.08), 0.18, 0));
  const n = Math.max(2, Math.round(len / 0.8));
  for (let i = 0; i < n; i++) {
    const c = mesh(roundedBox(len / n - 0.08, 0.14, 0.62, 0.06), fab, -len / 2 + (i + 0.5) * len / n, 0.44, 0.05);
    g.add(c);
    const pillow = mesh(new THREE.SphereGeometry(0.16, 12, 8), M.std(i % 2 ? '#e8c36a' : '#2a9d8f', 0.9), -len / 2 + (i + 0.5) * len / n, 0.66, -0.2);
    pillow.scale.set(1.2, 1, 0.5);
    g.add(pillow);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.12), M.gold(), sx * (len / 2 - 0.1), 0.06, sz * 0.3));
  return g;
}

export function lowTable(r = 0.55, top = '#2a1a10') {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, 0.06, 32), M.std(top, 0.3, 0.1, { map: woodTexture(top) }), 0, 0.42, 0));
  g.add(mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.02, 32), M.gold(), 0, 0.39, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.2, 0.38, 16), M.gold(), 0, 0.2, 0));
  return g;
}

export function shisha(color = '#2a9df4') {
  const g = new THREE.Group();
  const glass = M.glass(color, 0.6);
  const metal = M.brass();
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.03 + Math.sin(t * Math.PI) * 0.14 + (t < 0.2 ? 0.02 : 0), t * 0.3)); }
  g.add(mesh(new THREE.LatheGeometry(pts, 24), glass, 0, 0, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.45, 12), metal, 0, 0.5, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.02, 20), metal, 0, 0.62, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.08, 16), M.std('#7a4a21', 0.8), 0, 0.74, 0));
  const coal = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), M.glow('#ff5a1a', 3), 0, 0.79, 0);
  coal.userData.coal = true;
  g.add(coal);
  // Schlauch
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.03, 0.45, 0), new THREE.Vector3(0.25, 0.42, 0.05), new THREE.Vector3(0.4, 0.2, 0.15), new THREE.Vector3(0.5, 0.45, 0.25), new THREE.Vector3(0.55, 0.5, 0.3),
  ]);
  g.add(mesh(new THREE.TubeGeometry(curve, 30, 0.012, 8), M.std('#3a2a5a', 0.6)));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.12, 8), metal, 0.56, 0.54, 0.31));
  g.userData.smoke = new THREE.Vector3(0, 0.82, 0);
  return g;
}

export function plant(h = 1.4) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 16), M.std('#d4b483', 0.7), 0, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16), M.std('#3b2a1a', 1), 0, 0.39, 0));
  const leaf = M.std('#2f8a3e', 0.7);
  const leaf2 = M.std('#3fae55', 0.7);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const l = mesh(new THREE.SphereGeometry(0.18, 10, 8), i % 2 ? leaf : leaf2, Math.cos(a) * 0.15, 0.5 + (h - 0.5) * (0.4 + (i % 3) * 0.25), Math.sin(a) * 0.15);
    l.scale.set(0.6, 1.6, 0.25);
    l.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    g.add(l);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, h - 0.4, 6), M.std('#5a3a1a'), 0, 0.4 + (h - 0.4) / 2, 0));
  return g;
}

export function palm(h = 2.6) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.5, 16), M.gold(), 0, 0.25, 0));
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.CylinderGeometry(0.07 - i * 0.004, 0.08 - i * 0.004, (h - 0.6) / 6, 8), M.std('#7a5a3a', 0.9), Math.sin(i * 0.4) * 0.03, 0.5 + (i + 0.5) * (h - 0.6) / 6, 0));
  const leaf = M.std('#2f8a3e', 0.7, 0, { side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const l = mesh(new THREE.PlaneGeometry(0.25, 1.1, 1, 4), leaf, Math.cos(a) * 0.45, h - 0.15, Math.sin(a) * 0.45);
    const pos = l.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, -Math.pow((pos.getY(k) + 0.55) / 1.1, 2) * 0.5);
    l.geometry.computeVertexNormals();
    l.rotation.set(-Math.PI / 2 + 0.5, 0, -a + Math.PI / 2);
    l.rotation.order = 'YXZ';
    l.rotation.y = -a + Math.PI / 2;
    g.add(l);
  }
  return g;
}

export function neonSign(text, color, w = 3, h = 0.75, opts = {}) {
  const tex = neonTexture(text, color, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  m.material.color.setScalar(0.92);
  return m;
}

export function labelPlane(lines, w = 1.2, h = 0.6, opts = {}) {
  const tex = signTexture(lines, opts);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: opts.glow ?? 0.35 }));
}

export function barCounter(len = 6, color = '#3a1f10') {
  const g = new THREE.Group();
  const wood = M.std(color, 0.4, 0.1, { map: woodTexture(color) });
  g.add(mesh(new THREE.BoxGeometry(len, 1.05, 0.7), wood, 0, 0.525, 0));
  g.add(mesh(new THREE.BoxGeometry(len + 0.2, 0.06, 0.9), M.std('#111', 0.15, 0.3, { map: marbleTexture('#222', 'rgba(255,215,130,0.25)') }), 0, 1.08, 0));
  g.add(mesh(new THREE.BoxGeometry(len, 0.04, 0.02), M.glow('#ff9f43', 2.5), 0, 0.15, 0.36, { cast: false }));
  // Rückregal mit Flaschen
  const shelf = new THREE.Group();
  shelf.position.set(0, 0, -1.2);
  shelf.add(mesh(new THREE.BoxGeometry(len, 2.6, 0.35), M.std('#1a0f08', 0.6), 0, 1.3, 0));
  const colors = ['#2a9d8f', '#e76f51', '#f4a261', '#8ab17d', '#9b5de5', '#ffd166', '#ef476f', '#d4e6f1'];
  for (let row = 0; row < 3; row++) {
    shelf.add(mesh(new THREE.BoxGeometry(len - 0.1, 0.03, 0.4), M.std('#d4af37', 0.3, 0.8), 0, 1.1 + row * 0.55, 0.12));
    shelf.add(mesh(new THREE.BoxGeometry(len - 0.1, 0.02, 0.02), M.glow('#ff6bd6', 1.5), 0, 1.09 + row * 0.55, 0.32, { cast: false }));
    for (let i = 0; i < len * 4; i++) {
      const x = -len / 2 + 0.15 + i * 0.25;
      if (x > len / 2 - 0.1) break;
      const c = colors[(i * 7 + row * 3) % colors.length];
      const b = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.28, 10), M.glass(c, 0.85), x, 1.26 + row * 0.55, 0.12);
      shelf.add(b);
      shelf.add(mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.1, 6), M.glass(c, 0.9), x, 1.44 + row * 0.55, 0.12));
    }
  }
  g.add(shelf);
  // Barhocker
  for (let i = 0; i < Math.floor(len / 1.1); i++) {
    const s = new THREE.Group();
    s.position.set(-len / 2 + 0.6 + i * 1.1, 0, 0.75);
    s.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 20), M.std('#7a1230', 0.8), 0, 0.72, 0));
    s.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), M.gold(), 0, 0.36, 0));
    s.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), M.gold(), 0, 0.015, 0));
    g.add(s);
  }
  return g;
}

export function chandelier(scale = 1) {
  const g = new THREE.Group();
  const gold = M.gold();
  const crystal = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe9b0', emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.9 });
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), gold, 0, 0.4, 0, { cast: false }));
  for (let ring = 0; ring < 3; ring++) {
    const r = (0.4 + ring * 0.3) * scale;
    const y = -ring * 0.25 * scale;
    const t = mesh(new THREE.TorusGeometry(r, 0.025, 8, 40), gold, 0, y, 0, { cast: false });
    t.rotation.x = Math.PI / 2;
    g.add(t);
    const n = 8 + ring * 6;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const c = mesh(new THREE.OctahedronGeometry(0.05 * scale), crystal, Math.cos(a) * r, y - 0.1, Math.sin(a) * r, { cast: false });
      c.scale.y = 1.8;
      g.add(c);
      if (i % 2 === 0) g.add(mesh(new THREE.SphereGeometry(0.04 * scale, 8, 6), M.glow('#fff1c1', 3), Math.cos(a) * r, y + 0.06, Math.sin(a) * r, { cast: false }));
    }
  }
  return g;
}

export function pendantLamp(color = '#ffb35c') {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 4), M.std('#111'), 0, 0.6, 0, { cast: false }));
  const shade = mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.std('#c9902c', 0.3, 0.7, { side: THREE.DoubleSide }), 0, 0, 0, { cast: false });
  g.add(shade);
  g.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), M.glow(color, 4), 0, -0.02, 0, { cast: false }));
  return g;
}

export function rug(w, d, color = '#7a1230', border = '#e8c36a') {
  const g = new THREE.Group();
  const r = mesh(new THREE.PlaneGeometry(w, d), M.std(color, 1), 0, 0.012, 0, { cast: false });
  r.rotation.x = -Math.PI / 2;
  g.add(r);
  const b = mesh(new THREE.RingGeometry(0.1, 0.12, 4, 1), M.std(border, 1), 0, 0.014, 0, { cast: false });
  b.visible = false;
  for (const [x, z, ww, dd] of [[0, d / 2 - 0.08, w, 0.08], [0, -d / 2 + 0.08, w, 0.08], [w / 2 - 0.08, 0, 0.08, d], [-w / 2 + 0.08, 0, 0.08, d]]) {
    const e = mesh(new THREE.PlaneGeometry(ww, dd), M.std(border, 1), x, 0.014, z, { cast: false });
    e.rotation.x = -Math.PI / 2;
    g.add(e);
  }
  return g;
}

export function pillar(h, marble = true, r = 0.35) {
  const g = new THREE.Group();
  const mm = marble ? M.std('#f1ece4', 0.25, 0, { map: marbleTexture() }) : M.std('#2a1a3a', 0.5);
  g.add(mesh(new THREE.CylinderGeometry(r, r, h, 24), mm, 0, h / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(r + 0.08, r + 0.1, 0.2, 24), M.gold(), 0, 0.1, 0));
  g.add(mesh(new THREE.CylinderGeometry(r + 0.1, r + 0.06, 0.2, 24), M.gold(), 0, h - 0.1, 0));
  return g;
}

export function velvetRope(len) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 10), M.gold(), s * len / 2, 0.45, 0));
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), M.gold(), s * len / 2, 0.92, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.04, 16), M.gold(), s * len / 2, 0.02, 0));
  }
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-len / 2, 0.85, 0), new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(len / 2, 0.85, 0));
  g.add(mesh(new THREE.TubeGeometry(curve, 20, 0.025, 8), M.std('#a4122f', 0.8)));
  return g;
}

export function skylineWindow(w, h, night = true) {
  const g = new THREE.Group();
  const tex = skylineTexture(night).clone();
  tex.needsUpdate = true;
  tex.repeat.set(w / 20, 1);
  tex.offset.x = Math.random();
  tex.wrapS = THREE.RepeatWrapping;
  const view = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  view.material.color.setScalar(night ? 0.95 : 1);
  g.add(view);
  const frame = M.std('#111', 0.4, 0.6);
  const n = Math.max(2, Math.round(w / 2.2));
  for (let i = 0; i <= n; i++) g.add(mesh(new THREE.BoxGeometry(0.08, h, 0.08), frame, -w / 2 + i * w / n, 0, 0.04, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(w, 0.1, 0.1), frame, 0, h / 2, 0.04, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(w, 0.1, 0.1), frame, 0, -h / 2, 0.04, { cast: false }));
  return g;
}

export function painting(w, h, hue = 0) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 0, 256, 192);
  grd.addColorStop(0, `hsl(${hue},60%,30%)`); grd.addColorStop(1, `hsl(${hue + 60},70%,55%)`);
  x.fillStyle = grd; x.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 6; i++) { x.fillStyle = `hsla(${hue + i * 40},80%,60%,0.6)`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 192, 20 + Math.random() * 40, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  g.add(mesh(new THREE.PlaneGeometry(w, h), M.std('#fff', 0.8, 0, { map: t }), 0, 0, 0.03, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.05), M.gold(), 0, 0, 0, { cast: false }));
  return g;
}

export function speaker() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.5, 1, 0.45), M.std('#111', 0.7), 0, 0.5, 0));
  for (const [y, r] of [[0.7, 0.13], [0.35, 0.18]]) {
    const c = mesh(new THREE.CylinderGeometry(r, r, 0.03, 20), M.std('#333', 0.4, 0.3), 0, y, 0.23);
    c.rotation.x = Math.PI / 2;
    g.add(c);
  }
  return g;
}

// Aufzug mit animierbaren Türen
export function elevator({ frame = '#d4af37', door = '#b8b8c0', width = 2.4, label = 'ELEVATOR' } = {}) {
  const g = new THREE.Group();
  const fm = new THREE.MeshStandardMaterial({ color: frame, roughness: 0.25, metalness: 0.9 });
  const dm = new THREE.MeshStandardMaterial({ color: door, roughness: 0.2, metalness: 0.95 });
  const H = 3;
  g.add(mesh(new THREE.BoxGeometry(width + 0.6, 0.3, 0.3), fm, 0, H + 0.15, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.3, H, 0.3), fm, s * (width / 2 + 0.15), H / 2, 0));
  // Kabine
  const cab = M.std('#3a2a1a', 0.5, 0.2, { map: woodTexture('#5a3a1a') });
  g.add(mesh(new THREE.BoxGeometry(width, H, 0.05), cab, 0, H / 2, -1.8));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.05, H, 1.8), cab, s * width / 2, H / 2, -0.9));
  g.add(mesh(new THREE.BoxGeometry(width, 0.05, 1.8), M.std('#222', 0.3), 0, 0.01, -0.9));
  g.add(mesh(new THREE.BoxGeometry(width, 0.05, 1.8), M.glow('#fff4d6', 0.35), 0, H - 0.02, -0.9, { cast: false }));
  const doors = [];
  for (const s of [-1, 1]) {
    const d = mesh(new THREE.BoxGeometry(width / 2, H - 0.05, 0.06), dm, s * width / 4, H / 2, 0.02);
    d.userData.closedX = s * width / 4;
    d.userData.openX = s * (width / 2 + width / 4 - 0.05);
    g.add(d);
    doors.push(d);
    const line = mesh(new THREE.BoxGeometry(0.02, H - 0.2, 0.065), fm, -s * 0.02, 0, 0.0);
    d.add(line);
  }
  // Anzeige
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  disp.material.color.setScalar(0.9);
  disp.position.set(0, H + 0.15, 0.16);
  g.add(disp);
  const setDisplay = (txt, arrow = '') => {
    const x = c.getContext('2d');
    x.fillStyle = '#0a0505'; x.fillRect(0, 0, 256, 96);
    x.fillStyle = '#ff4630'; x.shadowColor = '#ff4630'; x.shadowBlur = 12;
    x.font = '56px "Bungee", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(arrow + txt, 128, 52);
    tex.needsUpdate = true;
  };
  setDisplay('L');
  const lbl = neonSign(label, '#ffd97a', 2.4, 0.5);
  lbl.position.set(0, H + 0.7, 0.1);
  g.add(lbl);
  // Bedienfeld
  const panel = mesh(new THREE.BoxGeometry(0.25, 0.45, 0.05), fm, width / 2 + 0.55, 1.3, 0.1);
  g.add(panel);
  for (let i = 0; i < 2; i++) panel.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), M.glow('#ffd97a', 1.5), 0, 0.1 - i * 0.18, 0.03)).children.at(-1).rotation.x = Math.PI / 2;
  let open = 0, target = 0;
  g.userData = {
    doors, setDisplay,
    setOpen(v) { target = v ? 1 : 0; },
    snap(v) { open = target = v ? 1 : 0; for (const d of doors) d.position.x = THREE.MathUtils.lerp(d.userData.closedX, d.userData.openX, open); },
    update(dt) {
      open += (target - open) * Math.min(1, dt * 2.5);
      for (const d of doors) d.position.x = THREE.MathUtils.lerp(d.userData.closedX, d.userData.openX, open);
    },
  };
  return g;
}
