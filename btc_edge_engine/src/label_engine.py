"""Future path MFE/MAE + clean/TP-first labels. Labels use future only as targets."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .cost_engine import required_price_move, roundtrip_cost_fraction
from .utils import load_config


def compute_path_stats(df: pd.DataFrame, horizons: list[int]) -> pd.DataFrame:
    """Vectorized MFE/MAE for each horizon (entry = close[i], future = i+1..i+H)."""
    h = df["high"].to_numpy(float)
    l = df["low"].to_numpy(float)
    c = df["close"].to_numpy(float)
    n = len(df)
    out = {"timestamp": df["timestamp"].to_numpy()}
    # prefix max/min for O(n) range queries via reverse cum
    # For each H, rolling max of future highs: use shift(-1) then rolling max — but rolling max is past-looking.
    # Instead: reverse → rolling max → reverse → aligns to window ending at i, then shift.
    for H in horizons:
        # future window max high over next H bars
        fut_max_h = pd.Series(h[::-1]).rolling(H, min_periods=1).max().to_numpy()[::-1]
        fut_min_l = pd.Series(l[::-1]).rolling(H, min_periods=1).min().to_numpy()[::-1]
        # align so index i uses bars i+1..i+H → shift -1 on the reverse-rolling result
        # reverse rolling at position i includes h[i], h[i+1], ...; we need exclude h[i]
        max_h = np.roll(fut_max_h, -1)
        min_l = np.roll(fut_min_l, -1)
        max_h[-1] = np.nan
        min_l[-1] = np.nan
        # for last H bars incomplete windows already via min_periods; still ok
        entry = c
        mfe_l = (max_h - entry) / entry
        mae_l = (entry - min_l) / entry
        mfe_s = (entry - min_l) / entry
        mae_s = (max_h - entry) / entry
        # invalidate where not enough future
        valid = np.arange(n) < (n - 1)
        mfe_l = np.where(valid, mfe_l, np.nan)
        mae_l = np.where(valid, mae_l, np.nan)
        mfe_s = np.where(valid, mfe_s, np.nan)
        mae_s = np.where(valid, mae_s, np.nan)
        out[f"mfe_long_{H}"] = mfe_l
        out[f"mae_long_{H}"] = mae_l
        out[f"mfe_short_{H}"] = mfe_s
        out[f"mae_short_{H}"] = mae_s

    # time-to-threshold: coarse via first horizon that clears (optional light)
    for thr, key in [(0.0010, "0010"), (0.0015, "0015"), (0.0020, "0020")]:
        t_l = np.full(n, np.nan)
        t_s = np.full(n, np.nan)
        for H in sorted(horizons):
            mfe_l = out[f"mfe_long_{H}"]
            mfe_s = out[f"mfe_short_{H}"]
            fill_l = np.isnan(t_l) & (mfe_l >= thr)
            fill_s = np.isnan(t_s) & (mfe_s >= thr)
            t_l[fill_l] = H
            t_s[fill_s] = H
        out[f"time_to_mfe_long_{key}"] = t_l
        out[f"time_to_mfe_short_{key}"] = t_s

    return pd.DataFrame(out)


def add_clean_and_fast_labels(path: pd.DataFrame) -> pd.DataFrame:
    cfg = load_config()
    out = path.copy()
    cleans = cfg["search"]["clean_labels"]
    for name, spec in cleans.items():
        bars = int(spec["bars"])
        mae_max = float(spec["mae_max"])
        mfe_min = float(spec["mfe_min"])
        out[f"{name}_LONG"] = (
            (out[f"mae_long_{bars}"] <= mae_max) & (out[f"mfe_long_{bars}"] >= mfe_min)
        ).astype("Int64")
        out[f"{name}_SHORT"] = (
            (out[f"mae_short_{bars}"] <= mae_max) & (out[f"mfe_short_{bars}"] >= mfe_min)
        ).astype("Int64")

    for item in cfg["search"]["fast_mfe"]:
        name = item["name"]
        bars = int(item["bars"])
        mfe = float(item["mfe"])
        mae_cap = mfe * 0.6
        out[f"{name}_LONG"] = (
            (out[f"mfe_long_{bars}"] >= mfe) & (out[f"mae_long_{bars}"] <= mae_cap)
        ).astype("Int64")
        out[f"{name}_SHORT"] = (
            (out[f"mfe_short_{bars}"] >= mfe) & (out[f"mae_short_{bars}"] <= mae_cap)
        ).astype("Int64")
    return out


def simulate_tp_sl_path(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    i: int,
    side: str,
    tp_pct: float,
    sl_pct: float,
    hold: int,
) -> tuple[int, float]:
    n = len(close)
    entry = close[i]
    if side == "LONG":
        tp = entry * (1 + tp_pct)
        sl = entry * (1 - sl_pct)
    else:
        tp = entry * (1 - tp_pct)
        sl = entry * (1 + sl_pct)

    last_ret = 0.0
    for j in range(i + 1, min(n, i + 1 + hold)):
        hi, lo, cl = high[j], low[j], close[j]
        hit_tp = hi >= tp if side == "LONG" else lo <= tp
        hit_sl = lo <= sl if side == "LONG" else hi >= sl
        if hit_tp and hit_sl:
            return -1, 0.0
        if hit_tp:
            return 1, tp_pct
        if hit_sl:
            return 0, -sl_pct
        last_ret = (cl - entry) / entry if side == "LONG" else (entry - cl) / entry
    return 2, last_ret


def build_tp_first_labels(
    df: pd.DataFrame,
    leverage: float,
    target_roi: float,
    sl_pct: float,
    hold: int,
    slippage_bps: float,
) -> pd.DataFrame:
    cfg = load_config()
    fees = cfg["fees"]
    entry_fee = fees["taker_fee"] if fees.get("entry_fee_side", "taker") == "taker" else fees["maker_fee"]
    exit_fee = fees["taker_fee"] if fees.get("exit_fee_side", "taker") == "taker" else fees["maker_fee"]
    cost = roundtrip_cost_fraction(entry_fee, exit_fee, slippage_bps)
    tp_pct = required_price_move(target_roi, leverage, cost)

    high = df["high"].to_numpy(float)
    low = df["low"].to_numpy(float)
    close = df["close"].to_numpy(float)
    n = len(df)
    rows = {
        "timestamp": df["timestamp"].to_numpy(),
        "tp_pct": np.full(n, tp_pct),
        "sl_pct": np.full(n, sl_pct),
        "hold": np.full(n, hold),
        "leverage": np.full(n, leverage),
        "target_roi": np.full(n, target_roi),
    }
    for side in ("LONG", "SHORT"):
        code = np.full(n, 2, dtype=int)
        gross = np.full(n, np.nan)
        net_roi = np.full(n, np.nan)
        for i in range(n - 1):
            cd, ret = simulate_tp_sl_path(high, low, close, i, side, tp_pct, sl_pct, hold)
            code[i] = cd
            gross[i] = ret
            if cd == -1:
                net_roi[i] = np.nan
            else:
                net_roi[i] = ret * leverage - cost * leverage
        rows[f"tpfirst_{side}"] = code
        rows[f"gross_ret_{side}"] = gross
        rows[f"net_roi_{side}"] = net_roi
    return pd.DataFrame(rows)
