// Every sound in SOLMAR is synthesized with WebAudio: no audio files, no
// network. Engine hum follows speed, the siren swings two tones, the music is
// a small bassline loop. The context only starts after a user gesture, and
// everything here is a no-op until it does, so headless runs stay silent.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.sirenHigh = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Call from a click or key press. Safe to call repeatedly.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngineLoop();
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  startEngineLoop() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 46;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 23;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(g2);
    g2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  // speed01: 0 parked, 1 flat out. driving=false silences the hum.
  setEngine(speed01, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(46 + speed01 * 110, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(23 + speed01 * 55, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const ctx = this.ctx;
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 960 : 720, this.ctx.currentTime, 0.05);
      }, 380);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      try { this.sirenOsc.stop(); } catch (e) {}
      this.sirenOsc.disconnect();
      this.sirenGain.disconnect();
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }

  // Short burst of filtered noise, used for punches and crashes.
  thud(low) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = low ? 0.22 : 0.1;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low ? 300 : 900;
    const g = ctx.createGain();
    g.gain.value = low ? 0.5 : 0.25;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur || 0.12));
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + (dur || 0.12) + 0.02);
  }

  // Little rising arpeggio for mission complete, falling one for busted.
  jingle(up) {
    if (!this.ctx) return;
    const notes = up ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.22), i * 110));
  }

  // Looping bassline: A minor groove, eight steps, plus a soft tick on the
  // off-beat. A timer schedules one step at a time so it stays in time.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [55, 0, 55, 65.41, 0, 49, 0, 55, 55, 0, 55, 65.41, 73.42, 82.41, 65.41, 49];
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      const f = bass[this.musicStep % bass.length];
      if (f) {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = 300;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        o.connect(flt);
        flt.connect(g);
        g.connect(this.master);
        o.start();
        o.stop(ctx.currentTime + 0.24);
      }
      if (this.musicStep % 2 === 1) this.blip(6000, 0.03, 'square', 0.015);
      this.musicStep++;
    }, 240);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
