# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r"d:\apps\ailongshort\app\components\mergedAnalysis\MergedAnalysisDeskView.tsx")
t = p.read_text(encoding="utf-8")

# attach pack to return
old = "      mtfDumpPack: mtfDumpPack ?? null,\n      rbCorridorPaint: rbLive?.corridorPaint ?? null,"
new = "      mtfDumpPack: mtfDumpPack ?? null,\n      candleBattlePack: candleBattlePack ?? null,\n      rbCorridorPaint: rbLive?.corridorPaint ?? null,"
if "candleBattlePack: candleBattlePack" not in t:
    if old not in t:
        raise SystemExit("mtfDump return not found: " + repr(t[t.find("mtfDumpPack"): t.find("mtfDumpPack")+120]))
    t = t.replace(old, new, 1)
    print("return field ok")
else:
    print("return field already")

# UI before chart wrap
ui_old = """          <div
            className={`${styles.mergedChartWrap}${loading && !analysis ? ' loadingPulse' : ''}${fsActive ? ` ${styles.mergedChartWrapFsOnly}` : ''}${mobileFsActive ? ` ${styles.mergedChartWrapMobileFs}` : ''}`}
            style={{ position: 'relative' }}
          >
"""
ui_new = """          {candleBattleOn && (deskPackForChart as { candleBattlePack?: CandleBattlePack | null } | null)?.candleBattlePack ? (
            <CandleBattlePhaseStrip
              pack={(deskPackForChart as { candleBattlePack?: CandleBattlePack | null }).candleBattlePack!}
            />
          ) : null}
          <div
            className={`${styles.mergedChartWrap}${loading && !analysis ? ' loadingPulse' : ''}${fsActive ? ` ${styles.mergedChartWrapFsOnly}` : ''}${mobileFsActive ? ` ${styles.mergedChartWrapMobileFs}` : ''}`}
            style={{ position: 'relative' }}
          >
"""
if "CandleBattlePhaseStrip" not in t.split("mergedChartWrap")[0][-500:] and "CandleBattlePhaseStrip" not in t[t.find("mergedChartWrap")-400:t.find("mergedChartWrap")]:
    # check if already near chart wrap
    pass

if "<CandleBattlePhaseStrip" not in t:
    if ui_old not in t:
        raise SystemExit("chart wrap not found")
    t = t.replace(ui_old, ui_new, 1)
    print("phase strip ok")
else:
    print("phase strip already")

# panes after chart wrap closing - find FeatureStats / after mergedChartWrap section
# Insert after the chart wrap div's closing is hard; put after phase strip area below chart.
# Look for mobileFsSituation or after mergedChartWrap block ends with FeatureStats already before wrap.

# Place panes right after mergedChartWrap closing - search for unique nearby
pane_anchor = """          {!hideTextStrips &&
            (deskPackForChart?.deskHud?.candleCardConfluenceKo ?? deskHud?.candleCardConfluenceKo) &&
            !fsActive && (
"""
pane_insert = """          {candleBattleOn && (deskPackForChart as { candleBattlePack?: CandleBattlePack | null } | null)?.candleBattlePack ? (
            <CandleBattlePanes
              pack={(deskPackForChart as { candleBattlePack?: CandleBattlePack | null }).candleBattlePack!}
            />
          ) : null}

          {!hideTextStrips &&
            (deskPackForChart?.deskHud?.candleCardConfluenceKo ?? deskHud?.candleCardConfluenceKo) &&
            !fsActive && (
"""
if "<CandleBattlePanes" not in t:
    if pane_anchor not in t:
        raise SystemExit("pane anchor not found")
    t = t.replace(pane_anchor, pane_insert, 1)
    print("panes ok")
else:
    print("panes already")

p.write_text(t, encoding="utf-8", newline="\n")
print("done", t.count("CandleBattle"))
