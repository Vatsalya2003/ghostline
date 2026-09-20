import { UNIT_BADGE } from '../render/Units.js';

// Turn counter, squad integrity, per-unit status, drone stock.
const STATE_LABEL = { healthy: 'NOMINAL', glitch: 'SENSOR GLITCH', damaged: 'DAMAGED' };

export class StatusHUD {
  constructor(mission) {
    this.mission = mission;
    this.turnName = document.getElementById('turn-name');
    this.turnCount = document.getElementById('turn-count');
    this.fill = document.getElementById('health-fill');
    this.ghost = document.getElementById('health-ghost');
    this.healthBox = document.getElementById('health-box');
    this.value = document.getElementById('health-value');
    this.lastHealth = 100;
    this.squad = document.getElementById('squad-list');
    this.pips = document.getElementById('drone-pips');
    this.situation = document.getElementById('situation-text');
    this.task = document.getElementById('task-text');
    this.objectiveEl = document.getElementById('objective');
    this.objectiveEl.textContent = mission.objective;
    this.selected = null;
    this.lastStatuses = { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' };
    this.lastAmmo = null;
  }

  // Which unit LB/RB last framed. Kept on the HUD so a re-render of the chips
  // (every status change) does not silently drop the highlight.
  setSelected(id) {
    this.selected = id;
    for (const chip of this.squad.children) {
      chip.classList.toggle('selected', chip.dataset.unit === id);
    }
  }

  setTurn(turn) {
    // Cross-fade the briefing text rather than swapping it under the player's
    // eye — a hard swap mid-read looks like a bug.
    this.situation.parentElement?.classList.add('changing');
    setTimeout(() => this.situation.parentElement?.classList.remove('changing'), 220);
    this.turnName.textContent = turn ? turn.name : 'STANDBY';
    this.turnCount.textContent = turn
      ? `TURN ${turn.id} / ${this.mission.turns.length}`
      : `TURN — / ${this.mission.turns.length}`;
    this.situation.textContent = turn ? turn.situation : '—';
    this.task.textContent = turn ? turn.task : '—';
  }

  setHealth(health) {
    // On a loss, leave a red ghost over the slice that just went, so the size
    // of the hit is visible and not just the number that replaced it.
    const lost = this.lastHealth - health;
    if (lost > 0 && this.ghost) {
      this.ghost.style.left = `${health}%`;
      this.ghost.style.width = `${lost}%`;
      this.ghost.classList.remove('on');
      void this.ghost.offsetWidth;
      this.ghost.classList.add('on');
      this.healthBox?.classList.remove('hit');
      void this.healthBox?.offsetWidth;
      this.healthBox?.classList.add('hit');
      setTimeout(() => {
        this.ghost.classList.remove('on');
        this.healthBox?.classList.remove('hit');
      }, 720);
    }
    this.lastHealth = health;

    this.fill.style.width = `${health}%`;
    this.fill.classList.toggle('warn', health <= 60 && health > 30);
    this.fill.classList.toggle('crit', health <= 30);
    this.value.textContent = `${health}%`;
    this.renderSquad();
  }

  // Per-unit condition, derived honestly and cheaply: the squad carries one
  // integrity number, and a unit's own status scales its share of it. A
  // DAMAGED unit is not at the squad average and should not be drawn there.
  static UNIT_FACTOR = { healthy: 1, glitch: 0.78, damaged: 0.42 };

  setStatuses(statuses, ammo) {
    if (statuses) this.lastStatuses = statuses;
    if (ammo) this.lastAmmo = ammo;
    this.renderSquad();
  }

  renderSquad() {
    const statuses = this.lastStatuses;
    if (!statuses || !this.squad) return;
    this.squad.innerHTML = '';
    for (const [id, status] of Object.entries(statuses)) {
      const row = document.createElement('div');
      row.className = `unit-row ${status}` + (id === this.selected ? ' selected' : '');
      row.dataset.unit = id;
      const hp = Math.round(this.lastHealth * (StatusHUD.UNIT_FACTOR[status] ?? 1));
      // No per-unit magazine in the mission data, so this is the squad's
      // shared ammunition pool — real, and it goes down when they shoot.
      const rounds = this.lastAmmo?.[id];
      const ammoText = rounds == null ? '——' : String(rounds).padStart(2, '0');
      row.innerHTML =
        `<div class="unit-face"><span class="eye"></span>` +
        `<span class="badge">${UNIT_BADGE[id] || '?'}</span></div>` +
        `<div class="unit-meta">` +
          `<div class="unit-name">${id}<span class="unit-state">${STATE_LABEL[status]}</span></div>` +
          `<div class="unit-bar"><div class="unit-fill" style="width:${hp}%"></div></div>` +
          `<div class="unit-ammo"><span class="lbl">AMMO</span>` +
            `<span class="val${rounds === 0 ? ' dry' : ''}">${ammoText}</span></div>` +
        `</div>`;
      this.squad.appendChild(row);
    }
  }

  // The objective board. Two rows that can come out differently, because the
  // mission is scored twice and the player should be able to see that coming
  // rather than learn it at the debrief.
  setObjectives(objectives) {
    if (!objectives?.length) return;
    this.objectiveEl.innerHTML = '';
    this.objectiveEl.classList.add('rows');
    for (const o of objectives) {
      const row = document.createElement('div');
      row.className = `obj ${o.state}`;
      row.dataset.objective = o.id;
      const mark = o.state === 'done' ? '✓' : o.state === 'failed' ? '✕' : '·';
      row.innerHTML = `<span class="mark">${mark}</span>${o.label}`;
      this.objectiveEl.appendChild(row);
    }
  }

  // The response clock. Hidden until the compound knows; once it does, it is
  // the first thing on the HUD and it does not go away.
  setAlarm({ alarmed, responseIn }) {
    if (!this.alarmBox) {
      this.alarmBox = document.getElementById('alarm-box');
      this.alarmCount = document.getElementById('alarm-count');
    }
    if (!this.alarmBox) return;
    this.alarmBox.classList.toggle('hidden', !alarmed);
    if (!alarmed) { this.alarmBox.classList.remove('critical'); return; }
    const n = Math.max(0, responseIn ?? 0);
    this.alarmCount.textContent = n === 1 ? '1 TURN' : `${n} TURNS`;
    this.alarmBox.classList.toggle('critical', n <= 2);
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
