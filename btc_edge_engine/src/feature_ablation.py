from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

from .ml_models import META_COLS, build_model, feature_columns, make_xy


SETS = {
    "A_ohlc": ["return_1", "return_3", "return_5", "body_ratio", "close_location", "range_pct", "upper_wick_ratio", "lower_wick_ratio"],
    "B_volume": ["volume_ratio_20", "volume_z_20", "volume_percentile_100", "rvol_20", "adv_buy_pct"],
    "C_atr": ["atr14_pct", "atr_percentile_100", "realized_vol_10", "vol_regime"],
    "D_rsi": ["rsi14", "rsi14_change_3", "rsi14_slope_5", "rsi14_percentile_100"],
    "E_trend": ["price_to_ema20", "ema20_slope", "ema_alignment_state", "distance_to_vwap_20"],
    "F_structure": ["bos_up", "bos_down", "choch_up", "choch_down", "dist_to_swing_high_atr", "dist_to_swing_low_atr"],
    "G_liquidity": ["sweep_long", "sweep_short", "sweep_depth_atr_long", "volume_z_on_sweep", "reclaim_distance_atr_long"],
}


def ablation_run(feat: pd.DataFrame, labels: pd.DataFrame, splits: dict, target: str) -> list[dict]:
    order = ["A_ohlc", "B_volume", "C_atr", "D_rsi", "E_trend", "F_structure", "G_liquidity", "H_full"]
    used: list[str] = []
    rows = []
    all_cols = feature_columns(feat)
    for name in order:
        if name == "H_full":
            cols = all_cols
        else:
            add = [c for c in SETS[name] if c in feat.columns]
            used = list(dict.fromkeys(used + add))
            cols = used
        try:
            Xtr, ytr = make_xy(feat, labels, target, splits["train_idx"], cols)
            Xte, yte = make_xy(feat, labels, target, splits["test_idx"], cols)
            if len(ytr) < 50 or ytr.nunique() < 2 or yte.nunique() < 2:
                rows.append({"set": name, "n_features": len(cols), "ok": False})
                continue
            model = build_model("gbm")
            model.fit(Xtr, ytr)
            p = model.predict_proba(Xte)[:, 1]
            rows.append(
                {
                    "set": name,
                    "n_features": len(cols),
                    "auc_oos": float(roc_auc_score(yte, p)),
                    "pos_rate_oos": float(yte.mean()),
                    "ok": True,
                }
            )
        except Exception as e:
            rows.append({"set": name, "n_features": len(cols), "ok": False, "error": str(e)})
    return rows
