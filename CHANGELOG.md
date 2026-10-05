# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Prototype 0.3 — Mountain Touge + Soundtrack

### Added
- **Mountain Touge stage** (~4.835 km) with 10 sections: base approach, two switchback complexes, sweeping climb, technical section, second switchback complex, summit section, descent, descent switchbacks, final descent
- **Mountain environment palette** (cool morning sky, blue-grey fog, dark conifer forest, blue-grey mountains)
- **Mountain terrain system**: cross-slope (`mountainSlope: 0.34`), per-stage grid cell (12 m), mountain direction vector, safety pin against terrain/road clipping
- **Roadside detail system**: guardrails on corner outsides, utility poles, chevron signs, rocks, mountain huts — all instanced
- **Denser forest**: 420 trees (broadleaf + conifer) for mountain stage
- **Stage selection**: garage screen now supports up/down for stage cycling, left/right for car cycling
- **Environment system**: `World.setEnvironment()` swaps fog, sky, and rebuilds sky dome on stage switch
- **Stage root groups**: each stage in its own `THREE.Group` with `setVisible()` for instant switching
- **Stage selection UI**: garage shows stage name, cyan arrows, stage number/name in footer bar
- **Main menu soundtrack**: "Call It What You Like — VIP Remix" (5.97 MB MP3)
- **Audio lifecycle**: plays on title, pauses on garage/race, resumes on title return, autoplay fallback, single shared Audio element
- **Stage select UI**: garage shows cyan arrows, stage name in footer bar
- **HUD**: shows stage name in footer bar alongside version
- **Results screen**: shows raw time, penalty, medal (gold/silver/bronze/no medal), target time
- **Version bump**: PROTOTYPE 0.3

### Changed
- **Road presentation**: asphalt highway → dirt road with ruts/crown, no centre line, white edge lines only
- **Off-road mechanic**: grip reduction → time penalty (+1.2 s/s off-road). Grass remains drivable (rolling resist 1.9) so cutting is a genuine trade-off
- **Camera**: speed-adaptive lerp (`rate = positionLerp + speed * 0.32`) prevents excessive lag at high speed
- **Terrain safety pin**: `pin = shoulderOuter + gridCell * 1.5` prevents terrain poking through road on tight hairpins
- **Sky dome**: rebuilt on environment change, canvas texture with quantised bands (posterised)
- **Vehicle tuning**: top speeds ~80–96 km/h (was 180+), realistic arcade ranges
- **HUD**: stage name in footer, penalty displayed as red `+N.N` beside clock
- **Garage**: stage selector (up/down), car selector (left/right), both with cyan arrows
- **Music**: autoplay fallback via one-shot keydown/click listener; pauses on garage/race, resumes on title
- **Version**: PROTOTYPE 0.2 → 0.3

### Fixed
- Road ribbon winding order (was backface-culled)
- Terrain z-fighting (grass at y=-0.06, road at y=0, markings at y=0.02)
- Mountains centred on world origin → centred on stage centre
- Premature class-closing brace in `stage.js` that left roadside methods outside class
- `STAGE_LIST` export missing from `stage.js`
- `world.setEnvironment()` rebuilds sky dome and updates fog/background
- `stage.js` syntax error (stray `this.rootAdd` call)
- Unused `WHEELBASE` constant removed from `car.js`
- Duplicate `getCarById` export removed from `cars.js`
- Dead `onSelect`/`onStart` fields removed from `Screens`
- Unused `trunks`/`leaves` arrays removed from `_buildScenery`
- `mergeGeometries` helper kept minimal (no external dependency)

## Prototype 0.2 — Core Rally Prototype

### Added
- Straight dirt road (1.5 km) with centre dashes, edge lines, verge strips
- Chase camera with exponential smoothing
- Arcade vehicle physics (throttle, brake, steering, handbrake, drag, rolling resistance)
- Grassy plains terrain with rolling hills, conifers, broadleaf trees
- Checkered start/finish gantry
- Roadside posts every 50 m
- HUD: speed (Km/h), distance, off-road warning
- Title screen, garage (car select), results screen
- Restart (R), camera follow, off-road penalty (grip reduction)
- Retro UI: checkerboard bars, cyan arrows, bitmap-style fonts
- Mouse/right-click disabled

## Prototype 0.1 — Initial Prototype

### Added
- Basic Three.js scene with renderer, camera, scene
- Simple car mesh (body, 4 wheels, windshield, spoiler)
- Straight road with asphalt texture
- Basic acceleration/braking/steering
- Fixed chase camera
- Basic HUD (speed)
- Restart on R

---

*All entries reflect features actually implemented and tested. No planned or speculative features are listed.*