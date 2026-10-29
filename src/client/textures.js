// Prozedurale Canvas-Texturen (keine externen Assets nötig).
import * as THREE from 'three';
import { WHEEL_ORDER, RED } from '../shared/games/roulette.js';
import { WHEEL_SEGMENTS } from '../shared/games/wheel.js';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function toTex(c, { repeat = null, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

const FONT = '"Bungee", "Arial Black", Impact, sans-serif';
const UIFONT = '"Nunito", "Arial", sans-serif';

export function feltTexture(color = '#0d6b3a') {
  return cached('felt' + color, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = color; g.fillRect(0, 0, 256, 256);
    const img = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    return toTex(c, { repeat: [2, 2] });
  });
}

export function carpetTexture(tier) {
  return cached('carpet' + tier, () => {
    const [c, g] = canvas(512, 512);
    const palettes = [
      ['#3a1020', '#5b1a2e', '#c8973a'], ['#1b1340', '#2d1f63', '#d4a640'], ['#2a0f2f', '#46184d', '#e2b65a'],
      ['#101b33', '#1a2c52', '#e8c36a'], ['#2b0a0a', '#4a1212', '#f0cf7a'], ['#120a1f', '#21123a', '#ffd97a'],
    ];
    const [bg, mid, accent] = palettes[Math.min(tier, 5)];
    g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
    g.globalAlpha = 0.9;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 128 + 64, cy = y * 128 + 64;
      g.fillStyle = mid;
      g.beginPath(); g.moveTo(cx, cy - 56); g.lineTo(cx + 56, cy); g.lineTo(cx, cy + 56); g.lineTo(cx - 56, cy); g.closePath(); g.fill();
      g.strokeStyle = accent; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.stroke();
      g.fillStyle = accent;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40, 5, 0, Math.PI * 2); g.fill(); }
      // Würfel/Karten-Symbole
      g.font = `bold 20px ${UIFONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(['♠', '♥', '♦', '♣'][(x + y) % 4], cx, cy);
    }
    g.globalAlpha = 1;
    const img = g.getImageData(0, 0, 512, 512);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    g.putImageData(img, 0, 0);
    return toTex(c, { repeat: [6, 6] });
  });
}

export function marbleTexture(base = '#f1ece4', vein = 'rgba(120,110,100,0.35)') {
  return cached('marble' + base, () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = vein; g.lineWidth = Math.random() * 2.5 + 0.5;
      g.beginPath();
      let x = Math.random() * 512, y = Math.random() * 512;
      g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += (Math.random() - 0.3) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    // Fliesenfugen
    g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 2;
    g.strokeRect(0, 0, 512, 512);
    return toTex(c, { repeat: [8, 8] });
  });
}

export function woodTexture(color = '#5a3418') {
  return cached('wood' + color, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = color; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(0,0,0,${Math.random() * 0.18})`;
      g.lineWidth = Math.random() * 3;
      const y = Math.random() * 256;
      g.beginPath(); g.moveTo(0, y);
      g.bezierCurveTo(80, y + (Math.random() - 0.5) * 20, 170, y + (Math.random() - 0.5) * 20, 256, y);
      g.stroke();
    }
    return toTex(c, { repeat: [2, 2] });
  });
}

export function tileTexture(a = '#2b2b2b', b = '#1f1f1f') {
  return cached('tile' + a + b, () => {
    const [c, g] = canvas(256, 256);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * 64, y * 64, 64, 64);
    }
    return toTex(c, { repeat: [10, 10] });
  });
}

export function wallpaperTexture(base, accent) {
  return cached('wall' + base + accent, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = accent; g.fillStyle = accent; g.globalAlpha = 0.35; g.lineWidth = 2;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const cx = x * 128 + 64 + (y % 2) * 0, cy = y * 128 + 64;
      g.beginPath(); g.ellipse(cx, cy, 26, 44, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(cx, cy, 12, 24, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx, cy - 60); g.lineTo(cx, cy - 46); g.moveTo(cx, cy + 46); g.lineTo(cx, cy + 60); g.stroke();
    }
    g.globalAlpha = 1;
    return toTex(c, { repeat: [4, 1.5] });
  });
}

export function neonTexture(text, color = '#ff3cac', { w = 1024, h = 256, font = FONT, size = 120, sub = null } = {}) {
  return cached('neon' + text + color + w + h + sub, () => {
    const [c, g] = canvas(w, h);
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${size}px ${font}`;
    const y = sub ? h * 0.4 : h / 2;
    for (const [blur, alpha] of [[40, 0.7], [20, 0.9], [6, 1]]) {
      g.shadowColor = color; g.shadowBlur = blur; g.globalAlpha = alpha;
      g.fillStyle = color; g.fillText(text, w / 2, y);
    }
    g.shadowBlur = 0; g.globalAlpha = 1;
    g.fillStyle = '#fff'; g.font = `${size * 0.92}px ${font}`;
    g.globalAlpha = 0.85; g.fillText(text, w / 2, y);
    if (sub) {
      g.font = `${size * 0.4}px ${font}`; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 12; g.globalAlpha = 1;
      g.fillText(sub, w / 2, h * 0.8);
    }
    return toTex(c);
  });
}

export function signTexture(lines, { bg = '#111', fg = '#ffd97a', w = 512, h = 256, border = '#ffd97a', size = 54 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => {
    const sz = i === 0 ? size : size * 0.55;
    g.font = `${sz}px ${i === 0 ? FONT : UIFONT}`;
    g.fillText(l, w / 2, h / 2 + (i - (arr.length - 1) / 2) * size * 0.95);
  });
  return toTex(c);
}

// ───────────────────────── Karten ─────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function cardTexture(card) {
  return cached(`card${card.r}-${card.s}`, () => {
    const [c, g] = canvas(180, 256);
    g.fillStyle = '#fbf8f1'; roundRect(g, 0, 0, 180, 256, 16); g.fill();
    g.strokeStyle = '#ccc'; g.lineWidth = 3; roundRect(g, 2, 2, 176, 252, 14); g.stroke();
    const red = card.s === 1 || card.s === 2;
    g.fillStyle = red ? '#d0182b' : '#141414';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 46px ${UIFONT}`;
    g.fillText(RANKS[card.r], 30, 34);
    g.font = `38px ${UIFONT}`;
    g.fillText(SUITS[card.s], 30, 76);
    g.save(); g.translate(150, 222); g.rotate(Math.PI);
    g.font = `bold 46px ${UIFONT}`; g.fillText(RANKS[card.r], 0, 0);
    g.font = `38px ${UIFONT}`; g.fillText(SUITS[card.s], 0, -42);
    g.restore();
    if (card.r > 10) {
      g.font = `bold 92px ${FONT}`; g.fillText(RANKS[card.r], 90, 132);
      g.strokeStyle = red ? '#d0182b' : '#141414'; g.lineWidth = 4; g.strokeRect(50, 66, 80, 130);
    } else {
      g.font = `110px ${UIFONT}`; g.fillText(SUITS[card.s], 90, 135);
    }
    return toTex(c);
  });
}

export function cardBackTexture() {
  return cached('cardback', () => {
    const [c, g] = canvas(180, 256);
    g.fillStyle = '#fbf8f1'; roundRect(g, 0, 0, 180, 256, 16); g.fill();
    g.fillStyle = '#7a1230'; roundRect(g, 10, 10, 160, 236, 10); g.fill();
    g.strokeStyle = '#e8c36a'; g.lineWidth = 2;
    for (let i = -256; i < 256; i += 14) { g.beginPath(); g.moveTo(10 + i, 10); g.lineTo(10 + i + 236, 246); g.stroke(); g.beginPath(); g.moveTo(170 - i, 10); g.lineTo(170 - i - 236, 246); g.stroke(); }
    g.fillStyle = '#7a1230'; g.beginPath(); g.arc(90, 128, 36, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8c36a'; g.font = `30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A', 90, 130);
    return toTex(c);
  });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ───────────────────────── Chips ─────────────────────────
export const CHIP_COLORS = ['#e8e8e8', '#d8262f', '#2a6fdb', '#1d9a4b', '#151515', '#7b3fc4', '#f2a516', '#e05fa8', '#2bc1c9', '#c0a060'];
export function chipColorFor(value, base) {
  const idx = Math.max(0, Math.min(CHIP_COLORS.length - 1, Math.round(Math.log10(Math.max(1, value / base)) * 1.5)));
  return CHIP_COLORS[idx];
}

export function chipSideTexture(color) {
  return cached('chipside' + color, () => {
    const [c, g] = canvas(256, 32);
    g.fillStyle = color; g.fillRect(0, 0, 256, 32);
    g.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 8, 0, 14, 32);
    return toTex(c);
  });
}

export function chipTopTexture(color, label = '') {
  return cached('chiptop' + color + label, () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = color; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) { g.save(); g.translate(64, 64); g.rotate(i * Math.PI / 4); g.fillRect(-7, -64, 14, 18); g.restore(); }
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.setLineDash([6, 5]);
    g.beginPath(); g.arc(64, 64, 38, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = color === '#e8e8e8' ? '#333' : '#fff';
    g.font = `bold ${label.length > 4 ? 18 : 24}px ${UIFONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 64, 66);
    return toTex(c);
  });
}

// ───────────────────────── Roulette ─────────────────────────
// Layout: Zahlenfeld 3 Reihen × 12 Spalten + 0 + Kolonnen + Dutzende + einfache Chancen
export function rouletteLayout() {
  return cached('rlayout', () => {
    const W = 1400, H = 560;
    const [c, g] = canvas(W, H);
    g.fillStyle = '#0c6a39'; g.fillRect(0, 0, W, H);
    const x0 = 110, y0 = 30, cw = 90, ch = 110;
    const regions = [];
    g.strokeStyle = '#f4f0e0'; g.lineWidth = 4;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // Null
    g.fillStyle = '#0c8a49';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y0 + ch * 3); g.lineTo(20, y0 + ch * 1.5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = `bold 52px ${UIFONT}`; g.fillText('0', 70, y0 + ch * 1.5);
    regions.push({ spot: 'n0', x: 20, y: y0, w: x0 - 20, h: ch * 3, cx: 65, cy: y0 + ch * 1.5 });
    for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row);
      const x = x0 + col * cw, y = y0 + row * ch;
      g.fillStyle = RED.has(n) ? '#c8102e' : '#111';
      g.fillRect(x + 8, y + 18, cw - 16, ch - 36);
      g.strokeRect(x, y, cw, ch);
      g.fillStyle = '#fff'; g.font = `bold 44px ${UIFONT}`;
      g.save(); g.translate(x + cw / 2, y + ch / 2); g.rotate(-Math.PI / 2); g.fillText(String(n), 0, 2); g.restore();
      regions.push({ spot: 'n' + n, x, y, w: cw, h: ch, cx: x + cw / 2, cy: y + ch / 2 });
    }
    // Kolonnen 2:1
    for (let row = 0; row < 3; row++) {
      const x = x0 + 12 * cw, y = y0 + row * ch;
      g.strokeRect(x, y, 110, ch);
      g.fillStyle = '#fff'; g.font = `bold 34px ${UIFONT}`; g.fillText('2:1', x + 55, y + ch / 2);
      regions.push({ spot: 'c' + (3 - row), x, y, w: 110, h: ch, cx: x + 55, cy: y + ch / 2 });
    }
    // Dutzende
    const yd = y0 + ch * 3;
    ['1. 12', '2. 12', '3. 12'].forEach((t, i) => {
      const x = x0 + i * cw * 4;
      g.strokeRect(x, yd, cw * 4, 90);
      g.fillStyle = '#fff'; g.font = `bold 40px ${UIFONT}`; g.fillText(t, x + cw * 2, yd + 45);
      regions.push({ spot: 'd' + (i + 1), x, y: yd, w: cw * 4, h: 90, cx: x + cw * 2, cy: yd + 45 });
    });
    // Einfache Chancen
    const ye = yd + 90;
    const outs = [['low', '1-18'], ['even', 'GERADE'], ['red', ''], ['black', ''], ['odd', 'UNGER.'], ['high', '19-36']];
    outs.forEach(([spot, t], i) => {
      const x = x0 + i * cw * 2;
      g.strokeRect(x, ye, cw * 2, 90);
      if (spot === 'red' || spot === 'black') {
        g.fillStyle = spot === 'red' ? '#c8102e' : '#111';
        g.beginPath(); g.moveTo(x + cw, ye + 14); g.lineTo(x + cw * 2 - 20, ye + 45); g.lineTo(x + cw, ye + 76); g.lineTo(x + 20, ye + 45); g.closePath(); g.fill();
        g.strokeStyle = '#f4f0e0'; g.lineWidth = 2; g.stroke(); g.lineWidth = 4;
      } else { g.fillStyle = '#fff'; g.font = `bold 32px ${UIFONT}`; g.fillText(t, x + cw, ye + 45); }
      regions.push({ spot, x, y: ye, w: cw * 2, h: 90, cx: x + cw, cy: ye + 45 });
    });
    return { texture: toTex(c), regions, W, H };
  });
}

export function rouletteRotorTexture() {
  return cached('rotor', () => {
    const S = 1024;
    const [c, g] = canvas(S, S);
    const cx = S / 2, cy = S / 2;
    g.fillStyle = '#3a1f0e'; g.fillRect(0, 0, S, S);
    const n = WHEEL_ORDER.length;
    const R1 = S * 0.5, R2 = S * 0.38, R3 = S * 0.3;
    for (let i = 0; i < n; i++) {
      // Fach i ist bei Winkel i/n zentriert (gegen den Uhrzeigersinn, Start bei +X)
      const a0 = (i - 0.5) / n * Math.PI * 2, a1 = (i + 0.5) / n * Math.PI * 2;
      const num = WHEEL_ORDER[i];
      g.fillStyle = num === 0 ? '#118a3e' : RED.has(num) ? '#c8102e' : '#141414';
      g.beginPath(); g.arc(cx, cy, R1, a0, a1); g.arc(cx, cy, R3, a1, a0, true); g.closePath(); g.fill();
      g.strokeStyle = '#d9b45a'; g.lineWidth = 4; g.stroke();
      g.save(); g.translate(cx, cy); g.rotate((i / n) * Math.PI * 2);
      g.fillStyle = '#fff'; g.font = `bold 40px ${UIFONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(R1 - 44, 0); g.rotate(Math.PI / 2); g.fillText(String(num), 0, 0);
      g.restore();
    }
    g.strokeStyle = '#d9b45a'; g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, R2, 0, Math.PI * 2); g.stroke();
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R3);
    grd.addColorStop(0, '#e9c46a'); grd.addColorStop(0.5, '#8a5a24'); grd.addColorStop(1, '#4a2a10');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R3, 0, Math.PI * 2); g.fill();
    return toTex(c);
  });
}

// ───────────────────────── Glücksrad ─────────────────────────
export const WHEEL_COLORS = { x1: '#f5c542', x3: '#2a9df4', x5: '#9b51e0', x10: '#27ae60', x20: '#eb5757', x50: '#111' };
export function wheelTexture() {
  return cached('bigwheel', () => {
    const S = 1024;
    const [c, g] = canvas(S, S);
    const cx = S / 2, cy = S / 2, n = WHEEL_SEGMENTS.length;
    g.fillStyle = '#5b3a12'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < n; i++) {
      const a0 = (i - 0.5) / n * Math.PI * 2, a1 = (i + 0.5) / n * Math.PI * 2;
      const seg = WHEEL_SEGMENTS[i];
      g.fillStyle = WHEEL_COLORS[seg];
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, S * 0.49, a0, a1); g.closePath(); g.fill();
      g.strokeStyle = '#e8c36a'; g.lineWidth = 3; g.stroke();
      g.save(); g.translate(cx, cy); g.rotate(i / n * Math.PI * 2);
      g.fillStyle = seg === 'x50' ? '#ffd700' : '#fff'; g.font = `bold 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(S * 0.4, 0); g.rotate(Math.PI / 2); g.fillText(seg.slice(1), 0, 0);
      g.restore();
    }
    g.fillStyle = '#e8c36a'; g.beginPath(); g.arc(cx, cy, S * 0.12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a1230'; g.font = `60px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A', cx, cy + 4);
    return toTex(c);
  });
}

// ───────────────────────── Slots ─────────────────────────
export function drawSymbol(g, sym, cx, cy, s) {
  g.save(); g.translate(cx, cy);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  switch (sym) {
    case 'cherry':
      g.strokeStyle = '#2f8a2f'; g.lineWidth = s * 0.06;
      g.beginPath(); g.moveTo(-s * 0.18, s * 0.05); g.quadraticCurveTo(0, -s * 0.45, s * 0.12, -s * 0.38); g.moveTo(s * 0.18, s * 0.1); g.quadraticCurveTo(s * 0.1, -s * 0.2, s * 0.12, -s * 0.38); g.stroke();
      g.fillStyle = '#d90429';
      g.beginPath(); g.arc(-s * 0.18, s * 0.15, s * 0.17, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(s * 0.18, s * 0.2, s * 0.17, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(-s * 0.23, s * 0.1, s * 0.04, 0, Math.PI * 2); g.fill();
      break;
    case 'lemon':
      g.fillStyle = '#ffd60a'; g.beginPath(); g.ellipse(0, 0, s * 0.34, s * 0.25, 0.3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#d4a400'; g.lineWidth = s * 0.03; g.stroke();
      break;
    case 'bell':
      g.fillStyle = '#ffb703';
      g.beginPath(); g.moveTo(-s * 0.32, s * 0.22); g.quadraticCurveTo(-s * 0.3, -s * 0.38, 0, -s * 0.36); g.quadraticCurveTo(s * 0.3, -s * 0.38, s * 0.32, s * 0.22); g.closePath(); g.fill();
      g.fillStyle = '#c77d00'; g.beginPath(); g.arc(0, s * 0.27, s * 0.08, 0, Math.PI * 2); g.fill();
      break;
    case 'bar':
      g.fillStyle = '#111'; g.fillRect(-s * 0.38, -s * 0.16, s * 0.76, s * 0.32);
      g.fillStyle = '#fff'; g.font = `${s * 0.26}px ${FONT}`; g.fillText('BAR', 0, s * 0.02);
      break;
    case 'seven':
      g.fillStyle = '#e63946'; g.strokeStyle = '#fff'; g.lineWidth = s * 0.03;
      g.font = `${s * 0.7}px ${FONT}`; g.strokeText('7', 0, s * 0.04); g.fillText('7', 0, s * 0.04);
      break;
    case 'diamond':
      g.fillStyle = '#4cc9f0';
      g.beginPath(); g.moveTo(0, -s * 0.34); g.lineTo(s * 0.3, -s * 0.08); g.lineTo(0, s * 0.36); g.lineTo(-s * 0.3, -s * 0.08); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.moveTo(0, -s * 0.34); g.lineTo(s * 0.12, -s * 0.08); g.lineTo(-s * 0.12, -s * 0.08); g.closePath(); g.fill();
      break;
    case 'crown':
      g.fillStyle = '#ffd700';
      g.beginPath(); g.moveTo(-s * 0.36, s * 0.24); g.lineTo(-s * 0.36, -s * 0.2); g.lineTo(-s * 0.18, s * 0.02); g.lineTo(0, -s * 0.32); g.lineTo(s * 0.18, s * 0.02); g.lineTo(s * 0.36, -s * 0.2); g.lineTo(s * 0.36, s * 0.24); g.closePath(); g.fill();
      g.fillStyle = '#e63946'; g.beginPath(); g.arc(0, s * 0.1, s * 0.06, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7a1230'; g.font = `${s * 0.12}px ${FONT}`; g.fillText('AYRI', 0, s * 0.38);
      break;
  }
  g.restore();
}

// Walzenstreifen horizontal (u = Umfang des Zylinders), Symbole um 90° gedreht
export function reelTexture(strip, symbols, gold = false) {
  return cached('reel' + strip.join('') + gold, () => {
    const cell = 128;
    const [c, g] = canvas(cell * strip.length, cell);
    for (let i = 0; i < strip.length; i++) {
      g.fillStyle = gold ? (i % 2 ? '#fff6dc' : '#fff1c8') : (i % 2 ? '#ffffff' : '#f3f3f3');
      const x = (strip.length - 1 - i) * cell; // umgekehrt, damit Symbol i+1 unter i erscheint
      g.fillRect(x, 0, cell, cell);
      g.save();
      g.translate(x + cell / 2, cell / 2);
      g.rotate(REEL_ROT);
      drawSymbol(g, symbols[strip[i]], 0, 0, cell * 0.9);
      g.restore();
    }
    const t = toTex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}
export const REEL_ROT = -Math.PI / 2;

// ───────────────────────── Craps ─────────────────────────
export function crapsLayout() {
  return cached('crapslayout', () => {
    const W = 1400, H = 640;
    const [c, g] = canvas(W, H);
    g.fillStyle = '#0b5f8a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#f4f0e0'; g.lineWidth = 5; g.textAlign = 'center'; g.textBaseline = 'middle';
    const regions = [];
    const box = (spot, x, y, w, h, title, sub, color) => {
      if (color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
      g.strokeRect(x, y, w, h);
      g.fillStyle = '#fff'; g.font = `${Math.min(64, h * 0.4)}px ${FONT}`; g.fillText(title, x + w / 2, y + h / 2 - (sub ? 14 : 0));
      if (sub) { g.font = `bold 26px ${UIFONT}`; g.fillStyle = '#ffe58a'; g.fillText(sub, x + w / 2, y + h / 2 + 30); }
      regions.push({ spot, x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
    };
    box('pass', 30, 500, 940, 110, 'PASS LINE', 'zahlt 1:1');
    box('dontpass', 30, 390, 940, 100, "DON'T PASS BAR", '12 = Push');
    box('field', 30, 190, 940, 190, 'FIELD', '2·3·4·9·10·11·12 – (2 zahlt 2:1, 12 zahlt 3:1)');
    box('odds', 30, 30, 460, 150, 'ODDS', 'echte Quoten', '#0a527a');
    // Point-Nummern Anzeige
    [4, 5, 6, 8, 9, 10].forEach((n, i) => {
      const x = 500 + i * 78;
      g.strokeRect(x, 30, 78, 150);
      g.fillStyle = '#fff'; g.font = `48px ${FONT}`; g.fillText(String(n), x + 39, 105);
    });
    g.fillStyle = '#7a1230'; g.fillRect(990, 30, 380, 580);
    g.strokeRect(990, 30, 380, 580);
    g.fillStyle = '#ffe58a'; g.font = `30px ${FONT}`; g.fillText('PROPOSITION', 1180, 70);
    box('any7', 1010, 110, 340, 140, 'ANY 7', 'zahlt 4:1');
    box('anycraps', 1010, 270, 340, 150, 'ANY CRAPS', '2·3·12 zahlt 7:1');
    box('yo', 1010, 440, 340, 150, 'YO 11', 'zahlt 15:1');
    return { texture: toTex(c), regions, W, H, pointX: n => 500 + [4, 5, 6, 8, 9, 10].indexOf(n) * 78 + 39 };
  });
}

export function diceFaceTexture(n, red = true) {
  return cached('die' + n + red, () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = red ? '#d61f2c' : '#f8f8f8'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = red ? '#fff' : '#111';
    const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]], 6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]] };
    for (const [x, y] of P[n]) { g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill(); }
    return toTex(c);
  });
}

// ───────────────────────── Tisch-Bedruckung ─────────────────────────
export function printedFelt(kind) {
  return cached('print' + kind, () => {
    const [c, g] = canvas(1024, 512);
    const col = kind === 'baccarat' ? '#5b0f1f' : kind === 'poker' ? '#0d3d6b' : '#0c6a39';
    g.fillStyle = col; g.fillRect(0, 0, 1024, 512);
    const img = g.getImageData(0, 0, 1024, 512);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    g.putImageData(img, 0, 0);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#e8d9a8'; g.fillStyle = '#e8d9a8'; g.lineWidth = 4;
    if (kind === 'blackjack') {
      g.font = `44px ${FONT}`; g.fillText('BLACKJACK PAYS 3 TO 2', 512, 150);
      g.font = `bold 26px ${UIFONT}`; g.fillText('Dealer must stand on all 17s', 512, 200);
      g.beginPath(); g.arc(512, 360, 60, 0, Math.PI * 2); g.stroke();
    } else if (kind === 'baccarat') {
      g.font = `42px ${FONT}`;
      [['PLAYER', 250], ['TIE 8:1', 512], ['BANKER', 774]].forEach(([t, x]) => { g.strokeRect(x - 120, 300, 240, 110); g.fillText(t, x, 355); });
      g.font = `bold 24px ${UIFONT}`; g.fillText('Banker zahlt 0.95 : 1', 512, 450);
    } else if (kind === 'poker') {
      g.font = `44px ${FONT}`; g.fillText("CASINO HOLD'EM", 512, 120);
      g.font = `bold 22px ${UIFONT}`; g.fillText('Royal 100:1 · Str. Flush 20:1 · Vierling 10:1 · Full House 3:1 · Flush 2:1 · sonst 1:1', 512, 170);
      for (let i = 0; i < 5; i++) g.strokeRect(272 + i * 100, 230, 80, 112);
      g.beginPath(); g.arc(380, 430, 40, 0, Math.PI * 2); g.stroke(); g.fillText('ANTE', 380, 430);
      g.beginPath(); g.arc(644, 430, 40, 0, Math.PI * 2); g.stroke(); g.fillText('CALL', 644, 430);
    }
    return toTex(c);
  });
}

export function skylineTexture(night = true) {
  return cached('skyline' + night, () => {
    const [c, g] = canvas(2048, 512);
    const grd = g.createLinearGradient(0, 0, 0, 512);
    if (night) { grd.addColorStop(0, '#05061a'); grd.addColorStop(0.6, '#1b1446'); grd.addColorStop(1, '#5a2a6a'); }
    else { grd.addColorStop(0, '#5aa0e8'); grd.addColorStop(1, '#f2c6a0'); }
    g.fillStyle = grd; g.fillRect(0, 0, 2048, 512);
    if (night) for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * 2048, Math.random() * 250, 2, 2); }
    if (night) { g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(1700, 90, 40, 0, Math.PI * 2); g.fill(); }
    for (let layer = 0; layer < 3; layer++) {
      let x = 0;
      while (x < 2048) {
        const w = 40 + Math.random() * 90, h = 120 + Math.random() * (260 - layer * 50);
        const shade = 12 + layer * 14;
        g.fillStyle = `rgb(${shade},${shade},${shade + 20})`;
        g.fillRect(x, 512 - h, w, h);
        if (night) for (let wy = 512 - h + 10; wy < 500; wy += 14) for (let wx = x + 6; wx < x + w - 6; wx += 11) {
          if (Math.random() < 0.45) { g.fillStyle = Math.random() < 0.8 ? 'rgba(255,214,120,0.9)' : 'rgba(150,200,255,0.9)'; g.fillRect(wx, wy, 5, 7); }
        }
        x += w + 4;
      }
    }
    return toTex(c);
  });
}

export function nameTagTexture(name, color = '#ffd97a') {
  const [c, g] = canvas(512, 128);
  g.fillStyle = 'rgba(10,6,20,0.65)'; roundRect(g, 40, 20, 432, 88, 40); g.fill();
  g.fillStyle = color; g.font = `bold 56px ${UIFONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 256, 66);
  return toTex(c);
}

export function coinFaceTexture(green) {
  return cached('coin' + green, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = green ? '#19c463' : '#e0283a'; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd97a'; g.lineWidth = 12; g.beginPath(); g.arc(128, 128, 116, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.font = `${green ? 52 : 64}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(green ? 'DOUBLE' : 'LOSS', 128, 132);
    return toTex(c);
  });
}

export function smokeTexture() {
  return cached('smoke', () => {
    const [c, g] = canvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(230,230,230,0.4)'); grd.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return toTex(c);
  });
}

export function confettiTexture() {
  return cached('confetti', () => {
    const [c, g] = canvas(16, 16);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 16);
    return toTex(c);
  });
}
