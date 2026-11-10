"""
DeshiWave Medallion Lakehouse - Silver Processing Layer
Extracts windowed acoustic features from raw audio takes using Librosa and Spotify Pedalboard.
Serializes cleaned, schema-validated time-series records into Apache Parquet.
"""

import os
import json
import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List

import numpy as np
import soundfile as sf
import librosa
import pyarrow as pa
import pyarrow.parquet as pq

from backend.dsp.pedalboard_rack import PedalboardRack
from backend.pipeline.bronze import (
    DATA_LAKE_ROOT,
    BRONZE_AUDIO_ROOT,
    get_take_bronze_meta,
    log_event,
)

SILVER_ROOT = DATA_LAKE_ROOT / "silver"
SILVER_TELEMETRY_DIR = SILVER_ROOT / "vocal_telemetry"
SILVER_AUDIO_DIR = SILVER_ROOT / "rerendered_audio"
SILVER_METADATA_DIR = SILVER_ROOT / "take_summaries"


def ensure_silver_dirs():
    """Ensures silver layer directories exist."""
    SILVER_TELEMETRY_DIR.mkdir(parents=True, exist_ok=True)
    SILVER_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    SILVER_METADATA_DIR.mkdir(parents=True, exist_ok=True)


TELEMETRY_ARROW_SCHEMA = pa.schema([
    ("take_id", pa.string()),
    ("session_id", pa.string()),
    ("preset_name", pa.string()),
    ("frame_index", pa.int64()),
    ("timestamp_ms", pa.float64()),
    ("rms_energy_db", pa.float64()),
    ("pitch_f0_hz", pa.float64()),
    ("voiced_prob", pa.float64()),
    ("spectral_centroid_hz", pa.float64()),
    ("spectral_bandwidth_hz", pa.float64()),
    ("spectral_rolloff_hz", pa.float64()),
    ("zero_crossing_rate", pa.float64()),
    ("mfcc_1", pa.float64()),
    ("mfcc_2", pa.float64()),
    ("mfcc_3", pa.float64()),
    ("mfcc_4", pa.float64()),
    ("mfcc_5", pa.float64()),
    ("date_partition", pa.string()),
])


def extract_acoustic_telemetry(
    audio_data: np.ndarray,
    sr: int,
    take_id: str,
    session_id: str,
    preset_name: str,
    date_partition: str,
    hop_length_ms: float = 50.0,
) -> Tuple[pa.Table, Dict[str, Any]]:
    """
    Slices audio into 50ms windows and extracts acoustic telemetry features.
    Returns (PyArrow Table, Take Summary Dict).
    """
    # If stereo, average to mono for spectral feature extraction
    if audio_data.ndim > 1:
        mono_audio = np.mean(audio_data, axis=0) if audio_data.shape[0] < audio_data.shape[1] else np.mean(audio_data, axis=1)
    else:
        mono_audio = audio_data

    mono_audio = mono_audio.astype(np.float32)
    total_samples = len(mono_audio)
    duration_sec = total_samples / sr if sr > 0 else 0.0

    hop_length = int(sr * (hop_length_ms / 1000.0))
    if hop_length < 64:
        hop_length = 64
    frame_length = hop_length * 2

    # 1. RMS Energy (dB)
    rms = librosa.feature.rms(y=mono_audio, frame_length=frame_length, hop_length=hop_length)[0]
    # Convert amplitude to dBFS: 20 * log10(rms + eps)
    rms_db = 20.0 * np.log10(np.maximum(rms, 1e-6))

    num_frames = len(rms)
    timestamps_ms = np.arange(num_frames) * hop_length_ms

    # 2. Pitch f0 & voiced probability
    # Downsample if sample rate is very high (>24000) for fast robust estimation
    target_f0_sr = 22050 if sr > 22050 else sr
    if sr != target_f0_sr:
        f0_audio = librosa.resample(mono_audio, orig_sr=sr, target_sr=target_f0_sr)
        f0_hop = int(target_f0_sr * (hop_length_ms / 1000.0))
    else:
        f0_audio = mono_audio
        f0_hop = hop_length

    try:
        f0, voiced_flag, voiced_probs = librosa.pyin(
            f0_audio,
            fmin=librosa.note_to_hz('C2'),  # ~65 Hz
            fmax=librosa.note_to_hz('C7'),  # ~2093 Hz
            sr=target_f0_sr,
            hop_length=f0_hop,
            frame_length=f0_hop * 4,
        )
    except Exception:
        # Fallback to zero pitch if pitch estimation fails on silence
        f0 = np.zeros(num_frames)
        voiced_probs = np.zeros(num_frames)

    # Align f0 length with num_frames
    if len(f0) < num_frames:
        pad_len = num_frames - len(f0)
        f0 = np.pad(f0, (0, pad_len), constant_values=np.nan)
        voiced_probs = np.pad(voiced_probs, (0, pad_len), constant_values=0.0)
    elif len(f0) > num_frames:
        f0 = f0[:num_frames]
        voiced_probs = voiced_probs[:num_frames]

    # Replace NaNs with 0.0 for clean OLAP indexing
    f0_clean = np.nan_to_num(f0, nan=0.0)
    voiced_probs_clean = np.nan_to_num(voiced_probs, nan=0.0)

    # 3. Spectral features
    spectral_centroid = librosa.feature.spectral_centroid(y=mono_audio, sr=sr, n_fft=frame_length, hop_length=hop_length)[0]
    spectral_bandwidth = librosa.feature.spectral_bandwidth(y=mono_audio, sr=sr, n_fft=frame_length, hop_length=hop_length)[0]
    spectral_rolloff = librosa.feature.spectral_rolloff(y=mono_audio, sr=sr, n_fft=frame_length, hop_length=hop_length, roll_percent=0.85)[0]
    zero_crossing = librosa.feature.zero_crossing_rate(y=mono_audio, frame_length=frame_length, hop_length=hop_length)[0]

    # 4. Mel-Frequency Cepstral Coefficients (MFCC 1..5)
    mfccs = librosa.feature.mfcc(y=mono_audio, sr=sr, n_mfcc=5, n_fft=frame_length, hop_length=hop_length)

    # Ensure lengths match num_frames
    def align_feature(arr: np.ndarray) -> np.ndarray:
        if len(arr) < num_frames:
            return np.pad(arr, (0, num_frames - len(arr)), mode='edge')
        return arr[:num_frames]

    sc = align_feature(spectral_centroid)
    sb = align_feature(spectral_bandwidth)
    sr_val = align_feature(spectral_rolloff)
    zcr = align_feature(zero_crossing)

    mfcc1 = align_feature(mfccs[0])
    mfcc2 = align_feature(mfccs[1])
    mfcc3 = align_feature(mfccs[2])
    mfcc4 = align_feature(mfccs[3])
    mfcc5 = align_feature(mfccs[4])

    frame_indices = np.arange(num_frames, dtype=np.int64)
    take_ids = [take_id] * num_frames
    session_ids = [session_id] * num_frames
    preset_names = [preset_name] * num_frames
    date_partitions = [date_partition] * num_frames

    # Construct PyArrow Table
    data_dict = {
        "take_id": take_ids,
        "session_id": session_ids,
        "preset_name": preset_names,
        "frame_index": frame_indices,
        "timestamp_ms": timestamps_ms.astype(np.float64),
        "rms_energy_db": rms_db.astype(np.float64),
        "pitch_f0_hz": f0_clean.astype(np.float64),
        "voiced_prob": voiced_probs_clean.astype(np.float64),
        "spectral_centroid_hz": sc.astype(np.float64),
        "spectral_bandwidth_hz": sb.astype(np.float64),
        "spectral_rolloff_hz": sr_val.astype(np.float64),
        "zero_crossing_rate": zcr.astype(np.float64),
        "mfcc_1": mfcc1.astype(np.float64),
        "mfcc_2": mfcc2.astype(np.float64),
        "mfcc_3": mfcc3.astype(np.float64),
        "mfcc_4": mfcc4.astype(np.float64),
        "mfcc_5": mfcc5.astype(np.float64),
        "date_partition": date_partitions,
    }

    table = pa.Table.from_pydict(data_dict, schema=TELEMETRY_ARROW_SCHEMA)

    # Compute Take Level Summary KPIs
    voiced_mask = f0_clean > 20.0
    valid_f0 = f0_clean[voiced_mask]
    mean_pitch_hz = float(np.mean(valid_f0)) if len(valid_f0) > 0 else 0.0
    pitch_std_hz = float(np.std(valid_f0)) if len(valid_f0) > 0 else 0.0
    pitch_stability_pct = float(max(0.0, min(100.0, 100.0 - (pitch_std_hz / (mean_pitch_hz + 1e-3) * 100.0)))) if mean_pitch_hz > 0 else 0.0

    peak_rms_db = float(np.max(rms_db)) if len(rms_db) > 0 else -96.0
    mean_rms_db = float(np.mean(rms_db)) if len(rms_db) > 0 else -96.0
    crest_factor = float(peak_rms_db - mean_rms_db)
    mean_spectral_centroid = float(np.mean(sc)) if len(sc) > 0 else 0.0

    summary = {
        "take_id": take_id,
        "session_id": session_id,
        "preset_name": preset_name,
        "duration_sec": round(duration_sec, 3),
        "sample_rate": sr,
        "num_frames": int(num_frames),
        "mean_pitch_hz": round(mean_pitch_hz, 2),
        "pitch_stability_pct": round(pitch_stability_pct, 2),
        "mean_spectral_centroid_hz": round(mean_spectral_centroid, 2),
        "peak_rms_db": round(peak_rms_db, 2),
        "mean_rms_db": round(mean_rms_db, 2),
        "crest_factor_db": round(crest_factor, 2),
        "processed_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "date_partition": date_partition,
    }

    return table, summary


def process_take(
    take_id: str,
    rerender_preset: Optional[str] = None,
    dsp_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Silver ETL Processor:
    Loads Bronze WAV file, optionally re-renders via Spotify Pedalboard,
    extracts time-series features, and writes Parquet and summary JSON.
    """
    ensure_silver_dirs()
    bronze_meta = get_take_bronze_meta(take_id)
    if not bronze_meta:
        raise FileNotFoundError(f"Bronze take '{take_id}' not found.")

    audio_path = bronze_meta["raw_audio_path"]
    session_id = bronze_meta.get("session_id", "session_unknown")
    preset_name = rerender_preset or bronze_meta.get("preset_name", "Studio Dry")
    date_partition = bronze_meta.get("date_partition", "1970-01-01")

    # Load audio using soundfile (supports 24-bit/32-bit float WAV)
    audio_data, sr = sf.read(audio_path, dtype="float32")

    # If re-rendering requested via Pedalboard DSP Rack
    rendered_audio_path = None
    if rerender_preset:
        audio_data = PedalboardRack.process_audio(audio_data, sr, rerender_preset, dsp_params)
        rendered_filename = f"{take_id}_{rerender_preset}.wav"
        rendered_path = SILVER_AUDIO_DIR / rendered_filename
        sf.write(str(rendered_path), audio_data, sr, subtype="PCM_24")
        rendered_audio_path = str(rendered_path)

    # Extract features
    table, summary = extract_acoustic_telemetry(
        audio_data=audio_data,
        sr=sr,
        take_id=take_id,
        session_id=session_id,
        preset_name=preset_name,
        date_partition=date_partition,
    )

    if rendered_audio_path:
        summary["silver_rendered_audio_path"] = rendered_audio_path

    # Write Parquet table
    parquet_filename = f"{take_id}.parquet"
    parquet_path = SILVER_TELEMETRY_DIR / parquet_filename
    pq.write_table(table, parquet_path, compression="snappy")

    # Write Silver Summary JSON
    summary_path = SILVER_METADATA_DIR / f"{take_id}_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    log_event(
        session_id=session_id,
        event_type="SILVER_PARQUET_MATERIALIZED",
        payload={
            "take_id": take_id,
            "parquet_path": str(parquet_path),
            "num_frames": summary["num_frames"],
            "pitch_stability_pct": summary["pitch_stability_pct"],
        },
    )

    return {
        "status": "SUCCESS",
        "parquet_path": str(parquet_path),
        "summary": summary,
    }


def get_take_telemetry_table(take_id: str) -> Optional[pa.Table]:
    """Reads Silver Parquet table for a specific take."""
    parquet_path = SILVER_TELEMETRY_DIR / f"{take_id}.parquet"
    if parquet_path.exists():
        return pq.read_table(parquet_path)
    return None
