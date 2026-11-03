// Vollbild & Querformat auf Handys (Feature Detection – nicht unterstützte APIs werden still übersprungen).
export function isStandalone() {
  return !!(window.matchMedia?.('(display-mode: fullscreen)').matches || window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);
}
export function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement) || isStandalone(); }
export function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
}

// Muss direkt aus einer Benutzeraktion (Tippen) aufgerufen werden
// Manche Browser lösen die Promise nie auf – nach kurzer Zeit wird trotzdem weitergemacht
const withTimeout = (p, ms = 1500) => Promise.race([Promise.resolve(p), new Promise(r => setTimeout(r, ms))]);

export async function enterFullscreen() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) await withTimeout(req.call(el, { navigationUI: 'hide' }));
    }
  } catch { /* vom Browser abgelehnt */ }
  try { await withTimeout(screen.orientation?.lock?.('landscape'), 800); } catch { /* nicht unterstützt (z. B. iOS) */ }
  return isFullscreen();
}
