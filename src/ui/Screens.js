import { FocusRing } from './Focus.js';
import { audio } from '../systems/Audio.js';

// Title and briefing. Briefing is skippable after the first view.
// Each screen owns a focus ring so the pad and the arrow keys can reach its
// buttons — before this they were mouse-only and a controller could not start
// the game at all.
export class Screens {
  constructor(mission, { onBegin, onDeploy }) {
    this.title = document.getElementById('screen-title');
    this.briefing = document.getElementById('screen-briefing');
    this.seenBriefing = false;

    document.getElementById('title-sub').textContent = mission.subtitle;
    const list = document.getElementById('briefing-list');
    list.innerHTML = '';
    for (const line of mission.briefing) {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    }

    this.beginBtn = document.getElementById('btn-begin');
    this.deployBtn = document.getElementById('btn-deploy');
    this.beginBtn.addEventListener('click', onBegin);
    this.deployBtn.addEventListener('click', onDeploy);

    this.titleRing = new FocusRing({ onFocus: () => audio.hover() });
    this.briefingRing = new FocusRing({ onFocus: () => audio.hover() });
    this.titleRing.setItems([this.beginBtn]);
    this.briefingRing.setItems([this.deployBtn]);
  }

  showTitle() { this.title.classList.remove('hidden'); this.titleRing.paint(); }
  hideTitle() { this.title.classList.add('hidden'); }
  showBriefing() { this.briefing.classList.remove('hidden'); this.briefingRing.paint(); }
  hideBriefing() { this.briefing.classList.add('hidden'); this.seenBriefing = true; }
}
