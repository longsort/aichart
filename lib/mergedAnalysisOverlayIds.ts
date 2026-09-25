import type { OverlayItem } from '@/types';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';

/** 통합·분석 데스크 전용 overlay id 접두 */
export function isMergedAnalysisDeskOverlayId(id: string | undefined | null): boolean {
  const s = String(id || '');
  return (
    s.startsWith('merged-cp-cloud') ||
    s.startsWith('merged-unified-cloud') ||
    s.startsWith('merged-ares-') ||
    s.startsWith('merged-smc-') ||
    s.startsWith('merged-trade-') ||
    s.startsWith('merged-swing-mid-') ||
    s.startsWith('merged-swing-fusion-') ||
    s.startsWith('merged-swing-regime-') ||
    s.startsWith('merged-swing-channel') ||
    s.startsWith('merged-choch-ob-') ||
    s.startsWith('merged-retrace-') ||
    s.startsWith('merged-desk-super-ai-') ||
    s.startsWith('merged-desk-assets-ai-') ||
    s.startsWith('merged-desk-pattern-') ||
    s.startsWith('merged-desk-') ||
    s.startsWith('merged-desk-hotzone-') ||
    s.startsWith('merged-desk-tv-ls-') ||
    s.startsWith('merged-desk-hq-') ||
    s.startsWith('merged-desk-core-sr-') ||
    s.startsWith('merged-ls-fusion-') ||
    s.startsWith('atlas-pulse-') ||
    s.startsWith('month-desk-strike-') ||
    s.startsWith('month-desk-merged-signal-') ||
    s.startsWith('month-desk-click-precision-') ||
    s.startsWith('ai-market-zone-') ||
    s.startsWith('eagle1-pce-')
  );
}

/** 독수리1호 Parallel Channel Engine 작도 */
export function isEagle1ParallelChannelOverlay(
  item: Pick<OverlayItem, 'id' | 'category' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  if (id.startsWith('eagle1-pce-')) return true;
  if (String(item.category || '') === 'parallelChannelEngine') return true;
  return String(item.overlayZoneExtraClass || '').includes('eagle1-pce');
}

export function mergedAnalysisDeskOverlayExtraClass(item: Pick<OverlayItem, 'overlayZoneExtraClass'> | null | undefined): string {
  return String(item?.overlayZoneExtraClass || '');
}

/** 차트 zone 캡션·라벨 — id 또는 merged-* CSS 클래스 */
export function isMergedAnalysisDeskLabeledZone(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'> | null | undefined,
  mergedMode: boolean
): boolean {
  if (!mergedMode || !item) return false;
  const id = String(item.id || '');
  if (isMergedAnalysisDeskOverlayId(id)) return true;
  if (id.startsWith('month-desk-strike-') && id.includes('zone')) return true;
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  if (
    extra.includes('merged-ares-zone') ||
    extra.includes('merged-trade-long-zone') ||
    extra.includes('merged-trade-short-zone') ||
    extra.includes('merged-desk-hotzone-entry') ||
    extra.includes('merged-desk-hotzone-zone') ||
    extra.includes('merged-desk-avwap-fib') ||
    extra.includes('merged-desk-core-sr') ||
    extra.includes('merged-hq-entry-zone') ||
    extra.includes('overlay-zone--merged-swing-fusion') ||
    extra.includes('merged-swing-regime') ||
    extra.includes('merged-swing-channel') ||
    extra.includes('overlay-zone--merged-ls-fusion') ||
    extra.includes('merged-ares-st-cloud') ||
    extra.includes('merged-unified-cloud') ||
    extra.includes('merged-cp-cloud') ||
    extra.includes('ai-market-zone')
  ) {
    return true;
  }
  return false;
}

/** 반등·하락 T1/T2/Tmax 점선 — 차트 좌측 라벨 숨김(선만) */
export function isMergedDeskBounceTargetLine(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  if (extra.includes('merged-ares-bounce-line')) return true;
  if (extra.includes('merged-ares-smc-bounce-line')) return true;
  if (extra.includes('merged-desk-downside-plan-bounce')) return true;
  if (extra.includes('merged-desk-downside-plan-connector')) return true;
  if (id.startsWith('merged-desk-downside-plan-conn')) return true;
  if (id.startsWith('merged-desk-downside-plan-bounce')) return true;
  if (id.startsWith('merged-smc-bounce-')) return true;
  if (id.startsWith('merged-ares-bounce-') && String(item.kind || '') === 'keyLevel') return true;
  return false;
}

const MERGED_DESK_LINE_KINDS = new Set([
  'trendLine',
  'equilibrium',
  'keyLevel',
  'supportLine',
  'resistanceLine',
  'scenario',
]);

/**
 * 통합·분석 — 마지막 봉·동일 time 스냅으로 1px 세로 점선처럼 찌그러진 Mirage/TT 선 숨김.
 * (tri-res·tri-sup·sr·TT전환 등 — zone·가로 레일·연합밴드는 유지)
 */
export function isMergedDeskHideVerticalDashOverlay(
  item: Pick<
    OverlayItem,
    'id' | 'kind' | 'overlayZoneExtraClass' | 'lineDash' | 'time1' | 'time2' | 'price1' | 'price2'
  > & { x1?: number; x2?: number; y1?: number; y2?: number }
): boolean {
  const id = String(item.id || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  const kind = String(item.kind || '');

  if (id.startsWith('merged-desk-downside-plan-') || extra.includes('merged-desk-downside-plan')) {
    return false;
  }
  if (id.startsWith('merged-desk-news-') || extra.includes('merged-desk-news-event')) {
    return false;
  }
  /** REAL CANDLE BATTLE — 구간 세로선·SFP 경계는 의도적 세로 점선 */
  if (
    id.startsWith('candle-battle-phase-div') ||
    id.startsWith('candle-battle-sfp-v') ||
    extra.includes('candle-battle-phase-divider') ||
    extra.includes('candle-battle-sfp-vline')
  ) {
    return false;
  }

  if (
    extra.includes('merged-tt-fusion-flip-vline') ||
    id.includes('tt-flip') ||
    id.includes('merged-tt-fusion-flip') ||
    id === 'md-path-future-divider'
  ) {
    return true;
  }
  if (kind === 'label' && extra.includes('flip-vline')) return true;

  if (!MERGED_DESK_LINE_KINDS.has(kind)) return false;

  const x1 = Number(item.x1);
  const x2 = Number(item.x2);
  const y1 = Number(item.y1);
  const y2 = Number(item.y2);
  const screenCollapsed =
    Number.isFinite(x1) && Number.isFinite(x2) && Math.abs(x1 - x2) < 5;
  const t1 = item.time1;
  const t2 = item.time2;
  const timeCollapsed =
    typeof t1 === 'number' &&
    typeof t2 === 'number' &&
    Number.isFinite(t1) &&
    Number.isFinite(t2) &&
    t1 === t2;
  if (!screenCollapsed && !timeCollapsed) return false;

  const priceSpan =
    typeof item.price1 === 'number' &&
    typeof item.price2 === 'number' &&
    Number.isFinite(item.price1) &&
    Number.isFinite(item.price2)
      ? Math.abs(item.price1 - item.price2)
      : Number.isFinite(y1) && Number.isFinite(y2)
        ? Math.abs(y1 - y2)
        : 0;
  if (priceSpan < 2) return false;

  const dashed =
    Boolean(item.lineDash) ||
    extra.includes('tri-res') ||
    extra.includes('tri-sup') ||
    extra.includes('sr-res') ||
    extra.includes('sr-sup') ||
    extra.includes('sr-resist') ||
    extra.includes('sr-support') ||
    id.includes('mlsp-tv-trend-') ||
    kind === 'scenario';

  return dashed;
}

/** keyLevel·구조선 라벨 */
export function isMergedAnalysisDeskLabeledLine(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'> | null | undefined,
  mergedMode: boolean
): boolean {
  if (!mergedMode || !item) return false;
  if (isMergedDeskBounceTargetLine(item)) return false;
  const id = String(item.id || '');
  /** E/SL/TP HTML 알약 강제 표시 금지 — priceLines/축만 */
  if (/^merged-ares-line-(e|sl|tp[123])$/.test(id)) return false;
  if (/^merged-desk-trade-rail-(e|sl|tp[123])$/.test(id)) return false;
  if (/^merged-swing-mid-(e|sl|tp[123])$/.test(id)) return false;
  if (id.startsWith('merged-desk-hotzone-rail-')) return false;
  const extraEarly = mergedAnalysisDeskOverlayExtraClass(item);
  if (
    extraEarly.includes('merged-swing-mid-rail') ||
    extraEarly.includes('merged-ares-trade-rail-line') ||
    extraEarly.includes('merged-desk-hotzone-rail')
  ) {
    return false;
  }
  if (isMergedAnalysisDeskOverlayId(id)) return true;
  if (id.startsWith('month-desk-strike-')) return true;
  const extra = extraEarly;
  if (extra.includes('merged-desk-trendline-keep')) return true;
  return (
    extra.includes('merged-ares-level-line') ||
    extra.includes('merged-ares-critical-line') ||
    extra.includes('merged-ares-key-reaction-line') ||
    extra.includes('merged-ares-tb-level') ||
    extra.includes('merged-ares-tb-zigzag') ||
    extra.includes('merged-ares-tb-support-line') ||
    extra.includes('merged-ares-mlsp-') ||
    extra.includes('merged-ares-smc-choch-line')
  );
}

/** 통합·분석 — 하방 shelf·경로 zone (마지막 봉 TV 앵커 제외) */
export function isMergedAnalysisDeskChartZoneId(id: string | undefined | null): boolean {
  const s = String(id || '');
  if (s.startsWith('merged-ares-mlsp-tv-')) return false;
  if (s.startsWith('merged-desk-downside-plan-')) return false;
  return isMergedAnalysisDeskOverlayId(id);
}

/**
 * 4h 참조형 차트 ZONE만 — 번호 zone(0/가격) · 핵심/임계 zone · 롱/숏확정 · E/SL/TP.
 * 분·시·일·주·월 전 TF 동일.
 */
export function isMergedDeskReferenceZoneOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  if (extra.includes('merged-ares-key-zone')) return true;
  if (extra.includes('merged-ares-critical-zone')) return true;
  if (extra.includes('merged-ares-confirm-zone')) return true;
  if (extra.includes('merged-ares-level-line')) return true;
  if (id.startsWith('merged-ares-line-')) return true;
  return false;
}

export function filterMergedDeskReferenceZoneOverlays(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => isMergedDeskReferenceZoneOverlay(o));
}

/** CHoCH/BOS 안착·무효 · 반등/하락 T1/T2/Tmax — 핵심 ZONE 유지 + 시나리오 레이어 */
export function isMergedDeskStructureScenarioOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  if (extra.includes('merged-ares-settle-zone')) return true;
  if (extra.includes('merged-ares-smc-choch')) return true;
  if (extra.includes('merged-ares-smc-bounce-line')) return true;
  if (extra.includes('merged-ares-smc-bounce-path')) return true;
  if (extra.includes('merged-ares-bounce-line')) return true;
  if (extra.includes('merged-ares-bounce-path')) return true;
  if (extra.includes('merged-ares-scenario-leg')) return true;
  if (extra.includes('merged-ares-scenario-touch')) return true;
  if (extra.includes('merged-ares-scenario-path')) return true;
  if (extra.includes('merged-ares-scenario-target')) return true;
  if (id.startsWith('merged-smc-bounce-')) return true;
  if (id.startsWith('merged-smc-choch-failed-')) return true;
  return false;
}

/** 하방 지지·반등 · 상방 핵심저항 zone 세트 — Super AI·Mirage 화이트리스트·차트 cap 고정용 */
export function isMergedDeskDownsideSupportOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  return (
    id.startsWith('merged-desk-downside-plan-') ||
    id.startsWith('merged-desk-projected-support') ||
    id.startsWith('merged-desk-projected-resist') ||
    id.startsWith('merged-desk-support-rebound') ||
    extra.includes('merged-desk-downside-plan') ||
    extra.includes('merged-desk-projected-support') ||
    extra.includes('merged-desk-projected-resist') ||
    extra.includes('merged-desk-support-rebound')
  );
}

export function filterMergedDeskDownsideSupportOverlays(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => isMergedDeskDownsideSupportOverlay(o));
}

/** 파랑빨강띠·게이트·AI채널면 — 마지막 봉 + 우측 예측 여백 */
export function isMergedDeskRbDrawOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  return (
    id.startsWith('merged-desk-rb-') ||
    id.startsWith('merged-desk-ppl-') ||
    extra.includes('merged-desk-rb-channel') ||
    extra.includes('merged-desk-blue-red-channel') ||
    extra.includes('merged-desk-parallel-pivot') ||
    extra.includes('merged-desk-ppl') ||
    extra.includes('merged-desk-rb-ai-face') ||
    extra.includes('merged-desk-live-practice') ||
    id.startsWith('merged-desk-live-practice') ||
    extra.includes('merged-desk-rb-gate')
  );
}

/**
 * 폭락zone 라벨 — 마지막 봉 + MERGED_DESK_RIGHT_FUTURE_BARS(20) 우측 여백에 안착.
 * RB 면이어도 라벨 pad=0 예외를 깨고 +20 적용.
 */
export function isMergedDeskDumpLabelPadOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'label' | 'zoneFaceBase'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  const text = `${item.label || ''}${item.zoneFaceBase || ''}`;
  return (
    id.includes('dump-zone') ||
    id.includes('-dump') ||
    id.includes('mtf-dump') ||
    extra.includes('merged-desk-mtf-dump-zone') ||
    extra.includes('merged-desk-rb-schematic-dump') ||
    extra.includes('schematic-dump') ||
    extra.includes('merged-desk-crash') ||
    id.startsWith('merged-desk-rb-core-sr-') ||
    extra.includes('merged-desk-rb-core-sr-line') ||
    /폭락/.test(text)
  );
}

/**
 * AI면·핵심돌파·게이트목표 — 좌측은 짧은 허그, 우측 라벨은 마지막 봉+20봉 예측여백.
 * 축 숫자 라벨 없음.
 */
export function isMergedDeskRbCompactFaceOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const kind = String(item.kind || '');
  if (kind === 'channelBand' || kind === 'trendLine') return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  /** 도식저항·반등 = 터치봉 허그 — compact(마지막8봉) 경로 제외 */
  if (
    extra.includes('merged-desk-structure-reaction') ||
    extra.includes('merged-desk-rb-schematic-bounce') ||
    extra.includes('merged-desk-rb-schematic-resist') ||
    extra.includes('merged-desk-rb-schematic-dump') ||
    id.startsWith('merged-desk-rb-schematic-bounce') ||
    id.startsWith('merged-desk-rb-schematic-resist') ||
    id.startsWith('merged-desk-rb-schematic-dump')
  ) {
    return false;
  }
  /** 핵심돌파·안착·실패 = 레일 가로 zone (짧은 알약 금지, 전 TF 공동) */
  if (
    id.startsWith('merged-desk-rb-core-fail') ||
    id.startsWith('merged-desk-rb-core-break') ||
    id.startsWith('merged-desk-rb-core-settle') ||
    extra.includes('merged-desk-rb-core-fail-zone') ||
    extra.includes('merged-desk-rb-core-break-zone') ||
    extra.includes('merged-desk-rb-core-settle-zone') ||
    extra.includes('merged-desk-rb-core-set') ||
    id.startsWith('merged-desk-rb-core-sr-') ||
    extra.includes('merged-desk-rb-core-sr-line')
  ) {
    return false;
  }
  return (
    id.startsWith('merged-desk-rb-ai-') ||
    id.startsWith('merged-desk-rb-tp') ||
    id.startsWith('merged-desk-rb-gate') ||
    id.startsWith('merged-desk-rb-entry') ||
    id.startsWith('merged-desk-rb-master') ||
    id.startsWith('merged-desk-rb-phase') ||
    extra.includes('merged-desk-rb-signal-pin') ||
    extra.includes('merged-desk-live-practice') ||
    id.startsWith('merged-desk-live-practice') ||
    extra.includes('merged-desk-rb-ai-face') ||
    extra.includes('merged-desk-rb-tp-zone') ||
    extra.includes('merged-desk-rb-gate-spot') ||
    extra.includes('merged-desk-rb-master-stance') ||
    extra.includes('merged-desk-rb-phase')
  );
}

/** 파동·피보·도식 이동경로 — ChartPrime 토글/예산 컷과 분리해 유지 */
export function isMergedDeskWaveMovePathOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  return (
    id.startsWith('merged-desk-wave-path') ||
    id.startsWith('merged-desk-rb-future') ||
    id.startsWith('merged-desk-rb-schematic-path') ||
    id.startsWith('merged-desk-rb-schematic-node') ||
    extra.includes('merged-desk-wave-path') ||
    extra.includes('merged-desk-rb-future-path') ||
    extra.includes('merged-desk-rb-future-alt-path') ||
    extra.includes('merged-desk-rb-schematic-path')
  );
}

/** REAL CANDLE BATTLE — 존·마커·경로 (실데이터 전투 레이어) */
export function isMergedDeskCandleBattleOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'category' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  const cat = String(item.category || '');
  return (
    id.startsWith('candle-battle-') ||
    extra.includes('candle-battle-') ||
    cat === 'mergedDeskCandleBattle'
  );
}

/** 전투 예상경로 — 미래 time 봉스냅 금지 */
export function isMergedDeskCandleBattleForecastOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'category' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  return (
    id.startsWith('candle-battle-forecast') ||
    extra.includes('candle-battle-forecast-path')
  );
}

/** 파동경로 + 전투 예상경로 — 미래 X 좌표 */
export function isMergedDeskFutureAwarePathOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'category' | 'kind'> | null | undefined
): boolean {
  return isMergedDeskWaveMovePathOverlay(item) || isMergedDeskCandleBattleForecastOverlay(item);
}

export function isMergedDeskCandleBattleMarker(m: { id?: string } | null | undefined): boolean {
  return String(m?.id || '').startsWith('battle-') || String(m?.id || '').startsWith('candle-battle-');
}

/** 통합·분석 CHoCH/BOS 안착·무효 · 반등/하락 T1/T2/Tmax · 캔들 추세선·지지반등 */
export function isMergedDeskCandleTrendOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  /** 이동경로는 미래 시각을 쓰므로 봉스냅 추세선 경로와 분리 */
  if (isMergedDeskWaveMovePathOverlay(item)) return false;
  if (isMergedDeskMirageTvTrendOverlay(item)) return true;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  if (id.startsWith('merged-swing-channel')) return true;
  if (id.startsWith('merged-desk-rb-')) return true;
  if (id.startsWith('merged-desk-ppl-')) return true;
  if (extra.includes('merged-desk-parallel-pivot')) return true;
  if (id.startsWith('merged-desk-candle-trend')) return true;
  if (id.startsWith('merged-desk-support-rebound')) return true;
  if (id.startsWith('merged-desk-verdict-')) return true;
  if (id.startsWith('merged-desk-projected-support')) return true;
  if (id.startsWith('merged-desk-projected-resist')) return true;
  if (id.startsWith('merged-desk-adv-')) return true;
  if (id.startsWith('merged-desk-btccion-')) return true;
  if (id.startsWith('merged-ares-mlsp-tv-ob')) return true;
  if (id.startsWith('merged-ares-mlsp-tv-hvp')) return true;
  if (id.startsWith('merged-ares-mlsp-tv-lvp')) return true;
  if (id.startsWith('merged-ares-mlsp-tv-sr-')) return true;
  if (id.startsWith('merged-desk-downside-plan-')) return true;
  if (extra.includes('merged-desk-downside-plan')) return true;
  if (extra.includes('merged-desk-candle-trend')) return true;
  if (extra.includes('merged-desk-support-rebound')) return true;
  if (extra.includes('merged-desk-projected-support')) return true;
  if (extra.includes('merged-desk-projected-resist')) return true;
  if (extra.includes('merged-desk-adv-')) return true;
  if (extra.includes('merged-desk-btccion')) return true;
  if (extra.includes('merged-desk-downside-plan')) return true;
  if (extra.includes('merged-desk-structure-verdict')) return true;
  if (extra.includes('merged-swing-channel')) return true;
  if (extra.includes('merged-desk-rb-channel')) return true;
  if (extra.includes('merged-desk-blue-red-channel')) return true;
  return false;
}

/** 차트 — 참조 ZONE + 구조·시나리오 레이어 */
export function filterMergedDeskChartOverlays(items: OverlayItem[]): OverlayItem[] {
  return items.filter(
    (o) =>
      isMergedDeskReferenceZoneOverlay(o) ||
      isMergedDeskStructureScenarioOverlay(o) ||
      isMergedDeskCandleTrendOverlay(o) ||
      isMergedDeskCandleBattleOverlay(o)
  );
}

/**
 * 마지막 봉 근처 좁은 앵커 — E/SL/TP·트레이드 레일만.
 * Supply/Demand/ARES zone 면은 TradingView식 **형성봉→마지막봉** (isMergedDeskAnalyzedCandleSpanOverlay).
 */
export function isMergedDeskLastCandleAnchorOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass' | 'category'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  /** zone 면은 짧은 우측 레일 금지 — TV식 좌(분석)·우(마지막) */
  if (isMergedDeskAnalyzedCandleSpanOverlay(item)) return false;
  if (extra.includes('merged-ares-key-zone')) return false;
  if (extra.includes('merged-ares-critical-zone')) return false;
  if (extra.includes('merged-ares-confirm-zone')) return false;
  if (extra.includes('merged-ares-settle-zone')) return false;
  if (extra.includes('merged-ares-bounce-')) return false;
  if (extra.includes('merged-ares-smc-')) return false;
  if (extra.includes('merged-swing-')) return false;
  if (id.startsWith('merged-smc-')) return false;
  if (id.startsWith('merged-ares-zone-')) return false;
  if (id === 'merged-ares-va-band') return false;
  if (/^merged-ares-line-(e|sl|tp[123])$/.test(id)) return true;
  if (/^merged-desk-trade-rail-(e|sl|tp[123])$/.test(id)) return true;
  if (extra.includes('merged-ares-level-line')) return true;
  if (extra.includes('merged-trade-long-zone') || extra.includes('merged-trade-short-zone')) return true;
  if (id.startsWith('merged-trade-') && id.includes('signal-label')) return true;
  if (id.startsWith('month-desk-strike-') && id.includes('zone')) return true;
  return false;
}

/**
 * TradingView식 zone 면 — 분석 시작 캔들(좌) → 차트 **마지막 생신 캔들**(우).
 * 사용자가 고른 분봉과 무관하게 1m~1M 전 TF 공동.
 */
export function isMergedDeskAnalyzedCandleSpanOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass' | 'category'> | null | undefined
): boolean {
  if (!item) return false;
  if (isMergedDeskRbDrawOverlay(item)) return false;
  const extraEarly = String(item.overlayZoneExtraClass || '');
  /** 요만큼·이만큼 우측 밴드 — 마지막봉 우측 픽셀 안착(형성→마지막 스팬 아님) */
  if (extraEarly.includes('merged-desk-thismuch-right-band')) return false;
  if (isMergedDeskMirageTvZoneOverlay(item)) return true;
  if (isMergedDeskReferenceZoneOverlay(item)) return true;
  if (isMergedDeskStructureScenarioOverlay(item)) {
    const kind = String(item.kind || '');
    const extra = String(item.overlayZoneExtraClass || '');
    if (
      kind === 'zone' ||
      kind === 'box' ||
      kind === 'supplyZone' ||
      kind === 'demandZone' ||
      kind === 'fvg' ||
      kind === 'ob' ||
      kind === 'reactionZone' ||
      kind === 'bprZone'
    ) {
      return true;
    }
    if (extra.includes('zone') || extra.includes('channel')) return true;
  }
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  const kind = String(item.kind || '');
  if (id.startsWith('merged-desk-hotzone-') || extra.includes('merged-desk-hotzone')) return true;
  if (id.startsWith('merged-desk-reacc-') || extra.includes('merged-desk-reacc')) return true;
  if (id.startsWith('merged-desk-core-sr') || extra.includes('merged-desk-core-sr')) return true;
  if (id.startsWith('merged-desk-hq-') || extra.includes('merged-hq-entry-zone')) return true;
  if (
    (kind === 'zone' ||
      kind === 'supplyZone' ||
      kind === 'demandZone' ||
      kind === 'box' ||
      kind === 'fvg' ||
      kind === 'ob' ||
      kind === 'reactionZone' ||
      kind === 'bprZone') &&
    (id.startsWith('merged-') || extra.includes('merged-'))
  ) {
    return true;
  }
  if (item.channelBand && (id.startsWith('merged-') || extra.includes('merged-'))) return true;
  return false;
}

/** 하방 선포착 지지 사다리 — 형성봉→마지막봉 네모 zone */
export function isMergedDeskProjectedSupportNamedFaceOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  if (id.endsWith('-pin') || extra.includes('merged-desk-projected-support-pin')) return false;
  if (!id.startsWith('merged-desk-projected-support') && !extra.includes('merged-desk-projected-support')) {
    return false;
  }
  const kind = String(item.kind || '');
  return (
    kind === 'zone' ||
    kind === 'demandZone' ||
    kind === 'supplyZone' ||
    kind === 'box' ||
    extra.includes('merged-desk-precapture-zone')
  );
}

/** HotZone 차트 면 — 알약(pill)이 아니라 형성봉→마지막봉 네모 zone */
export function isMergedDeskRocketRangeNamedFaceOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  if (!id.startsWith('merged-desk-rocket-range-') && !extra.includes('merged-desk-rocket-range-zone')) {
    return false;
  }
  const kind = String(item.kind || '');
  return kind === 'zone' || kind === 'demandZone' || kind === 'supplyZone' || kind === 'box';
}

export function isMergedDeskAdvVolSeatNamedFaceOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  if (!id.startsWith('merged-desk-advvol-seat-') && !extra.includes('merged-desk-advvol-seat')) {
    return false;
  }
  const kind = String(item.kind || '');
  return kind === 'zone' || kind === 'demandZone' || kind === 'supplyZone' || kind === 'label';
}

export function isMergedDeskHotZoneNamedFaceOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  if (!id.startsWith('merged-desk-hotzone-') && !extra.includes('merged-desk-hotzone-zone')) return false;
  if (id.includes('-rail-') || extra.includes('merged-desk-hotzone-rail')) return false;
  const kind = String(item.kind || '');
  return (
    kind === 'zone' ||
    kind === 'demandZone' ||
    kind === 'supplyZone' ||
    kind === 'box' ||
    extra.includes('merged-desk-hotzone-zone')
  );
}

export function isMergedDeskChartExtendOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'> | null | undefined
): boolean {
  if (isMergedDeskDownsideSupportOverlay(item)) return true;
  return (
    isMergedDeskReferenceZoneOverlay(item) ||
    isMergedDeskStructureScenarioOverlay(item) ||
    isMergedDeskMirageTvZoneOverlay(item)
  );
}

export function isMergedDeskReferenceZoneMarker(m: AtlasPulseMarker): boolean {
  const id = String(m.id || '');
  const text = String(m.text || '');
  if (text === '롱확정' || text === '숏확정' || text === '롱+' || text === '숏+') return true;
  if (id.startsWith('merged-ares-key-') && (id.includes('-mark-') || id.includes('-touch-'))) return true;
  if (id.includes('merged-ares-confirm-') && id.endsWith('-mark')) return true;
  return false;
}

export function filterMergedDeskReferenceZoneMarkers(markers: AtlasPulseMarker[]): AtlasPulseMarker[] {
  return markers.filter(isMergedDeskReferenceZoneMarker);
}

export function isMergedDeskStructureScenarioMarker(m: AtlasPulseMarker): boolean {
  const id = String(m.id || '');
  if (id.startsWith('merged-smc-bos-') || id.startsWith('merged-smc-choch-')) return true;
  if (id.startsWith('merged-sweep-')) return true;
  return false;
}

/** 선반영 L/S · ⚡/🛒 · MTF 스택 — 캔들 진입 신호 */
export function isMergedDeskLeadingCandleMarker(m: AtlasPulseMarker): boolean {
  const id = String(m.id || '');
  const tx = String(m.text || '');
  if (id.startsWith('merged-leading-candle-')) return true;
  if (id.startsWith('merged-mtf-stack-')) return true;
  if (
    id.startsWith('merged-ares-long-') ||
    id.startsWith('merged-ares-short-') ||
    id.startsWith('merged-ares-live-')
  ) {
    return true;
  }
  if (id.startsWith('merged-zte-') && (tx === 'B' || tx === 'S' || tx === '🛒' || tx === '⚡')) return true;
  return false;
}

/** judgment HUD · swing draw · TOP/BOT opt-in overlay */
export function isMergedDeskHudOrSwingOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind' | 'category'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  if (id.startsWith('merged-ares-judgment-')) return true;
  if (extra.includes('merged-ares-judgment')) return true;
  if (extra.includes('merged-swing-regime') || extra.includes('merged-swing-channel')) return true;
  if (extra.includes('overlay-zone--merged-swing-fusion')) return true;
  if (id.startsWith('merged-swing-')) return true;
  if (isMergedDeskTopsBottomsOverlay(item)) return true;
  if (isMergedDeskMirageLspOverlay(item)) return true;
  return false;
}

export function isMergedDeskMirageLspMarker(m: AtlasPulseMarker): boolean {
  return String(m.id || '').startsWith('merged-mlsp-');
}

/** Mirage TV — 삼각 추세선·하락 채널: 선 끝 텍스트만(박스 핀 없음) */
export function isMergedDeskMirageLspLineHideHtmlLabel(
  item: Pick<OverlayItem, 'id' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  if (id.startsWith('merged-ares-mlsp-tv-')) return false;
  if (!id.startsWith('merged-ares-mlsp-')) return false;
  if (id.includes('-label-')) return false;
  return String(item.kind || '') === 'trendLine';
}

/** Mirage TV — SMC zone·채널 (분석 캔들→마지막 봉 우측, 전 TF) */
export function isMergedDeskMirageTvZoneOverlay(
  item: Pick<OverlayItem, 'id' | 'kind' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  if (!id.startsWith('merged-ares-mlsp-tv-')) return false;
  const kind = String(item.kind || '');
  return (
    kind === 'zone' ||
    kind === 'channelBand' ||
    kind === 'demandZone' ||
    kind === 'supplyZone' ||
    kind === 'ob' ||
    kind === 'fvg' ||
    kind === 'box' ||
    kind === 'reactionZone' ||
    kind === 'bprZone'
  );
}

/** Mirage TV — 삼각 추세선·하락 채널 (피벗 앵커, 줌 시 각도 유지) */
export function isMergedDeskMirageTvTrendOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  if (id.startsWith('merged-ares-mlsp-tv-sr-')) return true;
  if (id.startsWith('merged-ares-mlsp-tv-tri-')) return true;
  if (id === 'merged-ares-mlsp-tv-downtrend-band') return true;
  if (extra.includes('merged-ares-mlsp-tv-downtrend-channel')) return true;
  if (extra.includes('merged-ares-mlsp-tv-tri-res') || extra.includes('merged-ares-mlsp-tv-tri-sup')) return true;
  return false;
}

/** Mirage LSP — 스윕 · BSL/SSL · SL/TP · 신호 라벨 */
export function isMergedDeskMirageLspOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'category' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  if (id.startsWith('merged-ares-mlsp-')) return true;
  if (extra.includes('merged-ares-mlsp-')) return true;
  if (item.category === 'mirageLSP') return true;
  return false;
}

export function isMergedDeskSwingDrawMarker(m: AtlasPulseMarker): boolean {
  const id = String(m.id || '');
  return id.startsWith('merged-swing-flip-') || id.startsWith('merged-ribbon-swing-m-');
}

export function isMergedDeskStCloudMarker(m: AtlasPulseMarker): boolean {
  const id = String(m.id || '');
  const tx = String(m.text || '');
  if (id.startsWith('merged-st-cloud-')) return true;
  if (tx === '▲ST' || tx === '▼ST' || tx.includes('☁')) return id.startsWith('merged-');
  return false;
}

export function isMergedDeskTopsBottomsMarker(m: AtlasPulseMarker): boolean {
  return String(m.id || '').startsWith('merged-tb-mark-');
}

/** TV구조 롱숏 L/S 핀 */
export function isMergedDeskTvStructureLsMarker(m: AtlasPulseMarker): boolean {
  return String(m.id || '').startsWith('merged-desk-tv-ls-');
}

/** TOP/BOT 라벨 · 지그재그 · 레벨선 */
export function isMergedDeskTopsBottomsOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass' | 'category' | 'kind'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = mergedAnalysisDeskOverlayExtraClass(item);
  if (id.startsWith('merged-ares-tb-')) return true;
  if (extra.includes('merged-ares-tb-')) return true;
  if (item.category === 'topsBottoms') return true;
  return false;
}

export function filterMergedDeskChartMarkers(markers: AtlasPulseMarker[]): AtlasPulseMarker[] {
  return markers.filter(
    (m) =>
      isMergedDeskReferenceZoneMarker(m) ||
      isMergedDeskStructureScenarioMarker(m) ||
      isMergedDeskLeadingCandleMarker(m) ||
      isMergedDeskSwingDrawMarker(m) ||
      isMergedDeskStCloudMarker(m) ||
      isMergedDeskTopsBottomsMarker(m) ||
      isMergedDeskMirageLspMarker(m) ||
      isMergedDeskTvStructureLsMarker(m) ||
      isMergedDeskCandleBattleMarker(m)
  );
}
