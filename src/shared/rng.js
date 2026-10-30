// Kryptografisch sauberer Zufall (Browser & Node 22 haben globalThis.crypto).
const buf = new Uint32Array(1);

export function rand() {
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

export function randInt(n) {
  return Math.floor(rand() * n);
}

export function pick(arr) {
  return arr[randInt(arr.length)];
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Karten: { r: 1..13 (1 = Ass), s: 0..3 }
export function makeShoe(decks) {
  const cards = [];
  for (let d = 0; d < decks; d++)
    for (let s = 0; s < 4; s++)
      for (let r = 1; r <= 13; r++) cards.push({ r, s });
  return shuffle(cards);
}

export class Shoe {
  constructor(decks) {
    this.decks = decks;
    this.cards = makeShoe(decks);
  }
  draw() {
    if (this.cards.length < 20) this.cards = makeShoe(this.decks);
    return this.cards.pop();
  }
  needsShuffle() {
    return this.cards.length < this.decks * 52 * 0.25;
  }
  reshuffle() {
    this.cards = makeShoe(this.decks);
  }
}
