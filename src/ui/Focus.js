// One focus ring, reused by every list the player can move through: the
// command bar, the pause menu, and the single-button screens. Keeping it in
// one place is what lets the D-pad, the arrow keys and the mouse all agree on
// which thing is currently selected.
export class FocusRing {
  constructor({ onFocus = null, wrap = true } = {}) {
    this.items = [];
    this.index = 0;
    this.onFocus = onFocus;
    this.wrap = wrap;
  }

  setItems(elements) {
    this.items = [...elements];
    if (this.index >= this.items.length) this.index = 0;
    if (!this.isSelectable(this.index)) this.index = this.firstSelectable();
    this.paint();
  }

  isSelectable(i) {
    const el = this.items[i];
    return !!el && !el.disabled && !el.hidden;
  }

  firstSelectable() {
    for (let i = 0; i < this.items.length; i++) if (this.isSelectable(i)) return i;
    return 0;
  }

  get current() { return this.items[this.index] || null; }
  get count() { return this.items.length; }

  // Skips disabled entries, so a greyed-out NO DRONES never swallows a press.
  move(delta) {
    if (!this.items.length) return false;
    let i = this.index;
    for (let n = 0; n < this.items.length; n++) {
      i += delta;
      if (i < 0 || i >= this.items.length) {
        if (!this.wrap) return false;
        i = (i + this.items.length) % this.items.length;
      }
      if (this.isSelectable(i)) break;
    }
    if (i === this.index) return false;
    this.index = i;
    this.paint();
    this.onFocus?.(this.current, this.index);
    return true;
  }

  // Used when the mouse hovers something: the ring follows the pointer so the
  // two input methods never show two different selections.
  focusElement(el) {
    const i = this.items.indexOf(el);
    if (i < 0 || i === this.index || !this.isSelectable(i)) return false;
    this.index = i;
    this.paint();
    return true;
  }

  activate() {
    const el = this.current;
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }

  paint() {
    this.items.forEach((el, i) => {
      const on = i === this.index && this.isSelectable(i);
      el.classList.toggle('focused', on);
      // Real DOM focus as well, so screen readers and the browser's own
      // keyboard handling stay in step with the painted ring.
      if (on && document.activeElement !== el && el.isConnected) {
        try { el.focus({ preventScroll: true }); } catch { /* detached */ }
      }
    });
  }

  clear() {
    this.items.forEach((el) => el.classList.remove('focused'));
    this.items = [];
    this.index = 0;
  }
}
