/**
 * DeshiWave DSP - Lossless Studio WAV Encoder
 * Encodes 32-bit float stereo PCM buffers directly into 24-bit PCM WAV (or 16-bit)
 * compliant with broadcast WAV specifications.
 */

export function encodeWAV24Bit(
  buffersL: Float32Array[],
  buffersR: Float32Array[],
  sampleRate: number = 48000
): Blob {
  // Calculate total sample count
  let totalLength = 0;
  for (let b of buffersL) {
    totalLength += b.length;
  }

  // Interleave L and R channels
  const numChannels = 2;
  const bytesPerSample = 3; // 24-bit PCM = 3 bytes
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalLength * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Helper to write ASCII strings
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  /* RIFF header */
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // ChunkSize
  writeString(8, 'WAVE');

  /* 'fmt ' subchunk */
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true); // BitsPerSample = 24

  /* 'data' subchunk */
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write 24-bit samples interleaved
  let byteOffset = 44;
  for (let chunkIdx = 0; chunkIdx < buffersL.length; chunkIdx++) {
    const chunkL = buffersL[chunkIdx];
    const chunkR = buffersR[chunkIdx] || chunkL;
    const len = chunkL.length;

    for (let i = 0; i < len; i++) {
      // Clamp between -1.0 and 1.0
      let sampleL = Math.max(-1.0, Math.min(1.0, chunkL[i]));
      let sampleR = Math.max(-1.0, Math.min(1.0, chunkR[i]));

      // 24-bit signed int: -8388608 to 8388607
      let intSampleL = Math.floor(sampleL * 8388607);
      let intSampleR = Math.floor(sampleR * 8388607);

      // Write Left 24-bit Little Endian (3 bytes)
      view.setUint8(byteOffset, intSampleL & 0xff);
      view.setUint8(byteOffset + 1, (intSampleL >> 8) & 0xff);
      view.setUint8(byteOffset + 2, (intSampleL >> 16) & 0xff);
      byteOffset += 3;

      // Write Right 24-bit Little Endian (3 bytes)
      view.setUint8(byteOffset, intSampleR & 0xff);
      view.setUint8(byteOffset + 1, (intSampleR >> 8) & 0xff);
      view.setUint8(byteOffset + 2, (intSampleR >> 16) & 0xff);
      byteOffset += 3;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
