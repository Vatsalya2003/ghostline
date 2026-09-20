// The tactical map: a always-on minimap in the HUD and a full overlay you can
// open, pan and zoom. Both are the same data through the same renderer.
//
// It reads the game rather than being told about it. Unit positions are tweened
// by GSAP and the drone flies on its own timeline, so there is no event that
// fires often enough to be a position feed — `UnitMarkers` and `Soundscape`
// already poll for the same reason, and this follows them.
//
// What it will not do is know more than the squad. Everything it draws goes
// through MapModel, which is where the rules about that live, and the fog it
// draws is the fog of war's own memory canvas rather than a second copy that
// could drift out of step with the 3D board.

import {
  MapModel, MapView, Discovery, CERTAINTY, SOURCE, MARKER,
  clampSpan, clampCentre,
} from '../systems/MapModel.js';
import { drawMap } from './MapRenderer.js';
import { audio } from '../systems/Audio.js';
import { events, GAME_EVENT } from '../systems/Events.js';
import { CONTROL } from '../systems/Gamepad.js';

// The fog memory is only 128px square. Re-reading it is cheap, but it is a
// GPU-side readback, so it happens at a handful of hertz rather than every
// frame — the frontier does not move faster than this.
const DISCOVERY_HZ = 5;

// How much ground the overlay shows when it opens. Close enough to read the
// compound, not so close that you have to pan to find your own squad.
const OVERLAY_SPAN = 26;

export class TacticalMap {
  constructor({ squad, fx, fog, state, level = null, hazards = null,
                places = {}, objectivePlaces = {}, mission = null } = {}) {
    this.squad = squad;
    this.fx = fx;
    this.level = level;
    this.fog = fog;
    this.state = state;
    this.hazards = hazards;
    this.places = places;
    this.objectivePlaces = objectivePlaces;
    this.mission = mission;

    this.open = false;
    this.selected = -1;
    this.markers = [];
    this.fogData = null;
    this.sinceSample = 0;

    this.discovery = new Discovery({
      mem: fog?.mem ?? 128,
      size: fog?.size ?? 30,
      sample: (px, py) => {
        if (!this.fogData) return 0;
        const mem = this.discovery.mem;
        // The memory is greyscale; the red channel carries all of it.
        return this.fogData[(py * mem + px) * 4] / 255;
      },
    });

    this.model = new MapModel({
      bounds: { size: fog?.size ?? 30 },
      discovery: this.discovery,
    });

    this.mini = document.getElementById('minimap');
    this.full = document.getElementById('map-canvas');
    this.screen = document.getElementById('screen-map');
    this.readout = document.getElementById('map-readout');

    this.miniView = new MapView({ span: (fog?.size ?? 30) * 0.98 });
    this.fullView = new MapView({ span: OVERLAY_SPAN });

    this.bindPointer();
    this.subscribe();
  }

  get bounds() { return { size: this.fog?.size ?? 30 }; }

  subscribe() {
    events.on(GAME_EVENT.MISSION_START, () => this.reset());

    // The AI speaking from a degraded sensor is the one thing the map can say
    // about information quality without being told a position: the reading on
    // screen came from a unit that cannot see what it claims to.
    events.on(GAME_EVENT.AI_RECOMMENDATION, ({ unit, confidence, sourceStatus }) => {
      this.claim = sourceStatus && sourceStatus !== 'healthy'
        ? { unit, confidence, degraded: true }
        : null;
    });
  }

  reset() {
    this.model.reset();
    this.model.bounds = this.bounds;
    this.discovery.mem = this.fog?.mem ?? 128;
    this.discovery.size = this.fog?.size ?? 30;
    this.miniView.span = (this.fog?.size ?? 30) * 0.98;
    this.fullView.span = Math.min(OVERLAY_SPAN, (this.fog?.size ?? 30) * 0.98);
    this.fullView.cx = 0;
    this.fullView.cz = 0;
    this.claim = null;
    this.selected = -1;
    this.fogData = null;
  }

  // ------------------------------------------------------------- open/close
  // Deliberately does NOT pause the game. The map has to show the drone moving
  // and the squad walking — freezing the timeline the way the pause menu does
  // would make the one thing it is for impossible.
  show() {
    if (this.open) return;
    this.open = true;
    this.selected = -1;
    // Open on the squad, so the first thing you see is where you are.
    const lead = this.squad?.lead?.position;
    if (lead) {
      const [cx, cz] = clampCentre(lead.x, lead.z, this.fullView.span, this.bounds);
      this.fullView.cx = cx;
      this.fullView.cz = cz;
    }
    this.screen?.classList.remove('hidden');
    audio.select();
    this.draw();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.screen?.classList.add('hidden');
    audio.select();
  }

  toggle() { if (this.open) this.hide(); else this.show(); }

  // ------------------------------------------------------------ navigation
  zoomBy(factor) {
    this.fullView.span = clampSpan(this.fullView.span * factor, this.bounds);
    const [cx, cz] = clampCentre(this.fullView.cx, this.fullView.cz, this.fullView.span, this.bounds);
    this.fullView.cx = cx;
    this.fullView.cz = cz;
  }

  panBy(dx, dz) {
    const [cx, cz] = clampCentre(
      this.fullView.cx + dx, this.fullView.cz + dz, this.fullView.span, this.bounds,
    );
    this.fullView.cx = cx;
    this.fullView.cz = cz;
  }

  // Step through what is on the board. A pad has no pointer, so this is how a
  // controller reads a marker.
  selectNext(step = 1) {
    const n = this.markers.length;
    if (!n) return;
    this.selected = ((this.selected + step) % n + n) % n;
    const m = this.markers[this.selected];
    const [cx, cz] = clampCentre(m.x, m.z, this.fullView.span, this.bounds);
    this.fullView.cx = cx;
    this.fullView.cz = cz;
    audio.hover();
  }

  // Semantic controls, from keyboard and pad alike — see Input.js.
  handle(control) {
    const step = this.fullView.span * 0.12;
    switch (control) {
      case CONTROL.OPEN_MAP:
      case CONTROL.CANCEL: this.hide(); return true;
      case CONTROL.ZOOM_IN: this.zoomBy(1 / 1.25); return true;
      case CONTROL.ZOOM_OUT: this.zoomBy(1.25); return true;
      case CONTROL.NAV_UP: this.panBy(0, -step); return true;
      case CONTROL.NAV_DOWN: this.panBy(0, step); return true;
      case CONTROL.NAV_LEFT: this.panBy(-step, 0); return true;
      case CONTROL.NAV_RIGHT: this.panBy(step, 0); return true;
      case CONTROL.CONFIRM: this.selectNext(1); return true;
      case CONTROL.NEXT_UNIT: this.selectNext(1); return true;
      case CONTROL.PREV_UNIT: this.selectNext(-1); return true;
      default: return true;      // the map swallows the rest while it is up
    }
  }

  prompts() {
    return [
      { control: CONTROL.NAV_UP, label: 'PAN' },
      { control: CONTROL.ZOOM_IN, label: 'ZOOM' },
      { control: CONTROL.CONFIRM, label: 'NEXT MARKER' },
      { control: CONTROL.OPEN_MAP, label: 'CLOSE' },
    ];
  }

  bindPointer() {
    // Clicking the minimap opens the full map — the obvious gesture, and the
    // only one a mouse-only player needs to discover.
    this.mini?.addEventListener('click', () => this.toggle());
    this.mini?.addEventListener('pointerenter', () => audio.hover());

    if (!this.full) return;

    this.full.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Zoom about the cursor, so the thing you are pointing at stays put.
      const rect = this.full.getBoundingClientRect();
      const [wx, wz] = this.fullView.toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const before = this.fullView.span;
      this.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      const k = 1 - this.fullView.span / before;
      this.panBy((wx - this.fullView.cx) * k, (wz - this.fullView.cz) * k);
    }, { passive: false });

    let dragging = null;
    this.full.addEventListener('pointerdown', (e) => {
      dragging = { x: e.clientX, y: e.clientY };
      this.full.setPointerCapture(e.pointerId);
    });
    this.full.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const s = this.fullView.scale || 1;
      this.panBy(-(e.clientX - dragging.x) / s, -(e.clientY - dragging.y) / s);
      dragging = { x: e.clientX, y: e.clientY };
    });
    const endDrag = () => { dragging = null; };
    this.full.addEventListener('pointerup', endDrag);
    this.full.addEventListener('pointercancel', endDrag);
  }

  // ------------------------------------------------------------- game state
  // Everything below reads the live game once per frame and hands it to the
  // model. No branch here knows which mission is running.
  units() {
    return (this.squad?.all || []).map((u) => ({
      id: u.id,
      x: u.position.x,
      z: u.position.z,
      heading: u.heading,
      status: u.status,
      range: (u.baseRange ?? 8.5) * (u.cone?.mesh?.scale?.x ?? 1),
      fov: u.coneFov ?? 58,
      // A unit the mission has written off keeps its marker at the place it
      // was lost. Nothing sets this today; the map is ready for it.
      lost: u.lost === true,
    }));
  }

  // Contacts enter the map only once the game has actually put them on the
  // board — `fx.hostiles` is populated by the reveal, not by mission data.
  syncContacts() {
    for (const [i, h] of (this.fx?.hostiles || []).entries()) {
      this.model.addContact({
        id: `contact-${i}`,
        x: h.position.x,
        z: h.position.z,
        certainty: CERTAINTY.CONFIRMED,
        source: SOURCE.OBSERVED,
      });
    }
  }

  // Fires are live world state rather than remembered knowledge, so they are
  // rebuilt every frame: one that burns out leaves the map, one that spreads
  // grows on it. The radius is the same reach the smoke uses to occlude a
  // sensor, so the danger area the player is routing around is the one the
  // world actually has.
  //
  // The level owns the fire, not the map. Compound 14 runs a single staged
  // column (see DepotLevel.hazard and the SMOKE_STAGES table) rather than a
  // list of independent hazards, and reading it here — instead of keeping a
  // second fire model — is what stops the map disagreeing with the board.
  //
  //   stage 1  the fuel store alight, out in the yard
  //   stage 2  smoke into the service corridor
  //   stage 3  smoke on the ammunition room
  syncHazards() {
    this.model.hazards.clear();

    const fire = this.level?.fire;
    if (fire?.group?.visible && fire.stage > 0) {
      const spread = fire.material?.uniforms?.uSpread?.value ?? 3;
      this.model.addHazard({
        id: 'compound-fire',
        x: fire.group.position.x,
        z: fire.group.position.z,
        radius: 1.6 + spread * 0.9,
        // Stage 1 is a fire you can see burning. Past that what reaches the
        // squad is smoke, and smoke is what degrades the sensors.
        label: fire.stage >= 2 ? 'SMOKE' : 'FIRE',
        state: fire.stage >= 2 ? 'spreading' : 'burning',
      });
    }

    // Missions whose world keeps a hazard list (Dry Creek) feed the same model.
    for (const [i, h] of (this.hazards?.list || []).entries()) {
      if (h.intensity <= 0.05) continue;
      this.model.addHazard({
        id: h.key || `hazard-${i}`,
        x: h.follow ? h.follow.position.x : h.x,
        z: h.follow ? h.follow.position.z : h.z,
        radius: 1.6 + h.intensity * 2.6,
        label: h.hasFlame ? 'FIRE' : 'SMOKE',
        state: h.intensity >= (h.max ?? 1.35) * 0.8 ? 'spreading' : 'burning',
      });
    }
  }

  syncDrone() {
    const drone = this.fx?.drone;
    if (!drone?.flying) { this.model.setDrone(null); return; }
    // `drone.target` is a place key; the orbit point is where it actually
    // settles once it arrives.
    const dest = this.places[drone.target] || drone.orbit || null;
    this.model.setDrone({
      x: drone.group.position.x,
      z: drone.group.position.z,
      tx: dest?.x,
      tz: dest?.z,
    });
  }

  // Which place the current objective lives at. Objectives carry no coordinates
  // — the id-to-place join is ObjectiveMarkers', and this reuses it rather than
  // keeping a second table that could disagree with the 3D markers.
  objectiveKey() {
    const objectives = this.state?.objectives?.() || [];
    const mapped = objectives
      .map((o) => ({ ...o, place: this.objectivePlaces[o.id] }))
      .filter((o) => o.place && this.places[o.place]);
    if (!mapped.length) return null;
    return (mapped.find((o) => o.state === 'pending') || mapped[mapped.length - 1]).place;
  }

  refreshDiscovery(dt) {
    this.sinceSample += dt;
    if (this.sinceSample < 1 / DISCOVERY_HZ && this.fogData) return;
    this.sinceSample = 0;
    const fog = this.fog;
    if (!fog?.ctx) return;
    try {
      this.fogData = fog.ctx.getImageData(0, 0, fog.mem, fog.mem).data;
    } catch {
      this.fogData = null;      // unreadable memory: draw nothing as known
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.refreshDiscovery(dt);

    const units = this.units();
    this.cones = units;
    const lead = this.squad?.lead?.position;
    if (lead) this.model.trackSquad(lead.x, lead.z);

    this.syncContacts();
    this.syncHazards();
    this.syncDrone();

    this.markers = this.model.build({
      units,
      places: this.places,
      objective: this.objectiveKey(),
    });

    this.draw();
  }

  // Canvases are sized from their box, at device resolution, or the map is a
  // blurry rectangle on every laptop made in the last decade.
  fit(canvas, view) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    view.resize(w, h);
    return true;
  }

  draw() {
    const common = {
      markers: this.markers,
      fogCanvas: this.fog?.canvas,
      bounds: this.bounds,
      route: this.model.visited,
      cones: this.cones,
      droneTrack: this.model.droneTrack,
    };

    if (this.mini && this.fit(this.mini, this.miniView)) {
      drawMap(this.mini.getContext('2d'), { ...common, view: this.miniView, detail: false });
    }
    if (this.open && this.full && this.fit(this.full, this.fullView)) {
      drawMap(this.full.getContext('2d'), { ...common, view: this.fullView, detail: true });
      this.paintReadout();
    }
  }

  // One line of text under the overlay, and only one: the map is a picture,
  // not a report. It says what is selected, and — when it applies — that the
  // reading on screen came from a sensor that cannot back it up.
  paintReadout() {
    if (!this.readout) return;
    const m = this.markers[this.selected];
    const parts = [];
    if (m) {
      const what = m.label || m.id;
      const qualifier = m.kind === MARKER.CONTACT
        ? m.certainty.toUpperCase()
        : (m.source === SOURCE.BRIEFED ? 'BRIEFED — NOT OBSERVED' : null);
      parts.push(qualifier ? `${what} · ${qualifier}` : what);
      parts.push(`${m.x.toFixed(1)}, ${m.z.toFixed(1)}`);
    } else {
      parts.push('SELECT A MARKER');
    }
    this.readout.textContent = parts.join('   ');
    this.readout.classList.toggle('degraded', !!this.claim?.degraded);
    if (this.claim?.degraded) {
      this.readout.textContent =
        `${parts[0]}   ·   ${this.claim.unit} REPORTING ${this.claim.confidence} FROM A DEGRADED SENSOR`;
    }
  }
}
