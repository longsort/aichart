# -*- coding: utf-8 -*-
from pathlib import Path
import re

p = Path(r"D:\apps\ailongshort\lib\mergedDeskBtcRocketCartSignal.ts")
t = p.read_text(encoding="utf-8")


def fix(m: re.Match[str]) -> str:
    inner = m.group(1)
    if ", symbol)" in m.group(0) or ", symbol," in m.group(0):
        return m.group(0)
    if re.search(r"emptyFilter\([^)]*\)\s*,\s*\{", inner):
        return "probeOut(" + re.sub(r"(emptyFilter\([^)]*\))\s*,", r"\1, symbol,", inner, count=1) + ")"
    if re.search(r"\bfilter\s*,\s*\{", inner):
        return "probeOut(" + re.sub(r"(\bfilter)\s*,", r"\1, symbol,", inner, count=1) + ")"
    return "probeOut(" + inner.rstrip() + ", symbol)"


t2 = re.sub(r"probeOut\(([\s\S]*?)\)", fix, t)
t2 = t2.replace(
    "readAiZoneEntrySnapshot(BTC_ROCKET_CART_SYMBOL)",
    "readAiZoneEntrySnapshot(symbol)",
)
t2 = t2.replace(
    "const signalId = `btc-rkcart-${direction}-${Math.round(closedT)}`;",
    "const signalId = `rkcart-${symbol}-${direction}-${Math.round(closedT)}`;",
)
t2 = t2.replace("symbol: BTC_ROCKET_CART_SYMBOL,", "symbol,")
t2 = t2.replace(
    "analysisTags: ['BTC신호B', best.labelKo, '레이스', direction],",
    "analysisTags: ['신호B', best.labelKo, '레이스', direction, symbol],",
)
p.write_text(t2, encoding="utf-8")
print("done")
