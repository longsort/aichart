from __future__ import annotations

import numpy as np
import pandas as pd

from .label_engine import build_tp_first_labels
from .simulator import summarize_side
from .utils import load_config


def run_baselines(ohlc: pd.DataFrame, feat: pd.DataFrame, idx: np.ndarray) -> list[dict]:
    """Simple rule baselines on a slice idx (validation/test)."""
    cfg = load_config()
    fees = cfg["fees"]
    slip = float(fees.get("default_slippage_bps", 2))
    lev = float(cfg["primary_reference_leverage"])
    target = 0.05
    sl = 0.0015
    hold = 8
    sub = ohlc.iloc[idx].reset_index(drop=True)
    fsub = feat.iloc[idx].reset_index(drop=True)
    lab = build_tp_first_labels(sub, lev, target, sl, hold, slip)

    results = []
    # Always long / short / random
    for name, mask in [
        ("always_long", np.ones(len(sub), dtype=bool)),
        ("always_short", np.ones(len(sub), dtype=bool)),
        ("random_50", np.random.default_rng(cfg["random_seed"]).random(len(sub)) < 0.5),
    ]:
        side = "LONG" if "short" not in name else "SHORT"
        if name == "random_50":
            # mix: use long labels where mask else short — evaluate only masked entries for long
            dfl = lab.loc[mask].copy()
            s = summarize_side(dfl, "LONG")
            s["baseline"] = name
            results.append(s)
            continue
        s = summarize_side(lab, side)
        s["baseline"] = name
        results.append(s)

    # RSI rule: long RSI<30, short RSI>70 — then evaluate those entries only
    rsi = fsub["rsi14"].to_numpy()
    long_m = np.isfinite(rsi) & (rsi < 30)
    short_m = np.isfinite(rsi) & (rsi > 70)
    if long_m.sum() >= 5:
        s = summarize_side(lab.loc[long_m], "LONG")
        s["baseline"] = "rsi_oversold_long"
        results.append(s)
    if short_m.sum() >= 5:
        s = summarize_side(lab.loc[short_m], "SHORT")
        s["baseline"] = "rsi_overbought_short"
        results.append(s)

    # EMA rule
    long_m = (fsub["ema9"] > fsub["ema20"]) & (fsub["ema20_slope"] > 0)
    short_m = (fsub["ema9"] < fsub["ema20"]) & (fsub["ema20_slope"] < 0)
    if long_m.sum() >= 5:
        s = summarize_side(lab.loc[long_m.to_numpy()], "LONG")
        s["baseline"] = "ema_trend_long"
        results.append(s)
    if short_m.sum() >= 5:
        s = summarize_side(lab.loc[short_m.to_numpy()], "SHORT")
        s["baseline"] = "ema_trend_short"
        results.append(s)

    # Breakout
    long_m = fsub["breakout_up_20"] == 1
    short_m = fsub["breakout_down_20"] == 1
    if long_m.sum() >= 5:
        s = summarize_side(lab.loc[long_m.to_numpy()], "LONG")
        s["baseline"] = "breakout_up"
        results.append(s)
    if short_m.sum() >= 5:
        s = summarize_side(lab.loc[short_m.to_numpy()], "SHORT")
        s["baseline"] = "breakout_down"
        results.append(s)

    # Tapoint-ish: sweep reclaim
    long_m = fsub["sweep_long"] == 1
    short_m = fsub["sweep_short"] == 1
    if long_m.sum() >= 5:
        s = summarize_side(lab.loc[long_m.to_numpy()], "LONG")
        s["baseline"] = "tap_sweep_long"
        results.append(s)
    if short_m.sum() >= 5:
        s = summarize_side(lab.loc[short_m.to_numpy()], "SHORT")
        s["baseline"] = "tap_sweep_short"
        results.append(s)

    return results
