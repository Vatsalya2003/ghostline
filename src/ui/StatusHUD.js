import { UNIT_BADGE } from '../render/Units.js';

// Turn counter, squad integrity, per-unit status, drone stock.
const STATE_LABEL = { healthy: 'NOMINAL', glitch: 'SENSOR GLITCH', damaged: 'DAMAGED' };

export class StatusHUD {
  constructor(mission) {
    this.mission = mission;
    this.turnName = document.getElementById('turn-name');
    this.turnCount = document.getElementById('turn-count');
    this.fill = document.getElementById('health-fill');
    this.value = document.getElementById('health-value');
    this.squad = document.getElementById('squad-list');
    this.pips = document.getElementById('drone-pips');
    this.fireFill = document.getElementById('fire-fill');
    this.fireValue = document.getElementById('fire-value');
    this.fireBox = document.getElementById('fire-box');
    document.getElementById('fire-label').textContent = mission.fireLabel || 'Fire';
    // Missions that cannot burn do not show a fire meter at all.
    this.fireBox.style.display = mission.cookoffThreshold ? '' : 'none';
    this.situation = document.getElementById('situation-text');
    this.task = document.getElementById('task-text');
    document.getElementById('objective').textContent = mission.objective;
  }

  setTurn(turn) {
    this.turnName.textContent = turn ? turn.name : 'STANDBY';
    this.turnCount.textContent = turn
      ? `TURN ${turn.id} / ${this.mission.turns.length}`
      : `TURN — / ${this.mission.turns.length}`;
    this.situation.textContent = turn ? turn.situation : '—';
    this.task.textContent = turn ? turn.task : '—';
  }

  setHealth(health) {
    this.fill.style.width = `${health}%`;
    this.fill.classList.toggle('warn', health <= 60 && health > 30);
    this.fill.classList.toggle('crit', health <= 30);
    this.value.textContent = `${health}%`;
  }

  setStatuses(statuses) {
    this.squad.innerHTML = '';
    for (const [id, status] of Object.entries(statuses)) {
      const chip = document.createElement('div');
      chip.className = `unit-chip ${status}`;
      chip.innerHTML = `<span class="badge">${UNIT_BADGE[id] || '?'}</span>${id}` +
        `<span class="state">${STATE_LABEL[status]}</span>`;
      this.squad.appendChild(chip);
    }
  }

  // Fire reads as a state, not a percentage — the player needs "is this
  // getting dangerous", not two significant figures.
  setFire(fire, threshold = 85) {
    if (!this.fireBox || this.fireBox.style.display === 'none') return;
    const pct = Math.min(100, fire);
    const hot = fire >= threshold * 0.55;
    const critical = fire >= threshold * 0.8;
    this.fireFill.style.width = `${pct}%`;
    this.fireFill.classList.toggle('hot', hot);
    this.fireFill.classList.toggle('critical', critical);
    this.fireValue.textContent = fire <= 0 ? 'CONTAINED'
      : critical ? 'AT THE STACK'
      : hot ? 'SPREADING'
      : 'BURNING';
    this.fireValue.classList.toggle('lit', fire > 0 && !critical);
    this.fireValue.classList.toggle('critical', critical);
  }

  setDrones(n) {
    this.pips.innerHTML = '';
    for (let i = 0; i < this.mission.drones; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip' + (i < n ? ' full' : '');
      this.pips.appendChild(pip);
    }
  }
}
