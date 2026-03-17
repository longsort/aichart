"""
Spread Monitor: current spread vs average; expansion => instability / execution gate penalty.
"""

import time
from typing import Optional


def compute_spread_state(
    orderbook: Optional[dict],
    spread_history: Optional[list[float]] = None,
    window: int = 50,
) -> dict:
    """
    Returns { spreadNow, spreadAvg, spreadExpansion, marketStability }.
    """
    if not orderbook:
        return {
            "spreadNow": 0.0,
            "spreadAvg": 0.0,
            "spreadExpansion": 0.0,
            "marketStability": "unknown",
        }
    spread_now = orderbook.get("spread", 0.0) or 0.0
    history = (spread_history or [])[-window:]
    spread_avg = sum(history) / len(history) if history else spread_now
    if spread_avg > 0:
        expansion = (spread_now - spread_avg) / spread_avg
    else:
        expansion = 0.0
    if expansion > 0.5:
        stability = "unstable"
    elif expansion > 0.2:
        stability = "elevated"
    else:
        stability = "normal"
    return {
        "spreadNow": round(spread_now, 4),
        "spreadAvg": round(spread_avg, 4),
        "spreadExpansion": round(expansion, 4),
        "marketStability": stability,
    }
