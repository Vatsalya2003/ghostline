# GHOSTLINE — DEVELOPER GUIDE

Everything you need to work on this codebase. If you only want to *play* it,
read `README.md` instead; if you want to understand the missions as a player,
read `mission-walkthrough.md`.

**Team:** GHOSTLINE · Defense Tech Jam, Seattle · NAWCTSD
*"Trust Your Synthetic Teammates"*

---

# 1. WHAT THIS IS

A turn-based game about **trust calibration** — knowing when an AI teammate
has earned your belief and when it hasn't. You command three robots you can
never see directly. An AI reads their sensors and tells you what it thinks,
with a stated confidence. Sometimes that confidence is earned. Sometimes it
is a number produced from almost nothing.

**The design rule everything else follows:**

> Confidence is what the machine *says*. The cone on the ground is what it can
> actually *see*. When they disagree, believe the cone.

You are scored twice — mission outcome and trust calibration — and the two are
allowed to disagree. Completing the mission while being told your judgement was
poor is a designed outcome, not a bug.

## The missions

| | Environment | Turns | Registered |
|---|---|---|---|
| **AMMUNITION DEPOT** | `depot` — enemy compound, on fire | 10 | **yes — the only one** |
| **DRY CREEK** | `day` — desert relay station | 6 | no — fallback |
| **BLACK CURRENT** | `undersea` — test range at 240 m | 6 | no — fallback |

The player-facing build ships **one** mission and has no select screen: title,
briefing, mission. One fewer thing to get wrong in front of a judge.

Dry Creek and Black Current are complete, playable and left on disk on
purpose. Add a row to `src/data/missions.js` and either one works again with
no other change — `Scene.js` still carries all three `environment` branches,
and none of them were removed to get here. Only `'depot'` is reachable today.

Everything downstream follows the registry: `verify` walks whatever is
registered, `sim` runs the default, and `e2e` derives its turn count, drone
count and key turn from the mission rather than hardcoding them.

---

# 2. GETTING SET UP

```bash
git clone https://github.com/Vatsalya2003/ghostline.git
cd ghostline
npm install
npm run dev          # http://localhost:5173
```

Node 18+. **No backend, no CDN, no API keys** — it runs entirely offline, which
is deliberate (venue wifi is not a dependency).

## Dependencies — all three of them

| Package | Used for |
|---|---|
| `three` 0.186 | All rendering |
| `gsap` 3.15 | Every tween and the beat timing |
| `howler` 2.2.4 | Installed, currently unused — SFX are synthesised |

Dev dependency: `vite` 6.4. That is the entire tree.

## The 2.8 GB you won't get

`public/models/` holds Mixamo character FBX files. They are **gitignored** —
you will clone without them and the game runs fine, because `AssetLoader` falls
back to the procedural chassis. Ask for the folder directly if you want them.
**Never commit it.**

## npm scripts

| Command | What it does | Runtime |
|---|---|---|
| `npm run dev` | Vite dev server with hot reload | — |
| `npm run build` | Production bundle to `dist/` | ~12 s |
| `npm run preview` | Serve the built bundle | — |
| `npm run verify` | Walks both registered missions | ~4 s |
| `npm run sim` | Headless run of one command list | instant |
| `npm run e2e` | Plays missions in headless Chromium | ~2 min |
| `npm test` | Input/gamepad mapping tests | ~1 s |
| `npm run audio` | Checks the audio manifest | ~1 s |

---

# 3. ARCHITECTURE

## The one rule

> **Nothing in `/systems`, `/render` or `/ui` may hardcode mission content.**

No dialogue, no confidence values, no outcomes, no grades. If you find
yourself typing a line of dialogue into a file outside `src/data/`, stop — you
are about to break the thing that makes a new mission a content file rather
than an engineering project.

Black Current and Ammunition Depot were both added without touching the turn
spine. That is the promise the architecture makes, and it is worth keeping.

## Layout

```
src/
  data/                 ALL mission content
    mission1.js         Dry Creek     + the shared CALIBRATION / ACTION_LABELS
    mission2.js         Black Current (unregistered fallback)
    mission3.js         Ammunition Depot
    depot-layout.js     Compound 14's zones, walls, paths — every coordinate
    missions.js         registry + the ?mission= switch

  systems/              the spine — no THREE.js in here
    TurnManager.js      turn flow, action availability, outcome resolution
    GameState.js        health, drones, statuses, grades, objectives
    Director.js         turns an outcome into a sequence of camera/FX beats
    Events.js           typed event bus (GAME_EVENT)
    Input.js            keyboard/mouse/pad, context stack
    Gamepad.js          W3C standard mapping + per-pad remap
    Pause.js            the single paused flag the beat timers wait on
    Audio.js            Web Audio synthesis — no sample files
    Soundscape.js       ambient beds, footsteps, stereo placement
    Dialogue.js         the speaking layer
    Voice.js            baked Opus clips, Web Speech as fallback

  render/               everything THREE.js
    Scene.js            renderer, lights, fog — branches on environment
    Camera.js           orthographic rig; one writer, per-frame
    Units.js            the three robots, cones, badges, animation
    SensorCones.js      the signature visual — shader wedges
    FogOfWar.js         three-tier visibility, drapes over terrain
    FX.js / CombatFX.js explosions, tracers, scans, hit flashes
    Drone.js            the recon aircraft
    AssetLoader.js      GLB loading, caching, procedural fallback
    Materials.js        shared material helpers
    Sky.js              gradient dome
    UnitMarkers.js      selection rings
    ObjectiveMarkers.js objectives as places on the board

    Terrain.js + Level.js           'day'      — the desert
    Seabed.js  + SeabedLevel.js     'undersea' — Test Range 9
    Depot.js   + DepotLevel.js      'depot'    — Compound 14
    Occlusion.js                    roofs lift, walls fade, so you can see in

  ui/                   DOM only, no canvas
    CommsPanel.js       the AI's line, typed out
    CommandBar.js       the 3–5 choices
    StatusHUD.js        health, units, drones, objectives
    MissionLog.js       the transcript
    PauseMenu.js        pause / intel / controls / remap / log panes
    Debrief.js          both scores
    Screens.js          title, briefing
    ScreenFX.js         scanlines, flashes, damage vignette
    Prompts.js          input glyphs that swap device
    Focus.js            focus ring shared by every menu
```

## How a turn actually flows

```
player presses a key
        ↓
Input          resolves it to an action in the current context
        ↓
main.handleAction
        ↓
TurnManager.choose(action)
        │   is it available? is it a probe (free) or committing?
        │   resolve variants (altIfHealthAbove / unless / …)
        │   apply healthDelta, flags, drone spend, statuses
        │   record the calibration grade
        ↓
Director.playOutcome(resolution)
        │   weapon FX → camera → unit animation → impact → moves
        ↓
GameState + Events  →  UI updates, Soundscape reacts
        ↓
TurnManager.advanceTurn()  →  next turn, or endMission()
```

**`Director` is the only thing that knows how a beat *looks*.** `TurnManager`
never touches the camera; `Director` never decides a grade.

---

# 4. WRITING A MISSION

This is the part most contributors need. **You do not need to write code.**

## The mission object

```js
export const missionN = {
  id: 'mission-n',
  title: 'GHOSTLINE',
  subtitle: 'OPERATION … — …',
  objective: 'THE STANDING GOAL',

  environment: 'day' | 'undersea' | 'depot',

  objectives: [
    { id: 'thing', label: 'DO THE THING', flag: 'thingDone' },
    { id: 'home',  label: 'BRING THEM HOME', survive: true },
  ],

  keyTurn: 3,                 // named in the debrief if failed
  keyTurnVerdict: '…',

  briefing: ['…', '…'],       // one string per briefing line
  drones: 2,
  startHealth: 100,

  turns: [ /* see below */ ],

  verdicts: { calibrated: '…', complacency: '…', /* all six */ },
  failureModeCopy: { calibrated: { name: '…', desc: '…' }, /* all six */ },
};
```

Register it in `src/data/missions.js` — one row — and it is playable at
`?mission=your-id`.

## A turn

```js
{
  id: 3,
  name: 'BREACH',
  phase: 'SECURITY',            // optional, for grouped missions
  situation: 'What is happening.',
  task: 'What you are deciding, in plain English.',
  objectiveNote: 'Why this turn matters to the objective.',
  camera: { x: 2, z: -1, zoom: 14 },
  statuses: { ALPHA: 'healthy', 'BETA-1': 'glitch', 'BETA-2': 'healthy' },
  telemetry: { depth: '241 m', contact: null },   // free-form, shown in HUD

  intro: [                      // played before the AI speaks
    { type: 'pan', x: 2, z: -1, zoom: 14, duration: 1.1 },
    { type: 'status', unit: 'BETA-1', status: 'glitch' },
    { type: 'log', text: 'SENSOR DEGRADED' },
  ],

  ai: {
    unit: 'ALPHA',
    via: 'BETA-1',              // optional: "BETA-1 RELAYED VIA ALPHA"
    line: 'What it says.',
    confidence: 'HIGH',         // NONE | LOW | MED | HIGH
    truth: 'What is actually true. Never shown — it is the design check.',
  },

  actions: ['CONFIRM', 'ASK_WHY', 'SEND_DRONE', 'FALL_BACK'],
  outcomes: { /* one per action */ },
}
```

### `intro` beat types

`pan` · `log` · `wait` · `move` · `face` · `alert` · `breach` · `shake` ·
`impact` · `status`

### An outcome

```js
CONFIRM: {
  tag: CALIBRATION.COMPLACENCY,   // the grade this earns
  healthDelta: -35,
  log: 'What the mission log records.',
  response: 'What the AI says afterwards.',
  fx: 'ambush',
  impactUnit: 'BETA-1',
  note: 'The debrief explanation. Write this one carefully.',

  // optional
  consumesTurn: false,            // a free probe — ASK WHY, NIGHT VISION
  consumesDrone: true,
  setsFlag: 'relayOnline',        // string, or an array of strings
  lostUnit: 'BETA-2',             // falls and stays down
  moves: { ALPHA: [4, -1], 'BETA-1': [2.5, -2] },   // ⚠ a MAP, not an array
  urgent: true,                   // units Run instead of Walk
  reveal: { x: 7, z: -1 },        // where a drone sweep goes
  endsMission: true,
  altIfHealthAbove: { threshold: 88, tag: …, healthDelta: …, … },
}
```

### `fx` values

`none` · `move` · `scan` · `impact` · `ambush` · `alarm` · `relay` ·
`nightvision`

### Zones and traversal (Ammunition Depot)

Turns name a **zone**; `src/data/depot-layout.js` owns every coordinate. A
turn spreads `...at('HOLDING')` and gets its camera anchor and zoom from the
layout, so re-laying the map cannot leave a turn pointing at a place that no
longer exists.

Squad movement between zones goes on the **turn**, not the outcome:

```js
advance: travel('YARD', 'HOLDING'),   // authored waypoints + formation
```

Whichever command the player picks, the squad still has to be wherever the
next turn happens. Putting it on outcomes means remembering it on all four of
them — and forgetting one leaves the squad standing in the yard while the
camera visits rooms they are not in.

**Contact markers (`alert`) and drone targets (`reveal`) are raw coordinates**
and do not come from the layout. If you move the map, grep for them.

## Traps that have already caught someone

1. **`moves` is a map, not an array.** `{ ALPHA: [x, z] }`, not
   `[{ unit, x, z }]`. The array form throws inside `Director.moveSquad` and
   the only symptom is that the squad never moves.
2. **Free actions need `consumesTurn: false`.** Without it, ASK WHY ends the
   turn.
3. **Every action in `actions` needs an entry in `outcomes`**, and vice versa.
   `verify` catches this for mission 1 only.
4. **An objective `flag` must actually be set** by some outcome's `setsFlag`,
   or the objective can never complete.
5. **`endsMission` names the ending** — `'aborted'`, not `true`. `true` gets
   written straight into `state.outcome` and the debrief reads it.
6. **The last turn must not set `endsMission`.** `advanceTurn` ends the
   mission on its own and picks complete vs partial from the objectives;
   declaring it short-circuits that.
7. **Every flagged objective must be met for MISSION COMPLETE.** If your
   mission has two, both count.

## Design principles that make a mission *good*

These are not style preferences — they are what makes the mechanic teach.

- **Write the truth down first.** Every mission file has a header block
  stating what is actually true. Every turn is then checked against it. If you
  cannot state the truth in one paragraph, the mission has no spine.
- **The AI must be right sometimes, and right for good reasons.** A mission
  where the machine is always wrong teaches "never trust it", which is not
  calibration — it is just a different reflex. Turn 1 of every mission rewards
  trust.
- **Make the AI's failures honest.** The best turns are ones where the
  recommendation is *technically defensible* and *incomplete*. "The sensor
  broke" is the easy version; "the arithmetic is right and one input is
  missing" is the real one.
- **Every free check should be worth pressing.** ASK WHY should, on the key
  turn, contain the whole answer. Most players will not press it. That is the
  lesson.
- **The `note` is the actual teaching.** It is the only place the game
  explains itself. Write it last, write it honestly, and do not let it gloat.

---

# 5. THE RENDERING SIDE

## Camera

Orthographic, 45° elevation, **rotatable azimuth**, fixed 40 units back.
`rotateView(±1)` snaps a quarter turn in 0.4s; the projection and elevation
never change, because the tactical read depends on the board being drawn the
same way every time. Anything that needs to know which way the screen points
must call `cameraBasis()` — screen-right is only `+x,−z` at the default
azimuth.

**One writer:**
everything (pans, zooms, shake, punch) sets *targets* on `camera.userData` and
`updateCamera()` is the only thing that touches the transform, once per frame.
Before that rule existed, a pan tween and a shake loop fought each other on
every impact.

Screen-right is `+x, −z`. A world feature running along `x = z` projects as a
**vertical** line on screen — worth knowing before you conclude a diagonal
stripe is a rendering bug.

## Sensor cones

Flat shader wedges on the ground, **not SpotLights** — no shadow maps, no
tuning, identical every run. `uv.x` is normalised radius, `uv.y` is angle.
Identity lives on the outline (ALPHA solid, BETA-1 dashed, BETA-2 double) so
the fill colour stays free to carry status.

## Environments

`createScene({ environment })` branches to the right ground, and `main.js`
picks the matching level. A level must return:

```js
{ group, door, tower, beacon, generator, relayConsole }
```

Roles get re-cast per mission — undersea has no door, so it returns a
placeholder; the depot's `tower` is the ammunition bunker and `beacon` is the
charge indicator, so turn 10's `relay` FX *is* the detonation.

## Things that bit us, so you don't repeat them

- **A flat-laid `PlaneGeometry` maps local +y to world −z.** Sampling a height
  field at the raw local y builds the whole map **mirrored**. Symptom: props
  placed by the height function sit at heights the ground does not have. This
  put Black Current's central prop 2.7 m underground. Always sample
  `height(x, -localY)`.
- **The shadow camera must enclose everything the camera can see.** Outside
  it, ground samples the clamped edge of the shadow map and goes black. It
  looks like missing geometry or a stamped lit diamond, not like a lighting
  bug. It has now caused this twice.
- **Fog near/far are relative to the camera's fixed 40-unit distance.** Fog
  starting before 40 puts haze on *the subject* and greys the whole board.
  Mission 1 looks vivid because it fogs at 46–230.
- **Geometry can only hold detail coarser than its segment size.** A 200 m
  plane at 300 segments samples every 0.67 m; anything finer aliases into long
  smooth swells. Put fine detail in the texture or the shader.
- **Distance-to-a-line-segment has parallel iso-contours.** A trench cut
  straight from one comes out as a geometric capsule. Warp the distance field.
- **GLSL has no shadowing.** Two `float outline` declarations in one scope
  means the shader silently fails to compile and the visual just vanishes,
  with only a console warning. Check the console after shader edits.
- **An orthographic camera translated parallel to itself keeps its
  direction**, so one `lookAt` at construction is enough — right up until the
  view can rotate. Then the rig moves to the new azimuth and goes on facing
  the old one, and the board leaves the screen. `applyCameraTransform` re-aims
  every frame.
- **A material shared across meshes fades all of them.** Occlusion clones one
  material per wall *run*: shared fades the whole building, per-panel pops a
  hole in a wall.
- **Box geometry is long on local +x**, so aligning a run of panels to a line
  needs `atan2(-dz, dx)`.

---

# 6. TESTING

## The verification loop that works here

1. `npm run verify` — the turn spine, in two seconds
2. `node scripts/sim.mjs CONFIRM,SEND_DRONE,…` — one path, with grades
3. Headless Chromium screenshot — **look at the picture**
4. `npm run e2e` — full missions in a real browser

## URL shortcuts

| URL | What |
|---|---|
| `?skip=1` | Straight into turn 1 |
| `?auto=CONFIRM,SEND_DRONE` | Plays those turns, hands back control |
| `?mission=black-current` | Pick a mission (`dry-creek`/`black-current`/`ammo-depot`, or `1`/`2`/`3`) |
| `?ui=pause\|intel\|controls` | Open an overlay directly |

`window.OP` exposes `state`, `turnManager`, `director`, `squad`, `camera`,
`scene`, `fog`, `fx`, `input`, `pauseMenu`, `audio`.

## Headless screenshots — read this first

Software WebGL runs this at **~2 fps**. The 1.6 s mission-start fog curtain
therefore takes ~16 seconds of wall clock, and screenshots taken a few seconds
in show a board that is 90% black. Force it:

```js
OP.scene.getObjectByName('fog').material.uniforms.uReveal.value = 1;
```

Two separate rounds of "the map is too dark" were this and nothing else.

Chrome on macOS needs:
```bash
GHOSTLINE_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## How verify scales

Full enumeration is exponential in turn count — six turns is 1,344 paths, ten
is about a quarter of a million. So enumeration takes a budget (40,000 paths,
`GHOSTLINE_PATHS` to change it) and **coverage is guaranteed separately** by
walking one targeted path per outcome. Every outcome, ending and grade is
still genuinely proven reachable rather than sampled.

Currently ~6.4M assertions across both registered missions in about four
seconds.

---

# 7. AUDIO AND VOICE

- **SFX are synthesised with Web Audio.** No sample files. Howler is installed
  but unused; if CC0 samples land in `/public/audio`, replace the method
  bodies in `src/systems/Audio.js`.
- **Voice is baked** to Ogg Opus in `/public/voice` (38 clips, mission 1 only)
  and looked up by exact line text. Web Speech is the fallback.
  `scripts/build-voice.mjs` needs `piper` and `ffmpeg` — build-time only.
- **Missions 2 and 3 are not baked.** They run on captions and TTS.

---

# 8. DELIBERATE CHOICES

Worth knowing before you "fix" one:

- **Runs fully offline.** Don't add a CDN link.
- **No `Math.random()` anywhere in the render path.** Particle spread, camera
  shake and sensor static are seeded or index-derived so a rehearsed demo plays
  back identically. Use the `rand(n)` hash helpers.
- **Procedural geometry everywhere** except the rigged characters.
- **System monospace font**, not a webfont.
- **Sharp corners, 1px borders, uppercase labels.** All copy in-fiction —
  `MISSION COMPLETE`, never `Success!`.
- **The seabed is authored warm and the water takes the colour away.** A grey
  floor under a green tint reads as a desert with a filter on it.

## Palette

```
--bg:    #0a0d0a   near-black      --red:   #e0524c   damage, hostiles
--cyan:  #4ce0d8   healthy         --dim:   #4a5a52   secondary text
--amber: #e0a84c   sensor glitch, warnings
```

---

# 9. CONTRIBUTING

**Branches.** `main` is the older simple build. `3d_V2` carries the 3D models,
all three missions and the current environments. Work from `3d_V2`.

**Before you push:**
```bash
npm run verify && npm run build
```
Plus: play the mission you touched.

**Log findings** in `suggestion-bug.md` — P0 breaks the demo, P1 hurts, P2 is
polish.

## Where to start

| If you want to… | Go to |
|---|---|
| Write dialogue or tune the mission | `src/data/mission3.js` — nothing else |
| Bring back Dry Creek or Black Current | One row in `src/data/missions.js` |
| Add a mission | Copy a data file, add a registry row |
| Work on a map | `Depot.js` / `Seabed.js` / `Terrain.js` + their Level files |
| Improve the HUD | `src/ui/` and `src/style/main.css` |
| **Highest value right now** | Bake mission 3's voice once `piper` is available |

## Other documents

| File | What's in it |
|---|---|
| `README.md` | Install, play, test |
| `mission-walkthrough.md` | All three missions in plain language + map evaluation |
| `mission-options.md` | Mission 1 vs 2 design comparison |
| `map-rebuild-notes.md` | The undersea map: five bugs and the rebuild |
| `team-brief.md` | The original pitch |
| `development-plan.md` | Original build order |
| `suggestion-bug.md` | Bug log |
| `audit-findings.md` | Code audit |
| `gameplay-integration-notes.md` | Hooks for the gameplay layer |
