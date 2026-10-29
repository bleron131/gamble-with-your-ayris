// Hauptanwendung: verbindet Netzwerk, Spielzustand, 3D-Welten, Spieler und UI.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { LocalPlayer } from './player.js';
import { Character, FPHands } from './character.js';
import { LobbyWorld } from './world/lobby.js';
import { CasinoWorld } from './world/casino.js';
import { FinalWorld } from './world/final.js';
import { WSTransport, LocalTransport } from './net.js';
import * as Save from './save.js';
import { initAudio, sfx, setMusic, setAmbience, setDuck, setVolumes } from './audio.js';
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
  async connect(mode, code) {
    initAudio(this.save.settings);
    const profile = Save.profile();
    const t = mode === 'solo' ? new LocalTransport() : new WSTransport();
    t.onMessage(m => this.onMessage(m));
    const first = mode === 'join' ? { t: 'join', code, profile } : { t: 'create', profile };
    await t.connect(first);
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
          if (a) { a.target = pose; if (!a.emoteUntil || a.emoteUntil < performance.now()) a.setAnim(pose.a); }
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
    this.world.views?.[ev.tableId]?.onEvent(ev);
    if (this.highRiskTables.has(ev.tableId)) {
      this.highRiskTables.delete(ev.tableId);
      if (!this.highRiskTables.size) { setDuck(false); clearInterval(this.heartbeat); this.heartbeat = null; }
    }
    if (ev.stake > 0 || ev.payout > 0) {
      const txt = ev.net > 0 ? `gewinnt <b class="win">${fmtMoney(ev.net)}</b>` : ev.net < 0 ? `verliert <b class="lose">${fmtMoney(-ev.net)}</b>` : 'Push';
      this.ui.feed(`<b>${esc(ev.name)}</b> ${GAME_NAMES[ev.game]}: ${txt} – ${esc(ev.detail || '')}${ev.effects?.length ? ' ' + esc(ev.effects.join(' ')) : ''}`);
    }
    const near = this.distanceTo(this.world.views?.[ev.tableId]?.group.position || this.player.pos) < 8;
    if (ev.jackpot) {
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
    this.ui.closeTablePanel();
    this.player.seated = null;
    this.input.exitLock();
    setMusic('tension');
    setAmbience(null);
    this.bumpStat('floorsFailed', 1);
    this.bumpStat('mafiaVisits', 1);
    this.achieve('mafia');
    this.ui.bigText('BANKROTT!', 'Die Mafia will ihr Geld…', 'risk', 3000);
    const w = this.world;
    const center = this.player.pos.clone();
    w.startMafia?.(center);
    sfx.doors();
    // Kamera seitlich erhöht: Spieler und anrückende Mafia im Bild
    setTimeout(() => {
      const door = (w.mafiaDoorPos || center.clone().add(new THREE.Vector3(0, 0, -6))).clone().setY(0);
      const dir = door.clone().sub(center).setY(0).normalize();
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      this.cinematic = {
        pos: center.clone().addScaledVector(dir, -2.2).addScaledVector(side, 2.4).add(new THREE.Vector3(0, 2.8, 0)),
        look: center.clone().addScaledVector(dir, 2.5).add(new THREE.Vector3(0, 0.9, 0)),
      };
    }, 900);
    setTimeout(() => {
      sfx.explosion();
      this.engine.shake = 2.5;
      w.explode?.(center.clone().add(new THREE.Vector3(0, 0, -1.5)));
      this.ui.explosion();
    }, 6200);
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
    if (e.code === 'KeyE') { const it = this.world.nearestInteract(this.player.pos); if (it) { sfx.click(); it.action(); } }
    const emotes = { Digit1: 'cheer', Digit2: 'dance', Digit3: 'sad', Digit4: 'facepalm', Digit5: 'point' };
    if (emotes[e.code]) {
      this.player.playEmote(emotes[e.code]);
      this.send({ t: 'emote', e: emotes[e.code] });
      if (this.world.mode === 'first' && emotes[e.code] === 'cheer') this.hands.play('cheer');
    }
    if (e.code === 'Tab') { e.preventDefault(); this.ui.toggleScoreboard(true); }
    if (e.code === 'KeyI' && this.world.kind === 'floor') this.ui.focusItems();
  }

  onCanvasClick(e) {
    if (!this.state || this.ui.modalOpen) return;
    if (this.player.seated) {
      this.raycaster.setFromCamera(this.ndc(e), this.engine.camera);
      this.player.seated.pick(this.raycaster, e.button);
      return;
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
    this.input.wantLock = this.world.mode === 'first' && !this.player.seated;
    this.input.enabled = !this.ui.modalOpen;
    this.world.update(dt, t);
    if (this.state) this.player.update(dt, this.input, this.world, this.engine.camera);
    else this.menuCamera(t);
    // Eigener Charakter
    if (this.selfChar) {
      this.selfChar.root.position.copy(this.player.pos);
      this.selfChar.root.rotation.y = this.player.yaw;
      this.selfChar.setAnim(this.player.anim);
      this.selfChar.update(dt);
      this.selfChar.root.visible = this.world.mode === 'third' || !!this.cinematic;
    }
    for (const a of this.avatars.values()) a.update(dt);
    this.hands.group.visible = this.world.mode === 'first' && !this.cinematic;
    this.hands.update(dt, this.player.moving, !!this.player.seated);
    // Interaktionshinweis
    if (this.state && !this.player.seated && !this.cinematic) {
      const it = this.world.nearestInteract(this.player.pos);
      this.ui.setHint(it ? `[E] ${typeof it.label === 'function' ? it.label() : it.label}` : this.world.mode === 'first' && !this.input.locked ? 'Klicken, um die Maus zu fangen · WASD laufen' : '');
    } else if (this.player.seated) {
      this.raycaster.setFromCamera(new THREE.Vector2(...this.mouseNdc()), this.engine.camera);
      const lbl = this.player.seated.hover(this.raycaster);
      this.ui.setHint(lbl ? `Klick: Chip auf ${lbl}` : '');
    } else this.ui.setHint('');
    // Position senden (15 Hz)
    this.moveTimer -= dt;
    if (this.state && this.moveTimer <= 0) {
      this.moveTimer = 1 / 15;
      const pose = this.player.pose();
      const key = JSON.stringify(pose);
      if (key !== this.lastPoseKey) { this.lastPoseKey = key; this.send({ t: 'move', ...pose }); }
    }
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
    this.engine.setQuality({ bloom: s.bloom, shadows: s.shadows });
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
