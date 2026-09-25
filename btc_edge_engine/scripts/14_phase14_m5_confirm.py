#!/usr/bin/env python3
"""4단계: 5분 감지 → 15분 확정 게이트를 페이퍼 후보에 결합해 Val→OOS 재평가."""
from __future__ import annotations

import itertools
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.entry_gates import REGIME_NAME, SESSION_NAME, combine_gates
from src.survival_exit import run_survival_on_mask
from src.utils import ensure_dirs, load_config, write_json
from src.walk_forward import time_ordered_splits


def main():
    ensure_dirs()
    cfg = load_config()
    fees = cfg["fees"]
    slip = float(fees.get("default_slippage_bps", 2))
    entry_fee = fees["taker_fee"]
    exit_fee = fees["taker_fee"]

    ohlc = pd.read_parquet(ROOT / "data/cleaned/BTCUSDT_15m.parquet")
    feat = pd.read_parquet(ROOT / "data/features/features.parquet")
    m5 = pd.read_parquet(ROOT / "data/features/m5_confirm_15m.parquet")
    assert len(m5) == len(ohlc)

    splits = time_ordered_splits(
        ohlc["timestamp"].to_numpy(),
        cfg["train_months"],
        cfg["validation_months"],
        cfg["test_months"],
    )
    paper_path = ROOT / "outputs/thresholds/paper_survival_v1.json"
    base = {}
    if paper_path.exists():
        import json

        base = json.loads(paper_path.read_text(encoding="utf-8"))

    bundles = {
        s: joblib.load(ROOT / "outputs/models" / f"clean_{s.lower()}_model.joblib") for s in ("LONG", "SHORT")
    }

    # gate scores from phase13 if present
    gate_path = ROOT / "outputs/reports/phase13_gate_scores.json"
    allowed = {"LONG": {"sessions": [2], "regimes": [1, 5]}, "SHORT": {"sessions": [1], "regimes": [3]}}
    if gate_path.exists():
        import json

        gs = json.loads(gate_path.read_text(encoding="utf-8"))
        for side, sc in gs.items():
            allowed[side] = {
                "sessions": sc.get("allowed_sessions") or None,
                "regimes": sc.get("allowed_regimes") or None,
            }

    # M5 confirm variants
    m5_modes = [
        ("none", None),
        ("any", "alert_any"),
        ("side", None),  # alert_long / alert_short
        ("vol", "alert_vol"),
        ("side_vol", None),  # side wick/vol combo columns
    ]

    leverages = [10]
    sls = [0.0040, 0.0050, 0.0060, 0.0080]
    atr_mults = [1.5, 2.0]
    tp1s = [0.0030, 0.0040, 0.0060]
    holds = [12, 16, 24]
    thrs = [0.55, 0.60, 0.65]

    val_rows = []
    for side, bundle in bundles.items():
        f_val = feat.iloc[splits["val_idx"]].reset_index(drop=True)
        o_val = ohlc.iloc[splits["val_idx"]].reset_index(drop=True)
        m_val = m5.iloc[splits["val_idx"]].reset_index(drop=True)
        atr = f_val["atr14_pct"].fillna(0.003).to_numpy(float)
        p_val = bundle["model"].predict_proba(f_val[bundle["cols"]])[:, 1]
        sess = allowed[side]["sessions"]
        regs = allowed[side]["regimes"]
        # 세션·레짐 게이트는 Val에서 산 것만 (phase13)
        g_sess = combine_gates(f_val, side, sessions=sess, regimes=regs, forbid_vol={3})

        for m5name, col in m5_modes:
            if m5name == "none":
                m5mask = np.ones(len(m_val), dtype=bool)
            elif m5name == "side":
                c = "alert_long" if side == "LONG" else "alert_short"
                m5mask = m_val[c].to_numpy(int) > 0
            elif m5name == "side_vol":
                c = "alert_long" if side == "LONG" else "alert_short"
                m5mask = (m_val[c].to_numpy(int) > 0) & (m_val["alert_vol"].to_numpy(int) > 0)
            else:
                m5mask = m_val[col].to_numpy(int) > 0
            # 5m 커버 없는 봉은 게이트 통과 불가(정직)
            m5mask = m5mask & (m_val["has_5m"].to_numpy(int) > 0)

            for thr in thrs:
                mask = (p_val >= thr) & g_sess & m5mask
                if mask.sum() < 18:
                    continue
                for lev, sl, tp1, hold in itertools.product(leverages, sls, tp1s, holds):
                    if tp1 < sl * 0.35:
                        continue
                    s = run_survival_on_mask(
                        o_val, mask, side, lev, sl, tp1, hold, entry_fee, exit_fee, slip, entry_mode="close"
                    )
                    if s.get("n", 0) < 18:
                        continue
                    s.update(
                        {
                            "threshold": thr,
                            "sl_mode": "fixed_pct",
                            "m5": m5name,
                            "sessions": sess,
                            "regimes": regs,
                            "gate": "sess_regime",
                        }
                    )
                    val_rows.append(s)
                for lev, am, tp1, hold in itertools.product(leverages, atr_mults, tp1s, holds):
                    sl_arr = np.clip(atr * am, 0.003, 0.020)
                    med = float(np.nanmedian(sl_arr[mask]))
                    if tp1 < med * 0.35:
                        continue
                    s = run_survival_on_mask(
                        o_val,
                        mask,
                        side,
                        lev,
                        med,
                        tp1,
                        hold,
                        entry_fee,
                        exit_fee,
                        slip,
                        entry_mode="close",
                        sl_pct_arr=sl_arr,
                        atr_pct=atr,
                    )
                    if s.get("n", 0) < 18:
                        continue
                    s.update(
                        {
                            "threshold": thr,
                            "sl_mode": f"atr_x{am}",
                            "m5": m5name,
                            "sessions": sess,
                            "regimes": regs,
                            "gate": "sess_regime",
                            "sl_pct": med,
                        }
                    )
                    val_rows.append(s)

    write_json(ROOT / "outputs/reports/phase14_survival_val_grid.json", val_rows)

    viable = [
        r
        for r in val_rows
        if r.get("n", 0) >= 20
        and r.get("net_ev", -999) > 0
        and r.get("max_dd", 1) <= 0.25
        and r.get("profit_factor", 0) >= 1.05
        and float(r.get("leverage", 99)) <= 10
    ]
    viable.sort(key=lambda x: (x["net_ev"], -x["max_dd"], x["n"]), reverse=True)
    # prefer configs that actually use m5 confirm when EV similar
    best = viable[0] if viable else None
    if viable:
        with_m5 = [r for r in viable if r.get("m5") not in (None, "none")]
        if with_m5 and with_m5[0]["net_ev"] >= best["net_ev"] * 0.85:
            best = with_m5[0]

    least = sorted([r for r in val_rows if r.get("n", 0) >= 20], key=lambda x: x["net_ev"], reverse=True)[:10]

    def eval_cfg(cfg_row, idx):
        side = cfg_row["side"]
        bundle = bundles[side]
        f = feat.iloc[idx].reset_index(drop=True)
        o = ohlc.iloc[idx].reset_index(drop=True)
        m = m5.iloc[idx].reset_index(drop=True)
        atr = f["atr14_pct"].fillna(0.003).to_numpy(float)
        p = bundle["model"].predict_proba(f[bundle["cols"]])[:, 1]
        g = combine_gates(
            f,
            side,
            sessions=cfg_row.get("sessions"),
            regimes=cfg_row.get("regimes"),
            forbid_vol={3},
        )
        m5name = cfg_row.get("m5", "none")
        if m5name == "none":
            m5mask = np.ones(len(m), dtype=bool)
        elif m5name == "side":
            c = "alert_long" if side == "LONG" else "alert_short"
            m5mask = m[c].to_numpy(int) > 0
        elif m5name == "side_vol":
            c = "alert_long" if side == "LONG" else "alert_short"
            m5mask = (m[c].to_numpy(int) > 0) & (m["alert_vol"].to_numpy(int) > 0)
        else:
            colmap = {"any": "alert_any", "vol": "alert_vol"}
            col = m5name if m5name.startswith("alert_") else colmap[m5name]
            m5mask = m[col].to_numpy(int) > 0
        m5mask = m5mask & (m["has_5m"].to_numpy(int) > 0)
        mask = (p >= float(cfg_row["threshold"])) & g & m5mask
        sl_arr = None
        if str(cfg_row.get("sl_mode", "")).startswith("atr_x"):
            am = float(str(cfg_row["sl_mode"]).replace("atr_x", ""))
            sl_arr = np.clip(atr * am, 0.003, 0.020)
        close = run_survival_on_mask(
            o,
            mask,
            side,
            float(cfg_row["leverage"]),
            float(cfg_row["sl_pct"]),
            float(cfg_row["tp1_pct"]),
            int(cfg_row["hold"]),
            entry_fee,
            exit_fee,
            slip,
            entry_mode="close",
            sl_pct_arr=sl_arr,
            atr_pct=atr,
        )
        nxt = run_survival_on_mask(
            o,
            mask,
            side,
            float(cfg_row["leverage"]),
            float(cfg_row["sl_pct"]),
            float(cfg_row["tp1_pct"]),
            int(cfg_row["hold"]),
            entry_fee,
            exit_fee,
            slip,
            entry_mode="next_open",
            sl_pct_arr=sl_arr,
            atr_pct=atr,
        )
        stress = []
        for name, sm, fm in [
            ("기본", 1.0, 1.0),
            ("슬리피지+50%", 1.5, 1.0),
            ("수수료+20%", 1.0, 1.2),
            ("둘다악화", 1.5, 1.2),
        ]:
            s = run_survival_on_mask(
                o,
                mask,
                side,
                float(cfg_row["leverage"]),
                float(cfg_row["sl_pct"]),
                float(cfg_row["tp1_pct"]),
                int(cfg_row["hold"]),
                entry_fee * fm,
                exit_fee * fm,
                slip * sm,
                entry_mode="close",
                sl_pct_arr=sl_arr,
                atr_pct=atr,
            )
            s["case"] = name
            stress.append(s)
        return close, nxt, stress

    oos = oos_next = None
    stress = []
    if best:
        oos, oos_next, stress = eval_cfg(best, splits["test_idx"])

    promote = bool(
        best
        and oos
        and oos.get("n", 0) >= 12
        and oos.get("net_ev", -1) > 0
        and oos.get("max_dd", 1) <= 0.50
        and (oos_next or {}).get("net_ev", -1) > -0.01
        and all(s.get("net_ev", -1) > 0 for s in stress)
    )

    # compare baseline paper (no new m5) vs best
    baseline_oos = None
    if base.get("side"):
        # rebuild minimal cfg from paper v1
        # paper v1: gate 이름과 무관하게 저장된 sessions/regimes 사용
        bcfg = {
            "side": base["side"],
            "leverage": base["leverage"],
            "threshold": base["threshold"],
            "sl_pct": base["sl_pct"],
            "sl_mode": base.get("sl_mode"),
            "tp1_pct": base["tp1_pct"],
            "hold": base.get("hold_bars") or base.get("hold"),
            "m5": "none",
            "sessions": base.get("sessions"),
            "regimes": base.get("regimes"),
        }
        baseline_oos, _, _ = eval_cfg(bcfg, splits["test_idx"])

    paper14 = {
        "promote_to_paper": promote,
        "mode": "survival_clean_m5_v1",
        "best_val": best,
        "oos": oos,
        "oos_next_open": oos_next,
        "stress": stress,
        "baseline_paper_v1_oos": baseline_oos,
        "real_order": False,
        "notes_ko": "5분 알림은 15분 마감 확정만. 실주문 OFF.",
    }
    if best:
        paper14.update(
            {
                "side": best["side"],
                "leverage": best["leverage"],
                "threshold": best["threshold"],
                "sl_pct": best["sl_pct"],
                "sl_mode": best.get("sl_mode"),
                "tp1_pct": best["tp1_pct"],
                "hold_bars": best["hold"],
                "m5": best.get("m5"),
                "sessions": best.get("sessions"),
                "regimes": best.get("regimes"),
            }
        )
    write_json(ROOT / "outputs/thresholds/paper_survival_m5_v1.json", paper14)

    summary = {
        "val_grid_n": len(val_rows),
        "val_positive_n": sum(1 for r in val_rows if r.get("net_ev", 0) > 0),
        "val_viable_n": len(viable),
        "best_val": best,
        "top10": least,
        "oos": oos,
        "oos_next_open": oos_next,
        "stress": stress,
        "baseline_paper_v1_oos": baseline_oos,
        "promote_to_paper": promote,
        "m5_coverage": float(m5["has_5m"].mean()),
    }
    write_json(ROOT / "outputs/reports/phase14_summary.json", summary)

    lines = [
        "# 4단계 결과 (5분 감지 → 15분 확정)",
        "",
        f"- 5분 커버리지: {summary['m5_coverage']:.1%}",
        f"- Val 조합: {len(val_rows)} · EV>0: {summary['val_positive_n']} · 타이트통과: {len(viable)}",
        "",
    ]
    if best:
        lines.append(
            f"- 선택: {best['side']} · m5={best.get('m5')} · {best['leverage']}배 · "
            f"SL {best['sl_pct']:.2%}({best.get('sl_mode')}) · TP1 {best['tp1_pct']:.2%} · "
            f"hold {best['hold']} · thr≥{best['threshold']} · EV {best['net_ev']:.4f} · "
            f"WR {best['win_rate']:.1%} · DD {best['max_dd']:.1%} · n={best['n']}"
        )
    else:
        lines.append("- 검증 통과 없음")
    lines += ["", "## OOS", ""]
    if oos:
        lines.append(
            f"- 종가: n={oos.get('n')} · EV {oos.get('net_ev'):.4f} · WR {oos.get('win_rate'):.1%} · "
            f"DD {oos.get('max_dd'):.1%} · PF {oos.get('profit_factor'):.2f}"
        )
        if oos_next:
            lines.append(f"- 다음시가: n={oos_next.get('n')} · EV {oos_next.get('net_ev'):.4f}")
    if baseline_oos:
        lines.append(
            f"- (참고) 3단계 페이퍼 설정 OOS: n={baseline_oos.get('n')} · EV {baseline_oos.get('net_ev'):.4f} · "
            f"DD {baseline_oos.get('max_dd'):.1%}"
        )
    lines += ["", "## 비용 스트레스", ""]
    for s in stress:
        lines.append(f"- {s.get('case')}: EV {s.get('net_ev'):.4f}")
    lines += [
        "",
        f"## 판정: 페이퍼 승격 **{'가능' if promote else '불가'}**",
        "- 설정: `outputs/thresholds/paper_survival_m5_v1.json`",
        "- 리페인트 금지: 15분 마감 확정만 진입.",
        "",
    ]
    md = ROOT / "outputs/reports/phase14_한글결과.md"
    md.write_text("\n".join(lines), encoding="utf-8")
    print(md.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
