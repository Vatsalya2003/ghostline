// Headless walk-through of the turn spine. `node scripts/sim.mjs [plan]`
// where plan is a comma-separated action list, e.g.
//   node scripts/sim.mjs CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM
import { depot } from '../src/data/depot.js';
import { GameState } from '../src/systems/GameState.js';
import { TurnManager } from '../src/systems/TurnManager.js';

const plan = (process.argv[2] || 'CONFIRM,SEND_DRONE,CONFIRM,FALL_BACK,CONFIRM,SEND_DRONE,SEND_DRONE,OVERRIDE,OVERRIDE,CONFIRM').split(',');

const state = new GameState(depot);
const tm = new TurnManager(depot, state);
tm.on('turn', (t) => console.log(`\n── T${t.id} ${t.phase}/${t.name} — ${t.ai.confidence} from ${t.ai.unit}`));
tm.on('resolve', (r) => console.log(
  `   ${r.action.padEnd(13)} ${String(r.outcome.tag).padEnd(12)} hp ${String(r.health).padStart(3)} fire ${String(state.fire).padStart(3)} drones ${state.drones}`));
tm.on('end', (s) => {
  console.log(`\nOUTCOME ${s.outcome}  HEALTH ${s.health}  FIRE ${s.fire}  HOSTAGE KILLED ${s.hostageKilled}`);
  console.log('COUNTS', s.counts);
  console.log('VERDICT', s.verdict);
});

tm.start();
for (const action of plan) {
  if (state.missionOver) break;
  const res = tm.choose(action.trim());
  if (!res) { console.log(`   !! ${action} unavailable this turn`); }
  if (!state.missionOver && res && !res.probe) tm.advanceTurn();
}
if (!state.missionOver) tm.endMission('partial');
