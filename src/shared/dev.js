// Versteckter Developer-Testmodus (Prompt 11): Nur der Spielername EXAKT „Ayri000“ gewinnt jede eigene Casino-Runde.
// Zentrale Prüfung – alle Spiele fragen nur ctx.dev ab (vom Room aus dieser Funktion gesetzt).
// Gewinne werden mit den normalen Multiplikatoren berechnet (kein erzwungener Jackpot), Animationen laufen normal.
// Betrifft ausschliesslich die Runden dieses Spielers – andere Spieler und gemeinsame Ereignisse bleiben unberührt.
export const DEV_TEST_NAME = 'Ayri000';

export function isDeveloperTestPlayer(player) {
  return !!player && typeof player.name === 'string' && player.name === DEV_TEST_NAME;
}

// Ergebnis so oft neu ziehen, bis es ein Gewinn ist (score > needed). Zufall bleibt Zufall – es wird nur ein
// gewinnendes Ergebnis aus der normalen Verteilung gewählt. Falls keines möglich ist, das beste gefundene.
export function devReroll(first, roll, score, needed, max = 4000) {
  let best = first, bestScore = score(first);
  for (let i = 0; i < max && bestScore <= needed; i++) {
    const x = roll();
    const sc = score(x);
    if (sc > bestScore) { best = x; bestScore = sc; }
  }
  return best;
}
