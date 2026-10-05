// world.js — sky, atmosphere and environment palettes.
// Art direction target: modern renderer, deliberately 2005-era assets.
// That means unlit vertex art, posterised sky bands and a short draw
// distance, not modern shading with a retro filter on top.
import * as THREE from 'three';

// Environment palettes. Adding an environment is a new entry here plus a
// stage def that references it — no engine changes required.
export const ENVIRONMENTS = {
  cartway: {
    id: 'cartway',
    label: 'CART-WAY',
    sky: { top: 0x2f6fc0, horizon: 0xbfe0f5, bands: 7, ground: 0xbcd8ec },
    fog: { color: 0xbcd8ec, near: 40, far: 340 },
    road: 0x8a6a45,        // packed dirt
    grass: 0x4f9c33,       // saturated bright green
    grassAlt: 0x3d8529,
    highland: 0x6f9a4a,    // bleached uplands
    mountain: 0x7f9ec4,    // hazy distant range
    mountainSnow: 0xe8f0f8
  },
  gravel: {
    id: 'gravel',
    label: 'GRAVEL',
    sky: { top: 0x9fb6d6, horizon: 0xf0e2c0, bands: 6, ground: 0xe6d6b0 },
    fog: { color: 0xe6d6b0, near: 40, far: 220 },
    road: 0xa08a63,
    grass: 0xbea877,
    grassAlt: 0xa8945f,
    highland: 0xd8c79c,
    mountain: 0xc0a888,
    mountainSnow: 0xf0e6d0
  },
  snow: {
    id: 'snow',
    label: 'SNOW',
    sky: { top: 0x6a86b4, horizon: 0xdfe9f2, bands: 8, ground: 0xd8e4f0 },
    fog: { color: 0xd8e4f0, near: 35, far: 200 },
    road: 0x6b5a45,        // plowed road stays brown
    grass: 0xdde9f4,
    grassAlt: 0xc6d8e8,
    highland: 0xf0f6fb,
    mountain: 0xb8c8dc,
    mountainSnow: 0xffffff
  },
  night: {
    id: 'night',
    label: 'NIGHT',
    sky: { top: 0x05070f, horizon: 0x2a1a10, bands: 5, ground: 0x120c08 },
    fog: { color: 0x1a1208, near: 30, far: 160 },
    road: 0x4a4038,
    grass: 0x1d2a18,
    grassAlt: 0x16210f,
    highland: 0x2a2418,
    mountain: 0x1a1812,
    mountainSnow: 0x3a3226
  },
  // Cool morning in the mountains: blue air, dark conifer forest, pale
  // distant peaks. Deliberately desaturated so the road stays readable.
  mountain: {
    id: 'mountain',
    label: 'MOUNTAIN',
    sky: { top: 0x3a6a9e, horizon: 0xc4d8e4, bands: 8, ground: 0xb8ccd8 },
    fog: { color: 0xb8ccd8, near: 45, far: 360 },
    road: 0x7a6a52,        // grey-brown mountain dirt
    grass: 0x2e5a2a,       // dark conifer green
    grassAlt: 0x244a22,
    highland: 0x4a5a48,
    mountain: 0x8a9ab0,    // hazy blue-grey range
    mountainSnow: 0xe4ecf2
  }
};

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(env) {
    this.env = env;
    this.rng = mulberry32(0x5EED);
  }

  build(scene) {
    this.scene = scene;
    scene.fog = new THREE.Fog(this.env.fog.color, this.env.fog.near, this.env.fog.far);
    scene.background = new THREE.Color(this.env.sky.ground);
    this._buildSky(scene);
    this._buildLights(scene);
    return this;
  }

  /** Swap palette + sky when the player picks a different stage. */
  setEnvironment(env) {
    this.env = env;
    if (!this.scene) return;
    this.scene.fog.color.setHex(env.fog.color);
    this.scene.fog.near = env.fog.near;
    this.scene.fog.far = env.fog.far;
    this.scene.background.setHex(env.sky.ground);
    if (this.skyDome) {
      this.scene.remove(this.skyDome);
      this.skyDome.geometry.dispose();
      this.skyDome.material.map.dispose();
      this.skyDome.material.dispose();
      this.skyDome = null;
    }
    this._buildSky(this.scene);
  }

  // -------------------------------------------------------------- lights ---
  // Terrain, road and scenery are unlit vertex art. Only the car is lit, with
  // hard flat per-face shading — the 2005 convention of pre-baked landscape
  // plus a shaded vehicle.
  _buildLights(scene) {
    const hemi = new THREE.HemisphereLight(0xdcefff, 0x4a5a2a, 1.15);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.5);
    sun.position.set(60, 120, 40);
    scene.add(sun);
  }

  // ----------------------------------------------------------------- sky ---
  // A tiny hand-built canvas texture with hard posterised bands. The banding
  // is the point: a smooth gradient would look modern, the original's sky
  // visibly steps.
  _buildSky(scene) {
    const { top, horizon, ground, bands } = this.env.sky;

    const W = 8, H = 128;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const cTop = new THREE.Color(top);
    const cHor = new THREE.Color(horizon);
    const cGround = new THREE.Color(ground);

    // Sky occupies the upper 78% of the dome, quantised into `bands` steps.
    const skyRows = Math.floor(H * 0.78);
    for (let y = 0; y < skyRows; y++) {
      const t = y / (skyRows - 1);
      const c = cHor.clone().lerp(cTop, Math.pow(t, 0.75));
      ctx.fillStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
      ctx.fillRect(0, y, W, 1);
    }
    // Quantise: collapse each row into one of `bands` discrete colours.
    const img = ctx.getImageData(0, 0, W, skyRows);
    const d = img.data;
    for (let y = 0; y < skyRows; y++) {
      const step = Math.min(bands - 1, Math.floor((y / skyRows) * bands));
      const src = Math.min(skyRows - 1, Math.round((step / bands) * (skyRows - 1)));
      for (let x = 0; x < W; x++) {
        const si = (src * W + x) * 4;
        const di = (y * W + x) * 4;
        d[di] = d[si]; d[di + 1] = d[si + 1]; d[di + 2] = d[si + 2]; d[di + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Below the horizon fades to the ground haze so the dome never shows a seam.
    const grad = ctx.createLinearGradient(0, skyRows, 0, H);
    grad.addColorStop(0, `rgb(${(cHor.r * 255) | 0},${(cHor.g * 255) | 0},${(cHor.b * 255) | 0})`);
    grad.addColorStop(1, `rgb(${(cGround.r * 255) | 0},${(cGround.g * 255) | 0},${(cGround.b * 255) | 0})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, skyRows, W, H - skyRows);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;   // keep the banding crisp
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2200, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    dome.renderOrder = -10;
    scene.add(dome);
    this.skyDome = dome;
  }
}
