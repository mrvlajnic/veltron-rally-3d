// car.js — low-poly Veltron rally car: shared chassis, per-car tuning,
// arcade handling, terrain following and simple suspension.
//
// Art direction: flat per-face lighting, no speculars, no dynamic shadows —
// the contact shadow is a baked-in blob, as it was in the original.
import * as THREE from 'three';
import { SURFACE } from './stage.js';

const WHEEL_RADIUS = 0.36;
const WHEEL_WIDTH = 0.30;

// Shared handling constants. Car-specific values live in cars.js.
export const BASE = {
  maxReverse: -7,
  brake: 20,
  handbrakeScale: 0.7,
  yawSpeedFalloff: 0.13,
  gripVerge: 6.0,
  gripGrass: 3.4,
  gripHandbrake: 1.2,
  grassRollingResist: 1.9,   // grass is drivable — cutting corners is viable
  vergeRollingResist: 0.9,
  // Leaving the road costs TIME, not just grip. The original showed a red
  // penalty next to the stage clock, and players found grass cutting was a
  // legitimate shortcut — so this is a real trade-off, not a death sentence.
  offRoadPenaltyPerSec: 1.2,
  suspensionStiffness: 14,
  suspensionDamping: 6.5
};

export class RallyCar {
  /**
   * @param {object} spec  entry from cars.js
   * @param {object} stage object exposing query(x,z) and terrainHeight(x,z,q)
   */
  constructor(spec, stage) {
    this.spec = spec;
    this.tuning = spec.tuning;
    this.stage = stage;

    // --- Kinematic state ---
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.distance = 0;
    this.stageProgress = 0;
    this.timePenalty = 0;      // seconds lost off-road, shown in red
    this.wheelSpin = 0;
    this.steerAngle = 0;
    this.pitch = 0;
    this.roll = 0;
    this.offRoad = false;
    this.surface = SURFACE.ROAD;
    this.grip = this.tuning.gripRoad;
    this.finished = false;

    this._groundY = 0;
    this._wheelY = [0, 0, 0, 0];
    this._wheelVy = [0, 0, 0, 0];
    this._mats = {};
    this._wing = null;

    this.group = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);
    this.wheels = [];
    this._buildMesh();
    this.reset();
  }

  // ---------------------------------------------------------------- mesh ---
  _buildMesh() {
    const T = this.tuning;
    // flatShading gives the hard per-face look of a 2005 asset.
    const body = new THREE.MeshLambertMaterial({ color: T.bodyColor, flatShading: true });
    const accent = new THREE.MeshLambertMaterial({ color: T.accentColor, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x42464d, flatShading: true });
    const glass = new THREE.MeshLambertMaterial({
      color: 0xa6cee2, flatShading: true, transparent: true, opacity: 0.62
    });
    const tyre = new THREE.MeshLambertMaterial({ color: 0x191919, flatShading: true });
    const rim = new THREE.MeshLambertMaterial({ color: 0xb8bcc0, flatShading: true });
    const lamp = new THREE.MeshLambertMaterial({ color: 0xfff0b0, flatShading: true });
    const tail = new THREE.MeshLambertMaterial({ color: 0xc01818, flatShading: true });

    const add = (geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      this.bodyGroup.add(m);
      return m;
    };

    // Chassis: narrow and low, with flared arches over each wheel.
    add(new THREE.BoxGeometry(1.62, 0.40, 3.85), body, 0, 0.58, 0);
    // Front and rear bumpers in the accent colour.
    add(new THREE.BoxGeometry(1.70, 0.26, 0.34), accent, 0, 0.40, -1.86);
    add(new THREE.BoxGeometry(1.70, 0.26, 0.34), accent, 0, 0.40, 1.86);
    // Bonnet with a raised centre bulge.
    add(new THREE.BoxGeometry(1.50, 0.14, 1.05), body, 0, 0.84, -1.25);
    add(new THREE.BoxGeometry(0.80, 0.10, 0.70), dark, 0, 0.92, -1.30);
    // Cabin, narrower than the body — greenhouse taper.
    add(new THREE.BoxGeometry(1.36, 0.54, 1.85), body, 0, 1.06, 0.26);
    // Raked windscreen and rear window.
    add(new THREE.BoxGeometry(1.26, 0.50, 0.08), glass, 0, 1.08, -0.70, 0.30);
    add(new THREE.BoxGeometry(1.22, 0.46, 0.08), glass, 0, 1.08, 1.16, -0.28);
    // Side windows.
    add(new THREE.BoxGeometry(0.06, 0.38, 1.45), glass, -0.68, 1.10, 0.24);
    add(new THREE.BoxGeometry(0.06, 0.38, 1.45), glass, 0.68, 1.10, 0.24);
    // Roof + scoop.
    add(new THREE.BoxGeometry(1.28, 0.08, 1.55), dark, 0, 1.36, 0.26);
    add(new THREE.BoxGeometry(0.42, 0.14, 0.44), dark, 0, 1.46, -0.42);
    // Rear wing, scaled per car.
    const wing = add(new THREE.BoxGeometry(1.46 * T.wingScale, 0.07, 0.36), dark, 0, 1.32, 1.88);
    this._wing = wing;
    add(new THREE.BoxGeometry(0.09, 0.28, 0.12), dark, -0.52, 1.18, 1.86);
    add(new THREE.BoxGeometry(0.09, 0.28, 0.12), dark, 0.52, 1.18, 1.86);
    // Headlights + auxiliary lamp pod.
    add(new THREE.BoxGeometry(0.30, 0.16, 0.07), lamp, -0.50, 0.66, -1.96);
    add(new THREE.BoxGeometry(0.30, 0.16, 0.07), lamp, 0.50, 0.66, -1.96);
    add(new THREE.CylinderGeometry(0.10, 0.10, 0.07, 8), lamp, 0, 0.66, -1.96, Math.PI / 2);
    // Taillights.
    add(new THREE.BoxGeometry(0.34, 0.15, 0.07), tail, -0.46, 0.78, 1.96);
    add(new THREE.BoxGeometry(0.34, 0.15, 0.07), tail, 0.46, 0.78, 1.96);
    // Flared arches — reads as a rally car at low poly count.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(new THREE.BoxGeometry(0.16, 0.30, 1.00), body,
          sx * 0.80, 0.62, sz * 1.34);
      }
    }

    // Four wheels: steer pivot -> spin group -> tyre + rim.
    const layout = [
      { x: -0.86, z: -1.28, steer: true },
      { x: 0.86, z: -1.28, steer: true },
      { x: -0.86, z: 1.34, steer: false },
      { x: 0.86, z: 1.34, steer: false }
    ];
    layout.forEach((p, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(p.x, WHEEL_RADIUS, p.z);
      const spinner = new THREE.Group();
      pivot.add(spinner);

      const tyreMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 10), tyre);
      tyreMesh.rotation.z = Math.PI / 2;
      spinner.add(tyreMesh);

      const rimMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS * 0.5, WHEEL_RADIUS * 0.5, WHEEL_WIDTH + 0.03, 8), rim);
      rimMesh.rotation.z = Math.PI / 2;
      spinner.add(rimMesh);

      this.bodyGroup.add(pivot);
      this.wheels.push({ pivot, spinner, steerable: p.steer, x: p.x, z: p.z, index: i });
    });

    // Baked contact shadow (the original had this painted into the texture).
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 16),
      new THREE.MeshBasicMaterial({
        color: 0x1a2410, transparent: true, opacity: 0.3,
        depthWrite: false, fog: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    shadow.scale.set(1.0, 2.05, 1);
    shadow.renderOrder = -1;
    this.group.add(shadow);

    this._mats.body = body;
    this._mats.accent = accent;
  }

  /**
   * Swap to a different Veltron spec. Only livery, wing and ride height
   * change visually — the handling comes from `tuning`, which the game loop
   * reads every frame, so this takes effect immediately.
   */
  applySpec(spec) {
    this.spec = spec;
    this.tuning = spec.tuning;
    this._mats.body.color.setHex(spec.tuning.bodyColor);
    this._mats.accent.color.setHex(spec.tuning.accentColor);
    if (this._wing) this._wing.scale.x = spec.tuning.wingScale;
    this.grip = spec.tuning.gripRoad;
  }

  // ------------------------------------------------------------- helpers ---
  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  get speedKmh() {
    return Math.abs(this.forwardSpeed) * 3.6;
  }

  /** Place the car at the start of the stage. */
  reset() {
    const s = this.stage;
    this.position.set(s.startPos.x, s.startPos.y, s.startPos.z);
    this.velocity.set(0, 0, 0);
    this.yaw = s.startHeading;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.distance = 0;
    this.stageProgress = 0;
    this.timePenalty = 0;
    this.wheelSpin = 0;
    this.steerAngle = 0;
    this.pitch = 0;
    this.roll = 0;
    this.offRoad = false;
    this.surface = SURFACE.ROAD;
    this.grip = this.tuning.gripRoad;
    this.finished = false;
    this._groundY = s.startPos.y;
    for (let i = 0; i < 4; i++) { this._wheelY[i] = 0; this._wheelVy[i] = 0; }
    this.syncMesh();
  }

  // -------------------------------------------------------------- update ---
  update(dt, input) {
    const T = this.tuning;
    const B = BASE;

    // --- Surface --------------------------------------------------------
    const q = this.stage.query(this.position.x, this.position.z);
    this.surface = q.surface;
    this.offRoad = q.surface !== SURFACE.ROAD;

    const onVerge = q.surface === SURFACE.VERGE;
    this.grip = input.handbrake
      ? B.gripHandbrake
      : (this.offRoad ? (onVerge ? B.gripVerge : B.gripGrass) : T.gripRoad);

    const rolling = this.offRoad
      ? (onVerge ? B.vergeRollingResist : B.grassRollingResist)
      : T.rollingResist;

    // Leaving the road accrues a time penalty — the defining rule of the
    // original. Grass stays drivable, so cutting a corner is a real trade.
    if (this.offRoad) this.timePenalty += B.offRoadPenaltyPerSec * dt;

    // --- Longitudinal ----------------------------------------------------
    const prevSpeed = this.forwardSpeed;

    if (input.throttle > 0) {
      const t = THREE.MathUtils.clamp(this.forwardSpeed / T.maxSpeed, 0, 1);
      this.forwardSpeed += T.accel * (1 - Math.pow(t, 1.6)) * dt;
    }
    if (input.brake > 0) {
      if (this.forwardSpeed > 0.4) this.forwardSpeed -= T.brake * dt;
      else this.forwardSpeed -= T.accel * 0.45 * dt;   // reverse
    }
    if (input.handbrake) {
      this.forwardSpeed -= Math.sign(this.forwardSpeed) * T.brake * B.handbrakeScale * dt;
    }

    this.forwardSpeed -= Math.sign(this.forwardSpeed) * rolling * dt;
    this.forwardSpeed -= this.forwardSpeed * Math.abs(this.forwardSpeed) * T.drag * dt;

    this.forwardSpeed = THREE.MathUtils.clamp(this.forwardSpeed, B.maxReverse, T.maxSpeed);
    if (Math.abs(this.forwardSpeed) < 0.02 && !input.throttle && !input.brake) {
      this.forwardSpeed = 0;
    }

    // --- Steering: digital-feel, and less sensitive as speed rises ------
    const speedAbs = Math.abs(this.forwardSpeed);
    this.steerAngle = input.steer / (1 + speedAbs * 0.16);

    const maxYawRate = T.maxYawRate / (1 + speedAbs * B.yawSpeedFalloff);
    const dir = this.forwardSpeed < 0 ? -1 : 1;
    // No steering authority at a standstill — matches the original's
    // keypad-stepped handling rather than letting the car pivot on the spot.
    this.yaw -= input.steer * maxYawRate * dir * dt * Math.min(1, speedAbs / 2.2);

    // --- Velocity from forward + lateral --------------------------------
    const fwd = this.forward;
    const right = this.right;
    this.velocity.copy(fwd).multiplyScalar(this.forwardSpeed)
      .addScaledVector(right, this.lateralSpeed);

    this.lateralSpeed *= Math.exp(-this.grip * dt);
    if (Math.abs(this.lateralSpeed) < 0.01) this.lateralSpeed = 0;

    // --- Integrate -------------------------------------------------------
    this.position.addScaledVector(this.velocity, dt);
    this.distance += Math.abs(this.forwardSpeed) * dt;

    this._followTerrain(dt);
    this._updateProgress();

    // --- Cosmetic --------------------------------------------------------
    this.wheelSpin += (this.forwardSpeed / WHEEL_RADIUS) * dt;
    for (const w of this.wheels) {
      if (w.steerable) w.pivot.rotation.y = -this.steerAngle * 1.8;
      w.spinner.rotation.x = this.wheelSpin;
    }

    const speedNorm = THREE.MathUtils.clamp(speedAbs / T.maxSpeed, 0, 1);
    const accel = (this.forwardSpeed - prevSpeed) / Math.max(dt, 1e-5);
    this.roll = THREE.MathUtils.lerp(
      this.roll, -input.steer * 0.075 * speedNorm, 1 - Math.exp(-8 * dt));
    this.pitch = THREE.MathUtils.lerp(
      this.pitch, THREE.MathUtils.clamp(-accel * 0.005, -0.045, 0.045), 1 - Math.exp(-6 * dt));

    this.syncMesh();
  }

  // -------------------------------------------------------- terrain/susp ---
  // Body height follows the average of the four contact points; each wheel
  // gets its own spring-damped offset, which is what sells bumps off-road.
  _followTerrain(dt) {
    const s = this.stage;
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);

    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      // Wheel offset rotated into world space.
      const wx = this.position.x + w.x * cos + w.z * sin;
      const wz = this.position.z + w.x * sin - w.z * cos;
      const q = s.query(wx, wz);
      const ground = s.terrainHeight(wx, wz, q);
      const target = ground - this._groundY;   // relative to body height
      // Critically-ish damped spring.
      const a = BASE.suspensionStiffness * (target - this._wheelY[i])
        - BASE.suspensionDamping * this._wheelVy[i];
      this._wheelVy[i] += a * dt;
      this._wheelY[i] += this._wheelVy[i] * dt;
      // Clamp travel so the car never sinks through the ground.
      this._wheelY[i] = THREE.MathUtils.clamp(this._wheelY[i], -0.22, 0.22);
      sum += ground;
    }
    const targetBody = sum / 4;
    this._groundY = THREE.MathUtils.lerp(this._groundY, targetBody, 1 - Math.exp(-16 * dt));
    this.position.y = this._groundY;
  }

  _updateProgress() {
    const s = this.stage;
    const q = s.query(this.position.x, this.position.z);
    this.stageProgress = THREE.MathUtils.clamp(
      (q.index * 5) / Math.max(1, s.length), 0, 1
    );
    if (!this.finished && this.stageProgress >= 0.999) this.finished = true;
  }

  // ------------------------------------------------------ mesh transform ---
  syncMesh() {
    this.group.position.set(this.position.x, this._groundY, this.position.z);
    this.group.rotation.y = this.yaw;
    this.bodyGroup.position.y = this.tuning.rideHeight;
    this.bodyGroup.rotation.z = this.roll;
    this.bodyGroup.rotation.x = this.pitch;
    for (let i = 0; i < 4; i++) {
      this.wheels[i].pivot.position.y = WHEEL_RADIUS + this._wheelY[i];
    }
  }
}
