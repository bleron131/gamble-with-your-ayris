// Transport-Schicht: WebSocket zum Server (Multiplayer) oder lokaler Raum im Browser (Solo).
import { Room } from '../shared/room.js';
import { serverHost } from './server.js';

export class WSTransport {
  constructor() {
    this.handlers = [];
    this.ws = null;
  }
  // Der Gratis-Server von Render schläft nach 15 Minuten ohne Besucher und braucht dann bis zu einer Minute
  // zum Aufwachen. Deshalb wird bei einem entfernten Server mehrmals versucht, bevor eine Fehlermeldung kommt.
  async connect(first, onStatus) {
    const srv = serverHost();
    const url = `${srv.secure ? 'wss' : 'ws'}://${srv.host}/ws`;
    if (!srv.remote) return this.open(url, first, 5000);
    fetch(`${srv.secure ? 'https' : 'http'}://${srv.host}/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); // weckt den Server
    const until = Date.now() + 90000;
    let attempt = 0;
    for (;;) {
      try { return await this.open(url, first, 12000); } catch (e) {
        attempt++;
        if (Date.now() > until) throw new Error('Multiplayer-Server nicht erreichbar');
        onStatus?.(`Server wird geweckt… (kann bis zu 1 Minute dauern, Versuch ${attempt + 1})`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  open(url, first, timeout) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let opened = false;
      const timer = setTimeout(() => { if (!opened) { ws.close(); reject(new Error('Server nicht erreichbar')); } }, timeout);
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
