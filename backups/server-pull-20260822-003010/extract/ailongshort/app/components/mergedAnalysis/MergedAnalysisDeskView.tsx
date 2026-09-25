'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue, startTransition, type ReactNode } from 'react';
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UIMode } from '@/lib/settings';
import { loadSettings, saveSettings } from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';
import { maybeAutoResetMergedDeskChartDisplayOnce } from '@/lib/mergedDeskChartDisplaySettings';
import { MergedDeskChartSettingsPanel } from '@/app/components/mergedAnalysis/MergedDeskChartSettingsPanel';
import {
  analysisUsableOnChart,
  MERGED_DESK_SHARED_ANALYZE_TF,
} from '@/lib/mergedDesk4hReferenceAnalysis';
import { isBitgetVolumePackActive } from '@/lib/bitgetVolumePack';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesSymbol';
import UIModeSwitcher from '@/app/components/UIModeSwitcher';
import { buildMonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import { buildMonthDeskStrikeDeskOverlays } from '@/lib/monthDeskStrikeDesk';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { buildMergedAnalysisBandFusionContext } from '@/lib/mergedAnalysisTradeLayer';
import { runMergedAnalysisDeskEngine } from '@/lib/mergedAnalysisDeskEngine';
import { buildMergedDeskUnifiedCloudPack } from '@/lib/mergedDeskUnifiedCloud';
import MergedAnalysisStructureTimeline from './MergedAnalysisStructureTimeline';
import MergedAnalysisRightPanel from './MergedAnalysisRightPanel';
import MergedAnalysisBottomPanels from './MergedAnalysisBottomPanels';
import MergedAnalysisZoneLabelRail from './MergedAnalysisZoneLabelRail';
import MergedAnalysisTradeJudgmentBanner from './MergedAnalysisTradeJudgmentBanner';
import { useTfCloseSettleBoard } from '@/lib/useTfCloseSettleBoard';
import { MergedDeskSwingMidEntryCard } from './MergedDeskSwingMidEntryCard';
import { MergedDeskMobileFsSituationBar } from './MergedDeskMobileFsSituationBar';
import { logMergedDeskTradeLearning } from '@/lib/mergedAnalysisTradeLearningClient';
import { mergedDeskHideTextStrips, mergedDeskHideMobileSituationBar } from '@/lib/mergedDeskChartOnlyUi';
import { appendMasterFuturesJournal } from '@/lib/mergedDeskMasterFuturesJournal';
import type { TopsBottomsScanRow } from '@/lib/topsAndBottomsIndicator';
import type { ChartSnapshotRef } from '@/app/components/ChartView';
import type { MergedAnalysisDeskPack } from '@/lib/mergedAnalysisDeskEngine';
import { resolveMergedDeskCanonicalCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { filterMergedDeskDownsideSupportOverlays } from '@/lib/mergedAnalysisOverlayIds';
import { isMergedDeskBtccionOverlayId } from '@/lib/mergedDeskBtccionCandleDraw';
import { MERGED_DESK_DOWNSIDE_BOUNCE_PLAN_VISIBLE } from '@/lib/mergedDeskDownsideBouncePlan';
import { buildMergedDeskChannelMoneyEdgePack } from '@/lib/mergedDeskChannelMoneyEdge';
import { applyMergedDeskRbStyleToOverlays } from '@/lib/mergedDeskBlueRedChannels';
import { buildMergedDeskRbSchematicChartDraw } from '@/lib/mergedDeskRbSchematicChartDraw';
import { computeMergedDeskRbChipConfluence } from '@/lib/mergedDeskRbChipConfluence';
import {
  resolveMergedDeskActiveTradePlan,
  buildMergedDeskActiveTradePriceLines,
  isMergedDeskTradeRailPriceLine,
  summarizeMergedDeskActiveTradePlanKo,
} from '@/lib/mergedDeskActiveTradePlan';
import {
  appendLivePracticeLog,
  buildMergedDeskLivePracticeCue,
  buildMergedDeskLivePracticeOverlay,
} from '@/lib/mergedDeskLivePracticeCue';
import { buildMergedDeskAdvVolumePack } from '@/lib/mergedDeskAdvVolumeRead';
import { buildMergedDeskRocketRangeSet } from '@/lib/mergedDeskRocketRangeSet';
import { computeMergedDeskRbVolumeSync } from '@/lib/mergedDeskRbVolumeSync';
import {
  computeMergedDeskRbFullConfluence,
  stampRbOverlaysWithFullConfluence,
  stampRbPriceLinesWithFullConfluence,
} from '@/lib/mergedDeskRbFullConfluence';
import {
  buildMergedDeskRbCompleteKit,
  stampMergedDeskRbCompleteKit,
  stampMergedDeskHotZoneKitLabels,
  stampMergedDeskRbFeatureKitLabels,
} from '@/lib/mergedDeskRbCompleteKit';
import {
  computeMergedDeskRbLiveEntryHub,
  stampMergedDeskMoneyZonesWithLiveHub,
  stampMergedDeskOverlaysWithLiveHub,
} from '@/lib/mergedDeskRbLiveEntryHub';
import { computeMergedDeskRbVolumePulse } from '@/lib/mergedDeskRbVolumePulse';
import { buildMergedDeskChannelPullbackEntryPack } from '@/lib/mergedDeskChannelPullbackEntry';
import { buildMergedDeskRbRailBounceEntryPack } from '@/lib/mergedDeskRbRailBounceEntry';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import { detectMonthDeskMoneyZones } from '@/lib/monthDeskMoneyZone';
import { structureRocketDirectionOnLastCandle } from '@/lib/mtfStructureRocket';
import {
  inferMirageZoneRole,
  mergeExchangeIntelIntoOverlays,
  mirageZonesFromOverlays,
  type MirageZoneProactiveIntel,
} from '@/lib/mergedDeskMirageZoneExchangeIntel';
import {
  mergeMirageZoneDeepFaceIntoOverlays,
  mirageZoneDeepInputFromAnalysis,
  type MirageZoneDeepIntelInput,
} from '@/lib/mergedDeskMirageZoneDeepIntel';
import { ensureMirageZoneCompactFaceOnOverlays } from '@/lib/mergedDeskMirageZoneCompactLabel';
import { applyMergedDeskZoneChartLabelClean } from '@/lib/mergedDeskZoneChartLabelClean';
import {
  polishMergedDeskChartOverlays,
  stampMergedDeskMoneyZoneConfluence,
  buildMergedDeskMoneyZoneAxisLines,
  dedupeMergedDeskAxisPriceLines,
  isMergedDeskRequestedVisibleZone,
} from '@/lib/mergedAnalysisDeskVisualCleanup';
import { mirageZoneInvalidationPrice } from '@/lib/mergedDeskMirageZoneInvalidation';
import { logMirageZoneIntelSnapshot, applyMirageZoneLearningToOverlays } from '@/lib/mergedDeskMirageZoneLearning';
import {
  applyMirageZoneApproachHighlight,
  findMirageZoneApproachTarget,
} from '@/lib/mergedDeskMirageZoneApproach';
import { MergedDeskMirageZoneIntelHud } from './MergedDeskMirageZoneIntelHud';
import { isMergedDeskMirageTvZoneOverlay } from '@/lib/mergedAnalysisOverlayIds';
import {
  buildMergedDeskActionablePatternPack,
  type MergedDeskActionablePatternBrief,
} from '@/lib/mergedDeskActionablePattern';
import { buildMergedDeskCycleProgressPack } from '@/lib/mergedDeskCycleProgress';
import {
  buildMergedDeskVerdictStrip,
  pickNextNewsHint,
} from '@/lib/mergedDeskVerdictStrip';
import { buildMergedDeskDerivativesPriceLines } from '@/lib/mergedDeskDerivativesIntel';
import { buildMergedDeskNewsEventDraw } from '@/lib/mergedDeskNewsEventLines';
import { MergedDeskSchematicViewer } from './MergedDeskSchematicViewer';
import { SurgeCoinDeskPanel } from '@/app/components/surge/SurgeCoinDeskPanel';
import { OPEN_SURGE_DESK_EVENT } from '@/lib/surgeCoinScan';
import type { ClickableSchool } from '@/lib/mergedDeskSchoolSchematicCatalog';
import { asClickableSchool } from '@/lib/mergedDeskSchoolSchematicResolve';
import {
  buildMergedDeskAssetsSuperAiPack,
  type MergedDeskAssetsSuperAiBrief,
} from '@/lib/mergedDeskAssetsSuperAi';
import { MergedDeskZoneBattleHud } from './MergedDeskZoneBattleHud';
import { MergedDeskZoneBattleDetailPanel } from './MergedDeskZoneBattleDetailPanel';
import {
  resolveZoneBattlePriceRange,
  battleFromOverlay,
  type MtfZoneBattlePack,
} from '@/lib/assets353SmcZoneBattleMtf';
import {
  pickNearestSmcZoneBattle,
  type SmcZoneBattleVerdict,
} from '@/lib/assets353SmcZoneConflictIntel';
import styles from './MergedAnalysisDesk.module.css';

const PANELS_TOGGLE_KEY = 'ailongshort-merged-desk-panels';
const SWING_DRAW_KEY = 'ailongshort-merged-desk-swing-draw';

type Props = {
  uiMode: UIMode;
  onUiModeChange: (mode: UIMode) => void;
  symbol: string;
  timeframe: string;
  theme: 'dark' | 'light';
  analysis: AnalyzeResponse | null;
  loading: boolean;
  fusionCandles: Candle[] | null;
  onRequestChartTf: (tf: string) => void;
  chartSlot: (ctx: {
    mergedDeskPack: MergedAnalysisDeskPack | null;
    mergedStrikeBundle: ReturnType<typeof buildMonthDeskStrikeDeskBundle> | null;
    onMirageZoneSelect?: (zoneId: string) => void;
    selectedMirageZoneId?: string | null;
    onMergedDeskChartCandlesChange?: (candles: Candle[], chartTf?: string) => void;
  }) => ReactNode;
  onSymbolChange?: (symbol: string) => void;
  chartSnapshotRef?: React.RefObject<ChartSnapshotRef | null>;
};

const MERGED_TF_CHIPS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'] as const;

function isMobileLikeViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 960px), (hover: none) and (pointer: coarse)').matches;
}

export default function MergedAnalysisDeskView({
  uiMode,
  onUiModeChange,
  symbol,
  timeframe,
  theme,
  analysis,
  loading,
  fusionCandles,
  onRequestChartTf,
  chartSlot,
  onSymbolChange,
  chartSnapshotRef,
}: Props) {
  const chartColRef = useRef<HTMLDivElement>(null);
  const scrollLockYRef = useRef(0);
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 960px), (hover: none) and (pointer: coarse)').matches
      : false
  );
  /** 폰: 기능 칩은 기본 접고 차트 높이 확보. 기능 삭제가 아님 */
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const [swingDraw, setSwingDraw] = useState(
    () => loadSettings().chartMergedDeskSwingDrawEnabled !== false
  );
  const [blueRedChannelsOn, setBlueRedChannelsOn] = useState(
    () => loadSettings().chartMergedDeskBlueRedChannelsEnabled !== false
  );
  const [rbVolSyncOn, setRbVolSyncOn] = useState(
    () => loadSettings().chartMergedDeskRbVolumeSyncEnabled !== false
  );
  const [advVolumeOn, setAdvVolumeOn] = useState(
    () => loadSettings().chartMergedDeskAdvVolumeEnabled !== false
  );
  const [cycleProgressOn, setCycleProgressOn] = useState(
    () => loadSettings().chartMergedDeskCycleProgressEnabled !== false
  );
  const [livePracticeOn, setLivePracticeOn] = useState(
    () => loadSettings().chartMergedDeskLivePracticeCueEnabled !== false
  );
  const [practiceLogNote, setPracticeLogNote] = useState('');
  const practiceAutoLogKeyRef = useRef('');
  const [telegramTestBusy, setTelegramTestBusy] = useState(false);
  const [telegramTestNote, setTelegramTestNote] = useState('');
  const [patternDrawOn, setPatternDrawOn] = useState(
    () => loadSettings().chartMergedDeskActionablePatternEnabled !== false
  );
  const [aiToneOn, setAiToneOn] = useState(() => loadSettings().chartMergedDeskAiToneEnabled === true);
  const [mergedChartSettingsOpen, setMergedChartSettingsOpen] = useState(false);
  /** 차트설정 변경 시 오버레이 스타일 재적용용 */
  const [chartDisplayTick, setChartDisplayTick] = useState(0);
  const [overlayLabelsOn, setOverlayLabelsOn] = useState(
    () =>
      loadSettings().chartMergedDeskOverlayLabelsEnabled !== false &&
      loadSettings().chartBulkHideLabels !== true
  );
  const [rightAxisPricesOn, setRightAxisPricesOn] = useState(
    () => loadSettings().chartMergedDeskRightAxisPricesEnabled !== false
  );
  const [vrvpPocExtend, setVrvpPocExtend] = useState<'short' | 'extend20'>(
    () => (loadSettings().chartMergedDeskVrvpPocExtend === 'extend20' ? 'extend20' : 'short')
  );
  const [rbTradeStyle, setRbTradeStyle] = useState<'scalp' | 'swing' | 'mid'>(
    () => {
      const s = loadSettings().chartMergedDeskRbTradeStyle;
      return s === 'scalp' || s === 'mid' ? s : 'swing';
    }
  );
  const [pullbackEntryOn, setPullbackEntryOn] = useState(
    () => loadSettings().chartMergedDeskRbPullbackEntryEnabled !== false
  );
  const [pullbackLinesOn, setPullbackLinesOn] = useState(
    () => loadSettings().chartMergedDeskRbPullbackLinesEnabled !== false
  );
  const [pullbackMinScore, setPullbackMinScore] = useState(() => {
    const n = Number(loadSettings().chartMergedDeskRbPullbackMinScore);
    return Number.isFinite(n) ? Math.max(0, Math.min(90, n)) : 45;
  });
  const [pullbackCounterOn, setPullbackCounterOn] = useState(
    () => loadSettings().chartMergedDeskRbPullbackCounterTrend !== false
  );
  const [whaleZones, setWhaleZones] = useState<
    Array<{ price1: number; price2: number; confidence?: number }>
  >([]);
  const [tbScanRows, setTbScanRows] = useState<TopsBottomsScanRow[]>([]);
  const [tbScanSummary, setTbScanSummary] = useState('');
  const [tbScanLoading, setTbScanLoading] = useState(false);
  const [institutionalBandOn, setInstitutionalBandOn] = useState(
    () => loadSettings().chartMergedInstitutionalBandEnabled !== false
  );
  const [fusionDeskBandOn, setFusionDeskBandOn] = useState(
    () => loadSettings().chartMonthDeskFusionDeskBandEnabled !== false
  );
  const [btccionDrawOn, setBtccionDrawOn] = useState(
    () => loadSettings().chartMergedDeskBtccionDrawEnabled !== false
  );
  const [mirageFaceLang, setMirageFaceLang] = useState<'ko' | 'en'>(
    () => (loadSettings().chartMirageZoneFaceLang === 'en' ? 'en' : 'ko')
  );
  const [bitgetVolOn, setBitgetVolOn] = useState(
    () => loadSettings().chartMonthDeskBitgetCandles !== false
  );
  const [settleCloseOn, setSettleCloseOn] = useState(
    () => loadSettings().chartTfCloseSettlementLines !== false
  );
  const { board: settleBoard } = useTfCloseSettleBoard(symbol, true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSettings = () => {
      const s = loadSettings();
      setBitgetVolOn(s.chartMonthDeskBitgetCandles !== false);
      setSettleCloseOn(s.chartTfCloseSettlementLines !== false);
      setSuperAiOn(s.chartMergedDeskSuperAiEnabled !== false);
      setUnifiedCloudOn(s.chartMergedDeskUnifiedCloudEnabled !== false);
      setBtccionDrawOn(s.chartMergedDeskBtccionDrawEnabled !== false);
      setMirageFaceLang(s.chartMirageZoneFaceLang === 'en' ? 'en' : 'ko');
      setInstitutionalBandOn(s.chartMergedInstitutionalBandEnabled !== false);
      setFusionDeskBandOn(s.chartMonthDeskFusionDeskBandEnabled !== false);
      setZoneBattleHudOn(s.chartMergedDeskZoneBattleHudEnabled !== false);
      setSwingDraw(s.chartMergedDeskSwingDrawEnabled !== false);
      setBlueRedChannelsOn(s.chartMergedDeskBlueRedChannelsEnabled !== false);
      setRbVolSyncOn(s.chartMergedDeskRbVolumeSyncEnabled !== false);
      setAdvVolumeOn(s.chartMergedDeskAdvVolumeEnabled !== false);
      setCycleProgressOn(s.chartMergedDeskCycleProgressEnabled !== false);
      setLivePracticeOn(s.chartMergedDeskLivePracticeCueEnabled !== false);
      setPatternDrawOn(s.chartMergedDeskActionablePatternEnabled !== false);
      setAiToneOn(s.chartMergedDeskAiToneEnabled === true);
      setPullbackEntryOn(s.chartMergedDeskRbPullbackEntryEnabled !== false);
      setPullbackLinesOn(s.chartMergedDeskRbPullbackLinesEnabled !== false);
      {
        const n = Number(s.chartMergedDeskRbPullbackMinScore);
        setPullbackMinScore(Number.isFinite(n) ? Math.max(0, Math.min(90, n)) : 45);
      }
      setPullbackCounterOn(s.chartMergedDeskRbPullbackCounterTrend !== false);
      setOverlayLabelsOn(
        s.chartMergedDeskOverlayLabelsEnabled !== false && s.chartBulkHideLabels !== true
      );
      setRightAxisPricesOn(s.chartMergedDeskRightAxisPricesEnabled !== false);
      setVrvpPocExtend(s.chartMergedDeskVrvpPocExtend === 'extend20' ? 'extend20' : 'short');
      setRbTradeStyle(
        s.chartMergedDeskRbTradeStyle === 'scalp' || s.chartMergedDeskRbTradeStyle === 'mid'
          ? s.chartMergedDeskRbTradeStyle
          : 'swing'
      );
      setChartDisplayTick((v) => v + 1);
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettings);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettings);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    maybeAutoResetMergedDeskChartDisplayOnce();
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const storedPanels = window.localStorage.getItem(PANELS_TOGGLE_KEY);
    if (storedPanels === '1') setPanelsOpen(true);
    else if (storedPanels === '0') setPanelsOpen(false);
    else if (isMobile) setPanelsOpen(true);
    setSwingDraw(loadSettings().chartMergedDeskSwingDrawEnabled !== false);
    setBlueRedChannelsOn(loadSettings().chartMergedDeskBlueRedChannelsEnabled !== false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 960px), (hover: none) and (pointer: coarse)');
    const syncMq = () => setIsMobileViewport(mq.matches);
    syncMq();
    mq.addEventListener('change', syncMq);
    return () => mq.removeEventListener('change', syncMq);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/whale-memory?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      { credentials: 'same-origin' }
    )
      .then((r) => r.json())
      .then((j: { ok?: boolean; zones?: Array<{ price1: number; price2: number; confidence?: number }> }) => {
        if (!cancelled && j?.ok && Array.isArray(j.zones)) setWhaleZones(j.zones);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  const syncFullscreen = useCallback(() => {
    if (isMobileLikeViewport()) return;
    setChartFullscreen(document.fullscreenElement === chartColRef.current);
  }, []);

  const setMobileFsBodyLock = useCallback((on: boolean) => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (on) {
      scrollLockYRef.current = window.scrollY;
      document.body.style.top = `-${scrollLockYRef.current}px`;
      html.classList.add('merged-desk-mobile-fs');
      document.body.classList.add('merged-desk-mobile-fs');
    } else {
      html.classList.remove('merged-desk-mobile-fs');
      document.body.classList.remove('merged-desk-mobile-fs');
      document.body.style.top = '';
      window.scrollTo(0, scrollLockYRef.current);
    }
  }, []);

  const fitMobileFsHeight = useCallback(() => {
    const el = chartColRef.current;
    if (!el) return;
    const h = window.visualViewport?.height ?? window.innerHeight;
    el.style.height = `${Math.round(h)}px`;
    el.style.maxHeight = `${Math.round(h)}px`;
  }, []);

  const bumpChartResize = useCallback(() => {
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 280);
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 520);
  }, []);

  useEffect(() => {
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, [syncFullscreen]);

  useEffect(() => {
    return () => {
      setMobileFsBodyLock(false);
    };
  }, [setMobileFsBodyLock]);

  useEffect(() => {
    if (!chartFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isMobileViewport) {
        setChartFullscreen(false);
        setMobileFsBodyLock(false);
        bumpChartResize();
        return;
      }
      if (document.fullscreenElement === chartColRef.current) {
        void document.exitFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chartFullscreen, isMobileViewport, setMobileFsBodyLock, bumpChartResize]);

  useEffect(() => {
    if (!chartFullscreen || !isMobileViewport) return;
    fitMobileFsHeight();
    const onResize = () => fitMobileFsHeight();
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (chartColRef.current) {
        chartColRef.current.style.height = '';
        chartColRef.current.style.maxHeight = '';
      }
    };
  }, [chartFullscreen, isMobileViewport, fitMobileFsHeight]);

  useEffect(() => {
    if (!chartFullscreen) return;
    const r = () => window.dispatchEvent(new Event('resize'));
    const t0 = window.setTimeout(r, 0);
    const t1 = window.setTimeout(r, 120);
    const t2 = window.setTimeout(r, 350);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [chartFullscreen]);

  const toggleChartFullscreen = async () => {
    const mobile = isMobileLikeViewport();
    if (mobile) {
      setMobileToolsOpen(false);
      setChartFullscreen((v) => {
        const next = !v;
        setMobileFsBodyLock(next);
        if (next) {
          window.setTimeout(() => fitMobileFsHeight(), 0);
        }
        bumpChartResize();
        return next;
      });
      return;
    }
    const el = chartColRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      setChartFullscreen((v) => !v);
    }
    bumpChartResize();
  };

  const [chartMountReady, setChartMountReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setChartMountReady(true);
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(enable, { timeout: 480 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = window.setTimeout(enable, 32);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  /** 통합·분석: 차트 TF와 무관하게 15m 공동 분석(판정·스코어) 허용 */
  const analysisReady = analysisUsableOnChart(analysis, symbol, timeframe, 'MERGED_ANALYSIS_DESK');
  /** 엔진·zone 계산은 차트 첫 페인트 이후로 미룸 — 통합·분석 초기 로드 응답 없음 방지 */
  const deferredFusion = useDeferredValue(fusionCandles);
  const deferredAnalysis = useDeferredValue(analysis);
  const deferredAnalysisReady = analysisUsableOnChart(
    deferredAnalysis,
    symbol,
    timeframe,
    'MERGED_ANALYSIS_DESK'
  );
  /** /api/analyze 공동 TF (판정·스코어 소스) */
  const sharedAnalyzeTf = MERGED_DESK_SHARED_ANALYZE_TF;
  /** 차트 선택 TF 마켓 캔들 — ChartView 엔진 work(이미 sanitize). TF와 묶어서 deferred 불일치 방지 */
  const [chartMarketPack, setChartMarketPack] = useState<{ candles: Candle[]; tf: string }>({
    candles: [],
    tf: timeframe,
  });
  const deferredChartPack = useDeferredValue(chartMarketPack);
  const deferredChartMarket = deferredChartPack.candles;
  const deferredChartTf = deferredChartPack.tf;
  const onMergedDeskChartCandlesChange = useCallback((next: Candle[], chartTf?: string) => {
    const tf = chartTf || timeframe;
    /** TF 전환 중 빈 배열로 덮지 않음 — 이전 work 유지(15m 폴백·엔진 폭주 방지) */
    if (next.length < 12) return;
    setChartMarketPack((prev) => {
      if (prev.tf === tf && prev.candles === next) return prev;
      if (
        prev.tf === tf &&
        prev.candles.length === next.length &&
        prev.candles.length >= 2 &&
        prev.candles[0]?.time === next[0]?.time &&
        prev.candles[prev.candles.length - 1]?.time === next[next.length - 1]?.time &&
        prev.candles[prev.candles.length - 1]?.close === next[next.length - 1]?.close
      ) {
        return prev;
      }
      return { candles: next, tf };
    });
  }, [timeframe]);

  /** 심볼만 초기화 — TF 전환 시 []로 비우면 15m 폴백·팩 재계산으로 주·월 전환이 느려짐 */
  useEffect(() => {
    setChartMarketPack({ candles: [], tf: timeframe });
  }, [symbol]);

  /** 통합·분석 진입·심볼·TF 변경 시 전 TF 워밍 (현재 TF 우선 스태거) */
  useEffect(() => {
    if (uiMode !== 'MERGED_ANALYSIS_DESK') return;
    const s = loadSettings();
    const source = isBitgetVolumePackActive(uiMode, s, symbol) ? 'bitget' : 'binance';
    let cancelled = false;
    void import('@/lib/clientMarketCandleCache').then(({ prefetchMergedDeskAllMarketTfs }) => {
      if (cancelled) return;
      prefetchMergedDeskAllMarketTfs(symbol, source, timeframe);
    });
    return () => {
      cancelled = true;
    };
  }, [uiMode, symbol, timeframe]);

  /**
   * 작도 기하: 도착한 마켓 캔들의 TF를 따름 (UI TF와 잠시 달라도 재버킷 없음).
   * 마켓 로드 전에는 15m fusion 폴백.
   */
  const marketTfReady = deferredChartMarket.length >= 12;
  const geometryTf = useMemo(() => {
    if (marketTfReady) return deferredChartTf;
    return sharedAnalyzeTf;
  }, [marketTfReady, deferredChartTf, sharedAnalyzeTf]);

  const deskCandles = useMemo(() => {
    if (marketTfReady) {
      /** ChartView가 이미 sanitize+canonical — 중복 정제 생략(TF 전환 가속) */
      return deferredChartMarket;
    }
    if (!deferredFusion?.length) return [] as Candle[];
    const raw = sanitizeChartCandlesForSeries(deferredFusion, sharedAnalyzeTf);
    return resolveMergedDeskCanonicalCandles(raw, raw, sharedAnalyzeTf);
  }, [marketTfReady, deferredChartMarket, deferredFusion, sharedAnalyzeTf]);  const strikeBundle = useMemo(() => {
    if (deskCandles.length < 12) return null;
    return buildMonthDeskStrikeDeskBundle({
      candles: deskCandles,
      timeframe: geometryTf,
      swingPivot: 2,
      scenario: null,
      stCore: null,
      analyzeVerdict:
        deferredAnalysisReady && (deferredAnalysis?.verdict === 'LONG' || deferredAnalysis?.verdict === 'SHORT')
          ? deferredAnalysis.verdict
          : null,
      analyzeFusion:
        deferredAnalysisReady && deferredAnalysis
          ? {
              currentPrice: deferredAnalysis.currentPrice,
              atr: deferredAnalysis.indicators?.atr?.[deferredAnalysis.indicators.atr.length - 1],
              longScore: deferredAnalysis.longScore,
              shortScore: deferredAnalysis.shortScore,
              verdict: deferredAnalysis.verdict,
            }
          : null,
      analysis: deferredAnalysisReady ? deferredAnalysis : null,
    });
  }, [deskCandles, geometryTf, deferredAnalysis, deferredAnalysisReady, symbol]);

  const [deskPack, setDeskPack] = useState<MergedAnalysisDeskPack | null>(null);
  const [mirageZoneIntel, setMirageZoneIntel] = useState<Record<string, MirageZoneProactiveIntel>>({});
  const [mirageZoneHold, setMirageZoneHold] = useState<
    Record<
      string,
      {
        holdPossible: boolean;
        buySellKo: string;
        zoneBuyPct: number;
        zoneSellPct: number;
        sampleN: number;
      }
    >
  >({});
  const [mirageExchangeTapeKo, setMirageExchangeTapeKo] = useState<string | null>(null);
  const [selectedMirageZoneId, setSelectedMirageZoneId] = useState<string | null>(null);
  const [learningOverlayTick, setLearningOverlayTick] = useState(0);
  const [superAiOn, setSuperAiOn] = useState(
    () => loadSettings().chartMergedDeskSuperAiEnabled !== false
  );
  const [unifiedCloudOn, setUnifiedCloudOn] = useState(
    () => loadSettings().chartMergedDeskUnifiedCloudEnabled !== false
  );
  const [zoneBattleHudOn, setZoneBattleHudOn] = useState(
    () => loadSettings().chartMergedDeskZoneBattleHudEnabled !== false
  );
  const [priceLabelFs, setPriceLabelFs] = useState(() => {
    const n = Number(loadSettings().overlayPriceStripFontSize);
    return Number.isFinite(n) ? Math.max(8, Math.min(14, Math.round(n))) : 10;
  });
  const [zoneBattleDetailOpen, setZoneBattleDetailOpen] = useState(false);
  const [schematicOpen, setSchematicOpen] = useState<ClickableSchool | null>(null);
  const [surgeDeskOpen, setSurgeDeskOpen] = useState(false);
  const [newsEvents, setNewsEvents] = useState<Array<{ title: string; timeMs: number }>>([]);

  useEffect(() => {
    const open = () => setSurgeDeskOpen(true);
    window.addEventListener(OPEN_SURGE_DESK_EVENT, open);
    return () => window.removeEventListener(OPEN_SURGE_DESK_EVENT, open);
  }, []);
  const [mtfZoneBattle, setMtfZoneBattle] = useState<MtfZoneBattlePack | null>(null);
  const [mtfZoneBattleLoading, setMtfZoneBattleLoading] = useState(false);
  const deskPackGenRef = useRef(0);
  const mirageIntelKeyRef = useRef('');

  const liveChartPrice = analysis?.currentPrice ?? strikeBundle?.close ?? null;

  const actionablePattern = useMemo(() => {
    const enabled = patternDrawOn;
    if (!deskCandles.length) {
      return { overlays: [] as OverlayItem[], brief: null as MergedDeskActionablePatternBrief | null };
    }
    return buildMergedDeskActionablePatternPack({
      candles: deskCandles,
      analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
      tradePlan: deskPack?.unifiedTradePlan ?? null,
      enabled,
    });
  }, [
    deskCandles,
    deferredAnalysis,
    deferredAnalysisReady,
    analysis,
    deskPack?.unifiedTradePlan,
    patternDrawOn,
  ]);

  const cycleProgress = useMemo(() => {
    const enabled = cycleProgressOn || blueRedChannelsOn;
    if (!deskCandles.length) {
      return buildMergedDeskCycleProgressPack({ candles: [], timeframe, enabled: false });
    }
    const hz = deskPack?.hotZoneEntry;
    const below = hz?.below;
    const above = hz?.above;
    return buildMergedDeskCycleProgressPack({
      candles: deskCandles,
      timeframe,
      analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
      smcLeading: deskPack?.smcLeading ?? null,
      buyBand: below ? { lo: Math.min(below.bot, below.top), hi: Math.max(below.bot, below.top) } : null,
      sellBand: above ? { lo: Math.min(above.bot, above.top), hi: Math.max(above.bot, above.top) } : null,
      enabled,
    });
  }, [
    deskCandles,
    timeframe,
    chartDisplayTick,
    deferredAnalysis,
    deferredAnalysisReady,
    analysis,
    deskPack?.smcLeading,
    deskPack?.hotZoneEntry,
    cycleProgressOn,
    blueRedChannelsOn,
  ]);

  const cycleOverlaysForChart = useMemo(() => {
    if (!cycleProgressOn) return [] as OverlayItem[];
    const all = cycleProgress.overlays ?? [];
    const live = cycleProgress.others.find(
      (c) => asClickableSchool(c.kind) && !/도식 대기/.test(c.headlineKo)
    );
    const want =
      schematicOpen ??
      asClickableSchool(cycleProgress.primary?.kind) ??
      asClickableSchool(live?.kind) ??
      asClickableSchool(cycleProgress.others[0]?.kind) ??
      'wyckoff';
    return all.filter((o) => {
      const id = String(o.id || '');
      if (!id.includes('-blink-')) return true;
      return id.includes(`merged-desk-${want}-blink`);
    });
  }, [
    cycleProgress.overlays,
    cycleProgress.primary?.kind,
    cycleProgress.others,
    schematicOpen,
    cycleProgressOn,
  ]);

  const assetsSuperAi = useMemo(() => {
    const enabled =
      superAiOn ||
      loadSettings().chartMergedDeskSuperAiEnabled !== false ||
      loadSettings().chartMergedDeskAssetsChartAiEnabled !== false;
    if (!deskCandles.length) {
      return {
        overlays: [] as OverlayItem[],
        brief: null as MergedDeskAssetsSuperAiBrief | null,
        matches: [] as import('@/lib/assetsChartAiDraw').AssetsChartAiMatch[],
        zoneBattles: [] as SmcZoneBattleVerdict[],
      };
    }
    return buildMergedDeskAssetsSuperAiPack({
      candles: deskCandles,
      timeframe,
      analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
      smcLeading: deskPack?.smcLeading ?? null,
      tradePlan: deskPack?.unifiedTradePlan ?? null,
      enabled,
    });
  }, [
    deskCandles,
    timeframe,
    deferredAnalysis,
    deferredAnalysisReady,
    analysis,
    deskPack?.smcLeading,
    deskPack?.unifiedTradePlan,
    superAiOn,
  ]);

  /** 통합구름 — CP밴드(위빨강·아래초록)+흰경로. SMC와 무관, 칩 ON일 때만 */
  const unifiedCloudOverlays = useMemo(() => {
    if (!unifiedCloudOn || deskCandles.length < 24) return [] as OverlayItem[];
    const verdict =
      deskPack?.tradeJudgment?.direction === 'LONG' || deskPack?.tradeJudgment?.direction === 'SHORT'
        ? deskPack.tradeJudgment.direction
        : deskPack?.unifiedTradePlan?.direction === 'LONG' ||
            deskPack?.unifiedTradePlan?.direction === 'SHORT'
          ? deskPack.unifiedTradePlan.direction
          : null;
    return buildMergedDeskUnifiedCloudPack({
      candles: deskCandles,
      timeframe,
      analyzeVerdict: verdict,
      analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
    }).overlays;
  }, [
    unifiedCloudOn,
    deskCandles,
    timeframe,
    deferredAnalysis,
    deferredAnalysisReady,
    analysis,
    deskPack?.tradeJudgment?.direction,
    deskPack?.unifiedTradePlan?.direction,
  ]);

  const mirageApproachTarget = useMemo(() => {
    if (!deskPack?.overlays?.length || liveChartPrice == null) return null;
    const zones = mirageZonesFromOverlays(deskPack.overlays);
    return findMirageZoneApproachTarget(zones, liveChartPrice);
  }, [deskPack?.overlays, liveChartPrice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/news-events', { cache: 'no-store', credentials: 'same-origin' });
        const j = (await res.json().catch(() => ({}))) as { events?: Array<{ title?: string; timeMs?: number }> };
        const ev = Array.isArray(j.events)
          ? j.events
              .map((e) => ({ title: String(e?.title || '').trim(), timeMs: Number(e?.timeMs) }))
              .filter((e) => e.title && Number.isFinite(e.timeMs))
          : [];
        if (!alive) return;
        setNewsEvents(ev);
        try {
          window.localStorage.setItem('ailongshort-news-events-v1', JSON.stringify(ev));
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 15 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const newsDraw = useMemo(
    () => buildMergedDeskNewsEventDraw(deskCandles, newsEvents, symbol),
    [deskCandles, newsEvents, symbol]
  );

  const mirageDeepInput = useMemo(
    () =>
      mirageZoneDeepInputFromAnalysis(
        deferredAnalysisReady ? deferredAnalysis : null,
        deskPack?.smcLeading ?? null,
        whaleZones
      ),
    [deferredAnalysis, deferredAnalysisReady, deskPack?.smcLeading, whaleZones]
  );

  const deskPackForChart = useMemo(() => {
    if (!deskPack) return null;
    const faceLang = mirageFaceLang;
    const faceCompact = loadSettings().chartMirageZoneFaceCompact === true;
    const faceOpts = { faceLang, compact: faceCompact };
    const isCloudOverlay = (o: OverlayItem) => {
      const id = String(o.id || '');
      const extra = String(o.overlayZoneExtraClass || '');
      return (
        id.startsWith('merged-cp-cloud') ||
        id.startsWith('merged-unified-cloud') ||
        id.startsWith('merged-ares-st-cloud') ||
        extra.includes('merged-cp-cloud') ||
        extra.includes('merged-unified-cloud') ||
        extra.includes('merged-ares-st-cloud')
      );
    };
    /** Super AI·Mirage와 별도 — 하방 지지·반등 + HotZone/스윙 진입은 항상 유지 */
    const downsideLayers = MERGED_DESK_DOWNSIDE_BOUNCE_PLAN_VISIBLE
      ? filterMergedDeskDownsideSupportOverlays(deskPack.overlays ?? [])
      : [];
    const entryLayers = (deskPack.overlays ?? []).filter((o) => {
      const id = String(o.id || '');
      const extra = String(o.overlayZoneExtraClass || '');
      if (isCloudOverlay(o)) return false;
      /** E/SL/TP HTML 레일 제외 — priceLines만 */
      if (/^merged-desk-trade-rail-(e|sl|tp[123])$/.test(id)) return false;
      if (/^merged-swing-mid-(e|sl|tp[123])$/.test(id)) return false;
      if (extra.includes('merged-swing-mid-rail') || extra.includes('merged-desk-hotzone-rail')) {
        return false;
      }
      return (
        id === 'merged-desk-entry-zone' ||
        id.startsWith('merged-desk-hq-') ||
        id.startsWith('merged-desk-hotzone-') ||
        id.startsWith('merged-desk-ai-buy-') ||
        id.startsWith('merged-desk-ai-sell-') ||
        id.startsWith('merged-desk-ai-defense-') ||
        id.startsWith('merged-desk-asset-') ||
        id.startsWith('merged-swing-mid-') ||
        extra.includes('merged-hq-entry-zone') ||
        extra.includes('merged-desk-entry-zone') ||
        extra.includes('merged-desk-hotzone-entry') ||
        extra.includes('merged-desk-hotzone-pair') ||
        extra.includes('merged-desk-ai-force-zone') ||
        extra.includes('merged-desk-asset-auto-zone')
      );
    });
    /** 파란·빨간 평행채널 + ST 계단구름 — 엔진 누락 시 차트 캔들로 즉시 생성 */
    const fromPackRb = (deskPack.overlays ?? []).filter((o) => {
      const id = String(o.id || '');
      const extra = String(o.overlayZoneExtraClass || '');
      const kind = String(o.kind || '');
      if (
        id.startsWith('merged-desk-rb-') ||
        extra.includes('merged-desk-rb-channel') ||
        extra.includes('merged-desk-blue-red-channel')
      ) {
        /** 채널 면·선 + 게이트/핵심 zone·핀까지 유지 (채널만 남기면 핵심이 사라짐) */
        return (
          kind === 'channelBand' ||
          kind === 'trendLine' ||
          kind === 'zone' ||
          kind === 'label' ||
          kind === 'keyLevel' ||
          id.startsWith('merged-desk-rb-gate') ||
          id.startsWith('merged-desk-rb-entry') ||
          id.startsWith('merged-desk-rb-tp') ||
          id.startsWith('merged-desk-rb-core-') ||
          id.startsWith('merged-desk-rb-ai-') ||
          id.startsWith('merged-desk-rb-master') ||
          id.startsWith('merged-desk-rb-phase') ||
          kind === 'reactionZone'
        );
      }
      if (id.startsWith('merged-ares-st-cloud') || extra.includes('merged-ares-st-cloud')) {
        return kind === 'channelBand';
      }
      return false;
    });
    const moneyHudNow = detectMonthDeskMoneyZones(deskCandles, timeframe);
    const rocketNow = structureRocketDirectionOnLastCandle(
      analysis?.structureRocketSignals,
      deskCandles,
      timeframe
    );
    /** 파란·빨간 띠 ON이면 항상 MoneyEdge+핵심세트를 다시 만들어 게이트·안착을 살린다 */
    let rbLive = null as ReturnType<typeof buildMergedDeskChannelMoneyEdgePack> | null;
    if (blueRedChannelsOn) {
      try {
        rbLive = buildMergedDeskChannelMoneyEdgePack(deskCandles, timeframe, {
          zoneBattles: assetsSuperAi.zoneBattles ?? [],
          mtfAggregate: mtfZoneBattle?.aggregate ?? null,
          mirageIntel: selectedMirageZoneId
            ? mirageZoneIntel[selectedMirageZoneId] ?? null
            : Object.values(mirageZoneIntel)[0] ?? null,
          mirageIntelList: Object.values(mirageZoneIntel),
          hotZones: deskPack.hotZoneEntry?.all ?? [],
          analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
          cycle: cycleProgress,
          pattern: actionablePattern.brief,
          moneyHud: moneyHudNow,
          rocketDir: rocketNow,
          stanceKey: `${symbol}:${timeframe}`,
          omitTradeRails: true,
          newsHint: pickNextNewsHint(newsEvents),
          vrvpPoc: deskPack.vrvp?.poc ?? null,
          vrvpVaLow: deskPack.vrvp?.vaLow ?? null,
          vrvpVaHigh: deskPack.vrvp?.vaHigh ?? null,
          tradeStyle: loadSettings().chartMergedDeskRbTradeStyle,
        });
      } catch {
        rbLive = null;
      }
    }
    const isRbLiveFamily = (o: OverlayItem) => {
      const id = String(o.id || '');
      return (
        id.startsWith('merged-desk-rb-gate') ||
        id.startsWith('merged-desk-rb-entry') ||
        id.startsWith('merged-desk-rb-tp') ||
        id.startsWith('merged-desk-rb-core-') ||
        id.startsWith('merged-desk-rb-ai-') ||
        id.startsWith('merged-desk-rb-master') ||
        id.startsWith('merged-desk-rb-phase')
      );
    };
    const rbLiveFamily = (rbLive?.overlays ?? []).filter(isRbLiveFamily);
    /** 엔진 구게이트와 라이브 마스터가 겹치면 라이브가 이김(왔다리갔다리 방지) */
    const liveRb =
      fromPackRb.length > 0
        ? [...fromPackRb.filter((o) => !isRbLiveFamily(o)), ...rbLiveFamily]
        : (rbLive?.overlays ?? []);
    const rbVolSync =
      blueRedChannelsOn && rbVolSyncOn
        ? computeMergedDeskRbVolumeSync({
            candles: deskCandles,
            timeframe,
            geoms: rbLive?.geoms ?? [],
          })
        : null;
    const rbFullConf =
      blueRedChannelsOn && rbLive
        ? computeMergedDeskRbFullConfluence({
            candles: deskCandles,
            geoms: rbLive.geoms,
            volSync: rbVolSync,
            analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
            cycle: cycleProgress,
            pattern: actionablePattern.brief,
            hotZones: deskPack.hotZoneEntry?.all ?? [],
            moneyHud: moneyHudNow,
            rocketDir: rocketNow,
            moneyPlan: rbLive.plan,
            aiFaceSummaryKo: rbLive.aiFaceSummaryKo ?? null,
            masterSide: rbLive.stance?.side ?? null,
          })
        : null;
    const liveActiveTrade = blueRedChannelsOn
      ? resolveMergedDeskActiveTradePlan({
          candles: deskCandles,
          swingMid: deskPack.swingMidEntry,
          hotZone: deskPack.hotZoneEntry,
          channelMoney: rbLive?.plan ?? null,
          unified: deskPack.unifiedTradePlan,
          master: deskPack.masterFutures,
          currentPrice: liveChartPrice,
          mtfAligned: deskPack.deskHud?.mtfAligned ?? null,
          mtfLabelKo: deskPack.deskHud?.mtfAlignKo ?? null,
          signal: deskPack.tradeSignal,
          analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
          judgment: deskPack.tradeJudgment,
          preferChannel: true,
          newsHint: pickNextNewsHint(newsEvents),
          mtfAlignmentScore: Number(deferredAnalysisReady ? deferredAnalysis?.mtf?.alignmentScore : analysis?.mtf?.alignmentScore) || null,
        })
      : deskPack.activeTradePlan;
    const rbEnterOk =
      liveActiveTrade?.status === 'ENTER' && liveActiveTrade.entryAllowed === true;
    const livePracticeCue = buildMergedDeskLivePracticeCue({
      plan: liveActiveTrade,
      price: liveChartPrice,
      lastCandle: deskCandles[deskCandles.length - 1] ?? null,
      master: deskPack.masterFutures,
    });
    const practiceOv =
      livePracticeOn ? buildMergedDeskLivePracticeOverlay(livePracticeCue, deskCandles) : null;
    const advVolPack =
      deskCandles.length >= 8 ? buildMergedDeskAdvVolumePack(deskCandles) : null;
    const advVolOverlays =
      advVolumeOn && advVolPack ? advVolPack.overlays : [];
    const rbVolumePulse =
      blueRedChannelsOn && deskCandles.length >= 8
        ? computeMergedDeskRbVolumePulse({
            candles: deskCandles,
            volSync: rbVolSync,
            advVol: advVolPack,
            paint: rbLive?.corridorPaint ?? null,
          })
        : null;
    const rocketSrc = deferredAnalysisReady ? deferredAnalysis : analysis;
    const rocketRange = buildMergedDeskRocketRangeSet({
      candles: deskCandles,
      timeframe,
      structureRockets: rocketSrc?.structureRocketSignals,
      bounceScenarios: deskPack.bounceScenarios,
      geoms: rbLive?.geoms ?? [],
      hotBelow: deskPack.hotZoneEntry?.below ?? null,
      hotAbove: deskPack.hotZoneEntry?.above ?? null,
      analysis: rocketSrc,
    });
    const chipConf = rbLive?.chipConfluence ?? null;
    const openPin = schematicOpen ? cycleProgress.schematics[schematicOpen] ?? null : null;
    const schematicPin =
      (openPin && chipConf?.rankBySchool[schematicOpen!] != null ? openPin : null) ||
      chipConf?.topPin ||
      openPin ||
      cycleProgress.schematics.wyckoff ||
      cycleProgress.schematics.elliott ||
      null;
    const rbSchematicLayers =
      blueRedChannelsOn && schematicPin
        ? buildMergedDeskRbSchematicChartDraw({
            candles: deskCandles,
            timeframe,
            geoms: rbLive?.geoms ?? [],
            wyckoff: cycleProgress.wyckoff,
            elliott: cycleProgress.elliott,
            pin: schematicPin,
            chip: chipConf,
            showPath: rbEnterOk,
          }).overlays
        : [];
    const rbKit = blueRedChannelsOn
      ? buildMergedDeskRbCompleteKit({
          geoms: rbLive?.geoms ?? [],
          paint: rbLive?.corridorPaint ?? null,
          volSync: rbVolSync,
          fullConf: rbFullConf,
          hotZones: deskPack.hotZoneEntry?.all ?? [],
          cycle: cycleProgress,
          close: liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? null,
          vrvpPoc: deskPack.vrvp?.poc ?? null,
          vrvpVaLow: deskPack.vrvp?.vaLow ?? null,
          vrvpVaHigh: deskPack.vrvp?.vaHigh ?? null,
          tradeStyle: loadSettings().chartMergedDeskRbTradeStyle,
          volumePulse: rbVolumePulse,
        })
      : null;
    const blueRedChannelLayers = blueRedChannelsOn
      ? [
          ...stampMergedDeskRbFeatureKitLabels(
            stampMergedDeskHotZoneKitLabels(
              stampMergedDeskRbCompleteKit(
                stampRbOverlaysWithFullConfluence(
                  applyMergedDeskRbStyleToOverlays(liveRb, undefined, rbVolSync, rbLive?.corridorPaint),
                  rbFullConf
                ),
                rbKit
              )
            )
          ),
          ...rbSchematicLayers,
        ]
      : [];
    const rbCorePriceLines = blueRedChannelsOn
      ? stampRbPriceLinesWithFullConfluence(rbLive?.priceLines ?? [], rbFullConf)
      : [];
    const rbCoreMarkers = blueRedChannelsOn ? (rbLive?.markers ?? []) : [];

    /** 눌림 타점 — 채널 되돌림 + 기관밴드·$$$$·로켓·거래량 합류 */
    const paintTrigger = rbLive?.corridorPaint?.trigger;
    const railReactionLive =
      paintTrigger === 'rail-bounce' ||
      paintTrigger === 'rail-drop' ||
      rbLive?.corridorPaint?.atSupport === true ||
      rbLive?.corridorPaint?.atResist === true;
    const pullbackPack =
      pullbackEntryOn && rbLive?.geoms.length
        ? buildMergedDeskChannelPullbackEntryPack({
            candles: deskCandles,
            timeframe,
            geoms: rbLive.geoms,
            moneyHud: moneyHudNow,
            rocketDirection: rocketNow,
            minScore: railReactionLive ? Math.min(pullbackMinScore, 38) : pullbackMinScore,
            showCounterTrend: pullbackCounterOn,
            fullConfluence: rbFullConf,
          })
        : null;
    const pullbackLayers = pullbackPack?.overlays ?? [];
    /** 레일 터치 반등/저항 — geoms 없으면 채널 팩에서 직접 보강 */
    const bounceGeoms =
      rbLive?.geoms?.length
        ? rbLive.geoms
        : blueRedChannelsOn && deskCandles.length >= 24
          ? buildMergedDeskBlueRedChannels(deskCandles, timeframe).geoms
          : [];
    const railBouncePack =
      blueRedChannelsOn && bounceGeoms.length
        ? buildMergedDeskRbRailBounceEntryPack({
            candles: deskCandles,
            timeframe,
            geoms: bounceGeoms,
            paint: rbLive?.corridorPaint ?? null,
            tradeStyle: loadSettings().chartMergedDeskRbTradeStyle,
            vrvpPoc: deskPack.vrvp?.poc ?? null,
            vrvpVaLow: deskPack.vrvp?.vaLow ?? null,
            vrvpVaHigh: deskPack.vrvp?.vaHigh ?? null,
          })
        : null;
    const railBounceLayers = railBouncePack?.overlays ?? [];
    const rbLiveHub =
      blueRedChannelsOn && deskCandles.length >= 8
        ? computeMergedDeskRbLiveEntryHub({
            candles: deskCandles,
            geoms: bounceGeoms.length ? bounceGeoms : rbLive?.geoms ?? [],
            paint: rbLive?.corridorPaint ?? null,
            volSync: rbVolSync,
            fullConf: rbFullConf,
            master: rbLive?.stance ?? null,
            hotZones: deskPack.hotZoneEntry?.all ?? [],
            moneyHud: moneyHudNow,
            railBounce: railBouncePack?.entry ?? null,
            pullback: pullbackPack?.entry ?? null,
            volumePulse: rbVolumePulse,
            vrvpPoc: deskPack.vrvp?.poc ?? null,
            vrvpVaLow: deskPack.vrvp?.vaLow ?? null,
            vrvpVaHigh: deskPack.vrvp?.vaHigh ?? null,
            tradeStyle: loadSettings().chartMergedDeskRbTradeStyle,
            close: liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? null,
          })
        : null;
    const cloudLayers = unifiedCloudOn ? unifiedCloudOverlays : [];

    const dedupe = (list: OverlayItem[]) => {
      const seen = new Set<string>();
      return list.filter((o) => {
        const k = String(o.id || '');
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    /** 최종: $$$$ 롱·숏 타점 각 1개 + 합류점수 + 축 가격선 — SMC/Mirage 합류 후에도 강제 */
    const finalizeCoreMoneyZones = (list: OverlayItem[]) => {
      let next = polishMergedDeskChartOverlays(
        list,
        deskCandles.length ? deskCandles : [],
        timeframe,
        deskPack.tradeSignal ?? null
      );
      next = stampMergedDeskMoneyZoneConfluence(next, {
        close: liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? null,
        hqZones: (deskPack.hqEntryZones?.all ?? []).map((z) => ({
          side: z.side,
          score: z.score,
          grade: z.grade,
          mid: z.mid,
          sources: z.sources,
        })),
        hotZones: (deskPack.hotZoneEntry?.all ?? []).map((z) => ({
          side: z.side,
          score: z.score,
          mid: z.mid,
          primary: z.primary,
          sources: z.sources,
        })),
        candles: deskCandles,
        mtfAligned: deskPack.deskHud?.mtfAligned ?? null,
        mtfLabelKo: deskPack.deskHud?.mtfAlignKo ?? null,
        vrvpPoc: deskPack.vrvp?.poc ?? null,
      });
      next = stampMergedDeskMoneyZonesWithLiveHub(next, rbLiveHub);
      next = applyMergedDeskZoneChartLabelClean(next);
      next = stampMergedDeskRbCompleteKit(next, rbKit);
      next = stampMergedDeskHotZoneKitLabels(next);
      next = stampMergedDeskRbFeatureKitLabels(next);
      next = stampMergedDeskOverlaysWithLiveHub(next, rbLiveHub);
      /** 파랑빨강 반등 zone+강도라벨 — polish/clean 이후 재주입(숨김 방지) */
      if (railBounceLayers.length) {
        const liveBounce = railBounceLayers.map((o) => {
          const extra = String(o.overlayZoneExtraClass || '')
            .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
            .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
            .replace(/\bmerged-desk-zone-pro-soft\b/g, '')
            .replace(/\bmerged-desk-rb-core-face-off\b/g, '')
            .trim();
          const face =
            String(o.zoneFaceBase || o.label || '').trim() ||
            (String(o.structureBias || '') === 'bearish' ? '★약하락' : '★약반등');
          return {
            ...o,
            label: face,
            zoneFaceBase: face,
            zoneFaceSignal: String(o.zoneFaceSignal || '').trim() || undefined,
            zoneFillPreserve: true,
            color:
              o.color && String(o.color) !== 'rgba(0,0,0,0)'
                ? o.color
                : String(o.structureBias || '') === 'bearish'
                  ? 'rgba(239,68,68,0.32)'
                  : 'rgba(34,197,94,0.32)',
            overlayZoneExtraClass: [
              extra,
              'merged-desk-rb-rail-bounce',
              'merged-desk-zone-label-on',
              'merged-desk-zone-label-solo',
              'merged-desk-zone-pro-hero',
              'merged-desk-money-zone-keep',
              'merged-desk-zone-caption-clean',
            ]
              .filter(Boolean)
              .join(' '),
          } as OverlayItem;
        });
        next = [
          ...next.filter((o) => !String(o.id || '').includes('rb-rail-bounce')),
          ...liveBounce,
        ];
      }
      next = stampMergedDeskMoneyZonesWithLiveHub(next, rbLiveHub);
      next = stampMergedDeskOverlaysWithLiveHub(next, rbLiveHub);
      next = dedupe([...next, ...newsDraw.overlays]);
      return dedupe(next);
    };
    const pullbackPriceLines =
      pullbackLinesOn && pullbackLayers.length ? (pullbackPack?.priceLines ?? []) : [];
    const railBouncePriceLines = railBounceLayers.length ? (railBouncePack?.priceLines ?? []) : [];
    const withMoneyAxisLines = (list: OverlayItem[]) => ({
      ...deskPack,
      overlays: [
        ...list,
        ...(practiceOv && isMergedDeskRequestedVisibleZone(practiceOv) ? [practiceOv] : []),
        ...advVolOverlays.filter((o) => isMergedDeskRequestedVisibleZone(o)),
        ...rocketRange.overlays.filter((o) => isMergedDeskRequestedVisibleZone(o)),
      ],
      markers: [...(deskPack.markers ?? []), ...rbCoreMarkers, ...newsDraw.markers],
      activeTradePlan: liveActiveTrade,
      livePracticeCue,
      rbLiveHub,
      deskHud: deskPack.deskHud
        ? {
            ...deskPack.deskHud,
            activeTradePlanKo: summarizeMergedDeskActiveTradePlanKo(liveActiveTrade),
            rbLiveEntryKo: rbLiveHub?.stripKo ?? null,
            rbLiveEntryDetailKo: rbLiveHub?.detailKo ?? null,
            rbLiveEntryActionKo: rbLiveHub?.actionKo ?? null,
            rbLiveEntryGradeKo: rbLiveHub?.gradeKo ?? null,
            rbVolumeTagKo: rbLiveHub?.volumeTagKo ?? rbVolumePulse?.tagKo ?? null,
            rbVolumeStoryKo: rbLiveHub?.volumeStoryKo ?? rbVolumePulse?.storyKo ?? null,
            rbVolumeGateKo: rbLiveHub?.volumeGateKo ?? null,
          }
        : deskPack.deskHud,
      priceLines: dedupeMergedDeskAxisPriceLines([
        ...buildMergedDeskActiveTradePriceLines(liveActiveTrade),
        ...pullbackPriceLines,
        ...railBouncePriceLines,
        ...rbCorePriceLines.filter((pl) => !isMergedDeskTradeRailPriceLine(pl)),
        ...buildMergedDeskMoneyZoneAxisLines(list),
        ...(deskPack.priceLines ?? []).filter((pl) => !isMergedDeskTradeRailPriceLine(pl)),
        ...cycleProgress.priceLines,
        ...rocketRange.priceLines,
        ...buildMergedDeskDerivativesPriceLines(
          deferredAnalysisReady ? deferredAnalysis : analysis,
          deskCandles
        ),
      ]),
    });

    /** SMC 작도 ON — Mirage TV + 하방 + 진입 + btccion 클린 작도 */
    if (superAiOn && assetsSuperAi.overlays.length) {
      /** 폰에서 assets pack만 쓰면 desk 기본 zone이 비는 경우 대비 — deskPack zone도 병합 */
      const deskZones = (deskPack.overlays ?? []).filter((o) => {
        const id = String(o.id || '');
        if (isCloudOverlay(o)) return false;
        if (btccionDrawOn && isMergedDeskBtccionOverlayId(id)) return true;
        return (
          id.startsWith('merged-ares-mlsp-tv-') ||
          id.startsWith('merged-ares-zone-') ||
          id.startsWith('merged-ares-key-') ||
          id.startsWith('merged-ares-critical-') ||
          id === 'merged-desk-entry-zone' ||
          id.startsWith('merged-desk-hq-') ||
          id.startsWith('merged-desk-hotzone-') ||
          id.startsWith('merged-desk-ai-buy-') ||
          id.startsWith('merged-desk-ai-sell-') ||
          id.startsWith('merged-desk-ai-defense-') ||
          id.startsWith('merged-desk-asset-') ||
          id.startsWith('merged-desk-adv-') ||
          id.startsWith('merged-desk-core-sr') ||
          id.startsWith('merged-desk-projected-') ||
          id.startsWith('merged-desk-rb-') ||
          id.startsWith('merged-desk-candle-trend') ||
          id.startsWith('merged-swing-') ||
          String(o.kind || '') === 'trendLine' ||
          String(o.kind || '') === 'channelBand' ||
          String(o.overlayZoneExtraClass || '').includes('merged-ares-zone') ||
          String(o.overlayZoneExtraClass || '').includes('merged-hq-entry-zone') ||
          String(o.overlayZoneExtraClass || '').includes('merged-desk-entry-zone') ||
          String(o.overlayZoneExtraClass || '').includes('merged-desk-ai-force-zone') ||
          String(o.overlayZoneExtraClass || '').includes('merged-desk-asset-auto-zone') ||
          String(o.overlayZoneExtraClass || '').includes('merged-desk-adv-')
        );
      });
      let overlays = [
        ...blueRedChannelLayers,
        ...pullbackLayers,
        ...railBounceLayers,
        ...cloudLayers,
        ...assetsSuperAi.overlays,
        ...deskZones,
        ...downsideLayers,
        ...entryLayers,
        ...cycleOverlaysForChart,
      ];
      if (faceCompact) {
        overlays = ensureMirageZoneCompactFaceOnOverlays(overlays, { faceLang });
      }
      overlays = applyMirageZoneApproachHighlight(
        overlays,
        mirageApproachTarget,
        selectedMirageZoneId
      );
      /** SMC 경로에서도 세력/assets ZONE 면 강제 유지 */
      const forceAssetFaces = (deskPack.overlays ?? []).filter((o) => {
        const id = String(o.id || '');
        return (
          id.startsWith('merged-desk-ai-buy-') ||
          id.startsWith('merged-desk-ai-sell-') ||
          id.startsWith('merged-desk-ai-defense-') ||
          id.startsWith('merged-desk-asset-')
        );
      });
      overlays = dedupe([...overlays, ...forceAssetFaces, ...entryLayers]);
      return withMoneyAxisLines(finalizeCoreMoneyZones(overlays));
    }

    let overlays = (deskPack.overlays ?? []).filter((o) => {
      if (isCloudOverlay(o)) return false;
      if (!btccionDrawOn && isMergedDeskBtccionOverlayId(String(o.id || ''))) return false;
      return true;
    });
    if (Object.keys(mirageZoneIntel).length) {
      overlays = mergeExchangeIntelIntoOverlays(overlays, mirageZoneIntel, faceOpts);
      overlays = mergeMirageZoneDeepFaceIntoOverlays(overlays, mirageZoneIntel, mirageDeepInput, faceOpts);
    }
    overlays = applyMirageZoneLearningToOverlays(overlays, symbol, timeframe, mirageZoneIntel, faceOpts);
    if (faceCompact) {
      overlays = ensureMirageZoneCompactFaceOnOverlays(overlays, { faceLang });
    }
    overlays = applyMirageZoneApproachHighlight(
      overlays,
      mirageApproachTarget,
      selectedMirageZoneId
    );
    if (actionablePattern.overlays.length) {
      overlays = [...overlays, ...actionablePattern.overlays];
    }
    if (cycleOverlaysForChart.length) {
      overlays = [...overlays, ...cycleOverlaysForChart];
    }
    if (!superAiOn && assetsSuperAi.overlays.length) {
      overlays = [...overlays, ...assetsSuperAi.overlays];
    }
    if (cloudLayers.length) {
      overlays = [...cloudLayers, ...overlays];
    }
    /** ST 구름은 isCloudOverlay에서 빠지므로 여기서 다시 합침 */
    overlays = dedupe([...blueRedChannelLayers, ...pullbackLayers, ...railBounceLayers, ...overlays]);
    return withMoneyAxisLines(finalizeCoreMoneyZones(overlays));
  }, [
    deskPack,
    deskCandles,
    superAiOn,
    unifiedCloudOn,
    unifiedCloudOverlays,
    mirageZoneIntel,
    mirageDeepInput,
    mirageApproachTarget,
    selectedMirageZoneId,
    symbol,
    timeframe,
    learningOverlayTick,
    mirageFaceLang,
    btccionDrawOn,
    blueRedChannelsOn,
    livePracticeOn,
    advVolumeOn,
    rbVolSyncOn,
    pullbackEntryOn,
    pullbackLinesOn,
    pullbackMinScore,
    pullbackCounterOn,
    analysis,
    deferredAnalysis,
    deferredAnalysisReady,
    chartDisplayTick,
    actionablePattern.overlays,
    cycleProgress.overlays,
    cycleOverlaysForChart,
    cycleProgress.priceLines,
    cycleProgress.schematics,
    cycleProgress.wyckoff,
    cycleProgress.elliott,
    schematicOpen,
    assetsSuperAi.overlays,
    assetsSuperAi.zoneBattles,
    mtfZoneBattle,
    newsDraw.overlays,
    newsEvents,
    newsDraw.markers,
    liveChartPrice,
  ]);

  const deskEngineSigRef = useRef('');
  useEffect(() => {
    const gen = ++deskPackGenRef.current;
    if (!strikeBundle || deskCandles.length < 12) {
      /** 전환 중 빈 팩으로 지우지 않음 — 이전 오버레이 유지(삭제 아님) */
      return;
    }
    /** UI TF와 캔들 TF 불일치(전환 중) — 엔진 스킵, 이전 오버레이 유지 */
    if (marketTfReady && deferredChartTf !== timeframe) {
      return;
    }
    const candles = deskCandles;
    const last = candles[candles.length - 1]!;
    const first = candles[0]!;
    const sig = `${geometryTf}|${candles.length}|${first.time}|${last.time}|${Number(last.close).toFixed(2)}|${deferredAnalysisReady ? deferredAnalysis?.verdict ?? '' : ''}|${swingDraw ? 1 : 0}|wz${whaleZones.length}`;
    if (sig === deskEngineSigRef.current) return;
    deskEngineSigRef.current = sig;

    const buildPack = () => {
      if (gen !== deskPackGenRef.current) return;
      const probePack = buildMonthDeskStrikeDeskOverlays(strikeBundle, candles);
      /** 존·지지/저항 기하는 차트 TF, 판정·스코어는 15m analysis */
      const pack = runMergedAnalysisDeskEngine({
        candles,
        timeframe: geometryTf,
        bundle: strikeBundle,
        fusion: buildMergedAnalysisBandFusionContext({
          timeframe: geometryTf,
          bundle: strikeBundle,
          analysis: deferredAnalysisReady ? deferredAnalysis : null,
          candles,
        }),
        analysis: deferredAnalysisReady ? deferredAnalysis : null,
        probePack,
        whaleMemoryZones: whaleZones,
        swingDrawEnabled: swingDraw,
        settleBoard,
      });
      if (gen === deskPackGenRef.current) setDeskPack(pack);
    };

    /**
     * 캔들 setData 페인트 우선 → 엔진은 짧은 디바운스+idle.
     * 기능·오버레이 삭제 없음 — 이전 deskPack 유지한 채 재계산.
     */
    let rafId: number | null = null;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleIsRic = false;
    const schedule = () => {
      startTransition(() => buildPack());
    };
    const afterPaint = () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleIsRic = true;
        idleId = window.requestIdleCallback(() => schedule(), { timeout: 180 });
      } else {
        timeoutId = setTimeout(schedule, 48);
      }
    };
    if (typeof window !== 'undefined') {
      rafId = window.requestAnimationFrame(() => {
        rafId = window.requestAnimationFrame(afterPaint);
      });
    } else {
      timeoutId = setTimeout(schedule, 0);
    }
    return () => {
      if (rafId != null && typeof window !== 'undefined') window.cancelAnimationFrame(rafId);
      if (idleId != null && typeof window !== 'undefined') {
        if (idleIsRic) window.cancelIdleCallback(idleId);
        else clearTimeout(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [
    strikeBundle,
    deskCandles,
    geometryTf,
    deferredAnalysis,
    deferredAnalysisReady,
    whaleZones,
    swingDraw,
    settleBoard,
    marketTfReady,
    deferredChartTf,
    timeframe,
  ]);
  /** Mirage zone 선반영 — 거래소 체결·호가·페이즈·MTF·VRVP (형성 직후 비동기 보강) */
  useEffect(() => {
    if (!deskPack?.overlays?.length) {
      setMirageZoneIntel({});
      setMirageZoneHold({});
      setMirageExchangeTapeKo(null);
      return;
    }
    const zones = mirageZonesFromOverlays(deskPack.overlays);
    if (!zones.length) {
      setMirageZoneIntel({});
      setMirageZoneHold({});
      setMirageExchangeTapeKo(null);
      return;
    }
    const livePrice = analysis?.currentPrice ?? strikeBundle?.close ?? null;
    const nearZone = livePrice != null && livePrice > 0
      ? zones.some((z) => Math.abs(livePrice - z.center) / z.center < 0.02)
      : false;
    const priceKey = nearZone && livePrice != null ? `|p${Math.round(livePrice)}` : '';
    const key = `${symbol}|${timeframe}|${zones.map((z) => z.id).join(',')}${priceKey}`;
    if (key === mirageIntelKeyRef.current) return;
    mirageIntelKeyRef.current = key;

    let cancelled = false;

    const run = async () => {
      let mtfRows: Array<{
        tf: string;
        direction: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';
        longScore?: number;
        shortScore?: number;
      }> = [];
      try {
        const q = new URLSearchParams({ symbol, timeframe });
        const mtfRes = await fetch(`/api/mtf-signal-board?${q.toString()}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const mtfJ = (await mtfRes.json()) as {
          rows?: Array<{ tf: string; analyze?: { verdict?: string; longScore?: number; shortScore?: number } }>;
        };
        if (Array.isArray(mtfJ.rows)) {
          mtfRows = mtfJ.rows.map((r) => {
            const v = r.analyze?.verdict;
            const direction =
              v === 'LONG' ? 'LONG' : v === 'SHORT' ? 'SHORT' : ('NEUTRAL' as const);
            return {
              tf: r.tf,
              direction,
              longScore: r.analyze?.longScore,
              shortScore: r.analyze?.shortScore,
            };
          });
        }
      } catch {
        /* MTF optional */
      }

      try {
        const res = await fetch('/api/mirage-zone-intel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({
            symbol,
            timeframe,
            zones,
            keyZones: (deskPack.keyZones ?? []).slice(0, 12).map((z) => ({
              kind: z.kind,
              price: z.price,
              top: z.top,
              bot: z.bot,
              labelKo: z.labelKo,
              bouncePct: z.bouncePct,
            })),
            criticalZones: (deskPack.criticalZones ?? []).slice(0, 12).map((z) => ({
              kind: z.kind,
              top: z.top,
              bot: z.bot,
              tier: z.tier,
              htfLabel: z.htfLabel,
              labelKo: z.labelKo,
            })),
            vrvp: deskPack.vrvp
              ? {
                  poc: deskPack.vrvp.poc,
                  vaLow: deskPack.vrvp.vaLow,
                  vaHigh: deskPack.vrvp.vaHigh,
                }
              : null,
            currentPrice: analysis?.currentPrice ?? strikeBundle?.close ?? null,
            mtfRows,
            deep: mirageZoneDeepInputFromAnalysis(
              deferredAnalysisReady ? deferredAnalysis : analysis,
              deskPack.smcLeading ?? null,
              whaleZones
            ) as MirageZoneDeepIntelInput,
          }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          intel?: Record<string, MirageZoneProactiveIntel | null>;
          zoneHold?: Record<
            string,
            {
              holdPossible: boolean;
              buySellKo: string;
              zoneBuyPct: number;
              zoneSellPct: number;
              sampleN: number;
            }
          >;
          exchangeTape?: {
            binanceFutures?: { buyPct: number; sellPct: number; n: number };
            bitgetFutures?: { buyPct: number; sellPct: number; n: number };
          };
        };
        if (cancelled || !j?.ok || !j.intel) return;
        const clean: Record<string, MirageZoneProactiveIntel> = {};
        for (const [id, v] of Object.entries(j.intel)) {
          if (v) clean[id] = v;
        }
        setMirageZoneIntel(clean);
        setMirageZoneHold(j.zoneHold && typeof j.zoneHold === 'object' ? j.zoneHold : {});
        const bn = j.exchangeTape?.binanceFutures;
        const bg = j.exchangeTape?.bitgetFutures;
        const parts: string[] = [];
        if (bn && bn.n > 0) parts.push(`Binance선물 매수${bn.buyPct}%/매도${bn.sellPct}%`);
        if (bg && bg.n > 0) parts.push(`Bitget선물 매수${bg.buyPct}%/매도${bg.sellPct}%`);
        setMirageExchangeTapeKo(parts.length ? parts.join(' · ') : null);
      } catch {
        if (!cancelled) {
          setMirageZoneIntel({});
          setMirageZoneHold({});
          setMirageExchangeTapeKo(null);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [deskPack, symbol, timeframe, analysis?.currentPrice, strikeBundle?.close, deferredAnalysis, deferredAnalysisReady, whaleZones]);

  useEffect(() => {
    setLearningOverlayTick((v) => v + 1);
  }, [mirageZoneIntel, selectedMirageZoneId]);

  /** 차트설정의 "라벨 개별 조정" 목록 — 라벨·면글자·축 가격선·우측 흰글자 전부 */
  const chartLabelTargets = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const o of deskPackForChart?.overlays ?? []) {
      const id = String(o?.id || '').trim();
      if (!id) continue;
      const kind = String(o?.kind || '');
      const extra = String(o?.overlayZoneExtraClass || '');
      const face = String(o?.zoneFaceBase || '').trim();
      const label =
        String(o?.label || '').trim() ||
        [face, String(o?.zoneFaceSignal || '').trim()].filter(Boolean).join('·');
      const isWhiteLine =
        kind === 'keyLevel' ||
        kind === 'trendLine' ||
        id.startsWith('merged-desk-trade-rail-') ||
        id.includes('mlsp') ||
        extra.includes('merged-ares-level-line') ||
        extra.includes('merged-ares-mlsp-') ||
        extra.includes('merged-desk-trade-rail');
      if (label) out.push({ id, label: isWhiteLine ? `흰글자·${label.replace(/^흰글자·/, '')}` : label });
      if (face && face !== label && !String(label).includes(face)) {
        out.push({ id, label: `흰글자·${face}` });
      }
    }
    return out;
  }, [deskPackForChart?.overlays]);

  const selectedMirageOverlay = useMemo(() => {
    if (!selectedMirageZoneId || !deskPackForChart?.overlays) return null;
    return (
      deskPackForChart.overlays.find((o) => String(o.id) === selectedMirageZoneId) ??
      deskPackForChart.overlays.find(
        (o) =>
          (isMergedDeskMirageTvZoneOverlay(o) ||
            String(o.id || '').includes('merged-ares-mlsp-tv-conflict-')) &&
          String(o.id) === selectedMirageZoneId
      ) ??
      null
    );
  }, [selectedMirageZoneId, deskPackForChart?.overlays]);

  const zoneBattleRange = useMemo(
    () =>
      resolveZoneBattlePriceRange({
        overlays: deskPackForChart?.overlays ?? assetsSuperAi.overlays ?? [],
        currentPrice: liveChartPrice,
        selectedZoneId: selectedMirageZoneId,
      }),
    [deskPackForChart?.overlays, assetsSuperAi.overlays, liveChartPrice, selectedMirageZoneId]
  );

  const recordLivePracticeCue = useCallback(() => {
    const cue = deskPackForChart?.livePracticeCue;
    if (!cue) return;
    appendLivePracticeLog({
      symbol,
      timeframe,
      mode: cue.mode,
      side: cue.side,
      entry: cue.entry,
      stop: cue.stop,
      price: liveChartPrice ?? 0,
      lineKo: cue.lineKo,
    });
    setPracticeLogNote('기록됨 · 자동주문 아님');
    window.setTimeout(() => setPracticeLogNote(''), 2200);
  }, [deskPackForChart?.livePracticeCue, symbol, timeframe, liveChartPrice]);

  useEffect(() => {
    if (!livePracticeOn) return;
    const cue = deskPackForChart?.livePracticeCue;
    if (!cue || cue.mode !== 'fill-candidate' || !(cue.entry > 0)) return;
    const key = `${symbol}|${timeframe}|${cue.side}|${cue.entry.toFixed(4)}`;
    if (practiceAutoLogKeyRef.current === key) return;
    practiceAutoLogKeyRef.current = key;
    appendLivePracticeLog({
      symbol,
      timeframe,
      mode: cue.mode,
      side: cue.side,
      entry: cue.entry,
      stop: cue.stop,
      price: liveChartPrice ?? 0,
      lineKo: cue.lineKo,
    });
  }, [livePracticeOn, deskPackForChart?.livePracticeCue, symbol, timeframe, liveChartPrice]);

  const chartZoneBattle = useMemo((): SmcZoneBattleVerdict | null => {
    if (selectedMirageOverlay) {
      const parsed = battleFromOverlay(selectedMirageOverlay);
      if (parsed) return parsed;
    }
    const battles = assetsSuperAi.zoneBattles ?? [];
    return pickNearestSmcZoneBattle(deskCandles, battles) ?? battles[battles.length - 1] ?? null;
  }, [selectedMirageOverlay, assetsSuperAi.zoneBattles, deskCandles]);

  useEffect(() => {
    if (!superAiOn || !zoneBattleRange) {
      setMtfZoneBattle(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setMtfZoneBattleLoading(true);
      try {
        const q = new URLSearchParams({
          symbol,
          zoneBot: String(zoneBattleRange.bot),
          zoneTop: String(zoneBattleRange.top),
          chartTf: timeframe,
        });
        const res = await fetch(`/api/zone-battle-mtf?${q}`, { cache: 'no-store', credentials: 'same-origin' });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && data.pack) setMtfZoneBattle(data.pack as MtfZoneBattlePack);
        else setMtfZoneBattle(null);
      } catch {
        if (!cancelled) setMtfZoneBattle(null);
      } finally {
        if (!cancelled) setMtfZoneBattleLoading(false);
      }
    };
    void load();
    const t = setInterval(load, 55_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [superAiOn, zoneBattleRange?.bot, zoneBattleRange?.top, symbol, timeframe, learningOverlayTick]);

  const handleMirageZoneSelect = useCallback(
    (zoneId: string) => {
      setSelectedMirageZoneId(zoneId);
      if (zoneId.includes('conflict-') || zoneId.includes('zone-battle')) {
        setZoneBattleDetailOpen(true);
      }
      const overlay = deskPackForChart?.overlays?.find((o) => String(o.id) === zoneId);
      if (!overlay) return;
      const p1 = Number(overlay.price1);
      const p2 = Number(overlay.price2);
      if (!Number.isFinite(p1) || !Number.isFinite(p2)) return;
      const role = inferMirageZoneRole(overlay);
      const top = Math.max(p1, p2);
      const bot = Math.min(p1, p2);
      const caption = String(overlay.label || '').split('·')[0]?.trim() || '존';
      const reactiveKo = String(overlay.label || '').split('·').slice(-1)[0]?.trim() || null;
      logMirageZoneIntelSnapshot({
        zoneId,
        symbol,
        timeframe,
        role,
        captionKo: caption,
        intel: mirageZoneIntel[zoneId] ?? null,
        center: (top + bot) / 2,
        invalidation: mirageZoneInvalidationPrice(top, bot, role),
        reactiveKo,
        reason: 'select',
      });
    },
    [deskPackForChart?.overlays, mirageZoneIntel, symbol, timeframe]
  );

  useEffect(() => {
    if (!selectedMirageZoneId) return;
    const intel = mirageZoneIntel[selectedMirageZoneId];
    if (!intel) return;
    const overlay = deskPack?.overlays?.find((o) => String(o.id) === selectedMirageZoneId);
    if (!overlay) return;
    const p1 = Number(overlay.price1);
    const p2 = Number(overlay.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) return;
    const role = inferMirageZoneRole(overlay);
    const top = Math.max(p1, p2);
    const bot = Math.min(p1, p2);
    logMirageZoneIntelSnapshot({
      zoneId: selectedMirageZoneId,
      symbol,
      timeframe,
      role,
      captionKo: String(overlay.label || '').split('·')[0]?.trim() || '존',
      intel,
      center: (top + bot) / 2,
      invalidation: intel.invalidationPrice ?? mirageZoneInvalidationPrice(top, bot, role),
      reason: 'intel',
    });
  }, [mirageZoneIntel, selectedMirageZoneId, deskPack?.overlays, symbol, timeframe]);

  useEffect(() => {
    if (!deskPack?.tradeJudgment || !deskPack.tradeSignal) return;
    logMergedDeskTradeLearning({
      symbol,
      timeframe,
      judgment: deskPack.tradeJudgment,
      confirms: deskPack.directionConfirms,
      entry: deskPack.tradeSignal.entry,
      stopLoss: deskPack.tradeSignal.stopLoss,
      tp1: deskPack.tradeSignal.tp1,
    });
  }, [deskPack?.tradeJudgment, deskPack?.directionConfirms, deskPack?.tradeSignal, symbol, timeframe]);

  const onMasterJournal = useCallback(() => {
    if (!deskPack?.masterFutures) return;
    appendMasterFuturesJournal({
      symbol,
      timeframe,
      master: deskPack.masterFutures,
      noteKo: deskPack.masterFutures.entryAllowed ? '수동 저널' : '관망·잠금 기록',
    });
  }, [deskPack?.masterFutures, symbol, timeframe]);

  const strategyChips = deskPack?.meta.strategy;
  const deskHud = deskPack?.deskHud;
  const verdictStrip = useMemo(
    () =>
      buildMergedDeskVerdictStrip({
        analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
        mtfAligned: deskHud?.mtfAligned ?? null,
        mtfAlignKo: deskHud?.mtfAlignKo,
        mtfBattle: mtfZoneBattle,
        moneyWait: deskHud?.mtfAligned === false || (mtfZoneBattle?.conflictTfCount ?? 0) >= 2,
        nextNews: pickNextNewsHint(newsEvents),
      }),
    [
      deferredAnalysis,
      deferredAnalysisReady,
      analysis,
      deskHud?.mtfAligned,
      deskHud?.mtfAlignKo,
      mtfZoneBattle,
      newsEvents,
    ]
  );
  const rbChipConfluence = useMemo(() => {
    if (!blueRedChannelsOn || deskCandles.length < 24) return null;
    return computeMergedDeskRbChipConfluence({
      candles: deskCandles,
      geoms: null,
      cycle: cycleProgress,
      verdict: verdictStrip,
    });
  }, [blueRedChannelsOn, deskCandles, cycleProgress, verdictStrip]);
  const fsActive = chartFullscreen;
  const mobileFsActive = fsActive && isMobileViewport;
  const hideTextStrips = mergedDeskHideTextStrips();
  const hideMobileSituation = mergedDeskHideMobileSituationBar();

  const togglePanels = () => {
    setPanelsOpen((v) => {
      const next = !v;
      if (typeof window !== 'undefined') window.localStorage.setItem(PANELS_TOGGLE_KEY, next ? '1' : '0');
      return next;
    });
  };

  /** 폰 전체화면에서 패널/zone 열 때 → 일반화면으로 나온 뒤 패널 표시 */
  const openPanelsFromMobileFs = () => {
    if (mobileFsActive) {
      setChartFullscreen(false);
      setMobileFsBodyLock(false);
      setPanelsOpen(true);
      if (typeof window !== 'undefined') window.localStorage.setItem(PANELS_TOGGLE_KEY, '1');
      bumpChartResize();
      return;
    }
    togglePanels();
  };

  const toggleSwingDraw = () => {
    setSwingDraw((v) => {
      const next = !v;
      if (typeof window !== 'undefined') window.localStorage.setItem(SWING_DRAW_KEY, next ? '1' : '0');
      saveSettings({ chartMergedDeskSwingDrawEnabled: next });
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      return next;
    });
  };

  const openChartSettings = useCallback(() => {
    setMergedChartSettingsOpen(true);
  }, []);

  const restoreChartView = useCallback(() => {
    chartSnapshotRef?.current?.restoreDefaultChartView?.();
  }, [chartSnapshotRef]);

  const saveChartView = useCallback(() => {
    chartSnapshotRef?.current?.saveChartView?.();
  }, [chartSnapshotRef]);

  const toggleInstitutionalBand = useCallback(() => {
    const next = !institutionalBandOn;
    setInstitutionalBandOn(next);
    saveSettings({ chartMergedInstitutionalBandEnabled: next });
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }, [institutionalBandOn]);

  const toggleFusionDeskBand = useCallback(() => {
    const next = !fusionDeskBandOn;
    setFusionDeskBandOn(next);
    saveSettings({ chartMonthDeskFusionDeskBandEnabled: next });
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }, [fusionDeskBandOn]);

  const toggleMirageFaceLang = useCallback(() => {
    setMirageFaceLang((prev) => {
      const next = prev === 'en' ? 'ko' : 'en';
      saveSettings({ ...loadSettings(), chartMirageZoneFaceLang: next });
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      return next;
    });
  }, []);

  const toggleBitgetVol = useCallback(() => {
    const next = !bitgetVolOn;
    setBitgetVolOn(next);
    saveSettings({ chartMonthDeskBitgetCandles: next });
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }, [bitgetVolOn]);

  const toggleBtccionDraw = useCallback(() => {
    setBtccionDrawOn((prev) => {
      const next = !prev;
      saveSettings({ chartMergedDeskBtccionDrawEnabled: next });
      return next;
    });
  }, []);

  const toggleZoneBattleHud = useCallback(() => {
    setZoneBattleHudOn((prev) => {
      const next = !prev;
      saveSettings({ chartMergedDeskZoneBattleHudEnabled: next });
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      return next;
    });
  }, []);

  /**
   * 우측 가격축(숫자) + 축옆 컬러 라벨만 크기 순환.
   * 차트 안 SL/E/TP1·zone 면 글자(overlayLabelFontSize)는 건드리지 않음.
   */
  const cyclePriceLabelFont = useCallback(() => {
    const steps = [8, 9, 10, 11, 12, 14];
    setPriceLabelFs((prev) => {
      const idx = steps.indexOf(prev);
      const next = steps[(idx >= 0 ? idx + 1 : 0) % steps.length]!;
      const cur = loadSettings();
      const patch: Parameters<typeof saveSettings>[0] = {
        overlayPriceStripFontSize: next,
        chartScaleFontSize: next,
      };
      /** 이전 칩이 차트 본문 SL/E/TP1까지 줄였으면 기본으로 복구 */
      if (Number(cur.overlayLabelFontSize) < 11) {
        patch.overlayLabelFontSize = 11;
      }
      saveSettings(patch);
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      return next;
    });
  }, []);

  const bitgetVolEligible = isBitgetPerpChartSymbol(symbol);

  const runTopsBottomsScan = useCallback(async () => {
    setTbScanLoading(true);
    try {
      const res = await fetch(
        `/api/tops-bottoms-scan?timeframe=${encodeURIComponent(timeframe)}&limit=40`,
        { credentials: 'same-origin', cache: 'no-store' }
      );
      const j = (await res.json()) as {
        ok?: boolean;
        rows?: TopsBottomsScanRow[];
        summaryKo?: string;
      };
      if (j?.ok && Array.isArray(j.rows)) {
        setTbScanRows(j.rows);
        setTbScanSummary(String(j.summaryKo || ''));
      }
    } catch {
      setTbScanSummary('TOP/BOT 스캔 실패');
    } finally {
      setTbScanLoading(false);
    }
  }, [timeframe]);

  const bitgetCandlesOn = useMemo(
    () => isBitgetVolumePackActive(uiMode, loadSettings(), symbol),
    [uiMode, symbol]
  );
  const candleSourceKo = bitgetCandlesOn
    ? 'Bitget BTCUSDT.P (USDT-M) · 선물 캔들'
    : 'Binance 현물 · 설정에서 Bitget 전환 가능';

  return (
    <div
      className={`${styles.mergedDesk}${panelsOpen ? '' : ` ${styles.mergedDeskChartFirst}`}${fsActive ? ` ${styles.mergedDeskChartFs}` : ''}`}
      data-theme={theme}
      data-merged-tone={aiToneOn ? 'ai' : 'classic'}
    >
      {!fsActive && (
        <header className={styles.mergedDeskHeader}>
          <div>
            <div className={styles.mergedDeskTitle}>ARES · 스윙 차트</div>
            <div className={styles.mergedDeskSub}>
              {symbol} · {timeframe} · {candleSourceKo} — 롱/숏 구간 · zone · 채널 · 캔들 신호 (1~7일+)
            </div>
          </div>
          <UIModeSwitcher uiMode={uiMode} setUiMode={onUiModeChange} />
        </header>
      )}

      <div className={styles.mergedDeskBody}>
        <div
          ref={chartColRef}
          className={`${styles.mergedChartCol}${fsActive ? ` ${styles.mergedChartColFullscreen} ${styles.mergedChartColFsOnly}` : ''}${mobileFsActive ? ` ${styles.mergedChartColMobileFs}` : ''}`}
        >
          <div
            className={`${styles.mergedChartToolbar}${fsActive ? ` ${styles.mergedChartToolbarFs}` : ''}${isMobileViewport ? ` ${styles.mergedChartToolbarMobileFs}` : ''}`}
          >
            <div className={styles.tfToolbar} aria-label="타임프레임">
              {MERGED_TF_CHIPS.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  className={`tool-chip tool-chip-button ${timeframe === tf ? 'tool-chip-active' : ''}${['4h', '1d', '1w'].includes(tf) ? ` ${styles.swingTfChip}` : ''}`}
                  onClick={() => onRequestChartTf(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
            <div className={styles.mergedToolbarActions}>
              {mobileFsActive && (
                <button
                  type="button"
                  className={`fullscreen-btn ${styles.chartFsBtn} ${styles.chartFsBtnActive} ${styles.chartFsBtnMobile}`}
                  onClick={() => void toggleChartFullscreen()}
                  title="일반 화면으로 돌아가기"
                >
                  일반화면
                </button>
              )}
              {isMobileViewport && (
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${mobileToolsOpen ? 'tool-chip-active' : ''} ${styles.mobileToolsToggle}`}
                  onClick={() => setMobileToolsOpen((v) => !v)}
                  title="기능 칩 펼치기 — 차트 영역은 유지"
                >
                  {mobileToolsOpen ? '도구닫기' : '도구'}
                </button>
              )}
              {(!isMobileViewport || mobileToolsOpen) && (
              <div className={isMobileViewport ? styles.mergedMobileToolsPanel : styles.mergedToolbarActionsInline}>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${panelsOpen ? 'tool-chip-active' : ''}`}
                onClick={openPanelsFromMobileFs}
                title="타임라인·zone·우측 패널"
              >
                zone·패널
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${settleCloseOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !settleCloseOn;
                  setSettleCloseOn(next);
                  saveSettings({ chartTfCloseSettlementLines: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="15m·1h·4h·일·주·월 종가 마감·안착·실패 가로선 (녹=안착·적=실패·노랑=불안)"
                style={{
                  fontWeight: 800,
                  borderColor: 'rgba(34,197,94,0.75)',
                  color: settleCloseOn ? '#bbf7d0' : undefined,
                  background: settleCloseOn ? 'rgba(34,197,94,0.16)' : undefined,
                }}
              >
                종가마감
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${swingDraw ? 'tool-chip-active' : ''}`}
                onClick={toggleSwingDraw}
                title="스윙 구간·채널·전환 마커"
              >
                스윙작도
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${blueRedChannelsOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !blueRedChannelsOn;
                  setBlueRedChannelsOn(next);
                  if (next) {
                    setRbVolSyncOn(true);
                    setAdvVolumeOn(true);
                    saveSettings({
                      chartMergedDeskBlueRedChannelsEnabled: true,
                      chartMergedDeskRbVolumeSyncEnabled: true,
                      chartMergedDeskAdvVolumeEnabled: true,
                      chartVolumeIntelligence: true,
                      chartVolumeRvolTiers: true,
                    });
                  } else {
                    saveSettings({ chartMergedDeskBlueRedChannelsEnabled: false });
                  }
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="기관밴드·POC·헌팅·$$$$·거래량DNA(흡수/절정/RVOL/수급) 라이브합류 → 롱/숏·약중강초·V가속/차단(승률 아님)"
                style={{
                  fontWeight: 800,
                  borderColor: blueRedChannelsOn
                    ? rbVolSyncOn
                      ? 'rgba(45,212,191,0.55)'
                      : 'rgba(96,165,250,0.55)'
                    : undefined,
                  background: blueRedChannelsOn
                    ? rbVolSyncOn
                      ? 'linear-gradient(90deg, rgba(34,197,94,0.22), rgba(59,130,246,0.2))'
                      : 'linear-gradient(90deg, rgba(59,130,246,0.22), rgba(239,68,68,0.2))'
                    : undefined,
                }}
              >
                파란빨간
              </button>
              {(
                [
                  { id: 'scalp' as const, label: '단타', tip: 'AI파랑빨강띠·단타 — 단기채널·POC·수급 반응 가중' },
                  { id: 'swing' as const, label: '스윙', tip: 'AI파랑빨강띠·스윙 — 단기·장기 균형·POC 연동' },
                  { id: 'mid' as const, label: '중투', tip: 'AI파랑빨강띠·중투 — 장기채널·POC 구조 가중' },
                ] as const
              ).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`tool-chip tool-chip-button ${rbTradeStyle === row.id ? 'tool-chip-active' : ''}`}
                  title={row.tip}
                  onClick={() => {
                    saveSettings({ chartMergedDeskRbTradeStyle: row.id });
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                  }}
                  style={{
                    fontWeight: 800,
                    borderColor:
                      rbTradeStyle === row.id ? 'rgba(250,204,21,0.65)' : 'rgba(148,163,184,0.35)',
                    color: rbTradeStyle === row.id ? '#fde047' : undefined,
                    background:
                      rbTradeStyle === row.id ? 'rgba(250,204,21,0.12)' : undefined,
                  }}
                >
                  {row.label}
                </button>
              ))}
              <button
                type="button"
                className={`tool-chip tool-chip-button ${rbVolSyncOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !rbVolSyncOn;
                  setRbVolSyncOn(next);
                  saveSettings({
                    chartMergedDeskRbVolumeSyncEnabled: next,
                    ...(next
                      ? { chartVolumeIntelligence: true, chartVolumeRvolTiers: true }
                      : {}),
                  });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="띠 색+거래량 막대 연동 · 수급동의/괴리 · 과거 유사창 비교(참고)"
                style={{
                  fontWeight: 800,
                  borderColor: rbVolSyncOn ? 'rgba(244,114,182,0.55)' : undefined,
                  background: rbVolSyncOn
                    ? 'linear-gradient(90deg, rgba(34,197,94,0.18), rgba(244,114,182,0.16))'
                    : undefined,
                }}
              >
                띠수급
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${advVolumeOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !advVolumeOn;
                  setAdvVolumeOn(next);
                  saveSettings({
                    chartMergedDeskAdvVolumeEnabled: next,
                    ...(next ? { chartVolumeIntelligence: true } : {}),
                  });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="매수초록/매도빨강 스택 · 1차↓대기 · 2차반등 롱참고 · 자동주문 아님"
                style={{
                  fontWeight: 800,
                  borderColor: advVolumeOn ? 'rgba(34,197,94,0.55)' : undefined,
                  background: advVolumeOn
                    ? 'linear-gradient(90deg, rgba(34,197,94,0.2), rgba(239,68,68,0.16))'
                    : undefined,
                }}
              >
                선진거래량
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${cycleProgressOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !cycleProgressOn;
                  setCycleProgressOn(next);
                  saveSettings({ chartMergedDeskCycleProgressEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="지금자리 학파 도식(와이코프~터틀) · 상단 학파 칩 클릭"
                style={{
                  fontWeight: 800,
                  borderColor: cycleProgressOn ? 'rgba(196,181,253,0.55)' : undefined,
                }}
              >
                사이클도식
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${livePracticeOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !livePracticeOn;
                  setLivePracticeOn(next);
                  saveSettings({ chartMergedDeskLivePracticeCueEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="실전연습 · 금지/지정가대기/E체결후보 · 자동주문 아님"
                style={{
                  fontWeight: 800,
                  borderColor: livePracticeOn ? 'rgba(74,222,128,0.55)' : undefined,
                  background: livePracticeOn
                    ? 'linear-gradient(90deg, rgba(34,197,94,0.18), rgba(250,204,21,0.12))'
                    : undefined,
                }}
              >
                실전연습
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${telegramTestBusy || telegramTestNote ? 'tool-chip-active' : ''}`}
                disabled={telegramTestBusy}
                onClick={() => {
                  if (telegramTestBusy) return;
                  const send = chartSnapshotRef?.current?.sendTelegramTest;
                  if (!send) {
                    setTelegramTestNote('차트없음');
                    window.setTimeout(() => setTelegramTestNote(''), 2400);
                    return;
                  }
                  setTelegramTestBusy(true);
                  setTelegramTestNote('전송중');
                  void send().then((r) => {
                    setTelegramTestBusy(false);
                    setTelegramTestNote(r.ok ? '전송됨' : String(r.error || '실패').slice(0, 18));
                    window.setTimeout(() => setTelegramTestNote(''), 2800);
                  });
                }}
                title="지금 차트 캡처 1회 텔레그램 단톡 전송 · 자동알림 아님"
                style={{
                  fontWeight: 800,
                  borderColor: telegramTestNote === '전송됨' ? 'rgba(74,222,128,0.65)' : 'rgba(56,189,248,0.55)',
                  background: telegramTestBusy
                    ? 'rgba(14,116,144,0.35)'
                    : telegramTestNote === '전송됨'
                      ? 'rgba(20,83,45,0.45)'
                      : 'rgba(8,47,73,0.45)',
                }}
              >
                {telegramTestBusy ? '텔레…' : telegramTestNote ? `텔레·${telegramTestNote}` : '텔레테스트'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${patternDrawOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !patternDrawOn;
                  setPatternDrawOn(next);
                  saveSettings({ chartMergedDeskActionablePatternEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="고신뢰 캔들 패턴 + 넥라인 작도"
              >
                패턴작도
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${aiToneOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !aiToneOn;
                  setAiToneOn(next);
                  saveSettings({ chartMergedDeskAiToneEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="AI톤 — 차트 배경·캔들·밴드·존 색을 차분 팔레트로 (OFF=기존색 유지)"
                style={{
                  fontWeight: 800,
                  borderColor: aiToneOn ? 'rgba(125,211,252,0.45)' : undefined,
                  background: aiToneOn
                    ? 'linear-gradient(90deg, rgba(94,234,212,0.16), rgba(125,211,252,0.14))'
                    : undefined,
                }}
              >
                AI톤
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${pullbackEntryOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !pullbackEntryOn;
                  setPullbackEntryOn(next);
                  saveSettings({ chartMergedDeskRbPullbackEntryEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="눌림 타점 — 채널 되돌림 zone + 기관밴드·$$$$·로켓·거래량 합류 + E/SL/TP 가격선"
                style={{
                  fontWeight: 800,
                  borderColor: pullbackEntryOn ? 'rgba(52,211,153,0.55)' : undefined,
                }}
              >
                눌림타점
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => void runTopsBottomsScan()}
                disabled={tbScanLoading}
                title="SYMBOLS 전종목 TOP/BOT (RSI 피벗)"
              >
                {tbScanLoading ? 'TOP/BOT…' : 'TOP/BOT 스캔'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${institutionalBandOn ? 'tool-chip-active' : ''}`}
                onClick={toggleInstitutionalBand}
                title="초록/빨강 기관 SuperTrend 존상·존하 — 마감·안착에서 이전"
              >
                기관밴드
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${fusionDeskBandOn ? 'tool-chip-active' : ''}`}
                onClick={toggleFusionDeskBand}
                title="연합밴드 — Triple Trend(BigBeluga) + CP·LinReg·Strike 융합"
              >
                연합밴드
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${superAiOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !superAiOn;
                  setSuperAiOn(next);
                  saveSettings({ chartMergedDeskSuperAiEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="SMC 작도 — BOS·CH·OB·FVG·$$$·스윕·Entry/SL/TP · 롱/숏"
              >
                SMC 작도
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${unifiedCloudOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !unifiedCloudOn;
                  setUnifiedCloudOn(next);
                  saveSettings({ chartMergedDeskUnifiedCloudEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="통합구름 — CP큰구간(위빨강·아래초록·차트 대부분) + 흰 미래경로"
                style={{
                  fontWeight: 800,
                  borderColor: unifiedCloudOn ? 'rgba(248,250,252,0.55)' : 'rgba(239,68,68,0.45)',
                  color: unifiedCloudOn ? '#f8fafc' : undefined,
                  background: unifiedCloudOn
                    ? 'linear-gradient(90deg, rgba(239,68,68,0.22), rgba(34,197,94,0.2))'
                    : undefined,
                }}
              >
                통합구름
              </button>
              {bitgetVolEligible && (
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${bitgetVolOn ? 'tool-chip-active' : ''}`}
                  onClick={toggleBitgetVol}
                  title="Bitget Vol — 거래량 구간(1·2) · 거래량↑·매도↑·저점·상승/하락"
                >
                  Bitget Vol
                </button>
              )}
              <button
                type="button"
                className={`tool-chip tool-chip-button ${mirageFaceLang === 'en' ? 'tool-chip-active' : ''}`}
                onClick={toggleMirageFaceLang}
                title="차트 zone 탭 → 진입가능·대기·관망 한글 카드"
              >
                EN라벨
              </button>
              {superAiOn && (
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${zoneBattleHudOn ? 'tool-chip-active' : ''}`}
                  onClick={toggleZoneBattleHud}
                  title="Zone Battle AI 카드 ON/OFF — 차트 위 배틀 HUD 숨기기/표시"
                >
                  ZoneAI
                </button>
              )}
              <button
                type="button"
                className={`tool-chip tool-chip-button ${surgeDeskOpen ? 'tool-chip-active' : ''}`}
                onClick={() => setSurgeDeskOpen((v) => !v)}
                title="급등코인 스캔 창구 — 종목 클릭 시 지금 통합분석"
                style={{
                  fontWeight: 800,
                  borderColor: surgeDeskOpen ? 'rgba(251,191,36,0.65)' : 'rgba(251,191,36,0.4)',
                  color: surgeDeskOpen ? '#fde68a' : undefined,
                }}
              >
                급등
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${btccionDrawOn ? 'tool-chip-active' : ''}`}
                onClick={toggleBtccionDraw}
                title="btccion 스타일 캔들 작도 — 반응띠·돌파·무효·헌트·MB·경로·빔 (카드 없음)"
              >
                btccion작도
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${priceLabelFs <= 9 ? 'tool-chip-active' : ''}`}
                onClick={cyclePriceLabelFont}
                title="우측 가격축 숫자 + 축옆 컬러 라벨만 (하얀 원 영역). 차트 안 SL/E/TP1 면 글자는 제외. 8→14 순환"
              >
                가격축{priceLabelFs}
              </button>
              {superAiOn && (chartZoneBattle || mtfZoneBattle) && (
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${zoneBattleDetailOpen ? 'tool-chip-active' : ''}`}
                  onClick={() => setZoneBattleDetailOpen((v) => !v)}
                  title="zone 분석 — MTF zone battle 상세"
                >
                  zone분석
                </button>
              )}
              <button
                type="button"
                className={`tool-chip tool-chip-button ${mergedChartSettingsOpen ? 'tool-chip-active' : ''}`}
                onClick={openChartSettings}
                title="통합모드 전용 차트설정 — 표시·글자·위치·존색"
                style={{
                  fontWeight: 800,
                  borderColor: 'rgba(96,165,250,0.55)',
                  color: mergedChartSettingsOpen ? '#bfdbfe' : undefined,
                }}
              >
                ⚙ 차트설정
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${overlayLabelsOn ? 'tool-chip-active' : ''}`}
                title="차트 위 존·면 글자 ON/OFF. 띠·존 도형은 유지. 우측 축가격과 별개"
                onClick={() => {
                  const on = overlayLabelsOn;
                  saveSettings({
                    chartMergedDeskOverlayLabelsEnabled: !on,
                    ...(on ? {} : { chartBulkHideLabels: false }),
                  });
                }}
                style={{
                  fontWeight: 800,
                  borderColor: overlayLabelsOn ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.55)',
                  color: overlayLabelsOn ? '#bbf7d0' : '#fecaca',
                }}
              >
                라벨 {overlayLabelsOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${rightAxisPricesOn ? 'tool-chip-active' : ''}`}
                title="우측 가격축 알약(E/SL/TP·종가마감 등) ON/OFF. 차트 라벨과 별개"
                onClick={() => {
                  saveSettings({
                    chartMergedDeskRightAxisPricesEnabled: !rightAxisPricesOn,
                  });
                }}
                style={{
                  fontWeight: 800,
                  borderColor: rightAxisPricesOn ? 'rgba(56,189,248,0.55)' : 'rgba(248,113,113,0.55)',
                  color: rightAxisPricesOn ? '#bae6fd' : '#fecaca',
                }}
              >
                축가격 {rightAxisPricesOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${vrvpPocExtend === 'extend20' ? 'tool-chip-active' : ''}`}
                title="POC 최다거래 막대: 짧게 ↔ 마지막+20봉 연장"
                onClick={() => {
                  saveSettings({
                    chartMergedDeskVrvpPocExtend: vrvpPocExtend === 'extend20' ? 'short' : 'extend20',
                  });
                }}
                style={{
                  fontWeight: 800,
                  borderColor: 'rgba(250,204,21,0.55)',
                  color: '#fde047',
                }}
              >
                POC{vrvpPocExtend === 'extend20' ? '+20' : '짧게'}
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={saveChartView}
                title="지금(특히 4h) 화면 봉 폭을 저장 — 1m~1M 전환 시 동일 비율 공동 적용"
                style={{ borderColor: 'rgba(56,189,248,0.55)', fontWeight: 800 }}
              >
                뷰저장
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={restoreChartView}
                title="저장한 4h 기준 화면 비율을 현재 TF에 복원 — 분·시·일·주·월 공동"
              >
                뷰복원
              </button>
              </div>
              )}
              {!mobileFsActive && (
              <button
                type="button"
                className={`fullscreen-btn ${styles.chartFsBtn}${fsActive ? ` ${styles.chartFsBtnActive}` : ''}`}
                onClick={() => void toggleChartFullscreen()}
                title={fsActive ? '전체화면 종료 (Esc)' : '차트 영역 전체화면 — 캔들·상황 크게'}
              >
                {fsActive ? '전체화면 종료' : '차트 전체화면'}
              </button>
              )}
            </div>
          </div>

          {surgeDeskOpen && !fsActive && (
            <SurgeCoinDeskPanel
              activeSymbol={symbol}
              onPickSymbol={(sym) => onSymbolChange?.(sym)}
              onClose={() => setSurgeDeskOpen(false)}
            />
          )}
          <div
            className={`${styles.mergedChartWrap}${loading && !analysis ? ' loadingPulse' : ''}${fsActive ? ` ${styles.mergedChartWrapFsOnly}` : ''}${mobileFsActive ? ` ${styles.mergedChartWrapMobileFs}` : ''}`}
          >
            <div className={styles.mergedChartSlot}>
              {verdictStrip.lineKo && (
                <div
                  className={styles.mergedVerdictStrip}
                  data-tone={verdictStrip.tone}
                  title={verdictStrip.detailKo}
                >
                  {verdictStrip.lineKo}
                </div>
              )}
              {cycleProgress.primary && (
                <div
                  className={`${styles.mergedCycleTopBar} ${styles.mergedCycleTopBarClickable}${
                    verdictStrip.lineKo ? ` ${styles.mergedCycleTopBarBelowVerdict}` : ''
                  }`}
                  aria-label="지금 자리 학파 합류"
                  title={cycleProgress.primary.detailKo}
                >
                  <button
                    type="button"
                    className={`${styles.mergedCycleTopPrimary} ${styles.mergedCycleTopPrimaryClick}`}
                    data-tone={cycleProgress.primary.tone}
                    onClick={() => {
                      const live = cycleProgress.others.find(
                        (c) => asClickableSchool(c.kind) && !/도식 대기/.test(c.headlineKo)
                      );
                      const pk =
                        asClickableSchool(cycleProgress.primary?.kind) ??
                        asClickableSchool(live?.kind) ??
                        asClickableSchool(cycleProgress.others[0]?.kind) ??
                        (cycleProgress.wyckoff ? 'wyckoff' : cycleProgress.elliott ? 'elliott' : null);
                      if (pk) setSchematicOpen(pk);
                    }}
                  >
                    <span className={styles.mergedCycleTopTag}>{cycleProgress.primary.tagKo}</span>
                    {cycleProgress.nowKo}
                  </button>
                  {cycleProgress.others.map((c) => {
                    const sk = asClickableSchool(c.kind);
                    const waiting = /도식 대기/.test(c.headlineKo);
                    const rbRank = sk && blueRedChannelsOn ? rbChipConfluence?.rankBySchool[sk] : undefined;
                    return sk ? (
                      <button
                        key={c.kind + c.tagKo}
                        type="button"
                        className={`${styles.mergedCycleTopChip} ${styles.mergedCycleTopChipClick}${
                          waiting ? ` ${styles.mergedCycleTopChipWait}` : ''
                        }${schematicOpen === sk ? ` ${styles.mergedCycleTopChipOn}` : ''}${
                          rbRank === 1
                            ? ` ${styles.mergedCycleTopChipMatch1}`
                            : rbRank === 2
                              ? ` ${styles.mergedCycleTopChipMatch2}`
                              : rbRank === 3
                                ? ` ${styles.mergedCycleTopChipMatch3}`
                                : ''
                        }`}
                        title={`${c.headlineKo} · ${c.detailKo}${
                          rbRank ? ` · 띠일치 ${rbRank}위` : ''
                        } · 클릭하면 도식`}
                        onClick={() => setSchematicOpen(sk)}
                      >
                        {rbRank ? `${c.tagKo}·${rbRank}` : c.tagKo}
                      </button>
                    ) : (
                      <span key={c.kind + c.tagKo} className={styles.mergedCycleTopChip} title={c.detailKo}>
                        {c.tagKo}
                      </span>
                    );
                  })}
                </div>
              )}
              {schematicOpen && (
                <MergedDeskSchematicViewer
                  key={`${schematicOpen}-${cycleProgress.schematics[schematicOpen]?.hotspotKey ?? ''}`}
                  school={schematicOpen}
                  pin={cycleProgress.schematics[schematicOpen] ?? null}
                  elliott={cycleProgress.elliott}
                  wyckoff={cycleProgress.wyckoff}
                  candles={deskCandles}
                  lastPrice={liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? null}
                  buyBand={
                    deskPack?.hotZoneEntry?.below
                      ? {
                          lo: Math.min(deskPack.hotZoneEntry.below.bot, deskPack.hotZoneEntry.below.top),
                          hi: Math.max(deskPack.hotZoneEntry.below.bot, deskPack.hotZoneEntry.below.top),
                        }
                      : null
                  }
                  sellBand={
                    deskPack?.hotZoneEntry?.above
                      ? {
                          lo: Math.min(deskPack.hotZoneEntry.above.bot, deskPack.hotZoneEntry.above.top),
                          hi: Math.max(deskPack.hotZoneEntry.above.bot, deskPack.hotZoneEntry.above.top),
                        }
                      : null
                  }
                  onClose={() => setSchematicOpen(null)}
                />
              )}
              {chartMountReady ? (
                chartSlot({
                  mergedDeskPack: deskPackForChart,
                  mergedStrikeBundle: strikeBundle,
                  onMirageZoneSelect: handleMirageZoneSelect,
                  selectedMirageZoneId,
                  onMergedDeskChartCandlesChange,
                })
              ) : (
                <div className={styles.mergedChartBoot} aria-live="polite">
                  차트 준비 중…
                </div>
              )}
            </div>
            {!fsActive && (
              <MergedAnalysisZoneLabelRail
                levels={deskPack?.aresLevels ?? []}
                currentPrice={analysis?.currentPrice ?? strikeBundle?.close ?? null}
              />
            )}
            {superAiOn &&
              zoneBattleHudOn &&
              (chartZoneBattle || mtfZoneBattle || mtfZoneBattleLoading) &&
              (!fsActive || mobileFsActive) && (
              <MergedDeskZoneBattleHud
                chartBattle={chartZoneBattle}
                mtfPack={mtfZoneBattle}
                chartTf={timeframe}
                loading={mtfZoneBattleLoading}
                onOpenDetail={() => setZoneBattleDetailOpen(true)}
                onHide={toggleZoneBattleHud}
              />
            )}
            {selectedMirageOverlay && !zoneBattleDetailOpen && (
              <MergedDeskMirageZoneIntelHud
                overlay={selectedMirageOverlay}
                intel={mirageZoneIntel[selectedMirageZoneId!] ?? null}
                patternBrief={actionablePattern.brief}
                superAiHint={
                  chartZoneBattle?.headlineKo ??
                  mtfZoneBattle?.summaryKo ??
                  undefined
                }
                currentPrice={analysis?.currentPrice ?? strikeBundle?.close ?? null}
                masterFutures={deskPack?.masterFutures ?? null}
                hqEntryZones={deskPack?.hqEntryZones ?? null}
                tradeJudgment={deskPack?.tradeJudgment ?? null}
                hotZoneEntry={deskPack?.hotZoneEntry ?? null}
                bounceScenarios={deskPack?.bounceScenarios ?? null}
                zoneHold={
                  selectedMirageZoneId ? mirageZoneHold[selectedMirageZoneId] ?? null : null
                }
                exchangeTapeKo={mirageExchangeTapeKo}
                onClose={() => setSelectedMirageZoneId(null)}
              />
            )}
            {zoneBattleDetailOpen && (selectedMirageOverlay || zoneBattleRange || mtfZoneBattle) && (
              <MergedDeskZoneBattleDetailPanel
                overlay={selectedMirageOverlay}
                zoneBot={zoneBattleRange?.bot ?? mtfZoneBattle?.zoneBot}
                zoneTop={zoneBattleRange?.top ?? mtfZoneBattle?.zoneTop}
                chartBattle={chartZoneBattle}
                mtfPack={mtfZoneBattle}
                onClose={() => setZoneBattleDetailOpen(false)}
              />
            )}
          </div>

          {mobileFsActive && !hideMobileSituation && (
            <MergedDeskMobileFsSituationBar
              swingMid={deskPack?.swingMidEntry ?? null}
              master={deskPack?.masterFutures ?? null}
              symbol={symbol}
              timeframe={timeframe}
              price={analysis?.currentPrice ?? strikeBundle?.close ?? null}
              practiceCue={livePracticeOn ? deskPackForChart?.livePracticeCue : null}
            />
          )}

          {livePracticeOn && deskPackForChart?.livePracticeCue ? (
            <div
              className={styles.mergedLivePracticeStrip}
              data-mode={deskPackForChart.livePracticeCue.mode}
              aria-label="실전연습 큐"
              title={`${deskPackForChart.livePracticeCue.detailKo} · ${deskPackForChart.livePracticeCue.sizeKo}`}
            >
              <span className={styles.stripHqTag}>{deskPackForChart.livePracticeCue.tagKo}</span>
              <span className={styles.stripHqText}>{deskPackForChart.livePracticeCue.lineKo}</span>
              {practiceLogNote ? <span>{practiceLogNote}</span> : null}
              <button
                type="button"
                className={styles.mergedLivePracticeLogBtn}
                onClick={recordLivePracticeCue}
              >
                기록
              </button>
            </div>
          ) : null}

          {!hideTextStrips &&
            (deskPackForChart?.deskHud?.rbLiveEntryKo ?? deskHud?.rbLiveEntryKo) &&
            blueRedChannelsOn &&
            !fsActive && (
            <div
              className={styles.mergedHqEntryStrip}
              aria-label="AI파랑빨강띠 라이브 진입"
              title={
                deskPackForChart?.deskHud?.rbLiveEntryDetailKo ??
                deskHud?.rbLiveEntryDetailKo ??
                ''
              }
              style={{
                borderColor: (() => {
                  const action =
                    deskPackForChart?.deskHud?.rbLiveEntryActionKo ??
                    deskHud?.rbLiveEntryActionKo ??
                    '';
                  if (action.includes('롱진입')) return 'rgba(74,222,128,0.65)';
                  if (action.includes('숏진입')) return 'rgba(248,113,113,0.65)';
                  return 'rgba(250,204,21,0.45)';
                })(),
              }}
            >
              <span className={styles.stripHqTag}>
                {deskPackForChart?.deskHud?.rbLiveEntryActionKo ?? deskHud?.rbLiveEntryActionKo ?? 'AI채널'}
              </span>
              <span className={styles.stripHqText}>
                {deskPackForChart?.deskHud?.rbLiveEntryKo ?? deskHud?.rbLiveEntryKo}
              </span>
              {(deskPackForChart?.deskHud?.rbLiveEntryGradeKo ?? deskHud?.rbLiveEntryGradeKo) && (
                <span className={styles.stripHqTag}>
                  {deskPackForChart?.deskHud?.rbLiveEntryGradeKo ?? deskHud?.rbLiveEntryGradeKo}
                </span>
              )}
              {(deskPackForChart?.deskHud?.rbVolumeTagKo ?? deskHud?.rbVolumeTagKo) && (
                <span
                  className={styles.stripHqTag}
                  title={
                    deskPackForChart?.deskHud?.rbVolumeStoryKo ??
                    deskHud?.rbVolumeStoryKo ??
                    ''
                  }
                >
                  {deskPackForChart?.deskHud?.rbVolumeGateKo
                    ? `${deskPackForChart.deskHud.rbVolumeGateKo}·`
                    : deskHud?.rbVolumeGateKo
                      ? `${deskHud.rbVolumeGateKo}·`
                      : ''}
                  {deskPackForChart?.deskHud?.rbVolumeTagKo ?? deskHud?.rbVolumeTagKo}
                </span>
              )}
            </div>
          )}

          {!hideTextStrips &&
            (deskPackForChart?.deskHud?.activeTradePlanKo ?? deskHud?.activeTradePlanKo) &&
            !fsActive && (
            <div
              className={styles.mergedHqEntryStrip}
              aria-label="단일 매매 플랜 E/SL/TP/무효"
              title={deskPackForChart?.deskHud?.activeTradePlanKo ?? deskHud?.activeTradePlanKo}
              style={
                (deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan)?.status === 'ENTER'
                  ? { borderColor: 'rgba(74,222,128,0.55)' }
                  : (deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan)?.status === 'INVALID'
                    ? { borderColor: 'rgba(248,113,113,0.55)' }
                    : (deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan)?.status === 'TOUCH'
                      ? { borderColor: 'rgba(250,204,21,0.45)' }
                      : undefined
              }
            >
              <span className={styles.stripHqTag}>
                {(deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan)?.statusKo ?? '플랜'}
              </span>
              <span className={styles.stripHqText}>
                {deskPackForChart?.deskHud?.activeTradePlanKo ?? deskHud?.activeTradePlanKo}
              </span>
            </div>
          )}

          {!hideTextStrips && deskHud?.hotZoneEntryKo && !fsActive && (
            <div
              className={styles.mergedHqEntryStrip}
              aria-label="스윙 HotZone 위아래 1쌍"
              title={deskHud.hotZoneEntryKo}
            >
              <span className={styles.stripHqTag}>Hot존</span>
              <span className={styles.stripHqText}>{deskHud.hotZoneEntryKo}</span>
            </div>
          )}

          {!hideTextStrips &&
            MERGED_DESK_DOWNSIDE_BOUNCE_PLAN_VISIBLE &&
            deskHud &&
            !fsActive &&
            (deskHud.downsideBouncePlanKo ||
              deskHud.projectedDownsideKo ||
              deskHud.projectedUpsideKo) && (
            <div className={styles.mergedDownsideStrip} aria-label="하방 지지·상방 저항 zone">
              {deskHud.downsideBouncePlanKo && (
                <span className={styles.stripDownsidePlan} title="하방 지지 zone · 지지 후 반등 T1/Tmax (조건부)">
                  {deskHud.downsideBouncePlanKo}
                </span>
              )}
              {deskHud.projectedDownsideKo && (
                <span className={styles.stripProjectedSupport} title="하락 시 하방 핵심 지지 투영">
                  {deskHud.projectedDownsideKo}
                </span>
              )}
              {deskHud.projectedUpsideKo && (
                <span className={styles.stripProjectedSupport} title="상승 시 상방 핵심 저항 투영">
                  {deskHud.projectedUpsideKo}
                </span>
              )}
            </div>
          )}

          {!hideTextStrips && strategyChips && !fsActive && (
            <div className={styles.mergedStrategyStrip} aria-label="매매 레벨 요약">
              <span className={styles.stripDir}>
                {strategyChips.direction === 'LONG' ? '▲ 롱' : strategyChips.direction === 'SHORT' ? '▼ 숏' : '◆ 관망'}
              </span>
              {deskHud && (
                <span className={styles.stripGateHud} title={deskHud.gateHud.summaryKo}>
                  {deskHud.gateHud.gateLabels.map((g) => (
                    <span
                      key={g.key}
                      className={g.pass ? styles.gatePass : styles.gateFail}
                    >
                      {g.labelKo}
                    </span>
                  ))}
                  <span className={styles.gateCount}>{deskHud.gateHud.gatesPassCount}/5</span>
                </span>
              )}
              {deskHud && (
                <span className={deskHud.mtfAligned ? styles.stripMtfOk : styles.stripMtf}>
                  {deskHud.mtfAlignKo}
                </span>
              )}
              {deskHud && <span className={styles.stripVrvp}>{deskHud.vrvpConfluenceKo}</span>}
              {deskHud?.stCloudKo && (
                <span className={styles.stripStCloud} title="ST 구름 전환·터치">
                  {deskHud.stCloudKo}
                </span>
              )}
              {deskHud?.structureVerdictKo && (
                <span
                  className={`${styles.stripVerdict} ${
                    deskHud.structureVerdict === 'BOUNCE' || deskHud.structureVerdict === 'RISE_CONFIRMED'
                      ? styles.stripVerdictUp
                      : deskHud.structureVerdict === 'DECLINE_CONFIRMED' || deskHud.structureVerdict === 'PULLBACK'
                        ? styles.stripVerdictDown
                        : styles.stripVerdictWait
                  }`}
                  title={deskHud.supportReboundKo}
                >
                  {deskHud.structureVerdictKo}
                </span>
              )}
              {deskHud?.supportReboundKo && (
                <span className={styles.stripScenario} title="핵심 지지·반등 목표">
                  {deskHud.supportReboundKo}
                </span>
              )}
              {deskHud?.scenarioPathKo && (
                <span className={styles.stripScenario} title="하락→터치→반등 시나리오 zone">
                  {deskHud.scenarioPathKo}
                </span>
              )}
              {actionablePattern.brief && (
                <span
                  className={
                    actionablePattern.brief.rr != null && actionablePattern.brief.rr >= 1.5
                      ? styles.stripPatternOk
                      : styles.stripPattern
                  }
                  title={actionablePattern.brief.summaryKo}
                >
                  {actionablePattern.brief.labelKo} {actionablePattern.brief.confidence}%
                  {actionablePattern.brief.rr != null ? ` · RR 1:${actionablePattern.brief.rr}` : ''}
                </span>
              )}
              {deskHud?.topsBottomsKo && (
                <span className={styles.stripTopsBottoms} title="Precision TOP/BOT · RSI 필터">
                  {deskHud.topsBottomsKo}
                </span>
              )}
              {deskHud?.mirageLspKo && (
                <span className={styles.stripMirageLsp} title="Mirage LSP · 유동성 스윕">
                  {deskHud.mirageLspKo}
                </span>
              )}
              {deskHud?.tvStructureLsKo && (
                <span
                  className={styles.stripMirageLsp}
                  title="TV롱숏 · 돌파/안착/진입가능 · 어디부터(참고·확정 아님)"
                >
                  {deskHud.tvStructureLsKo}
                </span>
              )}
              <span>{strategyChips.stepKo}</span>
              <span className={styles.stripE}>E {strategyChips.entry.toFixed(2)}</span>
              <span className={styles.stripSl}>SL {strategyChips.stopLoss.toFixed(2)}</span>
              <span className={styles.stripTp1}>TP1 {strategyChips.tp1.toFixed(2)}</span>
              <span className={styles.stripTp2}>TP2 {strategyChips.tp2.toFixed(2)}</span>
              <span className={styles.stripTp3}>TP3 {strategyChips.tp3.toFixed(2)}</span>
            </div>
          )}

          {!fsActive && (tbScanLoading || tbScanRows.length > 0) && (
            <div className={styles.tbScanRow} aria-label="전종목 TOP/BOT 스캔">
              {tbScanSummary && <div className={styles.tbScanSummary}>{tbScanSummary}</div>}
              {tbScanLoading && <span className={styles.tbScanLoading}>스캔 중…</span>}
              {tbScanRows
                .filter((r) => r.signal !== 'NEUTRAL')
                .slice(0, 24)
                .map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    className={`${styles.tbScanChip} ${
                      r.signal === 'TOP' || r.signal === 'NEAR_TOP'
                        ? styles.tbScanChipTop
                        : styles.tbScanChipBot
                    } ${r.signal.startsWith('NEAR_') ? styles.tbScanChipNear : ''}`}
                    title={r.summaryKo}
                    onClick={() => onSymbolChange?.(r.symbol)}
                  >
                    {r.symbol.replace('USDT', '')}{' '}
                    {r.signal === 'TOP'
                      ? '▲TOP'
                      : r.signal === 'BOT'
                        ? '▼BOT'
                        : r.signal === 'NEAR_TOP'
                          ? '~TOP'
                          : '~BOT'}
                  </button>
                ))}
            </div>
          )}

          {!hideTextStrips && !fsActive && deskPack?.swingMidEntry && (
            <MergedDeskSwingMidEntryCard pack={deskPack.swingMidEntry} />
          )}
          {!hideTextStrips && !fsActive && (deskPack?.masterFutures || deskPack?.tradeJudgment) && (
            <MergedAnalysisTradeJudgmentBanner
              master={deskPack.masterFutures ?? null}
              judgment={deskPack.tradeJudgment ?? null}
              theme={theme}
              onJournal={onMasterJournal}
            />
          )}
          {!hideTextStrips && fsActive && !mobileFsActive && deskPack?.masterFutures && (
            <div
              className={`${styles.masterFsStrip} ${
                deskPack.masterFutures.side === 'LONG'
                  ? styles.judgmentBannerLong
                  : deskPack.masterFutures.side === 'SHORT'
                    ? styles.judgmentBannerShort
                    : styles.judgmentBannerNeutral
              }`}
              aria-label="마스터 확정"
            >
              <strong style={{ color: deskPack.masterFutures.color }}>
                {deskPack.masterFutures.side === 'LONG'
                  ? '롱'
                  : deskPack.masterFutures.side === 'SHORT'
                    ? '숏'
                    : '관망'}
              </strong>
              <span>{deskPack.masterFutures.grade} · {deskPack.masterFutures.strength}점</span>
              <span>{deskPack.masterFutures.entryAllowed ? '진입가능' : '진입잠금'}</span>
              <span className={styles.masterFsReason}>{deskPack.masterFutures.reasonKo}</span>
            </div>
          )}

          {!fsActive && deskPack?.timeline && (
            <div className={panelsOpen ? undefined : styles.mergedDeskPanelsHidden} aria-hidden={!panelsOpen}>
              <MergedAnalysisStructureTimeline
                tracks={deskPack.timeline}
                candles={fusionCandles}
                timeframe={timeframe}
                theme={theme}
              />
            </div>
          )}

          {!fsActive && (
            <div className={panelsOpen ? undefined : styles.mergedDeskPanelsHidden} aria-hidden={!panelsOpen}>
              <MergedAnalysisBottomPanels analysis={analysis} theme={theme} />
            </div>
          )}
        </div>

        {!fsActive && (
          <div
            className={`${styles.mergedDeskRightCol}${panelsOpen ? '' : ` ${styles.mergedDeskPanelsHidden}`}`}
            aria-hidden={!panelsOpen}
          >
            <MergedAnalysisRightPanel
              symbol={symbol}
              timeframe={timeframe}
              theme={theme}
              analysis={analysis}
              strikeBundle={strikeBundle}
              cardPanel={deskPack?.cardPanel ?? null}
              tradeSignal={deskPack?.tradeSignal ?? null}
              tradeJudgment={deskPack?.tradeJudgment ?? null}
              deskHud={deskPack?.deskHud ?? null}
              keyZones={deskPack?.keyZones ?? null}
              directionConfirms={deskPack?.directionConfirms ?? null}
              criticalZones={deskPack?.criticalZones ?? null}
              bounceScenarios={deskPack?.bounceScenarios ?? null}
              smcLeading={deskPack?.smcLeading ?? null}
              vrvp={deskPack?.vrvp ?? null}
              candleSourceKo={candleSourceKo}
              fusionCandles={fusionCandles}
              hubEnabled={chartMountReady && !!deskPack}
              bitgetDnaEnabled={bitgetVolEligible && bitgetVolOn}
            />
          </div>
        )}
      </div>
      <MergedDeskChartSettingsPanel
        open={mergedChartSettingsOpen}
        onOpenChange={setMergedChartSettingsOpen}
        labelTargets={chartLabelTargets}
        symbol={symbol}
      />
    </div>
  );
}
