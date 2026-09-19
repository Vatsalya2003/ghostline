import { ACTION_LABELS } from '../data/mission1.js';
import { audio } from '../systems/Audio.js';
import { FocusRing } from './Focus.js';

// Only the actions this turn allows, straight from mission data.
export class CommandBar {
  constructor(onChoose) {
    this.el = document.getElementById('commands');
    this.onChoose = onChoose;
    this.buttons = [];
    this.locked = true;
    // Shared with the pause menu and the title screens, so the D-pad behaves
    // identically everywhere and the mouse moves the same ring it highlights.
    this.ring = new FocusRing({ onFocus: () => audio.hover() });
  }

  get focusIndex() { return this.ring.index; }

  render(entries, { padHints = false } = {}) {
    this.el.innerHTML = '';
    this.buttons = entries.map(({ action, disabled, reason, probe, hint }, i) => {
      const btn = document.createElement('button');
      btn.className = 'cmd' + (probe ? ' probe' : '') + (padHints && hint ? ' pad' : '');
      btn.disabled = !!disabled || this.locked;
      // Remember *why* the button is off. setLocked() re-enables everything on
      // unlock, and has to leave the ones this turn disabled on its own —
      // no drones left, probe already spent — switched off.
      btn.dataset.disabled = String(!!disabled);
      btn.dataset.action = action;
      // The number is the keyboard shortcut and the D-pad position at once,
      // so the printed order on screen is the order the stick walks.
      btn.innerHTML = `<span class="key">${i + 1}</span>${ACTION_LABELS[action] || action}` +
        (reason ? `<span class="hint">${reason}</span>` : hint ? `<span class="hint">${hint}</span>` : '');
      btn.addEventListener('click', () => this.choose(action));
      btn.addEventListener('pointerenter', () => {
        if (btn.disabled) return;
        // Pointer and pad share one selection — never show two highlights.
        // focusElement returns false when the ring was already here, so the
        // tick fires on a real move and not on every pixel of mouse travel.
        // (The ring's own onFocus covers pad and arrow keys; it deliberately
        // does not fire here, because the number-key shortcut focuses the
        // button before clicking it and would tick on the way past.)
        if (this.ring.focusElement(btn)) audio.hover();
      });
      this.el.appendChild(btn);
      return btn;
    });
    this.ring.index = 0;
    this.ring.setItems(this.buttons);
  }

  choose(action) {
    if (this.locked) return;
    // Visual receipt for the order. The room is loud at a jam; the audio
    // confirm cannot be the only feedback that the press registered.
    const btn = this.buttons.find((b) => b.dataset.action === action);
    if (btn) {
      btn.classList.remove('committed');
      void btn.offsetWidth;
      btn.classList.add('committed');
      setTimeout(() => btn.classList.remove('committed'), 400);
    }
    this.onChoose(action);
  }

  setLocked(locked) {
    this.locked = locked;
    for (const b of this.buttons) {
      const naturallyDisabled = b.dataset.disabled === 'true';
      b.disabled = locked || naturallyDisabled;
    }
    // Re-seat the ring: unlocking changes which entries are selectable.
    this.ring.setItems(this.buttons);
  }

  // Gamepad D-pad navigation shares the same focus ring the mouse hovers.
  moveFocus(delta) { this.ring.move(delta); }

  activateFocused() {
    const btn = this.ring.current;
    if (btn && !btn.disabled) this.choose(btn.dataset.action);
  }

  paintFocus() { this.ring.paint(); }

  clear() { this.el.innerHTML = ''; this.buttons = []; this.ring.clear(); }
}
