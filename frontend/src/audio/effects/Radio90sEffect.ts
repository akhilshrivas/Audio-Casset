/**
 * DeshiWave DSP - Vividh Bharati Golden Radio Effect (Classic Transistor Vibe)
 * Warm broadcast frequency contour (85 Hz to 9.2 kHz), resonant 1.4 kHz wooden cabinet speaker body,
 * smooth germanium transistor warmth, and subtle vintage heterodyne broadcast dial tone.
 */

export class Radio90sEffect {
  public input: GainNode;
  public output: GainNode;

  private ctx: AudioContext;
  private dryGain: GainNode;
  private wetGain: GainNode;

  // Speaker & Broadcast Bandpass Filters
  private highpassFilter: BiquadFilterNode;
  private lowpassFilter: BiquadFilterNode;
  private cabinetResonance: BiquadFilterNode;
  private radioWarmthFilter: BiquadFilterNode;

  // Transistor Overdrive / Soft Compression
  private distortionNode: WaveShaperNode;

  // Heterodyne Whistle & Static Air
  private carrierOsc: OscillatorNode | null = null;
  private carrierGain: GainNode;
  private staticGain: GainNode;
  private staticSource: AudioBufferSourceNode | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    // 1. Highpass at 85 Hz (keeps the rich male baritone voice of classic singers)
    this.highpassFilter = ctx.createBiquadFilter();
    this.highpassFilter.type = 'highpass';
    this.highpassFilter.frequency.value = 85;
    this.highpassFilter.Q.value = 0.707;

    // 2. Broadcast High-cut Filter at 9200 Hz
    // Retains vocal presence while giving that golden radio broadcast air
    this.lowpassFilter = ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 9200;
    this.lowpassFilter.Q.value = 0.85;

    // 3. Resonant Wooden Cabinet Speaker Peak (1450 Hz, +3.5 dB, Q: 1.4)
    this.cabinetResonance = ctx.createBiquadFilter();
    this.cabinetResonance.type = 'peaking';
    this.cabinetResonance.frequency.value = 1450;
    this.cabinetResonance.gain.value = 3.5;
    this.cabinetResonance.Q.value = 1.4;

    // 4. Radio Chest Warmth Peak (240 Hz, +2.5 dB)
    this.radioWarmthFilter = ctx.createBiquadFilter();
    this.radioWarmthFilter.type = 'peaking';
    this.radioWarmthFilter.frequency.value = 240;
    this.radioWarmthFilter.gain.value = 2.5;
    this.radioWarmthFilter.Q.value = 1.1;

    // 5. Germanium Transistor Soft Overdrive WaveShaper
    this.distortionNode = ctx.createWaveShaper();
    this.distortionNode.oversample = '4x';
    this.updateTransistorCurve(3.2);

    // 6. Heterodyne Dial Sine Tone (sweet 9.8 kHz carrier, very subtle)
    this.carrierGain = ctx.createGain();
    this.carrierGain.gain.value = 0.002;

    this.carrierOsc = ctx.createOscillator();
    this.carrierOsc.type = 'sine';
    this.carrierOsc.frequency.value = 9800;
    this.carrierOsc.connect(this.carrierGain);
    this.carrierOsc.start();

    // 7. Subtle Radio Atmospheric Air Generator
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0.003;
    this.initRadioAirBuffer();

    // Graph Wiring:
    // Dry
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet: input -> HP -> Warmth -> Cabinet -> Distortion -> LP -> wetGain -> output
    this.input.connect(this.highpassFilter);
    this.highpassFilter.connect(this.radioWarmthFilter);
    this.radioWarmthFilter.connect(this.cabinetResonance);
    this.cabinetResonance.connect(this.distortionNode);
    this.distortionNode.connect(this.lowpassFilter);
    this.lowpassFilter.connect(this.wetGain);

    // Static & Carrier Whistle mixed gently into wet
    this.carrierGain.connect(this.wetGain);
    this.staticGain.connect(this.wetGain);

    this.wetGain.connect(this.output);
    this.setDryWet(0.90);
  }

  private updateTransistorCurve(amount: number) {
    const samples = 4096;
    const curve = new Float32Array(samples);
    const k = amount;

    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      // Musical vintage germanium diode model with soft saturation
      const shaped = x + 0.1 * x * x;
      curve[i] = Math.tanh(k * shaped) / Math.tanh(k);
    }

    this.distortionNode.curve = curve;
  }

  private initRadioAirBuffer() {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      if (Math.random() < 0.001) {
        data[i] = (Math.random() * 2 - 1) * 0.3;
      } else {
        data[i] = (Math.random() * 2 - 1) * 0.015;
      }
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.staticGain);
    src.start();
    this.staticSource = src;
  }

  public setDryWet(wet: number) {
    const val = Math.max(0.0, Math.min(1.0, wet));
    const angle = val * (Math.PI / 2);
    this.dryGain.gain.setValueAtTime(Math.cos(angle), this.ctx.currentTime);
    this.wetGain.gain.setValueAtTime(Math.sin(angle), this.ctx.currentTime);
  }

  public setDrive(drive: number) {
    this.updateTransistorCurve(Math.max(1.0, Math.min(8.0, drive)));
  }

  public setCabinetGain(gainDb: number) {
    this.cabinetResonance.gain.setValueAtTime(gainDb, this.ctx.currentTime);
  }

  public setStaticVolume(volDb: number) {
    const linear = Math.pow(10, volDb / 20);
    this.staticGain.gain.setValueAtTime(linear, this.ctx.currentTime);
  }

  public triggerTuningSweep() {
    if (!this.carrierOsc) return;
    const now = this.ctx.currentTime;
    this.carrierOsc.frequency.cancelScheduledValues(now);
    this.carrierGain.gain.cancelScheduledValues(now);

    this.carrierGain.gain.setValueAtTime(0.015, now);
    this.carrierOsc.frequency.setValueAtTime(4500, now);
    this.carrierOsc.frequency.exponentialRampToValueAtTime(8500, now + 0.16);
    this.carrierOsc.frequency.exponentialRampToValueAtTime(9800, now + 0.32);
    this.carrierGain.gain.exponentialRampToValueAtTime(0.002, now + 0.36);
  }
}
