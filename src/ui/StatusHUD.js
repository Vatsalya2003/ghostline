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
      chip.innerHTML = `<span class="dot"></span>${id}<span class="state">${STATE_LABEL[status]}</span>`;
      this.squad.appendChild(chip);
    }
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
