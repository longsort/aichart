/**
 * 통합·분석 차트 — 구조·안착·반등/하락 시나리오 (핵심 ZONE 유지 + 추가 레이어).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  buildMergedBounceTargetOverlays,
  type MergedBounceScenario,
} from '@/lib/mergedAnalysisBounceTargets';
import { buildMergedScenarioPathZones } from '@/lib/mergedAnalysisScenarioPathZones';
import { buildMergedSettleZoneOverlay } from '@/lib/mergedAnalysisVisualLayers';
import {
  buildMergedSmcLeadingOverlays,
  buildMergedSmcChochLevelOverlays,
  buildMergedSmcStructureMarkers,
  type MergedSmcLeadingContext,
} from '@/lib/mergedAnalysisSmcLeading';

function isSmcStructureChartOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const extra = String(o.overlayZoneExtraClass || '');
  if (id.startsWith('merged-smc-choch-level-')) return true;
  if (extra.includes('merged-ares-smc-choch')) return true;
  if (extra.includes('merged-ares-smc-bounce-line')) return true;
  if (id.startsWith('merged-smc-bounce-')) return true;
  return false;
}

/** analyze 안착 + CHoCH 안착/무효 + 반등·하락 T1/T2/Tmax */
export function buildMergedDeskStructureScenarioOverlays(params: {
  candles: Candle[];
  timeframe: string;
  analysis?: AnalyzeResponse | null;
  smcLeading: MergedSmcLeadingContext;
  bounceScenarios: MergedBounceScenario[];
}): OverlayItem[] {
  const out: OverlayItem[] = [];

  const settle = buildMergedSettleZoneOverlay(params.analysis, params.candles, params.timeframe);
  if (settle) out.push(settle);

  const smc = buildMergedSmcLeadingOverlays(params.candles, params.smcLeading, params.timeframe).filter(
    isSmcStructureChartOverlay
  );
  out.push(...smc);

  const choch = params.smcLeading.lastChoch;
  if (choch?.phase === 'failed') {
    out.push(
      ...buildMergedSmcChochLevelOverlays({
        choch,
        candles: params.candles,
        timeframe: params.timeframe,
        bosCountInLeg: params.smcLeading.bosCountInLeg,
        detailKo: params.smcLeading.detailKo,
      })
    );
    const chochIdx = Math.max(0, Math.min(params.candles.length - 1, choch.index));
    const t1 = Number(params.candles[Math.max(0, chochIdx - 2)]?.time);
    const t2 = Number(params.candles[params.candles.length - 1]?.time);
    const band = Math.abs(choch.price) * 0.0012;
    out.push({
      id: `merged-smc-choch-failed-${choch.index}`,
      kind: 'supplyZone',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: (Number.isFinite(t1) ? t1 : t2) as UTCTimestamp,
      time2: t2 as UTCTimestamp,
      price1: choch.price + band,
      price2: choch.price - band,
      confidence: 42,
      color: 'rgba(100,116,139,0.22)',
      category: 'structure',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-smc-choch',
        'merged-ares-smc-choch--failed',
        'merged-ares-settle-failed',
      ].join(' '),
      labelTooltip: 'CHoCH 무효 · 안착 실패 · 조건부 참고',
    });
  }

  const activeBounce = params.bounceScenarios.filter((s) => s.active).slice(0, 1);
  if (activeBounce.length) {
    out.push(...buildMergedScenarioPathZones(params.candles, activeBounce, params.timeframe));
    out.push(...buildMergedBounceTargetOverlays(params.candles, activeBounce, params.timeframe));
  }

  return out;
}

export function buildMergedDeskStructureScenarioMarkers(
  smcLeading: MergedSmcLeadingContext
): AtlasPulseMarker[] {
  return buildMergedSmcStructureMarkers(smcLeading);
}
