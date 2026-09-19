# GHOSTLINE — AUDIT, AUDIO HANDOFF & ENGINE-PORT ASSESSMENT

**Last updated:** Saturday 19 September 2026, 10:40 PDT · **13.3 hours to feature freeze**
**Branch:** `audio-pack-and-setup-nikhil` (1 commit, not pushed)

A full pass over the working directory: what state the project is actually in,
what I fixed, what is still missing, what porting to Unreal or Unity would
cost, and what I would do with the remaining hours.

---

## 1. SHORT VERSION

The game is **further along than the docs suggest.** All 11 steps of
`development-plan.md` are committed, `demo-v1` is tagged and pushed, and a
six-turn mission plays end to end with working scoring. This is not a project
in trouble.

| | Status |
|---|---|
| **Node.js was not installed** — the project could not run at all on this machine | **Fixed** |
| **Audio was never started.** `audio.md` briefs 16 sounds; `/public` did not exist | **Done — 16/16, wired** |
| **Port to Unreal or Unity** | **Assessed — does not fit in the time. §5** |
| **Which sponsor brief are you submitting to?** | **Still unresolved — §4** |
| **Has a stranger played turn 3?** | **No. §7** |

Two things only a human can close: **play turn 3 in Chrome and watch someone
else play it**, and **listen to the new audio**. Neither is something I can do.

---

## 2. WHAT I CHANGED

Everything is on `audio-pack-and-setup-nikhil`. Nothing was pushed.

```
public/audio/            NEW — 16 sounds + ambient-loop.ogg + SOURCES.md
src/systems/Audio.js     samples with synth fallback (was synth-only)
src/systems/Director.js  3 lines — move / night-vision now have their own sounds
src/ui/CommandBar.js     2 lines — hover tick, on mouse and on pad
src/main.js              2 edits — CONFIRM sounds different; debrief has a tone
audit-findings.md        this file
```

### The audio pack

All 16 filenames from `audio.md`, exactly as specified, lowercase and
hyphenated. Every source is **CC0 1.0** — Kenney's Interface, Sci-Fi and Impact
packs, plus one CC0 static bed from OpenGameArt. No attribution obligations, no
non-commercial clauses. Full per-file provenance is in
[`public/audio/SOURCES.md`](public/audio/SOURCES.md).

`kenney.nl` refused connections from this machine, so the packs came from
GitHub mirrors that carry the original CC0 licence files verbatim. 303 source
sounds were available; each slot was chosen by measured duration, RMS and
spectral brightness against the brief's written spec, then trimmed, shaped,
layered, level-matched and encoded.

Against the brief's own handoff checklist:

- [x] Every file CC0 or equivalently unrestricted
- [x] Levels balanced — matched by measured RMS, on a deliberate ladder
- [x] Filenames match the list exactly
- [x] Files small — largest is 134 KB, all 17 together are 348 KB
- [x] `ambient-loop` loops without a click at the seam
- [ ] **Listened to `ui-select` twenty times in a row** — I cannot hear. §7

Two deliberate departures from `audio.md`, both explained in `SOURCES.md`:

1. **`ambient-loop` also ships as `.ogg`.** MP3 carries encoder padding that
   clicks at the loop seam — the exact failure the brief's checklist warns
   about. Vorbis loops gaplessly. Code loads the `.ogg`; the `.mp3` stays so
   the filename list is intact.
2. **Kenney has no radio squelch**, and the brief calls `radio-open` the single
   highest-impact sound in the project. Rather than substitute something
   approximate, I cut it from a CC0 static bed: band-limited to 380–3100 Hz
   (radio band), 4 ms attack, exponential tail, dry click at the head.

### The code side

`Audio.js` previously synthesised everything with Web Audio. It now plays
samples but keeps **every synth method as a fallback** — each sound plays its
file if it decoded, and falls back to the old oscillator version if not. Delete
`/public/audio` entirely and the game still makes noise. Files are fetched at
page load and decoded on the first user gesture, so there is no lag on the
first radio squelch.

Four sounds were briefed but had **no call site at all** and would have shipped
as dead files. Now wired:

| Sound | Now plays when |
|---|---|
| `ui-hover` | hovering a command, and on D-pad / arrow-key focus moves |
| `confirm` | you press CONFIRM — agreeing with the AI now sounds different from any other order, which seemed worth having in a game about agreeing with an AI |
| `nightvision` | night vision toggled (previously reused the drone scan sound) |
| `mission-success` / `mission-fail` | the debrief opens — success tone only for a completed objective, not merely a surviving squad |

`move-step` also replaced a generic beep on unit movement.

**To hear it:** `http://localhost:5173/?auto=CONFIRM,SEND_DRONE` — click once
first, browsers block audio until you interact.

---

## 3. ENVIRONMENT — Node.js

**This was the actual blocker.** `node` and `npm` were not installed, so
`npm run dev` could not work for anyone on this machine.

Installed **Node 24.21.0 LTS** to `~/.local/lib/node`, symlinked into
`~/.local/bin`. No `sudo`, nothing touched outside your home directory. Because
`~/.local/bin` is already in your fish `$fish_user_paths`, `node -v` works in a
new shell with no further setup.

If you would rather have it system-managed: `sudo pacman -S nodejs npm`, then
delete `~/.local/lib/node`.

`npm install` has been run. **The dev server is running at
http://localhost:5173.**

---

## 4. ⚠ UNRESOLVED: WHICH SPONSOR BRIEF?

The parent folder contains **`Defense Tech Jam KBR Undersea Mission Data.pdf`**.
It is a *different sponsor challenge* from the one the project is built against.

| | |
|---|---|
| `team-brief.md` says you are building for | **Trust Your Synthetic Teammates (NAWCTSD)** |
| The PDF in the folder is | **Accelerating Time-to-Insight for Undersea Mission Data (KBR)** |

Two separate briefs at the same jam. The pitch in `team-brief.md` §10 is
written for the first one. **This is still unanswered and it gates the single
highest-value piece of work available today** (see §7, item 3).

**If it turns out to be KBR, you are in better shape than it looks.** Ghostline
already hits most of its stated winning criteria — mission replay, interactive
decision paths, scoring tied to mission objectives, after-action review,
offline operation, limited compute. The gap is the *setting*, and
`team-brief.md` §9 already lists setting as open and explicitly names a
submarine. That reskin is a `mission1.js` content edit, not engineering —
precisely the property the architecture was built for.

---

## 5. PORTING TO UNREAL OR UNITY — ASSESSED, NOT RECOMMENDED

Asked and answered properly, because it came up three times.

### What is actually on this machine

| | State |
|---|---|
| **Unreal 5.8.2** | Binary release, 73 GB, installed 18 Sept. Editor **runs**. Currently open on `~/Documents/Unreal Projects/MyProject` |
| `MyProject` | **Stock Third Person template. 776 content files, all Manny / platforming / side-scroller variants. Zero Ghostline work** |
| **Unity** | Hub only (flatpak, 9.9 MB, never used). **No editor installed, no licence activated** |

Unity is the *worse* of the two starting points: add 1–3 hours for account,
licence activation and an 8–15 GB editor download — over venue wifi, on a
project whose hard rule is "venue wifi cannot be a dependency."

### Cost of a like-for-like port

| Piece | Ports how | Cost |
|---|---|---|
| `mission1.js` — 489 lines of pure data | → DataTable / ScriptableObject. Mechanical | 2–4 hrs |
| TurnManager, GameState, scoring | → Blueprint / C++ / C#. Straightforward | ~half a day |
| **HUD** — 6 UI modules + 245 lines CSS | → UMG or UI Toolkit. The bulk of it | **1–2 days** |
| **Sensor cones** — additive wedges, animated noise, flicker | → material + decal/mesh | **2 hrs to a day** |
| **AI voice** — Web Speech API | No engine equivalent. Bake every line to audio | half a day |
| Delivery | 660 KB browser bundle → multi-GB cook | first Linux cook is slow |

**Experienced UE/Unity dev: 3–5 days. Starting from a template opened
yesterday: a week-plus.** You have 13.3 hours.

### Would parallel agents change that? No — 20–30 hours at best

Breaking the existing 2,725 lines by what an agent can finish unsupervised:

| | Lines | Agent-friendly? |
|---|---|---|
| `mission1.js` + systems (turn logic, scoring, state) | ~1,060 | **Yes.** Real parallel win — 3–5 hrs with 3–4 agents |
| `render/` (Units, SensorCones, FogOfWar, Level, FX) | ~726 | No — needs eyes on a screen |
| `ui/` + `main.css` | ~540 | No — same |

The logic layer genuinely parallelizes. The other 60% does not, for two
reasons:

1. **Unreal assets are binary.** `.uasset` and `.umap` cannot be written as
   text. No agent can author a UMG widget, Blueprint, material or level —
   those only exist through a human clicking in the editor. In UE, agents are
   locked out of exactly the expensive part.
   *Unity is genuinely better here:* with Force Text serialization prefabs and
   scenes are YAML, and **UI Toolkit uses UXML + USS, where USS is CSS-like** —
   the existing `main.css` would translate semi-directly. That is the one real
   argument for Unity over Unreal.
2. **Nobody can verify the output.** This is the harder limit. I could not even
   confirm the *existing* web build renders (§6). For UE or Unity there is no
   headless check short of a full cook plus a human looking at it. Every agent
   produces unverified work funnelling back through **one person with one
   editor open.** Throughput is capped by that person, not by agent count. Six
   agents writing into one project mostly produces merge conflicts in
   unmergeable binary assets.

And "does the broken cone read from two metres" — the thing the whole demo
rests on — is pure human iteration. Parallelism does not touch it.

### The recommendation

**Ship the browser build.** It is finished, offline, 660 KB, and already does
the thing you are judged on. Neither brief's criteria mention engine choice:
NAWCTSD is creativity and engagement; KBR's software requirements explicitly
say to *avoid* systems requiring extensive setup and to assume limited compute
and intermittent connectivity. A browser build is a **stronger** answer to that
brief than a multi-GB package, not a weaker one.

`team-brief.md` already settled this: *"a finished, fun, one-mission game beats
an ambitious unfinished one."*

The failure mode of porting is not "we finish at 90%". It is "at 11 PM we have
a project that compiles, the cones look wrong, the HUD is half-styled, and we
stopped playtesting the thing that worked."

**Post-jam:** happy to export `mission1.js` to a DataTable and scaffold the
project after freeze. Real head start, costs nothing today.

---

## 6. WHAT I VERIFIED, AND WHAT I COULD NOT

Being precise about this, because the gap matters.

**Verified:**

- `npm install` and `npm run build` both succeed, 29 modules, no errors
- Dev server serves the app and every audio file with correct MIME types
- All 16 briefed filenames exist, all under 200 KB, 348 KB total
- All 17 audio files decode cleanly with zero errors
- No file clips — every peak below −0.5 dBFS *after* MP3 encoding, which is the
  number that matters. Three files needed extra headroom to get there
- The ambient loop's seam is level-matched to within 0.3 dB
- Scoring logic via `scripts/sim.mjs` on two runs: a careful run grades
  5 calibrated / 1 mistrust; an all-CONFIRM run survives at 20% health and is
  still told it was complacent. **The two-score split works**
- HUD, comms panel, confidence meter and status chips all render correctly

**Could not verify — these need a human:**

- **The 3D scene.** Headless Firefox does not composite WebGL into screenshots
  (confirmed separately: a canvas cleared to red captures as black). I have no
  evidence about the robots, the sensor cones, or the turn 3 degradation. It
  very likely renders — the code builds and the team has been playtesting — but
  I did not see it.
- **The timed beats.** Headless Firefox does not drive `requestAnimationFrame`
  reliably, so the director's intro stalls under automation. Camera pans, the
  breach, and beat timing are unobserved.
- **How any of the audio sounds.** Each sound was chosen by measured duration,
  RMS and spectral brightness against the written spec — `ui-select` is the
  driest, least piercing click in the pack by 15 dB, the closest I can get to
  "still tolerable after twenty plays" without ears. That is analysis, not
  judgement. Someone has to listen.

---

## 7. WHAT IS STILL MISSING

**P0 — could cost you the demo**

- **No Chrome on this machine.** Only Firefox. The README says "use Chrome" and
  is right: Web Speech voices and Gamepad support are both better there, and
  `suggestion-bug.md` #1 and #2 are open precisely because neither is verified.
  If this is the demo machine, install Chrome before anything else.
- **Turn 3 has never been watched by a stranger** (`suggestion-bug.md` #4). The
  entire pitch is "show turn 3 and watch them hesitate." That claim is untested.
- **§4 is unanswered.**

**P1 — hurts**

- `suggestion-bug.md` #1 — TTS untested: does it fire, sound robotic, stay in
  sync with the caption?
- `suggestion-bug.md` #2 — gamepad button indices unverified.
- `suggestion-bug.md` #3 — the two-metre cone test.
- `suggestion-bug.md` #5 — still `FIXING`. Robots wear numbers, but the cones
  carry no identity once they overlap. The recommended fix (per-unit cone
  outline, option C) is not built.
- **The new audio has never been heard.**

**P2 — polish**

- `3d-tech-stack.md` in the **parent folder** is a stale copy still titled
  "OVERRIDE PROTOCOL" referencing an `override-protocol/` directory. The copy
  inside the repo is current. Delete the outer one.
- README's clone URL points at `github.com/Vatsalya2003/ghostline.git` — check
  it is still canonical.
- No `LICENSE` file. For a judged jam bundling CC0 assets, a one-line licence
  statement costs nothing.
- Production bundle is 659 KB (180 KB gzipped), effectively all Three.js. Fine
  for a local demo. Ignore the Vite chunk warning.

---

## 8. WHAT I WOULD DO WITH 13 HOURS

In order.

1. **Answer §4.** Which sponsor brief? Two minutes, and it gates item 3.
2. **Install Chrome**, if this is the demo machine. 10 min.
3. **If KBR: start the undersea reskin of `mission1.js`.** Pure content, it
   parallelizes cleanly across agents, and it is the one thing that could
   plausibly change your standing with judges today. If NAWCTSD: skip entirely.
4. **Open `?auto=CONFIRM,SEND_DRONE` and listen to all of turn 3.** Audio
   playtest and demo rehearsal in one pass. If a sound is wrong, swapping it is
   a file drop — same filename, no code change. 20 min.
5. **Put turn 3 in front of someone who has never seen it.** Say nothing. Watch
   whether they hesitate. Highest-information thing left; closes #3 and #4
   together. 15 min.
6. **Verify TTS and gamepad in Chrome** (#1, #2). 30 min — and #2 already has a
   stop rule: if the pad fights you, drop it.
7. **Decide #5** (cone identity). The detail block warns it is "five minutes or
   an hour depending which way it goes." Take the five-minute version or close
   it WONTFIX. Do not start the hour version tonight.
8. **Rehearse the pitch.** `team-brief.md` §10 is two sentences and a live demo.
   It deserves a run-through more than the code deserves another commit.

**Do not port the engine.** See §5.

After freeze: bug fixes and rehearsal only. The build is in good shape; the
risk now is scope, not quality.
