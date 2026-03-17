"""
LIQUIDITY MAGNET MODEL
----------------------
Price moves toward liquidity. Find nearest target.
Output: next_liquidity_target, distance_to_target, direction_bias
"""

import pandas as pd
import numpy as np


def run_liquidity_magnet_engine(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute nearest liquidity target and distance.
    """
    df = df.copy()
    c = df["close"]
    h, l = df["high"], df["low"]

    # Liquidity levels
    eq_high = h.rolling(50).max()
    eq_low = l.rolling(50).min()
    prev_day_high = h.shift(24).rolling(24).max()
    prev_day_low = l.shift(24).rolling(24).min()

    levels_above = pd.concat([eq_high, prev_day_high], axis=1).max(axis=1)
    levels_below = pd.concat([eq_low, prev_day_low], axis=1).min(axis=1)

    dist_up = levels_above - c
    dist_down = c - levels_below
    dist_up = dist_up.clip(lower=0)
    dist_down = dist_down.clip(lower=0)

    nearest_above = levels_above
    nearest_below = levels_below
    df["next_liquidity_target"] = np.where(dist_up < dist_down, nearest_above, nearest_below)
    df["distance_to_target"] = np.minimum(dist_up, dist_down)
    df["direction_bias"] = np.where(dist_up < dist_down, 1, -1)

    return df
