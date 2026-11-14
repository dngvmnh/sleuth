/**
 * A small stand-in for `AudioContext`, for unit tests only. It makes no sound; it records the
 * nodes built and every value scheduled on an AudioParam, so tests can check the sound design
 * and the fades without a browser.
 */

export interface ParamCall {
  method: "setValueAtTime" | "linearRampToValueAtTime" | "setTargetAtTime" | "cancelScheduledValues";
  args: number[];
}

export class FakeParam {
  value: number;
  readonly calls: ParamCall[] = [];
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push({ method: "setValueAtTime", args: [v, t] });
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push({ method: "linearRampToValueAtTime", args: [v, t] });
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.calls.push({ method: "setTargetAtTime", args: [v, t, c] });
    return this;
  }
  cancelScheduledValues(t: number) {
    this.calls.push({ method: "cancelScheduledValues", args: [t] });
    return this;
  }
  /** The value of the last ramp, and when it ends. */
  lastRamp(): { value: number; at: number } | undefined {
    const ramp = [...this.calls].reverse().find((c) => c.method === "linearRampToValueAtTime");
    return ramp ? { value: ramp.args[0] as number, at: ramp.args[1] as number } : undefined;
  }
}

export class FakeNode {
  readonly connections: unknown[] = [];
  constructor(readonly kind: string) {}
  connect<T>(target: T): T {
    this.connections.push(target);
    return target;
  }
  disconnect() {
    this.connections.length = 0;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
  constructor() {
    super("gain");
  }
}

export class FakeFilter extends FakeNode {
  type = "lowpass";
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  constructor() {
    super("biquad");
  }
}

export class FakeSource extends FakeNode {
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

export class FakeOscillator extends FakeSource {
  type = "sine";
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  constructor() {
    super("oscillator");
  }
}

export class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  constructor() {
    super("buffer-source");
  }
}

export class FakeBuffer {
  private readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number) {
    return this.data[channel] as Float32Array;
  }
}

export class FakeConvolver extends FakeNode {
  buffer: FakeBuffer | null = null;
  constructor() {
    super("convolver");
  }
}

export class FakeAudioContext {
  static created: FakeAudioContext[] = [];
  state: "running" | "suspended" | "closed" = "suspended";
  currentTime = 0;
  /** Low, so the generated buffers stay small in tests. */
  readonly sampleRate = 3000;
  readonly destination = new FakeNode("destination");
  readonly nodes: FakeNode[] = [];
  readonly buffers: FakeBuffer[] = [];
  resumeCalls = 0;
  suspendCalls = 0;

  constructor() {
    FakeAudioContext.created.push(this);
  }

  private add<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this.add(new FakeGain());
  }
  createBiquadFilter() {
    return this.add(new FakeFilter());
  }
  createOscillator() {
    return this.add(new FakeOscillator());
  }
  createBufferSource() {
    return this.add(new FakeBufferSource());
  }
  createConvolver() {
    return this.add(new FakeConvolver());
  }
  createDynamicsCompressor() {
    return this.add(new FakeNode("compressor"));
  }
  createBuffer(channels: number, length: number, rate: number) {
    const buffer = new FakeBuffer(channels, length, rate);
    this.buffers.push(buffer);
    return buffer;
  }
  resume() {
    this.resumeCalls++;
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.suspendCalls++;
    this.state = "suspended";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }

  of<T extends FakeNode>(kind: new () => T): T[] {
    return this.nodes.filter((n): n is T => n instanceof kind);
  }
  /** The master gain: the gain node wired straight into the compressor. */
  master(): FakeGain {
    const compressor = this.nodes.find((n) => n.kind === "compressor");
    const master = this.of(FakeGain).find((g) => g.connections.includes(compressor));
    if (!master) throw new Error("no master gain");
    return master;
  }
}

/** A factory for `NightWind`, typed as the real thing. */
export function fakeContextFactory(): () => AudioContext {
  return () => new FakeAudioContext() as unknown as AudioContext;
}
