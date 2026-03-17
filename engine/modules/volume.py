"""
VOLUME ENGINE
volume_spike, volume imbalance, volume divergence.
volume_spike = volume > rolling_mean(volume,20)*2
"""

import pandas as pd
import numpy as np


def run(df: pd.DataFrame, roll: int = 20, mult: float = 2.0) -> pd.DataFrame:
    df = df.copy()
    v = df["volume"]
    vol_mean = v.rolling(roll).mean()
    df["volume_spike"] = (v > vol_mean * mult).astype(float)
    df["volume_imbalance"] = (df["close"] > df["open"]).astype(float) * 2 - 1  # +1 buy -1 sell
    df["volume_score"] = df["volume_spike"] * 0.5 + (df["volume_imbalance"] + 1) / 2 * 0.5
    return df
