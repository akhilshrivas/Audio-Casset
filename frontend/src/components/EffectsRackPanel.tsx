/**
 * DeshiWave DSP - Modern Spotify-Style Effects Control Panel
 * Controls for Bhojpuri Garda, Kishore Kumar Golden Cassette, Vividh Bharati Radio, and Concert Reverb.
 */

import React, { useState } from 'react';
import { Flame, Disc, Radio, Waves, Mic, Sliders, Activity, Zap, Sparkles } from 'lucide-react';
import { AudioEngine, PresetType } from '../audio/AudioEngine';

interface EffectsRackProps {
  engine: AudioEngine | null;
  activePreset: PresetType;
  onPresetSelect: (preset: PresetType) => void;
  detectedPitch: number;
  targetPitch: number;
}

export const EffectsRackPanel: React.FC<EffectsRackProps> = ({
  engine,
  activePreset,
  onPresetSelect,
  detectedPitch,
  targetPitch,
}) => {
  const [bhojpuriScale, setBhojpuriScale] = useState<string>('bhairavi');
  const [presenceGain, setPresenceGain] = useState<number>(7.0);
  const [slapbackMs, setSlapbackMs] = useState<number>(135.0);
  const [slapbackFb, setSlapbackFb] = useState<number>(0.38);

  // Kishore Kumar Cassette parameters
  const [tapeWarmth, setTapeWarmth] = useState<number>(3.5);
  const [cassetteDrive, setCassetteDrive] = useState<number>(2.8);
  const [flutterDepth, setFlutterDepth] = useState<number>(0.4);
  const [tapeRollOff, setTapeRollOff] = useState<number>(12800);
  const [cabinetSpace, setCabinetSpace] = useState<number>(0.16);
  const [hissDb, setHissDb] = useState<number>(-46);

  // Radio parameters
  const [radioDrive, setRadioDrive] = useState<number>(3.2);
  const [cabinetGain, setCabinetGain] = useState<number>(3.5);
  const [radioStaticDb, setRadioStaticDb] = useState<number>(-44);

  // Reverb parameters
  const [reverbDecay, setReverbDecay] = useState<number>(3.0);
  const [reverbPreDelay, setReverbPreDelay] = useState<number>(40);
  const [reverbWet, setReverbWet] = useState<number>(0.45);

  const handleScaleChange = (scale: string) => {
    setBhojpuriScale(scale);
    if (engine && engine.bhojpuriEffect) {
      engine.bhojpuriEffect.setScale(scale);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'scale', value: scale });
    }
  };

  const handlePresenceChange = (val: number) => {
    setPresenceGain(val);
    if (engine && engine.bhojpuriEffect) {
      engine.bhojpuriEffect.setPresenceGain(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'presence_gain_db', value: val });
    }
  };

  const handleSlapbackChange = (ms: number) => {
    setSlapbackMs(ms);
    if (engine && engine.bhojpuriEffect) {
      engine.bhojpuriEffect.setSlapbackDelayTime(ms);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'delay_ms', value: ms });
    }
  };

  const handleSlapbackFbChange = (fb: number) => {
    setSlapbackFb(fb);
    if (engine && engine.bhojpuriEffect) {
      engine.bhojpuriEffect.setFeedback(fb);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'feedback', value: fb });
    }
  };

  // Cassette handlers
  const handleTapeWarmthChange = (val: number) => {
    setTapeWarmth(val);
    if (engine && engine.cassetteEffect) {
      engine.cassetteEffect.setWarmth(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'tape_warmth_db', value: val });
    }
  };

  const handleCassetteDriveChange = (val: number) => {
    setCassetteDrive(val);
    if (engine && engine.cassetteEffect) {
      engine.cassetteEffect.setDrive(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'tape_drive', value: val });
    }
  };

  const handleFlutterChange = (val: number) => {
    setFlutterDepth(val);
    if (engine && engine.cassetteEffect) {
      engine.cassetteEffect.setFlutterDepth(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'flutter_depth', value: val });
    }
  };

  const handleTapeRollOffChange = (val: number) => {
    setTapeRollOff(val);
    if (engine && engine.cassetteEffect) {
      engine.cassetteEffect.setTapeRollOff(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'tape_rolloff_hz', value: val });
    }
  };

  const handleCabinetSpaceChange = (val: number) => {
    setCabinetSpace(val);
    if (engine && engine.cassetteEffect) {
      engine.cassetteEffect.setCabinetSpace(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'cabinet_space', value: val });
    }
  };

  const handleRadioDriveChange = (val: number) => {
    setRadioDrive(val);
    if (engine && engine.radioEffect) {
      engine.radioEffect.setDrive(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'radio_drive', value: val });
    }
  };

  const handleCabinetGainChange = (val: number) => {
    setCabinetGain(val);
    if (engine && engine.radioEffect) {
      engine.radioEffect.setCabinetGain(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'cabinet_gain_db', value: val });
    }
  };

  const handleReverbDecayChange = (val: number) => {
    setReverbDecay(val);
    if (engine && engine.reverbEffect) {
      engine.reverbEffect.setDecayTime(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'reverb_decay', value: val });
    }
  };

  const handleReverbWetChange = (val: number) => {
    setReverbWet(val);
    if (engine && engine.reverbEffect) {
      engine.reverbEffect.setDryWet(val);
      engine.emitTelemetry('KNOB_ADJUSTED', { param: 'reverb_wet', value: val });
    }
  };

  const presets = [
    {
      id: 'cassette' as PresetType,
      title: 'Kishore Kumar Cassette',
      desc: 'Warm Analog Tape Head Bump + Silky 12.8kHz Roll-off + Reel Drift',
      icon: Disc,
      color: '#f59e0b',
      badge: 'POPULAR VIBE',
    },
    {
      id: 'radio' as PresetType,
      title: 'Vividh Bharati Radio',
      desc: 'Transistor Broadcast Warmth + 1.4kHz Wooden Cabinet Resonance',
      icon: Radio,
      color: '#a855f7',
      badge: 'AIR VINTAGE',
    },
    {
      id: 'bhojpuri' as PresetType,
      title: 'Bhojpuri Garda',
      desc: '0ms Pitch Snap + 3.2kHz Bite + Slapback Echo',
      icon: Flame,
      color: '#ff2d55',
    },
    {
      id: 'reverb' as PresetType,
      title: 'Concert Hall',
      desc: 'Lush Algorithmic Convolution Reverb',
      icon: Waves,
      color: '#00e5ff',
    },
    {
      id: 'dry' as PresetType,
      title: 'Studio Dry',
      desc: 'Pure Unprocessed 24-Bit / 48kHz PCM',
      icon: Mic,
      color: '#1db954',
    },
  ];

  return (
    <div className="bg-[#181818] border border-[#282828] rounded-2xl p-5 md:p-6 shadow-xl">
      {/* Title */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#1db954]" />
          <h2 className="text-base font-bold text-white tracking-tight">
            DSP Master Effect Chain
          </h2>
        </div>
        <span className="text-xs text-neutral-400 bg-neutral-900 px-3 py-1 rounded-full border border-neutral-800">
          Zero-Latency Web Audio Engine
        </span>
      </div>

      {/* Preset Cards Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const isSelected = activePreset === preset.id;

          return (
            <button
              key={preset.id}
              onClick={() => onPresetSelect(preset.id)}
              className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between group ${
                isSelected
                  ? 'bg-[#242424] border-[#1db954] shadow-lg shadow-black/40 scale-[1.02]'
                  : 'bg-[#141414] border-[#262626] hover:bg-[#1f1f1f] hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all group-hover:scale-110"
                  style={{
                    backgroundColor: isSelected ? `${preset.color}25` : '#222222',
                    color: preset.color,
                  }}
                >
                  <Icon className="w-4 h-4" />
                </div>
                {isSelected ? (
                  <span className="w-2 h-2 rounded-full bg-[#1db954] shadow-[0_0_8px_#1db954]" />
                ) : preset.badge ? (
                  <span className="text-[9px] font-bold text-amber-400/90 font-mono">
                    {preset.badge}
                  </span>
                ) : null}
              </div>
              <div>
                <div className="font-bold text-xs text-white mb-0.5">{preset.title}</div>
                <div className="text-[10px] text-neutral-400 line-clamp-1">{preset.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detailed Macro Sliders for Active Preset */}
      <div className="bg-[#121212] border border-[#242424] rounded-xl p-5">
        {/* Kishore Kumar Golden Cassette Controls */}
        {activePreset === 'cassette' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Disc className="w-4 h-4 text-[#f59e0b]" />
                <span className="font-bold text-xs text-white">
                  Kishore Kumar Golden Cassette & Analog Tape Tuning
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => engine?.cassetteEffect?.playMechanicalClunk()}
                  className="text-xs bg-[#242424] hover:bg-[#2e2e2e] text-[#f59e0b] px-3 py-1 rounded-full border border-neutral-800 flex items-center gap-1.5 transition"
                >
                  <Zap className="w-3.5 h-3.5" /> Solenoid Clunk
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Tape Head Warmth (195 Hz head bump) */}
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> Tape Head Warmth (195 Hz)
                  </span>
                  <span className="font-bold text-[#f59e0b]">+{tapeWarmth.toFixed(1)} dB</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="7"
                  step="0.5"
                  value={tapeWarmth}
                  onChange={(e) => handleTapeWarmthChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#f59e0b]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Velvety chest resonance of vintage vocal masters
                </span>
              </div>

              {/* Organic Reel Drift */}
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Organic Reel Drift (0.5 Hz Wow)</span>
                  <span className="font-bold text-[#f59e0b]">{Math.round(flutterDepth * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={flutterDepth}
                  onChange={(e) => handleFlutterChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#f59e0b]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Gentle, slow analog capstan tape movement
                </span>
              </div>

              {/* Magnetic Tape Saturation */}
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Magnetic Tape Saturation</span>
                  <span className="font-bold text-[#f59e0b]">{cassetteDrive.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.2"
                  value={cassetteDrive}
                  onChange={(e) => handleCassetteDriveChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#f59e0b]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Harmonic warmth & soft analog dynamic glue
                </span>
              </div>

              {/* Tape Roll-Off Silkiness */}
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Smooth Tape Roll-Off</span>
                  <span className="font-bold text-[#f59e0b]">{(tapeRollOff / 1000).toFixed(1)} kHz</span>
                </div>
                <input
                  type="range"
                  min="9000"
                  max="15000"
                  step="250"
                  value={tapeRollOff}
                  onChange={(e) => handleTapeRollOffChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#f59e0b]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Tames harsh digital glare into sweet analog air
                </span>
              </div>

              {/* Wooden Cabinet Space */}
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Wooden Cabinet Ambience</span>
                  <span className="font-bold text-[#f59e0b]">{Math.round((cabinetSpace / 0.4) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.35"
                  step="0.02"
                  value={cabinetSpace}
                  onChange={(e) => handleCabinetSpaceChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#f59e0b]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Acoustic illusion of playing from a vintage cassette boombox
                </span>
              </div>

              {/* Analog Tape Hiss Level */}
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Analog Tape Hiss Bed</span>
                  <span className="font-bold text-[#f59e0b]">{hissDb <= -58 ? 'MUTED' : `${hissDb} dB`}</span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="-32"
                  step="2"
                  value={hissDb}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setHissDb(val);
                    engine?.cassetteEffect?.setHissVolume(val);
                  }}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#f59e0b]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Turn to minimum for 100% clean, silent background
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Vividh Bharati Radio Controls */}
        {activePreset === 'radio' && (
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#a855f7]" />
                <span className="font-bold text-xs text-white">
                  Vividh Bharati Radio (Classic Indian Transistor Vibe)
                </span>
              </div>
              <button
                onClick={() => engine?.radioEffect?.triggerTuningSweep()}
                className="text-xs bg-[#242424] hover:bg-[#2e2e2e] text-[#a855f7] px-3 py-1 rounded-full border border-neutral-800 flex items-center gap-1.5 transition"
              >
                <Zap className="w-3.5 h-3.5" /> Dial Tuning Whistle
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Transistor Warmth & Drive</span>
                  <span className="font-bold text-[#a855f7]">{radioDrive.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="6.0"
                  step="0.2"
                  value={radioDrive}
                  onChange={(e) => handleRadioDriveChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#a855f7]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Smooth germanium diode saturation curve
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Radio Cabinet Peak (1.45 kHz)</span>
                  <span className="font-bold text-[#a855f7]">+{cabinetGain.toFixed(1)} dB</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="6.0"
                  step="0.5"
                  value={cabinetGain}
                  onChange={(e) => handleCabinetGainChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#a855f7]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Vintage wooden radio chassis resonance
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Atmospheric Broadcast Air</span>
                  <span className="font-bold text-[#a855f7]">{radioStaticDb <= -56 ? 'MUTED' : `${radioStaticDb} dB`}</span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="-26"
                  step="2"
                  value={radioStaticDb}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setRadioStaticDb(val);
                    engine?.radioEffect?.setStaticVolume(val);
                  }}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#a855f7]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Subtle radio air (turn down for clean broadcast)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bhojpuri Garda Controls */}
        {activePreset === 'bhojpuri' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-[#ff2d55]" />
                <span className="font-bold text-xs text-white">
                  Bhojpuri Garda Iconic Vocal Controls
                </span>
              </div>

              {/* Pitch Snapping HUD Pill */}
              <div className="flex items-center gap-3 bg-[#1e1e1e] px-3 py-1 rounded-full text-xs font-mono text-neutral-300 border border-neutral-800">
                <Activity className="w-3.5 h-3.5 text-[#ff2d55] animate-pulse" />
                <span>Detected: <strong className="text-white">{detectedPitch > 0 ? `${detectedPitch.toFixed(0)} Hz` : '---'}</strong></span>
                <span>•</span>
                <span>Snapped: <strong className="text-[#1db954]">{targetPitch > 0 ? `${targetPitch.toFixed(0)} Hz` : '---'}</strong></span>
              </div>
            </div>

            {/* Scale Selector Pill Buttons */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-neutral-300 mb-2">
                Select Auto-Tune Musical Scale:
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'bhairavi', label: 'Raag Bhairavi (Iconic Deshi)' },
                  { id: 'chromatic', label: 'Chromatic (Hard Robot Snap)' },
                  { id: 'major', label: 'Major (Bilawal)' },
                  { id: 'minor', label: 'Natural Minor (Asavari)' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleScaleChange(s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      bhojpuriScale === s.id
                        ? 'bg-[#ff2d55] text-white font-bold shadow-md'
                        : 'bg-[#222222] text-neutral-300 hover:bg-[#2c2c2c]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>3.2 kHz Mid Presence Bite</span>
                  <span className="font-bold text-[#ff2d55]">+{presenceGain.toFixed(1)} dB</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="0.5"
                  value={presenceGain}
                  onChange={(e) => handlePresenceChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#ff2d55]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Slapback Echo Delay</span>
                  <span className="font-bold text-[#ff2d55]">{slapbackMs.toFixed(0)} ms</span>
                </div>
                <input
                  type="range"
                  min="80"
                  max="280"
                  step="5"
                  value={slapbackMs}
                  onChange={(e) => handleSlapbackChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#ff2d55]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Stadium Echo Feedback</span>
                  <span className="font-bold text-[#ff2d55]">{Math.round(slapbackFb * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.75"
                  step="0.02"
                  value={slapbackFb}
                  onChange={(e) => handleSlapbackFbChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#ff2d55]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Concert Reverb Controls */}
        {activePreset === 'reverb' && (
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Waves className="w-4 h-4 text-[#00e5ff]" />
                <span className="font-bold text-xs text-white">
                  Studio Concert Reverb IR Space
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Decay Time</span>
                  <span className="font-bold text-[#00e5ff]">{reverbDecay.toFixed(1)} s</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.1"
                  value={reverbDecay}
                  onChange={(e) => handleReverbDecayChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#00e5ff]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Pre-Delay</span>
                  <span className="font-bold text-[#00e5ff]">{reverbPreDelay} ms</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="80"
                  step="1"
                  value={reverbPreDelay}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setReverbPreDelay(val);
                    engine?.reverbEffect?.setPreDelay(val);
                  }}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#00e5ff]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Wet / Dry Balance</span>
                  <span className="font-bold text-[#00e5ff]">{Math.round(reverbWet * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={reverbWet}
                  onChange={(e) => handleReverbWetChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#00e5ff]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Studio Dry */}
        {activePreset === 'dry' && (
          <div className="text-center py-4 text-xs text-[#1db954] font-medium">
            ✓ Studio High-Res Mode: Clean uncolored 24-bit PCM capture bypassing browser echo cancellation and noise suppression.
          </div>
        )}
      </div>
    </div>
  );
};
