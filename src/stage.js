// stage.js — rally stage: authored centerline, dirt road ribbon, low-poly
// terrain that follows the road, and scenery. Built around a centerline
// defined by a list of moves so stages stay cheap to author.
import * as THREE from 'three';

export const SURFACE = {
  ROAD: 'road',
  VERGE: 'verge',
  GRASS: 'grass'
};

// Lateral profile of the road cross-section, as [offset, colorMul].
// Mirrors the ribbon mesh exactly so vertex art and geometry agree.
const PROFILE = [
  [-4.6, 1.34], // outer edge, dusty and bleached
  [-3.4, 1.18],
  [-2.7, 0.74], // left wheel rut
  [-1.5, 1.02],
  [0.0, 1.08],  // centre crown, packed lighter dirt
  [1.5, 1.02],
  [2.7, 0.74],  // right wheel rut
  [3.4, 1.18],
  [4.6, 1.34]
];

export const ROAD_HALF = 4.6;
export const ROAD_LIFT = 0.02; // ribbon mesh lift above the centerline height
export const SHOULDER = 1.1;   // grass shoulder beyond the road edge
const SAMPLE_SPACING = 5;      // centerline resolution (m)
const TERRAIN_CELL = 16;       // terrain facet size — deliberately chunky
const TERRAIN_REACH = 320;     // how far from the road terrain is generated
const LOOKUP_CELL = 24;        // spatial hash cell for road queries

// --- deterministic value noise ------------------------------------------
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, z) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < 3; o++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    amp *= 0.5; freq *= 2.1;
  }
  return sum;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stages are pure data: a list of moves integrated into a centerline. Adding
// a stage is a new entry here — no engine changes. `mountainDir`/`mountainSlope`
// switch the terrain from rolling plains to a mountainside cut.
export const STAGES = {
  cartway: {
    id: 'cartway',
    name: 'GRASSY PLAINS',
    environment: 'cartway',
    seed: 20050,
    moves: [
      { straight: 90 },
      { turn: -55, radius: 110, grade: 0.02 },
      { straight: 70, grade: 0.03 },
      { turn: 70, radius: 80 },
      { straight: 60 },
      { turn: -40, radius: 150, grade: -0.02 },
      { straight: 80, grade: -0.03 },
      { turn: -65, radius: 70 },
      { straight: 50 },
      { turn: 45, radius: 95, grade: 0.04 },
      { straight: 100, grade: 0.02 },
      { turn: -50, radius: 120 },
      { straight: 70 },
      { turn: 80, radius: 75, grade: -0.03 },
      { straight: 90 },
      { turn: -45, radius: 130, grade: 0.01 },
      { straight: 120 }
    ]
  },

  // Stage 02 — an original mountain route inspired by Japanese touge:
  // a long climb through switchback hairpins, a fast summit section, then a
  // technical descent. Roughly 3x the length of the plains stage.
  mountain: {
    id: 'mountain',
    name: 'MOUNTAIN TOUGE',
    environment: 'mountain',
    seed: 19860512,
    mountainDir: [0.82, 0.57],   // uphill direction: terrain rises this way
    mountainSlope: 0.34,          // cross-slope of the mountainside
    mountainRamp: 46,             // flat bench width before the slope starts
    gridCell: 12,                 // finer facets so the slope reads cleanly
    treeCount: 420,               // denser forest than the plains
    moves: [
      // -- 1. Base approach: gentle climb out of the valley floor
      { straight: 130, grade: 0.06 },
      { turn: 35, radius: 95, grade: 0.07 },
      { straight: 90, grade: 0.08 },
      { turn: -50, radius: 75, grade: 0.09 },
      { straight: 110, grade: 0.09 },
      // -- 2. First switchback complex: steep hairpins, the road doubles back
      { turn: 145, radius: 32, grade: 0.11 },
      { straight: 45, grade: 0.11 },
      { turn: -150, radius: 30, grade: 0.10 },
      { straight: 55, grade: 0.10 },
      { turn: 140, radius: 34, grade: 0.09 },
      { straight: 50, grade: 0.09 },
      // -- 3. Sweeping climb: faster, flowing corners
      { turn: -55, radius: 120, grade: 0.07 },
      { straight: 160, grade: 0.06 },
      { turn: 65, radius: 110, grade: 0.06 },
      { straight: 130, grade: 0.05 },
      // -- 4. Technical section: tight, rhythm-breaking corners
      { turn: -85, radius: 48, grade: 0.06 },
      { straight: 45, grade: 0.06 },
      { turn: 75, radius: 42, grade: 0.06 },
      { straight: 55, grade: 0.05 },
      { turn: -65, radius: 55, grade: 0.05 },
      { straight: 65, grade: 0.05 },
      // -- 5. Second switchback complex: the steepest climb
      { turn: 155, radius: 29, grade: 0.12 },
      { straight: 40, grade: 0.12 },
      { turn: -150, radius: 31, grade: 0.11 },
      { straight: 50, grade: 0.10 },
      { turn: 145, radius: 33, grade: 0.10 },
      { straight: 60, grade: 0.09 },
      // -- 6. Fast summit section: the road flattens near the top
      { turn: -45, radius: 150, grade: 0.03 },
      { straight: 210, grade: 0.02 },
      { turn: 55, radius: 140, grade: 0.02 },
      { straight: 190, grade: 0.01 },
      { turn: -40, radius: 160, grade: 0.01 },
      { straight: 160, grade: 0.00 },
      // -- 7. Summit hairpins: tight corners at the top
      { turn: 150, radius: 30, grade: 0.02 },
      { straight: 45, grade: 0.02 },
      { turn: -145, radius: 32, grade: 0.02 },
      { straight: 55, grade: 0.01 },
      // -- 8. Descent begins: the road drops away
      { turn: 65, radius: 95, grade: -0.05 },
      { straight: 140, grade: -0.07 },
      { turn: -75, radius: 85, grade: -0.08 },
      { straight: 110, grade: -0.09 },
      // -- 9. Descent switchbacks: hairpins on the way down
      { turn: 150, radius: 31, grade: -0.07 },
      { straight: 45, grade: -0.07 },
      { turn: -145, radius: 33, grade: -0.06 },
      { straight: 55, grade: -0.06 },
      { turn: 140, radius: 35, grade: -0.05 },
      { straight: 65, grade: -0.05 },
      // -- 10. Final fast descent to the finish
      { turn: -50, radius: 130, grade: -0.03 },
      { straight: 190, grade: -0.02 },
      { turn: 60, radius: 120, grade: -0.02 },
      { straight: 210, grade: -0.01 }
    ]
  }
};

export const STAGE_LIST = Object.keys(STAGES);

export class Stage {
  constructor(def, env) {
    this.def = def;
    this.env = env;
    this.rng = mulberry32(def.seed);
    // Mountain stages use finer facets so the cross-slope reads as clean
    // low-poly planes rather than a mushy gradient.
    this.gridCell = def.gridCell || TERRAIN_CELL;
    this.samples = [];
    this._grid = new Map();
    // Every mesh the stage owns goes into this group, so a stage can be
    // swapped out (or hidden) without hunting down individual meshes.
    this.root = new THREE.Group();
    this._buildCenterline();
    this._buildLookup();
    this._layoutPuddles();
  }

  // ---------------------------------------------------------- puddles -----
  // Standing water for rainy weather. Layout is pure data (no DOM), derived
  // from the centerline with its own seeded rng so existing scenery layouts
  // don't shift. Meshes are built in _buildPuddles and hidden unless it rains.
  _layoutPuddles() {
    const count = Math.max(8, Math.min(26, Math.round(this.length / 90)));
    const rng = mulberry32((this.def.seed ^ 0x9E3779B9) >>> 0);
    this.puddleSpots = [];
    for (let i = 0; i < count; i++) {
      const si = Math.floor((i + 0.5) / count * (this.samples.length - 1));
      const p = this.samples[si];
      const lat = (rng() * 2 - 1) * 3.2;
      const r = 1.2 + rng() * 1.4;
      this.puddleSpots.push({
        x: p.x + p.rx * lat,
        z: p.z + p.rz * lat,
        y: p.y + 0.045,   // just above the ribbon (surface + 0.02)
        r: r * 1.1,        // hit radius slightly generous
        seed: rng(),
        _hit: -99          // stage-clock of last strike (splash cooldown)
      });
    }
  }

  // ------------------------------------------------------- centerline ----
  // Integrate the authored moves into a densely sampled centerline.
  // Heading convention: 0 faces -Z, increasing yaw turns right.
  _buildCenterline() {
    const pts = [];
    let x = 0, y = 0, z = 0, heading = 0;

    const push = () => {
      const fx = Math.sin(heading), fz = -Math.cos(heading);
      pts.push({ x, y, z, heading, fx, fz, rx: Math.cos(heading), rz: Math.sin(heading) });
    };

    // Straight lead-in so the car spawns on tarmac-equivalent with room behind.
    push();
    for (const move of this.def.moves) {
      if (move.straight !== undefined) {
        const len = move.straight;
        const grade = move.grade || 0;
        const steps = Math.max(1, Math.round(len / SAMPLE_SPACING));
        const ds = len / steps;
        for (let i = 0; i < steps; i++) {
          x += Math.sin(heading) * ds;
          z += -Math.cos(heading) * ds;
          y += grade * ds;
          push();
        }
      } else if (move.turn !== undefined) {
        const radius = move.radius;
        const grade = move.grade || 0;
        const arc = Math.abs(move.turn) * Math.PI / 180;
        const len = arc * radius;
        const steps = Math.max(2, Math.round(len / SAMPLE_SPACING));
        const ds = len / steps;
        const dHeading = move.turn * Math.PI / 180 / steps;
        for (let i = 0; i < steps; i++) {
          heading += dHeading;
          x += Math.sin(heading) * ds;
          z += -Math.cos(heading) * ds;
          y += grade * ds;
          push();
        }
      }
    }

    this.samples = pts;
    this.length = (pts.length - 1) * SAMPLE_SPACING;
    this.startPos = new THREE.Vector3(pts[0].x, pts[0].y, pts[0].z);
    this.startHeading = pts[0].heading;
    this.finishPos = new THREE.Vector3(
      pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].z
    );

    // Bounds, used to place the far ground plane and scenery.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
    this.center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  }

  // ---------------------------------------------------------- lookup ------
  // Spatial hash of centerline samples so a point-in-world query is O(1).
  _buildLookup() {
    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i];
      const cx = Math.floor(p.x / LOOKUP_CELL);
      const cz = Math.floor(p.z / LOOKUP_CELL);
      // Register into all cells within the terrain reach of this sample.
      const r = Math.ceil((TERRAIN_REACH + ROAD_HALF) / LOOKUP_CELL);
      for (let ax = -r; ax <= r; ax++) {
        for (let az = -r; az <= r; az++) {
          const key = (cx + ax) + ',' + (cz + az);
          let list = this._grid.get(key);
          if (!list) { list = []; this._grid.set(key, list); }
          list.push(i);
        }
      }
    }
  }

  /**
   * Query the stage surface at a world position. Returns road elevation,
   * signed lateral offset, surface type and the nearest centerline index.
   * Uses a spatial hash, so this is a short candidate scan rather than a
   * walk over the whole centerline.
   */
  query(x, z) {
    const key = Math.floor(x / LOOKUP_CELL) + ',' + Math.floor(z / LOOKUP_CELL);
    const candidates = this._grid.get(key);

    let best = -1, bestDist = Infinity, bestLat = 0, bestY = 0;

    if (candidates) {
      for (let n = 0; n < candidates.length; n++) {
        const i = candidates[n];
        const p = this.samples[i];
        const dx = x - p.x, dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDist) { bestDist = d2; best = i; }
      }
    }

    // Fallback: coarse scan if the car strayed beyond the hashed reach.
    if (best === -1) {
      let bd = Infinity;
      for (let i = 0; i < this.samples.length; i += 4) {
        const p = this.samples[i];
        const dx = x - p.x, dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
    }

    const p = this.samples[best];
    const dx = x - p.x, dz = z - p.z;
    const lat = dx * p.rx + dz * p.rz;   // signed lateral (+ = right of road)
    const along = dx * p.fx + dz * p.fz;
    // Refine elevation along the road direction so climbs interpolate.
    const ahead = this.samples[Math.min(best + 1, this.samples.length - 1)];
    const behind = this.samples[Math.max(best - 1, 0)];
    const y = p.y + (along >= 0
      ? (ahead.y - p.y) * (along / SAMPLE_SPACING)
      : (p.y - behind.y) * (-along / SAMPLE_SPACING));

    const absLat = Math.abs(lat);
    let surface = SURFACE.GRASS;
    if (absLat <= ROAD_HALF) surface = SURFACE.ROAD;
    else if (absLat <= ROAD_HALF + SHOULDER) surface = SURFACE.VERGE;

    return { y, lat, absLat, surface, index: best, sample: p };
  }

  /**
   * Terrain height at a world position, matching the generated mesh exactly.
   *
   * Two modes:
   *  - plains (default): flat verge, then rolling noise.
   *  - mountain: the road is cut into a mountainside. Terrain rises toward
   *    `mountainDir` and falls away from it, so the uphill side is a wall of
   *    forest and the downhill side opens onto the valley.
   */
  terrainHeight(x, z, q) {
    const info = q || this.query(x, z);
    const d = info.absLat;
    const shoulderOuter = ROAD_HALF + SHOULDER;
    const base = info.y - 0.4;   // tucked under the road ribbon
    if (d <= shoulderOuter) return base;

    const slope = this.def.mountainSlope || 0;
    const ramp = this.def.mountainRamp || 38;
    const k = Math.min(1, Math.max(0, (d - shoulderOuter) / ramp));

    let h = base;
    if (slope > 0) {
      // Signed distance along the uphill direction. Positive = uphill side.
      const mx = this.def.mountainDir[0], mz = this.def.mountainDir[1];
      const side = info.lat * (info.sample.rx * mx + info.sample.rz * mz);
      h += side * slope * k;
    }
    // Rolling noise, kept subtle so the mountainside stays readable.
    h += (fbm(x * 0.010, z * 0.010) - 0.42) * 16 * k;
    h += (fbm(x * 0.055, z * 0.055) - 0.5) * 2.0 * k;

    // Safety clamp. The terrain mesh is a coarse grid, so a vertex can sit
    // up to half a cell diagonal from the road. Without this, a steep
    // cross-slope would let interpolated terrain poke through the road on the
    // inside of a hairpin. Pinning a band wider than that diagonal keeps the
    // road surface clear by construction.
    const pin = shoulderOuter + this.gridCell * 1.5;
    if (d < pin) {
      h = Math.min(h, base + Math.max(0, d - pin) * slope);
    }
    return h;
  }

  /**
   * Visible driving surface: the road ribbon itself on tarmac (centerline
   * height + ribbon lift), raw terrain everywhere else. Car physics, spawn
   * and garage placement must use this — NOT terrainHeight, which is the
   * dirt tucked UNDER the ribbon (0.4 m lower on road/verge).
   */
  surfaceHeight(x, z, q) {
    const info = q || this.query(x, z);
    if (info.absLat <= ROAD_HALF) return info.y + ROAD_LIFT;
    return this.terrainHeight(x, z, info);
  }

  // ------------------------------------------------------------ meshes ----
  build(scene) {
    scene.add(this.root);
    this._buildRoadRibbon(scene);
    this._buildTerrain(scene);
    this._buildScenery(scene);
    this._buildRoadside(scene);
    this._buildPuddles(scene);
    this._buildGantry(scene);
    this._buildHorizonMountains(scene);
  }

  // Flat water decals on the ribbon: one shared radial texture (pale
  // sky-reflecting center fading out), one shared material, individual
  // ellipse scales. depthWrite off so overlapping decals never z-fight.
  _buildPuddles(scene) {
    const group = new THREE.Group();
    group.visible = false;
    const geo = new THREE.CircleGeometry(1, 20);
    const mat = new THREE.MeshBasicMaterial({
      map: makePuddleTexture(), transparent: true, depthWrite: false, fog: true
    });
    for (const spot of this.puddleSpots) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = spot.seed * Math.PI * 2;
      m.position.set(spot.x, spot.y, spot.z);
      m.scale.set(spot.r * (0.8 + spot.seed * 0.5), spot.r, 1);
      group.add(m);
    }
    this.root.add(group);
    this.puddles = group;
  }

  setPuddlesVisible(on) {
    if (this.puddles) this.puddles.visible = on;
  }

  /**
   * Night darkness for an unlit world: vertex art ignores lights, so the sky
   * and fog presets alone leave bright terrain under a dark sky. Scaling the
   * base colors fixes that. Idempotent — always recomputed from stored bases,
   * shared materials visited once. The sky dome keeps its own night texture.
   */
  setDarkness(f) {
    if (!this._darkMats) {
      this._darkMats = [];
      const seen = new Set();
      this.root.traverse((o) => {
        if (!o.isMesh || o === this.skyDome) return;
        const m = o.material;
        if (m && m.isMeshBasicMaterial && !seen.has(m)) {
          seen.add(m);
          if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
          this._darkMats.push(m);
        }
      });
    }
    for (const m of this._darkMats) m.color.copy(m.userData.baseColor).multiplyScalar(f);
  }

  setVisible(on) {
    this.root.visible = on;
  }

  // --------------------------------------------------- horizon mountains ---
  // A ring of chunky snow-capped peaks ringing the STAGE (not the world
  // origin — the stage sprawls, and an origin-centred ring would drop a
  // peak into the middle of the course). They sit far enough out that the
  // fog turns them into hazy pale silhouettes, which is the look we want.
  _buildHorizonMountains(scene) {
    const rng = this.rng;
    const count = 110;
    const cx = this.center.x;
    const cz = this.center.z;
    const extent = Math.max(
      Math.abs(this.bounds.maxX - cx), Math.abs(cx - this.bounds.minX),
      Math.abs(this.bounds.maxZ - cz), Math.abs(cz - this.bounds.minZ)
    );
    const base = extent + 300;

    const positions = [];
    const colors = [];
    const indices = [];
    const cRock = new THREE.Color(this.env.mountain);
    const cSnow = new THREE.Color(this.env.mountainSnow);
    const c = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rng() * 0.05;
      const dist = base + rng() * 280;
      const x0 = cx + Math.sin(ang) * dist;
      const z0 = cz + Math.cos(ang) * dist;
      const w = 110 + rng() * 230;
      const h = 70 + rng() * 210;
      const b = positions.length / 3;

      // Peak: 5 base points + apex, fanned into flat triangles.
      const rot = rng() * Math.PI;
      const ca = Math.cos(rot), sa = Math.sin(rot);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const lx = Math.cos(a) * w * 0.5;
        const lz = Math.sin(a) * w * 0.5;
        const x = x0 + lx * ca - lz * sa;
        const z = z0 + lx * sa + lz * ca;
        positions.push(x, -20, z);
        c.copy(cRock).multiplyScalar(0.9 + rng() * 0.2);
        colors.push(c.r, c.g, c.b);
      }
      positions.push(x0, h, z0);
      // Snow on the upper faces of taller peaks.
      c.copy(rng() < 0.65 ? cSnow : cRock);
      colors.push(c.r, c.g, c.b);

      for (let k = 0; k < 5; k++) {
        indices.push(b + k, b + 5, b + ((k + 1) % 5));
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, fog: true
    }));
    this.root.add(mesh);
  }

  _buildRoadRibbon(scene) {
    const n = this.samples.length;
    const cols = PROFILE.length;
    const base = new THREE.Color(this.env.road);

    const positions = new Float32Array(n * cols * 3);
    const colors = new Float32Array(n * cols * 3);
    const indices = [];

    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = this.samples[i];
      // Widen slightly on the approach so the gantry has a road to sit on.
      for (let j = 0; j < cols; j++) {
        const [off, mul] = PROFILE[j];
        const vi = (i * cols + j) * 3;
        positions[vi] = p.x + p.rx * off;
        positions[vi + 1] = p.y;
        positions[vi + 2] = p.z + p.rz * off;
        // Per-vertex variation: ruts darker, crown lighter, plus noise so
        // the dirt never looks like flat vertex art.
        const jitter = 0.9 + fbm(off * 3.1, i * 0.35) * 0.22;
        c.copy(base).multiplyScalar(mul * jitter);
        colors[vi] = c.r; colors[vi + 1] = c.g; colors[vi + 2] = c.b;
      }
    }

    // Counter-clockwise seen from above, so the surface faces +Y.
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const cIdx = a + cols;
        const d = cIdx + 1;
        indices.push(a, b, cIdx, b, d, cIdx);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true
    }));
    // Nudge up a hair so it always wins the depth test against terrain.
    mesh.position.y = ROAD_LIFT;
    this.root.add(mesh);
    this.roadMesh = mesh;
  }

  _buildTerrain(scene) {
    const b = this.bounds;
    const cell = this.gridCell;
    const pad = TERRAIN_REACH;
    const x0 = Math.floor((b.minX - pad) / cell) * cell;
    const x1 = Math.ceil((b.maxX + pad) / cell) * cell;
    const z0 = Math.floor((b.minZ - pad) / cell) * cell;
    const z1 = Math.ceil((b.maxZ + pad) / cell) * cell;

    const colsN = Math.floor((x1 - x0) / cell);
    const rowsN = Math.floor((z1 - z0) / cell);
    const vCount = (colsN + 1) * (rowsN + 1);

    const positions = new Float32Array(vCount * 3);
    const colors = new Float32Array(vCount * 3);
    const indices = [];

    const grass = new THREE.Color(this.env.grass);
    const grassAlt = new THREE.Color(this.env.grassAlt);
    // Color.lerp needs a Color instance — passing the raw hex would produce
    // NaN channels and render the terrain black.
    const highland = new THREE.Color(this.env.highland);
    const c = new THREE.Color();

    for (let j = 0; j <= rowsN; j++) {
      for (let i = 0; i <= colsN; i++) {
        const x = x0 + i * cell;
        const z = z0 + j * cell;
        const q = this.query(x, z);
        const y = this.terrainHeight(x, z, q);

        const vi = (j * (colsN + 1) + i) * 3;
        positions[vi] = x;
        positions[vi + 1] = y;
        positions[vi + 2] = z;

        // Two-tone ground plus a hard per-facet tint step. The stepped
        // variation is the point: it reads as baked 2005 terrain art where
        // every polygon was shaded independently.
        const t = fbm(x * 0.02, z * 0.02);
        c.copy(grass).lerp(grassAlt, Math.min(1, Math.max(0, t * 1.4 - 0.15)));
        const alt = Math.min(1, Math.max(0, (y - q.y) / 26));
        c.lerp(highland, alt * 0.55);
        c.multiplyScalar(0.88 + hash2(i, j) * 0.24);
        colors[vi] = c.r; colors[vi + 1] = c.g; colors[vi + 2] = c.b;
      }
    }

    for (let j = 0; j < rowsN; j++) {
      for (let i = 0; i < colsN; i++) {
        const a = j * (colsN + 1) + i;
        const b2 = a + 1;
        const cIdx = a + colsN + 1;
        const d = cIdx + 1;
        indices.push(a, cIdx, b2, b2, cIdx, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Unlit flat vertex art: the whole point is that no lighting model is
    // needed, exactly like the original's baked faces.
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true
    }));
    this.root.add(mesh);
    this.terrainMesh = mesh;
  }

  _buildScenery(scene) {
    const rng = this.rng;
    const b = this.bounds;
    const bLeaves = new THREE.MeshBasicMaterial({ fog: true });
    const bTrunk = new THREE.MeshBasicMaterial({ color: 0x4a3520, fog: true });

    // Two tree species, matching the original's mix of broadleaf blobs and
    // dark conifers. Real geometry, not billboards. Mountain stages get a
    // denser forest; the plains stay sparse.
    const broadleaf = Math.round((this.def.treeCount || 220) * 0.62);
    const conifer = Math.round((this.def.treeCount || 220) * 0.38);
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.2, 5);
    const coniferPts = [];
    for (const ring of [{ r: 1.5, h: 2.0, y: 2.0 }, { r: 1.1, h: 1.8, y: 3.4 }, { r: 0.7, h: 1.5, y: 4.6 }]) {
      const cone = new THREE.ConeGeometry(ring.r, ring.h, 6);
      cone.translate(0, ring.y + ring.h / 2 - 1.1, 0);
      coniferPts.push(cone);
    }
    const blobGeo = new THREE.IcosahedronGeometry(1.9, 0);
    blobGeo.translate(0, 3.1, 0);

    const placeTrees = (geo, colour, count, minLat, maxLat) => {
      const mesh = new THREE.InstancedMesh(geo, bLeaves, count);
      const trunkMesh = new THREE.InstancedMesh(trunkGeo, bTrunk, count);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      const col = new THREE.Color(colour);
      const cc = new THREE.Color();
      let placed = 0, guard = 0;
      while (placed < count && guard < count * 30) {
        guard++;
        const s = this.samples[Math.floor(rng() * this.samples.length)];
        const lat = (minLat + rng() * (maxLat - minLat)) * (rng() < 0.5 ? -1 : 1);
        const x = s.x + s.rx * lat;
        const z = s.z + s.rz * lat;
        if (x < b.minX - 200 || x > b.maxX + 200) continue;
        if (z < b.minZ - 200 || z > b.maxZ + 200) continue;
        const q2 = this.query(x, z);
        if (q2.absLat < ROAD_HALF + SHOULDER + 3) continue;
        const y = this.terrainHeight(x, z, q2);
        const scale = 0.75 + rng() * 0.85;
        q.setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0));
        pos.set(x, y, z);
        scl.set(scale, scale * (0.85 + rng() * 0.4), scale);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(placed, m);
        // Slight per-tree colour variation.
        cc.copy(col).multiplyScalar(0.82 + rng() * 0.36);
        mesh.setColorAt(placed, cc);

        scl.set(scale, scale, scale);
        pos.set(x, y, z);
        m.compose(pos, q, scl);
        trunkMesh.setMatrixAt(placed, m);
        placed++;
      }
      for (let i = placed; i < count; i++) {
        m.makeScale(0.0001, 0.0001, 0.0001);
        mesh.setMatrixAt(i, m);
        trunkMesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      trunkMesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
      this.root.add(trunkMesh);
    };

    placeTrees(blobGeo, 0x2f7a2a, broadleaf, 14, 190);
    // Merge the conifer rings into one geometry.
    const merged = mergeGeometries(coniferPts);
    placeTrees(merged, 0x1f5220, conifer, 12, 170);
  }

  // ------------------------------------------------------------- roadside ---
  // Sparse, deliberate detail — the mobile aesthetic depends on empty space
  // as much as on objects. Everything here is instanced (one draw call each).
  _buildRoadside(scene) {
    const rng = this.rng;
    const n = this.samples.length;
    const isMountain = !!this.def.mountainSlope;

    // --- Guardrails on the outside of corners -----------------------------
    // A corner's outside is the side away from the turn centre: for a right
    // turn (positive angle) that is the left edge, and vice versa.
    const railPosts = [];
    const railSegs = [];
    for (let i = 0; i < n - 1; i++) {
      const a = this.samples[i];
      const b = this.samples[i + 1];
      // Local curvature from the change in heading.
      let dh = b.heading - a.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      if (Math.abs(dh) < 0.012) continue;             // straight: no rail
      const outside = dh > 0 ? -1 : 1;               // right turn -> left side
      const lat = outside * (ROAD_HALF + 0.55);
      const x = a.x + a.rx * lat;
      const z = a.z + a.rz * lat;
      const y = this.terrainHeight(x, z, this.query(x, z));
      railPosts.push({ x, y, z, heading: a.heading });
      railSegs.push({ x, y, z, heading: a.heading });
    }

    if (railPosts.length) {
      const postGeo = new THREE.BoxGeometry(0.16, 0.85, 0.16);
      postGeo.translate(0, 0.42, 0);
      const railGeo = new THREE.BoxGeometry(3.2, 0.14, 0.10);
      railGeo.translate(0, 0.72, 0);
      const merged = mergeGeometries([postGeo, railGeo]);
      const mat = new THREE.MeshBasicMaterial({ color: 0xc8ccd2, fog: true });
      const mesh = new THREE.InstancedMesh(merged, mat, railPosts.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < railPosts.length; i++) {
        const p = railPosts[i];
        q.setFromEuler(new THREE.Euler(0, p.heading, 0));
        pos.set(p.x, p.y, p.z);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    }

    // --- Utility poles along the road ------------------------------------
    const poleSpacing = 14;      // every N samples (~70 m)
    const poleList = [];
    for (let i = 0; i < n; i += poleSpacing) {
      const p = this.samples[i];
      const side = (i / poleSpacing) % 2 === 0 ? 1 : -1;
      const lat = side * (ROAD_HALF + 3.2);
      const x = p.x + p.rx * lat;
      const z = p.z + p.rz * lat;
      const y = this.terrainHeight(x, z, this.query(x, z));
      poleList.push({ x, y, z, heading: p.heading });
    }
    if (poleList.length) {
      const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7.5, 5);
      poleGeo.translate(0, 3.75, 0);
      const armGeo = new THREE.BoxGeometry(1.6, 0.12, 0.12);
      armGeo.translate(0, 6.6, 0);
      const merged = mergeGeometries([poleGeo, armGeo]);
      const mat = new THREE.MeshBasicMaterial({ color: 0x5a4632, fog: true });
      const mesh = new THREE.InstancedMesh(merged, mat, poleList.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < poleList.length; i++) {
        const p = poleList[i];
        q.setFromEuler(new THREE.Euler(0, p.heading, 0));
        pos.set(p.x, p.y, p.z);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    }

    // --- Chevron signs on the outside of corners -------------------------
    const signList = [];
    for (let i = 0; i < n - 1; i++) {
      const a = this.samples[i];
      const b = this.samples[i + 1];
      let dh = b.heading - a.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      if (Math.abs(dh) < 0.03) continue;
      const outside = dh > 0 ? -1 : 1;
      const lat = outside * (ROAD_HALF + 1.4);
      const x = a.x + a.rx * lat;
      const z = a.z + a.rz * lat;
      const y = this.terrainHeight(x, z, this.query(x, z));
      signList.push({ x, y, z, heading: a.heading, flip: outside < 0 });
    }
    if (signList.length) {
      const boardGeo = new THREE.BoxGeometry(1.1, 0.7, 0.06);
      boardGeo.translate(0, 1.05, 0);
      const legGeo = new THREE.BoxGeometry(0.09, 0.75, 0.09);
      legGeo.translate(0, 0.37, 0);
      const merged = mergeGeometries([boardGeo, legGeo]);
      const mat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8, fog: true });
      const mesh = new THREE.InstancedMesh(merged, mat, signList.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < signList.length; i++) {
        const p = signList[i];
        q.setFromEuler(new THREE.Euler(0, p.heading + (p.flip ? 0.35 : -0.35), 0));
        pos.set(p.x, p.y, p.z);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    }

    // --- Rocks scattered on the downhill side ----------------------------
    const rockCount = isMountain ? 90 : 40;
    const rockGeo = new THREE.IcosahedronGeometry(0.7, 0);
    const rockMat = new THREE.MeshBasicMaterial({ color: 0x8a8d90, fog: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    let placed = 0, guard = 0;
    while (placed < rockCount && guard < rockCount * 40) {
      guard++;
      const s = this.samples[Math.floor(rng() * n)];
      const lat = (ROAD_HALF + 2 + rng() * 26) * (rng() < 0.5 ? -1 : 1);
      const x = s.x + s.rx * lat;
      const z = s.z + s.rz * lat;
      const y = this.terrainHeight(x, z, this.query(x, z));
      const sc = 0.4 + rng() * 1.3;
      q.setFromEuler(new THREE.Euler(rng() * 0.4, rng() * Math.PI, rng() * 0.4));
      pos.set(x, y + sc * 0.2, z);
      scl.set(sc, sc * (0.6 + rng() * 0.5), sc);
      m.compose(pos, q, scl);
      rocks.setMatrixAt(placed, m);
      placed++;
    }
    for (let i = placed; i < rockCount; i++) {
      m.makeScale(0.0001, 0.0001, 0.0001);
      rocks.setMatrixAt(i, m);
    }
    rocks.instanceMatrix.needsUpdate = true;
    this.root.add(rocks);

    // --- A couple of mountain buildings at wide spots --------------------
    if (isMountain) {
      const hutGeo = new THREE.BoxGeometry(4.2, 2.6, 3.4);
      hutGeo.translate(0, 1.3, 0);
      const roofGeo = new THREE.ConeGeometry(3.4, 1.4, 4);
      roofGeo.rotateY(Math.PI / 4);
      roofGeo.translate(0, 3.3, 0);
      const merged = mergeGeometries([hutGeo, roofGeo]);
      const mat = new THREE.MeshBasicMaterial({ color: 0x6b5a48, fog: true });
      const spots = [0.18, 0.55, 0.82];
      const mesh = new THREE.InstancedMesh(merged, mat, spots.length);
      for (let i = 0; i < spots.length; i++) {
        const s = this.samples[Math.floor(n * spots[i])];
        const lat = (ROAD_HALF + 7) * (i % 2 === 0 ? 1 : -1);
        const x = s.x + s.rx * lat;
        const z = s.z + s.rz * lat;
        const y = this.terrainHeight(x, z, this.query(x, z));
        q.setFromEuler(new THREE.Euler(0, s.heading + (i % 2 === 0 ? 0.4 : -0.4), 0));
        pos.set(x, y, z);
        scl.set(1, 1, 1);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    }
  }

  _buildGantry(scene) {
    // Checkered start banner, as in the original's start/finish.
    const p0 = this.samples[0];
    const p1 = this.samples[1];
    const group = new THREE.Group();
    const cell = 0.5;
    const barW = 2 * (ROAD_HALF + 0.8);
    const cols = Math.round(barW / cell);
    const rows = 2;
    const positions = [];
    const colors = [];
    const indices = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = -barW / 2 + c * cell;
        const y0 = 5.2 + r * cell;
        const base = positions.length / 3;
        for (const [px, py] of [[x0, y0], [x0 + cell, y0], [x0, y0 + cell], [x0 + cell, y0 + cell]]) {
          positions.push(px, py, 0);
          const on = (c + r) % 2 === 0;
          colors.push(on ? 0.95 : 0.06, on ? 0.95 : 0.06, on ? 0.95 : 0.06);
        }
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    const banner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, fog: true
    }));
    group.add(banner);

    // Two pillars.
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, fog: true });
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.0, 0.5), pillarMat);
      pillar.position.set(side * (ROAD_HALF + 0.8), 3.0, 0);
      group.add(pillar);
    }

    group.position.set(p0.x, p0.y, p0.z);
    group.rotation.y = p0.heading;
    this.root.add(group);
    this.gantry = group;
  }
}

// Shared puddle texture, built once: pale reflective center dissolving to
// transparent so the decal melts into the dirt without a hard edge.
let _puddleTex = null;
function makePuddleTexture() {
  if (_puddleTex) return _puddleTex;
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(165,195,225,0.9)');
  g.addColorStop(0.55, 'rgba(70,95,130,0.65)');
  g.addColorStop(1, 'rgba(35,50,75,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  _puddleTex = tex;
  return tex;
}

// Minimal geometry merge — avoids pulling in the addons/BufferGeometryUtils.
function mergeGeometries(geos) {
  let vTotal = 0, iTotal = 0;
  for (const g of geos) {
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : 0;
  }
  const positions = new Float32Array(vTotal * 3);
  const indices = new Uint16Array(iTotal);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position.array;
    positions.set(p, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) indices[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeVertexNormals();
  return out;
}
