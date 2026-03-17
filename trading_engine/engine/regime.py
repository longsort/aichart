"""
MARKET REGIME ENGINE
--------------------
Detects trend direction and volatility state using ATR, EMA, ADX.
"""

import pandas as pd
import numpy as np


def compute_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average True Range."""
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def compute_adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average Directional Index."""
    prev_high = high.shift(1)
    prev_low = low.shift(1)
    prev_close = close.shift(1)

    plus_dm = high - prev_high
    minus_dm = prev_low - low
    plus_dm = np.where((plus_dm > minus_dm) & (plus_dm > 0), plus_dm, 0)
    minus_dm = np.where((minus_dm > plus_dm) & (minus_dm > 0), minus_dm, 0)

    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)

    atr = tr.rolling(period).mean()
    plus_di = 100 * pd.Series(plus_dm, index=high.index).rolling(period).mean() / atr
    minus_di = 100 * pd.Series(minus_dm, index=high.index).rolling(period).mean() / atr

    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-10)
    adx = dx.rolling(period).mean()
    return adx


def run_regime_engine(df: pd.DataFrame, atr_period: int = 14) -> pd.DataFrame:
    """
    Compute market regime: trend_direction, volatility_state.

    Returns:
        DataFrame with added columns: atr, ema20, ema50, adx, trend_strength,
        trend_direction, volatility_state
    """
    df = df.copy()
    h, l, c = df["high"], df["low"], df["close"]

    df["atr"] = compute_atr(h, l, c, atr_period)
    df["ema20"] = c.ewm(span=20, adjust=False).mean()
    df["ema50"] = c.ewm(span=50, adjust=False).mean()
    df["adx"] = compute_adx(h, l, c, atr_period)

    ema20_slope = df["ema20"].diff(5) / 5
    ema50_slope = df["ema50"].diff(5) / 5
    df["trend_strength"] = ema20_slope.fillna(0) + ema50_slope.fillna(0) + df["adx"].fillna(0)

    atr_roll = df["atr"].rolling(50, min_periods=1).mean()
    vol_state = np.where(df["atr"] > atr_roll * 1.5, "expansion",
                         np.where(df["atr"] < atr_roll * 0.7, "compression", "normal"))
    df["volatility_state"] = vol_state

    df["trend_direction"] = np.where(df["ema20"] > df["ema50"], "bullish", "bearish")
    return df
