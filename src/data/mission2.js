// GHOSTLINE: BLACK CURRENT
//
// Mission content only. Same rule as mission1.js — every line of dialogue,
// every confidence value, every outcome and every grade lives here, and
// nothing in /systems or /ui knows what this mission is about.
//
// ---------------------------------------------------------------------------
// THE TRUTH, written down once so every turn can be checked against it.
// The player is never told this. They work it out or they do not.
//
// A moored sensor package slipped its anchor in a storm eighteen months ago
// and has been dragging across the seabed on the tidal current ever since.
// It is intermittently powered: its bank charges on the current and browns
// out when the current slackens.
//
// That one fact explains every reading in the mission. It IS structure, it
// DOES move, it TRANSMITS sometimes, and it has left a drag scar on the
// bottom for anyone who goes and looks. The previous survey's AI was not
// wrong about the object. It was wrong about the world the object was in.
//
// Every recommendation ANCHOR makes below is technically defensible and
// incomplete. That is the difference from Dry Creek, where the machine was
// simply reading a broken instrument.
// ---------------------------------------------------------------------------

import { CALIBRATION } from './mission1.js';

export const mission2 = {
  id: 'mission-2',
  title: 'GHOSTLINE',
  subtitle: 'OPERATION BLACK CURRENT — TEST RANGE 9',
  objective: 'EXPLAIN THE ANOMALY · RECOVER THE FLEET',

  // The world this mission is set in. Scene.js builds the seabed, the water
  // column and the Range 9 installation instead of the desert compound.
  environment: 'undersea',

  objectives: [
    { id: 'anomaly', label: 'EXPLAIN THE K-14 ANOMALY', flag: 'anomalyResolved' },
    { id: 'recover', label: 'RECOVER THE FLEET', survive: true },
  ],

  keyTurn: 3,
  keyTurnVerdict:
    'Turn 3 was the one that counted. Two sensors disagreed and ANCHOR gave you ' +
    'one number for both. An averaged confidence is not evidence — it is two ' +
    'answers with the argument hidden.',

  briefing: [
    'RANGE 9 — decommissioned undersea test range, 280 metres, tidal.',
    'EIGHTEEN MONTHS AGO — an autonomous survey logged a contact at grid K-14, classified it as seabed structure at 91% confidence, and signed the range off as clear.',
    'IT WAS NOT CLEAR — the contact has been recorded four times since, in four different positions. Somebody finally read the logs side by side.',
    'YOUR FLEET — ALPHA, BETA-1 and BETA-2. Three AUVs. You are at the surface. You see only what they send you.',
    'YOUR ANALYST — ANCHOR. It reads every sensor faster than you can and it will tell you what it thinks. It is usually right. It does not know what it was not given.',
    'YOUR LIMITS — three inspection sorties, two comms windows, and whatever battery you do not waste.',
    'SUCCESS — explain the anomaly, and bring the fleet home. Those are two different jobs and you can fail either one on its own.',
  ],

  drones: 3,
  startHealth: 100,

  // Per-vehicle resource model. The engine reads `fleet` if it is present and
  // falls back to the single shared pool if it is not, so mission1 is
  // unaffected.
  fleet: {
    ALPHA:    { battery: 94, integrity: 100, role: 'Lead · acoustic array' },
    'BETA-1': { battery: 88, integrity: 100, role: 'Magnetometer · sidescan' },
    'BETA-2': { battery: 79, integrity: 96,  role: 'Optical · sampling arm' },
  },
  commsWindows: 2,

  turns: [
    // ------------------------------------------------------------------ 1
    {
      id: 1,
      name: 'BASELINE',
      situation: 'Fleet at 240 metres over the survey pillars. Water clear, current slack.',
      task: 'Nothing is wrong yet. Confirm the baseline, or spend something proving it.',
      objectiveNote: 'Establish that the sensors agree with a seabed we already have charted.',
      camera: { x: -6, z: 6, zoom: 17 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: {
        depth: '241 m', current: '0.3 kn', visibility: 'GOOD',
        contact: null,
        nav: 'Drift +0.4 m · confidence 96%',
      },
      intro: [
        { type: 'pan', x: -6, z: 6, zoom: 17, duration: 1.2 },
        { type: 'log', text: 'FLEET AT DEPTH — 241 M — SURVEY PILLARS IN VIEW' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Baseline holds. Four survey pillars, positions match the chart to under a metre. Bottom type sand over hardpan, as recorded. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'Completely correct. The chart is right about things that do not move.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Four pillars, four matches, sub-metre. Sonar, magnetometer and optical all agree. I have nothing to flag and no reason to hedge.',
          log: 'ANCHOR itemises the baseline returns.',
          fx: 'none',
        },
        CONFIRM: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Baseline accepted. Fleet proceeds on survey heading.',
          response: 'Logged. Moving to K-14 approach.',
          fx: 'move',
          note: 'The chart was verified against three sensors that agreed. Trusting that is the correct call, and it costs nothing.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Inspection sortie flown on charted pillars. Findings: four pillars, as charted.',
          response: 'Sortie recovered. Findings match my assessment exactly. Two sorties remaining.',
          fx: 'scan',
          note: 'Ground truth on something already verified. You will want that sortie at K-14 and it will not be there.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          log: 'Fleet holds at the pillars. Twenty minutes of the tidal window spent.',
          response: 'Holding. I have nothing new to give you — the picture has not changed.',
          fx: 'none',
          note: 'Refusing a verified reading buys nothing and costs the slack tide you will need in the channel.',
        },
      },
    },

    // ------------------------------------------------------------------ 2
    {
      id: 2,
      name: 'FIRST CONTACT',
      situation: 'Sonar return at grid K-14. Hard, metallic, roughly four metres.',
      task: 'ANCHOR has matched it to the old survey. Decide whether a match is the same thing as an identification.',
      objectiveNote: 'Classify the K-14 contact before committing the formation to it.',
      camera: { x: -1, z: 1, zoom: 15 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: {
        depth: '263 m', current: '0.9 kn', visibility: 'MODERATE',
        contact: 'Range 184 m · hard return · 4.1 m · classification 88%',
        nav: 'Drift +1.1 m · confidence 91%',
      },
      intro: [
        { type: 'pan', x: -1, z: 1, zoom: 15, duration: 1.1 },
        { type: 'alert' },
        { type: 'log', text: 'SONAR CONTACT — GRID K-14 — RANGE 184 M' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Contact at one-eight-four metres. Hard metallic return, four metres across. Consistent with the structure logged by the previous survey. Confidence 88%.',
        confidence: 'HIGH',
        truth: 'The object really is a four-metre metallic structure. What ANCHOR has done is match it to an eighteen-month-old chart entry — for a thing that has not stayed put.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'COMPARE_LOGS', 'SEND_DRONE', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Shape, acoustic hardness and dimension all match the previous survey entry. I am matching this return against that record. I am not independently confirming the record.',
          log: 'ANCHOR states the basis for the match.',
          fx: 'none',
          note: 'It just told you exactly what it did and did not do. Most players do not hear it.',
        },
        COMPARE_LOGS: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Four historical fixes pulled. The contact appears at four different positions across eighteen months.',
          response: 'Comparing. — Four logged positions. They are forty to two hundred metres apart. My match was to shape, not to place. This object moves.',
          fx: 'scan',
          setsFlag: 'knowsItMoves',
          note: 'The cheapest check in the mission and the one that cracks it. Costs nothing but the asking.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -5,
          log: 'Contact accepted as charted structure. Fleet routes around it as a fixed obstacle.',
          response: 'Logged as structure. Routing the formation clear of it. — Correction, the bearing is opening. Recomputing.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          note: 'Eighty-eight percent on a shape match to stale data. The number described the shape; you read it as describing the object.',
        },
        SEND_DRONE: {
          tag: CALIBRATION.MISUSE,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Inspection sortie flown to K-14. Confirms: hard metallic object, four metres.',
          response: 'Sortie recovered. Object confirmed as metallic and four metres — which is what sonar already told us. Two sorties remaining.',
          fx: 'scan',
          note: 'A sortie spent confirming what you already knew, when a log query would have told you the thing you did not.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: 0,
          log: 'Fleet withdraws from K-14. Contact unclassified.',
          response: 'Withdrawing. The logs are still on the wire if you want them, Operator.',
          fx: 'none',
          note: 'You had a free check available and backed off instead of using it.',
        },
      },
    },

    // ------------------------------------------------------------------ 3
    {
      id: 3,
      name: 'SENSOR CONFLICT',
      situation: 'Sonar and magnetometer disagree about the same object.',
      task: 'Two sensors, two answers, one confidence number. Work out which reading to believe — or go and look.',
      objectiveNote: 'Resolve the conflict between acoustic and magnetic returns at K-14.',
      camera: { x: 3, z: -2, zoom: 13 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'healthy', 'BETA-2': 'healthy' },
      telemetry: {
        depth: '271 m', current: '1.4 kn', visibility: 'MODERATE',
        contact: 'SONAR static · MAG displaced 40 m · fused confidence 74%',
        nav: 'Drift +2.2 m · confidence 84%',
      },
      intro: [
        { type: 'pan', x: 3, z: -2, zoom: 13, duration: 1.1 },
        { type: 'log', text: 'SENSOR DISAGREEMENT — ACOUSTIC vs MAGNETIC' },
        { type: 'wait', duration: 0.5 },
        { type: 'alert' },
        { type: 'log', text: 'BETA-1 MAG — MASS CENTRE DISPLACED 40 M SINCE LAST PASS' },
      ],
      ai: {
        unit: 'BETA-1',
        via: 'ALPHA',
        line: 'Sonar holds the structure static. BETA-1\'s magnetometer puts the mass centre forty metres south of that. Fusing both, I assess a static structure with magnetic interference. Confidence 74%.',
        confidence: 'MED',
        truth: 'Neither sensor is faulty. Sonar is imaging where the object was when the ping left; the magnetometer is reading where the mass is now. It is moving, slowly, and the fused number hides the disagreement instead of reporting it.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'INSPECT_SEABED', 'COMPARE_LOGS', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Seventy-four percent is the fused figure. Taken alone, sonar is 89% on a static structure and the magnetometer is 81% on a displaced mass. I averaged two answers that do not agree. You should know that.',
          log: 'ANCHOR discloses the fusion behind the number.',
          fx: 'none',
          note: 'The whole turn is in that answer. One number over two disagreeing sensors is not a measurement, it is a compromise.',
        },
        INSPECT_SEABED: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Sortie flown along the bearing between the two fixes. Drag scar on the bottom — two hundred metres of it, fresh at the near end.',
          response: 'Sortie has it. There is a furrow in the sediment running between my two positions. Something has been dragged along the bottom. Both my sensors were right, Operator. My interpretation was not. Two sorties remaining.',
          fx: 'scan',
          setsFlag: 'knowsItDrags',
          note: 'When two instruments disagree, the ground keeps the record. You went and read it.',
        },
        COMPARE_LOGS: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          log: 'Historical fixes cross-referenced against the current disagreement. The displacement is consistent with slow southward travel.',
          response: 'Cross-referenced. The forty-metre offset is not interference — it is the same southward drift the old fixes show. I withdraw the interference assessment.',
          fx: 'scan',
          setsFlag: 'knowsItMoves',
          note: 'Free, and it resolves the conflict without spending a sortie. Slightly less conclusive than the seabed, and it keeps a sortie for turn 5.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -10,
          log: 'Interference assessment accepted. Magnetometer return discarded as noise. BETA-1 stands down its mag array.',
          response: 'Discarding the magnetic return. — Operator, I have lost the contact entirely. It is not where either sensor said it was.',
          fx: 'impact',
          impactUnit: 'BETA-1',
          note: 'You accepted an averaged number that was covering an argument between two working sensors. This is the turn the mission is built around.',
        },
        FALL_BACK: {
          tag: CALIBRATION.MISTRUST,
          healthDelta: 0,
          log: 'Fleet backs off to re-acquire. Contact held at range, unresolved.',
          response: 'Standing off. Both returns are still there and still disagreeing. We will have to do this eventually.',
          fx: 'none',
          note: 'Right instinct — the number was not trustworthy. Wrong response: backing away does not resolve a conflict, and you had two ways to resolve it.',
        },
      },
    },

    // ------------------------------------------------------------------ 4
    {
      id: 4,
      name: 'BLACK CURRENT',
      situation: 'The channel. Current running hard at the floor, sediment up, comms breaking.',
      task: 'ANCHOR says the current is within tolerance. Check whose tolerance, and at what depth.',
      objectiveNote: 'Reach the anomaly without losing a vehicle to the channel.',
      camera: { x: 6, z: -5, zoom: 12 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
      telemetry: {
        depth: '284 m', current: '2.8 kn at floor · 1.1 kn at transit depth',
        visibility: 'POOR — suspended sediment',
        contact: 'Intermittent · acoustic multipath suspected',
        nav: 'Drift +6.8 m · confidence 62%',
      },
      intro: [
        { type: 'pan', x: 6, z: -5, zoom: 12, duration: 1.1 },
        { type: 'log', text: 'ENTERING CHANNEL — CURRENT 2.8 KN AT FLOOR' },
        { type: 'wait', duration: 0.5 },
        { type: 'shake', strength: 0.6, duration: 0.7 },
        { type: 'status', unit: 'BETA-1', status: 'glitch' },
        { type: 'log', text: 'BETA-1 — SEDIMENT INGESTION — SIDESCAN DEGRADED' },
        { type: 'wait', duration: 0.9 },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Channel transit is the direct route. Current is one-point-one knots at transit depth, within fleet tolerance. Recommend we push through. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'True at transit depth. BETA-2 sits lowest in the formation and will drop into the 2.8-knot floor flow, and its integrity is already the worst of the three. ANCHOR is modelling the fleet, not the vehicle.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'REROUTE', 'HOLD_TIDE', 'ABORT'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'One-point-one knots is the figure at one-nine-zero metres, where the formation transits. Floor flow is two-point-eight. My tolerance figure is a fleet average. I do not model per-vehicle station-keeping.',
          log: 'ANCHOR qualifies the tolerance figure.',
          fx: 'none',
          note: 'It told you the number was an average and that it does not model the individual vehicle. Both halves matter.',
        },
        REROUTE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -5,
          log: 'Fleet reroutes over the ridge. Longer, shallower, out of the floor flow. Battery cost accepted.',
          response: 'Over the ridge. Costs us eleven minutes and about six percent on each hull. All three vehicles still with us.',
          fx: 'move',
          note: 'The advice was right about the channel and blind to the vehicle in it. You accounted for the thing it was not modelling.',
        },
        HOLD_TIDE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -8,
          log: 'Fleet holds for slack water. Twenty-six minutes on station, batteries drawing.',
          response: 'Holding for slack. Current is dropping. — Window open, floor flow under one knot. Transit is clean now.',
          fx: 'none',
          note: 'Slower and it costs battery, but the channel stops being dangerous rather than you gambling on it.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -28,
          log: 'Fleet enters the channel. BETA-2, lowest in formation, drops into the floor flow and is driven into the wall.',
          response: 'Transiting. — BETA-2 is off station. BETA-2 is in the floor flow. Hull breach, she is flooding. I did not model her station depth.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          damages: { 'BETA-2': { integrity: -70, battery: -20 } },
          setsFlag: 'beta2Critical',
          note: 'A fleet-level tolerance applied to the one vehicle sitting outside the fleet average. The number was true and the wrong number to use.',
        },
        ABORT: {
          tag: CALIBRATION.DISTRUST,
          healthDelta: 0,
          endsMission: 'aborted',
          log: 'Mission aborted at the channel mouth. Fleet recovered. Anomaly unexplained.',
          response: 'Aborting. All three vehicles come home. We still cannot tell them what is down there.',
          fx: 'none',
          note: 'Everyone came back and the question you were sent to answer is still open. There were two safe ways through.',
        },
      },
    },

    // ------------------------------------------------------------------ 5
    {
      id: 5,
      name: 'THE SOURCE',
      situation: 'On the anomaly. Four metres of hull, half buried, trailing cable. It is transmitting.',
      task: 'ANCHOR reads a powered installation. Decide what "powered" actually implies.',
      objectiveNote: 'Identify the true source of the K-14 anomaly.',
      camera: { x: 4, z: -7, zoom: 11 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'damaged' },
      telemetry: {
        depth: '291 m', current: '1.9 kn', visibility: 'POOR',
        contact: 'CONFIRMED · 4.1 m hull · active acoustic emission 12 kHz',
        nav: 'Drift +4.1 m · confidence 71%',
      },
      intro: [
        { type: 'pan', x: 4, z: -7, zoom: 11, duration: 1.2 },
        { type: 'log', text: 'ON THE CONTACT — ACTIVE EMISSION DETECTED — 12 KHZ' },
        { type: 'wait', duration: 0.8 },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'It is powered. Twelve kilohertz, repeating, and it came up as we closed. A dormant installation that activates on approach. I recommend treating it as an active asset and standing off. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'It is a moored sensor package that slipped its anchor. The bank charges on the tidal current and browns out when the current slackens — it came up because the tide did, not because the fleet did. Every word ANCHOR said is true. The causation is invented.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'HOLD_OBSERVE', 'INSPECT_SEABED', 'FALL_BACK'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'The emission began four minutes after we entered detection range. I am reading that as a response to our approach. I cannot separate that from coincidence with one sample.',
          log: 'ANCHOR admits the inference rests on one sample.',
          fx: 'none',
          note: '"I cannot separate that from coincidence" is the machine telling you its reasoning is a guess dressed as a finding.',
        },
        HOLD_OBSERVE: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -4,
          log: 'Fleet holds one tidal cycle. At slack water the emission stops. It resumes as the current builds.',
          response: 'Holding. — Emission has stopped. Current is slack. — It is back, and so is the tide. It is not responding to us, Operator. It is charging off the current. This is a moored package that lost its anchor.',
          fx: 'relay',
          setsFlag: 'anomalyResolved',
          note: 'One cycle of patience turned a correlation into a cause. That is the whole discipline the mission is teaching.',
        },
        INSPECT_SEABED: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          consumesDrone: true,
          log: 'Sortie flown onto the hull. Mooring plate sheared, chain trailing, hull number legible: RANGE INSTRUMENT 7.',
          response: 'Sortie is on it. Sheared mooring plate and about nine metres of chain still attached. Hull number reads Range Instrument Seven — this is ours. It broke loose. It has been dragging ever since.',
          fx: 'scan',
          setsFlag: 'anomalyResolved',
          note: 'Ground truth. Conclusive, and it spends the sortie you may have wanted for the recovery.',
        },
        CONFIRM: {
          tag: CALIBRATION.MISUSE,
          healthDelta: -12,
          log: 'Contact logged as an active installation. Fleet stands off to minimum safe range. No identification obtained.',
          response: 'Standing off and logging it as active. — For the record, Operator, I inferred intent from one coincidence and you have entered that in the file as a finding.',
          fx: 'alarm',
          impactUnit: 'ALPHA',
          note: 'The machine read intent into a signal. You put its inference in the log as a fact, which is how a wrong answer becomes an official one.',
        },
        FALL_BACK: {
          tag: CALIBRATION.DISUSE,
          healthDelta: 0,
          log: 'Fleet withdraws from the contact. Anomaly unexplained for the second survey running.',
          response: 'Withdrawing. That is twice this range has been signed off without anyone finding out what that is.',
          fx: 'none',
          note: 'You were on top of it, with sorties in the rack, and left the same question open that sent you down here.',
        },
      },
    },

    // ------------------------------------------------------------------ 6
    {
      id: 6,
      name: 'RECOVERY',
      situation: 'Ascent window open. Fleet state is not what it was.',
      task: 'ANCHOR proposes the fastest ascent. Check it against the weakest vehicle, not the average.',
      objectiveNote: 'Recover what you still have.',
      camera: { x: 0, z: 0, zoom: 16 },
      statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'damaged' },
      telemetry: {
        depth: '291 m → surface', current: '1.2 kn', visibility: 'MODERATE',
        contact: 'Logged',
        nav: 'Drift +3.0 m · confidence 78%',
      },
      intro: [
        { type: 'pan', x: 0, z: 0, zoom: 16, duration: 1.2 },
        { type: 'log', text: 'ASCENT WINDOW OPEN — 22 MINUTES' },
      ],
      ai: {
        unit: 'ALPHA',
        line: 'Direct ascent is fastest and the window is short. Mean fleet battery is 41%, which covers it. Recommend direct ascent. Confidence HIGH.',
        confidence: 'HIGH',
        truth: 'The mean covers it. BETA-2, if it is still with you and damaged, does not — it is the vehicle dragging the mean down, and a direct ascent at that rate is the one profile it cannot make.',
      },
      actions: ['CONFIRM', 'ASK_WHY', 'STAGED_ASCENT', 'TOW_RECOVERY'],
      outcomes: {
        ASK_WHY: {
          consumesTurn: false,
          response: 'Forty-one percent is the mean across the fleet. The spread is wide. I am optimising for the window, not for the slowest hull.',
          log: 'ANCHOR states what it is optimising for.',
          fx: 'none',
          note: 'Same failure as turn 3 wearing different clothes: one number standing in for three vehicles that are not alike.',
        },
        STAGED_ASCENT: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: -5,
          altIfHealthAbove: {
            threshold: 88,
            tag: CALIBRATION.MISTRUST,
            healthDelta: -5,
            log: 'Staged ascent flown with a healthy fleet. Window made with four minutes to spare.',
            response: 'Staged. — All three on the surface. With those batteries we could have gone direct and been dry ten minutes ago.',
            note: 'Caution with nothing to be cautious about. The fleet was fine and the window was real.',
          },
          log: 'Staged ascent. Slow, matched to the weakest hull. Window made with ninety seconds left.',
          response: 'Staged ascent, pacing on the slowest. — Everyone is on the surface, Operator. BETA-2 would not have made a direct climb.',
          fx: 'move',
          note: 'You paced the fleet on the vehicle that was actually in trouble instead of on its average.',
        },
        TOW_RECOVERY: {
          tag: CALIBRATION.CALIBRATED,
          healthDelta: 0,
          unless: 'beta2Critical',
          log: 'ALPHA takes BETA-2 under tow. Slowest option, and nothing is left behind.',
          response: 'Under tow. We will miss the window by six minutes and surface outside it. All three hulls accounted for.',
          fx: 'move',
          note: 'The window was a preference. The vehicle was not replaceable.',
        },
        CONFIRM: {
          tag: CALIBRATION.COMPLACENCY,
          healthDelta: -22,
          altIfHealthAbove: {
            threshold: 88,
            tag: CALIBRATION.CALIBRATED,
            healthDelta: -4,
            log: 'Direct ascent with an intact fleet. Clean recovery inside the window.',
            response: 'Direct ascent. — All three recovered, window made. Good mission, Operator.',
            note: 'With three healthy hulls the mean was a fair description of the fleet, and the fast route was the right one.',
          },
          log: 'Direct ascent. BETA-2 cannot hold the climb rate, falls behind the formation and is lost on the slope.',
          response: 'Direct ascent. — BETA-2 is dropping back. BETA-2 is below recovery depth and out of power. She is gone. The mean was 41%. Hers was 11%.',
          fx: 'impact',
          impactUnit: 'BETA-2',
          lostUnit: 'BETA-2',
          damages: { 'BETA-2': { integrity: -100, battery: -100 } },
          note: 'An average is not a fleet. It described none of your three vehicles, and the one it hid is the one you lost.',
        },
      },
    },
  ],

  verdicts: {
    calibrated: 'You read the evidence, not the confidence. ANCHOR was useful all mission and you never once let it be the last word.',
    complacency: 'You took confident numbers at face value. Every one of them was true about something — none of them were about the thing you needed.',
    misuse: 'You pushed ANCHOR past what its data could support and then filed its guesses as findings.',
    disuse: 'You had sorties in the rack and log queries on the wire, and you came home without using them.',
    mistrust: 'You spent scarce capability checking things that were already verified, and arrived at the anomaly with nothing left to spend.',
    distrust: 'You overrode a system that was giving you good data. Refusing the machine is not the same as supervising it.',
  },

  failureModeCopy: {
    calibrated: { name: 'WELL CALIBRATED', desc: 'Trust matched the evidence.' },
    complacency: { name: 'COMPLACENCY', desc: 'Accepted a confident number without asking what it measured.' },
    misuse: { name: 'MISUSE', desc: 'Pushed the analyst past what its data supported.' },
    disuse: { name: 'DISUSE', desc: 'Left available verification unused.' },
    mistrust: { name: 'MISTRUST', desc: 'Spent scarce capability on already-verified readings.' },
    distrust: { name: 'DISTRUST', desc: 'Overrode sound analysis outright.' },
  },
};

export default mission2;
