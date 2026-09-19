// Title and briefing. Briefing is skippable after the first view.
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

    document.getElementById('btn-begin').addEventListener('click', onBegin);
    document.getElementById('btn-deploy').addEventListener('click', onDeploy);
  }

  showTitle() { this.title.classList.remove('hidden'); }
  hideTitle() { this.title.classList.add('hidden'); }
  showBriefing() { this.briefing.classList.remove('hidden'); }
  hideBriefing() { this.briefing.classList.add('hidden'); this.seenBriefing = true; }
}
