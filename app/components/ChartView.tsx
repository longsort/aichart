'use client';

import Link from 'next/link';
import { toPng } from 'html-to-image';
import { AnalyzeResponse, Candle, OverlayItem, type StrongZoneOutput } from '@/types';
import {
  visibleLimit,
  ZONE_PRICE_FLOOR,
  ZONE_PRICE_CEIL,
  RSI_SWING_LS_THRESHOLD,
  timeframeRank,
  structureRocketMergeMax,
  analysisMatchesSymbolAndTf,
  normalizeChartTimeframe,
} from '../../lib/constants';
import {
  loadSettings,
  saveSettings,
  defaultSettings,
  getEffectiveFeatureToggles,
  effectiveChartPrimeChannelWidthScale,
  syncSettingsFromServer,
  institutionalBandTouchMinTierFromMask,
  tierMaskFromMinTier,
  type InstitutionalBandTouchTierMask,
  type UIMode as SettingsUIMode,
  type UserSettings,
} from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT, useSettingsChangeTick } from '@/lib/useSettingsChangeTick';
import { useStableStrongZoneOverlays } from '@/lib/useStableStrongZoneOverlays';
import {
  AI_COMPRESSION_PRESETS,
  patchForAiCompressionPreset,
  type AiCompressionPresetId,
} from '@/lib/aiCompressionPresets';
import { buildCandleAnalysisMarkers } from '@/lib/candleLsMarkers';
import {
  buildCandlestickDataWithPre3Sparkle,
  collectPre3SparkleDirections,
  describeCandlePaintForTime,
  type CandleBlendInput,
  type Pre3SparkleCell,
} from '@/lib/chartSparkleCandles';
import {
  hasPre3SparkleOnCandles,
  loadPre3SparklePersistMap,
  mergePre3SparklePersistFromAnalysis,
} from '@/lib/pre3SparklePersistence';
import {
  collectLineZoneProximitySparkle,
  collectOverlayIdsNearLastCandle,
  hasLineZoneProximitySparkle,
} from '@/lib/proximityLineZoneSparkle';
import { subscribeWs } from '@/lib/websocket';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { bollingerBands } from '@/lib/indicators';
import { buildCandlestickApplyOptions, volumeHistogramBarColors } from '@/lib/chartCandleOptions';
import {
  buildWadVolumeMarkers,
  buildVolumeMaLineData,
  buildZoneBreakoutVolumeMarkers,
  buildRvolExtremeMarkers,
  buildVolumeAbsorptionMarkers,
  buildTakerFlowSkewMarkers,
  mergeVolumeMarkerLayers,
  thinVolumeMarkersByBarGap,
  VOLUME_MARKER_PRIORITY,
  candlesToVolumeHistogramData,
  sanitizeChartCandlesForSeries,
} from '@/lib/volumeHistogramIntelligence';
import { normalizeHex6 } from '@/lib/chartHexColor';
import {
  computeExhaustionZoneRukichSeries,
  EXHAUSTION_ZONE_RUKICH_DISPLAY_START,
} from '@/lib/exhaustionZoneRukich';
import { applyUserZoneFill, zoneFillOptsFromSettings, normalizeZoneFillHex } from '@/lib/zoneUserFill';
import { overlayDisplayLabel } from '@/lib/labelTranslation';
import { buildWhaleAutoZones } from '@/lib/whaleAutoZones';
import { buildWhaleZonesFromMemoryRows } from '@/lib/whaleAutoZones';
import {
  CHART_DEV_ZONES_MSBOB_ONLY,
  filterDevMsbObWhaleOverlays,
  isDevMsbObOnlyAllowedOverlay,
} from '@/lib/chartDevPatch';
import { enhanceMsbObDevOverlays } from '@/lib/msbObZoneEnhance';
import { buildWhalePredictionOverlays } from '@/lib/whalePrediction';
import { buildHotZoneRadarOverlays } from '@/lib/hotZoneRadar';
import { buildHyperTrendOverlays } from '@/lib/hyperTrend';
import {
  overlayMatchesSmcDeskCompactView,
  smcDeskConfluenceZoneBadge,
  smcDeskShortZoneCaption,
  smcDeskWhaleToolkitZoneBadge,
} from '@/lib/smcDeskCompactOverlay';
import {
  buildSmcDeskFullBundle,
  buildSmcDeskMarkerPlan,
  groupSmcDeskRowsByPrimitive,
} from '@/lib/smcDeskVisualModel';
import { buildWhaleDynamicRsProOverlays } from '@/lib/whaleDynamicRsPro';
import { buildWhaleLiquidityBiasOverlays } from '@/lib/whaleLiquidityBias';
import {
  computeChartPrimeTrendChannelOverlays,
  computeSuggestedChartPrimePivotLength,
} from '@/lib/chartPrimeTrendChannels';
import { buildCandleAnalysisGuideZones } from '@/lib/candleAnalysisGuide';
import {
  buildSmartOverlayPayload,
  smartOverlayZonesToExecutiveOverlays,
  smartOverlayZonesToOverlays,
} from '@/lib/smartOverlayPayload';
import { buildCandleAnalysisElliottMvpOverlays } from '@/lib/candleAnalysisElliottMvp';
import { buildCandleAnalysisPlaybookPathOverlays } from '@/lib/candleAnalysisPlaybookPath';
import { splitCandleAnalysisAutoOverlays } from '@/lib/candleAnalysisAutoOverlays';
import { buildBibleModeOverlays, buildBibleModeSummaryLines } from '@/lib/bibleCandlePatterns';
import { buildPullbackHotZonePack } from '@/lib/pullbackHotZoneEngine';
import { buildCandleAnalysisCoreSdZones, buildCandleAnalysisCoreSdPivots } from '@/lib/candleAnalysisCoreSdZones';
import type { CandleAnalysisPathTuning } from '@/lib/candleAnalysisMemoryPath';
import {
  buildHashAutoFibonacciCommentaryLines,
  buildHashAutoFibonacciOverlays,
} from '@/lib/hashAutoFibonacci';
import { buildBosWavesBundle } from '@/lib/bosWavesDeltaSweeps';
import { buildVifvgUAlgoBundle } from '@/lib/vifvgUAlgo';
import { buildSmartAdaptiveSignalOverlays } from '@/lib/smartAdaptiveSignal';
import { buildBreakerBlocksAlgoAlphaBundle } from '@/lib/breakerBlocksAlgoAlpha';
import { patchCloseLevelOverlayPrices } from '@/lib/closeOverlayPricePatch';
import { SmcDeskAiFusionHud } from './SmcDeskAiFusionHud';
import { SmcDeskCompositePanel } from './SmcDeskCompositePanel';
import { SmcDeskDepthDeltaStrip } from './SmcDeskDepthDeltaStrip';
import { buildSmcDeskCompositeModel } from '@/lib/smcDeskCompositeModel';
import type { SmcDeskCompositeLayerMask } from '@/lib/smcDeskCompositeModel';
import { buildSmcDeskCompositeChartOverlays } from '@/lib/smcDeskCompositeChartOverlays';
import {
  computeInstitutionalBandInteractionMarkersUnion,
  computeInstitutionalSuperBandData,
  computeInstitutionalSuperTrendMeta,
  institutionalBandTouchMinGapBars,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  type InstitutionalBandInteractionMarker,
  type InstitutionalBandTouchTier,
} from '@/lib/institutionalSuperBand';
import {
  resolveZoneDirectionalColors,
  ZONE_MID_FILL,
  ZONE_MID_STROKE,
} from '@/lib/zoneDirectionalColors';
import { buildSignalSpotForwardReport } from '@/lib/signalSpotForwardStats';
import { buildBitcoinPowerLawLineData, isBitcoinPowerLawChartSymbol } from '@/lib/bitcoinPowerLawBands';
import {
  buildSmcDeskOverlayPack,
  collectStructureMarkCandleHighlights,
  type StructureCandleHighlight,
} from '@/lib/smcDeskOverlay';
import { computeParkfLinRegBandSnapshot } from '@/lib/parkfLinregTrendlineEngine';
import { buildLinRegSmcConfluenceZones } from '@/lib/linregSmcConfluence';
import { buildCpLinregFusionOverlays } from '@/lib/cpLinregFusion';
import { buildLinRegChannelVolumeZones } from '@/lib/linregChannelVolumeZones';
import { buildSmcDeskConfluenceLsPack } from '@/lib/smcDeskConfluenceLsPack';
import { buildSmcDeskBallboySignalOverlay } from '@/lib/smcDeskBallboySignalOverlay';
import { buildSmcDeskRangeBreakoutZones } from '@/lib/smcDeskRangeBreakoutZones';
import { buildSmcEntryPlaybookOverlays, computeSmcEntryPlaybook } from '@/lib/smcEntryPlaybook';
import { buildBjorgumDoubleTapOverlays } from '@/lib/bjorgumDoubleTap';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  HistogramData,
  LineData,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  UTCTimestamp,
  Time,
  TickMarkType,
  CrosshairMode,
  LineStyle,
  LineType,
  MismatchDirection,
  type Logical,
  type LineWidth,
  type MouseEventParams,
} from 'lightweight-charts';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import type { ChartExplainRequest } from '@/types/chartExplain';
import UIModeSwitcher, { type UIMode } from './UIModeSwitcher';
import PullbackHotZoneHud from './PullbackHotZoneHud';
import UnifiedDeskDashboardGuide from './UnifiedDeskDashboardGuide';
import { buildRsiOverboughtOversoldMarkers } from '@/lib/chartRsiExtremeMarkers';
import { buildUnifiedLsSignal } from '@/lib/unifiedSignalEngine';
import { buildProfileFromPanelFeatures, DEFAULT_UNIFIED_PANEL_FEATURES } from '@/lib/unifiedSignalPanelProfile';
import { SIGNAL_GRADE_LABEL_KO } from '@/lib/unifiedSignalTypes';
import ExecutionOverlay, { type ExecutionPositions } from './ExecutionOverlay';
import CandleAnalysisHeader from './CandleAnalysisHeader';
import CandleAnalysisDirectionBadge from './CandleAnalysisDirectionBadge';
import SignalForwardStatsPanel from './SignalForwardStatsPanel';

/** 구조(BOS·존·CHOCH 등) 로켓: 캔들 마커·HUD 모두 🚀/📉 — L/S는 별도 L·S 화살표 */
const LS_ROCKET_PERSIST_KEY = 'ailongshort-ls-rocket-emojis-v1';
const LS_ROCKET_CAP = 500;
/** 구조 로켓 캔들 마커 — 별도 OFF 없이 항상 표시(마커 레이어 칩과 무관) */
const CHART_ROCKET_MARKERS_ALWAYS_ON = true;
/** SuperTrend 스텝 라인 + 밴드 접촉(ST) 마커 — 별도 OFF 없이 항상 표시 */
const CHART_BAND_LINE_AND_TOUCH_ALWAYS_ON = true;
/** 선확(Front-run) 캔들 마커 — buildSmcDeskMarkerPlan 과 동기 (내부 useEffect 상수와 동일 값 유지) */
const CHART_FRONT_RUN_MARKERS_ENABLED = false;
/** SMC 데스크 환영 토스트 — 탭 sessionStorage 1회 */
const SMC_DESK_WELCOME_TOAST_KEY = 'ailongshort-smc-desk-welcome-toast-v1';
/** B: 클릭 패널용 마커 텍스트 → 한 줄 설명 */
function chartMarkerDetailLine(m: { text: string; position: string }): string {
  const tx = String(m.text || '');
  if (!String(tx || '').trim()) return '통합작도 시그널 (색·위치만 표시)';
  if (tx === 'L' || /^L·\d/.test(tx)) return `롱 마커 (${tx}) — 확정/RSI·상단 판정 등`;
  if (tx === 'S' || /^S·\d/.test(tx)) return `숏 마커 (${tx}) — 확정/RSI·상단 판정 등`;
  if (tx.includes('🚀')) return '구조 롱 로켓';
  if (tx.includes('📉')) return '구조 숏 로켓';
  if (/^⋈/.test(tx)) {
    return `통합 롱·숏 시그널 — ${tx} — 구조·지표·존 등 가중 합성(참고)`;
  }
  if (tx.startsWith('ST·')) {
    const segs = tx.split('|');
    if (segs.length >= 5) {
      const head = segs[0];
      const tier = segs[1];
      const score = segs[2];
      const prox = segs[3];
      const sum = segs.slice(4).join('·');
      const dir = head.includes('L') ? '지지·롱' : '저항·숏';
      return `기관밴드 ${dir} · 등급 ${tier} · 품질 ${score} · 근접≈${prox}ATR — ${sum} · 실전 보조(손절·포지션은 본인 판단)`;
    }
    return `기관밴드 ${tx.includes('L') ? '롱' : '숏'} 터치 · SuperTrend(${INSTITUTIONAL_BAND_DEFAULT_PERIOD},${INSTITUTIONAL_BAND_DEFAULT_MULT}) · 실전 보조`;
  }
  if (/^C[↑↓]/.test(tx) || /^c[+\-]/.test(tx)) return `캔들 점수 보조: ${tx}`;
  if (/^T[↑↓]/.test(tx)) return `타이롱 종가: ${tx}`;
  if (tx.startsWith('선반영')) return tx;
  if (tx.includes('🔥')) return 'RSI 과매수(≥70) 구간 — 추격·신규 롱은 리스크, 되돌림·청산 참고용';
  if (tx.includes('💧')) return 'RSI 과매도(≤30) 구간 — 반등·숏 커버 참고용, 즉시 숏 추격은 리스크';
  if (/^AI\s/.test(tx)) return `AI 종합 신호: ${tx} — 구조·확정·RSI·존·MTF·비전·고래·학습 등 가중 합성`;
  if (tx === 'BUY' || tx === 'SELL') return `거래량 고래(WAD, 거래량 패널): ${tx}`;
  if (tx.startsWith('Δ')) return `거래량 급증 + 체결 우세: ${tx}`;
  if (/^Vol[↑↓]/.test(tx)) return `거래량 급증(체결비율 미수집 구간): ${tx}`;
  return `마커: ${tx}`;
}

/** B 클릭 패널: 로켓 설명 → 밴드(ST) 설명 → 기타 순 */
function sortBarSignalDetailLines(lines: string[]): string[] {
  const rank = (s: string): number => {
    if (s.includes('구조 롱 로켓') || s.includes('구조 숏 로켓')) return 0;
    if (s.includes('기관밴드')) return 1;
    return 2;
  };
  return [...lines].sort((a, b) => rank(a) - rank(b));
}

/** 크로스헤어 클릭 time과 마커 map 키(봉 시각) 정렬 */
function matchMarkerDetailLinesByBarTime(
  barTime: number,
  map: Map<number, string[]>,
  candleList: Candle[],
): string[] | undefined {
  const exact = map.get(barTime);
  if (exact && exact.length > 0) return exact;
  const hit = candleList.find((c) => Number(c.time) === barTime);
  if (hit) {
    const alt = map.get(Number(hit.time));
    if (alt && alt.length > 0) return alt;
  }
  for (const [k, lines] of map) {
    if (lines.length > 0 && Math.abs(Number(k) - barTime) <= 1) return lines;
  }
  return undefined;
}

/**
 * 실행(EXECUTION) 전용: 항목을 빼지 않고 **그리기 순서만** 정리한다.
 * 뒤(존·채널면) → 중간(추세·패턴·가로키) → 앞(핀·라벨·SMC·스마트적응)으로 쌓아 겹침을 줄인다.
 */
function organizeExecutionModeOverlays(items: OverlayItem[]): OverlayItem[] {
  const paintTier = (o: OverlayItem): number => {
    const id = String(o.id || '');
    const kind = String(o.kind || '');
    const cat = String(o.category || '');
    if (cat === 'smartAdaptive' || id.startsWith('smart-adaptive-')) return 50;
    if (cat === 'smcDesk') return 45;
    const zoneLike =
      kind === 'zone' ||
      kind === 'fvg' ||
      kind === 'ob' ||
      kind === 'supplyZone' ||
      kind === 'demandZone' ||
      kind === 'bprZone' ||
      kind === 'reactionZone' ||
      cat === 'reactionZone' ||
      kind === 'channelBand';
    if (zoneLike) return 0;
    if (kind === 'harmonic' || kind === 'harmonicLeg') return 5;
    if (
      kind === 'trendLine' ||
      cat === 'trendlineEngine' ||
      cat === 'autoTrendline' ||
      cat === 'chartPrimeTrendChannels' ||
      id.startsWith('diag-')
    ) {
      return 10;
    }
    if (cat === 'patternVision') return 12;
    if (
      kind === 'keyLevel' ||
      kind === 'supportLine' ||
      kind === 'resistanceLine' ||
      kind === 'liquiditySweep' ||
      kind === 'scenario' ||
      kind === 'fibLine' ||
      kind === 'symTriangleTarget' ||
      id.startsWith('close-') ||
      id.startsWith('settlement-') ||
      id.startsWith('ls-plan-')
    ) {
      return 20;
    }
    if (kind === 'rsiDivergenceLine' || cat === 'rsi') return 22;
    if (kind === 'eqh' || kind === 'eql' || kind === 'equilibrium' || kind === 'bos' || kind === 'choch') return 25;
    if (kind === 'label' || kind === 'swingLabel' || kind === 'poi' || kind === 'rsiSignal') return 40;
    return 18;
  };
  return [...items].sort((a, b) => {
    const d = paintTier(a) - paintTier(b);
    if (d !== 0) return d;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** 캔들 위 표시용 — 짧게만(클릭 패널에 전체 근거). unionSource 있으면 합류(H)·정밀(P)를 같은 봉에서 구분 */
function formatInstitutionalBandTouchMarkerChartText(ev: InstitutionalBandInteractionMarker): string {
  const sym = ev.tier === 'A' ? '★' : ev.tier === 'B' ? '◆' : '·';
  const sHint = ev.confluence?.grade === 'S' ? '⚡' : '';
  const lane = ev.unionSource === 'confluence' ? 'H' : ev.unionSource === 'precision' ? 'P' : '';
  if (ev.verdict === 'LONG') {
    return lane ? `${sHint}L${lane}${sym}` : `${sHint}L${sym}`;
  }
  return lane ? `${sHint}S${lane}${sym}` : `${sHint}S${sym}`;
}

/** detailMap용 — 동일 봉에 로켓·L/S와 ST 접촉이 같이 있을 때 접촉 줄만 ST 상세로 연결 */
function markerLooksLikeInstitutionalBandTouch(m: {
  shape?: string;
  text?: string;
}): boolean {
  if (m.shape !== 'arrowUp' && m.shape !== 'arrowDown') return false;
  return /^[⚡]?[LS][HP]?[★◆·]/.test(String(m.text ?? '').trim());
}

/** 봉 클릭 시 패널용 — 기존 파이프 형식 유지(chartMarkerDetailLine의 ST· 분기) */
function formatInstitutionalBandTouchMarkerDetailText(ev: InstitutionalBandInteractionMarker): string {
  const sym = ev.tier === 'A' ? '★' : ev.tier === 'B' ? '◆' : '';
  const head = ev.verdict === 'LONG' ? `ST·L${sym}` : `ST·S${sym}`;
  const sum = ev.summaryParts.slice(0, 8).join('·');
  const prec =
    ev.precisionParts && ev.precisionParts.length
      ? `|정밀:${ev.precisionParts.slice(0, 6).join('·')}`
      : '';
  const cnf = ev.confluence
    ? `|합류${ev.confluence.total}·${ev.confluence.grade}|${ev.confluence.parts.slice(0, 5).join('·')}`
    : '';
  const pipe =
    ev.unionSource === 'confluence' ? '|파이프:합류' : ev.unionSource === 'precision' ? '|파이프:정밀' : '';
  return `${head}|${ev.tier}|${ev.score}|${ev.proximityAtr.toFixed(2)}|${sum}${prec}${cnf}${pipe}`;
}

function institutionalBandTouchMarkerStyle(ev: InstitutionalBandInteractionMarker): { color: string; size: number } {
  const sGrade = ev.confluence?.grade === 'S';
  if (ev.verdict === 'LONG') {
    return {
      color: sGrade ? '#fbbf24' : ev.tier === 'A' ? '#2dd4bf' : ev.tier === 'B' ? '#14b8a6' : '#0d9488',
      size: sGrade || ev.tier === 'A' ? 2 : 1,
    };
  }
  return {
    color: sGrade ? '#fbbf24' : ev.tier === 'A' ? '#f472b6' : ev.tier === 'B' ? '#fb7185' : '#e11d48',
    size: sGrade || ev.tier === 'A' ? 2 : 1,
  };
}

type LsRocketPersistRow = { time: number; direction: 'LONG' | 'SHORT'; tier: 'structure' };
export type LsRocketHudItem = LsRocketPersistRow;
type HigherTfRocketBoostRow = {
  time: number;
  direction: 'LONG' | 'SHORT';
  sourceTf: '1d' | '1w' | '1M';
};

function loadRocketPersistAll(): Record<string, LsRocketPersistRow[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_ROCKET_PERSIST_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LsRocketPersistRow[]>) : {};
  } catch {
    return {};
  }
}

function saveRocketPersistAll(all: Record<string, LsRocketPersistRow[]>) {
  try {
    window.localStorage.setItem(LS_ROCKET_PERSIST_KEY, JSON.stringify(all));
  } catch {}
}

function mergeRocketPersistence(
  storeKey: string,
  structureRockets: AnalyzeResponse['structureRocketSignals'] | undefined,
  timeframe: string,
  slFailSet?: Set<string>,
  candles?: Candle[]
): LsRocketPersistRow[] {
  const all = loadRocketPersistAll();
  let list = (all[storeKey] ?? []).filter((r) => r.tier === 'structure');
  if (slFailSet?.size && candles?.length) {
    list = filterLsRocketsBySlFailures(list, slFailSet, candles);
  }
  for (const rk of structureRockets ?? []) {
    const dir = rk.direction;
    if (dir !== 'LONG' && dir !== 'SHORT') continue;
    /**
     * 같은 time·반대 tier 구조엔 1건만. 예전: findIndex가 time|direction 키라
     * LONG+SHORT가 같은 봉에 같이 localStorage·HUD에 쌓여 뒷구간만 🚀+📉 겹침(스샷).
     */
    list = list.filter((x) => x.time !== rk.time);
    list.push({ time: rk.time, direction: dir, tier: 'structure' });
  }
  {
    const uniq = new Map<number, LsRocketPersistRow>();
    for (const r of list) uniq.set(r.time, r);
    list = [...uniq.values()].sort((a, b) => a.time - b.time);
  }
  const tfN = normalizeChartTimeframe(timeframe);
  const persistMult =
    tfN === '1M' || tfN === '1Y' ? 2 : tfN === '1w' ? 3 : 6;
  const persistFloor = tfN === '1M' || tfN === '1Y' ? 12 : 80;
  const tfCap = Math.min(LS_ROCKET_CAP, Math.max(structureRocketMergeMax(timeframe) * persistMult, persistFloor));
  if (list.length > tfCap) list = list.slice(-tfCap);
  all[storeKey] = list;
  saveRocketPersistAll(all);
  return list;
}

function buildLsRocketHud(persisted: LsRocketPersistRow[]): LsRocketHudItem[] {
  return [...persisted].sort((a, b) => a.time - b.time);
}

/**
 * 심볼·TF 변경 직후·뷰 복원: 전체 fit 대신 `visibleLimit`만큼 **최신 봉 쪽**이 보이도록 스크롤.
 * (알트 전체 히스토리 fit 시 마지막 캔들이 픽셀로 안 보이는 문제 완화)
 */
function applyFocusLatestBars(chart: IChartApi, series: ISeriesApi<'Candlestick'> | null, barCount: number, tf: string): void {
  if (!series || barCount < 1) return;
  const n = barCount;
  const lim = visibleLimit(tf);
  const vis = Math.min(lim, n);
  const from = Math.max(0, n - vis);
  const to = n - 1;
  requestAnimationFrame(() => {
    try {
      chart.timeScale().setVisibleLogicalRange({ from, to });
      /** 먼저 보이는 구간에 맞춤 */
      series.priceScale().applyOptions({ autoScale: true });
      /**
       * lightweight-charts: autoScale === true 이면 패널에서 좌클릭 드래그로 가격축(세로) 이동이 막힘.
       * 한 프레임 뒤 autoScale 끄면 맞춤된 가격 범위는 유지되고, 좌우·위아래 드래그 패닝이 복구됨.
       */
      requestAnimationFrame(() => {
        try {
          series.priceScale().applyOptions({ autoScale: false });
        } catch {
          /* ignore */
        }
      });
    } catch {
      try {
        chart.timeScale().fitContent();
        chart.timeScale().scrollToRealTime();
        series.priceScale().applyOptions({ autoScale: true });
        requestAnimationFrame(() => {
          try {
            series.priceScale().applyOptions({ autoScale: false });
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
    }
  });
}

/**
 * 차트 설정 ON/OFF는 id 단위로 저장되는데, 엔진이 TF마다 봉 인덱스·가격뿐 아니라
 * TF 토큰(1m/5m/1h/4h/1d/1w/1M/1Y 등)도 id에 포함해 같은 오버레이가 TF별 다른 id가 될 수 있음.
 * 숫자 꼬리 + TF 토큰을 제거한 **논리 키**로 묶어, 한 TF에서 ON/OFF 해도 전 TF에 동일 적용.
 */
function stableOverlayVisibilityKey(id: string): string {
  if (!id || typeof id !== 'string') return id;
  const isTfToken = (seg: string): boolean => {
    if (!seg) return false;
    const s = seg.trim();
    return (
      /^(?:\d+(?:m|h|d|w)|\d+M|\d+Y)$/i.test(s) ||
      /^tf[_-]?(?:\d+(?:m|h|d|w)|\d+M|\d+Y)$/i.test(s) ||
      /^timeframe[_-]?(?:\d+(?:m|h|d|w)|\d+M|\d+Y)$/i.test(s)
    );
  };
  /** 핫존 등 id에 티커가 들어가면 심볼만 바꿔도 키가 달라져 차트 설정이 '초기화'처럼 보임 — 논리 키에서 제거 */
  const isLikelySymbolToken = (seg: string): boolean => {
    const s = seg.trim();
    if (s.length < 5) return false;
    return /^[A-Z0-9]{3,}(?:USDT|USDC|BUSD|FDUSD|PERP|USD)$/i.test(s);
  };
  const parts = id.split('-').filter((seg) => !isTfToken(seg) && !isLikelySymbolToken(seg));
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last) || /^\d+\.\d+$/.test(last)) {
      parts.pop();
      continue;
    }
    break;
  }
  return parts.join('-');
}

/** 드래그 오프셋 맵: TF마다 달라진 raw id를 논리 키로 합침 */
function normalizeOverlayOffsetMap(m: Record<string, { dx: number; dy: number }>): Record<string, { dx: number; dy: number }> {
  const out: Record<string, { dx: number; dy: number }> = {};
  for (const [key, val] of Object.entries(m)) {
    if (!val || typeof val.dx !== 'number' || typeof val.dy !== 'number') continue;
    out[stableOverlayVisibilityKey(key)] = val;
  }
  return out;
}

function isOverlayIdHidden(id: string, hidden: Set<string>): boolean {
  if (hidden.has(id)) return true;
  const stable = stableOverlayVisibilityKey(id);
  return stable !== id && hidden.has(stable);
}

const LABEL_SETTINGS_UI_KEY = 'ailongshort-label-settings-ui-v1';

type LabelSettingsPanelPos = { left: number; top: number };

function readLabelSettingsUiFromStorage(): { bodyCollapsed: boolean; pos: LabelSettingsPanelPos | null } {
  if (typeof window === 'undefined') return { bodyCollapsed: false, pos: null };
  try {
    const raw = window.localStorage.getItem(LABEL_SETTINGS_UI_KEY);
    if (!raw) return { bodyCollapsed: false, pos: null };
    const o = JSON.parse(raw) as { bodyCollapsed?: boolean; pos?: { left?: number; top?: number } };
    const bodyCollapsed = !!o.bodyCollapsed;
    const pos =
      o.pos != null && typeof o.pos.left === 'number' && typeof o.pos.top === 'number'
        ? { left: o.pos.left, top: o.pos.top }
        : null;
    return { bodyCollapsed, pos };
  } catch {
    return { bodyCollapsed: false, pos: null };
  }
}

export type ChartSnapshotRef = { getSnapshot: () => string | null };

type PriceStripPosition = 'left' | 'center' | 'right';

/** 축 옆 HTML 가격 박스: width:max-content로 % 계산 고정 후 좌·중·우 + 슬라이더 */
function buildPriceStripOverlayStyle(
  position: PriceStripPosition,
  hShiftPx: number,
  axisPx: number,
  chartWidth: number,
  rest: React.CSSProperties
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 'max-content',
    ...rest,
  };
  if (position === 'right') {
    return { ...base, left: axisPx + hShiftPx, transform: 'translateY(-50%)', textAlign: 'left' };
  }
  if (position === 'center') {
    return {
      ...base,
      left: axisPx + hShiftPx,
      transform: 'translate(-50%, -50%)',
      textAlign: 'center',
    };
  }
  /* left: 오른쪽 끝이 축에 닿음. translateX(-100%)로 왼쪽으로 당김 */
  return {
    ...base,
    left: axisPx + hShiftPx,
    transform: `translate(-100%, -50%)`,
    textAlign: 'right',
  };
}

/**
 * 예전에는 현재가 Y와 겹칠 때 라벨을 살짝 밀었으나, 줌·축소 시 **존·가로선 좌표에서 떨어져 보이는** 원인이 됨.
 * 모든 HTML 라벨은 time·price→픽셀 값에 그대로 붙임(겹침은 htmlLabelStackDy·htmlLabelStackDx로 완화).
 */
function nudgeLabelYFromLastPrice(y: number, _pricePixelY: number | null, _chartH: number, _gap = 36): number {
  return y;
}

/**
 * 분석 엔진 time과 차트 setData time이 어긋나도(일봉 UTC 등) 항상 **실제 캔들 시가**에 맞춤.
 * 모든 분석 오버레이 X는 이 스냅을 거치게 한다.
 */
function nearestCandleOpenTime(candles: Candle[], t: number): number {
  const n = candles.length;
  if (!n || !Number.isFinite(t)) return t;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const mt = candles[mid].time as number;
    if (mt < t) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const cand: number[] = [];
  if (i < n) cand.push(candles[i].time as number);
  if (i > 0) cand.push(candles[i - 1].time as number);
  let bestT = cand[0] ?? t;
  let bestD = Infinity;
  for (const ct of cand) {
    const d = Math.abs(ct - t);
    if (d < bestD) {
      bestD = d;
      bestT = ct;
    }
  }
  return bestT;
}

/**
 * `timeToCoordinate` / `coordinateToTime` 과 동일한 가로 픽셀 범위(타임스케일 폭, 가격축 제외).
 * `rect.width`·`coordinateToTime(rect.width)` 를 쓰면 가격축 영역까지 포함되어 tMax 왜곡 → 줌 시 존·선이 우측으로 드리프트.
 */
function timeScalePixelWidth(ts: ReturnType<IChartApi['timeScale']>, fallback: number): number {
  try {
    const w = ts.width();
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) return w;
  } catch {
    /* ignore */
  }
  return fallback > 0 ? fallback : 1;
}

/** 타임스케일 우측 픽셀 — coordinateToTime 에 넣을 X */
function timeScaleRightPixelX(ts: ReturnType<IChartApi['timeScale']>, rectWidth: number): number {
  const tw = timeScalePixelWidth(ts, rectWidth);
  return Math.max(0, tw - 1);
}

/**
 * 캔들 `time`은 `parseKline` 기준 **Unix 초**. ms가 섞이면 timeScale이 우측(미래 축)으로 보내
 * 존·라벨만 빈 영역에 떠 보임 — mapOverlays·스크린 좌표 전에 통일.
 */
function normalizeOverlayTimeToChartSec(t: number | undefined): number | undefined {
  if (t === undefined || !Number.isFinite(t)) return t;
  if (t >= 1e12) return Math.floor(t / 1000);
  return t;
}

/**
 * 분석 time → 화면 X — 스냅된 봉 시각으로만 timeScale 좌표를 구함(줌·축소 후에도 캔들에 동기화).
 * `tMin~tMax` 선형 보간은 timeScale 비선형과 어긋나 줌·패닝 시 존·선이 미끄러짐 → 사용하지 않음.
 */
function analysisTimeToScreenX(
  candleSeries: Candle[],
  t: number,
  ts: ReturnType<IChartApi['timeScale']>,
  series: ISeriesApi<'Candlestick'>,
  rect: { width: number },
  _pad: number,
  _tMin: number | null,
  _tMax: number | null
): number {
  /** 전 오버레이 공통: 시간→X는 `nearestCandleOpenTime` 금지 → 항상 로드된 봉 하나에만 스냅(줌·패닝 동기) */
  const m = coreMagnetBarTimeToX(candleSeries, t, ts, series);
  if (Number.isFinite(m)) return m;
  const idx = candleIndexAtOrBefore(candleSeries, t);
  try {
    const xLogical = ts.logicalToCoordinate(idx as unknown as Logical);
    if (xLogical != null && Number.isFinite(Number(xLogical))) return Number(xLogical);
  } catch {
    /* ignore */
  }
  try {
    const sBar = series.dataByIndex(idx as unknown as Logical, MismatchDirection.NearestLeft);
    if (sBar?.time != null) {
      const xBySeries = ts.timeToCoordinate(sBar.time as UTCTimestamp);
      if (xBySeries != null && Number.isFinite(Number(xBySeries))) return Number(xBySeries);
    }
  } catch {
    /* ignore */
  }
  const tw = timeScalePixelWidth(ts, rect.width);
  if (candleSeries.length > 1) {
    const ratio = idx / Math.max(1, candleSeries.length - 1);
    return Math.max(0, Math.min(tw, ratio * tw));
  }
  return tw * 0.5;
}

/**
 * 핵심 분석 오버레이: 시간→X 는 라이브러리 네이티브만 사용.
 * `tMin~tMax` 선형 보간은 `timeToCoordinate` 와 척도가 달라 줌·축소 시 존이 캔들에서 미끄러짐.
 */
function analysisTimeToScreenXMagnet(
  candleSeries: Candle[],
  t: number,
  ts: ReturnType<IChartApi['timeScale']>,
  series: ISeriesApi<'Candlestick'>
): number {
  const tSnap = nearestCandleOpenTime(candleSeries, t);
  try {
    const raw = ts.timeToCoordinate(tSnap as UTCTimestamp);
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  } catch {
    /* ignore */
  }
  try {
    const idx = ts.timeToIndex(tSnap as UTCTimestamp, true);
    if (idx != null) {
      const iRound = Math.round(Number(idx));
      const bar = series.dataByIndex(iRound, MismatchDirection.NearestLeft);
      if (bar && bar.time != null) {
        const xSnap = ts.timeToCoordinate(bar.time as UTCTimestamp);
        if (xSnap != null && Number.isFinite(Number(xSnap))) return Number(xSnap);
      }
      const x = ts.logicalToCoordinate(idx as unknown as Logical);
      if (x != null && Number.isFinite(Number(x))) return Number(x);
    }
  } catch {
    /* ignore */
  }
  try {
    const idxLoose = ts.timeToIndex(tSnap as UTCTimestamp, false);
    if (idxLoose != null) {
      const x = ts.logicalToCoordinate(idxLoose as unknown as Logical);
      if (x != null && Number.isFinite(Number(x))) return Number(x);
    }
  } catch {
    /* ignore */
  }
  return NaN;
}

/**
 * 핵심 분석 “봉 자석”: 임의 시각 t → `candleSeries`에서 해당 봉(또는 그 직전 봉) 인덱스를 고른 뒤,
 * **차트 시리즈에 실제로 올라간 봉 시각**(`series.dataByIndex`)으로 timeScale X 계산.
 * React `candles`와 `setData` 직후 한두 프레임·길이 불일치 시에도 캔들과 같은 봉을 가리키게 함.
 */
function coreMagnetBarTimeToX(
  candleSeries: Candle[],
  t: number,
  ts: ReturnType<IChartApi['timeScale']>,
  series: ISeriesApi<'Candlestick'>
): number {
  if (!candleSeries.length) return NaN;
  const tAdj = normalizeOverlayTimeToChartSec(t) ?? t;
  const idx = candleIndexAtOrBefore(candleSeries, tAdj);
  let barTime = Number((candleSeries[idx] as { time?: number }).time);
  try {
    const sBar = series.dataByIndex(idx as unknown as Logical, MismatchDirection.NearestLeft);
    if (sBar && sBar.time != null) {
      const st = Number(sBar.time);
      if (Number.isFinite(st)) barTime = st;
    }
  } catch {
    /* ignore */
  }
  if (!Number.isFinite(barTime)) return NaN;
  try {
    const raw = ts.timeToCoordinate(barTime as UTCTimestamp);
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  } catch {
    /* ignore */
  }
  try {
    const ti = ts.timeToIndex(barTime as UTCTimestamp, true);
    if (ti != null) {
      const bar = series.dataByIndex(Math.round(Number(ti)), MismatchDirection.NearestLeft);
      if (bar?.time != null) {
        const xSnap = ts.timeToCoordinate(bar.time as UTCTimestamp);
        if (xSnap != null && Number.isFinite(Number(xSnap))) return Number(xSnap);
      }
      const x = ts.logicalToCoordinate(ti as unknown as Logical);
      if (x != null && Number.isFinite(Number(x))) return Number(x);
    }
  } catch {
    /* ignore */
  }
  return analysisTimeToScreenXMagnet(candleSeries, barTime, ts, series);
}

/**
 * 핵심 분석 존·가로선 — 모든 TF 공통으로 화면 축소/확대 시에도 timeScale 자석 X 적용.
 * major 엔진 S/R, 캔들분석 핵심 S/D, 고래 DRS/LQB(zoneSpanOnly).
 */
function isCoreAnalysisMagnetOverlayId(tid: string): boolean {
  if (/^major-(support|resistance)-\d+-(zone|line)$/.test(tid)) return true;
  if (/^ca-core-(supplyZone|demandZone)-/.test(tid)) return true;
  if (tid.startsWith('whale-drs-')) return true;
  if (tid === 'whale-lqb-bsl' || tid === 'whale-lqb-ssl') return true;
  return false;
}

/**
 * 캔들분석·통합작도 포함 **모든 모드**에서 zone/line 시간→X 봉 자석 적용 대상.
 * `isCoreAnalysisMagnetOverlayId`는 major/ca-core S·D/고래를 여기에 포함시키는 용도.
 */
function isMagnetBarSnapOverlayId(tid: string): boolean {
  if (tid.includes('aichart1') || tid.includes('aichart-1') || tid.includes('aichart')) return true;
  if (tid.startsWith('whale-auto-')) return true;
  if (isCoreAnalysisMagnetOverlayId(tid)) return true;
  /** FluidTrades S/D·POI(analyze) — mapOverlays와 동일 시리즈로만 자석이 맞고, 누락 시 resolveTimeX 폴백이 화면 중앙으로 튐 */
  if (/^supply-\d+$/.test(tid) || /^demand-\d+$/.test(tid)) return true;
  if (/^poi-supply-\d+$/.test(tid) || /^poi-demand-\d+$/.test(tid)) return true;
  if (tid.startsWith('smc-desk-confluence-')) return true;
  if (tid.startsWith('smc-desk-ob-')) return true;
  if (tid.startsWith('smc-desk-ballboy')) return true;
  if (tid.startsWith('smc-desk-range-break')) return true;
  if (tid.startsWith('smc-entry-playbook-')) return true;
  if (tid.startsWith('smc-linreg-')) return true;
  if (tid.startsWith('parkf-')) return true;
  if (tid.startsWith('cptc-')) return true;
  if (tid.startsWith('whale-alr-')) return true;
  if (tid.startsWith('candle-analysis-')) return true;
  if (tid.startsWith('ca-core-')) return true;
  if (tid.startsWith('smart-overlay-zone')) return true;
  return false;
}

/** 핵심 존: 데이터 상 time1~time2 폭만 쓰는 id(렌더에서 우측은 마지막 캔들 X까지 별도 확장) */
function isCoreAnalysisMagnetZoneStrictWidthId(id: string | undefined): boolean {
  if (!id) return false;
  if (id.includes('aichart1') || id.includes('aichart-1') || id.includes('aichart')) return true;
  if (id.startsWith('whale-auto-')) return true;
  if (/^supply-\d+$/.test(id) || /^demand-\d+$/.test(id)) return true;
  if (id.startsWith('smc-desk-confluence-zone-')) return true;
  if (id.startsWith('smc-desk-ob-')) return true;
  if (id === 'smc-desk-range-break-zone') return true;
  if (id.startsWith('smc-linreg-')) return true;
  if (/^major-(support|resistance)-\d+-zone$/.test(id)) return true;
  if (/^ca-core-(supplyZone|demandZone)-/.test(id)) return true;
  if (id.startsWith('whale-drs-')) return true;
  if (id === 'whale-lqb-bsl' || id === 'whale-lqb-ssl') return true;
  if (
    id.startsWith('smc-entry-playbook-zone') ||
    id === 'smc-entry-playbook-ote' ||
    id === 'smc-entry-playbook-htf-poi' ||
    id === 'smc-entry-playbook-ltf-poi' ||
    id === 'smc-entry-playbook-ifvg'
  ) {
    return true;
  }
  if (id.startsWith('smart-overlay-zone')) return true;
  if (id.startsWith('candle-analysis-')) {
    if (id.startsWith('candle-analysis-elliott-seg-') || id === 'candle-analysis-elliott-next') return false;
    if (id.startsWith('candle-analysis-playbook-')) return false;
    return true;
  }
  return false;
}

/** HTML 라벨만 DOM에 둘지 — 좌표는 데이터 기준, 영역 밖은 overflow:hidden으로 잘림 */
function overlayHtmlLabelIntersectsChart(
  left: number,
  top: number,
  approxW: number,
  approxH: number,
  chartW: number,
  chartH: number,
  margin = 48
): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(top)) return false;
  if (chartW <= 0 || chartH <= 0) return true;
  return (
    top + approxH >= -margin &&
    top <= chartH + margin &&
    left + approxW >= -margin &&
    left <= chartW + margin
  );
}

function shouldHideWhaleAutoZoneChartCaption(item: { id?: string }): boolean {
  // 사용자 요청: 고래 자동존(매집/분배)은 라벨을 항상 보여 기능을 바로 이해할 수 있게 함
  return false;
}

/** API/직렬화에서 숫자가 문자열로 올 때 비율 재해석으로 존·선이 가격축에서 떠 보이는 것 방지 */
function asOverlayFiniteNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** 가로 지지·저항·키레벨 — 라벨을 현재가 Y에서 밀면 선에서 떨어져 보임 */
function isOverlayLineFlatPrice(item: { price1?: number; price2?: number; y1: number; y2: number }): boolean {
  const p1 = asOverlayFiniteNumber(item.price1);
  const p2 = asOverlayFiniteNumber(item.price2);
  if (p1 !== undefined && p2 !== undefined) {
    const m = Math.max(Math.abs(p1), Math.abs(p2), 1e-12);
    if (Math.abs(p1 - p2) / m < 1e-10 || Math.abs(p1 - p2) < 1e-5 * m) return true;
  }
  return Math.abs(item.y2 - item.y1) < 4;
}

/**
 * `priceToCoordinate` 실패·극단 줌 시 라벨이 가격축 밖(볼륨 영역 등)으로 밀리는 것 완화.
 * 보이는 가격 구간으로 한 번 클램프한 뒤 다시 좌표를 구함.
 */
function coordYFromOverlayPrice(
  series: ISeriesApi<'Candlestick'>,
  price: unknown,
  chartHeight: number,
  yFallback: number
): number {
  const p = asOverlayFiniteNumber(price);
  const clampY = (yy: number) => Math.max(0, Math.min(Math.max(0, chartHeight - 1), yy));
  if (p === undefined || !Number.isFinite(p)) return clampY(yFallback);
  try {
    const raw = series.priceToCoordinate(p);
    if (raw != null && Number.isFinite(Number(raw))) return clampY(Number(raw));
  } catch {
    /* ignore */
  }
  try {
    const pr = series.priceScale().getVisibleRange?.();
    if (pr && typeof pr.from === 'number' && typeof pr.to === 'number') {
      const lo = Math.min(pr.from, pr.to);
      const hi = Math.max(pr.from, pr.to);
      if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
        const pc = Math.min(hi, Math.max(lo, p));
        const r2 = series.priceToCoordinate(pc);
        if (r2 != null && Number.isFinite(Number(r2))) return clampY(Number(r2));
        const mid = (lo + hi) / 2;
        const r3 = series.priceToCoordinate(mid);
        if (r3 != null && Number.isFinite(Number(r3))) return clampY(Number(r3));
      }
    }
  } catch {
    /* ignore */
  }
  return clampY(yFallback);
}

/**
 * 선·채널 면·대각 추세 — `priceToCoordinate` 그대로 사용(높이 클램프 없음).
 * 꼭짓점마다 `coordYFromOverlayPrice`로 Y를 잘라 붙이면 줌 시 사다리꼴이 뾰족·찌그러짐.
 */
function geomPriceToPixelY(series: ISeriesApi<'Candlestick'>, price: unknown, yFallback: number): number {
  const p = asOverlayFiniteNumber(price);
  if (p === undefined || !Number.isFinite(p)) return yFallback;
  try {
    const raw = series.priceToCoordinate(p);
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  } catch {
    /* ignore */
  }
  try {
    const pr = series.priceScale().getVisibleRange?.();
    if (pr && typeof pr.from === 'number' && typeof pr.to === 'number') {
      const lo = Math.min(pr.from, pr.to);
      const hi = Math.max(pr.from, pr.to);
      if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
        const pc = Math.min(hi, Math.max(lo, p));
        const r2 = series.priceToCoordinate(pc);
        if (r2 != null && Number.isFinite(Number(r2))) return Number(r2);
      }
    }
  } catch {
    /* ignore */
  }
  return yFallback;
}

/** BOS/CHOCH·스윙 등: 겹침 완화 시 아래로만 밀면 줌아웃 시 볼륨 쪽으로 떨어짐 → 수평 분산 대상 */
function overlayKindWantsHorizontalLabelFan(id: string, kind: string): boolean {
  if (kind === 'bos' || kind === 'choch' || kind === 'liquiditySweep' || kind === 'equilibrium') return true;
  if (kind === 'swingLabel' || kind === 'poi') return true;
  if (id.startsWith('smc-desk-')) return true;
  return false;
}

function mapOverlays(
  overlays: OverlayItem[],
  candles: Candle[],
  timeframe: string,
  options?: { useZonePriceRange?: boolean; closeOverlayRange?: { min: number; max: number } }
) {
  const limit = visibleLimit(timeframe);
  const visible = candles.slice(-limit);
  if (visible.length < 2) return [];

  const candleMin = Math.min(...visible.map(c => c.low));
  const candleMax = Math.max(...visible.map(c => c.high));
  const candleRange = Math.max(1e-9, candleMax - candleMin);
  const zoneMin = ZONE_PRICE_FLOOR;
  const zoneMax = ZONE_PRICE_CEIL;
  const zoneRange = Math.max(1e-9, zoneMax - zoneMin);
  const visibleLen = visible.length;
  const baseIdx = candles.length - visibleLen;
  const closeRange = options?.closeOverlayRange;
  const closeRangeSize = closeRange ? Math.max(1e-9, closeRange.max - closeRange.min) : 0;

  const pickTime = (x: number) => {
    const clamped = Math.max(0, Math.min(1, x));
    const idxInVisible = visibleLen <= 1 ? 0 : clamped * (visibleLen - 1);
    const idxInFull = baseIdx + Math.round(idxInVisible);
    const safe = Math.max(0, Math.min(candles.length - 1, idxInFull));
    return candles[safe].time;
  };
  const pickTimeFromFull = (x: number) => {
    const clamped = Math.max(0, Math.min(1, x));
    const idxInFull = candles.length <= 1 ? 0 : Math.round(clamped * (candles.length - 1));
    const safe = Math.max(0, Math.min(candles.length - 1, idxInFull));
    return candles[safe].time;
  };

  return overlays.map(item => {
    const isTrendAnchor =
      item.kind === 'trendLine' ||
      (item as any).category === 'trendlineEngine' ||
      (item as any).category === 'autoTrendline' ||
      (typeof (item as any).id === 'string' && (item as any).id.startsWith('diag-'));
    const pickTimeForItem = isTrendAnchor ? pickTimeFromFull : pickTime;
    const isCloseLevel = (item as any).id?.startsWith?.('close-');
    const isSwingTapZone = (item as any).id === 'swing-tap-zone';
    const useCloseRange = (isCloseLevel || isSwingTapZone) && closeRange;
    const useZoneRange = !useCloseRange && options?.useZonePriceRange && item.category === 'strongZone';
    const maxP = useCloseRange ? closeRange!.max : useZoneRange ? zoneMax : candleMax;
    const range = useCloseRange ? closeRangeSize : useZoneRange ? zoneRange : candleRange;
    const pickPrice = (y: number) => maxP - y * range;
    let t1 = asOverlayFiniteNumber(item.time1) ?? pickTimeForItem(item.x1);
    let t2 =
      item.time2 != null
        ? asOverlayFiniteNumber(item.time2) ?? (typeof item.x2 === 'number' ? pickTimeForItem(item.x2) : undefined)
        : typeof item.x2 === 'number'
          ? pickTimeForItem(item.x2)
          : undefined;
    /**
     * major 핵심 지지/저항: `/api/analyze`가 넣은 time1~time2(가시 분석 구간)를 유지한다.
     * 예전에는 `candles.slice(-visibleLimit)` 첫·마지막으로 덮어 “항상 최신 N봉”에 붙여
     * 좌우 패닝·줌 시 캔들과 어긋난 채 빈 축 쪽에 떠 보이는 버그가 났음.
     */
    const p1 = asOverlayFiniteNumber(item.price1) ?? pickPrice(item.y1);
    const p2 =
      item.price2 != null || typeof item.y2 === 'number'
        ? asOverlayFiniteNumber(item.price2) ?? (typeof item.y2 === 'number' ? pickPrice(item.y2) : undefined)
        : undefined;
    return {
      ...item,
      time1: normalizeOverlayTimeToChartSec(t1) as number,
      price1: p1,
      time2: normalizeOverlayTimeToChartSec(t2),
      price2: p2,
    };
  });
}

/** time 기준 마지막으로 time<=t 인 봉 인덱스 (오버레이 시간과 동일 캔들 배열 기준) */
function candleIndexAtOrBefore(candles: Candle[], t: number): number {
  if (!candles.length) return 0;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const mt = Number((candles[mid] as { time?: number }).time);
    if (mt <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function isLineKind(kind: OverlayItem['kind']) {
  return ['supportLine', 'resistanceLine', 'trendLine', 'liquiditySweep', 'bos', 'choch', 'eqh', 'eql', 'scenario', 'equilibrium', 'strongHigh', 'strongLow', 'fibLine', 'harmonic', 'harmonicLeg', 'rsiDivergenceLine', 'symTriangleTarget', 'keyLevel', 'entry', 'stop', 'target'].includes(kind);
}

/** 가로선·추세선 HTML 라벨 박스(렌더 좌표와 동일 공식) — 겹침 스택용 */
function estimateLineOverlayHtmlLabelBox(
  item: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    kind: string;
    id?: string;
    label?: unknown;
    noProject?: boolean;
    chartHeight?: number;
    xMaxRight?: number;
    price1?: number;
    price2?: number;
  },
  getLabelAlign: (id: string) => 'left' | 'center' | 'right',
  getLabelHShift: (id: string) => number,
  lastClosePixelY: number | null,
  liveDx = 0,
  liveDy = 0
): { left: number; top: number; w: number; h: number; pri: number } | null {
  if (!item.label || typeof item.x2 !== 'number') return null;
  if (!isLineKind(item.kind as OverlayItem['kind'])) return null;
  const id = String(item.id || '');
  const rawMinX = Math.min(item.x1, item.x2);
  const rawMinY = Math.min(item.y1, item.y2);
  const baseMinX = rawMinX + liveDx;
  const baseMinY = rawMinY + liveDy;
  const segW = Math.abs(item.x2 - item.x1) || 1;
  const rawMaxRight = item.xMaxRight ?? rawMinX + segW;
  const xMaxRight = rawMaxRight + liveDx;
  const noProjectSeg = Boolean(item.noProject);
  const lineWidth = noProjectSeg ? Math.max(segW, 1) : Math.max(segW, xMaxRight - baseMinX);
  const lineHeight = Math.max(6, Math.abs(item.y2 - item.y1));
  const yAtRight =
    item.y1 +
    liveDy +
    (item.y2 - item.y1) * ((rawMaxRight - item.x1) / segW);
  const x1 = item.x1 + liveDx - baseMinX;
  const y1 = item.y1 + liveDy - baseMinY;
  const isTapLine = id.startsWith('tap-');
  const x2 = noProjectSeg
    ? item.x2 + liveDx - baseMinX
    : (isTapLine ? (item.x2 ?? rawMaxRight) + liveDx : xMaxRight) - baseMinX;
  const y2 = noProjectSeg ? item.y2 + liveDy - baseMinY : yAtRight - baseMinY;
  const align = getLabelAlign(id);
  const textX = align === 'left' ? x1 + 6 : align === 'right' ? Math.max(x1 + 6, x2 - 4) : (x1 + x2) / 2;
  const tapLabelNudge =
    id === 'tap-breakout'
      ? -14
      : id === 'tap-retest-support'
        ? 10
        : id === 'tap-retest-support-2'
          ? 16
          : id === 'tap-resistance'
            ? -10
            : id === 'tap-entry'
              ? -12
              : id === 'tap-stop'
                ? 12
                : id === 'tap-target'
                  ? -16
                  : 0;
  const labelNudge = (id === 'tailong-resistance' ? -10 : id === 'tailong-support' ? 10 : 0) + tapLabelNudge;
  const labelOnlyY = Math.max(12, lineHeight / 2) + labelNudge;
  const tapTextXOffset =
    id === 'tap-breakout'
      ? 8
      : id === 'tap-resistance'
        ? 12
        : id === 'tap-retest-support'
          ? 10
          : id === 'tap-retest-support-2'
            ? 22
            : id === 'tap-entry'
              ? 6
              : id === 'tap-stop'
                ? 6
                : id === 'tap-target'
                  ? 4
                  : 8;
  const tapTextX = Math.max(x1 + 8, x2 - tapTextXOffset);
  const finalTextX = isTapLine ? tapTextX : textX;
  const lineLabelHShift = getLabelHShift(id);
  const lineLabelLeft = baseMinX + finalTextX - 110 + lineLabelHShift;
  let lineLabelTop = baseMinY + labelOnlyY - 12;
  const chartH = item.chartHeight ?? 720;
  const skipLastCloseNudge = isOverlayLineFlatPrice({
    price1: item.price1,
    price2: item.price2,
    y1: item.y1 + liveDy,
    y2: item.y2 + liveDy,
  });
  if (lastClosePixelY != null && !skipLastCloseNudge) {
    lineLabelTop = nudgeLabelYFromLastPrice(lineLabelTop, lastClosePixelY, chartH - 12);
  }
  const pri =
    id.startsWith('lux-star-')
      ? 5
      : item.kind === 'keyLevel'
        ? 0
        : ['bos', 'choch', 'liquiditySweep', 'equilibrium'].includes(item.kind)
          ? 1
          : 3;
  return { left: lineLabelLeft, top: lineLabelTop, w: 260, h: 28, pri };
}

/** 동일 id 중복 시 마지막 항목만 유지 — 패닝 시 겹침·복제처럼 보이는 원인 방지 */
function dedupeOverlaysById(items: OverlayItem[]): OverlayItem[] {
  const map = new Map<string, OverlayItem>();
  for (const it of items) {
    map.set(it.id, it);
  }
  return Array.from(map.values());
}

/** TV·기관 작도 느낌: 짙은 캔버스, 세로 점선·가로 실선 그리드, 틸 크로스헤어, 현재가 강조 */
type ChartThemePack = {
  bg: string;
  text: string;
  gridVert: string;
  gridHorz: string;
  border: string;
  crosshairLine: string;
  crosshairLabelBg: string;
  lastPriceLine: string;
  /** 거래량 패널 거래량 SMA 점선 */
  volumeHistogramMaLine: string;
};

const chartThemes: Record<'dark' | 'light', ChartThemePack> = {
  dark: {
    bg: '#070a0f',
    text: '#e8edf4',
    gridVert: 'rgba(100,116,139,0.10)',
    gridHorz: 'rgba(100,116,139,0.055)',
    border: 'rgba(94,234,212,0.18)',
    crosshairLine: 'rgba(45,212,191,0.58)',
    crosshairLabelBg: 'rgba(7,10,15,0.94)',
    lastPriceLine: 'rgba(45,212,191,0.88)',
    volumeHistogramMaLine: 'rgba(148, 180, 198, 0.88)',
  },
  light: {
    bg: '#f1f5f9',
    text: '#0f172a',
    gridVert: 'rgba(15,23,42,0.07)',
    gridHorz: 'rgba(15,23,42,0.045)',
    border: 'rgba(15,23,42,0.14)',
    crosshairLine: 'rgba(13,148,136,0.5)',
    crosshairLabelBg: 'rgba(255,255,255,0.96)',
    lastPriceLine: 'rgba(13,148,136,0.92)',
    volumeHistogramMaLine: 'rgba(51, 65, 85, 0.78)',
  },
};

const CHART_PRO_FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';

function chartGridOptions(th: ChartThemePack) {
  return {
    vertLines: { color: th.gridVert, style: LineStyle.SparseDotted, visible: true },
    horzLines: { color: th.gridHorz, style: LineStyle.Solid, visible: true },
  };
}

function chartCrosshairOptions(th: ChartThemePack) {
  const w = 1 as LineWidth;
  return {
    mode: CrosshairMode.Normal,
    vertLine: {
      color: th.crosshairLine,
      width: w,
      style: LineStyle.Dashed,
      visible: true,
      labelVisible: true,
      labelBackgroundColor: th.crosshairLabelBg,
    },
    horzLine: {
      color: th.crosshairLine,
      width: w,
      style: LineStyle.Dashed,
      visible: true,
      labelVisible: true,
      labelBackgroundColor: th.crosshairLabelBg,
    },
  };
}

type SoftenZoneFillOpts = {
  /** rgba·#hex 변환 후 알파 하한 — 과도한 감쇠로 존이 사라지는 것 방지 */
  minAlpha?: number;
};

/** 존 면 색 알파 축소 — 차트 정리감 (#RRGGBB → rgba). `opts.minAlpha`로 하한 고정 가능 */
function softenZoneFill(css: string | undefined, mult = 0.55, opts?: SoftenZoneFillOpts): string {
  const minA = opts?.minAlpha;
  const clampAlpha = (raw: number) => {
    const a = Math.min(1, raw);
    return typeof minA === 'number' && Number.isFinite(minA) ? Math.max(minA, a) : a;
  };
  const c = css || 'rgba(113,247,189,0.18)';
  const m = c.match(/^rgba\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
  if (m) {
    const a = clampAlpha(parseFloat(m[4]) * mult);
    return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  }
  const hx = c.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (hx) {
    const n = parseInt(hx[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const a = clampAlpha(0.16 * mult);
    return `rgba(${r},${g},${b},${a})`;
  }
  return c;
}

/** `zoneFillPreserve` 존: max-clean / 실행캄 / 기본 레이아웃별 soften 배율 */
function zoneFillPreserveLayoutMult(maxClean: boolean, executionCalm: boolean): number {
  if (maxClean) return 0.74;
  if (executionCalm) return 0.8;
  return 0.86;
}

/** 통합작도: 캔들 뒤 존 면 — 롱·지지 톤(초록) / 숏·저항 톤(빨강) + 우측 짧은 캡션 */
type UnifiedDeskUnderChartZoneStyle = {
  background: string;
  border?: string;
  caption: string;
  captionColor: string;
};

function shortUnifiedCaption(s: string, max = 22): string {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** 엔진 라벨에 방향이 없을 때만 롱/숏 접두 — 존 우측 캡션에 매매 방향 표기 */
function withLongShortCaption(lbl: string, direction: 'long' | 'short', fallbackWord: string): string {
  const t = String(lbl || '').trim();
  const hasDir =
    /(?:^|[\s·])(롱|숏)(?:[\s·]|$)/.test(t) ||
    /상승|하락|매수|매도|\b(long|short|bull|bear)\b/i.test(t);
  const prefix = direction === 'long' ? '롱' : '숏';
  if (t && hasDir) return shortUnifiedCaption(t);
  const core = t || fallbackWord;
  return shortUnifiedCaption(`${prefix} ${core}`);
}

/** SMC 엔트리 플레이북 — 분석 캔들 좌표 고정, 드래그·사용자 오프셋 미적용 */
function isSmcEntryPlaybookOverlayId(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith('smc-entry-playbook-');
}

function inferUnifiedDeskBiasFromOverlayColor(color: string | undefined): 'long' | 'short' | 'mid' | 'neutral' {
  const c = String(color || '');
  if (c.includes('34,197,94') || c.includes('22,197,94') || c.includes('74,222,128')) return 'long';
  if (c.includes('239,68,68') || c.includes('220,38,38') || c.includes('248,113,113')) return 'short';
  /** 중립·중간대·BPR·진입 반응구간 — 파랑 */
  if (c.includes('59,130,246') || c.includes('96,165,250') || c.includes('37,99,235')) return 'mid';
  if (c.includes('234,179,8') || c.includes('245,158,11')) return 'neutral';
  return 'neutral';
}

function unifiedDeskUnderChartZonePresentation(
  item: OverlayItem,
  opts?: { isCandleAnalysisZone?: boolean; isCaCoreSd?: boolean }
): UnifiedDeskUnderChartZoneStyle | null {
  const kind = item.kind;
  const id = String(item.id ?? '');
  const lbl = String(item.label ?? '').trim();
  const sc = (s: string) => shortUnifiedCaption(s);

  if (opts?.isCaCoreSd || opts?.isCandleAnalysisZone) {
    if (!lbl) return null;
    const b = inferUnifiedDeskBiasFromOverlayColor(typeof item.color === 'string' ? item.color : undefined);
    if (b === 'long') {
      return {
        background: 'rgba(34,197,94,0.16)',
        border: '1px solid rgba(34,197,94,0.36)',
        caption: sc(lbl),
        captionColor: '#bbf7d0',
      };
    }
    if (b === 'short') {
      return {
        background: 'rgba(239,68,68,0.16)',
        border: '1px solid rgba(239,68,68,0.36)',
        caption: sc(lbl),
        captionColor: '#fecaca',
      };
    }
    if (b === 'mid') {
      return {
        background: ZONE_MID_FILL,
        border: `1px solid ${ZONE_MID_STROKE}`,
        caption: sc(lbl),
        captionColor: '#bfdbfe',
      };
    }
    return {
      background: softenZoneFill(typeof item.color === 'string' ? item.color : undefined, 0.22),
      border: '1px solid rgba(148,163,184,0.28)',
      caption: sc(lbl),
      captionColor: '#e2e8f0',
    };
  }

  if (kind === 'demandZone') {
    return {
      background: 'rgba(34,197,94,0.20)',
      border: '1px solid rgba(34,197,94,0.42)',
      caption: sc(lbl) || '지지·수요',
      captionColor: '#bbf7d0',
    };
  }
  if (kind === 'supplyZone') {
    return {
      background: 'rgba(239,68,68,0.20)',
      border: '1px solid rgba(239,68,68,0.42)',
      caption: sc(lbl) || '저항·공급',
      captionColor: '#fecaca',
    };
  }
  if (kind === 'reactionZone') {
    if (id === 'reaction-zone-support') {
      return {
        background: 'rgba(34,197,94,0.18)',
        border: '1px solid rgba(34,197,94,0.38)',
        caption: '반응·지지',
        captionColor: '#bbf7d0',
      };
    }
    if (id === 'reaction-zone-resistance') {
      return {
        background: 'rgba(239,68,68,0.18)',
        border: '1px solid rgba(239,68,68,0.38)',
        caption: '반응·저항',
        captionColor: '#fecaca',
      };
    }
    if (id === 'reaction-zone-entry') {
      return {
        background: ZONE_MID_FILL,
        border: `1px solid ${ZONE_MID_STROKE}`,
        caption: '반응·진입',
        captionColor: '#bfdbfe',
      };
    }
  }
  if (kind === 'fvg') {
    const up = lbl.includes('상승') || /bull/i.test(lbl);
    const down = lbl.includes('하락') || /bear/i.test(lbl);
    if (up && !down) {
      return {
        background: 'rgba(34,197,94,0.16)',
        border: '1px solid rgba(34,197,94,0.36)',
        caption: withLongShortCaption(lbl, 'long', 'FVG'),
        captionColor: '#bbf7d0',
      };
    }
    if (down && !up) {
      return {
        background: 'rgba(239,68,68,0.16)',
        border: '1px solid rgba(239,68,68,0.36)',
        caption: withLongShortCaption(lbl, 'short', 'FVG'),
        captionColor: '#fecaca',
      };
    }
    const bias = inferUnifiedDeskBiasFromOverlayColor(typeof item.color === 'string' ? item.color : undefined);
    if (bias === 'long') {
      return {
        background: 'rgba(34,197,94,0.14)',
        border: '1px solid rgba(34,197,94,0.32)',
        caption: withLongShortCaption(lbl, 'long', 'FVG'),
        captionColor: '#bbf7d0',
      };
    }
    if (bias === 'short') {
      return {
        background: 'rgba(239,68,68,0.14)',
        border: '1px solid rgba(239,68,68,0.32)',
        caption: withLongShortCaption(lbl, 'short', 'FVG'),
        captionColor: '#fecaca',
      };
    }
    if (bias === 'mid') {
      return {
        background: ZONE_MID_FILL,
        border: `1px solid ${ZONE_MID_STROKE}`,
        caption: sc(lbl) || 'FVG',
        captionColor: '#bfdbfe',
      };
    }
    return null;
  }
  if (kind === 'ob') {
    const colBias = inferUnifiedDeskBiasFromOverlayColor(typeof item.color === 'string' ? item.color : undefined);
    const up = lbl.includes('롱') || lbl.includes('상승') || colBias === 'long';
    const down = lbl.includes('숏') || lbl.includes('하락') || colBias === 'short';
    if (up && !down) {
      return {
        background: 'rgba(34,197,94,0.16)',
        border: '1px solid rgba(34,197,94,0.36)',
        caption: withLongShortCaption(lbl, 'long', 'OB'),
        captionColor: '#bbf7d0',
      };
    }
    if (down && !up) {
      return {
        background: 'rgba(239,68,68,0.16)',
        border: '1px solid rgba(239,68,68,0.36)',
        caption: withLongShortCaption(lbl, 'short', 'OB'),
        captionColor: '#fecaca',
      };
    }
    if (colBias === 'long') {
      return {
        background: 'rgba(34,197,94,0.14)',
        border: '1px solid rgba(34,197,94,0.32)',
        caption: withLongShortCaption(lbl, 'long', 'OB'),
        captionColor: '#bbf7d0',
      };
    }
    if (colBias === 'short') {
      return {
        background: 'rgba(239,68,68,0.14)',
        border: '1px solid rgba(239,68,68,0.32)',
        caption: withLongShortCaption(lbl, 'short', 'OB'),
        captionColor: '#fecaca',
      };
    }
    if (colBias === 'mid') {
      return {
        background: ZONE_MID_FILL,
        border: `1px solid ${ZONE_MID_STROKE}`,
        caption: sc(lbl) || 'OB',
        captionColor: '#bfdbfe',
      };
    }
    return null;
  }
  if (kind === 'bprZone') {
    return {
      background: ZONE_MID_FILL,
      border: `1px solid ${ZONE_MID_STROKE}`,
      caption: sc(lbl) || 'BPR',
      captionColor: '#bfdbfe',
    };
  }
  if (kind === 'zone') {
    const b = inferUnifiedDeskBiasFromOverlayColor(typeof item.color === 'string' ? item.color : undefined);
    if (b === 'long' && lbl) {
      return {
        background: 'rgba(34,197,94,0.14)',
        border: '1px solid rgba(34,197,94,0.30)',
        caption: withLongShortCaption(lbl, 'long', '존'),
        captionColor: '#bbf7d0',
      };
    }
    if (b === 'short' && lbl) {
      return {
        background: 'rgba(239,68,68,0.14)',
        border: '1px solid rgba(239,68,68,0.30)',
        caption: withLongShortCaption(lbl, 'short', '존'),
        captionColor: '#fecaca',
      };
    }
    if (b === 'mid' && lbl) {
      return {
        background: ZONE_MID_FILL,
        border: `1px solid ${ZONE_MID_STROKE}`,
        caption: sc(lbl),
        captionColor: '#bfdbfe',
      };
    }
    if (lbl) {
      return {
        background: softenZoneFill(typeof item.color === 'string' ? item.color : undefined, 0.22),
        border: '1px solid rgba(148,163,184,0.28)',
        caption: sc(lbl),
        captionColor: '#e2e8f0',
      };
    }
  }
  return null;
}

/** Lux 자동 추세선: 마지막 봉 X에서 차트 가용 너비의 이 비율만큼만 우측 연장 (전체 폭까지 미는 것 방지) */

const NEARBY_BARS = 8;

/** 플로팅 메뉴 translate 보정 — 브라우저 줌·창 축소·localStorage 위치가 tv-frame 밖으로 나가면 복구 */
const CHART_FLOATING_MENU_PAD = 6;
function correctFloatingMenuTranslate(
  pos: { x: number; y: number },
  frame: DOMRect,
  menuRectAtPos: DOMRect
): { x: number; y: number } {
  const pad = CHART_FLOATING_MENU_PAD;
  let { x, y } = pos;
  let left = menuRectAtPos.left;
  let right = menuRectAtPos.right;
  let top = menuRectAtPos.top;
  let bottom = menuRectAtPos.bottom;
  for (let pass = 0; pass < 4; pass++) {
    let dx = 0;
    let dy = 0;
    if (left < frame.left + pad) dx = frame.left + pad - left;
    else if (right > frame.right - pad) dx = frame.right - pad - right;
    if (top < frame.top + pad) dy = frame.top + pad - top;
    else if (bottom > frame.bottom - pad) dy = frame.bottom - pad - bottom;
    if (dx === 0 && dy === 0) break;
    x += dx;
    y += dy;
    left += dx;
    right += dx;
    top += dy;
    bottom += dy;
  }
  return { x, y };
}

const BULK_LABEL_KINDS = new Set(['entry', 'stop', 'target', 'label', 'poi', 'swingLabel', 'rsiSignal']);

/** `라벨X` / `존X` / 통합작도 텍스트 숨김과 무관하게 **AI_ZONE 전용** 오버레이는 항상 통과 */
function isAiZoneEngineOverlayId(id: string): boolean {
  return id.startsWith('ai-zone-') || id.startsWith('ai-lllh-') || id.startsWith('ai-cp-lr-');
}

/** AI 분석: HTML 오버레이 DOM·좌표 계산 부담 — 화면용 상한(우선순위로 잘라냄) */
const AI_ZONE_MAX_SCREEN_OVERLAYS = 96;

function aiZoneScreenOverlayKeepScore(id: string, kind: string, cat: string): number {
  if (isAiZoneEngineOverlayId(id)) {
    if (id === 'ai-zone-main' || id === 'ai-zone-long-ref' || id === 'ai-zone-short-ref' || id === 'ai-zone-invalidation' || id === 'ai-zone-target') return 100;
    if (id === 'ai-zone-status' || id === 'ai-cp-lr-label' || id.startsWith('ai-zone-fallback-')) return 99;
    if (id.startsWith('ai-lllh-') || id.startsWith('ai-cp-lr-')) return 95;
    if (id.startsWith('ai-zone-sr-') || id.startsWith('ai-swing-')) return 90;
    if (id.startsWith('ai-zone-')) return 88;
    return 86;
  }
  if (id.startsWith('cptc-')) return 90;
  if (id.startsWith('close-') || id.startsWith('tap-') || id.startsWith('settlement-') || id.startsWith('ls-plan-')) return 78;
  if (id.startsWith('hotzone-') || id.startsWith('htf-cp-')) return 72;
  if (id.startsWith('whale-') && (id.includes('lqb') || id.includes('drs') || id.includes('alr') || id.startsWith('whale-chart-prime'))) return 70;
  if (id.startsWith('whale-')) return 60;
  if (id.startsWith('parkf-') || id.startsWith('smc-linreg-') || id.startsWith('smc-desk-confluence-')) return 64;
  if (id.startsWith('smc-composite-') || id.startsWith('smc-entry-playbook-') || id.startsWith('smc-desk-range-break')) return 50;
  if (cat === 'chartPrimeTrendChannels' || kind === 'channelBand') return 58;
  if (kind === 'zone' || kind === 'demandZone' || kind === 'supplyZone' || kind === 'ob' || kind === 'fvg' || kind === 'bprZone' || kind === 'reactionZone') return 45;
  if (kind === 'trendLine' || kind === 'keyLevel' || kind === 'supportLine' || kind === 'resistanceLine') return 40;
  if (kind === 'label' || kind === 'swingLabel' || kind === 'poi' || kind === 'rsiSignal') return 22;
  return 15;
}

/** 캔들분석: 차트에서 zone·OB·FVG 등 면 요소 전부 숨김(가로선·점선·라벨 등은 유지) */
/** 캔들분석·통합작도 `chartBuySellZoneFocus`: 매수·매도 존(면) + 핵심 S/D 피벗 라벨만 */
function overlayMatchesBuySellZoneFocus(item: OverlayItem): boolean {
  const k = item.kind;
  const cat = String(item.category || '');
  const id = String(item.id || '');
  const zoneKinds = new Set<OverlayItem['kind']>([
    'zone',
    'ob',
    'supplyZone',
    'demandZone',
    'reactionZone',
    'bprZone',
    'fvg',
  ]);
  /** 핵심면: LinReg 밴드·누적·합류 등 요청 레이어만 smcDesk에서 통과 (EQ/프리디스카운트 등은 제외) */
  if (cat === 'smcDesk') {
    const linOrConf = id.startsWith('smc-linreg-') || id.startsWith('smc-desk-confluence-');
    const rangeBr = id.startsWith('smc-desk-range-break');
    const entryPb = id.startsWith('smc-entry-playbook-');
    if (!linOrConf && !rangeBr && !entryPb && !(id === 'smc-desk-ballboy-signal' && k === 'label')) return false;
    if (id === 'smc-desk-range-break-label' && k === 'label') return true;
    if (id === 'smc-desk-range-break-zone' && zoneKinds.has(k)) return true;
    if (id === 'smc-desk-ballboy-signal' && k === 'label') return true;
    if (id.startsWith('smc-desk-confluence-marker-') && k === 'label') return true;
    if (zoneKinds.has(k)) return true;
    return false;
  }
  if (zoneKinds.has(k)) return true;
  if (cat === 'candleAnalysisCoreSd' && k === 'label' && id.startsWith('ca-core-pivot-')) return true;
  return false;
}

function candleAnalysisOverlayIsHiddenZone(o: Record<string, unknown>): boolean {
  if (String(o.category || '') === 'smcDesk') return false;
  const id = String(o.id || '');
  /** analyze.ts major 지지·저항 띠(핵심 지지/저항 N% …) — 캔들분석·통합작도에서도 MAX와 동일하게 유지 */
  if (/^major-support-\d+-zone$/.test(id) || /^major-resistance-\d+-zone$/.test(id)) return false;
  if (id.startsWith('candle-analysis-hash-fib-')) return false;
  if (id.startsWith('candle-analysis-bosw-')) return false;
  if (id.startsWith('candle-analysis-vifvg-')) return false;
  if (id.startsWith('candle-analysis-brk-')) return false;
  if (String(o.category || '') === 'candleAnalysisCoreSd') return false;
  const k = String(o.kind || '');
  if (
    ['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone', 'po3Phase'].includes(k)
  ) {
    return true;
  }
  const cat = String(o.category || '');
  if (cat === 'reactionZone') return true;
  return false;
}

function overlayMatchesBulkLabelHide(o: Record<string, unknown>): boolean {
  const id = String(o.id || '');
  if (isAiZoneEngineOverlayId(id)) return false;
  /** 캔들분석 TV식 S/D 피벗 콜아웃 — 일괄 라벨 숨김과 분리 */
  if (id.startsWith('ca-core-pivot-')) return false;
  if (id.startsWith('htf-cp-')) return false;
  if (id.startsWith('hotzone-cp-hud')) return false;
  /** ParkF LinReg·피벗 콜아웃 — TF마다 동일하게 유지(일괄 라벨 숨김에서 제외) */
  if (id.startsWith('parkf-')) return false;
  if (id.startsWith('vts-')) return false;
  if (id.startsWith('candle-analysis-ai-draw-')) return false;
  if (id.startsWith('candle-analysis-hash-fib-')) return false;
  if (id.startsWith('candle-analysis-bosw-')) return false;
  if (id.startsWith('candle-analysis-vifvg-')) return false;
  if (id.startsWith('smart-adaptive-')) return false;
  if (id.startsWith('candle-analysis-brk-mk-')) return false;
  if (id.startsWith('zone-smbc-')) return false;
  /** ChartPrime 유동성 브레이크(LV/MV/HV) — 일괄 라벨 숨김에서 제외 */
  if (id === 'cptc-break-liq') return false;
  if (id.startsWith('bible-cp-')) return false;
  if (id === 'smc-desk-ballboy-signal') return false;
  if (id === 'smc-desk-range-break-label') return false;
  if (id.startsWith('smc-entry-playbook-')) return false;
  if (id.startsWith('smc-composite-')) return false;
  return BULK_LABEL_KINDS.has(String(o.kind || ''));
}

function overlayMatchesBulkHLineHide(o: Record<string, unknown>): boolean {
  const k = String(o.kind || '');
  const id = String(o.id || '');
  const cat = String(o.category || '');
  if (isAiZoneEngineOverlayId(id)) return false;
  /** HTF Conviction Matrix (ChartPrime) — RSI 토글과 연동 */
  if (id.startsWith('htf-cp-')) return false;
  if (id.startsWith('hotzone-cp-')) return false;
  /** ParkF LinReg·Trendlines 대각선 — 가로선 일괄 숨김과 분리(모든 TF 동일) */
  if (id.startsWith('parkf-')) return false;
  /** ChartPrime 트렌드 채널(피벗·유동성 브레이크) 대각선 — 가로선 일괄 숨김과 분리 */
  if (id.startsWith('cptc-')) return false;
  /** 캔들분석 매물대 만료 수직선 — VP 가로선 일괄 숨김과 분리 */
  if (id.startsWith('candle-analysis-auto-vzone-expiry-')) return false;
  /** 캔들분석 시나리오 점선 — 일괄 가로선 숨김과 분리 */
  if (id.startsWith('candle-analysis-auto-scen-')) return false;
  /** 캔들분석 핵심 뷰: 돌파·이론 경로 — 일괄 가로선 숨김과 분리 */
  if (id.startsWith('candle-analysis-exec-')) return false;
  /** 캔들분석 AI 작도 */
  if (id.startsWith('candle-analysis-ai-draw-')) return false;
  if (id.startsWith('candle-analysis-hash-fib-')) return false;
  if (id.startsWith('candle-analysis-bosw-')) return false;
  if (id.startsWith('candle-analysis-vifvg-')) return false;
  if (id.startsWith('smart-adaptive-')) return false;
  if (id.startsWith('candle-analysis-brk-') && id.includes('-mid')) return false;
  if (id.startsWith('zone-smbc-') && id.includes('-mid')) return false;
  if (id.startsWith('zone-smbc-') && id.includes('-edge-')) return false;
  const lineKinds = new Set([
    'keyLevel',
    'supportLine',
    'resistanceLine',
    'fibLine',
    'equilibrium',
    'strongHigh',
    'strongLow',
    'symTriangleTarget',
    'bos',
    'choch',
    'liquiditySweep',
    'eqh',
    'eql',
    'scenario',
    'harmonic',
    'harmonicLeg',
    'trendLine',
    'rsiDivergenceLine',
  ]);
  if (lineKinds.has(k)) return true;
  if (k === 'line') {
    const p1 = o.price1;
    const p2 = o.price2;
    if (typeof p1 === 'number' && typeof p2 === 'number' && Number.isFinite(p1) && Number.isFinite(p2)) {
      const eps = Math.max(1e-12, Math.abs(p1) * 1e-11);
      if (Math.abs(p1 - p2) <= eps) return true;
    }
  }
  if (id.startsWith('ls-plan-') || id.startsWith('smc-composite-') || id.startsWith('close-') || id.startsWith('settlement-level-') || id.startsWith('settlement-path-')) return true;
  if (id.startsWith('key-')) return true;
  if (id.startsWith('tap-') && !id.includes('zone') && !id.includes('beam-path')) return true;
  if (id.startsWith('diag-')) return true;
  if (cat === 'trendlineEngine' || cat === 'autoTrendline') return true;
  return false;
}

function overlayMatchesBulkZoneHide(o: Record<string, unknown>): boolean {
  const k = String(o.kind || '');
  const id = String(o.id || '');
  const cat = String(o.category || '');
  if (isAiZoneEngineOverlayId(id)) return false;
  /** analyze 엔진 major 핵심 지지·저항 면 — 일괄 존 숨김에서 제외 */
  if (/^major-support-\d+-zone$/.test(id) || /^major-resistance-\d+-zone$/.test(id)) return false;
  /** 캔들분석 핵심 Supply/Demand 띠 — 일괄 존 숨김과 분리(구조 존만 끄고 CA S/D는 유지) */
  if (id.startsWith('ca-core-') || cat === 'candleAnalysisCoreSd') return false;
  if (id.startsWith('htf-cp-')) return false;
  if (id.startsWith('hotzone-cp-')) return false;
  if (id.startsWith('ai-auto-')) return false;
  if (id.startsWith('candle-analysis-ai-draw-')) return false;
  if (id.startsWith('candle-analysis-hash-fib-')) return false;
  if (id.startsWith('candle-analysis-bosw-')) return false;
  if (id.startsWith('candle-analysis-vifvg-')) return false;
  if (id.startsWith('candle-analysis-brk-')) return false;
  if (id.startsWith('zone-smbc-')) return false;
  if (id.startsWith('cptc-') && id.includes('-fill-')) return false;
  if (cat === 'lvrb') return true;
  if (['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone', 'po3Phase'].includes(k)) return true;
  if (cat === 'reactionZone' || cat === 'strongZone') return true;
  if (cat === 'patternVision' && /zone|neckline|resistance|support/i.test(id)) return true;
  if (id.startsWith('settlement-zone-')) return true;
  if (cat === 'smcDesk') return true;
  return false;
}

function isWhaleHotZoneOverlay(o: Record<string, unknown>): boolean {
  const id = String(o.id || '');
  return id.startsWith('hotzone-');
}

function isMajorCoreSrOverlay(o: Record<string, unknown>): boolean {
  const id = String(o.id || '');
  return /^major-(support|resistance)-\d+-(zone|line)$/.test(id);
}

/** TF별 캔들 기간(초) — locked 신호를 상위 TF 캔들에 매핑용 */
function periodSeconds(tf: string): number {
  const map: Record<string, number> = {
    '1m': 60, '3m': 180, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400,
    '1d': 86400, '1w': 604800, '1M': 2592000, '1Y': 31536000,
  };
  return map[tf] ?? 60;
}

/** 로드된 캔들 시가 기준으로 entry(초)가 속한 봉의 시가 — 월/주/일 가변 길이·entry≠시가 대응 */
function candleOpenContainingTime(candles: Candle[], entrySec: number): number | null {
  const n = candles.length;
  if (!n || !Number.isFinite(entrySec)) return null;
  const firstT = candles[0].time as number;
  if (entrySec < firstT) return null;
  let lo = 0;
  let hi = n - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ct = candles[mid].time as number;
    if (ct <= entrySec) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans < 0) return null;
  return candles[ans].time as number;
}

/** 자율학습 SL 실패 목록 → 봉 시가 기준 키 (L/S·로켓 숨김) */
function chartSlFailureKeySet(
  failures: Array<{ time: number; verdict: 'LONG' | 'SHORT' }> | undefined,
  candles: Candle[]
): Set<string> {
  const s = new Set<string>();
  if (!failures?.length || !candles.length) return s;
  for (const f of failures) {
    if (f.verdict !== 'LONG' && f.verdict !== 'SHORT') continue;
    const t = Number(f.time);
    if (!Number.isFinite(t)) continue;
    const open = candleOpenContainingTime(candles, t);
    s.add(`${open ?? t}|${f.verdict}`);
  }
  return s;
}

function filterLsRocketsBySlFailures<T extends { time: number; direction: 'LONG' | 'SHORT' }>(
  rows: T[],
  slSet: Set<string>,
  candles: Candle[]
): T[] {
  if (!slSet.size || !rows.length) return rows;
  return rows.filter((r) => {
    const open = candleOpenContainingTime(candles, r.time) ?? r.time;
    return !slSet.has(`${open}|${r.direction}`);
  });
}

function mergePersistedRocketRows(primary: LsRocketPersistRow[], extra: LsRocketPersistRow[]): LsRocketPersistRow[] {
  /** extra(교차 TF) 후 primary 덮기 — 동일 time당 구조 1건만(반대 LONG/SHORT 동시 HUD 방지) */
  const byT = new Map<number, LsRocketPersistRow>();
  for (const row of extra) {
    if (row.tier === 'structure') byT.set(row.time, row);
  }
  for (const row of primary) {
    if (row.tier === 'structure') byT.set(row.time, row);
  }
  return [...byT.values()].sort((a, b) => a.time - b.time);
}

/** 다른 TF에 저장된 로켓을 현재 봉 시가로 옮겨 합침. 현재보다 가는 TF는 제외(달봉에 분봉 로켓이 몰리는 것 방지). */
function collectCrossTfMappedRockets(
  symbol: string,
  candles: Candle[],
  currentStoreKey: string,
  currentTimeframe: string
): LsRocketPersistRow[] {
  if (candles.length === 0) return [];
  const all = loadRocketPersistAll();
  const out: LsRocketPersistRow[] = [];
  const prefix = `${symbol}|`;
  const curRank = timeframeRank(currentTimeframe);
  for (const [key, rows] of Object.entries(all)) {
    if (!key.startsWith(prefix) || key === currentStoreKey) continue;
    const otherTf = key.slice(prefix.length);
    if (timeframeRank(otherTf) <= curRank) continue;
    for (const row of rows) {
      if (row.tier !== 'structure') continue;
      const bo = candleOpenContainingTime(candles, row.time);
      if (bo == null) continue;
      out.push(bo === row.time ? row : { ...row, time: bo });
    }
  }
  return out;
}

type ChartMarkerRow = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text: string;
  size?: number;
};

/**
 * 축소/확대 시 같은 봉·같은 위치에 여러 마커가 겹치면 렌더 우선순위가 프레임마다 달라 보일 수 있음.
 * 핵심 신호(상위TF 강화⚡, 구조로켓🚀/📉, L/S, 선반영)를 봉 슬롯별로 1개로 안정화해 깜빡임을 줄인다.
 */
function stabilizeSignalMarkers(rows: ChartMarkerRow[]): ChartMarkerRow[] {
  const posRank = (p: ChartMarkerRow['position']): number => (p === 'aboveBar' ? 0 : p === 'inBar' ? 1 : 2);
  const pri = (t: string): number => {
    if (t.includes('⚡')) return 400;
    if (t.includes('🚀') || t.includes('📉')) return 300;
    if (/^(L|S)(?:·|$)/.test(t) || /^L·|^S·/.test(t)) return 200;
    if (t.startsWith('선반영')) return 150;
    return 10;
  };
  const out = new Map<string, ChartMarkerRow>();
  for (const r of rows) {
    const key = `${Number(r.time)}|${r.position}`;
    const prev = out.get(key);
    if (!prev) {
      out.set(key, r);
      continue;
    }
    const pPrev = pri(String(prev.text || ''));
    const pCur = pri(String(r.text || ''));
    if (pCur > pPrev) {
      out.set(key, r);
      continue;
    }
    if (pCur === pPrev && pCur >= 150) {
      const a = String(prev.text || '').trim();
      const b = String(r.text || '').trim();
      if (a && b && a !== b) {
        out.set(key, { ...prev, text: `${a}·${b}`.slice(0, 14) });
      }
    }
  }
  return [...out.values()].sort((a, b) => {
    const dt = Number(a.time) - Number(b.time);
    if (dt !== 0) return dt;
    return posRank(a.position) - posRank(b.position);
  });
}

const ZONE_KINDS = ['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone'];

function formatOverlayPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (p >= 0.01) return p.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  return p.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 });
}

function extractTelegramCpHotLinesFromOverlays(pool: OverlayItem[]): { cpLine: string | null; hotzoneLine: string | null } {
  const fmtP = (v: number | null | undefined) =>
    typeof v === 'number' && Number.isFinite(v) ? formatOverlayPrice(v) : '-';

  const cpCandidates = [...pool].filter((o: any) => String(o?.category || '') === 'chartPrimeTrendChannels');
  const cpPrices: number[] = [];
  for (const o of cpCandidates as any[]) {
    const b = o?.channelBand;
    if (b && typeof b === 'object') {
      for (const k of ['priceHigh1', 'priceHigh2', 'priceLow1', 'priceLow2'] as const) {
        const v = Number(b[k]);
        if (Number.isFinite(v)) cpPrices.push(v);
      }
    }
    const p1 = Number(o?.price1);
    const p2 = Number(o?.price2);
    if (Number.isFinite(p1)) cpPrices.push(p1);
    if (Number.isFinite(p2)) cpPrices.push(p2);
  }
  const cpPacked = [...new Set(cpPrices.map((p) => formatOverlayPrice(p)))].slice(-6).slice(-3).join(' / ');
  const cpLine = cpPacked ? `CP 선: ${cpPacked}` : null;

  const hz = [...pool]
    .filter((o: any) => String(o?.id || '').startsWith('hotzone-') && o?.kind !== 'label')
    .sort((a: any, b: any) => Number(b?.time2 ?? b?.time1 ?? 0) - Number(a?.time2 ?? a?.time1 ?? 0))[0] as any;
  const hotzoneLine =
    hz && Number.isFinite(Number(hz.price1)) && Number.isFinite(Number(hz.price2))
      ? (() => {
          const hi = Math.max(Number(hz.price1), Number(hz.price2));
          const lo = Math.min(Number(hz.price1), Number(hz.price2));
          return `HotZone 선: ${fmtP(lo)} ~ ${fmtP(hi)}`;
        })()
      : null;

  return { cpLine, hotzoneLine };
}

const TELEGRAM_1M_TEXT_COOLDOWN_MS = 90_000;

/** 1m 텔레 본문 보강: 인근 강(수·공급)존, LinReg 밴드 한 줄씩(최대 3) */
function extractTelegramZoneBandSummaryLines(pool: OverlayItem[], lastClose: number): string[] {
  const fmtP = (v: number) => (Number.isFinite(v) ? formatOverlayPrice(v) : '-');
  if (!Number.isFinite(lastClose) || lastClose <= 0) return [];
  type Z = { lo: number; hi: number; dist: number; side: string };
  const zoneCandidates: Z[] = [];
  for (const o of pool as any[]) {
    const k = String(o?.kind || '');
    const c = String(o?.category || '');
    if (c !== 'strongZone' && k !== 'supplyZone' && k !== 'demandZone') continue;
    const p1 = Number(o?.price1);
    const p2 = Number(o?.price2);
    if (!Number.isFinite(p1) && !Number.isFinite(p2)) continue;
    const lo = Math.min(p1, p2);
    const hi = Math.max(p1, p2);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0) continue;
    const mid = (lo + hi) / 2;
    const dist = Math.min(
      Math.abs(lastClose - lo),
      Math.abs(lastClose - hi),
      Math.abs(lastClose - mid),
    );
    const side =
      k === 'demandZone' || /demand|매수|지지|buy|bid/i.test(String(o?.label || '')) ? '수요' : '공급';
    zoneCandidates.push({ lo, hi, dist, side });
  }
  const lines: string[] = [];
  if (zoneCandidates.length) {
    const best = [...zoneCandidates].sort((a, b) => a.dist - b.dist)[0];
    lines.push(`인근 ${best.side}존: ${fmtP(best.lo)} ~ ${fmtP(best.hi)}`);
  }
  const parkfBase = pool.find(
    (o: any) => String(o?.id || '') === 'parkf-lr-base' && (Number.isFinite(Number(o?.price1)) || Number.isFinite(Number(o?.price2))),
  ) as any;
  if (parkfBase) {
    const p1 = Number(parkfBase?.price1);
    const p2 = Number(parkfBase?.price2);
    if (Number.isFinite(p1) && Number.isFinite(p2)) {
      const shortLbl = String(parkfBase?.label || 'LinReg').replace(/\s+/g, ' ').slice(0, 16);
      lines.push(`${shortLbl}: ${fmtP(p1)} → ${fmtP(p2)} (우)`);
    }
  }
  return lines.slice(0, 3);
}

/** HTF 텔레: 마감봉 H/L이 HotZone 면(가격)과 겹치는지 */
function htfCandleTouchesHotZoneInPool(
  pool: OverlayItem[],
  c: { high: number; low: number } | null | undefined
): boolean {
  if (!c || !Number.isFinite(c.high) || !Number.isFinite(c.low)) return false;
  for (const o of pool as any[]) {
    const id = String(o?.id || '');
    const idL = id.toLowerCase();
    if (!idL.includes('hotzone') && !idL.includes('hot-zone') && !id.startsWith('hotzone-')) continue;
    if (String(o?.kind || '').toLowerCase() === 'label') continue;
    const p1 = Number(o?.price1);
    const p2 = Number(o?.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;
    const lo = Math.min(p1, p2);
    const hi = Math.max(p1, p2);
    if (c.high >= lo && c.low <= hi) return true;
  }
  return false;
}

/** HTF 텔레: 수·공급/강한존 면이 마감봉과 겹치는지 (아이콘의 초록/빨강 밴드·존) */
function htfCandleTouchesSupplyDemandStrongInPool(
  pool: OverlayItem[],
  c: { high: number; low: number } | null | undefined
): boolean {
  if (!c || !Number.isFinite(c.high) || !Number.isFinite(c.low)) return false;
  for (const o of pool as any[]) {
    const k = String(o?.kind || '');
    const cat = String(o?.category || '');
    if (k === 'label') continue;
    const isSupply = k === 'supplyZone' || /supply|공급|저항/i.test(String(o?.label || ''));
    const isDemand = k === 'demandZone' || /demand|수요|지지|support/i.test(String(o?.label || ''));
    const isStrong = cat === 'strongZone' || k === 'strongHigh' || k === 'strongLow' || k === 'strongZone';
    if (!isSupply && !isDemand && !isStrong) continue;
    const p1 = Number(o?.price1);
    const p2 = Number(o?.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;
    const lo = Math.min(p1, p2);
    const hi = Math.max(p1, p2);
    if (c.high >= lo && c.low <= hi) return true;
  }
  return false;
}

/**
 * 텔레그램 캡처: `tv-host`만 찍으면 CP 밴드(`.overlay-layer--under-chart`)·앞줄(`.overlay-layer`)이
 * 형제 레이어라 빠짐 → 반드시 `tv-frame`(frameRef) 전체를 rasterize 한다.
 */
async function captureTelegramChartFramePngDataUrl(frameEl: HTMLElement | null): Promise<string | undefined> {
  if (typeof window === 'undefined' || !frameEl) return undefined;
  const cls = 'tv-frame--telegram-clean-capture';
  frameEl.classList.add(cls);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  try {
    return await toPng(frameEl, {
      cacheBust: true,
      pixelRatio: Math.min(2, Math.max(1, (window.devicePixelRatio || 1))),
      skipFonts: true,
      backgroundColor: '#070a0f',
    });
  } catch {
    return undefined;
  } finally {
    frameEl.classList.remove(cls);
  }
}

function cropTelegramSignalCanvasDataUrl(canvas: HTMLCanvasElement | null | undefined): string | undefined {
  if (!canvas) return undefined;
  const w = Number(canvas.width || 0);
  const h = Number(canvas.height || 0);
  if (w < 320 || h < 180) {
    try {
      return canvas.toDataURL('image/png');
    } catch {
      return undefined;
    }
  }
  const cropW = Math.max(560, Math.floor(w * 0.58));
  const sx = Math.max(0, w - cropW);
  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(canvas, sx, 0, cropW, h, 0, 0, cropW, h);
  try {
    return out.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

const PRICE_BOX_OFFSET_VERTICAL = 6;

/** 종가선 라벨 선두 기호 — 폰트·복사 차이로 ✓/✗/X 등 혼용 대응 */
function parseCloseSettlementMarkType(label: string | undefined | null): 'good' | 'bad' | null {
  if (label == null) return null;
  const t = String(label).trim();
  if (/^[✓✔]/.test(t)) return 'good';
  if (/^[✗✘✕×]/.test(t)) return 'bad';
  if (/^[xX](?:\s|$)/.test(t)) return 'bad';
  if (/확정|안착|유지|돌파|상향|상승|accepted_above/i.test(t)) return 'good';
  if (/실패|이탈|하향|하락|accepted_below|rejected/i.test(t)) return 'bad';
  return null;
}

function closeTfFromId(id: string): string {
  const s = String(id || '').toLowerCase();
  /** close-1m(1분)은 substring '1m'만 보면 월봉 1M과 충돌 — id 전체로 구분 */
  if (s === 'close-monthly' || s.includes('close-monthly')) return '1M';
  if (s === 'close-weekly' || s.includes('close-weekly')) return '1W';
  if (s === 'close-daily' || (s.includes('close-daily') || (s.includes('daily') && s.includes('close')))) return '1D';
  if (s.includes('close-4h') || (s.includes('4h') && s.startsWith('close-'))) return '4H';
  if (s.includes('close-1h')) return '1H';
  if (s.includes('close-15m')) return '15M';
  if (s.includes('close-5m')) return '5M';
  if (s.includes('close-3m')) return '3M';
  if (s.includes('close-1m')) return '1m';
  if (s.includes('monthly') || s.includes('1mth') || s.includes('1mo')) return '1M';
  if (s.includes('weekly') || /^close-.*1w/.test(s)) return '1W';
  if (s.includes('daily')) return '1D';
  if (s.includes('15m')) return '15M';
  if (s.includes('5m')) return '5M';
  if (s.includes('3m')) return '3M';
  if (s.includes('4h')) return '4H';
  if (s.includes('1h')) return '1H';
  return 'TF';
}
const PRICE_AXIS_RESERVE_PX = 80;
const PRICE_STRIP_PADDING_PX = 14;

function toSolidOverlayColor(c: string | undefined): string {
  if (!c) return '#e2e8f0';
  if (c.startsWith('rgba')) return c.replace(/,\s*[\d.]+\)$/, ')').replace('rgba', 'rgb');
  return c;
}

/**
 * SMC 데스크 구조선은 단계별 rgba·청록/회색 등으로 `color`가 자주 바뀜 — hex 휴리스틱만으로는 방향을 못 잡을 수 있음.
 * **`structureBias`(엔진 bias)가 있으면 그걸 우선**하고, 없을 때만 팔레트·라벨 문자열로 추정한다.
 */
function overlayPaletteSuggestsStructureDirection(item: OverlayItem): '상승' | '하락' | null {
  const palette = `${String(item.color || '')} ${String(item.lineLabelColor || '')}`.toLowerCase();
  const longHue =
    /#22c55e|#16a34a|#10b981|#15803d|rgb\(34,\s*197,\s*94\)|rgb\(16,\s*185,\s*129\)|rgba\(34,\s*197,\s*94|rgba\(74,\s*222,\s*128|rgba\(16,\s*185,\s*129|rgba\(52,\s*211,\s*153/.test(
      palette
    );
  const shortHue =
    /#ef4444|#dc2626|#f43f5e|#b91c1c|rgb\(239,\s*68,\s*68\)|rgb\(244,\s*63,\s*94\)|rgba\(239,\s*68,\s*68|rgba\(248,\s*113,\s*113|rgba\(252,\s*165,\s*165|rgba\(254,\s*202,\s*202/.test(
      palette
    );
  if (longHue && !shortHue) return '상승';
  if (shortHue && !longHue) return '하락';
  return null;
}

function inferOverlayDirectionTag(item: OverlayItem, labelText: string): '상승' | '하락' | '중립' | '' {
  const focusKinds: OverlayItem['kind'][] = ['bos', 'choch', 'liquiditySweep', 'eql'];
  const whaleAuto = typeof item.id === 'string' && item.id.startsWith('whale-auto-');
  if (whaleAuto) {
    const tx = `${item.id} ${labelText}`.toLowerCase();
    if (/^bu-|buy-|long|bull|상승|매수/.test(String(labelText).toLowerCase()) || /bu-|buy-|forecast-long/.test(tx)) return '상승';
    if (/^be-|sell-|short|bear|하락|매도/.test(String(labelText).toLowerCase()) || /be-|sell-|forecast-short/.test(tx)) return '하락';
  }
  if (!focusKinds.includes(item.kind)) return '';
  const text = `${item.id || ''} ${labelText || ''}`.toLowerCase();
  const kind = item.kind;
  const hasBull = /bull|long|up|상승|상방|롱|돌파|breakout|reclaim|지지|support|demand|매수/.test(text);
  const hasBear = /bear|short|down|하락|하방|숏|이탈|breakdown|저항|resistance|supply|매도/.test(text);
  const palette = `${String(item.color || '')} ${String(item.lineLabelColor || '')}`.toLowerCase();
  const greenish =
    /#22c55e|#16a34a|#10b981|rgb\(34,\s*197,\s*94\)|rgb\(16,\s*185,\s*129\)|rgba\(34,\s*197,\s*94|rgba\(74,\s*222,\s*128|rgba\(16,\s*185,\s*129|rgba\(52,\s*211,\s*153/.test(
      palette
    );
  const reddish =
    /#ef4444|#dc2626|#f43f5e|rgb\(239,\s*68,\s*68\)|rgb\(244,\s*63,\s*94\)|rgba\(239,\s*68,\s*68|rgba\(248,\s*113,\s*113|rgba\(252,\s*165,\s*165|rgba\(254,\s*202,\s*202/.test(
      palette
    );
  if (kind === 'bos' || kind === 'choch') {
    if (item.structureBias === 'bullish') return '상승';
    if (item.structureBias === 'bearish') return '하락';
    if (hasBull && !hasBear) return '상승';
    if (hasBear && !hasBull) return '하락';
    const fromPalette = overlayPaletteSuggestsStructureDirection(item);
    if (fromPalette) return fromPalette;
    if (greenish) return '상승';
    if (reddish) return '하락';
    return '중립';
  }
  if (kind === 'liquiditySweep') {
    if (/high|상단|고점|eqh/.test(text)) return '하락';
    if (/low|하단|저점|eql/.test(text)) return '상승';
    if (hasBull && !hasBear) return '상승';
    if (hasBear && !hasBull) return '하락';
    return '중립';
  }
  if (kind === 'eql') {
    return '중립';
  }
  return '';
}

const ChartViewInner = ({
  symbol,
  timeframe,
  analysis,
  setTimeframe,
  onTimeframeChange,
  theme = 'dark',
  snapshotRef,
  onChartPointClick,
  uiMode: uiModeProp = 'FOCUS',
  onUiModeChange: onUiModeChangeProp,
  zoneSignalSensitivity: zoneSignalSensitivityProp,
  onZoneSignalSensitivityChange,
  pre3SimilarityThreshold: pre3SimilarityThresholdProp,
  onPre3SimilarityChange,
  pre3ConfirmOnCloseOnly: pre3ConfirmOnCloseOnlyProp,
  onPre3ConfirmOnCloseChange,
  structurePriceLinesMax: structurePriceLinesMaxProp,
  mtfSignals = [],
  hotZoneEmbed = 'off',
  suppressHotZoneHud = false,
}: {
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse | null;
  setTimeframe: (tf: string) => void;
  onTimeframeChange?: (tf: string) => void;
  theme?: 'dark' | 'light';
  snapshotRef?: React.RefObject<ChartSnapshotRef | null>;
  onChartPointClick?: (data: ChartExplainRequest) => void;
  uiMode?: UIMode;
  onUiModeChange?: (mode: UIMode) => void;
  zoneSignalSensitivity?: number;
  onZoneSignalSensitivityChange?: (v: number) => void;
  /** 장대봉 직전 2캔·기록 유사도 하한(0.55~1.0) — 부모 state + /api/analyze pre3Sim */
  pre3SimilarityThreshold?: number;
  onPre3SimilarityChange?: (v: number) => void;
  /** true면 마지막 봉 마감 후에만 Pre3 반짝 확정 — /api/analyze pre3Close */
  pre3ConfirmOnCloseOnly?: boolean;
  onPre3ConfirmOnCloseChange?: (v: boolean) => void;
  /** 부모(홈)에서 슬라이더로 즉시 반영 — 없으면 settings.structurePriceLinesMax */
  structurePriceLinesMax?: number;
  mtfSignals?: Array<{
    tf: string;
    verdict: string;
    confidence: number;
    signalTime?: number | null;
    depthDeltaRegime?: 'buy' | 'sell' | 'neutral';
    depthDeltaSmoothedPct?: number;
  }>;
  /** 핫존 1D+1W 듀얼: 좌=일봉(TF칩 대신 배지) / 우=차트만 */
  hotZoneEmbed?: 'off' | 'left' | 'right';
  /** 듀얼 시 우측 패널은 HUD 중복 방지 */
  suppressHotZoneHud?: boolean;
}) => {
  const normalizeUiMode = (mode: unknown): UIMode => {
    const raw = String(mode ?? '').trim();
    const upper = raw.toUpperCase();
    if (
      raw === 'AI존' ||
      raw === 'AI분석' ||
      upper === 'AI_ZONE' ||
      upper === 'AI ZONE' ||
      upper === 'AI_ANALYSIS' ||
      upper === 'AI 분석'
    ) {
      return 'AI_ZONE';
    }
    return mode as UIMode;
  };
  const [internalUiMode, setInternalUiMode] = useState<UIMode>('EXECUTION');
  const uiMode = normalizeUiMode(onUiModeChangeProp != null ? uiModeProp : internalUiMode);
  const setUiMode = onUiModeChangeProp ?? setInternalUiMode;
  const isSmcDeskMode =
    uiMode === 'SMC_DESK' || uiMode === 'SMC_DESK_COMPOSITE' || uiMode === 'SMC_DELTA_DESK';
  const isSmartMoneyMvpMode = uiMode === 'SMART_MONEY_MVP';
  const isSmartDeskLikeMode = isSmcDeskMode || isSmartMoneyMvpMode;
  const isSmcCompositeMode = uiMode === 'SMC_DESK_COMPOSITE' || uiMode === 'SMC_DELTA_DESK';
  const [smartRuleLoading, setSmartRuleLoading] = useState(false);
  const [selectedWorkflowSignalTime, setSelectedWorkflowSignalTime] = useState<number | null>(null);
  const [selectedWorkflowX, setSelectedWorkflowX] = useState<number | null>(null);
  const [smartRule, setSmartRule] = useState<null | {
    id: string;
    enabled: boolean;
    minTotalScore: number;
    minProbabilityEdge: number;
    minConditionsMet: number;
  }>(null);
  const unifiedDeskMode = uiMode === 'UNIFIED_DESK' || uiMode === 'AI_ZONE';
  const candleAnalysisLikeUi = uiMode === 'CANDLE_ANALYSIS' || unifiedDeskMode;

  const selectTimeframe = useCallback(
    (tf: string) => {
      setTimeframe(tf);
      onTimeframeChange?.(tf);
    },
    [setTimeframe, onTimeframeChange]
  );
  const smartWorkflowHistory = analysis?.smartMoneyWorkflowHistory ?? [];
  const smartWorkflowStrip = useMemo(() => {
    if (!isSmartMoneyMvpMode || !smartWorkflowHistory.length) return [] as Array<{
      state: 'IDLE' | 'SETUP' | 'ARMED' | 'TRIGGERED' | 'INVALID';
      at: number;
      score: number;
      probabilityEdge: number;
      signalTime?: number;
      color: string;
    }>;
    return smartWorkflowHistory.slice(-12).map((row) => ({
      state: row.state,
      at: row.at,
      score: Number(row.score ?? 0),
      probabilityEdge: Number(row.probabilityEdge ?? 0),
      signalTime: typeof row.signalTime === 'number' ? row.signalTime : undefined,
      color:
        row.state === 'TRIGGERED'
          ? '#22c55e'
          : row.state === 'ARMED'
            ? '#67e8f9'
            : row.state === 'SETUP'
              ? '#f59e0b'
              : row.state === 'INVALID'
                ? '#ef4444'
                : '#64748b',
    }));
  }, [isSmartMoneyMvpMode, smartWorkflowHistory]);

  useEffect(() => {
    if (!isSmartMoneyMvpMode || selectedWorkflowSignalTime == null) {
      setSelectedWorkflowX(null);
      return;
    }
    const chart = chartRef.current;
    if (!chart) return;
    const ts: any = chart.timeScale();
    const update = () => {
      const x = ts?.timeToCoordinate?.(selectedWorkflowSignalTime);
      setSelectedWorkflowX(typeof x === 'number' && Number.isFinite(x) ? x : null);
    };
    update();
    ts?.subscribeVisibleTimeRangeChange?.(update);
    return () => {
      ts?.unsubscribeVisibleTimeRangeChange?.(update);
    };
  }, [isSmartMoneyMvpMode, selectedWorkflowSignalTime, timeframe]);

  useEffect(() => {
    if (!isSmartMoneyMvpMode) return;
    let mounted = true;
    setSmartRuleLoading(true);
    fetch('/api/alerts/rules')
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        const rows = Array.isArray(j?.rules) ? j.rules : [];
        const primary = rows.find((x: any) => String(x?.id || '').startsWith('eagle1-')) ?? rows[0] ?? null;
        if (primary) {
          setSmartRule({
            id: String(primary.id),
            enabled: primary.enabled !== false,
            minTotalScore: Number(primary.minTotalScore ?? 80),
            minProbabilityEdge: Number(primary.minProbabilityEdge ?? 20),
            minConditionsMet: Number(primary.minConditionsMet ?? 5),
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setSmartRuleLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isSmartMoneyMvpMode]);

  const saveSmartRule = useCallback(async (patch: Partial<{
    enabled: boolean;
    minTotalScore: number;
    minProbabilityEdge: number;
    minConditionsMet: number;
  }>) => {
    if (!smartRule) return;
    const next = {
      ...smartRule,
      ...patch,
      minTotalScore: Math.max(0, Math.min(100, Number(patch.minTotalScore ?? smartRule.minTotalScore))),
      minProbabilityEdge: Math.max(-100, Math.min(100, Number(patch.minProbabilityEdge ?? smartRule.minProbabilityEdge))),
      minConditionsMet: Math.max(0, Math.min(20, Math.floor(Number(patch.minConditionsMet ?? smartRule.minConditionsMet)))),
    };
    setSmartRule(next);
    try {
      const res = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const j = await res.json();
      const rows = Array.isArray(j?.rules) ? j.rules : [];
      const refreshed = rows.find((x: any) => String(x?.id || '') === next.id) ?? next;
      setSmartRule({
        id: String(refreshed.id),
        enabled: refreshed.enabled !== false,
        minTotalScore: Number(refreshed.minTotalScore ?? next.minTotalScore),
        minProbabilityEdge: Number(refreshed.minProbabilityEdge ?? next.minProbabilityEdge),
        minConditionsMet: Number(refreshed.minConditionsMet ?? next.minConditionsMet),
      });
    } catch {
      // keep optimistic state
    }
  }, [smartRule]);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lastFittedRef = useRef<string>('');
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  /** RSI 다이버전스 등 캔들 마커 (lightweight-charts v5 플러그인) */
  const rsiMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  /** WAD 고래 BUY/SELL — 거래량 히스토그램 시리즈 마커 */
  const volumeMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  /** B: 봉 time → 클릭 시 표시할 마커 설명 줄들 */
  const markerBarDetailRef = useRef<Map<number, string[]>>(new Map());
  /** 4요소 확정 시 진입·손절·목표 가격선 */
  const executionPriceLinesRef = useRef<unknown[]>([]);
  /** BOS+리테스트+RSI/안착 구조 세트업 가격선 */
  const structureTradePriceLinesRef = useRef<unknown[]>([]);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const volumeMaRef = useRef<ISeriesApi<'Line'> | null>(null);
  const zoneRangeSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const closeRangeSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  /** TV식 SuperTrend 스텝 — 롱=아래 초록, 숏=위 빨강 */
  const institutionalLongLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const institutionalShortLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const powerLawCenterRef = useRef<ISeriesApi<'Line'> | null>(null);
  const powerLawSupportRef = useRef<ISeriesApi<'Line'> | null>(null);
  const powerLawResistanceRef = useRef<ISeriesApi<'Line'> | null>(null);
  const overlayTickDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 차트 스크롤/줌 시 setState 폭주 방지 — 프레임당 1회만 오버레이 좌표 갱신 */
  const overlayRafRef = useRef<number | null>(null);
  /**
   * 가로(논리 범위)·세로(가격 범위) 줌/패닝 시 timeScale 콜백이 빠지는 프레임이 있어
   * HTML 존·라벨이 캔들에서 떨어져 보임 — 직전 차트 기하 시그니처로 폴링 보강.
   */
  const lastOverlayChartGeometrySigRef = useRef<string>('');
  /** 심볼/TF 바뀔 때 이전 /api/market 요청 취소 — 느린 응답이 새 차트를 덮어쓰지 않게 */
  const marketFetchAbortRef = useRef<AbortController | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  /** pre3 반짝 캔들 본체 펄스(0/1) — prefers-reduced-motion이면 고정 */
  const [sparklePulse, setSparklePulse] = useState(0);
  /** 탭 복귀·가시성 복귀 시 캔들 per-bar 색 재적용 (모바일 Safari 등) */
  const [sparkleRedrawTick, setSparkleRedrawTick] = useState(0);
  /** chartCandleRuleDebug: 크로스헤어 위 봉의 캔들 색 규칙 한 줄 */
  const [candlePaintDebugLine, setCandlePaintDebugLine] = useState('');
  const [overlayTick, setOverlayTick] = useState(0);
  /** 통합작도: TV식 상단 저항·하단 지지 밴드 + BB 리본 (캔들 뒤 HTML 레이어) */
  const [unifiedTvBands, setUnifiedTvBands] = useState<{
    resist: { top: number; height: number } | null;
    support: { top: number; height: number } | null;
    ribbon: { top: number; height: number } | null;
    ribbonBias: 'long' | 'short' | null;
  } | null>(null);
  /** SMC 데스크: 탭당 1회 환영 토스트(sessionStorage) */
  const [smcDeskWelcomeToast, setSmcDeskWelcomeToast] = useState<string | null>(null);
  /** SMC 데스크 · 합성: 리플레이 슬라이더(과거 봉 종가 근사) */
  const [smcCompositeReplayOffset, setSmcCompositeReplayOffset] = useState(0);
  /** SuperTrend 우측 요약 배지 */
  const [institutionalBadge, setInstitutionalBadge] = useState<{
    lastDir: 'long' | 'short';
    lastLinePrice: number | null;
    barsInCurrentTrend: number;
    currentTrendStartTime: number | null;
  } | null>(null);
  const [lsRocketHud, setLsRocketHud] = useState<LsRocketHudItem[]>([]);
  const telegramLastSignalRef = useRef<{ key: string; at: number } | null>(null);
  /** `TELEGRAM_SIGNAL_SECRET` 사용 시: 30초 HMAC(12초 캐시) — /api/telegram/signal-capture 2차 검증 */
  const telegramSignalAuthCacheRef = useRef<{ a: string; t: number } | null>(null);
  const getTelegramSignalAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (typeof window === 'undefined') return {};
    const c = telegramSignalAuthCacheRef.current;
    if (c && Date.now() - c.t < 12_000) {
      return { 'X-Telegram-Signal-Auth': c.a };
    }
    const r = await fetch('/api/telegram/signal-auth', { credentials: 'same-origin' });
    if (r.status === 401) {
      telegramSignalAuthCacheRef.current = null;
      return {};
    }
    if (!r.ok) return {};
    const j = (await r.json().catch(() => ({}))) as { required?: boolean; a?: string };
    if (!j.required || !j.a) return {};
    telegramSignalAuthCacheRef.current = { a: String(j.a), t: Date.now() };
    return { 'X-Telegram-Signal-Auth': String(j.a) };
  }, []);
  /** 자동 텔레그램 엔진 마지막 스냅샷(1분 점검 내부) — /api/telegram/signal-capture과 동일 조건 */
  const telegramAutoStatusRef = useRef<{
    updatedAt: number;
    marketOk: boolean;
    symbol: string;
    timeframe: string;
    candidateCount: number;
    skip: 'ready' | 'no_candidate' | 'below_floor' | 'cooldown' | 'market' | 'unknown' | 'disabled';
    top?: { type: string; score: number; floor: number; passes: boolean } | null;
    selected?: { type: string; key: string } | null;
    cooldownLeftMs?: number | null;
  } | null>(null);
  /** 1분 검증: 실알림과 **동일한** 본문(가격·PL·CP/Hot) — `eventKey`가 있을 때 갱신 */
  const telegramAutoLastIntendedPayloadRef = useRef<{
    brief: string;
    eventKey: string;
    eventType: string;
    symbol: string;
    timeframe: string;
    at: number;
  } | null>(null);
  const [telegramTestSending, setTelegramTestSending] = useState(false);
  const [higherTfRocketBoost, setHigherTfRocketBoost] = useState<HigherTfRocketBoostRow[]>([]);
  const [signalStatsOpen, setSignalStatsOpen] = useState(false);
  const [signalStatsHorizon, setSignalStatsHorizon] = useState(30);
  const [signalStatsInclBand, setSignalStatsInclBand] = useState(true);
  const [signalStatsInclRocket, setSignalStatsInclRocket] = useState(true);
  /** 캔들분석: /api/candle-analysis-draw 결과(차트 병합 + 해설 상단) */
  const [candleAnalysisAiDrawBundle, setCandleAnalysisAiDrawBundle] = useState<{
    overlays: OverlayItem[];
    commentary: string[];
  } | null>(null);
  const [lastUpdate, setLastUpdate] = useState('');
  const [marketError, setMarketError] = useState('');
  const sendTelegramTestCapture = useCallback(async () => {
    if (telegramTestSending) return;
    setTelegramTestSending(true);
    try {
      const hostPng = await captureTelegramChartFramePngDataUrl(frameRef.current);
      const snapCanvas = chartRef.current?.takeScreenshot?.(true);
      const lwPng = snapCanvas ? snapCanvas.toDataURL('image/png') : undefined;
      const imageDataUrl = hostPng || lwPng;
      const analysisOverlays = ((analysis as AnalyzeResponse | null)?.overlays ?? []) as OverlayItem[];
      const { cpLine, hotzoneLine } = extractTelegramCpHotLinesFromOverlays(analysisOverlays);
      const brief = [`[테스트] ${symbol} ${timeframe} 차트 캡처`, cpLine, hotzoneLine].filter(Boolean).join('\n');
      const authH = await getTelegramSignalAuthHeaders();
      const res = await fetch('/api/telegram/signal-capture', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({
          text: brief,
          imageDataUrl,
          symbol,
          timeframe,
          eventKey: `TEST|${symbol}|${timeframe}|${Date.now()}`,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        alert(`텔레그램 테스트 실패: ${j?.error || res.status}`);
      } else {
        alert('텔레그램 테스트 전송 완료');
      }
    } catch (e: any) {
      alert(`텔레그램 테스트 오류: ${e?.message || 'send failed'}`);
    } finally {
      setTelegramTestSending(false);
    }
  }, [telegramTestSending, symbol, timeframe, analysis, getTelegramSignalAuthHeaders]);
  const restoreDefaultChartView = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length < 1) return;
    applyFocusLatestBars(chart, series, candles.length, timeframe);
    requestAnimationFrame(() => setOverlayTick((v) => v + 1));
  }, [candles, timeframe]);
  const FEATURE_GAUGE_COLLAPSE_KEY = 'ailongshort-feature-gauge-collapsed';
  const [featureGaugeCollapsed, setFeatureGaugeCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(FEATURE_GAUGE_COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [aiCompressionAdvancedOpen, setAiCompressionAdvancedOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; req: ChartExplainRequest } | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const smcCompositeDrawingEnabled =
    uiMode === 'SMC_DELTA_DESK' ? true : settings.chartSmcCompositeChartDrawing !== false;
  const settingsChangeTick = useSettingsChangeTick();
  const candleSettingsRef = useRef(settings);
  candleSettingsRef.current = settings;
  /** describeCandlePaintForTime + subscribeCrosshairMove */
  const candlePaintDebugContextRef = useRef<{
    blend: CandleBlendInput | null;
    merged: Map<number, Pre3SparkleCell>;
    structure: Map<number, StructureCandleHighlight> | null;
    prox: Map<number, 'LONG' | 'SHORT'>;
    hot: Set<number> | null;
    candles: Candle[];
  }>({
    blend: null,
    merged: new Map(),
    structure: null,
    prox: new Map(),
    hot: null,
    candles: [],
  });
  const themeForChartRef = useRef(theme);
  themeForChartRef.current = theme;
  const smartMoneyRightOffset = uiMode === 'SMART_MONEY_MVP' ? 24 : 10;

  useEffect(() => {
    setSettings(loadSettings());
    void syncSettingsFromServer().then((s) => setSettings(s)).catch(() => {});
  }, []);
  /** 핫존 듀얼 등 ChartView가 여러 개일 때, 한쪽 설정 패널에서 저장하면 다른 TF 차트도 동일 localStorage를 다시 읽음 */
  useEffect(() => {
    if (settingsChangeTick === 0) return;
    setSettings(loadSettings());
  }, [settingsChangeTick]);
  useEffect(() => {
    setSmcCompositeReplayOffset(0);
  }, [symbol, timeframe]);
  const apply = (s: Partial<typeof settings>) => {
    setSettings((prev) => {
      const next = saveSettings({ ...prev, ...s });
      return next;
    });
  };
  const settingsImportInputRef = useRef<HTMLInputElement | null>(null);
  const exportSettingsJson = useCallback(() => {
    try {
      const payload = loadSettings();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `eagle1-settings-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore export failure
    }
  }, []);
  const importSettingsJson = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<UserSettings> | { settings?: Partial<UserSettings> };
      const candidate =
        parsed && typeof parsed === 'object' && 'settings' in parsed
          ? (parsed as { settings?: Partial<UserSettings> }).settings
          : (parsed as Partial<UserSettings>);
      if (!candidate || typeof candidate !== 'object') return;
      const next = saveSettings({ ...candidate });
      setSettings(next);
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    } catch {
      // ignore invalid import file
    }
  }, []);
  const applyModeFeature = (key: keyof typeof effective, value: any) => {
    const m = uiMode as SettingsUIMode;
    setSettings((prev) => {
      const nextMode = {
        ...(prev.modeFeatureOverrides?.[m] || {}),
        [key]: value,
      } as any;
      const nextOverrides = {
        ...(prev.modeFeatureOverrides || {}),
        [m]: nextMode,
      };
      return saveSettings({ ...prev, modeFeatureOverrides: nextOverrides });
    });
  };
  const effective = getEffectiveFeatureToggles(settings, uiMode as SettingsUIMode);
  const compositeLayerMask = useMemo(
    (): SmcDeskCompositeLayerMask => ({
      showStructure: effective.showStructure,
      showZones: effective.showZones,
      showChartPrimeTrendChannels: effective.showChartPrimeTrendChannels,
      showScenario: effective.showScenario,
      showWhaleZone: effective.showWhaleZone,
      showRsi: effective.showRsi,
    }),
    [
      effective.showStructure,
      effective.showZones,
      effective.showChartPrimeTrendChannels,
      effective.showScenario,
      effective.showWhaleZone,
      effective.showRsi,
    ]
  );
  const smcCompositeModel = useMemo(
    () =>
      buildSmcDeskCompositeModel(analysis as AnalyzeResponse | null, compositeLayerMask, candles, {
        replayBarOffset: smcCompositeReplayOffset,
        depthDeltaRegimeFilter: settings.chartDepthDeltaRegimeFilter !== false,
        depthDeltaAlignmentWeight: settings.chartDepthDeltaAlignmentWeight !== false,
        depthDeltaTpAdaptive: settings.chartDepthDeltaTpAdaptive !== false,
      }),
    [
      analysis,
      compositeLayerMask,
      candles,
      smcCompositeReplayOffset,
      settings.chartDepthDeltaRegimeFilter,
      settings.chartDepthDeltaAlignmentWeight,
      settings.chartDepthDeltaTpAdaptive,
    ]
  );
  const smcDeskCompositeChartOverlays = useMemo(() => {
    if (!isSmcCompositeMode || !smcCompositeDrawingEnabled) {
      return [] as OverlayItem[];
    }
    return buildSmcDeskCompositeChartOverlays(candles, analysis as AnalyzeResponse | null, smcCompositeModel);
  }, [isSmcCompositeMode, smcCompositeDrawingEnabled, candles, analysis, smcCompositeModel]);
  const effectiveCpChannelWidthScale = useMemo(
    () => effectiveChartPrimeChannelWidthScale(settings),
    [settings.chartPrimeTrendChannelsWidthScale, settings.chartTradeSetupFocus]
  );
  /** TV·작도식: 존 면·그리드 뒤 채움을 더 옅게, 가로선은 살짝 가늘게 — 최강분석·통합작도 */
  const maxCleanChartLayout =
    uiMode === 'MAX_ANALYSIS' || isSmcDeskMode || unifiedDeskMode || uiMode === 'HOT_ZONE';
  /** 실행모드: 레이어는 유지하고 면·선만 살짝 정돈(항목 삭제 없음) */
  const executionCalmLayout = uiMode === 'EXECUTION';
  /** 고래 확장 모드: WHALE · EXECUTION · SMC 데스크 — 고래 툴킷·DRS/LQB 칩 동작 */
  const isAiMode = uiMode === 'WHALE' || uiMode === 'EXECUTION' || uiMode === 'AI_ZONE' || isSmcDeskMode;
  const isWhaleOnlyMode = uiMode === 'WHALE';
  /** 한 번에: 라벨·선·존 숨김 + 캔들 마커 숫자 끔 + 고래 확장 모드면 HotZone·HyperTrend 끔 */
  const applyVisualCalm = () => {
    const m = uiMode as SettingsUIMode;
    const ai = uiMode === 'WHALE' || uiMode === 'EXECUTION' || isSmcDeskMode;
    const basePatch: Partial<UserSettings> = {
      chartBulkHideLabels: true,
      chartBulkHideHLines: true,
      chartBulkHideZones: true,
      chartMarkerMetaA: false,
    };
    if (ai) {
      basePatch.modeFeatureOverrides = {
        ...(settings.modeFeatureOverrides || {}),
        [m]: {
          ...(settings.modeFeatureOverrides?.[m] || {}),
          whaleHotZoneEnabled: false,
          whaleHyperTrendEnabled: false,
          whaleStructureBounceEnabled: false,
        },
      };
    }
    apply(basePatch);
  };
  const applyWhaleCoreSrPreset = () => {
    if (!isAiMode) return;
    const m = uiMode as SettingsUIMode;
    apply({
      chartBulkHideZones: false,
      chartBulkHideHLines: false,
      chartBulkHideLabels: false,
      modeFeatureOverrides: {
        ...(settings.modeFeatureOverrides || {}),
        [m]: {
          ...(settings.modeFeatureOverrides?.[m] || {}),
          /** 구조 돌파(BOS/CHOCH)는 핵심 S/R(핵심면) 전용 — 여기서 showStructure 강제하지 않음 */
          showZones: true,
          showLabels: true,
          showWhaleZone: true,
          whaleCoreSrZoneEnabled: true,
          whaleHotZoneEnabled: true,
        },
      },
    });
  };
  const applyWhaleCoreSrOnlyPreset = () => {
    if (!isAiMode) return;
    const m = uiMode as SettingsUIMode;
    apply({
      chartBulkHideZones: false,
      chartBulkHideHLines: false,
      chartBulkHideLabels: true,
      modeFeatureOverrides: {
        ...(settings.modeFeatureOverrides || {}),
        [m]: {
          ...(settings.modeFeatureOverrides?.[m] || {}),
          showStructure: false,
          showZones: false,
          showLabels: false,
          showScenario: false,
          showFib: false,
          showRsi: false,
          showHarmonic: false,
          showBpr: false,
          showVision: false,
          showReactionZone: false,
          showWhaleZone: false,
          showLvrb: false,
          showVolatilityTrendScore: false,
          showTailongClose: false,
          whaleHotZoneEnabled: false,
          whaleHyperTrendEnabled: false,
          whaleDynamicRsProEnabled: false,
          whaleLiquidityBiasEnabled: false,
          whaleStructureBounceEnabled: false,
          whaleCoreSrZoneEnabled: true,
        },
      },
    });
  };
  /**
   * AI 분석 모드: 중복·무거운 레이어는 끄고, 롱/숏 판단에 쓰는 축(핵심 S/R·Hot·DRS·LQB·CP)만 한 번에 맞춤.
   * — Exh/매집/파워로/구조봉강조·HT 등은 시인성·성능상 기본 끔(필요 시「전체 도구」에서 개별 켬).
   */
  const applyAiZoneUnifiedPreset = () => {
    if (uiMode !== 'AI_ZONE') return;
    const m = 'AI_ZONE' as SettingsUIMode;
    apply({
      chartBulkHideLabels: false,
      chartBulkHideHLines: false,
      chartBulkHideZones: false,
      showExhaustionZoneRukich: false,
      institutionalFlowZonesEnabled: false,
      showBitcoinPowerLawBands: false,
      chartSmcStructurePhaseCandles: false,
      chartVerdictTint: 'priceLine',
      modeFeatureOverrides: {
        ...(settings.modeFeatureOverrides || {}),
        [m]: {
          ...(settings.modeFeatureOverrides?.[m] || {}),
          showWhaleZone: true,
          showLabels: true,
          showZones: true,
          whaleCoreSrZoneEnabled: true,
          whaleHotZoneEnabled: true,
          whaleHyperTrendEnabled: false,
          whaleDynamicRsProEnabled: true,
          whaleLiquidityBiasEnabled: true,
          whaleStructureBounceEnabled: false,
        },
      },
    });
  };
  /** 통합작도: 다수 토글을 3개로만 묶음 — 구조 / 존(차트 zone 강조) / 맑음 */
  const UNIFIED_DESK_PACK_KEY = 'ailongshort-unified-desk-pack-v1';
  const [unifiedDeskGuideOpen, setUnifiedDeskGuideOpen] = useState(false);
  const [unifiedDeskPack, setUnifiedDeskPack] = useState<0 | 1 | 2>(() => {
    if (typeof window === 'undefined') return 1;
    try {
      const v = window.localStorage.getItem(UNIFIED_DESK_PACK_KEY);
      if (v === '0' || v === '1' || v === '2') return Number(v) as 0 | 1 | 2;
    } catch {}
    return 1;
  });
  const applyUnifiedDeskPack = useCallback(
    (pack: 0 | 1 | 2) => {
      if (!unifiedDeskMode) return;
      setUnifiedDeskPack(pack);
      try {
        window.localStorage.setItem(UNIFIED_DESK_PACK_KEY, String(pack));
      } catch {}
      if (pack === 0) {
        apply({
          chartBulkHideLabels: true,
          chartBulkHideHLines: false,
          chartBulkHideZones: false,
          showUnifiedCandleMarkers: true,
          candleAnalysisZoneChartVisible: false,
          chartVerdictTint: 'wash',
          candleAnalysisCoreSdZones: true,
        });
        return;
      }
      if (pack === 1) {
        apply({
          chartBulkHideLabels: true,
          chartBulkHideHLines: false,
          chartBulkHideZones: false,
          showUnifiedCandleMarkers: true,
          candleAnalysisZoneChartVisible: true,
          chartVerdictTint: 'wash',
          candleAnalysisCoreSdZones: true,
        });
        return;
      }
      apply({
        chartBulkHideLabels: true,
        chartBulkHideHLines: true,
        chartBulkHideZones: false,
        showUnifiedCandleMarkers: false,
        candleAnalysisZoneChartVisible: false,
        chartVerdictTint: 'off',
        candleAnalysisCoreSdZones: true,
      });
    },
    [apply, unifiedDeskMode]
  );
  const { showStructure, showZones, showLabels, showScenario, showFib, showRsi, showHarmonic, showChartPrimeTrendChannels, chartPrimeTrendChannelsVolumeBg, showPo3, showCandle, showBpr, showVision, showVisionTriangle, showVisionFlag, showVisionWedge, showVisionReversal, showVisionRange, showReactionZone, showWhaleZone, showLvrb, showVolatilityTrendScore, showTailongClose, showTailongCloseBreakout, showTailongCloseWick, showTailongCloseBody, showTailongCloseFlow, whaleShowForecastBoxes, whaleShowAccumulationBoxes, whaleShowDistributionBoxes, whaleOnlyLockedBoxes, whaleZigzagLen, whaleFibFactor, whaleDeleteBrokenBoxes, whaleBuObHex, whaleBeObHex, whaleBuBbHex, whaleBeBbHex, whaleSimilarityMinSamples, whaleUsePrecomputedMemory, whalePredictHorizonBars, whalePredictMinConfidence, whalePredictShowHitRate, whalePrecisionEntryEnabled, whalePrecisionAlertEnabled, whaleHotZoneEnabled, whaleHotZoneLookback, whaleHotZoneResolution, whaleHotZoneSrThreshold, whaleHotZoneLayers, whaleCoreSrZoneEnabled, whaleHyperTrendEnabled, whaleHyperTrendMult, whaleHyperTrendSlope, whaleHyperTrendWidthPct, whaleDynamicRsProEnabled, whaleLiquidityBiasEnabled, whaleStructureBounceEnabled } = effective;
  /**
   * WHALE / EXECUTION / SMC_DESK: 최초 진입 시 `modeFeatureOverrides[mode]`에만 기본값 채움 (`== null`일 때만).
   * 과거에는 전역 토글을 `!== true` 등으로 검사해 사용자가 끈 SMC·일괄숨김·프라임채널 등을 다시 켜 버리는 버그가 있었음 — 전역 설정은 여기서 건드리지 않음.
   */
  useEffect(() => {
    if (!isAiMode) return;
    const m = uiMode as SettingsUIMode;
    setSettings((prev) => {
      const ov = (prev.modeFeatureOverrides?.[m] || {}) as any;
      const patch: Record<string, boolean> = {};
      if (m === 'WHALE') {
        if (ov.showStructure == null) patch.showStructure = true;
        if (ov.showZones == null) patch.showZones = true;
        if (ov.showLabels == null) patch.showLabels = true;
        if (ov.showScenario == null) patch.showScenario = false;
        if (ov.showFib == null) patch.showFib = false;
        if (ov.showRsi == null) patch.showRsi = true;
        if (ov.showChartPrimeTrendChannels == null) patch.showChartPrimeTrendChannels = true;
        if (ov.chartPrimeTrendChannelsVolumeBg == null) patch.chartPrimeTrendChannelsVolumeBg = false;
        if (ov.showCandle == null) patch.showCandle = true;
        if (ov.showPo3 == null) patch.showPo3 = false;
        if (ov.showBpr == null) patch.showBpr = false;
        if (ov.showHarmonic == null) patch.showHarmonic = false;
        if (ov.showVision == null) patch.showVision = false;
        if (ov.showVisionTriangle == null) patch.showVisionTriangle = false;
        if (ov.showVisionFlag == null) patch.showVisionFlag = false;
        if (ov.showVisionWedge == null) patch.showVisionWedge = false;
        if (ov.showVisionReversal == null) patch.showVisionReversal = false;
        if (ov.showVisionRange == null) patch.showVisionRange = false;
        if (ov.showReactionZone == null) patch.showReactionZone = false;
        if (ov.showVolatilityTrendScore == null) patch.showVolatilityTrendScore = false;
        if (ov.showLvrb == null) patch.showLvrb = false;
        if (ov.showWhaleZone == null) patch.showWhaleZone = true;
        if (ov.showTailongClose == null) patch.showTailongClose = true;
        if (ov.showTailongCloseBreakout == null) patch.showTailongCloseBreakout = true;
        if (ov.showTailongCloseWick == null) patch.showTailongCloseWick = false;
        if (ov.showTailongCloseBody == null) patch.showTailongCloseBody = false;
        if (ov.showTailongCloseFlow == null) patch.showTailongCloseFlow = false;
        if (ov.whaleShowForecastBoxes == null) patch.whaleShowForecastBoxes = false;
        if (ov.whaleShowAccumulationBoxes == null) patch.whaleShowAccumulationBoxes = false;
        if (ov.whaleShowDistributionBoxes == null) patch.whaleShowDistributionBoxes = false;
        if (ov.whaleCoreSrZoneEnabled == null) patch.whaleCoreSrZoneEnabled = true;
        if (ov.whaleHotZoneEnabled == null) patch.whaleHotZoneEnabled = true;
        if (ov.whaleHyperTrendEnabled == null) patch.whaleHyperTrendEnabled = false;
        if (ov.whaleDynamicRsProEnabled == null) patch.whaleDynamicRsProEnabled = true;
        if (ov.whaleLiquidityBiasEnabled == null) patch.whaleLiquidityBiasEnabled = true;
        if (ov.whaleStructureBounceEnabled == null) patch.whaleStructureBounceEnabled = true;
        if (ov.whalePrecisionEntryEnabled == null) patch.whalePrecisionEntryEnabled = true;
        if (ov.whalePrecisionAlertEnabled == null) patch.whalePrecisionAlertEnabled = true;
      } else {
        if (ov.showStructure == null) patch.showStructure = true;
        if (ov.showZones == null) patch.showZones = true;
        if (ov.showLabels == null) patch.showLabels = true;
        if (ov.showScenario == null) patch.showScenario = true;
        if (ov.showFib == null) patch.showFib = true;
        if (ov.showVision == null) patch.showVision = true;
        if (ov.showVisionTriangle == null) patch.showVisionTriangle = true;
        if (ov.showVisionFlag == null) patch.showVisionFlag = true;
        if (ov.showVisionWedge == null) patch.showVisionWedge = true;
        if (ov.showVisionReversal == null) patch.showVisionReversal = true;
        if (ov.showVisionRange == null) patch.showVisionRange = true;
        if (ov.showChartPrimeTrendChannels == null) patch.showChartPrimeTrendChannels = true;
        if (ov.showWhaleZone == null) patch.showWhaleZone = true;
        if (ov.whaleCoreSrZoneEnabled == null) patch.whaleCoreSrZoneEnabled = true;
        if (ov.whaleHotZoneEnabled == null) patch.whaleHotZoneEnabled = true;
        if (ov.whalePrecisionEntryEnabled == null) patch.whalePrecisionEntryEnabled = true;
        if (ov.whalePrecisionAlertEnabled == null) patch.whalePrecisionAlertEnabled = true;
        if (m === 'AI_ZONE') {
          if (ov.whaleDynamicRsProEnabled == null) patch.whaleDynamicRsProEnabled = true;
          if (ov.whaleLiquidityBiasEnabled == null) patch.whaleLiquidityBiasEnabled = true;
          if (ov.whaleStructureBounceEnabled == null) patch.whaleStructureBounceEnabled = true;
        }
      }
      if (Object.keys(patch).length === 0) return prev;
      const nextOverrides = {
        ...(prev.modeFeatureOverrides || {}),
        [m]: {
          ...(prev.modeFeatureOverrides?.[m] || {}),
          ...patch,
        },
      };
      return saveSettings({ ...prev, modeFeatureOverrides: nextOverrides });
    });
  }, [isAiMode, uiMode]);
  const [whaleMemoryRows, setWhaleMemoryRows] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    const curRank = timeframeRank(timeframe);
    const upTo4h = curRank <= timeframeRank('4h');
    if (!upTo4h || candles.length === 0) {
      setHigherTfRocketBoost([]);
      return () => {
        cancelled = true;
      };
    }
    const htfList = (['1d', '1w', '1M'] as const).filter((tf) => timeframeRank(tf) > curRank);
    if (htfList.length === 0) {
      setHigherTfRocketBoost([]);
      return () => {
        cancelled = true;
      };
    }
    const load = async () => {
      try {
        const rows = await Promise.all(
          htfList.map(async (tf) => {
            const res = await fetchWithRetry(
              `/api/analyze?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(tf)}&collect=0`,
              { cache: 'no-store', credentials: 'same-origin' }
            );
            const data = (await res.json()) as AnalyzeResponse;
            const rockets = Array.isArray(data?.structureRocketSignals) ? data.structureRocketSignals : [];
            const latest = rockets[rockets.length - 1];
            if (!latest || (latest.direction !== 'LONG' && latest.direction !== 'SHORT')) return null;
            const barOpen = candleOpenContainingTime(candles, Number(latest.time));
            if (barOpen == null) return null;
            return { time: barOpen, direction: latest.direction, sourceTf: tf } as HigherTfRocketBoostRow;
          })
        );
        if (cancelled) return;
        setHigherTfRocketBoost(rows.filter((r): r is HigherTfRocketBoostRow => !!r));
      } catch {
        if (!cancelled) setHigherTfRocketBoost([]);
      }
    };
    load();
    const timer = window.setInterval(load, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol, timeframe, candles]);

  useEffect(() => {
    let cancelled = false;
    if (!isAiMode || !whaleUsePrecomputedMemory) return;
    fetch(`/api/whale-memory?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`, { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setWhaleMemoryRows(Array.isArray(j?.zones) ? j.zones : []);
      })
      .catch(() => {
        if (!cancelled) setWhaleMemoryRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAiMode, whaleUsePrecomputedMemory, symbol, timeframe]);
  const {
    overlayLabelEditMode,
    overlayLabelFontSize,
    chartScaleFontSize,
    overlayPriceStripFontSize,
    overlayLineThickness,
    translateLabelsToKo,
    showRsiPanel,
    showMacdPanel,
    showBbPanel,
    zoneSignalSensitivity,
    lsRocketScalePct,
    showUnifiedCandleMarkers,
    candleAnalysisMarkerMax,
    candleAnalysisBrowserNotify,
    candleAnalysisAiComment,
    candleAnalysisAutoCommentaryOnly,
    candleAnalysisExecutiveView,
    candleAnalysisPathMinMatches,
    candleAnalysisPathHorizonBars,
    candleAnalysisPathTopMatches,
    candleAnalysisPathWeightVolume,
    candleAnalysisPathWeightRsi,
    candleAnalysisPathMemorySteepen,
    candleAnalysisPathTheorySteepen,
    candleAnalysisDirectTheoryPath,
    candleAnalysisHashFibEnabled,
    candleAnalysisHashFibShowGoldenPocket,
    candleAnalysisHashFibShowAtrSl,
    candleAnalysisHashFibAutoLookback,
    candleAnalysisHashFibManualLookback,
    candleAnalysisHashFibDynMult,
    candleAnalysisHashFibShowExtension,
    candleAnalysisHashFibShowSwingMarkers,
    candleAnalysisHashFibShowMtf,
    candleAnalysisBosWavesEnabled,
    candleAnalysisBosWavesShowLiqPools,
    candleAnalysisBosWavesShowZigZag,
    candleAnalysisBosWavesShowSweepHighlight,
    candleAnalysisBosWavesShowSweepLabels,
    candleAnalysisBosWavesShowProjectedZones,
    candleAnalysisVifvgEnabled,
    candleAnalysisVifvgShowGhost,
    candleAnalysisVifvgShowLastN,
    candleAnalysisVifvgFvgThresholdAtr,
    candleAnalysisVifvgStrictMode,
    candleAnalysisBreakerBlocksEnabled,
    candleAnalysisBreakerBlocksPreventOverlap,
    candleAnalysisBreakerBlocksZLen,
    candleAnalysisBreakerBlocksMaxAge,
    candleAnalysisBreakerBlocksBullHex,
    candleAnalysisBreakerBlocksBearHex,
    candleAnalysisZoneChartVisible,
    candleAnalysisCoreSdZones,
    candleAnalysisMergeEngineOverlays,
    candleAnalysisShowSmartGuide,
    candleAnalysisShowElliottMvp,
    candleAnalysisShowPlaybookPath,
    candleAnalysisShowAutoZones,
    candleAnalysisShowEngineFvg,
    candleAnalysisShowTrendPattern,
    chartMarkerMetaA,
    chartMarkerClickDetailB,
    chartMarkerDensityC,
    chartMarkerLayerLs,
    chartMarkerLayerAux,
    chartMarkerLayerFrontRun,
  } = settings;
  const zoneFillSoftenMult = maxCleanChartLayout ? 0.44 : executionCalmLayout ? 0.5 : 0.55;
  /** canvas 뒤 레이어 전용: 면 알파 추가 축소(대각 채널·존이 캔들을 탁하게 보이게 하는 완화) */
  const UNDER_CHART_FILL_EXTRA_SOFT = maxCleanChartLayout ? 0.34 : executionCalmLayout ? 0.37 : 0.42;
  /** 캔들분석·스마트 존 면 배율(뒤·앞 공통 참고값) */
  const caZoneFillSoftMult = maxCleanChartLayout ? 0.3 : executionCalmLayout ? 0.34 : 0.38;
  /** 존·채널 ‘면’만 canvas 뒤 — 캔들이 색에 덮이지 않게, 선·라벨은 기존 overlay-layer(앞) 유지 */
  const OVERLAY_ZONE_FILL_BEHIND_CHART = true;
  const lsRocketScaleFactor = Math.max(0.5, Math.min(2, (lsRocketScalePct ?? 100) / 100));
  const lsRocketMarkerSize = Math.max(0.5, Math.min(2.5, (lsRocketScalePct ?? 100) / 100));
  const effectiveZoneSensitivity = typeof zoneSignalSensitivityProp === 'number' ? zoneSignalSensitivityProp : (zoneSignalSensitivity ?? 1);
  const effectivePre3Thr =
    typeof pre3SimilarityThresholdProp === 'number' && Number.isFinite(pre3SimilarityThresholdProp)
      ? pre3SimilarityThresholdProp
      : (settings.pre3SimilarityThreshold ?? 1);
  const effectivePre3ConfirmOnClose =
    typeof pre3ConfirmOnCloseOnlyProp === 'boolean'
      ? pre3ConfirmOnCloseOnlyProp
      : (settings.pre3ConfirmOnCloseOnly !== false);
  const zoneFillUserOpts = useMemo(
    () => zoneFillOptsFromSettings(settings),
    [
      settings.zoneFillSupplyHex,
      settings.zoneFillDemandHex,
      settings.zoneFillNeutralHex,
      settings.zoneFillWarningHex,
    ]
  );
  const zoneFillSupplyUi = useMemo(
    () => normalizeZoneFillHex(settings.zoneFillSupplyHex) ?? defaultSettings.zoneFillSupplyHex,
    [settings.zoneFillSupplyHex]
  );
  const zoneFillNeutralUi = useMemo(
    () => normalizeZoneFillHex(settings.zoneFillNeutralHex) ?? defaultSettings.zoneFillNeutralHex,
    [settings.zoneFillNeutralHex]
  );
  const zoneFillWarningUi = useMemo(
    () => normalizeZoneFillHex(settings.zoneFillWarningHex) ?? defaultSettings.zoneFillWarningHex,
    [settings.zoneFillWarningHex]
  );
  const zoneFillDemandUi = useMemo(
    () => normalizeZoneFillHex(settings.zoneFillDemandHex) ?? defaultSettings.zoneFillDemandHex,
    [settings.zoneFillDemandHex]
  );
  const wadMarkerBuyUi = useMemo(
    () => normalizeHex6(settings.wadMarkerBuyHex, defaultSettings.wadMarkerBuyHex),
    [settings.wadMarkerBuyHex]
  );
  const wadMarkerSellUi = useMemo(
    () => normalizeHex6(settings.wadMarkerSellHex, defaultSettings.wadMarkerSellHex),
    [settings.wadMarkerSellHex]
  );
  const chartCandleClassicUpUi = useMemo(
    () => normalizeHex6(settings.chartCandleClassicUpHex, defaultSettings.chartCandleClassicUpHex),
    [settings.chartCandleClassicUpHex]
  );
  const chartCandleClassicDownUi = useMemo(
    () => normalizeHex6(settings.chartCandleClassicDownHex, defaultSettings.chartCandleClassicDownHex),
    [settings.chartCandleClassicDownHex]
  );
  const chartCandleMonoUpUi = useMemo(
    () => normalizeHex6(settings.chartCandleMonoUpHex, defaultSettings.chartCandleMonoUpHex),
    [settings.chartCandleMonoUpHex]
  );
  const chartCandleMonoDownBodyUi = useMemo(
    () => normalizeHex6(settings.chartCandleMonoDownBodyHex, defaultSettings.chartCandleMonoDownBodyHex),
    [settings.chartCandleMonoDownBodyHex]
  );
  const chartCandleMonoOutlineUi = useMemo(
    () => normalizeHex6(settings.chartCandleMonoOutlineHex, defaultSettings.chartCandleMonoOutlineHex),
    [settings.chartCandleMonoOutlineHex]
  );
  void structurePriceLinesMaxProp;
  const labelEditMode = overlayLabelEditMode;

  /** TF 전환 직후 이전 분석 오버레이를 새 캔들에 억지 매핑하면 mapOverlays 비용이 크고 화면이 멈춘 것처럼 보임 */
  const analysisMatchesTf = analysisMatchesSymbolAndTf(analysis, symbol, timeframe);

  /** mapOverlays·봉 자석·고래 DRS/LQB 엔진이 동일 타임라인을 쓰게 함 — 분기 불일치 시 time2·마지막 봉이 엇갈려 한쪽(지지 등)만 우측 빈 축으로 늘어남 */
  const candlesForOverlay = useMemo(() => {
    if (analysisMatchesTf && candles.length) return candles;
    const ac = (analysis as { candles?: Candle[]; symbol?: string; timeframe?: string } | null)?.candles;
    if (ac?.length && analysisMatchesTf) return ac;
    return candles;
  }, [analysisMatchesTf, analysis, candles]);

  const smcDeskMarkerPlanCurrent = useMemo(() => {
    if (!isSmcDeskMode) return null;
    return buildSmcDeskMarkerPlan({
      analysisMatches: analysisMatchesTf,
      unifiedMarkersOn: showUnifiedCandleMarkers || isSmcDeskMode,
      markerMetaAEffective: chartMarkerMetaA !== false || isSmcDeskMode,
      chartMarkerDensityC,
      chartMarkerLayerLs,
      chartMarkerLayerAux,
      chartMarkerLayerFrontRun,
      showHarmonic,
      showRsi,
      showTailongClose: effective.showTailongClose === true,
      showCandle: effective.showCandle === true,
      unifiedDeskMode,
      institutionalBandMarkersEnabled: CHART_BAND_LINE_AND_TOUCH_ALWAYS_ON,
      frontRunMarkersEnabled: CHART_FRONT_RUN_MARKERS_ENABLED,
      structureRocketMarkersEnabled: CHART_ROCKET_MARKERS_ALWAYS_ON,
    });
  }, [
    uiMode,
    analysisMatchesTf,
    showUnifiedCandleMarkers,
    chartMarkerMetaA,
    chartMarkerDensityC,
    chartMarkerLayerLs,
    chartMarkerLayerAux,
    chartMarkerLayerFrontRun,
    showHarmonic,
    showRsi,
    unifiedDeskMode,
    effective.showTailongClose,
    effective.showCandle,
  ]);

  const baseOverlays = useMemo(() => {
    if (!analysisMatchesTf) return [] as OverlayItem[];
    const raw = (analysis?.overlays || []) as OverlayItem[];
    return patchCloseLevelOverlayPrices(raw, analysis ?? null);
  }, [analysisMatchesTf, analysis]);
  const whaleAutoOverlays = useMemo(() => {
    /** SMC 데스크: Bu/Be-OB·BB/MB·유사 MB 박스가 수백 겹으로 화면을 덮음 → 이 모드에서는 생성 안 함 */
    if (isSmcDeskMode) return [];
    const devObOnly = CHART_DEV_ZONES_MSBOB_ONLY;
    const instFlowStandalone =
      settings.institutionalFlowZonesEnabled === true && !devObOnly;
    if (!isAiMode && !devObOnly && !settings.institutionalFlowZonesEnabled) return [];
    if (whaleUsePrecomputedMemory && whaleMemoryRows.length > 0 && !instFlowStandalone) {
      const rows = buildWhaleZonesFromMemoryRows(whaleMemoryRows);
      return devObOnly ? filterDevMsbObWhaleOverlays(rows) : rows;
    }
    const zones = buildWhaleAutoZones({
      symbol,
      timeframe,
      candles,
      options: {
        showForecastBoxes: instFlowStandalone ? false : devObOnly ? false : whaleShowForecastBoxes,
        showAccumulationBoxes: instFlowStandalone ? true : devObOnly ? false : whaleShowAccumulationBoxes,
        showDistributionBoxes: instFlowStandalone ? true : devObOnly ? false : whaleShowDistributionBoxes,
        onlyLocked: whaleOnlyLockedBoxes,
        zigzagLen: whaleZigzagLen,
        fibFactor: whaleFibFactor,
        deleteBrokenBoxes: whaleDeleteBrokenBoxes,
        buObHex: whaleBuObHex,
        beObHex: whaleBeObHex,
        buBbHex: whaleBuBbHex,
        beBbHex: whaleBeBbHex,
        similarityMinSamples: whaleSimilarityMinSamples,
        msbObOnlyBuild: devObOnly,
      },
    });
    return devObOnly ? filterDevMsbObWhaleOverlays(zones) : zones;
  }, [
      isAiMode,
      settings.institutionalFlowZonesEnabled,
      whaleUsePrecomputedMemory,
      whaleMemoryRows,
      symbol,
      timeframe,
      candles,
      whaleShowForecastBoxes,
      whaleShowAccumulationBoxes,
      whaleShowDistributionBoxes,
      whaleOnlyLockedBoxes,
      whaleZigzagLen,
      whaleFibFactor,
      whaleDeleteBrokenBoxes,
      whaleBuObHex,
      whaleBeObHex,
      whaleBuBbHex,
      whaleBeBbHex,
      whaleSimilarityMinSamples,
      uiMode,
    ]);
  const whalePredictionOverlays = useMemo(() => {
    if (CHART_DEV_ZONES_MSBOB_ONLY) return [];
    if (!isAiMode) return [];
    return buildWhalePredictionOverlays({
      symbol,
      timeframe,
      candles,
      horizonBars: whalePredictHorizonBars,
      minConfidence: whalePredictMinConfidence,
      showHitRate: whalePredictShowHitRate,
    });
  }, [isAiMode, symbol, timeframe, candles, whalePredictHorizonBars, whalePredictMinConfidence, whalePredictShowHitRate]);
  const whaleAutoOverlaysDeduped = useMemo(() => {
    const overlapRatio = (a: OverlayItem, b: OverlayItem) => {
      const aHi = Number(a.price1 ?? a.y1 ?? 0);
      const aLo = Number(a.price2 ?? a.y2 ?? 0);
      const bHi = Number(b.price1 ?? b.y1 ?? 0);
      const bLo = Number(b.price2 ?? b.y2 ?? 0);
      const lo = Math.max(Math.min(aLo, aHi), Math.min(bLo, bHi));
      const hi = Math.min(Math.max(aLo, aHi), Math.max(bLo, bHi));
      const inter = Math.max(0, hi - lo);
      const den = Math.max(1e-9, Math.min(Math.abs(aHi - aLo), Math.abs(bHi - bLo)));
      return inter / den;
    };
    const nearInTime = (a: OverlayItem, b: OverlayItem) => {
      const at = Number(a.time1 ?? a.x1 ?? 0);
      const bt = Number(b.time1 ?? b.x1 ?? 0);
      return Math.abs(at - bt) <= periodSeconds(timeframe) * 24;
    };
    const baseZones = baseOverlays.filter((o) => o.kind === 'zone');
    return whaleAutoOverlays.filter((w) => {
      const id = String(w.id || '');
      if (!id.startsWith('whale-auto-')) return true;
      const isAccumOrDist = /-(bu|be)-(bb|mb)|buy-forecast|sell-forecast/i.test(id);
      if (!isAccumOrDist) return true;
      return !baseZones.some((z) => nearInTime(w, z) && overlapRatio(w, z) >= 0.62);
    });
  }, [whaleAutoOverlays, baseOverlays, timeframe]);
  const whaleHotZoneOverlays = useMemo(() => {
    if (CHART_DEV_ZONES_MSBOB_ONLY) return [];
    if (!isAiMode) return [];
    return buildHotZoneRadarOverlays({
      symbol,
      timeframe,
      candles,
      options: {
        enabled: whaleHotZoneEnabled,
        lookback: whaleHotZoneLookback,
        resolution: whaleHotZoneResolution,
        srThresholdPct: whaleHotZoneSrThreshold,
        srLayers: whaleHotZoneLayers,
        predictLabels: true,
        horizonBars: whalePredictHorizonBars,
      },
    });
  }, [isAiMode, symbol, timeframe, candles, whaleHotZoneEnabled, whaleHotZoneLookback, whaleHotZoneResolution, whaleHotZoneSrThreshold, whaleHotZoneLayers, whalePredictHorizonBars]);
  const whaleHyperTrendOverlays = useMemo(() => {
    if (CHART_DEV_ZONES_MSBOB_ONLY) return [];
    if (!isAiMode) return [];
    return buildHyperTrendOverlays({
      symbol,
      timeframe,
      candles,
      options: {
        enabled: whaleHyperTrendEnabled,
        mult: whaleHyperTrendMult,
        slope: whaleHyperTrendSlope,
        widthPct: whaleHyperTrendWidthPct,
        lookbackBars: Math.min(220, Math.max(80, whaleHotZoneLookback)),
      },
    });
  }, [isAiMode, symbol, timeframe, candles, whaleHyperTrendEnabled, whaleHyperTrendMult, whaleHyperTrendSlope, whaleHyperTrendWidthPct, whaleHotZoneLookback]);
  const whaleDynamicRsProOverlays = useMemo(() => {
    if (CHART_DEV_ZONES_MSBOB_ONLY) return [];
    if (!isAiMode || !whaleDynamicRsProEnabled) return [];
    return buildWhaleDynamicRsProOverlays({
      symbol,
      timeframe,
      candles: candlesForOverlay,
      useVolFilter: true,
      preset:
        isWhaleOnlyMode || uiMode === 'AI_ZONE' ? 'whaleClean' : isSmcDeskMode ? 'smcDesk' : 'default',
    });
  }, [isAiMode, isWhaleOnlyMode, uiMode, symbol, timeframe, candlesForOverlay, whaleDynamicRsProEnabled, isSmcDeskMode]);
  const whaleLiquidityBiasOverlays = useMemo(() => {
    if (CHART_DEV_ZONES_MSBOB_ONLY) return [];
    if (!isAiMode || !whaleLiquidityBiasEnabled) return [];
    return buildWhaleLiquidityBiasOverlays({
      symbol,
      timeframe,
      candles: candlesForOverlay,
      preset:
        isWhaleOnlyMode || uiMode === 'AI_ZONE' ? 'whaleClean' : isSmcDeskMode ? 'smcDesk' : 'default',
    });
  }, [isAiMode, isWhaleOnlyMode, uiMode, symbol, timeframe, candlesForOverlay, whaleLiquidityBiasEnabled, isSmcDeskMode]);
  const manualChartPrimePivotLen = Math.max(
    2,
    Math.min(30, Math.round(Number(settings.chartPrimeTrendChannelsLength) || 8))
  );
  const effectiveChartPrimePivotLength =
    settings.chartPrimeTrendChannelsAutoLength !== false
      ? computeSuggestedChartPrimePivotLength(candles, timeframe)
      : manualChartPrimePivotLen;
  const whaleChartPrimeOverlays = useMemo(() => {
    if (CHART_DEV_ZONES_MSBOB_ONLY) return [];
    if (!isAiMode || !showChartPrimeTrendChannels || candles.length < 24) return [];
    let min = Infinity;
    let max = -Infinity;
    for (const c of candles) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
    const visIdx = (arr: Candle[], i: number) => Math.max(0, Math.min(arr.length - 1, Math.floor(i)));
    const visTime = (arr: Candle[], i: number) => Number(arr[visIdx(arr, i)]?.time ?? arr[arr.length - 1]?.time ?? 0);
    const cp = computeChartPrimeTrendChannelOverlays(candles, min, max, visTime, visIdx, {
      enableLiquid: chartPrimeTrendChannelsVolumeBg === true,
      length: effectiveChartPrimePivotLength,
      wait: settings.chartPrimeTrendChannelsWait !== false,
      extend: settings.chartPrimeTrendChannelsExtend === true,
      show: settings.chartPrimeTrendChannelsShowLastOnly !== false,
      showFills: settings.chartPrimeTrendChannelsShowFills !== false,
      channelWidthScale: effectiveCpChannelWidthScale,
      topColor: normalizeHex6(settings.chartPrimeTrendChannelsTopHex, defaultSettings.chartPrimeTrendChannelsTopHex),
      centerColor: normalizeHex6(settings.chartPrimeTrendChannelsCenterHex, defaultSettings.chartPrimeTrendChannelsCenterHex),
      bottomColor: normalizeHex6(settings.chartPrimeTrendChannelsBottomHex, defaultSettings.chartPrimeTrendChannelsBottomHex),
    });
    return cp.overlays ?? [];
  }, [
    isAiMode,
    showChartPrimeTrendChannels,
    chartPrimeTrendChannelsVolumeBg,
    settings.chartPrimeTrendChannelsAutoLength,
    effectiveChartPrimePivotLength,
    settings.chartPrimeTrendChannelsWait,
    settings.chartPrimeTrendChannelsExtend,
    settings.chartPrimeTrendChannelsShowLastOnly,
    settings.chartPrimeTrendChannelsShowFills,
    settings.chartPrimeTrendChannelsTopHex,
    settings.chartPrimeTrendChannelsCenterHex,
    settings.chartPrimeTrendChannelsBottomHex,
    effectiveCpChannelWidthScale,
    candles,
    timeframe,
  ]);
  const smartAdaptiveOverlays = useMemo(() => {
    if (settings.showSmartAdaptiveSignal === false) return [] as OverlayItem[];
    if (!candles.length) return [];
    return buildSmartAdaptiveSignalOverlays(candles, timeframe);
  }, [candles, timeframe, settings.showSmartAdaptiveSignal]);

  const smcDeskOverlays = useMemo(() => {
    return buildSmcDeskOverlayPack(candles, timeframe, {
      showEq: settings.showSmcDeskEq === true,
      showOrderBlocks: settings.showSmcDeskOrderBlocks === true,
      showStructure: settings.showSmcDeskStructure === true,
      showZoneStrength: settings.showSmcDeskZoneStrength === true,
      swingPivot: Math.max(2, Math.min(4, Math.floor(settings.smcDeskSwingPivot ?? 2))),
    });
  }, [
    candles,
    timeframe,
    settings.showSmcDeskEq,
    settings.showSmcDeskOrderBlocks,
    settings.showSmcDeskStructure,
    settings.showSmcDeskZoneStrength,
    settings.smcDeskSwingPivot,
  ]);

  /** BOS/CHOCH/MSB 돌파 봉 단계별 캔들 색 — SMC 데스크 structureMarksFu와 동일 스윙·단계 규칙 */
  const structurePhaseCandleByTime = useMemo(() => {
    if (settings.chartSmcStructurePhaseCandles === false) return null;
    const safe = sanitizeChartCandlesForSeries(candles);
    if (safe.length < 8) return null;
    const sp = Math.max(2, Math.min(4, Math.floor(settings.smcDeskSwingPivot ?? 2)));
    const traceBars = Math.max(0, Math.min(8, Math.floor(settings.chartSmcStructureTraceBars ?? 0)));
    return collectStructureMarkCandleHighlights(safe, sp, 14, traceBars);
  }, [candles, settings.chartSmcStructurePhaseCandles, settings.smcDeskSwingPivot, settings.chartSmcStructureTraceBars]);

  /** LinReg 존을 제외한 오버레이 묶음 — BOS/CHOCH 힌트용(순환 참조 방지) */
  const overlaysPreLinRegSmc = useMemo(
    () => [
      ...baseOverlays,
      ...smartAdaptiveOverlays,
      ...smcDeskOverlays,
      ...whaleAutoOverlaysDeduped,
      ...whalePredictionOverlays,
      ...whaleHotZoneOverlays,
      ...whaleHyperTrendOverlays,
      ...whaleDynamicRsProOverlays,
      ...whaleLiquidityBiasOverlays,
      ...whaleChartPrimeOverlays,
    ],
    [
      baseOverlays,
      smartAdaptiveOverlays,
      smcDeskOverlays,
      whaleAutoOverlaysDeduped,
      whalePredictionOverlays,
      whaleHotZoneOverlays,
      whaleHyperTrendOverlays,
      whaleDynamicRsProOverlays,
      whaleLiquidityBiasOverlays,
      whaleChartPrimeOverlays,
    ]
  );

  /** LinReg 밴드 근접 시 smcDesk 존(면) — 카드 대신 차트에 직접 */
  const linRegSmcZoneOverlays = useMemo(() => {
    if (!isSmcDeskMode || !analysis || candles.length < 24) return [] as OverlayItem[];
    const snap = computeParkfLinRegBandSnapshot(candles, {});
    if (!snap) return [];
    const last = candles[candles.length - 1];
    return [
      ...buildLinRegSmcConfluenceZones({
        snap,
        lastHigh: last.high,
        lastLow: last.low,
        lastClose: last.close,
        lastTime: last.time as number,
        timeframe,
        candles,
        analysis,
        overlays: overlaysPreLinRegSmc as OverlayItem[],
      }),
      ...buildLinRegChannelVolumeZones({
        candles,
        analysis,
        overlays: overlaysPreLinRegSmc as OverlayItem[],
        timeframe,
      }),
    ];
  }, [uiMode, analysis, candles, timeframe, overlaysPreLinRegSmc]);

  /** SMC 데스크: LinReg+OB+구조 합류 마커·존(기존 로켓/L과 id 분리) */
  const smcDeskConfluenceLsOverlays = useMemo(() => {
    if (!isSmcDeskMode || settings.showSmcDeskConfluenceLs === false || !analysis || candles.length < 24) {
      return [] as OverlayItem[];
    }
    const snap = computeParkfLinRegBandSnapshot(candles, {});
    if (!snap) return [];
    return buildSmcDeskConfluenceLsPack({
      candles,
      analysis,
      overlays: overlaysPreLinRegSmc as OverlayItem[],
      snap,
      timeframe,
    });
  }, [uiMode, settings.showSmcDeskConfluenceLs, analysis, candles, timeframe, overlaysPreLinRegSmc]);

  /** AI_ZONE: CP 채널 + LinReg 추세선 합성 컨플루언스 */
  const cpLinregFusionOverlays = useMemo(
    () =>
      buildCpLinregFusionOverlays({
        uiMode,
        candles,
        overlays: overlaysPreLinRegSmc as OverlayItem[],
        analysis: analysis as AnalyzeResponse | null,
      }),
    [uiMode, candles, overlaysPreLinRegSmc, analysis]
  );

  /** SMC 데스크: 차트 캔들 위 볼배 라벨(종합·합류·MTF 요약) — 카드 아님 */
  const smcDeskBallboyOverlays = useMemo(() => {
    if (!isSmcDeskMode || settings.showSmcDeskBallboyHud !== true || !analysis) {
      return [] as OverlayItem[];
    }
    return buildSmcDeskBallboySignalOverlay({ analysis, candles });
  }, [uiMode, settings.showSmcDeskBallboyHud, analysis, candles]);

  const smcDeskRangeBreakoutOverlays = useMemo(() => {
    if (!isSmcDeskMode || settings.showSmcDeskRangeBreakoutZones !== true || candles.length < 8) {
      return [] as OverlayItem[];
    }
    return buildSmcDeskRangeBreakoutZones({ candles });
  }, [uiMode, settings.showSmcDeskRangeBreakoutZones, candles]);

  const smcEntryPlaybookMemo = useMemo(() => computeSmcEntryPlaybook(analysis ?? null, candles), [analysis, candles]);
  const smcEntryPlaybookOverlays = useMemo(() => {
    if (!isSmcDeskMode || settings.showSmcDeskEntryPlaybook === false || !analysis || candles.length < 12) {
      return [] as OverlayItem[];
    }
    return buildSmcEntryPlaybookOverlays(smcEntryPlaybookMemo, candles, timeframe);
  }, [uiMode, settings.showSmcDeskEntryPlaybook, analysis, candles, timeframe, smcEntryPlaybookMemo]);
  const bjDoubleTapOverlays = useMemo(() => {
    if (!isSmartMoneyMvpMode) return [] as OverlayItem[];
    if (!showScenario) return [] as OverlayItem[];
    return buildBjorgumDoubleTapOverlays(candles, {
      pivotLength: Math.max(14, Math.min(70, Math.round(Number(effectiveChartPrimePivotLength) || 35))),
      tolerancePct: 15,
      fibPct: 100,
      stopFibPct: 0,
    });
  }, [isSmartMoneyMvpMode, showScenario, candles, effectiveChartPrimePivotLength]);

  const overlays = useMemo(() => {
    const merged: OverlayItem[] = [
      ...overlaysPreLinRegSmc,
      ...linRegSmcZoneOverlays,
      ...cpLinregFusionOverlays,
      ...smcDeskConfluenceLsOverlays,
      ...smcDeskBallboyOverlays,
      ...smcDeskRangeBreakoutOverlays,
      ...smcEntryPlaybookOverlays,
      ...bjDoubleTapOverlays,
      ...smcDeskCompositeChartOverlays,
    ];
    if (uiMode !== 'AI_ZONE' || candles.length < 8) return merged;

    // AI_ZONE 극단 정리: LL/LH(고점·저점 구간) 추세선 2개만 표시.
    const n = candles.length;
    const left = 2;
    const right = 2;
    const swingHighs: Array<{ i: number; p: number }> = [];
    const swingLows: Array<{ i: number; p: number }> = [];
    for (let i = left; i < n - right; i++) {
      let isH = true;
      let isL = true;
      for (let j = 1; j <= left; j++) {
        if (candles[i].high <= candles[i - j].high) isH = false;
        if (candles[i].low >= candles[i - j].low) isL = false;
      }
      for (let j = 1; j <= right; j++) {
        if (candles[i].high <= candles[i + j].high) isH = false;
        if (candles[i].low >= candles[i + j].low) isL = false;
      }
      if (isH) swingHighs.push({ i, p: candles[i].high });
      if (isL) swingLows.push({ i, p: candles[i].low });
    }
    const hi1 = swingHighs[swingHighs.length - 2];
    const hi2 = swingHighs[swingHighs.length - 1];
    const lo1 = swingLows[swingLows.length - 2];
    const lo2 = swingLows[swingLows.length - 1];
    const pickHi1 = hi1 ?? { i: Math.max(0, n - 14), p: candles[Math.max(0, n - 14)]?.high ?? candles[n - 1].high };
    const pickHi2 = hi2 ?? { i: Math.max(1, n - 2), p: candles[Math.max(1, n - 2)]?.high ?? candles[n - 1].high };
    const pickLo1 = lo1 ?? { i: Math.max(0, n - 14), p: candles[Math.max(0, n - 14)]?.low ?? candles[n - 1].low };
    const pickLo2 = lo2 ?? { i: Math.max(1, n - 2), p: candles[Math.max(1, n - 2)]?.low ?? candles[n - 1].low };

    const x = (i: number) => (n <= 1 ? 0.5 : i / (n - 1));
    const highTag = pickHi2.p < pickHi1.p ? 'LH' : 'HH';
    const lowTag = pickLo2.p < pickLo1.p ? 'LL' : 'HL';

    const hiLine: OverlayItem = {
        id: 'ai-lllh-high-trend',
        kind: 'trendLine',
        label: `${highTag} 고점 추세선`,
        x1: x(pickHi1.i),
        y1: 0.5,
        x2: x(pickHi2.i),
        y2: 0.5,
        time1: candles[pickHi1.i].time,
        time2: candles[pickHi2.i].time,
        price1: pickHi1.p,
        price2: pickHi2.p,
        confidence: 78,
        color: 'rgba(248,113,113,0.92)',
        category: 'structure',
        noProject: true,
      };
    const loLine: OverlayItem = {
        id: 'ai-lllh-low-trend',
        kind: 'trendLine',
        label: `${lowTag} 저점 추세선`,
        x1: x(pickLo1.i),
        y1: 0.5,
        x2: x(pickLo2.i),
        y2: 0.5,
        time1: candles[pickLo1.i].time,
        time2: candles[pickLo2.i].time,
        price1: pickLo1.p,
        price2: pickLo2.p,
        confidence: 78,
        color: 'rgba(45,212,191,0.92)',
        category: 'structure',
        noProject: true,
      };
    // 기존 병합(ChartPrime·CP+LinReg·API·고래)을 **유지**하고 LL/LH만 덧씀 — 이전 실수: [hi, lo]만 반환해 CP/LinReg가 전부 사라짐
    return dedupeOverlaysById([...merged, hiLine, loLine]);
  }, [
    overlaysPreLinRegSmc,
    linRegSmcZoneOverlays,
    cpLinregFusionOverlays,
    smcDeskConfluenceLsOverlays,
    smcDeskBallboyOverlays,
    smcDeskRangeBreakoutOverlays,
    smcEntryPlaybookOverlays,
    bjDoubleTapOverlays,
    smcDeskCompositeChartOverlays,
    uiMode,
    candles,
  ]);
  const isVisionTriangle = (id: string) => /^vision-(sym|asc|desc)-/.test(id);
  const isVisionFlag = (id: string) => /^vision-(bullflag|bearflag|flag)-/.test(id);
  const isVisionWedge = (id: string) => /^vision-(rw|fw)-/.test(id);
  const isVisionReversal = (id: string) => /^vision-(dt|db|hs|ihs)-/.test(id);
  const isVisionRange = (id: string) => /^vision-(range|chup|chdn)-/.test(id);
  const filteredOverlays = useMemo(() => {
    const hasCompositeOverlays = overlays.some((item: any) =>
      String(item?.id || '').startsWith('smc-composite-')
    );
    if (uiMode === 'AI_ZONE') {
      // AI_ZONE 종합 모드: 기존 엔진 기능(존·라인·밴드·추세선)을 한 화면에 통합
      return overlays.filter((item: any) => {
        const id = String(item?.id || '');
        const kind = String(item?.kind || '');
        const cat = String(item?.category || '');
        if (id.startsWith('structure-bounce-')) {
          return whaleStructureBounceEnabled && showStructure;
        }
        if (
          id.startsWith('ai-') ||
          id.startsWith('whale-') ||
          id.startsWith('hotzone-') ||
          id.startsWith('hypertrend-') ||
          id.startsWith('key-') ||
          id.startsWith('close-') ||
          id.startsWith('ls-plan-') ||
          id.startsWith('settlement-') ||
          id.startsWith('tap-') ||
          id.startsWith('diag-') ||
          id.startsWith('parkf-') ||
          id.startsWith('cptc-') ||
          id.startsWith('smc-composite-') ||
          id.startsWith('smc-entry-playbook-') ||
          id.startsWith('smart-adaptive-')
        ) {
          return true;
        }
        if (
          cat === 'smcDesk' ||
          cat === 'chartPrimeTrendChannels' ||
          cat === 'trendlineEngine' ||
          cat === 'autoTrendline' ||
          cat === 'reactionZone' ||
          cat === 'patternVision' ||
          cat === 'smartAdaptive' ||
          cat === 'keyLevel' ||
          cat === 'zones'
        ) {
          return true;
        }
        if (
          kind === 'zone' ||
          kind === 'ob' ||
          kind === 'fvg' ||
          kind === 'supplyZone' ||
          kind === 'demandZone' ||
          kind === 'reactionZone' ||
          kind === 'bprZone' ||
          kind === 'trendLine' ||
          kind === 'keyLevel' ||
          kind === 'supportLine' ||
          kind === 'resistanceLine' ||
          kind === 'bos' ||
          kind === 'choch' ||
          kind === 'line' ||
          kind === 'label'
        ) {
          return true;
        }
        return false;
      });
    }
    return overlays.filter(item => {
      const cat = (item as any).category;
      const tid = String((item as any).id || '');
      if (uiMode === 'SMART_MONEY_MVP') {
        if (tid.startsWith('smartmoney-mvp-')) return true;
      }
      if (uiMode === 'SMC_DELTA_DESK') {
        if (tid.startsWith('smc-composite-')) return true;
        if (tid.startsWith('ls-plan-')) return !hasCompositeOverlays;
        return false;
      }
    if (isSmcDeskMode && tid.startsWith('whale-auto-')) return false;
    if (cat === 'smcDesk') {
      if (!showLabels && item.kind === 'label' && !tid.startsWith('smc-composite-')) return false;
      return true;
    }
    if (tid.startsWith('htf-cp-')) return false;
    if (tid.startsWith('hotzone-cp-')) return false;
    if (tid.startsWith('ai-auto-')) return isAiMode;
    if (tid.startsWith('whale-drs-')) return isAiMode && whaleDynamicRsProEnabled;
    if (tid.startsWith('whale-lqb-')) return isAiMode && whaleLiquidityBiasEnabled;
    if (tid.startsWith('smart-adaptive-')) return settings.showSmartAdaptiveSignal !== false;
    if (
      isSmcCompositeMode &&
      smcCompositeDrawingEnabled &&
      tid.startsWith('ls-plan-')
    ) {
      return false;
    }
    if (tid.startsWith('ls-plan-')) return true;
    if (tid.startsWith('close-')) return settings.chartTfCloseSettlementLines !== false;
    if (tid.startsWith('structure-bounce-')) {
      return uiMode === 'WHALE' && whaleStructureBounceEnabled && showStructure;
    }
    if (cat === 'keyLevel') {
      /**
       * 엔진 `돌파( mustBreak ) / 유지( mustHold ) / 무효 / 넥스트` — BOS/CHOCH 선과 별개인 **수평 키**인데
       * 예전엔 `showStructure`에 묶여 구조 끄면 둘 다 안 보였음 → 고래·실행·AI에서 **구조 꺼도** 표시.
       * 타이롱/기타 keyLevel은 기존처럼 구조 토글을 따름.
       */
      const isLevelEngineHorizonKey =
        tid.startsWith('key-mustBreak-') ||
        tid.startsWith('key-mustHold-') ||
        tid.startsWith('key-invalidation-') ||
        tid.startsWith('key-nextTarget-') ||
        tid === 'key-mustHold-close' ||
        tid.startsWith('key-mustReclaim-');
      if (isLevelEngineHorizonKey) return isAiMode || showStructure;
      return showStructure;
    }
    if (cat === 'strongZone') return showWhaleZone;
    if (cat === 'lvrb' || tid.startsWith('lvrb-')) {
      if (!showLvrb) return false;
      if (item.kind === 'zone' && !showZones) return false;
    }
    if (cat === 'volatilityTrendScore' || tid.startsWith('vts-')) {
      if (!showVolatilityTrendScore) return false;
    }
    if (cat === 'chartPrimeTrendChannels' && !showChartPrimeTrendChannels) return false;
    if (cat === 'patternVision') {
      if (!showVision) return false;
      const baseId = item.id.replace(/-label$/, '').replace(/-zone-\d+$/, '').replace(/-resistance-\d+$/, '').replace(/-support-\d+$/, '').replace(/-neckline-\d+$/, '');
      if (isVisionTriangle(baseId) && !showVisionTriangle) return false;
      if (isVisionFlag(baseId) && !showVisionFlag) return false;
      if (isVisionWedge(baseId) && !showVisionWedge) return false;
      if (isVisionReversal(baseId) && !showVisionReversal) return false;
      if (isVisionRange(baseId) && !showVisionRange) return false;
      return true;
    }
    if (!showLabels && ['entry', 'stop', 'target', 'label', 'poi', 'swingLabel'].includes(item.kind)) {
      if (isSmcCompositeMode && tid.startsWith('smc-composite-')) return true;
      const beamLabel = item.kind === 'label' && ((item as any).id?.startsWith?.('beam-forecast-') || (item as any).id?.startsWith?.('beam-confirm-'));
      if (beamLabel) return true;
      /** ParkF LinReg·피벗 추세선 콜아웃 — 구조 라벨과 별도로 유지(구조 OFF여도 점선·라벨 세트 복구) */
      const parkfCallout = item.kind === 'label' && tid.startsWith('parkf-');
      if (parkfCallout) return true;
      const lvrbSig = item.kind === 'label' && (item as any).id?.startsWith?.('lvrb-sig-');
      if (lvrbSig && showLvrb) return true;
      const vtsSig = item.kind === 'label' && tid.startsWith('vts-');
      if (vtsSig && showVolatilityTrendScore) return true;
      const luxStarLabel = item.kind === 'label' && (item as any).id?.startsWith?.('lux-star-');
      if (luxStarLabel) return true;
      const tailongCloseLabel = item.kind === 'label' && (item as any).id?.startsWith?.('tailong-close-') && showTailongClose;
      const harmonicPoint = item.kind === 'label' && cat === 'harmonic' && showHarmonic;
      const chartPrimeLiq = item.kind === 'label' && tid === 'cptc-break-liq' && showChartPrimeTrendChannels;
      const smcEntryPlaybookLbl =
        item.kind === 'label' &&
        tid.startsWith('smc-entry-playbook-') &&
        isSmcDeskMode &&
        settings.showSmcDeskEntryPlaybook !== false;
      if (!harmonicPoint && !tailongCloseLabel && !chartPrimeLiq && !smcEntryPlaybookLbl) return false;
    }
    if (!showRsi && (item.kind === 'rsiSignal' || item.kind === 'rsiDivergenceLine' || cat === 'rsi')) return false;
    /**
     * 구조 돌파(BOS/CHOCH): 고래·실행·SMC 데스크에서는 **핵심 S/R(핵심면)** 가 켜진 경우에만 표시.
     * 핵심풀셋만으로는 구조 토글이 꺼져 있으면 돌파 레이어가 나오지 않음(프리셋에서 구조 강제 ON 제거).
     */
    const isBreakoutKind = item.kind === 'bos' || item.kind === 'choch';
    let hideStructureKind = false;
    if (isBreakoutKind) {
      if (isAiMode) hideStructureKind = !whaleCoreSrZoneEnabled;
      else hideStructureKind = !showStructure;
    } else {
      hideStructureKind =
        !showStructure &&
        [
          'supportLine',
          'resistanceLine',
          'trendLine',
          'liquiditySweep',
          'eqh',
          'eql',
          'equilibrium',
          'strongHigh',
          'strongLow',
          'poi',
          'swingLabel',
          'symTriangleTarget',
        ].includes(item.kind);
    }
    if (hideStructureKind) {
      const whaleCoreSrKeep = isAiMode && whaleCoreSrZoneEnabled && isMajorCoreSrOverlay(item as Record<string, unknown>);
      if (whaleCoreSrKeep) return true;
      /** ParkF LinReg·Lux 자동 추세선 — SMC 구조(BOS/CHOCH 등) 토글과 분리 */
      const engineTrendDiagonal =
        item.kind === 'trendLine' && (cat === 'trendlineEngine' || cat === 'autoTrendline');
      /** ChartPrime 피벗 트렌드 채널 — 구조 토글과 분리 */
      const chartPrimeTrendLine =
        item.kind === 'trendLine' && cat === 'chartPrimeTrendChannels' && showChartPrimeTrendChannels;
      const smcPlaybookTrend = item.kind === 'trendLine' && cat === 'smcDesk' && tid.startsWith('smc-entry-playbook-');
      if (!engineTrendDiagonal && !chartPrimeTrendLine && !smcPlaybookTrend) return false;
    }
    if (!showFib && (item.kind === 'fibLine' || cat === 'fib')) return false;
    if (!showHarmonic && (item.kind === 'harmonic' || item.kind === 'harmonicLeg' || cat === 'harmonic')) return false;
    if (!showZones && ['zone', 'fvg', 'ob', 'supplyZone', 'demandZone'].includes(item.kind)) {
      if (
        (tid === 'smc-entry-playbook-zone' ||
          tid === 'smc-entry-playbook-ote' ||
          tid === 'smc-entry-playbook-htf-poi' ||
          tid === 'smc-entry-playbook-ltf-poi' ||
          tid === 'smc-entry-playbook-ifvg') &&
        isSmcDeskMode &&
        settings.showSmcDeskEntryPlaybook !== false
      ) {
        return true;
      }
      const whaleHotZoneKeep = isAiMode && whaleHotZoneEnabled && isWhaleHotZoneOverlay(item as Record<string, unknown>);
      const whaleCoreSrKeep = isAiMode && whaleCoreSrZoneEnabled && isMajorCoreSrOverlay(item as Record<string, unknown>);
      if (!whaleHotZoneKeep && !whaleCoreSrKeep) return false;
    }
    if (!showReactionZone && (item.kind === 'reactionZone' || (item as any).category === 'reactionZone')) return false;
    if (!showBpr && (item.kind === 'bprZone' || cat === 'bpr')) return false;
    if (!showPo3 && (item.kind === 'po3Phase' || cat === 'po3')) return false;
    const isTailongClose = (item as any).id?.startsWith?.('tailong-close-');
    if (!showCandle && (item.kind === 'candlePattern' || cat === 'candle') && !isTailongClose) return false;
    if (!showTailongClose && isTailongClose) return false;
    if (isTailongClose) {
      const isBreakout = tid.includes('breakout') || tid.includes('breakdown');
      const isWick = tid.includes('wick-absorb');
      const isBody = tid.includes('long-bull') || tid.includes('long-bear');
      const isFlow = tid.includes('flow-up') || tid.includes('flow-down');
      if (isBreakout && !showTailongCloseBreakout) return false;
      if (isWick && !showTailongCloseWick) return false;
      if (isBody && !showTailongCloseBody) return false;
      if (isFlow && !showTailongCloseFlow) return false;
    }
    if (!showScenario && item.kind === 'scenario') return false;
      return true;
    });
  }, [
    overlays,
    isAiMode,
    showStructure,
    showZones,
    showLabels,
    showScenario,
    showFib,
    showRsi,
    showHarmonic,
    showChartPrimeTrendChannels,
    showPo3,
    showCandle,
    showBpr,
    showReactionZone,
    showWhaleZone,
    showLvrb,
    showVolatilityTrendScore,
    showTailongClose,
    showTailongCloseBreakout,
    showTailongCloseWick,
    showTailongCloseBody,
    showTailongCloseFlow,
    showVision,
    showVisionTriangle,
    showVisionFlag,
    showVisionWedge,
    showVisionReversal,
    showVisionRange,
    settings.showSmcDeskEq,
    settings.showSmcDeskOrderBlocks,
    settings.showSmcDeskStructure,
    settings.showSmcDeskZoneStrength,
    settings.showSmcDeskEntryPlaybook,
    settings.showSmartAdaptiveSignal,
    settings.chartTfCloseSettlementLines,
    whaleHotZoneEnabled,
    whaleCoreSrZoneEnabled,
    whaleDynamicRsProEnabled,
    whaleLiquidityBiasEnabled,
    whaleStructureBounceEnabled,
    uiMode,
    settings.chartSmcCompositeChartDrawing,
  ]);

  const candleAnalysisSliceForUi = useMemo(() => {
    if (!candleAnalysisLikeUi) return null;
    const tfOk = analysis ? analysisMatchesSymbolAndTf(analysis, symbol, timeframe) : false;
    /** 차트 series와 동일한 `candles` 우선 — 분석 스냅샷만 쓰면 timeScale·FVG/VIFVG 앵커가 어긋남 */
    if (tfOk && candles.length) return candles;
    const ac = (analysis as { candles?: Candle[] } | null)?.candles;
    if (ac?.length && tfOk) return ac;
    return candles;
  }, [candleAnalysisLikeUi, analysis, symbol, timeframe, candles]);

  useEffect(() => {
    setCandleAnalysisAiDrawBundle(null);
  }, [symbol, timeframe, uiMode]);

  const candleAnalysisPathTuning = useMemo((): CandleAnalysisPathTuning => {
    const hz = candleAnalysisPathHorizonBars;
    return {
      minMatches: candleAnalysisPathMinMatches,
      ...(hz > 0 ? { horizonBars: hz } : {}),
      topMatches: candleAnalysisPathTopMatches,
      weightVolume: candleAnalysisPathWeightVolume,
      weightRsi: candleAnalysisPathWeightRsi,
      memoryPathSteepen: candleAnalysisPathMemorySteepen,
      theoryPathSteepen: candleAnalysisPathTheorySteepen,
      directTheoryPath: candleAnalysisDirectTheoryPath !== false,
    };
  }, [
    candleAnalysisPathMinMatches,
    candleAnalysisPathHorizonBars,
    candleAnalysisPathTopMatches,
    candleAnalysisPathWeightVolume,
    candleAnalysisPathWeightRsi,
    candleAnalysisPathMemorySteepen,
    candleAnalysisPathTheorySteepen,
    candleAnalysisDirectTheoryPath,
  ]);

  const hashFibOpts = useMemo(
    () => ({
      autoLookback: candleAnalysisHashFibAutoLookback !== false,
      manualLookback: candleAnalysisHashFibManualLookback ?? 10,
      dynamicMult: candleAnalysisHashFibDynMult ?? 9,
      showExtension: candleAnalysisHashFibShowExtension === true,
      showGoldenPocket: candleAnalysisHashFibShowGoldenPocket !== false,
      showAtrSl: candleAnalysisHashFibShowAtrSl !== false,
      showSwingMarkers: candleAnalysisHashFibShowSwingMarkers !== false,
      showMtf: candleAnalysisHashFibShowMtf === true,
    }),
    [
      candleAnalysisHashFibAutoLookback,
      candleAnalysisHashFibManualLookback,
      candleAnalysisHashFibDynMult,
      candleAnalysisHashFibShowExtension,
      candleAnalysisHashFibShowGoldenPocket,
      candleAnalysisHashFibShowAtrSl,
      candleAnalysisHashFibShowSwingMarkers,
      candleAnalysisHashFibShowMtf,
    ]
  );

  const candleAnalysisHashFibOverlays = useMemo(() => {
    if (!candleAnalysisLikeUi || candleAnalysisHashFibEnabled === false) return [] as OverlayItem[];
    const slice = candleAnalysisSliceForUi ?? candles;
    if (!slice.length || slice.length < 60) return [];
    return buildHashAutoFibonacciOverlays(slice, timeframe, hashFibOpts);
  }, [candleAnalysisLikeUi, candleAnalysisHashFibEnabled, candleAnalysisSliceForUi, candles, timeframe, hashFibOpts]);

  const candleAnalysisHashFibCommentaryLines = useMemo(() => {
    if (!candleAnalysisLikeUi || candleAnalysisHashFibEnabled === false) return [] as string[];
    const slice = candleAnalysisSliceForUi ?? candles;
    if (!slice.length || slice.length < 60) return [];
    return buildHashAutoFibonacciCommentaryLines(slice, hashFibOpts);
  }, [candleAnalysisLikeUi, candleAnalysisHashFibEnabled, candleAnalysisSliceForUi, candles, hashFibOpts]);

  const bosWavesOpts = useMemo(
    () => ({
      showLiqZones: candleAnalysisBosWavesShowLiqPools !== false,
      showZigZag: candleAnalysisBosWavesShowZigZag !== false,
      showSweepZone: candleAnalysisBosWavesShowSweepHighlight !== false,
      showSweepData: candleAnalysisBosWavesShowSweepLabels !== false,
      showBuySellZones: candleAnalysisBosWavesShowProjectedZones !== false,
    }),
    [
      candleAnalysisBosWavesShowLiqPools,
      candleAnalysisBosWavesShowZigZag,
      candleAnalysisBosWavesShowSweepHighlight,
      candleAnalysisBosWavesShowSweepLabels,
      candleAnalysisBosWavesShowProjectedZones,
    ]
  );

  const candleAnalysisBosWavesBundle = useMemo(() => {
    if (!candleAnalysisLikeUi || candleAnalysisBosWavesEnabled === false) {
      return { overlays: [] as OverlayItem[], commentaryLines: [] as string[] };
    }
    const slice = candleAnalysisSliceForUi ?? candles;
    if (!slice.length || slice.length < 260) return { overlays: [], commentaryLines: [] };
    return buildBosWavesBundle(slice, timeframe, bosWavesOpts);
  }, [
    candleAnalysisLikeUi,
    candleAnalysisBosWavesEnabled,
    candleAnalysisSliceForUi,
    candles,
    timeframe,
    bosWavesOpts,
  ]);

  const vifvgOpts = useMemo(
    () => ({
      showGhost: candleAnalysisVifvgShowGhost !== false,
      showLastN: Math.max(1, Math.min(50, candleAnalysisVifvgShowLastN ?? 10)),
      fvgThresholdAtr: Math.max(0.1, candleAnalysisVifvgFvgThresholdAtr ?? 0.5),
      strictMode: candleAnalysisVifvgStrictMode !== false,
    }),
    [
      candleAnalysisVifvgShowGhost,
      candleAnalysisVifvgShowLastN,
      candleAnalysisVifvgFvgThresholdAtr,
      candleAnalysisVifvgStrictMode,
    ]
  );

  const candleAnalysisVifvgBundle = useMemo(() => {
    if (!candleAnalysisLikeUi || candleAnalysisVifvgEnabled === false) {
      return { overlays: [] as OverlayItem[], commentaryLines: [] as string[] };
    }
    const slice = candleAnalysisSliceForUi ?? candles;
    if (!slice.length || slice.length < 115) return { overlays: [], commentaryLines: [] };
    return buildVifvgUAlgoBundle(slice, timeframe, vifvgOpts);
  }, [
    candleAnalysisLikeUi,
    candleAnalysisVifvgEnabled,
    candleAnalysisSliceForUi,
    candles,
    timeframe,
    vifvgOpts,
  ]);

  const breakerBlocksOpts = useMemo(
    () => ({
      preventOverlap: candleAnalysisBreakerBlocksPreventOverlap !== false,
      zLen: Math.max(2, Math.min(500, Math.floor(candleAnalysisBreakerBlocksZLen ?? 100))),
      maxAge: Math.max(1, Math.min(2000, Math.floor(candleAnalysisBreakerBlocksMaxAge ?? 500))),
      bullColHex: (() => {
        const s = String(candleAnalysisBreakerBlocksBullHex || '#00ffbb').trim();
        return s.startsWith('#') ? s : `#${s}`;
      })(),
      bearColHex: (() => {
        const s = String(candleAnalysisBreakerBlocksBearHex || '#ff1100').trim();
        return s.startsWith('#') ? s : `#${s}`;
      })(),
    }),
    [
      candleAnalysisBreakerBlocksPreventOverlap,
      candleAnalysisBreakerBlocksZLen,
      candleAnalysisBreakerBlocksMaxAge,
      candleAnalysisBreakerBlocksBullHex,
      candleAnalysisBreakerBlocksBearHex,
    ]
  );

  const candleAnalysisBreakerBlocksBundle = useMemo(() => {
    if (!candleAnalysisLikeUi || candleAnalysisBreakerBlocksEnabled === false) {
      return { overlays: [] as OverlayItem[], commentaryLines: [] as string[] };
    }
    const slice = candleAnalysisSliceForUi ?? candles;
    const zLen = breakerBlocksOpts.zLen;
    if (!slice.length || slice.length < zLen + 3) return { overlays: [], commentaryLines: [] };
    return buildBreakerBlocksAlgoAlphaBundle(slice, timeframe, breakerBlocksOpts);
  }, [
    candleAnalysisLikeUi,
    candleAnalysisBreakerBlocksEnabled,
    candleAnalysisSliceForUi,
    candles,
    timeframe,
    breakerBlocksOpts,
  ]);

  const candleAnalysisAutoSplit = useMemo(() => {
    if (!candleAnalysisLikeUi || !candleAnalysisSliceForUi?.length || candleAnalysisSliceForUi.length < 3) {
      return { chartOverlays: [] as OverlayItem[], commentaryLines: [] as string[] };
    }
    return splitCandleAnalysisAutoOverlays(
      candleAnalysisSliceForUi,
      analysis ?? undefined,
      timeframe,
      candleAnalysisAutoCommentaryOnly !== false,
      {
        attachMemoryPathCommentary: candleAnalysisExecutiveView !== false,
        pathTuning: candleAnalysisPathTuning,
      }
    );
  }, [
    candleAnalysisLikeUi,
    candleAnalysisSliceForUi,
    analysis,
    timeframe,
    candleAnalysisAutoCommentaryOnly,
    candleAnalysisExecutiveView,
    candleAnalysisPathTuning,
  ]);

  const candleAnalysisHeaderCommentaryLines = useMemo(() => {
    const base = candleAnalysisAutoSplit.commentaryLines;
    const hash = candleAnalysisHashFibCommentaryLines;
    const bos = candleAnalysisBosWavesBundle.commentaryLines;
    const vif = candleAnalysisVifvgBundle.commentaryLines;
    const brk = candleAnalysisBreakerBlocksBundle.commentaryLines;
    const ai = candleAnalysisAiDrawBundle?.commentary;
    const head: string[] = [];
    if (hash.length) head.push(...hash, '');
    if (bos.length) head.push(...bos, '');
    if (vif.length) head.push(...vif, '');
    if (brk.length) head.push(...brk, '');
    if (ai?.length) head.push('— AI 작도 —', ...ai, '');
    return head.length ? [...head, ...base] : base;
  }, [
    candleAnalysisAutoSplit.commentaryLines,
    candleAnalysisHashFibCommentaryLines,
    candleAnalysisBosWavesBundle.commentaryLines,
    candleAnalysisVifvgBundle.commentaryLines,
    candleAnalysisBreakerBlocksBundle.commentaryLines,
    candleAnalysisAiDrawBundle?.commentary,
  ]);

  const bibleModeOverlays = useMemo(() => {
    if (uiMode !== 'BIBLE_MODE' || candles.length < 5) return [] as OverlayItem[];
    return buildBibleModeOverlays(candles);
  }, [uiMode, candles]);

  const bibleModeSummaryLines = useMemo(() => {
    if (uiMode !== 'BIBLE_MODE' || candles.length < 5) return [] as string[];
    return buildBibleModeSummaryLines(candles);
  }, [uiMode, candles]);

  const hotZonePullbackPack = useMemo(() => {
    if (uiMode !== 'HOT_ZONE' || candles.length < 40) return null;
    return buildPullbackHotZonePack({ candles, timeframe, symbol, mtfSignals });
  }, [uiMode, candles, timeframe, symbol, mtfSignals]);

  /** 핫존 핫 캔들 봉 — 줄·존 근접과 달리 label 오버레이라 proximity 스캔에 안 잡혀 별도 연동 */
  const hotZoneCandleHighlightTimes = useMemo(() => {
    const arr = hotZonePullbackPack?.hotCandleTimes;
    if (!arr?.length) return null;
    return new Set(arr.map((n) => Number(n)));
  }, [hotZonePullbackPack]);

  /** 캔들 per-bar 색: 겹침 분리(본봉/테/심) + 클래식·모노 */
  const candleBlendInput = useMemo((): CandleBlendInput => {
    return {
      compositeLayers: settings.chartCandleCompositeLayers !== false,
      chartCandleStyle: settings.chartCandleStyle,
      classicUpHex: settings.chartCandleClassicUpHex,
      classicDownHex: settings.chartCandleClassicDownHex,
      monoUpHex: settings.chartCandleMonoUpHex,
      monoDownBodyHex: settings.chartCandleMonoDownBodyHex,
      monoOutlineHex: settings.chartCandleMonoOutlineHex,
    };
  }, [
    settings.chartCandleCompositeLayers,
    settings.chartCandleStyle,
    settings.chartCandleClassicUpHex,
    settings.chartCandleClassicDownHex,
    settings.chartCandleMonoUpHex,
    settings.chartCandleMonoDownBodyHex,
    settings.chartCandleMonoOutlineHex,
  ]);

  const strongZoneSceneKey = `${symbol}|${timeframe}`;
  const stableStrongZoneOverlays = useStableStrongZoneOverlays(
    analysis?.strongZoneOverlays,
    candles,
    settings.chartStrongZoneMinRefreshMs ?? defaultSettings.chartStrongZoneMinRefreshMs,
    strongZoneSceneKey
  );

  const modeFilteredOverlays = useMemo(() => {
    /** Smart Adaptive Signal — 클라이언트 전용, 모드별 화이트리스트에도 항상 끼워 넣음 */
    const smartAdaptivePack = filteredOverlays.filter(
      (o: any) =>
        (o as OverlayItem).category === 'smartAdaptive' ||
        String((o as OverlayItem).id || '').startsWith('smart-adaptive-')
    );

    /** 스마트(비타점)와 동일 패킹 — 캔들분석에서 엔진 오버레이 병합 시 재사용 */
    const buildSmartExecutionOverlayPack = (): OverlayItem[] => {
      const harmonicXabcd = showHarmonic
        ? overlays.filter(
            (o: any) => o.kind === 'harmonicLeg' || o.kind === 'harmonic' || (o.kind === 'label' && o.category === 'harmonic')
          )
        : [];
      const rsiDivOverlays = showRsi
        ? overlays.filter(
            (o: any) =>
              o.kind === 'rsiSignal' ||
              o.kind === 'rsiDivergenceLine' ||
              o.category === 'rsi'
          )
        : [];
      const tailongOnly = overlays.filter((item: any) => item.id?.startsWith('tailong-'));
      const breakoutLevel = overlays.filter((item: any) => item.id?.startsWith('key-mustBreak-'));
      const mustHoldSupport = overlays.filter((item: any) => item.id?.startsWith('key-mustHold-'));
      const invalidationLevel = overlays.filter((item: any) => item.id?.startsWith('key-invalidation-'));
      const otherKeyLevels = overlays.filter(
        (item: any) =>
          item.kind === 'keyLevel' &&
          item.id?.startsWith?.('key-') &&
          !item.id.startsWith('key-mustBreak-') &&
          !item.id.startsWith('key-mustHold-') &&
          !item.id.startsWith('key-invalidation-')
      );
      const bullishFvg = overlays.filter((item: any) => item.kind === 'fvg');
      const reactionZones = overlays.filter((item: any) => item.kind === 'reactionZone' || (item as any).category === 'reactionZone');
      const bullishOb = overlays.filter((item: any) => item.kind === 'ob');
      const trendlineOverlays = overlays.filter(
        (item: any) =>
          item.kind === 'trendLine' ||
          item.id?.startsWith?.('diag-') ||
          item.category === 'trendlineEngine' ||
          item.category === 'autoTrendline'
      );
      const demandSupply = overlays.filter(
        (item: any) =>
          (item.kind === 'demandZone' || item.kind === 'supplyZone') &&
          item.id !== 'swing-tap-zone' &&
          item.id !== 'tap-support-zone' &&
          item.id !== 'tap-resistance-zone'
      );
      const closeLevelLines = overlays.filter((item: any) => item.id?.startsWith('close-'));
      const lsPlanLevels = overlays.filter((item: any) => item.id?.startsWith('ls-plan-'));
      const settlementLevels = overlays.filter(
        (item: any) => item.id?.startsWith('settlement-zone-') || item.id?.startsWith('settlement-level-')
      );
      const settlementPaths = overlays.filter((item: any) => item.id?.startsWith('settlement-path-'));
      const beamLabels = overlays.filter(
        (item: any) => item.kind === 'label' && (item.id?.startsWith('beam-forecast-') || item.id?.startsWith('beam-confirm-'))
      );
      const executionLabels = overlays.filter(
        (o: any) =>
          o.id === 'equilibrium' ||
          o.id === 'strong-high' ||
          o.id === 'strong-low' ||
          o.kind === 'liquiditySweep' ||
          o.kind === 'eqh' ||
          o.kind === 'eql' ||
          o.kind === 'supportLine' ||
          o.kind === 'resistanceLine'
      );
      const structureBreakoutPack =
        (!isAiMode && showStructure) || (isAiMode && whaleCoreSrZoneEnabled);
      const structureOverlays = structureBreakoutPack ? overlays.filter((o: any) => o.kind === 'choch' || o.kind === 'bos') : [];
      const swingTapZone = overlays.filter((o: any) => o.id === 'swing-tap-zone');
      const strongZones = showWhaleZone && analysisMatchesTf ? stableStrongZoneOverlays : [];
      const visionOverlays = filteredOverlays.filter((o: any) => o.category === 'patternVision');
      const lvrbOverlays = showLvrb ? overlays.filter((o: any) => o.category === 'lvrb') : [];
      const vtsOverlays = showVolatilityTrendScore ? overlays.filter((o: any) => o.category === 'volatilityTrendScore') : [];
      const chartPrimeBands = showChartPrimeTrendChannels
        ? overlays.filter((o: any) => o.category === 'chartPrimeTrendChannels' && o.kind === 'channelBand')
        : [];
      const chartPrimeLabels = showChartPrimeTrendChannels
        ? overlays.filter((o: any) => o.category === 'chartPrimeTrendChannels' && o.kind === 'label')
        : [];
      return [
        ...smartAdaptivePack,
        ...executionLabels,
        ...beamLabels,
        ...structureOverlays,
        ...chartPrimeBands,
        ...trendlineOverlays,
        ...swingTapZone,
        ...strongZones,
        ...tailongOnly,
        ...breakoutLevel,
        ...mustHoldSupport,
        ...invalidationLevel,
        ...otherKeyLevels,
        ...settlementLevels,
        ...settlementPaths,
        ...closeLevelLines,
        ...lsPlanLevels,
        ...bullishFvg,
        ...reactionZones,
        ...demandSupply,
        ...bullishOb,
        ...harmonicXabcd,
        ...rsiDivOverlays,
        ...visionOverlays,
        ...lvrbOverlays,
        ...vtsOverlays,
        ...chartPrimeLabels,
      ];
    };

    if (uiMode === 'SMART_MONEY_MVP') {
      return dedupeOverlaysById([...filteredOverlays]);
    }

    if (uiMode === 'BIBLE_MODE') {
      const smcDeskBible = filteredOverlays.filter((o: any) => o.category === 'smcDesk');
      let merged = dedupeOverlaysById([
        ...smartAdaptivePack,
        ...buildSmartExecutionOverlayPack(),
        ...bibleModeOverlays,
        ...smcDeskBible,
      ]);
      if (settings.chartBuySellZoneFocus === true) {
        merged = merged.filter((item) => overlayMatchesBuySellZoneFocus(item as OverlayItem));
      }
      return merged;
    }

    if (uiMode === 'HOT_ZONE') {
      /** 핫존: 스마트·실행·SMC 풀팩 제외 — `pullbackHotZoneEngine` 오버레이만(우측 HUD는 그대로). 지저분함 방지. */
      const phz = hotZonePullbackPack?.overlays ?? [];
      /** `chartBuySellZoneFocus`는 존만 통과시켜 TP·SL·피보가 사라지므로 핫존에서는 적용하지 않음 */
      return dedupeOverlaysById([...phz]);
    }

    // AI_ZONE는 전용 파이프를 사용: 통합작도 재조합(candleAnalysisLikeUi)으로 인한 누락 방지
    if (uiMode === 'AI_ZONE') {
      const aiZoneCorePack = filteredOverlays.filter((o: any) => {
        const id = String(o?.id || '');
        return id.startsWith('ai-zone-') || id.startsWith('ai-lllh-') || id.startsWith('ai-cp-lr-');
      });
      const fallbackAiZonePack: OverlayItem[] = (() => {
        if (aiZoneCorePack.length > 0 || candles.length < 2) return [];
        const last = candles[candles.length - 1] as any;
        const anchor = candles[Math.max(0, candles.length - 72)] as any;
        const c = Number(last?.close);
        const t1 = Number(anchor?.time);
        const t2 = Number(last?.time);
        if (!Number.isFinite(c) || !Number.isFinite(t1) || !Number.isFinite(t2)) return [];
        const pad = Math.max(Math.abs(c) * 0.0032, 1e-9);
        return [
          {
            id: 'ai-zone-fallback-status',
            kind: 'keyLevel',
            label: '',
            time1: t1,
            time2: t2,
            price1: c,
            price2: c,
            confidence: 52,
            color: 'rgba(250,204,21,0.98)',
            category: 'keyLevel',
          } as OverlayItem,
          {
            id: 'ai-zone-fallback-long',
            kind: 'demandZone',
            label: '',
            time1: t1,
            time2: t2,
            price1: c - pad * 0.5,
            price2: c - pad * 1.9,
            confidence: 50,
            color: 'rgba(34,255,130,0.45)',
            category: 'zones',
          } as OverlayItem,
          {
            id: 'ai-zone-fallback-short',
            kind: 'supplyZone',
            label: '',
            time1: t1,
            time2: t2,
            price1: c + pad * 1.9,
            price2: c + pad * 0.5,
            confidence: 50,
            color: 'rgba(255,64,100,0.45)',
            category: 'zones',
          } as OverlayItem,
        ];
      })();
      const merged = dedupeOverlaysById([
        ...smartAdaptivePack,
        ...filteredOverlays,
        ...fallbackAiZonePack,
      ]);
      // 종합은 유지하되 잡라벨은 줄이되, CP+LinReg·AI 상태 라벨은 유지
      const noLabel = merged.filter((o: any) => {
        const k = String(o?.kind || '');
        const id = String(o?.id || '');
        if (k === 'label' && (id === 'ai-cp-lr-label' || id === 'ai-zone-status')) return true;
        return k !== 'label' && k !== 'poi' && k !== 'swingLabel' && k !== 'entry' && k !== 'target' && k !== 'stop';
      });
      const priority = (o: any) => {
        const id = String(o?.id || '');
        const kind = String(o?.kind || '');
        if (id.startsWith('ai-cp-lr-') || id.startsWith('ai-lllh-')) return 99;
        if (id.startsWith('cptc-')) return 88;
        if (id.startsWith('ai-zone-main') || id.startsWith('ai-zone-long-ref') || id.startsWith('ai-zone-short-ref')) return 100;
        if (kind === 'demandZone' || kind === 'supplyZone' || kind === 'zone' || kind === 'ob' || kind === 'fvg') return 90;
        if (id.startsWith('ai-zone-') || kind === 'keyLevel' || kind === 'supportLine' || kind === 'resistanceLine') return 80;
        if (kind === 'trendLine' || id.startsWith('diag-') || id.startsWith('parkf-') || id.startsWith('cptc-')) return 70;
        if (kind === 'bos' || kind === 'choch') return 60;
        return 30;
      };
      const sorted = [...noLabel].sort((a: any, b: any) => {
        const p = priority(b) - priority(a);
        if (p !== 0) return p;
        const c = Number(b?.confidence ?? 0) - Number(a?.confidence ?? 0);
        if (c !== 0) return c;
        return Number(b?.time2 ?? b?.time1 ?? 0) - Number(a?.time2 ?? a?.time1 ?? 0);
      });
      const stats = (analysis as any)?.aiZoneStats;
      const aiConf = Number((analysis as any)?.aiZoneSignal?.confidence ?? stats?.confidence ?? 50);
      const confBoost = aiConf >= 80 ? 2 : aiConf >= 65 ? 1 : 0;
      const maxZones = Math.max(24, Math.min(40, Number(stats?.zones ?? 20) + confBoost + 4));
      const maxLines = Math.max(6, Math.min(14, Number(stats?.lines ?? 10) + confBoost));
      const maxTrends = Math.max(3, Math.min(8, Number(stats?.trends ?? 4) + (aiConf >= 78 ? 1 : 0)));
      const maxMisc = Math.max(12, Math.min(28, Math.round((Number(stats?.overlays ?? 20) || 20) * 0.55)));
      let z = 0;
      let l = 0;
      let t = 0;
      let s = 0;
      return sorted.filter((o: any) => {
        const id = String(o?.id || '');
        const kind = String(o?.kind || '');
        /** CP 밴드·CP+LinReg 합성·LL/LH·핵심 AI 존은 캡에 걸리지 않게(이전엔 cptc가 maxTrends에 잘려 안 보임) */
        if (
          id === 'ai-cp-lr-zone' ||
          id === 'ai-zone-main' ||
          id.startsWith('ai-zone-long-ref') ||
          id.startsWith('ai-zone-short-ref') ||
          id === 'ai-cp-lr-inv' ||
          id === 'ai-zone-invalidation' ||
          id === 'ai-zone-target' ||
          id.startsWith('ai-cp-lr-') ||
          id.startsWith('ai-lllh-') ||
          id.startsWith('cptc-')
        ) {
          return true;
        }
        if (kind === 'demandZone' || kind === 'supplyZone' || kind === 'zone' || kind === 'ob' || kind === 'fvg') {
          z += 1;
          return z <= maxZones;
        }
        if (kind === 'keyLevel' || kind === 'supportLine' || kind === 'resistanceLine') {
          l += 1;
          return l <= maxLines;
        }
        if (kind === 'trendLine' || id.startsWith('diag-') || id.startsWith('parkf-') || id.startsWith('cptc-')) {
          t += 1;
          return t <= maxTrends;
        }
        s += 1;
        return s <= maxMisc;
      });
    }

    /** 캔들분석·통합작도: 전용 레이어 + (옵션) 스마트와 동일 엔진 병합 — 레이어별 ON/OFF */
    if (candleAnalysisLikeUi) {
      const candleSlice = candleAnalysisSliceForUi ?? candles;
      const so =
        analysis?.smartOverlay ??
        (analysis ? buildSmartOverlayPayload(analysis, candleSlice) : null);
      const isUnifiedDesk = unifiedDeskMode;
      const executive = isUnifiedDesk ? true : candleAnalysisExecutiveView !== false;
      const caShowSmart = isUnifiedDesk ? true : candleAnalysisShowSmartGuide !== false;
      const caShowEll = isUnifiedDesk ? false : candleAnalysisShowElliottMvp !== false;
      const caShowPb = isUnifiedDesk ? false : candleAnalysisShowPlaybookPath !== false;
      const caShowAuto = isUnifiedDesk ? true : candleAnalysisShowAutoZones !== false;
      const caShowEngFvg = isUnifiedDesk ? false : candleAnalysisShowEngineFvg !== false;
      const caShowTrend = isUnifiedDesk ? true : candleAnalysisShowTrendPattern !== false;

      const elliottMvp =
        !caShowEll || !analysis ? [] : !executive ? buildCandleAnalysisElliottMvpOverlays(candleSlice, analysis, timeframe) : [];
      const playbookPath =
        !caShowPb || !analysis ? [] : !executive ? buildCandleAnalysisPlaybookPathOverlays(analysis, candleSlice, timeframe) : [];
      const autoAnalysisZones = !caShowAuto ? [] : candleAnalysisAutoSplit.chartOverlays;
      const smartZonesRaw = so
        ? executive
          ? smartOverlayZonesToExecutiveOverlays(so, candleSlice)
          : smartOverlayZonesToOverlays(so, candleSlice)
        : [];
      const guideBase = !caShowSmart
        ? []
        : so
          ? smartZonesRaw
          : executive
            ? []
            : buildCandleAnalysisGuideZones(analysis ?? undefined, candleSlice);
      const execPack: OverlayItem[] = [];
      const aiDraw = candleAnalysisAiDrawBundle?.overlays ?? [];
      const hashFib = candleAnalysisHashFibOverlays;
      const caZoneLayers = isUnifiedDesk ? false : candleAnalysisZoneChartVisible === true;
      const bosWaves =
        caZoneLayers && candleAnalysisBosWavesEnabled ? candleAnalysisBosWavesBundle.overlays : [];
      const vifvg =
        caZoneLayers && candleAnalysisVifvgEnabled ? candleAnalysisVifvgBundle.overlays : [];
      const breakerBlocks =
        caZoneLayers && candleAnalysisBreakerBlocksEnabled
          ? candleAnalysisBreakerBlocksBundle.overlays
          : [];
      const coreSdZones =
        candleAnalysisCoreSdZones !== false && candleSlice.length && analysisMatchesTf
          ? buildCandleAnalysisCoreSdZones((analysis as { overlays?: OverlayItem[] })?.overlays ?? [], candleSlice)
          : [];
      const coreSdPivots =
        candleAnalysisCoreSdZones !== false && candleSlice.length && analysisMatchesTf
          ? buildCandleAnalysisCoreSdPivots((analysis as { overlays?: OverlayItem[] })?.overlays ?? [], candleSlice)
          : [];
      const guideZones = [
        ...guideBase,
        ...elliottMvp,
        ...playbookPath,
        ...autoAnalysisZones,
        ...hashFib,
        ...bosWaves,
        ...vifvg,
        ...breakerBlocks,
        ...execPack,
        ...aiDraw,
      ];
      const structureFvg =
        !caShowEngFvg || executive ? [] : overlays.filter((item: any) => item.kind === 'fvg');
      const chartPrimeForCa = showChartPrimeTrendChannels
        ? overlays.filter(
            (item: any) =>
              item.category === 'chartPrimeTrendChannels' &&
              (item.kind === 'trendLine' || item.kind === 'channelBand' || item.kind === 'label')
          )
        : [];
      const trendAndPattern =
        !caShowTrend || executive
          ? []
          : overlays.filter((item: any) => {
              if (item.kind === 'symTriangleTarget') return true;
              if (item.kind === 'trendLine' && item.category !== 'chartPrimeTrendChannels') return true;
              if (item.id?.startsWith?.('diag-')) return true;
              if (item.category === 'trendlineEngine' || item.category === 'autoTrendline') return true;
              if (item.category === 'patternVision') {
                const id = String(item.id || '');
                return /^vision-(sym|asc|desc|rw|fw|bullflag|bearflag)-/.test(id);
              }
              return false;
            });
      const engineExtras =
        isUnifiedDesk || candleAnalysisMergeEngineOverlays !== false ? buildSmartExecutionOverlayPack() : [];
      const candleAnalysisMerged = dedupeOverlaysById([
        ...coreSdZones,
        ...coreSdPivots,
        ...guideZones,
        ...structureFvg,
        ...trendAndPattern,
        ...chartPrimeForCa,
        ...engineExtras,
      ]);
      const smcDeskOnly = filteredOverlays.filter((o: any) => o.category === 'smcDesk');
      let mergedCa = dedupeOverlaysById([
        ...smartAdaptivePack,
        ...candleAnalysisMerged.filter((item: any) => !candleAnalysisOverlayIsHiddenZone(item as Record<string, unknown>)),
        ...smcDeskOnly,
      ]);
      if (settings.chartBuySellZoneFocus === true) {
        mergedCa = mergedCa.filter((item) => overlayMatchesBuySellZoneFocus(item as OverlayItem));
      }
      return mergedCa;
    }
    // 실행·스마트·타점: 돌파/지지/무효화·추세·강한구간 등 가이드형 오버레이
    if (uiMode === 'EXECUTION' || uiMode === 'SMART' || uiMode === 'TAPPOINT') {
      if (uiMode === 'EXECUTION' || uiMode === 'SMART') {
        const basePack = buildSmartExecutionOverlayPack();
        const smcDeskRaw = filteredOverlays.filter((o: any) => o.category === 'smcDesk');
        const merged = dedupeOverlaysById([...basePack, ...smcDeskRaw]);
        return uiMode === 'EXECUTION' ? organizeExecutionModeOverlays(merged) : merged;
      }
      const harmonicXabcd = showHarmonic
        ? overlays.filter(
            (o: any) => o.kind === 'harmonicLeg' || o.kind === 'harmonic' || (o.kind === 'label' && o.category === 'harmonic')
          )
        : [];
      const rsiDivOverlays = showRsi
        ? overlays.filter(
            (o: any) =>
              o.kind === 'rsiSignal' ||
              o.kind === 'rsiDivergenceLine' ||
              o.category === 'rsi'
          )
        : [];
      const tailongOnly = overlays.filter((item: any) => item.id?.startsWith('tailong-'));
      const breakoutLevel = overlays.filter((item: any) => item.id?.startsWith('key-mustBreak-'));
      const mustHoldSupport = overlays.filter((item: any) => item.id?.startsWith('key-mustHold-'));
      const invalidationLevel = overlays.filter((item: any) => item.id?.startsWith('key-invalidation-'));
      /** 엔진 keyLevel 누락 방지: key-nextTarget 등 key-* 접두사 모두 포함 */
      const otherKeyLevels = overlays.filter((item: any) => item.kind === 'keyLevel' && item.id?.startsWith?.('key-') && !item.id.startsWith('key-mustBreak-') && !item.id.startsWith('key-mustHold-') && !item.id.startsWith('key-invalidation-'));
      const tapPatternLevels = overlays.filter((item: any) => item.id?.startsWith('tap-'));
      const bullishFvg = overlays.filter((item: any) => item.kind === 'fvg');
      const reactionZones = overlays.filter((item: any) => item.kind === 'reactionZone' || (item as any).category === 'reactionZone');
      const bullishOb = overlays.filter((item: any) => item.kind === 'ob');
      const trendlineOverlays = overlays.filter(
        (item: any) =>
          item.kind === 'trendLine' ||
          item.id?.startsWith?.('diag-') ||
          item.category === 'trendlineEngine' ||
          item.category === 'autoTrendline'
      );
      const demandSupply = overlays
        .filter((item: any) => (item.kind === 'demandZone' || item.kind === 'supplyZone') && item.id !== 'swing-tap-zone' && item.id !== 'tap-support-zone' && item.id !== 'tap-resistance-zone');
      const closeLevelLines = overlays.filter((item: any) => item.id?.startsWith('close-'));
      const lsPlanLevels = overlays.filter((item: any) => item.id?.startsWith('ls-plan-'));
      const settlementLevels = overlays.filter((item: any) => item.id?.startsWith('settlement-zone-') || item.id?.startsWith('settlement-level-'));
      const settlementPaths = overlays.filter((item: any) => item.id?.startsWith('settlement-path-'));
      const beamLabels = overlays.filter((item: any) => item.kind === 'label' && (item.id?.startsWith('beam-forecast-') || item.id?.startsWith('beam-confirm-')));
      const executionLabels = overlays.filter(
        (o: any) =>
          o.id === 'equilibrium' ||
          o.id === 'strong-high' ||
          o.id === 'strong-low' ||
          o.kind === 'liquiditySweep' ||
          o.kind === 'eqh' ||
          o.kind === 'eql' ||
          o.kind === 'supportLine' ||
          o.kind === 'resistanceLine'
      );
      const structureBreakoutPack2 =
        (!isAiMode && showStructure) || (isAiMode && whaleCoreSrZoneEnabled);
      const structureOverlays = structureBreakoutPack2 ? overlays.filter((o: any) => o.kind === 'choch' || o.kind === 'bos') : [];
      const swingTapZone = overlays.filter((o: any) => o.id === 'swing-tap-zone');
      const strongZones = showWhaleZone && analysisMatchesTf ? stableStrongZoneOverlays : [];
      const visionOverlays = filteredOverlays.filter((o: any) => o.category === 'patternVision');
      const lvrbOverlays = showLvrb ? overlays.filter((o: any) => o.category === 'lvrb') : [];
      const vtsOverlays = showVolatilityTrendScore ? overlays.filter((o: any) => o.category === 'volatilityTrendScore') : [];
      const chartPrimeBands = showChartPrimeTrendChannels
        ? overlays.filter((o: any) => o.category === 'chartPrimeTrendChannels' && o.kind === 'channelBand')
        : [];
      const chartPrimeLabels = showChartPrimeTrendChannels
        ? overlays.filter((o: any) => o.category === 'chartPrimeTrendChannels' && o.kind === 'label')
        : [];
      const tapFiltered = tapPatternLevels.filter((o: any) => o.id !== 'tap-support-zone' && o.id !== 'tap-resistance-zone');
      const smcDeskTap = filteredOverlays.filter((o: any) => o.category === 'smcDesk');
      return [
        ...smartAdaptivePack,
        ...swingTapZone,
        ...strongZones,
        ...executionLabels,
        ...beamLabels,
        ...structureOverlays,
        ...chartPrimeBands,
        ...trendlineOverlays,
        ...tapFiltered,
        ...breakoutLevel,
        ...mustHoldSupport,
        ...invalidationLevel,
        ...otherKeyLevels,
        ...settlementLevels,
        ...settlementPaths,
        ...closeLevelLines,
        ...lsPlanLevels,
        ...bullishFvg,
        ...reactionZones,
        ...demandSupply,
        ...bullishOb,
        ...tailongOnly,
        ...harmonicXabcd,
        ...rsiDivOverlays,
        ...visionOverlays,
        ...lvrbOverlays,
        ...vtsOverlays,
        ...chartPrimeLabels,
        ...smcDeskTap,
      ];
    }
    if (isSmcDeskMode) {
      const base = filteredOverlays.filter((item: any) => item.id !== 'swing-tap-zone');
      const compact = base.filter((item: any) =>
        overlayMatchesSmcDeskCompactView(item as Record<string, unknown>),
      );
      /** 압축 뷰에서 제외되던 TF 종가 마감선(close-*) — 선물·스팟 공통으로 항상 병합 */
      const closeTfSettlement = base.filter((o: any) => String(o.id || '').startsWith('close-'));
      const hotzones = compact.filter((o: any) => String(o.id).startsWith('hotzone-')).slice(-16);
      const hyper = compact.filter((o: any) => String(o.id).startsWith('hypertrend-')).slice(-380);
      const rest = compact.filter((o: any) => {
        const oid = String(o.id || '');
        return !oid.startsWith('hotzone-') && !oid.startsWith('hypertrend-');
      });
      const merged = dedupeOverlaysById([...smartAdaptivePack, ...rest, ...hotzones, ...hyper, ...closeTfSettlement]);
      const mp = smcDeskMarkerPlanCurrent;
      let out: OverlayItem[] = !mp
        ? (merged as OverlayItem[])
        : buildSmcDeskFullBundle(merged as OverlayItem[], mp).paintOrdered;
      if (settings.chartBuySellZoneFocus === true) {
        out = out.filter((item) => overlayMatchesBuySellZoneFocus(item as OverlayItem));
      }
      return out;
    }
    if (uiMode === 'FULL' || uiMode === 'EVOLUTION' || uiMode === 'MAX_ANALYSIS')
      return filteredOverlays.filter((o: any) => o.id !== 'swing-tap-zone');
    if (isAiMode) {
      const strong = showWhaleZone && analysisMatchesTf ? stableStrongZoneOverlays : [];
      const isWhaleLabel = (label: unknown) => {
        const s = String(label || '');
        return s.startsWith('Bu-') || s.startsWith('Be-') || s.startsWith('Buy-') || s.startsWith('Sell-');
      };
      const isWhaleId = (id: unknown) => {
        const s = String(id || '');
        return s.startsWith('whale-auto-') || s.startsWith('bu-') || s.startsWith('be-') || s.startsWith('buy-') || s.startsWith('sell-');
      };
      const whaleCore = filteredOverlays.filter((o: any) => {
        if (o?.id === 'swing-tap-zone') return false;
        const kind = String(o?.kind || '');
        if (kind !== 'zone' && kind !== 'ob' && kind !== 'demandZone' && kind !== 'supplyZone') return false;
        return isWhaleId(o?.id) || isWhaleLabel(o?.label);
      });
      const whaleRanked = whaleCore
        .filter((o: any) => Number(o?.confidence ?? 0) >= 72)
        .sort((a: any, b: any) => {
          const ta = Number(a?.time1 ?? a?.x1 ?? 0);
          const tb = Number(b?.time1 ?? b?.x1 ?? 0);
          if (tb !== ta) return tb - ta;
          return Number(b?.confidence ?? 0) - Number(a?.confidence ?? 0);
        });
      const cappedForecast = whaleRanked.filter((o: any) => String(o?.label || '').includes('MB(')).slice(0, 2);
      const cappedLocked = whaleRanked.filter((o: any) => !String(o?.label || '').includes('MB(')).slice(0, 12);
      const predict = filteredOverlays.filter((o: any) => String(o?.id || '').startsWith('whale-predict-')).slice(-2);
      const hotZones = filteredOverlays.filter((o: any) => String(o?.id || '').startsWith('hotzone-')).slice(-28);
      const hyperTrend = filteredOverlays.filter((o: any) => String(o?.id || '').startsWith('hypertrend-')).slice(-420);
      const whaleDrs = filteredOverlays.filter((o: any) => String(o?.id || '').startsWith('whale-drs-'));
      const whaleLqb = filteredOverlays.filter((o: any) => String(o?.id || '').startsWith('whale-lqb-'));
      const aiAutoMarks = filteredOverlays.filter((o: any) => String(o?.id || '').startsWith('ai-auto-'));
      const chartPrimeBands = showChartPrimeTrendChannels
        ? filteredOverlays.filter((o: any) => o.category === 'chartPrimeTrendChannels' && o.kind === 'channelBand')
        : [];
      const chartPrimeLines = showChartPrimeTrendChannels
        ? filteredOverlays.filter(
            (o: any) =>
              o.category === 'chartPrimeTrendChannels' &&
              (o.kind === 'trendLine' || o.kind === 'label' || String(o?.id || '').startsWith('cptc-'))
          )
        : [];
      const linregTrendlines = filteredOverlays.filter(
        (o: any) =>
          o.kind === 'trendLine' &&
          (o.category === 'trendlineEngine' ||
            o.category === 'autoTrendline' ||
            String(o?.id || '').startsWith('parkf-') ||
            String(o?.id || '').startsWith('diag-'))
      );
      const breakoutLevel = filteredOverlays.filter((item: any) =>
        String(item?.id || '').startsWith('key-mustBreak-')
      );
      const mustHoldSupport = filteredOverlays.filter((item: any) =>
        String(item?.id || '').startsWith('key-mustHold-')
      );
      const invalidationLevel = filteredOverlays.filter((item: any) =>
        String(item?.id || '').startsWith('key-invalidation-')
      );
      const otherKeyLevels = filteredOverlays.filter((item: any) => {
        const id = String(item?.id || '');
        return (
          item?.kind === 'keyLevel' &&
          id.startsWith('key-') &&
          !id.startsWith('key-mustBreak-') &&
          !id.startsWith('key-mustHold-') &&
          !id.startsWith('key-invalidation-')
        );
      });
      const smcDeskWhale = filteredOverlays.filter((o: any) => o.category === 'smcDesk');
      return [
        ...smartAdaptivePack,
        ...strong,
        ...aiAutoMarks,
        ...chartPrimeBands,
        ...chartPrimeLines,
        ...linregTrendlines,
        ...breakoutLevel,
        ...mustHoldSupport,
        ...invalidationLevel,
        ...otherKeyLevels,
        ...cappedLocked,
        ...cappedForecast,
        ...hotZones,
        ...hyperTrend,
        ...whaleDrs,
        ...whaleLqb,
        ...predict,
        ...smcDeskWhale,
      ];
    }
    const strong = showWhaleZone && analysisMatchesTf ? stableStrongZoneOverlays : [];
    if (uiMode === 'FOCUS') {
      const focusList = strong.length ? [...strong, ...filteredOverlays] : filteredOverlays;
      return focusList.filter((o: any) => o.id !== 'swing-tap-zone');
    }
    return [];
  }, [
    uiMode,
    candleAnalysisLikeUi,
    unifiedDeskMode,
    isAiMode,
    whaleCoreSrZoneEnabled,
    filteredOverlays,
    overlays,
    analysis,
    stableStrongZoneOverlays,
    analysis?.smartOverlay,
    analysisMatchesTf,
    showWhaleZone,
    showLvrb,
    showVolatilityTrendScore,
    showHarmonic,
    showChartPrimeTrendChannels,
    showRsi,
    showStructure,
    symbol,
    timeframe,
    candles,
    candleAnalysisSliceForUi,
    candleAnalysisAutoSplit,
    candleAnalysisExecutiveView,
    candleAnalysisAiDrawBundle,
    candleAnalysisHashFibOverlays,
    candleAnalysisBosWavesBundle.overlays,
    candleAnalysisVifvgBundle.overlays,
    candleAnalysisBreakerBlocksBundle.overlays,
    candleAnalysisZoneChartVisible,
    candleAnalysisCoreSdZones,
    candleAnalysisBosWavesEnabled,
    candleAnalysisVifvgEnabled,
    candleAnalysisBreakerBlocksEnabled,
    candleAnalysisMergeEngineOverlays,
    candleAnalysisShowSmartGuide,
    candleAnalysisShowElliottMvp,
    candleAnalysisShowPlaybookPath,
    candleAnalysisShowAutoZones,
    candleAnalysisShowEngineFvg,
    candleAnalysisShowTrendPattern,
    settings.chartBuySellZoneFocus,
    bibleModeOverlays,
    hotZonePullbackPack,
    smcDeskMarkerPlanCurrent,
  ]);

  const modeFilteredOverlaysDeduped = useMemo(
    () => dedupeOverlaysById(modeFilteredOverlays),
    [modeFilteredOverlays]
  );

  const smcDeskInspectBundle = useMemo(() => {
    if (!isSmcDeskMode || !smcDeskMarkerPlanCurrent) return null;
    return buildSmcDeskFullBundle(modeFilteredOverlaysDeduped as OverlayItem[], smcDeskMarkerPlanCurrent);
  }, [uiMode, smcDeskMarkerPlanCurrent, modeFilteredOverlaysDeduped]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (!smcDeskInspectBundle) {
      delete (window as unknown as { __ailongshortSmcDesk?: unknown }).__ailongshortSmcDesk;
      return;
    }
    (window as unknown as { __ailongshortSmcDesk?: unknown }).__ailongshortSmcDesk = {
      at: Date.now(),
      overlayCount: smcDeskInspectBundle.paintOrdered.length,
      primitives: groupSmcDeskRowsByPrimitive(smcDeskInspectBundle.rows),
      rows: smcDeskInspectBundle.rows,
      markerPlan: smcDeskInspectBundle.markerPlan,
    };
  }, [smcDeskInspectBundle]);

  useEffect(() => {
    if (!isSmcDeskMode) {
      setSmcDeskWelcomeToast(null);
      return;
    }
    if (typeof window === 'undefined') return;
    let cancelled = false;
    try {
      if (window.sessionStorage.getItem(SMC_DESK_WELCOME_TOAST_KEY) === '1') return;
      window.sessionStorage.setItem(SMC_DESK_WELCOME_TOAST_KEY, '1');
    } catch {
      return;
    }
    setSmcDeskWelcomeToast(
      'SMC 데스크: 존·추세·핫존이 압축 순서로 정렬되고 라벨은 짧게 표시됩니다. 캔들 마커는 기본 ON — ⚙ 모드 기능에서 더 켤 수 있습니다.'
    );
    const tid = window.setTimeout(() => {
      if (!cancelled) setSmcDeskWelcomeToast(null);
    }, 9000);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [uiMode]);

  const unifiedZoneLineSignal = useMemo(() => {
    const cp = Number((analysis as AnalyzeResponse | null)?.currentPrice);
    if (!Number.isFinite(cp) || cp <= 0) {
      return { state: 'WAIT' as const, score: 0, reasons: [] as string[] };
    }
    let zoneScore = 0;
    let lineScore = 0;
    let supportNear = false;
    let resistNear = false;
    let dashedSupport = false;
    let dashedResist = false;
    let nearestZoneDist = Number.POSITIVE_INFINITY;
    let nearestLineDist = Number.POSITIVE_INFINITY;
    const overlays = modeFilteredOverlaysDeduped as OverlayItem[];
    for (const ov of overlays) {
      const id = String(ov.id || '').toLowerCase();
      const label = String(ov.label || '').toLowerCase();
      const kind = String(ov.kind || '').toLowerCase();
      const isZoneLike = kind === 'zone' || kind === 'ob' || kind === 'fvg' || kind === 'bpr';
      if (isZoneLike) {
        const p1 = Number(ov.price1);
        const p2 = Number(ov.price2);
        if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;
        const low = Math.min(p1, p2);
        const high = Math.max(p1, p2);
        const center = (low + high) / 2;
        const dist = Math.abs(cp - center) / cp;
        if (dist > 0.02) continue;
        nearestZoneDist = Math.min(nearestZoneDist, dist);
        const byColor = inferUnifiedDeskBiasFromOverlayColor(typeof ov.color === 'string' ? ov.color : undefined);
        const longHint =
          byColor === 'long' ||
          /support|demand|buy|bull|musthold|long|지지|매수|롱/.test(`${id} ${label}`);
        const shortHint =
          byColor === 'short' ||
          /resist|supply|sell|bear|break|short|저항|매도|숏/.test(`${id} ${label}`);
        if (longHint && !shortHint) supportNear = true;
        if (shortHint && !longHint) resistNear = true;
      }
      const p1 = Number(ov.price1);
      const p2 = Number(ov.price2);
      if (!Number.isFinite(p1)) continue;
      const horizontalLike =
        kind === 'keylevel' ||
        (Number.isFinite(p2) && Math.abs(p1 - p2) / Math.max(1, Math.abs(p1)) < 0.0005);
      if (!horizontalLike) continue;
      const lineDist = Math.abs(cp - p1) / cp;
      if (lineDist > 0.015) continue;
      nearestLineDist = Math.min(nearestLineDist, lineDist);
      const dashed = typeof ov.lineDash === 'string' && ov.lineDash.trim().length > 0;
      const longHint = /musthold|support|reclaim|buy|long|지지|매수|롱/.test(`${id} ${label}`);
      const shortHint = /mustbreak|invalidation|resist|sell|short|저항|매도|숏/.test(`${id} ${label}`);
      if (dashed && longHint && !shortHint) dashedSupport = true;
      if (dashed && shortHint && !longHint) dashedResist = true;
    }
    if (supportNear) zoneScore += 2;
    if (resistNear) zoneScore -= 2;
    if (dashedSupport) lineScore += 1;
    if (dashedResist) lineScore -= 1;
    const score = zoneScore + lineScore;
    const state: 'LONG' | 'SHORT' | 'WAIT' = score >= 2 ? 'LONG' : score <= -2 ? 'SHORT' : 'WAIT';
    const reasons: string[] = [];
    if (supportNear) reasons.push('근접 지지 존');
    if (resistNear) reasons.push('근접 저항 존');
    if (dashedSupport) reasons.push('점선 지지선');
    if (dashedResist) reasons.push('점선 저항선');
    if (Number.isFinite(nearestZoneDist) && nearestZoneDist < Number.POSITIVE_INFINITY) {
      reasons.push(`존거리 ${(nearestZoneDist * 100).toFixed(2)}%`);
    }
    if (Number.isFinite(nearestLineDist) && nearestLineDist < Number.POSITIVE_INFINITY) {
      reasons.push(`선거리 ${(nearestLineDist * 100).toFixed(2)}%`);
    }
    return { state, score, reasons };
  }, [analysis, modeFilteredOverlaysDeduped]);

  /** 통합작도 스트립: 캔들 위 구조 로켓 마커와 동일 소스(`lsRocketHud`)의 가시 구간 최신값 */
  const unifiedDeskRocketStrip = useMemo(() => {
    if (!unifiedDeskMode || candles.length < 1) {
      return { state: 'WAIT' as const, label: '', title: '구조 로켓 없음' };
    }
    if (!lsRocketHud.length) {
      return { state: 'WAIT' as const, label: '', title: '구조 로켓 없음' };
    }
    const firstT = candles[0].time as number;
    const lastT = candles[candles.length - 1].time as number;
    const inRange = lsRocketHud.filter((r) => r.time >= firstT && r.time <= lastT);
    if (!inRange.length) {
      return { state: 'WAIT' as const, label: '', title: '현재 가시 구간에 로켓 없음' };
    }
    const last = inRange[inRange.length - 1];
    return {
      state: last.direction === 'LONG' ? ('LONG' as const) : ('SHORT' as const),
      label: last.direction === 'LONG' ? '🚀 롱' : '📉 숏',
      title: `구조 로켓(캔들 마커와 동일) · ${last.direction}`,
    };
  }, [unifiedDeskMode, candles, lsRocketHud]);

  const chartBulkHideLabels = settings.chartBulkHideLabels === true;
  const chartBulkHideHLines = settings.chartBulkHideHLines === true;
  const chartBulkHideZones = settings.chartBulkHideZones === true;
  /** 통합작도: 차트 위 텍스트·핀 대신 존·선·톤만 — 일괄 라벨 숨김과 동일 필터 적용 */
  const unifiedDeskHideOverlayText = unifiedDeskMode;
  /**
   * 통합작도는 본질적으로 텍스트를 끄지만, **AI_ZONE**은 캡션·핵심 라벨이 본기능이므로 동일 압박을 받지 않음.
   * `라벨X` / `존X`는 `overlayMatchesBulk*()` + `isAiZoneEngineOverlayId` 예외로 `ai-*`는 통과.
   */
  const suppressHtmlOverlayCaptions = (chartBulkHideLabels && uiMode !== 'AI_ZONE') || (unifiedDeskHideOverlayText && uiMode !== 'AI_ZONE');
  /**
   * 존(공급·수요·OB 등) 면 위 캡션·가격띠: `라벨 전부 끄기` 시 기본으로 같이 꺼짐.
   * 최강분석에서는 존 식별을 위해 캡션만 유지(핀·기타 HTML 라벨은 suppressHtmlOverlayCaptions 그대로).
   * AI_ZONE은 존 캡션이 읽을 거리 — 통합 압박에서 제외.
   */
  const suppressZoneHtmlCaptions =
    (unifiedDeskHideOverlayText && uiMode !== 'AI_ZONE') ||
    (chartBulkHideLabels && uiMode !== 'MAX_ANALYSIS' && !isSmcDeskMode && uiMode !== 'AI_ZONE');

  const overlayBulkFiltered = useMemo(() => {
    let list = modeFilteredOverlaysDeduped;
    const isSmartMvpCore = (o: unknown) => String((o as { id?: string })?.id || '').startsWith('smartmoney-mvp-');
    const hideLbl = (chartBulkHideLabels && uiMode !== 'AI_ZONE') || (unifiedDeskHideOverlayText && uiMode !== 'AI_ZONE') || CHART_DEV_ZONES_MSBOB_ONLY;
    const hideHl = (chartBulkHideHLines && uiMode !== 'AI_ZONE') || CHART_DEV_ZONES_MSBOB_ONLY;
    if (hideLbl) {
      list = list.filter((o) => isSmartMvpCore(o) || !overlayMatchesBulkLabelHide(o as Record<string, unknown>));
    }
    if (hideHl) {
      list = list.filter((o) => isSmartMvpCore(o) || !overlayMatchesBulkHLineHide(o as Record<string, unknown>));
    }
    if (chartBulkHideZones && uiMode !== 'AI_ZONE') {
      list = list.filter((o) => {
        if (isSmartMvpCore(o)) return true;
        if (isAiMode && whaleHotZoneEnabled && isWhaleHotZoneOverlay(o as Record<string, unknown>)) return true;
        if (isAiMode && whaleCoreSrZoneEnabled && isMajorCoreSrOverlay(o as Record<string, unknown>)) return true;
        return !overlayMatchesBulkZoneHide(o as Record<string, unknown>);
      });
    }
    if (CHART_DEV_ZONES_MSBOB_ONLY) {
      list = list.filter((o) => isDevMsbObOnlyAllowedOverlay(o as OverlayItem));
    }
    return list;
  }, [
    modeFilteredOverlaysDeduped,
    chartBulkHideLabels,
    chartBulkHideHLines,
    chartBulkHideZones,
    unifiedDeskHideOverlayText,
    uiMode,
    isAiMode,
    whaleHotZoneEnabled,
    whaleCoreSrZoneEnabled,
  ]);

  const hasStrongZones = analysisMatchesTf && stableStrongZoneOverlays.length > 0;
  const useZoneRange = ((uiMode === 'FOCUS' || uiMode === 'SMART') && showWhaleZone) && hasStrongZones;
  const overlayDevEnhanced = useMemo(() => {
    if (!CHART_DEV_ZONES_MSBOB_ONLY || !candlesForOverlay.length) return overlayBulkFiltered;
    return enhanceMsbObDevOverlays(overlayBulkFiltered as OverlayItem[], candlesForOverlay);
  }, [overlayBulkFiltered, candlesForOverlay]);

  /** 가로 줄선·존 근접 봉 → 금색/시안 펄스 (pre3와 병합 시 pre3 우선) */
  const lineZoneProximityByTime = useMemo(() => {
    /** AI 분석 모드: 오버레이가 많을 때 근접/스파클 전 캔들·존 전수 스캔이 메인 병목 — 생략 */
    if (uiMode === 'AI_ZONE') return new Map<number, 'LONG' | 'SHORT'>();
    const safe = sanitizeChartCandlesForSeries(candles);
    const sens = Number.isFinite(settings.chartLineZoneProximitySensitivity)
      ? Math.max(0.35, Math.min(2.6, settings.chartLineZoneProximitySensitivity))
      : 1;
    return collectLineZoneProximitySparkle(overlayDevEnhanced as OverlayItem[], safe, sens);
  }, [uiMode, overlayDevEnhanced, candles, settings.chartLineZoneProximitySensitivity]);

  /** 마지막 봉이 존·줄선 가격에 근접 시 해당 오버레이 id — HTML 라벨 애니메이션 */
  const overlayLabelProximityIds = useMemo(() => {
    if (uiMode === 'AI_ZONE') return new Set<string>();
    const safe = sanitizeChartCandlesForSeries(candles);
    const sens = Number.isFinite(settings.chartLineZoneProximitySensitivity)
      ? Math.max(0.35, Math.min(2.6, settings.chartLineZoneProximitySensitivity))
      : 1;
    return collectOverlayIdsNearLastCandle(overlayDevEnhanced as OverlayItem[], safe, sens);
  }, [uiMode, overlayDevEnhanced, candles, settings.chartLineZoneProximitySensitivity]);

  const anchored = useMemo(
    () =>
      candlesForOverlay.length
        ? mapOverlays(overlayDevEnhanced, candlesForOverlay, timeframe, {
            useZonePriceRange: useZoneRange,
            closeOverlayRange: (analysis as any)?.closeOverlayRange,
          })
        : [],
    [overlayDevEnhanced, candlesForOverlay, timeframe, useZoneRange, analysis]
  );

  const [executionPositions, setExecutionPositions] = useState<ExecutionPositions | null>(null);
  useEffect(() => {
    if (
      (uiMode !== 'EXECUTION' &&
        uiMode !== 'SMART' &&
        uiMode !== 'MAX_ANALYSIS' &&
        !isSmcDeskMode &&
        uiMode !== 'UNIFIED_DESK' &&
        uiMode !== 'AI_ZONE' &&
        uiMode !== 'TAPPOINT') ||
      !analysis ||
      !chartRef.current ||
      !seriesRef.current ||
      !hostRef.current ||
      !candles.length
    ) {
      setExecutionPositions(null);
      return;
    }
    const chart = chartRef.current;
    const series = seriesRef.current;
    const host = hostRef.current;
    const lastTime = candles[candles.length - 1].time;
    const pad = 60;
    const rect = host.getBoundingClientRect();
    const ts = chart.timeScale();
    const twExec = timeScalePixelWidth(ts, rect.width);
    const tAt0 = ts.coordinateToTime(0) as { timestamp?: number } | number | null;
    const tAtW = ts.coordinateToTime(timeScaleRightPixelX(ts, rect.width) as UTCTimestamp) as
      | { timestamp?: number }
      | number
      | null;
    const tMin = tAt0 != null ? (typeof tAt0 === 'object' ? tAt0.timestamp : tAt0) : null;
    const tMax = tAtW != null ? (typeof tAtW === 'object' ? tAtW.timestamp : tAtW) : null;
    const x = analysisTimeToScreenX(candles, lastTime as number, ts, series, rect, pad, tMin, tMax);
    if (!Number.isFinite(x)) {
      setExecutionPositions(null);
      return;
    }
    const xStart = Math.max(pad, x - 80);
    const xEnd = Math.min(twExec - pad, x + 40);
    const entry = parseFloat(analysis.entry);
    const stop = parseFloat(analysis.stopLoss);
    const targets = (analysis.targets || []).slice(0, 3).map(t => parseFloat(String(t))).filter(n => !isNaN(n));
    if (isNaN(entry) || isNaN(stop)) { setExecutionPositions(null); return; }
    const entryY = series.priceToCoordinate(entry);
    const stopY = series.priceToCoordinate(stop);
    const tpY = targets.map(t => series.priceToCoordinate(t)).filter(y => y != null).map(y => Number(y));
    if (entryY == null || stopY == null) { setExecutionPositions(null); return; }
    setExecutionPositions({
      entryY: Number(entryY),
      stopY: Number(stopY),
      tpY,
      xStart,
      xEnd,
      entryPrice: entry,
      stopPrice: stop,
      tpPrices: targets,
      isLong: analysis.verdict === 'LONG',
    });
  }, [uiMode, analysis, candles, overlayTick]);

  useEffect(() => {
    if (!unifiedDeskMode) {
      setUnifiedTvBands(null);
      return;
    }
    const series = seriesRef.current;
    const host = hostRef.current;
    if (!series || !host || !analysis || candles.length < 1) {
      setUnifiedTvBands(null);
      return;
    }
    const ar = analysis as AnalyzeResponse;
    if (ar.symbol !== symbol || ar.timeframe !== timeframe) {
      setUnifiedTvBands(null);
      return;
    }
    const last = candles[candles.length - 1];
    const lastClose = Number(last?.close);
    if (!Number.isFinite(lastClose)) {
      setUnifiedTvBands(null);
      return;
    }

    const safePriceToY = (price: number): number | null => {
      if (!Number.isFinite(price)) return null;
      try {
        const y = series.priceToCoordinate(price);
        return y == null ? null : Number(y);
      } catch {
        return null;
      }
    };

    const bandFromPrices = (hi: number, lo: number): { top: number; height: number } | null => {
      if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
      const yHi = safePriceToY(hi);
      const yLo = safePriceToY(lo);
      if (yHi == null || yLo == null) return null;
      const top = Math.min(yHi, yLo);
      const height = Math.abs(yLo - yHi);
      if (height < 2) return null;
      return { top, height };
    };

    const pickZone = (
      nearest: StrongZoneOutput | null | undefined,
      list: StrongZoneOutput[] | undefined,
      side: 'sell' | 'buy'
    ): StrongZoneOutput | null => {
      if (nearest && Number.isFinite(nearest.low) && Number.isFinite(nearest.high)) return nearest;
      const zones = list ?? [];
      if (!zones.length) return null;
      const scored = zones
        .filter((z) => Number.isFinite(z.low) && Number.isFinite(z.high))
        .map((z) => {
          const mid = (z.low + z.high) / 2;
          const dist =
            side === 'sell' && mid >= lastClose
              ? mid - lastClose
              : side === 'buy' && mid <= lastClose
                ? lastClose - mid
                : Number.POSITIVE_INFINITY;
          return { z, dist };
        })
        .filter((x) => Number.isFinite(x.dist))
        .sort((a, b) => a.dist - b.dist);
      if (scored[0] && scored[0].dist !== Number.POSITIVE_INFINITY) return scored[0].z;
      if (side === 'sell') return zones.reduce((a, b) => (a.high > b.high ? a : b));
      return zones.reduce((a, b) => (a.low < b.low ? a : b));
    };

    const sellZ = pickZone(ar.nearestSellZone, ar.sellZones, 'sell');
    const buyZ = pickZone(ar.nearestBuyZone, ar.buyZones, 'buy');

    let ribbon: { top: number; height: number } | null = null;
    const bbU = ar.indicators?.bbUpper;
    const bbL = ar.indicators?.bbLower;
    if (Array.isArray(bbU) && Array.isArray(bbL) && bbU.length && bbL.length) {
      const u = bbU[bbU.length - 1];
      const l = bbL[bbL.length - 1];
      ribbon = bandFromPrices(Number(u), Number(l));
    }

    const ribbonBias: 'long' | 'short' | null =
      ar.verdict === 'LONG' ? 'long' : ar.verdict === 'SHORT' ? 'short' : null;

    setUnifiedTvBands({
      resist: sellZ ? bandFromPrices(sellZ.high, sellZ.low) : null,
      support: buyZ ? bandFromPrices(buyZ.high, buyZ.low) : null,
      ribbon,
      ribbonBias,
    });
  }, [unifiedDeskMode, analysis, symbol, timeframe, candles, overlayTick]);

  /** 브리핑 기반 진입·손절·목표 가격선 — 차트 전역 가로선으로 표시 */
  useEffect(() => {
    const series = seriesRef.current;
    const lines = executionPriceLinesRef.current;
    const prev = [...lines];
    lines.length = 0;
    prev.forEach((line) => {
      try {
        (series as any)?.removePriceLine?.(line);
      } catch {}
    });

    if (uiMode === 'CANDLE_ANALYSIS' || uiMode === 'BIBLE_MODE' || uiMode === 'HOT_ZONE') return;

    const confirmed = (analysis as { confirmedSignal?: { confirmed?: boolean; direction?: string }; symbol?: string; timeframe?: string })?.confirmedSignal;
    const match = analysisMatchesSymbolAndTf(analysis, symbol, timeframe);
    if (!series || !match || !analysis) return;
    if (CHART_DEV_ZONES_MSBOB_ONLY) return;
    if (settings.chartBulkHideHLines) return;
    const hasLsSignal = analysis.verdict === 'LONG' || analysis.verdict === 'SHORT';
    if (!hasLsSignal) return;

    const entry = parseFloat(String(analysis.entry ?? ''));
    const stop = parseFloat(String(analysis.stopLoss ?? ''));
    const targets = (analysis.targets ?? []).slice(0, 3).map((t) => parseFloat(String(t))).filter((n) => !isNaN(n));
    if (isNaN(entry) || isNaN(stop) || entry <= 0 || stop <= 0) return;

    const isLong = (confirmed?.direction === 'LONG') || (confirmed?.direction == null && analysis.verdict === 'LONG');
    const isConfirmed = confirmed?.confirmed === true;
    const entryColor = isConfirmed ? (isLong ? '#22C55E' : '#EF4444') : (isLong ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)');
    const stopColor = isConfirmed ? '#EF4444' : 'rgba(239,68,68,0.55)';
    const tpColor = isConfirmed ? '#22C55E' : 'rgba(34,197,94,0.55)';

    const axisBg = 'rgba(15,23,42,0.92)';
    const add = (price: number, title: string, color: string) => {
      try {
        const line = (series as any).createPriceLine({
          price,
          color,
          title,
          lineWidth: isConfirmed ? 2 : 1,
          lineStyle: isConfirmed ? LineStyle.Solid : LineStyle.Dashed,
          lineVisible: false,
          axisLabelVisible: !settings.chartBulkHideLabels,
          axisLabelColor: axisBg,
          axisLabelTextColor: color,
        });
        lines.push(line);
      } catch {}
    };

    add(entry, 'E', entryColor);
    add(stop, 'SL', stopColor);
    targets.forEach((t, i) => add(t, `TP${i + 1}`, tpColor));

    return () => {
      lines.forEach((line) => {
        try {
          (series as any)?.removePriceLine?.(line);
        } catch {}
      });
      lines.length = 0;
    };
  }, [analysis, symbol, timeframe, settings.chartBulkHideHLines, settings.chartBulkHideLabels, uiMode]);

  /** 구조 세트업 E/SL/TP 가격축 라벨·라인 비표시 — 신호는 캔들 로켓 오버레이만 사용 */
  useEffect(() => {
    const series = seriesRef.current;
    const lines = structureTradePriceLinesRef.current;
    const prev = [...lines];
    lines.length = 0;
    prev.forEach((line) => {
      try {
        (series as any)?.removePriceLine?.(line);
      } catch {}
    });
    return () => {
      lines.forEach((line) => {
        try {
          (series as any)?.removePriceLine?.(line);
        } catch {}
      });
      lines.length = 0;
    };
  }, [analysis, symbol, timeframe]);

  const screenOverlays = useMemo(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const host = hostRef.current;
    if (!chart || !series || !host) return [];
    /**
     * time→X·봉 자석은 **mapOverlays에 넣은 배열과 동일**해야 함. `anchored`의 time1·time2는
     * `candlesForOverlay` 기준인데 여기서만 `candles`를 쓰면 길이·인덱스가 달라 줌·축소 시 우측 빈 축으로 드리프트.
     * 라이브 캔들 우선일 때는 둘이 같지만, 분기마다 반드시 동일 소스를 쓴다.
     */
    const overlaySourceCandles = candlesForOverlay.length ? candlesForOverlay : candles;
    if (!overlaySourceCandles.length) return [];
    const candleSeries = sanitizeChartCandlesForSeries(overlaySourceCandles);
    if (!candleSeries.length) return [];
    const rect = host.getBoundingClientRect();
    const pad = 20;
    const priceStripRight = rect.width - PRICE_AXIS_RESERVE_PX - PRICE_STRIP_PADDING_PX;
    const ts = chart.timeScale();
    const twOverlay = timeScalePixelWidth(ts, rect.width);
    const tAt0 = ts.coordinateToTime(0) as { timestamp?: number } | number | null;
    const tAtW = ts.coordinateToTime(timeScaleRightPixelX(ts, rect.width) as UTCTimestamp) as
      | { timestamp?: number }
      | number
      | null;
    const tMin = tAt0 != null ? (typeof tAt0 === 'object' ? tAt0.timestamp : tAt0) : null;
    const tMax = tAtW != null ? (typeof tAtW === 'object' ? tAtW.timestamp : tAtW) : null;
    /** 모든 분석 오버레이: time → X 는 항상 시리즈 캔들 시각 스냅 후 동일 파이프 */
    const resolveTimeX = (t: number) =>
      analysisTimeToScreenX(candleSeries, t, ts, series, rect, pad, tMin, tMax);
    /** coordinateToTime / 캔들.time 과 동일 단위 (기존 tMin·resolveX와 맞춤) */
    const extractTime = (t: unknown): number | null => {
      if (t == null) return null;
      if (typeof t === 'number' && !Number.isNaN(t)) return t;
      if (typeof t === 'object' && t !== null && 'timestamp' in t) {
        const v = (t as { timestamp?: number }).timestamp;
        return typeof v === 'number' && !Number.isNaN(v) ? v : null;
      }
      return null;
    };
    /** timeToCoordinate X 와 동일 스케일(타임스케일 폭) — rect.width 는 가격축 포함이라 캡이 어긋남 */
    const chartRightPx = twOverlay;
    const lastDataT =
      candleSeries.length > 0 ? Number(candleSeries[candleSeries.length - 1]!.time) : NaN;
    const xLastMagnet = Number.isFinite(lastDataT)
      ? coreMagnetBarTimeToX(candleSeries, lastDataT, ts, series)
      : NaN;
    const xAtLastDataBar = Number.isFinite(xLastMagnet)
      ? xLastMagnet
      : Number.isFinite(lastDataT)
        ? resolveTimeX(lastDataT)
        : NaN;
    /** 마지막 봉 X가 NaN이면 logical 마지막 인덱스로 폴백 — 존 우측 클램프 스킵 시 빈 축으로 튐 방지 */
    let safeXLastBar = Number.isFinite(xAtLastDataBar) ? xAtLastDataBar : NaN;
    if (!Number.isFinite(safeXLastBar) && candleSeries.length > 0) {
      try {
        const li = (candleSeries.length - 1) as unknown as Logical;
        const xc = ts.logicalToCoordinate(li);
        if (xc != null && Number.isFinite(Number(xc))) safeXLastBar = Number(xc);
      } catch {
        /* ignore */
      }
    }
    /** 시리즈에 올라간 마지막 봉 시각으로 직접 X (coreMagnet 실패·스크롤 직후에도 우측 끝으로 붙지 않게) */
    if (!Number.isFinite(safeXLastBar) && candleSeries.length > 0) {
      try {
        const lastT = Number(candleSeries[candleSeries.length - 1]!.time);
        if (Number.isFinite(lastT)) {
          const raw = ts.timeToCoordinate(lastT as UTCTimestamp);
          if (raw != null && Number.isFinite(Number(raw))) safeXLastBar = Number(raw);
        }
      } catch {
        /* ignore */
      }
    }
    if (!Number.isFinite(safeXLastBar) && candleSeries.length > 0) {
      try {
        const sBar = series.dataByIndex(
          (candleSeries.length - 1) as unknown as Logical,
          MismatchDirection.NearestLeft
        );
        if (sBar?.time != null) {
          const raw = ts.timeToCoordinate(sBar.time as UTCTimestamp);
          if (raw != null && Number.isFinite(Number(raw))) safeXLastBar = Number(raw);
        }
      } catch {
        /* ignore */
      }
    }
    /** 우측(미래 축)으로 보내지 않음 — 0.92*폭 폴백은 줌아웃 시 빈 축에 존이 붙는 원인이었음 */
    if (!Number.isFinite(safeXLastBar)) {
      safeXLastBar = Math.min(chartRightPx * 0.5, chartRightPx);
    }
    /** 마지막 데이터 봉 X — 줌아웃 시 우측 빈 시간축까지 선·존을 늘리지 않음 */
    const extendRightCap = Math.min(chartRightPx, safeXLastBar);
    const items = anchored.flatMap((item: any) => {
      const cat = String((item as any).category || '');
      const tid = typeof (item as any).id === 'string' ? String((item as any).id) : '';
      const magnetElliottSeg =
        tid.startsWith('candle-analysis-elliott-seg-') ||
        tid === 'candle-analysis-elliott-next' ||
        tid.startsWith('candle-analysis-playbook-');
      const magnetTrend =
        isLineKind(item.kind) &&
        typeof item.time1 === 'number' &&
        typeof item.time2 === 'number' &&
        (item.kind === 'trendLine' || cat === 'autoTrendline' || cat === 'trendlineEngine' || magnetElliottSeg);
      const isZoneKind = ['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone'].includes(
        item.kind
      );
      if (item.kind === 'channelBand' && item.channelBand) {
        const b = item.channelBand as {
          time1: number;
          time2: number;
          priceHigh1: number;
          priceHigh2: number;
          priceLow1: number;
          priceLow2: number;
        };
        const bandMagnetX = (t: number) => {
          const m = coreMagnetBarTimeToX(candleSeries, t, ts, series);
          return Number.isFinite(m) ? m : resolveTimeX(t);
        };
        let xA = bandMagnetX(b.time1);
        let xB = bandMagnetX(b.time2);
        if (Math.abs(xB - xA) < 1.5) {
          xB = xA + 1.5;
        }
        const chFb = rect.height * 0.5;
        const nH1 = geomPriceToPixelY(series, b.priceHigh1, chFb);
        const nH2 = geomPriceToPixelY(series, b.priceHigh2, chFb);
        const nL1 = geomPriceToPixelY(series, b.priceLow1, chFb);
        const nL2 = geomPriceToPixelY(series, b.priceLow2, chFb);
        if (![nH1, nH2, nL1, nL2].every((v) => Number.isFinite(v))) {
          return [];
        }
        const poly = [
          { x: xA, y: nH1 },
          { x: xB, y: nH2 },
          { x: xB, y: nL2 },
          { x: xA, y: nL1 },
        ];
        const minPx = Math.min(xA, xB);
        const maxPx = Math.max(xA, xB);
        const minPy = Math.min(nH1, nH2, nL1, nL2);
        const maxPy = Math.max(nH1, nH2, nL1, nL2);
        return [
          {
            ...item,
            channelBandScreen: poly,
            x1: minPx,
            y1: minPy,
            x2: maxPx,
            y2: maxPy,
            xMaxRight: maxPx,
            priceStripRight,
            chartWidth: rect.width,
            chartHeight: rect.height,
          },
        ];
      }
      const lastDataTForClamp =
        candleSeries.length > 0 ? Number(candleSeries[candleSeries.length - 1]!.time) : NaN;
      let t1Src =
        typeof item.time1 === 'number' ? item.time1 : ((candleSeries[0]?.time as number) ?? 0);
      if (isZoneKind && Number.isFinite(lastDataTForClamp) && typeof t1Src === 'number' && t1Src > lastDataTForClamp) {
        t1Src = lastDataTForClamp;
      }
      let t2Src = item.time2 != null && typeof item.time2 === 'number' ? item.time2 : null;
      if (isZoneKind && t2Src != null && Number.isFinite(lastDataTForClamp) && t2Src > lastDataTForClamp) {
        t2Src = lastDataTForClamp;
      }
      /** SMC 데스크: Fluid S/D·DRS/LQB 존 우측을 마지막 캔들 시각에 고정(형성 구간만 쓰면 줌 시 우측 빈 축으로 어긋남) */
      if (
        isSmcDeskMode &&
        isZoneKind &&
        Number.isFinite(lastDataTForClamp) &&
        t2Src != null &&
        typeof t2Src === 'number'
      ) {
        const smcZoneStickLast =
          tid.startsWith('whale-drs-') ||
          tid === 'whale-lqb-bsl' ||
          tid === 'whale-lqb-ssl' ||
          /^supply-\d+$/.test(tid) ||
          /^demand-\d+$/.test(tid);
        if (smcZoneStickLast) {
          t2Src = lastDataTForClamp;
        }
      }
      /** 캔들분석·핵심 존·선: time→X 봉 자석(모든 모드 공통 id 목록) */
      const barMagnetSnap = typeof tid === 'string' && isMagnetBarSnapOverlayId(tid);
      let x1: number;
      let x2: number | null;
      if (barMagnetSnap && typeof t1Src === 'number') {
        const m1 = coreMagnetBarTimeToX(candleSeries, t1Src, ts, series);
        x1 = Number.isFinite(m1) ? m1 : resolveTimeX(t1Src);
      } else {
        x1 = resolveTimeX(t1Src);
      }
      if (barMagnetSnap && t2Src != null && typeof t2Src === 'number') {
        const m2 = coreMagnetBarTimeToX(candleSeries, t2Src, ts, series);
        x2 = Number.isFinite(m2) ? m2 : resolveTimeX(t2Src);
      } else {
        x2 = t2Src != null ? resolveTimeX(t2Src) : null;
      }
      const yFallback = rect.height * 0.5;
      /** 핀·짧은 캡션은 화면 안 가독용 클램프 — 선·밴드 면은 geom만(꼭짓점 클램프 시 면 왜곡). */
      const pinLikeKind =
        item.kind === 'label' || item.kind === 'swingLabel' || item.kind === 'poi';
      const priceToY = (p: unknown, fb: number) =>
        pinLikeKind ? coordYFromOverlayPrice(series, p, rect.height, fb) : geomPriceToPixelY(series, p, fb);
      let y1 = priceToY(item.price1, yFallback);
      let y2: number | null =
        typeof item.price2 === 'number' ? priceToY(item.price2, y1) : null;
      /** 핵심 가로선: 동일 가격이면 Y를 한 값으로(가격축·캔들 기준과 어긋남 방지) */
      if (
        barMagnetSnap &&
        isLineKind(item.kind) &&
        typeof item.price1 === 'number' &&
        typeof item.price2 === 'number' &&
        Number.isFinite(item.price1) &&
        Number.isFinite(item.price2)
      ) {
        const m = Math.max(Math.abs(item.price1), Math.abs(item.price2), 1e-12);
        if (Math.abs(item.price1 - item.price2) / m < 1e-9) {
          y2 = y1;
        }
      }
      // X·Y를 차트 사각형에 잘라내면 패닝·줌 시 캔들은 밖으로 가는데 존·선·라벨이 좌/상단에 붙어 보임(모바일 특히).
      // timeToCoordinate / priceToCoordinate 값을 그대로 쓰고, 영역 밖은 overlay-layer overflow:hidden으로 처리.
      const isZone = isZoneKind;
      /**
       * 존은 y1·y2가 둘 다 숫자일 때만 그려짐. 골든포켓처럼 가격 두께가 매우 얇으면 priceToCoordinate 한쪽만 null이 되기 쉬움 → 면이 통째로 사라짐.
       * 상·하 가격 각각 좌표를 구하고, 누락 시 가격 비율로 픽셀 두께를 추정해 최소 높이를 보장.
       */
      const zoneSticky = Math.max(
        0.6,
        Math.min(2.4, Number(settings.zoneStickyStrength ?? defaultSettings.zoneStickyStrength ?? 1))
      );
      if (
        isZone &&
        typeof item.price1 === 'number' &&
        Number.isFinite(item.price1) &&
        typeof item.price2 === 'number' &&
        Number.isFinite(item.price2)
      ) {
        const pHi = Math.max(item.price1, item.price2);
        const pLo = Math.min(item.price1, item.price2);
        const cHi = geomPriceToPixelY(series, pHi, y1);
        const cLo = geomPriceToPixelY(series, pLo, y1);
        const relH = Math.max(0.0005, (pHi - pLo) / Math.max(1e-12, pHi));
        const estPx = Math.max(8, Math.min(rect.height * 0.45, relH * rect.height * 0.55));
        if (cHi != null && cLo != null) {
          y1 = Number(cHi);
          y2 = Number(cLo);
        } else if (cHi != null) {
          y1 = Number(cHi);
          y2 = y1 + estPx;
        } else if (cLo != null) {
          y2 = Number(cLo);
          y1 = y2 - estPx;
        } else {
          const cMid = geomPriceToPixelY(series, (pHi + pLo) / 2, y1);
          if (Number.isFinite(cMid)) {
            const half = Math.max(10, estPx / 2);
            const m = cMid;
            y1 = m - half;
            y2 = m + half;
          } else {
            const m = rect.height * 0.5;
            y1 = m - 6;
            y2 = m + 6;
          }
        }
        const minZoneH = Math.max(6, Math.round(10 * zoneSticky));
        if (y2 != null && Math.abs(y1 - y2) < minZoneH) {
          const mid = (y1 + y2) / 2;
          y1 = mid - minZoneH * 0.5;
          y2 = mid + minZoneH * 0.5;
        }
      }
      const zoneTintedColor = isZone ? (applyUserZoneFill(item.color, zoneFillUserOpts) ?? item.color) : item.color;
      const isLine = isLineKind(item.kind);
      const isFuturePathMain = String(item.id || '').startsWith('tap-beam-path-main-');
      /**
       * 핵심 분석 면(major / ca-core / 고래 strict): zoneSpanOnly — 우측 빈 축까지 임의 연장 방지.
       * 플래그 누락 시에도 strict id면 span-only로 취급.
       */
      const zoneSpanOnly =
        (item as OverlayItem).zoneSpanOnly === true || isCoreAnalysisMagnetZoneStrictWidthId(tid);
      /**
       * OB/S&D 존은 "분석된 구간(time1~time2)" 자체가 의미라 우측 최신봉까지 강제 연장하면
       * 줌 시 면/라벨이 붙어 다니는 것처럼 보여 혼동됨. 해당 계열은 구간 폭 고정.
       */
      const stickZoneToAnalyzedBars =
        isZone &&
        (item.kind === 'ob' ||
          item.kind === 'supplyZone' ||
          item.kind === 'demandZone' ||
          tid.startsWith('whale-auto-') ||
          tid.includes('aichart1') ||
          tid.includes('aichart-1') ||
          tid.includes('aichart') ||
          tid.startsWith('smc-desk-ob-') ||
          /(?:^|-)ob(?:-|$)/i.test(tid));
      const noProjectLine = isLine && (item as OverlayItem).noProject === true;
      const extendToRight =
        (!zoneSpanOnly && isZone && !stickZoneToAnalyzedBars) ||
        (isLine && !isFuturePathMain && !noProjectLine);
      const isLuxAutoTrendline = cat === 'autoTrendline';
      const isParkfTrendline = cat === 'trendlineEngine' && String((item as any).id || '').startsWith('parkf-');
      let xMaxRight = extendToRight ? extendRightCap : (x2 ?? x1);
      /** 캔들분석·핵심 존은 extendRightCap·resolveTimeX와 섞이면 우측이 미래 축으로 튐 — 일반 존 연장만 적용 */
      if (isZone && extendToRight && candleSeries.length > 0 && !barMagnetSnap) {
        const zMode = settings.zoneHorizontalExtendMode ?? 'chartEdge';
        const minZoneW = Math.max(6, Math.round(8 * zoneSticky));
        if (zMode === 'lastCandle') {
          const lastT = Number(candleSeries[candleSeries.length - 1]!.time);
          if (Number.isFinite(lastT)) {
            const xLast = resolveTimeX(lastT);
            xMaxRight = Math.min(extendRightCap, Math.max(x1 + minZoneW, xLast));
          }
        } else if (zMode === 'pastZoneEnd') {
          const t1 = typeof item.time1 === 'number' ? item.time1 : NaN;
          const t2 = typeof item.time2 === 'number' ? item.time2 : NaN;
          let tZone = NaN;
          if (Number.isFinite(t1) && Number.isFinite(t2)) tZone = Math.max(t1, t2);
          else if (Number.isFinite(t1)) tZone = t1;
          else if (Number.isFinite(t2)) tZone = t2;
          if (!Number.isFinite(tZone)) tZone = Number(candleSeries[candleSeries.length - 1]!.time);
          const idx0 = candleIndexAtOrBefore(candleSeries, tZone);
          const extra = Math.max(
            0,
            Math.min(80, Math.round(Number(settings.zoneExtendPastEndBars) || 0))
          );
          const idx1 = Math.min(candleSeries.length - 1, idx0 + extra);
          const tCap = Number(candleSeries[idx1]!.time);
          if (Number.isFinite(tCap)) {
            const xCap = resolveTimeX(tCap);
            xMaxRight = Math.min(extendRightCap, Math.max(x1 + minZoneW, xCap));
          }
        }
      }
      if (isLine && magnetTrend && (isLuxAutoTrendline || isParkfTrendline) && candleSeries.length > 0) {
        const lastT = Number(candleSeries[candleSeries.length - 1]?.time);
        if (Number.isFinite(lastT)) {
          const xLast = resolveTimeX(lastT);
          const xAnchorRight = x2 ?? x1;
          xMaxRight = Math.min(extendRightCap, Math.max(xAnchorRight, xLast));
        }
      }
      /**
       * 모든 존(zone/fvg/ob/supply/demand/…): 과거 time2에서 끊기지 않고 **마지막(실시간) 캔들 X**까지 면 확장.
       * 우측 한계는 `extendRightCap`(빈 시간축 밖으로 나가지 않음).
       */
      if (isZone && Number.isFinite(extendRightCap) && !stickZoneToAnalyzedBars) {
        xMaxRight = Math.min(extendRightCap, Math.max(xMaxRight, safeXLastBar));
      }
      // 추세선: 픽셀 선형 보간 대신 (시간,가격) 직선 → 우측 끝 가격으로 변환 (로그축·가격축과 일치, 똑바른 작도)
      if (
        isLine &&
        !(item as OverlayItem).noProject &&
        typeof item.time1 === 'number' &&
        typeof item.time2 === 'number' &&
        typeof item.price1 === 'number' &&
        typeof item.price2 === 'number' &&
        Math.abs(item.time2 - item.time1) > 1e-9
      ) {
        const tEdgeRaw = ts.coordinateToTime(xMaxRight as UTCTimestamp);
        const tEdge = extractTime(tEdgeRaw);
        if (tEdge != null) {
          const { time1: t1, time2: t2, price1: p1, price2: p2 } = item;
          const pEdge = p1 + (p2 - p1) * (tEdge - t1) / (t2 - t1);
          const yExt = geomPriceToPixelY(series, pEdge, y1);
          x2 = xMaxRight;
          y2 = yExt;
        }
      }
      /**
       * major / ca-core S·D / 고래: x1·x2는 위에서 `item.time1`~`time2`(analyze 가시 윈도)만 봉 자석.
       * 예전에 전체 시리즈 첫·마지막 봉으로 덮어쓰면 패닝 시 **최신 봉 X**가 화면 오른쪽 빈 축으로
       * 밀려 핵심 지지/저항 가로선이 캔들과 떨어져 보였음 — 덮어쓰기 금지.
       */
      if (Number.isFinite(x1) && x2 != null && Number.isFinite(x2) && x2 <= x1) {
        x1 = x2 - Math.min(160, Math.max(32, rect.width * 0.1));
      }
      const zoneTimeEndScreenX =
        isZone && typeof x2 === 'number' && Number.isFinite(x2) ? Number(x2) : undefined;
      return [{
        ...item,
        color: zoneTintedColor,
        x1,
        y1,
        x2: isZone ? xMaxRight : x2,
        y2,
        xMaxRight,
        ...(isZone && zoneTimeEndScreenX !== undefined ? { zoneTimeEndScreenX } : {}),
        priceStripRight,
        chartWidth: rect.width,
        chartHeight: rect.height,
      }];
    });
    /** AI_ZONE: 종합 오버레이 팔레트 통일 + 우선순위별 가시성 보정 */
    let out: typeof items = items;
    if (uiMode === 'AI_ZONE') {
      const latestCloseForAi = Number(
        (candlesForOverlay[candlesForOverlay.length - 1] as any)?.close ??
        (candles[candles.length - 1] as any)?.close
      );
      const supSr: { id: string; mid: number }[] = [];
      const resSr: { id: string; mid: number }[] = [];
      for (const r of items) {
        const rid = String((r as { id?: string }).id || '');
        if (!isAiZoneEngineOverlayId(rid)) continue;
        const p1 = Number((r as { price1?: number }).price1);
        const p2 = Number((r as { price2?: number }).price2);
        const mid =
          Number.isFinite(p1) && Number.isFinite(p2)
            ? (p1 + p2) / 2
            : Number.isFinite(p1)
              ? p1
              : Number.isFinite(p2)
                ? p2
                : NaN;
        if (!Number.isFinite(mid)) continue;
        if (rid.startsWith('ai-zone-sr-support-')) supSr.push({ id: rid, mid });
        else if (rid.startsWith('ai-zone-sr-resist-')) resSr.push({ id: rid, mid });
      }
      let nearestSrSupportId: string | null = null;
      let nearestSrResistId: string | null = null;
      if (Number.isFinite(latestCloseForAi) && (supSr.length > 0 || resSr.length > 0)) {
        const px = latestCloseForAi;
        const below = supSr.filter((x) => x.mid < px);
        if (below.length) nearestSrSupportId = below.sort((a, b) => b.mid - a.mid)[0]!.id;
        else if (supSr.length) {
          nearestSrSupportId = supSr.sort(
            (a, b) => Math.abs(a.mid - px) - Math.abs(b.mid - px)
          )[0]!.id;
        }
        const above = resSr.filter((x) => x.mid > px);
        if (above.length) nearestSrResistId = above.sort((a, b) => a.mid - b.mid)[0]!.id;
        else if (resSr.length) {
          nearestSrResistId = resSr.sort(
            (a, b) => Math.abs(a.mid - px) - Math.abs(b.mid - px)
          )[0]!.id;
        }
      }
      const isLongish = (row: { id?: string; kind?: string }) => {
        const id = String(row.id || '');
        if (id.includes('long')) return true;
        if (id.includes('short')) return false;
        if (id === 'ai-zone-main') return row.kind === 'demandZone';
        return row.kind === 'demandZone';
      };
      out = items.map((row: (typeof items)[0]) => {
        const id = String(row.id || '');
        if (!isAiZoneEngineOverlayId(id)) return row;
        const k = String(row.kind || '');
        const isCoreZone =
          id === 'ai-zone-main' || id === 'ai-zone-long-ref' || id === 'ai-zone-short-ref';
        if (k === 'demandZone' || k === 'supplyZone' || k === 'zone' || k === 'ob' || k === 'fvg') {
          const longB = isLongish(row);
          const p1 = Number((row as any)?.price1);
          const p2 = Number((row as any)?.price2);
          const mid = Number.isFinite(p1) && Number.isFinite(p2)
            ? (p1 + p2) / 2
            : Number.isFinite(p1)
              ? p1
              : Number.isFinite(p2)
                ? p2
                : NaN;
          const dist =
            Number.isFinite(mid) && Number.isFinite(latestCloseForAi) && latestCloseForAi !== 0
              ? Math.abs(mid - latestCloseForAi) / Math.abs(latestCloseForAi)
              : 0;
          const far = dist > 0.02;
          const isAiSrLadder = id.startsWith('ai-zone-sr-support-') || id.startsWith('ai-zone-sr-resist-');
          const isAiSrHighlight = id === nearestSrSupportId || id === nearestSrResistId;
          if (isAiSrLadder) {
            return {
              ...row,
              aiZoneNearestSr: isAiSrHighlight,
              color: isAiSrHighlight
                ? longB
                  ? 'rgba(34,197,94,0.44)'
                  : 'rgba(239,68,68,0.44)'
                : longB
                  ? 'rgba(34,197,94,0.08)'
                  : 'rgba(239,68,68,0.08)',
            };
          }
          return {
            ...row,
            // 핵심존은 고채도, 일반존은 저채도로 구분
            color: isCoreZone
              ? longB
                ? far ? 'rgba(34,197,94,0.24)' : 'rgba(34,197,94,0.42)'
                : far ? 'rgba(239,68,68,0.24)' : 'rgba(239,68,68,0.42)'
              : longB
                ? far ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.22)'
                : far ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.22)',
          };
        }
        if (k === 'keyLevel') {
          const longB = isLongish(row);
          return {
            ...row,
            color: longB ? 'rgba(74,222,128,0.96)' : 'rgba(248,113,113,0.96)',
            lineStrokeWidth: Math.max(2.6, (row as { lineStrokeWidth?: number }).lineStrokeWidth ?? 0),
          };
        }
        if (k === 'trendLine') {
          return {
            ...row,
            color: (row as { color?: string }).color || 'rgba(125,211,252,0.84)',
            lineStrokeWidth: Math.max(1.7, (row as { lineStrokeWidth?: number }).lineStrokeWidth ?? 0),
          };
        }
        if (k === 'label') {
          return {
            ...row,
            color: (row as { color?: string }).color || 'rgba(191,219,254,0.9)',
          };
        }
        return { ...row };
      });
      const zRank = (id: string) => {
        if (!isAiZoneEngineOverlayId(id)) return 0;
        if (id === 'ai-zone-status') return 2;
        if (id === nearestSrSupportId || id === nearestSrResistId) return 1.55;
        return 1;
      };
      out = [...out].sort((a: (typeof out)[0], b: (typeof out)[0]) => {
        const ida = String(a.id || '');
        const idb = String(b.id || '');
        return zRank(ida) - zRank(idb) || ida.localeCompare(idb);
      });
    }
    if (uiMode === 'AI_ZONE' && out.length > AI_ZONE_MAX_SCREEN_OVERLAYS) {
      const max = AI_ZONE_MAX_SCREEN_OVERLAYS;
      const withScore = out.map((row) => {
        const r = row as { id?: string; kind?: string; category?: string };
        const id = String(r.id || '');
        const k = String(r.kind || '');
        const c = String(r.category || '');
        return { row, s: aiZoneScreenOverlayKeepScore(id, k, c) };
      });
      withScore.sort(
        (a, b) => b.s - a.s || String((a.row as { id?: string }).id).localeCompare(String((b.row as { id?: string }).id))
      );
      out = withScore.slice(0, max).map((x) => x.row) as typeof out;
    }
    return out;
  }, [
    anchored,
    candles,
    candlesForOverlay,
    overlayTick,
    zoneFillUserOpts,
    settings.zoneHorizontalExtendMode,
    settings.zoneExtendPastEndBars,
    settings.zoneStickyStrength,
    uiMode,
  ]);

  const lsRocketHudPositions = useMemo(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const host = hostRef.current;
    if (!chart || !series || !host || candles.length === 0 || lsRocketHud.length === 0) return [];
    const seriesCandles = sanitizeChartCandlesForSeries(candles);
    if (!seriesCandles.length) return [];
    const rect = host.getBoundingClientRect();
    const ts = chart.timeScale();
    const twRocket = timeScalePixelWidth(ts, rect.width);
    const pad = 20;
    const tAt0 = ts.coordinateToTime(0) as { timestamp?: number } | number | null;
    const tAtW = ts.coordinateToTime(timeScaleRightPixelX(ts, rect.width) as UTCTimestamp) as
      | { timestamp?: number }
      | number
      | null;
    const tMin = tAt0 != null ? (typeof tAt0 === 'object' ? tAt0.timestamp : tAt0) : null;
    const tMax = tAtW != null ? (typeof tAtW === 'object' ? tAtW.timestamp : tAtW) : null;
    const resolveX = (tBar: number): number =>
      analysisTimeToScreenX(seriesCandles, tBar, ts, series, rect, pad, tMin, tMax);
    const out: Array<{ key: string; left: number; top: number; item: LsRocketHudItem }> = [];
    for (const item of lsRocketHud) {
      const tOpen = candleOpenContainingTime(seriesCandles, item.time);
      const bar =
        tOpen != null ? seriesCandles.find((c) => (c.time as number) === tOpen) ?? null : null;
      if (!bar) continue;
      const tBar = bar.time as number;
      const x = Math.max(0, Math.min(twRocket, resolveX(tBar)));
      const price = item.direction === 'LONG' ? bar.low : bar.high;
      const yRaw = series.priceToCoordinate(price);
      if (yRaw == null) continue;
      const y = Math.max(0, Math.min(rect.height, Number(yRaw)));
      out.push({ key: `${item.time}|${item.direction}|${item.tier}`, left: x, top: y, item });
    }
    return out;
  }, [lsRocketHud, candles, overlayTick]);

  /** Pine: Exhaustion Zone [by rukich] — 봉 시각·가격 좌표는 analysisTimeToScreenX / priceToCoordinate (줌·패닝 동기화) */
  const exhaustionZoneRukichGeom = useMemo(() => {
    if (!settings.showExhaustionZoneRukich || !chartRef.current || !seriesRef.current || !hostRef.current) {
      return null;
    }
    if (candles.length < EXHAUSTION_ZONE_RUKICH_DISPLAY_START + 2) return null;
    const series = seriesRef.current;
    const chart = chartRef.current;
    const host = hostRef.current;
    const rect = host.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return null;
    const pad = 20;
    const ts = chart.timeScale();
    const tAt0 = ts.coordinateToTime(0) as { timestamp?: number } | number | null;
    const tAtW = ts.coordinateToTime(timeScaleRightPixelX(ts, rect.width) as UTCTimestamp) as
      | { timestamp?: number }
      | number
      | null;
    const tMin = tAt0 != null ? (typeof tAt0 === 'object' ? tAt0.timestamp : tAt0) : null;
    const tMax = tAtW != null ? (typeof tAtW === 'object' ? tAtW.timestamp : tAtW) : null;
    const resolveX = (tBar: number) => analysisTimeToScreenX(candles, tBar, ts, series, rect, pad, tMin, tMax);
    const ez = computeExhaustionZoneRukichSeries(candles);
    const n = candles.length;
    const polyTop: { x: number; y: number }[] = [];
    const polyBot: { x: number; y: number }[] = [];
    const bgBars: { left: number; width: number }[] = [];
    const start = Math.min(n - 1, EXHAUSTION_ZONE_RUKICH_DISPLAY_START);
    for (let i = start; i < n; i++) {
      const rl = ez.reboundLine[i];
      const rs = ez.rebScaled[i];
      if (!Number.isFinite(rl) || !Number.isFinite(rs)) continue;
      const t = candles[i].time as number;
      const x = resolveX(t);
      const yT = series.priceToCoordinate(rl);
      const yB = series.priceToCoordinate(rs);
      if (yT == null || yB == null) continue;
      polyTop.push({ x, y: Number(yT) });
      polyBot.push({ x, y: Number(yB) });
      if (ez.signal[i]) {
        const xNext = i + 1 < n ? resolveX(candles[i + 1].time as number) : x + Math.max(3, i >= 1 ? x - resolveX(candles[i - 1].time as number) : 8);
        const left = Math.min(x, xNext);
        const width = Math.max(2, Math.abs(xNext - x));
        bgBars.push({ left, width });
      }
    }
    if (polyTop.length < 2) return null;
    return { rect, polyTop, polyBot, bgBars };
  }, [settings.showExhaustionZoneRukich, candles, overlayTick]);

  const OVERLAY_OFFSETS_KEY = 'ailongshort-overlay-offsets';
  /** 심볼만 — TF마다 따로 두면 1h에서 맞춘 드래그가 4h에서 초기화됨 */
  const overlayLayoutScopeKey = symbol;
  const isOffsetBlock = (v: unknown): v is Record<string, { dx: number; dy: number }> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const vals = Object.values(v);
    if (vals.length === 0) return false;
    const s = vals[0] as { dx?: unknown; dy?: unknown };
    return typeof s?.dx === 'number' && typeof s?.dy === 'number';
  };
  const readScopedOverlayOffsets = (): Record<string, { dx: number; dy: number }> => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(OVERLAY_OFFSETS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return {};

      const symBlock = parsed[overlayLayoutScopeKey];
      if (isOffsetBlock(symBlock)) {
        return normalizeOverlayOffsetMap(symBlock as Record<string, { dx: number; dy: number }>);
      }

      const prefix = `${overlayLayoutScopeKey}|`;
      const merged: Record<string, { dx: number; dy: number }> = {};
      for (const k of Object.keys(parsed)) {
        if (k.startsWith(prefix)) {
          const block = parsed[k];
          if (isOffsetBlock(block)) Object.assign(merged, block);
        }
      }
      if (Object.keys(merged).length) return normalizeOverlayOffsetMap(merged);

      const hasScopedShape = Object.values(parsed).some(
        (v) => v && typeof v === 'object' && v !== null && !Array.isArray(v) && !('dx' in (v as object))
      );
      if (!hasScopedShape && isOffsetBlock(parsed)) {
        return normalizeOverlayOffsetMap(parsed as Record<string, { dx: number; dy: number }>);
      }
      return {};
    } catch {
      return {};
    }
  };
  const persistScopedOverlayOffsets = (nextScoped: Record<string, { dx: number; dy: number }>) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(OVERLAY_OFFSETS_KEY);
      let root: Record<string, Record<string, { dx: number; dy: number }>> = {};
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const hasScopedShape = Object.values(parsed).some(
            (v) => v && typeof v === 'object' && v !== null && !Array.isArray(v) && !('dx' in (v as object))
          );
          root = hasScopedShape ? (parsed as Record<string, Record<string, { dx: number; dy: number }>>) : {};
        }
      }
      const prefix = `${overlayLayoutScopeKey}|`;
      for (const k of Object.keys(root)) {
        if (k === overlayLayoutScopeKey || k.startsWith(prefix)) {
          delete root[k];
        }
      }
      root[overlayLayoutScopeKey] = normalizeOverlayOffsetMap(nextScoped);
      window.localStorage.setItem(OVERLAY_OFFSETS_KEY, JSON.stringify(root));
    } catch {}
  };
  const [overlayOffsets, setOverlayOffsets] = useState<Record<string, { dx: number; dy: number }>>(() => {
    return readScopedOverlayOffsets();
  });
  useEffect(() => {
    setOverlayOffsets(readScopedOverlayOffsets());
  }, [overlayLayoutScopeKey]);
  const NUDGE = 6;

  const OVERLAY_FONT_SIZES_KEY = 'ailongshort-overlay-font-sizes';
  const DEFAULT_FONT_SIZE = 11;
  const [overlayFontSizes, setOverlayFontSizes] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(OVERLAY_FONT_SIZES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const getFontSize = (id: string) => {
    const k = stableOverlayVisibilityKey(id);
    return overlayFontSizes[k] ?? (k !== id ? overlayFontSizes[id] : undefined) ?? (overlayLabelFontSize ?? DEFAULT_FONT_SIZE);
  };
  const getLineStrokeWidth = (item: any) => {
    const w = item?.lineStrokeWidth;
    let out: number;
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) out = Math.max(0.5, Math.min(10, w));
    else if (item?.id?.startsWith?.('tap-'))
      out = overlayLineThickness === 'thin' ? 2 : overlayLineThickness === 'thick' ? 4 : 3;
    else out = overlayLineThickness === 'thin' ? 1 : overlayLineThickness === 'thick' ? 3 : item.kind === 'scenario' ? 2.5 : 2;
    if (maxCleanChartLayout && !item?.id?.startsWith?.('tap-')) out = Math.max(0.5, out * 0.88);
    else if (executionCalmLayout && !item?.id?.startsWith?.('tap-')) out = Math.max(0.5, out * 0.93);
    if (
      settings.chartTradeSetupFocus === true &&
      (item?.id?.startsWith?.('ls-plan-') || item?.id?.startsWith?.('smc-composite-'))
    ) {
      out = Math.min(10, out + 1.15);
    }
    return out;
  };
  const setFontSize = (id: string, delta: number) => {
    const k = stableOverlayVisibilityKey(id);
    setOverlayFontSizes(prev => {
      const base = prev[k] ?? (k !== id ? prev[id] : undefined) ?? DEFAULT_FONT_SIZE;
      const next = { ...prev, [k]: Math.max(8, Math.min(24, base + delta)) };
      if (k !== id) delete next[id];
      try { window.localStorage.setItem(OVERLAY_FONT_SIZES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };
  const setFontSizeValue = (id: string, value: number) => {
    const v = Math.max(8, Math.min(24, value));
    const k = stableOverlayVisibilityKey(id);
    setOverlayFontSizes(prev => {
      const next = { ...prev, [k]: v };
      if (k !== id) delete next[id];
      try { window.localStorage.setItem(OVERLAY_FONT_SIZES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(t => t + 1);
  };

  type LabelAlign = 'left' | 'center' | 'right';
  const OVERLAY_FONT_FAMILY_KEY = 'ailongshort-overlay-font-family';
  const OVERLAY_LABEL_ALIGN_KEY = 'ailongshort-overlay-label-align';
  const [overlayFontFamily, setOverlayFontFamilyState] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { const raw = window.localStorage.getItem(OVERLAY_FONT_FAMILY_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const [overlayLabelAlign, setOverlayLabelAlignState] = useState<Record<string, LabelAlign>>(() => {
    if (typeof window === 'undefined') return {};
    try { const raw = window.localStorage.getItem(OVERLAY_LABEL_ALIGN_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const OVERLAY_LABEL_H_SHIFT_KEY = 'ailongshort-overlay-label-h-shift';
  const LABEL_H_SHIFT_MIN = -200;
  const LABEL_H_SHIFT_MAX = 200;
  const [overlayLabelHShift, setOverlayLabelHShiftState] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(OVERLAY_LABEL_H_SHIFT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const getFontFamily = (id: string) => {
    const k = stableOverlayVisibilityKey(id);
    return overlayFontFamily[k] ?? (k !== id ? overlayFontFamily[id] : undefined) ?? '';
  };
  const getLabelAlign = (id: string): LabelAlign => {
    const k = stableOverlayVisibilityKey(id);
    const saved = overlayLabelAlign[k] ?? (k !== id ? overlayLabelAlign[id] : undefined);
    if (saved) return saved;
    if (id.startsWith('smartmoney-mvp-')) return 'right';
    return 'left';
  };
  const getLabelHShift = (id: string) => {
    const k = stableOverlayVisibilityKey(id);
    const saved = overlayLabelHShift[k] ?? (k !== id ? overlayLabelHShift[id] : undefined);
    if (typeof saved === 'number') return saved;
    if (id.startsWith('smartmoney-mvp-tp-')) return 190;
    if (id.startsWith('smartmoney-mvp-')) return 140;
    return 0;
  };
  const setFontFamily = (id: string, font: string) => {
    const k = stableOverlayVisibilityKey(id);
    setOverlayFontFamilyState(prev => {
      const next = { ...prev };
      if (font) {
        next[k] = font;
        if (k !== id) delete next[id];
      } else {
        delete next[k];
        if (k !== id) delete next[id];
      }
      try { window.localStorage.setItem(OVERLAY_FONT_FAMILY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };
  const setLabelAlign = (id: string, align: LabelAlign) => {
    const k = stableOverlayVisibilityKey(id);
    setOverlayLabelAlignState(prev => {
      const next = { ...prev, [k]: align };
      if (k !== id) delete next[id];
      try { window.localStorage.setItem(OVERLAY_LABEL_ALIGN_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };
  const setLabelHShift = (id: string, value: number) => {
    const v = Math.max(LABEL_H_SHIFT_MIN, Math.min(LABEL_H_SHIFT_MAX, Math.round(value)));
    const k = stableOverlayVisibilityKey(id);
    setOverlayLabelHShiftState(prev => {
      const next = { ...prev };
      if (v === 0) {
        delete next[k];
        if (k !== id) delete next[id];
      } else {
        next[k] = v;
        if (k !== id) delete next[id];
      }
      try { window.localStorage.setItem(OVERLAY_LABEL_H_SHIFT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick(x => x + 1);
  };

  /** 개별 라벨 ON/OFF — OFF면 차트에서 숨김 */
  const OVERLAY_HIDDEN_IDS_KEY = 'ailongshort-overlay-hidden-ids';
  const [hiddenOverlayIds, setHiddenOverlayIdsState] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(OVERLAY_HIDDEN_IDS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const base = new Set(Array.isArray(arr) ? arr : []);
      const aug = new Set(base);
      for (const x of base) {
        const s = stableOverlayVisibilityKey(x);
        if (s !== x) aug.add(s);
      }
      return aug;
    } catch {
      return new Set();
    }
  });
  const isOverlayVisible = (id: string) => !isOverlayIdHidden(id, hiddenOverlayIds);
  const setOverlayVisible = (id: string, visible: boolean) => {
    const stable = stableOverlayVisibilityKey(id);
    setHiddenOverlayIdsState(prev => {
      const next = new Set(prev);
      if (visible) {
        next.delete(id);
        next.delete(stable);
      } else {
        next.add(stable);
        if (stable !== id) next.add(id);
      }
      try { window.localStorage.setItem(OVERLAY_HIDDEN_IDS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };

  /** 차트 위 글자(말풍선·가격 스트립 등)만 끔 — 가로줄·존(fill)은 유지 */
  const OVERLAY_CHART_TEXT_HIDDEN_IDS_KEY = 'ailongshort-overlay-chart-text-hidden-ids';
  const [hiddenOverlayChartTextIds, setHiddenOverlayChartTextIdsState] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(OVERLAY_CHART_TEXT_HIDDEN_IDS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const base = new Set(Array.isArray(arr) ? arr : []);
      const aug = new Set(base);
      for (const x of base) {
        const s = stableOverlayVisibilityKey(x);
        if (s !== x) aug.add(s);
      }
      return aug;
    } catch {
      return new Set();
    }
  });
  const isOverlayChartTextVisible = (id: string) =>
    (uiMode === 'AI_ZONE' && isAiZoneEngineOverlayId(String(id || ''))) ||
    !isOverlayIdHidden(id, hiddenOverlayChartTextIds);
  const setOverlayChartTextVisible = (id: string, visible: boolean) => {
    const stable = stableOverlayVisibilityKey(id);
    setHiddenOverlayChartTextIdsState(prev => {
      const next = new Set(prev);
      if (visible) {
        next.delete(id);
        next.delete(stable);
      } else {
        next.add(stable);
        if (stable !== id) next.add(id);
      }
      try { window.localStorage.setItem(OVERLAY_CHART_TEXT_HIDDEN_IDS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
    setOverlayTick(v => v + 1);
  };
  const prevIsAiModeRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const prev = prevIsAiModeRef.current;
    prevIsAiModeRef.current = isAiMode;
    if (!isAiMode) return;
    /** 최초 마운트부터 AI 모드면 저장된 숨김·글자 설정 유지. 비AI → AI 로 **전환**할 때만 예전 초기화(필수 오버레이 복구) */
    if (prev === undefined) return;
    if (prev) return;
    setHiddenOverlayIdsState(new Set());
    setHiddenOverlayChartTextIdsState(new Set());
    try { window.localStorage.setItem(OVERLAY_HIDDEN_IDS_KEY, JSON.stringify([])); } catch {}
    try { window.localStorage.setItem(OVERLAY_CHART_TEXT_HIDDEN_IDS_KEY, JSON.stringify([])); } catch {}
  }, [isAiMode]);
  type ChartSectionVisibility = { s1: boolean; s2: boolean; s3: boolean };
  const CHART_SECTION_VIS_KEY = 'ailongshort-chart-section-visibility-v2';
  const [chartSectionVis, setChartSectionVis] = useState<ChartSectionVisibility>(() => {
    if (typeof window === 'undefined') return { s1: true, s2: true, s3: true };
    try {
      const raw = window.localStorage.getItem(CHART_SECTION_VIS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        return {
          s1: parsed.s1 !== false,
          s2: parsed.s2 !== false,
          s3: parsed.s3 !== false,
        };
      }
    } catch {}
    return { s1: true, s2: true, s3: true };
  });
  const setChartSection = (key: keyof ChartSectionVisibility, visible: boolean) => {
    setChartSectionVis((prev) => {
      const next = { ...prev, [key]: visible };
      try { window.localStorage.setItem(CHART_SECTION_VIS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setOverlayTick((v) => v + 1);
  };
  const applyChartSectionPreset = (next: ChartSectionVisibility) => {
    setChartSectionVis(next);
    try { window.localStorage.setItem(CHART_SECTION_VIS_KEY, JSON.stringify(next)); } catch {}
    setOverlayTick((v) => v + 1);
  };
  /** 차트에 실제로 그릴 오버레이 (숨김 처리된 것 제외) */
  const visibleScreenOverlays = useMemo(
    () => screenOverlays.filter((o: any) => {
      const id = String(o?.id || '');
      if (uiMode === 'AI_ZONE' && isAiZoneEngineOverlayId(id)) return true;
      if (isAiMode && whaleHotZoneEnabled && isWhaleHotZoneOverlay(o as Record<string, unknown>)) return true;
      if (isAiMode && whaleCoreSrZoneEnabled && isMajorCoreSrOverlay(o as Record<string, unknown>)) return true;
      return !isOverlayIdHidden(o.id, hiddenOverlayIds);
    }),
    [screenOverlays, hiddenOverlayIds, uiMode, isAiMode, whaleHotZoneEnabled, whaleCoreSrZoneEnabled]
  );
  const hasAiZoneEngineVisible = useMemo(
    () => visibleScreenOverlays.some((o: any) => isAiZoneEngineOverlayId(String(o?.id || ''))),
    [visibleScreenOverlays]
  );

  /** 캔들분석 핵심 S/D 존 캡션: 우측 정렬 시 세로로 겹치면 아래로 밀어 TV처럼 읽히게 */
  const caCoreSdZoneCaptionDy = useMemo(() => {
    const rows: { id: string; zTop: number; zBot: number; baseTop: number }[] = [];
    for (const o of visibleScreenOverlays as Array<{ id?: string; kind?: string; category?: string; y1: number; y2: number }>) {
      if (o.kind !== 'supplyZone' && o.kind !== 'demandZone') continue;
      if (String(o.category || '') !== 'candleAnalysisCoreSd') continue;
      if (typeof o.id !== 'string' || !o.id.startsWith('ca-core-')) continue;
      const zTop = Math.min(o.y1, o.y2);
      const zBot = Math.max(o.y1, o.y2);
      const baseTop = zTop + 2;
      rows.push({ id: o.id, zTop, zBot, baseTop });
    }
    rows.sort((a, b) => a.zTop - b.zTop || a.baseTop - b.baseTop);
    const CAPTION_H = 38;
    const GAP = 3;
    let prevBottom = -1e9;
    const dyMap = new Map<string, number>();
    for (const r of rows) {
      let capTop = r.baseTop;
      if (capTop < prevBottom + GAP) capTop = prevBottom + GAP;
      if (capTop + CAPTION_H > r.zBot) capTop = Math.max(r.zTop + 1, r.zBot - CAPTION_H);
      dyMap.set(r.id, capTop - r.baseTop);
      prevBottom = Math.max(prevBottom, capTop + CAPTION_H);
    }
    return dyMap;
  }, [visibleScreenOverlays]);

  /** 인접 피벗(Y 근접)은 X를 살짝 벌려 겹침 완화 */
  const caCorePivotNudge = useMemo(() => {
    const pivots = (visibleScreenOverlays as Array<{ id?: string; kind?: string; x1: number; y1: number }>).filter(
      (o) => o.kind === 'label' && typeof o.id === 'string' && o.id.startsWith('ca-core-pivot-')
    );
    if (pivots.length < 2) return new Map<string, { dx: number; dy: number }>();
    const sorted = [...pivots].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
    const out = new Map<string, { dx: number; dy: number }>();
    const Y_PROX = 30;
    const X_STEP = 34;
    let group: typeof pivots = [];
    const flush = () => {
      if (group.length <= 1) {
        group = [];
        return;
      }
      group.forEach((p, j) => {
        const dx = (j - (group.length - 1) / 2) * X_STEP;
        out.set(String(p.id), { dx, dy: 0 });
      });
      group = [];
    };
    for (const p of sorted) {
      if (!group.length || Math.abs(p.y1 - group[0].y1) <= Y_PROX) group.push(p);
      else {
        flush();
        group = [p];
      }
    }
    flush();
    return out;
  }, [visibleScreenOverlays]);

  const lastClosePixelY = useMemo(() => {
    const s = seriesRef.current;
    const safe = sanitizeChartCandlesForSeries(candles);
    if (!s || safe.length === 0) return null;
    const y = s.priceToCoordinate(safe[safe.length - 1]!.close);
    return y != null && Number.isFinite(Number(y)) ? Number(y) : null;
  }, [candles, overlayTick]);

  /**
   * 핀·가로선 HTML 라벨 겹침 완화.
   * 구조(BOS/CHOCH)·스윙 등은 세로로만 밀면 줌아웃 시 볼륨 영역까지 밀리므로 dy 상한 + 같은 높이끼리 수평 분산(dx).
   */
  const { htmlLabelStackDy, htmlLabelStackDx } = useMemo(() => {
    type Box = { id: string; left: number; top: number; w: number; h: number; pri: number; kind: string };
    const boxes: Box[] = [];
    const textVisible = (id: string) => !isOverlayIdHidden(id, hiddenOverlayChartTextIds);

    for (const o of visibleScreenOverlays as Array<Record<string, unknown> & { id?: string; kind?: string; x1: number; y1: number; x2?: number }>) {
      const kind = String(o.kind || '');
      const id = String(o.id || '');

      if (
        suppressHtmlOverlayCaptions &&
        BULK_LABEL_KINDS.has(kind) &&
        !id.startsWith('bible-cp-') &&
        !isAiZoneEngineOverlayId(id)
      )
        continue;

      const offKey = stableOverlayVisibilityKey(id);
      const whaleAuto = id.startsWith('whale-auto-');
      const liveOff =
        whaleAuto || isSmcEntryPlaybookOverlayId(id)
          ? { dx: 0, dy: 0 }
          : overlayOffsets[offKey] ?? overlayOffsets[id] ?? { dx: 0, dy: 0 };

      if (kind === 'label' || kind === 'swingLabel' || kind === 'poi') {
        if (id.startsWith('ca-core-pivot-')) continue;
        const isSmbc = id.startsWith('zone-smbc-mk-');
        const isBiblePin = id.startsWith('bible-cp-') && !id.startsWith('bible-cp-frame-');
        if (!textVisible(id) && !isSmbc) continue;
        const w = isSmbc ? 30 : isBiblePin ? 40 : 210;
        const h = isSmbc ? 28 : isBiblePin ? 40 : 36;
        const left = o.x1 + liveOff.dx + getLabelHShift(id);
        let top = o.y1 + liveOff.dy;
        const chartH = typeof o.chartHeight === 'number' ? o.chartHeight : 720;
        if (lastClosePixelY != null && !isSmbc) {
          top = nudgeLabelYFromLastPrice(top, lastClosePixelY, chartH - 8);
        }
        const pri =
          id.startsWith('lux-star-')
            ? 5
            : kind === 'swingLabel'
              ? 2
              : ['bos', 'choch', 'liquiditySweep', 'equilibrium'].some((k) => id.includes(k) || kind === k)
                ? 1
                : 3;
        boxes.push({ id, left, top, w, h, pri, kind });
        continue;
      }

      if (isLineKind(kind as OverlayItem['kind']) && o.label) {
        if (!textVisible(id)) continue;
        const est = estimateLineOverlayHtmlLabelBox(
          o as Parameters<typeof estimateLineOverlayHtmlLabelBox>[0],
          getLabelAlign,
          getLabelHShift,
          lastClosePixelY,
          liveOff.dx,
          liveOff.dy
        );
        if (est) boxes.push({ id, left: est.left, top: est.top, w: est.w, h: est.h, pri: est.pri, kind });
      }
    }

    boxes.sort((a, b) => a.pri - b.pri || a.top - b.top || a.left - b.left);
    const GAP = 4;
    const STEP = 13;
    const MAX_DY = 160;
    /** BOS/CHOCH·스윙·SMC 데스크 구조선: 세로 스택 과다 방지 */
    const MAX_DY_STRUCTURE = 28;
    const placed: { l: number; t: number; r: number; b: number }[] = [];
    const dyMap = new Map<string, number>();

    const overlaps = (l: number, t: number, r: number, b: number) =>
      placed.some((p) => !(r + GAP <= p.l || p.r + GAP <= l || b + GAP <= p.t || p.b + GAP <= t));

    for (const b of boxes) {
      const fan = overlayKindWantsHorizontalLabelFan(b.id, b.kind);
      const maxDy = fan ? MAX_DY_STRUCTURE : MAX_DY;
      let dy = 0;
      while (dy <= maxDy) {
        const t = b.top + dy;
        const bt = t + b.h;
        const l = b.left;
        const r = b.left + b.w;
        if (!overlaps(l, t, r, bt)) {
          dyMap.set(b.id, dy);
          placed.push({ l, t, r, b: bt });
          break;
        }
        dy += STEP;
      }
    }

    const dxMap = new Map<string, number>();
    const fanBoxes = boxes.filter((bb) => overlayKindWantsHorizontalLabelFan(bb.id, bb.kind));
    fanBoxes.sort((a, c) => a.top - c.top || a.left - c.left);
    const Y_CLUSTER = 12;
    const X_STEP_FAN = 40;
    let i0 = 0;
    while (i0 < fanBoxes.length) {
      let i1 = i0 + 1;
      while (i1 < fanBoxes.length && Math.abs(fanBoxes[i1].top - fanBoxes[i0].top) <= Y_CLUSTER) i1++;
      const grp = fanBoxes.slice(i0, i1);
      if (grp.length > 1) {
        grp.forEach((box, idx) => {
          const off = (idx - (grp.length - 1) / 2) * X_STEP_FAN;
          dxMap.set(box.id, off);
        });
      }
      i0 = i1;
    }

    return { htmlLabelStackDy: dyMap, htmlLabelStackDx: dxMap };
  }, [
    visibleScreenOverlays,
    suppressHtmlOverlayCaptions,
    hiddenOverlayChartTextIds,
    overlayLabelHShift,
    overlayLabelAlign,
    lastClosePixelY,
    overlayOffsets,
  ]);

  type PriceDisplayPosition = 'left' | 'center' | 'right';
  const OVERLAY_PRICE_POSITION_KEY = 'ailongshort-overlay-price-position';
  const [priceDisplayPosition, setPriceDisplayPositionState] = useState<PriceDisplayPosition>(() => {
    if (typeof window === 'undefined') return 'left';
    try {
      const raw = window.localStorage.getItem(OVERLAY_PRICE_POSITION_KEY);
      if (raw === 'center' || raw === 'left' || raw === 'right') return raw;
    } catch {}
    return 'left';
  });
  const setPriceDisplayPosition = (pos: PriceDisplayPosition) => {
    setPriceDisplayPositionState(pos);
    try { window.localStorage.setItem(OVERLAY_PRICE_POSITION_KEY, pos); } catch {}
    setOverlayTick(v => v + 1);
  };

  const OVERLAY_PRICE_H_SHIFT_KEY = 'ailongshort-overlay-price-h-shift';
  const [priceDisplayHShift, setPriceDisplayHShiftState] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const raw = window.localStorage.getItem(OVERLAY_PRICE_H_SHIFT_KEY);
      const n = raw != null ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? Math.max(-200, Math.min(200, n)) : 0;
    } catch {
      return 0;
    }
  });
  const setPriceDisplayHShift = (value: number) => {
    const v = Math.max(-200, Math.min(200, Math.round(value)));
    setPriceDisplayHShiftState(v);
    try {
      if (v === 0) window.localStorage.removeItem(OVERLAY_PRICE_H_SHIFT_KEY);
      else window.localStorage.setItem(OVERLAY_PRICE_H_SHIFT_KEY, String(v));
    } catch {}
    setOverlayTick(x => x + 1);
  };

  /** 종가 마감선(close-1m ~ close-monthly) 축 옆 가격만 — 일반 키레벨·타점과 분리 */
  const CLOSE_STRIP_POSITION_KEY = 'ailongshort-close-strip-position';
  const CLOSE_STRIP_H_SHIFT_KEY = 'ailongshort-close-strip-h-shift';
  const [closeStripPosition, setCloseStripPositionState] = useState<PriceDisplayPosition>(() => {
    if (typeof window === 'undefined') return 'left';
    try {
      const raw = window.localStorage.getItem(CLOSE_STRIP_POSITION_KEY);
      if (raw === 'center' || raw === 'left' || raw === 'right') return raw;
    } catch {}
    return 'left';
  });
  const setCloseStripPosition = (pos: PriceDisplayPosition) => {
    setCloseStripPositionState(pos);
    try { window.localStorage.setItem(CLOSE_STRIP_POSITION_KEY, pos); } catch {}
    setOverlayTick(v => v + 1);
  };
  const [closeStripHShift, setCloseStripHShiftState] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const raw = window.localStorage.getItem(CLOSE_STRIP_H_SHIFT_KEY);
      const n = raw != null ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? Math.max(-200, Math.min(200, n)) : 0;
    } catch {
      return 0;
    }
  });
  const setCloseStripHShift = (value: number) => {
    const v = Math.max(-200, Math.min(200, Math.round(value)));
    setCloseStripHShiftState(v);
    try {
      if (v === 0) window.localStorage.removeItem(CLOSE_STRIP_H_SHIFT_KEY);
      else window.localStorage.setItem(CLOSE_STRIP_H_SHIFT_KEY, String(v));
    } catch {}
    setOverlayTick(x => x + 1);
  };

  /** FVG·OB·공급/수요·반응구간 등 면 존의 텍스트 라벨(숏·롱 등) 가로 위치 */
  const ZONE_LABEL_POSITION_KEY = 'ailongshort-zone-label-position';
  const [zoneLabelPosition, setZoneLabelPositionState] = useState<PriceDisplayPosition>(() => {
    if (typeof window === 'undefined') return 'right';
    try {
      const raw = window.localStorage.getItem(ZONE_LABEL_POSITION_KEY);
      if (raw === 'center' || raw === 'left' || raw === 'right') return raw;
    } catch {}
    return 'right';
  });
  const setZoneLabelPosition = (pos: PriceDisplayPosition) => {
    setZoneLabelPositionState(pos);
    try { window.localStorage.setItem(ZONE_LABEL_POSITION_KEY, pos); } catch {}
    setOverlayTick(v => v + 1);
  };
  const ZONE_LABEL_H_SHIFT_KEY = 'ailongshort-zone-label-h-shift';
  const [zoneLabelHShift, setZoneLabelHShiftState] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const raw = window.localStorage.getItem(ZONE_LABEL_H_SHIFT_KEY);
      const n = raw != null ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? Math.max(-200, Math.min(200, n)) : 0;
    } catch {
      return 0;
    }
  });
  const setZoneLabelHShift = (value: number) => {
    const v = Math.max(-200, Math.min(200, Math.round(value)));
    setZoneLabelHShiftState(v);
    try {
      if (v === 0) window.localStorage.removeItem(ZONE_LABEL_H_SHIFT_KEY);
      else window.localStorage.setItem(ZONE_LABEL_H_SHIFT_KEY, String(v));
    } catch {}
    setOverlayTick(x => x + 1);
  };

  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  /** 패널 본문만 접기 — 헤더·우측 버튼 유지. 위치·접힘은 localStorage 유지 */
  const [labelSettingsBodyCollapsed, setLabelSettingsBodyCollapsed] = useState(
    () => readLabelSettingsUiFromStorage().bodyCollapsed
  );
  const [labelSettingsPanelPos, setLabelSettingsPanelPos] = useState<LabelSettingsPanelPos | null>(
    () => readLabelSettingsUiFromStorage().pos
  );
  const [isNarrowUi, setIsNarrowUi] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsNarrowUi(window.innerWidth <= 980);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const NARROW_CA_TOOLS_LS = 'ailongshort-ca-narrow-tools-open-v1';
  const [caNarrowToolsOpen, setCaNarrowToolsOpen] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem(NARROW_CA_TOOLS_LS) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(NARROW_CA_TOOLS_LS, caNarrowToolsOpen ? 'true' : 'false');
    } catch {}
  }, [caNarrowToolsOpen]);

  /** AI 분석(데스크톱): 기본은 한 줄(통합 프리셋), 상세 토글은 "전체 도구"에서 */
  const AI_ZONE_CHART_TOOLS_EXPANDED_KEY = 'ailongshort-ai-zone-chart-tools-expanded-v1';
  const [aiZoneChartToolsExpanded, setAiZoneChartToolsExpanded] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem(AI_ZONE_CHART_TOOLS_EXPANDED_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(AI_ZONE_CHART_TOOLS_EXPANDED_KEY, aiZoneChartToolsExpanded ? '1' : '0');
    } catch {}
  }, [aiZoneChartToolsExpanded]);
  const aiZoneQuickToolsCollapsed = uiMode === 'AI_ZONE' && !isNarrowUi && !aiZoneChartToolsExpanded;

  const narrowChartChromeRef = useRef<HTMLDivElement | null>(null);
  const [narrowChromeBottomGap, setNarrowChromeBottomGap] = useState(0);
  useLayoutEffect(() => {
    if (!isNarrowUi) {
      setNarrowChromeBottomGap(0);
      return;
    }
    const el = narrowChartChromeRef.current;
    if (!el) return;
    const measure = () => setNarrowChromeBottomGap(Math.ceil(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isNarrowUi, caNarrowToolsOpen, chartSectionVis.s1]);

  const candleAnalysisHeaderTopPx = useMemo(() => {
    if (!isNarrowUi || uiMode !== 'CANDLE_ANALYSIS') return 8;
    return 8 + narrowChromeBottomGap;
  }, [isNarrowUi, uiMode, narrowChromeBottomGap]);

  const narrowCaQuickToolsCollapsed = isNarrowUi && uiMode === 'CANDLE_ANALYSIS' && !caNarrowToolsOpen;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LABEL_SETTINGS_UI_KEY,
        JSON.stringify({ bodyCollapsed: labelSettingsBodyCollapsed, pos: labelSettingsPanelPos })
      );
    } catch {}
  }, [labelSettingsBodyCollapsed, labelSettingsPanelPos]);

  const mtfInlineSignals = useMemo(() => {
    const list = Array.isArray(mtfSignals) ? mtfSignals : [];
    return list.map((x) => ({
      ...x,
      verdictKo: x.verdict === 'LONG' ? 'L' : x.verdict === 'SHORT' ? 'S' : '-',
      tfLabel: x.tf === '1w' ? '1W' : x.tf,
    }));
  }, [mtfSignals]);
  const mtfSignalByTf = useMemo(() => {
    const m = new Map<string, { verdictKo: string; verdict: string }>();
    for (const x of mtfInlineSignals) {
      m.set(x.tf, { verdictKo: x.verdictKo, verdict: x.verdict });
      if (x.tf === '1w') m.set('1w', { verdictKo: x.verdictKo, verdict: x.verdict });
    }
    return m;
  }, [mtfInlineSignals]);
  const MENU_POS_QUICK_KEY = 'chart-ui-pos-quick-v3';
  const MENU_POS_TOPBAR_KEY = 'chart-ui-pos-topbar-v3';
  const MENU_POS_MTF_KEY = 'chart-ui-pos-mtf-v1';
  const [quickMenuPos, setQuickMenuPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(MENU_POS_QUICK_KEY) : null;
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 0, y: 0 };
  });

  const quickMenuStyle: React.CSSProperties = isNarrowUi
    ? {
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
        zIndex: 60,
        display: 'flex',
        gap: 5,
        alignItems: 'center',
        justifyContent: 'flex-start',
        pointerEvents: 'auto',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 2,
      }
    : {
        position: 'absolute',
        right: 10,
        top: 10,
        zIndex: 60,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        justifyContent: 'flex-end',
        pointerEvents: 'auto',
        flexWrap: 'wrap',
        maxWidth: 'calc(100% - 20px)',
        minWidth: 0,
        boxSizing: 'border-box',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        transform: `translate(${quickMenuPos.x}px, ${quickMenuPos.y}px)`,
      };
  const qChip = (isNarrowUi ? { padding: '3px 6px', fontSize: 10 } : { padding: '4px 8px', fontSize: 11 }) as React.CSSProperties;

  const [topbarMenuPos, setTopbarMenuPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(MENU_POS_TOPBAR_KEY) : null;
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 0, y: 0 };
  });
  const [mtfMenuPos, setMtfMenuPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(MENU_POS_MTF_KEY) : null;
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 0, y: 0 };
  });
  const [dragMenu, setDragMenu] = useState<null | {
    target: 'quick' | 'topbar' | 'mtf';
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  }>(null);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const topbarMenuRef = useRef<HTMLDivElement | null>(null);
  const mtfMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!dragMenu) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragMenu.startX;
      const dy = e.clientY - dragMenu.startY;
      const raw = { x: dragMenu.baseX + dx, y: dragMenu.baseY + dy };
      const frame = frameRef.current?.getBoundingClientRect();
      const menuEl = dragMenu.target === 'quick'
        ? quickMenuRef.current
        : dragMenu.target === 'topbar'
          ? topbarMenuRef.current
          : mtfMenuRef.current;
      const menuRect = menuEl?.getBoundingClientRect();
      let next = raw;
      if (frame && menuRect) {
        const pad = CHART_FLOATING_MENU_PAD;
        const minX = -menuRect.left + frame.left + pad;
        const maxX = frame.right - menuRect.right - pad;
        const minY = -menuRect.top + frame.top + pad;
        const maxY = frame.bottom - menuRect.bottom - pad;
        next = {
          x: Math.max(minX, Math.min(maxX, raw.x)),
          y: Math.max(minY, Math.min(maxY, raw.y)),
        };
      }
      if (dragMenu.target === 'quick') setQuickMenuPos(next);
      else if (dragMenu.target === 'topbar') setTopbarMenuPos(next);
      else setMtfMenuPos(next);
    };
    const onUp = () => setDragMenu(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragMenu]);

  useEffect(() => {
    try { window.localStorage.setItem(MENU_POS_QUICK_KEY, JSON.stringify(quickMenuPos)); } catch {}
  }, [quickMenuPos]);
  useEffect(() => {
    try { window.localStorage.setItem(MENU_POS_TOPBAR_KEY, JSON.stringify(topbarMenuPos)); } catch {}
  }, [topbarMenuPos]);
  useEffect(() => {
    try { window.localStorage.setItem(MENU_POS_MTF_KEY, JSON.stringify(mtfMenuPos)); } catch {}
  }, [mtfMenuPos]);

  /** 줌·리사이즈·전체화면 전환 후 빠른 메뉴·상단 바가 .tv-frame(overflow:hidden) 밖으로 밀리지 않게 보정 */
  useLayoutEffect(() => {
    if (isNarrowUi) return;
    const run = () => {
      const frameEl = frameRef.current;
      if (!frameEl) return;
      const fr = frameEl.getBoundingClientRect();
      const qEl = quickMenuRef.current;
      if (qEl) {
        const qr = qEl.getBoundingClientRect();
        setQuickMenuPos((p) => {
          const n = correctFloatingMenuTranslate(p, fr, qr);
          return n.x === p.x && n.y === p.y ? p : n;
        });
      }
      const tbEl = topbarMenuRef.current;
      if (tbEl) {
        const tr = tbEl.getBoundingClientRect();
        setTopbarMenuPos((p) => {
          const n = correctFloatingMenuTranslate(p, fr, tr);
          return n.x === p.x && n.y === p.y ? p : n;
        });
      }
    };
    run();
    const frameEl = frameRef.current;
    if (!frameEl) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(run);
    });
    ro.observe(frameEl);
    window.addEventListener('resize', run);
    document.addEventListener('fullscreenchange', run);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', run);
      document.removeEventListener('fullscreenchange', run);
    };
  }, [isNarrowUi, chartSectionVis.s1]);

  const startMenuDrag = (target: 'quick' | 'topbar' | 'mtf') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const base = target === 'quick' ? quickMenuPos : target === 'topbar' ? topbarMenuPos : mtfMenuPos;
    setDragMenu({
      target,
      startX: e.clientX,
      startY: e.clientY,
      baseX: base.x,
      baseY: base.y,
    });
  };
  const resetMenuPos = () => {
    setQuickMenuPos({ x: 0, y: 0 });
    setTopbarMenuPos({ x: 0, y: 0 });
    setMtfMenuPos({ x: 0, y: 0 });
  };

  const labelSettingsPanelRef = useRef<HTMLDivElement | null>(null);
  const [labelPanelDrag, setLabelPanelDrag] = useState<null | {
    startX: number;
    startY: number;
    baseLeft: number;
    baseTop: number;
  }>(null);

  useEffect(() => {
    if (!labelPanelDrag) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - labelPanelDrag.startX;
      const dy = e.clientY - labelPanelDrag.startY;
      let left = labelPanelDrag.baseLeft + dx;
      let top = labelPanelDrag.baseTop + dy;
      const el = labelSettingsPanelRef.current;
      const fr = frameRef.current?.getBoundingClientRect();
      if (el && fr) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const m = 8;
        left = Math.max(fr.left + m, Math.min(fr.right - w - m, left));
        top = Math.max(fr.top + m, Math.min(fr.bottom - h - m, top));
      }
      setLabelSettingsPanelPos({ left, top });
    };
    const onUp = () => setLabelPanelDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [labelPanelDrag]);

  const startLabelSettingsPanelDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = labelSettingsPanelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = labelSettingsPanelPos?.left ?? r.left;
    const top = labelSettingsPanelPos?.top ?? r.top;
    if (labelSettingsPanelPos == null) {
      setLabelSettingsPanelPos({ left, top });
    }
    setLabelPanelDrag({
      startX: e.clientX,
      startY: e.clientY,
      baseLeft: left,
      baseTop: top,
    });
  };

  const labelSettingsPanelLayoutStyle = useMemo((): React.CSSProperties => {
    const base: React.CSSProperties = {
      padding: isNarrowUi ? '12px 12px' : '14px 16px',
      background: 'rgba(15,23,42,0.98)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      pointerEvents: 'auto',
      zIndex: 2400,
      boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
    };
    const sheetShadow = '0 -12px 40px rgba(0,0,0,0.5)';
    if (isNarrowUi) {
      if (labelSettingsPanelPos) {
        return {
          ...base,
          position: 'fixed',
          left: labelSettingsPanelPos.left,
          top: labelSettingsPanelPos.top,
          right: 'auto',
          bottom: 'auto',
          width: 'min(calc(100vw - 16px), 560px)',
          maxWidth: 'none',
          maxHeight: labelSettingsBodyCollapsed ? 'none' : 'min(82vh, 640px)',
          marginTop: 0,
        };
      }
      return {
        ...base,
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: 8,
        top: 'auto',
        marginTop: 0,
        maxHeight: labelSettingsBodyCollapsed ? 'none' : 'min(82vh, 640px)',
        boxShadow: sheetShadow,
      };
    }
    if (labelSettingsPanelPos) {
      return {
        ...base,
        position: 'fixed',
        left: labelSettingsPanelPos.left,
        top: labelSettingsPanelPos.top,
        right: 'auto',
        width: 'min(560px, calc(100vw - 24px))',
        maxHeight: labelSettingsBodyCollapsed ? 'none' : 520,
        marginTop: 0,
      };
    }
    return {
      ...base,
      position: 'fixed',
      right: 12,
      top: 72,
      left: 'auto',
      width: 'min(560px, calc(100vw - 24px))',
      maxHeight: labelSettingsBodyCollapsed ? 'none' : 520,
      marginTop: 0,
    };
  }, [isNarrowUi, labelSettingsPanelPos, labelSettingsBodyCollapsed]);

  const CHART_PAD = 20;
  const DRAG_DY_MAX = 300;
  type DragState = { id: string; startClientX: number; startClientY: number; startDx: number; startDy: number; baseLeft: number; xMaxRight: number; currentDx: number; currentDy: number };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const didDragRef = useRef(false);
  dragStateRef.current = dragState;

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      setDragState(prev => {
        if (!prev) return null;
        const dx = prev.startDx + (e.clientX - prev.startClientX);
        const minDx = CHART_PAD - prev.baseLeft;
        const maxDx = prev.xMaxRight - prev.baseLeft - 60;
        const clampedDx = Math.max(minDx, Math.min(maxDx, dx));
        const dy = prev.startDy + (e.clientY - prev.startClientY);
        const clampedDy = Math.max(-DRAG_DY_MAX, Math.min(DRAG_DY_MAX, dy));
        return { ...prev, currentDx: clampedDx, currentDy: clampedDy };
      });
    };
    const onUp = () => {
      const d = dragStateRef.current;
      if (d) {
        didDragRef.current = Math.abs(d.currentDx - d.startDx) > 2 || Math.abs(d.currentDy - d.startDy) > 2;
        setOverlayOffsets(prev => {
          const k = stableOverlayVisibilityKey(d.id);
          const next = { ...prev, [k]: { dx: d.currentDx, dy: d.currentDy } };
          if (k !== d.id) delete next[d.id];
          persistScopedOverlayOffsets(next);
          return next;
        });
        setOverlayTick(v => v + 1);
      } else didDragRef.current = false;
      setDragState(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [!!dragState]);

  const setOffset = (id: string, dxDelta: number, dyDelta: number) => {
    const k = stableOverlayVisibilityKey(id);
    setOverlayOffsets(prev => {
      const cur = prev[k] ?? (k !== id ? prev[id] : undefined) ?? { dx: 0, dy: 0 };
      const next = { ...prev, [k]: { dx: cur.dx + dxDelta, dy: cur.dy + dyDelta } };
      if (k !== id) delete next[id];
      persistScopedOverlayOffsets(next);
      return next;
    });
    setOverlayTick(v => v + 1);
  };

  const startLabelDrag = (id: string, baseLeft: number, xMaxRight: number, currentOff: { dx: number; dy: number }, e: React.MouseEvent) => {
    if (isSmcEntryPlaybookOverlayId(id)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startDx: currentOff.dx,
      startDy: currentOff.dy,
      baseLeft,
      xMaxRight,
      currentDx: currentOff.dx,
      currentDy: currentOff.dy,
    });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const th = chartThemes[themeForChartRef.current];
    const scaleFs =
      typeof window !== 'undefined'
        ? (loadSettings().chartScaleFontSize ?? defaultSettings.chartScaleFontSize)
        : defaultSettings.chartScaleFontSize;
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { color: th.bg },
        textColor: th.text,
        fontSize: Math.max(10, Math.min(18, scaleFs)),
        fontFamily: CHART_PRO_FONT,
      },
      grid: chartGridOptions(th),
      crosshair: chartCrosshairOptions(th),
      rightPriceScale: {
        visible: true,
        borderColor: th.border,
        scaleMargins: { top: 0.10, bottom: 0.22 },
      },
      timeScale: {
        borderColor: th.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: smartMoneyRightOffset,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
      },
    });

    const candleOpts = buildCandlestickApplyOptions(candleSettingsRef.current, th.bg);
    const series = chart.addSeries(CandlestickSeries, {
      ...candleOpts,
      priceLineVisible: true,
      priceLineWidth: 2,
      priceLineStyle: LineStyle.Solid,
      priceLineColor: th.lastPriceLine,
    });

    const volPal0 = volumeHistogramBarColors(candleSettingsRef.current, th.bg);
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      color: volPal0.up
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const volMa = chart.addSeries(LineSeries, {
      priceScaleId: '',
      color: th.volumeHistogramMaLine,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;
    volumeMaRef.current = volMa;
    rsiMarkersRef.current?.detach();
    rsiMarkersRef.current = createSeriesMarkers(series, []);
    volumeMarkersRef.current?.detach();
    volumeMarkersRef.current = createSeriesMarkers(volume, []);

    const scheduleOverlayRefresh = () => {
      if (overlayRafRef.current != null) return;
      overlayRafRef.current = requestAnimationFrame(() => {
        overlayRafRef.current = null;
        setOverlayTick(v => v + 1);
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleOverlayRefresh);
    chart.timeScale().subscribeVisibleTimeRangeChange(scheduleOverlayRefresh);
    /** 타임스케일 높이·폭 변화(하단 축 영역) — 좌표 기준점이 바뀔 때 */
    chart.timeScale().subscribeSizeChange(scheduleOverlayRefresh);
    /**
     * 구독만으로는 한두 프레임 빠질 수 있음: 가격축 Y + 가로 논리 범위를 함께 폴링해
     * 핵심 존·라벨이 캔들(timeToCoordinate / priceToCoordinate)에 붙도록 유지.
     */
    const syncHtmlOverlaysFromChartGeometry = () => {
      const s = seriesRef.current;
      const ch = chartRef.current;
      if (!s || !ch) return;
      try {
        const pr = s.priceScale().getVisibleRange();
        const ps =
          pr && typeof pr.from === 'number' && typeof pr.to === 'number' && Number.isFinite(pr.from) && Number.isFinite(pr.to)
            ? `${pr.from.toFixed(8)}:${pr.to.toFixed(8)}`
            : '';
        const lr = ch.timeScale().getVisibleLogicalRange();
        const ts =
          lr && typeof lr.from === 'number' && typeof lr.to === 'number' && Number.isFinite(lr.from) && Number.isFinite(lr.to)
            ? `${lr.from.toFixed(6)}:${lr.to.toFixed(6)}`
            : '';
        const sig = `${ps}|${ts}`;
        if (sig !== lastOverlayChartGeometrySigRef.current) {
          lastOverlayChartGeometrySigRef.current = sig;
          scheduleOverlayRefresh();
        }
      } catch {
        /* ignore */
      }
    };
    const chartGeometryPollId = window.setInterval(syncHtmlOverlaysFromChartGeometry, 48);
    const ro = new ResizeObserver(scheduleOverlayRefresh);
    ro.observe(host);
    /** 가격축 줌·드래그·휠은 timeScale 콜백만으로는 안 잡히는 경우가 있어 HTML 오버레이 좌표를 갱신 */
    const onHostWheel = () => scheduleOverlayRefresh();
    const onHostPointerMove = (ev: PointerEvent) => {
      if (ev.buttons !== 0) scheduleOverlayRefresh();
    };
    const onHostTouchMove = () => scheduleOverlayRefresh();
    host.addEventListener('wheel', onHostWheel, { passive: true });
    host.addEventListener('pointermove', onHostPointerMove);
    host.addEventListener('touchmove', onHostTouchMove, { passive: true });
    /** 가격축 영역은 host 밖 캔버스에서 처리되는 경우가 많아, 캡처 단계로 패닝·줌·핀치 후 오버레이 좌표 동기화 */
    const onWinPointerMoveCap = (ev: PointerEvent) => {
      if (ev.buttons !== 0) scheduleOverlayRefresh();
    };
    const onWinWheelCap = () => scheduleOverlayRefresh();
    const onWinTouchMoveCap = () => scheduleOverlayRefresh();
    window.addEventListener('pointermove', onWinPointerMoveCap, { capture: true, passive: true });
    window.addEventListener('wheel', onWinWheelCap, { capture: true, passive: true });
    window.addEventListener('touchmove', onWinTouchMoveCap, { capture: true, passive: true });
    /** 브라우저 배율(Ctrl±)·모바일 주소창 등 — getBoundingClientRect·CSS px가 바뀌어도 오버레이 좌표 재계산 */
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (vv) {
      vv.addEventListener('resize', scheduleOverlayRefresh);
      vv.addEventListener('scroll', scheduleOverlayRefresh);
    }

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!candleSettingsRef.current.chartCandleRuleDebug) {
        setCandlePaintDebugLine('');
        return;
      }
      const t = param.time;
      if (t === undefined || t === null) {
        setCandlePaintDebugLine('');
        return;
      }
      const tnum =
        typeof t === 'number'
          ? t
          : typeof t === 'object' && t !== null && 'timestamp' in (t as object)
            ? Number((t as { timestamp?: number }).timestamp)
            : NaN;
      if (!Number.isFinite(tnum)) {
        setCandlePaintDebugLine('');
        return;
      }
      const ctx = candlePaintDebugContextRef.current;
      const blend = ctx.blend;
      if (!blend) {
        setCandlePaintDebugLine('');
        return;
      }
      const c = ctx.candles.find((x) => Number(x.time) === tnum);
      if (!c) {
        setCandlePaintDebugLine('');
        return;
      }
      setCandlePaintDebugLine(
        describeCandlePaintForTime(tnum, blend, ctx.merged, ctx.structure, ctx.prox, ctx.hot, c)
      );
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      if (overlayRafRef.current != null) {
        cancelAnimationFrame(overlayRafRef.current);
        overlayRafRef.current = null;
      }
      host.removeEventListener('wheel', onHostWheel);
      host.removeEventListener('pointermove', onHostPointerMove);
      host.removeEventListener('touchmove', onHostTouchMove);
      window.removeEventListener('pointermove', onWinPointerMoveCap, { capture: true } as AddEventListenerOptions);
      window.removeEventListener('wheel', onWinWheelCap, { capture: true } as AddEventListenerOptions);
      window.removeEventListener('touchmove', onWinTouchMoveCap, { capture: true } as AddEventListenerOptions);
      if (vv) {
        vv.removeEventListener('resize', scheduleOverlayRefresh);
        vv.removeEventListener('scroll', scheduleOverlayRefresh);
      }
      ro.disconnect();
      window.clearInterval(chartGeometryPollId);
      lastOverlayChartGeometrySigRef.current = '';
      chart.timeScale().unsubscribeSizeChange(scheduleOverlayRefresh);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleOverlayRefresh);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleOverlayRefresh);
      zoneRangeSeriesRef.current = null;
      closeRangeSeriesRef.current = null;
      rsiMarkersRef.current?.detach();
      rsiMarkersRef.current = null;
      volumeMarkersRef.current?.detach();
      volumeMarkersRef.current = null;
      volumeMaRef.current = null;
      chart.remove();
    };
  }, [smartMoneyRightOffset]);

  useEffect(() => {
    const series = seriesRef.current;
    const volume = volumeRef.current;
    if (!series) return;
    const th = chartThemes[theme];
    const o = buildCandlestickApplyOptions(settings, th.bg);
    const tint = settings.chartVerdictTint ?? 'off';
    const match = analysisMatchesSymbolAndTf(analysis, symbol, timeframe);
    const vl = analysis?.verdict;
    const biasLong = Boolean(match && vl === 'LONG');
    const biasShort = Boolean(match && vl === 'SHORT');
    const priceLineColor =
      tint === 'priceLine' && biasLong
        ? '#22C55E'
        : tint === 'priceLine' && biasShort
          ? '#EF4444'
          : th.lastPriceLine;
    series.applyOptions({
      ...o,
      priceLineVisible: true,
      priceLineWidth: 2,
      priceLineStyle: LineStyle.Solid,
      priceLineColor,
    });
    const v = volumeHistogramBarColors(settings, th.bg);
    volume?.applyOptions({ color: v.up });
  }, [
    theme,
    settings.chartCandleStyle,
    settings.chartCandleClassicUpHex,
    settings.chartCandleClassicDownHex,
    settings.chartCandleMonoUpHex,
    settings.chartCandleMonoDownBodyHex,
    settings.chartCandleMonoOutlineHex,
    settings.chartVerdictTint,
    analysis,
    symbol,
    timeframe,
  ]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setSparkleRedrawTick((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!settings.chartCandleRuleDebug) setCandlePaintDebugLine('');
  }, [settings.chartCandleRuleDebug]);

  /** pre3 반짝: 저장 병합 + 캔들 setData (useLayoutEffect — 테마 apply 직후에도 per-bar 색 유지) */
  /** 거래량 히스토그램은 같은 레이아웃 효과에서 동일 정제 캔들로 갱신 — 캔들/볼륨 길이 불일치로 인한 Histogram 크로스헤어 오류 방지 */
  useLayoutEffect(() => {
    const series = seriesRef.current;
    const volume = volumeRef.current;
    if (!series) return;

    const safe = sanitizeChartCandlesForSeries(candles);
    if (safe.length === 0) {
      candlePaintDebugContextRef.current = {
        blend: candleBlendInput,
        merged: new Map(),
        structure: null,
        prox: new Map(),
        hot: null,
        candles: [],
      };
      try {
        series.setData([]);
      } catch {}
      try {
        volume?.setData([]);
      } catch {}
      try {
        volumeMaRef.current?.setData([]);
      } catch {}
      return;
    }

    mergePre3SparklePersistFromAnalysis(symbol, timeframe, analysis, safe);
    const coarseTouch =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches === true ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rm = prefersReduced && !coarseTouch;
    const persisted = loadPre3SparklePersistMap(symbol, timeframe);
    const live = collectPre3SparkleDirections(analysis, symbol, timeframe, safe);
    const merged = new Map<number, Pre3SparkleCell>();
    for (const [t, d] of persisted) merged.set(t, { direction: d, preview: false });
    for (const [t, cell] of live) merged.set(t, cell);
    candlePaintDebugContextRef.current = {
      blend: candleBlendInput,
      merged,
      structure: structurePhaseCandleByTime,
      prox: lineZoneProximityByTime,
      hot: hotZoneCandleHighlightTimes,
      candles: safe,
    };
    const data = buildCandlestickDataWithPre3Sparkle(
      safe,
      merged,
      sparklePulse,
      rm,
      lineZoneProximityByTime,
      structurePhaseCandleByTime,
      hotZoneCandleHighlightTimes,
      candleBlendInput
    );
    try {
      series.setData(data);
    } catch {}

    if (volume) {
      try {
        const th = chartThemes[theme];
        const maPeriodSetting = Math.max(0, Math.min(120, Math.floor(settings.chartVolumeMaPeriod ?? 0)));
        const rvolDenom = maPeriodSetting >= 8 ? maPeriodSetting : 20;
        volume.setData(
          candlesToVolumeHistogramData(safe, settings, th.bg, {
            enabled: settings.chartVolumeIntelligence,
            rvolTiers: settings.chartVolumeRvolTiers !== false,
            rvolSmaPeriod: Math.max(8, Math.min(60, rvolDenom)),
          })
        );
        const pal = volumeHistogramBarColors(settings, th.bg);
        volume.applyOptions({ color: pal.up });
        const ma = volumeMaRef.current;
        if (ma) {
          if (settings.chartVolumeIntelligence && maPeriodSetting >= 2 && safe.length >= maPeriodSetting) {
            ma.setData(buildVolumeMaLineData(safe, maPeriodSetting));
          } else {
            ma.setData([]);
          }
        }
      } catch {
        try {
          volume.setData([]);
        } catch {}
        try {
          volumeMaRef.current?.setData([]);
        } catch {}
      }
    }
  }, [
    candles,
    analysis,
    symbol,
    timeframe,
    sparklePulse,
    sparkleRedrawTick,
    theme,
    settings.chartVolumeIntelligence,
    settings.chartVolumeRvolTiers,
    settings.chartVolumeMaPeriod,
    settings.chartCandleStyle,
    settings.chartCandleClassicUpHex,
    settings.chartCandleClassicDownHex,
    settings.chartCandleMonoUpHex,
    settings.chartCandleMonoDownBodyHex,
    settings.chartCandleMonoOutlineHex,
    lineZoneProximityByTime,
    structurePhaseCandleByTime,
    hotZoneCandleHighlightTimes,
    candleBlendInput,
  ]);

  /** pre3 반짝 + 줄선·존 근접 펄스 — 터치 기기는 “움직임 줄이기”여도 펄스 허용 */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasLz = hasLineZoneProximitySparkle(lineZoneProximityByTime);
    const hasStructPulse =
      settings.chartSmcStructurePhaseCandles !== false &&
      structurePhaseCandleByTime != null &&
      structurePhaseCandleByTime.size > 0;
    const hasHotZonePulse = (hotZoneCandleHighlightTimes?.size ?? 0) > 0;
    if (
      !hasPre3SparkleOnCandles(symbol, timeframe, candles, analysis) &&
      !hasLz &&
      !hasStructPulse &&
      !hasHotZonePulse
    )
      return;
    const coarseTouch =
      window.matchMedia?.('(pointer: coarse)').matches === true || navigator.maxTouchPoints > 0;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced && !coarseTouch) return;
    const id = window.setInterval(() => setSparklePulse((p) => (p + 1) % 2), 650);
    return () => clearInterval(id);
  }, [
    symbol,
    timeframe,
    candles,
    analysis,
    lineZoneProximityByTime,
    settings.chartSmcStructurePhaseCandles,
    structurePhaseCandleByTime,
    hotZoneCandleHighlightTimes,
  ]);

  /** WAD 고래 라벨 — 거래량 패널에만 표시. 호가·체결 존이 있으면 존과 겹친 급증 봉만 라벨 */
  useEffect(() => {
    const api = volumeMarkersRef.current;
    if (!api) return;
    if (CHART_DEV_ZONES_MSBOB_ONLY) {
      api.setMarkers([]);
      return;
    }
    if (!settings.chartVolumeIntelligence || candles.length === 0) {
      api.setMarkers([]);
      return;
    }
    const symTfOk = analysisMatchesSymbolAndTf(analysis, symbol, timeframe);
    const buyZ = symTfOk ? ((analysis as AnalyzeResponse).buyZones ?? []) : [];
    const sellZ = symTfOk ? ((analysis as AnalyzeResponse).sellZones ?? []) : [];
    const zoneFilter =
      buyZ.length + sellZ.length > 0 ? { buyZones: buyZ, sellZones: sellZ } : undefined;
    const volPeriodForSignals = Math.max(8, Math.min(60, settings.chartVolumeMaPeriod > 0 ? settings.chartVolumeMaPeriod : 20));
    const absMk =
      settings.chartVolumeAbsorptionMarkers !== false
        ? buildVolumeAbsorptionMarkers(candles, {
            volSmaPeriod: volPeriodForSignals,
            textAbs: translateLabelsToKo ? '흡수' : 'ABS',
          })
        : [];
    const rvolMk =
      settings.chartVolumeRvolSpikeMarkers !== false
        ? buildRvolExtremeMarkers(candles, {
            volSmaPeriod: volPeriodForSignals,
            textShort: translateLabelsToKo ? '폭증' : 'HV',
            labelLong: translateLabelsToKo ? '롱' : 'L',
            labelShort: translateLabelsToKo ? '숏' : 'S',
          })
        : [];
    const takerMk =
      settings.chartVolumeTakerFlowMarkers !== false
        ? buildTakerFlowSkewMarkers(candles, {
            volSmaPeriod: volPeriodForSignals,
            buyText: translateLabelsToKo ? '체결↑' : 'TB+',
            sellText: translateLabelsToKo ? '체결↓' : 'TB−',
          })
        : [];
    const wadMk = buildWadVolumeMarkers(candles, {}, zoneFilter, {
      buyHex: wadMarkerBuyUi,
      sellHex: wadMarkerSellUi,
      buyText: translateLabelsToKo ? '롱' : 'BUY',
      sellText: translateLabelsToKo ? '숏' : 'SELL',
    });
    const brkMk =
      settings.chartVolumeZoneBreakMarkers !== false
        ? buildZoneBreakoutVolumeMarkers(candles, buyZ, sellZ, {
            volSmaPeriod: volPeriodForSignals,
            upText: translateLabelsToKo ? '존↑' : 'BRK↑',
            downText: translateLabelsToKo ? '존↓' : 'BRK↓',
            minBodyPctOfRange: Math.max(0, Math.min(50, Math.floor(settings.chartVolumeZoneBreakMinBodyPct ?? 0))),
          })
        : [];
    const P = VOLUME_MARKER_PRIORITY;
    const mergedTagged = mergeVolumeMarkerLayers([
      { markers: absMk, priority: P.ABSORPTION },
      { markers: rvolMk, priority: P.RVOL_EXTREME },
      { markers: takerMk, priority: P.TAKER_FLOW },
      { markers: wadMk, priority: P.WAD_WHALE },
      { markers: brkMk, priority: P.ZONE_BREAKOUT },
    ]);
    const barGap = Math.max(0, Math.min(8, Math.floor(settings.chartVolumeMarkerMinBarGap ?? defaultSettings.chartVolumeMarkerMinBarGap)));
    const merged = thinVolumeMarkersByBarGap(mergedTagged, candles, barGap);
    api.setMarkers(merged);
  }, [
    candles,
    settings.chartVolumeIntelligence,
    settings.chartVolumeZoneBreakMarkers,
    settings.chartVolumeRvolSpikeMarkers,
    settings.chartVolumeAbsorptionMarkers,
    settings.chartVolumeTakerFlowMarkers,
    settings.chartVolumeZoneBreakMinBodyPct,
    settings.chartVolumeMarkerMinBarGap,
    settings.chartVolumeMaPeriod,
    analysis,
    symbol,
    timeframe,
    wadMarkerBuyUi,
    wadMarkerSellUi,
    translateLabelsToKo,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const th = chartThemes[theme];
    const isDayOrWeek = timeframe === '1d' || timeframe === '1w';
    const formatUtcDate = (t: number) => {
      const d = new Date(t * 1000);
      const y = d.getUTCFullYear();
      const M = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      return `${y}-${String(M).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };
    const tickMarkFormatter = isDayOrWeek
      ? (time: unknown, tickMarkType: TickMarkType) => {
          const ts = typeof time === 'number' ? time : (time as { timestamp?: number })?.timestamp;
          if (typeof ts !== 'number') return null;
          const d = new Date(ts * 1000);
          const y = d.getUTCFullYear();
          const M = d.getUTCMonth() + 1;
          const day = d.getUTCDate();
          if (tickMarkType === TickMarkType.Year) return String(y);
          if (tickMarkType === TickMarkType.Month) return `${y}-${String(M).padStart(2, '0')}`;
          return `${M}/${day}`;
        }
      : undefined;
    const opts: Parameters<typeof chart.applyOptions>[0] = {
      layout: {
        background: { color: th.bg },
        textColor: th.text,
        fontSize: Math.max(10, Math.min(18, chartScaleFontSize)),
        fontFamily: CHART_PRO_FONT,
      },
      grid: chartGridOptions(th),
      crosshair: chartCrosshairOptions(th),
      rightPriceScale: { borderColor: th.border, visible: chartSectionVis.s3 },
      timeScale: {
        borderColor: th.border,
        tickMarkFormatter: tickMarkFormatter ?? undefined,
        rightOffset: smartMoneyRightOffset,
      },
    };
    if (isDayOrWeek) {
      (opts as any).localization = {
        timeFormatter: (time: unknown) => {
          const ts = typeof time === 'number' ? time : (time as { timestamp?: number })?.timestamp;
          if (typeof ts !== 'number') return '';
          return formatUtcDate(ts);
        },
        dateFormat: 'yyyy-MM-dd',
      };
    }
    chart.applyOptions(opts);
    volumeMaRef.current?.applyOptions({ color: th.volumeHistogramMaLine });
  }, [theme, timeframe, chartScaleFontSize, chartSectionVis.s3, smartMoneyRightOffset]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length < 2) return;
    if (useZoneRange) {
      if (!zoneRangeSeriesRef.current) {
        const lineSeries = chart.addSeries(LineSeries, {
          color: 'rgba(0,0,0,0)',
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        zoneRangeSeriesRef.current = lineSeries;
      }
      const zoneLine = zoneRangeSeriesRef.current;
      if (!zoneLine) return;
      const rangeData: LineData<UTCTimestamp>[] = [
        { time: candles[0].time as UTCTimestamp, value: ZONE_PRICE_CEIL },
        { time: candles[candles.length - 1].time as UTCTimestamp, value: ZONE_PRICE_FLOOR },
      ];
      zoneLine.setData(rangeData);
    } else {
      if (zoneRangeSeriesRef.current) {
        chart.removeSeries(zoneRangeSeriesRef.current);
        zoneRangeSeriesRef.current = null;
      }
    }
  }, [useZoneRange, candles]);

  const closeOverlayRange = (analysis as any)?.closeOverlayRange as { min: number; max: number } | undefined;
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length < 2) return;
    const minR = Number(closeOverlayRange?.min);
    const maxR = Number(closeOverlayRange?.max);
    const t0 = Number(candles[0]?.time);
    const t1 = Number(candles[candles.length - 1]?.time);
    const rangeOk =
      Number.isFinite(minR) &&
      Number.isFinite(maxR) &&
      minR > 0 &&
      maxR > 0 &&
      Number.isFinite(t0) &&
      Number.isFinite(t1) &&
      t1 > t0;
    const inExecutionWithRange =
      (uiMode === 'EXECUTION' ||
        uiMode === 'SMART' ||
        uiMode === 'MAX_ANALYSIS' ||
        isSmcDeskMode ||
        uiMode === 'UNIFIED_DESK' ||
        uiMode === 'AI_ZONE' ||
        uiMode === 'TAPPOINT') &&
      closeOverlayRange &&
      rangeOk;
    if (inExecutionWithRange) {
      if (!closeRangeSeriesRef.current) {
        const lineSeries = chart.addSeries(LineSeries, {
          color: 'rgba(0,0,0,0)',
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        closeRangeSeriesRef.current = lineSeries;
      }
      const lineApi = closeRangeSeriesRef.current;
      if (!lineApi) return;
      const rangeData: LineData<UTCTimestamp>[] = [
        { time: t0 as UTCTimestamp, value: minR },
        { time: t1 as UTCTimestamp, value: maxR },
      ];
      try {
        lineApi.setData(rangeData);
      } catch {
        // TF 전환/전체화면 직후 lightweight-charts가 null 값을 던지는 레이스를 방어
        try {
          if (closeRangeSeriesRef.current) chart.removeSeries(closeRangeSeriesRef.current);
        } catch {}
        closeRangeSeriesRef.current = null;
      }
    } else {
      if (closeRangeSeriesRef.current) {
        chart.removeSeries(closeRangeSeriesRef.current);
        closeRangeSeriesRef.current = null;
      }
    }
  }, [uiMode, closeOverlayRange?.min, closeOverlayRange?.max, candles]);

  /** 기관·세력 흐름: SuperTrend 스텝 밴드 (롱=아래 초록 / 숏=위 빨강) — 모든 모드 공통 */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const longBandColor =
      typeof settings.institutionalBandLongHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(settings.institutionalBandLongHex)
        ? settings.institutionalBandLongHex.toUpperCase()
        : '#22C55E';
    const shortBandColor =
      typeof settings.institutionalBandShortHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(settings.institutionalBandShortHex)
        ? settings.institutionalBandShortHex.toUpperCase()
        : '#EF4444';
    const enabled = CHART_BAND_LINE_AND_TOUCH_ALWAYS_ON;
    const safe = sanitizeChartCandlesForSeries(candles);
    const removeBoth = () => {
      if (institutionalLongLineRef.current) {
        try {
          chart.removeSeries(institutionalLongLineRef.current);
        } catch {}
        institutionalLongLineRef.current = null;
      }
      if (institutionalShortLineRef.current) {
        try {
          chart.removeSeries(institutionalShortLineRef.current);
        } catch {}
        institutionalShortLineRef.current = null;
      }
    };
    if (!enabled || safe.length < 2) {
      removeBoth();
      return;
    }
    const { long, short } = computeInstitutionalSuperBandData(safe, 10, 3);
    if (!institutionalLongLineRef.current) {
      institutionalLongLineRef.current = chart.addSeries(LineSeries, {
        color: longBandColor,
        lineWidth: 3,
        lineType: LineType.WithSteps,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'right',
      });
    }
    if (!institutionalShortLineRef.current) {
      institutionalShortLineRef.current = chart.addSeries(LineSeries, {
        color: shortBandColor,
        lineWidth: 3,
        lineType: LineType.WithSteps,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'right',
      });
    }
    try {
      institutionalLongLineRef.current?.applyOptions({
        color: longBandColor,
      });
      institutionalShortLineRef.current?.applyOptions({
        color: shortBandColor,
      });
      institutionalLongLineRef.current?.setData(long);
      institutionalShortLineRef.current?.setData(short);
    } catch {
      removeBoth();
    }
  }, [candles, settings.institutionalBandLongHex, settings.institutionalBandShortHex]);

  /** SuperTrend 요약 배지 (줄선과 동일 계산) */
  useEffect(() => {
    if (settings.showInstitutionalTrendBadge === false) {
      setInstitutionalBadge(null);
      return;
    }
    const safe = sanitizeChartCandlesForSeries(candles);
    if (safe.length < 2) {
      setInstitutionalBadge(null);
      return;
    }
    const meta = computeInstitutionalSuperTrendMeta(safe, 10, 3);
    setInstitutionalBadge({
      lastDir: meta.lastDir,
      lastLinePrice: meta.lastLinePrice,
      barsInCurrentTrend: meta.barsInCurrentTrend,
      currentTrendStartTime: meta.currentTrendStartTime,
    });
  }, [candles, settings.showInstitutionalTrendBadge]);

  /** Bitcoin Power Law Bands — Pine 스크립트와 동일 계수, BTC 기축 심볼만 */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const removePl = () => {
      if (powerLawCenterRef.current) {
        try {
          chart.removeSeries(powerLawCenterRef.current);
        } catch {}
        powerLawCenterRef.current = null;
      }
      if (powerLawSupportRef.current) {
        try {
          chart.removeSeries(powerLawSupportRef.current);
        } catch {}
        powerLawSupportRef.current = null;
      }
      if (powerLawResistanceRef.current) {
        try {
          chart.removeSeries(powerLawResistanceRef.current);
        } catch {}
        powerLawResistanceRef.current = null;
      }
    };
    const enabled = settings.showBitcoinPowerLawBands === true;
    const safe = sanitizeChartCandlesForSeries(candles);
    if (!enabled || !isBitcoinPowerLawChartSymbol(symbol) || safe.length < 2) {
      removePl();
      return;
    }
    const { center, support, resistance } = buildBitcoinPowerLawLineData(safe);
    const lineOpts = {
      lineWidth: 2 as LineWidth,
      lineType: LineType.WithSteps,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      priceScaleId: 'right' as const,
    };
    if (!powerLawCenterRef.current) {
      powerLawCenterRef.current = chart.addSeries(LineSeries, {
        ...lineOpts,
        color: theme === 'light' ? '#64748b' : '#94a3b8',
      });
    }
    if (!powerLawSupportRef.current) {
      powerLawSupportRef.current = chart.addSeries(LineSeries, {
        ...lineOpts,
        color: theme === 'light' ? '#16a34a' : '#84cc16',
        lineWidth: 2 as LineWidth,
      });
    }
    if (!powerLawResistanceRef.current) {
      powerLawResistanceRef.current = chart.addSeries(LineSeries, {
        ...lineOpts,
        color: theme === 'light' ? '#dc2626' : '#ef4444',
        lineWidth: 2 as LineWidth,
      });
    }
    try {
      powerLawCenterRef.current?.applyOptions({
        color: theme === 'light' ? '#64748b' : '#94a3b8',
      });
      powerLawSupportRef.current?.applyOptions({
        color: theme === 'light' ? '#16a34a' : '#84cc16',
      });
      powerLawResistanceRef.current?.applyOptions({
        color: theme === 'light' ? '#dc2626' : '#ef4444',
      });
      powerLawCenterRef.current?.setData(center);
      powerLawSupportRef.current?.setData(support);
      powerLawResistanceRef.current?.setData(resistance);
    } catch {
      removePl();
    }
  }, [candles, settings.showBitcoinPowerLawBands, symbol, theme]);

  /** L/S 캔들 마커: 4요소 확정 시 표시. 한번 뜬 신호는 스크롤·TF 전환해도 해당 캔들에 유지 */
  const lockedSignalsStoreRef = useRef<Map<string, Map<number, 'LONG' | 'SHORT'>>>(new Map());
  const rsiOnlySignalsStoreRef = useRef<Map<string, Map<number, 'LONG' | 'SHORT'>>>(new Map());
  const SHOW_FRONT_RUN_ON_CHART = CHART_FRONT_RUN_MARKERS_ENABLED;
  const frontRunTriggeredStoreRef = useRef<Map<string, Map<number, 'LONG' | 'SHORT'>>>(new Map());
  const frontRunTriggeredDetailStoreRef = useRef<
    Map<string, Map<number, {
      direction: 'LONG' | 'SHORT';
      entry?: number;
      stop?: number;
      tp1?: number;
      tp2?: number;
      tp3?: number;
      rr?: number;
      confidence?: number;
      leverage?: number;
      positionSize?: number;
      riskAmount?: number;
      spotProfitPct?: number[];
      spotLossPct?: number;
      futuresProfitPct?: number[];
      futuresLossPct?: number;
    }>>
  >(new Map());
  const [frontRunTip, setFrontRunTip] = useState<null | {
    time: number;
    direction: 'LONG' | 'SHORT';
    entry?: number;
    stop?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    rr?: number;
    confidence?: number;
    leverage?: number;
    positionSize?: number;
    riskAmount?: number;
    spotProfitPct?: number[];
    spotLossPct?: number;
    futuresProfitPct?: number[];
    futuresLossPct?: number;
  }>(null);
  /** B: 마커가 있는 봉 클릭 시 요약 줄 */
  const [signalBarTip, setSignalBarTip] = useState<{ time: number; lines: string[] } | null>(null);
  /** 바이블 패턴 핀: 이모지만 표시, 클릭 시 상세 */
  const [biblePatternTip, setBiblePatternTip] = useState<{ text: string; left: number; top: number } | null>(null);
  const [confirmedHistorySignals, setConfirmedHistorySignals] = useState<Array<{
    symbol: string;
    timeframe: string;
    direction: 'LONG' | 'SHORT';
    entryTime?: number;
    at?: number;
  }>>([]);
  const [overlayTradeLabelExpanded, setOverlayTradeLabelExpanded] = useState<Record<string, boolean>>({});
  const featureProbabilities = ((analysis as any)?.featureProbabilities as Array<any> | undefined) ?? [];
  const resolveDirectionProb = (item: OverlayItem, labelText: string, dirTag: '상승' | '하락' | '중립' | ''): number | null => {
    const focusKinds: OverlayItem['kind'][] = ['bos', 'choch', 'liquiditySweep', 'eql'];
    if (!focusKinds.includes(item.kind)) return null;
    /**
     * BOS/CHOCH: `featureProbabilities`는 존·OB 등 다른 레이어용 과거 통계 매칭이라
     * 구조 선에는 무관한 riseProb/fallProb(~45% 부근)가 붙어 "고정 %"처럼 보임 → 방향만 표시.
     */
    if (item.kind === 'bos' || item.kind === 'choch') return null;
    if (!dirTag || featureProbabilities.length === 0) return null;
    const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '');
    const nid = norm(item.id);
    const nlabel = norm(labelText);
    let best: any = null;
    let bestScore = -1;
    for (const f of featureProbabilities) {
      const key = norm(f?.key || '');
      const flabel = norm(f?.label || '');
      let score = 0;
      if (nid && key.includes(nid)) score += 4;
      if (nlabel && flabel && (nlabel.includes(flabel) || flabel.includes(nlabel))) score += 3;
      if (nlabel && flabel && nlabel.slice(0, 8) === flabel.slice(0, 8)) score += 1;
      if (score > bestScore) {
        best = f;
        bestScore = score;
      }
    }
    if (!best || bestScore <= 0) return null;
    if (dirTag === '상승') {
      const v = ['zone', 'supplyZone', 'demandZone', 'reactionZone', 'ob', 'fvg', 'bprZone'].includes(item.kind)
        ? Math.max(Number(best.supportProb ?? 0), Number(best.riseProb ?? 0))
        : Number(best.riseProb ?? 0);
      return Number.isFinite(v) ? Math.round(v) : null;
    }
    if (dirTag === '하락') {
      const v = ['zone', 'supplyZone', 'demandZone', 'reactionZone', 'ob', 'fvg', 'bprZone'].includes(item.kind)
        ? Math.max(Number(best.resistanceProb ?? 0), Number(best.fallProb ?? 0))
        : Number(best.fallProb ?? 0);
      return Number.isFinite(v) ? Math.round(v) : null;
    }
    return null;
  };
  const withDirAndProb = (baseLabel: string, dirTag: '상승' | '하락' | '중립' | '', prob: number | null): string => {
    if (!dirTag) return baseLabel;
    const mark = dirTag === '상승' ? '↑' : dirTag === '하락' ? '↓' : '↔';
    if (typeof prob === 'number') return `${baseLabel} ${mark} · ${dirTag}(${prob}%)`;
    return `${baseLabel} ${mark} · ${dirTag}`;
  };
  const compactTradeLabel = (id: string, rawLabel: string) => {
    const text = String(rawLabel ?? '').trim();
    /** 통합·기관 스타일 긴 한 줄(점수·등급 포함) — 기본은 방향만, 클릭 시 전체 */
    if (text.length > 22 && /\bST[-·\s]*[LS]\b|구조관점|\([A-Z]\)\s*\d{2,4}/i.test(text)) {
      const expanded = overlayTradeLabelExpanded[id] === true;
      let shortSide: '↑' | '↓' | '↔' = '↔';
      if (/\bST[-·\s]*S\b/i.test(text)) shortSide = '↓';
      else if (/\bST[-·\s]*L\b/i.test(text)) shortSide = '↑';
      else if (/숏(?!대기)/.test(text) && !/롱(?!대기)/.test(text)) shortSide = '↓';
      else if (/롱(?!대기)/.test(text) && !/숏(?!대기)/.test(text)) shortSide = '↑';
      return { label: expanded ? text : `${shortSide} ST`, expandable: true };
    }
    const grade = (text.match(/\[([ABC])\]/)?.[1] ?? '').toUpperCase();
    const isPatternVision = id.startsWith('vision-') || /더블|헤드앤숄더|삼중|웨지|채널|확장형|Triangle|Flag|Wedge|Channel|Range|Top|Bottom/.test(text);
    const isLongLike = /더블바텀|역헤드앤숄더|삼중바닥|하락웨지|상승채널|불플래그|Ascending|Bull|Falling Wedge|Channel Up|Double Bottom|Triple Bottom|Inverse/.test(text);
    const isShortLike = /더블탑|헤드앤숄더|삼중천정|상승웨지|하락채널|베어플래그|Descending|Bear|Rising Wedge|Channel Down|Double Top|Triple Top/.test(text);
    if (isPatternVision && grade) {
      const dir = isLongLike ? '↑ 롱' : isShortLike ? '↓ 숏' : '↔ 중립';
      const expanded = overlayTradeLabelExpanded[id] === true;
      return { label: expanded ? text : `${dir} ${grade}`, expandable: true };
    }
    if (isPatternVision) {
      const dir = isLongLike ? '↑ 롱' : isShortLike ? '↓ 숏' : '';
      if (dir) return { label: `${dir} · ${text}`, expandable: false };
    }
    const hasDirection = text.includes('롱') || text.includes('숏');
    const hasTradeDetail = /진입|손절|SL|TP|목표/.test(text);
    if (!hasDirection || !hasTradeDetail) return { label: text, expandable: false };
    const dir = text.includes('롱') ? '롱' : '숏';
    const expanded = overlayTradeLabelExpanded[id] === true;
    return { label: expanded ? text : dir, expandable: true };
  };
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchWithRetry('/api/confirmed-signals', { cache: 'no-store', credentials: 'same-origin' });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.signals)) {
          setConfirmedHistorySignals(data.signals);
        }
      } catch {
        if (!cancelled) setConfirmedHistorySignals([]);
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    const markersApi = rsiMarkersRef.current;
    if (!markersApi || candles.length === 0) {
      if (markersApi) markersApi.setMarkers([]);
      setLsRocketHud([]);
      return;
    }
    const storeKey = `${symbol}|${timeframe}`;
    const persistKey = 'ailongshort-ls-fixed-signals-v1';
    if (!lockedSignalsStoreRef.current.has(storeKey)) lockedSignalsStoreRef.current.set(storeKey, new Map());
    if (!rsiOnlySignalsStoreRef.current.has(storeKey)) rsiOnlySignalsStoreRef.current.set(storeKey, new Map());
    const locked = lockedSignalsStoreRef.current.get(storeKey)!;
    const rsiOnly = rsiOnlySignalsStoreRef.current.get(storeKey)!;
    // 새로고침 후에도 확정/RSI 신호 고정 복원
    if (locked.size === 0 && rsiOnly.size === 0 && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(persistKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, { locked?: Array<[number, 'LONG' | 'SHORT']>; rsiOnly?: Array<[number, 'LONG' | 'SHORT']> }>;
          const saved = parsed?.[storeKey];
          if (saved?.locked?.length) {
            for (const [t, d] of saved.locked) locked.set(Number(t), d);
          }
          if (saved?.rsiOnly?.length) {
            for (const [t, d] of saved.rsiOnly) rsiOnly.set(Number(t), d);
          }
        }
      } catch {}
    }
    if (!SHOW_FRONT_RUN_ON_CHART) {
      markersApi.setMarkers([]);
      // 기존 L/S 마커는 유지
    }
    if (!frontRunTriggeredStoreRef.current.has(storeKey)) frontRunTriggeredStoreRef.current.set(storeKey, new Map());
    if (!frontRunTriggeredDetailStoreRef.current.has(storeKey)) frontRunTriggeredDetailStoreRef.current.set(storeKey, new Map());
    const frTriggered = frontRunTriggeredStoreRef.current.get(storeKey)!;
    const frTriggeredDetail = frontRunTriggeredDetailStoreRef.current.get(storeKey)!;

    const analysisMatches = analysisMatchesSymbolAndTf(analysis, symbol, timeframe);
    const ud = unifiedDeskMode;
    const smcDeskMode = isSmcDeskMode;
    const slFailSet = chartSlFailureKeySet(
      analysisMatches ? (analysis as AnalyzeResponse).signalLearning?.slFailures : undefined,
      candles
    );
    const ac = (analysis as { candles?: Candle[] })?.candles;
    const signalCandles = analysisMatches && ac?.length ? ac : candles;
    const signalLastTime = signalCandles[signalCandles.length - 1]?.time as number | undefined;
    const effSignalLast = signalLastTime ?? (candles[candles.length - 1]?.time as number | undefined);
    if (effSignalLast == null) {
      markersApi.setMarkers([]);
      const srEarlyRaw = analysisMatches ? (analysis as AnalyzeResponse).structureRocketSignals ?? [] : [];
      const srEarly = isAiMode && !whaleCoreSrZoneEnabled ? [] : srEarlyRaw;
      const persistedOnly = mergeRocketPersistence(
        storeKey,
        analysisMatches ? filterLsRocketsBySlFailures(srEarly, slFailSet, candles) : undefined,
        timeframe,
        slFailSet,
        candles
      );
      const mergedEarly = mergePersistedRocketRows(
        persistedOnly,
        collectCrossTfMappedRockets(symbol, candles, storeKey, timeframe)
      );
      setLsRocketHud(buildLsRocketHud(filterLsRocketsBySlFailures(mergedEarly, slFailSet, candles)));
      return;
    }

    if (analysisMatches) {
      // 누적 고정: 한번 뜬 신호는 이후 가격 변동에도 지우지 않고 유지
      const confirmed = (analysis as { confirmedSignal?: { confirmed: boolean; direction: 'LONG' | 'SHORT' | null } }).confirmedSignal;
      const sig = (analysis as {
        rsiDivergenceSignal?: {
          verdict: 'LONG' | 'SHORT' | 'WATCH' | 'NONE';
          signalBarTime?: number;
          totalScore?: number;
          volume?: { spike?: boolean };
          divergenceLines?: Array<{ type: 'bullish' | 'bearish'; index2: number }>;
          signalHistory?: Array<{ time: number; verdict: 'LONG' | 'SHORT' }>;
        };
      }).rsiDivergenceSignal;
      const learningGate = (analysis as { learningFilter?: { passed: boolean } }).learningFilter;
      const allowNewSignal = learningGate?.passed !== false;
      const isConfirmed = Boolean(confirmed?.confirmed && confirmed?.direction);
      const direction = confirmed?.direction;
      const barTime = (sig?.signalBarTime != null && candles.some((c) => (c.time as number) === sig.signalBarTime)) ? sig.signalBarTime : effSignalLast;
      const cooldownBarsByTf = (tf: string): number => {
        if (tf === '1m') return 18;
        if (tf === '3m' || tf === '5m') return 14;
        if (tf === '15m') return 10;
        if (tf === '1h') return 8;
        if (tf === '4h') return 6;
        if (tf === '1d') return 5;
        if (tf === '1w' || tf === '1M') return 4;
        return 8;
      };
      const minGapBars = cooldownBarsByTf(timeframe);
      const minGapSec = Math.max(1, periodSeconds(timeframe)) * minGapBars;
      const rsiScoreThresholdByTf = (tf: string): number => {
        if (tf === '1m' || tf === '3m' || tf === '5m') return 89;
        if (tf === '15m') return 88;
        if (tf === '1h') return 87;
        if (tf === '4h') return 86;
        if (tf === '1d' || tf === '1w' || tf === '1M') return 85;
        return 86;
      };
      const rsiScoreMin = rsiScoreThresholdByTf(timeframe);
      const hasNearbySameDir = (src: Map<number, 'LONG' | 'SHORT'>, t: number, dir: 'LONG' | 'SHORT') => {
        for (const [pt, pd] of src) {
          if (pd !== dir) continue;
          if (Math.abs(pt - t) < minGapSec) return true;
        }
        return false;
      };
      const divTimes = new Set<number>();
      if (sig?.divergenceLines?.length) {
        for (const ln of sig.divergenceLines) {
          const c = signalCandles[ln.index2];
          if (!c) continue;
          const t = c.time as number;
          if (candles.some((x) => (x.time as number) === t)) divTimes.add(t);
        }
      }
      const hasDivFor = (dir: 'LONG' | 'SHORT', t: number) => {
        if (!divTimes.size) return false;
        const tol = Math.max(1, periodSeconds(timeframe)) * 2;
        for (const dt of divTimes) {
          if (Math.abs(dt - t) <= tol) return true;
        }
        return false;
      };
      const rsiVolumeOk = sig?.volume?.spike === true;
      if (allowNewSignal && isConfirmed && direction && candles.some((c) => (c.time as number) === barTime)) {
        if (!rsiVolumeOk || !hasDivFor(direction, barTime)) {
          // RSI 다이버 기반이 아닌 확정은 L/S 마커로는 표시하지 않음
        } else if (hasNearbySameDir(locked, barTime, direction) || hasNearbySameDir(rsiOnly, barTime, direction)) {
          // 과도한 연속 표시 방지
        } else {
        // 반대 확정이 들어오면 이전 방향 누적 고정은 즉시 정리
        for (const [t, d] of [...locked.entries()]) {
          if (d !== direction) locked.delete(t);
        }
        for (const [t, d] of [...rsiOnly.entries()]) {
          if (d !== direction) rsiOnly.delete(t);
        }
        locked.set(barTime, direction);
        }
      } else if (allowNewSignal && sig && (sig.verdict === 'LONG' || sig.verdict === 'SHORT')) {
        const rsiBarTime = sig.signalBarTime ?? effSignalLast;
        const scoreOk = Number(sig.totalScore ?? 0) >= rsiScoreMin;
        if (
          scoreOk &&
          rsiVolumeOk &&
          candles.some((c) => (c.time as number) === rsiBarTime) &&
          hasDivFor(sig.verdict, rsiBarTime) &&
          !hasNearbySameDir(rsiOnly, rsiBarTime, sig.verdict)
        ) {
          rsiOnly.set(rsiBarTime, sig.verdict);
        }
      }
      // 과거 히스토리 복원: divergence 라인의 끝점(index2)을 L/S 자리로 표시
      if (sig?.divergenceLines?.length) {
        sig.divergenceLines.forEach((ln) => {
          const idx2 = ln.index2;
          const c = signalCandles[idx2];
          if (!c) return;
          const t = c.time as number;
          if (!candles.some((x) => (x.time as number) === t)) return;
          if (ln.type === 'bullish' && !hasNearbySameDir(rsiOnly, t, 'LONG')) rsiOnly.set(t, 'LONG');
          if (ln.type === 'bearish' && !hasNearbySameDir(rsiOnly, t, 'SHORT')) rsiOnly.set(t, 'SHORT');
        });
      }
      if (sig?.signalHistory?.length) {
        sig.signalHistory.forEach((h) => {
          if (!candles.some((x) => (x.time as number) === h.time)) return;
          if (!hasDivFor(h.verdict, h.time)) return;
          if (hasNearbySameDir(rsiOnly, h.time, h.verdict)) return;
          rsiOnly.set(h.time, h.verdict);
        });
      }
      // 안전장치(topVerdict 강제마커)는 과다 표시 원인이라 비활성화: RSI 다이버 발생 봉만 표시
    }
    // 저장된 확정신호 백필: 같은 심볼이면 분·시·일·주·달 차트 모두에서 과거 봉에 매핑 (로드된 캔들 범위만)
    for (const h of confirmedHistorySignals) {
      if (h.symbol !== symbol) continue;
      if (h.direction !== 'LONG' && h.direction !== 'SHORT') continue;
      const t = Number(h.entryTime ?? 0);
      if (!Number.isFinite(t) || t <= 0) continue;
      const barOpen = candleOpenContainingTime(candles, t);
      if (barOpen == null) continue;
      locked.set(barOpen, h.direction);
    }
    // 반대 확정 3연속이면 이전 방향 잔상(확정/RSI)을 정리
    {
      const rows = confirmedHistorySignals
        .filter((h) =>
          h.symbol === symbol &&
          normalizeChartTimeframe(String(h.timeframe ?? '')) === normalizeChartTimeframe(timeframe) &&
          (h.direction === 'LONG' || h.direction === 'SHORT')
        )
        .sort((a, b) => Number(b.entryTime ?? 0) - Number(a.entryTime ?? 0))
        .slice(0, 3);
      const allShort3 = rows.length >= 3 && rows.every((x) => x.direction === 'SHORT');
      const allLong3 = rows.length >= 3 && rows.every((x) => x.direction === 'LONG');
      if (allShort3 || allLong3) {
        const keepDir: 'LONG' | 'SHORT' = allShort3 ? 'SHORT' : 'LONG';
        for (const [t, d] of [...locked.entries()]) {
          if (d !== keepDir) locked.delete(t);
        }
        for (const [t, d] of [...rsiOnly.entries()]) {
          if (d !== keepDir) rsiOnly.delete(t);
        }
      }
    }

    const periodFallback = periodSeconds(timeframe);
    const markers: Array<{
      time: UTCTimestamp;
      position: 'aboveBar' | 'belowBar' | 'inBar';
      shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
      color: string;
      text: string;
      size?: number;
    }> = [];
    /** 기관밴드 접촉: 캔들 텍스트는 짧게 쓰고, 클릭 패널은 상세 문자열로 복원 */
    const ibTouchByBarTime = new Map<number, InstitutionalBandInteractionMarker[]>();
    const frontRun = (analysis as any)?.frontRunSignal as { state: 'WATCH' | 'READY' | 'TRIGGERED' | 'INVALID' | 'NO_SIGNAL'; direction: 'LONG' | 'SHORT' | 'NONE'; signalTime?: number } | undefined;
    if (
      SHOW_FRONT_RUN_ON_CHART &&
      analysisMatches &&
      frontRun?.state === 'TRIGGERED' &&
      (frontRun.direction === 'LONG' || frontRun.direction === 'SHORT')
    ) {
      const frTime = frontRun.signalTime ?? effSignalLast;
      if (candles.some((c) => (c.time as number) === frTime)) {
        const idxByTime = new Map<number, number>();
        candles.forEach((c, i) => idxByTime.set(c.time as number, i));
        const newIdx = idxByTime.get(frTime) ?? -1;
        if (newIdx >= 0) {
          const nearBars = 3;
          for (const [oldTime, oldDir] of [...frTriggered.entries()]) {
            const oldIdx = idxByTime.get(oldTime) ?? -9999;
            if (oldDir !== frontRun.direction && Math.abs(oldIdx - newIdx) <= nearBars) {
              frTriggered.delete(oldTime);
              frTriggeredDetail.delete(oldTime);
            }
          }
        }
        frTriggered.set(frTime, frontRun.direction);
        frTriggeredDetail.set(frTime, {
          direction: frontRun.direction,
          entry: (analysis as any)?.frontRunSignal?.entry,
          stop: (analysis as any)?.frontRunSignal?.stop,
          tp1: (analysis as any)?.frontRunSignal?.tp1,
          tp2: (analysis as any)?.frontRunSignal?.tp2,
          tp3: (analysis as any)?.frontRunSignal?.tp3,
          rr: (analysis as any)?.frontRunSignal?.rr,
          confidence: (analysis as any)?.frontRunSignal?.confidence,
          leverage: (analysis as any)?.frontRunSignal?.leverage,
          positionSize: (analysis as any)?.frontRunSignal?.positionSize,
          riskAmount: (analysis as any)?.frontRunSignal?.riskAmount,
          spotProfitPct: (analysis as any)?.frontRunSignal?.spotProfitPct,
          spotLossPct: (analysis as any)?.frontRunSignal?.spotLossPct,
          futuresProfitPct: (analysis as any)?.frontRunSignal?.futuresProfitPct,
          futuresLossPct: (analysis as any)?.frontRunSignal?.futuresLossPct,
        });
      }
    }
    const structureRocketsRaw = analysisMatches ? (analysis as AnalyzeResponse).structureRocketSignals ?? [] : [];
    const structureRockets =
      isAiMode && !whaleCoreSrZoneEnabled ? [] : structureRocketsRaw;
    const structureRocketsVisible = filterLsRocketsBySlFailures(structureRockets, slFailSet, candles);
    /** 자동 텔레그램: 차트에 실제로 보이는 구조로켓만 알림 */
    const structureRocketsForTelegram = structureRocketsVisible;
    const higherTfByBar = new Map<number, HigherTfRocketBoostRow[]>();
    for (const row of higherTfRocketBoost) {
      const t = Number(row.time);
      if (!Number.isFinite(t)) continue;
      const list = higherTfByBar.get(t) ?? [];
      list.push(row);
      higherTfByBar.set(t, list);
    }

    /** 최근 N봉: 상단 verdict(롱/숏)와 반대 L/S·선확·로켓은 숨겨 혼선 방지 */
    const chartBias: 'LONG' | 'SHORT' | null =
      analysisMatches &&
      ((analysis as { verdict?: string }).verdict === 'LONG' || (analysis as { verdict?: string }).verdict === 'SHORT')
        ? (analysis as { verdict: 'LONG' | 'SHORT' }).verdict
        : null;
    /** C: 밀도·레이어 — 끄면 전 레이어 표시(기존 동작) */
    const densityC = chartMarkerDensityC === true;
    const layerLs = !densityC || chartMarkerLayerLs !== false;
    const layerRocket = CHART_ROCKET_MARKERS_ALWAYS_ON;
    const layerAux = !densityC || chartMarkerLayerAux !== false;
    const layerFr = !densityC || chartMarkerLayerFrontRun !== false;
    const markerMetaA = chartMarkerMetaA !== false || smcDeskMode;
    const unifiedMarkersOn = showUnifiedCandleMarkers || smcDeskMode;
    const sigRsi = analysisMatches
      ? (analysis as { rsiDivergenceSignal?: { totalScore?: number } })?.rsiDivergenceSignal
      : undefined;
    const analysisConfidence =
      analysisMatches && typeof (analysis as AnalyzeResponse)?.confidence === 'number'
        ? (analysis as AnalyzeResponse).confidence!
        : null;
    const LS_MARKER_NEGOTIATE_BARS = 22;
    const negotiateFromCi = Math.max(0, candles.length - LS_MARKER_NEGOTIATE_BARS);
    for (let ci = 0; ci < candles.length; ci++) {
      const c = candles[ci];
      const t = c.time as number;
      const rangeEnd =
        ci + 1 < candles.length ? (candles[ci + 1].time as number) : t + periodFallback;
      let v: 'LONG' | 'SHORT' | undefined;
      let signalSrcTime: number | undefined;
      for (const [lockedTime, dir] of locked) {
        if (t <= lockedTime && lockedTime < rangeEnd) {
          v = dir;
          signalSrcTime = lockedTime;
          break;
        }
      }
      if (!v) {
        for (const [rsiTime, dir] of rsiOnly) {
          if (t <= rsiTime && rsiTime < rangeEnd) {
            v = dir;
            signalSrcTime = rsiTime;
            break;
          }
        }
      }
      if (chartBias && ci >= negotiateFromCi && v && v !== chartBias) {
        v = undefined;
        signalSrcTime = undefined;
      }
      const lsSlFailed =
        v != null &&
        signalSrcTime != null &&
        slFailSet.has(`${candleOpenContainingTime(candles, signalSrcTime) ?? signalSrcTime}|${v}`);
      /** 이 봉에서 선확(fr) 방향 (협상 구간에서는 반대 방향 제외) */
      let frHit: 'LONG' | 'SHORT' | null = null;
      for (const [frTime, frDir] of frTriggered) {
        if (t <= frTime && frTime < rangeEnd) {
          if (chartBias && ci >= negotiateFromCi && frDir !== chartBias) break;
          frHit = frDir;
          break;
        }
      }
      /** 구조 로켓이 겹치는 봉 */
      let rkHit: 'LONG' | 'SHORT' | null = null;
      for (const rk of structureRocketsVisible) {
        if (t <= rk.time && rk.time < rangeEnd) {
          if (chartBias && ci >= negotiateFromCi && rk.direction !== chartBias) break;
          rkHit = rk.direction;
          break;
        }
      }
      /**
       * 확정/RSI 방향(`v`)과 구조 로켓(`rkHit`)은 **서로 다른 마커로 동시 표시**(한쪽만 쓰지 않음).
       * 선확(fr)과 확정이 겹치면 기존처럼 `v` 우선.
       */
      const finalDir: 'LONG' | 'SHORT' | undefined =
        frHit && v && frHit !== v ? v : frHit ?? v;
      const slBlock =
        finalDir != null &&
        v != null &&
        finalDir === v &&
        signalSrcTime != null &&
        slFailSet.has(`${candleOpenContainingTime(candles, signalSrcTime) ?? signalSrcTime}|${v}`);
      let lsTextLong = 'L';
      let lsTextShort = 'S';
      if (markerMetaA && analysisMatches) {
        if (
          typeof analysisConfidence === 'number' &&
          t === effSignalLast &&
          chartBias === 'LONG' &&
          finalDir === 'LONG'
        ) {
          lsTextLong = `L·${Math.round(analysisConfidence)}`;
        } else if (
          typeof sigRsi?.totalScore === 'number' &&
          signalSrcTime === t &&
          v === 'LONG' &&
          finalDir === 'LONG'
        ) {
          lsTextLong = `L·${Math.round(Number(sigRsi.totalScore))}`;
        }
        if (
          typeof analysisConfidence === 'number' &&
          t === effSignalLast &&
          chartBias === 'SHORT' &&
          finalDir === 'SHORT'
        ) {
          lsTextShort = `S·${Math.round(analysisConfidence)}`;
        } else if (
          typeof sigRsi?.totalScore === 'number' &&
          signalSrcTime === t &&
          v === 'SHORT' &&
          finalDir === 'SHORT'
        ) {
          lsTextShort = `S·${Math.round(Number(sigRsi.totalScore))}`;
        }
      }
      if (layerRocket && rkHit === 'LONG') {
        markers.push({
          time: t as UTCTimestamp,
          position: 'belowBar',
          shape: 'circle',
          color: '#16A34A',
          text: '🚀',
          size: lsRocketMarkerSize,
        });
      }
      if (layerRocket && rkHit === 'SHORT') {
        markers.push({
          time: t as UTCTimestamp,
          position: 'aboveBar',
          shape: 'circle',
          color: '#DC2626',
          text: '📉',
          size: lsRocketMarkerSize,
        });
      }
      const htfBoostRows = higherTfByBar.get(t) ?? [];
      if (layerRocket && htfBoostRows.length > 0) {
        const hasLong = htfBoostRows.some((r) => r.direction === 'LONG');
        const hasShort = htfBoostRows.some((r) => r.direction === 'SHORT');
        const sameAsLocal = (hasLong && rkHit === 'LONG') || (hasShort && rkHit === 'SHORT');
        const txt = hasLong && !hasShort ? (sameAsLocal ? '🚀⚡+' : '🚀⚡') : hasShort && !hasLong ? (sameAsLocal ? '📉⚡+' : '📉⚡') : '⚡↔';
        markers.push({
          time: t as UTCTimestamp,
          position: hasShort && !hasLong ? 'aboveBar' : 'belowBar',
          shape: 'square',
          color: hasLong && !hasShort ? '#fbbf24' : hasShort && !hasLong ? '#fb923c' : '#a78bfa',
          text: txt,
          size: 1,
        });
      }
      if (layerLs && finalDir === 'LONG' && !slBlock) {
        markers.push({
          time: t as UTCTimestamp,
          position: 'belowBar',
          shape: 'circle',
          color: '#22C55E',
          text: lsTextLong,
        });
      }
      if (layerLs && finalDir === 'SHORT' && !slBlock) {
        markers.push({
          time: t as UTCTimestamp,
          position: 'aboveBar',
          shape: 'circle',
          color: '#EF4444',
          text: lsTextShort,
        });
      }
    }
    const afFusion = analysisMatches ? (analysis as AnalyzeResponse).aiFusionSignal : undefined;
    const smcAiFusionHudOn = uiMode === 'SMC_DESK' && settings.chartSmcDeskAiFusionPanel !== false;
    const afShowOnChart =
      afFusion &&
      candles.length > 0 &&
      (afFusion.verdict === 'LONG' ||
        afFusion.verdict === 'SHORT' ||
        (smcAiFusionHudOn && afFusion.verdict === 'WATCH')) &&
      (afFusion.tier !== 'watch' || smcAiFusionHudOn);
    if (afShowOnChart && afFusion) {
      const lt = candles[candles.length - 1].time as number;
      const dup = markers.some((m) => Number(m.time) === lt && String(m.text || '').startsWith('AI '));
      if (!dup) {
        const pos =
          afFusion.verdict === 'LONG' ? 'belowBar' : afFusion.verdict === 'SHORT' ? 'aboveBar' : 'belowBar';
        const col =
          afFusion.tier === 'confirmed'
            ? '#F59E0B'
            : afFusion.tier === 'likely'
              ? '#38BDF8'
              : smcAiFusionHudOn
                ? '#94A3B8'
                : '#64748B';
        markers.push({
          time: lt as UTCTimestamp,
          position: pos,
          shape: 'circle',
          color: col,
          text: afFusion.markerLabel,
          size: smcAiFusionHudOn && afFusion.tier === 'confirmed' ? 2 : 1,
        });
      }
    }
    const lastBar = candles[candles.length - 1];
    if (SHOW_FRONT_RUN_ON_CHART && layerFr && lastBar && frontRun && frontRun.state !== 'NO_SIGNAL') {
      const frStateKo =
        frontRun.state === 'TRIGGERED'
          ? '확정'
          : frontRun.state === 'READY'
            ? '준비'
            : frontRun.state === 'WATCH'
              ? '관찰'
              : frontRun.state === 'INVALID'
                ? '무효'
                : '신호없음';
      const frDirKo =
        frontRun.direction === 'LONG'
          ? '롱'
          : frontRun.direction === 'SHORT'
            ? '숏'
            : '';
      const frColor =
        frontRun.state === 'TRIGGERED'
          ? (frontRun.direction === 'LONG' ? '#16A34A' : '#DC2626')
          : frontRun.state === 'READY'
            ? '#F59E0B'
            : frontRun.state === 'WATCH'
              ? '#38BDF8'
              : '#94A3B8';
      const frText = `선반영 ${frStateKo}${frDirKo ? ` ${frDirKo}` : ''}`;
      const frShape: 'arrowUp' | 'arrowDown' | 'circle' =
        frontRun.state === 'TRIGGERED'
          ? (frontRun.direction === 'SHORT' ? 'arrowDown' : 'arrowUp')
          : 'circle';
      const frDirOk =
        frontRun.direction === 'LONG' || frontRun.direction === 'SHORT'
          ? !chartBias || frontRun.direction === chartBias
          : true;
      if (frDirOk) {
        markers.push({
          time: lastBar.time as UTCTimestamp,
          position: frontRun.direction === 'SHORT' ? 'aboveBar' : 'belowBar',
          shape: frShape,
          color: frColor,
          text: frText,
        });
      }
    }
    // 과거(2017~) 히스토리 표시를 위해 TF별 로드 캔들 수 기준으로 보관 상한 확장
    const keepCap = Math.max(400, candles.length * 2);
    if (locked.size > keepCap) {
      const times = [...locked.keys()].sort((a, b) => a - b);
      for (let i = 0; i < times.length - keepCap; i++) locked.delete(times[i]);
    }
    if (rsiOnly.size > keepCap) {
      const times = [...rsiOnly.keys()].sort((a, b) => a - b);
      for (let i = 0; i < times.length - keepCap; i++) rsiOnly.delete(times[i]);
    }
    if (SHOW_FRONT_RUN_ON_CHART && frTriggered.size > keepCap) {
      const times = [...frTriggered.keys()].sort((a, b) => a - b);
      for (let i = 0; i < times.length - keepCap; i++) frTriggered.delete(times[i]);
    }
    if (SHOW_FRONT_RUN_ON_CHART && frTriggeredDetail.size > keepCap) {
      const times = [...frTriggeredDetail.keys()].sort((a, b) => a - b);
      for (let i = 0; i < times.length - keepCap; i++) frTriggeredDetail.delete(times[i]);
    }
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(persistKey);
        const all = raw ? JSON.parse(raw) as Record<string, { locked?: Array<[number, 'LONG' | 'SHORT']>; rsiOnly?: Array<[number, 'LONG' | 'SHORT']> }> : {};
        all[storeKey] = {
          locked: [...locked.entries()],
          rsiOnly: [...rsiOnly.entries()],
        };
        window.localStorage.setItem(persistKey, JSON.stringify(all));
      } catch {}
    }
    const persistedRocket = mergeRocketPersistence(
      storeKey,
      structureRocketsVisible,
      timeframe,
      slFailSet,
      candles
    );
    const crossTfRockets = collectCrossTfMappedRockets(symbol, candles, storeKey, timeframe);
    const mergedRocketHud = mergePersistedRocketRows(persistedRocket, crossTfRockets);
    setLsRocketHud(buildLsRocketHud(filterLsRocketsBySlFailures(mergedRocketHud, slFailSet, candles)));
    /**
     * 마커 레이어: 구조 로켓·L/S, 통합작도에서도 RSI 극단(🔥·💧) + 캔들분석 보조·하모닉·기관밴드(ST) 등 **다른 TF/모드와 동일하게** 켜짐(예전 `!ud` 차단 제거).
     * 통합 ⋈ 는 전역 시간 겹침으로 막지 않음.
     */
    /** 통합작도: RSI 과매수·과매도(🔥·💧) — 동일 레이어 내 중복 시간만 생략. SMC 데스크는 RSI 오버레이 OFF 시 생략 */
    if (
      ud &&
      unifiedMarkersOn &&
      effective.showRsi !== false &&
      analysisMatches &&
      analysis &&
      Array.isArray((analysis as AnalyzeResponse).indicators?.rsi)
    ) {
      const rsiArr = (analysis as AnalyzeResponse).indicators!.rsi!;
      const rsiExtras = buildRsiOverboughtOversoldMarkers(candles, rsiArr, { maxMarkers: 48, lookbackBars: 180 });
      const rsiOcc = new Set<number>();
      for (const m of rsiExtras) {
        const tm = Number(m.time);
        if (rsiOcc.has(tm)) continue;
        rsiOcc.add(tm);
        markers.push(m);
      }
    }
    if (layerAux && unifiedMarkersOn && analysisMatches && analysis) {
      const ac = analysis as AnalyzeResponse;
      const baseCap = Math.max(1, Math.min(48, candleAnalysisMarkerMax ?? 18));
      const maxTot = Math.min(520, baseCap);
      const extra = buildCandleAnalysisMarkers({
        analysis: analysis as AnalyzeResponse,
        candles,
        symbol,
        timeframe,
        maxTotal: maxTot,
        showTailong: effective.showTailongClose === true,
        showCandleScores: effective.showCandle === true,
        metaA: markerMetaA,
      });
      const candleAuxOcc = new Set<number>();
      for (const m of extra) {
        const tm = Number(m.time);
        if (candleAuxOcc.has(tm)) continue;
        candleAuxOcc.add(tm);
        markers.push({
          time: tm as UTCTimestamp,
          position: m.position,
          shape: m.shape,
          color: m.color,
          text: m.text,
          size: m.size,
        });
      }
    }
    if (analysisMatches && showHarmonic) {
      const ns = (analysis as AnalyzeResponse)?.engine?.nenStarChartMarkers as
        | Array<{ time: number; bias: 'bullish' | 'bearish'; candleConfirm: boolean }>
        | undefined;
      if (Array.isArray(ns)) {
        const harmOcc = new Set<number>();
        for (const row of ns) {
          if (!row?.candleConfirm) continue;
          const tm = Number(row.time);
          if (!Number.isFinite(tm) || tm <= 0 || harmOcc.has(tm)) continue;
          harmOcc.add(tm);
          markers.push({
            time: tm as UTCTimestamp,
            position: row.bias === 'bullish' ? 'belowBar' : 'aboveBar',
            shape: row.bias === 'bullish' ? 'arrowUp' : 'arrowDown',
            color: row.bias === 'bullish' ? '#22c55e' : '#ef4444',
            text: '',
          });
        }
      }
    }
    if (CHART_BAND_LINE_AND_TOUCH_ALWAYS_ON) {
      const safe = sanitizeChartCandlesForSeries(candles);
      if (safe.length >= 7) {
        const touchTierMask =
          settings.institutionalBandTouchTierMask ??
          tierMaskFromMinTier(
            settings.institutionalBandTouchMinTier === 'A' ||
              settings.institutionalBandTouchMinTier === 'B' ||
              settings.institutionalBandTouchMinTier === 'C'
              ? settings.institutionalBandTouchMinTier
              : 'B',
          );
        const overlayList =
          analysisMatches && (analysis as AnalyzeResponse)?.overlays
            ? (analysis as AnalyzeResponse).overlays
            : [];
        const ibMarks = computeInstitutionalBandInteractionMarkersUnion(
          safe,
          INSTITUTIONAL_BAND_DEFAULT_PERIOD,
          INSTITUTIONAL_BAND_DEFAULT_MULT,
          {
            minBarsBetween: institutionalBandTouchMinGapBars(timeframe),
            tierEnabled: {
              A: touchTierMask.A === true,
              B: touchTierMask.B === true,
              C: touchTierMask.C === true,
            },
            overlays: overlayList,
          },
        );
        for (const ev of ibMarks) {
          const tm = Number(ev.time);
          if (!Number.isFinite(tm)) continue;
          const list = ibTouchByBarTime.get(tm) ?? [];
          list.push(ev);
          ibTouchByBarTime.set(tm, list);
          const isLong = ev.verdict === 'LONG';
          const st = institutionalBandTouchMarkerStyle(ev);
          markers.push({
            time: tm as UTCTimestamp,
            position: isLong ? 'belowBar' : 'aboveBar',
            shape: isLong ? 'arrowUp' : 'arrowDown',
            color: st.color,
            text: formatInstitutionalBandTouchMarkerChartText(ev),
            size: st.size,
          });
        }
      }
    }
    /** 통합 롱·숏(`buildUnifiedLsSignal`) — 패널과 동일 프로필, 최신 봉에 ⋈ 마커 */
    if (unifiedMarkersOn && analysisMatches && analysis) {
      const safeFusion = sanitizeChartCandlesForSeries(signalCandles.length ? signalCandles : candles);
      if (safeFusion.length >= 1) {
        const lastC = safeFusion[safeFusion.length - 1];
        const lt = Number(lastC.time);
        if (Number.isFinite(lt) && lt > 0) {
          const profile = buildProfileFromPanelFeatures(DEFAULT_UNIFIED_PANEL_FEATURES, {
            showRsiIndicators: showRsi,
            showMacdPanel: showMacdPanel,
            showBbPanel: showBbPanel,
          });
          const fusion = buildUnifiedLsSignal(
            analysis as AnalyzeResponse,
            profile,
            safeFusion.length >= 30 ? { candles: safeFusion } : undefined,
          );
          const dir = fusion.direction;
          const gk = SIGNAL_GRADE_LABEL_KO[fusion.grade];
          const shortG =
            gk === '확정'
              ? '확'
              : gk === '우세'
                ? '우'
                : gk === '관찰'
                  ? '관'
                  : gk === '상충'
                    ? '충'
                    : '약';
          const edgeR = Math.round(fusion.edge);
          let text: string;
          let color: string;
          let pos: 'aboveBar' | 'belowBar' = 'aboveBar';
          if (dir === 'LONG') {
            text = `⋈L·${shortG}·${edgeR}`;
            color = '#4ade80';
            pos = 'belowBar';
          } else if (dir === 'SHORT') {
            text = `⋈S·${shortG}·${edgeR}`;
            color = '#fb7185';
            pos = 'aboveBar';
          } else {
            text = `⋈↔·${shortG}·${edgeR}`;
            color = '#a78bfa';
            pos = 'aboveBar';
          }
          const hasLast = markers.some((m) => Number(m.time) === lt);
          const fusionPos = hasLast ? (pos === 'belowBar' ? 'aboveBar' : 'belowBar') : pos;
          markers.push({
            time: lt as UTCTimestamp,
            position: fusionPos,
            shape: 'square',
            color,
            text,
            size: 1,
          });
        }
      }
    }
    const detailMap = new Map<number, string[]>();
    for (const m of markers) {
      const tm = Number(m.time);
      if (!detailMap.has(tm)) detailMap.set(tm, []);
      const ibList = ibTouchByBarTime.get(tm);
      const tx = String((m as { text?: string }).text ?? '').trim();
      const ibEv =
        ibList?.find((ev) => formatInstitutionalBandTouchMarkerChartText(ev) === tx) ?? ibList?.[0];
      const useIbDetail =
        ibEv != null && markerLooksLikeInstitutionalBandTouch(m as { shape?: string; text?: string });
      const line = useIbDetail
        ? chartMarkerDetailLine({
            text: formatInstitutionalBandTouchMarkerDetailText(ibEv),
            position: m.position,
          })
        : chartMarkerDetailLine(m as { text: string; position: string });
      detailMap.get(tm)!.push(line);
    }
    if (analysisMatches && afFusion && candles.length > 0) {
      const narr = (afFusion.narrativeLlm && afFusion.narrativeLlm.trim()) || afFusion.narrative;
      if (narr) {
        const tm = Number(candles[candles.length - 1].time);
        if (!detailMap.has(tm)) detailMap.set(tm, []);
        detailMap.get(tm)!.unshift(`[AI 종합] ${narr}`);
      }
    }
    /** B 클릭 패널: 같은 봉에 구조 로켓 + 밴드 접촉이 같이 있으면 설명을 둘 다 넣음(마커 배열 누락 대비 소스 보강) */
    const hasRocketDetailLine = (arr: string[]) =>
      arr.some((ln) => ln.includes('구조 롱 로켓') || ln.includes('구조 숏 로켓'));
    for (const rk of structureRocketsVisible) {
      const tm = Number(rk.time);
      if (!Number.isFinite(tm)) continue;
      if (!detailMap.has(tm)) detailMap.set(tm, []);
      const arr = detailMap.get(tm)!;
      if (!hasRocketDetailLine(arr)) {
        arr.push(
          chartMarkerDetailLine({
            text: rk.direction === 'LONG' ? '🚀' : '📉',
            position: rk.direction === 'LONG' ? 'belowBar' : 'aboveBar',
          }),
        );
      }
    }
    for (const [tm, rows] of higherTfByBar.entries()) {
      if (!Number.isFinite(tm) || rows.length === 0) continue;
      if (!detailMap.has(tm)) detailMap.set(tm, []);
      const arr = detailMap.get(tm)!;
      const tfText = rows
        .map((r) => `${r.sourceTf} ${r.direction === 'LONG' ? '🚀' : '📉'}`)
        .join(', ');
      const line = chartMarkerDetailLine({
        text: `상위TF 강화 ${tfText}`,
        position: rows.some((r) => r.direction === 'SHORT') ? 'aboveBar' : 'belowBar',
      });
      if (!arr.includes(line)) arr.push(line);
    }
    for (const [tm, ibEvs] of ibTouchByBarTime) {
      if (!Number.isFinite(tm)) continue;
      if (!detailMap.has(tm)) detailMap.set(tm, []);
      const arr = detailMap.get(tm)!;
      for (const ibEv of ibEvs) {
        const line = chartMarkerDetailLine({
          text: formatInstitutionalBandTouchMarkerDetailText(ibEv),
          position: ibEv.verdict === 'LONG' ? 'belowBar' : 'aboveBar',
        });
        if (!arr.includes(line)) arr.push(line);
      }
    }
    for (const [tm, arr] of detailMap.entries()) {
      if (arr.length > 0) detailMap.set(tm, sortBarSignalDetailLines(arr));
    }
    /** 통합작도: ZL 요약은 상단 칩만 — 캔들 네모 마커는 생략(로켓 🚀/📉만 캔들에 표시) */
    markerBarDetailRef.current = detailMap;
    const stableMarkers = CHART_DEV_ZONES_MSBOB_ONLY ? [] : stabilizeSignalMarkers(markers as ChartMarkerRow[]);
    markersApi.setMarkers(stableMarkers as any);
    {
      const tfNorm = normalizeChartTimeframe(String(timeframe || ''));
      const is1mTf = tfNorm === '1m';
      const tfAllowedHtf =
        tfNorm === '1h' || tfNorm === '4h' || tfNorm === '1d' || tfNorm === '1w' || tfNorm === '1M';
      const s = String(symbol || '').toUpperCase();
      const symbolAllowed = s.startsWith('BTC') || s.startsWith('ETH');
      if (!symbolAllowed) {
        console.info('[telegram-auto] skipped by market filter', {
          symbol,
          timeframe,
          tfNorm,
          symbolAllowed,
        });
        telegramAutoStatusRef.current = {
          updatedAt: Date.now(),
          marketOk: false,
          symbol,
          timeframe,
          candidateCount: 0,
          skip: 'market',
        };
        telegramAutoLastIntendedPayloadRef.current = null;
      } else {
      const analysisOverlays = ((analysis as AnalyzeResponse | null)?.overlays ?? []) as OverlayItem[];
      const briefOverlayPool = [...(screenOverlays as OverlayItem[]), ...analysisOverlays];
      const lsPlan = (analysis as AnalyzeResponse | null)?.lsSignalPlan;
      const baseEntry = Number.parseFloat(String((analysis as AnalyzeResponse | null)?.entry ?? ''));
      const baseStop = Number.parseFloat(String((analysis as AnalyzeResponse | null)?.stopLoss ?? ''));
      const baseTargets = (((analysis as AnalyzeResponse | null)?.targets ?? []) as Array<string | number>)
        .map((v) => Number.parseFloat(String(v)))
        .filter((v) => Number.isFinite(v))
        .slice(0, 3);
      const fmtP = (v: number | null | undefined) =>
        typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '-';
      const tfTag = `[${String(symbol).toUpperCase().startsWith('BTC') ? '#BTC' : '#ETH'} ${String(timeframe).toUpperCase()}]`;
      const curBarTime = Number(lastBar?.time ?? 0);
      const prevBarTime = Number(candles[candles.length - 2]?.time ?? 0);
      const isRecentSignal = (t: number | null | undefined) =>
        typeof t === 'number' &&
        Number.isFinite(t) &&
        t > 0 &&
        (t === curBarTime || (prevBarTime > 0 && t >= prevBarTime && t <= curBarTime));
      const lastK = Math.min(3, Math.max(0, candles.length));
      const recentRocketBarTimes = new Set<number>();
      for (let i = candles.length - lastK; i < candles.length; i++) {
        if (candles[i]) recentRocketBarTimes.add(candles[i].time as number);
      }
      const isRecentSignalRocket = (t: number | null | undefined) => {
        if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return false;
        if (isRecentSignal(t)) return true;
        return recentRocketBarTimes.has(t);
      };

      if (is1mTf && !settings.telegramAuto1mEnabled) {
        telegramAutoStatusRef.current = {
          updatedAt: Date.now(),
          marketOk: true,
          symbol,
          timeframe,
          candidateCount: 0,
          skip: 'disabled',
        };
        telegramAutoLastIntendedPayloadRef.current = null;
      } else if (is1mTf && settings.telegramAuto1mEnabled) {
        const m1Lines: string[] = [];
        const m1Tags: string[] = [];
        const rkM1 = [...structureRocketsVisible]
          .filter((r) => isRecentSignalRocket(Number(r.time)))
          .sort((a, b) => Number(b.time) - Number(a.time))[0];
        if (rkM1 && (rkM1.direction === 'LONG' || rkM1.direction === 'SHORT')) {
          const src = String((rkM1 as any)?.source || '');
          m1Lines.push(`🚀 구조로켓 ${rkM1.direction === 'LONG' ? '롱' : '숏'} (${src || 'struct'})`);
          m1Tags.push('ROCKET');
        }
        const ibM1 = ibTouchByBarTime.get(curBarTime) ?? [];
        if (ibM1.length) {
          const head = formatInstitutionalBandTouchMarkerDetailText(ibM1[0]);
          m1Lines.push(`📊 기관밴드 ${head.length > 140 ? `${head.slice(0, 137)}…` : head}`);
          m1Tags.push('BAND');
        }
        let hotM1 = false;
        if (hotZoneCandleHighlightTimes?.has(curBarTime)) hotM1 = true;
        else {
          for (const oid of overlayLabelProximityIds) {
            const lu = String(oid).toLowerCase();
            if (lu.includes('hotzone') || lu.includes('hot-zone')) {
              hotM1 = true;
              break;
            }
          }
        }
        if (hotM1) {
          m1Lines.push('🔥 HotZone·라벨 근접(터치/근접)');
          m1Tags.push('HOTZONE');
        }
        const proxM1 = lineZoneProximityByTime.get(curBarTime);
        if (proxM1) {
          m1Lines.push(`📍 존·선 접근 (${proxM1})`);
          m1Tags.push('APPROACH');
        }
        let obLbl = '';
        for (const o of overlayDevEnhanced as OverlayItem[]) {
          const k = String(o.kind || '').toLowerCase();
          if (k !== 'ob') continue;
          const t1n = o.time1 != null ? Number(o.time1) : NaN;
          const t2n = o.time2 != null ? Number(o.time2) : t1n;
          if (!Number.isFinite(t1n)) continue;
          const loT = Math.min(t1n, t2n);
          const hiT = Math.max(t1n, t2n);
          if (curBarTime < loT || curBarTime > hiT) continue;
          const lbl = String(o.label || '');
          if (/확인|확정|confirm|mitigat|고정/i.test(lbl)) {
            obLbl = lbl.slice(0, 120);
            break;
          }
        }
        const sphM1 = structurePhaseCandleByTime?.get(curBarTime);
        const structHold = sphM1?.phase === 'confirmed';
        if (obLbl) {
          m1Lines.push(`📌 OB·존 확정 라벨: ${obLbl}`);
          m1Tags.push('OB_CONFIRM');
        } else if (structHold && sphM1) {
          m1Lines.push(`📌 구조 확정(종가 유지): ${String(sphM1.tag || '').toUpperCase()}`);
          m1Tags.push('STRUCT_HOLD');
        }
        if (m1Lines.length === 0) {
          telegramAutoStatusRef.current = {
            updatedAt: Date.now(),
            marketOk: true,
            symbol,
            timeframe,
            candidateCount: 0,
            skip: 'no_candidate',
          };
          telegramAutoLastIntendedPayloadRef.current = null;
          console.info('[telegram-auto] 1m no targeted signals', { symbol, curBarTime });
        } else {
          m1Tags.sort();
          const m1EventKey = `M1_PACK|${symbol}|${tfNorm}|${curBarTime}|${m1Tags.join('+')}`;
          const m1EventText = `${tfTag} [1분 신호] ${m1Tags.join('·')}`;
          const { cpLine: cpM1, hotzoneLine: hzM1 } = extractTelegramCpHotLinesFromOverlays(briefOverlayPool);
          const lastCloseM1 = Number(lastBar?.close ?? 0);
          const zoneBandExtra = extractTelegramZoneBandSummaryLines(briefOverlayPool, lastCloseM1);
          const builtBriefM1 = [
            m1EventText,
            ...m1Lines,
            ...zoneBandExtra,
            `가격: ${Number(lastBar?.close ?? 0).toLocaleString()}`,
            cpM1,
            hzM1,
            `시간: ${new Date().toLocaleString('ko-KR')}`,
          ]
            .filter(Boolean)
            .join('\n');
          telegramAutoLastIntendedPayloadRef.current = {
            brief: builtBriefM1,
            eventKey: m1EventKey,
            eventType: 'M1_PACK',
            symbol,
            timeframe,
            at: Date.now(),
          };
          telegramAutoStatusRef.current = {
            updatedAt: Date.now(),
            marketOk: true,
            symbol,
            timeframe,
            candidateCount: m1Lines.length,
            skip: 'ready',
            top: null,
            selected: { type: 'M1_PACK', key: m1EventKey },
            cooldownLeftMs: null,
          };
          const cooldownMsM1 = TELEGRAM_1M_TEXT_COOLDOWN_MS;
            const nowMsM1 = Date.now();
            const prevM1 = telegramLastSignalRef.current;
            if (!prevM1 || prevM1.key !== m1EventKey || nowMsM1 - prevM1.at > cooldownMsM1) {
              telegramLastSignalRef.current = { key: m1EventKey, at: nowMsM1 };
              void (async () => {
                try {
                /** 1m 자동 알림: 감지 후 **항상** 풀프레임·캔버스 캡처 시도 → 텔레(이미지 실패 시 본문만) */
                let imageDataUrl: string | undefined;
                try {
                  chartRef.current?.timeScale?.().scrollToRealTime?.();
                } catch {}
                await new Promise<void>((r) => requestAnimationFrame(() => r()));
                const hostPng = await captureTelegramChartFramePngDataUrl(frameRef.current);
                const snapCanvas = chartRef.current?.takeScreenshot?.(true);
                const lwPng = cropTelegramSignalCanvasDataUrl(snapCanvas);
                imageDataUrl = hostPng || lwPng;
                const authM1 = await getTelegramSignalAuthHeaders();
                const res = await fetch('/api/telegram/signal-capture', {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json', ...authM1 },
                  body: JSON.stringify({
                    text: builtBriefM1,
                    imageDataUrl,
                    symbol,
                    timeframe,
                    eventKey: m1EventKey,
                  }),
                });
                if (!res.ok) {
                  const errText = await res.text().catch(() => '');
                  console.error('[telegram-auto] 1m send failed', {
                    eventKey: m1EventKey,
                    status: res.status,
                    body: errText,
                  });
                } else {
                  console.info('[telegram-auto] 1m sent', { eventKey: m1EventKey, image: Boolean(imageDataUrl) });
                }
              } catch (sendErr) {
                console.error('[telegram-auto] 1m send exception', {
                  eventKey: m1EventKey,
                  error: sendErr instanceof Error ? sendErr.message : String(sendErr),
                });
              }
            })();
          } else {
            console.info('[telegram-auto] 1m cooldown skip', {
              eventKey: m1EventKey,
              prevKey: prevM1?.key ?? null,
              elapsedMs: nowMsM1 - (prevM1?.at ?? nowMsM1),
              cooldownMs: cooldownMsM1,
            });
          }
        }
      } else if (!tfAllowedHtf) {
        console.info('[telegram-auto] skipped non-HTF timeframe', { symbol, timeframe, tfNorm });
        telegramAutoStatusRef.current = {
          updatedAt: Date.now(),
          marketOk: false,
          symbol,
          timeframe,
          candidateCount: 0,
          skip: 'market',
        };
        telegramAutoLastIntendedPayloadRef.current = null;
      } else {
      const confidenceNum =
        typeof (analysis as AnalyzeResponse | null)?.confidence === 'number'
          ? Math.round((analysis as AnalyzeResponse).confidence)
          : null;
      const strongRocketSource = new Set([
        'bos_retest_both',
        'bos_retest_settlement',
        'struct_choch_break',
      ]);
      const latestRocketForAlert = [...structureRocketsForTelegram]
        .filter((r) => strongRocketSource.has(String((r as any)?.source || '')))
        .sort((a, b) => Number(b.time) - Number(a.time))[0];
      const latestHtfForAlert = [...higherTfRocketBoost]
        .sort((a, b) => Number(b.time) - Number(a.time))[0];
      let eventKey = '';
      let eventText = '';
      let eventType: 'ROCKET' | 'FR_READY' | 'FR_TRIGGERED' | 'WHALE_LOCKED_BU' | 'HTF_ZPACK' | '' = '';
      let rocketRowForPlan: (typeof latestRocketForAlert) | undefined;
      // 자동 정밀선별: 후보별 점수(합의/충돌/TF가중치)로 최상위 1건만 발송
      const frontRunSignalTime = Number(frontRun?.signalTime ?? 0);
      const isFrontRunTriggered =
        frontRun?.state === 'TRIGGERED' &&
        (frontRun?.direction === 'LONG' || frontRun?.direction === 'SHORT') &&
        isRecentSignal(frontRunSignalTime);
      const latestPx = Number(lastBar?.close ?? 0);
      const entryPxRaw = Number((lsPlan as any)?.entry ?? (analysis as AnalyzeResponse | null)?.frontRunSignal?.entry ?? NaN);
      const prepNearPctByTf =
        tfNorm === '1h' ? 0.0028 :
        tfNorm === '4h' ? 0.0036 :
        tfNorm === '1d' ? 0.0046 :
        tfNorm === '1w' ? 0.0048 :
        tfNorm === '1M' ? 0.0052 :
        0.0052;
      const isNearEntryReady =
        Number.isFinite(entryPxRaw) &&
        entryPxRaw > 0 &&
        Number.isFinite(latestPx) &&
        latestPx > 0 &&
        Math.abs(latestPx - entryPxRaw) / entryPxRaw <= prepNearPctByTf;
      const isFrontRunReadyNear =
        frontRun?.state === 'READY' &&
        (frontRun?.direction === 'LONG' || frontRun?.direction === 'SHORT') &&
        isRecentSignal(Number(frontRunSignalTime || curBarTime)) &&
        isNearEntryReady;
      const latestWhaleLockedBu = [...briefOverlayPool]
        .filter((o) => {
          const id = String(o?.id || '');
          const label = String(o?.label || '');
          const bullishWhale = id.startsWith('whale-auto-bu-ob') || id.startsWith('whale-auto-bu-bb');
          const locked = label.includes('(고정)');
          return bullishWhale && locked;
        })
        .sort((a, b) => Number(b?.time1 ?? b?.x1 ?? 0) - Number(a?.time1 ?? a?.x1 ?? 0))[0];
      const whaleLockedBuTime = Number(latestWhaleLockedBu?.time1 ?? latestWhaleLockedBu?.x1 ?? 0);
      const isWhaleLockedBuRecent = isRecentSignalRocket(whaleLockedBuTime);
      const aiFusion = (analysis as AnalyzeResponse | null)?.aiFusionSignal;
      const aiSide = aiFusion?.verdict === 'LONG' || aiFusion?.verdict === 'SHORT' ? aiFusion.verdict : null;
      const aiTier = String(aiFusion?.tier || '').toLowerCase();
      const frConfidence = Number(((analysis as AnalyzeResponse | null)?.frontRunSignal as any)?.confidence ?? 0);
      const frDirection = frontRun?.direction === 'LONG' || frontRun?.direction === 'SHORT' ? frontRun.direction : null;
      const mtfAlign = Number((analysis as AnalyzeResponse | null)?.mtf?.alignmentScore ?? 50);
      const precisionEntryOn = isAiMode && whalePrecisionEntryEnabled;
      const precisionAlertOn = isAiMode && whalePrecisionAlertEnabled;
      const timeframeFloor =
        tfNorm === '1h' ? 74 :
        tfNorm === '4h' ? 72 :
        tfNorm === '1d' ? 70 :
        tfNorm === '1w' ? 69 :
        tfNorm === '1M' ? 65 :
        68;
      const sideBiasBonus = (dir: 'LONG' | 'SHORT') => {
        if (!precisionEntryOn) return 0;
        let v = 0;
        if (aiSide && aiSide === dir) v += aiTier === 'confirmed' ? 10 : aiTier === 'likely' ? 6 : 3;
        if (aiSide && aiSide !== dir) v -= aiTier === 'confirmed' ? 14 : 8;
        if (frDirection && frDirection !== dir && (frontRun?.state === 'READY' || frontRun?.state === 'TRIGGERED')) v -= 10;
        if (mtfAlign >= 78) v += 4;
        if (mtfAlign <= 42) v -= 4;
        return v;
      };
      type AlertCandidate = {
        type: 'ROCKET' | 'FR_READY' | 'FR_TRIGGERED' | 'WHALE_LOCKED_BU';
        key: string;
        text: string;
        score: number;
        direction: 'LONG' | 'SHORT';
        rocket?: typeof latestRocketForAlert;
      };
      const candidates: AlertCandidate[] = [];
      if (isFrontRunReadyNear && frDirection) {
        const score = 70 + Math.min(12, frConfidence * 0.16) + sideBiasBonus(frDirection);
        candidates.push({
          type: 'FR_READY',
          key: `FR_READY_NEAR|${symbol}|${timeframe}|${frDirection}|${curBarTime}`,
          text: `${tfTag} [준비알림] ${frDirection === 'LONG' ? '🟡 LONG READY(진입 근접)' : '🟡 SHORT READY(진입 근접)'}`,
          score,
          direction: frDirection,
        });
      }
      if (isFrontRunTriggered && frDirection) {
        const score = 78 + Math.min(16, frConfidence * 0.2) + sideBiasBonus(frDirection);
        candidates.push({
          type: 'FR_TRIGGERED',
          key: `FR_TRIGGERED|${symbol}|${timeframe}|${frDirection}|${frontRunSignalTime}`,
          text: `${tfTag} [선행트리거] ${frDirection === 'LONG' ? '🚀 LONG' : '📉 SHORT'}`,
          score,
          direction: frDirection,
        });
      }
      if (latestWhaleLockedBu && isWhaleLockedBuRecent) {
        const id = String(latestWhaleLockedBu.id || '');
        const isCoreOb = id.startsWith('whale-auto-bu-ob');
        const score = (isCoreOb ? 76 : 72) + sideBiasBonus('LONG');
        candidates.push({
          type: 'WHALE_LOCKED_BU',
          key: `WHALE_LOCKED_BU|${symbol}|${timeframe}|${id}|${whaleLockedBuTime}`,
          text: `${tfTag} ${isCoreOb ? '[매집핵심 고정]' : '[매집준비 고정]'} 🟢 LONG DEFENSE`,
          score,
          direction: 'LONG',
        });
      }
      if (
        latestRocketForAlert &&
        (latestRocketForAlert.direction === 'LONG' || latestRocketForAlert.direction === 'SHORT') &&
        isRecentSignalRocket(Number(latestRocketForAlert.time))
      ) {
        const dir = latestRocketForAlert.direction;
        const source = String((latestRocketForAlert as any)?.source || '');
        const sourceBoost =
          source === 'bos_retest_both' ? 11 :
          source === 'bos_retest_settlement' ? 8 :
          source === 'struct_choch_break' ? 6 :
          2;
        const score = 68 + sourceBoost + (confidenceNum != null ? Math.min(12, confidenceNum * 0.12) : 0) + sideBiasBonus(dir);
        candidates.push({
          type: 'ROCKET',
          key: `ROCKET|${symbol}|${timeframe}|${dir}|${Number(latestRocketForAlert.time)}`,
          text: `${tfTag} [구조로켓] ${dir === 'LONG' ? '🚀 LONG' : '📉 SHORT'}`,
          score,
          direction: dir,
          rocket: latestRocketForAlert,
        });
      }
      if (
        latestHtfForAlert &&
        (latestHtfForAlert.direction === 'LONG' || latestHtfForAlert.direction === 'SHORT') &&
        isRecentSignalRocket(Number(latestHtfForAlert.time))
      ) {
        const dir = latestHtfForAlert.direction;
        const tfBoost =
          latestHtfForAlert.sourceTf === '1d' ? 5 :
          latestHtfForAlert.sourceTf === '1w' ? 7 :
          8;
        const score = 62 + tfBoost + sideBiasBonus(dir);
        candidates.push({
          type: 'ROCKET',
          key: `ROCKET_HTF|${symbol}|${timeframe}|${dir}|${Number(latestHtfForAlert.time)}|${latestHtfForAlert.sourceTf}`,
          text: `${tfTag} [상위TF·구조로켓] ${String(latestHtfForAlert.sourceTf).toUpperCase()} ${dir === 'LONG' ? '🚀' : '📉'} ${dir}`,
          score,
          direction: dir,
        });
      }
      const selected = candidates
        .filter((c) => !precisionAlertOn || c.score >= timeframeFloor)
        .sort((a, b) => b.score - a.score)[0];
      if (selected) {
        eventType = selected.type;
        eventKey = selected.key;
        eventText = selected.text;
        rocketRowForPlan = selected.rocket;
      } else if (precisionAlertOn && candidates.length > 0) {
        console.info('[telegram-auto] candidates below floor', {
          symbol,
          timeframe,
          floor: timeframeFloor,
          candidates: candidates.map((c) => ({ key: c.key, score: Math.round(c.score * 10) / 10 })),
        });
      }
      const htfZOnlyCdMs = tfNorm === '1h' || tfNorm === '4h' ? 300_000 : 600_000;
      let htfZoneExtraLines: string[] = [];
      if (settings.telegramHtfZonePackEnabled !== false) {
        const htfSealedOn = settings.telegramHtfSealedBarOnly !== false;
        const sealedTime = htfSealedOn && prevBarTime > 0 ? prevBarTime : curBarTime;
        const sealedC = candles.find((c) => Number(c.time) === sealedTime);
        if (sealedC) {
          const hi = Number(sealedC.high);
          const lo = Number(sealedC.low);
          const htfZTags: string[] = [];
          const zLines: string[] = [];
          const hotListed = hotZoneCandleHighlightTimes?.has(sealedTime) === true;
          const hotPool = htfCandleTouchesHotZoneInPool(briefOverlayPool, { high: hi, low: lo });
          if (hotListed || hotPool) {
            zLines.push('🔥 HotZone (마감봉·가격대 겹침/핫봉)');
            htfZTags.push('HOTZONE');
          }
          const ibHtf = ibTouchByBarTime.get(sealedTime) ?? [];
          if (ibHtf.length) {
            const head = formatInstitutionalBandTouchMarkerDetailText(ibHtf[0]);
            zLines.push(`📊 기관밴드(초록/빨강) ${head.length > 160 ? `${head.slice(0, 157)}…` : head}`);
            htfZTags.push('BAND');
          }
          if (htfCandleTouchesSupplyDemandStrongInPool(briefOverlayPool, { high: hi, low: lo })) {
            zLines.push('🧱 수·공급/강한존 봉접촉(초록·빨강·면대)');
            htfZTags.push('ZONE_SR');
          }
          const proxHtf = lineZoneProximityByTime.get(sealedTime);
          if (proxHtf) {
            zLines.push(`📍 존·선 접근 (${proxHtf})`);
            htfZTags.push('APPROACH');
          }
          const spHtf = structurePhaseCandleByTime?.get(sealedTime);
          if (spHtf?.phase === 'confirmed') {
            zLines.push(`✅ 구조·마감 안착 확정 ${spHtf.tag} ${spHtf.bias === 'bullish' ? '↑' : '↓'}`);
            htfZTags.push('SETTLE_OK');
          } else if (spHtf?.phase === 'failed') {
            zLines.push(`⛔ 구조·마감 무효(실패) ${spHtf.tag} ${spHtf.bias === 'bullish' ? '↑' : '↓'}`);
            htfZTags.push('SETTLE_FAIL');
          }
          if (htfZTags.length) {
            htfZoneExtraLines = zLines;
            if (eventKey) {
              eventKey = `${eventKey}|Z:${[...htfZTags].sort().join('+')}|t:${sealedTime}`;
            } else {
              eventKey = `HTF_ZPACK|${symbol}|${timeframe}|${sealedTime}|${[...htfZTags].sort().join('+')}`;
              eventText = `${tfTag} [HTF·존/밴드] ${htfZTags.join('·')}`;
              eventType = 'HTF_ZPACK';
            }
          }
        }
      }
        {
          const sortedC = [...candidates].sort((a, b) => b.score - a.score);
          const top = sortedC[0] ?? null;
          const belowFloor = !!(precisionAlertOn && sortedC.length > 0 && !eventKey);
          const floor = precisionAlertOn ? timeframeFloor : null;
          const topPasses =
            !!top && !precisionAlertOn
              ? true
              : !!(top && floor != null && top.score >= floor);
          const cdMs2 =
            eventType === 'FR_READY'
              ? 900_000
              : eventType === 'HTF_ZPACK'
                ? htfZOnlyCdMs
                : 180_000;
          const nowSnap = Date.now();
          const pr2 = telegramLastSignalRef.current;
          const isCooldown2 =
            !!eventKey && !!pr2 && pr2.key === eventKey && nowSnap - pr2.at <= cdMs2;
          let skip: 'ready' | 'no_candidate' | 'below_floor' | 'cooldown' | 'unknown' = 'unknown';
          if (!candidates.length && !eventKey) skip = 'no_candidate';
          else if (belowFloor) skip = 'below_floor';
          else if (eventKey && isCooldown2) skip = 'cooldown';
          else if (eventKey) skip = 'ready';
          else skip = 'no_candidate';
          telegramAutoStatusRef.current = {
            updatedAt: nowSnap,
            marketOk: true,
            symbol,
            timeframe,
            candidateCount: candidates.length,
            skip,
            top: top
              ? {
                  type: String(top.type),
                  score: Math.round(top.score * 10) / 10,
                  floor: floor ?? 0,
                  passes: topPasses,
                }
              : null,
            selected:
              eventKey && eventType
                ? { type: String(eventType), key: eventKey }
                : null,
            cooldownLeftMs:
              isCooldown2 && pr2
                ? Math.max(0, cdMs2 - (nowSnap - pr2.at))
                : null,
          };
        }
      if (eventKey) {
        const nowMs = Date.now();
        const prev = telegramLastSignalRef.current;
        const cooldownMs =
          eventType === 'FR_READY' ? 900_000 : eventType === 'HTF_ZPACK' ? htfZOnlyCdMs : 180_000;
        let builtBrief: string | null = null;
        try {
          const planFromLs = lsPlan
            ? {
                entry: Number(lsPlan.entry),
                stop: Number(lsPlan.stopLoss),
                tp1: Number(lsPlan.targets?.[0]),
                tp2: Number(lsPlan.targets?.[1]),
                tp3: Number(lsPlan.targets?.[2]),
              }
            : null;
          const planFromRocket =
            eventType === 'ROCKET' && rocketRowForPlan
              ? {
                  entry: Number((rocketRowForPlan as any)?.entryPrice),
                  stop: Number((rocketRowForPlan as any)?.stopLoss),
                  tp1: Number((rocketRowForPlan as any)?.takeProfit),
                  tp2: Number((rocketRowForPlan as any)?.takeProfit),
                  tp3: Number((rocketRowForPlan as any)?.takeProfit),
                }
              : null;
          const planFromFrontRun =
            (eventType === 'FR_TRIGGERED' || eventType === 'FR_READY') && frontRun
              ? {
                  entry: Number(((analysis as AnalyzeResponse | null)?.frontRunSignal as any)?.entry),
                  stop: Number(((analysis as AnalyzeResponse | null)?.frontRunSignal as any)?.stop),
                  tp1: Number(((analysis as AnalyzeResponse | null)?.frontRunSignal as any)?.tp1),
                  tp2: Number(((analysis as AnalyzeResponse | null)?.frontRunSignal as any)?.tp2),
                  tp3: Number(((analysis as AnalyzeResponse | null)?.frontRunSignal as any)?.tp3),
                }
              : null;
          const planBase = {
            entry: baseEntry,
            stop: baseStop,
            tp1: baseTargets[0],
            tp2: baseTargets[1] ?? baseTargets[0],
            tp3: baseTargets[2] ?? baseTargets[1] ?? baseTargets[0],
          };
          const plan =
            (planFromFrontRun && Number.isFinite(planFromFrontRun.entry) ? planFromFrontRun : null) ??
            (planFromLs && Number.isFinite(planFromLs.entry) ? planFromLs : null) ??
            (planFromRocket && Number.isFinite(planFromRocket.entry) ? planFromRocket : null) ??
            (Number.isFinite(planBase.entry) ? planBase : null);
          const { cpLine, hotzoneLine } = extractTelegramCpHotLinesFromOverlays(briefOverlayPool);
          const zonePackNote =
            settings.telegramHtfSealedBarOnly !== false
              ? '평가봉: 직전 마감(확정 중심)'
              : '평가봉: 형성 중(필터 약화)';
          builtBrief = [
            eventText,
            htfZoneExtraLines.length ? zonePackNote : null,
            ...htfZoneExtraLines,
            `가격: ${Number(lastBar?.close ?? 0).toLocaleString()}`,
            confidenceNum != null ? `신뢰도: ${confidenceNum}%` : null,
            plan ? `진입/손절: ${fmtP(plan.entry)} / ${fmtP(plan.stop)}` : null,
            plan ? `TP1/TP2/TP3: ${fmtP(plan.tp1)} / ${fmtP(plan.tp2)} / ${fmtP(plan.tp3)}` : null,
            cpLine,
            hotzoneLine,
            `시간: ${new Date().toLocaleString('ko-KR')}`,
          ]
            .filter(Boolean)
            .join('\n');
          telegramAutoLastIntendedPayloadRef.current = {
            brief: builtBrief,
            eventKey,
            eventType: String(eventType),
            symbol,
            timeframe,
            at: nowMs,
          };
        } catch (buildErr) {
          console.error('[telegram-auto] build payload failed', {
            eventKey,
            error: buildErr instanceof Error ? buildErr.message : String(buildErr),
          });
          telegramAutoLastIntendedPayloadRef.current = null;
        }
        if (
          builtBrief &&
          (!prev || prev.key !== eventKey || nowMs - prev.at > cooldownMs)
        ) {
          telegramLastSignalRef.current = { key: eventKey, at: nowMs };
          const brief = builtBrief;
          void (async () => {
            try {
              // 알림 캡처: 1m과 동일 — tv-frame 풀 래스터 + LW 캔버스 폴백(오버레이·HTML 누락 방지)
              try {
                chartRef.current?.timeScale?.().scrollToRealTime?.();
              } catch {}
              await new Promise<void>((r) => requestAnimationFrame(() => r()));
              const hostPngHtf = await captureTelegramChartFramePngDataUrl(frameRef.current);
              const snapCanvas = chartRef.current?.takeScreenshot?.(true);
              const lwPngHtf = cropTelegramSignalCanvasDataUrl(snapCanvas);
              const imageDataUrl = hostPngHtf || lwPngHtf;
              const authHtf = await getTelegramSignalAuthHeaders();
              const res = await fetch('/api/telegram/signal-capture', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', ...authHtf },
                body: JSON.stringify({
                  text: brief,
                  imageDataUrl,
                  symbol,
                  timeframe,
                  eventKey,
                }),
              });
              if (!res.ok) {
                const errText = await res.text().catch(() => '');
                console.error('[telegram-auto] send failed', {
                  eventKey,
                  status: res.status,
                  body: errText,
                });
              } else {
                console.info('[telegram-auto] sent', { eventKey });
              }
            } catch (sendErr) {
              console.error('[telegram-auto] send exception', {
                eventKey,
                error: sendErr instanceof Error ? sendErr.message : String(sendErr),
              });
            }
          })();
        } else if (builtBrief) {
          console.info('[telegram-auto] cooldown skip', {
            eventKey,
            prevKey: prev?.key ?? null,
            elapsedMs: nowMs - (prev?.at ?? nowMs),
            cooldownMs,
          });
        }
      } else {
        console.info('[telegram-auto] no event selected', {
          symbol,
          timeframe,
          curBarTime,
          prevBarTime,
          latestRocketTime: Number(latestRocketForAlert?.time ?? 0) || null,
          latestHtfRocketTime: Number(latestHtfForAlert?.time ?? 0) || null,
          aiSide,
          aiTier,
          mtfAlign,
        });
        telegramAutoLastIntendedPayloadRef.current = null;
      }
      }
      }
    }
  }, [
    analysis,
    candles,
    symbol,
    timeframe,
    confirmedHistorySignals,
    lsRocketMarkerSize,
    showUnifiedCandleMarkers,
    candleAnalysisMarkerMax,
    effective.showCandle,
    effective.showTailongClose,
    effective.showRsi,
    chartMarkerMetaA,
    chartMarkerDensityC,
    chartMarkerLayerLs,
    chartMarkerLayerAux,
    chartMarkerLayerFrontRun,
    showHarmonic,
    unifiedDeskMode,
    uiMode,
    isAiMode,
    whaleCoreSrZoneEnabled,
    whalePrecisionEntryEnabled,
    whalePrecisionAlertEnabled,
    settings.institutionalBandTouchTierMask,
    settings.institutionalBandTouchMinTier,
    settings.chartSmcDeskAiFusionPanel,
    showRsi,
    showMacdPanel,
    showBbPanel,
    higherTfRocketBoost,
    settings.telegramAuto1mEnabled,
    settings.telegramAuto1mImageMode,
    settings.telegramHtfZonePackEnabled,
    settings.telegramHtfSealedBarOnly,
    lineZoneProximityByTime,
    structurePhaseCandleByTime,
    overlayLabelProximityIds,
    hotZoneCandleHighlightTimes,
    overlayDevEnhanced,
    screenOverlays,
    getTelegramSignalAuthHeaders,
  ]);

  useEffect(() => {
    if (!chartMarkerClickDetailB) {
      setSignalBarTip(null);
      setFrontRunTip(null);
      return;
    }
    const chart = chartRef.current;
    if (!chart) return;
    const storeKey = `${symbol}|${timeframe}`;
    const handler = (param: { time?: number }) => {
      const t = param?.time;
      if (t == null) {
        setSignalBarTip(null);
        setFrontRunTip(null);
        return;
      }
      const barTime = typeof t === 'number' ? t : Number((t as { timestamp?: number }).timestamp ?? t);
      if (SHOW_FRONT_RUN_ON_CHART) {
        const d = frontRunTriggeredDetailStoreRef.current.get(storeKey)?.get(barTime);
        if (d) {
          setFrontRunTip({ time: barTime, ...d });
          setSignalBarTip(null);
          return;
        }
      }
      setFrontRunTip(null);
      const lines = matchMarkerDetailLinesByBarTime(barTime, markerBarDetailRef.current, candles);
      if (lines?.length) setSignalBarTip({ time: barTime, lines });
      else setSignalBarTip(null);
    };
    chart.subscribeClick(handler as any);
    return () => {
      chart.unsubscribeClick(handler as any);
      setSignalBarTip(null);
      setFrontRunTip(null);
    };
  }, [symbol, timeframe, candles, chartMarkerClickDetailB]);

  useEffect(() => {
    if (uiMode !== 'BIBLE_MODE') setBiblePatternTip(null);
  }, [uiMode]);

  useEffect(() => {
    if (!biblePatternTip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBiblePatternTip(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [biblePatternTip]);

  useEffect(() => {
    if (!unifiedDeskGuideOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUnifiedDeskGuideOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [unifiedDeskGuideOpen]);

  useEffect(() => {
    let cancelled = false;
    marketFetchAbortRef.current?.abort();
    const ac = new AbortController();
    marketFetchAbortRef.current = ac;

    async function loadCandles() {
      const url = `/api/market?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`;
      const doFetch = () =>
        fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: ac.signal });

      try {
        let res = await doFetch();
        /** 재시도는 1회만·짧게 — TF 전환 시 캔들이 빨리 붙도록 */
        if (!res.ok && !ac.signal.aborted) {
          await new Promise((r) => setTimeout(r, 160));
          if (!cancelled && !ac.signal.aborted) res = await doFetch();
        }
        if (cancelled || ac.signal.aborted) return;
        const payload = await res.json();
        if (!payload.ok) throw new Error(payload.error || 'market fetch failed');
        const nextCandles = payload.candles as Candle[];
        setMarketError('');
        setCandles(nextCandles);

        const key = `${symbol}|${timeframe}`;
        if (lastFittedRef.current !== key) {
          lastFittedRef.current = key;
          const c = chartRef.current;
          const ser = seriesRef.current;
          if (c && ser) applyFocusLatestBars(c, ser, nextCandles.length, timeframe);
        }
        setLastUpdate(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
        setOverlayTick(v => v + 1);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (!cancelled) setMarketError(e?.message || 'market error');
      }
    }

    loadCandles();
    const timer = window.setInterval(loadCandles, 15_000);

    const canWs = !['1M', '1Y'].includes(timeframe);
    const unsub = canWs ? subscribeWs(symbol, timeframe, ({ candle }) => {
      if (cancelled) return;
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.time === candle.time) {
          const next = [...prev];
          next[next.length - 1] = candle;
          return next;
        }
        if (candle.time > last.time) {
          return [...prev, candle];
        }
        return prev;
      });
      if (overlayTickDebounceRef.current) clearTimeout(overlayTickDebounceRef.current);
      overlayTickDebounceRef.current = setTimeout(() => {
        overlayTickDebounceRef.current = null;
        setOverlayTick(v => v + 1);
      }, 400);
    }) : () => {};

    return () => {
        cancelled = true;
        ac.abort();
        window.clearInterval(timer);
        unsub();
        if (overlayTickDebounceRef.current) {
          clearTimeout(overlayTickDebounceRef.current);
          overlayTickDebounceRef.current = null;
        }
      };
  }, [symbol, timeframe]);

  useImperativeHandle(snapshotRef, () => ({
    getSnapshot: () => {
      const host = hostRef.current;
      if (!host) return null;
      const canvas = host.querySelector('canvas');
      if (!canvas) return null;
      try {
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    },
  }), []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!onChartPointClick || !series || !chart || !candles.length) return;
    const limit = visibleLimit(timeframe);
    const visibleLen = Math.min(limit, candles.length);
    const baseIdx = candles.length - visibleLen;

    const buildRequest = (barTime: number): ChartExplainRequest | null => {
      const idx = candles.findIndex(c => c.time === barTime);
      if (idx < 0) return null;
      const c = candles[idx];
      const visibleIndex = idx - baseIdx;
      const engine = analysis?.engine as Record<string, any> | undefined;
      const filterNearby = (arr: Array<{ index: number } | undefined> | undefined, key: string) => {
        const a = (engine?.[key] ?? []) as Array<{ index: number; [k: string]: any }>;
        return a.filter((x: any) => Math.abs((x.index ?? 0) - visibleIndex) <= NEARBY_BARS);
      };
      return {
        symbol,
        timeframe,
        candleData: {
          timestamp: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? 0,
          candleIndex: idx,
        },
        engineData: {
          bos: filterNearby(engine?.bos, 'bos') as any,
          choch: filterNearby(engine?.choch, 'choch') as any,
          fvgNearby: filterNearby(engine?.fvg, 'fvg') as any,
          obNearby: filterNearby(engine?.obs, 'obs') as any,
          sweep: filterNearby(engine?.sweeps, 'sweeps') as any,
          eqh: filterNearby(engine?.eqh, 'eqh') as any,
          eql: filterNearby(engine?.eql, 'eql') as any,
        },
      };
    };

    const handler = (param: { time?: number; seriesData?: Map<unknown, { time?: number }> }) => {
      const t = param?.time ?? (series && param?.seriesData?.get?.(series as any)?.time);
      if (t == null) return;
      const req = buildRequest(typeof t === 'number' ? t : (t as any));
      if (req) onChartPointClick(req);
    };
    chart.subscribeClick(handler as any);
    return () => chart.unsubscribeClick(handler as any);
  }, [symbol, timeframe, candles, analysis?.engine, onChartPointClick]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const r = () => window.dispatchEvent(new Event('resize'));
    const t0 = window.setTimeout(r, 0);
    const t1 = window.setTimeout(r, 120);
    const t2 = window.setTimeout(r, 350);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isFullscreen]);

  const toggleFullscreen = async () => {
    const el = frameRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* iOS 등 미지원 */
    }
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hostRef.current || !chartRef.current || !candles.length) return;
    e.preventDefault();
    const chart = chartRef.current;
    const rect = hostRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = chart.timeScale().coordinateToTime(x);
    if (t == null) return;
    const barTime = typeof t === 'number' ? t : (t as any).timestamp ?? t;
    const limit = visibleLimit(timeframe);
    const baseIdx = Math.max(0, candles.length - Math.min(limit, candles.length));
    const idx = candles.findIndex(c => c.time >= barTime);
    const candleIndex = idx >= 0 ? idx : candles.length - 1;
    const c = candles[candleIndex];
    if (!c) return;
    const visibleIndex = candleIndex - baseIdx;
    const engine = analysis?.engine as Record<string, any> | undefined;
    const filterNearby = (arr: any[] | undefined) => (arr ?? []).filter((x: any) => Math.abs((x.index ?? 0) - visibleIndex) <= NEARBY_BARS);
    const req: ChartExplainRequest = {
      symbol,
      timeframe,
      candleData: { timestamp: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0, candleIndex },
      engineData: {
        bos: filterNearby(engine?.bos),
        choch: filterNearby(engine?.choch),
        fvgNearby: filterNearby(engine?.fvg),
        obNearby: filterNearby(engine?.obs),
        sweep: filterNearby(engine?.sweeps),
        eqh: filterNearby(engine?.eqh),
        eql: filterNearby(engine?.eql),
      },
    };
    setContextMenu({ x: e.clientX, y: e.clientY, req });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const onClose = () => setContextMenu(null);
    window.addEventListener('click', onClose);
    return () => window.removeEventListener('click', onClose);
  }, [contextMenu]);

  const chartVerdictTintMode = (settings.chartVerdictTint ?? 'off') as UserSettings['chartVerdictTint'];
  /** 통합작도 + 톤 끔이면 기본으로 면 톤만 켜서 글자 없이 방향 표시 */
  const chartVerdictTintModeEffective =
    unifiedDeskMode && chartVerdictTintMode === 'off' ? 'wash' : chartVerdictTintMode;

  const signalSpotForwardReport = useMemo(() => {
    if (!signalStatsOpen || candles.length < 5) return null;
    const touchTierMask =
      settings.institutionalBandTouchTierMask ??
      tierMaskFromMinTier(
        settings.institutionalBandTouchMinTier === 'A' ||
          settings.institutionalBandTouchMinTier === 'B' ||
          settings.institutionalBandTouchMinTier === 'C'
          ? settings.institutionalBandTouchMinTier
          : 'B',
      );
    const rawTier = settings.institutionalBandTouchMinTier;
    const minTier: InstitutionalBandTouchTier =
      rawTier === 'A' || rawTier === 'B' || rawTier === 'C' ? rawTier : 'B';
    return buildSignalSpotForwardReport(candles, analysis, symbol, timeframe, {
      horizonBars: signalStatsHorizon,
      includeInstitutionalBand: signalStatsInclBand && CHART_BAND_LINE_AND_TOUCH_ALWAYS_ON,
      institutionalMinTier: minTier,
      institutionalTierEnabled: {
        A: touchTierMask.A === true,
        B: touchTierMask.B === true,
        C: touchTierMask.C === true,
      },
      includeStructureRockets: signalStatsInclRocket,
    });
  }, [
    signalStatsOpen,
    candles,
    analysis,
    symbol,
    timeframe,
    signalStatsHorizon,
    signalStatsInclBand,
    signalStatsInclRocket,
    settings.institutionalBandTouchTierMask,
    settings.institutionalBandTouchMinTier,
  ]);

  const hzDualLeftChrome = hotZoneEmbed === 'left' && uiMode === 'HOT_ZONE';

  const verdictVisualBias: 'long' | 'short' | null =
    analysisMatchesSymbolAndTf(analysis, symbol, timeframe) &&
    (analysis?.verdict === 'LONG' || analysis?.verdict === 'SHORT')
      ? analysis!.verdict === 'LONG'
        ? 'long'
        : 'short'
      : null;
  const whaleStructureBounceLegendOn =
    (uiMode === 'WHALE' || uiMode === 'AI_ZONE') &&
    whaleStructureBounceEnabled &&
    Boolean((analysis as AnalyzeResponse | null)?.structureBouncePath);

  return (
    <div
      ref={frameRef}
      className={`tv-frame ${isFullscreen ? 'is-fullscreen' : ''}${maxCleanChartLayout ? ' tv-frame--max-clean' : ''}${
        unifiedDeskMode && unifiedDeskPack === 1 ? ' tv-frame--ud-pack-zone' : ''
      }${hotZoneEmbed === 'right' ? ' tv-frame--hz-embed-sec' : ''}${isSmcDeskMode ? ' tv-frame--smc-desk' : ''}`}
      data-ud-pack={unifiedDeskMode ? unifiedDeskPack : undefined}
    >
      {whaleStructureBounceLegendOn && (
        <div
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            zIndex: 48,
            pointerEvents: 'none',
            width: 184,
            borderRadius: 8,
            border: '1px solid rgba(251,191,36,0.24)',
            background: 'rgba(10,16,26,0.68)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.28)',
            padding: '6px 8px',
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 900, color: '#fcd34d', marginBottom: 4 }}>세트반등</div>
          {[
            { label: '① 밀림', color: 'rgba(251,191,36,0.88)' },
            { label: '② 반응', color: 'rgba(45,212,191,0.9)' },
            { label: '③ 이탈', color: 'rgba(248,113,113,0.85)' },
            { label: '④ 목표', color: 'rgba(56,189,248,0.92)' },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span
                style={{
                  width: 16,
                  height: 0,
                  borderTop: `2px dashed ${row.color}`,
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#e2e8f0', fontSize: 9, fontWeight: 700 }}>{row.label}</span>
            </div>
          ))}
        </div>
      )}
      {(OVERLAY_ZONE_FILL_BEHIND_CHART || settings.showExhaustionZoneRukich) && (
        <div className="overlay-layer overlay-layer--under-chart" aria-hidden>
          {OVERLAY_ZONE_FILL_BEHIND_CHART && unifiedDeskMode && unifiedTvBands && (
            <div className="chart-unified-tv-bands">
              {unifiedTvBands.resist && (
                <div
                  className="chart-unified-tv-band chart-unified-tv-band--resist"
                  style={{ top: unifiedTvBands.resist.top, height: unifiedTvBands.resist.height }}
                >
                  <span className="chart-unified-tv-band-label chart-unified-tv-band-label--short">저항</span>
                </div>
              )}
              {unifiedTvBands.support && (
                <div
                  className="chart-unified-tv-band chart-unified-tv-band--support"
                  style={{ top: unifiedTvBands.support.top, height: unifiedTvBands.support.height }}
                >
                  <span className="chart-unified-tv-band-label chart-unified-tv-band-label--long">지지</span>
                </div>
              )}
              {unifiedTvBands.ribbon && (
                <div
                  className="chart-unified-tv-band chart-unified-tv-band--ribbon"
                  data-bias={unifiedTvBands.ribbonBias ?? undefined}
                  style={{ top: unifiedTvBands.ribbon.top, height: unifiedTvBands.ribbon.height }}
                >
                  <span className="chart-unified-tv-band-label chart-unified-tv-band-label--ribbon">BB</span>
                </div>
              )}
            </div>
          )}
          {OVERLAY_ZONE_FILL_BEHIND_CHART &&
            visibleScreenOverlays.map((item: any) => {
            const isWhaleAutoOverlay = typeof item.id === 'string' && item.id.startsWith('whale-auto-');
            const smcPlaybookLock = isSmcEntryPlaybookOverlayId(item.id);
            const offKey = stableOverlayVisibilityKey(item.id);
            const off =
              isWhaleAutoOverlay || smcPlaybookLock
                ? { dx: 0, dy: 0 }
                : overlayOffsets[offKey] ?? overlayOffsets[item.id] ?? { dx: 0, dy: 0 };
            const isDragging = !isWhaleAutoOverlay && !smcPlaybookLock && dragState?.id === item.id;
            const liveOff = isDragging ? { dx: dragState.currentDx, dy: dragState.currentDy } : off;
            if (
              item.kind === 'channelBand' &&
              Array.isArray(item.channelBandScreen) &&
              item.channelBandScreen.length >= 3
            ) {
              const poly = item.channelBandScreen as { x: number; y: number }[];
              let minX = Infinity;
              let minY = Infinity;
              let maxX = -Infinity;
              let maxY = -Infinity;
              for (const p of poly) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
              }
              const w = Math.max(1, maxX - minX);
              const h = Math.max(1, maxY - minY);
              const pts = poly.map((p) => `${p.x - minX + liveOff.dx},${p.y - minY + liveOff.dy}`).join(' ');
              const fillC = softenZoneFill(
                typeof item.color === 'string' && item.color.length ? item.color : 'rgba(80,80,80,0.2)',
                zoneFillSoftenMult * UNDER_CHART_FILL_EXTRA_SOFT
              );
              return (
                <div key={`under-ch-${item.id}`} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: minX, top: minY, width: w, height: h, pointerEvents: 'none' }}>
                    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
                      <polygon points={pts} fill={fillC} stroke="none" />
                    </svg>
                  </div>
                </div>
              );
            }
            if (
              !['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone'].includes(item.kind) ||
              typeof item.x2 !== 'number' ||
              typeof item.y2 !== 'number'
            ) {
              return null;
            }
            const isCaCoreSd =
              typeof item.id === 'string' &&
              item.id.startsWith('ca-core-') &&
              (item as OverlayItem).category === 'candleAnalysisCoreSd';
            const isMajorEngineSrZone =
              typeof item.id === 'string' && /^major-(support|resistance)-\d+-zone$/.test(item.id);
            const isCandleAnalysisZone =
              isCaCoreSd ||
              isMajorEngineSrZone ||
              (typeof item.id === 'string' &&
                (item.id.startsWith('candle-analysis-zone') ||
                  item.id.startsWith('candle-analysis-auto-') ||
                  item.id.startsWith('candle-analysis-ai-draw-') ||
                  item.id.startsWith('candle-analysis-hash-fib-') ||
                  item.id.startsWith('candle-analysis-bosw-') ||
                  item.id.startsWith('candle-analysis-vifvg-') ||
                  item.id.startsWith('candle-analysis-brk-') ||
                  item.id.startsWith('zone-smbc-') ||
                  item.id === 'candle-analysis-fib-pocket' ||
                  item.id.startsWith('smart-overlay-zone')));
            const baseLeft = Math.min(item.x1, item.x2);
            const baseWidth = Math.abs(item.x2 - item.x1);
            const xMaxRight = item.xMaxRight ?? (baseLeft + baseWidth);
            const isCoreMagnetZoneStrictW = isCoreAnalysisMagnetZoneStrictWidthId(item.id);
            /** 핵심 존: time2 픽셀 폭 + screenOverlays에서 마지막 봉까지 확장된 x2/xMaxRight 반영 */
            const width = isCoreMagnetZoneStrictW
              ? Math.max(1, baseWidth)
              : Math.max(baseWidth, xMaxRight - baseLeft);
            const left = baseLeft + liveOff.dx;
            const top = Math.min(item.y1, item.y2) + liveOff.dy;
            const height = Math.abs(item.y2 - item.y1);
            const isSmartMoneyMvpLine = String(item.id || '').startsWith('smartmoney-mvp-');
            const align = isCaCoreSd || isMajorEngineSrZone || isSmartMoneyMvpLine ? 'right' : getLabelAlign(item.id);
            const justifyContent = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
            const lineLblRaw = (item as OverlayItem).lineLabelColor;
            const useAutoLineTint =
              typeof lineLblRaw === 'string' &&
              lineLblRaw.length > 0 &&
              typeof item.id === 'string' &&
              item.id.startsWith('candle-analysis-auto-');
            const zDirTint = resolveZoneDirectionalColors(item as OverlayItem);
            const zoneLabelColor = useAutoLineTint
              ? toSolidOverlayColor(lineLblRaw)
              : zDirTint
                ? zDirTint.labelSolid
                : toSolidOverlayColor(item.color);
            const ovZUnder = item as OverlayItem;
            const zoneFillPreserveUnder = ovZUnder.zoneFillPreserve === true;
            const overlayZoneExtraUnder = String(ovZUnder.overlayZoneExtraClass || '')
              .trim()
              .split(/\s+/)
              .filter(Boolean);
            const zoneBorder = isCaCoreSd || isMajorEngineSrZone ? `1px solid ${zoneLabelColor}50` : undefined;
            const udZone = unifiedDeskMode
              ? unifiedDeskUnderChartZonePresentation(item as OverlayItem, {
                  isCandleAnalysisZone,
                  isCaCoreSd,
                })
              : null;
            return (
              <div key={`under-z-${item.id}`} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
                <div
                  className={[
                    'overlay-zone',
                    isCandleAnalysisZone ? 'overlay-zone--candle-analysis' : '',
                    (item as OverlayItem).zonePulse ? 'overlay-zone--core-pulse' : '',
                    unifiedDeskMode && udZone ? 'overlay-zone--unified-desk' : '',
                    ...overlayZoneExtraUnder,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left,
                    top,
                    width,
                    height,
                    position: 'relative',
                    background: udZone
                      ? udZone.background
                      : zDirTint
                        ? zDirTint.fillSoft
                        : softenZoneFill(
                          item.color,
                          zoneFillPreserveUnder
                            ? zoneFillPreserveLayoutMult(maxCleanChartLayout, executionCalmLayout)
                            : (isCaCoreSd ? 0.88 : isCandleAnalysisZone ? caZoneFillSoftMult : zoneFillSoftenMult) *
                              UNDER_CHART_FILL_EXTRA_SOFT,
                          zoneFillPreserveUnder ? { minAlpha: 0.055 } : undefined
                        ),
                    border: udZone?.border ?? (zDirTint ? `1px solid ${zDirTint.strokeSoft}` : zoneBorder),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent,
                    paddingLeft: 6,
                    paddingRight: 6,
                  }}
                >
                  {udZone && !shouldHideWhaleAutoZoneChartCaption(item) && (
                    <span
                      className={`chart-unified-zone-caption${overlayLabelProximityIds.has(String(item.id)) ? ' overlay-label-near-candle' : ''}`}
                      style={{
                        position: 'absolute',
                        right: 4,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.02,
                        color: udZone.captionColor,
                        textShadow: '0 1px 3px rgba(0,0,0,.95)',
                        pointerEvents: 'none',
                        maxWidth: Math.min(100, Math.max(48, width * 0.45)),
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.15,
                      }}
                    >
                      {udZone.caption}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {settings.showExhaustionZoneRukich && exhaustionZoneRukichGeom && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: exhaustionZoneRukichGeom.rect.width,
                height: exhaustionZoneRukichGeom.rect.height,
                pointerEvents: 'none',
              }}
            >
              {exhaustionZoneRukichGeom.bgBars.map((b, i) => (
                <div
                  key={`exhaustion-zone-bg-${i}-${Math.round(b.left)}`}
                  style={{
                    position: 'absolute',
                    left: b.left,
                    top: 0,
                    width: b.width,
                    height: exhaustionZoneRukichGeom.rect.height,
                    background: 'rgba(34, 197, 94, 0.09)',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {verdictVisualBias &&
        (chartVerdictTintModeEffective === 'wash' || chartVerdictTintModeEffective === 'edge') && (
          <div
            aria-hidden
            className={`chart-verdict-tint chart-verdict-tint--${chartVerdictTintModeEffective}`}
            data-bias={verdictVisualBias}
          />
        )}
      <div ref={hostRef} className="tv-host" onContextMenu={handleContextMenu} />
      {settings.chartCandleRuleDebug && candlePaintDebugLine ? (
        <div
          className="chart-candle-rule-debug-banner"
          role="status"
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            bottom: 44,
            zIndex: 28,
            padding: '5px 8px',
            fontSize: 10,
            lineHeight: 1.35,
            color: '#e2e8f0',
            background: 'rgba(15,23,42,0.92)',
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: 6,
            pointerEvents: 'none',
            maxHeight: 56,
            overflow: 'hidden',
          }}
        >
          {candlePaintDebugLine}
        </div>
      ) : null}
      {isSmartMoneyMvpMode && chartSectionVis.s1 && selectedWorkflowX != null && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: Math.max(0, selectedWorkflowX),
            top: 52,
            bottom: chartSectionVis.s2 ? 108 : 48,
            width: 0,
            borderLeft: '1px dashed rgba(103,232,249,0.9)',
            zIndex: 15,
            pointerEvents: 'none',
          }}
        />
      )}
      {isSmcDeskMode && chartSectionVis.s1 && (
        <>
          {isSmcCompositeMode && settings.chartSmcDeskCompositeFloatingPanel === true && analysisMatchesTf && analysis && (
            <SmcDeskCompositePanel
              model={smcCompositeModel}
              layers={compositeLayerMask}
              replayOffset={smcCompositeReplayOffset}
              onReplayOffsetChange={setSmcCompositeReplayOffset}
              maxReplay={Math.max(0, candles.length - 1)}
              mtfSignals={mtfSignals}
            />
          )}
          {isSmcCompositeMode && smcCompositeDrawingEnabled && (
            <SmcDeskDepthDeltaStrip depthDelta={smcCompositeModel.depthDelta} />
          )}
          {uiMode === 'SMC_DESK' && analysisMatchesTf && settings.chartSmcDeskAiFusionPanel !== false && analysis && (
            <SmcDeskAiFusionHud analysis={analysis as AnalyzeResponse} isNarrowUi={isNarrowUi} />
          )}
          <div
            role="note"
            className="smc-desk-zone-legend"
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              zIndex: 12,
              maxWidth: 'min(94%, 480px)',
              padding: isNarrowUi ? '5px 8px' : '6px 10px',
              fontSize: isNarrowUi ? 9 : 10,
              lineHeight: 1.45,
              color: '#cbd5e1',
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid rgba(98,239,224,0.28)',
              borderRadius: 8,
              pointerEvents: 'none',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
          >
            <span style={{ fontWeight: 700, color: '#62efe0', marginRight: 6 }}>존·LinReg</span>
            {isNarrowUi
              ? '빨강=저항·공급 · 초록=지지·수요 · LinReg=색띠(대·중·소) · 배지·호버=출처'
              : '빨강 띠는 공급·저항 쪽, 초록 띠는 수요·지지 쪽 참고 구간입니다. LinReg(대·중·소·Mid)는 최근 봉 구간 종가 선형회귀+표준편차 밴드라, 급변·횡보 시 캔들이 밴드 밖으로 잠깐 나와도 정상입니다. DRS·LQB·OB 등은 배지·호버로 확인(참고용).'}
          </div>
        </>
      )}
      {hotZoneEmbed === 'right' && uiMode === 'HOT_ZONE' && (
        <div
          className="hot-zone-embed-w-badge"
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 24,
            pointerEvents: 'none',
            padding: '5px 10px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 800,
            color: '#a5f3fc',
            background: 'rgba(2,6,23,0.72)',
            border: '1px solid rgba(34,211,238,0.35)',
            letterSpacing: 0.02,
          }}
        >
          핫존 듀얼 · 주봉 1W
        </div>
      )}
      <SignalForwardStatsPanel
        open={signalStatsOpen}
        onClose={() => setSignalStatsOpen(false)}
        report={signalSpotForwardReport}
        horizonBars={signalStatsHorizon}
        onHorizonChange={setSignalStatsHorizon}
        includeBand={signalStatsInclBand}
        includeRocket={signalStatsInclRocket}
        onIncludeBand={setSignalStatsInclBand}
        onIncludeRocket={setSignalStatsInclRocket}
      />
      {CHART_BAND_LINE_AND_TOUCH_ALWAYS_ON &&
        settings.showInstitutionalTrendBadge !== false &&
        institutionalBadge &&
        (() => {
          const bandLs: 'LONG' | 'SHORT' =
            institutionalBadge.lastDir === 'long' ? 'LONG' : 'SHORT';
          const tfVerdict: 'LONG' | 'SHORT' | null =
            analysisMatchesTf &&
            analysis &&
            (analysis.verdict === 'LONG' || analysis.verdict === 'SHORT')
              ? analysis.verdict
              : null;
          const alignsTf = tfVerdict != null && tfVerdict === bandLs;
          return (
            <div className="chart-institutional-badge" aria-live="polite">
              <div className="chart-institutional-badge__title">기관밴드 · SuperTrend(10,3)</div>
              <div
                className={`chart-institutional-badge__dir chart-institutional-badge__dir--${institutionalBadge.lastDir}`}
              >
                {institutionalBadge.lastDir === 'long' ? '📈 롱 신호' : '📉 숏 신호'}
                <span className="chart-institutional-badge__code">{bandLs}</span>
              </div>
              {institutionalBadge.lastLinePrice != null && (
                <div className="chart-institutional-badge__px">
                  기준선 {formatOverlayPrice(institutionalBadge.lastLinePrice)}
                </div>
              )}
              <div className="chart-institutional-badge__meta">
                추세 유지 {institutionalBadge.barsInCurrentTrend}봉
                {institutionalBadge.currentTrendStartTime != null && (
                  <span className="chart-institutional-badge__meta-sub">
                    {' '}
                    · 전환 시각{' '}
                    {new Date(institutionalBadge.currentTrendStartTime * 1000).toLocaleString(undefined, {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
              {tfVerdict != null && (
                <div
                  className={`chart-institutional-badge__cross${
                    alignsTf ? ' chart-institutional-badge__cross--match' : ' chart-institutional-badge__cross--diverge'
                  }`}
                  title="같은 TF /api/analyze verdict와 밴드 방향 일치 여부(실행 전 확인용)"
                >
                  <span>TF 분석 {tfVerdict}</span>
                  <span className="chart-institutional-badge__cross-tag">
                    {alignsTf ? '밴드 일치' : '밴드 상이'}
                  </span>
                </div>
              )}
              <div className="chart-institutional-badge__hint">
                SuperTrend 단일 규칙 · 무효는 종가 기준 밴드 전환 · 청산·비중은 직접 관리
              </div>
            </div>
          );
        })()}
      {unifiedDeskMode && (
        <div
          className="unified-desk-pack-strip"
          style={{
            position: 'absolute',
            left: 8,
            top: 8,
            zIndex: 4,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
            padding: '6px 8px',
            borderRadius: 10,
            background: 'rgba(2,6,23,0.78)',
            border: '1px solid rgba(148,163,184,0.28)',
            backdropFilter: 'blur(4px)',
            maxWidth: 'min(96vw, 420px)',
          }}
        >
          <span style={{ fontSize: 10, color: '#94a3b8', marginRight: 4 }}>통합작도</span>
          <button
            type="button"
            className={`tool-chip tool-chip-button${unifiedDeskPack === 0 ? ' tool-chip-active' : ''}`}
            title="구조·시그널 중심 (라벨 숨김, 선·존 유지)"
            onClick={() => applyUnifiedDeskPack(0)}
          >
            구조
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button${unifiedDeskPack === 1 ? ' tool-chip-active' : ''}`}
            title="존·캔들분석 zone 차트 + TV 밴드 강조"
            onClick={() => applyUnifiedDeskPack(1)}
          >
            존
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button${unifiedDeskPack === 2 ? ' tool-chip-active' : ''}`}
            title="맑은 화면 (선·마커 최소, 톤 끔)"
            onClick={() => applyUnifiedDeskPack(2)}
          >
            맑음
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button${settings.chartBuySellZoneFocus ? ' tool-chip-active' : ''}`}
            title="차트에 매수·매도(지지·저항) 존·가로 띠 위주만 — 추세선·비전·해시피보·BOS웨이브·SMC데스크 등 비-존 레이어 숨김"
            onClick={() => apply({ chartBuySellZoneFocus: !settings.chartBuySellZoneFocus })}
          >
            매수·매도존
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button${candleAnalysisCoreSdZones !== false ? ' tool-chip-active' : ''}`}
            title="엔진 Supply/Demand 기반 핵심 지지·저항 띠(TV식) — /api/analyze overlays에 supply·demand 존이 있을 때 표시"
            onClick={() => apply({ candleAnalysisCoreSdZones: !(candleAnalysisCoreSdZones !== false) })}
          >
            핵심 S/D
          </button>
          <span
            style={{
              fontSize: 10,
              borderRadius: 999,
              padding: '2px 7px',
              border: '1px solid rgba(148,163,184,0.35)',
              color:
                unifiedZoneLineSignal.state === 'LONG'
                  ? '#86efac'
                  : unifiedZoneLineSignal.state === 'SHORT'
                    ? '#fca5a5'
                    : '#cbd5e1',
              background:
                unifiedZoneLineSignal.state === 'LONG'
                  ? 'rgba(22,163,74,0.16)'
                  : unifiedZoneLineSignal.state === 'SHORT'
                    ? 'rgba(220,38,38,0.16)'
                    : 'rgba(71,85,105,0.16)',
            }}
            title={unifiedZoneLineSignal.reasons.join(' · ') || '존·선 결합 시그널 대기'}
          >
            ZL {unifiedZoneLineSignal.state} {unifiedZoneLineSignal.score >= 0 ? '+' : ''}
            {unifiedZoneLineSignal.score}
          </span>
          <span
            style={{
              fontSize: 10,
              borderRadius: 999,
              padding: '2px 7px',
              border: '1px solid rgba(148,163,184,0.35)',
              color:
                unifiedDeskRocketStrip.state === 'LONG'
                  ? '#86efac'
                  : unifiedDeskRocketStrip.state === 'SHORT'
                    ? '#fca5a5'
                    : '#cbd5e1',
              background:
                unifiedDeskRocketStrip.state === 'LONG'
                  ? 'rgba(22,163,74,0.16)'
                  : unifiedDeskRocketStrip.state === 'SHORT'
                    ? 'rgba(220,38,38,0.16)'
                    : 'rgba(71,85,105,0.16)',
            }}
            title={unifiedDeskRocketStrip.title}
          >
            로켓 {unifiedDeskRocketStrip.state === 'WAIT' ? '—' : unifiedDeskRocketStrip.label}
          </span>
          <button
            type="button"
            className="tool-chip tool-chip-button"
            title="오른쪽 시장 패널·통합그래프·차트 작도 읽는 법(교육용)"
            onClick={() => setUnifiedDeskGuideOpen(true)}
          >
            대시보드 가이드
          </button>
        </div>
      )}
      {unifiedDeskMode && unifiedDeskGuideOpen && (
        <div
          role="dialog"
          aria-modal
          aria-label="통합작도 대시보드 가이드"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
          }}
          onClick={() => setUnifiedDeskGuideOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(96vw, 440px)',
              maxHeight: 'min(88vh, 640px)',
              overflow: 'auto',
              borderRadius: 12,
              padding: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <button type="button" className="tool-chip tool-chip-button" onClick={() => setUnifiedDeskGuideOpen(false)}>
                닫기
              </button>
            </div>
            <UnifiedDeskDashboardGuide compact startOpen />
          </div>
        </div>
      )}
      {candleAnalysisLikeUi && !unifiedDeskMode && !(isNarrowUi && uiMode === 'CANDLE_ANALYSIS') && (
        <div
          className="chart-buy-sell-zone-focus-strip"
          style={{
            position: 'absolute',
            left: 8,
            top: 8,
            zIndex: 4,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
            padding: '6px 8px',
            borderRadius: 10,
            background: 'rgba(2,6,23,0.78)',
            border: '1px solid rgba(148,163,184,0.28)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <span style={{ fontSize: 10, color: '#94a3b8', marginRight: 4 }}>캔들분석</span>
          <button
            type="button"
            className={`tool-chip tool-chip-button${settings.chartBuySellZoneFocus ? ' tool-chip-active' : ''}`}
            title="차트에 매수·매도(지지·저항) 존·가로 띠 위주만 — 추세선·비전·해시피보·BOS웨이브·SMC데스크 등 비-존 레이어 숨김"
            onClick={() => apply({ chartBuySellZoneFocus: !settings.chartBuySellZoneFocus })}
          >
            매수·매도존
          </button>
        </div>
      )}
      {candleAnalysisLikeUi && !unifiedDeskMode && analysis && candles.length > 0 && (
        <>
          <CandleAnalysisHeader
            analysis={analysis}
            candles={candles}
            symbol={symbol}
            theme={theme}
            layoutTopPx={candleAnalysisHeaderTopPx}
            applySettings={(patch) => apply(patch)}
            candleAnalysisBrowserNotify={candleAnalysisBrowserNotify === true}
            candleAnalysisAiComment={candleAnalysisAiComment === true}
            candleAnalysisAutoCommentaryOnly={candleAnalysisAutoCommentaryOnly !== false}
            candleAnalysisExecutiveView={candleAnalysisExecutiveView !== false}
            candleAnalysisDirectTheoryPath={candleAnalysisDirectTheoryPath !== false}
            candleAnalysisHashFibEnabled={candleAnalysisHashFibEnabled !== false}
            candleAnalysisBosWavesEnabled={candleAnalysisBosWavesEnabled !== false}
            candleAnalysisVifvgEnabled={candleAnalysisVifvgEnabled !== false}
            candleAnalysisBreakerBlocksEnabled={candleAnalysisBreakerBlocksEnabled !== false}
            candleAnalysisZoneChartVisible={candleAnalysisZoneChartVisible === true}
            candleAnalysisCoreSdZones={candleAnalysisCoreSdZones !== false}
            autoCommentaryLines={candleAnalysisHeaderCommentaryLines}
            candleAnalysisAiDraw={{
              active: (candleAnalysisAiDrawBundle?.overlays?.length ?? 0) > 0,
              onApply: (bundle) =>
                setCandleAnalysisAiDrawBundle({
                  overlays: bundle.overlays,
                  commentary: bundle.commentary,
                }),
              onClear: () => setCandleAnalysisAiDrawBundle(null),
              requestPayload: {
                symbol,
                timeframe,
                candles: (candleAnalysisSliceForUi ?? candles).map((c) => ({
                  time: c.time,
                  open: c.open,
                  high: c.high,
                  low: c.low,
                  close: c.close,
                  volume: c.volume,
                })),
                analysis: analysis
                  ? {
                      verdict: analysis.verdict,
                      currentPrice: analysis.currentPrice,
                      smartOverlay: analysis.smartOverlay ?? undefined,
                    }
                  : undefined,
              },
            }}
          />
          <CandleAnalysisDirectionBadge
            analysis={analysis}
            theme={theme}
            containerRef={frameRef}
            narrowUi={isNarrowUi}
          />
        </>
      )}
      {uiMode === 'HOT_ZONE' && hotZonePullbackPack && !suppressHotZoneHud && (
        <PullbackHotZoneHud pack={hotZonePullbackPack} compact={isNarrowUi} />
      )}
      <div className="ls-rocket-layer" aria-hidden style={{ display: candleAnalysisLikeUi ? 'none' : undefined }}>
        {lsRocketHudPositions.map(({ key, left, top, item }) => (
          <div
            key={key}
            className={[
              'ls-rocket-node',
              'ls-rocket-node--structure',
              item.direction === 'LONG' ? 'ls-rocket-node--long' : 'ls-rocket-node--short',
            ].join(' ')}
            style={{
              left,
              top,
              transform: `translate(-50%, -50%) scale(${lsRocketScaleFactor})`,
            }}
          >
            <span className="ls-rocket-sparkle" aria-hidden>
              ✨
            </span>
            <span className="ls-rocket-icon" aria-hidden>
              {item.direction === 'LONG' ? '🚀' : '📉'}
            </span>
          </div>
        ))}
      </div>
      <div
        ref={isNarrowUi ? narrowChartChromeRef : undefined}
        style={
          isNarrowUi
            ? {
                position: 'absolute',
                top: 8,
                left: 8,
                right: 8,
                zIndex: 60,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                pointerEvents: 'none',
              }
            : { display: 'contents' }
        }
      >
      <div
        ref={quickMenuRef}
        className="chart-quick-menu"
        style={{ ...quickMenuStyle, pointerEvents: 'auto' }}
      >
        {narrowCaQuickToolsCollapsed ? (
          <>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={() => setCaNarrowToolsOpen(true)}
              title="프리셋·라벨·시각정리·기관밴드 등 전체 도구"
              style={{ ...qChip, fontWeight: 700 }}
            >
              차트도구 ▼
            </button>
            <button
              type="button"
              className={`tool-chip tool-chip-button${settings.chartBuySellZoneFocus ? ' tool-chip-active' : ''}`}
              title="차트에 매수·매도(지지·저항) 존·가로 띠 위주만 — 추세선·비전·해시피보·BOS웨이브·SMC데스크 등 비-존 레이어 숨김"
              onClick={() => apply({ chartBuySellZoneFocus: !settings.chartBuySellZoneFocus })}
              style={qChip}
            >
              매수·매도존
            </button>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={restoreDefaultChartView}
              title="줌·스크롤 후 복구 — 최신 캔들 기준으로 보이는 구간·가격축 자동 맞춤"
              style={qChip}
            >
              뷰복원
            </button>
          </>
        ) : (
          <>
            {aiZoneQuickToolsCollapsed ? (
              <div
                className="ai-zone-quick-compact"
                style={{
                  display: 'inline-flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 5,
                  rowGap: 6,
                  maxWidth: '100%',
                  padding: '2px 0',
                }}
              >
                <span style={{ fontSize: 10, color: '#7dd3fc', fontWeight: 800, marginRight: 2 }}>AI 통합 L/S</span>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  style={{ ...qChip, borderColor: 'rgba(56,189,248,0.45)', fontWeight: 800 }}
                  onClick={applyAiZoneUnifiedPreset}
                  title="핵심 S/R+Hot+DRS+LQB 정돈. Hyper/세트경로/Exh/매집/구조봉·BTC파워 끔 — 중복·부하 레이어를 한 번에 정리"
                >
                  통합 프리셋
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  style={qChip}
                  onClick={applyWhaleCoreSrOnlyPreset}
                  title="major 핵심면만(기존「핵심면만」)"
                >
                  핵심면만
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  style={qChip}
                  onClick={applyWhaleCoreSrPreset}
                  title="핵심+Hot+일괄 해제(기존「핵심풀셋」)"
                >
                  전체 레이어
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  style={qChip}
                  onClick={applyVisualCalm}
                  title="라벨·가로·존 끄기, Hot/HT 끄기"
                >
                  시각정리
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  onClick={restoreDefaultChartView}
                  title="줌·가격축 맞춤"
                  style={qChip}
                >
                  뷰복원
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  onClick={() => applyChartSectionPreset({ s1: true, s2: false, s3: true })}
                  style={qChip}
                  title="집중: 상단+기본축"
                >
                  집중
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  onClick={() => applyChartSectionPreset({ s1: true, s2: true, s3: true })}
                  style={qChip}
                  title="분석: 전체 표시"
                >
                  분석
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  onClick={() => applyChartSectionPreset({ s1: false, s2: false, s3: false })}
                  style={qChip}
                  title="클린: 전부 숨김"
                >
                  클린
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  style={{ ...qChip, fontWeight: 700, color: '#e2e8f0' }}
                  onClick={() => setAiZoneChartToolsExpanded(true)}
                  title="기존 상세 토글(라벨X·Hot·ST·SAS·SMC·텔레그램 등) 전부 표시"
                >
                  전체 도구 ▼
                </button>
              </div>
            ) : (
              <>
            {isNarrowUi && uiMode === 'CANDLE_ANALYSIS' && caNarrowToolsOpen && (
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => setCaNarrowToolsOpen(false)}
                title="캔들분석(폰): 긴 도구 줄 접기 — 차트만 넓게"
                style={{ ...qChip, fontWeight: 700 }}
              >
                접기 ▲
              </button>
            )}
            {uiMode === 'AI_ZONE' && !isNarrowUi && (
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => setAiZoneChartToolsExpanded(false)}
                title="한 줄(통합 프리셋)로 되돌리기"
                style={{ ...qChip, fontWeight: 700, borderColor: 'rgba(56,189,248,0.4)' }}
              >
                도구 접기 ▲
              </button>
            )}
        {!isNarrowUi && (
          <>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              title="드래그해서 메뉴 이동"
              onMouseDown={startMenuDrag('quick')}
              style={{ ...qChip, cursor: 'grab' }}
            >
              ↕ 이동
            </button>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              title="메뉴 위치 기본값으로 복귀"
              onClick={resetMenuPos}
              style={qChip}
            >
              위치 초기화
            </button>
          </>
        )}
        <button
          type="button"
          className={`tool-chip tool-chip-button ${chartSectionVis.s1 ? 'tool-chip-active' : ''}`}
          onClick={() => setChartSection('s1', !chartSectionVis.s1)}
          title="상단 바 접기/펼치기"
          style={qChip}
        >
          {isNarrowUi ? `1 상단 ${chartSectionVis.s1 ? 'ON' : 'OFF'}` : `1 상단 ${chartSectionVis.s1 ? 'ON' : 'OFF'}`}
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${chartSectionVis.s2 ? 'tool-chip-active' : ''}`}
          onClick={() => setChartSection('s2', !chartSectionVis.s2)}
          title="우측 컬러 가격 라벨 접기/펼치기"
          style={qChip}
        >
          {isNarrowUi ? `2 컬러 ${chartSectionVis.s2 ? 'ON' : 'OFF'}` : `2 컬러가격 ${chartSectionVis.s2 ? 'ON' : 'OFF'}`}
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${chartSectionVis.s3 ? 'tool-chip-active' : ''}`}
          onClick={() => setChartSection('s3', !chartSectionVis.s3)}
          title="기본 가격축(우측) 접기/펼치기"
          style={qChip}
        >
          {isNarrowUi ? `3 기본축 ${chartSectionVis.s3 ? 'ON' : 'OFF'}` : `3 기본축 ${chartSectionVis.s3 ? 'ON' : 'OFF'}`}
        </button>
        {!isNarrowUi && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 2 }}>프리셋</span>}
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => applyChartSectionPreset({ s1: true, s2: false, s3: true })}
          title="집중: 상단과 기본축만 유지"
          style={qChip}
        >
          집중
        </button>
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => applyChartSectionPreset({ s1: true, s2: true, s3: true })}
          title="분석: 전체 표시"
          style={qChip}
        >
          분석
        </button>
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => applyChartSectionPreset({ s1: false, s2: false, s3: false })}
          title="클린: 상단/컬러가격/기본축 전부 숨김"
          style={qChip}
        >
          클린
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.chartBulkHideLabels ? 'tool-chip-active' : ''}`}
          onClick={() => apply({ chartBulkHideLabels: !settings.chartBulkHideLabels })}
          title="차트 위 텍스트·핀 라벨 일괄 숨김. 최강분석 모드에서는 공급·수요 존 캡션·가격띠만 유지"
          style={qChip}
        >
          라벨X
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.chartBulkHideHLines ? 'tool-chip-active' : ''}`}
          onClick={() => apply({ chartBulkHideHLines: !settings.chartBulkHideHLines })}
          title="가격 가로선·구조선·피보 등 선 일괄 숨김"
          style={qChip}
        >
          가로선X
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.chartTfCloseSettlementLines !== false ? 'tool-chip-active' : ''}`}
          onClick={() => apply({ chartTfCloseSettlementLines: settings.chartTfCloseSettlementLines === false })}
          title="TF별 종가 마감 가로선(1m~월봉 close) 표시/숨김 — 구조 토글과 별개"
          style={qChip}
        >
          종가TF
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.chartTfCloseLinesWhite !== false ? 'tool-chip-active' : ''}`}
          onClick={() => apply({ chartTfCloseLinesWhite: settings.chartTfCloseLinesWhite === false })}
          title="종가 마감선 색: 켜면 흰색 통일, 끄면 타임프레임별 색(엔진 기본)"
          style={qChip}
        >
          흰종가
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.chartBulkHideZones ? 'tool-chip-active' : ''}`}
          onClick={() => apply({ chartBulkHideZones: !settings.chartBulkHideZones })}
          title="존·FVG·OB·반응구간 등 면 일괄 숨김"
          style={qChip}
        >
          존X
        </button>
        {isAiMode && (
          <>
            <button
              type="button"
              className={`tool-chip tool-chip-button ${whaleHotZoneEnabled ? 'tool-chip-active' : ''}`}
              onClick={() => {
                const m = uiMode as SettingsUIMode;
                const next = !whaleHotZoneEnabled;
                apply({
                  chartBulkHideZones: false,
                  modeFeatureOverrides: {
                    ...(settings.modeFeatureOverrides || {}),
                    [m]: { ...(settings.modeFeatureOverrides?.[m] || {}), whaleHotZoneEnabled: next },
                  },
                });
              }}
              title="고래 Hot Zone — 차트에 볼륨 기반 S/R 열지도(존X가 켜져 있어도 표시 유지)"
              style={{ ...qChip, borderColor: 'rgba(251,191,36,0.4)' }}
            >
              Hot존
            </button>
            <button
              type="button"
              className={`tool-chip tool-chip-button ${whaleCoreSrZoneEnabled ? 'tool-chip-active' : ''}`}
              onClick={() => {
                const m = uiMode as SettingsUIMode;
                const next = !whaleCoreSrZoneEnabled;
                apply({
                  chartBulkHideZones: false,
                  modeFeatureOverrides: {
                    ...(settings.modeFeatureOverrides || {}),
                    [m]: { ...(settings.modeFeatureOverrides?.[m] || {}), whaleCoreSrZoneEnabled: next },
                  },
                });
              }}
              title="핵심면(major S/R) — 이 칩이 켜져야 구조 돌파(BOS/CHOCH)·구조 로켓(🚀/📉) 표시. 존·선 토글 OFF여도 핵심 면은 유지"
              style={{ ...qChip, borderColor: 'rgba(98,239,224,0.4)' }}
            >
              핵심S/R
            </button>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={() => applyWhaleCoreSrPreset()}
              title="존·라벨·고래구간·Hot존 ON + 일괄 숨김 해제 — 구조 돌파는 핵심 S/R(핵심면) 켤 때만"
              style={{ ...qChip, fontWeight: 600 }}
            >
              핵심풀셋
            </button>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={() => applyWhaleCoreSrOnlyPreset()}
              title="major 핵심 지지·저항 면만(라벨·Hot존·DRS 등 최소화) — 구조 돌파 레이어는 핵심 S/R과 동일 조건"
              style={{ ...qChip, fontWeight: 600 }}
            >
              핵심면만
            </button>
          </>
        )}
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.showExhaustionZoneRukich ? 'tool-chip-active' : ''}`}
          onClick={() => apply({ showExhaustionZoneRukich: !settings.showExhaustionZoneRukich })}
          title="Exhaustion Zone [by rukich] — ATR·리바운드 밴드, 저가≤리바운드선 시 배경 강조 (Pine 동일 수식)"
          style={qChip}
        >
          Exh존
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${
            settings.chartVerdictTint && settings.chartVerdictTint !== 'off' ? 'tool-chip-active' : ''
          }`}
          onClick={() => {
            const order = ['off', 'wash', 'edge', 'priceLine'] as const;
            const curRaw = settings.chartVerdictTint ?? 'off';
            const cur = (order.includes(curRaw as (typeof order)[number]) ? curRaw : 'off') as (typeof order)[number];
            const i = order.indexOf(cur);
            apply({ chartVerdictTint: order[(i + 1) % order.length] });
          }}
          title="브리핑 롱/숏을 글자 없이 색으로: 끔 → 전체 톤 → 우측 띠 → 현재가 선색. 관망(WATCH)이면 표시 없음"
          style={qChip}
        >
          톤
          {settings.chartVerdictTint === 'wash'
            ? '·면'
            : settings.chartVerdictTint === 'edge'
              ? '·띠'
              : settings.chartVerdictTint === 'priceLine'
                ? '·가'
                : ''}
        </button>
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => applyVisualCalm()}
          title="한 번에 정리: 라벨·가로선·존 끄기, 마커 숫자 끄기, 고래 모드면 HotZone·HyperTrend(HT) 끄기"
          style={{ ...qChip, borderColor: 'rgba(148,163,184,0.45)', fontWeight: 600 }}
        >
          시각정리
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.institutionalFlowZonesEnabled !== false ? 'tool-chip-active' : ''}`}
          onClick={() =>
            apply({ institutionalFlowZonesEnabled: !(settings.institutionalFlowZonesEnabled !== false) })
          }
          title="세력·고래 매집/매도 구간 존을 차트에 병합 (고래 모드 없이도 표시)"
          style={qChip}
        >
          매집존
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.showInstitutionalTrendBadge !== false ? 'tool-chip-active' : ''}`}
          onClick={() => apply({ showInstitutionalTrendBadge: !(settings.showInstitutionalTrendBadge !== false) })}
          title="우측 상단 기관밴드 요약: 롱·숏 신호, 기준선, 추세 유지 봉 수, TF 분석과 일치 여부"
          style={qChip}
        >
          ST요약
        </button>
        <div
          style={{
            ...qChip,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            border: '1px solid rgba(148,163,184,0.28)',
            borderRadius: 10,
            background: 'rgba(2,6,23,0.45)',
          }}
          title="상단/하단 추세 밴드 색상"
        >
          <span style={{ fontSize: 10, color: '#94a3b8' }}>하단</span>
          <input
            type="color"
            value={settings.institutionalBandLongHex || '#22C55E'}
            onChange={(e) => apply({ institutionalBandLongHex: e.target.value.toUpperCase() })}
            style={{ width: 22, height: 18, padding: 0, border: 'none', background: 'transparent' }}
            title="하단(롱) 밴드 색"
          />
          <span style={{ fontSize: 10, color: '#94a3b8' }}>상단</span>
          <input
            type="color"
            value={settings.institutionalBandShortHex || '#EF4444'}
            onChange={(e) => apply({ institutionalBandShortHex: e.target.value.toUpperCase() })}
            style={{ width: 22, height: 18, padding: 0, border: 'none', background: 'transparent' }}
            title="상단(숏) 밴드 색"
          />
        </div>
        {(() => {
          const tierMaskUi =
            settings.institutionalBandTouchTierMask ??
            tierMaskFromMinTier(
              settings.institutionalBandTouchMinTier === 'A' ||
                settings.institutionalBandTouchMinTier === 'B' ||
                settings.institutionalBandTouchMinTier === 'C'
                ? settings.institutionalBandTouchMinTier
                : 'B',
            );
          const allTiersOn =
            tierMaskUi.A === true && tierMaskUi.B === true && tierMaskUi.C === true;
          return (
            <button
              type="button"
              className={`tool-chip tool-chip-button${allTiersOn ? ' tool-chip-active' : ''}`}
              onClick={() => {
                const curr = loadSettings();
                const base: InstitutionalBandTouchTierMask =
                  curr.institutionalBandTouchTierMask != null
                    ? {
                        A: curr.institutionalBandTouchTierMask.A === true,
                        B: curr.institutionalBandTouchTierMask.B === true,
                        C: curr.institutionalBandTouchTierMask.C === true,
                      }
                    : tierMaskFromMinTier(
                        curr.institutionalBandTouchMinTier === 'A' ||
                          curr.institutionalBandTouchMinTier === 'B' ||
                          curr.institutionalBandTouchMinTier === 'C'
                          ? curr.institutionalBandTouchMinTier
                          : 'B',
                      );
                const everyOn = base.A && base.B && base.C;
                const next: InstitutionalBandTouchTierMask = everyOn
                  ? { A: false, B: false, C: false }
                  : { A: true, B: true, C: true };
                apply({
                  institutionalBandTouchTierMask: next,
                  institutionalBandTouchMinTier: institutionalBandTouchMinTierFromMask(next),
                });
              }}
              title="터치 A·B·C: 켜면 세 등급 필터 ON, 끄면 접촉 등급 마커 끔(캔들 표시는 로켓·L/S 등과 별개)"
              style={{ ...qChip, minWidth: '5.25rem', paddingLeft: 8, paddingRight: 8 }}
            >
              터치 A·B·C
            </button>
          );
        })()}
        <button
          type="button"
          className={`tool-chip tool-chip-button${signalStatsOpen ? ' tool-chip-active' : ''}`}
          onClick={() => setSignalStatsOpen((v) => !v)}
          title="표시 중인 기관밴드 접촉·구조 로켓 신호 기준, 현물 종가 진입 후 전진 변동·손절폭 도달 통계"
          style={{ ...qChip, fontWeight: signalStatsOpen ? 700 : 500 }}
        >
          신호통계
        </button>
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => void sendTelegramTestCapture()}
          disabled={telegramTestSending}
          title="현재 차트 캡처를 텔레그램 단톡으로 즉시 1회 전송"
          style={{ ...qChip, opacity: telegramTestSending ? 0.7 : 1, cursor: telegramTestSending ? 'wait' : 'pointer' }}
        >
          {telegramTestSending ? '텔레그램 전송중…' : '텔레그램 테스트'}
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button${settings.telegramAuto1mEnabled ? ' tool-chip-active' : ''}`}
          onClick={() => apply({ telegramAuto1mEnabled: !settings.telegramAuto1mEnabled })}
          disabled={telegramTestSending}
          title="켜면 1분봉(BTC/ETH)에서 로켓·기관밴드·HotZone·존/선 접근·OB/구조확정이 잡힐 때 텔레그램으로 자동 전송(수동 점검 아님)"
          style={{
            ...qChip,
            opacity: telegramTestSending ? 0.75 : 1,
            cursor: telegramTestSending ? 'wait' : 'pointer',
          }}
        >
          1분 자동알림
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button${
            settings.telegramAuto1mImageMode !== 'off' ? ' tool-chip-active' : ''
          }`}
          onClick={() => {
            const order: Array<'off' | 'smart' | 'always'> = ['off', 'smart', 'always'];
            const i = order.indexOf(settings.telegramAuto1mImageMode);
            apply({ telegramAuto1mImageMode: order[(i + 1) % order.length] });
          }}
          disabled={telegramTestSending}
          title="1m 자동: 신호 감지마다 tv-frame+차트 캡처 후 전송(구 ‘끔/지능/항상’은 동일 캡처·호환용 라벨)"
          style={{
            ...qChip,
            opacity: telegramTestSending ? 0.75 : 1,
            cursor: telegramTestSending ? 'wait' : 'pointer',
            fontSize: 11,
          }}
        >
          {settings.telegramAuto1mImageMode === 'off'
            ? '1m캡:끔'
            : settings.telegramAuto1mImageMode === 'smart'
              ? '1m캡:지능'
              : '1m캡:항상'}
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button${settings.telegramHtfZonePackEnabled !== false ? ' tool-chip-active' : ''}`}
          onClick={() =>
            apply({ telegramHtfZonePackEnabled: !(settings.telegramHtfZonePackEnabled !== false) })
          }
          title="1h·4h·1d·1w·1M(BTC/ETH) 자동 텔레에 HotZone·기관밴드·강한존·접근·구조 마감(확정/실패) 줄을 합침(로켓/선행과 병합 가능)"
          style={{ ...qChip, fontSize: 11 }}
        >
          HTF존팩
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button${settings.telegramHtfSealedBarOnly !== false ? ' tool-chip-active' : ''}`}
          onClick={() =>
            apply({ telegramHtfSealedBarOnly: !(settings.telegramHtfSealedBarOnly !== false) })
          }
          title="존/밴드/HotZone 판정을 직전 마감봉 기준(권장). 끄면 형성 중 봉 기준·알림이 잦아질 수 있음"
          style={{ ...qChip, fontSize: 11 }}
        >
          HTF마감봉
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button${settings.telegramMultiTfEnabled ? ' tool-chip-active' : ''}`}
          onClick={() => apply({ telegramMultiTfEnabled: !settings.telegramMultiTfEnabled })}
          title="지정한 심볼·HTF(1h~1M)마다 백그라운드 분석 후 조건 시 텔레(본문만, 차트 TF 무관). 우측 패널 · 가상매매 탭에서 심볼/TF/간격 편집"
          style={{ ...qChip, fontSize: 11 }}
        >
          멀티TF
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.showBitcoinPowerLawBands ? 'tool-chip-active' : ''}`}
          disabled={!isBitcoinPowerLawChartSymbol(symbol)}
          onClick={() => apply({ showBitcoinPowerLawBands: !settings.showBitcoinPowerLawBands })}
          title="Bitcoin Power Law Bands — 중심(회)·지지(녹)·저항(적) 곡선. BTCUSDT 등 BTC 기축만 (교육·참고)"
          style={{
            ...qChip,
            opacity: isBitcoinPowerLawChartSymbol(symbol) ? 1 : 0.45,
            cursor: isBitcoinPowerLawChartSymbol(symbol) ? 'pointer' : 'not-allowed',
          }}
        >
          BTC파워
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${settings.showSmartAdaptiveSignal !== false ? 'tool-chip-active' : ''}`}
          onClick={() => apply({ showSmartAdaptiveSignal: settings.showSmartAdaptiveSignal === false })}
          title="Smart Adaptive Signal — VWAP+AMA·일봉 MA 근사, 롱 🐂·숏 🦅·목표선. 상단 바에도 SAS 버튼 있음 (교육·참고)"
          style={qChip}
        >
          SAS
        </button>
        <button
          type="button"
          className={`tool-chip tool-chip-button ${
            settings.showSmcDeskEq ||
            settings.showSmcDeskOrderBlocks ||
            settings.showSmcDeskStructure ||
            settings.showSmcDeskZoneStrength
              ? 'tool-chip-active'
              : ''
          }`}
          onClick={() => {
            const anyOn =
              settings.showSmcDeskEq ||
              settings.showSmcDeskOrderBlocks ||
              settings.showSmcDeskStructure ||
              settings.showSmcDeskZoneStrength;
            const next = !anyOn;
            apply({
              showSmcDeskEq: next,
              showSmcDeskOrderBlocks: next,
              showSmcDeskStructure: next,
              showSmcDeskZoneStrength: next,
            });
          }}
          title="SMC 데스크: EQ·OB·BOS·CHOCH·존 거래량비중 (캔들 기준, 교육·참고). 프리미엄/디스카운트 면은 표시 안 함. 다시 누르면 전부 끔"
          style={qChip}
        >
          SMC데스크
        </button>
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <button
            type="button"
            className={`tool-chip tool-chip-button ${settings.chartSmcDeskAiFusionPanel !== false ? 'tool-chip-active' : ''}`}
            onClick={() => apply({ chartSmcDeskAiFusionPanel: settings.chartSmcDeskAiFusionPanel === false })}
            title="차트 우상단: AI 롱·숏 합성(aiFusion) + 5요소 확정(confirmedSignal) + SMC합류 요약 패널"
            style={qChip}
          >
            합성패널{settings.chartSmcDeskAiFusionPanel !== false ? 'ON' : 'OFF'}
          </button>
        )}
        {isSmcCompositeMode && (
          <>
            {uiMode !== 'SMC_DELTA_DESK' && (
              <>
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${settings.chartSmcCompositeChartDrawing !== false ? 'tool-chip-active' : ''}`}
                  onClick={() => apply({ chartSmcCompositeChartDrawing: settings.chartSmcCompositeChartDrawing === false })}
                  title="진입·SL·TP를 차트에 가로선으로 작도(smc-composite-*). 끄면 기본 ls-plan 선만 표시"
                  style={qChip}
                >
                  합성작도{settings.chartSmcCompositeChartDrawing !== false ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${settings.chartSmcDeskCompositeFloatingPanel === true ? 'tool-chip-active' : ''}`}
                  onClick={() =>
                    apply({ chartSmcDeskCompositeFloatingPanel: !settings.chartSmcDeskCompositeFloatingPanel })
                  }
                  title="우측 요약 패널(점수·시나리오·리플레이). 기본은 차트 작도만"
                  style={qChip}
                >
                  합성요약패널{settings.chartSmcDeskCompositeFloatingPanel === true ? 'ON' : 'OFF'}
                </button>
              </>
            )}
            {uiMode === 'SMC_DELTA_DESK' && (
              <button
                type="button"
                className={`tool-chip tool-chip-button ${settings.chartSmcDeltaDeskShowLegacy === true ? 'tool-chip-active' : ''}`}
                onClick={() => apply({ chartSmcDeltaDeskShowLegacy: !settings.chartSmcDeltaDeskShowLegacy })}
                title="기존 SMC 레이어(합류/볼배/플레이북/구간돌파 등) 표시 복구"
                style={qChip}
              >
                기존SMC레이어{settings.chartSmcDeltaDeskShowLegacy === true ? 'ON' : 'OFF'}
              </button>
            )}
          </>
        )}
        {isSmartMoneyMvpMode && (
          <>
            <button
              type="button"
              className={`tool-chip tool-chip-button ${smartRule?.enabled !== false ? 'tool-chip-active' : ''}`}
              onClick={() => saveSmartRule({ enabled: !(smartRule?.enabled !== false) })}
              title="독수리1호 규칙 알림 ON/OFF"
              style={qChip}
              disabled={smartRuleLoading || !smartRule}
            >
              규칙알림{smartRule?.enabled !== false ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={() => {
                if (!smartRule) return;
                const cur = Number(smartRule.minTotalScore || 80);
                const next = cur >= 90 ? 70 : cur + 5;
                void saveSmartRule({ minTotalScore: next });
              }}
              title="알림 최소 점수(70~90) 순환"
              style={qChip}
              disabled={smartRuleLoading || !smartRule}
            >
              점수≥{Math.round(Number(smartRule?.minTotalScore ?? 80))}
            </button>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={() => {
                if (!smartRule) return;
                const cur = Number(smartRule.minProbabilityEdge || 20);
                const next = cur >= 30 ? 10 : cur + 5;
                void saveSmartRule({ minProbabilityEdge: next });
              }}
              title="알림 최소 확률우위(10~30%) 순환"
              style={qChip}
              disabled={smartRuleLoading || !smartRule}
            >
              우위≥{Math.round(Number(smartRule?.minProbabilityEdge ?? 20))}%
            </button>
            {analysis?.smartMoneyMvpSignal?.matchedRuleId && (
              <span className="tool-chip" style={{ ...qChip, color: '#86efac', borderColor: 'rgba(34,197,94,0.45)' }}>
                규칙충족 {analysis.smartMoneyMvpSignal.matchedRuleId}
              </span>
            )}
            {analysis?.smartMoneyMvpSignal?.workflowState && (
              <span
                className="tool-chip"
                style={{
                  ...qChip,
                  color:
                    analysis.smartMoneyMvpSignal.workflowState === 'TRIGGERED'
                      ? '#86efac'
                      : analysis.smartMoneyMvpSignal.workflowState === 'ARMED'
                        ? '#67e8f9'
                        : analysis.smartMoneyMvpSignal.workflowState === 'INVALID'
                          ? '#fca5a5'
                          : '#cbd5e1',
                  borderColor: 'rgba(148,163,184,0.35)',
                }}
                title="독수리1호 상태머신: IDLE → SETUP → ARMED → TRIGGERED / INVALID"
              >
                상태 {analysis.smartMoneyMvpSignal.workflowState}
              </span>
            )}
            {smartWorkflowStrip.length > 0 && (
              <span
                className="tool-chip"
                style={{ ...qChip, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="최근 상태 전환 히스토리 (오래된 순 → 최신)"
              >
                히스토리
                {smartWorkflowStrip.map((x, i) => (
                  <span
                    key={`${x.at}-${i}`}
                    title={`${new Date(x.at).toLocaleString()} · ${x.state} · 점수 ${Math.round(x.score)} · 우위 ${x.probabilityEdge.toFixed(1)}%`}
                    onClick={() => setSelectedWorkflowSignalTime(x.signalTime ?? null)}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      display: 'inline-block',
                      background: x.color,
                      border: '1px solid rgba(2,6,23,0.55)',
                      cursor: x.signalTime != null ? 'pointer' : 'default',
                    }}
                  />
                ))}
                {selectedWorkflowSignalTime != null && (
                  <button
                    type="button"
                    className="tool-chip tool-chip-button"
                    style={{ padding: '2px 6px', fontSize: 10 }}
                    onClick={() => setSelectedWorkflowSignalTime(null)}
                    title="선택한 히스토리 마커 해제"
                  >
                    해제
                  </button>
                )}
              </span>
            )}
          </>
        )}
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <>
            <button
              type="button"
              className={`tool-chip tool-chip-button ${settings.chartDepthDeltaRegimeFilter !== false ? 'tool-chip-active' : ''}`}
              onClick={() => apply({ chartDepthDeltaRegimeFilter: settings.chartDepthDeltaRegimeFilter === false })}
              title="Δ유동성 필터: 레짐/함정(trap) 기반 감점·규칙충족 판단"
              style={qChip}
            >
              Δ유동성필터{settings.chartDepthDeltaRegimeFilter !== false ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className={`tool-chip tool-chip-button ${settings.chartDepthDeltaAlignmentWeight !== false ? 'tool-chip-active' : ''}`}
              onClick={() => apply({ chartDepthDeltaAlignmentWeight: settings.chartDepthDeltaAlignmentWeight === false })}
              title="Δ정렬 가중: 컨플루언스 점수·태그·MTF 요약에 Δ정렬 반영"
              style={qChip}
            >
              Δ정렬가중{settings.chartDepthDeltaAlignmentWeight !== false ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className={`tool-chip tool-chip-button ${settings.chartDepthDeltaTpAdaptive !== false ? 'tool-chip-active' : ''}`}
              onClick={() => apply({ chartDepthDeltaTpAdaptive: settings.chartDepthDeltaTpAdaptive === false })}
              title="Δ기반 TP 확장: 정렬 강하면 TP 확장, 역행 강하면 TP/SL 보수화"
              style={qChip}
            >
              Δ기반TP확장{settings.chartDepthDeltaTpAdaptive !== false ? 'ON' : 'OFF'}
            </button>
          </>
        )}
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <button
            type="button"
            className={`tool-chip tool-chip-button ${settings.showSmcDeskConfluenceLs !== false ? 'tool-chip-active' : ''}`}
            onClick={() => apply({ showSmcDeskConfluenceLs: settings.showSmcDeskConfluenceLs === false })}
            title="SMC 합류 신호: LinReg 밴드 근접 + 엔진 OB + 최근 BOS/CHOCH 중 2/3 이상일 때 합류·L/S 마커·존 (기존 로켓·L 마커와 별도 id)"
            style={qChip}
          >
            합류신호{settings.showSmcDeskConfluenceLs !== false ? 'ON' : 'OFF'}
          </button>
        )}
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <button
            type="button"
            className={`tool-chip tool-chip-button ${settings.showSmcDeskBallboyHud === true ? 'tool-chip-active' : ''}`}
            onClick={() => apply({ showSmcDeskBallboyHud: settings.showSmcDeskBallboyHud !== true })}
            title="볼배 시그널: 최신 캔들 근처에 볼·L/S 라벨(종합·SMC합류·MTF·확정게이트 요약은 호버). 차트 오버레이"
            style={qChip}
          >
            볼배{settings.showSmcDeskBallboyHud === true ? 'ON' : 'OFF'}
          </button>
        )}
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <button
            type="button"
            className={`tool-chip tool-chip-button ${settings.showSmcDeskRangeBreakoutZones === true ? 'tool-chip-active' : ''}`}
            onClick={() => apply({ showSmcDeskRangeBreakoutZones: settings.showSmcDeskRangeBreakoutZones !== true })}
            title="구간 돌파: 최근 N봉(마지막 제외) 고저 박스 — 마지막 봉 종가가 밖이면 면+핀(시도/확정은 몸통 비중·참고)"
            style={qChip}
          >
            구간돌파{settings.showSmcDeskRangeBreakoutZones === true ? 'ON' : 'OFF'}
          </button>
        )}
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <button
            type="button"
            className={`tool-chip tool-chip-button ${settings.showSmcDeskEntryPlaybook !== false ? 'tool-chip-active' : ''}`}
            onClick={() =>
              apply({ showSmcDeskEntryPlaybook: settings.showSmcDeskEntryPlaybook === false })
            }
            title="SMC 플레이북: BOS→스윕→CHoCH 시 타점·OTE·IDM·TP1~3(분석 targets·지지/저항 정렬). 차트 ls-plan(C/SL/TP)은 시그널·computeTradePlan 별도. 드래그 불가·참고용"
            style={qChip}
          >
            플레이북{settings.showSmcDeskEntryPlaybook !== false ? 'ON' : 'OFF'}
          </button>
        )}
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <button
            type="button"
            className={`tool-chip tool-chip-button ${settings.chartSmcStructurePhaseCandles !== false ? 'tool-chip-active' : ''}`}
            onClick={() =>
              apply({ chartSmcStructurePhaseCandles: !(settings.chartSmcStructurePhaseCandles !== false) })
            }
            title="구조(BOS/CHOCH) 돌파 봉 단계별 캔들 색 — 끄면 구조 하이라이트만 제거(pre3·근접은 유지)"
            style={qChip}
          >
            구조캔들{settings.chartSmcStructurePhaseCandles !== false ? 'ON' : 'OFF'}
          </button>
        )}
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <button
            type="button"
            className={`tool-chip tool-chip-button ${settings.chartCandleCompositeLayers !== false ? 'tool-chip-active' : ''}`}
            onClick={() =>
              apply({ chartCandleCompositeLayers: !(settings.chartCandleCompositeLayers !== false) })
            }
            title="겹침 분리: 본봉은 OHLC 방향색, 테두리=우선 신호, 심지=둘째 신호. 끄면 예전처럼 한 규칙만"
            style={qChip}
          >
            겹침분리{settings.chartCandleCompositeLayers !== false ? 'ON' : 'OFF'}
          </button>
        )}
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#cbd5e1' }}
            title="줄·존 근접 반짝 민감도. 높이면 더 쉽게 감지(임계 확대)"
          >
            근접
            <input
              type="range"
              min={35}
              max={260}
              step={5}
              value={Math.round(
                (Number.isFinite(settings.chartLineZoneProximitySensitivity)
                  ? Math.max(0.35, Math.min(2.6, settings.chartLineZoneProximitySensitivity))
                  : 1) * 100
              )}
              onChange={(e) =>
                apply({ chartLineZoneProximitySensitivity: Math.max(0.35, Math.min(2.6, Number(e.target.value) / 100)) })
              }
              style={{ width: 72, verticalAlign: 'middle' }}
            />
          </label>
        )}
        {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#cbd5e1' }}
            title="돌파·안착 직후 몇 봉까지 연한 trace 캔들 톤(0=끔)"
          >
            꼬리
            <input
              type="range"
              min={0}
              max={8}
              step={1}
              value={Math.max(0, Math.min(8, Math.floor(settings.chartSmcStructureTraceBars ?? 0)))}
              onChange={(e) => apply({ chartSmcStructureTraceBars: Math.max(0, Math.min(8, Number(e.target.value))) })}
              style={{ width: 56, verticalAlign: 'middle' }}
            />
          </label>
        )}
        {isSmcDeskMode && uiMode !== 'SMC_DELTA_DESK' && (
          <button
            type="button"
            className={`tool-chip tool-chip-button ${settings.chartCandleRuleDebug === true ? 'tool-chip-active' : ''}`}
            onClick={() => apply({ chartCandleRuleDebug: !settings.chartCandleRuleDebug })}
            title="크로스헤어를 올린 봉의 캔들 색 규칙을 차트 하단에 표시(검증·교육)"
            style={qChip}
          >
            캔들규칙{settings.chartCandleRuleDebug === true ? 'ON' : 'OFF'}
          </button>
        )}
        <button
          type="button"
          className={`tool-chip tool-chip-button ${showUnifiedCandleMarkers ? 'tool-chip-active' : ''}`}
          onClick={() => apply({ showUnifiedCandleMarkers: !showUnifiedCandleMarkers })}
          title="캔들분석 보조 마커(C↑/T↑ 등). L·🚀과 같은 봉이면 생략"
          style={qChip}
        >
          캔들신호{showUnifiedCandleMarkers ? 'ON' : 'OFF'}
        </button>
        {onPre3SimilarityChange != null && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              color: '#cbd5e1',
              flexWrap: 'wrap',
            }}
            title="장대봉 직전 2캔 vs 패턴 유사도 하한(낮추면 반짝↑). JSON 없으면 현재 로드 캔들로 자동 구축. 기본 100%"
          >
            <span style={{ whiteSpace: 'nowrap' }}>반짝유사도</span>
            <input
              type="range"
              min={0.55}
              max={1}
              step={0.01}
              value={effectivePre3Thr}
              onChange={(e) => onPre3SimilarityChange(Math.max(0.55, Math.min(1, parseFloat(e.target.value) || 1)))}
              style={{ width: 100, verticalAlign: 'middle', accentColor: '#f472b6' }}
            />
            <span style={{ minWidth: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{(effectivePre3Thr * 100).toFixed(0)}%</span>
          </label>
        )}
        {onPre3ConfirmOnCloseChange != null && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              color: '#cbd5e1',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="켜면: 마지막 봉이 마감된 뒤에만 반짝·기록 확정(실시간 깜빡임 감소)"
          >
            <input
              type="checkbox"
              checked={effectivePre3ConfirmOnClose}
              onChange={(e) => onPre3ConfirmOnCloseChange(e.target.checked)}
            />
            마감확정
          </label>
        )}
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={restoreDefaultChartView}
          title="줌·스크롤 후 복구 — 최신 캔들 기준으로 보이는 구간·가격축 자동 맞춤(앱 분석과 동일한 봉 수)"
          style={qChip}
        >
          {isNarrowUi ? '뷰복원' : '화면비율·뷰 복원'}
        </button>
              </>
            )}
          </>
        )}
      </div>

      {chartSectionVis.s1 && (
      <div
        ref={topbarMenuRef}
        className={`chart-topbar ${isNarrowUi ? 'chart-topbar--narrow' : ''}`}
        style={{
          transform: isNarrowUi ? undefined : `translate(${topbarMenuPos.x}px, ${topbarMenuPos.y}px)`,
          pointerEvents: 'auto',
        }}
      >
        {smcDeskWelcomeToast && (
          <div
            role="status"
            style={{
              position: 'fixed',
              left: '50%',
              top: 'max(12px, env(safe-area-inset-top, 0px))',
              transform: 'translateX(-50%)',
              zIndex: 200,
              maxWidth: 'min(92vw, 440px)',
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(15,23,42,0.94)',
              border: '1px solid rgba(98,239,224,0.45)',
              color: '#e2e8f0',
              fontSize: 12,
              lineHeight: 1.55,
              boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ marginBottom: 8 }}>{smcDeskWelcomeToast}</div>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600 }}
              onClick={() => setSmcDeskWelcomeToast(null)}
            >
              닫기
            </button>
          </div>
        )}
        {isNarrowUi ? (
          <>
            <div className="toolbar chart-toolbar-col">
              <div
                className="chart-toolbar-row chart-toolbar-row--scroll"
                style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
              >
                <UIModeSwitcher compact uiMode={uiMode} setUiMode={setUiMode} style={{ marginRight: 0 }} />
                {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
                  <span
                    className="tool-chip"
                    title="TradingView/SMC 스타일 압축 — 존·줄·밴드·캔들 마커 우선"
                    style={{
                      padding: '4px 8px',
                      fontSize: 9,
                      fontWeight: 800,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      borderColor: 'rgba(98,239,224,0.5)',
                      color: '#62efe0',
                      background: 'rgba(98,239,224,0.12)',
                      cursor: 'default',
                    }}
                  >
                    SMC·압축
                  </span>
                )}
              </div>
              <div className="chart-toolbar-row chart-toolbar-row--scroll">
                {hzDualLeftChrome ? (
                  <span
                    className="tool-chip"
                    style={{
                      ...qChip,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      borderColor: 'rgba(125,211,252,0.45)',
                      color: '#7dd3fc',
                      fontWeight: 800,
                      cursor: 'default',
                    }}
                    title="핫존 듀얼 뷰 — 좌측은 일봉(1D) 고정"
                  >
                    핫존 듀얼 · 일봉 1D
                  </span>
                ) : (
                  ['1m','3m','5m','15m','1h','4h','1d','1w','1M','1Y'].map(tf => {
                    const sig = mtfSignalByTf.get(tf);
                    const tfLabel = tf === '1w' ? '1W' : tf;
                    const sigColor = sig?.verdict === 'LONG' ? '#22C55E' : sig?.verdict === 'SHORT' ? '#EF4444' : '#94a3b8';
                    return (
                      <button
                        key={tf}
                        type="button"
                        className={`tool-chip tool-chip-button ${timeframe === tf ? 'tool-chip-active' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          selectTimeframe(tf);
                        }}
                        title={sig ? `${tfLabel} ${sig.verdictKo}` : (tf === '1w' ? '주봉' : tf === '1M' ? '월봉' : tf === '1Y' ? '연봉' : undefined)}
                        style={{ ...qChip, flexShrink: 0, whiteSpace: 'nowrap' }}
                      >
                        {tfLabel}
                        {sig && sig.verdictKo !== '-' && (
                          <span style={{ marginLeft: 3, fontWeight: 700, color: sigColor, fontSize: isNarrowUi ? 9 : undefined }}>
                            {sig.verdictKo}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="chart-toolbar-row chart-toolbar-row--settings">
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${settings.showSmartAdaptiveSignal !== false ? 'tool-chip-active' : ''}`}
                  onClick={() => apply({ showSmartAdaptiveSignal: settings.showSmartAdaptiveSignal === false })}
                  title="SAS: 롱🐂·숏🦅 목표선"
                  style={{ fontWeight: 700, padding: '4px 8px', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  SAS
                </button>
                {isAiMode && (
                  <>
                    <button
                      type="button"
                      className={`tool-chip tool-chip-button ${whaleDynamicRsProEnabled ? 'tool-chip-active' : ''}`}
                      onClick={() => applyModeFeature('whaleDynamicRsProEnabled', !whaleDynamicRsProEnabled)}
                      title="Dynamic R/S"
                      style={{ fontWeight: 600, padding: '4px 8px', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      DRS
                    </button>
                    <button
                      type="button"
                      className={`tool-chip tool-chip-button ${whaleLiquidityBiasEnabled ? 'tool-chip-active' : ''}`}
                      onClick={() => applyModeFeature('whaleLiquidityBiasEnabled', !whaleLiquidityBiasEnabled)}
                      title="LQB 유동성 존(BSL/SSL 면)"
                      style={{ fontWeight: 600, padding: '4px 8px', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      LQB
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={`tool-chip tool-chip-button ${labelMenuOpen ? 'tool-chip-active' : ''}`}
                  onClick={() => setLabelMenuOpen(v => !v)}
                  title="차트 표시 옵션 및 라벨 설정"
                  style={{ fontWeight: 600, padding: '4px 10px', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  ⚙ 설정
                </button>
              </div>
            </div>
            <div className="toolbar toolbar-actions chart-toolbar-actions-narrow">
              <div className="live-box" style={{ fontSize: 10, padding: '5px 8px' }}>실시간 · {lastUpdate || '--:--:--'}</div>
              <button type="button" className="fullscreen-btn" style={{ fontSize: 10, padding: '6px 10px' }} onClick={toggleFullscreen}>
                {isFullscreen ? '종료' : '전체'}
              </button>
            </div>
          </>
        ) : (
          <>
        <div className="toolbar">
          <button
            type="button"
            className="tool-chip tool-chip-button"
            title="드래그해서 메뉴 이동"
            onMouseDown={startMenuDrag('topbar')}
            style={{ cursor: 'grab' }}
          >
            ↕ 이동
          </button>
          <UIModeSwitcher uiMode={uiMode} setUiMode={setUiMode} style={{ marginRight: 8 }} />
          {isSmartDeskLikeMode && uiMode !== 'SMC_DELTA_DESK' && (
            <span
              className="tool-chip"
              title="TradingView/SMC 스타일 압축 — 존·줄·밴드·캔들 마커 우선"
              style={{
                marginRight: 8,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 800,
                flexShrink: 0,
                whiteSpace: 'nowrap',
                borderColor: 'rgba(98,239,224,0.45)',
                color: '#62efe0',
                background: 'rgba(98,239,224,0.1)',
                cursor: 'default',
              }}
            >
              SMC 데스크 · 압축 뷰
            </span>
          )}
          {isAiMode && (
            <>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${whaleDynamicRsProEnabled ? 'tool-chip-active' : ''}`}
                onClick={() => applyModeFeature('whaleDynamicRsProEnabled', !whaleDynamicRsProEnabled)}
                title="Dynamic R/S PRO 요약 — 피벗·ATR 존 (차트 설정에도 동일)"
                style={{ marginRight: 4, padding: '6px 10px', fontSize: 11, fontWeight: 600 }}
              >
                DRS
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${whaleLiquidityBiasEnabled ? 'tool-chip-active' : ''}`}
                onClick={() => applyModeFeature('whaleLiquidityBiasEnabled', !whaleLiquidityBiasEnabled)}
                title="LQB — BSL/SSL 유동성 존(ATR 두께 면), 가로선·떠다니는 텍스트 없음"
                style={{ marginRight: 8, padding: '6px 10px', fontSize: 11, fontWeight: 600 }}
              >
                LQB
              </button>
            </>
          )}
          <button
            type="button"
            className={`tool-chip tool-chip-button ${settings.showSmartAdaptiveSignal !== false ? 'tool-chip-active' : ''}`}
            onClick={() => apply({ showSmartAdaptiveSignal: settings.showSmartAdaptiveSignal === false })}
            title="Smart Adaptive Signal — 롱 🐂 · 숏 🦅 · 목표선 (차트 우측 상단 빠른 메뉴에도 SAS 있음)"
            style={{ marginRight: 8, fontWeight: 700 }}
          >
            SAS
          </button>
          {hzDualLeftChrome ? (
            <span
              className="tool-chip"
              style={{
                marginRight: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 800,
                border: '1px solid rgba(125,211,252,0.4)',
                borderRadius: 8,
                color: '#7dd3fc',
                cursor: 'default',
              }}
              title="핫존 듀얼 뷰 — 좌측은 일봉(1D) 고정"
            >
              핫존 듀얼 · 일봉 1D
            </span>
          ) : (
            ['1m','3m','5m','15m','1h','4h','1d','1w','1M','1Y'].map(tf => {
              const sig = mtfSignalByTf.get(tf);
              const tfLabel = tf === '1w' ? '1W' : tf;
              const sigColor = sig?.verdict === 'LONG' ? '#22C55E' : sig?.verdict === 'SHORT' ? '#EF4444' : '#94a3b8';
              return (
                <button
                  key={tf}
                  className={`tool-chip tool-chip-button ${timeframe === tf ? 'tool-chip-active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectTimeframe(tf);
                  }}
                  title={sig ? `${tfLabel} ${sig.verdictKo}` : (tf === '1w' ? '주봉' : tf === '1M' ? '월봉' : tf === '1Y' ? '연봉' : undefined)}
                >
                  {tfLabel}
                  {sig && sig.verdictKo !== '-' && (
                    <span style={{ marginLeft: 4, fontWeight: 700, color: sigColor }}>
                      {sig.verdictKo}
                    </span>
                  )}
                </button>
              );
            })
          )}
          <button
            type="button"
            className={`tool-chip tool-chip-button ${labelMenuOpen ? 'tool-chip-active' : ''}`}
            onClick={() => setLabelMenuOpen(v => !v)}
            title="차트 표시 옵션 및 라벨 설정"
            style={{ fontWeight: 600, padding: '6px 12px', marginLeft: 8 }}
          >
            ⚙ 설정
          </button>
        </div>
        <div className="toolbar toolbar-actions">
          <div className="live-box">실시간 · {lastUpdate || '--:--:--'}</div>
          <button type="button" className="fullscreen-btn" onClick={toggleFullscreen}>{isFullscreen ? '전체화면 종료' : '전체화면'}</button>
        </div>
          </>
        )}
        {labelMenuOpen &&
          typeof document !== 'undefined' &&
          createPortal(
          <div
            ref={labelSettingsPanelRef}
            className={`label-settings-panel ${isNarrowUi && !labelSettingsPanelPos ? 'label-settings-panel--sheet' : ''}`}
            style={labelSettingsPanelLayoutStyle}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: labelSettingsBodyCollapsed ? 0 : 12,
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  onMouseDown={startLabelSettingsPanelDrag}
                  title="드래그해서 차트 설정 패널 이동 (위치는 저장됩니다)"
                  style={{ cursor: 'grab', flexShrink: 0, padding: '4px 8px', fontSize: 10 }}
                >
                  ↕ 이동
                </button>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', userSelect: 'none' }}>차트 설정</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(98,239,224,0.2)', color: '#62efe0' }}
                  onClick={() => {
                    const m = uiMode as SettingsUIMode;
                    const allOn = { showStructure: true, showZones: true, showLabels: true, showScenario: true, showFib: true, showRsi: true, showHarmonic: true, showChartPrimeTrendChannels: true, showPo3: true, showCandle: true, showBpr: true, showVision: true, showVisionTriangle: true, showVisionFlag: true, showVisionWedge: true, showVisionReversal: true, showVisionRange: true, showReactionZone: true, showWhaleZone: true, showLvrb: true, showVolatilityTrendScore: true, showTailongClose: true, showTailongCloseBreakout: true, showTailongCloseWick: true, showTailongCloseBody: true, showTailongCloseFlow: true, whaleShowForecastBoxes: true, whaleShowAccumulationBoxes: true, whaleShowDistributionBoxes: true, whaleOnlyLockedBoxes: false, whaleDeleteBrokenBoxes: true, whaleUsePrecomputedMemory: true, whalePredictHorizonBars: 3, whalePredictMinConfidence: 65, whalePredictShowHitRate: true, whaleHotZoneEnabled: true, whaleHotZoneLookback: 200, whaleHotZoneResolution: 30, whaleHotZoneSrThreshold: 80, whaleHotZoneLayers: 3, whaleStructureBounceEnabled: true, whaleHyperTrendEnabled: true, whaleHyperTrendMult: 5, whaleHyperTrendSlope: 14, whaleHyperTrendWidthPct: 80, whaleDynamicRsProEnabled: true, whaleLiquidityBiasEnabled: true };
                    apply({
                      modeFeatureOverrides: { ...(settings.modeFeatureOverrides || {}), [m]: allOn },
                      ...(m === 'CANDLE_ANALYSIS' || m === 'BIBLE_MODE' || m === 'UNIFIED_DESK' || m === 'AI_ZONE'
                        ? {
                            candleAnalysisMergeEngineOverlays: true,
                            candleAnalysisShowSmartGuide: true,
                            candleAnalysisShowElliottMvp: true,
                            candleAnalysisShowPlaybookPath: true,
                            candleAnalysisShowAutoZones: true,
                            candleAnalysisShowEngineFvg: true,
                            candleAnalysisShowTrendPattern: true,
                            candleAnalysisHashFibEnabled: true,
                            candleAnalysisZoneChartVisible: true,
                            candleAnalysisBosWavesEnabled: true,
                            candleAnalysisVifvgEnabled: true,
                            candleAnalysisBreakerBlocksEnabled: true,
                            candleAnalysisCoreSdZones: true,
                          }
                        : {}),
                    });
                  }}
                  title="현재 모드에서 보이는 기능 전부 켜기"
                >
                  {(uiMode === 'FULL' || uiMode === 'EVOLUTION' || uiMode === 'MAX_ANALYSIS' || isSmcDeskMode || isSmartMoneyMvpMode)
                    ? uiMode === 'EVOLUTION'
                      ? '진화'
                      : uiMode === 'MAX_ANALYSIS'
                        ? '최강분석'
                        : uiMode === 'SMART_MONEY_MVP'
                          ? '세력MVP'
                        : uiMode === 'SMC_DESK_COMPOSITE'
                          ? '데스크합성'
                          : uiMode === 'SMC_DELTA_DESK'
                            ? '데스크Δ'
                          : uiMode === 'SMC_DESK'
                            ? 'SMC 데스크'
                            : '전체'
                    : uiMode === 'FOCUS'
                      ? '포커스'
                      : uiMode === 'EXECUTION'
                        ? '실행'
                        : uiMode === 'SMART'
                          ? '스마트'
                          : uiMode === 'CANDLE_ANALYSIS'
                              ? '캔들분석'
                              : uiMode === 'BIBLE_MODE'
                                ? '바이블'
                              : uiMode === 'HOT_ZONE'
                                ? '핫존'
                              : uiMode === 'UNIFIED_DESK' || uiMode === 'AI_ZONE'
                                ? '통합작도'
                              : uiMode === 'TAPPOINT'
                                ? '타점'
                                : '고래'} 모드 기능 전부 켜기
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setLabelSettingsBodyCollapsed(c => !c)}
                  title={labelSettingsBodyCollapsed ? '일괄·ON/OFF·가격·라벨 목록 다시 표시' : '아래 본문만 접기 — 헤더·이 버튼들은 유지'}
                >
                  {labelSettingsBodyCollapsed ? '펴기' : '접기'}
                </button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setLabelMenuOpen(false)}>
                  닫기
                </button>
              </div>
            </div>
            {!labelSettingsBodyCollapsed && (
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                  {!isAiMode && (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: '10px 12px',
                        fontSize: 11,
                        lineHeight: 1.55,
                        color: '#cbd5e1',
                        background: 'rgba(15,23,42,0.8)',
                        borderRadius: 8,
                        border: '1px solid rgba(98,239,224,0.28)',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: '#62efe0' }}>Dynamic R/S · LQB</span>는{' '}
                      <strong style={{ color: '#e2e8f0' }}>고래</strong> 모드에서만 동작합니다. 상단 「모드」줄에서{' '}
                      <button
                        type="button"
                        className="tool-chip tool-chip-button"
                        style={{ padding: '2px 10px', fontSize: 11, fontWeight: 700, margin: '0 4px', background: 'rgba(98,239,224,0.15)', borderColor: 'rgba(98,239,224,0.45)' }}
                        onClick={() => setUiMode('WHALE')}
                      >
                        고래로 전환
                      </button>
                      를 누른 뒤, 이 패널을 아래로 스크롤하면「고래 모드 전용 박스」→「Pine 툴킷 (요약)」에 토글이 있습니다. 고래 모드일 때는 상단 툴바에 <strong style={{ color: '#94a3b8' }}>DRS / LQB</strong> 칩도 보입니다.
                    </div>
                  )}
                  <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>차트 일괄 정리 (전체화면·폰)</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                      라벨·가로선·존을 한 번에 끕니다. 상단 빠른 메뉴에도 동일 버튼이 있습니다. 최강분석에서는「라벨 전부 끄기」를 켜도 공급·수요 존 캡션·가격띠는 남습니다.
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button type="button" className={`tool-chip tool-chip-button ${settings.chartBulkHideLabels ? 'tool-chip-active' : ''}`} onClick={() => apply({ chartBulkHideLabels: !settings.chartBulkHideLabels })}>라벨 전부 끄기</button>
                      <button type="button" className={`tool-chip tool-chip-button ${settings.chartBulkHideHLines ? 'tool-chip-active' : ''}`} onClick={() => apply({ chartBulkHideHLines: !settings.chartBulkHideHLines })}>가로선 전부 끄기</button>
                      <button type="button" className={`tool-chip tool-chip-button ${settings.chartBulkHideZones ? 'tool-chip-active' : ''}`} onClick={() => apply({ chartBulkHideZones: !settings.chartBulkHideZones })}>존 전부 끄기</button>
                      <button type="button" className="tool-chip tool-chip-button" onClick={exportSettingsJson} title="현재 차트 설정을 JSON 파일로 저장">
                        설정 내보내기
                      </button>
                      <button
                        type="button"
                        className="tool-chip tool-chip-button"
                        onClick={() => settingsImportInputRef.current?.click()}
                        title="저장해둔 JSON 설정 파일을 불러와 복원"
                      >
                        설정 가져오기
                      </button>
                      <input
                        ref={settingsImportInputRef}
                        type="file"
                        accept="application/json,.json"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          void importSettingsJson(file);
                          e.currentTarget.value = '';
                        }}
                      />
                      <button type="button" className="tool-chip tool-chip-button" style={{ fontWeight: 600 }} onClick={() => applyVisualCalm()}>
                        시각정리(한 번에)
                      </button>
                      <button type="button" className={`tool-chip tool-chip-button ${showUnifiedCandleMarkers ? 'tool-chip-active' : ''}`} onClick={() => apply({ showUnifiedCandleMarkers: !showUnifiedCandleMarkers })}>캔들신호 마커</button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${(settings.chartVerdictTint ?? 'off') === 'off' ? '' : 'tool-chip-active'}`}
                        onClick={() => apply({ chartVerdictTint: 'off' })}
                      >
                        톤 끔
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${(settings.chartVerdictTint ?? 'off') === 'wash' ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartVerdictTint: 'wash' })}
                        title="롱/숏일 때 차트 전체에 옅은 녹·적 톤"
                      >
                        톤·면
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${(settings.chartVerdictTint ?? 'off') === 'edge' ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartVerdictTint: 'edge' })}
                        title="가격축 쪽 세로 띠로 방향 강조"
                      >
                        톤·띠
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${(settings.chartVerdictTint ?? 'off') === 'priceLine' ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartVerdictTint: 'priceLine' })}
                        title="현재가 가로선만 롱=녹, 숏=적"
                      >
                        톤·현재가
                      </button>
                    </div>
                    {onPre3SimilarityChange != null && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#e2e8f0' }}>반짝 유사도(기록 대비)</span>
                        <input
                          type="range"
                          min={0.55}
                          max={1}
                          step={0.01}
                          value={effectivePre3Thr}
                          onChange={(e) => onPre3SimilarityChange(Math.max(0.55, Math.min(1, parseFloat(e.target.value) || 1)))}
                          style={{ width: 180, maxWidth: '100%', accentColor: '#f472b6' }}
                        />
                        <span style={{ fontSize: 11, color: '#fda4af', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {(effectivePre3Thr * 100).toFixed(0)}%
                        </span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>◆=과거 · ✨=최신봉</span>
                      </div>
                    )}
                    {onPre3ConfirmOnCloseChange != null && (
                      <label style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#e2e8f0', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={effectivePre3ConfirmOnClose}
                          onChange={(e) => onPre3ConfirmOnCloseChange(e.target.checked)}
                        />
                        Pre3 반짝은 봉 마감 후에만 확정
                      </label>
                    )}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                      모드별 기능 ON/OFF — 현재:{' '}
                      <strong style={{ color: '#62efe0' }}>
                        {uiMode === 'FULL'
                          ? '전체'
                          : uiMode === 'EVOLUTION'
                            ? '진화'
                            : uiMode === 'MAX_ANALYSIS'
                              ? '최강분석'
                              : uiMode === 'SMART_MONEY_MVP'
                                ? '세력MVP'
                              : uiMode === 'SMC_DESK_COMPOSITE'
                                ? '데스크합성'
                                : uiMode === 'SMC_DELTA_DESK'
                                  ? '데스크Δ'
                                : uiMode === 'SMC_DESK'
                                  ? 'SMC 데스크'
                              : uiMode === 'FOCUS'
                              ? '포커스'
                              : uiMode === 'EXECUTION'
                                ? '실행'
                                : uiMode === 'SMART'
                                  ? '스마트'
                                  : uiMode === 'CANDLE_ANALYSIS'
                                      ? '캔들분석'
                                      : uiMode === 'UNIFIED_DESK' || uiMode === 'AI_ZONE'
                                        ? '통합작도'
                                      : uiMode === 'TAPPOINT'
                                        ? '타점'
                                        : '고래'}
                      </strong>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>선택한 모드에서 표시할 기능을 켜고 끄세요. 각 모드별로 따로 저장됩니다.</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {isAiMode && (
                        <>
                          <button
                            type="button"
                            className="tool-chip tool-chip-button"
                            onClick={applyWhaleCoreSrPreset}
                            title="존·라벨·고래구간·핫존 ON — 구조 돌파(BOS/CHOCH)·구조 로켓은 핵심 S/R(핵심면) 켤 때만"
                          >
                            핵심 S/R 프리셋
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${whaleCoreSrZoneEnabled ? 'tool-chip-active' : ''}`}
                            onClick={() => applyModeFeature('whaleCoreSrZoneEnabled', !whaleCoreSrZoneEnabled)}
                            title="핵심면 ON 시 구조 돌파·구조 로켓 표시. major S/R 존/선은 다른 토글 OFF여도 유지"
                          >
                            핵심 S/R 유지
                          </button>
                          <button
                            type="button"
                            className="tool-chip tool-chip-button"
                            onClick={applyWhaleCoreSrOnlyPreset}
                            title="핵심 지지/저항 면만 — 구조 돌파는 핵심 S/R과 동일 조건"
                          >
                            핵심 S/R만
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${showWhaleZone ? 'tool-chip-active' : ''}`}
                        onClick={() => applyModeFeature('showWhaleZone', !showWhaleZone)}
                        title={`호가·체결 기반 매수/매도 방어 구간. 차트 면·라벨은 최소 ${Math.max(1, Math.round((settings.chartStrongZoneMinRefreshMs ?? defaultSettings.chartStrongZoneMinRefreshMs) / 1000))}초마다 또는 새 봉이 생길 때만 갱신(실시간 폴링이어도 깜빡임 완화)`}
                      >
                        고래 구간
                      </button>
                      <button type="button" className={`tool-chip tool-chip-button ${showLvrb ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showLvrb', !showLvrb)} title="저변동 레인지·돌파 (Lakshmi LVRB, Pine 로직 포팅)">LVRB</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showVolatilityTrendScore ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVolatilityTrendScore', !showVolatilityTrendScore)} title="Volatility Trend Score [BackQuant] — ▲L / ▼S 전환">VTS</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showStructure ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showStructure', !showStructure)}>구조</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showZones ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showZones', !showZones)}>존/구간</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showScenario ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showScenario', !showScenario)}>시나리오</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showLabels ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showLabels', !showLabels)}>라벨</button>
                      <button type="button" className={`tool-chip tool-chip-button ${labelEditMode ? 'tool-chip-active' : ''}`} onClick={() => apply({ overlayLabelEditMode: !overlayLabelEditMode })} title="겹친 레이블을 드래그 또는 ↑↓ 버튼으로 옮길 수 있습니다">레이블 위치 조정</button>
                      <button type="button" className={`tool-chip tool-chip-button ${translateLabelsToKo ? 'tool-chip-active' : ''}`} onClick={() => apply({ translateLabelsToKo: !translateLabelsToKo })} title="FVG, BOS 등 영어 라벨 한글화. OB는 롱확인·롱대기·롱약함·숏확인·숏대기·숏약함 표기">한글 번역</button>
                      <button type="button" className="tool-chip tool-chip-button" style={{ fontSize: 10 }} onClick={() => { setOverlayOffsets({}); try { window.localStorage.removeItem(OVERLAY_OFFSETS_KEY); } catch {} setOverlayTick(v => v + 1); }} title="모든 레이블 위치를 기본으로 되돌립니다">위치 초기화</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showFib ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showFib', !showFib)}>피보</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showRsi ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showRsi', !showRsi)}>RSI</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showHarmonic ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showHarmonic', !showHarmonic)}>하모닉</button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${showChartPrimeTrendChannels ? 'tool-chip-active' : ''}`}
                        onClick={() => applyModeFeature('showChartPrimeTrendChannels', !showChartPrimeTrendChannels)}
                        title="ChartPrime 피벗 트렌드 채널·유동성 브레이크. 피벗 길이(L)는 기본 자동(ATR%·TF), 끄면 숫자 직접."
                      >
                        CP채널
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${chartPrimeTrendChannelsVolumeBg ? 'tool-chip-active' : ''}`}
                        onClick={() => applyModeFeature('chartPrimeTrendChannelsVolumeBg', !chartPrimeTrendChannelsVolumeBg)}
                        title="CP 채널 바깥 면 색을 거래량 정규화에 연동(Pine Volume BG). 모드별로 다르게 저장 가능."
                      >
                        CP볼륨면
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${settings.chartPrimeTrendChannelsShowFills !== false ? 'tool-chip-active' : ''}`}
                        onClick={() => {
                          const f = settings.chartPrimeTrendChannelsShowFills !== false;
                          apply({ chartPrimeTrendChannelsShowFills: !f });
                        }}
                        title="Pine 채널 면(linefill) — 끄면 대각선만"
                      >
                        CP면
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${settings.chartTradeSetupFocus === true ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartTradeSetupFocus: !settings.chartTradeSetupFocus })}
                        title="채널을 좁혀 캔들에 밀착하고, 진입·손절·익절(ls-plan) 가로선을 굵게 표시합니다."
                      >
                        매매착시
                      </button>
                      <label
                        className="tool-chip tool-chip-button"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 10 }}
                        title="ChartPrime 채널 폭(ATR 배율). 매매착시를 켜면 추가로 좁아집니다."
                      >
                        CP폭
                        <input
                          type="number"
                          min={0.2}
                          max={2}
                          step={0.05}
                          value={
                            Number.isFinite(settings.chartPrimeTrendChannelsWidthScale)
                              ? settings.chartPrimeTrendChannelsWidthScale
                              : defaultSettings.chartPrimeTrendChannelsWidthScale
                          }
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isFinite(v)) return;
                            apply({ chartPrimeTrendChannelsWidthScale: Math.max(0.15, Math.min(4, v)) });
                          }}
                          style={{
                            width: 44,
                            fontSize: 10,
                            padding: '2px 4px',
                            borderRadius: 4,
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(15,23,42,0.6)',
                            color: '#e2e8f0',
                          }}
                        />
                      </label>
                      <span className="tool-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 6px', fontSize: 9 }} title="CP 상·중·하 색">
                        <input
                          type="color"
                          value={normalizeHex6(settings.chartPrimeTrendChannelsTopHex, defaultSettings.chartPrimeTrendChannelsTopHex)}
                          onChange={(e) => apply({ chartPrimeTrendChannelsTopHex: e.target.value.toUpperCase() })}
                          style={{ width: 22, height: 20, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                          aria-label="CP 상단색"
                        />
                        <input
                          type="color"
                          value={normalizeHex6(settings.chartPrimeTrendChannelsCenterHex, defaultSettings.chartPrimeTrendChannelsCenterHex)}
                          onChange={(e) => apply({ chartPrimeTrendChannelsCenterHex: e.target.value.toUpperCase() })}
                          style={{ width: 22, height: 20, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                          aria-label="CP 중앙선색"
                        />
                        <input
                          type="color"
                          value={normalizeHex6(settings.chartPrimeTrendChannelsBottomHex, defaultSettings.chartPrimeTrendChannelsBottomHex)}
                          onChange={(e) => apply({ chartPrimeTrendChannelsBottomHex: e.target.value.toUpperCase() })}
                          style={{ width: 22, height: 20, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                          aria-label="CP 하단색"
                        />
                      </span>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${settings.chartPrimeTrendChannelsAutoLength !== false ? 'tool-chip-active' : ''}`}
                        onClick={() =>
                          apply({
                            chartPrimeTrendChannelsAutoLength: !(settings.chartPrimeTrendChannelsAutoLength !== false),
                          })
                        }
                        title="켜면 ATR%·타임프레임으로 피벗 길이 자동. 끄면 옆 L 숫자로 수동(2~30)."
                      >
                        CP자동L
                      </button>
                      <label
                        className="tool-chip tool-chip-button"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          fontSize: 10,
                          cursor: settings.chartPrimeTrendChannelsAutoLength === false ? 'pointer' : 'default',
                          opacity: settings.chartPrimeTrendChannelsAutoLength === false ? 1 : 0.85,
                        }}
                        title={
                          settings.chartPrimeTrendChannelsAutoLength === false
                            ? 'Pine Length — 피벗 좌우 봉 수 (2~30)'
                            : `자동 계산된 L=${effectiveChartPrimePivotLength} (끄면 수동 입력)`
                        }
                      >
                        L
                        <input
                          type="number"
                          min={2}
                          max={30}
                          disabled={settings.chartPrimeTrendChannelsAutoLength !== false}
                          value={
                            settings.chartPrimeTrendChannelsAutoLength === false
                              ? manualChartPrimePivotLen
                              : effectiveChartPrimePivotLength
                          }
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isFinite(v)) return;
                            apply({ chartPrimeTrendChannelsLength: Math.max(2, Math.min(30, v)) });
                          }}
                          style={{ width: 36, fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.6)', color: '#e2e8f0' }}
                        />
                      </label>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${settings.chartPrimeTrendChannelsWait !== false ? 'tool-chip-active' : ''}`}
                        onClick={() => {
                          const w = settings.chartPrimeTrendChannelsWait !== false;
                          apply({ chartPrimeTrendChannelsWait: !w });
                        }}
                        title="Pine Wait for Break"
                      >
                        CP대기
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${settings.chartPrimeTrendChannelsExtend === true ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartPrimeTrendChannelsExtend: !Boolean(settings.chartPrimeTrendChannelsExtend) })}
                        title="Pine Extend Line — 채널을 최신 봉까지 연장"
                      >
                        CP연장
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${settings.chartPrimeTrendChannelsShowLastOnly !== false ? 'tool-chip-active' : ''}`}
                        onClick={() => {
                          const s = settings.chartPrimeTrendChannelsShowLastOnly !== false;
                          apply({ chartPrimeTrendChannelsShowLastOnly: !s });
                        }}
                        title="Pine Show Last Channel — 끄면 새 채널 시 이전 채널 선을 비움"
                      >
                        CP마지막만
                      </button>
                      <button type="button" className={`tool-chip tool-chip-button ${showBpr ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showBpr', !showBpr)}>BPR</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showVision ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVision', !showVision)}>Vision</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showVisionTriangle ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionTriangle', !showVisionTriangle)} title="위삼각">△</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showVisionFlag ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionFlag', !showVisionFlag)}>Flag</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showVisionWedge ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionWedge', !showVisionWedge)}>Wedge</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showVisionReversal ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionReversal', !showVisionReversal)}>Rev</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showVisionRange ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showVisionRange', !showVisionRange)}>Range</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showReactionZone ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showReactionZone', !showReactionZone)} title="캔들 위 반응구간">반응구간</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showTailongClose ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showTailongClose', !showTailongClose)} title="봉마감 기준 돌파·장대·꼬리·흐름 신호(강·중·약, TF별 보수 임계)">봉마감(타이롱)</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showTailongCloseBreakout ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showTailongCloseBreakout', !showTailongCloseBreakout)} title="봉마감 돌파/이탈 성공·실패">돌파</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showTailongCloseWick ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showTailongCloseWick', !showTailongCloseWick)} title="윗/아래 꼬리 흡수 신호">꼬리흡수</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showTailongCloseBody ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showTailongCloseBody', !showTailongCloseBody)} title="장대양봉/장대음봉 마감">장대봉</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showTailongCloseFlow ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('showTailongCloseFlow', !showTailongCloseFlow)} title="하위흐름 상승/하락 연계">흐름</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showRsiPanel ? 'tool-chip-active' : ''}`} onClick={() => apply({ showRsiPanel: !showRsiPanel })}>RSI 패널</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showMacdPanel ? 'tool-chip-active' : ''}`} onClick={() => apply({ showMacdPanel: !showMacdPanel })}>MACD</button>
                      <button type="button" className={`tool-chip tool-chip-button ${showBbPanel ? 'tool-chip-active' : ''}`} onClick={() => apply({ showBbPanel: !showBbPanel })}>BB</button>
                    </div>
                    {(uiMode === 'CANDLE_ANALYSIS' || uiMode === 'UNIFIED_DESK' || uiMode === 'AI_ZONE') && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(251,191,36,0.35)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24', marginBottom: 6 }}>
                          {uiMode === 'UNIFIED_DESK' || uiMode === 'AI_ZONE' ? '통합작도 · 캔들 차트 레이어' : '캔들분석 차트 레이어'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.45 }}>
                          전용 레이어 ON/OFF. <strong>엔진 병합</strong>을 켜면 위 &quot;모드별 기능&quot; 토글(구조·존·하모닉·RSI·비전 등)과 같은{' '}
                          <strong>스마트/실행 패킹</strong>이 캔들분석 차트에 합쳐집니다. 해시피보·BOS·VIFVG·브레이커는 아래에서 따로 끌 수 있습니다.
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisMergeEngineOverlays !== false ? 'tool-chip-active' : ''}`}
                            onClick={() =>
                              apply({ candleAnalysisMergeEngineOverlays: !(candleAnalysisMergeEngineOverlays !== false) })
                            }
                            title="스마트/실행과 동일 소스의 구조·키레벨·FVG·OB·하모닉·RSI·비전 등을 병합"
                          >
                            엔진 병합
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisShowSmartGuide !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisShowSmartGuide: !(candleAnalysisShowSmartGuide !== false) })}
                          >
                            스마트·가이드
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisShowElliottMvp !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisShowElliottMvp: !(candleAnalysisShowElliottMvp !== false) })}
                            title="핵심 뷰에서는 기본 숨김"
                          >
                            엘리엇 MVP
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisShowPlaybookPath !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisShowPlaybookPath: !(candleAnalysisShowPlaybookPath !== false) })}
                            title="핵심 뷰에서는 기본 숨김"
                          >
                            플레이북 경로
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisShowAutoZones !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisShowAutoZones: !(candleAnalysisShowAutoZones !== false) })}
                            title="해설 전용(자동 레이어 해설만)이 켜 있으면 차트에는 안 그려짐"
                          >
                            자동 존(OB 등)
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisShowEngineFvg !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisShowEngineFvg: !(candleAnalysisShowEngineFvg !== false) })}
                            title="엔진 FVG(구조와 동일 소스)"
                          >
                            엔진 FVG
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisShowTrendPattern !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisShowTrendPattern: !(candleAnalysisShowTrendPattern !== false) })}
                            title="추세선·삼각/쐐기 비전 — 핵심 뷰에서는 기본 숨김"
                          >
                            추세·패턴
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisHashFibEnabled !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisHashFibEnabled: !(candleAnalysisHashFibEnabled !== false) })}
                          >
                            해시 피보
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisZoneChartVisible === true ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisZoneChartVisible: candleAnalysisZoneChartVisible !== true })}
                            title="BOS 웨이브·VIFVG·브레이커 존형 레이어를 차트에 표시"
                          >
                            존형(BOS/VIFVG/BB)
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisBosWavesEnabled !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisBosWavesEnabled: !(candleAnalysisBosWavesEnabled !== false) })}
                          >
                            BOS 웨이브
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisVifvgEnabled !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisVifvgEnabled: !(candleAnalysisVifvgEnabled !== false) })}
                          >
                            VIFVG
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisBreakerBlocksEnabled !== false ? 'tool-chip-active' : ''}`}
                            onClick={() =>
                              apply({ candleAnalysisBreakerBlocksEnabled: !(candleAnalysisBreakerBlocksEnabled !== false) })
                            }
                          >
                            브레이커
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${candleAnalysisCoreSdZones !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ candleAnalysisCoreSdZones: !(candleAnalysisCoreSdZones !== false) })}
                          >
                            코어 S/D
                          </button>
                        </div>
                      </div>
                    )}
                    {isAiMode && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed rgba(98,239,224,0.28)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>고래 모드 전용 박스</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button type="button" className={`tool-chip tool-chip-button ${whaleShowForecastBoxes ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whaleShowForecastBoxes', !whaleShowForecastBoxes)}>예고박스</button>
                          <button type="button" className={`tool-chip tool-chip-button ${whaleShowAccumulationBoxes ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whaleShowAccumulationBoxes', !whaleShowAccumulationBoxes)}>매집박스</button>
                          <button type="button" className={`tool-chip tool-chip-button ${whaleShowDistributionBoxes ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whaleShowDistributionBoxes', !whaleShowDistributionBoxes)}>분배박스</button>
                          <button type="button" className={`tool-chip tool-chip-button ${whaleOnlyLockedBoxes ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whaleOnlyLockedBoxes', !whaleOnlyLockedBoxes)}>확정만 표시</button>
                          <button type="button" className={`tool-chip tool-chip-button ${whaleDeleteBrokenBoxes ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whaleDeleteBrokenBoxes', !whaleDeleteBrokenBoxes)}>깨진박스 삭제</button>
                          <button type="button" className={`tool-chip tool-chip-button ${whaleUsePrecomputedMemory ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whaleUsePrecomputedMemory', !whaleUsePrecomputedMemory)}>기록기반 우선</button>
                          <button type="button" className={`tool-chip tool-chip-button ${whalePrecisionEntryEnabled ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whalePrecisionEntryEnabled', !whalePrecisionEntryEnabled)} title="롱/숏 후보를 합의 점수·충돌 억제로 정밀 선별">정밀진입</button>
                          <button type="button" className={`tool-chip tool-chip-button ${whalePrecisionAlertEnabled ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whalePrecisionAlertEnabled', !whalePrecisionAlertEnabled)} title="정밀 점수 바닥을 통과한 신호만 자동 알림">정밀알림</button>
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>지그재그 길이</span>
                          <input type="range" min={5} max={15} step={1} value={whaleZigzagLen} onChange={(e) => applyModeFeature('whaleZigzagLen', parseInt(e.target.value, 10) || 9)} style={{ width: 120, accentColor: '#62efe0' }} />
                          <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 20 }}>{whaleZigzagLen}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>Fib 계수</span>
                          <input type="range" min={0.1} max={0.7} step={0.01} value={whaleFibFactor} onChange={(e) => applyModeFeature('whaleFibFactor', parseFloat(e.target.value) || 0.33)} style={{ width: 120, accentColor: '#f59e0b' }} />
                          <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 34 }}>{whaleFibFactor.toFixed(2)}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>유사 최소샘플</span>
                          <input type="range" min={20} max={300} step={10} value={whaleSimilarityMinSamples} onChange={(e) => applyModeFeature('whaleSimilarityMinSamples', parseInt(e.target.value, 10) || 60)} style={{ width: 120, accentColor: '#22c55e' }} />
                          <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 30 }}>{whaleSimilarityMinSamples}</span>
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>예측 N봉</span>
                          <input
                            type="range"
                            min={2}
                            max={6}
                            step={1}
                            value={whalePredictHorizonBars}
                            onChange={(e) => applyModeFeature('whalePredictHorizonBars', Math.max(2, Math.min(6, parseInt(e.target.value, 10) || 3)))}
                            style={{ width: 120, accentColor: '#22c55e' }}
                          />
                          <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 20 }}>{whalePredictHorizonBars}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>최소 신뢰도</span>
                          <input
                            type="range"
                            min={55}
                            max={95}
                            step={1}
                            value={whalePredictMinConfidence}
                            onChange={(e) => applyModeFeature('whalePredictMinConfidence', Math.max(55, Math.min(95, parseInt(e.target.value, 10) || 65)))}
                            style={{ width: 120, accentColor: '#f59e0b' }}
                          />
                          <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 34 }}>{whalePredictMinConfidence}%</span>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${whalePredictShowHitRate ? 'tool-chip-active' : ''}`}
                            onClick={() => applyModeFeature('whalePredictShowHitRate', !whalePredictShowHitRate)}
                          >
                            적중률 표시
                          </button>
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>Bu-OB</span>
                          <input type="color" value={whaleBuObHex} onChange={(e) => applyModeFeature('whaleBuObHex', e.target.value.toUpperCase())} />
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>Be-OB</span>
                          <input type="color" value={whaleBeObHex} onChange={(e) => applyModeFeature('whaleBeObHex', e.target.value.toUpperCase())} />
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>Bu-BB/MB</span>
                          <input type="color" value={whaleBuBbHex} onChange={(e) => applyModeFeature('whaleBuBbHex', e.target.value.toUpperCase())} />
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>Be-BB/MB</span>
                          <input type="color" value={whaleBeBbHex} onChange={(e) => applyModeFeature('whaleBeBbHex', e.target.value.toUpperCase())} />
                        </div>
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed rgba(148,163,184,0.24)' }}>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Hot Zone Radar (Lux 스타일)</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" className={`tool-chip tool-chip-button ${whaleHotZoneEnabled ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whaleHotZoneEnabled', !whaleHotZoneEnabled)}>Hot Zone</button>
                            <button
                              type="button"
                              className={`tool-chip tool-chip-button ${whaleStructureBounceEnabled ? 'tool-chip-active' : ''}`}
                              onClick={() => applyModeFeature('whaleStructureBounceEnabled', !whaleStructureBounceEnabled)}
                              title="세트 구조·반등 경로: 밀림→반응→이탈→목표 가로선 + 트레이드 패널(고래 모드)"
                            >
                              세트반등
                            </button>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Lookback</span>
                            <input type="range" min={50} max={500} step={10} value={whaleHotZoneLookback} onChange={(e) => applyModeFeature('whaleHotZoneLookback', Math.max(50, Math.min(1000, parseInt(e.target.value, 10) || 200)))} style={{ width: 120, accentColor: '#22c55e' }} />
                            <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 28 }}>{whaleHotZoneLookback}</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Grid</span>
                            <input type="range" min={10} max={60} step={1} value={whaleHotZoneResolution} onChange={(e) => applyModeFeature('whaleHotZoneResolution', Math.max(10, Math.min(60, parseInt(e.target.value, 10) || 30)))} style={{ width: 100, accentColor: '#f59e0b' }} />
                            <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 22 }}>{whaleHotZoneResolution}</span>
                          </div>
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>S/R 민감도</span>
                            <input type="range" min={50} max={95} step={1} value={whaleHotZoneSrThreshold} onChange={(e) => applyModeFeature('whaleHotZoneSrThreshold', Math.max(50, Math.min(100, parseInt(e.target.value, 10) || 80)))} style={{ width: 120, accentColor: '#38bdf8' }} />
                            <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 34 }}>{whaleHotZoneSrThreshold}%</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>레이어</span>
                            <input type="range" min={1} max={5} step={1} value={whaleHotZoneLayers} onChange={(e) => applyModeFeature('whaleHotZoneLayers', Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 3)))} style={{ width: 90, accentColor: '#a78bfa' }} />
                            <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 16 }}>{whaleHotZoneLayers}</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed rgba(148,163,184,0.24)' }}>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>HyperTrend (Lux 스타일)</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" className={`tool-chip tool-chip-button ${whaleHyperTrendEnabled ? 'tool-chip-active' : ''}`} onClick={() => applyModeFeature('whaleHyperTrendEnabled', !whaleHyperTrendEnabled)}>HyperTrend</button>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>배수</span>
                            <input type="range" min={1} max={10} step={0.5} value={whaleHyperTrendMult} onChange={(e) => applyModeFeature('whaleHyperTrendMult', Math.max(0.5, Math.min(20, parseFloat(e.target.value) || 5)))} style={{ width: 110, accentColor: '#22c55e' }} />
                            <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 28 }}>{Number(whaleHyperTrendMult).toFixed(1)}</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Slope</span>
                            <input type="range" min={4} max={40} step={1} value={whaleHyperTrendSlope} onChange={(e) => applyModeFeature('whaleHyperTrendSlope', Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 14)))} style={{ width: 110, accentColor: '#f59e0b' }} />
                            <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 22 }}>{whaleHyperTrendSlope}</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>폭</span>
                            <input type="range" min={20} max={100} step={1} value={whaleHyperTrendWidthPct} onChange={(e) => applyModeFeature('whaleHyperTrendWidthPct', Math.max(5, Math.min(100, parseInt(e.target.value, 10) || 80)))} style={{ width: 110, accentColor: '#38bdf8' }} />
                            <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 34 }}>{whaleHyperTrendWidthPct}%</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed rgba(148,163,184,0.24)' }}>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Pine 툴킷 (요약)</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className={`tool-chip tool-chip-button ${whaleDynamicRsProEnabled ? 'tool-chip-active' : ''}`}
                              onClick={() => applyModeFeature('whaleDynamicRsProEnabled', !whaleDynamicRsProEnabled)}
                              title="Dynamic R/S PRO — 피벗·ATR 두께·거래량 필터·비중복 존"
                            >
                              Dynamic R/S
                            </button>
                            <button
                              type="button"
                              className={`tool-chip tool-chip-button ${whaleLiquidityBiasEnabled ? 'tool-chip-active' : ''}`}
                              onClick={() => applyModeFeature('whaleLiquidityBiasEnabled', !whaleLiquidityBiasEnabled)}
                              title="LQB — 매수/매도측 유동성 풀을 가격 존으로 표시 (바이어스는 툴팁만)"
                            >
                              LQB 바이어스
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
                          예고박스는 2~3캔들 구간이 지나면 자동 고정됩니다. 우측 패널「고래 모드 · 자동 분석」에 OB 과거 터치·압축→장대·체결 압력·Pre3가 매 틱 요약됩니다.
                        </div>
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed rgba(56,189,248,0.28)' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#7dd3fc', marginBottom: 4 }}>압축→장대 힌트</div>
                          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>
                            <strong style={{ color: '#94a3b8' }}>청록</strong> 지금 막대가 좁게 쌓이는 중(다음에 큰 봉 나올 수 있는 구간).
                            <br />
                            <strong style={{ color: '#94a3b8' }}>녹/적</strong> 이미 지나간 구간에서 횡보 뒤 장대가 나온 기록.
                            <br />
                            아래는 <strong>민감·균형·보수</strong>만 고르면 됩니다. 숫자(ATR)는 잘 모르겠으면 건드리지 마세요.
                          </div>
                          {(() => {
                            const pid = (settings.aiCompressionPreset ?? 'balanced') as AiCompressionPresetId;
                            return (
                              <>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                  {(['sensitive', 'balanced', 'strict'] as const).map((id) => {
                                    const row = AI_COMPRESSION_PRESETS[id];
                                    const active = pid === id;
                                    return (
                                      <button
                                        key={id}
                                        type="button"
                                        title={row.hint}
                                        className={`tool-chip tool-chip-button ${active ? 'tool-chip-active' : ''}`}
                                        onClick={() => apply(patchForAiCompressionPreset(id))}
                                        style={{ fontSize: 11 }}
                                      >
                                        {row.label}
                                      </button>
                                    );
                                  })}
                                  {pid === 'custom' && (
                                    <span style={{ fontSize: 10, color: '#a78bfa', alignSelf: 'center' }}>직접 조절 중</span>
                                  )}
                                </div>
                                {pid !== 'custom' && (
                                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, lineHeight: 1.45 }}>
                                    {AI_COMPRESSION_PRESETS[pid].hint}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          <button
                            type="button"
                            className="tool-chip tool-chip-button"
                            style={{ fontSize: 10, marginBottom: 8 }}
                            onClick={() => setAiCompressionAdvancedOpen((v) => !v)}
                          >
                            {aiCompressionAdvancedOpen ? '▼ 고급(ATR) 접기' : '▶ 고급: ATR 배수 직접 (선택)'}
                          </button>
                          {aiCompressionAdvancedOpen && (
                            <div style={{ paddingLeft: 4, borderLeft: '2px solid rgba(56,189,248,0.35)' }}>
                              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                                슬라이더를 움직이면「직접 조절 중」으로 바뀌고, 위 프리셋 하이라이트는 꺼집니다.
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, color: '#94a3b8', width: 120 }}>압축 평균≤</span>
                                <input
                                  type="range"
                                  min={0.35}
                                  max={0.65}
                                  step={0.01}
                                  value={settings.aiCompressionAvgRangeAtr ?? defaultSettings.aiCompressionAvgRangeAtr}
                                  onChange={(e) =>
                                    apply({
                                      aiCompressionPreset: 'custom',
                                      aiCompressionAvgRangeAtr: Math.max(0.35, Math.min(0.65, parseFloat(e.target.value) || 0.5)),
                                    })
                                  }
                                  style={{ width: 140, accentColor: '#38bdf8' }}
                                />
                                <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 40 }}>{(settings.aiCompressionAvgRangeAtr ?? defaultSettings.aiCompressionAvgRangeAtr).toFixed(2)}×ATR</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, color: '#94a3b8', width: 120 }}>압축 최대≤</span>
                                <input
                                  type="range"
                                  min={0.5}
                                  max={0.85}
                                  step={0.01}
                                  value={settings.aiCompressionMaxRangeAtr ?? defaultSettings.aiCompressionMaxRangeAtr}
                                  onChange={(e) =>
                                    apply({
                                      aiCompressionPreset: 'custom',
                                      aiCompressionMaxRangeAtr: Math.max(0.5, Math.min(0.85, parseFloat(e.target.value) || 0.65)),
                                    })
                                  }
                                  style={{ width: 140, accentColor: '#38bdf8' }}
                                />
                                <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 40 }}>{(settings.aiCompressionMaxRangeAtr ?? defaultSettings.aiCompressionMaxRangeAtr).toFixed(2)}×ATR</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, color: '#94a3b8', width: 120 }}>변위 레인지≥</span>
                                <input
                                  type="range"
                                  min={0.95}
                                  max={1.45}
                                  step={0.01}
                                  value={settings.aiImpulseRangeAtr ?? defaultSettings.aiImpulseRangeAtr}
                                  onChange={(e) =>
                                    apply({
                                      aiCompressionPreset: 'custom',
                                      aiImpulseRangeAtr: Math.max(0.95, Math.min(1.45, parseFloat(e.target.value) || 1.12)),
                                    })
                                  }
                                  style={{ width: 140, accentColor: '#f59e0b' }}
                                />
                                <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 40 }}>{(settings.aiImpulseRangeAtr ?? defaultSettings.aiImpulseRangeAtr).toFixed(2)}×ATR</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                                <span style={{ fontSize: 11, color: '#94a3b8', width: 120 }}>변위 몸통≥</span>
                                <input
                                  type="range"
                                  min={0.35}
                                  max={0.65}
                                  step={0.01}
                                  value={settings.aiImpulseBodyAtr ?? defaultSettings.aiImpulseBodyAtr}
                                  onChange={(e) =>
                                    apply({
                                      aiCompressionPreset: 'custom',
                                      aiImpulseBodyAtr: Math.max(0.35, Math.min(0.65, parseFloat(e.target.value) || 0.48)),
                                    })
                                  }
                                  style={{ width: 140, accentColor: '#f59e0b' }}
                                />
                                <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 40 }}>{(settings.aiImpulseBodyAtr ?? defaultSettings.aiImpulseBodyAtr).toFixed(2)}×ATR</span>
                              </div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, color: '#cbd5e1' }}>
                                <input
                                  type="checkbox"
                                  checked={settings.aiCompressionVolumeFilter === true}
                                  onChange={(e) => apply({ aiCompressionPreset: 'custom', aiCompressionVolumeFilter: e.target.checked })}
                                />
                                <span>압축 구간 거래량 축소 요구 (더 보수)</span>
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 12, marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Zone 시그널 민감도</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <input
                        type="range"
                        min={0.7}
                        max={1.3}
                        step={0.01}
                        value={effectiveZoneSensitivity}
                        onChange={(e) => {
                          const v = Math.max(0.7, Math.min(1.3, parseFloat(e.target.value) || 1));
                          apply({ zoneSignalSensitivity: v });
                          onZoneSignalSensitivityChange?.(v);
                        }}
                        title="낮음=보수(신호 적음), 높음=공격(신호 많음)"
                        style={{ width: 160, flex: 1, maxWidth: 240, accentColor: '#62efe0' }}
                      />
                      <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 46, fontVariantNumeric: 'tabular-nums' }}>
                        {effectiveZoneSensitivity.toFixed(2)}x
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                      실행·타점 모드 zone 판정 점수 가중치
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>존 면 색상 (4색)</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, lineHeight: 1.45 }}>
                      공급·숏·저항, 수요·롱·지지, 중립·BPR·진입, 경고·목표 존 채움을 바꿉니다. 변경은 저장 시 로컬에 기록되며, 로그인 상태면 서버(<code style={{ fontSize: 10 }}>/api/user-settings</code>)에도 동기화됩니다.
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 118 }}>공급·숏·저항</span>
                      <input
                        type="color"
                        value={zoneFillSupplyUi}
                        onChange={(e) => apply({ zoneFillSupplyHex: e.target.value.toUpperCase() })}
                        title="숏·공급·저항 계열 존"
                        style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{zoneFillSupplyUi}</span>
                      <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => apply({ zoneFillSupplyHex: defaultSettings.zoneFillSupplyHex })} title="기본 빨강">기본</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 118 }}>수요·롱·지지</span>
                      <input
                        type="color"
                        value={zoneFillDemandUi}
                        onChange={(e) => apply({ zoneFillDemandHex: e.target.value.toUpperCase() })}
                        title="롱·수요·지지 계열 존"
                        style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{zoneFillDemandUi}</span>
                      <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => apply({ zoneFillDemandHex: defaultSettings.zoneFillDemandHex })} title="기본 초록">기본</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 118 }}>중립·BPR·진입</span>
                      <input
                        type="color"
                        value={zoneFillNeutralUi}
                        onChange={(e) => apply({ zoneFillNeutralHex: e.target.value.toUpperCase() })}
                        title="균형·진입 반응 등"
                        style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{zoneFillNeutralUi}</span>
                      <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => apply({ zoneFillNeutralHex: defaultSettings.zoneFillNeutralHex })} title="기본 파랑">기본</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 118 }}>경고·목표·저항반응</span>
                      <input
                        type="color"
                        value={zoneFillWarningUi}
                        onChange={(e) => apply({ zoneFillWarningHex: e.target.value.toUpperCase() })}
                        title="경고·TP 성격 존"
                        style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                      />
                      <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{zoneFillWarningUi}</span>
                      <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => apply({ zoneFillWarningHex: defaultSettings.zoneFillWarningHex })} title="기본 노랑">기본</button>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>존 우측 연장</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.45 }}>
                        FVG·OB·반응구간 등 <strong style={{ color: '#94a3b8' }}>면 존</strong>의 오른쪽 끝을 어디까지 그릴지 정합니다. 가로줄 굵기·라벨 위치 설정과 별개입니다.
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        <button
                          type="button"
                          className={`tool-chip tool-chip-button ${(settings.zoneHorizontalExtendMode ?? defaultSettings.zoneHorizontalExtendMode) === 'chartEdge' ? 'tool-chip-active' : ''}`}
                          style={{ padding: '6px 10px' }}
                          onClick={() => apply({ zoneHorizontalExtendMode: 'chartEdge' })}
                          title="차트 플롯 우측 끝까지 (기존 동작)"
                        >
                          차트 끝
                        </button>
                        <button
                          type="button"
                          className={`tool-chip tool-chip-button ${settings.zoneHorizontalExtendMode === 'lastCandle' ? 'tool-chip-active' : ''}`}
                          style={{ padding: '6px 10px' }}
                          onClick={() => apply({ zoneHorizontalExtendMode: 'lastCandle' })}
                          title="최신 봉 X까지 — TV에 가깝게 빈 공간 없음"
                        >
                          최신 봉
                        </button>
                        <button
                          type="button"
                          className={`tool-chip tool-chip-button ${settings.zoneHorizontalExtendMode === 'pastZoneEnd' ? 'tool-chip-active' : ''}`}
                          style={{ padding: '6px 10px' }}
                          onClick={() => apply({ zoneHorizontalExtendMode: 'pastZoneEnd' })}
                          title="존의 뒤쪽 시간 기준으로 N봉만큼만 연장"
                        >
                          존+N봉
                        </button>
                      </div>
                      {settings.zoneHorizontalExtendMode === 'pastZoneEnd' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>존 이후 봉 수</span>
                          <input
                            type="range"
                            min={0}
                            max={80}
                            value={Math.max(0, Math.min(80, Math.round(settings.zoneExtendPastEndBars ?? defaultSettings.zoneExtendPastEndBars)))}
                            onChange={(e) =>
                              apply({
                                zoneExtendPastEndBars: Math.max(0, Math.min(80, parseInt(e.target.value, 10) || 0)),
                              })
                            }
                            style={{ width: 140, flex: 1, maxWidth: 220, accentColor: '#a78bfa' }}
                          />
                          <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 28, fontVariantNumeric: 'tabular-nums' }}>
                            {Math.max(0, Math.min(80, Math.round(settings.zoneExtendPastEndBars ?? defaultSettings.zoneExtendPastEndBars)))}
                          </span>
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>존 고정강도</span>
                        <input
                          type="range"
                          min={0.6}
                          max={2.4}
                          step={0.1}
                          value={Math.max(0.6, Math.min(2.4, Number(settings.zoneStickyStrength ?? defaultSettings.zoneStickyStrength ?? 1)))}
                          onChange={(e) =>
                            apply({
                              zoneStickyStrength: Math.max(0.6, Math.min(2.4, parseFloat(e.target.value) || 1)),
                            })
                          }
                          style={{ width: 140, flex: 1, maxWidth: 220, accentColor: '#22c55e' }}
                        />
                        <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>
                          {Math.max(0.6, Math.min(2.4, Number(settings.zoneStickyStrength ?? defaultSettings.zoneStickyStrength ?? 1))).toFixed(1)}x
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>캔들·거래량 색</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, lineHeight: 1.45 }}>
                      클래식은 수요·공급(초록·빨강) 스타일입니다. 모노크롬은 상승은 밝은 몸통, 하락은 어두운 몸통에 밝은 테두리·심지(TradingView 참고)입니다. 라이트 테마에서는 하락 몸통을 차트 배경에 맞게 바꾸세요.
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${settings.chartCandleStyle === 'classic' ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartCandleStyle: 'classic' })}
                      >
                        클래식
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${settings.chartCandleStyle === 'monochrome' ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartCandleStyle: 'monochrome' })}
                      >
                        모노크롬 (TV식)
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${settings.chartVolumeIntelligence ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartVolumeIntelligence: !settings.chartVolumeIntelligence })}
                        title="WAD: 상승봉=매수볼륨·하락봉=매도볼륨. 34봉 SMA 대비 4배 이상 고래 라벨(초과폭은 큰 사각). RVOL 5단계색·이평·폭증·흡수·체결우세·존 돌파는 WAD 켜진 상태에서 적용."
                      >
                        WAD 거래량
                      </button>
                    </div>
                    {settings.chartVolumeIntelligence ? (
                      <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${settings.chartVolumeRvolTiers !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ chartVolumeRvolTiers: !(settings.chartVolumeRvolTiers !== false) })}
                            title="평균 대비 거래량이 클수록 진하게. 상승봉(매수볼륨)은 녹·청록만, 하락봉(매도볼륨)은 적·로즈만 — 노랑 공유 없음."
                          >
                            RVOL 단계색
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${settings.chartVolumeZoneBreakMarkers !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ chartVolumeZoneBreakMarkers: !(settings.chartVolumeZoneBreakMarkers !== false) })}
                            title="분석 존 상단 돌파·하단 이탈 + 거래량 확인 시 막대 위 마커(존↑/존↓). 아래 슬라이더로 몸통 비율 필터."
                          >
                            존 돌파
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${settings.chartVolumeRvolSpikeMarkers !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ chartVolumeRvolSpikeMarkers: !(settings.chartVolumeRvolSpikeMarkers !== false) })}
                            title="RVOL이 높은 봉: 막대 방향(캔들)에 맞춰 녹=롱·적=숏 라벨·마커색. 도지 근처는 노랑(방향 불명)."
                          >
                            RVOL 폭증
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${settings.chartVolumeAbsorptionMarkers !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ chartVolumeAbsorptionMarkers: !(settings.chartVolumeAbsorptionMarkers !== false) })}
                            title="거래량은 나왔는데 몸통이 작을 때 흡수·클라이맥스 후보(청록)"
                          >
                            흡수
                          </button>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${settings.chartVolumeTakerFlowMarkers !== false ? 'tool-chip-active' : ''}`}
                            onClick={() => apply({ chartVolumeTakerFlowMarkers: !(settings.chartVolumeTakerFlowMarkers !== false) })}
                            title="거래소에서 taker 체결량이 있을 때만 — 매수/매도 체결 우세(파랑·분홍)"
                          >
                            체결 우세
                          </button>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
                            거래량 MA
                            <input
                              type="range"
                              min={0}
                              max={60}
                              step={1}
                              value={Math.max(0, Math.min(60, Math.floor(settings.chartVolumeMaPeriod ?? 0)))}
                              onChange={(e) => apply({ chartVolumeMaPeriod: Number(e.target.value) })}
                              style={{ width: 100, verticalAlign: 'middle' }}
                            />
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {settings.chartVolumeMaPeriod === 0 ? '끔' : `${settings.chartVolumeMaPeriod}봉`}
                            </span>
                          </label>
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.4 }}>
                          MA는 점선(테마별 대비). RVOL·마커·존 돌파의 거래량 비교에도 같은 기간(0이면 20봉). 같은 봉: 존 돌파 → 고래 → 체결 → 폭증 → 흡수. 인접 봉은 아래 간격으로 가독성 압축.
                        </div>
                        <label style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 11, color: '#94a3b8' }}>
                          존 돌파 최소 몸통
                          <input
                            type="range"
                            min={0}
                            max={50}
                            step={1}
                            value={Math.max(0, Math.min(50, Math.floor(settings.chartVolumeZoneBreakMinBodyPct ?? 0)))}
                            onChange={(e) => apply({ chartVolumeZoneBreakMinBodyPct: Number(e.target.value) })}
                            style={{ width: 120, verticalAlign: 'middle' }}
                          />
                          <span style={{ fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                            {settings.chartVolumeZoneBreakMinBodyPct === 0 ? '끔' : `${settings.chartVolumeZoneBreakMinBodyPct}%`}
                          </span>
                          <span style={{ fontSize: 10, color: '#64748b' }}>레인지 대비 몸통이 이 비율 미만이면 존 돌파 마커 생략</span>
                        </label>
                        <label style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 11, color: '#94a3b8' }}>
                          마커 최소 간격
                          <input
                            type="range"
                            min={0}
                            max={8}
                            step={1}
                            value={Math.max(
                              0,
                              Math.min(8, Math.floor(settings.chartVolumeMarkerMinBarGap ?? defaultSettings.chartVolumeMarkerMinBarGap))
                            )}
                            onChange={(e) => apply({ chartVolumeMarkerMinBarGap: Number(e.target.value) })}
                            style={{ width: 120, verticalAlign: 'middle' }}
                          />
                          <span style={{ fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                            {(settings.chartVolumeMarkerMinBarGap ?? defaultSettings.chartVolumeMarkerMinBarGap) === 0
                              ? '끔'
                              : `${settings.chartVolumeMarkerMinBarGap ?? defaultSettings.chartVolumeMarkerMinBarGap}봉`}
                          </span>
                          <span style={{ fontSize: 10, color: '#64748b' }}>
                            붙어 있는 봉에서는 우선순위 높은 마커만 유지(0=간격 제한 없음)
                          </span>
                        </label>
                        <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.45, marginTop: 2 }}>
                          체결 우세: 캔들에 <strong style={{ color: '#94a3b8' }}>taker 매수 체결량</strong> 필드가 있을 때만 라벨이 뜹니다(소스·거래소에 따라 없을 수 있음).
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>WAD 고래 라벨 색 (거래량 패널)</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 72 }}>매수·롱</span>
                          <input
                            type="color"
                            value={wadMarkerBuyUi}
                            onChange={(e) => apply({ wadMarkerBuyHex: e.target.value.toUpperCase() })}
                            title="WAD 매수 고래 마커"
                            style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                          />
                          <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{wadMarkerBuyUi}</span>
                          <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => apply({ wadMarkerBuyHex: defaultSettings.wadMarkerBuyHex })}>기본</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 72 }}>매도·숏</span>
                          <input
                            type="color"
                            value={wadMarkerSellUi}
                            onChange={(e) => apply({ wadMarkerSellHex: e.target.value.toUpperCase() })}
                            title="WAD 매도 고래 마커"
                            style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                          />
                          <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{wadMarkerSellUi}</span>
                          <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => apply({ wadMarkerSellHex: defaultSettings.wadMarkerSellHex })}>기본</button>
                        </div>
                      </div>
                    ) : null}
                    {settings.chartCandleStyle === 'classic' ? (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 118 }}>상승</span>
                          <input
                            type="color"
                            value={chartCandleClassicUpUi}
                            onChange={(e) => apply({ chartCandleClassicUpHex: e.target.value.toUpperCase() })}
                            title="상승 캔들"
                            style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                          />
                          <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{chartCandleClassicUpUi}</span>
                          <button
                            type="button"
                            className="tool-chip tool-chip-button"
                            style={{ padding: '2px 8px', fontSize: 10 }}
                            onClick={() => apply({ chartCandleClassicUpHex: defaultSettings.chartCandleClassicUpHex })}
                          >
                            기본
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 118 }}>하락</span>
                          <input
                            type="color"
                            value={chartCandleClassicDownUi}
                            onChange={(e) => apply({ chartCandleClassicDownHex: e.target.value.toUpperCase() })}
                            title="하락 캔들"
                            style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                          />
                          <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{chartCandleClassicDownUi}</span>
                          <button
                            type="button"
                            className="tool-chip tool-chip-button"
                            style={{ padding: '2px 8px', fontSize: 10 }}
                            onClick={() => apply({ chartCandleClassicDownHex: defaultSettings.chartCandleClassicDownHex })}
                          >
                            기본
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 118 }}>상승 몸통·심지</span>
                          <input
                            type="color"
                            value={chartCandleMonoUpUi}
                            onChange={(e) => apply({ chartCandleMonoUpHex: e.target.value.toUpperCase() })}
                            title="상승"
                            style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                          />
                          <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{chartCandleMonoUpUi}</span>
                          <button
                            type="button"
                            className="tool-chip tool-chip-button"
                            style={{ padding: '2px 8px', fontSize: 10 }}
                            onClick={() => apply({ chartCandleMonoUpHex: defaultSettings.chartCandleMonoUpHex })}
                          >
                            기본
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 118 }}>하락 몸통</span>
                          <input
                            type="color"
                            value={chartCandleMonoDownBodyUi}
                            onChange={(e) => apply({ chartCandleMonoDownBodyHex: e.target.value.toUpperCase() })}
                            title="하락 몸통(배경에 가깝게)"
                            style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                          />
                          <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{chartCandleMonoDownBodyUi}</span>
                          <button
                            type="button"
                            className="tool-chip tool-chip-button"
                            style={{ padding: '2px 8px', fontSize: 10 }}
                            onClick={() => apply({ chartCandleMonoDownBodyHex: defaultSettings.chartCandleMonoDownBodyHex })}
                          >
                            기본
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 118 }}>하락 테두리·심지</span>
                          <input
                            type="color"
                            value={chartCandleMonoOutlineUi}
                            onChange={(e) => apply({ chartCandleMonoOutlineHex: e.target.value.toUpperCase() })}
                            title="하락 테두리·꼬리"
                            style={{ width: 36, height: 28, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                          />
                          <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{chartCandleMonoOutlineUi}</span>
                          <button
                            type="button"
                            className="tool-chip tool-chip-button"
                            style={{ padding: '2px 8px', fontSize: 10 }}
                            onClick={() => apply({ chartCandleMonoOutlineHex: defaultSettings.chartCandleMonoOutlineHex })}
                          >
                            기본
                          </button>
                        </div>
                      </>
                    )}
                  </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>가격 표시 위치 (축 쪽)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <button type="button" className={`tool-chip tool-chip-button ${priceDisplayPosition === 'left' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setPriceDisplayPosition('left')} title="가격을 축 왼쪽으로 정렬">좌</button>
                  <button type="button" className={`tool-chip tool-chip-button ${priceDisplayPosition === 'center' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setPriceDisplayPosition('center')} title="가격을 축 기준 중앙 정렬">중</button>
                  <button type="button" className={`tool-chip tool-chip-button ${priceDisplayPosition === 'right' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setPriceDisplayPosition('right')} title="가격을 축 오른쪽(차트 쪽)으로 정렬">우</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>가격 가로 미세조정</span>
                  <input
                    type="range"
                    min={-200}
                    max={200}
                    value={priceDisplayHShift}
                    onChange={e => setPriceDisplayHShift(parseInt(e.target.value, 10) || 0)}
                    title="좌·중·우 모두 축 기준으로 좌우 이동"
                    style={{ width: 120, flex: 1, maxWidth: 200, accentColor: '#62efe0' }}
                  />
                  <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 44 }}>{priceDisplayHShift > 0 ? `+${priceDisplayHShift}` : priceDisplayHShift}px</span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.4 }}>
                  위 설정은 돌파·지지·타점 등 <strong style={{ color: '#94a3b8' }}>일반 라벨 옆 가격</strong>에만 적용됩니다.
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>존 라벨 위치 (숏·롱·반응구간·FVG·OB 등)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <button type="button" className={`tool-chip tool-chip-button ${zoneLabelPosition === 'left' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setZoneLabelPosition('left')} title="존 왼쪽(시작 쪽)">좌</button>
                    <button type="button" className={`tool-chip tool-chip-button ${zoneLabelPosition === 'center' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setZoneLabelPosition('center')} title="존 가로 중앙">중</button>
                    <button type="button" className={`tool-chip tool-chip-button ${zoneLabelPosition === 'right' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setZoneLabelPosition('right')} title="존 오른쪽(가격축 쪽) — 겹침 완화">우</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>존 라벨 가로 미세조정</span>
                    <input
                      type="range"
                      min={-200}
                      max={200}
                      value={zoneLabelHShift}
                      onChange={e => setZoneLabelHShift(parseInt(e.target.value, 10) || 0)}
                      title="전역으로 좌우 이동 (개별 슬라이더와 합산)"
                      style={{ width: 120, flex: 1, maxWidth: 200, accentColor: '#fbbf24' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 44 }}>{zoneLabelHShift > 0 ? `+${zoneLabelHShift}` : zoneLabelHShift}px</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.4 }}>
                    빨강·파랑·노랑 면 위 <strong style={{ color: '#94a3b8' }}>텍스트</strong>만 이동합니다. 글자 크기는 아래 &quot;전체 라벨 글자 크기&quot; 또는 표의 개별 크기로 줄일 수 있습니다.
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>종가 마감선 가격 (1m·5m·15m·1h·4h·일·주·월)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <button type="button" className={`tool-chip tool-chip-button ${closeStripPosition === 'left' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setCloseStripPosition('left')} title="종가선 축 가격: 차트 쪽(좌)">좌</button>
                    <button type="button" className={`tool-chip tool-chip-button ${closeStripPosition === 'center' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setCloseStripPosition('center')} title="종가선 축 가격: 축 중앙">중</button>
                    <button type="button" className={`tool-chip tool-chip-button ${closeStripPosition === 'right' ? 'tool-chip-active' : ''}`} style={{ padding: '6px 12px' }} onClick={() => setCloseStripPosition('right')} title="종가선 축 가격: 축 오른쪽">우</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>종가선 OPX</span>
                    <input
                      type="range"
                      min={-200}
                      max={200}
                      value={closeStripHShift}
                      onChange={e => setCloseStripHShift(parseInt(e.target.value, 10) || 0)}
                      title="종가 마감선 축 옆 숫자만 미세 이동"
                      style={{ width: 120, flex: 1, maxWidth: 200, accentColor: '#96c8ff' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 44 }}>{closeStripHShift > 0 ? `+${closeStripHShift}` : closeStripHShift}px</span>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>캔들 L/S 마커 A·B·C</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, lineHeight: 1.45 }}>
                    A: 신뢰도·점수 접미사 · B: 봉 클릭 시 요약 패널 · C: 켜면 아래에서 레이어별 표시
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <Link
                      href="/help/chart-candle-analysis"
                      className="tool-chip tool-chip-button"
                      style={{ display: 'inline-flex', fontSize: 11, padding: '6px 12px', textDecoration: 'none', color: 'inherit' }}
                    >
                      차트 캔들·신호 설명서 전체
                    </Link>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <button
                      type="button"
                      className={`tool-chip tool-chip-button ${chartMarkerMetaA ? 'tool-chip-active' : ''}`}
                      onClick={() => apply({ chartMarkerMetaA: !chartMarkerMetaA })}
                    >
                      A 메타
                    </button>
                    <button
                      type="button"
                      className={`tool-chip tool-chip-button ${chartMarkerClickDetailB ? 'tool-chip-active' : ''}`}
                      onClick={() => apply({ chartMarkerClickDetailB: !chartMarkerClickDetailB })}
                    >
                      B 클릭
                    </button>
                    <button
                      type="button"
                      className={`tool-chip tool-chip-button ${chartMarkerDensityC ? 'tool-chip-active' : ''}`}
                      onClick={() => apply({ chartMarkerDensityC: !chartMarkerDensityC })}
                    >
                      C 밀도
                    </button>
                  </div>
                  {chartMarkerDensityC && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${chartMarkerLayerLs ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartMarkerLayerLs: !chartMarkerLayerLs })}
                      >
                        L/S
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${chartMarkerLayerAux ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartMarkerLayerAux: !chartMarkerLayerAux })}
                      >
                        보조(C·T)
                      </button>
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button ${chartMarkerLayerFrontRun ? 'tool-chip-active' : ''}`}
                        onClick={() => apply({ chartMarkerLayerFrontRun: !chartMarkerLayerFrontRun })}
                      >
                        선확
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>구조 로켓 (🚀 · 📉)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>크기</span>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      step={5}
                      value={Math.max(50, Math.min(200, lsRocketScalePct ?? 100))}
                      onChange={(e) => apply({ lsRocketScalePct: Math.max(50, Math.min(200, parseInt(e.target.value, 10) || 100)) })}
                      style={{ width: 140, flex: 1, maxWidth: 220, accentColor: '#f472b6' }}
                      title="캔들 위 HUD 로켓 + 동일 구조 로켓 마커 크기"
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 44, fontWeight: 700 }}>{Math.max(50, Math.min(200, lsRocketScalePct ?? 100))}%</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>100% = 기본. 작게 줄이거나 크게 키워 차트에서 확대·축소에 맞출 수 있습니다.</div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>캔들분석 보조 마커</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>최대 개수</span>
                    <input
                      type="range"
                      min={4}
                      max={40}
                      value={Math.max(4, Math.min(40, candleAnalysisMarkerMax ?? 18))}
                      onChange={(e) => apply({ candleAnalysisMarkerMax: Math.max(4, Math.min(40, parseInt(e.target.value, 10) || 18)) })}
                      style={{ width: 140, accentColor: '#a78bfa' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0' }}>{Math.max(4, Math.min(40, candleAnalysisMarkerMax ?? 18))}</span>
                  </label>
                  <div style={{ fontSize: 10, color: '#64748b' }}>C↑/C↓ = 캔들점수, T↑/T↓ = 타이롱 종가. L·🚀과 같은 봉은 생략.</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>차트 축 가격 글자</span>
                    <input
                      type="range"
                      min={10}
                      max={18}
                      value={Math.max(10, Math.min(18, chartScaleFontSize))}
                      onChange={e => apply({ chartScaleFontSize: parseInt(e.target.value, 10) || 12 })}
                      style={{ width: 100, accentColor: '#62efe0' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 20 }}>{chartScaleFontSize}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>라벨 옆 가격 글자</span>
                    <input
                      type="range"
                      min={8}
                      max={16}
                      value={Math.max(8, Math.min(16, overlayPriceStripFontSize))}
                      onChange={e => apply({ overlayPriceStripFontSize: parseInt(e.target.value, 10) || 10 })}
                      style={{ width: 100, accentColor: '#62efe0' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 20 }}>{overlayPriceStripFontSize}</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>전체 라벨 글자 크기</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>기본 크기</span>
                    <input
                      type="range"
                      min={8}
                      max={24}
                      value={overlayLabelFontSize ?? 11}
                      onChange={e => apply({ overlayLabelFontSize: parseInt(e.target.value, 10) || 11 })}
                      style={{ width: 80, accentColor: '#62efe0' }}
                    />
                    <span style={{ fontSize: 11, color: '#e2e8f0', minWidth: 20 }}>{overlayLabelFontSize ?? 11}</span>
                  </div>
                </div>
                <div
                  style={{
                    marginBottom: 16,
                    paddingBottom: 14,
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24', marginBottom: 6 }}>가로줄 두께 (모양만)</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, lineHeight: 1.45 }}>
                    위「차트 일괄 정리」의 <strong style={{ color: '#94a3b8' }}>가로선 전부 끄기</strong>·상단 <strong style={{ color: '#94a3b8' }}>가로선X</strong>와는 <strong style={{ color: '#e2e8f0' }}>별도</strong>입니다. 켜 두어도 일괄 숨김에는 포함되지 않습니다.
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>선 굵기</span>
                    <button type="button" className={`tool-chip tool-chip-button ${overlayLineThickness === 'thin' ? 'tool-chip-active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => apply({ overlayLineThickness: 'thin' })}>얇게</button>
                    <button type="button" className={`tool-chip tool-chip-button ${overlayLineThickness === 'normal' ? 'tool-chip-active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => apply({ overlayLineThickness: 'normal' })}>보통</button>
                    <button type="button" className={`tool-chip tool-chip-button ${overlayLineThickness === 'thick' ? 'tool-chip-active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => apply({ overlayLineThickness: 'thick' })}>굵게</button>
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#62efe0', marginBottom: 6 }}>개별 표시 · 글자 (라벨·존·선)</div>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10, lineHeight: 1.45 }}>
                  항목마다 <strong style={{ color: '#94a3b8' }}>표시</strong> / <strong style={{ color: '#94a3b8' }}>글자</strong> ON/OFF와 정렬은 <strong style={{ color: '#94a3b8' }}>심볼 기준</strong>으로 저장됩니다.{' '}
                  <strong style={{ color: '#e2e8f0' }}>가로선X·가로선 일괄 끄기와 무관</strong>합니다(그건 전역 필터). <strong style={{ color: '#94a3b8' }}>글자 OFF</strong>는 말풍선·축 가격 글자만 끄고 선·존 색은 유지합니다.
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8' }}>
                      <th style={{ textAlign: 'center', padding: '6px 8px 8px', fontWeight: 600, width: 56 }}>표시</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px 8px', fontWeight: 600, width: 56 }} title="차트 위 글자만 — 줄·존은 유지">글자</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>라벨</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>글자체</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600 }}>크기</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 600, minWidth: 200 }}>정렬 · 가로 슬라이더</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screenOverlays.map((o: any) => (
                      <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <td style={{ padding: '4px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${isOverlayVisible(o.id) ? 'tool-chip-active' : ''}`}
                            style={{ padding: '2px 8px', fontSize: 10, minWidth: 40, background: isOverlayVisible(o.id) ? 'rgba(98,239,224,0.2)' : 'rgba(100,116,139,0.2)', border: `1px solid ${isOverlayVisible(o.id) ? '#62efe0' : '#64748b'}` }}
                            onClick={() => setOverlayVisible(o.id, !isOverlayVisible(o.id))}
                            title={isOverlayVisible(o.id) ? '차트에 표시 중 — 클릭하면 숨김' : '숨김 — 클릭하면 표시'}
                          >
                            {isOverlayVisible(o.id) ? 'ON' : 'OFF'}
                          </button>
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${isOverlayChartTextVisible(o.id) ? 'tool-chip-active' : ''}`}
                            style={{
                              padding: '2px 8px',
                              fontSize: 10,
                              minWidth: 40,
                              background: isOverlayChartTextVisible(o.id) ? 'rgba(98,239,224,0.2)' : 'rgba(100,116,139,0.2)',
                              border: `1px solid ${isOverlayChartTextVisible(o.id) ? '#62efe0' : '#64748b'}`,
                              opacity: isOverlayVisible(o.id) ? 1 : 0.55,
                            }}
                            onClick={() => setOverlayChartTextVisible(o.id, !isOverlayChartTextVisible(o.id))}
                            title={
                              isOverlayChartTextVisible(o.id)
                                ? '글자 표시 중 — 클릭하면 말풍선·가격 글자만 끔 (줄·존 유지)'
                                : '글자 숨김 — 클릭하면 다시 표시'
                            }
                          >
                            {isOverlayChartTextVisible(o.id) ? 'ON' : 'OFF'}
                          </button>
                        </td>
                        <td style={{ padding: '6px 8px', color: isOverlayVisible(o.id) ? '#e2e8f0' : '#64748b', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }} title={overlayDisplayLabel(o.label, o.id, uiMode, translateLabelsToKo, o.kind) || o.id}>{overlayDisplayLabel(o.label, o.id, uiMode, translateLabelsToKo, o.kind) || o.id}</td>
                        <td style={{ padding: '4px 8px' }}>
                          <select
                            value={getFontFamily(o.id)}
                            onChange={e => setFontFamily(o.id, e.target.value)}
                            style={{ width: '100%', minWidth: 100, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 11 }}
                          >
                            <option value="">기본</option>
                            <option value="'Noto Sans KR', sans-serif">Noto Sans KR</option>
                            <option value="'Pretendard', sans-serif">Pretendard</option>
                            <option value="'Noto Sans JP', sans-serif">Noto Sans JP</option>
                            <option value="system-ui, sans-serif">system-ui</option>
                            <option value="serif">serif</option>
                          </select>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input
                            type="number"
                            min={8}
                            max={24}
                            value={getFontSize(o.id)}
                            onChange={e => setFontSizeValue(o.id, parseInt(e.target.value, 10) || (overlayLabelFontSize ?? DEFAULT_FONT_SIZE))}
                            style={{ width: 52, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              <button type="button" className={`tool-chip tool-chip-button ${getLabelAlign(o.id) === 'left' ? 'tool-chip-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setLabelAlign(o.id, 'left')}>좌</button>
                              <button type="button" className={`tool-chip tool-chip-button ${getLabelAlign(o.id) === 'center' ? 'tool-chip-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setLabelAlign(o.id, 'center')}>중</button>
                              <button type="button" className={`tool-chip tool-chip-button ${getLabelAlign(o.id) === 'right' ? 'tool-chip-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setLabelAlign(o.id, 'right')}>우</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="range"
                                min={LABEL_H_SHIFT_MIN}
                                max={LABEL_H_SHIFT_MAX}
                                value={getLabelHShift(o.id)}
                                onChange={e => setLabelHShift(o.id, parseInt(e.target.value, 10) || 0)}
                                title="라벨을 좌우로 원하는 만큼 이동 (픽셀)"
                                style={{ width: 110, flex: 1, minWidth: 80, accentColor: '#62efe0' }}
                              />
                              <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 40, fontVariantNumeric: 'tabular-nums' }}>
                                {getLabelHShift(o.id) > 0 ? `+${getLabelHShift(o.id)}` : getLabelHShift(o.id)}px
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {screenOverlays.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 11 }}>표시 중인 라벨이 없습니다. 위 차트 표시에서 구조·존·라벨 등을 켜면 목록에 나타납니다.</div>
                )}
              </div>
            </div>
            )}
          </div>
        , isFullscreen && frameRef.current ? frameRef.current : document.body)}
      </div>
      )}
      </div>
      {contextMenu && (
        <div className="chart-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          <button type="button" className="tool-chip tool-chip-button" onClick={() => { onChartPointClick?.(contextMenu.req); setContextMenu(null); }}>
            AI Explain
          </button>
        </div>
      )}
      {false && mtfInlineSignals.length > 0 && (
        <div
          ref={mtfMenuRef}
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            top: 12,
            zIndex: 6,
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            pointerEvents: 'auto',
            paddingBottom: 2,
            transform: `translate(${mtfMenuPos.x}px, ${mtfMenuPos.y}px)`,
          }}
        >
          <button
            type="button"
            className="tool-chip tool-chip-button"
            title="드래그해서 MTF 바 이동"
            onMouseDown={startMenuDrag('mtf')}
            style={{ padding: '4px 8px', fontSize: 11, cursor: 'grab' }}
          >
            ↕ 이동
          </button>
          {mtfInlineSignals.map((m) => (
            <button
              key={`mtf-inline-${m.tf}`}
              type="button"
              className={`tool-chip tool-chip-button ${timeframe === m.tf ? 'tool-chip-active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                selectTimeframe(m.tf);
              }}
              title={`${m.tfLabel} ${m.verdictKo}`}
              style={{
                whiteSpace: 'nowrap',
                color: m.verdict === 'LONG' ? '#22C55E' : m.verdict === 'SHORT' ? '#EF4444' : '#cbd5e1',
                fontWeight: timeframe === m.tf ? 700 : 600,
              }}
            >
              {m.tfLabel} {m.verdictKo}
            </button>
          ))}
        </div>
      )}
      {SHOW_FRONT_RUN_ON_CHART && frontRunTip && (
        <div
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            zIndex: 7,
            pointerEvents: 'auto',
            background: 'rgba(6,10,18,0.92)',
            border: `1px solid ${frontRunTip.direction === 'LONG' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
            borderRadius: 10,
            padding: '8px 10px',
            minWidth: 220,
            color: '#e2e8f0',
            fontSize: 10.5,
            lineHeight: 1.35,
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: frontRunTip.direction === 'LONG' ? '#22C55E' : '#EF4444' }}>
              선확 {frontRunTip.direction === 'LONG' ? '롱' : '숏'} · {frontRunTip.confidence ?? '-'}%
            </div>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={() => setFrontRunTip(null)}
              style={{ padding: '1px 7px', fontSize: 10 }}
            >
              닫기
            </button>
          </div>
          <div>진입 {frontRunTip.entry?.toFixed?.(2) ?? '-'} · 손절 {frontRunTip.stop?.toFixed?.(2) ?? '-'}</div>
          <div>TP {frontRunTip.tp1?.toFixed?.(2) ?? '-'} / {frontRunTip.tp2?.toFixed?.(2) ?? '-'} / {frontRunTip.tp3?.toFixed?.(2) ?? '-'}</div>
          <div>RR {frontRunTip.rr?.toFixed?.(2) ?? '-'} · {frontRunTip.leverage?.toFixed?.(2) ?? '-'}x · R {frontRunTip.riskAmount ? Math.round(frontRunTip.riskAmount) : '-'}U</div>
          <div style={{ marginTop: 4, color: '#cbd5e1' }}>
            손익 예상: +{frontRunTip.futuresProfitPct?.[0] != null ? Number(frontRunTip.futuresProfitPct[0]).toFixed(1) : '-'}%
            {' '}/ +{frontRunTip.futuresProfitPct?.[1] != null ? Number(frontRunTip.futuresProfitPct[1]).toFixed(1) : '-'}%
            {' '}/ +{frontRunTip.futuresProfitPct?.[2] != null ? Number(frontRunTip.futuresProfitPct[2]).toFixed(1) : '-'}%
            {' '}· SL -{typeof frontRunTip.futuresLossPct === 'number' ? Number(frontRunTip.futuresLossPct).toFixed(1) : '-'}%
          </div>
        </div>
      )}
      {chartMarkerClickDetailB && signalBarTip && signalBarTip.lines.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            zIndex: 7,
            pointerEvents: 'auto',
            background: 'rgba(6,10,18,0.92)',
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: 10,
            padding: '8px 10px',
            minWidth: 200,
            maxWidth: Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 32 : 360),
            color: '#e2e8f0',
            fontSize: 10.5,
            lineHeight: 1.4,
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#94a3b8' }}>이 봉 신호 (B)</div>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={() => setSignalBarTip(null)}
              style={{ padding: '1px 7px', fontSize: 10 }}
            >
              닫기
            </button>
          </div>
          {signalBarTip.lines.map((ln, i) => (
            <div key={`${signalBarTip.time}-${i}`} style={{ marginBottom: i < signalBarTip.lines.length - 1 ? 4 : 0 }}>
              · {ln}
            </div>
          ))}
        </div>
      )}
      {biblePatternTip && uiMode === 'BIBLE_MODE' && (
        <>
          <div
            role="presentation"
            aria-hidden
            style={{ position: 'fixed', inset: 0, zIndex: 28, background: 'rgba(0,0,0,0.12)' }}
            onClick={() => setBiblePatternTip(null)}
          />
          <div
            role="dialog"
            aria-label="바이블 패턴 설명"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: (() => {
                const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
                const panelW = Math.min(320, vw - 16);
                return Math.max(8, Math.min(biblePatternTip.left + 6, vw - panelW - 8));
              })(),
              top: (() => {
                const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
                return Math.max(8, Math.min(biblePatternTip.top + 6, vh - 100));
              })(),
              zIndex: 29,
              pointerEvents: 'auto',
              background: 'rgba(6,10,18,0.96)',
              border: '1px solid rgba(148,163,184,0.4)',
              borderRadius: 10,
              padding: '10px 12px',
              minWidth: 200,
              maxWidth: 'min(92vw, 320px)',
              maxHeight: 'min(55vh, 280px)',
              overflow: 'auto',
              color: '#e2e8f0',
              fontSize: 11,
              lineHeight: 1.45,
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: 10.5 }}>패턴 설명</div>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => setBiblePatternTip(null)}
                style={{ padding: '1px 7px', fontSize: 10, flexShrink: 0 }}
              >
                닫기
              </button>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{biblePatternTip.text}</div>
          </div>
        </>
      )}
      <div className="overlay-layer">
        {uiMode === 'AI_ZONE' && (
          <>
            <div
              style={{
                position: 'absolute',
                left: 10,
                top: 10,
                zIndex: 2600,
                fontSize: 10,
                fontWeight: 700,
                color: '#e2e8f0',
                background: 'rgba(15,23,42,0.88)',
                border: '1px solid rgba(100,116,139,0.55)',
                borderRadius: 8,
                padding: '3px 8px',
                pointerEvents: 'none',
              }}
              title={
                hasAiZoneEngineVisible
                  ? 'AI 분석 레이어가 차트에 동기화되었습니다.'
                  : '기본 가이드 구간을 표시 중입니다. 분석이 갱신되면 상세 레이어가 맞춰집니다.'
              }
            >
              AI 분석 모드
            </div>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: typeof lastClosePixelY === 'number' ? Math.max(0, lastClosePixelY - 32) : '45%',
                height: 12,
                background: 'rgba(34,197,94,0.22)',
                borderTop: '1px solid rgba(74,222,128,0.82)',
                borderBottom: '1px solid rgba(74,222,128,0.58)',
                pointerEvents: 'none',
                zIndex: 2401,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: typeof lastClosePixelY === 'number' ? Math.max(0, lastClosePixelY + 20) : '52%',
                height: 12,
                background: 'rgba(239,68,68,0.2)',
                borderTop: '1px solid rgba(248,113,113,0.78)',
                borderBottom: '1px solid rgba(248,113,113,0.55)',
                pointerEvents: 'none',
                zIndex: 2401,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: typeof lastClosePixelY === 'number' ? Math.max(0, lastClosePixelY - 1) : '49%',
                height: 2,
                background: 'rgba(125,211,252,0.9)',
                pointerEvents: 'none',
                zIndex: 2402,
              }}
            />
          </>
        )}
        {settings.showExhaustionZoneRukich &&
          exhaustionZoneRukichGeom &&
          (() => {
            const g = exhaustionZoneRukichGeom;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const p of [...g.polyTop, ...g.polyBot]) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
            const w = Math.max(1, maxX - minX);
            const h = Math.max(1, maxY - minY);
            const polyPts = [...g.polyTop, ...[...g.polyBot].reverse()]
              .map((p) => `${p.x - minX},${p.y - minY}`)
              .join(' ');
            const topPts = g.polyTop.map((p) => `${p.x - minX},${p.y - minY}`).join(' ');
            const botPts = g.polyBot.map((p) => `${p.x - minX},${p.y - minY}`).join(' ');
            return (
              <>
                <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: minX, top: minY, width: w, height: h, pointerEvents: 'none' }}>
                    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
                      <polygon points={polyPts} fill="rgba(34, 197, 94, 0.22)" stroke="none" />
                      <polyline points={topPts} fill="none" stroke="rgba(34, 197, 94, 0.35)" strokeWidth={1.5} />
                      <polyline points={botPts} fill="none" stroke="rgba(34, 197, 94, 0.48)" strokeWidth={2.5} />
                    </svg>
                  </div>
                </div>
              </>
            );
          })()}
        {visibleScreenOverlays.map((item: any) => {
          const isWhaleAutoOverlay = typeof item.id === 'string' && item.id.startsWith('whale-auto-');
          const smcPlaybookLock = isSmcEntryPlaybookOverlayId(item.id);
          const fixedMagnetZone =
            ['zone', 'ob', 'supplyZone', 'demandZone'].includes(String(item?.kind || '')) &&
            (typeof item?.id === 'string'
              ? item.id.startsWith('whale-auto-') ||
                item.id.startsWith('smc-desk-ob-') ||
                item.id.includes('aichart1') ||
                item.id.includes('aichart-1') ||
                item.id.includes('aichart') ||
                /(?:^|-)ob(?:-|$)/i.test(item.id)
              : false);
          const offKey = stableOverlayVisibilityKey(item.id);
          const off =
            isWhaleAutoOverlay || smcPlaybookLock || fixedMagnetZone
              ? { dx: 0, dy: 0 }
              : overlayOffsets[offKey] ?? overlayOffsets[item.id] ?? { dx: 0, dy: 0 };
          const isDragging = !isWhaleAutoOverlay && !smcPlaybookLock && !fixedMagnetZone && dragState?.id === item.id;
          const liveOff = isDragging ? { dx: dragState.currentDx, dy: dragState.currentDy } : off;
          if (
            item.kind === 'channelBand' &&
            Array.isArray(item.channelBandScreen) &&
            item.channelBandScreen.length >= 3
          ) {
            if (OVERLAY_ZONE_FILL_BEHIND_CHART) return null;
            const poly = item.channelBandScreen as { x: number; y: number }[];
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const p of poly) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
            const w = Math.max(1, maxX - minX);
            const h = Math.max(1, maxY - minY);
            const pts = poly.map((p) => `${p.x - minX + liveOff.dx},${p.y - minY + liveOff.dy}`).join(' ');
            const fillC = typeof item.color === 'string' && item.color.length ? item.color : 'rgba(80,80,80,0.2)';
            return (
              <div key={item.id} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: minX, top: minY, width: w, height: h, pointerEvents: 'none' }}>
                  <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
                    <polygon points={pts} fill={fillC} stroke="none" />
                  </svg>
                </div>
              </div>
            );
          }
          if (['zone', 'fvg', 'ob', 'supplyZone', 'demandZone', 'bprZone', 'reactionZone'].includes(item.kind) && typeof item.x2 === 'number' && typeof item.y2 === 'number') {
            const isCaCoreSd =
              typeof item.id === 'string' &&
              item.id.startsWith('ca-core-') &&
              (item as OverlayItem).category === 'candleAnalysisCoreSd';
            const isMajorEngineSrZone =
              typeof item.id === 'string' && /^major-(support|resistance)-\d+-zone$/.test(item.id);
            const isBiblePatternFrame =
              typeof item.id === 'string' &&
              item.id.startsWith('bible-cp-frame-') &&
              (item as OverlayItem).category === 'bibleMode';
            const whaleCat = String((item as OverlayItem).category || '');
            const zid = String(item.id || '');
            /** 고래 툴킷 DRS/LQB: 기본은 면·테두리만 — SMC 데스크는 짧은 배지·툴팁으로 출처 표시 */
            const isWhaleToolkitPaintOnly =
              whaleCat === 'whaleToolkit' && (zid.startsWith('whale-drs-') || zid.startsWith('whale-lqb-'));
            /** SMC 데스크: DRS/LQB는 색만 있으면 의미 불명 → 짧은 한글 배지 허용 */
            const smcDeskWhaleZoneCaption =
              isSmcDeskMode && (zid.startsWith('whale-drs-') || zid.startsWith('whale-lqb-'));
            const zoneBaseLabel = overlayDisplayLabel(item.label, item.id, uiMode, translateLabelsToKo, item.kind);
            const zoneDirTag = inferOverlayDirectionTag(item as OverlayItem, zoneBaseLabel);
            const zoneDirProb = resolveDirectionProb(item as OverlayItem, zoneBaseLabel, zoneDirTag);
            const smcConfluenceBadge = isSmcDeskMode ? smcDeskConfluenceZoneBadge(zid) : null;
            const smcWhaleBadge = isSmcDeskMode ? smcDeskWhaleToolkitZoneBadge(zid) : null;
            const smcShortCaption =
              isSmcDeskMode
                ? smcConfluenceBadge ?? smcWhaleBadge ?? smcDeskShortZoneCaption(String(item.kind || ''))
                : null;
            /** 핵심 S/D는 TV식 짧은 캡션만(상승·하락 % 덧붙이지 않음) · SMC 데스크는 Supply/Demand/OB/FVG 영문 고정 */
            const zoneLabelWithDir = smcShortCaption
              ? smcShortCaption
              : isCaCoreSd
                ? zoneBaseLabel
                : withDirAndProb(zoneBaseLabel, zoneDirTag, zoneDirProb);
            const baseLeft = Math.min(item.x1, item.x2);
            const baseWidth = Math.abs(item.x2 - item.x1);
            const isTapZone = item.id?.startsWith?.('tap-');
            const isCandleAnalysisZone =
              isCaCoreSd ||
              isMajorEngineSrZone ||
              (typeof item.id === 'string' &&
                (item.id.startsWith('candle-analysis-zone') ||
                  item.id.startsWith('candle-analysis-auto-') ||
                  item.id.startsWith('candle-analysis-ai-draw-') ||
                  item.id.startsWith('candle-analysis-hash-fib-') ||
                  item.id.startsWith('candle-analysis-bosw-') ||
                  item.id.startsWith('candle-analysis-vifvg-') ||
                  item.id.startsWith('candle-analysis-brk-') ||
                  item.id.startsWith('zone-smbc-') ||
                  item.id === 'candle-analysis-fib-pocket' ||
                  item.id.startsWith('smart-overlay-zone')));
            const xMaxRight = item.xMaxRight ?? (baseLeft + baseWidth);
            const isCoreMagnetZoneStrictW = isCoreAnalysisMagnetZoneStrictWidthId(item.id);
            const width = isCoreMagnetZoneStrictW
              ? Math.max(1, baseWidth)
              : Math.max(baseWidth, xMaxRight - baseLeft);
            const left = baseLeft + liveOff.dx;
            const top = Math.min(item.y1, item.y2) + liveOff.dy;
            const height = Math.abs(item.y2 - item.y1);
            /** 존 면은 우측까지 확장되어도 라벨·가격띠는 time2 봉 X(zoneTimeEndScreenX)에 고정 — priceStripRight(뷰포트) 고정 방지 */
            const zte = (item as OverlayItem).zoneTimeEndScreenX;
            const zoneInnerRight = left + width;
            const zoneFormRightPx =
              typeof zte === 'number' && Number.isFinite(zte) ? zte : Math.max(item.x1, item.x2 ?? item.x1);
            const zoneFormLeftPx = Math.min(item.x1, zoneFormRightPx);
            const zoneFeatureRightX = zoneFormRightPx + liveOff.dx;
            const zoneLabelCenterX = (zoneFormLeftPx + zoneFormRightPx) / 2 + liveOff.dx;
            const isSmartMoneyMvpLine = String(item.id || '').startsWith('smartmoney-mvp-');
            const align = isCaCoreSd || isMajorEngineSrZone || isSmartMoneyMvpLine ? 'right' : getLabelAlign(item.id);
            const justifyContent = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
            const zoneHigh = typeof item.price1 === 'number' && typeof item.price2 === 'number' ? Math.max(item.price1, item.price2) : (item.price1 ?? item.price2);
            const zoneLow = typeof item.price1 === 'number' && typeof item.price2 === 'number' ? Math.min(item.price1, item.price2) : (item.price1 ?? item.price2);
            const hasPrices = typeof zoneHigh === 'number' && typeof zoneLow === 'number';
            const lineLblRaw = (item as OverlayItem).lineLabelColor;
            const useAutoLineTint =
              typeof lineLblRaw === 'string' &&
              lineLblRaw.length > 0 &&
              typeof item.id === 'string' &&
              item.id.startsWith('candle-analysis-auto-');
            const zoneDirTint = resolveZoneDirectionalColors(item as OverlayItem);
            const zoneLabelColor = useAutoLineTint
              ? toSolidOverlayColor(lineLblRaw)
              : zoneDirTint
                ? zoneDirTint.labelSolid
                : toSolidOverlayColor(item.color);
            const zonePriceColor = zoneLabelColor;
            const priceBoxRight = zoneFeatureRightX;
            const chartW = item.chartWidth ?? 0;
            const stripFs = isCandleAnalysisZone
              ? Math.max(7, Math.min(11, overlayPriceStripFontSize - 1))
              : Math.max(8, Math.min(16, overlayPriceStripFontSize));
            const priceBoxStyle = buildPriceStripOverlayStyle(priceDisplayPosition, priceDisplayHShift, priceBoxRight, chartW, {
              whiteSpace: 'nowrap',
              fontSize: stripFs,
              fontWeight: 600,
              color: zonePriceColor,
              background: isCandleAnalysisZone ? 'rgba(8,15,25,0.42)' : 'rgba(8,15,25,0.55)',
              padding: isCandleAnalysisZone ? '1px 5px' : '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
            });
            const chartH = item.chartHeight ?? 0;
            const labelBoxW = isCaCoreSd
              ? 84
              : isMajorEngineSrZone
                ? 132
                : isCandleAnalysisZone
                  ? 118
                  : maxCleanChartLayout
                    ? 132
                    : 148;
            const labelBoxH = isCaCoreSd || isMajorEngineSrZone ? 38 : isCandleAnalysisZone ? 18 : 24;
            const labelHShift = getLabelHShift(item.id);
            /** TV식: 존 우측(가격축 쪽)에 캡션 — 캔들 가운데 겹침 방지. 엔진 FVG는 형성 구간 우측/중앙 기준 */
            const caCoreRightPad = 10;
            const anchorX =
              isCaCoreSd || isMajorEngineSrZone
                ? Math.max(left + 4, zoneInnerRight - labelBoxW - caCoreRightPad)
                : zoneLabelPosition === 'right'
                  ? zoneFeatureRightX - labelBoxW - 8
                  : zoneLabelPosition === 'center'
                    ? zoneLabelCenterX - labelBoxW / 2
                    : left + 6;
            const labelLeft = anchorX + labelHShift + zoneLabelHShift;
            const caStackDy = isCaCoreSd ? (caCoreSdZoneCaptionDy.get(item.id) ?? 0) : 0;
            const rawLabelTop =
              isCaCoreSd ? top + 2 + caStackDy : isMajorEngineSrZone ? top + 2 : top + 4;
            const labelTop = rawLabelTop;
            const showZoneLabel = overlayHtmlLabelIntersectsChart(labelLeft, rawLabelTop, labelBoxW, labelBoxH, chartW, chartH);
            const hideSmartZoneChartCaption =
              candleAnalysisLikeUi &&
              typeof item.id === 'string' &&
              item.id.startsWith('smart-overlay-zone-');
            const whaleLabel = String(item.label || '');
            const isWhaleOb = /(?:^|-)OB\b/i.test(whaleLabel) || /-ob-/.test(String(item.id || ''));
            const zonePartialMit = (item as OverlayItem).zonePartialMitigation === true;
            const obMitigated = item.obMitigated === true && (item.kind === 'ob' || isWhaleOb);
            const isWhaleBbMb = /(?:^|-)BB\b|(?:^|-)MB\b/i.test(whaleLabel) || /-bb-|-forecast-/.test(String(item.id || ''));
            const isAiAutoZone = typeof item.id === 'string' && item.id.startsWith('ai-auto-');
            const isAiCoreZone =
              typeof item.id === 'string' &&
              (item.id === 'ai-zone-main' ||
                item.id === 'ai-zone-long-ref' ||
                item.id === 'ai-zone-short-ref' ||
                (item as OverlayItem).aiZoneNearestSr === true);
            const showZoneCaption =
              showZoneLabel &&
              !hideSmartZoneChartCaption &&
              !isBiblePatternFrame &&
              !shouldHideWhaleAutoZoneChartCaption(item) &&
              (!isWhaleToolkitPaintOnly || smcDeskWhaleZoneCaption);
            const zoneBorder = isAiCoreZone
              ? `2.2px solid ${zoneLabelColor}dd`
              : isBiblePatternFrame
              ? `2px dashed ${zoneLabelColor}cc`
              : isCaCoreSd || isMajorEngineSrZone
              ? `1px solid ${zoneLabelColor}50`
              : isTapZone
              ? `1.5px solid ${zoneLabelColor}`
              : obMitigated
                ? '1px dashed rgba(148,163,184,0.5)'
                : zonePartialMit
                  ? `1.5px dashed ${zoneLabelColor}aa`
                  : isAiAutoZone
                    ? `1.5px solid ${zoneLabelColor}cc`
                    : isWhaleOb
                      ? `2px solid ${zoneLabelColor}`
                      : isWhaleBbMb
                        ? `1px solid ${zoneLabelColor}88`
                        : isCandleAnalysisZone
                          ? typeof item.id === 'string' && item.id.startsWith('candle-analysis-auto-ob')
                            ? `1.5px dashed ${zoneLabelColor}aa`
                            : typeof item.id === 'string' &&
                                (item.id.startsWith('candle-analysis-auto-hvp') ||
                                  item.id.startsWith('candle-analysis-auto-lvp'))
                              ? `1px dashed ${zoneLabelColor}dd`
                              : typeof item.id === 'string' && item.id.startsWith('candle-analysis-auto-vzone-ext')
                                ? `1px dashed ${zoneLabelColor}55`
                                : typeof item.id === 'string' && item.id.startsWith('candle-analysis-auto-vzone')
                                  ? `1px dashed ${zoneLabelColor}99`
                                  : item.id === 'candle-analysis-zone-breakout' ||
                                    /^smart-overlay-zone-breakout-\d+$/.test(String(item.id))
                                  ? `1px dashed ${zoneLabelColor}55`
                                  : typeof item.id === 'string' && item.id.startsWith('candle-analysis-vifvg-ghost-')
                                    ? `1px dashed ${zoneLabelColor}88`
                                    : typeof item.id === 'string' && item.id.startsWith('candle-analysis-vifvg-frame-')
                                      ? `1px solid ${zoneLabelColor}aa`
                                      : typeof item.id === 'string' &&
                                          (item.id.startsWith('candle-analysis-vifvg-bg-') ||
                                            item.id.startsWith('candle-analysis-vifvg-bar-'))
                                        ? 'none'
                                        : typeof item.id === 'string' &&
                                            item.id.endsWith('-zone') &&
                                            /candle-analysis-brk-(bullOb|bearOb)-/.test(item.id)
                                          ? `1px dashed ${zoneLabelColor}77`
                                        : typeof item.id === 'string' &&
                                            item.id.endsWith('-zone') &&
                                            /candle-analysis-brk-(bullBr|bearBr)-/.test(item.id)
                                          ? `1px solid ${zoneLabelColor}cc`
                                        : typeof item.id === 'string' && /zone-smbc-vol-/.test(item.id)
                                          ? 'none'
                                        : typeof item.id === 'string' && /zone-smbc-.+-base$/.test(item.id)
                                          ? `1px dashed ${zoneLabelColor}40`
                                        : typeof item.id === 'string' && /zone-smbc-.+-upper$/.test(item.id)
                                          ? `1px solid ${zoneLabelColor}88`
                                        : typeof item.id === 'string' && /zone-smbc-.+-lower$/.test(item.id)
                                          ? `1px solid ${zoneLabelColor}88`
                                  : typeof item.id === 'string' && item.id.startsWith('candle-analysis-bosw-proj-')
                                    ? `1px dashed ${zoneLabelColor}99`
                                  : `1px solid ${zoneLabelColor}38`
                          : undefined;
            const ovZFront = item as OverlayItem;
            const zoneFillPreserveFront = ovZFront.zoneFillPreserve === true;
            const overlayZoneExtraFront = String(ovZFront.overlayZoneExtraClass || '')
              .trim()
              .split(/\s+/)
              .filter(Boolean);
            /** `overlayZoneExtraClass`가 있으면 테두리는 globals.css에서 처리(인라인 border가 클래스를 덮지 않게) */
            const zoneBorderInline = overlayZoneExtraFront.length > 0 ? undefined : zoneBorder;
            const zoneGeomOnScreen = overlayHtmlLabelIntersectsChart(left, top, width, height, chartW, chartH);
            return (
              <div key={item.id} style={{ position: 'absolute', left: 0, top: 0 }}>
                <div
                  className={[
                    'overlay-zone',
                    isCandleAnalysisZone ? 'overlay-zone--candle-analysis' : '',
                    (item as OverlayItem).zonePulse ? 'overlay-zone--core-pulse' : '',
                    ...overlayZoneExtraFront,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left,
                    top,
                    width,
                    height,
                    background: OVERLAY_ZONE_FILL_BEHIND_CHART
                      ? 'transparent'
                      : zoneDirTint
                        ? zoneDirTint.fillSoft
                        : softenZoneFill(
                          item.color,
                          isCaCoreSd
                            ? 0.88
                            : isCandleAnalysisZone
                              ? caZoneFillSoftMult
                              : zoneFillPreserveFront
                                ? zoneFillPreserveLayoutMult(maxCleanChartLayout, executionCalmLayout)
                                : zoneFillSoftenMult,
                          zoneFillPreserveFront ? { minAlpha: 0.055 } : undefined
                        ),
                    border:
                      (isWhaleToolkitPaintOnly ? `1.5px solid ${zoneLabelColor}72` : undefined) ??
                      zoneBorderInline ??
                      (zoneDirTint && !isBiblePatternFrame ? `1px solid ${zoneDirTint.strokeSoft}` : undefined),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent,
                    paddingLeft: 6,
                    paddingRight: 6,
                    pointerEvents: OVERLAY_ZONE_FILL_BEHIND_CHART || smcPlaybookLock ? 'none' : 'auto',
                    cursor:
                      OVERLAY_ZONE_FILL_BEHIND_CHART || smcPlaybookLock
                        ? 'default'
                        : isWhaleAutoOverlay
                          ? 'default'
                          : isDragging
                            ? 'grabbing'
                            : 'grab',
                  }}
                  onMouseDown={(e) => {
                    if (OVERLAY_ZONE_FILL_BEHIND_CHART || isWhaleAutoOverlay || smcPlaybookLock) return;
                    startLabelDrag(item.id, left, xMaxRight, liveOff, e);
                  }}
                >
                  <span style={{ opacity: 0, pointerEvents: 'none' }}>{zoneLabelWithDir}</span>
                </div>
                {showZoneCaption &&
                  !suppressZoneHtmlCaptions &&
                  (isCaCoreSd ||
                    isMajorEngineSrZone ||
                    isOverlayChartTextVisible(item.id) ||
                    smcDeskWhaleZoneCaption) && (
                  <div
                    className={overlayLabelProximityIds.has(String(item.id)) ? 'overlay-label-near-candle' : undefined}
                    style={{
                      position: 'absolute',
                      left: labelLeft,
                      top: labelTop,
                      whiteSpace: isCaCoreSd || isMajorEngineSrZone ? 'pre-line' : 'nowrap',
                      textAlign: isCaCoreSd || isMajorEngineSrZone ? 'right' : undefined,
                      lineHeight: isCaCoreSd || isMajorEngineSrZone ? 1.2 : undefined,
                      fontSize: isCaCoreSd || isMajorEngineSrZone
                        ? (maxCleanChartLayout ? 9 : 9.5)
                        : isCandleAnalysisZone
                          ? (maxCleanChartLayout ? 8.25 : 9)
                          : isTapZone
                            ? Math.max(getFontSize(item.id), 12)
                            : maxCleanChartLayout
                              ? Math.max(8, getFontSize(item.id) - 0.5)
                              : getFontSize(item.id),
                      fontFamily: getFontFamily(item.id) || undefined,
                      fontWeight: isCaCoreSd || isMajorEngineSrZone ? 700 : isCandleAnalysisZone ? 560 : isTapZone ? 700 : isWhaleOb ? 760 : 520,
                      color: isCaCoreSd || isMajorEngineSrZone ? '#f8fafc' : zoneLabelColor,
                      opacity: isCaCoreSd || isMajorEngineSrZone
                        ? 0.95
                        : isCandleAnalysisZone
                          ? (maxCleanChartLayout ? 0.82 : 0.88)
                          : obMitigated
                            ? 0.72
                            : zonePartialMit
                              ? 0.86
                              : isWhaleBbMb
                                ? 0.9
                                : maxCleanChartLayout
                                  ? 0.9
                                  : 1,
                      textShadow: '0 1px 2px rgba(0,0,0,0.75)',
                      background: isCaCoreSd || isMajorEngineSrZone
                        ? 'rgba(15,23,42,0.52)'
                        : isWhaleOb
                          ? 'rgba(8,15,25,.56)'
                          : 'rgba(8,15,25,.42)',
                      padding: isCaCoreSd || isMajorEngineSrZone ? '3px 7px' : isCandleAnalysisZone ? '2px 5px' : isTapZone || isWhaleOb ? '3px 8px' : '2px 6px',
                      borderRadius: isCaCoreSd || isMajorEngineSrZone ? 5 : 999,
                      maxWidth: labelBoxW,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      pointerEvents: OVERLAY_ZONE_FILL_BEHIND_CHART ? 'auto' : undefined,
                      cursor:
                        smcPlaybookLock
                          ? 'default'
                          : OVERLAY_ZONE_FILL_BEHIND_CHART && !isWhaleAutoOverlay
                            ? isDragging
                              ? 'grabbing'
                              : 'grab'
                            : isCaCoreSd || isMajorEngineSrZone || !compactTradeLabel(item.id, zoneLabelWithDir).expandable
                              ? 'default'
                              : 'pointer',
                    }}
                    onMouseDown={(e) => {
                      if (smcPlaybookLock || !OVERLAY_ZONE_FILL_BEHIND_CHART || isWhaleAutoOverlay) return;
                      startLabelDrag(item.id, left, xMaxRight, liveOff, e);
                    }}
                    onClick={() => {
                      if (isCaCoreSd || isMajorEngineSrZone) return;
                      const current = compactTradeLabel(item.id, zoneLabelWithDir);
                      if (!current.expandable) return;
                      if (didDragRef.current) { didDragRef.current = false; return; }
                      setOverlayTradeLabelExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                    }}
                    title={
                      [
                        (item as OverlayItem).labelTooltip,
                        !isCaCoreSd && !isMajorEngineSrZone && compactTradeLabel(item.id, zoneLabelWithDir).expandable ? '클릭: 상세 접기/펼치기' : '',
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                  >
                    {isCaCoreSd ? zoneBaseLabel : compactTradeLabel(item.id, zoneLabelWithDir).label}
                  </div>
                )}
                {chartSectionVis.s2 &&
                  hasPrices &&
                  !suppressZoneHtmlCaptions &&
                  !isCaCoreSd &&
                  !isWhaleToolkitPaintOnly &&
                  !shouldHideWhaleAutoZoneChartCaption(item) &&
                  isOverlayChartTextVisible(item.id) &&
                  zoneGeomOnScreen && (
                  <>
                    <div
                      className={overlayLabelProximityIds.has(String(item.id)) ? 'overlay-label-near-candle' : undefined}
                      style={{ ...priceBoxStyle, top: top - PRICE_BOX_OFFSET_VERTICAL }}
                    >
                      {formatOverlayPrice(zoneHigh)}
                    </div>
                    <div
                      className={overlayLabelProximityIds.has(String(item.id)) ? 'overlay-label-near-candle' : undefined}
                      style={{ ...priceBoxStyle, top: top + height + PRICE_BOX_OFFSET_VERTICAL }}
                    >
                      {formatOverlayPrice(zoneLow)}
                    </div>
                  </>
                )}
                {labelEditMode && !isWhaleAutoOverlay && (
                  <div
                    className="overlay-move-controls"
                    style={{
                      position: 'absolute',
                      left: zoneFeatureRightX - 120,
                      top: top + height / 2 - 14,
                      display: 'flex',
                      gap: 2,
                      zIndex: 10,
                      alignItems: 'center',
                    }}
                  >
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, -NUDGE, 0)} title="왼쪽">←</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, NUDGE, 0)} title="오른쪽">→</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, -NUDGE)} title="위">↑</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, NUDGE)} title="아래">↓</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, -1)} title="글자 작게">A−</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, 1)} title="글자 크게">A+</button>
                  </div>
                )}
              </div>
            );
          }

          if (typeof item.x2 === 'number' && typeof item.y2 === 'number' && isLineKind(item.kind)) {
            const isSmartMoneyMvpLine = String(item.id || '').startsWith('smartmoney-mvp-');
            const noProjectSeg = Boolean((item as OverlayItem).noProject);
            const baseMinX = Math.min(item.x1, item.x2);
            const baseMinY = Math.min(item.y1, item.y2);
            const segW = Math.abs(item.x2 - item.x1) || 1;
            const xMaxRight = item.xMaxRight ?? (baseMinX + segW);
            // noProject: screenOverlays에서는 끝점까지 계산되지만, 여기서 비-tap 추세선은 기본이 xMaxRight까지 외삽됨 → 스파이더웹 방지
            const lineWidth = noProjectSeg ? Math.max(segW, 1) : Math.max(segW, xMaxRight - baseMinX);
            // max(20,…) 제거: 세로가 작을 때 viewBox 비율이 깨져 선이 휘어 보이던 문제 방지
            const lineHeight = Math.max(6, Math.abs(item.y2 - item.y1));
            const yAtRight = item.y1 + (item.y2 - item.y1) * ((xMaxRight - item.x1) / segW);
            const minX = baseMinX + liveOff.dx;
            const minY = baseMinY + liveOff.dy;
            const x1 = item.x1 - baseMinX;
            const y1 = item.y1 - baseMinY;
            const isTapLine = item.id?.startsWith?.('tap-');
            const x2 = noProjectSeg
              ? item.x2 - baseMinX
              : (isTapLine ? (item.x2 ?? xMaxRight) : xMaxRight) - baseMinX;
            const y2 = noProjectSeg ? item.y2 - baseMinY : yAtRight - baseMinY;
            const lineDragXMax = noProjectSeg ? Math.max(item.x1, item.x2) : xMaxRight;
            const align = getLabelAlign(item.id);
            const textX = align === 'left' ? x1 + 6 : align === 'right' ? Math.max(x1 + 6, x2 - 4) : (x1 + x2) / 2;
            const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
            const linePriceText = typeof item.price1 === 'number'
              ? (typeof item.price2 === 'number' && Math.abs(item.price1 - item.price2) > 1e-6
                ? `${formatOverlayPrice(item.price1)} ~ ${formatOverlayPrice(item.price2)}`
                : formatOverlayPrice(item.price1))
              : '';
            const tapLabelNudge =
              item.id === 'tap-breakout' ? -14 :
              item.id === 'tap-retest-support' ? 10 :
              item.id === 'tap-retest-support-2' ? 16 :
              item.id === 'tap-resistance' ? -10 :
              item.id === 'tap-entry' ? -12 :
              item.id === 'tap-stop' ? 12 :
              item.id === 'tap-target' ? -16 : 0;
            const labelNudge = (item.id === 'tailong-resistance' ? -10 : item.id === 'tailong-support' ? 10 : 0) + tapLabelNudge;
            const labelOnlyY = Math.max(12, lineHeight / 2) + labelNudge;
            const lblTxRaw = (item as OverlayItem).labelTextColor;
            const isTfCloseLine = String(item.id || '').startsWith('close-');
            const tfCloseWhite = isTfCloseLine && settings.chartTfCloseLinesWhite !== false;
            const lineTextSolid = lblTxRaw
              ? toSolidOverlayColor(lblTxRaw)
              : tfCloseWhite
                ? 'rgba(248,250,252,0.96)'
                : toSolidOverlayColor((item as OverlayItem).lineLabelColor ?? item.color);
            const lineLabelBg = (item as OverlayItem).labelBackgroundColor;
            const lineStripFs = Math.max(8, Math.min(16, overlayPriceStripFontSize));
            const baseLabel = overlayDisplayLabel(item.label, item.id, uiMode, translateLabelsToKo, item.kind);
            const lineDirTag = inferOverlayDirectionTag(item as OverlayItem, baseLabel);
            const lineDirProb = resolveDirectionProb(item as OverlayItem, baseLabel, lineDirTag);
            const weeklyState = (analysis as { weeklyState?: string | null } | null)?.weeklyState ?? null;
            const monthlyState = (analysis as { monthlyState?: string | null } | null)?.monthlyState ?? null;
            const reclaimUp = weeklyState === 'accepted_above' || monthlyState === 'accepted_above';
            const reclaimDown = weeklyState === 'accepted_below' || monthlyState === 'accepted_below';
            const reclaimOutcome = reclaimUp && !reclaimDown ? '상승' : reclaimDown && !reclaimUp ? '하락' : '대기';
            const reclaimOutcomeMark = reclaimOutcome === '상승' ? '↑' : reclaimOutcome === '하락' ? '↓' : '·';
            const keyLevelDisplayLabel = item.kind === 'keyLevel' && analysis
              ? (item.id.startsWith('key-mustBreak-') && (analysis as { breakoutLevelProbability?: number }).breakoutLevelProbability != null
                ? `돌파 상승 확률 · ${(analysis as { breakoutLevelProbability: number }).breakoutLevelProbability}%`
                : item.id.startsWith('key-invalidation-') && (analysis as { invalidationLevelProbability?: number }).invalidationLevelProbability != null
                  ? `${baseLabel} · ${(analysis as { invalidationLevelProbability: number }).invalidationLevelProbability}%`
                  : item.id.startsWith('key-mustHold-') && (analysis as { supportLevelProbability?: number }).supportLevelProbability != null
                    ? `S의 상승확률 · ${(analysis as { supportLevelProbability: number }).supportLevelProbability}%`
                    : item.id === 'key-mustReclaim-close'
                      ? `${baseLabel} · ${reclaimOutcomeMark} ${reclaimOutcome}`
                      : item.id === 'key-mustHold-close'
                        ? `${baseLabel} · ${reclaimOutcomeMark} ${reclaimOutcome}`
                    : baseLabel)
              : baseLabel;
            const keyLevelDisplayLabelWithDir = lineDirTag && item.kind !== 'keyLevel'
              ? withDirAndProb(String(keyLevelDisplayLabel), lineDirTag, lineDirProb)
              : keyLevelDisplayLabel;
            const tapTextXOffset =
              item.id === 'tap-breakout' ? 8 :
              item.id === 'tap-resistance' ? 12 :
              item.id === 'tap-retest-support' ? 10 :
              item.id === 'tap-retest-support-2' ? 22 :
              item.id === 'tap-entry' ? 6 :
              item.id === 'tap-stop' ? 6 :
              item.id === 'tap-target' ? 4 : 8;
            const tapTextX = Math.max(x1 + 8, x2 - tapTextXOffset);
            const finalTextX = isTapLine ? tapTextX : textX;
            const finalTextAnchor = isTapLine ? 'end' : textAnchor;
            const chartW = item.chartWidth ?? 0;
            const chartH = item.chartHeight ?? 0;
            const lineLabelHShift = getLabelHShift(item.id);
            const lineLabelLeft =
              minX + finalTextX - 110 + lineLabelHShift + (isSmartMoneyMvpLine ? 0 : (htmlLabelStackDx.get(item.id) ?? 0));
            const rawLineLabelTop = minY + labelOnlyY - 12;
            const lineFlatForLabel = isOverlayLineFlatPrice({
              price1: asOverlayFiniteNumber(item.price1),
              price2: asOverlayFiniteNumber(item.price2),
              y1: item.y1,
              y2: item.y2,
            });
            let lineLabelTop =
              lastClosePixelY != null && !lineFlatForLabel
                ? nudgeLabelYFromLastPrice(rawLineLabelTop, lastClosePixelY, chartH - 12)
                : rawLineLabelTop;
            if (!isSmartMoneyMvpLine) {
              lineLabelTop += htmlLabelStackDy.get(item.id) ?? 0;
            } else {
              lineLabelTop = rawLineLabelTop;
            }
            const LINE_LABEL_W = 260;
            const LINE_LABEL_H = 28;
            const isCloseSettlementLine = Boolean(item.id?.startsWith?.('close-'));
            const showLineLabel = overlayHtmlLabelIntersectsChart(lineLabelLeft, lineLabelTop, LINE_LABEL_W, LINE_LABEL_H, chartW, chartH);
            const showLineLabelResolved = showLineLabel;
            const axisStripPos = isCloseSettlementLine ? closeStripPosition : priceDisplayPosition;
            const axisStripShift = isCloseSettlementLine ? closeStripHShift : priceDisplayHShift;
            const closeMarkType =
              isCloseSettlementLine && typeof keyLevelDisplayLabel === 'string'
                ? parseCloseSettlementMarkType(keyLevelDisplayLabel)
                : null;
            const closeMark = closeMarkType === 'good' ? '✓' : closeMarkType === 'bad' ? '✗' : '';
            const closeCompactLabel = isCloseSettlementLine ? `${closeTfFromId(item.id)} ${closeMark || ''}`.trim() : keyLevelDisplayLabel;
            const isCoreCloseLine = item.id === 'key-mustReclaim-close' || item.id === 'key-mustHold-close';
            const lineGeomOnScreen = overlayHtmlLabelIntersectsChart(minX, minY, lineWidth, lineHeight, chartW, chartH);
            const lineIdStr = String(item.id || '');
            const lineCatStr = String((item as OverlayItem).category || '');
            const lineTrendEligible =
              (item.kind === 'trendLine' || item.kind === 'rsiDivergenceLine') &&
              (lineCatStr === 'trendlineEngine' ||
                lineCatStr === 'autoTrendline' ||
                lineIdStr.startsWith('diag-') ||
                lineIdStr.startsWith('parkf-') ||
                lineIdStr.startsWith('cptc-'));
            /**
             * SMC: 대각 지그재그(Lux 등)만 밝은 선 — ParkF LinReg·ChartPrime 채널은 엔진 색(금·대·중·소 구분).
             * (기존: trendlineEngine 전부 흰색 → LinReg도 전부 하얗게 덮어씌워짐)
             */
            const isSmcDeskParkfOrCpTrend =
              lineIdStr.startsWith('parkf-') || lineIdStr.startsWith('cptc-');
            const isSmcDeskZigzagWhite =
              isSmcDeskMode &&
              lineTrendEligible &&
              !isSmcDeskParkfOrCpTrend &&
              (lineCatStr === 'trendlineEngine' || lineCatStr === 'autoTrendline' || lineIdStr.startsWith('diag-'));
            const isUnifiedTrendStrokeLine = unifiedDeskMode && lineTrendEligible;
            const isSmcDeskVerdictTrend =
              isSmcDeskMode &&
              lineTrendEligible &&
              !isSmcDeskZigzagWhite &&
              !isSmcDeskParkfOrCpTrend;
            const lineStrokeColor =
              tfCloseWhite
                ? 'rgba(255,255,255,0.93)'
                : isSmcDeskZigzagWhite
                  ? 'rgba(248,250,252,0.88)'
                  : (isUnifiedTrendStrokeLine || isSmcDeskVerdictTrend) && verdictVisualBias === 'long'
                    ? 'rgba(34,197,94,0.9)'
                    : (isUnifiedTrendStrokeLine || isSmcDeskVerdictTrend) && verdictVisualBias === 'short'
                      ? 'rgba(239,68,68,0.9)'
                      : item.color || '#62efe0';
            return (
              <div key={item.id} style={{ position: 'absolute', left: 0, top: 0 }}>
                <svg
                  className={`overlay-svg-item ${isCoreCloseLine ? 'overlay-core-line' : ''}`}
                  style={{
                    left: minX,
                    top: minY,
                    width: lineWidth,
                    height: lineHeight,
                    cursor: smcPlaybookLock ? 'default' : isDragging ? 'grabbing' : 'grab',
                  }}
                  viewBox={`0 0 ${lineWidth} ${lineHeight}`}
                  onMouseDown={(e) => {
                    if (smcPlaybookLock) return;
                    startLabelDrag(item.id, minX, lineDragXMax, liveOff, e);
                  }}
                >
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={lineStrokeColor}
                    strokeOpacity={1}
                    strokeWidth={
                      tfCloseWhite
                        ? Math.min(2.35, getLineStrokeWidth(item) + 0.35)
                        : isSmcDeskZigzagWhite
                          ? Math.min(2.2, getLineStrokeWidth(item) + 0.45)
                          : isCoreCloseLine
                            ? getLineStrokeWidth(item) + 1
                            : getLineStrokeWidth(item)
                    }
                    strokeDasharray={
                      isSmcDeskZigzagWhite
                        ? undefined
                        : item.lineDash ??
                          (item.kind === 'scenario'
                            ? '6 5'
                            : item.kind === 'harmonicLeg' || item.kind === 'rsiDivergenceLine'
                              ? '5 5'
                              : undefined)
                    }
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {keyLevelDisplayLabel &&
                showLineLabelResolved &&
                (!suppressHtmlOverlayCaptions || isAiZoneEngineOverlayId(String(item.id))) &&
                isOverlayChartTextVisible(item.id) ? (
                  <div
                    className={[
                      isCoreCloseLine ? 'overlay-core-label' : undefined,
                      overlayLabelProximityIds.has(String(item.id)) && !isCoreCloseLine ? 'overlay-label-near-candle' : undefined,
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined}
                    style={{ position: 'absolute', left: lineLabelLeft, top: lineLabelTop, color: lineTextSolid, fontSize: isTapLine ? Math.max(getFontSize(item.id), 12) : getFontSize(item.id), fontWeight: isTapLine ? 700 : 500, fontFamily: getFontFamily(item.id) || undefined, background: lineLabelBg ?? (isCoreCloseLine ? 'rgba(8,15,25,.62)' : 'rgba(8,15,25,.40)'), padding: isCoreCloseLine || lineLabelBg ? '3px 8px' : '2px 6px', borderRadius: 999, whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', cursor: smcPlaybookLock ? 'default' : compactTradeLabel(item.id, String(keyLevelDisplayLabelWithDir)).expandable ? 'pointer' : 'default', textShadow: lineLabelBg ? 'none' : '0 0 8px rgba(0,0,0,.88), 0 1px 2px rgba(0,0,0,.65)' }}
                    onClick={() => {
                      const current = compactTradeLabel(item.id, String(keyLevelDisplayLabelWithDir));
                      if (!current.expandable) return;
                      if (didDragRef.current) { didDragRef.current = false; return; }
                      setOverlayTradeLabelExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                    }}
                    title={compactTradeLabel(item.id, String(keyLevelDisplayLabelWithDir)).expandable ? '클릭: 상세 접기/펼치기' : undefined}
                  >
                    {closeMark ? (
                      <>
                        <span
                          className={`close-settlement-mark ${closeMarkType === 'good' ? 'good' : 'bad'}`}
                          style={{ color: closeMarkType === 'good' ? '#22C55E' : '#EF4444' }}
                        >
                          {closeMark}
                        </span>
                        <span>{` ${closeTfFromId(item.id)}`}</span>
                      </>
                    ) : (
                      <span>{compactTradeLabel(item.id, String(lineDirTag ? withDirAndProb(String(closeCompactLabel), lineDirTag, lineDirProb) : closeCompactLabel)).label}</span>
                    )}
                  </div>
                ) : null}
                {chartSectionVis.s2 &&
                linePriceText &&
                (!suppressHtmlOverlayCaptions || isAiZoneEngineOverlayId(String(item.id))) &&
                isOverlayChartTextVisible(item.id) &&
                lineGeomOnScreen ? (
                  <div
                    className={overlayLabelProximityIds.has(String(item.id)) ? 'overlay-label-near-candle' : undefined}
                    style={{
                      ...buildPriceStripOverlayStyle(
                        axisStripPos,
                        axisStripShift,
                        minX + lineWidth,
                        chartW,
                        {
                          top: minY + y2 - PRICE_BOX_OFFSET_VERTICAL,
                          whiteSpace: 'nowrap',
                          fontSize: lineStripFs,
                          fontFamily: getFontFamily(item.id) || undefined,
                          fontWeight: 600,
                          color: lineTextSolid,
                          background: 'rgba(8,15,25,0.55)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          pointerEvents: 'none',
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
                        }
                      ),
                    }}
                  >
                    {linePriceText}
                  </div>
                ) : null}
                {labelEditMode && !smcPlaybookLock && (
                  <div className="overlay-move-controls" style={{ position: 'absolute', left: minX + lineWidth - 120, top: minY + lineHeight / 2 - 14, display: 'flex', gap: 2, zIndex: 10, alignItems: 'center' }}>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, -NUDGE, 0)} title="왼쪽">←</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, NUDGE, 0)} title="오른쪽">→</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, -NUDGE)} title="위">↑</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, NUDGE)} title="아래">↓</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, -1)} title="글자 작게">A−</button>
                    <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, 1)} title="글자 크게">A+</button>
                  </div>
                )}
              </div>
            );
          }

          if (
            suppressHtmlOverlayCaptions &&
            BULK_LABEL_KINDS.has(String(item.kind || '')) &&
            !String(item.id || '').startsWith('bible-cp-') &&
            !isAiZoneEngineOverlayId(String(item.id || ''))
          ) {
            return <Fragment key={item.id} />;
          }

          const isCaCorePivot =
            item.kind === 'label' && typeof item.id === 'string' && item.id.startsWith('ca-core-pivot-');
          const isSmbcBreakoutPin =
            item.kind === 'label' && typeof item.id === 'string' && item.id.startsWith('zone-smbc-mk-');
          const isBibleModePin =
            (item as OverlayItem).category === 'bibleMode' &&
            typeof item.id === 'string' &&
            item.id.startsWith('bible-cp-') &&
            !item.id.startsWith('bible-cp-frame-');
          const isPatternLabel = (item as any).category === 'patternVision' && item.kind === 'label';
          const patternId = isPatternLabel ? item.id.replace(/-label$/, '') : undefined;
          const pinBaseLabel = overlayDisplayLabel(item.label, item.id, uiMode, translateLabelsToKo, item.kind);
          const pinDirTag = inferOverlayDirectionTag(item as OverlayItem, pinBaseLabel);
          const pinDirProb = resolveDirectionProb(item as OverlayItem, pinBaseLabel, pinDirTag);
          const pinLabel = withDirAndProb(pinBaseLabel, pinDirTag, pinDirProb);
          const pinLabelShown = isBibleModePin ? String(item.label || '') : pinLabel;
          const caPivotNudge = isCaCorePivot ? caCorePivotNudge.get(item.id) : undefined;
          const rawPinLeft =
            item.x1 + liveOff.dx + getLabelHShift(item.id) + (caPivotNudge?.dx ?? 0);
          const rawPinTop = item.y1 + liveOff.dy + (caPivotNudge?.dy ?? 0);
          const chartW = item.chartWidth ?? 0;
          const chartH = item.chartHeight ?? 0;
          const pinLeft = rawPinLeft + (htmlLabelStackDx.get(String(item.id)) ?? 0);
          let pinTop =
            lastClosePixelY != null && !isSmbcBreakoutPin && !isCaCorePivot
              ? nudgeLabelYFromLastPrice(rawPinTop, lastClosePixelY, chartH - 8)
              : rawPinTop;
          pinTop += htmlLabelStackDy.get(item.id) ?? 0;
          const PIN_APPROX_W = isCaCorePivot ? 58 : isSmbcBreakoutPin ? 28 : isBibleModePin ? 40 : 240;
          const PIN_APPROX_H = isCaCorePivot ? 40 : isSmbcBreakoutPin ? 26 : isBibleModePin ? 40 : 36;
          const showPinOverlay = overlayHtmlLabelIntersectsChart(pinLeft, pinTop, PIN_APPROX_W, PIN_APPROX_H, chartW, chartH);
          const pinLabelBg = (item as OverlayItem).labelBackgroundColor;
          const pinLabelFg = (item as OverlayItem).labelTextColor;
          const pinColor = pinLabelFg
            ? toSolidOverlayColor(pinLabelFg)
            : toSolidOverlayColor(item.color);
          const pinXMaxRight =
            typeof item.xMaxRight === 'number' && Number.isFinite(item.xMaxRight)
              ? item.xMaxRight
              : typeof chartW === 'number' && chartW > 0
                ? chartW - 8
                : 999;
          const isSmcDeskSwingGlow =
            isSmcDeskMode &&
            (item.kind === 'swingLabel' || item.kind === 'poi') &&
            !isCaCorePivot &&
            !isSmbcBreakoutPin &&
            !isBibleModePin;
          const isSmcPlaybookPin = isSmcEntryPlaybookOverlayId(item.id);
          const smcPivotGlowColor = String(item.color || '#94a3b8');
          if (!showPinOverlay) {
            return <Fragment key={item.id} />;
          }
          return (
            <div key={item.id} style={{ position: 'absolute', left: 0, top: 0 }}>
            <div
              className={`overlay-pin ${isPatternLabel && onChartPointClick ? 'overlay-pin-clickable' : ''}${isBibleModePin ? ' overlay-pin--bible' : ''}${overlayLabelProximityIds.has(String(item.id)) ? ' overlay-label-near-candle' : ''}`}
              style={{
                left: pinLeft,
                top: pinTop,
                borderColor: item.color || '#62efe0',
                color: pinColor,
                background: pinLabelBg ?? undefined,
                padding: isBibleModePin
                  ? 0
                  : isCaCorePivot
                  ? '5px 7px'
                  : isSmbcBreakoutPin
                    ? 0
                    : pinLabelBg
                      ? '3px 10px'
                      : undefined,
                borderRadius: isBibleModePin ? 999 : isCaCorePivot ? 999 : isSmbcBreakoutPin ? 4 : pinLabelBg ? 8 : isSmcDeskSwingGlow ? 999 : undefined,
                width: isBibleModePin ? 36 : isCaCorePivot ? 52 : isSmbcBreakoutPin ? 22 : isSmcDeskSwingGlow ? 36 : undefined,
                height: isBibleModePin ? 36 : isCaCorePivot ? undefined : isSmbcBreakoutPin ? 22 : isSmcDeskSwingGlow ? 36 : undefined,
                minWidth: isBibleModePin ? 36 : isCaCorePivot ? 50 : isSmbcBreakoutPin ? 22 : isSmcDeskSwingGlow ? 34 : undefined,
                minHeight: isBibleModePin ? 36 : isCaCorePivot ? 34 : isSmbcBreakoutPin ? 22 : isSmcDeskSwingGlow ? 34 : undefined,
                display: isBibleModePin || isCaCorePivot || isSmbcBreakoutPin || isSmcDeskSwingGlow ? 'flex' : undefined,
                flexDirection: isCaCorePivot ? 'column' : undefined,
                alignItems: isBibleModePin || isCaCorePivot || isSmbcBreakoutPin || isSmcDeskSwingGlow ? 'center' : undefined,
                boxSizing: isBibleModePin || isSmbcBreakoutPin || isCaCorePivot ? 'border-box' : undefined,
                borderWidth: isBibleModePin ? 2 : isCaCorePivot ? 1.5 : isSmbcBreakoutPin ? 2 : isSmcDeskSwingGlow ? 2 : undefined,
                borderStyle: isBibleModePin || isCaCorePivot || isSmbcBreakoutPin || isSmcDeskSwingGlow ? 'solid' : undefined,
                boxShadow: isSmcDeskSwingGlow
                  ? `0 0 16px ${smcPivotGlowColor}cc, 0 0 40px ${smcPivotGlowColor}55, inset 0 0 14px rgba(255,255,255,0.12)`
                  : isBibleModePin
                  ? '0 2px 8px rgba(0,0,0,0.45)'
                  : isCaCorePivot
                  ? item.id.includes('-s-')
                    ? '0 0 14px rgba(168,85,247,0.55), 0 0 28px rgba(168,85,247,0.22), inset 0 0 12px rgba(255,255,255,0.06)'
                    : '0 0 14px rgba(45,212,191,0.5), 0 0 28px rgba(45,212,191,0.2), inset 0 0 12px rgba(255,255,255,0.06)'
                  : undefined,
                fontSize: isSmcDeskSwingGlow
                  ? 9
                  : isBibleModePin
                    ? 18
                    : isCaCorePivot
                      ? 8.5
                      : isSmbcBreakoutPin
                        ? 11
                        : getFontSize(item.id),
                fontWeight: isCaCorePivot ? 700 : isSmbcBreakoutPin ? 800 : undefined,
                lineHeight: isCaCorePivot ? 1.2 : isSmbcBreakoutPin ? 1 : undefined,
                textAlign: isCaCorePivot ? 'center' : undefined,
                whiteSpace: isCaCorePivot ? 'pre-line' : undefined,
                fontFamily: getFontFamily(item.id) || undefined,
                justifyContent:
                  isBibleModePin || isCaCorePivot || isSmbcBreakoutPin
                    ? 'center'
                    : getLabelAlign(item.id) === 'left'
                      ? 'flex-start'
                      : getLabelAlign(item.id) === 'right'
                        ? 'flex-end'
                        : 'center',
                cursor: isBibleModePin ? 'pointer' : isSmcPlaybookPin ? 'default' : isDragging ? 'grabbing' : 'grab',
                textShadow: isBibleModePin
                  ? 'none'
                  : isCaCorePivot
                  ? '0 1px 2px rgba(0,0,0,0.85)'
                  : pinLabelBg || isSmbcBreakoutPin
                    ? 'none'
                    : '0 0 8px rgba(0,0,0,.88), 0 1px 2px rgba(0,0,0,.65)',
              }}
              onMouseDown={(e) => {
                if (isBibleModePin || isSmcPlaybookPin) return;
                startLabelDrag(item.id, pinLeft, pinXMaxRight, liveOff, e);
              }}
              onClick={
                isBibleModePin
                  ? (e) => {
                      e.stopPropagation();
                      if (didDragRef.current) {
                        didDragRef.current = false;
                        return;
                      }
                      const text = (item as OverlayItem).labelTooltip || String(item.label || '');
                      setBiblePatternTip({ text, left: e.clientX, top: e.clientY });
                    }
                  : isPatternLabel && onChartPointClick && patternId
                  ? () => {
                if (didDragRef.current) { didDragRef.current = false; return; }
                const limit = visibleLimit(timeframe);
                const visibleLen = Math.min(limit, candles.length);
                const baseIdx = candles.length - visibleLen;
                const c = candles[candles.length - 1];
                if (!c) return;
                const engine = analysis?.engine as Record<string, any> | undefined;
                const filterNearby = (arr: any[] | undefined) => (arr ?? []).filter((x: any) => Math.abs((x.index ?? 0) - (visibleLen - 1)) <= NEARBY_BARS);
                onChartPointClick({
                  symbol,
                  timeframe,
                  candleData: { timestamp: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0, candleIndex: candles.length - 1 },
                  engineData: {
                    bos: filterNearby(engine?.bos),
                    choch: filterNearby(engine?.choch),
                    fvgNearby: filterNearby(engine?.fvg),
                    obNearby: filterNearby(engine?.obs),
                    sweep: filterNearby(engine?.sweeps),
                    eqh: filterNearby(engine?.eqh),
                    eql: filterNearby(engine?.eql),
                  },
                  patternId,
                });
                  }
                  : undefined
              }
            >
              {!isSmbcBreakoutPin && !isCaCorePivot && !isBibleModePin && !isSmcDeskSwingGlow ? (
                <span className="overlay-pin-dot" style={{ background: item.color || '#62efe0' }} />
              ) : null}
              {isBibleModePin
                ? pinLabelShown
                : isCaCorePivot || isSmcDeskSwingGlow || isOverlayChartTextVisible(item.id)
                ? isSmbcBreakoutPin
                  ? String(item.label || '')
                  : isCaCorePivot
                    ? pinLabel
                    : [pinLabel, typeof item.price1 === 'number' ? formatOverlayPrice(item.price1) : null].filter(Boolean).join(' · ')
                : ''}
            </div>
            {labelEditMode && (
              <div className="overlay-move-controls" style={{ position: 'absolute', left: pinLeft - 80, top: pinTop - 14, display: 'flex', gap: 2, zIndex: 10, alignItems: 'center' }}>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, -NUDGE, 0)} title="왼쪽">←</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, NUDGE, 0)} title="오른쪽">→</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, -NUDGE)} title="위">↑</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setOffset(item.id, 0, NUDGE)} title="아래">↓</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, -1)} title="글자 작게">A−</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setFontSize(item.id, 1)} title="글자 크게">A+</button>
              </div>
            )}
            </div>
          );
        })}
        {(uiMode === 'EXECUTION' ||
          uiMode === 'SMART' ||
          uiMode === 'MAX_ANALYSIS' ||
          isSmcDeskMode ||
          uiMode === 'UNIFIED_DESK' ||
          uiMode === 'AI_ZONE' ||
          uiMode === 'TAPPOINT') &&
          (analysis?.verdict === 'LONG' || analysis?.verdict === 'SHORT') &&
          (analysis?.confidence ?? 0) >= 80 &&
          Boolean((analysis as any)?.confirmedSignal?.confirmed) &&
          !settings.chartBulkHideLabels &&
          !settings.chartBulkHideHLines &&
          !settings.chartBulkHideZones && (
          <ExecutionOverlay analysis={analysis} positions={executionPositions} theme={theme} />
        )}
      </div>

      {!!(analysis as any)?.featureProbabilities?.length &&
        uiMode !== 'CANDLE_ANALYSIS' &&
        uiMode !== 'BIBLE_MODE' &&
        uiMode !== 'HOT_ZONE' &&
        !isSmcDeskMode &&
        !unifiedDeskMode && (
        <div
          style={{
            position: 'absolute',
            right: 10,
            top: 58,
            zIndex: 3,
            width: 260,
            maxHeight: featureGaugeCollapsed ? 42 : 220,
            overflow: featureGaugeCollapsed ? 'hidden' : 'auto',
            background: 'rgba(2,6,23,0.72)',
            border: '1px solid rgba(148,163,184,0.28)',
            borderRadius: 10,
            padding: '8px 10px',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: featureGaugeCollapsed ? 0 : 6 }}>
            <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700 }}>기능 확률 게이지 (상위)</div>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              style={{ padding: '1px 8px', fontSize: 10 }}
              onClick={() => {
                const next = !featureGaugeCollapsed;
                setFeatureGaugeCollapsed(next);
                try {
                  window.localStorage.setItem(FEATURE_GAUGE_COLLAPSE_KEY, next ? '1' : '0');
                } catch {}
              }}
            >
              {featureGaugeCollapsed ? '펼치기' : '접기'}
            </button>
          </div>
          {!featureGaugeCollapsed && ((analysis as any).featureProbabilities as Array<any>).slice(0, 5).map((f) => (
            <div key={f.key} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10 }}>
                <span style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                <span style={{ color: f.directionBias === 'LONG' ? '#22C55E' : f.directionBias === 'SHORT' ? '#EF4444' : '#94a3b8' }}>
                  {f.directionBias === 'LONG' ? '롱우세' : f.directionBias === 'SHORT' ? '숏우세' : '중립'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 2, fontSize: 10 }}>
                <div style={{ color: '#86efac' }}>상승 {f.riseProb}%</div>
                <div style={{ color: '#fca5a5', textAlign: 'right' }}>하락 {f.fallProb}%</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
                <div style={{ color: '#67e8f9' }}>지지 {f.supportProb}%</div>
                <div style={{ color: '#fda4af', textAlign: 'right' }}>저항 {f.resistanceProb}%</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showRsiPanel && analysis?.indicators && (
        <div className="indicator-panel" style={{ bottom: 48 }}>
          <div className="rsi-panel-title">RSI / StochRSI</div>
          <div className="rsi-panel-chart">
            {(() => {
              const ind = analysis.indicators;
              const rsiArr = ind.rsi || [];
              const k = ind.stochK || [];
              const d = ind.stochD || [];
              const tail = Math.min(60, rsiArr.length);
              const slice = (arr: number[]) => arr.slice(-tail);
              const rs = slice(rsiArr);
              const ks = slice(k);
              const ds = slice(d);
              const max = Math.max(100, ...rs, ...ks, ...ds);
              const min = Math.min(0, ...rs, ...ks, ...ds);
              const h = 40;
              const toY = (v: number) => h - ((v - min) / (max - min || 1)) * h;
              const startIdx = Math.max(0, rsiArr.length - tail);
              const divLines = (analysis as { rsiDivergenceSignal?: { divergenceLines?: Array<{ type: 'bullish' | 'bearish'; index1: number; index2: number; rsi1?: number; rsi2?: number }> } })?.rsiDivergenceSignal?.divergenceLines || [];
              return (
                <svg width="100%" height={h} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, tail)} ${h}`}>
                  {rs.length > 1 && <polyline fill="none" stroke="#62efe0" strokeWidth="0.5" points={rs.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                  {ks.length > 1 && <polyline fill="none" stroke="#4df2a3" strokeWidth="0.5" strokeDasharray="2 2" points={ks.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                  {ds.length > 1 && <polyline fill="none" stroke="#ffb86b" strokeWidth="0.5" strokeDasharray="2 2" points={ds.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                  <line x1={0} y1={toY(30)} x2={tail} y2={toY(30)} stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
                  <line x1={0} y1={toY(70)} x2={tail} y2={toY(70)} stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
                  {divLines.map((dl, i) => {
                    const r1 = dl.rsi1 ?? 50;
                    const r2 = dl.rsi2 ?? 50;
                    const x1 = dl.index1 - startIdx;
                    const x2 = dl.index2 - startIdx;
                    if (x1 < 0 || x2 < 0 || x1 >= tail || x2 >= tail) return null;
                    const stroke = dl.type === 'bullish' ? '#22C55E' : '#EF4444';
                    return <line key={`div-${i}`} x1={x1} y1={toY(r1)} x2={x2} y2={toY(r2)} stroke={stroke} strokeWidth="0.8" strokeDasharray="2 2" />;
                  })}
                </svg>
              );
            })()}
          </div>
          <div className="rsi-panel-legend">
            <span style={{ color: '#62efe0' }}>RSI</span>
            <span style={{ color: '#4df2a3' }}>K</span>
            <span style={{ color: '#ffb86b' }}>D</span>
            {(analysis as any)?.rsiDivergenceSignal?.volume && (
              <span style={{ color: '#94a3b8', marginLeft: 8 }}>
                {(analysis as any).rsiDivergenceSignal.volume.spike ? 'Vol OK' : `Vol: ${(analysis as any).rsiDivergenceSignal.volume.label}`}
              </span>
            )}
          </div>
        </div>
      )}

      {showMacdPanel && analysis?.indicators && (() => {
        const ind = analysis.indicators;
        const macdL = ind.macdLine || [];
        const macdS = ind.macdSignal || [];
        const macdH = ind.macdHist || [];
        const tail = Math.min(60, macdH.length || macdL.length);
        const slice = (arr: number[]) => arr.slice(-tail);
        const ml = slice(macdL); const ms = slice(macdS); const mh = slice(macdH);
        const all = [...ml, ...ms, ...mh].filter(x => isFinite(x));
        const max = Math.max(0.0001, ...all); const min = Math.min(-0.0001, ...all);
        const h = 40; const toY = (v: number) => h - ((v - min) / (max - min || 1)) * h;
        const divSig = (analysis as { rsiDivergenceSignal?: { divergence?: { bullish?: boolean; bearish?: boolean } } })?.rsiDivergenceSignal?.divergence;
        const macdDivBg =
          divSig?.bullish === true ? 'rgba(34,197,94,0.12)' : divSig?.bearish === true ? 'rgba(239,68,68,0.12)' : 'transparent';
        return (
          <div key="macd" className="indicator-panel" style={{ bottom: 48 + (showRsiPanel ? 78 : 0) }}>
            <div className="rsi-panel-title">MACD {macdDivBg !== 'transparent' ? '(RSI 괴리 톤)' : ''}</div>
            <div className="rsi-panel-chart" style={{ position: 'relative' }}>
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: macdDivBg,
                  pointerEvents: 'none',
                  borderRadius: 4,
                }}
              />
              <svg width="100%" height={h} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, tail)} ${h}`}>
                {mh.length > 1 && mh.map((v, i) => (
                  <line key={i} x1={i} y1={toY(0)} x2={i} y2={toY(v)} stroke={v >= 0 ? '#62efe0' : '#ff7b7b'} strokeWidth="0.8" />
                ))}
                {ml.length > 1 && <polyline fill="none" stroke="#62efe0" strokeWidth="0.5" points={ml.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                {ms.length > 1 && <polyline fill="none" stroke="#ffb86b" strokeWidth="0.5" strokeDasharray="2 2" points={ms.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                <line x1={0} y1={toY(0)} x2={tail} y2={toY(0)} stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
              </svg>
            </div>
            <div className="rsi-panel-legend">
              <span style={{ color: '#62efe0' }}>MACD</span>
              <span style={{ color: '#ffb86b' }}>Signal</span>
              <span>Histogram</span>
            </div>
          </div>
        );
      })()}

      {showBbPanel && candles.length > 0 && (() => {
        const bb = bollingerBands(candles, 20, 2);
        const visible = candles.slice(-60);
        const u = bb.upper.slice(-60); const m = bb.mid.slice(-60); const l = bb.lower.slice(-60);
        const min = Math.min(...l, ...visible.map(c => c.low));
        const max = Math.max(...u, ...visible.map(c => c.high));
        const h = 40; const toY = (v: number) => h - ((v - min) / (max - min || 1)) * h;
        return (
          <div key="bb" className="indicator-panel" style={{ bottom: 48 + (showRsiPanel ? 78 : 0) + (showMacdPanel ? 78 : 0) }}>
            <div className="rsi-panel-title">Bollinger Bands</div>
            <div className="rsi-panel-chart">
              <svg width="100%" height={h} preserveAspectRatio="none" viewBox={`0 0 60 ${h}`}>
                {u.length > 1 && <polyline fill="none" stroke="#62efe0" strokeWidth="0.5" strokeOpacity="0.8" points={u.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                {m.length > 1 && <polyline fill="none" stroke="#ffb86b" strokeWidth="0.5" strokeDasharray="2 2" points={m.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                {l.length > 1 && <polyline fill="none" stroke="#ff7b7b" strokeWidth="0.5" strokeOpacity="0.8" points={l.map((v, i) => `${i},${toY(v)}`).join(' ')} />}
                {visible.length > 1 && <polyline fill="none" stroke="#c7d2e0" strokeWidth="0.6" points={visible.map((c, i) => `${i},${toY(c.close)}`).join(' ')} />}
              </svg>
            </div>
            <div className="rsi-panel-legend">
              <span style={{ color: '#62efe0' }}>Upper</span>
              <span style={{ color: '#ffb86b' }}>Mid</span>
              <span style={{ color: '#ff7b7b' }}>Lower</span>
              <span style={{ color: '#c7d2e0' }}>Close</span>
            </div>
          </div>
        );
      })()}

      <div className="chart-bottombar">
        <div className="scale">
          <div className="small-chip">{symbol}</div>
          <div className="small-chip">{timeframe}</div>
          <div className="small-chip">{analysis?.verdict === 'LONG' ? '롱' : analysis?.verdict === 'SHORT' ? '숏' : '관망'}</div>
          {(analysis as any)?.rsiDivergenceSignal && (
            <div className={`small-chip ${(analysis as any).rsiDivergenceSignal.verdict === 'LONG' ? 'c-long' : (analysis as any).rsiDivergenceSignal.verdict === 'SHORT' ? 'c-short' : (analysis as any).rsiDivergenceSignal.verdict === 'WATCH' ? 'c-watch' : ''}`} style={(analysis as any).rsiDivergenceSignal.verdict === 'NONE' ? { color: '#94a3b8' } : undefined}>
              RSI {(analysis as any).rsiDivergenceSignal.verdict === 'LONG' ? 'LONG' : (analysis as any).rsiDivergenceSignal.verdict === 'SHORT' ? 'SHORT' : (analysis as any).rsiDivergenceSignal.verdict === 'WATCH' ? 'WATCH' : 'NONE'}
            </div>
          )}
          {marketError ? <div className="small-chip small-chip-warn">오류</div> : <div className="small-chip small-chip-live">실시간 연동</div>}
        </div>
      </div>
    </div>
  );
}

const ChartView = forwardRef<ChartSnapshotRef, Omit<Parameters<typeof ChartViewInner>[0], 'snapshotRef'>>(
  (props, ref) => <ChartViewInner {...props} snapshotRef={ref as React.RefObject<ChartSnapshotRef | null>} />
);
export default memo(ChartView);
