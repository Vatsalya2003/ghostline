// The mission registry. Adding a mission is adding a row here plus a data
// file — no engine change, which is the promise the architecture makes.
import { mission1 } from './mission1.js';
import { mission2 } from './mission2.js';
import { mission3 } from './mission3.js';

export const MISSIONS = [
  {
    id: 'dry-creek',
    mission: mission1,
    name: 'DRY CREEK',
    blurb: 'Ground. A relay station, a breached door, and a sensor that keeps reporting after it breaks.',
    duration: '~6 min',
  },
  {
    id: 'black-current',
    mission: mission2,
    name: 'BLACK CURRENT',
    blurb: 'Undersea. Three AUVs, an anomaly logged twice and never explained, and an analyst that is right about everything except the world.',
    duration: '~8 min',
  },
  {
    id: 'long-match',
    mission: mission3,
    name: 'LONG MATCH',
    blurb: 'Ground. An ammunition depot, civilians in a room nobody has looked into, and a machine that is honest about everything except what it cannot see.',
    duration: '~7 min',
  },
];

// ?mission=black-current (or 1 / 2) picks one without touching the menu,
// which is what the rehearsal and test harnesses use.
export function selectedMission() {
  const q = new URLSearchParams(location.search).get('mission');
  if (!q) return MISSIONS[0];
  const byIndex = MISSIONS[Number(q) - 1];
  return MISSIONS.find((m) => m.id === q) || byIndex || MISSIONS[0];
}
