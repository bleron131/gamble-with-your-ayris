// Hauptanwendung: verbindet Netzwerk, Spielzustand, 3D-Welten, Spieler und UI.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { LocalPlayer } from './player.js';
import { TouchControls } from './touch.js';
import { Character, FPHands, makkaBottle, OPTIONS as CHAR_OPTIONS } from './character.js';
import { LobbyWorld } from './world/lobby.js';
import { CasinoWorld } from './world/casino.js';
import { FinalWorld } from './world/final.js';
import { WSTransport, LocalTransport } from './net.js';
import { NpcController } from './npcs.js';
import { updateTrophies } from './world/trophies.js';
import { unlockedEmotes, EXTRA_EMOTES, wornLucky, freeCosmetics, hasSecret, checkRecord, fmtRecord, RECORDS } from './progress.js';
import { LOBBY_SEATS } from '../shared/npcs.js';
import { scaledLimits } from '../shared/dynamics.js';
import * as Save from './save.js';
import { initAudio, sfx, sfxAt, playJackpotMusic, setMusic, setAmbience, setDuck, setVolumes, setDizzyAudio, setShishaSounds, clearShishaSounds, updateListener, shishaDraw, shishaExhale } from './audio.js';
import { bindSfx } from './tables/common.js';
import { UI } from './ui/ui.js';
import { esc } from './ui/dom.js';
import { floorDef, fmtMoney, ITEMS, GAME_NAMES, ACHIEVEMENTS, FLOORS, SECRETS, COSMETIC_UNLOCKS } from '../shared/config.js';

export class App {
  constructor() {
    this.save = Save.load();
    this.sfx = sfx;
    bindSfx(sfx);
    this.engine = new Engine(document.getElementById('game'), this.save.settings);
    this.input = new Input(this.engine.renderer.domElement);
    this.player = new LocalPlayer(this);
    this.ui = new UI(this);
    this.avatars = new Map();
    this.state = null;
    this.me = null;
    this.net = null;
    this.world = null;
    this.cinematic = null;
    this.raycaster = new THREE.Raycaster();
    this.moveTimer = 0;
    this.lastPoseKey = '';
    this.hands = new FPHands(this.save.appearance);
    this.engine.camera.add(this.hands.group);
    this.highRiskTables = new Set();
    this.engine.onTick((dt, t) => this.tick(dt, t));
    this.input.onClick(e => this.onCanvasClick(e));
    this.touch = new TouchControls(this);
    this.engine.onAdapt = kind => { if (this.perfOn) this.ui.toast(kind === 'fps' ? 'Performance: stabile 30 FPS' : `Performance: Grafik automatisch auf ${this.engine.quality}`, 'info', 2500); };
    if (/[?&]perf=1/.test(location.search)) setTimeout(() => this.togglePerf(true), 0);
    window.addEventListener('keydown', e => this.onKey(e));
    window.app = this;
  }

  start() {
    this.loadWorld('lobby');
    this.engine.start();
    this.ui.showMenu();
    // Handy: zuerst der Startbildschirm, damit ein Tippen Vollbild + Audio freischalten kann
    if (this.touch.active) this.ui.showMobileStart();
  }

  get pot() { return this.state?.pot ?? 0; }
  playerName(id) { return this.state?.players.find(p => p.id === id)?.name || '?'; }
  get prestige() { return this.state?.campaign?.prestige || 0; }
  get mePlayer() { return this.state?.players.find(p => p.id === this.me); }
  distanceTo(v) { return this.player.pos.distanceTo(new THREE.Vector3(v.x, 0, v.z)); }

  // ───────────────────────── Verbindung ─────────────────────────
  async connect(mode, code, onStatus) {
    initAudio(this.save.settings);
    const profile = Save.profile();
    const t = mode === 'solo' ? new LocalTransport() : new WSTransport();
    t.onMessage(m => this.onMessage(m));
    const first = mode === 'join' ? { t: 'join', code, profile } : { t: 'create', profile };
    await t.connect(first, onStatus);
    this.net = t;
    this.mode = mode;
  }

  disconnect() {
    this.net?.close();
    this.net = null;
    this.state = null;
    this.me = null;
    for (const a of this.avatars.values()) a.root.removeFromParent();
    this.avatars.clear();
    this.loadWorld('lobby');
  }

  // ───────────────────────── Zurück zur Startseite ─────────────────────────
  // Direkt, wenn nichts Wichtiges läuft (Solo in der Shishabar); sonst mit Bestätigung.
  // Gespeichert wird vorher sofort; im Multiplayer verlässt nur dieser Spieler die Gruppe (Sitze werden frei,
  // der Server bestimmt bei Bedarf einen neuen Gruppenleiter).
  async goHome() {
    if (!this.state) return;
    if (this.mafiaLock) { this.ui.toast('Gerade nicht möglich – die Mafia ist da!', 'warn'); return; }
    const st = this.state;
    const mySpin = Object.values(st.session?.tables || {}).some(t => t.busy && (t.occupant === this.me || t.state?.spinner === this.me));
    const critical = st.scene !== 'lobby' || !!this.player.seated || mySpin || this.mode !== 'solo' || st.players.length > 1 || !!st.vote;
    if (critical) {
      const ok = await this.ui.confirmDialog({
        title: 'Zurück zur Startseite?',
        text: 'Dein gespeicherter Fortschritt bleibt erhalten. Eine aktuelle Casino-Runde oder Multiplayer-Sitzung wird verlassen.',
        ok: 'Zur Startseite',
      });
      if (!ok || !this.state) return;
    }
    this.leaveToMenu();
  }

  leaveToMenu() {
    if (this.player.lounge) this.send({ t: 'seat.leave' });
    if (this.player.seated) { this.send({ t: 'table.leave' }); this.exitSeat(true); }
    if (this.ballCam) this.exitBallCam();
    Save.saveNow();
    this.input.exitLock();
    this.ui.closeModal();
    this.disconnect();
    this.ui.showMenu();
  }

  send(msg) { this.net?.send(msg); }
  tableStart(id, payload) { this.send({ t: 'table.start', id, payload }); }
  tableAction(id, action) { this.send({ t: 'table.action', id, action }); }

  // Spielautomaten: Knöpfe direkt am Gerät
  slotUsable(id) {
    const v = this.world.views?.[id];
    const ts = v?.state;
    if (!v || !ts) return null;
    if (ts.busy) {
      sfx.denied();
      this.ui.toast(ts.state.spinner === this.me ? 'Die Walzen drehen noch…' : `${ts.state.spinnerName || 'Jemand'} dreht gerade an diesem Automaten`, 'warn', 1600);
      return null;
    }
    return v;
  }
  slotBet(id, dir) {
    const v = this.slotUsable(id);
    if (!v) return;
    v.pressButton(dir > 0 ? 'bet+' : 'bet-');
    sfx.button();
    this.send({ t: 'slot.bet', id, dir });
  }
  // Einsatz direkt über das 3D-Pult am Automaten setzen (Server prüft Limits und Sperre)
  slotSetBet(id, bet) {
    const v = this.slotUsable(id);
    if (!v || !(bet > 0)) return;
    this.send({ t: 'slot.setbet', id, bet });
  }
  slotSpin(id) {
    const v = this.slotUsable(id);
    if (!v) return;
    if (v.state.state.bet > this.pot) { sfx.denied(); this.ui.toast(`Nicht genug im Team-Pot für ${fmtMoney(v.state.state.bet)} – BET − drücken`, 'error'); return; }
    v.pressButton('spin');
    sfx.button();
    this.lastSlotId = id;
    this.hands?.play('pull');
    this.send({ t: 'slot.spin', id });
  }
  // ───────────────────────── Roulette-Kugelkamera (C) ─────────────────────────
  // Rein lokal: die Kamerawahl eines Spielers beeinflusst niemals andere Spieler.
  spinningRoulette(prefer) {
    const list = Object.values(this.world?.views || {}).filter(v => v.def.type === 'roulette' && v.spinning);
    if (prefer && list.includes(prefer)) return prefer;
    return list.sort((a, b) => this.distanceTo(a.group.position) - this.distanceTo(b.group.position))[0] || null;
  }
  toggleBallCam(prefer) {
    if (this.ballCam) { this.exitBallCam(); return; }
    if (this.cinematic || this.mafiaLock) return;
    const view = this.spinningRoulette(prefer);
    if (!view) { this.ui.toast('Die Kugelkamera (C) gibt es, während eine Roulette-Kugel rollt', 'info', 2200); return; }
    const cam = this.engine.camera;
    this.ballCam = { view, pos: cam.position.clone(), look: this.player.camLook.clone(), until: 0, started: performance.now() };
    this.input.exitLock();
    document.body.classList.add('ballcam');
    sfx.whoosh();
    this.player.seated?.refreshPanel?.();
  }
  exitBallCam() {
    if (!this.ballCam) return;
    this.ballCam = null;
    this.player.blendFrom(this.engine.camera);
    document.body.classList.remove('ballcam');
    this.player.seated?.refreshPanel?.();
  }
  updateBallCam(dt) {
    const bc = this.ballCam;
    if (!bc) return;
    bc.view.ballCamPose(dt, bc);
    const now = performance.now();
    // Nach dem Ergebnis kurz halten, dann automatisch zurück (Fallback, falls kein Ergebnis eintrifft)
    if ((bc.until && now > bc.until) || (!bc.view.spinning && !bc.until && now - bc.started > 3000 && bc.view.landed && !bc.view.state?.busy)) this.exitBallCam();
  }

  slotNear() {
    const it = this.world?.nearestInteract?.(this.player.pos);
    return it?.table?.walkUp ? it.table : null;
  }

  // Raycast auf Automatenknöpfe: Fadenkreuz (Maus gefangen) oder Mauszeiger
  pickSlotButton(ndc) {
    const views = Object.values(this.world.views || {}).filter(v => v.walkUp && this.distanceTo(v.group.position) < 3);
    if (!views.length) return null;
    this.raycaster.setFromCamera(ndc, this.engine.camera);
    this.raycaster.far = 2.8;
    const hits = this.raycaster.intersectObjects(views.flatMap(v => v.pickMeshes()), false);
    this.raycaster.far = Infinity;
    return hits[0]?.object.userData.slotButton || null;
  }
  aimNdc() { return this.input.locked ? new THREE.Vector2(0, 0) : new THREE.Vector2(...this.mouseNdc()); }

  // ───────────────────────── Mobile ─────────────────────────
  onTouchEnabled() {
    this.input.noLock = true;
    this.input.exitLock();
    this.engine.setMobile(true);
  }

  // ───────────────────────── Performance-Monitor (Entwickler) ─────────────────────────
  togglePerf(on) {
    this.perfOn = on;
    this.ui.perfEl.classList.toggle('hidden', !on);
    clearInterval(this.pingTimer);
    if (on) this.pingTimer = setInterval(() => { if (this.mode && this.mode !== 'solo') this.send({ t: 'ping', at: performance.now() }); }, 2000);
  }
  updatePerf() {
    if (!this.perfOn || (this.perfT = (this.perfT || 0) + 1) % 15) return;
    const e = this.engine, r = e.renderer, i = r.info, s = e.stats;
    const c = r.domElement;
    this.ui.perfEl.textContent = [
      `FPS ${s.fps.toFixed(0)} (min ${s.minFps.toFixed(0)}) · ${s.ms.toFixed(1)} ms`,
      `Render ${c.width}×${c.height} · PR ${r.getPixelRatio().toFixed(2)}${e.dynamic ? ' (dyn)' : ''}`,
      `Draw Calls ${i.render.calls} · Tris ${(i.render.triangles / 1000).toFixed(0)}k`,
      `Texturen ${i.memory.textures} · Geometrien ${i.memory.geometries}`,
      `Qualität ${e.quality}${this.save.settings.quality === 'auto' ? ' (auto)' : ''} · FPS-Ziel ${e.fpsTarget || 'max'}${e.msaa ? ` · MSAA ${e.msaa}×` : ''}`,
      this.mode && this.mode !== 'solo' ? `Ping ${this.ping != null ? this.ping.toFixed(0) + ' ms' : '…'} · Updates 15/s` : 'Solo (kein Netzwerk)',
    ].join('\n');
  }

  // Tippen auf den Bildschirm: wie ein Mausklick an dieser Stelle (Tischfelder, Automatenknöpfe); langes Drücken = Rechtsklick
  onTap(x, y, kind) {
    if (!this.state || this.ui.modalOpen || this.mafiaLock || this.touch.portrait) return;
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    if (this.player.seated) {
      this.raycaster.setFromCamera(ndc, this.engine.camera);
      if (kind === 'tap' && this.player.seated.pad?.pick(this.raycaster)) return;
      this.player.seated.hover?.(this.raycaster);
      this.player.seated.pick(this.raycaster, kind === 'long' ? 2 : 0);
      return;
    }
    if (kind === 'tap' && this.world.kind === 'floor') {
      const b = this.pickSlotButton(ndc);
      if (b) b.action();
    }
  }

  // Kontextabhängige Touch-Buttons (nur wenn wirklich eine Interaktion möglich ist)
  contextActions() {
    const out = [];
    if (this.spectating) return [{ label: 'ZUSCHAUEN BEENDEN', cls: 'main', run: () => this.stopSpectate() }];
    if (this.player.lounge) {
      const sh = this.player.lounge.seat.shisha;
      if (sh >= 0) out.push({ label: 'SHISHA RAUCHEN', cls: 'main', run: () => this.smokeShisha(sh), disabled: this.player.smokeT > 0 });
      out.push({ label: 'AUFSTEHEN', cls: 'main', run: () => this.standUp() });
      return out;
    }
    if (this.world?.npcCtl?.rareNear(this.player.pos)) out.push({ label: '???', cls: 'main', run: () => this.meetGoldfinger() });
    if (this.hrNear() && !this.state.events.hr.duel) out.push({ label: '🎲 DUELL', cls: 'main', run: () => this.challengeHr() });
    const it = this.world?.nearestInteract(this.player.pos);
    if (it?.table?.walkUp) {
      const v = it.table, busy = !!v.state?.busy, id = v.def.id;
      out.push({ label: 'BET −', cls: 'bet', run: () => this.slotBet(id, -1), disabled: busy });
      out.push({ label: 'BET +', cls: 'bet', run: () => this.slotBet(id, 1), disabled: busy });
      out.push({ label: busy ? 'DREHT…' : `SPIN ${fmtMoney(v.state?.state.bet || 0)}`, cls: 'spin', run: () => this.slotSpin(id), disabled: busy });
    } else if (it) {
      const verb = typeof it.verb === 'function' ? it.verb() : it.verb;
      out.push({ label: verb || 'BENUTZEN', cls: 'main', run: () => it.action() });
    }
    const p = this.player;
    if (!(p.drinkT > 0)) {
      if (this.makkaCount > 0) out.push({ label: `🍾 MAKKA TRINKEN ×${this.makkaCount}`, cls: 'drink', run: () => this.drinkMakka() });
      if (this.save.appearance.accessory === 'cocktail') out.push({ label: '🍹 TRINKEN', cls: 'drink cocktail', run: () => this.drinkCocktail() });
    }
    return out;
  }

  onMessage(m) {
    switch (m.t) {
      case 'welcome':
        this.me = m.you;
        this.state = m.state;
        this.ui.hideMenu();
        this.loadWorld(m.state.scene, m.state.floor);
        this.syncLoadout();
        this.onState(m.state);
        this.checkUnlocks();
        if (m.code !== 'SOLO') this.ui.toast(`Gruppe ${m.code} – teile den Code mit deinen Freunden!`, 'info', 6000);
        break;
      case 'state': this.onState(m.state); break;
      case 'moves':
        for (const [id, pose] of Object.entries(m.moves)) {
          if (id === this.me) continue;
          const a = this.avatars.get(id);
          if (a && this.mafiaLock) continue; // während der Mafia-Szene stehen alle fest auf der Bühne
          if (a) { a.target = pose; a.setFx(pose.fx); if (!a.emoteUntil || a.emoteUntil < performance.now()) a.setAnim(pose.a); }
        }
        break;
      case 'event': this.onEvent(m.ev); break;
      case 'npcs': if (this.state) { this.state.npcs = m.npcs; this.world?.npcCtl?.sync(m.npcs); } break;
      case 'error':
        this.ui.toast(m.msg, 'error');
        sfx.error();
        if (m.fatal) this.ui.menuError(m.msg);
        break;
      case 'reward': this.onReward(m); break;
      case 'pong': this.ping = performance.now() - m.at; break;
      case 'itemConsumed': {
        const inv = this.save.inventory;
        inv[m.item] = Math.max(0, (inv[m.item] || 0) - 1);
        if (!inv[m.item]) this.save.loadout = this.save.loadout.filter(k => k !== m.item);
        this.bumpStat('itemsUsed', 1);
        Save.save();
        this.ui.refreshHud();
        break;
      }
      case 'disconnected':
        this.ui.toast('Verbindung zum Server verloren', 'error', 8000);
        this.disconnect();
        this.ui.showMenu();
        break;
    }
  }

  syncLoadout() {
    this.send({ t: 'loadout', items: this.save.loadout, inventory: this.save.inventory });
  }

  onState(st) {
    const prevScene = this.state?.scene;
    this.state = st;
    if (!this.world) return;
    // Spielstand sichern
    const s = this.save;
    const c = st.campaign;
    // Permanenter Fortschritt: Rekorde und je abgeschlossene Stockwerke (Kosmetik) bleiben über alle Runs erhalten
    s.campaign = {
      ...s.campaign,
      everCompleted: [...new Set([...(s.campaign.everCompleted || []), ...(c.everCompleted || []), ...c.completed])].sort((a, b) => a - b),
      highestPot: Math.max(s.campaign.highestPot || 0, c.highestPot),
      bestWinnings: Math.max(s.campaign.bestWinnings || 0, c.bestWinnings || 0),
      bestDouble: Math.max(s.campaign.bestDouble || 0, c.bestDouble || 0),
      gameComplete: s.campaign.gameComplete || c.gameComplete,
      finishedAt: s.campaign.finishedAt || c.finishedAt,
      runs: Math.max(s.campaign.runs || 0, c.runs || 0),
      prestige: Math.max(s.campaign.prestige || 0, c.prestige || 0),
      prestigeReady: st.hostId === this.me ? !!c.prestigeReady : !!s.campaign.prestigeReady,
    };
    // Run-Fortschritt kommt immer exakt vom Server (kein Zusammenführen mit alten Runs); gespeichert wird er vom Gruppenersteller
    if (st.hostId === this.me) s.run = { id: st.run.id, pot: st.pot, finalUnlocked: st.run.finalUnlocked, startedAt: st.run.startedAt, unlocked: c.unlocked, completed: [...c.completed], stats: st.runStats };
    if (st.pot > s.stats.highestPot) s.stats.highestPot = st.pot;
    if (st.scene === 'floor') this.record('bestPot', st.pot);
    const meP = st.players.find(p => p.id === this.me);
    if (meP && Number.isFinite(meP.makka)) s.makka = meP.makka;
    if (st.pot >= 1e6) this.achieve('millionaire');
    if (st.pot >= 1e8) this.achieve('hundred_m');
    Save.save();
    this.syncAvatars();
    // Tische
    if (this.world.kind === 'floor' && st.session) {
      // Einsatzgrenzen mit Floor Modifier / High-Roller-Rush (gleiche Rechnung wie auf dem Server)
      const modId = st.dyn?.modifier?.id, rushId = st.dyn?.rush?.id;
      for (const v of Object.values(this.world.views || {})) {
        v.baseLimits ||= v.limits;
        const lim = scaledLimits(v.baseLimits, modId, rushId);
        if (lim !== v.limits) { v.limits = lim; if (v.bet) { v.bet.limits = lim; v.bet.set(v.bet.value); } }
      }
      for (const [id, ts] of Object.entries(st.session.tables)) this.world.views[id]?.setState(ts);
      const me = this.mePlayer;
      if (me?.seat && !this.player.seated) { this.stopSpectate(); this.enterSeat(me.seat); }
      if (this.spectating && this.spectating.view.state?.occupant !== this.spectating.pid) { this.stopSpectate(); this.ui.toast('Die Runde ist vorbei – Zuschauen beendet', 'info'); }
      if (!me?.seat && this.player.seated) this.exitSeat();
    }
    this.world.npcCtl?.sync(st.npcs);
    this.world.npcCtl?.syncHr(st.events?.hr || null);
    this.coopEnd = st.events?.coop ? performance.now() + st.events.coop.leftMs : 0;
    // Sitzplatz in der Shishabar: erst wenn der Server ihn bestätigt, setzt sich der Spieler (kein Doppelbelegen)
    if (this.world.kind === 'lobby') {
      const ls = this.mePlayer?.lseat;
      if (ls != null && !this.player.lounge) { this.seatPending = null; this.player.sitLounge(LOBBY_SEATS[ls]); sfx.pop?.(); }
      else if (ls == null && this.player.lounge?.phase === 'down' && !this.seatPending) this.player.standLounge();
    }
    this.world.onState?.();
    this.ui.refreshHud();
    this.ui.renderVote(st.vote);
    void prevScene;
  }

  // ───────────────────────── Welten ─────────────────────────
  loadWorld(scene, floor) {
    if (this.player.seated) this.exitSeat(true);
    this.spectating = null;
    const old = this.world;
    for (const a of this.avatars.values()) a.root.removeFromParent();
    this.selfChar?.root.removeFromParent(); // eigener Charakter wird weiterverwendet, nicht mit dem alten Raum freigeben
    this.world = scene === 'floor' ? new CasinoWorld(this, floor) : scene === 'final' ? new FinalWorld(this) : new LobbyWorld(this);
    this.engine.setScene(this.world.scene);
    this.world.scene.add(this.engine.camera);
    old?.dispose();
    this.world.setupLod?.();
    this.engine.tuneScene(this.world.scene);
    if (this.world.npcSpot) { this.world.npcCtl = new NpcController(this, this.world); if (this.state?.npcs) this.world.npcCtl.sync(this.state.npcs); }
    const idx = this.state ? Math.max(0, this.state.players.findIndex(p => p.id === this.me)) : 0;
    this.player.spawn(this.world, idx);
    this.cinematic = null;
    if (this.ballCam) { this.ballCam = null; document.body.classList.remove('ballcam'); }
    this.mafiaLock = false;
    this.mafiaCam = null;
    this.hands.group.visible = this.world.mode === 'first';
    // Eigener Charakter (in Third-Person sichtbar)
    if (!this.selfChar) { this.selfChar = new Character(this.save.appearance); }
    this.world.scene.add(this.selfChar.root);
    this.selfChar.root.visible = this.world.mode === 'third';
    for (const a of this.avatars.values()) this.world.scene.add(a.root);
    // Musik & Atmosphäre
    if (scene === 'floor') { setMusic('casino', floorDef(floor, this.prestige).tier, this.world.style?.music); setAmbience('casino'); }
    else if (scene === 'final') { setMusic('final'); setAmbience(null); }
    else { setMusic('lounge'); setAmbience('lounge'); }
    // Räumliche Shisha-Geräusche nur in der Shishabar
    if (scene === 'lobby' && this.world.shishas) setShishaSounds(this.world.shishas.map(sh => sh.position.clone().setY(0.8)));
    else clearShishaSounds();
    setDuck(false);
    this.highRiskTables.clear();
    if (this.world.elevator && this.world.spawn.inElevator) {
      this.world.elevator.userData.snap(false);
      setTimeout(() => { this.world.elevator?.userData.setOpen(true); sfx.doors(); }, 700);
    }
    this.ui.onSceneChange(scene, floor);
    if (this.state?.session && scene === 'floor') for (const [id, ts] of Object.entries(this.state.session.tables)) this.world.views[id]?.setState(ts);
  }

  syncAvatars() {
    const ids = new Set();
    for (const p of this.state.players) {
      if (p.id === this.me) continue;
      ids.add(p.id);
      let a = this.avatars.get(p.id);
      const key = JSON.stringify(p.appearance) + p.name;
      if (a && a.key !== key) { a.root.removeFromParent(); this.avatars.delete(p.id); a = null; }
      if (!a) {
        a = new Character(p.appearance, { name: p.name });
        a.key = key;
        a.root.position.set(p.pose.p[0], 0, p.pose.p[2]);
        a.target = p.pose;
        a.setFx(p.pose.fx);
        this.avatars.set(p.id, a);
        this.world.scene.add(a.root);
      }
    }
    for (const [id, a] of this.avatars) if (!ids.has(id)) { a.root.removeFromParent(); this.avatars.delete(id); }
  }

  refreshSelf() {
    this.selfChar.rebuild(this.save.appearance);
    this.hands.build(this.save.appearance);
    this.send({ t: 'profile', name: this.save.name, appearance: this.save.appearance });
  }

  // ───────────────────────── Tische ─────────────────────────
  sitAt(id) {
    if (this.world.views?.[id]?.walkUp) return this.slotSpin(id);
    const ts = this.state?.session?.tables[id];
    if (ts?.occupant && ts.occupant !== this.me) { this.spectate(this.world.views[id]); return; }
    this.send({ t: 'table.sit', id });
  }

  // Zuschauen: Kamera schräg hinter den spielenden Freund, Karten/Würfel/Kugel laufen für alle synchron
  spectate(view) {
    if (!view?.state?.occupant) return;
    this.spectating = { view, pid: view.state.occupant };
    const sl = view.seatLocal;
    const pos = view.toWorld(new THREE.Vector3(sl.x + 0.9, 2.0, sl.z + 1.0));
    const look = view.toWorld(view.lookLocal.clone());
    this.cinematic = { pos, look };
    this.input.exitLock();
    this.ui.toast(`👀 Du schaust ${this.playerName(view.state.occupant)} zu – E oder ESC beendet`, 'info');
  }
  stopSpectate() {
    if (!this.spectating) return;
    this.spectating = null;
    this.cinematic = null;
    this.player.snapCamera = true;
  }

  enterSeat(id) {
    const view = this.world.views?.[id];
    if (!view) return;
    this.player.sit(view);
    this.input.exitLock();
    this.ui.openTablePanel(view);
  }

  exitSeat(silent) {
    this.player.stand();
    this.ui.closeTablePanel();
    if (!silent) this.input.requestLock();
  }

  leaveTable() { this.send({ t: 'table.leave' }); }

  async requestReturn() {
    if (!this.state?.session) return;
    if (!this.state.session.targetReached) {
      const f = floorDef(this.state.floor, this.prestige);
      const ok = await this.ui.confirm(`Ziel (${fmtMoney(f.target)}) noch nicht erreicht. Trotzdem mit ${fmtMoney(this.pot)} zur Shishabar zurück?`);
      if (!ok) return;
    }
    this.send({ t: 'vote.start', type: 'return' });
  }

  async requestPrestige() {
    const lvl = (this.state?.campaign?.prestige || 0) + 1;
    const ok = await this.ui.confirmDialog({ title: `PRESTIGE ${lvl} starten?`, text: 'Der Run beginnt neu mit höheren Zielen. 🍆, Kosmetik, Achievements, Rekorde und Trophäen bleiben erhalten.', ok: 'Prestige starten' });
    if (ok) this.send({ t: 'vote.start', type: 'prestige' });
  }

  requestTravel(floor) { this.send({ t: 'vote.start', type: floor === 'final' ? 'final' : 'travel', data: { floor } }); }
  async requestFinal(kind) {
    const pot = this.pot;
    const text = kind === 'double'
      ? `CURRENT WINNINGS: ${fmtMoney(pot)}\nDOUBLE: ${fmtMoney(pot * 2)}\nLOSE: $0\n\nARE YOU SURE?`
      : `TAKE THE WINNINGS: ${fmtMoney(pot)} sichern und den Run beenden?`;
    if (!(await this.ui.confirm(text))) return;
    this.send({ t: 'vote.start', type: kind });
  }

  // ───────────────────────── Events ─────────────────────────
  onEvent(ev) {
    const mine = ev.pid === this.me;
    switch (ev.kind) {
      case 'scene': {
        const label = ev.scene === 'floor' ? `STOCK ${ev.floor}` : ev.scene === 'final' ? 'PENTHOUSE' : 'SHISHABAR';
        if (ev.scene === 'lobby' && ev.reason === 'return') this.ui.feed(`Zurück in der Shishabar mit ${fmtMoney(ev.pot)}`);
        this.ui.elevatorTransition(label, () => this.loadWorld(ev.scene, ev.floor), ev.scene === 'floor' ? floorDef(ev.floor, this.prestige) : null);
        if (ev.scene === 'floor') this.visitFloor(ev.floor);
        break;
      }
      case 'bet': {
        this.ui.feed(`<b>${esc(ev.name)}</b> SETZT ${esc(ev.label || fmtMoney(ev.amount))}`, ev.highRisk ? 'risk' : '');
        if (mine) { this.bumpStat('wagered', ev.amount); if (ev.share >= 0.5) this.achieve('big_bet'); }
        if (!mine && !ev.highRisk && ev.share >= 0.1) this.ui.bigText(`${ev.name.toUpperCase()}`, `SETZT ${ev.label || fmtMoney(ev.amount)}`, 'bet', 2200);
        if (ev.highRisk) {
          this.ui.bigText('HIGH RISK BET', `${mine ? '' : ev.name + ': '}${fmtMoney(ev.amount)}${ev.label ? ' – ' + ev.label : ''}`, 'risk', 2600);
          this.highRiskTables.add(ev.tableId);
          setDuck(true);
          if (!this.heartbeat) this.heartbeat = setInterval(() => sfx.heartbeat(), 850);
        }
        break;
      }
      case 'result': this.onResult(ev, mine); break;
      case 'target': {
        if (ev.firstTime) this.bumpStat('floorsCompleted', 1);
        if (ev.final) this.achieve('game_complete');
        if (ev.final && this.state?.run?.startedAt) this.record('fastestRun', (Date.now() - this.state.run.startedAt) / 1000);
        sfx.bigWin();
        this.world.particles?.confetti(this.player.pos.clone().setY(2.5), 160, 6);
        // Statt sofort weiterzuspielen öffnet sich die Stockwerk-Bilanz (Event „balance“ folgt direkt)
        if (ev.newFloor) this.ui.popup('floor', `STOCKWERK ${ev.newFloor} FREIGESCHALTET`, floorDef(ev.newFloor, this.prestige).name);
        break;
      }
      case 'coop': this.onCoop(ev); break;
      case 'modifier':
        if (ev.phase === 'start') setTimeout(() => { this.ui.popup('modifier', `FLOOR MODIFIER: ${ev.icon} ${ev.name}`, ev.desc, 6000); sfx.ding(); }, 2600);
        else { this.ui.popup('modifier', `ENTHÜLLT: ${ev.icon} ${ev.name}`, ev.desc, 5000); sfx.drumroll?.(); }
        break;
      case 'rush':
        if (ev.phase === 'start') { this.ui.popup('rush', `🔥 ${ev.name} – 30 SEKUNDEN!`, ev.desc, 4000); sfx.jackpot?.(); this.stats('rushes'); }
        else { this.ui.toast('RUSH VORBEI', 'info', 2200); }
        break;
      case 'streak': this.onStreak(ev, mine); break;
      case 'finale':
        // Phase 1: Erfolgsanimation · Phase 2: Stockwerk-Bilanz (öffnet danach) · Phase 3: RUN-BILANZ über den Weiter-Knopf
        this.finale = ev;
        this.finaleUntil = performance.now() + 4600;
        this.ui.finaleSplash();
        sfx.jackpot?.(); playJackpotMusic(8);
        for (let i = 0; i < 6; i++) setTimeout(() => this.world.particles?.confetti(this.player.pos.clone().setY(3), 120, 6), i * 500);
        break;
      case 'balance': {
        const me = ev.ledger?.players?.[this.me];
        if (me) {
          const net = me.balance - me.start;
          if (net > 0) this.record('floorNetBest', net); else if (net < 0) this.record('floorNetWorst', -net);
          const top = Math.max(me.start, ...ev.ledger.points.filter(p => p.pid === this.me).map(p => p.bal));
          this.record('bestBalance', top);
        }
        this.lastBalance = ev;
        this.input.exitLock();
        if (this.player.seated) this.ui.closeTablePanel();
        // Beim Finale erst nach der Erfolgsanimation öffnen
        setTimeout(() => { if (this.lastBalance === ev && this.state?.scene === 'floor') this.ui.openBalance(ev); }, ev.last ? 5200 : 900);
        break;
      }
      case 'prestige':
        setTimeout(() => { this.ui.popup('event', `PRESTIGE ${ev.level} ERREICHT`, `Neuer Run: alle Ziele ×${ev.scale.toFixed(1)} – deine Kosmetik, 🍆 und Rekorde bleiben`, 6000); this.checkUnlocks(); }, 2500);
        break;
      case 'hr': this.onHighRoller(ev, mine); break;
      case 'challenge': {
        this.ui.feed(`🏅 Challenge geschafft: <b>${esc(ev.text)}</b>`, 'good');
        // Wer sie schon früher geschafft hat, bekommt keine 🍆 mehr – kurzer Hinweis statt Popup
        if (this.save.challenges.includes(ev.id)) this.ui.toast(`🏅 ${ev.text} – schon früher geschafft`, 'info');
        break;
      }
      case 'mafia': this.mafiaSequence(ev); break;
      case 'briefcase':
        this.ui.bigText('💼 MAFIA BRIEFCASE', `${ev.name} besticht die Mafia: +${fmtMoney(ev.amount)}`, 'gold', 3500);
        sfx.chips(10);
        break;
      case 'item': {
        this.ui.feed(`${ITEMS[ev.item]?.icon || ''} <b>${esc(ev.name)}</b>: ${esc(ev.msg)}`, 'item');
        this.ui.itemPop(ev);
        if (mine) this.hands.holdItem(itemModel(ev.item));
        else this.avatarIcon(ev.pid, ITEMS[ev.item]?.icon || '✨');
        if (ev.result === 'win' || ev.result === 'gold') sfx.win(); else if (ev.result === 'lose' || ev.result === 'black') sfx.lose(); else sfx.pop();
        break;
      }
      case 'drink':
        if (mine) this.onDrink(ev);
        if (ev.phase === 'buy') this.ui.feed(`🍾 <b>${esc(ev.name)}</b> kauft einen MAKKA`);
        else if (ev.phase === 'bar') { this.ui.feed(`🍾 <b>${esc(ev.name)}</b> holt sich einen MAKKA ${esc(ev.flavor)} an der Bar`); if (!mine) { this.avatarIcon(ev.pid, '🍾'); sfxAt(this.avatarVolume(ev.pid), () => sfx.gulp()); } }
        else if (ev.phase === 'cocktail') { if (!mine) { sfxAt(this.avatarVolume(ev.pid), () => sfx.sip()); if (ev.n === 3) this.avatarIcon(ev.pid, '🥴'); } }
        else { this.ui.feed(`🥴 <b>${esc(ev.name)}</b> trinkt MAKKA – alles dreht sich!`); if (!mine) { this.avatarIcon(ev.pid, '🥴'); sfxAt(this.avatarVolume(ev.pid), () => sfx.gulp()); } }
        break;
      case 'makkaLuck':
        this.makkaLuckEnd = performance.now() + ev.ms;
        this.ui.feed(`🍹 <b>${esc(ev.name)}</b> trinkt MAKKA im Casino – <b class="win">MAKKA LUCK</b> für die ganze Gruppe (${Math.round(ev.ms / 1000)}s)!`, 'item');
        if (!mine) this.ui.toast(`🍹 ${ev.name}: MAKKA LUCK für ${Math.round(ev.ms / 1000)} Sekunden!`, 'good', 2500);
        sfx.shop();
        break;
      case 'smoke': this.onSmoke(ev, mine); break;
      case 'emote': {
        const a = this.avatars.get(ev.pid);
        if (a) { a.setAnim(ev.e); a.emoteUntil = performance.now() + 2600; if (ev.e === 'money') this.moneyRain(a.root.position); }
        break;
      }
      case 'join': if (!mine) { this.ui.toast(`${ev.name} ist der Gruppe beigetreten`, 'info'); sfx.ding(); } break;
      case 'leave': this.ui.toast(`${ev.name} hat die Gruppe verlassen`, 'warn'); break;
      case 'toast': this.ui.toast(ev.msg, 'info'); break;
      case 'newrun':
        if (ev.reason === 'manual') this.ui.toast(`Neuer Run gestartet: ${fmtMoney(ev.pot)}`, 'info');
        if (ev.reason === 'mafia') this.ui.feed(`🔄 Run verloren – neuer Run mit <b>${fmtMoney(ev.pot)}</b>, nur Stock 1 freigeschaltet`, 'risk');
        break;
      case 'take': this.finalTake(ev); break;
      case 'coin': this.finalCoin(ev); break;
      case 'doubleResult': this.finalDoubleResult(ev); break;
    }
  }

  onResult(ev, mine) {
    const view = this.world.views?.[ev.tableId];
    view?.onEvent(ev);
    if (this.highRiskTables.has(ev.tableId)) {
      this.highRiskTables.delete(ev.tableId);
      if (!this.highRiskTables.size) { setDuck(false); clearInterval(this.heartbeat); this.heartbeat = null; }
    }
    if (ev.stake > 0 || ev.payout > 0) {
      const txt = ev.net > 0 ? `gewinnt <b class="win">${fmtMoney(ev.net)}</b>` : ev.net < 0 ? `verliert <b class="lose">${fmtMoney(-ev.net)}</b>` : 'Push';
      this.ui.feed(`<b>${esc(ev.name)}</b> ${GAME_NAMES[ev.game]}: ${txt} – ${esc(ev.detail || '')}${ev.effects?.length ? ' ' + esc(ev.effects.join(' ')) : ''}`);
    }
    const near = this.distanceTo(this.world.views?.[ev.tableId]?.group.position || this.player.pos) < 8;
    // Tisch-Inszenierung für alle: schwebender Betrag, Dealer-Reaktion, starke Effekte bei grossen Gewinnen
    if (view && !view.ownFeedback && (ev.stake > 0 || ev.payout > 0) && this.distanceTo(view.group.position) < 22) {
      const delay = view.resultDelay || 0;
      setTimeout(() => {
        if (this.world.views?.[ev.tableId] !== view) return;
        if (ev.net !== 0) view.floatText(`${ev.net > 0 ? '+' : '−'}${fmtMoney(Math.abs(ev.net))}`, ev.net > 0 ? '#7cff6b' : '#ff6b6b', { scale: ev.bigWin ? 1.5 : 1 });
        else view.floatText('PUSH', '#ffd97a');
        view.dealerReact(ev);
        if (ev.bigWin && ev.net > 0) {
          const pos = view.group.position.clone().setY(1.8);
          this.world.particles?.confetti(pos, ev.net >= ev.stake * 15 ? 220 : 120, 2.5);
          this.world.flashAt?.(pos, ev.net >= ev.stake * 15 ? 5 : 4);
          if (mine) this.shake(ev.net >= ev.stake * 15 ? 0.5 : 0.3);
        }
      }, delay);
    }
    // Seltener Jackpot: alle auf dem Stockwerk sehen und hören es (Lichter, Musik, Feuerwerk, jubelnde NPCs)
    if (ev.jackpot && view) {
      const delay = view.spinning ? 1800 : 300;
      setTimeout(() => {
        if (this.world.views?.[ev.tableId] !== view) return;
        this.world.jackpotShow?.(view.group.position.clone());
        this.world.npcCtl?.cheerAll(view.group.position);
        const near = this.distanceTo(view.group.position) < 10;
        if (!mine && !near) { playJackpotMusic(6); this.ui.popup('jackpot', `JACKPOT! ${ev.name}`, `+${fmtMoney(ev.net)} am ${GAME_NAMES[ev.game]}`, 5000); }
        else if (mine) this.ui.popup('jackpot', 'JACKPOT!', `+${fmtMoney(ev.net)}`, 5000);
        for (const a of this.avatars.values()) if (!a.emoteUntil || a.emoteUntil < performance.now()) { a.setAnim('cheer'); a.emoteUntil = performance.now() + 2600; }
      }, delay);
    }
    if (view?.ownFeedback) {
      // Automaten zeigen Gewinnstufen selbst (Sound, Licht, Münzen, grosse Anzeige)
    } else if (ev.jackpot) {
      this.ui.bigText('JACKPOT', `${ev.name}: +${fmtMoney(ev.net)}`, 'jackpot', 4500);
      sfx.jackpot();
      const v = this.world.views?.[ev.tableId];
      if (v) this.world.particles.confetti(v.group.position.clone().setY(2.2), 200, 3);
    } else if (ev.blackjacks && ev.net > 0 && (mine || near)) {
      this.ui.bigText('BLACKJACK!', `${mine ? '' : ev.name + ': '}+${fmtMoney(ev.net)}`, 'jackpot', 3200);
    } else if (ev.bigWin) {
      this.ui.bigText('BIG WIN', `${ev.name}: +${fmtMoney(ev.net)}`, 'win', 3000);
      sfx.bigWin();
      this.selfChar && mine && this.hands.play('cheer');
    } else if (mine || near) {
      if (ev.net > 0) sfx.win(); else if (ev.net < 0 && mine) sfx.lose();
    }
    if (ev.net > 0 && (ev.stake > 0)) this.luckySparkle(ev.pid);
    if (mine && (ev.stake > 0 || ev.payout > 0)) {
      const st = this.save.stats;
      st.rounds++;
      st.games ||= {};
      st.games[ev.game] = (st.games[ev.game] || 0) + 1;
      if (ev.net < 0) { st.lossStreak = (st.lossStreak || 0) + 1; st.bestLossStreak = Math.max(st.bestLossStreak || 0, st.lossStreak); if (st.lossStreak >= 5) this.achieve('unlucky'); }
      else if (ev.net > 0) st.lossStreak = 0;
      if (ev.net >= 10000) this.achieve('high_roller');
      if (ev.net > 0) {
        this.record('bestWin', ev.net);
        const per = { blackjack: 'bj', roulette: 'roulette', slots: 'slots', highslots: 'slots', plinko: 'plinko', mines: 'mines', tower: 'tower' }[ev.game];
        if (per) this.record(per, ev.net);
        if (ev.game === 'crash' && ev.multiplier) this.record('crashMult', ev.multiplier);
      } else if (ev.net < 0) this.record('worstLoss', -ev.net);
      if (ev.game === 'blackjack' && ev.net > 0 && (st.blackjackWins || 0) + 1 >= 25) this.achieve('bj_master');
      if (['slots', 'highslots', 'roulette', 'wheel'].includes(ev.game)) st.spins++; else st.hands++;
      if (ev.net > 0) {
        st.won += ev.net; st.roundsWon++;
        st.biggestWin = Math.max(st.biggestWin, ev.net);
        const key = { roulette: 'rouletteWins', blackjack: 'blackjackWins', baccarat: 'baccaratWins', craps: 'crapsWins', poker: 'pokerWins', wheel: 'wheelWins' }[ev.game];
        if (key) st[key]++;
        this.achieve('first_win');
      } else if (ev.net < 0) {
        st.lost += -ev.net;
        st.biggestLoss = Math.max(st.biggestLoss, -ev.net);
      }
      if (ev.jackpot) { st.slotJackpots++; this.achieve('jackpot'); }
      if (ev.blackjacks) { st.blackjacks += ev.blackjacks; if (st.blackjacks >= 5) this.achieve('blackjack5'); }
      if (ev.straight) this.achieve('straight_up');
      if (ev.tieWin) this.achieve('bacc_tie');
      if (ev.pointHit && ev.net > 0) this.achieve('craps_point');
      if (ev.pokerCat >= 5) this.achieve('poker_flush');
      if (ev.wheel === 'x50' && ev.net > 0) this.achieve('wheel50');
      Save.save();
    }
  }

  onReward(m) {
    Save.addDildos(m.dildos);
    // 🍆 pro Run (für den Rekord „Meiste 🍆 in einem Run“)
    const rid = this.state?.run?.id;
    if (rid) { if (this.save.runDildos?.id !== rid) this.save.runDildos = { id: rid, n: 0 }; this.save.runDildos.n += m.dildos; this.record('runDildos', this.save.runDildos.n); }
    if (m.kind === 'rush') this.ui.popup('reward', `🍆 DILDO RUSH +${m.dildos}`, 'Glück gehabt!', 2600);
    // Glücks-Kosmetik: winzige Chance auf +1 🍆 (Casino Crown: +1 auf Challenges) – nur 🍆, nie Geld oder Chancen
    const lucky = wornLucky(this.save.appearance);
    if (lucky.length) {
      let extra = 0;
      if (Math.random() < lucky.reduce((a, l) => a + l.bonus, 0)) extra++;
      if (m.kind === 'challenge') extra += lucky.reduce((a, l) => a + (l.challenge || 0), 0);
      if (extra) { Save.addDildos(extra); setTimeout(() => this.ui.popup('reward', `🍀 GLÜCKS-BONUS +${extra} 🍆`, lucky.map(l => l.name).join(' · ')), 900); }
    }
    if (m.floor && !this.save.rewardedFloors.includes(m.floor)) this.save.rewardedFloors.push(m.floor);
    if (m.challenge && !this.save.challenges.includes(m.challenge)) this.save.challenges.push(m.challenge);
    if (m.hr) {
      this.save.hrWon = [...new Set([...(this.save.hrWon || []), m.hr])];
      this.save.events = [...new Set([...(this.save.events || []), 'highroller'])];
      if (m.title) this.save.titles = [...new Set([...(this.save.titles || []), m.title])];
    }
    Save.save();
    if (m.kind === 'challenge') this.save.stats.challengesDone = (this.save.stats.challengesDone || 0) + 1;
    if (m.kind === 'challenge') this.ui.popup('challenge', `CHALLENGE ABGESCHLOSSEN +${m.dildos} 🍆`, m.reason.replace(/^CHALLENGE ABGESCHLOSSEN: /, ''));
    else if (m.kind === 'event') this.ui.popup('event', `EVENT GESCHAFFT +${m.dildos} 🍆`, m.reason.replace(/^(CO-OP-EVENT |HIGH-ROLLER-EVENT: )/, ''));
    else if (m.floor) this.ui.popup('floor', `Stockwerk geschafft! +${m.dildos} 🍆`, `Stock ${m.floor} · ${floorDef(m.floor, this.prestige).name}`, 4500);
    else this.ui.reward(m.dildos, m.reason);
    this.ui.refreshHud();
    this.checkUnlocks();
  }

  achieve(id) {
    if (Save.unlockAchievement(id)) {
      const a = ACHIEVEMENTS[id];
      this.ui.reward(a.reward, `ACHIEVEMENT: ${a.name} – ${a.desc}`, true);
      this.ui.refreshHud();
      this.checkUnlocks();
    }
  }

  // Neu freigeschaltete Kosmetik/Emotes melden („NEUES ITEM“)
  checkUnlocks() {
    // Neue Trophäen (für die Vitrine in der Shishabar)
    for (const t of updateTrophies()) setTimeout(() => this.ui.popup('achievement', `NEUE TROPHÄE: ${t.name}`, `${t.desc} – steht jetzt in der Vitrine der Shishabar`, 4500), 1600);
    const s = this.save;
    const free = freeCosmetics();
    if (!s.seenUnlocks) { s.seenUnlocks = free; Save.save(); return; }
    for (const key of free) {
      if (s.seenUnlocks.includes(key) || COSMETIC_UNLOCKS[key].shop) continue;
      s.seenUnlocks.push(key);
      const [cat, val] = key.split(':');
      const name = cat === 'emote' ? `Emote: ${EXTRA_EMOTES.find(e => e[0] === val)?.[2] || val}` : (CHAR_OPTIONS[cat]?.find(o => o[0] === val)?.[1] || val);
      setTimeout(() => this.ui.popup('item', 'NEUES ITEM', `${name} – ${cat === 'emote' ? 'Taste 6–8 / 😀' : 'im Spiegel ausrüsten'}`), 1200);
    }
    this.ui.renderEmotes();
    Save.save();
  }

  // ───────────────────────── Streaks & persönliche Rekorde ─────────────────────────
  stats(key, v = 1) { this.save.stats[key] = (this.save.stats[key] || 0) + v; Save.save(); }

  onStreak(ev, mine) {
    if (!mine) {
      if (ev.hot && ev.n >= 5) this.ui.feed(`🔥 <b>${esc(ev.name)}</b> ist ${ev.n >= 10 ? 'UNSTOPPABLE' : 'ON FIRE'} (${ev.n} Siege in Folge)!`, 'item');
      return;
    }
    if (ev.hot) {
      if (ev.n >= 5) { this.ui.popup('rush', ev.n >= 10 ? `UNSTOPPABLE 🔥🔥 ×${ev.n}` : `ON FIRE 🔥 ×${ev.n}`, `${ev.n} Siege in Folge`, 3200); sfx.cheer?.(); }
      if (ev.n >= 5) this.achieve('hot5');
      if (ev.n >= 10) this.achieve('hot10');
      if (ev.n >= 20) this.achieve('hot20');
      this.record('winStreak', ev.n);
    } else {
      if (ev.n >= 5) this.achieve('loss5');
      if (ev.n >= 10) this.achieve('loss10');
      if (ev.n >= 15) this.achieve('loss15');
      this.record('lossStreak', ev.n);
    }
  }

  // Rekord prüfen; Popup nur, wenn es schon einen alten Rekord gab (und höchstens alle 45 s pro Rekord)
  record(key, value) {
    const r = checkRecord(key, value);
    if (!r || r.old === undefined) return;
    if (RECORDS[key].fmt === 'count' && r.value < 5) return; // kleine Serien sind kein Popup wert
    this.recordShown ||= {};
    if (performance.now() - (this.recordShown[key] || -1e9) < 45000) return;
    this.recordShown[key] = performance.now();
    this.ui.popup('record', '🏆 NEUER PERSÖNLICHER REKORD', `${RECORDS[key].name}: ${fmtRecord(key, r.old)} → ${fmtRecord(key, r.value)}`, 4500);
  }

  // Flammen über Spielern mit Hot Streak ≥ 5 (für alle sichtbar)
  updateFlames(dt) {
    this.flameT = (this.flameT || 0) - dt;
    if (this.flameT > 0 || !this.state || this.world.kind !== 'floor' || !this.world.particles) return;
    this.flameT = 0.12;
    for (const p of this.state.players) {
      if ((p.hot || 0) < 5) continue;
      const pos = p.id === this.me ? (this.world.mode === 'first' ? null : this.player.pos) : this.avatars.get(p.id)?.root.position;
      if (!pos) continue;
      const big = p.hot >= 10;
      for (let i = 0; i < (big ? 3 : 2); i++) this.world.particles.emit({ pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.7 + Math.random() * 0.2, (Math.random() - 0.5) * 0.4)), vel: [0, 0.6 + Math.random() * 0.4, 0], life: 0.6, size: big ? 0.16 : 0.11, grow: -0.1, opacity: 0.9, color: Math.random() < 0.5 ? '#ff7a1a' : '#ffd60a', additive: true });
    }
  }

  // ───────────────────────── Events (Co-op & High Roller) ─────────────────────────
  onCoop(ev) {
    if (ev.phase === 'start') { this.ui.popup('event', `${ev.name} GESTARTET`, ev.desc, 4200); sfx.ding(); this.ui.feed(`⚡ Co-op-Event <b>${esc(ev.name)}</b>: ${esc(ev.desc)}`, 'item'); }
    else if (ev.phase === 'done') { sfx.bigWin(); this.world.particles?.confetti(this.player.pos.clone().setY(2.5), 120, 4); this.ui.feed(`✅ <b>${esc(ev.name)}</b> geschafft – alle bekommen +${ev.reward} 🍆`, 'good'); }
    else if (ev.phase === 'fail') { this.ui.toast(`⌛ ${ev.name} abgelaufen – kein Problem, kostet nichts`, 'info'); }
  }

  hrNear() {
    const hr = this.state?.events?.hr;
    const c = hr && this.world.npcCtl?.hrChar;
    return !!c && !this.player.seated && Math.hypot(c.root.position.x - this.player.pos.x, c.root.position.z - this.player.pos.z) < 1.8;
  }
  challengeHr() { if (!this.state?.events?.hr?.duel) this.send({ t: 'hr.challenge' }); }

  onHighRoller(ev, mine) {
    const ctl = this.world.npcCtl;
    if (ev.phase === 'arrive') { this.ui.popup('event', `${ev.name.toUpperCase()} IST DA`, 'Fordere ihn zum Würfel-Duell heraus – kostenlos, nur Ruhm & 🍆', 4200); sfx.ding(); this.ui.feed(`🎩 <b>${esc(ev.name)}</b> betritt das Casino und sucht einen Gegner…`, 'item'); }
    else if (ev.phase === 'duel') this.ui.feed(`🎲 <b>${esc(ev.player)}</b> fordert <b>${esc(ev.name)}</b> heraus!`, 'risk');
    else if (ev.phase === 'round') {
      const ps = ev.p[0] + ev.p[1], ns = ev.n[0] + ev.n[1];
      ctl?.hrSay(`🎲 ${ev.player} ${ps} : ${ns} ${ev.name}`, ps > ns ? '#7cff6b' : ps < ns ? '#ff6b6b' : '#ffd97a');
      if (mine || (ctl?.hrChar && this.distanceTo(ctl.hrChar.root.position) < 12)) sfx.card?.();
      if (mine) this.ui.bigText(`${ps} : ${ns}`, `${ev.p.join('+')} gegen ${ev.n.join('+')} · Stand ${ev.score[0]}:${ev.score[1]}`, ps > ns ? 'win' : ps < ns ? 'lose' : 'nice', 1400);
    } else if (ev.phase === 'end') {
      ctl?.hrReact(ev.win);
      this.ui.feed(ev.win ? `🏆 <b>${esc(ev.player)}</b> besiegt <b>${esc(ev.name)}</b>!` : `😈 <b>${esc(ev.name)}</b> gewinnt das Duell gegen <b>${esc(ev.player)}</b>`, ev.win ? 'good' : 'risk');
      if (mine) { if (ev.win) { sfx.bigWin(); this.player.playEmote('cheer'); } else { sfx.lose(); this.ui.toast(`${ev.name}: „Vielleicht nächstes Mal.“ – kostet dich nichts`, 'info'); } }
    } else if (ev.phase === 'leave') this.ui.feed(`🎩 ${esc(ev.name)} verlässt das Casino`);
  }

  // ───────────────────────── Geheimnisse ─────────────────────────
  findSecret(id) {
    const s = this.save;
    s.secrets ||= [];
    if (s.secrets.includes(id) || !SECRETS[id]) return false;
    s.secrets.push(id);
    const def = SECRETS[id];
    Save.addDildos(def.reward);
    sfx.jackpot?.();
    this.world.particles?.confetti(this.player.pos.clone().setY(2.2), 90, 2);
    this.ui.popup('item', `GEHEIMNIS GEFUNDEN +${def.reward} 🍆`, `${def.name} (${s.secrets.length}/${Object.keys(SECRETS).length})`);
    if (s.secrets.length >= Object.keys(SECRETS).length) this.achieve('secret_hunter');
    this.ui.refreshHud();
    this.checkUnlocks();
    Save.save();
    return true;
  }
  hasSecret(id) { return hasSecret(id); }
  meetGoldfinger() {
    this.ui.toast('Mr. Goldfinger: „Psst… Glück ist eine Frage des Stils.“', 'info', 4000);
    this.findSecret('rare_npc');
  }

  // Besuchte Stockwerke (CASINO TOURIST, TOP FLOOR)
  visitFloor(n) {
    const st = this.save.stats;
    st.floorsVisited ||= [];
    if (!st.floorsVisited.includes(n)) st.floorsVisited.push(n);
    if (st.floorsVisited.length >= 5) this.achieve('tourist');
    if (n === 15) this.achieve('top_floor');
    Save.save();
  }

  // Geldregen (Emote „Geld werfen“) – reine Optik
  moneyRain(pos) {
    const ps = this.world.particles;
    if (!ps) return;
    for (let i = 0; i < 26; i++) setTimeout(() => ps.emit({ pos: pos.clone().add(new THREE.Vector3(0, 1.5, 0)), vel: [(Math.random() - 0.5) * 2.2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2.2], life: 2.2, size: 0.08, color: i % 3 ? '#4caf50' : '#9be89b', gravity: 2.2, type: 'confetti', spin: (Math.random() - 0.5) * 8 }), i * 60);
  }

  // Glitzern um Spieler mit Glücks-Kosmetik bei Gewinnen (für alle sichtbar)
  luckySparkle(pid) {
    const look = pid === this.me ? this.save.appearance : this.state?.players.find(p => p.id === pid)?.appearance;
    const lucky = wornLucky(look);
    if (!lucky.length) return;
    const root = pid === this.me ? this.player.pos : this.avatars.get(pid)?.root.position;
    if (!root || !this.world.particles) return;
    const col = lucky[0].sparkle;
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      this.world.particles.emit({ pos: root.clone().add(new THREE.Vector3(Math.cos(a) * 0.45, 1.4 + Math.random() * 0.6, Math.sin(a) * 0.45)), vel: [Math.cos(a) * 0.3, 0.6 + Math.random() * 0.4, Math.sin(a) * 0.3], life: 1.3, size: 0.06, grow: 0, opacity: 1, color: col, gravity: 0, additive: true });
    }
  }

  bumpStat(k, v) { this.save.stats[k] = (this.save.stats[k] || 0) + v; if (k === 'itemsUsed' && this.save.stats.itemsUsed >= 5) this.achieve('item5'); Save.save(); }

  // ───────────────────────── MAKKA & Cocktail ─────────────────────────
  // MAKKA-Anzahl, Verbrauch und MAKKA-LUCK verwaltet der Server; der Client fragt nur an.
  get makkaCount() { return this.mePlayer?.makka ?? this.save.makka ?? 0; }

  buyMakka() {
    if (this.save.dildos < Save.MAKKA_PRICE) { sfx.error(); this.ui.toast('Du brauchst 1 🍆 für einen MAKKA', 'error'); return false; }
    this.send({ t: 'makka.buy' });
    return true;
  }

  drinkMakka() {
    const p = this.player;
    if (p.drinkT > 0 || this.ui.modalOpen) return;
    if (!(this.makkaCount > 0)) { sfx.error(); this.ui.toast('Kein MAKKA im Inventar – kauf einen an Kemals Bar in der Shishabar', 'warn'); return; }
    this.send({ t: 'drink', phase: 'drink' });
  }

  // Gratis-MAKKA an der Casino-Bar (Prompt 12) – nur Show, kein Glücks-Effekt
  barCooldown() { return Math.max(0, Math.ceil(((this.barUntil || 0) - performance.now()) / 1000)); }
  barMakka() {
    if (this.player.drinkT > 0 || this.ui.modalOpen) return;
    if (this.barCooldown() > 0) { sfx.denied(); this.ui.toast(`Der Barkeeper mixt noch… (${this.barCooldown()}s)`, 'info', 1500); return; }
    this.barUntil = performance.now() + 12000;
    sfx.register?.();
    this.send({ t: 'drink', phase: 'bar' });
  }

  drinkCocktail() {
    const p = this.player;
    if (p.drinkT > 0 || this.ui.modalOpen || this.save.appearance.accessory !== 'cocktail') return;
    this.send({ t: 'drink', phase: 'cocktail' });
  }

  // Bestätigung vom Server: eigene Trink-Animation, Sound und Schwindel starten
  onDrink(ev) {
    const p = this.player;
    if (ev.phase === 'buy') {
      Save.buyMakka();
      sfx.register();
      setTimeout(() => sfx.bottle(), 350);
      this.ui.toast(`MAKKA gekauft (−1 🍆) · MAKKA ×${ev.count} im Inventar · T bzw. 🍾 zum Trinken`, 'good', 4000);
      this.ui.refreshHud();
      return;
    }
    if (ev.phase === 'bar') {
      p.startDrink(2.0, 'makka');
      p.emoteT = 0;
      sfx.open?.();
      if (this.world.mode === 'first') { this.hands.holdItem(makkaBottle(1)); this.hands.itemT = 2.0; }
      [0.6, 1.05, 1.5].forEach(d => setTimeout(() => sfx.gulp(), d * 1000));
      setTimeout(() => this.ui.toast(`🍾 MAKKA ${ev.flavor} – Prost! (gratis, ohne Glücks-Effekt)`, 'good', 2600), 2000);
      this.save.stats.barMakkas = (this.save.stats.barMakkas || 0) + 1;
      return;
    }
    const makka = ev.phase === 'drink';
    const dur = makka ? 2.4 : 1.6;
    p.startDrink(dur, makka ? 'makka' : 'cocktail');
    p.emoteT = 0;
    if (makka) { sfx.open(); this.save.stats.makkas = (this.save.stats.makkas || 0) + 1; Save.save(); }
    if (this.world.mode === 'first') { this.hands.holdItem(makka ? makkaBottle(1) : cocktailModel()); this.hands.itemT = dur; }
    (makka ? [0.7, 1.15, 1.6, 2.0] : [0.6, 1.0]).forEach(d => setTimeout(() => (makka ? sfx.gulp() : sfx.sip()), d * 1000));
    clearTimeout(this.drinkTimer);
    this.drinkTimer = setTimeout(() => {
      if (makka || ev.n === 3) {
        p.startDizzy(10, 1);
        sfx.dizzy();
        setDizzyAudio(true);
        this.ui.toast(makka ? '😵‍💫 Uff… alles dreht sich!' : '🍹 Dritter Cocktail – jetzt dreht sich alles!', 'info', 2500);
        clearTimeout(this.dizzyTimer);
        this.dizzyTimer = setTimeout(() => setDizzyAudio(false), 8800);
      } else if (ev.n === 2) {
        p.startDizzy(3, 0.25); // nur ein leichtes Schwanken
        this.ui.toast('🍹 Zweiter Cocktail … noch einer und es dreht sich.', 'info', 2200);
      } else this.ui.toast('🍹 Prost!', 'info', 1500);
    }, dur * 1000);
  }

  // ───────────────────────── Shisha ─────────────────────────
  // ───────────────────────── Sitzen in der Shishabar ─────────────────────────
  seatFree(i) { return !this.state?.players.some(p => p.id !== this.me && p.lseat === i); }
  takeSeat(i) {
    if (this.player.lounge || this.seatPending) return;
    this.seatPending = { i, at: performance.now() };
    // Wird der Platz nicht bestätigt (jemand war schneller), passiert einfach nichts
    setTimeout(() => { if (this.seatPending?.i === i) this.seatPending = null; }, 1500);
    this.send({ t: 'move', ...this.player.pose() }); // aktuelle Position zuerst (Server prüft die Entfernung)
    this.send({ t: 'seat.take', i });
  }
  standUp() {
    if (!this.player.lounge) return;
    this.player.standLounge();
    this.send({ t: 'seat.leave' });
  }

  smokeShisha(i) {
    if (this.player.smokeT > 0 || this.player.drinkT > 0) return;
    this.send({ t: 'smoke', i });
  }

  onSmoke(ev, mine) {
    const w = this.world;
    if (!w.smokeAt) return;
    const sh = w.shishas?.[ev.i];
    const char = mine ? this.selfChar : this.avatars.get(ev.pid);
    if (!sh || !char) return;
    if (mine) {
      const p = this.player;
      p.smokeEnd = performance.now() + 3400;
      // Im Sitzen bleibt der Spieler sitzen (nur Mundstück zum Mund), im Stehen dreht er sich zur Shisha
      if (!p.lounge) { p.yaw = Math.atan2(sh.position.x - p.pos.x, sh.position.z - p.pos.z); p.playEmote('smoke', 3.4); }
    } else if (char.anim !== 'sit') { char.setAnim('smoke'); char.emoteUntil = performance.now() + 3400; } else char.setFx('s');
    shishaDraw(ev.i, 1.7);
    w.smokeAt(char, ev.i, () => shishaExhale(ev.i));
  }

  avatarVolume(pid) {
    const a = this.avatars.get(pid);
    if (!a) return 0;
    return Math.max(0, Math.min(1, 1.2 - this.player.pos.distanceTo(a.root.position) / 10));
  }

  // Schwebendes Item-Symbol über einem Mitspieler
  avatarIcon(pid, icon) {
    const a = this.avatars.get(pid);
    if (!a) return;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.setScalar(0.5);
    sp.position.y = 2.1;
    a.root.add(sp);
    const t0 = performance.now();
    const tick = () => {
      const k = (performance.now() - t0) / 3000;
      if (k >= 1) { a.root.remove(sp); tex.dispose(); sp.material.dispose(); return; }
      sp.position.y = 2.1 + k * 0.5;
      sp.material.opacity = 1 - k * k;
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ───────────────────────── Mafia ─────────────────────────
  mafiaSequence(ev) {
    this.exitBallCam();
    this.ui.closeTablePanel();
    this.player.seated = null;
    this.input.exitLock();
    this.mafiaLock = true;
    // 1. Musik stoppt sofort
    setMusic('none');
    setAmbience(null);
    setDuck(false);
    clearInterval(this.heartbeat); this.heartbeat = null;
    this.highRiskTables.clear();
    this.bumpStat('floorsFailed', 1);
    this.bumpStat('mafiaVisits', 1);
    this.achieve('mafia');
    this.ui.bigText('BANKROTT!', 'Die Mafia will ihr Geld…', 'risk', 3000);
    const w = this.world;
    if (!w.mafiaStage) return;
    const players = this.state?.players || [];
    const stage = w.mafiaStage(Math.max(1, players.length));
    // 2. Rotes Licht
    setTimeout(() => { w.mafiaLights(); sfx.heartbeat(); }, 500);
    // 3. Kinokamera: fester Blick auf die Bühne vor dem Aufzug, alle Spieler stehen dort, Steuerung gesperrt
    setTimeout(() => {
      const keep = new Set([this.selfChar?.root, ...[...this.avatars.values()].map(a => a.root), w.elevator, this.engine.camera].filter(Boolean));
      players.forEach((p, i) => {
        const pos = stage.players[i];
        if (p.id === this.me) { this.player.pos.copy(pos); this.player.yaw = 0; this.player.jump.reset(); this.player.emoteT = 0; }
        const a = this.avatars.get(p.id);
        if (a) { a.target = { ...a.target, p: [pos.x, 0, pos.z], r: 0 }; a.root.position.copy(pos); a.root.rotation.y = 0; a.setAnim('idle'); a.emoteUntil = performance.now() + 12000; }
      });
      w.clearStage(stage, keep);
      this.cinematic = { pos: stage.cam.pos.clone(), look: stage.cam.look.clone() };
      this.player.camPos.copy(stage.cam.pos);
      this.player.camLook.copy(stage.cam.look);
      const t0 = performance.now();
      let lastCheck = 0;
      this.mafiaCam = () => {
        if (!this.cinematic) return;
        // Langsame Kamerafahrt auf die Szene zu
        const k = Math.min(1, (performance.now() - t0) / 5500);
        this.cinematic.pos.lerpVectors(stage.cam.pos, stage.camEnd, k * k * (3 - 2 * k));
        // Regelmässig prüfen, dass nichts Spieler oder Mafia verdeckt
        if (performance.now() - lastCheck > 150) {
          lastCheck = performance.now();
          const targets = [];
          for (const p of stage.players) targets.push(p.clone().setY(0.5), p.clone().setY(1.6));
          for (const m of w.mafia || []) { keep.add(m.root); targets.push(m.root.position.clone().setY(0.5), m.root.position.clone().setY(1.6)); }
          w.hideOccluders(this.engine.camera.position.clone(), targets, keep);
        }
      };
    }, 1000);
    // 4. Die Mafia kommt aus dem Aufzug
    setTimeout(() => { setMusic('tension'); sfx.doors(); w.startMafia(stage); }, 1400);
    setTimeout(() => {
      this.player.playEmote('sad', 6);
      for (const a of this.avatars.values()) { a.setAnim('sad'); a.emoteUntil = performance.now() + 9000; }
    }, 4300);
    // 5. Cartoon-Explosion mit Rauch, Blitz und Wackeln
    setTimeout(() => {
      sfx.explosion();
      this.engine.shake = 2.5;
      w.explode?.(stage.center.clone());
      this.ui.explosion();
    }, 6200);
    // 6. LEVEL FAILED – danach schickt der Server alle zurück in die Shishabar
    setTimeout(() => this.ui.levelFailed(ev.keep), 7600);
  }

  // ───────────────────────── Finale ─────────────────────────
  finalTake(ev) {
    const w = this.world;
    setMusic('celebrate');
    sfx.cheer();
    sfx.jackpot();
    w.staff?.setAnim('cheer');
    this.player.playEmote('cheer', 9);
    this.cinematic = w.cinematic;
    for (let i = 0; i < 4; i++) setTimeout(() => w.particles.confetti(w.tableTop.clone().add(new THREE.Vector3(0, 2, 1)), 150, 6), i * 900);
    this.ui.finalScreen('FINAL WINNINGS', fmtMoney(ev.amount), 'Erfolgreicher Run gespeichert!', 'win');
    const s = this.save;
    s.stats.takes++;
    s.history.unshift({ type: 'take', amount: ev.amount, date: ev.date || Date.now(), floors: s.campaign.completed.length });
    s.history = s.history.slice(0, 30);
    Save.save();
  }

  finalCoin(ev) {
    const w = this.world;
    this.cinematic = w.cinematic;
    setMusic('none');
    setDuck(true);
    this.bumpStat('doubleAttempts', 1);
    this.ui.bigText('DOUBLE OR LOSS', `${fmtMoney(ev.amount)} → ${fmtMoney(ev.amount * 2)} oder $0`, 'risk', 2500);
    if (!this.heartbeat) this.heartbeat = setInterval(() => sfx.heartbeat(), 800);
    w.flipCoin(ev.result, () => { sfx.drumroll(1.2); });
  }

  finalDoubleResult(ev) {
    const w = this.world;
    clearInterval(this.heartbeat); this.heartbeat = null;
    setDuck(false);
    const s = this.save;
    w.staffReact?.(ev.result);
    if (ev.result === 'green') {
      setMusic('celebrate');
      sfx.jackpot(); sfx.cheer();
      for (let i = 0; i < 6; i++) setTimeout(() => w.particles.confetti(w.tableTop.clone().add(new THREE.Vector3(0, 2.5, 1)), 160, 7), i * 700);
      this.player.playEmote('cheer', 9);
      for (const a of this.avatars.values()) { a.setAnim('cheer'); a.emoteUntil = performance.now() + 9000; }
      this.ui.finalScreen('DOUBLE SUCCESSFUL', fmtMoney(ev.amount), 'AYRI JACKPOT!', 'jackpot');
      s.stats.doubleWins++;
      this.achieve('double_win');
      s.history.unshift({ type: 'double-win', amount: ev.amount, date: Date.now() });
    } else {
      sfx.aww(); sfx.lose();
      this.player.playEmote('sad', 9);
      for (const a of this.avatars.values()) { a.setAnim('sad'); a.emoteUntil = performance.now() + 9000; }
      this.ui.finalScreen('$0', 'YOU SHOULD HAVE TAKEN THE MONEY.', `Verloren: ${fmtMoney(ev.before)}`, 'lose');
      s.stats.doubleLosses++;
      this.achieve('double_loss');
      s.history.unshift({ type: 'double-loss', amount: ev.before, date: Date.now() });
    }
    s.history = s.history.slice(0, 30);
    Save.save();
  }

  // ───────────────────────── Eingabe ─────────────────────────
  onKey(e) {
    if (e.target?.tagName === 'INPUT' || !this.world) return;
    if (this.ui.modalOpen) { if (e.code === 'Escape') this.ui.closeModal(); return; }
    if (this.player.seated) {
      if (e.code === 'Escape' || e.code === 'KeyQ') { this.leaveTable(); e.preventDefault(); return; }
      if (this.player.seated.onKey?.(e.code)) { e.preventDefault(); return; }
      if (this.player.seated.pad?.onKey(e.code)) { e.preventDefault(); return; }
      return;
    }
    if (!this.state) return;
    if (this.spectating) { if (['Escape', 'KeyE', 'KeyQ', 'Space'].includes(e.code)) { this.stopSpectate(); e.preventDefault(); } return; }
    // Geheimcode: A-Y-R-I hintereinander tippen
    if (/^Key[A-Z]$/.test(e.code)) { this.typed = ((this.typed || '') + e.code.slice(3)).slice(-4); if (this.typed === 'AYRI') this.findSecret('code_ayri'); }
    if (this.mafiaLock) return;
    if (e.code === 'KeyC') { this.toggleBallCam(); return; }
    if (this.player.lounge) {
      // Sitzend: E = Shisha (falls an der Sitzgruppe), sonst Aufstehen; LEERTASTE = Aufstehen (im Spieler-Update)
      if (e.code === 'KeyE' && this.player.lounge.phase === 'down') { const sh = this.player.lounge.seat.shisha; if (sh >= 0) this.smokeShisha(sh); else this.standUp(); }
      if (e.code === 'KeyT') this.drinkMakka();
      if (e.code === 'KeyG') this.drinkCocktail();
      if (e.code === 'Tab') { e.preventDefault(); this.ui.toggleScoreboard(true); }
      return;
    }
    if (e.code === 'KeyE' && this.world.npcCtl?.rareNear(this.player.pos)) { this.meetGoldfinger(); return; }
    if (e.code === 'KeyE' && this.hrNear()) { this.challengeHr(); return; }
    if (e.code === 'KeyE') { const it = this.world.nearestInteract(this.player.pos); if (it) { if (!it.table?.walkUp) sfx.click(); it.action(); } }
    if (e.code === 'KeyR' || e.code === 'KeyF') { const v = this.slotNear(); if (v) this.slotBet(v.def.id, e.code === 'KeyR' ? 1 : -1); }
    const emotes = { Digit1: 'cheer', Digit2: 'dance', Digit3: 'sad', Digit4: 'facepalm', Digit5: 'point', Digit6: EXTRA_EMOTES[0][0], Digit7: EXTRA_EMOTES[1][0], Digit8: EXTRA_EMOTES[2][0] };
    if (emotes[e.code]) this.emote(emotes[e.code]);
    if (e.code === 'Tab') { e.preventDefault(); this.ui.toggleScoreboard(true); }
    if (e.code === 'KeyI' && this.world.kind === 'floor') this.ui.focusItems();
    if (e.code === 'KeyT') this.drinkMakka();
    if (e.code === 'KeyG') this.drinkCocktail();
  }

  emote(name) {
    if (!this.state || this.player.seated || this.player.lounge) return;
    if (!unlockedEmotes().some(e => e[0] === name)) return;
    this.player.playEmote(name);
    if (name === 'money') this.moneyRain(this.player.pos);
    this.send({ t: 'emote', e: name });
    if (this.world.mode === 'first' && name === 'cheer') this.hands.play('cheer');
  }

  onCanvasClick(e) {
    if (!this.state || this.ui.modalOpen) return;
    if (this.player.seated) {
      this.raycaster.setFromCamera(this.ndc(e), this.engine.camera);
      if (e.button === 0 && this.player.seated.pad?.pick(this.raycaster)) return;
      this.player.seated.pick(this.raycaster, e.button);
      return;
    }
    if (this.mafiaLock) return;
    if (e.button === 0 && this.world.kind === 'floor') {
      const b = this.pickSlotButton(this.aimNdc());
      if (b) { b.action(); return; }
    }
    if (this.world.mode === 'first' && e.button === 0) this.input.requestLock();
  }

  ndc(e) {
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  // ───────────────────────── Hauptschleife ─────────────────────────
  tick(dt, t) {
    if (!this.world) return;
    this.input.wantLock = this.world.mode === 'first' && !this.player.seated && !this.touch.active;
    this.input.enabled = !this.ui.modalOpen && !this.touch.portrait;
    this.world.update(dt, t);
    this.mafiaCam?.();
    this.updateBallCam(dt);
    if (this.state) this.player.update(dt, this.input, this.world, this.engine.camera);
    else this.menuCamera(t);
    this.applyShake(dt);
    // Eigener Charakter
    if (this.selfChar) {
      this.selfChar.root.position.copy(this.player.pos);
      this.selfChar.root.rotation.y = this.player.yaw;
      this.selfChar.setAnim(this.player.anim);
      this.selfChar.setFx(this.player.fx);
      this.selfChar.update(dt);
      this.selfChar.root.visible = this.world.mode === 'third' || !!this.cinematic;
    }
    for (const a of this.avatars.values()) a.update(dt);
    this.world.npcCtl?.update(dt, this.engine.camera);
    this.updateFlames(dt);
    // Spielzeit (alle 10 s gespeichert)
    if (this.state) { this.playAcc = (this.playAcc || 0) + dt; if (this.playAcc >= 10) { this.save.stats.playtime = (this.save.stats.playtime || 0) + this.playAcc; this.playAcc = 0; Save.save(); } }
    this.hands.group.visible = this.world.mode === 'first' && !this.cinematic && !this.ballCam;
    this.hands.update(dt, this.player.moving, !!this.player.seated);
    // Interaktionshinweis
    this.hoverButton = null;
    const rouletteSpin = this.state && !this.cinematic && this.spinningRoulette();
    const touch = this.touch.active;
    const camKey = touch ? '🎥' : 'C';
    if (this.ballCam) this.ui.setHint(`${camKey} – Kamera verlassen`);
    else if (this.spectating) this.ui.setHint(touch ? '' : `👀 Zuschauen bei ${this.playerName(this.spectating.pid)} · [E] / [ESC] beenden`);
    else if (!this.player.seated && !this.player.lounge && this.world.npcCtl?.rareNear(this.player.pos)) this.ui.setHint(touch ? '' : '[E] ???');
    else if (!this.player.seated && this.hrNear()) this.ui.setHint(touch ? '' : this.state.events.hr.duel ? `🎲 Duell läuft…` : `[E] ${this.state.events.hr.name} herausfordern (Würfel-Duell, kostenlos)`);
    else if (this.player.lounge) this.ui.setHint(touch ? '' : this.player.lounge.seat.shisha >= 0 ? '[E] Shisha rauchen · [LEERTASTE] Aufstehen' : '[E] / [LEERTASTE] Aufstehen');
    else if (this.state && !this.player.seated && !this.cinematic) {
      const it = this.world.nearestInteract(this.player.pos);
      if (this.world.kind === 'floor' && !touch) this.hoverButton = this.pickSlotButton(this.aimNdc());
      const label = it && (typeof it.label === 'function' ? it.label() : it.label);
      if (this.hoverButton) this.ui.setHint(`Klick: ${this.hoverButton.label()}`);
      else if (rouletteSpin && (!it || this.distanceTo(rouletteSpin.group.position) < 6)) this.ui.setHint(`${camKey} – Kugelkamera`);
      else if (touch) this.ui.setHint(it?.table?.walkUp ? '' : label || '');
      else this.ui.setHint(it ? `[E] ${label}` : this.world.mode === 'first' && !this.input.locked && !this.ui.modalOpen ? 'Klicken zum Umschauen' : '');
    } else if (this.player.seated) {
      const v = this.player.seated;
      let lbl = null;
      let padLbl = null;
      if (!touch) {
        this.raycaster.setFromCamera(new THREE.Vector2(...this.mouseNdc()), this.engine.camera);
        padLbl = v.pad?.hover(this.raycaster);
        if (!padLbl) lbl = v.hover(this.raycaster);
      }
      this.ui.setHint(padLbl ? `Klick: ${padLbl}` : lbl ? (v.hoverLabel ? v.hoverLabel(lbl) : `Klick: Chip auf ${lbl}`) : rouletteSpin === v ? `${camKey} – Kugelkamera` : '');
    } else this.ui.setHint('');
    // Position senden (15 Hz)
    this.moveTimer -= dt;
    if (this.state && this.moveTimer <= 0) {
      this.moveTimer = 1 / 15;
      const pose = this.player.pose();
      const key = JSON.stringify(pose);
      if (key !== this.lastPoseKey) { this.lastPoseKey = key; this.send({ t: 'move', ...pose }); }
    }
    const dz = this.player.dizzyK;
    const filter = dz > 0.01 ? `blur(${(dz * 0.9).toFixed(2)}px) saturate(${(1 + dz * 0.35).toFixed(2)}) hue-rotate(${(Math.sin(t * 0.6) * 14 * dz).toFixed(1)}deg)` : '';
    if (this.engine.renderer.domElement.style.filter !== filter) this.engine.renderer.domElement.style.filter = filter;
    updateListener(this.engine.camera);
    this.touch.update();
    this.updatePerf();
    this.world.updateLod?.(this.engine.camera, this.engine.q.lod, dt);
    this.ui.tick(dt);
    this.input.endFrame();
  }

  // Kurzes Kamerawackeln bei grossen eigenen Gewinnen
  shake(sec = 0.3) { this.shakeT = Math.max(this.shakeT || 0, sec); this.shakeMax = Math.max(sec, 0.01); }
  applyShake(dt) {
    if (!(this.shakeT > 0)) return;
    this.shakeT -= dt;
    const k = Math.max(0, this.shakeT / this.shakeMax) * 0.05;
    this.engine.camera.position.x += (Math.random() - 0.5) * k;
    this.engine.camera.position.y += (Math.random() - 0.5) * k;
  }

  mouseNdc() {
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const x = this.input.mouseX ?? r.width / 2, y = this.input.mouseY ?? r.height / 2;
    return [((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1];
  }

  menuCamera(t) {
    const cam = this.engine.camera;
    cam.position.set(Math.sin(t * 0.08) * 6, 2.4, 4 + Math.cos(t * 0.08) * 3);
    cam.lookAt(0, 1.4, -4);
    if (this.selfChar) { this.selfChar.root.position.set(0, 0, 0.5); this.selfChar.root.rotation.y = Math.sin(t * 0.5) * 0.4 + 0.3; this.selfChar.root.visible = true; this.selfChar.setAnim('idle'); }
  }

  applySettings() {
    const s = this.save.settings;
    setVolumes(s);
    this.engine.applyQuality(s);
    Save.save();
  }
}


function cocktailModel() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.065, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#ff8fcf', transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  cone.rotation.x = Math.PI; cone.position.y = 0.06;
  g.add(cone, new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07), new THREE.MeshStandardMaterial({ color: '#ddd' })));
  return g;
}

function itemModel(item) {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.9, roughness: 0.25, emissive: '#5a4010', emissiveIntensity: 0.4 });
  switch (item) {
    case 'pokal': g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.025, 0.1, 16), gold)); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.03, 12), gold).translateY(-0.06)); break;
    case 'goldcoin': g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 24), gold).rotateX(Math.PI / 2)); break;
    case 'devildice': g.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: '#b3122e', emissive: '#600', emissiveIntensity: 0.6 }))); break;
    case 'crown': { g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), gold)); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.add(new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.05, 6), gold).translateX(Math.cos(a) * 0.055).translateZ(Math.sin(a) * 0.055).translateY(0.04)); } break; }
    case 'luckyhat': g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 20), new THREE.MeshStandardMaterial({ color: '#111' }))); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#111' })).translateY(0.045)); break;
    case 'joker': g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.003), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#a0f', emissiveIntensity: 0.3 }))); break;
    case 'insurance': g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.003), new THREE.MeshStandardMaterial({ color: '#f4f0e0' }))); break;
    case 'shisha': g.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshStandardMaterial({ color: '#7cf', transparent: true, opacity: 0.7 }))); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.1), gold).translateY(0.06)); break;
    default: g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.03), new THREE.MeshStandardMaterial({ color: '#3a2a1a' })));
  }
  return g;
}

export { FLOORS };
