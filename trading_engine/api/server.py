"""
FASTAPI SERVER
--------------
GET /signal - Returns signal JSON
WebSocket /ws - Realtime signals
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional
import json

from fastapi import FastAPI, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.data_engine import load_ohlcv, generate_sample_data
from engine.regime import run_regime_engine
from engine.liquidity import run_liquidity_engine
from engine.structure import run_structure_engine
from engine.smartmoney import run_smartmoney_engine
from engine.liquidity_trap import run_liquidity_trap_engine
from engine.orderflow import run_orderflow_engine
from engine.liquidity_magnet import run_liquidity_magnet_engine
from engine.feature_engine import run_feature_engine
from engine.execution import run_execution_engine

app = FastAPI(
    title="Trading Analysis API",
    description="Institutional-grade SMC + Quantitative + ML engine",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"])

# Global model (load on startup or train)
_model = None
_df_cache = {}
_TIMEFRAMES = {"1m": "1T", "5m": "5T", "15m": "15T", "1h": "1H", "4h": "4H", "1d": "1D"}


def _run_full_pipeline(df: pd.DataFrame) -> tuple:
    """Run all engines and return (df, probability_series)."""
    df = run_regime_engine(df)
    df = run_liquidity_engine(df)
    df = run_structure_engine(df)
    df = run_smartmoney_engine(df)
    df = run_liquidity_trap_engine(df)
    df = run_orderflow_engine(df)
    df = run_liquidity_magnet_engine(df)
    df = run_feature_engine(df)

    prob = pd.Series(0.55, index=df.index)
    if _model is not None:
        try:
            from engine.ml_engine import predict_probability
            prob = predict_probability(_model, df)
        except Exception:
            pass

    return df, prob


@app.get("/signal")
async def get_signal(
    symbol: str = Query("BTCUSDT", description="Symbol"),
    timeframe: str = Query("4h", description="1m, 5m, 15m, 1h, 4h, 1d"),
    source: Optional[str] = Query(None, description="CSV path or 'sample'"),
):
    """
    Get trading signal.
    Returns: symbol, direction, entry, stop, tp1, tp2, tp3, probability,
             liquidity_target, engine_score, timestamp
    """
    if source == "sample" or not source:
        df = generate_sample_data(2000)
    else:
        df = load_ohlcv(source)
        if timeframe != "raw":
            freq = _TIMEFRAMES.get(timeframe, "4H")
            df = df.set_index("timestamp").resample(freq).agg({
                "open": "first", "high": "max", "low": "min",
                "close": "last", "volume": "sum",
            }).dropna().reset_index()

    df, prob = _run_full_pipeline(df)
    i = len(df) - 1
    p = float(prob.iloc[i])
    setup = run_execution_engine(df, i, p)

    row = df.iloc[i]
    return {
        "symbol": symbol,
        "direction": setup.direction if setup else "none",
        "entry": setup.entry if setup else float(row["close"]),
        "stop": setup.stop if setup else 0.0,
        "tp1": setup.tp1 if setup else 0.0,
        "tp2": setup.tp2 if setup else 0.0,
        "tp3": setup.tp3 if setup else 0.0,
        "probability": round(p, 4),
        "liquidity_target": setup.liquidity_target if setup else float(row.get("next_liquidity_target", row["close"])),
        "engine_score": setup.engine_score if setup else 0.0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.websocket("/ws")
async def websocket_signals(websocket: WebSocket):
    """WebSocket for realtime signals."""
    await websocket.accept()
    try:
        while True:
            df = generate_sample_data(500)
            df, prob = _run_full_pipeline(df)
            i = len(df) - 1
            p = float(prob.iloc[i])
            setup = run_execution_engine(df, i, p)
            row = df.iloc[i]
            payload = {
                "symbol": "BTCUSDT",
                "direction": setup.direction if setup else "none",
                "entry": setup.entry if setup else float(row["close"]),
                "stop": setup.stop if setup else 0.0,
                "tp1": setup.tp1 if setup else 0.0,
                "tp2": setup.tp2 if setup else 0.0,
                "tp3": setup.tp3 if setup else 0.0,
                "probability": round(p, 4),
                "liquidity_target": setup.liquidity_target if setup else float(row.get("next_liquidity_target", row["close"])),
                "engine_score": setup.engine_score if setup else 0.0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await websocket.send_json(payload)
            await asyncio.sleep(5)
    except Exception:
        pass
    finally:
        await websocket.close()


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": _model is not None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
