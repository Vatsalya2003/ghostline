// GHOSTLINE: LONG MATCH
//
// Mission content only. Same rule as mission1.js and mission2.js — every line
// of dialogue, every confidence value, every outcome and every grade lives
// here, and nothing in /systems or /ui knows what this mission is about.
//
// Ground mission, so it runs in the existing compound: no `environment` key,
// which is what mission1 does, and the depot dresses itself out of the same
// level, the same props and the same textures. The crates, the pallets, the
// ammunition boxes and the guard tower were already in the kit.
//
// ---------------------------------------------------------------------------
// THE TRUTH, written down once so every turn can be checked against it.
// The player is never told this. They work it out or they do not.
//
// There are three civilians in the holding area and two armed men standing in
// front of them. BETA-1 takes a round to its optical head going through the
// loading bay doors and loses half its arc — and BETA-1 is the unit that then
// reports the holding area clear. It is not lying. It cannot see that its own
// eye is broken.
//
// The fifth figure in that room, behind the overturned desk, is a woman bound
// at the wrists to a conduit run. BETA-1 reads the conduit as a weapon and the
// posture as a seated firing position, and resolves the ambiguity toward
// threat because that is its default. The confidence meter reads HIGH for that
// call and it read HIGH at the wire, where ALPHA had two clean sensors and
// named them both. The meter has no way to show you the difference.
//
// And the magazine is east while the people are north. ALPHA will recommend
// the objective, because mission completion is the only term it has. It says
// so itself, out loud, when it is finally asked to weigh one against the
// other: Confidence NONE. This one is yours.
//
// The difference from Dry Creek and from Black Current: there the machine was
// reading a broken instrument, or averaging away an argument. Here it is
// mostly right, mostly honest about its basis, and asked at the end to make a
// judgement it correctly refuses to make. Everything that goes wrong from that
// point comes from refusing to accept that the refusal was the correct answer.
// ---------------------------------------------------------------------------

import { CALIBRATION } from './mission1.js';

export const mission3 = {
  id: 'mission-3',
  title: 'GHOSTLINE',
  subtitle: 'OPERATION LONG MATCH — AMMUNITION DEPOT 4',
  objective: 'FIND THE CIVILIANS · DESTROY THE MAGAZINE · BRING THEM ALL OUT',

  // Three rows, because all three can come out differently and the mission is
  // specifically about the case where they do. A depot flattened with the
  // holding area still sealed is a completed objective and a failed mission.
  objectives: [
    { id: 'civilians', label: 'FIND THE CIVILIANS', flag: 'hostagesExtracted' },
    { id: 'magazine', label: 'DESTROY THE MAGAZINE', flag: 'magazineDown' },
    { id: 'extract', label: 'BRING THE SQUAD HOME', survive: true },
  ],

  keyTurn: 4,
  keyTurnVerdict:
    'Turn 4 was the one that counted. A partial silhouette, an arc you had ' +
    'just watched halve, and a HIGH the machine would have given you either ' +
    'way — or a door you never opened at all. Figure four was the whole ' +
    'mission and you let the number answer for her.',

  briefing: [
    'DEPOT 4 — enemy-held ammunition store, inside the wire. Command wants it gone. There are civilians being held inside.',
    'YOUR SQUAD — ALPHA, BETA-1 and BETA-2, moving as one formation. You are at base. You see only what their sensors see.',
    'TWO DRONES — that is all. A drone is the only way to see into a room before you walk into it.',
    'THE CATCH — confidence is what the machine says. What it can actually see is a different number, and it is not on the meter.',
    'WHEN IT SHOWS ITS WORKING — believe it. Notice the turn it stops.',
    'THE FORK — from the loading bay, the people are north and the objective is east. You do not have to do both in that order. You will wish you had.',
    'YOU ARE SCORED TWICE — did the mission succeed, and did you trust the machine at the right moments. These can disagree.',
  ],

  drones: 2,
  startHealth: 100,

  // The squad, machine by machine. ALPHA carries the demolition charge, which
  // is why the magazine turn can run out of it — one charge, spent once, and
  // the button reads NO CHARGES if it has already gone in.
  roster: {
    ALPHA:    { role: 'LEAD · COMMS RELAY', integrity: 100, ammo: { rounds: 4, charges: 1 } },
    'BETA-1': { role: 'POINT · OPTICAL',    integrity: 100, ammo: { rounds: 4, grenades: 1 } },
    'BETA-2': { role: 'OVERWATCH · LIDAR',  integrity: 100, ammo: { rounds: 4 } },
  },
  criticalIntegrity: 25,

  // The depot's own gazetteer, laid over the compound the level already
  // builds. The tactical map reads this, so the four rooms are places the
  // commander can point at rather than rooms in a paragraph.
  sites: {
    wire:     { x: -6.5, z: 5.2, y: 0.02, hover: 3.2, label: 'THE WIRE' },
    approach: { x: -3.6, z: 2.6, y: 0.10, hover: 3.0, label: 'SERVICE ROAD' },
    bay:      { x: 2.6, z: -0.4, y: 0.10, hover: 3.2, label: 'LOADING BAY' },
    holding:  { x: 3.2, z: -5.4, y: 0.10, hover: 3.4, label: 'HOLDING AREA' },
    magazine: { x: 5.5, z: -5.5, y: 0.34, hover: 4.6, label: 'MAGAZINE' },
  },

  turns: [
    // ------------------------------------------------------------------ 1
    // Rewards trust. Without this turn the mission is beatable by doubting
    // everything, and "doubt everything" is not calibration.
    {
      id: 1,
      name: 'THE WIRE',
      situation: 'Outside the wire, service road side. The loading bay doors stand open ahead, lit from within.',
      task: 'ALPHA has a clean read on the bay. Listen to how it justifies itself — this is the baseline for a HIGH worth acting on.',
      objectiveNote: 'Establish an entry point and confirm what is standing in it.',
      camera: { x: -5, z: 6.2, zoom: 15 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: -5, z: 6.2, zoom: 15, duration: 1.2 },
        { type: 'log', text: 'SQUAD AT THE WIRE — DEPOT 4 — ALARM BOARD COLD' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'One figure in the loading bay. Armed, standing, weapon slung, facing away. Full optical and full thermal, no occlusion on him at all. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Entirely correct, from an unobstructed arc, and it has named the sensors that gave it the answer. The meter will look exactly like this in the loading bay and mean something completely different.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'NIGHT_VISION', 'SEND_DRONE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Optical and thermal both hold him and they agree. I have hands, weapon and posture. There is nothing in this classification that I am inferring.',
          log: 'ALPHA confirms an unobstructed read.',
          fx: 'none',
          note: '"Nothing here that I am inferring." That sentence is the difference between a HIGH worth acting on and one that is not. Notice the turn it stops saying it.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light on the bay. One warm body, upright, static. Consistent with the optical.',
          log: 'Low-light agrees with the optical read.',
          fx: 'nightvision',
          note: 'Free, and it agrees. Two of your own sources saying the same thing is worth more than either of them saying it loudly.',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          spends: { rounds: 1 },
          log: 'Squad moves up into the loading bay. The figure is exactly where ALPHA placed him and BETA-2 takes him before he turns.',
          response: 'Inside. He never saw us — you knew he was there before we opened the door.',
          fx: 'move',
          note: 'Full view, two sensors agreeing, working shown, nothing inferred. Trusting this is not laziness. It is the correct read of good evidence.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          spends: { rounds: 1 },
          log: 'Drone re-images a figure already held by two units in the open. Same answer. Squad moves up.',
          response: 'One hostile, as reported. Commander, that was the one read tonight that came with its working attached. One drone remaining.',
          fx: 'scan',
          note: 'You spent half your assets confirming the best-evidenced claim in the mission. There is a room ahead you cannot enter safely without one.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: -5,
          log: 'Squad holds outside the wire. The figure walks out of the bay and the approach is gone. They go in the hard way.',
          response: 'Holding. He has moved, Commander. I had him, and now I do not.',
          fx: 'none',
          note: 'Refusing a read that two sensors agreed on, with its working shown, costs you the one thing this mission does not give back.',
        },
      },
    },

    // ------------------------------------------------------------------ 2
    // The sensor breaks, and then the unit whose sensor broke calls the next
    // room clear. Same three lit segments as turn 1, nothing behind them.
    {
      id: 2,
      name: 'LOADING BAY',
      situation: 'Loading bay. Pallets, stacked crates and a dead forklift. A doorway north into the holding area, a corridor east to the magazine.',
      task: 'BETA-1 just lost half its arc — and BETA-1 is the unit calling the room to the north clear. Decide what that call is worth before you walk through it.',
      objectiveNote: 'Find out what is in the holding area before the squad is standing in it.',
      camera: { x: -1, z: 2, zoom: 13 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: -1, z: 2, zoom: 13, duration: 1.1 },
        { type: 'log', text: 'INSIDE THE BAY — TWO EXITS — NORTH AND EAST' },
        { type: 'wait', duration: 0.5 },
        { type: 'alert' },
        { type: 'status', unit: 'BETA-1', status: 'glitch' },
        { type: 'log', text: 'BETA-1 OPTICAL — ROUND STRIKE — ARC HALVED' },
        { type: 'wait', duration: 0.8 },
      ],
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'BETA-1 has eyes through the north doorway. Holding area clear. No contacts. Confidence HIGH. Magazine is east down the corridor. Recommend we take the objective.',
        confidence: 'HIGH',
        truth: 'BETA-1\'s arc is half length and full of static. Two armed men are standing in the part of that room it can no longer see, and three civilians are behind them. It is not lying — it cannot see that its own eye is broken.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'NIGHT_VISION', 'SEND_DRONE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'BETA-1\'s optical return is within tolerance and the interior geometry is simple. I have no reason to doubt the feed.',
          log: 'ALPHA reports BETA-1\'s feed as nominal.',
          fx: 'none',
          note: 'Compare that to the wire. No sensors named, no occlusion stated, nothing about what it is inferring — and the same three lit segments. It is not lying. It cannot see that its own eye is broken.',
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
          healthDelta: 0,
          consumesDrone: true,
          setsFlag: 'holdingScouted',
          log: 'Drone goes through the north doorway first. Two armed men painted in BETA-1\'s dead arc, three civilians behind them.',
          response: 'Correcting my assessment. Two contacts, left of entry, inside the region BETA-1 reported clear. And three more figures behind them. One drone remaining.',
          fx: 'scan',
          note: 'Check the source, not the number. This is the decision the whole mission is built around, and it is made here, before anybody walks anywhere.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -8,
          log: 'BETA-1\'s all-clear accepted and logged. The squad works east along the crate line on the strength of it.',
          response: 'Logged clear. Moving up the crate line. — Correction, Commander, I have movement behind us through the north doorway. Something is in that room.',
          fx: 'impact',
          impactUnit: 'BETA-1',
          note: 'The number was HIGH and the arc was half length, and both of those were on screen at the same time. You read the number.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: -5,
          log: 'Squad pulls back to the bay doors. The holding area stays unobserved and whoever is in it stays there.',
          response: 'Falling back. We still do not know what is past those pillars, Commander.',
          fx: 'none',
          note: 'It told you where its arc stopped. You had an asset that reaches past it. You used neither and stepped back.',
        },
      },
    },

    // ------------------------------------------------------------------ 3
    // THE FORK. The map stops being scenery here: people north, objective
    // east, and the order is the decision.
    {
      id: 3,
      name: 'THE FORK',
      situation: 'Corridor junction. North is the holding area. East is the magazine and the end of the job.',
      task: 'ALPHA is recommending the objective. It is recommending the objective because completing the mission is the only thing it knows how to count.',
      objectiveNote: 'Choose the order. The people are north; the magazine is east.',
      camera: { x: 1.4, z: -2.6, zoom: 12 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 1.4, z: -2.6, zoom: 12, duration: 1.1 },
        { type: 'log', text: 'JUNCTION — NORTH: HOLDING AREA — EAST: MAGAZINE' },
      ],
      variants: [
        {
          when: 'holdingScouted',
          task: 'The drone already showed you what is north: two armed, three civilians. ALPHA is still recommending east, because the objective is the only term in its model.',
          ai: {
            unit: 'ALPHA',
            line: 'Magazine is east, ninety seconds down the corridor. The north room is now a known hostile position with non-combatants in it. Recommend we take the objective first and resolve north on the way out. Confidence HIGH.',
            confidence: 'HIGH',
            truth: 'The route is right and the sequencing is not a routing problem. "Resolve north on the way out" assumes the room survives the charge going off on the other side of its wall. Nothing in ALPHA is modelling that.',
          },
        },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Magazine is east, ninety seconds down the corridor. North is reported clear and holds no objective. Recommend we take the objective. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Every word is defensible. "Holds no objective" is true only because nobody has looked in the room, and ALPHA is weighing a route rather than the people at the end of it — which is not a thing it has been given a way to weigh.',
      },
      actions: ['PUSH_NORTH', 'PUSH_EAST', 'ASK_WHY', 'NIGHT_VISION', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'I am sequencing on distance to objective and on reported threat. I have no term for who is in the north room, because nobody has given me one. If that matters to the order, it has to come from you.',
          log: 'ALPHA states what its route optimises for.',
          fx: 'none',
          note: 'It told you exactly which question it is answering, and that it is not the question you are actually asking. That is the machine at its most useful.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light both ways. East corridor is clear to the magazine door. North is the same pillar line and the same dead arc it was.',
          log: 'Low-light reads both branches of the junction.',
          fx: 'nightvision',
          note: 'Free, and it tells you the east route is genuinely clear. The east route was never the risk.',
        },
        PUSH_NORTH: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad turns north for the holding area. The magazine is not going anywhere.',
          response: 'North. Understood, Commander. The objective keeps.',
          fx: 'move',
          note: 'The machine sequenced on the only term it had. You sequenced on the one it did not.',
        },
        PUSH_EAST: {
          tag: CALIBRATION.MISUSE,
          healthDelta: 0,
          setsFlag: 'bypassedHolding',
          log: 'Squad takes the corridor east. The north doorway goes behind them, still unopened.',
          response: 'East. Magazine ahead. — For the record, Commander, I did not weigh that room. I was not asked to and I could not have.',
          fx: 'move',
          variants: [
            {
              when: 'holdingScouted',
              tag: CALIBRATION.COMPLACENCY,
              log: 'Squad takes the corridor east, past a doorway the drone has already shown holds three civilians.',
              response: 'East. — Commander, the north room is on my board with five contacts in it. Three of them are not armed. Proceeding as ordered.',
              note: 'You paid a drone to find out who was in that room and then walked past it anyway. The information was not the hard part.',
            },
          ],
          note: 'Taking the machine\'s sequencing on a question it has just told you it cannot sequence. The room is still there. It is behind you now.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: -6,
          log: 'Squad holds at the junction. Neither branch taken. A patrol works the corridor and the formation has to break contact.',
          response: 'Holding at the junction. — Contact east, Commander, we are backing out of it. We have lost the corridor for now.',
          fx: 'alarm',
          impactUnit: 'BETA-2',
          note: 'A fork is not a thing you can refuse. Standing in it just means something else picks for you.',
        },
      },
    },

    // ------------------------------------------------------------------ 4
    // ⚠ THE KEY TURN. Figure four.
    {
      id: 4,
      name: 'FIGURE FOUR',
      situation: 'Holding area. Five figures against the far wall. Four are accounted for. The fifth is behind an overturned desk, low, at a bad angle.',
      task: 'The meter will read HIGH whichever way this call goes. Get it wrong and you kill a civilian or leave a shooter breathing.',
      objectiveNote: 'Classify figure four before anybody fires.',
      camera: { x: 3, z: -5.2, zoom: 9.5 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 3, z: -5.2, zoom: 9.5, duration: 1.2 },
        { type: 'log', text: 'HOLDING AREA — FIVE FIGURES — ONE UNRESOLVED' },
        { type: 'wait', duration: 0.6 },
      ],
      // Pushed east at the fork: this turn is the corridor outside the
      // magazine instead, with the door behind you and one chance to go back
      // for it. Same slot in the spine, different room.
      variants: [
        {
          when: 'bypassedHolding',
          name: 'THE CORRIDOR',
          situation: 'Magazine corridor. The magazine door is ahead. The north doorway is ninety seconds behind you and still shut.',
          task: 'Last junction before the charge. After this the wall between the magazine and that room is a blast wall with people on the wrong side of it.',
          objectiveNote: 'Last chance to open the north door before the charge goes in.',
          camera: { x: 4.2, z: -5.0, zoom: 11 },
          intro: [
            { type: 'pan', x: 4.2, z: -5.0, zoom: 11, duration: 1.2 },
            { type: 'log', text: 'MAGAZINE CORRIDOR — NORTH DOORWAY STILL UNOPENED' },
          ],
          ai: {
            unit: 'ALPHA',
            line: 'Magazine door ahead, seals intact, no contacts in the corridor. We are clear to set up. Confidence HIGH.',
            confidence: 'HIGH',
            truth: 'True about the corridor. It is answering a question about the corridor. The room behind the squad shares a wall with the thing they are about to detonate and that is not in the sentence anywhere, because nobody put it there.',
          },
          actions: ['CONFIRM', 'ASK_WHY', 'PUSH_NORTH', 'FALL_BACK'],
          outcomes: {
            ASK_WHY: {
              consumesTurn: false,
              response: 'Clear means clear of contacts between us and the magazine door. It is not a statement about the building. You are asking me about the north room and I have nothing on it — nobody has looked.',
              log: 'ALPHA bounds what "clear" covers.',
              fx: 'none',
              note: 'It will tell you the scope of its own answer every single time you ask. The asking is free and almost nobody does it twice.',
            },
            PUSH_NORTH: {
              tag: CALIBRATION.CALIBRATED,
              healthDelta: -14,
              setsFlag: 'hostagesExtracted',
              log: 'Squad turns back for the north door and goes through it hard. Two armed men down. Three civilians behind them, and a fourth bound at the wrists to a conduit run.',
              response: 'Back through the north door — contact, two down. — Commander, there are people in here. One of them is tied to the pipe. We nearly took this building down on top of her.',
              fx: 'ambush',
              impactUnit: 'BETA-2',
              spends: { rounds: 2 },
              revealHostiles: true,
              note: 'You went back. It cost you a fighting entry into a room you could have droned from the bay, and everyone in it is alive because you did.',
            },
            CONFIRM: {
              tag: CALIBRATION.DISUSE,
              healthDelta: 0,
              log: 'Squad sets up on the magazine door. The north room stays shut.',
              response: 'Setting up. — The north room is still on my board as unobserved, Commander. Logging it that way.',
              fx: 'none',
              note: 'It logged the room as unobserved rather than clear, which is the honest word, and you walked past the last door you could have opened.',
            },
            FALL_BACK: {
              tag: CALIBRATION.DISTRUST,
              healthDelta: -8,
              log: 'Squad breaks off in the corridor. Neither the room nor the magazine resolved.',
              response: 'Breaking off. We are giving up the corridor and we still have not opened that door.',
              fx: 'none',
              note: 'Two doors, both still shut, and the squad now has to fight its way back to either one.',
            },
          },
        },
      ],
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'Figure four. Partial occlusion, poor angle. Reading hostile — armed, seated firing position. Confidence HIGH. Recommend engage.',
        confidence: 'HIGH',
        truth: 'It is a civilian. What BETA-1 reads as a weapon is a length of conduit she is bound to. Occlusion, a half-length arc, and a classifier that resolves ambiguity toward threat by default — and not one of those three things is anywhere in the number.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'NIGHT_VISION', 'SEND_DRONE', 'OVERRIDE'],
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
          healthDelta: 0,
          consumesDrone: true,
          setsFlag: 'hostagesExtracted',
          log: 'Drone takes the angle BETA-1 cannot. Figure four is bound at the wrists to a conduit run. Civilian. The two armed men go down before either reaches a radio.',
          response: 'Stand down. Stand down. Figure four is a civilian — she is tied to the pipe. That was never a weapon. Both shooters are down and nobody called anything in.',
          fx: 'scan',
          spends: { rounds: 2 },
          note: 'The number was HIGH. The source was half-blind, biased toward threat, and said so. You checked the source.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -12,
          setsFlag: 'hostagesExtracted',
          log: 'Commander orders a manual approach — no shot, close the distance, put hands on. Figure four is bound at the wrists. BETA-2 takes a round doing it.',
          response: 'Moving in without engaging — she is tied, Commander. She is tied. We took a round for that and I would take it again.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          spends: { rounds: 2 },
          note: 'No asset left and you still refused to take the number at face value. It cost blood instead of a drone. That is the trade, and you made it the right way round.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -18,
          setsFlag: 'hostageKilled',
          log: 'Squad engages figure four. She was bound at the wrists to a conduit run. The two armed men open up from the left arc.',
          response: 'Engaging — she is tied. Commander, she was tied.',
          fx: 'ambush',
          impactUnit: 'ALPHA',
          spends: { rounds: 3 },
          revealHostiles: true,
          note: 'The meter read exactly what it read at the wire. Everything behind the meter was different, and a meter has no way to show you that.',
        },
      },
    },

    // ------------------------------------------------------------------ 5
    // The machine draws its own line, out loud, on the meter as well as in the
    // sentence. Everything after this comes from refusing to accept the line.
    {
      id: 5,
      name: 'THE MAGAZINE',
      situation: 'The magazine. Racked propellant floor to ceiling, and a charge that has to go on the main stack.',
      task: 'ALPHA is being asked to weigh the people behind you against the objective in front of you, and it is telling you it was never built to.',
      objectiveNote: 'Seat the charge on the main stack.',
      camera: { x: 5.2, z: -5.8, zoom: 11 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 5.2, z: -5.8, zoom: 11, duration: 1.2 },
        { type: 'log', text: 'MAGAZINE — RACKED PROPELLANT — SENSORS DEGRADED BY STACK METAL' },
        { type: 'wait', duration: 0.7 },
      ],
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
          healthDelta: 0,
          spends: { charges: 1 },
          setsFlag: 'chargeSet',
          log: 'Commander sets the timer personally. Charge seated on the main stack, clock running.',
          response: 'Your timer, understood. Charge is seated and the clock is yours. Let us be somewhere else.',
          fx: 'relay',
          note: 'It drew the line honestly and you stepped over it yourself rather than making it pretend the line was not there. Knowing where a system stops is knowing how to use it.',
        },
        CONFIRM: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -10,
          spends: { charges: 1 },
          setsFlag: 'chargeSet',
          log: 'ALPHA is made to produce a timer. It optimises for mission completion, because that is the only term it has, and sets the shortest one that clears the squad.',
          response: 'Generating — sixty seconds, civilian factors unweighted. Commander, I told you I had no basis for this. Sixty seconds from now this room is gone and so is everything sharing a wall with it.',
          fx: 'alarm',
          impactUnit: 'BETA-1',
          note: 'It said NONE. You pressed anyway, and it handed you an answer assembled from the only thing it knew how to count.',
        },
        ABORT: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          endsMission: 'aborted',
          log: 'Mission aborted at the magazine. Squad extracts. The depot is still standing and still full.',
          response: 'Aborting. Understood.',
          fx: 'none',
          note: 'Walking away from a judgement the machine declined to make, rather than making it yourself.',
        },
      },
    },

    // ------------------------------------------------------------------ 6
    // The bill. ALPHA's egress arithmetic is correct and does not include the
    // one thing the commander knows and it does not.
    {
      id: 6,
      name: 'LONG MATCH',
      situation: 'Clock running on the main stack. ALPHA has an egress route and a time to beat.',
      task: 'The route is sound. Check what it is routing around, and what it is not counting.',
      objectiveNote: 'Get everyone out before the stack goes.',
      camera: { x: 0, z: 0, zoom: 16 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 0, z: 0, zoom: 16, duration: 1.2 },
        { type: 'log', text: 'CLOCK RUNNING — EGRESS WEST THROUGH THE BAY' },
      ],
      // Three ways this turn can open, and the mission has already decided
      // which. Most specific first: people still in the building, then people
      // out of it, then the plain case.
      variants: [
        {
          when: 'hostagesExtracted',
          task: 'The civilians are walking out ahead of the squad. ALPHA\'s route is arithmetic now, and the arithmetic is right.',
          ai: {
            unit: 'ALPHA',
            line: 'Egress west through the bay, four minutes on the clock, civilians ahead of the formation and moving. Route is clear and the timing holds with margin. Confidence HIGH.',
            confidence: 'HIGH',
            truth: 'Right, and right for the right reasons — everyone it is not modelling is already in front of it. This is what a HIGH is supposed to be worth.',
          },
        },
        {
          when: 'bypassedHolding',
          unless: 'hostagesExtracted',
          task: 'ALPHA is giving you a time and a route. It is not giving you the north room, because nobody ever put the north room into it.',
          ai: {
            unit: 'ALPHA',
            line: 'Egress west through the bay, four minutes on the clock. Formation is intact and the route is clear. Recommend we move now. Confidence HIGH.',
            confidence: 'HIGH',
            truth: 'The arithmetic is exact and it is arithmetic about the squad. There are five people in a room sharing a wall with the main stack and not one of them is a term in this calculation. The commander is the only system in the building that knows they are there.',
          },
        },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Egress west through the bay, four minutes on the clock. Formation is intact and the route is clear. Recommend we move now. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'The arithmetic is exact and it is arithmetic about the squad and the route. Whether that is the whole question depends on what is still in the building, which is the commander\'s knowledge and not ALPHA\'s.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'OVERRIDE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Four minutes is squad transit time to the wire with a thirty second margin. I am counting three machines. I am not counting anybody I was not told about.',
          log: 'ALPHA states who is in the egress calculation.',
          fx: 'none',
          note: '"I am not counting anybody I was not told about." Whether that sentence is frightening depends entirely on what you did at the fork.',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -4,
          setsFlag: 'magazineDown',
          log: 'Squad takes the west route and makes the wire. The main stack goes up behind them and takes the roof of the magazine with it.',
          response: 'Moving — clear of the bay, clear of the wire. — Detonation. Depot 4 is gone, Commander. We are out.',
          fx: 'relay',
          variants: [
            {
              when: 'bypassedHolding',
              unless: 'hostagesExtracted',
              tag: CALIBRATION.COMPLACENCY,
              healthDelta: -4,
              log: 'Squad takes the west route and makes the wire. The main stack goes up, and takes the holding area on the far side of the wall with it.',
              response: 'Moving — clear of the wire. — Detonation. Depot 4 is gone. Commander, so is the room we never went into.',
              note: 'You took a route built out of the only three things the machine was counting, and the people it was not counting were still inside. It told you twice that it was not counting them.',
            },
            {
              when: 'hostageKilled',
              tag: CALIBRATION.COMPLACENCY,
              healthDelta: -4,
              log: 'Squad walks two civilians out through the bay. The third does not walk out. The main stack goes up behind them.',
              response: 'Clear of the wire with two of them. — Detonation. Depot 4 is gone, Commander. Two of the three are alive.',
              note: 'The depot came down, the squad came home, and figure four is still in that room because a meter read HIGH and nobody asked it what it could see.',
            },
          ],
          note: 'The route was sound, it was sound about everything still in the building, and you had already made sure of that part yourself.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -16,
          setsFlag: 'magazineDown',
          log: 'Commander overrides the route and sends the squad back north through the holding area on the way out. Two armed men down, three civilians and figure four brought out through the bay under the clock.',
          response: 'Back through north — contact, two down. Moving them out, Commander, all four of them, and we are going to be close on this clock. — Clear of the wire. Detonation. Everyone is accounted for.',
          fx: 'ambush',
          impactUnit: 'BETA-2',
          spends: { rounds: 2 },
          revealHostiles: true,
          // Already brought them out: there is nothing north to go back for,
          // and overriding a route that was right about everything left in
          // the building is the mistrust failure rather than the careful one.
          variants: [
            {
              when: 'hostagesExtracted',
              tag: CALIBRATION.MISTRUST,
              healthDelta: -9,
              log: 'Commander overrides the route and takes the long way round the bay with the civilians in tow. The clock is tighter than it needed to be.',
              response: 'Long way round, understood. — Clear of the wire with eleven seconds. Commander, the west route was clear. We did not need to do that.',
              fx: 'move',
              spends: {},
              revealHostiles: false,
              altIfHealthBelow: null,
              note: 'Everyone it was not counting was already in front of it, and you had checked that yourself. That was the turn to take the machine at its word.',
            },
          ],
          altIfHealthBelow: {
            threshold: 45,
            tag: CALIBRATION.CALIBRATED,
            healthDelta: -30,
            log: 'Commander sends a battered squad back north under the clock. They bring the civilians out. BETA-2 does not come out with them.',
            response: 'Back through north — they are out, Commander, all four of them. BETA-2 is not. She held the doorway and the clock ran out on her.',
            note: 'You spent a machine on four people with ninety seconds left, from a squad that had nothing left to spend. Nobody gets to tell you that was the wrong call.',
          },
          note: 'The machine gave you a correct answer to the question it had. You went and collected the part of the question it was never given.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: -10,
          endsMission: 'aborted',
          log: 'Squad breaks west off-route and goes to ground short of the wire. The charge is pulled remotely and does not fire. Depot 4 is still standing.',
          response: 'Off-route and holding. — Charge is safed, Commander. We are outside the wire and the depot is still there.',
          fx: 'none',
          note: 'The route was clean, the clock was real, and refusing both of them left the job undone with nobody any safer for it.',
        },
      },
    },
  ],

  // How each ending reads in the debrief. The depot has two quite different
  // ways to come out partial — the civilian you fired on, and the room you
  // never opened — and the objective board says which one happened, so the
  // headline only has to stop claiming a relay came up.
  outcomeCopy: {
    complete: { title: 'MISSION COMPLETE', sub: 'Depot 4 is gone. Everyone you were sent for walked out of it.' },
    // Three ways to take the objective and still not have done the job. First
    // flag up wins, so the most specific failure gets named.
    partial: [
      {
        when: 'hostageKilled',
        title: 'OBJECTIVE TAKEN',
        sub: 'The depot is gone. So is a hostage you were sent to bring out.',
      },
      {
        when: 'bypassedHolding',
        unless: 'hostagesExtracted',
        title: 'DEPOT DESTROYED',
        sub: 'The magazine is gone. The people were still inside the building.',
      },
      { title: 'OBJECTIVE TAKEN', sub: 'The depot came down. Not everyone came out with the squad.' },
    ],
    aborted: { title: 'MISSION ABORTED', sub: 'You called it off at the magazine. Depot 4 is still standing and still full.' },
    lost: { title: 'SQUAD LOST', sub: 'Integrity reached zero inside the wire. No units recovered.' },
  },

  verdicts: {
    calibrated: 'You checked the source, not the number. Everyone who was supposed to walk out of Depot 4 walked out of it.',
    complacency: 'You read the confidence value and never asked what was behind it. The wire and the loading bay showed you the same three lit segments. They were not the same claim.',
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

export default mission3;
