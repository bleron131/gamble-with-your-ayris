// Dialoge: Aufzug (Levelauswahl + Ausrüstung), AYRI SHOP, Charaktereditor, Statistiken, Einstellungen.
import * as THREE from 'three';
import { h, clear } from './dom.js';
import { FLOORS, ITEMS, LOADOUT_SLOTS, GAME_NAMES, GAME_ICONS, ACHIEVEMENTS, COSMETIC_UNLOCKS, fmtMoney, START_CAPITAL, MAFIA_KEEP_FRACTION } from '../../shared/config.js';
import { OPTIONS } from '../character.js';
import * as Save from '../save.js';
import { sfx } from '../audio.js';

// ───────────────────────── Aufzug ─────────────────────────
export function openElevator(ui) {
  const app = ui.app, st = app.state, s = Save.get();
  if (!st) return;
  const camp = st.campaign;
  const grid = h('div.floors');
  for (const f of FLOORS) {
    const done = camp.completed.includes(f.n);
    const unlocked = f.n <= camp.unlocked;
    const afford = st.pot >= f.minBet;
    const status = done ? '✓ GESCHAFFT' : unlocked ? 'FREIGESCHALTET' : '🔒 GESPERRT';
    const card = h('button.floor', {
      class: [done ? 'done' : '', unlocked ? 'open' : 'locked', !afford && unlocked ? 'poor' : '', f.n === 15 ? 'final' : ''].join(' '),
      disabled: !unlocked,
      onclick: () => { if (!unlocked) return; sfx.click(); ui.closeModal(); app.requestTravel(f.n); },
    },
      h('div.fn', f.n),
      h('div.fname', f.name),
      h('div.fgames', f.games.map(g => GAME_ICONS[g]).join(' ')),
      h('div.ftarget', `Ziel ${fmtMoney(f.target)}`),
      h('div.fmin', `Min. ${fmtMoney(f.minBet)}`),
      h('div.fstatus', status),
    );
    card.title = f.games.map(g => `${GAME_NAMES[g]}: ${fmtMoney(f.limits[g].min)} – ${fmtMoney(f.limits[g].max)}`).join('\n');
    grid.append(card);
  }
  if (st.run.finalUnlocked) {
    grid.append(h('button.floor.secret', { onclick: () => { sfx.click(); ui.closeModal(); app.requestTravel('final'); } },
      h('div.fn', '???'), h('div.fname', 'Ganz nach oben'), h('div.fstatus', 'Kein Level 16.')));
  }
  ui.openModal(h('div.elevator',
    h('h2', '🛗 AUFZUG'),
    h('div.subtle', `Team-Pot: ${fmtMoney(st.pot)} – wird auf jedes Stockwerk mitgenommen. Alle freigeschalteten Stockwerke können jederzeit erneut besucht werden.`),
    grid,
    loadoutEditor(ui),
    h('div.subtle.small', `Bankrott (Pot unter Mindesteinsatz) ruft die Mafia: Level verloren, ihr behaltet ${Math.round(MAFIA_KEEP_FRACTION * 100)}% eures Stockwerk-Startkapitals (mind. ${fmtMoney(START_CAPITAL)}).`),
  ), 'wide');
}

function loadoutEditor(ui) {
  const s = Save.get();
  const wrap = h('div.loadout');
  const render = () => {
    clear(wrap);
    wrap.append(h('h3', `🎒 Ausrüstung (${s.loadout.length}/${LOADOUT_SLOTS}) – welche Items nimmst du mit?`));
    const owned = Object.entries(s.inventory).filter(([, c]) => c > 0);
    if (!owned.length) { wrap.append(h('div.subtle', 'Noch keine Items. Kaufe welche im AYRI SHOP mit 🍆.')); return; }
    const row = h('div.invrow');
    for (const [k, c] of owned) {
      const def = ITEMS[k];
      const on = s.loadout.includes(k);
      row.append(h('button.inv', {
        class: on ? 'on' : '',
        title: def.desc,
        onclick: () => {
          if (on) s.loadout = s.loadout.filter(x => x !== k);
          else if (s.loadout.length < LOADOUT_SLOTS) s.loadout.push(k);
          else return ui.toast(`Maximal ${LOADOUT_SLOTS} Items`, 'warn');
          sfx.click();
          Save.save();
          ui.app.syncLoadout();
          render();
        },
      }, h('span.ico', def.icon), h('span', def.name), h('span.cnt', def.usage === 'single' ? `×${c}` : 'permanent')));
    }
    wrap.append(row);
  };
  render();
  return wrap;
}

// ───────────────────────── Bar ─────────────────────────
export function openBar(ui, nextLine) {
  const s = Save.get();
  const app = ui.app;
  const line = h('div.barline', nextLine());
  const buy = h('button.primary.big', {
    disabled: s.dildos < Save.MAKKA_PRICE || app.player.hasBottle || app.player.drinkT > 0 ? true : null,
    onclick: () => { if (app.buyMakka()) ui.closeModal(); },
  }, `MAKKA kaufen – ${Save.MAKKA_PRICE} 🍆`);
  ui.openModal(h('div.bar',
    h('h2', '🍸 KEMALS BAR'),
    h('div.makkacard',
      h('div.makkaicon', '🍾'),
      h('div',
        h('div.sname', 'MAKKA'),
        h('div.sdesc', 'Pinke Ayri-Limonade in der klaren Flasche. Schmeckt nach Zitrone – und dreht dir für 10 Sekunden die ganze Shishabar.'),
        h('div.susage', `Preis: ${Save.MAKKA_PRICE} 🍆 · Dein Bestand: ${s.dildos} 🍆`))),
    line,
    h('div.actions',
      buy,
      h('button', { onclick: () => { line.textContent = nextLine(); sfx.click(); } }, 'Mit Kemal reden'),
    ),
    app.player.hasBottle ? h('div.subtle.small', 'Du hast schon einen MAKKA in der Hand – drücke T zum Trinken.') : null,
  ), 'small');
}

// ───────────────────────── Shop ─────────────────────────
export function openShop(ui) {
  const s = Save.get();
  const wrap = h('div.shop');
  const render = () => {
    clear(wrap);
    wrap.append(h('h2', '🍆 AYRI SHOP'), h('div.subtle', `Dein Bestand: 🍆 ${s.dildos} · Dildos gibt es nur durch Fortschritt, Challenges und Achievements – niemals für echtes Geld.`));
    const grid = h('div.shopgrid');
    for (const [k, def] of Object.entries(ITEMS)) {
      const owned = s.inventory[k] || 0;
      const perm = def.usage === 'perLevel';
      const can = s.dildos >= def.cost && !(perm && owned);
      grid.append(h('div.shopitem', { class: owned ? 'owned' : '' },
        h('div.sico', def.icon),
        h('div.sname', def.name),
        h('div.susage', perm ? 'PERMANENT · 1× pro Level' : 'EINMAL VERWENDBAR'),
        h('div.sdesc', def.desc),
        h('div.sowned', perm ? (owned ? '✓ Im Besitz' : '') : owned ? `Im Inventar: ${owned}` : ''),
        h('button.primary', {
          disabled: !can,
          onclick: () => {
            if (!can) return;
            s.dildos -= def.cost;
            s.stats.dildosSpent += def.cost;
            s.inventory[k] = owned + 1;
            if (!s.loadout.includes(k) && s.loadout.length < LOADOUT_SLOTS) s.loadout.push(k);
            Save.save();
            ui.app.syncLoadout();
            sfx.shop();
            ui.toast(`${def.icon} ${def.name} gekauft!`, 'good');
            ui.refreshHud();
            render();
          },
        }, perm && owned ? 'Besitzt du' : `${def.cost} 🍆`),
      ));
    }
    wrap.append(grid);
    wrap.append(h('div.subtle.small', 'Gekaufte Items landen im Inventar. Im Aufzug wählst du vor jedem Stockwerk aus, welche du mitnimmst (max. 4).'));
  };
  render();
  ui.openModal(wrap, 'wide');
}

// ───────────────────────── Charaktereditor ─────────────────────────
const CATS = [
  ['skin', 'Hautfarbe', 'color'], ['hair', 'Haare'], ['hairColor', 'Haarfarbe', 'color'], ['eyes', 'Augen'], ['eyeColor', 'Augenfarbe', 'color'],
  ['brows', 'Augenbrauen'], ['beard', 'Bart'], ['top', 'Oberteil'], ['topColor', 'Oberteil-Farbe', 'color'], ['jacket', 'Jacke'],
  ['jacketColor', 'Jackenfarbe', 'color'], ['pants', 'Hose'], ['pantsColor', 'Hosenfarbe', 'color'], ['shoes', 'Schuhe'], ['shoesColor', 'Schuhfarbe', 'color'],
  ['hat', 'Kopfbedeckung'], ['hatColor', 'Hutfarbe', 'color'], ['glasses', 'Brille'], ['jewelry', 'Schmuck'], ['accessory', 'Accessoire'],
];

function isLocked(cat, val) {
  const u = COSMETIC_UNLOCKS[`${cat}:${val}`];
  if (!u) return null;
  const s = Save.get();
  if (u.floor && s.campaign.completed.includes(u.floor)) return null;
  if (u.achievement && s.achievements[u.achievement]) return null;
  return u.label;
}

export function openEditor(ui, fromMenu) {
  const app = ui.app, s = Save.get();
  const a = s.appearance;
  const char = app.selfChar;
  if (!fromMenu && app.state) {
    // Kamera vor den Charakter
    const p = app.player.pos;
    const yaw = app.player.yaw;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const camRight = new THREE.Vector3(fwd.z, 0, -fwd.x);
    // Charakter links im Bild, Editor rechts
    app.cinematic = { pos: p.clone().addScaledVector(fwd, 2.2).add(new THREE.Vector3(0, 1.3, 0)), look: p.clone().addScaledVector(camRight, 0.6).add(new THREE.Vector3(0, 0.85, 0)) };
  }
  const nameIn = h('input', { value: s.name, maxlength: 16, oninput: e => { s.name = e.target.value.slice(0, 16); } });
  const body = h('div.editbody');
  let cat = 'skin';
  const tabs = h('div.edittabs');
  const renderTabs = () => {
    clear(tabs);
    for (const [k, label] of CATS) tabs.append(h('button', { class: k === cat ? 'sel' : '', onclick: () => { cat = k; renderTabs(); renderBody(); } }, label));
  };
  const apply = () => { char.rebuild(a); Save.save(); };
  const renderBody = () => {
    clear(body);
    const def = CATS.find(c => c[0] === cat);
    const opts = OPTIONS[cat];
    if (def[2] === 'color') {
      const row = h('div.swatches');
      for (const c of opts) row.append(h('button.swatch', { style: { background: c }, class: a[cat] === c ? 'sel' : '', onclick: () => { a[cat] = c; sfx.click(); apply(); renderBody(); } }));
      const custom = h('input', { type: 'color', value: a[cat], oninput: e => { a[cat] = e.target.value; apply(); } });
      row.append(h('label.custom', 'Eigene: ', custom));
      body.append(row);
    } else {
      const row = h('div.optgrid');
      for (const [val, label] of opts) {
        const lock = isLocked(cat, val);
        row.append(h('button.opt', {
          class: [a[cat] === val ? 'sel' : '', lock ? 'locked' : ''].join(' '),
          title: lock ? `Freischalten: ${lock}` : label,
          onclick: () => { if (lock) { ui.toast(`🔒 ${label}: ${lock}`, 'warn'); return; } a[cat] = val; sfx.click(); apply(); renderBody(); },
        }, lock ? `🔒 ${label}` : label));
      }
      body.append(row);
    }
  };
  renderTabs();
  renderBody();
  ui.openModal(h('div.editor',
    h('h2', '🎨 CHARAKTER'),
    h('label', 'Name ', nameIn),
    tabs, body,
    h('div.actions',
      h('button', { onclick: () => { Object.assign(a, randomLook()); apply(); renderBody(); sfx.boing(); } }, '🎲 Zufall'),
      h('button.primary', { onclick: () => ui.closeModal() }, 'Fertig'),
    ),
    h('div.subtle.small', 'Weitere Kosmetik wird durch abgeschlossene Stockwerke und Achievements freigeschaltet.'),
  ), 'side');
  ui.onModalClose = () => {
    app.cinematic = null;
    Save.save();
    app.refreshSelf();
    if (fromMenu) ui.showMenu();
  };
}

function randomLook() {
  const out = {};
  for (const [k, , type] of CATS) {
    const opts = OPTIONS[k];
    let pick;
    let guard = 0;
    do { pick = opts[Math.floor(Math.random() * opts.length)]; guard++; } while (type !== 'color' && isLocked(k, pick[0]) && guard < 20);
    out[k] = type === 'color' ? pick : pick[0];
    if (type !== 'color' && isLocked(k, out[k])) out[k] = opts[0][0];
  }
  return out;
}

// ───────────────────────── Statistiken ─────────────────────────
export function openStats(ui) {
  const s = Save.get();
  const st = s.stats;
  const app = ui.app;
  const tab = h('div.statbody');
  const tabs = h('div.edittabs');
  let cur = 'stats';
  const row = (k, v) => h('div.srow', h('span', k), h('b', v));
  const renders = {
    stats: () => [
      h('h3', 'Deine Statistiken'),
      h('div.sgrid',
        row('Gesamteinsätze', fmtMoney(st.wagered)), row('Gesamtgewinne', fmtMoney(st.won)), row('Gesamtverluste', fmtMoney(st.lost)),
        row('Grösster Einzelgewinn', fmtMoney(st.biggestWin)), row('Grösster Einzelverlust', fmtMoney(st.biggestLoss)), row('Höchster Team-Pot', fmtMoney(st.highestPot)),
        row('Gespielte Runden', st.rounds), row('Gewonnene Runden', st.roundsWon), row('Gespielte Spins', st.spins), row('Gespielte Hände', st.hands),
        row('Roulette-Gewinne', st.rouletteWins), row('Blackjack-Gewinne', st.blackjackWins), row('Blackjacks', st.blackjacks), row('Slots-Jackpots', st.slotJackpots),
        row('Baccarat-Gewinne', st.baccaratWins), row('Craps-Gewinne', st.crapsWins), row('Poker-Gewinne', st.pokerWins), row('Glücksrad-Gewinne', st.wheelWins),
        row('Erfolgreiche Level', st.floorsCompleted), row('Fehlgeschlagene Level', st.floorsFailed), row('Mafia-Besuche', st.mafiaVisits),
        row('Double-or-Loss-Versuche', st.doubleAttempts), row('Erfolgreiche Doubles', st.doubleWins), row('Verlorene Doubles', st.doubleLosses),
        row('Gesammelte Dildos', `🍆 ${st.dildosEarned}`), row('Ausgegebene Dildos', `🍆 ${st.dildosSpent}`), row('Items benutzt', st.itemsUsed),
      ),
    ],
    group: () => {
      const c = app.state?.campaign || s.campaign;
      return [
        h('h3', 'Gruppe & Fortschritt'),
        h('div.sgrid',
          row('Abgeschlossene Stockwerke', `${c.completed.length}/15`), row('Freigeschaltet bis', `Stock ${c.unlocked}`),
          row('Höchster Team-Pot', fmtMoney(c.highestPot || 0)), row('Höchster erfolgreicher Gewinn', fmtMoney(c.bestWinnings || 0)),
          row('Höchste Double-or-Loss-Summe', fmtMoney(c.bestDouble || 0)), row('Spiel durchgespielt', c.gameComplete ? `Ja (${new Date(c.finishedAt).toLocaleDateString('de-CH')})` : 'Noch nicht'),
          row('Aktueller Team-Pot', fmtMoney(app.state?.pot ?? s.run.pot)),
        ),
        h('h3', 'Abgeschlossene Runs'),
        s.history.length ? h('div.history', s.history.map(r => h('div.hrow', { class: r.type },
          h('span', new Date(r.date).toLocaleString('de-CH')),
          h('b', r.type === 'take' ? `TAKE ${fmtMoney(r.amount)}` : r.type === 'double-win' ? `DOUBLE ✓ ${fmtMoney(r.amount)}` : `DOUBLE ✗ (${fmtMoney(r.amount)} verloren)`)))) : h('div.subtle', 'Noch kein Finale gespielt.'),
        app.state?.scene === 'lobby' ? h('div.actions', h('button.danger', { onclick: () => { ui.closeModal(); app.send({ t: 'vote.start', type: 'newrun' }); } }, `Neuen Run starten (${fmtMoney(START_CAPITAL)})`)) : null,
      ];
    },
    ach: () => [
      h('h3', `Achievements (${Object.keys(s.achievements).length}/${Object.keys(ACHIEVEMENTS).length})`),
      h('div.achs', Object.entries(ACHIEVEMENTS).map(([k, a]) => h('div.ach', { class: s.achievements[k] ? 'on' : '' },
        h('div.an', (s.achievements[k] ? '🏆 ' : '🔒 ') + a.name), h('div.ad', a.desc), h('div.ar', `+${a.reward} 🍆`)))),
    ],
  };
  const render = () => {
    clear(tabs);
    for (const [k, l] of [['stats', 'Statistiken'], ['group', 'Gruppe & Runs'], ['ach', 'Achievements']]) tabs.append(h('button', { class: k === cur ? 'sel' : '', onclick: () => { cur = k; render(); } }, l));
    clear(tab);
    tab.append(...renders[cur]().filter(Boolean));
  };
  render();
  ui.openModal(h('div.stats', h('h2', '📊 HALL OF FAME'), tabs, tab), 'wide');
}

// ───────────────────────── Einstellungen ─────────────────────────
export function openSettings(ui) {
  const s = Save.get();
  const st = s.settings;
  const app = ui.app;
  const slider = (key, label, min = 0, max = 1, step = 0.05) => h('label.slider', label,
    h('input', { type: 'range', min, max, step, value: st[key], oninput: e => { st[key] = +e.target.value; app.applySettings(); } }));
  const toggle = (key, label) => h('label.toggle', h('input', { type: 'checkbox', checked: st[key] ? true : null, onchange: e => { st[key] = e.target.checked; app.applySettings(); } }), label);
  // Grafikstufe (setzt Bloom/Schatten passend) und FPS-Limit
  const seg = (title, opts, key, onPick) => h('div.setrow', h('span', title), h('div.seg', ...opts.map(([v, l]) => h('button', { class: st[key] === v ? 'sel' : '', onclick: e => { onPick(v); for (const b of e.target.parentNode.children) b.classList.toggle('sel', b === e.target); sfx.click(); } }, l))));
  const graphics = h('div',
    seg('Grafik', [['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']], 'quality', v => {
      st.quality = v;
      st.bloom = v !== 'low'; st.shadows = v !== 'low';
      app.applySettings();
      ui.toast('Grafik geändert – Lichter und Schatten passen sich beim nächsten Raumwechsel ganz an.', 'info', 2500);
    }),
    seg('FPS-Limit', [[30, '30'], [60, '60'], [0, 'Max']], 'fpsLimit', v => { st.fpsLimit = v; app.applySettings(); }),
  );
  ui.openModal(h('div.settings',
    h('h2', '⚙️ EINSTELLUNGEN'),
    slider('master', 'Gesamtlautstärke'), slider('music', 'Musik'), slider('sfx', 'Effekte'),
    app.touch?.active ? slider('touchSensitivity', 'Kamera-Empfindlichkeit (Touch)', 0.4, 2.2, 0.1) : slider('sensitivity', 'Mausempfindlichkeit', 0.3, 2.5, 0.1),
    graphics,
    toggle('bloom', 'Neon-Glow (Bloom)'), toggle('shadows', 'Schatten'),
    h('div.actions',
      app.state ? h('button.danger', { onclick: () => { ui.closeModal(); app.disconnect(); ui.showMenu(); } }, app.mode === 'solo' ? 'Zum Hauptmenü' : 'Gruppe verlassen') : null,
      h('button', { onclick: async () => { if (await ui.confirm('Wirklich ALLE Fortschritte, Dildos und Items löschen?')) { Save.resetAll(); location.reload(); } } }, 'Spielstand zurücksetzen'),
    ),
    app.touch?.active ? h('div.subtle.small', 'Touch: Joystick links = laufen · rechts wischen = Kamera · JUMP = springen · Buttons rechts = Aktion (SPIELEN, AUFZUG, SPIN …) · Tippen auf Tische/Automaten = setzen/drücken · lange drücken = Chip wegnehmen · 🎥 = Kugelkamera') : null,
    h('div.subtle.small', 'Steuerung: WASD laufen · Maus schauen · Shift rennen · E interagieren · ESC/Q Tisch verlassen · 1-5 Emotes · TAB Gruppe · Mausrad Kamera-Zoom (Shishabar)'),
  ), 'small');
}

export function renderScoreboard(ui, el) {
  const st = ui.app.state;
  clear(el);
  el.append(h('h3', `Gruppe ${st.code === 'SOLO' ? '(Solo)' : st.code}`));
  for (const p of st.players) el.append(h('div.srow', h('span', (p.id === st.hostId ? '★ ' : '') + p.name), h('b', p.seat ? `spielt ${GAME_NAMES[p.seat.split('-')[0]]}` : '—')));
  el.append(h('div.srow', h('span', 'Team-Pot'), h('b', fmtMoney(st.pot))));
  el.append(h('div.srow', h('span', 'Stockwerke'), h('b', `${st.campaign.completed.length}/15`)));
}
