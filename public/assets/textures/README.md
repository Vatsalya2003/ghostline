# textures

Eleven CC0 PBR surface sets, one directory per material slot — see
[`SOURCES.md`](SOURCES.md) for what each one is, where it came from and the
three slots where the source library did not have the ideal thing.

Two resolutions ship, and the filenames are fixed:

    <slot>/2k/albedo.jpg  normal.jpg  rough.jpg  [ao.jpg]     all eleven slots
    <slot>/4k/albedo.jpg  normal.jpg  rough.jpg               three slots

Normals are OpenGL convention (`_NormalGL`, green up) — three.js reads them
that way, and a `_NormalDX` here lights surfaces inside-out.

`detectTier()` in `Textures.js` picks the directory: `high` reads `4k/` for
`ground-dirt`, `ground-gravel` and `concrete` and `2k/` for everything else,
`low` reads `2k/` for all eleven and fetches albedo only. `low` is what a
software rasteriser gets, and it can never name a 4K file.

Only three slots are 4K because a 4096² map is 64 MiB of VRAM decoded, 85 MiB
with its mip chain — all eleven sets at 4K would be 2.75 GiB. **§2 of
[`SOURCES.md`](SOURCES.md) has the VRAM table, the per-surface mip arithmetic,
and an honest note that 4K changes nothing at the tactical camera.**

These sets reach the geometry by **triplanar projection**, not by UV. Nothing
in the kit has usable texture coordinates — most props carry no `TEXCOORD_0`
at all and the character rigs put every vertex on a single palette texel — so
the surfaces are projected in world space and blended by face normal. See
[`src/render/Textures.js`](../../../src/render/Textures.js).

## Historical note

This directory used to be empty, and the note below explains why the model
assets are built the way they are — it still describes the files themselves.

> The environment and character models are untextured low-poly geometry coloured
> entirely by material — which is precisely why they could be re-tinted into the
> GHOSTLINE palette wholesale (see `../materials/README.md`). It also keeps the
> whole asset set to ~2.4 MB with no image decode on load.
>
> The one procedural texture in the project is the ground: worn concrete with
> expansion joints and a faint survey grid, drawn to a canvas at startup by
> `makeGroundTexture` in [`src/render/Scene.js`](../../../src/render/Scene.js).
