from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .cost_engine import required_price_move, roundtrip_cost_fraction
from .feature_engine import build_features
from .utils import ENGINE_ROOT, load_config, write_json


def load_bundles():
    out = {}
    for side in ("long", "short"):
        p = ENGINE_ROOT / "outputs" / "models" / f"{side}_model.joblib"
        if p.exists():
            out[side.upper()] = joblib.load(p)
    return out


def signal_from_frame(ohlc: pd.DataFrame, best_config: dict | None = None) -> dict:
    cfg = load_config()
    fees = cfg["fees"]
    feat = build_features(ohlc, swing_k=int(cfg.get("swing_k", 3)), eq_atr_tol=float(cfg.get("eq_atr_tol", 0.15)))
    bundles = load_bundles()
    if not bundles:
        return {"status": "WAIT", "reason": "models_missing"}
    row = feat.iloc[[-1]]
    probs = {}
    for side, b in bundles.items():
        cols = b["cols"]
        probs[side] = float(b["model"].predict_proba(row[cols])[:, 1][0])
    p_long = probs.get("LONG", 0.0)
    p_short = probs.get("SHORT", 0.0)
    gap = abs(p_long - p_short)
    thr = float((best_config or {}).get("threshold", 0.70) or 0.70)
    lev = float((best_config or {}).get("leverage", cfg["primary_reference_leverage"]))
    roi = float((best_config or {}).get("target_roi", 0.05))
    sl = float((best_config or {}).get("sl", 0.0015))
    cost = roundtrip_cost_fraction(fees["taker_fee"], fees["taker_fee"], fees.get("default_slippage_bps", 2))
    tp = required_price_move(roi, lev, cost)
    status = "WAIT"
    selected = None
    if gap < cfg.get("min_direction_gap", 0.08):
        status = "WAIT"
    elif p_long >= thr and p_long > p_short:
        status = "LONG_SIGNAL"
        selected = "LONG"
    elif p_short >= thr and p_short > p_long:
        status = "SHORT_SIGNAL"
        selected = "SHORT"
    out = {
        "timestamp": int(ohlc["timestamp"].iloc[-1]),
        "long_probability": p_long,
        "short_probability": p_short,
        "direction_gap": gap,
        "selected_side": selected,
        "selected_sl": sl,
        "selected_tp": tp,
        "leverage": lev,
        "target_roi": roi,
        "regime": int(row["market_regime"].iloc[0]) if "market_regime" in row else None,
        "session": int(row["session"].iloc[0]) if "session" in row else None,
        "status": status,
        "noteKo": "SIGNAL ONLY · Paper/Live enable flag 별도 · 확정수익 아님",
    }
    write_json(ENGINE_ROOT / "outputs" / "reports" / "latest_live_signal.json", out)
    return out
