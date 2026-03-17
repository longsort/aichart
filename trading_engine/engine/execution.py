"""
TRADE EXECUTION ENGINE
----------------------
Long/Short setups with entry, stop, tp1/tp2/tp3.
Risk:reward minimum 1:2.
"""

import pandas as pd
import numpy as np
from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class TradeSetup:
    direction: str
    entry: float
    stop: float
    tp1: float
    tp2: float
    tp3: float
    probability: float
    engine_score: float
    liquidity_target: float
    conditions_met: list


def run_execution_engine(
    df: pd.DataFrame,
    i: int,
    probability: float,
    min_rr: float = 2.0,
) -> Optional[TradeSetup]:
    """
    Generate trade setup if conditions met.
    Long: HTF bullish + liquidity sweep down + bullish CHOCH + OB retest + FVG + prob>0.6
    Short: HTF bearish + liquidity sweep up + bearish CHOCH + OB retest + FVG + prob>0.6
    """
    if i < 50 or i >= len(df) - 1:
        return None
    if probability < 0.6:
        return None

    row = df.iloc[i]
    c = row["close"]
    atr = row.get("atr", c * 0.02)
    trend = row.get("trend_direction", "range")
    choch_bull = row.get("choch_bullish", 0) or 0
    choch_bear = row.get("choch_bearish", 0) or 0
    sweep_down = row.get("stop_sweep_down", 0) or 0
    sweep_up = row.get("stop_sweep_up", 0) or 0

    conditions = []
    if trend == "bullish":
        conditions.append("HTF_bullish")
    if sweep_down:
        conditions.append("liquidity_sweep_down")
    if choch_bull:
        conditions.append("bullish_CHOCH")

    if trend == "bearish":
        conditions.append("HTF_bearish")
    if sweep_up:
        conditions.append("liquidity_sweep_up")
    if choch_bear:
        conditions.append("bearish_CHOCH")

    ob_strength = row.get("order_block_strength", 0) or 0
    fvg = row.get("fvg_size", 0) or 0
    if ob_strength > 0.3:
        conditions.append("OB_retest")
    if fvg > 0.2:
        conditions.append("FVG")

    engine_score = len(conditions) / 5.0

    # Long setup
    if trend == "bullish" and probability >= 0.6 and len(conditions) >= 2:
        entry = c
        stop = c - atr * 1.5
        rr = min_rr
        tp1 = entry + (entry - stop) * rr * 0.5
        tp2 = entry + (entry - stop) * rr
        tp3 = entry + (entry - stop) * rr * 1.5
        target = row.get("next_liquidity_target", entry * 1.02)
        return TradeSetup(
            direction="long",
            entry=entry,
            stop=stop,
            tp1=tp1,
            tp2=tp2,
            tp3=tp3,
            probability=float(probability),
            engine_score=engine_score,
            liquidity_target=float(target),
            conditions_met=conditions,
        )

    # Short setup
    if trend == "bearish" and probability >= 0.6 and len(conditions) >= 2:
        entry = c
        stop = c + atr * 1.5
        rr = min_rr
        tp1 = entry - (stop - entry) * rr * 0.5
        tp2 = entry - (stop - entry) * rr
        tp3 = entry - (stop - entry) * rr * 1.5
        target = row.get("next_liquidity_target", entry * 0.98)
        return TradeSetup(
            direction="short",
            entry=entry,
            stop=stop,
            tp1=tp1,
            tp2=tp2,
            tp3=tp3,
            probability=float(probability),
            engine_score=engine_score,
            liquidity_target=float(target),
            conditions_met=conditions,
        )
    return None
