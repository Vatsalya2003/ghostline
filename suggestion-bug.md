# OVERRIDE PROTOCOL — BUGS & SUGGESTIONS

Write it down the moment you see it. Don't fix it in your head and move on —
by turn 5 you will have forgotten.

**One line in the log table is enough.** Only fill in a detail block if the
thing is hard to reproduce or needs discussion.

---

## SEVERITY — be honest, jam rules

| Tag | Means | Fix when |
|---|---|---|
| **P0** | The judge demo breaks. Turn 3 doesn't land, game won't load, hard crash. | Now. Stop what you're doing. |
| **P1** | Playable but hurts. Confusing UI, wrong grade, audio blasting, beat lands flat. | Before feature freeze. |
| **P2** | Polish. Looks slightly off, small copy fix, nice-to-have. | Only if time is left. |
| **IDEA** | Not a bug. A change worth arguing about. | Mission 2 / after the jam. |

**Feature freeze: Saturday midnight.** After that, P0 and P1 only.

---

## QUICK LOG

Newest at the top. Status: `OPEN` · `FIXING` · `DONE` · `WONTFIX`.

| # | Sev | What happened / what to change | Where | Found by | Status |
|---|---|---|---|---|---|
| 1 | P1 | _TTS voice untested — does it fire, sound robotic, stay in sync with the caption?_ | Comms panel | handoff | OPEN |
| 2 | P1 | _Gamepad button indices unverified on macOS — PS4 pad, `PAD_MAP` in `src/systems/Input.js`_ | Input | handoff | OPEN |
| 3 | P1 | _Two-metre test on turn 3: is the broken cone unmissable from across the room?_ | Sensor cones | handoff | OPEN |
| 4 | P1 | _Does a fresh player hesitate before choosing on turn 3? If not, the game isn't working._ | Turn 3 | handoff | OPEN |
| 5 | P1 | **Can't tell which cone belongs to which robot.** All three units are the same cyan, so on screen you cannot tell whose view is whose — which matters because the whole game is reading one specific unit's cone. Give each robot its own identity. | Units / cones | Vatsalya | OPEN |
| 6 | P1 | **Debrief praised a run that failed turn 3.** Good calls outnumbered mistakes, so the verdict said "you read the sensor, not the number" to a player who walked into the ambush. | Debrief / scoring | Vatsalya | DONE |
| 7 | P1 | **Hard to tell what the mission and the current task are while playing.** Objective was only on the briefing screen; nothing on screen said what you were deciding this turn. | HUD | Vatsalya | DONE |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |

---

## DETAIL BLOCKS

Copy the block. Only for things a one-liner can't carry.

```
### [#N] Short title
**Sev:** P?   **Area:** cones / comms / turn data / debrief / audio / input / camera
**Repro:** 1. go to /?auto=...  2. ...  3. ...
**Expected:**
**Actual:**
**Notes:**
```

<!-- paste blocks below this line -->

### [#5] Every robot is the same colour — can't tell whose cone is whose
**Sev:** P1   **Area:** units / cones
**Repro:** 1. `/?skip=1`  2. look at the three cones on the ground
**Expected:** You can tell at a glance which cone belongs to LEAD, UNIT-2, UNIT-3.
**Actual:** All three are the same cyan. The cones overlap and read as one shape.

**Why this matters more than it looks:** turn 3 asks the player to judge *one
specific unit's* view. If they can't pick UNIT-2's cone out of the three, the
whole beat is guesswork.

**The tension to resolve first:** colour is currently doing a different job —
cyan = healthy, amber = sensor glitch, red = damaged. That status read is what
makes the broken cone obvious. If each robot gets its own colour, status needs
another channel. Options:

- **A — Callsign tags.** Floating `LEAD` / `UNIT-2` / `UNIT-3` label over each
  robot, and the same label at the wide end of its cone. Colour keeps meaning
  status. Cheapest, no palette conflict.
- **B — Per-unit hue, status as pattern.** Each robot gets its own tint; glitch
  and damage are shown by flicker/static/edge treatment instead of colour.
  Strongest identity read, but it weakens the instant cyan-vs-amber tell that
  the whole demo rests on.
- **C — Per-unit cone edge.** Keep the fill colour semantic, but give each unit
  a distinct outline on its cone — solid / dashed / double. Identity and status
  in one shape, no palette fight.
- **D — Brightness ladder.** Same hue, three brightness steps per unit. Subtle;
  probably too subtle from two metres.

**Recommendation:** A + C together. Decide before building — this is a
five-minute change or an hour depending on which way it goes.

### [#6] Debrief praised a run that failed turn 3 — FIXED
**Sev:** P1   **Area:** debrief / scoring
**Repro:** play CONFIRM, SEND DRONE, CONFIRM, CONFIRM, OVERRIDE, CONFIRM
**Expected:** Failing the ambush turn is named, whatever else went right.
**Actual:** 4 calibrated vs 2 complacency → verdict read "You read the sensor,
not the number. Your squad is home because of it."
**Fix:** `dominantTag()` in `src/systems/GameState.js` now only returns praise
for a run with zero failures; otherwise it names the most common failure mode.
Mission data gained `keyTurn: 3`, and failing it prints a dedicated amber line
above the verdict.

---

## THINGS TO CHECK EACH PLAYTEST

Tick them off. If one fails, log it above.

**Does it run**
- [ ] Loads with wifi off (the venue's wifi is not a dependency)
- [ ] Console clean — no red
- [ ] Frame rate smooth through turn 3's breach

**The core idea**
- [ ] Clean cone vs broken cone tell apart instantly, from two metres
- [ ] Turn 3: damage lands *before* the HIGH confidence line arrives
- [ ] `SOURCE DEGRADED` on the meter is noticed, not missed
- [ ] The contradiction makes a new player pause

**The two scores**
- [ ] Survive a bad run → debrief still says your judgement was poor
- [ ] Counts in the debrief match the choices you actually made
- [ ] Verdict line changes depending on how you played
- [ ] Replay resets cleanly — no leftover hostiles, door, or cone state

**Feel**
- [ ] Nothing is jarringly loud
- [ ] Beat timing gives each moment room — not rushed, not dead air
- [ ] Copy is all in-fiction (`MISSION COMPLETE`, never `Success!`)

---

## IMPROVEMENTS — not bugs, changes worth making

| # | What | Why it's better | Cost | Verdict |
|---|---|---|---|---|
| A | | | S / M / L | |
| B | | | | |
| C | | | | |

---

## STILL OPEN FROM THE BRIEF — opinions wanted

From `team-brief.md` §9. Write your take next to it.

| Question | Current lean | Your take |
|---|---|---|
| Setting — robots in an industrial compound? | placeholder, could be anything | |
| Art direction — tactical HUD? | current build | |
| The AI's personality — clipped? eager? apologetic? | clipped, admits limits | |
| Does the player hear their own voice? | no, silent commander | |
| Mission 2 | only if time | |

**Not open:** trust-calibration mechanic, two-score system, offline-first.

---

## DECIDED — stop re-arguing these

Move things here once settled, with one line of why.

| Decision | Why | When |
|---|---|---|
| Procedural geometry, not Kenney GLBs | nothing to download or license, no scale fights | build |
| Synthesised SFX, not sample packs | same — and it keeps the build fully offline | build |
| `OVERRIDE` added as a command verb (turn 5) | commander needs a way to do the job the AI declined | build |
| No randomness anywhere | the demo has to be rehearsable | brief |
