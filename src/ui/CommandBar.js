import { ACTION_LABELS } from '../data/mission1.js';

// Only the actions this turn allows, straight from mission data.
export class CommandBar {
  constructor(onChoose) {
    this.el = document.getElementById('commands');
    this.onChoose = onChoose;
    this.buttons = [];
    this.focusIndex = 0;
    this.locked = true;
  }

  render(entries, { padHints = false } = {}) {
    this.el.innerHTML = '';
    this.buttons = entries.map(({ action, disabled, reason, probe, hint }) => {
      const btn = document.createElement('button');
      btn.className = 'cmd' + (probe ? ' probe' : '') + (padHints && hint ? ' pad' : '');
      btn.disabled = !!disabled || this.locked;
      btn.dataset.action = action;
      btn.innerHTML = `${ACTION_LABELS[action] || action}` +
        (reason ? `<span class="hint">${reason}</span>` : hint ? `<span class="hint">${hint}</span>` : '');
      btn.addEventListener('click', () => this.choose(action));
      this.el.appendChild(btn);
      return btn;
    });
    this.focusIndex = this.buttons.findIndex((b) => !b.disabled);
    this.paintFocus();
  }

  choose(action) {
    if (this.locked) return;
    this.onChoose(action);
  }

  setLocked(locked) {
    this.locked = locked;
    for (const b of this.buttons) {
      const naturallyDisabled = b.dataset.disabled === 'true';
      b.disabled = locked || naturallyDisabled;
    }
    if (!locked) this.paintFocus();
  }

  // Gamepad D-pad navigation shares the same focus ring the mouse hovers.
  moveFocus(delta) {
    if (!this.buttons.length) return;
    let i = this.focusIndex;
    for (let n = 0; n < this.buttons.length; n++) {
      i = (i + delta + this.buttons.length) % this.buttons.length;
      if (!this.buttons[i].disabled) break;
    }
    this.focusIndex = i;
    this.paintFocus();
  }

  activateFocused() {
    const btn = this.buttons[this.focusIndex];
    if (btn && !btn.disabled) this.choose(btn.dataset.action);
  }

  paintFocus() {
    this.buttons.forEach((b, i) => b.classList.toggle('focused', i === this.focusIndex && !b.disabled));
  }

  clear() { this.el.innerHTML = ''; this.buttons = []; }
}
