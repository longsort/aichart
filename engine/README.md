# Trading Analysis Engine

Python FastAPI service. Fetches OHLCV from Binance/Bitget, runs SMC + quantitative analysis, returns signals.

## Modules

| Module | Description |
|--------|-------------|
| data | Binance/Bitget OHLCV |
| regime | ATR, EMA, ADX, trend, volatility |
| smc | Swing, BOS, CHOCH |
| liquidity | Equal H/L, prev day, weekly |
| smartmoney | OB, FVG, Supply/Demand, sweeps |
| volume | volume_spike, imbalance |
| orderflow | orderflow_score |
| pattern | triangle, flag, range |
| probability | Combined score 0-100 |
| scenario | Break/reject resistance |
| signal | Entry, stop, tp1/tp2/tp3 |
| backtest | Win rate, PF, max DD |

## Run

```bash
cd engine
pip install -r requirements.txt
python main.py
# or: uvicorn main:app --host 0.0.0.0 --port 8000
```

## API

**POST /analyze**
```json
{"symbol": "BTCUSDT", "timeframe": "4h", "exchange": "binance"}
```

**Response**
```json
{
  "symbol": "BTCUSDT",
  "direction": "long",
  "entry": 50000,
  "stop": 49250,
  "tp1": 50375,
  "tp2": 50750,
  "tp3": 51125,
  "probability": 65,
  "liquidity_target": 51200,
  "scenario": "break_or_reject_resistance",
  "trend": "bullish",
  "timestamp": "..."
}
```

## Next.js Integration

Set `PYTHON_ENGINE_URL=http://localhost:8000`. The `/api/analyze` route will proxy to Python when available.
