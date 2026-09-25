from pathlib import Path

p = Path(r"d:\apps\ailongshort\lib\settings.ts")
t = p.read_text(encoding="utf-8")

if "chartMergedDeskBtccionDrawEnabled" not in t:
    t = t.replace(
        "chartMergedDeskUnifiedCloudEnabled: boolean;\n  /** 고래 모드: Multi-Anchored LinReg",
        "chartMergedDeskUnifiedCloudEnabled: boolean;\n  /** 통합·분석 — btccion 스타일 캔들 작도(반응/돌파/무효/헌트/경로/빔) */\n  chartMergedDeskBtccionDrawEnabled: boolean;\n  /** 고래 모드: Multi-Anchored LinReg",
    )

t = t.replace(
    "chartMergedDeskUnifiedCloudEnabled: true,\n  whaleAnchoredLinRegEnabled:",
    "chartMergedDeskUnifiedCloudEnabled: true,\n  chartMergedDeskBtccionDrawEnabled: true,\n  whaleAnchoredLinRegEnabled:",
    1,
)

marker = "if (uiMode === 'MERGED_ANALYSIS_DESK')"
idx = t.find(marker)
if idx < 0:
    raise SystemExit("no merged block")
end = t.find("if (uiMode === 'ZONE_LINE_PRO')", idx)
chunk = t[idx:end]
chunk2 = chunk.replace("showReactionZone: false,", "showReactionZone: true,", 1)
chunk2 = chunk2.replace(
    "showTailongClose: false,\n      showTailongCloseBreakout: false,",
    "showTailongClose: true,\n      showTailongCloseBreakout: true,",
    1,
)
if "chartMergedDeskBtccionDrawEnabled: true" not in chunk2:
    chunk2 = chunk2.replace(
        "chartMergedDeskUnifiedCloudEnabled: true,\n      showRsiPanel: true,",
        "chartMergedDeskUnifiedCloudEnabled: true,\n      chartMergedDeskBtccionDrawEnabled: true,\n      showRsiPanel: true,",
        1,
    )
t = t[:idx] + chunk2 + t[end:]
p.write_text(t, encoding="utf-8")
print("ok")
print("reaction", "showReactionZone: true" in chunk2)
print("btccion", "chartMergedDeskBtccionDrawEnabled" in t)
