"""구조 판독 → 체결 방식(지정가/시장가) 선택.

시장가 맹진입 금지.
- 스윕·회귀·압축: 지정가(메이커)로 기다리는 쪽
- 확정 돌파·시간압박: 테이커(시장가/크로스) 허용
- 애매하면 WAIT
"""
from __future__ import annotations

from enum import Enum
from typing import Any

import numpy as np
import pandas as pd


class ExecMode(str, Enum):
    WAIT = "WAIT"
    LIMIT_MAKER = "LIMIT_MAKER"  # 지정가 · 대기 · 수수료↓
    LIMIT_JOIN = "LIMIT_JOIN"  # 스프레드 안쪽 참여
    MARKET_TAKER = "MARKET_TAKER"  # 시장가/크로스 · 빠른 대응


SESSION_KO = {0: "아시아", 1: "런던", 2: "뉴욕", 3: "오버랩"}
REGIME_KO = {
    0: "상승추세",
    1: "하락추세",
    2: "횡보",
    3: "압축",
    4: "확장",
    5: "고변동횡보",
}


def _f(row: pd.Series, key: str, default: float = 0.0) -> float:
    try:
        v = row.get(key, default)
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return default
        return float(v)
    except Exception:
        return default


def read_structure(row: pd.Series, side: str | None) -> dict[str, Any]:
    """단일 봉(확정) 구조 요약 — 인과 피처만."""
    session = int(_f(row, "session", -1))
    regime = int(_f(row, "market_regime", 2))
    atr = max(_f(row, "atr14_pct", 0.003), 1e-6)
    close_loc = _f(row, "close_location", 0.5)
    vol_z = _f(row, "volume_z_20", 0.0)
    sweep_l = _f(row, "sweep_long", 0) > 0.5
    sweep_s = _f(row, "sweep_short", 0) > 0.5
    recl_l = _f(row, "reclaim_distance_atr_long", 0) > 0
    recl_s = _f(row, "reclaim_distance_atr_short", 0) > 0
    bos_up = _f(row, "bos_up", 0) > 0.5
    bos_dn = _f(row, "bos_down", 0) > 0.5
    comp = _f(row, "compression_score", 0)
    exp = _f(row, "expansion_score", 0)
    upper = _f(row, "upper_wick_ratio", 0)
    lower = _f(row, "lower_wick_ratio", 0)
    vwap_dist = _f(row, "distance_to_vwap_20", 0)  # may be price frac
    # normalize if feat stores raw; atr-scale if large
    if abs(vwap_dist) > 0.05:
        vwap_atr = vwap_dist / atr
    else:
        vwap_atr = vwap_dist / atr if atr else 0.0

    tags: list[str] = []
    if sweep_l and recl_l:
        tags.append("스윕회수_롱")
    if sweep_s and recl_s:
        tags.append("스윕회수_숏")
    if bos_up:
        tags.append("BOS상승")
    if bos_dn:
        tags.append("BOS하락")
    if comp >= 0.45:
        tags.append("압축")
    if exp >= 0.8:
        tags.append("확장")
    if abs(vwap_atr) >= 1.5:
        tags.append("VWAP이탈")
    if vol_z >= 1.5:
        tags.append("거래량급증")

    return {
        "session": session,
        "sessionKo": SESSION_KO.get(session),
        "regime": regime,
        "regimeKo": REGIME_KO.get(regime),
        "atr_pct": atr,
        "close_location": close_loc,
        "volume_z": vol_z,
        "sweep_long": sweep_l,
        "sweep_short": sweep_s,
        "reclaim_long": recl_l,
        "reclaim_short": recl_s,
        "bos_up": bos_up,
        "bos_down": bos_dn,
        "compression": comp,
        "expansion": exp,
        "upper_wick": upper,
        "lower_wick": lower,
        "vwap_atr": vwap_atr,
        "tags": tags,
        "side_hint": side,
    }


def plan_execution(
    *,
    side: str | None,
    close: float,
    structure: dict[str, Any],
    sl_pct: float,
    tp1_pct: float,
    signal_school: str | None = None,
) -> dict[str, Any]:
    """
    구조에 맞는 체결 플랜.
    반환: execMode, entryType, limitPrice, invalidate, urgency, reasonKo
    """
    if not side or close <= 0:
        return {
            "execMode": ExecMode.WAIT.value,
            "entryType": None,
            "limitPrice": None,
            "workPrice": None,
            "invalidate": None,
            "urgency": 0,
            "feeBias": "maker",
            "reasonKo": "방향 없음 · 대기",
            "structureTags": structure.get("tags") or [],
        }

    atr = float(structure.get("atr_pct") or 0.003)
    tags = set(structure.get("tags") or [])
    vol_z = float(structure.get("volume_z") or 0)
    close_loc = float(structure.get("close_location") or 0.5)
    vwap_atr = float(structure.get("vwap_atr") or 0)
    lower = float(structure.get("lower_wick") or 0)
    upper = float(structure.get("upper_wick") or 0)

    # --- 기본: 지정가 우선 ---
    mode = ExecMode.LIMIT_MAKER
    urgency = 1
    fee_bias = "maker"
    reason = []

    # 1) 스윕 회수 / 윅 흡수 → 지정가로 되돌림 자리
    if side == "LONG" and ("스윕회수_롱" in tags or lower >= 0.55):
        mode = ExecMode.LIMIT_MAKER
        # 저가 쪽 되돌림: close - 0.15~0.35 ATR
        pull = close * (1 - max(0.001, atr * 0.25))
        limit = pull
        inv = close * (1 - sl_pct)
        reason.append("스윕/하단윅 · 지정가 대기")
        urgency = 2
    elif side == "SHORT" and ("스윕회수_숏" in tags or upper >= 0.55):
        mode = ExecMode.LIMIT_MAKER
        pull = close * (1 + max(0.001, atr * 0.25))
        limit = pull
        inv = close * (1 + sl_pct)
        reason.append("스윕/상단윅 · 지정가 대기")
        urgency = 2
    # 2) VWAP 회귀 학교 → 확장 끝에서 지정가
    elif signal_school == "desk_vwap_revert" or "VWAP이탈" in tags:
        mode = ExecMode.LIMIT_MAKER
        if side == "SHORT":
            # 살짝 위(더 비싼) 지정가에 걸어 평균회귀 진입
            limit = close * (1 + max(0.0005, atr * 0.15))
            inv = close * (1 + sl_pct)
            reason.append("VWAP회귀 · 위쪽 지정가")
        else:
            limit = close * (1 - max(0.0005, atr * 0.15))
            inv = close * (1 - sl_pct)
            reason.append("VWAP회귀 · 아래쪽 지정가")
        urgency = 2
    # 3) 압축→확장 + 거래량 + BOS = 빠른 대응(테이커 허용)
    elif ("확장" in tags or "BOS상승" in tags or "BOS하락" in tags) and vol_z >= 1.2:
        # 방향과 BOS 일치할 때만 시장가
        bos_ok = (side == "LONG" and structure.get("bos_up")) or (side == "SHORT" and structure.get("bos_down"))
        if bos_ok and ((side == "LONG" and close_loc >= 0.6) or (side == "SHORT" and close_loc <= 0.4)):
            mode = ExecMode.MARKET_TAKER
            limit = close  # 참조가
            inv = close * (1 - sl_pct) if side == "LONG" else close * (1 + sl_pct)
            reason.append("BOS+거래량 · 빠른 테이커")
            fee_bias = "taker"
            urgency = 4
        else:
            mode = ExecMode.LIMIT_JOIN
            limit = close  # mid 참여
            inv = close * (1 - sl_pct) if side == "LONG" else close * (1 + sl_pct)
            reason.append("돌파 미확정 · 스프레드 안쪽 지정가")
            urgency = 3
    # 4) 압축만 / 횡보 → 대기 또는 아주 수동 지정가
    elif "압축" in tags and "확장" not in tags:
        mode = ExecMode.WAIT
        limit = None
        inv = None
        reason.append("압축구간 · 확장 전 대기")
        urgency = 0
    else:
        # 기본 풀백 지정가
        mode = ExecMode.LIMIT_MAKER
        if side == "LONG":
            limit = close * (1 - max(0.0008, atr * 0.2))
            inv = close * (1 - sl_pct)
        else:
            limit = close * (1 + max(0.0008, atr * 0.2))
            inv = close * (1 + sl_pct)
        reason.append("기본 · 되돌림 지정가")
        urgency = 2

    # 지정가 타임아웃: 긴급도 높을수록 짧게
    timeout_bars = {0: 0, 1: 8, 2: 6, 3: 4, 4: 2}.get(urgency, 4)
    tp = close * (1 + tp1_pct) if side == "LONG" else close * (1 - tp1_pct)

    if mode == ExecMode.WAIT:
        return {
            "execMode": mode.value,
            "entryType": None,
            "limitPrice": None,
            "workPrice": close,
            "invalidate": None,
            "takeProfit1": None,
            "timeoutBars": 0,
            "urgency": urgency,
            "feeBias": "maker",
            "reasonKo": " · ".join(reason) if reason else "대기",
            "structureTags": list(tags),
            "autoTrade": False,
        }

    return {
        "execMode": mode.value,
        "entryType": "limit" if mode != ExecMode.MARKET_TAKER else "market",
        "limitPrice": float(limit) if limit is not None else None,
        "workPrice": float(close),
        "invalidate": float(inv) if inv is not None else None,
        "takeProfit1": float(tp),
        "timeoutBars": timeout_bars,
        "urgency": urgency,
        "feeBias": fee_bias,
        "reasonKo": " · ".join(reason),
        "structureTags": list(tags),
        "autoTrade": True,  # 페이퍼/암 허용 플래그 (실주문은 별도)
        "side": side,
        "playbookKo": _playbook(mode, side),
    }


def _playbook(mode: ExecMode, side: str) -> str:
    if mode == ExecMode.LIMIT_MAKER:
        return f"{side} · 지정가 대기 · 미체결 시 타임아웃 취소 · 메이커 우선"
    if mode == ExecMode.LIMIT_JOIN:
        return f"{side} · 스프레드 안쪽 지정가 · 부분체결 허용"
    if mode == ExecMode.MARKET_TAKER:
        return f"{side} · 구조 확정 시 즉시 테이커 · 슬리피지 감수"
    return "대기"


def plan_from_feature_row(
    feat_row: pd.Series,
    ohlc_row: pd.Series,
    side: str | None,
    sl_pct: float,
    tp1_pct: float,
    signal_school: str | None = None,
) -> dict[str, Any]:
    st = read_structure(feat_row, side)
    close = float(ohlc_row.get("close") or feat_row.get("close") or 0)
    plan = plan_execution(
        side=side,
        close=close,
        structure=st,
        sl_pct=sl_pct,
        tp1_pct=tp1_pct,
        signal_school=signal_school,
    )
    plan["structure"] = {
        "sessionKo": st.get("sessionKo"),
        "regimeKo": st.get("regimeKo"),
        "tags": st.get("tags"),
        "volume_z": st.get("volume_z"),
        "vwap_atr": st.get("vwap_atr"),
    }
    return plan
