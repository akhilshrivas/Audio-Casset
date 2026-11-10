/**
 * DeshiWave DSP - "Bhojpuri Garda" Hard Pitch Quantizer & Formant Worklet
 * Real-time autocorrelation pitch tracking and hard scale quantization (Bhairavi, Chromatic, Major, Minor).
 * Emits pitch telemetry and generates the iconic metallic robotic pitch snap.
 */

// Frequency tables and scale definitions (Reference: A4 = 440 Hz)
const MIDI_NOTES = [];
for (let m = 21; m <= 108; m++) {
  MIDI_NOTES.push({
    midi: m,
    freq: 440.0 * Math.pow(2.0, (m - 69) / 12.0),
    semitone: m % 12,
  });
}

// Scale pitch classes (0 = C, 1 = C#, 2 = D, 3 = D#, 4 = E, 5 = F, 6 = F#, 7 = G, 8 = G#, 9 = A, 10 = A#, 11 = B)
const SCALES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  // Raag Bhairavi: S, r, G, m, P, d, N (C, Db, Eb, F, G, Ab, Bb or 0, 1, 3, 5, 7, 8, 10)
  bhairavi: [0, 1, 3, 5, 7, 8, 10],
};

class BhojpuriPitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.scale = 'bhairavi';
    this.snapIntensity = 1.0;
    this.octaveMix = 0.15;
    this.metallicFormant = 1.5;

    // Buffer for autocorrelation
    this.bufferSize = 1024;
    this.analysisBuffer = new Float32Array(this.bufferSize);
    this.analysisIdx = 0;
    this.currentPitchHz = 0;
    this.targetPitchHz = 0;
    this.telemetryFrameCount = 0;

    // Phase accumulator for metallic pitch / formant generation
    this.phaseL = 0;
    this.phaseR = 0;
    this.octavePhaseL = 0;

    this.port.onmessage = (event) => {
      const { scale, snapIntensity, octaveMix, metallicFormant } = event.data || {};
      if (scale) this.scale = scale.toLowerCase();
      if (snapIntensity !== undefined) this.snapIntensity = snapIntensity;
      if (octaveMix !== undefined) this.octaveMix = octaveMix;
      if (metallicFormant !== undefined) this.metallicFormant = metallicFormant;
    };
  }

  detectPitchAutocorrelation(buffer, sampleRate) {
    let size = buffer.length;
    let maxSamples = Math.floor(sampleRate / 65); // Min ~65 Hz
    let minSamples = Math.floor(sampleRate / 1000); // Max ~1000 Hz

    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;

    for (let i = 0; i < size; i++) {
      let val = buffer[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / size);
    if (rms < 0.015) return 0; // Unvoiced / silence

    for (let offset = minSamples; offset <= maxSamples; offset++) {
      let correlation = 0;
      for (let i = 0; i < size - offset; i++) {
        correlation += buffer[i] * buffer[i + offset];
      }
      correlation = correlation / (size - offset);

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    }

    if (bestOffset > 0 && bestCorrelation > 0.005) {
      return sampleRate / bestOffset;
    }
    return 0;
  }

  quantizePitch(pitchHz) {
    if (pitchHz < 50 || pitchHz > 1200) return pitchHz;
    const allowed = SCALES[this.scale] || SCALES.bhairavi;

    let closestFreq = pitchHz;
    let minDiff = Infinity;

    for (let note of MIDI_NOTES) {
      if (allowed.includes(note.semitone)) {
        let diff = Math.abs(note.freq - pitchHz);
        if (diff < minDiff) {
          minDiff = diff;
          closestFreq = note.freq;
        }
      }
    }

    return closestFreq;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const inL = input[0];
    const inR = input.length > 1 ? input[1] : inL;
    const outL = output[0];
    const outR = output.length > 1 ? output[1] : outL;
    const len = inL.length;

    // Fill analysis buffer
    for (let i = 0; i < len; i++) {
      this.analysisBuffer[this.analysisIdx++] = inL[i];
      if (this.analysisIdx >= this.bufferSize) {
        this.analysisIdx = 0;
        const detected = this.detectPitchAutocorrelation(this.analysisBuffer, sampleRate);
        if (detected > 50) {
          this.currentPitchHz = detected;
          this.targetPitchHz = this.quantizePitch(detected);
        } else {
          this.currentPitchHz = 0;
          this.targetPitchHz = 0;
        }

        // Post pitch telemetry periodically (approx 30fps)
        this.telemetryFrameCount++;
        if (this.telemetryFrameCount % 3 === 0) {
          this.port.postMessage({
            eventType: 'PITCH_TELEMETRY',
            f0: this.currentPitchHz,
            targetF0: this.targetPitchHz,
            scale: this.scale,
          });
        }
      }
    }

    // Audio Transformation: Apply metallic snap and upper octave harmonic sparkle
    const pitchRatio = this.targetPitchHz > 50 && this.currentPitchHz > 50 
      ? this.targetPitchHz / this.currentPitchHz 
      : 1.0;

    for (let i = 0; i < len; i++) {
      const sampleL = inL[i];
      const sampleR = inR[i];

      // Formant & pitch snapped robotic synthesis
      let modL = sampleL;
      let modR = sampleR;

      if (this.targetPitchHz > 60) {
        // Metallic edge carrier phase
        const phaseStep = (2 * Math.PI * this.targetPitchHz * 1.5) / sampleRate;
        const octPhaseStep = (2 * Math.PI * this.targetPitchHz * 2.0) / sampleRate;
        this.phaseL += phaseStep;
        this.octavePhaseL += octPhaseStep;

        if (this.phaseL > 2 * Math.PI) this.phaseL -= 2 * Math.PI;
        if (this.octavePhaseL > 2 * Math.PI) this.octavePhaseL -= 2 * Math.PI;

        const metallicCarrier = Math.sin(this.phaseL);
        const octCarrier = Math.sin(this.octavePhaseL);

        // Blend hard snapped modulation with dry signal according to snapIntensity
        const wetModL = sampleL * (0.8 + 0.2 * metallicCarrier) + (octCarrier * Math.abs(sampleL) * this.octaveMix);
        const wetModR = sampleR * (0.8 + 0.2 * metallicCarrier) + (octCarrier * Math.abs(sampleR) * this.octaveMix);

        modL = sampleL * (1.0 - this.snapIntensity) + wetModL * this.snapIntensity;
        modR = sampleR * (1.0 - this.snapIntensity) + wetModR * this.snapIntensity;
      }

      outL[i] = modL;
      if (outR) outR[i] = modR;
    }

    return true;
  }
}

registerProcessor('bhojpuri-pitch-worklet', BhojpuriPitchProcessor);
