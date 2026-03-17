"""
LIQUIDITY ENGINE
----------------
Detects liquidity pools: equal highs/lows, previous day high/low, session levels.
Computes liquidity density score.
"""

import pandas as pd
import numpy as np
from typing import Tuple


def _equal_highs(high: pd.Series, threshold: float = 0.001) -> pd.Series:
    """1 where equal high cluster detected."""
    out = np.zeros(len(high), dtype=float)
    for i in range(1, len(high) - 1):
        for j in range(max(0, i - 20), i):
            if abs(high.iloc[i] - high.iloc[j]) / (high.iloc[i] + 1e-12) < threshold:
                out[i] = 1
                break
    return pd.Series(out, index=high.index)


def _equal_lows(low: pd.Series, threshold: float = 0.001) -> pd.Series:
    """1 where equal low cluster detected."""
    out = np.zeros(len(low), dtype=float)
    for i in range(1, len(low) - 1):
        for j in range(max(0, i - 20), i):
            if abs(low.iloc[i] - low.iloc[j]) / (low.iloc[i] + 1e-12) < threshold:
                out[i] = 1
                break
    return pd.Series(out, index=low.index)


def run_liquidity_engine(
    df: pd.DataFrame,
    equal_threshold: float = 0.001,
    session_bars: int = 24,
) -> pd.DataFrame:
    """
    Compute liquidity map: equal highs/lows, prev day H/L, session H/L.
    liquidity_density = (equal_high_clusters * 3) + (equal_low_clusters * 3)
                     + (session_high * 2) + (session_low * 2)
                     + (stop_sweep_history * 4)
    """
    df = df.copy()
    h, l, c = df["high"], df["low"], df["close"]

    # Equal highs
    eh = _equal_highs(h, equal_threshold)
    df["equal_high"] = eh
    equal_high_clusters = eh.rolling(5).max()

    # Equal lows
    el = _equal_lows(l, equal_threshold)
    df["equal_low"] = el
    equal_low_clusters = el.rolling(5).max()

    # Previous day high/low (approximate with rolling 24 bars for hourly)
    df["prev_day_high"] = h.shift(1).rolling(session_bars).max()
    df["prev_day_low"] = l.shift(1).rolling(session_bars).min()

    # Session high/low
    df["session_high"] = h.rolling(session_bars).max()
    df["session_low"] = l.rolling(session_bars).min()

    # Stop sweep: high > prev_high then close < prev_high (bearish trap)
    prev_high = h.shift(1)
    prev_low = l.shift(1)
    stop_sweep_up = (h > prev_high) & (c < prev_high)
    stop_sweep_down = (l < prev_low) & (c > prev_low)
    df["stop_sweep_up"] = stop_sweep_up.astype(int)
    df["stop_sweep_down"] = stop_sweep_down.astype(int)
    stop_sweep_hist = (stop_sweep_up | stop_sweep_down).rolling(20).sum()

    df["liquidity_density"] = (
        equal_high_clusters.fillna(0) * 3
        + equal_low_clusters.fillna(0) * 3
        + (h >= df["session_high"].shift(1)).astype(int).fillna(0) * 2
        + (l <= df["session_low"].shift(1)).astype(int).fillna(0) * 2
        + stop_sweep_hist.fillna(0) * 4
    )
    return df
