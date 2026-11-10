/**
 * DeshiWave DSP - 60fps CRT Phosphor Oscilloscope & Spectrum Visualizer
 * Renders real-time time-domain beam and frequency spectrum on HTML5 Canvas.
 */

import React, { useEffect, useRef } from 'react';

interface LiveOscilloscopeProps {
  analyser: AnalyserNode | null;
  activePreset: string;
  isRecording: boolean;
}

export const LiveOscilloscope: React.FC<LiveOscilloscopeProps> = ({
  analyser,
  activePreset,
  isRecording,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const bufferLength = analyser ? analyser.frequencyBinCount : 1024;
    const timeData = new Float32Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameId = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;

      // Dark CRT background with slight phosphor persistence decay
      ctx.fillStyle = 'rgba(10, 14, 20, 0.28)';
      ctx.fillRect(0, 0, width, height);

      // Draw Grid Reticle
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
      ctx.lineWidth = 1;

      // Vertical grid lines
      const gridCols = 10;
      for (let i = 1; i < gridCols; i++) {
        const x = (width / gridCols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal grid lines
      const gridRows = 6;
      for (let i = 1; i < gridRows; i++) {
        const y = (height / gridRows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center baseline
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      if (!analyser) {
        // Idle flat beam
        ctx.strokeStyle = '#00ff66';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      analyser.getFloatTimeDomainData(timeData);
      analyser.getByteFrequencyData(freqData);

      // Choose phosphor color based on preset
      let beamColor = '#00ff66'; // Retro green
      let glowColor = 'rgba(0, 255, 102, 0.4)';
      if (activePreset === 'bhojpuri') {
        beamColor = '#ff2d55'; // Garda neon red/pink
        glowColor = 'rgba(255, 45, 85, 0.5)';
      } else if (activePreset === 'cassette') {
        beamColor = '#f59e0b'; // Amber tape
        glowColor = 'rgba(245, 158, 11, 0.5)';
      } else if (activePreset === 'radio') {
        beamColor = '#a855f7'; // Purple radio static
        glowColor = 'rgba(168, 85, 247, 0.5)';
      } else if (activePreset === 'reverb') {
        beamColor = '#00e5ff'; // Cyan hall
        glowColor = 'rgba(0, 229, 255, 0.5)';
      }

      // 1. Draw Lower Frequency Spectrum Bars (Bottom 35% of canvas)
      const numBars = 48;
      const barWidth = width / numBars;
      const spectrumHeight = height * 0.35;

      for (let i = 0; i < numBars; i++) {
        const freqIndex = Math.floor(Math.pow(i / numBars, 1.6) * (bufferLength / 3));
        const val = freqData[freqIndex] || 0;
        const barH = (val / 255) * spectrumHeight;
        const x = i * barWidth;
        const y = height - barH;

        // Gradient from beam color to transparent
        ctx.fillStyle = glowColor;
        ctx.fillRect(x + 1, y, barWidth - 2, barH);

        ctx.fillStyle = beamColor;
        ctx.fillRect(x + 1, y, barWidth - 2, 2); // Cap
      }

      // 2. Draw Main CRT Phosphor Oscilloscope Beam
      ctx.shadowBlur = 12;
      ctx.shadowColor = glowColor;
      ctx.strokeStyle = beamColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeData[i];
        // Scale to upper 70% of screen centered around height * 0.38
        const y = (height * 0.38) + (v * (height * 0.35));

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow

      // Draw On-Screen Display (OSD) labels
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('INPUT: 48kHz 24-BIT LOSSLESS', 14, 18);
      ctx.fillText(`DSP CHAIN: ${activePreset.toUpperCase()}`, 14, 32);

      if (isRecording) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('● REC STREAM ACTIVE', width - 150, 18);
      } else {
        ctx.fillStyle = '#10b981';
        ctx.fillText('STANDBY / MONITORING', width - 165, 18);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyser, activePreset, isRecording]);

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-[#090d14] shadow-2xl">
      <div className="absolute top-2 right-3 z-10 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="text-[10px] font-mono tracking-wider text-emerald-400">60 FPS REAL-TIME</span>
      </div>
      <canvas
        ref={canvasRef}
        width={960}
        height={240}
        className="w-full h-48 md:h-56 block object-cover"
      />
    </div>
  );
};
