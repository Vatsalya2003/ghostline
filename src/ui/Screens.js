import { FocusRing } from './Focus.js';
import { audio } from '../systems/Audio.js';
import { MISSIONS } from '../data/missions.js';

// Title, mission select and briefing. Briefing is skippable after the first
// view. Each screen owns a focus ring so the pad and the arrow keys can reach
// its buttons — before this they were mouse-only and a controller could not
// start the game at all.
export class Screens {
  constructor(mission, { onBegin, onDeploy, onPickMission }) {
    this.title = document.getElementById('screen-title');
    this.select = document.getElementById('screen-select');
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
    this.selectRing = new FocusRing({ onFocus: () => audio.hover() });
    this.briefingRing = new FocusRing({ onFocus: () => audio.hover() });
    this.titleRing.setItems([this.beginBtn]);
    this.briefingRing.setItems([this.deployBtn]);

    this.buildCards(onPickMission);
  }

  // One card per registered mission. Buttons rather than divs, so the focus
  // ring, the keyboard and the pointer all reach them by the same route the
  // rest of the UI already uses.
  buildCards(onPickMission) {
    const host = document.getElementById('mission-cards');
    host.innerHTML = '';
    const cards = MISSIONS.map((entry) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mission-card';
      card.innerHTML = `
        <span class="m-name">${entry.name}</span>
        <span class="m-place">${entry.place}</span>
        <span class="m-meta">${entry.turns} TURNS · ${entry.duration}</span>
        <span class="m-blurb">${entry.blurb}</span>`;
      card.addEventListener('click', () => { audio.select(); onPickMission?.(entry); });
      card.addEventListener('pointerenter', () => {
        if (this.selectRing.focusElement(card)) audio.hover();
      });
      host.appendChild(card);
      return card;
    });
    this.selectRing.setItems(cards);
  }

  showTitle() { this.title.classList.remove('hidden'); this.titleRing.paint(); }
  hideTitle() { this.title.classList.add('hidden'); }
  showSelect() { this.select.classList.remove('hidden'); this.selectRing.paint(); }
  hideSelect() { this.select.classList.add('hidden'); }
  showBriefing() { this.briefing.classList.remove('hidden'); this.briefingRing.paint(); }
  hideBriefing() { this.briefing.classList.add('hidden'); this.seenBriefing = true; }
}
