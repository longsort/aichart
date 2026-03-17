"""
LIQUIDITY ENGINE
Equal highs/lows, prev day H/L, weekly H/L.
liquidity_density, nearest_liquidity_target
Rule: abs(l1-l2)/l1 < 0.001
"""

import pandas as pd
import numpy as np


def run(df: pd.DataFrame, eq_threshold: float = 0.001, session_bars: int = 24, week_bars: int = 168) -> pd.DataFrame:
    df = df.copy()
    h, l, c = df["high"], df["low"], df["close"]

    eq_high = np.zeros(len(df))
    eq_low = np.zeros(len(df))
    for i in range(20, len(df)):
        window_h = h.iloc[i - 20 : i]
        window_l = l.iloc[i - 20 : i]
        for j in range(len(window_h) - 1):
            if abs(window_h.iloc[-1] - window_h.iloc[j]) / (window_h.iloc[-1] + 1e-12) < eq_threshold:
                eq_high[i] = 1
                break
        for j in range(len(window_l) - 1):
            if abs(window_l.iloc[-1] - window_l.iloc[j]) / (window_l.iloc[-1] + 1e-12) < eq_threshold:
                eq_low[i] = 1
                break

    df["equal_high"] = eq_high
    df["equal_low"] = eq_low
    df["prev_day_high"] = h.shift(1).rolling(session_bars).max()
    df["prev_day_low"] = l.shift(1).rolling(session_bars).min()
    df["weekly_high"] = h.rolling(week_bars).max()
    df["weekly_low"] = l.rolling(week_bars).min()

    eh = pd.Series(eq_high, index=df.index).rolling(5).max()
    el = pd.Series(eq_low, index=df.index).rolling(5).max()
    session_h = (h >= df["prev_day_high"].shift(1)).astype(int)
    session_l = (l <= df["prev_day_low"].shift(1)).astype(int)
    df["liquidity_density"] = eh * 3 + el * 3 + session_h * 2 + session_l * 2

    levels_above = df[["prev_day_high", "weekly_high"]].max(axis=1)
    levels_below = df[["prev_day_low", "weekly_low"]].min(axis=1)
    dist_up = (levels_above - c).clip(lower=0)
    dist_down = (c - levels_below).clip(lower=0)
    df["nearest_liquidity_target"] = np.where(dist_up < dist_down, levels_above, levels_below)
    df["distance_to_liquidity"] = np.minimum(dist_up, dist_down)

    return df
