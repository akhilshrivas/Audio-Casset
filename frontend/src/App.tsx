/**
 * DeshiWave DSP - Spotify-Grade Studio & Audio Lakehouse Shell
 * Sleek, smooth, modern dark UI inspired by Spotify with drag & drop music upload,
 * real-time DSP effects, and Parquet / DuckDB Medallion Lakehouse telemetry.
 */

import React, { useState, useRef } from 'react';
import {
  Disc,
  Database,
  Music,
  Upload,
  Mic,
  MicOff,
  Flame,
  Radio,
  Waves,
  Sparkles,
  CheckCircle,
  Play,
  Pause,
  CircleDot,
  Download,
  Sliders,
} from 'lucide-react';

import { AudioEngine, PresetType, RecordedTakeResult } from './audio/AudioEngine';
import { CassetteDeckVisualizer } from './components/CassetteDeckVisualizer';
import { ModernVisualizer } from './components/ModernVisualizer';
import { TrackUploader } from './components/TrackUploader';
import { EffectsRackPanel } from './components/EffectsRackPanel';
import { LakehouseAnalyticsTab } from './components/LakehouseAnalyticsTab';
import { SpotifyPlayerBar } from './components/SpotifyPlayerBar';

export const App: React.FC = () => {
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  const [activeTab, setActiveTab] = useState<'studio' | 'uploads' | 'lakehouse'>('studio');
  const [activePreset, setActivePreset] = useState<PresetType>('cassette');
  const [visualizerMode, setVisualizerMode] = useState<'cassette' | 'spectrum' | 'both'>('cassette');

  // Track playback state
  const [trackTitle, setTrackTitle] = useState<string>('Kishore Kumar Classics • HMV Master');
  const [uploadedFileSize, setUploadedFileSize] = useState<number | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(180);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(true);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  // Live telemetry metrics
  const [detectedPitch, setDetectedPitch] = useState<number>(0);
  const [targetPitch, setTargetPitch] = useState<number>(0);
  const [peakDb, setPeakDb] = useState<number>(-96);

  // Take / Upload state
  const [lastTake, setLastTake] = useState<RecordedTakeResult | null>(null);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const fileInputSidebarRef = useRef<HTMLInputElement | null>(null);

  // Initialize AudioEngine on first user interaction
  const getOrCreateEngine = async (): Promise<AudioEngine> => {
    if (engine) {
      if (engine.ctx && engine.ctx.state === 'suspended') {
        await engine.ctx.resume();
      }
      return engine;
    }

    const eng = new AudioEngine();
    await eng.initialize();

    eng.onPitchDetected = (f0, targetF0) => {
      setDetectedPitch(f0);
      setTargetPitch(targetF0);
    };

    eng.onMeterUpdate = (_rmsL, _rmsR, peak) => {
      setPeakDb(peak);
    };

    eng.onPlaybackProgress = (curr, dur) => {
      setCurrentTime(curr);
      setDuration(dur);
    };

    eng.onTrackEnded = () => {
      setIsPlaying(false);
    };

    setEngine(eng);
    return eng;
  };

  // Preset Selection
  const handlePresetSelect = async (preset: PresetType) => {
    setActivePreset(preset);
    const eng = await getOrCreateEngine();
    eng.setPreset(preset);

    if (preset === 'cassette' || preset === 'radio') {
      setVisualizerMode('cassette');
    }
  };

  // Play / Pause Toggle
  const handleTogglePlay = async () => {
    const eng = await getOrCreateEngine();
    if (eng.uploadedFile) {
      eng.togglePlayPause();
      setIsPlaying(eng.isTrackPlaying);
    } else if (lastTake) {
      if (isPlaying) {
        setIsPlaying(false);
      } else {
        const audio = new Audio(lastTake.audioUrl);
        audio.play();
        setIsPlaying(true);
        audio.onended = () => setIsPlaying(false);
      }
    } else {
      showNotification('Click "Load Kishore Kumar Demo Stem" or upload a song to play through the tape deck!', 'info');
    }
  };

  // File Upload Handler
  const handleFileSelected = async (file: File) => {
    try {
      const eng = await getOrCreateEngine();
      const meta = await eng.loadAudioFile(file);
      setTrackTitle(meta.name);
      setDuration(meta.duration);
      setUploadedFileSize(file.size);
      setCurrentTime(0);

      // Start playback automatically through DSP
      await eng.playTrack();
      setIsPlaying(true);

      showNotification(`Loaded "${file.name}"! Playing through ${activePreset.toUpperCase()} DSP.`, 'success');
    } catch (err: any) {
      showNotification(`File load failed: ${err.message}`, 'info');
    }
  };

  // Microphone Toggle
  const handleToggleMic = async () => {
    const eng = await getOrCreateEngine();
    if (isMicActive) {
      eng.disableMicrophone();
      setIsMicActive(false);
      showNotification('Microphone muted', 'info');
    } else {
      try {
        await eng.enableMicrophone();
        setIsMicActive(true);
        showNotification('Live studio microphone active (48kHz Lossless)', 'success');
      } catch (err: any) {
        alert(`Mic access denied: ${err.message}`);
      }
    }
  };

  // Record Post-DSP Take
  const handleToggleRecord = async () => {
    const eng = await getOrCreateEngine();
    if (!isRecording) {
      eng.startRecording();
      setIsRecording(true);
      showNotification('Recording started (capturing 24-bit post-DSP output)...', 'info');
    } else {
      try {
        setIsRecording(false);
        const take = await eng.stopRecording();
        setLastTake(take);
        showNotification('Recording captured! Ready to download or ingest into lakehouse.', 'success');
      } catch (err: any) {
        showNotification(`Recording error: ${err.message}`, 'info');
      }
    }
  };

  // Ingest into Lakehouse (Bronze -> Silver Parquet -> Gold DuckDB)
  const handleIngestToLakehouse = async () => {
    const eng = await getOrCreateEngine();
    const fileToUpload = eng.uploadedFile || (lastTake ? lastTake.blob : null);

    if (!fileToUpload) {
      showNotification('No audio file or recorded take to ingest into the lakehouse!', 'info');
      return;
    }

    setIsIngesting(true);
    showNotification('Streaming to Bronze layer & extracting Silver Parquet features...', 'info');

    try {
      const formData = new FormData();
      const filename = eng.uploadedTrackName || (lastTake ? `${lastTake.takeId}.wav` : 'track.wav');
      formData.append('file', fileToUpload, filename);
      formData.append('session_id', eng.getSessionId());
      formData.append('preset_name', activePreset);
      formData.append(
        'client_metadata_json',
        JSON.stringify({
          trackName: trackTitle,
          durationSec: duration,
        })
      );

      const res = await fetch('/api/ingest/take', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        showNotification('✓ Ingested to Bronze WAV & Materialized Silver Parquet!', 'success');
      } else {
        showNotification('Backend lakehouse ingestion failed', 'info');
      }
    } catch (err: any) {
      showNotification(`Upload error: ${err.message}`, 'info');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleSeek = (timeSec: number) => {
    if (engine) {
      engine.seekTrack(timeSec);
      setCurrentTime(timeSec);
    }
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    if (engine) {
      engine.setMasterGain(vol);
    }
  };

  const handleToggleMonitoring = () => {
    const next = !isMonitoring;
    setIsMonitoring(next);
    if (engine) {
      engine.setMonitoring(next);
    }
  };

  const showNotification = (msg: string, type: 'success' | 'info') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const presetList = [
    { id: 'cassette' as PresetType, name: 'Kishore Kumar Cassette', dot: '#f59e0b', desc: 'Warm 195Hz + Tape Drift' },
    { id: 'radio' as PresetType, name: 'Vividh Bharati Radio', dot: '#a855f7', desc: 'Transistor Broadcast' },
    { id: 'bhojpuri' as PresetType, name: 'Bhojpuri Garda', dot: '#ff2d55', desc: '0ms Pitch Snap' },
    { id: 'reverb' as PresetType, name: 'Concert Hall', dot: '#00e5ff', desc: '3.0s Convolution' },
    { id: 'dry' as PresetType, name: 'Studio Dry', dot: '#1db954', desc: 'Direct 48kHz' },
  ];

  return (
    <div className="flex h-screen bg-[#121212] text-white font-sans overflow-hidden select-none">
      <input
        ref={fileInputSidebarRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.flac,.aac,.ogg"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* 1. Left Sidebar (Spotify Native Aesthetic) */}
      <aside className="w-64 bg-[#000000] p-4 flex flex-col justify-between hidden md:flex border-r border-[#1e1e1e]">
        <div>
          {/* Brand Logo */}
          <div className="flex items-center gap-2.5 px-3 py-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 via-amber-400 to-[#1db954] flex items-center justify-center text-black font-extrabold shadow-[0_0_12px_rgba(245,158,11,0.4)]">
              <Disc className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-wider text-white">DESHIWAVE</div>
              <div className="text-[10px] text-amber-400 font-mono tracking-tight">Audio DSP Lakehouse</div>
            </div>
          </div>

          {/* Primary Navigation */}
          <nav className="space-y-1 mb-6">
            <button
              onClick={() => setActiveTab('studio')}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'studio'
                  ? 'bg-[#282828] text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              <Music className="w-4 h-4 text-[#1db954]" />
              Studio & Tape Deck
            </button>

            <button
              onClick={() => {
                setActiveTab('uploads');
                fileInputSidebarRef.current?.click();
              }}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'uploads'
                  ? 'bg-[#282828] text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              <Upload className="w-4 h-4 text-[#f59e0b]" />
              Upload Music File
            </button>

            <button
              onClick={() => setActiveTab('lakehouse')}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'lakehouse'
                  ? 'bg-[#282828] text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              <Database className="w-4 h-4 text-[#00e5ff]" />
              Lakehouse Explorer
            </button>
          </nav>

          {/* Upload Music Call-To-Action Card */}
          <div className="bg-[#141210] border border-amber-900/40 rounded-xl p-3.5 mb-6 shadow-inner">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Kishore Kumar Radio Vibe</span>
            </div>
            <p className="text-[11px] text-neutral-400 mb-3 leading-relaxed">
              Upload your favourite songs or Bollywood classics to hear them in high-fidelity golden tape & radio warmth.
            </p>
            <button
              onClick={() => fileInputSidebarRef.current?.click()}
              className="w-full py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs rounded-full transition shadow-md"
            >
              Upload Song File
            </button>
          </div>

          {/* Preset Chains List */}
          <div className="px-2">
            <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2.5">
              DSP Preset Chains
            </div>
            <div className="space-y-1">
              {presetList.map((p) => {
                const isSelected = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePresetSelect(p.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition ${
                      isSelected
                        ? 'bg-[#222222] text-white font-semibold'
                        : 'text-neutral-400 hover:text-white hover:bg-[#161616]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: p.dot }}
                      />
                      <span>{p.name}</span>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] text-amber-400 font-bold">ACTIVE</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-4 border-t border-[#1e1e1e] text-[11px] text-neutral-500 font-mono">
          48kHz Lossless • DuckDB OLAP
        </div>
      </aside>

      {/* 2. Main Content Scrollable Area */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto pb-28">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-[#121212]/95 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-[#222222]">
          <div className="flex items-center gap-3">
            {/* Mobile Tab Switcher */}
            <div className="flex md:hidden bg-[#242424] p-1 rounded-full text-xs">
              <button
                onClick={() => setActiveTab('studio')}
                className={`px-3 py-1 rounded-full font-bold ${
                  activeTab === 'studio' ? 'bg-[#1db954] text-black' : 'text-neutral-300'
                }`}
              >
                Studio
              </button>
              <button
                onClick={() => setActiveTab('lakehouse')}
                className={`px-3 py-1 rounded-full font-bold ${
                  activeTab === 'lakehouse' ? 'bg-[#1db954] text-black' : 'text-neutral-300'
                }`}
              >
                Lakehouse
              </button>
            </div>

            <div className="hidden md:flex items-center gap-2 text-xs text-neutral-400">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>Golden Tape Engine:</span>
              <span className="text-white font-semibold">48,000 Hz / 24-Bit Lossless Analog DSP</span>
            </div>
          </div>

          {/* Quick Actions (Mic, Record, Upload) */}
          <div className="flex items-center gap-2.5">
            {/* Live Mic Toggle */}
            <button
              onClick={handleToggleMic}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition ${
                isMicActive
                  ? 'bg-red-500/15 border-red-500 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                  : 'bg-[#242424] border-neutral-700 text-neutral-300 hover:text-white'
              }`}
            >
              {isMicActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              {isMicActive ? 'Mic Active' : 'Mic Off'}
            </button>

            {/* Record Take Button */}
            <button
              onClick={handleToggleRecord}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition ${
                isRecording
                  ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-900/50'
                  : 'bg-[#242424] text-neutral-200 hover:bg-[#2e2e2e] border border-neutral-700'
              }`}
            >
              <CircleDot className="w-3.5 h-3.5 text-red-500" />
              {isRecording ? 'Recording...' : 'Record Take'}
            </button>

            {/* Fast Upload Button */}
            <button
              onClick={() => fileInputSidebarRef.current?.click()}
              className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs rounded-full flex items-center gap-1.5 transition shadow-md"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Audio
            </button>
          </div>
        </header>

        {/* Notification Toast */}
        {notification && (
          <div className="fixed top-16 right-6 z-50 bg-amber-500 text-black px-4 py-2 rounded-full font-bold text-xs shadow-2xl flex items-center gap-2 animate-bounce">
            <CheckCircle className="w-4 h-4" />
            {notification.message}
          </div>
        )}

        {/* Main View Container */}
        <main className="p-6 max-w-6xl w-full mx-auto space-y-6">
          {activeTab === 'lakehouse' ? (
            /* Data Engineer's Lakehouse Explorer View */
            <LakehouseAnalyticsTab
              currentSessionId={engine ? engine.getSessionId() : 'session_default'}
            />
          ) : (
            /* Studio & Player View */
            <div className="space-y-6">
              {/* Spotify-style Hero Banner for Active Track */}
              <div className="relative rounded-2xl bg-gradient-to-r from-[#2c221a] via-[#1c1815] to-[#121212] border border-[#3d332a] p-6 shadow-2xl flex flex-wrap items-center justify-between gap-6 overflow-hidden">
                <div className="flex items-center gap-5 z-10">
                  {/* Big Album Art Square */}
                  <div className="w-28 h-28 rounded-xl bg-gradient-to-br from-amber-600 via-[#3a2012] to-black p-1 shadow-2xl flex-shrink-0 group relative overflow-hidden border border-amber-600/30">
                    <div className="w-full h-full bg-[#121110] rounded-lg flex items-center justify-center">
                      <Disc
                        className={`w-14 h-14 text-amber-400 ${isPlaying ? 'animate-spin' : ''}`}
                        style={{ animationDuration: '4s' }}
                      />
                    </div>
                  </div>

                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-400 uppercase tracking-wider">
                      {activePreset} DSP active
                    </span>
                    <h2 className="text-xl md:text-2xl font-extrabold text-white mt-1 mb-1 truncate max-w-md">
                      {trackTitle}
                    </h2>
                    <p className="text-xs text-neutral-400">
                      High-Fidelity Vintage Analog Tape & Broadcast Engine • 48kHz
                    </p>
                  </div>
                </div>

                {/* Big Circular Play/Pause in Hero Banner */}
                <div className="flex items-center gap-4 z-10">
                  <button
                    onClick={handleTogglePlay}
                    className="w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-xl transition active:scale-95 hover:scale-105"
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6 fill-black" />
                    ) : (
                      <Play className="w-6 h-6 fill-black translate-x-0.5" />
                    )}
                  </button>

                  <button
                    onClick={handleIngestToLakehouse}
                    disabled={isIngesting}
                    className="px-4 py-2.5 rounded-full bg-[#24201c] hover:bg-[#332c26] text-amber-200 font-semibold text-xs border border-amber-800/60 flex items-center gap-2 transition"
                  >
                    <Database className="w-4 h-4 text-[#00e5ff]" />
                    {isIngesting ? 'Ingesting...' : 'Ingest to Lakehouse'}
                  </button>
                </div>
              </div>

              {/* Dedicated Drag-and-Drop Music Uploader Card */}
              <TrackUploader
                onFileSelected={handleFileSelected}
                uploadedTrackName={engine?.uploadedTrackName || null}
                uploadedFileSize={uploadedFileSize}
                isTrackPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                onIngestToLakehouse={handleIngestToLakehouse}
                isIngesting={isIngesting}
              />

              {/* Visualizer Mode Switcher */}
              <div className="flex items-center justify-between bg-[#181818] px-4 py-2.5 rounded-xl border border-[#282828]">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
                  <span>Display Mode:</span>
                </div>
                <div className="flex gap-1.5 bg-[#121212] p-1 rounded-lg border border-neutral-800 text-xs">
                  <button
                    onClick={() => setVisualizerMode('cassette')}
                    className={`px-3 py-1 rounded-md font-medium transition ${
                      visualizerMode === 'cassette'
                        ? 'bg-amber-600 text-white font-bold shadow'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    📼 Vintage Cassette Deck
                  </button>
                  <button
                    onClick={() => setVisualizerMode('spectrum')}
                    className={`px-3 py-1 rounded-md font-medium transition ${
                      visualizerMode === 'spectrum'
                        ? 'bg-[#1db954] text-black font-bold shadow'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    📊 Canvas Spectrum
                  </button>
                  <button
                    onClick={() => setVisualizerMode('both')}
                    className={`px-3 py-1 rounded-md font-medium transition ${
                      visualizerMode === 'both'
                        ? 'bg-[#2a2a2a] text-white font-bold shadow'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    ✨ Split Both
                  </button>
                </div>
              </div>

              {/* Cassette Deck Visualizer Component */}
              {(visualizerMode === 'cassette' || visualizerMode === 'both') && (
                <CassetteDeckVisualizer
                  isRecording={isRecording}
                  isPlaying={isPlaying}
                  onPlayToggle={handleTogglePlay}
                  onStop={() => {
                    if (isPlaying) handleTogglePlay();
                  }}
                  onRecordToggle={handleToggleRecord}
                  peakDb={peakDb}
                  activePreset={activePreset}
                  trackTitle={trackTitle}
                  currentTime={currentTime}
                  duration={duration}
                  onTapeWarmthChange={(val) => engine?.cassetteEffect?.setWarmth(val)}
                  onFlutterChange={(val) => engine?.cassetteEffect?.setFlutterDepth(val)}
                  onHissToggle={(enabled) => engine?.cassetteEffect?.setHissVolume(enabled ? -46 : -96)}
                />
              )}

              {/* Modern Fluid Canvas Visualizer */}
              {(visualizerMode === 'spectrum' || visualizerMode === 'both') && (
                <ModernVisualizer
                  analyser={engine ? engine.analyser : null}
                  activePreset={activePreset}
                  isPlayingOrRecording={isPlaying || isRecording || isMicActive}
                  trackTitle={trackTitle}
                />
              )}

              {/* Modern DSP Controls Panel */}
              <EffectsRackPanel
                engine={engine}
                activePreset={activePreset}
                onPresetSelect={handlePresetSelect}
                detectedPitch={detectedPitch}
                targetPitch={targetPitch}
              />

              {/* Recorded Take Banner if available */}
              {lastTake && (
                <div className="bg-[#181818] border border-[#282828] rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">Latest Take Recorded</div>
                      <div className="text-xs text-neutral-400">
                        {lastTake.durationSec.toFixed(1)}s • {(lastTake.fileSizeBytes / 1024).toFixed(1)} KB (Lossless 24-bit/48kHz WAV)
                      </div>
                    </div>
                  </div>
                  <a
                    href={lastTake.audioUrl}
                    download={`${lastTake.takeId}.wav`}
                    className="px-4 py-2 bg-[#282828] hover:bg-[#333333] text-white text-xs font-semibold rounded-full border border-neutral-700 flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    Download WAV
                  </a>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 3. Persistent Spotify Bottom Player Bar */}
      <SpotifyPlayerBar
        trackTitle={trackTitle}
        presetName={activePreset}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        currentTime={currentTime}
        duration={duration}
        onSeek={handleSeek}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        isMonitoring={isMonitoring}
        onToggleMonitoring={handleToggleMonitoring}
        hasDownloadableTake={!!lastTake}
        onDownloadTake={() => {
          if (lastTake) {
            const a = document.createElement('a');
            a.href = lastTake.audioUrl;
            a.download = `${lastTake.takeId}.wav`;
            a.click();
          }
        }}
        peakDb={peakDb}
      />
    </div>
  );
};

export default App;
