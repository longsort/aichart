"""No-lookahead smoke: mutating future rows must not change past features."""
from __future__ import annotations

import numpy as np
import pandas as pd

from src.feature_engine import build_features


def test_no_lookahead_features():
    n = 200
    rng = np.random.default_rng(0)
    ts0 = 1_700_000_000_000
    df = pd.DataFrame(
        {
            "timestamp": np.arange(n) * 900_000 + ts0,
            "open": 100 + rng.normal(0, 1, n).cumsum() / 10,
            "volume": rng.uniform(1, 5, n),
        }
    )
    df["close"] = df["open"] + rng.normal(0, 0.1, n)
    df["high"] = np.maximum(df["open"], df["close"]) + 0.05
    df["low"] = np.minimum(df["open"], df["close"]) - 0.05
    f1 = build_features(df)
    df2 = df.copy()
    df2.loc[n - 1, "close"] = df2.loc[n - 1, "close"] * 1.5
    df2.loc[n - 1, "high"] = df2.loc[n - 1, "close"] + 0.05
    f2 = build_features(df2)
    # compare early rows (exclude last 30 — swing confirm needs k right bars)
    cols = [c for c in f1.columns if c != "timestamp" and f1[c].dtype.kind in "fc"]
    a = f1.iloc[:120][cols].to_numpy(dtype=float)
    b = f2.iloc[:120][cols].to_numpy(dtype=float)
    # nan-safe compare
    both_nan = np.isnan(a) & np.isnan(b)
    ok = both_nan | (np.abs(np.nan_to_num(a) - np.nan_to_num(b)) < 1e-8)
    assert ok.all(), f"mismatched {(~ok).sum()} cells"
