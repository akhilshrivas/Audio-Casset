/**
 * DeshiWave - "Data Engineer's Audio Lakehouse Explorer"
 * Displays Medallion Architecture telemetry (Bronze -> Silver -> Gold),
 * DuckDB OLAP metrics, interactive acoustic time-series charts, and a live SQL console.
 * Styled in smooth Spotify matte dark design.
 */

import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, Play, Terminal, Layers, TrendingUp, BarChart3 } from 'lucide-react';

interface LakehouseProps {
  currentSessionId: string;
}

export const LakehouseAnalyticsTab: React.FC<LakehouseProps> = ({ currentSessionId: _ }) => {
  const [lakehouseData, setLakehouseData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedTakeId, setSelectedTakeId] = useState<string>('');
  const [takeTelemetry, setTakeTelemetry] = useState<any>(null);
  const [loadingTelemetry, setLoadingTelemetry] = useState<boolean>(false);

  // SQL Console state
  const [sqlQuery, setSqlQuery] = useState<string>(
    'SELECT preset_name, COUNT(*) as frames, ROUND(AVG(spectral_centroid_hz), 1) as avg_brightness_hz, ROUND(AVG(rms_energy_db), 1) as avg_rms_db FROM silver_vocal_telemetry GROUP BY preset_name ORDER BY avg_brightness_hz DESC'
  );
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [isExecutingSql, setIsExecutingSql] = useState<boolean>(false);

  // Fetch Gold Lakehouse Summary
  const fetchSummary = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/analytics/lakehouse-summary');
      if (res.ok) {
        const data = await res.json();
        setLakehouseData(data);
        if (data.recent_takes && data.recent_takes.length > 0 && !selectedTakeId) {
          setSelectedTakeId(data.recent_takes[0].take_id);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch lakehouse summary:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch telemetry for selected take
  const fetchTakeTelemetry = async (takeId: string) => {
    if (!takeId) return;
    setLoadingTelemetry(true);
    try {
      const res = await fetch(`/api/analytics/take/${takeId}/telemetry?max_points=120`);
      if (res.ok) {
        const data = await res.json();
        setTakeTelemetry(data);
      }
    } catch (e) {
      console.warn('Failed to load telemetry for take:', e);
    } finally {
      setLoadingTelemetry(false);
    }
  };

  // Execute DuckDB SQL Query
  const handleExecuteSql = async () => {
    setIsExecutingSql(true);
    setSqlError(null);
    try {
      const res = await fetch('/api/analytics/sql-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlQuery }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSqlError(data.detail || 'SQL Query failed');
        setSqlResult(null);
      } else {
        setSqlResult(data);
      }
    } catch (e: any) {
      setSqlError(e.message || 'Execution error');
      setSqlResult(null);
    } finally {
      setIsExecutingSql(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    if (selectedTakeId) {
      fetchTakeTelemetry(selectedTakeId);
    }
  }, [selectedTakeId]);

  const kpis = lakehouseData?.kpis || {
    total_takes: 0,
    total_frames: 0,
    total_duration_sec: 0,
    bronze_storage_kb: 0,
    silver_parquet_kb: 0,
    gold_duckdb_kb: 0,
  };

  const effectComparison = lakehouseData?.effect_acoustic_comparison || [];
  const pitchScorecard = lakehouseData?.pitch_stability_scorecard || [];
  const recentTakes = lakehouseData?.recent_takes || [];

  return (
    <div className="space-y-6 pb-24">
      {/* Lakehouse Header */}
      <div className="bg-[#181818] border border-[#282828] rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#00e5ff]/15 flex items-center justify-center text-[#00e5ff]">
              <Database className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Data Engineer's Audio Lakehouse Explorer
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Real-time Medallion Architecture: Bronze (WAV) ➔ Silver (Parquet 50ms) ➔ Gold (DuckDB OLAP)
          </p>
        </div>

        <button
          onClick={fetchSummary}
          disabled={isLoading}
          className="px-4 py-2 bg-[#282828] hover:bg-[#333333] text-white rounded-full text-xs font-semibold flex items-center gap-2 border border-neutral-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#1db954]' : ''}`} />
          Refresh Lakehouse
        </button>
      </div>

      {/* Medallion Pipeline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Bronze */}
        <div className="bg-[#181818] border border-[#282828] hover:border-neutral-700 rounded-2xl p-5 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
              Bronze Layer
            </span>
            <span className="text-xs text-neutral-400 font-mono">{kpis.bronze_storage_kb} KB</span>
          </div>
          <h3 className="font-bold text-sm text-white mb-1">Raw Audio & Ingestion Stream</h3>
          <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
            Immutable 24-bit/48kHz WAV audio files partitioned by <code className="text-amber-400">date=YYYY-MM-DD/</code> and append-only JSONL event logs.
          </p>
          <div className="text-xs font-semibold text-neutral-300 bg-[#121212] p-2.5 rounded-xl border border-neutral-800 flex justify-between">
            <span>Takes Ingested:</span>
            <span className="text-white font-bold">{kpis.total_takes}</span>
          </div>
        </div>

        {/* Silver */}
        <div className="bg-[#181818] border border-[#282828] hover:border-neutral-700 rounded-2xl p-5 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#1db954]/15 text-[#1db954] border border-[#1db954]/30 uppercase tracking-wider">
              Silver Layer
            </span>
            <span className="text-xs text-neutral-400 font-mono">{kpis.silver_parquet_kb} KB</span>
          </div>
          <h3 className="font-bold text-sm text-white mb-1">Acoustic Telemetry Parquet</h3>
          <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
            Windowed 50ms audio feature extraction via Librosa: F0 pitch, RMS energy, spectral centroid & MFCCs.
          </p>
          <div className="text-xs font-semibold text-neutral-300 bg-[#121212] p-2.5 rounded-xl border border-neutral-800 flex justify-between">
            <span>Columnar Frames:</span>
            <span className="text-[#1db954] font-bold">{kpis.total_frames}</span>
          </div>
        </div>

        {/* Gold */}
        <div className="bg-[#181818] border border-[#282828] hover:border-neutral-700 rounded-2xl p-5 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/30 uppercase tracking-wider">
              Gold Layer (DuckDB)
            </span>
            <span className="text-xs text-neutral-400 font-mono">{kpis.gold_duckdb_kb} KB</span>
          </div>
          <h3 className="font-bold text-sm text-white mb-1">OLAP Analytics & Scorecards</h3>
          <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
            In-process DuckDB queries querying Parquet files in milliseconds to compute pitch stability and acoustic shifts.
          </p>
          <div className="text-xs font-semibold text-neutral-300 bg-[#121212] p-2.5 rounded-xl border border-neutral-800 flex justify-between">
            <span>Query Engine:</span>
            <span className="text-[#00e5ff] font-bold">DuckDB 1.5</span>
          </div>
        </div>
      </div>

      {/* Tables Row: Effect Acoustic Comparison & Pitch Stability Scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Acoustic Comparison */}
        <div className="bg-[#181818] border border-[#282828] rounded-2xl p-5 shadow-xl">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#00e5ff]" />
            Effect Acoustic Comparison (DuckDB Direct Aggregations)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 text-[11px]">
                  <th className="pb-2.5">Preset</th>
                  <th className="pb-2.5 text-right">Takes</th>
                  <th className="pb-2.5 text-right">RMS (dBFS)</th>
                  <th className="pb-2.5 text-right">Centroid</th>
                  <th className="pb-2.5 text-right">ZCR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono">
                {effectComparison.length > 0 ? (
                  effectComparison.map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-neutral-800/40">
                      <td className="py-2.5 font-sans font-semibold text-white">{row.preset_name}</td>
                      <td className="py-2.5 text-right text-neutral-400">{row.take_count}</td>
                      <td className="py-2.5 text-right text-amber-400">{row.avg_rms_db}</td>
                      <td className="py-2.5 text-right text-[#00e5ff] font-bold">{row.avg_centroid_hz} Hz</td>
                      <td className="py-2.5 text-right text-[#1db954]">{row.avg_zcr}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-neutral-500 font-sans">
                      Upload or record music to materialize effect comparisons
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pitch Scorecard */}
        <div className="bg-[#181818] border border-[#282828] rounded-2xl p-5 shadow-xl">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#1db954]" />
            Vocal Pitch Stability Scorecard (%)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 text-[11px]">
                  <th className="pb-2.5">Take ID</th>
                  <th className="pb-2.5">Preset</th>
                  <th className="pb-2.5 text-right">Mean F0</th>
                  <th className="pb-2.5 text-right">Stability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono">
                {pitchScorecard.length > 0 ? (
                  pitchScorecard.map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-neutral-800/40">
                      <td className="py-2 text-[#00e5ff] text-[11px] font-bold">{row.take_id}</td>
                      <td className="py-2 text-neutral-300 font-sans text-xs">{row.preset_name}</td>
                      <td className="py-2 text-right text-neutral-300">{row.mean_f0_hz} Hz</td>
                      <td className="py-2 text-right font-bold text-[#1db954]">
                        {row.pitch_stability_pct}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-neutral-500 font-sans">
                      No scorecard records yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Time-Series Charts Viewer */}
      <div className="bg-[#181818] border border-[#282828] rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Parquet 50ms Windowed Acoustic Telemetry
            </h3>
          </div>

          {recentTakes.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-400">Select Take:</span>
              <select
                value={selectedTakeId}
                onChange={(e) => setSelectedTakeId(e.target.value)}
                className="bg-[#121212] border border-neutral-700 text-white rounded-lg px-3 py-1 font-mono text-xs focus:outline-none"
              >
                {recentTakes.map((take: any) => (
                  <option key={take.take_id} value={take.take_id}>
                    {take.take_id} ({take.preset_name} • {take.duration_sec}s)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loadingTelemetry ? (
          <div className="py-10 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#1db954]" />
            Reading Parquet frames from disk...
          </div>
        ) : takeTelemetry && takeTelemetry.points && takeTelemetry.points.length > 0 ? (
          <div className="space-y-4">
            {/* F0 Chart */}
            <div className="bg-[#121212] p-4 rounded-xl border border-neutral-800">
              <div className="flex justify-between text-xs text-neutral-400 mb-2">
                <span className="text-[#ff2d55] font-semibold">● Fundamental Pitch (F0 in Hz)</span>
                <span className="font-mono text-[11px]">Range: 50 Hz - 600 Hz</span>
              </div>
              <div className="h-28 w-full relative">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 100" preserveAspectRatio="none">
                  <line x1="0" y1="25" x2="500" y2="25" stroke="#262626" strokeDasharray="3 3" />
                  <line x1="0" y1="50" x2="500" y2="50" stroke="#262626" strokeDasharray="3 3" />
                  <line x1="0" y1="75" x2="500" y2="75" stroke="#262626" strokeDasharray="3 3" />
                  <polyline
                    fill="none"
                    stroke="#ff2d55"
                    strokeWidth="2.5"
                    points={takeTelemetry.points
                      .map((pt: any, idx: number) => {
                        const x = (idx / (takeTelemetry.points.length - 1)) * 500;
                        const f0 = pt.pitch_f0_hz > 30 ? pt.pitch_f0_hz : 0;
                        const y = 100 - Math.min(100, Math.max(0, (f0 / 500) * 100));
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                </svg>
              </div>
            </div>

            {/* Spectral Centroid Brightness Chart */}
            <div className="bg-[#121212] p-4 rounded-xl border border-neutral-800">
              <div className="flex justify-between text-xs text-neutral-400 mb-2">
                <span className="text-[#00e5ff] font-semibold">● Spectral Centroid Brightness (Hz)</span>
                <span className="font-mono text-[11px]">Range: 0 Hz - 7000 Hz</span>
              </div>
              <div className="h-28 w-full relative">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 100" preserveAspectRatio="none">
                  <line x1="0" y1="25" x2="500" y2="25" stroke="#262626" strokeDasharray="3 3" />
                  <line x1="0" y1="50" x2="500" y2="50" stroke="#262626" strokeDasharray="3 3" />
                  <line x1="0" y1="75" x2="500" y2="75" stroke="#262626" strokeDasharray="3 3" />
                  <polyline
                    fill="none"
                    stroke="#00e5ff"
                    strokeWidth="2.5"
                    points={takeTelemetry.points
                      .map((pt: any, idx: number) => {
                        const x = (idx / (takeTelemetry.points.length - 1)) * 500;
                        const sc = pt.spectral_centroid_hz || 0;
                        const y = 100 - Math.min(100, Math.max(0, (sc / 7000) * 100));
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-neutral-500">
            No take telemetry available. Upload or record music to view Parquet time-series frames.
          </div>
        )}
      </div>

      {/* Live DuckDB SQL Query Console */}
      <div className="bg-[#181818] border border-[#282828] rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#1db954]" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Live DuckDB SQL Query Console
            </h3>
          </div>
          <span className="text-xs text-neutral-400 font-mono">View: silver_vocal_telemetry</span>
        </div>

        {/* Preset Query Chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() =>
              setSqlQuery(
                'SELECT preset_name, COUNT(*) as frames, ROUND(AVG(spectral_centroid_hz), 1) as avg_brightness_hz, ROUND(AVG(rms_energy_db), 1) as avg_rms_db FROM silver_vocal_telemetry GROUP BY preset_name ORDER BY avg_brightness_hz DESC'
              )
            }
            className="text-[11px] bg-[#222222] hover:bg-[#2c2c2c] text-neutral-300 px-3 py-1 rounded-full border border-neutral-700/80 transition"
          >
            Acoustic Comparison
          </button>
          <button
            onClick={() =>
              setSqlQuery(
                'SELECT take_id, preset_name, ROUND(AVG(pitch_f0_hz), 1) as mean_f0, ROUND(STDDEV(pitch_f0_hz), 1) as jitter_hz FROM silver_vocal_telemetry WHERE pitch_f0_hz > 40 GROUP BY take_id, preset_name'
              )
            }
            className="text-[11px] bg-[#222222] hover:bg-[#2c2c2c] text-neutral-300 px-3 py-1 rounded-full border border-neutral-700/80 transition"
          >
            Pitch Jitter Score
          </button>
          <button
            onClick={() =>
              setSqlQuery(
                'SELECT frame_index, timestamp_ms, pitch_f0_hz, spectral_centroid_hz, rms_energy_db FROM silver_vocal_telemetry ORDER BY frame_index LIMIT 15'
              )
            }
            className="text-[11px] bg-[#222222] hover:bg-[#2c2c2c] text-neutral-300 px-3 py-1 rounded-full border border-neutral-700/80 transition"
          >
            First 15 Frames
          </button>
        </div>

        {/* SQL Textarea */}
        <textarea
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          rows={3}
          className="w-full bg-[#121212] border border-neutral-700 rounded-xl p-3 font-mono text-xs text-[#1db954] focus:outline-none focus:border-[#1db954] mb-3"
        />

        <div className="flex justify-end mb-4">
          <button
            onClick={handleExecuteSql}
            disabled={isExecutingSql}
            className="px-5 py-2 bg-[#1db954] hover:bg-[#1ed760] text-black font-bold text-xs rounded-full flex items-center gap-1.5 transition shadow-lg active:scale-95"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            {isExecutingSql ? 'Running DuckDB...' : 'Execute SQL'}
          </button>
        </div>

        {sqlError && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl p-3 text-red-300 text-xs font-mono mb-3">
            Error: {sqlError}
          </div>
        )}

        {sqlResult && sqlResult.rows && (
          <div className="overflow-x-auto border border-neutral-800 rounded-xl max-h-64">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-[#242424] sticky top-0 text-white">
                <tr className="border-b border-neutral-700">
                  {sqlResult.columns.map((col: string, idx: number) => (
                    <th key={idx} className="p-2.5 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 bg-[#121212] text-neutral-300">
                {sqlResult.rows.map((row: any, rIdx: number) => (
                  <tr key={rIdx} className="hover:bg-neutral-800/40">
                    {sqlResult.columns.map((col: string, cIdx: number) => (
                      <td key={cIdx} className="p-2.5">
                        {row[col] !== null ? String(row[col]) : 'NULL'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
