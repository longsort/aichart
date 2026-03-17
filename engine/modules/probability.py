"""
PROBABILITY ENGINE
Combine: structure_score, liquidity_score, volume_score, pattern_score, trend_score
Output: probability 0-100
Rules: >70 strong, >60 tradable, <50 ignore
"""

import pandas as pd
import numpy as np


def run(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    def col(name, default=0):
        return df[name].fillna(default) if name in df.columns else pd.Series(default, index=df.index)

    structure = col("bos_bullish") * 0.3 - col("bos_bearish") * 0.3 + col("choch_bullish") * 0.2 - col("choch_bearish") * 0.2
    liquidity = col("liquidity_density", 0) / 20
    volume = col("volume_score", 0.5)
    pattern = col("pattern_score", 0.5)
    trend = (col("trend_direction").astype(str) == "bullish").astype(float) * 0.2 + 0.4

    raw = (structure + 0.5) * 20 + liquidity * 20 + volume * 20 + pattern * 20 + trend * 20
    df["probability"] = np.clip(raw, 0, 100)
    df["signal_strength"] = np.where(df["probability"] > 70, "strong",
                                      np.where(df["probability"] > 60, "tradable",
                                              np.where(df["probability"] < 50, "ignore", "weak")))
    return df
