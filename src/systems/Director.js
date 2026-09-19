import gsap from 'gsap';
import { wait } from './Pause.js';
import { panCamera, zoomCamera, shakeCamera, punchZoom, focusOn } from '../render/Camera.js';
import { audio } from './Audio.js';


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
  }

  unit(id) { return this.squad.all.find((u) => u.id === id); }

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
  moveSquad(moves, duration = 0.85) {
    if (!moves) return Promise.resolve();
    for (const [id, [x, z]] of Object.entries(moves)) {
      this.unit(id)?.moveTo(x, z, duration);
    }
    return wait(duration + 0.05);
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

  async playOutcome(resolution) {
    this.busy = true;
    this.ui.commandBar.setLocked(true);
    const { outcome } = resolution;

    switch (outcome.fx) {
      case 'impact': case 'ambush': {
        const u = this.unit(outcome.impactUnit || 'ALPHA');
        if (u) { this.fx.hitFlash(u); this.focusUnit(u.id); this.markers?.flare(u.id); }
        audio.impact();
        shakeCamera(this.camera, 0.7, 0.5);
        punchZoom(this.camera, -1.0);
        this.lightKick(3.0, 0.5);
        this.flash();
        break;
      }
      case 'scan': {
        const u = this.unit('ALPHA');
        audio.scan();
        // The drone now actually launches from ALPHA and flies the sweep; the
        // expanding ring fires from inside it, at the point it scans.
        this.fx.droneSweep(
          { x: u.position.x, z: u.position.z },
          { x: this.level.tower.position.x, z: this.level.tower.position.z + 2.5 }
        );
        // The sweep leaves ground behind it: ripple through ALPHA's own cone,
        // and the drone's footprint is committed to the explored map.
        u?.ping(1.1, 1);
        this.focusUnit('ALPHA');
        this.fog?.revealAt(u.position.x, u.position.z, 9);
        this.screenFX?.flash('scan', 420);
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
