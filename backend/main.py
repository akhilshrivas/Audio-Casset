"""
DeshiWave DSP & Audio Lakehouse - FastAPI Backend
Provides real-time telemetry streaming over WebSockets, Bronze -> Silver -> Gold
Medallion audio ETL pipelines, Spotify Pedalboard VST rendering, and DuckDB OLAP queries.
"""

import os
import io
import json
import base64
import uuid
import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from backend.dsp.pedalboard_rack import PedalboardRack
from backend.pipeline.bronze import (
    ingest_raw_take,
    log_event,
    list_bronze_takes,
    get_take_bronze_meta,
    BRONZE_AUDIO_ROOT,
)
from backend.pipeline.silver import (
    process_take,
    SILVER_AUDIO_DIR,
    SILVER_METADATA_DIR,
)
from backend.pipeline.gold_duckdb import (
    get_lakehouse_summary,
    get_take_telemetry_series,
    execute_custom_sql,
)

app = FastAPI(
    title="DeshiWave Studio & Audio Lakehouse API",
    description="Studio-grade Audio DSP + Medallion Lakehouse Engine (FastAPI, Spotify Pedalboard, DuckDB, Parquet)",
    version="1.0.0",
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SQLQueryRequest(BaseModel):
    query: str


class RerenderRequest(BaseModel):
    take_id: str
    preset_name: str
    params: Optional[Dict[str, Any]] = None


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "DeshiWave DSP & Audio Lakehouse",
        "timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "dsp_engine": "Spotify Pedalboard C++ VST Engine",
        "olap_engine": "DuckDB in-process OLAP",
    }


@app.get("/api/presets")
def list_dsp_presets():
    """Returns available DSP presets and their default parameter blueprints."""
    return [
        {
            "id": "dry",
            "name": "Studio Dry (Unprocessed)",
            "description": "Raw uncompressed 24-bit / 48kHz studio audio capture with WebRTC voice-call filters bypassed.",
            "color": "#10B981",
            "icon": "Mic",
            "parameters": {
                "input_gain_db": 0.0,
            },
        },
        {
            "id": "reverb",
            "name": "Concert Hall Reverb",
            "description": "Lush spatial reflections with algorithmic stereo impulse response, pre-delay, and HF absorption.",
            "color": "#3B82F6",
            "icon": "Waves",
            "parameters": {
                "room_size": 0.82,
                "damping": 0.45,
                "wet_level": 0.40,
                "pre_delay_ms": 40.0,
                "low_cut_hz": 120.0,
                "high_cut_hz": 4500.0,
            },
        },
        {
            "id": "bhojpuri",
            "name": "Bhojpuri Garda Vocal Chain",
            "description": "Hyper-present metallic robotic pitch snap (0ms retune), peaking 3.2kHz bite, slapback stadium delay, and 12:1 squash.",
            "color": "#EF4444",
            "icon": "Flame",
            "parameters": {
                "pitch_scale": "Bhairavi",
                "retune_speed_ms": 0.0,
                "formant_shift_semitones": 1.5,
                "presence_gain_db": 7.0,
                "presence_freq_hz": 3200.0,
                "delay_time_ms": 135.0,
                "delay_feedback": 0.38,
                "compressor_ratio": 12.0,
            },
        },
        {
            "id": "cassette",
            "name": "90s Cassette Tape Deck",
            "description": "Nostalgic magnetic tape saturation (tanh soft-clip), dual-LFO wow & flutter, analog pink hiss, and magnetic band-limiting.",
            "color": "#F59E0B",
            "icon": "CassetteTape",
            "parameters": {
                "saturation_drive_db": 7.5,
                "wow_rate_hz": 1.1,
                "flutter_rate_hz": 6.8,
                "flutter_depth_ms": 1.2,
                "tape_hiss_db": -36.0,
                "high_cut_hz": 7200.0,
            },
        },
        {
            "id": "radio",
            "name": "90s Vividh Bharati AM Radio",
            "description": "Mid-heavy vintage transistor radio speaker with 480Hz-2.9kHz brickwall bandpass, diode distortion, and heterodyne static whistle.",
            "color": "#8B5CF6",
            "icon": "Radio",
            "parameters": {
                "transistor_drive_db": 13.5,
                "cabinet_peak_freq_hz": 1250.0,
                "cabinet_gain_db": 5.5,
                "low_cut_hz": 480.0,
                "high_cut_hz": 2900.0,
                "carrier_whistle_freq_hz": 9800.0,
            },
        },
    ]


@app.post("/api/ingest/take")
async def ingest_audio_take(
    file: UploadFile = File(...),
    session_id: str = Form("session_default"),
    preset_name: str = Form("Studio Dry"),
    take_id: Optional[str] = Form(None),
    client_metadata_json: Optional[str] = Form(None),
):
    """
    Ingests raw WAV audio into Bronze and automatically triggers Silver Parquet ETL.
    """
    audio_bytes = await file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file uploaded.")

    meta_dict = {}
    if client_metadata_json:
        try:
            meta_dict = json.loads(client_metadata_json)
        except Exception:
            pass

    actual_take_id = take_id or f"take_{uuid.uuid4().hex[:10]}"

    # Step 1: Bronze Ingestion
    bronze_meta = ingest_raw_take(
        audio_bytes=audio_bytes,
        session_id=session_id,
        preset_name=preset_name,
        take_id=actual_take_id,
        client_metadata=meta_dict,
    )

    # Step 2: Silver Layer Parquet Feature Extraction
    try:
        silver_result = process_take(take_id=actual_take_id)
    except Exception as e:
        silver_result = {"status": "ERROR", "error": str(e), "summary": None}

    return {
        "status": "SUCCESS",
        "take_id": actual_take_id,
        "bronze": bronze_meta,
        "silver": silver_result,
    }


@app.get("/api/analytics/lakehouse-summary")
def get_analytics_summary():
    """Returns real-time Gold layer KPIs and analytics."""
    return get_lakehouse_summary()


@app.get("/api/analytics/take/{take_id}/telemetry")
def get_take_telemetry(take_id: str, max_points: int = 500):
    """Returns windowed acoustic time-series points from Parquet for frontend charting."""
    data = get_take_telemetry_series(take_id=take_id, max_points=max_points)
    if not data or not data.get("points"):
        raise HTTPException(status_code=404, detail=f"Telemetry not found for take {take_id}")
    return data


@app.get("/api/analytics/takes")
def list_all_takes():
    """Lists all takes recorded in the lakehouse."""
    bronze_takes = list_bronze_takes()
    return bronze_takes


@app.post("/api/analytics/sql-query")
def run_sql_query(payload: SQLQueryRequest):
    """Direct DuckDB analytical query execution."""
    try:
        result = execute_custom_sql(payload.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/render/pedalboard")
def rerender_take_dsp(payload: RerenderRequest):
    """Re-renders an existing take with Spotify's Pedalboard C++ DSP."""
    bronze_meta = get_take_bronze_meta(payload.take_id)
    if not bronze_meta:
        raise HTTPException(status_code=404, detail=f"Take {payload.take_id} not found in Bronze layer.")

    try:
        silver_res = process_take(
            take_id=payload.take_id,
            rerender_preset=payload.preset_name,
            dsp_params=payload.params,
        )
        return silver_res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pedalboard DSP processing failed: {str(e)}")


@app.get("/api/audio/{take_id}")
def stream_take_audio(take_id: str):
    """Streams the raw audio WAV file for browser playback."""
    bronze_meta = get_take_bronze_meta(take_id)
    if not bronze_meta:
        raise HTTPException(status_code=404, detail="Audio file not found")

    path = Path(bronze_meta["raw_audio_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file missing on disk")

    def iterfile():
        with open(path, mode="rb") as file_like:
            yield from file_like

    return StreamingResponse(iterfile(), media_type="audio/wav")


@app.websocket("/ws/telemetry")
async def websocket_telemetry_stream(websocket: WebSocket):
    """
    Real-time telemetry WebSocket:
    Ingests client parameter tweaks, live audio meter frames, and events.
    Appends live events to Bronze event log.
    """
    await websocket.accept()
    session_id = f"sess_{uuid.uuid4().hex[:8]}"

    # Send initial handshake
    await websocket.send_json({
        "type": "HANDSHAKE_ACK",
        "session_id": session_id,
        "message": "Connected to DeshiWave Real-Time Telemetry Stream",
        "timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })

    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
                event_type = data.get("event_type", "TELEMETRY_FRAME")
                payload = data.get("payload", {})

                # Log to Bronze immutable event log
                logged = log_event(
                    session_id=data.get("session_id", session_id),
                    event_type=event_type,
                    payload=payload,
                )

                # Return live feedback / ack
                await websocket.send_json({
                    "type": "EVENT_ACK",
                    "event_id": logged["event_id"],
                    "status": "INGESTED_BRONZE",
                })
            except Exception as e:
                await websocket.send_json({"type": "ERROR", "error": str(e)})
    except WebSocketDisconnect:
        log_event(session_id=session_id, event_type="SESSION_DISCONNECTED", payload={})
