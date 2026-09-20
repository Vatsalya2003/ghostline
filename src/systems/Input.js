import { PadReader, CONTROL } from './Gamepad.js';
import { KEY_TO_CONTROL, HOLD_CONTROLS, CAMERA_BINDING, SELECT_BINDING } from '../ui/Prompts.js';
import { cameraBasis, nudgeCamera, nudgeZoom, setWideView, focusOn, rotateView } from '../render/Camera.js';
import { isPaused } from './Pause.js';
import { audio } from './Audio.js';

// Keyboard, mouse and gamepad all resolve to the same small set of semantic
// controls (Gamepad.js owns the pad half), and a context stack decides who
// gets them. Contexts are chosen by *visibility*, not by push/pop, so the
// router can never disagree with what is actually on screen — which matters
// when other code shows and hides screens without telling us.

// Camera basis in the xz plane, so the stick pushes the view the way the
// screen points rather than the way the axes do. Asked for per frame: the
// player can rotate the board a quarter turn and a cached basis would send
// W north-east for the rest of the mission.

const PAN_SPEED = 13;      // world units/sec at the default view size
const ZOOM_SPEED = 13;     // view units/sec at full trigger
const KEY_PAN = { w: [0, 1], a: [-1, 0], s: [0, -1], d: [1, 0] };
// Zoom is analog on the triggers, so the keys have to be held rather than
// tapped — otherwise Q and E would step the view once and stop.
const KEY_ZOOM = { '-': -1, '=': 1 };
// Q/E snap the view a quarter turn. Tapped, not held — they fire on keydown.
const KEY_ROTATE = { q: -1, e: 1 };

export class Input {
  constructor({
    commandBar, comms, camera, squad, hud, prompts,
    onAction, onSkip, onPause, onMap, isBusy = () => false,
  }) {
    this.commandBar = commandBar;
    this.comms = comms;
    this.camera = camera;
    this.squad = squad;
    this.hud = hud;
    this.prompts = prompts;
    this.onAction = onAction;
    this.onSkip = onSkip;
    this.onPause = onPause;
    this.onMap = onMap;
    this.isBusy = isBusy;

    this.pad = new PadReader();
    this.device = 'kbd';
    this.contexts = [];
    this.heldKeys = new Set();
    this.keyZoom = 0;
    this.selectedUnit = -1;
    this.lastContext = null;
    this.lastPromptKey = '';

    this.bindKeyboard();
    this.bindPointer();
    this.bindPadEvents();
  }

  // ---------------------------------------------------------------- contexts
  addContext(ctx) {
    this.contexts.push(ctx);
    this.contexts.sort((a, b) => b.priority - a.priority);
    return this;
  }

  activeContext() {
    for (const ctx of this.contexts) if (ctx.isActive()) return ctx;
    return null;
  }

  // ---------------------------------------------------------------- device
  setDevice(device) {
    if (this.device === device) return;
    this.device = device;
    this.prompts?.setDevice(device);
    this.refreshPrompts(true);
  }

  refreshPrompts(force = false) {
    if (!this.prompts) return;
    const ctx = this.activeContext();
    const items = ctx?.prompts?.() || [];
    const key = `${this.device}|${ctx?.name || '-'}|` +
      items.map((i) => `${i.control || i.glyph?.pad}:${i.label}`).join(',');
    if (!force && key === this.lastPromptKey) return;
    this.lastPromptKey = key;
    this.prompts.show(items);
  }

  // ---------------------------------------------------------------- keyboard
  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.setDevice('kbd');

      // Held keys drive the camera; poll() integrates them every frame.
      if (KEY_PAN[key] || KEY_ZOOM[key]) { this.heldKeys.add(key); e.preventDefault(); return; }

      // A quarter turn is a discrete thing — held Q must not spin the board.
      if (KEY_ROTATE[key]) {
        e.preventDefault();
        if (!e.repeat) this.rotateBoard(KEY_ROTATE[key]);
        return;
      }

      if (e.repeat && !KEY_TO_CONTROL.has(key)) return;

      // Tab cycles units instead of walking the browser's focus order — the
      // game owns its own focus ring and two of them fighting is worse than
      // losing the native one.
      if (key === 'Tab') {
        e.preventDefault();
        if (!e.repeat) this.dispatch(e.shiftKey ? CONTROL.PREV_UNIT : CONTROL.NEXT_UNIT);
        return;
      }

      // Number keys pick a command directly. Fastest path through a demo, and
      // the only one that needs no navigation at all.
      if (/^[1-9]$/.test(key) && !e.repeat) {
        const ctx = this.activeContext();
        if (ctx?.pick?.(Number(key) - 1)) { e.preventDefault(); return; }
      }

      const control = KEY_TO_CONTROL.get(key);
      if (!control) return;
      e.preventDefault();
      if (HOLD_CONTROLS.has(control)) {
        if (!this.heldKeys.has(key)) { this.heldKeys.add(key); this.dispatch(control, 'press'); }
        return;
      }
      if (e.repeat && !this.isRepeatable(control)) return;
      this.dispatch(control);
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.heldKeys.delete(key);
      const control = KEY_TO_CONTROL.get(key);
      if (control && HOLD_CONTROLS.has(control)) this.dispatch(control, 'release');
    });

    // A window that loses focus must not keep a key held — alt-tabbing away
    // mid-pan used to leave the camera drifting forever.
    window.addEventListener('blur', () => {
      this.heldKeys.clear();
      this.pad.reset();
      setWideView(this.camera, false);
    });
  }

  isRepeatable(control) {
    return control === CONTROL.NAV_UP || control === CONTROL.NAV_DOWN
      || control === CONTROL.NAV_LEFT || control === CONTROL.NAV_RIGHT;
  }

  // ---------------------------------------------------------------- pointer
  bindPointer() {
    // Only a real move counts: a pad press can jog the cursor by a pixel and
    // that must not flip the prompts back to keyboard glyphs mid-press.
    let lastX = null, lastY = null;
    window.addEventListener('pointermove', (e) => {
      if (lastX !== null && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 6) return;
      lastX = e.clientX; lastY = e.clientY;
      this.setDevice('kbd');
    });
    window.addEventListener('pointerdown', () => this.setDevice('kbd'));
  }

  bindPadEvents() {
    window.addEventListener('gamepadconnected', (e) => {
      console.log(`[input] gamepad connected: ${e.gamepad.id} (mapping: ${e.gamepad.mapping || 'non-standard'})`);
      this.setDevice('pad');
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      console.log(`[input] gamepad disconnected: ${e.gamepad.id}`);
      // Do not clear state here — poll() reconciles against getGamepads(),
      // which is the list that actually decides what exists.
    });
  }

  // A pad that does not advertise the standard layout is the one case where
  // the indices really are a guess. Say so, on screen, next to the remap that
  // fixes it — rather than letting the player discover it by pressing A and
  // watching the wrong thing happen.
  announceLayout() {
    if (!this.prompts) return;
    this.prompts.setNote(this.pad.hasUnverifiedLayout
      ? 'NON-STANDARD PAD · PAUSE ▸ CONTROLS ▸ REMAP'
      : '');
  }

  // ---------------------------------------------------------------- dispatch
  dispatch(control, phase = 'press') {
    const ctx = this.activeContext();

    // Hold controls are global: the tactical view should widen the camera from
    // any screen, and releasing must always un-widen even if the context
    // changed while the button was down.
    if (control === CONTROL.TACTICAL) {
      setWideView(this.camera, phase === 'press');
      return;
    }
    if (phase !== 'press') return;

    if (ctx?.handle?.(control)) { this.refreshPrompts(); return; }
    this.refreshPrompts();
  }

  // ---------------------------------------------------------------- poll
  poll(dt = 0.016) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const events = this.pad.update(navigator.getGamepads ? navigator.getGamepads() : [], now);

    for (const ev of events) {
      if (ev.type === 'connected') {
        this.setDevice('pad');
        this.announceLayout();
        continue;
      }
      if (ev.type === 'disconnected') {
        // A pad yanked mid-hold must not leave the camera stuck wide.
        setWideView(this.camera, false);
        this.setDevice('kbd');
        this.announceLayout();
        continue;
      }
      if (ev.type === 'press' || ev.type === 'repeat') {
        this.setDevice('pad');
        this.dispatch(ev.control, 'press');
      } else if (ev.type === 'release') {
        if (HOLD_CONTROLS.has(ev.control) || ev.control === CONTROL.TACTICAL) {
          this.dispatch(ev.control, 'release');
        }
      }
    }

    this.pollCamera(dt);
    this.refreshPrompts();
  }

  // Analog camera, run every frame rather than on events. Pan speed scales
  // with the zoom level so a step across the screen costs the same push
  // whether you are zoomed in on one robot or looking at the whole compound.
  pollCamera(dt) {
    if (isPaused()) return;
    const ctx = this.activeContext();
    if (ctx && ctx.allowCamera === false) return;

    let px = this.pad.axes.panX;
    let py = -this.pad.axes.panY;      // gamepad Y is +down
    let zoom = this.pad.axes.zoom;

    for (const key of this.heldKeys) {
      const v = KEY_PAN[key];
      if (v) { px += v[0]; py += v[1]; }
    }
    for (const key of this.heldKeys) zoom += KEY_ZOOM[key] || 0;

    if (px || py) {
      const scale = PAN_SPEED * dt * (this.camera.userData.view / 18);
      const { forward, right } = cameraBasis();
      nudgeCamera(
        this.camera,
        (right.x * px + forward.x * py) * scale,
        (right.z * px + forward.z * py) * scale,
      );
    }
    if (zoom) nudgeZoom(this.camera, zoom * ZOOM_SPEED * dt);
  }

  // Quarter-turn the board. Refused while a turn is already in flight, so a
  // mashed key cannot leave the view at 23 degrees.
  rotateBoard(dir) {
    if (rotateView(dir)) audio.hover();
  }

  // ---------------------------------------------------------------- units
  // There is no unit *selection* in this game — you give one order a turn —
  // so LB/RB frames a unit and lights its cone instead. That is the question
  // players actually ask on turn 3: which robot is the broken one?
  cycleUnit(delta) {
    const all = this.squad?.all || [];
    if (!all.length) return;
    this.selectedUnit = (this.selectedUnit + delta + all.length) % all.length;
    const unit = all[this.selectedUnit];
    for (const u of all) u.setFocus?.(u === unit);
    unit.ping?.();
    focusOn(this.camera, unit, 0.7);
    this.hud?.setSelected?.(unit.id);
    audio.hover();
  }

  clearUnitSelection() {
    this.selectedUnit = -1;
    for (const u of this.squad?.all || []) u.setFocus?.(false);
    this.hud?.setSelected?.(null);
  }

  // ---------------------------------------------------------------- contexts
  // The in-mission context. Built here rather than in main.js because every
  // one of its branches is an input concern.
  missionContext({ isActive }) {
    const self = this;
    return {
      name: 'mission',
      priority: 10,
      isActive,
      pick(index) {
        const btn = self.commandBar.buttons[index];
        if (!btn || btn.disabled) return false;
        self.commandBar.ring.focusElement(btn);
        btn.click();
        return true;
      },
      handle(control) {
        switch (control) {
          case CONTROL.NAV_LEFT: case CONTROL.NAV_UP:
            self.commandBar.moveFocus(-1); return true;
          case CONTROL.NAV_RIGHT: case CONTROL.NAV_DOWN:
            self.commandBar.moveFocus(1); return true;
          case CONTROL.CONFIRM:
            if (self.isBusy()) { self.onSkip?.(); return true; }
            self.commandBar.activateFocused(); return true;
          case CONTROL.CANCEL:
            // Skip the line if one is still typing; otherwise this is the
            // universal "get me out of here" and opens the pause menu.
            if (self.isBusy() || self.comms?.isTyping?.()) { self.onSkip?.(); return true; }
            self.onPause?.('menu'); return true;
          case CONTROL.CONTEXT:
            self.onAction?.('ASK_WHY'); return true;
          case CONTROL.PREV_UNIT: self.cycleUnit(-1); return true;
          case CONTROL.NEXT_UNIT: self.cycleUnit(1); return true;
          case CONTROL.ROTATE_LEFT: self.rotateBoard(-1); return true;
          case CONTROL.ROTATE_RIGHT: self.rotateBoard(1); return true;
          case CONTROL.PAUSE: self.onPause?.('menu'); return true;
          case CONTROL.INFO: self.onPause?.('intel'); return true;
          case CONTROL.OPEN_MAP: self.onMap?.(); return true;
          default: return false;
        }
      },
      prompts() {
        const busy = self.isBusy();
        if (busy) {
          return [
            { control: CONTROL.CANCEL, label: 'SKIP' },
            { glyph: CAMERA_BINDING, label: 'CAMERA' },
          { control: CONTROL.OPEN_MAP, label: 'MAP' },
            { control: CONTROL.PAUSE, label: 'PAUSE' },
          ];
        }
        return [
          { glyph: SELECT_BINDING, label: 'SELECT' },
          { control: CONTROL.CONFIRM, label: 'CONFIRM' },
          { control: CONTROL.CONTEXT, label: 'ASK WHY' },
          { control: CONTROL.NEXT_UNIT, label: 'UNITS' },
          { control: CONTROL.ROTATE_RIGHT, label: 'ROTATE' },
          { glyph: CAMERA_BINDING, label: 'CAMERA' },
          { control: CONTROL.TACTICAL, label: 'TACTICAL' },
          { control: CONTROL.PAUSE, label: 'PAUSE' },
        ];
      },
    };
  }

  // A screen with one or more buttons: title, briefing, debrief.
  screenContext({ name, priority, el, ring, label = 'SELECT', onCancel = null, allowCamera = false }) {
    return {
      name,
      priority,
      allowCamera,
      isActive: () => el && !el.classList.contains('hidden'),
      pick(index) {
        const item = ring.items[index];
        if (!item || item.disabled) return false;
        item.click();
        return true;
      },
      handle: (control) => {
        switch (control) {
          case CONTROL.NAV_LEFT: case CONTROL.NAV_UP: ring.move(-1); return true;
          case CONTROL.NAV_RIGHT: case CONTROL.NAV_DOWN: ring.move(1); return true;
          case CONTROL.CONFIRM: ring.activate(); return true;
          case CONTROL.CANCEL: onCancel?.(); return true;
          case CONTROL.PAUSE: this.onPause?.('menu'); return true;
          case CONTROL.INFO: this.onPause?.('intel'); return true;
          default: return true;   // screens swallow the rest
        }
      },
      prompts: () => {
        const items = [{ control: CONTROL.CONFIRM, label }];
        if (ring.count > 1) items.unshift({ control: CONTROL.NAV_DOWN, label: 'NAVIGATE' });
        if (onCancel) items.push({ control: CONTROL.CANCEL, label: 'BACK' });
        return items;
      },
    };
  }
}
