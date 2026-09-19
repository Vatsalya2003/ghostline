import { CALIBRATION } from '../data/mission1.js';

// Two scores, reported separately and deliberately allowed to disagree:
// you can bring the squad home and still be told your judgement was poor.
const OUTCOME_COPY = {
  complete: { title: 'MISSION COMPLETE', sub: 'Relay restored. Squad extracted.', cls: 'outcome-complete' },
  partial: { title: 'OBJECTIVE FAILED', sub: 'Squad extracted. The relay never came up.', cls: 'outcome-partial' },
  aborted: { title: 'MISSION ABORTED', sub: 'You called it off at the objective.', cls: 'outcome-aborted' },
  costly: { title: 'OBJECTIVE TAKEN', sub: 'The depot is gone. So is a hostage you were sent to bring out.', cls: 'outcome-partial' },
  cookoff: { title: 'STACK COOKED OFF', sub: 'The fire reached the ammunition room before you did. Nobody set a charge.', cls: 'outcome-lost' },
  lost: { title: 'SQUAD LOST', sub: 'Integrity reached zero. No units recovered.', cls: 'outcome-lost' },
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
    document.getElementById('btn-replay').addEventListener('click', onReplay);
  }

  show(summary) {
    const copy = OUTCOME_COPY[summary.outcome] || OUTCOME_COPY.partial;
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

    this.keyTurnLine.textContent = summary.keyTurnLine || '';
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
  }

  hide() { this.screen.classList.add('hidden'); }
}
