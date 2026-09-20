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

**Total: 41 JPEGs, 22.5 MB.** Downloaded and committed — no CDN, no network
fetch at runtime. The game still runs offline.

**Normals are the OpenGL convention.** Every archive ships both
`_NormalGL` and `_NormalDX`; `_NormalGL` is the one that landed in
`normal.jpg`, because three.js reads green-up. If a surface ever lights as
though it is inside-out, that is the thing to check first.

---

## 1. WHAT IS IN EACH SLOT

| Slot | Upstream set | Source | Licence | Maps | Res | Size |
|---|---|---|---|---|---|---|
| `ground-dirt` | Ground103 | [view?id=Ground103](https://ambientcg.com/view?id=Ground103) | CC0 1.0 | albedo, normal, rough, ao | 2048 | 6.9 MB |
| `ground-gravel` | Gravel043 | [view?id=Gravel043](https://ambientcg.com/view?id=Gravel043) | CC0 1.0 | albedo, normal, rough, ao | 2048 | 6.9 MB |
| `ground-sand` | Ground093A | [view?id=Ground093A](https://ambientcg.com/view?id=Ground093A) | CC0 1.0 | albedo, normal, rough, ao | 1024 | 448 KB |
| `concrete` | Concrete036 | [view?id=Concrete036](https://ambientcg.com/view?id=Concrete036) | CC0 1.0 | albedo, normal, rough | 2048 | 2.5 MB |
| `metal-plate` | DiamondPlate008C | [view?id=DiamondPlate008C](https://ambientcg.com/view?id=DiamondPlate008C) | CC0 1.0 | albedo, normal, rough, ao | 1024 | 840 KB |
| `metal-rust` | Metal041C | [view?id=Metal041C](https://ambientcg.com/view?id=Metal041C) | CC0 1.0 | albedo, normal, rough | 1024 | 520 KB |
| `metal-painted` | PaintedMetal006 | [view?id=PaintedMetal006](https://ambientcg.com/view?id=PaintedMetal006) | CC0 1.0 | albedo, normal, rough, ao | 1024 | 1.3 MB |
| `metal-corrugated` | CorrugatedSteel005 | [view?id=CorrugatedSteel005](https://ambientcg.com/view?id=CorrugatedSteel005) | CC0 1.0 | albedo, normal, rough, ao | 1024 | 656 KB |
| `wood-planks` | Planks021 | [view?id=Planks021](https://ambientcg.com/view?id=Planks021) | CC0 1.0 | albedo, normal, rough, ao | 1024 | 704 KB |
| `rock` | Rock060 | [view?id=Rock060](https://ambientcg.com/view?id=Rock060) | CC0 1.0 | albedo, normal, rough, ao | 1024 | 1.1 MB |
| `sandbag` | Fabric011 | [view?id=Fabric011](https://ambientcg.com/view?id=Fabric011) | CC0 1.0 | albedo, normal, rough | 1024 | 744 KB |

`metal-corrugated` was added later than the other ten, for the depot roofs.
It is a plain rename-and-requantise of the official `CorrugatedSteel005_1K-JPG`
archive: `_Color` → `albedo.jpg` (q88), `_NormalGL` → `normal.jpg` (q90),
`_Roughness` → `rough.jpg` (q85), `_AmbientOcclusion` → `ao.jpg` (q85). No
resize, no colour correction, no recombination. Its `_Metalness` map was
discarded like every other one here — the renderer takes metalness from the
material, and this surface is uniform steel anyway.

Three sets have no `ao.jpg` — Concrete036, Metal041C and Fabric011 do not ship
an ambient occlusion map upstream. Nothing was synthesised to fill the gap.
Every set ships a real roughness map; none were faked.

## 2. WHY EACH ONE

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

## 3. CAVEATS — THREE SLOTS WHERE THE SITE DID NOT HAVE THE IDEAL THING

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

One more thing worth knowing: **`ground-sand/ao.jpg` is effectively blank**
(mean 250/255, σ 2.3). Wind-blown sand has nowhere to occlude. It ships for
consistency with the other ground sets, but wiring it up buys nothing.

## 4. PROCESSING

Source archives were the official `<Asset>_2K-JPG.zip` / `_1K-JPG.zip`
downloads from `ambientcg.com/get`. Per map:

- **Renamed** `_Color` → `albedo`, `_NormalGL` → `normal`, `_Roughness` →
  `rough`, `_AmbientOcclusion` → `ao`.
- **Resized** to an exact square at the resolution in the table above.
- **JPEG quality 85, no chroma subsampling** (`4:4:4`). Subsampling is fine for
  an albedo and actively wrong for a normal map, where the red and green
  channels are geometry rather than colour; one setting for all four maps is
  simpler than remembering which is which.
- **Roughness and AO converted to greyscale.** They are single-channel data —
  three.js reads roughness from green and AO from red, and a grey JPEG decodes
  to r=g=b. Costs nothing, saves about a third of the bytes.
- **Metadata stripped.**

No sharpening and no recombining of maps between sets. Every file except the
two named below is a plain resize of the CC0 original and stays trivially
re-verifiable against upstream.

### Two albedo maps were colour-corrected to the biome

Both are `ffmpeg -vf selectivecolor` passes on the albedo only. Normal and
roughness are untouched, and CC0 permits derivative works without conditions.

| File | What was wrong | Correction |
|---|---|---|
| `metal-painted/albedo.jpg` | PaintedMetal006 is a saturated sea green. Every painted prop and both robot chassis sample this set, and at full strength it dragged the whole compound teal — a colour nothing in a semi-arid installation is. | Greens and cyans pushed toward yellow, then saturation to 0.22 with a little contrast back. The result is a near-neutral weathered paint that **each surface in `Materials.js` tints for itself** — olive for the hulls, khaki for hazard paint, grey for signage. The rust patches were deliberately preserved: a global hue rotation turned them magenta, which is why this is a selective correction and not a hue shift. |
| `ground-dirt/albedo.jpg` | Ground103 carries green lichen and moss flecks. It is a temperate soil, and the flecks read as damp ground under a low sun. | Greens pushed to yellow-brown and overall saturation to 0.88, so the flecks become dry litter. The soil colour itself is unchanged. |

To re-derive either from a fresh download, the two filter strings are in the
commit that introduced them.

### What was discarded

Each archive also contains `_Displacement`, `_NormalDX`, and sometimes
`_Metalness` or `_Opacity`, plus `.blend`, `.usdc`, `.mtlx` and `.tres`
material definitions and a preview `.png`. None of it is in the repo.
Displacement needs tessellation this renderer does not do; NormalDX is the
wrong handedness; the metalness maps belong to sets used here as dielectrics.
Re-download from the links above if any of that is ever wanted.

## 5. SWAPPING A SET

The layout is fixed and flat — `<slot>/albedo.jpg`, `normal.jpg`, `rough.jpg`,
optional `ao.jpg`. Drop a replacement set in under the same slot name with the
same four filenames and it is picked up on reload. If you pull a new set from
ambientCG, take the **NormalGL** file, and check it still has a roughness map
before committing to it.

## 6. THE REST OF THE ASSETS

Models are documented at [`../SOURCES.md`](../SOURCES.md), audio at
[`../../audio/SOURCES.md`](../../audio/SOURCES.md). Both are also entirely CC0.
