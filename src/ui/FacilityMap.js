// The facility map. A room is dark until a robot has actually looked into it —
// what the AI claims about a room never lights it up. This panel is where the
// player can see the difference between "it told me it was clear" and "we
// looked", which is the entire mechanic made visible.

const CELL_W = 58;
const CELL_H = 34;
const GAP_X = 22;
const GAP_Y = 20;

export class FacilityMap {
  constructor(mission) {
    this.mission = mission;
    this.el = document.getElementById('facility-map');
    this.legend = document.getElementById('map-legend');
    if (!this.el) return;
    this.cells = {};
    this.build();
  }

  pos([col, row]) {
    return { left: col * (CELL_W + GAP_X), top: row * (CELL_H + GAP_Y) };
  }

  build() {
    const rooms = this.mission.rooms || {};
    this.el.innerHTML = '';

    let maxCol = 0; let maxRow = 0;
    for (const r of Object.values(rooms)) {
      maxCol = Math.max(maxCol, r.grid[0]);
      maxRow = Math.max(maxRow, r.grid[1]);
    }
    this.el.style.width = `${(maxCol + 1) * CELL_W + maxCol * GAP_X}px`;
    this.el.style.height = `${(maxRow + 1) * CELL_H + maxRow * GAP_Y}px`;

    // Connectors first so cells paint over them.
    const drawn = new Set();
    for (const [id, room] of Object.entries(rooms)) {
      for (const move of Object.values(room.moves || {})) {
        const key = [id, move.to].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const a = this.pos(room.grid);
        const b = this.pos(rooms[move.to].grid);
        const link = document.createElement('div');
        link.className = 'map-link';
        if (room.grid[1] === rooms[move.to].grid[1]) {
          link.style.left = `${Math.min(a.left, b.left) + CELL_W}px`;
          link.style.top = `${a.top + CELL_H / 2}px`;
          link.style.width = `${Math.abs(a.left - b.left) - CELL_W}px`;
          link.style.height = '1px';
        } else {
          link.style.left = `${a.left + CELL_W / 2}px`;
          link.style.top = `${Math.min(a.top, b.top) + CELL_H}px`;
          link.style.height = `${Math.abs(a.top - b.top) - CELL_H}px`;
          link.style.width = '1px';
        }
        this.el.appendChild(link);
      }
    }

    for (const [id, room] of Object.entries(rooms)) {
      const { left, top } = this.pos(room.grid);
      const cell = document.createElement('div');
      cell.className = 'map-room unknown';
      cell.style.left = `${left}px`;
      cell.style.top = `${top}px`;
      cell.innerHTML = '<span class="map-name">?????</span><span class="map-marks"></span>';
      this.el.appendChild(cell);
      this.cells[id] = cell;
    }
  }

  update(state) {
    const rooms = this.mission.rooms || {};
    for (const [id, room] of Object.entries(rooms)) {
      const cell = this.cells[id];
      if (!cell) continue;

      const seen = state.scouted.has(id);
      const mapped = state.mapped.has(id);
      const here = state.room === id;
      const cleared = state.cleared.has(id);
      const known = seen || mapped;

      cell.className = 'map-room'
        + (here ? ' here' : '')
        + (seen ? ' seen' : mapped ? ' mapped' : ' unknown')
        + (cleared ? ' cleared' : '');

      const name = cell.querySelector('.map-name');
      const marks = cell.querySelector('.map-marks');
      name.textContent = known ? room.name : '?????';

      // Contents only ever show for a room somebody actually looked into.
      let m = '';
      if (seen) {
        if ((room.hostiles || 0) > 0 && !cleared) m += '▲'.repeat(room.hostiles);
        if ((room.hostages || 0) > 0 && !state.hostagesExtracted) m += '◆';
        if (room.objective) m += '✱';
        if (room.intel && !state.explored.has(id)) m += 'ℹ';
      } else if (mapped) {
        if ((room.hostages || 0) > 0) m += '◆';
        if (room.objective) m += '✱';
      }
      marks.textContent = m;
      if ((room.hostiles || 0) > 0 && seen && !cleared) cell.classList.add('contact');
    }
  }
}
