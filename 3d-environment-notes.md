# GHOSTLINE — 3D ENVIRONMENT & ASSET PASS

Notes for whoever picks up the render layer next. Scope was models,
environment, materials, lighting and scene composition — not gameplay,
scoring, audio or input.

Branch: `3d-environment-assets-nikhil` · commit `23f7da0`

---

## WHAT CHANGED, AND WHERE TO CHANGE IT BACK

| Want to change | File |
|---|---|
| Any surface colour in the compound | `SURFACE` in `src/render/Materials.js` |
| Which kit material becomes which surface | `KIT_SURFACE`, same file |
| Where a prop sits | the `PERIMETER` / `INTERIOR` / `APPROACH` tables in `src/render/Level.js` |
| Light levels, fog, tone mapping | `createScene` / `createRenderer` in `src/render/Scene.js` |
| Drone shape, flight path, timing | `src/render/Drone.js` |
| Which model the squad uses | `UNIT_MODEL` in `src/render/Units.js` |

Adding a prop is one row in a table:

```js
['barrel', 6.8, -3.4, { height: 1.0, rot: 0.0 }],
```

`height` for anything that stands up, `size` for anything flat. Use `size`
for pipes, signs, railings and vents — asking a 0.2-unit-tall floor pipe to
be 1.5 units *tall* inflates it sevenfold.

---

## THREE THINGS THAT WILL BITE YOU

**1. Never measure a cloned skinned mesh.** `SkeletonUtils.clone` hands back
a model whose bone matrices have not been evaluated. `Box3.setFromObject`
reads straight through them: the squad walker measures 46 units tall and
lands on screen at 4% scale. `AssetLoader` measures the *source* once, after
parse, and reuses those bounds for every clone.

**2. Exponential fog is wrong for this camera.** The camera is orthographic
and sits a fixed 40 units back, so everything on the board is at roughly the
same depth. `FogExp2` applies as a near-uniform ~50% wash — it makes the
scene darker without making it deeper. The scene uses linear `THREE.Fog`
with `near` set past the camera distance (40, 78), so only the far corner
softens.

**3. ACES clips saturated emissives fast.** At `toneMappingExposure = 1.45`,
anything above roughly 0.5 emissive intensity on a saturated colour goes to
flat white and the prop stops reading as an object. The relay console was a
glowing cyan cube for exactly this reason. Screens sit at 0.42, lamps at
0.85; only the beacon and the unit status lights are allowed to blow out,
because blowing out is the point for those.

---

## PERFORMANCE

Measured in the page, in the mission, at default framing:

| | |
|---|---|
| Meshes | 304 |
| Triangles | 68,653 |
| Unique materials | 47 (one per surface, shared across every prop) |
| Lights | 9 — key (shadowed), rim, hemisphere, ambient, 4 practicals, drone lamp |
| Shadow casters | 272 (flat floor props opt out; see `NO_SHADOW_BELOW`) |
| Asset payload | 32 `.glb`, 2.0 MB, no textures |
| Bundle | 840 KB JS, 235 KB gzipped |

**Frame time has not been measured on real hardware.** The only browser on
this machine is headless Chromium on SwiftShader — a software rasteriser with
no GPU — which reports ~180 ms/frame and tells you nothing useful. What can
be said: 68 k triangles across 304 draw calls with one shadow-casting light is
modest, and a same-session A/B (environment visible vs hidden) put the whole
dressed compound at about a third of software frame time.

**Somebody should open this on the demo laptop and watch the frame rate.**
If it needs trimming, in order of cost: drop `key.shadow.mapSize` from 2048
to 1024, then raise `NO_SHADOW_BELOW` in `Level.js` to take more props out of
the shadow pass, then thin the `INTERIOR` table.

---

## WHAT I DID NOT DO

- **Sensor cones and fog of war** were rewritten by another agent while this
  pass was running, and both already cover what was asked of them — gradients,
  scanning pulse, detection ripple, per-unit outlines; three-tier fog with a
  stamped memory buffer rather than a black rectangle. Left alone deliberately.
- **Camera** is another agent's spring rig. Untouched.
- **No LOD, no instancing.** At 304 draw calls neither pays for itself yet. If
  the prop count doubles, the crates and barrels are the obvious
  `InstancedMesh` candidates.

---

## KNOWN VISUAL ISSUES

1. **Units are dark at default zoom.** They read through their markers and the
   status pod rather than their own silhouette. Lifting `armour` in
   `Materials.js` is the one-line fix if it bothers people on the projector —
   but check it against the fog first, because the fog is what is actually
   eating them.
2. **The approach ground is sparse.** Deliberate — it has to stay legible as
   open ground you cross — but the squad does sit in a fairly empty quarter for
   the first two turns.
3. **Hostile contacts can get lost among the interior props** once revealed.
   Their rotating ground marker carries them; the model alone would not.
4. **The breach door is still a plain box.** It is a single `Mesh` because the
   Director tweens its rotation, position and material directly, and a swap
   would have meant touching that beat. Dressed with a frame instead.

---

# PASS 2 — DRONE, COMBAT VFX, OBJECTIVE PRESENCE

Second pass, same scope boundary (presentation only — no gameplay, scoring,
audio, voice or input was touched). Three things changed.

## 1. The drone goes somewhere different every turn

It used to fly to `tower.position + 2.5` on every sweep, so turn 2's
outbuilding recon and turn 4's divider recon looked identical.

The mission names its ground in prose — "the outbuilding", "the divider",
"the entry" — and has no table of where those words point. Rather than push
coordinates into `mission1.js` (gameplay's file, and a second source of truth
for positions the level already owns), the presentation layer keeps its own
gazetteer: `PLACES` and `reconTarget()` in `Level.js`.

```
turn 1 → perimeter     turn 4 → divider
turn 2 → outbuilding   turn 5 → console
turn 3 → entry         turn 6 → extraction
```

`outcome.reveal` wins over the turn table when the mission names a level
object outright, so turn 2's `reveal: 'generator'` resolves to the
outbuilding either way.

The flight itself is now a bowed arc with distance-scaled transit time, a
bank into the curve, an orbit while it inspects, a downward scan cone, and a
mirrored return leg. **Fog now lifts at the place the drone looked, when it
gets there** — not at the launch point, and not before it arrives.

## 2. Combat happens somewhere

Every violent outcome in the mission is tagged `fx: 'impact'`, because to the
scoring layer a collapsing gantry, a burst of own fire and a frag are the
same event: health went down. Visually they are not. `Director.weaponFX()`
dispatches on the **action the player chose** instead:

| Action | What you see |
|---|---|
| `FIRE` | every undamaged unit turns, muzzle-flashes, tracers converge on the target, sparks where they land. Turn 2's outcome also ruptures the generator — an explosion, because the log says it ruptured |
| `GRENADE` | the nearest unit throws; the grenade arcs, blinks, lands, detonates. The squad's own damage is **held back to the detonation** rather than firing when it leaves the hand |
| ambush | tracers run *from* the two contacts *to* the unit that was hit — the arc that was never in BETA-1's picture |
| breach | a real explosion at the door, not a screen flash standing in for one |
| any impact | sparks off the chassis plus a smoke puff, on top of the existing hit flash |

Nothing here is decorative. If you cannot name the two world positions an
effect connects, it is not in `CombatFX.js`.

## 3. Objectives are places

`ObjectiveMarkers.js` puts a ground ring and bracket at the relay mast and the
extraction point, coloured by the same `state.objectives()` array the HUD row
reads — so a marker cannot disagree with its own row. Deliberately small: this
is a scene you read by sensor light, and a waypoint pillar would undo that.

## Traps found in this pass

**A killed GSAP timeline does not fire its `onComplete`.** `Drone.sweep()`
resolved its promise off `tl.eventCallback('onComplete')`, and `reset()` killed
the timeline's *targets*. Restarting mid-sweep therefore stranded whatever was
awaiting the sortie. Settling now happens in `Drone.land()`, which both the
timeline and `reset()` call. (Gameplay had independently guarded the symptom
with a `missionRun` stamp; this fixes the cause. Both are worth having.)

**Adding a PointLight per muzzle flash costs a shader recompile.** Three keys
its programs partly on scene light count, so add-then-remove changes it twice
and can recompile every material on screen — on the exact frame something
exploded. `CombatFX` holds a fixed pool of four lights at zero intensity.
Verified: light count is 13 before, during and after a full volley plus a
detonation.

**A sub-second effect cannot be verified in this headless browser.** SwiftShader
runs at ~180 ms/frame and GSAP ticks roughly once per 600 ms, so a 0.4 s tracer
goes from zero-length to faded-out inside a single tick and is never drawn.
The tracers are correct — a probe shows them reaching full length — but to see
them in a still you have to clone the mesh (a clone gets its own scale vector,
which GSAP is not tweening) and hold it open. Worth knowing before anyone else
concludes an effect is broken.

Tracers also now **grow, hold, then fade** rather than grow-and-fade, so a
frame that runs long cannot skip straight past their visible window.

## Cost

Scene at rest is unchanged. During the loudest beat in the mission, combat
adds roughly 40 short-lived meshes, all on shared geometry, none living past
about 1.3 seconds, and zero additional lights.

---

# PASS 3 — REAL SURFACES, AND AN AMMUNITION DEPOT TO PUT THEM ON

Two problems, one of which had been invisible because of the other. The
compound was built out of flat-coloured materials, and the place it stood in
was a relay station with no reason for the relay to be there.

## 1. Why there were no textures: nothing has UVs

This is the finding that shaped the whole pass, and it is worth stating plainly
so nobody spends an afternoon rediscovering it.

**The CC0 kit models carry no texture coordinates.** `barrel.glb`,
`container.glb` and `supply-crate.glb` have position and normal attributes and
nothing else. The character rigs are worse than missing — `squad-walker.glb`
*has* a `TEXCOORD_0`, and all 928 vertices of its first primitive share the
single UV `(0.0, 1.0)`. They are palette-atlas models: the colour was always
meant to come from the material, never from a map.

So UV-mapped textures are not an option anywhere in this project, and no
amount of picking better textures would have changed that.

**The answer is triplanar projection** — `src/render/Textures.js`. The surface
is sampled in world space along all three cardinal planes and blended by face
normal, so it lands correctly on any mesh whatever its author did or did not
unwrap. It also fixes the terrain's own problem for free: a world-space
projection does not stretch on a slope the way a planar UV does.

Two projection spaces, because moving things need different treatment:

| Space | Used by | Why |
|---|---|---|
| world | terrain, compound, every prop | adjacent objects share the grain; no repetition alignment between them |
| object | the walkers | a world projection *slides* across a unit as it crosses the compound. Object space pins the texture to the model so it walks with it |

Three things about it that are easy to get wrong:

- **`material.clone()` silently destroys it.** Material.copy runs `userData`
  through JSON — which turns a texture reference into a plain object — and does
  not carry `onBeforeCompile` or `customProgramCacheKey` across at all. A
  cloned triplanar material comes out untextured with no error anywhere. Use
  `cloneSurface()` in `Materials.js`; both clone sites already do.
- **`normalMatrix` is declared in the vertex prefix only.** The object-space
  path needs it in the fragment shader and has to declare it there itself.
- **The detail map must modulate, not replace.** A photographic albedo averages
  about 0.35 luminance. Multiplied straight into a material that already has a
  colour — and, on the terrain, into a macro map as well — you multiply two
  albedos and land at a tenth of the intended brightness. That is what turned
  the first textured build into brown mud. `albedoMix` mixes toward white
  instead: 0.45 on the terrain, 0.8 on props.

## 2. A depot, not a relay station with props around it

The mission fiction is a relay, but the *installation* now reads as what a
relay that size would actually be attached to. The signature is not crates, it
is **earth-covered magazines**: concrete box, blast door at one end, spoil
bermed over the top and flanks so a detonation vents through the open end.
They are built well apart, in a row, for exactly that reason — and that
spacing is the silhouette. Three of them, west of the wire, built in code
(`magazine()` in `Level.js`) because no CC0 kit has the shape.

Around them, three groups that each do a job rather than decorate:

| Group | What it says |
|---|---|
| the magazine row | explosives storage, doors onto a service road, aprons scuffed where lorries turned |
| the handling yard | pallets, crate stacks and a truck backed up to the stack it was loading |
| the checkpoint | the road block, the tower that watched it, the sandbag position covering both |

**The service track is what makes it one location.** It leaves the access road
short of the gate, runs north past the magazine doors, crosses the top of the
compound and comes down into the yard. Every group sits on it. It is cut into
the height field, drawn into the macro texture with its own ruts, and masked
out of the vegetation — so it is a real feature of the ground, not a stripe
painted on it.

## 3. Terrain and vegetation

- Props are now placed at `terrainHeight(x, z)` rather than pinned to `y = 0`.
  Inside the wire that changes nothing — the mask keeps the ground flat under
  the slab — but the outermost dressing had been hanging above its own shadow.
- The concrete pad was 15 units square around a 10-unit compound, overhanging
  the walls by two and a half metres on every side. A pale slab with a hard
  diamond edge standing proud of the building was the most artificial thing in
  the frame. It is sized to the compound now.
- Grass comes in two variants drawn from the same generator with different
  seeds; one tuft repeated eight thousand times gives procedural scatter away
  faster than placement ever does. Faceted-sphere shrubs are gone, replaced by
  branching dead scrub on the same crossed-quad trick.

## 4. Lighting

The fill was carrying nearly as much of the exposure as the key, which is what
flattened everything. Key up, hemisphere and ambient down, so lit and unlit
are different things. The depot has its own sodium practicals on the three
floodlight props out there — a different circuit from the compound's white,
which gives the yard and the magazine road their own pools rather than one
even wash.

## 5. Cost

| | |
|---|---|
| Textures | 10 CC0 sets, 22 MB on disk, all local |
| Models | 9 new CC0 `.glb`, 1.6 MB, ~30k tris total |
| Draw calls | vegetation is 6 instanced meshes; the depot adds ~45 props on the existing shared-material path |
| Fragment cost | 9 texture fetches per fragment on the triplanar path |

**Software WebGL gets a reduced tier automatically** (`detectTier`). It keeps
the full three-axis projection — an earlier version dropped to a single planar
sample and smeared vertically down every wall, which is not a trade worth
making — and loses the normal and roughness maps, which is two thirds of the
bytes and most of the cost. `?tier=high` / `?tier=low` forces it. This is not
only about the test machine: it is what keeps time-to-first-frame sane on a
laptop with no discrete GPU.

## 6. Still weak

- **Sensor cones and fog of war were tuned against flat ground.** They still
  read, but nobody has looked at them specifically since the surfaces changed.
- **`ground-sand` is downloaded and unused.** It is there for a future terrain
  blend; delete it if that never happens.
- **The magazine doors do not open** and nothing in the mission asks them to.
- **No LOD.** Everything draws at full detail at every zoom. At this scene
  size that is affordable; it would not be at twice the prop count.
- **`metal-painted` and `ground-dirt` albedos were colour-corrected** away from
  their upstream sea-green and temperate-moss originals. Both corrections are
  documented in `public/assets/textures/SOURCES.md` with the filter strings.

## 7. One cross-owner note, for whoever owns `Hazards.js`

**Fires and scorch decals are placed at `y = 0`** — `this.group.position.set(x,
0, z)` and `scorch.position.y = 0.012`.

That is correct today and I have not changed it. Every position the mission
actually ignites (the generator, the compound interior, unit positions) sits
inside the compound mask, where the height field is flat at zero by
construction, so the fires land on the ground exactly as intended.

It becomes wrong the moment anything ignites **outside the wire** — a vehicle
lost on the service track, a magazine cooking off, a hazard at the checkpoint.
Out there the ground is real terrain and a decal at `y = 0.012` will either
float above it or be buried under it.

The fix, whenever that turn comes, is one import and one line:

```js
import { terrainHeight } from './Terrain.js';
// ...
this.group.position.set(x, Math.max(0, terrainHeight(x, z)), z);
```

`terrainHeight` is exported, pure, seeded and cheap — `Level.js` uses exactly
this expression (`groundAt`) to stand its props on the ground. Flagging rather
than changing it, since the hazard system is not mine.
