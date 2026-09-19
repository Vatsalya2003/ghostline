# materials

No files. Every surface in GHOSTLINE is defined in code, in
[`src/render/Materials.js`](../../../src/render/Materials.js).

The CC0 models under `../models` and `../environment` ship their own
daylight-tuned materials. Those are never rendered: `Materials.js` holds one
table mapping each kit material name (`Main`, `Accent`, `DarkGrey`, `Eye`, …)
to a GHOSTLINE surface, and `AssetLoader.js` applies it once per file at parse
time, before the model is shown. One `THREE.MeshStandardMaterial` per surface
is then shared by every mesh that asks for it.

Editing a colour here means editing `SURFACE` in that file — not a .glb.
