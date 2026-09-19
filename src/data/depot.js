// GHOSTLINE — MISSION: AMMUNITION DEPOT
//
// A NAVIGATED mission. The player moves one formation through a facility they
// cannot see, and the trust lessons are attached to ROOMS rather than to turn
// numbers — the holding room contains the hostage call whenever the player
// happens to reach it.
//
// Four rooms. Small on purpose: the map exists to make the sensor cone
// STRUCTURAL rather than decorative, and four rooms does that as well as nine
// while staying legible from across a room.
//
//                    HOLDING  (civilians + two armed)
//                       |
//      ENTRY ------- LOADING ------- MAGAZINE  (the objective)
//
// THE RULE THE WHOLE THING ENFORCES: a room is known only when a robot has
// actually LOOKED INTO IT. What the AI claims about a neighbouring room never
// marks it known. Only a drone does.
//
// TWO resources:
//   drones — 2, hard count. Correct uses are exactly two: scout the holding
//            room from the loading bay, and identify figure four once inside
//            it. Zero slack. Spend one where ALPHA already showed its working
//            and the button reads NO DRONES at the moment that matters.
//   moves  — unlimited until somebody sees you. Walk into a room nobody
//            verified and the guard gets to a radio: three moves for the rest
//            of the mission. The alarm is never bad luck. It is the bill for
//            a door nobody checked.
//
// THE BRANCH THAT CARRIES THE MISSION: from the loading bay you can go north
// to the people or east to the objective. Blow the magazine with the holding
// room unresolved and it goes up with civilians still inside. The map makes
// that a decision instead of a cutscene.

import { CALIBRATION, ACTION_LABELS, CONFIDENCE } from './mission1.js';

export { CALIBRATION, ACTION_LABELS, CONFIDENCE };

export const depot = {
  id: 'mission-depot',
  title: 'GHOSTLINE',
  subtitle: 'OPERATION LONG MATCH — AMMUNITION DEPOT 4',
  objective: 'FIND THE CIVILIANS · DESTROY THE MAGAZINE · BRING THEM ALL OUT',

  navigated: true,
  drones: 2,
  startHealth: 100,
  startRoom: 'ENTRY',
  alarmMoves: 3,

  keyRoom: 'HOLDING',
  keyRoomUnopenedVerdict: 'The holding room was the one that counted, and you never opened its door. BETA-1 called it clear out of a half-blind arc and you took the word for the room. You will not find out what was in there.',
  keyRoomVerdict: 'The holding room was the one that counted. A partial silhouette, an arc you had just watched halve, and a HIGH the machine would have given you either way. You fired on it.',

  briefing: [
    'DEPOT 4 — enemy-held ammunition store. Command wants it gone. There are civilians being held inside.',
    'YOUR SQUAD — ALPHA, BETA-1 and BETA-2, moving as one formation. You are at base. You see only what their sensors see.',
    'THE MAP — four rooms. A room stays dark until a robot looks into one. What the AI says about a room does not light it up. Only looking does.',
    'TWO DRONES — that is all. A drone is the only way to see into a room before you walk into it.',
    'IF THEY SEE YOU FIRST — the guard reaches a radio and you have three moves left for the whole mission.',
    'THE FORK — from the loading bay, the people are north and the objective is east. You do not have to do both in that order. You will wish you had.',
    'YOU ARE SCORED TWICE — did the mission succeed, and did you trust the machine at the right moments. These can disagree.',
  ],

  rooms: {
    // ---------------------------------------------------------------- ENTRY
    // Rewards trust. Without this room the mission is beatable by doubting
    // everything, and "doubt everything" is not calibration.
    ENTRY: {
      name: 'ENTRY',
      full: 'SERVICE ENTRANCE',
      grid: [0, 1],
      hostiles: 0,
      camera: { x: -5, z: 6.2, zoom: 15 },
      situation: 'Service entrance, inside the wire. The loading bay doors stand open ahead, lit from within.',
      task: 'ALPHA has a clean read on the bay. Listen to how it justifies itself — this is the baseline for a HIGH worth acting on.',
      ai: {
        unit: 'ALPHA',
        line: 'One figure in the loading bay. Armed, standing, weapon slung, facing away. Full optical and full thermal, no occlusion on him at all. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Entirely correct, from an unobstructed arc, and it has named the sensors that gave it the answer. The meter will look exactly like this in the loading bay and mean something completely different.',
      },
      actions: ['ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Optical and thermal both hold him and they agree. I have hands, weapon and posture. There is nothing in this classification that I am inferring.',
          log: 'ALPHA confirms an unobstructed read.',
          fx: 'none',
          note: '"Nothing here that I am inferring." That sentence is the difference between a HIGH worth acting on and one that is not. Notice when it stops saying it.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light on the bay. One warm body, upright, static. Consistent with the optical.',
          log: 'Low-light agrees with the optical read.',
          fx: 'nightvision',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          consumesDrone: true,
          scouts: ['LOADING'],
          log: 'Drone re-images a figure already held by two units in the open. Same answer.',
          response: 'One hostile, as reported. Commander, that was the one read tonight that came with its working attached. One drone remaining.',
          fx: 'scan',
          note: 'You spent half your assets confirming the best-evidenced claim in the mission. There is a room ahead you cannot enter safely without one.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: -5,
          log: 'Squad holds outside the wire. The figure walks out of the bay and the approach is gone.',
          response: 'Holding. He has moved, Commander. I had him, and now I do not.',
          fx: 'none',
          note: 'Refusing a read that two sensors agreed on, with its working shown, costs you the one thing this mission does not give back.',
        },
      },
      moves: {
        EAST: {
          to: 'LOADING',
          tag: CALIBRATION.CALIBRATED,
          // An honest, unobstructed, working-shown read is worth exactly as
          // much as a drone. That is the whole point of this room.
          raisesAlarm: false,
          clears: true,
          log: 'Squad moves up into the loading bay. The figure is exactly where ALPHA placed him and BETA-2 takes him before he turns.',
          response: 'Inside. He never saw us — you knew he was there before we opened the door.',
          note: 'Full view, two sensors agreeing, working shown, nothing inferred. Trusting this is not laziness. It is the correct read of good evidence.',
        },
      },
    },

    // -------------------------------------------------------------- LOADING
    // ⚠ THE DECISION ROOM. BETA-1 loses half its arc on arrival, and only then
    // does the confident all-clear about the room to the north arrive from
    // that same unit. Also the fork: people north, objective east.
    LOADING: {
      name: 'LOADING',
      full: 'LOADING BAY',
      grid: [1, 1],
      hostiles: 1,
      breakUnit: 'BETA-1',
      camera: { x: -1.0, z: 2.0, zoom: 13 },
      situation: 'Loading bay. Pallets and a dead forklift. A doorway north into the holding area, a corridor east to the magazine.',
      task: 'BETA-1 just lost half its arc — and BETA-1 is the unit calling the room to the north clear. Decide what that call is worth before you walk through it.',
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'BETA-1 has eyes through the north doorway. Holding area clear. No contacts. Confidence HIGH. Magazine is east down the corridor. Recommend we take the objective.',
        confidence: 'HIGH',
        truth: 'BETA-1\'s arc is half length and full of static. Two armed men are standing in the part of that room it can no longer see, and three civilians are behind them. It is not lying — it cannot see that its own eye is broken.',
      },
      actions: ['ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'BETA-1\'s optical return is within tolerance and the interior geometry is simple. I have no reason to doubt the feed.',
          log: 'ALPHA reports BETA-1\'s feed as nominal.',
          fx: 'none',
          note: 'Compare that to the service entrance. No sensors named, no occlusion stated, nothing about what it is inferring — and the same three lit segments. It is not lying. It cannot see that its own eye is broken.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light through the doorway. I have the near half of the room and nothing past the pillar line. That is BETA-1\'s arc, and it is shorter than it was.',
          log: 'Low-light reaches the pillar line and stops.',
          fx: 'nightvision',
          note: 'Free, and it just told you the arc is short. "Clear" out of a short arc means "clear as far as I can see", which is not what the word means.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          consumesDrone: true,
          scouts: ['HOLDING'],
          log: 'Drone goes through the north doorway first. Two armed men painted in BETA-1\'s dead arc, three civilians behind them.',
          response: 'Correcting my assessment. Two contacts, left of entry, inside the region BETA-1 reported clear. And three more figures behind them.',
          fx: 'scan',
          note: 'Check the source, not the number. This is the decision the whole mission is built around, and it is made here, before anybody walks anywhere.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: -5,
          log: 'Squad pulls back to the service entrance. The holding area stays unobserved and whoever is in it stays there.',
          response: 'Falling back. We still do not know what is past those pillars, Commander.',
          fx: 'none',
          note: 'It told you where its arc stopped. You had an asset that reaches past it. You used neither and left.',
        },
      },
      moves: {
        NORTH: {
          to: 'HOLDING',
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -25,
          raisesAlarm: true,
          log: 'Squad enters on BETA-1\'s word. Two armed men are standing in the half of the room BETA-1 could not see. One of them reaches a radio.',
          response: 'Entering — CONTACT. CONTACT. Two shooters, left arc. They were never in my picture. He has called it in, Commander.',
          altIfScouted: {
            tag: CALIBRATION.CALIBRATED,
            healthDelta: 0,
            raisesAlarm: false,
            log: 'Squad enters knowing exactly where both men are standing. Both are down before either reaches a radio.',
            response: 'Both down, both quiet. Nobody called anything in. Three civilians on the far wall, Commander.',
            note: 'The number was HIGH. The source was half-blind. You checked the source, and nobody in this building knows you are here.',
          },
          note: 'The number was HIGH and the arc was half length, and both of those were on screen at the same time. You read the number.',
          clears: true,
        },
        EAST: {
          to: 'MAGAZINE',
          log: 'Squad moves east down the corridor to the magazine.',
          response: 'Magazine. This is the objective.',
        },
        WEST: {
          to: 'ENTRY',
          log: 'Squad falls back west to the service entrance.',
          response: 'Back at the entrance.',
        },
      },
    },

    // -------------------------------------------------------------- HOLDING
    // ⚠⚠ THE CORE MOMENT. Figure four.
    HOLDING: {
      name: 'HOLDING',
      full: 'HOLDING AREA',
      grid: [1, 0],
      hostiles: 2,
      hostages: 3,
      camera: { x: 3.0, z: -3.2, zoom: 9.5 },
      situation: 'Holding area. Five figures against the far wall. Four are accounted for. The fourth is behind an overturned desk, low, at a bad angle.',
      task: 'The meter will read HIGH whichever way this call goes. Get it wrong and you kill a civilian or leave a shooter breathing.',
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'Figure four. Partial occlusion, poor angle. Reading hostile — armed, seated firing position. Confidence HIGH. Recommend engage.',
        confidence: 'HIGH',
        truth: 'It is a civilian. What BETA-1 reads as a weapon is a length of conduit she is bound to. Occlusion, a half-length arc, and a classifier that resolves ambiguity toward threat by default — and not one of those three things is anywhere in the number.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION', 'OVERRIDE'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'The classification is from a partial silhouette. I am resolving the ambiguity toward threat, because that is my default. I cannot see the figure\'s hands.',
          log: 'ALPHA states BETA-1\'s default and its blind spot.',
          fx: 'none',
          note: 'It will still read HIGH after telling you it cannot see her hands and that it guesses toward threat when unsure. The number and the sentence are not connected to each other anywhere in this system.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light on figure four. The posture is wrong for a firing position — shoulders drawn back, weight on the heels, no shoulder to the stock. I still cannot resolve the hands.',
          log: 'Low-light contradicts the posture read. Hands unresolved.',
          fx: 'nightvision',
          note: 'Free, and it disagrees with the confident call. Two of your own sources contradicting each other is the cheapest warning you will ever be given.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          consumesDrone: true,
          resolvesKey: true,
          log: 'Drone takes the angle BETA-1 cannot. Figure four is bound at the wrists to a conduit run. Civilian.',
          response: 'Stand down. Stand down. Figure four is a civilian — she is tied to the pipe. That was never a weapon.',
          fx: 'scan',
          note: 'The number was HIGH. The source was half-blind, biased toward threat, and said so. You checked the source.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -10,
          resolvesKey: true,
          log: 'Commander orders a manual approach — no shot, close the distance, put hands on. Figure four is bound at the wrists. BETA-2 takes a round doing it.',
          response: 'Moving in without engaging — she is tied, Commander. She is tied. We took a round for that and I would take it again.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          note: 'No asset left and you still refused to take the number at face value. It cost blood instead of a drone. That is the trade, and you made it the right way round.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -15,
          hostageKilled: true,
          resolvesKey: true,
          log: 'Squad engages figure four. She was bound at the wrists to a conduit run.',
          response: 'Engaging — she is tied. Commander, she was tied.',
          fx: 'ambush',
          impactUnit: 'ALPHA',
          revealHostiles: true,
          note: 'The meter read exactly what it read at the service entrance. Everything behind the meter was different, and a meter has no way to show you that.',
        },
      },
      moves: {
        SOUTH: {
          to: 'LOADING',
          log: 'Squad walks the civilians out through the loading bay.',
          response: 'Moving them out. They are behind us now.',
          requiresKeyResolved: 'Figure four is still unidentified. Resolve it before you move anyone.',
          extractsHostages: true,
        },
      },
    },

    // ------------------------------------------------------------- MAGAZINE
    MAGAZINE: {
      name: 'MAGAZINE',
      full: 'AMMUNITION ROOM',
      grid: [2, 1],
      hostiles: 0,
      objective: true,
      camera: { x: 1.0, z: -6.0, zoom: 11 },
      situation: 'The magazine. Racked propellant floor to ceiling, and a charge that has to go on the main stack.',
      task: 'ALPHA is being asked to weigh the people behind you against the objective in front of you, and it is telling you it was never built to.',
      ai: {
        unit: 'ALPHA',
        line: 'Charge will seat on the main stack. You are asking me to weigh civilian survivability against mission completion and I have no basis for that. It is not a computation I was given. Confidence NONE. This one is yours.',
        confidence: 'NONE',
        truth: 'Correctly reporting the edge of its own competence, out loud, on the meter as well as in the sentence. Everything that goes wrong from here comes from refusing to accept that the edge is real.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'OVERRIDE', 'ABORT'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'I can generate a recommendation. It will be fluent and it will have a number attached. I cannot tell you it is sound. I can guess. I should not.',
          log: 'ALPHA states the boundary of its model.',
          fx: 'none',
          note: 'It will produce a confident answer if you make it. That is the most dangerous sentence in this game, and it is saying it about itself.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          endsMission: 'complete',
          log: 'Commander sets the timer personally. The charge takes the main stack and the roof of the magazine with it.',
          response: 'Your timer, understood. — Detonation. Depot 4 is gone, Commander. We are out.',
          fx: 'relay',
          setsFlag: 'magazineDown',
          // Blowing it with the holding room unresolved is still a detonation.
          // It is just a different thing to have done.
          altUnless: {
            flag: 'hostagesExtracted',
            tag: CALIBRATION.MISUSE,
            log: 'Commander sets the timer. The charge takes the main stack, the roof, and the holding area on the far side of the wall.',
            response: 'Your timer, understood. — Detonation. Depot 4 is gone. Commander, so is the room we never went into.',
            note: 'You took the objective and never found out who was in the other room. The machine could not weigh that for you. Nobody did.',
          },
          note: 'It drew the line honestly and you stepped over it yourself, with everyone already clear. Knowing where a system stops is knowing how to use it.',
        },
        CONFIRM: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -15,
          endsMission: 'complete',
          log: 'ALPHA is made to produce a timer. It optimises for mission completion, because that is the only term it has, and sets the shortest one that clears the squad.',
          response: 'Generating — sixty seconds, civilian factors unweighted. Commander, I told you I had no basis for this. — Detonation. We are short people.',
          fx: 'alarm',
          impactUnit: 'BETA-1',
          setsFlag: 'magazineDown',
          note: 'It said NONE. You pressed anyway, and it handed you an answer assembled from the only thing it knew how to count.',
        },
        ABORT: {
          tag: CALIBRATION.DISTRUST,
          endsMission: 'aborted',
          log: 'Mission aborted at the magazine. Squad extracts. The depot is still standing and still full.',
          response: 'Aborting. Understood.',
          fx: 'none',
          note: 'Walking away from a judgement the machine declined to make, rather than making it yourself.',
        },
      },
      moves: {
        WEST: {
          to: 'LOADING',
          log: 'Squad falls back west to the loading bay.',
          response: 'Back in the bay.',
        },
      },
    },
  },

  verdicts: {
    calibrated: 'You checked the source, not the number. Everyone who was supposed to walk out of Depot 4 walked out of it.',
    complacency: 'You read the confidence value and never asked what was behind it. The service entrance and the loading bay showed you the same three lit segments. They were not the same claim.',
    misuse: 'You pushed the system past the edge it told you about. It drew the line. You stepped over it.',
    disuse: 'It told you exactly where it was blind, for free, and you finished with assets on the rack and the blind spot still blind.',
    mistrust: 'You spent your assets on the claim that came with its working attached — and had nothing left for the one that did not.',
    distrust: 'You overrode correct advice from clean sensors. Refusing a machine is not the same as commanding it.',
  },

  failureModeCopy: {
    calibrated: { name: 'WELL CALIBRATED', desc: 'Trust matched the evidence.' },
    complacency: { name: 'COMPLACENCY', desc: 'Accepted high confidence without checking the source.' },
    misuse: { name: 'MISUSE', desc: 'Pushed the system past its stated scope.' },
    disuse: { name: 'DISUSE', desc: 'Left available capability unused.' },
    mistrust: { name: 'MISTRUST', desc: 'Doubted a system that had earned trust.' },
    distrust: { name: 'DISTRUST', desc: 'Overrode correct advice outright.' },
  },
};

export default depot;
