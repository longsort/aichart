from __future__ import annotations

import numpy as np
import pandas as pd


def time_ordered_splits(timestamps_ms: np.ndarray, train_m: int, val_m: int, test_m: int):
    """Split by calendar months from start (approx equal month buckets by unique months)."""
    months = pd.to_datetime(timestamps_ms, unit="ms", utc=True).to_period("M")
    uniq = months.unique().sort_values()
    need = train_m + val_m + test_m
    if len(uniq) < need:
        # fallback fractional
        n = len(timestamps_ms)
        a = int(n * train_m / need)
        b = int(n * (train_m + val_m) / need)
        idx = np.arange(n)
        return {
            "train_idx": idx[:a],
            "val_idx": idx[a:b],
            "test_idx": idx[b:],
            "months": [str(x) for x in uniq],
        }
    train_months = uniq[:train_m]
    val_months = uniq[train_m : train_m + val_m]
    test_months = uniq[train_m + val_m : train_m + val_m + test_m]
    m = months
    train_idx = np.where(m.isin(train_months))[0]
    val_idx = np.where(m.isin(val_months))[0]
    test_idx = np.where(m.isin(test_months))[0]
    return {
        "train_idx": train_idx,
        "val_idx": val_idx,
        "test_idx": test_idx,
        "train_months": [str(x) for x in train_months],
        "val_months": [str(x) for x in val_months],
        "test_months": [str(x) for x in test_months],
    }


def walk_forward_folds(timestamps_ms: np.ndarray, train_m: int, val_m: int, test_m: int):
    months = pd.to_datetime(timestamps_ms, unit="ms", utc=True).to_period("M")
    uniq = list(months.unique().sort_values())
    folds = []
    i = 0
    while i + train_m + val_m + test_m <= len(uniq):
        tr = uniq[i : i + train_m]
        va = uniq[i + train_m : i + train_m + val_m]
        te = uniq[i + train_m + val_m : i + train_m + val_m + test_m]
        folds.append(
            {
                "train_idx": np.where(months.isin(tr))[0],
                "val_idx": np.where(months.isin(va))[0],
                "test_idx": np.where(months.isin(te))[0],
                "train_months": [str(x) for x in tr],
                "val_months": [str(x) for x in va],
                "test_months": [str(x) for x in te],
            }
        )
        i += test_m  # roll by test length
    return folds
