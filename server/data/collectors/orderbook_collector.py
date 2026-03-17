"""
Orderbook collector: subscribes to Binance depth stream, normalizes and writes to Redis.
Depth 100ms stream sends incremental (b, a); we keep full book in memory and publish.
"""

import time
from typing import Optional

from ..storage.redis_cache import RedisCache


def _merge_book(current: dict[float, float], updates: list) -> dict[float, float]:
    """Merge incremental [price, qty] into level dict. qty 0 => remove."""
    out = dict(current)
    for p, q in updates:
        price = float(p)
        qty = float(q)
        if qty == 0:
            out.pop(price, None)
        else:
            out[price] = qty
    return out


def _parse_depth_event(data: dict, book_state: Optional[dict] = None) -> Optional[dict]:
    """Normalize Binance depth event to our schema. Handles both snapshot and incremental (b/a)."""
    bids_raw = data.get("bids") or data.get("b", [])
    asks_raw = data.get("asks") or data.get("a", [])
    if not bids_raw and not asks_raw:
        return None
    state = book_state if book_state is not None else {}
    bid_levels = dict(state.get("bids", {}))
    ask_levels = dict(state.get("asks", {}))
    if bids_raw:
        bid_levels = _merge_book(bid_levels, [[p, q] for p, q in bids_raw])
    if asks_raw:
        ask_levels = _merge_book(ask_levels, [[p, q] for p, q in asks_raw])
    bids = sorted(bid_levels.items(), key=lambda x: -x[0])[:1000]
    asks = sorted(ask_levels.items(), key=lambda x: x[0])[:1000]
    bids = [[p, q] for p, q in bids]
    asks = [[p, q] for p, q in asks]
    ts = data.get("E") or int(time.time() * 1000)
    if not bids and not asks:
        return None
    best_bid = bids[0][0] if bids else 0.0
    best_ask = asks[0][0] if asks else 0.0
    spread = best_ask - best_bid if (best_bid and best_ask) else 0.0
    bid_vol = sum(q for _, q in bids)
    ask_vol = sum(q for _, q in asks)
    result = {
        "symbol": data.get("s", "BTCUSDT"),
        "timestamp": ts,
        "bids": bids,
        "asks": asks,
        "spread": spread,
        "bidVolume": bid_vol,
        "askVolume": ask_vol,
        "wallClusters": _cluster_walls(bids, asks, best_bid, best_ask),
    }
    if book_state is not None:
        book_state["bids"] = bid_levels
        book_state["asks"] = ask_levels
    return result


def _cluster_walls(
    bids: list, asks: list, best_bid: float, best_ask: float
) -> list:
    """Simple wall clusters: aggregate volume in price buckets."""
    clusters = []
    bucket_pct = 0.001
    for side, book in [("bid", bids), ("ask", asks)]:
        if not book:
            continue
        ref = best_bid if side == "bid" else best_ask
        bucketed: dict[float, float] = {}
        for p, q in book:
            bucket = round(p / ref / bucket_pct) * bucket_pct * ref
            bucketed[bucket] = bucketed.get(bucket, 0) + q
        for price, vol in sorted(bucketed.items(), key=lambda x: -x[1])[:10]:
            clusters.append({"side": side, "price": price, "volume": vol})
    return clusters


class OrderbookCollector:
    """Consumes depth payloads from WebsocketClient; keeps full book, writes to Redis."""

    def __init__(self, redis_cache: RedisCache, symbol: str = "BTCUSDT"):
        self._redis = redis_cache
        self._symbol = symbol.upper()
        self._last_ts: Optional[float] = None
        self._book_state: dict = {}

    async def on_depth(self, data: dict) -> None:
        """Called by WebsocketClient when depth event arrives (incremental or snapshot)."""
        out = _parse_depth_event(data, self._book_state)
        if out is None:
            return
        self._last_ts = time.time()
        if self._redis.is_ready():
            await self._redis.set_orderbook(self._symbol, out)

    @property
    def last_update_ts(self) -> Optional[float]:
        return self._last_ts
