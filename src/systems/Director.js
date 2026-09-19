import gsap from 'gsap';
import { panCamera, zoomCamera, shakeCamera } from '../render/Camera.js';
import { audio } from './Audio.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

// Sequences a turn: plays the scripted intro beats from mission data, lets
// the AI speak, then unlocks the command bar. Beat timing lives here; what
// happens on each beat lives in the mission file.
export class Director {
  constructor({ camera, squad, fx, ui, turnManager, state, level }) {
    this.camera = camera;
    this.squad = squad;
    this.fx = fx;
    this.ui = ui;
    this.tm = turnManager;
    this.state = state;
    this.level = level;
    this.busy = false;
  }

  unit(id) { return this.squad.all.find((u) => u.id === id); }

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
          break;
        case 'breach': {
          audio.breach();
          const door = this.level.door;
          gsap.to(door.rotation, { x: -1.45, z: 0.12, duration: 0.5, ease: 'power4.in' });
          gsap.to(door.position, { y: 0.06, z: 3.1, duration: 0.6, ease: 'power3.out' });
          gsap.to(door.material, { emissiveIntensity: 0.02, duration: 1.2 });
          this.fx.ring(2.6, 2, { color: 0xe0a84c, radius: 7, duration: 0.8 });
          this.fx.burst(2.6, 2, { color: 0xe0a84c, count: 34, spread: 3.4, life: 1.0 });
          this.flash();
          break;
        }
        case 'shake':
          shakeCamera(this.camera, beat.strength ?? 0.6, beat.duration ?? 0.5);
          break;
        case 'impact': {
          const u = this.unit(beat.unit);
          if (u) this.fx.hitFlash(u);
          audio.impact();
          this.flash();
          await wait(0.35);
          break;
        }
        case 'status': {
          const u = this.unit(beat.unit);
          audio.glitch();
          if (u) u.setStatus(beat.status);
          this.state.statuses[beat.unit] = beat.status;
          this.ui.hud.setStatuses(this.state.statuses);
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
    await this.ui.comms.say(turn.ai.line, {
      source: turn.ai.unit,
      via: turn.ai.via,
      confidence: turn.ai.confidence,
      sourceStatus,
    });
    audio.radioClose();
  }

  async playOutcome(resolution) {
    this.busy = true;
    this.ui.commandBar.setLocked(true);
    const { outcome } = resolution;

    switch (outcome.fx) {
      case 'impact': case 'ambush': {
        const u = this.unit(outcome.impactUnit || 'ALPHA');
        if (u) this.fx.hitFlash(u);
        audio.impact();
        shakeCamera(this.camera, 0.7, 0.5);
        this.flash();
        break;
      }
      case 'scan': {
        const u = this.unit('ALPHA');
        audio.scan();
        this.fx.ring(u.position.x, u.position.z, { radius: 9, duration: 1.1 });
        break;
      }
      case 'move': audio.moveStep(); break;
      case 'relay':
        audio.relay();
        this.fx.ring(this.level.tower.position.x, this.level.tower.position.z, { radius: 8, duration: 1.2 });
        gsap.to(this.level.beacon.material, { emissiveIntensity: 6, duration: 0.4, yoyo: true, repeat: 3 });
        break;
      case 'alarm': audio.alarm(); this.flash(0xe0a84c); break;
      case 'nightvision': audio.nightvision(); break;
      default: break;
    }

    if (outcome.revealHostiles && !this.hostilesShown) {
      this.hostilesShown = true;
      this.fx.revealHostiles([[4.2, -0.6], [1.6, -1.8]]);
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
    audio.radioOpen();
    await this.ui.comms.say(resolution.outcome.response, {
      source: resolution.turn.ai.unit,
      via: resolution.turn.ai.via,
      sourceStatus: this.state.statuses[resolution.turn.ai.unit],
    });
    audio.radioClose();
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
  }
}
