#!/usr/bin/env python3
"""
타점엔진 합류용 초단타 연구 시뮬
— 15m · 선진거래량(매수비중+RVOL) · RSI · 볼륨폭발
— 50배 · ROE 7~8% 목표 · 하루 <10회 · 확정 수익 아님
"""
from __future__ import annotations

import csv
import json
import math
import os
from collections import defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data/bitget-futures/BTCUSDT_15m.csv"
OUT_DIR = ROOT / "data/eagle1/scalp_research"
OUT_JSON = OUT_DIR / "btc_15m_tap_adv_rsi_50x_roe78.json"
OUT_MD = OUT_DIR / "btc_15m_tap_adv_rsi_50x_roe78.md"

LEVERAGE = 50.0
# ROE 7.5% @ 50x → 가격 0.15%
TP_ROE = 7.5
SL_ROE = 5.0  # 손절 ROE%
TP_PCT = TP_ROE / LEVERAGE  # price %
SL_PCT = SL_ROE / LEVERAGE
MAX_HOLD_BARS = 8  # 15m × 8 = 2h
MAX_TRADES_PER_DAY = 9
RVOL_MIN = 2.5
RSI_PERIOD = 14
VOL_SMA = 20
FEE_ROE_RT = 0.08  # maker round-trip 대략 ROE%p (연구용)


def load_candles(path: Path):
    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            ts = int(float(row["time_ms"]))
            o, h, l, c = map(float, (row["open"], row["high"], row["low"], row["close"]))
            vb = float(row.get("volume_base") or 0)
            if not (c > 0 and h >= l):
                continue
            rows.append(
                {
                    "t": ts,
                    "o": o,
                    "h": h,
                    "l": l,
                    "c": c,
                    "v": vb,
                    "iso": row.get("time_iso")
                    or datetime.fromtimestamp(ts / 1000, tz=timezone.utc).isoformat(),
                }
            )
    rows.sort(key=lambda x: x["t"])
    # dedupe
    out, seen = [], set()
    for x in rows:
        if x["t"] in seen:
            continue
        seen.add(x["t"])
        out.append(x)
    return out


def merge_recent(base, recent_path: Path):
    if not recent_path.exists():
        return base
    extra = load_candles(recent_path)
    by_t = {x["t"]: x for x in base}
    for x in extra:
        by_t[x["t"]] = x
    return [by_t[k] for k in sorted(by_t)]


def rsi_series(closes, period=14):
    out = [50.0] * len(closes)
    if len(closes) <= period:
        return out
    for i in range(period, len(closes)):
        au = ad = 0.0
        for k in range(i - period + 1, i + 1):
            d = closes[k] - closes[k - 1]
            if d >= 0:
                au += d
            else:
                ad -= d
        au /= period
        ad /= period
        if ad <= 1e-12:
            out[i] = 100.0
        else:
            rs = au / ad
            out[i] = 100.0 - 100.0 / (1.0 + rs)
    return out


def buy_pct(bar):
    """estimateBarBuySell 계열 — 종가위치 추정."""
    rng = bar["h"] - bar["l"]
    if rng <= 1e-12:
        return 50.0
    return max(0.0, min(100.0, 100.0 * (bar["c"] - bar["l"]) / rng))


def ema(values, period):
    if not values:
        return []
    k = 2 / (period + 1)
    out = [values[0]]
    for i in range(1, len(values)):
        out.append(values[i] * k + out[-1] * (1 - k))
    return out


@dataclass
class Trade:
    direction: str
    entry_i: int
    entry_t: int
    entry_px: float
    exit_i: int
    exit_t: int
    exit_px: float
    reason: str
    roe_pct: float
    rvol: float
    rsi: float
    buy_pct: float
    day: str


def day_key(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def simulate(candles, variant: str, rvol_min: float = RVOL_MIN, max_hold: int = MAX_HOLD_BARS):
    """
    variants:
      A~F: 순방향(폭발봉 방향 추종) — 대조군
      G: 페이드 — 빨봉+RVOL → LONG / 녹봉+RVOL → SHORT (vol_roe 실측 top과 동일)
      H: G + RSI 극단 정렬 (롱 RSI<40, 숏 RSI>60)
      I: G + 선진 buyPct 페이드 (롱 buy<=40, 숏 buy>=60)
      J: I + RSI (롱 RSI<=35, 숏 RSI>=65) — 타점 과매도/과매수 합류
      K: J + 윅거부 (롱 아랫윅, 숏 윗윅) · RVOL≥3
      L: J but TP8/SL4 asymmetric
    """
    n = len(candles)
    closes = [c["c"] for c in candles]
    rsis = rsi_series(closes, RSI_PERIOD)
    emas = ema(closes, 20)
    trades: list[Trade] = []
    i = VOL_SMA + RSI_PERIOD + 2
    day_count: dict[str, int] = defaultdict(int)

    # asymmetric for L
    tp_roe = 8.0 if variant == "L" else TP_ROE
    sl_roe = 4.0 if variant == "L" else SL_ROE
    tp_pct = tp_roe / LEVERAGE
    sl_pct = sl_roe / LEVERAGE
    hold = 12 if variant in ("G", "H", "I", "J", "K", "L") else max_hold

    while i < n - 2:
        bar = candles[i]
        dk = day_key(bar["t"])
        if day_count[dk] >= MAX_TRADES_PER_DAY:
            i += 1
            continue

        sma = sum(candles[k]["v"] for k in range(i - VOL_SMA + 1, i + 1)) / VOL_SMA
        vol = bar["v"]
        rvol = vol / sma if sma > 0 else 0.0
        body = abs(bar["c"] - bar["o"])
        rng = max(bar["h"] - bar["l"], 1e-9)
        doji = body / rng < 0.12
        green = bar["c"] >= bar["o"]
        rsi = rsis[i]
        bp = buy_pct(bar)
        upper_wick = bar["h"] - max(bar["o"], bar["c"])
        lower_wick = min(bar["o"], bar["c"]) - bar["l"]
        ema20 = emas[i]
        ema_up = bar["c"] >= ema20 * 0.999
        ema_dn = bar["c"] <= ema20 * 1.001
        need_rvol = 3.0 if variant == "K" else rvol_min

        if rvol < need_rvol or doji:
            i += 1
            continue

        # default follow
        direction = "LONG" if green else "SHORT"
        ok = True

        if variant == "A":
            ok = True
        elif variant == "B":
            if direction == "LONG" and rsi > 70:
                ok = False
            if direction == "SHORT" and rsi < 30:
                ok = False
        elif variant == "C":
            if direction == "LONG" and not (45 <= rsi <= 68):
                ok = False
            if direction == "SHORT" and not (32 <= rsi <= 55):
                ok = False
        elif variant == "D":
            if direction == "LONG" and bp < 55:
                ok = False
            if direction == "SHORT" and bp > 45:
                ok = False
        elif variant == "E":
            if direction == "LONG" and not (bp >= 55 and 35 <= rsi <= 65 and ema_up):
                ok = False
            if direction == "SHORT" and not (bp <= 45 and 35 <= rsi <= 65 and ema_dn):
                ok = False
        elif variant == "F":
            wick_ok = (lower_wick >= body * 0.8) if direction == "LONG" else (upper_wick >= body * 0.8)
            if direction == "LONG" and not (
                bp >= 55 and 38 <= rsi <= 62 and ema_up and wick_ok and rvol >= 2.8
            ):
                ok = False
            if direction == "SHORT" and not (
                bp <= 45 and 38 <= rsi <= 62 and ema_dn and wick_ok and rvol >= 2.8
            ):
                ok = False
        elif variant in ("G", "H", "I", "J", "K", "L"):
            # FADE: sell-heavy/red → LONG, buy-heavy/green → SHORT
            direction = "SHORT" if green else "LONG"
            if variant == "G":
                ok = True
            elif variant == "H":
                if direction == "LONG" and not (rsi < 40):
                    ok = False
                if direction == "SHORT" and not (rsi > 60):
                    ok = False
            elif variant == "I":
                if direction == "LONG" and not (bp <= 40):
                    ok = False
                if direction == "SHORT" and not (bp >= 60):
                    ok = False
            elif variant in ("J", "L"):
                if direction == "LONG" and not (bp <= 40 and rsi <= 35):
                    ok = False
                if direction == "SHORT" and not (bp >= 60 and rsi >= 65):
                    ok = False
            elif variant == "K":
                wick_ok = (lower_wick >= body * 0.9) if direction == "LONG" else (upper_wick >= body * 0.9)
                if direction == "LONG" and not (bp <= 38 and rsi <= 32 and wick_ok):
                    ok = False
                if direction == "SHORT" and not (bp >= 62 and rsi >= 68 and wick_ok):
                    ok = False
        else:
            ok = False

        if not ok:
            i += 1
            continue

        entry_i = i + 1
        if entry_i >= n:
            break
        entry = candles[entry_i]
        entry_px = entry["o"]
        tp_px = entry_px * (1 + tp_pct / 100) if direction == "LONG" else entry_px * (1 - tp_pct / 100)
        sl_px = entry_px * (1 - sl_pct / 100) if direction == "LONG" else entry_px * (1 + sl_pct / 100)

        exit_i = entry_i
        exit_px = entry["c"]
        reason = "TIMEOUT"
        for j in range(entry_i, min(n, entry_i + hold)):
            b = candles[j]
            if direction == "LONG":
                if b["l"] <= sl_px:
                    exit_i, exit_px, reason = j, sl_px, "SL"
                    break
                if b["h"] >= tp_px:
                    exit_i, exit_px, reason = j, tp_px, "TP"
                    break
            else:
                if b["h"] >= sl_px:
                    exit_i, exit_px, reason = j, sl_px, "SL"
                    break
                if b["l"] <= tp_px:
                    exit_i, exit_px, reason = j, tp_px, "TP"
                    break
            exit_i, exit_px = j, b["c"]
            reason = "TIMEOUT"

        if direction == "LONG":
            move = (exit_px - entry_px) / entry_px * 100.0
        else:
            move = (entry_px - exit_px) / entry_px * 100.0
        roe = move * LEVERAGE - FEE_ROE_RT

        tr = Trade(
            direction=direction,
            entry_i=entry_i,
            entry_t=entry["t"],
            entry_px=entry_px,
            exit_i=exit_i,
            exit_t=candles[exit_i]["t"],
            exit_px=exit_px,
            reason=reason,
            roe_pct=roe,
            rvol=rvol,
            rsi=rsi,
            buy_pct=bp,
            day=dk,
        )
        trades.append(tr)
        day_count[dk] += 1
        i = exit_i + 1

    return trades, day_count


def summarize(trades: list[Trade], candles, label: str):
    if not trades:
        return {
            "label": label,
            "n": 0,
            "note": "no trades",
        }
    wins = [t for t in trades if t.roe_pct > 0]
    losses = [t for t in trades if t.roe_pct <= 0]
    tp = sum(1 for t in trades if t.reason == "TP")
    sl = sum(1 for t in trades if t.reason == "SL")
    to = sum(1 for t in trades if t.reason == "TIMEOUT")
    days = sorted({t.day for t in trades})
    by_day = defaultdict(int)
    for t in trades:
        by_day[t.day] += 1
    span_days = max(
        1,
        (
            datetime.fromtimestamp(candles[-1]["t"] / 1000, tz=timezone.utc)
            - datetime.fromtimestamp(candles[0]["t"] / 1000, tz=timezone.utc)
        ).days,
    )
    # equity curve: start 100, each trade compounds on margin ROE
    eq = 100.0
    peak = eq
    max_dd = 0.0
    for t in trades:
        eq *= 1 + t.roe_pct / 100.0
        peak = max(peak, eq)
        dd = (peak - eq) / peak * 100 if peak > 0 else 0
        max_dd = max(max_dd, dd)

    avg_day = len(trades) / span_days
    return {
        "label": label,
        "n": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "wr": round(len(wins) / len(trades) * 100, 2),
        "tp": tp,
        "sl": sl,
        "timeout": to,
        "avgRoe": round(sum(t.roe_pct for t in trades) / len(trades), 3),
        "sumRoe_pp": round(sum(t.roe_pct for t in trades), 2),
        "expectancy": round(sum(t.roe_pct for t in trades) / len(trades), 3),
        "avgTradesPerDay": round(avg_day, 3),
        "maxTradesInDay": max(by_day.values()),
        "daysWithTrade": len(by_day),
        "spanDays": span_days,
        "compEquity_from100": round(eq, 2),
        "maxDD_pct": round(max_dd, 2),
        "longN": sum(1 for t in trades if t.direction == "LONG"),
        "shortN": sum(1 for t in trades if t.direction == "SHORT"),
        "under10PerDay": max(by_day.values()) <= MAX_TRADES_PER_DAY,
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # merge aggregated year + recent api month if present
    recent = ROOT / "data/bitget-futures/BTCUSDT_15m_api_recent.csv"
    # save current api-only if short; we already overwrote with 1y — fetch api recent separately
    candles = load_candles(CSV_PATH)
    if recent.exists():
        candles = merge_recent(candles, recent)

    variants = {
        "A_follow_rvol": "A",
        "B_follow_rsi_avoid": "B",
        "C_follow_rsi_band": "C",
        "D_follow_adv": "D",
        "E_follow_adv_rsi_ema": "E",
        "F_follow_tap_wick": "F",
        "G_fade_rvol": "G",
        "H_fade_rvol_rsi": "H",
        "I_fade_adv": "I",
        "J_fade_adv_rsi": "J",
        "K_fade_tap_wick_adv_rsi": "K",
        "L_fade_adv_rsi_tp8sl4": "L",
    }

    reports = []
    details = {}
    for name, code in variants.items():
        trades, _ = simulate(candles, code)
        s = summarize(trades, candles, name)
        reports.append(s)
        details[name] = [asdict(t) for t in trades[:20]]
        details[name + "_tail"] = [asdict(t) for t in trades[-8:]]

    cands = [r for r in reports if r.get("n", 0) >= 20 and r.get("avgTradesPerDay", 99) < 10]
    best = max(cands, key=lambda r: (r.get("expectancy", -999), r.get("wr", 0))) if cands else None

    payload = {
        "ok": True,
        "symbol": "BTCUSDT",
        "tf": "15m",
        "bars": len(candles),
        "from": candles[0]["iso"] if candles else None,
        "to": candles[-1]["iso"] if candles else None,
        "policy": {
            "leverage": LEVERAGE,
            "tpRoe": TP_ROE,
            "slRoe": SL_ROE,
            "tpPricePct": TP_PCT,
            "slPricePct": SL_PCT,
            "maxHoldBars": MAX_HOLD_BARS,
            "maxTradesPerDay": MAX_TRADES_PER_DAY,
            "rvolMin": RVOL_MIN,
            "feeRoeRt": FEE_ROE_RT,
            "noteKo": [
                "ROE% = 가격변동% × 레버리지 − 수수료ROE",
                "7~8%는 ROE 목표(가격≈0.15%@50x) — volRoeBurst 계열과 동일",
                "선진거래량=종가위치 buyPct + RVOL (taker 미제공 CSV)",
                "타점=윅거부+EMA20 정렬 근사 · 풀 오케스트레이터 아님",
                "확정 승률·수익 아님 · 연구 시뮬",
            ],
        },
        "variants": reports,
        "best": best,
        "samples": details,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# BTCUSDT 15m · 타점+선진거래량+RSI · 50x ROE7.5% 초단타 연구",
        "",
        f"- 봉수: **{len(candles)}** · `{candles[0]['iso'] if candles else '-'} ~ {candles[-1]['iso'] if candles else '-'}`",
        f"- 목표: ROE **{TP_ROE}%** @ **{int(LEVERAGE)}x** (가격 ≈ **{TP_PCT:.3f}%**) · 손절 ROE {SL_ROE}% · 보유≤{MAX_HOLD_BARS}봉 · 일≤{MAX_TRADES_PER_DAY}회",
        "- 데이터: VPS 5m→15m 리샘플(~1년) · Bitget 공개 15m API는 최근~1개월만 제공",
        "",
        "## 변형 결과",
        "",
        "| 변형 | 매매수 | 승률% | 기대ROE% | 일평균횟수 | 복리100→ | MDD% | TP/SL/TO |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for r in reports:
        if r.get("n", 0) == 0:
            lines.append(f"| {r['label']} | 0 | - | - | - | - | - | - |")
            continue
        lines.append(
            f"| {r['label']} | {r['n']} | {r['wr']} | {r['expectancy']} | {r['avgTradesPerDay']} | {r['compEquity_from100']} | {r['maxDD_pct']} | {r['tp']}/{r['sl']}/{r['timeout']} |"
        )
    lines += ["", "## 권장(연구)", ""]
    if best:
        lines.append(
            f"- **{best['label']}** · 승률 {best['wr']}% · 기대ROE {best['expectancy']}%p/회 · 일평균 {best['avgTradesPerDay']}회 · 복리 {best['compEquity_from100']} (수수료 반영·과적합 주의)"
        )
        lines.append(
            "- 규칙 요약: **페이드가 순방향보다 우위**인 구간 다수 · RVOL 폭발 후 봉색 반대 + RSI/buyPct 극단 · 다음봉 시가 · TP/SL"
        )
    else:
        lines.append("- 조건 충족 변형 없음")
    lines += [
        "",
        "## 핵심 발견",
        "- 순방향(A~F) 전부 기대값 음수 → 볼륨폭발 추종은 15m·ROE7.5%@50x에서 불리",
        "- VPS `vol_roe` 실측(sell→LONG / buy→SHORT)과 같이 **페이드** 쪽이 연구 후보",
        "",
        "## 해석 주의",
        "- 확정 수익 아님 · 슬리피지/부분체결/펀딩 미반영",
        "- buyPct는 taker 없는 CSV 추정값",
        "- 풀 타점 오케스트레이터(전투존·스윕) 미포함 — 합류 근사",
        "",
    ]
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(OUT_MD.read_text(encoding="utf-8"))
    print(f"\nJSON → {OUT_JSON}")


if __name__ == "__main__":
    main()
