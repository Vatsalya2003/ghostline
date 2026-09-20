# GHOSTLINE — 3D ASSET SOURCES AND LICENCES

Every 3D model in this project is **CC0 1.0 Universal (public domain
dedication)**. There are no attribution obligations, no non-commercial
clauses, and nothing here needs permission to ship, judge, record or
redistribute.

The upstream licence text, exactly as it ships with the packs, is reproduced
at [`LICENSE-quaternius.txt`](LICENSE-quaternius.txt).

**Total: 45 `.glb` files, 6.0 MB.** No external fonts, no CDN. The game runs
fully offline once cloned. (PBR texture sets are documented separately in
[`textures/SOURCES.md`](textures/SOURCES.md).)

---

## 1. ORIGIN

| | |
|---|---|
| **Author** | Quaternius — <https://quaternius.com> |
| **Licence** | CC0 1.0 Universal · <https://creativecommons.org/publicdomain/zero/1.0/> |
| **Packs used** | Cyberpunk Game Kit · Ultimate Modular Sci-Fi Pack · Survival Pack · Modular Men · Modular Women · Modular Sci-Fi Guns |

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

### `models/` — the people

The depot mission is decided by telling a captive from a shooter across a
room, so the guards and the hostages are real human characters rather than
the hand-built boxes they used to be. Four files, three of them people:

| File | Original | Pack | Size | Used for |
|---|---|---|---|---|
| `guard-swat.glb` | `Swat` | Modular Men | 868 KB | The armed guards — yard patrol and the two posted in the holding room. |
| `civilian-worker.glb` | `Worker` | Modular Men | 657 KB | Depot staff: hard hat, hi-vis vest. Half the hostages. |
| `civilian-worker-f.glb` | `Worker` | Modular Women | 754 KB | The other half, and the sixth figure when it resolves. |
| `rifle-ar.glb` | `AR_5` | Modular Sci-Fi Guns | 64 KB | Parented to the guards' right hand bone. |

These four carry a full rig (`CharacterArmature`, shoulder / upper arm /
lower arm / hand and every finger, both sides) and **no animation clips at
all**. That is not a gap here: this room is a held frame, not a firefight.
Every pose in it — the guards' two-handed carry, the hostages seated with
their knees up and their wrists tied, the sixth figure folded down behind the
cabinet — is bone rotations applied once on load by `src/render/Actors.js`.

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

5. **`Eye` is isolated per instance** on the two robot models so each unit
   can carry its own status colour (cyan nominal / amber degraded / red
   damaged) without the other two changing with it.

6. **The people are posed procedurally.** The character files ship rigged and
   unanimated, so `Actors.js` rotates their bones on load: each bone is swung
   from its authored bind direction toward a target direction given in the
   figure's own frame, which keeps the roll the rigger baked in. The fingers
   are closed by the same mechanism, with the curl direction measured off the
   hand rather than hard-coded — the three files do not agree on how many
   finger bones there are.

   The restraints (wrist ties, the tether down to a floor anchor) and the
   rifle are GHOSTLINE geometry attached to the rig after posing. The rifle is
   parented to the right hand bone and then turned so its barrel runs through
   the left hand, so it lands in both hands and travels with them.

7. **Character materials are named explicitly.** `Skin`, `Swat`, `Worker_Vest`
   and friends do not exist in the prop table, and two of the names that *do*
   collide with it would be actively wrong: `Eye` maps to the squad's emissive
   status tint, and anything unmapped falls through to concrete. Actors.js
   passes one override map per file — including one each for the two worker
   files, which disagree about whether `Brown` means trousers or irises.

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
