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
