# GHOSTLINE — AUDIO SOURCES

All 16 sounds from `audio.md`, built to the filenames the code expects.

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
