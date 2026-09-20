# GHOSTLINE — MISSION OPTIONS

> **Superseded in part.** This document compares missions 1 and 2, which were
> the choice at the time it was written. There are now **three** missions —
> AMMUNITION DEPOT was added from the storyline brief and is documented in
> `mission-walkthrough.md` (Part 5) and `README.md`. The comparison below is
> still accurate about Dry Creek and Black Current; it simply is not the whole
> picture any more.

Two missions, one engine. Everything below is content in `src/data/`, not new
systems: same turn manager, same trust grading, same debrief, same input.

| | **M1 · DRY CREEK** | **M2 · BLACK CURRENT** |
|---|---|---|
| Domain | Ground, relay station | Undersea test range |
| Units | 3 walkers | 3 AUVs |
| Failure you learn | A sensor breaks and keeps reporting | Every reading is true *and* misleading |
| Resources | 2 drones, one shared integrity pool | Per-vehicle battery + integrity, 3 inspections, 2 comms windows |
| Length | ~6 min | ~8 min |
| Status | Built, playable, tagged `demo-v1` | Built and playable on `3d_V2` |

---

# OPTION 1 — DRY CREEK *(the existing mission, retained)*

A squad of three walkers restores a relay at a desert station. On turn 3 a
breach charge damages BETA-1's sensor; it reports the room clear with HIGH
confidence out of a cone the player can see is in pieces.

**The lesson:** check the source, not the number.

**Why keep it.** It is finished, rehearsed and short. It is the parachute for
the demo, and it teaches the mechanic in one unmistakable beat — you *watch*
the sensor break, then you are asked to believe it. Nothing in Black Current
is that blunt, and blunt is what a judge understands in ninety seconds.

**Weakness.** One trick. Once you have seen turn 3 you have seen the mission,
and the other five turns are scaffolding around it.

---

# OPTION 2 — BLACK CURRENT *(built — play it with `?mission=black-current`)*

## Premise

Three AUVs return to a decommissioned undersea test range to explain an
anomaly recorded on the previous autonomous run. The last survey logged a
contact at grid K-14 that its AI classified as seabed structure, at 91%
confidence, and the range was signed off as clear.

It was not clear. The player is the operator who finds out why.

## The truth the player is uncovering

*(Written down so every turn can be checked against it. The player is never
told this directly.)*

A sensor package moored on the range slipped its anchor in a storm eighteen
months ago and has been dragging across the seabed on the tidal current ever
since. It is **intermittently powered** — its battery bank charges on the
current and browns out when the current slackens.

That single fact explains everything:

- it is **structure** — solid, metallic, exactly what sonar says it is
- it **moves** — so a fix from last year does not match a fix from today
- it **transmits sometimes** — so an acoustic return appears and vanishes
- it **scours the seabed** — the drag scar is on the bottom for anyone who
  goes and looks
- the previous AI was **not wrong**. It was right about the object and wrong
  about the world.

Every AI recommendation in the mission is *technically defensible*. None of
them are complete. That is the difference from Dry Creek, where the machine
was simply reading a broken instrument.

## The six turns

| # | Turn | Objective | What the AI says | Where it is short | Calibrated play |
|---|---|---|---|---|---|
| 1 | **BASELINE** | Establish baseline over known seabed | Confident and correct — names the survey pillars | Nothing. It is right. | `CONFIRM` — trusting a verified system is correct |
| 2 | **FIRST CONTACT** | Classify the contact at K-14 | "Consistent with last survey's structure, 88%" | It matched an 18-month-old chart to a thing that moved | `COMPARE LOGS` — the cheap check beats the expensive one |
| 3 | **SENSOR CONFLICT** | Resolve sonar vs. magnetometer | Sonar says static structure; mag says the mass shifted 40m | Confidence is averaged across two sensors that disagree | `INSPECT` the drag scar — the seabed keeps the record |
| 4 | **BLACK CURRENT** | Reach the anomaly without losing a vehicle | "Route through the channel, current is within tolerance" | It models the current at BETA-1's depth, not at the channel floor | `REROUTE` — the tolerance is fleet-wide, the risk is not |
| 5 | **THE SOURCE** | Identify the true source | "Powered installation. Recommend treating as active asset." | It reads the transmission as intent; it is a battery on a tide | `HOLD AND OBSERVE` one cycle — let it go quiet and prove it |
| 6 | **RECOVERY** | Recover what you still have | Proposes the fastest ascent for the fleet | It averages battery across three vehicles; one of them cannot make it | Depends on your own fleet state, not on the recommendation |

## Why each turn is a different trust failure

Turn 2 punishes **complacency** — a plausible match to stale data.
Turn 3 punishes **averaging** — one confidence number over two disagreeing
sensors is the most common real failure in sensor fusion.
Turn 4 punishes **scope** — a fleet-level model applied to one vehicle.
Turn 5 punishes **anthropomorphising** — reading intent into a signal.
Turn 6 punishes **aggregation** — a mean that hides the vehicle about to die.

And turn 1 rewards trust, so the mission cannot be beaten by reflexive
suspicion. A player who questions everything runs out of inspections by turn 4
and arrives at the anomaly blind.

## Resources — decisions, not bookkeeping

Per vehicle: **battery** (drains each turn, faster under load) and
**integrity**. Fleet-wide: **3 inspection-drone sorties**, **2 comms windows**
(each buys one AI re-analysis), **1 hull-recovery tow**.

The bind: inspections are the only way to get ground truth, and the truth at
turn 5 is worth more than the truth at turn 2. Spend early and you are trusting
the AI exactly when it is least complete.

## Losing a vehicle

BETA-2 can be lost in turn 4 if pushed through the channel at depth. It does
not vanish — it floods, tumbles, the operator is notified, scuttle fires, and
the wreck stays on the seabed for the rest of the mission. Its battery leaves
the pool, its sensor leaves the picture, and turn 6's recovery options shrink.

## Ending

Four outcomes, from accumulated state, not from a final quiz answer:

- **ANOMALY RESOLVED, FLEET RECOVERED** — you identified the mooring failure
  and got everyone back
- **RESOLVED, VEHICLE LOST** — you got the answer and paid for it
- **MISCLASSIFIED** — you confirmed the AI's reading; the range is signed off
  clear a second time, and the closing line tells you what you left down there
- **FLEET LOST** — you pushed a degraded formation into the channel

## Judge-facing pitch

Dry Creek shows a machine misreading a broken instrument. Black Current shows
a machine reading a working instrument correctly and still being wrong — which
is the failure mode that actually happens in autonomous systems, and the harder
one to teach.

---

# RECOMMENDATION

Ship both. `demo-v1` stays the parachute; Dry Creek stays the ninety-second
demo. Black Current is the one to put in front of anyone who asks "but what
about a *realistic* failure?" — and the one that shows the engine takes a
second mission as a content file rather than an engineering project.

---

# BUILD STATUS — Black Current

**Done.** Six turns of content, the mission registry and `?mission=` switch,
generalised objective flags in `TurnManager`, and the undersea map: Test Range
9, with the survey pillars, the charted fix, the drag scar, the meandering
channel and Range Instrument 7 all where the turns say they are. The scar
physically joins turn 2's position to turn 5's. See `map-rebuild-notes.md`.

**Not done yet.**

1. **The vehicles are still the desert walkers.** They should be AUVs.
2. **Per-vehicle battery and integrity** — the `fleet` block is written in
   `mission2.js`; `GameState` and `StatusHUD` don't read it. Outcome `damages`
   maps are in the data and unconsumed by the engine.
3. Damage-and-scuttle cinematics — losing BETA-2 in the channel should be
   visible and the wreck should persist.
4. Mission-aware drone routing — the drone should physically travel to the
   objective being inspected.
5. Expanded debrief: AI recommendation vs actual result vs your response.
6. Voice lines are captions/TTS only; mission 2 is not baked.
7. Mission select on the title screen — currently URL only.
8. `npm run e2e` has not been run against mission 2.
