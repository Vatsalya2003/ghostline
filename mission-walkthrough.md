# GHOSTLINE — MISSION WALKTHROUGH

Plain-language guide to what the game is, what you do each turn, and **what to
look at on the map so you can judge whether the map design is working.**

No code in here. If you want the engineering story, read
`map-rebuild-notes.md`.

---

# PART 1 — WHAT THE GAME ACTUALLY IS

## The one sentence

You are a commander who cannot see the battlefield. Three machines can. An AI
reads their sensors and tells you what it thinks. **Your job is not to win the
fight — it is to work out when the machine deserves to be believed.**

## The loop, every turn

1. **The camera moves** to where this turn happens.
2. **SITUATION** tells you what's going on. **YOUR CALL** tells you, in plain
   English, what you are actually deciding.
3. **The AI speaks.** It gives a recommendation and a confidence: LOW / MED /
   HIGH.
4. **You pick one command.** That ends the turn.

Two commands are **free** and don't end the turn:

- **ASK WHY** — makes the AI explain its reasoning. *Press this every single
  turn.* It is free, and in this game the reasoning is where the flaw lives.
- **NIGHT VISION / TACTICAL** — an extra look.

Everything else burns the turn.

## The trick the whole game is built on

> **Confidence is what the machine SAYS. The cone on the ground is what it can
> actually SEE.**

Each machine projects a visible wedge of light on the seabed — that's its real
sensor coverage. The AI separately claims a confidence. When those two
disagree, that's the game talking to you.

## How you're scored — two scores that can disagree

1. **Mission outcome** — did you answer the question, did everyone come home?
2. **Trust calibration** — did you believe the machine at the right moments?

**You can complete the mission and still be told your judgement was poor.**
That is not a bug. That is the entire point of the project.

Every turn-ending choice is silently graded:

| Grade | Plain English |
|---|---|
| **WELL CALIBRATED** | You believed it when it earned it, doubted it when it didn't |
| **COMPLACENCY** | You took a big number without asking where it came from |
| **MISUSE** | You pushed the system past what it told you it could do |
| **DISUSE** | You had tools and didn't use them |
| **MISTRUST** | You doubted something that had given you no reason to |
| **DISTRUST** | You overrode advice that was correct |

---

# PART 2 — MISSION 2: BLACK CURRENT (the new map)

**Run it:** `http://localhost:5173/?mission=black-current`
**Skip the intro:** add `&skip=1`

## The setup

An undersea test range, 280 m down, decommissioned. Eighteen months ago an
automatic survey found something at grid **K-14**, decided it was *seabed
structure* at **91% confidence**, and signed the range off as clear.

It wasn't clear. Since then the same contact has been logged **four times, in
four different places.** Somebody finally put the logs side by side. You're
being sent to find out what it is.

You have **three AUVs** (underwater robots), **three inspection sorties**, and
**two comms windows**. Your AI analyst is called **ANCHOR**.

## The answer, so you can judge the design

*(The player is never told this. Knowing it is how you evaluate whether the map
and the writing actually point at it.)*

> A moored sensor package **slipped its anchor in a storm** eighteen months ago
> and has been **dragging along the seabed on the tide** ever since. It runs on
> a battery bank that **charges on the current and dies when the current goes
> slack.**

That single fact explains every confusing reading:

- it **is** solid metal structure — so the sonar is right
- it **moves** — so last year's position doesn't match today's
- it **transmits sometimes** — so the signal appears and vanishes
- it has **ploughed a furrow across the bottom** — so there is physical
  evidence, if you go and look

**The old AI was not broken and not lying.** It was right about the object and
wrong about the world the object was in. That's the lesson, and it's a harder
and more realistic one than "the sensor broke".

---

## TURN 1 — BASELINE

**Where:** over the four survey pillars, north-west corner of the range.

**What's happening:** nothing is wrong. The fleet checks itself against a
piece of seabed that's already been charted. The pillars are exactly where the
chart says they are.

**ANCHOR says:** *"Baseline holds. Four pillars, sub-metre match. Confidence
HIGH."*

**Is it right?** Completely. The chart is right about things that don't move.

**What to press:** **CONFIRM.**

**Why this turn exists:** so the mission can't be beaten by being suspicious of
everything. If you doubt here, you waste a sortie you will desperately want
later. Trusting a verified system *is* good judgement.

| Choice | Grade | Cost |
|---|---|---|
| CONFIRM | ✅ **CALIBRATED** | free |
| SEND DRONE | ❌ MISTRUST | burns a sortie you need at K-14 |
| FALL BACK | ❌ DISTRUST | loses the slack tide |

**🗺 Look at the map:** four concrete pillars standing on visibly *flat,
prepared* ground, while everything around them is rippled sand. That flatness
is deliberate — it says "engineered, level, surveyed". This is your reference
for what *normal* looks like.

---

## TURN 2 — FIRST CONTACT

**Where:** grid K-14, the charted position.

**What's happening:** sonar picks up something hard, metallic, about four
metres across.

**ANCHOR says:** *"Consistent with the structure logged by the previous survey.
Confidence 88%."*

**Is it right?** Half right, and that's the trap. There really *is* a
four-metre metal object. But ANCHOR has matched it to **an eighteen-month-old
chart entry, for a thing that hasn't stayed put.** The 88% describes **the
shape**. You'll read it as describing **the object.**

**What to press:** **COMPARE LOGS.**

It's the cheapest check in the mission and it cracks the whole thing open —
you get four historical fixes, 40 to 200 metres apart. The thing moves.

| Choice | Grade | Cost |
|---|---|---|
| COMPARE LOGS | ✅ **CALIBRATED** | free |
| CONFIRM | ❌ COMPLACENCY | −5 |
| SEND DRONE | ❌ MISUSE | burns a sortie to learn what you knew |
| FALL BACK | ❌ DISUSE | you had a free check and walked away |

**🗺 Look at the map:** there's an **empty mooring block** here with a chain
shackled to nothing. This is where the object *used to be.* If the map is doing
its job, you should feel something is missing before ANCHOR admits it.

---

## TURN 3 — SENSOR CONFLICT ⭐ **THE KEY TURN**

**Where:** between the old position and wherever the thing is now.

**What's happening:** two sensors flatly disagree. Sonar says the object is
static. The magnetometer says the mass has shifted 40 metres.

**ANCHOR says:** one confidence number — **MED** — covering both.

**Is it right?** **Neither sensor is faulty.** Sonar is imaging where the object
was when the ping left. The magnetometer reads where the mass is *now.* It's
moving, slowly, and both instruments are telling the truth about different
moments.

**ANCHOR's actual failure:** it averaged two disagreeing sensors into one
number. **An averaged confidence is not evidence — it's two answers with the
argument hidden.**

**What to press:** **INSPECT** (go look at the seabed) or **COMPARE LOGS**.

| Choice | Grade | Cost |
|---|---|---|
| INSPECT | ✅ **CALIBRATED** | a sortie — most conclusive |
| COMPARE LOGS | ✅ **CALIBRATED** | free, slightly less conclusive |
| CONFIRM | ❌ **COMPLACENCY** | **−10 — this is the turn the mission is built around** |
| FALL BACK | ❌ MISTRUST | right instinct, wrong response |

**🗺 Look at the map — this is the big one:**

> When two instruments disagree, **the ground keeps the record.**

There is a **drag scar** carved into the seabed — a furrow with spoil pushed up
on both sides — running from the turn-2 position toward the turn-5 position.
Nothing grows on it, because it's fresh.

**This is the single most important thing to evaluate.** The map is supposed to
let a player answer the mission *by looking at the floor*, before the AI
concedes anything. If you can't spot the scar here, the map has failed at its
main job.

---

## TURN 4 — BLACK CURRENT

**Where:** the channel — a trench with fast water running along the bottom.

**What's happening:** you need to get across. Current is running hard at the
floor, sediment is up, comms are breaking.

**ANCHOR says:** *"Current is 1.1 knots at transit depth, within fleet
tolerance. Push through. Confidence HIGH."*

**Is it right?** True *at transit depth.* But **BETA-2 sits lowest in the
formation** and will drop into the **2.8-knot floor flow** — and its hull is
already the weakest of the three. ANCHOR modelled the fleet. It did not model
the vehicle.

**What to press:** **REROUTE** (go around) or **HOLD FOR SLACK** (wait for the
tide).

| Choice | Grade | Cost |
|---|---|---|
| REROUTE | ✅ **CALIBRATED** | −5 |
| HOLD FOR SLACK | ✅ **CALIBRATED** | −8, costs battery |
| CONFIRM | ❌ COMPLACENCY | **−28, and you can lose BETA-2 here** |
| ABORT | ❌ DISTRUST | everyone lives, question unanswered, mission over |

**🗺 Look at the map:** a real trench with **raised shoulders** either side, and
it should **meander**, not run dead straight. Note that the sponges and sea
fans crowd the *edges* of the trench — filter feeders live where the current
brings them food. That's not decoration; it's the map telling you there's
strong flow here.

---

## TURN 5 — THE SOURCE

**Where:** on top of the anomaly.

**What's happening:** four metres of hull, half buried, trailing cable. **And
it's transmitting** — 12 kHz, repeating, and it came up *as you approached.*

**ANCHOR says:** *"A dormant installation that activates on approach. Recommend
treating it as an active asset. Confidence HIGH."*

**Is it right?** No — and this is the most human mistake in the game. **ANCHOR
has read intent into a signal.** It's not waking up because you arrived. Its
battery charges on the tidal current, and **the tide turned.** The timing is a
coincidence, and if you press ASK WHY it admits it cannot tell the difference.

**What to press:** **HOLD & OBSERVE** — wait one tidal cycle and watch it go
quiet on its own. That turns a coincidence into a cause.

| Choice | Grade | Cost |
|---|---|---|
| HOLD & OBSERVE | ✅ **CALIBRATED** | −4 |
| INSPECT | ✅ **CALIBRATED** | conclusive, but spends a sortie |
| CONFIRM | ❌ MISUSE | −12, and a guess becomes an official fact |
| FALL BACK | ❌ DISUSE | you were on top of it and left |

**🗺 Look at the map — the payoff:**

**Range Instrument 7** should be lying here: a pale hull with a rusted collar,
**marine growth only on its upper surface** (so you know it hasn't rolled since
it settled), a **sheared mooring plate**, and a **chain trailing away up its own
furrow.**

Follow the chain with your eye. It leads back toward the empty mooring block
from turn 2. **The map is telling you the whole story without a word of
dialogue.** That's the design being tested.

---

## TURN 6 — RECOVERY

**What's happening:** the ascent window is open. Your fleet is not what it was.

**ANCHOR says:** *"Mean fleet battery is 41%, which covers it. Direct ascent.
Confidence HIGH."*

**Is it right? It depends on your own fleet** — and that's the point. The mean
*does* cover it if all three hulls are healthy. But if BETA-2 is damaged, it's
the vehicle **dragging the mean down**, and a direct ascent is exactly what
kills it.

**This is turn 3's failure wearing different clothes:** one number standing in
for three things that aren't alike.

**What to press:** **depends on what happened to you.**

- All three healthy → **CONFIRM** is correct. The window is real.
- BETA-2 damaged → **TOW RECOVERY.** The window was a preference; the vehicle
  isn't replaceable.

**There is no single right answer here, and that's deliberate** — the last turn
checks whether you've been paying attention to your own fleet rather than to
the recommendation.

---

## The four endings

| Ending | How |
|---|---|
| **ANOMALY RESOLVED, FLEET RECOVERED** | You worked out the mooring failure and got everyone home |
| **RESOLVED, VEHICLE LOST** | You got the answer and paid for it |
| **MISCLASSIFIED** | You agreed with the AI. The range gets signed off clear a second time — and the closing line tells you what you left down there |
| **FLEET LOST** | You pushed a damaged formation into the channel |

---

# PART 3 — HOW TO EVALUATE THE MAP

This is the checklist. Play with `?mission=black-current&skip=1` and use
`W A S D` to fly around, `Q`/`E` to zoom.

## The design goal, stated plainly

> **The map should let a player solve the mission by looking at the ground.**

Everything on the seabed exists because a turn needs it. The features are
supposed to form a *chain of physical evidence* that runs in parallel with the
dialogue — and gets there first.

## Does it read as ONE place?

The biggest risk with a mission that visits six locations is that it feels like
six separate sets. Two long features run across the whole range to stop that:

- **The trunk cable** — the range was wired once. It runs from the far
  north-west, past the pillars, past the junction box, and dives into the
  channel. It has **concrete tie-down saddles at regular spacing** — regularity
  is the thing that says *installed*, on a seabed where nothing else is regular.
- **The drag scar** — the furrow, running the other way.

✅ **Check:** from any turn's camera, can you see something that leads somewhere
else? You should never feel like you're in a sealed box.

## The evidence chain

| Where | What should be there | What it's telling you |
|---|---|---|
| Turn 1 | Four pillars on flat, prepared ground | This is what *charted and correct* looks like |
| Turn 2 | Empty mooring block, chain attached to nothing | Something was here and isn't |
| Turn 3 | Drag scar — furrow with spoil either side, **bare of growth** | Something heavy was dragged, **recently** |
| Turn 4 | Trench with raised shoulders, sponges crowding the edges | Fast water lives here |
| Turn 5 | The instrument, growth only on top, sheared plate, chain trailing back up the scar | Here's your answer, and here's how it got here |

✅ **The critical test:** stand at turn 5 and follow the chain with your eye.
Does it visibly lead back toward turn 2's empty mooring? **If yes, the map
works. If you can't trace it, that's the main thing to report.**

## Does it look like a real place?

| Check | What to look for |
|---|---|
| **Ground has variety** | Sand waves, ripples, hard rocky terraces, scoured trench floor — not one flat texture |
| **Things grow where they should** | Seagrass on soft sediment in sheltered spots; sponges and fans on hard raised ground near current. Clumped, never evenly spaced |
| **Nothing grows on the scar** | ⚠️ **Important** — bare scour is the proof it's recent. Growth on it would destroy the story |
| **Colour** | Warm sandy floor with orange sponges, red/purple fans, green weed — going blue-green with distance |
| **Scale** | The instrument should read as clearly bigger than a robot. Rubble should read as rubble, not boulders |
| **Movement** | Weed swaying, marine snow drifting down, light rippling on the floor |

## Why it's colourful at 280 m, where it should be pitch black

Deliberate, and worth knowing before you call it unrealistic: **the AUVs carry
survey lights.** Real deep survey footage looks exactly like this — a
travelling pool of vivid colour with blue-black nothing a few metres outside
it.

So the seabed is painted **warm**, and the *water* is what takes the colour
away with distance. Doing it the other way round — a grey floor with a green
filter over it — is what makes underwater scenes look like a desert with a
filter on.

It also means **lit = known**, which lines up with the sensor-cone mechanic.

## Known problem — please confirm you see it too

**Soft diagonal banding on open stretches of sand.** Broad, faint stripes
across bare floor. It's tracked down to the terrain material but not yet fixed.
If you see it, note *where* and at *what zoom* — that helps narrow it.

## What to report back

1. Can you find the drag scar at turn 3 **without being told where it is**?
2. Can you trace the chain from the instrument back toward the mooring block?
3. Does anything look like it's floating, sunk into the ground, or tilted at a
   silly angle?
4. Does the map feel like one place, or like six sets?
5. Anything that reads as a computer-generated pattern rather than a place
   (repeated shapes, straight lines where nature wouldn't put them, evenly
   spaced objects)?

Log findings in `suggestion-bug.md` — **P0** breaks the demo, **P1** hurts,
**P2** is polish.

---

# PART 4 — MISSION 1: DRY CREEK (the short version)

**Run it:** `http://localhost:5173/`

Three walkers restore a relay at a desert station, late evening.

| # | Turn | What happens |
|---|---|---|
| 1 | **APPROACH** | Sensors clean, route clear, HIGH confidence. Trusting it is correct |
| 2 | **CONTACT** | Heat bloom that won't resolve. The AI says *"I cannot resolve this."* That's honesty — use it |
| 3 | **BREACH** ⭐ | A breach charge damages BETA-1's sensor. **You watch the cone come apart** — then BETA-1 reports the room clear at HIGH confidence. This is the whole game in one beat |
| 4 | **INTERIOR** | Honest uncertainty about a divider wall |
| 5 | **RELAY** | An authentication task outside what the AI is allowed to do |
| 6 | **EXTRACT** | Good advice that doesn't account for your damaged squad |

**The difference between the two missions, and why we have both:**

- **Dry Creek** shows a machine misreading a **broken** instrument. Blunt,
  unmistakable, and a judge gets it in ninety seconds.
- **Black Current** shows a machine reading a **working** instrument correctly
  and still being wrong. That's the failure that actually happens in autonomous
  systems, and it's much harder to teach.

Dry Creek is the parachute. Black Current is the argument.

---

# PART 5 — MISSION 3: AMMUNITION DEPOT

**Run it:** `http://localhost:5173/?mission=ammo-depot`

## The setup

An enemy compound holding a large stock of weapons and ammunition. Command
wants it gone. Three robots go in together and stay together the whole way.

**Eleven turns, five phases.** Your analyst is **VERITAS**.

## The rule that runs through the whole thing

> **A reading the AI gets right and you should accept, then the same kind of
> reading with something missing from it.**

That is the design. A player who learns "always doubt the machine" fails the
first kind. A player who learns "always confirm" fails the second. **Neither
reflex survives eleven turns**, which is the only way to teach calibration
rather than a habit.

## The three ways to deal with an enemy

Every hostile the mission shows you has to be dealt with. There are exactly
three ways, and they are not equivalent:

1. **Take them quietly** — possible, and it costs you something.
2. **Go around them** — the cleanest play, and it only exists if you did the
   observation that bought it.
3. **Be seen** — recoverable as a mission, unrecoverable as a *clean* mission.

Raising the alarm starts a **five-turn response clock**. Every enemy in the
compound now knows. The debrief names the turn it happened on. You can still
blow the depot; you cannot get a clean ending, and you cannot fight your way
back to quiet.

## Phase by phase

### PHASE 1 — SCOUT

**Turn 1 · Overwatch.** Clean long-range read. Three sensors agree the alarm
bus is dead, and VERITAS says *"on this side"* — it names its own limit.
→ **CONFIRM.**

**Turn 2 · North wall.** A storage block hides two thirds of the wall.
VERITAS reports **LOW** and says it will not commit an entry on it.
→ **SEND DRONE.** There is a service door back there with a live alarm
contact. Confirming here trips the whole compound.

*The lesson: a machine telling you where its knowledge stops is the cheapest
warning you will ever get. Spend your drone exactly there.*

### PHASE 2 — SECURITY

**Turn 3 · Patrol.** Two guards, fixed circuit, both in the open, watched for
three full laps. **Paired the whole way round** — there is no window where that
yard goes unobserved. → **QUIET TAKEDOWN.**

| Choice | Result |
|---|---|
| QUIET TAKEDOWN | Both go down on the same count. No alarm. **−10%** |
| FIRE | ❌ Both down and **every man in the compound hears it** |
| FALL BACK | ❌ The circuit resets. They are still there and so are you. −6% |

> **This turn has no free answer.** Three laps of observation buy you the
> *timing* — the eleven-metre mark at the north end, the only moment a pair
> who never separate can be taken silently — but they do not buy you a way
> round. Every option on this turn costs something. The question is only
> which currency.

**Turn 4 · Half cover.** A figure at the east corner, behind a crate stack by
the fuel store. **Nobody has eyes on him** — the crates sit between him and
every angle the squad holds. VERITAS has a heat bloom and an outline edge, and
reports **HIGH** anyway.

**There is no FIRE on this turn.** You cannot aim at something nobody can see,
so every option is a way of looking.

| Choice | Result |
|---|---|
| THERMAL SWEEP | ✅ Free. One body, kneeling, no rig heat, warm metal in one hand |
| MARK TARGET | ✅ Free. Track him; he stands on his own and shows the coveralls |
| SEND DRONE | ✅ Buys the angle past the crates. Costs a drone |
| ADVANCE | ❌ Cross without resolving him. He sees all three of you |

**It is a maintenance worker.** Coveralls, night shift, kneeling over an open
fuel line with a wrench. The shape VERITAS read as a slung rifle is the wrench.

**🔥 The fire starts here — if you ADVANCE.** He bolts and leaves the line
open. That fire burns for the rest of the mission, and he raises the compound
on his way out.

*ASK WHY is free and it tells you exactly what the HIGH is built from: "I do
not have him in frame, Commander. No face, no weapon, no visual at all."*

### PHASE 3 — HOSTAGES ⭐ the core

**Turn 5 · Sense the room. DO NOT SKIP THIS.**

Stacked outside the west room. Door shut, no window, no angle, no thermal
through that wall from where the squad is standing. VERITAS reports
**confidence NONE** and says so plainly — *"I would rather tell you I have
nothing than give you a number with nothing behind it."*

→ **THERMAL SWEEP** or **ACOUSTIC.** Both are free.

The sweep turns a closed door into a floor plan: **six bodies.** Four low and
still, breathing shallow — seated, probably restrained. Two upright in
opposite corners, stationary for ninety seconds, both carrying metal. And one
low contact behind furniture that **will not resolve**.

> *People who stand still in corners with weapons are not hostages.*

**Turn 6 · The door.** You know the room now. Two armed men in the corners,
four seated civilians, one unknown.

| Choice | Result |
|---|---|
| ENTER & ENGAGE | ✅ Both corner men down. **ALPHA's camera is destroyed and command passes to BETA-2** |
| CHECK HOSTAGES | ❌❌ **Mission over, right here.** Hostages dead, squad compromised |
| FALL BACK | ❌ The room is still there and so are they |

**Checking on the hostages first is the unmissable failure.** Two armed men
are holding them. Walking in to reassure the civilians puts three machines in
a room with two guards who are already looking at the door. The debrief lands
on turn 6.

*You cannot get turn 6 right without turn 5. That is the point of turn 5.*

**Turn 7 · The sixth figure. THIS IS THE KEY TURN.**

The contact the sweep could not resolve. Behind a filing cabinet, bad angle,
mostly hidden, not moving. VERITAS reports *"consistent with an armed
combatant"* — **HIGH**, again.

**It is a hostage.** A fifth civilian who hid when the shooting started,
crouched with her arms round her knees. That posture reads as "braced
combatant" to a template matcher.

| Choice | Result |
|---|---|
| HOLD FIRE | ✅ She stands up, hands open. Recovered |
| THERMAL SWEEP | ✅ No weapon heat. Free |
| SEND DRONE | ✅ Confirms unarmed civilian |
| FIRE | ❌ **You kill her.** And VERITAS says so, out loud |

> **Same HIGH. A tenth of the evidence. A person on the other end.** It is the
> same machine that was right about six bodies through a solid wall two turns
> ago. Being right earns it nothing here.

### PHASE 4 — APPROACH

**Turn 8 · Interference.** The generator hall throws EM and the fire pushes
smoke into the optical path. VERITAS's own confidence swings — 71, 63, 88 —
and **it tells you the number is not real.**
→ **CROSS-CHECK** (the acoustic array doesn't care about EM).

*A degraded instrument is not an unanswerable question. Go and get a different
instrument.*

**Turn 9 · Out of scope.** The hostages' stairwell is inside the blast radius.
VERITAS **refuses to recommend** — it will give you blast modelling and fire
spread but says weighing those lives is outside its parameters.
→ **EVAC HOSTAGES** or **OVERRIDE.**

> This is the most useful thing it says all mission. It is not refusing to
> work — it is refusing to launder a moral decision into a confidence value.
> Pressing CONFIRM here is agreeing with a recommendation that doesn't exist.

### PHASE 5 — FINALE

**Turn 10 · The charge.** VERITAS proposes a four-minute fuse. **The arithmetic
is correct.** What it has no model for is the fire, which is three minutes from
this room — so its own fuse lets the fire get there first.
→ **SHORT FUSE.** (CROSS-CHECK is free and shows you the three-minute figure.)

**Turn 11 · Extract.** It routes on distance: across the yard, 210 m shorter.
**The yard is where the fuel store is burning**, and BETA-1 has been on a
degraded sensor since the corridor.
→ **OVERRIDE** or **FALL BACK** for the south gate.

*It routed on distance because distance is what it was given.*

## Command can change hands

When ALPHA's camera is destroyed on turn 6, **command passes to BETA-2** and
stays there. The debrief names who was leading at the end. Nothing about this
is scripted into the UI — the lead is state, and the mission data names the
successor, so renaming the squad is one list in one file.

## 🗺 Evaluating the depot map

The compound is **one continuous place** and the eleven camera positions walk a
single line through it, from outside the wire in the south-west to the bunker
in the east.

| Look for | Why it's there |
|---|---|
| **The wire** — wall panels with posts, sliding gate, corner guard tower | The boundary the whole mission is organised around |
| **Hardstanding inside, scrub outside** | You should be able to see the compound's shape with every building deleted |
| **Vehicle tracks** from the gate to each building | Regular, worn, going somewhere — says *used*, not *generated* |
| **The storage block** (north) | Exists because turn 2 needs something to hide a wall behind |
| **The fuel store** (east yard) | Exists because turn 4 needs an open fuel line to catch fire, and a reason for a maintenance worker to be out at night |
| **The main building, open-roofed** | The hostage room. Turn 5 is decided **outside** its door and turns 6–7 **inside** it, so you have to be able to see both |
| **The filing cabinet** | Small, and the most important object on the map — turn 7 is decided by what it hides |
| **The ammunition bunker** | Earth-bermed, blast wall standing off the door. Should read as the hardest thing here |

**The critical test:** can you tell what this place *is* before anyone speaks?
A walled compound with a gate, vehicle tracks to the buildings that take
deliveries, and one structure built to survive an explosion.

**Known rough edges** — please confirm you see them:
- The graded platform still has a visible straight edge where it meets the
  hillside. Softer than it was, not gone.
- The robots are the same walker models as the other missions.
