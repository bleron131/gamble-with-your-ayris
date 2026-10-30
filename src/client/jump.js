// Sprungphysik (ohne Three.js, damit sie auch im Test läuft): natürlicher Bogen mit Schwerkraft,
// kein Doppel- oder Luftsprung, neuer Sprung erst nach kurzem Bodenkontakt (kein Bunny-Hopping).
export const JUMP = { v0: 3.9, gravity: 13, minGround: 0.15, landTime: 0.2, maxStep: 1 / 60 };

export class Jumper {
  constructor() { this.reset(); }
  reset() { this.y = 0; this.vy = 0; this.grounded = true; this.groundT = 1; this.landT = 0; }
  get airborne() { return !this.grounded; }
  // Nur am Boden und nach minGround Sekunden Bodenkontakt
  tryJump() {
    if (!this.grounded || this.groundT < JUMP.minGround) return false;
    this.vy = JUMP.v0;
    this.grounded = false;
    return true;
  }
  // Gibt 'land' zurück, wenn der Spieler in diesem Schritt aufsetzt
  step(dt) {
    let ev = null;
    while (dt > 1e-6) {
      const h = Math.min(dt, JUMP.maxStep);
      dt -= h;
      if (this.grounded) { this.groundT += h; if (this.landT > 0) this.landT = Math.max(0, this.landT - h); continue; }
      this.vy -= JUMP.gravity * h;
      this.y += this.vy * h;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; this.groundT = 0; this.landT = JUMP.landTime; ev = 'land'; }
    }
    return ev;
  }
  // Weiches Einfedern der Kamera bei der Landung
  get landDip() { return this.landT > 0 ? Math.sin((this.landT / JUMP.landTime) * Math.PI) * 0.07 : 0; }
}
