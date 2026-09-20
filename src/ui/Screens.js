import { FocusRing } from './Focus.js';
import { audio } from '../systems/Audio.js';
import { MISSIONS } from '../data/missions.js';

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
    // The briefing headline is the place, which is the tail of the subtitle:
    // "OPERATION DRY CREEK — RELAY STATION 7". It used to be typed into the
    // markup, so every mission after the first briefed you to Relay Station 7.
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

    this.beginBtn = document.getElementById('btn-begin');
    this.deployBtn = document.getElementById('btn-deploy');
    this.beginBtn.addEventListener('click', onBegin);
    this.deployBtn.addEventListener('click', onDeploy);

    // The mission picker. Rows come straight out of the MISSIONS registry, so
    // adding a mission is still adding a row there and nothing else — this
    // renders that list, it does not keep a second one.
    //
    // Selecting reloads with ?mission=<id> rather than swapping the mission
    // in place: main.js builds the scene, the level and the game state from
    // the chosen mission at startup, and a reload is a great deal cheaper and
    // safer than tearing all three down and rebuilding them live.
    this.missionButtons = [];
    const picker = document.getElementById('mission-select');
    if (picker) {
      picker.innerHTML = '';
      for (const entry of MISSIONS) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'mission-row';
        row.dataset.mission = entry.id;
        if (entry.mission.id === mission.id) row.classList.add('active');
        row.innerHTML = `<span class="mission-row-name">${entry.name}</span>`
          + `<span class="mission-row-dur">${entry.duration}</span>`
          + `<span class="mission-row-blurb">${entry.blurb}</span>`;
        row.addEventListener('click', () => {
          if (entry.mission.id === mission.id) return;   // already on it
          audio.select();
          const q = new URLSearchParams(location.search);
          q.set('mission', entry.id);
          location.search = q.toString();
        });
        picker.appendChild(row);
        this.missionButtons.push(row);
      }
    }

    this.titleRing = new FocusRing({ onFocus: () => audio.hover() });
    this.briefingRing = new FocusRing({ onFocus: () => audio.hover() });
    // The pad and the arrow keys reach the picker as well as the button — a
    // mission you can only choose with a mouse is not selectable on a pad.
    //
    // Ring order follows the screen, rows above the button, but the ring lands
    // on BEGIN MISSION the way it always has: setItems() would otherwise focus
    // the first row, and a pad user pressing A on the title screen would pick
    // a mission instead of starting one.
    this.titleRing.setItems([...this.missionButtons, this.beginBtn]);
    this.titleRing.focusElement(this.beginBtn);
    this.briefingRing.setItems([this.deployBtn]);
  }

  showTitle() { this.title.classList.remove('hidden'); this.titleRing.paint(); }
  hideTitle() { this.title.classList.add('hidden'); }
  showBriefing() { this.briefing.classList.remove('hidden'); this.briefingRing.paint(); }
  hideBriefing() { this.briefing.classList.add('hidden'); this.seenBriefing = true; }
}
