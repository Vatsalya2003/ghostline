# GHOSTLINE — gameplay & integration notes

**Owner:** gameplay + integration (Nikhil) · **Last updated:** Sat 19 Sep 2026, 12:09 PDT

The single running log for this workstream: what I observed, what I changed,
what the hooks are, what everyone else built, and what is still open.

**Start here:** §1 if you are wiring a system into gameplay · §3 if you want to
know whether you broke something · §6 if you want the state of the build and the
four things only a human can close. §0 is the chronological log, newest first.

---

## 0. RUNNING LOG

### 12:05 — 3D landed; it does not change the gameplay contract
32 CC0 `.glb` models (Quaternius, licence in `public/assets/SOURCES.md`) now
back the squad, the hostiles and the level props. Checked from my side because
async asset loading is exactly the kind of thing that strands a beat:

- **`AssetLoader` never blocks.** Callers get a group immediately and geometry
  lands inside it when it arrives; if a file is missing or corrupt the caller's
  procedural fallback stays on screen and the mission plays on — the same
  contract the audio system uses. So a failed model cannot hang a turn, and
  cannot trip the `safely()` recovery either.
- **Nothing calls `createPlaceholderUnits` any more.** The step-1 boxes are
  dead code in `Scene.js`.
- **Demo weight: `dist/` is 4.3 MB total** — 3.0 MB models, 680 KB audio,
  640 KB voice, 821 KB JS bundle. Still a folder you can open from a USB stick
  with the wifi off. No CDN at runtime.

### 11:46 — restarting mid-beat could advance a turn in the *next* mission
Found while ruling the drone out as the cause of the stall below.

`Drone.reset()` kills the tweens of its targets but not the GSAP **timeline**,
and `sweep()` resolves off `tl.eventCallback('onComplete')`. Kill the children
and that callback may never fire — so the promise `playOutcome` is awaiting
never settles. Reachable in the real game: **PAUSE ▸ RESTART during a drone
sweep.**

The consequence is not a hang, it is worse. The stranded `handleAction`
continuation eventually runs against the *new* mission and calls
`advanceTurn()` on it — a turn silently skipped on a run the player just
started. `endMission()` has the same shape: it awaits a 950 ms fade, so a
restart during it drops the old debrief over the new mission.

**Fixed at my layer rather than in the drone.** `main.js` now stamps each beat
with a `missionRun` counter, bumped on every deploy and restart; a continuation
whose stamp is stale returns instead of acting. That covers *any* long beat that
strands a promise, not just this one — which matters while several people are
still adding awaits into the Director.

**Proved rather than assumed.** A passing test only shows the bug did not fire;
it does not show the guard did anything. So I A/B'd it on the same build,
toggling only the guard:

| | Turn after interrupting a drone sweep with RESTART |
|---|---|
| guard removed | **skipped to turn 2** — bug reproduced |
| guard in place | stayed on turn 1 |

Repro, if you want to see it yourself: deploy, press SEND DRONE, and restart
while the drone is still in the air. Regression test is run D of `npm run e2e`.

Not fixing the timeline itself: it is the visual agent's file, and the guard
makes it harmless either way. Flagging it for them — `Drone.reset()` kills
`gsap.killTweensOf(...)` on the targets but never the timeline that owns the
`onComplete` the promise is waiting on.

### 11:44 — "the third playthrough hangs" was the browser, not the game · RESOLVED
The e2e cleared runs 1 and 2 then stalled partway through run 3 — turn 4 the
first time, turn 3 the second. Raising the timeout to 90s did not help.

**Cause: Chromium clamps `setTimeout` in a page it considers backgrounded, and a
headless page always is.** The clamp bites past the ~5 minute intensive-
throttling threshold, which is about when run 3 starts. The caption typewriter
is a `setTimeout` chain, so it is the first thing to crawl — 90s to type a
108-character line is ~1 char/second, which is exactly what that clamp looks
like. With the flags below the same suite ran clean. Nothing about the game
changed between the failing and passing runs. **There is no third-playthrough
bug.**

**If you write any headless browser test on this project, carry these flags:**

```
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
--disable-renderer-backgrounding
```

I had this wrong once before I had it right — my first call was "turns got
longer, raise the timeout", which was true but not the cause. The tells I should
have led with: the page was still *progressing* at the stall (caption mid-type,
caret and all — a deadlock does not type), and **the failure point moved between
runs.** A state bug fails in the same place every time. The stall dump now
prints timer latency so the next one says which it is outright.

### 11:42 — dialogue edits can now silently mute a line; `npm run verify` guards it
Voice clips are keyed by **the exact line text**. Change a word in `mission1.js`
and that line's clip is orphaned — it falls back to Web Speech, which on this
machine is silence. Nothing would have told you; the line just stops speaking.

`npm run verify` now checks every spoken line against the manifest. Currently
**36 / 36 baked.** Tested by orphaning a clip on purpose: it fails with the
exact line and the fix. If you edit dialogue, re-run:

```bash
node scripts/build-voice.mjs && npm run verify
```

It skips cleanly if there is no manifest, so a checkout without baked voice
still passes.

### 11:40 — voice changed the shape of a turn, and my tests didn't know
The voice agent's baked clips now **pace the caption to the clip length**
(`CommsPanel.say`). Median clip 6.1s, longest 10.3s. A turn is now intro beats
+ outcome playback + a spoken line, so turn 4 alone needs ~19s.

My e2e budget was 30s per action, set before voice existed. It ran out mid-line
and reported a stall. **That was my harness being wrong, not the game** — the
dump showed `busy:true` with the caption actively mid-type (`Confide_`, caret
and all), which is healthy progress, not a deadlock. Budgets raised to 90s.

Worth everyone knowing: **turns are meaningfully longer now than they were this
morning.** A six-turn run is no longer a ~3 minute demo. If the pitch slot is
tight, that is a pacing decision someone should make deliberately rather than
discover on stage.

### 11:35 — found a voice bleed in my own code
`CommsPanel.reset()` (mine, called on every turn start) delegated to `skip()`,
which only stops audio **if a caption is still typing**. A clip that outlives
its caption therefore kept playing into the next turn's intro.

Normally the caption is paced to the clip so they end together — but the **Web
Speech fallback** has no known duration, so the typewriter runs at its default
rate and finishes first. On any line with no baked clip, the previous turn's
voice talks over the next turn's intro. `reset()` now calls `stopSpeaking()`
unconditionally. Same bug class I fixed for captions, arriving via audio.

### 11:30 — the only 404 is the favicon
Chased it because a missing asset would be serious. It is
`GET /favicon.ico → 404`, nothing else. Harmless, already filtered in the test —
but it *is* a red line in the console during a judged demo. One-line fix in
`index.html` for whoever owns it. P2.

### 11:15 — a Director exception used to end the run permanently
`busy` is set entering a beat and cleared leaving it. Any throw in between left
it set, which locks the command bar with **no way back**. With four of us adding
FX calls into `Director` simultaneously this was a live demo-killer. `main.js`
now catches, logs `[ghostline] … failed to play`, and hands control back.

**If you see that line in the console, the error is real — the game surviving it
does not mean it didn't happen.**

### 11:00 — HMR was reloading the page mid-mission
Cost me an hour chasing a "turn 4 stall" that did not exist: with several of us
saving files, Vite does a **full page reload mid-run** and the mission silently
restarts at turn 1. Do not judge a playthrough on `npm run dev` right now. Use
`npm run build && npm run preview`, or `npm run e2e`, which serves `dist/`.

### 10:50 — the turn spine itself is sound
Before changing anything I walked all 1344 committing-action paths. No invariant
violations: every outcome reachable, all four endings reachable, all six grades
reachable, drones never negative, counts always matching decisions. **The bugs
were all in the presentation layer, not the mission logic.** Worth knowing
before anyone goes looking for scoring bugs — that part is well built.

---

## 1. THE EVENT BUS — `src/systems/Events.js`

The mission spine announces what happened. Anything that reacts — audio,
camera, FX, voice, telemetry — subscribes, instead of being threaded into
`TurnManager` or `Director` by hand.

```js
import { events, GAME_EVENT } from './systems/Events.js';

const off = events.on(GAME_EVENT.AI_RECOMMENDATION, ({ unit, confidence, suspect }) => {
  if (suspect) playDegradedRadio(unit);       // a confident number from a broken sensor
});
// off() unsubscribes. events.once(name, fn) fires one time.
```

Also on `window.GHOSTLINE.events`, so a system added late does not need a
`main.js` edit — and therefore not a merge conflict — just to hear about turns.

**A listener that throws is caught and logged.** A bad hook costs you a sound,
not the demo.

### What fires, and when

| Event | Payload | Fires |
|---|---|---|
| `missionStart` | `{ mission }` | deploy, and on every replay |
| `turnStart` | `{ turn, index, total }` | before the intro beats play |
| `aiRecommendation` | `{ turn, unit, via, confidence, line, sourceStatus, suspect }` | same tick as `turnStart` |
| `commandIssued` | `{ turn, action, outcome, tag }` | player committed the turn |
| `playerConfirmed` / `playerRejected` | same | took / did not take the recommendation |
| `probeUsed` | `{ turn, action, response }` | ASK WHY, NIGHT VISION — info, no turn spent |
| `commandRejected` | `{ turn, action, reason }` | pressed something unavailable |
| `sensorScan` | `{ turn, action, source, dronesLeft }` | drone or night-vision sweep |
| `unitsOrdered` | `{ turn, moves }` | squad told to move |
| `unitStatus` | `{ unit, status, previous }` | a sensor breaks or recovers |
| `healthChanged` | `{ health, delta, previous }` | integrity moved |
| `hostilesRevealed` | `{ turn }` | contacts painted |
| `objectiveCompleted` / `objectiveFailed` | `{ id, label }` | an objective resolved |
| `turnEnd` | `{ turn, action, outcome, tag }` | turn graded |
| `missionEnd` | `{ outcome, summary }` | always |
| `missionSuccess` / `missionFailure` | `{ summary, outcome }` | exactly one of the two |
| `debriefShown` | `{ summary }` | debrief on screen |

`suspect: true` on `aiRecommendation` is the mission's whole thesis in one
boolean — the source sensor is degraded while the stated confidence is not.

### Names reserved for the presentation layer

Declared in `GAME_EVENT` but **not** emitted by the spine, so two systems cannot
invent two spellings. Emit them from wherever you own that behaviour — I left
these alone rather than edit files other people are actively rewriting.

`unitFocused` · `unitSelected` · `unitMoved`

The one that is worth wiring: **`Input.cycleUnit()`** already does exactly what
`UNIT_FOCUSED` describes (frames a unit, lights its cone). One line each, if the
input owner wants it:

```js
// in cycleUnit(), after hud.setSelected(unit.id)
events.emit(GAME_EVENT.UNIT_FOCUSED, { unit: unit.id });
// in clearUnitSelection()
events.emit(GAME_EVENT.UNIT_FOCUSED, { unit: null });
```

Nothing listens for it yet, so there is no rush — but once it fires, audio and
FX can react to "the player is looking at BETA-1" without reaching into Input.

`TurnManager` also still has its own local `on('turn' | 'probe' | 'resolve' |
'end')`. That drives the Director and is unchanged — do not route new systems
through it.

---

## 2. WHAT CHANGED IN THE GAMEPLAY LAYER

Nothing about the trust/confidence mechanic or the two-score system moved.

- **`Director` exceptions no longer end the run.** `busy` is set on the way in
  and cleared on the way out; a throw in any beat used to leave it set forever,
  which locks the command bar with no way back. `main.js` now recovers the turn,
  logs loudly, and hands control back. **If your FX call throws, you will see
  `[ghostline] … failed to play` in the console and the game will keep going —
  check the console, the error is still real.**
- **Turn text can depend on mission state.** `turn.variants` in mission data,
  first match wins, same idea as `altIfHealthAbove` on outcomes:
  ```js
  variants: [{ unless: 'relayOnline', situation: '…', task: '…' }]
  ```
  Turn 6 used to open "Relay handled" even when the player walked away from the
  console.
- **Objectives are on the HUD and update live.** Declared in `mission1.js`,
  derived from state in `GameState.objectives()` — never tracked in parallel,
  so the HUD, the log and the debrief cannot disagree. Markup is
  `#objective > .obj[data-objective][class~=pending|done|failed]`.
- **The mission log gets a rule between turns** (`.turn-mark`).
- **`outcome.reveal`** was in the mission data with nothing reading it. The
  Director now rings and un-fogs the named level object, so turn 2's calibrated
  drone call has a visible payoff.
- **Comms panel clears between turns** (`CommsPanel.reset()`). The previous
  answer sitting there through turn 3's breach read as the squad still talking.
- **A command the turn will not accept no longer plays the confirm tone.**
- **The comms panel stops the voice, not just the caption**, when a turn ends.
  `reset()` used to delegate to `skip()`, which is a no-op once the caption has
  finished — so a clip that outlived its caption played over the next turn.

---

## 3. TESTING

```bash
npm run verify     # ~3s, no browser
npm run e2e        # ~5 min, builds and drives real Chromium
```

**`npm run verify`** also checks every spoken line still has a baked voice clip,
then walks all 1344 committing-action paths through the mission
and asserts the invariants: every outcome reachable, all four endings reachable,
drones never negative, health in range, counts matching decisions, praise only
on a clean run, turn 3 called out when failed, objectives agreeing with the
ending, and every integration hook firing the right number of times. Pure logic
— run it after any change to mission data, scoring, or the turn spine.

**`npm run e2e`** builds, serves `dist/` on a private port, and plays four
missions in headless Chromium:

1. a careful run that should end MISSION COMPLETE at 100%,
2. an all-CONFIRM run that should survive at 20% and still be told it was
   complacent — the two scores disagreeing, which is the whole pitch,
3. an ABORT at the objective, which ends the mission a turn early through a
   different code path,
4. a **restart in the middle of a beat**, which asserts the stranded beat does
   not skip a turn in the mission that replaced it (§0, 11:46).

It checks the HUD against game state every turn, the turn-3 setup (BETA-1
glitched, relayed via ALPHA, HIGH confidence, SOURCE DEGRADED), the objective
board, replay reset, and that no asset 404s.

The fourth ending — SQUAD LOST — is reachable on only 3 of 1344 paths and is
covered by `npm run verify` rather than in the browser.

It uses Playwright's cached Chromium over raw CDP — **no new dependency, and
nothing added to the browser bundle.** Override with `GHOSTLINE_CHROME=/path`.

### ⚠ Do not judge a playthrough on the dev server right now

With several of us saving files, Vite's HMR does a **full page reload mid-run**
and the mission silently restarts at turn 1. It cost an hour of chasing a bug
that did not exist. `npm run e2e` builds and serves `dist/` for exactly this
reason. For hand-testing, use `npm run build && npm run preview`.

---

## 4. OPEN ITEMS — outside my scope

Resolved since I raised them, kept for the record:

- ~~**No TTS voices in this environment.**~~ The voice agent baked 36 Piper
  clips; Web Speech is now the fallback, not the path. `suggestion-bug.md` #1
  effectively closed. The follow-on risk — editing a line orphans its clip and
  it silently goes mute — is guarded by `npm run verify` (§0, 11:42).
- ~~**A missing favicon 404s on every load.**~~ Fixed by another agent while I
  was writing this, and better than my attempt: an inline data URI, so there is
  no second request at all rather than a second request that succeeds. I had
  started adding `public/favicon.svg`; theirs landed first, so I deleted mine
  rather than leave a dead file in `dist/`.

Still open:

- **`Drone.reset()` does not kill its GSAP timeline**, only the tweens of its
  targets — so `sweep()`'s `onComplete` may never fire and its promise never
  settles. Harmless now that `main.js` stamps beats with `missionRun`
  (§0, 11:46), but the timeline is still the right place to fix it. Visual
  agent's call.
- **Turn length grew with voice.** A six-turn run is materially longer than it
  was this morning (§0, 11:40). Somebody should time a real run against the
  pitch slot.
- **`turn.camera` in mission data is dead.** Every turn declares it and nothing
  reads it; the intro `pan` beats carry the real values. Harmless, but it is two
  sources of truth for one camera position.
- **60% of paths end `partial`.** Only `OVERRIDE` on turn 5 brings the relay up,
  so three of four turn-5 choices end "OBJECTIVE FAILED". That is the lesson
  working as designed, not a bug — flagging it so nobody "fixes" it.

---

## 5. WHAT EVERYONE ELSE BUILT

Surveyed 12:05. Recorded so nobody duplicates work. I have not reviewed these
for correctness — this is "what exists", not "what is verified".

| Area | Landed | Notes |
|---|---|---|
| **3D** | 32 `.glb`, 2.1 MB | Quaternius, **all CC0**, licence reproduced in `public/assets/SOURCES.md`. Squad, hostiles and level props all real models now; the step-1 boxes are dead code. `AssetLoader` is non-blocking with procedural fallback. |
| **Voice** | 36 clips, 640 KB | Piper baked offline (`build-voice.mjs`). ALPHA and BETA-1 have different voices. Web Speech kept as fallback. **Closes `suggestion-bug.md` #1** — the thing nobody could test here. |
| **Audio** | `Soundscape.js`, +13 files | Ambient beds, stereo placement, deny tone. Found and used the event bus on its own. |
| **Controller** | `Gamepad.js`, `Prompts.js`, `Focus.js`, `PauseMenu.js` | Semantic controls over W3C standard mapping, in-game remap, 69 headless tests. Rewrote `Input.js`. |
| **Visuals** | `Camera.js`, `FogOfWar.js`, `SensorCones.js`, `UnitMarkers.js`, `Drone.js`, `ScreenFX.js` | Per-unit cone edges (#5 option C), a real flying drone, screen FX, fog reveal. Notes in `visual-polish-notes.md`. |

**Compatibility notes from my side:**

- The audio agent found and used the event bus independently — `Soundscape`
  listens to 8 event types. That is the seam working as intended.
- The input agent independently fixed the `CommandBar` `dataset.disabled` bug I
  had also found (disabled buttons were being re-enabled on unlock). Theirs
  landed first; I left it alone and added an e2e guard instead.
- The camera agent replaced `applyCameraTransform`/`panCamera` but **kept
  back-compat exports**, so `Director` did not break. Good call.
- Two systems — assets and audio — independently chose the same "real thing with
  a procedural fallback" contract. Worth keeping if a mission 2 happens.

---

## 6. STATUS

| Check | State |
|---|---|
| `npm run build` | ✅ clean |
| `npm run verify` | ✅ 133,441 assertions · 1344 paths · 36/36 voice lines baked |
| `npm test` (input) | ✅ 69/69 |
| `npm run e2e` | ✅ 304 assertions · four missions in real Chromium |
| `dist/` | 4.3 MB — 3.0 MB models, 680 KB audio, 640 KB voice, 821 KB JS |

Core loop confirmed end to end in a real browser:
**OBSERVE → INTERPRET → ISSUE COMMAND → TRUST/QUESTION → EXECUTE → CONSEQUENCES
→ DEBRIEF.** Runs offline; no CDN at runtime.

### What only a human can close

Unchanged from this morning's audit, and not closable by any test I can write:

1. **Does the broken cone read from two metres?** (`suggestion-bug.md` #3)
2. **Does a fresh player hesitate on turn 3?** (#4) — the entire pitch rests on
   this and it has still never been watched.
3. **Time a full run against the pitch slot.** Voice made turns materially
   longer (§0, 11:40).
4. **Commit.** `git log` shows nothing since `dd4f4e0` this morning — every
   agent's work today is uncommitted working-tree state. That is the single
   biggest risk left, and it is a two-minute job.
