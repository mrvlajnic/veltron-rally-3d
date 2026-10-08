// input.js — keyboard input handling for arcade rally controls.

export class Input {
  constructor() {
    this.throttle = 0;    // 0..1
    this.brake = 0;       // 0..1 (also reverse when stopped)
    this.steer = 0;       // -1 (left) .. +1 (right)
    this.handbrake = false;
    this.restartRequested = false;
    this.camToggleRequested = false;

    // Edge-triggered menu actions, consumed by the screen layer.
    // `shift` is latched when left/right is pressed while Shift is held
    // (used for Shift+Left/Right = weather select in the garage).
    this.menu = {
      confirm: false,
      back: false,
      left: false,
      right: false,
      up: false,
      down: false,
      shift: false
    };

    this._keys = new Set();

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    // If the window loses focus, keyup events are never delivered — drop the
    // held keys AND re-derive the input state, otherwise the throttle stays
    // stuck on after the player alt-tabs away mid-acceleration.
    window.addEventListener('blur', () => {
      this._keys.clear();
      this._refresh();
    });
  }

  _onKey(e, down) {
    const code = e.code;
    // Prevent page scroll / browser shortcuts for game keys.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      e.preventDefault();
    }

    if (down) {
      // Edge-triggered: ignore OS key-repeat.
      if (e.repeat) { this._refresh(); return; }
      if (code === 'KeyR') this.restartRequested = true;
      if (code === 'KeyC') this.camToggleRequested = true;
      if (code === 'Enter' || code === 'NumpadEnter') this.menu.confirm = true;
      if (code === 'Escape' || code === 'Backspace') this.menu.back = true;
      if (code === 'ArrowLeft' || code === 'KeyA') {
        this.menu.left = true;
        if (e.shiftKey) this.menu.shift = true;
      }
      if (code === 'ArrowRight' || code === 'KeyD') {
        this.menu.right = true;
        if (e.shiftKey) this.menu.shift = true;
      }
      if (code === 'ArrowUp' || code === 'KeyW') this.menu.up = true;
      if (code === 'ArrowDown' || code === 'KeyS') this.menu.down = true;
      this._keys.add(code);
    } else {
      this._keys.delete(code);
    }

    this._refresh();
  }

  _refresh() {
    const k = this._keys;
    this.throttle = (k.has('KeyW') || k.has('ArrowUp')) ? 1 : 0;
    this.brake = (k.has('KeyS') || k.has('ArrowDown')) ? 1 : 0;
    const left = (k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0;
    const right = (k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0;
    // Convention: steer is -1 = left, +1 = right (matches car.js, where
    // positive steer rotates the car toward its +X/right side).
    this.steer = right - left;
    this.handbrake = k.has('Space');
  }

  consumeRestart() {
    const r = this.restartRequested;
    this.restartRequested = false;
    return r;
  }

  consumeCamToggle() {
    const r = this.camToggleRequested;
    this.camToggleRequested = false;
    return r;
  }

  /** Read and clear the edge-triggered menu flags. */
  consumeMenu() {
    // Fallback: Shift held (but e.shiftKey missed due to event ordering)
    // still counts when left/right fires in the same frame.
    const shiftHeld = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    const shift = this.menu.shift || ((this.menu.left || this.menu.right) && shiftHeld);
    const m = {
      confirm: this.menu.confirm,
      back: this.menu.back,
      left: this.menu.left,
      right: this.menu.right,
      up: this.menu.up,
      down: this.menu.down,
      shift,
      // Back-compat alias: main.js previously read `menu.shiftKey`.
      shiftKey: shift
    };
    this.menu.confirm = false;
    this.menu.back = false;
    this.menu.left = false;
    this.menu.right = false;
    this.menu.up = false;
    this.menu.down = false;
    this.menu.shift = false;
    return m;
  }

  /** Drop all held driving keys (used when leaving the race). */
  clearDriving() {
    this._keys.clear();
    this._refresh();
  }
}
