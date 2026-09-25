"""Causal (no-lookahead) feature engine + tapoint/structure proxies."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .utils import safe_div


def _rsi(close: np.ndarray, period: int) -> np.ndarray:
    n = len(close)
    out = np.full(n, np.nan)
    if n <= period:
        return out
    delta = np.diff(close, prepend=close[0])
    gain = np.clip(delta, 0, None)
    loss = np.clip(-delta, 0, None)
    # Wilder-ish SMA seed
    ag = pd.Series(gain).rolling(period, min_periods=period).mean().to_numpy()
    al = pd.Series(loss).rolling(period, min_periods=period).mean().to_numpy()
    rs = safe_div(ag, al)
    out = 100 - (100 / (1 + rs))
    return out


def _ema(x: np.ndarray, span: int) -> np.ndarray:
    return pd.Series(x).ewm(span=span, adjust=False).mean().to_numpy()


def _rolling_pct(x: np.ndarray, win: int) -> np.ndarray:
    s = pd.Series(x)
    return s.rolling(win, min_periods=max(5, win // 5)).apply(
        lambda a: pd.Series(a).rank(pct=True).iloc[-1], raw=False
    ).to_numpy()


def _atr(high, low, close, period: int) -> np.ndarray:
    prev_c = np.roll(close, 1)
    prev_c[0] = close[0]
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev_c), np.abs(low - prev_c)))
    return pd.Series(tr).rolling(period, min_periods=period).mean().to_numpy()


def confirmed_swings(high: np.ndarray, low: np.ndarray, k: int = 3):
    """Pivot confirmed only after k bars to the right (no future leak at signal time)."""
    n = len(high)
    sh = np.full(n, np.nan)
    sl = np.full(n, np.nan)
    sh_confirmed_at = np.full(n, -1, dtype=int)
    sl_confirmed_at = np.full(n, -1, dtype=int)
    for i in range(k, n - k):
        # candidate at i; confirmed at i+k
        if high[i] == np.max(high[i - k : i + k + 1]):
            conf = i + k
            if conf < n:
                sh[conf] = high[i]
                sh_confirmed_at[conf] = i
        if low[i] == np.min(low[i - k : i + k + 1]):
            conf = i + k
            if conf < n:
                sl[conf] = low[i]
                sl_confirmed_at[conf] = i
    return sh, sl, sh_confirmed_at, sl_confirmed_at


def build_features(df: pd.DataFrame, swing_k: int = 3, eq_atr_tol: float = 0.15) -> pd.DataFrame:
    o = df["open"].to_numpy(dtype=float)
    h = df["high"].to_numpy(dtype=float)
    l = df["low"].to_numpy(dtype=float)
    c = df["close"].to_numpy(dtype=float)
    v = df["volume"].to_numpy(dtype=float)
    n = len(df)
    eps = 1e-12
    rng = np.maximum(h - l, eps)
    body = np.abs(c - o)
    upper = h - np.maximum(o, c)
    lower = np.minimum(o, c) - l

    f = pd.DataFrame({"timestamp": df["timestamp"].to_numpy()})
    if "gap_flag" in df.columns:
        f["gap_flag"] = df["gap_flag"].to_numpy()
    else:
        f["gap_flag"] = 0

    # price returns (causal)
    for w in [1, 2, 3, 5, 8, 10, 20, 30]:
        f[f"return_{w}"] = pd.Series(c).pct_change(w).to_numpy()
    f["log_return"] = np.log(safe_div(c, np.roll(c, 1)))
    f.loc[0, "log_return"] = np.nan

    f["range_pct"] = rng / np.maximum(c, eps)
    f["body_pct"] = body / np.maximum(c, eps)
    f["body_ratio"] = body / rng
    f["upper_wick_ratio"] = upper / rng
    f["lower_wick_ratio"] = lower / rng
    f["close_location"] = (c - l) / rng

    # ATR / vol
    for p in [7, 14, 21]:
        atr = _atr(h, l, c, p)
        f[f"atr{p}"] = atr
        f[f"atr{p}_pct"] = atr / np.maximum(c, eps)
    f["atr_slope_5"] = pd.Series(f["atr14"]).pct_change(5).to_numpy()
    f["atr_slope_10"] = pd.Series(f["atr14"]).pct_change(10).to_numpy()
    f["atr_percentile_100"] = _rolling_pct(f["atr14_pct"].to_numpy(), 100)
    for w in [5, 10, 20]:
        f[f"realized_vol_{w}"] = pd.Series(f["log_return"]).rolling(w).std().to_numpy()

    atr_p = f["atr_percentile_100"].to_numpy()
    regime_vol = np.full(n, 1)  # NORMAL
    regime_vol = np.where(atr_p < 0.25, 0, regime_vol)  # LOW
    regime_vol = np.where(atr_p >= 0.75, 2, regime_vol)  # HIGH
    regime_vol = np.where(atr_p >= 0.90, 3, regime_vol)  # EXTREME
    f["vol_regime"] = regime_vol

    # volume
    for w in [5, 10, 20, 50]:
        ma = pd.Series(v).rolling(w, min_periods=w).mean().to_numpy()
        f[f"volume_ma_{w}"] = ma
        f[f"volume_ratio_{w}"] = safe_div(v, ma)
    std20 = pd.Series(v).rolling(20, min_periods=20).std().to_numpy()
    std50 = pd.Series(v).rolling(50, min_periods=50).std().to_numpy()
    f["volume_z_20"] = safe_div(v - f["volume_ma_20"], std20)
    f["volume_z_50"] = safe_div(v - f["volume_ma_50"], std50)
    f["volume_slope_5"] = pd.Series(v).pct_change(5).to_numpy()
    f["volume_slope_10"] = pd.Series(v).pct_change(10).to_numpy()
    f["volume_percentile_100"] = _rolling_pct(v, 100)

    # RSI
    for p in [7, 14, 21]:
        f[f"rsi{p}"] = _rsi(c, p)
    f["rsi14_change_1"] = pd.Series(f["rsi14"]).diff(1).to_numpy()
    f["rsi14_change_3"] = pd.Series(f["rsi14"]).diff(3).to_numpy()
    f["rsi14_slope_5"] = pd.Series(f["rsi14"]).diff(5).to_numpy()
    f["rsi14_percentile_100"] = _rolling_pct(f["rsi14"].to_numpy(), 100)

    # momentum / ROC
    for w in [3, 5, 10, 20]:
        f[f"roc{w}"] = pd.Series(c).pct_change(w).to_numpy()
    f["momentum_slope"] = f["roc5"] - f["roc10"]
    f["acceleration"] = f["roc3"] - f["roc5"]
    up = (c > np.roll(c, 1)).astype(float)
    up[0] = 0
    dn = (c < np.roll(c, 1)).astype(float)
    dn[0] = 0
    for w in [5, 10]:
        f[f"up_close_count_{w}"] = pd.Series(up).rolling(w).sum().to_numpy()
        f[f"down_close_count_{w}"] = pd.Series(dn).rolling(w).sum().to_numpy()

    # EMA
    for span in [9, 20, 50, 100]:
        e = _ema(c, span)
        f[f"ema{span}"] = e
        f[f"price_to_ema{span}"] = safe_div(c - e, c)
        f[f"ema{span}_slope"] = pd.Series(e).pct_change(5).to_numpy()
    align = (
        (f["ema9"] > f["ema20"]).astype(int)
        + (f["ema20"] > f["ema50"]).astype(int)
        + (f["ema50"] > f["ema100"]).astype(int)
    )
    f["ema_alignment_state"] = align  # 0..3 bullish, invert for bearish reading

    # Rolling VWAP
    typ = (h + l + c) / 3.0
    qv = df["quote_volume"].to_numpy(dtype=float) if "quote_volume" in df.columns else typ * v
    for w in [20, 50]:
        pv = pd.Series(typ * v).rolling(w, min_periods=w).sum().to_numpy()
        vv = pd.Series(v).rolling(w, min_periods=w).sum().to_numpy()
        vw = safe_div(pv, vv)
        f[f"vwap_{w}"] = vw
        f[f"distance_to_vwap_{w}"] = safe_div(c - vw, c)
        f[f"vwap_{w}_slope"] = pd.Series(vw).pct_change(5).to_numpy()
        f[f"vwap_{w}_reclaim"] = ((np.roll(c, 1) < np.roll(vw, 1)) & (c > vw)).astype(float)
        f[f"vwap_{w}_reject"] = ((np.roll(c, 1) > np.roll(vw, 1)) & (c < vw)).astype(float)
        f.loc[0, f"vwap_{w}_reclaim"] = 0
        f.loc[0, f"vwap_{w}_reject"] = 0

    # range position
    for w in [20, 50, 100]:
        rh = pd.Series(h).rolling(w, min_periods=w).max().to_numpy()
        rl = pd.Series(l).rolling(w, min_periods=w).min().to_numpy()
        f[f"range_position_{w}"] = safe_div(c - rl, rh - rl)

    # compression / expansion
    atr14 = f["atr14"].to_numpy()
    atr_ma20 = pd.Series(atr14).rolling(20, min_periods=20).mean().to_numpy()
    range5 = pd.Series(rng).rolling(5).mean().to_numpy()
    range20 = pd.Series(rng).rolling(20).mean().to_numpy()
    f["compression_atr"] = safe_div(atr14, atr_ma20)
    f["compression_range"] = safe_div(range5, range20)
    f["compression_score"] = 1.0 - np.clip((f["compression_atr"] + f["compression_range"]) / 2.0, 0, 1.5) / 1.5
    # expansion: use expanding median of range_pct (causal)
    rng_pct = f["range_pct"].to_numpy()
    expand_med = pd.Series(rng_pct).expanding(min_periods=20).median().to_numpy()
    f["expansion_score"] = np.clip(
        (f["compression_atr"] - 1.0) * 0.5
        + (f["volume_ratio_20"] - 1.0) * 0.25
        + safe_div(rng_pct, expand_med) * 0.1,
        0,
        3,
    )

    # price/volume relation
    up_bar = c > o
    dn_bar = c < o
    vol_up = v > np.roll(v, 1)
    vol_up[0] = False
    f["up_price_up_volume"] = (up_bar & vol_up).astype(float)
    f["up_price_down_volume"] = (up_bar & ~vol_up).astype(float)
    f["down_price_up_volume"] = (dn_bar & vol_up).astype(float)
    f["down_price_down_volume"] = (dn_bar & ~vol_up).astype(float)

    # absorption / exhaustion proxies (not true OF)
    f["absorption_long_proxy"] = (
        (f["volume_z_20"] > 1.0)
        & (f["lower_wick_ratio"] > 0.4)
        & (f["close_location"] > 0.6)
        & (f["return_1"] > -0.001)
    ).astype(float)
    f["absorption_short_proxy"] = (
        (f["volume_z_20"] > 1.0)
        & (f["upper_wick_ratio"] > 0.4)
        & (f["close_location"] < 0.4)
        & (f["return_1"] < 0.001)
    ).astype(float)
    new_low = l <= pd.Series(l).rolling(10, min_periods=10).min().to_numpy()
    new_high = h >= pd.Series(h).rolling(10, min_periods=10).max().to_numpy()
    f["exhaustion_sell_proxy"] = (
        new_low & (f["compression_range"] < 0.9) & (f["volume_ratio_20"] < 1.0) & (f["rsi14_slope_5"] > 0)
    ).astype(float)
    f["exhaustion_buy_proxy"] = (
        new_high & (f["compression_range"] < 0.9) & (f["volume_ratio_20"] < 1.0) & (f["rsi14_slope_5"] < 0)
    ).astype(float)

    # session
    ts = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    f["hour_utc"] = ts.dt.hour.to_numpy()
    f["day_of_week"] = ts.dt.dayofweek.to_numpy()
    hour = f["hour_utc"].to_numpy()
    session = np.full(n, 0)  # ASIA
    session = np.where((hour >= 7) & (hour < 13), 1, session)  # LONDON
    session = np.where((hour >= 13) & (hour < 21), 2, session)  # NY
    session = np.where((hour >= 12) & (hour < 16), 3, session)  # OVERLAP preference
    f["session"] = session

    # structure: confirmed swings + BOS/CHOCH proxies
    sh, sl, sh_at, sl_at = confirmed_swings(h, l, k=swing_k)
    f["swing_high_confirmed"] = sh
    f["swing_low_confirmed"] = sl
    last_sh = pd.Series(sh).ffill().to_numpy()
    last_sl = pd.Series(sl).ffill().to_numpy()
    f["dist_to_swing_high_atr"] = safe_div(last_sh - c, atr14)
    f["dist_to_swing_low_atr"] = safe_div(c - last_sl, atr14)
    # BOS: close beyond last confirmed swing
    f["bos_up"] = ((c > last_sh) & np.isfinite(last_sh)).astype(float)
    f["bos_down"] = ((c < last_sl) & np.isfinite(last_sl)).astype(float)
    # CHOCH proxy: opposite BOS after prior direction (simplified)
    f["choch_up"] = ((f["bos_up"] == 1) & (pd.Series(f["bos_down"]).rolling(20).sum() > 0)).astype(float)
    f["choch_down"] = ((f["bos_down"] == 1) & (pd.Series(f["bos_up"]).rolling(20).sum() > 0)).astype(float)

    # EQH/EQL: last two confirmed swings within tol
    atr14s = atr14
    eqh = np.full(n, np.nan)
    eql = np.full(n, np.nan)
    prev_sh_p = np.nan
    prev_sl_p = np.nan
    for i in range(n):
        if np.isfinite(sh[i]):
            if np.isfinite(prev_sh_p) and atr14s[i] > 0 and abs(sh[i] - prev_sh_p) / atr14s[i] <= eq_atr_tol:
                eqh[i] = (sh[i] + prev_sh_p) / 2
            prev_sh_p = sh[i]
        if np.isfinite(sl[i]):
            if np.isfinite(prev_sl_p) and atr14s[i] > 0 and abs(sl[i] - prev_sl_p) / atr14s[i] <= eq_atr_tol:
                eql[i] = (sl[i] + prev_sl_p) / 2
            prev_sl_p = sl[i]
    f["eqh"] = pd.Series(eqh).ffill().to_numpy()
    f["eql"] = pd.Series(eql).ffill().to_numpy()
    f["distance_to_eqh"] = safe_div(f["eqh"] - c, c)
    f["distance_to_eql"] = safe_div(c - f["eql"], c)

    # sweep / reclaim (tapoint liquidity style)
    prev_liq_low = pd.Series(l).rolling(20, min_periods=5).min().shift(1).to_numpy()
    prev_liq_high = pd.Series(h).rolling(20, min_periods=5).max().shift(1).to_numpy()
    sweep_long = (l < prev_liq_low) & (c > prev_liq_low)
    sweep_short = (h > prev_liq_high) & (c < prev_liq_high)
    f["sweep_long"] = sweep_long.astype(float)
    f["sweep_short"] = sweep_short.astype(float)
    f["sweep_depth_atr_long"] = safe_div(prev_liq_low - l, atr14)
    f["sweep_depth_atr_short"] = safe_div(h - prev_liq_high, atr14)
    f["sweep_wick_ratio_long"] = f["lower_wick_ratio"]
    f["sweep_wick_ratio_short"] = f["upper_wick_ratio"]
    f["reclaim_distance_atr_long"] = safe_div(c - prev_liq_low, atr14)
    f["reclaim_distance_atr_short"] = safe_div(prev_liq_high - c, atr14)
    f["volume_z_on_sweep"] = f["volume_z_20"] * (f["sweep_long"] + f["sweep_short"])

    # breakouts
    for w in [5, 10, 20, 30]:
        hh = pd.Series(h).rolling(w, min_periods=w).max().shift(1).to_numpy()
        ll = pd.Series(l).rolling(w, min_periods=w).min().shift(1).to_numpy()
        f[f"breakout_up_{w}"] = (c > hh).astype(float)
        f[f"breakout_down_{w}"] = (c < ll).astype(float)
        f[f"breakout_distance_atr_{w}"] = np.where(
            c > hh, safe_div(c - hh, atr14), np.where(c < ll, safe_div(ll - c, atr14), 0.0)
        )
    f["breakout_volume_z"] = f["volume_z_20"]
    f["breakout_close_acceptance"] = ((f["breakout_up_20"] == 1) & (f["close_location"] > 0.6)).astype(float) + (
        (f["breakout_down_20"] == 1) & (f["close_location"] < 0.4)
    ).astype(float)
    # false breakout: broke then back in range next bar — causal version uses prior breakout flag
    f["false_breakout_up"] = ((np.roll(f["breakout_up_20"].to_numpy(), 1) == 1) & (c < last_sh)).astype(float)
    f["false_breakout_down"] = ((np.roll(f["breakout_down_20"].to_numpy(), 1) == 1) & (c > last_sl)).astype(float)
    f.loc[0, "false_breakout_up"] = 0
    f.loc[0, "false_breakout_down"] = 0

    # market regime (deterministic)
    ema_slope = f["ema20_slope"].to_numpy()
    rp = f["range_position_50"].to_numpy()
    comp = f["compression_score"].to_numpy()
    exp = f["expansion_score"].to_numpy()
    regime = np.full(n, 2)  # RANGE
    regime = np.where((ema_slope > 0.001) & (rp > 0.55), 0, regime)  # TREND_UP
    regime = np.where((ema_slope < -0.001) & (rp < 0.45), 1, regime)  # TREND_DOWN
    regime = np.where(comp > 0.55, 3, regime)  # COMPRESSION
    regime = np.where(exp > 1.2, 4, regime)  # EXPANSION
    regime = np.where((regime_vol >= 2) & (np.abs(ema_slope) < 0.0005), 5, regime)  # HIGH_VOL_CHOP
    f["market_regime"] = regime

    # candle analysis pack (from desk-style)
    f["candle_green"] = (c >= o).astype(float)
    f["rvol_20"] = f["volume_ratio_20"]
    f["adv_buy_pct"] = f["close_location"] * 100.0  # same proxy as research buyPct

    return f
