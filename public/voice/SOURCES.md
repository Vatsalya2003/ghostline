# GHOSTLINE — AI VOICE

Every line the squad AI speaks, pre-rendered to a radio-processed clip and
bundled with the build. 36 clips, 205 seconds, 549 KB.

Built by [`scripts/build-voice.mjs`](../../scripts/build-voice.mjs) straight
from `src/data/mission1.js`, so the mission file stays the single source of
truth for dialogue. Edit a line, re-run the script, and the clip for the old
text is deleted as an orphan.

---

## Licence

| Voice | Model | Used for | Licence |
|---|---|---|---|
| LJSpeech | `en_US-ljspeech-high` | **ALPHA** — 34 lines | **Public domain** |
| Joe | `en_US-joe-medium` | **BETA-1** — 2 lines | **CC0 1.0** |

Both are [Piper](https://github.com/OHF-Voice/piper1-gpl) voices from
`huggingface.co/rhasspy/piper-voices`. Neither requires attribution and neither
carries a non-commercial clause.

**Voices deliberately rejected.** The best-known Piper voices are not usable
here. `en_US-ryan` is **CC BY-NC-SA 4.0**, `en_US-amy` gives no clear licence,
and both `hfc_male` and `hfc_female` are **CC BY-NC-SA 4.0**. `audio.md` rules
out non-commercial assets for a judged competition, so every candidate was
checked against its model card before download and only public-domain / CC0
voices were kept.

Piper itself is a build-time tool. Nothing from it ships in the browser bundle
— the deliverable is the `.ogg` files in this folder.

---

## Why bundled instead of `speechSynthesis`

The browser's speech API is not an asset you can rely on:

- **The voice list differs per browser and per OS.** Firefox on Linux often has
  nothing usable at all, and the demo machine has no Chrome installed.
- **It will not tell you how long a line takes.** That is the one number the
  caption typewriter needs. The old code typed at a fixed 28 ms/character, so
  a caption finished less than halfway through the spoken line and the panel
  sat reading DONE while the AI kept talking. A bundled clip reports its own
  duration, so `CommsPanel` paces the caption to it and the last character
  lands with the last word.
- **It cannot be processed.** `speechSynthesis` output is not routable through
  Web Audio, so no radio treatment can be applied to it.

**Web Speech is still wired up underneath.** If the manifest is missing, a line
has no clip, or the browser cannot decode Opus, `CommsPanel` falls back to
`speak()` exactly as before. Captions never depend on either path.

---

## Two voices, on purpose

The mission turns on *which unit* a reading came from. In turn 3 a confident
call arrives from BETA-1 — the unit whose sensor the player has just watched
break — relayed through ALPHA. The panel prints `BETA-1` and `RELAYED VIA
ALPHA`; giving BETA-1 an audibly different speaker makes that something you
hear rather than something you have to read.

---

## The radio chain

Applied with ffmpeg after synthesis.

| Stage | Direct (ALPHA) | Relayed (BETA-1 via ALPHA) |
|---|---|---|
| Band | 320 Hz – 3300 Hz, 2-pole each end | 430 Hz – 2700 Hz — a second hop is narrower |
| AGC | `acompressor` 8:1 @ −20 dB | 10:1 @ −22 dB |
| Saturation | `asoftclip` atan @ 0.85 | atan @ 0.72 |
| Then | resample 16 kHz · limiter · `loudnorm I=-18 TP=-1.5` | same |

Encoded **Ogg Opus, 20 kbps mono, `-application voip`**. The band limit means
16 kHz sampling loses nothing, and Opus at that rate is transparent for
band-limited speech. Measured across all 36 clips: mean −17.7 to −18.1 dBFS,
worst peak −1.6 dBFS. Nothing clips.

### An em dash is a gap in time, not punctuation

`Entering — CONTACT. CONTACT. Two shooters, left arc.` is two transmissions
with something happening between them. The two halves are synthesised
separately and joined with 0.55 s of silence, which the live radio carrier
fills. Verified: that clip has exactly one internal silence, 0.555 s long,
starting at 0.638 s.

### What is deliberately *not* modelled

**A damaged sensor does not degrade the voice.** It is tempting, and it would
be wrong. The mission rests on the player having to weigh a stated confidence
against a cone on the ground; if a broken unit also *sounded* broken, the
player would get a free tell and turn 3 would stop being a decision. Radio
artefacts here are uniform atmosphere, uncorrelated with whether the AI is
right. The relay treatment is the one exception, and only because the UI
already prints `RELAYED VIA` — it describes something the player is told.

---

## Rebuilding

```bash
python3 -m venv .venv && .venv/bin/pip install piper-tts      # build-time only
# fetch en_US-ljspeech-high and en_US-joe-medium from rhasspy/piper-voices
PIPER_PYTHON=.venv/bin/python PIPER_VOICES=/path/to/voices \
  node scripts/build-voice.mjs
```

Synthesis goes through `scripts/piper_batch.py`, which loads each model once
rather than once per line — the piper CLI reloads a `high` model on every
invocation, which is about ten seconds a line.

`manifest.json` maps the **exact line text** to its clip and duration. No
hashing at runtime, and a line whose text has changed simply misses and falls
back to Web Speech rather than playing the wrong audio.

## Still needs ears

Everything above is measured, not heard. Whether the voice is *right* — pace,
whether the radio chain is too dirty, whether BETA-1 reads as a different unit
— is a judgement no measurement covers. Listen to turn 3 before the demo.
