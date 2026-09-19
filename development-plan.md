# OVERRIDE PROTOCOL — DEVELOPMENT PLAN
### 11 steps. Each has a prompt, a test, and a stop rule.
### Work top to bottom. Do not skip ahead.

---

## HOW TO USE THIS

For each step:
1. Give Claude Code the **prompt**
2. Run the **test** yourself in the browser
3. Only move on when the test passes
4. If you hit the **stop rule**, take the action it says — don't push through

**Commit after every passing test.** Message format: `step N: what works now`.

**Timings are guides, not targets.** The stop rules are the real
constraints.

---

# PHASE 1 — PROVE IT WORKS (steps 1–3)

Highest-risk work first. If 3D is going to fail, it fails here, while
there's still time to fall back to 2D.

---

## STEP 1 — Scene boots
**~25 min**

**Prompt:**
> Set up a Vite vanilla-JS project with Three.js. Create a scene with a dark
> background (#0a0d0a), a 20x20 flat ground plane with a subtle grid
> texture, an orthographic camera tilted ~45° looking down (tactical diorama
> framing), one DirectionalLight with shadows plus a dim AmbientLight, and
> three box placeholders on the plane — two cyan (#4ce0d8), one amber
> (#e0a84c). Add OrbitControls temporarily so I can check framing. No game
> logic.

**Test:**
- [ ] `npm run dev` serves without errors
- [ ] Three boxes visible on a grid plane
- [ ] Boxes cast shadows
- [ ] You can orbit around the scene
- [ ] Console is clean

**Stop rule:** not working after 45 min → switch to the 2D Phaser plan.

**Commit:** `step 1: three.js scene + orthographic camera`

---

## STEP 2 — Sensor cones ⚠ THE DECIDING STEP
**~60 min**

This is the game's signature visual and its biggest technical risk. If this
doesn't work, nothing else matters.

**Prompt:**
> Add sensor cones as flat semi-transparent wedge meshes lying on the ground
> at y=0.01, using additive blending, extending from two of the boxes.
>
> Cone A (cyan, from a cyan box): long, steady, clean edges.
> Cone B (amber, from the amber box): half the length, opacity flickering
> over time, with visible noise or broken edges.
>
> The difference must be obvious at a glance from across a room. Use flat
> meshes, NOT SpotLights.

**Test:**
- [ ] Two cones visible on the ground
- [ ] Clean cone reads as strong and steady
- [ ] Degraded cone reads as broken — shorter, flickering, noisy
- [ ] **Stand back two metres from the screen. Can you still tell them
      apart instantly?**
- [ ] Frame rate still smooth

**Stop rule:** ⚠ **The hard one.** Not working by **90 minutes** → stop and
go 2D. Do not extend. If it barely limps in at the wire, that's also a
signal — every later 3D problem will limp too.

**Commit:** `step 2: sensor cones, clean vs degraded`

---

## STEP 3 — Fog of war
**~30 min**

**Prompt:**
> Add a dark semi-transparent plane over the ground to represent unseen
> area. Render the sensor cones above it so lit areas read as visible and
> everything else reads as unknown. Don't implement per-tile visibility or
> wall occlusion yet.

**Test:**
- [ ] Map mostly dark
- [ ] Cone areas clearly brighter
- [ ] The broken cone reveals visibly *less* than the clean one
- [ ] No z-fighting or flickering surfaces

**Stop rule:** not working in 45 min → ship a simpler version (flat circular
reveal) and move on. Don't perfect this.

**Commit:** `step 3: fog of war`

### 🚩 GO / NO-GO CHECKPOINT
All three passed? **Continue in 3D.**
Any failed or ran badly over? **Switch to 2D now.** All design docs and
mission content carry over unchanged.

---

# PHASE 2 — MAKE IT A GAME (steps 4–7)

---

## STEP 4 — Real models + movement
**~45 min**

**Prompt:**
> Replace the box placeholders with Kenney CC0 robot models (GLTF/GLB) from
> /public/models. Keep the same colors via material tint. Add tile-based
> movement: clicking a ground tile tweens the selected unit there over
> ~400ms using GSAP, and its sensor cone moves and rotates with it.

**Test:**
- [ ] Models load, sensibly scaled and oriented
- [ ] Click a tile → unit glides there smoothly
- [ ] Cone follows and rotates correctly
- [ ] No console errors on load

**Stop rule:** models fighting you for 30 min → go back to boxes and move
on. Boxes with good lighting look fine. Models are polish.

**Commit:** `step 4: models + tile movement`

---

## STEP 5 — Turn manager + mission data
**~60 min**

The architectural heart. Get this right and everything after is fast.

**Prompt:**
> Create `/src/data/mission1.js` exporting an array of 6 turn objects, each
> with: id, situation text, camera focus point, AI line + confidence +
> source unit, unit statuses, allowed actions, and an outcomes map (action →
> {tag, healthDelta, logLine, fx}).
>
> Create `TurnManager.js` and `GameState.js` to drive it: track current
> turn, squad health, unit statuses, and a calibration record tagging each
> decision as calibrated / complacency / misuse / disuse / mistrust /
> distrust.
>
> No UI yet — expose functions I can call from the console and log state.

**Test:**
- [ ] `advanceTurn()` from console walks through all 6 turns
- [ ] Health changes correctly per outcome
- [ ] Calibration tags recorded correctly
- [ ] Mission ends at turn 6, or early if health hits 0
- [ ] **Zero content hardcoded outside `mission1.js`**

**Stop rule:** none — this must work. It's the spine.

**Commit:** `step 5: turn manager + mission data`

---

## STEP 6 — Comms panel + voice
**~50 min**

**Prompt:**
> Add an HTML overlay on the canvas: a comms panel showing the AI's line as
> typewriter text (~30ms/char), a confidence meter (Low/Med/High as a
> segmented bar), and the source unit. Speak each line with the Web Speech
> API at lower pitch for a synthetic tone. Allow skipping a line with a
> click. Style per the palette: near-black, cyan, amber, monospace,
> uppercase labels, sharp corners.

**Test:**
- [ ] Caption types on character by character
- [ ] Voice plays, sounds appropriately robotic
- [ ] Voice and caption stay roughly in sync
- [ ] Clicking skips to the full line
- [ ] Confidence meter matches the turn data
- [ ] **Voices load reliably** (Chrome populates them async)

**Stop rule:** TTS broken after 30 min → ship captions only, add voice
later. Captions alone still work.

**Commit:** `step 6: comms panel + TTS`

---

## STEP 7 — Command bar
**~40 min**

**Prompt:**
> Add a command bar to the HTML overlay showing only the actions allowed for
> the current turn. Clicking one resolves the outcome from mission data:
> apply health change, append the log line, trigger the FX, advance the
> turn. Add a mission log strip and a HUD with squad health and turn
> counter.

**Test:**
- [ ] Only allowed actions appear each turn
- [ ] Clicking resolves and advances correctly
- [ ] Health bar updates
- [ ] Log appends and scrolls
- [ ] **A full 6-turn mission is playable start to finish**

### 🏁 TAG A DEMO BUILD HERE
```bash
git tag demo-v1 && git push --tags
```
Rough is fine. This is your parachute.

**Commit:** `step 7: command bar — mission playable`

---

# PHASE 3 — MAKE IT LAND (steps 8–11)

---

## STEP 8 — Debrief screen
**~35 min**

**Prompt:**
> Add a debrief screen after turn 6 (or on mission failure) reporting two
> separate things: mission outcome (survived / squad lost) and a trust
> calibration breakdown counting each of the five failure modes plus
> well-calibrated decisions. Add a verdict line selected by the dominant
> failure tag. Include a replay button.

**Test:**
- [ ] Counts match the decisions you actually made
- [ ] Verdict line changes based on how you played
- [ ] **Play badly but survive — it should say so.** That split is the point
- [ ] Replay resets cleanly

**Commit:** `step 8: debrief + calibration report`

---

## STEP 9 — Turn 3 polish ⚠ THE DEMO BEAT
**~45 min**

This single turn is what you show judges. It deserves dedicated time.

**Prompt:**
> Polish turn 3's sequence: camera snaps to BETA-1, impact FX plays, screen
> shakes, BETA-1's status badge glitches cyan→amber with a chromatic
> flicker, its sensor cone visibly degrades in real time, and only *then*
> does the high-confidence recommendation arrive. Beat timing should let
> each moment land.

**Test:**
- [ ] Sequence plays in the right order with clear pauses
- [ ] Cone degradation is dramatic and unmissable
- [ ] The contradiction (HIGH confidence, broken source) is obvious
- [ ] **Show it to someone who hasn't seen it. Do they hesitate before
      choosing?** That hesitation is the whole game working.

**Commit:** `step 9: turn 3 demo beat`

---

## STEP 10 — Audio + FX
**~40 min**

**Prompt:**
> Wire Howler for SFX: radio static at the start/end of each comms line, UI
> beep on button press, alert on warnings, impact on damage, scan pulse on
> drone use, glitch sound on sensor failure. Add particle FX for impacts and
> drone scans, plus camera shake on damage. Add a CSS scanline overlay and
> subtle vignette on the HTML layer.

**Test:**
- [ ] Every action has audio feedback
- [ ] Radio static makes comms feel real
- [ ] Nothing is jarringly loud
- [ ] Scanlines subtle, not distracting
- [ ] Frame rate still smooth

**Commit:** `step 10: audio + fx polish`

---

## STEP 11 — Controller (optional)
**~30 min · only if steps 1–10 are done**

**Prompt:**
> Add PS4 controller support via the Gamepad API, polling in the render
> loop. Map: ✕ Confirm, ○ Fall Back, △ Ask, □ Fire, L1/R1 cycle weapon, L2
> Grenade, R2 Night Vision, D-Pad navigate, Options Abort. Mouse and gamepad
> must both stay active — never disable one.

**Test:**
- [ ] Controller connects and buttons map correctly
- [ ] Mouse still works simultaneously
- [ ] Verify button indices on macOS — they can differ from the standard
      mapping

**Stop rule:** not working in 30 min → drop it. It's a nice-to-have.

**Commit:** `step 11: gamepad support`

---

# TIME BUDGET

| Phase | Steps | Time |
|---|---|---|
| Prove it works | 1–3 | ~2 hrs |
| Make it a game | 4–7 | ~3.5 hrs |
| Make it land | 8–11 | ~2.5 hrs |
| **Total** | | **~8 hrs** |

You have roughly 15. The slack is real and you will need it — debugging
always costs more than building.

**Use leftover time on:** playtesting with strangers, rehearsing the pitch,
and Mission 2 (a data file only) — in that order.

---

# NON-NEGOTIABLES

- **Test before moving on.** A broken step compounds.
- **Commit every passing test.**
- **Tag `demo-v1` at step 7.** Before polish, before anything clever.
- **Feature freeze Saturday midnight.** After that: bug fixes and rehearsal
  only.
- **Push before you sleep.**
- **Respect the stop rules.** At 02:45 on a 3-hour timebox, "we're so close"
  will feel true. It usually isn't.
