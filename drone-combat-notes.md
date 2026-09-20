# DRONE · COMBAT · WORLD REACTION — build notes

What the recon aircraft, the weapons and the burning compound do now, the data
that drives them, and the two hooks other systems can pull.

**Verify it:** `node scripts/verify-fx.mjs` — 52 checks, drives real mission
scenarios in headless Chromium. `--shots` writes PNGs to `/tmp` for a look.

---

## 1. RECON IS MISSION-AWARE

The drone used to fly to a place the *renderer* picked from the turn number.
That works for one rehearsed mission and breaks the moment the mission file
changes shape — a reordered turn, a reskin, a second mission, and the aircraft
is flying to coordinates that belong to a map nobody is looking at.

Destinations now resolve from data, first hit wins
(`src/render/ReconSites.js`):

| # | Source | Example |
|---|---|---|
| 1 | `outcome.site` | `site: 'north-entrance'` or `site: { x: 4, z: -2 }` |
| 2 | `outcome.reveal` → the prop's **own world position** | `reveal: 'generator'` |
| 3 | `turn.recon` | `recon: 'entry'` |
| 4 | `mission.sites[key]` — a mission's own gazetteer | see below |
| 5 | The level gazetteer (`PLACES` in `Level.js`) | `'relay'`, `'extraction'` |
| 6 | The old per-turn table | unchanged, so nothing breaks |

A mission set somewhere else declares its own places and needs no render change:

```js
export const mission = {
  sites: {
    'north-entrance': { x: -6.5, z: 5.2, hover: 3.2, label: 'NORTH ENTRANCE' },
    'ammunition-store': { x: 5.5, z: -5.5, hover: 4.6, label: 'AMMUNITION STORE' },
  },
  turns: [{ id: 1, recon: 'north-entrance', /* … */ }],
};
```

Dry Creek declares `recon` on all six turns. Nothing about a grade changed.

### The sortie is a sequence now

**COMMAND → LAUNCH → FLIGHT → ARRIVAL → SCAN → RESULT → RETURN**, and each beat
is visible:

- **COMMAND** — the destination is painted on the ground *before* the aircraft
  moves, labelled with the place (`RECON TASKED · W OUTBUILDING`), and the
  mission log says where it was sent.
- **FLIGHT** — arced, banked, transit time scaled by distance.
- **ARRIVAL** — fog lifts *where it looked, when it got there*; the camera
  settles onto the ground being read; the marker switches to `SCANNING`.
- **RESULT** — this is the fix that mattered most: the turn now waits for
  `onRead` (the aircraft has *finished* looking) before the log line, the
  reveal, the contacts and the AI's response land. Previously all of it fired
  while the drone was still on the pad, which made the sortie decorative.
- **RETURN** — flies home on a mirrored arc and lands; the marker settles to
  `SURVEYED` and fades.

The wait is raced against a 6-second timeout, so no sortie — killed by a
restart, stalled by anything — can leave the command bar locked.

---

## 2. COMBAT IS WHERE IT HAPPENED

Already largely present and left alone: muzzle flash, tracers down the line of
fire, strike sparks, a thrown grenade with a real arc and fuse, explosions with
flash / fireball / shock ring / debris / pooled light.

Added:

- **Lingering smoke on every explosion** (`CombatFX.smokeCloud`) — the one-shot
  layer's smoke, a couple of seconds, distinct from a fire that keeps burning.
- **Aim points come from data.** `Director.aimPoint()` resolves through the same
  site resolver, and the ambush contacts come from `turn.contacts` in the
  mission file rather than two coordinate pairs typed into `Director.js` twice.
- **The breach charge aims at the door's own position**, not at `(2.6, 2)`.

---

## 3. FIRE, AND THE SITUATION GETTING WORSE

`src/render/Hazards.js`. Fires are **state**, not events: lit by something that
happened at a place, and still burning — worse — several turns later.

- `Director.enterTurn` escalates every live fire once per turn. One turn is
  exactly one escalation however long the player takes over the decision.
- The flame is three stacked cones on separate flicker phases, growing mostly
  upward; the smoke column is a 30-particle system that drifts on a fixed wind
  and is deliberately the loud part, because it is what carries the fire from
  across the compound.
- Ground scorch grows with the fire and stays after it is out.
- Three pooled lights follow the three biggest fires.

Lit by data — the mission names the ground, this layer never invents one:

```js
FIRE: { ignite: 'generator', /* … */ }   // a named prop, a site key, or {x,z}
{ type: 'breach', ignite: true }          // "here, where the charge went off"
turn.hazards: ['generator']               // already burning when the turn opens
```

Dry Creek lights three, all of which its own prose already describes: rounds
into the generator, the breach charge on the door, and a frag into the cabling.

### Hook for whoever owns the sensor cones

`fx.hazards.occlusionAt(x, z)` returns 0–1 for how much smoke sits over a point.
**Nothing consumes it yet, deliberately** — quietly shrinking someone else's
cone from inside this file is how two systems end up disagreeing about what the
player can see. If you want smoke to blind a sensor, the number is there and it
already agrees with what is on screen.

---

## 4. LOSING A VEHICLE

`src/render/VehicleLoss.js`. Gameplay decides; this plays it.

**CRITICAL → UNSTABLE → SHUTDOWN → COLLAPSE → WRECK.** Sparks off the chassis,
a stagger, emissives dying and the sensor cone collapsing to nothing, then it
goes down on its side. `lost` ends in a secondary explosion and a wreck that
burns; `disabled` ends in one that smokes. **The vehicle is never removed** —
it stays where it fell, and `moveSquad` will not order a wreck to walk.

Wired to the events `GameState` already emits, with no coordination needed:

| Event | What plays |
|---|---|
| `unitDamaged` with `critical: true` | the machine starts smoking, and keeps smoking |
| `unitDisabled` | the full sequence, ending in a smoking wreck |
| `unitLost` | the same, ending in a secondary and a burning wreck |

**Losses are queued, not played on arrival.** State is applied before the
Director has drawn the shot that caused it, so a sequence played straight off
the event would have the machine collapse *before* the burst that killed it.
`playPendingLosses()` runs them after the hit lands and before anyone moves.

A restart stands every wreck back up (`restoreVehicle`), which `setStatus` alone
does not do: the tilt, the dead emissives and the stopped animation are this
system's to undo.

---

## 5. TWO BUGS WORTH KNOWING ABOUT

**A restart could leave last run's effects in the new mission.** A beat in
flight kept running after `startMission()`, so a breach charge from the previous
run lit a fire in the new one. `Director` now carries a `runId`, bumped on
reset, and every awaited beat bails if it belongs to a dead run.

**gsap cannot pace a cinematic in this project.** `main.js` runs
`gsap.ticker.lagSmoothing(0)` on purpose, so one long frame advances every
scheduled callback at once — a three-second frame fires a three-second sequence
in a single tick. The loss sequence is therefore paced on `Pause.wait`, like the
Director's own beats, which keeps real time at any frame rate *and* pauses with
the pause menu. Worth remembering before timing anything else with
`gsap.delayedCall`.

The same effect is why `verify-fx.mjs` hooks the sortie's phase callbacks
instead of sampling positions: on software WebGL the aircraft is on the pad,
then home, and no poll on any interval ever sees it in the air.
