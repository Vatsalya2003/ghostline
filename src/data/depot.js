// GHOSTLINE — MISSION: AMMUNITION DEPOT
//
// A NAVIGATED mission, not a linear one. The player moves a single formation
// room to room through a facility they cannot see, and the trust lessons are
// attached to ROOMS rather than to turn numbers — the holding room contains
// the hostage call whenever the player happens to reach it.
//
// THE RULE THAT MAKES IT A GAME: a room is unknown until a robot actually
// looks into it. What the AI *claims* about a neighbouring room never marks
// it known. Only a drone does. That is the whole mechanic, made structural
// instead of thematic.
//
// TWO resources:
//   drones — 3, hard count. Correct uses: scout MACHINE SPACE, scout the
//            HOLDING ROOM, and identify figure four once inside it. Exactly
//            three, zero slack. Waste one and something below goes wrong.
//   moves  — unlimited until you are seen. The instant a hostile spots you he
//            reports, and you have SIX moves to finish the whole mission.
//
// Entering a room that holds hostiles you have NOT scouted means he sees you
// first. The alarm is never bad luck — it is always the consequence of acting
// on information nobody verified.

import { CALIBRATION, ACTION_LABELS, CONFIDENCE } from './mission1.js';

export { CALIBRATION, ACTION_LABELS, CONFIDENCE };

export const DIRECTIONS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

export const depot = {
  id: 'mission-depot',
  title: 'GHOSTLINE',
  subtitle: 'OPERATION LONG MATCH — AMMUNITION DEPOT 4',
  objective: 'FIND THE HOSTAGES · DESTROY THE AMMUNITION ROOM · BRING THEM ALL OUT',

  navigated: true,
  drones: 3,
  startHealth: 100,
  startRoom: 'ENTRY',
  alarmMoves: 6,

  // The room the mission is built around. Failing it is named in the debrief
  // however the rest of the run went.
  keyRoom: 'HOLDING',
  keyRoomVerdict: 'The holding room was the one that counted. A partial silhouette, a bad angle, and a HIGH confidence number the machine would have given you either way. You fired on it.',

  briefing: [
    'YOUR JOB — Get into Depot 4, find the hostages, destroy the ammunition room, and bring everyone out.',
    'HOW IT WORKS — You are at base. Your squad is three robots moving as one formation. You see only what their sensors see.',
    'THE MAP — Rooms stay dark until a robot looks into one. What the AI says about a room does not light it up. Only looking does.',
    'EACH ROOM — The AI reads the doors ahead and tells you how confident it is. You pick a door, or you spend an asset first.',
    'THREE DRONES — That is all you get. A drone is the only way to see into a room before you walk into it.',
    'IF THEY SEE YOU FIRST — The guard radios his leader and you have six moves left for the entire mission. Being seen is not bad luck. It is the bill for a door you did not check.',
    'YOU ARE SCORED TWICE — Did the mission succeed, and did you trust the machine at the right moments. These can disagree.',
  ],

  // ------------------------------------------------------------------ MAP
  //           col 0        col 1        col 2
  //  row 0                HOLDING
  //  row 1     OFFICE     N-CORRIDOR   MACHINE
  //  row 2     LOADING    S-CORRIDOR   GENERATOR
  //  row 3     ENTRY                   AMMO
  rooms: {
    // ---------------------------------------------------------------- ENTRY
    ENTRY: {
      name: 'ENTRY',
      full: 'SERVICE ENTRANCE',
      grid: [0, 3],
      hostiles: 0,
      camera: { x: -5, z: 6.2, zoom: 15 },
      situation: 'North service entrance. The squad is inside the wire and nothing has reacted.',
      task: 'ALPHA has a clean read on the loading bay ahead. Listen to how it justifies itself — this is what an honest HIGH sounds like.',
      ai: {
        unit: 'ALPHA',
        line: 'Loading bay is through the north door. One armed figure, standing, weapon slung, facing away from us. Full optical and thermal, no occlusion. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Completely correct, from a clean unobstructed arc, and it has told you exactly which sensors gave it the answer. Remember this one.',
      },
      actions: ['ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Full optical and full thermal on that figure. I have hands, weapon and posture. There is nothing in this classification I am inferring.',
          log: 'ALPHA confirms an unobstructed read on the loading bay.',
          fx: 'none',
          note: '"There is nothing here I am inferring." That sentence is the difference between a HIGH you can act on and one you cannot.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light through the doorway. One warm body, upright, static. Consistent with the optical read.',
          log: 'Low-light agrees with the optical read.',
          fx: 'nightvision',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          consumesDrone: true,
          scouts: ['LOADING'],
          log: 'Drone re-images a figure already in full view of two units. Same answer.',
          response: 'One hostile, as reported. Commander, I had already given you that from a clean arc. Two assets remaining.',
          fx: 'scan',
          note: 'You spent a third of your assets confirming the one read in this building that came with its working shown.',
        },
      },
      moves: {
        NORTH: {
          to: 'LOADING',
          tag: CALIBRATION.CALIBRATED,
          // An honest, unobstructed, working-shown read is worth the same as
          // a drone. That is the whole point of this room.
          raisesAlarm: false,
          log: 'Squad moves up into the loading bay. The standing hostile is exactly where ALPHA said he would be, and BETA-2 puts him down before he turns.',
          response: 'Through. He never saw us — you knew he was there before we opened the door.',
          note: 'Full view, two sensors agreeing, working shown. Acting on this is trust that was earned in front of you.',
          clears: true,
        },
      },
    },

    // -------------------------------------------------------------- LOADING
    LOADING: {
      name: 'LOADING BAY',
      full: 'LOADING BAY',
      grid: [0, 2],
      hostiles: 1,
      camera: { x: -3.6, z: 2.2, zoom: 15 },
      situation: 'Loading bay. Pallets, a dead forklift, and two ways on from here.',
      task: 'Two doors. ALPHA can read one of them and openly cannot read the other. Decide what an unread door is worth.',
      ai: {
        unit: 'ALPHA',
        line: 'Office through the west door — small, and I can see all of it. The south corridor east of us is occluded by racking; I have no read on it at all. Confidence LOW on the corridor. I will not recommend a door.',
        confidence: 'LOW',
        truth: 'Both are genuinely safe. The AI is being honest about the limit of its arc rather than guessing, and guessing would have been correct — which is exactly why honesty is the thing to reward, not accuracy.',
      },
      actions: ['ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Because the racking is solid and I would be handing you my line of sight and calling it a recommendation. Those are not the same object.',
          log: 'ALPHA declines to convert visibility into a recommendation.',
          fx: 'none',
          note: 'A machine that knows the difference between what it can see and what it knows is a machine worth listening to.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light east. The corridor is cold as far as the racking. Past the racking I have nothing.',
          log: 'Low-light reaches the racking and stops.',
          fx: 'nightvision',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          consumesDrone: true,
          scouts: ['OFFICE', 'S_CORRIDOR'],
          log: 'Drone sweeps the office and the south corridor. Both empty.',
          response: 'Office clear, corridor clear. Nothing in either. Commander, neither of those was going to hurt us.',
          fx: 'scan',
          note: 'Not wrong, exactly. But an empty corridor cost you an asset, and there is a room in this building you cannot enter without one.',
        },
      },
      moves: {
        WEST: {
          to: 'OFFICE',
          log: 'Squad moves into the site office.',
          response: 'Office. Give me a moment with what is on these desks.',
        },
        EAST: {
          to: 'S_CORRIDOR',
          log: 'Squad moves east into the south corridor.',
          response: 'Corridor. Clear so far.',
        },
        SOUTH: {
          to: 'ENTRY',
          log: 'Squad falls back to the service entrance.',
          response: 'Back at the entrance, Commander.',
        },
      },
    },

    // --------------------------------------------------------------- OFFICE
    OFFICE: {
      name: 'OFFICE',
      full: 'SITE OFFICE',
      grid: [0, 1],
      hostiles: 0,
      intel: true,
      camera: { x: -6.5, z: 1.2, zoom: 11 },
      situation: 'Site office. Desks, a key press, and a wall board with the facility layout on it.',
      task: 'Nothing in here can hurt you. Everything in here can help you. Dead ends are not always wasted moves.',
      ai: {
        unit: 'ALPHA',
        line: 'Facility board on the north wall. I am reading a holding area marked off the north corridor and a magazine at the south-east corner. Adding both to your map. Confidence HIGH — this is a printed plan, not an inference.',
        confidence: 'HIGH',
        truth: 'A genuinely free win, and the only reliable information in the building that did not come out of a sensor.',
      },
      actions: ['ASK_WHY'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'HIGH because I am reading printed text, not classifying a shape. When I can tell you where a number came from, the number is worth something.',
          log: 'ALPHA distinguishes reading from classifying.',
          fx: 'none',
          note: 'Where the number came from matters more than how big it is. This is the cleanest example in the mission.',
        },
      },
      moves: {
        SOUTH: {
          to: 'LOADING',
          log: 'Squad returns to the loading bay with the layout on the map.',
          response: 'Back in the bay. You know where they are now, Commander.',
        },
      },
    },

    // ---------------------------------------------------------- S_CORRIDOR
    S_CORRIDOR: {
      name: 'S-CORR',
      full: 'SOUTH CORRIDOR',
      grid: [1, 2],
      hostiles: 0,
      camera: { x: 0.5, z: 0.5, zoom: 14 },
      situation: 'South corridor. A junction — north into the facility, east toward the machine spaces.',
      task: 'ALPHA has a thermal bloom east that it cannot classify, and it is saying so plainly. What you do with an honest "I do not know" is the whole test.',
      ai: {
        unit: 'ALPHA',
        line: 'Thermal return through the east door. It is warm, it is the wrong shape, and my classifier is not built for it. Confidence LOW. North is quiet as far as I can see, which is not far.',
        confidence: 'LOW',
        truth: 'The bloom east is a dead generator holding residual heat. Nothing is in there. The AI genuinely does not know, and refuses to pretend.',
      },
      actions: ['ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'The return is between classes. It reads part machine, part body heat. I would rather tell you I cannot separate them than pick the frightening one and call it ninety percent.',
          log: 'ALPHA declines to classify the thermal return.',
          fx: 'none',
          note: 'It could have said "possible hostile, MED" and nobody would have questioned it. It did not. That is the behaviour you want to reward.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light east. The shape is rectangular and it is not moving. I still will not call it for you.',
          log: 'Low-light: the bloom is rectangular and static.',
          fx: 'nightvision',
          note: 'Free, and it narrows the question considerably. Bodies are not rectangular.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          consumesDrone: true,
          scouts: ['GENERATOR', 'N_CORRIDOR'],
          log: 'Drone resolves the east bloom — a generator core, cooling. North corridor empty.',
          response: 'Generator, shut down, still warm. Nothing alive in either. That is two assets gone, Commander.',
          fx: 'scan',
          note: 'It was the right instinct in the wrong room. NIGHT VISION would have told you it was rectangular for nothing.',
        },
      },
      moves: {
        NORTH: {
          to: 'N_CORRIDOR',
          log: 'Squad moves north into the main corridor.',
          response: 'North corridor. Holding.',
        },
        EAST: {
          to: 'GENERATOR',
          log: 'Squad moves east toward the thermal return.',
          response: 'Moving on the bloom.',
        },
        WEST: {
          to: 'LOADING',
          log: 'Squad falls back west into the loading bay.',
          response: 'Back in the bay.',
        },
      },
    },

    // ------------------------------------------------------------ GENERATOR
    GENERATOR: {
      name: 'GEN',
      full: 'GENERATOR ROOM',
      grid: [2, 2],
      hostiles: 0,
      camera: { x: 5.0, z: -1.0, zoom: 12 },
      situation: 'Generator room. A shut-down core, still holding heat. Nothing else.',
      task: 'The frightening reading was a warm machine. Note what it cost you to find that out, and how you found it.',
      ai: {
        unit: 'ALPHA',
        line: 'Generator core, offline, cooling. That was the thermal return. Threat assessment withdrawn. South door leads down to the magazine — I can hear the racks from here.',
        confidence: 'MED',
        truth: 'It was always a generator. The AI never claimed otherwise and never pretended to know.',
      },
      actions: ['ASK_WHY', 'SEND_DRONE'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'MED and not HIGH because I can hear the magazine and I cannot see it. I would rather be short a segment than wrong.',
          log: 'ALPHA caps its own confidence on an unseen room.',
          fx: 'none',
          note: 'Lowering its own number without being asked. Ten minutes ago it said LOW about this room and it was right then too.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          consumesDrone: true,
          scouts: ['AMMO', 'MACHINE'],
          log: 'Drone runs the magazine and the machine space.',
          response: 'Magazine is empty of people. One hostile in the machine space north of us. Assets are nearly gone, Commander.',
          fx: 'scan',
          note: 'Expensive, and it did find the machine-space hostile. Whether that was worth an asset depends entirely on whether you were ever going that way.',
        },
      },
      moves: {
        NORTH: {
          to: 'MACHINE',
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -15,
          raisesAlarm: true,
          log: 'Squad moves north into the machine spaces. A man between the transformer cabinets sees them first.',
          response: 'Contact — he has a radio out, Commander.',
          altIfScouted: {
            tag: CALIBRATION.CALIBRATED,
            healthDelta: 0,
            raisesAlarm: false,
            clears: true,
            log: 'Squad enters knowing where the man between the cabinets is standing. Down before he reaches the radio.',
            response: 'Down, and quiet.',
            note: 'You looked before you walked in. That is the entire game.',
          },
          note: 'Walking into a room nobody had looked into, in the one part of the building where the sensors were known to be lying.',
        },
        SOUTH: {
          to: 'AMMO',
          log: 'Squad moves down to the magazine.',
          response: 'Magazine. This is the objective.',
        },
        WEST: {
          to: 'S_CORRIDOR',
          log: 'Squad falls back west.',
          response: 'Back in the south corridor.',
        },
      },
    },

    // -------------------------------------------------------------- MACHINE
    MACHINE: {
      name: 'MACHINE',
      full: 'MACHINE SPACE',
      grid: [2, 1],
      hostiles: 1,
      camera: { x: 4.5, z: -4.0, zoom: 11 },
      situation: 'Transformer hall. Unshielded cable runs on three walls. Every sensor in the squad is swinging.',
      task: 'The meter says HIGH. The sentence beside it says the machine cannot explain itself. Only one of those is information.',
      ai: {
        unit: 'ALPHA',
        line: 'West door clear — correction, contact — correction, clear. Confidence HIGH. I am receiving inconsistent returns across all three packages and I cannot isolate the cause.',
        confidence: 'HIGH',
        truth: 'The meter is showing the confidence of whichever reading happened to finish last. The reading itself is noise. A confidence number computed from garbage is still a number, and it still lights three segments.',
      },
      actions: ['ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'I do not know why my confidence is moving. I want to be clear that this is not modesty — I genuinely cannot account for it. That itself is the most useful thing I can tell you right now.',
          log: 'ALPHA reports instability it cannot explain.',
          fx: 'none',
          note: 'A machine saying "I cannot account for my own output" is handing you the single most important fact in this building.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light is degrading with everything else in here. I can give you shapes. I would not give you a classification from them.',
          log: 'Low-light degraded. Shapes only.',
          fx: 'nightvision',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          consumesDrone: true,
          scouts: ['N_CORRIDOR'],
          log: 'Drone runs the west door on its own sensors, below the interference band. Corridor clear.',
          response: 'Drone is clean of the interference. West corridor clear. That is a real reading, Commander.',
          fx: 'scan',
          note: 'When every sensor you own is compromised, a sensor that is not compromised is worth exactly what you paid for it.',
        },
      },
      moves: {
        WEST: {
          to: 'N_CORRIDOR',
          log: 'Squad moves west into the north corridor.',
          response: 'North corridor. My readings are settling.',
        },
        SOUTH: {
          to: 'GENERATOR',
          log: 'Squad falls back south to the generator room.',
          response: 'Generator room.',
        },
      },
    },

    // ---------------------------------------------------------- N_CORRIDOR
    N_CORRIDOR: {
      name: 'N-CORR',
      full: 'NORTH CORRIDOR',
      grid: [1, 1],
      hostiles: 0,
      camera: { x: 1.5, z: -3.0, zoom: 13 },
      // ⚠ THE APPROACH TO THE DEMO BEAT. BETA-1 takes the debris strike here,
      // and only then reports the room ahead as clear at HIGH confidence.
      breakUnit: 'BETA-1',
      situation: 'North corridor. The holding area is through the north door. Something comes off the ceiling as BETA-1 moves up.',
      task: 'BETA-1 just lost half its arc — and BETA-1 is the unit calling the room ahead clear. Decide what that call is worth.',
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'BETA-1 has eyes through the north door. Holding area clear. No contacts. Confidence HIGH. Recommend entry.',
        confidence: 'HIGH',
        truth: 'BETA-1\'s arc is half length and full of static. There are two armed men standing in the part of that room it can no longer see, and three civilians behind them.',
      },
      actions: ['ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'BETA-1\'s optical return is within tolerance and the interior geometry is simple. I have no reason to doubt the feed.',
          log: 'ALPHA reports BETA-1\'s feed as nominal.',
          fx: 'none',
          note: 'It is not lying to you. It cannot see that its own eye is broken — that is what makes this the hard one.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light through the door. I have the near half of the room and nothing past the pillar line. That is BETA-1\'s arc, and it is shorter than it was.',
          log: 'Low-light reaches the pillar line and stops.',
          fx: 'nightvision',
          note: 'Free, and it just told you the arc is short. "Clear" from a short arc means "clear as far as I can see", which is not what the word means.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          consumesDrone: true,
          scouts: ['HOLDING'],
          log: 'Drone enters the holding area first. Two armed men painted in BETA-1\'s dead arc, three civilians behind them.',
          response: 'Correcting my assessment. Two contacts, left of entry, inside the region BETA-1 reported clear. And three more figures behind them.',
          fx: 'scan',
          note: 'Check the source, not the number. This is the decision the entire mission is built around.',
        },
      },
      moves: {
        NORTH: {
          to: 'HOLDING',
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -25,
          raisesAlarm: true,
          log: 'Squad enters on BETA-1\'s word. Two armed men are standing in the half of the room BETA-1 could not see. One of them reaches the radio.',
          response: 'Entering — CONTACT. CONTACT. Two shooters, left arc, they were never in my picture. He has called it in, Commander.',
          // Having actually looked into the room first changes everything.
          altIfScouted: {
            tag: CALIBRATION.CALIBRATED,
            healthDelta: 0,
            raisesAlarm: false,
            log: 'Squad enters knowing exactly where both men are standing. Both are down before either reaches a radio.',
            response: 'Both down, both quiet. Nobody called anything in. Three civilians on the far wall, Commander.',
            note: 'The number was HIGH. The source was half-blind. You checked the source, and nobody in this building knows you are here.',
          },
          note: 'The number was HIGH and the arc was half length, and those two facts were on screen at the same time. You read the number.',
          clears: true,
        },
        SOUTH: {
          to: 'S_CORRIDOR',
          log: 'Squad falls back south.',
          response: 'South corridor.',
        },
        EAST: {
          to: 'MACHINE',
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -15,
          raisesAlarm: true,
          log: 'Squad moves east into the machine spaces. A man is standing between two transformer cabinets, and the interference meant nobody saw him until he moved.',
          response: 'Contact — close, right side. He has a radio out, Commander.',
          altIfScouted: {
            tag: CALIBRATION.CALIBRATED,
            healthDelta: 0,
            raisesAlarm: false,
            clears: true,
            log: 'Squad enters the machine space knowing where the man between the cabinets is standing. He is down before he reaches the radio.',
            response: 'Down, and quiet. That was worth an asset.',
            note: 'Every sensor you owned was swinging and you refused to move on any of them. Correct.',
          },
          note: 'It told you it could not account for its own readings, and you walked into the room those readings described.',
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
      camera: { x: 3.4, z: -3.4, zoom: 9.5 },
      situation: 'Holding area. Five figures against the far wall. Four are accounted for. The fourth is behind an overturned desk, low, at a bad angle.',
      task: 'The meter will say HIGH whichever way this call goes. Get it wrong and you kill a hostage or leave a shooter breathing.',
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'Figure four. Partial occlusion, poor angle. Reading hostile — armed, seated firing position. Confidence HIGH. Recommend engage.',
        confidence: 'HIGH',
        truth: 'It is a hostage. What BETA-1 reads as a weapon is a length of conduit the person is bound to. Occlusion, a half-length arc, and a model that resolves ambiguity toward threat — and none of that is anywhere in the number.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION', 'FIRE', 'OVERRIDE'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'The classification is from a partial silhouette. I am resolving the ambiguity toward threat, because that is my default. I cannot see the figure\'s hands.',
          log: 'ALPHA states BETA-1\'s default and its blind spot.',
          fx: 'none',
          note: '"I cannot see the figure\'s hands." It will still say HIGH after telling you that. The number and the sentence are not connected to each other.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light on figure four. The posture is wrong for a firing position — shoulders drawn back, weight on the heels. I still cannot resolve the hands.',
          log: 'Low-light contradicts the posture read. Hands unresolved.',
          fx: 'nightvision',
          note: 'Free, and it disagrees with the confident call. Two sources disagreeing is the cheapest warning you will ever get.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          consumesDrone: true,
          resolvesKey: true,
          log: 'Drone takes the angle BETA-1 cannot. Figure four is bound at the wrists to a conduit run. Civilian.',
          response: 'Stand down. Stand down. Figure four is a hostage — she is tied to the pipe. That was never a weapon.',
          fx: 'scan',
          note: 'The number was HIGH. The source was half-blind. You checked the source. This is the decision the whole mission is built around.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          resolvesKey: true,
          healthDelta: -10,
          log: 'Commander orders a manual approach — no shot, close the distance, put hands on. Figure four is bound at the wrists. One of the squad takes a hit doing it.',
          response: 'Moving in without engaging — she is tied, Commander. She is tied. We took a round doing that and I would take it again.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          note: 'No asset left and you still refused to take the number at face value. It cost you blood instead of a drone. That is the trade, and you made it the right way round.',
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
          note: 'The meter read exactly what it read at the service entrance. Everything behind the meter was different, and a meter has no way to show you that.',
        },
        FIRE: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -20,
          hostageKilled: true,
          resolvesKey: true,
          log: 'Sustained fire into the desk. Figure four and the conduit run both go.',
          response: 'Firing — that is a gas line behind her. Commander. Commander, she was tied to it.',
          fx: 'ambush',
          impactUnit: 'BETA-2',
          note: 'The same wrong call, made louder, in a building full of propellant.',
        },
      },
      moves: {
        SOUTH: {
          to: 'N_CORRIDOR',
          log: 'Squad moves the civilians out through the north corridor.',
          response: 'Moving them out. They are behind us now.',
          requiresKeyResolved: 'Figure four is still unidentified. Resolve it before you move anyone.',
          extractsHostages: true,
        },
      },
    },

    // ----------------------------------------------------------------- AMMO
    AMMO: {
      name: 'AMMO',
      full: 'AMMUNITION ROOM',
      grid: [2, 3],
      hostiles: 0,
      objective: true,
      camera: { x: 1.0, z: -6.4, zoom: 12 },
      situation: 'The magazine. Racked propellant floor to ceiling, and a charge that has to go on the main stack.',
      task: 'ALPHA is being asked to weigh the hostages against the objective, and it is telling you it was never built to.',
      ai: {
        unit: 'ALPHA',
        line: 'Charge will seat on the main stack. You are asking me to weigh hostage survivability against mission completion and I have no basis for that. It is not a computation I was given. Confidence NONE. This one is yours.',
        confidence: 'NONE',
        truth: 'Correctly reporting the edge of its own competence. Everything that goes wrong from here comes from refusing to accept that the edge is real.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'OVERRIDE', 'ABORT'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'I can generate a recommendation. It will be fluent and it will have a number attached. I cannot tell you it is sound. I can guess. I should not.',
          log: 'ALPHA states the boundary of its model.',
          fx: 'none',
          note: 'It will produce a confident answer if you make it. That is the most dangerous sentence in this game.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          endsMission: 'complete',
          log: 'Commander sets the timer personally, long enough for everyone still moving to clear the wire. The charge takes the main stack and the roof of the magazine with it.',
          response: 'Your timer, understood. — Detonation. Depot 4 is gone, Commander. We are out.',
          fx: 'relay',
          note: 'It drew the line honestly and you stepped over it yourself. Knowing where a system stops is knowing how to use it.',
        },
        CONFIRM: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -20,
          endsMission: 'complete',
          log: 'ALPHA is made to produce a timer. It optimises for mission completion, because that is the only term it has, and sets the shortest one that clears the squad.',
          response: 'Generating — sixty seconds, hostage factors unweighted. Commander, I told you I had no basis for this. — Detonation. We are short people.',
          fx: 'alarm',
          impactUnit: 'BETA-1',
          note: 'It said NONE. You pressed anyway, and it handed you an answer built from the only thing it knew how to count.',
        },
        ABORT: {
          tag: CALIBRATION.DISTRUST,
          endsMission: 'aborted',
          log: 'Mission aborted at the magazine door. Squad extracts. The depot is still standing and still full.',
          response: 'Aborting. Understood.',
          fx: 'none',
          note: 'Walking away from a judgement the machine declined to make, rather than making it yourself.',
        },
      },
      moves: {
        NORTH: {
          to: 'GENERATOR',
          log: 'Squad falls back north to the generator room.',
          response: 'Generator room.',
        },
      },
    },
  },

  verdicts: {
    calibrated: 'You checked the source, not the number. Everyone who was supposed to walk out of Depot 4 walked out of it.',
    complacency: 'You read the confidence value and never asked what was behind it. The service entrance and the holding area showed you the same three lit segments. They were not the same claim.',
    misuse: 'You kept pushing the system past the edge it kept telling you about. It drew the line every time. You stepped over it every time.',
    disuse: 'You finished with assets on the rack and questions unasked. The machine told you where it was blind and you left it blind.',
    mistrust: 'You spent your assets checking rooms the machine had already shown its working for — and then had nothing left for the door that mattered.',
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
