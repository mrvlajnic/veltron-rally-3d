# Rally 3D — Veltron Edition

A browser-based retro rally prototype inspired by the 2005 mobile Rally 3D, rebuilt with modern WebGL technology while preserving its low-poly visual language and arcade rally gameplay.

This project is a fan-made technical reconstruction / homage. It is not affiliated with or endorsed by the original developers, publishers, Nokia, or any rights holders.

## Overview

Rally 3D — Veltron Edition is a browser-based rally racing prototype that recreates the look and feel of the 2005 Nokia J2ME game Rally 3D (itself a re-skin of Rally Pro Contest by Synergenix). Built with Three.js and modern WebGL, it preserves the original's low-poly aesthetic, arcade handling, and distinctive time-penalty off-road mechanic while adding a proper mountain touge stage with elevation, hairpins, and atmospheric effects.

## Features

- Two rally stages: Grassy Plains (original prototype) and Mountain Touge (new)
- Three Veltron rally cars with distinct handling characteristics
- Arcade rally physics with speed-dependent steering sensitivity
- Time-penalty off-road system (authentic to the original)
- Chase camera with speed-adaptive lag compensation
- Stage selection and vehicle selection screens
- Main menu with looping soundtrack and autoplay fallback
- Period-authentic HUD: Km/h speed, stage timer, red time penalty display
- Three.js + WebGL rendering with ES modules

## Screenshots

![Title Screen](docs/screenshots/title.png)
![Garage](docs/screenshots/garage.png)
![Mountain Stage](docs/screenshots/mountain.png)
![Results Screen](docs/screenshots/results.png)

*Placeholders — screenshots to be added*

## Gameplay

The game implements an arcade rally model designed for immediate readability:

- **Acceleration**: Throttle ramps with speed-dependent falloff
- **Braking**: Strong deceleration; below ~0.5 m/s engages reverse
- **Steering**: Digital feel with speed-dependent sensitivity (reduces at high speed)
- **Handbrake**: Reduces lateral grip and scrubs speed
- **Off-road**: Not a grip loss — a time penalty (+1.2 s per second off-road). Grass remains drivable, making corner-cutting a genuine risk/reward decision.
- **Chase camera**: High position showing roof/rear window; distance grows with speed for readability
- **Stage timer**: Raw clock + penalty = total time; medals based on total

## Controls

| Key | Menu | Race |
|-----|------|------|
| Enter | Confirm / Start | — |
| Escape | Back | Pause / Return to garage |
| Arrow Left / Right | Change car | Steer |
| Arrow Up / Down | Change stage | Accelerate / Brake |
| W / S | — | Accelerate / Brake (reverse) |
| A / D | — | Steer |
| Space | — | Handbrake |
| R | — | Restart stage |

*Menu navigation and driving controls are separate; Arrow Up/Down navigates stage selection in the garage, W/S control throttle/brake during the race.*

## Technical Architecture

- **Three.js r160** via ES modules (vendored locally)
- **ES modules** with importmap — no build step required
- **Data-driven stages**: Each stage is a JSON-like move list (straights, turns, grades) integrated into a centerline with spatial hash for O(1) surface queries
- **Shared terrain height function**: Used by both terrain mesh generation and vehicle physics — the vehicle never floats or sinks
- **Per-stage terrain grid cell size** (12 m for mountain, 16 m for plains)
- **Unlit vertex art terrain** with hard facet transitions; lit vehicle with flat shading
- **Posterised sky gradient** rendered to a tiny canvas texture (8×128) with NearestFilter
- **Aggressive fog** (near 45–55 m, far 340–360 m) hides draw distance
- **Instanced meshes** for trees, guardrails, poles, signs, rocks, buildings
- **Zero build step** — open index.html via a local HTTP server

## Stages

### Stage 1 — Grassy Plains (Cart-way)
- 1.5 km straight road through rolling plains
- Gentle curves, slight elevation changes
- Sparse conifer forest, distant hills
- 1,505 m length

### Stage 2 — Mountain Touge
- 4.835 km mountain pass inspired by Japanese touge roads
- ~115 m net elevation gain (peak ~180 m above start)
- Multiple hairpin/switchback sections (radii 28–34 m)
- Sweeping climb sections and technical descent
- Dense conifer/broadleaf forest (~420 trees)
- Guardrails on corner outsides, chevron signs, utility poles, rocks, mountain huts
- 12 m terrain cells for clean cross-slope facets
- Cool morning palette: blue-grey sky, dark conifer forest, blue-grey fog

## Vehicles

| Vehicle | Class | Top Speed | 0–80 km/h | Brake (80→0) | Turn Radius @60 |
|---------|-------|-----------|-----------|--------------|-----------------|
| Veltron V1 | Balanced | ~81 km/h | 3.9 s | 84 km/h in 12 m | 39 m |
| Veltron V3 | Grip | ~70 km/h | — (tops <80) | 74 km/h in 9 m | 29 m |
| Veltron Centurion | Speed | ~96 km/h | 2.5 s | 97 km/h in 18 m | 62 m |

*Values measured with 30 s full-throttle runs and steady-state cornering fits. V3 never reaches 80 km/h on the test straight; Centurion has the widest turning circle.*

## Audio

Main menu soundtrack: **"Full Throttle Bay"** (AI-generated with Gemini, file: `Full_Throttle_Bay.mp3` in project root, 4.38 MB)

- Plays on title + garage continuously, loops seamlessly
- Pauses for the race, resumes after
- Single shared `<audio>` element; prevents duplicate instances
- Autoplay fallback: first keypress/click triggers playback if blocked
- Volume: 0.45

## Running Locally

### Quick Start (Windows)
Double-click `start.bat` — it auto-detects Python or Node.js and opens the game.

### Quick Start (Mac/Linux)
```bash
./start.sh
```

### Manual
```bash
# Python
python -m http.server 8123

# Node.js (no dependencies)
node server.js 8123
```

Then open `http://localhost:8123` in your browser.

The project uses ES modules and an importmap, so it **must be served over HTTP** — opening `index.html` directly via `file://` will fail due to CORS.

## Project Structure

```
.
├── index.html              # Entry point, importmap, UI screens
├── style.css               # Retro UI styling (checkerboard bars, bitmap fonts)
├── start.bat               # Windows launcher (auto-detects Python/Node)
├── start.sh                # Mac/Linux launcher
├── server.js               # Zero-dependency Node.js static server
├── Full_Throttle_Bay.mp3  # Menu soundtrack (license-free)
├── vendor/
│   └── three.module.js     # Three.js r160 (vendored)
└── src/
    ├── main.js             # Boot, state machine, stage loading, audio
    ├── stage.js            # Stage centerline, terrain, roadside, mountains
    ├── car.js              # Vehicle physics, suspension, rendering
    ├── cars.js             # Vehicle definitions (stats, tuning, livery)
    ├── world.js            # Sky, fog, lights, environment palettes
    ├── camera.js           # Chase camera, weather system, speed effects
    ├── input.js            # Keyboard input + menu action queue
    ├── hud.js              # HUD: speed, timer, penalty, stage name
    └── screens.js          # Title, garage (car+stage select), results
```

## Performance

*Observed during foreground testing (not universal guarantees):*

- Mountain stage: ~49 draw calls, ~125k triangles (visible frustum)
- Plains stage: ~41 draw calls, ~37k triangles
- 75–180 FPS foreground (180 FPS background-throttled)
- Zero console errors after final testing
- All 10 ES modules parse successfully (Node ESM syntax check)

## Known Limitations

- No collision with trees, rocks, huts, or guardrails
- No AI opponents
- Road surface is flat across its width (no camber)
- No tire smoke, dust, or particle effects
- No gear/RPM simulation — single arcade "gear"
- Static weather and time of day
- Uniform terrain grid (no adaptive refinement near road)
- Point-to-point stages only (no lap system)
- Garage turntable shares the stage environment
- Debug handle `window.__rally` exposed in console

## Roadmap

### Phase 1 — Documentation & Repository Cleanup
- Complete documentation suite (this README, ARCHITECTURE.md, HANDOFF.md, CHANGELOG.md, LICENSE, THIRD_PARTY.md, TERMS.md)
- Repository cleanup and GitHub release preparation

### Phase 2 — Third Environment: Snow
- Snow environment palette (already defined in `world.js`)
- Snow stage definition with plowed road visual
- White terrain, dark conifer contrast

### Phase 3 — Additional Stages
- Gravel/Sand environment
- Night environment
- Longer championship structure

### Phase 4 — AI Opponents
- Reuse `Stage.query()` + autopilot logic for ghost cars
- Championship points system

### Phase 5 — Improved Road Surface
- Cambered road ribbon
- Surface-type friction variation (ice, mud)

### Phase 6 — Optional Scenery Collision
- Broadphase against instanced trees/rocks
- Soft barrier push-back

### Phase 7 — Polish
- Tire smoke/dust particles
- Engine sound pitch linked to RPM proxy
- Championship menu with stage unlocks

## Research

The implementation is based on research into the 2005 Nokia J2ME game **Rally 3D** (a portrait re-skin of Synergenix's *Rally Pro Contest*, 2004). Key findings:

- Original resolution: 240×320 portrait, 8-bit indexed colour
- Four environments: cart-way (dirt), gravel/sand, snow, night — **no asphalt**
- Off-road = time penalty (+10.4 s observed), not grip loss
- Steering was digital/keypad-stepped; widely criticised
- Top speed ~100–101 km/h displayed
- Cars: Red Danger (Evo VI), Azure Racer (Focus WRC), Fast Racer (Corolla WRC), Good Oldie (bonus)
- No damage model, no co-driver pace notes (contrary to some descriptions)
- Original JAR: ~355 KB, Version 1.25, bundled on Nokia 6111/3230/2700/5130/N-Gage QD

Sources: Wikipedia (Mount Haruna, Initial D, Rally 3D), The Textures Resource (extracted car/wheel textures), Stunts Forum (track names, times, player impressions), IGDB/Backloggd/GameFAQs (metadata), YouTube longplays (visual reference), Rutube (Rally Pro Contest lineage).

## Third-Party Content

See [THIRD_PARTY.md](THIRD_PARTY.md) for a complete inventory of third-party dependencies and reference material.

## Disclaimer

Rally 3D — Veltron Edition is a **fan-made technical reconstruction / homage**. It is not affiliated with, endorsed by, or associated with Nokia, Synergenix Interactive, the original Rally 3D / Rally Pro Contest developers, or any rights holders. All original code and assets created for this project are provided under the project license. Third-party content (Three.js) retains its own licensing.

## Handoff

See [HANDOFF.md](HANDOFF.md) for a complete developer handoff document including architecture, data structures, how to extend stages/vehicles, known bugs, and roadmap.

---

*Last updated: 2025*