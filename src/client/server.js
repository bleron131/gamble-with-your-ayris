// Adresse des Multiplayer-Servers.
// Läuft das Spiel vom Server selbst (npm start oder Render), ist es derselbe Host.
// Auf GitHub Pages gibt es keinen Server – dort wird der Render-Server verwendet.
// Anderer Server zum Testen: ?server=mein-server.onrender.com an die Adresse hängen.
export const RENDER_HOST = 'gamble-with-your-ayris.onrender.com';

export function serverHost() {
  const custom = new URLSearchParams(location.search).get('server');
  if (custom) {
    const host = custom.replace(/^\w+:\/\//, '').replace(/\/.*$/, '');
    return { host, secure: !/^(localhost|127\.|192\.168\.|10\.)/.test(host), remote: true };
  }
  if (location.hostname.endsWith('github.io')) return { host: RENDER_HOST, secure: true, remote: true };
  return { host: location.host, secure: location.protocol === 'https:', remote: false };
}
