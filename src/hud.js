// hud.js — the in-race HUD, deliberately as sparse as the original.
//
// The entire original HUD was: `Km/h:NN` top-left, stage time top-right, and
// a red time penalty beside the clock when you left the road. No minimap, no
// gear, no dial, no lap counter. Extra chrome is added here only where it
// earns its place, and it is styled as a Nokia soft-key bar.

export class HUD {
  constructor() {
    this.speedEl = document.getElementById('hud-speed');
    this.timeEl = document.getElementById('hud-time');
    this.penaltyEl = document.getElementById('hud-penalty');
    this.stageEl = document.getElementById('hud-stage');
    this.root = document.getElementById('hud');
    this._lastSpeed = -1;
    this._lastTime = '';
    this._lastPenalty = '';
  }

  setVisible(on) {
    this.root.classList.toggle('hidden', !on);
  }

  setStageName(name) {
    this.stageEl.textContent = name;
  }

  /**
   * @param {number} speedMs   signed forward speed
   * @param {number} elapsed   raw stage clock in seconds
   * @param {number} penalty   accumulated off-road penalty in seconds
   */
  update(speedMs, elapsed, penalty) {
    const kmh = Math.round(Math.abs(speedMs) * 3.6);
    if (kmh !== this._lastSpeed) {
      this.speedEl.textContent = 'Km/h:' + kmh;
      this._lastSpeed = kmh;
    }

    const t = formatTime(elapsed);
    if (t !== this._lastTime) {
      this.timeEl.textContent = t;
      this._lastTime = t;
    }

    const p = penalty >= 0.05 ? '+' + formatTime(penalty) : '';
    if (p !== this._lastPenalty) {
      this.penaltyEl.textContent = p;
      this.penaltyEl.style.display = p ? 'block' : 'none';
      this._lastPenalty = p;
    }
  }
}

/** Matches the original's SS.t under a minute and M:SS.t over it. */
export function formatTime(seconds) {
  const s = Math.max(0, seconds);
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const rem = s - m * 60;
    return m + ':' + (rem < 10 ? '0' : '') + rem.toFixed(1);
  }
  return s.toFixed(1);
}
