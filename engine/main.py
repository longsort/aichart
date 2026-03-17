"""
FastAPI Trading Analysis Engine
POST /analyze - Full analysis pipeline
"""

from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import pandas as pd

from modules.data import fetch_ohlcv
from modules.regime import run as run_regime
from modules.smc import run as run_smc
from modules.liquidity import run as run_liquidity
from modules.smartmoney import run as run_smartmoney
from modules.volume import run as run_volume
from modules.orderflow import run as run_orderflow
from modules.pattern import run as run_pattern
from modules.scenario import run as run_scenario
from modules.probability import run as run_probability
from modules.signal import run as run_signal

app = FastAPI(title="Trading Analysis Engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"])


class AnalyzeRequest(BaseModel):
    symbol: str = "BTCUSDT"
    timeframe: str = "4h"
    exchange: Literal["binance", "bitget"] = "binance"


def run_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    df = run_regime(df)
    df = run_smc(df)
    df = run_liquidity(df)
    df = run_smartmoney(df)
    df = run_volume(df)
    df = run_orderflow(df)
    df = run_pattern(df)
    df = run_scenario(df)
    df = run_probability(df)
    return df


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    """
    Full analysis: fetch OHLCV -> run all engines -> return signal.
    """
    try:
        df = fetch_ohlcv(req.symbol, req.timeframe, req.exchange, limit=500)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Market data error: {e}")

    df = run_pipeline(df)
    i = len(df) - 1
    sig = run_signal(df, i)

    row = df.iloc[i]
    return {
        "symbol": req.symbol,
        "direction": sig.direction if sig else "none",
        "entry": sig.entry if sig else float(row["close"]),
        "stop": sig.stop if sig else 0.0,
        "tp1": sig.tp1 if sig else 0.0,
        "tp2": sig.tp2 if sig else 0.0,
        "tp3": sig.tp3 if sig else 0.0,
        "probability": round(float(row.get("probability", 50)), 2),
        "liquidity_target": float(row.get("nearest_liquidity_target", row["close"])),
        "scenario": str(row.get("scenario", "")),
        "trend": str(row.get("trend_direction", "range")),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "trading-engine"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
