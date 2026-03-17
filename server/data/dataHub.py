"""
DataHub: central interface for all pipeline stages.
All engines read data only through DataHub (Redis-backed).
Runs Stage 1 (ingestion) and can run Stage 2 (microstructure replay) in a loop.
"""

import asyncio
import time
from typing import Any, Optional

from .storage.redis_cache import RedisCache
from .collectors.websocket_client import WebsocketClient
from .collectors.orderbook_collector import OrderbookCollector
from .collectors.trades_collector import TradesCollector
from .microstructure.replay_state import run_microstructure_replay


class DataHub:
    """
    Single entry point for data ingestion and read.
    - Runs WebSocket collectors and writes to Redis.
    - Exposes get_orderbook(symbol), get_trades(symbol), etc. for downstream engines.
    """

    def __init__(self, redis_url: str = "redis://localhost:6379/0", symbol: str = "BTCUSDT"):
        self._redis = RedisCache(redis_url)
        self._symbol = symbol.upper()
        self._ob = OrderbookCollector(self._redis, self._symbol)
        self._trades = TradesCollector(self._redis, self._symbol)
        self._ws: Optional[WebsocketClient] = None
        self._ws_task: Optional[asyncio.Task] = None

    async def start(self) -> bool:
        """Connect Redis and start WebSocket streams."""
        ok = await self._redis.connect()
        if not ok:
            return False

        async def on_payload(data: dict) -> None:
            event = data.get("e")
            if event == "depthUpdate":
                await self._ob.on_depth(data)
            elif event == "aggTrade":
                await self._trades.on_agg_trade(data)

        streams = [
            f"{self._symbol.lower()}@depth@100ms",
            f"{self._symbol.lower()}@aggTrade",
        ]
        self._ws = WebsocketClient(streams, on_payload)
        self._ws_task = self._ws.start()
        return True

    async def stop(self) -> None:
        if self._ws:
            await self._ws.stop()
        await self._redis.close()

    # ---------- Read API for pipeline stages ----------

    async def get_orderbook(self, symbol: Optional[str] = None) -> Optional[dict]:
        sym = (symbol or self._symbol).upper()
        return await self._redis.get_orderbook(sym)

    async def get_trades(self, symbol: Optional[str] = None) -> Optional[list]:
        sym = (symbol or self._symbol).upper()
        return await self._redis.get_trades(sym)

    def is_ready(self) -> bool:
        return self._redis.is_ready()

    def orderbook_last_ts(self) -> Optional[float]:
        return self._ob.last_update_ts

    def trades_last_ts(self) -> Optional[float]:
        return self._trades.last_update_ts

    async def _set_replay(self, symbol: str, data: dict) -> None:
        await self._redis.set_replay(symbol, data)

    async def run_replay_once(self) -> Optional[Any]:
        """Run one microstructure replay cycle (Stage 2) and write to Redis."""
        return await run_microstructure_replay(
            self.get_orderbook,
            self.get_trades,
            self._set_replay,
            symbol=self._symbol,
        )

    def run_replay_loop(self, interval_sec: float = 5.0) -> asyncio.Task:
        """Start background task that runs microstructure replay every interval_sec."""
        async def _loop() -> None:
            while True:
                try:
                    await self.run_replay_once()
                except Exception:
                    pass
                await asyncio.sleep(interval_sec)
        task = asyncio.create_task(_loop())
        return task
