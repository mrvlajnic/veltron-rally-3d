// main.js — boot, screen state machine, and the game loop.
import * as THREE from 'three';
import { World, ENVIRONMENTS } from './world.js';
import { Stage, STAGES, STAGE_LIST } from './stage.js';
import { RallyCar } from './car.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Screens } from './screens.js';
import { CARS } from './cars.js';
import { WeatherSystem } from './camera.js';

const MAX_DT = 0.05;
const PROTO_VERSION = 'PROTOTYPE 0.4';

// ------------------------------------------------------------- soundtrack ---
// One <audio> element, reused for the whole session. Browsers refuse to play
// sound before the user interacts, so request() falls back to a one-shot
// listener on the first keypress or click.
const Music = {
  el: null,
  playing: false,
  _armed: false,
  init() {
    if (!this.el) {
      this.el = document.getElementById('menu-music');
      this.el.loop = true;
      this.el.volume = 0.45;
    }
  },
  request() {
    this.init();
    if (this.playing) return;
    const p = this.el.play();
    if (!p) return;
    p.then(() => { this.playing = true; })
     .catch(() => { this.playing = false; this._arm(); });
  },
  _arm() {
    if (this._armed) return;
    this._armed = true;
    const handler = () => {
      this._armed = false;
      window.removeEventListener('keydown', handler);
      window.removeEventListener('pointer', handler);
      this.request();
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('click', handler);
  },
  pause() {
    if (this.el) this.el.pause();
    this.playing = false;
  }
};

function showFatal(message) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'display:flex', 'align-items:center',
    'justify-content:center', 'background:#111', 'color:#f66',
    'font-family:monospace', 'font-size:16px', 'padding:40px',
    'text-align:center', 'white-space:pre-wrap', 'z-index:99'
  ].join(';');
  el.textContent = message;
  document.body.appendChild(el);
}

function boot() {
  // ------------------------------------------------------------ renderer ---
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    showFatal('WebGL is not available in this browser.\n' + err.message);
    throw err;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Click on canvas to focus and enable pointer lock
  renderer.domElement.addEventListener('click', () => {
    renderer.domElement.focus();
    renderer.domElement.requestPointerLock().catch(() => {});
  });

  // Also request pointer lock on mousedown for better UX
  renderer.domElement.addEventListener('mousedown', () => {
    renderer.domElement.requestPointerLock().catch(() => {});
  });

  // --------------------------------------------------------------- scene ---
  const scene = new THREE.Scene();
  // Wide FOV, as inferred from the original: the road spanned nearly the
  // full frame width at the bottom edge.
  const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.3, 4000
  );
  // Camera must be in the scene for its children (speed lines) to render
  scene.add(camera);

  // Sky, fog and lights. The palette is matched to whichever stage is active
  // via setEnvironment() when the player picks a stage.
  const world = new World(ENVIRONMENTS[STAGES[STAGE_LIST[0]].environment]).build(scene);

  // Weather system (rain, fog, sky, lighting per condition)
  const weather = new WeatherSystem(scene, renderer, world);

  // Every stage is built up front and kept in its own group, so switching is
  // a visibility toggle plus a palette swap — no rebuilding, no hitches.
  const stages = {};
  let activeStageId = STAGE_LIST[0];
  for (const id of STAGE_LIST) {
    const def = STAGES[id];
    const st = new Stage(def, ENVIRONMENTS[def.environment]);
    st.build(scene);
    st.setVisible(false);
    stages[id] = st;
  }
  const stage = stages[activeStageId];
  stage.setVisible(true);
  world.setEnvironment(ENVIRONMENTS[stage.def.environment]);

  // Live race car, plus a second instance used as the garage turntable.
  const car = new RallyCar(CARS[0], stage);
  scene.add(car.group);

  const preview = new RallyCar(CARS[0], stage);
  preview.group.visible = false;
  scene.add(preview.group);

  const chase = new ChaseCamera(camera, renderer.domElement);
  const input = new Input();
  const hud = new HUD();
  const screens = new Screens();

  hud.setStageName(stage.def.name);

  // Stage timer state. Targets are raw+penalty, tuned against a clean run.
  const targets = { gold: 72, silver: 88, bronze: 108 };
  let clock = 0;          // raw stage clock
  let state = 'title';    // title | garage | race | results
  let garageSpin = 0;

  /** Show one stage, hide the rest, and match the atmosphere to it. */
  function selectStage(id) {
    activeStageId = id;
    for (const key of STAGE_LIST) stages[key].setVisible(key === id);
    const st = stages[id];
    world.setEnvironment(ENVIRONMENTS[st.def.environment]);
    hud.setStageName(st.def.name);
    car.stage = st;
    preview.stage = st;
    placeGarageCar();
  }

  function selectWeather(id) {
    weather.setWeather(id);
  }

  /** Park the turntable car on the active stage's start verge. */
  function placeGarageCar() {
    const st = stages[activeStageId];
    const px = st.startPos.x + 9.0;
    const pz = st.startPos.z + 1.5;
    const pq = st.query(px, pz);
    preview.group.position.set(px, st.terrainHeight(px, pz, pq), pz);
    preview.group.rotation.y = 0;
    garageSpin = 0;
    frameGarageCamera();
  }

  function goTitle() {
    state = 'title';
    input.clearDriving();
    screens.show('title');
    hud.setVisible(false);
    car.group.visible = false;
    preview.group.visible = false;
    Music.request();
  }

  function goGarage() {
    state = 'garage';
    input.clearDriving();
    Music.pause();
    screens.openGarage();
    screens.applyPreview(preview);
    hud.setVisible(false);
    car.group.visible = false;
    preview.group.visible = true;
    placeGarageCar();
  }

  function frameGarageCamera() {
    const p = preview.group.position;
    camera.position.set(p.x + 3.5, p.y + 1.5, p.z + 4.4);
    // Aim slightly below the car so it sits high in the frame, clear of the
    // stat bars — the original's car render sat above them.
    camera.lookAt(p.x, p.y - 0.30, p.z);
  }

  function goRace() {
    state = 'race';
    input.clearDriving();
    Music.pause();
    car.applySpec(screens.selectedCar);
    car.reset();
    clock = 0;
    screens.hideAll();
    hud.setVisible(true);
    car.group.visible = true;
    preview.group.visible = false;
    chase.snapTo(car);
    // Apply selected weather
    try { weather.setWeather(screens.selectedWeather); } catch (e) { /* weather optional */ }
    // Request pointer lock for mouse steering (may fail silently)
    try {
      const p = renderer.domElement.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* pointer lock optional */ }
  }

  function goResults() {
    state = 'results';
    input.clearDriving();
    screens.showResults(clock, car.timePenalty, targets);
    hud.setVisible(false);
  }

  goTitle();

  // ---------------------------------------------------------- resize hook ---
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ------------------------------------------------- mouse is not an input ---
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('auxclick', (e) => e.preventDefault());
  window.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());

  // ------------------------------------------------------------- the loop ---
  const clockObj = new THREE.Clock();
  const debug = { fps: 0, frames: 0, elapsed: 0, restarts: 0, state: 'title' };
  window.__rally = { car, preview, camera, renderer, scene, stage, stages, activeStageId, world, weather, input, hud, screens, chase, debug, CARS, STAGE_LIST, Music, ENVIRONMENTS };

  function frame() {
    requestAnimationFrame(frame);

    const dt = Math.min(clockObj.getDelta(), MAX_DT);

    debug.frames++;
    debug.elapsed += dt;
    if (debug.elapsed >= 0.5) {
      debug.fps = Math.round(debug.frames / debug.elapsed);
      debug.frames = 0;
      debug.elapsed = 0;
    }
    debug.state = state;

    const menu = input.consumeMenu();

    switch (state) {
      case 'title':
        if (menu.confirm) goGarage();
        break;

      case 'garage': {
        if (menu.left) { if (screens.cycleCar(-1)) screens.applyPreview(preview); }
        if (menu.right) { if (screens.cycleCar(1)) screens.applyPreview(preview); }
        if (menu.up) { if (screens.cycleStage(-1)) selectStage(screens.selectedStageId); }
        if (menu.down) { if (screens.cycleStage(1)) selectStage(screens.selectedStageId); }
        if (menu.left && menu.shiftKey) { if (screens.cycleWeather(-1)) selectWeather(screens.selectedWeather); }
        if (menu.right && menu.shiftKey) { if (screens.cycleWeather(1)) selectWeather(screens.selectedWeather); }
        if (menu.back) goTitle();
        if (menu.confirm) goRace();
        // Slow turntable, like the original's car-select render.
        garageSpin += dt * 0.55;
        preview.group.rotation.y = garageSpin;
        frameGarageCamera();
        break;
      }

      case 'race': {
        if (input.consumeRestart()) {
          car.reset();
          clock = 0;
          chase.snapTo(car);
          debug.restarts++;
        }
        if (menu.back) { goGarage(); break; }

        clock += dt;

        // Mouse steering (add to keyboard input)
        const mouseSteer = chase.getMouseSteer();
        if (mouseSteer !== 0) {
          input.steer = Math.max(-1, Math.min(1, input.steer + mouseSteer));
        }

        // Update weather
        weather.update(dt, car.position);

        car.update(dt, input);
        chase.update(car, dt);
        hud.update(car.forwardSpeed, clock, car.timePenalty);
        if (car.finished) goResults();
        break;
      }

      case 'results':
        if (menu.confirm || menu.back) goGarage();
        break;
    }

    renderer.render(scene, camera);
  }

  document.getElementById('version').textContent = PROTO_VERSION;
  frame();
}

try {
  boot();
} catch (err) {
  console.error(err);
  showFatal('Failed to start Rally 3D.\n' + (err && err.message ? err.message : String(err)));
}
