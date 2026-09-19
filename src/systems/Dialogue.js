// Typewriter captions + Web Speech synthesis. Voice is a bonus; the caption
// is the contract. If TTS is unavailable the line still plays.

import { isPaused } from './Pause.js';
import { voiceBank } from './Voice.js';

const CHAR_MS = 28;

let voice = null;
let voicesReady = false;

// Chrome populates voices asynchronously — ask twice and listen for the event.
export function initVoices() {
  if (!('speechSynthesis' in window)) return;
  const pick = () => {
    const all = window.speechSynthesis.getVoices();
    if (!all.length) return;
    voice = all.find((v) => /en[-_]US/i.test(v.lang) && /google|samantha|alex|daniel/i.test(v.name))
      || all.find((v) => /^en/i.test(v.lang))
      || all[0];
    voicesReady = true;
  };
  pick();
  window.speechSynthesis.addEventListener('voiceschanged', pick);
}

export function speak(text, { pitch = 0.35, rate = 1.02, volume = 0.9 } = {}) {
  if (!('speechSynthesis' in window)) return null;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/—/g, ','));
    if (voicesReady && voice) u.voice = voice;
    u.pitch = pitch; u.rate = rate; u.volume = volume;
    window.speechSynthesis.speak(u);
    return u;
  } catch {
    return null;
  }
}

// Stops whichever of the two voices is actually talking. Callers should not
// have to know which one answered a given line.
export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  voiceBank.stop();
}

// Types into an element. Returns { promise, skip } — the caller wires skip to
// a click so an impatient player is never stuck watching characters land.
export function typewrite(el, text, { charMs = CHAR_MS, onChar } = {}) {
  let i = 0;
  let done = false;
  let timer = null;
  let finish = () => {};

  el.textContent = '';
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.textContent = '_';
  el.appendChild(caret);

  const promise = new Promise((resolve) => {
    finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.textContent = text;
      el.appendChild(caret);
      resolve();
    };

    const step = () => {
      if (done) return;
      // Hold the caption on the character it stopped at. Without this the line
      // finishes typing behind the pause menu and the voice comes back
      // mid-sentence against a caption that is already done.
      if (isPaused()) { timer = setTimeout(step, 120); return; }
      i += 1;
      el.textContent = text.slice(0, i);
      el.appendChild(caret);
      if (onChar && i % 3 === 0) onChar(i);
      if (i >= text.length) return finish();
      timer = setTimeout(step, charMs);
    };

    timer = setTimeout(step, charMs);
  });

  return {
    promise,
    skip: () => finish(),
    isDone: () => done,
  };
}
