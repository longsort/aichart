"""Trade simulator metrics over labeled tp-first series."""
from __future__ import annotations

import numpy as np
import pandas as pd


def summarize_side(df: pd.DataFrame, side: str) -> dict:
    code = df[f"tpfirst_{side}"].to_numpy()
    net = df[f"net_roi_{side}"].to_numpy(dtype=float)
    # exclude ambiguous from win/loss; still count rate
    amb = code == -1
    usable = ~amb & np.isfinite(net)
    n_all = int(len(code))
    n_amb = int(amb.sum())
    n = int(usable.sum())
    if n == 0:
        return {
            "side": side,
            "n": 0,
            "ambiguous_rate": n_amb / max(1, n_all),
        }
    wins = (usable) & (code == 1)
    losses = (usable) & ((code == 0) | ((code == 2) & (net <= 0)))
    # timeout positive counts as win for net but not TP-first
    tp_first = (usable) & (code == 1)
    nets = net[usable]
    eq = 1.0
    peak = 1.0
    mdd = 0.0
    streak = 0
    max_streak = 0
    for r, cd in zip(net[usable], code[usable]):
        eq *= 1.0 + float(r)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak if peak > 0 else 0)
        if r <= 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0
    gross_win = nets[nets > 0].sum()
    gross_loss = -nets[nets <= 0].sum()
    pf = float(gross_win / gross_loss) if gross_loss > 1e-12 else float("inf")
    return {
        "side": side,
        "n": n,
        "n_all": n_all,
        "ambiguous_rate": n_amb / max(1, n_all),
        "tp_first_rate": float(tp_first.sum() / n),
        "win_rate": float((nets > 0).sum() / n),
        "net_ev": float(np.nanmean(nets)),
        "sum_net": float(np.nansum(nets)),
        "profit_factor": pf,
        "max_dd": float(mdd),
        "longest_loss_streak": int(max_streak),
        "median_net": float(np.nanmedian(nets)),
    }
