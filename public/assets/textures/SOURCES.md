# GHOSTLINE — TEXTURE SOURCES AND LICENCES

Eleven PBR surface sets for the depot, one directory per material slot the
renderer asks for. **Every set is CC0 1.0 Universal (public domain) and comes
from [ambientCG](https://ambientcg.com).** No attribution is required, nothing
is non-commercial, nothing needs permission to ship, judge or record. The
upstream IDs below are courtesy, not obligation.

ambientCG's blanket statement, from <https://ambientcg.com/license>:

> All ambientCG assets are provided under the Creative Commons CC0 1.0
> Universal License. This applies to the downloadable asset files and the
> material preview renders shown for each asset on the site.

**Total: 50 JPEGs, 105 MB.** Downloaded and committed — no CDN, no network
fetch at runtime. The game still runs offline. Two resolutions ship and the
renderer picks one per surface at load time; see §2 for which, and why not
everything is 4K.

**Normals are the OpenGL convention.** Every archive ships both
`_NormalGL` and `_NormalDX`; `_NormalGL` is the one that landed in
`normal.jpg`, because three.js reads green-up. If a surface ever lights as
though it is inside-out, that is the thing to check first.

---

## 1. WHAT IS IN EACH SLOT

Every slot ships a `2k/` directory. The three surfaces that fill the frame
also ship a `4k/` directory — see §2 for why only three.

| Slot | Upstream set | Source | Licence | Maps | 2k/ | 4k/ | Total |
|---|---|---|---|---|---|---|---|
| `ground-dirt` | Ground103 | [view?id=Ground103](https://ambientcg.com/view?id=Ground103) | CC0 1.0 | albedo, normal, rough, ao | 6.71 MB | 23.16 MB | 29.9 MB |
| `ground-gravel` | Gravel043 | [view?id=Gravel043](https://ambientcg.com/view?id=Gravel043) | CC0 1.0 | albedo, normal, rough, ao | 6.94 MB | 23.15 MB | 30.1 MB |
| `concrete` | Concrete036 | [view?id=Concrete036](https://ambientcg.com/view?id=Concrete036) | CC0 1.0 | albedo, normal, rough | 2.50 MB | 15.37 MB | 17.9 MB |
| `ground-sand` | Ground093A | [view?id=Ground093A](https://ambientcg.com/view?id=Ground093A) | CC0 1.0 | albedo, normal, rough, ao | 2.39 MB | — | 2.4 MB |
| `metal-plate` | DiamondPlate008C | [view?id=DiamondPlate008C](https://ambientcg.com/view?id=DiamondPlate008C) | CC0 1.0 | albedo, normal, rough, ao | 3.07 MB | — | 3.1 MB |
| `metal-rust` | Metal041C | [view?id=Metal041C](https://ambientcg.com/view?id=Metal041C) | CC0 1.0 | albedo, normal, rough | 2.53 MB | — | 2.5 MB |
| `metal-painted` | PaintedMetal006 | [view?id=PaintedMetal006](https://ambientcg.com/view?id=PaintedMetal006) | CC0 1.0 | albedo, normal, rough, ao | 6.25 MB | — | 6.3 MB |
| `metal-corrugated` | CorrugatedSteel005 | [view?id=CorrugatedSteel005](https://ambientcg.com/view?id=CorrugatedSteel005) | CC0 1.0 | albedo, normal, rough, ao | 2.44 MB | — | 2.4 MB |
| `wood-planks` | Planks021 | [view?id=Planks021](https://ambientcg.com/view?id=Planks021) | CC0 1.0 | albedo, normal, rough, ao | 3.30 MB | — | 3.3 MB |
| `rock` | Rock060 | [view?id=Rock060](https://ambientcg.com/view?id=Rock060) | CC0 1.0 | albedo, normal, rough, ao | 4.45 MB | — | 4.5 MB |
| `sandbag` | Fabric011 | [view?id=Fabric011](https://ambientcg.com/view?id=Fabric011) | CC0 1.0 | albedo, normal, rough | 2.70 MB | — | 2.7 MB |

`2k/` is 2048² throughout, `4k/` is 4096² throughout. Every map listed above
exists in `2k/`; `4k/` carries albedo, normal and rough only — never `ao.jpg`,
because nothing in `src/` reads one (see the AO note at the end of this
section).

`metal-corrugated` was added later than the other ten, for the depot roofs.
It is a plain rename-and-requantise of the official `CorrugatedSteel005_2K-JPG`
archive: `_Color` → `albedo.jpg` (q88), `_NormalGL` → `normal.jpg` (q90),
`_Roughness` → `rough.jpg` (q85), `_AmbientOcclusion` → `ao.jpg` (q85). No
resize, no colour correction, no recombination. Its `_Metalness` map was
discarded like every other one here — the renderer takes metalness from the
material, and this surface is uniform steel anyway.

Three sets have no `ao.jpg` — Concrete036, Metal041C and Fabric011 do not ship
an ambient occlusion map upstream. Nothing was synthesised to fill the gap.
Every set ships a real roughness map; none were faked.

## 2. TWO RESOLUTIONS, AND WHY NOT ELEVEN 4K SETS

### Layout

    public/assets/textures/<slot>/2k/albedo.jpg   normal.jpg  rough.jpg  [ao.jpg]
    public/assets/textures/<slot>/4k/albedo.jpg   normal.jpg  rough.jpg

`Textures.js` builds the path from the active render tier:

| Tier | `ground-dirt`, `ground-gravel`, `concrete` | the other eight | Maps fetched |
|---|---|---|---|
| `high` | `4k/` | `2k/` | albedo + normal + rough |
| `low` | `2k/` | `2k/` | albedo only |

`low` is what `detectTier()` sets when it sees SwiftShader, llvmpipe or Mesa
software rendering, and `?tier=high` / `?tier=low` forces either. The 4K
directory is named only after a positive `high`, so there is no path through
the loader that puts a 4096² fetch on a software rasteriser.

### Why only three slots are 4K

A 4096² map is **64 MiB of VRAM** once it is decoded to RGBA, and a third
again for its mip chain — 85 MiB apiece. The JPEG on disk is 6 MB and tells
you nothing about that. Three maps for each of eleven slots at 4K is:

| | decoded | with mips |
|---|---|---|
| 11 slots × 3 maps, all 4K | 2112 MiB | **2.75 GiB** |
| what ships: 3 slots 4K + 8 slots 2K | 960 MiB | **1.25 GiB** |
| `low` tier: 11 albedos at 2K, nothing else | 176 MiB | **0.23 GiB** |

2.75 GiB thrashes or kills most GPUs and is hopeless on the software
rasteriser the headless harness uses. 1.25 GiB is the compromise: 4K for the
two grounds and the concrete, which between them cover nearly every pixel of
the board, and 2K for the props.

`ground-sand` is a ground and still stays at 2K, for a different reason: the
depot ground shader reads its **albedo only**, and only as a partial splat
weight over the dirt. A 4K set there would be 255 MiB to make one blend layer
sharper.

### Bytes over the wire

VRAM is the constraint that shaped the layout, but this deploys to a CDN, so
what a client actually pulls matters too. The tier decides that as well,
because `low` fetches albedo and nothing else:

| | maps fetched | downloaded |
|---|---|---|
| `low` | 11 albedos at 2K | **10.25 MB** |
| `high` | 33 maps, 9 of them 4K | **85.52 MB** |
| in the repo and in `dist/` | all 50 JPEGs | **105 MB** |

85 MB of textures on a first visit is a lot — about a minute on a 10 Mbit
line — and per the mip table below it buys nothing visible. That is the number
to look at first if this needs to get smaller; `4k/` is 61.7 MB of it.

### Be honest about what 4K buys at this camera

The camera is orthographic with `VIEW_SIZE` 18, so on a 1600×757 canvas one
world unit is 42 px. `scale` decides how much screen a texel gets, and the
terrain runs at 0.33 — one repeat every 3.03 units, which is **128 px on
screen**:

| Surface | `scale` | repeat | on screen | mip sampled, 4K | mip sampled, 2K |
|---|---|---|---|---|---|
| terrain (`ground-dirt`) | 0.33 | 3.03 u | 128 px | 5.0 | 4.0 |
| concrete pad | 0.38 | 2.63 u | 112 px | 5.2 | 4.2 |
| gravel hardstanding | 0.50 | 2.00 u | 85 px | 5.6 | 4.6 |
| corrugated roof | 0.55 | 1.82 u | 77 px | 5.7 | 4.7 |
| a prop, object space | 4.6 | 0.22 u | 9 px | 8.8 | 7.8 |

Both tiers land on the *same* mip level — the 4K's extra detail lives in two
levels above the one the GPU ever addresses. Reaching mip 0 of a 4K terrain
map needs 1352 px per world unit against the 42 the tactical camera gives:
**32× tighter zoom than gameplay**, and even `CAM=detail` (view height 7) is
12× short.

That is arithmetic, so it was checked against pixels. The same headless
playthrough was run twice on the `high` tier — once normally, once with the
2K files served at the `4k/` URLs, so the shader path, the mip settings and
everything else were byte-identical and only the resolution moved. On the
pinned `CAM=detail` camera:

| Compared | Mean absolute difference, /255 |
|---|---|
| 4K against 2K, `high` tier both | **0.55 / 0.77 / 0.82** |
| `low` tier against `high` tier | 5.43 / 6.69 / 9.02 |

**0.55/255 is nothing** — under JPEG noise, and an order of magnitude below
the gap between the two tiers. And that 10×-larger gap is not resolution
either: it is `low` dropping the normal and roughness maps entirely. Whether a
surface has relief is what shows at this camera. How many texels its albedo
has does not.

The 4K set is a measured no-op at every camera the game actually uses.

It is kept anyway because it costs nothing at `low`, it is correct if this
ever runs at 4K display resolution or grows a free camera, and the tier
machinery is the part that had to be right. But if the 62 MB of `4k/`
directories ever needs to go, deleting them and dropping the three names from
`HAS_4K` in `Textures.js` is the whole change — the loader falls back to `2k/`
for any slot with no 4K variant, and nothing else moves.

What would *actually* show the resolution is a coarser repeat: a `scale` of
0.08 instead of 0.33 puts one repeat across 12.5 m and drops the terrain to
mip 3. That was deliberately **not** done. The 0.33 was tuned against visible
tiling, not against resolution — `Terrain.js` says so at the call site — and
winding it back would trade a repeat you can see for detail you cannot.

## 3. WHY EACH ONE

Chosen by looking at the sets, not by picking an ID out of the family.

| Slot | Reasoning |
|---|---|
| `ground-dirt` | The main terrain, so tiling behaviour mattered more than anything else. Tiled 2×2 against Ground102 and Ground109, this is the only one of the three with no visible repeat: Ground102 has diagonal streaks that line up into a grid, Ground109 has bright pebbles that read as a pattern. Ground103 is a flat neutral brown at distance, which is what a terrain wants. |
| `ground-gravel` | Tagged `industrial` and `pathway` rather than `beach`. The chunky pebble sets (Gravel022/023) are high-contrast and go to noise at distance. This one is a fine grey crushed-stone pan — depot hardstanding. |
| `ground-sand` | Wind-blown ripples, desert-tagged, and beige rather than the near-white of Ground093C. Fine enough to blend over dirt without fighting it. |
| `concrete` | The heaviest staining and patchy plaster loss of the family, which is what "worn exterior concrete" actually means. The bunker-tagged sets (Concrete031/032/033) carry cast-panel seams that tile into a visible cross-grid. |
| `metal-plate` | Dark steel tread plate, moderately worn. The pattern lives in the normal map, so the albedo stays a flat grey that tints cleanly. |
| `metal-rust` | Heavy corrosion with metal still showing through, rather than Rust009's uniform orange field. Reads as a drum that has been outside for years. |
| `metal-painted` | The only credible green painted metal on the site with proper chipping and scuffing. See the caveat below. |
| `metal-corrugated` | The magazine roofs are the largest single surface the tactical camera ever looks at, and they were being drawn as a procedural sine wave — regular enough to moiré, and with no fixings, no lap staining and no rust in the valleys. This set carries the profile in the NORMAL map (σ 54 on red, σ 2.9 on green: pure one-axis relief) over a plain weathered-galvanised albedo, so the ribs light correctly from any sun angle instead of being a painted stripe. CorrugatedSteel006A/B/C are the same geometry in bright green; 005 is the only bare-steel one. |
| `wood-planks` | Rough-sawn raw timber — pallets and crates, not flooring. Mid-tone, so it survives being tinted in either direction. |
| `rock` | Neutral grey-brown with strong cracked relief (normal-map σ 35, the strongest in the set). Rock029 is desert-correct but too saturated an orange; Rock051/062 carry moss. |
| `sandbag` | Coarse khaki weave. See the caveat below. |

## 4. CAVEATS — THREE SLOTS WHERE THE SITE DID NOT HAVE THE IDEAL THING

1. **`metal-painted` is sea-green, not olive drab.** ambientCG has five green
   metals and none of them is a military olive: PaintedMetal005 is lime,
   CorrugatedSteel006A/B/C are bright green *and* corrugated (ribbed geometry,
   wrong for flat panels). PaintedMetal006 is the closest, but the hue reads
   emerald and at dusk it will read teal. It is shipped unmodified — pull it
   toward olive with `material.color` rather than baking a hue shift in, the
   same way `Materials.js` already re-tints the Quaternius kits. If it still
   fights the palette, PaintedMetal014 is a neutral grey-green alternative
   with heavier rust.

2. **`concrete` has almost no surface relief.** Concrete036 is smooth-troweled,
   and its normal map measures σ 7 against σ 27 for the dirt and σ 35 for the
   rock. All of its character is in the albedo. That is the right trade for
   walls and barriers seen at tactical camera distance — no shimmer — but do
   not expect `normalScale` to buy much here. Concrete044D has real pitted
   relief (σ 11) if relief turns out to matter more than staining.

3. **`sandbag` is not true burlap.** ambientCG has no hessian or sacking scan
   at all — `burlap`, `sack`, `jute` and `canvas` all return zero results.
   Fabric011 is a coarse khaki basket weave; at sandbag scale the visible
   weave sells it, but the pattern is more regular than real hessian and will
   show its repeat if stretched large.

One more thing worth knowing: **`ground-sand/2k/ao.jpg` is effectively blank**
(mean 250/255, σ 2.3). Wind-blown sand has nowhere to occlude. It ships for
consistency with the other ground sets, but wiring it up buys nothing.

**No `ao.jpg` is loaded by anything.** `Textures.js` asks for `albedo.jpg`,
`normal.jpg` and `rough.jpg` and nothing else; there is no `aoMap` assignment
anywhere in `src/`. The eight AO maps are 6.5 MB of the library that ships to
the CDN and is never fetched. They are kept because they are part of the
upstream set and a future occlusion pass would want them — but they are kept
at 2K only, which is why `4k/` has three files and not four. A 4K set of them
would have been another 26 MB of deploy bytes for a file nothing requests.

## 5. PROCESSING

Source archives were the official downloads from `ambientcg.com/get`, at the
URL pattern `?file=<AssetID>_<Res>-JPG.zip`:

- `Ground103`, `Gravel043`, `Concrete036` — the **`_4K-JPG`** archives, which
  is where both the `4k/` and, indirectly, the `2k/` maps for those slots come
  from (see the note below).
- the other eight — the **`_2K-JPG`** archives.

Per map:

- **Renamed** `_Color` → `albedo`, `_NormalGL` → `normal`, `_Roughness` →
  `rough`, `_AmbientOcclusion` → `ao`.
- **Resized** to an exact square at the resolution of its directory.
- **No chroma subsampling** (`4:4:4`) on anything. Subsampling is tolerable on
  an albedo and actively wrong on a normal map, where the red and green
  channels are geometry rather than colour.
- **JPEG quality per map kind**, following what `metal-corrugated` already
  used: albedo q88, normal q90, rough q85, ao q85. Normals get the most
  because a JPEG block artefact in a normal map is a lighting artefact.
- **Roughness and AO converted to greyscale.** They are single-channel data —
  three.js reads roughness from green and AO from red, and a grey JPEG decodes
  to r=g=b. Costs nothing, saves about a third of the bytes.
- **Metadata stripped.**

No sharpening and no recombining of maps between sets. Every file except the
two named below is a plain resize of the CC0 original and stays trivially
re-verifiable against upstream.

### The 2k/ maps for the three 4K slots were not regenerated

`ground-dirt`, `ground-gravel` and `concrete` were **already** 2048² in the
repo, and those files are what the low tier has been drawing all along. They
were moved into `2k/` rather than re-derived from the 4K download, for two
reasons: a second generation of JPEG loss buys nothing, and a 4096→2048
downsample is measurably *sharper* than ambientCG's own 2K render (σ 21.6
against 20.2 on Ground103's albedo), so regenerating them would have quietly
changed the low tier's surface as a side effect of a 4K upgrade.

The other eight slots went 1024² → 2048² from their `_2K-JPG` archives, so for
those the low tier genuinely is sharper than before.

### Two albedo maps were colour-corrected to the biome

Both were originally `ffmpeg -vf selectivecolor` passes on the albedo only.
Normal and roughness are untouched, and CC0 permits derivative works without
conditions.

| File | What was wrong | Correction |
|---|---|---|
| `metal-painted/2k/albedo.jpg` | PaintedMetal006 is a saturated sea green. Every painted prop and both robot chassis sample this set, and at full strength it dragged the whole compound teal — a colour nothing in a semi-arid installation is. | Greens and cyans pushed toward yellow, then saturation to 0.22 with a little contrast back. The result is a near-neutral weathered paint that **each surface in `Materials.js` tints for itself** — olive for the hulls, khaki for hazard paint, grey for signage. The rust patches were deliberately preserved: a global hue rotation turned them magenta, which is why this is a selective correction and not a hue shift. |
| `ground-dirt/4k/albedo.jpg` | Ground103 carries green lichen and moss flecks. It is a temperate soil, and the flecks read as damp ground under a low sun. | Greens pushed to yellow-brown and overall saturation to 0.88, so the flecks become dry litter. The soil colour itself is unchanged. |

#### The filter strings are lost, so the grade was recovered as a LUT

This file used to claim the two `selectivecolor` strings were "in the commit
that introduced them". They are not, and never were — no commit on any branch
in this repository contains the word outside this document. That only came to
light when the 4K upgrade needed to re-apply the grade to a fresh download.

A per-pixel colour grade is a pure function of colour, so it can be recovered
from the pair of images instead of from the command that made it: bin every
pixel of the upstream original by its RGB, average the corrected pixel at the
same coordinate, and that *is* the function. Both grades were refitted this
way as 32³ `.cube` LUTs against the exact archive the original author graded
(`Ground103_2K-JPG` and `PaintedMetal006_1K-JPG`) and re-applied to the new
source with `ffmpeg -vf lut3d`. How well it worked:

| | size of the original grade | residual after the LUT |
|---|---|---|
| `metal-painted` albedo | MAE 31.6 / 26.0 / 16.2 | **3.2 / 3.2 / 3.2** |
| `ground-dirt` albedo | MAE 4.3 / 3.6 / 4.5 | **3.7 / 3.4 / 4.0** |

The `metal-painted` number is the meaningful one: a 90% recovery of a large
grade, with the residual down at the level of JPEG noise. The `ground-dirt`
grade is small enough in aggregate that JPEG noise dominates the MAE, so it
was checked where it actually acts instead — on the green lichen flecks:

| | share of pixels with g ≥ r | their mean RGB |
|---|---|---|
| Ground103 as downloaded | 0.319% | 105, 115, 45 |
| the graded file in the repo | 0.175% | 52, 54, 45 |
| LUT re-applied | 0.050% | 42, 43, 39 |

Flecks crushed toward dark neutral, which is what §5 says the grade was for,
and global mean and saturation land within 0.5/255 and 0.002 of the committed
file. The LUT goes a little further than the original did; that is in the safe
direction for a semi-arid biome.

The two `.cube` files are reproducible from the repo and the upstream archives
by the method above, so they are not committed. Anyone redoing this should
refit rather than trust a number in a document — which is the lesson here.

### What was discarded

Each archive also contains `_Displacement`, `_NormalDX`, and sometimes
`_Metalness` or `_Opacity`, plus `.blend`, `.usdc`, `.mtlx` and `.tres`
material definitions and a preview `.png`. None of it is in the repo.
Displacement needs tessellation this renderer does not do; NormalDX is the
wrong handedness; the metalness maps belong to sets used here as dielectrics.
Re-download from the links above if any of that is ever wanted.

## 6. SWAPPING A SET

The filenames are fixed — `albedo.jpg`, `normal.jpg`, `rough.jpg` and the
optional `ao.jpg` — and they now live one level down, under `2k/` and
optionally `4k/`. Drop a replacement set in under the same slot name with the
same filenames in `<slot>/2k/` and it is picked up on reload.

A slot needs no `4k/` directory. The loader only looks there for the names in
`HAS_4K` in `Textures.js`, and falls back to `2k/` for everything else, so
adding or removing a 4K variant is one line plus the files. `2k/` is not
optional: it is the only thing the low tier ever fetches.

If you pull a new set from ambientCG, take the **NormalGL** file, and check it
still has a roughness map before committing to it.

## 7. THE REST OF THE ASSETS

Models are documented at [`../SOURCES.md`](../SOURCES.md), audio at
[`../../audio/SOURCES.md`](../../audio/SOURCES.md). Both are also entirely CC0.
