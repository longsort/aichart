"""
SMART MONEY ENGINE
------------------
Order Blocks, Fair Value Gaps, Supply/Demand zones.
OB quality: impulse_strength*0.35 + volume_spike*0.2 + displacement*0.25
            - mitigation_count*0.1 - age_decay*0.1
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any


def run_smartmoney_engine(
    df: pd.DataFrame,
    atr_period: int = 14,
    displacement_mult: float = 1.8,
    fvg_min_ratio: float = 0.3,
) -> pd.DataFrame:
    """
    Detect Order Blocks, FVG, Supply/Demand.
    Displacement: body_size > ATR * displacement_mult
    """
    df = df.copy()
    o, h, l, c, v = df["open"], df["high"], df["low"], df["close"], df["volume"]

    atr = (h - l).rolling(atr_period).mean()
    body = (c - o).abs()
    displacement = body > (atr * displacement_mult)
    vol_mean = v.rolling(20).mean()
    volume_spike = (v > vol_mean * 2).astype(int)

    # FVG: bullish c1.high < c3.low, bearish c1.low > c3.high
    fvg_bull = np.zeros(len(df))
    fvg_bear = np.zeros(len(df))
    for i in range(2, len(df)):
        if h.iloc[i - 2] < l.iloc[i]:
            fvg_bull[i] = l.iloc[i] - h.iloc[i - 2]
        if l.iloc[i - 2] > h.iloc[i]:
            fvg_bear[i] = l.iloc[i - 2] - h.iloc[i]
    df["fvg_bull"] = fvg_bull
    df["fvg_bear"] = fvg_bear
    df["fvg_size"] = np.maximum(fvg_bull, fvg_bear) / (atr + 1e-12)

    # Order Blocks: last opposite candle before displacement
    obs: List[Dict[str, Any]] = []
    for i in range(2, len(df) - 1):
        if displacement.iloc[i] and c.iloc[i] > o.iloc[i]:  # bullish displacement
            for j in range(i - 1, max(0, i - 10), -1):
                if c.iloc[j] < o.iloc[j]:  # bearish candle
                    obs.append({
                        "idx": j,
                        "bias": "bullish",
                        "high": h.iloc[j],
                        "low": l.iloc[j],
                        "impulse": body.iloc[i] / (atr.iloc[i] + 1e-12),
                        "vol_spike": volume_spike.iloc[j],
                        "displacement": 1,
                        "age": i - j,
                    })
                    break
        elif displacement.iloc[i] and c.iloc[i] < o.iloc[i]:
            for j in range(i - 1, max(0, i - 10), -1):
                if c.iloc[j] > o.iloc[j]:
                    obs.append({
                        "idx": j,
                        "bias": "bearish",
                        "high": h.iloc[j],
                        "low": l.iloc[j],
                        "impulse": body.iloc[i] / (atr.iloc[i] + 1e-12),
                        "vol_spike": volume_spike.iloc[j],
                        "displacement": 1,
                        "age": i - j,
                    })
                    break

    df["ob_bull_high"] = np.nan
    df["ob_bull_low"] = np.nan
    df["ob_bear_high"] = np.nan
    df["ob_bear_low"] = np.nan
    df["ob_score"] = 0.0

    for ob in obs[-20:]:
        i = ob["idx"]
        mitigation = 0.1 * min(ob.get("mitigation_count", 0), 5)
        age_decay = 0.1 * min(ob["age"] / 10, 1)
        score = (
            ob["impulse"] * 0.35
            + ob["vol_spike"] * 0.2
            + ob["displacement"] * 0.25
            - mitigation
            - age_decay
        )
        score = max(0, min(1, score))
        df.loc[df.index[i], "ob_score"] = score
        if ob["bias"] == "bullish":
            df.loc[df.index[i], "ob_bull_high"] = ob["high"]
            df.loc[df.index[i], "ob_bull_low"] = ob["low"]
        else:
            df.loc[df.index[i], "ob_bear_high"] = ob["high"]
            df.loc[df.index[i], "ob_bear_low"] = ob["low"]

    # Supply/Demand from swing fractals
    sh_idx = np.where(df["swing_high"].values > 0)[0]
    sl_idx = np.where(df["swing_low"].values > 0)[0]
    atr_arr = atr.values
    for i in sh_idx[-10:]:
        top = h.iloc[i]
        bot = top - atr_arr[i] * 0.25
        df.loc[df.index[i], "supply_top"] = top
        df.loc[df.index[i], "supply_bottom"] = bot
    for i in sl_idx[-10:]:
        bot = l.iloc[i]
        top = bot + atr_arr[i] * 0.25
        df.loc[df.index[i], "demand_top"] = top
        df.loc[df.index[i], "demand_bottom"] = bot

    return df
