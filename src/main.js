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
import { EngineAudio } from './engine-audio.js';

const MAX_DT = 0.05;
const PROTO_VERSION = 'PROTOTYPE 0.5';

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

// Tiny countdown beeps — no audio assets needed. The context is created lazily
// on first use (after a keypress, so autoplay policy is satisfied). If audio
// is blocked for any reason the visual countdown still works.
let _actx = null;
function beep(freq, dur = 0.12) {
  try {
    if (!_actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      _actx = new AC();
    }
    if (_actx.state === 'suspended') _actx.resume().catch(() => {});
    const t = _actx.currentTime;
    const o = _actx.createOscillator();
    const g = _actx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(_actx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (e) { /* audio optional */ }
}

// Puddle-dirt splatter, generated once per variant: grime clustered at the
// edges and corners (as if wipers cleared the middle) plus upward streaks.
function makeDirtTexture(seed) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  let h = seed * 12345;
  const rnd = () => { h = (h * 16807) % 2147483647; return h / 2147483647; };
  for (let i = 0; i < 90; i++) {
    const edge = rnd();
    const x = edge < 0.7 ? (rnd() < 0.5 ? rnd() * 70 : S - rnd() * 70) : rnd() * S;
    const y = edge < 0.7 ? (rnd() < 0.5 ? rnd() * 70 : S - rnd() * 70) : rnd() * S;
    const r = 3 + rnd() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.25 + rnd() * 0.45;
    g.addColorStop(0, 'rgba(58,44,28,' + a.toFixed(2) + ')');
    g.addColorStop(1, 'rgba(58,44,28,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(58,44,28,0.35)';
  for (let i = 0; i < 24; i++) {
    const x = rnd() * S, y = S * 0.4 + rnd() * S * 0.6;
    ctx.lineWidth = 1 + rnd() * 2.5;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 20, y - 20 - rnd() * 40); ctx.stroke();
  }
  return canvas.toDataURL();
}

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

  // Click on canvas to focus and enable pointer lock
  renderer.domElement.addEventListener('click', () => {
    renderer.domElement.focus();
    renderer.domElement.requestPointerLock().catch(() => {});
  });
  renderer.domElement.addEventListener('mousedown', () => {
    renderer.domElement.requestPointerLock().catch(() => {});
  });

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
  const engineAudio = new EngineAudio();

  // Title parallax: the mouse drifts the key art against the menu for a 2.5D
  // feel. Art moves opposite the cursor (looking around), menu follows it a
  // little — the separation between layers is what sells the depth.
  const titleBg = document.getElementById('title-bg');
  const titlePanel = document.querySelector('#screen-title .panel');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mouseX = 0, mouseY = 0, parX = 0, parY = 0;
  if (titleBg && !reduceMotion) {
    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX / window.innerWidth - 0.5;
      mouseY = e.clientY / window.innerHeight - 0.5;
    });
  }

  hud.setStageName(stage.def.name);

  // Medal targets are raw+penalty, clocked from autopilot clean runs on the
  // balanced V1 (plains ~56 s, mountain ~286 s incl. penalties) with a margin
  // for human racing lines. Faster cars have headroom; slower cars must be tidy.
  const TARGETS = {
    cartway: { gold: 54, silver: 66, bronze: 81 },
    mountain: { gold: 228, silver: 278, bronze: 342 }
  };
  const PHY_STEP = 1 / 120; // car physics advances in fixed slices
  let phyAcc = 0;
  let clock = 0;          // raw stage clock
  let state = 'title';    // title | garage | countdown | race | results
  let garageSpin = 0;

  // Stage-start countdown overlay (3-2-1-GO). The clock only starts at GO.
  const cdEl = document.getElementById('countdown');
  let cdT = 0;
  let cdLabel = '';
  function showCountdown(text) {
    cdLabel = text;
    cdEl.textContent = text;
    cdEl.classList.remove('hidden');
    // Re-trigger the pop animation on every number change.
    cdEl.classList.remove('pop');
    void cdEl.offsetWidth;
    cdEl.classList.add('pop');
  }
  function hideCountdown() {
    cdEl.classList.add('hidden');
    cdLabel = '';
  }

  // Speed vignette + puddle dirt overlays.
  const vigEl = document.getElementById('speed-vignette');
  const dirtEl = document.getElementById('dirt');
  const dirtVariants = [makeDirtTexture(7), makeDirtTexture(42)];
  let dirtLevel = 0;   // 0..1, decays over seconds after a puddle strike
  function clearOverlays() {
    dirtLevel = 0;
    vigEl.style.opacity = '0';
    dirtEl.style.opacity = '0';
    dirtEl.classList.add('hidden');
  }

  /** Rain wets only the driven stage: puddles show on the active road. */
  function applyWetness() {
    const wet = weather.current === 'rainy';
    for (const key of STAGE_LIST) stages[key].setPuddlesVisible(key === activeStageId && wet);
  }

  /** Show one stage, hide the rest, and match the atmosphere to it. */
  function selectStage(id) {
    activeStageId = id;
    for (const key of STAGE_LIST) stages[key].setVisible(key === id);
    const st = stages[id];
    world.setEnvironment(ENVIRONMENTS[st.def.environment]);
    hud.setStageName(st.def.name);
    applyWetness();
    car.stage = st;
    preview.stage = st;
    placeGarageCar();
    // Force camera update after stage switch
    frameGarageCamera();
  }

  function selectWeather(id) {
    weather.setWeather(id);
    applyWetness();
  }

  /** Park the turntable car on the active stage's start verge. */
  function placeGarageCar() {
    const st = stages[activeStageId];
    const px = st.startPos.x + 9.0;
    const pz = st.startPos.z + 1.5;
    const pq = st.query(px, pz);
    preview.group.position.set(px, st.surfaceHeight(px, pz, pq), pz);
    preview.group.rotation.y = 0;
    garageSpin = 0;
    frameGarageCamera();
  }

  function goTitle() {
    state = 'title';
    input.clearDriving();
    engineAudio.stop();
    clearOverlays();
    hideCountdown();
    screens.show('title');
    hud.setVisible(false);
    car.group.visible = false;
    preview.group.visible = false;
    Music.request();
  }

  function goGarage() {
    state = 'garage';
    input.clearDriving();
    engineAudio.stop();
    clearOverlays();
    hideCountdown();
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
    const spec = screens.selectedCar;
    if (!spec || !spec.tuning) {
      console.error('goRace aborted: no car selected');
      return;
    }
    car.applySpec(spec);
    car.reset();
    state = 'countdown';
    input.clearDriving();
    Music.pause();
    clock = 0;
    screens.hideAll();
    hud.setVisible(true);
    hud.update(0, 0, 0);
    car.group.visible = true;
    preview.group.visible = false;
    chase.snapTo(car);
    // Apply selected weather
    try { weather.setWeather(screens.selectedWeather); } catch (e) { /* weather optional */ }
    applyWetness();
    // Request pointer lock for mouse steering (may fail silently)
    try {
      const p = renderer.domElement.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* pointer lock optional */ }
    // Stage-start countdown — the clock starts at GO, not here.
    cdT = 3.0;
    cdLabel = '';
    engineAudio.start();
  }

  /** Push current driving state into the synthesized audio. */
  function feedAudio() {
    const spd = Math.abs(car.forwardSpeed);
    const thr = input.throttle;
    // Revving on the start line: parked + throttle = rising note.
    const rpm = (state === 'countdown' && spd < 0.5)
      ? 0.18 + thr * 0.35
      : car.rpm;
    engineAudio.setEngine(rpm, thr);
    const slideAmt = Math.min(1,
      Math.abs(car.lateralSpeed) / 7 + (input.handbrake && spd > 3 ? 0.3 : 0));
    engineAudio.setSkid(Math.min(1,
      slideAmt + (car.offRoad && spd > 4 ? 0.35 : 0)));
    engineAudio.setWind(Math.min(1, spd / 40));
  }

  function goResults() {
    state = 'results';
    input.clearDriving();
    engineAudio.stop();
    clearOverlays();
    hideCountdown();
    screens.showResults(clock, car.timePenalty, TARGETS[activeStageId] || TARGETS.cartway);
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
      case 'title': {
        if (titleBg && !reduceMotion) {
          const k = 1 - Math.exp(-6 * dt);
          parX += (mouseX - parX) * k;
          parY += (mouseY - parY) * k;
          titleBg.style.transform =
            `translate(${(parX * -24).toFixed(2)}px, ${(parY * -16).toFixed(2)}px)`;
          if (titlePanel) titlePanel.style.transform =
            `translate(${(parX * 8).toFixed(2)}px, ${(parY * 6).toFixed(2)}px)`;
        }
        if (menu.confirm) goGarage();
        break;
      }

      case 'garage': {
        if (menu.left) {
          if (menu.shift || menu.shiftKey) { if (screens.cycleWeather(-1)) selectWeather(screens.selectedWeather); }
          else if (screens.cycleCar(-1)) screens.applyPreview(preview);
        }
        if (menu.right) {
          if (menu.shift || menu.shiftKey) { if (screens.cycleWeather(1)) selectWeather(screens.selectedWeather); }
          else if (screens.cycleCar(1)) screens.applyPreview(preview);
        }
        if (menu.up) { if (screens.cycleStage(-1)) selectStage(screens.selectedStageId); }
        if (menu.down) { if (screens.cycleStage(1)) selectStage(screens.selectedStageId); }
        if (menu.back) goTitle();
        if (menu.confirm) goRace();
        // Slow turntable, like the original's car-select render.
        garageSpin += dt * 0.55;
        preview.group.rotation.y = garageSpin;
        frameGarageCamera();
        // Animate rain around the preview car so the weather pick is visible.
        weather.update(dt, preview.group.position);
        break;
      }

      case 'countdown': {
        if (menu.back) { goGarage(); break; }

        // Car stays parked with locked inputs; camera settles, rain falls.
        weather.update(dt, car.position);
        chase.update(car, dt);
        feedAudio();

        cdT -= dt;
        const label = cdT > 0 ? String(Math.ceil(cdT)) : 'GO!';
        if (label !== cdLabel) {
          showCountdown(label);
          beep(label === 'GO!' ? 880 : 440, label === 'GO!' ? 0.3 : 0.12);
        }
        if (cdT <= -0.7) {
          hideCountdown();
          state = 'race';
          clock = 0;
        }
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

        // Fixed-step physics: identical handling at 20 fps and 60 fps.
        // Camera/weather stay per-frame (visual smoothing, not physics).
        phyAcc = Math.min(phyAcc + dt, 0.06);
        while (phyAcc >= PHY_STEP) {
          car.update(PHY_STEP, input);
          phyAcc -= PHY_STEP;
        }
        // Feel: rumble on grass, faint tremor at high speed.
        const spd = Math.abs(car.forwardSpeed);
        if (car.offRoad && spd > 4) chase.addShake(dt * 4);
        else if (spd > 20) chase.addShake(dt * 1.2 * Math.min(1, (spd - 20) / 12));
        chase.update(car, dt);
        hud.update(car.forwardSpeed, clock, car.timePenalty);
        feedAudio();
        // Tunnel vision with speed.
        const sr = Math.min(1, spd / 42);
        vigEl.style.opacity = sr > 0.25 ? ((sr - 0.25) / 0.75 * 0.9).toFixed(2) : '0';
        // Puddle strikes in the rain: dirty screen + splash + jolt.
        if (weather.current === 'rainy' && spd > 8) {
          const spots = stages[activeStageId].puddleSpots;
          for (let pi = 0; pi < spots.length; pi++) {
            const s = spots[pi];
            if (clock - s._hit < 4) continue;   // per-puddle cooldown
            const dx = car.position.x - s.x, dz = car.position.z - s.z;
            const rr = s.r + 1.0;
            if (dx * dx + dz * dz < rr * rr) {
              s._hit = clock;
              dirtLevel = Math.min(1, dirtLevel + 0.55);
              dirtEl.style.backgroundImage = 'url(' + dirtVariants[pi % dirtVariants.length] + ')';
              dirtEl.classList.remove('hidden');
              chase.addShake(0.3);
              try { engineAudio.splash(Math.min(1, spd / 30)); } catch (e) { /* silent */ }
              break;
            }
          }
        }
        if (dirtLevel > 0.01) {
          dirtLevel *= Math.exp(-dt / 3.5);
          dirtEl.style.opacity = (dirtLevel * 0.85).toFixed(2);
        } else if (dirtLevel !== 0) {
          dirtLevel = 0;
          dirtEl.style.opacity = '0';
          dirtEl.classList.add('hidden');
        }
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
