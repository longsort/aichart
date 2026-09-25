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
}>;

const DEFAULT: ChartPerfBudget = {
  geometryPollMs: 56,
  geometryPollStride: 2,
  wsOverlayDebounceMs: 520,
  maxScreenOverlaysNonAiZone: 84,
  proximitySkipWhenOverlayCountGte: 46,
};

/** 동일 TF는 항상 동일 객체 참조 → React deps 안전 */
const BY_TF: Record<string, ChartPerfBudget> = {
  '1m': {
    geometryPollMs: 96,
    geometryPollStride: 4,
    wsOverlayDebounceMs: 780,
    maxScreenOverlaysNonAiZone: 62,
    proximitySkipWhenOverlayCountGte: 30,
  },
  '3m': {
    geometryPollMs: 84,
    geometryPollStride: 4,
    wsOverlayDebounceMs: 700,
    maxScreenOverlaysNonAiZone: 66,
    proximitySkipWhenOverlayCountGte: 32,
  },
  '5m': {
    geometryPollMs: 76,
    geometryPollStride: 3,
    wsOverlayDebounceMs: 640,
    maxScreenOverlaysNonAiZone: 68,
    proximitySkipWhenOverlayCountGte: 34,
  },
  '15m': {
    geometryPollMs: 72,
    geometryPollStride: 3,
    wsOverlayDebounceMs: 600,
    maxScreenOverlaysNonAiZone: 70,
    proximitySkipWhenOverlayCountGte: 34,
  },
  '1h': {
    geometryPollMs: 68,
    geometryPollStride: 3,
    wsOverlayDebounceMs: 560,
    maxScreenOverlaysNonAiZone: 66,
    proximitySkipWhenOverlayCountGte: 34,
  },
  '4h': {
    geometryPollMs: 60,
    geometryPollStride: 3,
    wsOverlayDebounceMs: 520,
    maxScreenOverlaysNonAiZone: 80,
    proximitySkipWhenOverlayCountGte: 40,
  },
  /** 일봉 이상: 봉 수는 적어도 오버레이·HTML 동기화 비용이 크므로 폴링·근접 스캔을 보수적으로 */
  '1d': {
    geometryPollMs: 88,
    geometryPollStride: 3,
    wsOverlayDebounceMs: 640,
    maxScreenOverlaysNonAiZone: 86,
    proximitySkipWhenOverlayCountGte: 32,
  },
  '1w': {
    geometryPollMs: 110,
    geometryPollStride: 4,
    wsOverlayDebounceMs: 720,
    maxScreenOverlaysNonAiZone: 86,
    proximitySkipWhenOverlayCountGte: 28,
  },
  '1M': {
    geometryPollMs: 120,
    geometryPollStride: 4,
    wsOverlayDebounceMs: 820,
    maxScreenOverlaysNonAiZone: 86,
    proximitySkipWhenOverlayCountGte: 24,
  },
  '1Y': {
    geometryPollMs: 120,
    geometryPollStride: 4,
    wsOverlayDebounceMs: 900,
    maxScreenOverlaysNonAiZone: 86,
    proximitySkipWhenOverlayCountGte: 24,
  },
};

export function chartPerfBudget(timeframe: string | undefined): ChartPerfBudget {
  const tf = normalizeChartTimeframe(String(timeframe ?? ''));
  return BY_TF[tf] ?? DEFAULT;
}
