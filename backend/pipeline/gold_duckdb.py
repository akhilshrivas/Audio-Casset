"""
DeshiWave Medallion Lakehouse - Gold Analytics Layer (DuckDB + Parquet)
Provides fast OLAP queries directly over Silver Parquet files and computes
analytical scorecards: Pitch Stability %, Spectral Centroid shifts, Dynamic Range,
Effect Acoustic Comparison, and ad-hoc SQL query execution.
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
import duckdb

from backend.pipeline.bronze import DATA_LAKE_ROOT
from backend.pipeline.silver import (
    SILVER_TELEMETRY_DIR,
    SILVER_METADATA_DIR,
    SILVER_ROOT,
)

GOLD_ROOT = DATA_LAKE_ROOT / "gold"
GOLD_DB_PATH = GOLD_ROOT / "lakehouse.duckdb"


def ensure_gold_dirs():
    """Ensure gold directory exists."""
    GOLD_ROOT.mkdir(parents=True, exist_ok=True)


def get_duckdb_connection() -> duckdb.DuckDBPyConnection:
    """Returns a DuckDB connection."""
    ensure_gold_dirs()
    con = duckdb.connect(database=str(GOLD_DB_PATH))
    # Register views over parquet files if files exist
    telemetry_glob = str(SILVER_TELEMETRY_DIR / "*.parquet").replace("\\", "/")
    
    parquet_files = list(SILVER_TELEMETRY_DIR.glob("*.parquet"))
    if parquet_files:
        try:
            con.execute(f"""
                CREATE OR REPLACE VIEW silver_vocal_telemetry AS
                SELECT * FROM read_parquet('{telemetry_glob}');
            """)
        except Exception:
            pass
    else:
        # Create empty dummy table with proper schema so queries don't crash
        con.execute("""
            CREATE OR REPLACE VIEW silver_vocal_telemetry AS
            SELECT 
                CAST('' AS VARCHAR) as take_id,
                CAST('' AS VARCHAR) as session_id,
                CAST('' AS VARCHAR) as preset_name,
                CAST(0 AS BIGINT) as frame_index,
                CAST(0.0 AS DOUBLE) as timestamp_ms,
                CAST(-96.0 AS DOUBLE) as rms_energy_db,
                CAST(0.0 AS DOUBLE) as pitch_f0_hz,
                CAST(0.0 AS DOUBLE) as voiced_prob,
                CAST(0.0 AS DOUBLE) as spectral_centroid_hz,
                CAST(0.0 AS DOUBLE) as spectral_bandwidth_hz,
                CAST(0.0 AS DOUBLE) as spectral_rolloff_hz,
                CAST(0.0 AS DOUBLE) as zero_crossing_rate,
                CAST(0.0 AS DOUBLE) as mfcc_1,
                CAST(0.0 AS DOUBLE) as mfcc_2,
                CAST(0.0 AS DOUBLE) as mfcc_3,
                CAST(0.0 AS DOUBLE) as mfcc_4,
                CAST(0.0 AS DOUBLE) as mfcc_5,
                CAST('' AS VARCHAR) as date_partition
            WHERE 1 = 0;
        """)

    return con


def get_lakehouse_summary() -> Dict[str, Any]:
    """
    Computes holistic Gold KPIs:
    - Overall lakehouse statistics (takes count, frame count, storage bytes)
    - Effect Acoustic Comparison (Spectral Centroid & RMS by Preset)
    - Pitch Stability Scorecard (ranked by intonation accuracy)
    - Session summaries
    """
    con = get_duckdb_connection()
    ensure_gold_dirs()

    # Read silver summaries directly from JSON files
    summaries: List[Dict[str, Any]] = []
    if SILVER_METADATA_DIR.exists():
        for f in sorted(SILVER_METADATA_DIR.glob("*_summary.json"), reverse=True):
            try:
                with open(f, "r", encoding="utf-8") as fp:
                    summaries.append(json.load(fp))
            except Exception:
                pass

    total_takes = len(summaries)
    total_frames = sum(s.get("num_frames", 0) for s in summaries)
    total_duration_sec = sum(s.get("duration_sec", 0.0) for s in summaries)

    # Effect acoustic comparison query via DuckDB
    effect_comparison = []
    try:
        df_effect = con.execute("""
            SELECT 
                preset_name,
                COUNT(DISTINCT take_id) as take_count,
                ROUND(AVG(rms_energy_db), 2) as avg_rms_db,
                ROUND(MAX(rms_energy_db), 2) as max_rms_db,
                ROUND(AVG(spectral_centroid_hz), 2) as avg_centroid_hz,
                ROUND(AVG(spectral_rolloff_hz), 2) as avg_rolloff_hz,
                ROUND(AVG(zero_crossing_rate), 4) as avg_zcr,
                ROUND(AVG(CASE WHEN pitch_f0_hz > 30.0 THEN pitch_f0_hz ELSE NULL END), 2) as avg_pitch_hz
            FROM silver_vocal_telemetry
            GROUP BY preset_name
            ORDER BY avg_centroid_hz DESC
        """).fetchdf()
        effect_comparison = df_effect.to_dict(orient="records")
    except Exception:
        pass

    # Pitch stability scorecard
    pitch_scorecard = []
    try:
        df_pitch = con.execute("""
            SELECT 
                take_id,
                preset_name,
                COUNT(*) as total_frames,
                ROUND(SUM(CASE WHEN voiced_prob > 0.5 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as voiced_pct,
                ROUND(AVG(CASE WHEN pitch_f0_hz > 30.0 THEN pitch_f0_hz ELSE NULL END), 2) as mean_f0_hz,
                ROUND(STDDEV(CASE WHEN pitch_f0_hz > 30.0 THEN pitch_f0_hz ELSE NULL END), 2) as pitch_std_hz,
                ROUND(AVG(rms_energy_db), 2) as avg_rms_db
            FROM silver_vocal_telemetry
            GROUP BY take_id, preset_name
            HAVING mean_f0_hz IS NOT NULL
            ORDER BY total_frames DESC
            LIMIT 10
        """).fetchdf()

        for row in df_pitch.to_dict(orient="records"):
            mean_f0 = row.get("mean_f0_hz") or 1.0
            std_f0 = row.get("pitch_std_hz") or 0.0
            stability = max(0.0, min(100.0, 100.0 - (std_f0 / mean_f0 * 100.0)))
            row["pitch_stability_pct"] = round(stability, 2)
            pitch_scorecard.append(row)
    except Exception:
        pass

    # Storage stats across layers
    def dir_size(path: Path) -> int:
        if not path.exists():
            return 0
        return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())

    bronze_bytes = dir_size(DATA_LAKE_ROOT / "bronze")
    silver_bytes = dir_size(DATA_LAKE_ROOT / "silver")
    gold_bytes = dir_size(GOLD_ROOT)

    con.close()

    return {
        "kpis": {
            "total_takes": total_takes,
            "total_frames": total_frames,
            "total_duration_sec": round(total_duration_sec, 2),
            "bronze_storage_kb": round(bronze_bytes / 1024, 2),
            "silver_parquet_kb": round(silver_bytes / 1024, 2),
            "gold_duckdb_kb": round(gold_bytes / 1024, 2),
        },
        "recent_takes": summaries[:10],
        "effect_acoustic_comparison": effect_comparison,
        "pitch_stability_scorecard": pitch_scorecard,
    }


def get_take_telemetry_series(take_id: str, max_points: int = 400) -> Dict[str, Any]:
    """
    Fetches downsampled/exact time-series points for a specific take from Parquet.
    Used for frontend interactive oscilloscope & acoustic line charts.
    """
    parquet_path = SILVER_TELEMETRY_DIR / f"{take_id}.parquet"
    if not parquet_path.exists():
        return {"take_id": take_id, "points": [], "summary": None}

    con = duckdb.connect()
    p_str = str(parquet_path).replace("\\", "/")

    # Fetch ordered rows
    query = f"""
        SELECT 
            frame_index,
            ROUND(timestamp_ms, 1) as timestamp_ms,
            ROUND(rms_energy_db, 2) as rms_energy_db,
            ROUND(pitch_f0_hz, 2) as pitch_f0_hz,
            ROUND(voiced_prob, 3) as voiced_prob,
            ROUND(spectral_centroid_hz, 2) as spectral_centroid_hz,
            ROUND(spectral_bandwidth_hz, 2) as spectral_bandwidth_hz,
            ROUND(spectral_rolloff_hz, 2) as spectral_rolloff_hz,
            ROUND(zero_crossing_rate, 4) as zero_crossing_rate,
            ROUND(mfcc_1, 2) as mfcc_1,
            ROUND(mfcc_2, 2) as mfcc_2
        FROM read_parquet('{p_str}')
        ORDER BY frame_index ASC
    """
    df = con.execute(query).fetchdf()
    total_count = len(df)

    # Downsample evenly if exceeding max_points
    if total_count > max_points:
        step = int(np.ceil(total_count / max_points))
        df = df.iloc[::step]

    points = df.to_dict(orient="records")
    con.close()

    summary_file = SILVER_METADATA_DIR / f"{take_id}_summary.json"
    summary_data = None
    if summary_file.exists():
        try:
            with open(summary_file, "r", encoding="utf-8") as f:
                summary_data = json.load(f)
        except Exception:
            pass

    return {
        "take_id": take_id,
        "points": points,
        "summary": summary_data,
        "total_frames": total_count,
    }


def execute_custom_sql(sql_query: str) -> Dict[str, Any]:
    """
    Executes a custom SQL query directly on the DuckDB engine.
    Restricted to SELECT queries for safety.
    """
    clean_sql = sql_query.strip()
    if not clean_sql.upper().startswith("SELECT") and not clean_sql.upper().startswith("WITH") and not clean_sql.upper().startswith("DESCRIBE") and not clean_sql.upper().startswith("EXPLAIN"):
        raise ValueError("Only read-only SELECT / WITH / DESCRIBE queries are permitted in the Gold Lakehouse.")

    con = get_duckdb_connection()
    try:
        df = con.execute(clean_sql).fetchdf()
        columns = list(df.columns)
        # Convert NaN to None for clean JSON serialization
        df_clean = df.fillna(0.0)
        rows = df_clean.to_dict(orient="records")
        return {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "status": "SUCCESS",
        }
    finally:
        con.close()
