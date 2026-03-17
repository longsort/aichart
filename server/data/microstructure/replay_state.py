"""
Replay State: orchestrates 30s/60s/180s/300s microstructure replay.
Combines wall velocity, delta acceleration, trade density, spread into single replayBias.
"""

import time
from typing import Optional

from .wall_velocity import compute_wall_velocity
from .delta_acceleration import compute_delta_acceleration
from .trade_density import compute_trade_density
from .spread_monitor import compute_spread_state


# Replay windows in seconds (align with spec: 30, 60, 180, 300)
REPLAY_WINDOWS = (30, 60, 180, 300)


def _replay_bias_from_components(
    delta_acc: dict,
    wall_velocity: list,
    spread_state: dict,
    trade_density: list,
) -> str:
    """
    Derive single replayBias label for downstream engines.
    """
    agg = delta_acc.get("aggressionBias", "neutral")
    spread = spread_state.get("marketStability", "normal")
    if spread == "unstable":
        return "unstable"
    spoof_risk = 0
    for w in wall_velocity:
        if w.get("wallDecay", 0) == 1.0 and w.get("wallBuildUp", 0) == 1.0:
            spoof_risk += 1
    if spoof_risk >= 3:
        return "spoof_risk"
    if agg == "buy":
        return "bullish_building"
    if agg == "sell":
        return "bearish_building"
    return "neutral"


class ReplayState:
    """Holds current snapshot of microstructure replay for one symbol."""

    __slots__ = (
        "symbol", "timestamp", "bidWallStrength", "askWallStrength",
        "bidWallVelocity", "askWallVelocity", "deltaAcceleration",
        "buyAggression", "sellAggression", "absorptionBuy", "absorptionSell",
        "tradeDensityZones", "liquidityVoidZones", "spreadState",
        "spoofRisk", "replayBias",
    )

    def __init__(
        self,
        symbol: str = "BTCUSDT",
        timestamp: int = 0,
        bid_wall_strength: float = 0.0,
        ask_wall_strength: float = 0.0,
        bid_wall_velocity: float = 0.0,
        ask_wall_velocity: float = 0.0,
        delta_acceleration: float = 0.0,
        buy_aggression: float = 0.0,
        sell_aggression: float = 0.0,
        absorption_buy: float = 0.0,
        absorption_sell: float = 0.0,
        trade_density_zones: Optional[list] = None,
        liquidity_void_zones: Optional[list] = None,
        spread_state: Optional[dict] = None,
        spoof_risk: float = 0.0,
        replay_bias: str = "neutral",
    ):
        self.symbol = symbol
        self.timestamp = timestamp
        self.bidWallStrength = bid_wall_strength
        self.askWallStrength = ask_wall_strength
        self.bidWallVelocity = bid_wall_velocity
        self.askWallVelocity = ask_wall_velocity
        self.deltaAcceleration = delta_acceleration
        self.buyAggression = buy_aggression
        self.sellAggression = sell_aggression
        self.absorptionBuy = absorption_buy
        self.absorptionSell = absorption_sell
        self.tradeDensityZones = trade_density_zones or []
        self.liquidityVoidZones = liquidity_void_zones or []
        self.spreadState = spread_state or {}
        self.spoofRisk = spoof_risk
        self.replayBias = replay_bias

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "timestamp": self.timestamp,
            "bidWallStrength": self.bidWallStrength,
            "askWallStrength": self.askWallStrength,
            "bidWallVelocity": self.bidWallVelocity,
            "askWallVelocity": self.askWallVelocity,
            "deltaAcceleration": self.deltaAcceleration,
            "buyAggression": self.buyAggression,
            "sellAggression": self.sellAggression,
            "absorptionBuy": self.absorptionBuy,
            "absorptionSell": self.absorptionSell,
            "tradeDensityZones": self.tradeDensityZones,
            "liquidityVoidZones": self.liquidityVoidZones,
            "spreadState": self.spreadState,
            "spoofRisk": self.spoofRisk,
            "replayBias": self.replayBias,
        }


async def run_microstructure_replay(
    get_orderbook,
    get_trades,
    set_replay,
    symbol: str = "BTCUSDT",
    orderbook_prev_cache: Optional[dict] = None,
    spread_history: Optional[list] = None,
) -> Optional[ReplayState]:
    """
    Run one iteration of microstructure replay: read from Redis (via get_orderbook/get_trades),
    compute wall velocity, delta acceleration, trade density, spread; write replay state via set_replay.
    get_orderbook(symbol), get_trades(symbol), set_replay(symbol, dict) are async callables.
    """
    ob_now = await get_orderbook(symbol)
    trades = await get_trades(symbol)
    now_ms = int(time.time() * 1000)

    # Orderbook prev: use cached snapshot from ~60s ago or previous fetch
    ob_prev = orderbook_prev_cache or ob_now

    wall_vel = compute_wall_velocity(ob_now, ob_prev, window_sec=60.0)
    delta_acc = compute_delta_acceleration(trades, now_ms, windows_sec=(30, 60, 180, 300))
    density = compute_trade_density(trades, now_ms, window_sec=300)
    spread_state = compute_spread_state(ob_now, spread_history)

    bid_strength = sum(w.get("bidWallNow", 0) for w in wall_vel[:10])
    ask_strength = sum(w.get("askWallNow", 0) for w in wall_vel[:10])
    bid_vel_agg = sum(w.get("bidWallVelocity", 0) for w in wall_vel[:10])
    ask_vel_agg = sum(w.get("askWallVelocity", 0) for w in wall_vel[:10])
    spoof = sum(1 for w in wall_vel if w.get("wallDecay") and w.get("wallBuildUp"))

    absorption_buy = sum(1 for z in density if z.get("absorptionCandidate") and z.get("buyExecuted", 0) > z.get("sellExecuted", 0))
    absorption_sell = sum(1 for z in density if z.get("absorptionCandidate") and z.get("sellExecuted", 0) > z.get("buyExecuted", 0))

    replay_bias = _replay_bias_from_components(delta_acc, wall_vel, spread_state, density)

    state = ReplayState(
        symbol=symbol,
        timestamp=now_ms,
        bid_wall_strength=round(bid_strength, 4),
        ask_wall_strength=round(ask_strength, 4),
        bid_wall_velocity=round(bid_vel_agg, 6),
        ask_wall_velocity=round(ask_vel_agg, 6),
        delta_acceleration=delta_acc.get("deltaAcceleration", 0.0),
        buy_aggression=1.0 if delta_acc.get("aggressionBias") == "buy" else 0.0,
        sell_aggression=1.0 if delta_acc.get("aggressionBias") == "sell" else 0.0,
        absorption_buy=float(absorption_buy),
        absorption_sell=float(absorption_sell),
        trade_density_zones=density[:10],
        liquidity_void_zones=[z for z in density if not z.get("absorptionCandidate") and z.get("tradeCount", 0) < 3][:5],
        spread_state=spread_state,
        spoof_risk=float(spoof),
        replay_bias=replay_bias,
    )

    if set_replay:
        await set_replay(symbol, state.to_dict())

    return state
