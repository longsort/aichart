from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler

from .utils import load_config


def cluster_patterns(feat: pd.DataFrame, labels: pd.DataFrame, target: str, idx: np.ndarray, k: int = 5) -> dict:
    cfg = load_config()
    cols = [c for c in feat.columns if feat[c].dtype.kind in "fc" and c not in ("timestamp",)]
    # limit cols for speed
    prefer = [
        c
        for c in cols
        if any(
            x in c
            for x in [
                "rsi",
                "volume_z",
                "atr14_pct",
                "sweep",
                "breakout",
                "compression",
                "close_location",
                "body_ratio",
                "range_position",
                "ema_alignment",
                "absorption",
                "session",
                "market_regime",
                "rvol",
                "adv_buy",
            ]
        )
    ]
    use = prefer[:40] if prefer else cols[:40]
    y = labels.iloc[idx][target]
    m = y.notna() & (y == 1)
    X = feat.iloc[idx].loc[m, use]
    if len(X) < max(30, k * 5):
        return {"ok": False, "reason": "insufficient_clean_wins", "n": int(len(X))}
    imp = SimpleImputer(strategy="median")
    Xs = StandardScaler().fit_transform(imp.fit_transform(X))
    km = KMeans(n_clusters=k, random_state=cfg["random_seed"], n_init=10)
    lab = km.fit_predict(Xs)
    clusters = []
    for ci in range(k):
        part = X.iloc[lab == ci]
        if len(part) == 0:
            continue
        means = part.mean(numeric_only=True).sort_values(key=lambda s: s.abs(), ascending=False).head(8)
        clusters.append(
            {
                "cluster": int(ci),
                "n": int(len(part)),
                "top_features": {k: float(v) for k, v in means.items()},
                "session_mode": int(part["session"].mode().iloc[0]) if "session" in part else None,
                "regime_mode": int(part["market_regime"].mode().iloc[0]) if "market_regime" in part else None,
            }
        )
    return {"ok": True, "target": target, "k": k, "n": int(len(X)), "clusters": clusters}
