/**
 * DeshiWave - Spotify-Style Persistent Bottom Player Bar
 * Provides playback transport (Play/Pause/Seek), time display,
 * volume slider, monitoring toggle, and quick export.
 */

import React from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Headphones,
  Download,
  Disc,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface SpotifyPlayerBarProps {
  trackTitle: string;
  presetName: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  onDownloadTake?: () => void;
  hasDownloadableTake?: boolean;
  peakDb: number;
}

export const SpotifyPlayerBar: React.FC<SpotifyPlayerBarProps> = ({
  trackTitle,
  presetName,
  isPlaying,
  onTogglePlay,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange,
  isMonitoring,
  onToggleMonitoring,
  onDownloadTake,
  hasDownloadableTake,
  peakDb,
}) => {
  // Format seconds to mm:ss
  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec <= 0) return '0:00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  // VU meter normalization (-48 to 0 dB)
  const meterNormalized = Math.max(0, Math.min(1, (peakDb + 48) / 48));

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-20 bg-[#181818] border-t border-[#282828] px-4 md:px-6 flex items-center justify-between z-50 select-none shadow-[0_-8px_30px_rgba(0,0,0,0.6)]">
      {/* Left: Track Information */}
      <div className="flex items-center gap-3 w-1/4 min-w-[180px]">
        {/* Cover Art / Disc Thumbnail */}
        <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-[#1db954] via-emerald-700 to-neutral-900 p-0.5 flex items-center justify-center shadow-md flex-shrink-0">
          <div className="w-full h-full bg-[#121212] rounded-[6px] flex items-center justify-center">
            <Disc
              className={`w-6 h-6 text-[#1db954] ${isPlaying ? 'animate-spin' : ''}`}
              style={{ animationDuration: '4s' }}
            />
          </div>
        </div>

        <div className="truncate">
          <div className="text-sm font-semibold text-white truncate max-w-[160px] md:max-w-[220px]">
            {trackTitle || 'DeshiWave Studio Master'}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <span className="w-2 h-2 rounded-full bg-[#1db954]"></span>
            <span className="capitalize">{presetName} Effect</span>
          </div>
        </div>

        {hasDownloadableTake && onDownloadTake && (
          <button
            onClick={onDownloadTake}
            className="text-neutral-400 hover:text-white p-1.5 rounded-full hover:bg-neutral-800 transition"
            title="Download Lossless 24-Bit WAV"
          >
            <Download className="w-4 h-4 text-[#1db954]" />
          </button>
        )}
      </div>

      {/* Center: Playback Controls & Scrubber */}
      <div className="flex flex-col items-center justify-center max-w-xl w-2/4">
        {/* Control Buttons */}
        <div className="flex items-center gap-4 mb-1">
          <button
            onClick={() => onSeek(0)}
            className="text-neutral-400 hover:text-white transition"
            title="Restart track"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Big Circular Spotify Play/Pause */}
          <button
            onClick={onTogglePlay}
            className="w-9 h-9 rounded-full bg-white hover:bg-neutral-100 text-black flex items-center justify-center shadow-lg transition active:scale-95 hover:scale-105"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black" />
            ) : (
              <Play className="w-4 h-4 fill-black translate-x-0.5" />
            )}
          </button>

          <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 bg-neutral-800/60 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3 text-[#1db954]" />
            <span>Zero Latency DSP</span>
          </div>
        </div>

        {/* Timeline Scrubber */}
        <div className="w-full flex items-center gap-2 text-xs font-mono text-neutral-400">
          <span className="w-9 text-right text-[11px]">{formatTime(currentTime)}</span>
          <div className="relative flex-1 group py-1 flex items-center">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#1db954] hover:accent-[#1ed760]"
              style={{
                background: `linear-gradient(to right, #1db954 ${progressPct}%, #333333 ${progressPct}%)`,
              }}
            />
          </div>
          <span className="w-9 text-left text-[11px]">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right: VU Meter & Volume Controls */}
      <div className="flex items-center justify-end gap-3 w-1/4 min-w-[180px]">
        {/* Subtle Peak VU Meter */}
        <div className="hidden sm:flex items-center gap-1.5 bg-neutral-900 px-2 py-1 rounded-full border border-neutral-800">
          <span className="text-[10px] text-neutral-400 font-mono">VU</span>
          <div className="w-12 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#1db954] via-amber-400 to-red-500 transition-all duration-75"
              style={{ width: `${meterNormalized * 100}%` }}
            />
          </div>
        </div>

        {/* Monitoring Toggle */}
        <button
          onClick={onToggleMonitoring}
          className={`p-2 rounded-full transition ${
            isMonitoring
              ? 'text-[#1db954] bg-[#1db954]/10 hover:bg-[#1db954]/20'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
          }`}
          title={isMonitoring ? 'Monitoring Active (Speakers/Headphones)' : 'Monitoring Muted'}
        >
          <Headphones className="w-4 h-4" />
        </button>

        {/* Volume Slider */}
        <div className="flex items-center gap-2">
          {volume === 0 ? (
            <VolumeX className="w-4 h-4 text-neutral-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-neutral-400" />
          )}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-20 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#1db954]"
            style={{
              background: `linear-gradient(to right, #1db954 ${volume * 100}%, #333333 ${volume * 100}%)`,
            }}
          />
        </div>
      </div>
    </footer>
  );
};
