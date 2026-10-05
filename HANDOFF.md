# HANDOFF.md

## Project Purpose

Rally 3D — Veltron Edition is a browser-based retro rally prototype inspired by the 2005 Nokia J2ME game Rally 3D (a re-skin of Synergenix's Rally Pro Contest, 2004). The goal is a faithful technical reconstruction of the original's visual language and arcade rally gameplay, built with modern Three.js/WebGL while preserving the period-authentic aesthetic.

**Current status**: Prototype 0.3 — two stages (Grassy Plains, Mountain Touge), three cars, stage selection, soundtrack, complete menu flow.

---

## Architecture Overview

### Core Modules

| File | Responsibility |
|------|----------------|
| `src/main.js` | Boot, state machine (title→garage→race→results), game loop, stage management, audio |
| `src/stage.js` | Centerline from moves, road ribbon, terrain mesh, roadside, horizon mountains, surface queries |
| `src/car.js` | Vehicle physics (longitudinal/lateral), suspension, mesh construction |
| `src/cars.js` | Vehicle definitions (stats, tuning, livery) |
| `src/world.js` | Sky dome, fog, lights, environment palettes, `setEnvironment()` |
| `src/camera.js` | Chase camera with speed-adaptive lag compensation |
| `src/input.js` | Keyboard state, edge-triggered menu actions |
| `src/hud.js` | Speed, stage timer, penalty display |
| `src/screens.js` | Title, garage (car+stage select), results |
| `src/cars.js` | Vehicle definitions (stats, tuning, livery) |
| `src/world.js` | Sky, fog, lights, environment palettes |

### Key Architectural Decision

**Single source of truth for terrain height**: `Stage.terrainHeight(x, z, q)` is the *only* function that computes ground elevation. It is used by both:
- Terrain mesh generation (`_buildTerrain`)
- Vehicle physics (`car._followTerrain`)

This guarantees the vehicle never floats or sinks, regardless of grid resolution or slope.

### Data-Driven Design

Stages and environments are pure data:
- `STAGES` object in `stage.js` — each stage = move list + optional mountain params
- `ENVIRONMENTS` in `world.js` — palette + fog + sky per environment
- `CARS` in `cars.js` — stats, tuning, livery per vehicle

Adding a stage = one new entry in `STAGES` + environment entry in `ENVIRONMENTS`. No engine code changes.

---

## File Structure

```
.
├── index.html                 # Entry point, importmap, UI screens
├── style.css                  # Retro UI styling
├── Call It What You Like (VIP Edit).mp3
├── vendor/three.module.js     # Three.js r160 (vendored)
└── src/
    ├── main.js          (290 lines)
    ├── stage.js         (915 lines)
    ├── car.js           (400 lines)
    ├── cars.js          (100 lines)
    ├── world.js         (175 lines)
    ├── camera.js        (70 lines)
    ├── input.js         (80 lines)
    ├── hud.js           (50 lines)
    ├── screens.js       (120 lines)
    └── cars.js          (100 lines)
```

---

## Important Modules

### `stage.js` — The Heart

**Key exports**: `STAGES`, `STAGE_LIST`, `Stage` class

**Stage definition**:
```js
{
  id: 'mountain',
  name: 'MOUNTAIN TOUGE',
  environment: 'mountain',
  seed: 19860512,
  mountainDir: [0.82, 0.57],
  mountainSlope: 0.34,
  mountainRamp: 46,
  gridCell: 12,
  treeCount: 420,
  moves: [
    { straight: 130, grade: 0.06 },
    { turn: 145, radius: 32, grade: 0.11 },
    // ...
  ]
}
```

**Key methods**:
- `_buildCenterline()` — integrates moves into dense centreline (5 m spacing)
- `_buildLookup()` — spatial hash (24 m cells) for O(1) queries
- `query(x, z)` → `{ y, lat, absLat, surface, index, sample }`
- `terrainHeight(x, z, q)` — single source of truth for ground elevation
- `_buildRoadRibbon()` — vertex-coloured ribbon with PROFILE offsets
- `_buildTerrain()` — uniform grid, vertex colours, per-facet tint
- `_buildScenery()` — instanced trees (broadleaf/conifer)
- `_buildRoadside()` — guardrails, poles, signs, rocks, huts (all instanced)
- `_buildGantry()` — checkered start/finish banner
- `_buildHorizonMountains()` — ring of 110 peaks at `extent + 300..580 m`

### `car.js` — Physics

**State**: `position`, `velocity`, `yaw`, `forwardSpeed`, `lateralSpeed`, `distance`, `timePenalty`

**Longitudinal**:
- Throttle tapers: `accel * (1 - (v/maxSpeed)^1.6)`
- Brake: `brake` (v > 0.5) else reverse `accel * 0.45`
- Drag: `v * |v| * drag`
- Rolling: `sign(v) * rollingResist` (surface-dependent)

**Lateral**:
- `steerAngle = steer / (1 + |v| * 0.16)`
- `maxYawRate = maxYawRate / (1 + |v| * 0.13)`
- `lateralSpeed *= exp(-grip * dt)`

**Grip table**:
| Surface | Grip | Rolling |
|---------|------|---------|
| road    | tuning.gripRoad | tuning.rollingResist |
| verge   | 6.0   | 0.9 |
| grass   | 3.4   | 1.9 |

**Suspension**: 4 wheel queries/frame, critically-damped spring (k=14, c=6.5), body height = average of 4 contacts.

### `world.js` — Environment

`ENVIRONMENTS` object with `cartway`, `gravel`, `snow`, `night`, `mountain`.

`setEnvironment(env)`:
- Updates `scene.fog` (color, near, far)
- Updates `scene.background`
- Rebuilds sky dome (disposes old, creates new canvas texture)

Sky dome: 8×128 canvas, upper 78% quantised into `bands` steps (posterised), lower 22% linear gradient to ground haze. `NearestFilter` preserves banding.

### `camera.js` — Chase Camera

```js
rate = positionLerp + speed * 0.32  // adaptive: prevents lag at high speed
target = car.pos - fwd * back + up * height
camera.position.lerp(target, 1 - exp(-rate * dt))
lookAt = car.pos + fwd * lookAhead + up * lookHeight
```

| Param | Value |
|-------|-------|
| back | 6.2 m |
| height | 3.4 m |
| lookAhead | 7.5 m |
| lookHeight | 1.15 m |
| positionLerp | 6.0 + speed * 0.32 |
| lookLerp | 11.0 |

### `input.js`

- `keydown`/`keyup` on `window` with `preventDefault` for game keys
- Edge-triggered: ignores `e.repeat`
- `_keys` Set → `_refresh()` derives `throttle/brake/steer/handbrake`
- Menu actions: `confirm`, `back`, `left`, `right`, `up`, `down` (edge-triggered via `consumeMenu()`)
- `blur` clears keys and re-derives state (prevents stuck throttle on alt-tab)

### `main.js` State Machine

```
title → (Enter) → garage → (Enter) → race → (finish) → results
                ↑           ↓
                ←─── (Esc) ←───
```

| State | Action |
|-------|--------|
| title | Enter → garage |
| garage | ←/→ cycle car, ↑/↓ cycle stage, Enter → race, Esc → title |
| race | R → restart, Esc → garage, finish → results |
| results | Enter/Esc → garage |

---

## Data Structures

### Stage Samples

```js
{
  x, y, z,          // world position
  heading,          // yaw (0 = -Z)
  fx, fz,           // forward vector
  rx, rz            // right vector
}
```

### Query Result

```js
{
  y,           // road elevation at (x,z)
  lat,         // signed lateral offset (+ = right)
  absLat,      // |lat|
  surface,     // 'road' | 'verge' | 'grass'
  index,       // nearest centreline index
  sample       // full sample object
}
```

### Car State (serialisable subset)

```js
{
  position: { x, y, z },
  velocity: { x, y, z },
  yaw: number,
  forwardSpeed: number,
  lateralSpeed: number,
  distance: number,
  stageProgress: number,  // 0..1
  timePenalty: number,
  surface: 'road' | 'verge' | 'grass',
  finished: boolean
}
```

### Environment Palette

```js
{
  id: 'mountain',
  label: 'MOUNTAIN',
  sky: { top, horizon, ground, bands },
  fog: { color, near, far },
  road, grass, grassAlt, highland, mountain, mountainSnow
}
```

---

## How Stages Work

1. **Author moves** in `STAGES[id].moves` (straight/turn with optional grade)
2. `_buildCenterline()` integrates to dense centreline (5 m samples)
3. `_buildLookup()` builds spatial hash (24 m cells)
4. `build(scene)` creates:
   - Road ribbon (PROFILE offsets, vertex colors)
   - Terrain grid (per-stage `gridCell`, `terrainHeight()`)
   - Scenery (instanced trees)
   - Roadside (guardrails, poles, signs, rocks, huts)
   - Gantry (checkered banner + pillars)
   - Horizon mountains (ring at `extent + 300..580`)
5. `setVisible(true/false)` toggles `stage.root.visible`

---

## How Environments Work

1. `World.build(scene)` creates sky dome, fog, lights for initial env
2. `world.setEnvironment(env)` on stage switch:
   - Updates `scene.fog` (color, near, far)
   - Updates `scene.background`
   - Rebuilds sky dome (disposes old canvas texture, creates new)
3. Stage meshes use `env.road`, `env.grass`, etc. via `this.env`

---

## How Vehicles Work

1. `RallyCar(spec, stage)` — spec from `cars.js`, stage for queries
2. `reset()` — positions at `stage.startPos`, zeroes state
3. `update(dt, input)`:
   - `stage.query()` → surface, grip, rolling
   - Longitudinal forces → `forwardSpeed`
   - Steering → `yaw`
   - Lateral grip decay
   - Position integration
   - `_followTerrain()` — 4 wheel queries, spring suspension
   - `syncMesh()` — positions group, rotates body, positions wheels
3. `applySpec(spec)` swaps tuning + livery without rebuilding mesh

---

## Audio Lifecycle

```js
const Music = {
  el: null, playing: false, _armed: false,
  init() { ... },
  request() { play().then(()=>playing=true).catch(_arm) },
  _arm() { one-shot keydown/click → request() },
  pause() { el.pause(); playing=false }
}
```

- Title screen: `Music.request()` (autoplay fallback via interaction)
- Garage/race: `Music.pause()`
- Title return: `Music.request()`
- Single `<audio id="menu-music">` element, `loop=true`, `volume=0.45`

---

## How to Run Locally

```bash
cd E:\Posao\Veltron_Rally_3d
python -m http.server 8123
# Open http://127.0.0.1:8123/index.html
```

Any static server works (Node `serve`, `npx serve`, VS Code Live Server). **Must use HTTP** — ES modules + importmap fail on `file://`.

---

## How to Test

1. Launch via HTTP server
2. Title → Enter → Garage
3. ↑/↓ cycles stages (Grassy Plains ↔ Mountain Touge)
4. ←/→ cycles cars (V1 / V3 / Centurion)
5. Enter → Race
5. W/S accelerate/brake, A/D steer, Space handbrake, R restart, Esc back
6. Off-road → red `+N.N` penalty beside clock
7. Finish → results (raw time, penalty, medal)
8. Esc → garage, Esc → title
9. Verify music: title (plays), garage/race (paused), title return (resumes)

---

## Known Bugs

1. **Garage turntable uses stage environment** — shares race stage lighting/sky. Minor visual mismatch.
2. **Terrain grid uniform** — no adaptive refinement near road; mountainside facets can look coarse at distance.
3. **No self-centering steering** — car holds angle when throttle released (intentional digital feel).
3. **No collision with scenery** — trees/rocks/huts are ghost geometry.
4. **No AI opponents** — single-car time trial only.
4. **Garage turntable car** placed at fixed offset from start; may clip on steep grades.
5. **Music autoplay** may fail silently on strict browsers until first interaction (armed fallback exists).
6. **HUD version** hardcoded in `main.js` (`PROTOTYPE 0.3`).

---

## Roadmap (from ARCHITECTURE.md)

| Phase | Goal |
|-------|------|
| 1 | Documentation + repo cleanup |
| 2 | Snow environment + stage |
| 3 | Additional stages (gravel, night) |
| 4 | AI opponents (reuse autopilot + query) |
| 5 | Road camber + surface friction variation |
| 6 | Optional scenery collision |
| 7 | Particles, engine sound, championship menu |

---

## Important Implementation Decisions (Do Not Rewrite)

1. **Single `terrainHeight()`** — physics and rendering share this. Do not duplicate.
2. **Stage root groups** — swapping stages = visibility toggle. Do not rebuild on switch.
3. **Data-driven stages** — new stages = data only. Do not hardcode stage logic in engine.
4. **Instanced meshes** for all repeated scenery. Do not add individual meshes.
5. **Speed-adaptive camera lerp** — `rate = base + speed * k`. Do not revert to fixed lerp.
6. **Time penalty off-road** — not grip loss. Do not revert to pure grip reduction.
6. **Unlit terrain + lit car** — matches 2005 baked-look. Do not add PBR/materials.
7. **ES modules + importmap** — no bundler. Do not add webpack/vite.
7. **Vendored Three.js** — `vendor/three.module.js` checked in. Do not use CDN.
8. **Music autoplay fallback** — interaction-armed `play()`. Do not remove.

---

## Things That Should NOT Be Unnecessarily Rewritten

- The `terrainHeight` / physics coupling
- Stage root group visibility toggle
- Data-driven stage/environment/vehicle definitions
- Instanced mesh pattern for scenery
- Speed-adaptive camera lerp
- Time-penalty off-road mechanic
- ES module + importmap architecture
- Vendored Three.js

---

## Quick Start for New Developer

1. `cd project_root`
2. `python -m http.server 8123`
3. Open `http://127.0.0.1:8123/index.html`
4. Enter → Garage → ArrowDown → Enter → Race
5. W/S accelerate/brake, A/D steer, Space handbrake, R restart
6. Console: `window.__rally` exposes `car`, `stage`, `camera`, `debug`, `Music`

---

*End of HANDOFF.md*