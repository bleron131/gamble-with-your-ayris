import { App } from './app.js';

const app = new App();
// Schriften laden, damit Canvas-Texturen korrekt gerendert werden
const ready = document.fonts?.load ? Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('bold 40px Nunito')]).catch(() => {}) : Promise.resolve();
Promise.race([ready, new Promise(r => setTimeout(r, 1500))]).then(() => app.start());

// Installierbar als App (Home-Bildschirm); stört den normalen Browser-Start nicht
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
