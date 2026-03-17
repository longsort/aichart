"""
Redis cache for real-time market data.
Single point of write/read for orderbook, trades, and derived state.
"""

import json
import asyncio
from typing import Any, Optional

try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None


class RedisCache:
    """Async Redis client for The Aegis pipeline."""

    def __init__(self, url: str = "redis://localhost:6379/0"):
        self._url = url
        self._client: Optional[Any] = None
        self._ready = False

    async def connect(self) -> bool:
        if not REDIS_AVAILABLE:
            return False
        try:
            self._client = redis.from_url(self._url, decode_responses=True)
            await self._client.ping()
            self._ready = True
            return True
        except Exception:
            self._ready = False
            return False

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        self._ready = False

    def is_ready(self) -> bool:
        return self._ready and self._client is not None

    async def set_json(self, key: str, value: Any, ttl_sec: Optional[int] = None) -> bool:
        if not self._client:
            return False
        try:
            payload = json.dumps(value, default=str)
            if ttl_sec:
                await self._client.setex(key, ttl_sec, payload)
            else:
                await self._client.set(key, payload)
            return True
        except Exception:
            return False

    async def get_json(self, key: str) -> Optional[Any]:
        if not self._client:
            return None
        try:
            raw = await self._client.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            return None

    async def set_orderbook(self, symbol: str, data: dict) -> bool:
        key = f"orderbook:{symbol}"
        return await self.set_json(key, data, ttl_sec=30)

    async def get_orderbook(self, symbol: str) -> Optional[dict]:
        key = f"orderbook:{symbol}"
        return await self.get_json(key)

    async def set_trades(self, symbol: str, data: list) -> bool:
        key = f"trades:{symbol}"
        return await self.set_json(key, data, ttl_sec=60)

    async def get_trades(self, symbol: str) -> Optional[list]:
        key = f"trades:{symbol}"
        return await self.get_json(key)

    async def set_replay(self, symbol: str, data: dict) -> bool:
        key = f"replay:{symbol}"
        return await self.set_json(key, data, ttl_sec=15)

    async def get_replay(self, symbol: str) -> Optional[dict]:
        key = f"replay:{symbol}"
        return await self.get_json(key)
