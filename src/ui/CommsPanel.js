import { CONFIDENCE } from '../data/mission1.js';
import { typewrite, speak, stopSpeaking } from '../systems/Dialogue.js';

// The AI's voice: typed caption, stated confidence, and — crucially — the
// unit the reading actually came from.
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

    // Click anywhere on the comms panel to skip to the full line.
    this.el.addEventListener('click', () => this.skip());
  }

  skip() {
    if (this.active && !this.active.isDone()) {
      this.active.skip();
      stopSpeaking();
    }
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

    if (voice) speak(text);
    this.active = typewrite(this.textEl, text, { onChar: this.onType });
    await this.active.promise;
    this.el.classList.remove('speaking');
  }

  clearConfidence() {
    this.setConfidence('NONE');
  }
}
