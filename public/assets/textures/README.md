# textures

Ten CC0 PBR surface sets, one directory per material slot — see
[`SOURCES.md`](SOURCES.md) for what each one is, where it came from and the
three slots where the source library did not have the ideal thing.

Layout is flat and fixed: `<slot>/albedo.jpg`, `normal.jpg`, `rough.jpg`, and
`ao.jpg` where the upstream set provides one. Normals are OpenGL convention.

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
