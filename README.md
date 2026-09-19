# GHOSTLINE

A six-turn tactical game about **when to trust an AI teammate.**

You're a commander at a base. Your squad is three robots. You see the world only
through their sensors. Each turn the squad AI tells you what it recommends and
how confident it is — but sensors break, and a broken sensor still sounds
confident.

**Design docs:** `team-brief.md` (what we're making) · `development-plan.md`
(build order) · `suggestion-bug.md` (bugs and ideas — log yours here)

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
| Confirm / select | `ENTER` or `SPACE` | **A** |
| Cancel · skip the AI's line · back | `ESC` | **B** |
| Ask why (always available) | `X` | **X** |
| Tactical view (hold to widen) | `V` | **Y** |
| Frame previous / next unit | `SHIFT+TAB` / `TAB` | **LB** / **RB** |
| Zoom out / in | `Q` / `E` | **LT** / **RT** |
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

1. **Turn 1** — sensors are clean, the route is clear, confidence is HIGH.
   Trusting a verified system is the right call here.
2. **Turn 2** — the AI says *"I cannot resolve this."* That's honesty. Use it.
3. **Turn 3** — a breach charge goes off. Watch BETA-1's cone come apart.
   Then read what BETA-1 reports and how confident it is. **Decide.**
4. **Turns 4–6** — honest uncertainty, a task outside the AI's scope, and good
   advice that doesn't account for your damaged squad.

Then hit **RUN IT AGAIN** and play it badly on purpose — CONFIRM everything.
You'll survive and the debrief will tell you your judgement was poor. Seeing
both endings is how you understand what we're building.

---

# 3. TESTING

## Shortcuts so you don't replay turns 1–2 forever

| URL | What it does |
|---|---|
| `http://localhost:5173/?skip=1` | Straight into turn 1, no title or briefing |
| `http://localhost:5173/?auto=CONFIRM,SEND_DRONE` | Plays those two turns automatically, hands control back at **turn 3** |
| `http://localhost:5173/?auto=CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM,CONFIRM` | Plays a full bad run to the debrief |

**This is also the judge demo:** `?auto=CONFIRM,SEND_DRONE` puts turn 3 on
screen with the breach already played out.

## Check the scoring without opening a browser

```bash
node scripts/sim.mjs CONFIRM,SEND_DRONE,SEND_DRONE,CONFIRM,OVERRIDE,FALL_BACK
```

Prints every turn, the grade, the health change and the final verdict. Fast way
to check a content change didn't break the grading.

For a real check rather than a spot check:

```bash
npm run verify   # ~2s  — walks all 1344 paths through the mission
npm run e2e      # ~2m  — plays full missions in a real browser
```

`verify` asserts the things the demo rests on: every outcome reachable, all four
endings reachable, drones never negative, debrief counts matching the decisions
you made, praise only ever for a clean run, turn 3 named when you fail it, and
the objective board agreeing with the ending. **Run it after any edit to
`mission1.js`** — it catches a broken grade in two seconds.

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

**Everything the player reads or is graded on lives in one file:**
`src/data/mission1.js`

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

**A second mission is a copy of this file**, not an engineering task.

## Where the code lives

```
src/data/mission1.js   ALL content — dialogue, confidence, outcomes, grades
src/systems/           TurnManager, GameState, Director, Dialogue, Audio, Input
src/render/            Scene, Camera, Units, SensorCones, FogOfWar, Level, FX
src/ui/                CommsPanel, CommandBar, StatusHUD, MissionLog, Debrief
src/style/main.css     HUD, palette, scanlines
scripts/sim.mjs        headless mission runner
```

**The rule:** nothing in `/systems`, `/render` or `/ui` hardcodes mission
content. If you find yourself typing dialogue into a `.js` file outside
`/data`, stop.

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
- **Robots and props are procedural geometry**, not downloaded models — nothing
  to license, no scale fights. Swap in models later via `buildChassis()` in
  `src/render/Units.js`.
- **SFX are synthesised with Web Audio**, not sample files. Howler is installed;
  if CC0 samples land in `/public/audio`, replace the method bodies in
  `src/systems/Audio.js`.
- **System monospace font**, not a webfont — nothing to ship, nothing to fetch.
- **`OVERRIDE` is an added command verb** beyond the team brief's action list.
  Turn 5 needs a way for the commander to do the job the AI declined.
