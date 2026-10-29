// Tastatur, Maus & Pointer-Lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.dragging = false;
    this.enabled = true;
    this.clickHandlers = [];
    this.wheel = 0;
    window.addEventListener('keydown', e => {
      if (isTyping(e)) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 2 || (!this.wantLock && e.button === 0)) this.dragging = true;
      for (const h of this.clickHandlers) h(e);
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (this.locked || this.dragging) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
      this.mouseX = e.clientX; this.mouseY = e.clientY;
    });
    canvas.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }
  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try { const p = this.canvas.requestPointerLock(); if (p?.catch) p.catch(() => {}); } catch { /* */ }
    }
  }
  exitLock() { if (this.locked) document.exitPointerLock(); }
  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  onClick(h) { this.clickHandlers.push(h); }
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
