// Headless walk-through of the turn spine. `node scripts/sim.mjs [plan]`
// where plan is a comma-separated action list, e.g.
//   node scripts/sim.mjs CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM
import { MISSIONS } from '../src/data/missions.js';

// node scripts/sim.mjs <actions> [mission-id]
const entry = MISSIONS.find((m) => m.id === process.argv[3]) || MISSIONS[0];
const mission1 = entry.mission;
import { GameState } from '../src/systems/GameState.js';
import { TurnManager } from '../src/systems/TurnManager.js';

const plan = (process.argv[2] || 'CONFIRM,SEND_DRONE,SEND_DRONE,CONFIRM,OVERRIDE,FALL_BACK').split(',');

const state = new GameState(mission1);
const tm = new TurnManager(mission1, state);
tm.on('turn', (t) => console.log(`\n── TURN ${t.id} ${t.name} — ${t.ai.confidence} from ${t.ai.unit}`));
tm.on('resolve', (r) => console.log(
  `   ${r.action.padEnd(13)} ${String(r.outcome.tag).padEnd(12)} hp ${r.health}  ${r.outcome.log}`));
tm.on('end', (s) => {
  console.log(`\nOUTCOME ${s.outcome}  HEALTH ${s.health}`);
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
if (!state.missionOver) tm.endMission(tm.primaryObjectiveMet() ? 'complete' : 'partial');
