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
    // Speed lines: radial lines that appear at high speed
    const count = 60;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3 * 2);
    const colors = new Float32Array(count * 3 * 2);
    const alphas = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 0.8 + Math.random() * 0.4;
      const length = 3 + Math.random() * 4;

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

      const brightness = 0.6 + Math.random() * 0.4;
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
      transparent: true,
      opacity: 1,
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

    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) canvas.requestPointerLock();
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
    const speedRatio = Math.min(1, speed / 35); // 0-1 at ~35 m/s (126 km/h)

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

    // Speed lines
    if (speedRatio > 0.35) {
      if (!this.speedLines.parent) this.camera.add(this.speedLines);
      this.speedLines.visible = true;
      const intensity = Math.min(1, (speedRatio - 0.35) / 0.65);
      this.speedLines.material.opacity = intensity * 0.7;
      this.speedLines.rotation.z += dt * speedRatio * 8; // Spin faster at high speed
      this.speedLines.scale.z = 1 + intensity * 2;
    } else {
      this.speedLines.visible = false;
      if (this.speedLines.parent) this.speedLines.parent.remove(this.speedLines);
    }

    // Apply look target
    const lookTarget = this._smoothedLook.clone().add(this.shakeOffset);
    this._smoothedLook.lerp(this._targetLook, 1 - Math.exp(-this.lookLerp * dt));
    this.camera.lookAt(this._smoothedLook.clone().add(this.shakeOffset));
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
    this._initRain();

    // Fog presets per weather
    this.fogPresets = {
      sunny:  { color: 0xb8ccd8, near: 45, far: 360 },
      rainy:  { color: 0x7a8a9a, near: 25, far: 180 },
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

    // Lighting presets
    this.lightPresets = {
      sunny:  { hemi: [0xdcefff, 0x4a5a2a, 1.15], sun: [0xfff2d0, 1.5, {x:60,y:120,z:40}] },
      rainy:  { hemi: [0xaabccc, 0x3a4a4a, 0.8],  sun: [0xccccee, 0.6, {x:50,y:100,z:30}] },
      night:  { hemi: [0x333355, 0x1a1a1a, 0.4],  sun: [0x444466, 0.2, {x:40,y:80,z:20}] },
      noon:   { hemi: [0xeef5ff, 0x5a6a4a, 1.3],  sun: [0xffffee, 1.8, {x:70,y:140,z:50}] }
    };

    this._buildRain();
  }

  _buildRain() {
    const count = 800;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = Math.random() * 80 + 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      velocities[i * 3] = (Math.random() - 0.5) * 2;
      velocities[i * 3 + 1] = -(25 + Math.random() * 15);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.15,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.rain = new THREE.Points(geo, mat);
    this.rain.visible = false;
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

    // Sky dome
    if (this.world.skyDome) {
      this.world.scene.remove(this.world.skyDome);
      this.world.skyDome.geometry.dispose();
      this.world.skyDome.material.map.dispose();
      this.world.skyDome.material.dispose();
    }
    this.world._buildSky(this.world.scene);
    this.world.skyDome.material.map.colorSpace = THREE.SRGBColorSpace;

    // Lighting
    if (this.world.hemi) this.world.scene.remove(this.world.hemi);
    if (this.world.sun) this.world.scene.remove(this.world.sun);
    this.world._buildLights(this.world.scene, l);

    // Rain
    this.rain.visible = this.current === 'rainy';
    this.rain.material.opacity = this.current === 'rainy' ? 0.6 : 0;
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

        // Reset when hitting ground
        if (py < 0.5) {
          px = carPosition.x + (Math.random() - 0.5) * 80;
          py = Math.random() * 80 + 10;
          pz = carPosition.z + (Math.random() - 0.5) * 80;
        }

        pos.setXYZ(i, px, py, pz);
      }
      pos.needsUpdate = true;

      // Follow car horizontally
      this.rain.position.x = carPosition.x;
      this.rain.position.z = carPosition.z;
    }
  }
}