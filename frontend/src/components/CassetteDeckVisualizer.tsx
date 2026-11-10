/**
 * DeshiWave DSP - Golden Era Cassette Deck Visualizer
 * Luxury vintage cassette deck with animated winding tape spools,
 * realistic tape pack thickness transfer, glowing amber backlights,
 * classic HMV / Kishore Kumar tape styling, and vintage radio tuner dial.
 */

import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, Zap, Radio, Disc, Volume2, Sparkles } from 'lucide-react';

interface CassetteDeckProps {
  isRecording: boolean;
  isPlaying: boolean;
  onRecordToggle?: () => void;
  onPlayToggle: () => void;
  onStop: () => void;
  peakDb: number;
  activePreset: string;
  trackTitle?: string;
  currentTime?: number;
  duration?: number;
  onTapeWarmthChange?: (db: number) => void;
  onFlutterChange?: (depth: number) => void;
  onHissToggle?: (enabled: boolean) => void;
}

export const CassetteDeckVisualizer: React.FC<CassetteDeckProps> = ({
  isRecording,
  isPlaying,
  onRecordToggle,
  onPlayToggle,
  onStop,
  peakDb,
  activePreset,
  trackTitle = 'Kishore Kumar Classics • HMV Golden Era',
  currentTime = 0,
  duration = 180,
  onTapeWarmthChange,
  onFlutterChange,
  onHissToggle,
}) => {
  const [tapeCounter, setTapeCounter] = useState<number>(108);
  const [tapeWarmth, setTapeWarmth] = useState<number>(3.5);
  const [flutterAmount, setFlutterAmount] = useState<number>(0.4);
  const [hissActive, setHissActive] = useState<boolean>(true);

  const isMoving = isRecording || isPlaying;

  // Mechanical tape index counter
  useEffect(() => {
    let interval: any;
    if (isMoving) {
      interval = setInterval(() => {
        setTapeCounter((prev) => (prev + 1) % 9999);
      }, 650);
    }
    return () => clearInterval(interval);
  }, [isMoving]);

  const counterStr = tapeCounter.toString().padStart(4, '0');

  // Calculate realistic tape pack thickness (left spool empties as right spool fills)
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0.25;
  // Left tape donut radius (shrinks from 44px to 24px)
  const leftTapeRadius = Math.round(44 - progressRatio * 20);
  // Right tape donut radius (grows from 24px to 44px)
  const rightTapeRadius = Math.round(24 + progressRatio * 20);

  // Dual VU Meter simulation with smooth decay
  const vuNormalized = Math.max(0, Math.min(1, (peakDb + 42) / 45));
  const vuLeftPct = Math.round(vuNormalized * 100);
  const vuRightPct = Math.round(Math.min(100, Math.max(0, (vuNormalized * 0.95 + Math.random() * 0.05) * 100)));

  return (
    <div className="bg-gradient-to-b from-[#221f1d] via-[#1a1715] to-[#121110] border-2 border-[#3d3630] rounded-2xl p-5 md:p-6 shadow-2xl relative select-none overflow-hidden">
      {/* Subtle Metallic Brushed Aluminum Top Accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-700 via-amber-400 to-amber-800 opacity-60"></div>

      {/* Top Deck Header: Brand & Vintage Badging */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#3d3630] pb-3 mb-4 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#2e2722] border border-amber-800/60 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-pulse"></span>
            <span className="font-extrabold tracking-widest text-amber-400 text-xs">
              HMV STEREO CASSETTE DECK
            </span>
          </div>
          <span className="hidden sm:inline-block text-[#9e8f7c] text-[11px]">
            TYPE II CHROME • HIGH-FIDELITY TAPE BIAS
          </span>
        </div>

        {/* 4-Digit Mechanical Tape Counter & Radio Indicator */}
        <div className="flex items-center gap-3">
          {activePreset === 'radio' && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-600/50 text-[10px] text-amber-300">
              <Radio className="w-3 h-3 text-amber-400" />
              <span>VIVIDH BHARATI 102.8 FM</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 bg-[#0a0908] px-2.5 py-1 rounded border border-[#3d3630]">
            <span className="text-[10px] text-neutral-400 font-bold">INDEX</span>
            <div className="flex gap-0.5 font-mono font-bold text-amber-400 tracking-wider bg-black px-2 py-0.5 rounded border border-amber-950 shadow-inner text-xs">
              {counterStr.split('').map((digit, idx) => (
                <span key={idx} className="w-2.5 text-center inline-block">{digit}</span>
              ))}
            </div>
            <button
              onClick={() => setTapeCounter(0)}
              className="text-[9px] bg-[#24201d] hover:bg-[#332e29] text-amber-200/80 px-1.5 py-0.5 rounded transition"
            >
              RESET
            </button>
          </div>
        </div>
      </div>

      {/* Cassette Shell Enclosure */}
      <div className="relative bg-[#28231f] rounded-xl p-4 md:p-5 border border-[#4a3f36] shadow-[inset_0_4px_16px_rgba(0,0,0,0.8)] max-w-2xl mx-auto">
        {/* Cassette Shell Top Gold/Cream Label */}
        <div className="bg-gradient-to-r from-[#dfd7c6] via-[#eee7da] to-[#dfd7c6] rounded-t-lg p-2.5 text-neutral-900 border-b-2 border-[#b5a993] flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5 truncate">
            <span className="font-extrabold text-[11px] tracking-wider bg-[#b32025] text-white px-2 py-0.5 rounded shadow">
              SIDE A
            </span>
            <span className="font-serif font-bold text-xs tracking-tight text-[#1c1814] truncate max-w-xs md:max-w-md">
              {trackTitle.includes('Kishore') ? trackTitle : `${trackTitle} • Vintage Cassette Master`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-[#5c4f3d] flex-shrink-0">
            <span>DOLBY B-C NR</span>
            <span>•</span>
            <span className="text-amber-800">48kHz TAPE</span>
          </div>
        </div>

        {/* Transparent Cassette Window with Golden Backlit Glow */}
        <div className="relative bg-gradient-to-b from-[#141210] to-[#0c0b0a] h-36 md:h-44 rounded-b-lg border-x-4 border-b-4 border-[#38312b] p-3 flex items-center justify-between overflow-hidden shadow-2xl">
          {/* Warm Amber Incandescent Backlight Glow */}
          <div className={`absolute inset-0 bg-gradient-to-t from-amber-500/10 via-transparent to-amber-500/5 pointer-events-none transition-opacity duration-300 ${isMoving ? 'opacity-100' : 'opacity-40'}`} />

          {/* Centered Calibration Markers */}
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[9px] text-[#7a6b5a] font-mono select-none">
            <span>100</span>
            <span>-</span>
            <span>50</span>
            <span>-</span>
            <span>0 min</span>
          </div>

          {/* Left Reel: Supply Spool (Animates & Shrinks as tape plays) */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Magnetic Tape Donut Winding */}
            <div
              className="rounded-full bg-gradient-to-tr from-[#2a170f] via-[#382015] to-[#1c100a] border border-[#140b07] flex items-center justify-center shadow-lg transition-all duration-300"
              style={{ width: `${leftTapeRadius * 2}px`, height: `${leftTapeRadius * 2}px` }}
            >
              {/* White/Chrome Hub Reel */}
              <div
                className={`w-12 h-12 rounded-full bg-gradient-to-b from-[#f7f3ea] to-[#d6cebe] border border-[#8a806e] flex items-center justify-center relative shadow-inner ${
                  isMoving ? 'animate-spin' : ''
                }`}
                style={{ animationDuration: '2.8s' }}
              >
                {/* Center Hub Hole */}
                <div className="w-4 h-4 rounded-full bg-[#12100d] border border-amber-900/60" />
                {/* 3 Cassette Drive Splines */}
                <div className="absolute top-0.5 w-1.5 h-1.5 bg-[#423a31] rounded-xs" />
                <div className="absolute bottom-0.5 w-1.5 h-1.5 bg-[#423a31] rounded-xs" />
                <div className="absolute left-0.5 w-1.5 h-1.5 bg-[#423a31] rounded-xs" />
                <div className="absolute right-0.5 w-1.5 h-1.5 bg-[#423a31] rounded-xs" />
              </div>
            </div>
            <span className="text-[9px] font-mono text-[#8a7a67] mt-1">SUPPLY</span>
          </div>

          {/* Center Window: Visible Magnetic Tape Ribbon & Tape Head */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 z-10">
            {/* Running Magnetic Tape Ribbon */}
            <div className="w-full h-1.5 bg-gradient-to-r from-[#2b170e] via-[#4d2d1e] to-[#2b170e] rounded border-y border-[#170c07] mb-6 relative overflow-hidden">
              {isMoving && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/30 to-transparent animate-pulse" />
              )}
            </div>

            {/* Vintage Playback Head & Pinch Roller Assembly */}
            <div className="w-24 h-7 bg-gradient-to-b from-[#24211e] to-[#171513] border border-[#4f443a] rounded flex items-center justify-around px-1.5 shadow-md">
              <div className="w-3.5 h-3.5 rounded-full bg-[#9e9687] border border-[#40382f]" title="Pinch Roller" />
              <div className="w-5 h-3 bg-gradient-to-b from-amber-600 to-amber-800 rounded-xs border border-amber-950" title="Magnetic Head" />
              <div className="w-3.5 h-3.5 rounded-full bg-[#9e9687] border border-[#40382f]" title="Capstan Roller" />
            </div>
            <span className="text-[8px] font-mono text-amber-500/80 mt-1 uppercase tracking-wider">
              {isMoving ? 'HEAD ENGAGED' : 'STANDBY'}
            </span>
          </div>

          {/* Right Reel: Take-up Spool (Animates & Grows as tape plays) */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Magnetic Tape Donut Winding */}
            <div
              className="rounded-full bg-gradient-to-tr from-[#2a170f] via-[#382015] to-[#1c100a] border border-[#140b07] flex items-center justify-center shadow-lg transition-all duration-300"
              style={{ width: `${rightTapeRadius * 2}px`, height: `${rightTapeRadius * 2}px` }}
            >
              {/* White/Chrome Hub Reel */}
              <div
                className={`w-12 h-12 rounded-full bg-gradient-to-b from-[#f7f3ea] to-[#d6cebe] border border-[#8a806e] flex items-center justify-center relative shadow-inner ${
                  isMoving ? 'animate-spin' : ''
                }`}
                style={{ animationDuration: '2.8s' }}
              >
                <div className="w-4 h-4 rounded-full bg-[#12100d] border border-amber-900/60" />
                <div className="absolute top-0.5 w-1.5 h-1.5 bg-[#423a31] rounded-xs" />
                <div className="absolute bottom-0.5 w-1.5 h-1.5 bg-[#423a31] rounded-xs" />
                <div className="absolute left-0.5 w-1.5 h-1.5 bg-[#423a31] rounded-xs" />
                <div className="absolute right-0.5 w-1.5 h-1.5 bg-[#423a31] rounded-xs" />
              </div>
            </div>
            <span className="text-[9px] font-mono text-[#8a7a67] mt-1">TAKE-UP</span>
          </div>
        </div>

        {/* Lower Cassette Housing Notch with Trailing Guides */}
        <div className="h-4 bg-[#1f1a17] rounded-b-lg border-t border-[#3d332a] flex items-center justify-between px-8">
          <div className="w-2.5 h-2.5 rounded-full bg-[#3d352c]" />
          <div className="w-40 h-1 bg-[#120f0d] rounded" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#3d352c]" />
        </div>
      </div>

      {/* Analog Control Deck Bar: Glowing VU Meters, Transport & Vibe Dials */}
      <div className="mt-5 pt-4 border-t border-[#383028] flex flex-wrap items-center justify-between gap-4">
        {/* Physical Mechanical Transport Buttons */}
        <div className="flex items-center gap-2">
          {/* Play / Pause Toggle */}
          <button
            onClick={onPlayToggle}
            className={`px-4 py-2 rounded-lg font-mono font-bold text-xs flex items-center gap-2 transition shadow-md active:translate-y-0.5 ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/60'
                : 'bg-[#2a231d] hover:bg-[#382f27] text-amber-300 border border-amber-900/60'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-amber-300" />}
            {isPlaying ? 'PAUSE' : 'PLAY TAPE'}
          </button>

          {/* Stop Button */}
          <button
            onClick={onStop}
            className="px-3.5 py-2 bg-[#211c19] hover:bg-[#2b2420] text-[#a89987] hover:text-white border border-[#3d332a] rounded-lg font-mono text-xs flex items-center gap-1.5 transition active:translate-y-0.5"
          >
            <Square className="w-3.5 h-3.5" />
            STOP
          </button>

          {onRecordToggle && (
            <button
              onClick={onRecordToggle}
              className={`px-3 py-2 rounded-lg font-mono font-bold text-xs flex items-center gap-1.5 transition ${
                isRecording
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-[#2a1719] hover:bg-[#3d1f23] text-red-400 border border-red-900/60'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {isRecording ? 'RECORDING' : 'REC'}
            </button>
          )}
        </div>

        {/* Dual Analog-Style Backlit Amber VU Meters */}
        <div className="flex items-center gap-3 bg-[#110e0c] px-3.5 py-2 rounded-xl border border-[#383028] shadow-inner">
          <div className="flex flex-col text-[9px] font-mono text-amber-500/80 leading-tight">
            <span>VU</span>
            <span>METER</span>
          </div>

          <div className="space-y-1">
            {/* Left Channel */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-[#8a7b69] w-2.5">L</span>
              <div className="w-24 md:w-32 h-2 bg-[#1f1a16] rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-red-500 rounded-full transition-all duration-75"
                  style={{ width: `${vuLeftPct}%` }}
                />
              </div>
            </div>
            {/* Right Channel */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-[#8a7b69] w-2.5">R</span>
              <div className="w-24 md:w-32 h-2 bg-[#1f1a16] rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-red-500 rounded-full transition-all duration-75"
                  style={{ width: `${vuRightPct}%` }}
                />
              </div>
            </div>
          </div>

          <span className="font-mono text-[10px] text-amber-400 font-bold w-10 text-right">
            {peakDb > -60 ? `${peakDb.toFixed(1)}` : '-INF'} dB
          </span>
        </div>
      </div>

      {/* Quick Vibe Micro-Controls for Kishore Kumar & Radio Tape */}
      <div className="mt-4 pt-3 border-t border-[#2e2620] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        {/* Tape Warmth */}
        <div className="bg-[#191512] p-2.5 rounded-lg border border-[#382f27]">
          <div className="flex justify-between text-[11px] font-mono text-[#b0a08e] mb-1">
            <span>Tape Head Warmth (195 Hz)</span>
            <span className="text-amber-400 font-bold">+{tapeWarmth.toFixed(1)} dB</span>
          </div>
          <input
            type="range"
            min="0"
            max="7"
            step="0.5"
            value={tapeWarmth}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setTapeWarmth(val);
              if (onTapeWarmthChange) onTapeWarmthChange(val);
            }}
            className="w-full h-1 bg-[#2b231d] rounded appearance-none cursor-pointer accent-amber-500"
          />
        </div>

        {/* Organic Reel Drift */}
        <div className="bg-[#191512] p-2.5 rounded-lg border border-[#382f27]">
          <div className="flex justify-between text-[11px] font-mono text-[#b0a08e] mb-1">
            <span>Organic Reel Drift</span>
            <span className="text-amber-400 font-bold">{Math.round(flutterAmount * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={flutterAmount}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setFlutterAmount(val);
              if (onFlutterChange) onFlutterChange(val);
            }}
            className="w-full h-1 bg-[#2b231d] rounded appearance-none cursor-pointer accent-amber-500"
          />
        </div>

        {/* Analog Tape Air / Hiss Toggle */}
        <div className="bg-[#191512] p-2.5 rounded-lg border border-[#382f27] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono text-[#b0a08e]">Analog Tape Hiss</div>
            <div className="text-[10px] text-[#786c5e]">
              {hissActive ? 'Subtle -46dB warmth' : 'Crystal Clean (Muted)'}
            </div>
          </div>
          <button
            onClick={() => {
              const next = !hissActive;
              setHissActive(next);
              if (onHissToggle) onHissToggle(next);
            }}
            className={`px-3 py-1 rounded text-[11px] font-mono font-bold transition ${
              hissActive
                ? 'bg-amber-600 text-white shadow'
                : 'bg-[#2b231d] text-[#8a7b69] hover:text-white'
            }`}
          >
            {hissActive ? 'ON' : 'MUTED'}
          </button>
        </div>
      </div>
    </div>
  );
};
