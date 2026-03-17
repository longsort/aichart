"""
ORDERFLOW ENGINE
----------------
Institutional activity: volume_spike, displacement, momentum_velocity.
orderflow_score = volume_spike*0.4 + displacement*0.4 + momentum_velocity*0.2
"""

import pandas as pd
import numpy as np


def run_orderflow_engine(
    df: pd.DataFrame,
    atr_period: int = 14,
    vol_roll: int = 20,
    vol_mult: float = 2.0,
    displacement_mult: float = 1.8,
) -> pd.DataFrame:
    """
    Compute orderflow_score from institutional activity proxies.
    """
    df = df.copy()
    o, h, l, c, v = df["open"], df["high"], df["low"], df["close"], df["volume"]

    atr = (h - l).rolling(atr_period).mean()
    vol_mean = v.rolling(vol_roll).mean()
    volume_spike = (v > vol_mean * vol_mult).astype(float)
    displacement = ((c - o).abs() > atr * displacement_mult).astype(float)
    momentum_velocity = (c - c.shift(1)).abs() / (atr + 1e-12)

    df["volume_spike"] = volume_spike
    df["displacement_strength"] = displacement
    df["momentum_velocity"] = momentum_velocity
    df["orderflow_score"] = (
        volume_spike * 0.4
        + displacement * 0.4
        + np.clip(momentum_velocity, 0, 2) * 0.2
    )
    return df
