"""자율 시그널 패밀리 — 사용자 지시 없이 여러 매매학교 규칙을 생성.

학교/출처 아이디어(교과서·실전 공통, 리페인트 없는 인과 규칙만):
- US/SMAs: 추세 눌림(EMA pullback)
- UK/FX session: 런던·NY 돌파/페이드
- JP: 레인지 돌파(ORB 유사), 압축→확장
- Crypto desk: VWAP 회귀, 스윕 회수
- Vol targeting: ATR 손절·레버 적응
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def _ema(x: np.ndarray, span: int) -> np.ndarray:
    return pd.Series(x).ewm(span=span, adjust=False).mean().to_numpy()


def _sma(x: np.ndarray, w: int) -> np.ndarray:
    return pd.Series(x).rolling(w, min_periods=w).mean().to_numpy()


def _atr(h, l, c, n=14) -> np.ndarray:
    prev = np.roll(c, 1)
    prev[0] = c[0]
    tr = np.maximum(h - l, np.maximum(np.abs(h - prev), np.abs(l - prev)))
    return pd.Series(tr).rolling(n, min_periods=n).mean().to_numpy()


def build_school_signals(ohlc: pd.DataFrame, feat: pd.DataFrame | None = None) -> dict[str, np.ndarray]:
    """각 키 = 시그널명, 값 = +1 LONG / -1 SHORT / 0 flat (봉 종가 확정)."""
    o = ohlc["open"].to_numpy(float)
    h = ohlc["high"].to_numpy(float)
    l = ohlc["low"].to_numpy(float)
    c = ohlc["close"].to_numpy(float)
    v = ohlc["volume"].to_numpy(float) if "volume" in ohlc else np.ones(len(c))
    n = len(c)
    ts = pd.to_datetime(ohlc["timestamp"], unit="ms", utc=True)
    hour = ts.dt.hour.to_numpy()
    # session buckets UTC
    asia = (hour >= 0) & (hour < 7)
    london = (hour >= 7) & (hour < 13)
    ny = (hour >= 13) & (hour < 21)
    overlap = (hour >= 12) & (hour < 16)

    atr = _atr(h, l, c, 14)
    atr_pct = atr / np.maximum(c, 1e-12)
    ema20 = _ema(c, 20)
    ema50 = _ema(c, 50)
    ema200 = _ema(c, 200)
    vwap = (_sma(c * v, 20) / np.maximum(_sma(v, 20), 1e-12))
    vol_ma = _sma(v, 20)
    vol_z = (v - vol_ma) / np.maximum(pd.Series(v).rolling(20).std().to_numpy(), 1e-12)

    # rolling Asia range (00-07) high/low — causal: prior completed asia day
    # approximate with rolling 28 bars (7h) overnight window ending before London
    asia_hi = pd.Series(np.where(asia, h, np.nan)).reindex(range(n)).ffill()
    # simpler: rolling 28-bar high/low as "overnight proxy"
    roll_hi = pd.Series(h).rolling(28, min_periods=10).max().shift(1).to_numpy()
    roll_lo = pd.Series(l).rolling(28, min_periods=10).min().shift(1).to_numpy()
    # opening range first 4 bars of London (07-08 UTC)
    # ORB: first hour London high/low fixed for the day — causal within day after bar 4 of London
    day = ts.dt.floor("D")
    orb_hi = np.full(n, np.nan)
    orb_lo = np.full(n, np.nan)
    for d, idx in day.groupby(day).groups.items():
        idx = list(idx)
        # london bars of that day
        loc = [i for i in idx if 7 <= hour[i] < 8]
        if len(loc) >= 2:
            hi0 = np.max(h[loc[:4]]) if len(loc) >= 4 else np.max(h[loc])
            lo0 = np.min(l[loc[:4]]) if len(loc) >= 4 else np.min(l[loc])
            for i in idx:
                if hour[i] >= 8:  # only after ORB formed
                    orb_hi[i] = hi0
                    orb_lo[i] = lo0

    rng = np.maximum(h - l, 1e-12)
    upper_wick = (h - np.maximum(o, c)) / rng
    lower_wick = (np.minimum(o, c) - l) / rng
    body = np.abs(c - o) / rng

    # compression: ATR percentile low
    atr_p = pd.Series(atr_pct).rolling(100, min_periods=50).apply(
        lambda x: pd.Series(x).rank(pct=True).iloc[-1], raw=False
    ).to_numpy()
    # faster approx
    atr_p = pd.Series(atr_pct).rolling(100, min_periods=30).apply(
        lambda x: (x[-1] - np.nanmin(x)) / (np.nanmax(x) - np.nanmin(x) + 1e-12), raw=True
    ).to_numpy()

    sigs: dict[str, np.ndarray] = {}

    # 1) US trend pullback — long only in uptrend on dip to ema20
    long_pb = (ema20 > ema50) & (c > ema200) & (l <= ema20) & (c > ema20) & (c > o)
    short_pb = (ema20 < ema50) & (c < ema200) & (h >= ema20) & (c < ema20) & (c < o)
    s = np.zeros(n)
    s[long_pb] = 1
    s[short_pb] = -1
    sigs["us_ema_pullback"] = s

    # 2) UK/FX London break of overnight range
    s = np.zeros(n)
    s[london & (c > roll_hi) & (vol_z > 0.5)] = 1
    s[london & (c < roll_lo) & (vol_z > 0.5)] = -1
    sigs["uk_london_break"] = s

    # 3) London break fade (false break) — close back inside
    s = np.zeros(n)
    prev_break_up = np.roll(c > roll_hi, 1)
    prev_break_dn = np.roll(c < roll_lo, 1)
    prev_break_up[0] = False
    prev_break_dn[0] = False
    s[london & prev_break_up & (c < roll_hi) & (lower_wick > 0.3)] = -1  # fade up-break
    s[london & prev_break_dn & (c > roll_lo) & (upper_wick > 0.3)] = 1
    sigs["uk_london_fade"] = s

    # 4) NY open drive / first 2h momentum
    s = np.zeros(n)
    s[ny & (hour < 16) & (c > ema20) & (c > o) & (vol_z > 1.0)] = 1
    s[ny & (hour < 16) & (c < ema20) & (c < o) & (vol_z > 1.0)] = -1
    sigs["us_ny_drive"] = s

    # 5) NY fade of morning move (mean reversion after 16 UTC)
    ret_from_ny = c / np.where(True, pd.Series(c).where(hour == 13).ffill().to_numpy(), c) - 1
    # simpler: revert if extended from ema20 in NY afternoon
    s = np.zeros(n)
    ext = (c - ema20) / np.maximum(atr, 1e-12)
    s[(hour >= 16) & (hour < 20) & (ext > 1.5) & (c < o)] = -1
    s[(hour >= 16) & (hour < 20) & (ext < -1.5) & (c > o)] = 1
    sigs["us_ny_fade"] = s

    # 6) JP-style ORB break
    s = np.zeros(n)
    valid = np.isfinite(orb_hi) & np.isfinite(orb_lo)
    s[valid & (c > orb_hi) & (vol_z > 0.3)] = 1
    s[valid & (c < orb_lo) & (vol_z > 0.3)] = -1
    sigs["jp_orb_break"] = s

    # 7) Compression → expansion break
    s = np.zeros(n)
    comp = atr_p < 0.25
    prev_comp = np.roll(comp, 1)
    prev_comp[0] = False
    expand = (h - l) > 1.5 * atr
    s[prev_comp & expand & (c > o) & (c > ema20)] = 1
    s[prev_comp & expand & (c < o) & (c < ema20)] = -1
    sigs["jp_compress_expand"] = s

    # 8) VWAP mean reversion (crypto desk)
    dist = (c - vwap) / np.maximum(atr, 1e-12)
    s = np.zeros(n)
    s[(dist < -1.8) & (c > o) & (lower_wick > 0.4)] = 1
    s[(dist > 1.8) & (c < o) & (upper_wick > 0.4)] = -1
    sigs["desk_vwap_revert"] = s

    # 9) Sweep reclaim (if feat available)
    s = np.zeros(n)
    if feat is not None and "sweep_long" in feat.columns:
        sw_l = feat["sweep_long"].fillna(0).to_numpy(float) > 0.5
        sw_s = feat["sweep_short"].fillna(0).to_numpy(float) > 0.5
        recl_l = feat.get("reclaim_distance_atr_long", pd.Series(np.ones(n))).fillna(0).to_numpy(float) > 0
        recl_s = feat.get("reclaim_distance_atr_short", pd.Series(np.ones(n))).fillna(0).to_numpy(float) > 0
        s[sw_l & recl_l & (c > o)] = 1
        s[sw_s & recl_s & (c < o)] = -1
    else:
        # proxy: long lower wick + close green near highs
        s[(lower_wick > 0.6) & (c > o) & (body < 0.4) & (vol_z > 0.5)] = 1
        s[(upper_wick > 0.6) & (c < o) & (body < 0.4) & (vol_z > 0.5)] = -1
    sigs["desk_sweep_reclaim"] = s

    # 10) Overlap liquidity grab fade
    s = np.zeros(n)
    s[overlap & (lower_wick > 0.55) & (c > o) & (vol_z > 1.0)] = 1
    s[overlap & (upper_wick > 0.55) & (c < o) & (vol_z > 1.0)] = -1
    sigs["fx_overlap_grab"] = s

    # 11) RSI-ish without RSI: consecutive closes extreme then reverse
    up = (c > np.roll(c, 1)).astype(float)
    up[0] = 0
    streak_up = pd.Series(up).rolling(5).sum().to_numpy()
    streak_dn = pd.Series(1 - up).rolling(5).sum().to_numpy()
    s = np.zeros(n)
    s[(streak_dn >= 4) & (c > o) & (c > ema20)] = 1
    s[(streak_up >= 4) & (c < o) & (c < ema20)] = -1
    sigs["meanrev_streak"] = s

    # 12) Trend continuation after BOS proxy
    hh = pd.Series(h).rolling(20).max().shift(1).to_numpy()
    ll = pd.Series(l).rolling(20).min().shift(1).to_numpy()
    s = np.zeros(n)
    s[(c > hh) & (ema20 > ema50) & (vol_z > 0.8)] = 1
    s[(c < ll) & (ema20 < ema50) & (vol_z > 0.8)] = -1
    sigs["bos_continuation"] = s

    # drop first warmup
    for k in sigs:
        sigs[k] = sigs[k].astype(np.int8)
        sigs[k][:250] = 0
    return sigs
