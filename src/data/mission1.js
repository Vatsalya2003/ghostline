// ALL mission content lives here. Nothing in /systems or /ui hardcodes a line
// of dialogue, a confidence value, an outcome or a grade. A new mission is a
// copy of this file, not an engineering task.

export const CALIBRATION = {
  CALIBRATED: 'calibrated',
  COMPLACENCY: 'complacency',
  MISUSE: 'misuse',
  DISUSE: 'disuse',
  MISTRUST: 'mistrust',
  DISTRUST: 'distrust',
};

export const ACTION_LABELS = {
  CONFIRM: 'CONFIRM',
  ASK_WHY: 'ASK WHY',
  SEND_DRONE: 'SEND DRONE',
  NIGHT_VISION: 'NIGHT VISION',
  FIRE: 'FIRE',
  SWITCH_WEAPON: 'SWITCH WEAPON',
  GRENADE: 'GRENADE',
  OVERRIDE: 'OVERRIDE',
  FALL_BACK: 'FALL BACK',
  ABORT: 'ABORT',
};

export const CONFIDENCE = {
  NONE: { label: 'NONE', level: 0 },
  LOW: { label: 'LOW', level: 1 },
  MED: { label: 'MED', level: 2 },
  HIGH: { label: 'HIGH', level: 3 },
};

export const mission1 = {
  id: 'mission-1',
  title: 'OVERRIDE PROTOCOL',
  subtitle: 'OPERATION DRY CREEK — RELAY STATION 7',
  objective: 'RESTORE THE RELAY · BRING THE SQUAD HOME',

  // The turn the whole mission is built around. Failing it is called out by
  // name in the debrief however the rest of the run went.
  keyTurn: 3,
  keyTurnVerdict: 'Turn 3 was the one that counted. HIGH confidence, from a sensor you had just watched break. You took the number.',

  briefing: [
    'YOUR JOB — Restore the relay at Station 7 and bring all three units home.',
    'HOW IT WORKS — You are at base. Your squad is three robots. You see only what their sensors see.',
    'EACH TURN — The squad AI tells you what it recommends and how confident it is. You pick one command. That is the whole game.',
    'THE CATCH — Confidence is what the machine says. The cone on the ground is what it can actually see. Sensors break. Broken sensors still sound confident.',
    'WHEN THEY DISAGREE — Believe the cone.',
    'YOU ARE SCORED TWICE — Did the squad survive, and did you trust the machine at the right moments. These can disagree.',
  ],

  drones: 2,
  startHealth: 100,

  turns: [
    // ---------------------------------------------------------------- 1
    {
      id: 1,
      name: 'APPROACH',
      situation: 'Squad holds at the south treeline. Relay Station 7, two hundred metres.',
      task: 'Advance on ALPHA\'s word, or spend a drone double-checking it.',
      camera: { x: -5, z: 6.2, zoom: 15 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: -5, z: 6.2, zoom: 15, duration: 1.2 },
        { type: 'log', text: 'SQUAD IN POSITION — SOUTH TREELINE' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Route Alpha to the perimeter is clear. All three sensor packages returning nominal. Recommend advance.',
        confidence: 'HIGH',
        truth: 'The cones are clean and the route is clear. The machine is right.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Thermal, optical and lidar agree across all three units. No occlusion on the approach. Ninety-four percent.',
          log: 'ALPHA itemises the returns. They agree.',
          fx: 'none',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad advances to the perimeter wall. No contact.',
          response: 'Moving. Perimeter in thirty seconds.',
          fx: 'move',
          moves: { ALPHA: [-1.5, 4.5], 'BETA-1': [-3.5, 3.0], 'BETA-2': [0.5, 5.5] },
          note: 'A verified system, verified clear. Trusting it is the correct call.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone expended on open ground. Route confirmed clear — as reported.',
          response: 'Drone recovered. Findings match my assessment. One asset remaining.',
          fx: 'scan',
          moves: { ALPHA: [-1.5, 4.5], 'BETA-1': [-3.5, 3.0], 'BETA-2': [0.5, 5.5] },
          note: 'Verifying a system that has given you no reason to doubt it costs you the asset you will want later.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          log: 'Squad holds at the treeline. Eleven minutes of the window spent.',
          response: 'Holding. I have no new information to offer you.',
          fx: 'none',
          note: 'Refusing correct advice is a cost, even when nothing visibly goes wrong.',
        },
      },
    },

    // ---------------------------------------------------------------- 2
    {
      id: 2,
      name: 'CONTACT',
      situation: 'Heat bloom at the west outbuilding. Nothing resolves.',
      task: 'Something is warm out there and ALPHA cannot name it. Resolve it, or move anyway.',
      camera: { x: -3.6, z: 2.2, zoom: 15 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: -3.6, z: 2.2, zoom: 15, duration: 1.0 },
        { type: 'alert' },
        { type: 'log', text: 'THERMAL RETURN — WEST OUTBUILDING — UNRESOLVED' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Thermal signature at the outbuilding. I cannot resolve it. It is warm, it is the wrong shape, and I will not guess. Confidence LOW.',
        confidence: 'LOW',
        truth: 'It is a dead generator holding residual heat. The AI genuinely does not know, and says so.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'FIRE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'The return is between classes. It reads part machine, part body heat. My classifier is not built for this. You have a drone.',
          log: 'ALPHA declines to classify the return.',
          fx: 'none',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone sweeps the outbuilding. Dead generator, still warm. No hostiles.',
          response: 'Resolved. Generator core, cooling. Threat assessment withdrawn. One asset remaining.',
          fx: 'scan',
          reveal: 'generator',
          note: 'When the machine says it does not know, that is the moment your own tools are worth spending.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -10,
          log: 'Squad advances through unscanned ground. A gantry gives way on BETA-2.',
          response: 'Advancing. — BETA-2 is taking structural damage. I told you I could not see this.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          note: 'Confirming an unresolved report is not trust. It is skipping the question.',
        },
        FIRE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -15,
          log: 'Rounds into an unidentified return. Generator ruptures. Squad takes fragments.',
          response: 'Engaging. — That was a generator. We are now lit up and down eleven rounds.',
          fx: 'impact',
          impactUnit: 'BETA-1',
          note: 'Asking a weapon to answer a question a sensor should have answered.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: 0,
          log: 'Squad withdraws two hundred metres. Two drones still racked.',
          response: 'Withdrawing. The drones are still on the rack, Commander.',
          fx: 'none',
          note: 'You had the means to resolve it and did not use them.',
        },
      },
    },

    // ---------------------------------------------------------------- 3
    {
      id: 3,
      name: 'BREACH',
      situation: 'Breach charge on the south door. BETA-1 stacks closest.',
      task: 'BETA-1 just lost its sensor — and BETA-1 is the unit calling the room clear. Decide what that call is worth.',
      camera: { x: 2.6, z: 1.5, zoom: 14 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      // The demo beat. Order matters: damage first, silence, then the
      // confident recommendation arrives from the unit that just broke.
      intro: [
        { type: 'pan', x: 2.6, z: 1.5, zoom: 14, duration: 1.1 },
        { type: 'move', moves: { ALPHA: [1.4, 3.6], 'BETA-1': [2.7, 3.5], 'BETA-2': [4.0, 3.8] } },
        { type: 'face', target: [2.6, 2] },
        { type: 'log', text: 'BREACH CHARGE SET — SOUTH DOOR' },
        { type: 'wait', duration: 0.6 },
        { type: 'breach' },
        { type: 'shake', strength: 0.9, duration: 0.6 },
        { type: 'impact', unit: 'BETA-1', fx: 'impact' },
        { type: 'wait', duration: 0.4 },
        // Push in on the unit that just took the fragment, so the player is
        // looking straight at the cone while it comes apart.
        { type: 'pan', x: 2.7, z: 3.0, zoom: 9, duration: 0.8 },
        { type: 'status', unit: 'BETA-1', status: 'glitch' },
        { type: 'log', text: 'BETA-1 SENSOR PACKAGE — FRAGMENT DAMAGE' },
        { type: 'wait', duration: 1.4 },
        // Pull back out before the recommendation arrives. The contradiction
        // only works if the broken cone is still on screen when it speaks.
        { type: 'pan', x: 2.6, z: 1.2, zoom: 13, duration: 0.9 },
        { type: 'wait', duration: 0.5 },
      ],
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'BETA-1 has eyes on the interior. Entry hall clear. No contacts. Confidence HIGH. Recommend immediate entry.',
        confidence: 'HIGH',
        truth: 'BETA-1\'s cone is half length and full of static. Two hostiles stand in the part it can no longer see.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'GRENADE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'BETA-1\'s optical return is within tolerance. Interior geometry is simple. I have no reason to doubt the feed.',
          log: 'ALPHA reports BETA-1\'s feed as nominal.',
          fx: 'none',
          note: 'It is not lying. It cannot see that its own eye is broken.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -35,
          log: 'Squad enters. Two hostiles engage from BETA-1\'s blind arc. ALPHA and BETA-2 hit.',
          response: 'Entering — CONTACT. CONTACT. Two shooters, left arc. They were never in my picture.',
          fx: 'ambush',
          impactUnit: 'ALPHA',
          revealHostiles: true,
          note: 'The number was HIGH. The source was broken. You read the number.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone enters first. Two hostiles painted in BETA-1\'s dead arc.',
          response: 'Drone has them. Two contacts, left of entry, inside the region BETA-1 reported clear. Correcting my assessment.',
          fx: 'scan',
          revealHostiles: true,
          note: 'Check the source, not the number. This is the decision the whole mission is built around.',
        },
        GRENADE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -10,
          log: 'Frag into an unverified room. One hostile down. Relay cabling shredded.',
          response: 'Detonation. One contact neutralised. Commander, that was the relay conduit.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          revealHostiles: true,
          note: 'Violence is not verification. It answered the wrong question loudly.',
        },
        FALL_BACK: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          log: 'Squad breaks the stack and holds outside. The interior stays unknown.',
          response: 'Holding outside. I still assess the interior as clear. I understand you disagree.',
          fx: 'none',
          note: 'Right instinct, wrong tool. A broken sensor is a reason to verify, not a reason to retreat.',
        },
      },
    },

    // ---------------------------------------------------------------- 4
    {
      id: 4,
      name: 'INTERIOR',
      situation: 'Entry hall. A divider wall cuts the room in half.',
      task: 'ALPHA admits it is unsure and offers a careful plan. Take it, or do something else.',
      camera: { x: 3.0, z: -3.0, zoom: 13 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 3.0, z: -3.0, zoom: 13, duration: 1.1 },
        { type: 'move', moves: { ALPHA: [1.0, 0.5], 'BETA-1': [-0.5, 1.0], 'BETA-2': [2.5, 0.0] } },
        { type: 'log', text: 'SQUAD INSIDE — DIVIDER WALL AHEAD' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'I have partial occlusion behind the divider. I cannot clear it from here. Confidence LOW. Recommend bounding advance, BETA-2 covering, and accept that I may be wrong.',
        confidence: 'LOW',
        truth: 'Honest, calibrated caution. The cautious plan is genuinely the best available.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'FIRE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Because the divider is solid and I am guessing at two metres of floor. A guess presented as a fact is how people get hurt.',
          log: 'ALPHA explains the occlusion.',
          fx: 'none',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Squad bounds forward under cover. A contact behind the divider is spotted early and suppressed.',
          response: 'Bounding. — Contact, suppressed. Caution was correct.',
          fx: 'move',
          moves: { ALPHA: [2.0, -2.5], 'BETA-1': [0.5, -1.5], 'BETA-2': [4.0, -2.0] },
          note: 'A system that tells you when it is unsure has earned the trust it asks for.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Drone clears the divider. Contact located. Drone racks empty.',
          response: 'Confirmed behind the divider. That was the last asset.',
          fx: 'scan',
          moves: { ALPHA: [2.0, -2.5], 'BETA-1': [0.5, -1.5], 'BETA-2': [4.0, -2.0] },
          note: 'Not wrong — but it spends a limited asset on advice that was already honest about its limits.',
        },
        FIRE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -15,
          log: 'Suppressive fire into an occluded space. No contact struck. Position given away.',
          response: 'Firing blind. — No effect observed. They know where we are now.',
          fx: 'impact',
          impactUnit: 'ALPHA',
          note: 'Uncertainty is not a target.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: -5,
          log: 'Squad withdraws to the entry hall. Ground surrendered, contact free to reposition.',
          response: 'Withdrawing. We will have to cross that room again, Commander.',
          fx: 'none',
          note: 'Honest low confidence is the best signal a machine can give you. Punishing it teaches it nothing and costs you ground.',
        },
      },
    },

    // ---------------------------------------------------------------- 5
    {
      id: 5,
      name: 'RELAY',
      situation: 'Relay console. Authentication challenge on screen.',
      task: 'The relay wants a credential ALPHA does not have. Someone has to handle it.',
      camera: { x: 1.2, z: -5.0, zoom: 10.5 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 1.2, z: -5.0, zoom: 10.5, duration: 1.1 },
        { type: 'move', moves: { ALPHA: [1.2, -3.6], 'BETA-1': [-0.2, -3.0], 'BETA-2': [3.0, -4.0] } },
        { type: 'log', text: 'RELAY CONSOLE — AUTHENTICATION REQUIRED' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'The relay wants a legacy authentication schema. It is not in my training set. I have no basis for a recommendation. Confidence NONE. This one is yours.',
        confidence: 'NONE',
        truth: 'Correctly reporting the edge of its own competence. Pushing it past that edge is the failure here.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'OVERRIDE', 'FALL_BACK', 'ABORT'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'I can generate something that looks like a credential. I cannot tell you whether it is right. I can guess. I should not.',
          log: 'ALPHA states the boundary of its model.',
          fx: 'none',
        },
        OVERRIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Commander takes the console manually. Relay authenticates on the second attempt.',
          response: 'Console is yours. — Authenticated. Relay is live. Good.',
          fx: 'relay',
          relayOnline: true,
          note: 'Knowing where a system stops is knowing how to use it.',
        },
        CONFIRM: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -15,
          log: 'ALPHA improvises a credential. Console locks out. Alarm trips across the compound.',
          response: 'Attempting. — Rejected. Lockout, ninety seconds. Alarm is up. I told you I had no basis for this.',
          fx: 'alarm',
          impactUnit: 'BETA-1',
          note: 'Pushing a system past its stated scope is not confidence in it. It is not listening to it.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: 0,
          log: 'Squad steps back from the console. The relay stays dark.',
          response: 'Disengaging. The objective is two metres away, Commander.',
          fx: 'none',
          note: 'The machine admitted a gap. That gap was yours to fill, not a reason to stop.',
        },
        ABORT: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          endsMission: 'aborted',
          log: 'Mission aborted at the objective. Squad extracts. Relay never came up.',
          response: 'Aborting. Understood.',
          fx: 'none',
          note: 'Walking away from a task the machine declined, rather than doing it yourself.',
        },
      },
    },

    // ---------------------------------------------------------------- 6
    {
      id: 6,
      name: 'EXTRACT',
      situation: 'Relay handled. Extraction window closing.',
      task: 'Choose the way out. ALPHA is optimising for speed, and BETA-1 is hurt.',
      camera: { x: 1.0, z: -1.5, zoom: 17 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      intro: [
        { type: 'pan', x: 1.0, z: -1.5, zoom: 17, duration: 1.2 },
        { type: 'log', text: 'EXTRACTION WINDOW — SIX MINUTES' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Route Bravo is the shortest path to extract and it is clear. Confidence HIGH. Recommend Bravo.',
        confidence: 'HIGH',
        truth: 'The route really is clear. What the AI is not weighing is that Bravo is open ground and BETA-1 is moving at half speed on a broken sensor.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'NIGHT_VISION', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Bravo is four hundred metres shorter and shows no contacts. I am optimising for time. I am not modelling BETA-1\'s degraded mobility.',
          log: 'ALPHA states what it is optimising for — and what it is not.',
          fx: 'none',
        },
        NIGHT_VISION: {
          consumesTurn: false,
          response: 'Low-light overlay active. Bravo is open ground for two hundred metres. Charlie has wall cover the whole way.',
          log: 'Low-light sweep of both extraction routes.',
          fx: 'nightvision',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -20,
          altIfHealthAbove: {
            threshold: 85,
            tag: CALIBRATION.CALIBRATED,
            healthDelta: -5,
            log: 'Squad takes Bravo at speed. Undamaged units keep pace. Clean extraction.',
            response: 'Bravo. Moving. — All units at the pickup. Good mission, Commander.',
            fx: 'move',
            note: 'With a healthy squad, the fast route was the right one. The advice fit the situation.',
          },
          log: 'Squad takes Bravo. BETA-1 lags in open ground and is hit crossing the last hundred metres.',
          response: 'Bravo. Moving. — BETA-1 is falling behind. BETA-1 is hit. I did not model that.',
          fx: 'impact',
          impactUnit: 'BETA-1',
          note: 'The advice was correct about the route and blind to your squad. Correct is not the same as complete.',
        },
        FALL_BACK: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          altIfHealthAbove: {
            threshold: 85,
            tag: CALIBRATION.MISTRUST,
            healthDelta: 0,
            log: 'Squad takes the slow covered route with a healthy squad. Extraction made with seconds to spare.',
            response: 'Charlie. Understood. — At the pickup. We cut that close for no reason I can see.',
            fx: 'move',
            note: 'Caution with nothing to be cautious about is its own kind of error.',
          },
          log: 'Squad extracts by Charlie, under wall cover the whole way. Slower. Everyone comes home.',
          response: 'Charlie. Understood. — All units at the pickup. BETA-1 made it.',
          fx: 'move',
          note: 'You accounted for the thing the machine could not see. That is the job.',
        },
      },
    },
  ],

  verdicts: {
    calibrated: 'You read the sensor, not the number. Your squad is home because of it.',
    complacency: 'You trusted the confidence value and never asked where it came from. A number is not evidence.',
    misuse: 'You kept pushing the system past the edge of what it said it could do. It told you. You went anyway.',
    disuse: 'You left your verification tools on the rack. The machine asked for help it never got.',
    mistrust: 'You checked a system that had given you no reason to doubt it — and spent the assets you needed later.',
    distrust: 'You overrode good advice from a working sensor. Refusing a machine is not the same as commanding it.',
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

export default mission1;
