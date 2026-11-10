/**
 * DeshiWave - Spotify-Style Music & Audio File Uploader
 * Allows users to drag-and-drop or browse their own music files (MP3, WAV, FLAC, M4A),
 * play them instantly through real-time DSP effects, and ingest into the lakehouse.
 */

import React, { useState, useRef } from 'react';
import { Upload, Music, Check, Play, Pause, Database, Sparkles, FileAudio } from 'lucide-react';

interface TrackUploaderProps {
  onFileSelected: (file: File) => void;
  uploadedTrackName: string | null;
  uploadedFileSize?: number;
  isTrackPlaying: boolean;
  onTogglePlay: () => void;
  onIngestToLakehouse: () => void;
  isIngesting: boolean;
}

export const TrackUploader: React.FC<TrackUploaderProps> = ({
  onFileSelected,
  uploadedTrackName,
  uploadedFileSize,
  isTrackPlaying,
  onTogglePlay,
  onIngestToLakehouse,
  isIngesting,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|flac|aac|ogg)$/i)) {
        onFileSelected(file);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  /**
   * Generates a 7.5-second nostalgic Kishore Kumar style acoustic melody stem:
   * Warm acoustic guitar fingerpicking arpeggio + soulful vocal/flute register melody in 48kHz stereo.
   */
  const handleGenerateSampleSong = () => {
    const sampleRate = 48000;
    const duration = 7.5;
    const numSamples = Math.floor(sampleRate * duration);
    const wavBuffer = new ArrayBuffer(44 + numSamples * 4);
    const view = new DataView(wavBuffer);

    // RIFF Header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 4, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 2, true); // 2 channels
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 4, true);

    // Chord progression: C - Am - F - G (Classic Kishore Kumar / R.D. Burman ballad progression)
    // Notes in Hz
    const C3 = 130.81, E3 = 164.81, G3 = 196.00, C4 = 261.63;
    const A2 = 110.00, C3_ = 130.81, E3_ = 164.81, A3 = 220.00;
    const F2 = 87.31, C3__ = 130.81, F3 = 174.61, A3_ = 220.00;
    const G2 = 98.00, B2 = 123.47, D3 = 146.83, G3_ = 196.00;

    const chords = [
      [C3, E3, G3, C4],
      [A2, C3_, E3_, A3],
      [F2, C3__, F3, A3_],
      [G2, B2, D3, G3_],
    ];

    // Vocal register melody notes (C4, D4, E4, G4, A4, G4, E4, D4, C4)
    const melodyNotes = [261.63, 293.66, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66, 261.63];

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;

      // 1. Acoustic Guitar Fingerpicking
      const chordIndex = Math.floor(t / 1.85) % chords.length;
      const currentChord = chords[chordIndex];
      const arpeggioStep = Math.floor(t * 4.2) % 4;
      const guitarFreq = currentChord[arpeggioStep];
      const pluckEnv = Math.exp(-3.8 * ((t * 4.2) % 1));
      // Plucked string harmonics
      const guitarSample = (
        Math.sin(2 * Math.PI * guitarFreq * t) * 0.45 +
        Math.sin(4 * Math.PI * guitarFreq * t) * 0.22 +
        Math.sin(6 * Math.PI * guitarFreq * t) * 0.08
      ) * pluckEnv;

      // 2. Soulful Flute / Vocal Lead (Kishore Kumar vocal melody register)
      const melodyStep = Math.floor(t * 1.8) % melodyNotes.length;
      const melodyFreq = melodyNotes[melodyStep];
      // Gentle vibrato at 5 Hz
      const vibrato = 1.0 + 0.015 * Math.sin(2 * Math.PI * 5.0 * t);
      const melodyEnv = Math.min(1.0, (t % 0.55) * 5.0) * Math.exp(-0.8 * (t % 0.55));
      const leadSample = (
        Math.sin(2 * Math.PI * melodyFreq * vibrato * t) * 0.35 +
        Math.sin(4 * Math.PI * melodyFreq * vibrato * t) * 0.12
      ) * melodyEnv;

      // 3. Gentle Vinyl/Tape Warmth Bed
      const analogBed = (Math.random() * 2 - 1) * 0.008;

      const mixL = Math.max(-1.0, Math.min(1.0, guitarSample * 0.75 + leadSample * 0.65 + analogBed));
      const mixR = Math.max(-1.0, Math.min(1.0, guitarSample * 0.65 + leadSample * 0.75 + analogBed));

      const intL = Math.floor(mixL * 32767);
      const intR = Math.floor(mixR * 32767);

      view.setInt16(offset, intL, true);
      view.setInt16(offset + 2, intR, true);
      offset += 4;
    }

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const file = new File([blob], 'Kishore_Kumar_Golden_Acoustic_Melody.wav', { type: 'audio/wav' });
    onFileSelected(file);
  };

  return (
    <div className="bg-[#181818] border border-[#282828] rounded-2xl p-5 shadow-xl transition-all hover:border-[#383838]">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.flac,.aac,.ogg"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#1db954]/15 flex items-center justify-center text-[#1db954]">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Upload Your Music & Audio</h3>
            <p className="text-xs text-neutral-400">
              Play any song through the Kishore Kumar Golden Cassette & Radio DSP chains
            </p>
          </div>
        </div>

        {/* Instant Kishore Kumar Demo Stem */}
        <button
          onClick={handleGenerateSampleSong}
          className="text-xs bg-[#242424] hover:bg-[#2e2e2e] text-amber-300 hover:text-white px-3.5 py-1.5 rounded-full border border-amber-800/60 flex items-center gap-1.5 transition shadow"
          title="Load 48kHz Kishore Kumar style acoustic melody stem"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Load Kishore Kumar Demo Stem
        </button>
      </div>

      {/* Drag & Drop Card or Loaded File Card */}
      {!uploadedTrackName ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-[#1db954] bg-[#1db954]/10 scale-[1.01]'
              : 'border-neutral-700 hover:border-neutral-500 bg-[#141414]/60 hover:bg-[#1a1a1a]'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-neutral-800 text-neutral-300 flex items-center justify-center mx-auto mb-3">
            <FileAudio className="w-6 h-6 text-[#1db954]" />
          </div>
          <div className="font-semibold text-sm text-white mb-1">
            Click to upload your music or drag & drop audio here
          </div>
          <p className="text-xs text-neutral-400 mb-3">
            Supports MP3, WAV, FLAC, M4A, AAC, OGG (Studio 48kHz uncompressed audio pipeline)
          </p>
          <span className="inline-block px-4 py-1.5 rounded-full bg-[#1db954] text-black font-semibold text-xs hover:bg-[#1ed760] transition shadow-md">
            Choose Audio File
          </span>
        </div>
      ) : (
        /* Loaded Track Status Banner */
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-amber-600/40 via-emerald-800/30 to-[#121212] flex items-center justify-center border border-amber-500/30 shadow-md">
              <Music className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm truncate max-w-xs md:max-w-md">
                  {uploadedTrackName}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#1db954]/20 text-[#1db954] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Check className="w-3 h-3" /> Ready
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {uploadedFileSize
                  ? `${(uploadedFileSize / (1024 * 1024)).toFixed(2)} MB • `
                  : ''}
                Routing through Golden Cassette & Radio DSP rack
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            {/* Play/Pause Button */}
            <button
              onClick={onTogglePlay}
              className="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] text-black font-bold text-xs rounded-full flex items-center gap-1.5 shadow-lg transition active:scale-95"
            >
              {isTrackPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-black" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-black" /> Play with DSP
                </>
              )}
            </button>

            {/* Ingest to Lakehouse */}
            <button
              onClick={onIngestToLakehouse}
              disabled={isIngesting}
              className="px-3.5 py-2 bg-[#282828] hover:bg-[#333333] text-white text-xs font-semibold rounded-full border border-neutral-700 flex items-center gap-1.5 transition"
            >
              <Database className="w-3.5 h-3.5 text-[#00e5ff]" />
              {isIngesting ? 'Ingesting...' : 'Ingest to Lakehouse'}
            </button>

            {/* Change File */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-neutral-400 hover:text-white px-2.5 py-2 transition underline"
            >
              Change File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
