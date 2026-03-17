# Institutional-Grade Trading Analysis Engine

Python trading engine implementing **Smart Money Concepts (SMC)**, quantitative analysis, liquidity models, and ML probability scoring.

## Stack

- Python, pandas, numpy, ta, xgboost, scikit-learn
- FastAPI, WebSockets

## Architecture

| Engine | Description |
|--------|-------------|
| **Data** | OHLCV loading (crypto/stocks) |
| **Regime** | ATR, EMA, ADX, trend_direction, volatility_state |
| **Liquidity** | Equal highs/lows, session levels, liquidity_density |
| **Structure** | Swing fractal, HH/HL/LH/LL, BOS, CHOCH |
| **Smart Money** | Order Blocks, FVG, Supply/Demand |
| **Liquidity Trap** | False breakout detection |
| **Orderflow** | Volume spike, displacement, orderflow_score |
| **Liquidity Magnet** | Nearest liquidity target |
| **Feature** | ML feature vector |
| **ML** | XGBoost probability (TP1 vs stop) |
| **Execution** | Long/Short setups, entry, stop, tp1/tp2/tp3 |
| **Backtest** | Win rate, profit factor, max DD, Sharpe |
| **API** | GET /signal, WebSocket /ws |

## Install

```bash
cd trading_engine
pip install -r requirements.txt
```

## Run Pipeline

```bash
python run_pipeline.py --source sample --timeframe 4h
```

## Run API Server

```bash
python run_api.py
# or: uvicorn api.server:app --host 0.0.0.0 --port 8000
```

## Endpoints

- `GET /signal?symbol=BTCUSDT&timeframe=4h` - Trading signal
- `GET /health` - Health check
- `WebSocket /ws` - Realtime signals

## Signal Response

```json
{
  "symbol": "BTCUSDT",
  "direction": "long",
  "entry": 50000.0,
  "stop": 49250.0,
  "tp1": 50375.0,
  "tp2": 50750.0,
  "tp3": 51125.0,
  "probability": 0.65,
  "liquidity_target": 51200.0,
  "engine_score": 0.8,
  "timestamp": "2025-03-14T12:00:00Z"
}
```
