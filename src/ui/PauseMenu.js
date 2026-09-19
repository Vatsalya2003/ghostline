import gsap from 'gsap';
import { FocusRing } from './Focus.js';
import { BINDINGS, CAMERA_BINDING, SELECT_BINDING, glyphFor } from './Prompts.js';
import { CONTROL, REMAP_ORDER, CONTROL_NAME } from '../systems/Gamepad.js';
import { setPaused } from '../systems/Pause.js';
import { audio } from '../systems/Audio.js';

const STORE_KEY = 'ghostline.padmap.v1';

// Pause, mission intel, controls reference and controller remap — one overlay
// with four panes, because they share all their navigation and half their
// styling. START opens it on the menu, BACK opens it straight on intel.
export class PauseMenu {
  constructor({ mission, input, onRestart, onAbort, getTurn }) {
    this.mission = mission;
    this.input = input;
    this.onRestart = onRestart;
    this.onAbort = onAbort;
    this.getTurn = getTurn || (() => null);

    this.el = document.getElementById('screen-pause');
    this.titleEl = document.getElementById('pause-title');
    this.bodyEl = document.getElementById('pause-body');
    this.pane = 'menu';
    this.open = false;
    this.ring = new FocusRing({ onFocus: () => audio.hover() });
    this.remapStep = 0;
    this.remapDraft = {};

    this.loadOverrides();
  }

  // ---------------------------------------------------------------- storage
  loadOverrides() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      for (const [padId, map] of Object.entries(saved)) {
        // JSON keys are strings; the reader indexes by number.
        const numeric = {};
        for (const [k, v] of Object.entries(map)) numeric[Number(k)] = v;
        this.input.pad.setOverride(padId, numeric);
      }
    } catch { /* corrupt or unavailable storage is not worth crashing over */ }
  }

  saveOverride(padId, map) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      saved[padId] = map;
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch { /* ignore */ }
  }

  clearOverrides() {
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    for (const d of this.input.pad.describe()) this.input.pad.setOverride(d.id, null);
  }

  // ---------------------------------------------------------------- open/close
  show(pane = 'menu') {
    if (this.open && this.pane === pane) return;
    this.open = true;
    this.pane = pane;
    this.el.classList.remove('hidden');
    this.applyPause(true);
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.input.pad.cancelCapture();
    this.el.classList.add('hidden');
    this.ring.clear();
    this.applyPause(false);
  }

  toggle(pane = 'menu') {
    if (this.open) this.hide(); else this.show(pane);
  }

  // Everything that has its own clock has to be told. GSAP drives the
  // animation, the AudioContext drives every sound, speechSynthesis drives the
  // AI's voice, and Pause.js drives the director's beat timers.
  applyPause(on) {
    setPaused(on);
    if (on) gsap.globalTimeline.pause(); else gsap.globalTimeline.resume();
    const ctx = audio.ctx;
    if (ctx) {
      if (on && ctx.state === 'running') ctx.suspend();
      if (!on && ctx.state === 'suspended') ctx.resume();
    }
    if (typeof speechSynthesis !== 'undefined') {
      try { if (on) speechSynthesis.pause(); else speechSynthesis.resume(); } catch { /* ignore */ }
    }
  }

  // ---------------------------------------------------------------- panes
  render() {
    const build = {
      menu: () => this.renderMenu(),
      log: () => this.renderLog(),
      intel: () => this.renderIntel(),
      controls: () => this.renderControls(),
      remap: () => this.renderRemap(),
    }[this.pane];
    build();
    this.ring.setItems([...this.bodyEl.querySelectorAll('button:not(:disabled)')]);
  }

  button(label, onClick, { className = 'btn menu-btn' } = {}) {
    const b = document.createElement('button');
    b.className = className;
    b.textContent = label;
    b.addEventListener('click', () => { audio.select(); onClick(); });
    // Same as the command bar: the ring's onFocus covers pad and keys, the
    // pointer has to ask for its own tick.
    b.addEventListener('pointerenter', () => {
      if (this.ring.focusElement(b)) audio.hover();
    });
    return b;
  }

  renderMenu() {
    this.titleEl.textContent = 'PAUSED';
    this.bodyEl.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'menu-list';
    list.append(
      this.button('RESUME', () => this.hide()),
      this.button('MISSION INFO', () => { this.pane = 'intel'; this.render(); }),
      this.button('CONTROLS', () => { this.pane = 'controls'; this.render(); }),
      this.button('RESTART MISSION', () => { this.hide(); this.onRestart?.(); }),
      this.button('ABORT TO TITLE', () => { this.hide(); this.onAbort?.(); }),
    );
    this.bodyEl.appendChild(list);
  }

  // The full transcript, with the game held. The side panel only has room for
  // the last few lines, and by turn 8 the thing the player wants to re-read is
  // four turns back — so it is worth stopping the mission for.
  //
  // Read straight out of the live log element rather than kept as a second
  // copy: one source of truth, and it cannot drift out of step with the HUD.
  renderLog() {
    this.titleEl.textContent = 'MISSION LOG';
    this.bodyEl.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'log-pane';

    const live = document.getElementById('log-lines');
    const lines = live ? [...live.children] : [];
    if (!lines.length) {
      const empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.textContent = 'No entries yet.';
      wrap.appendChild(empty);
    } else {
      for (const line of lines) {
        const copy = line.cloneNode(true);
        copy.classList.remove('new');   // nothing in here is "just happened"
        wrap.appendChild(copy);
      }
    }

    this.bodyEl.appendChild(wrap);
    const list = document.createElement('div');
    list.className = 'menu-list';
    list.append(this.button('RESUME MISSION', () => this.hide()));
    this.bodyEl.appendChild(list);

    // Open at the bottom: the newest line is the one being looked for.
    requestAnimationFrame(() => { wrap.scrollTop = wrap.scrollHeight; });
  }

  renderIntel() {
    const turn = this.getTurn();
    this.titleEl.textContent = 'MISSION INFO';
    this.bodyEl.innerHTML = `
      <div class="intel">
        <div class="intel-block">
          <div class="label">Objective</div>
          <div class="intel-objective">${this.mission.objective}</div>
        </div>
        <div class="intel-block">
          <div class="label">Briefing</div>
          <ul class="intel-list">${this.mission.briefing.map((l) => `<li>${l}</li>`).join('')}</ul>
        </div>
        ${turn ? `<div class="intel-block">
          <div class="label">Current turn — ${turn.name} (${turn.id} / ${this.mission.turns.length})</div>
          <div class="intel-sit">${turn.situation}</div>
          <div class="intel-task">${turn.task}</div>
        </div>` : ''}
      </div>`;
    this.bodyEl.appendChild(this.button('BACK', () => { this.pane = 'menu'; this.render(); }));
  }

  renderControls() {
    const device = this.input.device;
    this.titleEl.textContent = 'CONTROLS';
    const pads = this.input.pad.describe();

    // One row per control, both columns always shown — a player switching
    // between pad and keyboard mid-demo should not have to reopen this.
    const seen = new Set();
    const rows = [];
    for (const b of BINDINGS) {
      if (seen.has(b.name)) continue;
      seen.add(b.name);
      rows.push(b);
    }
    const rowHtml = (name, pad, key) =>
      `<div class="ctl-row"><span class="ctl-name">${name}</span>` +
      `<span class="ctl-key">${key}</span><span class="ctl-pad">${pad}</span></div>`;

    this.bodyEl.innerHTML = `
      <div class="controls-table">
        <div class="ctl-row ctl-head"><span class="ctl-name">Action</span>
          <span class="ctl-key">Keyboard</span><span class="ctl-pad">Controller</span></div>
        ${rowHtml(SELECT_BINDING.name, SELECT_BINDING.pad, SELECT_BINDING.keyGlyph)}
        ${rows.map((b) => rowHtml(b.name, b.pad, b.keyGlyph)).join('')}
        ${rowHtml(CAMERA_BINDING.name, CAMERA_BINDING.pad, CAMERA_BINDING.keyGlyph)}
      </div>
      <div class="pad-status">${
        pads.length
          ? pads.map((p) => `<div>${p.standard ? 'STANDARD LAYOUT' : '⚠ NON-STANDARD LAYOUT'} · ${p.id}` +
              `${p.remapped ? ' · REMAPPED' : ''}</div>`).join('')
          : `<div>NO CONTROLLER DETECTED — press a button on a pad to wake it</div>`
      }</div>`;

    const controls = document.createElement('div');
    controls.className = 'menu-row';
    if (pads.length) {
      controls.appendChild(this.button('REMAP CONTROLLER', () => {
        this.remapStep = 0;
        this.remapDraft = {};
        this.pane = 'remap';
        this.render();
      }));
      controls.appendChild(this.button('RESET MAPPING', () => { this.clearOverrides(); this.render(); }));
    }
    controls.appendChild(this.button('BACK', () => { this.pane = 'menu'; this.render(); }));
    this.bodyEl.appendChild(controls);
  }

  // The honest answer to "which button is index 4 on this pad": ask the pad.
  renderRemap() {
    const control = REMAP_ORDER[this.remapStep];
    this.titleEl.textContent = 'REMAP CONTROLLER';

    if (!control) {
      const padId = this.input.pad.lastPadId || 'unknown pad';
      this.input.pad.setOverride(padId, this.remapDraft);
      this.saveOverride(padId, this.remapDraft);
      this.bodyEl.innerHTML = `<div class="remap-done">MAPPING SAVED — ${
        Object.keys(this.remapDraft).length} BUTTONS</div>`;
      this.bodyEl.appendChild(this.button('BACK', () => { this.pane = 'controls'; this.render(); }));
      return;
    }

    this.bodyEl.innerHTML = `
      <div class="remap">
        <div class="label">Step ${this.remapStep + 1} of ${REMAP_ORDER.length}</div>
        <div class="remap-prompt">PRESS THE BUTTON FOR</div>
        <div class="remap-control">${CONTROL_NAME[control]}</div>
        <div class="remap-hint">Default: ${glyphFor(control, 'pad')} · press SPACE or click SKIP to keep it</div>
      </div>`;

    const row = document.createElement('div');
    row.className = 'menu-row';
    row.append(
      this.button('SKIP', () => this.advanceRemap()),
      this.button('CANCEL', () => {
        this.input.pad.cancelCapture();
        this.pane = 'controls';
        this.render();
      }),
    );
    this.bodyEl.appendChild(row);

    this.input.pad.beginCapture(({ index }) => {
      this.remapDraft[index] = control;
      audio.confirm();
      this.advanceRemap();
    });
  }

  advanceRemap() {
    this.remapStep += 1;
    this.render();
  }

  // ---------------------------------------------------------------- input
  // Returns true when the press was consumed, so the router stops here.
  handle(control) {
    if (this.input.pad.capturing) {
      // Every pad button is being recorded, including B — so the only way out
      // of a remap is the keyboard. Without this the flow is a trap for anyone
      // whose pad has fewer buttons than the list.
      if (this.input.device === 'kbd') {
        if (control === CONTROL.CANCEL) {
          this.input.pad.cancelCapture();
          this.pane = 'controls';
          this.render();
          return true;
        }
        if (control === CONTROL.CONFIRM) { this.advanceRemap(); return true; }
      }
      return true;
    }
    switch (control) {
      case CONTROL.NAV_UP: case CONTROL.NAV_LEFT: this.ring.move(-1); return true;
      case CONTROL.NAV_DOWN: case CONTROL.NAV_RIGHT: this.ring.move(1); return true;
      case CONTROL.CONFIRM: this.ring.activate(); return true;
      case CONTROL.CANCEL:
        audio.select();
        if (this.pane === 'menu' || this.pane === 'log') this.hide();
        else { this.input.pad.cancelCapture(); this.pane = 'menu'; this.render(); }
        return true;
      case CONTROL.PAUSE: this.hide(); return true;
      case CONTROL.INFO:
        if (this.pane === 'intel') this.hide();
        else { this.pane = 'intel'; this.render(); }
        return true;
      default:
        return true;   // swallow everything else while paused
    }
  }

  prompts() {
    const items = [
      { control: CONTROL.NAV_DOWN, label: 'NAVIGATE' },
      { control: CONTROL.CONFIRM, label: 'SELECT' },
      { control: CONTROL.CANCEL, label: this.pane === 'menu' ? 'RESUME' : 'BACK' },
    ];
    if (this.pane === 'remap') return [{ control: CONTROL.CANCEL, label: 'CANCEL REMAP' }];
    return items;
  }
}
