// Minimaler Service Worker für die Installation als App (PWA).
// Absichtlich ohne Cache: Das Spiel lädt immer die aktuelle Version, Multiplayer (WebSocket) läuft direkt.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* Netzwerk wie gewohnt */ });
