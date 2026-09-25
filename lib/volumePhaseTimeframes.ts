import { normalizeChartTimeframe, TIMEFRAME_ORDER } from '@/lib/constants';

/** 분·시·일·주·월·년 — 차트 TF 전부 */
export const VOLUME_PHASE_STATS_TIMEFRAMES = [...TIMEFRAME_ORDER] as const;

export type VolumePhaseStatsTimeframe = (typeof VOLUME_PHASE_STATS_TIMEFRAMES)[number];

/** 이벤트 후행 측정 봉 수 (TF별 의미 있는 구간) */
export function phaseHorizonsForTf(timeframe: string): number[] {
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, number[]> = {
    '1m': [12, 48],
    '3m': [10, 40],
    '5m': [8, 32],
    '15m': [8, 24],
    '1h': [6, 12],
    '4h': [6, 12],
    '1d': [4, 8],
    '1w': [3, 6],
    '1M': [2, 4],
    '1Y': [2, 3],
  };
  return map[tf] ?? [6, 12];
}

/** 배치·API 캔들 로드 일수 */
export function phaseLookbackDaysForTf(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, number> = {
    '1m': 45,
    '3m': 60,
    '5m': 90,
    '15m': 120,
    '1h': 180,
    '4h': 365,
    '1d': 365 * 3,
    '1w': 365 * 6,
    '1M': 365 * 12,
    '1Y': 365 * 15,
  };
  return map[tf] ?? 365;
}

/** 조건부 통계용 상위 TF */
export function parentHtfForPhaseStats(timeframe: string): string | null {
  const tf = normalizeChartTimeframe(timeframe);
  const map: Record<string, string | null> = {
    '1m': '15m',
    '3m': '15m',
    '5m': '1h',
    '15m': '4h',
    '1h': '4h',
    '4h': '1d',
    '1d': '1w',
    '1w': '1M',
    '1M': '1Y',
    '1Y': null,
  };
  return map[tf] ?? '1d';
}

export function isVolumePhaseStatsTimeframe(tf: string): boolean {
  const n = normalizeChartTimeframe(tf);
  return (VOLUME_PHASE_STATS_TIMEFRAMES as readonly string[]).includes(n);
}

export function volumePhaseStatsTfLabel(tf: string): string {
  const n = normalizeChartTimeframe(tf);
  const ko: Record<string, string> = {
    '1m': '1분',
    '3m': '3분',
    '5m': '5분',
    '15m': '15분',
    '1h': '1시간',
    '4h': '4시간',
    '1d': '일',
    '1w': '주',
    '1M': '월',
    '1Y': '년',
  };
  return ko[n] ?? n;
}
