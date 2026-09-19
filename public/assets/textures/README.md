# textures

No files. Nothing in this scene is texture-mapped.

The environment and character models are untextured low-poly geometry coloured
entirely by material — which is precisely why they could be re-tinted into the
GHOSTLINE palette wholesale (see `../materials/README.md`). It also keeps the
whole asset set to ~2.4 MB with no image decode on load.

The one procedural texture in the project is the ground: worn concrete with
expansion joints and a faint survey grid, drawn to a canvas at startup by
`makeGroundTexture` in [`src/render/Scene.js`](../../../src/render/Scene.js).
