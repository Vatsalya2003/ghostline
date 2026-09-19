# GHOSTLINE — AUDIO SOURCES

All 16 sounds from `audio.md`, built to the filenames the code expects, plus a
second pass that added the ambient beds and the feedback sounds the original
list did not cover. **The AI's voice is a separate bundle — see
[`../voice/SOURCES.md`](../voice/SOURCES.md).**

**Every source is CC0 1.0 (public domain). No attribution is required and
nothing here is non-commercial.** Credits below are courtesy, not obligation.

| Pack | Author | License | Obtained from |
|---|---|---|---|
| Interface Sounds 1.0 | Kenney (kenney.nl) | CC0 1.0 | `github.com/Calinou/kenney-interface-sounds` |
| Sci-Fi Sounds | Kenney (kenney.nl) | CC0 1.0 | `github.com/Boyquotes/kenney-sci-fi-sounds-for-godot` |
| Impact Sounds | Kenney (kenney.nl) | CC0 1.0 | `github.com/Boyquotes/kenney-impact-sounds-for-godot` |
| Frequency Static Sound Effects | bretbernhoft | CC0 1.0 | `opengameart.org/content/frequency-static-sound-effects` |

GitHub mirrors were used because `kenney.nl` refused connections from the build
machine. They carry the original CC0 licence files verbatim.

---

## What each file is made of

| # | File | Source | Processing |
|---|---|---|---|
| 1 | `radio-open.mp3` | OGA `static1.wav` + Kenney `click_002` | 0.26s slice, band-limited 380–3100 Hz (radio band), 4 ms attack, exponential tail, click layered at the head |
| 2 | `radio-close.mp3` | OGA `static1.wav` + Kenney `click_003` | as above, 0.19s, darker (320–2500 Hz), faster decay |
| 3 | `ui-select.mp3` | `click_005` | the driest, least piercing click in the pack — 15 dB less high-frequency energy than the other four |
| 4 | `ui-hover.mp3` | `tick_001` | quietest tick, set 8 dB below `ui-select` |
| 5 | `alert.mp3` | `error_006` | two-tone, 0.52s, low-mid weighted |
| 6 | `glitch.mp3` | `computer_noise_000` + `glitch_003` | 0.8s slice, 5-bit log bitcrush at 55% mix, hard transient at the head |
| 7 | `impact.mp3` | `impact_metal_002` (sci-fi) + `impact_metal_medium_000` | weighty body plus a brighter metallic transient on top |
| 8 | `drone-scan.mp3` | `impact_bell_heavy_002` + `force_field_002` | bell ping over a sweep bed, trimmed to 1.0s |
| 9 | `move-step.mp3` | `footstep_concrete_000` | 0.10s, low-passed, set well down — this plays constantly |
| 10 | `confirm.mp3` | `confirmation_001` | 0.295s affirmative two-note |
| 11 | `explosion.mp3` | `low_frequency_explosion_001` + `explosion_crunch_000` | muffled low blast with crunch texture low-passed to 2.2 kHz. Deliberately not Hollywood |
| 12 | `mission-success.mp3` | `impact_bell_heavy_001` | heavy bell, long tail, trimmed to 1.5s. Resolving, no fanfare |
| 13 | `mission-fail.mp3` | `minimize_005` + `low_frequency_explosion_000` | descending sweep falling into dead low air |
| 14 | `ambient-loop.ogg` / `.mp3` | `space_engine_low_000–003` | four clips chain-crossfaded (0.6s, equal-power) then wrapped end-to-start (1.0s) for a seamless 17.2s loop, low-passed to 900 Hz |
| 15 | `typing.mp3` | `tick_002` | 23 ms, set 10 dB below `ui-hover`, fired every second character |
| 16 | `nightvision.mp3` | `switch_003` | trimmed to 0.4s |

## What plays when

Every audible moment in the mission, and which system owns it. `npm run audio`
drives a real browser through a full mission and asserts that none of the rows
marked **must** is silent.

### Interface

| Event | Sound | Owner |
|---|---|---|
| BEGIN / DEPLOY / RUN IT AGAIN | `ui-select` | main.js |
| Command focused — mouse, arrow keys or D-pad | `ui-hover` | CommandBar / FocusRing |
| Unit cycled with Tab or the pad | `ui-hover` | Input |
| Command chosen | `ui-select` **must** | main.js |
| CONFIRM chosen — agreeing with the machine | `confirm` **must** | main.js |
| Command refused (no drones, probe spent, unbound pad button) | `ui-deny` **must** | Soundscape ← `COMMAND_REJECTED` |
| Caption typing | `typing`, every second character | CommsPanel |
| Log line lands | `ui-hover` at 1.6× | Director |

### Transmissions

| Event | Sound | Owner |
|---|---|---|
| AI opens a channel | `radio-open` **must**, carrier up, beds duck 45%, TX light on | Director + CommsPanel |
| AI speaks | bundled voice clip; Web Speech if there is none | CommsPanel ← Voice |
| AI closes | `radio-close` **must**, carrier down, beds released, TX light off | Director + CommsPanel |

### The world

| Event | Sound | Owner |
|---|---|---|
| A unit moves | `move-step` + `servo` on alternate steps, one per 0.95 units travelled, **placed** | Soundscape |
| A unit is hit | `impact` **must**, placed | Director |
| A sensor fails | `glitch` **must** | Director |
| Breach charge | `explosion` **must** | Director |
| Warning beat | `alert` **must** | Director |
| Alarm outcome | `alert` ×2 | Director |
| Drone ordered | `drone-launch` **must** → rotor bed → `objective` **must** when the reading lands | Soundscape ← `SENSOR_SCAN` |
| Drone sweep | `drone-scan` **must** | Director |
| Hostiles resolve out of the fog | `detect` **must**, placed | Soundscape ← `HOSTILES_REVEALED` |
| Night vision | `nightvision` | Director |
| Relay comes up | `mission-success` as the relay tone | Director |
| Squad integrity falls to 30% or less | `alert` ×2, after a 0.9 s beat | Soundscape ← `HEALTH_CHANGED` |
| Mission complete | `mission-success` **must** | main.js |
| Mission lost, partial or aborted | `mission-fail` | main.js |

### Beds

| Condition | Layer |
|---|---|
| Always | `ambient-loop` |
| Turns 1, 2, 6 — outside the wire | `ambient-field` full, `ambient-interior` off |
| Turns 3, 4, 5 — inside the compound | `ambient-interior` full, `ambient-field` down to 18% |
| Any sensor broken, or integrity ≤ 40% | `ambient-tension` faded in (62% / 45%, 100% for both) |
| A channel is open | `radio-carrier` |
| A drone is airborne | `drone-loop` |
| Every 6.5–15 s | one of `relay-tick`, `distant-clank`, `distant-thump` |

### Where a sound is

One-shots marked **placed** are panned and attenuated to where the thing that
made them actually is: `Soundscape` projects the world point through the live
camera, so the pan follows the screen through every pan, zoom and wide-view
the camera rig does. Off-screen sources drop to a third of level rather than
vanishing — a robot taking a hit out of frame still reports. Transmissions are
never placed; they arrive on a headset, not from across the compound.

## Added in the soundscape pass

Three of these come from the same CC0 Kenney packs as everything above, so they
sit in the same family. The rest are **synthesised from scratch** — original
work, no licence to track — because a seamless wind or room-tone loop is hard
to find under CC0, and something built from periodic functions whose periods
divide the loop length is seamless by construction rather than by luck.

### Derived from the Kenney packs (CC0)

Built by [`scripts/build-sfx.mjs`](../../scripts/build-sfx.mjs).

| File | Source | What it is |
|---|---|---|
| `ui-deny.mp3` | `error_004` | A refused command. Short, dark and dull on purpose — on a pad it is easy to hit repeatedly |
| `detect.mp3` | `bong_001` ×2 | Contacts resolving out of the fog. Pitched down 28%, doubled at 170 ms — a contact report, not an alarm |
| `objective.mp3` | `bong_001` | A reading coming back. Pitched down 12%, long tail. Deliberately smaller than `mission-success` |

### Synthesised — original work, public domain

Built by [`scripts/build-ambience.mjs`](../../scripts/build-ambience.mjs) from
a seeded PRNG, so a rebuild is byte-identical and a diff stays honest.

| File | Loop | What it is |
|---|---|---|
| `ambient-field.ogg` | 24.0s | Exterior air. Filtered noise under three gust LFOs at 1, 3 and 7 cycles per loop |
| `ambient-interior.ogg` | 24.0s | Inside the compound. 50 Hz mains and four harmonics, beating slightly, over a noise floor, with a transformer whine |
| `ambient-tension.ogg` | 16.0s | Unease. A 38/57/76 Hz sub drone breathing twice per loop. Held under the mix only while a sensor is broken or the squad is hurt |
| `radio-carrier.ogg` | 4.0s | The open channel. Band-limited hiss, up for exactly as long as a transmission is |
| `drone-loop.ogg` | 2.0s | Rotors. Four close partials beating against each other |
| `servo.mp3` | — | The mechanical half of a step. Kenney has no servo, and a footstep alone does not read as a machine walking |
| `drone-launch.mp3` | — | Spin-up, a second before the sweep |
| `distant-clank.mp3` | — | Metal settling somewhere out in the compound. Inharmonic partials, twice low-passed for distance |
| `distant-thump.mp3` | — | Something heavy, further out |
| `relay-tick.mp3` | — | A relay dropping out on the commander's own console — played centre, never placed in the world |

Loop seams were measured rather than trusted: the sample-to-sample step at each
wrap point sits at or below the 99th-percentile step found anywhere else in the
same file, so no seam is a larger discontinuity than the signal already makes
on its own. The largest is `ambient-interior` at −53 dBFS, which is 15 dB below
the bed it sits in.

## Levels

Every file was level-matched by measured RMS rather than by ear, on a
deliberate ladder — constant sounds sit low, one-off dramatic beats sit high.
Measured RMS of the shipped files:

```
ambient-loop  -38 dBFS      nightvision     -21
typing        -36           confirm         -22
ui-hover      -34           drone-scan      -23
radio-close   -26           mission-fail    -22
ui-select     -26           mission-success -25
move-step     -25           glitch          -15
radio-open    -24           impact          -20
alert         -20           explosion       -16
```

Added in the soundscape pass, on the same ladder — the beds sit at or below the
original `ambient-loop`, the world detail below that again, and only `detect`
comes up near the alarm:

```
radio-carrier -41 dBFS      objective       -23
ambient-field -38           ui-deny         -24
ambient-int.  -38           drone-launch    -26
relay-tick    -34           servo           -27
ambient-tens. -34           drone-loop      -30
distant-clank -33           detect          -19
distant-thump -32
```

Every one of these also clears the −0.5 dBFS post-encode peak bar; the two
peakiest (`detect`, `objective`) land at −1.0 and −1.1 dBFS. `build-sfx.mjs`
enforces that in a loop: encode, measure the *encoded* file, pull the ceiling
down, repeat. (ffmpeg's `alimiter` normalises back to 0 dB unless you pass
`level=disabled`, which is a quiet way to lose all your headroom.)

Every peak sits below −0.5 dBFS **after** MP3 encoding, which is the number
that matters — lossy encoding overshoots the PCM peak, so three files
(`drone-scan`, `explosion`, `mission-success`) needed extra headroom to stop
them clipping on playback. Nothing is jarringly louder than anything else; the
~22 dB spread is intentional dynamic range, not imbalance.

## Two things that differ from `audio.md`

1. **`ambient-loop` ships as `.ogg` as well as `.mp3`.** MP3 carries encoder
   padding at both ends, which produces an audible click at the loop seam — the
   one thing the brief's checklist explicitly calls out. Vorbis loops gaplessly.
   The code loads the `.ogg`; the `.mp3` is kept so the filename list is intact.
2. **Kenney has no radio squelch.** `radio-open` / `radio-close` are cut and
   shaped from a CC0 static bed rather than lifted whole from a pack. Same
   licence, still public domain.

## Rebuilding or swapping a sound

`src/systems/Audio.js` maps slot names to filenames in one `SAMPLES` table at
the top. Drop a replacement in with the same filename and it is picked up on
reload — no code change. Every slot falls back to the original Web Audio synth
if its file is missing, so deleting this folder degrades the game rather than
breaking it.
