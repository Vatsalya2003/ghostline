import { CONTROL } from '../systems/Gamepad.js';

// One binding table, read by three things: the keyboard handler, the on-screen
// prompt strip, and the CONTROLS pane in the pause menu. Keeping them on one
// source means a rebind can never leave the screen lying about what a key does.
//
// `pad` is the face label, not an index — indices live in Gamepad.js, which is
// the only place that has to care what number a button is.
export const BINDINGS = [
  { control: CONTROL.CONFIRM,   name: 'CONFIRM / SELECT', pad: 'A',      keys: ['Enter', ' '],        keyGlyph: 'ENTER' },
  { control: CONTROL.CANCEL,    name: 'CANCEL / BACK',    pad: 'B',      keys: ['Escape'],            keyGlyph: 'ESC' },
  { control: CONTROL.CONTEXT,   name: 'ASK WHY',          pad: 'X',      keys: ['x'],                 keyGlyph: 'X' },
  { control: CONTROL.TACTICAL,  name: 'TACTICAL VIEW',    pad: 'Y',      keys: ['v'],                 keyGlyph: 'V', hold: true },
  { control: CONTROL.PREV_UNIT, name: 'PREVIOUS UNIT',    pad: 'LB',     keys: [],                    keyGlyph: 'SHIFT+TAB' },
  { control: CONTROL.NEXT_UNIT, name: 'NEXT UNIT',        pad: 'RB',     keys: [],                    keyGlyph: 'TAB' },
  { control: CONTROL.ZOOM_OUT,  name: 'ZOOM OUT',         pad: 'LT',     keys: ['q'],                 keyGlyph: 'Q' },
  { control: CONTROL.ZOOM_IN,   name: 'ZOOM IN',          pad: 'RT',     keys: ['e'],                 keyGlyph: 'E' },
  { control: CONTROL.INFO,      name: 'MISSION INFO',     pad: 'BACK',   keys: ['i'],                 keyGlyph: 'I' },
  { control: CONTROL.PAUSE,     name: 'PAUSE',            pad: 'START',  keys: ['p'],                 keyGlyph: 'P' },
  { control: CONTROL.NAV_UP,    name: 'NAVIGATE',         pad: 'D-PAD',  keys: ['ArrowUp'],           keyGlyph: 'ARROWS' },
  { control: CONTROL.NAV_DOWN,  name: 'NAVIGATE',         pad: 'D-PAD',  keys: ['ArrowDown'],         keyGlyph: 'ARROWS' },
  { control: CONTROL.NAV_LEFT,  name: 'NAVIGATE',         pad: 'D-PAD',  keys: ['ArrowLeft'],         keyGlyph: 'ARROWS' },
  { control: CONTROL.NAV_RIGHT, name: 'NAVIGATE',         pad: 'D-PAD',  keys: ['ArrowRight'],        keyGlyph: 'ARROWS' },
];

// Camera is analog on a pad and held keys on a keyboard, so it is not a
// discrete control — but it still needs a prompt and a row in the help.
export const CAMERA_BINDING = { name: 'MOVE CAMERA', pad: 'R-STICK', keyGlyph: 'W A S D' };
export const SELECT_BINDING = { name: 'PICK COMMAND', pad: 'D-PAD', keyGlyph: '1-9' };

const BY_CONTROL = new Map(BINDINGS.map((b) => [b.control, b]));

// key (lowercased for letters) -> control. Built from the same table.
export const KEY_TO_CONTROL = (() => {
  const map = new Map();
  for (const b of BINDINGS) {
    for (const k of b.keys) map.set(k.length === 1 ? k.toLowerCase() : k, b.control);
  }
  return map;
})();

export const HOLD_CONTROLS = new Set(BINDINGS.filter((b) => b.hold).map((b) => b.control));

export function glyphFor(control, device) {
  const b = BY_CONTROL.get(control);
  if (!b) return '?';
  return device === 'pad' ? b.pad : b.keyGlyph;
}

export function nameFor(control) { return BY_CONTROL.get(control)?.name || control; }

// The prompt strip along the bottom. Rebuilt whenever the context or the
// active device changes — which is what makes CONFIRM [ENTER] become
// CONFIRM [A] the moment a stick moves.
export class Prompts {
  constructor() {
    this.el = document.getElementById('prompt-bar');
    this.device = 'kbd';
    this.items = [];
    this.note = '';
  }

  setDevice(device) {
    if (this.device === device) return false;
    this.device = device;
    document.body.classList.toggle('pad-active', device === 'pad');
    this.paint();
    return true;
  }

  // items: [{ control, label }] or [{ glyph, label }] for the analog ones.
  show(items) {
    this.items = items.filter(Boolean);
    this.paint();
  }

  setNote(text) {
    this.note = text || '';
    this.paint();
  }

  paint() {
    if (!this.el) return;
    const chips = this.items.map(({ control, glyph, label }) => {
      const g = glyph ? (this.device === 'pad' ? glyph.pad : glyph.keyGlyph) : glyphFor(control, this.device);
      return `<span class="prompt"><b>${g}</b>${label}</span>`;
    });
    this.el.innerHTML = chips.join('')
      + (this.note ? `<span class="prompt-note">${this.note}</span>` : '');
  }
}
