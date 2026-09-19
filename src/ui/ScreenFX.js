// Full-screen event presentation, done on the HTML layer.
//
// The stack doc rules out post-processing passes for this build, so everything
// here is CSS compositing over the canvas: cheap, no extra render target, and
// it never touches frame time in the WebGL context. Each call sets a class and
// the stylesheet owns the timing, so tuning a beat is a CSS edit.

const EVENT_TINT = {
  damage: 'rgba(224, 82, 76, 0.55)',
  alarm: 'rgba(224, 168, 76, 0.50)',
  breach: 'rgba(255, 224, 180, 0.62)',
  scan: 'rgba(76, 224, 216, 0.34)',
  relay: 'rgba(76, 224, 216, 0.46)',
  contact: 'rgba(224, 82, 76, 0.42)',
};

export class ScreenFX {
  constructor() {
    this.overlay = document.getElementById('fx-overlay');
    this.damage = document.getElementById('damage-flash');
    this.event = document.getElementById('event-flash');
    this.fade = document.getElementById('screen-fade');
    this.sweep = document.getElementById('deploy-sweep');
    this.timers = new Map();
  }

  // One-shot class that removes itself. Re-firing restarts the animation
  // rather than being swallowed because the class is already on.
  once(el, cls, ms) {
    if (!el) return;
    clearTimeout(this.timers.get(el));
    el.classList.remove(cls);
    void el.offsetWidth;            // force reflow so the animation replays
    el.classList.add(cls);
    this.timers.set(el, setTimeout(() => el.classList.remove(cls), ms));
  }

  // Hard hit — the existing damage vignette, kept at its old feel.
  hit() { this.once(this.damage, 'on', 130); }

  // Coloured edge bloom for everything that is not damage.
  flash(kind = 'scan', ms = 380) {
    if (!this.event) return this.hit();
    this.event.style.setProperty('--tint', EVENT_TINT[kind] || EVENT_TINT.scan);
    this.once(this.event, 'on', ms);
  }

  // Signal break: scanlines roll and the whole frame offsets for a few frames.
  // Used when a sensor fails, not as general decoration.
  glitch(ms = 420) { this.once(this.overlay, 'glitching', ms); }

  // Held state while the AI is transmitting — the frame edge warms slightly so
  // "something is talking to you" is visible without reading the caption.
  transmission(on) {
    this.overlay?.classList.toggle('transmitting', !!on);
  }

  // Held state while any unit is degraded: a permanent low-level unease.
  degraded(on) {
    this.overlay?.classList.toggle('degraded', !!on);
  }

  alert(on) {
    this.overlay?.classList.toggle('alerting', !!on);
  }

  // Mission start: a single scan bar wipes down the frame as the fog lifts.
  deploySweep() { this.once(this.sweep, 'on', 1500); }

  // Mission end: fade the board out under the debrief.
  fadeOut(kind = 'success', ms = 900) {
    if (!this.fade) return;
    this.fade.className = kind;
    void this.fade.offsetWidth;
    this.fade.classList.add('on');
    return new Promise((r) => setTimeout(r, ms));
  }

  fadeClear() {
    if (!this.fade) return;
    this.fade.classList.remove('on');
  }

  reset() {
    this.transmission(false);
    this.degraded(false);
    this.alert(false);
    this.fadeClear();
    this.overlay?.classList.remove('glitching');
  }
}
