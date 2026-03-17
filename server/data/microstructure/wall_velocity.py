"""
Dynamic Wall Engine: price-level bid/ask wall velocity over rolling windows.
Tracks whether walls are building, persisting, or decaying (spoof risk).
"""

import time
from typing import Optional

import numpy as np


def _aggregate_depth_by_level(
    bids: list, asks: list, bucket_pct: float = 0.001
) -> tuple[dict[float, float], dict[float, float]]:
    """Aggregate bids/asks into price buckets (level -> volume)."""
    def bucketize(book: list, ref: float) -> dict[float, float]:
        out: dict[float, float] = {}
        for p, q in book:
            b = round(p / ref / bucket_pct) * bucket_pct * ref
            out[b] = out.get(b, 0) + q
        return out
    best_bid = bids[0][0] if bids else 0.0
    best_ask = asks[0][0] if asks else 0.0
    ref = best_bid or best_ask or 1.0
    return bucketize(bids, ref), bucketize(asks, ref)


def compute_wall_velocity(
    orderbook_now: Optional[dict],
    orderbook_prev: Optional[dict],
    window_sec: float = 60.0,
) -> list[dict]:
    """
    Compare current vs previous orderbook to get wall velocity per level.
    Returns list of { price, bidWallNow, bidWallPrev, bidWallVelocity, ... }.
    """
    if not orderbook_now or not orderbook_prev:
        return []
    bids_now, asks_now = _aggregate_depth_by_level(
        orderbook_now.get("bids", []), orderbook_now.get("asks", [])
    )
    bids_prev, asks_prev = _aggregate_depth_by_level(
        orderbook_prev.get("bids", []), orderbook_prev.get("asks", [])
    )
    all_prices = set(bids_now) | set(asks_now) | set(bids_prev) | set(asks_prev)
    out = []
    for price in sorted(all_prices, reverse=True)[:80]:
        bn = bids_now.get(price, 0.0)
        bp = bids_prev.get(price, 0.0)
        an = asks_now.get(price, 0.0)
        ap = asks_prev.get(price, 0.0)
        if bn == 0 and bp == 0 and an == 0 and ap == 0:
            continue
        bid_vel = (bn - bp) / window_sec if window_sec > 0 else 0.0
        ask_vel = (an - ap) / window_sec if window_sec > 0 else 0.0
        persistence = 1.0 if (bn > 0 and bp > 0) or (an > 0 and ap > 0) else 0.0
        decay = 1.0 if (bp > 0 and bn < bp * 0.5) or (ap > 0 and an < ap * 0.5) else 0.0
        buildup = 1.0 if bn > bp * 1.2 or an > ap * 1.2 else 0.0
        out.append({
            "price": price,
            "bidWallNow": bn,
            "bidWallPrev": bp,
            "bidWallVelocity": round(bid_vel, 6),
            "askWallNow": an,
            "askWallPrev": ap,
            "askWallVelocity": round(ask_vel, 6),
            "wallPersistence": persistence,
            "wallDecay": decay,
            "wallBuildUp": buildup,
        })
    return out
