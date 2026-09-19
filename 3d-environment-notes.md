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
