"""
FEATURE ENGINE
--------------
Generate ML features: structure_score, liquidity_density, distance_to_liquidity,
order_block_strength, fvg_size, volume_spike, trend_strength, volatility_regime,
displacement_strength, orderflow_score.
"""

import pandas as pd
import numpy as np


def run_feature_engine(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build feature vector for ML model.
    """
    df = df.copy()

    def col(name: str, default=0):
        if name in df.columns:
            return df[name].fillna(default)
        return pd.Series(default, index=df.index)

    df["structure_score"] = (
        col("bos_bullish") * 0.5 - col("bos_bearish") * 0.5
        + col("choch_bullish") * 0.4 - col("choch_bearish") * 0.4
    )
    df["liquidity_density_norm"] = col("liquidity_density") / 20
    df["distance_to_liquidity"] = col("distance_to_target") / (df["close"] + 1e-12)
    df["order_block_strength"] = col("ob_score")
    df["fvg_size"] = col("fvg_size")
    df["volume_spike"] = col("volume_spike")
    df["trend_strength_norm"] = col("trend_strength") / 100
    df["volatility_regime"] = (col("volatility_state", "normal").astype(str) == "expansion").astype(int)
    df["displacement_strength"] = col("displacement_strength")
    df["orderflow_score"] = col("orderflow_score")

    return df
