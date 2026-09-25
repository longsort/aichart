#!/usr/bin/env python3
"""3단계: 레짐·세션·스윕 게이트 + 넓은 RR 생존청산 그리드 (Val 선택 → OOS 1회)."""
from __future__ import annotations

import itertools
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.entry_gates import REGIME_NAME, SESSION_NAME, combine_gates, score_gate_lift
from src.survival_exit import run_survival_on_mask
from src.utils import ensure_dirs, load_config, write_json
from src.walk_forward import time_ordered_splits


GATE_PRESETS = [
    {"name": "none", "require_sweep": False, "require_comp_exp": False},
    {"name": "sweep", "require_sweep": True, "require_comp_exp": False},
    {"name": "comp_exp", "require_sweep": False, "require_comp_exp": True},
    {"name": "sweep_or_comp", "require_sweep": False, "require_comp_exp": False, "or_mode": True},
]


def _apply_or_gates(feat, side, sessions, regimes, forbid_vol):
    """스윕 OR 압축확장 — 둘 중 하나면 통과."""
    base = combine_gates(feat, side, sessions=sessions, regimes=regimes, forbid_vol=forbid_vol)
    from src.entry_gates import compression_expansion_mask, sweep_reclaim_mask

    return base & (sweep_reclaim_mask(feat, side) | compression_expansion_mask(feat))


def main():
    ensure_dirs()
    cfg = load_config()
    fees = cfg["fees"]
    slip = float(fees.get("default_slippage_bps", 2))
    entry_fee = fees["taker_fee"]
    exit_fee = fees["taker_fee"]

    ohlc = pd.read_parquet(ROOT / "data/cleaned/BTCUSDT_15m.parquet")
    feat = pd.read_parquet(ROOT / "data/features/features.parquet")
    labels = pd.read_parquet(ROOT / "data/labels/labels.parquet")
    splits = time_ordered_splits(
        ohlc["timestamp"].to_numpy(),
        cfg["train_months"],
        cfg["validation_months"],
        cfg["test_months"],
    )

    bundles = {}
    for side in ("LONG", "SHORT"):
        path = ROOT / "outputs/models" / f"clean_{side.lower()}_model.joblib"
        bundles[side] = joblib.load(path)

    # --- 게이트 선정 (Val CLEAN 리프트만) ---
    gate_scores = {}
    allowed = {}
    for side, bundle in bundles.items():
        cols = bundle["cols"]
        clf = bundle["model"]
        f_val = feat.iloc[splits["val_idx"]].reset_index(drop=True)
        y = labels.iloc[splits["val_idx"]][f"CLEAN_B_{side}"].to_numpy(float)
        p = clf.predict_proba(f_val[cols])[:, 1]
        sc = score_gate_lift(f_val, y, p, side, thr=0.55)
        gate_scores[side] = sc
        allowed[side] = {
            "sessions": sc.get("allowed_sessions") or None,
            "regimes": sc.get("allowed_regimes") or None,
        }

    write_json(ROOT / "outputs/reports/phase13_gate_scores.json", gate_scores)

    # --- 확장 청산 그리드 ---
    leverages = [10, 20]
    sls = [0.0040, 0.0060, 0.0080, 0.0100, 0.0120]
    tp1s = [0.0030, 0.0040, 0.0060, 0.0080]
    holds = [8, 12, 16, 24]
    thrs = [0.55, 0.60, 0.65, 0.70]
    atr_mults = [1.0, 1.5, 2.0, 2.5]  # per-bar SL = atr14_pct * mult
    trails = [None, 1.0]  # ATR trail after TP1

    val_rows = []
    for side, bundle in bundles.items():
        f_val = feat.iloc[splits["val_idx"]].reset_index(drop=True)
        o_val = ohlc.iloc[splits["val_idx"]].reset_index(drop=True)
        atr = f_val["atr14_pct"].fillna(0.003).to_numpy(float)
        p_val = bundle["model"].predict_proba(f_val[bundle["cols"]])[:, 1]
        sess = allowed[side]["sessions"]
        regs = allowed[side]["regimes"]

        for g in GATE_PRESETS:
            if g.get("or_mode"):
                gmask = _apply_or_gates(f_val, side, sess, regs, {3})
            else:
                gmask = combine_gates(
                    f_val,
                    side,
                    sessions=sess,
                    regimes=regs,
                    require_sweep=g["require_sweep"],
                    require_comp_exp=g["require_comp_exp"],
                    forbid_vol={3},
                )
            for thr in thrs:
                pmask = (p_val >= thr) & gmask
                if pmask.sum() < 20:
                    continue

                # fixed % SL grid
                for lev, sl, tp1, hold, trail_m in itertools.product(leverages, sls, tp1s, holds, trails):
                    # RR sanity: skip if TP1 << SL too much (need WR unrealistically high)
                    if tp1 < sl * 0.35:
                        continue
                    s = run_survival_on_mask(
                        o_val,
                        pmask,
                        side,
                        lev,
                        sl,
                        tp1,
                        hold,
                        entry_fee,
                        exit_fee,
                        slip,
                        entry_mode="close",
                        atr_pct=atr,
                        trail_atr_mult=trail_m,
                    )
                    if s.get("n", 0) < 20:
                        continue
                    s.update(
                        {
                            "threshold": thr,
                            "sl_mode": "fixed_pct",
                            "gate": g["name"],
                            "sessions": sess,
                            "regimes": regs,
                            "trail_atr_mult": trail_m,
                        }
                    )
                    val_rows.append(s)

                # per-bar ATR SL
                for lev, am, tp1, hold, trail_m in itertools.product(leverages, atr_mults, tp1s, holds, trails):
                    sl_arr = np.clip(atr * am, 0.003, 0.020)
                    # approximate median for reporting
                    med_sl = float(np.nanmedian(sl_arr[pmask]))
                    if tp1 < med_sl * 0.35:
                        continue
                    s = run_survival_on_mask(
                        o_val,
                        pmask,
                        side,
                        lev,
                        med_sl,
                        tp1,
                        hold,
                        entry_fee,
                        exit_fee,
                        slip,
                        entry_mode="close",
                        sl_pct_arr=sl_arr,
                        atr_pct=atr,
                        trail_atr_mult=trail_m,
                    )
                    if s.get("n", 0) < 20:
                        continue
                    s.update(
                        {
                            "threshold": thr,
                            "sl_mode": f"atr_x{am}",
                            "gate": g["name"],
                            "sessions": sess,
                            "regimes": regs,
                            "trail_atr_mult": trail_m,
                            "sl_pct": med_sl,
                        }
                    )
                    val_rows.append(s)

    write_json(ROOT / "outputs/reports/phase13_survival_val_grid.json", val_rows)

    viable = [
        r
        for r in val_rows
        if r.get("n", 0) >= 25
        and r.get("net_ev", -999) > 0
        and r.get("max_dd", 1) <= 0.45
        and r.get("profit_factor", 0) >= 1.05
    ]
    viable.sort(key=lambda x: (x["net_ev"], -x["max_dd"], x["n"]), reverse=True)
    best = viable[0] if viable else None
    least_neg = sorted([r for r in val_rows if r.get("n", 0) >= 25], key=lambda x: x["net_ev"], reverse=True)[:10]

    oos = oos_next = None
    stress = []
    if best:
        side = best["side"]
        bundle = bundles[side]
        f_te = feat.iloc[splits["test_idx"]].reset_index(drop=True)
        o_te = ohlc.iloc[splits["test_idx"]].reset_index(drop=True)
        atr_te = f_te["atr14_pct"].fillna(0.003).to_numpy(float)
        p_te = bundle["model"].predict_proba(f_te[bundle["cols"]])[:, 1]
        sess = best.get("sessions")
        regs = best.get("regimes")
        gname = best.get("gate", "none")
        if gname == "sweep_or_comp":
            gmask = _apply_or_gates(f_te, side, sess, regs, {3})
        else:
            preset = next(g for g in GATE_PRESETS if g["name"] == gname)
            gmask = combine_gates(
                f_te,
                side,
                sessions=sess,
                regimes=regs,
                require_sweep=preset["require_sweep"],
                require_comp_exp=preset["require_comp_exp"],
                forbid_vol={3},
            )
        mask = (p_te >= float(best["threshold"])) & gmask
        trail = best.get("trail_atr_mult")
        sl_arr = None
        if str(best.get("sl_mode", "")).startswith("atr_x"):
            am = float(str(best["sl_mode"]).replace("atr_x", ""))
            sl_arr = np.clip(atr_te * am, 0.003, 0.020)
        oos = run_survival_on_mask(
            o_te,
            mask,
            side,
            float(best["leverage"]),
            float(best["sl_pct"]),
            float(best["tp1_pct"]),
            int(best["hold"]),
            entry_fee,
            exit_fee,
            slip,
            entry_mode="close",
            sl_pct_arr=sl_arr,
            atr_pct=atr_te,
            trail_atr_mult=trail,
        )
        oos.update({"threshold": best["threshold"], "gate": gname, "sl_mode": best.get("sl_mode")})
        oos_next = run_survival_on_mask(
            o_te,
            mask,
            side,
            float(best["leverage"]),
            float(best["sl_pct"]),
            float(best["tp1_pct"]),
            int(best["hold"]),
            entry_fee,
            exit_fee,
            slip,
            entry_mode="next_open",
            sl_pct_arr=sl_arr,
            atr_pct=atr_te,
            trail_atr_mult=trail,
        )
        for name, slip_m, fee_m in [
            ("기본", 1.0, 1.0),
            ("슬리피지+50%", 1.5, 1.0),
            ("수수료+20%", 1.0, 1.2),
            ("둘다악화", 1.5, 1.2),
        ]:
            s = run_survival_on_mask(
                o_te,
                mask,
                side,
                float(best["leverage"]),
                float(best["sl_pct"]),
                float(best["tp1_pct"]),
                int(best["hold"]),
                entry_fee * fee_m,
                exit_fee * fee_m,
                slip * slip_m,
                entry_mode="close",
                sl_pct_arr=sl_arr,
                atr_pct=atr_te,
                trail_atr_mult=trail,
            )
            s["case"] = name
            stress.append(s)

    promote = bool(
        best
        and oos
        and oos.get("n", 0) >= 15
        and oos.get("net_ev", -1) > 0
        and oos.get("max_dd", 1) <= 0.50
        and (oos_next or {}).get("net_ev", -1) > -0.01
    )

    summary = {
        "gate_allowed": allowed,
        "val_grid_n": len(val_rows),
        "val_viable_n": len(viable),
        "val_positive_n": sum(1 for r in val_rows if r.get("net_ev", 0) > 0),
        "best_val": best,
        "top10_least_negative": least_neg,
        "oos": oos,
        "oos_next_open": oos_next,
        "stress": stress,
        "promote_to_paper": promote,
    }
    write_json(ROOT / "outputs/reports/phase13_summary.json", summary)

    lines = [
        "# 3단계 결과 (레짐·세션·스윕 게이트 + 넓은 RR)",
        "",
        "## 1) Val에서 고른 게이트",
    ]
    for side, a in allowed.items():
        sess_n = [SESSION_NAME.get(s, s) for s in (a["sessions"] or [])]
        reg_n = [REGIME_NAME.get(r, r) for r in (a["regimes"] or [])]
        lines.append(f"- **{side}**: 세션 {sess_n or '전체'} · 레짐 {reg_n or '전체'}")
        sc = gate_scores.get(side, {})
        lines.append(f"  - base CLEAN적중@{sc.get('thr')}: {sc.get('base_clean_hit')} (n={sc.get('base_n')})")
    lines += ["", "## 2) 생존청산 그리드", ""]
    lines.append(f"- 조합 수: {len(val_rows)}")
    lines.append(f"- 기대값>0: **{summary['val_positive_n']}개**")
    lines.append(f"- 통과(EV>0, DD≤45%, PF≥1.05, n≥25): **{len(viable)}개**")
    if best:
        lines.append(
            f"- 검증 최고: {best['side']} · gate={best.get('gate')} · {best['leverage']}배 · "
            f"SL {best['sl_pct']:.2%}({best.get('sl_mode')}) · TP1 {best['tp1_pct']:.2%} · "
            f"hold {best['hold']} · thr≥{best['threshold']} · trail={best.get('trail_atr_mult')} · "
            f"EV {best['net_ev']:.4f} · WR {best['win_rate']:.1%} · n={best['n']}"
        )
    else:
        lines.append("- 검증 통과 설정 **없음**")
    lines += ["", "## 3) 검증 상위(최소 손실 / 플러스)", ""]
    for i, r in enumerate(least_neg[:5], 1):
        lines.append(
            f"{i}. {r['side']} · gate={r.get('gate')} · {r['leverage']}배 · thr≥{r['threshold']} · "
            f"SL {r['sl_pct']:.2%} · TP1 {r['tp1_pct']:.2%} · hold {r['hold']} · "
            f"n={r['n']} · WR {r['win_rate']:.1%} · EV {r['net_ev']:.4f} · PF {r['profit_factor']:.2f}"
        )
    lines += ["", "## 4) OOS", ""]
    if oos:
        lines.append(
            f"- 종가: n={oos.get('n')} · EV {oos.get('net_ev')} · WR {oos.get('win_rate')} · "
            f"DD {oos.get('max_dd')} · PF {oos.get('profit_factor')}"
        )
        if oos_next:
            lines.append(
                f"- 다음시가: n={oos_next.get('n')} · EV {oos_next.get('net_ev')} · WR {oos_next.get('win_rate')}"
            )
    else:
        lines.append("- OOS 없음 (검증 통과 없음)")
    lines += ["", "## 5) 비용 스트레스", ""]
    for s in stress:
        lines.append(f"- {s.get('case')}: EV {s.get('net_ev')} · n={s.get('n')}")
    lines += [
        "",
        "## 6) 판정",
        f"- 페이퍼 승격: **{'가능' if promote else '불가'}**",
        "",
        "- 기대값 플러스만 ‘있다’. 50배 시험은 이 단계 통과 후.",
        "",
    ]
    md = ROOT / "outputs/reports/phase13_한글결과.md"
    md.write_text("\n".join(lines), encoding="utf-8")
    print(md.read_text(encoding="utf-8"))
    print("JSON →", ROOT / "outputs/reports/phase13_summary.json")


if __name__ == "__main__":
    main()
