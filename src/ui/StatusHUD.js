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
    this.alarmBox = document.getElementById('alarm-box');
    this.alarmState = document.getElementById('alarm-state');
    this.alarmMoves = document.getElementById('alarm-moves');
    this.mapBox = document.getElementById('map-box');
    // Only navigated missions have a facility to be detected in.
    const nav = !!mission.navigated;
    this.alarmBox.style.display = nav ? '' : 'none';
    this.mapBox.style.display = nav ? '' : 'none';
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

  setRoom(room, state) {
    this.turnName.textContent = room ? room.full || room.name : 'STANDBY';
    this.turnCount.textContent = room
      ? `${state.explored.size} / ${Object.keys(this.mission.rooms).length} ROOMS ENTERED`
      : '—';
    this.situation.textContent = room ? room.situation : '—';
    this.task.textContent = room ? room.task : '—';
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

  // Two states only: nobody knows you are here, or everybody does and you
  // have six moves. There is no middle setting and there is no going back.
  setAlarm(alarm, movesLeft) {
    if (!this.alarmBox || this.alarmBox.style.display === 'none') return;
    this.alarmBox.classList.toggle('alerted', !!alarm);
    this.alarmBox.classList.toggle('critical', !!alarm && movesLeft <= 2);
    this.alarmState.textContent = alarm ? 'ALERTED' : 'UNDETECTED';
    this.alarmMoves.textContent = alarm
      ? `${movesLeft} MOVE${movesLeft === 1 ? '' : 'S'} REMAINING`
      : 'NO CONTACT REPORTED';
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
