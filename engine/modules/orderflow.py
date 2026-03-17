"""
ORDERFLOW ENGINE
orderflow_score = volume_spike*0.4 + displacement*0.4 + momentum_velocity*0.2
"""

import pandas as pd
import numpy as np


def run(df: pd.DataFrame, atr_period: int = 14) -> pd.DataFrame:
    df = df.copy()
    o, h, l, c, v = df["open"], df["high"], df["low"], df["close"], df["volume"]
    atr = (h - l).rolling(atr_period).mean()
    vol_spike = df.get("volume_spike", (v > v.rolling(20).mean() * 2).astype(float))
    displacement = ((c - o).abs() > atr * 1.8).astype(float)
    mom_vel = (c - c.shift(1)).abs() / (atr + 1e-12)
    df["orderflow_score"] = vol_spike * 0.4 + displacement * 0.4 + np.clip(mom_vel, 0, 2) * 0.2
    return df
