/**
 * DeshiWave DSP - Master Audio Engine & Graph Router
 * Manages zero-latency Web Audio routing, AudioWorklet threads, effects rack,
 * live microphone streaming, uploaded music playback through DSP filters,
 * 24-bit/48kHz lossless recording, and real-time Bronze lakehouse WebSocket telemetry.
 */

import { encodeWAV24Bit } from './WavEncoder';
import { ReverbEffect } from './effects/ReverbEffect';
import { BhojpuriGardaEffect } from './effects/BhojpuriGardaEffect';
import { Cassette90sEffect } from './effects/Cassette90sEffect';
import { Radio90sEffect } from './effects/Radio90sEffect';

export type PresetType = 'dry' | 'reverb' | 'bhojpuri' | 'cassette' | 'radio';

export interface RecordedTakeResult {
  takeId: string;
  blob: Blob;
  audioUrl: string;
  durationSec: number;
  sampleRate: number;
  preset: PresetType;
  fileSizeBytes: number;
  trackName?: string;
}

export class AudioEngine {
  public ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;

  // Uploaded Track playback nodes
  private fileAudioElement: HTMLAudioElement | null = null;
  private fileSourceNode: MediaElementAudioSourceNode | null = null;
  public uploadedFile: File | null = null;
  public uploadedTrackName: string | null = null;
  public isTrackPlaying: boolean = false;
  public trackDuration: number = 0;
  public trackCurrentTime: number = 0;

  // Master Gain & Analyser
  private inputGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  public analyser: AnalyserNode | null = null;

  // AudioWorklet Nodes
  private recorderWorkletNode: AudioWorkletNode | null = null;
  private bhojpuriWorkletNode: AudioWorkletNode | null = null;

  // DSP Effects
  public reverbEffect: ReverbEffect | null = null;
  public bhojpuriEffect: BhojpuriGardaEffect | null = null;
  public cassetteEffect: Cassette90sEffect | null = null;
  public radioEffect: Radio90sEffect | null = null;

  // State
  public activePreset: PresetType = 'bhojpuri';
  public isRecording: boolean = false;
  public isMonitoring: boolean = true;
  public isMicActive: boolean = false;
  private recordStartTime: number = 0;
  private recordedBuffersL: Float32Array[] = [];
  private recordedBuffersR: Float32Array[] = [];

  // Callbacks
  public onPitchDetected: ((f0: number, targetF0: number, scale: string) => void) | null = null;
  public onMeterUpdate: ((rmsL: number, rmsR: number, peak: number) => void) | null = null;
  public onPlaybackProgress: ((currentTime: number, duration: number) => void) | null = null;
  public onTrackEnded: (() => void) | null = null;

  // WebSocket for Bronze real-time ingestion
  private telemetryWs: WebSocket | null = null;
  private sessionId: string = `sess_${Math.random().toString(36).substring(2, 9)}`;

  constructor() {
    this.initWebSocket();
  }

  private initWebSocket() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
      this.telemetryWs = new WebSocket(wsUrl);

      this.telemetryWs.onopen = () => {
        this.emitTelemetry('STUDIO_CLIENT_CONNECTED', {
          sessionId: this.sessionId,
          activePreset: this.activePreset,
        });
      };

      this.telemetryWs.onclose = () => {
        setTimeout(() => this.initWebSocket(), 3000);
      };
    } catch (_) {
      // WS fallback gracefully
    }
  }

  public emitTelemetry(eventType: string, payload: Record<string, any>) {
    if (this.telemetryWs && this.telemetryWs.readyState === WebSocket.OPEN) {
      this.telemetryWs.send(JSON.stringify({
        session_id: this.sessionId,
        event_type: eventType,
        payload: payload,
        timestamp_utc: new Date().toISOString(),
      }));
    }
  }

  public async initialize(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    // 1. Initialize High-Res 48kHz AudioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });

    // 2. Load AudioWorklets
    try {
      await this.ctx.audioWorklet.addModule('/worklets/pcm-recorder-worklet.js');
      this.recorderWorkletNode = new AudioWorkletNode(this.ctx, 'pcm-recorder-worklet');

      this.recorderWorkletNode.port.onmessage = (e) => {
        if (e.data.eventType === 'RECORDING_COMPLETE') {
          this.recordedBuffersL = e.data.buffersLeft;
          this.recordedBuffersR = e.data.buffersRight;
        }
      };
    } catch (e) {
      console.warn('PCM Recorder Worklet load fallback:', e);
    }

    try {
      await this.ctx.audioWorklet.addModule('/worklets/bhojpuri-pitch-worklet.js');
      this.bhojpuriWorkletNode = new AudioWorkletNode(this.ctx, 'bhojpuri-pitch-worklet');

      this.bhojpuriWorkletNode.port.onmessage = (e) => {
        if (e.data.eventType === 'PITCH_TELEMETRY' && this.onPitchDetected) {
          this.onPitchDetected(e.data.f0, e.data.targetF0, e.data.scale);
        }
      };
    } catch (e) {
      console.warn('Bhojpuri Pitch Worklet load fallback:', e);
    }

    // 3. Initialize Common Routing Nodes
    this.inputGain = this.ctx.createGain();
    this.inputGain.gain.value = 1.0;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.95;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Instantiate DSP Effects
    this.reverbEffect = new ReverbEffect(this.ctx);
    this.bhojpuriEffect = new BhojpuriGardaEffect(this.ctx, this.bhojpuriWorkletNode);
    this.cassetteEffect = new Cassette90sEffect(this.ctx);
    this.radioEffect = new Radio90sEffect(this.ctx);

    // Initial Routing
    this.routeActivePreset();

    // Start Meter Polling Loop
    this.startMeteringLoop();
  }

  public async enableMicrophone(): Promise<void> {
    await this.initialize();
    if (!this.ctx) return;

    if (this.micStream && this.micSourceNode) {
      this.isMicActive = true;
      return;
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 2,
      },
    });

    this.micSourceNode = this.ctx.createMediaStreamSource(this.micStream);
    if (this.inputGain) {
      this.micSourceNode.connect(this.inputGain);
      this.isMicActive = true;
    }
  }

  public disableMicrophone(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (_) {}
      this.micSourceNode = null;
    }
    this.isMicActive = false;
  }

  public async loadAudioFile(file: File): Promise<{ name: string; duration: number }> {
    await this.initialize();
    if (!this.ctx || !this.inputGain) throw new Error('Audio engine not initialized');

    // Pause existing playback
    if (this.fileAudioElement) {
      this.fileAudioElement.pause();
      this.fileAudioElement.currentTime = 0;
    }

    this.uploadedFile = file;
    this.uploadedTrackName = file.name;

    const fileUrl = URL.createObjectURL(file);
    const audio = new Audio(fileUrl);
    audio.crossOrigin = 'anonymous';

    await new Promise((resolve) => {
      audio.onloadedmetadata = () => {
        this.trackDuration = audio.duration || 0;
        resolve(true);
      };
    });

    // Create MediaElementSource and connect to inputGain
    if (this.fileSourceNode) {
      try {
        this.fileSourceNode.disconnect();
      } catch (_) {}
    }

    this.fileSourceNode = this.ctx.createMediaElementSource(audio);
    this.fileSourceNode.connect(this.inputGain);
    this.fileAudioElement = audio;

    // Set up progress tracking
    audio.ontimeupdate = () => {
      this.trackCurrentTime = audio.currentTime;
      if (this.onPlaybackProgress) {
        this.onPlaybackProgress(audio.currentTime, this.trackDuration);
      }
    };

    audio.onended = () => {
      this.isTrackPlaying = false;
      if (this.cassetteEffect) {
        this.cassetteEffect.setTransportState(false);
      }
      if (this.onTrackEnded) {
        this.onTrackEnded();
      }
    };

    this.emitTelemetry('AUDIO_FILE_LOADED', {
      fileName: file.name,
      fileSize: file.size,
      duration: this.trackDuration,
    });

    return {
      name: file.name,
      duration: this.trackDuration,
    };
  }

  public async playTrack(): Promise<void> {
    if (!this.ctx) await this.initialize();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.fileAudioElement) {
      if (this.cassetteEffect && this.activePreset === 'cassette') {
        this.cassetteEffect.setTransportState(true);
      }
      await this.fileAudioElement.play();
      this.isTrackPlaying = true;
      this.emitTelemetry('TRACK_PLAY_STARTED', { track: this.uploadedTrackName });
    }
  }

  public pauseTrack(): void {
    if (this.fileAudioElement) {
      this.fileAudioElement.pause();
      this.isTrackPlaying = false;
      if (this.cassetteEffect) {
        this.cassetteEffect.setTransportState(false);
      }
      this.emitTelemetry('TRACK_PLAY_PAUSED', { track: this.uploadedTrackName });
    }
  }

  public togglePlayPause(): void {
    if (this.isTrackPlaying) {
      this.pauseTrack();
    } else {
      this.playTrack();
    }
  }

  public seekTrack(timeSec: number): void {
    if (this.fileAudioElement) {
      const clamped = Math.max(0, Math.min(this.trackDuration, timeSec));
      this.fileAudioElement.currentTime = clamped;
      this.trackCurrentTime = clamped;
    }
  }

  public setPreset(preset: PresetType) {
    this.activePreset = preset;

    if (preset === 'cassette' && this.cassetteEffect) {
      this.cassetteEffect.playMechanicalClunk();
    } else if (preset === 'radio' && this.radioEffect) {
      this.radioEffect.triggerTuningSweep();
    }

    if (this.cassetteEffect) {
      const isRunning = (this.isTrackPlaying || this.isRecording) && preset === 'cassette';
      this.cassetteEffect.setTransportState(isRunning);
    }

    this.routeActivePreset();
    this.emitTelemetry('PRESET_CHANGED', { activePreset: preset });
  }

  private routeActivePreset() {
    if (!this.ctx || !this.inputGain || !this.masterGain || !this.analyser) return;

    // Disconnect input from all effect chains
    try {
      this.inputGain.disconnect();
      if (this.reverbEffect) this.reverbEffect.output.disconnect();
      if (this.bhojpuriEffect) this.bhojpuriEffect.output.disconnect();
      if (this.cassetteEffect) this.cassetteEffect.output.disconnect();
      if (this.radioEffect) this.radioEffect.output.disconnect();
    } catch (_) {}

    let currentEffectOut: AudioNode = this.inputGain;

    switch (this.activePreset) {
      case 'reverb':
        if (this.reverbEffect) {
          this.inputGain.connect(this.reverbEffect.input);
          this.reverbEffect.output.connect(this.masterGain);
          currentEffectOut = this.reverbEffect.output;
        }
        break;

      case 'bhojpuri':
        if (this.bhojpuriEffect) {
          this.inputGain.connect(this.bhojpuriEffect.input);
          this.bhojpuriEffect.output.connect(this.masterGain);
          currentEffectOut = this.bhojpuriEffect.output;
        }
        break;

      case 'cassette':
        if (this.cassetteEffect) {
          this.inputGain.connect(this.cassetteEffect.input);
          this.cassetteEffect.output.connect(this.masterGain);
          currentEffectOut = this.cassetteEffect.output;
        }
        break;

      case 'radio':
        if (this.radioEffect) {
          this.inputGain.connect(this.radioEffect.input);
          this.radioEffect.output.connect(this.masterGain);
          currentEffectOut = this.radioEffect.output;
        }
        break;

      case 'dry':
      default:
        this.inputGain.connect(this.masterGain);
        currentEffectOut = this.inputGain;
        break;
    }

    // Connect to Analyser for live visualizer
    this.masterGain.connect(this.analyser);

    // Connect to Destination (Speakers/Headphones) if monitoring enabled
    if (this.isMonitoring) {
      this.analyser.connect(this.ctx.destination);
    }

    // Connect to Recorder Worklet (captures post-DSP output)
    if (this.recorderWorkletNode) {
      try {
        currentEffectOut.connect(this.recorderWorkletNode);
      } catch (_) {}
    }
  }

  public setMonitoring(enabled: boolean) {
    this.isMonitoring = enabled;
    if (!this.ctx || !this.analyser) return;

    try {
      this.analyser.disconnect(this.ctx.destination);
    } catch (_) {}

    if (this.isMonitoring) {
      this.analyser.connect(this.ctx.destination);
    }
  }

  public setMasterGain(gainVal: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    }
  }

  public startRecording() {
    if (!this.ctx || this.isRecording) return;
    this.isRecording = true;
    this.recordStartTime = Date.now();
    this.recordedBuffersL = [];
    this.recordedBuffersR = [];

    if (this.cassetteEffect) {
      this.cassetteEffect.playMechanicalClunk();
      this.cassetteEffect.setTransportState(true);
    }

    if (this.recorderWorkletNode) {
      this.recorderWorkletNode.port.postMessage({ command: 'START' });
    }

    this.emitTelemetry('RECORDING_STARTED', {
      preset: this.activePreset,
      timestamp: this.recordStartTime,
    });
  }

  public async stopRecording(): Promise<RecordedTakeResult> {
    if (!this.ctx || !this.isRecording) {
      throw new Error('Not currently recording');
    }
    this.isRecording = false;
    const duration = (Date.now() - this.recordStartTime) / 1000.0;

    if (this.cassetteEffect && !this.isTrackPlaying) {
      this.cassetteEffect.playMechanicalClunk();
      this.cassetteEffect.setTransportState(false);
    }

    if (this.recorderWorkletNode) {
      this.recorderWorkletNode.port.postMessage({ command: 'STOP' });
    }

    await new Promise((r) => setTimeout(r, 120));

    let leftBuffers = this.recordedBuffersL;
    let rightBuffers = this.recordedBuffersR;
    if (leftBuffers.length === 0) {
      const dummyLength = Math.max(2048, Math.floor(48000 * Math.max(0.5, duration)));
      leftBuffers = [new Float32Array(dummyLength)];
      rightBuffers = [new Float32Array(dummyLength)];
    }

    const wavBlob = encodeWAV24Bit(leftBuffers, rightBuffers, 48000);
    const audioUrl = URL.createObjectURL(wavBlob);
    const takeId = `take_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    this.emitTelemetry('RECORDING_STOPPED', {
      takeId,
      durationSec: duration,
      fileSizeBytes: wavBlob.size,
    });

    return {
      takeId,
      blob: wavBlob,
      audioUrl,
      durationSec: Math.max(0.1, duration),
      sampleRate: 48000,
      preset: this.activePreset,
      fileSizeBytes: wavBlob.size,
      trackName: this.uploadedTrackName || 'Live Studio Take',
    };
  }

  private startMeteringLoop() {
    const pcmData = new Float32Array(1024);

    const update = () => {
      if (this.analyser && this.onMeterUpdate) {
        this.analyser.getFloatTimeDomainData(pcmData);

        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < pcmData.length; i++) {
          const val = pcmData[i];
          const absVal = Math.abs(val);
          if (absVal > peak) peak = absVal;
          sumSquares += val * val;
        }

        const rms = Math.sqrt(sumSquares / pcmData.length);
        const rmsDb = 20 * Math.log10(Math.max(rms, 1e-4));
        const peakDb = 20 * Math.log10(Math.max(peak, 1e-4));

        this.onMeterUpdate(rmsDb, rmsDb, peakDb);
      }
      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  public getSessionId(): string {
    return this.sessionId;
  }
}
