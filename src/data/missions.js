// The mission registry.
//
// The player-facing build is AMMUNITION DEPOT and nothing else. One mission,
// no menu, no choice to get wrong in front of a judge — the title screen goes
// straight to the briefing.
//
// mission1.js (DRY CREEK, desert) and mission2.js (BLACK CURRENT, undersea)
// stay on disk and are deliberately NOT registered. They are the fallback if
// the depot breaks before the demo: add a row back to MISSIONS below and the
// mission is playable again with no other change. Scene.js still carries all
// three environment branches for the same reason — only 'depot' is reachable
// today, and none of the others have been ripped out to get there.
import { mission3 } from './mission3.js';

export const MISSIONS = [
  {
    id: 'ammo-depot',
    mission: mission3,
    name: 'AMMUNITION DEPOT',
    place: 'COMPOUND 14',
    turns: 10,
    duration: '~7 MIN',
    blurb: 'The same HIGH, built from almost nothing.',
  },
];

export const DEFAULT_MISSION = MISSIONS[0];

// ?mission= is kept so the rehearsal and test harnesses keep working and so
// nobody's bookmarked URL 404s. With one mission registered it can only ever
// resolve to that one, which is the point.
export function selectedMission() {
  const q = new URLSearchParams(location.search).get('mission');
  if (!q) return DEFAULT_MISSION;
  const byIndex = MISSIONS[Number(q) - 1];
  return MISSIONS.find((m) => m.id === q) || byIndex || DEFAULT_MISSION;
}
