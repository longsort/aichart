from __future__ import annotations

import numpy as np
import pandas as pd

from .label_engine import build_tp_first_labels
from .simulator import summarize_side
from .utils import load_config


def stress_configs(ohlc: pd.DataFrame, mask: np.ndarray, side: str, best: dict) -> list[dict]:
    cfg = load_config()
    fees = cfg["fees"]
    base_slip = float(fees.get("default_slippage_bps", 2))
    lev = float(best.get("leverage", cfg["primary_reference_leverage"]))
    roi = float(best.get("target_roi", 0.05))
    sl = float(best.get("sl", 0.0015))
    hold = int(best.get("hold", 8))
    sub = ohlc.iloc[mask].reset_index(drop=True) if mask.dtype != bool else ohlc.loc[mask].reset_index(drop=True)

    cases = [
        ("A_base", base_slip, 1.0),
        ("B_slip_+25%", base_slip * 1.25, 1.0),
        ("C_slip_+50%", base_slip * 1.5, 1.0),
        ("D_fee_+20%", base_slip, 1.2),
        ("E_both", base_slip * 1.5, 1.2),
    ]
    out = []
    for name, slip, fee_mult in cases:
        # approximate fee stress by increasing slippage bps equivalent
        fee_bps = (fees["taker_fee"] * fee_mult) * 10000 * 2
        slip_eff = slip + max(0, fee_bps - fees["taker_fee"] * 10000 * 2)
        lab = build_tp_first_labels(sub, lev, roi, sl, hold, slip_eff)
        s = summarize_side(lab, side)
        s["stress_case"] = name
        s["slippage_bps_eff"] = slip_eff
        out.append(s)
    return out


def parameter_neighborhood(ohlc: pd.DataFrame, idx: np.ndarray, side: str, best: dict) -> list[dict]:
    fee_slip = float(load_config()["fees"].get("default_slippage_bps", 2))
    lev = float(best["leverage"])
    roi = float(best["target_roi"])
    hold = int(best["hold"])
    sl0 = float(best["sl"])
    sub = ohlc.iloc[idx].reset_index(drop=True)
    rows = []
    for sl in [sl0 * 0.8, sl0, sl0 * 1.2]:
        lab = build_tp_first_labels(sub, lev, roi, sl, hold, fee_slip)
        s = summarize_side(lab, side)
        s["sl"] = sl
        rows.append(s)
    return rows
