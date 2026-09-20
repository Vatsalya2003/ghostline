# GHOSTLINE — 3D ASSET SOURCES AND LICENCES

Every 3D model in this project is **CC0 1.0 Universal (public domain
dedication)**. There are no attribution obligations, no non-commercial
clauses, and nothing here needs permission to ship, judge, record or
redistribute.

The upstream licence text, exactly as it ships with the packs, is reproduced
at [`LICENSE-quaternius.txt`](LICENSE-quaternius.txt).

**Total: 41 `.glb` files, 3.7 MB**, plus a CC0 PBR texture library documented
separately at [`textures/SOURCES.md`](textures/SOURCES.md). No external fonts,
no CDN. The game runs fully offline once cloned.

---

## 1. ORIGIN

| | |
|---|---|
| **Author** | Quaternius — <https://quaternius.com> |
| **Licence** | CC0 1.0 Universal · <https://creativecommons.org/publicdomain/zero/1.0/> |
| **Packs used** | Cyberpunk Game Kit · Ultimate Modular Sci-Fi Pack · Survival Pack |

### Why the files came from a mirror

`quaternius.com` serves its pack downloads through a JavaScript front end that
this build machine could not drive, and the same machine cannot reach
`kenney.nl` at all (the audio pack hit the identical wall — see
[`../audio/SOURCES.md`](../audio/SOURCES.md)). The `.glb` conversions were
therefore taken from a public GitHub mirror:

- **`github.com/trebeljahr/quaternius-showcase`** → `public/glb/<pack>/<Model>.glb`

That repository's own MIT licence covers its *code*; it makes no claim over the
models. The models' licence is Quaternius's, and it was verified against a
second, independent mirror that ships Quaternius's `License.txt` verbatim:

- **`github.com/Malcolmnixon/Quaternius-Modular-Scifi-Pack`** →
  `addons/quaternius-modular-scifi-pack/License.txt`, whose README states the
  pack is *"available from https://quaternius.com/packs/ultimatemodularscifi.html
  under the CC0 license."*

If you would rather re-fetch from source, the packs are free downloads at
<https://quaternius.com/packs.html> and the files are interchangeable.

---

## 2. WHAT IS IN THE BUILD

Files are renamed to what they are *in this game* rather than what they were
called in the kit — `Enemy_2Legs_Gun` is our squad, not an enemy. Original
names are given so anything here can be traced back.

### `models/` — animated characters

| File | Original | Pack | Size | Used for |
|---|---|---|---|---|
| `squad-walker.glb` | `Enemy_2Legs_Gun` | Cyberpunk | 317 KB | ALPHA, BETA-1, BETA-2. One download, three clones. |
| `hostile-heavy.glb` | `Enemy_Large_Gun` | Cyberpunk | 695 KB | Hostile contacts revealed on the ambush beat. |

Both carry a skeletal rig with Idle / Walk / Run / Attack / Shoot / Jump /
Death clips. GHOSTLINE drives Idle and Walk.

### `environment/` — props

| File | Original | Pack |
|---|---|---|
| `ac-unit.glb` | `AC` | Cyberpunk |
| `ac-stacked.glb` | `AC_Stacked` | Cyberpunk |
| `antenna-mast.glb` | `Antenna_1` | Cyberpunk |
| `antenna-array.glb` | `Antenna_2` | Cyberpunk |
| `cable-long.glb` | `Cable_Long` | Cyberpunk |
| `cable-thick.glb` | `Cable_Thick` | Cyberpunk |
| `terminal.glb` | `Computer` | Cyberpunk |
| `terminal-bank.glb` | `Computer_Large` | Cyberpunk |
| `fence.glb` | `Fence` | Cyberpunk |
| `floodlight.glb` | `Light_Street_1` | Cyberpunk |
| `supply-crate.glb` | `Lootbox` | Cyberpunk |
| `pipe-straight.glb` | `Pipe_1` | Cyberpunk |
| `pipe-corner.glb` | `Pipe_Corner` | Cyberpunk |
| `railing.glb` | `Rail_Long` | Cyberpunk |
| `sign-hazard.glb` | `Sign_Corner_Hazard` | Cyberpunk |
| `strut.glb` | `Support` | Cyberpunk |
| `strut-long.glb` | `Support_Long` | Cyberpunk |
| `storage-tank.glb` | `Tank` | Cyberpunk |
| `turret.glb` | `Turret_Gun` | Cyberpunk |
| `monitor.glb` | `TV_1` | Cyberpunk |
| `container.glb` | `Props_ContainerFull` | Ultimate Modular Sci-Fi |
| `console.glb` | `Props_Computer` | Ultimate Modular Sci-Fi |
| `barrel.glb` | `Props_Vessel` | Ultimate Modular Sci-Fi |
| `pipe-bundle.glb` | `Pipes` | Ultimate Modular Sci-Fi |
| `vent.glb` | `Details_Vent_3` | Ultimate Modular Sci-Fi |
| `column.glb` | `Column_1` | Ultimate Modular Sci-Fi |
| `propane-tank.glb` | `PropaneTank` | Survival |
| `fuel-can.glb` | `GasCan` | Survival |
| `drum.glb` | `Trashcan` | Survival |
| `battery.glb` | `Battery_Big` | Survival |

---

## 3. MODIFICATIONS

**The `.glb` files are unmodified.** Every change below happens at load time in
`src/render/`, which means the binaries stay byte-identical to the CC0
originals and are trivially re-verifiable against upstream.

1. **Renamed** on download, per the tables above. Contents untouched.

2. **Materials remapped.** Each kit material name (`Main`, `Accent`,
   `DarkGrey`, `Screen`, `Eye`, …) is mapped to a GHOSTLINE surface by
   `src/render/Materials.js` and applied once per file at parse time. The kits
   are lit for bright daylight — mid greys, saturated safety orange, white
   plastic — and dropped in unchanged they read as a toy sci-fi arena under
   this scene's key light. Colours now sit in a cold concrete-and-steel range.

3. **Scale normalised.** Kit models arrive at wildly inconsistent scales (the
   trashcan measures 6.7 units tall, the container 0.58). `AssetLoader.js`
   measures each source once and scales instances to a requested real-world
   height, re-anchoring them to the floor.

4. **Flat shading forced,** matching the hand-built geometry already in the
   scene.

5. **`Eye` is isolated per instance** on the two character models so each unit
   can carry its own status colour (cyan nominal / amber degraded / red
   damaged) without the other two changing with it.

---

## 4. WHAT IS *NOT* DOWNLOADED

Three things in this scene are deliberately built in code rather than loaded.
All are in `src/render/`.

| Thing | Where | Why |
|---|---|---|
| **The recon drone** | `Drone.js` | No CC0 quadcopter exists in these packs. The nearest flying asset is a gold pod with arms — 290 KB, and it reads as a cartoon enemy rather than reconnaissance equipment. A quadcopter is booms, rotors, a body and a gimbal: ~4 KB hand-built, and it lets the rotors and sensor head be separate objects the animation can actually drive. |
| **The compound shell** | `Level.js` | Its dimensions are load-bearing — the mission file moves units to literal coordinates and the breach drops a door at x 2.6. A modular wall kit would have to be cut to those numbers anyway. |
| **Rubble** | `Level.js` | The kit's rock models ship Draco-compressed. Shipping a WASM decoder to save 12 KB of geometry is a bad trade for an offline demo; these are a dodecahedron each. |

The same Draco constraint removed seven models from the Ultimate Space Pack
(radar dish, antennas, rocks, solar panel) that were downloaded and then cut.
Nothing in the build requires a `DRACOLoader`.

---

## 5. AUDIO

Sound assets are documented separately, and are also entirely CC0 —
see [`../audio/SOURCES.md`](../audio/SOURCES.md).

---

## 6. AMMUNITION-DEPOT PROP SET

Added later, to make the compound read as a **military ammunition depot**
rather than a generic industrial yard. Same rule as everything above: **CC0
1.0 Universal only**, nothing CC-BY, nothing non-commercial. Nine `.glb`
files, **1,630,052 bytes (1.6 MB)**, 29,817 triangles total. None of them use
Draco; none carry animations; each has a single root node.

### Where they came from

Two new routes, both CC0-verified:

- **`poly.pizza`** — the CC0 filter on that site. It is where Quaternius and
  Kenney publish directly, and the download is already `.glb`, so nothing here
  needed converting. Eight of the nine came this way.
- **`github.com/trebeljahr/quaternius-showcase`** — the same mirror section 1
  already documents, for one Real Time Strategy Pack model.

Kenney's CC0 terms were re-verified independently against a full mirror of his
packs that ships his licence text verbatim —
`github.com/shorepine/kenney` → `LICENSE.txt`: *"License: (Creative Commons
Zero, CC0) … You can use this content for personal, educational, and
commercial purposes."* `kenney.nl` itself still refuses connections from this
machine, as noted in section 1.

### The files

| File | What it is | Original | Author | Licence | Tris | Bounding box (m) | Bytes |
|---|---|---|---|---|---|---|---|
| `sandbag-wall.glb` | Sandbag emplacement, three courses | `Sack Trench` | Quaternius | CC0 1.0 | 7,168 | 3.16 × 1.19 × 0.78 | 131,468 |
| `sandbag-pile.glb` | Sandbag emplacement, two courses | `Sack Trench Small` | Quaternius | CC0 1.0 | 3,584 | 2.32 × 0.93 × 0.75 | 66,628 |
| `ammo-crate.glb` | Stencilled steel ammunition can, hinged lid, loose rounds on top | `Ammo Can` | Pichuliru | CC0 1.0 | 10,071 | 0.32 × 0.27 × 0.17 | 1,012,008 |
| `barrier-concrete.glb` | Jersey / K-rail concrete barrier | `Construction Barrier` | Kenney | CC0 1.0 | 60 | 0.09 × 0.12 × 0.23 | 5,308 |
| `military-truck.glb` | Cab-over box cargo truck | `Truck` | Quaternius | CC0 1.0 | 7,474 | 2.71 × 2.88 × 5.26 | 326,828 |
| `guard-tower.glb` | Four-leg observation tower, railed platform, pitched roof | `Guard Tower` | Quaternius | CC0 1.0 | 416 | 1.49 × 3.84 × 1.49 | 23,968 |
| `gate-barrier.glb` | Checkpoint road block — trestle frame with a spanning beam | `Traffic Barrier` | Quaternius | CC0 1.0 | 364 | 1.56 × 0.80 × 0.78 | 25,904 |
| `pallet.glb` | Wooden shipping pallet | `Pallet` | Quaternius | CC0 1.0 | 176 | 1.70 × 0.19 × 1.46 | 10,264 |
| `crate-stack.glb` | Two wooden crates stacked | `Crate_Stack2` (Real Time Strategy Pack) | Quaternius | CC0 1.0 | 504 | 0.12 × 0.25 × 0.12 | 27,676 |

Source URLs, in the same order:
<https://poly.pizza/m/LW3jwpPfiN> ·
<https://poly.pizza/m/iHyRewQQcN> ·
<https://poly.pizza/m/9xeB2FkEYr> ·
<https://poly.pizza/m/4mrO9ueiQr> ·
<https://poly.pizza/m/cXw6oiFtZ8> ·
<https://poly.pizza/m/sbaM8I229r> ·
<https://poly.pizza/m/cM3aJPU9NS> ·
<https://poly.pizza/m/cUAsYHDqfD> ·
`quaternius-showcase` → `public/glb/real_time_strategy_pack/Crate_Stack2.glb`

As in section 3, **the `.glb` files are unmodified** — renamed on download and
nothing else. They were verified by parsing each one with the project's own
`three@0.186.0` `GLTFLoader.parse()`, and separately with an independent glTF
reader, and the two agree on every triangle count and bounding box above.

### Three things to know before wiring these in

1. **Six of the nine carry named colour materials** (`Sack`, `Wood`,
   `LightWood`, `Wood_Light`, `Celing`, `pavement.065`, …) and no texture, so
   `Materials.js` can remap them the way it does the kits in section 2. The
   other three — `ammo-crate`, `military-truck`, `gate-barrier` — bake their
   colour into a small embedded texture atlas (`M_PCL_Flat_Palette`, `Atlas`,
   `Atlas.047`) and will keep their own palette unless they are handled
   specially. That is deliberate for `ammo-crate`: the stencilling on the can
   is the thing that says *ammunition*, and remapping it away would waste it.

2. **`ammo-crate.glb` is 1.0 MB and 10,071 triangles** — by far the heaviest
   thing in this set, and 62% of its bytes. It is not the texture (a 64 × 64
   PNG, 565 bytes); it is unindexed geometry. It is still inside the 1.5 MB
   per-file budget, but it is a poor candidate for heavy instancing.

3. **`barrier-concrete.glb` is centred on its own origin**, so its base sits at
   y = −0.059 rather than y = 0. The floor re-anchoring in `AssetLoader.js`
   already covers this; it is only a problem if something bypasses it.

### What was looked for and deliberately not taken

| Wanted | Why there is no file |
|---|---|
| **HESCO / gabion bastion** | No CC0 model exists. Searched poly.pizza, the Quaternius and Kenney catalogues, Poly Haven and OpenGameArt under *hesco*, *gabion*, *bastion*, *barbed wire*. Everything returned was either a chain-link panel or CC-BY. |
| **Skid-mounted generator / genset** | No CC0 model that actually reads as a genset. Poly Haven's `portable_generator` *is* CC0 and correct, but its 1k glTF packs to roughly 3.4 MB of photoreal PBR — over the per-file budget and stylistically at odds with the flat-shaded kits in section 2. Kenney's `space-kit` `machine_generator` is CC0 and the right size, but ships with a hard-coded node translation of `[2, 0, 1.5]`, which would place it two metres from wherever it is asked to stand. Both were rejected rather than patched. |

`gate-barrier.glb` is the one compromise in the table above. The brief was a
checkpoint **boom / lift-arm** barrier; no CC0 lift-arm exists in any of the
sources searched. What shipped is a trestle-frame road block with a hazard-
striped spanning beam — a checkpoint barrier, but a fixed one, not a hinged
arm. If the scene needs an arm that *lifts*, build it in code the way the
drone in section 4 is built; it is two boxes and a pivot.
