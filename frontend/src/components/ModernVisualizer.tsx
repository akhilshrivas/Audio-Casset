/**
 * DeshiWave DSP - Ultra-Smooth Spotify Canvas-Style Audio Visualizer
 * Renders fluid, rounded frequency spectrum bars with glowing peaks
 * and a smooth flowing waveform ribbon on HTML5 Canvas.
 */

import React, { useEffect, useRef } from 'react';

interface ModernVisualizerProps {
  analyser: AnalyserNode | null;
  activePreset: string;
  isPlayingOrRecording: boolean;
  trackTitle?: string;
}

export const ModernVisualizer: React.FC<ModernVisualizerProps> = ({
  analyser,
  activePreset,
  isPlayingOrRecording,
  trackTitle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const bufferLength = analyser ? analyser.frequencyBinCount : 512;
    const freqData = new Uint8Array(bufferLength);
    const timeData = new Float32Array(bufferLength);

    // Color schemes for presets
    const getPresetColors = (preset: string) => {
      switch (preset) {
        case 'bhojpuri':
          return {
            gradientStart: '#ff2d55',
            gradientEnd: '#f59e0b',
            accent: '#ff2d55',
            glow: 'rgba(255, 45, 85, 0.45)',
          };
        case 'cassette':
          return {
            gradientStart: '#f59e0b',
            gradientEnd: '#d97706',
            accent: '#f59e0b',
            glow: 'rgba(245, 158, 11, 0.45)',
          };
        case 'radio':
          return {
            gradientStart: '#a855f7',
            gradientEnd: '#ec4899',
            accent: '#a855f7',
            glow: 'rgba(168, 85, 247, 0.45)',
          };
        case 'reverb':
          return {
            gradientStart: '#00e5ff',
            gradientEnd: '#3b82f6',
            accent: '#00e5ff',
            glow: 'rgba(0, 229, 255, 0.45)',
          };
        case 'dry':
        default:
          return {
            gradientStart: '#1db954',
            gradientEnd: '#1ed760',
            accent: '#1db954',
            glow: 'rgba(29, 185, 84, 0.45)',
          };
      }
    };

    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;

      // Dark transparent fade for buttery smooth trail
      ctx.fillStyle = 'rgba(18, 18, 18, 0.35)';
      ctx.fillRect(0, 0, width, height);

      const colors = getPresetColors(activePreset);

      if (analyser && isPlayingOrRecording) {
        analyser.getByteFrequencyData(freqData);
        analyser.getFloatTimeDomainData(timeData);
      } else {
        // Subtle ambient idle breathing wave
        const now = Date.now() * 0.002;
        for (let i = 0; i < 48; i++) {
          freqData[i] = Math.max(10, Math.sin(now + i * 0.2) * 20 + 25);
        }
      }

      // 1. Draw Centered Rounded Spectrum Bars (Spotify Canvas Style)
      const numBars = 48;
      const barSpacing = 4;
      const totalWidth = width - 40;
      const barWidth = Math.max(3, (totalWidth - (numBars - 1) * barSpacing) / numBars);
      const startX = 20;
      const centerY = height * 0.55;

      const gradient = ctx.createLinearGradient(0, centerY - 60, 0, centerY + 60);
      gradient.addColorStop(0, colors.gradientStart);
      gradient.addColorStop(1, colors.gradientEnd);

      for (let i = 0; i < numBars; i++) {
        const binIndex = Math.floor(Math.pow(i / numBars, 1.4) * (bufferLength / 3));
        const val = freqData[binIndex] || 0;
        const normalized = val / 255.0;
        const barHeight = Math.max(4, normalized * (height * 0.42));

        const x = startX + i * (barWidth + barSpacing);
        const yTop = centerY - barHeight;
        const totalBarHeight = barHeight * 2;

        ctx.fillStyle = gradient;
        ctx.beginPath();
        // Rounded pill bar
        const r = barWidth / 2;
        ctx.roundRect(x, yTop, barWidth, totalBarHeight, r);
        ctx.fill();

        // Subtle glow on intense frequencies
        if (normalized > 0.6) {
          ctx.save();
          ctx.shadowColor = colors.glow;
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x + r, yTop, r * 0.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // 2. Draw Smooth Fluid Waveform Line
      if (analyser && isPlayingOrRecording) {
        ctx.save();
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = colors.glow;
        ctx.shadowBlur = 12;
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i += 2) {
          const v = timeData[i];
          const y = (height * 0.28) + (v * (height * 0.22));

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth * 2;
        }

        ctx.stroke();
        ctx.restore();
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyser, activePreset, isPlayingOrRecording]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-[#181818] to-[#121212] border border-[#282828] p-4 shadow-xl">
      {/* Top Status & Track Name */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1db954] animate-pulse"></span>
          <span className="font-semibold text-neutral-200 truncate max-w-xs md:max-w-md">
            {trackTitle || 'Real-Time DSP Visualizer (48kHz Lossless)'}
          </span>
        </div>
        <span className="px-2.5 py-0.5 rounded-full bg-[#282828] text-[11px] font-medium text-neutral-400 capitalize">
          Preset: <span className="text-white font-semibold">{activePreset}</span>
        </span>
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={180}
        className="w-full h-36 md:h-44 block rounded-xl"
      />
    </div>
  );
};
