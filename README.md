# 🎙️ DeshiWave DSP & Audio Lakehouse

> **A Studio-Grade High-Resolution Vocal Recording Studio with Culturally Iconic & Retro DSP Effects ("Bhojpuri Garda Effect", "90s Cassette Tape Deck", "90s AM Vividh Bharati Radio", "Studio Concert Reverb") backed by a Real-Time Streaming Medallion Audio Lakehouse (Bronze ➔ Silver ➔ Gold) using FastAPI, Spotify Pedalboard, Librosa, DuckDB, and Apache Parquet.**

---

## 🌟 Executive Summary & Architectural Overview

**DeshiWave** transforms what would typically be a frontend audio toy into a production-grade **Unstructured Audio Streaming & Feature Engineering Lakehouse**.

The system is cleanly decoupled into two layers:
1. **Zero-Latency Edge DSP Layer (Browser)**:
   - Uses the **Web Audio API**, custom dedicated **`AudioWorkletProcessor`** threads, and **Tone.js**.
   - Captures uncompressed studio vocals (bypassing browser WebRTC muffling filters) and applies complex signal processing in real time (<10ms round-trip latency).
   - Encodes losslessly to **24-bit / 48kHz WAV** blobs via a custom `WavEncoder`.
2. **Data Engineering Medallion Lakehouse (Python Backend)**:
   - **Bronze Layer**: Raw audio takes and real-time parameter telemetry streams ingested via FastAPI WebSockets into immutable partitioned storage (`data_lake/bronze/audio/date=YYYY-MM-DD/`) and append-only JSONL event streams.
   - **Silver Layer**: Windowed 50ms acoustic feature extraction with **Librosa** and **Spotify Pedalboard** (C++ VST-grade DSP). Computes $F_0$ Fundamental Pitch, Voiced Probability, RMS Loudness (dBFS), Spectral Centroid, Bandwidth, Rolloff, Zero-Crossing Rate, and 5 MFCCs, stored in columnar **Apache Parquet**.
   - **Gold Layer**: In-process OLAP with **DuckDB** querying Silver Parquet directly to compute **Pitch Stability Scorecards (%)**, **Dynamic Range (Crest Factor)**, **Harmonic Brightness Shifts**, and an interactive **Live SQL Console**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Zero-Latency Edge DSP (Web Audio API)                │
│  Mic (48kHz) ──► Input Gain ──► [Bhojpuri / Cassette / Radio / Reverb] │
│                                  │                     │               │
│                                  ▼                     ▼               │
│                        60fps CRT Phosphor         AudioWorklet         │
│                           Oscilloscope          PCM Ring Buffer        │
└────────────────────────────────────────┬───────────────┬───────────────┘
                                         │ WAV Bytes     │ Telemetry WS
                                         ▼               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    FastAPI Streaming Backend                           │
├────────────────────────────────────────────────────────────────────────┤
│  BRONZE LAYER : Immutable Audio WAV Storage + JSONL Event Stream       │
│  SILVER LAYER : Librosa Feature Extraction (50ms) ➔ Apache Parquet     │
│  GOLD LAYER   : DuckDB In-Process OLAP ➔ Live SQL Query Console        │
│  DSP RE-RENDER: Spotify Pedalboard C++ VST Engine                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🎛️ Digital Signal Processing (DSP) Mathematical Specs

| Feature / Filter | Acoustic Sound Profile | Exact DSP Node Chain & Parameters | Technologies |
| :--- | :--- | :--- | :--- |
| **Studio High-Res Recorder** | Crisp, uncompressed 24-bit/48kHz studio vocal capture | WebRTC filters disabled (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`). Raw 32-bit float stereo ring buffer captured in `PCMRecorderProcessor` AudioWorklet, encoded to 24-bit PCM WAV. | Web Audio API, `AudioWorkletProcessor` |
| **Studio Concert Reverb** | Warm, lush spatial reflections from intimate room to cavernous stadium | Algorithmic stereo impulse response generator: exponentially decaying stereo white/pink noise buffer (0.5s–5.0s decay) loaded into `ConvolverNode`, 40ms pre-delay via `DelayNode`, and high-frequency damping lowpass at 4500 Hz. Equal-power crossfade. | `ConvolverNode`, `DelayNode`, `BiquadFilterNode` |
| **"Bhojpuri Garda" Vocal Effect** | Hyper-present, metallic robotic pitch snap + slapback stadium echo + mid bite | **1. Hard Pitch Quantizer:** `BhojpuriPitchProcessor` worklet snapping $F_0$ to Bhairavi/Chromatic scale with 0ms retune speed and +1.5 ST formant edge + +12 ST harmonic octaver.<br>**2. Presence Bite:** Peaking `BiquadFilterNode` at 3.2 kHz (+7 dB, Q=1.8) + high-shelf at 8 kHz (+4 dB).<br>**3. Slapback Echo:** Dual-tap delay (135ms left / 270ms right, 38% feedback) through 1.8kHz bandpass.<br>**4. Squash Compressor:** 12:1 ratio, -28 dB threshold, 2ms attack. | `AudioWorkletProcessor`, `BiquadFilterNode`, `DynamicsCompressorNode` |
| **90s Cassette Tape Deck** | Warm magnetic tape saturation, analog wow & flutter, tape hiss | **1. Magnetic Roll-off:** Highpass at 110 Hz + Lowpass at 7.2 kHz.<br>**2. Tape Saturation:** Asymmetric $\tanh(k \cdot x)$ soft-clipping curve in `WaveShaperNode` (4x oversampling).<br>**3. Wow & Flutter:** Dual LFOs (1.1 Hz wow + 6.8 Hz flutter) modulating a `DelayNode` (4ms base $\pm 1.2$ms).<br>**4. Hiss & Clunk:** Continuous pink noise buffer loop at -36 dB + procedural solenoid clunk on transport toggle. | `WaveShaperNode`, `DelayNode`, `OscillatorNode` |
| **90s AM Transistor Radio** | Mid-heavy transistor speaker, static crackle, dial tuning whistle | **1. Brickwall Bandpass:** Cascaded 24dB/octave highpass at 480 Hz + lowpass at 2.9 kHz with resonant cabinet peak at 1.25 kHz (+5.5 dB).<br>**2. Diode Grit:** Hard-knee diode asymmetric distortion curve.<br>**3. Heterodyne Whistle:** Procedural static crackle impulse bursts + 9.8 kHz carrier sine wave with dial tuning pitch sweep. | `BiquadFilterNode`, `WaveShaperNode`, `OscillatorNode` |

---

## 🗄️ Medallion Architecture (Data Engineering Deep Dive)

### 🥉 Bronze Layer (`backend/pipeline/bronze.py`)
- Ingests raw recorded audio takes and WebSocket streaming frames.
- Stores immutable raw 24-bit audio in `data_lake/bronze/audio/date=YYYY-MM-DD/take_{take_id}.wav`.
- Appends telemetry frames (`session_id`, `event_type`, `payload`, `timestamp_utc`) to `data_lake/bronze/events/date=YYYY-MM-DD/events.jsonl`.

### 🥈 Silver Layer (`backend/pipeline/silver.py`)
- Automated ETL pipeline using `librosa`, `soundfile`, `numpy`, and `pedalboard`.
- Slices audio takes into 50ms windows ($sr = 48000$, hop length = 2400 samples).
- Extracts structured acoustic features:
  - `timestamp_ms`, `rms_energy_db`, `pitch_f0_hz` (via `librosa.pyin`), `voiced_prob`, `spectral_centroid_hz`, `spectral_bandwidth_hz`, `spectral_rolloff_hz`, `zero_crossing_rate`, `mfcc_1` to `mfcc_5`.
- Writes schema-validated columnar Apache Parquet files: `data_lake/silver/vocal_telemetry/{take_id}.parquet`.
- Re-renders raw audio files through Spotify Pedalboard's C++ DSP engine.

### 🥇 Gold Layer (`backend/pipeline/gold_duckdb.py`)
- Employs **DuckDB** to query Silver Parquet files directly using `read_parquet(...)`.
- Materializes analytical queries:
  - `gold_session_summary`: aggregated duration, frame count, storage stats.
  - `gold_effect_acoustic_comparison`: compares RMS and Centroid brightness across Dry, Bhojpuri, Cassette, and Radio effects.
  - `gold_pitch_stability_scorecard`: per-take vocal intonation stability %, semitone variance, voiced ratio.
- Exposes direct SQL query endpoint `POST /api/analytics/sql-query` powering a live SQL execution console in the browser!

---

## 📁 Repository Directory Structure

```text
deshiwave-audio-lakehouse/
├── README.md
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                     # FastAPI application & WebSocket endpoints
│   ├── dsp/
│   │   ├── __init__.py
│   │   └── pedalboard_rack.py       # Spotify Pedalboard C++ DSP chains
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── bronze.py               # Bronze raw audio & JSONL ingestion
│   │   ├── silver.py               # Silver Librosa 50ms ETL ➔ Parquet
│   │   └── gold_duckdb.py          # Gold DuckDB OLAP queries & SQL runner
│   └── tests/
│       ├── __init__.py
│       └── test_pipeline.py        # Pytest verifying full Medallion pipeline
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/
│   │   └── worklets/
│   │       ├── pcm-recorder-worklet.js     # 32-bit float PCM ring buffer
│   │       └── bhojpuri-pitch-worklet.js   # Autocorrelation pitch quantizer
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                        # Master layout & transport state
│       ├── index.css
│       ├── audio/
│       │   ├── AudioEngine.ts             # Master Web Audio graph & WS client
│       │   ├── WavEncoder.ts              # Lossless 24-bit / 48kHz WAV encoder
│       │   └── effects/
│       │       ├── ReverbEffect.ts        # Algorithmic stereo convolution IR
│       │       ├── BhojpuriGardaEffect.ts  # Hard snap + 3.2kHz bite + slapback
│       │       ├── Cassette90sEffect.ts   # Tanh saturation + wow/flutter + hiss
│       │       └── Radio90sEffect.ts      # Diode distortion + 480Hz-2.9kHz filter
│       └── components/
│           ├── LiveOscilloscope.tsx       # 60fps CRT phosphor beam & spectrum
│           ├── CassetteDeckVisualizer.tsx # Rotating reels + mechanical counter
│           ├── EffectsRackPanel.tsx       # 19-inch rack unit with rotary macros
│           └── LakehouseAnalyticsTab.tsx  # Medallion telemetry & DuckDB console
└── data_lake/                             # Generated partitioned lakehouse
    ├── bronze/
    ├── silver/
    └── gold/
```

---

## 🚀 Quickstart & Installation

### Option 1: Run Locally (Fastest)

#### 1. Backend Setup
```bash
# In project root
python -m pip install -r backend/requirements.txt

# Run the test suite to verify pipeline end-to-end
python -m pytest backend/tests/test_pipeline.py -v

# Start FastAPI server on port 8000
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup
```bash
# In frontend directory
cd frontend
npm install
npm run build    # Verifies TypeScript compilation
npm run dev      # Starts Vite dev server on http://localhost:5173
```
Open **`http://localhost:5173`** in your browser. Click **"POWER ON DSP ENGINE"**, allow microphone access, and record!

---

### Option 2: Docker Compose

```bash
docker-compose up --build
```
- Frontend UI: `http://localhost:5173`
- Backend API Docs: `http://localhost:8000/docs`

---

## 🧪 Verification & Automated Testing

Run the automated integration test:
```bash
python -m pytest backend/tests/test_pipeline.py -v
```

This test:
1. Synthesizes a realistic vocal waveform with 5Hz vibrato and acoustic harmonics.
2. Runs all 5 Spotify Pedalboard DSP presets.
3. Ingests raw WAV bytes into the Bronze storage layer.
4. Executes the Silver Librosa ETL pipeline, extracting 50ms windowed frames and serializing to Apache Parquet.
5. Verifies DuckDB Gold OLAP aggregation views and executes ad-hoc SQL queries.

---

## 💼 LinkedIn & Portfolio Highlights for Data Engineers

- **Unstructured Audio Streaming:** Real-time ingestion of continuous time-series audio via WebSockets into an append-only lakehouse.
- **Micro-batching & Feature Engineering:** Windowed feature extraction at 50ms intervals computing acoustic signals ($F_0$, spectral brightness, MFCC vectors).
- **Medallion Data Architecture:** Bronze (Raw WAV/JSONL) ➔ Silver (Schema-validated Parquet) ➔ Gold (DuckDB OLAP analytical views).
- **Sub-millisecond OLAP with DuckDB:** Ad-hoc analytical queries executed directly on Parquet files without heavy distributed cluster overhead.
- **Hybrid Edge/Server Architecture:** Zero-latency Web Audio API execution at the browser edge with high-precision server-side re-rendering via Spotify's C++ Pedalboard engine.
