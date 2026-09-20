# GHOSTLINE — TEAM BRIEF
### Defense Tech Jam 2026 · Trust Your Synthetic Teammates (NAWCTSD)
### Read this first. ~5 minutes.

> ⚠️ **This is the original pre-production brief, kept for the pitch, the team
> split and the design rationale — all of which still hold.** The six-turn
> mission it describes is DRY CREEK, which is now on disk unregistered as the
> fallback. **The shipped build is AMMUNITION DEPOT, eleven turns, and its key
> beat is turn 7, not turn 3.** For what actually ships, read
> [README.md](README.md) and [mission-walkthrough.md](mission-walkthrough.md).

---

## 1. WHAT WE'RE MAKING

A short, tense tactical game about **when to trust an AI teammate.**

You're a commander at a base. Your squad is robots in the field. You see the
world only through their sensors. Each turn the squad's AI recommends an
action and states how confident it is — but sensors break, and a broken
sensor still reports confidently.

**The player's job:** decide when the machine has earned trust, and when it
hasn't.

**Judged on two things only:** creativity of approach, and engagement of
gameplay. Not technical complexity. That shapes every decision we make — a
finished, fun, one-mission game beats an ambitious unfinished one.

---

## 2. THE ONE IDEA THAT MAKES THIS WORK

**You can see the sensor cones.**

Each robot projects a visible cone on the map showing what it can actually
perceive. The AI's *confidence* is a number it tells you. The *cone* is its
real capability.

When a robot's sensor is damaged, its cone visibly shrinks and fills with
static — but the AI may still report HIGH confidence from that broken cone.

That contradiction, visible on screen, is the entire game. Everything else
supports it.

---

## 3. PLAYER FLOW (screen by screen)

```
TITLE  →  BRIEFING  →  MISSION (6 turns)  →  DEBRIEF
                            ↑                    │
                            └──── replay ────────┘
```

### Title
Name, "Begin Mission", short atmospheric hold. Keep it to a few seconds.

### Briefing
Mission objective + how to play. Skippable after first view.

### Mission — the core loop, repeated 6 times

```
1. SITUATION      camera pans to the action; log line appears
2. AI SPEAKS      voice line + typed caption + confidence meter
3. STATUS SHOWN   which units are healthy / glitched / damaged
4. PLAYER CHOOSES contextual buttons (3–5 available per turn)
5. OUTCOME        units move, damage lands, fog lifts, log updates
6. CONSEQUENCE    squad health changes; decision is silently graded
```

### Debrief
Did you survive? *And separately* — did you trust well? Breakdown of the
five failure modes, plus a verdict line naming the habit to fix.

**Important:** these are two different scores. You can complete the mission
and still be told your judgment was poor. That split is the point of the
whole design.

---

## 4. THINGS IN THE GAME (object list)

### Units
| Object | Role |
|---|---|
| **ALPHA** (badge 1) | Speaks to the player. Relays recommendations. Has a sensor cone. |
| **BETA-1** (badge 2) | Squad member. **Its sensor breaks in Turn 3** — the key beat. |
| **BETA-2** (badge 3) | Squad member. Stays healthy. Baseline for comparison. |
| **Drone** | Deployable scout. Reveals area without risking the squad. |
| **Hostiles** | Hidden until revealed. Never visible through a broken cone. |

Each unit has a **status**: Healthy (cyan) · Sensor Glitch (amber) ·
Damaged (red).

### Level objects
Walls (block cones) · Breach door (Turn 3) · Crates and debris (cover and
texture) · Dead generator (Turn 2's false alarm) · Relay tower (the
objective) · Relay console (Turn 5)

### Screen elements
Sensor cones · Fog of war · Comms panel (caption + confidence meter) ·
Command bar · Squad health · Turn counter · Mission log · Debrief report

### Player actions
`CONFIRM` · `ASK WHY` · `SEND DRONE` · `NIGHT VISION` · `FIRE` ·
`SWITCH WEAPON` · `GRENADE` · `FALL BACK` · `ABORT`

Only 3–5 are available on any given turn, chosen per turn in the data.

---

## 5. THE SIX TURNS

Each turn teaches one way people misjudge AI. This is straight from the
sponsor's brief.

| # | Turn | Situation | Lesson |
|---|---|---|---|
| 1 | Approach | Clean sensors, clear path, high confidence | Trusting a verified system is correct |
| 2 | Contact | AI says "I can't resolve this" | Use your verification tools |
| 3 | **Breach** ⚠ | Sensor breaks, then reports HIGH confidence | **Check the source, not just the number** |
| 4 | Interior | Honest LOW confidence, cautious advice | Admitting uncertainty earns trust |
| 5 | Relay | AI says the task is outside its scope | Don't push a system past its limits |
| 6 | Extract | Good advice, but your squad is damaged | The AI isn't accounting for everything |

**Turn 3 is what we demo to judges.** Everything else exists to set it up
and pay it off.

---

## 6. TECH

| Layer | Choice |
|---|---|
| **Renderer** | Three.js (3D) or Phaser (2D) — **decided by a 3-hour spike** |
| **Build** | Vite |
| **Language** | Vanilla JS, ES modules |
| **UI** | HTML + CSS overlaid on the canvas |
| **Voice** | Web Speech API — free, on-device, no internet |
| **Audio** | Howler.js + CC0 sound packs |
| **Controller** | Gamepad API — PS4 pad, no library needed |
| **Art** | Kenney.nl CC0 packs — free, public domain |

### Hard rules
- **Runs offline.** Everything bundled locally, nothing from a CDN. Venue
  wifi cannot be a dependency.
- **No paid APIs.** The brief explicitly says functional AI agents aren't
  required — our AI is scripted, and that's a design choice, not a
  shortcut. Deterministic behavior is what makes a training tool teachable.
- **No randomness.** Every outcome is scripted so the demo is rehearsable.
- **No backend.** Static files only.

### Architecture rule that matters
All mission content — every line of dialogue, confidence value, outcome,
and grade — lives in one data file. Nothing is hardcoded in the game logic.
That means new missions are **content work, not engineering work**, and two
people can work in parallel without collisions.

---

## 7. ROLES

| Role | Owns |
|---|---|
| **Systems / code** (Vatsalya) | Turn manager, game state, scoring, input, renderer integration |
| **Art / visual** | Level layout, unit look, sensor cone + glitch visuals, HUD styling, particles |
| **Gameplay / design** | Turn tuning, dialogue writing, difficulty pacing, playtesting |
| **Sound** (if we get someone) | Radio static, UI beeps, impacts, glitch sound, ambient bed |

Roles overlap. Everyone playtests.

**If you're on art:** the sensor cone glitch is the single highest-value
thing you can make look good. Clean cone vs broken cone should read
instantly from across a room.

**If you're on sound:** the brief is judged on *engagement*, and audio
carries more of that than people expect. Radio static on every comms line
is cheap and does enormous work.

---

## 8. BUILD ORDER

Strict. Do not skip ahead.

1. Project scaffold, pushed to git
2. **Sensor cones** — highest risk, do it first
3. Fog of war
4. Units on a map, moving
5. Turn manager reading mission data
6. Comms panel — voice + captions + confidence
7. Command bar
8. Debrief screen
9. Mouse input, then controller
10. Audio and visual polish
11. **Only then:** a second mission, if time allows

**Tag a demo build the moment one turn plays end to end.** Even if it's
ugly. It's our parachute.

---

## 9. STILL OPEN — BRING IDEAS

Genuinely undecided, input welcome:

- **Setting.** Robots and an industrial compound is a placeholder. Could be
  a submarine, a wildfire crew, a surgical team. The trust mechanic doesn't
  care.
- **Art direction.** Tactical HUD is the current lean. Open to other looks.
- **The AI's personality.** Clipped and military? Slightly too eager?
  Uncertain and apologetic? This strongly affects how much players trust
  it — which is a *gameplay* question, not just flavor.
- **Whether the player hears their own voice** or just picks a line.
- **Mission 2**, if we get there.

**Not open:** the core trust-calibration mechanic, the two-score system, and
offline-first. Those are what the challenge is asking for.

---

## 10. WHAT WE SAY TO JUDGES

> People don't trust AI too much or too little. They trust it at the wrong
> times. Ghostline trains the timing.

Then we show Turn 3 live. That's the pitch.
