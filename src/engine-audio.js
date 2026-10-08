// engine-audio.js — synthesized driving sound: RPM engine, skid, wind.
//
// No audio assets: two detuned oscillators through a lowpass (engine) plus
// one shared noise buffer through a bandpass (skid) and a lowpass (wind).
// Everything is created lazily and every call is guarded, so if WebAudio is
// blocked the game simply runs silent — never an exception, never a hang.
//
// Autoplay policy: the context resumes on keydown/click as well as on
// start(), because the race entry runs inside rAF rather than directly in
// the input event handler.
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.master = null;
    this.engOsc1 = null;
    this.engOsc2 = null;
    this.engFilter = null;
    this.engGain = null;
    this.skidGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.noiseBuf = null;

    if (typeof window !== 'undefined') {
      const resume = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      };
      window.addEventListener('keydown', resume);
      window.addEventListener('click', resume);
    }
  }

  _ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);

      // --- Engine: saw + sub square through a tracking lowpass ---
      this.engFilter = ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 600;
      this.engGain = ctx.createGain();
      this.engGain.gain.value = 0.3;
      this.engFilter.connect(this.engGain);
      this.engGain.connect(this.master);

      this.engOsc1 = ctx.createOscillator();
      this.engOsc1.type = 'sawtooth';
      this.engOsc1.frequency.value = 70;
      this.engOsc1.connect(this.engFilter);
      this.engOsc1.start();

      this.engOsc2 = ctx.createOscillator();
      this.engOsc2.type = 'square';
      this.engOsc2.frequency.value = 35;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      this.engOsc2.connect(subGain);
      subGain.connect(this.engFilter);
      this.engOsc2.start();

      // --- Shared noise buffer for skid + wind ---
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      const skidSrc = ctx.createBufferSource();
      skidSrc.buffer = buf;
      skidSrc.loop = true;
      const skidFilter = ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 900;
      skidFilter.Q.value = 1.0;
      this.skidGain = ctx.createGain();
      this.skidGain.gain.value = 0;
      skidSrc.connect(skidFilter);
      skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.master);
      skidSrc.start();

      const windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.value = 500;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      windSrc.start();

      return true;
    } catch (e) {
      this.ctx = null;
      return false;
    }
  }

  start() {
    if (!this._ensure()) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this.started = true;
      this.master.gain.setTargetAtTime(0.4, this.ctx.currentTime, 0.2);
    } catch (e) { /* silent */ }
  }

  stop() {
    if (!this.ctx) return;
    try {
      this.started = false;
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    } catch (e) { /* silent */ }
  }

  /** @param rpm01 0..~1 engine speed @param throttle01 0..1 */
  setEngine(rpm01, throttle01) {
    if (!this.ctx || !this.started) return;
    try {
      const t = this.ctx.currentTime;
      const rpm = Math.max(0, Math.min(1.1, rpm01));
      const thr = Math.max(0, Math.min(1, throttle01));
      const freq = 55 + rpm * 240 + thr * 25;
      this.engOsc1.frequency.setTargetAtTime(freq, t, 0.03);
      this.engOsc2.frequency.setTargetAtTime(freq * 0.5 + 2, t, 0.03);
      this.engFilter.frequency.setTargetAtTime(400 + rpm * 2600 + thr * 800, t, 0.05);
      this.engGain.gain.setTargetAtTime(0.22 + thr * 0.3 + rpm * 0.1, t, 0.05);
    } catch (e) { /* silent */ }
  }

  /** @param a01 0..1 slide/off-road amount */
  setSkid(a01) {
    if (!this.ctx || !this.started) return;
    try {
      const a = Math.max(0, Math.min(1, a01));
      this.skidGain.gain.setTargetAtTime(a * 0.35, this.ctx.currentTime, 0.06);
    } catch (e) { /* silent */ }
  }

  /** One-shot puddle splash: noise burst sweeping down. @param a01 0..1 */
  splash(a01) {
    if (!this.ctx || !this.started || !this.noiseBuf) return;
    try {
      const ctx = this.ctx;
      const a = Math.max(0, Math.min(1, a01));
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.05 + 0.5 * a, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      f.frequency.exponentialRampToValueAtTime(350, t + 0.45);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.5);
    } catch (e) { /* silent */ }
  }

  /** @param s01 0..1 speed fraction */
  setWind(s01) {
    if (!this.ctx || !this.started) return;
    try {
      const s = Math.max(0, Math.min(1, s01));
      this.windGain.gain.setTargetAtTime(Math.pow(s, 1.5) * 0.5, this.ctx.currentTime, 0.1);
      this.windFilter.frequency.setTargetAtTime(300 + s * 1200, this.ctx.currentTime, 0.1);
    } catch (e) { /* silent */ }
  }
}
