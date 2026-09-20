# GHOSTLINE — mission 3 (LONG MATCH) port notes

**Owner:** story integration · **Last updated:** Sat 19 Sep 2026, 17:10 PDT

Where the third mission came from, what was taken, what was deliberately left
behind, and what it cost the engine. Short version: **the story came from the
`Teja` branch, the engine did not.**

---

## 1. WHAT THIS IS

`Teja` (origin/Teja, `2ac4a8f`) carries a new mission — an ammunition depot
with civilians in it — written as a **navigated, four-room mission** on top of
its own turn spine. We wanted the story, not the spine.

So mission 3 is Teja's narrative re-cut onto **our** six-turn engine. It is a
data file plus a row in the registry, which is the promise the architecture has
been making since mission 1.

| | |
|---|---|
| id | `long-match` (`?mission=long-match`) |
| data | `src/data/mission3.js` |
| subtitle | OPERATION LONG MATCH — AMMUNITION DEPOT 4 |
| environment | ground — the existing compound, no new level |
| squad | ALPHA / BETA-1 / BETA-2, two drones, one demolition charge |

**Source material** — `GHOSTLINE Ammunition Depot Storyline.pdf` (copied from
the Teja branch, the original design brief) and Teja's `src/data/depot.js`,
which is the more developed version and the one the dialogue comes from.

---

## 2. THE STRUCTURAL PROBLEM, AND HOW IT WAS SOLVED

Teja's mission is a **room graph**: four rooms, free movement, and the trust
lesson attached to whichever room you walk into. Ours is a **turn list**.

The temptation was to import `RoomManager.js` (232 lines) and `FacilityMap.js`
(111 lines). That would have given us two mission engines and two map UIs.
Instead the graph was flattened into six turns, and the one branch that carries
the mission was rebuilt out of parts the engine already had:

```
1 THE WIRE        ALPHA's clean, working-shown HIGH. Trust is rewarded.
2 LOADING BAY     BETA-1 loses half its arc, then calls the north room clear.
3 THE FORK        people north, objective east.          ← the branch
4 FIGURE FOUR     the key turn. Variant: the corridor, if you went east.
5 THE MAGAZINE    "Confidence NONE. This one is yours."
6 LONG MATCH      the egress arithmetic, and what it does not count.
```

**The fork needed no engine change.** `TurnManager.resolveTurn()` and
`resolveOutcome()` already pick `variants` by `when` / `unless` against
`GameState.test()`, and `setsFlag` already writes arbitrary flags. So:

- `PUSH_EAST` sets `bypassedHolding`
- turn 4 has a `when: 'bypassedHolding'` variant that replaces the whole scene
  with the magazine corridor — including its own `actions` and `outcomes`
- turn 6 reads the flags again and tells you what the charge took with it

That is Teja's `altIfScouted` / `altUnless` expressed in our existing idiom,
with no second resolver.

---

## 3. WHAT THE STORY CONNECTS TO (all pre-existing)

| Story beat | Our mechanic |
|---|---|
| Two drones, and the button reading NO DRONES when it matters | resource ledger — `spends` / `consumesDrone`, `availableActions()` |
| The demolition charge | `roster` payload `charges: 1`, spent at the magazine |
| BETA-1's arc breaking | `intro` beats — `status` / `alert` / `shake`, already in `Director.playIntro()` |
| Confidence vs. what the sensor can see | `ai.confidence` + `sourceStatus` on `AI_RECOMMENDATION` |
| Four rooms as places you can point at | `mission.sites` → `TacticalMap` gazetteer |
| Three objectives that can disagree | `objectives[]` with `flag` / `survive` |
| Trust grading | `CALIBRATION` tags, `dominantTag()`, `keyTurn` |

Nothing new was rendered, and no new UI system was added.

---

## 4. ENGINE CHANGES — all additive, all generic

Four, and only one is more than a couple of lines.

1. **`src/data/mission1.js`** — two new `ACTION_LABELS`, `PUSH_NORTH` /
   `PUSH_EAST`. The fork needed verbs.
2. **`src/ui/Debrief.js`** — outcome copy was hardcoded to Dry Creek, so every
   mission signed off with *"Relay restored"*. A mission can now declare
   `outcomeCopy`, and an entry may be a list of `{ when, unless, … }` — same
   first-match-wins rule as turn variants. The old strings are the fallback, so
   **mission 1 is byte-identical**.
3. **`GameState` / `TurnManager`** — `setsFlag` now also records into
   `state.flags`, and `summary()` carries it. Three lines. It is what lets the
   debrief tell *"you shot her"* apart from *"you never opened the door"*.
4. **`scripts/verify.mjs`** — the data-shape pass now runs over every mission in
   the registry instead of only mission 1, with the failing mission named. The
   path walk is unchanged and still mission 1 only.

**Pre-existing bugs this surfaced**, both fixed:
- mission 2 never declared `criticalIntegrity` (silently defaulting to 25)
- the briefing screen headline was the literal string `RELAY STATION 7` for
  every mission; it is now derived from the subtitle

---

## 5. DELIBERATELY NOT IMPORTED FROM TEJA

| | Why |
|---|---|
| `src/systems/RoomManager.js` | a second mission engine. Its branching is `variants`, which we have. |
| `src/ui/FacilityMap.js` | a second map UI, and it collides with `#map-box`. We have the minimap and the [M] overlay. |
| Teja's `GameState.js` | taking it deletes our per-unit squad model. Only the two flags were wanted. |
| Teja's `Director.js` | its break beat is expressible as `intro` data, which is where it now lives. |
| Teja's `main.js` | it makes the depot the *default* mission. Dry Creek stays default here. |
| Teja's `scripts/sim.mjs` | ours already drives any mission via the registry. |
| Alarm clock / `movesLeft` | belongs to room traversal. The pressure is carried by the drone count and the charge instead. |
| `#map-box` CSS and markup | direct collision with the tactical map. |

---

## 6. VALIDATION

- `npm run verify` — 248,679 assertions, data shape now checked for all three
  missions
- exhaustive walk of mission 3 — 553 paths, 31,741 assertions, all 20
  committing outcomes reached, all of complete / partial / aborted reachable
- debrief copy checked on every reachable ending of all three missions: no
  mission leaks another's fiction
- `npm test` (70 input + 68 map), `npm run state` (107), `npm run build` — pass

**Known flaky:** `npm run map` (`verify-map.mjs`) fails 1–2 of 35 checks
non-deterministically, with a different check failing each run, on this branch
with or without mission 3. It is a timing issue in that harness, not a
regression from this work.
