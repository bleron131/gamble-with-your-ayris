// Prozedurale Musik & Soundeffekte (WebAudio, keine externen Dateien).
let ctx = null;
let master, musicBus, sfxBus, ambBus, lowpass;
let noiseBuf = null;
const settings = { master: 0.8, music: 0.55, sfx: 0.9 };

export function initAudio(s) {
  Object.assign(settings, s || {});
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.7;
  master.connect(lowpass).connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  setInterval(schedule, 50);
}

// Mobile: Audio nach Unterbrechungen (Anruf, Tab-Wechsel, iOS) beim nächsten Antippen fortsetzen
export function resumeAudio() { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }

export function setVolumes(s) { Object.assign(settings, s); applyVolumes(); }
function applyVolumes() {
  if (!ctx) return;
  master.gain.value = settings.master;
  musicBus.gain.value = settings.music * (duck ? 0.18 : 1);
  sfxBus.gain.value = settings.sfx;
  ambBus.gain.value = settings.sfx * 0.6;
}

let duck = false;
export function setDuck(on) {
  duck = on;
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(settings.music * (on ? 0.18 : 1), ctx.currentTime, 0.3);
}

const now = () => ctx.currentTime;

// Lautstärke für Geräusche entfernter Automaten: sfxAt(0.3, () => sfx.win())
let outBus = null;
export function sfxAt(vol, fn) {
  if (!ctx) return;
  if (vol >= 0.98) { fn(); return; }
  if (vol < 0.03) return;
  const g = ctx.createGain(); g.gain.value = vol; g.connect(sfxBus);
  outBus = g;
  try { fn(); } finally { outBus = null; }
  setTimeout(() => g.disconnect(), 8000);
}
const bus0 = () => outBus || sfxBus;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function env(g, t, a, d, peak, sus = 0, rel = 0.1, len = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  if (len) {
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || peak * 0.6), t + a + d);
    g.gain.setValueAtTime(Math.max(0.0001, sus || peak * 0.6), t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + rel);
  } else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq, t, dur, { type = 'sine', vol = 0.2, a = 0.005, bus = bus0(), filter = 0, detune = 0, slide = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  o.detune.value = detune;
  const g = ctx.createGain();
  env(g, t, a, dur, vol);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
  node.connect(g).connect(bus);
  o.start(t); o.stop(t + a + dur + 0.05);
}

function noise(t, dur, { vol = 0.2, type = 'bandpass', freq = 2000, q = 1, bus = bus0(), a = 0.002, sweep = 0 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ctx.createGain();
  env(g, t, a, dur, vol);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random()); s.stop(t + dur + a + 0.05);
}

// ───────────────────────── Soundeffekte ─────────────────────────
export const sfx = {
  click() { if (!ctx) return; tone(900, now(), 0.04, { type: 'square', vol: 0.05, filter: 3000 }); },
  error() { if (!ctx) return; tone(220, now(), 0.15, { type: 'square', vol: 0.08, filter: 1200 }); tone(180, now() + 0.12, 0.2, { type: 'square', vol: 0.08, filter: 1200 }); },
  chip() {
    if (!ctx) return;
    const t = now();
    for (let i = 0; i < 2; i++) noise(t + i * 0.035, 0.04, { freq: 4500 + Math.random() * 2000, q: 6, vol: 0.25 });
    tone(2400 + Math.random() * 300, t, 0.05, { vol: 0.05 });
  },
  chips(n = 6) { if (!ctx) return; for (let i = 0; i < n; i++) setTimeout(() => sfx.chip(), i * 45 + Math.random() * 30); },
  card() { if (!ctx) return; noise(now(), 0.08, { freq: 3000, q: 0.8, vol: 0.18, sweep: 1200 }); },
  flip() { if (!ctx) return; noise(now(), 0.05, { freq: 5000, q: 1.5, vol: 0.12 }); },
  lever() { if (!ctx) return; const t = now(); noise(t, 0.25, { freq: 400, q: 2, vol: 0.2, sweep: 150 }); tone(120, t + 0.2, 0.1, { type: 'square', vol: 0.08, filter: 600 }); },
  reelTick() { if (!ctx) return; tone(1500 + Math.random() * 200, now(), 0.02, { type: 'square', vol: 0.025, filter: 2500 }); },
  reelStop() { if (!ctx) return; const t = now(); tone(180, t, 0.12, { type: 'triangle', vol: 0.2 }); noise(t, 0.06, { freq: 900, vol: 0.12 }); },
  rouletteSpin(dur = 7) {
    if (!ctx) return;
    const t = now();
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
    g.gain.setValueAtTime(0.12, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfxBus); s.start(t); s.stop(t + dur + 0.1);
  },
  ballBounce() { if (!ctx) return; const t = now(); for (let i = 0; i < 5; i++) tone(3000 - i * 200, t + i * (0.12 - i * 0.015), 0.03, { type: 'triangle', vol: 0.12 / (i + 1) }); },
  dice() {
    if (!ctx) return;
    const t = now();
    for (let i = 0; i < 8; i++) noise(t + i * 0.09 + Math.random() * 0.05, 0.05, { freq: 1500 + Math.random() * 1500, q: 4, vol: 0.25 / (1 + i * 0.3) });
  },
  diceHit() { if (!ctx) return; noise(now(), 0.06, { freq: 1200, q: 5, vol: 0.3 }); },
  wheelTick(vol = 0.08) { if (!ctx) return; tone(2200, now(), 0.015, { type: 'square', vol, filter: 4000 }); noise(now(), 0.02, { freq: 3000, q: 5, vol: vol * 1.2 }); },
  ding() { if (!ctx) return; const t = now(); tone(1318, t, 1.4, { vol: 0.15 }); tone(1046, t + 0.25, 1.6, { vol: 0.13 }); },
  doors() { if (!ctx) return; noise(now(), 1.1, { type: 'lowpass', freq: 500, vol: 0.12, a: 0.2 }); },
  whoosh() { if (!ctx) return; noise(now(), 0.5, { freq: 400, q: 0.7, vol: 0.2, sweep: 3000, a: 0.1 }); },
  win() {
    if (!ctx) return;
    const t = now();
    [72, 76, 79, 84].forEach((m, i) => tone(mtof(m), t + i * 0.08, 0.25, { type: 'triangle', vol: 0.12 }));
  },
  bigWin() {
    if (!ctx) return;
    const t = now();
    [60, 64, 67, 72, 76, 79, 84, 88].forEach((m, i) => tone(mtof(m), t + i * 0.07, 0.4, { type: 'square', vol: 0.06, filter: 3000 }));
    for (let i = 0; i < 20; i++) tone(mtof(84 + (i % 5) * 2), t + 0.6 + i * 0.05, 0.08, { type: 'triangle', vol: 0.05 });
    sfx.chips(14);
  },
  jackpot() {
    if (!ctx) return;
    const t = now();
    for (let r = 0; r < 4; r++) [72, 76, 79, 84, 79, 76].forEach((m, i) => tone(mtof(m + r * 2), t + r * 0.5 + i * 0.07, 0.15, { type: 'square', vol: 0.06, filter: 4000 }));
    for (let i = 0; i < 40; i++) setTimeout(() => sfx.chip(), 300 + i * 50);
    tone(mtof(48), t, 2.5, { type: 'sawtooth', vol: 0.08, filter: 800 });
  },
  lose() { if (!ctx) return; const t = now(); tone(mtof(64), t, 0.25, { type: 'triangle', vol: 0.1 }); tone(mtof(60), t + 0.22, 0.4, { type: 'triangle', vol: 0.1, slide: 0.94 }); },
  heartbeat() {
    if (!ctx) return;
    const t = now();
    tone(55, t, 0.12, { vol: 0.5, slide: 0.6 }); tone(50, t + 0.22, 0.14, { vol: 0.4, slide: 0.6 });
  },
  explosion() {
    if (!ctx) return;
    const t = now();
    noise(t, 2.5, { type: 'lowpass', freq: 3000, vol: 0.9, sweep: 80, a: 0.005 });
    tone(80, t, 1.5, { type: 'sine', vol: 0.8, slide: 0.3 });
    tone(140, t, 0.6, { type: 'square', vol: 0.2, slide: 0.2, filter: 600 });
  },
  boing() { if (!ctx) return; tone(300, now(), 0.4, { type: 'sine', vol: 0.2, slide: 2.5 }); },
  coinFlip() { if (!ctx) return; const t = now(); for (let i = 0; i < 18; i++) tone(5200, t + i * 0.07, 0.02, { vol: 0.03 }); tone(3000, t, 0.3, { vol: 0.08, slide: 1.4 }); },
  coinLand() { if (!ctx) return; const t = now(); [0, 0.12, 0.2, 0.26, 0.3].forEach((d, i) => tone(4200 - i * 300, t + d, 0.15, { vol: 0.15 / (i + 1), type: 'triangle' })); },
  drumroll(dur = 2) { if (!ctx) return; const t = now(); for (let i = 0; i < dur * 22; i++) noise(t + i / 22, 0.05, { freq: 800, q: 1, vol: 0.05 + 0.15 * (i / (dur * 22)) }); },
  cheer() {
    if (!ctx) return;
    const t = now();
    noise(t, 2.2, { freq: 1200, q: 0.5, vol: 0.18, a: 0.15 });
    for (let i = 0; i < 6; i++) tone(500 + Math.random() * 400, t + Math.random() * 0.8, 0.3, { type: 'sawtooth', vol: 0.02, filter: 1800, slide: 1.3 });
  },
  aww() { if (!ctx) return; const t = now(); for (let i = 0; i < 5; i++) tone(320 + i * 30, t + i * 0.03, 1.2, { type: 'sawtooth', vol: 0.025, filter: 900, slide: 0.7 }); },
  shop() { if (!ctx) return; const t = now(); tone(1568, t, 0.1, { vol: 0.1 }); tone(2093, t + 0.08, 0.3, { vol: 0.1 }); },
  pop() { if (!ctx) return; tone(600, now(), 0.08, { vol: 0.12, slide: 2 }); },
  register() { if (!ctx) return; const t = now(); noise(t, 0.08, { freq: 3000, q: 2, vol: 0.15 }); tone(2637, t + 0.06, 0.25, { vol: 0.12 }); tone(3136, t + 0.14, 0.4, { vol: 0.1 }); },
  bottle() { if (!ctx) return; const t = now(); tone(1760, t, 0.5, { vol: 0.08 }); tone(2349, t + 0.02, 0.4, { vol: 0.05 }); noise(t, 0.03, { freq: 6000, q: 4, vol: 0.06 }); },
  open() { if (!ctx) return; const t = now(); noise(t, 0.12, { freq: 2500, q: 1, vol: 0.2, sweep: 600 }); tone(400, t + 0.05, 0.08, { vol: 0.08, slide: 1.8 }); },
  gulp() { if (!ctx) return; const t = now(); tone(180, t, 0.12, { vol: 0.25, slide: 0.55 }); noise(t, 0.1, { type: 'lowpass', freq: 500, vol: 0.12 }); },
  dizzy() {
    if (!ctx) return;
    const t = now();
    tone(300, t, 0.45, { type: 'sine', vol: 0.2, slide: 2.5 });
    tone(1400, t + 0.4, 1.4, { type: 'sine', vol: 0.12, slide: 0.25 });
    for (let i = 0; i < 6; i++) tone(2000 + i * 260, t + 0.5 + i * 0.12, 0.12, { type: 'triangle', vol: 0.04 });
  },
  // Spielautomat: mechanischer Knopf, Gewinnstufen
  button() { if (!ctx) return; const t = now(); noise(t, 0.03, { freq: 2500, q: 3, vol: 0.18 }); tone(140, t, 0.06, { type: 'square', vol: 0.06, filter: 700 }); tone(1900, t + 0.015, 0.05, { type: 'triangle', vol: 0.06 }); },
  denied() { if (!ctx) return; const t = now(); tone(330, t, 0.08, { type: 'square', vol: 0.05, filter: 1500 }); tone(250, t + 0.09, 0.12, { type: 'square', vol: 0.05, filter: 1500 }); },
  slotLoss() { if (!ctx) return; const t = now(); tone(392, t, 0.09, { type: 'triangle', vol: 0.06 }); tone(330, t + 0.09, 0.14, { type: 'triangle', vol: 0.05 }); },
  coins(n = 10) { if (!ctx) return; for (let i = 0; i < n; i++) setTimeout(() => { const t = now(); tone(3800 + Math.random() * 1600, t, 0.07, { type: 'triangle', vol: 0.05 }); noise(t, 0.03, { freq: 6000, q: 5, vol: 0.06 }); }, i * 60 + Math.random() * 40); },
  smallWin() { if (!ctx) return; const t = now(); [76, 79, 84].forEach((m, i) => tone(mtof(m), t + i * 0.07, 0.22, { type: 'triangle', vol: 0.11 })); },
  mediumWin() {
    if (!ctx) return;
    const t = now();
    [72, 76, 79, 84, 88].forEach((m, i) => tone(mtof(m), t + i * 0.08, 0.3, { type: 'triangle', vol: 0.12 }));
    tone(mtof(60), t, 0.6, { type: 'square', vol: 0.03, filter: 1500 });
    sfx.coins(12);
  },
  megaWin() {
    if (!ctx) return;
    const t = now();
    for (let r = 0; r < 3; r++) [60, 64, 67, 72, 76, 79, 84, 88].forEach((m, i) => tone(mtof(m + r * 3), t + r * 0.6 + i * 0.06, 0.35, { type: 'square', vol: 0.05, filter: 3500 }));
    tone(mtof(36), t, 2.2, { type: 'sawtooth', vol: 0.07, filter: 600 });
    sfx.coins(30);
  },
  // Roulette: Kugel springt über die Fachstege, landet mit deutlichem KLACK
  ballTick(v = 0.08) { if (!ctx) return; const t = now(); tone(2600 + Math.random() * 600, t, 0.018, { type: 'triangle', vol: v }); noise(t, 0.015, { freq: 5000, q: 6, vol: v * 0.8 }); },
  ballClack() { if (!ctx) return; const t = now(); noise(t, 0.05, { freq: 2200, q: 4, vol: 0.35 }); tone(1300, t, 0.07, { type: 'triangle', vol: 0.2 }); tone(700, t + 0.01, 0.12, { type: 'sine', vol: 0.12 }); },
  jump() { if (!ctx) return; const t = now(); noise(t, 0.08, { type: 'lowpass', freq: 600, vol: 0.06 }); tone(260, t, 0.16, { type: 'sine', vol: 0.06, slide: 1.8 }); },
  land() { if (!ctx) return; const t = now(); noise(t, 0.09, { type: 'lowpass', freq: 350, vol: 0.12 }); tone(90, t, 0.1, { vol: 0.12, slide: 0.6 }); },
  step(v = 0.04) { if (!ctx) return; noise(now(), 0.05, { type: 'lowpass', freq: 400, vol: v }); },
};

// ───────────────────────── Musik ─────────────────────────
let mode = 'none';
let intensity = 0;
let nextBeat = 0;
let beatIdx = 0;
let ambience = null;

export function setMusic(m, level = 0) {
  if (m !== 'jackpot') clearTimeout(jackpotTimer);
  if (!ctx) { mode = m; intensity = level; return; }
  if (m !== mode) { beatIdx = 0; nextBeat = now() + 0.1; }
  mode = m;
  intensity = level;
}

// Jackpot: eigene Musik für einige Sekunden, danach zurück zur vorherigen Musik
let jackpotTimer = null, beforeJackpot = null;
export function playJackpotMusic(sec = 7) {
  if (mode !== 'jackpot') beforeJackpot = [mode, intensity];
  setMusic('jackpot');
  clearTimeout(jackpotTimer);
  jackpotTimer = setTimeout(() => { if (mode === 'jackpot' && beforeJackpot) setMusic(...beforeJackpot); }, sec * 1000);
}

export function setAmbience(kind) {
  if (!ctx) return;
  if (ambience) { const a = ambience; a.g.gain.setTargetAtTime(0.0001, now(), 0.5); setTimeout(() => a.s.stop(), 2000); ambience = null; }
  if (!kind) return;
  // Hintergrundgespräche: gefiltertes, moduliertes Rauschen
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'casino' ? 700 : 500; f.Q.value = 1.2;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7;
  const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(f.frequency); lfo.start();
  const g = ctx.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(kind === 'casino' ? 0.06 : 0.035, now(), 1);
  s.connect(f).connect(g).connect(ambBus); s.start();
  ambience = { s, g };
}

const PROG = {
  lounge: [[50, 57, 60, 65], [48, 55, 58, 63], [46, 53, 57, 62], [45, 52, 55, 61]], // Dm – Cm – Bb – A (Phrygisch-Dominant-Touch)
  casino: [[48, 55, 59, 64], [45, 52, 55, 60], [50, 57, 60, 65], [43, 50, 53, 59]], // C maj7 – Am7 – Dm7 – G7
  final: [[52, 59, 62, 66], [48, 55, 59, 64], [45, 52, 57, 60], [47, 54, 59, 62]],
};
const MELODY_SCALE = { lounge: [62, 63, 66, 67, 69, 70, 72, 74], casino: [72, 74, 76, 79, 81, 84], final: [74, 76, 78, 81, 83] };

function schedule() {
  if (!ctx || mode === 'none') return;
  const bpm = mode === 'casino' ? 108 + intensity * 6 : mode === 'jackpot' ? 150 : mode === 'lounge' ? 84 : 66;
  const step = 60 / bpm / 2; // Achtel
  while (nextBeat < now() + 0.25) {
    playStep(nextBeat, beatIdx, step);
    nextBeat += step;
    beatIdx++;
  }
}

function playStep(t, i, step) {
  const bar = Math.floor(i / 8);
  const pos = i % 8;
  const prog = PROG[mode] || PROG.lounge;
  const chord = prog[bar % prog.length];
  const swing = mode === 'casino' && pos % 2 === 1 ? step * 0.25 : 0;
  t += swing;
  const B = musicBus;
  if (mode === 'lounge') {
    if (pos === 0) chord.forEach(m => tone(mtof(m + 12), t, step * 7, { type: 'triangle', vol: 0.035, a: 0.05, bus: B, filter: 1400 }));
    if (pos === 0 || pos === 3 || pos === 6) tone(mtof(chord[0] - 12), t, step * 1.5, { type: 'sine', vol: 0.16, bus: B });
    if (pos === 0 || pos === 4) tone(60, t, 0.15, { vol: 0.25, slide: 0.5, bus: B });
    if (pos === 2 || pos === 6) noise(t, 0.05, { freq: 7000, q: 1, vol: 0.03, bus: B });
    if (pos === 4) noise(t, 0.12, { freq: 1800, q: 1, vol: 0.05, bus: B });
    // Darbuka-artige Akzente
    if (pos === 7 || (pos === 5 && bar % 2)) tone(220, t, 0.08, { vol: 0.08, slide: 0.7, bus: B });
    if (Math.random() < 0.3 && pos % 2 === 0) tone(mtof(MELODY_SCALE.lounge[Math.floor(Math.random() * 8)]), t, step * 2, { type: 'sine', vol: 0.04, a: 0.02, bus: B });
  } else if (mode === 'casino') {
    const lvl = intensity;
    if (pos === 0 || pos === 3) chord.forEach(m => tone(mtof(m + 12), t, step * 0.9, { type: 'square', vol: 0.012 + lvl * 0.002, a: 0.005, bus: B, filter: 1800 + lvl * 300 }));
    // Walking Bass
    const walk = [chord[0], chord[1], chord[2], chord[1] + 2];
    if (pos % 2 === 0) tone(mtof(walk[pos / 2] - 12), t, step * 1.6, { type: 'triangle', vol: 0.15, bus: B, filter: 900 });
    noise(t, pos % 2 ? 0.04 : 0.08, { freq: 8000, q: 0.7, vol: 0.025 + lvl * 0.004, bus: B });
    if (pos === 2 || pos === 6) noise(t, 0.1, { freq: 2000, q: 0.8, vol: 0.05, bus: B });
    if (lvl >= 2 && (pos === 0 || pos === 4)) tone(55, t, 0.15, { vol: 0.25, slide: 0.5, bus: B });
    if (lvl >= 3 && Math.random() < 0.35) tone(mtof(MELODY_SCALE.casino[Math.floor(Math.random() * 6)]), t, step * 1.5, { type: 'sawtooth', vol: 0.02, bus: B, filter: 2500 });
    if (lvl >= 4 && pos === 0 && bar % 2 === 0) chord.forEach(m => tone(mtof(m), t, step * 8, { type: 'sawtooth', vol: 0.012, a: 0.3, bus: B, filter: 1200 }));
  } else if (mode === 'final') {
    if (pos === 0 && bar % 2 === 0) chord.forEach(m => tone(mtof(m + 12), t, step * 15, { type: 'sine', vol: 0.03, a: 1.2, bus: B }));
    if (pos === 0) tone(mtof(chord[0] - 12), t, step * 7, { type: 'sine', vol: 0.12, a: 0.3, bus: B });
    if (Math.random() < 0.18) tone(mtof(MELODY_SCALE.final[Math.floor(Math.random() * 5)]), t, step * 4, { type: 'triangle', vol: 0.03, a: 0.05, bus: B });
  } else if (mode === 'jackpot') {
    // Jackpot-Fanfare: schnelle Dur-Arpeggien über pumpendem Bass
    const arp = [0, 4, 7, 12, 16, 12, 7, 4];
    tone(mtof(chord[0] + 24 + arp[pos]), t, step * 0.9, { type: 'square', vol: 0.03, bus: B, filter: 4000 });
    if (pos % 2 === 0) tone(mtof(chord[0] + 12 + arp[(pos + 2) % 8]), t, step, { type: 'triangle', vol: 0.05, bus: B });
    tone(mtof(chord[0] - 12), t, step * 0.8, { type: 'sawtooth', vol: 0.07, bus: B, filter: 900 });
    if (pos % 2 === 0) tone(55, t, 0.12, { vol: 0.3, slide: 0.5, bus: B });
    noise(t, 0.04, { freq: 9000, vol: 0.05, bus: B });
    if (pos === 0) chord.forEach(m => tone(mtof(m + 12), t, step * 7, { type: 'sawtooth', vol: 0.015, a: 0.05, bus: B, filter: 2500 }));
  } else if (mode === 'tension') {
    if (pos === 0 || pos === 4) { tone(55, t, 0.12, { vol: 0.45, slide: 0.6, bus: B }); tone(50, t + 0.22, 0.14, { vol: 0.35, slide: 0.6, bus: B }); }
  } else if (mode === 'celebrate') {
    chord.forEach(m => pos % 2 === 0 && tone(mtof(m + 12), t, step, { type: 'square', vol: 0.02, bus: B, filter: 3000 }));
    tone(mtof(chord[0] - 12), t, step, { type: 'sawtooth', vol: 0.08, bus: B, filter: 900 });
    if (pos % 2 === 0) tone(55, t, 0.12, { vol: 0.25, slide: 0.5, bus: B });
    noise(t, 0.04, { freq: 9000, vol: 0.04, bus: B });
    if (Math.random() < 0.5) tone(mtof(MELODY_SCALE.casino[Math.floor(Math.random() * 6)] + 12), t, step, { type: 'triangle', vol: 0.04, bus: B });
  }
}

// Dealer-Stimme über die Web Speech API (falls vorhanden)
let lastSay = 0;
export function say(text, lang = 'de-DE', rate = 1.05) {
  try {
    if (!window.speechSynthesis || settings.sfx * settings.master < 0.05) return;
    const now = performance.now();
    if (now - lastSay < 900) return;
    lastSay = now;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    u.pitch = 0.9;
    u.volume = Math.min(1, settings.sfx * settings.master);
    window.speechSynthesis.speak(u);
  } catch { /* ohne Stimme weiter */ }
}

// Gedämpfter Klang während des Schwindels, weich zurück zum Normalklang
export function setDizzyAudio(on) {
  if (!ctx || !lowpass) return;
  lowpass.frequency.setTargetAtTime(on ? 1100 : 20000, ctx.currentTime, on ? 0.5 : 0.9);
}

// ───────────────────────── Räumliche Shisha-Geräusche ─────────────────────────
// Jede Shisha hat eine eigene Schallquelle (PannerNode): Blubbern, Ziehen und Wassergeräusche,
// mit versetzten Schleifen und zufälligen Pausen. Lauter, je näher man ist – leise genug für die Musik.
const spatial = [];
let spatialTimer = null;
export function setShishaSounds(positions) {
  if (!ctx) return;
  clearShishaSounds();
  positions.forEach((p, i) => {
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 0.9;
    pan.rolloffFactor = 1.6;
    pan.maxDistance = 30;
    setPos(pan, p.x, p.y, p.z);
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(1, now(), 1.5);
    pan.connect(g).connect(ambBus);
    // Versatz, damit die Shishas nicht im Gleichtakt blubbern
    spatial.push({ pan, g, next: now() + 0.4 + i * 1.3 + Math.random(), drawUntil: 0, nextDraw: now() + 2 + i * 3.7 + Math.random() * 4, nextWater: now() + 5 + i * 2.1 });
  });
  spatialTimer = setInterval(scheduleShishas, 60);
}
export function clearShishaSounds() {
  clearInterval(spatialTimer);
  for (const s of spatial.splice(0)) { s.g.gain.setTargetAtTime(0, now(), 0.3); const p = s.pan; setTimeout(() => p.disconnect(), 1500); }
}
function setPos(node, x, y, z) {
  if (node.positionX) { node.positionX.value = x; node.positionY.value = y; node.positionZ.value = z; } else node.setPosition(x, y, z);
}
export function updateListener(cam) {
  if (!ctx || !spatial.length) return;
  const L = ctx.listener;
  const e = cam.matrixWorld.elements;
  const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
  const px = e[12], py = e[13], pz = e[14];
  if (L.positionX) {
    L.positionX.value = px; L.positionY.value = py; L.positionZ.value = pz;
    L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
    L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
  } else { L.setPosition(px, py, pz); L.setOrientation(fx, fy, fz, ux, uy, uz); }
}
function scheduleShishas() {
  const t0 = now();
  for (const s of spatial) {
    // Ziehen: weiches Rauschen + kräftiges Blubbern für 1.5–2.5 s
    if (t0 >= s.nextDraw) {
      const dur = 1.5 + Math.random();
      s.drawUntil = t0 + dur;
      noise(t0, dur, { type: 'bandpass', freq: 900, q: 0.8, vol: 0.05, bus: s.pan, a: 0.35 });
      s.nextDraw = t0 + dur + 5 + Math.random() * 8;
    }
    // Wasser: leises Plätschern ab und zu
    if (t0 >= s.nextWater) {
      for (let k = 0; k < 4; k++) tone(500 + Math.random() * 400, t0 + k * 0.07, 0.06, { vol: 0.03, bus: s.pan, slide: 1.6 });
      s.nextWater = t0 + 6 + Math.random() * 9;
    }
    while (s.next < t0 + 0.15) {
      const drawing = s.next < s.drawUntil;
      const f = (drawing ? 160 : 220) + Math.random() * (drawing ? 260 : 380);
      tone(f, s.next, drawing ? 0.07 : 0.05, { type: 'sine', vol: drawing ? 0.09 : 0.035, bus: s.pan, slide: 1.9 + Math.random() });
      s.next += drawing ? 0.05 + Math.random() * 0.07 : 0.35 + Math.random() * 1.1;
    }
  }
}
