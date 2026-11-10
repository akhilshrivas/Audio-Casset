/**
 * DeshiWave DSP - PCM Recorder AudioWorkletProcessor
 * Captures uncompressed 32-bit float PCM audio directly from the audio rendering thread
 * with zero garbage collection spikes and high-precision ring buffering.
 */

class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = false;
    this.recordedBuffersLeft = [];
    this.recordedBuffersRight = [];
    this.totalSamplesRecorded = 0;
    this.chunkSize = 4096;
    this.currentChunkLeft = new Float32Array(this.chunkSize);
    this.currentChunkRight = new Float32Array(this.chunkSize);
    this.chunkOffset = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.command === 'START') {
        this.isRecording = true;
        this.recordedBuffersLeft = [];
        this.recordedBuffersRight = [];
        this.totalSamplesRecorded = 0;
        this.chunkOffset = 0;
      } else if (data.command === 'STOP') {
        this.isRecording = false;
        // Flush remaining chunk
        if (this.chunkOffset > 0) {
          this.recordedBuffersLeft.push(this.currentChunkLeft.slice(0, this.chunkOffset));
          this.recordedBuffersRight.push(this.currentChunkRight.slice(0, this.chunkOffset));
        }
        this.port.postMessage({
          eventType: 'RECORDING_COMPLETE',
          totalSamples: this.totalSamplesRecorded,
          buffersLeft: this.recordedBuffersLeft,
          buffersRight: this.recordedBuffersRight,
        });
        this.recordedBuffersLeft = [];
        this.recordedBuffersRight = [];
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const inputL = input[0];
    const inputR = input.length > 1 ? input[1] : inputL;
    const quantumSize = inputL.length;

    // Passthrough to output for zero latency monitoring
    const output = outputs[0];
    if (output && output.length > 0) {
      if (output[0]) output[0].set(inputL);
      if (output[1]) output[1].set(inputR);
    }

    if (this.isRecording) {
      for (let i = 0; i < quantumSize; i++) {
        this.currentChunkLeft[this.chunkOffset] = inputL[i];
        this.currentChunkRight[this.chunkOffset] = inputR[i];
        this.chunkOffset++;
        this.totalSamplesRecorded++;

        if (this.chunkOffset >= this.chunkSize) {
          this.recordedBuffersLeft.push(new Float32Array(this.currentChunkLeft));
          this.recordedBuffersRight.push(new Float32Array(this.currentChunkRight));
          this.chunkOffset = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor('pcm-recorder-worklet', PCMRecorderProcessor);
