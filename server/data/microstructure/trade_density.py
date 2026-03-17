"""
Trade Density: volume and count per price band; absorption vs liquidity void candidates.
"""

import time
from typing import Optional


def compute_trade_density(
    trades: Optional[list],
    now_ts_ms: Optional[int] = None,
    window_sec: int = 300,
    band_pct: float = 0.002,
) -> list[dict]:
    """
    Group trades into price bands. High volume + low price move => absorption candidate.
    Low volume + large move => liquidity void candidate.
    """
    now = now_ts_ms or int(time.time() * 1000)
    cutoff = now - window_sec * 1000
    if not trades:
        return []
    recent = [t for t in trades if t.get("timestamp", 0) >= cutoff]
    if not recent:
        return []
    prices = [t["price"] for t in recent]
    low_p = min(prices)
    high_p = max(prices)
    mid = (low_p + high_p) / 2 or 1.0
    step = mid * band_pct
    bands: dict[tuple[float, float], list] = {}
    for t in recent:
        p = t["price"]
        band_low = (p // step) * step
        band_high = band_low + step
        key = (band_low, band_high)
        if key not in bands:
            bands[key] = []
        bands[key].append(t)
    out = []
    for (bl, bh), band_trades in sorted(bands.items(), key=lambda x: -len(x[1]))[:20]:
        buy_vol = sum(t.get("size", 0) for t in band_trades if t.get("side") == "buy")
        sell_vol = sum(t.get("size", 0) for t in band_trades if t.get("side") == "sell")
        total_vol = buy_vol + sell_vol
        count = len(band_trades)
        density = total_vol / (bh - bl) if (bh - bl) > 0 else 0
        price_range = high_p - low_p
        absorption = 1 if count > 10 and price_range < mid * 0.005 else 0
        out.append({
            "priceBandLow": bl,
            "priceBandHigh": bh,
            "tradeCount": count,
            "buyExecuted": round(buy_vol, 4),
            "sellExecuted": round(sell_vol, 4),
            "tradeDensity": round(density, 4),
            "absorptionCandidate": bool(absorption),
        })
    return out
