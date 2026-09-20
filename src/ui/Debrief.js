import { CALIBRATION } from '../data/mission1.js';
import { FocusRing } from './Focus.js';
import { audio } from '../systems/Audio.js';

// Two scores, reported separately and deliberately allowed to disagree:
// you can bring the squad home and still be told your judgement was poor.
// Defaults, deliberately mission-agnostic. A mission overrides any of these
// with its own `outcomeCopy` — the old table said "Relay restored" for every
// ending of every mission, which is mission 1's sentence being read out over
// a compound that has no relay in it.
const OUTCOME_COPY = {
  complete: { title: 'MISSION COMPLETE', sub: 'Objectives met. Squad extracted.', cls: 'outcome-complete' },
  partial: { title: 'OBJECTIVE FAILED', sub: 'Squad extracted. The objective was not met.', cls: 'outcome-partial' },
  aborted: { title: 'MISSION ABORTED', sub: 'You called it off at the objective.', cls: 'outcome-aborted' },
  lost: { title: 'SQUAD LOST', sub: 'Integrity reached zero. No units recovered.', cls: 'outcome-lost' },
  // There are two ways to lose. Reporting the wrong one is worse than saying
  // nothing: a player who was overrun at 70% integrity reads "integrity
  // reached zero" and cannot work out what actually happened to them.
  overrun: { title: 'MISSION LOST', sub: 'The response force reached you. Squad did not extract.', cls: 'outcome-lost' },
};

const ORDER = [
  CALIBRATION.CALIBRATED,
  CALIBRATION.COMPLACENCY,
  CALIBRATION.MISUSE,
  CALIBRATION.DISUSE,
  CALIBRATION.MISTRUST,
  CALIBRATION.DISTRUST,
];

export class Debrief {
  constructor(mission, onReplay) {
    this.mission = mission;
    this.screen = document.getElementById('screen-debrief');
    this.head = document.getElementById('debrief-head');
    this.result = document.getElementById('mission-result');
    this.sub = document.getElementById('mission-sub');
    this.rows = document.getElementById('mode-rows');
    this.verdict = document.getElementById('verdict');
    this.keyTurnLine = document.getElementById('key-turn-line');
    this.decisions = document.getElementById('decision-list');
    this.replayBtn = document.getElementById('btn-replay');
    this.replayBtn.addEventListener('click', onReplay);
    this.ring = new FocusRing({ onFocus: () => audio.hover() });
    this.ring.setItems([this.replayBtn]);
  }

  show(summary) {
    // A loss with the squad still standing was not a loss of the squad — it
    // was the compound closing on them.
    const key = summary.outcome === 'lost' && summary.alarmed && summary.health > 0
      ? 'overrun'
      : summary.outcome;
    const copy = { ...(OUTCOME_COPY[key] || OUTCOME_COPY.partial),
                   ...(this.mission.outcomeCopy?.[key] || {}) };
    this.head.textContent = `DEBRIEF — SQUAD INTEGRITY ${summary.health}%`;
    this.result.textContent = copy.title;
    this.result.className = `verdict-line ${copy.cls}`;
    this.sub.textContent = copy.sub;

    this.rows.innerHTML = '';
    for (const tag of ORDER) {
      const n = summary.counts[tag] || 0;
      const meta = this.mission.failureModeCopy[tag];
      const row = document.createElement('div');
      const isGood = tag === CALIBRATION.CALIBRATED;
      row.className = 'mode-row ' + (n === 0 ? 'zero' : isGood ? '' : 'hit');
      row.innerHTML =
        `<span>${meta.name}<div class="mode-desc">${meta.desc}</div></span><span class="n">${n}</span>`;
      this.rows.appendChild(row);
    }

    // Being seen outranks everything else the debrief has to say. If the
    // compound knew you were in it, that is the sentence the player needs
    // first — the turn-by-turn grading is a footnote to it.
    const alarmLine = summary.alarmed && this.mission.alarmVerdict
      ? this.mission.alarmVerdict.replace('{TURN}', summary.alarmTurn ?? '—')
      : '';
    this.keyTurnLine.textContent = alarmLine || summary.keyTurnLine || '';
    this.keyTurnLine.classList.toggle('alarm', !!alarmLine);
    this.verdict.textContent = summary.verdict;

    this.decisions.innerHTML = '';
    for (const d of summary.decisions) {
      const el = document.createElement('div');
      el.className = 'd';
      el.innerHTML = `TURN ${d.turn} · ${d.action.replace('_', ' ')} — ` +
        `<span class="tag ${d.tag}">${d.tag.toUpperCase()}</span> — ${d.note || ''}`;
      this.decisions.appendChild(el);
    }

    this.screen.classList.remove('hidden');
    this.ring.paint();   // pad and keyboard land on RUN IT AGAIN immediately
  }

  hide() { this.screen.classList.add('hidden'); }
}
