'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue, startTransition, type ReactNode } from 'react';
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UIMode } from '@/lib/settings';
import { normalizeChartTimeframe, timeframeRank } from '@/lib/constants';
import { loadSettings, saveSettings } from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';
import {
  normalizeAvwapUserPins,
  removeAvwapUserPinsByIds,
  summarizeAvwapForSuperStats,
  buildMergedDeskAnchoredVwapDualPack,
  type MergedDeskAvwapUserPin,
} from '@/lib/mergedDeskAnchoredVwap';
import { buildVwapMarketContext } from '@/lib/vwap/context';
import {
  MERGED_DESK_SAVE_VIEW_EVENT,
  MERGED_DESK_RESTORE_VIEW_EVENT,
} from '@/lib/mergedDeskSharedChartView';
import { buildAvwapEntryGuidePack } from '@/lib/vwap/avwapEntryGuide';
import { buildAvwapFibConfluencePack } from '@/lib/vwap/avwapFibConfluence';
import { buildAvwapStatsConfluenceHub } from '@/lib/vwap/avwapStatsConfluenceHub';
import { buildMergedDeskEvidenceConfluencePack } from '@/lib/mergedDeskEvidenceConfluenceZones';
import { buildMergedDeskPracticeAiPlan } from '@/lib/mergedDeskPracticeAiPlan';
import { buildMergedDeskAi200ZonePack } from '@/lib/mergedDeskAi200ZoneBridge';
import { resolveAi200ScanTfs } from '@/lib/mergedDeskAi200ZoneRegistry';
import {
  loadAi200ZoneRegistry,
  persistAi200ZoneRegistry,
} from '@/lib/mergedDeskAi200ZoneRegistry';
import {
  buildMergedDeskMtfDumpZonePack,
  filterSharedMtfDumpZones,
  isMtfDumpChartLocalOnlyTf,
  MTF_DUMP_HTF_ALWAYS,
  resolveMtfDumpScanTfs,
} from '@/lib/mergedDeskMtfDumpZoneBridge';
import {
  loadMtfDumpZoneRegistry,
  persistMtfDumpZoneRegistry,
} from '@/lib/mergedDeskMtfDumpZoneRegistry';
import {
  computeTradeVisualFxState,
  decorateTradePriceLinesFx,
  buildTpCelebrateOverlays,
} from '@/lib/mergedDeskTradePlanVisualFx';
import {
  scanTradePlanJournalTouches,
  downloadTradeEventJournal,
  recordDumpZoneFormed,
  scanScalp200JournalEvents,
  syncTradeEventJournalToServer,
  appendTradeJournalEvent,
  type Scalp200JournalState,
  type TradeJournalEventKind,
} from '@/lib/mergedDeskTradeEventJournal';
import {
  stepMergedDeskAutoScalp,
  type AutoScalpPaperTrade,
} from '@/lib/mergedDeskAutoScalpEngine';
import {
  appendAutoScalpHistory,
  readAutoScalpLive,
  writeAutoScalpLive,
} from '@/lib/mergedDeskAutoScalpStore';
import { scanMergedDeskSignalJournal } from '@/lib/mergedDeskSignalJournalScan';
import {
  writeAiZoneEntrySnapshot,
  readAiZoneEntrySnapshot,
  extractFacesFromOverlays,
  extractTfFacesFromOverlays,
  extractInstitutionalBiasFromOverlays,
  detectDumpDeclineNear,
  detectVolumeHeavyFromCandles,
} from '@/lib/mergedDeskAiZoneSnapshot';
import { buildAiZoneDriveCandidate } from '@/lib/mergedDeskAiZoneDriveTrade';
import {
  probeAiZoneProgress,
  probeRbScalpProgress,
  upsertCoinTradeProgress,
} from '@/lib/mergedDeskCoinTradeProgress';
import { recordCoinTradeSkip } from '@/lib/mergedDeskCoinTradeLedger';
import {
  buildRbScalpDriveCandidate,
  rbScalpSymbolAllowed,
} from '@/lib/mergedDeskRbScalpDriveTrade';
import {
  fetchBprCandles15m,
  peekBprCandles15m,
} from '@/lib/mergedDeskBprDualEvidence';
import {
  runBtcSignalRace,
  writeBtcSignalBProbe,
} from '@/lib/mergedDeskBtcSignalRace';
import { BTC_ROCKET_CART_SOURCE } from '@/lib/mergedDeskBtcRocketCartSignal';
import { STRUCTURE_S_SOURCE } from '@/lib/mergedDeskStructureSSignal';
import { tickDualBgRaceEntries } from '@/lib/mergedDeskDualBgRaceEntry';
import { computeExtremeRangeFromCandles } from '@/lib/mergedDeskExtremeEntryGate';
import { computeInstitutionalSuperTrendMeta } from '@/lib/institutionalSuperBand';
import { buildVolumeAiZonePack } from '@/lib/volumeAiZoneEngine';
import { buildMergedDeskFeatureStatsPack } from '@/lib/mergedDeskFeatureStatsSim';
import {
  buildMergedDeskInstitutionalBandZones,
  MERGED_DESK_ST_TOUCH_AS_ZONES,
} from '@/lib/institutionalBandTouchZones';
import { maybeAutoResetMergedDeskChartDisplayOnce } from '@/lib/mergedDeskChartDisplaySettings';
import { MergedDeskChartSettingsPanel } from '@/app/components/mergedAnalysis/MergedDeskChartSettingsPanel';
import FoldCard from '@/app/components/ui/FoldCard';
import {
  analysisUsableOnChart,
  MERGED_DESK_SHARED_ANALYZE_TF,
} from '@/lib/mergedDesk4hReferenceAnalysis';
import { isMergedAnalysisDeskMode } from '@/lib/mergedAnalysisDeskMode';
import { isBitgetVolumePackActive } from '@/lib/bitgetVolumePack';
import { useBitgetWhaleDnaStats } from '@/lib/useBitgetWhaleDnaStats';
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
import Doksuri1BattleCard from './Doksuri1BattleCard';
import { buildDoksuri1Pack } from '@/lib/doksuri1/buildDoksuri1Pack';
import {
  resolveUltraScalpRoeCaps,
  resolveUltraTradingMode,
  ultraScalpMaxBars,
  ultraScalpTfGate,
} from '@/lib/doksuri1/ultraScalpEngine';
import { resolveAutoTradeTfHold } from '@/lib/doksuri1/autoTradeTfHoldScale';
import {
  buildFourStrategyPaperOpen,
  evaluateFourStrategyPack,
} from '@/lib/doksuri1/fourStrategyEngine';
import { buildFourStrategyCards } from '@/lib/doksuri1/fourStrategyStats';
import { detectRbRailSfp } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import type { FourStrategyCardView } from '@/lib/doksuri1/fourStrategyTypes';
import { FOUR_STRATEGY_KO } from '@/lib/doksuri1/fourStrategyTypes';
import { scanVirtualAnalysisEntries } from '@/lib/mergedDeskVirtualAnalysisHub';
import { buildDumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import MergedDeskSuperAdvancedStatsStrip from './MergedDeskSuperAdvancedStatsStrip';
import { MergedDeskFeatureStatsPanel } from './MergedDeskFeatureStatsPanel';
import { MergedDeskChartFeatureHud } from './MergedDeskChartFeatureHud';
import {
  filterOverlaysByChartFeatureChips,
  type MergedDeskChartFeatureChipId,
} from '@/lib/mergedDeskChartFeatureChips';
import { useTfCloseSettleBoard } from '@/lib/useTfCloseSettleBoard';
import { MergedDeskSwingMidEntryCard } from './MergedDeskSwingMidEntryCard';
import { MergedDeskMobileFsSituationBar } from './MergedDeskMobileFsSituationBar';
import { logMergedDeskTradeLearning } from '@/lib/mergedAnalysisTradeLearningClient';
import {
  mergedDeskHideTextStrips,
  mergedDeskHideMobileSituationBar,
  mergedDeskHideMobileChartHtmlLabels,
} from '@/lib/mergedDeskChartOnlyUi';
import { appendMasterFuturesJournal } from '@/lib/mergedDeskMasterFuturesJournal';
import type { TopsBottomsScanRow } from '@/lib/topsAndBottomsIndicator';
import type { ChartSnapshotRef } from '@/app/components/ChartView';
import Eagle1StructureDesk from '../eagle1/Eagle1StructureDesk';
import type { MergedAnalysisDeskPack } from '@/lib/mergedAnalysisDeskEngine';
import { resolveMergedDeskCanonicalCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { filterMergedDeskDownsideSupportOverlays } from '@/lib/mergedAnalysisOverlayIds';
import { isMergedDeskBtccionOverlayId } from '@/lib/mergedDeskBtccionCandleDraw';
import { MERGED_DESK_DOWNSIDE_BOUNCE_PLAN_VISIBLE } from '@/lib/mergedDeskDownsideBouncePlan';
import { buildMergedDeskChannelMoneyEdgePack } from '@/lib/mergedDeskChannelMoneyEdge';
import { applyMergedDeskRbStyleToOverlays } from '@/lib/mergedDeskBlueRedChannels';
import { buildMergedDeskRbSmcPoisPack, resolveRbSmcHtfTf } from '@/lib/mergedDeskRbSmcPois';
import {
  buildMergedDeskThisMuchMeasurePack,
  THIS_MUCH_LOOKBACK,
} from '@/lib/mergedDeskThisMuchMeasure';
import {
  candlesMatchChartTimeframe,
  fetchClientMarketCandles,
  peekClientMarketCandles,
  prefetchClientMarketCandles,
} from '@/lib/clientMarketCandleCache';
import { mergedDesk4hReferenceCandles } from '@/lib/mergedDesk4hReference';
import { buildMergedDeskRbSchematicChartDraw } from '@/lib/mergedDeskRbSchematicChartDraw';
import { computeMergedDeskRbChipConfluence } from '@/lib/mergedDeskRbChipConfluence';
import {
  resolveMergedDeskActiveTradePlan,
  buildMergedDeskActiveTradePriceLines,
  isMergedDeskTradeRailPriceLine,
  summarizeMergedDeskActiveTradePlanKo,
} from '@/lib/mergedDeskActiveTradePlan';
import {
  applyMergedDeskFrozenCanonicalDisplay,
  applyMergedDeskFrozenTradePlan,
} from '@/lib/mergedDeskFrozenTradePlan';
import { applySuperStatsHubToActiveTrade } from '@/lib/mergedDeskSuperStatsHub';
import {
  appendLivePracticeLog,
  buildMergedDeskLivePracticeCue,
  buildMergedDeskLivePracticeOverlay,
} from '@/lib/mergedDeskLivePracticeCue';
import { buildMergedDeskAdvVolumePack } from '@/lib/mergedDeskAdvVolumeRead';
import { buildAiMarketZonePack, type AmzEnginePack } from '@/lib/aiMarketZoneEngine';
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
import { stampRbOverlaysWithWaveAutoLabels } from '@/lib/mergedDeskRbWaveStructureDraw';
import {
  computeMergedDeskRbLiveEntryHub,
  stampMergedDeskMoneyZonesWithLiveHub,
  stampMergedDeskOverlaysWithLiveHub,
} from '@/lib/mergedDeskRbLiveEntryHub';
import { computeMergedDeskRbVolumePulse } from '@/lib/mergedDeskRbVolumePulse';
import { buildMergedDeskChannelPullbackEntryPack } from '@/lib/mergedDeskChannelPullbackEntry';
import { buildMergedDeskRbRailBounceEntryPack } from '@/lib/mergedDeskRbRailBounceEntry';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import { buildParallelChannelEngine } from '@/lib/eagle1/parallelChannelEngine';
import { buildParallelPivotLines, buildBnbParallelPivotOverlays } from '@/lib/mergedDeskParallelPivotLines';
import { detectMonthDeskMoneyZones } from '@/lib/monthDeskMoneyZone';
import { structureRocketDirectionOnLastCandle, structureRocketRowOnLastCandle } from '@/lib/mtfStructureRocket';
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
import { applyMergedDeskStrongestAnalysisZone } from '@/lib/mergedDeskStrongestAnalysisZone';
import { applyMergedDeskCoreStatsZoneGate } from '@/lib/mergedDeskCoreStatsZoneGate';
import {
  polishMergedDeskChartOverlays,
  stampMergedDeskMoneyZoneConfluence,
  buildMergedDeskMoneyZoneAxisLines,
  dedupeMergedDeskAxisPriceLines,
  isMergedDeskRequestedVisibleZone,
  filterMergedDeskEngineZoneClutter,
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
import { buildMergedDeskReaccZonePack } from '@/lib/mergedDeskReaccumulationZone';
import {
  buildMergedDeskVerdictStrip,
  pickNextNewsHint,
} from '@/lib/mergedDeskVerdictStrip';
import { buildMergedDeskDerivativesPriceLines } from '@/lib/mergedDeskDerivativesIntel';
import { buildMergedDeskNewsEventDraw } from '@/lib/mergedDeskNewsEventLines';
import { buildEagle1FakeBreakChartOverlay } from '@/lib/eagle1/fakeBreakChartOverlay';
import { buildEagle1ChartZoneOverlays } from '@/lib/eagle1/chartZoneInject';
import { buildEagle1AiZonePack, buildEagle1AiZonePriceLines, buildEagle1AiZoneClickDetail } from '@/lib/eagle1/aiZonePack';
import { buildEagle1CanonicalTradeDisplay } from '@/lib/eagle1/canonicalTradeDisplay';
import Eagle1AiZoneClickCard from '@/app/components/eagle1/Eagle1AiZoneClickCard';
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
import { MergedDeskAiMarketZoneSideCard } from './MergedDeskAiMarketZoneSideCard';
import MergedDeskPatternMemoryCard from './MergedDeskPatternMemoryCard';
import MergedDeskAutoScalpCard from './MergedDeskAutoScalpCard';
import MergedDeskAutoTradePanel from './MergedDeskAutoTradePanel';
import {
  readAutoTradeConfig,
  writeAutoTradeConfig,
  isAutoTradeSymbolEnabled,
  ensureAutoTradeSymbolEnabled,
  wasAutoTradeSignalFired,
  type MergedDeskAutoTradeConfig,
} from '@/lib/mergedDeskAutoTradeConfig';
import { setVisibleInterval, delayMs } from '@/lib/visibleInterval';
import { maybeLiveReduce } from '@/lib/mergedDeskAutoTradeRunner';
import {
  executeUnifiedAnalysisEntry,
  resolveUnifiedTradeMode,
} from '@/lib/mergedDeskUnifiedAnalysisEntry';
import { isTapointTapOnly } from '@/lib/eagle1Tapoint/config';
import { resolveWick15mLeverage } from '@/lib/mergedDeskWick15mTrade';
import { resolveBtcUltraLeverage } from '@/lib/mergedDeskBtcUltraScalpPack';
import { enrichZoneOverlaysWithSrProb } from '@/lib/zoneSupportResistProb';
import {
  readVirtualTradeSession,
  writeVirtualTradeSession,
  VIRTUAL_TRADE_EVENT,
  maybeVirtualTp1Half,
  maybeVirtualRunnerOrBeClose,
  maybeVirtualSlBeforeTp1,
  touchVirtualReentryExtreme,
  canVirtualReentryNow,
  isVirtualPostFlatCooldown,
  type VirtualTradeSession,
  type VirtualEntrySource,
} from '@/lib/mergedDeskVirtualTradeSession';
import { VIRTUAL_TP1_FRAC } from '@/lib/mergedDeskVirtualMtfWatcher';
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

/** seat 등 → 교재 도식 폴백 */
const FILL_SCHOOL_FALLBACK: Record<string, ClickableSchool> = {
  seat: 'wyckoff',
};

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
  /** true=독수리1호 HUD. false(기본)=서버 ARES 통합·분석 툴바·캔들분석 */
  wrapEagle1Hud?: boolean;
  /** true면 독수리1호에서도 ARES 툴바·서버 차트 공동 사용 (로컬 structureDesk 툴바 숨김) */
  shareMergedServerChart?: boolean;
  /** Playwright 텔레 캡처 — 차트만 전체화면, 패널·HUD 숨김 */
  telegramCaptureMode?: boolean;
};

const MERGED_TF_CHIPS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'] as const;

import { isMobileLikeViewport } from '@/lib/isMobileLikeViewport';

/** ★·Money·HQ 클래식 zone 면 — AI ZONE 오버레이와 별도 토글 */
function isClassicDeskZoneOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  const label = String(o.zoneFaceBase || o.label || '');
  if (id.startsWith('eagle1-ai-zone--') || extra.includes('eagle1-ai-analysis-zone')) return false;
  /** 재매집/재분배 — 기존 통합모드 추가 기능, classic 토글과 무관하게 유지 */
  if (id.startsWith('merged-desk-reacc-') || extra.includes('merged-desk-reacc')) return false;
  if (extra.includes('merged-desk-money-zone') || extra.includes('money-zone-keep')) return true;
  if (extra.includes('merged-desk-strongest-analysis-zone')) return true;
  if (/★|초강력|강력반응|약반응|중급반응|약하락|강력하락|반응|최강분석|최강·/.test(label)) return true;
  if (id.startsWith('merged-desk-rb-core-') || id.startsWith('merged-desk-rb-rail-bounce')) return true;
  if (extra.includes('merged-hq-entry-zone') || id.startsWith('merged-desk-hq-')) return true;
  if (extra.includes('merged-desk-hotzone-entry') || extra.includes('merged-desk-hotzone-pair')) return true;
  return false;
}

function filterClassicDeskZoneOverlays(list: OverlayItem[]): OverlayItem[] {
  return list.filter((o) => !isClassicDeskZoneOverlay(o));
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
  wrapEagle1Hud = false,
  shareMergedServerChart = false,
  telegramCaptureMode = false,
}: Props) {
  const chartColRef = useRef<HTMLDivElement>(null);
  const scrollLockYRef = useRef(0);
  const [chartFullscreen, setChartFullscreen] = useState(telegramCaptureMode);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? isMobileLikeViewport() : false
  );
  /** 폰: 도구 칩 기본 닫힘 — 차트 면이 먼저 보이도록 (열면 도구, 닫으면 차트↑) */
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  /** PC: 도구 칩 숨김/표시 (표시한 하얀 네모 자리) — 기본 열림 */
  const [desktopToolsOpen, setDesktopToolsOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const v = window.localStorage.getItem('merged-desk-desktop-tools-open');
      if (v === '0') return false;
      if (v === '1') return true;
    } catch {
      /* ignore */
    }
    return true;
  });
  /** 폰: 학파 도식 칩 — 도구와 상호배타 (겹침 방지) */
  const [mobileDiagramOpen, setMobileDiagramOpen] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const [swingDraw, setSwingDraw] = useState(
    () => loadSettings().chartMergedDeskSwingDrawEnabled !== false
  );
  const [avwapOn, setAvwapOn] = useState(
    () => loadSettings().chartMergedDeskAnchoredVwapEnabled !== false
  );
  const [avwapHtf, setAvwapHtf] = useState<'1d' | '1w'>(
    () => (loadSettings().chartMergedDeskAnchoredVwapHtf === '1w' ? '1w' : '1d')
  );
  const [avwapPlaceArmed, setAvwapPlaceArmed] = useState(
    () => loadSettings().chartMergedDeskAvwapPlaceArmed === true
  );
  const [avwapAutoExtreme, setAvwapAutoExtreme] = useState(
    () => loadSettings().chartMergedDeskAvwapAutoExtremeEnabled === true
  );
  const [vwapPoiBandOn, setVwapPoiBandOn] = useState(
    () => loadSettings().chartMergedDeskVwapPoiBandEnabled === true
  );
  const [sessionVwapOn, setSessionVwapOn] = useState(
    () => loadSettings().chartMergedDeskSessionVwapEnabled === true
  );
  const [avwapFibOn, setAvwapFibOn] = useState(
    () => loadSettings().chartMergedDeskAvwapFibEnabled === true
  );
  const [evidenceZonesOn, setEvidenceZonesOn] = useState(
    () => loadSettings().chartMergedDeskEvidenceZonesEnabled !== false
  );
  const [practiceAiOn, setPracticeAiOn] = useState(
    () => loadSettings().chartMergedDeskPracticeAiPlanEnabled !== false
  );
  const [scalp200On, setScalp200On] = useState(
    () => loadSettings().chartMergedDeskScalp200Enabled === true
  );
  const [mtfDumpOn, setMtfDumpOn] = useState(
    () => loadSettings().chartMergedDeskMtfDumpZoneEnabled !== false
  );
  const [mtfDumpDisplayMode, setMtfDumpDisplayMode] = useState<'path' | 'mtf'>(() =>
    loadSettings().chartMergedDeskMtfDumpDisplayMode === 'mtf' ? 'mtf' : 'path'
  );
  const bitgetVolumeDeskOn = useMemo(
    () => isBitgetVolumePackActive(uiMode, loadSettings(), symbol),
    [uiMode, symbol]
  );
  const deskWhaleDna = useBitgetWhaleDnaStats({
    symbol,
    timeframe,
    enabled: bitgetVolumeDeskOn && mtfDumpOn,
  });
  const deskWhaleBeamIntel = deskWhaleDna.intel;
  const [tradeShowInvLabel, setTradeShowInvLabel] = useState(
    () => loadSettings().chartMergedDeskTradeShowInvalidLabel !== false
  );
  const [tradeShowTp23, setTradeShowTp23] = useState(
    () => loadSettings().chartMergedDeskTradeShowTp2Tp3 !== false
  );
  const [tradeApproachPulse, setTradeApproachPulse] = useState(
    () => loadSettings().chartMergedDeskTradeApproachPulse !== false
  );
  const [tradeTpCelebrate, setTradeTpCelebrate] = useState(
    () => loadSettings().chartMergedDeskTradeTpCelebrate !== false
  );
  const [mtfDumpCandlesByTf, setMtfDumpCandlesByTf] = useState<Record<string, Candle[]>>({});
  const [ai200CandlesByTf, setAi200CandlesByTf] = useState<Record<string, Candle[]>>({});
  const [ai200Registry, setAi200Registry] = useState<
    import('@/lib/mergedDeskAi200ZoneRegistry').Ai200ZoneSpec[]
  >([]);
  const ai200PersistRef = useRef('');
  const [mtfDumpRegistry, setMtfDumpRegistry] = useState<
    import('@/lib/mergedDeskMtfDumpZoneBridge').MtfDumpZoneSpec[]
  >([]);
  const mtfDumpPersistRef = useRef('');
  const mtfDumpRecordedRef = useRef('');
  const tradeJournalScanRef = useRef<string>('');
  const signalJournalScanRef = useRef<string>('');
  const scalp200JournalStateRef = useRef<Scalp200JournalState | ''>('');
  const [avwapUserHidden, setAvwapUserHidden] = useState(
    () => loadSettings().chartMergedDeskAvwapUserPinsHidden === true
  );
  const [avwapUserPins, setAvwapUserPins] = useState<MergedDeskAvwapUserPin[]>(
    () => normalizeAvwapUserPins(loadSettings().chartMergedDeskAvwapUserPins)
  );
  const [avwapSelectedIds, setAvwapSelectedIds] = useState<string[]>(
    () =>
      Array.isArray(loadSettings().chartMergedDeskAvwapSelectedPinIds)
        ? loadSettings().chartMergedDeskAvwapSelectedPinIds.map(String).filter(Boolean)
        : []
  );
  const [blueRedChannelsOn, setBlueRedChannelsOn] = useState(
    () => loadSettings().chartMergedDeskBlueRedChannelsEnabled !== false
  );
  const [parallelChannelEngineOn, setParallelChannelEngineOn] = useState(
    () => loadSettings().chartMergedDeskParallelChannelEngineEnabled !== false
  );
  const [wavePathOn, setWavePathOn] = useState(
    () => loadSettings().chartMergedDeskWavePathEnabled !== false
  );
  const [rbVolSyncOn, setRbVolSyncOn] = useState(
    () => loadSettings().chartMergedDeskRbVolumeSyncEnabled !== false
  );
  const [rbBullHex, setRbBullHex] = useState(
    () => String(loadSettings().chartMergedDeskRbBullHex || '#22C55E')
  );
  const [rbBearHex, setRbBearHex] = useState(
    () => String(loadSettings().chartMergedDeskRbBearHex || '#EF4444')
  );
  const [rbFillOpacity, setRbFillOpacity] = useState(() => {
    const n = Number(loadSettings().chartMergedDeskRbFillOpacity);
    return Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : 14;
  });
  const [rbHatchMode, setRbHatchMode] = useState<'off' | 'soft' | 'on'>(() => {
    const h = loadSettings().chartMergedDeskRbHatchMode;
    return h === 'soft' || h === 'on' ? h : 'off';
  });
  const [rbSmcPoisOn, setRbSmcPoisOn] = useState(
    () => loadSettings().chartMergedDeskRbSmcPoisEnabled !== false
  );
  const [thisMuchOn, setThisMuchOn] = useState(
    () => loadSettings().chartMergedDeskThisMuchEnabled !== false
  );
  /** 超级채널SMC — 상위 TF MSB 정렬용 캔들 */
  const [rbSmcHtfCandles, setRbSmcHtfCandles] = useState<Candle[]>([]);
  const [rbSmcHtfTf, setRbSmcHtfTf] = useState<string | null>(null);
  const [advVolumeOn, setAdvVolumeOn] = useState(true);
  const [cycleProgressOn, setCycleProgressOn] = useState(
    () => loadSettings().chartMergedDeskCycleProgressEnabled !== false
  );
  const [cycleBarFolded, setCycleBarFolded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('ailongshort-merged-cycle-bar-folded-v1') === '1';
    } catch {
      return false;
    }
  });
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
  const [patternSilhouetteOn, setPatternSilhouetteOn] = useState(
    () => loadSettings().chartMergedDeskPatternSilhouetteEnabled !== false
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
      setAiAnalysisZoneOn(s.chartMergedDeskAiAnalysisZoneEnabled !== false);
      setClassicZoneOn(s.chartMergedDeskClassicZoneEnabled === true);
      setUnifiedCloudOn(s.chartMergedDeskUnifiedCloudEnabled !== false);
      setBtccionDrawOn(s.chartMergedDeskBtccionDrawEnabled !== false);
      setMirageFaceLang(s.chartMirageZoneFaceLang === 'en' ? 'en' : 'ko');
      setInstitutionalBandOn(s.chartMergedInstitutionalBandEnabled !== false);
      setFusionDeskBandOn(s.chartMonthDeskFusionDeskBandEnabled !== false);
      setZoneBattleHudOn(s.chartMergedDeskZoneBattleHudEnabled !== false);
      setSwingDraw(s.chartMergedDeskSwingDrawEnabled !== false);
      setAvwapOn(s.chartMergedDeskAnchoredVwapEnabled !== false);
      setAvwapHtf(s.chartMergedDeskAnchoredVwapHtf === '1w' ? '1w' : '1d');
      setAvwapPlaceArmed(s.chartMergedDeskAvwapPlaceArmed === true);
      setAvwapAutoExtreme(s.chartMergedDeskAvwapAutoExtremeEnabled === true);
      setVwapPoiBandOn(s.chartMergedDeskVwapPoiBandEnabled === true);
      setSessionVwapOn(s.chartMergedDeskSessionVwapEnabled === true);
      setAvwapFibOn(s.chartMergedDeskAvwapFibEnabled === true);
      setEvidenceZonesOn(s.chartMergedDeskEvidenceZonesEnabled !== false);
      setPracticeAiOn(s.chartMergedDeskPracticeAiPlanEnabled !== false);
      setScalp200On(s.chartMergedDeskScalp200Enabled === true);
      setAutoScalpPaperOn(s.chartMergedDeskAutoScalpPaperEnabled === true);
      setAutoTradeOn(s.chartMergedDeskAutoTradeEnabled === true);
      {
        const prevAt = readAutoTradeConfig();
        /** 실전 ARM 중이면 설정 동기화가 enabled를 끄지 않음 */
        const keepLive = prevAt.liveArmed === true;
        const at = writeAutoTradeConfig({
          enabled: keepLive || s.chartMergedDeskAutoTradeEnabled === true,
          liveArmed: keepLive ? true : prevAt.liveArmed,
          tradingMode: keepLive ? 'LIVE' : prevAt.tradingMode,
          leverage: Number(s.chartMergedDeskAutoTradeLeverage) || prevAt.leverage,
          marginUsdt: Number(s.chartMergedDeskAutoTradeMarginUsdt) || prevAt.marginUsdt,
          scalpEquityPct:
            Number(s.chartMergedDeskAutoTradeEquityPct) || prevAt.scalpEquityPct,
          doksuriEquityPct:
            Number(s.chartMergedDeskAutoTradeDoksuriEquityPct) ||
            prevAt.doksuriEquityPct ||
            Number(s.chartMergedDeskAutoTradeEquityPct) ||
            prevAt.scalpEquityPct,
          equityPct: Number(s.chartMergedDeskAutoTradeEquityPct) || prevAt.equityPct,
        });
        setAutoTradeCfg(at);
        if (keepLive) setAutoTradeOn(true);
      }
      setMtfDumpOn(s.chartMergedDeskMtfDumpZoneEnabled !== false);
      setMtfDumpDisplayMode(s.chartMergedDeskMtfDumpDisplayMode === 'mtf' ? 'mtf' : 'path');
      setTradeShowInvLabel(s.chartMergedDeskTradeShowInvalidLabel !== false);
      setTradeShowTp23(s.chartMergedDeskTradeShowTp2Tp3 !== false);
      setTradeApproachPulse(s.chartMergedDeskTradeApproachPulse !== false);
      setTradeTpCelebrate(s.chartMergedDeskTradeTpCelebrate !== false);
      setAvwapUserHidden(s.chartMergedDeskAvwapUserPinsHidden === true);
      setAvwapUserPins(normalizeAvwapUserPins(s.chartMergedDeskAvwapUserPins));
      setAvwapSelectedIds(
        Array.isArray(s.chartMergedDeskAvwapSelectedPinIds)
          ? s.chartMergedDeskAvwapSelectedPinIds.map(String).filter(Boolean)
          : []
      );
      setBlueRedChannelsOn(s.chartMergedDeskBlueRedChannelsEnabled !== false);
      setParallelChannelEngineOn(s.chartMergedDeskParallelChannelEngineEnabled !== false);
      setWavePathOn(s.chartMergedDeskWavePathEnabled !== false);
      setRbVolSyncOn(s.chartMergedDeskRbVolumeSyncEnabled !== false);
      setRbBullHex(String(s.chartMergedDeskRbBullHex || '#22C55E'));
      setRbBearHex(String(s.chartMergedDeskRbBearHex || '#EF4444'));
      {
        const n = Number(s.chartMergedDeskRbFillOpacity);
        setRbFillOpacity(Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : 14);
      }
      {
        const h = s.chartMergedDeskRbHatchMode;
        setRbHatchMode(h === 'soft' || h === 'on' ? h : 'off');
      }
      setRbSmcPoisOn(s.chartMergedDeskRbSmcPoisEnabled !== false);
      setThisMuchOn(s.chartMergedDeskThisMuchEnabled !== false);
      setAdvVolumeOn(s.chartMergedDeskAdvVolumeEnabled !== false);
      setAiMarketZoneOn(s.chartMergedDeskAiMarketZoneEnabled === true);
      setStatsHudOn(s.chartMergedDeskStatsHudEnabled === true);
      setChartFvgOn(s.chartMergedDeskChartFvgEnabled !== false);
      setChartObOn(s.chartMergedDeskChartObEnabled !== false);
      setChartChochOn(s.chartMergedDeskChartChochEnabled !== false);
      setChartBosOn(s.chartMergedDeskChartBosEnabled !== false);
      setDoksuri1BriefingOn(s.chartMergedDeskDoksuri1BriefingEnabled !== false);
      setDoksuri1DerivOn(s.chartMergedDeskDoksuri1DerivEnabled !== false);
      setDoksuri1OrderflowOn(s.chartMergedDeskDoksuri1OrderflowEnabled === true);
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

  /** 파랑빨강띠 통로 레일 선 — 사용자 hex → CSS 변수 */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const applyVars = () => {
      document.querySelectorAll('.chart-wrap--merged-analysis').forEach((el) => {
        const node = el as HTMLElement;
        node.style.setProperty('--md-rb-bull-stroke', rbBullHex || '#22C55E');
        node.style.setProperty('--md-rb-bear-stroke', rbBearHex || '#EF4444');
      });
    };
    applyVars();
    const t = window.setTimeout(applyVars, 80);
    return () => window.clearTimeout(t);
  }, [rbBullHex, rbBearHex, blueRedChannelsOn, chartDisplayTick]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    maybeAutoResetMergedDeskChartDisplayOnce();
    saveSettings({
      chartMergedDeskAdvVolumeEnabled: true,
      chartMergedDeskSwingAnchorVolumeEnabled: true,
      chartVolumeIntelligence: true,
    });
    setAdvVolumeOn(true);
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    const storedPanels = window.localStorage.getItem(PANELS_TOGGLE_KEY);
    if (storedPanels === '1') setPanelsOpen(true);
    else setPanelsOpen(false);
    setSwingDraw(loadSettings().chartMergedDeskSwingDrawEnabled !== false);
    setBlueRedChannelsOn(loadSettings().chartMergedDeskBlueRedChannelsEnabled !== false);
    setParallelChannelEngineOn(loadSettings().chartMergedDeskParallelChannelEngineEnabled !== false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncMq = () => setIsMobileViewport(isMobileLikeViewport());
    syncMq();
    window.addEventListener('resize', syncMq);
    window.visualViewport?.addEventListener('resize', syncMq);
    return () => {
      window.removeEventListener('resize', syncMq);
      window.visualViewport?.removeEventListener('resize', syncMq);
    };
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
    const h = Math.round(window.visualViewport?.height ?? window.innerHeight);
    el.style.height = `${h}px`;
    el.style.maxHeight = `${h}px`;
    el.style.minHeight = `${h}px`;
    /* LWC가 부모 높이 변경을 즉시 반영하도록 */
    window.dispatchEvent(new Event('resize'));
  }, []);

  const bumpChartResize = useCallback(() => {
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 280);
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 520);
  }, []);

  const applyChartFsClasses = useCallback((on: boolean) => {
    const el = chartColRef.current;
    if (!el) return;
    el.setAttribute('data-eagle1-chart-fs-root', '1');
    const CSS_FS = 'is-css-chart-fullscreen';
    if (on) {
      el.classList.add(CSS_FS);
      document.documentElement.classList.add('eagle1-chart-fs-active');
      document.body.classList.add('eagle1-chart-fs-active');
    } else {
      el.classList.remove(CSS_FS);
      document.documentElement.classList.remove('eagle1-chart-fs-active');
      document.body.classList.remove('eagle1-chart-fs-active');
    }
  }, []);

  const syncFullscreen = useCallback(() => {
    const el = chartColRef.current;
    const nativeOn = Boolean(el && document.fullscreenElement === el);
    const cssOn = Boolean(el?.classList.contains('is-css-chart-fullscreen'));
    /**
     * 브라우저 native FS 거부/실패 시 CSS FS가 폴백이다.
     * fullscreenchange로 native가 비어도 CSS FS를 끄면 전체화면이 바로 풀린다.
     */
    if (nativeOn || cssOn) {
      setChartFullscreen(true);
      return;
    }
    setChartFullscreen(false);
    bumpChartResize();
  }, [bumpChartResize]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, [syncFullscreen]);

  useEffect(() => {
    return () => {
      setMobileFsBodyLock(false);
    };
  }, [setMobileFsBodyLock]);

  /** 폰 잔상: 이전 세션/크래시로 leftover FS 클래스가 있으면 접기카드·버튼 클릭이 전부 막힘 */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (chartFullscreen) return;
    document.documentElement.classList.remove('merged-desk-mobile-fs', 'eagle1-chart-fs-active');
    document.body.classList.remove('merged-desk-mobile-fs', 'eagle1-chart-fs-active');
    document.body.style.top = '';
  }, [chartFullscreen]);

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
      const el = chartColRef.current;
      if (document.fullscreenElement === el) {
        void document.exitFullscreen?.();
      }
      applyChartFsClasses(false);
      if (isMobileViewport) setMobileFsBodyLock(false);
      setChartFullscreen(false);
      bumpChartResize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chartFullscreen, isMobileViewport, setMobileFsBodyLock, bumpChartResize, applyChartFsClasses]);

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
        chartColRef.current.style.minHeight = '';
      }
    };
  }, [chartFullscreen, isMobileViewport, fitMobileFsHeight]);

  /** 도구 패널 열림/닫힘 → 차트 높이 재계산 */
  useEffect(() => {
    bumpChartResize();
    const t0 = window.setTimeout(() => bumpChartResize(), 80);
    const t1 = window.setTimeout(() => bumpChartResize(), 220);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [mobileToolsOpen, mobileDiagramOpen, desktopToolsOpen, isMobileViewport, bumpChartResize]);

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
    const el = chartColRef.current;
    if (!el) return;
    const entering = !chartFullscreen;
    const mobile = isMobileLikeViewport();

    if (entering) {
      /** 먼저 CSS FS 고정 — native 실패해도 전체화면 유지 */
      applyChartFsClasses(true);
      setMobileToolsOpen(false);
      setMobileDiagramOpen(false);
      if (mobile) {
        setMobileFsBodyLock(true);
        window.setTimeout(() => fitMobileFsHeight(), 0);
      }
      setChartFullscreen(true);
      try {
        if (!document.fullscreenElement && typeof el.requestFullscreen === 'function') {
          await el.requestFullscreen();
        }
      } catch {
        /* CSS FS 유지 */
      }
      /** native 실패 후에도 CSS 클래스 재확인 */
      applyChartFsClasses(true);
      setChartFullscreen(true);
    } else {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
      } catch {
        /* ignore */
      }
      applyChartFsClasses(false);
      if (mobile) setMobileFsBodyLock(false);
      setChartFullscreen(false);
    }
    bumpChartResize();
    window.dispatchEvent(new Event('resize'));
  };

  /** 서버와 동일: 차트 슬롯 즉시 마운트 (Idle 대기로「준비 중」고착 방지) */
  const [chartMountReady, setChartMountReady] = useState(true);

  useEffect(() => {
    setChartMountReady(true);
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
  void deferredChartPack; /** 유지: React Compiler/기존 경로 호환 — 실제 작도는 chartMarketPack 즉시 사용 */
  const onMergedDeskChartCandlesChange = useCallback((next: Candle[], chartTf?: string) => {
    const tf = chartTf || timeframe;
    /** TF 전환 중 빈·짧은 배열: 같은 TF만 유지, 다른 TF 잔상은 비움 */
    if (next.length < 12) {
      setChartMarketPack((prev) => {
        if (prev.tf !== tf) return { candles: [], tf };
        if (prev.candles.length >= 12 && candlesMatchChartTimeframe(prev.candles, tf)) {
          return prev;
        }
        return { candles: next.length ? next : [], tf };
      });
      return;
    }
    if (next.length >= 8 && !candlesMatchChartTimeframe(next, tf)) {
      /** 주봉 칩에 일봉 시리즈 등 — 거부 */
      return;
    }
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

  /** 통합·분석·독수리1호 진입·심볼·TF 변경 시 전 TF 워밍(현재 TF 우선) */
  useEffect(() => {
    if (!isMergedAnalysisDeskMode(uiMode)) return;
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
   * 작도 기하: **현재 UI TF와 일치하는 마켓 캔들만** 사용 (4h와 동일하게 전 TF).
   * 이전 TF 잔존·15m fusion 폴백으로 다른 TF에 존을 얹지 않음.
   */
  const liveChartMarket = chartMarketPack.candles;
  const liveChartTf = chartMarketPack.tf;
  const marketTfReady = liveChartMarket.length >= 12 && liveChartTf === timeframe;
  const geometryTf = timeframe;

  const deskCandles = useMemo(() => {
    if (!marketTfReady) return [] as Candle[];
    return liveChartMarket;
  }, [marketTfReady, liveChartMarket]);

  /** 超级채널SMC / 요이만 — 상위 TF 캔들 (MSB 정렬 · TF별 구조) */
  useEffect(() => {
    if ((!rbSmcPoisOn && !thisMuchOn) || !blueRedChannelsOn) {
      setRbSmcHtfCandles([]);
      setRbSmcHtfTf(null);
      return;
    }
    const htf = resolveRbSmcHtfTf(timeframe);
    setRbSmcHtfTf(htf);
    if (!htf || htf === timeframe) {
      setRbSmcHtfCandles([]);
      return;
    }
    const s = loadSettings();
    const source = isBitgetVolumePackActive(uiMode, s, symbol) ? 'bitget' : 'binance';
    let cancelled = false;
    const cached = peekClientMarketCandles(symbol, htf, source, true);
    if (cached && cached.length >= 24) {
      setRbSmcHtfCandles(sanitizeChartCandlesForSeries(cached, htf));
    }
    void fetchClientMarketCandles({ symbol, timeframe: htf, source })
      .then((raw) => {
        if (cancelled) return;
        const safe = sanitizeChartCandlesForSeries(raw, htf);
        setRbSmcHtfCandles(safe.length >= 24 ? safe : []);
      })
      .catch(() => {
        if (!cancelled) setRbSmcHtfCandles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rbSmcPoisOn, thisMuchOn, blueRedChannelsOn, symbol, timeframe, uiMode]);

  /**
   * MTF 폭락구간 — 다른 TF 캔들 수집.
   * deskCandles 의존 제외(실시간 취소 방지).
   * TF별 도착 즉시 state 반영 — 폰에서 4h가 1d 대기 중 안 뜨는 문제 방지.
   */
  useEffect(() => {
    mtfDumpPersistRef.current = '';
    mtfDumpRecordedRef.current = '';
    setMtfDumpRegistry(loadMtfDumpZoneRegistry(symbol));
    setMtfDumpCandlesByTf({});
    const s = loadSettings();
    const source = isBitgetVolumePackActive(uiMode, s, symbol) ? 'bitget' : 'binance';
    let cancelled = false;
    const chartTfNorm = normalizeChartTimeframe(timeframe);
    /** 1m — 차트 캔들만 사용, 공용 HTF fetch 생략 */
    const fetchTfs = isMtfDumpChartLocalOnlyTf(chartTfNorm)
      ? []
      : [...new Set([...MTF_DUMP_HTF_ALWAYS, ...resolveMtfDumpScanTfs(timeframe)])]
          .filter((tf) => tf !== chartTfNorm)
          .sort((a, b) => {
            const aPri = (MTF_DUMP_HTF_ALWAYS as readonly string[]).includes(a) ? 0 : 1;
            const bPri = (MTF_DUMP_HTF_ALWAYS as readonly string[]).includes(b) ? 0 : 1;
            return aPri - bPri || timeframeRank(a) - timeframeRank(b);
          });
    for (const tf of MTF_DUMP_HTF_ALWAYS) {
      if (!isMtfDumpChartLocalOnlyTf(chartTfNorm) && tf !== chartTfNorm) {
        prefetchClientMarketCandles(symbol, tf, source, { skipHtfFullUpgrade: true });
      }
    }

    const minBarsForTf = (tf: string) => {
      const n = normalizeChartTimeframe(tf);
      if (n === '1w' || n === '1M' || n === '1d') return 6;
      if (n === '4h' || n === '1h') return 10;
      return 14;
    };

    const putTf = (tf: string, candles: Candle[]) => {
      if (cancelled || !candles.length) return;
      setMtfDumpCandlesByTf((prev) => {
        if (prev[tf] === candles) return prev;
        return { ...prev, [tf]: candles };
      });
    };

    void Promise.all(
      fetchTfs.map(async (tf, idx) => {
        const minBars = minBarsForTf(tf);
        const cached = peekClientMarketCandles(symbol, tf, source, true);
        if (cached && cached.length >= minBars) {
          putTf(tf, sanitizeChartCandlesForSeries(cached, tf));
        }
        /** 차트 TF 대역 보호 — 다른 TF는 조금 늦게 + recent만 */
        if (idx > 0) {
          await new Promise((r) => window.setTimeout(r, 280 + idx * 220));
          if (cancelled) return;
        }
        try {
          const raw = await fetchClientMarketCandles({
            symbol,
            timeframe: tf,
            source,
            skipHtfFullUpgrade: true,
            onUpgrade: (up) => {
              if (cancelled) return;
              const safe = sanitizeChartCandlesForSeries(up, tf);
              if (safe.length >= minBars) putTf(tf, safe);
            },
          });
          if (cancelled) return;
          const safe = sanitizeChartCandlesForSeries(raw, tf);
          if (safe.length >= minBars) putTf(tf, safe);
        } catch {
          /* skip tf */
        }
      })
    );
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, uiMode]);

  /** AI200 — 1m·3m·5m·15m MTF 캔들 (LTF 전환해도 확정 zone 유지) */
  useEffect(() => {
    if (!scalp200On) return;
    ai200PersistRef.current = '';
    setAi200Registry(loadAi200ZoneRegistry(symbol));
    setAi200CandlesByTf({});
    const s = loadSettings();
    const source = isBitgetVolumePackActive(uiMode, s, symbol) ? 'bitget' : 'binance';
    let cancelled = false;
    const chartTfNorm = normalizeChartTimeframe(timeframe);
    const fetchTfs = resolveAi200ScanTfs(timeframe).filter((tf) => tf !== chartTfNorm);

    const putTf = (tf: string, candles: Candle[]) => {
      if (cancelled || !candles.length) return;
      setAi200CandlesByTf((prev) => {
        if (prev[tf] === candles) return prev;
        return { ...prev, [tf]: candles };
      });
    };

    void Promise.all(
      fetchTfs.map(async (tf, idx) => {
        const minBars = 24;
        const cached = peekClientMarketCandles(symbol, tf, source, true);
        if (cached && cached.length >= minBars) {
          putTf(tf, sanitizeChartCandlesForSeries(cached, tf));
        }
        if (idx > 0) {
          await new Promise((r) => window.setTimeout(r, 220 + idx * 180));
          if (cancelled) return;
        }
        try {
          const raw = await fetchClientMarketCandles({
            symbol,
            timeframe: tf,
            source,
            onUpgrade: (up) => {
              if (cancelled) return;
              const safe = sanitizeChartCandlesForSeries(up, tf);
              if (safe.length >= minBars) putTf(tf, safe);
            },
          });
          if (cancelled) return;
          const safe = sanitizeChartCandlesForSeries(raw, tf);
          if (safe.length >= minBars) putTf(tf, safe);
        } catch {
          /* skip tf */
        }
      })
    );
    return () => {
      cancelled = true;
    };
  }, [scalp200On, symbol, timeframe, uiMode]);

  /** VWAP 공유 컨텍스트 — AI존 evidence · 세션/앵커 레벨 */
  const vwapMarketCtx = useMemo(() => {
    if (!avwapOn && !sessionVwapOn) return null;
    if (deskCandles.length < 8) return null;
    try {
      return buildVwapMarketContext({
        candles: deskCandles,
        chartTf: timeframe,
        autoExtreme: avwapOn && avwapAutoExtreme,
        pins: avwapOn ? avwapUserPins : [],
        pinsHidden: avwapUserHidden,
        sessionEnabled: sessionVwapOn,
      });
    } catch {
      return null;
    }
  }, [
    deskCandles,
    timeframe,
    avwapOn,
    avwapAutoExtreme,
    avwapUserPins,
    avwapUserHidden,
    sessionVwapOn,
  ]);

  /** AVWAP 피보 — 통계/합류 증거용(차트 선·면은 칩 ON일 때만) */
  const avwapFibPackLive = useMemo(() => {
    if (!avwapOn || deskCandles.length < 30) return null;
    const dual = buildMergedDeskAnchoredVwapDualPack(deskCandles, { mode: 'chart_both' });
    if (!dual) return null;
    return buildAvwapFibConfluencePack({
      candles: deskCandles,
      timeframe,
      highPack: dual.high ?? null,
      lowPack: dual.low ?? null,
    });
  }, [avwapOn, deskCandles, timeframe]);

  const avwapSuperStats = useMemo(() => {
    const base = summarizeAvwapForSuperStats(deskCandles, timeframe, avwapUserPins, {
      enabled: avwapOn,
      pinsHidden: avwapUserHidden,
    });
    const extra: string[] = [];
    if (vwapMarketCtx?.sessionLast != null) {
      extra.push(`세션${vwapMarketCtx.sessionLast.toFixed(0)}`);
    }
    if (vwapMarketCtx?.anchoredHighLast != null) {
      extra.push(`고앵커${vwapMarketCtx.anchoredHighLast.toFixed(0)}`);
    }
    if (vwapMarketCtx?.anchoredLowLast != null) {
      extra.push(`저앵커${vwapMarketCtx.anchoredLowLast.toFixed(0)}`);
    }
    if (!extra.length) return base;
    const lineKo = [base.lineKo, extra.join(' · ')].filter(Boolean).join(' · ');
    return { ...base, lineKo: lineKo ? `AVWAP ${lineKo.replace(/^AVWAP\s+/, '')}` : base.lineKo };
  }, [deskCandles, timeframe, avwapUserPins, avwapOn, avwapUserHidden, vwapMarketCtx]);

  const strikeBundle = useMemo(() => {
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

  /** 다중분석 합류 지지/저항 zone (피보 선 대신 · 근거≥3) */
  const evidenceZonesLive = useMemo(() => {
    if (!evidenceZonesOn || deskCandles.length < 48) return null;
    const dual =
      avwapOn && deskCandles.length >= 30
        ? buildMergedDeskAnchoredVwapDualPack(deskCandles, { mode: 'chart_both' })
        : null;
    return buildMergedDeskEvidenceConfluencePack({
      candles: deskCandles,
      timeframe,
      highPack: dual?.high ?? null,
      lowPack: dual?.low ?? null,
      overlays: deskPack?.overlays ?? null,
      fibPack: avwapFibPackLive,
      minEvidence: 3,
      maxSupport: 2,
      maxResist: 2,
    });
  }, [
    evidenceZonesOn,
    deskCandles,
    timeframe,
    avwapOn,
    deskPack?.overlays,
    avwapFibPackLive,
  ]);

  /** 통계×AVWAP 합류 — 차트 가격선·통계패널 */
  const avwapStatsHubLive = useMemo(() => {
    if (!avwapOn || deskCandles.length < 48) return null;
    const stats = buildMergedDeskFeatureStatsPack({
      candles: deskCandles,
      timeframe,
      symbol,
      analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
      overlays: deskPack?.overlays ?? null,
      activeTrade: deskPack?.activeTradePlan ?? null,
      candleCard: deskPack?.candleCardConfluence ?? null,
      settleBoard,
      hubVerdictKo: deskPack?.superStatsHub?.stats?.verdictKo ?? null,
    });
    if (!stats) return null;
    return buildAvwapStatsConfluenceHub({
      candles: deskCandles,
      stats,
      fibPack: avwapFibPackLive,
    });
  }, [
    avwapOn,
    deskCandles,
    timeframe,
    symbol,
    deferredAnalysisReady,
    deferredAnalysis,
    analysis,
    deskPack,
    settleBoard,
    avwapFibPackLive,
  ]);

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
  /** AI 분석 ZONE — 통합존·홀드확률·플랜 진입만 (Mirage/SMC 전체 flood 제외) */
  const [aiAnalysisZoneOn, setAiAnalysisZoneOn] = useState(
    () => loadSettings().chartMergedDeskAiAnalysisZoneEnabled !== false
  );
  const [classicZoneOn, setClassicZoneOn] = useState(
    () => loadSettings().chartMergedDeskClassicZoneEnabled === true
  );

  /** AI ZONE — Eagle1 AI존 + 실전AI(실전AI지지×N·확률) 한 번에 ON/OFF (왔다리갓다리 방지) */
  const toggleAiZone = useCallback(() => {
    const next = !aiAnalysisZoneOn;
    setAiAnalysisZoneOn(next);
    setPracticeAiOn(next);
    if (next) {
      setClassicZoneOn(false);
      setEvidenceZonesOn(false);
      setOverlayLabelsOn(true);
    }
    saveSettings({
      chartMergedDeskAiAnalysisZoneEnabled: next,
      chartMergedDeskPracticeAiPlanEnabled: next,
      chartMergedDeskClassicZoneEnabled: next ? false : loadSettings().chartMergedDeskClassicZoneEnabled,
      chartMergedDeskEvidenceZonesEnabled: next ? false : loadSettings().chartMergedDeskEvidenceZonesEnabled,
      ...(next ? { chartMergedDeskOverlayLabelsEnabled: true } : {}),
    });
    setChartDisplayTick((v) => v + 1);
  }, [aiAnalysisZoneOn]);

  const toggleClassicZone = useCallback(() => {
    const cur = loadSettings().chartMergedDeskClassicZoneEnabled === true;
    const next = !cur;
    setClassicZoneOn(next);
    saveSettings({ chartMergedDeskClassicZoneEnabled: next });
    setChartDisplayTick((v) => v + 1);
  }, []);

  const [unifiedCloudOn, setUnifiedCloudOn] = useState(
    () => loadSettings().chartMergedDeskUnifiedCloudEnabled !== false
  );
  const [zoneBattleHudOn, setZoneBattleHudOn] = useState(
    () => loadSettings().chartMergedDeskZoneBattleHudEnabled !== false
  );
  /** AI DYNAMIC MARKET ZONE — 신규 칩 (기존 zone과 독립) */
  const [aiMarketZoneOn, setAiMarketZoneOn] = useState(
    () => loadSettings().chartMergedDeskAiMarketZoneEnabled === true
  );
  /** STEP8 — /api/ai-market-zone orderflow 보강 팩 */
  const [aiMarketZoneLive, setAiMarketZoneLive] = useState<AmzEnginePack | null>(null);
  /** 전체화면 전용 — 차트 우측 AI존 카드 (일반 레이아웃 비침범) */
  const [aiMarketZoneCardOpen, setAiMarketZoneCardOpen] = useState(false);
  const pendingAmzCardRef = useRef(false);

  useEffect(() => {
    if (!aiMarketZoneOn) {
      setAiMarketZoneLive(null);
      return;
    }
    let cancelled = false;
    const q = new URLSearchParams({ symbol, timeframe });
    const run = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetch(`/api/ai-market-zone?${q.toString()}`)
        .then((r) => r.json())
        .then((j: { ok?: boolean; pack?: AmzEnginePack }) => {
          if (cancelled || !j?.ok || !j.pack) return;
          setAiMarketZoneLive(j.pack);
        })
        .catch(() => {
          /* candle-only fallback */
        });
    };
    run();
    /** STEP20 — 숨김 탭 스킵 · 폴링 60s */
    const id = window.setInterval(run, 60_000);
    const onVis = () => {
      if (!document.hidden) run();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [aiMarketZoneOn, symbol, timeframe]);
  const [priceLabelFs, setPriceLabelFs] = useState(() => {
    const n = Number(loadSettings().overlayPriceStripFontSize);
    return Number.isFinite(n) ? Math.max(8, Math.min(14, Math.round(n))) : 10;
  });
  const [zoneBattleDetailOpen, setZoneBattleDetailOpen] = useState(false);
  const [schematicOpen, setSchematicOpen] = useState<ClickableSchool | null>(null);
  const [surgeDeskOpen, setSurgeDeskOpen] = useState(false);
  const [featureStatsOpen, setFeatureStatsOpen] = useState(false);
  /** 패턴기억 · 유사구간 카드 — 칩으로 다시 열기 */
  const [patternMemoryCardOpen, setPatternMemoryCardOpen] = useState(false);
  /** 자동초단 페이퍼 — 폭락→SFP→로켓→TP1/TP2 */
  const [autoScalpPaperOn, setAutoScalpPaperOn] = useState(
    () => loadSettings().chartMergedDeskAutoScalpPaperEnabled === true
  );
  const [autoScalpCardOpen, setAutoScalpCardOpen] = useState(false);
  const [autoScalpTrade, setAutoScalpTrade] = useState<AutoScalpPaperTrade | null>(null);
  const [autoScalpStripKo, setAutoScalpStripKo] = useState('자동초단 · 대기');
  const [autoScalpDetailKo, setAutoScalpDetailKo] = useState('폭락존 터치 → SFP → 로켓 · 페이퍼만');
  const [fourStrategyCards, setFourStrategyCards] = useState<FourStrategyCardView[]>([]);
  const [fourStrategyStripKo, setFourStrategyStripKo] = useState('4전략 · 대기');
  const [virtAnalysisStripKo, setVirtAnalysisStripKo] = useState('분석스캔 · 대기');
  const autoScalpPrevRef = useRef<AutoScalpPaperTrade | null>(null);
  const autoScalpClosedStepRef = useRef<number>(0);
  const analysisVirtFiredRef = useRef<string>('');
  /** 자동매매 창 — API·레버리지·실주문 ARM */
  const [autoTradeOn, setAutoTradeOn] = useState(
    () => loadSettings().chartMergedDeskAutoTradeEnabled === true
  );
  const [autoTradePanelOpen, setAutoTradePanelOpen] = useState(false);
  const [autoTradeCfg, setAutoTradeCfg] = useState<MergedDeskAutoTradeConfig>(() =>
    readAutoTradeConfig()
  );
  const [autoTradeStatusKo, setAutoTradeStatusKo] = useState('자동매매 · 대기');
  const [virtTradeSession, setVirtTradeSession] = useState<VirtualTradeSession>(() =>
    readVirtualTradeSession()
  );
  const doksuriLiveFiredRef = useRef<string>('');
  const autoTradeLiveSizeRef = useRef<string>('');
  const [statsHudOn, setStatsHudOn] = useState(() => {
    const saved = loadSettings().chartMergedDeskStatsHudEnabled === true;
    if (typeof window !== 'undefined' && isMobileLikeViewport()) return false;
    return saved;
  });
  const [chartFvgOn, setChartFvgOn] = useState(
    () => loadSettings().chartMergedDeskChartFvgEnabled !== false
  );
  const [chartObOn, setChartObOn] = useState(
    () => loadSettings().chartMergedDeskChartObEnabled !== false
  );
  const [chartChochOn, setChartChochOn] = useState(
    () => loadSettings().chartMergedDeskChartChochEnabled !== false
  );
  const [chartBosOn, setChartBosOn] = useState(
    () => loadSettings().chartMergedDeskChartBosEnabled !== false
  );
  const [doksuri1BriefingOn, setDoksuri1BriefingOn] = useState(
    () => loadSettings().chartMergedDeskDoksuri1BriefingEnabled !== false
  );
  const [doksuri1DerivOn, setDoksuri1DerivOn] = useState(
    () => loadSettings().chartMergedDeskDoksuri1DerivEnabled !== false
  );
  const [doksuri1OrderflowOn, setDoksuri1OrderflowOn] = useState(
    () => loadSettings().chartMergedDeskDoksuri1OrderflowEnabled === true
  );
  const [newsEvents, setNewsEvents] = useState<Array<{ title: string; timeMs: number }>>([]);

  useEffect(() => {
    const open = () => setSurgeDeskOpen(true);
    window.addEventListener(OPEN_SURGE_DESK_EVENT, open);
    return () => window.removeEventListener(OPEN_SURGE_DESK_EVENT, open);
  }, []);
  const [mtfZoneBattle, setMtfZoneBattle] = useState<MtfZoneBattlePack | null>(null);
  const [mtfZoneBattleLoading, setMtfZoneBattleLoading] = useState(false);
  const deskPackGenRef = useRef(0);
  const deskEngineSigRef = useRef('');
  const mirageIntelKeyRef = useRef('');

  /** 심볼·TF 변경: 캐시 즉시 시드 + stale desk 폐기 (빈 차트·이전 TF 선 잔존 방지) */
  useEffect(() => {
    const s = loadSettings();
    const source = isBitgetVolumePackActive(uiMode, s, symbol) ? 'bitget' : 'binance';
    const cachedRaw = peekClientMarketCandles(symbol, timeframe, source, true);
    const cached =
      cachedRaw && cachedRaw.length >= 12
        ? cachedRaw.length < 8 || candlesMatchChartTimeframe(cachedRaw, timeframe)
          ? cachedRaw
          : null
        : null;
    deskEngineSigRef.current = '';
    deskPackGenRef.current += 1;
    setDeskPack(null);
    if (cached && cached.length >= 12) {
      const safe = sanitizeChartCandlesForSeries(cached, timeframe);
      const engine = mergedDesk4hReferenceCandles(safe, timeframe);
      setChartMarketPack({
        candles: engine.length >= 12 ? engine : safe.slice(-Math.min(480, safe.length)),
        tf: timeframe,
      });
    } else {
      /** 잘못된 TF 잔상 제거 — 해당 TF recent 올 때까지 빈 팩 */
      setChartMarketPack({ candles: [], tf: timeframe });
    }
    prefetchClientMarketCandles(symbol, timeframe, source);
  }, [symbol, timeframe, uiMode]);

  const liveChartPrice = (() => {
    const mkt =
      deskCandles.length > 0 ? Number(deskCandles[deskCandles.length - 1]?.close) : NaN;
    if (mkt > 0) return mkt;
    const ana = analysis?.currentPrice;
    if (typeof ana === 'number' && ana > 0) return ana;
    const strike = strikeBundle?.close;
    if (typeof strike === 'number' && strike > 0) return strike;
    return null;
  })();

  const aiZonePack = useMemo(() => {
    if (!aiAnalysisZoneOn) return null;
    /** TF 미준비 시 fusion(15m) 폴백 금지 — 다른 TF 축에 15m zone 오염 방지 */
    const zoneCandles =
      deskCandles.length >= 2
        ? deskCandles
        : marketTfReady
          ? fusionCandles ?? []
          : [];
    if (zoneCandles.length < 2) return null;
    return buildEagle1AiZonePack({
      analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
      candles: zoneCandles,
      hotZoneEntry: deskPack?.hotZoneEntry ?? null,
      deskOverlays: deskPack?.overlays ?? [],
    });
  }, [
    aiAnalysisZoneOn,
    deskCandles,
    marketTfReady,
    fusionCandles,
    deferredAnalysis,
    deferredAnalysisReady,
    analysis,
    deskPack?.hotZoneEntry,
    deskPack?.overlays,
  ]);

  const volumeAiZonePack = useMemo(() => {
    if (!advVolumeOn || deskCandles.length < 10) return null;
    try {
      return buildVolumeAiZonePack(deskCandles, timeframe);
    } catch {
      return null;
    }
  }, [advVolumeOn, deskCandles, timeframe]);

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

  /** 추가: 재매집/재분배 zone — 사이클 토글과 무관하게 통합모드에 병행 작도 */
  const reaccZonePack = useMemo(() => {
    if (deskCandles.length < 28) {
      return buildMergedDeskReaccZonePack({ candles: [], timeframe, enabled: false });
    }
    return buildMergedDeskReaccZonePack({
      candles: deskCandles,
      timeframe,
      enabled: true,
    });
  }, [deskCandles, timeframe, chartDisplayTick]);

  const mobilePanelMode: 'none' | 'tools' | 'diagram' = !isMobileViewport
    ? 'none'
    : mobileToolsOpen
      ? 'tools'
      : mobileDiagramOpen
        ? 'diagram'
        : 'none';

  /** PC·폰 공통 — 도구 칩 패널 열림 */
  const toolsPanelOpen = isMobileViewport ? mobileToolsOpen : desktopToolsOpen;

  const toggleDesktopTools = useCallback(() => {
    setDesktopToolsOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem('merged-desk-desktop-tools-open', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /** 폰: 도식·도구 상호배타 — 도구 열면 학파바 숨김(겹침·클릭 차단 방지) */
  const showCycleTopBar =
    !!cycleProgress.primary &&
    cycleProgressOn &&
    (!isMobileViewport || (mobileDiagramOpen && !mobileToolsOpen));

  const toggleMobileTools = useCallback(() => {
    setMobileToolsOpen((open) => {
      const next = !open;
      if (next) {
        setMobileDiagramOpen(false);
        setSchematicOpen(null);
      } else if (cycleProgressOn) {
        /** 도구 닫으면 도식 기능이 켜져 있을 때 학파바 복구 */
        setMobileDiagramOpen(true);
      }
      return next;
    });
  }, [cycleProgressOn]);

  const toggleMobileDiagram = useCallback(() => {
    setMobileDiagramOpen((open) => {
      const next = !open;
      if (next) {
        setMobileToolsOpen(false);
        if (!cycleProgressOn) {
          setCycleProgressOn(true);
          saveSettings({ chartMergedDeskCycleProgressEnabled: true });
          window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
        }
      } else {
        setSchematicOpen(null);
        setCycleProgressOn(false);
        saveSettings({ chartMergedDeskCycleProgressEnabled: false });
        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      }
      return next;
    });
  }, [cycleProgressOn]);

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
    /** TF 전환 직후: 이전 TF 존·채널을 새 캔들 축에 그리지 않음 (4h→15m 스파이크 방지) */
    if (!marketTfReady) {
      return {
        ...deskPack,
        overlays: [] as OverlayItem[],
        markers: [],
        priceLines: [],
        rbLiveHub: null,
        rbCorridorPaint: null,
        rbStance: null,
        mtfDumpPack: null,
        practiceAiPlan: null,
        scalp200Plan: null,
        ai200ZonePack: null,
      };
    }

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
        extra.includes('merged-desk-rb-fog-pocket') ||
        extra.includes('merged-desk-rb-fog-entry') ||
        id.startsWith('merged-desk-rb-fog-') ||
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
        const avwapDualForRb =
          deskCandles.length >= 30
            ? buildMergedDeskAnchoredVwapDualPack(deskCandles, { mode: 'chart_both' })
            : null;
        const fibLegsForRb =
          avwapFibPackLive?.legs ??
          (avwapDualForRb
            ? buildAvwapFibConfluencePack({
                candles: deskCandles,
                timeframe,
                highPack: avwapDualForRb.high ?? null,
                lowPack: avwapDualForRb.low ?? null,
              })?.legs
            : null);
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
          waveLockKey: `${symbol}:${timeframe}:rb-wave`,
          omitTradeRails: true,
          newsHint: pickNextNewsHint(newsEvents),
          vrvpPoc: deskPack.vrvp?.poc ?? null,
          vrvpVaLow: deskPack.vrvp?.vaLow ?? null,
          vrvpVaHigh: deskPack.vrvp?.vaHigh ?? null,
          tradeStyle: loadSettings().chartMergedDeskRbTradeStyle,
          avwapHigh: avwapDualForRb?.high ?? null,
          avwapLow: avwapDualForRb?.low ?? null,
          fibLegs: fibLegsForRb ?? null,
          wavePathEnabled: blueRedChannelsOn && wavePathOn,
          coreSr: deskPack.coreSr ?? null,
          dumpZones: mtfDumpRegistry ?? null,
          keyZones: deskPack.keyZones ?? null,
          criticalZones: deskPack.criticalZones ?? null,
        });
      } catch {
        rbLive = null;
      }
    }
    const isRbLiveFamily = (o: OverlayItem) => {
      const id = String(o.id || '');
      const extra = String(o.overlayZoneExtraClass || '');
      return (
        id.startsWith('merged-desk-rb-') ||
        id.startsWith('merged-desk-wave-path') ||
        extra.includes('merged-desk-rb-channel') ||
        extra.includes('merged-desk-blue-red-channel') ||
        extra.includes('merged-desk-rb-wave-') ||
        extra.includes('merged-desk-wave-path')
      );
    };
    /**
     * 라이브 MoneyEdge(파동LOCK·합류게이트·구조작도)가 있으면 그걸 우선.
     * 예전처럼 엔진 fromPackRb 면만 남기면 LOCK/FREEZE 라벨·가격선이 안 보임.
     */
    const liveRb =
      blueRedChannelsOn && (rbLive?.overlays?.length ?? 0) > 0
        ? [
            ...fromPackRb.filter((o) => !isRbLiveFamily(o)),
            ...(rbLive?.overlays ?? []),
          ]
        : fromPackRb;
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
            avwapHigh: null,
            avwapLow: null,
            fibLegs: avwapFibPackLive?.legs ?? null,
            vrvpPoc: deskPack.vrvp?.poc ?? null,
            vrvpVaLow: deskPack.vrvp?.vaLow ?? null,
            vrvpVaHigh: deskPack.vrvp?.vaHigh ?? null,
            wavePhase: rbLive.waveLock?.phase ?? null,
            edgeGate: rbLive.edgeGate ?? null,
          })
        : null;
    const liveActiveTradeBase = blueRedChannelsOn
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
          candleCardConfluence: deskPack.candleCardConfluence ?? null,
        })
      : deskPack.activeTradePlan;
    /** 채널·Hot 등과 Hub 타점 단일화 — 잠금 전 1세트만 */
    const liveActiveTradeRaw = deskPack.superStatsHub
      ? applySuperStatsHubToActiveTrade(liveActiveTradeBase, deskPack.superStatsHub)
      : liveActiveTradeBase;
    /** 실전: TOUCH/ENTER 결정 후 E/SL/TP 잠금 — 성공(TP1)·실패(SL/무효) 시에만 해제 */
    const liveActiveTrade = applyMergedDeskFrozenTradePlan({
      live: liveActiveTradeRaw,
      symbol,
      timeframe,
      close: liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? 0,
      lastCandle: deskCandles[deskCandles.length - 1] ?? null,
    });
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
      deskCandles.length >= 8
        ? buildMergedDeskAdvVolumePack(deskCandles, {
            timeframe,
            swingAnchorOn: loadSettings().chartMergedDeskSwingAnchorVolumeEnabled !== false,
            spotPx: liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? null,
          })
        : null;
    const aiMarketZonePack =
      aiMarketZoneOn && aiMarketZoneLive
        ? aiMarketZoneLive
        : aiMarketZoneOn && deskCandles.length >= 40
          ? buildAiMarketZonePack({
              candles: deskCandles,
              timeframe,
              symbol,
              vwapLevels: vwapMarketCtx?.levels?.map((l) => ({
                price: l.price,
                labelKo: l.labelKo,
                strength: l.strength,
              })),
            })
          : null;
    const aiMarketZoneOverlays = aiMarketZonePack?.overlays ?? [];
    const aiMarketZonePriceLines = aiMarketZonePack?.priceLines ?? [];
    /** AVWAP → zone 면 + 동일색 피보·골든·헌팅열림 + 통계AI 가격선 */
    const avwapDualForGuide =
      avwapOn && deskCandles.length >= 30
        ? buildMergedDeskAnchoredVwapDualPack(deskCandles, { mode: 'chart_both' })
        : null;
    const avwapEntryGuide =
      avwapOn && avwapAutoExtreme && deskCandles.length >= 16
        ? buildAvwapEntryGuidePack({
            candles: deskCandles,
            highPack: avwapDualForGuide?.high ?? null,
            analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
            hotZone: deskPack.hotZoneEntry ?? null,
          })
        : null;
    const avwapFibPack = avwapFibOn ? avwapFibPackLive : null;
    const practiceAiPlan =
      practiceAiOn && aiAnalysisZoneOn && deskCandles.length >= 24
        ? buildMergedDeskPracticeAiPlan({
            candles: deskCandles,
            evidence: evidenceZonesLive,
            activeTrade: liveActiveTrade,
            avwapHub: avwapStatsHubLive,
            candleCard: deskPack.candleCardConfluence ?? null,
            superStatsHub: deskPack.superStatsHub ?? null,
          })
        : null;
    const ai200ZonePack =
      scalp200On && deskCandles.length >= 24
        ? buildMergedDeskAi200ZonePack({
            symbol,
            chartCandles: deskCandles,
            chartTf: timeframe,
            candlesByTf: {
              ...ai200CandlesByTf,
              [normalizeChartTimeframe(timeframe)]: deskCandles,
            },
            registryZones: ai200Registry,
            activeTrade: liveActiveTrade,
            practiceAi: practiceAiPlan,
            master: deskPack.masterFutures ?? null,
            hotZone: deskPack.hotZoneEntry ?? null,
            newsHint: pickNextNewsHint(newsEvents),
            mtfAligned: deskPack.deskHud?.mtfAligned ?? null,
            mtfAlignmentScore:
              (deferredAnalysisReady ? deferredAnalysis : analysis)?.mtf?.alignmentScore ?? null,
            spotPx: liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? null,
            scanTfs: resolveAi200ScanTfs(timeframe),
            dumpZones: mtfDumpRegistry,
          })
        : null;
    const scalp200Plan = ai200ZonePack?.chartPlan ?? null;
    const chipConfForMtfDump = rbLive?.chipConfluence ?? null;
    const openPinForMtfDump = schematicOpen ? cycleProgress.schematics[schematicOpen] ?? null : null;
    const schematicPinForMtfDump =
      (openPinForMtfDump && chipConfForMtfDump?.rankBySchool[schematicOpen!] != null
        ? openPinForMtfDump
        : null) ||
      chipConfForMtfDump?.topPin ||
      openPinForMtfDump ||
      cycleProgress.schematics.wyckoff ||
      cycleProgress.schematics.elliott ||
      null;
    const schematicDumpHint =
      blueRedChannelsOn &&
      mtfDumpOn &&
      schematicPinForMtfDump &&
      Number.isFinite(schematicPinForMtfDump.dumpTo) &&
      Number(schematicPinForMtfDump.dumpTo) > 0
        ? {
            sourceTf: timeframe,
            dumpPx: Number(schematicPinForMtfDump.dumpTo),
          }
        : null;
    const mtfDumpPackRaw = (() => {
      if (!mtfDumpOn) return null;
      const minDesk = normalizeChartTimeframe(timeframe) === '1d' || normalizeChartTimeframe(timeframe) === '1w' ? 12 : 24;
      if (deskCandles.length < minDesk) return null;
      try {
        return buildMergedDeskMtfDumpZonePack({
          chartCandles: deskCandles,
          chartTf: timeframe,
          candlesByTf: {
            ...mtfDumpCandlesByTf,
            [normalizeChartTimeframe(timeframe)]: deskCandles,
          },
          approachSourceTf: null,
          schematicDumpHint,
          registryZones: mtfDumpRegistry,
          hotZones: deskPack.hotZoneEntry?.all ?? null,
          whaleBeamIntel: deskWhaleBeamIntel,
          displayMode: 'mtf',
        });
      } catch (e) {
        console.warn('[mtf-dump] pack failed', e);
        return null;
      }
    })();
    const tradeFxFull = computeTradeVisualFxState({
      price: liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? 0,
      lastCandle: deskCandles[deskCandles.length - 1] ?? null,
      plan: liveActiveTrade,
      practiceAi: practiceAiPlan,
      dumpZones: mtfDumpPackRaw?.zones ?? [],
      approachRatio: 0.0045,
    });
    const mtfDumpPack =
      mtfDumpPackRaw && tradeFxFull.approachDumpTf
        ? {
            ...mtfDumpPackRaw,
            overlays: mtfDumpPackRaw.overlays.map((o) => {
              if (!String(o.id || '').includes(`-${tradeFxFull.approachDumpTf}`)) return o;
              const base = String(o.zoneFaceBase || o.label || '').replace(/\s*·\s*접근중/g, '');
              const sig = String(o.zoneFaceSignal || '');
              const sigNext = /접근중/.test(sig) ? sig : [sig, '접근중'].filter(Boolean).join(' · ');
              return {
                ...o,
                label: `${base} · 접근중`,
                zoneFaceBase: `${base} · 접근중`,
                zoneFaceSignal: sigNext,
                overlayZoneExtraClass: `${String(o.overlayZoneExtraClass || '')} merged-desk-mtf-dump-approach`.trim(),
              };
            }),
          }
        : mtfDumpPackRaw;
    const labelPolicy = {
      showInvalid: tradeShowInvLabel,
      showTp2: tradeShowTp23,
      showTp3: tradeShowTp23,
      approachPulse: tradeApproachPulse,
      tpCelebrate: tradeTpCelebrate,
    };
    const baseTradePriceLines =
      scalp200On && ai200ZonePack?.priceLines?.length
        ? ai200ZonePack.priceLines
        : practiceAiOn && practiceAiPlan
          ? practiceAiPlan.priceLines
          : buildMergedDeskActiveTradePriceLines(liveActiveTrade);
    const tradePlanPriceLines = decorateTradePriceLinesFx(
      baseTradePriceLines,
      tradeFxFull,
      labelPolicy
    );
    const mtfDumpPriceLines = mtfDumpPack?.priceLines ?? [];
    const tpCelebrateOverlays = tradeTpCelebrate
      ? buildTpCelebrateOverlays({
          candles: deskCandles,
          fx: tradeFxFull,
          plan: liveActiveTrade,
          practiceAi: practiceAiPlan,
        })
      : [];
    const avwapEntryGuideOverlays = [
      ...(avwapEntryGuide?.overlays ?? []),
      ...(avwapFibPack?.overlays ?? []),
      ...(practiceAiOn && aiAnalysisZoneOn ? [] : (evidenceZonesLive?.overlays ?? [])),
      ...(practiceAiOn && aiAnalysisZoneOn && !scalp200On ? (practiceAiPlan?.overlays ?? []) : []),
      ...(scalp200On ? (ai200ZonePack?.overlays ?? []) : []),
      ...(mtfDumpPack?.overlays ?? []),
      ...tpCelebrateOverlays,
    ];
    const avwapEntryGuidePriceLines = [
      ...(avwapEntryGuide?.priceLines ?? []),
      ...(avwapFibPack?.priceLines ?? []),
      ...(practiceAiOn && aiAnalysisZoneOn ? [] : (evidenceZonesLive?.priceLines ?? [])),
      ...(avwapStatsHubLive?.priceLines ?? []),
      ...tradePlanPriceLines,
      ...mtfDumpPriceLines,
    ];
    /** 기관ST — compact LH★/SH◆ 캔들 마커(공용). zone 면은 MERGED_DESK_ST_TOUCH_AS_ZONES 일 때만 */
    const stBandTouchZones =
      MERGED_DESK_ST_TOUCH_AS_ZONES &&
      institutionalBandOn &&
      deskCandles.length >= 8
        ? buildMergedDeskInstitutionalBandZones({
            candles: deskCandles,
            timeframe,
            analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
            maxZones: 4,
          })
        : [];
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
    const rbSchematicLayersRaw =
      blueRedChannelsOn && schematicPin
        ? buildMergedDeskRbSchematicChartDraw({
            candles: deskCandles,
            timeframe,
            geoms: rbLive?.geoms ?? [],
            wyckoff: cycleProgress.wyckoff,
            elliott: cycleProgress.elliott,
            pin: schematicPin,
            chip: chipConf,
            showPath: wavePathOn ? false : rbEnterOk,
          }).overlays
        : [];
    /** MTF 폭락 ON — 도식 폭락은 공용 MTF 풀(터치봉 분석)로, RB 중복 면 제거 */
    const rbSchematicLayers =
      mtfDumpOn && schematicDumpHint
        ? rbSchematicLayersRaw.filter((o) => !String(o.id || '').includes('schematic-dump-zone'))
        : rbSchematicLayersRaw;
    const rbSmcPackRaw =
      blueRedChannelsOn &&
      (rbSmcPoisOn || thisMuchOn) &&
      (rbLive?.geoms?.length ?? 0) >= 1 &&
      deskCandles.length >= 24
        ? buildMergedDeskRbSmcPoisPack({
            candles: deskCandles,
            timeframe,
            geoms: rbLive!.geoms,
            htfCandles: rbSmcHtfCandles.length >= 24 ? rbSmcHtfCandles : null,
            htfTf: rbSmcHtfTf,
            enabled: true,
          })
        : null;
    const rbSmcPack = rbSmcPoisOn ? rbSmcPackRaw : null;
    /** 요이만 ON이면 터치·측정은 세트존이 담당 — SMC OB/BB/MB·measure 중복 면 제거(MSB는 유지) */
    const rbSmcLayers = (rbSmcPack?.overlays ?? []).filter((o) => {
      if (!thisMuchOn) return true;
      const id = String(o?.id || '').toLowerCase();
      if (id.includes('rb-smc-measure')) return false;
      if (/merged-desk-rb-smc-(ob|bb|mb)-/.test(id)) return false;
      return true;
    });
    const rbSmcPriceLines = thisMuchOn
      ? (rbSmcPack?.priceLines ?? []).filter((pl) => !/목표선|터치|MB|OB|BB/.test(String(pl.title || '')))
      : rbSmcPack?.priceLines ?? [];
    const thisMuchEntry =
      rbSmcPackRaw?.pois?.find((p) => p.kind === 'OB' || p.kind === 'BB' || p.kind === 'MB') ?? null;
    const thisMuchPack =
      thisMuchOn && deskCandles.length >= THIS_MUCH_LOOKBACK
        ? buildMergedDeskThisMuchMeasurePack({
            candles: deskCandles,
            timeframe,
            geoms: rbLive?.geoms ?? [],
            money: rbSmcPackRaw?.money ?? null,
            entry: thisMuchEntry,
            lookback: THIS_MUCH_LOOKBACK,
            enabled: true,
          })
        : null;
    const thisMuchLayers = thisMuchPack?.overlays ?? [];
    const thisMuchPriceLines = thisMuchPack?.priceLines ?? [];

    /** 눌림·레일·라이브허브·rbKit — blueRedChannelLayers보다 먼저 (TDZ 방지) */
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
    const rbKit =
      blueRedChannelsOn
        ? buildMergedDeskRbCompleteKit({
            geoms: bounceGeoms.length ? bounceGeoms : rbLive?.geoms ?? [],
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
            wavePhase: rbLive?.waveLock?.phase ?? null,
            edgeGate: rbLive?.edgeGate ?? null,
            waveBandCaptionKo: rbLive?.waveStructure?.bandCaptionKo ?? null,
            candles: deskCandles,
            liveActionKo: rbLiveHub?.actionKo ?? null,
          })
        : null;

    /** LuxAlgo Parallel Pivot Lines — 파랑빨강 ON 또는 BNB.
     * 평행채널엔진 ON이면 부채꼴 다중선과 겹치므로 숨김(엔진 상·하 1쌍만). */
    const isBnbChart = String(symbol || '')
      .toUpperCase()
      .startsWith('BNB');
    const parallelPivotLayers =
      !parallelChannelEngineOn &&
      deskCandles.length >= 64 &&
      (blueRedChannelsOn || isBnbChart)
        ? isBnbChart
          ? buildBnbParallelPivotOverlays(deskCandles)
          : buildParallelPivotLines(deskCandles).overlays
        : [];

    const blueRedChannelLayers = blueRedChannelsOn
      ? [
          ...stampRbOverlaysWithWaveAutoLabels(
            stampMergedDeskRbFeatureKitLabels(
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
            rbLive?.waveStructure ?? null
          ),
          ...parallelPivotLayers,
          ...rbSchematicLayers,
          ...rbSmcLayers,
          ...thisMuchLayers,
        ]
      : isBnbChart
        ? [...parallelPivotLayers, ...thisMuchLayers]
        : [...thisMuchLayers];
    const parallelChannelEngineLayers =
      parallelChannelEngineOn && deskCandles.length >= 40
        ? buildParallelChannelEngine(deskCandles, {
            lockKey: `${symbol}|${timeframe}|pce`,
          }).overlays
        : [];
    const rbCorePriceLines = blueRedChannelsOn
      ? stampRbPriceLinesWithFullConfluence(
          [
            ...(rbLive?.coreSrCluster?.priceLines ?? []),
            ...(rbLive?.priceLines ?? []),
            ...rbSmcPriceLines,
            ...thisMuchPriceLines,
          ],
          rbFullConf
        )
      : [...thisMuchPriceLines];
    const rbCoreMarkers = blueRedChannelsOn ? (rbLive?.markers ?? []) : [];

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
      let next = filterMergedDeskEngineZoneClutter(list, {
        aiZoneMode: aiAnalysisZoneOn,
        classicZoneOn,
      });
      next = polishMergedDeskChartOverlays(
        next,
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
      /** 파랑빨강 반등 zone — 라벨 keep 강제 금지(통계 핵심 게이트가 1개만 승격) */
      if (railBounceLayers.length) {
        const liveBounce = railBounceLayers.map((o) => {
          const extra = String(o.overlayZoneExtraClass || '')
            .replace(/\bmerged-desk-zone-face-minimal\b/g, '')
            .replace(/\bmerged-desk-zone-face-hidden\b/g, '')
            .replace(/\bmerged-desk-zone-pro-soft\b/g, '')
            .replace(/\bmerged-desk-rb-core-face-off\b/g, '')
            .replace(/\bmerged-desk-money-zone-keep\b/g, '')
            .replace(/\bmerged-desk-zone-pro-hero\b/g, '')
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
      /** ★약/중/강/초강 스택 → 롱·숏 각 최강 1면 */
      next = applyMergedDeskStrongestAnalysisZone(next);
      /** 통계 합류 — $$$$초강·Hot·레일 경쟁 → 핵심 롱1·숏1만 */
      next = applyMergedDeskCoreStatsZoneGate(next, {
        close: liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? null,
        candles: deskCandles.length >= 8 ? deskCandles : undefined,
        activeEntry:
          liveActiveTrade && liveActiveTrade.entry > 0 ? liveActiveTrade.entry : null,
        bestSupportPx:
          liveActiveTrade?.direction === 'LONG' && liveActiveTrade.entry > 0
            ? liveActiveTrade.entry
            : liveActiveTrade?.direction === 'LONG' && liveActiveTrade.stopLoss > 0
              ? liveActiveTrade.stopLoss
              : null,
        bestResistPx:
          liveActiveTrade?.direction === 'SHORT' && liveActiveTrade.entry > 0
            ? liveActiveTrade.entry
            : liveActiveTrade?.direction === 'SHORT' && liveActiveTrade.stopLoss > 0
              ? liveActiveTrade.stopLoss
              : null,
        minScore: 58,
      });
      next = dedupe([...next, ...newsDraw.overlays]);
      /** 재매집/재분배 — finalize 후에도 강제 유지(정리 파이프에 삼키지 않음) */
      if (reaccZonePack.overlays.length) {
        const have = new Set(next.map((o) => String(o.id || '')));
        const miss = reaccZonePack.overlays.filter((o) => !have.has(String(o.id || '')));
        if (miss.length) next = dedupe([...next, ...miss]);
      }
      return dedupe(next);
    };
    const pullbackPriceLines =
      pullbackLinesOn && pullbackLayers.length ? (pullbackPack?.priceLines ?? []) : [];
    const railBouncePriceLines = railBounceLayers.length ? (railBouncePack?.priceLines ?? []) : [];
    const autoScalpPriceLines =
      (autoScalpPaperOn || (autoTradeOn && autoTradeCfg.strategyScalp)) &&
      autoScalpTrade &&
      (autoScalpTrade.phase === 'OPEN' ||
        autoScalpTrade.phase === 'TP1_HIT' ||
        autoScalpTrade.phase === 'BE') &&
      autoScalpTrade.entry != null
        ? [
            {
              price: autoScalpTrade.entry,
              title: `초단E ${autoScalpTrade.direction}`,
              color: autoScalpTrade.direction === 'LONG' ? '#34d399' : '#f87171',
              lineWidth: 1,
              lineStyle: 'solid' as const,
              axisLabel: true,
            },
            ...(autoScalpTrade.activeSl != null
              ? [
                  {
                    price: autoScalpTrade.activeSl,
                    title: autoScalpTrade.phase === 'BE' || autoScalpTrade.phase === 'TP1_HIT' ? '초단BE' : '초단SL',
                    color: '#f87171',
                    lineWidth: 1,
                    lineStyle: 'dashed' as const,
                    axisLabel: true,
                  },
                ]
              : []),
            ...(autoScalpTrade.phase === 'OPEN' && autoScalpTrade.tp1 != null
              ? [
                  {
                    price: autoScalpTrade.tp1,
                    title: '초단TP1',
                    color: '#38bdf8',
                    lineWidth: 1,
                    lineStyle: 'solid' as const,
                    axisLabel: true,
                  },
                ]
              : []),
            ...(autoScalpTrade.tp2 != null
              ? [
                  {
                    price: autoScalpTrade.tp2,
                    title: '초단TP2',
                    color: '#a78bfa',
                    lineWidth: 1,
                    lineStyle: 'solid' as const,
                    axisLabel: true,
                  },
                ]
              : []),
          ]
        : [];
    const virtPos = virtTradeSession.position;
    const virtualMtfPriceLines =
      virtTradeSession.active && virtPos && virtPos.entry > 0
        ? [
            {
              price: virtPos.entry,
              title: `가상E ${virtPos.direction}`,
              color: virtPos.direction === 'LONG' ? '#22d3ee' : '#fb7185',
              lineWidth: 1,
              lineStyle: 'solid' as const,
              axisLabel: true,
            },
            ...(virtPos.sl != null && virtPos.sl > 0
              ? [
                  {
                    price: virtPos.sl,
                    title: '가상SL',
                    color: '#f87171',
                    lineWidth: 1,
                    lineStyle: 'dashed' as const,
                    axisLabel: true,
                  },
                ]
              : []),
            ...(virtPos.tp != null && virtPos.tp > 0 && !virtPos.tp1Done
              ? [
                  {
                    price: virtPos.tp,
                    title: `가상TP1 ${(VIRTUAL_TP1_FRAC * 100).toFixed(0)}%`,
                    color: '#34d399',
                    lineWidth: 1,
                    lineStyle: 'solid' as const,
                    axisLabel: true,
                  },
                ]
              : []),
            ...(virtPos.tp1Done &&
            virtPos.runnerTp != null &&
            virtPos.runnerTp > 0
              ? [
                  {
                    price: virtPos.runnerTp,
                    title: '가상러너',
                    color: '#a78bfa',
                    lineWidth: 1,
                    lineStyle: 'dashed' as const,
                    axisLabel: true,
                  },
                ]
              : []),
          ]
        : virtTradeSession.active && virtTradeSession.reentryWatch
          ? [
              {
                price: virtTradeSession.reentryWatch.exitPrice,
                title: `재진입감시 ${virtTradeSession.reentryWatch.direction}`,
                color: '#fbbf24',
                lineWidth: 1,
                lineStyle: 'dashed' as const,
                axisLabel: true,
              },
            ]
          : [];
    const withMoneyAxisLines = (list: OverlayItem[]) => {
      const eagle1FakeBreakOv =
        wrapEagle1Hud || shareMergedServerChart
          ? buildEagle1FakeBreakChartOverlay({
              falseBreak: (deferredAnalysisReady ? deferredAnalysis : analysis)?.eagle1FalseBreak ?? null,
              structureEvents:
                (deferredAnalysisReady ? deferredAnalysis : analysis)?.eagle1Structure?.events ?? null,
              candles: deskCandles.length ? deskCandles : fusionCandles,
            })
          : null;
      const aiPack =
        aiAnalysisZoneOn
          ? aiZonePack ??
            buildEagle1AiZonePack({
              analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
              candles: deskCandles.length >= 2 ? deskCandles : fusionCandles ?? [],
              hotZoneEntry: deskPack.hotZoneEntry ?? null,
              deskOverlays: deskPack.overlays ?? [],
            })
          : null;
      const eagle1ZoneOvs =
        aiPack
          ? buildEagle1ChartZoneOverlays({
              analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
              candles: deskCandles.length >= 2 ? deskCandles : fusionCandles ?? [],
              enabled: true,
              aiOnly: true,
              aiZonePack: aiPack,
              hotZoneEntry: deskPack.hotZoneEntry ?? null,
            })
          : [];
      const aiPriceLines = aiPack ? buildEagle1AiZonePriceLines(aiPack) : [];
      const classicList = classicZoneOn ? list : filterClassicDeskZoneOverlays(list);
      const aiIds = new Set(eagle1ZoneOvs.map((o) => String(o.id || '')));
      const classicWithoutAiDup = classicList.filter((o) => {
        if (aiIds.size === 0) return true;
        const id = String(o.id || '');
        const label = String(o.zoneFaceBase || o.label || '');
        if (id.startsWith('eagle1-ai-zone--')) return false;
        if (aiAnalysisZoneOn && /★|초강력|강력반응|약반응|강력하락/.test(label)) {
          const p1 = Number(o.price1 ?? (o as { priceFrozen1?: number }).priceFrozen1);
          const p2 = Number(o.price2 ?? (o as { priceFrozen2?: number }).priceFrozen2);
          if (!Number.isFinite(p1) || !Number.isFinite(p2)) return true;
          const lo = Math.min(p1, p2);
          const hi = Math.max(p1, p2);
          for (const az of eagle1ZoneOvs) {
            const a1 = Number(az.price1 ?? (az as { priceFrozen1?: number }).priceFrozen1);
            const a2 = Number(az.price2 ?? (az as { priceFrozen2?: number }).priceFrozen2);
            if (!Number.isFinite(a1) || !Number.isFinite(a2)) continue;
            const overlap =
              Math.max(lo, Math.min(a1, a2)) <= Math.min(hi, Math.max(a1, a2));
            if (overlap) return false;
          }
        }
        return true;
      });
      return {
      ...deskPack,
      overlays: [
        ...(rbLive?.coreSrCluster?.overlays ?? []),
        ...eagle1ZoneOvs,
        ...aiMarketZoneOverlays,
        ...avwapEntryGuideOverlays,
        ...stBandTouchZones,
        ...classicWithoutAiDup,
        ...(practiceOv && isMergedDeskRequestedVisibleZone(practiceOv) ? [practiceOv] : []),
        ...rocketRange.overlays.filter((o) => isMergedDeskRequestedVisibleZone(o)),
        ...(eagle1FakeBreakOv ? [eagle1FakeBreakOv] : []),
      ],
      markers: [...(deskPack.markers ?? []), ...rbCoreMarkers, ...newsDraw.markers],
      activeTradePlan: liveActiveTrade,
      unifiedTradePlan:
        liveActiveTrade.direction !== 'NEUTRAL' && liveActiveTrade.entry > 0
          ? liveActiveTrade.asUnifiedPlan
          : deskPack.unifiedTradePlan,
      livePracticeCue,
      rbLiveHub,
      cardPanel: {
        ...deskPack.cardPanel,
        direction:
          liveActiveTrade.direction !== 'NEUTRAL'
            ? liveActiveTrade.direction
            : deskPack.cardPanel.direction,
        entry: liveActiveTrade.entry > 0 ? liveActiveTrade.entry : deskPack.cardPanel.entry,
        stopLoss:
          liveActiveTrade.stopLoss > 0 ? liveActiveTrade.stopLoss : deskPack.cardPanel.stopLoss,
        tp1: liveActiveTrade.tp1 > 0 ? liveActiveTrade.tp1 : deskPack.cardPanel.tp1,
        tp2: liveActiveTrade.tp2 > 0 ? liveActiveTrade.tp2 : deskPack.cardPanel.tp2,
        tp3: liveActiveTrade.tp3 > 0 ? liveActiveTrade.tp3 : deskPack.cardPanel.tp3,
        invalidationKo: liveActiveTrade.invalidationKo || deskPack.cardPanel.invalidationKo,
      },
      meta: {
        ...deskPack.meta,
        strategy: {
          ...(deskPack.meta?.strategy ?? {}),
          direction:
            liveActiveTrade.direction !== 'NEUTRAL'
              ? liveActiveTrade.direction
              : deskPack.meta?.strategy?.direction,
          entry: liveActiveTrade.entry > 0 ? liveActiveTrade.entry : deskPack.meta?.strategy?.entry,
          stopLoss:
            liveActiveTrade.stopLoss > 0 ? liveActiveTrade.stopLoss : deskPack.meta?.strategy?.stopLoss,
          tp1: liveActiveTrade.tp1 > 0 ? liveActiveTrade.tp1 : deskPack.meta?.strategy?.tp1,
          tp2: liveActiveTrade.tp2 > 0 ? liveActiveTrade.tp2 : deskPack.meta?.strategy?.tp2,
          tp3: liveActiveTrade.tp3 > 0 ? liveActiveTrade.tp3 : deskPack.meta?.strategy?.tp3,
        },
      },
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
            practiceAiPlanKo: practiceAiPlan?.summaryKo ?? null,
            scalp200PlanKo: scalp200Plan?.summaryKo ?? null,
            mtfDumpKo: mtfDumpPack?.summaryKo ?? null,
          }
        : deskPack.deskHud,
      practiceAiPlan: practiceAiPlan ?? null,
      scalp200Plan: scalp200Plan ?? null,
      ai200ZonePack: ai200ZonePack ?? null,
      mtfDumpPack: mtfDumpPack ?? null,
      rbCorridorPaint: rbLive?.corridorPaint ?? null,
      rbStance: rbLive?.stance ?? null,
      priceLines: dedupeMergedDeskAxisPriceLines([
        ...aiPriceLines,
        ...aiMarketZonePriceLines,
        ...avwapEntryGuidePriceLines,
        ...pullbackPriceLines,
        ...railBouncePriceLines,
        ...autoScalpPriceLines,
        ...virtualMtfPriceLines,
        ...rbCorePriceLines.filter((pl) => !isMergedDeskTradeRailPriceLine(pl)),
        ...buildMergedDeskMoneyZoneAxisLines(list),
        ...(deskPack.priceLines ?? []).filter((pl) => !isMergedDeskTradeRailPriceLine(pl)),
        ...cycleProgress.priceLines,
        ...(reaccZonePack.priceLines ?? []),
        ...rocketRange.priceLines,
        ...buildMergedDeskDerivativesPriceLines(
          deferredAnalysisReady ? deferredAnalysis : analysis,
          deskCandles
        ),
      ]),
    };
    };

    /** AI ZONE v2 early return은 useMemo 상단(aiAnalysisZoneOn)에서 처리 */

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
          id.startsWith('merged-desk-reacc-') ||
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
          String(o.overlayZoneExtraClass || '').includes('merged-desk-adv-') ||
          String(o.overlayZoneExtraClass || '').includes('merged-desk-reacc')
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
        ...(reaccZonePack.overlays ?? []),
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
      overlays = filterOverlaysByChartFeatureChips(overlays, {
        fvg: chartFvgOn,
        ob: chartObOn,
        choch: chartChochOn,
        bos: chartBosOn,
      });
      /** finalize(스탬프) 이후 · 팩 구조 유지한 채 overlays만 SR% 재부착 */
      const packSmc = withMoneyAxisLines(finalizeCoreMoneyZones(overlays));
      return {
        ...packSmc,
        overlays: enrichZoneOverlaysWithSrProb(deskCandles, packSmc.overlays ?? []),
      };
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
    if (reaccZonePack.overlays.length) {
      /** 사이클 와이코프와 중복 id 없을 때만 — reacc는 별도 id */
      overlays = [...overlays, ...reaccZonePack.overlays];
    }
    if (cloudLayers.length) {
      overlays = [...cloudLayers, ...overlays];
    }
    /** ST 구름은 isCloudOverlay에서 빠지므로 여기서 다시 합침 */
    overlays = dedupe([
      ...blueRedChannelLayers,
      ...parallelChannelEngineLayers,
      ...pullbackLayers,
      ...railBounceLayers,
      ...overlays,
    ]);
    overlays = filterOverlaysByChartFeatureChips(overlays, {
      fvg: chartFvgOn,
      ob: chartObOn,
      choch: chartChochOn,
      bos: chartBosOn,
    });
    /** finalize(스탬프) 이후 · 팩 구조 유지한 채 overlays만 SR% 재부착 */
    const packOut = withMoneyAxisLines(finalizeCoreMoneyZones(overlays));
    return {
      ...packOut,
      overlays: enrichZoneOverlaysWithSrProb(deskCandles, packOut.overlays ?? []),
    };
  }, [
    deskPack,
    deskCandles,
    superAiOn,
    aiAnalysisZoneOn,
    classicZoneOn,
    aiZonePack,
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
    parallelChannelEngineOn,
    wavePathOn,
    rbSmcPoisOn,
    chartFvgOn,
    chartObOn,
    chartChochOn,
    chartBosOn,
    thisMuchOn,
    rbSmcHtfCandles,
    rbSmcHtfTf,
    livePracticeOn,
    advVolumeOn,
    aiMarketZoneOn,
    aiMarketZoneLive,
    vwapMarketCtx,
    avwapOn,
    avwapAutoExtreme,
    avwapFibPackLive,
    avwapFibOn,
    evidenceZonesLive,
    avwapStatsHubLive,
    practiceAiOn,
    scalp200On,
    autoScalpPaperOn,
    autoTradeOn,
    autoTradeCfg.strategyScalp,
    autoScalpTrade,
    virtTradeSession,
    ai200Registry,
    ai200CandlesByTf,
    mtfDumpOn,
    mtfDumpDisplayMode,
    mtfDumpCandlesByTf,
    mtfDumpRegistry,
    deskWhaleBeamIntel,
    tradeShowInvLabel,
    tradeShowTp23,
    tradeApproachPulse,
    tradeTpCelebrate,
    institutionalBandOn,
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
    reaccZonePack.overlays,
    reaccZonePack.priceLines,
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
    wrapEagle1Hud,
    shareMergedServerChart,
    fusionCandles,
    marketTfReady,
  ]);

  /** AI ZONE·HUD 실전 E/SL/TP — 超强统计/마스터와 동일 1세트만 (반대 타점 금지) */
  const canonicalTradeRaw = useMemo(
    () =>
      buildEagle1CanonicalTradeDisplay({
        analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
        master: deskPackForChart?.masterFutures ?? deskPack?.masterFutures ?? null,
        activeTrade: deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan ?? null,
        judgment: deskPackForChart?.tradeJudgment ?? deskPack?.tradeJudgment ?? null,
        tradePlan: deskPackForChart?.unifiedTradePlan ?? deskPack?.unifiedTradePlan ?? null,
        hub: deskPackForChart?.superStatsHub ?? deskPack?.superStatsHub ?? null,
        confluenceHint:
          deskPackForChart?.deskHud?.vrvpConfluenceKo ??
          deskPack?.deskHud?.vrvpConfluenceKo ??
          deskPackForChart?.deskHud?.hotZoneEntryKo ??
          deskPack?.deskHud?.hotZoneEntryKo ??
          null,
      }),
    [
      deferredAnalysisReady,
      deferredAnalysis,
      analysis,
      deskPackForChart?.masterFutures,
      deskPackForChart?.activeTradePlan,
      deskPackForChart?.tradeJudgment,
      deskPackForChart?.unifiedTradePlan,
      deskPackForChart?.superStatsHub,
      deskPackForChart?.deskHud?.vrvpConfluenceKo,
      deskPackForChart?.deskHud?.hotZoneEntryKo,
      deskPack?.masterFutures,
      deskPack?.activeTradePlan,
      deskPack?.tradeJudgment,
      deskPack?.unifiedTradePlan,
      deskPack?.superStatsHub,
      deskPack?.deskHud?.vrvpConfluenceKo,
      deskPack?.deskHud?.hotZoneEntryKo,
    ]
  );

  const canonicalTrade = useMemo(() => {
    const last = deskCandles[deskCandles.length - 1];
    return applyMergedDeskFrozenCanonicalDisplay({
      live: canonicalTradeRaw,
      symbol,
      timeframe,
      close: liveChartPrice ?? last?.close ?? 0,
      lastCandle: last ?? null,
    });
  }, [canonicalTradeRaw, symbol, timeframe, deskCandles, liveChartPrice]);

  const aiZonePackForUi = useMemo(() => {
    if (!aiZonePack) return null;
    const c = canonicalTrade;
    if (c.direction !== 'LONG' && c.direction !== 'SHORT') {
      return {
        ...aiZonePack,
        execution: {
          direction: null,
          entry: null,
          sl: null,
          tp1: null,
          tp2: null,
          tp3: null,
        },
        footerKo: '超强统计 대기 · 차트=존 근거만 · 확정수익 아님',
      };
    }
    const oppose =
      c.direction === 'LONG' ? '숏' : c.direction === 'SHORT' ? '롱' : null;
    const evidence = oppose
      ? aiZonePack.evidence.filter((row) => {
          const lab = row.label || '';
          if (!lab.startsWith('Plan ')) return true;
          return !lab.includes(`${oppose} ·`);
        })
      : aiZonePack.evidence;
    const lockKo = c.frozen
      ? ' · 잠금'
      : c.frozenOutcomeKo
        ? ` · ${c.frozenOutcomeKo}`
        : '';
    return {
      ...aiZonePack,
      longPct: c.superStats.longPct,
      shortPct: c.superStats.shortPct,
      evidence,
      execution: {
        direction: c.direction,
        entry: c.entry,
        sl: c.stopLoss,
        tp1: c.tp1,
        tp2: c.tp2,
        tp3: c.tp3,
      },
      footerKo: `超强统计 · ${c.directionKo} · ${c.sourceKo}${lockKo} · 확정수익 아님`,
    };
  }, [aiZonePack, canonicalTrade]);

  useEffect(() => {
    const gen = ++deskPackGenRef.current;
    if (!strikeBundle || deskCandles.length < 12 || !marketTfReady) {
      /** 전환 중·TF 불일치: 잘못된 기하로 엔진 돌리지 않음 */
      return;
    }
    const candles = deskCandles;
    const last = candles[candles.length - 1]!;
    const first = candles[0]!;
    const pxKey =
      Number(last.close) >= 1000
        ? Math.round(Number(last.close) / 5) * 5
        : Number(last.close).toFixed(1);
    const sig = `${geometryTf}|${candles.length}|${first.time}|${last.time}|${pxKey}|${deferredAnalysisReady ? deferredAnalysis?.verdict ?? '' : ''}|${swingDraw ? 1 : 0}|wz${whaleZones.length}`;
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

    /** 超级强化加速 — rAF 1회 + startTransition (기능 유지·삭제 없음) */
    let raf = 0;
    const timeoutId = setTimeout(() => {
      raf = requestAnimationFrame(() => {
        startTransition(() => buildPack());
      });
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [
    strikeBundle,
    deskCandles,
    geometryTf,
    marketTfReady,
    deferredAnalysis,
    deferredAnalysisReady,
    whaleZones,
    swingDraw,
    settleBoard,
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
      const isThisMuch = id.startsWith('merged-desk-thismuch') || extra.includes('merged-desk-thismuch');
      const isWhiteLine =
        kind === 'keyLevel' ||
        kind === 'trendLine' ||
        id.startsWith('merged-desk-trade-rail-') ||
        id.includes('mlsp') ||
        extra.includes('merged-ares-level-line') ||
        extra.includes('merged-ares-mlsp-') ||
        extra.includes('merged-desk-trade-rail');
      if (label) {
        if (isThisMuch) out.push({ id, label: `요이만·${label.replace(/^요이만·/, '')}` });
        else out.push({ id, label: isWhiteLine ? `흰글자·${label.replace(/^흰글자·/, '')}` : label });
      }
      if (face && face !== label && !String(label).includes(face)) {
        out.push({ id, label: isThisMuch ? `요이만·${face}` : `흰글자·${face}` });
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

  const doksuri1Pack = useMemo(() => {
    if (!doksuri1BriefingOn) return null;
    const px = liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? 0;
    if (!(px > 0) || deskCandles.length < 8) return null;
    const zones = deskPackForChart?.mtfDumpPack?.zones ?? null;
    const srPath =
      zones && zones.length
        ? buildDumpSupportResistPath({
            zones: zones.map((z) => ({
              sourceTf: z.sourceTf,
              sourceTfKo: z.sourceTfKo || z.sourceTf,
              bandRole: z.bandRole,
              mid: z.mid,
              top: z.top,
              bot: z.bot,
              lifeState: z.lifeState,
              evidenceScore: z.evidenceScore,
            })),
            bounceCap: null,
            priceNow: px,
            chartCandles: deskCandles,
          })
        : null;
    const hud = deskPackForChart?.deskHud ?? deskPack?.deskHud;
    const swing = deskPackForChart?.swingMidEntry ?? deskPack?.swingMidEntry;
    const at = deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan;
    const structure =
      hud?.structureVerdictKo
        ? {
            verdict: hud.structureVerdict,
            labelKo: hud.structureVerdictKo,
            summaryKo: hud.supportReboundKo || hud.structureVerdictKo,
            detailKo: '',
            confidence: 55,
            overlays: [],
          }
        : null;
    return buildDoksuri1Pack({
      symbol,
      timeframe,
      price: px,
      candles: deskCandles,
      dumpZones: zones,
      srPath,
      whale: deskWhaleBeamIntel,
      structure,
      swing: swing
        ? {
            side: String(swing.side || 'WAIT'),
            stance: String(swing.stance || 'WAIT'),
            entryLow: swing.entryLow,
            entryHigh: swing.entryHigh,
            entryMid: swing.entryMid,
            stopLoss: swing.stopLoss,
            tp1: swing.tp1,
            tp2: swing.tp2,
            tp3: swing.tp3,
            grade: swing.grade,
            confluence: swing.confluence,
          }
        : null,
      levels: at
        ? {
            entry: at.entry,
            sl: at.stopLoss,
            tp1: at.tp1,
            tp2: at.tp2,
            tp3: at.tp3,
          }
        : null,
      analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
      enabled: true,
      derivEnabled: true,
      orderflowEnabled: true,
      accountUsdt: Number(loadSettings().swingSeedUsdt) || 1000,
      riskPct: Number(loadSettings().chartMergedDeskDoksuri1RiskPct) || 5,
      hqEntryZones: deskPackForChart?.hqEntryZones ?? deskPack?.hqEntryZones ?? null,
      deskHud: hud
        ? {
            mtfDumpKo: hud.mtfDumpKo,
            mtfAlignKo: hud.mtfAlignKo,
            hqEntryZonesKo: hud.hqEntryZonesKo,
            hotZoneEntryKo: hud.hotZoneEntryKo,
            aiForceZonesKo: hud.aiForceZonesKo,
            swingMidEntryKo: hud.swingMidEntryKo,
            activeTradePlanKo: hud.activeTradePlanKo,
            coreSrKo: hud.coreSrKo,
            chochObPathKo: hud.chochObPathKo,
            projectedDownsideKo: hud.projectedDownsideKo,
            projectedUpsideKo: hud.projectedUpsideKo,
            rbLiveEntryKo: hud.rbLiveEntryKo,
            rbLiveEntryGradeKo: hud.rbLiveEntryGradeKo,
              candleCardConfluenceKo: hud.candleCardConfluenceKo,
              candleEventVerdictKo: hud.candleEventVerdictKo,
            }
          : null,
        masterGrade: deskPackForChart?.masterFutures?.grade ?? deskPack?.masterFutures?.grade ?? null,
      masterSide: deskPackForChart?.masterFutures?.side ?? deskPack?.masterFutures?.side ?? null,
    });
  }, [
    doksuri1BriefingOn,
    liveChartPrice,
    deskCandles,
    deskPackForChart?.mtfDumpPack?.zones,
    deskPackForChart?.deskHud,
    deskPackForChart?.swingMidEntry,
    deskPackForChart?.activeTradePlan,
    deskPackForChart?.hqEntryZones,
    deskPackForChart?.masterFutures,
    deskPack?.deskHud,
    deskPack?.swingMidEntry,
    deskPack?.activeTradePlan,
    deskPack?.hqEntryZones,
    deskPack?.masterFutures,
    deskWhaleBeamIntel,
    symbol,
    timeframe,
    analysis,
    deferredAnalysis,
    deferredAnalysisReady,
  ]);

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

  /** MTF 폭락구간 형성 → 기록부 + session registry 공유 (1m 전용은 공유 제외) */
  useEffect(() => {
    if (!mtfDumpOn) return;
    const pack = deskPackForChart?.mtfDumpPack;
    if (!pack?.zones?.length) return;
    const sharedZones = filterSharedMtfDumpZones(pack.zones);
    const sig = pack.zones.map((z) => `${z.sourceTf}:${z.mid.toFixed(2)}`).join('|');
    if (sharedZones.length) {
      const updated = persistMtfDumpZoneRegistry(symbol, sharedZones);
      const persistSig = updated.map((z) => `${z.sourceTf}:${z.mid.toFixed(2)}`).join('|');
      if (mtfDumpPersistRef.current !== persistSig) {
        mtfDumpPersistRef.current = persistSig;
        setMtfDumpRegistry(updated);
      }
    }
    if (mtfDumpRecordedRef.current === sig) return;
    mtfDumpRecordedRef.current = sig;
    for (const z of pack.zones) {
      recordDumpZoneFormed({
        symbol,
        chartTf: timeframe,
        sourceTf: z.sourceTf,
        top: z.top,
        bot: z.bot,
        noteKo: z.labelKo,
        bandRole: z.bandRole,
        lifeState: z.lifeState,
        mid: z.mid,
      });
    }
  }, [mtfDumpOn, deskPackForChart?.mtfDumpPack, symbol, timeframe]);

  /** 자동초단 페이퍼 — Arm→SFP→로켓→TP (+4전략) · 전 TF 기본 · 심볼 칩 게이트 */
  useEffect(() => {
    const scalpEngineOn = autoScalpPaperOn || (autoTradeOn && autoTradeCfg.strategyScalp);
    if (!scalpEngineOn || deskCandles.length < 24) return;

    if (!isAutoTradeSymbolEnabled(autoTradeCfg, symbol)) {
      setAutoScalpStripKo('자동초단 · 심볼칩OFF');
      setAutoScalpDetailKo(`${symbol} 칩 꺼짐 · BTC/ETH 칩에서 켜세요`);
      return;
    }

    const ultraOnly =
      autoTradeCfg.ultraScalpOnlyLtf === true &&
      (autoTradeCfg.strategySpeed === 'ULTRA_SCALP' || autoTradeCfg.strategySpeed == null);
    const tfGate = ultraScalpTfGate(timeframe, ultraOnly);
    if (!tfGate.ok) {
      setAutoScalpStripKo('자동초단 · TF대기');
      setAutoScalpDetailKo(tfGate.reasonKo);
      return;
    }

    const mode = resolveUltraTradingMode({
      enabled: scalpEngineOn,
      liveArmed: autoTradeCfg.liveArmed,
      tradingMode: autoTradeCfg.tradingMode,
    });
    if (mode === 'OFF') {
      setAutoScalpStripKo('자동초단 · OFF');
      setAutoScalpDetailKo('엔진 OFF');
      return;
    }

    const iClosed = Math.max(0, deskCandles.length - 2);
    const closedT = Number(deskCandles[iClosed]?.time) || 0;
    if (!(closedT > 0) || autoScalpClosedStepRef.current === closedT) return;
    autoScalpClosedStepRef.current = closedT;
    const rocketHit = structureRocketRowOnLastCandle(
      (deferredAnalysisReady ? deferredAnalysis : analysis)?.structureRocketSignals,
      deskCandles,
      timeframe
    );
    const rocketNow = rocketHit?.direction ?? null;
    let geom: import('@/lib/mergedDeskBlueRedChannels').MergedDeskChannelGeom | null = null;
    try {
      if (blueRedChannelsOn && deskCandles.length >= 24) {
        const gs = buildMergedDeskBlueRedChannels(deskCandles, timeframe).geoms;
        geom = gs.find((g) => g.primary) ?? gs[0] ?? null;
      }
    } catch {
      geom = null;
    }
    const dumps =
      mtfDumpRegistry?.length
        ? mtfDumpRegistry
        : deskPackForChart?.mtfDumpPack?.zones ?? [];
    const atrApprox = (() => {
      const n = deskCandles.length;
      if (n < 5) return 0;
      let s = 0;
      let c = 0;
      for (let i = Math.max(1, n - 14); i < n; i++) {
        const a = deskCandles[i]!;
        const b = deskCandles[i - 1]!;
        s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
        c += 1;
      }
      return c > 0 ? s / c : 0;
    })();
    const sfp =
      geom && atrApprox > 0
        ? detectRbRailSfp(deskCandles.slice(0, iClosed + 1), geom, atrApprox)
        : null;

    const lev = Math.max(1, Math.min(125, autoTradeCfg.leverage || 10));
    const fourPack = evaluateFourStrategyPack({
      symbol,
      timeframe,
      candles: deskCandles,
      dumpZones: dumps,
      rocketDir: rocketNow,
      sfp: sfp ? { side: sfp.side, price: sfp.price } : null,
      leverage: lev,
      tp1RoePct: autoTradeCfg.scalpTp1RoePct ?? 5,
      tp2RoePct: autoTradeCfg.scalpTp2RoePct ?? 7,
      tp3RoePct: 10,
    });
    setFourStrategyStripKo(fourPack.stripKo);
    const setupMap: Partial<Record<import('@/lib/doksuri1/fourStrategyTypes').FourStrategyId, string>> = {};
    for (const sig of fourPack.signals) {
      const mand = sig.mandatory?.map((m) => (m.ok ? '✓' : '✗') + m.labelKo).join(' ') || '필수3';
      setupMap[sig.strategyId] = `${sig.side} · ${sig.grade}${sig.score} · ${mand}`;
    }
    if (fourPack.candidate?.rejectReason === 'CONFLICT') {
      setupMap.SWEEP_REVERSAL = fourPack.candidate.waitKo;
    }
    setFourStrategyCards(buildFourStrategyCards(symbol, timeframe, setupMap));

    if (mode === 'SIGNAL_ONLY') {
      setAutoScalpStripKo(`자동초단 · 신호만 · ${fourPack.stripKo}`);
      setAutoScalpDetailKo(fourPack.detailKo || 'SIGNAL_ONLY · 진입 없음');
      return;
    }
    const live = readAutoScalpLive(symbol, timeframe);
    const prev = autoScalpPrevRef.current ?? live?.trade ?? null;
    const tfHold = resolveAutoTradeTfHold(timeframe);
    const roeCaps = resolveUltraScalpRoeCaps({
      leverage: lev,
      tp1RoePct: Math.max(autoTradeCfg.scalpTp1RoePct ?? 5, tfHold.tp1RoePct),
      tp2RoePct: Math.max(autoTradeCfg.scalpTp2RoePct ?? 10, tfHold.tp2RoePct),
    });
    const tfTp3Roe = Math.max(autoTradeCfg.scalpTp3RoePct ?? 12, tfHold.tp3RoePct) / 100;

    /** 미보유 + 4전략 후보 → 페이퍼 직접 FIRE (덤프 Arm→SFP→로켓과 병행 · 기존 분석 유지) */
    let seedPrev = prev;
    const symbolChipOn = isAutoTradeSymbolEnabled(autoTradeCfg, symbol);
    const canFourEnter =
      symbolChipOn &&
      mode !== 'SIGNAL_ONLY' &&
      (!prev || prev.phase === 'CLOSED' || prev.phase === 'IDLE') &&
      fourPack.candidate &&
      fourPack.candidate.allowPaper &&
      !fourPack.candidate.rejectReason &&
      fourPack.candidate.score >= 60 &&
      fourPack.candidate.stop != null &&
      Number(fourPack.candidate.stop) > 0 &&
      (!(liveChartPrice != null && liveChartPrice > 0) ||
        Math.abs(fourPack.candidate.entry - liveChartPrice) / liveChartPrice <= 0.0025);

    if (canFourEnter && fourPack.candidate) {
      const opened = buildFourStrategyPaperOpen({
        candidate: fourPack.candidate,
        leverage: lev,
        maxBars: ultraScalpMaxBars(timeframe),
        entryBarTime: closedT,
      });
      if (opened) {
        seedPrev = opened;
        appendTradeJournalEvent({
          symbol,
          chartTf: timeframe,
          kind: 'AUTO_SCALP_FIRE' as TradeJournalEventKind,
          direction: opened.direction,
          price: opened.entry!,
          levelPrice: opened.entry!,
          levelLabel: '4전략',
          noteKo: opened.noteKo,
          signalId: opened.id,
          meta: {
            fourStrategyId: opened.fourStrategyId ?? null,
            score: opened.fourEntryScore ?? null,
          },
        });
        if (autoTradeOn && autoTradeCfg.strategyScalp) {
          const virt = readVirtualTradeSession();
          const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
          if (mode) {
            if (mode === 'live' && !fourPack.candidate.allowLive) {
              setAutoTradeStatusKo('4전략 · 실전 게이트 미달 · 동일분석 대기');
            } else {
              void executeUnifiedAnalysisEntry({
                mode,
                symbol,
                timeframe,
                direction: opened.direction,
                price: liveChartPrice && liveChartPrice > 0 ? liveChartPrice : opened.entry!,
                sl: opened.sl,
                tp: opened.tp1,
                source: 'scalp-fire',
                signalKo: opened.noteKo,
                cfg: autoTradeCfg,
                availableUsdt: virt.equityUsdt,
                fourStrategyId: opened.fourStrategyId,
                fourSupporting: opened.fourSupporting,
                entryScore: opened.fourEntryScore,
                liveMark: liveChartPrice,
                signalId: opened.id,
              }).then((r) => {
                setAutoTradeStatusKo(
                  `${mode === 'live' ? '실전' : '가상'} · ${r.msg}`
                );
                if (r.didLive && r.size) autoTradeLiveSizeRef.current = r.size;
              });
            }
          }
        }
      }
    }

    const snap = stepMergedDeskAutoScalp({
      symbol,
      timeframe,
      candles: deskCandles,
      dumpZones: dumps,
      geom,
      rocketDir: rocketNow,
      rocketStopLoss: rocketHit?.stopLoss ?? null,
      prev: seedPrev,
      leverage: lev,
      maxBars: tfHold.maxBars,
      tp1Frac: autoTradeCfg.scalpExitMode === 'TP1_CUT' ? 1 : 0.5,
      tp1RoeCap: roeCaps.tp1Roe,
      tp2RoeCap: roeCaps.tp2Roe,
      tp3RoeCap: Math.max(roeCaps.tp2Roe + 0.01, tfTp3Roe),
      exitMode: autoTradeCfg.scalpExitMode || 'TP2_RUNNER',
      lockRoeCap: Math.max(0.005, (autoTradeCfg.scalpLockRoePct ?? 2) / 100),
      requireZoneSl: autoTradeCfg.requireZoneSl !== false,
      minRr: autoTradeCfg.minRr ?? 1.2,
    });
    /** 덤프 FIRE에 4전략 태그 부착 */
    if (snap.trade?.phase === 'OPEN' && !snap.trade.fourStrategyId && fourPack.candidate?.rejectReason == null) {
      const match = fourPack.signals.find((s) => s.side === snap.trade!.direction);
      if (match) {
        snap.trade.fourStrategyId = match.strategyId;
        snap.trade.fourSupporting = fourPack.candidate?.supportingStrategies ?? [];
        snap.trade.fourEntryScore = match.score;
        snap.trade.fourRegime = match.regime;
        snap.trade.noteKo = `${snap.trade.noteKo} · ${FOUR_STRATEGY_KO[match.strategyId]}`;
      }
    }
    autoScalpPrevRef.current = snap.trade?.phase === 'CLOSED' ? null : snap.trade;
    setAutoScalpTrade(snap.trade);
    setAutoScalpStripKo(
      fourPack.signals.length || seedPrev?.fourStrategyId
        ? `${snap.stripKo} · ${fourPack.stripKo}`
        : snap.stripKo
    );
    setAutoScalpDetailKo(
      `${snap.detailKo} · ${lev}x · TP ${Math.round(roeCaps.tp1Roe * 100)}→${Math.round(roeCaps.tp2Roe * 100)}%ROE · ${mode}`
    );
    writeAutoScalpLive({
      symbol,
      timeframe,
      trade: snap.trade,
      stripKo: snap.stripKo,
      detailKo: snap.detailKo,
      updatedAt: Date.now(),
    });
    if (snap.trade?.phase === 'CLOSED') {
      appendAutoScalpHistory(snap.trade);
      analysisVirtFiredRef.current = '';
      setVirtAnalysisStripKo('초단 청산 · 연속분석 · 진입자리 탐색중');
      void fetch('/api/merged-desk/auto-scalp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade: snap.trade }),
      }).catch(() => undefined);
    }
    for (const ev of snap.events) {
      appendTradeJournalEvent({
        symbol,
        chartTf: timeframe,
        kind: ev.kind as TradeJournalEventKind,
        direction: ev.direction,
        price: ev.price,
        levelPrice: ev.price,
        levelLabel: '자동초단',
        noteKo: ev.noteKo,
        signalId: ev.tradeId,
        meta: ev.meta,
      });
      if (ev.kind === 'AUTO_SCALP_FIRE' && autoTradeOn && autoTradeCfg.strategyScalp) {
        const virt = readVirtualTradeSession();
        const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
        if (mode) {
          void executeUnifiedAnalysisEntry({
            mode,
            symbol,
            timeframe,
            direction: ev.direction === 'SHORT' ? 'SHORT' : 'LONG',
            price: liveChartPrice && liveChartPrice > 0 ? liveChartPrice : ev.price,
            sl: snap.trade?.sl,
            tp: snap.trade?.tp1,
            source: 'scalp-fire',
            signalKo: snap.trade?.noteKo || '초단 진입 (폭락터치→스윕→로켓)',
            cfg: autoTradeCfg,
            availableUsdt: virt.equityUsdt,
            fourStrategyId: snap.trade?.fourStrategyId,
            fourSupporting: snap.trade?.fourSupporting,
            entryScore: snap.trade?.fourEntryScore,
            liveMark: liveChartPrice,
            signalId: ev.tradeId,
          }).then((r) => {
            setAutoTradeStatusKo(`${mode === 'live' ? '실전' : '가상'} · ${r.msg}`);
            if (r.didLive && r.size) autoTradeLiveSizeRef.current = r.size;
          });
        }
      }
      if (
        (ev.kind === 'AUTO_SCALP_TP1' ||
          ev.kind === 'AUTO_SCALP_TP2' ||
          ev.kind === 'AUTO_SCALP_SL' ||
          ev.kind === 'AUTO_SCALP_TIME' ||
          ev.kind === 'AUTO_SCALP_CLOSE') &&
        autoTradeOn &&
        autoTradeCfg.liveArmed
      ) {
        const frac =
          ev.kind === 'AUTO_SCALP_TP1' && snap.trade?.closeReason !== 'TP1_FULL'
            ? Number(snap.trade?.tp1Frac ?? 0.55)
            : 1;
        const lockSl =
          ev.kind === 'AUTO_SCALP_TP1' &&
          frac < 0.95 &&
          snap.trade?.activeSl != null &&
          snap.trade.activeSl > 0
            ? snap.trade.activeSl
            : null;
        void maybeLiveReduce({
          signalId: `${ev.tradeId}-${ev.kind}`,
          symbol,
          direction: ev.direction === 'SHORT' ? 'SHORT' : 'LONG',
          price: ev.price,
          frac,
          entrySizeHint: autoTradeLiveSizeRef.current || undefined,
          cfg: autoTradeCfg,
          lockSl,
          exitReason:
            ev.kind === 'AUTO_SCALP_SL'
              ? '손절'
              : ev.kind === 'AUTO_SCALP_TP1'
                ? '익절TP1'
                : ev.kind === 'AUTO_SCALP_TP2'
                  ? '익절TP2'
                  : ev.kind === 'AUTO_SCALP_TIME'
                    ? '시간손절'
                    : '실청산',
          entryPrice: snap.trade?.entry ?? null,
          size:
            autoTradeLiveSizeRef.current && Number(autoTradeLiveSizeRef.current) > 0
              ? Number(autoTradeLiveSizeRef.current)
              : null,
          marginUsdt: null,
        }).then((r) => {
          setAutoTradeStatusKo(r.msg);
          if (ev.kind !== 'AUTO_SCALP_TP1' || frac >= 0.95) {
            /** 전량 청산류 → 연속 분석 재개 */
            analysisVirtFiredRef.current = '';
            autoTradeLiveSizeRef.current = '';
            setVirtAnalysisStripKo('실전 청산 · 연속분석 · 진입자리 탐색중');
          } else if (r.lockOk) {
            setVirtAnalysisStripKo(`실전 TP1 · SL잠금 ${lockSl?.toFixed?.(0) ?? ''} · 잔량대기`);
          }
        });
      }
    }
  }, [
    autoScalpPaperOn,
    autoTradeOn,
    autoTradeCfg,
    blueRedChannelsOn,
    deskCandles,
    symbol,
    timeframe,
    mtfDumpRegistry,
    deskPackForChart?.mtfDumpPack,
    deferredAnalysisReady,
    deferredAnalysis,
    analysis,
    liveChartPrice,
  ]);

  /** ETH 칩 ON · 3m·5m·15m 폭락존 터치 + AI존≥70% · TP ROE5% · 실전/가상 공통 */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    if (!isAutoTradeSymbolEnabled(autoTradeCfg, 'ETHUSDT')) return;
    if (!autoTradeCfg.strategyScalp) return;
    let cancelled = false;
    const fired = new Set<string>();

    const tick = async () => {
      if (cancelled) return;
      try {
        const q = new URLSearchParams({
          symbol: 'ETHUSDT',
          leverage: String(autoTradeCfg.leverage || 10),
          minRr: String(autoTradeCfg.minRr ?? 1.2),
        });
        const res = await fetch(`/api/merged-desk/bg-dump-scan?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          signals?: Array<{
            signalId: string;
            timeframe: string;
            direction: 'LONG' | 'SHORT';
            entry: number;
            sl: number;
            tp1: number;
            noteKo: string;
            aiZonePct?: number;
            zoneBot?: number;
            zoneTop?: number;
          }>;
          skipped?: Array<{ tf: string; reasonKo: string }>;
          errors?: Array<{ tf: string; msg: string }>;
          hintKo?: string;
        };
        if (!j.ok) {
          if (j.errors?.length) {
            setAutoTradeStatusKo(`ETH스캔 오류 · ${j.errors[0]?.msg || '실패'}`);
          }
          return;
        }

        /** 이미 ETH 포지션이면 신규 진입 없음 — 상태줄에 명시 */
        try {
          const { fetchLivePosition } = await import('@/lib/mergedDeskLiveOrderClient');
          const posPack = await fetchLivePosition('ETHUSDT');
          const ep = posPack.ethPosition ?? posPack.position;
          if (ep && Number(ep.size) > 0 && String(ep.symbol || '').toUpperCase().startsWith('ETH')) {
            setAutoTradeStatusKo(
              `ETH ${ep.direction === 'LONG' ? '롱' : '숏'} 보유중 · 같은코인 추가진입 안 함 · 청산 후 다음 터치`
            );
            return;
          }
        } catch {
          /* ignore */
        }

        if (!Array.isArray(j.signals) || !j.signals.length) {
          const skip0 = j.skipped?.[0]?.reasonKo;
          setAutoTradeStatusKo((prev) =>
            typeof prev === 'string' && prev.startsWith('ETH폭락존')
              ? prev
              : `ETH폭락존 대기 · AI≥70%+거래량합류 · ${skip0 || j.hintKo || '터치대기'} · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          );
          return;
        }
        const virt = readVirtualTradeSession();
        const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
        if (!mode) {
          setAutoTradeStatusKo('ETH신호 있음 · 실전/가상 ARM 필요');
          return;
        }
        /** 터치 진입은 차트 심볼과 무관 — 기존 ETH 포지션/시그널ID로 중복만 차단 */
        for (const sig of j.signals) {
          if (!sig.signalId || fired.has(sig.signalId)) continue;
          if (wasAutoTradeSignalFired(sig.signalId)) {
            fired.add(sig.signalId);
            continue;
          }
          fired.add(sig.signalId);
          /** ETH 차트 미열람이어도 게이트용 스냅 게시 (존·추정) */
          try {
            const zBot = Number((sig as { zoneBot?: number }).zoneBot) || 0;
            const zTop = Number((sig as { zoneTop?: number }).zoneTop) || 0;
            const pct = Number(sig.aiZonePct) || 0;
            if (zBot > 0 && zTop > zBot) {
              const band = {
                kind: sig.direction === 'LONG' ? ('buy' as const) : ('sell' as const),
                lo: zBot,
                hi: zTop,
                mid: (zBot + zTop) / 2,
                labelKo: '폭락존',
              };
              writeAiZoneEntrySnapshot({
                symbol: 'ETHUSDT',
                timeframe: sig.timeframe,
                updatedAt: Date.now(),
                price: sig.entry,
                longPct: sig.direction === 'LONG' ? pct || 70 : null,
                shortPct: sig.direction === 'SHORT' ? pct || 70 : null,
                buyFace: sig.direction === 'LONG' ? band : null,
                sellFace: sig.direction === 'SHORT' ? band : null,
                longZone: sig.direction === 'LONG' ? band : null,
                shortZone: sig.direction === 'SHORT' ? band : null,
                nextResist: null,
                nextSupport: null,
                volumeHeavy: false,
                rangeLo: zBot,
                rangeHi: zTop,
                swingLow: zBot,
                swingHigh: zTop,
                noteKo: 'ETH폭락존스캔게시',
              });
            }
          } catch {
            /* ignore */
          }
          void executeUnifiedAnalysisEntry({
            mode,
            symbol: 'ETHUSDT',
            timeframe: sig.timeframe,
            direction: sig.direction,
            price: sig.entry,
            sl: sig.sl,
            tp: sig.tp1,
            source: 'dump-zone',
            signalKo: sig.noteKo || `ETH ${sig.timeframe} 폭락존터치`,
            cfg: autoTradeCfg,
            liveMark: sig.entry,
            signalId: sig.signalId,
            availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
            analysisTags: ['eth-bg', 'dump-touch', 'ai-zone-70', sig.timeframe],
          }).then((r) => {
            if (!r.ok && !/기존 .+ 포지션|추가진입|한도/.test(r.msg)) {
              fired.delete(sig.signalId);
            }
            const skipPos = !r.ok && /기존 .+ 포지션|추가진입/.test(r.msg);
            setAutoTradeStatusKo(
              skipPos
                ? `ETH 이미 포지션 있음 · 같은코인 추가진입 안 함 · ${r.msg}`
                : r.ok
                  ? `ETH폭락존 진입 · ${sig.timeframe} · ${r.msg}`
                  : `ETH폭락존 스킵 · ${sig.timeframe} · ${r.msg}`
            );
          });
        }
      } catch {
        /* ignore network */
      }
    };

    void delayMs(400).then(() => {
      if (!cancelled) void tick();
    });
    /** 3m 마감 반영 — 실전은 조금 더 짧게 · 탭 숨김 시 폴링 중지 */
    const ms = autoTradeCfg.liveArmed ? 35_000 : 50_000;
    const clear = setVisibleInterval(() => void tick(), ms);
    return () => {
      cancelled = true;
      clear();
    };
  }, [
    autoTradeOn,
    autoTradeCfg.enabled,
    autoTradeCfg.liveArmed,
    autoTradeCfg.leverage,
    autoTradeCfg.minRr,
    autoTradeCfg.enabledSymbols,
    autoTradeCfg.strategyScalp,
    symbol,
  ]);

  /**
   * ETH 차트신호(장바구니·로켓·LH·스윙·SFP) 자동진입 — OFF
   * ETH는 3m·5m·15m 폭락존+AI존≥70%만 (bg-dump-scan). API·기능 삭제 없음.
   */
  useEffect(() => {
    /* eth-chart-signal-scan 자동주문 비활성 */
  }, []);

  /**
   * BTC 3·5분 구조로켓 자동진입 — 취소 (스캔·주문 미실행 · API/코드 유지).
   */
  /**
   * BTC 구경로(로켓 등) 취소 · AIZONE Tier S는 아래 이펙트.
   */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    if (!String(symbol || '').toUpperCase().startsWith('BTC')) return;
    setAutoTradeStatusKo('BTC · 구경로OFF · AIZONE·초단Fast Dual');
  }, [autoTradeOn, autoTradeCfg.enabled, autoTradeCfg.liveArmed, symbol]);

  /**
   * AIZONE 주도 — Tier S · BTC·ETH·SOL=A · XRP=B.
   * 모드 S|DUAL 일 때만 · 면+방 · SFP|흡수 · 수수료.
   */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    if (autoTradeCfg.aiZoneDriveEnabled === false) return;
    const scalpMode = autoTradeCfg.autoTradeScalpMode || 'FAST';
    if (scalpMode === 'FAST') return;
    const symU = String(symbol || '').toUpperCase();
    const role =
      (symU.startsWith('BTC') && isAutoTradeSymbolEnabled(autoTradeCfg, 'BTCUSDT')) ||
      (symU.startsWith('ETH') && isAutoTradeSymbolEnabled(autoTradeCfg, 'ETHUSDT')) ||
      (symU.startsWith('SOL') && isAutoTradeSymbolEnabled(autoTradeCfg, 'SOLUSDT'))
        ? ('A' as const)
        : symU.startsWith('XRP') && isAutoTradeSymbolEnabled(autoTradeCfg, 'XRPUSDT')
          ? ('B' as const)
          : null;
    if (!role) return;
    let cancelled = false;
    const fired = new Set<string>();

    const tick = () => {
      if (cancelled) return;
      const virt = readVirtualTradeSession();
      const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
      if (!mode) return;
      const snap = readAiZoneEntrySnapshot(symbol);
      if (!snap) {
        setAutoTradeStatusKo(`AIZONE ${role} · 스냅대기 · ${symU}`);
        const probeEmpty = probeAiZoneProgress({
          symbol,
          leverage: autoTradeCfg.leverage || 30,
          snap: null,
          price: liveChartPrice,
        });
        if (probeEmpty) {
          upsertCoinTradeProgress({
            probe: probeEmpty,
            timeframe,
            kind: 'tick',
            writeJournal: false,
          });
        }
        return;
      }
      /** S 필수: SFP 또는 흡수방어/스윕반전 */
      let triggerOk = false;
      let triggerKo = '';
      try {
        const atr =
          deskCandles.length > 5
            ? Math.abs(Number(deskCandles[deskCandles.length - 1]?.close) || 1) * 0.004
            : 1;
        const gs = buildMergedDeskBlueRedChannels(deskCandles, timeframe).geoms;
        const geom = gs.find((g) => g.primary) ?? gs[0] ?? null;
        const sfp = geom
          ? detectRbRailSfp(deskCandles.slice(0, Math.max(1, deskCandles.length - 1)), geom, atr)
          : null;
        const prefer =
          (snap.longPct ?? 0) >= (snap.shortPct ?? 0) ? 'LONG' : 'SHORT';
        if (sfp) {
          const sfpDir = sfp.side === 'bull' ? 'LONG' : 'SHORT';
          if (sfpDir === prefer) {
            triggerOk = true;
            triggerKo = sfp.side === 'bull' ? '스윕회수↑' : '스윕회수↓';
          }
        }
        if (!triggerOk && deskCandles.length > 30) {
          const four = evaluateFourStrategyPack({
            candles: deskCandles,
            symbol,
            timeframe,
            leverage: autoTradeCfg.leverage || 30,
            treatLastClosed: false,
            rocketDir: snap.rocketDir ?? null,
          });
          const id = String(four.candidate?.primaryStrategy || '');
          const side = four.candidate?.side;
          const absorbOk =
            (id === 'ZONE_DEFENSE' || id === 'SWEEP_REVERSAL') &&
            side === prefer &&
            !four.candidate?.rejectReason &&
            (four.candidate?.score ?? 0) >= 55;
          if (absorbOk) {
            triggerOk = true;
            triggerKo = id === 'ZONE_DEFENSE' ? '흡수방어' : '스윕반전';
          }
        }
      } catch {
        /* ignore */
      }
      const probeS = probeAiZoneProgress({
        symbol,
        leverage: autoTradeCfg.leverage || 30,
        snap,
        price: liveChartPrice ?? snap.price,
        triggerOk,
        triggerKo,
        minRr: autoTradeCfg.minRr || 1.2,
      });
      if (!triggerOk) {
        setAutoTradeStatusKo(`품질레인 ${role} · 스윕회수·흡수 대기 · 확정아님`);
        if (probeS) {
          upsertCoinTradeProgress({
            probe: probeS,
            timeframe,
            kind: 'skip',
            reasonKo: '스윕회수·흡수 대기(필수)',
            price: liveChartPrice ?? snap.price,
          });
        }
        recordCoinTradeSkip({
          symbol,
          timeframe,
          reasonKo: '스윕회수·흡수 대기(필수)',
          source: 'ai-zone',
          role,
          price: liveChartPrice ?? snap.price,
        });
        return;
      }
      const cand = buildAiZoneDriveCandidate({
        symbol,
        leverage: autoTradeCfg.leverage || 30,
        role,
        snap,
        price: liveChartPrice ?? snap.price,
        triggerOk,
        triggerKo,
        bonusKo: role === 'B' ? ['가산라벨'] : null,
        minRr: autoTradeCfg.minRr || 1.2,
      });
      if (!cand) {
        setAutoTradeStatusKo(`품질레인 ${role} · 조건미달(면·근거·수수료) · ${symU}`);
        if (probeS) {
          upsertCoinTradeProgress({
            probe: probeS,
            timeframe,
            kind: 'skip',
            reasonKo: '조건미달(면·근거·수수료)',
            price: liveChartPrice ?? snap.price,
          });
        }
        recordCoinTradeSkip({
          symbol,
          timeframe,
          reasonKo: '조건미달(면·근거·수수료)',
          source: 'ai-zone',
          role,
          price: liveChartPrice ?? snap.price,
        });
        return;
      }
      if (probeS) {
        upsertCoinTradeProgress({
          probe: { ...probeS, canEnter: true, status: '진입가능', waitingKo: '조건충족 · 주문중' },
          timeframe,
          kind: 'tick',
          writeJournal: false,
        });
      }
      const sigId = `ai-zone-${cand.symbol}-${timeframe}-${cand.direction}-${Math.round(cand.entry)}-${triggerKo || 'ev'}`;
      if (fired.has(sigId) || wasAutoTradeSignalFired(sigId)) return;
      fired.add(sigId);
      void executeUnifiedAnalysisEntry({
        mode,
        symbol: cand.symbol,
        timeframe,
        direction: cand.direction,
        price: cand.entry,
        sl: cand.sl,
        tp: cand.tp,
        source: 'ai-zone',
        signalKo: cand.signalKo,
        cfg: autoTradeCfg,
        liveMark: cand.entry,
        signalId: sigId,
        availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
        entryScore: cand.score,
        analysisTags: cand.analysisTags,
        evidenceKo: cand.evidenceKo,
      }).then((r) => {
        if (!r.ok && !/기존 .+ 포지션|추가진입|한도|보유중|헷지/.test(r.msg)) {
          fired.delete(sigId);
        }
        if (probeS) {
          upsertCoinTradeProgress({
            probe: probeS,
            timeframe,
            kind: r.ok ? 'entry' : 'skip',
            reasonKo: r.msg,
            price: cand.entry,
          });
        }
        setAutoTradeStatusKo(
          r.ok
            ? `품질레인${role} · ${cand.direction === 'LONG' ? '롱' : '숏'} · 순ROE${cand.netRoePct.toFixed(1)}% · ${r.msg}`
            : `품질레인${role} · ${r.msg}`
        );
      });
    };

    void delayMs(800).then(() => {
      if (!cancelled) tick();
    });
    const clear = setVisibleInterval(tick, autoTradeCfg.liveArmed ? 12_000 : 18_000);
    return () => {
      cancelled = true;
      clear();
    };
  }, [
    symbol,
    timeframe,
    deskCandles,
    liveChartPrice,
    autoTradeOn,
    autoTradeCfg,
  ]);

  /**
   * Dual 4코인 BG 레이스 — 자동매매창 닫아도 · 차트 4h여도
   * 1m/3m/15m 스스로 감지 → 선도착 실주문·TG (기존 세팅).
   */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    const scalpMode = autoTradeCfg.autoTradeScalpMode || 'FAST';
    if (scalpMode === 'S') return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await tickDualBgRaceEntries({ cfg: autoTradeCfg });
        if (cancelled) return;
        if (r.tried > 0 || r.ok > 0 || /선도착|진입|주문|BG ·/.test(r.statusKo)) {
          setAutoTradeStatusKo(r.statusKo);
        }
      } catch {
        /* ignore */
      }
    };
    void delayMs(900).then(() => {
      if (!cancelled) void tick();
    });
    const clear = setVisibleInterval(() => {
      void tick();
    }, autoTradeCfg.liveArmed ? 10_000 : 14_000);
    return () => {
      cancelled = true;
      clear();
    };
  }, [autoTradeOn, autoTradeCfg]);

  /**
   * Dual 레이스 — 신호A(코어4 Fast) · 신호B(로켓·장바/하락·번개).
   * 차트 TF가 1m/3m/5m가 아니어도 1m·3m 캔들 fetch 후 주문(4h 등에서도 진입).
   * 믹스(/6) 금지 · BTC/ETH/SOL/XRP.
   */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    /** 타점전용 — Dual 차트 레이스 실주문 시도 중지 */
    if (isTapointTapOnly()) return;
    const scalpMode = autoTradeCfg.autoTradeScalpMode || 'FAST';
    if (scalpMode === 'S') return;
    if (!rbScalpSymbolAllowed(symbol)) return;
    if (!isAutoTradeSymbolEnabled(autoTradeCfg, symbol)) return;
    let cancelled = false;
    const fired = new Set<string>();
    void fetchBprCandles15m(symbol);
    const chartTf = String(timeframe || '').toLowerCase();

    const tick = async () => {
      if (cancelled) return;
      const virt = readVirtualTradeSession();
      const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
      if (!mode) return;
      const c15 = peekBprCandles15m(symbol);

      const fetchTf = async (tfNeed: string) => {
        try {
          const q = new URLSearchParams({
            symbol: String(symbol).toUpperCase().endsWith('USDT')
              ? String(symbol).toUpperCase()
              : `${String(symbol).toUpperCase()}USDT`,
            timeframe: tfNeed,
            depth: 'recent',
          });
          const res = await fetch(`/api/market?${q}`, {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          const json = (await res.json().catch(() => ({}))) as {
            candles?: typeof deskCandles;
          };
          return Array.isArray(json.candles) ? json.candles : null;
        } catch {
          return null;
        }
      };

      const fastTf =
        chartTf === '1m' || chartTf === '3m' || chartTf === '5m' ? chartTf : '1m';
      let candlesFast =
        chartTf === fastTf && deskCandles.length >= 36 ? deskCandles : null;
      if (!candlesFast) candlesFast = await fetchTf(fastTf);
      if (cancelled) return;
      if (!candlesFast || candlesFast.length < 36) {
        setAutoTradeStatusKo(`Dual레이스 · ${fastTf}캔들대기 · 확정아님`);
        return;
      }

      let candles3m: typeof deskCandles | null =
        chartTf === '3m' && deskCandles.length >= 40 ? deskCandles : null;
      if (!candles3m) candles3m = await fetchTf('3m');
      if (cancelled) return;

      let candlesS: typeof deskCandles | null =
        chartTf === '15m' && deskCandles.length >= 40 ? deskCandles : null;
      if (!candlesS) candlesS = await fetchTf('15m');
      if (cancelled) return;

      const race = runBtcSignalRace({
        symbol,
        candlesFast,
        timeframeFast: fastTf,
        candles3m,
        candlesS,
        leverage: autoTradeCfg.leverage || 40,
        minRr: autoTradeCfg.minRr || 1.2,
        tp1RoePct: autoTradeCfg.scalpTp1RoePct || 8,
        price: liveChartPrice,
        candles15m: c15,
      });
      writeBtcSignalBProbe(race.probeB);

      const probeF = probeRbScalpProgress({
        symbol,
        timeframe: fastTf,
        candles: candlesFast,
        leverage: autoTradeCfg.leverage || 40,
        minRr: autoTradeCfg.minRr || 1.2,
        tp1RoePct: autoTradeCfg.scalpTp1RoePct || 8,
        price: liveChartPrice,
        candles15m: c15,
      });

      const win = race.winner;
      if (!win) {
        setAutoTradeStatusKo(
          `Dual레이스 · ${fastTf} · ${race.probeB.waitingKo} · 확정아님`
        );
        if (probeF) {
          upsertCoinTradeProgress({
            probe: probeF,
            timeframe: fastTf,
            kind: 'skip',
            reasonKo: race.reasonKo,
            price: liveChartPrice,
          });
        }
        recordCoinTradeSkip({
          symbol,
          timeframe: fastTf,
          reasonKo: race.reasonKo,
          source: 'rb-scalp',
          price: liveChartPrice,
        });
        return;
      }
      if (probeF && win.slot === 'A') {
        upsertCoinTradeProgress({
          probe: {
            ...probeF,
            canEnter: true,
            status: '진입가능',
            waitingKo: '신호A선도착 · 주문중',
          },
          timeframe: fastTf,
          kind: 'tick',
          writeJournal: false,
        });
      }
      if (fired.has(win.signalId) || wasAutoTradeSignalFired(win.signalId)) return;
      fired.add(win.signalId);
      const symU = String(symbol || '').toUpperCase();
      const fullSym = symU.endsWith('USDT') ? symU : `${symU}USDT`;
      void executeUnifiedAnalysisEntry({
        mode,
        symbol: fullSym,
        timeframe: win.slot === 'B' ? '3m' : win.slot === 'C' ? '15m' : fastTf,
        direction: win.direction,
        price: win.entry,
        sl: win.sl,
        tp: win.tp,
        source:
          win.source === BTC_ROCKET_CART_SOURCE
            ? BTC_ROCKET_CART_SOURCE
            : win.source === STRUCTURE_S_SOURCE
              ? STRUCTURE_S_SOURCE
              : 'rb-scalp',
        signalKo: win.signalKo,
        cfg: autoTradeCfg,
        liveMark: win.entry,
        signalId: win.signalId,
        availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
        entryScore: win.score,
        analysisTags: win.analysisTags,
        evidenceKo: win.evidenceKo,
      }).then((r) => {
        if (!r.ok && !/기존 .+ 포지션|추가진입|한도|보유중|헷지/.test(r.msg)) {
          fired.delete(win.signalId);
        }
        if (r.ok && probeF && win.slot === 'A') {
          upsertCoinTradeProgress({
            probe: probeF,
            timeframe: fastTf,
            kind: 'entry',
            reasonKo: r.msg,
            price: win.entry,
          });
        } else if (!r.ok && probeF) {
          upsertCoinTradeProgress({
            probe: probeF,
            timeframe: fastTf,
            kind: 'skip',
            reasonKo: r.msg,
            price: win.entry,
          });
        }
        setAutoTradeStatusKo(
          r.ok
            ? `${win.slotKo} · ${win.direction === 'LONG' ? '롱' : '숏'} · 순ROE${win.netRoePct.toFixed(1)}% · ${r.msg}`
            : `Dual레이스 · ${r.msg}`
        );
      });
    };

    void delayMs(600).then(() => {
      if (!cancelled) void tick();
    });
    const clear = setVisibleInterval(() => {
      void tick();
    }, autoTradeCfg.liveArmed ? 8_000 : 12_000);
    return () => {
      cancelled = true;
      clear();
    };
  }, [
    symbol,
    timeframe,
    deskCandles,
    liveChartPrice,
    autoTradeOn,
    autoTradeCfg,
  ]);

  /**
   * BNB 칩 ON · 캔들분석 방향 + Parallel Pivot Lines 타점(롱=PL·숏=PH).
   * 기존 BNBSFP 자동진입 중지(코드·API 유지·미호출).
   */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    if (!isAutoTradeSymbolEnabled(autoTradeCfg, 'BNBUSDT')) return;
    if (!autoTradeCfg.strategyScalp) return;
    let cancelled = false;
    const fired = new Set<string>();

    const tick = async () => {
      if (cancelled) return;
      try {
        const q = new URLSearchParams({
          leverage: String(autoTradeCfg.leverage || 10),
          minRr: String(autoTradeCfg.minRr ?? 1.2),
        });
        const res = await fetch(`/api/merged-desk/bnb-ppl-scan?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          signals?: Array<{
            signalId: string;
            timeframe: string;
            direction: 'LONG' | 'SHORT';
            entry: number;
            sl: number;
            tp1: number;
            tipPrice?: number;
            noteKo: string;
            mode?: 'enter_now' | 'wait_touch';
          }>;
          waiting?: Array<{
            signalId: string;
            timeframe: string;
            direction: 'LONG' | 'SHORT';
            tipPrice?: number;
            noteKo: string;
          }>;
          skipped?: Array<{ tf: string; reasonKo: string }>;
          hintKo?: string;
          error?: string;
        };
        if (!j.ok) {
          if (j.error) setAutoTradeStatusKo(`BNBPPL · ${j.error}`);
          return;
        }

        try {
          const { fetchLivePosition } = await import('@/lib/mergedDeskLiveOrderClient');
          const posPack = await fetchLivePosition('BNBUSDT');
          const fromList = posPack.positions?.find((p) =>
            String(p.symbol || '').toUpperCase().startsWith('BNB')
          );
          const bp = fromList ?? posPack.position;
          if (
            bp &&
            Number(bp.size) > 0 &&
            String(bp.symbol || '').toUpperCase().startsWith('BNB')
          ) {
            setAutoTradeStatusKo(
              `BNB ${bp.direction === 'LONG' ? '롱' : '숏'} 보유중 · 추가진입 안 함 · PPL대기`
            );
            return;
          }
        } catch {
          /* ignore */
        }

        const virt = readVirtualTradeSession();
        if (virt.active && virt.position && String(virt.position.symbol || '').includes('BNB')) {
          setAutoTradeStatusKo('BNB 가상 보유중 · 청산 후 다음 PPL');
          return;
        }

        const enterList = (j.signals || []).filter(
          (s) => !s.mode || s.mode === 'enter_now'
        );
        if (!enterList.length) {
          const wait0 = j.waiting?.[0];
          const skip0 = j.skipped?.[0]?.reasonKo;
          setAutoTradeStatusKo((prev) =>
            typeof prev === 'string' && prev.startsWith('BNBPPL')
              ? prev
              : wait0
                ? `BNBPPL 대기 · ${wait0.timeframe} ${wait0.direction === 'LONG' ? '롱PL' : '숏PH'}터치·AI≥70 · ${wait0.noteKo}`
                : `BNBPPL 대기 · 캔들+피벗선·AI≥70 · ${skip0 || j.hintKo || '스캔중'} · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          );
          return;
        }

        const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
        if (!mode) {
          setAutoTradeStatusKo('BNBPPL 있음 · 실전/가상 ARM 필요');
          return;
        }

        const sig = enterList[0]!;
        if (!sig.signalId || fired.has(sig.signalId) || wasAutoTradeSignalFired(sig.signalId)) {
          if (sig.signalId) fired.add(sig.signalId);
          return;
        }
        fired.add(sig.signalId);

        void executeUnifiedAnalysisEntry({
          mode,
          symbol: 'BNBUSDT',
          timeframe: sig.timeframe,
          direction: sig.direction,
          price: sig.entry,
          sl: sig.sl,
          tp: sig.tp1,
          source: 'bnb-ppl-candle',
          signalKo: sig.noteKo || `BNB ${sig.timeframe} PPL`,
          cfg: autoTradeCfg,
          liveMark: sig.entry,
          signalId: sig.signalId,
          availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
          analysisTags: ['bnb-ppl', 'candle-gate', sig.timeframe, sig.direction],
        }).then((r) => {
          if (!r.ok && !/기존 .+ 포지션|추가진입|한도|보유중/.test(r.msg)) {
            fired.delete(sig.signalId);
          }
          setAutoTradeStatusKo(
            r.ok
              ? `BNBPPL · ${sig.timeframe} · ${sig.direction === 'LONG' ? '롱' : '숏'} · ${r.msg}`
              : `BNBPPL · ${r.msg}`
          );
        });
      } catch {
        /* ignore */
      }
    };

    void delayMs(2200).then(() => {
      if (!cancelled) void tick();
    });
    const ms = autoTradeCfg.liveArmed ? 35_000 : 50_000;
    const clear = setVisibleInterval(() => void tick(), ms);
    return () => {
      cancelled = true;
      clear();
    };
  }, [
    autoTradeOn,
    autoTradeCfg.enabled,
    autoTradeCfg.liveArmed,
    autoTradeCfg.leverage,
    autoTradeCfg.minRr,
    autoTradeCfg.enabledSymbols,
    autoTradeCfg.strategyScalp,
  ]);

  /**
   * XRP 독수리1호 4패턴 자동진입 — OFF (가산 전용 · API/스캔 코드 유지).
   * XRP=B 진입은 AIZONE 주도 이펙트에서만.
   */
  useEffect(() => {
    /* xrp-4strat-scan 자동주문 비활성 · 가산만 */
  }, []);

  /**
   * 15m 꼬리+추정 — 코인별 독립 진입(BTC 합류팩 미묶음).
   * BTC/BNB/XRP=꼬리+추정≥70·몸통무시·≈40x · ETH=꼬리+추정+거래량합류·≈40x.
   */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    if (!autoTradeCfg.strategyScalp) return;
    let cancelled = false;
    const fired = new Set<string>();
    const wickLev = resolveWick15mLeverage(autoTradeCfg.leverage);

    const tick = async () => {
      if (cancelled) return;
      try {
        const q = new URLSearchParams({
          symbol: 'ALL',
          leverage: String(wickLev),
          pctMin: '70',
        });
        const res = await fetch(`/api/merged-desk/wick-15m-scan?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          signals?: Array<{
            signalId: string;
            symbol: string;
            timeframe: string;
            direction: 'LONG' | 'SHORT';
            entry: number;
            sl: number;
            tp1: number;
            noteKo: string;
            longPct?: number;
            shortPct?: number;
          }>;
          skipped?: Array<{ symbol: string; reasonKo: string }>;
          hintKo?: string;
        };
        if (!j.ok) return;

        const virt = readVirtualTradeSession();
        const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
        if (!mode) {
          if (j.signals?.length) {
            setAutoTradeStatusKo('15m꼬리 신호 · 실전/가상 ARM 필요');
          }
          return;
        }

        const list = Array.isArray(j.signals) ? j.signals : [];
        if (!list.length) {
          const skip0 = j.skipped?.[0];
          setAutoTradeStatusKo((prev) =>
            typeof prev === 'string' && prev.startsWith('15m꼬리')
              ? prev
              : `15m꼬리 대기 · 코인별단독 ${wickLev}x · BTC/BNB/XRP/SOL=꼬리+추정70 · ETH=+볼륨 · ${skip0?.reasonKo || j.hintKo || '스캔중'} · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          );
          return;
        }

        for (const sig of list) {
          if (!sig.signalId || !sig.symbol) continue;
          if (!isAutoTradeSymbolEnabled(autoTradeCfg, sig.symbol)) continue;
          if (fired.has(sig.signalId) || wasAutoTradeSignalFired(sig.signalId)) {
            fired.add(sig.signalId);
            continue;
          }
          fired.add(sig.signalId);
          void executeUnifiedAnalysisEntry({
            mode,
            symbol: sig.symbol,
            timeframe: sig.timeframe || '15m',
            direction: sig.direction,
            price: sig.entry,
            sl: sig.sl,
            tp: sig.tp1,
            source: 'wick-15m',
            signalKo: sig.noteKo || '15m꼬리추정',
            cfg: { ...autoTradeCfg, leverage: wickLev },
            liveMark: sig.entry,
            signalId: sig.signalId,
            availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
            analysisTags: [
              'wick-15m',
              'wick-15m-solo',
              `${wickLev}x`,
              sig.direction,
              sig.direction === 'LONG'
                ? `진입${Math.round(sig.longPct ?? 0)}`
                : `저항${Math.round(sig.shortPct ?? 0)}`,
            ],
          }).then((r) => {
            if (!r.ok && !/기존 .+ 포지션|추가진입|한도|보유중/.test(r.msg)) {
              fired.delete(sig.signalId);
            }
            const chip = String(sig.symbol).replace('USDT', '');
            setAutoTradeStatusKo(
              r.ok
                ? `15m꼬리 · ${chip}${sig.direction === 'LONG' ? '롱' : '숏'} · ${wickLev}x · ${r.msg}`
                : `15m꼬리 · ${chip} · ${r.msg}`
            );
          });
        }
      } catch {
        /* ignore network */
      }
    };

    void delayMs(4600).then(() => {
      if (!cancelled) void tick();
    });
    const ms = autoTradeCfg.liveArmed ? 30_000 : 45_000;
    const clear = setVisibleInterval(() => void tick(), ms);
    return () => {
      cancelled = true;
      clear();
    };
  }, [
    autoTradeOn,
    autoTradeCfg.enabled,
    autoTradeCfg.liveArmed,
    autoTradeCfg.leverage,
    autoTradeCfg.enabledSymbols,
    autoTradeCfg.strategyScalp,
  ]);

  /**
   * 15m BPR 재터치 자동진입 — OFF (사용자 요청).
   * API·엔진 삭제 없음 · 차트 BPR 표시는 유지.
   */
  useEffect(() => {
    /* bpr-retest-scan 자동주문 비활성 */
  }, []);

  /**
   * 15m 폭락감시+윗꼬리+저항≥70+연속매도량 → 숏.
   * BTC/ETH/BNB/XRP/SOL 칩별 추가 · 기존 신호 유지.
   */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    if (!autoTradeCfg.strategyScalp) return;
    let cancelled = false;
    const fired = new Set<string>();
    const dwwLev = resolveWick15mLeverage(autoTradeCfg.leverage);

    const tick = async () => {
      if (cancelled) return;
      try {
        const q = new URLSearchParams({
          symbol: 'ALL',
          leverage: String(dwwLev),
          pctMin: '70',
        });
        const res = await fetch(`/api/merged-desk/dump-watch-wick-scan?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          signals?: Array<{
            signalId: string;
            symbol: string;
            timeframe: string;
            direction: 'LONG' | 'SHORT';
            entry: number;
            sl: number;
            tp1: number;
            noteKo: string;
            shortPct?: number;
          }>;
          skipped?: Array<{ symbol: string; reasonKo: string }>;
          hintKo?: string;
        };
        if (!j.ok) return;

        const virt = readVirtualTradeSession();
        const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
        if (!mode) {
          if (j.signals?.length) {
            setAutoTradeStatusKo('폭락감시윗꼬리 신호 · 실전/가상 ARM 필요');
          }
          return;
        }

        const list = Array.isArray(j.signals) ? j.signals : [];
        if (!list.length) {
          const skip0 = j.skipped?.[0];
          setAutoTradeStatusKo((prev) =>
            typeof prev === 'string' && prev.startsWith('폭락감시윗꼬리')
              ? prev
              : `폭락감시윗꼬리 대기 · 감시존+윗꼬리+저항≥70+매도량3 · ${dwwLev}x · ${skip0?.reasonKo || j.hintKo || '스캔중'} · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          );
          return;
        }

        for (const sig of list) {
          if (!sig.signalId || !sig.symbol) continue;
          if (sig.direction !== 'SHORT') continue;
          if (!isAutoTradeSymbolEnabled(autoTradeCfg, sig.symbol)) continue;
          if (fired.has(sig.signalId) || wasAutoTradeSignalFired(sig.signalId)) {
            fired.add(sig.signalId);
            continue;
          }
          fired.add(sig.signalId);
          void executeUnifiedAnalysisEntry({
            mode,
            symbol: sig.symbol,
            timeframe: sig.timeframe || '15m',
            direction: 'SHORT',
            price: sig.entry,
            sl: sig.sl,
            tp: sig.tp1,
            source: 'dump-watch-wick',
            signalKo: sig.noteKo || '폭락감시윗꼬리숏',
            cfg: { ...autoTradeCfg, leverage: dwwLev },
            liveMark: sig.entry,
            signalId: sig.signalId,
            availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
            analysisTags: [
              'dump-watch-wick',
              `${dwwLev}x`,
              'SHORT',
              `저항${Math.round(sig.shortPct ?? 0)}`,
            ],
          }).then((r) => {
            if (!r.ok && !/기존 .+ 포지션|추가진입|한도|보유중/.test(r.msg)) {
              fired.delete(sig.signalId);
            }
            const chip = String(sig.symbol).replace('USDT', '');
            setAutoTradeStatusKo(
              r.ok
                ? `폭락감시윗꼬리 · ${chip}숏 · ${dwwLev}x · ${r.msg}`
                : `폭락감시윗꼬리 · ${chip} · ${r.msg}`
            );
          });
        }
      } catch {
        /* ignore network */
      }
    };

    void delayMs(5600).then(() => {
      if (!cancelled) void tick();
    });
    const ms = autoTradeCfg.liveArmed ? 32_000 : 48_000;
    const clear = setVisibleInterval(() => void tick(), ms);
    return () => {
      cancelled = true;
      clear();
    };
  }, [
    autoTradeOn,
    autoTradeCfg.enabled,
    autoTradeCfg.liveArmed,
    autoTradeCfg.leverage,
    autoTradeCfg.enabledSymbols,
    autoTradeCfg.strategyScalp,
  ]);

  /**
   * HTF 1h·4h·1d·1w·1M 폭락존 터치 → 롱/숏.
   * floor→롱 · ceiling→숏 · BTC/ETH/BNB/XRP/SOL 칩별 추가 · 기존 신호 유지.
   */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    if (!autoTradeCfg.strategyScalp) return;
    let cancelled = false;
    const fired = new Set<string>();
    const htfLev = resolveWick15mLeverage(autoTradeCfg.leverage);

    const tick = async () => {
      if (cancelled) return;
      try {
        const q = new URLSearchParams({
          symbol: 'ALL',
          leverage: String(htfLev),
        });
        const res = await fetch(`/api/merged-desk/htf-dump-touch-scan?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          signals?: Array<{
            signalId: string;
            symbol: string;
            timeframe: string;
            direction: 'LONG' | 'SHORT';
            entry: number;
            sl: number;
            tp1: number;
            noteKo: string;
            bandRole?: string;
          }>;
          skipped?: Array<{ symbol: string; reasonKo: string }>;
          hintKo?: string;
        };
        if (!j.ok) return;

        const virt = readVirtualTradeSession();
        const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
        if (!mode) {
          if (j.signals?.length) {
            setAutoTradeStatusKo('HTF폭락존 신호 · 실전/가상 ARM 필요');
          }
          return;
        }

        const list = Array.isArray(j.signals) ? j.signals : [];
        if (!list.length) {
          const skip0 = j.skipped?.[0];
          setAutoTradeStatusKo((prev) =>
            typeof prev === 'string' && prev.startsWith('HTF폭락존')
              ? prev
              : `HTF폭락존 대기 · 1h·4h·1d·1w·1M 터치 · ${htfLev}x · ${skip0?.reasonKo || j.hintKo || '스캔중'} · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          );
          return;
        }

        for (const sig of list) {
          if (!sig.signalId || !sig.symbol) continue;
          if (!isAutoTradeSymbolEnabled(autoTradeCfg, sig.symbol)) continue;
          if (fired.has(sig.signalId) || wasAutoTradeSignalFired(sig.signalId)) {
            fired.add(sig.signalId);
            continue;
          }
          fired.add(sig.signalId);
          void executeUnifiedAnalysisEntry({
            mode,
            symbol: sig.symbol,
            timeframe: sig.timeframe,
            direction: sig.direction,
            price: sig.entry,
            sl: sig.sl,
            tp: sig.tp1,
            source: 'htf-dump-touch',
            signalKo: sig.noteKo || 'HTF폭락존터치',
            cfg: { ...autoTradeCfg, leverage: htfLev },
            liveMark: sig.entry,
            signalId: sig.signalId,
            availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
            analysisTags: [
              'htf-dump-touch',
              sig.timeframe,
              `${htfLev}x`,
              sig.direction,
              sig.bandRole || '',
            ],
          }).then((r) => {
            if (!r.ok && !/기존 .+ 포지션|추가진입|한도|보유중/.test(r.msg)) {
              fired.delete(sig.signalId);
            }
            const chip = String(sig.symbol).replace('USDT', '');
            setAutoTradeStatusKo(
              r.ok
                ? `HTF폭락존 · ${chip}${sig.direction === 'LONG' ? '롱' : '숏'} · ${sig.timeframe} · ${r.msg}`
                : `HTF폭락존 · ${chip} · ${r.msg}`
            );
          });
        }
      } catch {
        /* ignore */
      }
    };

    void delayMs(6200).then(() => {
      if (!cancelled) void tick();
    });
    const ms = autoTradeCfg.liveArmed ? 55_000 : 75_000;
    const clear = setVisibleInterval(() => void tick(), ms);
    return () => {
      cancelled = true;
      clear();
    };
  }, [
    autoTradeOn,
    autoTradeCfg.enabled,
    autoTradeCfg.liveArmed,
    autoTradeCfg.leverage,
    autoTradeCfg.enabledSymbols,
    autoTradeCfg.strategyScalp,
  ]);

  /**
   * 폭락존 TF별 상승확정/하락확정 — BTC만 별도 진입 (3m·5m·15m).
   * 상승확정→롱 · 하락확정/저항확정→숏 · 존터치 · SL-20%ROE · TP+8%ROE.
   * ETH/BNB/XRP에는 적용하지 않음.
   */
  useEffect(() => {
    const engineOn = autoTradeOn || autoTradeCfg.enabled || autoTradeCfg.liveArmed;
    if (!engineOn) return;
    if (!autoTradeCfg.strategyScalp) return;
    if (!isAutoTradeSymbolEnabled(autoTradeCfg, 'BTCUSDT')) return;
    let cancelled = false;
    const fired = new Set<string>();

    const tick = async () => {
      if (cancelled) return;
      try {
        const q = new URLSearchParams({
          symbol: 'BTCUSDT',
          leverage: String(autoTradeCfg.leverage || 10),
        });
        const res = await fetch(`/api/merged-desk/dump-confirm-scan?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          signals?: Array<{
            signalId: string;
            symbol: string;
            timeframe: string;
            direction: 'LONG' | 'SHORT';
            entry: number;
            sl: number;
            tp1: number;
            noteKo: string;
            lifeKo?: string;
          }>;
          skipped?: Array<{ symbol: string; tf: string; reasonKo: string }>;
          hintKo?: string;
        };
        if (!j.ok) return;

        const virt = readVirtualTradeSession();
        const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
        if (!mode) {
          if (j.signals?.length) {
            setAutoTradeStatusKo('BTC폭락확정 신호 · 실전/가상 ARM 필요');
          }
          return;
        }

        const list = Array.isArray(j.signals) ? j.signals : [];
        if (!list.length) {
          const skip0 = j.skipped?.[0];
          setAutoTradeStatusKo((prev) =>
            typeof prev === 'string' && prev.startsWith('BTC폭락확정')
              ? prev
              : `BTC폭락확정 대기 · 3m·5m·15m 상승/하락확정+터치 · ${skip0?.reasonKo || j.hintKo || '스캔중'} · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          );
          return;
        }

        for (const sig of list) {
          if (!sig.signalId || !sig.symbol) continue;
          if (String(sig.symbol).toUpperCase() !== 'BTCUSDT') continue;
          if (fired.has(sig.signalId) || wasAutoTradeSignalFired(sig.signalId)) {
            fired.add(sig.signalId);
            continue;
          }
          fired.add(sig.signalId);
          void executeUnifiedAnalysisEntry({
            mode,
            symbol: 'BTCUSDT',
            timeframe: sig.timeframe,
            direction: sig.direction,
            entry: sig.entry,
            sl: sig.sl,
            tp1: sig.tp1,
            source: 'dump-confirm',
            signalKo: sig.noteKo || `BTC폭락${sig.lifeKo || '확정'}`,
            cfg: autoTradeCfg,
            liveMark: sig.entry,
            signalId: sig.signalId,
            availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
            analysisTags: ['dump-confirm', 'btc', sig.timeframe, sig.direction, sig.lifeKo || ''],
          }).then((r) => {
            if (!r.ok && !/기존 .+ 포지션|추가진입|한도|보유중/.test(r.msg)) {
              fired.delete(sig.signalId);
            }
            setAutoTradeStatusKo(
              r.ok
                ? `BTC폭락확정 · ${sig.direction === 'LONG' ? '롱' : '숏'} · ${sig.timeframe} · ${r.msg}`
                : `BTC폭락확정 · ${r.msg}`
            );
          });
        }
      } catch {
        /* ignore network */
      }
    };

    void delayMs(5200).then(() => {
      if (!cancelled) void tick();
    });
    const ms = autoTradeCfg.liveArmed ? 32_000 : 48_000;
    const clear = setVisibleInterval(() => void tick(), ms);
    return () => {
      cancelled = true;
      clear();
    };
  }, [
    autoTradeOn,
    autoTradeCfg.enabled,
    autoTradeCfg.liveArmed,
    autoTradeCfg.leverage,
    autoTradeCfg.enabledSymbols,
    autoTradeCfg.strategyScalp,
  ]);

  /** 독수리1호 CONFIRMED → 자동매매 실주문/페이퍼 기록 */
  useEffect(() => {
    if (!autoTradeOn || !autoTradeCfg.strategyDoksuri1 || !doksuri1Pack?.fact) return;
    if (!isAutoTradeSymbolEnabled(autoTradeCfg, symbol)) return;
    const fact = doksuri1Pack.fact;
    const action = fact.action;
    if (action !== 'CONFIRMED_LONG' && action !== 'CONFIRMED_SHORT') return;
    const dir: 'LONG' | 'SHORT' = action === 'CONFIRMED_LONG' ? 'LONG' : 'SHORT';
    const plan = dir === 'LONG' ? fact.longPlan : fact.shortPlan;
    if (plan.status === 'TOO_LATE' || plan.status === 'INVALID') return;
    if (plan.status !== 'READY' && plan.status !== 'ACTIVE' && plan.status !== 'WAIT_CONFIRMATION') {
      return;
    }
    const entry = plan.entry ?? plan.entryLow ?? plan.entryHigh;
    const px = liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? 0;
    if (!(entry != null && entry > 0) || !(px > 0)) return;
    const dist = Math.abs(px - entry) / entry;
    if (dist > 0.008) return; // 0.8% 이상 멀면 추격 금지
    const sl = plan.stopLoss != null ? Number(plan.stopLoss) : NaN;
    if (!(sl > 0)) return; // SL 필수
    const sig = `d1-${fact.factHash || ''}-${dir}`;
    if (!sig || doksuriLiveFiredRef.current === sig) return;
    doksuriLiveFiredRef.current = sig;
    const virt = readVirtualTradeSession();
    const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
    if (!mode) return;
    void executeUnifiedAnalysisEntry({
      mode,
      symbol,
      timeframe,
      direction: dir,
      price: px,
      sl,
      tp: plan.tp1,
      source: 'doksuri1',
      signalKo: '독수리1호 CONFIRMED',
      cfg: autoTradeCfg,
      liveMark: px,
      signalId: sig,
      availableUsdt: virt.equityUsdt,
    }).then((r) =>
      setAutoTradeStatusKo(`${mode === 'live' ? '실전' : '가상'} · 독수리 ${dir} · ${r.msg}`)
    );
  }, [
    autoTradeOn,
    autoTradeCfg,
    doksuri1Pack?.fact?.factHash,
    doksuri1Pack?.fact?.action,
    liveChartPrice,
    deskCandles,
    symbol,
    timeframe,
  ]);

  /** 플랜 진입가(E) 터치 자동진입 — 사용자 취소(차트 E/SL/TP·플랜 표시는 유지) */
  useEffect(() => {
    /* plan-touch 자동주문 OFF */
  }, []);

  /** 가상·실전 공통 · 앱 분석 일괄 스캔 진입 (폭락/핫존/스윙/로켓/4전략/독수리/플랜)
   * 익절·손절 후에도 flatCycle로 같은 봉 재스캔 · 연속 진입자리 탐색 */
  useEffect(() => {
    if (!autoTradeOn) return;
    const virt = readVirtualTradeSession();
    const mode = resolveUnifiedTradeMode(autoTradeCfg, virt.active);
    if (!mode) return;
    if (mode === 'virtual' && virt.position) return;
    if (deskCandles.length < 24) return;

    /** 익절 ARM 만료 → 전방향 분석 재개 */
    if (
      mode === 'virtual' &&
      virt.reentryWatch?.expiresAt != null &&
      Date.now() >= virt.reentryWatch.expiresAt
    ) {
      writeVirtualTradeSession({
        ...virt,
        reentryWatch: null,
        lastMsgKo: '재진입 ARM 만료 · 전방향 연속분석',
      });
    }

    const iClosed = Math.max(0, deskCandles.length - 2);
    const closedT = Number(deskCandles[iClosed]?.time) || 0;
    if (!(closedT > 0)) return;
    const flatCycle = virt.flatCycle || 0;
    /** 청산 사이클마다 같은 봉에서도 재스캔 허용 */
    const firedKey = `ua-${mode}-${symbol}-${timeframe}-${closedT}-c${flatCycle}`;
    if (analysisVirtFiredRef.current === firedKey) return;

    let geom: import('@/lib/mergedDeskBlueRedChannels').MergedDeskChannelGeom | null = null;
    try {
      if (blueRedChannelsOn && deskCandles.length >= 24) {
        const gs = buildMergedDeskBlueRedChannels(deskCandles, timeframe).geoms;
        geom = gs.find((g) => g.primary) ?? gs[0] ?? null;
      }
    } catch {
      geom = null;
    }

    const dumps =
      mtfDumpRegistry?.length
        ? mtfDumpRegistry
        : deskPackForChart?.mtfDumpPack?.zones ?? deskPack?.mtfDumpPack?.zones ?? [];
    const hot =
      deskPackForChart?.hotZoneEntry?.all ?? deskPack?.hotZoneEntry?.all ?? [];
    const swing = deskPackForChart?.swingMidEntry ?? deskPack?.swingMidEntry ?? null;
    const plan = deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan ?? null;
    const rocketNow = structureRocketDirectionOnLastCandle(
      (deferredAnalysisReady ? deferredAnalysis : analysis)?.structureRocketSignals,
      deskCandles,
      timeframe
    );
    const fact = doksuri1Pack?.fact;
    const dAction = fact?.action;
    const dPlan =
      dAction === 'CONFIRMED_LONG'
        ? fact?.longPlan
        : dAction === 'CONFIRMED_SHORT'
          ? fact?.shortPlan
          : null;
    const whaleBias: 'LONG' | 'SHORT' | 'NEUTRAL' | null = (() => {
      const o = deskWhaleBeamIntel?.oracle;
      if (o && o.longPct >= 58 && o.longPct > o.shortPct) return 'LONG';
      if (o && o.shortPct >= 58 && o.shortPct > o.longPct) return 'SHORT';
      const live = deskWhaleBeamIntel?.live;
      if (live?.beamKo === '롱빔') return 'LONG';
      if (live?.beamKo === '숏빔') return 'SHORT';
      return null;
    })();

    const scan = scanVirtualAnalysisEntries({
      symbol,
      timeframe,
      candles: deskCandles,
      leverage: autoTradeCfg.leverage || 10,
      tp1RoePct: autoTradeCfg.scalpTp1RoePct ?? 5,
      tp2RoePct: autoTradeCfg.scalpTp2RoePct ?? 10,
      dumpZones: dumps,
      hotZones: hot,
      swingMid: swing,
      activePlan: plan,
      structureRocketSignals: (deferredAnalysisReady ? deferredAnalysis : analysis)?.structureRocketSignals,
      rocketDir: rocketNow,
      geom,
      doksuriAction: dAction ?? null,
      doksuriEntry: dPlan?.entry ?? dPlan?.entryLow ?? null,
      doksuriSl: dPlan?.stopLoss ?? null,
      doksuriTp: dPlan?.tp1 ?? null,
      whaleBias,
      livePrice: liveChartPrice,
    });

    const modeKo = mode === 'live' ? '실전' : '가상';
    if (!scan.best) {
      setVirtAnalysisStripKo(`${modeKo} · ${scan.stripKo} · 연속탐색`);
      return;
    }

    if (mode === 'virtual') {
      const flatCd = isVirtualPostFlatCooldown(virt);
      if (flatCd.cooling) {
        setVirtAnalysisStripKo(
          `${modeKo} · 청산후 쿨다운 ${flatCd.remainSec}s · ${scan.stripKo}`
        );
        return;
      }
      const gate = canVirtualReentryNow(scan.best.entry, scan.best.side);
      if (!gate.ok) {
        setVirtAnalysisStripKo(`${modeKo} · ${gate.reasonKo} · ${scan.stripKo}`);
        return; // firedKey 미기록 → 틱마다 재검사
      }
    }

    setVirtAnalysisStripKo(
      `${modeKo} · Dual초단·품질(BTC/ETH/SOL/XRP) · 구경로차단 · ${scan.stripKo}`
    );
    return;
  }, [
    autoTradeOn,
    autoTradeCfg,
    deskCandles,
    symbol,
    timeframe,
    liveChartPrice,
    blueRedChannelsOn,
    mtfDumpRegistry,
    deskPackForChart,
    deskPack,
    deferredAnalysisReady,
    deferredAnalysis,
    analysis,
    doksuri1Pack?.fact?.factHash,
    doksuri1Pack?.fact?.action,
    deskWhaleBeamIntel,
    virtTradeSession.position,
    virtTradeSession.flatCycle,
    virtTradeSession.lastFlatAt,
    virtTradeSession.reentryWatch?.cooldownUntil,
  ]);

  /** 가상 · TP1/러너/본절 · 재진입 extreme · 청산 후 연속스캔 트리거 */
  useEffect(() => {
    const px = liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? 0;
    if (!(px > 0)) return;
    const before = readVirtualTradeSession();
    if (!before.active) return;
    const hadPos = Boolean(before.position);
    if (before.position) {
      maybeVirtualSlBeforeTp1(px);
      maybeVirtualTp1Half(px, 0.5);
      maybeVirtualRunnerOrBeClose(px);
    } else if (before.reentryWatch) {
      touchVirtualReentryExtreme(px);
    }
    const after = readVirtualTradeSession();
    if (hadPos && !after.position) {
      /** 익절/손절 → fired 해제 · React 동기화 → 연속 분석 */
      analysisVirtFiredRef.current = '';
      setVirtTradeSession(after);
      setAutoTradeStatusKo(after.lastMsgKo || '청산 · 연속분석 재개');
      setVirtAnalysisStripKo('청산 · 연속분석 · 진입자리 탐색중');
    } else if (after.lastMsgKo !== before.lastMsgKo) {
      setVirtTradeSession(after);
    }
  }, [liveChartPrice, deskCandles, symbol]);

  /** 가상세션 이벤트 → 패널/스캔 동기 */
  useEffect(() => {
    const sync = () => {
      const s = readVirtualTradeSession();
      setVirtTradeSession(s);
      if (!s.position) {
        analysisVirtFiredRef.current = '';
      }
    };
    window.addEventListener(VIRTUAL_TRADE_EVENT, sync);
    return () => window.removeEventListener(VIRTUAL_TRADE_EVENT, sync);
  }, []);

  /** 가상·실전 공통 · 분~월 스스로 감시 · RR≥2 & ROE 5~7% → 진입 */
  useEffect(() => {
    if (!autoTradeOn && !autoTradeCfg.liveArmed && !autoTradeCfg.enabled) return;
    const mode = resolveUnifiedTradeMode(autoTradeCfg);
    if (!mode) return;
    if (!isAutoTradeSymbolEnabled(autoTradeCfg, symbol)) return;
    let cancelled = false;
    const ac = new AbortController();
    const tick = async () => {
      if (cancelled) return;
      if (mode === 'virtual') {
        const virt = readVirtualTradeSession();
        if (!virt.active || virt.position) return;
      }
      try {
        const { tryVirtualMtfEntry } = await import('@/lib/mergedDeskVirtualMtfWatcher');
        const r = await tryVirtualMtfEntry({
          symbol,
          source: 'bitget',
          signal: ac.signal,
        });
        if (cancelled) return;
        if (r.entered) {
          setAutoTradeStatusKo(r.msg);
          setVirtTradeSession(readVirtualTradeSession());
        } else if (r.msg && !r.msg.includes('이미')) {
          setAutoTradeStatusKo(`MTF감시 · ${r.msg}`);
        }
      } catch {
        /* ignore */
      }
    };
    void delayMs(1800).then(() => {
      if (!cancelled) void tick();
    });
    const clear = setVisibleInterval(() => void tick(), 20_000);
    return () => {
      cancelled = true;
      ac.abort();
      clear();
    };
  }, [autoTradeOn, autoTradeCfg.liveArmed, autoTradeCfg.enabled, symbol]);

  useEffect(() => {
    autoScalpClosedStepRef.current = 0;
    autoScalpPrevRef.current = null;
    setAutoScalpTrade(null);
    setAutoScalpStripKo('자동초단 · 대기');
    doksuriLiveFiredRef.current = '';
  }, [symbol, timeframe]);

  /** 차트 심볼 교체해도 실전 ARM·ETH/BTC 선물 칩 유지 */
  useEffect(() => {
    const before = readAutoTradeConfig();
    if (!before.liveArmed && !before.enabled && !autoTradeOn) return;
    const healed = ensureAutoTradeSymbolEnabled(before, symbol);
    if (healed.updatedAt !== before.updatedAt || healed.enabled !== autoTradeCfg.enabled) {
      setAutoTradeCfg(healed);
      if (healed.liveArmed || healed.enabled) {
        setAutoTradeOn(true);
        saveSettings({ chartMergedDeskAutoTradeEnabled: true });
      }
    }
  }, [symbol]);

  /** E/SL/TP 접근·터치 → 기록부 */
  useEffect(() => {
    const px = liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? 0;
    if (!(px > 0)) return;
    const key = `${symbol}|${timeframe}|${px.toFixed(1)}|${deskPackForChart?.practiceAiPlan?.state ?? ''}`;
    if (tradeJournalScanRef.current === key) return;
    tradeJournalScanRef.current = key;
    scanTradePlanJournalTouches({
      symbol,
      chartTf: timeframe,
      price: px,
      lastCandle: deskCandles[deskCandles.length - 1] ?? null,
      plan: deskPackForChart?.activeTradePlan ?? null,
      practiceAi: deskPackForChart?.practiceAiPlan ?? null,
    });
  }, [
    symbol,
    timeframe,
    liveChartPrice,
    deskCandles,
    deskPackForChart?.activeTradePlan,
    deskPackForChart?.practiceAiPlan,
  ]);

  /** 캔들 tone · AI ZONE % · N봉 결과 → 기록부 (Phase1+2) */
  useEffect(() => {
    const px = liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? 0;
    if (!(px > 0) || deskCandles.length < 4) return;
    const last = deskCandles[deskCandles.length - 1];
    const key = `${symbol}|${timeframe}|${Number(last?.time)}|${px.toFixed(1)}|${aiZonePack?.ghostResist?.mid ?? ''}|${aiZonePack?.activeSupport?.mid ?? ''}|${deskPackForChart?.rbCorridorPaint?.side ?? ''}`;
    if (signalJournalScanRef.current === key) return;
    signalJournalScanRef.current = key;
    scanMergedDeskSignalJournal({
      symbol,
      chartTf: timeframe,
      candles: deskCandles,
      price: px,
      aiZonePack,
      activeTradePlan: deskPackForChart?.activeTradePlan ?? null,
      practiceAi: deskPackForChart?.practiceAiPlan ?? null,
      dumpZones: deskPackForChart?.mtfDumpPack?.zones ?? null,
      analyzeVerdict: analysis?.verdict ?? null,
      volumeAiZonePack,
      scalp200Plan: scalp200On ? deskPackForChart?.scalp200Plan ?? null : null,
      scalp200SourceTf: timeframe,
      analysis: deferredAnalysisReady ? deferredAnalysis : analysis,
      corridorPaint: deskPackForChart?.rbCorridorPaint ?? null,
      rbStance: deskPackForChart?.rbStance ?? null,
      rbLiveHub: deskPackForChart?.rbLiveHub ?? null,
      masterFutures: deskPackForChart?.masterFutures ?? deskPack?.masterFutures ?? null,
      institutionalBandOn,
      blueRedChannelsOn,
      mtfDumpOn,
      learningFlags: {
        mtfDumpOn,
        institutionalBandOn,
        blueRedChannelsOn,
        scalp200On,
        practiceAiOn,
        aiZoneOn: aiAnalysisZoneOn,
        volumeAiOn: Boolean(volumeAiZonePack),
        whaleDnaOn: bitgetVolumeDeskOn,
      },
      doksuriMeta: doksuri1Pack?.fact
        ? {
            factHash: doksuri1Pack.fact.factHash,
            dominantSide: doksuri1Pack.fact.dominantSide,
            bigMoneyState: doksuri1Pack.fact.bigMoneyState,
          }
        : null,
    });
  }, [
    symbol,
    timeframe,
    liveChartPrice,
    deskCandles,
    aiZonePack,
    volumeAiZonePack,
    deskPackForChart?.activeTradePlan,
    deskPackForChart?.practiceAiPlan,
    deskPackForChart?.mtfDumpPack?.zones,
    deskPackForChart?.scalp200Plan,
    deskPackForChart?.rbCorridorPaint,
    deskPackForChart?.rbStance,
    deskPackForChart?.rbLiveHub,
    deskPackForChart?.masterFutures,
    deskPack?.masterFutures,
    analysis?.verdict,
    deferredAnalysis,
    doksuri1Pack?.fact?.factHash,
    doksuri1Pack?.fact?.dominantSide,
    doksuri1Pack?.fact?.bigMoneyState,
    deferredAnalysisReady,
    scalp200On,
    institutionalBandOn,
    blueRedChannelsOn,
    mtfDumpOn,
    practiceAiOn,
    aiAnalysisZoneOn,
    bitgetVolumeDeskOn,
  ]);

  /** AIZONE·매도/매수면 → 자동진입 게이트용 스냅샷 (전코인 롱·숏) */
  useEffect(() => {
    const px = liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? 0;
    if (!(px > 0)) return;
    const overlays = deskPackForChart?.overlays ?? deskPack?.overlays ?? [];
    const faces = extractFacesFromOverlays(overlays);
    const tfFaces = extractTfFacesFromOverlays(overlays);
    const ghost = aiZonePack?.ghostResist ?? null;
    const support = aiZonePack?.activeSupport ?? null;
    const sellFace =
      faces.sellFace ??
      (ghost && ghost.upper > ghost.lower
        ? {
            kind: 'sell' as const,
            lo: ghost.lower,
            hi: ghost.upper,
            mid: ghost.mid,
            labelKo: 'AI저항면',
          }
        : null);
    const buyFace =
      faces.buyFace ??
      (support && support.upper > support.lower
        ? {
            kind: 'buy' as const,
            lo: support.lower,
            hi: support.upper,
            mid: support.mid,
            labelKo: 'AI지지면',
          }
        : null);
    let nextResist: number | null = null;
    if (ghost && ghost.lower > px) nextResist = ghost.lower;
    else if (sellFace && sellFace.lo > px) nextResist = sellFace.lo;
    let nextSupport: number | null = null;
    if (support && support.upper < px) nextSupport = support.upper;
    else if (buyFace && buyFace.hi < px) nextSupport = buyFace.hi;
    const fromClass = overlays.some((o) =>
      /volumeHeavy|거래과다/.test(
        `${o.overlayZoneExtraClass || ''} ${o.zoneFaceSignal || ''} ${o.label || ''}`
      )
    );
    const extremeRng = computeExtremeRangeFromCandles(deskCandles, 48);
    const rocketNow = structureRocketDirectionOnLastCandle(
      (deferredAnalysisReady ? deferredAnalysis : analysis)?.structureRocketSignals,
      deskCandles,
      timeframe
    );
    let institutionalBias = extractInstitutionalBiasFromOverlays(overlays);
    if (!institutionalBias) {
      const stMeta = computeInstitutionalSuperTrendMeta(deskCandles);
      if (stMeta?.lastDir === 'long') institutionalBias = 'LONG';
      else if (stMeta?.lastDir === 'short') institutionalBias = 'SHORT';
    }
    const dumps =
      mtfDumpRegistry?.length
        ? mtfDumpRegistry
        : deskPackForChart?.mtfDumpPack?.zones ?? deskPack?.mtfDumpPack?.zones ?? [];
    const dumpDeclineNear = detectDumpDeclineNear(px, dumps);
    const htfKo = tfFaces.htfFace?.labelKo;
    writeAiZoneEntrySnapshot({
      symbol,
      timeframe,
      updatedAt: Date.now(),
      price: px,
      longPct: aiZonePack?.longPct ?? null,
      shortPct: aiZonePack?.shortPct ?? null,
      sellFace,
      buyFace,
      longZone:
        support && support.upper > support.lower
          ? {
              kind: 'buy' as const,
              lo: support.lower,
              hi: support.upper,
              mid: support.mid,
              labelKo: '롱구간',
            }
          : buyFace,
      shortZone:
        ghost && ghost.upper > ghost.lower
          ? {
              kind: 'sell' as const,
              lo: ghost.lower,
              hi: ghost.upper,
              mid: ghost.mid,
              labelKo: '숏구간',
            }
          : sellFace,
      nextResist,
      nextSupport,
      volumeHeavy: fromClass || detectVolumeHeavyFromCandles(deskCandles),
      rangeLo: extremeRng?.rangeLo ?? null,
      rangeHi: extremeRng?.rangeHi ?? null,
      swingLow: extremeRng?.swingLow ?? null,
      swingHigh: extremeRng?.swingHigh ?? null,
      htfFace: tfFaces.htfFace,
      chartFace: tfFaces.chartFace,
      institutionalBias,
      rocketDir: rocketNow,
      dumpDeclineNear,
      noteKo: aiZonePack
        ? `AIZONE 롱${aiZonePack.longPct ?? '—'}%·숏${aiZonePack.shortPct ?? '—'}% · ${htfKo || '면—'} · 기관${institutionalBias || '—'} · 로켓${rocketNow || '—'} · 진입≥70(거래량+구간≥67) · 확정아님`
        : `AIZONE스냅 · ${htfKo || '면—'}`,
    });
  }, [
    symbol,
    timeframe,
    liveChartPrice,
    deskCandles,
    aiZonePack,
    deskPackForChart?.overlays,
    deskPack?.overlays,
    deskPackForChart?.mtfDumpPack?.zones,
    deskPack?.mtfDumpPack?.zones,
    mtfDumpRegistry,
    analysis,
    deferredAnalysis,
    deferredAnalysisReady,
  ]);

  /** AI200 확정 zone → 레지스트리 (LTF 전환해도 유지) */
  useEffect(() => {
    if (!scalp200On) return;
    const zones = deskPackForChart?.ai200ZonePack?.zones;
    if (!zones?.length) return;
    const sig = zones.map((z) => `${z.sourceTf}:${z.direction}:${z.entry.toFixed(2)}`).join('|');
    if (ai200PersistRef.current === sig) return;
    ai200PersistRef.current = sig;
    const updated = persistAi200ZoneRegistry(symbol, zones);
    setAi200Registry(updated);
  }, [scalp200On, deskPackForChart?.ai200ZonePack?.zones, symbol]);

  /** 200x 상태 전환 → 기록부 (ARMED/FIRE/MISSED/INVALID) */
  useEffect(() => {
    if (!scalp200On) {
      scalp200JournalStateRef.current = '';
      return;
    }
    const pack = deskPackForChart?.scalp200Plan;
    if (!pack || pack.direction === 'NEUTRAL' || !(pack.entry > 0)) return;
    const px = liveChartPrice ?? deskCandles[deskCandles.length - 1]?.close ?? 0;
    if (!(px > 0)) return;
    const prev = scalp200JournalStateRef.current || null;
    if (pack.state === prev) return;
    scanScalp200JournalEvents({
      symbol,
      chartTf: timeframe,
      prevState: prev,
      state: pack.state,
      direction: pack.direction,
      entry: pack.entry,
      stopLoss: pack.stopLoss,
      price: px,
      entryAllowed: pack.entryAllowed,
      gatesPassed: pack.gatesPassed,
      gatesTotal: pack.gatesTotal,
      rr: pack.rr,
      actualLeverage: pack.actualLeverage,
      journalTouchOk: pack.journalTouchOk,
    });
    scalp200JournalStateRef.current = pack.state;
  }, [
    scalp200On,
    symbol,
    timeframe,
    liveChartPrice,
    deskCandles,
    deskPackForChart?.scalp200Plan,
  ]);

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
    const clear = setVisibleInterval(() => void load(), 75_000);
    return () => {
      cancelled = true;
      clear();
    };
  }, [superAiOn, zoneBattleRange?.bot, zoneBattleRange?.top, symbol, timeframe, learningOverlayTick]);

  const aiZoneClickDetail = useMemo(() => {
    if (!aiAnalysisZoneOn || !aiZonePack || !selectedMirageZoneId) return null;
    if (!String(selectedMirageZoneId).startsWith('eagle1-ai-zone--')) return null;
    return buildEagle1AiZoneClickDetail({
      pack: aiZonePack,
      zoneId: selectedMirageZoneId,
      currentPrice: liveChartPrice,
    });
  }, [aiAnalysisZoneOn, aiZonePack, selectedMirageZoneId, liveChartPrice]);

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

  const strategyChips = deskPackForChart?.meta?.strategy ?? deskPack?.meta?.strategy;
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

  useEffect(() => {
    if (!fsActive) {
      setAiMarketZoneCardOpen(false);
      return;
    }
    if (pendingAmzCardRef.current) {
      pendingAmzCardRef.current = false;
      setAiMarketZoneCardOpen(true);
    }
  }, [fsActive]);

  const openAiMarketZoneCard = useCallback(() => {
    if (!aiMarketZoneOn) {
      setAiMarketZoneOn(true);
      saveSettings({ chartMergedDeskAiMarketZoneEnabled: true });
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    }
    if (!fsActive) {
      pendingAmzCardRef.current = true;
      void toggleChartFullscreen();
      return;
    }
    setAiMarketZoneCardOpen((v) => !v);
  }, [aiMarketZoneOn, fsActive]);

  /** Eagle1 HUD: 전체화면에서만 차트 플로트 TF·ZONE·POC (일반 화면은 툴바·헤더 유지) */
  /** 전체화면은 상단 mergedChartToolbar 다줄 레이아웃만 사용 — 차트 위 float 칩은 겹침 유발 */
  const useChartFloatZoneTools = false;
  const hideTextStrips = mergedDeskHideTextStrips();
  const hideMobileSituation = mergedDeskHideMobileSituationBar();
  const hideMobileChartHtmlLabels = mergedDeskHideMobileChartHtmlLabels();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (isMobileViewport && hideMobileChartHtmlLabels) {
      html.classList.add('merged-desk-mobile-labels-off');
      document.body.classList.add('merged-desk-mobile-labels-off');
    } else {
      html.classList.remove('merged-desk-mobile-labels-off');
      document.body.classList.remove('merged-desk-mobile-labels-off');
    }
    return () => {
      html.classList.remove('merged-desk-mobile-labels-off');
      document.body.classList.remove('merged-desk-mobile-labels-off');
    };
  }, [isMobileViewport, hideMobileChartHtmlLabels]);

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

  const toggleAvwap = () => {
    setAvwapOn((v) => {
      const next = !v;
      saveSettings({
        chartMergedDeskAnchoredVwapEnabled: next,
        ...(next ? {} : { chartMergedDeskAvwapPlaceArmed: false }),
      });
      if (!next) setAvwapPlaceArmed(false);
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      return next;
    });
  };

  const toggleAvwapHtf = () => {
    setAvwapHtf((cur) => {
      const next = cur === '1w' ? '1d' : '1w';
      saveSettings({ chartMergedDeskAnchoredVwapHtf: next });
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      return next;
    });
  };

  const toggleAvwapPlace = () => {
    setAvwapPlaceArmed((v) => {
      const next = !v;
      saveSettings({
        chartMergedDeskAvwapPlaceArmed: next,
        ...(next
          ? {
              chartMergedDeskAnchoredVwapEnabled: true,
              chartMergedDeskAvwapUserPinsHidden: false,
              chartMergedDeskAvwapAutoExtremeEnabled: false,
            }
          : {}),
      });
      if (next) {
        setAvwapOn(true);
        setAvwapUserHidden(false);
      }
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      return next;
    });
  };

  const toggleAvwapUserHidden = () => {
    setAvwapUserHidden((v) => {
      const next = !v;
      saveSettings({ chartMergedDeskAvwapUserPinsHidden: next });
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      return next;
    });
  };

  const toggleAvwapPinSelect = (id: string) => {
    setAvwapSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveSettings({ chartMergedDeskAvwapSelectedPinIds: next });
      return next;
    });
  };

  const deleteSelectedAvwapPins = () => {
    const cur = normalizeAvwapUserPins(loadSettings().chartMergedDeskAvwapUserPins);
    const selected = new Set(
      (loadSettings().chartMergedDeskAvwapSelectedPinIds || []).map(String).filter(Boolean)
    );
    if (!selected.size) return;
    const next = removeAvwapUserPinsByIds(cur, [...selected]);
    saveSettings({
      chartMergedDeskAvwapUserPins: next,
      chartMergedDeskAvwapSelectedPinIds: [],
    });
    setAvwapUserPins(next);
    setAvwapSelectedIds([]);
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  };

  const clearAvwapUserPins = () => {
    saveSettings({
      chartMergedDeskAvwapUserPins: [],
      chartMergedDeskAvwapSelectedPinIds: [],
      chartMergedDeskAvwapPlaceArmed: false,
      chartMergedDeskAvwapUserPinsHidden: false,
    });
    setAvwapPlaceArmed(false);
    setAvwapUserHidden(false);
    setAvwapUserPins([]);
    setAvwapSelectedIds([]);
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  };

  const openChartSettings = useCallback(() => {
    setMergedChartSettingsOpen(true);
  }, []);

  const restoreChartView = useCallback(() => {
    const fn = chartSnapshotRef?.current?.restoreDefaultChartView;
    if (typeof fn === 'function') {
      fn();
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(MERGED_DESK_RESTORE_VIEW_EVENT));
    }
  }, [chartSnapshotRef]);

  const saveChartView = useCallback(() => {
    const fn = chartSnapshotRef?.current?.saveChartView;
    if (typeof fn === 'function') {
      fn();
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(MERGED_DESK_SAVE_VIEW_EVENT));
    }
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

  const shell = (
    <div
      className={`${styles.mergedDesk}${panelsOpen ? '' : ` ${styles.mergedDeskChartFirst}`}${fsActive ? ` ${styles.mergedDeskChartFs}` : ''}${telegramCaptureMode ? ` ${styles.mergedDeskTelegramCapture}` : ''}${isMobileViewport ? ` ${styles.mergedDeskMobile}` : ` ${styles.mergedDeskDesktop}`}`}
      data-theme={theme}
      data-merged-tone={aiToneOn ? 'ai' : 'classic'}
      data-layout={isMobileViewport ? 'mobile' : 'desktop'}
      data-panels-open={panelsOpen ? '1' : '0'}
    >
      {!fsActive && (
        <header className={styles.mergedDeskHeader} hidden={wrapEagle1Hud || undefined}>
          <div>
            <div className={styles.mergedDeskTitle}>ARES · 스윙 차트</div>
            <div className={styles.mergedDeskSub}>
              {symbol} · {timeframe} · {candleSourceKo} — 롱/숏 구간 · zone · 채널 · 캔들 신호 (1~7일+)
            </div>
          </div>
          <UIModeSwitcher
            uiMode={uiMode}
            setUiMode={onUiModeChange}
            fullscreenActive={fsActive}
            onFullscreenClick={() => void toggleChartFullscreen()}
          />
        </header>
      )}

      <div className={styles.mergedDeskBody}>
        <div
          ref={chartColRef}
          className={`${styles.mergedChartCol}${fsActive ? ` ${styles.mergedChartColFullscreen} ${styles.mergedChartColFsOnly} is-css-chart-fullscreen` : ''}${mobileFsActive ? ` ${styles.mergedChartColMobileFs}` : ''}`}
          data-mobile-panel={isMobileViewport ? mobilePanelMode : undefined}
          data-eagle1-chart-fs-root="1"
        >
          {(wrapEagle1Hud || shareMergedServerChart) && (
            <div className={styles.modeFsStrip} data-eagle1-mode-fs="1">
              <UIModeSwitcher compact uiMode={uiMode} setUiMode={onUiModeChange} />
              <button
                type="button"
                className={`${styles.modeFsPrimaryBtn}${fsActive ? ` ${styles.chartFsBtnActive}` : ''}`}
                data-eagle1-fs-chip="strip"
                data-merged-fs-chip="1"
                onClick={() => void toggleChartFullscreen()}
                title={fsActive ? '일반 화면으로 돌아가기' : '차트 전체화면'}
              >
                {fsActive ? '일반화면' : '⛶ 전체화면'}
              </button>
              <button
                type="button"
                className={styles.modeFsZoneBtn}
                data-on={classicZoneOn ? '1' : '0'}
                title="★·Money·HQ 클래식 zone (AI ZONE과 독립)"
                onClick={() => toggleClassicZone()}
              >
                ZONE
              </button>
              <button
                type="button"
                className={styles.modeFsZoneBtn}
                data-on={aiAnalysisZoneOn && practiceAiOn ? '1' : '0'}
                title="AI ZONE + 실전AI — AI존·실전AI지지×N·확률라벨 한 번에 ON/OFF"
                onClick={() => toggleAiZone()}
              >
                {aiAnalysisZoneOn && practiceAiOn ? 'AI ZONE' : 'AI존'}
              </button>
              <button
                type="button"
                className={styles.modeFsZoneBtn}
                data-on={scalp200On ? '1' : '0'}
                title="200x 타점 — zone 면 + 가격선 (폭락구간형, 조건부)"
                onClick={() => {
                  const next = !scalp200On;
                  setScalp200On(next);
                  saveSettings({ chartMergedDeskScalp200Enabled: next });
                  setChartDisplayTick((v) => v + 1);
                }}
              >
                {scalp200On ? '200x ON' : '200x'}
              </button>
            </div>
          )}
          <div
            className={`${styles.mergedChartToolbar}${fsActive ? ` ${styles.mergedChartToolbarFs}` : ''}${isMobileViewport ? ` ${styles.mergedChartToolbarMobileFs}` : ''}${aiAnalysisZoneOn ? ` ${styles.mergedChartToolbarAiZone}` : ''}`}
            {...(wrapEagle1Hud && !shareMergedServerChart
              ? ({ 'data-eagle1-desk-toolbar': '1' } as const)
              : ({ 'data-merged-ares-toolbar': '1' } as const))}
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
              <button
                type="button"
                className={`tool-chip tool-chip-button ${patternSilhouetteOn ? 'tool-chip-active' : ''}`}
                title="패턴 실루엣·피봇 스탬프 (카드 없음). 진입/손절/목표 가격선과 함께 표시"
                onClick={() => {
                  const next = !patternSilhouetteOn;
                  setPatternSilhouetteOn(next);
                  saveSettings({ chartMergedDeskPatternSilhouetteEnabled: next });
                }}
                style={{ fontWeight: 800 }}
              >
                {patternSilhouetteOn ? '실루엣 ON' : '실루엣'}
              </button>
              {/** TF 줄 우측 — 자동매매·POC·뷰저장·뷰복원·전체화면·도구·차트조절 */}
              <div className={styles.tfToolbarTuneCluster} aria-label="차트조절">
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${autoTradeOn || autoTradePanelOpen ? 'tool-chip-active' : ''} ${styles.autoTradePocChip}`}
                  data-merged-auto-trade-chip="poc-side"
                  title="자동매매 — 가상/실전 동일 분석 · 매매창 열기"
                  onClick={() => {
                    const next = !autoTradeOn;
                    setAutoTradeOn(next);
                    saveSettings({ chartMergedDeskAutoTradeEnabled: next });
                    const cfg = writeAutoTradeConfig({ enabled: next });
                    setAutoTradeCfg(cfg);
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    setAutoTradePanelOpen(true);
                    if (!next) {
                      setAutoScalpPaperOn(false);
                      setAutoScalpCardOpen(false);
                      saveSettings({ chartMergedDeskAutoScalpPaperEnabled: false });
                    }
                  }}
                >
                  <span className={styles.autoTradePocChipPulse} data-on={autoTradeOn ? '1' : '0'} />
                  자동매매
                  {autoTradeOn ? (autoTradeCfg.liveArmed ? '·실전' : '·가상') : ''}
                </button>
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${vrvpPocExtend === 'extend20' ? 'tool-chip-active' : ''}`}
                  data-merged-poc-chip="1"
                  title="POC 최다거래 막대: 짧게 ↔ 마지막+20봉 연장"
                  onClick={() => {
                    const next = vrvpPocExtend === 'extend20' ? 'short' : 'extend20';
                    setVrvpPocExtend(next);
                    saveSettings({ chartMergedDeskVrvpPocExtend: next });
                  }}
                  style={{
                    fontWeight: 800,
                    borderColor: 'rgba(250,204,21,0.55)',
                    color: '#fde047',
                    flexShrink: 0,
                    padding: '5px 8px',
                    fontSize: 11,
                  }}
                >
                  POC{vrvpPocExtend === 'extend20' ? '+20' : '짧게'}
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  data-merged-view-chip="save"
                  onClick={saveChartView}
                  title="지금 화면 봉 폭·비율 저장 — 1m~1M 전환 시 동일 비율 공동 적용"
                  style={{
                    fontWeight: 800,
                    borderColor: 'rgba(56,189,248,0.6)',
                    color: '#bae6fd',
                    flexShrink: 0,
                    padding: '5px 8px',
                    fontSize: 11,
                  }}
                >
                  뷰저장
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  data-merged-view-chip="restore"
                  onClick={restoreChartView}
                  title="저장한 화면 비율을 현재 TF에 복원 — 분·시·일·주·월 공동"
                  style={{
                    fontWeight: 800,
                    borderColor: 'rgba(74,222,128,0.55)',
                    color: '#bbf7d0',
                    flexShrink: 0,
                    padding: '5px 8px',
                    fontSize: 11,
                  }}
                >
                  뷰복원
                </button>
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${fsActive ? 'tool-chip-active' : ''}`}
                  data-merged-fs-chip="1"
                  data-eagle1-fs-chip="toolbar"
                  onClick={() => void toggleChartFullscreen()}
                  title={fsActive ? '일반 화면으로 돌아가기' : '차트 전체화면'}
                  style={{
                    fontWeight: 800,
                    borderColor: fsActive ? 'rgba(251,146,60,0.7)' : 'rgba(148,163,184,0.5)',
                    color: fsActive ? '#fdba74' : '#e2e8f0',
                    background: fsActive ? 'rgba(234,88,12,0.2)' : undefined,
                    flexShrink: 0,
                    padding: '5px 8px',
                    fontSize: 11,
                  }}
                >
                  {fsActive ? '일반화면' : '전체화면'}
                </button>
                {!isMobileViewport && (
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${desktopToolsOpen ? 'tool-chip-active' : ''} ${styles.desktopToolsToggle}`}
                    onClick={toggleDesktopTools}
                    title={
                      desktopToolsOpen
                        ? '기능 칩 숨기기 (도구 OFF) — 차트만 보기'
                        : '기능 칩 펼치기 (도구 ON)'
                    }
                    style={{
                      fontWeight: 900,
                      borderColor: desktopToolsOpen
                        ? 'rgba(56,189,248,0.65)'
                        : 'rgba(148,163,184,0.45)',
                      color: desktopToolsOpen ? '#bae6fd' : '#e2e8f0',
                      background: desktopToolsOpen ? 'rgba(14,165,233,0.16)' : undefined,
                      flexShrink: 0,
                      padding: '5px 8px',
                      fontSize: 11,
                    }}
                  >
                    {desktopToolsOpen ? '도구OFF' : '도구'}
                  </button>
                )}
                {isMobileViewport && (
                  <>
                    <button
                      type="button"
                      className={`tool-chip tool-chip-button ${mobileDiagramOpen && cycleProgressOn ? 'tool-chip-active' : ''} ${styles.mobileDiagramToggle}`}
                      onClick={toggleMobileDiagram}
                      title={
                        mobileDiagramOpen && cycleProgressOn
                          ? '학파 도식 OFF — 칩·도식 닫기'
                          : '학파 도식 ON — 와이코프~터틀 칩 (도구와 따로)'
                      }
                      style={{
                        fontWeight: 900,
                        borderColor:
                          mobileDiagramOpen && cycleProgressOn
                            ? 'rgba(196,181,253,0.75)'
                            : 'rgba(148,163,184,0.45)',
                        color: mobileDiagramOpen && cycleProgressOn ? '#ddd6fe' : '#e2e8f0',
                        background:
                          mobileDiagramOpen && cycleProgressOn
                            ? 'rgba(139,92,246,0.22)'
                            : undefined,
                        flexShrink: 0,
                        padding: '5px 8px',
                        fontSize: 11,
                      }}
                    >
                      {mobileDiagramOpen && cycleProgressOn ? '도식OFF' : '도식'}
                    </button>
                    <button
                      type="button"
                      className={`tool-chip tool-chip-button ${mobileToolsOpen ? 'tool-chip-active' : ''} ${styles.mobileToolsToggle}`}
                      onClick={toggleMobileTools}
                      title={
                        mobileToolsOpen
                          ? '기능 칩 전부 닫기 (도구 OFF)'
                          : '기능 칩 펼치기 — 도식과 따로, 겹치지 않음'
                      }
                      style={{
                        fontWeight: 900,
                        borderColor: mobileToolsOpen
                          ? 'rgba(248,113,113,0.65)'
                          : 'rgba(148,163,184,0.45)',
                        color: mobileToolsOpen ? '#fecaca' : '#e2e8f0',
                        background: mobileToolsOpen ? 'rgba(239,68,68,0.18)' : undefined,
                        flexShrink: 0,
                        padding: '5px 8px',
                        fontSize: 11,
                      }}
                    >
                      {mobileToolsOpen ? '도구OFF' : '도구'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${mergedChartSettingsOpen ? 'tool-chip-active' : ''}`}
                  onClick={openChartSettings}
                  title="차트조절 — 폭락 라벨 좌중우·글자·존색·표시"
                  style={{
                    fontWeight: 800,
                    borderColor: 'rgba(96,165,250,0.65)',
                    color: mergedChartSettingsOpen ? '#bfdbfe' : '#93c5fd',
                    background: mergedChartSettingsOpen ? 'rgba(37,99,235,0.22)' : 'rgba(30,58,138,0.25)',
                    flexShrink: 0,
                    padding: '5px 10px',
                    fontSize: 11,
                  }}
                >
                  차트조절
                </button>
              </div>
            </div>
            <div className={styles.mergedToolbarActions}>
              {mobileFsActive && (
                <button
                  type="button"
                  className={`fullscreen-btn ${styles.chartFsBtn} ${styles.chartFsBtnActive} ${styles.chartFsBtnMobile}`}
                  data-merged-fs-chip="1"
                  data-eagle1-fs-chip="strip"
                  onClick={() => void toggleChartFullscreen()}
                  title="일반 화면으로 돌아가기"
                >
                  일반화면
                </button>
              )}
              {toolsPanelOpen && (
              <div
                className={isMobileViewport ? styles.mergedMobileToolsPanel : styles.mergedToolbarActionsInline}
                data-merged-mobile-tools={isMobileViewport ? '1' : undefined}
                {...(isMobileViewport
                  ? {
                      onTouchStart: (e: { stopPropagation: () => void }) => e.stopPropagation(),
                      onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
                    }
                  : {})}
              >
              <div className={styles.mergedToolsPanelHead}>
                <strong>기능 메뉴</strong>
                <span>전부 유지 · 숨김 없음 · 스크롤</span>
              </div>
              <div className={styles.mergedToolGroup} role="group" aria-label="존">
              <span className={styles.mergedToolGroupLabel}>존</span>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${classicZoneOn ? 'tool-chip-active' : ''}`}
                onClick={() => toggleClassicZone()}
                title="★·Money·HQ 클래식 zone (AI ZONE과 독립)"
                style={{
                  fontWeight: 800,
                  borderColor: classicZoneOn ? 'rgba(250,204,21,0.55)' : 'rgba(148,163,184,0.4)',
                  color: classicZoneOn ? '#fde68a' : undefined,
                }}
              >
                ZONE
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${aiAnalysisZoneOn && practiceAiOn ? 'tool-chip-active' : ''}`}
                onClick={() => toggleAiZone()}
                title="AI ZONE + 실전AI — AI존·실전AI지지×N·확률라벨 한 번에 ON/OFF"
                style={{
                  fontWeight: 900,
                  borderColor: aiAnalysisZoneOn ? 'rgba(74,222,128,0.75)' : 'rgba(148,163,184,0.4)',
                  color: aiAnalysisZoneOn ? '#bbf7d0' : undefined,
                  background:
                    aiAnalysisZoneOn
                      ? 'linear-gradient(90deg, rgba(34,197,94,0.28), rgba(59,130,246,0.2))'
                      : undefined,
                }}
              >
                AI ZONE
              </button>
              {aiAnalysisZoneOn ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#bbf7d0',
                    padding: '2px 6px',
                    borderRadius: 6,
                    border: '1px solid rgba(74,222,128,0.35)',
                  }}
                  title="AI ZONE 면 클릭 → 겹친 분석·확률·현물% 카드"
                >
                  AI존 클릭
                </span>
              ) : null}
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
              </div>
              <div className={styles.mergedToolGroup} role="group" aria-label="VWAP·실전·폭락">
              <span className={styles.mergedToolGroupLabel}>실전</span>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${avwapOn ? 'tool-chip-active' : ''}`}
                onClick={toggleAvwap}
                title="Anchored VWAP 표시 ON/OFF — 자동(일/주 절대고·저) + 찍기 핀 · 소스 고가+시가"
                style={{
                  fontWeight: 800,
                  borderColor: avwapOn ? 'rgba(74,222,128,0.65)' : undefined,
                  color: avwapOn ? '#bbf7d0' : undefined,
                  background: avwapOn ? 'rgba(34,197,94,0.14)' : undefined,
                }}
              >
                AVWAP
              </button>
              {avwapOn ? (
                <>
                  <button
                    type="button"
                    className="tool-chip tool-chip-button tool-chip-active"
                    onClick={toggleAvwapHtf}
                    title="자동 앵커 상위 TF: 일봉 ↔ 주봉"
                    style={{
                      fontWeight: 800,
                      borderColor: 'rgba(56,189,248,0.55)',
                      color: '#bae6fd',
                      background: 'rgba(14,165,233,0.14)',
                    }}
                  >
                    {avwapHtf === '1w' ? '앵커주' : '앵커일'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${avwapPlaceArmed ? 'tool-chip-active' : ''}`}
                    onClick={toggleAvwapPlace}
                    title="ON(찍기중)일 때만 차트 클릭 → 그 봉부터 고가·시가 AVWAP (TradingView 앵커). OFF면 클릭해도 안 찍힘. 위=고·아래=저"
                    style={{
                      fontWeight: 800,
                      borderColor: avwapPlaceArmed ? 'rgba(251,191,36,0.75)' : 'rgba(148,163,184,0.45)',
                      color: avwapPlaceArmed ? '#fef08a' : undefined,
                      background: avwapPlaceArmed
                        ? 'rgba(245,158,11,0.22)'
                        : undefined,
                    }}
                  >
                    {avwapPlaceArmed ? '찍기중' : 'AVWAP찍기'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${avwapAutoExtreme ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !avwapAutoExtreme;
                      setAvwapAutoExtreme(next);
                      saveSettings({ chartMergedDeskAvwapAutoExtremeEnabled: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="자동 절대고·저 탐색선 ON/OFF (기본 OFF — 수동 찍기만, TradingView식)"
                    style={{
                      fontWeight: 700,
                      borderColor: avwapAutoExtreme
                        ? 'rgba(248,113,113,0.55)'
                        : 'rgba(100,116,139,0.45)',
                      color: avwapAutoExtreme ? '#fecaca' : '#94a3b8',
                    }}
                  >
                    {avwapAutoExtreme ? '자동극값ON' : '자동극값'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${evidenceZonesOn ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !evidenceZonesOn;
                      setEvidenceZonesOn(next);
                      saveSettings({ chartMergedDeskEvidenceZonesEnabled: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="여러 분석이 3개 이상 겹친 구간만 지지/저항 zone (피보 선 대신 · 조건부)"
                    style={{
                      fontWeight: 800,
                      borderColor: evidenceZonesOn
                        ? 'rgba(56,189,248,0.75)'
                        : 'rgba(100,116,139,0.45)',
                      color: evidenceZonesOn ? '#7dd3fc' : '#94a3b8',
                      background: evidenceZonesOn ? 'rgba(14,165,233,0.16)' : undefined,
                    }}
                  >
                    {evidenceZonesOn ? '합류존ON' : '합류존'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${practiceAiOn && aiAnalysisZoneOn ? 'tool-chip-active' : ''}`}
                    onClick={() => toggleAiZone()}
                    title="실전 AI — 안착×합류존×ActiveTrade×AVWAP 통계 → 대기/감시/확정/놓침 + E/SL/TP (조건부)"
                    style={{
                      fontWeight: 800,
                      borderColor: practiceAiOn && aiAnalysisZoneOn
                        ? 'rgba(251,191,36,0.75)'
                        : 'rgba(100,116,139,0.45)',
                      color: practiceAiOn && aiAnalysisZoneOn ? '#fde68a' : '#94a3b8',
                      background: practiceAiOn && aiAnalysisZoneOn ? 'rgba(245,158,11,0.14)' : undefined,
                    }}
                  >
                    {practiceAiOn && aiAnalysisZoneOn
                      ? `실전AI·${deskPackForChart?.practiceAiPlan?.stateKo ?? 'ON'}`
                      : '실전AI'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${scalp200On ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !scalp200On;
                      setScalp200On(next);
                      saveSettings({ chartMergedDeskScalp200Enabled: next });
                      setChartDisplayTick((v) => v + 1);
                    }}
                    title="200x 타점 — zone 면 + 가격선 (폭락구간형, 조건부)"
                    style={{
                      fontWeight: 800,
                      borderColor: scalp200On ? 'rgba(45,212,191,0.85)' : 'rgba(100,116,139,0.45)',
                      color: scalp200On ? '#5eead4' : '#94a3b8',
                      background: scalp200On ? 'rgba(45,212,191,0.14)' : undefined,
                    }}
                  >
                    {scalp200On
                      ? deskPackForChart?.ai200ZonePack?.zones?.length
                        ? `AI200·${deskPackForChart.ai200ZonePack.zones.length}`
                        : `AI200·${deskPackForChart?.scalp200Plan?.zoneLife?.lifeKo ?? 'ON'}`
                      : '200x'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${mtfDumpOn ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      /** 끔 → MTF전체(기본) → 경로1세트 → 끔 */
                      if (!mtfDumpOn) {
                        setMtfDumpOn(true);
                        setMtfDumpDisplayMode('mtf');
                        saveSettings({
                          chartMergedDeskMtfDumpZoneEnabled: true,
                          chartMergedDeskMtfDumpDisplayMode: 'mtf',
                        });
                      } else if (mtfDumpDisplayMode === 'mtf') {
                        setMtfDumpDisplayMode('path');
                        saveSettings({ chartMergedDeskMtfDumpDisplayMode: 'path' });
                      } else {
                        setMtfDumpOn(false);
                        saveSettings({ chartMergedDeskMtfDumpZoneEnabled: false });
                      }
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="폭락: MTF=TF전체 존(기본) · 경로=지지→반등→저항 1세트 · 다시 누르면 끔"
                    style={{
                      fontWeight: 800,
                      borderColor: mtfDumpOn
                        ? mtfDumpDisplayMode === 'path'
                          ? 'rgba(74,222,128,0.75)'
                          : 'rgba(248,113,113,0.75)'
                        : 'rgba(100,116,139,0.45)',
                      color: mtfDumpOn
                        ? mtfDumpDisplayMode === 'path'
                          ? '#bbf7d0'
                          : '#fecaca'
                        : '#94a3b8',
                      background: mtfDumpOn
                        ? mtfDumpDisplayMode === 'path'
                          ? 'rgba(20,83,45,0.22)'
                          : 'rgba(127,29,29,0.18)'
                        : undefined,
                    }}
                  >
                    {!mtfDumpOn
                      ? '폭락'
                      : mtfDumpDisplayMode === 'path'
                        ? '폭락경로'
                        : `폭락MTF·${deskPackForChart?.mtfDumpPack?.zones?.length ?? 0}`}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${tradeShowInvLabel ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !tradeShowInvLabel;
                      setTradeShowInvLabel(next);
                      saveSettings({ chartMergedDeskTradeShowInvalidLabel: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="무효 라벨 표시/숨김"
                  >
                    {tradeShowInvLabel ? '무효ON' : '무효OFF'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${tradeShowTp23 ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !tradeShowTp23;
                      setTradeShowTp23(next);
                      saveSettings({ chartMergedDeskTradeShowTp2Tp3: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="TP2·TP3 라벨 표시/숨김"
                  >
                    {tradeShowTp23 ? 'TP23ON' : 'TP23OFF'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${tradeApproachPulse ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !tradeApproachPulse;
                      setTradeApproachPulse(next);
                      saveSettings({ chartMergedDeskTradeApproachPulse: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="E/SL/TP 접근 시 축·선 반짝"
                  >
                    {tradeApproachPulse ? '접근반짝ON' : '접근반짝'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${tradeTpCelebrate ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !tradeTpCelebrate;
                      setTradeTpCelebrate(next);
                      saveSettings({ chartMergedDeskTradeTpCelebrate: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="TP1/2/3 터치 시 🎆 표시 + 기록"
                  >
                    {tradeTpCelebrate ? 'TP축하ON' : 'TP축하'}
                  </button>
                  <button
                    type="button"
                    className="tool-chip tool-chip-button"
                    onClick={() => {
                      downloadTradeEventJournal(symbol);
                      void syncTradeEventJournalToServer().then((r) => {
                        if (r.ok) {
                          setPracticeLogNote(`기록부 v3·서버동기 ${r.merged ?? 0}건`);
                        } else {
                          setPracticeLogNote('기록부 JSON 저장됨');
                        }
                        window.setTimeout(() => setPracticeLogNote(''), 2200);
                      });
                    }}
                    title="신호·합류·N봉결과 v3 JSON + 서버 merge (로그인 시)"
                  >
                    기록부↓
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${avwapFibOn ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !avwapFibOn;
                      setAvwapFibOn(next);
                      saveSettings({ chartMergedDeskAvwapFibEnabled: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="피보·GP·헌팅 선/면 (기본 OFF · 지저분하면 끄고 합류존 사용)"
                    style={{
                      fontWeight: 700,
                      borderColor: avwapFibOn
                        ? 'rgba(74,222,128,0.55)'
                        : 'rgba(100,116,139,0.45)',
                      color: avwapFibOn ? '#bbf7d0' : '#94a3b8',
                    }}
                  >
                    {avwapFibOn ? '피보선ON' : '피보선'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${vwapPoiBandOn ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !vwapPoiBandOn;
                      setVwapPoiBandOn(next);
                      saveSettings({ chartMergedDeskVwapPoiBandEnabled: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="AVWAP 고가↔시가 POI 밴드 면 (기존 선 유지)"
                    style={{
                      fontWeight: 700,
                      borderColor: vwapPoiBandOn
                        ? 'rgba(167,139,250,0.65)'
                        : 'rgba(100,116,139,0.45)',
                      color: vwapPoiBandOn ? '#ddd6fe' : '#94a3b8',
                    }}
                  >
                    {vwapPoiBandOn ? 'POI밴드ON' : 'POI밴드'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${sessionVwapOn ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !sessionVwapOn;
                      setSessionVwapOn(next);
                      saveSettings({ chartMergedDeskSessionVwapEnabled: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="UTC 세션 VWAP (Anchored와 병행 · 기존 AVWAP 유지)"
                    style={{
                      fontWeight: 700,
                      borderColor: sessionVwapOn
                        ? 'rgba(250,204,21,0.65)'
                        : 'rgba(100,116,139,0.45)',
                      color: sessionVwapOn ? '#fef08a' : '#94a3b8',
                    }}
                  >
                    {sessionVwapOn ? '세션VWAPON' : '세션VWAP'}
                  </button>
                  {avwapUserPins.length > 0 ? (
                    <>
                      {avwapUserPins.map((p) => {
                        const sel = avwapSelectedIds.includes(p.id);
                        const tfShort =
                          p.anchorTf === '1w'
                            ? '주'
                            : p.anchorTf === '1d'
                              ? '일'
                              : p.anchorTf || '';
                        const label = `${p.n}${p.role === 'high' ? '고' : '저'}${tfShort ? `·${tfShort}` : ''}`;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className={`tool-chip tool-chip-button ${sel ? 'tool-chip-active' : ''}`}
                            onClick={() => toggleAvwapPinSelect(p.id)}
                            title={`${p.n}번 ${p.role === 'high' ? '고점' : '저점'}(${p.anchorTf || '?'}) 선택. 선택 후 「선택삭제」 · 하위 TF는 찍은 TF 경로 유지`}
                            style={{
                              fontWeight: 800,
                              minWidth: 36,
                              borderColor: sel
                                ? p.role === 'high'
                                  ? 'rgba(74,222,128,0.75)'
                                  : 'rgba(56,189,248,0.75)'
                                : 'rgba(148,163,184,0.4)',
                              color: sel ? (p.role === 'high' ? '#bbf7d0' : '#bae6fd') : '#e2e8f0',
                              background: sel
                                ? p.role === 'high'
                                  ? 'rgba(34,197,94,0.2)'
                                  : 'rgba(14,165,233,0.2)'
                                : 'rgba(15,23,42,0.55)',
                              opacity: p.hidden || avwapUserHidden ? 0.45 : 1,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="tool-chip tool-chip-button"
                        onClick={deleteSelectedAvwapPins}
                        disabled={avwapSelectedIds.length === 0}
                        title="선택한 1·2번…만 삭제 (미선택 시 비활성)"
                        style={{
                          fontWeight: 800,
                          color: avwapSelectedIds.length ? '#fecaca' : '#64748b',
                          borderColor: avwapSelectedIds.length
                            ? 'rgba(248,113,113,0.55)'
                            : 'rgba(71,85,105,0.4)',
                          opacity: avwapSelectedIds.length ? 1 : 0.55,
                        }}
                      >
                        선택삭제{avwapSelectedIds.length ? `(${avwapSelectedIds.length})` : ''}
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${avwapUserHidden ? 'tool-chip-active' : ''}`}
                        onClick={toggleAvwapUserHidden}
                        title="찍은 AVWAP 전부 숨김/표시"
                        style={{
                          fontWeight: 800,
                          borderColor: avwapUserHidden
                            ? 'rgba(148,163,184,0.55)'
                            : 'rgba(167,139,250,0.55)',
                          color: avwapUserHidden ? '#cbd5e1' : '#ddd6fe',
                          background: avwapUserHidden
                            ? 'rgba(71,85,105,0.25)'
                            : 'rgba(139,92,246,0.14)',
                        }}
                      >
                        {avwapUserHidden ? '찍기숨김' : '찍기표시'}
                      </button>
                      <button
                        type="button"
                        className="tool-chip tool-chip-button"
                        onClick={clearAvwapUserPins}
                        title="찍은 AVWAP 전부 삭제"
                        style={{ fontWeight: 700, color: '#fca5a5', borderColor: 'rgba(248,113,113,0.45)' }}
                      >
                        전부삭제
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                className={`tool-chip tool-chip-button ${blueRedChannelsOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !blueRedChannelsOn;
                  setBlueRedChannelsOn(next);
                  if (next) {
                    setRbVolSyncOn(true);
                    setAdvVolumeOn(true);
                    setRbHatchMode('on');
                    setWavePathOn(true);
                    saveSettings({
                      chartMergedDeskBlueRedChannelsEnabled: true,
                      chartMergedDeskWavePathEnabled: true,
                      chartMergedDeskRbVolumeSyncEnabled: true,
                      chartMergedDeskAdvVolumeEnabled: true,
                      chartVolumeIntelligence: true,
                      chartVolumeRvolTiers: true,
                      chartMergedDeskRbHatchMode: 'on',
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
                파랑빨강띠
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${parallelChannelEngineOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !parallelChannelEngineOn;
                  setParallelChannelEngineOn(next);
                  saveSettings({ chartMergedDeskParallelChannelEngineEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="평행채널 · 마감 피벗에 고정 · 형성봉에는 안 움직임 · 새 스윙이나 점수 차이가 커질 때만 교체 · 진입 아님"
                style={{
                  fontWeight: 800,
                  borderColor: parallelChannelEngineOn ? 'rgba(59,130,246,0.55)' : undefined,
                  background: parallelChannelEngineOn
                    ? 'linear-gradient(90deg, rgba(59,130,246,0.2), rgba(161,161,170,0.14))'
                    : undefined,
                }}
              >
                평행채널
              </button>
              {blueRedChannelsOn ? (
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${wavePathOn ? 'tool-chip-active' : ''}`}
                  onClick={() => {
                    const next = !wavePathOn;
                    setWavePathOn(next);
                    saveSettings({ chartMergedDeskWavePathEnabled: next });
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                  }}
                  title="파동 이동경로 · 충격1–5/ZigZag/Flat 매칭 → 눌림·저항·다음경로 점선(확정 아님)"
                  style={{
                    fontWeight: 700,
                    borderColor: wavePathOn ? 'rgba(56,189,248,0.55)' : undefined,
                    background: wavePathOn
                      ? 'linear-gradient(90deg, rgba(56,189,248,0.18), rgba(167,139,250,0.14))'
                      : undefined,
                  }}
                >
                  파동경로
                </button>
              ) : null}
              {blueRedChannelsOn ? (
                <span
                  title="채널 박스권: 롱/숏색 · 테두리만·연·중·진 · 농도슬라이더 · 망 · ON/OFF는 파랑빨강띠 칩"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    flexWrap: 'wrap',
                    padding: '2px 6px',
                    borderRadius: 8,
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: 'rgba(15,23,42,0.72)',
                  }}
                >
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#94a3b8' }}>
                    롱
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(rbBullHex) ? rbBullHex : '#22C55E'}
                      onChange={(e) => {
                        const hex = e.target.value.toUpperCase();
                        setRbBullHex(hex);
                        saveSettings({ chartMergedDeskRbBullHex: hex });
                        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                      }}
                      title="롱(상승) 통로 배경색"
                      style={{ width: 22, height: 18, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    />
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#94a3b8' }}>
                    숏
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(rbBearHex) ? rbBearHex : '#EF4444'}
                      onChange={(e) => {
                        const hex = e.target.value.toUpperCase();
                        setRbBearHex(hex);
                        saveSettings({ chartMergedDeskRbBearHex: hex });
                        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                      }}
                      title="숏(하락) 통로 배경색"
                      style={{ width: 22, height: 18, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    />
                  </label>
                  {(
                    [
                      { v: 0, label: '테두리', tip: '면 없음 · 윤곽만 (무색)' },
                      { v: 8, label: '연', tip: '아주 연한 면' },
                      { v: 14, label: '중', tip: '기본 농도' },
                      { v: 28, label: '진', tip: '진한 면' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.v}
                      type="button"
                      className="tool-chip tool-chip-button"
                      onClick={() => {
                        setRbFillOpacity(p.v);
                        saveSettings({ chartMergedDeskRbFillOpacity: p.v });
                        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                      }}
                      title={p.tip}
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        minWidth: 28,
                        padding: '1px 5px',
                        borderColor:
                          rbFillOpacity === p.v
                            ? 'rgba(125,211,252,0.65)'
                            : 'rgba(71,85,105,0.45)',
                        color: rbFillOpacity === p.v ? '#e0f2fe' : '#94a3b8',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#94a3b8' }}>
                    농도
                    <input
                      type="range"
                      min={0}
                      max={48}
                      value={rbFillOpacity}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setRbFillOpacity(n);
                        saveSettings({ chartMergedDeskRbFillOpacity: n });
                        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                      }}
                      title="0=테두리만 · 높을수록 진함 · 롱/숏 색칩으로 색 조절"
                      style={{ width: 56 }}
                    />
                    <span style={{ fontSize: 9, color: '#64748b', minWidth: 18 }}>{rbFillOpacity}</span>
                  </label>
                  {(
                    [
                      { id: 'off' as const, label: '망OFF', tip: '통로 안 빗금 없음(권장·박스권 선명)' },
                      { id: 'soft' as const, label: '망연', tip: '아주 연한 빗금' },
                      { id: 'on' as const, label: '망ON', tip: '기존 빗금 망' },
                    ] as const
                  ).map((h) => {
                    const on = rbHatchMode === h.id;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        className={`tool-chip tool-chip-button ${on ? 'tool-chip-active' : ''}`}
                        onClick={() => {
                          setRbHatchMode(h.id);
                          saveSettings({ chartMergedDeskRbHatchMode: h.id });
                          window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                        }}
                        title={h.tip}
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          minWidth: 36,
                          padding: '1px 5px',
                          borderColor: on
                            ? 'rgba(167,139,250,0.65)'
                            : 'rgba(71,85,105,0.45)',
                          color: on ? '#ddd6fe' : '#94a3b8',
                        }}
                      >
                        {h.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${rbSmcPoisOn ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !rbSmcPoisOn;
                      setRbSmcPoisOn(next);
                      saveSettings({ chartMergedDeskRbSmcPoisEnabled: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title={
                      rbSmcPoisOn
                        ? '超级채널SMC ON — 롱/숏통로·MB/OB터치·측정선·상위TF MSB정렬 (참고)'
                        : '超级채널SMC — 돈되는자리 작도'
                    }
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      minWidth: 64,
                      padding: '1px 6px',
                      borderColor: rbSmcPoisOn
                        ? 'rgba(250,204,21,0.7)'
                        : 'rgba(71,85,105,0.45)',
                      color: rbSmcPoisOn ? '#fef08a' : '#94a3b8',
                      background: rbSmcPoisOn
                        ? 'linear-gradient(90deg, rgba(34,197,94,0.18), rgba(250,204,21,0.14))'
                        : undefined,
                    }}
                  >
                    {rbSmcPoisOn ? '超级MSB ON' : '超级MSB'}
                  </button>
                  <button
                    type="button"
                    className={`tool-chip tool-chip-button ${thisMuchOn ? 'tool-chip-active' : ''}`}
                    onClick={() => {
                      const next = !thisMuchOn;
                      setThisMuchOn(next);
                      saveSettings({ chartMergedDeskThisMuchEnabled: next });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    }}
                    title="요만큼·이만큼 세트존 — 시안A 네온마젠타 · TF별 채널·MB/OB 구조"
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      minWidth: 56,
                      padding: '1px 6px',
                      borderColor: thisMuchOn
                        ? 'rgba(255,46,182,0.8)'
                        : 'rgba(71,85,105,0.45)',
                      color: thisMuchOn ? '#ff9ad8' : '#94a3b8',
                      background: thisMuchOn ? 'rgba(255,46,182,0.16)' : undefined,
                    }}
                  >
                    {thisMuchOn ? '요이만ON' : '요이만'}
                  </button>
                </span>
              ) : null}
              {(
                [
                  { id: 'scalp' as const, label: '단타', tip: '파랑빨강띠·단타 — 단기채널·POC·수급 반응 가중' },
                  { id: 'swing' as const, label: '스윙', tip: '파랑빨강띠·스윙 — 단기·장기 균형·POC 연동' },
                  { id: 'mid' as const, label: '중투', tip: '파랑빨강띠·중투 — 장기채널·POC 구조 가중' },
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
              </div>
              <div className={styles.mergedToolGroup} role="group" aria-label="학파·채널">
              <span className={styles.mergedToolGroupLabel}>학파</span>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${cycleProgressOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !cycleProgressOn;
                  setCycleProgressOn(next);
                  saveSettings({ chartMergedDeskCycleProgressEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                  if (isMobileViewport) {
                    if (next) {
                      setMobileToolsOpen(false);
                      setMobileDiagramOpen(true);
                    } else {
                      setMobileDiagramOpen(false);
                      setSchematicOpen(null);
                    }
                  }
                }}
                title="지금자리 학파 도식(와이코프~터틀) · 상단 학파 칩 클릭 · 폰은「도식」칩과 동기"
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
              </div>
              <div className={styles.mergedToolGroup} role="group" aria-label="작도·밴드">
              <span className={styles.mergedToolGroupLabel}>작도</span>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${institutionalBandOn ? 'tool-chip-active' : ''}`}
                onClick={toggleInstitutionalBand}
                title="기관밴드 — 초록/빨강 계단선 + 존상 빨강점선·존하 파랑점선 + CP·LinReg 점선 · ST 구름"
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
              <button
                type="button"
                className={`tool-chip tool-chip-button ${aiMarketZoneOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !aiMarketZoneOn;
                  setAiMarketZoneOn(next);
                  saveSettings({ chartMergedDeskAiMarketZoneEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                  if (!next) setAiMarketZoneCardOpen(false);
                }}
                title={
                  aiMarketZoneLive?.liveValidation?.summaryKo
                    ? `AI Market Zone · ${aiMarketZoneLive.statusKo} · ${aiMarketZoneLive.liveValidation.summaryKo} · 확정 아님`
                    : 'AI Market Zone · 면+가격선 · 기존 zone 무터치'
                }
                style={{
                  fontWeight: 800,
                  borderColor: aiMarketZoneOn ? 'rgba(59,130,246,0.65)' : undefined,
                  background: aiMarketZoneOn
                    ? 'linear-gradient(90deg, rgba(34,197,94,0.18), rgba(59,130,246,0.2), rgba(239,68,68,0.16))'
                    : undefined,
                }}
              >
                AI존엔진
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${aiMarketZoneCardOpen ? 'tool-chip-active' : ''}`}
                onClick={() => openAiMarketZoneCard()}
                title="전체화면에서 차트 우측 AI존 카드 열기 · 일반 레이아웃은 그대로"
                style={{
                  fontWeight: 800,
                  borderColor: aiMarketZoneCardOpen ? 'rgba(96,165,250,0.7)' : 'rgba(96,165,250,0.35)',
                  color: aiMarketZoneCardOpen ? '#bfdbfe' : undefined,
                }}
              >
                AI존카드
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
                className={`tool-chip tool-chip-button ${featureStatsOpen ? 'tool-chip-active' : ''}`}
                onClick={() => setFeatureStatsOpen((v) => !v)}
                title="캔들·카드 기능 통계 시뮬 — 지지/저항·거래량·안착·반등·현물% (확정 아님)"
                style={{
                  fontWeight: 800,
                  borderColor: featureStatsOpen ? 'rgba(56,189,248,0.7)' : 'rgba(56,189,248,0.4)',
                  color: featureStatsOpen ? '#7dd3fc' : undefined,
                }}
              >
                통계
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${patternMemoryCardOpen ? 'tool-chip-active' : ''}`}
                onClick={() => setPatternMemoryCardOpen((v) => !v)}
                title="패턴기억 · 롱숏 — 유사구간 이후 상승/하락 투표·기울기 · WAIT·기울기 참고 · 확정수익 아님"
                style={{
                  fontWeight: 800,
                  borderColor: patternMemoryCardOpen ? 'rgba(167,139,250,0.75)' : 'rgba(167,139,250,0.4)',
                  color: patternMemoryCardOpen ? '#ddd6fe' : undefined,
                }}
              >
                패턴기억
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${autoTradeOn || autoTradePanelOpen ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !autoTradeOn;
                  setAutoTradeOn(next);
                  saveSettings({ chartMergedDeskAutoTradeEnabled: next });
                  const cfg = writeAutoTradeConfig({ enabled: next });
                  setAutoTradeCfg(cfg);
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                  setAutoTradePanelOpen(true);
                  /** 초단 카드/페이퍼 HUD 강제 ON 금지 — 차트 기능 가림 방지 */
                  if (!next) {
                    setAutoScalpPaperOn(false);
                    setAutoScalpCardOpen(false);
                    saveSettings({ chartMergedDeskAutoScalpPaperEnabled: false });
                  }
                }}
                title="자동매매 창 — Bitget API·레버리지·독수리1호 롱/숏·초단 · 실주문은 ARM+키"
                style={{
                  fontWeight: 800,
                  borderColor:
                    autoTradeOn && autoTradeCfg.liveArmed
                      ? 'rgba(248,113,113,0.85)'
                      : autoTradeOn
                        ? 'rgba(251,191,36,0.75)'
                        : 'rgba(251,191,36,0.35)',
                  color:
                    autoTradeOn && autoTradeCfg.liveArmed
                      ? '#fca5a5'
                      : autoTradeOn
                        ? '#fde68a'
                        : undefined,
                }}
              >
                자동매매
              </button>
              {autoTradeOn || autoTradePanelOpen ? (
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${autoTradePanelOpen ? 'tool-chip-active' : ''}`}
                  onClick={() => setAutoTradePanelOpen((v) => !v)}
                  title="매매창 표시/숨김 — 숨겨도 가상·실전 신호 연결 유지"
                  style={{ fontSize: 11, fontWeight: 800 }}
                >
                  {autoTradePanelOpen ? '매매창닫기' : '매매창'}
                </button>
              ) : null}
              <button
                type="button"
                className={`tool-chip tool-chip-button ${autoScalpPaperOn ? 'tool-chip-active' : ''}`}
                onClick={() => {
                  const next = !autoScalpPaperOn;
                  setAutoScalpPaperOn(next);
                  saveSettings({ chartMergedDeskAutoScalpPaperEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                  if (next) setAutoScalpCardOpen(true);
                }}
                title="자동초단 페이퍼 — 폭락터치→SFP→로켓→TP1 55%+본절→TP2 · ROE 7/10%캡"
                style={{
                  fontWeight: 800,
                  borderColor: autoScalpPaperOn ? 'rgba(56,189,248,0.75)' : 'rgba(56,189,248,0.35)',
                  color: autoScalpPaperOn ? '#7dd3fc' : undefined,
                }}
              >
                자동초단
              </button>
              {autoScalpPaperOn ? (
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${autoScalpCardOpen ? 'tool-chip-active' : ''}`}
                  onClick={() => setAutoScalpCardOpen((v) => !v)}
                  title="자동초단 상태 카드"
                  style={{ fontSize: 11 }}
                >
                  초단상태
                </button>
              ) : null}
              <button
                type="button"
                className={`tool-chip tool-chip-button ${statsHudOn ? 'tool-chip-active' : 'tool-chip-off'}`}
                onClick={() => {
                  const next = !statsHudOn;
                  setStatsHudOn(next);
                  saveSettings({ chartMergedDeskStatsHudEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="차트 위 통계HUD — 지지/저항·거래량·안착 + FVG/OB/CHoCH 칩 ON/OFF"
              >
                통계HUD {statsHudOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${chartFvgOn ? 'tool-chip-active' : 'tool-chip-off'}`}
                onClick={() => {
                  const next = !chartFvgOn;
                  setChartFvgOn(next);
                  saveSettings({ chartMergedDeskChartFvgEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="차트 FVG 존 ON/OFF"
              >
                FVG {chartFvgOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${doksuri1BriefingOn ? 'tool-chip-active' : 'tool-chip-off'}`}
                onClick={() => {
                  const next = !doksuri1BriefingOn;
                  setDoksuri1BriefingOn(next);
                  saveSettings({ chartMergedDeskDoksuri1BriefingEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="독수리1호 전황 — 텔레그램·카드 전문 (구조·고래·지도·양맵·LIVE). OFF면 예전 짧은 알림"
              >
                독수리전황 {doksuri1BriefingOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${chartObOn ? 'tool-chip-active' : 'tool-chip-off'}`}
                onClick={() => {
                  const next = !chartObOn;
                  setChartObOn(next);
                  saveSettings({ chartMergedDeskChartObEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="차트 Order Block ON/OFF"
              >
                OB {chartObOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${chartChochOn ? 'tool-chip-active' : 'tool-chip-off'}`}
                onClick={() => {
                  const next = !chartChochOn;
                  setChartChochOn(next);
                  saveSettings({ chartMergedDeskChartChochEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="차트 CHoCH(구조전환) ON/OFF"
              >
                CHoCH {chartChochOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${chartBosOn ? 'tool-chip-active' : 'tool-chip-off'}`}
                onClick={() => {
                  const next = !chartBosOn;
                  setChartBosOn(next);
                  saveSettings({ chartMergedDeskChartBosEnabled: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                title="차트 BOS(구조돌파) ON/OFF"
              >
                BOS {chartBosOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${surgeDeskOpen ? 'tool-chip-active' : 'tool-chip-off'}`}
                onClick={() => setSurgeDeskOpen((v) => !v)}
                title="급등코인 스캔 창구 — 종목 클릭 시 지금 통합분석"
                style={
                  surgeDeskOpen
                    ? {
                        borderColor: 'rgba(251,191,36,0.75)',
                        color: '#fde68a',
                        background: 'rgba(251,191,36,0.16)',
                        fontWeight: 800,
                      }
                    : undefined
                }
              >
                급등 {surgeDeskOpen ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${btccionDrawOn ? 'tool-chip-active' : 'tool-chip-off'}`}
                onClick={toggleBtccionDraw}
                title="btccion 스타일 캔들 작도 — 반응띠·돌파·무효·헌트·MB·경로·빔 (카드 없음)"
              >
                btccion작도 {btccionDrawOn ? 'ON' : 'OFF'}
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
              </div>
              <div className={styles.mergedToolGroup} role="group" aria-label="표시">
              <span className={styles.mergedToolGroupLabel}>표시</span>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${overlayLabelsOn ? 'tool-chip-active' : 'tool-chip-off'}`}
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
                  borderColor: overlayLabelsOn ? 'rgba(74,222,128,0.65)' : 'rgba(248,113,113,0.55)',
                  color: overlayLabelsOn ? '#bbf7d0' : '#fecaca',
                  background: overlayLabelsOn ? 'rgba(34,197,94,0.2)' : 'rgba(127,29,29,0.25)',
                }}
              >
                라벨 {overlayLabelsOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${rightAxisPricesOn ? 'tool-chip-active' : 'tool-chip-off'}`}
                title="우측 가격축 알약(E/SL/TP·종가마감 등) ON/OFF. 차트 라벨과 별개"
                onClick={() => {
                  saveSettings({
                    chartMergedDeskRightAxisPricesEnabled: !rightAxisPricesOn,
                  });
                }}
                style={{
                  fontWeight: 800,
                  borderColor: rightAxisPricesOn ? 'rgba(56,189,248,0.65)' : 'rgba(248,113,113,0.55)',
                  color: rightAxisPricesOn ? '#bae6fd' : '#fecaca',
                  background: rightAxisPricesOn ? 'rgba(14,165,233,0.2)' : 'rgba(127,29,29,0.25)',
                }}
              >
                축가격 {rightAxisPricesOn ? 'ON' : 'OFF'}
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
              </div>
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
          <MergedDeskFeatureStatsPanel
            open={featureStatsOpen}
            onClose={() => setFeatureStatsOpen(false)}
            candles={deskCandles}
            timeframe={geometryTf || timeframe}
            symbol={symbol}
            analysis={deferredAnalysisReady ? deferredAnalysis : analysis}
            overlays={deskPackForChart?.overlays ?? deskPack?.overlays ?? null}
            activeTrade={deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan ?? null}
            candleCard={deskPackForChart?.candleCardConfluence ?? deskPack?.candleCardConfluence ?? null}
            settleBoard={settleBoard}
            hubVerdictKo={
              deskPackForChart?.superStatsHub?.stats?.verdictKo ??
              deskPack?.superStatsHub?.stats?.verdictKo ??
              null
            }
            hubHeadlineKo={
              deskPackForChart?.superStatsHub?.stats?.headlineKo ??
              deskPack?.superStatsHub?.stats?.headlineKo ??
              null
            }
            avwapFibPack={avwapFibPackLive}
          />
          {patternMemoryCardOpen ? (
            <div
              className={styles.mergedDeskChipPanelDock}
              data-merged-fold-hud="pattern-memory"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <MergedDeskPatternMemoryCard
                symbol={symbol}
                timeframe={geometryTf || timeframe}
                forceOpen
                onClose={() => setPatternMemoryCardOpen(false)}
              />
            </div>
          ) : null}
          {(autoTradePanelOpen ||
          autoTradeOn ||
          autoTradeCfg.enabled ||
          autoTradeCfg.liveArmed ||
          Boolean(virtTradeSession.active)) ? (
            <MergedDeskAutoTradePanel
              symbol={symbol}
              timeframe={geometryTf || timeframe}
              uiVisible={autoTradePanelOpen}
              onOpenUi={() => setAutoTradePanelOpen(true)}
              liveStatusKo={autoTradeStatusKo}
              onStatusKo={setAutoTradeStatusKo}
              livePrice={
                (typeof liveChartPrice === 'number' && liveChartPrice > 0
                  ? liveChartPrice
                  : null) ??
                (deskCandles.length
                  ? Number(deskCandles[deskCandles.length - 1]?.close) || null
                  : null)
              }
              onVirtualSessionStart={() => {
                /**
                 * 가상 시작 = 엔진 ON · 초단 카드 HUD만 OFF.
                 * 실전 ARM은 유지 → 가상·실전 병행.
                 */
                setAutoTradeOn(true);
                setAutoScalpPaperOn(false);
                setAutoScalpCardOpen(false);
                const prev = readAutoTradeConfig();
                const cfg = writeAutoTradeConfig({
                  enabled: true,
                  liveArmed: prev.liveArmed === true,
                  tradingMode: prev.liveArmed ? 'LIVE' : prev.tradingMode,
                  strategyScalp: true,
                  strategyDoksuri1: true,
                });
                setAutoTradeCfg(cfg);
                saveSettings({
                  chartMergedDeskAutoTradeEnabled: true,
                  chartMergedDeskAutoScalpPaperEnabled: false,
                });
                setAutoTradeStatusKo(
                  cfg.liveArmed
                    ? '🟢 가상+실전 병행 · 같은 확정신호→둘 다 (즉시진입 아님)'
                    : '🟡 가상매매 ARM · 확정·합류 대기 (즉시진입 아님) · 실전은 「실전매매」로 추가'
                );
                window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
              }}
              onVirtualSessionStop={() => {
                setAutoTradeStatusKo('가상매매 중지');
              }}
              scalpStripKo={autoScalpStripKo}
              scalpDetailKo={autoScalpDetailKo}
              scalpTrade={autoScalpTrade}
              fourStrategyCards={fourStrategyCards}
              fourStrategyStripKo={fourStrategyStripKo}
              virtAnalysisStripKo={virtAnalysisStripKo}
              planDirection={
                (deskPackForChart?.swingMidEntry ?? deskPack?.swingMidEntry)?.direction === 'LONG' ||
                (deskPackForChart?.swingMidEntry ?? deskPack?.swingMidEntry)?.direction === 'SHORT'
                  ? (deskPackForChart?.swingMidEntry ?? deskPack?.swingMidEntry)!.direction
                  : deskPackForChart?.activeTradePlan?.direction === 'LONG' ||
                      deskPackForChart?.activeTradePlan?.direction === 'SHORT'
                    ? deskPackForChart.activeTradePlan.direction
                    : deskPack?.activeTradePlan?.direction === 'LONG' ||
                        deskPack?.activeTradePlan?.direction === 'SHORT'
                      ? deskPack.activeTradePlan.direction
                      : null
              }
              planEntry={
                (deskPackForChart?.swingMidEntry ?? deskPack?.swingMidEntry)?.entry ??
                deskPackForChart?.activeTradePlan?.entry ??
                deskPack?.activeTradePlan?.entry ??
                null
              }
              planSl={
                (deskPackForChart?.swingMidEntry ?? deskPack?.swingMidEntry)?.stopLoss ??
                deskPackForChart?.activeTradePlan?.stopLoss ??
                deskPack?.activeTradePlan?.stopLoss ??
                null
              }
              planTp1={
                (deskPackForChart?.swingMidEntry ?? deskPack?.swingMidEntry)?.tp1 ??
                deskPackForChart?.activeTradePlan?.tp1 ??
                deskPack?.activeTradePlan?.tp1 ??
                null
              }
              onClose={() => setAutoTradePanelOpen(false)}
              onConfigChange={(cfg) => {
                setAutoTradeCfg(cfg);
                setAutoTradeOn(cfg.enabled || cfg.liveArmed);
                saveSettings({
                  chartMergedDeskAutoTradeEnabled: cfg.enabled || cfg.liveArmed,
                  chartMergedDeskAutoTradeLeverage: cfg.leverage,
                  chartMergedDeskAutoTradeMarginUsdt: cfg.marginUsdt,
                  chartMergedDeskAutoTradeEquityPct: cfg.scalpEquityPct ?? cfg.equityPct,
                  chartMergedDeskAutoTradeDoksuriEquityPct: cfg.doksuriEquityPct,
                });
                /** 초단 카드/페이퍼 HUD 강제 ON 금지 — 차트 기능 유지 */
                if (!cfg.enabled && !cfg.liveArmed) {
                  setAutoScalpPaperOn(false);
                  setAutoScalpCardOpen(false);
                  saveSettings({ chartMergedDeskAutoScalpPaperEnabled: false });
                }
                window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
              }}
            />
          ) : null}
          {autoScalpCardOpen && autoScalpPaperOn ? (
            <MergedDeskAutoScalpCard
              symbol={symbol}
              timeframe={geometryTf || timeframe}
              stripKo={autoScalpStripKo}
              detailKo={autoScalpDetailKo}
              trade={autoScalpTrade}
              forceOpen
              onClose={() => setAutoScalpCardOpen(false)}
            />
          ) : null}
          <div
            className={`${styles.mergedChartWrap}${loading && !analysis ? ' loadingPulse' : ''}${fsActive ? ` ${styles.mergedChartWrapFsOnly}` : ''}${mobileFsActive ? ` ${styles.mergedChartWrapMobileFs}` : ''}`}
            style={{ position: 'relative' }}
          >
            <div className={styles.mergedChartSlot}>
              <MergedDeskChartFeatureHud
                enabled={statsHudOn && !isMobileViewport}
                candles={deskCandles}
                timeframe={geometryTf || timeframe}
                symbol={symbol}
                analysis={deferredAnalysisReady ? deferredAnalysis : analysis}
                overlays={deskPackForChart?.overlays ?? deskPack?.overlays ?? null}
                activeTrade={deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan ?? null}
                candleCard={deskPackForChart?.candleCardConfluence ?? deskPack?.candleCardConfluence ?? null}
                settleBoard={settleBoard}
                hubVerdictKo={
                  deskPackForChart?.superStatsHub?.stats?.verdictKo ??
                  deskPack?.superStatsHub?.stats?.verdictKo ??
                  null
                }
                avwapAiTitleKo={avwapStatsHubLive?.titleKo ?? null}
                practiceAiTitleKo={
                  practiceAiOn ? deskPackForChart?.practiceAiPlan?.summaryKo ?? null : null
                }
                featureFlags={{
                  fvg: chartFvgOn,
                  ob: chartObOn,
                  choch: chartChochOn,
                  bos: chartBosOn,
                }}
                onToggleFeature={(id: MergedDeskChartFeatureChipId) => {
                  if (id === 'fvg') {
                    const next = !chartFvgOn;
                    setChartFvgOn(next);
                    saveSettings({ chartMergedDeskChartFvgEnabled: next });
                  } else if (id === 'ob') {
                    const next = !chartObOn;
                    setChartObOn(next);
                    saveSettings({ chartMergedDeskChartObEnabled: next });
                  } else if (id === 'choch') {
                    const next = !chartChochOn;
                    setChartChochOn(next);
                    saveSettings({ chartMergedDeskChartChochEnabled: next });
                  } else {
                    const next = !chartBosOn;
                    setChartBosOn(next);
                    saveSettings({ chartMergedDeskChartBosEnabled: next });
                  }
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
                onOpenFullStats={() => setFeatureStatsOpen(true)}
                onCloseHud={() => {
                  setStatsHudOn(false);
                  saveSettings({ chartMergedDeskStatsHudEnabled: false });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
              />
              {useChartFloatZoneTools && (
                <div
                  className={`${styles.mergedChartCmdBar}${fsActive ? ` ${styles.mergedChartCmdBarFs}` : ''}${
                    verdictStrip.lineKo ? ` ${styles.mergedChartCmdBarBelowVerdict}` : ''
                  }`}
                  aria-label="차트 TF·존·POC"
                  data-eagle1-chart-zone-float="1"
                >
                  <div className={styles.mergedChartCmdTf} aria-label="타임프레임">
                    {MERGED_TF_CHIPS.map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        className={styles.mergedChartCmdTfBtn}
                        data-on={timeframe === tf ? '1' : '0'}
                        title={`${tf} 캔들 전환`}
                        onClick={() => onRequestChartTf(tf)}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                  <div className={styles.mergedChartCmdActions}>
                  <button
                    type="button"
                    className={styles.mergedChartCmdBtn}
                    data-kind="zone"
                    data-on={classicZoneOn ? '1' : '0'}
                    title="★·Money·HQ 클래식 zone (AI ZONE과 독립)"
                    onClick={() => toggleClassicZone()}
                  >
                    ZONE
                  </button>
                  <button
                    type="button"
                    className={styles.mergedChartCmdBtn}
                    data-kind="ai"
                    data-on={aiAnalysisZoneOn && practiceAiOn ? '1' : '0'}
                    title="AI ZONE v2 — ★·HotZone·통합존 confluence (클릭=근거 카드)"
                    onClick={() => toggleAiZone()}
                  >
                    AI ZONE
                  </button>
                  <button
                    type="button"
                    className={`${styles.mergedChartCmdBtn} ${styles.autoTradePocChipFs}`}
                    data-kind="autotrade"
                    data-on={autoTradeOn || autoTradePanelOpen ? '1' : '0'}
                    data-live={autoTradeCfg.liveArmed ? '1' : '0'}
                    title="자동매매 — 가상/실전 동일 분석 · 매매창"
                    onClick={() => {
                      const next = !autoTradeOn;
                      setAutoTradeOn(next);
                      saveSettings({ chartMergedDeskAutoTradeEnabled: next });
                      const cfg = writeAutoTradeConfig({ enabled: next });
                      setAutoTradeCfg(cfg);
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                      setAutoTradePanelOpen(true);
                      if (!next) {
                        setAutoScalpPaperOn(false);
                        setAutoScalpCardOpen(false);
                        saveSettings({ chartMergedDeskAutoScalpPaperEnabled: false });
                      }
                    }}
                  >
                    자동매매{autoTradeOn ? (autoTradeCfg.liveArmed ? '·실전' : '·가상') : ''}
                  </button>
                  <button
                    type="button"
                    className={styles.mergedChartCmdBtn}
                    data-kind="poc"
                    data-on={vrvpPocExtend === 'extend20' ? '1' : '0'}
                    title="POC 최다거래 막대: 짧게 ↔ 마지막+20봉 연장"
                    onClick={() => {
                      const next = vrvpPocExtend === 'extend20' ? 'short' : 'extend20';
                      setVrvpPocExtend(next);
                      saveSettings({ chartMergedDeskVrvpPocExtend: next });
                    }}
                  >
                    POC{vrvpPocExtend === 'extend20' ? '+20' : '짧게'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.mergedChartCmdBtn} ${styles.mergedChartCmdFs}`}
                    data-on={fsActive ? '1' : '0'}
                    data-eagle1-fs-chip="strip"
                    data-merged-fs-chip="1"
                    title={fsActive ? '일반 화면' : '차트 전체화면'}
                    onClick={() => void toggleChartFullscreen()}
                  >
                    {fsActive ? '일반' : '⛶'}
                  </button>
                  </div>
                </div>
              )}
              {verdictStrip.lineKo && (
                <div
                  className={styles.mergedVerdictStrip}
                  data-tone={verdictStrip.tone}
                  title={verdictStrip.detailKo}
                >
                  {verdictStrip.lineKo}
                </div>
              )}
              {showCycleTopBar && (
                <div
                  className={`${styles.mergedCycleTopBar} ${styles.mergedCycleTopBarClickable}${
                    verdictStrip.lineKo ? ` ${styles.mergedCycleTopBarBelowVerdict}` : ''
                  }${cycleBarFolded ? ` ${styles.mergedCycleTopBarFolded}` : ''}`}
                  data-merged-cycle-bar="1"
                  data-merged-fold-hud="cycle"
                  style={schematicOpen ? { opacity: 0.92 } : undefined}
                  aria-label="지금 자리 학파 합류"
                  title={cycleProgress.primary!.detailKo}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  {cycleBarFolded ? (
                    <button
                      type="button"
                      className={`${styles.mergedCycleTopPrimary} ${styles.mergedCycleHudBtn}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCycleBarFolded(false);
                        try {
                          window.localStorage.setItem('ailongshort-merged-cycle-bar-folded-v1', '0');
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      지금자리 · 펴기
                    </button>
                  ) : (
                    <>
                  <button
                    type="button"
                    className={`${styles.mergedCycleTopPrimary} ${styles.mergedCycleTopPrimaryClick}`}
                    data-merged-cycle-chip="1"
                    data-tone={cycleProgress.primary!.tone}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const live = cycleProgress.others.find(
                        (c) => asClickableSchool(c.kind) && !/도식 대기/.test(c.headlineKo)
                      );
                      const pk =
                        asClickableSchool(cycleProgress.primary?.kind) ??
                        asClickableSchool(live?.kind) ??
                        asClickableSchool(cycleProgress.others[0]?.kind) ??
                        (cycleProgress.wyckoff ? 'wyckoff' : cycleProgress.elliott ? 'elliott' : null);
                      if (pk) {
                        if (isMobileViewport) {
                          setMobileToolsOpen(false);
                          setMobileDiagramOpen(true);
                        }
                        setSchematicOpen(pk);
                      }
                    }}
                  >
                    <span className={styles.mergedCycleTopTag}>{cycleProgress.primary!.tagKo}</span>
                    {cycleProgress.nowKo}
                  </button>
                  {cycleProgress.others.map((c) => {
                    const sk = asClickableSchool(c.kind);
                    const waiting = /도식 대기/.test(c.headlineKo);
                    const rbRank = sk && blueRedChannelsOn ? rbChipConfluence?.rankBySchool[sk] : undefined;
                    const openSchool = sk ?? FILL_SCHOOL_FALLBACK[c.kind] ?? 'wyckoff';
                    return (
                      <button
                        key={c.kind + c.tagKo}
                        type="button"
                        data-merged-cycle-chip="1"
                        className={`${styles.mergedCycleTopChip} ${styles.mergedCycleTopChipClick}${
                          waiting ? ` ${styles.mergedCycleTopChipWait}` : ''
                        }${schematicOpen === openSchool ? ` ${styles.mergedCycleTopChipOn}` : ''}${
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
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isMobileViewport) {
                            setMobileToolsOpen(false);
                            setMobileDiagramOpen(true);
                          }
                          setSchematicOpen(openSchool);
                        }}
                      >
                        {rbRank ? `${c.tagKo}·${rbRank}` : c.tagKo}
                      </button>
                    );
                  })}
                    </>
                  )}
                  <button
                    type="button"
                    className={styles.mergedCycleHudBtn}
                    title={cycleBarFolded ? '지금자리 펼치기' : '지금자리 접기'}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCycleBarFolded((v) => {
                        const next = !v;
                        try {
                          window.localStorage.setItem('ailongshort-merged-cycle-bar-folded-v1', next ? '1' : '0');
                        } catch {
                          /* ignore */
                        }
                        return next;
                      });
                    }}
                  >
                    {cycleBarFolded ? '펴기' : '접기'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.mergedCycleHudBtn} ${styles.mergedCycleHudBtnClose}`}
                    title="지금자리 닫기 — 사이클도식 칩으로 다시 켤 수 있음"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCycleProgressOn(false);
                      saveSettings({ chartMergedDeskCycleProgressEnabled: false });
                      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                      setSchematicOpen(null);
                    }}
                  >
                    닫기
                  </button>
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
            {!fsActive && !isMobileViewport && (
              <MergedAnalysisZoneLabelRail
                levels={deskPack?.aresLevels ?? []}
                currentPrice={analysis?.currentPrice ?? strikeBundle?.close ?? null}
              />
            )}
            {superAiOn &&
              zoneBattleHudOn &&
              (chartZoneBattle || mtfZoneBattle || mtfZoneBattleLoading) &&
              !fsActive &&
              !isMobileViewport && (
              <MergedDeskZoneBattleHud
                chartBattle={chartZoneBattle}
                mtfPack={mtfZoneBattle}
                chartTf={timeframe}
                loading={mtfZoneBattleLoading}
                onOpenDetail={() => setZoneBattleDetailOpen(true)}
                onHide={toggleZoneBattleHud}
              />
            )}
            {selectedMirageOverlay && !zoneBattleDetailOpen && !aiAnalysisZoneOn && (
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
            {aiZoneClickDetail && (
              <Eagle1AiZoneClickCard
                detail={aiZoneClickDetail}
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
            {fsActive && aiMarketZoneCardOpen && (
              <MergedDeskAiMarketZoneSideCard
                pack={aiMarketZoneLive}
                symbol={symbol}
                timeframe={timeframe}
                currentPrice={analysis?.currentPrice ?? strikeBundle?.close ?? null}
                onClose={() => setAiMarketZoneCardOpen(false)}
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
              aria-label="파랑빨강띠 라이브 진입"
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
            (deskPackForChart?.deskHud?.candleCardConfluenceKo ?? deskHud?.candleCardConfluenceKo) &&
            !fsActive && (
            <div
              className={styles.mergedHqEntryStrip}
              aria-label="캔들·카드·마감 합류"
              title={deskPackForChart?.deskHud?.candleCardConfluenceKo ?? deskHud?.candleCardConfluenceKo ?? ''}
              style={{ borderColor: 'rgba(45,212,191,0.35)' }}
            >
              <span className={styles.stripHqTag}>합류</span>
              <span className={styles.stripHqText}>
                {deskPackForChart?.deskHud?.candleCardConfluenceKo ?? deskHud?.candleCardConfluenceKo}
              </span>
            </div>
          )}

          {!hideTextStrips &&
            mtfDumpOn &&
            deskPackForChart?.deskHud?.mtfDumpKo &&
            !fsActive && (
            <div
              className={styles.mergedHqEntryStrip}
              aria-label="MTF 폭락구간"
              title={deskPackForChart.deskHud.mtfDumpKo ?? ''}
              style={{ borderColor: 'rgba(248,113,113,0.45)' }}
            >
              <span className={styles.stripHqTag}>폭락MTF</span>
              <span className={styles.stripHqText}>{deskPackForChart.deskHud.mtfDumpKo}</span>
            </div>
          )}

          {!hideTextStrips &&
            practiceAiOn &&
            (deskPackForChart?.deskHud?.practiceAiPlanKo ||
              deskPackForChart?.practiceAiPlan?.summaryKo) &&
            !fsActive && (
            <div
              className={styles.mergedHqEntryStrip}
              aria-label="실전 AI 플랜"
              title={
                deskPackForChart?.practiceAiPlan?.disclaimerKo ??
                deskPackForChart?.deskHud?.practiceAiPlanKo ??
                ''
              }
              style={
                deskPackForChart?.practiceAiPlan?.entryAllowed
                  ? { borderColor: 'rgba(74,222,128,0.6)' }
                  : deskPackForChart?.practiceAiPlan?.state?.includes('WATCH')
                    ? { borderColor: 'rgba(251,191,36,0.5)' }
                    : deskPackForChart?.practiceAiPlan?.state?.includes('MISSED')
                      ? { borderColor: 'rgba(248,113,113,0.5)' }
                      : { borderColor: 'rgba(148,163,184,0.4)' }
              }
            >
              <span className={styles.stripHqTag}>
                {deskPackForChart?.practiceAiPlan?.stateKo ?? '실전AI'}
              </span>
              <span className={styles.stripHqText}>
                {deskPackForChart?.deskHud?.practiceAiPlanKo ??
                  deskPackForChart?.practiceAiPlan?.summaryKo}
              </span>
            </div>
          )}

          {!hideTextStrips &&
            (deskPackForChart?.deskHud?.activeTradePlanKo ?? deskHud?.activeTradePlanKo) &&
            (deskPackForChart?.activeTradePlan ?? deskPack?.activeTradePlan)?.status !== 'INVALID' &&
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
            <FoldCard
              id="merged-tb-scan"
              title="TOP/BOT 스캔"
              subtitle="전종목 RSI 피벗 · 클릭 시 심볼 전환 · 기본접힘"
              defaultOpen={false}
            >
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
            </FoldCard>
          )}

          {!hideTextStrips && !fsActive && deskPack?.swingMidEntry && (
            <MergedDeskSwingMidEntryCard pack={deskPack.swingMidEntry} />
          )}
          {!fsActive && (
            <FoldCard
              id="merged-super-adv-stats"
              title="AI超级变身统计"
              subtitle="허브 합의 · E/SL/TP · TF 보드 · 기본접힘"
              defaultOpen={false}
              badge={deskPack?.masterFutures?.side ?? undefined}
            >
              <MergedDeskSuperAdvancedStatsStrip
                hub={deskPack?.superStatsHub ?? null}
                master={deskPack?.masterFutures ?? null}
                judgment={deskPack?.tradeJudgment ?? null}
                analysis={deferredAnalysisReady ? deferredAnalysis : analysis}
                tradePlan={deskPack?.unifiedTradePlan ?? null}
                confluenceHint={deskHud?.vrvpConfluenceKo ?? deskHud?.hotZoneEntryKo ?? null}
                timeframe={timeframe}
                schoolEvidenceKo={
                  cycleProgress.primary
                    ? `${cycleProgress.primary.tagKo} · ${cycleProgress.primary.headlineKo}`
                    : cycleProgress.nowKo || null
                }
                avwapLineKo={avwapSuperStats.lineKo || null}
                avwapRows={avwapSuperStats.rows.length ? avwapSuperStats.rows : null}
              />
            </FoldCard>
          )}
          {!hideTextStrips && !fsActive && (deskPack?.masterFutures || deskPack?.tradeJudgment) && (
            <MergedAnalysisTradeJudgmentBanner
              master={deskPack.masterFutures ?? null}
              judgment={deskPack.tradeJudgment ?? null}
              hub={deskPack.superStatsHub ?? null}
              theme={theme}
              onJournal={onMasterJournal}
            />
          )}
          {!hideTextStrips && !fsActive && doksuri1BriefingOn && doksuri1Pack && (
            <Doksuri1BattleCard pack={doksuri1Pack} theme={theme} />
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
              <FoldCard
                id="merged-structure-timeline"
                title="구조 타임라인"
                subtitle="BOS · CHoCH · 국면"
                defaultOpen={false}
              >
                <MergedAnalysisStructureTimeline
                  tracks={deskPack.timeline}
                  candles={fusionCandles}
                  timeframe={timeframe}
                  theme={theme}
                />
              </FoldCard>
            </div>
          )}

          {!fsActive && (
            <div className={panelsOpen ? undefined : styles.mergedDeskPanelsHidden} aria-hidden={!panelsOpen}>
              <FoldCard
                id="merged-bottom-momentum"
                title="모멘텀 · RSI/MACD"
                subtitle="미니차트 · AI 롱숏 합성"
                defaultOpen={false}
              >
                <MergedAnalysisBottomPanels analysis={analysis} theme={theme} />
              </FoldCard>
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
  if (!wrapEagle1Hud) return shell;
  const hudAnalysis = deferredAnalysisReady ? deferredAnalysis : analysis;
  return (
    <Eagle1StructureDesk
      analysis={hudAnalysis}
      symbol={symbol}
      timeframe={timeframe}
      selectedZoneId={selectedMirageZoneId}
      onTimeframeChange={onRequestChartTf}
      aiZoneOn={aiAnalysisZoneOn}
      aiZonePack={aiZonePackForUi}
      canonicalTrade={canonicalTrade}
    >
      {shell}
    </Eagle1StructureDesk>
  );
}
