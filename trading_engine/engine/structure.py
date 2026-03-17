"""
MARKET STRUCTURE ENGINE
-----------------------
Detects swing highs/lows (5-candle fractal), HH/HL/LH/LL, BOS, CHOCH.
"""

import pandas as pd
import numpy as np


def swing_high_low(
    high: pd.Series,
    low: pd.Series,
    left: int = 5,
    right: int = 5,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Fractal swing detection. Returns (swing_high_idx, swing_low_idx).
    swing_high: high[i] >= high[i±k] for k in 1..5
    """
    n = len(high)
    sh = np.zeros(n)
    sl = np.zeros(n)
    for i in range(left, n - right):
        if high.iloc[i] >= high.iloc[i - left : i + right + 1].max():
            sh[i] = high.iloc[i]
        if low.iloc[i] <= low.iloc[i - left : i + right + 1].min():
            sl[i] = low.iloc[i]
    return sh, sl


def run_structure_engine(df: pd.DataFrame, fractal_len: int = 5) -> pd.DataFrame:
    """
    Compute market structure: swing_high, swing_low, HH, HL, LH, LL, BOS, CHOCH.
    """
    df = df.copy()
    h, l, c = df["high"], df["low"], df["close"]
    sh, sl = swing_high_low(h, l, fractal_len, fractal_len)
    df["swing_high"] = sh
    df["swing_low"] = sl

    sh_idx = np.where(sh > 0)[0]
    sl_idx = np.where(sl > 0)[0]

    # Build swing series
    swings = []
    for i in sh_idx:
        swings.append({"idx": i, "type": "high", "price": h.iloc[i]})
    for i in sl_idx:
        swings.append({"idx": i, "type": "low", "price": l.iloc[i]})
    swings.sort(key=lambda x: x["idx"])

    df["bos_bullish"] = 0
    df["bos_bearish"] = 0
    df["choch_bullish"] = 0
    df["choch_bearish"] = 0

    prev_swing_high = np.nan
    prev_swing_low = np.nan
    trend = "range"

    for s in swings:
        idx, typ, price = s["idx"], s["type"], s["price"]
        if typ == "high":
            if not np.isnan(prev_swing_high) and price > prev_swing_high:
                df.loc[df.index[idx], "bos_bullish"] = 1
                if trend == "bearish":
                    df.loc[df.index[idx], "choch_bullish"] = 1
                trend = "bullish"
            prev_swing_high = price
        else:
            if not np.isnan(prev_swing_low) and price < prev_swing_low:
                df.loc[df.index[idx], "bos_bearish"] = 1
                if trend == "bullish":
                    df.loc[df.index[idx], "choch_bearish"] = 1
                trend = "bearish"
            prev_swing_low = price

    # HH/HL/LH/LL labels (last few swings)
    last_highs = [s for s in swings if s["type"] == "high"][-5:]
    last_lows = [s for s in swings if s["type"] == "low"][-5:]

    df["structure_label"] = ""
    for i in range(1, len(last_highs)):
        cur, prev = last_highs[i], last_highs[i - 1]
        label = "HH" if cur["price"] >= prev["price"] else "LH"
        df.loc[df.index[cur["idx"]], "structure_label"] = label
    for i in range(1, len(last_lows)):
        cur, prev = last_lows[i], last_lows[i - 1]
        label = "LL" if cur["price"] <= prev["price"] else "HL"
        idx = cur["idx"]
        existing = df.loc[df.index[idx], "structure_label"]
        df.loc[df.index[idx], "structure_label"] = str(existing) + label

    return df
