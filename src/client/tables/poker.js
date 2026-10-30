// Casino Hold'em gegen den NPC-Dealer.
import * as THREE from 'three';
import { TableView, halfMoonTable, makeDealer, cardShoe, stool, chipStack, CardSet, TextSprite } from './common.js';
import { printedFelt } from '../textures.js';
import { h, clear } from '../ui/dom.js';
import { BetAmount, actionButton, limitLine } from '../ui/betpanel.js';
import { fmtMoney } from '../../shared/config.js';

const fx = x => x / 1024 * 2.5 - 1.25;
const fz = y => y / 512 * 1.6 - 0.35;

export class PokerView extends TableView {
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
    g.add(halfMoonTable(printedFelt('poker'), this.tier));
    this.shoePos = new THREE.Vector3(0.85, 0.9, -0.12);
    const shoe = cardShoe(); shoe.position.set(0.85, 0.82, -0.12); shoe.rotation.y = -0.4; g.add(shoe);
    this.cards = new CardSet(this, this.shoePos);
    this.dealer = makeDealer(this.tier, this.def.index + 7);
    this.dealer.root.position.set(0, 0, -0.95);
    g.add(this.dealer.root);
    // NPC-Mitspieler für Atmosphäre
    for (let i = -1; i <= 1; i += 2) { const s = stool(this.tier); s.position.set(i * 0.75, 0, 1.2); s.scale.setScalar(0.85); g.add(s); }
    const s0 = stool(this.tier); s0.position.set(0, 0, 1.45); s0.scale.setScalar(0.85); g.add(s0);
    this.chips = new THREE.Group(); g.add(this.chips);
    this.pLabel = new TextSprite(0.6, 0.13); this.pLabel.sprite.position.set(0, 0.98, 1.05); g.add(this.pLabel.sprite);
    this.dLabel = new TextSprite(0.6, 0.13); this.dLabel.sprite.position.set(0, 1.02, 0.12); g.add(this.dLabel.sprite);
    this.rLabel = new TextSprite(0.9, 0.18); this.rLabel.sprite.position.set(0, 1.2, 0.35); g.add(this.rLabel.sprite);
  }

  onState(ts, prev) {
    const s = ts.state;
    if (prev && prev.state.dealId !== s.dealId) { this.cards.clear(true); this.rLabel.set(''); }
    if (!prev && s.phase === 'idle' && !s.player.length) { this.refreshPanel(); return; }
    const items = [];
    s.player.forEach((c, i) => items.push({ key: `p${i}`, card: c, pos: new THREE.Vector3(-0.1 + i * 0.19, 0.86, 0.8) }));
    s.dealer.forEach((c, i) => items.push({ key: `d${i}`, card: c, pos: new THREE.Vector3(-0.1 + i * 0.19, 0.86, -0.08) }));
    s.board.forEach((c, i) => items.push({ key: `b${i}`, card: c, pos: new THREE.Vector3(fx(312 + i * 100), 0.86, fz(286)) }));
    this.cards.sync(items, { delayStep: 0.18 });
    clear(this.chips);
    if (s.ante) { const a = chipStack(s.ante, this.limits.min); a.position.set(fx(380), 0.86, fz(430)); this.chips.add(a); }
    if (s.call) { const c = chipStack(s.call, this.limits.min); c.position.set(fx(644), 0.86, fz(430)); this.chips.add(c); }
    this.pLabel.set(s.playerHand ? `Du: ${s.playerHand}` : '');
    this.dLabel.set(s.dealerHand ? `Dealer: ${s.dealerHand}` : '');
    if (s.result) this.rLabel.set(s.result, s.result.includes('GEWONNEN') || s.result.includes('QUALIFIZIERT') ? '#7cff6b' : s.result === 'PUSH' ? '#ffd97a' : '#ff6b6b');
    this.dealer.setAnim(s.phase === 'decide' || s.phase === 'showdown' ? 'deal' : 'idle');
    setTimeout(() => this.dealer.setAnim('idle'), 1000);
    this.refreshPanel();
  }

  update(dt) { this.dealer.update(dt); }

  buildPanel() {
    this.bet = new BetAmount(this.limits, () => this.app.pot, this.denoms, this.limits.min);
    this.btn = {
      deal: actionButton('DEAL (Ante)', () => this.start(), 'primary big'),
      call: actionButton('CALL (C)', () => this.act('call'), 'primary'),
      fold: actionButton('FOLD (F)', () => this.act('fold')),
    };
    this.info = h('div.info');
    this.betWrap = h('div', this.bet.el);
    this.panel = h('div.tablepanel',
      h('div.ptitle', "♠️ CASINO HOLD'EM"),
      limitLine(this.limits, ' (Ante) · Call = 2× Ante'),
      h('div.phint', 'Dealer qualifiziert sich erst ab einem Paar Sechsen. Ante zahlt bis 100:1 (Royal Flush).'),
      this.info,
      this.betWrap,
      h('div.actions', ...Object.values(this.btn)),
      h('div.keys', 'LEERTASTE = Deal · C = Call · F = Fold · ESC = Aufstehen'),
    );
    this.refreshPanel();
    return this.panel;
  }

  start() { if (this.state && !this.state.busy) { this.app.hands?.play('toss'); this.app.tableStart(this.def.id, { bet: this.bet.value }); } }
  act(a) { this.app.hands?.play('tap'); this.app.tableAction(this.def.id, a); }

  onKey(code) {
    if (code === 'Space') { this.start(); return true; }
    if (this.state?.state.phase === 'decide') {
      if (code === 'KeyC') { this.act('call'); return true; }
      if (code === 'KeyF') { this.act('fold'); return true; }
    }
    return false;
  }

  refreshPanel() {
    if (!this.panel || !this.state) return;
    const s = this.state.state;
    const show = (b, v) => { b.style.display = v ? '' : 'none'; };
    show(this.btn.deal, !this.state.busy);
    show(this.betWrap, !this.state.busy);
    show(this.btn.call, s.phase === 'decide');
    show(this.btn.fold, s.phase === 'decide');
    clear(this.info);
    if (s.phase === 'decide') this.info.append(h('div', `Deine Hand: ${s.playerHand} · CALL kostet ${fmtMoney(s.ante * 2)}`));
    else if (s.result) this.info.append(h('div', `${s.playerHand} vs. ${s.dealerHand}: ${s.result}`));
    this.bet.refresh();
  }
}
