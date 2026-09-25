#!/usr/bin/env python3
"""Summarize a trade-journal JSON export."""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone


def ts(ms: int) -> str:
    if not ms:
        return "?"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")


def main(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    events = data.get("events") or []
    print("schema:", data.get("schema"))
    print("exportedAt:", data.get("exportedAt"))
    print("symbol:", data.get("symbol"))
    print("count:", data.get("count"), "events_len:", len(events))

    kinds = Counter(e.get("kind") for e in events)
    dirs = Counter(e.get("direction") for e in events)
    tfs = Counter(e.get("chartTf") for e in events)
    print("\n## kinds")
    for k, n in kinds.most_common():
        print(f"  {n:4d}  {k}")
    print("\n## direction", dict(dirs))
    print("## chartTf", dict(tfs.most_common(10)))

    ats = [e.get("at") or 0 for e in events if e.get("at")]
    if ats:
        print("\n## time span", ts(min(ats)), "→", ts(max(ats)))

    # price sanity — BTC scale
    bad_px = [
        e
        for e in events
        if isinstance(e.get("price"), (int, float))
        and not (1000 <= float(e["price"]) <= 1_000_000)
    ]
    bad_lv = [
        e
        for e in events
        if isinstance(e.get("levelPrice"), (int, float))
        and float(e["levelPrice"]) > 0
        and not (1000 <= float(e["levelPrice"]) <= 1_000_000)
    ]
    print(f"\n## price outliers price={len(bad_px)} level={len(bad_lv)}")
    for e in (bad_px + bad_lv)[:8]:
        print("  BAD", e.get("kind"), e.get("price"), e.get("levelPrice"), e.get("noteKo"))

    # touch / realized / plan focus
    focus = [
        "PLAN_LOCK",
        "TOUCH_ENTRY",
        "TOUCH_SL",
        "TOUCH_TP1",
        "TOUCH_TP2",
        "TOUCH_TP3",
        "TOUCH_INV",
        "REALIZED_TP1",
        "REALIZED_SL",
        "REALIZED_INV",
        "APPROACH_ENTRY",
        "DUMP_ZONE_TOUCH",
        "DUMP_ZONE_FORMED",
        "PRACTICE_AI_CONFIRM",
        "MASTER_VERDICT",
        "SCALP200_FIRE",
    ]
    print("\n## recent focus events")
    focus_ev = [e for e in events if e.get("kind") in focus]
    focus_ev.sort(key=lambda e: e.get("at") or 0, reverse=True)
    for e in focus_ev[:40]:
        print(
            f"  {ts(e.get('at') or 0)} | {e.get('kind'):22s} | {e.get('direction'):6s} | "
            f"px={e.get('price')} lvl={e.get('levelPrice')} | {e.get('chartTf')}/{e.get('sourceTf')} | "
            f"{str(e.get('levelLabel') or '')[:28]} | {str(e.get('noteKo') or '')[:50]}"
        )

    # signalId groups with outcomes
    by_sig: dict[str, list] = defaultdict(list)
    for e in events:
        sid = e.get("signalId")
        if sid:
            by_sig[sid].append(e)
    print(f"\n## signalId groups: {len(by_sig)}")
    scored = []
    for sid, rows in by_sig.items():
        kinds_s = {r.get("kind") for r in rows}
        scored.append((len(rows), sid, kinds_s, rows))
    scored.sort(reverse=True)
    for n, sid, kinds_s, rows in scored[:8]:
        rows = sorted(rows, key=lambda e: e.get("at") or 0)
        print(f"\n  signal {sid} n={n} kinds={sorted(kinds_s)}")
        for e in rows[:12]:
            print(f"    {ts(e.get('at') or 0)} {e.get('kind')} {e.get('direction')} {e.get('noteKo')}")

    # dump zones summary
    dumps = [e for e in events if e.get("kind") in ("DUMP_ZONE_FORMED", "DUMP_ZONE_TOUCH", "DUMP_LIFE_CHANGE")]
    print(f"\n## dump events: {len(dumps)}")
    for e in sorted(dumps, key=lambda x: x.get("at") or 0, reverse=True)[:12]:
        meta = e.get("meta") or {}
        print(
            f"  {ts(e.get('at') or 0)} {e.get('kind')} {e.get('sourceTf')} "
            f"top={meta.get('top')} bot={meta.get('bot')} | {e.get('noteKo')}"
        )
    return 0


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    if not path:
        print("usage: summarize_trade_journal.py <path>")
        raise SystemExit(2)
    raise SystemExit(main(path))
