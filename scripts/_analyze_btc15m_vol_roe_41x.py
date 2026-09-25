# -*- coding: utf-8 -*-
"""BTC 15m volume color vs ROE@41x hit rates. Design input only — not live trading advice."""
from __future__ import annotations

import csv
import json
from pathlib import Path

CSV = Path(r"d:\apps\ailongshort\data\bitget-futures\BTCUSDT_15m.csv")
LEV = 41.0
ROE_TARGETS = (8.0, 10.0)
HORIZONS = (4, 8, 16, 32)  # 15m bars → 1h / 2h / 4h / 8h
RVOL_PERIOD = 20
OUT = Path(r"d:\apps\ailongshort\data\volume-roe-stats\BTCUSDT_15m_vol_roe_41x.json")


def clamp(n, lo, hi):
    return max(lo, min(hi, n))


def estimate_split(o, h, l, c, vol):
    if vol <= 0:
        return 0.5, "mixed"
    if h > l:
        rng = h - l
        pos = clamp((c - l) / rng, 0, 1)
        upper = h - max(o, c)
        lower = min(o, c) - l
        upper_r = upper / rng
        lower_r = lower / rng
        buy = clamp(0.18 + pos * 0.64, 0.15, 0.85)
        if upper_r >= 0.28 and pos <= 0.62:
            buy -= clamp(upper_r * 0.55, 0.08, 0.32)
        if lower_r >= 0.28 and pos >= 0.38:
            buy += clamp(lower_r * 0.55, 0.08, 0.32)
        if c < o and pos > 0.55:
            buy -= 0.08
        if c > o and pos < 0.45:
            buy += 0.06
        buy = clamp(buy, 0.14, 0.86)
    else:
        buy = 0.62 if c >= o else 0.38
    if buy >= 0.55:
        d = "buy"  # green
    elif buy <= 0.45:
        d = "sell"  # red
    else:
        d = "mixed"  # yellow
    return buy, d


def load_rows():
    rows = []
    with CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(
                {
                    "t": int(r["time_ms"]),
                    "o": float(r["open"]),
                    "h": float(r["high"]),
                    "l": float(r["low"]),
                    "c": float(r["close"]),
                    "v": float(r["volume_base"]),
                }
            )
    return rows


def main():
    rows = load_rows()
    n = len(rows)
    vols = [r["v"] for r in rows]
    sma = [0.0] * n
    for i in range(n):
        if i < RVOL_PERIOD - 1:
            continue
        sma[i] = sum(vols[i - RVOL_PERIOD + 1 : i + 1]) / RVOL_PERIOD

    price_need = {roe: roe / LEV / 100.0 for roe in ROE_TARGETS}  # fraction

    # buckets: (side, rvol_tier)
    tiers = [(0, 2), (2, 3), (3, 4), (4, 6), (6, 99)]
    tier_name = {t: f"RVOL{t[0]}-{t[1]}" for t in tiers}

    def tier_of(rvol):
        for a, b in tiers:
            if a <= rvol < b:
                return (a, b)
        return tiers[-1]

    stats = {}

    def key(side, tier, horizon, roe, way):
        return f"{side}|{tier_name[tier]}|h{horizon}|roe{roe}|{way}"

    for i in range(RVOL_PERIOD, n - max(HORIZONS) - 1):
        r = rows[i]
        if sma[i] <= 0:
            continue
        rvol = r["v"] / sma[i]
        buy_pct, side = estimate_split(r["o"], r["h"], r["l"], r["c"], r["v"])
        tier = tier_of(rvol)
        entry = r["c"]
        for h in HORIZONS:
            window = rows[i + 1 : i + 1 + h]
            if len(window) < h:
                continue
            hi = max(x["h"] for x in window)
            lo = min(x["l"] for x in window)
            for roe, need in price_need.items():
                # long: high reaches entry*(1+need)
                long_hit = hi >= entry * (1 + need)
                short_hit = lo <= entry * (1 - need)
                for way, hit in (("LONG", long_hit), ("SHORT", short_hit)):
                    k = key(side, tier, h, int(roe), way)
                    st = stats.setdefault(k, {"n": 0, "hit": 0, "sumRvol": 0.0, "sumVol": 0.0})
                    st["n"] += 1
                    st["hit"] += 1 if hit else 0
                    st["sumRvol"] += rvol
                    st["sumVol"] += r["v"]

    # also: consecutive same-side streaks ending at i
    streak_stats = {}
    streak = 1
    prev_side = None
    for i in range(RVOL_PERIOD, n - max(HORIZONS) - 1):
        r = rows[i]
        _, side = estimate_split(r["o"], r["h"], r["l"], r["c"], r["v"])
        if side == prev_side and side != "mixed":
            streak += 1
        else:
            streak = 1
            prev_side = side
        if side == "mixed" or streak < 2:
            continue
        if sma[i] <= 0:
            continue
        rvol = r["v"] / sma[i]
        if rvol < 2:
            continue
        entry = r["c"]
        for h in (8, 16):
            window = rows[i + 1 : i + 1 + h]
            if len(window) < h:
                continue
            hi = max(x["h"] for x in window)
            lo = min(x["l"] for x in window)
            for roe, need in price_need.items():
                # sell streak → short bias; buy streak → long bias
                if side == "sell":
                    hit = lo <= entry * (1 - need)
                    way = "SHORT"
                else:
                    hit = hi >= entry * (1 + need)
                    way = "LONG"
                sk = f"streak{streak}+|{side}|h{h}|roe{int(roe)}|{way}"
                st = streak_stats.setdefault(sk, {"n": 0, "hit": 0})
                st["n"] += 1
                st["hit"] += 1 if hit else 0

    def pack(d):
        out = []
        for k, st in d.items():
            if st["n"] < 12:
                continue
            rate = st["hit"] / st["n"]
            row = {
                "key": k,
                "n": st["n"],
                "hit": st["hit"],
                "hitRate": round(rate, 4),
                "avgRvol": round(st.get("sumRvol", 0) / st["n"], 2) if "sumRvol" in st else None,
                "avgVol": round(st.get("sumVol", 0) / st["n"], 2) if "sumVol" in st else None,
            }
            out.append(row)
        out.sort(key=lambda x: (-x["hitRate"], -x["n"]))
        return out

    # top insights: sell+high rvol → short ROE, buy+high rvol → long ROE
    packed = pack(stats)
    streak_packed = pack({k: {**v, "sumRvol": 0, "sumVol": 0} for k, v in streak_stats.items()})

    price_pct_8 = 8 / LEV
    price_pct_10 = 10 / LEV

    report = {
        "symbol": "BTCUSDT",
        "tf": "15m",
        "bars": n,
        "from": rows[0]["t"],
        "to": rows[-1]["t"],
        "leverage": LEV,
        "noteKo": [
            f"41배에서 ROE 8% ≈ 가격 {price_pct_8:.3f}% 이동",
            f"41배에서 ROE 10% ≈ 가격 {price_pct_10:.3f}% 이동",
            "막대색: buy≥55%녹 · sell≤45%빨 · 그사이 노랑(mixed)",
            "CSV에 taker 없음 → 종가위치 추정(앱 estimateBarBuySell과 동일 계열)",
            "표본≈1개월 · 확정 승률·수익 아님 · 설계용",
        ],
        "topByHitRate": packed[:40],
        "sellHeavyShort8": [x for x in packed if "sell|" in x["key"] and "SHORT" in x["key"] and "roe8" in x["key"]][:15],
        "buyHeavyLong8": [x for x in packed if "buy|" in x["key"] and "LONG" in x["key"] and "roe8" in x["key"]][:15],
        "mixedYellow": [x for x in packed if "mixed|" in x["key"]][:15],
        "streakTop": streak_packed[:20],
        "designHintKo": {
            "entryFilter": "RVOL≥3 + 방향(빨=숏/녹=롱) + (BTC)15m꼬리·추정70 또는 폭락확정",
            "avoid": "노랑(mixed) 단독 진입 · RVOL<2",
            "tp": "41x ROE 8% 1차 · 10%는 표본상 도달률 더 낮음 → 러너/부분익절",
            "ui": "차트 거래량 색·마커만 · 카드/HUD 금지 · 성적 패널은 자동매매 저널 탭에 통계줄",
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT)
    print("bars", n, "top5:")
    for x in packed[:5]:
        print(x["key"], "n=", x["n"], "hit=", f"{x['hitRate']*100:.1f}%")
    print("--- sell→short ROE8 ---")
    for x in report["sellHeavyShort8"][:5]:
        print(x["key"], f"{x['hitRate']*100:.1f}%", "n", x["n"])
    print("--- buy→long ROE8 ---")
    for x in report["buyHeavyLong8"][:5]:
        print(x["key"], f"{x['hitRate']*100:.1f}%", "n", x["n"])


if __name__ == "__main__":
    main()
