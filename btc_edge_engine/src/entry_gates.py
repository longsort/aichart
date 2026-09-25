"""레짐·세션·스윕·압축확장 게이트 — 모델 확률 위 하드 필터."""
from __future__ import annotations

import numpy as np
import pandas as pd

# market_regime: 0 TREND_UP, 1 TREND_DOWN, 2 RANGE, 3 COMPRESSION, 4 EXPANSION, 5 HIGH_VOL_CHOP
# session: 0 ASIA, 1 LONDON, 2 NY, 3 OVERLAP
# vol_regime: 0 LOW, 1 NORMAL, 2 HIGH, 3 EXTREME

SESSION_NAME = {0: "ASIA", 1: "LONDON", 2: "NY", 3: "OVERLAP"}
REGIME_NAME = {
    0: "TREND_UP",
    1: "TREND_DOWN",
    2: "RANGE",
    3: "COMPRESSION",
    4: "EXPANSION",
    5: "HIGH_VOL_CHOP",
}
VOL_NAME = {0: "LOW", 1: "NORMAL", 2: "HIGH", 3: "EXTREME"}


def sweep_reclaim_mask(feat: pd.DataFrame, side: str) -> np.ndarray:
    """스윕 후 회수: 롱=저점 스윕+종가 회복, 숏=고점 스윕+종가 회복."""
    n = len(feat)
    if side == "LONG":
        sweep = feat["sweep_long"].fillna(0).to_numpy(float) > 0.5 if "sweep_long" in feat else np.zeros(n)
        reclaim = (
            feat["reclaim_distance_atr_long"].fillna(0).to_numpy(float) > 0
            if "reclaim_distance_atr_long" in feat
            else np.ones(n, dtype=bool)
        )
        close_loc = feat["close_location"].fillna(0.5).to_numpy(float) if "close_location" in feat else np.full(n, 0.5)
        return (sweep & reclaim & (close_loc >= 0.45)).astype(bool)
    sweep = feat["sweep_short"].fillna(0).to_numpy(float) > 0.5 if "sweep_short" in feat else np.zeros(n)
    reclaim = (
        feat["reclaim_distance_atr_short"].fillna(0).to_numpy(float) > 0
        if "reclaim_distance_atr_short" in feat
        else np.ones(n, dtype=bool)
    )
    close_loc = feat["close_location"].fillna(0.5).to_numpy(float) if "close_location" in feat else np.full(n, 0.5)
    return (sweep & reclaim & (close_loc <= 0.55)).astype(bool)


def compression_expansion_mask(feat: pd.DataFrame) -> np.ndarray:
    """압축 후 확장 전환 후보 (현재 봉이 확장 쪽)."""
    n = len(feat)
    exp = feat["expansion_score"].fillna(0).to_numpy(float) if "expansion_score" in feat else np.zeros(n)
    comp = feat["compression_score"].fillna(0).to_numpy(float) if "compression_score" in feat else np.zeros(n)
    # 직전 압축 힌트 + 현재 확장
    prev_comp = np.roll(comp, 1)
    prev_comp[0] = 0
    return ((exp >= 0.8) | ((prev_comp >= 0.45) & (exp > 0.3))).astype(bool)


def session_mask(feat: pd.DataFrame, allowed: set[int] | list[int] | None) -> np.ndarray:
    n = len(feat)
    if not allowed:
        return np.ones(n, dtype=bool)
    s = feat["session"].fillna(-1).to_numpy(int) if "session" in feat else np.full(n, -1)
    return np.isin(s, list(allowed))


def regime_mask(feat: pd.DataFrame, allowed: set[int] | list[int] | None) -> np.ndarray:
    n = len(feat)
    if not allowed:
        return np.ones(n, dtype=bool)
    r = feat["market_regime"].fillna(-1).to_numpy(int) if "market_regime" in feat else np.full(n, -1)
    return np.isin(r, list(allowed))


def vol_regime_mask(feat: pd.DataFrame, forbidden: set[int] | list[int] | None = None) -> np.ndarray:
    """기본: EXTREME(3) 제외."""
    n = len(feat)
    v = feat["vol_regime"].fillna(1).to_numpy(int) if "vol_regime" in feat else np.full(n, 1)
    bad = set(forbidden) if forbidden is not None else {3}
    return ~np.isin(v, list(bad))


def combine_gates(
    feat: pd.DataFrame,
    side: str,
    *,
    sessions: set[int] | list[int] | None = None,
    regimes: set[int] | list[int] | None = None,
    require_sweep: bool = False,
    require_comp_exp: bool = False,
    forbid_vol: set[int] | list[int] | None = None,
) -> np.ndarray:
    m = np.ones(len(feat), dtype=bool)
    m &= session_mask(feat, sessions)
    m &= regime_mask(feat, regimes)
    m &= vol_regime_mask(feat, forbid_vol)
    if require_sweep:
        m &= sweep_reclaim_mask(feat, side)
    if require_comp_exp:
        m &= compression_expansion_mask(feat)
    return m


def score_gate_lift(
    feat: pd.DataFrame,
    y_clean: np.ndarray,
    p: np.ndarray,
    side: str,
    thr: float = 0.55,
) -> dict:
    """검증셋에서 세션/레짐별 CLEAN 리프트를 계산해 허용 집합 후보를 뽑는다."""
    base = p >= thr
    out = {"side": side, "thr": thr, "base_n": int(base.sum()), "sessions": {}, "regimes": {}}
    if base.sum() < 20:
        return out
    base_hit = float(y_clean[base].mean()) if base.sum() else 0.0
    out["base_clean_hit"] = base_hit
    sess = feat["session"].to_numpy(int)
    reg = feat["market_regime"].to_numpy(int)
    for s in sorted(set(sess.tolist())):
        m = base & (sess == s)
        if m.sum() < 15:
            continue
        hit = float(y_clean[m].mean())
        out["sessions"][int(s)] = {
            "name": SESSION_NAME.get(int(s), str(s)),
            "n": int(m.sum()),
            "clean_hit": hit,
            "lift_vs_base": hit / max(1e-9, base_hit),
        }
    for r in sorted(set(reg.tolist())):
        m = base & (reg == r)
        if m.sum() < 15:
            continue
        hit = float(y_clean[m].mean())
        out["regimes"][int(r)] = {
            "name": REGIME_NAME.get(int(r), str(r)),
            "n": int(m.sum()),
            "clean_hit": hit,
            "lift_vs_base": hit / max(1e-9, base_hit),
        }
    # 허용: lift >= 1.05 이고 n>=20, 없으면 상위 절반
    good_s = [k for k, v in out["sessions"].items() if v["lift_vs_base"] >= 1.05 and v["n"] >= 20]
    good_r = [k for k, v in out["regimes"].items() if v["lift_vs_base"] >= 1.05 and v["n"] >= 20]
    if not good_s and out["sessions"]:
        ranked = sorted(out["sessions"].items(), key=lambda kv: kv[1]["clean_hit"], reverse=True)
        good_s = [k for k, _ in ranked[: max(1, len(ranked) // 2)]]
    if not good_r and out["regimes"]:
        ranked = sorted(out["regimes"].items(), key=lambda kv: kv[1]["clean_hit"], reverse=True)
        good_r = [k for k, _ in ranked[: max(1, len(ranked) // 2)]]
    out["allowed_sessions"] = good_s
    out["allowed_regimes"] = good_r
    return out
