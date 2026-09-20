# GHOSTLINE — BUGS & SUGGESTIONS

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
| 2 | P1 | **Gamepad button indices unverified.** Root cause was the design, not the numbers: the old `PAD_MAP` bound raw indices straight to game actions on a PS4 assumption. Now resolved through the W3C `mapping === 'standard'` contract, with a heuristic fallback, an in-game remap for non-standard pads, and 69 headless tests. **Still needs a human with a physical pad** — see the detail block. | Input | Nikhil | FIXED (unverified on hardware) |
| 3 | P1 | _Two-metre test on turn 3: is the broken cone unmissable from across the room?_ | Sensor cones | handoff | OPEN |
| 4 | P1 | _Does a fresh player hesitate before choosing on turn 3? If not, the game isn't working._ | Turn 3 | handoff | OPEN |
| 5 | P1 | **Can't tell which cone belongs to which robot.** All three units are the same cyan. Partly addressed: squad renamed ALPHA / BETA-1 / BETA-2 and each robot now wears its number (1/2/3) over its head, matching its HUD chip. Still open: cones themselves carry no identity once they overlap. | Units / cones | Vatsalya | FIXING |
| 6 | P1 | **Debrief praised a run that failed turn 3.** Good calls outnumbered mistakes, so the verdict said "you read the sensor, not the number" to a player who walked into the ambush. | Debrief / scoring | Vatsalya | DONE |
| 7 | P1 | **Hard to tell what the mission and the current task are while playing.** Objective was only on the briefing screen; nothing on screen said what you were deciding this turn. | HUD | Vatsalya | DONE |
| 8 | P0 | **Any exception inside the Director locked the game permanently.** `busy` is set entering a beat and cleared leaving it; a throw anywhere between — a missing model, an FX call into a system that had not loaded — left it set, which locks the command bar with no way back. With several people adding calls into `Director` at once this was a live demo-killer. `main.js` now catches, logs `[ghostline] … failed to play`, and hands control back. | Director / main | Nikhil | DONE |
| 9 | P1 | **Turn 6 opened "Relay handled" even when the player never brought the relay up.** Walk away from the console on turn 5 and the extraction turn still congratulated you. Turn data now takes `variants` keyed on mission state, same idea as `altIfHealthAbove` on outcomes. | Turn data | Nikhil | DONE |
| 10 | P1 | **Objectives never updated while playing.** The HUD showed one static line from the briefing. Now two live rows (`RESTORE THE RELAY` / `BRING THE SQUAD HOME`) that go done/failed independently — which makes the two-score split visible *during* the mission instead of only at the debrief. | HUD | Nikhil | DONE |
| 11 | P1 | **Do not judge a playthrough on the dev server while others are editing.** Vite HMR does a full page reload mid-run and the mission silently restarts at turn 1. Cost an hour chasing a bug that did not exist. Use `npm run build && npm run preview`, or `npm run e2e`, which serves `dist/` on its own port. | process | Nikhil | NOTED |
| 12 | P2 | **Comms panel kept the previous turn's line through the next intro.** Turn 3's breach runs the better part of ten seconds with the last answer still sitting in the panel — it reads as the squad still talking, which is exactly wrong when the silence after the breach is the point. `CommsPanel.reset()` on turn start. | Comms | Nikhil | DONE |
| 13 | P2 | **`outcome.reveal` was dead data.** Turn 2's `reveal: 'generator'` had nothing reading it, so the one calibrated call on that turn was the only choice with no visible payoff. Director now rings and un-fogs the named level object. | Director / turn data | Nikhil | DONE |
| 14 | P1 | **No TTS voices exist in this environment** — `speechSynthesis.getVoices()` returns empty in headless Chromium and nothing on this machine provides a speech engine. `Dialogue.js` degrades correctly (the caption still plays), but **#1 cannot be closed by testing here.** Needs Chrome on the demo machine. A `public/voice/` directory has appeared, so this may already be handled with baked audio. | Comms / TTS | Nikhil | OPEN |
| 15 | P2 | **`turn.camera` in mission data is dead.** Every turn declares it, nothing reads it — the intro `pan` beats carry the real values. Two sources of truth for one camera position. Left for whoever owns the camera. | Turn data | Nikhil | OPEN |

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

### [#2] Gamepad button indices unverified — fixed by design, needs a hardware pass
**Sev:** P1   **Area:** input
**Repro:** 1. plug in any controller  2. press every button  3. check the labels
**Expected:** A is confirm, B is back, START pauses, on any normal pad.
**Actual (before):** `PAD_MAP` bound raw indices straight to *game actions*
(`6: 'GRENADE'`, `4: 'SWITCH_WEAPON'`) against a PS4 layout nobody had tested.
Two problems, and the indices were the smaller one: `SWITCH_WEAPON` appears in
no turn at all, and `GRENADE` only in turn 3 — so most buttons did nothing on
most turns, and the player had to memorise which of ten actions sat where.

**What changed.** Buttons now resolve to *semantic controls* (confirm, cancel,
navigate, pause…), and the command list is navigated rather than mapped: the
D-pad or left stick walks it, A takes the highlighted one. That is layout-proof
by construction — it only needs A, B and a direction to be right.

The indices themselves come from the W3C Gamepad spec's **standard mapping**.
When `gamepad.mapping === 'standard'` the button table is *guaranteed* by the
spec, not guessed; Xbox, DualShock, DualSense and most third-party pads report
it in Chrome and Firefox. Non-standard pads get a hat-switch fallback, a
visible on-screen warning, and **PAUSE ▸ CONTROLS ▸ REMAP CONTROLLER**, which
asks the player to press each button and saves the result per pad.

**Verified:** 69 headless checks in `npm test` — every standard index, debounce,
nav repeat timing, stick deadzone and hysteresis, analog triggers, disconnect
mid-hold, reconnect, two pads at once, the remap capture, and the hat fallback.
The same suite also runs in-browser at `/input-harness.html`.

**Still needs a human.** No controller exists on the build machine
(`/dev/input/js0` is keyd's virtual pointer). Nobody has pressed a physical
button. Plug a pad in, open `/input-harness.html`, press everything, and check
each index lights the label the spec says it should. Two minutes, and it closes
this properly.

**Notes:** `src/systems/Gamepad.js` is deliberately DOM-free so it can be
driven from Node. If a real pad disagrees with the table, the fix is the remap
flow, not a code edit.

### [#5] Every robot is the same colour — can't tell whose cone is whose
**Sev:** P1   **Area:** units / cones
**Repro:** 1. `/?skip=1`  2. look at the three cones on the ground
**Expected:** You can tell at a glance which cone belongs to ALPHA, BETA-1, BETA-2.
**Actual:** All three are the same cyan. The cones overlap and read as one shape.

**Why this matters more than it looks:** turn 3 asks the player to judge *one
specific unit's* view. If they can't pick BETA-1's cone out of the three, the
whole beat is guesswork.

**The tension to resolve first:** colour is currently doing a different job —
cyan = healthy, amber = sensor glitch, red = damaged. That status read is what
makes the broken cone obvious. If each robot gets its own colour, status needs
another channel. Options:

- **A — Callsign tags. DONE for the robots.** Each robot wears its number over
  its head, tinted by status, and the HUD chip shows the same number. Not yet
  done on the cones themselves — see C.
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

**Automated — run these first, they take two minutes together**
- [ ] `npm run verify` — 1344 mission paths, scoring and objective invariants
- [ ] `npm run e2e` — two full missions in real Chromium, HUD vs state, replay reset
- [ ] `npm test` — gamepad mapping suite
- [ ] `npm run build` — clean

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

---

# FIXED — undersea map rebuild (branch `3d_V2`)

Five defects behind "the map looks wrong and objects are missing". Four were
invisible in the source and only showed up by measuring the running game.
Full write-up in `map-rebuild-notes.md`.

| # | Severity | What | Cause |
|---|---|---|---|
| 1 | **P0** | **No sensor cones anywhere, in either mission** | `SensorCones.js` declared `float outline` twice in one GLSL scope. GLSL has no shadowing, so the whole cone shader failed to compile and the game's core visual silently vanished — console warning only |
| 2 | **P0** | Range Instrument 7 — the answer to mission 2 — was 2.7 m underground | The seabed was mirrored in z against its own height function: a flat-laid `PlaneGeometry` maps local +y to world −z, and the displacement sampled the raw local y |
| 3 | **P1** | Two enormous hard-edged black wedges across the map, reading as missing geometry | The fog of war was a flat 30-unit quad at y=0.01 over hilly terrain, so it stood proud of every hollow. It now drapes the terrain |
| 4 | **P1** | No colour anywhere; everything a flat teal | Water fog ran 14–72 with the camera a fixed 40 units back → ~45% haze on the *subject*. Mission 1 looks vivid because it fogs at 46–230, past the board |
| 5 | **P2** | Props standing at 30–36°; the instrument's chain thrown 9 m into the water column | Slope sampled over ±0.9 m, which straddles a single sand ripple. Chain was parented to the tilted hull |

**Still open on this branch**

| Severity | What |
|---|---|
| P2 | Residual soft diagonal banding on open sediment. Bisected to the terrain material — survives hiding fog mesh, growth, snow, dome and water fog. Three suspects listed in `map-rebuild-notes.md`; test by zeroing each term |
| P2 | The AUVs are still walker models |
| P1 | `mission.fleet` (per-vehicle battery/integrity) written but not read by the engine |

**Note for mission 1:** `Terrain.js` has the same z-mirror as bug 2, but nothing
in Dry Creek is placed from its height field, so it is invisible there. Left
alone deliberately rather than silently reshaping a rehearsed map.

---

# FIXED — AMMUNITION DEPOT build (branch `3d_V2`)

| # | Severity | What | Cause |
|---|---|---|---|
| 1 | **P1** | The squad never moved on any turn that ordered a move | mission3's `moves` were written as an array of `{unit,x,z}`; the engine takes a map of callsign → `[x,z]`, so `Object.entries` handed back indices and the destructure threw. Caught by a console error during a scripted playthrough, not by reading |
| 2 | **P2** | The perimeter wall rendered as a zigzag of notches | Panels were rotated with `atan2(dx,dz)`, which aligns local +z to the run — but a box panel is long on local **+x**, so every panel sat across the wall |
| 3 | **P2** | A pale lit diamond stamped on a dark plain | Depot shadow camera was 45 units over a 180-unit ground. **Same defect as the seabed had** — see `map-rebuild-notes.md` |

**Still open**

| Severity | What |
|---|---|
| **P1** | `npm run verify` only walks mission 1. Missions 2 and 3 have a schema lint and playtests only. Extending `verify.mjs` to loop `MISSIONS` is the highest-value test job outstanding |
| P2 | The depot's graded platform still shows a straight edge where it meets the hillside — softer than it was, not gone |
| P2 | Residual soft diagonal banding on open seabed sediment (mission 2), isolated to the terrain material, term not yet identified |
| P2 | Missions 2 and 3 have no baked voice — captions and TTS only |
| P2 | All three missions use the same walker models; mission 2 should be AUVs |
| P2 | Audio-suspend and GSAP-timeline pause on the FULL LOG panel are verified by reading, not by running — headless has no AudioContext |

---

# FINAL BUILD PASS — fixed (branch `3d_V2`, from tag `pre-final`)

| # | Sev | What | Cause |
|---|---|---|---|
| 1 | **P0** | MISSION COMPLETE after shooting an unarmed hostage | `primaryObjectiveMet()` returned the **first** flagged objective, not all of them. Invisible while every mission had one flag; wrong the moment one had two. Found by `verify` within a minute of it covering mission 3 |
| 2 | **P0** | The board left the screen on view rotation | The camera never re-aimed. One `lookAt` at construction is correct for an ortho camera translated parallel to itself — and stops being correct the moment the azimuth can change |
| 3 | **P1** | Squad stood in the yard for turns 5–10 while the camera visited rooms they were not in | Traversal was attached per-outcome, so it only fired on the three outcomes it had been remembered on. Now on the turn |
| 4 | **P1** | `state.outcome` was `true` | mission3 wrote `endsMission: true`; the field **names** the ending (`'aborted'`). Its final turn also declared `endsMission` at all, short-circuiting `advanceTurn`, which is what picks complete vs partial |
| 5 | **P1** | Every unswept metre of the depot read as a hole in the ground | `FogOfWar` had no `'depot'` case and fell through to the **night** curtain — 0.78 opacity of near-black over a sunlit map |
| 6 | **P1** | Squad walked backwards up the hill before setting off | They deployed at the engine's default home positions, which belong to mission 1's compound. Missions can now declare `deploy` |
| 7 | **P1** | Contact markers and drone sweeps pointed at open ground | `alert` and `reveal` coordinates were written against the previous compound — including turn 6's, the one contact the player has to look at before deciding whether to shoot it |
| 8 | **P2** | Perimeter wall rendered as a zigzag of notches | Panels aligned with `atan2(dx,dz)`; box geometry is long on local **+x**, so it needs `atan2(-dz,dx)` |
| 9 | **P2** | Two captions could interleave character by character | `say()` did not cancel a running typewriter. Never fires in normal play (the spine awaits each line) but now guarded |
| 10 | **P2** | `npm run audio` failed on macOS | `scripts/cdp.mjs` only knew Linux Chrome paths |

**Still open**

| Sev | What |
|---|---|
| P1 | Mission 3 has no baked voice — `piper` is not installed on the build machine. Runs on Web Speech (verified working: 199 voices, Samantha picked) with captions paced to an estimate. Bake it when the tooling is available |
| P2 | The room's six figures are described but not modelled — only the filing cabinet and the contact marker are on the board |
| P2 | The depot's graded platform still shows a straight edge where it meets the hillside |
| P2 | Residual soft diagonal banding on open seabed sediment (mission 2, unregistered) |
| P2 | `sim.mjs` still runs mission 1 only |

---

# FIXED — people on the board, and the squad on the ground

| # | Sev | What | Cause |
|---|---|---|---|
| 1 | **P0** | Robots invisible at turn 1 — badges, rings and sensor cones showing, no robots | Units were pinned at `y = 0`. Correct on mission 1's flat compound pad, wrong everywhere else: the depot terrain runs from **+1.32** at the overwatch rise to **−3.05** in the ammunition room, so the squad started the mission buried inside a hill and would have finished it hovering three metres above the floor. `Units.js` now takes a ground sampler and every placement, walk and traversal leg sets `y` from it |
| 2 | **P0** | No enemies and no hostages anywhere | They were never modelled. The mission described six figures in a room, gave the player a filing cabinet to look at, and asked them to decide whether to shoot one — which is not a decision, it is a guess about a sentence |
| 3 | P2 | A body vanished the turn after it went down | `showForTurn` hid anything marked down. Bodies now stay on the board for the rest of the mission — the point of putting people there is that a decision leaves something behind |
| 4 | P2 | The unresolved sixth figure was entirely hidden behind the cabinet | Its marker was shorter than the 1.5-unit cabinet it was standing behind. Now spans 0.55–2.25 so the upper bars clear cover |
| 5 | P2 | Only five figures countable on turn 5 while the line says six | The sixth was shown from turn 6. It is on the board from turn 5 as an unresolved contact |

**The actors.** `src/render/Actors.js`, procedural like everything else — no
downloaded meshes. Two kinds, built to be tellable apart from across a room at
tactical zoom, because that is the entire mechanic:

- **HOSTILE** — dark gear, red band, rifle held across the body, standing
  square, red ground ring.
- **CIVILIAN** — pale clothing, no rifle, wrists bound, seated or crouched,
  amber ring. Half the height of a standing figure.

Colour alone would not carry it — cyan/amber/red already mean something about
the player's own squad — so the **silhouettes** differ too. A rifle is a shape;
a seated figure is half a standing one.

**UNRESOLVED** is the important state. The sixth figure is drawn as pulsing
amber bars, not as a person, because the whole point of turn 6 is that you do
not know what it is yet. Resolving it swaps the marker for a body, which *is*
the reveal.

Placement lives in `depot-layout.js` (`ACTORS`); consequences are mission data
(`dropActors`, `resolveActors` on an outcome), so the engine stays ignorant of
who is in the room.
