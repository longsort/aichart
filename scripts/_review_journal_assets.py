#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
from collections import Counter
from datetime import datetime, timezone

p = r"D:\apps\ailongshort\assets\trade-journal-BTCUSDT-1789141217864.json"
d = json.load(open(p, encoding="utf-8"))
ev = d["events"]


def ts(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone().strftime("%m-%d %H:%M:%S")


formed = [e for e in ev if e.get("kind") == "DUMP_ZONE_FORMED"]
fps: Counter = Counter()
for e in formed:
    m = e.get("meta") or {}
    key = (
        e.get("chartTf"),
        e.get("sourceTf"),
        round(float(m.get("top") or e.get("levelPrice") or 0), 0),
        round(float(m.get("bot") or 0), 0),
    )
    fps[key] += 1
print("DUMP_ZONE_FORMED", len(formed), "unique~", len(fps))
print("formed chartTf:", dict(Counter(e.get("chartTf") for e in formed)))
print("top spam zones:")
for k, n in fps.most_common(8):
    print(f"  {n:4d}x  {k}")

focus_kinds = {
    "TOUCH_ENTRY",
    "TOUCH_SL",
    "TOUCH_TP1",
    "TOUCH_TP2",
    "TOUCH_TP3",
    "TOUCH_INV",
    "REALIZED_TP1",
    "REALIZED_SL",
    "REALIZED_INV",
    "PLAN_LOCK",
    "MASTER_VERDICT",
    "PRACTICE_AI_CONFIRM",
    "SCALP200_FIRE",
    "SCALP200_MISSED",
    "SCALP200_INVALID",
    "SIGNAL_SNAPSHOT",
    "OUTCOME_1",
    "OUTCOME_3",
    "VOL_VERDICT",
    "CANDLE_TONE",
}
print("\n=== actionable / trade-relevant ===")
for e in sorted([x for x in ev if x.get("kind") in focus_kinds], key=lambda x: x.get("at") or 0):
    note = str(e.get("noteKo") or "")[:90]
    print(
        f"{ts(e['at'])} | {e['kind']:20s} | {e.get('direction'):7s} | "
        f"px={e.get('price')} lvl={e.get('levelPrice')} | "
        f"{e.get('chartTf')}/{e.get('sourceTf')} | {e.get('levelLabel','')} | {note}"
    )

touches = [e for e in ev if e.get("kind") == "DUMP_ZONE_TOUCH"]
print("\nDUMP_ZONE_TOUCH", len(touches), "unique level:", len({round(e.get("levelPrice") or 0, 1) for e in touches}))
if touches:
    print("sample:", touches[0].get("noteKo"))

ai = [e for e in ev if str(e.get("kind", "")).startswith("AI_")]
print("\nAI", len(ai), dict(Counter(e.get("kind") for e in ai)), dict(Counter(e.get("direction") for e in ai)))

rb = [e for e in ev if str(e.get("kind", "")).startswith("RB_")]
print("RB", len(rb), dict(Counter(e.get("kind") for e in rb)))

# minutes density
by_min = Counter()
for e in ev:
    by_min[ts(e["at"])[:14]] += 1  # MM-DD HH:MM
print("\nevents/min top:")
for k, n in by_min.most_common(5):
    print(f"  {k} → {n}")
