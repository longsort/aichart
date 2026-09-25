# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r"d:\apps\ailongshort\app\components\mergedAnalysis\MergedAnalysisDeskView.tsx")
t = p.read_text(encoding="utf-8")

# --- imports ---
needle_imp = "import { buildAiMarketZonePack, type AmzEnginePack } from '@/lib/aiMarketZoneEngine';"
add_imp = (
    needle_imp
    + "\n"
    + "import { buildCandleBattlePack, type CandleBattlePack } from '@/lib/candleBattle';\n"
    + "import CandleBattlePhaseStrip from '@/app/components/mergedAnalysis/CandleBattlePhaseStrip';\n"
    + "import CandleBattlePanes from '@/app/components/mergedAnalysis/CandleBattlePanes';"
)
if "buildCandleBattlePack" not in t:
    if needle_imp not in t:
        raise SystemExit("amz import not found")
    t = t.replace(needle_imp, add_imp, 1)
    print("imports ok")
else:
    print("imports already")

# --- state after wavePathOn ---
state_old = """  const [wavePathOn, setWavePathOn] = useState(
    () => loadSettings().chartMergedDeskWavePathEnabled !== false
  );
"""
state_new = state_old + """  const [candleBattleOn, setCandleBattleOn] = useState(
    () => loadSettings().chartMergedDeskCandleBattleEnabled !== false
  );
"""
if "candleBattleOn" not in t:
    if state_old not in t:
        raise SystemExit("wavePath state not found")
    t = t.replace(state_old, state_new, 1)
    print("state ok")
else:
    print("state already")

# --- settings sync ---
sync_old = "      setWavePathOn(s.chartMergedDeskWavePathEnabled !== false);"
sync_new = sync_old + "\n      setCandleBattleOn(s.chartMergedDeskCandleBattleEnabled !== false);"
if "setCandleBattleOn(s.chartMergedDeskCandleBattleEnabled" not in t:
    if sync_old not in t:
        raise SystemExit("wave sync not found")
    t = t.replace(sync_old, sync_new, 1)
    print("sync ok")
else:
    print("sync already")

p.write_text(t, encoding="utf-8", newline="\n")
print("wrote partial", len(t))
