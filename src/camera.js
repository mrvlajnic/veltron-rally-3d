// camera.js — third-person chase camera with speed effects, mouse lock, and immersion.
import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;

    // Camera positioning — closer for immersion
    this.back = 4.5;       // metres behind (was 6.2)
    this.height = 2.8;     // metres above — lower, more cockpit feel
    this.lookAhead = 6.0;
    this.lookHeight = 0.9;

    // Base lerp rates
    this.positionLerp = 8.0;
    this.lookLerp = 12.0;

    // Speed effects
    this.baseFov = 70;
    this.maxFov = 95;
    this.fovLerp = 8.0;

    // Camera shake
    this.shakeIntensity = 0;
    this.shakeDecay = 12.0;
    this.shakeOffset = new THREE.Vector3();

    // Speed lines (visual speed indicator)
    this.speedLines = null;
    this._initSpeedLines();

    // Mouse lock / steering
    this.pointerLocked = false;
    this.mouseSteer = 0;
    this.mouseSensitivity = 0.003;
    this._setupPointerLock();

    this._targetPos = new THREE.Vector3();
    this._targetLook = new THREE.Vector3();
    this._smoothedLook = new THREE.Vector3();
  }

  _initSpeedLines() {
    // Speed lines: faint peripheral streaks at high speed. They live near
    // the frame edges (wide radius) so the road ahead stays clean.
    const count = 36;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3 * 2);
    const colors = new Float32Array(count * 3 * 2);
    const alphas = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 1.5 + Math.random() * 0.9;
      const length = 2 + Math.random() * 2.5;

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      // Start point (near camera)
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = -0.5;

      // End point (stretching backward)
      positions[i * 6 + 3] = x * (1 + length * 0.3);
      positions[i * 6 + 4] = y * (1 + length * 0.3);
      positions[i * 6 + 5] = -length;

      const brightness = 0.35 + Math.random() * 0.25;
      colors[i * 6] = brightness;
      colors[i * 6 + 1] = brightness;
      colors[i * 6 + 2] = brightness;
      colors[i * 6 + 3] = brightness;
      colors[i * 6 + 4] = brightness;
      colors[i * 6 + 5] = brightness;

      alphas[i * 2] = 0;
      alphas[i * 2 + 1] = 0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      color: 0x8fa0c0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.speedLines = new THREE.LineSegments(geometry, material);
    this.speedLines.rotation.z = Math.PI / 2; // Face forward
    this.speedLines.visible = false;
  }

  _setupPointerLock() {
    const canvas = this.canvas;
    const lockChange = () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) this.mouseSteer = 0;
    };
    document.addEventListener('pointerlockchange', lockChange);

    // Request pointer lock on canvas click
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) {
        canvas.requestPointerLock().catch(() => {});
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseSteer = Math.max(-1, Math.min(1, this.mouseSteer + e.movementX * this.mouseSensitivity));
      }
    });

    // Exit on Escape
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.pointerLocked) {
        document.exitPointerLock();
      }
    });
  }

  snapTo(car) {
    const fwd = car.forward;
    this._targetPos.copy(car.position).addScaledVector(fwd, -this.back);
    this._targetPos.y = car.position.y + this.height;
    this.camera.position.copy(this._targetPos);
    this._targetLook.copy(car.position).addScaledVector(fwd, this.lookAhead);
    this._targetLook.y = car.position.y + this.lookHeight;
    this._smoothedLook.copy(this._targetLook);
    this.camera.lookAt(this._smoothedLook);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.shakeIntensity = 0;
    this.shakeOffset.set(0, 0, 0);
    this.speedLines.visible = false;
    if (this.speedLines.parent) this.speedLines.parent.remove(this.speedLines);
  }

  addShake(intensity) {
    this.shakeIntensity = Math.min(1, this.shakeIntensity + intensity);
  }

  getMouseSteer() {
    const steer = this.mouseSteer;
    this.mouseSteer *= 0.92; // decay when not moving mouse
    return steer;
  }

  update(car, dt) {
    const fwd = car.forward;
    const speed = Math.abs(car.forwardSpeed);
    const speedRatio = Math.min(1, speed / 42); // 0-1 at ~42 m/s (151 km/h)

    // --- Target position ---
    this._targetPos.copy(car.position).addScaledVector(fwd, -this.back);
    this._targetPos.y = car.position.y + this.height;

    // Adaptive lerp rate
    const rate = this.positionLerp + speed * 0.6;
    this.camera.position.lerp(this._targetPos, 1 - Math.exp(-rate * dt));

    // --- Look target ---
    this._targetLook.copy(car.position).addScaledVector(fwd, this.lookAhead);
    this._targetLook.y = car.position.y + this.lookHeight;
    this._smoothedLook.lerp(this._targetLook, 1 - Math.exp(-this.lookLerp * dt));

    // --- Speed effects ---
    // FOV zoom
    const targetFov = this.baseFov + (this.maxFov - this.baseFov) * speedRatio;
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-this.fovLerp * dt));
    this.camera.updateProjectionMatrix();

    // Camera shake
    if (this.shakeIntensity > 0.01) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity * 0.15,
        (Math.random() - 0.5) * this.shakeIntensity * 0.08,
        (Math.random() - 0.5) * this.shakeIntensity * 0.05
      );
      this.shakeIntensity *= Math.exp(-this.shakeDecay * dt);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    // Apply shake to camera position
    this.camera.position.add(this.shakeOffset);

    // Speed lines (shared with hood cam — see setSpeedLines).
    this.setSpeedLines(speedRatio, dt);

    // Apply look target
    const lookTarget = this._smoothedLook.clone().add(this.shakeOffset);
    this._smoothedLook.lerp(this._targetLook, 1 - Math.exp(-this.lookLerp * dt));
    this.camera.lookAt(this._smoothedLook.clone().add(this.shakeOffset));
  }

  /** Speed-line overlay step, shared so hood cam gets the same streaks. */
  setSpeedLines(speedRatio, dt) {
    // Low ceiling, gentle shimmer, no rotation (spinning is what made them
    // read as bicycle spokes). Stretch sells the motion.
    this._fxTime = (this._fxTime || 0) + dt;
    if (speedRatio > 0.45) {
      if (!this.speedLines.parent) this.camera.add(this.speedLines);
      this.speedLines.visible = true;
      const intensity = Math.min(1, (speedRatio - 0.45) / 0.55);
      const flicker = 0.85 + 0.15 * Math.sin(this._fxTime * 23);
      this.speedLines.material.opacity = intensity * 0.28 * flicker;
      this.speedLines.scale.z = 1 + intensity * 2;
    } else {
      this.speedLines.visible = false;
      if (this.speedLines.parent) this.speedLines.parent.remove(this.speedLines);
    }
  }
}

// Hood cam: driver eye just above the bonnet, looking far ahead. Near-rigid
// follow (fast lerp kills rail harshness) with its own shake + FOV kick.
export class HoodCamera {
  constructor(camera) {
    this.camera = camera;
    this.baseFov = 75;
    this.maxFov = 100;
    this.fovLerp = 8.0;
    this.shakeIntensity = 0;
    this.shakeDecay = 12.0;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  snapTo(car) {
    const fwd = car.forward;
    this._pos.copy(car.position).addScaledVector(fwd, 0.2);
    this._pos.y = car.position.y + 1.25;
    this.camera.position.copy(this._pos);
    this._look.copy(car.position).addScaledVector(fwd, 25);
    this._look.y = car.position.y + 0.8;
    this.camera.lookAt(this._look);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.shakeIntensity = 0;
  }

  addShake(intensity) {
    this.shakeIntensity = Math.min(1, this.shakeIntensity + intensity);
  }

  update(car, dt) {
    const fwd = car.forward;
    const speed = Math.abs(car.forwardSpeed);
    const speedRatio = Math.min(1, speed / 42);

    this._tmp.copy(car.position).addScaledVector(fwd, 0.2);
    this._tmp.y = car.position.y + 1.25;
    this._pos.lerp(this._tmp, 1 - Math.exp(-22 * dt));

    if (this.shakeIntensity > 0.01) {
      this._tmp.set(
        (Math.random() - 0.5) * this.shakeIntensity * 0.12,
        (Math.random() - 0.5) * this.shakeIntensity * 0.07,
        (Math.random() - 0.5) * this.shakeIntensity * 0.05
      );
      this.shakeIntensity *= Math.exp(-this.shakeDecay * dt);
    } else {
      this._tmp.set(0, 0, 0);
    }
    this.camera.position.copy(this._pos).add(this._tmp);

    const targetFov = this.baseFov + (this.maxFov - this.baseFov) * speedRatio;
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-this.fovLerp * dt));
    this.camera.updateProjectionMatrix();

    this._look.copy(car.position).addScaledVector(fwd, 25);
    this._look.y = car.position.y + 0.8;
    this.camera.lookAt(this._look);
  }
}

export class WeatherSystem {
  constructor(scene, renderer, world) {
    this.scene = scene;
    this.renderer = renderer;
    this.world = world;

    this.current = 'sunny'; // sunny, rainy, night, noon
    this.transition = 0;

    // Rain particles
    this.rain = null;
    this._buildRain();

    // Fog presets per weather
    this.fogPresets = {
      sunny:  { color: 0xb8ccd8, near: 45, far: 360 },
      rainy:  { color: 0x5a6a7a, near: 15, far: 130 },
      night:  { color: 0x1a1a2e, near: 20, far: 150 },
      noon:   { color: 0xcce0f0, near: 50, far: 400 }
    };

    // Sky colors per weather
    this.skyPresets = {
      sunny:  { top: 0x3a6a9e, horizon: 0xc4d8e4, ground: 0xb8ccd8, bands: 8 },
      rainy:  { top: 0x3a4a5a, horizon: 0x7a8a9a, ground: 0x6a7a8a, bands: 6 },
      night:  { top: 0x08081a, horizon: 0x2a2a3a, ground: 0x12121e, bands: 5 },
      noon:   { top: 0x4a9ad0, horizon: 0xd0e8f8, ground: 0xcce0f0, bands: 7 }
    };

    // Lighting presets (match _buildLights expected format)
    this.lightPresets = {
      sunny:  { hemi: { color: 0xdcefff, ground: 0x4a5a2a, intensity: 1.15 }, sun: { color: 0xfff2d0, intensity: 1.5, position: { x: 60, y: 120, z: 40 } } },
      rainy:  { hemi: { color: 0x9aabb8, ground: 0x33393a, intensity: 0.75 }, sun: { color: 0xbbc0d0, intensity: 0.45, position: { x: 50, y: 100, z: 30 } } },
      night:  { hemi: { color: 0x333355, ground: 0x1a1a1a, intensity: 0.3 },  sun: { color: 0x444466, intensity: 0.15, position: { x: 40, y: 80, z: 20 } } },
      noon:   { hemi: { color: 0xeef5ff, ground: 0x5a6a4a, intensity: 1.3 },  sun: { color: 0xffffee, intensity: 1.8, position: { x: 70, y: 140, z: 50 } } }
    };
  }

  _buildRain() {
    // Rain lives in a box around the car: particle positions are LOCAL
    // (centred on the origin) and the whole Points object follows the car,
    // so there is exactly one car-position offset, not two.
    const count = 1000;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 50 + 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
      velocities[i * 3] = (Math.random() - 0.5) * 2;
      velocities[i * 3 + 1] = -(25 + Math.random() * 15);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.22,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.rain = new THREE.Points(geo, mat);
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  setWeather(type, instant = false) {
    if (!this.fogPresets[type]) return;
    this.current = type;
    this.transition = instant ? 1 : 0;
    this._applyWeather();
  }

  _applyWeather() {
    const p = this.fogPresets[this.current];
    const s = this.skyPresets[this.current];
    const l = this.lightPresets[this.current];

    // Fog
    if (this.world.scene) {
      this.world.scene.fog.color.setHex(p.color);
      this.world.scene.fog.near = p.near;
      this.world.scene.fog.far = p.far;
      this.world.scene.background.setHex(s.ground);
    }

    // Sky dome - only rebuild if sky colors actually changed
    if (this.world.skyDome) {
      const currentMap = this.world.skyDome.material.map;
      if (currentMap) {
        // Update the texture in place instead of recreating
        const { top, horizon, ground, bands } = s;
        const W = 8, H = 128;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        const cTop = new THREE.Color(top);
        const cHor = new THREE.Color(horizon);
        const cGround = new THREE.Color(ground);

        const skyRows = Math.floor(H * 0.78);
        for (let y = 0; y < skyRows; y++) {
          const t = y / (skyRows - 1);
          const c = cHor.clone().lerp(cTop, Math.pow(t, 0.75));
          ctx.fillStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
          ctx.fillRect(0, y, W, 1);
        }
        // Quantise
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

        const grad = ctx.createLinearGradient(0, skyRows, 0, H);
        grad.addColorStop(0, `rgb(${(cHor.r * 255) | 0},${(cHor.g * 255) | 0},${(cHor.b * 255) | 0})`);
        grad.addColorStop(1, `rgb(${(cGround.r * 255) | 0},${(cGround.g * 255) | 0},${(cGround.b * 255) | 0})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, skyRows, W, H - skyRows);

        // The canvas above is new — point the live texture at it, otherwise
        // the sky never visibly changes.
        currentMap.image = canvas;
        currentMap.needsUpdate = true;
      }
    } else {
      this.world._buildSky(this.world.scene);
    }

    // Lighting - update existing lights instead of recreating
    if (this.world.hemi) {
      this.world.hemi.color.setHex(l.hemi.color);
      this.world.hemi.groundColor.setHex(l.hemi.ground);
      this.world.hemi.intensity = l.hemi.intensity;
    }
    if (this.world.sun) {
      this.world.sun.color.setHex(l.sun.color);
      this.world.sun.intensity = l.sun.intensity;
      this.world.sun.position.set(l.sun.position.x, l.sun.position.y, l.sun.position.z);
    }

    // Rain
    this.rain.visible = this.current === 'rainy';
    this.rain.material.opacity = this.current === 'rainy' ? 0.8 : 0;
  }

  update(dt, carPosition) {
    // Smooth transition
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt * 0.5);
      // Could interpolate fog/sky here for smooth transitions
    }

    // Update rain
    if (this.rain.visible) {
      const pos = this.rain.geometry.attributes.position;
      const vel = this.rain.geometry.attributes.velocity;
      const count = pos.count;

      for (let i = 0; i < count; i++) {
        const vx = vel.getX(i);
        const vy = vel.getY(i);
        const vz = vel.getZ(i);

        let px = pos.getX(i) + vx * dt;
        let py = pos.getY(i) + vy * dt;
        let pz = pos.getZ(i) + vz * dt;

        // Reset when hitting ground — local coords, the Points object
        // itself carries the car offset (see _buildRain).
        if (py < 0.5) {
          px = (Math.random() - 0.5) * 80;
          py = Math.random() * 50 + 5;
          pz = (Math.random() - 0.5) * 80;
        }

        pos.setXYZ(i, px, py, pz);
      }
      pos.needsUpdate = true;

      // Follow car horizontally
      this.rain.position.set(carPosition.x, 0, carPosition.z);
    }
  }
}