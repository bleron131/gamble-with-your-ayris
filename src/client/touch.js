// Mobile-Steuerung (nur auf Touch-Geräten aktiv): linker Joystick, Kamera-Wischen rechts, JUMP-Button,
// kontextabhängige Aktions-Buttons, Tippen auf 3D-Objekte und Hinweis zum Drehen ins Querformat.
// Die Desktop-Steuerung bleibt unverändert; alles hier füttert nur dieselben Eingaben (Input/App).
import { h, clear } from './ui/dom.js';
import { resumeAudio } from './audio.js';

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const mm = q => window.matchMedia?.(q).matches;
  return !!(mm('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mm('(pointer: fine)')));
}

const JOY_R = 52;          // Radius der Joystick-Auslenkung in px
const TAP_MOVE = 12;       // so weit darf sich ein Finger bei einem Tipp bewegen
const LONG_MS = 550;       // langes Drücken (z. B. Roulette-Chip wegnehmen)

export class TouchControls {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.touches = new Map(); // id → { kind: 'joy' | 'look', x0, y0, x, y, t0, moved, long }
    this.contextKey = '';
    this.build();
    if (isTouchDevice()) this.enable();
    // Hybrid-Geräte: Touch-UI erst beim ersten echten Antippen einschalten
    window.addEventListener('touchstart', () => { if (!this.active) this.enable(); }, { passive: true, capture: true });
    // Mobile-Browser pausieren Audio gern (Anruf, Tab-Wechsel) – beim nächsten Tippen weiterspielen
    window.addEventListener('touchend', () => resumeAudio(), { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeAudio(); });
  }

  build() {
    const ui = document.getElementById('ui');
    this.root = h('div.touchui.hidden');
    this.knob = h('div.joyknob');
    this.joy = h('div.joy', this.knob);
    this.jumpBtn = h('button.tbtn.jump', 'JUMP');
    this.ctxWrap = h('div.tctx');
    this.camBtn = h('button.tbtn.cam.hidden', '🎥');
    this.root.append(this.joy, this.jumpBtn, this.ctxWrap, this.camBtn);
    ui.append(this.root);
    this.rotate = h('div.rotate.hidden', h('div.phone', h('div.screen')), h('div.rtxt', 'Drehe dein Gerät ins Querformat'));
    ui.append(this.rotate);
    // Buttons reagieren sofort auf Touch (kein Klick-Verzug) und blockieren nicht die anderen Finger
    const press = (el, fn) => {
      el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); fn(); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); el.classList.remove('down'); }, { passive: false });
      el.addEventListener('touchcancel', () => el.classList.remove('down'));
      el.addEventListener('click', e => { e.preventDefault(); fn(); });
    };
    press(this.jumpBtn, () => this.app.input.press('Space'));
    press(this.camBtn, () => this.app.toggleBallCam(this.app.player.seated));
  }

  enable() {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('touch');
    this.root.classList.remove('hidden');
    const canvas = this.app.engine.renderer.domElement;
    canvas.addEventListener('touchstart', e => this.onStart(e), { passive: false });
    canvas.addEventListener('touchmove', e => this.onMove(e), { passive: false });
    canvas.addEventListener('touchend', e => this.onEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', e => this.onEnd(e), { passive: false });
    // Der Joystick-Bereich selbst nimmt ebenfalls Finger an
    this.joy.addEventListener('touchstart', e => this.onStart(e, true), { passive: false });
    this.joy.addEventListener('touchmove', e => this.onMove(e), { passive: false });
    this.joy.addEventListener('touchend', e => this.onEnd(e), { passive: false });
    this.joy.addEventListener('touchcancel', e => this.onEnd(e), { passive: false });
    this.app.onTouchEnabled?.();
  }

  get portrait() { return this.active && window.innerHeight > window.innerWidth; }

  // Darf der linke Daumen gerade laufen?
  get canWalk() {
    const a = this.app;
    return !!a.state && !a.player.seated && !a.cinematic && !a.ballCam && !a.mafiaLock && !a.ui.modalOpen;
  }

  onStart(e, onJoy = false) {
    e.preventDefault();
    resumeAudio();
    const W = window.innerWidth, H = window.innerHeight;
    for (const t of e.changedTouches) {
      const leftZone = onJoy || (t.clientX < W * 0.42 && t.clientY > H * 0.3);
      const joyTaken = [...this.touches.values()].some(v => v.kind === 'joy');
      const kind = leftZone && this.canWalk && !joyTaken ? 'joy' : 'look';
      const rec = { kind, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now(), moved: false, long: false };
      if (kind === 'joy') {
        // Schwebender Joystick: Basis springt zum Daumen, wenn er neben der Standardposition landet
        const r = this.joy.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (Math.hypot(t.clientX - cx, t.clientY - cy) > r.width * 0.75) {
          this.joy.style.left = `${t.clientX - r.width / 2}px`;
          this.joy.style.top = `${t.clientY - r.height / 2}px`;
          this.joy.style.bottom = 'auto';
          rec.cx = t.clientX; rec.cy = t.clientY;
        } else { rec.cx = cx; rec.cy = cy; }
        this.joy.classList.add('on');
        this.updateJoy(rec);
      } else {
        rec.timer = setTimeout(() => { if (!rec.moved) { rec.long = true; this.app.onTap?.(rec.x, rec.y, 'long'); } }, LONG_MS);
      }
      this.touches.set(t.identifier, rec);
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      if (!rec) continue;
      const dx = t.clientX - rec.x, dy = t.clientY - rec.y;
      rec.x = t.clientX; rec.y = t.clientY;
      if (Math.hypot(rec.x - rec.x0, rec.y - rec.y0) > TAP_MOVE) rec.moved = true;
      if (rec.kind === 'joy') this.updateJoy(rec);
      else if (rec.moved) { this.app.input.touchDX += dx; this.app.input.touchDY += dy; }
    }
  }

  onEnd(e) {
    e.preventDefault?.();
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      if (!rec) continue;
      this.touches.delete(t.identifier);
      clearTimeout(rec.timer);
      if (rec.kind === 'joy') this.resetJoy();
      else if (!rec.moved && !rec.long && performance.now() - rec.t0 < LONG_MS) this.app.onTap?.(rec.x, rec.y, 'tap');
    }
  }

  updateJoy(rec) {
    let dx = rec.x - rec.cx, dy = rec.y - rec.cy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, d / JOY_R);
    // Kleine Totzone, danach weich ansteigend
    const k = m < 0.12 ? 0 : (m - 0.12) / 0.88;
    const len = Math.hypot(dx, dy) || 1;
    this.app.input.axis.x = dx / len * k;
    this.app.input.axis.y = -dy / len * k;
  }

  resetJoy() {
    this.knob.style.transform = '';
    this.joy.classList.remove('on');
    this.joy.style.left = ''; this.joy.style.top = ''; this.joy.style.bottom = '';
    this.app.input.axis.x = 0; this.app.input.axis.y = 0;
  }

  // Jeden Frame: Sichtbarkeit und Kontext-Buttons aktualisieren
  update() {
    if (!this.active) return;
    const a = this.app;
    const portrait = this.portrait;
    this.rotate.classList.toggle('hidden', !portrait);
    const inGame = !!a.state && a.ui.menu.classList.contains('hidden');
    const walk = inGame && this.canWalk;
    this.root.classList.toggle('hidden', !inGame || portrait);
    this.joy.classList.toggle('hidden', !walk);
    this.jumpBtn.classList.toggle('hidden', !walk);
    if (!walk && [...this.touches.values()].some(v => v.kind === 'joy')) {
      for (const [id, v] of this.touches) if (v.kind === 'joy') this.touches.delete(id);
      this.resetJoy();
    }
    // Kugelkamera-Button während eines Roulette-Spins
    const roulette = inGame && !a.cinematic && !a.mafiaLock && (a.ballCam || a.spinningRoulette(a.player.seated));
    const showCam = !!roulette && (a.ballCam || a.player.seated === roulette || a.distanceTo(roulette.group.position) < 9);
    this.camBtn.classList.toggle('hidden', !showCam);
    this.camBtn.classList.toggle('seated', !!a.player.seated);
    this.camBtn.classList.toggle('on', !!a.ballCam);
    this.camBtn.textContent = a.ballCam ? '🎥 ZURÜCK' : '🎥';
    // Kontext-Buttons nur, wenn wirklich eine Interaktion möglich ist
    const actions = walk ? a.contextActions() : [];
    const key = actions.map(x => x.label + (x.disabled ? '0' : '1')).join('|');
    if (key !== this.contextKey) {
      this.contextKey = key;
      clear(this.ctxWrap);
      let row = null;
      for (const act of actions) {
        const b = h('button.tbtn.ctx', { class: act.cls || '' }, act.label);
        b.disabled = !!act.disabled;
        const fire = e => { e.preventDefault(); e.stopPropagation(); if (!b.disabled) { b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 150); act.run(); } };
        b.addEventListener('touchstart', fire, { passive: false });
        b.addEventListener('click', fire);
        // BET − / BET + nebeneinander, damit die Buttons nicht zu hoch stapeln
        if (act.cls === 'bet') { if (!row) { row = h('div.trow'); this.ctxWrap.append(row); } row.append(b); }
        else { row = null; this.ctxWrap.append(b); }
      }
    }
  }
}
