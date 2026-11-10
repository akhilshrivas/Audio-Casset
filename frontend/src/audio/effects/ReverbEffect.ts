/**
 * DeshiWave DSP - Studio Concert Reverb Effect
 * Algorithmic stereo impulse response generator with exponential decay,
 * pre-delay, high-frequency absorption, and equal-power dry/wet mixing.
 */

export class ReverbEffect {
  public input: GainNode;
  public output: GainNode;

  private ctx: AudioContext;
  private preDelayNode: DelayNode;
  private convolver: ConvolverNode;
  private dampingFilter: BiquadFilterNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  private decayTime: number = 3.0; // Seconds
  private wetMix: number = 0.45; // 0.0 to 1.0

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.preDelayNode = ctx.createDelay(0.2);
    this.preDelayNode.delayTime.value = 0.040; // 40ms pre-delay

    this.convolver = ctx.createConvolver();
    this.generateImpulseResponse(this.decayTime);

    // High frequency damping in reflections
    this.dampingFilter = ctx.createBiquadFilter();
    this.dampingFilter.type = 'lowpass';
    this.dampingFilter.frequency.value = 4500;
    this.dampingFilter.Q.value = 0.707;

    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.setDryWet(this.wetMix);

    // Audio Graph Wiring:
    // input -> dryGain -> output
    // input -> preDelay -> dampingFilter -> convolver -> wetGain -> output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.preDelayNode);
    this.preDelayNode.connect(this.dampingFilter);
    this.dampingFilter.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  public setDryWet(wet: number) {
    this.wetMix = Math.max(0.0, Math.min(1.0, wet));
    // Equal-power crossfade
    const angle = this.wetMix * (Math.PI / 2);
    this.dryGain.gain.setValueAtTime(Math.cos(angle), this.ctx.currentTime);
    this.wetGain.gain.setValueAtTime(Math.sin(angle), this.ctx.currentTime);
  }

  public setDecayTime(seconds: number) {
    this.decayTime = Math.max(0.5, Math.min(6.0, seconds));
    this.generateImpulseResponse(this.decayTime);
  }

  public setPreDelay(ms: number) {
    const delaySec = Math.max(0.0, Math.min(0.1, ms / 1000.0));
    this.preDelayNode.delayTime.setValueAtTime(delaySec, this.ctx.currentTime);
  }

  private generateImpulseResponse(decay: number) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * decay);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    // Generate stereo exponentially decaying noise with spatial dispersion
    for (let i = 0; i < length; i++) {
      const decayFactor = Math.exp(-3.5 * (i / length));
      // White/pink filtered noise
      const noiseL = (Math.random() * 2 - 1) * decayFactor;
      const noiseR = (Math.random() * 2 - 1) * decayFactor;

      left[i] = noiseL;
      right[i] = noiseR;
    }

    this.convolver.buffer = impulse;
  }
}
