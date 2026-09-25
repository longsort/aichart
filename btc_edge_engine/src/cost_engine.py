from __future__ import annotations


def roundtrip_cost_fraction(entry_fee: float, exit_fee: float, slippage_bps: float) -> float:
    """Price-fraction cost for round trip (entry+exit fees + 2x slippage)."""
    slip = (slippage_bps / 10000.0) * 2.0
    return float(entry_fee + exit_fee + slip)


def required_price_move(target_margin_roi: float, leverage: float, cost_fraction: float) -> float:
    """
    Net margin ROI ≈ price_move * L - cost_fraction * L
    => price_move = target_margin_roi / L + cost_fraction
    """
    lev = max(1.0, float(leverage))
    return float(target_margin_roi) / lev + float(cost_fraction)


def net_margin_roi(price_return: float, leverage: float, cost_fraction: float) -> float:
    return float(price_return) * leverage - float(cost_fraction) * leverage
