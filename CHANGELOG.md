# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Unreleased

### Added
- **Real night**: world darkness pass (unlit terrain/road/scenery scale to 0.13 — light presets alone only reached the car) plus fake headlights: long beam cones landing ~12 m out, road pool, glowing lamps/tails on both cars

### Fixed
- **Speed lines reworked**: were 60 full-screen spokes spinning at 0.7 opacity — now 36 short peripheral streaks, no rotation, 0.28 ceiling with shimmer, later onset (45% speed), dim blue-grey base so they don't burn through black skies
- **Headlight beams read as light, not geometry**: gradient fade along the cone (bright at lamp, gone at the tip) and radial fade on the road pool instead of hard additive edges

## Unreleased

### Changed
- **Soundtrack swapped**: Gemini-generated "Full Throttle Bay" replaces the VIP Remix (whose rights were never confirmed); plays across title + garage

### Added
- **Hood cam**: bonnet-level driver view (C toggles, chase stays default), own FOV kick + shake, shared speed-line streaks; HUD footer hints the key

### Changed
- **Menu music plays through car selection**: garage no longer pauses the track — one continuous play across title + garage, pausing only for the race

### Added
- **Time trial for real**: title mode select (CHAMPIONSHIP / TIME TRIAL), per-stage+car bests in localStorage with NEW RECORD / BEST SAVED lines, translucent ghost replay of your best (parked beside you at the countdown)
- **Championship**: stages run in order with running totals and a CHAMP TOTAL screen; quitting back to garage abandons the run
- **Records module** (`src/best.js`): quota-safe storage wrapper + shortest-arc ghost interpolation, headless-tested

## Prototype 0.5 — Night Rain (2026-10-08)

### Added
- **Works detailing on all cars**: 5-spoke wheels (wheelspin now visible), mudflaps, mirrors, twin exhausts, accent livery stripes, door plates, sunstrip, dark cabin, splitter/diffuser, antenna; darker glass tint
- **Tunnel vision**: speed-driven vignette overlay (fades in past ~40% speed) joining the FOV stretch and speed lines
- **Rain puddles**: seeded on-road water decals (shared radial texture, visible only when rainy, also previewed in the garage); striking one above ~29 km/h splatters procedural dirt on the screen (fades over seconds), thumps the camera and plays a synthesized splash
- **Driving sound**: synthesized engine (RPM per gear, revvable on the start line), skid and wind noise — `src/engine-audio.js`, zero assets, auto-resumes on input
- **Stage-start countdown**: 3-2-1-GO overlay with pop animation and WebAudio beeps (no assets). Stage clock starts at GO; inputs locked while counting down
- **Rain preview in garage**: rain particles animate around the preview car when rainy is selected
- **Title screen key art**: AI-generated night-rain backdrop (`assets/title-bg.jpg`, preloaded); menu wording stays in HTML
- **Title parallax**: mouse drifts the key art against the menu (2.5D depth, smoothed, honors `prefers-reduced-motion`)

### Fixed
- **Rainy weather was invisible**: rain `Points` were never added to the scene, the sky texture repaint was never assigned to the live texture, and the follow logic double-counted the car position (fixed to local coords + object follow)
- **Rainy fog now denser**: fog 25/180 → 15/130 with darker colour, plus dimmer sun/sky for gloom; larger drops (0.22) at 0.8 opacity

### Changed
- **Steering feel**: smoothed steer ramp (full lock builds in ~1/9 s, unwinds faster) instead of instant digital lock; body roll follows smoothed steer
- **Handbrake turns**: +35% yaw rate while held, for hairpins
- **Camera feel**: rumble when off-road at speed, faint tremor above ~72 km/h (uses existing shake system, previously never triggered)
- **Acceleration feel**: 5-speed arcade gearbox (shifts at 30/48/66/84% of top speed, 0.22 s torque cut) with per-gear torque and stronger mid-range curve — stepped pull instead of flat linear climb; top speed unchanged
- **High-speed feel**: wind noise scales with speed, engine note tracks RPM per gear, skid audio on slides/off-road
- **Physics determinism**: car now steps at fixed 120 Hz (was variable frame dt) — same corner, same car at any frame rate
- **Real top speeds**: V1 122, V3 108, Hatch 119, Centurion 148 km/h (were ~80–113); drag retuned so flat-out equilibrium lands at ~94% of nominal
- **Gravity on slopes**: climbs pull back and descents push with real g (10% grade ≈ 1 m/s²); downhill runs may overspeed up to +15% past nominal top
- **Medals retimed per stage**: from autopilot clean runs — plains 54/66/81 s, mountain 3:48/4:38/5:42 (were a single impossible 72/88/108 set)

### Fixed
- **Car sank into the road**: physics sampled `terrainHeight()` (dirt 0.4 m *under* the ribbon) instead of the visible surface. New `surfaceHeight()` datum (ribbon on tarmac, terrain off-road) used by suspension, spawn and garage placement; contact shadow visible again
- **Wheel samples mirrored**: front/back wheel world positions were Z-flipped, inverting pitch response on grades
- **Road-edge grip is progressive**: grip/rolling averaged over 4 contact patches instead of binary center sample; plus crest unloading and slip falloff past ~10° slide

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