import gsap from 'gsap';
import { wait } from './Pause.js';
import { panCamera, zoomCamera, shakeCamera, punchZoom, focusOn } from '../render/Camera.js';
import { audio } from './Audio.js';
import { reconTarget } from '../render/Level.js';


// Sequences a turn: plays the scripted intro beats from mission data, lets
// the AI speak, then unlocks the command bar. Beat timing lives here; what
// happens on each beat lives in the mission file.
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

  async enterTurn(turn) {
    this.busy = true;
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
    const target = reconTarget({ turnId: resolution.turn?.id, reveal: outcome.reveal });
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
      case 'scan': {
        const u = this.unit('ALPHA');
        audio.scan();

        // Where this turn's sweep is actually going. Every SEND_DRONE beat in
        // the mission describes a different piece of ground — the perimeter,
        // the outbuilding, the entry hall, the divider — and the player is
        // meant to be able to see that the aircraft went somewhere different
        // each time. `reveal` wins when the mission names a place outright.
        const place = reconTarget({
          turnId: resolution.turn?.id,
          reveal: outcome.reveal,
        });

        this.fx.droneSweep(
          { x: u.position.x, z: u.position.z },
          place,
          {
            // Fog lifts where the drone looked, when it gets there — not
            // where it launched from, and not before it arrives.
            onArrive: (p) => this.fog?.revealAt(p.x, p.z, 6),
          }
        );
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
    const advance = resolution.turn?.advance;
    if (advance?.waypoints && !outcome.endsMission) {
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

  reset() {
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
