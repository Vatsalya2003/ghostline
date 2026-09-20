# GHOSTLINE

An eleven-turn tactical game about **when to trust an AI teammate.**

You're a commander. Your squad is three machines. You see the world only
through their sensors. Each turn the squad AI tells you what it recommends and
how confident it is — but sensors break, and a broken sensor still sounds
confident.

**One mission: AMMUNITION DEPOT.** Run `npm run dev`, open
`http://localhost:5173`, press BEGIN. There is no menu — title, briefing,
mission.

| | **AMMUNITION DEPOT** |
|---|---|
| Where | Compound 14, an enemy depot with a fire in it |
| Turns | 11, in five phases |
| Length | ~8 min |
| The failure you learn | The same HIGH confidence, built from almost nothing |

It puts a person on the end of the answer. The machine has to sort a room into
hostages and hostiles, and on turn 7 it gives you the same HIGH it earned on
turn 5 — for a figure it cannot actually see.

**Being seen is not a penalty, it is a different mission.** Get spotted and the
compound wakes up: a response-force clock starts, every remaining turn is run
against it, and no ending after that is a clean one. You cannot shoot your way
back to quiet.

> **Two more missions are on disk, unregistered.** `mission1.js` (DRY CREEK,
> desert, 6 turns) and `mission2.js` (BLACK CURRENT, undersea, 6 turns) are
> complete and playable; they are held back as the fallback if the depot
> breaks before the demo. Add a row to `src/data/missions.js` and either one
> works again with no other change. `Scene.js` still carries all three
> environments for the same reason — nothing was ripped out to get here.

## Which document do you want?

| You want to… | Read |
|---|---|
| **Install it and play** | this file |
| **Understand the missions** and judge the map design | `mission-walkthrough.md` — plain language, no code |
| **Check every line, option and outcome** turn by turn | `TURN-BY-TURN.md` — what the AI says, what each button does, whether it's fair |
| **Work on the code** | **`DEVELOPER-GUIDE.md`** — architecture, how to write a mission, every trap we've already hit |
| Log a bug or an idea | `suggestion-bug.md` |

Also: `team-brief.md` (the original pitch) · `development-plan.md` (build
order) · `mission-options.md` (missions 1 and 2 compared) ·
`map-rebuild-notes.md` (the undersea map: five bugs and the rebuild) ·
`audit-findings.md` · `gameplay-integration-notes.md`

> **You are on branch `3d_V2`.** It carries the 3D character models, the
> daylight desert, the split-screen layout and the whole Black Current mission.
> `main` now tracks the same commit.

---

# 1. GET IT RUNNING

## You need Node.js

Check if you already have it:

```bash
node -v
```

If you see `v18` or higher, you're fine. If you get "command not found",
install it from **https://nodejs.org** (take the LTS button) and reopen your
terminal.

## Clone, install, run

```bash
git clone https://github.com/Vatsalya2003/ghostline.git
cd ghostline
npm install
npm run dev
```

Then open **http://localhost:5173** in Chrome.

`npm install` only needs to happen once. After that it's just `npm run dev`.
Leave that terminal open — it's the server. `Ctrl+C` stops it.

## About the 3D models

The Mixamo character files live in `public/models/` and are **2.8 GB, so they
are deliberately not in git.** You will clone this repo without them, and that
is fine: `AssetLoader` falls back to the procedural geometry the game shipped
with, so everything runs and plays identically — the robots are just boxes
rather than rigged characters.

If you want the models, ask for the folder directly and drop it in
`public/models/`. Don't commit it.

## Getting the latest changes later

```bash
git pull
npm install     # only if package.json changed
npm run dev
```

## If something goes wrong

| What you see | Fix |
|---|---|
| `command not found: npm` | Node isn't installed. See above. |
| `Port 5173 is in use` | Something's already running. Vite will offer another port — use the URL it prints. |
| Page is black, nothing renders | Check the terminal for a red error. Then open Chrome DevTools (`Cmd+Opt+I`) → Console. Screenshot it into `suggestion-bug.md`. |
| No sound | Click anywhere first. Browsers block audio until you interact with the page. |
| No voice, but captions work | The Web Speech voice is a bonus, not required. Log it — don't fight it. |
| Changes not showing | Hard refresh: `Cmd+Shift+R`. |

**Use Chrome.** Safari's speech synthesis and gamepad support are both patchier,
and the demo machine will be running Chrome.

---

# 2. HOW TO PLAY

## The one idea

**Confidence is what the machine says. The cone is what it can actually see.**

Every robot projects a visible cone on the ground — that's its real sensor
coverage. The AI separately states a confidence: LOW, MED, HIGH. When a sensor
breaks, the cone shrinks and fills with static, **but the AI can still report
HIGH confidence from that broken cone.**

Your job is to notice when those two disagree.

## What's on screen

**Top bar, left to right**
- **OBJECTIVE** — standing goal, never changes
- **TURN NAME + counter** — where you are in the mission
- **SQUAD INTEGRITY** — one shared health bar for the whole squad, 100% → 0%
- **UNIT STATUS** — one chip per robot: `NOMINAL` / `SENSOR GLITCH` / `DAMAGED`
- **RECON DRONES** — how many scans you have left. You get two, they don't come back

**The squad** — three robots, each wearing its number:

| Badge | Callsign | Role |
|---|---|---|
| **1** | ALPHA | Talks to you. Relays the AI's recommendation |
| **2** | BETA-1 | **Its sensor breaks on turn 3.** This is the one to watch |
| **3** | BETA-2 | Stays healthy all mission. Your baseline for what a good cone looks like |

Badge colour = that robot's status. Cyan is healthy, amber is a broken sensor,
red is damaged. The badge, the HUD chip and the cone on the ground are all the
same colour for the same robot.

**Left panel**
- **SITUATION** — what's happening
- **YOUR CALL** — what you're actually deciding this turn, in plain English
- **MISSION LOG** — the last few entries. **FULL LOG** holds the mission and
  opens the whole transcript; `ESC` or RESUME puts you back

**Bottom**
- **COMMS** — the AI's line, typed out. The header names the unit the reading
  came *from* — `BETA-1 RELAYED VIA ALPHA` means ALPHA is repeating BETA-1's
  sensor data
- **STATED CONFIDENCE** — the segmented meter. It turns amber and reads
  `SOURCE DEGRADED` when the speaking unit's sensor is broken
- **CHOOSE ONE COMMAND** — your 3–5 options this turn

Click the comms panel to skip the typing animation.

## The commands

| Command | What it does |
|---|---|
| **CONFIRM** | Do what the AI recommended |
| **ASK WHY** | Make it explain its reasoning. **Free — doesn't use your turn.** Always worth pressing |
| **SEND DRONE** | Scan an area yourself, no risk to the squad. Only two all mission |
| **NIGHT VISION** | Extra look at the situation. Free, doesn't use your turn |
| **FIRE** / **GRENADE** | Shoot at it. Rarely the answer to a question about *information* |
| **OVERRIDE** | Take manual control and do the job yourself |
| **FALL BACK** | Withdraw |
| **ABORT** | End the mission where you stand |

Only 3–5 appear per turn.

### Controls

Mouse, keyboard and controller are all live at once — you never have to pick
one, and the on-screen prompts swap between `[ENTER]` and `[A]` the moment you
touch a different device. The same list is in the game under **PAUSE ▸ CONTROLS**.

| Action | Keyboard | Controller |
|---|---|---|
| Pick a command | `1`–`9`, or arrows to move + `ENTER` | D-pad / left stick, then **A** |
| **Rotate the view** | `Q` / `E` | **LB** / **RB** |
| Confirm / select | `ENTER` or `SPACE` | **A** |
| Cancel · skip the AI's line · back | `ESC` | **B** |
| Ask why (always available) | `X` | **X** |
| Tactical view (hold to widen) | `V` | **Y** |
| Frame previous / next unit | `SHIFT+TAB` / `TAB` | **L3** / **R3** (stick click) |
| Zoom out / in | `-` / `+` | **LT** / **RT** |
| Move camera | `W A S D` | right stick |
| Mission info | `I` | **BACK** |
| Pause | `P` | **START** |

Controller support follows the W3C Gamepad **standard mapping**, which Xbox,
DualShock, DualSense and most third-party pads report in both Chrome and
Firefox. If a pad reports a non-standard layout the game says so on screen and
**PAUSE ▸ CONTROLS ▸ REMAP CONTROLLER** walks you through rebinding it; the
mapping is saved per pad. Hot-plugging a controller mid-mission is safe.

`input-harness.html` (dev server only, not in the build) is a live pad tester:
plug a controller in, open it, and every button index and axis is shown as you
press it.

## How you're scored — this is the point

**Two separate scores that are allowed to disagree.**

1. **Mission outcome** — did the relay come up, did the squad survive
2. **Trust calibration** — did you trust the machine at the right moments

You can finish the mission and still be told your judgement was poor. That's
not a bug, that's the entire design.

Every turn-ending choice gets silently graded as one of six things:

| Grade | Means |
|---|---|
| **WELL CALIBRATED** | Your trust matched the evidence |
| **COMPLACENCY** | Took a high confidence number without checking where it came from |
| **MISUSE** | Pushed the system past what it said it could do |
| **DISUSE** | Left your own tools unused |
| **MISTRUST** | Doubted a system that had given you no reason to |
| **DISTRUST** | Overrode correct advice outright |

The debrief counts them all, names the habit to fix, and calls out turn 3 by
name if you failed it.

## Your first run — play it like this

Don't optimise. Play turn 3 honestly and see what you do.

1. **Turn 1** — three sensors agree and VERITAS names its own limit. Trusting
   a verified system is the right call here. **CONFIRM.**
2. **Turn 2** — it reports LOW and says it will not commit an entry on it.
   That is honesty. **SEND DRONE.**
3. **Turn 3** — two guards, three laps observed, paired the whole circuit.
   There is no way across that yard that does not go through them, and only
   one moment they can be taken silently. **QUIET TAKEDOWN.**
4. **Turn 5** — a closed door and no reading at all. **THERMAL SWEEP** before
   anyone opens it. Skipping this loses the hostages on turn 6.
5. **Turn 7** — the key turn. The same machine that was right about five
   people is now confident about one it cannot see. **HOLD FIRE.**

Then hit **RUN IT AGAIN** and play it badly on purpose — CONFIRM everything.
The debrief will tell you your judgement was poor. Seeing both endings is how
you understand what we're building.

### Rotating the board

`Q` and `E` snap the camera a quarter turn around whatever it is looking at.
The projection stays orthographic and the elevation stays at 45° — only the
azimuth moves. That is deliberate: the tactical read depends on the board
being drawn the same way every time, and free rotation lets a player put
themselves in a view where the game is unreadable.

Inside a building the roof lifts automatically and any wall between the camera
and a unit fades out. **Turn 7 of Ammunition Depot is decided on what you can
see in one room**, so this is the difference between a decision and a guess.

### Read the seabed, not just the panel

The map is the mission. Every feature exists because a turn needs it, and the
**drag scar physically joins the turn-2 charted position to the turn-5 resting
place.** A player who looks at the ground can read the answer before the AI
concedes the point. Follow the trunk cable and the chain — they'll take you
there.

## The mission, phase by phase

**Eleven turns in five phases.** The pattern is deliberate: a clean reading
the AI gets right and you should accept, then the same kind of reading with
something missing from it.

A player who learns "always doubt" fails the first kind. A player who learns
"always confirm" fails the second. **Neither reflex survives eleven turns.**

| Phase | Turn | What it tests | The read |
|---|---|---|---|
| **SCOUT** | 1 · Overwatch | Three sensors agree and the AI names its own limit | `CONFIRM` |
| | 2 · North wall | It reports **LOW** and refuses to commit — there's a live alarm contact back there | `SEND DRONE` |
| **SECURITY** | 3 · Patrol | Two guards, paired the whole circuit. An earned HIGH, and no clean way past | `QUIET TAKEDOWN` |
| | 4 · Half cover | A HIGH built from an outline of a man **nobody can see** | `THERMAL SWEEP` |
| **HOSTAGES** | 5 · Sense the room | A closed door. Confidence **NONE**, honestly | `THERMAL SWEEP` |
| | 6 · The door | Two armed men in the corners. Checking on the hostages first **ends the mission** | `ENTER & ENGAGE` |
| | 7 · The sixth figure ⭐ | Same HIGH, a tenth of the evidence, **a hostage behind it** | `HOLD FIRE` |
| **APPROACH** | 8 · Interference | The AI's own number swings on its own. It says so | `CROSS-CHECK` |
| | 9 · Out of scope | It **refuses to recommend** — the hostages are in the blast radius | `EVAC HOSTAGES` |
| **FINALE** | 10 · The charge | Its fuse arithmetic is right and has no fire model in it | `SHORT FUSE` |
| | 11 · Extract | It routes on distance. The short way crosses the burning fuel store | `OVERRIDE` |

**Turn 7 is the key turn.** It is the same machine that was right about six
bodies through a wall, now confident about one it cannot see. `HOLD FIRE`,
`THERMAL SWEEP` or `SEND DRONE` all work. Pressing `FIRE` kills an unarmed
civilian, and the mission says so out loud.

### Turn 5 is free and skipping it is fatal

You cannot see into the holding room. There is no window, no angle, and no
thermal through the wall from where the squad is standing. VERITAS says
**confidence NONE** and means it.

A sweep costs nothing and turns a closed door into a floor plan: six bodies,
four low and still, two upright in opposite corners carrying metal. On turn 6
that tells you the room has two armed men in it. **Without it, `CHECK
HOSTAGES` walks three machines into a room holding two guards you never knew
about, and the hostages die there.** The mission ends on turn 6.

### Nobody can be shot blind

Turn 4's contact is behind a crate stack with no angle on him from anywhere
the squad holds. There is no `FIRE` on that turn, because you cannot aim at
something nobody can see. Every option is a way of *looking* — thermal, drone,
or mark and track. The one that costs you is `ADVANCE`: crossing without
resolving him. He sees all three of you, runs, and leaves the fuel line open.

**That is where the fire starts.** It is scenery in phase 2, an honest reason
the sensors are noisy in phase 4, and a clock in phase 5. It is never the AI's
fault and the AI never lies about it — it simply has no model for how fast it
moves, because nothing gave it one.

### The alarm

Three ways to deal with an enemy you have been shown: take them quietly, go
around them, or be seen. Only the third is unrecoverable.

Raising the alarm starts a **five-turn response clock**, and the debrief will
say so: *the compound knew you were inside it from the turn it did.* You can
still finish. You cannot finish clean.

---

# 3. TESTING

## Shortcuts so you don't replay turns 1–2 forever

| URL | What it does |
|---|---|
| `http://localhost:5173/?skip=1` | Straight into turn 1, no title or briefing |
| `?deploy=1` | Straight to the briefing, skipping the title |
| `?auto=CONFIRM,SEND_DRONE,QUIET_TAKEDOWN,THERMAL_SWEEP,THERMAL_SWEEP` | Plays turns 1–5 and hands you **turn 6** |
| `?auto=CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM` | A full trust-everything run to the debrief |

`?mission=` still parses but with one mission registered it can only resolve
to that one. It is kept so bookmarked URLs and the test harnesses keep working.

**This is the judge demo:**
`?auto=CONFIRM,SEND_DRONE,QUIET_TAKEDOWN,THERMAL_SWEEP,THERMAL_SWEEP` puts **turn 6** on
screen — the hostage call — with everything before it already played out.

## Check the scoring without opening a browser

```bash
node scripts/sim.mjs CONFIRM,SEND_DRONE,SEND_DRONE,CONFIRM,OVERRIDE,FALL_BACK
```

Prints every turn, the grade, the health change and the final verdict. Fast way
to check a content change didn't break the grading.

For a real check rather than a spot check:

```bash
npm run verify   # ~4s  — walks the registered mission exhaustively
npm run e2e      # ~3m  — plays the mission in a real browser
```

`verify` asserts the things the demo rests on: every outcome reachable, all four
endings reachable, drones never negative, debrief counts matching the decisions
you made, praise only ever for a clean run, the key turn named when you fail it,
and the objective board agreeing with the ending. **Run it after any edit to a
mission file** — it catches a broken grade in seconds. It currently walks
about 6.5 million assertions over the registered mission.

> **Taking headless screenshots?** Software WebGL runs this at ~2 fps, so the
> 1.6 s mission-start curtain takes ~16 s of wall clock and the fog of war is
> still 90% down several seconds in. Force it up before capturing:
> `OP.scene.getObjectByName('fog').material.uniforms.uReveal.value = 1`.
> Two rounds of "the map is too dark" were this and nothing else.

`e2e` builds the game, serves it, and plays it in headless Chromium: a careful
run, an all-CONFIRM run and an abort, checking the HUD against game state every
turn and that replay resets cleanly.

Hooks, observations and open issues for the gameplay layer live in
**`gameplay-integration-notes.md`**.

> ⚠ **Don't judge a playthrough on `npm run dev` while someone else is editing.**
> Vite reloads the page mid-run and the mission silently restarts at turn 1.
> Use `npm run build && npm run preview` for hand-testing.

## What to actually look for

The checklist lives in **`suggestion-bug.md`** — run through it and tick it off.
The things that matter most:

- Can you tell the broken cone from the healthy ones **from two metres back?**
- Does turn 3 make you hesitate before choosing?
- Does a bad run still get told it was a bad run?

## Found something? Log it

Open **`suggestion-bug.md`**, add a row to the QUICK LOG table. One line is
enough. Severity: **P0** breaks the demo, **P1** hurts, **P2** is polish.

```bash
git add suggestion-bug.md
git commit -m "log: <what you found>"
git push
```

---

# 4. CHANGING THINGS

## Writing and tuning — no code needed

**Everything the player reads or is graded on lives in `src/data/`:**
`mission3.js` (Ammunition Depot) is the shipped one; `mission1.js` and
`mission2.js` are the unregistered fallbacks; `missions.js` is the registry.

Dialogue, confidence values, what each action does, how much damage it costs,
the grade it earns, the debrief copy. Open it, change a string, save — the page
reloads itself.

A single outcome looks like this:

```js
CONFIRM: {
  tag: CALIBRATION.COMPLACENCY,   // the grade this earns
  healthDelta: -35,               // squad integrity cost
  log: 'Squad enters. Two hostiles engage from BETA-1\'s blind arc.',
  response: 'Entering — CONTACT. CONTACT.',   // what the AI says after
  fx: 'ambush',
  note: 'The number was HIGH. The source was broken. You read the number.',
}
```

If you're on writing or design, this file is your whole surface area. You can
work in it while someone else works in `/src` without colliding.

**A second mission is a copy of this file**, not an engineering task — that's
exactly how Black Current was built. A mission declares its own
`environment: 'undersea'`, and the renderer picks the seabed instead of the
desert. Nothing in `/systems` changed to add it.

## Where the code lives

```
src/data/              ALL mission content — mission1/2/3 + the registry
src/systems/           TurnManager, GameState, Director, Input, Audio
src/render/            Scene, Camera, Units, SensorCones, FogOfWar, FX
  Terrain.js + Level.js         'day'      — the desert
  Seabed.js  + SeabedLevel.js   'undersea' — Test Range 9
  Depot.js   + DepotLevel.js    'depot'    — Compound 14
  AssetLoader.js                GLB loading, with procedural fallback
src/ui/                CommsPanel, CommandBar, StatusHUD, MissionLog, Debrief
src/style/main.css     HUD, palette, scanlines, the 70/30 split layout
scripts/               sim, verify, e2e, voice baking
```

**The rule:** nothing in `/systems`, `/render` or `/ui` hardcodes mission
content. If you find yourself typing dialogue into a `.js` file outside
`/data`, stop.

**Full architecture, the turn flow, how to write a mission, and the traps that
have already caught someone → `DEVELOPER-GUIDE.md`.**

## Palette

```
--bg:    #0a0d0a   near-black      --red:   #e0524c   damage, hostiles
--cyan:  #4ce0d8   healthy         --dim:   #4a5a52   secondary text
--amber: #e0a84c   sensor glitch, warnings
```

Sharp corners, 1px borders, monospace, uppercase labels. All copy in-fiction —
`MISSION COMPLETE`, never `Success!`.

---

# 5. DELIBERATE CHOICES

Worth knowing before you "fix" one of these:

- **Runs fully offline.** No CDN, no backend, no paid API. Venue wifi is not a
  dependency. Don't add a CDN link.
- **No randomness anywhere.** Particle spread, camera shake and sensor static
  are all seeded or index-derived, so the demo plays identically every time.
  Don't add `Math.random()`.
- **Every prop, terrain and effect is procedural geometry** — no downloaded
  meshes, nothing to license, no scale fights. The only exception is the
  rigged characters on this branch, which are Mixamo FBX and kept out of git
  (see above). If they're absent the procedural chassis takes over.
- **The seabed is authored warm and the water takes the colour away**, not the
  other way round. A grey floor under a green tint reads as a desert with a
  filter on it. Colour arrives with the survey lights parented to the fleet,
  which is also why **lit == known** — the same idea as the sensor cones.
- **SFX are synthesised with Web Audio**, not sample files. Howler is installed;
  if CC0 samples land in `/public/audio`, replace the method bodies in
  `src/systems/Audio.js`.
- **System monospace font**, not a webfont — nothing to ship, nothing to fetch.
- **`OVERRIDE` is an added command verb** beyond the team brief's action list.
  Turn 5 needs a way for the commander to do the job the AI declined.
