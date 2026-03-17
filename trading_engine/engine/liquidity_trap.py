"""
LIQUIDITY TRAP ENGINE
---------------------
Detects false breakouts (bearish/bullish traps).
Bearish trap: high > prev_high AND close < prev_high
Bullish trap: low < prev_low AND close > prev_low
Confirmed with displacement.
"""

import pandas as pd
import numpy as np


def run_liquidity_trap_engine(
    df: pd.DataFrame,
    atr_period: int = 14,
    displacement_mult: float = 1.5,
) -> pd.DataFrame:
    """
    Detect liquidity traps (false breakouts).
    """
    df = df.copy()
    h, l, c, o = df["high"], df["low"], df["close"], df["open"]
    prev_high = h.shift(1)
    prev_low = l.shift(1)
    atr = (h - l).rolling(atr_period).mean()
    body = (c - o).abs()
    displacement = body > (atr * displacement_mult)

    bearish_trap = (h > prev_high) & (c < prev_high)
    bullish_trap = (l < prev_low) & (c > prev_low)

    df["bearish_trap"] = bearish_trap.astype(int)
    df["bullish_trap"] = bullish_trap.astype(int)
    df["bearish_trap_confirmed"] = (bearish_trap & displacement.shift(-1).fillna(False)).astype(int)
    df["bullish_trap_confirmed"] = (bullish_trap & displacement.shift(-1).fillna(False)).astype(int)

    return df
