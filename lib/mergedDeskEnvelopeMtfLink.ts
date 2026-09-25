/**
 * 통합·분석 — LTF·HTF 포락(기관밴드) 연동.
 * HTF SuperTrend 추세·밴드 위치를 차트 TF(LTF) 봉에 투영해 색 구간 융합에 씀.
 * 작도는 항상 **현재 차트 TF 캔들** 기준 (HTF 봉을 LTF에 직접 얹지 않음).
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { parentHtfForPhaseStats } from '@/lib/volumePhaseTimeframes';
import {
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
} from '@/lib/institutionalSuperBand';

/** 차트 TF별 SuperTrend 포락 파라미터 — LTF는 더 민감, HTF는 완만 */
export function institutionalEnvelopeParamsForTf(timeframe?: string | null): {
  period: number;
  mult: number;
} {
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const table: Record<string, { period: number; mult: number }> = {
    '1m': { period: 8, mult: 2.7 },
    '3m': { period: 9, mult: 2.8 },
    '5m': { period: 9, mult: 2.85 },
    '15m': { period: 10, mult: 3 },
    '30m': { period: 10, mult: 3 },
    '1h': { period: 10, mult: 3 },
    '2h': { period: 11, mult: 3.05 },
    '4h': { period: 12, mult: 3.1 },
    '6h': { period: 12, mult: 3.15 },
    '12h': { period: 13, mult: 3.2 },
    '1d': { period: 14, mult: 3.25 },
    '3d': { period: 14, mult: 3.3 },
    '1w': { period: 14, mult: 3.35 },
    '1M': { period: 12, mult: 3.4 },
  };
  return table[tf] ?? { period: INSTITUTIONAL_BAND_DEFAULT_PERIOD, mult: INSTITUTIONAL_BAND_DEFAULT_MULT };
}

/** 포락 연동용 상위 TF (차트 TF → 한 단계 위) */
export function resolveEnvelopeParentTf(chartTf: string): string | null {
  return parentHtfForPhaseStats(chartTf);
}

/**
 * HTF 포락 추세·밴드 내 위치를 LTF 봉 배열에 forward-fill 투영.
 * 반환 scores: LTF 길이, 대략 -3~+3 (롱+/숏−).
 */
export function buildHtfEnvelopeBiasScoresOnLtf(params: {
  ltfCandles: Candle[];
  htfCandles: Candle[];
  htfTf?: string | null;
}): number[] | null {
  const ltf = params.ltfCandles;
  const htf = params.htfCandles;
  const n = ltf.length;
  if (n < 4 || htf.length < 8) return null;

  const { period, mult } = institutionalEnvelopeParamsForTf(params.htfTf ?? null);
  const core = computeInstitutionalSuperTrendCore(htf, period, mult);
  if (!core) return null;

  const scores = new Array(n).fill(0);
  let h = 0;
  for (let i = 0; i < n; i++) {
    const t = Number(ltf[i]!.time);
    if (!Number.isFinite(t) || t <= 0) continue;
    while (h + 1 < htf.length && Number(htf[h + 1]!.time) <= t) h += 1;
    const ht = Number(htf[h]!.time);
    if (!(ht > 0) || ht > t) continue;

    const dir = core.trend[h] === 1 ? 1 : -1;
    let s = 1.55 * dir;
    const cl = Number(ltf[i]!.close);
    const fu = core.finalUpper[h]!;
    const fl = core.finalLower[h]!;
    const bw = fu - fl;
    if (Number.isFinite(cl) && Number.isFinite(fu) && Number.isFinite(fl) && bw > 1e-12) {
      const mid = (fu + fl) / 2;
      const pos = (cl - mid) / bw;
      /** HTF 밴드 안에서의 LTF 종가 위치 — 상위 포락과 정렬 */
      s += Math.max(-1, Math.min(1, pos)) * 1.15 * dir;
      if (dir > 0 && cl < fl) s -= 0.85;
      if (dir < 0 && cl > fu) s += 0.85;
    }
    scores[i] = Math.max(-3.2, Math.min(3.2, s));
  }
  return scores;
}
