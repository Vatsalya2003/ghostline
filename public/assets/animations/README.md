# animations

No files. Skeletal animation is embedded in the .glb models themselves.

- `../models/squad-walker.glb` — Idle, Walk, Run, Attack, Shoot, Jump, Death
- `../models/hostile-heavy.glb` — Idle, Walk, Run, Attack, Attack.001, Shoot,
  Jump, Death

GHOSTLINE plays `Idle` and `Walk`; the rest ship with the file and cost
nothing extra. Clips are named `CharacterArmature|<Clip>` in the glTF and are
looked up by the part after the pipe — see `Unit.loadModel` in
[`src/render/Units.js`](../../../src/render/Units.js).

The drone's motion (hover, rotor spin, gimbal sweep, flight path) is
procedural, not skeletal — see [`src/render/Drone.js`](../../../src/render/Drone.js).
