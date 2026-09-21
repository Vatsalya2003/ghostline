# animations

No files. Skeletal animation is embedded in the .glb models themselves.

- `../models/squad-mech.glb` — Idle, Walk_Holding, Run_Holding, Shoot,
  SwordSlash, Death, HitRecieve_1
- `../models/hostile-heavy.glb` — Idle, Walk, Run, Attack, Attack.001, Shoot,
  Jump, Death

The squad mech shipped with twenty clips and keeps the seven this game drives;
the rest were pruned out of the file — see [`../SOURCES.md`](../SOURCES.md)
§3.6. They are remapped on load onto the names `Unit.play` asks for, because
the pack's plain `Idle`/`Shoot` clips leave the arms in the rest pose and only
the `_Holding` variants hold a weapon. `Walk_Holding` becomes `Walk`,
`Run_Holding` becomes `Run`, `SwordSlash` becomes `Attack`, and `Idle` has the
carry pose grafted into it. See `tacticalClips` in
[`src/render/Units.js`](../../../src/render/Units.js).

Clips are named `<Armature>|<Clip>` in the glTF and are looked up by the part
after the pipe. Bone names arrive with their dots stripped — `UpperArm.R` in
the file is `UpperArmR` at runtime — because GLTFLoader runs every node name
through `PropertyBinding.sanitizeNodeName`.

The drone's motion (hover, rotor spin, gimbal sweep, flight path) is
procedural, not skeletal — see [`src/render/Drone.js`](../../../src/render/Drone.js).
