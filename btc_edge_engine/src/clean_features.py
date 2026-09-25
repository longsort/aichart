"""클린진입용 피처 세트 — ATR·스윕·거래량 우선, RSI는 보조만."""
from __future__ import annotations

# 단독 RSI 진입 금지. 아래 세트에 RSI는 보조 소량만.
CLEAN_CORE = [
    # 변동성
    "atr14_pct",
    "atr_percentile_100",
    "atr_slope_5",
    "realized_vol_10",
    "vol_regime",
    "compression_score",
    "expansion_score",
    "range_pct",
    # 거래량 / 선진 프록시
    "volume_z_20",
    "volume_ratio_20",
    "volume_percentile_100",
    "rvol_20",
    "adv_buy_pct",
    "up_price_up_volume",
    "down_price_up_volume",
    "absorption_long_proxy",
    "absorption_short_proxy",
    # 타점 구조 / 스윕
    "sweep_long",
    "sweep_short",
    "sweep_depth_atr_long",
    "sweep_depth_atr_short",
    "reclaim_distance_atr_long",
    "reclaim_distance_atr_short",
    "volume_z_on_sweep",
    "bos_up",
    "bos_down",
    "choch_up",
    "choch_down",
    "dist_to_swing_high_atr",
    "dist_to_swing_low_atr",
    "distance_to_eqh",
    "distance_to_eql",
    "breakout_up_20",
    "breakout_down_20",
    "false_breakout_up",
    "false_breakout_down",
    # 캔들
    "body_ratio",
    "close_location",
    "upper_wick_ratio",
    "lower_wick_ratio",
    "candle_green",
    "return_1",
    "return_3",
    "return_5",
    # 추세 약하게
    "price_to_ema20",
    "ema20_slope",
    "ema_alignment_state",
    "distance_to_vwap_20",
    "range_position_50",
    "market_regime",
    "session",
    # RSI 보조 (소수)
    "rsi14",
    "rsi14_slope_5",
]


def clean_feature_cols(feat_columns: list[str]) -> list[str]:
    return [c for c in CLEAN_CORE if c in feat_columns]
