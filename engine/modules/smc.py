"""
SMC ENGINE
Swing highs/lows (5-candle fractal), HH/HL/LH/LL, BOS, CHOCH.
BOS: close > prev swing high OR close < prev swing low
CHOCH: trend sequence break
"""

import pandas as pd
import numpy as np


def swing_high_low(df: pd.DataFrame, left: int = 5, right: int = 5) -> tuple:
    h, l = df["high"], df["low"]
    sh = np.zeros(len(df))
    sl = np.zeros(len(df))
    for i in range(left, len(df) - right):
        if h.iloc[i] >= h.iloc[i - left : i + right + 1].max():
            sh[i] = h.iloc[i]
        if l.iloc[i] <= l.iloc[i - left : i + right + 1].min():
            sl[i] = l.iloc[i]
    return sh, sl


def run(df: pd.DataFrame, fractal: int = 5) -> pd.DataFrame:
    df = df.copy()
    h, l, c = df["high"], df["low"], df["close"]
    sh, sl = swing_high_low(df, fractal, fractal)
    df["swing_high"] = sh
    df["swing_low"] = sl

    sh_idx = np.where(sh > 0)[0]
    sl_idx = np.where(sl > 0)[0]
    swings = []
    for i in sh_idx:
        swings.append({"idx": int(i), "type": "high", "price": h.iloc[i]})
    for i in sl_idx:
        swings.append({"idx": int(i), "type": "low", "price": l.iloc[i]})
    swings.sort(key=lambda x: x["idx"])

    df["bos_bullish"] = 0
    df["bos_bearish"] = 0
    df["choch_bullish"] = 0
    df["choch_bearish"] = 0

    prev_high, prev_low = np.nan, np.nan
    trend = "range"

    for s in swings:
        idx, typ, price = s["idx"], s["type"], s["price"]
        if typ == "high":
            if not np.isnan(prev_high) and price > prev_high:
                df.iloc[idx, df.columns.get_loc("bos_bullish")] = 1
                if trend == "bearish":
                    df.iloc[idx, df.columns.get_loc("choch_bullish")] = 1
                trend = "bullish"
            prev_high = price
        else:
            if not np.isnan(prev_low) and price < prev_low:
                df.iloc[idx, df.columns.get_loc("bos_bearish")] = 1
                if trend == "bullish":
                    df.iloc[idx, df.columns.get_loc("choch_bearish")] = 1
                trend = "bearish"
            prev_low = price

    return df
