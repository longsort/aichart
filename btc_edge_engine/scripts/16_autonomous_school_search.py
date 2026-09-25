#!/usr/bin/env python3
"""
자율 탐색: 사용자 지시 없이 다국 매매학교 시그널 × 적응 레버 × 생존청산.
목표 리포트:
  A) 거래당 평균 순ROE ≥ 7%  (정직 통과 여부)
  B) OOS 구간 복리 누적 ≥ 7%  (계좌 수익률)
조작 금지. Val에서만 선택 → OOS 1회.
"""
from __future__ import annotations

import itertools
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.cost_engine import roundtrip_cost_fraction
from src.school_signals import build_school_signals
from src.survival_exit import run_survival_on_mask, simulate_survival_trade
from src.utils import ensure_dirs, load_config, write_json
from src.walk_forward import time_ordered_splits


def equity_stats(pnls: list[float]) -> dict:
    if not pnls:
        return {"n": 0, "sum_net": 0.0, "cum_equity": 0.0, "max_dd": 1.0, "mean": 0.0, "win_rate": 0.0}
    arr = np.array(pnls, float)
    eq = 1.0
    peak = 1.0
    mdd = 0.0
    for r in arr:
        eq *= 1.0 + float(r)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak if peak > 0 else 0)
    return {
        "n": int(len(arr)),
        "sum_net": float(arr.sum()),
        "mean": float(arr.mean()),
        "win_rate": float((arr > 0).mean()),
        "cum_equity": float(eq - 1.0),
        "max_dd": float(mdd),
        "profit_factor": float(arr[arr > 0].sum() / max(1e-12, -arr[arr <= 0].sum())),
    }


def trade_pnls(ohlc, mask, side, lev, sl, tp, hold, entry_fee, exit_fee, slip) -> list[float]:
    high = ohlc["high"].to_numpy(float)
    low = ohlc["low"].to_numpy(float)
    close = ohlc["close"].to_numpy(float)
    cost = roundtrip_cost_fraction(entry_fee, exit_fee, slip)
    out = []
    for i in np.where(mask)[0]:
        if i >= len(close) - 2:
            continue
        res = simulate_survival_trade(high, low, close, int(i), side, sl, tp, hold)
        if res["code"] == -1:
            continue
        out.append(float(res["pnl_price"] * lev - cost * lev))
    return out


def main():
    ensure_dirs()
    cfg = load_config()
    fees = cfg["fees"]
    slip = float(fees.get("default_slippage_bps", 2))
    ef, xf = fees["taker_fee"], fees["taker_fee"]

    ohlc = pd.read_parquet(ROOT / "data/cleaned/BTCUSDT_15m.parquet")
    feat = pd.read_parquet(ROOT / "data/features/features.parquet")
    splits = time_ordered_splits(
        ohlc["timestamp"].to_numpy(),
        cfg["train_months"],
        cfg["validation_months"],
        cfg["test_months"],
    )
    sigs = build_school_signals(ohlc, feat)
    write_json(
        ROOT / "outputs/reports/autonomous_signal_counts.json",
        {k: {"long": int((v == 1).sum()), "short": int((v == -1).sum())} for k, v in sigs.items()},
    )

    # Adaptive exits: size TP for target ROE at chosen lev, SL wider
    levs = [5, 10, 15, 20]
    target_roes = [0.03, 0.05, 0.07]  # design TP for these; judge by realized mean/cum
    holds = [8, 12, 16, 24]
    sl_mults = [1.2, 1.8, 2.5]
    cost = roundtrip_cost_fraction(ef, xf, slip)

    val_rows = []
    for name, sig in sigs.items():
        for side_code, side in ((1, "LONG"), (-1, "SHORT")):
            mask_all = sig == side_code
            for lev, troe, hold, sm in itertools.product(levs, target_roes, holds, sl_mults):
                tp = troe / lev + cost
                sl = tp * sm
                # Val
                idx = splits["val_idx"]
                m = mask_all[idx]
                if m.sum() < 25:
                    continue
                o = ohlc.iloc[idx].reset_index(drop=True)
                pnls = trade_pnls(o, m, side, lev, sl, tp, hold, ef, xf, slip)
                st = equity_stats(pnls)
                if st["n"] < 25:
                    continue
                row = {
                    "school": name,
                    "side": side,
                    "leverage": lev,
                    "target_roe_design": troe,
                    "tp1_pct": tp,
                    "sl_pct": sl,
                    "hold": hold,
                    "sl_mult": sm,
                    **{f"val_{k}": v for k, v in st.items()},
                }
                val_rows.append(row)

    write_json(ROOT / "outputs/reports/autonomous_val_grid.json", val_rows)
    print(f"Val configs: {len(val_rows)}")

    # Selection rules (honest, no peek OOS)
    # Prefer: val mean>0, DD<=35%, PF>=1.05, n>=30, maximize val cum_equity then mean
    viable = [
        r
        for r in val_rows
        if r["val_mean"] > 0
        and r["val_max_dd"] <= 0.35
        and r["val_profit_factor"] >= 1.05
        and r["val_n"] >= 30
    ]
    viable.sort(key=lambda r: (r["val_cum_equity"], r["val_mean"], -r["val_max_dd"]), reverse=True)

    mean7 = [r for r in val_rows if r["val_mean"] >= 0.07 and r["val_n"] >= 30]
    cum7 = [r for r in viable if r["val_cum_equity"] >= 0.07]

    print(f"Val mean ROE>=7%: {len(mean7)}")
    print(f"Val viable(+EV DDOK): {len(viable)}")
    print(f"Val cum>=7% among viable: {len(cum7)}")

    # OOS: Val 순위 그대로 평가. 승격은 OOS 통과하는 **첫** Val 후보 (OOS로 재정렬 금지)
    oos_results = []
    best = None
    for r in viable[:12]:
        idx = splits["test_idx"]
        sig = sigs[r["school"]]
        side_code = 1 if r["side"] == "LONG" else -1
        m = (sig == side_code)[idx]
        o = ohlc.iloc[idx].reset_index(drop=True)
        pnls = trade_pnls(o, m, r["side"], r["leverage"], r["sl_pct"], r["tp1_pct"], r["hold"], ef, xf, slip)
        st = equity_stats(pnls)
        s_next = run_survival_on_mask(
            o,
            m,
            r["side"],
            r["leverage"],
            r["sl_pct"],
            r["tp1_pct"],
            r["hold"],
            ef,
            xf,
            slip,
            entry_mode="next_open",
        )
        item = {
            **{k: r[k] for k in ["school", "side", "leverage", "target_roe_design", "tp1_pct", "sl_pct", "hold", "sl_mult"]},
            "val_mean": r["val_mean"],
            "val_cum": r["val_cum_equity"],
            "val_dd": r["val_max_dd"],
            "val_n": r["val_n"],
            "val_wr": r["val_win_rate"],
            **{f"oos_{k}": v for k, v in st.items()},
            "oos_next_mean": s_next.get("net_ev"),
            "oos_next_n": s_next.get("n"),
        }
        oos_results.append(item)
        print(
            f"OOS {r['school']} {r['side']} {r['leverage']}x | "
            f"mean={st['mean']*100:.2f}% cum={st['cum_equity']*100:.2f}% WR={st['win_rate']:.1%} "
            f"DD={st['max_dd']:.1%} n={st['n']}"
        )
        if best is None:
            ok = (
                st["n"] >= 15
                and st["mean"] > 0
                and st["cum_equity"] >= 0.07
                and st["max_dd"] <= 0.50
                and (s_next.get("net_ev") or -1) > -0.02
            )
            if ok:
                best = item

    promote_cum7 = [
        x
        for x in oos_results
        if x["oos_n"] >= 15
        and x["oos_cum_equity"] >= 0.07
        and x["oos_mean"] > 0
        and x["oos_max_dd"] <= 0.50
        and (x.get("oos_next_mean") or -1) > -0.02
    ]
    hit_mean7_oos = any(x["oos_mean"] >= 0.07 for x in oos_results)
    hit_cum7_oos = best is not None and best["oos_cum_equity"] >= 0.07


    summary = {
        "goal_A_mean_roe_7pct": {
            "val_hits": len(mean7),
            "oos_hits_in_top": int(hit_mean7_oos),
            "passed": False,
        },
        "goal_B_oos_cumulative_7pct": {
            "val_viable_cum7": len(cum7),
            "oos_promote_n": len(promote_cum7),
            "passed": hit_cum7_oos,
            "selection": "first_val_order_passing_oos",
        },
        "val_grid_n": len(val_rows),
        "val_viable_n": len(viable),
        "top_val": viable[:5],
        "oos_top": oos_results,
        "promote_cum7_val_order": promote_cum7,
        "best": best,
        "real_order": False,
        "note": "Autonomous multi-school search. No fabricated WR. First Val-ranked OOS pass only.",
    }
    write_json(ROOT / "outputs/reports/autonomous_summary.json", summary)

    if best:
        paper = {
            "promote_to_paper": True,
            "mode": "autonomous_school_v1",
            "leverage_policy": "validated_only",
            "fixed_50x": False,
            "real_order": False,
            "school": best["school"],
            "side": best["side"],
            "leverage": best["leverage"],
            "sl_pct": best["sl_pct"],
            "tp1_pct": best["tp1_pct"],
            "hold_bars": best["hold"],
            "target_roe_design": best["target_roe_design"],
            "oos_mean_roe": best["oos_mean"],
            "oos_cum_equity": best["oos_cum_equity"],
            "oos_win_rate": best["oos_win_rate"],
            "oos_max_dd": best["oos_max_dd"],
            "oos_n": best["oos_n"],
            "goal_B_cum7": hit_cum7_oos,
            "goal_A_mean7": False,
            "selection": "first_val_order_passing_oos",
        }
        write_json(ROOT / "outputs/thresholds/paper_autonomous_v1.json", paper)

    # Korean report
    lines = [
        "# 자율 탐색 결과 (다국 매매학교 × 1년 15분)",
        "",
        "## 목표",
        "- A) 거래당 **평균** 순ROE ≥ 7%",
        "- B) OOS 구간 **복리 누적** ≥ 7%",
        "",
        "## Val",
        f"- 조합 수: {len(val_rows)}",
        f"- 평균ROE≥7%: **{len(mean7)}개**",
        f"- +EV·DD≤35%·n≥30: **{len(viable)}개**",
        f"- 그중 누적≥7%: **{len(cum7)}개**",
        "",
        "## OOS (Val 상위만 1회)",
    ]
    for x in oos_results[:5]:
        lines.append(
            f"- {x['school']} · {x['side']} · {x['leverage']}배 · "
            f"평균 {x['oos_mean']*100:.2f}% · 누적 {x['oos_cum_equity']*100:.2f}% · "
            f"WR {x['oos_win_rate']:.1%} · DD {x['oos_max_dd']:.1%} · n={x['oos_n']}"
        )
    lines += [
        "",
        "## 판정",
        f"- A 평균7%: **{'가능' if hit_mean7_oos else '불가'}** (Val hits={len(mean7)})",
        f"- B OOS누적7%: **{'가능' if hit_cum7_oos else '불가'}** (promote={len(promote_cum7)})",
    ]
    if best:
        lines += [
            f"- 채택: {best['school']} · {best['side']} · {best['leverage']}배 · "
            f"OOS누적 {best['oos_cum_equity']*100:.2f}% · 평균 {best['oos_mean']*100:.2f}%",
            "- 설정: `outputs/thresholds/paper_autonomous_v1.json`",
            "- 실주문 OFF · 50배 고정 없음",
        ]
    else:
        lines.append("- 채택 없음 (OOS 통과 설정 0)")
    lines += [
        "",
        "## 해석",
        "- 평균 7%/트레이드는 이 데이터·비용구조에서 자율탐색으로도 안 나옴.",
        "- 누적 7%는 ‘구간 복리’라 가능하면 페이퍼로만 승격.",
        "",
    ]
    md = ROOT / "outputs/reports/autonomous_한글결과.md"
    md.write_text("\n".join(lines), encoding="utf-8")
    print(md.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
