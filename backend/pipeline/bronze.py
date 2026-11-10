"""
DeshiWave Medallion Lakehouse - Bronze Ingestion Layer
Captures raw, immutable audio streams (24-bit/48kHz WAV) and telemetry event streams.
Storage structure:
  data_lake/
    └── bronze/
        ├── audio/
        │   └── date=YYYY-MM-DD/
        │       ├── take_{take_id}.wav
        │       └── take_{take_id}_meta.json
        └── events/
            └── date=YYYY-MM-DD/
                └── events.jsonl
"""

import os
import json
import uuid
import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List


DATA_LAKE_ROOT = Path(os.environ.get("DATA_LAKE_ROOT", "data_lake")).resolve()
BRONZE_ROOT = DATA_LAKE_ROOT / "bronze"
BRONZE_AUDIO_ROOT = BRONZE_ROOT / "audio"
BRONZE_EVENTS_ROOT = BRONZE_ROOT / "events"


def get_current_date_partition() -> str:
    """Returns YYYY-MM-DD partition string."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def ensure_bronze_dirs(date_partition: Optional[str] = None):
    """Ensures bronze partitioned directories exist."""
    partition = date_partition or get_current_date_partition()
    audio_dir = BRONZE_AUDIO_ROOT / f"date={partition}"
    events_dir = BRONZE_EVENTS_ROOT / f"date={partition}"
    audio_dir.mkdir(parents=True, exist_ok=True)
    events_dir.mkdir(parents=True, exist_ok=True)
    return audio_dir, events_dir


def ingest_raw_take(
    audio_bytes: bytes,
    session_id: str,
    preset_name: str,
    take_id: Optional[str] = None,
    client_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Persists raw audio bytes into immutable Bronze storage along with metadata.
    """
    take_uuid = take_id or f"take_{uuid.uuid4().hex[:12]}"
    date_partition = get_current_date_partition()
    audio_dir, _ = ensure_bronze_dirs(date_partition)

    audio_filename = f"{take_uuid}.wav"
    audio_path = audio_dir / audio_filename
    meta_path = audio_dir / f"{take_uuid}_meta.json"

    # Write raw uncompressed audio
    with open(audio_path, "wb") as f:
        f.write(audio_bytes)

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record_meta = {
        "take_id": take_uuid,
        "session_id": session_id,
        "date_partition": date_partition,
        "preset_name": preset_name,
        "file_size_bytes": len(audio_bytes),
        "raw_audio_path": str(audio_path),
        "created_at_utc": now_iso,
        "client_metadata": client_metadata or {},
        "layer": "BRONZE",
    }

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(record_meta, f, indent=2)

    # Also log an ingestion event to events.jsonl
    log_event(
        session_id=session_id,
        event_type="AUDIO_TAKE_INGESTED",
        payload={
            "take_id": take_uuid,
            "preset_name": preset_name,
            "file_size_bytes": len(audio_bytes),
            "date_partition": date_partition,
        },
    )

    return record_meta


def log_event(
    session_id: str,
    event_type: str,
    payload: Dict[str, Any],
    timestamp_utc: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Appends an immutable telemetry event log to the Bronze events JSONL stream.
    """
    date_partition = get_current_date_partition()
    _, events_dir = ensure_bronze_dirs(date_partition)
    events_file = events_dir / "events.jsonl"

    ts = timestamp_utc or datetime.datetime.now(datetime.timezone.utc).isoformat()
    event_record = {
        "event_id": str(uuid.uuid4()),
        "session_id": session_id,
        "event_type": event_type,
        "payload": payload,
        "timestamp_utc": ts,
        "date_partition": date_partition,
    }

    with open(events_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(event_record) + "\n")

    return event_record


def list_bronze_takes() -> List[Dict[str, Any]]:
    """Lists all raw takes ingested into Bronze."""
    takes = []
    if not BRONZE_AUDIO_ROOT.exists():
        return takes

    for partition_dir in sorted(BRONZE_AUDIO_ROOT.glob("date=*"), reverse=True):
        if not partition_dir.is_dir():
            continue
        for meta_file in sorted(partition_dir.glob("*_meta.json"), reverse=True):
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    takes.append(data)
            except Exception:
                continue
    return takes


def get_take_bronze_meta(take_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves bronze metadata for a specific take ID."""
    if not BRONZE_AUDIO_ROOT.exists():
        return None

    for meta_file in BRONZE_AUDIO_ROOT.glob(f"date=*/{take_id}_meta.json"):
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None
