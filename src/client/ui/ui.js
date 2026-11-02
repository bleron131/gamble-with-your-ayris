// UI: Hauptmenü, HUD, Feed, Overlays, Abstimmungen und Tischpanel.
import { serverHost } from '../server.js';
import { enterFullscreen, fullscreenSupported, isFullscreen, isStandalone } from '../fullscreen.js';
import { h, clear, esc } from './dom.js';
import { fmtMoney, fmtShort, floorDef, ITEMS, RETRY_GAMES_HAT, FLOORS } from '../../shared/config.js';
import { sfx, initAudio } from '../audio.js';
import * as Save from '../save.js';
import { CHALLENGE_BY_ID } from '../../shared/challenges.js';
import { unlockedEmotes } from '../progress.js';
import { openElevator, openShop, openEditor, openStats, openSettings, renderScoreboard, openBar } from './modals.js';

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.modalOpen = false;
    this.feedItems = [];
    this.build();
  }

  build() {
    const r = this.root;
    this.hud = h('div.hud.hidden');
    this.potEl = h('div.potval');
    this.targetEl = h('div.target');
    this.levelEl = h('div.level');
    this.progress = h('div.progress', h('div.bar'));
    this.chEl = h('div.chlist');
    this.feedEl = h('div.feed');
    // Pot-Anzeige und Feed untereinander: der Feed rutscht automatisch nach unten, wenn die Challenge-Liste sichtbar ist
    this.hud.append(h('div.topleft', h('div.panel.potpanel', h('div.lbl', 'TEAM POT'), this.potEl, this.targetEl, this.progress, this.levelEl, this.chEl), this.feedEl));
    this.dildoEl = h('div.dildos');
    this.groupEl = h('div.group');
    this.hud.append(h('div.topright', this.dildoEl, this.groupEl,
      h('div.btnrow',
        h('button.homebtn', { title: 'Zurück zur Startseite', 'aria-label': 'Zurück zur Startseite', onclick: () => this.app.goHome() }, h('span.hi', '🏠'), h('span.ht', 'STARTSEITE')),
        // Nur auf Touch-Geräten sichtbar: Ersatz für TAB (Gruppe) und die Emote-Tasten 1–5
        h('button.icon.touchonly', { title: 'Gruppe', onclick: () => this.toggleScoreboard(this.scoreEl.classList.contains('hidden')) }, '👥'),
        h('button.icon.touchonly', { title: 'Emotes', onclick: () => this.toggleEmotes() }, '😀'),
        h('button.icon', { title: 'Statistiken', onclick: () => this.openStats() }, '📊'),
        h('button.icon', { title: 'Einstellungen', onclick: () => this.openSettings() }, '⚙️'),
      )));
    this.itemBar = h('div.itembar');
    this.hud.append(this.itemBar);
    this.makkaEl = h('button.makka.hidden', { onclick: () => this.app.drinkMakka() });
    this.hud.append(this.makkaEl);
    this.luckEl = h('div.makkaluck.hidden');
    this.hud.append(this.luckEl);
    this.perfEl = h('pre.perfmon.hidden');
    r.append(this.perfEl);
    this.hintEl = h('div.hint');
    this.hud.append(this.hintEl);
    this.crosshair = h('div.crosshair');
    this.hud.append(this.crosshair);
    this.voteEl = h('div.vote.hidden');
    this.hud.append(this.voteEl);
    this.tableWrap = h('div.tablewrap.hidden');
    this.hud.append(this.tableWrap);
    this.helpEl = h('div.controlshelp.hidden');
    this.hud.append(this.helpEl);
    this.emoteBar = h('div.emotebar.hidden');
    this.hud.append(this.emoteBar);
    this.renderEmotes();
    this.scoreEl = h('div.scoreboard.hidden');
    this.hud.append(this.scoreEl);
    r.append(this.hud);
    this.overlay = h('div.overlay');
    r.append(this.overlay);
    this.toasts = h('div.toasts');
    r.append(this.toasts);
    this.popups = h('div.popups');
    r.append(this.popups);
    this.popupQueue = [];
    this.modal = h('div.modal.hidden');
    r.append(this.modal);
    this.menu = h('div.menu.hidden');
    r.append(this.menu);
    this.doors = h('div.doors.hidden', h('div.door.l'), h('div.door.r'), h('div.doorinfo'));
    r.append(this.doors);
    window.addEventListener('keyup', e => { if (e.code === 'Tab') this.toggleScoreboard(false); });
  }

  // ───────────────────────── Mobile-Start ─────────────────────────
  // Ein Tippen auf SPIEL STARTEN aktiviert Audio, Vollbild, Querformat und die Touch-Steuerung zugleich
  showMobileStart(onStart) {
    if (this.mstart || isStandalone() && isFullscreen() && this.mstartDone) return onStart?.();
    const hint = !fullscreenSupported() && !isStandalone()
      ? h('div.mhint', 'Für das beste Spielerlebnis im Vollbild spielen: im Browser „Teilen → Zum Home-Bildschirm“ wählen und das Spiel von dort starten.')
      : null;
    const btn = h('button.big.primary.mstartbtn', 'SPIEL STARTEN');
    this.mstart = h('div.mstart', h('div.logo', h('span.l1', 'GAMBLE'), h('span.l2', 'with your'), h('span.l3', 'AYRIS')), btn, hint);
    this.root.append(this.mstart);
    const go = async () => {
      btn.disabled = true;
      initAudio(Save.get().settings);
      sfx.click();
      this.app.touch?.enable();
      await enterFullscreen();
      this.mstart.remove();
      this.mstart = null;
      this.mstartDone = true;
      onStart?.();
    };
    btn.addEventListener('click', go, { once: true });
  }

  // ───────────────────────── Hauptmenü ─────────────────────────
  showMenu() {
    const s = Save.get();
    this.hud.classList.add('hidden');
    this.menu.classList.remove('hidden');
    clear(this.menu);
    const name = h('input', { value: s.name, maxlength: 16, placeholder: 'Dein Name' });
    const code = h('input', { placeholder: 'AYRI-1234', maxlength: 9, style: { textTransform: 'uppercase' } });
    this.menuErr = h('div.err');
    const go = async (mode) => {
      s.name = name.value.trim() || s.name;
      Save.save();
      initAudio(s.settings);
      sfx.click();
      this.menuErr.textContent = '';
      this.menu.classList.add('busy');
      // Handy/Tablet: Vollbild und Querformat, wo der Browser es erlaubt (Android); iOS ignoriert das still
      if (this.app.touch?.active) await enterFullscreen();
      try {
        if (mode !== 'solo') this.menuErr.textContent = 'Verbinde mit dem Multiplayer-Server…';
        await this.app.connect(mode, code.value.trim().toUpperCase(), msg => { this.menuErr.textContent = msg; });
        this.menuErr.textContent = '';
      } catch (e) {
        this.menuErr.textContent = mode === 'solo' ? e.message : `${e.message}. Bitte gleich nochmal versuchen – Solo geht immer.`;
      }
      this.menu.classList.remove('busy');
    };
    // Reihenfolge nach Wichtigkeit: Logo > Name > Gruppe erstellen > Beitreten > Solo > Einstellungen > Statistiken > Charakter.
    // Auf niedrigen Bildschirmen (Handy quer) zweispaltig, damit das Logo immer vollständig sichtbar bleibt.
    this.menu.append(
      h('div.menubox',
        h('div.mleft',
          h('div.logo', h('span.l1', 'GAMBLE'), h('span.l2', 'with your'), h('span.l3', 'AYRIS')),
          h('div.sub', 'Das Co-op-Casino für dich & deine Freunde · 15 Stockwerke · $500\'000\'000'),
          h('label', 'Name', name),
        ),
        h('div.mright',
          h('div.menubtns',
            h('button.big.primary', { onclick: () => go('create') }, '👥 Gruppe erstellen'),
            h('div.joinrow', code, h('button.big', { onclick: () => go('join') }, 'Beitreten')),
            h('button.big', { onclick: () => go('solo') }, '🎮 Solo spielen'),
          ),
          h('div.menulinks',
            h('button.mlink', { onclick: () => this.openSettings() }, '⚙️ Einstellungen'),
            h('button.mlink', { onclick: () => this.openStats() }, '📊 Statistiken'),
            h('button.mlink', { onclick: () => { this.app.input.exitLock(); this.openEditor(true); } }, '🎨 Charakter'),
          ),
          this.menuErr,
          h('div.progressline', `Aktueller Run: ${(s.run.completed || []).length}/15 Stockwerke · 🍆 ${s.dildos} · Team-Pot ${fmtMoney(s.run.pot)}`),
          serverHost().remote ? h('div.disclaimer', `Multiplayer läuft über ${serverHost().host}. Nach längerer Pause braucht der Server bis zu 1 Minute zum Aufwachen.`) : null,
          h('div.disclaimer', 'Nur virtuelle Spielwährung. Kein echtes Geld, keine Echtgeld-Käufe.'),
        ),
      ),
    );
  }
  hideMenu() {
    this.menu.classList.add('hidden'); this.hud.classList.remove('hidden'); this.closeModal();
    // Steuerungshilfe nur beim allerersten Spielstart (in den Einstellungen wieder einschaltbar)
    if (!Save.get().settings.helpSeen) setTimeout(() => this.showControlsHelp(), 600);
  }
  menuError(msg) { if (this.menuErr) this.menuErr.textContent = msg; this.showMenu(); this.menuErr.textContent = msg; }

  // ───────────────────────── HUD ─────────────────────────
  onSceneChange(scene, floor) {
    this.hud.dataset.scene = scene;
    this.crosshair.style.display = scene === 'floor' ? '' : 'none';
    this.closeTablePanel();
    this.refreshHud();
  }

  refreshHud() {
    const app = this.app, st = app.state, s = Save.get();
    this.dildoEl.innerHTML = `🍆 <b>${s.dildos}</b>`;
    if (!st) return;
    this.setPot(st.pot);
    if (st.scene === 'floor') {
      const f = floorDef(st.floor);
      this.targetEl.innerHTML = `TARGET <b>${fmtMoney(f.target)}</b>${st.session?.targetReached ? ' <span class="ok">✓</span>' : ''}`;
      this.progress.style.display = '';
      this.progress.firstChild.style.width = Math.min(100, st.pot / f.target * 100) + '%';
      this.progress.classList.toggle('done', !!st.session?.targetReached);
      this.levelEl.innerHTML = `LEVEL <b>${st.floor}</b> · ${esc(f.name)}`;
      this.renderChallenges(st);
    } else {
      clear(this.chEl);
      this.targetEl.innerHTML = st.scene === 'final' ? '<span class="gold">DIE FINALE ENTSCHEIDUNG</span>' : `Stockwerke: <b>${st.campaign.completed.length}/15</b> · freigeschaltet bis <b>${st.campaign.unlocked}</b>`;
      this.progress.style.display = 'none';
      this.levelEl.innerHTML = st.scene === 'final' ? '???' : 'SHISHABAR';
    }
    clear(this.groupEl);
    const code = st.code === 'SOLO' ? 'SOLO' : st.code;
    this.groupEl.append(h('div.code', { title: 'Join-Code', onclick: () => navigator.clipboard?.writeText(code) }, code === 'SOLO' ? 'Solo-Modus' : `Code: ${code}`));
    for (const p of st.players) this.groupEl.append(h('div.pl', { class: p.id === app.me ? 'me' : '' }, (p.id === st.hostId ? '★ ' : '• ') + p.name + (p.seat ? ' 🎲' : '')));
    this.renderItems();
    if (this.tableView) this.tableView.refreshPanel();
  }

  // Emote-Leiste: Grund-Emotes + freigeschaltete (Verbeugen, Dab, Geld werfen)
  renderEmotes() {
    clear(this.emoteBar);
    for (const [e, ico, label] of unlockedEmotes()) this.emoteBar.append(h('button.icon', { title: label, onclick: () => { this.app.emote(e); this.emoteBar.classList.add('hidden'); } }, ico));
  }

  // Steuerungshilfe: erscheint beim ersten Start und blendet sich nach 12 Sekunden selbst aus
  showControlsHelp() {
    const st = Save.get().settings;
    st.helpSeen = true;
    Save.save();
    const touch = this.app.touch?.active;
    const rows = touch
      ? [['🕹️', 'Joystick links: laufen'], ['👆', 'Rechts wischen: umschauen'], ['JUMP', 'Springen'], ['▶', 'Aktions-Buttons rechts: interagieren'], ['👥', 'Gruppe']]
      : [['WASD', 'Laufen (Shift = rennen)'], ['LEERTASTE', 'Springen / Aufstehen'], ['E', 'Interagieren'], ['TAB', 'Gruppe'], ['MAUS', 'Umschauen (im Casino: klicken)']];
    clear(this.helpEl);
    this.helpEl.append(
      h('div.chtitle', '🎮 STEUERUNG', h('button.icon.chclose', { title: 'Schliessen', onclick: () => this.hideControlsHelp() }, '✕')),
      ...rows.map(([k, t]) => h('div.chrow', h('span.key', k), h('span', t))),
      h('div.chfoot', 'Jederzeit wieder einschaltbar unter ⚙️ Einstellungen'),
    );
    this.helpEl.classList.remove('hidden', 'out');
    clearTimeout(this.helpTimer);
    this.helpTimer = setTimeout(() => this.hideControlsHelp(), 12000);
  }
  hideControlsHelp() {
    clearTimeout(this.helpTimer);
    this.helpEl.classList.add('out');
    setTimeout(() => this.helpEl.classList.add('hidden'), 500);
  }

  // Optionale Challenges des Stockwerks (blockieren nichts – nur Bonus-🍆)
  renderChallenges(st) {
    const list = st.session?.challenges || [];
    const mine = new Set(Save.get().challenges || []);
    const key = JSON.stringify(list) + [...mine].length;
    if (key === this.chKey) return;
    this.chKey = key;
    clear(this.chEl);
    if (!list.length) return;
    const doneCount = list.filter(c => c.done || mine.has(c.id)).length;
    this.chEl.append(h('div.chhead', `CHALLENGES ${doneCount}/${list.length} · optional`));
    for (const c of list) {
      const def = CHALLENGE_BY_ID[c.id];
      const ok = c.done || mine.has(c.id);
      this.chEl.append(h('div.ch', { class: ok ? 'ok' : '', title: ok && !c.done ? 'Bereits früher geschafft' : '' },
        h('span.cb', ok ? '✓' : '□'), h('span.ct', def.text), h('span.cp', ok ? `+${def.reward}🍆` : c.goal > 1 ? `${c.prog}/${c.goal}` : `+${def.reward}🍆`)));
    }
  }

  setPot(v) {
    if (this.potShown === undefined) this.potShown = v;
    if (v !== this.potTarget) {
      const diff = v - (this.potTarget ?? v);
      this.potTarget = v;
      if (diff) {
        this.potEl.classList.remove('up', 'down');
        void this.potEl.offsetWidth;
        this.potEl.classList.add(diff > 0 ? 'up' : 'down');
        const d = h('div.potdelta', { class: diff > 0 ? 'up' : 'down' }, (diff > 0 ? '+' : '-') + fmtMoney(Math.abs(diff)).replace('-', ''));
        this.potEl.parentElement.append(d);
        setTimeout(() => d.remove(), 1800);
      }
    }
  }

  tick(dt) {
    if (this.potTarget !== undefined && this.potShown !== this.potTarget) {
      const d = this.potTarget - this.potShown;
      this.potShown = Math.abs(d) < 1 ? this.potTarget : this.potShown + d * Math.min(1, dt * 8);
      this.potEl.textContent = fmtMoney(Math.round(this.potShown));
    } else if (this.potTarget !== undefined) this.potEl.textContent = fmtMoney(this.potTarget);
    // MAKKA-Anzeige: Flasche in der Hand bzw. Schwindel-Countdown
    const p = this.app.player;
    const n = this.app.makkaCount;
    const touch = this.app.touch?.active;
    const txt = p.drinkT > 0 ? (p.drinkKind === 'cocktail' ? '🍹 Schlürf…' : '🍾 Gluck, gluck…') : p.dizzyT > 0 && p.dizzyMax >= 0.5 ? `😵‍💫 Schwindelig ${Math.ceil(p.dizzyT)}s` : n > 0 ? `🍾 MAKKA ×${n}${touch ? '' : ' · T trinken'}` : '';
    if (this.makkaEl.textContent !== txt) { this.makkaEl.textContent = txt; this.makkaEl.classList.toggle('hidden', !txt || !this.app.state); this.makkaEl.disabled = !(n > 0) || p.drinkT > 0; }
    // MAKKA-LUCK-Countdown (läuft serverseitig; hier nur die Anzeige)
    const left = Math.max(0, Math.ceil(((this.app.makkaLuckEnd || 0) - performance.now()) / 1000));
    const ltxt = left > 0 && this.app.world?.kind === 'floor' ? `🍹 MAKKA LUCK – ${left}s` : '';
    if (this.luckEl.textContent !== ltxt) { this.luckEl.textContent = ltxt; this.luckEl.classList.toggle('hidden', !ltxt); }
    if (this.voteDeadline) {
      const left = Math.max(0, Math.ceil((this.voteDeadline - Date.now()) / 1000));
      if (this.voteTimer) this.voteTimer.textContent = `${left}s`;
    }
  }

  setHint(t) { if (this.hintEl.textContent !== t) { this.hintEl.textContent = t; this.hintEl.style.opacity = t ? 1 : 0; } }

  renderItems() {
    const app = this.app, st = app.state;
    clear(this.itemBar);
    const me = app.mePlayer;
    if (!me || !me.loadout?.length) {
      if (st?.scene === 'lobby') this.itemBar.append(h('div.itemhint', 'Items im AYRI SHOP kaufen und im Aufzug ausrüsten'));
      return;
    }
    const inFloor = st.scene === 'floor';
    // Retry-Items wirken am Tisch, an dem man sitzt, oder am zuletzt gespielten Automaten
    const seatId = me.seat || app.lastSlotId;
    const seat = seatId && st.session?.tables[seatId];
    for (const k of me.loadout) {
      const def = ITEMS[k];
      const count = me.inventory[k] || 0;
      const used = def.usage === 'perLevel' && me.used[k];
      const armed = me.armed[k] || (k === 'shisha' && me.shishaRounds > 0);
      let usable = inFloor && count > 0 && !used;
      let action = null;
      let status = def.usage === 'single' ? `×${count}` : used ? 'benutzt' : '1×/Level';
      if (def.mode === 'arm') action = () => app.send({ t: armed ? 'item.disarm' : 'item.arm', item: k });
      if (def.mode === 'retry') {
        const canRetry = seat && seat.canRetry?.[app.me] && !seat.busy && (k === 'crown' || RETRY_GAMES_HAT.includes(seat.type));
        usable = usable && !!canRetry;
        action = () => app.send({ t: 'item.retry', item: k, id: seatId });
        if (!used && inFloor) status = canRetry ? 'JETZT!' : 'nach Verlust';
      }
      if (def.mode === 'passive') { usable = false; status = count ? 'aktiv' : '–'; }
      if (def.mode === 'blackjack') { usable = false; status = used ? 'benutzt' : 'Blackjack'; }
      if (k === 'shisha' && me.shishaRounds > 0) status = `${me.shishaRounds} Runden`;
      const el = h('button.item', {
        class: [armed ? 'armed' : '', usable ? 'usable' : '', used ? 'used' : ''].join(' '),
        title: `${def.name}: ${def.desc}`,
        onclick: () => { if (usable && action) { sfx.pop(); action(); } else if (!inFloor) this.toast('Items wirken nur im Casino', 'info'); },
      }, h('span.ico', def.icon), h('span.nm', def.name), h('span.st', armed && k !== 'shisha' ? 'AKTIV' : status));
      this.itemBar.append(el);
    }
  }

  focusItems() { this.itemBar.classList.add('flash'); setTimeout(() => this.itemBar.classList.remove('flash'), 800); }

  // ───────────────────────── Feed & Toasts ─────────────────────────
  feed(html, cls = '') {
    const el = h('div.fi', { class: cls, html });
    this.feedEl.prepend(el);
    while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
    setTimeout(() => el.classList.add('old'), 8000);
    setTimeout(() => el.remove(), 16000);
  }

  toast(msg, type = 'info', ms = 3200) {
    const el = h('div.toast', { class: type }, msg);
    this.toasts.append(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  reward(n, reason, achievement) {
    if (achievement) this.popup('achievement', `ACHIEVEMENT FREIGESCHALTET +${n} 🍆`, reason.replace(/^ACHIEVEMENT: /, ''));
    else this.popup('reward', `+${n} 🍆`, reason);
  }

  // Animierte Feedback-Popups (Challenge, Stockwerk, neues Item, Achievement …) – verschwinden automatisch.
  // Höchstens 3 gleichzeitig, der Rest wartet kurz in der Schlange.
  popup(kind, title, sub = '', ms = 3600) {
    this.popupQueue.push({ kind, title, sub, ms });
    this.pumpPopups();
  }

  pumpPopups() {
    while (this.popupQueue.length && this.popups.children.length < 3) {
      const { kind, title, sub, ms } = this.popupQueue.shift();
      const icon = { challenge: '🏅', floor: '🔓', item: '🎁', achievement: '🏆', reward: '🍆', money: '💰', jackpot: '💎', event: '⚡' }[kind] || '✨';
      const el = h('div.popup', { class: kind }, h('span.pi', icon), h('div.pt', h('div.ptt', title), sub ? h('div.pts', sub) : null));
      this.popups.append(el);
      if (kind === 'reward' || kind === 'challenge') sfx.shop(); else if (kind === 'achievement' || kind === 'floor') sfx.ding();
      setTimeout(() => el.classList.add('out'), ms);
      setTimeout(() => { el.remove(); this.pumpPopups(); }, ms + 450);
    }
  }

  bigText(title, sub, cls = '', ms = 2500) {
    const el = h('div.bigtext', { class: cls }, h('div.bt', title), sub ? h('div.bs', sub) : null);
    this.overlay.append(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }

  itemPop(ev) {
    const el = h('div.itempop', h('span.ico', ITEMS[ev.item]?.icon || '✨'), h('div', h('b', ev.name), h('div', ev.msg)));
    if (ev.result) el.classList.add(ev.result === 'win' || ev.result === 'gold' ? 'good' : 'bad');
    this.overlay.append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  // ───────────────────────── Abstimmung ─────────────────────────
  renderVote(v) {
    if (!v) { this.voteEl.classList.add('hidden'); this.voteDeadline = null; return; }
    this.voteEl.classList.remove('hidden');
    clear(this.voteEl);
    const app = this.app;
    const voted = v.yes.includes(app.me);
    this.voteDeadline = v.expires;
    this.voteTimer = h('span.timer');
    this.voteEl.append(
      h('div.vq', `${v.byName}: ${v.label}`),
      h('div.vs', `${v.yes.length}/${app.state.players.length} bereit `, this.voteTimer),
      voted ? h('div.vw', 'Warte auf die anderen…') : h('div.vb',
        h('button.primary', { onclick: () => { sfx.click(); app.send({ t: 'vote.cast', yes: true }); } }, 'JA'),
        h('button', { onclick: () => { sfx.click(); app.send({ t: 'vote.cast', yes: false }); } }, 'NEIN')),
    );
    const key = v.type + v.by + v.expires;
    if (!voted && this.lastVoteKey !== key) sfx.ding();
    this.lastVoteKey = key;
  }

  confirm(text) {
    return new Promise(res => {
      this.app.input.exitLock();
      this.openModal(h('div.confirm',
        h('div.ct', text),
        h('div.actions',
          h('button.primary', { onclick: () => { this.onModalClose = null; this.closeModal(); res(true); } }, 'Ja'),
          h('button', { onclick: () => { this.closeModal(); res(false); } }, 'Abbrechen'))), 'small');
      this.onModalClose = () => res(false);
    });
  }

  // Bestätigungsdialog mit eigenem Titel und Knopftexten
  confirmDialog({ title, text, ok = 'OK', cancel = 'Abbrechen' }) {
    return new Promise(res => {
      this.app.input.exitLock();
      this.openModal(h('div.confirm',
        h('h2', title),
        h('div.ct.small2', text),
        h('div.actions',
          h('button', { onclick: () => { this.closeModal(); res(false); } }, cancel),
          h('button.primary', { onclick: () => { this.onModalClose = null; this.closeModal(); res(true); } }, ok))), 'small');
      this.onModalClose = () => res(false);
    });
  }

  // ───────────────────────── Tisch ─────────────────────────
  openTablePanel(view) {
    this.tableView = view;
    clear(this.tableWrap);
    const panel = view.buildPanel();
    this.tableWrap.append(panel, h('button.leave', { onclick: () => this.app.leaveTable() }, '✕ Aufstehen (ESC)'));
    this.tableWrap.classList.remove('hidden');
    this.crosshair.style.display = 'none';
    view.refreshPanel();
  }
  closeTablePanel() {
    this.tableView = null;
    this.tableWrap.classList.add('hidden');
    clear(this.tableWrap);
    if (this.app.world?.mode === 'first') this.crosshair.style.display = '';
  }

  // ───────────────────────── Szenen-Overlays ─────────────────────────
  elevatorTransition(label, swap, fdef) {
    const d = this.doors;
    const info = d.querySelector('.doorinfo');
    clear(info);
    info.append(h('div.floorno', label));
    if (fdef) info.append(h('div.floorname', fdef.name), h('div.floortarget', `Ziel: ${fmtMoney(fdef.target)}`));
    this.app.input.exitLock();
    this.closeModal();
    d.classList.remove('hidden', 'open');
    void d.offsetWidth;
    d.classList.add('closing');
    sfx.doors();
    setTimeout(() => { sfx.whoosh(); swap(); }, 900);
    setTimeout(() => { sfx.ding(); d.classList.remove('closing'); d.classList.add('open'); }, 2300);
    setTimeout(() => { d.classList.add('hidden'); d.classList.remove('open'); }, 3300);
  }

  targetReached(ev) {
    const f = floorDef(ev.floor);
    this.app.input.exitLock();
    const box = h('div.targetbox',
      h('div.tt', 'TARGET REACHED!'),
      h('div.ts', ev.final ? '💰 $500\'000\'000 – DAS SPIEL IST GESCHAFFT! 💰' : `LEVEL ${ev.floor} COMPLETE`),
      ev.newFloor ? h('div.tn', `🔓 NEW FLOOR UNLOCKED: STOCK ${ev.newFloor}`) : null,
      ev.final ? h('div.tn', 'Verlasst das Casino, wenn ihr bereit seid – im Aufzug wartet etwas Geheimes: ???') : null,
      h('div.tinfo', `Team-Pot: ${fmtMoney(this.app.pot)} · Ziel ${fmtMoney(f.target)}`),
      h('div.actions',
        h('button.primary.big', { onclick: () => { el.remove(); this.app.send({ t: 'vote.start', type: 'return' }); } }, 'RETURN TO SHISHA BAR'),
        h('button.big', { onclick: () => { el.remove(); this.toast('Weitergamblen – das Level bleibt abgeschlossen!', 'info'); } }, 'KEEP GAMBLING'),
      ),
    );
    const el = h('div.targetwrap', box);
    this.overlay.append(el);
  }

  explosion() {
    const el = h('div.boom', h('div.flash'), h('div.kaboom', 'KA-BOOM!'));
    this.overlay.append(el);
    setTimeout(() => el.remove(), 2400);
  }

  levelFailed(keep) {
    const el = h('div.failed', h('div.ft', 'LEVEL FAILED'), h('div.fs', `RUN VERLOREN – neuer Run mit ${fmtMoney(keep)} · alle Stockwerke wieder gesperrt ausser Stock 1`));
    this.overlay.append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3400);
  }

  finalScreen(title, big, sub, cls) {
    const el = h('div.finalscreen', { class: cls }, h('div.ft', title), h('div.fb', big), h('div.fs', sub));
    this.overlay.append(el);
    setTimeout(() => el.classList.add('out'), 8500);
    setTimeout(() => el.remove(), 9300);
  }

  toggleEmotes() { this.emoteBar.classList.toggle('hidden'); sfx.click(); }

  toggleScoreboard(show) {
    if (!this.app.state) return;
    this.scoreEl.classList.toggle('hidden', !show);
    if (show) renderScoreboard(this, this.scoreEl);
  }

  // ───────────────────────── Modals ─────────────────────────
  openModal(content, size = '') {
    this.app.input.exitLock();
    clear(this.modal);
    this.modal.className = 'modal ' + size;
    const box = h('div.mbox', h('button.close', { onclick: () => this.closeModal() }, '✕'), content);
    this.modal.append(box);
    this.modal.onclick = e => { if (e.target === this.modal) this.closeModal(); };
    this.modalOpen = true;
  }
  closeModal() {
    if (!this.modalOpen) return;
    this.modal.classList.add('hidden');
    clear(this.modal);
    this.modalOpen = false;
    const cb = this.onModalClose;
    this.onModalClose = null;
    cb?.();
  }
  openElevator() { openElevator(this); }
  openShop() { openShop(this); }
  openBar(nextLine) { openBar(this, nextLine); }
  openEditor(fromMenu) { openEditor(this, fromMenu); }
  openStats() { openStats(this); }
  openSettings() { openSettings(this); }
}

export { FLOORS, fmtShort };
