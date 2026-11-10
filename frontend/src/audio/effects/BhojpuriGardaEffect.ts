/**
 * DeshiWave DSP - "Bhojpuri Garda" Vocal Effect
 * Iconic metallic robotic pitch snap, mid-presence bite (3.2 kHz),
 * slapback stadium delay (135ms / 270ms), and 12:1 brickwall squash.
 */

export class BhojpuriGardaEffect {
  public input: GainNode;
  public output: GainNode;

  private ctx: AudioContext;
  private dryGain: GainNode;
  private wetGain: GainNode;

  // DSP Nodes
  public pitchWorkletNode: AudioWorkletNode | null = null;
  private presenceFilter: BiquadFilterNode;
  private highShelfAir: BiquadFilterNode;
  private compressor: DynamicsCompressorNode;

  // Slapback Stadium Delay Network
  private delayTapL: DelayNode;
  private delayTapR: DelayNode;
  private delayFeedbackGain: GainNode;
  private delayBandpass: BiquadFilterNode;
  private delayWetGain: GainNode;
  private delayChannelMerger: ChannelMergerNode;

  private currentScale: string = 'bhairavi';

  constructor(ctx: AudioContext, workletNode: AudioWorkletNode | null = null) {
    this.ctx = ctx;
    this.pitchWorkletNode = workletNode;

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    // 1. Mid-Range Presence Bite (3200 Hz, Q 1.8, +7 dB)
    this.presenceFilter = ctx.createBiquadFilter();
    this.presenceFilter.type = 'peaking';
    this.presenceFilter.frequency.value = 3200;
    this.presenceFilter.Q.value = 1.8;
    this.presenceFilter.gain.value = 7.0;

    // 2. High Shelf Air Boost (8000 Hz, +4 dB)
    this.highShelfAir = ctx.createBiquadFilter();
    this.highShelfAir.type = 'highshelf';
    this.highShelfAir.frequency.value = 8000;
    this.highShelfAir.gain.value = 4.0;

    // 3. Slapback Stadium Delay Network (135ms / 270ms stereo split)
    this.delayTapL = ctx.createDelay(1.0);
    this.delayTapL.delayTime.value = 0.135; // 135ms Left

    this.delayTapR = ctx.createDelay(1.0);
    this.delayTapR.delayTime.value = 0.270; // 270ms Right

    this.delayFeedbackGain = ctx.createGain();
    this.delayFeedbackGain.gain.value = 0.38; // 38% feedback

    this.delayBandpass = ctx.createBiquadFilter();
    this.delayBandpass.type = 'bandpass';
    this.delayBandpass.frequency.value = 1800; // Centered in vocal range
    this.delayBandpass.Q.value = 0.9;

    this.delayWetGain = ctx.createGain();
    this.delayWetGain.gain.value = 0.40;

    this.delayChannelMerger = ctx.createChannelMerger(2);

    // 4. Brickwall Vocal Squash Dynamics Compressor
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -28;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.002; // Fast 2ms attack
    this.compressor.release.value = 0.12; // 120ms release

    this.buildGraph();
    this.setDryWet(0.85);
  }

  public setWorkletNode(node: AudioWorkletNode) {
    this.pitchWorkletNode = node;
    this.buildGraph();
    this.setScale(this.currentScale);
  }

  private buildGraph() {
    try {
      this.input.disconnect();
    } catch (_) {}

    // Dry chain
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet chain: Input -> Pitch Worklet (or bypass) -> Presence -> Air -> Compressor -> Delay Mix -> Output
    let effectSource: AudioNode = this.input;
    if (this.pitchWorkletNode) {
      this.input.connect(this.pitchWorkletNode);
      effectSource = this.pitchWorkletNode;
    }

    effectSource.connect(this.presenceFilter);
    this.presenceFilter.connect(this.highShelfAir);
    this.highShelfAir.connect(this.compressor);

    // Compressor splits to direct wet out and delay network
    this.compressor.connect(this.wetGain);

    // Delay network loop
    this.compressor.connect(this.delayBandpass);
    this.delayBandpass.connect(this.delayTapL);
    this.delayBandpass.connect(this.delayTapR);

    this.delayTapL.connect(this.delayChannelMerger, 0, 0);
    this.delayTapR.connect(this.delayChannelMerger, 0, 1);

    // Feedback
    this.delayChannelMerger.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayBandpass);

    // Merge into wet out
    this.delayChannelMerger.connect(this.delayWetGain);
    this.delayWetGain.connect(this.wetGain);

    this.wetGain.connect(this.output);
  }

  public setDryWet(wet: number) {
    const val = Math.max(0.0, Math.min(1.0, wet));
    const angle = val * (Math.PI / 2);
    this.dryGain.gain.setValueAtTime(Math.cos(angle), this.ctx.currentTime);
    this.wetGain.gain.setValueAtTime(Math.sin(angle), this.ctx.currentTime);
  }

  public setScale(scale: string) {
    this.currentScale = scale;
    if (this.pitchWorkletNode) {
      this.pitchWorkletNode.port.postMessage({
        scale: scale,
        snapIntensity: 1.0,
      });
    }
  }

  public setPresenceGain(db: number) {
    this.presenceFilter.gain.setValueAtTime(db, this.ctx.currentTime);
  }

  public setSlapbackDelayTime(ms: number) {
    const sec = ms / 1000.0;
    this.delayTapL.delayTime.setValueAtTime(sec, this.ctx.currentTime);
    this.delayTapR.delayTime.setValueAtTime(sec * 2.0, this.ctx.currentTime);
  }

  public setFeedback(feedback: number) {
    this.delayFeedbackGain.gain.setValueAtTime(Math.max(0, Math.min(0.85, feedback)), this.ctx.currentTime);
  }

  public setCompressorRatio(ratio: number) {
    this.compressor.ratio.setValueAtTime(Math.max(1, Math.min(20, ratio)), this.ctx.currentTime);
  }
}
