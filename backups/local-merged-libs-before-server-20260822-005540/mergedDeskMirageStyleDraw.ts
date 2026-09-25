/**
 * 통합·분석 — Mirage/TV 참조 이미지형 통합 작도 (zone · 추세선 · 신호 · 안착 1-2-3).
 * zone은 분석 캔들(time1)부터 마지막 봉(time2)까지, 가격은 피벗 wick에 스냅.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import { buildMirageTvStructureOverlays } from '@/lib/mergedAnalysisMirageTvVisual';
import { applyMirageZoneProactiveIntel } from '@/lib/mergedDeskMirageZoneExchangeIntel';
import { applyMirageZoneReactiveLifecycle } from '@/lib/mergedDeskMirageZoneState';
import { injectMirageZoneInvalidationLines } from '@/lib/mergedDeskMirageZoneInvalidation';
import { collectSwingPivots } from '@/lib/mergedDeskCandleTrendline';
import {
  mergedWorkCandles,
  snapMergedOverlayTimeToCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import { filterMergedDeskChartMarkers } from '@/lib/mergedAnalysisOverlayIds';

const BULL = '#00E676';
const BEAR = '#FF5252';

function tvPinLabel(item: {
  id: string;
  label: string;
  time1: number;
  price1: number;
  color: string;
  labelBackgroundColor: string;
  labelTextColor: string;
  overlayZoneExtraClass: string;
  confidence?: number;
}): OverlayItem {
  return {
    id: item.id,
    kind: 'label',
    label: item.label,
    confidence: item.confidence ?? 0.88,
    x1: 0,
    y1: 0,
    time1: item.time1 as UTCTimestamp,
    price1: item.price1,
    color: item.color,
    labelBackgroundColor: item.labelBackgroundColor,
    labelTextColor: item.labelTextColor,
    overlayZoneExtraClass: item.overlayZoneExtraClass,
    category: 'mirageLSP',
  };
}

/** Mirage TV 존과 겹치는 clutter zone 면 제거 — 라인·추세·시나리오는 유지 */
export function stripClutterZonesForMirageStyleDraw(overlays: OverlayItem[]): OverlayItem[] {
  const zoneKinds = new Set(['zone', 'supplyZone', 'demandZone', 'biasBand', 'channelBand']);
  return overlays.filter((o) => {
    const id = String(o.id || '');
    const extra = String(o.overlayZoneExtraClass || '');
    const kind = String(o.kind || '');
    if (!zoneKinds.has(kind)) return true;
    if (extra.includes('merged-ares-critical-zone')) return false;
    if (extra.includes('merged-ares-key-zone')) return false;
    if (extra.includes('merged-ares-confirm-zone')) return false;
    if (id.startsWith('merged-ares-zone-')) return false;
    if ((id.startsWith('pulse-pro-') || id.startsWith('atlas-pulse-')) && kind === 'zone') return false;
    if (id.startsWith('major-support-') || id.startsWith('major-resistance-')) return false;
    if (
      (id.startsWith('merged-swing-channel') || extra.includes('merged-swing-channel')) &&
      !extra.includes('merged-ares-mlsp-tv') &&
      !extra.includes('merged-desk-rb-channel') &&
      !extra.includes('merged-desk-blue-red-channel') &&
      !id.startsWith('merged-desk-rb-')
    ) {
      return false;
    }
    return true;
  });
}

function findEntryCandleTime(
  candles: Candle[],
  plan: UnifiedDeskTradePlan,
  confirms: MergedDirectionConfirm[]
): number | null {
  const n = candles.length;
  if (n < 2) return null;

  const tierOrder = { confirmed: 3, strong: 2, building: 1 } as const;
  const sameDir = confirms
    .filter((c) => c.direction === plan.direction)
    .sort((a, b) => {
      const tb = tierOrder[b.tier] - tierOrder[a.tier];
      if (tb !== 0) return tb;
      return Number(b.time) - Number(a.time);
    });
  if (sameDir[0]) {
    return Number(snapMergedOverlayTimeToCandles(Number(sameDir[0].time), candles));
  }

  const entry = plan.entry;
  if (!Number.isFinite(entry) || entry <= 0) return null;
  for (let i = n - 1; i >= Math.max(0, n - 48); i--) {
    const c = candles[i]!;
    if (plan.direction === 'LONG' && c.close >= entry) {
      return Number(snapMergedOverlayTimeToCandles(Number(c.time), candles));
    }
    if (plan.direction === 'SHORT' && c.close <= entry) {
      return Number(snapMergedOverlayTimeToCandles(Number(c.time), candles));
    }
  }
  return Number(snapMergedOverlayTimeToCandles(Number(candles[n - 1]!.time), candles));
}

/** 1·돌파 → 2·안착 → 3·확인 — 앵커 이후 최근 3단계 캔들 라벨 */
function buildSettleSequenceLabels(
  candles: Candle[],
  timeframe: string,
  scenario: MergedBounceScenario | null
): OverlayItem[] {
  if (!scenario?.active) return [];
  const work = mergedWorkCandles(candles, timeframe);
  const n = work.length;
  if (n < 6) return [];

  const anchorT = Number(snapMergedOverlayTimeToCandles(scenario.anchorTime, work));
  let anchorIdx = work.findIndex((c) => Number(c.time) >= anchorT);
  if (anchorIdx < 0) anchorIdx = Math.max(0, n - 12);

  const level =
    scenario.direction === 'up'
      ? scenario.anchorTop
      : scenario.direction === 'down'
        ? scenario.anchorBot
        : (scenario.anchorTop + scenario.anchorBot) / 2;

  const steps: Array<{ key: string; label: string; bg: string; text: string }> = [
    { key: 'break', label: '1·돌파', bg: 'rgba(234,179,8,0.92)', text: '#1c1917' },
    { key: 'settle', label: '2·안착', bg: 'rgba(249,115,22,0.92)', text: '#fff7ed' },
    { key: 'confirm', label: '3·확인', bg: 'rgba(34,197,94,0.92)', text: '#ecfdf5' },
  ];

  const hits: number[] = [];
  for (let i = anchorIdx; i < n && hits.length < 3; i++) {
    const c = work[i]!;
    const brokeUp = c.close > level && c.open <= level;
    const brokeDn = c.close < level && c.open >= level;
    if (scenario.direction === 'up' && brokeUp) hits.push(i);
    else if (scenario.direction === 'down' && brokeDn) hits.push(i);
  }

  if (hits.length < 2) {
    const tail = [Math.max(anchorIdx, n - 5), Math.max(anchorIdx + 1, n - 3), n - 1];
    for (let k = 0; k < 3; k++) hits[k] = Math.min(n - 1, tail[k]!);
  }

  const out: OverlayItem[] = [];
  for (let si = 0; si < steps.length; si++) {
    const idx = hits[si] ?? Math.min(n - 1, anchorIdx + si + 1);
    const c = work[idx]!;
    const st = steps[si]!;
    const pinPrice = scenario.direction === 'down' ? c.high : c.low;
    out.push(
      tvPinLabel({
        id: `merged-ares-mlsp-tv-settle-${st.key}-${c.time}`,
        label: st.label,
        time1: Number(snapMergedOverlayTimeToCandles(Number(c.time), work)),
        price1: pinPrice,
        color: st.bg,
        labelBackgroundColor: st.bg,
        labelTextColor: st.text,
        overlayZoneExtraClass: `merged-ares-mlsp-tv-settle-label merged-ares-mlsp-tv-settle-${st.key}`,
        confidence: 0.8,
      })
    );
  }
  return out;
}

export type MergedDeskMirageStyleDrawPack = {
  overlays: OverlayItem[];
  markers: AtlasPulseMarker[];
};

/** TV/Mirage 참조 — zone·채널·삼각·신호·안착 1-2-3 통합 작도 */
export function buildMergedDeskMirageStyleDrawPack(params: {
  candles: Candle[];
  timeframe: string;
  tradePlan?: UnifiedDeskTradePlan | null;
  bounceScenarios?: MergedBounceScenario[];
  directionConfirms?: MergedDirectionConfirm[];
}): MergedDeskMirageStyleDrawPack {
  const tf = normalizeChartTimeframe(params.timeframe);
  const work = mergedWorkCandles(params.candles, tf);
  const primaryScenario =
    params.bounceScenarios?.find((s) => s.active) ?? params.bounceScenarios?.[0] ?? null;

  const { highs, lows } = collectSwingPivots(work, tf);
  const pivotTimes = [...highs.slice(-4), ...lows.slice(-4)].map((p) => p.time);

  const zoneCtx = primaryScenario
    ? {
        anchorTime: primaryScenario.anchorTime,
        legHigh: primaryScenario.legHigh,
        legLow: primaryScenario.legLow,
        direction:
          primaryScenario.direction === 'up'
            ? ('up' as const)
            : primaryScenario.direction === 'down'
              ? ('down' as const)
              : undefined,
        pivotTimes: [primaryScenario.anchorTime, ...pivotTimes],
      }
    : pivotTimes.length
      ? { pivotTimes }
      : undefined;

  const overlays: OverlayItem[] = injectMirageZoneInvalidationLines(
    applyMirageZoneProactiveIntel(
      applyMirageZoneReactiveLifecycle(
        [...buildMirageTvStructureOverlays(work, tf, zoneCtx)],
        work
      ),
      work,
      { chartTimeframe: tf }
    ),
    work
  );

  return { overlays, markers: [] };
}

/** 차트 마커 — Mirage 신호·구조·진입만 (키존·TB·ST 스택 제거) */
export function filterMergedDeskMirageChartMarkers(markers: AtlasPulseMarker[]): AtlasPulseMarker[] {
  return filterMergedDeskChartMarkers(markers).filter((m) => {
    const id = String(m.id || '');
    if (id.startsWith('merged-ares-mlsp-') || id.startsWith('merged-mlsp-')) return true;
    if (id.startsWith('merged-leading-candle-')) return true;
    if (id.startsWith('merged-smc-bos-') || id.startsWith('merged-smc-choch-') || id.startsWith('merged-sweep-')) {
      return true;
    }
    if (id.startsWith('merged-desk-tv-ls-')) return true;
    if (id.startsWith('merged-desk-rb-core-mk-')) return true;
    return false;
  });
}

function keepMirageDeskOverlay(o: OverlayItem): boolean {
  const id = String(o.id || '');
  const kind = String(o.kind || '');
  const extra = String(o.overlayZoneExtraClass || '');
  if (id.startsWith('eagle1-') || extra.includes('eagle1-zone')) {
    return (
      kind === 'zone' ||
      kind === 'demandZone' ||
      kind === 'supplyZone' ||
      kind === 'fvg' ||
      kind === 'ob' ||
      kind === 'bprZone' ||
      kind === 'reactionZone' ||
      kind === 'trendLine' ||
      kind === 'keyLevel' ||
      kind === 'label' ||
      kind === 'scenario' ||
      !kind
    );
  }

  /** 통합구름(CP밴드·흰경로) — channelBand·trendLine */
  if (
    id.startsWith('merged-cp-cloud') ||
    id.startsWith('merged-unified-cloud') ||
    id.startsWith('merged-ares-st-cloud') ||
    extra.includes('merged-cp-cloud') ||
    extra.includes('merged-unified-cloud') ||
    extra.includes('merged-ares-st-cloud')
  ) {
    return kind === 'channelBand' || kind === 'trendLine' || kind === 'zone' || !kind;
  }

  // HotZone · HQ · 스윙진입 · CHoCH→OB · 되돌림 · Hot존 레일 · TV구조 롱숏
  if (
    id === 'merged-desk-entry-zone' ||
    id.startsWith('merged-desk-hotzone-') ||
    id.startsWith('merged-desk-ai-buy-') ||
    id.startsWith('merged-desk-ai-sell-') ||
    id.startsWith('merged-desk-ai-defense-') ||
    id.startsWith('merged-desk-asset-') ||
    id.startsWith('merged-desk-hq-') ||
    id.startsWith('merged-desk-core-sr-') ||
    id.startsWith('merged-desk-tv-ls-') ||
    id.startsWith('merged-swing-mid-') ||
    id.startsWith('merged-choch-ob-') ||
    id.startsWith('merged-retrace-') ||
    id.startsWith('merged-swing-channel') ||
    id.startsWith('merged-desk-rb-') ||
    id.startsWith('merged-desk-rocket-range-') ||
    id.startsWith('merged-desk-advvol-seat-') ||
    id.startsWith('merged-swing-regime-') ||
    id.startsWith('merged-desk-candle-trend') ||
    id.startsWith('merged-ares-st-cloud') ||
    id.startsWith('merged-ares-key-') ||
    id.startsWith('merged-ares-critical-') ||
    extra.includes('merged-desk-entry-zone') ||
    extra.includes('merged-desk-hotzone-entry') ||
    extra.includes('merged-desk-hotzone-zone') ||
    extra.includes('merged-desk-hotzone-rail') ||
    extra.includes('merged-desk-ai-force-zone') ||
    extra.includes('merged-desk-asset-auto-zone') ||
    extra.includes('merged-desk-core-sr') ||
    extra.includes('merged-desk-tv-ls-zone') ||
    extra.includes('merged-hq-entry-zone') ||
    extra.includes('merged-swing-mid-entry') ||
    extra.includes('merged-desk-rb-channel') ||
    extra.includes('merged-desk-rocket-range-zone') ||
    extra.includes('merged-desk-advvol-seat') ||
    extra.includes('merged-ares-st-cloud') ||
    extra.includes('merged-ares-key-zone') ||
    extra.includes('merged-ares-critical-zone')
  ) {
    return (
      kind === 'zone' ||
      kind === 'demandZone' ||
      kind === 'supplyZone' ||
      kind === 'reactionZone' ||
      kind === 'trendLine' ||
      kind === 'channelBand' ||
      kind === 'keyLevel' ||
      kind === 'label' ||
      kind === 'scenario' ||
      kind === 'fvg' ||
      kind === 'ob' ||
      kind === 'harmonic' ||
      !kind
    );
  }

  if (id.startsWith('merged-desk-trade-rail-')) return true;
  /** btccion 라인·레일 작도 — zone 면 없음(keyLevel·trendLine·label) */
  if (id.startsWith('merged-desk-btccion-') || extra.includes('merged-desk-btccion')) {
    return (
      kind === 'keyLevel' ||
      kind === 'trendLine' ||
      kind === 'label' ||
      kind === 'marker' ||
      !kind
    );
  }
  if (
    id.startsWith('merged-desk-adv-') ||
    id.startsWith('merged-ares-mlsp-tv-ob') ||
    id.startsWith('merged-ares-mlsp-tv-smc-ob') ||
    id.startsWith('merged-ares-mlsp-tv-hvp') ||
    id.startsWith('merged-ares-mlsp-tv-lvp') ||
    id.startsWith('merged-ares-mlsp-tv-sr-') ||
    extra.includes('merged-desk-adv-')
  ) {
    return (
      kind === 'zone' ||
      kind === 'demandZone' ||
      kind === 'supplyZone' ||
      kind === 'trendLine' ||
      kind === 'keyLevel' ||
      kind === 'label' ||
      !kind
    );
  }
  if (
    id.startsWith('merged-desk-downside-plan-') ||
    id.startsWith('merged-desk-projected-support') ||
    id.startsWith('merged-desk-projected-resist') ||
    id.startsWith('merged-desk-support-rebound')
  ) {
    return (
      kind === 'zone' ||
      kind === 'demandZone' ||
      kind === 'supplyZone' ||
      kind === 'trendLine' ||
      kind === 'keyLevel' ||
      kind === 'label'
    );
  }
  /** key/critical/confirm/시나리오 zone·선 — finalize가 삭제하던 버그 복구 */
  if (
    id.startsWith('merged-ares-confirm-') ||
    id.startsWith('merged-ares-zone-') ||
    id.startsWith('merged-smc-') ||
    id.startsWith('merged-ares-settle-') ||
    id.startsWith('merged-ares-bounce-') ||
    id.startsWith('merged-ares-scenario-') ||
    extra.includes('merged-ares-confirm-zone') ||
    extra.includes('merged-ares-settle-zone') ||
    extra.includes('merged-ares-smc-') ||
    extra.includes('merged-ares-bounce-') ||
    extra.includes('merged-ares-scenario-')
  ) {
    return (
      kind === 'zone' ||
      kind === 'demandZone' ||
      kind === 'supplyZone' ||
      kind === 'box' ||
      kind === 'fvg' ||
      kind === 'ob' ||
      kind === 'reactionZone' ||
      kind === 'bprZone' ||
      kind === 'trendLine' ||
      kind === 'keyLevel' ||
      kind === 'bos' ||
      kind === 'choch' ||
      kind === 'label' ||
      kind === 'scenario' ||
      !kind
    );
  }
  if (id.startsWith('merged-ares-mlsp-tv-inval-')) return kind === 'keyLevel';
  if (id.startsWith('merged-ares-mlsp-tv-struct-')) return kind === 'bos' || kind === 'choch';
  if (id.startsWith('merged-ares-mlsp-tv-target-')) return kind === 'keyLevel';
  if (id.startsWith('merged-ares-mlsp-tv-confluence-')) return kind === 'zone';
  if (!id.startsWith('merged-ares-mlsp-tv-')) return false;
  if (id.includes('merged-ares-mlsp-tv-sr-')) return true;
  if (id.includes('-liq-band-') || id.includes('-struct-band-') || id.includes('-dir-verdict')) return kind === 'zone';
  if (id.includes('-tt-flip-')) return kind === 'trendLine';
  if (id.includes('-tt-channel-')) return kind === 'channelBand';
  if (id.includes('-conflict-')) return kind === 'zone';
  if (id.includes('-trend-liq-') || id.includes('-trend-macro-')) return kind === 'trendLine';
  return kind === 'zone' || kind === 'trendLine' || kind === 'channelBand';
}

/**
 * 통합·분석 차트 최종 화이트리스트 —
 * 통합구름 + Mirage zone·추세선·ENTRY/SL/TP + HotZone/HQ/스윙 진입존.
 */
export function finalizeMergedDeskMirageChartOverlays(overlays: OverlayItem[]): OverlayItem[] {
  return overlays.filter(keepMirageDeskOverlay).map((raw) => {
    const id = String(raw.id || '');
    if (id.startsWith('merged-desk-trade-rail-')) {
      return {
        ...raw,
        overlayZoneExtraClass: `${String(raw.overlayZoneExtraClass || '')} merged-ares-mlsp-trade-label`.trim(),
      };
    }
    return raw;
  });
}
