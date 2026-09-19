# GHOSTLINE — 3D TECH STACK
### Locked for the 3D path. Hand to Claude Code.

---

## THE STACK

| Layer | Choice | Install |
|---|---|---|
| **3D engine** | **Three.js** | `npm i three` |
| **Build tool** | **Vite** | `npm i -D vite` |
| **Language** | Vanilla JS, ES modules | — |
| **Animation** | **GSAP** — unit movement, camera pans, meter fills | `npm i gsap` |
| **Audio** | **Howler.js** | `npm i howler` |
| **Voice** | **Web Speech API** (`speechSynthesis`) | built into browser |
| **Controller** | **Gamepad API** | built into browser |
| **UI overlay** | HTML + CSS on top of the canvas | — |
| **3D models** | **Kenney CC0 GLTF kits** | free download |

That's four npm packages total. Nothing else.

```bash
npm i three gsap howler
npm i -D vite
```

---

## WHY EACH

**Three.js** — the standard for 3D on the web. drift.io is built on it.
Massive amount of training data, so Claude Code writes it well. No engine
install, no build step beyond Vite.

**GSAP over Three's own animation system** — Three's AnimationMixer is built
for skeletal animation from model files. You're tweening positions and
camera targets, which GSAP does in one line and debugs easily.

**Howler over raw Web Audio** — Web Audio is powerful and verbose. Howler
plays a sound in one line. In a jam, take the one-liner.

**Web Speech API over recorded voice** — free, on-device, zero setup, works
offline. Lower the pitch and it sounds appropriately synthetic, which fits
a robot AI better than a human read would.

**HTML overlay over in-canvas UI** — building the comms panel, confidence
meter, and command bar inside Three.js is painful. As HTML positioned over
the canvas, it's just CSS. This is how most browser games do UI.

---

## RENDERING APPROACH

These choices matter more than the library list — they're what make it look
intentional and keep it fast to build.

**Orthographic camera, ~45° tilt.**
Tactical diorama framing. Reads as a command display, hides modelling
weakness, and eliminates the entire "camera clipped inside a wall" class of
bug. Do not use a perspective camera.

**Low-poly flat-shaded.**
`MeshLambertMaterial` or `MeshStandardMaterial` with flat colors. No
textures on units, no PBR maps, no normal maps. This is the drift.io look
and it is *faster* to build than realism, not slower.

**Lighting: one directional + low ambient.**
One `DirectionalLight` with shadows enabled, plus a dim `AmbientLight` so
shadows aren't black. That's the whole lighting rig. Resist adding more.

**Sensor cones: flat mesh on the ground, NOT a spotlight.**
A thin wedge mesh laid flat at `y = 0.01`, semi-transparent, additive
blending. It is the 2D solution drawn in 3D space — cheap, predictable, no
shadow-map tuning. **Try this first.** SpotLight looks slightly better but
needs shadow maps to be blocked by walls, and that's a known time sink.

**Fog of war: a dark transparent plane over the ground**, with cone meshes
rendered above it. Simple, and it reads correctly.

**Post-processing: skip it.** No bloom, no SSAO, no color grading. Get a
scanline overlay with a CSS pseudo-element on the HTML layer instead —
same effect, none of the cost.

---

## ASSETS

**Kenney.nl, all CC0** — public domain, no attribution, free:
- **Space Kit** — robots, crates, sci-fi props
- **Platformer Kit** or **Blocky Characters** — walls and structures
- **Prototype Textures** — grid textures for the ground

Format: **GLTF/GLB**. Three.js loads these natively via `GLTFLoader`.

**Fonts:** Share Tech Mono (or similar mono), downloaded as `.ttf` and
self-hosted. Never a Google Fonts CDN link.

**Audio:** Kenney Interface Sounds, Sci-Fi Sounds, Impact Sounds.

⚠ **Timebox asset browsing to 30 minutes.** Easiest way to lose two hours
feeling productive.

---

## HARD CONSTRAINTS

- **Everything bundled locally.** No CDN at runtime. The game must run with
  wifi off.
- **No paid APIs.** The brief says functional AI agents aren't required.
- **No backend.** Static files only.
- **Deterministic.** No randomness in outcomes — the demo must be
  rehearsable.

---

## FOLDER STRUCTURE

```
ghostline/
├── index.html
├── vite.config.js
├── package.json
├── /public
│   ├── /models        .glb files from Kenney
│   ├── /audio         .mp3 SFX
│   └── /fonts         .ttf
└── /src
    ├── main.js              boot, scene setup, render loop
    ├── /render
    │   ├── Scene.js         renderer, lights, ground plane
    │   ├── Camera.js        orthographic rig + pan/shake
    │   ├── Units.js         load models, place, move
    │   ├── SensorCones.js   ⚠ the signature visual — build first
    │   ├── FogOfWar.js      dark overlay plane
    │   └── FX.js            particles, hit flashes
    ├── /systems
    │   ├── TurnManager.js   drives the 6 turns
    │   ├── GameState.js     health, unit status, calibration record
    │   ├── Dialogue.js      TTS + typewriter captions
    │   ├── Input.js         mouse + gamepad, both always active
    │   └── Audio.js         Howler wrapper
    ├── /ui
    │   ├── CommsPanel.js    AI line, confidence meter
    │   ├── CommandBar.js    contextual buttons
    │   ├── StatusHUD.js     health, turn counter
    │   ├── MissionLog.js    scrolling transcript
    │   └── Debrief.js       calibration report
    ├── /data
    │   └── mission1.js      ALL content as pure data
    └── /style
        └── main.css         HUD, palette, scanlines
```

**The rule that matters:** `/data/mission1.js` holds every line of
dialogue, confidence value, outcome, and grade. Nothing hardcoded in
`/systems` or `/ui`. That makes new missions content work, not engineering,
and lets two people work without collisions.

---

## PALETTE

```css
--bg:    #0a0d0a   /* near-black, not pure black */
--cyan:  #4ce0d8   /* healthy units, normal state */
--amber: #e0a84c   /* sensor glitch, warnings */
--red:   #e0524c   /* damage, danger */
--dim:   #4a5a52   /* secondary text, grid lines */
```

Sharp corners, thin 1px borders, glow via additive blending. No soft
shadows, no rounded pills, no purple/blue gradients. Monospace, uppercase
labels. All copy in-fiction — "MISSION COMPLETE", never "Success!".

---

## BUILD ORDER — STRICT

1. Vite + Three scene, orthographic camera, ground plane, three box
   placeholders
2. **Sensor cones** — one clean, one visibly degraded ⚠ *highest risk, do
   this before anything else*
3. Fog of war overlay
4. Swap boxes for Kenney robot models
5. Unit movement + camera pan
6. Turn manager reading `mission1.js`
7. Comms panel — TTS + captions + confidence meter
8. Command bar
9. Debrief screen
10. Mouse input, then gamepad
11. Audio and FX polish

**Do not build steps out of order.** A working ugly game beats a beautiful
broken one, every time.

**Tag a demo build** the moment one turn plays end to end. Even rough.

---

## FIRST PROMPT FOR CLAUDE CODE

> Set up a Vite vanilla-JS project with Three.js.
>
> Create a scene with:
> - Dark background (#0a0d0a)
> - A 20x20 flat ground plane with a subtle grid texture
> - An **orthographic** camera tilted ~45° looking down, tactical diorama
>   framing
> - One DirectionalLight with shadows + a dim AmbientLight
> - Three box placeholders on the plane as stand-in robots: two cyan
>   (#4ce0d8), one amber (#e0a84c)
> - OrbitControls temporarily, so I can check framing
>
> Then, the important part — add two **sensor cones**: flat semi-transparent
> wedge meshes lying on the ground at y=0.01, additive blending, extending
> from two of the robots.
>
> Make one cone **clean**: long, steady, cyan.
> Make the other **degraded**: half the length, flickering opacity, amber,
> with visible noise or broken edges.
>
> The difference between the two must be obvious at a glance from across a
> room. This is the game's signature visual.
>
> Don't add game logic, models, or UI yet.
