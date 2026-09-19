# TEST RANGE 9 — map rebuild notes

Branch `3d_V2`. What changed in the BLACK CURRENT undersea map, why, and what
is still outstanding.

---

## The short version

The map did not look bad because it needed more objects. It looked bad because
of **five separate defects**, four of which were invisible as code and only
showed up by measuring the running game. Every one of them is now fixed at the
cause rather than painted over.

---

## Bugs found and fixed

### 1. The sensor cones were not rendering at all
`SensorCones.js` declared `float outline` twice in one GLSL scope — once in the
wedge-shape block, once in the per-unit identity block. GLSL has no shadowing,
so **the entire cone shader failed to compile** and every sensor cone in the
game silently vanished. The game's core visual, gone, with only a console
warning to show for it.

Renamed the first to `border`. Cones are back.

*This affected mission 1 as well.*

### 2. The seabed was mirrored against its own height function
A `PlaneGeometry` laid flat with `rotation.x = -PI/2` maps local **+y to world
−z**. The terrain sampled `seabedHeight(x, localY)`, so the rendered ground was
the height field **flipped in z**.

Measured by raycasting the real mesh:

| point | ground | `seabedHeight()` | mirrored |
|---|---|---|---|
| (4, −7) — Range Instrument 7 | −0.40 | **−3.06** | −0.33 |
| (6, −5) — the channel | +0.14 | **−2.27** | +0.19 |
| (10, −4) | +1.47 | **−3.79** | +1.52 |

Everything placed by the height field — the instrument, the trench props, the
scar hardware — sat at a height the ground did not have. **Range Instrument 7,
the answer to the whole mission, was 2.7 m underground.** That is the "many
objects are missing".

Fixed; `ground` now matches the function exactly at every probe.

> Mission 1's `Terrain.js` has the same flip, but nothing in that mission is
> placed from the height field, so it is invisible there. **I left the
> rehearsed desert alone** rather than silently reshaping a working map.

### 3. The fog of war was a flat slab over hilly ground
It was a flat 30-unit quad at `y = 0.01`. On open terrain that is wrong twice:
it stops far short of what the camera sees, and being flat it stands **proud of
every hollow**, so the camera looks at the underside of an opaque sheet
wherever the ground dips below a centimetre. That drew the two enormous
hard-edged black wedges across the map — which read as missing geometry.

`FogOfWar` now takes `{ size, height, memSize }` and **drapes itself over the
terrain**. Undersea uses a 110-unit veil at 256² memory. Mission 1 keeps the
old flat defaults.

### 4. The water fog was eating the entire world
Fog was `near 14 / far 72`. The orthographic camera sits a fixed **40 units
back**, so that put ~45 % haze on *the subject itself* and averaged the whole
board toward dead teal — taking every colour in the map with it.

This is precisely the mistake mission 1 avoids: the desert fogs at **46–230**,
so the compound is clear and only the far ridges soften. Same rule applied
here, scaled to water: **30–108**.

Single biggest cause of "no colour".

### 5. Props were standing at 30–36°
`onSeabed()` sampled the slope over ±0.9 m. That baseline **straddles a single
sand ripple** and reads its flank as a hillside. Now sampled over ±2.2 m and
clamped to 10°.

The instrument's mooring chain was parented to the hull, so the package's tilt
swung a seven-metre tail up into the water column — its bounding box measured
**9 m tall**. The chain is now laid in world space, link by link, each sampling
the ground.

---

## What the map is now

One continuous place, not six dioramas. Two long linear features cross the
whole range so the eye can travel between mission locations without a cut:

- **the trunk cable** — a real tube following the seabed from (−16, 12) to
  (7, −4), in its own trench, with concrete tie-down saddles at regular
  spacing. Regularity is the tell that says *installed* on a seabed where
  nothing else is regular.
- **the drag scar** — the furrow joining the turn-2 charted fix to the turn-5
  resting place, with the mooring chain lying in it.

| Location | Feature | Turn |
|---|---|---|
| (−6, 6) | Four survey pillars on prepared ground | 1 |
| (−1, 1) | The old charted fix — empty mooring block | 2 |
| (−1,1)→(4,−7) | The drag scar, spoil pushed up either side | 3 |
| (6, −5) | The channel: meandering trench with raised shoulders | 4 |
| (4, −7) | **Range Instrument 7** — hull, rust collar, growth on the upper surface only, sheared mooring plate, 22 chain links trailing up its own furrow | 5 |

**Why it is colourful when 240 m of water should be black:** because the AUVs
carry survey lights, which is how anything is ever seen at that depth. Real
survey footage is exactly this — a travelling pool of vivid colour with
blue-black nothing a few metres outside it. So the sediment is authored **warm**
and the water is what takes the colour away, rather than the sediment being
authored grey and then tinted. A grey floor under a green tint reads as a
desert with a filter on. It also means **lit == known**, which is the game's
whole mechanic.

Three unshadowed point lights parented to the unit groups — they follow the
fleet for free and need no frame hook.

Other work:
- Six species of instanced biology, **per-instance colour** so one draw call
  carries a whole palette: seagrass tufts, orange barrel sponges, red/purple
  gorgonian fans (procedural branching alpha texture), soft coral, rubble.
  Placement is biology, not scatter — filter feeders crowd the channel
  shoulders where the flow brings food; **nothing grows on the scar**, because
  bare scour is the proof of recency and growth on it would undo the story.
- Vertex-shader current sway on everything soft.
- Caustics in the terrain shader, plus procedural mid-frequency mottling to
  fill the scale band the 2048px macro map cannot hold.
- Marine snow rewritten: round sprites, per-particle size, 2600 motes.
- Channel and prepared pad given warped distance fields — a clean
  distance-to-segment has parallel iso-contours and came out as a **geometric
  capsule** stamped on the seabed.
- Light shafts **removed**. Nothing reaches 240 m to cast them, and as geometry
  they projected into flat vertical bands that read as smudges on the lens.

---

## Not done / still wrong

1. **Residual diagonal banding on open sediment.** Broad soft stripes are still
   visible on bare floor. I bisected it to the terrain material (it survives
   hiding the fog mesh, growth, snow, dome, shafts and water fog) but ran out
   of time before isolating the term. Suspects, in order: the new shader
   mottling octaves (`n2(wp * 0.42)`), the macro texture's ripple term, or the
   coarse-field bilinear upsample in `makeSeabedTexture` showing its 192²
   grid. **Start by zeroing each in turn.**
2. **The vehicles are still the desert walkers.** They should be AUVs. Model job.
3. **Per-vehicle battery/integrity** — `mission.fleet` is written in the data;
   `GameState` and `StatusHUD` do not read it. Outcome `damages` maps are in
   mission 2 and unconsumed by the engine.
4. Damage-and-scuttle cinematics; mission-aware drone routing; expanded
   debrief; baked voice lines for mission 2.
5. `npm run e2e` not yet run against mission 2.

## Verification

- `npm run verify` — **PASS, 133,441 assertions**
- `npm run build` — clean
- Headless capture tour across all six mission camera positions

> **Note for anyone taking headless screenshots:** SwiftShader runs this at
> ~1.7 fps, so the 1.6 s mission-start curtain takes ~16 s of wall clock and
> `uReveal` is still ~0.1 several seconds in. Every early screenshot I judged
> was taken with the veil 90 % down. Force
> `OP.scene.getObjectByName('fog').material.uniforms.uReveal.value = 1`
> before capturing.
