/**
 * 통합·분석 데스크 — Strike 매매 zone + 통합펄스 마커 + VRVP 프로파일.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MonthDeskBandFusionContext } from '@/lib/institutionalSuperBand';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import {
  runMonthDeskUnifiedPulseEngine,
  type UnifiedPulseEnginePack,
} from '@/lib/monthDeskUnifiedPulseEngine';
import {
  buildMergedDeskStructureVerdictPack,
  type MergedDeskStructureVerdict,
} from '@/lib/mergedDeskStructureVerdict';
import { pickBestSettleSnapshot } from '@/lib/monthDeskSettleChartGuide';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import { chartTfToCloseSettleTf } from '@/lib/tfCloseSettleAssessment';
import type { PulseProStrategyStrip } from '@/lib/monthDeskPulseProLayers';
import { applyMergedDeskRbVisualAi } from '@/lib/mergedDeskRbVisualAi';
import { lastBarTime } from '@/lib/monthDeskLastCandleFocus';
import {
  buildMergedTradeOverlayPack,
  buildMergedAnalysisBandFusionContext,
  type MergedTradeSignal,
  type MergedVrvpProfile,
  type MergedAresLevel,
  type MergedKeyZone,
  type MergedDirectionConfirm,
} from '@/lib/mergedAnalysisTradeLayer';
import { summarizeMergedDirectionConfirmsKo } from '@/lib/mergedAnalysisDirectionConfirm';
import {
  summarizeMergedCriticalZonesKo,
  summarizeMergedCriticalPrimaryKo,
  type MergedCriticalZone,
} from '@/lib/mergedAnalysisCriticalZones';
import {
  summarizeMergedBounceScenariosKo,
  summarizeMergedBounceTargetsDetailKo,
  type MergedBounceScenario,
} from '@/lib/mergedAnalysisBounceTargets';
import {
  summarizeMergedSmcLeadingDetailKo,
  summarizeMergedSmcLeadingKo,
  type MergedSmcLeadingContext,
} from '@/lib/mergedAnalysisSmcLeading';
import {
  mergedVrvpPanelPending,
  mergedVrvpPanelSummary,
} from '@/lib/mergedAnalysisVrvpLabels';
import {
  buildMergedTradeJudgment,
  summarizeMergedTradeJudgmentKo,
  type MergedTradeJudgment,
} from '@/lib/mergedAnalysisTradeJudgment';
import {
  buildMasterFuturesDecision,
  type MasterFuturesDecision,
} from '@/lib/mergedDeskMasterFuturesDecision';
import {
  buildMergedDeskGateHud,
  buildMergedMtfZoneAlignBadge,
  buildMergedVrvpZoneConfluenceKo,
  buildMergedFusionStructureByTime,
  type MergedDeskGateHud,
} from '@/lib/mergedAnalysisDeskHud';
import { buildMergedSwingChartDrawPack } from '@/lib/mergedAnalysisSwingChartDraw';
import { appendMergedBounceLearningTimeline } from '@/lib/mergedAnalysisBounceLearning';
import { buildMergedStCloudChartPack, summarizeMergedStCloudSignalsKo } from '@/lib/mergedAnalysisStCloudSignals';
import {
  filterOverlaysForUnifiedCloud,
} from '@/lib/mergedDeskUnifiedCloud';
import { summarizeMergedScenarioPathKo } from '@/lib/mergedAnalysisScenarioPathZones';
import { buildMergedTopsBottomsChartPack } from '@/lib/mergedAnalysisTopsBottoms';
import {
  buildMergedMirageLspChartPack,
  summarizeMergedMirageLspKo,
} from '@/lib/mergedAnalysisMirageLSP';
import type { MirageDashboard } from '@/lib/mirageLiquiditySweepIndicator';
import { buildMergedAresNumberedLevelsFromPlan, buildMergedVrvpPriceLines } from '@/lib/mergedAnalysisAresVisual';
import { buildMergedDeskChartMarkers } from '@/lib/mergedAnalysisEntryMarkers';
import { buildMergedDeskStructureScenarioMarkers } from '@/lib/mergedAnalysisStructureScenario';
import {
  injectMergedDeskUnifiedTradeRails,
  stripDuplicateMergedDeskTradeTargetOverlays,
  strengthenUnifiedDeskTradePlan,
  buildMergedDeskUnifiedTradePriceLines,
} from '@/lib/mergedDeskUnifiedTradeRails';
import { resolveUnifiedDeskTradePlan, type UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import {
  resolveMergedDeskActiveTradePlan,
  buildMergedDeskActiveTradePriceLines,
  buildMergedDeskEntryZoneOverlays,
  summarizeMergedDeskActiveTradePlanKo,
  type MergedDeskActiveTradePlan,
} from '@/lib/mergedDeskActiveTradePlan';
import type { MergedDeskLivePracticeCue } from '@/lib/mergedDeskLivePracticeCue';
import { loadSettings } from '@/lib/settings';
import { buildMergedDeskChannelMoneyEdgePack } from '@/lib/mergedDeskChannelMoneyEdge';
import { buildUnifiedChartFeatureContext } from '@/lib/unifiedChartFeatureContext';
import { filterMergedDeskChartMarkers } from '@/lib/mergedAnalysisOverlayIds';
import {
  alignMergedDeskOverlaysToAnalysisWindow,
  mergedDeskEngineCandles,
  mergedWorkCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import {
  polishMergedDeskChartOverlays,
  stampMergedDeskMoneyZoneConfluence,
  buildMergedDeskMoneyZoneAxisLines,
  dedupeMergedDeskAxisPriceLines,
} from '@/lib/mergedAnalysisDeskVisualCleanup';
import {
  buildMergedDeskMirageStyleDrawPack,
  finalizeMergedDeskMirageChartOverlays,
  filterMergedDeskMirageChartMarkers,
} from '@/lib/mergedDeskMirageStyleDraw';
import { buildMergedDeskMirageEnhanceOverlays } from '@/lib/mergedDeskMirageEnhancePack';
import { buildMergedDeskBtccionCandleDrawPack } from '@/lib/mergedDeskBtccionCandleDraw';
import { buildMergedDeskAdvancedAnalysisDrawPack } from '@/lib/mergedDeskAdvancedAnalysisDraw';
import { computeTailong } from '@/lib/tailongEngine';
import { buildMergedDeskDownsideBouncePlanPack } from '@/lib/mergedDeskDownsideBouncePlan';
import {
  buildMergedDeskSwingRetracePack,
  summarizeSwingRetraceKo,
  type SwingRetracePack,
} from '@/lib/mergedDeskSwingRetrace';
import {
  buildMergedDeskHqEntryZonesPack,
  summarizeHqEntryZonesKo,
  type HqEntryZonesPack,
} from '@/lib/mergedDeskHqEntryZones';
import {
  buildMergedDeskChochObPathPack,
  summarizeChochObPathKo,
  type ChochObPathPack,
} from '@/lib/mergedDeskChochObPath';
import {
  buildMergedDeskSwingMidEntryPack,
  summarizeSwingMidEntryKo,
  type SwingMidEntryPack,
} from '@/lib/mergedDeskSwingMidEntry';
import {
  buildMergedDeskHotZoneEntryPack,
  summarizeMergedDeskHotZoneEntryKo,
  type MergedDeskHotZoneEntryPack,
} from '@/lib/mergedDeskHotZoneEntry';
import {
  detectMergedDeskAiForceZones,
  summarizeMergedDeskAiForceZonesKo,
  type AiForceZonesPack,
} from '@/lib/mergedDeskAiForceZones';
import {
  detectMergedDeskAssetAutoZones,
  summarizeMergedDeskAssetAutoZonesKo,
  type AssetAutoZonesPack,
} from '@/lib/mergedDeskAssetAutoZones';
import {
  buildMergedDeskAssetsCatalogFullMatchPack,
  summarizeMergedDeskAssetsCatalogFullMatchKo,
  type AssetsCatalogFullMatchPack,
} from '@/lib/mergedDeskAssetsCatalogFullMatch';
import {
  buildMergedDeskCoreSrPack,
  buildMergedDeskCoreSrAxisLines,
  summarizeMergedDeskCoreSrKo,
  type MergedDeskCoreSrPack,
} from '@/lib/mergedDeskCoreSrZones';
import { mergedDeskAlwaysDrawSwingChannel } from '@/lib/mergedDeskChartOnlyUi';

export type {
  MergedTradeSignal,
  MergedVrvpProfile,
  MergedAresLevel,
  MergedKeyZone,
  MergedDirectionConfirm,
  MergedTradeJudgment,
  MergedCriticalZone,
  MergedBounceScenario,
  MergedSmcLeadingContext,
};
export type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';

function dedupeMergedDeskOverlays(items: OverlayItem[]): OverlayItem[] {
  const seen = new Set<string>();
  const out: OverlayItem[] = [];
  for (const o of items) {
    const key = String(o.id || `${o.kind}-${o.price1}-${o.time1}`);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(o);
  }
  return out;
}

export type MergedAnalysisTimelineEvent = {
  time: number;
  color: string;
  hot: boolean;
  labelKo: string;
};

export type MergedAnalysisTimelineTrack = {
  key: 'structure' | 'breakout' | 'settle' | 'pullback' | 'invalid' | 'confirm';
  labelKo: string;
  events: MergedAnalysisTimelineEvent[];
};

export type MergedAnalysisCardPanel = {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  longPct: number;
  shortPct: number;
  confidence: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  whaleBuyPct: number;
  whaleSellPct: number;
  whalePhaseKo: string;
  pocPrice: number | null;
  aiSupport: number | null;
  aiResistance: number | null;
  stepKo: string;
  timelineKo: string;
  invalidationKo: string;
  keyZoneKo: string;
  criticalZoneKo: string;
  criticalPrimaryKo: string;
  bounceTargetKo: string;
  bounceDetailKo: string;
  smcLeadingKo: string;
  smcLeadingDetailKo: string;
  confirmKo: string;
  pocKo: string;
  judgmentKo: string;
  topsBottomsKo: string;
  mirageLspKo: string;
  supportReboundKo: string;
};

export type MergedAnalysisDeskHud = {
  gateHud: MergedDeskGateHud;
  mtfAlignKo: string;
  mtfAligned: boolean;
  vrvpConfluenceKo: string;
  stCloudKo: string;
  scenarioPathKo: string;
  topsBottomsKo: string;
  mirageLspKo: string;
  /** TV 캡처형 EMA+구조 롱/숏 요약(참고) */
  tvStructureLsKo: string;
  mirageDashboard: MirageDashboard | null;
  supportReboundKo: string;
  structureVerdictKo: string;
  structureVerdict: MergedDeskStructureVerdict;
  projectedDownsideKo: string;
  projectedUpsideKo: string;
  downsideBouncePlanKo: string;
  /** 하락→반등 / 상승→되돌림 맵 */
  swingRetraceKo: string;
  /** 고확률 롱/숏 진입 zone (신호등급 — 승률 아님) */
  hqEntryZonesKo: string;
  /** CHoCH 돌파 → OB 하락/반등 경로 */
  chochObPathKo: string;
  /** 스윙·중투 단일 진입자리 (5~10x) */
  swingMidEntryKo: string;
  /** HotZone 융합 핵심 롱/숏 진입 */
  hotZoneEntryKo: string;
  /** 캔들·거래량 세력/매수/매도 ZONE */
  aiForceZonesKo: string;
  /** assets 레퍼런스 자동 ZONE (S/D·OB·FVG·스윕·닮은꼴·FibVP) */
  assetAutoZonesKo: string;
  /** overlays 353 카탈로그 전량 매칭 작도 */
  assetsCatalogMatchKo: string;
  /** 핵심 지지·저항 구간 */
  coreSrKo: string;
  /** 단일 ActiveTradePlan 요약 */
  activeTradePlanKo: string;
  /** AI파랑빨강띠 라이브 진입 허브 요약 */
  rbLiveEntryKo?: string | null;
  rbLiveEntryDetailKo?: string | null;
  rbLiveEntryActionKo?: string | null;
  rbLiveEntryGradeKo?: string | null;
  /** 거래량 DNA 펄스 */
  rbVolumeTagKo?: string | null;
  rbVolumeStoryKo?: string | null;
  rbVolumeGateKo?: string | null;
};

export type MergedAnalysisDeskPack = UnifiedPulseEnginePack & {
  cardPanel: MergedAnalysisCardPanel;
  timeline: MergedAnalysisTimelineTrack[];
  tradeSignal: MergedTradeSignal;
  unifiedTradePlan: UnifiedDeskTradePlan;
  /** 차트·축·시그널 공통 — E/SL/TP/무효/상태 단일 소스 */
  activeTradePlan: MergedDeskActiveTradePlan;
  /** 실전연습 큐 — 자동주문 아님. DeskView 라이브에서 채움 */
  livePracticeCue?: MergedDeskLivePracticeCue;
  vrvp: MergedVrvpProfile | null;
  aresLevels: MergedAresLevel[];
  keyZones: MergedKeyZone[];
  criticalZones: MergedCriticalZone[];
  bounceScenarios: MergedBounceScenario[];
  smcLeading: MergedSmcLeadingContext;
  directionConfirms: MergedDirectionConfirm[];
  tradeJudgment: MergedTradeJudgment;
  /** 선물 마스터 확정 — 롱/숏/관망 1개 + 하드게이트·등급·사이징 */
  masterFutures: MasterFuturesDecision;
  swingRetrace: SwingRetracePack;
  hqEntryZones: HqEntryZonesPack;
  chochObPath: ChochObPathPack;
  swingMidEntry: SwingMidEntryPack;
  hotZoneEntry: MergedDeskHotZoneEntryPack;
  /** 캔들·거래량 자동 세력/매수/매도 ZONE */
  aiForceZones: AiForceZonesPack;
  /** assets 이미지 조건 기반 자동 ZONE */
  assetAutoZones: AssetAutoZonesPack;
  /** overlays 353 카탈로그 매칭 ZONE */
  assetsCatalogMatch: AssetsCatalogFullMatchPack;
  coreSr: MergedDeskCoreSrPack;
  deskHud: MergedAnalysisDeskHud;
  swingDrawEnabled: boolean;
  /** 파랑빨강 돌파·안착 캔들색 — ChartView 합류 */
  rbSettlePaint?: Map<number, import('@/lib/monthDeskSettleCandlePaint').MonthDeskSettleCandleCell>;
  rbVisualVerdict?: import('@/lib/mergedDeskRbVisualAi').RbVisualVerdict;
};

function timelineSourceWindow(candles: Candle[], _timeframe: string): Candle[] {
  const lim = 120; // 4h 참조 — 전 TF 동일
  return candles.slice(Math.max(0, candles.length - lim));
}

function pushTimelineEvent(
  track: MergedAnalysisTimelineTrack,
  ev: MergedAnalysisTimelineEvent
): void {
  if (track.events.some((e) => e.time === ev.time && e.labelKo === ev.labelKo)) return;
  track.events.push(ev);
}

function buildTimelineTracks(params: {
  candles: Candle[];
  fusion: MonthDeskBandFusionContext | null;
  probePack: OverlayItem[];
  timeframe: string;
  analysis: AnalyzeResponse | null | undefined;
  strategy: PulseProStrategyStrip;
  keyZones: MergedKeyZone[];
  criticalZones: MergedCriticalZone[];
  bounceScenarios: MergedBounceScenario[];
  smcLeading: MergedSmcLeadingContext;
  directionConfirms: MergedDirectionConfirm[];
}): MergedAnalysisTimelineTrack[] {
  const { candles, fusion, probePack, timeframe, analysis, strategy, keyZones, criticalZones, bounceScenarios, smcLeading, directionConfirms } = params;
  const window = timelineSourceWindow(candles, timeframe);
  const tracks: MergedAnalysisTimelineTrack[] = [
    { key: 'confirm', labelKo: '롱·숏 확정', events: [] },
    { key: 'structure', labelKo: '시장 구조', events: [] },
    { key: 'breakout', labelKo: '돌파', events: [] },
    { key: 'settle', labelKo: '마감·안착', events: [] },
    { key: 'pullback', labelKo: '되돌림', events: [] },
    { key: 'invalid', labelKo: '이탈·무효', events: [] },
  ];
  const trackConfirm = tracks[0]!;
  const trackStructure = tracks[1]!;
  const trackBreakout = tracks[2]!;
  const trackSettle = tracks[3]!;
  const trackPullback = tracks[4]!;
  const trackInvalid = tracks[5]!;

  for (let i = 0; i < window.length; i++) {
    const t = Number(window[i]!.time);
    if (!Number.isFinite(t)) continue;
    const st = fusion?.structureByTime?.get(t);
    if (st?.phase === 'confirmed') {
      pushTimelineEvent(trackStructure, {
        time: t,
        color: '#A78BFA',
        hot: i === window.length - 1,
        labelKo: '구조확인',
      });
    } else if (st?.phase === 'breakout') {
      pushTimelineEvent(trackStructure, {
        time: t,
        color: '#60A5FA',
        hot: false,
        labelKo: '돌파시도',
      });
      pushTimelineEvent(trackBreakout, {
        time: t,
        color: '#FACC15',
        hot: i === window.length - 1,
        labelKo: '돌파',
      });
    } else if (st?.phase === 'failed') {
      pushTimelineEvent(trackInvalid, {
        time: t,
        color: '#F87171',
        hot: i === window.length - 1,
        labelKo: '무효',
      });
    }
  }

  const snap = pickBestSettleSnapshot(window, probePack, { timeframe, analysis });
  if (snap?.confirmIdx != null && snap.confirmIdx >= 0) {
    const t = Number(window[snap.confirmIdx]?.time);
    if (Number.isFinite(t)) {
      pushTimelineEvent(trackSettle, {
        time: t,
        color: '#34D399',
        hot: snap.confirmIdx === window.length - 1,
        labelKo: '안착확인',
      });
    }
  }
  if (snap?.breakIdx != null && snap.breakIdx >= 0) {
    const t = Number(window[snap.breakIdx]?.time);
    if (Number.isFinite(t)) {
      pushTimelineEvent(trackBreakout, {
        time: t,
        color: '#FBBF24',
        hot: snap.breakIdx === window.length - 1,
        labelKo: '돌파',
      });
    }
  }

  const lastT = lastBarTime(candles);
  if (lastT != null && strategy.stepKo.includes('되돌림')) {
    pushTimelineEvent(trackPullback, {
      time: lastT,
      color: '#2DD4BF',
      hot: true,
      labelKo: '되돌림',
    });
  }

  for (const z of keyZones.slice(0, 5)) {
    const t = Number(z.time2);
    if (!Number.isFinite(t)) continue;
    const hot = lastT != null && Math.abs(t - lastT) < 86400 * 14;
    if (z.kind === 'demand') {
      pushTimelineEvent(trackPullback, {
        time: t,
        color: '#22D3EE',
        hot,
        labelKo: z.labelKo || '지지반등',
      });
    } else {
      pushTimelineEvent(trackBreakout, {
        time: t,
        color: '#FB923C',
        hot,
        labelKo: z.labelKo || '저항거부',
      });
    }
  }

  for (const z of criticalZones.slice(0, 4)) {
    const t = lastT ?? Number(candles[candles.length - 1]?.time);
    if (!Number.isFinite(t)) continue;
    pushTimelineEvent(trackStructure, {
      time: t,
      color: z.scenario === 'if_decline' ? '#A78BFA' : '#FBBF24',
      hot: z.isPrimary || z.tier === 'S',
      labelKo:
        z.scenario === 'if_decline'
          ? `${z.tier} 하락핵심 ${Math.round(z.price)}`
          : `${z.tier} 상승핵심 ${Math.round(z.price)}`,
    });
  }

  for (const sc of bounceScenarios.filter((s) => s.active).slice(0, 1)) {
    const t = lastT ?? Number(candles[candles.length - 1]?.time);
    if (!Number.isFinite(t)) continue;
    const next = sc.targets.find((x) => !x.hit) ?? sc.targets[sc.targets.length - 1]!;
    pushTimelineEvent(trackPullback, {
      time: t,
      color: sc.direction === 'up' ? '#2DD4BF' : '#FB923C',
      hot: true,
      labelKo:
        sc.direction === 'up'
          ? `반등목표 ${next.label} ${Math.round(next.price)}`
          : `되돌림 ${next.label} ${Math.round(next.price)}`,
    });
  }

  if (smcLeading.lastChoch) {
    const t = smcLeading.lastChoch.time;
    if (Number.isFinite(t)) {
      const hot =
        smcLeading.lastChoch.developing ||
        smcLeading.lastChoch.phase === 'breakout' ||
        smcLeading.lastChoch.phase === 'pending';
      pushTimelineEvent(trackStructure, {
        time: t,
        color: smcLeading.lastChoch.bias === 'bullish' ? '#22C55E' : '#EF4444',
        hot,
        labelKo:
          smcLeading.lastChoch.tag === 'CHOCH'
            ? `CHoCH${smcLeading.lastChoch.bias === 'bullish' ? '↑' : '↓'} BOS${smcLeading.bosCountInLeg}`
            : `BOS${smcLeading.lastChoch.bias === 'bullish' ? '↑' : '↓'}`,
      });
      if (
        smcLeading.lastChoch.phase === 'settling' ||
        smcLeading.lastChoch.phase === 'confirmed'
      ) {
        pushTimelineEvent(trackSettle, {
          time: t,
          color: '#A78BFA',
          hot: smcLeading.lastChoch.phase === 'settling',
          labelKo: `CHoCH ${smcLeading.lastChoch.phase === 'confirmed' ? '안착' : '안착중'}`,
        });
      }
    }
  }

  for (const c of directionConfirms.slice(0, 8)) {
    const t = Number(c.time);
    if (!Number.isFinite(t)) continue;
    const hot = lastT != null && t === lastT;
    const labelKo =
      c.tier === 'confirmed'
        ? c.direction === 'LONG'
          ? '▲ 롱확정'
          : '▼ 숏확정'
        : c.direction === 'LONG'
          ? '▲ 롱강'
          : '▼ 숏강';
    pushTimelineEvent(trackConfirm, {
      time: t,
      color: c.direction === 'LONG' ? '#22C55E' : '#EF4444',
      hot,
      labelKo,
    });
    if (c.tier === 'confirmed') {
      pushTimelineEvent(trackSettle, {
        time: t,
        color: c.direction === 'LONG' ? '#22C55E' : '#EF4444',
        hot,
        labelKo,
      });
    }
  }

  return tracks;
}

function buildCardPanel(
  unified: UnifiedPulseEnginePack,
  analysis: AnalyzeResponse | null | undefined,
  trade: MergedTradeSignal,
  keyZones: MergedKeyZone[],
  criticalZones: MergedCriticalZone[],
  bounceScenarios: MergedBounceScenario[],
  smcLeading: MergedSmcLeadingContext,
  directionConfirms: MergedDirectionConfirm[],
  vrvp: MergedVrvpProfile | null,
  timeframe: string,
  judgment: MergedTradeJudgment,
  topsBottomsKo: string,
  mirageLspKo: string,
  supportReboundKo: string
): MergedAnalysisCardPanel {
  const s = unified.meta.strategy;
  const longPct = Number(analysis?.longScore ?? 50);
  const shortPct = Number(analysis?.shortScore ?? 50);
  const conf = Number(analysis?.confidence ?? unified.meta.confluence ?? 0);
  const keyZoneKo =
    keyZones.length > 0
      ? keyZones
          .slice(0, 3)
          .map((z) => `${z.labelKo} ${z.price.toFixed(0)}`)
          .join(' · ')
      : '핵심 zone 탐지 없음 — TF 봉 수 부족 시 재시도';
  const criticalZoneKo = summarizeMergedCriticalZonesKo(criticalZones);
  const criticalPrimaryKo = summarizeMergedCriticalPrimaryKo(criticalZones);
  const bounceTargetKo = summarizeMergedBounceScenariosKo(bounceScenarios);
  const bounceDetailKo = summarizeMergedBounceTargetsDetailKo(bounceScenarios);
  const smcLeadingKo = summarizeMergedSmcLeadingKo(smcLeading);
  const smcLeadingDetailKo = summarizeMergedSmcLeadingDetailKo(smcLeading);
  const confirmKo = summarizeMergedDirectionConfirmsKo(directionConfirms);
  const pocKo =
    vrvp?.poc != null
      ? mergedVrvpPanelSummary({
          poc: vrvp.poc,
          vaLow: vrvp.vaLow,
          vaHigh: vrvp.vaHigh,
          timeframe: vrvp.timeframe,
          candleCount: vrvp.candleCount,
          vaCoveragePct: vrvp.vaCoveragePct,
        })
      : mergedVrvpPanelPending(timeframe);
  return {
    direction: trade.primary,
    longPct,
    shortPct,
    confidence: conf,
    entry: trade.entry,
    stopLoss: trade.stopLoss,
    tp1: trade.tp1,
    tp2: trade.tp2,
    tp3: trade.tp3,
    whaleBuyPct: s.whaleBuyPct,
    whaleSellPct: s.whaleSellPct,
    whalePhaseKo: s.whalePhaseKo,
    pocPrice: vrvp?.poc ?? s.pocPrice,
    aiSupport: s.aiSupport,
    aiResistance: s.aiResistance,
    stepKo: s.stepKo,
    timelineKo: s.timelineKo,
    invalidationKo: trade.invalidationKo,
    keyZoneKo,
    criticalZoneKo,
    criticalPrimaryKo,
    bounceTargetKo,
    bounceDetailKo,
    smcLeadingKo,
    smcLeadingDetailKo,
    confirmKo,
    pocKo,
    judgmentKo: summarizeMergedTradeJudgmentKo(judgment),
    topsBottomsKo,
    mirageLspKo,
    supportReboundKo,
  };
}

export function runMergedAnalysisDeskEngine(params: {
  candles: Candle[];
  timeframe: string;
  bundle: MonthDeskStrikeDeskBundle;
  fusion: MonthDeskBandFusionContext | null;
  analysis?: AnalyzeResponse | null;
  probePack?: OverlayItem[];
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
  swingDrawEnabled?: boolean;
  /** 종가 마감·안착 보드 — 스윙중투 E/SL/TP 보강 */
  settleBoard?: TfCloseSettleBoard | null;
}): MergedAnalysisDeskPack | null {
  const { timeframe, bundle, analysis } = params;
  const candles = mergedDeskEngineCandles(params.candles, timeframe);
  const swingDrawEnabled = params.swingDrawEnabled ?? false;

  const tradePackProbe = buildMergedTradeOverlayPack({
    bundle,
    candles,
    timeframe,
    fusion: params.fusion,
    unifiedOverlays: [],
    analysis,
    whaleMemoryZones: params.whaleMemoryZones,
  });

  const smcForFusion = tradePackProbe.smcLeading;
  const structureByTime = buildMergedFusionStructureByTime(candles, smcForFusion, analysis);
  const enrichedFusion: MonthDeskBandFusionContext = {
    ...(params.fusion ??
      buildMergedAnalysisBandFusionContext({
        timeframe,
        bundle,
        analysis,
        candles,
        smcLeading: smcForFusion,
      })),
    structureByTime: structureByTime.size > 0 ? structureByTime : params.fusion?.structureByTime ?? null,
  };

  const unified = runMonthDeskUnifiedPulseEngine({
    ...params,
    fusion: enrichedFusion,
    mergedDeskMode: true,
  });
  if (!unified) return null;

  const tradePack = buildMergedTradeOverlayPack({
    bundle,
    candles,
    timeframe,
    fusion: enrichedFusion,
    unifiedOverlays: unified.overlays,
    analysis,
    whaleMemoryZones: params.whaleMemoryZones,
  });

  const judgment = buildMergedTradeJudgment({
    candles,
    timeframe,
    analysis,
    bundle,
    trade: tradePack.signal,
    keyZones: tradePack.keyZones,
    directionConfirms: tradePack.directionConfirms,
    smcLeading: tradePack.smcLeading,
  });

  const structureVerdict = buildMergedDeskStructureVerdictPack({
    candles,
    timeframe,
    keyZones: tradePack.keyZones,
    bounceScenarios: tradePack.bounceScenarios,
    smcLeading: tradePack.smcLeading,
    judgment,
  });
  const supportReboundKo = structureVerdict.summaryKo;
  const projectedDownsideKo = tradePack.projectedDownsideKo;
  const projectedUpsideKo = tradePack.projectedUpsideKo;
  const downsideBouncePlan = buildMergedDeskDownsideBouncePlanPack({
    candles,
    timeframe,
    keyZones: tradePack.keyZones,
    criticalZones: tradePack.criticalZones,
    bounceScenarios: tradePack.bounceScenarios,
    smcLeading: tradePack.smcLeading,
    analysis,
    vrvp: tradePack.vrvp,
    whaleMemoryZones: params.whaleMemoryZones,
  });
  const swingRetrace = buildMergedDeskSwingRetracePack(candles, timeframe);

  const masterDirection =
    bundle.primary !== 'NEUTRAL'
      ? bundle.primary
      : analysis?.verdict === 'LONG' || analysis?.verdict === 'SHORT'
        ? analysis.verdict
        : judgment.direction !== 'NEUTRAL'
          ? judgment.direction
          : 'NEUTRAL';
  const chartFeatures = buildUnifiedChartFeatureContext({
    direction: masterDirection,
    currentPrice: analysis?.currentPrice ?? bundle.close,
    candles,
    keyZones: tradePack.keyZones,
    directionConfirms: tradePack.directionConfirms,
    criticalZones: tradePack.criticalZones,
    bounceScenarios: tradePack.bounceScenarios,
    smcLeading: tradePack.smcLeading,
    vrvp: tradePack.vrvp,
    analysis: analysis ?? null,
    tradeEntry: tradePack.signal.entry,
    tradeSl: tradePack.signal.stopLoss,
    tradeTp1: tradePack.signal.tp1,
  });
  const unifiedTradePlan = strengthenUnifiedDeskTradePlan(
    resolveUnifiedDeskTradePlan({
      masterDirection,
      trade: tradePack.signal,
      analysis: analysis ?? null,
      judgment,
      currentPrice: analysis?.currentPrice ?? bundle.close,
      chartFeatures,
    })
  );

  const price = analysis?.currentPrice ?? bundle.close ?? null;
  const gateHud = buildMergedDeskGateHud(tradePack.directionConfirms, analysis);
  const mtfBadge = buildMergedMtfZoneAlignBadge(
    timeframe,
    tradePack.keyZones,
    tradePack.criticalZones,
    price
  );
  const masterFutures = buildMasterFuturesDecision({
    judgment,
    tradePlan: unifiedTradePlan,
    confirms: tradePack.directionConfirms,
    analysis: analysis ?? null,
    candles,
    timeframe,
    mtfAligned: mtfBadge.aligned,
  });
  const hqEntryZones = buildMergedDeskHqEntryZonesPack({
    candles,
    timeframe,
    keyZones: tradePack.keyZones,
    criticalZones: tradePack.criticalZones,
    swingRetrace,
    masterFutures,
    currentPrice: price,
  });
  const chochObPath = buildMergedDeskChochObPathPack({
    candles,
    timeframe,
    smcLeading: tradePack.smcLeading,
    currentPrice: price,
  });
  const settleTf = chartTfToCloseSettleTf(timeframe);
  const settleRow =
    settleTf && params.settleBoard?.rows?.length
      ? params.settleBoard.rows.find((r) => r.tf === settleTf) ?? null
      : null;

  const swingMidEntry = buildMergedDeskSwingMidEntryPack({
    candles,
    timeframe,
    masterFutures,
    hqEntryZones,
    chochObPath,
    swingRetrace,
    tradePlan: unifiedTradePlan,
    currentPrice: price,
    settleRow,
    settleBoard: params.settleBoard ?? null,
  });
  const hotZoneEntry = buildMergedDeskHotZoneEntryPack({
    candles,
    timeframe,
    hqEntryZones,
    swingMidEntry,
    keyZones: tradePack.keyZones,
    criticalZones: tradePack.criticalZones,
    tradePlan: unifiedTradePlan,
    masterFutures,
    masterSide: masterFutures.side,
    analyzeVerdict:
      judgment.direction === 'LONG' || judgment.direction === 'SHORT'
        ? judgment.direction
        : unifiedTradePlan.direction === 'LONG' || unifiedTradePlan.direction === 'SHORT'
          ? unifiedTradePlan.direction
          : null,
    currentPrice: price,
  });
  /** 캔들·거래량 → 세력 방어 / 매수 / 매도 ZONE (기존 Mirage zone 면과 동일 OverlayItem) */
  const aiForceZones = detectMergedDeskAiForceZones(candles, timeframe);
  /** assets 레퍼런스 → Base S/D · OB/FVG · 스윕/EQ · 닮은꼴 · Fib×VP */
  const assetAutoZones = detectMergedDeskAssetAutoZones(candles, timeframe, tradePack.vrvp);
  /** 핵심 지지·저항 zone — 차트 면 복구 (HotZone과 병행) */
  const coreSr = buildMergedDeskCoreSrPack({
    candles,
    timeframe,
    keyZones: tradePack.keyZones,
    criticalZones: tradePack.criticalZones,
    currentPrice: price,
  });
  const vrvpConfluenceKo = buildMergedVrvpZoneConfluenceKo(
    tradePack.vrvp,
    tradePack.keyZones,
    tradePack.criticalZones,
    price
  );

  const stCloudPack = buildMergedStCloudChartPack({
    candles,
    timeframe,
    fusion: enrichedFusion,
  });

  const topsBottomsPack = buildMergedTopsBottomsChartPack({
    candles,
    timeframe,
  });

  const mirageLspPack = buildMergedMirageLspChartPack({
    candles,
    timeframe,
  });

  const strategy = unified.meta.strategy;
  const timeline = buildTimelineTracks({
    candles,
    fusion: enrichedFusion,
    probePack: params.probePack ?? [],
    timeframe,
    analysis,
    strategy,
    keyZones: tradePack.keyZones,
    criticalZones: tradePack.criticalZones,
    bounceScenarios: tradePack.bounceScenarios,
    smcLeading: tradePack.smcLeading,
    directionConfirms: tradePack.directionConfirms,
  });
  appendMergedBounceLearningTimeline(timeline, tradePack.bounceScenarios, candles, timeframe);
  const cardPanel = buildCardPanel(
    unified,
    analysis,
    tradePack.signal,
    tradePack.keyZones,
    tradePack.criticalZones,
    tradePack.bounceScenarios,
    tradePack.smcLeading,
    tradePack.directionConfirms,
    tradePack.vrvp,
    timeframe,
    judgment,
    topsBottomsPack.summaryKo,
    mirageLspPack.summaryKo,
    supportReboundKo
  );
  /** 채널머니 — 파란/빨간 띠 엣지 → E/SL/TP 후보 */
  const rbBandOn = loadSettings().chartMergedDeskBlueRedChannelsEnabled !== false;
  const channelMoneyPack = buildMergedDeskChannelMoneyEdgePack(candles, timeframe, {
    hotZones: hotZoneEntry.all ?? [],
    analysis,
    stanceKey: timeframe,
    omitTradeRails: rbBandOn,
  });
  /** 단일 ActiveTradePlan — 차트 E/SL/TP/무효/상태의 유일한 소스 (+ MTF 게이트) */
  const activeTradePlan = resolveMergedDeskActiveTradePlan({
    candles,
    swingMid: swingMidEntry,
    hotZone: hotZoneEntry,
    channelMoney: channelMoneyPack.plan,
    unified: unifiedTradePlan,
    master: masterFutures,
    currentPrice: analysis?.currentPrice ?? bundle.close ?? null,
    mtfAligned: mtfBadge.aligned,
    mtfLabelKo: mtfBadge.labelKo,
    signal: tradePack.signal,
    analysis: analysis ?? null,
    judgment,
    preferChannel: rbBandOn,
    mtfAlignmentScore: analysis?.mtf?.alignmentScore ?? null,
  });
  const chartTradePlan = activeTradePlan.asUnifiedPlan;
  /** overlays 353 전량 스코어 → TF 상한 템플릿 ZONE */
  const assetsCatalogMatch = buildMergedDeskAssetsCatalogFullMatchPack({
    candles,
    timeframe,
    analysis: analysis ?? null,
    smcLeading: tradePack.smcLeading,
    tradePlan: chartTradePlan,
  });
  const entryZoneOverlays = buildMergedDeskEntryZoneOverlays(activeTradePlan, candles, timeframe);
  /** Hot: 밴드는 항상 · E/SL 정밀선은 Active가 Hot/중립일 때만(이중 타점 방지) */
  const hotPriceLinesRaw = Array.isArray(hotZoneEntry.priceLines) ? hotZoneEntry.priceLines : [];
  const hotPriceLinesForChart =
    activeTradePlan.source === 'hotZone' || activeTradePlan.direction === 'NEUTRAL'
      ? hotPriceLinesRaw
      : hotPriceLinesRaw.filter((p) => /\$\$\$\$롱·Hot|\$\$\$\$숏·Hot/.test(String(p.title || '')));
  /** ActiveTrade E/SL/TP + 채널 구조선(상/중/하) + Hot존 */
  let priceLines = dedupeMergedDeskAxisPriceLines([
    ...buildMergedDeskActiveTradePriceLines(activeTradePlan),
    ...channelMoneyPack.priceLines,
    ...hotPriceLinesForChart,
    ...buildMergedVrvpPriceLines(tradePack.vrvp),
  ]);

  const aresLevelsFromPlan =
    chartTradePlan.direction !== 'NEUTRAL' && chartTradePlan.entry > 0
      ? buildMergedAresNumberedLevelsFromPlan(chartTradePlan, candles)
      : tradePack.aresLevels;

  const work = candles;
  const tMin = Number(work[0]?.time);
  const tMax = Number(work[work.length - 1]?.time);
  const inAnalysisWindow = (m: AtlasPulseMarker) => {
    const t = Number(m.time);
    return Number.isFinite(t) && Number.isFinite(tMin) && Number.isFinite(tMax) && t >= tMin && t <= tMax;
  };

  const structureMarks = buildMergedDeskStructureScenarioMarkers(tradePack.smcLeading);
  const leadingMarks = buildMergedDeskChartMarkers({
    bundle,
    candles,
    timeframe,
    analysis,
    keyZones: tradePack.keyZones,
    criticalZones: tradePack.criticalZones,
    directionConfirms: tradePack.directionConfirms,
    smcLeading: tradePack.smcLeading,
  });

  const mergedMarkers = filterMergedDeskMirageChartMarkers(
    [
      ...leadingMarks.filter(inAnalysisWindow),
      ...structureMarks.filter(inAnalysisWindow),
      ...mirageLspPack.markers.filter(inAnalysisWindow),
    ]
  );

  const mirageStyleDrawPack = buildMergedDeskMirageStyleDrawPack({
    candles,
    timeframe,
    tradePlan: chartTradePlan,
    bounceScenarios: tradePack.bounceScenarios,
    directionConfirms: tradePack.directionConfirms,
  });
  /** Mirage + key/critical/시나리오 + coreSr + HotZone + 하방·스윙중투 (기존 zone 복구) */
  let chartOverlays = dedupeMergedDeskOverlays([
    ...mirageStyleDrawPack.overlays,
    ...buildMergedDeskMirageEnhanceOverlays({
      candles,
      smcLeading: tradePack.smcLeading,
      keyZones: tradePack.keyZones,
      criticalZones: tradePack.criticalZones,
      currentPrice: analysis?.currentPrice ?? bundle.close ?? null,
    }),
    ...(Array.isArray(tradePack.overlays) ? tradePack.overlays : []),
    ...(coreSr.overlays.length ? coreSr.overlays : []),
    ...(hqEntryZones.overlays.length ? hqEntryZones.overlays : []),
    ...(downsideBouncePlan.overlays.length ? downsideBouncePlan.overlays : []),
    ...hotZoneEntry.overlays,
    ...(aiForceZones.overlays.length ? aiForceZones.overlays : []),
    ...(assetAutoZones.overlays.length ? assetAutoZones.overlays : []),
    ...(assetsCatalogMatch.overlays.length ? assetsCatalogMatch.overlays : []),
    ...(swingMidEntry.overlays.length ? swingMidEntry.overlays : []),
    ...entryZoneOverlays,
    /** 채널게이트 스포트라이트·목표존·진입핀·핵심 돌파/안착 zone */
    ...channelMoneyPack.overlays.filter((o) => {
      const id = String(o.id || '');
      return (
        o.kind === 'channelBand' ||
        id.startsWith('merged-desk-rb-tp') ||
        id.startsWith('merged-desk-rb-entry') ||
        id.startsWith('merged-desk-rb-gate') ||
        id.startsWith('merged-desk-rb-core-') ||
        id.startsWith('merged-desk-rb-master') ||
        id.startsWith('merged-desk-rb-ai-face')
      );
    }),
  ]);
  chartOverlays = filterOverlaysForUnifiedCloud(chartOverlays);
  /** priceLines가 있으면 HTML E/SL/TP 레일 제거 — 축·전폭 선만 (이중 글자·짧은 레일 금지) */
  if (priceLines.length > 0) {
    chartOverlays = stripDuplicateMergedDeskTradeTargetOverlays(chartOverlays);
  } else if (chartTradePlan.direction !== 'NEUTRAL' && chartTradePlan.entry > 0) {
    chartOverlays = injectMergedDeskUnifiedTradeRails(
      chartOverlays,
      chartTradePlan,
      candles,
      timeframe
    );
  }
  /** 전폭 E/SL/TP 선이 비면 폴백 레일 — 타점 미표시 방지 */
  if (
    !priceLines.some((p) => /진입E|손절SL|익절TP1/.test(String(p.title || ''))) &&
    chartTradePlan.direction !== 'NEUTRAL' &&
    chartTradePlan.entry > 0
  ) {
    priceLines = [
      ...buildMergedDeskUnifiedTradePriceLines(chartTradePlan),
      ...priceLines,
    ];
  }

  let swingMarkers: typeof mergedMarkers = [];
  const drawSwingChannel = swingDrawEnabled || mergedDeskAlwaysDrawSwingChannel();
  if (drawSwingChannel) {
    const swingPack = buildMergedSwingChartDrawPack({
      candles,
      timeframe,
      fusion: enrichedFusion,
      analysis: analysis ?? null,
    });
    swingMarkers = filterMergedDeskMirageChartMarkers(
      swingPack.markers.filter(inAnalysisWindow)
    );
    // 스윙 채널·regime·추세선 — 토글 ON/OFF 모두 전 TF 공통 작도 (4h 참조)
    if (Array.isArray(swingPack.overlays) && swingPack.overlays.length) {
      const swingOverlays = swingDrawEnabled
        ? swingPack.overlays
        : swingPack.overlays.filter((o) => {
            const id = String(o.id || '');
            return (
              id.includes('channel') ||
              id.includes('merged-desk-rb-') ||
              id.includes('st-cloud') ||
              id.includes('swing') ||
              o.kind === 'channelBand' ||
              o.kind === 'trendLine'
            );
          });
      if (swingOverlays.length) {
        chartOverlays = dedupeMergedDeskOverlays([...chartOverlays, ...swingOverlays]);
        chartOverlays = filterOverlaysForUnifiedCloud(chartOverlays);
      }
    }
  }

  chartOverlays = polishMergedDeskChartOverlays(chartOverlays, candles, timeframe, {
    ...tradePack.signal,
    entry: chartTradePlan.entry,
    stopLoss: chartTradePlan.stopLoss,
    tp1: chartTradePlan.tp1,
    tp2: chartTradePlan.tp2,
    tp3: chartTradePlan.tp3,
  });
  chartOverlays = stampMergedDeskMoneyZoneConfluence(chartOverlays, {
    close: analysis?.currentPrice ?? bundle.close ?? null,
    candles,
    hqZones: hqEntryZones.all.map((z) => ({
      side: z.side,
      score: z.score,
      grade: z.grade,
      mid: z.mid,
      sources: z.sources,
    })),
    hotZones: hotZoneEntry.all.map((z) => ({
      side: z.side,
      score: z.score,
      mid: z.mid,
      primary: z.primary,
      sources: z.sources,
    })),
    mtfAligned: mtfBadge.aligned,
    mtfLabelKo: mtfBadge.labelKo,
    vrvpPoc: tradePack.vrvp?.poc ?? null,
  });
  chartOverlays = alignMergedDeskOverlaysToAnalysisWindow(chartOverlays, candles, timeframe);

  chartOverlays = finalizeMergedDeskMirageChartOverlays(chartOverlays);

  /** $$$$ 돈구간 + 하방지지/상방저항 1순위 전폭선 + 기존 E/SL/TP/VRVP — 축 라벨 포함 */
  priceLines = dedupeMergedDeskAxisPriceLines([
    ...buildMergedDeskMoneyZoneAxisLines(chartOverlays),
    ...buildMergedDeskCoreSrAxisLines(coreSr),
    ...priceLines,
  ]);

  // btccion + 고급작도 — finalize 이후 합침 (화이트리스트 삭제 방지)
  try {
    const work = mergedWorkCandles(candles, timeframe);
    const dir =
      chartTradePlan.direction === 'LONG' || chartTradePlan.direction === 'SHORT'
        ? chartTradePlan.direction
        : judgment.direction === 'LONG' || judgment.direction === 'SHORT'
          ? judgment.direction
          : 'NEUTRAL';

    if (work.length >= 16) {
      const advanced = buildMergedDeskAdvancedAnalysisDrawPack({
        candles: work,
        timeframe,
        keyZones: tradePack.keyZones,
        criticalZones: tradePack.criticalZones,
        coreSr,
        currentPrice: analysis?.currentPrice ?? bundle.close ?? null,
        direction: dir,
      });
      if (advanced.overlays.length) {
        chartOverlays = dedupeMergedDeskOverlays([...chartOverlays, ...advanced.overlays]);
      }
      if (advanced.priceLines.length) {
        priceLines = dedupeMergedDeskAxisPriceLines([...advanced.priceLines, ...priceLines]);
      }
    }

    if (work.length >= 40) {
      const tl = computeTailong(
        work,
        timeframe,
        dir === 'NEUTRAL' ? 'WATCH' : dir,
        dir === 'LONG' ? 'bullish' : dir === 'SHORT' ? 'bearish' : 'range'
      );
      const reactLevel =
        chartTradePlan.entry > 0
          ? chartTradePlan.entry
          : tl.tailongBreakPrice > 0
            ? tl.tailongBreakPrice
            : work[work.length - 1]!.close;
      const btccion = buildMergedDeskBtccionCandleDrawPack({
        candles: work,
        timeframe,
        direction: dir,
        entry: chartTradePlan.entry,
        stopLoss: chartTradePlan.stopLoss,
        breakLevel: tl.tailongBreakPrice,
        reactLevel,
      });
      if (btccion.overlays.length) {
        chartOverlays = dedupeMergedDeskOverlays([...chartOverlays, ...btccion.overlays]);
      }
    }
  } catch {
    /* 클린·고급 작도 실패 시 기존 오버레이 유지 */
  }

  /** btccion·스윙 합류 후에도 HTML E/SL/TP 알약 재유입 차단 */
  if (priceLines.length > 0) {
    chartOverlays = stripDuplicateMergedDeskTradeTargetOverlays(chartOverlays);
  }

  const rbVisual = applyMergedDeskRbVisualAi({
    overlays: chartOverlays,
    markers: [...mergedMarkers, ...swingMarkers, ...(channelMoneyPack.markers ?? [])],
    analysis,
    stance: channelMoneyPack.stance,
    primary: channelMoneyPack.primary,
    coreSummaryKo: channelMoneyPack.core?.summaryKo ?? channelMoneyPack.summaryKo,
  });
  chartOverlays = rbVisual.overlays;

  return {
    ...unified,
    overlays: chartOverlays,
    markers: rbVisual.markers,
    priceLines,
    meta: {
      ...unified.meta,
      engineKo: `ARES · ${summarizeMergedDeskActiveTradePlanKo(activeTradePlan)}${
        channelMoneyPack.summaryKo ? ` · ${channelMoneyPack.summaryKo}` : ''
      }`,
      strategy: {
        ...strategy,
        direction: chartTradePlan.direction !== 'NEUTRAL' ? chartTradePlan.direction : tradePack.signal.primary,
        entry: chartTradePlan.entry,
        stopLoss: chartTradePlan.stopLoss,
        tp1: chartTradePlan.tp1,
        tp2: chartTradePlan.tp2,
        tp3: chartTradePlan.tp3,
      },
    },
    cardPanel,
    timeline,
    tradeSignal: {
      ...tradePack.signal,
      entry: chartTradePlan.entry,
      stopLoss: chartTradePlan.stopLoss,
      tp1: chartTradePlan.tp1,
      tp2: chartTradePlan.tp2,
      tp3: chartTradePlan.tp3,
    },
    unifiedTradePlan: chartTradePlan,
    activeTradePlan,
    vrvp: tradePack.vrvp,
    aresLevels: aresLevelsFromPlan,
    keyZones: tradePack.keyZones,
    criticalZones: tradePack.criticalZones,
    bounceScenarios: tradePack.bounceScenarios,
    smcLeading: tradePack.smcLeading,
    directionConfirms: tradePack.directionConfirms,
    tradeJudgment: judgment,
    masterFutures,
    swingRetrace,
    hqEntryZones,
    chochObPath,
    swingMidEntry,
    hotZoneEntry,
    aiForceZones,
    assetAutoZones,
    assetsCatalogMatch,
    coreSr,
    deskHud: {
      gateHud,
      mtfAlignKo: mtfBadge.labelKo,
      mtfAligned: mtfBadge.aligned,
      vrvpConfluenceKo,
      stCloudKo: summarizeMergedStCloudSignalsKo(stCloudPack.markers),
      scenarioPathKo: summarizeMergedScenarioPathKo(tradePack.bounceScenarios, candles),
      topsBottomsKo: topsBottomsPack.summaryKo,
      mirageLspKo: mirageLspPack.summaryKo,
      tvStructureLsKo: '',
      mirageDashboard: mirageLspPack.dashboard,
      supportReboundKo,
      structureVerdictKo: structureVerdict.labelKo,
      structureVerdict: structureVerdict.verdict,
      projectedDownsideKo,
      projectedUpsideKo,
      downsideBouncePlanKo: downsideBouncePlan.summaryKo || '',
      swingRetraceKo: summarizeSwingRetraceKo(swingRetrace),
      hqEntryZonesKo: summarizeHqEntryZonesKo(hqEntryZones),
      chochObPathKo: summarizeChochObPathKo(chochObPath),
      swingMidEntryKo: summarizeSwingMidEntryKo(swingMidEntry),
      hotZoneEntryKo: summarizeMergedDeskHotZoneEntryKo(hotZoneEntry),
      aiForceZonesKo: summarizeMergedDeskAiForceZonesKo(aiForceZones),
      assetAutoZonesKo: summarizeMergedDeskAssetAutoZonesKo(assetAutoZones),
      assetsCatalogMatchKo: summarizeMergedDeskAssetsCatalogFullMatchKo(assetsCatalogMatch),
      coreSrKo: summarizeMergedDeskCoreSrKo(coreSr),
      activeTradePlanKo: summarizeMergedDeskActiveTradePlanKo(activeTradePlan),
    },
    swingDrawEnabled,
    rbSettlePaint: channelMoneyPack.settlePaint,
    rbVisualVerdict: rbVisual.verdict,
  };
}
