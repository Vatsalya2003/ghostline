// Headless tests for the input layer. `node scripts/input-test.mjs`
//
// Why this exists: there is no physical controller on the build machine, and
// `suggestion-bug.md` #2 was open precisely because nobody could confirm the
// button indices. Gamepad.js is deliberately DOM-free and takes plain snapshot
// objects, so the whole mapping / deadzone / debounce / hotplug surface can be
// driven from Node against synthetic pads shaped exactly like the real ones.
//
// This proves the logic. It does not prove a given physical pad reports the
// indices it claims to — nothing short of plugging one in does that.
import { PadReader, CONTROL, STANDARD_BUTTONS } from '../src/systems/Gamepad.js';
import { FocusRing } from '../src/ui/Focus.js';

let passed = 0, failed = 0;
const fails = [];

function check(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
function eq(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// A pad snapshot shaped like the browser's. `down` is a list of button indices
// or [index, analogValue] pairs.
function pad({ index = 0, id = 'Test Pad (STANDARD GAMEPAD)', mapping = 'standard',
               down = [], axes = [0, 0, 0, 0], buttonCount = 17 } = {}) {
  const buttons = Array.from({ length: buttonCount }, () => ({ pressed: false, value: 0 }));
  for (const d of down) {
    const [i, v] = Array.isArray(d) ? d : [d, 1];
    buttons[i] = { pressed: v >= 0.5, value: v };
  }
  return { index, id, mapping, connected: true, buttons, axes };
}

const controlsOf = (events, type = 'press') =>
  events.filter((e) => e.type === type).map((e) => e.control);

// ---------------------------------------------------------------- 1. mapping
{
  const r = new PadReader();
  r.update([pad()], 0);   // connect frame
  let t = 10;
  for (const [indexStr, expected] of Object.entries(STANDARD_BUTTONS)) {
    const i = Number(indexStr);
    const ev = r.update([pad({ down: [i] })], t += 10);
    eq(`standard button ${i} -> ${expected}`, controlsOf(ev), [expected]);
    r.update([pad()], t += 10);   // release
  }
  // Button 16 (guide) is mapped to nothing and must stay silent.
  const guide = r.update([pad({ down: [16] })], t += 10);
  eq('button 16 (guide) is unbound', controlsOf(guide), []);
}

// ---------------------------------------------------------------- 2. debounce
{
  const r = new PadReader();
  r.update([pad()], 0);
  const first = r.update([pad({ down: [0] })], 100);
  eq('A fires once on press', controlsOf(first), [CONTROL.CONFIRM]);
  let repeats = 0;
  for (let t = 200; t < 4000; t += 100) {
    repeats += r.update([pad({ down: [0] })], t).length;
  }
  check('A held for 4s never repeats', repeats === 0, `${repeats} extra events`);
  const rel = r.update([pad()], 4100);
  eq('A emits a release', controlsOf(rel, 'release'), [CONTROL.CONFIRM]);
}

// ---------------------------------------------------------------- 3. repeat
{
  const r = new PadReader();
  r.update([pad()], 0);
  r.update([pad({ down: [13] })], 100);            // D-pad down pressed
  let repeats = 0, firstRepeatAt = null;
  for (let t = 150; t <= 1200; t += 50) {
    const ev = r.update([pad({ down: [13] })], t);
    const n = ev.filter((e) => e.type === 'repeat').length;
    if (n && firstRepeatAt === null) firstRepeatAt = t;
    repeats += n;
  }
  check('D-pad repeats while held', repeats > 3, `${repeats} repeats`);
  check('first repeat waits ~420ms', firstRepeatAt >= 500 && firstRepeatAt <= 560,
    `first repeat at ${firstRepeatAt}ms (press at 100ms)`);
  // ~140ms rate over the 700ms after the first repeat.
  check('repeat rate is roughly 140ms', repeats >= 4 && repeats <= 7, `${repeats} repeats in 1.05s`);
}

// ---------------------------------------------------------------- 4. deadzone
{
  const r = new PadReader();
  r.update([pad()], 0);
  const drift = r.update([pad({ axes: [0.2, -0.18, 0.22, 0.15] })], 100);
  eq('stick drift inside the deadzone triggers nothing', controlsOf(drift), []);
  eq('stick drift produces no camera pan', [r.axes.panX, r.axes.panY], [0, 0]);

  const push = r.update([pad({ axes: [0, -0.9, 0, 0] })], 200);
  eq('a real push up navigates', controlsOf(push), [CONTROL.NAV_UP]);

  r.update([pad()], 300);
  r.update([pad({ axes: [0, 0, 0.9, 0] })], 400);
  check('right stick pans the camera', r.axes.panX > 0.4, `panX=${r.axes.panX}`);
  check('camera response is curved, not linear', r.axes.panX < 0.9, `panX=${r.axes.panX}`);
}

// ---------------------------------------------------------------- 5. hysteresis
{
  const r = new PadReader();
  r.update([pad()], 0);
  eq('crossing navOn fires', controlsOf(r.update([pad({ axes: [0.6, 0, 0, 0] })], 100)), [CONTROL.NAV_RIGHT]);
  eq('easing back to 0.45 does not re-fire',
    r.update([pad({ axes: [0.45, 0, 0, 0] })], 150).filter((e) => e.type === 'press').length, 0);
  eq('dropping under navOff releases',
    controlsOf(r.update([pad({ axes: [0.1, 0, 0, 0] })], 200), 'release'), [CONTROL.NAV_RIGHT]);
  eq('pushing again fires a fresh press',
    controlsOf(r.update([pad({ axes: [0.7, 0, 0, 0] })], 250)), [CONTROL.NAV_RIGHT]);
}

// ---------------------------------------------------------------- 6. triggers
{
  const r = new PadReader();
  r.update([pad()], 0);
  eq('trigger at 0.4 is not a press', controlsOf(r.update([pad({ down: [[7, 0.4]] })], 100)), []);
  eq('trigger at 0.6 presses', controlsOf(r.update([pad({ down: [[7, 0.6]] })], 200)), [CONTROL.ZOOM_IN]);
  eq('trigger easing to 0.35 stays held',
    r.update([pad({ down: [[7, 0.35]] })], 300).filter((e) => e.type === 'release').length, 0);
  eq('trigger at 0.2 releases',
    controlsOf(r.update([pad({ down: [[7, 0.2]] })], 400), 'release'), [CONTROL.ZOOM_IN]);
  r.update([pad({ down: [[7, 0.8]] })], 500);
  check('zoom axis is analog', Math.abs(r.axes.zoom - 0.8) < 0.001, `zoom=${r.axes.zoom}`);
  r.update([pad({ down: [[6, 0.8], [7, 0.8]] })], 600);
  check('both triggers cancel out', Math.abs(r.axes.zoom) < 0.001, `zoom=${r.axes.zoom}`);
}

// ---------------------------------------------------------------- 7. hotplug
{
  const r = new PadReader();
  const conn = r.update([pad()], 0);
  eq('connect is reported', conn.map((e) => e.type), ['connected']);
  r.update([pad({ down: [13] })], 100);          // hold D-pad down
  const gone = r.update([], 200);                 // yanked mid-hold
  eq('disconnect is reported', gone.map((e) => e.type), ['disconnected']);
  check('held state is dropped on disconnect', r.held.size === 0, `${r.held.size} stuck`);
  eq('no phantom events once gone', r.update([], 1000), []);
  eq('axes are zeroed on disconnect', [r.axes.panX, r.axes.panY, r.axes.zoom], [0, 0, 0]);

  const back = r.update([pad()], 1100);
  eq('reconnect is reported', back.map((e) => e.type), ['connected']);
  eq('pad works after reconnect', controlsOf(r.update([pad({ down: [0] })], 1200)), [CONTROL.CONFIRM]);
}

// ---------------------------------------------------------------- 8. two pads
{
  const r = new PadReader();
  r.update([pad({ index: 0 }), pad({ index: 1, id: 'Second Pad' })], 0);
  const ev = r.update([pad({ index: 0, down: [0] }), pad({ index: 1, id: 'Second Pad' })], 100);
  eq('pad 0 pressing A does not latch pad 1', controlsOf(ev), [CONTROL.CONFIRM]);
  const ev2 = r.update([pad({ index: 0 }), pad({ index: 1, id: 'Second Pad', down: [0] })], 200);
  eq('pad 1 press is independent', controlsOf(ev2), [CONTROL.CONFIRM]);
  check('pad 0 released cleanly', controlsOf(ev2, 'release').length === 1);
}

// ---------------------------------------------------------------- 9. remap
{
  const r = new PadReader();
  const odd = { id: 'Weird Pad', mapping: '', buttonCount: 12 };
  r.update([pad(odd)], 0);
  check('non-standard pad is flagged', r.hasUnverifiedLayout);

  let captured = null;
  r.beginCapture((info) => { captured = info; });
  r.update([pad({ ...odd, down: [5] })], 100);
  eq('capture reports the raw index', captured?.index, 5);
  check('capture consumes the press, emitting nothing',
    r.update([pad({ ...odd, down: [5] })], 150).length === 0);

  r.update([pad(odd)], 200);
  r.setOverride('Weird Pad', { 5: CONTROL.CONFIRM });
  eq('remapped index routes to the new control',
    controlsOf(r.update([pad({ ...odd, down: [5] })], 300)), [CONTROL.CONFIRM]);
  check('remapped pad is no longer flagged', !r.hasUnverifiedLayout);
  r.update([pad(odd)], 400);
  eq('an index left out of the override is inert',
    controlsOf(r.update([pad({ ...odd, down: [0] })], 500)), []);
}

// ---------------------------------------------------------------- 10. hat d-pad
{
  const r = new PadReader();
  // Non-standard pad, no buttons 12-15, D-pad on axis 9.
  const hat = (v) => pad({ id: 'Hat Pad', mapping: '', buttonCount: 12, axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, v] });
  r.update([hat(3.286)], 0);   // rest value
  eq('hat at rest is silent', controlsOf(r.update([hat(3.286)], 50)), []);
  eq('hat up maps to NAV_UP', controlsOf(r.update([hat(-1)], 100)), [CONTROL.NAV_UP]);
  r.update([hat(3.286)], 150);
  eq('hat right maps to NAV_RIGHT', controlsOf(r.update([hat(-0.5)], 200)), [CONTROL.NAV_RIGHT]);
  r.update([hat(3.286)], 250);
  eq('hat down maps to NAV_DOWN', controlsOf(r.update([hat(0.14)], 300)), [CONTROL.NAV_DOWN]);
}

// ---------------------------------------------------------------- 11. focus ring
{
  // Minimal element stand-in: FocusRing only touches classList, disabled and click.
  const el = (disabled = false) => ({
    disabled, hidden: false, isConnected: false, clicked: 0,
    classes: new Set(),
    classList: {
      toggle(c, on) { if (on) this.__s.add(c); else this.__s.delete(c); },
      remove(c) { this.__s.delete(c); },
      contains(c) { return this.__s.has(c); },
    },
    click() { this.clicked++; },
    focus() {},
  });
  const mk = (disabled) => { const e = el(disabled); e.classList.__s = e.classes; return e; };
  globalThis.document = { activeElement: null };

  const a = mk(), b = mk(true), c = mk();
  const ring = new FocusRing();
  ring.setItems([a, b, c]);
  eq('ring starts on the first selectable item', ring.index, 0);
  ring.move(1);
  eq('ring skips a disabled entry', ring.index, 2);
  ring.move(1);
  eq('ring wraps past the end', ring.index, 0);
  ring.move(-1);
  eq('ring wraps backwards past a disabled entry', ring.index, 2);
  check('only the focused item carries the class', a.classes.has('focused') === false && c.classes.has('focused'));
  ring.activate();
  eq('activate clicks the focused item', c.clicked, 1);
  ring.focusElement(b);
  eq('hover cannot focus a disabled item', ring.index, 2);
  ring.focusElement(a);
  eq('hover moves the ring to a live item', ring.index, 0);

  const only = mk();
  const single = new FocusRing();
  single.setItems([only]);
  check('a one-item ring does not move', single.move(1) === false);
  single.activate();
  eq('a one-item ring still activates', only.clicked, 1);

  const empty = new FocusRing();
  empty.setItems([]);
  check('an empty ring is safe to move', empty.move(1) === false);
  check('an empty ring is safe to activate', empty.activate() === false);

  const allOff = new FocusRing();
  allOff.setItems([mk(true), mk(true)]);
  check('an all-disabled ring refuses to activate', allOff.activate() === false);
}

// ---------------------------------------------------------------- report
const total = passed + failed;
console.log(`\n${failed ? 'FAIL' : 'PASS'}  ${passed}/${total} input checks`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(failed ? 1 : 0);
