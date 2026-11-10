/**
 * DeshiWave DSP - Golden Era Analog Cassette Effect (Kishore Kumar / Vintage HMV Vibe)
 * Warm analog tape head bump (195 Hz), silky smooth tape roll-off (12.8 kHz),
 * asymmetric magnetic tape saturation with even & odd harmonic warmth,
 * slow organic capstan wow drift (0.5 Hz), and subtle wooden cabinet ambience.
 */

export class Cassette90sEffect {
  public input: GainNode;
  public output: GainNode;

  private ctx: AudioContext;
  private dryGain: GainNode;
  private wetGain: GainNode;

  // Subsonic rumble filter (keeps all deep musical bass intact)
  private rumbleFilter: BiquadFilterNode;

  // Analog Tape Head Bump (+3.2 dB at 195 Hz - Kishore Kumar chest warmth)
  private headBumpFilter: BiquadFilterNode;

  // Sweet Vocal Presence Peak (3.2 kHz)
  private vocalPresenceFilter: BiquadFilterNode;

  // Silky High-Frequency Tape Smoothing (12.8 kHz gentle roll-off)
  private tapeRollOffFilter: BiquadFilterNode;

  // Magnetic Tape Saturation WaveShaper
  private saturator: WaveShaperNode;

  // Slow Organic Tape Capstan Wow (0.5 Hz gentle drift)
  private wowDelay: DelayNode;
  private wowLFO: OscillatorNode;
  private wowGain: GainNode;

  // Subtle Vintage Cabinet / Radio Space (gentle wooden room reflections)
  private cabinetDelay: DelayNode;
  private cabinetFilter: BiquadFilterNode;
  private cabinetGain: GainNode;

  // Analog Tape Air / Hiss Loop
  private hissSource: AudioBufferSourceNode | null = null;
  private hissGain: GainNode;
  private isTransportRunning: boolean = false;
  private targetHissDb: number = -46; // Soft, unobtrusive vintage analog bed

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    // 1. Subsonic Rumble Highpass (45 Hz, preserves deep bass and warmth)
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'highpass';
    this.rumbleFilter.frequency.value = 45;
    this.rumbleFilter.Q.value = 0.707;

    // 2. Analog Tape Head Bump Filter: +3.2 dB around 195 Hz
    // This provides the signature velvety, full baritone warmth of Kishore Kumar's classic vocals
    this.headBumpFilter = ctx.createBiquadFilter();
    this.headBumpFilter.type = 'peaking';
    this.headBumpFilter.frequency.value = 195;
    this.headBumpFilter.Q.value = 0.95;
    this.headBumpFilter.gain.value = 3.2;

    // 3. Vintage Tube Vocal Presence (3.2 kHz, gentle +1.8 dB)
    this.vocalPresenceFilter = ctx.createBiquadFilter();
    this.vocalPresenceFilter.type = 'peaking';
    this.vocalPresenceFilter.frequency.value = 3200;
    this.vocalPresenceFilter.Q.value = 1.1;
    this.vocalPresenceFilter.gain.value = 1.8;

    // 4. Silky High-Frequency Tape Smoothing: 12.8 kHz lowpass
    // Removes digital harshness while keeping vocals clear, airy, and high fidelity
    this.tapeRollOffFilter = ctx.createBiquadFilter();
    this.tapeRollOffFilter.type = 'lowpass';
    this.tapeRollOffFilter.frequency.value = 12800;
    this.tapeRollOffFilter.Q.value = 0.707;

    // 5. Magnetic Tape Saturation (warm analog non-linear curve)
    this.saturator = ctx.createWaveShaper();
    this.saturator.oversample = '4x';
    this.updateSaturationCurve(2.8);

    // 6. Slow Organic Tape Capstan Wow (0.48 Hz drift, subtle ±0.35ms)
    this.wowDelay = ctx.createDelay(0.04);
    this.wowDelay.delayTime.value = 0.0035; // 3.5ms base delay

    this.wowLFO = ctx.createOscillator();
    this.wowLFO.type = 'sine';
    this.wowLFO.frequency.value = 0.48; // Gentle, organic analog tape drift

    this.wowGain = ctx.createGain();
    this.wowGain.gain.value = 0.00035; // ±0.35ms smooth modulation

    this.wowLFO.connect(this.wowGain);
    this.wowGain.connect(this.wowDelay.delayTime);
    this.wowLFO.start();

    // 7. Subtle Wooden Cabinet Acoustic Space (24ms warm reflection)
    this.cabinetDelay = ctx.createDelay(0.06);
    this.cabinetDelay.delayTime.value = 0.024;

    this.cabinetFilter = ctx.createBiquadFilter();
    this.cabinetFilter.type = 'lowpass';
    this.cabinetFilter.frequency.value = 4200;

    this.cabinetGain = ctx.createGain();
    this.cabinetGain.gain.value = 0.16; // Subtle room acoustic presence

    // 8. Low-level Analog Tape Hiss Loop
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0.004; // Very gentle default
    this.initHissLoop();

    // Routing Graph:
    // Dry: input -> dryGain -> output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet: input -> rumble -> headBump -> vocalPresence -> tapeRollOff -> saturator -> wowDelay -> wetGain -> output
    this.input.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.headBumpFilter);
    this.headBumpFilter.connect(this.vocalPresenceFilter);
    this.vocalPresenceFilter.connect(this.tapeRollOffFilter);
    this.tapeRollOffFilter.connect(this.saturator);
    this.saturator.connect(this.wowDelay);

    // Cabinet acoustic spatial reflection branch
    this.saturator.connect(this.cabinetDelay);
    this.cabinetDelay.connect(this.cabinetFilter);
    this.cabinetFilter.connect(this.cabinetGain);
    this.cabinetGain.connect(this.wetGain);

    this.wowDelay.connect(this.wetGain);

    // Hiss into wet
    this.hissGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.setDryWet(0.92);
  }

  private updateSaturationCurve(drive: number) {
    const samples = 4096;
    const curve = new Float32Array(samples);
    const k = Math.max(1.0, drive);

    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      // Rich analog tape model: subtle 2nd harmonic warmth (x + 0.12*x^2)
      // smoothed by soft tanh compression without harsh digital clipping
      const analogSignal = x + 0.12 * x * x - 0.04 * x * x * x;
      curve[i] = Math.tanh(k * analogSignal) / Math.tanh(k);
    }

    this.saturator.curve = curve;
  }

  private initHissLoop() {
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // Filtered soothing pink noise (1/f)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      data[i] = (b0 + b1 + b2 + b3 + b4) * 0.035;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.hissGain);
    source.start();
    this.hissSource = source;
  }

  public setTransportState(running: boolean) {
    this.isTransportRunning = running;
    const linearGain = running ? Math.pow(10, this.targetHissDb / 20) : 0.0;
    this.hissGain.gain.setTargetAtTime(linearGain, this.ctx.currentTime, 0.06);
  }

  public setDryWet(wet: number) {
    const val = Math.max(0.0, Math.min(1.0, wet));
    const angle = val * (Math.PI / 2);
    this.dryGain.gain.setValueAtTime(Math.cos(angle), this.ctx.currentTime);
    this.wetGain.gain.setValueAtTime(Math.sin(angle), this.ctx.currentTime);
  }

  public setWarmth(db: number) {
    // Controls the low-mid tape head bump (195 Hz)
    const val = Math.max(0, Math.min(8.0, db));
    this.headBumpFilter.gain.setValueAtTime(val, this.ctx.currentTime);
  }

  public setTapeRollOff(freqHz: number) {
    const freq = Math.max(8000, Math.min(16000, freqHz));
    this.tapeRollOffFilter.frequency.setValueAtTime(freq, this.ctx.currentTime);
  }

  public setDrive(drive: number) {
    this.updateSaturationCurve(Math.max(1.0, Math.min(6.0, drive)));
  }

  public setFlutterDepth(depth: number) {
    // 0.0 to 1.0 maps to ±0.1ms to ±0.8ms
    const d = Math.max(0.0, Math.min(1.0, depth));
    this.wowGain.gain.setValueAtTime(d * 0.0006, this.ctx.currentTime);
  }

  public setCabinetSpace(amount: number) {
    const val = Math.max(0.0, Math.min(0.4, amount));
    this.cabinetGain.gain.setValueAtTime(val, this.ctx.currentTime);
  }

  public setHissVolume(volDb: number) {
    this.targetHissDb = volDb;
    if (this.isTransportRunning) {
      const linear = Math.pow(10, volDb / 20);
      this.hissGain.gain.setValueAtTime(linear, this.ctx.currentTime);
    }
  }

  public playMechanicalClunk() {
    // Soft, authentic mechanical cassette relay clunk
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.07);

    oscGain.gain.setValueAtTime(0.25, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(oscGain);
    oscGain.connect(this.output);

    osc.start(now);
    osc.stop(now + 0.09);
  }
}
