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

// Arcade gearbox: upshift points as fractions of top speed. Gears only shape
// the torque curve and the engine note — top speed is unchanged.
const GEAR_UP = [0.30, 0.48, 0.66, 0.84];
const GEAR_TORQUE = [1.0, 0.97, 0.93, 0.89, 0.85];

// Scratch object for wheel world positions (no per-frame allocation).
const _ww = { x: 0, z: 0 };

// Shared fade textures for faked light: beam cones fade apex→tip along
// their height, the road pool fades center→edge. Hard additive edges are
// what made them read as solid geometry instead of light.
let _beamFadeTex = null;
function beamFadeTexture() {
  if (_beamFadeTex) return _beamFadeTex;
  const c = document.createElement('canvas');
  c.width = 1; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 64);
  _beamFadeTex = new THREE.CanvasTexture(c);
  return _beamFadeTex;
}

let _poolFadeTex = null;
function poolFadeTexture() {
  if (_poolFadeTex) return _poolFadeTex;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.7, '#888888');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  _poolFadeTex = new THREE.CanvasTexture(c);
  return _poolFadeTex;
}

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
    this._steerSm = 0;         // smoothed steer: full lock takes ~1/9 s to build
    this.gear = 1;             // 1..5 forward, 0 = reverse
    this.shiftTimer = 0;       // torque-cut timer after an upshift
    this.rpm = 0.18;           // 0..1, drives the engine audio
    this.slideVis = 0;         // smoothed visual slide angle
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
      color: 0x22384a, flatShading: true, transparent: true, opacity: 0.78
    });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2, flatShading: true });
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
    // Dark interior tub so the tinted glass reads as a cabin, not a void.
    add(new THREE.BoxGeometry(1.20, 0.42, 1.60), dark, 0, 1.02, 0.26);
    // Works livery: accent stripes over bonnet, roof and rear deck. They dive
    // under the bulge and scoop, which reads as intentional layering.
    add(new THREE.BoxGeometry(0.52, 0.03, 1.05), accent, 0, 0.915, -1.25);
    add(new THREE.BoxGeometry(0.52, 0.03, 1.55), accent, 0, 1.405, 0.26);
    add(new THREE.BoxGeometry(0.52, 0.03, 0.50), accent, 0, 0.795, 1.50);
    // White sunstrip across the top of the windshield + door plates.
    add(new THREE.BoxGeometry(1.24, 0.14, 0.04), white, 0, 1.32, -0.775, 0.30);
    add(new THREE.BoxGeometry(0.02, 0.50, 0.70), white, -0.815, 0.62, 0.10);
    add(new THREE.BoxGeometry(0.02, 0.50, 0.70), white, 0.815, 0.62, 0.10);
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
    // Night headlight beams + road pool. The world is unlit, so a real
    // spotlight would only ever reach the car itself — faked with additive
    // cones instead, same trick as the contact-shadow blob.
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffedb8, transparent: true, opacity: 0.14,
      alphaMap: beamFadeTexture(),
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: false
    });
    const beamGeo = new THREE.ConeGeometry(1.5, 12, 12, 1, true);
    beamGeo.translate(0, -6, 0);   // apex at the lamp, opening forward
    this._beamL = new THREE.Mesh(beamGeo, beamMat);
    this._beamL.position.set(-0.50, 0.66, -2.0);
    this._beamL.rotation.x = Math.PI / 2 - 0.055;   // tip lands on the road ~12 m out
    this._beamL.visible = false;
    this._beamR = this._beamL.clone();
    this._beamR.position.x = 0.50;
    this.bodyGroup.add(this._beamL);
    this.bodyGroup.add(this._beamR);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffedb8, transparent: true, opacity: 0.16,
        alphaMap: poolFadeTexture(),
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.07, -8.0);
    pool.scale.set(2.8, 7.0, 1);
    pool.visible = false;
    this.group.add(pool);
    this._pool = pool;
    // Flared arches — reads as a rally car at low poly count.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(new THREE.BoxGeometry(0.16, 0.30, 1.00), body,
          sx * 0.80, 0.62, sz * 1.34);
      }
    }
    // Door mirrors.
    add(new THREE.BoxGeometry(0.16, 0.09, 0.14), body, -0.86, 1.12, -0.45);
    add(new THREE.BoxGeometry(0.16, 0.09, 0.14), body, 0.86, 1.12, -0.45);
    // Roof antenna.
    add(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 5), dark, 0.45, 1.575, 0.90);
    // Front splitter + rear diffuser.
    add(new THREE.BoxGeometry(1.66, 0.08, 0.45), dark, 0, 0.22, -1.95);
    add(new THREE.BoxGeometry(1.60, 0.10, 0.30), dark, 0, 0.24, 1.98);
    // Twin exhausts poking past the rear bumper.
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.30, 8), dark, -0.45, 0.30, 1.98, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.30, 8), dark, 0.45, 0.30, 1.98, Math.PI / 2);

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

      // Five dark spokes on the outboard face: the one part that makes
      // wheelspin visible (smooth cylinders show no rotation).
      const outer = Math.sign(p.x);
      for (let k = 0; k < 5; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.60, 0.12), dark);
        spoke.position.x = outer * 0.17;
        spoke.rotation.x = (k / 5) * Math.PI * 2;
        spinner.add(spoke);
      }

      // Mudflap hung behind each wheel.
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.30, 0.05), dark);
      flap.position.set(p.x, 0.30, p.z + 0.45);
      this.bodyGroup.add(flap);

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
    this._mats.lamp = lamp;
    this._mats.tail = tail;
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

  /** Night mode: headlight beams + glowing lamps. Off = pure day look. */
  setNightLights(on) {
    if (this._beamL) this._beamL.visible = on;
    if (this._beamR) this._beamR.visible = on;
    if (this._pool) this._pool.visible = on;
    if (this._mats.lamp) this._mats.lamp.emissive.setHex(on ? 0xffdf8a : 0x000000);
    if (this._mats.tail) this._mats.tail.emissive.setHex(on ? 0x991111 : 0x000000);
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
    this._steerSm = 0;
    this.gear = 1;
    this.shiftTimer = 0;
    this.rpm = 0.18;
    this.slideVis = 0;
    this.steerAngle = 0;
    this.pitch = 0;
    this.roll = 0;
    this.offRoad = false;
    this.surface = SURFACE.ROAD;
    this.grip = this.tuning.gripRoad;
    this.finished = false;
    this._groundY = s.surfaceHeight(s.startPos.x, s.startPos.z);
    for (let i = 0; i < 4; i++) { this._wheelY[i] = 0; this._wheelVy[i] = 0; }
    this.syncMesh();
  }

  // -------------------------------------------------------------- update ---
  update(dt, input) {
    const T = this.tuning;
    const B = BASE;

    // --- Surface (averaged over the four contact patches) ----------------
    // Straddling the road edge now reads partial grip instead of the
    // binary center sample, so running wide onto the verge is progressive.
    let gripSum = 0, rollSum = 0;
    for (let i = 0; i < 4; i++) {
      const wp = this._wheelWorld(i, _ww);
      const wq = this.stage.query(wp.x, wp.z);
      const wVerge = wq.surface === SURFACE.VERGE;
      const wOff = wq.surface !== SURFACE.ROAD;
      gripSum += wOff ? (wVerge ? B.gripVerge : B.gripGrass) : T.gripRoad;
      rollSum += wOff
        ? (wVerge ? B.vergeRollingResist : B.grassRollingResist)
        : T.rollingResist;
    }
    const baseGrip = gripSum / 4;
    const rolling = rollSum / 4;

    const q = this.stage.query(this.position.x, this.position.z);
    this.surface = q.surface;
    this.offRoad = q.surface !== SURFACE.ROAD;

    // Leaving the road accrues a time penalty — the defining rule of the
    // original. Grass stays drivable, so cutting a corner is a real trade.
    if (this.offRoad) this.timePenalty += B.offRoadPenaltyPerSec * dt;

    // --- Grade + crest: climbs pull back, descents push, brows unload ----
    const fwdQ = this.forward;
    const yAhead = this.stage.query(
      this.position.x + fwdQ.x * 6, this.position.z + fwdQ.z * 6).y;
    const yBehind = this.stage.query(
      this.position.x - fwdQ.x * 6, this.position.z - fwdQ.z * 6).y;
    const grade = (yAhead - yBehind) / 12;
    const curve = (yAhead - 2 * q.y + yBehind) / 6;
    const loadScale = THREE.MathUtils.clamp(1 + curve * 2.0, 0.78, 1.1);

    // --- Slip-lite: past ~10 degrees of slide the tyres give up gracefully
    const slideAngle = Math.atan2(
      Math.abs(this.lateralSpeed), Math.abs(this.forwardSpeed) + 3);
    const slideDeg = slideAngle * 180 / Math.PI;
    const slideScale = 1 - 0.35 * THREE.MathUtils.smoothstep(slideDeg, 8, 26);

    this.grip = (input.handbrake ? B.gripHandbrake : baseGrip)
      * loadScale * slideScale;

    // --- Longitudinal ----------------------------------------------------
    const prevSpeed = this.forwardSpeed;
    this._updateGears(dt, input);

    if (input.throttle > 0) {
      const t = THREE.MathUtils.clamp(this.forwardSpeed / T.maxSpeed, 0, 1);
      this.forwardSpeed += T.accel * this._torqueMult() * (1 - Math.pow(t, 2.2)) * dt;
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
    // Gravity along the slope: real g, so a 10% climb costs ~1 m/s^2.
    this.forwardSpeed -= 9.81 * grade * dt;

    // Downhill runs may overspeed slightly past nominal top speed.
    const vMaxEff = T.maxSpeed * (1 + Math.min(0.15, Math.max(0, -grade * 1.5)));
    this.forwardSpeed = THREE.MathUtils.clamp(this.forwardSpeed, B.maxReverse, vMaxEff);
    if (Math.abs(this.forwardSpeed) < 0.02 && !input.throttle && !input.brake) {
      this.forwardSpeed = 0;
    }

    // --- Steering: ramped (not instant) and less sensitive as speed rises.
    // Full lock takes a fraction of a second to build, so flicking the keys
    // upsets the car less but precise lines need anticipation. Releasing the
    // keys unwinds slightly faster than turning in.
    const steerRate = input.steer !== 0 ? 9 : 13;
    this._steerSm += (input.steer - this._steerSm) * (1 - Math.exp(-steerRate * dt));
    if (Math.abs(this._steerSm) < 0.001 && input.steer === 0) this._steerSm = 0;
    const steer = this._steerSm;

    const speedAbs = Math.abs(this.forwardSpeed);
    this.steerAngle = steer / (1 + speedAbs * 0.16);

    // Handbrake rotates the car harder — the way to swing through hairpins.
    const yawBoost = input.handbrake ? 1.35 : 1;
    const maxYawRate = T.maxYawRate * yawBoost / (1 + speedAbs * B.yawSpeedFalloff);
    const dir = this.forwardSpeed < 0 ? -1 : 1;
    // No steering authority at a standstill — matches the original's
    // keypad-stepped handling rather than letting the car pivot on the spot.
    this.yaw -= steer * maxYawRate * dir * dt * Math.min(1, speedAbs / 2.2);

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
      this.roll, -this._steerSm * 0.075 * speedNorm, 1 - Math.exp(-8 * dt));
    this.pitch = THREE.MathUtils.lerp(
      this.pitch, THREE.MathUtils.clamp(-accel * 0.005, -0.045, 0.045), 1 - Math.exp(-6 * dt));

    // Visual drift posture: nose tucks into the slide.
    const slideTarget = THREE.MathUtils.clamp(this.lateralSpeed / 8, -0.5, 0.5);
    this.slideVis += (slideTarget - this.slideVis) * (1 - Math.exp(-6 * dt));

    this.syncMesh();
  }

  /**
   * Wheel contact point in world space. Local +X is right, local -Z is
   * forward; three.js Y-rotation maps (lx,lz) to
   * (lx*cos + lz*sin, -lx*sin + lz*cos).
   */
  _wheelWorld(i, out) {
    const w = this.wheels[i];
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    out.x = this.position.x + w.x * cos + w.z * sin;
    out.z = this.position.z - w.x * sin + w.z * cos;
    return out;
  }

  // -------------------------------------------------------- terrain/susp ---
  // Body height follows the average of the four contact points; each wheel
  // gets its own spring-damped offset, which is what sells bumps off-road.
  // Heights come from surfaceHeight (the VISIBLE surface), not terrainHeight
  // (the dirt tucked under the road ribbon).
  _followTerrain(dt) {
    const s = this.stage;

    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const wp = this._wheelWorld(i, _ww);
      const wx = wp.x, wz = wp.z;
      const q = s.query(wx, wz);
      const ground = s.surfaceHeight(wx, wz, q);
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

  // ---------------------------------------------------------- gearbox ----
  // Arcade gears: each gear carries less torque than the last and every
  // upshift under throttle cuts torque briefly — that stepped pull plus the
  // matching engine note is what makes acceleration feel non-linear.
  _updateGears(dt, input) {
    const T = this.tuning;
    const v = this.forwardSpeed;
    if (v < -0.5) {
      this.gear = 0;
      this.shiftTimer = 0;
    } else {
      const f = v / T.maxSpeed;
      let want = 1;
      for (let g = 0; g < GEAR_UP.length; g++) {
        if (f > GEAR_UP[g]) want = g + 2;
      }
      want = Math.min(5, want);
      if (want < this.gear) {
        // Downshift with hysteresis so it never hunts at a boundary.
        const lo = this.gear <= 1 ? 0 : GEAR_UP[this.gear - 2] - 0.06;
        if (f < lo) this.gear = Math.max(1, want);
      } else if (want > this.gear && this.gear >= 1) {
        this.gear = want;
        if (input.throttle > 0) this.shiftTimer = 0.22;
      } else if (this.gear < 1) {
        this.gear = 1;
      }
    }
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    // RPM for the engine audio: climbs through each gear, drops on shift.
    if (this.gear === 0) {
      this.rpm = 0.3;
    } else if (v < 0.5 && input.throttle <= 0) {
      this.rpm = 0.18;
    } else {
      const lo = this.gear <= 1 ? 0 : GEAR_UP[this.gear - 2] * T.maxSpeed;
      const hi = this.gear >= 5 ? T.maxSpeed : GEAR_UP[this.gear - 1] * T.maxSpeed;
      const r = THREE.MathUtils.clamp((v - lo) / Math.max(1, hi - lo), 0, 1);
      this.rpm = Math.min(1.05, 0.3 + 0.7 * r + (input.throttle > 0 ? 0.04 : 0));
    }
  }

  _torqueMult() {
    const m = GEAR_TORQUE[Math.max(1, this.gear) - 1] || 0.85;
    return this.shiftTimer > 0 ? m * 0.25 : m;
  }

  // ------------------------------------------------------ mesh transform ---
  syncMesh() {
    this.group.position.set(this.position.x, this._groundY, this.position.z);
    this.group.rotation.y = this.yaw;
    this.bodyGroup.position.y = this.tuning.rideHeight;
    this.bodyGroup.rotation.y = this.slideVis * 0.5;
    this.bodyGroup.rotation.z = this.roll;
    this.bodyGroup.rotation.x = this.pitch;
    for (let i = 0; i < 4; i++) {
      this.wheels[i].pivot.position.y = WHEEL_RADIUS + this._wheelY[i];
    }
  }
}
