/**
 * Night wind: ambient sound made in the browser with the Web Audio API. No audio files and no
 * samples; every sound below is generated here. No React in this file.
 *
 * Graph:
 *   brown noise -> bandpass (Q 0.8, centre moved 250..900 Hz by a slow LFO) -> wind gain --+
 *   white noise -> highpass 2.5 kHz -> hiss gain ------------------------------------------+
 *   two sines at 55 and 55.4 Hz -> drone gain --------------------------------------------+--> master -> compressor -> out
 *   howl every 18..45 s: sine + detuned triangle -> lowpass 1.2 kHz -> reverb + a little dry
 *   reverb: ConvolverNode with a generated 2.5..3.5 s impulse of decaying stereo noise
 *
 * The master gain never goes above 0.18. It fades in over 2 s and out over 0.6 s, and drops to
 * 0 within 0.3 s while the workspace video plays (`duck`).
 *
 * The AudioContext is created by the first `start()`, which must run inside a click handler
 * (browser autoplay rules). Building a `NightWind` creates nothing.
 */

export const NIGHT_WIND_MAX_GAIN = 0.18;
export const FADE_IN_S = 2;
export const FADE_OUT_S = 0.6;
/** Duck under the video: well inside the 300 ms the brief allows. */
export const DUCK_S = 0.25;
export const RESTORE_S = 1.2;
export const DEFAULT_VOLUME = 0.6;
export const HOWL_MIN_MS = 18_000;
export const HOWL_MAX_MS = 45_000;

type Timer = ReturnType<typeof setTimeout>;

export interface NightWindOptions {
  /** Builds the AudioContext. Called once, on the first `start()`. */
  createContext?: () => AudioContext;
  /** 0 <= n < 1. Injected so tests are repeatable. */
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => Timer;
  clearTimer?: (id: Timer) => void;
}

function defaultContext(): AudioContext {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("This browser cannot play generated sound.");
  return new Ctor();
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Move a param from wherever it is now to `value` in `seconds`, cancelling earlier ramps. */
function rampParam(param: AudioParam, value: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

export class NightWind {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private reverbIn: GainNode | undefined;
  private howlDry: GainNode | undefined;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private volume = DEFAULT_VOLUME;
  private ducked = false;
  private playing = false;
  private howlTimer: Timer | undefined;
  private suspendTimer: Timer | undefined;
  private readonly createContext: () => AudioContext;
  private readonly random: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => Timer;
  private readonly clearTimer: (id: Timer) => void;

  constructor(options: NightWindOptions = {}) {
    this.createContext = options.createContext ?? defaultContext;
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((id) => clearTimeout(id));
  }

  /** True once `start()` has created the AudioContext. */
  get hasContext(): boolean {
    return this.ctx !== undefined;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** The gain the master is heading for right now. */
  get targetGain(): number {
    return this.playing && !this.ducked ? this.volume * NIGHT_WIND_MAX_GAIN : 0;
  }

  /** Start (or resume) the sound. Call it from a click: the first call creates the context. */
  start(): void {
    if (this.playing) return;
    if (!this.ctx) {
      this.ctx = this.createContext();
      this.build(this.ctx);
    }
    this.cancelSuspend();
    this.playing = true;
    if (this.ctx.state !== "running") void this.ctx.resume().catch(() => undefined);
    this.rampMaster(FADE_IN_S);
    this.scheduleHowl();
  }

  /** Fade out over 0.6 s, then suspend the context so it uses no CPU. */
  stop(): void {
    if (!this.playing || !this.ctx) return;
    this.playing = false;
    this.cancelHowl();
    this.rampMaster(FADE_OUT_S);
    const ctx = this.ctx;
    this.cancelSuspend();
    this.suspendTimer = this.setTimer(() => {
      this.suspendTimer = undefined;
      if (!this.playing) void ctx.suspend().catch(() => undefined);
    }, FADE_OUT_S * 1000 + 50);
  }

  /** 0..1 of the 0.18 cap. */
  setVolume(volume: number): void {
    this.volume = clamp01(volume);
    if (this.playing) this.rampMaster(0.15);
  }

  getVolume(): number {
    return this.volume;
  }

  /** While the demo video plays, the wind goes silent so the demo's own audio is clean. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    if (this.playing) this.rampMaster(on ? DUCK_S : RESTORE_S);
  }

  get isDucked(): boolean {
    return this.ducked;
  }

  /** Tab hidden: suspend. Visible again: resume only if the sound is on. */
  pageHidden(hidden: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden) void ctx.suspend().catch(() => undefined);
    else if (this.playing) void ctx.resume().catch(() => undefined);
  }

  dispose(): void {
    this.playing = false;
    this.cancelHowl();
    this.cancelSuspend();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    const ctx = this.ctx;
    this.ctx = undefined;
    this.master = undefined;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  // ---- internals ----

  private rampMaster(seconds: number): void {
    if (!this.ctx || !this.master) return;
    rampParam(this.master.gain, this.targetGain, this.ctx.currentTime, seconds);
  }

  private cancelHowl(): void {
    if (this.howlTimer !== undefined) this.clearTimer(this.howlTimer);
    this.howlTimer = undefined;
  }

  private cancelSuspend(): void {
    if (this.suspendTimer !== undefined) this.clearTimer(this.suspendTimer);
    this.suspendTimer = undefined;
  }

  private scheduleHowl(): void {
    this.cancelHowl();
    const delay = HOWL_MIN_MS + this.random() * (HOWL_MAX_MS - HOWL_MIN_MS);
    this.howlTimer = this.setTimer(() => {
      this.howlTimer = undefined;
      if (!this.playing) return;
      this.howl();
      this.scheduleHowl();
    }, delay);
  }

  private track<T extends AudioScheduledSourceNode>(node: T): T {
    this.sources.add(node);
    node.onended = () => {
      this.sources.delete(node);
    };
    return node;
  }

  /** Integrated white noise (brown noise), looped. */
  private brownNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (this.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  private whiteNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = this.random() * 2 - 1;
    return buffer;
  }

  /** Decaying stereo noise for the reverb, 2.5 to 3.5 s long. */
  private impulse(ctx: AudioContext): AudioBuffer {
    const seconds = 2.5 + this.random();
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (this.random() * 2 - 1) * (1 - i / length) ** 2.5;
    }
    return buffer;
  }

  private loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
    const source = this.track(ctx.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private build(ctx: AudioContext): void {
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(compressor);
    this.master = master;

    const convolver = ctx.createConvolver();
    convolver.buffer = this.impulse(ctx);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.6;
    convolver.connect(reverbOut).connect(master);
    const reverbIn = ctx.createGain();
    reverbIn.connect(convolver);
    this.reverbIn = reverbIn;
    const howlDry = ctx.createGain();
    howlDry.gain.value = 0.25;
    howlDry.connect(master);
    this.howlDry = howlDry;

    // Wind bed: the band centre swings 575 +/- 325 Hz, so 250..900 Hz.
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.8;
    band.frequency.value = 575;
    const lfo = this.track(ctx.createOscillator());
    lfo.type = "sine";
    lfo.frequency.value = 0.05 + this.random() * 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 325;
    lfo.connect(lfoDepth).connect(band.frequency);
    const windGain = ctx.createGain();
    windGain.gain.value = 0.7;
    const wind = this.loop(ctx, this.brownNoise(ctx, 4));
    wind.connect(band).connect(windGain).connect(master);
    const windSend = ctx.createGain();
    windSend.gain.value = 0.15;
    windGain.connect(windSend).connect(reverbIn);

    // Hiss: quieter, high.
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 2500;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.035;
    const hiss = this.loop(ctx, this.whiteNoise(ctx, 2));
    hiss.connect(high).connect(hissGain).connect(master);

    // Drone: two sines 0.4 Hz apart, so they beat slowly.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    droneGain.connect(master);
    const drones = [55, 55.4].map((hz) => {
      const osc = this.track(ctx.createOscillator());
      osc.type = "sine";
      osc.frequency.value = hz;
      osc.connect(droneGain);
      return osc;
    });

    for (const source of [lfo, wind, hiss, ...drones]) source.start();
  }

  /** One distant howl, 3 to 5 s: 330 Hz up to 520 Hz and down to 280 Hz, soft at both ends. */
  private howl(): void {
    const ctx = this.ctx;
    if (!ctx || !this.reverbIn || !this.howlDry) return;
    const now = ctx.currentTime;
    const duration = 3 + this.random() * 2;
    const end = now + duration;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.22, now + 0.8);
    envelope.gain.setValueAtTime(0.22, end - 1.5);
    envelope.gain.linearRampToValueAtTime(0, end);
    envelope.connect(this.reverbIn);
    envelope.connect(this.howlDry);

    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 1200;
    low.connect(envelope);

    const vibrato = this.track(ctx.createOscillator());
    vibrato.frequency.value = 5;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = 6;
    vibrato.connect(vibratoDepth);

    const voices: [OscillatorType, number, number][] = [
      ["sine", 0, 1],
      ["triangle", 9, 0.35],
    ];
    const oscillators = voices.map(([type, detune, level]) => {
      const osc = this.track(ctx.createOscillator());
      osc.type = type;
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.setTargetAtTime(520, now + 0.1, duration * 0.12);
      osc.frequency.setTargetAtTime(280, now + duration * 0.45, duration * 0.18);
      vibratoDepth.connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(low);
      return osc;
    });

    for (const source of [vibrato, ...oscillators]) {
      source.start(now);
      source.stop(end + 0.1);
    }
  }
}
