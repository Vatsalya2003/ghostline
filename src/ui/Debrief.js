import { CALIBRATION } from '../data/mission1.js';
import { FocusRing } from './Focus.js';
import { audio } from '../systems/Audio.js';

// Two scores, reported separately and deliberately allowed to disagree:
// you can bring the squad home and still be told your judgement was poor.
//
// These are Dry Creek's words and they are the fallback, not the rule. A
// mission that declares `outcomeCopy` gets its own ending lines — otherwise
// every mission signs off by telling the player about a relay, which is
// nonsense on the seabed and nonsense in an ammunition depot.
const OUTCOME_COPY = {
  complete: { title: 'MISSION COMPLETE', sub: 'Relay restored. Squad extracted.', cls: 'outcome-complete' },
  partial: { title: 'OBJECTIVE FAILED', sub: 'Squad extracted. The relay never came up.', cls: 'outcome-partial' },
  aborted: { title: 'MISSION ABORTED', sub: 'You called it off at the objective.', cls: 'outcome-aborted' },
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
    this.replayBtn = document.getElementById('btn-replay');
    this.replayBtn.addEventListener('click', onReplay);
    this.ring = new FocusRing({ onFocus: () => audio.hover() });
    this.ring.setItems([this.replayBtn]);
  }

  show(summary) {
    const base = OUTCOME_COPY[summary.outcome] || OUTCOME_COPY.partial;
    // Mission copy overrides field by field, so a mission can retitle an
    // ending without also having to restate its class.
    //
    // One engine outcome can also have several faces. The depot has two ways
    // to come out partial that mean completely different things — the civilian
    // you fired on, and the room you never opened — so an entry may be a list
    // of `{ when: 'flag', … }` and the first flag that is up wins. Same rule
    // as turn and outcome variants in TurnManager: conditions in the data,
    // first match wins, a bare entry at the end as the default.
    let own = (this.mission.outcomeCopy || {})[summary.outcome] || {};
    if (Array.isArray(own)) {
      const flags = summary.flags || {};
      own = own.find((v) => (!v.when || flags[v.when]) && (!v.unless || !flags[v.unless])) || {};
    }
    const copy = { ...base, ...own };
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
    this.ring.paint();   // pad and keyboard land on RUN IT AGAIN immediately
  }

  hide() { this.screen.classList.add('hidden'); }
}
