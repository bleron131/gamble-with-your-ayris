// Sprungphysik (ohne Three.js, damit sie auch im Test läuft): natürlicher Bogen mit Schwerkraft,
// kein Doppel- oder Luftsprung, neuer Sprung erst nach kurzem Bodenkontakt (kein Bunny-Hopping).
// Prompt 12: deutlich höher (verspielt übertrieben) und mit begehbaren Oberflächen – Sofas, Stühle, niedrige Deko
// sowie Roulette-/Blackjack-Tische haben eine Standhöhe. Die Decke begrenzt den Sprung (kein Clipping).
export const JUMP = { v0: 5.4, gravity: 13.5, minGround: 0.15, landTime: 0.2, maxStep: 1 / 60, headroom: 1.85, edge: 0.06 };

export class Jumper {
  constructor() { this.reset(); }
  reset() { this.y = 0; this.vy = 0; this.grounded = true; this.groundT = 1; this.landT = 0; this.floorY = 0; }
  get airborne() { return !this.grounded; }
  // Nur am Boden und nach minGround Sekunden Bodenkontakt
  tryJump() {
    if (!this.grounded || this.groundT < JUMP.minGround) return false;
    this.vy = JUMP.v0;
    this.grounded = false;
    return true;
  }
  // env.ground(y) = höchste begehbare Fläche unter dem Spieler, deren Oberkante höchstens knapp über y liegt
  // env.ceil = Deckenhöhe des Raums. Gibt 'land' zurück, wenn der Spieler in diesem Schritt aufsetzt.
  step(dt, env = null) {
    let ev = null;
    const groundAt = y => (env?.ground ? Math.max(0, env.ground(y)) : 0);
    const ceil = env?.ceil ?? Infinity;
    while (dt > 1e-6) {
      const h = Math.min(dt, JUMP.maxStep);
      dt -= h;
      if (this.grounded) {
        this.groundT += h;
        if (this.landT > 0) this.landT = Math.max(0, this.landT - h);
        // Von einer Fläche heruntergelaufen → fallen
        const g = groundAt(this.y);
        if (g < this.y - 0.02) { this.grounded = false; this.vy = 0; } else { this.y = g; continue; }
      }
      const g = groundAt(this.y); // Fläche unter dem Spieler VOR der Bewegung (kein Durchrutschen bei schnellem Fall)
      this.vy -= JUMP.gravity * h;
      this.y += this.vy * h;
      if (this.y + JUMP.headroom > ceil) { this.y = ceil - JUMP.headroom; this.vy = Math.min(0, this.vy); }
      if (this.vy <= 0 && this.y <= g) {
        this.y = g; this.vy = 0; this.grounded = true; this.groundT = 0; this.landT = JUMP.landTime; ev = 'land';
      }
    }
    this.floorY = this.grounded ? this.y : this.floorY;
    return ev;
  }
  // Weiches Einfedern der Kamera bei der Landung
  get landDip() { return this.landT > 0 ? Math.sin((this.landT / JUMP.landTime) * Math.PI) * 0.07 : 0; }
}

// Begehbare Oberfläche an (x, z): höchste Oberkante aller Collider mit `top`, die unter den Füssen liegt
export function surfaceAt(colliders, x, z, y, margin = 0.12) {
  let best = 0;
  for (const c of colliders) {
    if (c.top === undefined || c.top > y + JUMP.edge) continue;
    if (c.type === 'box') { if (x < c.minX - margin || x > c.maxX + margin || z < c.minZ - margin || z > c.maxZ + margin) continue; }
    else if (Math.hypot(x - c.x, z - c.z) > c.r + margin) continue;
    if (c.top > best) best = c.top;
  }
  return best;
}
