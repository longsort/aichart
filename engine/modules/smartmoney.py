"""
SMART MONEY ENGINE
Order Blocks, FVG, Supply/Demand, Liquidity sweeps.
Displacement: body > ATR * 1.8
"""

import pandas as pd
import numpy as np


def run(df: pd.DataFrame, atr_period: int = 14, disp_mult: float = 1.8) -> pd.DataFrame:
    df = df.copy()
    o, h, l, c = df["open"], df["high"], df["low"], df["close"]
    atr = (h - l).rolling(atr_period).mean()
    body = (c - o).abs()
    displacement = body > (atr * disp_mult)

    # FVG
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

    # Order blocks (last opposite candle before displacement)
    df["ob_strength"] = 0.0
    obs = []
    for i in range(2, len(df) - 1):
        if displacement.iloc[i]:
            bearish_disp = c.iloc[i] < o.iloc[i]
            for j in range(i - 1, max(0, i - 15), -1):
                if bearish_disp and c.iloc[j] > o.iloc[j]:  # bullish OB
                    imp = body.iloc[i] / (atr.iloc[i] + 1e-12)
                    df.iloc[j, df.columns.get_loc("ob_strength")] = min(1.0, imp * 0.3)
                    obs.append({"idx": j, "high": h.iloc[j], "low": l.iloc[j], "bias": "bullish"})
                    break
                if not bearish_disp and c.iloc[j] < o.iloc[j]:
                    imp = body.iloc[i] / (atr.iloc[i] + 1e-12)
                    df.iloc[j, df.columns.get_loc("ob_strength")] = min(1.0, imp * 0.3)
                    obs.append({"idx": j, "high": h.iloc[j], "low": l.iloc[j], "bias": "bearish"})
                    break

    # Liquidity sweeps
    prev_high = h.shift(1)
    prev_low = l.shift(1)
    df["sweep_up"] = ((h > prev_high) & (c < prev_high)).astype(int)
    df["sweep_down"] = ((l < prev_low) & (c > prev_low)).astype(int)

    # Supply/Demand from swing
    sh_idx = np.where(df["swing_high"].values > 0)[0]
    sl_idx = np.where(df["swing_low"].values > 0)[0]
    atr_arr = atr.values
    df["supply_top"] = np.nan
    df["supply_bottom"] = np.nan
    df["demand_top"] = np.nan
    df["demand_bottom"] = np.nan
    for i in sh_idx[-5:]:
        df.iloc[i, df.columns.get_loc("supply_top")] = h.iloc[i]
        df.iloc[i, df.columns.get_loc("supply_bottom")] = h.iloc[i] - atr_arr[i] * 0.25
    for i in sl_idx[-5:]:
        df.iloc[i, df.columns.get_loc("demand_bottom")] = l.iloc[i]
        df.iloc[i, df.columns.get_loc("demand_top")] = l.iloc[i] + atr_arr[i] * 0.25

    return df
