// Pad interpretation, kept free of DOM and of game concepts on purpose: it
// takes raw Gamepad snapshots in and gives semantic controls out. That makes
// it the one piece of the input path that can be tested headlessly —
// `node scripts/input-test.mjs` drives it with synthetic pads.
//
// Layout note. `suggestion-bug.md` #2 was open because the old map hard-coded
// one controller's indices. The Gamepad API already solves this: a pad that
// reports `mapping === 'standard'` is *guaranteed* by spec to use the index
// table below (Xbox/XInput, DualShock, DualSense, 8BitDo and most others in
// Chrome and Firefox). So we trust `standard` and treat anything else as
// unverified — heuristics first, then a remap the player can run themselves.

export const CONTROL = {
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
  CONTEXT: 'context',
  TACTICAL: 'tactical',
  PREV_UNIT: 'prevUnit',
  NEXT_UNIT: 'nextUnit',
  ZOOM_OUT: 'zoomOut',
  ZOOM_IN: 'zoomIn',
  ROTATE_LEFT: 'rotateLeft',
  ROTATE_RIGHT: 'rotateRight',
  INFO: 'info',
  PAUSE: 'pause',
  NAV_UP: 'navUp',
  NAV_DOWN: 'navDown',
  NAV_LEFT: 'navLeft',
  NAV_RIGHT: 'navRight',
};

// Controls that repeat while held. Everything else fires once per press —
// a held A must not spend six turns for you.
export const REPEATING = new Set([
  CONTROL.NAV_UP, CONTROL.NAV_DOWN, CONTROL.NAV_LEFT, CONTROL.NAV_RIGHT,
]);

// W3C Gamepad "standard" button indices. Not a guess — this is the spec table.
export const STANDARD_BUTTONS = {
  0: CONTROL.CONFIRM,      // A / cross
  1: CONTROL.CANCEL,       // B / circle
  2: CONTROL.CONTEXT,      // X / square
  3: CONTROL.TACTICAL,     // Y / triangle
  4: CONTROL.ROTATE_LEFT,  // LB / L1
  5: CONTROL.ROTATE_RIGHT, // RB / R1
  6: CONTROL.ZOOM_OUT,     // LT / L2
  7: CONTROL.ZOOM_IN,      // RT / R2
  8: CONTROL.INFO,         // Back / Select / Share
  9: CONTROL.PAUSE,        // Start / Options
  10: CONTROL.PREV_UNIT,   // L3 — displaced from L1 by the view rotation
  11: CONTROL.NEXT_UNIT,   // R3
  12: CONTROL.NAV_UP,
  13: CONTROL.NAV_DOWN,
  14: CONTROL.NAV_LEFT,
  15: CONTROL.NAV_RIGHT,
};

// Which controls a remap walks through, in order. Sticks are not remappable —
// axes 0-3 are stable in a way face buttons are not.
export const REMAP_ORDER = [
  CONTROL.CONFIRM, CONTROL.CANCEL, CONTROL.CONTEXT, CONTROL.TACTICAL,
  CONTROL.ROTATE_LEFT, CONTROL.ROTATE_RIGHT,
  CONTROL.PREV_UNIT, CONTROL.NEXT_UNIT, CONTROL.ZOOM_OUT, CONTROL.ZOOM_IN,
  CONTROL.INFO, CONTROL.PAUSE,
];

export const CONTROL_NAME = {
  [CONTROL.CONFIRM]: 'CONFIRM / SELECT',
  [CONTROL.CANCEL]: 'CANCEL / BACK',
  [CONTROL.CONTEXT]: 'ASK WHY',
  [CONTROL.TACTICAL]: 'TACTICAL VIEW',
  [CONTROL.PREV_UNIT]: 'PREVIOUS UNIT',
  [CONTROL.NEXT_UNIT]: 'NEXT UNIT',
  [CONTROL.ZOOM_OUT]: 'ZOOM OUT',
  [CONTROL.ZOOM_IN]: 'ZOOM IN',
  [CONTROL.ROTATE_LEFT]: 'ROTATE VIEW LEFT',
  [CONTROL.ROTATE_RIGHT]: 'ROTATE VIEW RIGHT',
  [CONTROL.INFO]: 'MISSION INFO',
  [CONTROL.PAUSE]: 'PAUSE',
};

const DEFAULTS = {
  // Sticks rest a long way from centre on worn pads; 0.28 clears every drifting
  // stick tested in the API docs without eating deliberate small pushes.
  deadzone: 0.28,
  // Saturate before the physical limit so a corner press still reaches 1.0.
  saturation: 0.95,
  // Hysteresis: a stick has to cross `navOn` to step the menu and fall back
  // under `navOff` before it can step again. Without the gap it chatters.
  navOn: 0.55,
  navOff: 0.35,
  triggerOn: 0.5,
  triggerOff: 0.3,
  repeatDelay: 420,
  repeatRate: 140,
};

// Radial deadzone with re-normalisation, applied to the pair — per-axis
// deadzones make diagonals feel square and let a drifting X leak through
// while Y is held.
function applyStick(x, y, { deadzone, saturation }) {
  const mag = Math.hypot(x, y);
  if (mag < deadzone) return { x: 0, y: 0, mag: 0 };
  const scaled = Math.min(1, (mag - deadzone) / (saturation - deadzone));
  return { x: (x / mag) * scaled, y: (y / mag) * scaled, mag: scaled };
}

// Cubic response: small pushes stay small, so a nudge of the camera is
// actually a nudge. Sign-preserving.
export function curve(v) { return v * v * v; }

function isPressed(button) {
  if (button == null) return false;
  if (typeof button === 'number') return button > 0.5;
  return !!button.pressed || (button.value ?? 0) > 0.5;
}

function valueOf(button) {
  if (button == null) return 0;
  if (typeof button === 'number') return button;
  if (typeof button.value === 'number') return button.value;
  return button.pressed ? 1 : 0;
}

// Some Linux/DirectInput pads report the D-pad as a hat switch on a ninth axis
// instead of buttons 12-15. Eight compass positions, -1 = up, wrapping
// clockwise, and a rest value outside [-1,1] (usually 3.286).
function hatToControls(v) {
  if (!(v >= -1.05 && v <= 1.05)) return [];
  // Eight positions spread over [-1, 1] means seven gaps, not eight. Dividing
  // by 8 drifts by half a step and lands "down" on "down-left".
  const eighth = Math.round((v + 1) * 3.5) % 8;
  return [
    [CONTROL.NAV_UP], [CONTROL.NAV_UP, CONTROL.NAV_RIGHT], [CONTROL.NAV_RIGHT],
    [CONTROL.NAV_DOWN, CONTROL.NAV_RIGHT], [CONTROL.NAV_DOWN],
    [CONTROL.NAV_DOWN, CONTROL.NAV_LEFT], [CONTROL.NAV_LEFT],
    [CONTROL.NAV_UP, CONTROL.NAV_LEFT],
  ][eighth] || [];
}

export class PadReader {
  constructor(options = {}) {
    this.opt = { ...DEFAULTS, ...options };
    this.held = new Map();      // control -> { since, nextRepeat }
    this.padIds = new Map();    // pad index -> descriptor
    this.overrides = {};        // padId -> { buttonIndex: control }
    this.capture = null;        // { resolve } while a remap is listening
    this.axes = { panX: 0, panY: 0, zoom: 0 };
    this.lastPadId = null;
  }

  // A remap override survives as a plain object so the caller can persist it
  // however it likes (localStorage, in our case).
  setOverride(padId, map) {
    if (map && Object.keys(map).length) this.overrides[padId] = map;
    else delete this.overrides[padId];
  }

  buttonMap(padId) {
    return this.overrides[padId] || STANDARD_BUTTONS;
  }

  // Ask the next fresh button press to report its raw index instead of acting.
  beginCapture(onCapture) { this.capture = onCapture; }
  cancelCapture() { this.capture = null; }
  get capturing() { return this.capture !== null; }

  // Called when a pad vanishes mid-hold: without this the control stays
  // latched and the next connect fires a phantom release.
  forget(padIndex) {
    for (const key of [...this.held.keys()]) {
      if (key.startsWith(`${padIndex}:`)) this.held.delete(key);
    }
    this.padIds.delete(padIndex);
    this.axes = { panX: 0, panY: 0, zoom: 0 };
  }

  reset() {
    this.held.clear();
    this.padIds.clear();
    this.axes = { panX: 0, panY: 0, zoom: 0 };
  }

  // `pads` is whatever navigator.getGamepads() returned (holes and all).
  // Returns the events that fired this frame; axes live on `this.axes`.
  update(pads, now) {
    const events = [];
    const seen = new Set();
    const live = new Set();
    let panX = 0, panY = 0, zoom = 0;

    for (const pad of pads || []) {
      if (!pad || pad.connected === false) continue;
      live.add(pad.index);

      if (!this.padIds.has(pad.index)) {
        const descriptor = {
          id: pad.id || 'unknown pad',
          mapping: pad.mapping || '',
          standard: pad.mapping === 'standard',
        };
        this.padIds.set(pad.index, descriptor);
        this.lastPadId = descriptor.id;
        events.push({ type: 'connected', padIndex: pad.index, ...descriptor });
      }

      const descriptor = this.padIds.get(pad.index);
      const map = this.buttonMap(descriptor.id);
      const buttons = pad.buttons || [];

      // Remap capture short-circuits everything: one press, one index.
      if (this.capture) {
        for (let i = 0; i < buttons.length; i++) {
          const key = `${pad.index}:btn:${i}`;
          const down = isPressed(buttons[i]);
          const was = this.held.has(key);
          if (down && !was) {
            this.held.set(key, { since: now, nextRepeat: Infinity });
            const fn = this.capture;
            this.capture = null;
            fn({ index: i, padIndex: pad.index, padId: descriptor.id });
            return events;
          }
          if (!down && was) this.held.delete(key);
        }
        continue;
      }

      for (let i = 0; i < buttons.length; i++) {
        const key = `${pad.index}:btn:${i}`;
        const control = map[i];
        const analog = valueOf(buttons[i]);
        // Triggers are analog: hysteresis stops a resting trigger from
        // flickering the zoom on and off.
        const wasDown = this.held.has(key);
        const threshold = wasDown ? this.opt.triggerOff : this.opt.triggerOn;
        const down = isPressed(buttons[i]) || analog > threshold;
        if (!control) {
          if (down) this.held.set(key, { since: now, nextRepeat: Infinity });
          else this.held.delete(key);
          continue;
        }
        if (control === CONTROL.ZOOM_IN) zoom += analog;
        if (control === CONTROL.ZOOM_OUT) zoom -= analog;
        seen.add(control);
        this.step(key, control, down, now, events, pad.index);
      }

      // D-pad-as-hat fallback for pads that report no buttons 12-15.
      const axesArr = pad.axes || [];
      if (!descriptor.standard && buttons.length < 13 && axesArr.length > 9) {
        for (const control of hatToControls(axesArr[9])) {
          seen.add(control);
          this.step(`${pad.index}:hat:${control}`, control, true, now, events, pad.index);
        }
        for (const control of [CONTROL.NAV_UP, CONTROL.NAV_DOWN, CONTROL.NAV_LEFT, CONTROL.NAV_RIGHT]) {
          if (!seen.has(control)) this.step(`${pad.index}:hat:${control}`, control, false, now, events, pad.index);
        }
      }

      // Left stick doubles as the D-pad so the player never has to know which
      // one this menu wanted. The nav gate reads the *raw* deflection, not the
      // deadzone-renormalised one: renormalising is for smooth analog output,
      // and mixing it into a discrete threshold makes navOn mean 0.65 on the
      // stick while claiming to mean 0.55.
      const raw = { x: axesArr[0] || 0, y: axesArr[1] || 0 };
      for (const [control, active] of [
        [CONTROL.NAV_LEFT, raw.x < 0], [CONTROL.NAV_RIGHT, raw.x > 0],
        [CONTROL.NAV_UP, raw.y < 0], [CONTROL.NAV_DOWN, raw.y > 0],
      ]) {
        const axisMag = control === CONTROL.NAV_LEFT || control === CONTROL.NAV_RIGHT
          ? Math.abs(raw.x) : Math.abs(raw.y);
        const key = `${pad.index}:stick:${control}`;
        const wasDown = this.held.has(key);
        const gate = wasDown ? this.opt.navOff : this.opt.navOn;
        const down = active && axisMag >= gate;
        if (down) seen.add(control);
        this.step(key, control, down, now, events, pad.index);
      }

      // Right stick drives the camera. Cubed for fine control near centre.
      const right = applyStick(axesArr[2] || 0, axesArr[3] || 0, this.opt);
      panX += curve(right.x);
      panY += curve(right.y);
    }

    // Anything the browser stopped reporting is gone; drop its held state.
    for (const padIndex of [...this.padIds.keys()]) {
      if (live.has(padIndex)) continue;
      const descriptor = this.padIds.get(padIndex);
      this.forget(padIndex);
      events.push({ type: 'disconnected', padIndex, ...descriptor });
    }

    this.axes = {
      panX, panY,
      zoom: Math.max(-1, Math.min(1, zoom)),
    };
    return events;
  }

  step(key, control, down, now, events, padIndex) {
    const held = this.held.get(key);
    if (down && !held) {
      this.held.set(key, {
        since: now,
        nextRepeat: REPEATING.has(control) ? now + this.opt.repeatDelay : Infinity,
      });
      events.push({ type: 'press', control, padIndex });
      return;
    }
    if (down && held) {
      if (now >= held.nextRepeat) {
        held.nextRepeat = now + this.opt.repeatRate;
        events.push({ type: 'repeat', control, padIndex });
      }
      return;
    }
    if (!down && held) {
      this.held.delete(key);
      events.push({ type: 'release', control, padIndex });
    }
  }

  get connectedCount() { return this.padIds.size; }

  // True when at least one attached pad did not advertise the standard layout,
  // which is exactly when the remap is worth offering.
  get hasUnverifiedLayout() {
    for (const [, d] of this.padIds) {
      if (!d.standard && !this.overrides[d.id]) return true;
    }
    return false;
  }

  describe() {
    return [...this.padIds.values()].map((d) => ({ ...d, remapped: !!this.overrides[d.id] }));
  }
}
