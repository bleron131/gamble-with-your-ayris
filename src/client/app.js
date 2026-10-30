// Hauptanwendung: verbindet Netzwerk, Spielzustand, 3D-Welten, Spieler und UI.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { LocalPlayer } from './player.js';
import { TouchControls } from './touch.js';
import { Character, FPHands, makkaBottle } from './character.js';
import { LobbyWorld } from './world/lobby.js';
import { CasinoWorld } from './world/casino.js';
import { FinalWorld } from './world/final.js';
import { WSTransport, LocalTransport } from './net.js';
import * as Save from './save.js';
import { initAudio, sfx, setMusic, setAmbience, setDuck, setVolumes, setDizzyAudio, setShishaSounds, clearShishaSounds, updateListener } from './audio.js';
import { bindSfx } from './tables/common.js';
import { UI } from './ui/ui.js';
import { esc } from './ui/dom.js';
import { floorDef, fmtMoney, ITEMS, GAME_NAMES, ACHIEVEMENTS, FLOORS } from '../shared/config.js';

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
    window.addEventListener('keydown', e => this.onKey(e));
    window.app = this;
  }

  start() {
    this.loadWorld('lobby');
    this.engine.start();
    this.ui.showMenu();
  }

  get pot() { return this.state?.pot ?? 0; }
  playerName(id) { return this.state?.players.find(p => p.id === id)?.name || '?'; }
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
    this.engine.applyQuality?.(this.save.settings);
  }

  // Tippen auf den Bildschirm: wie ein Mausklick an dieser Stelle (Tischfelder, Automatenknöpfe); langes Drücken = Rechtsklick
  onTap(x, y, kind) {
    if (!this.state || this.ui.modalOpen || this.mafiaLock || this.touch.portrait) return;
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    if (this.player.seated) {
      this.raycaster.setFromCamera(ndc, this.engine.camera);
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
    if (this.player.hasBottle && !(this.player.drinkT > 0)) out.push({ label: '🍾 TRINKEN', cls: 'drink', run: () => this.drinkMakka() });
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
      case 'error':
        this.ui.toast(m.msg, 'error');
        sfx.error();
        if (m.fatal) this.ui.menuError(m.msg);
        break;
      case 'reward': this.onReward(m); break;
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
    s.campaign = {
      ...s.campaign, ...c,
      unlocked: Math.max(s.campaign.unlocked || 1, c.unlocked),
      completed: [...new Set([...(s.campaign.completed || []), ...c.completed])].sort((a, b) => a - b),
      highestPot: Math.max(s.campaign.highestPot || 0, c.highestPot),
      bestWinnings: Math.max(s.campaign.bestWinnings || 0, c.bestWinnings || 0),
      bestDouble: Math.max(s.campaign.bestDouble || 0, c.bestDouble || 0),
      gameComplete: s.campaign.gameComplete || c.gameComplete,
    };
    if (st.hostId === this.me) s.run = { pot: st.pot, finalUnlocked: st.run.finalUnlocked, startedAt: st.run.startedAt };
    if (st.pot > s.stats.highestPot) s.stats.highestPot = st.pot;
    if (st.pot >= 1e6) this.achieve('millionaire');
    if (st.pot >= 1e8) this.achieve('hundred_m');
    Save.save();
    this.syncAvatars();
    // Tische
    if (this.world.kind === 'floor' && st.session) {
      for (const [id, ts] of Object.entries(st.session.tables)) this.world.views[id]?.setState(ts);
      const me = this.mePlayer;
      if (me?.seat && !this.player.seated) this.enterSeat(me.seat);
      if (!me?.seat && this.player.seated) this.exitSeat();
    }
    this.world.onState?.();
    this.ui.refreshHud();
    this.ui.renderVote(st.vote);
    void prevScene;
  }

  // ───────────────────────── Welten ─────────────────────────
  loadWorld(scene, floor) {
    if (this.player.seated) this.exitSeat(true);
    const old = this.world;
    for (const a of this.avatars.values()) a.root.removeFromParent();
    this.world = scene === 'floor' ? new CasinoWorld(this, floor) : scene === 'final' ? new FinalWorld(this) : new LobbyWorld(this);
    this.engine.setScene(this.world.scene);
    this.world.scene.add(this.engine.camera);
    old?.dispose();
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
    if (scene === 'floor') { setMusic('casino', floorDef(floor).tier); setAmbience('casino'); }
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
    if (ts?.occupant && ts.occupant !== this.me) {
      // Zuschauen: zur Tischseite stellen
      this.ui.toast(`${this.playerName(ts.occupant)} spielt hier – du kannst zuschauen.`, 'info');
      return;
    }
    this.send({ t: 'table.sit', id });
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
      const f = floorDef(this.state.floor);
      const ok = await this.ui.confirm(`Ziel (${fmtMoney(f.target)}) noch nicht erreicht. Trotzdem mit ${fmtMoney(this.pot)} zur Shishabar zurück?`);
      if (!ok) return;
    }
    this.send({ t: 'vote.start', type: 'return' });
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
        const label = ev.scene === 'floor' ? `STOCK ${ev.floor}` : ev.scene === 'final' ? '???' : 'SHISHABAR';
        if (ev.scene === 'lobby' && ev.reason === 'return') this.ui.feed(`Zurück in der Shishabar mit ${fmtMoney(ev.pot)}`);
        this.ui.elevatorTransition(label, () => this.loadWorld(ev.scene, ev.floor), ev.scene === 'floor' ? floorDef(ev.floor) : null);
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
        sfx.bigWin();
        this.world.particles?.confetti(this.player.pos.clone().setY(2.5), 160, 6);
        this.ui.targetReached(ev);
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
        if (ev.phase === 'buy') this.ui.feed(`🍾 <b>${esc(ev.name)}</b> kauft einen MAKKA`);
        else { this.ui.feed(`🥴 <b>${esc(ev.name)}</b> trinkt MAKKA – alles dreht sich!`); if (!mine) { this.avatarIcon(ev.pid, '🥴'); sfx.gulp(); } }
        break;
      case 'emote': {
        const a = this.avatars.get(ev.pid);
        if (a) { a.setAnim(ev.e); a.emoteUntil = performance.now() + 2600; }
        break;
      }
      case 'join': if (!mine) { this.ui.toast(`${ev.name} ist der Gruppe beigetreten`, 'info'); sfx.ding(); } break;
      case 'leave': this.ui.toast(`${ev.name} hat die Gruppe verlassen`, 'warn'); break;
      case 'toast': this.ui.toast(ev.msg, 'info'); break;
      case 'newrun': if (ev.reason === 'manual') this.ui.toast(`Neuer Run gestartet: ${fmtMoney(ev.pot)}`, 'info'); break;
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
    if (view?.ownFeedback) {
      // Automaten zeigen Gewinnstufen selbst (Sound, Licht, Münzen, grosse Anzeige)
    } else if (ev.jackpot) {
      this.ui.bigText('JACKPOT', `${ev.name}: +${fmtMoney(ev.net)}`, 'jackpot', 4500);
      sfx.jackpot();
      const v = this.world.views?.[ev.tableId];
      if (v) this.world.particles.confetti(v.group.position.clone().setY(2.2), 200, 3);
    } else if (ev.bigWin) {
      this.ui.bigText('BIG WIN', `${ev.name}: +${fmtMoney(ev.net)}`, 'win', 3000);
      sfx.bigWin();
      this.selfChar && mine && this.hands.play('cheer');
    } else if (mine || near) {
      if (ev.net > 0) sfx.win(); else if (ev.net < 0 && mine) sfx.lose();
    }
    if (mine && (ev.stake > 0 || ev.payout > 0)) {
      const st = this.save.stats;
      st.rounds++;
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
    if (m.floor && !this.save.rewardedFloors.includes(m.floor)) this.save.rewardedFloors.push(m.floor);
    if (m.challenge && !this.save.challengeFloors.includes(m.challenge)) this.save.challengeFloors.push(m.challenge);
    Save.save();
    this.ui.reward(m.dildos, m.reason);
    this.ui.refreshHud();
  }

  achieve(id) {
    if (Save.unlockAchievement(id)) {
      const a = ACHIEVEMENTS[id];
      this.ui.reward(a.reward, `ACHIEVEMENT: ${a.name} – ${a.desc}`, true);
      this.ui.refreshHud();
    }
  }

  bumpStat(k, v) { this.save.stats[k] = (this.save.stats[k] || 0) + v; if (k === 'itemsUsed' && this.save.stats.itemsUsed >= 5) this.achieve('item5'); Save.save(); }

  // ───────────────────────── MAKKA ─────────────────────────
  buyMakka() {
    const p = this.player;
    if (p.hasBottle || p.drinkT > 0) { this.ui.toast('Du hast schon einen MAKKA in der Hand – erst austrinken (T)', 'warn'); return false; }
    if (!Save.buyMakka()) { sfx.error(); this.ui.toast('Du brauchst 1 🍆 für einen MAKKA', 'error'); return false; }
    sfx.register();
    setTimeout(() => sfx.bottle(), 350);
    p.hasBottle = true;
    this.send({ t: 'drink', phase: 'buy' });
    this.ui.toast('MAKKA gekauft (−1 🍆). Drücke T zum Trinken!', 'good', 4000);
    this.ui.refreshHud();
    return true;
  }

  drinkMakka() {
    const p = this.player;
    if (!p.hasBottle || p.drinkT > 0 || this.ui.modalOpen) return;
    p.startDrink(2.4);
    p.emoteT = 0;
    this.send({ t: 'drink', phase: 'drink' });
    sfx.open();
    if (this.world.mode === 'first') { this.hands.holdItem(makkaBottle(1)); this.hands.itemT = 2.4; }
    [0.7, 1.15, 1.6, 2.0].forEach(d => setTimeout(() => sfx.gulp(), d * 1000));
    clearTimeout(this.drinkTimer);
    this.drinkTimer = setTimeout(() => {
      p.hasBottle = false;
      p.startDizzy();
      sfx.dizzy();
      setDizzyAudio(true);
      this.ui.toast('😵‍💫 Uff… alles dreht sich!', 'info', 2500);
      clearTimeout(this.dizzyTimer);
      this.dizzyTimer = setTimeout(() => setDizzyAudio(false), 8800);
    }, 2400);
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
      return;
    }
    if (!this.state) return;
    if (this.mafiaLock) return;
    if (e.code === 'KeyC') { this.toggleBallCam(); return; }
    if (e.code === 'KeyE') { const it = this.world.nearestInteract(this.player.pos); if (it) { if (!it.table?.walkUp) sfx.click(); it.action(); } }
    if (e.code === 'KeyR' || e.code === 'KeyF') { const v = this.slotNear(); if (v) this.slotBet(v.def.id, e.code === 'KeyR' ? 1 : -1); }
    const emotes = { Digit1: 'cheer', Digit2: 'dance', Digit3: 'sad', Digit4: 'facepalm', Digit5: 'point' };
    if (emotes[e.code]) this.emote(emotes[e.code]);
    if (e.code === 'Tab') { e.preventDefault(); this.ui.toggleScoreboard(true); }
    if (e.code === 'KeyI' && this.world.kind === 'floor') this.ui.focusItems();
    if (e.code === 'KeyT') this.drinkMakka();
  }

  emote(name) {
    if (!this.state || this.player.seated) return;
    this.player.playEmote(name);
    this.send({ t: 'emote', e: name });
    if (this.world.mode === 'first' && name === 'cheer') this.hands.play('cheer');
  }

  onCanvasClick(e) {
    if (!this.state || this.ui.modalOpen) return;
    if (this.player.seated) {
      this.raycaster.setFromCamera(this.ndc(e), this.engine.camera);
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
    this.hands.group.visible = this.world.mode === 'first' && !this.cinematic && !this.ballCam;
    this.hands.update(dt, this.player.moving, !!this.player.seated);
    // Interaktionshinweis
    this.hoverButton = null;
    const rouletteSpin = this.state && !this.cinematic && this.spinningRoulette();
    const touch = this.touch.active;
    const camKey = touch ? '🎥' : 'C';
    if (this.ballCam) this.ui.setHint(`${camKey} – Kamera verlassen`);
    else if (this.state && !this.player.seated && !this.cinematic) {
      const it = this.world.nearestInteract(this.player.pos);
      if (this.world.kind === 'floor' && !touch) this.hoverButton = this.pickSlotButton(this.aimNdc());
      const label = it && (typeof it.label === 'function' ? it.label() : it.label);
      if (this.hoverButton) this.ui.setHint(`Klick: ${this.hoverButton.label()}`);
      else if (rouletteSpin && (!it || this.distanceTo(rouletteSpin.group.position) < 6)) this.ui.setHint(`${camKey} – Kugelkamera`);
      else if (touch) this.ui.setHint(it?.table?.walkUp ? '' : label || '');
      else this.ui.setHint(it ? `[E] ${label}` : this.world.mode === 'first' && !this.input.locked ? 'Klicken, um die Maus zu fangen · WASD laufen · LEERTASTE springen' : '');
    } else if (this.player.seated) {
      const v = this.player.seated;
      let lbl = null;
      if (!touch) { this.raycaster.setFromCamera(new THREE.Vector2(...this.mouseNdc()), this.engine.camera); lbl = v.hover(this.raycaster); }
      this.ui.setHint(lbl ? (v.hoverLabel ? v.hoverLabel(lbl) : `Klick: Chip auf ${lbl}`) : rouletteSpin === v ? `${camKey} – Kugelkamera` : '');
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
    this.ui.tick(dt);
    this.input.endFrame();
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
