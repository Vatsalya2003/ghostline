import { FocusRing } from './Focus.js';
import { audio } from '../systems/Audio.js';

// Title and briefing. Briefing is skippable after the first view.
//
// There is no mission select: the build ships one mission, so the title
// screen goes straight to its briefing. See src/data/missions.js.
//
// Each screen owns a focus ring so the pad and the arrow keys can reach its
// buttons — before this they were mouse-only and a controller could not start
// the game at all.
export class Screens {
  constructor(mission, { onBegin, onDeploy }) {
    this.title = document.getElementById('screen-title');
    this.briefing = document.getElementById('screen-briefing');
    this.seenBriefing = false;

    document.getElementById('title-sub').textContent = mission.subtitle;
    // The briefing headline is the place, which is the tail of the subtitle:
    // "OPERATION AMMUNITION DEPOT — COMPOUND 14". It used to be typed into the
    // markup, so the depot briefed you to Relay Station 7.
    const briefingTitle = document.getElementById('briefing-title');
    if (briefingTitle) {
      briefingTitle.textContent = mission.subtitle.split('—').pop().trim() || mission.subtitle;
    }
    const list = document.getElementById('briefing-list');
    list.innerHTML = '';
    for (const line of mission.briefing) {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    }

    this.tutorial = document.getElementById('screen-tutorial');
    this.beginBtn = document.getElementById('btn-begin');
    this.tutorialBtn = document.getElementById('btn-tutorial');
    this.tutorialBack = document.getElementById('btn-tutorial-back');
    this.deployBtn = document.getElementById('btn-deploy');
    this.beginBtn.addEventListener('click', onBegin);
    this.deployBtn.addEventListener('click', onDeploy);

    // TUTORIAL is a detour off the title screen, not a step on the way in:
    // it goes back where it came from rather than on to the briefing.
    this.tutorialBtn?.addEventListener('click', () => {
      audio.select();
      this.hideTitle();
      this.showTutorial();
    });
    this.tutorialBack?.addEventListener('click', () => {
      audio.select();
      this.hideTutorial();
      this.showTitle();
    });

    this.titleRing = new FocusRing({ onFocus: () => audio.hover() });
    this.tutorialRing = new FocusRing({ onFocus: () => audio.hover() });
    this.briefingRing = new FocusRing({ onFocus: () => audio.hover() });
    this.titleRing.setItems([this.beginBtn, this.tutorialBtn].filter(Boolean));
    this.tutorialRing.setItems([this.tutorialBack].filter(Boolean));
    this.briefingRing.setItems([this.deployBtn]);
  }

  showTitle() { this.title.classList.remove('hidden'); this.titleRing.paint(); }
  hideTitle() { this.title.classList.add('hidden'); }
  showTutorial() { this.tutorial?.classList.remove('hidden'); this.tutorialRing.paint(); }
  hideTutorial() { this.tutorial?.classList.add('hidden'); }
  showBriefing() { this.briefing.classList.remove('hidden'); this.briefingRing.paint(); }
  hideBriefing() { this.briefing.classList.add('hidden'); this.seenBriefing = true; }
}
