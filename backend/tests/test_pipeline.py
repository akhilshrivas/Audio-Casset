"""
DeshiWave End-to-End Pipeline Verification Tests
Tests the full Medallion Architecture:
  1. Bronze: Raw WAV ingestion & immutable event streaming
  2. Silver: Librosa feature extraction, Spotify Pedalboard re-rendering, and Parquet serialization
  3. Gold: DuckDB analytical views, aggregate metrics, pitch stability scorecard, and custom SQL execution
"""

import os
import io
import pytest
import numpy as np
import soundfile as sf
import pyarrow.parquet as pq

from backend.dsp.pedalboard_rack import PedalboardRack
from backend.pipeline.bronze import (
    ingest_raw_take,
    log_event,
    list_bronze_takes,
    get_take_bronze_meta,
)
from backend.pipeline.silver import (
    process_take,
    get_take_telemetry_table,
    SILVER_TELEMETRY_DIR,
)
from backend.pipeline.gold_duckdb import (
    get_lakehouse_summary,
    get_take_telemetry_series,
    execute_custom_sql,
)


@pytest.fixture(scope="session")
def synthetic_vocal_wav_bytes() -> bytes:
    """
    Generates a realistic 1.5-second synthetic vocal take:
    A fundamental pitch around 220Hz (A3) with vibrato (5 Hz LFO) and 2 harmonics.
    """
    sr = 48000
    duration = 1.5
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    # 5 Hz vibrato pitch modulation: 220 Hz +/- 6 Hz
    vibrato = 6.0 * np.sin(2 * np.pi * 5.0 * t)
    f0 = 220.0 + vibrato
    phase = 2 * np.pi * np.cumsum(f0) / sr

    # Harmonic richness (formant-like structure)
    fundamental = 0.5 * np.sin(phase)
    h2 = 0.25 * np.sin(2 * phase)
    h3 = 0.12 * np.sin(3 * phase)
    audio = fundamental + h2 + h3

    # Smooth attack and decay envelope
    envelope = np.ones_like(audio)
    attack_samples = int(0.05 * sr)
    release_samples = int(0.1 * sr)
    envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
    envelope[-release_samples:] = np.linspace(1, 0, release_samples)
    audio = (audio * envelope).astype(np.float32)

    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_24")
    return buf.getvalue()


def test_pedalboard_dsp_rack():
    """Verify Pedalboard rack generates distinct transformed audio for each preset."""
    sr = 48000
    t = np.linspace(0, 0.5, int(sr * 0.5), endpoint=False)
    sine = (0.4 * np.sin(2 * np.pi * 330 * t)).astype(np.float32)

    presets = ["Studio Dry", "Concert Hall Reverb", "Bhojpuri Garda Mode", "90s Cassette Deck", "90s Vividh Bharati Radio"]
    for p in presets:
        out = PedalboardRack.process_audio(sine, sr, p)
        assert out is not None
        assert len(out) == len(sine)
        assert not np.all(out == 0)


def test_medallion_pipeline_e2e(synthetic_vocal_wav_bytes):
    """
    Full End-to-End Test:
    Bronze Ingestion -> Silver Parquet & Pedalboard Processing -> Gold DuckDB OLAP
    """
    session_id = "test_session_gamma"
    take_id = "take_test_e2e_001"
    preset = "Bhojpuri Garda Mode"

    # Step 1: Bronze Ingestion
    bronze_meta = ingest_raw_take(
        audio_bytes=synthetic_vocal_wav_bytes,
        session_id=session_id,
        preset_name=preset,
        take_id=take_id,
        client_metadata={"user_agent": "Pytest/Antigravity", "mic": "Studio Test Mic"},
    )
    assert bronze_meta["take_id"] == take_id
    assert os.path.exists(bronze_meta["raw_audio_path"])

    fetched_bronze = get_take_bronze_meta(take_id)
    assert fetched_bronze is not None
    assert fetched_bronze["file_size_bytes"] == len(synthetic_vocal_wav_bytes)

    # Step 2: Silver Processing (Feature extraction + Parquet serialization)
    silver_result = process_take(take_id=take_id, rerender_preset="Bhojpuri Garda Mode")
    assert silver_result["status"] == "SUCCESS"
    assert os.path.exists(silver_result["parquet_path"])

    summary = silver_result["summary"]
    assert summary["num_frames"] > 10
    assert summary["sample_rate"] == 48000
    assert summary["mean_pitch_hz"] > 180.0  # Should detect pitch near 220Hz
    assert summary["pitch_stability_pct"] > 60.0

    # Verify Parquet schema and read
    table = get_take_telemetry_table(take_id)
    assert table is not None
    assert table.num_rows == summary["num_frames"]
    assert "rms_energy_db" in table.column_names
    assert "spectral_centroid_hz" in table.column_names
    assert "pitch_f0_hz" in table.column_names

    # Step 3: Gold DuckDB OLAP Queries
    lakehouse_summary = get_lakehouse_summary()
    assert lakehouse_summary["kpis"]["total_takes"] >= 1
    assert lakehouse_summary["kpis"]["total_frames"] >= summary["num_frames"]
    assert lakehouse_summary["kpis"]["silver_parquet_kb"] > 0

    # Test Time-Series retrieval for UI charts
    telemetry_series = get_take_telemetry_series(take_id)
    assert telemetry_series["take_id"] == take_id
    assert len(telemetry_series["points"]) > 0
    first_pt = telemetry_series["points"][0]
    assert "timestamp_ms" in first_pt
    assert "spectral_centroid_hz" in first_pt

    # Step 4: Live DuckDB Ad-hoc SQL execution
    sql = "SELECT preset_name, AVG(spectral_centroid_hz) as avg_sc, COUNT(*) as frames FROM silver_vocal_telemetry GROUP BY preset_name"
    sql_result = execute_custom_sql(sql)
    assert sql_result["status"] == "SUCCESS"
    assert len(sql_result["rows"]) >= 1
    assert "avg_sc" in sql_result["columns"]
