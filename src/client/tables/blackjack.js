// Blackjack-Tisch mit Dealer, Kartenschuh und animiertem Austeilen.
import * as THREE from 'three';
import { TableView, halfMoonTable, makeDealer, cardShoe, stool, chipStack, CardSet, TextSprite, ease } from './common.js';
import { printedFelt } from '../textures.js';
import { handTotal, cardValue } from '../../shared/games/blackjack.js';
import { h, clear } from '../ui/dom.js';
import { BetAmount, actionButton, limitLine } from '../ui/betpanel.js';
import { fmtMoney } from '../../shared/config.js';
import { say, sfx, sfxAt } from '../audio.js';

export class BlackjackView extends TableView {
  constructor(app, def, floor) {
    super(app, def, floor);
    this.seatLocal.set(0, 0, 1.5);
    this.camLocal.set(0, 1.95, 1.55);
    this.lookLocal.set(0.38, 0.8, 0.2);
    this.footprint = { w: 2.7, d: 1.8, oz: 0.4 };
    this.build();
  }

  build() {
    const g = this.group;
    g.add(halfMoonTable(printedFelt('blackjack'), this.tier));
    this.shoePos = new THREE.Vector3(0.85, 0.9, -0.12);
    const shoe = cardShoe();
    shoe.position.set(0.85, 0.82, -0.12);
    shoe.rotation.y = -0.4;
    g.add(shoe);
    this.cards = new CardSet(this, this.shoePos);
    this.dealer = makeDealer(this.tier, this.def.index + 3);
    this.dealer.root.position.set(0, 0, -0.95);
    g.add(this.dealer.root);
    for (let i = -1; i <= 1; i++) { const s = stool(this.tier); s.position.set(i * 0.75, 0, 1.45 - Math.abs(i) * 0.25); s.scale.setScalar(0.85); g.add(s); }
    this.chips = new THREE.Group();
    g.add(this.chips);
    this.dealerLabel = new TextSprite(0.5, 0.12);
    this.dealerLabel.sprite.position.set(0, 1.02, 0.2);
    g.add(this.dealerLabel.sprite);
    this.handLabels = [0, 1, 2, 3].map(() => { const t = new TextSprite(0.45, 0.11); g.add(t.sprite); return t; });
  }

  handX(i, n) { return (i - (n - 1) / 2) * 0.55; }

  onState(ts, prev) {
    const s = ts.state;
    if (prev && prev.state.dealId !== s.dealId) this.cards.clear(true);
    if (!prev && s.phase === 'idle') { this.refreshPanel(); return; }
    const items = [];
    s.dealer.forEach((c, i) => items.push({ key: `d${i}-${c ? c.r + '.' + c.s : 'x'}`, card: c, pos: new THREE.Vector3(-0.1 + i * 0.19, 0.86 + i * 0.001, -0.02) }));
    // Verdeckte Karte behält ihren Schlüssel, damit sie umgedreht statt neu ausgeteilt wird
    if (s.dealer[1]) items[1].key = 'd1-x';
    s.hands.forEach((hand, hi) => hand.cards.forEach((c, ci) => items.push({
      key: `h${hi}-${ci}-${c.r}.${c.s}`, card: c,
      pos: new THREE.Vector3(this.handX(hi, s.hands.length) + ci * 0.08 - 0.06, 0.86 + ci * 0.002, 0.62 - ci * 0.06),
    })));
    // Austeil-Reihenfolge wie im Casino beim ersten Deal
    if (prev && prev.state.dealId !== s.dealId && s.hands[0]?.cards.length === 2) {
      const order = ['h0-0', 'd0', 'h0-1', 'd1'];
      items.sort((a, b) => order.findIndex(o => a.key.startsWith(o)) - order.findIndex(o => b.key.startsWith(o)));
    }
    if (prev?.state.dealer[1] === null && s.dealer[1]) this.dealer.setAnim('deal');
    this.cards.sync(items);
    this.dealer.setAnim(s.phase === 'player' || s.phase === 'dealer' ? 'deal' : 'idle');
    setTimeout(() => this.dealer.setAnim('idle'), 900);
    // Chips: während der Runde liegen sie auf dem Einsatzfeld, am Ende werden sie ausgezahlt bzw. eingesammelt
    const finished = prev && prev.state.phase !== 'done' && s.phase === 'done';
    if (s.phase !== 'done') {
      const fresh = !prev || prev.state.dealId !== s.dealId;
      clear(this.chips);
      s.hands.forEach((hand, hi) => {
        const st = chipStack(hand.bet, this.limits.min);
        const to = new THREE.Vector3(this.handX(hi, s.hands.length), 0.86, 0.95);
        this.chips.add(st);
        if (fresh && prev) {
          // Einsatz wird vom Spieler aufs Feld geschoben
          const from = new THREE.Vector3(to.x, 0.95, 1.5);
          st.position.copy(from);
          this.anim.add(0.45, k => { st.position.lerpVectors(from, to, ease.outCubic(k)); st.position.y += Math.sin(k * Math.PI) * 0.12; });
        } else st.position.copy(to);
      });
    } else if (finished) this.settleChips(s);
    if (finished && s.hands.some(hh => hh.result === 'BLACKJACK')) this.blackjackShow();
    this.updateLabels(s);
    if (this.mine && prev && prev.state.phase !== 'done' && s.phase === 'done') {
      const r = s.hands.map(h => h.result);
      say(r.includes('BLACKJACK') ? 'Blackjack!' : handTotal(s.dealer).total > 21 ? 'Dealer bust!' : r.includes('GEWONNEN') ? 'Gewonnen!' : r.every(x => x === 'PUSH') ? 'Push.' : 'Das Haus gewinnt.');
    }
    this.refreshPanel();
  }

  // Auszahlung: Dealer schiebt Gewinnchips dazu und alles gleitet zum Spieler; Verluste sammelt der Dealer ein
  settleChips(s) {
    const dealer = new THREE.Vector3(0, 0.86, -0.42);
    const player = new THREE.Vector3(0, 0.9, 1.55);
    const stacks = [...this.chips.children];
    stacks.forEach((stack, i) => {
      const hand = s.hands[i];
      const r = hand?.result;
      const from = stack.position.clone();
      const done = obj => () => this.chips.remove(obj);
      if (r === 'GEWONNEN' || r === 'BLACKJACK') {
        const pay = chipStack(Math.floor(hand.bet * (r === 'BLACKJACK' ? 1.5 : 1)), this.limits.min);
        const side = from.clone().add(new THREE.Vector3(0.11, 0, 0.02));
        pay.position.copy(dealer);
        this.chips.add(pay);
        this.anim.add(0.5, k => { pay.position.lerpVectors(dealer, side, ease.outCubic(k)); pay.position.y += Math.sin(k * Math.PI) * 0.14; }, null, 0.35);
        this.anim.add(0.55, k => { const e = ease.inOutCubic(k); stack.position.lerpVectors(from, player, e); pay.position.lerpVectors(side, player.clone().add(new THREE.Vector3(0.11, 0, 0)), e); }, () => { done(stack)(); done(pay)(); }, 1.3);
      } else if (r === 'PUSH') {
        this.anim.add(0.5, k => stack.position.lerpVectors(from, player, ease.inOutCubic(k)), done(stack), 0.6);
      } else {
        this.anim.add(0.55, k => { stack.position.lerpVectors(from, dealer, ease.inOutCubic(k)); stack.position.y += Math.sin(k * Math.PI) * 0.06; }, done(stack), 0.5);
      }
    });
  }

  // Blackjack! – goldener Schriftzug über dem Tisch, Goldregen, Licht
  blackjackShow() {
    const t = new TextSprite(1.3, 0.33);
    t.set('★ BLACKJACK! ★', '#ffd700', 'rgba(40,20,0,0.75)');
    t.sprite.position.set(0, 1.5, 0.2);
    this.group.add(t.sprite);
    this.anim.add(2.8, k => {
      const pop = k < 0.12 ? k / 0.12 * 1.25 : 1 + Math.sin(k * 18) * 0.05;
      t.sprite.scale.set(1.3 * pop, 0.33 * pop, 1);
      t.sprite.position.y = 1.5 + k * 0.3;
      t.sprite.material.opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
    }, () => { this.group.remove(t.sprite); t.tex.dispose(); t.sprite.material.dispose(); });
    const w = this.app.world;
    const pos = this.toWorld(new THREE.Vector3(0, 1.6, 0.3));
    if (w?.particles) for (let i = 0; i < 90; i++) {
      w.particles.emit({ pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 0.6, (Math.random() - 0.5) * 1.2)), vel: [(Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2.4], life: 2.5 + Math.random(), size: 0.06, color: i % 3 ? '#ffd700' : '#fff3b0', gravity: 3, type: 'confetti', spin: (Math.random() - 0.5) * 10 });
    }
    w?.flashAt?.(pos, 4);
    const near = this.app.distanceTo(this.group.position) < 12;
    if (near) sfxAt(this.mine ? 1 : 0.6, () => sfx.bigWin());
  }

  updateLabels(s) {
    const visibleDealer = s.dealer.filter(Boolean);
    if (visibleDealer.length) {
      const t = handTotal(visibleDealer).total;
      this.dealerLabel.set(`Dealer ${t > 21 ? 'BUST' : t}`, t > 21 ? '#ff6b6b' : '#ffffff');
    } else this.dealerLabel.set('');
    this.handLabels.forEach((lbl, i) => {
      const hand = s.hands[i];
      if (!hand) { lbl.set(''); return; }
      const t = handTotal(hand.cards);
      const txt = hand.result ? `${hand.result} (${t.total})` : `${t.soft && t.total <= 21 ? 'Soft ' : ''}${t.total}`;
      const col = hand.result === 'GEWONNEN' || hand.result === 'BLACKJACK' ? '#7cff6b' : hand.result === 'PUSH' ? '#ffd97a' : hand.result ? '#ff6b6b' : i === s.active && s.phase === 'player' ? '#ffd97a' : '#ffffff';
      lbl.set(txt, col);
      lbl.sprite.position.set(this.handX(i, s.hands.length), 0.98, 0.82);
    });
  }

  update(dt) { this.dealer.update(dt); }

  buildPanel() {
    this.bet = new BetAmount(this.limits, () => this.app.pot, this.denoms, this.limits.min);
    this.btn = {
      deal: actionButton('DEAL', () => this.start(), 'primary big'),
      hit: actionButton('HIT (H)', () => this.act('hit'), 'primary'),
      stand: actionButton('STAND (S)', () => this.act('stand'), 'primary'),
      double: actionButton('DOUBLE (D)', () => this.act('double')),
      split: actionButton('SPLIT (P)', () => this.act('split')),
      joker: actionButton('🃏 JOKER (J)', () => this.act('joker'), 'item'),
      accept: actionButton('Akzeptieren', () => this.act('accept')),
    };
    this.info = h('div.info');
    this.betWrap = h('div', this.bet.el);
    this.panel = h('div.tablepanel',
      h('div.ptitle', '🃏 BLACKJACK'),
      limitLine(this.limits),
      h('div.phint', 'Blackjack zahlt 2:1 · 5 Karten ohne Bust gewinnen · Dealer steht auf 17'),
      this.info,
      this.betWrap,
      h('div.actions', ...Object.values(this.btn)),
      h('div.keys', 'LEERTASTE = Deal · H/S/D/P · ESC = Aufstehen'),
    );
    this.refreshPanel();
    return this.panel;
  }

  start() { if (this.state && !this.state.busy) { this.app.hands?.play('toss'); this.app.tableStart(this.def.id, { bet: this.bet.value }); } }
  act(a) { this.app.hands?.play('tap'); this.app.tableAction(this.def.id, a); }

  onKey(code) {
    const map = { KeyH: 'hit', KeyS: 'stand', KeyD: 'double', KeyP: 'split', KeyJ: 'joker' };
    if (code === 'Space') { this.start(); return true; }
    if (map[code] && this.state?.state.phase === 'player') { this.act(map[code]); return true; }
    if (code === 'KeyJ' && this.state?.state.phase === 'joker') { this.act('joker'); return true; }
    return false;
  }

  refreshPanel() {
    if (!this.panel || !this.state) return;
    const s = this.state.state;
    const playing = s.phase === 'player';
    const hand = s.hands[s.active];
    const show = (b, v) => { b.style.display = v ? '' : 'none'; };
    show(this.btn.deal, !this.state.busy);
    show(this.betWrap, !this.state.busy);
    show(this.btn.hit, playing);
    show(this.btn.stand, playing);
    show(this.btn.double, playing && hand?.cards.length === 2);
    show(this.btn.split, playing && hand?.cards.length === 2 && cardValue(hand.cards[0]) === cardValue(hand.cards[1]) && s.hands.length < 4);
    show(this.btn.joker, (playing && s.jokerable) || s.phase === 'joker');
    show(this.btn.accept, s.phase === 'joker');
    clear(this.info);
    if (s.phase === 'joker') this.info.append(h('div.warnline', 'BUST! Joker Card einsetzen und die Karte neu ziehen?'));
    else if (s.message) this.info.append(h('div', s.message));
    if (playing && hand) this.info.append(h('div', `Hand ${s.active + 1}/${s.hands.length}: ${handTotal(hand.cards).total} · Einsatz ${fmtMoney(hand.bet)}`));
    this.bet.refresh();
  }
}
