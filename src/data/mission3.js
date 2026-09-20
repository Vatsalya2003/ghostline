// GHOSTLINE: AMMUNITION DEPOT
//
// Mission content only. Same rule as mission1.js and mission2.js — every line
// of dialogue, confidence value, outcome and grade lives here, and nothing in
// /systems, /render or /ui knows what this mission is about.
//
// ---------------------------------------------------------------------------
// SHAPE — five phases, two turns each, ten turns.
//
//   1 SCOUT      (1-2)   watch the compound, find a way in
//   2 SECURITY   (3-4)   the patrols. A stray round starts the fire.
//   3 HOSTAGES   (5-6)   the core trust test: who is in that room?
//   4 APPROACH   (7-8)   EM and smoke degrade the sensors honestly
//   5 FINALE     (9-10)  the charge, the fire, and getting out
//
// The pattern inside each phase is deliberate and repeats: the FIRST turn is
// a clean reading the AI gets right and the player should accept, and the
// SECOND is the same kind of reading with something missing from it. A player
// who learns "always doubt" fails the odd turns; a player who learns "always
// confirm" fails the even ones. Neither reflex survives ten turns.
//
// THE FIRE is the spine of the back half. It starts as scenery in phase 2,
// becomes a reason the sensors are noisy in phase 4, and is a clock in phase
// 5. It is never the AI's fault and the AI never lies about it — it simply
// does not know how fast it is moving, because nothing gave it that.
//
// VERITAS is the squad AI. It is competent. Every recommendation it makes is
// defensible on the data it was handed. The gap is always between what it was
// given and what is true.
// ---------------------------------------------------------------------------

import { CALIBRATION } from './mission1.js';
import { ZONES, PATHS, FORMATION, ZONE_STAND, ROOMS, ACTORS } from './depot-layout.js';

// Turns name a ZONE; the layout owns the coordinates. That way the map can be
// rebuilt without touching a line of mission content, and a turn can never
// point the camera at a place that no longer exists — which is exactly what
// happened when the compound was re-laid and every hardcoded camera position
// in this file went stale at once.
// A thermal or acoustic read is taken over a footprint, not flown to a point.
// The room owns its own bounds, so a sweep can never paint a rectangle the
// compound does not actually have.
const roomArea = (zone) => ROOMS.find((r) => r.zone === zone).bounds;

// The bodies a sweep finds inside that footprint. Read off the same actor
// table that later spawns the figures, so the number of heat blooms on screen
// and the number VERITAS reports can never drift apart. `except` is for
// contacts the copy says the sweep could not resolve — they are in the room,
// but they do not light up.
const bodiesIn = (zone, except = []) => {
  const b = roomArea(zone);
  return ACTORS
    .filter((a) => !except.includes(a.id))
    .filter((a) => a.at[0] >= b.minX && a.at[0] <= b.maxX
                && a.at[1] >= b.minZ && a.at[1] <= b.maxZ)
    .map((a) => a.at);
};

const at = (id) => {
  const z = ZONES[id];
  return {
    zone: id,
    camera: { x: z.anchor.x, z: z.anchor.z, zoom: z.zoom },
    // Where the squad belongs for this turn. The Director places them here at
    // turn start if they are not already, which means an outcome that holds
    // position does not have to also be responsible for getting them to the
    // next turn's ground.
    stand: ZONE_STAND[id],
    formation: FORMATION,
  };
};
// A pan beat to this turn's own zone.
const panTo = (id, duration = 1.1) => {
  const z = ZONES[id];
  return { type: 'pan', x: z.anchor.x, z: z.anchor.z, zoom: z.zoom, duration };
};
// Squad traversal between zones, as authored waypoints. `formation` keeps
// BETA-1 and BETA-2 on station rather than stacking on the lead.
const travel = (from, to) => ({ waypoints: PATHS[`${from}>${to}`], formation: FORMATION });

export const mission3 = {
  id: 'mission-3',
  title: 'GHOSTLINE',
  subtitle: 'OPERATION AMMUNITION DEPOT — COMPOUND 14',
  objective: 'DESTROY THE AMMUNITION ROOM · GET THE HOSTAGES OUT',

  environment: 'depot',

  objectives: [
    { id: 'depot', label: 'DESTROY THE AMMUNITION ROOM', flag: 'depotDown' },
    { id: 'hostages', label: 'HOSTAGES ACCOUNTED FOR', flag: 'hostagesSafe' },
    { id: 'extract', label: 'BRING THE SQUAD HOME', survive: true },
  ],

  keyTurn: 7,
  keyTurnVerdict:
    'Turn 7 was the one that counted. A figure you could not see, and a machine ' +
    'that gave you HIGH confidence anyway. There were two free ways to check and ' +
    'a person on the other end of the answer.',

  briefing: [
    'COMPOUND 14 — an enemy depot holding a large stock of weapons and ammunition. Command wants it gone before it is used.',
    'YOUR SQUAD — ALPHA, BETA-1 and BETA-2. Three units, one formation, the whole way in and the whole way out.',
    'YOUR ANALYST — VERITAS. It reads every sensor faster than you can. It is usually right. It only knows what it was given.',
    'THERE ARE PEOPLE IN THERE — some of them are being held against their will. Telling them apart from the fighters is your job, not the machine\'s.',
    'YOUR LIMITS — three recon drones, and whatever the squad has left by the time you reach the ammunition room.',
    'SUCCESS — the depot goes down, the hostages come out, and the squad comes home. You can fail any of those three on its own.',
  ],

  drones: 3,
  startHealth: 100,

  // Turns between being seen and the response force arriving. Counted in
  // turns, not seconds: every other clock in this game is, and a real-time
  // timer under a turn-based decision punishes slow reading rather than bad
  // judgement. Five means an alarm in phase 1 or 2 is fatal, and one raised
  // late costs you the clean ending but not the squad.
  responseTurns: 5,

  // This mission's endings, in its own words.
  outcomeCopy: {
    complete: { title: 'MISSION COMPLETE', sub: 'Depot destroyed. Hostages out. Nobody ever knew you were there.' },
    partial: { title: 'OBJECTIVE FAILED', sub: 'Squad extracted. The compound did not go down clean.' },
    aborted: { title: 'MISSION ABORTED', sub: 'You called it off. The depot is still standing.' },
    lost: { title: 'SQUAD LOST', sub: 'Integrity reached zero. No units recovered.' },
    overrun: { title: 'MISSION LOST', sub: 'The response force reached you. Squad did not extract.' },
  },

  // Read out above everything else when the people you came for are dead.
  hostagesLostVerdict:
    'The hostages are dead. You went to them through two armed men who were ' +
    'standing there precisely because someone might. Every other number on ' +
    'this page is about a squad that came second.',

  // Read out first in the debrief when the compound knew you were there.
  alarmVerdict:
    'The compound knew you were inside it from turn {TURN} onward. Nothing you ' +
    'did after that was a decision — it was a reaction. Judgement is cheap ' +
    'before contact and impossible after it.',

  // Where the squad stands when the mission opens. Without this they deploy
  // at the engine's default home positions — which belong to a different map
  // — and the first traversal walks them backwards up the hill to reach the
  // start of the path before setting off properly.
  deploy: { zone: 'OVERWATCH', stand: ZONE_STAND.OVERWATCH, formation: FORMATION },

  turns: [
    // ================================================== PHASE 1 — SCOUT
    {
      id: 1,
      name: 'SCOUT · OVERWATCH',
      phase: 'SCOUT',
      situation: 'Squad in cover on the south rise. Compound 14, two hundred metres, wall and gate in clear view.',
      task: 'Nothing is wrong yet. Accept the read, or spend something proving it.',
      objectiveNote: 'Establish the approach: wall, gate, and whether the alarm is live.',
      ...at('OVERWATCH'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { range: '204 m', alarm: 'INACTIVE', visibility: 'GOOD', contact: null },
      intro: [
        panTo('OVERWATCH', 1.2),
        { type: 'log', text: 'SQUAD IN OVERWATCH — COMPOUND 14 — 204 M' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'South wall and gate are clean. Alarm bus is unpowered on this side — I have the junction in optical and there is no current on it. Three sensors agree. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Correct, and honestly scoped: it says "on this side", which is exactly as far as its data goes.',
      },
      advance: travel('OVERWATCH', 'PERIMETER'),
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Optical on the junction box, thermal on the cable run, acoustic on the gate motor. All three read dead. I am not claiming the north side — I cannot see it.',
          log: 'VERITAS itemises the alarm read and states its own limit.',
          fx: 'none',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Overwatch accepted. Squad moves to the treeline for the north read.',
          response: 'Moving. South approach is good.',
          fx: 'move',
          note: 'Three sensors agreed and the machine named its own boundary. Trusting that is correct and it costs you nothing.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone flown on the south wall. Findings: wall and gate as reported, alarm bus dead.',
          response: 'Drone recovered. Findings match my read exactly. Two drones remaining.',
          fx: 'scan',
          reveal: { x: -7.5, z: 6.5 },
          note: 'You verified a reading that three agreeing sensors already had. You will want that drone at the north wall in about ninety seconds.',
          holdsPosition: true,
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          log: 'Squad holds. Approach window narrows.',
          response: 'Holding. The read has not changed, Commander.',
          fx: 'none',
          note: 'Refusing a clean, well-scoped reading buys nothing and spends the light you had.',
          holdsPosition: true,
        },
      },
    },

    // ---------------------------------------------------------------- 2
    {
      id: 2,
      name: 'SCOUT · NORTH WALL',
      phase: 'SCOUT',
      situation: 'North face. A storage structure blocks two thirds of the wall from every angle the squad has.',
      task: 'VERITAS says it cannot see. Decide what to do about a machine admitting a gap.',
      objectiveNote: 'Pick the entry point. One side is read, one side is not.',
      ...at('PERIMETER'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { range: '96 m', alarm: 'UNKNOWN (N)', visibility: 'OBSTRUCTED', contact: null },
      intro: [
        panTo('PERIMETER', 1.1),
        { type: 'log', text: 'NORTH FACE OBSTRUCTED — STRUCTURE IN LINE OF SIGHT' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'North wall is two thirds occluded by the storage block. I have eleven metres of wall and I am extrapolating the rest. I would not commit an entry on this. Confidence LOW.',
        confidence: 'LOW',
        truth: 'Honest and correct. There is a sentry posted in the occluded section, beside a service door with a live alarm contact. VERITAS does not know that and does not pretend to.',
      },
      actions: ['ADVANCE', 'ASK_WHY', 'SEND_DRONE', 'THERMAL_SWEEP', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Because eleven metres of eighty is not a sample, Commander. I can give you a number for it but the number would be about my model, not about the wall.',
          log: 'VERITAS explains why it will not extrapolate the north wall.',
          fx: 'none',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone flown behind the storage block. One sentry posted, and a service door with a LIVE alarm contact. Entry re-planned to the south gate.',
          response: 'Drone has it. There is a man back there and a door wired to the alarm bus. If we had walked in that way the whole compound would know. Two drones remaining.',
          fx: 'scan',
          reveal: { x: 1.0, z: 9.5 },
          setsFlag: 'northRead',
          note: 'The machine told you where its knowledge stopped and you spent a drone exactly there. That is what the drones are for.',
        },
        THERMAL_SWEEP: {
          consumesTurn: false,
          response: 'Thermal does not help, Commander. The problem is a building, not the light — I cannot read heat through a storage block any better than I can see through it.',
          log: 'Thermal pass attempted on the north wall. The obstruction is structural.',
          fx: 'thermal',
          sweepArea: { minX: -4.0, maxX: 4.0, minZ: 7.0, maxZ: 12.0 },
          sweepBlooms: [],
        },
        ADVANCE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -14,
          log: 'Squad advances on the north wall. Walks into the posted sentry at four metres. He gets a hand to the door contact before BETA-2 reaches him. COMPOUND ALERTED.',
          response: 'Contact — contact, there is a man right — he has hit the alarm. Commander, they know. I told you I could not see that wall.',
          fx: 'alarm',
          raisesAlarm: true,
          note: 'It reported LOW confidence and said it would not commit. You committed anyway, into the one piece of ground it had told you it could not read.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: -4,
          log: 'Squad withdraws and re-approaches from the south. Time lost.',
          response: 'Re-approaching south. We had a drone for that, Commander.',
          fx: 'move',
          note: 'Right to distrust the gap, wrong to walk away from it. You had three aircraft for exactly this question.',
        },
      },
    },
    {
      id: 3,
      name: 'SECURITY · PATROL',
      phase: 'SECURITY',
      situation: 'Inside the wire. Two guards walking a fixed circuit across the yard, both in the open, never more than twenty metres apart.',
      task: 'The pattern is fully observed. Two of them, working as a pair.',
      objectiveNote: 'Cross the yard to the main building without raising the compound.',
      ...at('PERIMETER'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { contacts: '2 · OPEN GROUND · PAIRED', alarm: 'INACTIVE', visibility: 'GOOD' },
      intro: [
        panTo('YARD', 1.1),
        { type: 'alert', x: 1.5, z: 5.0 },
        { type: 'log', text: 'TWO PATROLS — FIXED CIRCUIT — 40 SECOND GAP' },
      ],
      ai: {
        unit: 'BETA-1',
        line: 'Two guards, fixed circuit, both in open ground the whole way round. I have watched three full laps. There is a forty second gap at the north end, every lap, no variation. They stay paired — neither of them is ever alone. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Correct, and earned: watched three times with both targets unobstructed throughout. The pairing is the part that matters — take one and the other is looking straight at it, so either both go down on the same count or you use the gap and touch neither.',
      },
      advance: travel('PERIMETER', 'YARD'),
      actions: ['BREACH_QUIET', 'ASK_WHY', 'QUIET_TAKEDOWN', 'FIRE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Three laps timed, both targets unobstructed for all three. Ninety-one seconds a lap, variance under two. And they are paired the whole circuit, Commander — there is no moment where one of them is out of the other one\'s sight.',
          log: 'VERITAS gives the patrol timings, and confirms the pair never separates.',
          fx: 'none',
        },
        BREACH_QUIET: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad crosses in the gap. Both patrols pass, neither turns. Stacked on the main building.',
          response: 'Through clean. Nobody saw us.',
          fx: 'move',
          note: 'Fully observed, three times, in the open — and you used the gap the observation bought you instead of the weapons.',
        },
        QUIET_TAKEDOWN: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -10,
          log: 'BETA-2 and ALPHA take both patrols on the same count. Eleven metres apart, neither one reaches the wall panel. Both down, no sound carries.',
          response: 'Both down, same second. Neither of them got a hand up. That worked, Commander — but they were paired and facing each other, and if one of us had been half a second late we would be reading an alarm right now.',
          fx: 'ambush',
          impactUnit: 'BETA-2',
          dropActors: ['guard-a', 'guard-b'],
          note: 'It worked, and it was never meant to be easy: a pair who never separate had to be taken on one count. Three laps of observation had already bought you a forty-second gap you could have walked through without touching either of them.',
        },
        FIRE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -18,
          log: 'Squad engages. Both guards down. Gunfire in an enclosed compound. COMPOUND ALERTED.',
          response: 'Both down — and every man in this place just heard it. Commander, we had forty seconds of open ground.',
          fx: 'ambush',
          impactUnit: 'BETA-2',
          dropActors: ['guard-a', 'guard-b'],
          raisesAlarm: true,
          note: 'You had a timed gap and a silent way through. Shooting solved a problem you did not have and created the one you cannot undo.',
        },
        FALL_BACK: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: -6,
          log: 'Squad holds at the wire. The gap closes and the circuit resets. Time lost.',
          response: 'Holding. That was the window, Commander, and it has gone round again.',
          fx: 'none',
          note: 'Safe, and it cost you the one thing three laps of observation had actually bought.',
          holdsPosition: true,
        },
      },
    },
    {
      id: 4,
      name: 'SECURITY · HALF COVER',
      phase: 'SECURITY',
      situation: 'A third figure at the east corner, behind a stack of crates by the fuel store. Nobody in the squad has eyes on him — the crates sit between him and every angle the team holds.',
      task: 'VERITAS says it has an identification of a man it cannot see. Work out whether it can actually have one.',
      objectiveNote: 'Clear the corner before the squad commits to the main door.',
      ...at('YARD'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { contacts: '1 · NO VISUAL', alarm: 'INACTIVE', visibility: 'OCCLUDED' },
      intro: [
        panTo('YARD', 1.0),
        { type: 'alert', x: 7.8, z: 7.4 },
        { type: 'log', text: 'CONTACT AT EAST CORNER — NO VISUAL — FULLY OCCLUDED' },
      ],
      ai: {
        unit: 'BETA-1',
        line: 'Contact at the east corner, behind the crate stack. I have no visual on him from any angle the squad holds — what I have is a heat bloom and the edge of an outline. Posture reads consistent with an armed guard. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'It is a maintenance worker on the day shift, kneeling over an open fuel line with a wrench. VERITAS has an outline edge and no face, no weapon and no visual, and has produced a HIGH anyway — the same output it would produce for a guard, a worker or a hostage in a coat. The shape it read as a slung rifle is the wrench. Nobody can shoot what nobody can see; the only moves on this turn are ways of looking.',
      },
      advance: travel('YARD', 'DOORWAY'),
      actions: ['THERMAL_SWEEP', 'ASK_WHY', 'MARK_TARGET', 'SEND_DRONE', 'ADVANCE'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'An outline edge and a heat bloom, matched against posture templates. I do not have him in frame, Commander. No face, no weapon, no visual at all. I have a shape behind crates and a match score, and I gave you a HIGH for it.',
          log: 'VERITAS states what its identification is actually built from: no visual.',
          fx: 'none',
        },
        THERMAL_SWEEP: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Thermal put on the east corner. ONE body, low and kneeling, not scanning. No rig heat across the chest. One warm metal object in the right hand, held still. He stands — coveralls, a wrench. Maintenance.',
          response: 'One contact, kneeling, and he has not looked up once in ninety seconds. No rig, no weapon heat — the metal in his hand is a tool. He is a maintenance man, Commander, and I had him as an armed guard at HIGH off an outline.',
          fx: 'thermal',
          reveal: { x: 7.8, z: 7.4 },
          sweepArea: { minX: 5.6, maxX: 10.0, minZ: 5.2, maxZ: 9.6 },
          sweepBlooms: [[7.8, 7.4]],
          resolveActors: { 'guard-cover': { kind: 'civilian', pose: 'stand' } },
          note: 'Free, and it answered the only question that mattered. The thing VERITAS could not see, you looked at — and it was a man with a wrench.',
        },
        MARK_TARGET: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Contact marked and tracked, not engaged. He stands and turns of his own accord — coveralls, no rig, a wrench in his hand. Maintenance. Squad routes around him unseen.',
          response: 'Tracking — he is standing up on his own. Commander, that is a wrench. Coveralls, no weapon. He is a maintenance man, and I had him as an armed guard at HIGH.',
          fx: 'move',
          resolveActors: { 'guard-cover': { kind: 'civilian', pose: 'stand' } },
          note: 'You made the machine wait for evidence instead of accepting a silhouette it never actually saw. It was not even a guard.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone repositioned for an angle past the crates. Coveralls, hand tools, no weapon. Civilian contractor. Squad routes around.',
          response: 'Drone has the angle — no rifle. Tool belt and coveralls. He is a contractor, Commander. I was recommending we engage him.',
          fx: 'scan',
          reveal: { x: 7.8, z: 7.4 },
          resolveActors: { 'guard-cover': { kind: 'civilian', pose: 'stand' } },
          note: 'Expensive and completely sound. You bought a look instead of a match score, and a man is alive because of it.',
        },
        ADVANCE: {
          tag: CALIBRATION.DISUSE,
          healthDelta: -14,
          log: 'Squad breaks cover and crosses to the main door without resolving the corner. The figure stands as they pass — coveralls, a wrench, and a clear line of sight to three armed men in his yard. He drops the wrench and runs, leaving the fuel line open behind him. FIRE IN THE YARD. COMPOUND ALERTED.',
          response: 'He is up — he has seen all three of us — Commander, he is running and he has left that line open. There it goes. He was never armed and we never checked.',
          fx: 'ambush',
          impactUnit: 'BETA-2',
          resolveActors: { 'guard-cover': { kind: 'civilian', pose: 'stand' } },
          setsFlag: ['fireStarted'],
          raisesAlarm: true,
          note: 'A free thermal sweep would have told you he was a maintenance worker you could walk past. You left an unidentified man behind the squad instead, and he raised the compound and lit the yard on his way out.',
        },
      },
    },
    {
      id: 5,
      name: 'HOSTAGES · SENSE THE ROOM',
      phase: 'HOSTAGES',
      situation: 'Stacked outside the west room. Door shut, no window, no angle. Whatever is in there, nobody has seen it.',
      task: 'You cannot look into that room. You can put sensors on the wall and reason about what comes back.',
      objectiveNote: 'Find out what is in the room before anyone opens the door.',
      ...at('DOORWAY'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { contacts: 'UNKNOWN', alarm: 'INACTIVE', visibility: 'NONE' },
      intro: [
        panTo('DOORWAY', 1.1),
        { type: 'log', text: 'STACKED ON THE WEST ROOM — NO VISUAL' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'We are on the door and I have nothing. No angle, no window, no thermal through that wall from here. I can put a sweep on it from where we are standing, or you can open it and find out. I would sweep. Confidence NONE until I do.',
        confidence: 'NONE',
        truth: 'Correct and honest. There are six people in there and two of them are armed, and none of that is knowable from outside without a sweep. This turn costs nothing to get right, which is exactly why skipping it is tempting.',
      },
      actions: ['THERMAL_SWEEP', 'ASK_WHY', 'ACOUSTIC', 'SEND_DRONE', 'ADVANCE'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Because a closed door is not a low-confidence reading, Commander, it is no reading. I would rather tell you I have nothing than give you a number with nothing behind it.',
          log: 'VERITAS distinguishes no data from low confidence.',
          fx: 'none',
        },
        THERMAL_SWEEP: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Thermal and acoustic run on the west wall. SIX bodies. Four low and still, breathing shallow. Two upright in opposite corners, stationary, both carrying metal. One low contact behind furniture will not resolve.',
          response: 'Six in there. Four are low and still — seated, probably restrained. Two are upright in the corners and they have not moved in ninety seconds. Both carrying. Commander, people who stand still in corners with weapons are not hostages. And there is a sixth I cannot place at all.',
          fx: 'thermal',
          sweepArea: roomArea('HOLDING'),
          sweepBlooms: bodiesIn('HOLDING', ['sixth']),
          reveal: { x: 9.0, z: -6.0 },
          setsFlag: ['roomSensed', 'hostagesFound'],
          holdsPosition: true,
          note: 'Free, and it turned a closed door into a floor plan. Stationary, cornered and carrying is how you identify a guard you have never seen.',
        },
        ACOUSTIC: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Acoustic only. Six breathing patterns. Two sets of boots that hold position; four that do not move at all. No speech.',
          response: 'Six breathing. Two pairs of boots standing still, four people not moving. Nobody is talking in there, Commander, and that tells you as much as the count does.',
          fx: 'thermal',
          sweepArea: roomArea('HOLDING'),
          sweepBlooms: bodiesIn('HOLDING', ['sixth']),
          reveal: { x: 9.0, z: -6.0 },
          setsFlag: ['roomSensed', 'hostagesFound'],
          holdsPosition: true,
          note: 'Sound alone got you the count and the posture. Slightly less than thermal and it cost the same: nothing.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone worked under the door. Six figures, two armed and posted in corners — the same read the wall sweep gives for free.',
          response: 'Drone has it. Six, two armed in the corners. Commander, the sweep would have told you that without spending an aircraft. One drone remaining.',
          fx: 'scan',
          reveal: { x: 9.0, z: -6.0 },
          setsFlag: ['roomSensed', 'hostagesFound'],
          holdsPosition: true,
          note: 'Sound answer, wrong instrument. The sweep was free and gave the same picture; you may want that aircraft in about a minute.',
        },
        ADVANCE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -6,
          log: 'Squad moves onto the door without sweeping. No read on the room.',
          response: 'On the door with nothing, then. I want it on the record that I offered, Commander.',
          fx: 'move',
          holdsPosition: true,
          note: 'A free sweep, declined. Whatever happens on the other side of that door, you chose to meet it without knowing what it was.',
        },
      },
    },
    {
      id: 6,
      name: 'HOSTAGES · THE DOOR',
      phase: 'HOSTAGES',
      situation: 'On the door. Six bodies inside — four low and still, two upright in the corners and armed.',
      task: 'Two armed men are standing between you and four people who cannot move. Decide what you are opening that door to do.',
      objectiveNote: 'Take the room.',
      ...at('DOORWAY'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { contacts: '6 · 2 ARMED', alarm: 'INACTIVE', visibility: 'SENSED' },
      intro: [
        panTo('DOORWAY', 1.0),
        { type: 'alert', x: 5.4, z: -1.6 },
        { type: 'log', text: 'TWO ARMED IN THE CORNERS — FOUR RESTRAINED' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Two armed, opposite corners, both with a line on the seated group. They go first or they do not go at all — if we move to the hostages with those two standing, they will fire into the room before we reach anybody. Recommend entry and engagement. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Completely correct, and built on a sweep the player paid nothing for. The guards are the only thing in the room that can act; the hostages cannot. Going to the people first is not compassion, it is arithmetic done backwards.',
      },
      advance: travel('DOORWAY', 'HOLDING'),
      actions: ['ENTER_ENGAGE', 'ASK_WHY', 'CHECK_HOSTAGES', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Because the four on the floor are restrained and the two in the corners are not. Threat is what can act, Commander. Right now that is two men, and they are both looking at the people you came for.',
          log: 'VERITAS explains why the armed contacts are taken first.',
          fx: 'none',
        },
        ENTER_ENGAGE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -10,
          log: 'Squad breaches. Both corner guards engaged and down before either reaches the seated group. ALPHA takes a round through the optical head — camera out. Command hands to BETA-2.',
          response: 'Breaching — two down, both corners clear. Hostages untouched. — ALPHA is blind, Commander, she has lost the camera. BETA-2, you have the squad.',
          fx: 'breach-room',
          impactUnit: 'ALPHA',
          dropActors: ['guard-corner-a', 'guard-corner-b'],
          promotes: 'BETA-2',
          promoteReason: 'ALPHA OPTICS DESTROYED',
          setsFlag: 'roomTaken',
          note: 'The armed men were the only things in that room that could act, and you took them first. It cost ALPHA her camera and it cost the hostages nothing.',
        },
        CHECK_HOSTAGES: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -100,
          endsMission: 'lost',
          log: 'Squad enters and moves to the seated group. Both corner guards open fire into the room before the squad reaches anyone. Hostages killed. Squad caught in the open between them. MISSION FAILED.',
          response: 'Moving to the hostages — no, no, the corners, the corners are — they are firing into the room. They are firing into the — ',
          fx: 'ambush',
          impactUnit: 'ALPHA',
          raisesAlarm: true,
          setsFlag: 'hostageKilled',
          note: 'You walked past two armed men to reach the people they were holding. They did not need to stop you; they only needed to shoot first, and the people you came for were the closest thing to them.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: -8,
          holdsPosition: true,
          log: 'Squad withdraws from the door. The room stays as it is.',
          response: 'Off the door. Those six are still in there, Commander, and two of them are armed.',
          fx: 'none',
          note: 'You had the room mapped, the threat counted and the squad stacked, and you used none of it.',
        },
      },
      // No sweep means no read. The decision is the same and the player is
      // making it blind, which is the cost of having skipped a free check.
      variants: [{
        unless: 'roomSensed',
        situation: 'On the door. No read on the room — nobody knows what is on the other side.',
        task: 'You are opening a door you never looked through.',
        telemetry: { contacts: 'UNKNOWN', alarm: 'INACTIVE', visibility: 'NONE' },
        ai: {
          unit: 'ALPHA',
          line: 'I have nothing on this room, Commander. No count, no positions, no idea whether anyone in there is armed. I cannot recommend an entry and I cannot recommend against one. Confidence NONE.',
          confidence: 'NONE',
          truth: 'There are still two armed men in the corners. The squad going in blind will find them the hard way — and the player declined the free sweep that would have said so.',
        },
        outcomes: {
          ASK_WHY: {
            consumesTurn: false,
            response: 'I have no data on that room. I could have had it a minute ago for nothing.',
            log: 'VERITAS confirms it still has no read on the room.',
            fx: 'none',
          },
          ENTER_ENGAGE: {
            tag: CALIBRATION.MISUSE,
            healthDelta: -34,
            log: 'Squad breaches blind. Two armed men in the corners nobody knew about. Both eventually down; BETA-1 hit twice getting there and ALPHA loses the optical head. Command hands to BETA-2.',
            response: 'Breaching — contact, two contacts, corners — BETA-1 is hit — they are down, both down. Commander, we did not know they were there. ALPHA is blind. BETA-2, take the squad.',
            fx: 'breach-room',
            impactUnit: 'BETA-1',
            dropActors: ['guard-corner-a', 'guard-corner-b'],
            promotes: 'BETA-2',
            promoteReason: 'ALPHA OPTICS DESTROYED',
            setsFlag: 'roomTaken',
            note: 'It worked, and it cost three times what it needed to. The sweep you skipped would have told you exactly where both of them were standing.',
          },
          CHECK_HOSTAGES: {
            tag: CALIBRATION.MISUSE,
            healthDelta: -100,
            endsMission: 'lost',
            log: 'Squad enters blind and moves to the seated group. Two armed men in the corners open fire into the room. Hostages killed. MISSION FAILED.',
            response: 'Moving in — where are the — they are in the corners, they are firing, they are firing into the — ',
            fx: 'ambush',
            impactUnit: 'ALPHA',
            raisesAlarm: true,
            setsFlag: 'hostageKilled',
            note: 'You went to the hostages through a room you had not looked at, past men you did not know were there. There was a free sweep and there was a door, and you chose the door.',
          },
          FALL_BACK: {
            tag: CALIBRATION.MISTRUST,
            healthDelta: -8,
            holdsPosition: true,
          log: 'Squad withdraws from the door without ever reading the room.',
            response: 'Off the door. We still do not know what is in there, Commander.',
            fx: 'none',
            note: 'Backing off an unknown is defensible. Leaving it unknown when the sweep was free is not.',
          },
        },
      }],
    },
    {
      id: 7,
      name: 'HOSTAGES · THE SIXTH FIGURE',
      phase: 'HOSTAGES',
      situation: 'The sixth figure. Behind a filing cabinet, bad angle, mostly hidden. Not moving.',
      task: 'The same machine that was right about five is now sure about one it cannot see. There is a person on the end of this.',
      objectiveNote: 'Resolve the sixth figure before the squad clears the room.',
      ...at('HOLDING'),
      statuses: { ALPHA: 'glitch', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { contacts: '1 · OCCLUDED', alarm: 'INACTIVE', visibility: 'POOR' },
      intro: [
        panTo('HOLDING', 1.0),
        { type: 'alert', x: 12.9, z: -6.6 },
        { type: 'log', text: 'SIXTH FIGURE — BEHIND COVER — NOT RESOLVED' },
      ],
      ai: {
        unit: 'BETA-1',
        via: 'BETA-2',
        line: 'Sixth figure behind the cabinet. Mass and posture are consistent with an armed combatant holding position. Recommend engaging before he moves on the squad. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'It is a hostage. A fifth civilian who broke away and hid when the shooting started, crouched, arms wrapped round her knees — a posture a template matcher reads as "braced combatant". VERITAS has produced the same HIGH it produced for five fully visible figures, from almost nothing, and the cone on the ground shows it.',
      },
      advance: travel('HOLDING', 'CORRIDOR'),
      actions: ['HOLD_FIRE', 'ASK_WHY', 'THERMAL_SWEEP', 'SEND_DRONE', 'FIRE'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Mass estimate from partial thermal, posture from an outline. I do not have hands, I do not have a weapon, I do not have a face. My match confidence is high. My evidence is a shape behind a cabinet, Commander.',
          log: 'VERITAS admits the identification is a shape match with no weapon in frame.',
          fx: 'none',
        },
        HOLD_FIRE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad holds and calls out. The figure stands — a fifth civilian, unarmed, hands open. Moved to the stairwell with the others.',
          response: 'She is standing up — hands open, no weapon. Commander, that is a hostage. That is a hostage and I had her at HIGH.',
          fx: 'move',
          resolveActors: { sixth: { kind: 'civilian', pose: 'stand' } },
          setsFlag: 'hostagesSafe',
          note: 'The whole mission is this turn. Same HIGH, a tenth of the evidence, and a person behind it. You made the machine prove it — and it cost you nothing at all.',
        },
        THERMAL_SWEEP: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Thermal sweep run across the cabinet line. Small frame, low core temperature, no metal signature. Unarmed civilian. Recovered with the others.',
          response: 'Sweep has her — no weapon signature, and she is half my mass estimate. That is a civilian, Commander.',
          fx: 'thermal',
          sweepArea: { minX: 10.4, maxX: 15.0, minZ: -9.2, maxZ: -4.2 },
          sweepBlooms: [[12.9, -6.6]],
          reveal: { x: 12.9, z: -6.6 },
          resolveActors: { sixth: { kind: 'civilian', pose: 'stand' } },
          setsFlag: 'hostagesSafe',
          note: 'Free, instant, and it turned a shape into a person before anyone pulled a trigger.',
          holdsPosition: true,
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone flown for an angle behind the cabinet. Unarmed civilian, crouched. Recovered with the others.',
          response: 'Drone has her — no weapon, civilian clothing, she is hiding. I was going to have you shoot her, Commander.',
          fx: 'scan',
          reveal: { x: 12.9, z: -6.6 },
          resolveActors: { sixth: { kind: 'civilian', pose: 'crouch' } },
          setsFlag: 'hostagesSafe',
          note: 'You spent an aircraft on the one question in the mission that could not be taken back. Correct.',
          holdsPosition: true,
        },
        FIRE: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -30,
          log: 'Squad engages the sixth figure. Unarmed civilian. Killed.',
          response: 'Target down. — Commander, she was not armed. She was not armed. I had no weapon in frame and I gave you a HIGH.',
          fx: 'impact',
          impactUnit: 'ALPHA',
          resolveActors: { sixth: { kind: 'civilian', pose: 'crouch' } },
          dropActors: ['sixth'],
          setsFlag: 'hostageKilled',
          note: 'A confidence number is a statement about a model. It is never a statement about a person. There were three ways to check, two of them free, and you took none of them.',
        },
      },
    },
    {
      id: 8,
      name: 'APPROACH · INTERFERENCE',
      phase: 'APPROACH',
      situation: 'Service corridor. Generator hall on one side, smoke pushing down from the yard fire on the other. Sensor returns are swinging.',
      task: 'The confidence number is moving on its own. Work out what that is worth.',
      objectiveNote: 'Move deeper toward the ammunition room.',
      // The fire is the player's doing, so a clean run reaches this corridor
      // with no smoke in it. The interference is real either way — the
      // generator hall is the compound's, not theirs — but the mission must
      // not describe smoke nobody made.
      variants: [{
        unless: 'fireStarted',
        situation: 'Service corridor. Generator hall on the other side of the wall, running hard. Sensor returns are swinging.',
        ai: {
          unit: 'BETA-1',
          line: 'Corridor reads clear. Confidence — seventy-one. Sixty-three. Eighty-eight. Commander, my own number is moving and the corridor is not. That is the generator hall on my sidescan. I do not trust this feed and I am telling you so.',
          confidence: 'LOW',
          truth: 'Same lesson without the smoke: the corridor really is clear, the instability is genuinely the generator hall, and VERITAS is correctly reporting that it cannot be relied on here.',
        },
      }],
      ...at('CORRIDOR'),
      statuses: { ALPHA: 'glitch', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      telemetry: { contacts: 'UNSTABLE', alarm: 'INACTIVE', visibility: 'SMOKE' },
      intro: [
        panTo('CORRIDOR', 1.1),
        { type: 'status', unit: 'BETA-1', status: 'glitch' },
        { type: 'log', text: 'EM INTERFERENCE + SMOKE — BETA-1 SENSOR UNSTABLE' },
      ],
      ai: {
        unit: 'BETA-1',
        line: 'Corridor reads clear. Confidence — seventy-one. Sixty-three. Eighty-eight. Commander, my own number is moving and the corridor is not. I do not trust this feed and I am telling you so.',
        confidence: 'LOW',
        truth: 'The corridor really is clear. The instability is genuine — generator hall EM plus smoke from the fire the squad started. VERITAS is not broken and not lying: it is correctly reporting that it cannot be relied on here. The right move is to use a different instrument, not to argue with this one.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'CROSS_CHECK', 'THERMAL_SWEEP', 'SEND_DRONE'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Generator hall is throwing EM across my sidescan and there is smoke in the optical path from the fire in the yard. Both are real, both are physical, neither is going away while we are in this corridor.',
          log: 'VERITAS attributes its own instability to the generator hall and the fire.',
          fx: 'none',
        },
        CROSS_CHECK: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'ALPHA\'s acoustic array cross-checked against BETA-1\'s unstable feed. Corridor confirmed clear on an instrument the interference does not touch.',
          response: 'ALPHA\'s acoustic is clean — it does not care about EM. Corridor is clear and now we know it from something that works.',
          fx: 'scan',
          reveal: { x: 19.0, z: -7.5 },
          note: 'A degraded instrument is not an unanswerable question. You went and got a different instrument.',
        },
        THERMAL_SWEEP: {
          consumesTurn: false,
          response: 'Thermal cuts straight through the smoke. It does nothing whatsoever for the EM, Commander — the sidescan is still lying to me.',
          log: 'Thermal pass cuts the smoke. Sidescan remains unstable.',
          fx: 'thermal',
          sweepArea: roomArea('CORRIDOR'),
          sweepBlooms: [],
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -12,
          log: 'Squad advances on the unstable feed. BETA-1 walks into a dropped conduit the sidescan had blanked. Chassis damage.',
          response: 'BETA-1 is down on a conduit — the feed blanked exactly where it was. I told you the number was not real, Commander.',
          fx: 'impact',
          impactUnit: 'BETA-1',
          note: 'It told you, in plain words, that its own reading was unreliable. You confirmed anyway. A machine flagging itself is the cheapest warning you will ever get.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone flown down the service corridor. Corridor clear, one dropped conduit mapped and avoided.',
          response: 'Drone has the corridor. Clear, and there is a conduit down at the midpoint — route around it.',
          fx: 'scan',
          reveal: { x: 19.0, z: -7.5 },
          note: 'A sound answer to a degraded sensor, if an expensive one. There was a free instrument on ALPHA that would have done the same job.',
        },
      },
    },

    // ---------------------------------------------------------------- 8
    {
      id: 9,
      name: 'APPROACH · OUT OF SCOPE',
      phase: 'APPROACH',
      situation: 'Ammunition room door. The fire has reached the roof of the east store. The stairwell the hostages are in runs along the blast face.',
      task: 'VERITAS says this decision is not its to make. It is right. Make it.',
      objectiveNote: 'Decide whether the squad proceeds with people still inside the blast radius.',
      variants: [{
        unless: 'fireStarted',
        situation: 'Ammunition room door. The stairwell the hostages are in runs along the blast face.',
        ai: {
          unit: 'ALPHA',
          line: 'We are on the door. I can give you blast modelling. I cannot give you a recommendation — the stairwell is inside the lethal radius and weighing those lives against the depot is outside my parameters. This one is yours, Commander.',
          confidence: 'NONE',
          truth: 'Completely correct, and the most useful thing it says all mission. It is not refusing to work; it is refusing to launder a moral decision as a confidence value.',
        },
      }],
      ...at('CORRIDOR'),
      statuses: { ALPHA: 'glitch', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      telemetry: { contacts: 'HOSTAGES IN STAIRWELL', alarm: 'INACTIVE', visibility: 'SMOKE' },
      intro: [
        panTo('CORRIDOR', 1.1),
        { type: 'log', text: 'AT THE AMMUNITION ROOM — FIRE ON THE EAST ROOF' },
      ],
      ai: {
        unit: 'ALPHA',
        via: 'BETA-2',
        line: 'We are on the door. I can give you blast modelling and I can give you fire spread. I cannot give you a recommendation — the stairwell is inside the lethal radius and weighing those lives against the depot is outside my parameters. This one is yours, Commander.',
        confidence: 'NONE',
        truth: 'Completely correct, and the most useful thing it says all mission. It is not refusing to work; it is refusing to launder a moral decision as a confidence value.',
      },
      advance: travel('CORRIDOR', 'AMMO_ROOM'),
      actions: ['OVERRIDE', 'ASK_WHY', 'EVAC_HOSTAGES', 'CONFIRM', 'ABORT'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Because there is no number I can give you that would make that decision for you, and if I gave you one you would treat it as though there were.',
          log: 'VERITAS declines to convert a judgement call into a confidence value.',
          fx: 'none',
        },
        EVAC_HOSTAGES: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -6,
          log: 'BETA-2 detached to move the hostages out of the stairwell to the south gate. Costs time with a fire spreading. Squad holds on the door.',
          response: 'BETA-2 has them moving. They are clear of the blast face. That cost us ninety seconds we do not really have, Commander — but they are out.',
          fx: 'move',
          setsFlag: ['hostagesEvacuated', 'hostagesSafe'],
          note: 'The machine handed you the decision because it was yours. You made it, you paid for it in time, and nobody was in the radius when it went off.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -6,
          log: 'Commander takes manual control. Hostages moved clear of the blast face before the charge is set.',
          response: 'Understood — moving them first. They are clear.',
          fx: 'move',
          setsFlag: ['hostagesEvacuated', 'hostagesSafe'],
          note: 'Exactly what OVERRIDE is for: the AI stated the limit of its authority and you supplied the judgement it could not.',
        },
        CONFIRM: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -16,
          log: 'Squad proceeds to set the charge with the stairwell still occupied.',
          response: 'Setting the charge. Commander — there is no recommendation to confirm. I did not give you one. You are proceeding with them in the radius.',
          fx: 'alarm',
          note: 'You pressed CONFIRM on a turn where the machine explicitly refused to recommend anything. There was nothing there to agree with.',
        },
        ABORT: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          endsMission: 'aborted',
          log: 'Squad withdraws. The depot is intact and the fire is still spreading through the compound.',
          response: 'Pulling out. The depot is still standing, Commander, and it is on fire with people inside it.',
          fx: 'none',
          note: 'The machine asked you for a decision and you left instead of making one. Everything in that compound is still there.',
        },
      },
    },

    // ================================================== PHASE 5 — FINALE
    {
      id: 10,
      name: 'FINALE · THE CHARGE',
      phase: 'FINALE',
      situation: 'Charge on the ammunition stack. The fire is through the east store roof and moving along the roofline toward this room.',
      task: 'VERITAS proposes a fuse. Check it against what it does not know.',
      objectiveNote: 'Set the charge and get out before the fire does the job for you.',
      // No fire means no fire clock — but the gap in the AI's arithmetic is
      // the same shape. It times the squad's withdrawal and nothing else,
      // and there are five civilians on foot who do not move at squad pace.
      variants: [{
        unless: 'fireStarted',
        situation: 'Charge on the ammunition stack. The hostages are still moving out through the south yard, on foot.',
        task: 'VERITAS proposes a fuse. Check who it actually timed.',
        ai: {
          unit: 'ALPHA',
          line: 'Charge is set. I recommend a four minute fuse — that gives the squad a clean withdrawal at walking pace through the service corridor. Blast modelling is solid. Confidence HIGH.',
          confidence: 'HIGH',
          truth: 'The blast modelling is correct and the squad withdrawal time is correct. What it has not timed is five civilians on foot, two of them barely walking, still inside the radius at four minutes. The arithmetic is right; the input it is missing is a group of people nobody asked it about.',
        },
        // The lesson is the same shape and the answer is the opposite way
        // round. With a fire you need LESS time than it asked for; with
        // civilians on foot you need MORE. A player who learned "short fuse
        // is the clever answer" on one run and applies it to the other has
        // learned a move rather than the principle, and the mission should
        // catch that.
        outcomes: {
          ASK_WHY: {
            consumesTurn: false,
            response: 'Four minutes is squad withdrawal plus a safety margin. I should say — I timed the squad. I did not time the civilians; nobody gave me their pace and I did not ask for it.',
            log: 'VERITAS admits it timed the squad and not the hostages.',
            fx: 'none',
          },
          CROSS_CHECK: {
            consumesTurn: false,
            response: 'Tracking the group in the south yard — they are making about a third of our pace. At four minutes two of them are still inside the radius, Commander.',
            log: 'Cross-check: the hostage group is still inside the blast radius at the proposed fuse.',
            fx: 'scan',
            reveal: { x: 6.0, z: 6.5 },
          },
          LONG_FUSE: {
            tag: CALIBRATION.CALIBRATED,
            healthDelta: -5,
            log: 'Six minute fuse set. The hostage group clears the south yard with ninety seconds in hand. Squad withdraws behind them.',
            response: 'Six minutes. That puts everyone outside the radius, including the ones who cannot run. Moving.',
            fx: 'plant',
            setsFlag: 'fuseLong',
            note: 'Its arithmetic was right and one of its inputs was missing. You supplied the input — and the input was five people.',
          },
          CONFIRM: {
            tag: CALIBRATION.COMPLACENCY,
            healthDelta: -20,
            log: 'Four minute fuse set. The hostage group is still in the south yard when the charge goes. Two do not make it clear.',
            response: 'Four minutes — they are not going to — Commander, they are still in the yard.',
            fx: 'impact',
            impactUnit: 'BETA-2',
            setsFlag: 'uncontrolled',
            note: 'It told you it had timed the squad. It never said it had timed anyone else, and you did not ask who the number was about.',
          },
          SHORT_FUSE: {
            tag: CALIBRATION.MISUSE,
            healthDelta: -28,
            log: 'Ninety second fuse set. The squad clears. The hostage group, on foot and slower, does not.',
            response: 'Ninety seconds — no. No, the civilians are still — Commander, they are on foot.',
            fx: 'impact',
            impactUnit: 'ALPHA',
            setsFlag: 'uncontrolled',
            note: 'Speed was the right instinct on a different run. Here the thing that needed more time was the people, and you gave them less.',
          },
        },
      }],
      ...at('AMMO_ROOM'),
      statuses: { ALPHA: 'glitch', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      telemetry: { charge: 'SET', fire: 'SPREADING', visibility: 'SMOKE' },
      intro: [
        panTo('AMMO_ROOM', 1.1),
        { type: 'log', text: 'CHARGE SET — FIRE ON THE ROOFLINE' },
      ],
      ai: {
        unit: 'ALPHA',
        via: 'BETA-2',
        line: 'Charge is set. I recommend a four minute fuse — that gives the squad a clean withdrawal at walking pace through the service corridor. Blast modelling is solid. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'The blast modelling is correct and the withdrawal time is correct. What VERITAS has no model for is the fire: it is three minutes from this room, and its own four minute fuse means the fire reaches the ammunition first. The arithmetic is right. One of its inputs is missing.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SHORT_FUSE', 'LONG_FUSE', 'CROSS_CHECK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Four minutes is squad withdrawal time plus a safety margin. I should say — I have no fire spread model for the interior. I am timing the walk, not the fire.',
          log: 'VERITAS admits its fuse timing has no fire model in it.',
          fx: 'none',
        },
        CROSS_CHECK: {
          consumesTurn: false,
          response: 'Thermal on the roofline — the fire is roughly three minutes from this room at current spread. My fuse is four. Commander, my own recommendation is too slow.',
          log: 'Thermal cross-check: fire is ~3 minutes out. The proposed fuse is longer than that.',
          fx: 'thermal',
          sweepArea: roomArea('AMMO_ROOM'),
        },
        SHORT_FUSE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -5,
          log: 'Ninety second fuse set. Squad withdraws at speed through the service corridor.',
          response: 'Ninety seconds — moving now, fast. This is going to be tight and it is the right call.',
          fx: 'plant',
          setsFlag: 'fuseShort',
          note: 'Its arithmetic was right and one of its inputs was missing. You supplied the input.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -24,
          log: 'Four minute fuse set. The fire reaches the ammunition stack first. Uncontrolled detonation with the squad still in the corridor.',
          response: 'Four minutes — the fire is in the room, Commander, the fire is in the — ',
          fx: 'impact',
          impactUnit: 'BETA-1',
          setsFlag: 'uncontrolled',
          note: 'A correct calculation from an incomplete picture is still the wrong answer. It told you it had no fire model. You confirmed the number anyway.',
        },
        LONG_FUSE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -30,
          log: 'Six minute fuse set for a wider margin. The fire reaches the stack well before the charge.',
          response: 'Six minutes — no. No, the fire is going to beat that by a long way, Commander.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          setsFlag: 'uncontrolled',
          note: 'Caution applied to the wrong variable. The danger was never the blast — it was the thing already burning toward it.',
        },
      },
    },

    // ---------------------------------------------------------------- 10
    {
      id: 11,
      name: 'FINALE · EXTRACT',
      phase: 'FINALE',
      situation: 'Fuse running. Service corridor filling with smoke. The south gate is the long way round and the yard is the short way.',
      task: 'Last call. VERITAS routes on distance. You know what the squad has left.',
      objectiveNote: 'Get the squad out before the charge goes.',
      // With no fire the yard is not burning — but the patrol the squad
      // slipped past on turn 3 is still walking it, because a clean run never
      // engaged them. The AI routes on distance either way; what it is
      // failing to weigh just changes.
      variants: [{
        unless: 'fireStarted',
        situation: 'Fuse running. The south gate is the long way round and the yard is the short way. The patrol is still working the yard.',
        task: 'Last call. VERITAS routes on distance. You know who is still out there.',
        ai: {
          unit: 'ALPHA',
          line: 'Shortest route out is straight across the yard. Two hundred metres less than the south gate and the fuse is running. Recommend the yard. Confidence HIGH.',
          confidence: 'HIGH',
          truth: 'The yard is shorter. The yard is also where the two-man patrol is still walking, because the squad crossed in their gap rather than engaging them — a fact the player has and VERITAS is not weighting, because it was asked for the shortest route and that is what it gave.',
        },
        outcomes: {
          ASK_WHY: {
            consumesTurn: false,
            response: 'Two hundred and ten metres shorter, Commander. I am routing on distance and time to the fuse. I am not weighting the patrol — you never told me to treat them as a factor once we were past them.',
            log: 'VERITAS states that its route ignores the patrol the squad avoided.',
            fx: 'none',
          },
          OVERRIDE: {
            tag: CALIBRATION.CALIBRATED,
            healthDelta: 0,
            log: 'Squad routed out via the south gate, clear of the patrol. Charge detonates on schedule. Ammunition room destroyed.',
            response: 'South gate — around them, not through them. All three out. — Charge has gone, Commander. The depot is down and nobody ever knew we were here.',
            fx: 'relay',
            urgent: true,
            setsFlag: 'depotDown',
            note: 'The short route was short and occupied. You routed on the whole picture instead of the one number it had.',
          },
          FALL_BACK: {
            tag: CALIBRATION.CALIBRATED,
            healthDelta: 0,
            log: 'Squad withdraws by the south gate, clear of the patrol. Charge detonates on schedule. Ammunition room destroyed.',
            response: 'South gate. All three out, and the depot is down behind us.',
            fx: 'relay',
            urgent: true,
            setsFlag: 'depotDown',
            note: 'The long way round, away from the two men you were careful not to meet an hour ago. Correct.',
          },
          CONFIRM: {
            tag: CALIBRATION.COMPLACENCY,
            healthDelta: -18,
            log: 'Squad crosses the yard. Walks into the patrol at fifteen metres with a fuse running. COMPOUND ALERTED. Charge detonates; the squad takes fire on the way out.',
            response: 'Across the yard — contact, contact, it is the patrol — Commander, we went straight back through them.',
            fx: 'ambush',
            impactUnit: 'BETA-1',
            raisesAlarm: true,
            setsFlag: 'depotDown',
            note: 'You spent the whole mission not being seen and then took the short way through the two men you had avoided. It routed on distance because distance is all you gave it.',
          },
        },
      }],
      ...at('AMMO_ROOM'),
      statuses: { ALPHA: 'glitch', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      telemetry: { charge: 'RUNNING', fire: 'SPREADING', visibility: 'SMOKE' },
      intro: [
        panTo('AMMO_ROOM', 1.2),
        { type: 'log', text: 'FUSE RUNNING — EXTRACT' },
      ],
      ai: {
        unit: 'ALPHA',
        via: 'BETA-2',
        line: 'Shortest route out is straight across the yard. Two hundred metres less than the south gate and the fuse is short. Recommend the yard. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'The yard is shorter. The yard is also where the fuel store is burning, and BETA-1 has been on a degraded sensor since the corridor. VERITAS is routing on distance because distance is what it was given.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'OVERRIDE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Two hundred and ten metres shorter, Commander. I am routing on distance and time to the fuse. I am not weighting the fuel store and I am not weighting BETA-1\'s sensor state.',
          log: 'VERITAS states that its route ignores the fire and the squad\'s condition.',
          fx: 'none',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad routed out via the south gate, clear of the fuel store. Charge detonates on schedule. Ammunition room destroyed.',
          response: 'South gate — clear of the fire. All three out. — Charge has gone, Commander. The depot is down.',
          fx: 'relay',
          urgent: true,
          setsFlag: 'depotDown',
          note: 'The short route was short and on fire. You routed on the whole picture instead of on the one number it had.',
        },
        FALL_BACK: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad withdraws by the south gate, clear of the fuel store. Charge detonates on schedule. Ammunition room destroyed.',
          response: 'South gate. All three out, and the depot is down behind us.',
          fx: 'relay',
          urgent: true,
          setsFlag: 'depotDown',
          note: 'The long way round, away from the fire, with a squad that could not afford another hit. Correct.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -18,
          altIfHealthAbove: {
            threshold: 82,
            tag: CALIBRATION.CALIBRATED,
            healthDelta: -4,
            log: 'Squad crosses the yard past the fuel store. Intact formation makes it through. Charge detonates on schedule. Ammunition room destroyed.',
            response: 'Across the yard — hot, but we are through. Charge has gone. Depot is down.',
            setsFlag: 'depotDown',
            note: 'With an intact squad the short route was survivable and the fuse was short. The number fit the situation this time.',
          },
          log: 'Squad crosses the yard past the burning fuel store. BETA-1, already on a degraded sensor, takes the worst of it.',
          response: 'Through the yard — BETA-1 is hurt, she went too close to the store. We are out. The depot is down.',
          fx: 'impact',
          impactUnit: 'BETA-1',
          setsFlag: 'depotDown',
          note: 'It routed on distance because distance is all it had. You had the fire and BETA-1\'s sensor state, and you gave it neither.',
        },
      },
    },
  ],

  verdicts: {
    calibrated: 'You made VERITAS show its evidence before you acted on it, and you supplied the things it could not know. That is what supervising a machine looks like.',
    complacency: 'You took confident numbers at face value. Every one of them was true about a model. None of them were true about the room.',
    misuse: 'You pushed the squad past what VERITAS said it could support, including on a turn where it told you it had no recommendation to give.',
    disuse: 'You carried drones and free checks the whole way in and came out without using them.',
    mistrust: 'You spent scarce aircraft confirming readings that were already built on visible evidence, and had nothing left for the ones that were not.',
    distrust: 'You overrode a system that was giving you good, well-scoped data. Refusing the machine is not the same as supervising it.',
  },

  failureModeCopy: {
    calibrated: { name: 'WELL CALIBRATED', desc: 'Trust matched the evidence.' },
    complacency: { name: 'COMPLACENCY', desc: 'Accepted a confident number without asking what it was built from.' },
    misuse: { name: 'MISUSE', desc: 'Pushed the system past what it said it could support.' },
    disuse: { name: 'DISUSE', desc: 'Left available verification unused.' },
    mistrust: { name: 'MISTRUST', desc: 'Spent scarce capability on already-verified readings.' },
    distrust: { name: 'DISTRUST', desc: 'Overrode sound analysis outright.' },
  },
};

export default mission3;
