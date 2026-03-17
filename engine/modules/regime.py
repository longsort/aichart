"""
MARKET REGIME ENGINE
ATR(14), EMA20, EMA50, ADX.
trend_strength = EMA20 slope + EMA50 slope + ADX
volatility_state: expansion / compression / normal
"""

import pandas as pd
import numpy as np


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    h, l, c = df["high"], df["low"], df["close"]
    tr = pd.concat([h - l, (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
    h, l, c = df["high"], df["low"], df["close"]
    ph, pl = h.shift(1), l.shift(1)
    pc = c.shift(1)
    plus_dm = np.where((h - ph) > (pl - l), np.maximum(h - ph, 0), 0)
    minus_dm = np.where((pl - l) > (h - ph), np.maximum(pl - l, 0), 0)
    tr = pd.concat([h - l, (h - pc).abs(), (l - pc).abs()], axis=1).max(axis=1)
    atr_s = tr.rolling(period).mean()
    plus_di = 100 * pd.Series(plus_dm, index=df.index).rolling(period).mean() / (atr_s + 1e-12)
    minus_di = 100 * pd.Series(minus_dm, index=df.index).rolling(period).mean() / (atr_s + 1e-12)
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-12)
    return dx.rolling(period).mean()


def run(df: pd.DataFrame, atr_period: int = 14) -> pd.DataFrame:
    df = df.copy()
    c = df["close"]
    df["atr"] = atr(df, atr_period)
    df["ema20"] = c.ewm(span=20, adjust=False).mean()
    df["ema50"] = c.ewm(span=50, adjust=False).mean()
    df["adx"] = adx(df, atr_period)
    df["ema20_slope"] = df["ema20"].diff(5) / 5
    df["ema50_slope"] = df["ema50"].diff(5) / 5
    df["trend_strength"] = df["ema20_slope"].fillna(0) + df["ema50_slope"].fillna(0) + df["adx"].fillna(0)
    atr_roll = df["atr"].rolling(50, min_periods=1).mean()
    df["volatility_state"] = np.where(
        df["atr"] > atr_roll * 1.5, "expansion",
        np.where(df["atr"] < atr_roll * 0.7, "compression", "normal")
    )
    df["trend_direction"] = np.where(df["ema20"] > df["ema50"], "bullish", "bearish")
    return df
