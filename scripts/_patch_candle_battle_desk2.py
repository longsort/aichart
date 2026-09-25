# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r"d:\apps\ailongshort\app\components\mergedAnalysis\MergedAnalysisDeskView.tsx")
t = p.read_text(encoding="utf-8")

# --- build pack after aiMarketZonePack ---
pack_anchor = """    const aiMarketZoneOverlays = aiMarketZonePack?.overlays ?? [];
    const aiMarketZonePriceLines = aiMarketZonePack?.priceLines ?? [];
"""
pack_insert = pack_anchor + """    const candleBattlePack: CandleBattlePack | null =
      candleBattleOn && deskCandles.length >= 40
        ? buildCandleBattlePack({
            symbol,
            timeframe,
            candles: deskCandles,
            htfCandles: rbSmcHtfCandles.length >= 24 ? rbSmcHtfCandles : null,
            htfLabel: rbSmcHtfTf || '4h',
            volumeDelta: (deferredAnalysisReady ? deferredAnalysis : analysis)?.volumeDelta ?? null,
            buyPressure: (deferredAnalysisReady ? deferredAnalysis : analysis)?.buyPressure ?? null,
            sellPressure: (deferredAnalysisReady ? deferredAnalysis : analysis)?.sellPressure ?? null,
            orderbookImbalance:
              (deferredAnalysisReady ? deferredAnalysis : analysis)?.orderbookImbalance ?? null,
            oiState: (deferredAnalysisReady ? deferredAnalysis : analysis)?.oiState ?? null,
            fundingState: (deferredAnalysisReady ? deferredAnalysis : analysis)?.fundingState ?? null,
            hasTrades: true,
            hasOrderbook:
              typeof (deferredAnalysisReady ? deferredAnalysis : analysis)?.orderbookImbalance ===
              'number',
            hasCvd: typeof (deferredAnalysisReady ? deferredAnalysis : analysis)?.volumeDelta === 'number',
            hasOrderbookHistory: false,
          })
        : null;
    const candleBattleOverlays = candleBattlePack?.overlays ?? [];
    const candleBattlePriceLines = candleBattlePack?.priceLines ?? [];
    const candleBattleMarkers = candleBattlePack?.chartMarkers ?? [];
"""
if "candleBattlePack:" not in t and "const candleBattlePack" not in t:
    if pack_anchor not in t:
        raise SystemExit("pack anchor not found")
    t = t.replace(pack_anchor, pack_insert, 1)
    print("pack build ok")
else:
    print("pack already")

# --- merge into overlays return (aiMarketZoneOverlays line) ---
ov_old = """        ...eagle1ZoneOvs,
        ...aiMarketZoneOverlays,
        ...avwapEntryGuideOverlays,
"""
ov_new = """        ...eagle1ZoneOvs,
        ...aiMarketZoneOverlays,
        ...candleBattleOverlays,
        ...avwapEntryGuideOverlays,
"""
if "...candleBattleOverlays," not in t:
    if ov_old not in t:
        raise SystemExit("overlay merge not found")
    t = t.replace(ov_old, ov_new, 1)
    print("overlay merge ok")
else:
    print("overlay merge already")

# --- markers ---
mk_old = "      markers: [...(deskPack.markers ?? []), ...rbCoreMarkers, ...newsDraw.markers],"
mk_new = "      markers: [...(deskPack.markers ?? []), ...rbCoreMarkers, ...newsDraw.markers, ...candleBattleMarkers],"
if "...candleBattleMarkers]" not in t and "...candleBattleMarkers," not in t:
    if mk_old not in t:
        raise SystemExit("markers merge not found")
    t = t.replace(mk_old, mk_new, 1)
    print("markers ok")
else:
    print("markers already")

# --- priceLines ---
pl_old = """      priceLines: dedupeMergedDeskAxisPriceLines([
        ...aiPriceLines,
        ...aiMarketZonePriceLines,
"""
pl_new = """      priceLines: dedupeMergedDeskAxisPriceLines([
        ...aiPriceLines,
        ...aiMarketZonePriceLines,
        ...candleBattlePriceLines,
"""
if "...candleBattlePriceLines," not in t:
    if pl_old not in t:
        raise SystemExit("priceLines merge not found")
    t = t.replace(pl_old, pl_new, 1)
    print("priceLines ok")
else:
    print("priceLines already")

# --- deps ---
dep_old = """    aiMarketZoneOn,
    aiMarketZoneLive,
"""
dep_new = """    aiMarketZoneOn,
    aiMarketZoneLive,
    candleBattleOn,
"""
if "candleBattleOn," not in t[t.find("aiMarketZoneLive"): t.find("aiMarketZoneLive") + 200]:
    # more careful: only in dependency array after aiMarketZoneLive
    pass

if dep_old in t and "candleBattleOn,\n    vwapMarketCtx" not in t and "candleBattleOn,\n    avwapOn" not in t:
    # insert once near deps
    t = t.replace(dep_old, dep_new, 1)
    print("deps ok")
else:
    print("deps skip/already")

# --- chip after wave path ---
chip_anchor = """                  파동경로
                </button>
              ) : null}
"""
chip_add = """                  파동경로
                </button>
              ) : null}
              <button
                type=\"button\"
                className={`tool-chip tool-chip-button ${candleBattleOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !candleBattleOn;
                  setCandleBattleOn(next);
                  saveSettings({ chartMergedDeskCandleBattleEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title=\"REAL CANDLE BATTLE — 실캔들 Sweep/SFP/흡수/CHoCH/Displacement/경로 (가짜데이터 없음)\"
                style={{
                  fontWeight: 800,
                  borderColor: candleBattleOn ? 'rgba(251,191,36,0.65)' : undefined,
                  background: candleBattleOn
                    ? 'linear-gradient(90deg, rgba(251,191,36,0.22), rgba(74,222,128,0.16))'
                    : undefined,
                }}
              >
                캔들전투
              </button>
"""
if "캔들전투" not in t:
    if chip_anchor not in t:
        raise SystemExit("chip anchor not found")
    t = t.replace(chip_anchor, chip_add, 1)
    print("chip ok")
else:
    print("chip already")

# --- phase strip + panes before chart wrap content strips ---
ui_anchor = """          <div
            className={`${styles.mergedChartWrap}${loading && !analysis ? ' loadingPulse' : ''}${fsActive ? ` ${styles.mergedChartWrapFsOnly}` : ''}${mobileFsActive ? ` ${styles.mergedChartWrapMobileFs}` : ''}`}
            style={{ position: 'relative' }}
          >
"""
ui_insert = """          {candleBattleOn && candleBattlePackForUi ? (
            <CandleBattlePhaseStrip pack={candleBattlePackForUi} />
          ) : null}
          <div
            className={`${styles.mergedChartWrap}${loading && !analysis ? ' loadingPulse' : ''}${fsActive ? ` ${styles.mergedChartWrapFsOnly}` : ''}${mobileFsActive ? ` ${styles.mergedChartWrapMobileFs}` : ''}`}
            style={{ position: 'relative' }}
          >
"""
# Need a memo/ref for pack outside useMemo - use deskPackForChart path.
# Simpler: store on deskPackForChart as candleBattlePack field.

p.write_text(t, encoding="utf-8", newline="\n")
print("partial2 written", len(t))
