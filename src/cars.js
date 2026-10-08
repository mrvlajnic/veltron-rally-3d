// cars.js — the Veltron range. Each car is a spec (stats + tuning + livery)
// layered over one shared low-poly rally chassis, mirroring how the original
// shipped four cars off a common body with different proportions.

// Stat bars run 0..1 and drive the garage screen readout, in the original's
// Speed / Acc / Grip order.
export const CARS = [
  {
    id: 'v1',
    name: 'VELTRON V1',
    class: 'BALANCED',
    stats: { speed: 0.55, acc: 0.55, grip: 0.55 },
    tuning: {
      maxSpeed: 34.0,        // m/s ≈ 122 km/h flat out
      accel: 12.0,
      brake: 20.0,
      drag: 0.0007,
      rollingResist: 0.55,
      maxYawRate: 2.35,
      gripRoad: 7.4,
      bodyColor: 0xd94b1f,
      accentColor: 0xf5e9c8,
      wingScale: 1.0,
      rideHeight: 0.0
    }
  },
  {
    id: 'v3',
    name: 'VELTRON V3',
    class: 'GRIP',
    stats: { speed: 0.38, acc: 0.45, grip: 0.92 },
    tuning: {
      maxSpeed: 30.0,        // m/s ≈ 108 km/h flat out
      accel: 11.0,
      brake: 21.0,
      drag: 0.0009,
      rollingResist: 0.6,
      maxYawRate: 2.55,
      gripRoad: 11.5,        // corners far better, tops out slower
      bodyColor: 0x2f6fb5,
      accentColor: 0xf5e9c8,
      wingScale: 1.15,
      rideHeight: -0.03      // sits lower, more planted
    }
  },
{
    id: 'centurion',
    name: 'VELTRON CENTURION',
    class: 'SPEED',
    stats: { speed: 0.95, acc: 0.88, grip: 0.32 },
    tuning: {
      maxSpeed: 41.0,        // m/s ≈ 148 km/h flat out
      accel: 14.5,
      brake: 17.0,
      drag: 0.0005,
      rollingResist: 0.45,
      maxYawRate: 1.95,
      gripRoad: 5.2,
      bodyColor: 0xe0c020,
      accentColor: 0x1a1a1a,
      wingScale: 1.3,
      rideHeight: 0.02
    }
  },
  {
    id: 'hatch',
    name: 'VELTRON HATCH',
    class: 'HOT HATCH',
    stats: { speed: 0.65, acc: 0.7, grip: 0.75 },
    tuning: {
      maxSpeed: 33.0,        // m/s ≈ 119 km/h flat out
      accel: 13.5,
      brake: 22.0,
      drag: 0.0007,
      rollingResist: 0.5,
      maxYawRate: 2.8,
      gripRoad: 8.5,
      bodyColor: 0x1a73e8,
      accentColor: 0xffffff,
      wingScale: 0.8,
      rideHeight: -0.02
    }
  }
];
