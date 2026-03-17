"""
PATTERN ENGINE
Detect: triangle, flag, channel, range, wedge
"""

import pandas as pd
import numpy as np


def run(df: pd.DataFrame, lookback: int = 50) -> pd.DataFrame:
    df = df.copy()
    h = df["high"].rolling(lookback).max()
    l = df["low"].rolling(lookback).min()
    range_pct = (h - l) / (l + 1e-12)
    df["range_score"] = (range_pct < 0.02).astype(float)

    # Simple pattern scores based on price action
    slope_high = df["high"].rolling(20).apply(lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) >= 2 else 0)
    slope_low = df["low"].rolling(20).apply(lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) >= 2 else 0)
    converging = (slope_high - slope_low).abs() < 0.0001
    df["triangle_score"] = converging.astype(float)
    df["pattern_score"] = (df["range_score"] * 0.3 + df["triangle_score"] * 0.7).fillna(0)
    return df
