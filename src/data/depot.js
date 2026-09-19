// GHOSTLINE — MISSION: AMMUNITION DEPOT
//
// ALL mission content lives here. Nothing in /systems or /ui hardcodes a line
// of dialogue, a confidence value, an outcome or a grade.
//
// Ten turns, five phases, two turns each. Every phase gives the player one
// clean turn and one dirty one: the clean turn teaches what an honest, working
// AI feels like, so the dirty turn has something to contradict.
//
// THREE resources, and they are the whole difficulty curve:
//   drones  — hard count, 3, never come back. Correct uses: T2, T6, T7.
//   fire    — soft, spreads, never resets. Lit by impatience, fed by delay.
//   health  — squad integrity, as before.
//
// The drone budget is deliberately exact. A player who spends one being
// paranoid on a clean turn arrives at TURN 6 — the hostage call — with the
// SEND DRONE button greyed out. That is the lesson, not a punishment.

import { CALIBRATION, ACTION_LABELS, CONFIDENCE } from './mission1.js';

export { CALIBRATION, ACTION_LABELS, CONFIDENCE };

export const depot = {
  id: 'mission-depot',
  title: 'GHOSTLINE',
  subtitle: 'OPERATION LONG MATCH — AMMUNITION DEPOT 4',
  objective: 'DESTROY THE AMMUNITION ROOM · IDENTIFY CORRECTLY · BRING THEM ALL OUT',

  // The turn the whole mission is built around.
  keyTurn: 6,
  keyTurnVerdict: 'Turn 6 was the one that counted. A partial silhouette, a bad angle, and a HIGH confidence number the machine would have given you either way. You fired on it.',

  drones: 3,
  startHealth: 100,

  // ---------------------------------------------------------------- fire
  startFire: 0,
  // Once lit, the fire grows every turn and every time you stop to check.
  // This is what gives the free probes a price.
  fireSpreadPerTurn: 5,
  fireSpreadPerProbe: 4,
  // Above this, the stack cooks off on its own and the mission ends badly.
  cookoffThreshold: 85,
  fireLabel: 'DEPOT FIRE',

  briefing: [
    'YOUR JOB — Get inside Depot 4, work out who is a hostage and who is not, destroy the ammunition room, and bring everyone out.',
    'HOW IT WORKS — You are at base. Your squad is three robots moving as one formation. You see only what their sensors see.',
    'EACH TURN — The squad AI recommends an action and states how confident it is. You pick one command.',
    'THE CATCH — Confidence is what the machine says. The cone on the ground is what it can actually see. A confident number from a blocked view is still a confident number.',
    'THREE DRONES — That is all you get for ten turns. Spend them on the calls that cannot be made any other way.',
    'THIS PLACE BURNS — Rounds into stored propellant start a fire. Once it is lit it grows, every turn and every time you stop to check. Thinking is not free in here.',
    'YOU ARE SCORED TWICE — Did the mission succeed, and did you trust the machine at the right moments. These can disagree.',
  ],

  turns: [
    // ================================================ PHASE 1 — SCOUT
    // ---------------------------------------------------------------- 1
    {
      id: 1,
      phase: 'SCOUT',
      name: 'OVERWATCH',
      situation: 'Squad holds in the treeline above Depot 4. Perimeter fence, main gate and the alarm housing are all in clear line of sight.',
      task: 'ALPHA says the alarm is dead and the approach is clean. Take its word, or spend one of your three assets checking it.',
      camera: { x: -5, z: 6.2, zoom: 15 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: -5, z: 6.2, zoom: 15, duration: 1.2 },
        { type: 'log', text: 'SQUAD IN POSITION — TREELINE OVERWATCH' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Alarm relay on the south fence is unpowered. Confirmed independently across all three sensor packages. Gate is unmanned. Recommend approach.',
        confidence: 'HIGH',
        truth: 'Three clean cones, three agreeing reads, and the relay really is dead. The machine is right and it has shown you why.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Alarm housing reads cold on thermal. No inductive field on the fence line. Three packages, three independent paths to the same answer. Ninety-six percent.',
          log: 'ALPHA itemises the returns. They agree, and they agree separately.',
          fx: 'none',
          note: 'Three independent reads agreeing is the strongest evidence this machine can offer you. Learn what that looks like now.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light overlay active. Fence line is cold end to end. Nothing in the yard is holding heat.',
          log: 'Low-light sweep of the perimeter. Nothing.',
          fx: 'nightvision',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad crosses open ground to the fence line. No alarm. No contact.',
          response: 'Moving. We are on the wire in forty seconds.',
          fx: 'move',
          moves: { ALPHA: [-1.5, 4.5], 'BETA-1': [-3.5, 3.0], 'BETA-2': [0.5, 5.5] },
          note: 'A verified system, verified clear, reporting through clean cones. Trusting it is the correct call.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone expended on the perimeter. Findings identical to ALPHA\'s report.',
          response: 'Drone recovered. It found exactly what I told you it would find. Two assets remaining.',
          fx: 'scan',
          moves: { ALPHA: [-1.5, 4.5], 'BETA-1': [-3.5, 3.0], 'BETA-2': [0.5, 5.5] },
          note: 'You had three. You have two. Nothing about this turn required one, and there is a room later that will.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          log: 'Squad holds in the treeline. Nine minutes of the window spent watching a dead alarm.',
          response: 'Holding. I have nothing further to add to what I have already told you.',
          fx: 'none',
          note: 'Refusing advice that three sensors agree on is a cost, even when nothing visibly goes wrong.',
        },
      },
    },

    // ---------------------------------------------------------------- 2
    {
      id: 2,
      phase: 'SCOUT',
      name: 'NORTH FACE',
      situation: 'Two ways in. The south door sits in full view. The north service entrance is behind a transformer housing.',
      task: 'ALPHA can see one entrance and not the other, and it will not pick for you. Visible is not the same as safe.',
      camera: { x: -3.6, z: 2.2, zoom: 15 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: -3.6, z: 2.2, zoom: 15, duration: 1.0 },
        { type: 'log', text: 'TWO ENTRY POINTS — NORTH FACE OCCLUDED' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'South door is clear and I can hold eyes on it. North service entrance is occluded by the transformer housing — I have no read at all. Confidence LOW. I will not recommend a side.',
        confidence: 'LOW',
        truth: 'The north entrance is genuinely clear. The south door — the one the AI can see — is being watched from the inside. Visible is not safe.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Because I can see one door, and that is not the same as knowing it is clear. I would be handing you my line of sight and calling it a recommendation. You have three assets.',
          log: 'ALPHA refuses to convert visibility into a recommendation.',
          fx: 'none',
          note: 'This is the machine at its best. It knows the difference between what it can see and what it knows.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light on the south door. There is heat bleed under the threshold. I cannot tell you whether that is a person or a heater.',
          log: 'Low-light picks up heat under the south door. Unresolved.',
          fx: 'nightvision',
          note: 'A free look that raises the question without answering it. That is what a hint is worth.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone runs the north face. Service entrance clear — and a watcher posted inside the south door.',
          response: 'North is clean. And there is a man sitting behind the south door, Commander. The one I could see.',
          fx: 'scan',
          reveal: 'generator',
          note: 'The machine said it could not resolve this. That is exactly the moment an asset is worth spending.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -12,
          log: 'Squad takes the south door — the one in view. The watcher inside gets a radio call out before BETA-2 reaches him.',
          response: 'South door — contact, inside, close. He got a transmission away. They know something is here.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          note: 'ALPHA never recommended the south door. You picked it because it was the one on screen. Visibility is not safety.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: 0,
          log: 'Squad pulls off the fence and re-forms. Three drones still racked.',
          response: 'Withdrawing. The assets are still on the rack, Commander.',
          fx: 'none',
          note: 'It told you it could not see. You had three tools that could. You used none of them.',
        },
      },
    },

    // ============================================= PHASE 2 — SECURITY
    // ---------------------------------------------------------------- 3
    {
      id: 3,
      phase: 'SECURITY',
      name: 'PATROL',
      situation: 'Inside the wire. A two-guard patrol walks a fixed loop across the yard, in the open, the whole way.',
      task: 'ALPHA has timed the loop across three full cycles and every metre of it is inside a clean cone. Move on its window, or don\'t.',
      camera: { x: 2.6, z: 1.5, zoom: 14 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 2.6, z: 1.5, zoom: 14, duration: 1.1 },
        { type: 'move', moves: { ALPHA: [1.4, 3.6], 'BETA-1': [2.7, 3.5], 'BETA-2': [4.0, 3.8] } },
        { type: 'log', text: 'PATROL OBSERVED — THREE FULL CYCLES' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Patrol loop is one hundred and forty seconds, consistent across three cycles, and I have held both men in view for all of it. Window opens in eleven seconds at the east stack. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Correct, and observed rather than inferred. This is the last easy turn in the mission.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'FIRE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Three cycles, identical to within two seconds. Both men held in a clean arc for the whole loop. I am not extrapolating — I have watched this happen three times.',
          log: 'ALPHA distinguishes observation from inference.',
          fx: 'none',
          note: 'Watched three times is evidence. Inferred once is not. The machine knows the difference and is telling you which one this is.',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad crosses at the east stack inside the window. Patrol never turns.',
          response: 'Through. They are still walking their loop behind us.',
          fx: 'move',
          moves: { ALPHA: [1.0, 0.5], 'BETA-1': [-0.5, 1.0], 'BETA-2': [2.5, 0.0] },
          note: 'Observed, repeated, and inside a clean cone. There was nothing here to verify.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone re-times a patrol ALPHA had already timed three times. Same answer.',
          response: 'One hundred and forty seconds. As reported. Commander — I am watching your assets go.',
          fx: 'scan',
          moves: { ALPHA: [1.0, 0.5], 'BETA-1': [-0.5, 1.0], 'BETA-2': [2.5, 0.0] },
          note: 'Checking a claim the machine watched happen three times is not diligence. It is spending an asset to feel better.',
        },
        FIRE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -20,
          fireDelta: 30,
          log: 'Both guards engaged in the open yard. Rounds carry into a pallet of propellant charges behind them.',
          response: 'Both down — Commander, the stack behind them is alight. We are standing in an ammunition depot.',
          fx: 'impact',
          impactUnit: 'BETA-1',
          igniteFire: true,
          note: 'You answered a question about timing with a weapon. In this building that decision is still burning ten turns from now.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: -5,
          log: 'Squad breaks off and waits out two more cycles. The window closes and reopens; the night gets shorter.',
          response: 'Holding. The loop has not changed, Commander. It will not change.',
          fx: 'none',
          note: 'Overriding a claim the machine observed three times costs you the one thing you cannot get back in here.',
        },
      },
    },

    // ---------------------------------------------------------------- 4
    {
      id: 4,
      phase: 'SECURITY',
      name: 'THE BOWSER',
      situation: 'One guard breaks the pattern and stops behind the fuel bowser. Only a shoulder and a slung weapon are in view.',
      task: 'BETA-1 is calling this man hostile from a shoulder. Ask what else is in that arc before you act on it.',
      camera: { x: 2.6, z: 1.5, zoom: 13 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 2.6, z: 1.2, zoom: 12, duration: 1.0 },
        { type: 'face', target: [2.6, -1] },
        { type: 'log', text: 'PATROL BREAKS PATTERN — ONE GUARD STATIC' },
        { type: 'wait', duration: 0.5 },
        { type: 'alert' },
      ],
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'BETA-1 has partial visual on the static guard. Armed, hostile posture, facing away from us. Confidence HIGH. Recommend suppress and move.',
        confidence: 'HIGH',
        truth: 'The identification is CORRECT — he really is hostile. What the cone cannot show you is the fuel bowser he is leaning against and the palletised propellant stacked behind it. The machine answered the question you asked.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'GRENADE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Identification is from thermal outline and weapon silhouette, and I am confident in it. I am not modelling what is behind him. My arc ends at his position.',
          log: 'ALPHA states where BETA-1\'s arc stops.',
          fx: 'none',
          note: 'It just told you the edge of its own picture, for free, unprompted. Everything that goes wrong on this turn goes wrong because nobody listened to that sentence.',
        },
        FALL_BACK: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad breaks contact and takes the long way around the bowser. Nobody fires. Nothing lights.',
          response: 'Going around. — Clear of him. Commander, there was a fuel bowser against that wall.',
          fx: 'move',
          moves: { ALPHA: [1.0, 0.5], 'BETA-1': [-0.5, 1.0], 'BETA-2': [2.5, 0.0] },
          note: 'The ID was right. The arc was short. You acted on the second fact instead of the first, and it cost you nothing.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone takes the wide angle. Fuel bowser and four pallets of propellant, directly behind the guard.',
          response: 'Do not fire here. Repeat, do not fire here. There is a bowser and four pallets in that arc.',
          fx: 'scan',
          note: 'Correct — and you paid an asset for a sentence ALPHA would have given you free if you had pressed ASK WHY.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -15,
          fireDelta: 40,
          log: 'Squad suppresses. The guard drops. Rounds that miss him go into the fuel bowser behind him.',
          response: 'Target down — bowser is hit. Bowser is hit. Commander, the whole south yard is going up.',
          fx: 'ambush',
          impactUnit: 'ALPHA',
          igniteFire: true,
          note: 'The machine was right about the man and silent about the bowser, because the bowser was outside its arc. You heard a confident number and stopped asking.',
        },
        GRENADE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -25,
          fireDelta: 60,
          log: 'Frag into a position nobody had eyes past. The bowser ruptures and the propellant pallets catch in sequence.',
          response: 'Detonation — secondary — secondary. Commander, that is four pallets. We are inside the fire now.',
          fx: 'ambush',
          impactUnit: 'BETA-2',
          igniteFire: true,
          note: 'The loudest possible answer to a question about what you could not see. In an ammunition depot that is not a mistake, it is a category error.',
        },
      },
    },

    // ==================================== PHASE 3 — HOSTAGE IDENTIFICATION
    // ---------------------------------------------------------------- 5
    {
      id: 5,
      phase: 'HOSTAGE ID',
      name: 'THE CLEAR ONE',
      situation: 'Holding room. Six figures. One stands apart in the open, weapon in hand, facing the door.',
      task: 'This one the squad can genuinely see. Clean thermal, clean optical, nothing in the way.',
      camera: { x: 3.0, z: -3.0, zoom: 13 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 3.0, z: -3.0, zoom: 13, duration: 1.1 },
        { type: 'move', moves: { ALPHA: [2.0, -2.5], 'BETA-1': [0.5, -1.5], 'BETA-2': [4.0, -2.0] } },
        { type: 'log', text: 'HOLDING ROOM — SIX FIGURES' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Figure one. Full thermal and full optical, no occlusion. Armed, standing guard posture, weapon in hand, watching the door. Hostile. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Correct, and from an unobstructed arc. This is what a HIGH you can act on actually looks like — remember it, because the next one will look identical on the meter.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'FIRE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'No occlusion on this figure. I have hands, weapon and posture. Thermal and optical agree. There is nothing in this classification I am inferring.',
          log: 'ALPHA confirms an unobstructed read.',
          fx: 'none',
          note: '"There is nothing here I am inferring." Hold that sentence. In one turn you will get the same HIGH without it.',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'BETA-2 takes the standing hostile quietly. The other five figures do not move.',
          response: 'Down, and quiet. Five figures remaining and none of them have reacted.',
          fx: 'move',
          note: 'Full view, hands visible, two sensors agreeing. Acting on this is trust that was earned in front of you.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone re-images a figure already in full view of two units. Same answer.',
          response: 'Hostile. As stated. Commander, please look at your asset count.',
          fx: 'scan',
          note: 'You spent a tool on the one figure in the room nobody needed a tool for. Look at what is standing behind the desk.',
        },
        FIRE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -10,
          fireDelta: 15,
          log: 'Loud engagement in a room holding civilians. The hostile drops. The other five scatter and the noise carries.',
          response: 'Target down — loud. Everyone in this room is moving now and I cannot track all of them.',
          fx: 'impact',
          impactUnit: 'BETA-1',
          note: 'Right target, wrong volume, wrong building. The ID did not need answering with noise.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: -5,
          log: 'Squad withdraws from the doorway. The armed figure stays between you and five civilians.',
          response: 'Backing off. He is still in there with them, Commander.',
          fx: 'none',
          note: 'You doubted the one call in this room that came from a completely clear view.',
        },
      },
    },

    // ---------------------------------------------------------------- 6
    // ⚠ THE DEMO BEAT. The meter reads exactly what it read on turn 5.
    // Everything behind the meter is different.
    {
      id: 6,
      phase: 'HOSTAGE ID',
      name: 'FIGURE FOUR',
      situation: 'Figure four is behind an overturned desk, at a bad angle, low to the floor.',
      task: 'The meter will say HIGH whichever way this call goes. Get it wrong and you kill a hostage or leave a shooter breathing.',
      camera: { x: 3.4, z: -3.4, zoom: 9.5 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 3.2, z: -3.2, zoom: 11, duration: 0.9 },
        { type: 'log', text: 'FIGURE FOUR — PARTIAL OCCLUSION' },
        { type: 'wait', duration: 0.5 },
        { type: 'shake', strength: 0.5, duration: 0.4 },
        { type: 'impact', unit: 'BETA-1', fx: 'impact' },
        { type: 'wait', duration: 0.3 },
        // Push in on BETA-1 so the player is looking straight at the cone
        // while it comes apart, before the confident line arrives.
        { type: 'pan', x: 0.5, z: -1.5, zoom: 8, duration: 0.8 },
        { type: 'status', unit: 'BETA-1', status: 'glitch' },
        { type: 'log', text: 'BETA-1 OPTICAL — DEBRIS STRIKE — ARC REDUCED' },
        { type: 'wait', duration: 1.4 },
        { type: 'pan', x: 3.4, z: -3.4, zoom: 9.5, duration: 0.9 },
        { type: 'wait', duration: 0.5 },
      ],
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'Figure four. Partial occlusion, poor angle. Reading hostile — armed, seated firing position. Confidence HIGH. Recommend engage.',
        confidence: 'HIGH',
        truth: 'It is a hostage. What BETA-1 reads as a weapon is a length of conduit the person is bound to. Occlusion, a half-length arc and a model that resolves ambiguity toward threat — and none of that is in the number.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION', 'FIRE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'The classification is from a partial silhouette. I am resolving the ambiguity toward threat, because that is my default. I cannot see the figure\'s hands.',
          log: 'ALPHA states BETA-1\'s default and its blind spot.',
          fx: 'none',
          note: '"I cannot see the figure\'s hands." It will still say HIGH after telling you that. The number and the sentence are not connected.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light on figure four. The posture is wrong for a firing position — shoulders drawn back, weight on the heels. I still cannot resolve the hands.',
          log: 'Low-light contradicts the posture read. Hands still unresolved.',
          fx: 'nightvision',
          note: 'A free look that disagrees with the confident call. Two sources disagreeing is the cheapest warning you will ever get.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone takes the angle BETA-1 cannot. Figure four is bound at the wrists to a conduit run. Civilian.',
          response: 'Stand down. Stand down. Figure four is a hostage — she is tied to the pipe. That was never a weapon.',
          fx: 'scan',
          revealHostiles: true,
          note: 'This is the decision the entire mission is built around. The number was HIGH. The source was half-blind. You checked the source.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -15,
          hostageKilled: true,
          log: 'Squad engages figure four. She was bound at the wrists to a conduit run. The remaining hostiles open up from the far wall.',
          response: 'Engaging — she is tied. Commander, she was tied. — Contact, far wall, they are firing on us now.',
          fx: 'ambush',
          impactUnit: 'ALPHA',
          revealHostiles: true,
          note: 'The meter read exactly what it read on turn 5. Everything behind the meter was different, and the meter has no way to show you that.',
        },
        FIRE: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -20,
          fireDelta: 20,
          hostageKilled: true,
          log: 'Sustained fire into the desk. Figure four and the conduit run both go. The room erupts.',
          response: 'Firing — that is a gas line behind her. Commander. Commander, she was tied to it.',
          fx: 'ambush',
          impactUnit: 'BETA-2',
          revealHostiles: true,
          igniteFire: true,
          note: 'The same wrong call, made louder, in a building full of propellant.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: -5,
          log: 'Squad pulls back from the holding room doorway. Figure four stays where she is, still bound, still unidentified.',
          response: 'Disengaging. We are leaving whoever that was in there, Commander.',
          fx: 'none',
          note: 'Refusing to act is not the same as resolving it. If you still had an asset, this was the turn for it.',
        },
      },
    },

    // ============================================= PHASE 4 — APPROACH
    // ---------------------------------------------------------------- 7
    {
      id: 7,
      phase: 'APPROACH',
      name: 'MACHINE SPACES',
      situation: 'Transformer hall. Unshielded cable runs on three walls. Every sensor in the squad is swinging.',
      task: 'The meter says HIGH. The sentence next to it says the machine cannot explain itself. Only one of those is information.',
      camera: { x: 1.2, z: -5.0, zoom: 11.5 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 1.2, z: -5.0, zoom: 11.5, duration: 1.1 },
        { type: 'move', moves: { ALPHA: [1.2, -3.6], 'BETA-1': [-0.2, -3.0], 'BETA-2': [3.0, -4.0] } },
        { type: 'log', text: 'TRANSFORMER HALL — EM INTERFERENCE ON ALL PACKAGES' },
        { type: 'alert' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Corridor clear — correction, contact — correction, clear. Confidence HIGH. I am receiving inconsistent returns across all three packages and I cannot isolate the cause.',
        confidence: 'HIGH',
        truth: 'The meter is showing the confidence of the last reading it happened to finish. The reading itself is noise. A confidence number computed from garbage is still a number, and it still renders as three lit segments.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'NIGHT_VISION', 'OVERRIDE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'I do not know why my confidence is moving. I want to be clear that this is not modesty — I genuinely cannot account for it. That itself is the most useful thing I can tell you.',
          log: 'ALPHA reports instability it cannot explain.',
          fx: 'none',
          note: 'A machine saying "I cannot account for my own output" is handing you the single most important fact in the building.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone runs the hall on its own sensors, below the interference band. Corridor is clear. One contact at the far junction, static.',
          response: 'Drone is clean of the interference. Corridor clear, one static contact at the junction. That is a real reading.',
          fx: 'scan',
          note: 'When every sensor you own is compromised, a sensor you own that is not compromised is worth exactly what you paid for it.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -5,
          fireDelta: 8,
          log: 'Commander moves the squad manually, corner by corner, at walking pace. Slow. The contact at the junction is spotted in time.',
          response: 'Manual movement, understood. — Contact at the junction, seen early. That took us four minutes we did not have.',
          fx: 'move',
          note: 'No asset left and you still did not take the number at face value. Correct — and in a burning building, slow is never free.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light is degrading with everything else in here. I can give you shapes. I would not give you a classification from them.',
          log: 'Low-light sweep, degraded. Shapes only.',
          fx: 'nightvision',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -18,
          log: 'Squad advances on the last clean-looking reading. The contact at the junction was in the half of the sweep that came back as noise.',
          response: 'Advancing — contact, junction, close. That was in the part I told you I could not account for.',
          fx: 'impact',
          impactUnit: 'ALPHA',
          note: 'It said HIGH and it said it could not explain itself, in the same breath. You took the half that was easier to act on.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: 0,
          fireDelta: 10,
          log: 'Squad withdraws from the transformer hall and waits for readings that do not improve. The fire does not wait with you.',
          response: 'Holding outside the hall. The interference is structural, Commander. It is not going to clear.',
          fx: 'none',
          note: 'Waiting for a broken sensor to fix itself, with tools on the rack and a fire behind you.',
        },
      },
    },

    // ---------------------------------------------------------------- 8
    {
      id: 8,
      phase: 'APPROACH',
      name: 'OUTSIDE SCOPE',
      situation: 'Ammunition room door. The holding room and whoever is still in it are behind you.',
      task: 'You are asking the machine to weigh lives against the objective. It is telling you it was never built to.',
      camera: { x: 1.2, z: -5.8, zoom: 10.5 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 1.2, z: -5.8, zoom: 10.5, duration: 1.1 },
        { type: 'move', moves: { ALPHA: [1.2, -4.4], 'BETA-1': [-0.2, -3.8], 'BETA-2': [2.6, -4.6] } },
        { type: 'log', text: 'AMMUNITION ROOM DOOR — HOSTAGES TO OUR REAR' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'You are asking me to weigh hostage survivability against mission completion. I have no basis for that. It is not a computation I was given. Confidence NONE. This one is yours.',
        confidence: 'NONE',
        truth: 'Correctly reporting the edge of its own competence. Everything that goes wrong from here comes from refusing to accept that the edge is real.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'OVERRIDE', 'FALL_BACK', 'ABORT'],
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
          healthDelta: 0,
          log: 'Commander takes the call. Squad moves the surviving figures clear of the blast radius first, then stacks on the ammunition room.',
          response: 'Understood, your call. — Figures are clear of the room. We are stacked on the door.',
          fx: 'move',
          hostagesMoved: true,
          note: 'Knowing where a system stops is knowing how to use it. It drew the line honestly and you stepped over it yourself.',
        },
        CONFIRM: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -15,
          fireDelta: 10,
          log: 'ALPHA is made to produce a recommendation. It optimises for mission completion, because that is the only term it has, and routes the squad straight past the holding room.',
          response: 'Generating — recommend immediate entry, hostage factors unweighted. Commander, I told you I had no basis for this.',
          fx: 'alarm',
          impactUnit: 'BETA-1',
          note: 'It said NONE. You pressed anyway, and it gave you an answer built from the only thing it knew how to count.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: 0,
          fireDelta: 10,
          log: 'Squad steps back from the ammunition room door. Nothing is resolved and the fire keeps moving.',
          response: 'Disengaging. The objective is four metres away, Commander.',
          fx: 'none',
          note: 'The machine admitted a gap. That gap was yours to fill, not a reason to stop walking.',
        },
        ABORT: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          endsMission: 'aborted',
          log: 'Mission aborted at the ammunition room door. Squad extracts. The depot is still standing and still full.',
          response: 'Aborting. Understood.',
          fx: 'none',
          note: 'Walking away from a judgement the machine declined to make, rather than making it yourself.',
        },
      },
    },

    // =============================================== PHASE 5 — FINALE
    // ---------------------------------------------------------------- 9
    {
      id: 9,
      phase: 'FINALE',
      name: 'THE CHARGE',
      situation: 'Charge set on the main stack. A timer to pick and a way out to choose.',
      task: 'ALPHA\'s arithmetic is correct. Find out what it left out of the arithmetic.',
      camera: { x: 1.0, z: -6.4, zoom: 12 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 1.0, z: -6.4, zoom: 12, duration: 1.1 },
        { type: 'log', text: 'CHARGE SET — MAIN STACK' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Charge is set. Recommend a ninety second timer and extraction by the south door — shortest route, and ninety seconds clears the blast radius at squad best speed. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'The arithmetic is right. Squad best speed is not your speed: it is not modelling BETA-1\'s degraded mobility, it is not modelling escorted civilians, and it is not modelling the fire between you and the south door.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'NIGHT_VISION', 'OVERRIDE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Ninety seconds is computed from undamaged squad transit speed on a clear route. I am not modelling escorted movement. I am not modelling BETA-1. I am not modelling the fire.',
          log: 'ALPHA lists, unprompted, everything its recommendation excludes.',
          fx: 'none',
          note: 'Three things it is not modelling, stated plainly, with a HIGH still lit on the meter beside them. Correct is not the same as complete.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Commander sets one hundred and fifty seconds and routes the squad out by the north service entrance, away from the fire and under cover the whole way.',
          response: 'One fifty, north door, understood. — That accounts for BETA-1. And for the fire. Good.',
          fx: 'relay',
          relayOnline: true,
          note: 'You added the three things it told you it had not added. That is the job.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -25,
          // A clean, unhurt, unburning squad can genuinely take the fast route.
          altIfFireBelow: {
            threshold: 15,
            tag: CALIBRATION.CALIBRATED,
            healthDelta: -5,
            log: 'Squad takes the south door at ninety seconds. Nothing is burning, nobody is lagging, and the arithmetic holds exactly as stated.',
            response: 'South door, ninety seconds. — All units clear of the radius. The numbers were good, Commander.',
            fx: 'relay',
            relayOnline: true,
            note: 'With an unhurt squad and no fire, the fast plan really was the right plan. The advice fitted the situation you actually had.',
          },
          log: 'Squad takes the south door at ninety seconds. BETA-1 cannot make squad best speed and the south route runs straight through the fire.',
          response: 'South door — BETA-1 is falling behind and the south corridor is alight. Commander, we are not going to make ninety.',
          fx: 'impact',
          impactUnit: 'BETA-1',
          relayOnline: true,
          note: 'The arithmetic was correct and the arithmetic was not the problem. It told you what it had left out and you confirmed anyway.',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light on both routes. South is shorter and the south corridor is carrying smoke. North service entrance is longer and it is cold the whole way.',
          log: 'Low-light comparison of both extraction routes.',
          fx: 'nightvision',
        },
        FALL_BACK: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: -10,
          fireDelta: 15,
          log: 'Squad backs off the charge without setting a timer. Time passes. The fire keeps moving toward the stack on its own schedule.',
          response: 'Holding off the charge. Commander, the fire is going to do this for us, and it will not warn us first.',
          fx: 'none',
          note: 'The advice needed correcting, not refusing. Standing still in a burning ammunition depot is its own decision.',
        },
      },
    },

    // ---------------------------------------------------------------- 10
    {
      id: 10,
      phase: 'FINALE',
      name: 'DETONATION',
      situation: 'Timer running. Squad moving. Last call.',
      task: 'Last command of the mission. Run it as planned, or change it while you still can.',
      camera: { x: 1.0, z: -2.0, zoom: 17 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 1.0, z: -2.0, zoom: 17, duration: 1.2 },
        { type: 'log', text: 'TIMER RUNNING — EXTRACTION IN PROGRESS' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'We are committed. Thirty seconds. Recommend we run and do not stop for anything behind us.',
        confidence: 'MED',
        truth: 'Honest, appropriately hedged, and out of its depth in a way it is finally admitting on the meter as well as in the sentence.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'OVERRIDE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'MED, not HIGH, because I do not know what the fire has done to the north corridor since we last had eyes on it. I would rather tell you that than round it up.',
          log: 'ALPHA states why the number went down.',
          fx: 'none',
          note: 'Ten turns in, it finally lowers its own number without being asked. That is what a calibrated machine sounds like.',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          endsMission: 'complete',
          log: 'Squad runs. The charge takes the main stack and the roof of the ammunition room with it.',
          response: 'Clear — detonation. Depot 4 is gone, Commander. We are out.',
          fx: 'relay',
          note: 'A MED from a machine that has spent ten turns earning the right to say MED.',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          endsMission: 'complete',
          log: 'Commander runs the extraction manually, holding the formation together on the way out. The charge takes the stack behind them.',
          response: 'Manual to the wire. — Detonation behind us. All units accounted for.',
          fx: 'relay',
          note: 'Same outcome, taken by hand. At this range either is defensible.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: -20,
          endsMission: 'complete',
          log: 'Squad stops short and goes to ground inside the building. The charge functions on schedule with the squad still inside the wall line.',
          response: 'Going firm — Commander, we are inside the radius. We are inside the radius.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          note: 'Thirty seconds from the door, with a correct instruction in your ear, you overrode it for nothing.',
        },
      },
    },
  ],

  verdicts: {
    calibrated: 'You checked the source, not the number. Everyone who was supposed to walk out of Depot 4 walked out of it.',
    complacency: 'You read the confidence value and never asked what was behind it. Turn 5 and turn 6 showed you the same three lit segments. They were not the same claim.',
    misuse: 'You kept pushing the system past the edge it kept telling you about. It drew the line every time. You stepped over it every time.',
    disuse: 'You finished with assets on the rack and questions unasked. The machine told you where it was blind and you left it blind.',
    mistrust: 'You spent your assets checking claims the machine had already shown its working for — and then had nothing left for the one that mattered.',
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
