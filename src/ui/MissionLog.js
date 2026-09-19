// Scrolling transcript. Newest line is highlighted, older lines cool off.
export class MissionLog {
  constructor() {
    this.el = document.getElementById('log-lines');
  }

  push(text) {
    if (!text) return;
    for (const old of this.el.querySelectorAll('.new')) old.classList.remove('new');
    const line = document.createElement('div');
    line.className = 'new';
    line.textContent = text;
    this.el.appendChild(line);
    while (this.el.children.length > 40) this.el.removeChild(this.el.firstChild);
    this.el.scrollTop = this.el.scrollHeight;
  }

  // A rule between turns. Without it the transcript reads as one undivided
  // wall by turn 4, and the debrief asks the player to remember which call
  // belonged to which moment.
  pushTurn(turn) {
    if (!turn) return;
    for (const old of this.el.querySelectorAll('.new')) old.classList.remove('new');
    const mark = document.createElement('div');
    mark.className = 'turn-mark';
    mark.textContent = `TURN ${turn.id} · ${turn.name}`;
    this.el.appendChild(mark);
    while (this.el.children.length > 40) this.el.removeChild(this.el.firstChild);
    this.el.scrollTop = this.el.scrollHeight;
  }

  clear() { this.el.innerHTML = ''; }
}
