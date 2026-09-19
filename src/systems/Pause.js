// A real pause, not just an input block. The director sequences turns with
// timers, so pausing has to stop the clock those timers run on — otherwise the
// briefing keeps talking behind the menu and you come back three beats late.
//
// Director imports `wait` from here instead of owning its own setTimeout.

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

let paused = false;
const listeners = new Set();

export function isPaused() { return paused; }

export function onPauseChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setPaused(value) {
  const next = !!value;
  if (next === paused) return false;
  paused = next;
  for (const fn of [...listeners]) fn(paused);
  return true;
}

// Drop-in replacement for `(s) => new Promise(r => setTimeout(r, s * 1000))`
// that holds its remaining time across a pause.
export function wait(seconds) {
  return new Promise((resolve) => {
    let remaining = Math.max(0, seconds * 1000);
    let armedAt = 0;
    let timer = null;

    const finish = () => {
      listeners.delete(onChange);
      resolve();
    };
    const arm = () => {
      armedAt = now();
      timer = setTimeout(finish, remaining);
    };
    const onChange = (isNowPaused) => {
      if (isNowPaused) {
        clearTimeout(timer);
        timer = null;
        remaining = Math.max(0, remaining - (now() - armedAt));
      } else {
        arm();
      }
    };

    listeners.add(onChange);
    if (!paused) arm();
  });
}
