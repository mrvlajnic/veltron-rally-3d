// camera.js — third-person chase camera, tuned from reference material.
//
// Reference findings that shaped this: the original sat distinctly HIGH, so
// the car's roof, rear window and boot lid were all visible; the car held the
// lower-centre of the frame; the horizon landed around 35-45% down the screen;
// and the camera locked to the car's heading rather than trailing its
// velocity, so the world swung laterally through corners while the car itself
// visibly yawed within the frame during slides.
import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;

    this.back = 6.2;      // metres behind the car
    this.height = 3.4;    // metres above the road — reads the roof, not the bumper
    this.lookAhead = 7.5;
    this.lookHeight = 1.15;

    this.positionLerp = 7.0;
    this.lookLerp = 11.0;

    this._targetPos = new THREE.Vector3();
    this._targetLook = new THREE.Vector3();
    this._smoothedLook = new THREE.Vector3();
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
  }

  update(car, dt) {
    const fwd = car.forward;
    const speed = Math.abs(car.forwardSpeed);

    this._targetPos.copy(car.position).addScaledVector(fwd, -this.back);
    this._targetPos.y = car.position.y + this.height;

    // Rate scales with speed, otherwise the velocity-proportional lag of a
    // fixed lerp pushes the camera kilometres back at top speed and the car
    // shrinks to a speck.
    const rate = this.positionLerp + speed * 0.5;
    this.camera.position.lerp(this._targetPos, 1 - Math.exp(-rate * dt));

    this._targetLook.copy(car.position).addScaledVector(fwd, this.lookAhead);
    this._targetLook.y = car.position.y + this.lookHeight;
    this._smoothedLook.lerp(this._targetLook, 1 - Math.exp(-this.lookLerp * dt));

    this.camera.lookAt(this._smoothedLook);
  }
}
