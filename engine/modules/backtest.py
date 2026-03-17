"""
BACKTEST ENGINE
Metrics: win_rate, profit_factor, max_drawdown, expectancy
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import List, Dict


@dataclass
class BacktestResult:
    win_rate: float
    profit_factor: float
    max_drawdown: float
    expectancy: float
    trades: List[Dict]


def run(df: pd.DataFrame, signals: List[Dict], fee: float = 0.001) -> BacktestResult:
    h = df["high"].values
    l = df["low"].values
    trades = []

    for s in signals:
        idx = s["entry_idx"]
        direction = s["direction"]
        entry = s["entry"]
        stop = s["stop"]
        tp1, tp2, tp3 = s["tp1"], s["tp2"], s["tp3"]
        pnl = 0.0

        for j in range(idx + 1, min(idx + 100, len(df))):
            if direction == "long":
                if l[j] <= stop:
                    pnl = (stop - entry) / entry - 2 * fee
                    break
                if h[j] >= tp3:
                    pnl = (tp3 - entry) / entry - 2 * fee
                    break
                if h[j] >= tp2:
                    pnl = (tp2 - entry) / entry - 2 * fee
                    break
                if h[j] >= tp1:
                    pnl = (tp1 - entry) / entry - 2 * fee
                    break
            else:
                if h[j] >= stop:
                    pnl = (entry - stop) / entry - 2 * fee
                    break
                if l[j] <= tp3:
                    pnl = (entry - tp3) / entry - 2 * fee
                    break
                if l[j] <= tp2:
                    pnl = (entry - tp2) / entry - 2 * fee
                    break
                if l[j] <= tp1:
                    pnl = (entry - tp1) / entry - 2 * fee
                    break

        trades.append({"entry_idx": idx, "direction": direction, "pnl": pnl})

    if not trades:
        return BacktestResult(0, 0, 0, 0, [])

    pnls = [t["pnl"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    win_rate = len(wins) / len(trades)
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = gross_profit / (gross_loss + 1e-12)
    expectancy = np.mean(pnls)
    eq = np.cumsum(pnls)
    peak = np.maximum.accumulate(eq)
    max_drawdown = np.max(peak - eq)

    return BacktestResult(win_rate, profit_factor, max_drawdown, expectancy, trades)
