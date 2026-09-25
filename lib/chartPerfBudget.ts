/**
 * 차트 인터랙션 성능 예산 (단일 출처)
 *
 * 병목 요약 (ChartView 기준):
 * - `screenOverlays` useMemo: `anchored` 전개 + time→픽셀 + HTML 행 수 · overlayTick·캔들 갱신마다 재실행
 * - `collectLineZoneProximitySparkle` / `collectOverlayIdsNearLastCandle`: 오버레이·캔들 전수 근접 → 비용 큼
 * - `syncHtmlOverlaysFromChartGeometry` setInterval: 가격·논리 범위 변화 시 매 프레임에 가까이 RAF로 `setOverlayTick`
 * - 비 AI_ZONE 모드는 과거에 HTML 오버레이 행 상한이 거의 없어 DOM·좌표 계산 폭증
 *
 * TF별로 폴링 간격·스트라이드·WS 디바운스·화면 오버레이 상한·근접 스캔 생략 임계만 조정한다.
 */
import { normalizeChartTimeframe } from '@/lib/constants';

export type ChartPerfBudget = Readonly<{
  geometryPollMs: number;
  /** 1이면 매 틱; 2면 2틱마다 1회만 시그니처 검사 */
  geometryPollStride: number;
  wsOverlayDebounceMs: number;
  maxScreenOverlaysNonAiZone: number;
  proximitySkipWhenOverlayCountGte: number;
  /** pan/pinch 종료 후 overlay·분석 재동기화 settle (ms) */
  interactionSettleMs: number;
  /** pan 중 HTML overlay는 CSS transform만 — React 재계산 금지 */
  deferOverlayWhileInteracting: boolean;
}>;

const DEFAULT: ChartPerfBudget = {
  geometryPollMs: 96,
  geometryPollStride: 3,
  wsOverlayDebounceMs: 680,
  maxScreenOverlaysNonAiZone: 72,
  proximitySkipWhenOverlayCountGte: 40,
  interactionSettleMs: 180,
  deferOverlayWhileInteracting: true,
};

/** 동일 TF는 항상 동일 객체 참조 → React deps 안전 */
const BY_TF: Record<string, ChartPerfBudget> = {
  '1m': {
    geometryPollMs: 140,
    geometryPollStride: 5,
    wsOverlayDebounceMs: 900,
    maxScreenOverlaysNonAiZone: 56,
    proximitySkipWhenOverlayCountGte: 28,
    interactionSettleMs: 160,
    deferOverlayWhileInteracting: true,
  },
  '3m': {
    geometryPollMs: 120,
    geometryPollStride: 5,
    wsOverlayDebounceMs: 820,
    maxScreenOverlaysNonAiZone: 58,
    proximitySkipWhenOverlayCountGte: 30,
    interactionSettleMs: 160,
    deferOverlayWhileInteracting: true,
  },
  '5m': {
    geometryPollMs: 110,
    geometryPollStride: 4,
    wsOverlayDebounceMs: 760,
    maxScreenOverlaysNonAiZone: 60,
    proximitySkipWhenOverlayCountGte: 32,
    interactionSettleMs: 170,
    deferOverlayWhileInteracting: true,
  },
  '15m': {
    geometryPollMs: 100,
    geometryPollStride: 4,
    wsOverlayDebounceMs: 720,
    maxScreenOverlaysNonAiZone: 62,
    proximitySkipWhenOverlayCountGte: 32,
    interactionSettleMs: 180,
    deferOverlayWhileInteracting: true,
  },
  '1h': {
    geometryPollMs: 96,
    geometryPollStride: 3,
    wsOverlayDebounceMs: 680,
    maxScreenOverlaysNonAiZone: 64,
    proximitySkipWhenOverlayCountGte: 34,
    interactionSettleMs: 180,
    deferOverlayWhileInteracting: true,
  },
  '4h': {
    geometryPollMs: 90,
    geometryPollStride: 3,
    wsOverlayDebounceMs: 640,
    maxScreenOverlaysNonAiZone: 72,
    proximitySkipWhenOverlayCountGte: 36,
    interactionSettleMs: 180,
    deferOverlayWhileInteracting: true,
  },
  /** 일봉 이상: 봉 수는 적어도 오버레이·HTML 동기화 비용이 크므로 폴링·근접 스캔을 보수적으로 */
  '1d': {
    geometryPollMs: 120,
    geometryPollStride: 4,
    wsOverlayDebounceMs: 780,
    maxScreenOverlaysNonAiZone: 78,
    proximitySkipWhenOverlayCountGte: 30,
    interactionSettleMs: 200,
    deferOverlayWhileInteracting: true,
  },
  '1w': {
    geometryPollMs: 140,
    geometryPollStride: 4,
    wsOverlayDebounceMs: 860,
    maxScreenOverlaysNonAiZone: 78,
    proximitySkipWhenOverlayCountGte: 28,
    interactionSettleMs: 220,
    deferOverlayWhileInteracting: true,
  },
  '1M': {
    geometryPollMs: 160,
    geometryPollStride: 5,
    wsOverlayDebounceMs: 960,
    maxScreenOverlaysNonAiZone: 78,
    proximitySkipWhenOverlayCountGte: 24,
    interactionSettleMs: 220,
    deferOverlayWhileInteracting: true,
  },
  '1Y': {
    geometryPollMs: 160,
    geometryPollStride: 5,
    wsOverlayDebounceMs: 1000,
    maxScreenOverlaysNonAiZone: 78,
    proximitySkipWhenOverlayCountGte: 24,
    interactionSettleMs: 220,
    deferOverlayWhileInteracting: true,
  },
};

export function chartPerfBudget(timeframe: string | undefined): ChartPerfBudget {
  const tf = normalizeChartTimeframe(String(timeframe ?? ''));
  return BY_TF[tf] ?? DEFAULT;
}

const MERGED_DESK_LTF = new Set(['1m', '3m', '5m', '15m']);

/** 통합모드 1m~15m — 봉 수·라이브 틱이 많아 pan/zoom 중 HTML 재계산을 더 길게 보류 */
export function isMergedDeskLowTimeframe(timeframe: string | undefined): boolean {
  return MERGED_DESK_LTF.has(normalizeChartTimeframe(String(timeframe ?? '')));
}

/**
 * 통합·분석 데스크 인터랙션 예산.
 * DOM 상한은 줄이지 않음(기능 숨김 금지). 폴링·settle만 늘려 줌/패닝 중 메인 스레드를 비운다.
 */
export function mergedDeskInteractionPerf(
  base: ChartPerfBudget,
  timeframe: string | undefined
): ChartPerfBudget {
  const ltf = isMergedDeskLowTimeframe(timeframe);
  return {
    ...base,
    geometryPollMs: ltf
      ? Math.max(980, base.geometryPollMs + 780)
      : Math.max(720, base.geometryPollMs + 520),
    geometryPollStride: ltf
      ? Math.max(7, base.geometryPollStride + 5)
      : Math.max(6, base.geometryPollStride + 4),
    maxScreenOverlaysNonAiZone: Math.max(96, base.maxScreenOverlaysNonAiZone),
    proximitySkipWhenOverlayCountGte: 40,
    wsOverlayDebounceMs: ltf
      ? Math.max(1300, base.wsOverlayDebounceMs + 960)
      : Math.max(1100, base.wsOverlayDebounceMs + 840),
    interactionSettleMs: ltf ? 420 : 280,
    deferOverlayWhileInteracting: true,
  };
}
