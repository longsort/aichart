# -*- coding: utf-8 -*-
"""Add wrapEagle1Hud to server-restored MergedAnalysisDeskView for 독수리1호 only."""
from pathlib import Path

p = Path(r"D:/apps/ailongshort/app/components/mergedAnalysis/MergedAnalysisDeskView.tsx")
t = p.read_text(encoding="utf-8")

if "from '../eagle1/Eagle1StructureDesk'" not in t:
    # insert import after last import block near ChartSnapshotRef
    needle = "import type { ChartSnapshotRef } from '@/app/components/ChartView';"
    if needle not in t:
        raise SystemExit("import anchor missing")
    t = t.replace(
        needle,
        needle
        + "\nimport Eagle1StructureDesk from '../eagle1/Eagle1StructureDesk';",
        1,
    )

if "wrapEagle1Hud" not in t:
    old_props = """  onSymbolChange?: (symbol: string) => void;
  chartSnapshotRef?: React.RefObject<ChartSnapshotRef | null>;
};"""
    new_props = """  onSymbolChange?: (symbol: string) => void;
  chartSnapshotRef?: React.RefObject<ChartSnapshotRef | null>;
  /** true=독수리1호 HUD. false(기본)=서버 ARES 통합·분석 툴바·캔들분석 */
  wrapEagle1Hud?: boolean;
};"""
    if old_props not in t:
        raise SystemExit("props block missing")
    t = t.replace(old_props, new_props, 1)

    old_sig = "  chartSnapshotRef,\n}: Props) {"
    new_sig = "  chartSnapshotRef,\n  wrapEagle1Hud = false,\n}: Props) {"
    if old_sig not in t:
        raise SystemExit("destructure missing")
    t = t.replace(old_sig, new_sig, 1)

# header hide when eagle1
t = t.replace(
    "<header className={styles.mergedDeskHeader}>",
    "<header className={styles.mergedDeskHeader} hidden={wrapEagle1Hud || undefined}>",
    1,
)

# toolbar data attr for eagle1 hide vs ares show
old_tb = """          <div
            className={`${styles.mergedChartToolbar}${fsActive ? ` ${styles.mergedChartToolbarFs}` : ''}${isMobileViewport ? ` ${styles.mergedChartToolbarMobileFs}` : ''}`}
          >"""
new_tb = """          <div
            className={`${styles.mergedChartToolbar}${fsActive ? ` ${styles.mergedChartToolbarFs}` : ''}${isMobileViewport ? ` ${styles.mergedChartToolbarMobileFs}` : ''}`}
            {...(wrapEagle1Hud
              ? ({ 'data-eagle1-desk-toolbar': '1' } as const)
              : ({ 'data-merged-ares-toolbar': '1' } as const))}
          >"""
if old_tb in t:
    t = t.replace(old_tb, new_tb, 1)

# change return shell to conditional eagle1 wrap
old_end = """      <MergedDeskChartSettingsPanel
        open={mergedChartSettingsOpen}
        onOpenChange={setMergedChartSettingsOpen}
        labelTargets={chartLabelTargets}
        symbol={symbol}
      />
    </div>
  );
}
"""
# Find: the component ends with `return (` shell `);` — currently it's `return (` ... `);` closing the whole function.
# Server file ends with `  );\n}` where `);` closes return(.
# We need: const shell = (...); if (!wrap) return shell; return <Eagle1>{shell}</Eagle1>

# Simpler approach: wrap the existing return JSX
if "if (!wrapEagle1Hud) return shell;" not in t:
    # Change `  return (` at shell start to `  const shell = (` and append wrap after closing `);` before final `}`
    # Find the main return for the desk - it's `  return (\n    <div\n      className={`${styles.mergedDesk}`
    marker = "  return (\n    <div\n      className={`${styles.mergedDesk}"
    if marker not in t:
        raise SystemExit("main return marker missing")
    t = t.replace(marker, "  const shell = (\n    <div\n      className={`${styles.mergedDesk}", 1)
    # Replace final `  );\n}` of function — last occurrence
    idx = t.rfind("  );\n}")
    if idx < 0:
        raise SystemExit("final close missing")
    t = (
        t[:idx]
        + """  );
  if (!wrapEagle1Hud) return shell;
  return (
    <Eagle1StructureDesk
      analysis={analysis}
      symbol={symbol}
      timeframe={timeframe}
      selectedZoneId={selectedMirageZoneId}
      onTimeframeChange={onRequestChartTf}
    >
      {shell}
    </Eagle1StructureDesk>
  );
}
"""
    )

p.write_text(t, encoding="utf-8")
print("wrapEagle1Hud patched OK")
