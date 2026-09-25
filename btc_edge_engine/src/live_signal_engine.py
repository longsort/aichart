"""페이퍼/라이브 신호 — 클린모델 + 검증된 레버·게이트만 (50배 고정 금지)."""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .entry_gates import REGIME_NAME, SESSION_NAME, combine_gates
from .feature_engine import build_features
from .m5_confirm import aggregate_alerts_to_15m, build_5m_alerts, load_5m_csv
from .structure_execution import plan_from_feature_row
from .utils import ENGINE_ROOT, load_config, utc_now_iso, write_json

SESSION_KO = {0: "아시아", 1: "런던", 2: "뉴욕", 3: "오버랩"}
REGIME_KO = {
    0: "상승추세",
    1: "하락추세",
    2: "횡보",
    3: "압축",
    4: "확장",
    5: "고변동횡보",
}

ACTIVE_MODE_PATH = ENGINE_ROOT / "outputs" / "thresholds" / "active_mode.json"
PAPER_M5_PATH = ENGINE_ROOT / "outputs" / "thresholds" / "paper_survival_m5_v1.json"
PAPER_V1_PATH = ENGINE_ROOT / "outputs" / "thresholds" / "paper_survival_v1.json"
JOURNAL_PATH = ENGINE_ROOT / "outputs" / "trades" / "paper_journal.jsonl"


def load_active_mode() -> dict:
    """승격된 페이퍼 설정을 active_mode로 로드. 없으면 대기 모드."""
    if ACTIVE_MODE_PATH.exists():
        return json.loads(ACTIVE_MODE_PATH.read_text(encoding="utf-8"))
    for p in (PAPER_M5_PATH, PAPER_V1_PATH):
        if p.exists():
            raw = json.loads(p.read_text(encoding="utf-8"))
            if raw.get("promote_to_paper"):
                return normalize_active_mode(raw, source=str(p.name))
    return {
        "promote_to_paper": False,
        "real_order": False,
        "leverage_policy": "validated_only",
        "status_default": "WAIT",
        "reason": "no_promoted_config",
    }


def normalize_active_mode(raw: dict, source: str = "") -> dict:
    """연구 JSON → 신호 엔진용 정규화. 레버는 검증값만, 50배 강제 없음."""
    best = raw.get("best_val") or {}
    lev = float(raw.get("leverage") or best.get("leverage") or 10)
    # 안전: 연구 통과 상한 (현재 정책 ≤10). 나중에 Val이 20을 통과하면 active에 명시적으로 올림.
    max_lev = float(raw.get("max_leverage_allowed") or 10)
    lev = min(lev, max_lev)
    return {
        "promote_to_paper": bool(raw.get("promote_to_paper")),
        "real_order": False,  # 실주문은 별도 플래그·수동 승인
        "leverage_policy": "validated_only",
        "fixed_50x": False,
        "mode": raw.get("mode") or "survival_clean",
        "source": source or raw.get("source"),
        "side_bias": raw.get("side") or best.get("side"),  # 연구상 주력 사이드(필터 아님)
        "leverage": lev,
        "max_leverage_allowed": max_lev,
        "threshold": float(raw.get("threshold") or best.get("threshold") or 0.55),
        "sl_pct": float(raw.get("sl_pct") or best.get("sl_pct") or 0.006),
        "sl_mode": raw.get("sl_mode") or best.get("sl_mode") or "fixed_pct",
        "tp1_pct": float(raw.get("tp1_pct") or best.get("tp1_pct") or 0.004),
        "hold_bars": int(raw.get("hold_bars") or best.get("hold") or 24),
        "m5": raw.get("m5") or best.get("m5") or "none",
        "sessions": raw.get("sessions") if "sessions" in raw else best.get("sessions"),
        "regimes": raw.get("regimes") if "regimes" in raw else best.get("regimes"),
        "forbid_vol_regimes": raw.get("forbid_vol_regimes") or [3],
        "min_direction_gap": float(raw.get("min_direction_gap") or 0.05),
        "oos_net_ev": (raw.get("oos") or {}).get("net_ev"),
        "oos_max_dd": (raw.get("oos") or {}).get("max_dd"),
        "oos_n": (raw.get("oos") or {}).get("n"),
    }


def write_active_mode_from_paper(prefer_m5: bool = True) -> dict:
    path = PAPER_M5_PATH if prefer_m5 and PAPER_M5_PATH.exists() else PAPER_V1_PATH
    if not path.exists():
        mode = load_active_mode()
        write_json(ACTIVE_MODE_PATH, mode)
        return mode
    raw = json.loads(path.read_text(encoding="utf-8"))
    mode = normalize_active_mode(raw, source=path.name)
    write_json(ACTIVE_MODE_PATH, mode)
    return mode


def load_clean_bundles() -> dict:
    out = {}
    for side in ("long", "short"):
        p = ENGINE_ROOT / "outputs" / "models" / f"clean_{side}_model.joblib"
        if p.exists():
            out[side.upper()] = joblib.load(p)
    return out


def _m5_mask_for_last(m5_row: pd.Series | None, side: str, mode: str) -> tuple[bool, str]:
    if mode in (None, "none", ""):
        return True, ""
    if m5_row is None or int(m5_row.get("has_5m", 0) or 0) <= 0:
        return False, "5분데이터없음"
    if mode == "any":
        ok = int(m5_row.get("alert_any", 0) or 0) > 0
        return ok, ("" if ok else "5분알림없음")
    if mode == "vol":
        ok = int(m5_row.get("alert_vol", 0) or 0) > 0
        return ok, ("" if ok else "5분거래량알림없음")
    if mode == "side":
        col = "alert_long" if side == "LONG" else "alert_short"
        ok = int(m5_row.get(col, 0) or 0) > 0
        return ok, ("" if ok else "5분방향알림없음")
    if mode == "side_vol":
        col = "alert_long" if side == "LONG" else "alert_short"
        ok = int(m5_row.get(col, 0) or 0) > 0 and int(m5_row.get("alert_vol", 0) or 0) > 0
        return ok, ("" if ok else "5분방향+거래량알림없음")
    return True, ""


def _load_m5_confirm_row(ts15: int) -> pd.Series | None:
    """15분 봉에 정렬된 5분 확정 행. 캐시 parquet 우선, 없으면 raw 5m."""
    cache = ENGINE_ROOT / "data" / "features" / "m5_confirm_15m.parquet"
    if cache.exists():
        m5 = pd.read_parquet(cache)
        hit = m5[m5["timestamp"] == ts15]
        if len(hit):
            return hit.iloc[-1]
    # fallback: recent cleaned/raw 5m
    for path in (
        ENGINE_ROOT / "data" / "cleaned" / "BTCUSDT_5m.parquet",
        ENGINE_ROOT / "data" / "raw" / "BTCUSDT_5m.csv",
    ):
        if not path.exists():
            continue
        if path.suffix == ".parquet":
            df5 = pd.read_parquet(path)
        else:
            df5 = load_5m_csv(path)
        # last ~2 days around ts
        lo = ts15 - 2 * 24 * 60 * 60 * 1000
        hi = ts15 + 15 * 60 * 1000
        df5 = df5[(df5["timestamp"] >= lo) & (df5["timestamp"] <= hi)].reset_index(drop=True)
        if df5.empty:
            continue
        alerts = build_5m_alerts(df5)
        agg = aggregate_alerts_to_15m(alerts, np.array([ts15], dtype=np.int64))
        return agg.iloc[-1]
    return None


def append_paper_journal(row: dict) -> None:
    JOURNAL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with JOURNAL_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")


def signal_from_frame(
    ohlc: pd.DataFrame,
    best_config: dict | None = None,
    *,
    append_journal: bool = True,
) -> dict:
    """
    15분 OHLC 프레임 마지막 봉 기준 신호.
    - 클린 롱/숏 확률
    - active_mode의 세션·레짐·5분 게이트
    - 레버 = 검증된 값만 (고정 50배 없음)
    - real_order 항상 False (페이퍼)
    """
    cfg = load_config()
    mode = best_config or load_active_mode()
    if not mode.get("promote_to_paper"):
        out = {
            "status": "WAIT",
            "statusKo": "대기",
            "reason": mode.get("reason") or "페이퍼승격설정없음",
            "reasonKo": "검증 통과 설정 없음",
            "real_order": False,
            "leverage_policy": "validated_only",
            "updatedAt": utc_now_iso(),
        }
        write_json(ENGINE_ROOT / "outputs" / "reports" / "latest_live_signal.json", out)
        return out

    feat = build_features(ohlc, swing_k=int(cfg.get("swing_k", 3)), eq_atr_tol=float(cfg.get("eq_atr_tol", 0.15)))
    bundles = load_clean_bundles()
    if not bundles:
        out = {
            "status": "WAIT",
            "statusKo": "대기",
            "reason": "clean_models_missing",
            "reasonKo": "클린모델 없음",
            "real_order": False,
            "updatedAt": utc_now_iso(),
        }
        write_json(ENGINE_ROOT / "outputs" / "reports" / "latest_live_signal.json", out)
        return out

    row = feat.iloc[[-1]]
    ts = int(ohlc["timestamp"].iloc[-1])
    session = int(row["session"].iloc[0]) if "session" in row else None
    regime = int(row["market_regime"].iloc[0]) if "market_regime" in row else None
    atr_pct = float(row["atr14_pct"].iloc[0]) if "atr14_pct" in row else None

    probs = {}
    for side, b in bundles.items():
        cols = b["cols"]
        # missing cols → 0 fill
        x = row.reindex(columns=cols, fill_value=0.0)
        probs[side] = float(b["model"].predict_proba(x)[:, 1][0])
    p_long = probs.get("LONG", 0.0)
    p_short = probs.get("SHORT", 0.0)
    gap = abs(p_long - p_short)
    thr = float(mode.get("threshold", 0.55))
    min_gap = float(mode.get("min_direction_gap", 0.05))

    selected = None
    status = "WAIT"
    reasons: list[str] = []

    if gap < min_gap:
        reasons.append("롱·숏 확률 차이 작음")
    elif p_long >= thr and p_long > p_short:
        selected = "LONG"
    elif p_short >= thr and p_short > p_long:
        selected = "SHORT"
    else:
        reasons.append("클린확률 임계 미달")

    # 세션·레짐 게이트
    if selected:
        sess_ok = True
        reg_ok = True
        allowed_s = mode.get("sessions")
        allowed_r = mode.get("regimes")
        if allowed_s is not None and session is not None and session not in set(allowed_s):
            sess_ok = False
            reasons.append(f"세션비허용({SESSION_KO.get(session, session)})")
        if allowed_r is not None and regime is not None and regime not in set(allowed_r):
            reg_ok = False
            reasons.append(f"레짐비허용({REGIME_KO.get(regime, regime)})")
        forbid_v = set(mode.get("forbid_vol_regimes") or [])
        vol_reg = int(row["vol_regime"].iloc[0]) if "vol_regime" in row else None
        if vol_reg is not None and vol_reg in forbid_v:
            reasons.append("변동성레짐비허용")
            sess_ok = False
        if not (sess_ok and reg_ok):
            selected = None

    # 5분 확정
    m5_row = _load_m5_confirm_row(ts)
    if selected:
        ok, why = _m5_mask_for_last(m5_row, selected, str(mode.get("m5") or "none"))
        if not ok:
            reasons.append(why or "5분확정실패")
            selected = None

    if selected:
        status = f"{selected}_SIGNAL"

    # SL: atr mode면 현재 ATR 배수
    sl_pct = float(mode.get("sl_pct", 0.006))
    sl_mode = str(mode.get("sl_mode") or "fixed_pct")
    if sl_mode.startswith("atr_x") and atr_pct and atr_pct > 0:
        try:
            am = float(sl_mode.replace("atr_x", ""))
            sl_pct = float(np.clip(atr_pct * am, 0.003, 0.020))
        except ValueError:
            pass
    tp1 = float(mode.get("tp1_pct", 0.004))
    lev = float(mode.get("leverage", 10))
    # 적응형: 설정 상한 초과 금지
    lev = min(lev, float(mode.get("max_leverage_allowed", lev)))

    # 구조 → 지정가/시장가 플랜 (맹목 시장가 진입 금지)
    close_px = float(ohlc["close"].iloc[-1])
    exec_plan = plan_from_feature_row(
        row.iloc[0],
        ohlc.iloc[-1],
        selected if status != "WAIT" else None,
        sl_pct,
        tp1,
        signal_school=str(mode.get("school") or mode.get("mode") or ""),
    )
    # 신호가 있어도 구조가 WAIT이면 진입 보류
    if selected and exec_plan.get("execMode") == "WAIT":
        status = "WAIT"
        reasons.append(exec_plan.get("reasonKo") or "구조상 대기")
        selected = None

    status_ko = {
        "WAIT": "대기",
        "LONG_SIGNAL": "롱 후보(페이퍼)",
        "SHORT_SIGNAL": "숏 후보(페이퍼)",
    }.get(status, status)

    out = {
        "timestamp": ts,
        "updatedAt": utc_now_iso(),
        "status": status,
        "statusKo": status_ko,
        "reasonKo": " · ".join(reasons) if reasons else ("게이트통과" if selected else "대기"),
        "long_probability": round(p_long, 6),
        "short_probability": round(p_short, 6),
        "cleanProbLong": round(p_long, 6),
        "cleanProbShort": round(p_short, 6),
        "direction_gap": round(gap, 6),
        "selected_side": selected,
        "leverage": lev,
        "leverage_policy": mode.get("leverage_policy") or "validated_only",
        "fixed_50x": False,
        "selected_sl": sl_pct,
        "selected_tp1": tp1,
        "hold_bars": int(mode.get("hold_bars", 24)),
        "sl_mode": sl_mode,
        "m5": mode.get("m5"),
        "m5_alert_any": int(m5_row["alert_any"]) if m5_row is not None and "alert_any" in m5_row else None,
        "regime": regime,
        "regimeKo": REGIME_KO.get(regime) if regime is not None else None,
        "session": session,
        "sessionKo": SESSION_KO.get(session) if session is not None else None,
        "threshold": thr,
        "oos_net_ev": mode.get("oos_net_ev"),
        "oos_max_dd": mode.get("oos_max_dd"),
        "oos_n": mode.get("oos_n"),
        "close": close_px,
        "execution": exec_plan,
        "execMode": exec_plan.get("execMode"),
        "entryType": exec_plan.get("entryType"),
        "limitPrice": exec_plan.get("limitPrice"),
        "invalidate": exec_plan.get("invalidate"),
        "feeBias": exec_plan.get("feeBias"),
        "playbookKo": exec_plan.get("playbookKo"),
        "real_order": False,
        "paper_only": True,
        "mode": mode.get("mode"),
        "source": mode.get("source"),
        "noteKo": "구조판독→지정가/시장가 · 페이퍼만 · 실주문 OFF · 맹목 시장가 금지",
    }
    write_json(ENGINE_ROOT / "outputs" / "reports" / "latest_live_signal.json", out)
    if append_journal:
        append_paper_journal(out)
    return out
