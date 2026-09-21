# GHOSTLINE — 3D ASSET SOURCES AND LICENCES

Every 3D model in this project is **CC0 1.0 Universal (public domain
dedication)**. There are no attribution obligations, no non-commercial
clauses, and nothing here needs permission to ship, judge, record or
redistribute.

The upstream licence text, exactly as it ships with the packs, is reproduced
at [`LICENSE-quaternius.txt`](LICENSE-quaternius.txt).

**Total: 46 `.glb` files, 6.5 MB.** No external fonts, no CDN. The game runs
fully offline once cloned. (PBR texture sets are documented separately in
[`textures/SOURCES.md`](textures/SOURCES.md).)

---

## 1. ORIGIN

| | |
|---|---|
| **Author** | Quaternius — <https://quaternius.com> |
| **Licence** | CC0 1.0 Universal · <https://creativecommons.org/publicdomain/zero/1.0/> |
| **Packs used** | Cyberpunk Game Kit · Ultimate Modular Sci-Fi Pack · Survival Pack · Mech Pack · Modular Men · Modular Women · Modular Sci-Fi Guns |

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
| `squad-mech.glb` | `George` | Mech | 807 KB | ALPHA, BETA-1, BETA-2. One download, three clones, three liveries. |
| `squad-rifle.glb` | `AR_5` | Modular Sci-Fi Guns | 64 KB | The rifle in the squad's right hand. One download, three clones. |
| `hostile-heavy.glb` | `Enemy_Large_Gun` | Cyberpunk | 695 KB | Hostile contacts revealed on the ambush beat. |

`squad-mech.glb` is a genuine humanoid robot — head, torso, shoulders, two
arms with four-fingered hands, pelvis, two legs — on a 47-bone rig. It
replaced `Enemy_2Legs_Gun`, which despite its name has **no arm bones at all**:
it is a gun pod on two legs and could not hold, aim or reload anything. The
squad is written as three robots carrying weapons, so the old model was
contradicting the fiction every frame it was on screen.

GHOSTLINE drives Idle, Walk, Run, Shoot, Attack and Death on the mech, and
Idle / Walk on `hostile-heavy.glb`. See §3.6 for what had to be rebuilt to get
there.

`squad-rifle.glb` is byte-identical to `rifle-ar.glb` below and is kept as a
second copy on purpose: `AssetLoader` caches parsed files by URL and retints
that one parsed scene in place, so the squad and the guards asking for
different surface overrides on the same URL would fight over it.

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

**Every `.glb` is unmodified except `squad-mech.glb`,** which was repacked —
see §3.6. Everything else below happens at load time in `src/render/`, which
means those binaries stay byte-identical to the CC0 originals and are trivially
re-verifiable against upstream.

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

5. **`Eye` is isolated per instance** on `hostile-heavy.glb` so each contact
   can carry its own status colour (cyan nominal / amber degraded / red
   damaged) without the others changing with it. The squad mech has no such
   material and gets a built sensor instead — see §3.6.

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

### 3.6 The squad mech, in detail

Four things had to be done to `George` to make it a GHOSTLINE unit. The first
is to the file; the other three are at load time in `src/render/Units.js`.

**a. The file was repacked — 3.34 MB to 807 KB.** This is the one binary in
the project that is not upstream byte-for-byte. Two changes, both lossy only in
ways that cannot be seen at this camera distance:

- The baked atlas was 2048x2048 PNG (2.2 MB). A robot 1.7 m tall is about 120
  screen pixels at tactical zoom, so it was resampled to 512x512 JPEG at
  quality 90 with no chroma subsampling (126 KB).
- 13 of the 20 animation clips are not used by this game (`Dance`, `Hello`,
  `Kick`, `Yes`, `No`, `Jump`, …). Dropping them, and garbage-collecting the
  accessors and buffer views that only they referenced, took the JSON chunk
  from 450 KB to 167 KB as well as shrinking the binary.

Nothing was edited: no geometry, no rig, no keyframes on the surviving clips.
Re-fetch `George.glb` from the mirror to get the original.

**b. The arms were retargeted, because the idle is a T-pose.** `Idle`, `Shoot`
and `SwordSlash` each carry exactly two identical keyframes on `UpperArm.L/R`,
holding the arms straight out at ninety degrees. That is authored, not broken:
Quaternius put the weapon poses only into the `_Holding` variants of the walk
and run, and the pack has no `Idle_Holding`. So the carry pose is lifted off
`Walk_Holding`'s right arm and grafted onto the clips that lack it, and the
left arm is its mirror — the export mirrors `.L`/`.R` pairs across the YZ
plane, which for these quaternions is exactly `(x, -y, -z, w)`.

**c. The material was relit.** The mech ships under `KHR_materials_unlit`, so
GLTFLoader returns a `MeshBasicMaterial` and the robot renders its bake at full
brightness with the scene's lights, shadows and ambient doing nothing to it —
a bright sticker walking over a lit compound. It is rebuilt as a
`MeshStandardMaterial` around the same texture: same download, same GPU
memory, now lit by the same key light as the ground under its feet.

**d. Three liveries and three back modules.** One download, three clones. Each
unit gets its own copy of the atlas material tinted to a different value —
ALPHA lightest, BETA-2 darkest and slightly larger — plus a code-built module
bolted to the chest bone: a dish for ALPHA's command role, a low-profile pod
for BETA-1's recon role, twin cells for BETA-2. Colour is the first thing a
45-degree camera and a fog layer take away from you, so the silhouettes differ
too. The status light (cyan / amber / red) is a built visor parented to the
head bone, since there is no `Eye` material to isolate on this model.

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
