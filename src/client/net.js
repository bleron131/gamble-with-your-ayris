// Transport-Schicht: WebSocket zum Server (Multiplayer) oder lokaler Raum im Browser (Solo).
import { Room } from '../shared/room.js';

export class WSTransport {
  constructor() {
    this.handlers = [];
    this.ws = null;
  }
  connect(first) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      let opened = false;
      const timer = setTimeout(() => { if (!opened) { ws.close(); reject(new Error('Server nicht erreichbar')); } }, 5000);
      ws.onopen = () => { opened = true; clearTimeout(timer); ws.send(JSON.stringify(first)); resolve(); };
      ws.onerror = () => { if (!opened) { clearTimeout(timer); reject(new Error('Server nicht erreichbar')); } };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } for (const h of this.handlers) h(m); };
      ws.onclose = () => { if (opened) for (const h of this.handlers) h({ t: 'disconnected' }); };
    });
  }
  send(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  onMessage(h) { this.handlers.push(h); }
  close() { this.ws?.close(); }
}

export class LocalTransport {
  constructor() {
    this.handlers = [];
    this.room = null;
    this.pid = null;
  }
  connect(first) {
    this.room = new Room('SOLO');
    const conn = { send: msg => { const copy = JSON.parse(JSON.stringify(msg)); setTimeout(() => { for (const h of this.handlers) h(copy); }, 0); } };
    this.pid = this.room.join(conn, first.profile);
    return Promise.resolve();
  }
  send(msg) { if (this.room && this.pid) this.room.handle(this.pid, msg); }
  onMessage(h) { this.handlers.push(h); }
  close() { this.room?.destroy(); }
}
