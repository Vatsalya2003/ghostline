# GHOSTLINE — AUDIT & AUDIO HANDOFF

**Date:** 19 September 2026 · **Branch:** `audio-pack-and-setup-nikhil`

What follows is a full pass over the working directory: what state the project
is actually in, what I fixed, what is still missing, and what I would do next
in priority order.

---

## 1. SHORT VERSION

The game is **further along than the docs suggest.** All 11 steps of
`development-plan.md` are committed, `demo-v1` is tagged and pushed, and a
six-turn mission plays end to end with working scoring. This is not a project
in trouble.

Three things were genuinely outstanding:

| | Status |
|---|---|
| **Node.js was not installed on this machine** — the project could not run at all | **Fixed** |
| **Audio was never started.** `audio.md` briefs 16 sounds; `/public` did not exist | **Done — 16/16** |
| **Something in the parent folder needs a decision today** — see §4 | **Needs you** |

There is also one thing I could not do and you must: **play turn 3 in Chrome
and watch someone else play it.** Details in §6.

---

## 2. WHAT I CHANGED

Everything is on `audio-pack-and-setup-nikhil`. Nothing was pushed.

```
public/audio/            NEW — 16 sounds + ambient-loop.ogg + SOURCES.md
src/systems/Audio.js     samples with synth fallback (was synth-only)
src/systems/Director.js  3 lines — move / night-vision now have their own sounds
src/ui/CommandBar.js     2 lines — hover tick, on mouse and on pad
src/main.js              2 edits — CONFIRM sounds different; debrief has a tone
```

### The audio pack

All 16 filenames from `audio.md`, exactly as specified, lowercase and
hyphenated. Every source is **CC0 1.0** — Kenney's Interface, Sci-Fi and Impact
packs, plus one CC0 static bed from OpenGameArt. No attribution obligations, no
non-commercial clauses. Full per-file provenance is in
[`public/audio/SOURCES.md`](public/audio/SOURCES.md).

Against the brief's own handoff checklist:

- [x] Every file CC0 or equivalently unrestricted
- [x] Levels balanced — matched by measured RMS, on a deliberate ladder
- [x] Filenames match the list exactly
- [x] Files small — largest is 134 KB, all 17 together are 348 KB
- [x] `ambient-loop` loops without a click at the seam
- [ ] **Listened to `ui-select` twenty times in a row** — I cannot hear. §6.

Two deliberate departures from `audio.md`, both explained in `SOURCES.md`:

1. **`ambient-loop` also ships as `.ogg`.** MP3 carries encoder padding that
   clicks at the loop seam — the exact failure the brief's checklist warns
   about. Vorbis loops gaplessly. Code loads the `.ogg`; the `.mp3` stays so
   the filename list is intact.
2. **Kenney has no radio squelch**, and the brief calls `radio-open` the single
   highest-impact sound in the project. Rather than substitute something
   approximate, I cut and shaped it from a CC0 static bed: band-limited to
   380–3100 Hz (radio band), 4 ms attack, exponential tail, dry click at the
   head. Same licence, still public domain.

### The code side

`Audio.js` previously synthesised everything with Web Audio, and the README
said the swap to samples would mean "replace the method bodies". I did that,
but kept every synth method as a **fallback**: each sound plays its sample if
the file decoded, and falls back to the old oscillator version if not. Delete
`/public/audio` entirely and the game still makes noise — a thinner version of
itself, but nothing breaks. Files are fetched at page load and decoded on the
first user gesture, so there is no lag on the first radio squelch.

Wiring gaps I found and closed — these four sounds were briefed but had **no
call site at all**, so they would have shipped as dead files:

| Sound | Now plays when |
|---|---|
| `ui-hover` | hovering a command, and on D-pad / arrow-key focus moves |
| `confirm` | you press CONFIRM — agreeing with the AI now sounds different from any other order, which seemed worth having in a game about agreeing with an AI |
| `nightvision` | night vision toggled (previously reused the drone scan sound) |
| `mission-success` / `mission-fail` | the debrief opens — success tone only for a completed objective, not merely a surviving squad |

`move-step` also replaced a generic beep on unit movement.

---

## 3. ENVIRONMENT — Node.js

**This was the actual blocker.** `node` and `npm` were not installed, so
`npm run dev` could not work for anyone on this machine.

I installed **Node 24.21.0 LTS** to `~/.local/lib/node`, symlinked into
`~/.local/bin`. No `sudo`, nothing touched outside your home directory. Because
`~/.local/bin` is already in your fish `$fish_user_paths`, `node -v` works in a
new shell with no further setup.

If you would rather have it system-managed: `sudo pacman -S nodejs npm`, then
delete `~/.local/lib/node`.

`npm install` has been run. **The dev server is running now at
http://localhost:5173.**

---

## 4. ⚠ THE THING THAT NEEDS A DECISION TODAY

The parent folder contains **`Defense Tech Jam KBR Undersea Mission Data.pdf`**.
It is a *different sponsor challenge* from the one the project is built against.

| | |
|---|---|
| `team-brief.md` says you are building for | **Trust Your Synthetic Teammates (NAWCTSD)** |
| The PDF in the folder is | **Accelerating Time-to-Insight for Undersea Mission Data (KBR)** |

Two separate briefs at the same jam. Worth thirty seconds of certainty about
which one you are submitting to, because the pitch in `team-brief.md` §10 is
written for the first one.

**If it turns out you need the KBR brief, you are in better shape than it
looks.** Ghostline already hits most of its stated winning criteria — mission
replay, interactive decision paths, scoring tied to mission objectives,
after-action review, offline operation, limited compute. The gap is the
*setting*, and `team-brief.md` §9 already lists setting as open and explicitly
names a submarine as an option. That reskin is a `mission1.js` content edit,
not engineering — which is precisely the property the architecture was built
for.

Also worth noting the PDF's own header: the jam runs **18–19 September** and
today is the 19th. Feature freeze is tonight. Treat everything in §6 below as
competing for a small number of remaining hours.

---

## 5. WHAT IS STILL MISSING

Nothing here is broken. These are gaps, ordered by how much they threaten the
demo.

**P0 — could cost you the demo**

- **No Chrome on this machine.** Only Firefox is installed. The README says
  "use Chrome", and it is right to: Web Speech API voices and Gamepad support
  are both better there, and `suggestion-bug.md` #1 and #2 are open precisely
  because neither has been verified. If the demo machine is this machine,
  install Chrome before anything else.
- **Turn 3 has never been watched by a stranger.** `suggestion-bug.md` #4 is
  still open. The entire pitch is "show turn 3 and watch them hesitate." That
  claim is currently untested.

**P1 — hurts**

- `suggestion-bug.md` #1 — TTS voice untested. Does it fire, sound robotic,
  stay in sync with the caption?
- `suggestion-bug.md` #2 — gamepad button indices unverified.
- `suggestion-bug.md` #3 — the two-metre cone test.
- `suggestion-bug.md` #5 — still marked `FIXING`. Robots wear numbers now, but
  the cones themselves carry no identity once they overlap. The recommendation
  in the detail block (per-unit cone outline, option C) has not been built.
- **The new audio has never been heard.** See §6.

**P2 — polish**

- `3d-tech-stack.md` in the **parent folder** is a stale copy still titled
  "OVERRIDE PROTOCOL" and referencing an `override-protocol/` directory. The
  copy inside the repo is current. Delete the outer one before anyone reads it
  and gets confused.
- README's clone URL points at `github.com/Vatsalya2003/ghostline.git` — fine
  if that is still the canonical remote, worth a glance if the repo moved.
- No `LICENSE` file in the repo. For a judged jam with CC0 assets bundled, a
  one-line licence statement costs nothing.
- Production bundle is 659 KB (180 KB gzipped), effectively all Three.js. Fine
  for a local demo. Ignore the Vite chunk warning.

---

## 6. WHAT I VERIFIED, AND WHAT I COULD NOT

Being precise about this, because the gap matters.

**Verified:**

- `npm install` and `npm run build` both succeed, 29 modules, no errors
- Dev server serves the app and every audio file with correct MIME types
- All 16 briefed filenames exist, all under 200 KB, 348 KB total
- All 17 files decode cleanly with zero errors
- No file clips — every peak sits below −0.5 dBFS *after* MP3 encoding, which
  is the number that matters. Three files needed extra headroom to get there
- The ambient loop's seam is level-matched to within 0.3 dB
- Scoring logic, via `scripts/sim.mjs` on two runs: a careful run grades
  5 calibrated / 1 mistrust, and an all-CONFIRM run survives at 20% health and
  is still told it was complacent. The two-score split works
- The HUD, comms panel, confidence meter and status chips all render correctly

**Could not verify — these need a human:**

- **The 3D scene.** Headless Firefox does not composite WebGL into screenshots
  (I confirmed this separately: a canvas cleared to red captures as black). So
  I have no evidence about the robots, the sensor cones, or the turn 3 cone
  degradation. It very likely renders — the code builds and the team has
  clearly been playtesting — but I did not see it.
- **The timed beats.** Headless Firefox does not drive `requestAnimationFrame`
  reliably, so the director's intro sequence stalls under automation. Camera
  pans, the breach, and beat timing are all unobserved.
- **Everything about how the audio actually sounds.** I chose each sound by
  measured duration, RMS and spectral brightness against the brief's written
  spec — `ui-select` is the driest, least piercing click in the pack by 15 dB,
  which is the closest I can get to "still tolerable after twenty plays"
  without ears. That is analysis, not judgement. Someone has to listen.

---

## 7. WHAT I WOULD DO RIGHT NOW

In order. Times are rough.

1. **Answer §4.** Which sponsor brief? Two minutes, and it changes everything
   below it.
2. **Install Chrome**, if this is the demo machine. 10 min.
3. **Open `?auto=CONFIRM,SEND_DRONE` and listen to the whole of turn 3.**
   This is both the audio playtest and the demo rehearsal in one pass. Check
   the glitch sound makes you flinch and the radio squelch sells the fiction.
   If a sound is wrong, swapping it is a file drop — same filename, no code
   change. 20 min.
4. **Put turn 3 in front of someone who has never seen it.** Say nothing. Watch
   whether they hesitate. This is the single highest-information thing left to
   do and it closes `suggestion-bug.md` #3 and #4 together. 15 min.
5. **Verify TTS and the gamepad in Chrome** — `suggestion-bug.md` #1 and #2.
   30 min, and #2 has a stop rule already: if the pad fights you, drop it.
6. **Decide `suggestion-bug.md` #5** (cone identity). The detail block
   recommends option A+C and warns it is "a five-minute change or an hour
   depending on which way it goes." Given the hour, take the five-minute
   version or close it as WONTFIX — do not start the hour version tonight.
7. **Rehearse the pitch.** `team-brief.md` §10 is two sentences and a live
   demo. It deserves a run-through more than the code deserves another commit.

Everything above the line at feature freeze is bug fixes and rehearsal only.
The build is in good shape; the risk now is scope, not quality.
