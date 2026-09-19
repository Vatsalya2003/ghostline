# OVERRIDE PROTOCOL

A six-turn tactical game about **when to trust an AI teammate**.
See `team-brief.md` for the design, `development-plan.md` for the build order.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static files in /dist — runs offline, no CDN, no backend
```

## Rehearsal hooks

| URL | Effect |
|---|---|
| `/?skip=1` | Straight into turn 1, no title or briefing |
| `/?auto=CONFIRM,SEND_DRONE` | Plays those actions automatically, then hands control back |
| `node scripts/sim.mjs CONFIRM,SEND_DRONE,...` | Walks a whole mission headlessly and prints the grades |

**Demo the judges see:** `/?auto=CONFIRM,SEND_DRONE` lands on turn 3 with the
breach played out and the contradiction on screen — HIGH confidence, amber
`SOURCE DEGRADED`, and BETA-1's cone in pieces.

## Controls

Mouse on the command bar. Arrow keys + Enter also work. PS4 pad: ✕ confirm,
○ fall back, △ ask why, □ fire, R1 drone, L2 grenade, R2 night vision,
Options abort, D-pad to move the highlight. Mouse and pad are always both live.

## Where things are

```
src/data/mission1.js   ALL content — dialogue, confidence, outcomes, grades
src/systems/           TurnManager, GameState, Director, Dialogue, Audio, Input
src/render/            Scene, Camera, Units, SensorCones, FogOfWar, Level, FX
src/ui/                CommsPanel, CommandBar, StatusHUD, MissionLog, Debrief
```

**The rule:** nothing in `/systems`, `/render` or `/ui` hardcodes mission
content. A second mission is a copy of `mission1.js`, not engineering work.

## Deliberate choices worth knowing

- **Units and props are procedural geometry**, not Kenney GLBs — nothing to
  download, nothing to license, and no model scale fights. Swap in models later
  by replacing `buildChassis()` in `src/render/Units.js`.
- **SFX are synthesised with Web Audio**, not sample files, for the same reason.
  Howler is installed; if CC0 samples land in `/public/audio`, replace the method
  bodies in `src/systems/Audio.js`.
- **System monospace font**, not a webfont — no CDN, no font file to ship.
- **`OVERRIDE` is an added command verb** (turn 5), beyond the action list in the
  team brief. Turn 5 needs a way for the commander to do the job the AI declined.
- **No randomness anywhere.** Particle spread, shake and noise are all seeded or
  index-derived, so the demo plays identically every time.
