#!/usr/bin/env python3
"""1~2단계: 클린진입 모델 고도화 + 10/20배 생존청산 그리드 (Val 선택 → OOS 1회)."""
from __future__ import annotations

import itertools
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import brier_score_loss, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.clean_features import clean_feature_cols
from src.ml_models import build_model, make_xy
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
    labels = pd.read_parquet(ROOT / "data/labels/labels.parquet")

    splits = time_ordered_splits(
        ohlc["timestamp"].to_numpy(),
        cfg["train_months"],
        cfg["validation_months"],
        cfg["test_months"],
    )
    cols = clean_feature_cols(list(feat.columns))
    write_json(ROOT / "outputs/models/clean_feature_columns.json", {"columns": cols, "n": len(cols)})

    # --- 1) 클린 모델 재학습 ---
    train_info = {}
    bundles = {}
    for side in ("LONG", "SHORT"):
        target = f"CLEAN_B_{side}"
        Xtr, ytr = make_xy(feat, labels, target, splits["train_idx"], cols)
        Xva, yva = make_xy(feat, labels, target, splits["val_idx"], cols)
        Xte, yte = make_xy(feat, labels, target, splits["test_idx"], cols)
        model = build_model("gbm")
        model.fit(Xtr, ytr)
        try:
            cal = CalibratedClassifierCV(model, method="isotonic", cv="prefit")
            cal.fit(Xva, yva)
            clf = cal
        except Exception:
            clf = model
        pva = clf.predict_proba(Xva)[:, 1]
        pte = clf.predict_proba(Xte)[:, 1]
        info = {
            "n_train": int(len(ytr)),
            "n_val": int(len(yva)),
            "n_test": int(len(yte)),
            "pos_train": float(ytr.mean()),
            "pos_val": float(yva.mean()),
            "pos_test": float(yte.mean()),
            "auc_val": float(roc_auc_score(yva, pva)) if yva.nunique() > 1 else None,
            "auc_test": float(roc_auc_score(yte, pte)) if yte.nunique() > 1 else None,
            "brier_val": float(brier_score_loss(yva, pva)),
            "brier_test": float(brier_score_loss(yte, pte)),
        }
        # CLEAN precision at thresholds on test (label quality, not money yet)
        prec = {}
        for thr in [0.55, 0.60, 0.65, 0.70, 0.75]:
            m = pte >= thr
            if m.sum() < 10:
                prec[str(thr)] = {"n": int(m.sum())}
                continue
            prec[str(thr)] = {
                "n": int(m.sum()),
                "clean_hit": float(yte[m].mean()),
                "lift": float(yte[m].mean() / max(1e-9, yte.mean())),
            }
        info["precision_frontier_test"] = prec
        path = ROOT / "outputs/models" / f"clean_{side.lower()}_model.joblib"
        joblib.dump({"model": clf, "cols": cols, "target": target, "metrics": info}, path)
        bundles[side] = {"model": clf, "cols": cols, "path": str(path)}
        train_info[side] = info

    write_json(ROOT / "outputs/reports/phase12_clean_model.json", train_info)

    # --- 2) 생존 청산 그리드 (Val에서만 선택) ---
    leverages = [10, 20]
    # 넓은 손절 (가격%)
    sls = [0.0025, 0.0030, 0.0035, 0.0040]
    # 1차 익절 (가격%) — CLEAN MFE 스케일
    tp1s = [0.0015, 0.0020, 0.0025]
    holds = [4, 8, 12]
    thrs = [0.55, 0.60, 0.65, 0.70]

    val_rows = []
    for side, bundle in bundles.items():
        p_val = bundle["model"].predict_proba(feat.iloc[splits["val_idx"]][bundle["cols"]])[:, 1]
        # ATR 기반 손절도 추가: atr14_pct * mult
        atr = feat.iloc[splits["val_idx"]]["atr14_pct"].to_numpy()
        for lev, sl, tp1, hold, thr in itertools.product(leverages, sls, tp1s, holds, thrs):
            mask = p_val >= thr
            if mask.sum() < 25:
                continue
            s = run_survival_on_mask(
                ohlc.iloc[splits["val_idx"]].reset_index(drop=True),
                mask,
                side,
                lev,
                sl,
                tp1,
                hold,
                entry_fee,
                exit_fee,
                slip,
                entry_mode="close",
            )
            if s.get("n", 0) < 25:
                continue
            s["threshold"] = thr
            s["sl_mode"] = "fixed_pct"
            val_rows.append(s)

        # ATR 배수 손절
        for lev, mult, tp1, hold, thr in itertools.product(leverages, [0.20, 0.25, 0.30], tp1s, holds, thrs):
            mask = p_val >= thr
            if mask.sum() < 25:
                continue
            # per-row SL would be ideal; approx median ATR of masked
            sl_atr = float(np.nanmedian(atr[mask]) * mult)
            sl_atr = float(np.clip(sl_atr, 0.0020, 0.0060))
            s = run_survival_on_mask(
                ohlc.iloc[splits["val_idx"]].reset_index(drop=True),
                mask,
                side,
                lev,
                sl_atr,
                tp1,
                hold,
                entry_fee,
                exit_fee,
                slip,
                entry_mode="close",
            )
            if s.get("n", 0) < 25:
                continue
            s["threshold"] = thr
            s["sl_mode"] = f"atr_x{mult}"
            s["sl_pct"] = sl_atr
            val_rows.append(s)

    write_json(ROOT / "outputs/reports/phase12_survival_val_grid.json", val_rows)

    viable = [
        r
        for r in val_rows
        if r.get("n", 0) >= 30
        and r.get("net_ev", -999) > 0
        and r.get("max_dd", 1) <= 0.40
        and r.get("profit_factor", 0) >= 1.05
    ]
    viable.sort(key=lambda x: (x["net_ev"], -x["max_dd"], x["n"]), reverse=True)
    best = viable[0] if viable else None

    # --- 3) OOS 1회 평가 (선택된 설정만) ---
    oos = None
    oos_next_open = None
    if best:
        side = best["side"]
        bundle = bundles[side]
        p_te = bundle["model"].predict_proba(feat.iloc[splits["test_idx"]][bundle["cols"]])[:, 1]
        mask = p_te >= float(best["threshold"])
        oos = run_survival_on_mask(
            ohlc.iloc[splits["test_idx"]].reset_index(drop=True),
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
        )
        oos["threshold"] = best["threshold"]
        oos["sl_mode"] = best.get("sl_mode")
        oos_next_open = run_survival_on_mask(
            ohlc.iloc[splits["test_idx"]].reset_index(drop=True),
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
        )
        oos_next_open["threshold"] = best["threshold"]

    # 비용 스트레스 (OOS best만)
    stress = []
    if best and oos and oos.get("n", 0) >= 10:
        side = best["side"]
        bundle = bundles[side]
        p_te = bundle["model"].predict_proba(feat.iloc[splits["test_idx"]][bundle["cols"]])[:, 1]
        mask = p_te >= float(best["threshold"])
        for name, slip_m, fee_m in [
            ("기본", 1.0, 1.0),
            ("슬리피지+50%", 1.5, 1.0),
            ("수수료+20%", 1.0, 1.2),
            ("둘다악화", 1.5, 1.2),
        ]:
            s = run_survival_on_mask(
                ohlc.iloc[splits["test_idx"]].reset_index(drop=True),
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
            )
            s["case"] = name
            stress.append(s)

    promote = bool(
        best
        and oos
        and oos.get("n", 0) >= 20
        and oos.get("net_ev", -1) > 0
        and oos.get("max_dd", 1) <= 0.45
        and (oos_next_open or {}).get("net_ev", -1) > -0.005  # 다음시가에도 크게 안 무너짐
    )

    summary = {
        "clean_model": train_info,
        "val_grid_n": len(val_rows),
        "val_viable_n": len(viable),
        "best_val": best,
        "oos": oos,
        "oos_next_open": oos_next_open,
        "stress": stress,
        "promote_to_paper": promote,
        "top5_val": viable[:5],
    }
    write_json(ROOT / "outputs/reports/phase12_summary.json", summary)

    # 한글 리포트
    lines = [
        "# 1~2단계 결과 (클린진입 + 생존청산)",
        "",
        "## 1) 클린진입 모델",
    ]
    for side, info in train_info.items():
        lines.append(
            f"- **{side}**: 검증 AUC {info.get('auc_val')} · 테스트 AUC {info.get('auc_test')} · "
            f"CLEAN비율 학습 {info.get('pos_train'):.3f} / 테스트 {info.get('pos_test'):.3f}"
        )
        lines.append(f"  - 테스트 확률구간 CLEAN적중: {info.get('precision_frontier_test')}")
    lines += ["", "## 2) 생존청산 그리드 (검증셋에서만 선택)", ""]
    lines.append(f"- 그리드 조합 수: {len(val_rows)}")
    lines.append(f"- 검증 통과(기대값>0, 낙폭≤40%, PF≥1.05, n≥30): **{len(viable)}개**")
    if best:
        lines.append(
            f"- 검증 최고: {best['side']} · {best['leverage']}배 · 손절 {best['sl_pct']:.4%} · "
            f"1차익절 {best['tp1_pct']:.4%} · 보유 {best['hold']}봉 · 확률≥{best['threshold']} · "
            f"기대값 {best['net_ev']:.4f} · 승률 {best['win_rate']:.1%} · n={best['n']}"
        )
    else:
        lines.append("- 검증에서 통과 설정 **없음**")
    lines += ["", "## 3) OOS(테스트) 1회", ""]
    if oos:
        lines.append(
            f"- 종가진입: n={oos.get('n')} · 기대값 {oos.get('net_ev')} · 승률 {oos.get('win_rate')} · "
            f"낙폭 {oos.get('max_dd')} · PF {oos.get('profit_factor')}"
        )
        if oos_next_open:
            lines.append(
                f"- 다음시가진입: n={oos_next_open.get('n')} · 기대값 {oos_next_open.get('net_ev')} · "
                f"승률 {oos_next_open.get('win_rate')} · 낙폭 {oos_next_open.get('max_dd')}"
            )
    else:
        lines.append("- OOS 평가 없음 (검증 통과 설정 없음)")
    lines += ["", "## 4) 비용 스트레스", ""]
    for s in stress:
        lines.append(f"- {s.get('case')}: 기대값 {s.get('net_ev')} · n={s.get('n')}")
    lines += [
        "",
        "## 5) 판정",
        f"- 페이퍼 승격: **{'가능' if promote else '불가'}**",
        "",
        "## 해석",
        "- 기대값이 플러스여야만 ‘좋다’.",
        "- 검증만 좋고 테스트가 나쁘면 과적합.",
        "- 50배·순익5%는 이 단계 통과 후에만 시험.",
        "",
    ]
    md = ROOT / "outputs/reports/phase12_한글결과.md"
    md.write_text("\n".join(lines), encoding="utf-8")
    print(md.read_text(encoding="utf-8"))
    print("JSON →", ROOT / "outputs/reports/phase12_summary.json")


if __name__ == "__main__":
    main()
