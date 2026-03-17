"""
SCENARIO ENGINE
Generate trading scenarios.
Scenario A: break resistance -> long
Scenario B: reject resistance -> short
"""

import pandas as pd
import numpy as np


def run(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    c = df["close"]
    res = df["high"].rolling(50).max().shift(1)
    supp = df["low"].rolling(50).min().shift(1)

    df["scenario_a"] = "break_resistance_long"  # price above resistance
    df["scenario_b"] = "reject_resistance_short"
    df["near_resistance"] = (c >= res * 0.998).astype(int)
    df["near_support"] = (c <= supp * 1.002).astype(int)
    df["scenario"] = np.where(df["near_resistance"] == 1, "break_or_reject_resistance", "range")
    return df
