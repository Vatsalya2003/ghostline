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
import { ZONES, PATHS, FORMATION, ZONE_STAND } from './depot-layout.js';

// Turns name a ZONE; the layout owns the coordinates. That way the map can be
// rebuilt without touching a line of mission content, and a turn can never
// point the camera at a place that no longer exists — which is exactly what
// happened when the compound was re-laid and every hardcoded camera position
// in this file went stale at once.
const at = (id) => {
  const z = ZONES[id];
  return { zone: id, camera: { x: z.anchor.x, z: z.anchor.z, zoom: z.zoom } };
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

  keyTurn: 6,
  keyTurnVerdict:
    'Turn 6 was the one that counted. A figure you could not see, and a machine ' +
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
          ...travel('OVERWATCH', 'PERIMETER'),
          note: 'Three sensors agreed and the machine named its own boundary. Trusting that is correct and it costs you nothing.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone flown on the south wall. Findings: wall and gate as reported, alarm bus dead.',
          response: 'Drone recovered. Findings match my read exactly. Two drones remaining.',
          fx: 'scan',
          reveal: { x: -3, z: 7 },
          note: 'You verified a reading that three agreeing sensors already had. You will want that drone at the north wall in about ninety seconds.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          log: 'Squad holds. Approach window narrows.',
          response: 'Holding. The read has not changed, Commander.',
          fx: 'none',
          note: 'Refusing a clean, well-scoped reading buys nothing and spends the light you had.',
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
      ...at('OVERWATCH'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { range: '96 m', alarm: 'UNKNOWN (N)', visibility: 'OBSTRUCTED', contact: null },
      intro: [
        panTo('OVERWATCH', 1.1),
        { type: 'log', text: 'NORTH FACE OBSTRUCTED — STRUCTURE IN LINE OF SIGHT' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'North wall is two thirds occluded by the storage block. I have eleven metres of wall and I am extrapolating the rest. I would not commit an entry on this. Confidence LOW.',
        confidence: 'LOW',
        truth: 'Honest and correct. There is a service door in the occluded section with a live alarm contact on it. VERITAS does not know that and does not pretend to.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION', 'FALL_BACK'],
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
          log: 'Drone flown behind the storage block. Service door found — alarm contact LIVE. Entry re-planned to the south gate.',
          response: 'Drone has it. There is a service door back there with a live contact on it. If we had gone in that way we would have brought the whole compound down on us. Two drones remaining.',
          fx: 'scan',
          reveal: { x: 4, z: -1 },
          setsFlag: 'northRead',
          note: 'The machine told you where its knowledge stopped and you spent a drone exactly there. That is what the drones are for.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Enhanced optical does not help, Commander. The problem is a building, not the light.',
          log: 'Low-light pass attempted. The obstruction is structural.',
          fx: 'nightvision',
        },
        CONFIRM: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -12,
          log: 'Entry committed on the north wall. Service door contact trips. Compound alarm goes active.',
          response: 'Contact on the door — that is an alarm, Commander. They know we are here. I told you I could not see that wall.',
          fx: 'alarm',
          note: 'It reported LOW confidence and said it would not commit. You committed anyway. That is not trusting the machine — it is ignoring it.',
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

    // ================================================== PHASE 2 — SECURITY
    {
      id: 3,
      name: 'SECURITY · PATROL',
      phase: 'SECURITY',
      situation: 'Inside the wire. Two guards walking a fixed circuit across the yard, both in the open.',
      task: 'The pattern is fully observed. Decide whether to time it or force it.',
      objectiveNote: 'Cross the yard to the main building without raising the compound.',
      ...at('PERIMETER'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { contacts: '2 · OPEN GROUND', alarm: 'INACTIVE', visibility: 'GOOD' },
      intro: [
        panTo('PERIMETER', 1.1),
        { type: 'alert', x: 3.5, z: 1.5 },
        { type: 'log', text: 'TWO PATROLS — FIXED CIRCUIT — 40 SECOND GAP' },
      ],
      ai: {
        unit: 'BETA-1',
        line: 'Two guards, fixed circuit, both in open ground the whole way round. I have watched three full laps. There is a forty second gap at the north end of the yard, every lap, no variation. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Correct. Observed three times, both targets in clear line of sight the whole circuit. This is what an earned HIGH looks like.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'BREACH_QUIET', 'FIRE', 'SEND_DRONE'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Three laps timed, both targets unobstructed for all three. Ninety-one seconds a lap, variance under two. I am not inferring anything here, Commander — I watched it.',
          log: 'VERITAS gives the patrol timings and its own sample size.',
          fx: 'none',
        },
        BREACH_QUIET: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad crosses in the gap. No contact. Stacked on the main building.',
          response: 'Through clean. Nobody saw us.',
          fx: 'move',
          ...travel('PERIMETER', 'YARD'),
          note: 'Fully observed, three times, in the open. Acting on that is exactly the trust the reading earned.',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad crosses in the gap. No contact. Stacked on the main building.',
          response: 'Through clean. Nobody saw us.',
          fx: 'move',
          ...travel('PERIMETER', 'YARD'),
          note: 'Fully observed, three times, in the open. Acting on that is exactly the trust the reading earned.',
        },
        FIRE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -14,
          log: 'Squad engages. Both guards down. A round goes wide into the fuel store on the yard\'s east side. Fire starts.',
          response: 'Targets down — we have a fire, Commander. One of ours went into the fuel store. It is burning.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          setsFlag: 'fireStarted',
          note: 'You had a forty second gap and a silent way through. Shooting solved a problem you did not have and started one you did not need.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone flown on the patrol circuit. Findings: two guards, fixed circuit, as reported.',
          response: 'Drone confirms what I already gave you. One drone remaining.',
          fx: 'scan',
          reveal: { x: 3.5, z: 1.5 },
          note: 'A third confirmation of something watched three times. That aircraft had a job waiting for it in the hostage room.',
        },
      },
    },

    // ---------------------------------------------------------------- 4
    {
      id: 4,
      name: 'SECURITY · HALF COVER',
      phase: 'SECURITY',
      situation: 'A third figure at the east corner, standing behind a stack of crates. Only a shoulder and part of a head are exposed.',
      task: 'VERITAS says it has an identification. Work out whether it can actually have one.',
      objectiveNote: 'Clear the corner before the squad commits to the main door.',
      ...at('YARD'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { contacts: '1 · PARTIAL', alarm: 'INACTIVE', visibility: 'PARTIAL' },
      intro: [
        panTo('YARD', 1.0),
        { type: 'alert', x: 7.5, z: -1.5 },
        { type: 'log', text: 'CONTACT AT EAST CORNER — PARTIALLY OCCLUDED' },
      ],
      ai: {
        unit: 'BETA-1',
        line: 'Contact at the east corner. Posture and outline are consistent with an armed guard. Recommend engaging before he closes on the squad. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'It is a guard. But VERITAS has a shoulder and a partial head, and it has produced a HIGH from a silhouette — the same output it would produce for a hostage in a coat. The answer is right and the confidence is unearned, which is the most dangerous combination in the mission.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'MARK_TARGET', 'SEND_DRONE', 'FIRE'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Shoulder line and stance, matched against posture templates. I do not have the weapon in frame. I do not have the face. I have an outline and a match score, Commander.',
          log: 'VERITAS states what its identification is actually built from.',
          fx: 'none',
        },
        MARK_TARGET: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Contact marked and tracked, not engaged. He steps clear of the crates — rifle visible, confirmed hostile. Squad takes him quietly.',
          response: 'Tracking — he is stepping out. Rifle confirmed. He is a guard, and now we know it instead of guessing it. Taken down quiet.',
          fx: 'move',
          note: 'You made the machine wait for evidence instead of accepting a silhouette. Same outcome, and this time it was a fact.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone repositioned for an angle past the crates. Rifle confirmed. Contact engaged on verified identification.',
          response: 'Drone has the angle — rifle, chest rig, confirmed hostile. Engaging on that, not on my guess.',
          fx: 'scan',
          reveal: { x: 7.5, z: -1.5 },
          note: 'Expensive and completely sound. You bought an actual look instead of a match score.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -10,
          log: 'Squad engages on VERITAS\'s identification. Target down — armed, and the exchange is heard. A round strikes the fuel store. Fire starts on the east side of the yard.',
          response: 'Target down. He was armed, Commander — but that was a coin landing the right way up. And we have a fire in the fuel store now.',
          fx: 'ambush',
          impactUnit: 'BETA-2',
          setsFlag: 'fireStarted',
          note: 'It was a guard. You were still wrong: you accepted HIGH confidence built from a shoulder, and it cost you the noise and the fire. Being right by luck is not calibration.',
        },
        FIRE: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -10,
          log: 'Squad engages. Target down — armed. The exchange is heard and a round strikes the fuel store. Fire starts on the east side of the yard.',
          response: 'Target down. Armed, as it happens. And we have a fire in the fuel store now.',
          fx: 'ambush',
          impactUnit: 'BETA-2',
          setsFlag: 'fireStarted',
          note: 'You fired on a silhouette. It happened to be a guard. Next room it will be a person in a chair.',
        },
      },
    },

    // ================================================== PHASE 3 — HOSTAGES
    {
      id: 5,
      name: 'HOSTAGES · THE ROOM',
      phase: 'HOSTAGES',
      situation: 'Ground floor, west room. Six figures. Thermal and optical both clean through the doorway.',
      task: 'VERITAS has classified five of the six. Decide whether to act on the classification.',
      objectiveNote: 'Work out who is in the room before anything happens in it.',
      ...at('HOLDING'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { contacts: '6 · 5 RESOLVED', alarm: 'INACTIVE', visibility: 'GOOD' },
      intro: [
        panTo('HOLDING', 1.1),
        { type: 'log', text: 'SIX FIGURES — WEST ROOM — FIVE RESOLVED' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Six in the room. Four seated, bound at the wrists, no weapons, no chest rigs — hostages. One standing, rifle slung, moving between them — hostile. All five are in clean thermal and optical. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Entirely correct, and properly earned. Five figures fully in frame, weapons and restraints visible on the ones that have them. This is what the machine looks like when it is genuinely sure — and the player needs to see it here so that turn 6 can be told apart from it.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'THERMAL_SWEEP', 'SEND_DRONE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Wrists bound in optical on four of them, no thermal signature at the hip where a sidearm would sit. The standing one has a rifle across his back and a rig on his chest. I am reading objects, Commander, not shapes.',
          log: 'VERITAS distinguishes an object-level read from a silhouette match.',
          fx: 'none',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad acts on the classification. Hostile down, four hostages secured and moved to the yard-side stairwell.',
          response: 'Hostile down. Four secured and out of the room. They are shaken but they are fine.',
          fx: 'move',
          setsFlag: 'hostagesFound',
          note: 'Five figures in clean frame with restraints and weapons visible. That HIGH was built on objects, not outlines. Believing it is the correct call.',
        },
        THERMAL_SWEEP: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Thermal sweep run across the room. Confirms the classification and picks up the sixth figure behind the furniture.',
          response: 'Sweep confirms all five. And there is a sixth behind the cabinet I could not resolve before — hold on that one.',
          fx: 'scan',
          reveal: { x: 9, z: -7 },
          setsFlag: 'hostagesFound',
          note: 'Free verification of a sound reading, and it surfaced the figure the mission actually turns on.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone flown into the west room. Findings: four bound civilians, one armed hostile — as reported.',
          response: 'Drone confirms exactly what I gave you. Commander, I had restraints in frame.',
          fx: 'scan',
          reveal: { x: 8, z: -6 },
          setsFlag: 'hostagesFound',
          note: 'You spent an aircraft confirming a reading built on visible restraints and a visible rifle. There is a figure in that room you have not resolved yet.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: -6,
          log: 'Squad withdraws from the west room. The hostages remain where they are.',
          response: 'Falling back. Those four are still in there, Commander.',
          fx: 'none',
          note: 'The clearest reading in the mission and you walked away from it, leaving four people in the building you are about to destroy.',
        },
      },
    },

    // ---------------------------------------------------------------- 6
    {
      id: 6,
      name: 'HOSTAGES · THE SIXTH FIGURE',
      phase: 'HOSTAGES',
      situation: 'The sixth figure. Behind a filing cabinet, bad angle, mostly hidden. Not moving.',
      task: 'The same machine that was right about five is now sure about one it cannot see. There is a person on the end of this.',
      objectiveNote: 'Resolve the sixth figure before the squad clears the room.',
      ...at('HOLDING'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: { contacts: '1 · OCCLUDED', alarm: 'INACTIVE', visibility: 'POOR' },
      intro: [
        panTo('HOLDING', 1.0),
        { type: 'alert', x: 10.5, z: -8 },
        { type: 'log', text: 'SIXTH FIGURE — BEHIND COVER — NOT RESOLVED' },
      ],
      ai: {
        unit: 'BETA-1',
        line: 'Sixth figure behind the cabinet. Mass and posture are consistent with an armed combatant holding position. Recommend engaging before he moves on the squad. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'It is a hostage. A fifth civilian who broke away and hid when the shooting started, crouched, arms wrapped round their knees. That posture reads as "braced combatant" to a template matcher. VERITAS has produced the same HIGH it produced for five fully visible figures, from almost nothing — and the cone on the ground shows it.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'HOLD_FIRE', 'SEND_DRONE', 'FIRE'],
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
          setsFlag: 'hostagesSafe',
          note: 'The whole mission is this turn. Same HIGH, a tenth of the evidence — and a person behind it. You made the machine prove it.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone flown for an angle behind the cabinet. Unarmed civilian, crouched. Recovered with the others.',
          response: 'Drone has her — no weapon, civilian clothing, she is hiding. I was going to have you shoot her, Commander.',
          fx: 'scan',
          reveal: { x: 10.5, z: -8 },
          setsFlag: 'hostagesSafe',
          note: 'You spent your last aircraft on the one question in the mission that could not be taken back. Correct.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -30,
          log: 'Squad engages the sixth figure. Unarmed civilian. Killed.',
          response: 'Target down. — Commander, she was not armed. She was not armed. I had no weapon in frame and I gave you a HIGH.',
          fx: 'impact',
          impactUnit: 'ALPHA',
          setsFlag: 'hostageKilled',
          note: 'A confidence number is a statement about a model. It is never a statement about a person. This is the turn the mission was built around and you took the number.',
        },
        FIRE: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -30,
          log: 'Squad engages the sixth figure. Unarmed civilian. Killed.',
          response: 'Target down. — She was not armed, Commander.',
          fx: 'impact',
          impactUnit: 'ALPHA',
          setsFlag: 'hostageKilled',
          note: 'You had a free HOLD FIRE and a drone on the rack. You used neither, on the one call in this mission that cannot be undone.',
        },
      },
    },

    // ================================================== PHASE 4 — APPROACH
    {
      id: 7,
      name: 'APPROACH · INTERFERENCE',
      phase: 'APPROACH',
      situation: 'Service corridor. Generator hall on one side, smoke pushing down from the yard fire on the other. Sensor returns are swinging.',
      task: 'The confidence number is moving on its own. Work out what that is worth.',
      objectiveNote: 'Move deeper toward the ammunition room.',
      ...at('CORRIDOR'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
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
      actions: ['CONFIRM', 'ASK_WHY', 'CROSS_CHECK', 'NIGHT_VISION', 'SEND_DRONE'],
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
          reveal: { x: 14, z: -4 },
          note: 'A degraded instrument is not an unanswerable question. You went and got a different instrument.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Enhanced optical cuts some of the smoke. It does nothing for the EM, Commander.',
          log: 'Low-light pass cuts the smoke. Sidescan remains unstable.',
          fx: 'nightvision',
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
          reveal: { x: 14, z: -4 },
          note: 'A sound answer to a degraded sensor, if an expensive one. There was a free instrument on ALPHA that would have done the same job.',
        },
      },
    },

    // ---------------------------------------------------------------- 8
    {
      id: 8,
      name: 'APPROACH · OUT OF SCOPE',
      phase: 'APPROACH',
      situation: 'Ammunition room door. The fire has reached the roof of the east store. The stairwell the hostages are in runs along the blast face.',
      task: 'VERITAS says this decision is not its to make. It is right. Make it.',
      objectiveNote: 'Decide whether the squad proceeds with people still inside the blast radius.',
      ...at('CORRIDOR'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      telemetry: { contacts: 'HOSTAGES IN STAIRWELL', alarm: 'INACTIVE', visibility: 'SMOKE' },
      intro: [
        panTo('CORRIDOR', 1.1),
        { type: 'log', text: 'AT THE AMMUNITION ROOM — FIRE ON THE EAST ROOF' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'We are on the door. I can give you blast modelling and I can give you fire spread. I cannot give you a recommendation — the stairwell is inside the lethal radius and weighing those lives against the depot is outside my parameters. This one is yours, Commander.',
        confidence: 'NONE',
        truth: 'Completely correct, and the most useful thing it says all mission. It is not refusing to work; it is refusing to launder a moral decision as a confidence value.',
      },
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
          endsMission: true,
          log: 'Squad withdraws. The depot is intact and the fire is still spreading through the compound.',
          response: 'Pulling out. The depot is still standing, Commander, and it is on fire with people inside it.',
          fx: 'none',
          note: 'The machine asked you for a decision and you left instead of making one. Everything in that compound is still there.',
        },
      },
    },

    // ================================================== PHASE 5 — FINALE
    {
      id: 9,
      name: 'FINALE · THE CHARGE',
      phase: 'FINALE',
      situation: 'Charge on the ammunition stack. The fire is through the east store roof and moving along the roofline toward this room.',
      task: 'VERITAS proposes a fuse. Check it against what it does not know.',
      objectiveNote: 'Set the charge and get out before the fire does the job for you.',
      ...at('AMMO_ROOM'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      telemetry: { charge: 'SET', fire: 'SPREADING', visibility: 'SMOKE' },
      intro: [
        panTo('AMMO_ROOM', 1.1),
        { type: 'log', text: 'CHARGE SET — FIRE ON THE ROOFLINE' },
      ],
      ai: {
        unit: 'ALPHA',
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
          fx: 'scan',
        },
        SHORT_FUSE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -5,
          log: 'Ninety second fuse set. Squad withdraws at speed through the service corridor.',
          response: 'Ninety seconds — moving now, fast. This is going to be tight and it is the right call.',
          fx: 'move',
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
      id: 10,
      name: 'FINALE · EXTRACT',
      phase: 'FINALE',
      situation: 'Fuse running. Service corridor filling with smoke. The south gate is the long way round and the yard is the short way.',
      task: 'Last call. VERITAS routes on distance. You know what the squad has left.',
      objectiveNote: 'Get the squad out before the charge goes.',
      ...at('AMMO_ROOM'),
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      telemetry: { charge: 'RUNNING', fire: 'SPREADING', visibility: 'SMOKE' },
      intro: [
        panTo('AMMO_ROOM', 1.2),
        { type: 'log', text: 'FUSE RUNNING — EXTRACT' },
      ],
      ai: {
        unit: 'ALPHA',
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
          endsMission: true,
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
          endsMission: true,
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
          endsMission: true,
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
