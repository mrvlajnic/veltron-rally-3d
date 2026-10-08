# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        index.html                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Title Screen │  │ Garage Screen │  │ Results Screen    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        main.js                               │
│  State Machine: title → garage → countdown → race → results │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Update Loop (requestAnimationFrame)                   │ │
│  │  • dt = min(clock.getDelta(), MAX_DT)                  │ │
│  │  • input.consumeMenu() → menu actions                   │ │
│  │  • car.update(dt, input)                               │ │
│  │  │  • terrain query → surface, slope, grip             │ │
│  │  │  • longitudinal forces (throttle/brake/drag)        │ │
│  │  │  • steering (speed-sensitive)                       │ │
│  │  │  • lateral grip decay                               │ │
│  │  │  • position integration                             │ │
│  │  │  • terrain following (suspension)                   │ │
│  │  • chase.update(car, dt)                               │ │
│  │  • hud.update(speed, clock, penalty)                   │ │
│  │  • renderer.render(scene, camera)                      │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐  ┌──────────────┐ ┌────────────┐
        │ stage.js │  │   world.js   │ │   car.js   │
        └──────────┘  └──────────────┘ └────────────┘
```

## Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `main.js` | Boot, state machine, game loop, stage management, audio |
| `stage.js` | Centerline generation, road ribbon, terrain mesh, roadside, horizon mountains, surface queries |
| `car.js` | Vehicle physics (longitudinal/lateral), suspension, rendering |
| `cars.js` | Vehicle definitions (stats, tuning, livery) |
| `world.js` | Sky dome, fog, lights, environment palettes |
| `camera.js` | Chase camera with speed-adaptive lag compensation |
| `input.js` | Keyboard state, edge-triggered menu actions |
| `engine-audio.js` | Synthesized RPM engine + skid + wind (WebAudio, no assets) |
| `hud.js` | Speed, timer, penalty, stage name display |
| `screens.js` | Title, garage (car+stage select), results |
| `world.js` | Sky dome, fog, lights, environment palettes |
| `stage.js` | Stage centerline, terrain, roadside, horizon mountains, surface queries |

## Rendering Pipeline

```
Scene
├── World (sky dome + lights)
│   ├── Sky dome (sphere, back-side, posterised canvas texture)
│   ├── Hemisphere light
│   └── Directional light (sun)
├── Stage (root group, visibility toggled)
│   ├── Road ribbon (MeshBasicMaterial, vertex colors, 0.02 m lift)
│   ├── Terrain (MeshBasicMaterial, vertex colors, flat facets)
│   ├── Scenery (instanced trees: broadleaf blobs + conifers)
│   ├── Roadside (guardrails, poles, signs, rocks, huts — all instanced)
│   └── Gantry (checkered start banner + pillars)
└── Cars (2× RallyCar)
    ├── Body group (lit, flat-shaded Lambert)
    ├── Wheels (steer pivots + spin groups)
    └── Contact shadow (MeshBasicMaterial, transparent circle)
```

### Materials

| Object | Material | Shading |
|--------|----------|---------|
| Terrain, road, scenery | `MeshBasicMaterial` + vertex colors | Unlit (baked look) |
| Cars (body, glass, trim) | `MeshLambertMaterial`, `flatShading: true` | Per-face flat lighting |
| Wheels | `MeshLambertMaterial` | Flat shading |
| Sky dome | `MeshBasicMaterial` + canvas texture | Unlit, no fog |
| HUD | HTML/CSS | — |

### Sky Dome

- 8×128 canvas texture generated at runtime
- Upper 78%: horizon→top gradient, quantised to N bands (posterised)
- Lower 22%: linear gradient to ground haze colour
- `NearestFilter` preserves hard band edges
- Rendered behind everything, no fog, no depth write

### Fog

| Environment | Near | Far | Colour |
|-------------|------|-----|--------|
| cartway | 40 m | 340 m | #bcd8ec |
| mountain | 45 m | 360 m | #b8ccd8 |

Fog hides draw distance and blends distant mountains into haze.

## Stage Pipeline

### Centreline Generation

Authored as a list of moves:
```js
{ straight: 130, grade: 0.06 }
{ turn: 145, radius: 32, grade: 0.11 }
```

Integrated with `SAMPLE_SPACING = 5 m` into a dense centreline:
```js
{ x, y, z, heading, fx, fz, rx, rz }
```

Spatial hash (`LOOKUP_CELL = 24 m`) maps world position → nearby centreline samples for O(1) queries.

### Road Ribbon

- `PROFILE = [[offset, colorMul], ...]` — 9 lateral control points
- Vertex colours: ruts darker (0.74×), crown lighter (1.08×), edges bleached (1.34×)
- Per-vertex jitter: `fbm(off * 3.1, i * 0.35) * 0.22`
- Nudge `y = 0.02` so it wins depth test against terrain

### Terrain

```js
terrainHeight(x, z) {
  q = query(x, z)  // { y, lat, absLat, surface, index, sample }
  d = |lat|
  if (d <= shoulderOuter) return y - 0.4  // under road ribbon
  
  slope = this.def.mountainSlope || 0
  k = clamp((d - shoulderOuter) / ramp, 0, 1)
  
  h = base
  if (slope > 0) {
    side = lat * (rx * mx + rz * mz)  // signed distance along mountainDir
    h += side * slope * k
  }
  h += noise * k
  
  // Safety pin: prevent terrain rising above road within one grid cell
  pin = shoulderOuter + gridCell * 1.5
  if (d < pin) h = min(h, base + max(0, d - pin) * slope)
  return h
}
```

**Key invariant**: `terrainHeight()` is the *single source of truth* for both terrain mesh generation and vehicle physics. The vehicle never floats or sinks.

### Terrain Mesh

- Uniform grid at `gridCell` spacing (16 m plains, 12 m mountain)
- Covers stage bounds ± `TERRAIN_REACH` (320 m)
- Vertex colors: two-tone grass + per-facet random tint (`hash2(i,j) * 0.24`)
- High ground bleaches toward `env.highland`
- `MeshBasicMaterial` + vertex colors + fog = unlit baked look

### Scenery (Instanced)

| Object | Count (Plains) | Count (Mountain) | Geometry |
|--------|----------------|------------------|----------|
| Broadleaf trees | 130 | 260 | IcosahedronGeometry(1.9, 0) |
| Conifers | 90 | 160 | 3 stacked cones (6 segments) |
| Guardrail posts+rails | ~1/2 samples on corners | Same | Box + Box (merged) |
| Puddles (rain only) | 17 | 26 | Circle, shared radial texture |
| Utility poles | 1/14 samples | Same | Cylinder + Box (merged) |
| Chevron signs | ~1/2 corners | Same | Box + Cylinder (merged) |
| Rocks | 40 | 90 | IcosahedronGeometry(0.7, 0) |
| Mountain huts | 0 | 3 | Box + Cone (merged) |

All instanced → 1 draw call each.

### Horizon Mountains

- Ring of 110 peaks centred on stage centre
- Distance: `extent + 300..580 m`
- Flat-shaded, snow caps on taller peaks
- `MeshBasicMaterial` + vertex colors + fog = hazy silhouettes

## Vehicle Physics

### State
```js
position: THREE.Vector3
velocity: THREE.Vector3
yaw: number
forwardSpeed: number   // signed along forward axis
lateralSpeed: number   // signed along right axis
distance: number       // odometer
timePenalty: number    // seconds accrued off-road
```

### Longitudinal
```
gears:     5-speed, upshift at 30/48/66/84% of maxSpeed (0.22 s torque cut)
torque:    gearMult[gear] * (shiftTimer>0 ? 0.25 : 1)   // stepped pull
throttle:  accel * torque * (1 - (v/maxSpeed)^2.2)
brake:     -brake (v > 0.5)  else  -accel * 0.45 (reverse)
handbrake: -sign(v) * brake * 0.7
drag:      -v * |v| * drag
rolling:   -sign(v) * rollingResist (averaged over 4 wheels)
grade:     -9.81 * grade * dt (real gravity; 10% climb ≈ 1 m/s^2)
clamp:     [maxReverse, maxSpeed * (1 + min(0.15, max(0, -grade*1.5)))] (downhill overspeed)
```

### Lateral
```
steerSm += (steer - steerSm) * (1 - exp(-rate * dt))  // rate 9 in, 13 out
steerAngle = steerSm / (1 + |v| * 0.16)
maxYawRate = maxYawRate * (handbrake ? 1.35 : 1) / (1 + |v| * yawSpeedFalloff)
yaw -= steerSm * maxYawRate * dir * dt * min(1, |v|/1.2)
lateralSpeed *= exp(-grip * dt)
```

### Grip (surface-dependent)
| Surface | Grip | Rolling Resist |
|---------|------|----------------|
| road | 7.4 (V1) | 0.55 |
| verge | 6.0 | 0.9 |
| grass | 3.4 | 1.9 (grip), 1.9 (rolling) |

Handbrake: `grip = 1.2`

Grip modifiers: per-wheel surface averaging (straddling reads partial grip),
crest unloading (`1 + curve*2`, clamped 0.78–1.1), slip falloff
(`1 - 0.35*smoothstep(slideDeg, 8, 26)`).

**Ground datum invariant**: car physics uses `surfaceHeight()` — the ribbon
(`y + 0.02`) on tarmac, raw `terrainHeight()` off-road. `terrainHeight()` on
road/verge is the dirt tucked 0.4 m *under* the ribbon (mesh use only).

### Suspension (visual only)
- 4 wheel queries per frame
- Critically-damped spring per wheel (stiffness 14, damping 6.5)
- Body height = average of 4 contact points (exponential smoothing)
- Wheel local Y = radius + spring offset

### Body Lean
```
roll  → -steer * 0.075 * speedNorm
pitch → clamp(-accel * 0.005, -0.045, 0.045)
```

## Camera

Chase camera with speed-adaptive spring:
```js
rate = positionLerp + speed * 0.32
target = car.position - forward * back + up * height
camera.position.lerp(target, 1 - exp(-rate * dt))
lookAt = car.position + forward * lookAhead + up * lookHeight
lookAt.lerp(smoothedLook, 1 - exp(-lookLerp * dt))
```

| Parameter | Value |
|-----------|-------|
| back | 6.2 m |
| height | 3.4 m |
| lookAhead | 7.5 m |
| lookHeight | 1.15 m |
| positionLerp | 6.0 + speed * 0.32 |
| lookLerp | 11.0 |

Speed-adaptive rate prevents the camera from lagging excessively at high speed.

Shake triggers (main.js race loop): off-road above 4 m/s (`addShake(dt*4)`),
faint tremor above 20 m/s scaled to top speed, puddle strikes (+0.3).

Speed-feel stack: FOV stretch + speed lines (camera) + DOM vignette overlay
(`#speed-vignette`, opacity ramps past 25% speed ratio).

## Vehicle Definitions (`cars.js`)

```js
{
  id: 'v1',
  name: 'VELTRON V1',
  class: 'BALANCED',
  stats: { speed: 0.55, acc: 0.55, grip: 0.55 },
  tuning: {
    maxSpeed: 27.5,
    accel: 11.0,
    brake: 20.0,
    drag: 0.0022,
    rollingResist: 0.55,
    maxYawRate: 2.35,
    gripRoad: 7.4,
    bodyColor: 0xd94b1f,
    accentColor: 0xf5e9c8,
    wingScale: 1.0,
    rideHeight: 0.0
  }
}
```

Three vehicles share the same mesh topology; `applySpec()` swaps materials, wing scale, and tuning.

## Input System

- `keydown`/`keyup` on `window` with `preventDefault` for game keys
- Edge-triggered: ignores `e.repeat`
- `_keys` Set tracks held keys; `_refresh()` derives `throttle/brake/steer/handbrake`
- Menu actions: `confirm`, `back`, `left`, `right`, `up`, `down` (edge-triggered via `consumeMenu()`)
- `blur` clears keys and re-derives state (prevents stuck throttle on alt-tab)

## Audio System

- Single `<audio id="menu-music">` element (looped, volume 0.45)
- Driving sound is synthesized (`EngineAudio`): RPM-tracking engine (saw + sub
  square through lowpass), bandpassed-noise skid, speed-scaled wind. Starts on
  race entry, stops on garage/title/results; keydown/click resume for autoplay
- `Music.request()`: tries `play()`, on rejection arms one-shot keydown/click listener
- `Music.pause()` called on leaving title screen
- Single element reused — no duplicate instances
- Volume: 0.45, `loop = true`

## Data Flow Summary

```
User Input → Input._onKey() → Input._keys Set → Input._refresh()
                                    ↓
                        Input.consumeMenu() → {confirm, back, left, right, up, down}
                                    ↓
                    main.js state machine → car.update(dt, input)
                                    ↓
                    Stage.query() → {y, lat, absLat, surface, index, sample}
                    ↓
                car.update(dt, input) → position, yaw, speeds, penalty
                                    ↓
                    chase.update() → camera.position, lookAt
                                    ↓
                    hud.update(speed, clock, penalty) → DOM
                                    ↓
                    renderer.render(scene, camera)
```

## Performance Considerations

- **Instanced meshes** for all repeated scenery (1 draw call each)
- **Spatial hash** reduces query candidates from O(N) to ~60
- **Single terrainHeight()** shared by mesh + physics
- **Unlit terrain/road** = no lighting calculations
- **Fog + frustum culling** limits visible triangles
- **Sky dome** rendered once, no fog, no depth write
- **MAX_DT = 0.05** prevents physics explosion on tab-switch
- **Fixed-step car physics** (120 Hz accumulator): identical handling at any frame rate
- **12 m grid cell** for mountain stage (finer facets, reasonable vert count)

## File Structure

```
src/
├── main.js        (290 lines)  — boot, state machine, loop
├── stage.js       (915 lines)  — centreline, terrain, roadside, mountains
├── car.js         (400 lines)  — physics, suspension, mesh
├── cars.js        (100 lines)  — vehicle definitions
├── world.js       (175 lines)  — sky, fog, lights, env palettes
├── camera.js      (70 lines)   — chase camera
├── input.js       (80 lines)   — keyboard + menu queue
├── hud.js         (50 lines)   — HUD update
├── screens.js     (120 lines)  — title, garage, results
├── cars.js        (100 lines)  — vehicle specs
vendor/
└── three.module.js (Three.js r160, ES module)
```