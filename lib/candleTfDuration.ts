/**
 * 거래소(바이낸스 등) REST 캔들과 동일한 UTC 기준 봉 길이(초).
 * - 월봉만 달력 길이(28~31일); 고정 30일이면 마감 판정·종가 보드 good/bad가 어긋남.
 */

const FIXED_TF_SEC: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 4 * 3600,
  '1d': 24 * 3600,
  '1w': 7 * 24 * 3600,
  '1Y': 365 * 24 * 3600,
};

/** 해당 월봉 open(UTC) 시각부터 다음달 1일 00:00 UTC까지 */
export function monthBarDurationSec(candleOpenTimeSec: number): number {
  const d = new Date(candleOpenTimeSec * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const nextOpen = Date.UTC(y, m + 1, 1, 0, 0, 0, 0) / 1000;
  const dur = nextOpen - candleOpenTimeSec;
  return dur > 0 ? dur : 28 * 86400;
}

/** 마지막 캔들이 ‘아직 진행 중’인지 판단할 때 사용할 봉 길이(초) */
export function candleBarDurationSec(tf: string, candleOpenTimeSec: number): number {
  if (tf === '1M') return monthBarDurationSec(candleOpenTimeSec);
  return FIXED_TF_SEC[tf] ?? 3600;
}
