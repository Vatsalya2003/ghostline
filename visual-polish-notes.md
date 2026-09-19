# GHOSTLINE — VISUAL POLISH, FX & CAMERA

Notes from the visual-polish pass. What changed, what it costs, what is still
open, and three things found along the way that belong to other people.

---

## 1. WHAT CHANGED

### Camera — `src/render/Camera.js`
Rewritten as a **single-writer rig**. This fixed a real bug as well as
improving the feel: `panCamera` tweened the transform on GSAP's schedule while
`shakeCamera` ran its own `requestAnimationFrame` loop writing the same
transform. On every impact beat the two fought and the camera stuttered.

Now pan, zoom, punch and shake all write *targets*, and `updateCamera(camera,
dt, t)` — called once per frame from the render loop — is the only thing that
touches `camera.position` or the projection.

- Focus and zoom move on a **critically damped spring**, not a tween: a second
  pan blends out of the first one's velocity instead of snapping.
- `shakeCamera(camera, strength, duration)` keeps its old signature; it now
  feeds a trauma value that decays on `trauma²`, so shake falls away rather
  than lingering as a wobble. Still deterministic — no `Math.random`.
- `punchZoom()` — a short zoom kick that springs back. Emphasis without taking
  the board away from the player.
- `cutCamera()` — snap with no travel, used on mission start so a restart does
  not fly the camera in from wherever the last run ended.
- Idle sway of a few centimetres so a held shot is never dead still.

### Fog of war — `src/render/FogOfWar.js`
Was a flat 0.70-opacity plane: two tiers, visible and not. Now three.

| | |
|---|---|
| **UNKNOWN** | never swept. 0.78, with a slow noise crawl so it reads as *no data* rather than empty floor |
| **EXPLORED** | swept earlier this mission. 0.46 — you remember the ground, you are not looking at it |
| **VISIBLE** | inside a live cone. The cones still draw additively on top, so lit area still means visible area |

Explored is accumulated into a 128×128 canvas that each unit's **cone wedge**
stamps into — not a disc, because a unit does not learn what is behind it.
Stamped at 12 Hz, not per frame. `revealAt()` lets drone sweeps, the breach and
night vision commit ground directly. `lift()` runs the mission-start curtain.

### Sensor cones — `src/render/SensorCones.js`
Kept the existing shader and its degradation block intact. Added:

- **Per-unit outline — ALPHA solid, BETA-1 dashed, BETA-2 double.** This closes
  `suggestion-bug.md` **#5** via its own recommended option C. Fill colour stays
  semantic (cyan healthy / amber glitch / red damaged), so identity goes on the
  border and the status colour channel is not spent on callsigns.
- `uFocus` — the cone of the unit currently being talked about brightens and
  breathes. Turn 3 asks the player to judge *one specific unit's* view; they
  should never have to guess which cone that is.
- `uPing` — a detection ripple leaving the apex, fired on a scan or a contact.
- A slow sweep line, which fades out as the sensor degrades. A working sensor
  sweeps; a broken one cannot.

**Also retuned the fill down** (`radial` 0.42→0.30, `rimGlow` 1.6→1.15, and a
narrower outline). Three cones overlap constantly and additive blending stacked
the interiors into one bright blob — the exact complaint in #5. The cones now
read as outlined wedges. *If you are working on units or the level and the
cones look too faint against new ground materials, these three numbers are the
dial.*

### Unit feedback — `src/render/UnitMarkers.js` (new)
Ground markers under each robot: a status-coloured base ring, and a square
counter-rotating bracket on the unit under discussion. Deliberately **additive
to the units rather than part of them** — separate meshes that only read a
unit's position, heading and status, so replacing the robot models does not
touch any of it. Rings flare on a hit or a status change. Badge bobs a few
centimetres so a held shot is not static.

Geometry is shared across all six meshes; no per-frame allocation.

### Mission events — `src/systems/Director.js`, `src/ui/ScreenFX.js` (new)
`ScreenFX` is CSS compositing over the canvas, not a post-processing pass —
per `3d-tech-stack.md`, which rules those out for this build. No extra render
target, no cost inside the WebGL context, and retuning a beat is a CSS edit.

| Event | Treatment |
|---|---|
| Mission start | cut wide → deploy push-in, fog curtain lifts, scan bar wipes the frame |
| AI transmission | speaker's cone lights and pings, warm bloom at the frame edge |
| Sensor break | camera to the unit, scanline tear, held "degraded" unease afterwards |
| Breach | key-light kick, white-amber bloom, punch zoom, ground committed to the map |
| Detection | red bloom, short shake, camera to the midpoint of the two contacts |
| Objective complete | frame the tower, push in, lights up, relay bloom |
| Mission end | board settles and fades to cyan or red *under* the debrief |

The key light is looked up from the scene rather than returned from
`createScene`, so `Scene.js` stays untouched.

### UI motion — `src/style/main.css`, `StatusHUD.js`, `CommandBar.js`
Panel entrance stagger, command buttons that arrive rather than appear, a hover
lift, log lines that slide in, animated confidence segments, a crit pulse on
integrity, and a **red ghost over the slice of integrity you just lost** so the
size of a hit is visible and not just the number that replaced it.

`prefers-reduced-motion` turns all of it off. Nothing above carries information
the player cannot get elsewhere.

**Debrief layout fixed:** at 900px the content overflowed and `justify-content:
center` silently ate the `DEBRIEF — SQUAD INTEGRITY n%` header — on exactly the
screen the demo runs on. Header and replay button now both fit, decision list
takes the overflow.

---

## 2. VERIFIED

Run in the Playwright Chromium already cached on this machine, driven over CDP
from a throwaway script — no dependency added to the project. **This is the
first time the 3D scene has actually been observed**; `audit-findings.md` §6
lists it as unverifiable because headless Firefox does not composite WebGL.

- `npm run build` succeeds.
- Both new shaders compile standalone under `glslangValidator`, and
  `gl.getError()` is **0** after a full six-turn mission.
- **No exceptions and no console errors** across a complete run. The only
  network 404 is `/favicon.ico`, which is pre-existing.
- Screenshots at turn 1, turn 3, turn 6 and the debrief. Turn 3 reads correctly:
  BETA-1 speaking, its cone amber *and* dashed, its bracket amber, `SOURCE
  DEGRADED` on the confidence meter.
- Marker alignment checked in-page, not by eye: exactly two ring meshes sit on
  each unit's ground point, to within 1e-3.

### Not verified
- **Real frame rate.** The only headless GL available here is SwiftShader, which
  runs the whole scene at ~6 fps and says nothing about a GPU. An A/B with the
  new layers hidden moved it ~6.4 → 7.7 fps *on the software rasteriser*, where
  full-screen transparent fill dominates and a real GPU would not care. Someone
  should open `npm run dev` on the demo laptop and watch it.
  Added GPU work is: one full-screen shader plane replacing an existing
  full-screen plane, six small ring meshes, ~20 ALU ops in the cone shader, and
  a 64 KB texture upload at 12 Hz.
- How any of it looks on a projector. Blacks get crushed; the fog's unknown tier
  is the first thing that will suffer.

---

## 3. OUTSIDE THIS SCOPE — for whoever owns these

1. **`FX.revealHostiles` still builds hostiles from `BoxGeometry`**
   (`src/render/FX.js:67`). They are on screen for the back half of the mission
   and are the only placeholder primitives left in the shot now that the level
   has real props.
2. **The robots are hard to find on the new ground.** Their bodies are dark
   (`0x243330`) against dark materials, and only the emissive visor and pod
   really read. The marker rings are currently carrying that job. Worth more
   contrast on the chassis, or real models.
3. **`index.html` has no favicon**, which is the one 404 in the console.

---

## 4. STILL OPEN

- Cone fill values may need another pass once the level materials settle.
- `uPing` fires on scans and transmissions only. A contact inside a cone could
  ripple the cone that saw it — more work than it is worth before freeze.
- Fog has no separate *currently visible* tier of its own; the additive cones
  provide it. A second live texture would be truer and is not worth the upload.
