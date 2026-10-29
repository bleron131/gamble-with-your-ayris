// Einsatz-Steuerung für Tische: Chip-Auswahl, Einsatzbetrag, Schnellwahl.
import { h, clear } from './dom.js';
import { fmtMoney, fmtShort } from '../../shared/config.js';
import { chipColorFor } from '../textures.js';
import { sfx } from '../audio.js';

export class ChipPicker {
  constructor(denoms, base, onChange) {
    this.denoms = denoms;
    this.value = denoms[Math.min(1, denoms.length - 1)];
    this.base = base;
    this.onChange = onChange;
    this.el = h('div.chips');
    this.render();
  }
  render() {
    clear(this.el);
    for (const d of this.denoms) {
      const b = h('button.chip', {
        style: { '--chip': chipColorFor(d, this.base) },
        class: d === this.value ? 'sel' : '',
        title: fmtMoney(d),
        onclick: () => { this.value = d; sfx.chip(); this.render(); this.onChange?.(d); },
      }, fmtShort(d).replace('$', ''));
      this.el.append(b);
    }
  }
}

// Einzel-Einsatz (Slots, Blackjack, Poker)
export class BetAmount {
  constructor(limits, getPot, denoms, base) {
    this.limits = limits;
    this.getPot = getPot;
    this.value = limits.min;
    this.picker = new ChipPicker(denoms, base, d => this.add(d));
    this.display = h('div.betval');
    this.el = h('div.betamount',
      h('div.betrow',
        h('button.small', { onclick: () => this.set(this.limits.min), title: 'Minimum' }, 'MIN'),
        h('button.small', { onclick: () => this.set(Math.floor(this.value / 2)) }, '½'),
        this.display,
        h('button.small', { onclick: () => this.set(this.value * 2) }, '×2'),
        h('button.small', { onclick: () => this.set(Math.min(this.limits.max, this.getPot())), title: 'Maximum' }, 'MAX'),
      ),
      h('div.hint', 'Chip klicken = Einsatz erhöhen'),
      this.picker.el,
    );
    this.picker.value = null;
    this.picker.render();
    this.refresh();
  }
  add(d) { this.set((this.fresh ? 0 : this.value) + d); this.fresh = false; }
  set(v) {
    v = Math.floor(v);
    this.value = Math.max(this.limits.min, Math.min(this.limits.max, v));
    this.refresh();
  }
  refresh() {
    const pot = this.getPot();
    this.display.textContent = fmtMoney(this.value);
    this.display.classList.toggle('danger', this.value > pot);
    this.display.classList.toggle('risky', this.value >= pot * 0.25 && this.value <= pot);
  }
}

export function limitLine(limits, extra = '') {
  return h('div.limits', `Tischlimit ${fmtMoney(limits.min)} – ${fmtMoney(limits.max)}${extra}`);
}

export function actionButton(label, onclick, cls = '') {
  return h('button.action', { class: cls, onclick: e => { sfx.click(); onclick(e); } }, label);
}
