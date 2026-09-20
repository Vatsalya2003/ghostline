import gsap from 'gsap';
import { wait } from './Pause.js';
import { panCamera, zoomCamera, shakeCamera, punchZoom, focusOn } from '../render/Camera.js';
import { audio } from './Audio.js';
import { events, GAME_EVENT } from './Events.js';
import { resolveSite } from '../render/ReconSites.js';

// The squad's own events, as GameState emits them. Named by their wire strings
// with the constants preferred, because presentation and gameplay land in this
// tree independently and a hook that silently never fires is the worst way to
// find that out.
const UNIT_DAMAGED = GAME_EVENT.UNIT_DAMAGED ?? 'unitDamaged';
const UNIT_DISABLED = GAME_EVENT.UNIT_DISABLED ?? 'unitDisabled';
const UNIT_LOST = GAME_EVENT.UNIT_LOST ?? 'unitLost';

// Longest the turn will hold for an aircraft that should be arriving. A sortie
// killed by a restart settles its promise on the way out, but a timeout here
// means no imaginable failure can leave the command bar locked.
const ARRIVAL_TIMEOUT = 6;


// Sequences a turn: plays the scripted intro beats from mission data, lets
// the AI speak, then unlocks the command bar. Beat timing lives here; what
// happens on each beat lives in the mission file.
export class Director {
  constructor({ camera, squad, fx, ui, turnManager, state, level, fog, screenFX, keyLight, markers }) {
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
    this.busy = false;
    this.baseLight = keyLight ? keyLight.intensity : 1.5;
    // Bumped by every reset. A beat that was mid-flight when the player
    // restarted belongs to a mission that no longer exists, and its remaining
    // effects must not land in the new one — a breach charge from last run
    // lighting a fire in this one is a fire nobody set.
    this.runId = 0;
    this.watchUnitLoss();
  }

  unit(id) { return this.squad.all.find((u) => u.id === id); }

  get mission() { return this.tm.mission; }

  // Where this turn's recon, ordnance and markers are aimed. The mission names
  // the ground (`turn.recon`, `outcome.site`, `outcome.reveal`); this file only
  // asks. See src/render/ReconSites.js for the resolution order.
  site(resolution) {
    return resolveSite({
      mission: this.mission,
      turn: resolution?.turn,
      outcome: resolution?.outcome,
      level: this.level,
    });
  }

  // Where the contacts stand once painted. The mission declares them, because
  // the mission is what knows where its hostiles are; the fallback keeps a
  // mission that has not said anything from painting them at the origin.
  contactsFor(resolution) {
    const declared = resolution?.outcome?.contacts
      || resolution?.turn?.contacts
      || this.mission?.contacts;
    if (Array.isArray(declared) && declared.length) return declared;
    const aim = this.site(resolution);
    return [[aim.x, aim.z]];
  }

  // The ground the current ambush is being fought over, once it has been
  // painted. Held so tracers, audio and the camera all aim at the same place.
  get contacts() { return this.shownContacts || []; }

  // The contact a shot or a throw should be aimed at. Before the hostiles are
  // painted the squad is firing at a *report*, not a target, so it aims at the
  // ground the turn is about instead — which is the mission's whole point on
  // the turn where the player shoots at an unresolved return.
  aimPoint(resolution = null) {
    if (this.hostilesShown && this.contacts.length) {
      const [x, z] = this.contacts[0];
      return { x, z };
    }
    const place = this.site(resolution);
    return { x: place.x, z: place.z };
  }

  // ------------------------------------------------------------- the world
  //
  // Something caught fire, and it will still be burning next turn. `ref` is
  // whatever the mission wrote: a site key, the name of a prop in the level,
  // a literal { x, z }, or `true` for "the ground this turn is about".
  ignite(ref, resolution = null, { intensity = 0.7, key = null, growth } = {}) {
    const place = ref === true || ref === undefined
      ? this.site(resolution)
      : resolveSite({
        mission: this.mission, turn: resolution?.turn, outcome: { site: ref }, level: this.level,
      });
    this.fx.ignite(place.x, place.z, { key: key || place.key, intensity, growth });
    return place;
  }

  // A vehicle is gone. Gameplay decides that; this plays it.
  //
  // Framed, then held: the camera goes to the unit before the sequence starts
  // and stays with it until the wreck settles, because a loss the player did
  // not watch happen is a loss they will not believe.
  async loseVehicle(id, mode = 'disabled') {
    const unit = this.unit(id);
    if (!unit || unit.lost) return false;

    this.focusUnit(id);
    this.markers?.flare(id, 1);
    focusOn(this.camera, unit, 0.7);
    punchZoom(this.camera, -1.2);

    await this.fx.vehicleLoss(unit, {
      mode,
      onBeat: (name) => {
        if (name === 'critical') {
          audio.impact(unit.position.x, unit.position.z);
          shakeCamera(this.camera, 0.6, 0.5);
          this.screenFX?.flash('damage', 420);
          this.lightKick(3.0, 0.5);
        } else if (name === 'shutdown') {
          // The sensor going out is the same event as a glitch, one step
          // further on — so it sounds like one.
          audio.glitch(unit.position.x, unit.position.z);
          this.screenFX?.glitch(520);
        } else if (name === 'collapse') {
          audio.impact(unit.position.x, unit.position.z);
          shakeCamera(this.camera, 0.35, 0.6);
        } else if (name === 'destroyed') {
          audio.breach(unit.position.x, unit.position.z);
          shakeCamera(this.camera, 0.5, 0.5);
          this.lightKick(3.4, 0.6);
          this.screenFX?.flash('breach', 420);
        }
      },
    });

    this.ui.log.push(mode === 'lost' ? `UNIT DESTROYED — ${id}` : `UNIT DISABLED — ${id}`);
    this.syncDegradedMood();
    return true;
  }

  // Gameplay owns whether a machine is still in the fight; this owns what that
  // looks like. GameState emits on the shared bus and nothing has to be wired
  // in by hand — but the sequence is *queued* rather than played on the spot,
  // because state is applied before the Director has drawn the shot that
  // caused it. A unit that collapsed before the burst that killed it would
  // read as a machine that fell over on its own.
  watchUnitLoss() {
    this.pendingLoss = [];

    events.on(UNIT_DISABLED, ({ unit }) => this.queueLoss(unit, 'disabled'));
    events.on(UNIT_LOST, ({ unit }) => this.queueLoss(unit, 'lost'));

    // Hurt but still standing: it smokes from here on, so the damage the HUD
    // is reporting is also on the board.
    events.on(UNIT_DAMAGED, ({ unit, critical }) => {
      if (critical) this.fx.markCritical(this.unit(unit));
    });
  }

  queueLoss(id, mode) {
    if (!id || this.unit(id)?.lost) return;
    if (this.pendingLoss.some((p) => p.id === id)) return;
    this.pendingLoss.push({ id, mode });
  }

  // Play whatever went down during this outcome, in the order it happened, once
  // the shot that did it has landed.
  async playPendingLosses(after = 0) {
    if (!this.pendingLoss?.length) return;
    const queue = this.pendingLoss.splice(0, this.pendingLoss.length);
    if (after > 0) await wait(after);
    for (const { id, mode } of queue) await this.loseVehicle(id, mode);
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
    const run = this.runId;
    for (const beat of turn.intro || []) {
      // Restarted mid-intro: the rest of this sequence belongs to the old
      // mission. Leave `busy` alone — the new run's enterTurn owns it now.
      if (run !== this.runId) return;
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
          // Everything on this beat aims at one point, and that point is the
          // door's own position rather than a number typed in here — so a map
          // that moves its door does not leave the charge going off in a field.
          const door = this.level.door;
          const at = resolveSite({
            mission: this.mission, outcome: { site: beat.site }, level: this.level,
          });
          const x = door?.position?.x ?? at.x;
          const z = door?.position?.z ?? at.z;

          audio.breach(x, z);
          if (door) {
            gsap.to(door.rotation, { x: -1.45, z: 0.12, duration: 0.5, ease: 'power4.in' });
            gsap.to(door.position, { y: 0.06, z: z + 1.1, duration: 0.6, ease: 'power3.out' });
            gsap.to(door.material, { emissiveIntensity: 0.02, duration: 1.2 });
          }
          this.fx.ring(x, z, { color: 0xe0a84c, radius: 7, duration: 0.8 });
          this.fx.burst(x, z, { color: 0xe0a84c, count: 34, spread: 3.4, life: 1.0 });
          // A breaching charge is an explosion, and it now looks like one — at
          // the door, not as a screen flash standing in for one.
          this.fx.explosion({ x, y: 0.8, z }, { radius: 3.2, color: 0xe0a84c, debris: 14 });
          // And a charge leaves the frame burning if the mission says so. That
          // fire is still there on turn 4, and worse on turn 5.
          if (beat.ignite) {
            this.ignite(beat.ignite === true ? { x, z, key: 'breach' } : beat.ignite, null,
              { intensity: 0.5, key: 'breach' });
          }
          // The charge is the loudest thing in the mission: light kick, hard
          // white-amber bloom, and the camera pushes in a touch on the blast.
          this.lightKick(4.2, 0.7);
          punchZoom(this.camera, -1.4);
          this.screenFX?.flash('breach', 520);
          this.fog?.revealAt(x, z, 7);
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
          audio.impact(u?.position.x, u?.position.z);
          punchZoom(this.camera, -0.9);
          this.flash();
          await wait(0.35);
          break;
        }
        case 'status': {
          const u = this.unit(beat.unit);
          // The signature moment: the sensor that just broke should sound like
          // it broke where it stands, not in the middle of the stereo image.
          audio.glitch(u?.position.x, u?.position.z);
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
  moveSquad(moves, duration = 0.85) {
    if (!moves) return Promise.resolve();
    for (const [id, [x, z]] of Object.entries(moves)) {
      const unit = this.unit(id);
      // A wreck stays where it fell. Mission data written before a vehicle was
      // lost still lists it in the move, and a disabled machine sliding to its
      // next waypoint would undo the whole sequence that just played.
      if (!unit || unit.lost) continue;
      unit.moveTo(x, z, duration);
    }
    return wait(duration + 0.05);
  }

  async enterTurn(turn) {
    const run = this.runId;
    this.busy = true;
    this.ui.commandBar.setLocked(true);
    this.ui.commandBar.clear();
    this.ui.hud.setTurn(turn);
    this.ui.hud.setStatuses(this.state.statuses);
    this.ui.hud.setDrones(this.state.drones);
    this.ui.comms.setConfidence('NONE');

    // Anything still alight gets worse while the commander deliberates. This
    // is the only place fire grows, so "one turn" is exactly one escalation
    // however long the player takes over the decision.
    if (this.turnsPlayed > 0) this.fx.escalateHazards();
    this.turnsPlayed = (this.turnsPlayed || 0) + 1;

    // Fires the mission says are already burning when the turn opens.
    for (const hazard of turn.hazards || []) {
      const ref = hazard?.site ?? hazard;
      this.ignite(ref, { turn }, {
        intensity: hazard?.intensity ?? 0.6,
        key: hazard?.key ?? (typeof ref === 'string' ? ref : null),
      });
    }

    // Reflect the turn's declared statuses on the models (cone degradation
    // included) unless the intro is going to do it dramatically.
    const introHandles = new Set((turn.intro || []).filter((b) => b.type === 'status').map((b) => b.unit));
    for (const [id, status] of Object.entries(turn.statuses || {})) {
      if (introHandles.has(id)) continue;
      const u = this.unit(id);
      if (u && u.status !== status) u.setStatus(status);
    }

    // A machine that dropped out between turns still goes down where the
    // player can see it, before the turn it is missing from opens.
    await this.playPendingLosses();

    await this.playIntro(turn);
    if (run !== this.runId) return;
    await this.speakAi(turn);
    if (run !== this.runId) return;

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
    const aim = this.aimPoint(resolution);

    if (action === 'FIRE') {
      // The squad engages. Every unit that still has a working sensor fires;
      // the tracers all converge on the same ground, which is what makes
      // "rounds into an unidentified return" legible as one engagement.
      const shooters = this.squad.all.filter((u) => u.status !== 'damaged');
      shooters.forEach((u, i) => {
        gsap.delayedCall(i * 0.09, () => {
          u.faceTowards(aim.x, aim.z, 0.2);
          this.fx.gunfire(u.position, aim, { rounds: 3, spread: 0.7 });
        });
      });
      // Rounds into a fuel tank, a generator, a stack of ordnance: the mission
      // says what it hit with `ignite`, and the board answers with a secondary
      // that keeps burning afterwards.
      if (outcome.ignite) {
        gsap.delayedCall(0.45, () => {
          const fire = this.ignite(outcome.ignite, resolution, { intensity: 0.75 });
          this.fx.explosion({ x: fire.x, y: 0.7, z: fire.z }, { radius: 3.0, color: 0xffa24a, debris: 12 });
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
      this.fx.grenade(thrower.position, aim, {
        fuse: FUSE,
        onDetonate: () => {
          shakeCamera(this.camera, 0.6, 0.5);
          punchZoom(this.camera, -0.9);
          this.lightKick(3.6, 0.6);
          this.screenFX?.flash('breach', 420);
          this.fog?.revealAt(aim.x, aim.z, 4.5);
          // Ordnance into a room full of cabling leaves it burning, if the
          // mission says that is what happened.
          if (outcome.ignite) {
            this.ignite(outcome.ignite === true ? { x: aim.x, z: aim.z, key: 'ordnance' } : outcome.ignite,
              resolution, { intensity: 0.45, key: 'ordnance' });
          }
        },
      });
      panCamera(this.camera, aim.x, aim.z, 1.0);
      return FUSE;
    }

    return 0;
  }

  async playOutcome(resolution) {
    const run = this.runId;
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
          audio.impact(u?.position.x, u?.position.z);
          shakeCamera(this.camera, 0.7, 0.5);
          punchZoom(this.camera, -1.0);
          this.lightKick(3.0, 0.5);
          this.flash();
        };
        // A grenade hurts you when it detonates, not when it leaves your hand.
        if (hurtDelay > 0) gsap.delayedCall(hurtDelay, takeHit);
        else takeHit();

        if (outcome.fx === 'ambush') {
          // Shooters in the blind arc. Tracers run from where the contacts
          // actually stand to the unit that was hit, so the player can see the
          // arc that was never in the picture.
          for (const [hx, hz] of this.contactsFor(resolution)) {
            this.fx.gunfire({ x: hx, z: hz }, u ? u.position : { x: 0, z: 0 },
              { rounds: 4, color: 0xff7a5e, spread: 0.7 });
          }
        }
        break;
      }
      case 'scan': {
        const u = this.unit('ALPHA');
        // Panned to the launch point, same convention as Soundscape's own
        // droneLaunch — dead centre reads as a HUD beep, not an aircraft.
        audio.scan(u.position.x, u.position.z);

        // Where this turn's sweep is actually going, resolved from the mission
        // rather than from the turn number. Every recon beat in the mission
        // describes a different piece of ground, and the player is meant to be
        // able to see that the aircraft went somewhere different each time.
        const place = this.site(resolution);

        // COMMAND — the destination is painted on the ground before the
        // aircraft moves, so the order is visible as an order.
        this.ui.log.push(`RECON TASKED — ${place.label}`);

        const sortie = this.fx.droneSweep(
          { x: u.position.x, z: u.position.z },
          place,
          {
            tasking: 'RECON TASKED',
            // ARRIVAL — fog lifts where the drone looked, when it gets there.
            // Not where it launched from, and not before it arrives.
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

        // LAUNCH — the sortie leaves ground behind it: a ripple through
        // ALPHA's own cone, and the launch point committed to the map.
        u?.ping(1.1, 1);
        this.focusUnit('ALPHA');
        this.fog?.revealAt(u.position.x, u.position.z, 5);
        this.screenFX?.flash('scan', 420);
        // FLIGHT — follow the aircraft out, framing both ends of the leg.
        // Gentle: the player still needs the board.
        panCamera(this.camera, (u.position.x + place.x) / 2, (u.position.z + place.z) / 2, 1.3);
        break;
      }
      case 'move': audio.moveStep(this.squad.lead?.position.x, this.squad.lead?.position.z); break;
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
      const contacts = this.contactsFor(resolution);
      this.shownContacts = contacts;
      this.fx.revealHostiles(contacts);
      // Contact: hard red bloom, a beat of shake, and the camera brought onto
      // the centre of the markers so none of them is off screen.
      this.screenFX?.flash('contact', 560);
      shakeCamera(this.camera, 0.35, 0.4);
      const cx = contacts.reduce((s, c) => s + c[0], 0) / contacts.length;
      const cz = contacts.reduce((s, c) => s + c[1], 0) / contacts.length;
      panCamera(this.camera, cx, cz, 0.9);
      for (const [hx, hz] of contacts) this.fog?.revealAt(hx, hz, 3.5);
    }

    // `reveal` names a piece of the level the player just resolved — the drone
    // proving the heat bloom is a dead generator. It was sitting in the mission
    // data with nothing reading it, which left the one calibrated call on that
    // turn as the only choice with no visible payoff.
    const revealed = outcome.reveal && this.level[outcome.reveal];
    if (revealed?.position) {
      const { x, z } = revealed.position;
      this.fx.ring(x, z, { color: 0x4ce0d8, radius: 4.2, duration: 0.9 });
      this.fog?.revealAt(x, z, 5);
      panCamera(this.camera, x, z, 0.9);
      this.lightKick(2.4, 0.6);
    }

    // Fires the mission attributes to this outcome, where the action did not
    // already light them on its own beat (a burst has its secondary, ordnance
    // has its fuse).
    if (outcome.ignite && resolution.action !== 'FIRE' && resolution.action !== 'GRENADE') {
      this.ignite(outcome.ignite, resolution, { intensity: 0.6 });
    }

    this.ui.log.push(outcome.log);
    // The ground has been read, and the marker says so with the finding on it.
    if (arrival) this.fx.reconResult('SURVEYED');
    this.ui.hud.setHealth(this.state.health);
    this.ui.hud.setDrones(this.state.drones);

    // Any machine that went out of the fight on this outcome goes down here,
    // in front of the player, after the hit that did it and before anyone is
    // asked to move anywhere.
    await this.playPendingLosses(hurtDelay);

    if (outcome.moves) await this.moveSquad(outcome.moves);
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
    this.runId += 1;
    this.hostilesShown = false;
    this.shownContacts = null;
    this.turnsPlayed = 0;
    this.pendingLoss = [];
    this.fx.clearHostiles();
    this.fx.resetDrone();
    // Wrecks stand back up. setStatus() in main.js restores colour and cone;
    // the tilt, the dead emissives and the stopped animation are this system's
    // to undo.
    for (const u of this.squad.all) this.fx.restoreVehicle(u);
    this.clearFocus();
    this.screenFX?.reset();
    if (this.keyLight) {
      gsap.killTweensOf(this.keyLight);
      this.keyLight.intensity = this.baseLight;
    }
  }
}
