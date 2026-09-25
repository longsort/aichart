# -*- coding: utf-8 -*-
import json
from pathlib import Path

r = json.loads(Path(r"d:\apps\ailongshort\data\volume-roe-stats\BTCUSDT_15m_vol_roe_41x.json").read_text(encoding="utf-8"))
print("NOTE:")
for n in r["noteKo"]:
    print("-", n)
print()
pack = r["topByHitRate"]
same = []
for x in pack:
    k = x["key"]
    if "|h4|" in k or "|h8|" in k:
        if ("sell|" in k and "|SHORT" in k) or ("buy|" in k and "|LONG" in k):
            if "RVOL0-2" not in k:
                same.append(x)
same.sort(key=lambda x: (-x["hitRate"], -x["n"]))
print("same-dir RVOL>=2 h1h/2h:")
for x in same[:12]:
    print(f"  {x['key']:48} {x['hitRate']*100:5.1f}%  n={x['n']}")
print("\nsell->short ROE8:")
for x in r["sellHeavyShort8"][:8]:
    print(f"  {x['key']:48} {x['hitRate']*100:5.1f}%  n={x['n']}")
print("\nbuy->long ROE8:")
for x in r["buyHeavyLong8"][:8]:
    print(f"  {x['key']:48} {x['hitRate']*100:5.1f}%  n={x['n']}")
print("\nstreak:")
for x in r["streakTop"][:8]:
    print(f"  {x['key']:48} {x['hitRate']*100:5.1f}%  n={x['n']}")
