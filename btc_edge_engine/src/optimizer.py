from __future__ import annotations

import itertools
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .label_engine import build_tp_first_labels
from .simulator import summarize_side
from .utils import ENGINE_ROOT, load_config, write_json


def frontier_for_probs(
    ohlc: pd.DataFrame,
    probs: np.ndarray,
    side: str,
    idx: np.ndarray,
    leverage: float,
    target_roi: float,
    sl: float,
    hold: int,
    thresholds: list[float],
    slippage_bps: float,
) -> list[dict]:
    sub = ohlc.iloc[idx].reset_index(drop=True)
    lab = build_tp_first_labels(sub, leverage, target_roi, sl, hold, slippage_bps)
    p = probs
    rows = []
    for thr in thresholds:
        m = p >= thr
        if m.sum() < 5:
            rows.append({"threshold": thr, "n": int(m.sum()), "side": side})
            continue
        s = summarize_side(lab.loc[m], side)
        s["threshold"] = thr
        rows.append(s)
    return rows


def optimize_tp_sl_grid(
    ohlc: pd.DataFrame,
    feat: pd.DataFrame,
    val_idx: np.ndarray,
    model_bundle_long=None,
    model_bundle_short=None,
) -> dict:
    cfg = load_config()
    fees = cfg["fees"]
    slip = float(fees.get("default_slippage_bps", 2))
    thresholds = list(cfg["probability_thresholds"])
    holds = list(cfg["holding_bars"])
    # reduced grid for runtime: focus primary leverage + neighbors, key ROIs, subset SL
    leverages = [20, 50, 75]
    rois = [0.03, 0.05, 0.07]
    sls = [0.0010, 0.0015, 0.0020, 0.0025, 0.0030]
    holds = [4, 8, 12]

    cols = None
    results = []
    # If models exist, use probability filter; else evaluate all bars (baseline density)
    for lev, roi, sl, hold in itertools.product(leverages, rois, sls, holds):
        for side, bundle in (("LONG", model_bundle_long), ("SHORT", model_bundle_short)):
            sub = ohlc.iloc[val_idx].reset_index(drop=True)
            lab = build_tp_first_labels(sub, lev, roi, sl, hold, slip)
            if bundle is not None:
                cols = bundle["cols"]
                X = feat.iloc[val_idx][cols]
                p = bundle["model"].predict_proba(X)[:, 1]
                for thr in [0.65, 0.70, 0.75, 0.80]:
                    m = p >= thr
                    if int(m.sum()) < cfg["min_samples_auto"] // 2:
                        continue
                    s = summarize_side(lab.loc[m], side)
                    if s.get("n", 0) < 20:
                        continue
                    s.update(
                        {
                            "leverage": lev,
                            "target_roi": roi,
                            "sl": sl,
                            "hold": hold,
                            "threshold": thr,
                            "mode": "model",
                        }
                    )
                    results.append(s)
            else:
                s = summarize_side(lab, side)
                s.update(
                    {
                        "leverage": lev,
                        "target_roi": roi,
                        "sl": sl,
                        "hold": hold,
                        "threshold": None,
                        "mode": "all_bars",
                    }
                )
                results.append(s)

    # select by NetEV with constraints on val
    viable = [
        r
        for r in results
        if r.get("n", 0) >= 30
        and r.get("net_ev", -999) > 0
        and r.get("max_dd", 1) <= cfg["max_dd_limit"]
        and r.get("profit_factor", 0) >= cfg["min_profit_factor"]
    ]
    viable.sort(key=lambda x: (x.get("net_ev", -999), x.get("tp_first_rate", 0)), reverse=True)
    best = viable[0] if viable else (max(results, key=lambda x: x.get("net_ev", -999)) if results else None)
    out = {"n_grid": len(results), "n_viable": len(viable), "best": best, "top10": viable[:10]}
    write_json(ENGINE_ROOT / "outputs" / "thresholds" / "optimize_tp_sl.json", out)
    return out
