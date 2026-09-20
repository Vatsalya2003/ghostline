// The mission registry. Adding a mission is adding a row here plus a data
// file — no engine change, which is the promise the architecture makes.
import { mission1 } from './mission1.js';
import { mission3 } from './mission3.js';

// mission2.js (BLACK CURRENT, undersea) stays on disk and is deliberately NOT
// registered: it is the fallback if one of these two goes wrong before the
// demo. Re-register it here and it is playable again with no other change.

export const MISSIONS = [
  {
    id: 'dry-creek',
    mission: mission1,
    name: 'DRY CREEK',
    place: 'RELAY STATION 7',
    turns: 6,
    duration: '~4 MIN',
    blurb: 'A sensor breaks and keeps reporting.',
  },
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

// ?mission=ammo-depot (or 1 / 2) picks one without touching the menu, which
// is what the rehearsal and test harnesses use. `explicit` tells the boot
// sequence to skip the select screen entirely.
export function selectedMission() {
  const q = new URLSearchParams(location.search).get('mission');
  if (!q) return DEFAULT_MISSION;
  const byIndex = MISSIONS[Number(q) - 1];
  return MISSIONS.find((m) => m.id === q) || byIndex || DEFAULT_MISSION;
}

export function missionWasRequested() {
  return new URLSearchParams(location.search).has('mission');
}

// Switching mission rebuilds the world — scene, level, squad, fog, occlusion
// and soundscape are all constructed once from the mission's `environment` at
// boot. Reloading with the id in the query string is the honest way to do
// that: it guarantees a clean world for the chosen environment instead of a
// teardown path that only ever runs in one direction and rots quietly.
export function launchMission(id) {
  const url = new URL(location.href);
  url.searchParams.set('mission', id);
  url.searchParams.delete('skip');
  url.searchParams.delete('auto');
  url.searchParams.set('deploy', '1');     // land on the briefing, not the menu
  location.href = url.toString();
}
