import type { Candle } from '@/types';
import type { LineData, UTCTimestamp } from 'lightweight-charts';
import type { ParkfTrendlineOpts } from '@/lib/parkfLinregTrendlineEngine';
import { computeParkfLinRegBandSnapshot } from '@/lib/parkfLinregTrendlineEngine';

/**
 * 마감·안착 밴드 색 융합용 — 각 봉에서 최근 구간만 잘라 ParkF LinReg 미드 대비 종가 편향.
 * 차트 LinReg 선과 동일 `computeParkfLinRegBandSnapshot` 수학.
 */
export function computeRollingLinRegBiasScoresForMonthDesk(
  candles: Candle[],
  parkfPartial?: Partial<ParkfTrendlineOpts>
): number[] {
  const n = candles.length;
  const out = new Array(n).fill(0);
  const lg = Math.max(12, Math.min(160, Math.round(Number(parkfPartial?.linregLength) || 100)));
  const win = Math.min(n, Math.max(lg + 8, Math.round(lg * 1.22)));
  /**
   * 분·저 TF에서 봉 수가 크면 매 봉 ParkF 스냅샷 비용이 TF 전환 시 프리즈를 만든다.
   * 구간 샘플 후 전방 채움 — 마지막 봉은 항상 정확히 계산(우측 밴드 색 일치).
   */
  /** 마감·안착 전용 호출만 사용 — 저 TF 고봉수 TF 전환 시 스냅샷 횟수 추가 절감 */
  const stride =
    n <= 180
      ? 1
      : n <= 320
        ? 2
        : n <= 520
          ? 3
          : n <= 900
            ? 4
            : n <= 1400
              ? 6
              : Math.min(12, Math.max(6, Math.floor(n / 220)));
  const ends: number[] = [];
  for (let end = win - 1; end < n; end += stride) {
    ends.push(end);
  }
  if (!ends.length) return out;
  if (ends[ends.length - 1] !== n - 1) ends.push(n - 1);

  const sample = new Map<number, number>();
  for (const end of ends) {
    const slice = candles.slice(end - win + 1, end + 1);
    const sliceLen = slice.length;
    const useLen = Math.max(8, Math.min(lg, sliceLen));
    const snap = computeParkfLinRegBandSnapshot(slice, { ...parkfPartial, linregLength: useLen });
    if (!snap) continue;
    const cl = candles[end].close;
    const denom = Math.max(snap.eps, snap.bandDev * 1.12);
    sample.set(end, Math.max(-1.45, Math.min(1.45, (cl - snap.mid) / denom)));
  }

  let carry = 0;
  for (let i = win - 1; i < n; i++) {
    const v = sample.get(i);
    if (v !== undefined) carry = v;
    out[i] = carry;
  }
  return out;
}

/**
 * CP 채널 중심가(null 구간) — 직전 유효값 전방 채움. 마감·안착 보조선(LineSeries)용.
 */
export function buildCpCenterForwardFillLineData(
  candles: Candle[],
  centerPrices: (number | null)[]
): LineData<UTCTimestamp>[] {
  const out: LineData<UTCTimestamp>[] = [];
  let last: number | null = null;
  const n = Math.min(candles.length, centerPrices.length);
  for (let i = 0; i < n; i++) {
    const v = centerPrices[i];
    if (v != null && Number.isFinite(v)) last = v;
    if (last != null) out.push({ time: candles[i].time as UTCTimestamp, value: last });
  }
  return out;
}
