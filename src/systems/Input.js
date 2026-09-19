// Mouse and gamepad, both always live. Neither one disables the other.
// Button indices follow the standard mapping; macOS + PS4 over Bluetooth
// matches it, but PAD_MAP is one object to edit if a pad disagrees.
const PAD_MAP = {
  0: 'CONFIRM',        // cross
  1: 'FALL_BACK',      // circle
  2: 'FIRE',           // square
  3: 'ASK_WHY',        // triangle
  4: 'SWITCH_WEAPON',  // L1
  5: 'SEND_DRONE',     // R1
  6: 'GRENADE',        // L2
  7: 'NIGHT_VISION',   // R2
  9: 'ABORT',          // options
  8: 'OVERRIDE',       // share
};

const DPAD = { 12: -1, 13: 1, 14: -1, 15: 1 }; // up/left back, down/right forward

export class Input {
  constructor({ commandBar, onAction, onSkip }) {
    this.commandBar = commandBar;
    this.onAction = onAction;
    this.onSkip = onSkip;
    this.prev = {};
    this.connected = false;

    window.addEventListener('gamepadconnected', (e) => {
      this.connected = true;
      console.log(`[input] gamepad connected: ${e.gamepad.id}`);
    });
    window.addEventListener('gamepaddisconnected', () => { this.connected = false; });

    // Keyboard shadows the pad so the game is playable without either.
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.commandBar.activateFocused(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.commandBar.moveFocus(1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.commandBar.moveFocus(-1);
      else if (e.key === 'Escape') this.onSkip();
    });
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      pad.buttons.forEach((btn, i) => {
        const pressed = btn.pressed || btn.value > 0.5;
        const was = this.prev[`${pad.index}:${i}`];
        this.prev[`${pad.index}:${i}`] = pressed;
        if (!pressed || was) return;

        if (DPAD[i] !== undefined) { this.commandBar.moveFocus(DPAD[i]); return; }
        const action = PAD_MAP[i];
        if (action) this.onAction(action);
      });
    }
  }
}
