#!/usr/bin/env python3
"""Master pipeline: validate → features → labels → baselines → train → optimize → WF → stress → cluster → report."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.baseline_models import run_baselines
from src.data_loader import clean_and_save, load_raw_csv, validate_ohlcv
from src.feature_ablation import ablation_run
from src.feature_engine import build_features
from src.label_engine import add_clean_and_fast_labels, build_tp_first_labels, compute_path_stats
from src.live_signal_engine import signal_from_frame
from src.ml_models import feature_columns, train_side_models
from src.optimizer import frontier_for_probs, optimize_tp_sl_grid
from src.pattern_cluster import cluster_patterns
from src.reporting import write_final_report
from src.simulator import summarize_side
from src.strategy_selector import select_modes
from src.stress_test import parameter_neighborhood, stress_configs
from src.utils import ensure_dirs, file_hash, load_config, write_json
from src.walk_forward import time_ordered_splits, walk_forward_folds


def main():
    ensure_dirs()
    cfg = load_config()
    print("STEP1 validate")
    raw = load_raw_csv()
    report = validate_ohlcv(raw)
    write_json(ROOT / "outputs/reports/data_quality_report.json", report)
    ohlc = clean_and_save(raw)
    print(" rows", len(ohlc), report.get("from_iso"), "→", report.get("to_iso"), "ok", report.get("ok"))

    print("STEP2 features")
    feat = build_features(ohlc, swing_k=int(cfg.get("swing_k", 3)), eq_atr_tol=float(cfg.get("eq_atr_tol", 0.15)))
    feat_path = ROOT / "data/features/features.parquet"
    feat.to_parquet(feat_path, index=False)
    cols = feature_columns(feat)
    print(" features", len(cols), "file", feat_path)

    print("STEP3 labels (path + clean)")
    horizons = list(cfg["horizons"])
    path = compute_path_stats(ohlc, horizons)
    labels = add_clean_and_fast_labels(path)
    # attach 50x net+5 reference labels for reporting (not forced as only target)
    slip = float(cfg["fees"].get("default_slippage_bps", 2))
    ref = build_tp_first_labels(ohlc, 50, 0.05, 0.0015, 8, slip)
    for c in ref.columns:
        if c != "timestamp":
            labels[c] = ref[c]
    labels.to_parquet(ROOT / "data/labels/labels.parquet", index=False)
    dist = {
        k: {
            "pos": int((labels[k] == 1).sum()),
            "neg": int((labels[k] == 0).sum()),
            "rate": float((labels[k] == 1).mean()),
        }
        for k in labels.columns
        if str(k).startswith("CLEAN_")
    }
    amb = float((labels["tpfirst_LONG"] == -1).mean())
    write_json(ROOT / "outputs/reports/label_distribution.json", {"clean": dist, "ambiguous_long_rate": amb})
    print(" ambiguous_long", round(amb, 4), "CLEAN_B_LONG rate", dist.get("CLEAN_B_LONG"))

    print("STEP4 splits + baselines")
    splits = time_ordered_splits(
        ohlc["timestamp"].to_numpy(), cfg["train_months"], cfg["validation_months"], cfg["test_months"]
    )
    write_json(ROOT / "data/splits/tvt.json", {k: (v.tolist() if hasattr(v, "tolist") else v) for k, v in splits.items()})
    base = run_baselines(ohlc, feat, splits["test_idx"])
    write_json(ROOT / "outputs/reports/baselines_oos.json", base)
    print(" baselines", len(base))

    print("STEP5 train models")
    metrics = train_side_models(feat, labels, splits, target_base="CLEAN_B")
    print(metrics)

    print("STEP6 optimize on validation")
    import joblib

    b_long = joblib.load(ROOT / "outputs/models/long_model.joblib") if (ROOT / "outputs/models/long_model.joblib").exists() else None
    b_short = joblib.load(ROOT / "outputs/models/short_model.joblib") if (ROOT / "outputs/models/short_model.joblib").exists() else None
    opt = optimize_tp_sl_grid(ohlc, feat, splits["val_idx"], b_long, b_short)
    print(" viable", opt.get("n_viable"), "best", opt.get("best"))

    print("STEP7 walk-forward")
    folds = walk_forward_folds(
        ohlc["timestamp"].to_numpy(),
        cfg["walk_forward"]["train_months"],
        cfg["walk_forward"]["validation_months"],
        cfg["walk_forward"]["test_months"],
    )
    wf = []
    for fi, fold in enumerate(folds):
        # retrain quickly on fold train for CLEAN_B_LONG
        from src.ml_models import build_model, make_xy

        cols = feature_columns(feat)
        target = "CLEAN_B_LONG"
        try:
            Xtr, ytr = make_xy(feat, labels, target, fold["train_idx"], cols)
            Xte, yte = make_xy(feat, labels, target, fold["test_idx"], cols)
            if len(ytr) < 80 or ytr.nunique() < 2:
                continue
            m = build_model("gbm")
            m.fit(Xtr, ytr)
            p = m.predict_proba(feat.iloc[fold["test_idx"]][cols])[:, 1]
            # evaluate at thr 0.7 with ref execution params
            best = opt.get("best") or {"leverage": 50, "target_roi": 0.05, "sl": 0.0015, "hold": 8}
            lab = build_tp_first_labels(
                ohlc.iloc[fold["test_idx"]].reset_index(drop=True),
                float(best.get("leverage", 50)),
                float(best.get("target_roi", 0.05)),
                float(best.get("sl", 0.0015)),
                int(best.get("hold", 8)),
                slip,
            )
            mask = p >= float(best.get("threshold", 0.7) or 0.7)
            s = summarize_side(lab.loc[mask], "LONG") if mask.sum() >= 5 else {"n": int(mask.sum())}
            s["fold"] = fi
            s["test_months"] = fold["test_months"]
            wf.append(s)
        except Exception as e:
            wf.append({"fold": fi, "error": str(e)})
    write_json(ROOT / "outputs/reports/walk_forward.json", wf)
    print(" folds", len(wf))

    print("STEP8 stress + ablation + frontier")
    best = opt.get("best")
    stress = []
    neigh = []
    if best and best.get("side"):
        stress = stress_configs(ohlc, splits["test_idx"], best["side"], best)
        neigh = parameter_neighborhood(ohlc, splits["test_idx"], best["side"], best)
    write_json(ROOT / "outputs/reports/stress_test.json", {"stress": stress, "neighborhood": neigh})
    abl = ablation_run(feat, labels, splits, "CLEAN_B_LONG")
    write_json(ROOT / "outputs/reports/feature_ablation.json", abl)

    # OOS frontier for LONG
    frontier = []
    if b_long is not None:
        cols = b_long["cols"]
        p = b_long["model"].predict_proba(feat.iloc[splits["test_idx"]][cols])[:, 1]
        best_exec = best or {"leverage": 50, "target_roi": 0.05, "sl": 0.0015, "hold": 8}
        frontier = frontier_for_probs(
            ohlc,
            p,
            "LONG",
            splits["test_idx"],
            float(best_exec.get("leverage", 50)),
            float(best_exec.get("target_roi", 0.05)),
            float(best_exec.get("sl", 0.0015)),
            int(best_exec.get("hold", 8)),
            list(cfg["probability_thresholds"]),
            slip,
        )
        # also SHORT frontier
        if b_short is not None:
            ps = b_short["model"].predict_proba(feat.iloc[splits["test_idx"]][b_short["cols"]])[:, 1]
            frontier += frontier_for_probs(
                ohlc,
                ps,
                "SHORT",
                splits["test_idx"],
                float(best_exec.get("leverage", 50)),
                float(best_exec.get("target_roi", 0.05)),
                float(best_exec.get("sl", 0.0015)),
                int(best_exec.get("hold", 8)),
                list(cfg["probability_thresholds"]),
                slip,
            )
    write_json(ROOT / "outputs/thresholds/frontier_oos.json", frontier)
    modes = select_modes(frontier)
    write_json(ROOT / "outputs/thresholds/modes.json", modes)

    print("STEP9 clusters")
    cl_long = cluster_patterns(feat, labels, "CLEAN_B_LONG", splits["train_idx"], k=5)
    cl_short = cluster_patterns(feat, labels, "CLEAN_B_SHORT", splits["train_idx"], k=5)
    write_json(ROOT / "outputs/reports/pattern_clusters.json", {"long": cl_long, "short": cl_short})

    print("STEP10 live signal sample + final report")
    sig = signal_from_frame(ohlc, best)

    # monthly stability on OOS for best if present
    monthly = []
    if best and b_long is not None and best.get("side") == "LONG":
        te = splits["test_idx"]
        sub = ohlc.iloc[te].reset_index(drop=True)
        p = b_long["model"].predict_proba(feat.iloc[te][b_long["cols"]])[:, 1]
        lab = build_tp_first_labels(
            sub, float(best["leverage"]), float(best["target_roi"]), float(best["sl"]), int(best["hold"]), slip
        )
        mth = pd.to_datetime(sub["timestamp"], unit="ms", utc=True).dt.to_period("M").astype(str)
        thr = float(best.get("threshold") or 0.7)
        for m in sorted(mth.unique()):
            sel = (mth == m).to_numpy() & (p >= thr)
            if sel.sum() < 3:
                continue
            s = summarize_side(lab.loc[sel], "LONG")
            s["month"] = m
            monthly.append(s)
    write_json(ROOT / "outputs/reports/monthly_oos.json", monthly)

    # leverage table quick (all bars OOS, not model — diagnostic)
    lev_table = []
    for lev in cfg["base_leverage_research"]:
        lab = build_tp_first_labels(ohlc.iloc[splits["test_idx"]].reset_index(drop=True), lev, 0.05, 0.0015, 8, slip)
        s = summarize_side(lab, "LONG")
        s["leverage"] = lev
        lev_table.append(s)
    write_json(ROOT / "outputs/reports/leverage_table_oos_allbars.json", lev_table)

    # Answer 20 questions honestly from artifacts
    def auc_help(name_prefix):
        row = next((x for x in abl if x.get("set") == name_prefix and x.get("ok")), None)
        return row

    a_ohlc = auc_help("A_ohlc")
    b_vol = auc_help("B_volume")
    d_rsi = auc_help("D_rsi")
    g_liq = auc_help("G_liquidity")
    h_full = auc_help("H_full")

    pos_frontier = [r for r in frontier if r.get("net_ev", -999) > 0 and r.get("n", 0) >= 20]
    has75 = any(r.get("win_rate", 0) >= 0.75 and r.get("net_ev", -999) > 0 and r.get("n", 0) >= 20 for r in frontier)
    has80 = any(r.get("win_rate", 0) >= 0.80 and r.get("net_ev", -999) > 0 and r.get("n", 0) >= 20 for r in frontier)

    best_side_cmp = {
        "long_best_ev": max((r.get("net_ev", -999) for r in frontier if r.get("side") == "LONG"), default=None),
        "short_best_ev": max((r.get("net_ev", -999) for r in frontier if r.get("side") == "SHORT"), default=None),
    }

    answers = {
        "1": f"OOS에서 NetEV>0 설정 수={len(pos_frontier)} / frontier={len(frontier)} · best={best}",
        "2": f"LONG best EV={best_side_cmp['long_best_ev']} · SHORT best EV={best_side_cmp['short_best_ev']}",
        "3": "regime별 상세는 pattern_clusters + market_regime 분포 참고 (클러스터 regime_mode)",
        "4": f"ablation full AUC={h_full.get('auc_oos') if h_full else None} · sets={[(x.get('set'), x.get('auc_oos')) for x in abl if x.get('ok')]}",
        "5": f"RSI set AUC={d_rsi.get('auc_oos') if d_rsi else None} vs OHLC={a_ohlc.get('auc_oos') if a_ohlc else None}",
        "6": f"Volume set AUC={b_vol.get('auc_oos') if b_vol else None}",
        "7": f"Liquidity/Sweep set AUC={g_liq.get('auc_oos') if g_liq else None}",
        "8": f"validation best SL={best.get('sl') if best else None}",
        "9": f"validation best target ROI={best.get('target_roi') if best else None}",
        "10": f"leverage table OOS all-bars (diagnostic): {[(x.get('leverage'), x.get('net_ev')) for x in lev_table]}",
        "11": f"PRECISION_75 available={modes.get('PRECISION_75') != 'unavailable'} · has75_netEV={has75}",
        "12": f"PRECISION_80 available={modes.get('PRECISION_80') != 'unavailable'} · has80_netEV={has80}",
        "13": f"best n trades OOS≈{best.get('n') if best else None} (thresholded) · monthly={[(m.get('month'), m.get('n')) for m in monthly]}",
        "14": f"best NetEV={best.get('net_ev') if best else None}",
        "15": f"best MaxDD={best.get('max_dd') if best else None}",
        "16": f"best longest loss streak={best.get('longest_loss_streak') if best else None}",
        "17": f"monthly PnL spread={[(m.get('month'), m.get('sum_net'), m.get('net_ev')) for m in monthly]}",
        "18": f"stress cases={[(s.get('stress_case'), s.get('net_ev')) for s in stress]}",
        "19": f"clusters long ok={cl_long.get('ok')} n={cl_long.get('n')} · short ok={cl_short.get('ok')}",
        "20": f"live signal status={sig.get('status')} · models_loaded={bool(b_long or b_short)} · promote_only_if_pos_EV_and_WF_stable",
    }

    payload = {
        "n_bars": len(ohlc),
        "from_iso": report.get("from_iso"),
        "to_iso": report.get("to_iso"),
        "n_features": len(cols),
        "data_hash": file_hash(ROOT / "data/raw/BTCUSDT_15m.csv"),
        "splits": {k: splits[k] for k in splits if "month" in k},
        "train_metrics": metrics,
        "optimize_best": best,
        "modes": modes,
        "walk_forward": wf,
        "latest_signal": sig,
        "answers": answers,
        "philosophy": "DATA DISCOVERS · VALIDATION SELECTS · OOS PROVES · COSTS DECIDE",
    }
    write_final_report(payload)
    print("DONE → outputs/reports/FINAL_REPORT.md")
    print(json.dumps(answers, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
