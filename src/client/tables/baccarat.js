// Baccarat-Tisch: Player / Banker / Tie mit echter Kartenanimation.
import * as THREE from 'three';
import { TableView, halfMoonTable, makeDealer, cardShoe, stool, chipStack, CardSet, TextSprite } from './common.js';
import { printedFelt } from '../textures.js';
import { bacTotal } from '../../shared/games/baccarat.js';
import { h, clear } from '../ui/dom.js';
import { ChipPicker, actionButton, limitLine } from '../ui/betpanel.js';
import { fmtMoney } from '../../shared/config.js';
import { sfx, say } from '../audio.js';

const SPOTS = { player: [250, 355], tie: [512, 355], banker: [774, 355] };
const toLocal = (x, y) => new THREE.Vector3(x / 1024 * 2.5 - 1.25, 0.86, y / 512 * 1.6 - 0.35);

export class BaccaratView extends TableView {
  constructor(app, def, floor) {
    super(app, def, floor);
    this.seatLocal.set(0, 0, 1.5);
    this.camLocal.set(0, 1.95, 1.55);
    this.lookLocal.set(0, 0.8, 0.2);
    this.footprint = { w: 2.7, d: 1.8, oz: 0.4 };
    this.pending = {};
    this.last = null;
    this.build();
  }

  build() {
    const g = this.group;
    const table = halfMoonTable(printedFelt('baccarat'), this.tier);
    this.felt = table.children[0];
    g.add(table);
    this.shoePos = new THREE.Vector3(0.85, 0.9, -0.12);
    const shoe = cardShoe(); shoe.position.set(0.85, 0.82, -0.12); shoe.rotation.y = -0.4; g.add(shoe);
    this.cards = new CardSet(this, this.shoePos);
    this.dealer = makeDealer(this.tier, this.def.index + 5);
    this.dealer.root.position.set(0, 0, -0.95);
    g.add(this.dealer.root);
    for (let i = -1; i <= 1; i++) { const s = stool(this.tier); s.position.set(i * 0.75, 0, 1.45 - Math.abs(i) * 0.25); s.scale.setScalar(0.85); g.add(s); }
    this.chips = new THREE.Group(); g.add(this.chips);
    this.pLabel = new TextSprite(0.5, 0.12); this.pLabel.sprite.position.set(-0.45, 1.0, 0.45); g.add(this.pLabel.sprite);
    this.bLabel = new TextSprite(0.5, 0.12); this.bLabel.sprite.position.set(0.45, 1.0, 0.45); g.add(this.bLabel.sprite);
    this.winLabel = new TextSprite(0.8, 0.18); this.winLabel.sprite.position.set(0, 1.2, 0.1); g.add(this.winLabel.sprite);
  }

  renderChips(bets) {
    clear(this.chips);
    for (const [k, v] of Object.entries(bets)) {
      if (!v) continue;
      const st = chipStack(v, this.limits.min);
      st.position.copy(toLocal(...SPOTS[k]));
      this.chips.add(st);
    }
  }

  onState(ts, prev) {
    const s = ts.state;
    if (prev && prev.state.dealId !== s.dealId) {
      this.cards.clear(true);
      this.winLabel.set(''); this.pLabel.set(''); this.bLabel.set('');
      this.renderChips(s.bets);
      if (this.mine) { this.last = { ...this.pending }; this.pending = {}; }
      const items = [];
      const n = Math.max(s.player.length, s.banker.length);
      for (let i = 0; i < n; i++) {
        if (s.player[i]) items.push({ key: `p${i}`, card: s.player[i], pos: new THREE.Vector3(-0.62 + i * 0.19, 0.86, 0.22), rotY: i === 2 ? Math.PI / 2 : 0 });
        if (s.banker[i]) items.push({ key: `b${i}`, card: s.banker[i], pos: new THREE.Vector3(0.24 + i * 0.19, 0.86, 0.22), rotY: i === 2 ? Math.PI / 2 : 0 });
      }
      this.cards.sync(items, { delayStep: 0.65 });
      this.dealer.setAnim('deal');
      const showAt = (count, side) => setTimeout(() => {
        const cards = side === 'p' ? s.player : s.banker;
        const lbl = side === 'p' ? this.pLabel : this.bLabel;
        lbl.set(`${side === 'p' ? 'Player' : 'Banker'} ${bacTotal(cards.slice(0, count))}`);
      }, 1800 + 650 * (count * 2 - (side === 'p' ? 1 : 0)));
      showAt(2, 'p'); showAt(2, 'b');
      if (s.player[2]) showAt(3, 'p');
      if (s.banker[2]) showAt(3, 'b');
    }
    if (prev && !prev.state.winner && s.winner) {
      this.dealer.setAnim('idle');
      const col = { player: '#4cc9f0', banker: '#ff6b6b', tie: '#7cff6b' }[s.winner];
      this.winLabel.set(s.winner === 'tie' ? 'TIE!' : `${s.winner.toUpperCase()} GEWINNT`, col);
      if (this.mine) say(s.winner === 'tie' ? 'Égalité!' : s.winner === 'player' ? 'Player gewinnt' : 'Banker gewinnt');
      this.pLabel.set(`Player ${bacTotal(s.player)}`);
      this.bLabel.set(`Banker ${bacTotal(s.banker)}`);
      setTimeout(() => { if (!this.state?.busy) this.renderChips(this.mine ? this.pending : {}); }, 2500);
    }
    this.refreshPanel();
  }

  update(dt) { this.dealer.update(dt); }

  spotAt(raycaster) {
    const hit = raycaster.intersectObject(this.felt)[0];
    if (!hit?.uv) return null;
    const x = hit.uv.x * 1024, y = (1 - hit.uv.y) * 512;
    for (const [k, [cx, cy]] of Object.entries(SPOTS)) if (Math.abs(x - cx) < 120 && Math.abs(y - cy) < 55) return k;
    return null;
  }

  hover(raycaster) { if (!this.mine || this.state?.busy) return null; const s = this.spotAt(raycaster); return s ? s.toUpperCase() : null; }

  pick(raycaster, button) {
    if (!this.mine || this.state?.busy) return false;
    const spot = this.spotAt(raycaster);
    if (!spot) return false;
    this.addBet(spot, button === 2);
    return true;
  }

  addBet(spot, remove) {
    if (remove) delete this.pending[spot];
    else {
      const max = spot === 'tie' ? this.limits.tieMax : this.limits.max;
      this.pending[spot] = Math.min(max, (this.pending[spot] || 0) + this.picker.value);
      this.app.hands?.play('toss');
    }
    sfx.chip();
    this.renderChips(this.pending);
    this.refreshPanel();
  }

  buildPanel() {
    this.picker = new ChipPicker(this.denoms, this.limits.min);
    this.totalEl = h('div.betval');
    this.listEl = h('div.betlist');
    this.dealBtn = actionButton('DEAL', () => this.deal(), 'primary big');
    this.panel = h('div.tablepanel',
      h('div.ptitle', '🂡 BACCARAT'),
      limitLine(this.limits, ` · Tie max ${fmtMoney(this.limits.tieMax)}`),
      h('div.phint', 'Player 1:1 · Banker 0.95:1 · Tie 8:1 – Chip wählen und Feld anklicken'),
      this.picker.el,
      h('div.quick',
        h('button.small.blue', { onclick: () => this.addBet('player') }, 'PLAYER'),
        h('button.small.green', { onclick: () => this.addBet('tie') }, 'TIE'),
        h('button.small.red', { onclick: () => this.addBet('banker') }, 'BANKER'),
      ),
      h('div.betrow', h('span', 'Einsatz:'), this.totalEl),
      this.listEl,
      h('div.actions',
        actionButton('Löschen', () => { this.pending = {}; this.renderChips({}); this.refreshPanel(); }),
        actionButton('Wiederholen', () => { if (this.last) { this.pending = { ...this.last }; this.renderChips(this.pending); this.refreshPanel(); } }),
        this.dealBtn,
      ),
      h('div.keys', 'LEERTASTE = Deal · ESC = Aufstehen'),
    );
    this.refreshPanel();
    return this.panel;
  }

  deal() {
    if (this.state?.busy) return;
    if (!Object.keys(this.pending).length) { this.app.ui.toast('Setze auf Player, Banker oder Tie', 'warn'); return; }
    this.app.tableStart(this.def.id, { bets: this.pending });
  }

  onKey(code) { if (code === 'Space') { this.deal(); return true; } return false; }

  refreshPanel() {
    if (!this.panel) return;
    const total = Object.values(this.pending).reduce((a, b) => a + b, 0);
    this.totalEl.textContent = fmtMoney(total);
    this.totalEl.classList.toggle('danger', total > this.app.pot);
    clear(this.listEl);
    for (const [k, v] of Object.entries(this.pending)) this.listEl.append(h('span.tag', `${k.toUpperCase()}: ${fmtMoney(v)}`));
    this.dealBtn.disabled = !!this.state?.busy;
  }
}
