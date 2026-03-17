"""
TRADE SIGNAL ENGINE
Long: HTF bullish + sweep down + CHOCH bullish + OB retest + volume spike + prob>60
Short: HTF bearish + sweep up + CHOCH bearish + OB retest + volume spike + prob>60
Output: entry, stop, tp1, tp2, tp3, min RR 1:2
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Optional


@dataclass
class Signal:
    direction: str
    entry: float
    stop: float
    tp1: float
    tp2: float
    tp3: float
    probability: float
    liquidity_target: float
    scenario: str
    trend: str


def run(df: pd.DataFrame, i: int, min_rr: float = 2.0) -> Optional[Signal]:
    if i < 100 or i >= len(df):
        return None

    row = df.iloc[i]
    prob = row.get("probability", 0)
    if prob < 60:
        return None

    trend = str(row.get("trend_direction", "range"))
    choch_bull = row.get("choch_bullish", 0) or 0
    choch_bear = row.get("choch_bearish", 0) or 0
    sweep_down = row.get("sweep_down", 0) or 0
    sweep_up = row.get("sweep_up", 0) or 0
    ob = row.get("ob_strength", 0) or 0
    vol_spike = row.get("volume_spike", 0) or 0

    c = row["close"]
    atr = row.get("atr", c * 0.02)
    target = row.get("nearest_liquidity_target", c)
    scenario = str(row.get("scenario", ""))

    # Long
    if trend == "bullish" and (choch_bull or sweep_down) and (ob > 0.2 or vol_spike > 0.5):
        entry = c
        stop = c - atr * 1.5
        risk = entry - stop
        tp1 = entry + risk * (min_rr * 0.5)
        tp2 = entry + risk * min_rr
        tp3 = entry + risk * (min_rr * 1.5)
        return Signal("long", entry, stop, tp1, tp2, tp3, float(prob), float(target), scenario, trend)

    # Short
    if trend == "bearish" and (choch_bear or sweep_up) and (ob > 0.2 or vol_spike > 0.5):
        entry = c
        stop = c + atr * 1.5
        risk = stop - entry
        tp1 = entry - risk * (min_rr * 0.5)
        tp2 = entry - risk * min_rr
        tp3 = entry - risk * (min_rr * 1.5)
        return Signal("short", entry, stop, tp1, tp2, tp3, float(prob), float(target), scenario, trend)

    return None
