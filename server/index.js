// Multiplayer-Server: liefert den gebauten Client aus und verwaltet Gruppen per Join-Code.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, makeJoinCode } from '../src/shared/room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const PORT = +process.env.PORT || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Gamble with your Ayris – Server läuft. Bitte zuerst "npm run build" ausführen oder "npm run dev" verwenden.');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const rooms = new Map();

function createRoom() {
  let code;
  do code = makeJoinCode(); while (rooms.has(code));
  const room = new Room(code, {
    onEmpty: r => {
      // Kurze Gnadenfrist, falls jemand nach einem Reload wieder beitritt
      setTimeout(() => {
        if (r.players.size === 0 && rooms.get(r.code) === r) { r.destroy(); rooms.delete(r.code); }
      }, 5 * 60 * 1000);
    },
  });
  rooms.set(code, room);
  return room;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', ws => {
  let room = null;
  let pid = null;
  const conn = {
    send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
  };
  let msgCount = 0;
  const rate = setInterval(() => { msgCount = 0; }, 1000);
  ws.on('message', data => {
    if (++msgCount > 120) return; // einfache Flood-Bremse
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!room) {
      if (msg.t === 'create') {
        room = createRoom();
        pid = room.join(conn, msg.profile);
      } else if (msg.t === 'join') {
        const code = String(msg.code || '').toUpperCase().trim().replace(/^(AYRI)?-?/, 'AYRI-');
        const r = rooms.get(code);
        if (!r) { conn.send({ t: 'error', fatal: true, msg: `Gruppe ${code} nicht gefunden` }); return; }
        pid = r.join(conn, msg.profile);
        if (pid) room = r;
      }
      return;
    }
    room.handle(pid, msg);
  });
  ws.on('close', () => {
    clearInterval(rate);
    if (room && pid) room.leave(pid);
  });
});

server.listen(PORT, () => {
  console.log(`🎰 Gamble with your Ayris läuft auf http://localhost:${PORT}`);
});
