# -*- coding: utf-8 -*-
"""Rename current Eagle1 HUD to EAGLE1_DESK; restore server ARES as MERGED_ANALYSIS_DESK."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(r"D:/apps/ailongshort")


def patch_settings() -> None:
    p = ROOT / "lib" / "settings.ts"
    t = p.read_text(encoding="utf-8")
    old = """  /**
   * 통합·분석: 차트 캔들분석(존·아이콘·구조·밴드) + 카드분석(롱/숏·고래·VRVP·타임라인) ARES/TV식 한 화면.
   * amx=1 · monthDesk 통합펄스 + mergedAdvanced 레이어.
   */
  | 'MERGED_ANALYSIS_DESK';
"""
    new = """  /**
   * 통합·분석: 차트 캔들분석(존·아이콘·구조·밴드) + 카드분석(롱/숏·고래·VRVP·타임라인) ARES/TV식 한 화면.
   * amx=1 · monthDesk 통합펄스 + mergedAdvanced 레이어.
   */
  | 'MERGED_ANALYSIS_DESK'
  /**
   * 독수리1호: Eagle1 AI FUTURES HUD (스퀴즈·MTF·브레이크레일·트레이드플랜).
   * 통합·분석(ARES)과 별도 모드.
   */
  | 'EAGLE1_DESK';
"""
    if old not in t:
        raise SystemExit("settings type block not found")
    t = t.replace(old, new, 1)
    needle = "if (uiMode === 'MERGED_ANALYSIS_DESK') {"
    repl = "if (uiMode === 'MERGED_ANALYSIS_DESK' || uiMode === 'EAGLE1_DESK') {"
    if needle not in t:
        raise SystemExit("settings toggles block not found")
    t = t.replace(needle, repl, 1)
    p.write_text(t, encoding="utf-8")
    print("settings OK")


def patch_switcher() -> None:
    p = ROOT / "app" / "components" / "UIModeSwitcher.tsx"
    t = p.read_text(encoding="utf-8")
    old = """    {
      value: 'MERGED_ANALYSIS_DESK',
      label: '통합·분석',
      title:
        '통합모드: 독수리1호 AI FUTURES HUD(스퀴즈·MTF·브레이크레일·트레이드플랜). 메인 화면과 별도 — 이 칩을 눌러 진입.',
    },
"""
    new = """    {
      value: 'MERGED_ANALYSIS_DESK',
      label: '통합·분석',
      title:
        'ARES · 스윙 차트: 캔들분석·존·밴드·기능 칩 툴바(서버 통합분석). 참고용.',
    },
    {
      value: 'EAGLE1_DESK',
      label: '독수리1호',
      title:
        '독수리1호 AI FUTURES HUD: 스퀴즈·MTF·브레이크레일·트레이드플랜. 통합·분석과 별도.',
    },
"""
    if old not in t:
        # already patched?
        if "EAGLE1_DESK" in t:
            print("UIModeSwitcher already has EAGLE1_DESK")
            return
        raise SystemExit("UIModeSwitcher block not found")
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("UIModeSwitcher OK")


def patch_merged_desk() -> None:
    p = ROOT / "app" / "components" / "mergedAnalysis" / "MergedAnalysisDeskView.tsx"
    t = p.read_text(encoding="utf-8")
    if "wrapEagle1Hud" not in t:
        old_props = """  onSymbolChange?: (symbol: string) => void;
  chartSnapshotRef?: React.RefObject<ChartSnapshotRef | null>;
};"""
        new_props = """  onSymbolChange?: (symbol: string) => void;
  chartSnapshotRef?: React.RefObject<ChartSnapshotRef | null>;
  /** true면 독수리1호 HUD로 감쌈. false(기본)=서버 ARES 통합·분석 */
  wrapEagle1Hud?: boolean;
};"""
        if old_props not in t:
            raise SystemExit("MergedAnalysisDeskView props not found")
        t = t.replace(old_props, new_props, 1)

        # destructuring — find export default function args
        old_sig = "  chartSnapshotRef,\n}: Props)"
        new_sig = "  chartSnapshotRef,\n  wrapEagle1Hud = false,\n}: Props)"
        if old_sig not in t:
            raise SystemExit("MergedAnalysisDeskView destructure not found")
        t = t.replace(old_sig, new_sig, 1)

    # header hidden only for eagle1
    t = t.replace(
        '<header className={styles.mergedDeskHeader} hidden>',
        "<header className={styles.mergedDeskHeader} hidden={wrapEagle1Hud || undefined}>",
        1,
    )
    # if already boolean form, ok

    # eagle1ModeFsStrip — wrap in wrapEagle1Hud
    if "data-eagle1-mode-fs" in t and "{wrapEagle1Hud && (" not in t.split("data-eagle1-mode-fs")[0][-80:]:
        marker = "          {/* Eagle1: 모드칩 오른쪽 전체화면 — 숨김 툴바와 별도 항상 표시 */}\n          <div className={styles.eagle1ModeFsStrip}"
        if marker in t:
            t = t.replace(
                marker,
                "          {wrapEagle1Hud ? (\n          <div className={styles.eagle1ModeFsStrip}",
                1,
            )
            # close after strip div — find end of strip button block
            close_marker = '              {fsActive ? "⛶ 종료" : "⛶ 전체화면"}\n            </button>\n          </div>\n          <div\n            className={`${styles.mergedChartToolbar}'
            # local file uses different quotes
            close_marker2 = "              {fsActive ? '⛶ 종료' : '⛶ 전체화면'}\n            </button>\n          </div>\n          <div\n            className={`${styles.mergedChartToolbar}"
            if close_marker2 in t:
                t = t.replace(
                    close_marker2,
                    "              {fsActive ? '⛶ 종료' : '⛶ 전체화면'}\n            </button>\n          </div>\n          ) : null}\n          <div\n            className={`${styles.mergedChartToolbar}",
                    1,
                )

    # ending wrap
    old_end = """  /** 네이티브 FS 중 Eagle1 언랩하면 DOM 리마운트로 전체화면이 즉시 해제됨(깜빡임) — 항상 유지 */
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
    new_end = """  if (!wrapEagle1Hud) return shell;
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
    if old_end in t:
        t = t.replace(old_end, new_end, 1)
    elif "if (!wrapEagle1Hud) return shell;" not in t:
        raise SystemExit("MergedAnalysisDeskView end wrap not found")

    p.write_text(t, encoding="utf-8")
    print("MergedAnalysisDeskView OK")


def patch_homepage() -> None:
    p = ROOT / "app" / "HomePageContent.tsx"
    t = p.read_text(encoding="utf-8")

    # allow EAGLE1 in storage
    if "v === 'EAGLE1_DESK'" not in t:
        t = t.replace(
            "      v === 'MERGED_ANALYSIS_DESK' ||\n      v === 'EXECUTION' ||",
            "      v === 'MERGED_ANALYSIS_DESK' ||\n      v === 'EAGLE1_DESK' ||\n      v === 'EXECUTION' ||",
            1,
        )

    t = t.replace(
        "  const useEagle1StructureDesk = uiMode === 'MERGED_ANALYSIS_DESK';",
        "  const useEagle1StructureDesk = uiMode === 'EAGLE1_DESK';",
        1,
    )

    # Fix MERGED branch: remove structureDeskLayout, wrapEagle1Hud false, class merged-analysis
    # Current local has chart-wrap--eagle1-structure chart-wrap--merged-host and structureDeskLayout
    old_merged_open = """              ) : uiMode === 'MERGED_ANALYSIS_DESK' ? (
              /** Eagle1 HUD는 MergedAnalysisDeskView 내부에서만 1회 감쌈 — 이중 TRADE PLAN 방지 */
              <div className="chart-wrap chart-wrap--eagle1-structure chart-wrap--merged-host">
                <MergedAnalysisDeskView
"""
    new_merged_open = """              ) : uiMode === 'MERGED_ANALYSIS_DESK' ? (
              /** 서버 ARES 통합·분석 — Eagle1 HUD 없음, 기능 칩 툴바 표시 */
              <div className="chart-wrap chart-wrap--merged-analysis">
                <MergedAnalysisDeskView
                  wrapEagle1Hud={false}
"""
    if old_merged_open in t:
        t = t.replace(old_merged_open, new_merged_open, 1)
    elif 'wrapEagle1Hud={false}' not in t:
        # try alternate class string
        alt = """              ) : uiMode === 'MERGED_ANALYSIS_DESK' ? (
              /** Eagle1 HUD는 MergedAnalysisDeskView 내부에서만 1회 감쌈 — 이중 TRADE PLAN 방지 */
              <div className="chart-wrap chart-wrap--merged-analysis">
                <MergedAnalysisDeskView
"""
        if alt in t:
            t = t.replace(
                alt,
                """              ) : uiMode === 'MERGED_ANALYSIS_DESK' ? (
              /** 서버 ARES 통합·분석 — Eagle1 HUD 없음, 기능 칩 툴바 표시 */
              <div className="chart-wrap chart-wrap--merged-analysis">
                <MergedAnalysisDeskView
                  wrapEagle1Hud={false}
""",
                1,
            )
        else:
            print("WARN: MERGED open block variant — manual check")

    # Remove structureDeskLayout from MERGED ChartView only — tricky.
    # Find first structureDeskLayout after MERGED_ANALYSIS_DESK branch and remove one occurrence
    # Better: replace structureDeskLayout\n in merged slot by scanning

    # Insert EAGLE1_DESK branch before MONTH_START or before useEagle1StructureDesk
    if "uiMode === 'EAGLE1_DESK'" not in t.split("MergedAnalysisDeskView")[0] if False else ("uiMode === 'EAGLE1_DESK'" not in t or t.count("EAGLE1_DESK") < 3):
        # Build eagle1 branch from merged pattern with wrap true + structureDeskLayout
        eagle_branch = """              ) : uiMode === 'EAGLE1_DESK' ? (
              <div className="chart-wrap chart-wrap--eagle1-structure chart-wrap--merged-host">
                <MergedAnalysisDeskView
                  wrapEagle1Hud
                  uiMode="MERGED_ANALYSIS_DESK"
                  onUiModeChange={handleUiModeChange}
                  symbol={symbol}
                  timeframe={timeframe}
                  theme={theme}
                  analysis={analysis}
                  loading={loading}
                  fusionCandles={fusionCandles}
                  chartSnapshotRef={chartSnapshotRef}
                  onRequestChartTf={(tf) => {
                    timeframeRef.current = tf;
                    setTimeframe(tf);
                    prefetchMarketCandles(tf);
                    requestLoad(tf);
                  }}
                  onSymbolChange={(sym) => {
                    setSymbol(sym);
                    requestLoad(timeframeRef.current);
                  }}
                  chartSlot={({
                    mergedDeskPack,
                    mergedStrikeBundle,
                    onMirageZoneSelect,
                    selectedMirageZoneId,
                    onMergedDeskChartCandlesChange,
                  }) => (
                    <ChartView
                      ref={chartSnapshotRef}
                      useParentMergedDeskPack
                      mergedDeskPack={mergedDeskPack}
                      mergedStrikeBundle={mergedStrikeBundle}
                      onMirageZoneSelect={onMirageZoneSelect}
                      selectedMirageZoneId={selectedMirageZoneId}
                      onMergedDeskChartCandlesChange={onMergedDeskChartCandlesChange}
                      structureDeskLayout
                      symbol={symbol}
                      timeframe={timeframe}
                      analysis={analysis}
                      setTimeframe={setTimeframe}
                      onTimeframeChange={(tf) => {
                        timeframeRef.current = tf;
                        prefetchMarketCandles(tf);
                        requestLoad(tf);
                      }}
                      theme={theme}
                      onChartPointClick={handleChartPointClick}
                      uiMode="MERGED_ANALYSIS_DESK"
                      onUiModeChange={handleUiModeChange}
                      zoneSignalSensitivity={zoneSignalSensitivity}
                      onZoneSignalSensitivityChange={(v) => {
                        setZoneSignalSensitivity(v);
                        saveSettings({ zoneSignalSensitivity: v });
                      }}
                      pre3SimilarityThreshold={pre3SimilarityThreshold}
                      onPre3SimilarityChange={(v) => {
                        const t = Math.max(0.55, Math.min(0.98, v));
                        setPre3SimilarityThreshold(t);
                        saveSettings({ pre3SimilarityThreshold: t });
                        requestLoad();
                      }}
                      pre3ConfirmOnCloseOnly={pre3ConfirmOnCloseOnly}
                      onPre3ConfirmOnCloseChange={(v) => {
                        setPre3ConfirmOnCloseOnly(v);
                        saveSettings({ pre3ConfirmOnCloseOnly: v });
                        requestLoad();
                      }}
                      structurePriceLinesMax={structurePriceLinesMax}
                      mtfSignals={mtfSignals}
                    />
                  )}
                />
              </div>
"""
        # Insert before MONTH_START_DESK branch
        marker = "              ) : uiMode === 'MONTH_START_DESK' ? ("
        if "uiMode === 'EAGLE1_DESK'" not in t:
            if marker not in t:
                raise SystemExit("MONTH_START marker not found")
            t = t.replace(marker, eagle_branch + "\n" + marker, 1)
            print("inserted EAGLE1_DESK branch")
        else:
            print("EAGLE1_DESK already in HomePageContent")

    # Remove structureDeskLayout from MERGED ChartView: after wrapEagle1Hud={false} block,
    # the ChartView still may have structureDeskLayout — remove only the first one in MERGED section
    # Heuristic: between wrapEagle1Hud={false} and next MONTH/EAGLE1 branch
    if "wrapEagle1Hud={false}" in t:
        start = t.find("wrapEagle1Hud={false}")
        end = t.find("uiMode === 'EAGLE1_DESK'", start)
        if end < 0:
            end = t.find("uiMode === 'MONTH_START_DESK'", start)
        chunk = t[start:end]
        if "structureDeskLayout" in chunk:
            chunk2 = chunk.replace("\n                      structureDeskLayout", "", 1)
            t = t[:start] + chunk2 + t[end:]
            print("removed structureDeskLayout from MERGED ChartView")

    # handleUiModeChange normalize EAGLE1
    if "normalized === 'EAGLE1_DESK'" not in t and "normalizedNext === 'EAGLE1" not in t:
        needle = """                : normalized === 'MERGED_ANALYSIS_DESK' ||
                    normalized === '통합분석' ||
                    normalized === '통합·분석'
                  ? 'MERGED_ANALYSIS_DESK'
"""
        # find simpler
        idx = t.find("MERGED_ANALYSIS_DESK'")
        # add after MERGED mapping in handleUiModeChange - search for pattern
        pat = "? 'MERGED_ANALYSIS_DESK'"
        # leave for now if complex

    p.write_text(t, encoding="utf-8")
    print("HomePageContent OK")


def main() -> None:
    patch_settings()
    patch_switcher()
    patch_merged_desk()
    patch_homepage()


if __name__ == "__main__":
    main()
