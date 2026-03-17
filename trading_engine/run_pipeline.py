"""
Full pipeline: data -> regime -> liquidity -> structure -> smartmoney ->
liquidity_trap -> orderflow -> liquidity_magnet -> features -> ML -> execution.
"""

import argparse
from pathlib import Path

import pandas as pd

from engine.data_engine import load_ohlcv, generate_sample_data
from engine.regime import run_regime_engine
from engine.liquidity import run_liquidity_engine
from engine.structure import run_structure_engine
from engine.smartmoney import run_smartmoney_engine
from engine.liquidity_trap import run_liquidity_trap_engine
from engine.orderflow import run_orderflow_engine
from engine.liquidity_magnet import run_liquidity_magnet_engine
from engine.feature_engine import run_feature_engine
from engine.ml_engine import train_ml_model, predict_probability, signal_strength
from engine.execution import run_execution_engine
from engine.backtest import run_backtest


def run_pipeline(
    source: str = "sample",
    timeframe: str = "4h",
    train_ml: bool = True,
) -> tuple:
    """
    Run full analysis pipeline. Returns (df, model, setups).
    """
    if source == "sample":
        df = generate_sample_data(3000)
    else:
        df = load_ohlcv(source)
        if timeframe != "raw":
            freq = {"1m": "1T", "5m": "5T", "15m": "15T", "1h": "1H", "4h": "4H", "1d": "1D"}.get(timeframe, "4H")
            df = df.set_index("timestamp").resample(freq).agg({
                "open": "first", "high": "max", "low": "min",
                "close": "last", "volume": "sum",
            }).dropna().reset_index()

    df = run_regime_engine(df)
    df = run_liquidity_engine(df)
    df = run_structure_engine(df)
    df = run_smartmoney_engine(df)
    df = run_liquidity_trap_engine(df)
    df = run_orderflow_engine(df)
    df = run_liquidity_magnet_engine(df)
    df = run_feature_engine(df)

    model = None
    prob = pd.Series(0.55, index=df.index)

    if train_ml:
        try:
            model, train_acc, test_acc = train_ml_model(df)
            prob = predict_probability(model, df)
            print(f"ML: train_acc={train_acc:.3f} test_acc={test_acc:.3f}")
        except Exception as e:
            print(f"ML training skipped: {e}")

    setups = []
    for i in range(100, len(df) - 1):
        s = run_execution_engine(df, i, float(prob.iloc[i]))
        if s:
            setups.append({
                "entry_idx": i,
                "direction": s.direction,
                "entry": s.entry,
                "stop": s.stop,
                "tp1": s.tp1,
                "tp2": s.tp2,
                "tp3": s.tp3,
                "probability": s.probability,
            })

    if setups:
        result = run_backtest(df, setups)
        print(f"Backtest: win_rate={result.win_rate:.2%} pf={result.profit_factor:.2f} "
              f"max_dd={result.max_drawdown:.2%} sharpe={result.sharpe_ratio:.2f}")

    return df, model, setups


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="sample", help="CSV path or 'sample'")
    parser.add_argument("--timeframe", default="4h", help="1m,5m,15m,1h,4h,1d")
    parser.add_argument("--no-ml", action="store_true", help="Skip ML training")
    args = parser.parse_args()

    df, model, setups = run_pipeline(args.source, args.timeframe, train_ml=not args.no_ml)
    print(f"Pipeline done. Rows={len(df)} Setups={len(setups)}")


if __name__ == "__main__":
    main()
