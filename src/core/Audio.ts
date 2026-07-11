import type { Sfx } from "./types";

/** Tiny procedural sound bus — every sound is synthesized, no asset files. */
export class AudioBus implements Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  enabled = true;
  private musicTimer = 0;
  private musicStep = 0;

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  private tone(opts: {
    f: number;
    f2?: number;
    dur: number;
    type?: OscillatorType;
    gain?: number;
    delay?: number;
    pan?: number;
  }) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.now() + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.f, t);
    if (opts.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f2), t + opts.dur);
    const peak = opts.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    let node: AudioNode = g;
    if (opts.pan !== undefined && this.ctx.createStereoPanner) {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(pan);
      node = pan;
    }
    osc.connect(g);
    node.connect(this.master);
    osc.start(t);
    osc.stop(t + opts.dur + 0.02);
  }

  private noise(opts: { dur: number; gain?: number; f?: number; q?: number; hp?: boolean }) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.now();
    const len = Math.floor(this.ctx.sampleRate * opts.dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.hp ? "highpass" : "lowpass";
    filter.frequency.value = opts.f ?? 1200;
    filter.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + opts.dur + 0.02);
  }

  play(name: string, opts: { volume?: number; rate?: number; pan?: number } = {}) {
    if (!this.ctx || !this.enabled) return;
    const r = opts.rate ?? 1;
    const v = opts.volume ?? 1;
    switch (name) {
      case "kick":
        this.tone({ f: 320 * r, f2: 90, dur: 0.14, type: "square", gain: 0.22 * v, pan: opts.pan });
        this.noise({ dur: 0.08, gain: 0.12 * v, f: 900 });
        break;
      case "kickair":
        this.noise({ dur: 0.14, gain: 0.09 * v, f: 700, hp: true });
        break;
      case "thud":
        this.tone({ f: 160 * r, f2: 60, dur: 0.18, type: "sine", gain: 0.32 * v, pan: opts.pan });
        this.noise({ dur: 0.1, gain: 0.16 * v, f: 500 });
        break;
      case "grab":
        this.tone({ f: 500 * r, f2: 720, dur: 0.06, type: "triangle", gain: 0.14 * v });
        break;
      case "release":
        this.tone({ f: 400 * r, f2: 260, dur: 0.05, type: "triangle", gain: 0.1 * v });
        break;
      case "pop":
        this.tone({ f: 900 * r, f2: 200, dur: 0.09, type: "square", gain: 0.2 * v });
        this.noise({ dur: 0.06, gain: 0.16 * v, f: 2000, hp: true });
        break;
      case "splash":
        this.noise({ dur: 0.28, gain: 0.22 * v, f: 1400 });
        this.tone({ f: 600, f2: 200, dur: 0.2, type: "sine", gain: 0.08 * v });
        break;
      case "bubble":
        this.tone({ f: 500 * r, f2: 900, dur: 0.12, type: "sine", gain: 0.08 * v });
        break;
      case "bounce":
        this.tone({ f: 220 * r, f2: 640, dur: 0.14, type: "triangle", gain: 0.2 * v });
        break;
      case "sizzle":
        this.noise({ dur: 0.5, gain: 0.2 * v, f: 2600, hp: true });
        this.tone({ f: 140, f2: 60, dur: 0.4, type: "sawtooth", gain: 0.1 * v });
        break;
      case "whistle":
        this.tone({ f: 800, f2: 1500, dur: 0.18, type: "sine", gain: 0.18 * v });
        this.tone({ f: 1200, f2: 1900, dur: 0.16, type: "sine", gain: 0.12 * v, delay: 0.05 });
        break;
      case "cheer":
        for (let k = 0; k < 6; k++)
          this.tone({ f: 500 + Math.random() * 700, dur: 0.5, type: "triangle", gain: 0.05 * v, delay: Math.random() * 0.2 });
        break;
      case "click":
        this.tone({ f: 660 * r, dur: 0.04, type: "square", gain: 0.12 * v });
        break;
      case "blip":
        this.tone({ f: 880 * r, f2: 1320, dur: 0.06, type: "triangle", gain: 0.12 * v });
        break;
      case "countdown":
        this.tone({ f: 440 * r, dur: 0.14, type: "square", gain: 0.16 * v });
        break;
      case "go":
        this.tone({ f: 660, f2: 990, dur: 0.3, type: "square", gain: 0.2 * v });
        break;
    }
  }

  // ---- lightweight generative background music (jaunty, loops) -----------
  setMusic(on: boolean) {
    if (!this.enabled) on = false;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.linearRampToValueAtTime(on ? 0.16 : 0.0, this.now() + 0.6);
    }
  }

  updateMusic(dt: number, tempo = 2.6) {
    if (!this.ctx || !this.musicGain || this.musicGain.gain.value < 0.01) return;
    this.musicTimer += dt;
    const beat = 1 / tempo;
    if (this.musicTimer >= beat) {
      this.musicTimer -= beat;
      const bass = BASS[this.musicStep % BASS.length];
      const mel = MEL[this.musicStep % MEL.length];
      this.musicNote(bass, beat * 0.9, "triangle", 0.5);
      if (mel > 0) this.musicNote(mel, beat * 0.6, "square", 0.28);
      this.musicStep++;
    }
  }

  private musicNote(freq: number, dur: number, type: OscillatorType, gain: number) {
    if (!this.ctx || !this.musicGain) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

const N = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// A jaunty little I–V–vi–IV-ish loop
const BASS = [N(45), N(45), N(52), N(52), N(57), N(57), N(50), N(50)];
const MEL = [N(69), N(72), N(76), 0, N(74), N(72), N(69), N(67)];
