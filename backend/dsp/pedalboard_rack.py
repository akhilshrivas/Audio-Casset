"""
DeshiWave DSP - Studio-Grade Pedalboard DSP Rack
Powered by Spotify Pedalboard (C++ VST-grade DSP).
Provides exact DSP node chains matching the frontend Web Audio rack.
"""

from typing import Dict, Any, Optional
import numpy as np
import pedalboard as pb


class PedalboardRack:
    """
    Manager for Spotify Pedalboard chains with customizable parameters
    for studio-grade server-side rendering and medallion re-processing.
    """

    @staticmethod
    def create_reverb_chain(
        room_size: float = 0.82,
        damping: float = 0.45,
        wet_level: float = 0.40,
        dry_level: float = 0.85,
        pre_delay_seconds: float = 0.040,
        low_cut_hz: float = 120.0,
        high_cut_hz: float = 4500.0,
    ) -> pb.Pedalboard:
        """Studio Concert Reverb with pre-delay and band-limiting."""
        return pb.Pedalboard([
            pb.HighpassFilter(cutoff_frequency_hz=low_cut_hz),
            pb.Delay(delay_seconds=pre_delay_seconds, feedback=0.08, mix=0.25),
            pb.Reverb(
                room_size=room_size,
                damping=damping,
                wet_level=wet_level,
                dry_level=dry_level,
                width=1.0,
            ),
            pb.LowpassFilter(cutoff_frequency_hz=high_cut_hz),
        ])

    @staticmethod
    def create_bhojpuri_garda_chain(
        presence_gain_db: float = 7.0,
        presence_freq_hz: float = 3200.0,
        presence_q: float = 1.8,
        air_boost_db: float = 4.0,
        delay_time_seconds: float = 0.135,
        delay_feedback: float = 0.38,
        delay_mix: float = 0.35,
        pitch_semitones: float = 1.5,
        compressor_threshold_db: float = -28.0,
        compressor_ratio: float = 12.0,
    ) -> pb.Pedalboard:
        """
        Bhojpuri Garda Vocal Chain:
        - Pitch & formant edge (0ms retune character)
        - Peaking mid presence bite (3.2 kHz)
        - High-shelf air boost (8 kHz)
        - Rhythmic slapback stadium delay (135ms)
        - Brickwall dynamic squash (12:1 ratio)
        """
        return pb.Pedalboard([
            pb.PitchShift(semitones=pitch_semitones),
            pb.PeakFilter(
                cutoff_frequency_hz=presence_freq_hz,
                gain_db=presence_gain_db,
                q=presence_q,
            ),
            pb.HighShelfFilter(
                cutoff_frequency_hz=8000.0,
                gain_db=air_boost_db,
                q=0.707,
            ),
            pb.Delay(
                delay_seconds=delay_time_seconds,
                feedback=delay_feedback,
                mix=delay_mix,
            ),
            pb.Compressor(
                threshold_db=compressor_threshold_db,
                ratio=compressor_ratio,
                attack_ms=2.0,
                release_ms=120.0,
            ),
            pb.Gain(gain_db=3.5),
        ])

    @staticmethod
    def create_cassette_90s_chain(
        saturation_drive_db: float = 3.2,
        flutter_depth: float = 0.16,
        flutter_rate_hz: float = 0.5,
        low_cutoff_hz: float = 45.0,
        high_cutoff_hz: float = 12800.0,
    ) -> pb.Pedalboard:
        """
        Golden Era Analog Cassette (Kishore Kumar / HMV Vibe):
        - Subsonic filter (45 Hz) preserving full low-end warmth
        - Tape head bump (+3.2 dB at 195 Hz) for rich baritone vocal body
        - Smooth high-frequency tape roll-off (12.8 kHz)
        - Musical magnetic tape saturation & subtle organic reel drift
        """
        return pb.Pedalboard([
            pb.HighpassFilter(cutoff_frequency_hz=low_cutoff_hz),
            pb.PeakFilter(cutoff_frequency_hz=195.0, gain_db=3.2, q=0.95),
            pb.PeakFilter(cutoff_frequency_hz=3200.0, gain_db=1.8, q=1.1),
            pb.LowpassFilter(cutoff_frequency_hz=high_cutoff_hz),
            pb.Distortion(drive_db=saturation_drive_db),
            pb.Chorus(
                rate_hz=flutter_rate_hz,
                depth=flutter_depth,
                centre_delay_ms=3.5,
                feedback=0.08,
                mix=0.18,
            ),
            pb.Gain(gain_db=0.8),
        ])

    @staticmethod
    def create_radio_90s_chain(
        drive_db: float = 3.5,
        cabinet_peak_freq_hz: float = 1450.0,
        cabinet_peak_gain_db: float = 3.5,
        low_cutoff_hz: float = 85.0,
        high_cutoff_hz: float = 9200.0,
    ) -> pb.Pedalboard:
        """
        Vividh Bharati Radio (Classic Transistor Broadcast Vibe):
        - Warm radio contour (85 Hz to 9.2 kHz)
        - Resonant wooden cabinet speaker peak at 1.45 kHz
        - Radio chest warmth peak at 240 Hz
        - Mellow germanium transistor warmth & broadcast compression
        """
        return pb.Pedalboard([
            pb.HighpassFilter(cutoff_frequency_hz=low_cutoff_hz),
            pb.PeakFilter(cutoff_frequency_hz=240.0, gain_db=2.5, q=1.1),
            pb.PeakFilter(
                cutoff_frequency_hz=cabinet_peak_freq_hz,
                gain_db=cabinet_peak_gain_db,
                q=1.4,
            ),
            pb.LowpassFilter(cutoff_frequency_hz=high_cutoff_hz),
            pb.Distortion(drive_db=drive_db),
            pb.Compressor(
                threshold_db=-16.0,
                ratio=3.5,
                attack_ms=8.0,
                release_ms=120.0,
            ),
            pb.Gain(gain_db=1.2),
        ])

    @classmethod
    def get_chain(cls, preset_name: str, params: Optional[Dict[str, Any]] = None) -> pb.Pedalboard:
        """Factory method to get a configured chain by preset name."""
        name = (preset_name or "").lower().strip()
        params = params or {}

        if "bhojpuri" in name or "garda" in name:
            return cls.create_bhojpuri_garda_chain(
                presence_gain_db=params.get("presence_gain_db", 7.0),
                delay_time_seconds=params.get("delay_time_seconds", 0.135),
                delay_feedback=params.get("delay_feedback", 0.38),
                pitch_semitones=params.get("pitch_semitones", 1.5),
            )
        elif "cassette" in name or "tape" in name:
            return cls.create_cassette_90s_chain(
                saturation_drive_db=params.get("saturation_drive_db", 7.5),
                flutter_depth=params.get("flutter_depth", 0.32),
            )
        elif "radio" in name or "vividh" in name or "am" in name:
            return cls.create_radio_90s_chain(
                drive_db=params.get("drive_db", 13.5),
            )
        elif "reverb" in name or "concert" in name or "hall" in name:
            return cls.create_reverb_chain(
                room_size=params.get("room_size", 0.82),
                wet_level=params.get("wet_level", 0.40),
            )
        else:
            # Studio Dry Pass-through
            return pb.Pedalboard([pb.Gain(gain_db=0.0)])

    @classmethod
    def process_audio(
        cls,
        audio_data: np.ndarray,
        sample_rate: int,
        preset_name: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> np.ndarray:
        """
        Process audio array (1D or 2D) through the selected DSP preset.
        Returns float32 processed numpy array.
        """
        board = cls.get_chain(preset_name, params)
        # Ensure shape is (channels, samples) for pedalboard
        is_1d = audio_data.ndim == 1
        if is_1d:
            audio_for_pb = np.expand_dims(audio_data.astype(np.float32), axis=0)
        else:
            audio_for_pb = audio_data.astype(np.float32)
            if audio_for_pb.shape[0] > audio_for_pb.shape[1]:
                audio_for_pb = audio_for_pb.T

        processed = board(audio_for_pb, sample_rate)

        if is_1d:
            return processed[0]
        return processed
