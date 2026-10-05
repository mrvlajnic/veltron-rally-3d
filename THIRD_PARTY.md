# Third-Party Content

This document inventories all third-party dependencies, reference material, and copyrighted content used in or referenced by this project.

---

## Direct Dependencies (Bundled)

### Three.js r160
- **File**: `vendor/three.module.js`
- **License**: MIT License
- **Source**: https://github.com/mrdoob/three.js/releases/tag/r160
- **Usage**: Core 3D rendering engine (scene, camera, meshes, materials, geometries, lights, math utilities)
- **Modification**: None — used as-is via ES module import

---

## Reference Material (Not Distributed)

### Original Game Research

| Source | Type | Usage |
|--------|------|-------|
| Wikipedia: "Mount Haruna" | Encyclopedia | Geography, elevation, caldera lake, volcanic structure |
| Wikipedia: "Initial D" | Encyclopedia | Fictional "Akina" = Mount Haruna connection |
| Wikipedia: "Rally 3D" | Encyclopedia | Release year, platform, developer |
| Wikipedia: "Rally Pro Contest" | Encyclopedia | Original game by Synergenix (2004) |
| Wikipedia: "Mount Akagi", "Mount Myōgi" | Encyclopedia | Three Mountains of Jōmō context |
| The Textures Resource (tsr) | Asset repository | Extracted car/wheel textures (128×128, 32×32) |
| Stunts Forum (forum.stunts.hu) | Community archive | 12 stage names, record times, medal system, keypad steering quotes |
| IGDB / Backloggd / GameFAQs | Game databases | Release year, publisher, genre |
| YouTube: "Rally 3D JAVA GAME" (7ZQkknbwFV4) | Video | Gameplay footage, menu screens |
| YouTube: "RALLY 3D - Java Game (Full Gameplay)" (-NgcqmGwtEI) | Video | Full playthrough, car select, HUD, results |
| YouTube: "Rally Pro contest (Java J2me)" (c_6qwgxJlVo) | Video | Original press text, Bluetooth multiplayer |
| Rutube (rutube.ru) | Video | Rally Pro Contest lineage, Nokia bundling |
| Reddit r/IndiaNostalgia | Forum | Player memories, Bluetooth, physics impressions |
| jarnova.com / oldphonegames.com / ggemu.com | Emulator sites | JAR metadata, screenshots, descriptions |

**Note**: No assets (textures, models, sounds, code) were extracted from the original JAR or any copyrighted game. All code and assets in this project were created from scratch based on publicly available descriptions and visual reference.

---

## Audio Content (Third-Party)

### Main Menu Soundtrack
- **Track**: "Call It What You Like — VIP Remix"
- **File**: `Call It What You Like (VIP Edit).mp3` (5.97 MB)
- **Location**: Project root
- **Usage**: Main menu background music; pauses on garage/race, resumes on title
- **Licensing status**: **Third-party content — redistribution rights NOT confirmed**
- **Action required**: Before public redistribution, verify licensing or replace with original/licensed audio

> **Warning**: This track is third-party content included for development atmosphere. The project does not own redistribution rights. If publishing the repository publicly, either:
> 1. Verify and document redistribution permission, OR
> 2. Remove the MP3 from the repository and document how to add a licensed track

---

## Development Tools (Not Bundled)

| Tool | Purpose |
|------|---------|
| Python 3 `http.server` | Local static file server for testing |
| Node.js 24+ | Syntax checking (`node --check`) |
| Chrome DevTools Protocol | Automated browser testing |
| VS Code / any editor | Source editing |

---

## License Summary

| Component | License | Bundled? |
|-----------|---------|----------|
| Original code (src/, index.html, style.css) | MIT | Yes |
| Three.js r160 | MIT | Yes (vendored) |
| Research sources | Various (fair use / reference) | No (reference only) |
| Music track | Unknown / Third-party | Yes (root) |

---

**If redistributing this project publicly**:
1. Verify Three.js MIT license is included (already in vendor file header)
2. **Remove or replace the MP3** unless redistribution rights are verified
3. Include this THIRD_PARTY.md in the distribution
4. Retain MIT license for original code