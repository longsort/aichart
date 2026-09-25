"""5분 감지 → 15분 확정 게이트 (리페인트 금지: 15분 마감 전에 끝난 5분만 사용)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def load_5m_csv(path) -> pd.DataFrame:
    df = pd.read_csv(path)
    colmap = {
        "time_ms": "timestamp",
        "time": "timestamp",
        "volume_base": "volume",
        "volume_quote": "quote_volume",
    }
    df = df.rename(columns={c: colmap.get(c, c) for c in df.columns})
    ts = df["timestamp"].astype(np.int64)
    if ts.median() < 1e12:
        ts = ts * 1000
    df["timestamp"] = ts
    for c in ["open", "high", "low", "close", "volume"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.drop_duplicates("timestamp").sort_values("timestamp").reset_index(drop=True)
    return df


def build_5m_alerts(df5: pd.DataFrame) -> pd.DataFrame:
    """인과 5분 알림 피처. expanding/rolling만 사용."""
    d = df5.copy()
    o, h, l, c, v = d["open"].to_numpy(float), d["high"].to_numpy(float), d["low"].to_numpy(float), d["close"].to_numpy(float), d["volume"].to_numpy(float)
    rng = np.maximum(h - l, 1e-12)
    upper_wick = (h - np.maximum(o, c)) / rng
    lower_wick = (np.minimum(o, c) - l) / rng
    body = np.abs(c - o) / rng
    vol_ma = pd.Series(v).rolling(20, min_periods=20).mean().to_numpy()
    vol_std = pd.Series(v).rolling(20, min_periods=20).std().to_numpy()
    vol_z = (v - vol_ma) / np.maximum(vol_std, 1e-12)
    # 직전 20봉 ATR 근사
    tr = np.maximum(h - l, np.maximum(np.abs(h - np.roll(c, 1)), np.abs(l - np.roll(c, 1))))
    tr[0] = h[0] - l[0]
    atr = pd.Series(tr).rolling(14, min_periods=14).mean().to_numpy()
    atr_pct = atr / np.maximum(c, 1e-12)

    # 알림: 거래량 폭증 or 긴 윅
    vol_spike = vol_z >= 2.0
    long_lower = (lower_wick >= 0.55) & (body <= 0.45)
    long_upper = (upper_wick >= 0.55) & (body <= 0.45)
    range_exp = (h - l) / np.maximum(atr, 1e-12) >= 1.8

    d["vol_z20"] = vol_z
    d["upper_wick"] = upper_wick
    d["lower_wick"] = lower_wick
    d["atr_pct"] = atr_pct
    d["alert_vol"] = vol_spike.astype(np.int8)
    d["alert_wick_long"] = long_lower.astype(np.int8)  # 롱 후보 윅
    d["alert_wick_short"] = long_upper.astype(np.int8)
    d["alert_range"] = range_exp.astype(np.int8)
    d["alert_any"] = ((vol_spike) | (long_lower) | (long_upper) | (range_exp)).astype(np.int8)
    d["alert_long"] = ((vol_spike & long_lower) | (long_lower & range_exp) | (vol_spike & (c >= o))).astype(np.int8)
    d["alert_short"] = ((vol_spike & long_upper) | (long_upper & range_exp) | (vol_spike & (c < o))).astype(np.int8)
    return d


def aggregate_alerts_to_15m(df5_alerts: pd.DataFrame, ts15_ms: np.ndarray) -> pd.DataFrame:
    """
    각 15분 봉 [t, t+15m) 안에서, **종가 이전**에 끝난 5분 봉만 집계.
    15분 봉 timestamp = 봉 시작시각이라고 가정 (엔진 OHLC와 동일).
    리페인트 금지: 15분 마감 시각 이후 5분은 사용하지 않음.
    """
    t5 = df5_alerts["timestamp"].to_numpy(np.int64)
    bar_ms = 15 * 60 * 1000
    # 5분 봉을 소속 15분 시작으로 매핑
    bucket = (t5 // bar_ms) * bar_ms
    # 5분 봉이 15분 마감 전에 완전히 끝났는지: 5분 시작 + 5m <= 15분 시작 + 15m
    # (= 항상 true for bars in bucket). 실시간에서는 '현재 진행중 5분' 제외가 중요.
    # 백테스트에서는 완료된 5분만 있으므로 OK. 다만 15분 종가 시점 확정이므로
    # 해당 버킷의 5분 3개 모두 사용 가능 (마감 시점에 전부 확정).

    g = df5_alerts.copy()
    g["bucket"] = bucket
    agg = g.groupby("bucket", sort=True).agg(
        alert_any=("alert_any", "max"),
        alert_vol=("alert_vol", "max"),
        alert_long=("alert_long", "max"),
        alert_short=("alert_short", "max"),
        alert_wick_long=("alert_wick_long", "max"),
        alert_wick_short=("alert_wick_short", "max"),
        alert_range=("alert_range", "max"),
        max_vol_z=("vol_z20", "max"),
        n5=("alert_any", "count"),
    )
    # align to 15m index
    out = pd.DataFrame({"timestamp": ts15_ms.astype(np.int64)})
    out = out.merge(agg.reset_index().rename(columns={"bucket": "timestamp"}), on="timestamp", how="left")
    for c in ["alert_any", "alert_vol", "alert_long", "alert_short", "alert_wick_long", "alert_wick_short", "alert_range"]:
        out[c] = out[c].fillna(0).astype(np.int8)
    out["max_vol_z"] = out["max_vol_z"].fillna(0.0)
    out["n5"] = out["n5"].fillna(0).astype(np.int16)
    out["has_5m"] = (out["n5"] > 0).astype(np.int8)
    return out
