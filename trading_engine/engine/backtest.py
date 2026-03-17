"""
BACKTEST ENGINE
---------------
Historical backtest. Metrics: win_rate, profit_factor, max_drawdown,
expectancy, sharpe_ratio.
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any
from dataclasses import dataclass, field


@dataclass
class BacktestResult:
    win_rate: float
    profit_factor: float
    max_drawdown: float
    expectancy: float
    sharpe_ratio: float
    total_trades: int
    trades: List[Dict[str, Any]] = field(default_factory=list)


def run_backtest(
    df: pd.DataFrame,
    setups: List[Dict[str, Any]],
    fee_pct: float = 0.001,
) -> BacktestResult:
    """
    Backtest trade setups against OHLCV.
    setups: list of {entry_idx, direction, entry, stop, tp1, tp2, tp3}
    """
    trades = []
    h = df["high"].values
    l = df["low"].values

    for s in setups:
        idx = s["entry_idx"]
        direction = s["direction"]
        entry = s["entry"]
        stop = s["stop"]
        tp1, tp2, tp3 = s["tp1"], s["tp2"], s["tp3"]

        pnl = 0.0
        outcome = "open"
        exit_price = entry

        for j in range(idx + 1, min(idx + 100, len(df))):
            if direction == "long":
                if l[j] <= stop:
                    pnl = (stop - entry) / entry - 2 * fee_pct
                    outcome = "stop"
                    exit_price = stop
                    break
                if h[j] >= tp3:
                    pnl = (tp3 - entry) / entry - 2 * fee_pct
                    outcome = "tp3"
                    exit_price = tp3
                    break
                if h[j] >= tp2:
                    pnl = (tp2 - entry) / entry - 2 * fee_pct
                    outcome = "tp2"
                    exit_price = tp2
                    break
                if h[j] >= tp1:
                    pnl = (tp1 - entry) / entry - 2 * fee_pct
                    outcome = "tp1"
                    exit_price = tp1
                    break
            else:
                if h[j] >= stop:
                    pnl = (entry - stop) / entry - 2 * fee_pct
                    outcome = "stop"
                    exit_price = stop
                    break
                if l[j] <= tp3:
                    pnl = (entry - tp3) / entry - 2 * fee_pct
                    outcome = "tp3"
                    exit_price = tp3
                    break
                if l[j] <= tp2:
                    pnl = (entry - tp2) / entry - 2 * fee_pct
                    outcome = "tp2"
                    exit_price = tp2
                    break
                if l[j] <= tp1:
                    pnl = (entry - tp1) / entry - 2 * fee_pct
                    outcome = "tp1"
                    exit_price = tp1
                    break

        trades.append({
            "entry_idx": idx,
            "direction": direction,
            "entry": entry,
            "exit_price": exit_price,
            "outcome": outcome,
            "pnl": pnl,
        })

    if not trades:
        return BacktestResult(
            win_rate=0, profit_factor=0, max_drawdown=0,
            expectancy=0, sharpe_ratio=0, total_trades=0, trades=[],
        )

    pnls = [t["pnl"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    win_rate = len(wins) / len(trades) if trades else 0
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = gross_profit / (gross_loss + 1e-12)
    expectancy = np.mean(pnls)
    eq = np.cumsum(pnls)
    peak = np.maximum.accumulate(eq)
    dd = peak - eq
    max_drawdown = np.max(dd) if len(dd) > 0 else 0
    sharpe = np.mean(pnls) / (np.std(pnls) + 1e-12) * np.sqrt(252) if len(pnls) > 1 else 0

    return BacktestResult(
        win_rate=win_rate,
        profit_factor=profit_factor,
        max_drawdown=max_drawdown,
        expectancy=expectancy,
        sharpe_ratio=float(sharpe),
        total_trades=len(trades),
        trades=trades,
    )
