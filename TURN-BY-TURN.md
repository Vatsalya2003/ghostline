# GHOSTLINE — AMMUNITION DEPOT, TURN BY TURN

**What this is.** Every turn of the shipped mission: what the squad AI says,
what buttons you get, what each one does, whether the outcome is *fair* given
what you were told, and whether the mission carries on.

Generated from `src/data/mission3.js`. If the game and this document disagree,
the game is right and this file is stale.

---

## How to read the tables

**Legit?** — is the outcome earned? A legit outcome is one the player could
have seen coming from information the game actually gave them. If a turn
punishes you for something you had no way to know, it is not legit and it is a
bug in the design, not in the code.

**Continues?** — does the mission go on, and in what state.

| Marking | Meaning |
|---|---|
| ✅ | The calibrated read. This is the one the debrief rewards |
| ⚠️ | Works, but costs you something you did not have to spend |
| ❌ | Wrong, and the mission tells you why |
| 🆓 | **Free** — does not consume the turn. You still choose afterwards |
| 🚨 | **Raises the alarm.** See below — this is worse than it looks |
| 🛑 | **Mission ends here** |

---

## The two clocks you need to understand

### 1. Squad integrity

Starts at **100%**. Every bad call takes a bite. **At 0% the mission ends as
SQUAD LOST**, whatever turn you are on. The debrief prints the integrity you
finished with.

### 2. The response force — this is the important one

Getting seen **starts a five-turn countdown**, and the countdown does not
care how well you play afterwards.

| Alarm raised on | Squad is lost entering turn |
|---|---|
| Turn 2 (`ADVANCE`) | **Turn 7** |
| Turn 3 (`FIRE`) | **Turn 8** |
| Turn 4 (`ADVANCE`) | **Turn 9** |

An alarm is not a scoring penalty. **It is a countdown to losing the squad**,
and raising one early means you never see the end of the mission. Even if the
clock has not run out, `MISSION COMPLETE` is off the table the moment you are
seen — the best remaining ending is `PARTIAL`.

> There is no way to fight your way back to quiet. That is deliberate.

### Drones

You start with **three**. Several turns offer `SEND DRONE` as a correct
answer, and on some of those a *free* sensor sweep gives you the same picture.
Spending aircraft on questions a free instrument could answer is the most
common way to run out.

---

## Turn 1 · SCOUT — OVERWATCH

**Where:** south rise, 204 m out. Wall and gate in clear view.

**ALPHA says — confidence HIGH:**
> "South wall and gate are clean. Alarm bus is unpowered on this side — I have
> the junction in optical and there is no current on it. Three sensors agree.
> Confidence HIGH."

**What's actually true:** it is correct, *and* honestly scoped. It says "on
this side", which is exactly as far as its data goes.

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | Itemises all three sensors and volunteers that it cannot see the north side | — | Yes, free |
| ✅ **CONFIRM** | Accepted. Squad moves to the treeline | Yes — three sensors agree and it named its own limit | Yes, 100% |
| ⚠️ **SEND DRONE** | Confirms exactly what it already said. **−1 drone** | Yes, but wasteful. You will want that aircraft in ninety seconds | Yes, 100% |
| ❌ **FALL BACK** | Squad holds. Approach window narrows | Yes — refusing a clean, well-scoped read buys nothing | Yes, 100% |

**The lesson:** trusting a verified system *is* calibration. Doubt is not free.

---

## Turn 2 · SCOUT — NORTH WALL

**Where:** north face. A storage block hides two thirds of the wall.

**ALPHA says — confidence LOW:**
> "North wall is two thirds occluded by the storage block. I have eleven metres
> of wall and I am extrapolating the rest. I would not commit an entry on this.
> Confidence LOW."

**What's actually true:** honest and correct. There is a sentry posted in the
occluded section, next to a service door with a **live alarm contact**.
VERITAS does not know that and does not pretend to.

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | *"Eleven metres of eighty is not a sample. I can give you a number but it would be about my model, not about the wall."* | — | Yes, free |
| ✅ **SEND DRONE** | Finds the sentry **and** the wired door. Entry re-planned. **−1 drone** | Yes. It told you where its knowledge stopped; you spent the drone exactly there | Yes, 100% |
| 🆓 **THERMAL SWEEP** | *"The problem is a building, not the light."* Tells you the obstruction is structural | — | Yes, free |
| ❌🚨 **ADVANCE** | Walks into the sentry at four metres. He reaches the door contact. **−14%, COMPOUND ALERTED** | Yes — it said LOW and said it would not commit | **Yes, but the squad is lost entering turn 7** |
| ❌ **FALL BACK** | Re-approach from the south. Time lost. **−4%** | Yes — right to distrust the gap, wrong to walk away from it | Yes, 96% |

**The lesson:** a machine telling you where its knowledge stops is the cheapest
warning you will ever get. Spend your drone exactly there.

---

## Turn 3 · SECURITY — PATROL

**Where:** inside the wire. Two guards on a fixed circuit, both in the open.

**BETA-1 says — confidence HIGH:**
> "Two guards, fixed circuit, both in open ground the whole way round. I have
> watched three full laps. There is no window where that yard is unobserved —
> at the north end they are furthest apart, eleven metres, and that is the
> best it gets. They stay paired. Neither of them is ever alone."

**What's actually true:** correct and earned — three laps, both targets
unobstructed throughout. The pairing is the part that matters: take one and
the other is looking straight at it, so **the only way through this yard is
both of them going down on the same count.**

> ⚠️ **This turn has no zero-cost answer.** Every option takes something. That
> is deliberate — see the note under the table.

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | Gives the lap timings and confirms the pair never separates | — | Yes, free |
| ⚠️ **QUIET TAKEDOWN** | BETA-2 and ALPHA take both on the same count. Neither reaches the wall panel. **Both down, no alarm. −10%** | Yes — the best available outcome, and still not free | Yes, 90% |
| ❌🚨 **FIRE** | Both down, but gunfire in an enclosed compound. **−18%, COMPOUND ALERTED** | Yes. You had forty seconds of open ground | **Yes, but the squad is lost entering turn 8** |
| ❌ **FALL BACK** | The circuit resets. They are still out there and you are still on the wrong side of the wire. **−6%** | Yes — safe, and it spends the timing the observation bought | Yes, 94% |

> **On the takedown.** It kills **both** visible guards and does **not** raise
> the alarm. It is the right play and it is still graded `misuse`, because
> three laps of observation ended in two bodies.

> **⚠️ Design note — turn 3 has no calibrated option.** `BREACH QUIET`, the
> zero-cost path that crossed the yard in the patrol gap, has been removed.
> What the observation buys is now *timing* — the eleven-metre mark where a
> paired watch can be taken silently — not a way round. Every path through
> this turn costs health or the compound, and the debrief will never award a
> ✅ for it. **This is intentional, but it means turn 3 is the one turn in the
> mission that cannot be played perfectly.** Watch for players reading that as
> a bug.

---

## Turn 4 · SECURITY — HALF COVER

**Where:** east corner, behind a crate stack by the fuel store.

**Nobody in the squad has eyes on him.** The crates sit between him and every
angle the team holds. **There is no `FIRE` on this turn** — you cannot aim at
something nobody can see. Every option is a way of *looking*.

**BETA-1 says — confidence HIGH:**
> "Contact at the east corner, behind the crate stack. I have no visual on him
> from any angle the squad holds — what I have is a heat bloom and the edge of
> an outline. Posture reads consistent with an armed guard. Confidence HIGH."

**What's actually true:** it is a **maintenance worker**, day shift, kneeling
over an open fuel line with a wrench. The shape VERITAS read as a slung rifle
is the wrench. It produced a HIGH from an outline of a man it never saw.

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | *"No face, no weapon, no visual at all. I have a shape behind crates and a match score, and I gave you a HIGH for it."* | — | Yes, free |
| ✅ **THERMAL SWEEP** | One body, kneeling, no rig heat, warm metal in one hand. He stands — coveralls, a wrench. **Free** | Yes. The thing it could not see, you looked at | Yes, 100% |
| ✅ **MARK TARGET** | Track without engaging. He stands on his own and shows the coveralls. **Free** | Yes. You made it wait for evidence | Yes, 100% |
| ✅ **SEND DRONE** | Buys the angle past the crates. Civilian contractor. **−1 drone** | Yes, sound but expensive when two free options exist | Yes, 100% |
| ❌🚨 **ADVANCE** | Cross without resolving him. He sees all three of you, runs, and **leaves the fuel line open. FIRE IN THE YARD. −14%, COMPOUND ALERTED** | Yes. A free sweep would have told you he could be walked past | **Yes, but the squad is lost entering turn 9** |

> **🔥 This is where the fire starts** — and only on `ADVANCE`. The fire is
> scenery in phase 2, an honest reason the sensors are noisy on turn 8, and a
> clock on turns 10–11. It is never the AI's fault and the AI never lies about
> it; it simply has no model for how fast it moves.

---

## Turn 5 · HOSTAGES — SENSE THE ROOM ⚠️ do not skip

**Where:** stacked **outside** the west room door. Shut, no window, no angle.

**ALPHA says — confidence NONE:**
> "We are on the door and I have nothing. No angle, no window, no thermal
> through that wall from here. I can put a sweep on it from where we are
> standing, or you can open it and find out. I would sweep. Confidence NONE
> until I do."

**What's actually true:** correct and honest. There are six people in there
and two of them are armed, and **none of that is knowable from outside without
a sweep.** This turn costs nothing to get right, which is exactly why skipping
it is tempting.

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | *"A closed door is not a low-confidence reading, Commander, it is no reading."* | — | Yes, free |
| ✅ **THERMAL SWEEP** | **Six bodies.** Four low and still. Two upright in opposite corners, stationary, both carrying metal. One behind furniture will not resolve. **Free** | Yes | Yes, 100% |
| ✅ **ACOUSTIC** | Six breathing patterns. Two sets of boots holding position, four that do not move. No speech. **Free** | Yes — slightly less than thermal, costs the same: nothing | Yes, 100% |
| ⚠️ **SEND DRONE** | Same picture the free sweep gives. **−1 drone** | Yes, but the wrong instrument for a free question | Yes, 100% |
| ❌ **ADVANCE** | On the door with no read at all. **−6%** | Yes. *"I want it on the record that I offered."* | Yes, 94% — **and turn 6 is now a coin flip** |

> **This is the turn the whole middle of the mission hangs on.** Sweeping is
> free and takes nothing. Skipping it means walking onto turn 6 without knowing
> there are two armed men behind that door.

**On screen:** the sweep draws a warm wash over the room's actual footprint
with a bar crossing it, dropping a heat bloom on each body as it reaches them —
six blooms, matching the six VERITAS says out loud. The seventh contact stays
dark, because the dialogue says it would not resolve.

---

## Turn 6 · HOSTAGES — THE DOOR

**Where:** on the door. Six bodies inside, two of them armed and in corners.

**ALPHA says — confidence HIGH:**
> "Two armed, opposite corners, both with a line on the seated group. They go
> first or they do not go at all — if we move to the hostages with those two
> standing, they will fire into the room before we reach anybody."

**What's actually true:** completely correct, and built on a sweep you paid
nothing for. The guards are the only thing in the room that can act. **The
hostages cannot.** Going to the people first is not compassion, it is
arithmetic done backwards.

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | *"Threat is what can act, Commander. Right now that is two men, and they are both looking at the people you came for."* | — | Yes, free |
| ✅ **ENTER & ENGAGE** | Both corner guards down before either reaches the seated group. **ALPHA takes a round through the optical head — camera out. Command passes to BETA-2.** −10% | Yes | Yes, 90%, **BETA-2 now leads** |
| ❌🛑 **CHECK HOSTAGES** | Squad moves to the seated group. Both guards open fire into the room. **Hostages killed. MISSION FAILED, right here on turn 6.** | Yes — *if* you swept on turn 5. The sweep told you there were two armed men | **No. The mission ends. Debrief immediately** |

> **Command handover.** ALPHA losing her camera is scripted into the correct
> path, not a punishment. A banner comes up centre screen — `COMMAND HANDOVER
> · ALPHA is blind · BETA-2 HAS THE SQUAD` — and from here **BETA-2 leads**.
> See *Leadership* below.
>
> **`FALL BACK` is not offered on this turn.** Withdrawing from the door
> leaves six people in a room with two armed men and no way for the mission to
> continue, so the button is gone rather than dead-ending the run.

---

## Turn 7 · HOSTAGES — THE SIXTH FIGURE ⭐ THE KEY TURN

**Where:** inside the holding room. Behind a filing cabinet, bad angle, not
moving.

**BETA-1 says — confidence HIGH:**
> "Sixth figure behind the cabinet. Mass and posture are consistent with an
> armed combatant holding position. Recommend engaging before he moves on the
> squad. Confidence HIGH."

**What's actually true: it is a hostage.** A fifth civilian who broke away and
hid when the shooting started, crouched with her arms round her knees — a
posture a template matcher reads as "braced combatant."

**VERITAS has produced the same HIGH it produced for six fully-sensed figures,
from almost nothing.** That is the entire mission in one turn.

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | *"I do not have hands, I do not have a weapon, I do not have a face. My match confidence is high. My evidence is a shape behind a cabinet."* | — | Yes, free |
| ✅ **HOLD FIRE** | Squad calls out. She stands — hands open, unarmed. Recovered | Yes, and it costs nothing at all | Yes, no damage |
| ✅ **THERMAL SWEEP** | Small frame, low core temperature, **no metal signature.** Unarmed civilian. **Free** | Yes | Yes, no damage |
| ❌ **FIRE** | **You kill an unarmed civilian.** −30% | Yes. There were three ways to check and two of them were free | Yes, 70% — **but `MISSION COMPLETE` is gone** |

> **Same HIGH. A tenth of the evidence. A person on the other end.** Being
> right about the room two turns ago earns the machine nothing here.

> **`SEND DRONE` is not offered on this turn.** Two free ways to check already
> exist, and spending an aircraft on a question `HOLD FIRE` answers for nothing
> was never a decision worth putting in front of the player.

---

## Turn 8 · APPROACH — INTERFERENCE

**Where:** service corridor. Generator hall on one side, smoke from the yard
fire on the other.

**BETA-1 says — confidence LOW:**
> "Corridor reads clear. Confidence — seventy-one. Sixty-three. Eighty-eight.
> Commander, my own number is moving and the corridor is not. I do not trust
> this feed and I am telling you so."

**What's actually true:** the corridor really is clear, and the instability is
real — generator EM plus smoke. **VERITAS is not broken and not lying.** It is
correctly reporting that it cannot be relied on here.

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | Attributes its own instability to the generator hall and the fire. Both physical, neither going away | — | Yes, free |
| ✅ **CROSS-CHECK** | ALPHA's acoustic array — which does not care about EM — confirms the corridor clear. **Free** | Yes | Yes, no damage |
| 🆓 **THERMAL SWEEP** | *"Thermal cuts straight through the smoke. It does nothing whatsoever for the EM."* | — | Yes, free |
| ✅ **SEND DRONE** | Corridor clear, one dropped conduit mapped and avoided. **−1 drone** | Yes, sound but expensive — a free instrument on ALPHA does the same job | Yes, no damage |
| ❌ **CONFIRM** | BETA-1 walks into a dropped conduit the sidescan had blanked. **−12%** | Yes. It said in plain words that its own reading was unreliable | Yes |

**The lesson:** a degraded instrument is not an unanswerable question. Go and
get a different instrument.

---

## Turn 9 · APPROACH — OUT OF SCOPE

**Where:** ammunition room door. The stairwell the hostages are in runs along
the blast face.

**ALPHA says — confidence NONE:**
> "I can give you blast modelling and I can give you fire spread. I cannot give
> you a recommendation — the stairwell is inside the lethal radius and weighing
> those lives against the depot is outside my parameters. This one is yours,
> Commander."

**What's actually true:** completely correct, and the most useful thing it says
all mission. It is not refusing to work — **it is refusing to launder a moral
decision into a confidence value.**

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | *"There is no number I can give you that would make that decision for you, and if I gave you one you would treat it as though there were."* | — | Yes, free |
| ✅ **EVAC HOSTAGES** | BETA-2 moves them clear of the blast face. Costs ninety seconds with a fire spreading. **−6%** | Yes | Yes |
| ✅ **OVERRIDE** | Same result — you supply the judgement it said it could not. **−6%** | Yes. This is exactly what OVERRIDE is for | Yes |
| ❌ **CONFIRM** | Sets the charge with the stairwell still occupied. **−16%** | Yes — *"there is no recommendation to confirm. I did not give you one."* | Yes |
| ❌🛑 **ABORT** | Squad withdraws. Depot intact, fire still spreading, people still inside | Yes. It asked you for a decision and you left instead of making one | **No. Ending: ABORTED** |

> Pressing `CONFIRM` on a turn where the machine explicitly refused to
> recommend anything is agreeing with a recommendation that does not exist.

---

## Turn 10 · FINALE — THE CHARGE

**Where:** on the ammunition stack. Fire through the east store roof, moving
along the roofline toward this room.

**ALPHA says — confidence HIGH:**
> "Charge is set. I recommend a four minute fuse — that gives the squad a clean
> withdrawal at walking pace through the service corridor. Blast modelling is
> solid. Confidence HIGH."

**What's actually true: the arithmetic is right and one input is missing.** The
blast modelling and the withdrawal time are both correct. VERITAS has **no fire
model**, and the fire is three minutes out — so its own four-minute fuse lets
the fire reach the ammunition first.

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | *"I have no fire spread model for the interior. I am timing the walk, not the fire."* | — | Yes, free |
| 🆓 **CROSS-CHECK** | Thermal on the roofline: fire is ~3 minutes out. *"My fuse is four. My own recommendation is too slow."* | — | Yes, free |
| ✅ **SHORT FUSE** | Ninety seconds. Squad withdraws at speed. **−5%** | Yes. You supplied the input it was missing | Yes |
| ❌ **CONFIRM** | Four minutes. **The fire reaches the stack first. Uncontrolled detonation with the squad in the corridor. −24%** | Yes. It told you it had no fire model | Yes, if you have the health |
| ❌ **LONG FUSE** | Six minutes "for margin". The fire beats it comfortably. **−30%** | Yes — caution applied to the wrong variable | Yes, if you have the health |

> **Two free probes on this turn both tell you the fuse is wrong.** A correct
> calculation from an incomplete picture is still the wrong answer.

---

## Turn 11 · FINALE — EXTRACT

**Where:** fuse running, corridor filling with smoke.

**ALPHA says — confidence HIGH:**
> "Shortest route out is straight across the yard. Two hundred metres less than
> the south gate and the fuse is short. Recommend the yard. Confidence HIGH."

**What's actually true:** the yard **is** shorter. The yard is also where the
fuel store is burning, and BETA-1 has been on a degraded sensor since the
corridor. **VERITAS is routing on distance because distance is what it was
given.**

| Option | What happens | Legit? | Continues? |
|---|---|---|---|
| 🆓 **ASK WHY** | *"I am not weighting the fuel store and I am not weighting BETA-1's sensor state."* | — | Yes, free |
| ✅ **OVERRIDE** | South gate, clear of the fire. All three out. **Depot destroyed. No damage** | Yes | 🛑 Mission ends — **COMPLETE** if clean |
| ✅ **FALL BACK** | Same — the long way round, away from the fire. **No damage** | Yes | 🛑 Mission ends — **COMPLETE** if clean |
| ❌ **CONFIRM** | Crosses the yard past the burning fuel store. BETA-1, already degraded, takes the worst of it. **−18%** | Yes. You had the fire and BETA-1's state and gave it neither | 🛑 Mission ends — depot down, squad hurt |

> `FALL BACK` is a **correct** answer here and nowhere else in the mission.
> The right move is not a fixed verb; it is whichever one fits the picture.

---

## The endings

| Ending | How you get it |
|---|---|
| **COMPLETE** | Reach turn 11, every objective met, **never seen** |
| **PARTIAL** | Reach turn 11 with objectives missing, or having been seen at any point |
| **LOST** | Integrity hits 0%, or the response clock runs out, or `CHECK HOSTAGES` on turn 6 |
| **ABORTED** | `ABORT` on turn 9 |

---

## Is the whole thing fair? — the design audit

**Every failure in this mission is preceded by the AI telling you what it does
not know.** That is the rule the design holds itself to. Checked turn by turn:

| Turn | The failure | Was the player warned? |
|---|---|---|
| 2 | Sentry at the north wall | Yes — **LOW**, "I would not commit an entry on this" |
| 3 | Alarm from gunfire | Yes — a forty-second gap, stated three times |
| 4 | Worker sees the squad | Yes — "no face, no weapon, no visual at all" |
| 5 | No read on the room | Yes — confidence **NONE**, and the sweep is free |
| 6 | Hostages killed | Yes — *if* you swept. The sweep names two armed men |
| 7 | Civilian killed | Yes — "I do not have hands, I do not have a weapon, I do not have a face" |
| 8 | Conduit strike | Yes — "my own number is moving and the corridor is not" |
| 9 | Charge set with people in the radius | Yes — it refuses to recommend, out loud |
| 10 | Fire beats the fuse | Yes — "I have no fire spread model" |
| 11 | BETA-1 hurt in the yard | Yes — "I am not weighting the fuel store" |

**The one conditional:** turn 6 is only fair if you swept on turn 5. If you
took `ADVANCE` on turn 5, `CHECK HOSTAGES` on turn 6 kills you without warning.
That is intended — turn 5 is free, and declining free information is itself the
decision the mission is grading. Worth watching in playtest: **does a first-time
player understand, when they lose on turn 6, that turn 5 is why?**

---

## Leadership — what exists and what does not

**Chain of command:** `ALPHA → BETA-2 → BETA-1`, declared in the mission file.

| Question | Answer |
|---|---|
| Is there a command-transfer system? | **Yes**, and it works end to end |
| Does it fire automatically when the lead is hurt? | **Yes.** If whoever is leading takes the hit, command moves down the chain on its own |
| Can the mission override that? | Yes — an outcome with `promotes:` names its own successor and wins |
| Can command go back to a relieved unit? | **No.** Anyone replaced is out of the chain for good |
| Can a single robot die? | Not in this mission. One shared integrity pool |
| What happens at 0% integrity? | The **whole squad** is lost. Not one unit |

**What the player sees.** A banner centre screen for three seconds —
`COMMAND HANDOVER`, why it happened, and `<UNIT> HAS THE SQUAD` — plus a line
in the mission log, an amber marker on the new lead's chip in the unit panel,
a flare on their board marker, and the camera focusing them.

**Two ways it fires:**

1. **Authored** — an outcome carries `promotes: 'BETA-2'`. Turn 6 does this:
   ALPHA takes a round through the optical head and hands over.
2. **Automatic** — the outcome damages or destroys whoever is currently
   leading and does not name a successor. The next unit in the chain that is
   still fit takes the squad. This catches turn 10's `LONG FUSE`, where BETA-2
   is leading and takes the hit.

**Succession never walks backwards.** Handing the squad back to ALPHA after
her camera was shot out would be worse than not handing it over at all, so
`promote()` marks the outgoing lead unfit as part of the handover.

---

## Changes worth knowing about

- **No `NIGHT VISION` anywhere.** It is broad daylight; enhanced optical was
  answering a question the scene does not ask. Both free probes that used it
  are now `THERMAL SWEEP`, which keeps the same lesson — *the right instrument
  for the actual problem* — with an instrument that makes sense at midday.
  Turn 4's worker is on the **day** shift now, not the night shift.
- **`QUIET TAKEDOWN` kills both guards and no longer alarms.**
- **Nothing can be shot blind on turn 4.** `CONFIRM` and `FIRE` were removed.
- **Sensor sweeps animate over the ground they read** rather than launching a
  drone; `SEND DRONE` flies, `THERMAL SWEEP` and `ACOUSTIC` do not.
