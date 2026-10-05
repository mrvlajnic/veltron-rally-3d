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
      maxSpeed: 27.5,        // m/s — the original topped out around 100 km/h
      accel: 11.0,
      brake: 20.0,
      drag: 0.0022,
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
      maxSpeed: 24.0,
      accel: 10.2,
      brake: 21.0,
      drag: 0.0026,
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
      maxSpeed: 31.5,
      accel: 13.2,
      brake: 17.0,
      drag: 0.0018,
      rollingResist: 0.45,
      maxYawRate: 1.95,
      gripRoad: 5.2,         // oversteers; has to be driven carefully
      bodyColor: 0xe0c020,
      accentColor: 0x1a1a1a,
      wingScale: 1.3,
      rideHeight: 0.02
    }
  }
];
