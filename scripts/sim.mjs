// Headless walk of the facility. `node scripts/sim.mjs ACTION,ACTION,...`
// Moves are NORTH/EAST/SOUTH/WEST; everything else is a room action.
//   node scripts/sim.mjs NORTH,EAST,NORTH,SEND_DRONE,NORTH,SEND_DRONE,SOUTH
import { depot } from '../src/data/depot.js';
import { GameState } from '../src/systems/GameState.js';
import { RoomManager } from '../src/systems/RoomManager.js';

const DIRS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
const plan = (process.argv[2] || 'NORTH,EAST,NORTH,SEND_DRONE,NORTH,SEND_DRONE,SOUTH,SOUTH,EAST,SOUTH,OVERRIDE')
  .split(',').map((a) => a.trim()).filter(Boolean);

const state = new GameState(depot);
const rm = new RoomManager(depot, state);

rm.on('room', ({ room }) => console.log(
  `\n┌─ ${(room.full || room.name).padEnd(22)} hp ${String(state.health).padStart(3)} · drones ${state.drones}` +
  `${state.alarm ? ` · 🚨 ${state.movesLeft} MOVES` : ''}`));
rm.on('resolve', (r) => {
  const tag = r.outcome.tag ? String(r.outcome.tag).toUpperCase() : '·';
  console.log(`│  ${r.action.padEnd(12)} ${tag.padEnd(12)} ${r.raisedAlarm ? '🚨 SEEN  ' : ''}${r.outcome.log || ''}`);
});
rm.on('probe', (r) => console.log(`│  ${r.action.padEnd(12)} ${'(free)'.padEnd(12)} ${r.outcome.log || ''}`));
rm.on('alarm', (n) => console.log(`│  *** ALARM RAISED — ${n} MOVES REMAINING ***`));
rm.on('end', (s) => {
  console.log(`\n═══ OUTCOME ${String(s.outcome).toUpperCase()}  hp ${s.health}  drones left ${s.dronesLeft}  rooms ${s.roomsExplored}/${Object.keys(depot.rooms).length}`);
  console.log('    hostage killed:', s.hostageKilled, '· hostages out:', s.hostagesExtracted);
  console.log('    COUNTS', Object.entries(s.counts).filter(([, n]) => n).map(([k, n]) => `${k}:${n}`).join(' ') || 'none');
  if (s.keyTurnLine) console.log('    KEY ROOM FAILED —', s.keyTurnLine);
  console.log('    VERDICT', s.verdict);
});

rm.start();
for (const step of plan) {
  if (state.missionOver) break;
  const action = DIRS.includes(step) ? `MOVE_${step}` : step;
  const avail = rm.availableActions().find((a) => a.action === action);
  if (!avail) { console.log(`│  !! ${step} — no such door/action here`); continue; }
  if (avail.disabled) { console.log(`│  !! ${step} — DISABLED (${avail.reason})`); continue; }
  const res = rm.choose(action);
  if (res && !res.probe) rm.commit(res);
}
if (!state.missionOver) {
  console.log(`\n═══ ran out of plan in ${state.room} · hp ${state.health} · drones ${state.drones}` +
    `${state.alarm ? ` · 🚨 ${state.movesLeft} moves left` : ''}`);
}
