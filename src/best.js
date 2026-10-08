// best.js — time-trial records: best times + ghost replays per stage/car.
//
// Storage is injected (defaults to window.localStorage, guarded everywhere),
// so a missing or quota-exhausted store just means "no records" — never a
// crash, never a hang. Ghost points are [x, y, z, yaw] sampled every REC_STEP
// seconds; mountain-length runs stay well under quota.

export const REC_STEP = 0.1;

function keyFor(stageId, carId) {
  return 'veltron.best.v1.' + stageId + '.' + carId;
}

/** Shortest-arc interpolated ghost pose at time t. Null when empty. */
export function sampleGhost(data, t) {
  if (!data || !data.pts || !data.pts.length) return null;
  const step = data.step || REC_STEP;
  const pts = data.pts;
  const f = Math.max(0, t / step);
  const i0 = Math.min(pts.length - 1, Math.floor(f));
  const i1 = Math.min(pts.length - 1, i0 + 1);
  const fr = Math.min(1, f - i0);
  const a = pts[i0], b = pts[i1];
  let dy = b[3] - a[3];
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  return {
    x: a[0] + (b[0] - a[0]) * fr,
    y: a[1] + (b[1] - a[1]) * fr,
    z: a[2] + (b[2] - a[2]) * fr,
    yaw: a[3] + dy * fr
  };
}

export class BestStore {
  constructor(storage) {
    this.s = storage !== undefined ? storage
      : (typeof window !== 'undefined' ? window.localStorage : null);
  }

  load(stageId, carId) {
    if (!this.s) return null;
    try {
      const raw = this.s.getItem(keyFor(stageId, carId));
      if (!raw) return null;
      const e = JSON.parse(raw);
      if (!e || typeof e.total !== 'number' || !e.ghost || !Array.isArray(e.ghost.pts)) return null;
      return e;
    } catch (err) {
      return null;
    }
  }

  save(stageId, carId, entry) {
    if (!this.s) return false;
    try {
      this.s.setItem(keyFor(stageId, carId), JSON.stringify(entry));
      return true;
    } catch (err) {
      return false;   // quota / private mode — records simply don't persist
    }
  }
}
