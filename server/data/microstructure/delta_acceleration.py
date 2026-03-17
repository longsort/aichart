"""
Delta Acceleration: trade delta (buy - sell volume) over 30s/60s/180s/300s windows.
Acceleration = rate of change of delta (strengthening buy/sell pressure).
"""

import time
from typing import Optional


def compute_delta_acceleration(
    trades: Optional[list],
    now_ts_ms: Optional[int] = None,
    windows_sec: tuple = (30, 60, 180, 300),
) -> dict:
    """
    Compute delta and delta acceleration per window.
    Returns { deltaNow, delta1m, delta3m, delta5m, deltaAcceleration, cumulativeDelta, aggressionBias }.
    """
    now = now_ts_ms or int(time.time() * 1000)
    if not trades:
        return {
            "deltaNow": 0.0,
            "delta1m": 0.0,
            "delta3m": 0.0,
            "delta5m": 0.0,
            "deltaAcceleration": 0.0,
            "cumulativeDelta": 0.0,
            "aggressionBias": "neutral",
        }
    deltas_by_window: list[float] = []
    for w in windows_sec:
        cutoff = now - w * 1000
        window_delta = sum(t.get("delta", 0) for t in trades if t.get("timestamp", 0) >= cutoff)
        deltas_by_window.append(window_delta)
    cumulative = trades[-1].get("cumulativeDelta", 0.0) if trades else 0.0
    delta_now = deltas_by_window[0] if deltas_by_window else 0.0
    delta_1m = deltas_by_window[1] if len(deltas_by_window) > 1 else 0.0
    delta_3m = deltas_by_window[2] if len(deltas_by_window) > 2 else 0.0
    delta_5m = deltas_by_window[3] if len(deltas_by_window) > 3 else 0.0
    if len(deltas_by_window) >= 2 and windows_sec[1] > 0:
        accel = (delta_now - delta_1m) / windows_sec[1]
    else:
        accel = 0.0
    if accel > 0.1:
        aggression = "buy"
    elif accel < -0.1:
        aggression = "sell"
    else:
        aggression = "neutral"
    return {
        "deltaNow": round(delta_now, 4),
        "delta1m": round(delta_1m, 4),
        "delta3m": round(delta_3m, 4),
        "delta5m": round(delta_5m, 4),
        "deltaAcceleration": round(accel, 6),
        "cumulativeDelta": round(cumulative, 4),
        "aggressionBias": aggression,
    }
