"""
Trades collector: subscribes to Binance aggTrade stream, deduplicates, rolling window, writes to Redis.
"""

import time
from collections import deque
from typing import Optional

from ..storage.redis_cache import RedisCache

TRADES_MAX_LEN = 50000
TRADES_WINDOW_SEC = 300


def _parse_agg_trade(data: dict) -> Optional[dict]:
    """Single aggTrade event to normalized trade."""
    try:
        price = float(data.get("p", 0))
        qty = float(data.get("q", 0))
        ts = int(data.get("T", 0) or data.get("E", 0))
        is_buy = data.get("m", False) is False
        side = "buy" if is_buy else "sell"
        size = qty
        delta = qty if is_buy else -qty
        return {
            "price": price,
            "size": size,
            "side": side,
            "timestamp": ts,
            "delta": delta,
        }
    except (TypeError, ValueError):
        return None


class TradesCollector:
    """
    Maintains rolling window of trades, cumulative delta, dedup by (ts, price, size, side).
    Writes last N trades to Redis for microstructure replay.
    """

    def __init__(self, redis_cache: RedisCache, symbol: str = "BTCUSDT"):
        self._redis = redis_cache
        self._symbol = symbol.upper()
        self._trades: deque = deque(maxlen=TRADES_MAX_LEN)
        self._seen: set = set()
        self._cumulative_delta = 0.0
        self._last_ts: Optional[float] = None

    def _dedup_key(self, t: dict) -> tuple:
        return (t["timestamp"], t["price"], t["size"], t["side"])

    async def on_agg_trade(self, data: dict) -> None:
        """Called when aggTrade event arrives."""
        trade = _parse_agg_trade(data)
        if trade is None:
            return
        key = self._dedup_key(trade)
        if key in self._seen:
            return
        self._seen.add(key)
        if len(self._seen) > 100000:
            self._seen.clear()
        self._cumulative_delta += trade["delta"]
        trade["cumulativeDelta"] = self._cumulative_delta
        self._trades.append(trade)
        self._last_ts = time.time()
        if self._redis.is_ready():
            await self._flush_to_redis()

    async def _flush_to_redis(self) -> None:
        """Write recent trades (last 5 min) to Redis."""
        now_sec = time.time()
        cutoff_ms = int((now_sec - TRADES_WINDOW_SEC) * 1000)
        recent = [t for t in self._trades if t["timestamp"] >= cutoff_ms]
        payload = recent[-10000:]
        await self._redis.set_trades(self._symbol, payload)

    def get_trades_since(self, since_ts_ms: int) -> list:
        """Return trades with timestamp >= since_ts_ms (for replay)."""
        return [t for t in self._trades if t["timestamp"] >= since_ts_ms]

    @property
    def last_update_ts(self) -> Optional[float]:
        return self._last_ts

    @property
    def cumulative_delta(self) -> float:
        return self._cumulative_delta
