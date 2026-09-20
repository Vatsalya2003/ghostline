import gsap from 'gsap';
import { wait } from './Pause.js';
import { panCamera, zoomCamera, shakeCamera, punchZoom, focusOn } from '../render/Camera.js';
import { audio } from './Audio.js';
import { resolveSite } from '../render/ReconSites.js';


// Sequences a turn: plays the scripted intro beats from mission data, lets
// the AI speak, then unlocks the command bar. Beat timing lives here; what
// happens on each beat lives in the mission file.
// Longest the turn will hold for an aircraft that should be arriving. A sortie
// killed by a restart settles its promise on the way out, but a timeout here
// means no imaginable failure can leave the command bar locked.
const ARRIVAL_TIMEOUT = 6;

export class Director {
  constructor({ camera, squad, fx, ui, turnManager, state, level, fog, screenFX, keyLight, markers, actors = null }) {
    this.camera = camera;
    this.squad = squad;
    this.fx = fx;
    this.ui = ui;
    this.tm = turnManager;
    this.state = state;
    this.level = level;
    this.fog = fog;
    this.screenFX = screenFX;
    this.keyLight = keyLight;
    this.markers = markers;
    this.actors = actors;
    this.busy = false;
    // Bumped on every restart. A sortie still in the air when the player
    // restarts belongs to a run that no longer exists.
    this.runId = 0;
    this.baseLight = keyLight ? keyLight.intensity : 1.5;
  }

  unit(id) { return this.squad.all.find((u) => u.id === id); }

  // Where the two contacts stand once painted. Held here rather than inline so
  // the reveal, the ambush tracers and the grenade all aim at the same ground.
  get contacts() { return [[4.2, -0.6], [1.6, -1.8]]; }

  // The contact a shot or a throw should be aimed at. Before the hostiles are
  // painted the squad is firing at a *report*, not a target, so it aims at the
  // unresolved return instead — which is the mission's whole point on turn 2.
  aimPoint() {
    if (this.hostilesShown) {
      const [x, z] = this.contacts[0];
      return { x, z };
    }
    const gen = this.level.generator?.position;
    return gen ? { x: gen.x, z: gen.z } : { x: 2.6, z: -1 };
  }

  // A short lift on the key light. Cheaper and calmer than adding a second
  // light for every event, and it reads as the world reacting rather than the
  // HUD reacting.
  lightKick(to = 2.6, duration = 0.45) {
    if (!this.keyLight) return;
    gsap.killTweensOf(this.keyLight);
    gsap.fromTo(this.keyLight,
      { intensity: to },
      { intensity: this.baseLight, duration, ease: 'power2.out' });
  }

  // Exactly one cone is highlighted at a time — otherwise "look at this one"
  // stops meaning anything.
  focusUnit(id) {
    for (const u of this.squad.all) u.setFocus(u.id === id);
  }

  clearFocus() { for (const u of this.squad.all) u.setFocus(false); }

  // Held unease while any sensor is broken.
  syncDegradedMood() {
    const broken = Object.values(this.state.statuses || {}).some((s) => s !== 'healthy');
    this.screenFX?.degraded(broken);
  }

  async playIntro(turn) {
    for (const beat of turn.intro || []) {
      switch (beat.type) {
        case 'pan':
          panCamera(this.camera, beat.x, beat.z, beat.duration ?? 1.1);
          if (beat.zoom) zoomCamera(this.camera, beat.zoom, beat.duration ?? 1.1);
          await wait((beat.duration ?? 1.1) * 0.75);
          break;
        case 'log':
          audio.beep();
          this.ui.log.push(beat.text);
          await wait(0.45);
          break;
        case 'wait':
          await wait(beat.duration);
          break;
        case 'move':
          await this.moveSquad(beat.moves);
          break;
        case 'face':
          for (const u of this.squad.all) u.faceTowards(beat.target[0], beat.target[1], 0.4);
          await wait(0.45);
          break;
        case 'alert':
          audio.alert();
          this.screenFX?.flash('alarm', 460);
          this.screenFX?.alert(true);
          setTimeout(() => this.screenFX?.alert(false), 2600);
          break;
        case 'breach': {
          audio.breach();
          const door = this.level.door;
          gsap.to(door.rotation, { x: -1.45, z: 0.12, duration: 0.5, ease: 'power4.in' });
          gsap.to(door.position, { y: 0.06, z: 3.1, duration: 0.6, ease: 'power3.out' });
          gsap.to(door.material, { emissiveIntensity: 0.02, duration: 1.2 });
          this.fx.ring(2.6, 2, { color: 0xe0a84c, radius: 7, duration: 0.8 });
          this.fx.burst(2.6, 2, { color: 0xe0a84c, count: 34, spread: 3.4, life: 1.0 });
          // A breaching charge is an explosion, and it now looks like one — at
          // the door, not as a screen flash standing in for one.
          this.fx.explosion({ x: 2.6, y: 0.8, z: 2 }, { radius: 3.2, color: 0xe0a84c, debris: 14 });
          // The charge is the loudest thing in the mission: light kick, hard
          // white-amber bloom, and the camera pushes in a touch on the blast.
          this.lightKick(4.2, 0.7);
          punchZoom(this.camera, -1.4);
          this.screenFX?.flash('breach', 520);
          this.fog?.revealAt(2.6, 2, 7);
          this.flash();
          break;
        }
        case 'shake':
          shakeCamera(this.camera, beat.strength ?? 0.6, beat.duration ?? 0.5);
          break;
        case 'impact': {
          const u = this.unit(beat.unit);
          if (u) {
            this.fx.hitFlash(u);
            this.focusUnit(u.id);
            this.markers?.flare(u.id);
          }
          audio.impact();
          punchZoom(this.camera, -0.9);
          this.flash();
          await wait(0.35);
          break;
        }
        case 'status': {
          const u = this.unit(beat.unit);
          audio.glitch();
          if (u) {
            u.setStatus(beat.status);
            // Put the eye on the cone that just broke, and break the frame
            // with it — this is the beat the whole mission turns on.
            this.focusUnit(u.id);
            focusOn(this.camera, u, 0.8);
          }
          this.screenFX?.glitch(520);
          this.state.statuses[beat.unit] = beat.status;
          this.ui.hud.setStatuses(this.state.statuses);
          this.syncDegradedMood();
          await wait(0.8);
          break;
        }
        default:
          break;
      }
    }
  }

  // Waits on the clock rather than on tween callbacks: if the ticker is
  // throttled (background tab, headless capture) the sequence must not stall.
  moveSquad(moves, duration = 0.85, opts = {}) {
    if (!moves) return Promise.resolve();
    for (const [id, [x, z]] of Object.entries(moves)) {
      this.unit(id)?.moveTo(x, z, duration, opts);
    }
    return wait(duration + 0.05);
  }

  // Walk the squad along an authored path, in formation. The waypoints and
  // the offsets both come from mission data — nothing in here knows what the
  // map looks like, which is the same rule the rest of the spine follows.
  //
  // Duration scales with path length so a long traverse does not sprint and a
  // short one does not crawl, and the camera travels with the lead so the
  // player is not left watching the place the squad has left.
  async travelSquad(waypoints, formation = {}, { run = false } = {}) {
    if (!waypoints || waypoints.length < 2) return;
    let length = 0;
    for (let i = 1; i < waypoints.length; i++) {
      length += Math.hypot(waypoints[i][0] - waypoints[i - 1][0],
                           waypoints[i][1] - waypoints[i - 1][1]);
    }
    const duration = Math.min(5.5, Math.max(1.4, length * (run ? 0.13 : 0.2)));

    // Follow the lead rather than cutting to the destination: the whole point
    // of the traversal is that the player sees one continuous place.
    const [lastX, lastZ] = waypoints[waypoints.length - 1];
    panCamera(this.camera, lastX, lastZ, duration * 0.9);

    const walks = this.squad.all.map((u) =>
      u.followPath(waypoints, { duration, run, offset: formation[u.id] || null }));
    await Promise.all(walks);
    await wait(0.1);
  }

  // Put the squad where this turn happens, if they are not already there.
  // Silent and instant: the intro is cutting or panning the camera anyway,
  // and this only ever fires after an outcome that legitimately held them
  // somewhere else. Without it a turn could open with the squad a zone
  // behind the camera.
  placeForTurn(turn) {
    if (!turn?.stand) return;
    const [sx, sz] = turn.stand;
    const lead = this.squad.all[0];
    if (!lead) return;
    if (Math.hypot(lead.position.x - sx, lead.position.z - sz) < 3) return;

    // Facing the way the squad came in, so nobody opens a turn back-to-front.
    const heading = Math.atan2(sx - lead.position.x, sz - lead.position.z);
    for (const unit of this.squad.all) {
      const off = turn.formation?.[unit.id] || { side: 0, back: 0 };
      const fx = Math.sin(heading), fz = Math.cos(heading);
      unit.placeAt(sx + off.side * -fz - off.back * fx,
                   sz + off.side * fx - off.back * fz, heading);
    }
  }

  async enterTurn(turn) {
    this.busy = true;
    this.placeForTurn(turn);
    this.ui.commandBar.setLocked(true);
    this.ui.commandBar.clear();
    this.ui.hud.setTurn(turn);
    this.ui.hud.setStatuses(this.state.statuses);
    this.ui.hud.setDrones(this.state.drones);
    this.ui.comms.setConfidence('NONE');

    // Reflect the turn's declared statuses on the models (cone degradation
    // included) unless the intro is going to do it dramatically.
    const introHandles = new Set((turn.intro || []).filter((b) => b.type === 'status').map((b) => b.unit));
    for (const [id, status] of Object.entries(turn.statuses || {})) {
      if (introHandles.has(id)) continue;
      const u = this.unit(id);
      if (u && u.status !== status) u.setStatus(status);
    }

    await this.playIntro(turn);
    await this.speakAi(turn);

    this.ui.commandBar.render(this.tm.availableActions());
    this.ui.commandBar.setLocked(false);
    this.busy = false;
  }

  async speakAi(turn) {
    audio.radioOpen();
    const sourceStatus = this.state.statuses[turn.ai.unit] || 'healthy';

    // Light up the cone the reading actually came from while the line plays.
    // The whole mission is "a confident number out of a broken sensor" — the
    // player should never have to guess which sensor that was.
    this.focusUnit(turn.ai.unit);
    const speaker = this.unit(turn.ai.unit);
    if (speaker) speaker.ping(1.1, sourceStatus === 'healthy' ? 0.8 : 0.45);
    this.screenFX?.transmission(true);

    await this.ui.comms.say(turn.ai.line, {
      source: turn.ai.unit,
      via: turn.ai.via,
      confidence: turn.ai.confidence,
      sourceStatus,
    });
    audio.radioClose();
    this.screenFX?.transmission(false);
  }

  // Weapons, drawn where they were used.
  //
  // The mission tags every violent outcome `fx: 'impact'`, because from the
  // scoring layer's point of view a collapsing gantry, a burst of own fire and
  // a frag are the same event: the squad lost health. Visually they are not,
  // and the action the player chose is what tells them apart.
  //
  // Returns the delay, in seconds, before the squad's own damage should land —
  // a grenade hurts you when it goes off, not when you throw it.
  weaponFX(resolution) {
    const { outcome, action } = resolution;
    // Same resolution the recon sortie uses, so a fallback aim point is on
    // this compound's ground rather than on another map's coordinates.
    const target = resolveSite({
      mission: this.tm.mission,
      turn: resolution.turn,
      outcome,
      level: this.level,
    });
    // If the outcome names someone who goes down, that is what the squad is
    // shooting at. Without this the tracers went to a generic recon point and
    // the figure who actually fell was nowhere near the gunfire.
    const victim = [].concat(outcome.dropActors || [])[0];
    const victimPos = victim && this.actors?.positionOf(victim);
    const aim = victimPos ? { x: victimPos.x, z: victimPos.z }
      : this.hostilesShown ? this.aimPoint() : { x: target.x, z: target.z };

    if (action === 'FIRE') {
      // The squad engages. Every unit that still has a working sensor fires;
      // the tracers all converge on the same ground, which is what makes
      // "rounds into an unidentified return" legible as one engagement.
      const shooters = this.squad.all.filter((u) => u.status !== 'damaged');
      shooters.forEach((u, i) => {
        gsap.delayedCall(i * 0.09, () => {
          u.faceTowards(aim.x, aim.z, 0.2);
          u.fire();
          this.fx.gunfire(u.position, aim, { rounds: 3, spread: 0.7 });
        });
      });
      // Turn 2's own-fire outcome ruptures the generator. The mission says so
      // in its log; this is that sentence happening on the board.
      if (/ruptur|generator/i.test(outcome.log || '')) {
        gsap.delayedCall(0.45, () => {
          this.fx.explosion({ x: aim.x, y: 0.7, z: aim.z }, { radius: 3.0, color: 0xffa24a, debris: 12 });
          shakeCamera(this.camera, 0.5, 0.45);
          this.lightKick(3.4, 0.6);
        });
      }
      panCamera(this.camera, aim.x, aim.z, 1.1);
      return 0.35;
    }

    if (action === 'GRENADE') {
      // Thrown by whoever is closest to the ground being cleared, so the arc
      // starts from a unit the player can see is in a position to throw it.
      const thrower = this.squad.all.reduce((best, u) => {
        const d = (u.position.x - aim.x) ** 2 + (u.position.z - aim.z) ** 2;
        return !best || d < best.d ? { u, d } : best;
      }, null)?.u || this.squad.all[0];

      const FUSE = 0.8;
      thrower.faceTowards(aim.x, aim.z, 0.25);
      thrower.throwOrdnance(FUSE);
      this.fx.grenade(thrower.position, aim, {
        fuse: FUSE,
        onDetonate: () => {
          shakeCamera(this.camera, 0.6, 0.5);
          punchZoom(this.camera, -0.9);
          this.lightKick(3.6, 0.6);
          this.screenFX?.flash('breach', 420);
          this.fog?.revealAt(aim.x, aim.z, 4.5);
        },
      });
      panCamera(this.camera, aim.x, aim.z, 1.0);
      return FUSE;
    }

    return 0;
  }

  async playOutcome(resolution) {
    this.busy = true;
    this.ui.commandBar.setLocked(true);
    const { outcome } = resolution;

    // Muzzle flashes, tracers and thrown ordnance, if the player reached for a
    // weapon. Returns how long to hold the squad's own damage back for.
    const hurtDelay = this.weaponFX(resolution);

    // Set by a recon sortie: everything the sweep *found* waits on this, so
    // the findings land when the aircraft is over the ground rather than while
    // it is still on the pad.
    let arrival = null;
    const run = this.runId;

    switch (outcome.fx) {
      case 'impact': case 'ambush': {
        const u = this.unit(outcome.impactUnit || 'ALPHA');
        const takeHit = () => {
          if (u) {
            this.fx.hitFlash(u);
            this.focusUnit(u.id);
            this.markers?.flare(u.id);
            this.fx.unitHit(u.position);
          }
          audio.impact();
          shakeCamera(this.camera, 0.7, 0.5);
          punchZoom(this.camera, -1.0);
          this.lightKick(3.0, 0.5);
          this.flash();
        };
        // A grenade hurts you when it detonates, not when it leaves your hand.
        if (hurtDelay > 0) gsap.delayedCall(hurtDelay, takeHit);
        else takeHit();

        // A unit the mission says is lost falls and stays fallen. The wreck
        // is on the board for the rest of the run, which is the whole reason
        // losing one is supposed to feel different from taking damage.
        if (outcome.lostUnit) {
          const lost = this.unit(outcome.lostUnit);
          gsap.delayedCall(hurtDelay + 0.35, () => lost?.fall());
        }

        if (outcome.fx === 'ambush') {
          // Shooters in BETA-1's blind arc. Tracers run from the contacts to
          // the unit that was hit, so the player can see the arc that was
          // never in the picture.
          for (const [hx, hz] of this.contacts) {
            this.fx.gunfire({ x: hx, z: hz }, u ? u.position : { x: 0, z: 0 },
              { rounds: 4, color: 0xff7a5e, spread: 0.7 });
          }
        }
        break;
      }
      // A sweep that does not fly. Thermal and acoustic reads are taken from
      // where the squad is standing, so the thing the player should see is the
      // room lighting up under the sensor — not an aircraft leaving. The
      // mission supplies the footprint it is actually reading and the bodies
      // the read finds; nothing about either is known here.
      case 'thermal': {
        const u = this.unit(this.state.lead) || this.unit('ALPHA');
        audio.scan();

        const r = outcome.reveal;
        const area = outcome.sweepArea || (r
          ? { minX: r.x - 4, maxX: r.x + 4, minZ: r.z - 4, maxZ: r.z + 4 }
          : { minX: -4, maxX: 4, minZ: -4, maxZ: 4 });
        const cx = (area.minX + area.maxX) / 2;
        const cz = (area.minZ + area.maxZ) / 2;
        const reach = Math.max(Math.abs(area.maxX - area.minX),
                               Math.abs(area.maxZ - area.minZ)) / 2 + 1.5;

        this.fx.areaSweep(area, { blooms: outcome.sweepBlooms || [] });

        u?.ping(1.2, 1);
        if (u) this.focusUnit(u.id || 'ALPHA');
        this.fog?.revealAt(cx, cz, reach);
        this.screenFX?.flash('scan', 620);
        // Hold the squad in frame as well as the room — the whole point of the
        // beat is that they are outside the thing they are reading.
        panCamera(this.camera, (cx + (u ? u.position.x : cx)) / 2,
                               (cz + (u ? u.position.z : cz)) / 2, 1.2);
        break;
      }
      case 'scan': {
        const u = this.unit('ALPHA');
        audio.scan();

        // Where this turn's sweep is actually going. Resolved from MISSION
        // DATA — `outcome.site`, then `turn.recon`, then the mission's own
        // gazetteer — rather than from the turn number, which is what used to
        // fly Compound 14's aircraft to Dry Creek's coordinates. See
        // src/render/ReconSites.js for the resolution order.
        const place = resolveSite({
          mission: this.tm.mission,
          turn: resolution.turn,
          outcome,
          level: this.level,
        });

        const sortie = this.fx.droneSweep(
          { x: u.position.x, z: u.position.z },
          place,
          {
            tasking: resolution.turn?.zone || '',
            // Fog lifts where the drone looked, when it gets there — not
            // where it launched from, and not before it arrives.
            onArrive: (p) => {
              this.fog?.revealAt(p.x, p.z, 6);
              // The camera settles onto the ground being read, so the scan is
              // framed on the thing it is scanning.
              panCamera(this.camera, p.x, p.z, 1.0);
              this.screenFX?.flash('scan', 360);
            },
          }
        );
        // Everything after this beat waits for the aircraft to have read the
        // ground — arrival is not a finding.
        arrival = sortie.read;
        // The sortie leaves ground behind it: ripple through ALPHA's own cone,
        // and the launch point is committed to the explored map.
        u?.ping(1.1, 1);
        this.focusUnit('ALPHA');
        this.fog?.revealAt(u.position.x, u.position.z, 5);
        this.screenFX?.flash('scan', 420);
        // Follow the aircraft out. Gentle — the player still needs the board.
        panCamera(this.camera, (u.position.x + place.x) / 2, (u.position.z + place.z) / 2, 1.3);
        break;
      }
      // Taking the room. The squad goes through the door, both corner men are
      // engaged, and one of ours pays for it — which is the beat the mission
      // has been building to since the sweep. Sequenced rather than fired
      // all at once so the player can read what happened to whom.
      case 'breach-room': {
        const targets = [].concat(outcome.dropActors || [])
          .map((id) => this.actors?.positionOf(id))
          .filter(Boolean);
        const shooters = this.squad.all.filter((u) => u.status !== 'damaged');

        punchZoom(this.camera, -1.4);
        this.screenFX?.flash('breach', 320);
        audio.breach?.();
        await wait(0.25);

        // Each corner taken in turn, by whoever is closest to it.
        for (let i = 0; i < targets.length; i++) {
          const aim = targets[i];
          const nearest = shooters.reduce((best, u) => {
            const d = (u.position.x - aim.x) ** 2 + (u.position.z - aim.z) ** 2;
            return !best || d < best.d ? { u, d } : best;
          }, null)?.u || shooters[0];

          panCamera(this.camera, aim.x, aim.z, 0.5);
          nearest.faceTowards(aim.x, aim.z, 0.15);
          nearest.fire(0.8);
          this.fx.gunfire(nearest.position, aim, { rounds: 4, spread: 0.45 });
          this.focusUnit(nearest.id);
          audio.impact();
          shakeCamera(this.camera, 0.35, 0.3);
          await wait(0.55);
        }

        // And the cost. The unit the mission names takes the hit, visibly,
        // after the room is clear rather than during it.
        const hurt = this.unit(outcome.impactUnit);
        if (hurt) {
          panCamera(this.camera, hurt.position.x, hurt.position.z, 0.5);
          this.fx.hitFlash(hurt);
          this.fx.unitHit(hurt.position);
          this.markers?.flare(hurt.id);
          this.focusUnit(hurt.id);
          shakeCamera(this.camera, 0.7, 0.45);
          this.lightKick(3.0, 0.5);
          this.flash();
          audio.impact();
        }
        await wait(0.5);
        break;
      }

      // Planting the charge. The squad has to visibly do it: walk to the
      // stack, kneel, and leave something behind that is still there next
      // turn and blinking. Before this, "charge is set" was a sentence with
      // nothing under it.
      case 'plant': {
        const charge = this.level.charge;
        const lamp = this.level.chargeLamp;
        const stack = this.level.tower;
        if (!charge || !stack) { audio.moveStep(); break; }

        // The stack sits in a group parented at the origin, so its own
        // position is already world — no need to drag THREE in here for a
        // getWorldPosition call.
        const world = stack.position;
        const planter = this.unit('ALPHA') || this.squad.all[0];

        // Close on the stack, kneel, plant.
        panCamera(this.camera, world.x, world.z, 1.0);
        zoomCamera(this.camera, 9.5, 1.0);
        this.focusUnit(planter.id);
        planter.faceTowards(world.x, world.z, 0.3);
        await wait(0.45);

        planter.throwOrdnance(1.1);       // the kneel-and-place animation
        audio.moveStep();
        await wait(0.55);

        charge.visible = true;
        charge.scale.setScalar(0.4);
        gsap.to(charge.scale, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(2.4)' });
        this.fx.ring(world.x, world.z, { radius: 2.4, duration: 0.9 });
        audio.relay();
        await wait(0.5);

        // Armed. The lamp is the thing the player watches for the rest of
        // the mission, so it starts now and does not stop.
        if (lamp) {
          gsap.killTweensOf(lamp.material);
          lamp.material.emissiveIntensity = 0;
          gsap.to(lamp.material, {
            emissiveIntensity: 3.2, duration: 0.42,
            repeat: -1, yoyo: true, ease: 'power2.inOut',
          });
        }
        gsap.to(this.level.beacon.material, {
          emissiveIntensity: 5, duration: 0.35, yoyo: true, repeat: 5,
        });
        punchZoom(this.camera, -1.1);
        this.lightKick(2.4, 0.4);
        await wait(0.4);
        break;
      }
      case 'move': audio.moveStep(); break;
      case 'relay':
        audio.relay();
        this.fx.ring(this.level.tower.position.x, this.level.tower.position.z, { radius: 8, duration: 1.2 });
        gsap.to(this.level.beacon.material, { emissiveIntensity: 6, duration: 0.4, yoyo: true, repeat: 3 });
        // Objective completion earns the only real camera move of the turn:
        // frame the tower, push in, and bring the lights up with it.
        focusOn(this.camera, this.level.tower, 1.0);
        punchZoom(this.camera, -1.6);
        this.lightKick(3.4, 1.1);
        this.screenFX?.flash('relay', 700);
        this.fog?.revealAt(this.level.tower.position.x, this.level.tower.position.z, 8);
        this.clearFocus();
        break;
      case 'alarm':
        audio.alarm();
        this.screenFX?.flash('alarm', 520);
        this.screenFX?.alert(true);
        setTimeout(() => this.screenFX?.alert(false), 3200);
        this.flash(0xe0a84c);
        break;
      case 'nightvision':
        audio.nightvision();
        // Night vision widens what you know without moving anyone.
        for (const u of this.squad.all) this.fog?.revealAt(u.position.x, u.position.z, 6);
        this.screenFX?.flash('scan', 600);
        break;
      default: break;
    }

    // RESULT — a sweep's findings belong to the aircraft that found them. Hold
    // the contacts, the reveal and the log line until it is on station, so the
    // player watches the drone paint them rather than reading about them while
    // it is still climbing out. Raced against a timeout: no sortie, however it
    // fails, can leave the command bar locked.
    if (arrival) await Promise.race([arrival, wait(ARRIVAL_TIMEOUT)]);
    // Restarted while the aircraft was out: its findings belong to a mission
    // that is over.
    if (run !== this.runId) return;

    if (outcome.revealHostiles && !this.hostilesShown) {
      this.hostilesShown = true;
      const contacts = [[4.2, -0.6], [1.6, -1.8]];
      this.fx.revealHostiles(contacts);
      // Contact: hard red bloom, a beat of shake, and the camera brought onto
      // the midpoint of the two markers so neither is off screen.
      this.screenFX?.flash('contact', 560);
      shakeCamera(this.camera, 0.35, 0.4);
      const cx = (contacts[0][0] + contacts[1][0]) / 2;
      const cz = (contacts[0][1] + contacts[1][1]) / 2;
      panCamera(this.camera, cx, cz, 0.9);
      for (const [hx, hz] of contacts) this.fog?.revealAt(hx, hz, 3.5);
    }

    // `reveal` names a piece of the level the player just resolved — turn 2's
    // drone proves the heat bloom is a dead generator. It was sitting in the
    // mission data with nothing reading it, which left the one calibrated call
    // on that turn as the only choice with no visible payoff.
    const revealed = outcome.reveal && this.level[outcome.reveal];
    if (revealed?.position) {
      const { x, z } = revealed.position;
      this.fx.ring(x, z, { color: 0x4ce0d8, radius: 4.2, duration: 0.9 });
      this.fog?.revealAt(x, z, 5);
      panCamera(this.camera, x, z, 0.9);
      this.lightKick(2.4, 0.6);
    }

    this.ui.log.push(outcome.log);
    // The ground has been read, and the marker says so with the finding on it.
    if (arrival) this.fx.reconResult('SURVEYED');
    this.ui.hud.setHealth(this.state.health);
    this.ui.hud.setDrones(this.state.drones);

    if (outcome.waypoints) {
      await this.travelSquad(outcome.waypoints, outcome.formation, { run: !!outcome.urgent });
    }
    if (outcome.moves) await this.moveSquad(outcome.moves, 0.85, { run: !!outcome.urgent });

    // Turn-level traversal: whichever command the player picked, the squad
    // still has to walk to wherever the next turn happens. Putting this on
    // the outcome meant remembering it on all four of them, and forgetting
    // one left the squad standing in the yard for the rest of the mission.
    // Turn-level traversal: whichever command the player picked, the squad
    // still has to walk to wherever the next turn happens.
    //
    // Except when the outcome says they did not move. Sending a drone means
    // an aircraft went instead of them; falling back means they held. Walking
    // the squad forward on those makes a liar of the line the player just
    // read. The next turn puts them where it needs them — see placeForTurn.
    const advance = resolution.turn?.advance;
    if (advance?.waypoints && !outcome.endsMission && !outcome.holdsPosition) {
      await this.travelSquad(advance.waypoints, advance.formation, { run: !!outcome.urgent });
    }
    await wait(0.25);

    if (outcome.response) {
      audio.radioOpen();
      await this.ui.comms.say(outcome.response, {
        source: 'ALPHA',
        sourceStatus: this.state.statuses.ALPHA,
      });
      audio.radioClose();
    }

    await wait(0.5);
    this.busy = false;
  }

  async playProbe(resolution) {
    this.busy = true;
    this.ui.commandBar.setLocked(true);
    if (resolution.outcome.fx === 'nightvision') audio.nightvision();
    this.ui.log.push(resolution.outcome.log);
    this.focusUnit(resolution.turn.ai.unit);
    this.screenFX?.transmission(true);
    audio.radioOpen();
    await this.ui.comms.say(resolution.outcome.response, {
      source: resolution.turn.ai.unit,
      via: resolution.turn.ai.via,
      sourceStatus: this.state.statuses[resolution.turn.ai.unit],
    });
    audio.radioClose();
    this.screenFX?.transmission(false);
    this.ui.commandBar.render(this.tm.availableActions());
    this.ui.commandBar.setLocked(false);
    this.busy = false;
  }

  flash(color = null) {
    const el = document.getElementById('damage-flash');
    if (color) el.style.filter = 'hue-rotate(35deg)';
    el.classList.add('on');
    setTimeout(() => { el.classList.remove('on'); el.style.filter = ''; }, 110);
  }

  // Mission restart: the charge comes back off the stack.
  resetCharge() {
    const charge = this.level?.charge;
    const lamp = this.level?.chargeLamp;
    if (lamp) { gsap.killTweensOf(lamp.material); lamp.material.emissiveIntensity = 0; }
    if (charge) { charge.visible = false; charge.scale.setScalar(1); }
  }

  reset() {
    this.runId += 1;
    this.resetCharge();
    this.hostilesShown = false;
    this.fx.clearHostiles();
    this.fx.resetDrone();
    this.clearFocus();
    this.screenFX?.reset();
    if (this.keyLight) {
      gsap.killTweensOf(this.keyLight);
      this.keyLight.intensity = this.baseLight;
    }
  }
}
