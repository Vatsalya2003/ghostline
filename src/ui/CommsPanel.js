import { CONFIDENCE } from '../data/mission1.js';
import { typewrite, speak, stopSpeaking } from '../systems/Dialogue.js';
import { voiceBank } from '../systems/Voice.js';
import { audio } from '../systems/Audio.js';

// The AI's voice: typed caption, stated confidence, and — crucially — the
// unit the reading actually came from.
//
// A line arrives as three things at once, which is what makes it read as a
// transmission rather than a subtitle: the VOICE (a bundled clip, or Web
// Speech if there is no clip), the CAPTION (always — it is the contract, and
// the only one of the three that is never optional), and the INDICATOR (the
// TX light in the panel header, live for exactly as long as the channel is).
export class CommsPanel {
  constructor({ onType } = {}) {
    this.el = document.getElementById('comms');
    this.textEl = document.getElementById('comms-text');
    this.sourceEl = document.getElementById('comms-source');
    this.relayEl = document.getElementById('comms-relay');
    this.confBox = document.getElementById('confidence');
    this.confLabel = document.getElementById('conf-label');
    this.confNote = document.getElementById('conf-note');
    this.segments = [...document.querySelectorAll('.conf-seg')];
    this.active = null;
    this.onType = onType;

    // Built here rather than in index.html so the markup and the code that
    // drives it stay in one place.
    this.txEl = document.createElement('span');
    this.txEl.id = 'comms-tx';
    this.txEl.textContent = 'TX';
    document.getElementById('comms-head')?.appendChild(this.txEl);

    // Click anywhere on the comms panel to skip to the full line.
    this.el.addEventListener('click', () => this.skip());
  }

  // True while a line is still landing — the router uses it to decide
  // whether CANCEL means "skip this line" or "open the pause menu".
  isTyping() { return !!this.active && !this.active.isDone(); }

  skip() {
    if (this.active && !this.active.isDone()) {
      this.active.skip();
      stopSpeaking();
      voiceBank.stop();
    }
  }

  // The channel is open: carrier up, beds down, TX light on.
  openChannel() {
    this.el.classList.add('speaking');
    this.txEl.classList.add('on');
    audio.setLayer('carrier', 1, 0.08);
    audio.duck(0.45, 0.2);
  }

  closeChannel() {
    this.el.classList.remove('speaking');
    this.txEl.classList.remove('on');
    audio.setLayer('carrier', 0, 0.35);
    audio.unduck(0.8);
  }

  setConfidence(key, { suspect = false } = {}) {
    const conf = CONFIDENCE[key] || CONFIDENCE.NONE;
    this.confLabel.textContent = conf.label;
    this.segments.forEach((seg, i) => seg.classList.toggle('on', i < conf.level));
    this.confBox.classList.toggle('suspect', suspect);
    this.confNote.textContent = suspect ? 'SOURCE DEGRADED' : '';
  }

  // sourceStatus drives the glitch treatment on the speaker's name — the
  // visual tell that a confident number came out of a broken sensor.
  async say(text, { source = 'ALPHA', via = null, confidence = null, sourceStatus = 'healthy', voice = true } = {}) {
    this.el.classList.add('speaking');
    this.sourceEl.textContent = source;
    this.sourceEl.classList.toggle('glitch', sourceStatus !== 'healthy');
    this.relayEl.textContent = via ? `RELAYED VIA ${via}` : '';
    if (confidence) this.setConfidence(confidence, { suspect: sourceStatus !== 'healthy' });

    this.openChannel();

    // Pace the caption to the clip. The old fixed 28ms/char finished the
    // caption less than halfway through a spoken line, so the panel sat
    // reading DONE while the voice kept talking. A bundled clip knows its own
    // length, so the last character can land with the last word.
    let charMs;
    if (voice) {
      const seconds = await voiceBank.play(text);
      if (seconds) charMs = Math.max(12, (seconds * 1000) / Math.max(1, text.length));
      else speak(text);          // no clip for this line — Web Speech covers it
    }

    this.active = typewrite(this.textEl, text, { charMs, onChar: this.onType });
    await this.active.promise;
    this.closeChannel();
  }

  clearConfidence() {
    this.setConfidence('NONE');
  }

  // Wipe the panel between turns. The previous turn's answer left sitting here
  // through the next intro reads as the squad still talking — which is exactly
  // wrong during turn 3, where the silence after the breach is the point.
  reset() {
    this.skip();
    // skip() only stops audio while a caption is still typing. A voice clip can
    // outlive its caption — the Web Speech fallback has no known duration, so
    // the typewriter runs at its default rate and finishes first — and the
    // previous turn's line then talks over the next turn's intro. Stop it
    // unconditionally; stopSpeaking() is a no-op when nothing is playing.
    stopSpeaking();
    this.active = null;
    this.textEl.textContent = '';
    this.sourceEl.textContent = '—';
    this.sourceEl.classList.remove('glitch');
    this.relayEl.textContent = '';
    this.closeChannel();
    this.clearConfidence();
  }
}
