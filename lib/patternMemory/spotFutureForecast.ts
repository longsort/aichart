/**
 * 패턴기억 유사구간 → 현물(종가) 기준 미래 상승/하락 % 참고치.
 * 확정 수익·승률 아님 · 표본 중앙값·조건부.
 */
import { horizonOutcomes } from '@/lib/patternMemory/outcomes';
import type { SimilarityHit, StoredCandle } from '@/lib/patternMemory/types';
import { fmtSpotPctSigned } from '@/lib/mergedDeskSpotReactionPct';

export type PatternMemorySpotFuture = {
  side: 'LONG' | 'SHORT' | 'WAIT';
  horizonBars: number;
  sampleCount: number;
  /** 유사구간 이후 고점 여지 % (중앙값, +) */
  upPct: number | null;
  /** 유사구간 이후 저점 여지 % (중앙값, 양수 = 하락폭) */
  downPct: number | null;
  /** 유사구간 horizon 종가 수익률 % (중앙값, 부호 유지) */
  closePct: number | null;
  chipKo: string;
  detailKo: string;
  labelKo: string;
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** 유사 hit 이후 horizon 봉의 현물 고/저/종 변동 % 중앙값 */
export function buildPatternMemorySpotFuture(params: {
  candles: StoredCandle[];
  hits: SimilarityHit[];
  asOfIndex: number;
  side: 'LONG' | 'SHORT' | 'WAIT';
  horizonBars?: number;
  maxHits?: number;
}): PatternMemorySpotFuture {
  const horizonBars = params.horizonBars ?? 10;
  const maxHits = params.maxHits ?? 40;
  const ups: number[] = [];
  const downs: number[] = [];
  const closes: number[] = [];

  for (const h of params.hits.slice(0, maxHits)) {
    const i = params.candles.findIndex((c) => c.openTime === h.openTime);
    if (i < 0) continue;
    /** 미래 누수 방지: hit 창이 asOf보다 충분히 앞이어야 함 */
    if (i + horizonBars >= params.asOfIndex) continue;
    const outs = horizonOutcomes(params.candles, i);
    const o = outs.find((x) => x.horizon === horizonBars) ?? outs[outs.length - 1];
    if (!o) continue;
    ups.push(o.maxHighReturn * 100);
    downs.push(Math.abs(o.maxLowReturn) * 100);
    closes.push(o.closeReturn * 100);
  }

  const upPct = median(ups);
  const downPct = median(downs);
  const closePct = median(closes);
  const n = Math.min(ups.length, downs.length, closes.length);
  const side = params.side;

  let labelKo = '패턴·관망';
  let chipKo = '패턴·관망';
  if (side === 'LONG' && upPct != null) {
    labelKo = `패턴·롱 ${fmtSpotPctSigned(upPct, 1)}`;
    chipKo = labelKo;
  } else if (side === 'SHORT' && downPct != null) {
    labelKo = `패턴·숏 ${fmtSpotPctSigned(-(downPct), 1)}`;
    chipKo = labelKo;
  } else if (upPct != null || downPct != null) {
    const u = upPct != null ? `↑${fmtSpotPctSigned(upPct, 1)}` : '';
    const d = downPct != null ? `↓${fmtSpotPctSigned(-(downPct), 1)}` : '';
    labelKo = `패턴 ${[u, d].filter(Boolean).join(' ')}`.trim();
    chipKo = labelKo;
  }

  const detailKo = [
    `유사n=${n}`,
    `${horizonBars}봉후`,
    upPct != null ? `상방중앙 ${fmtSpotPctSigned(upPct, 1)}` : '',
    downPct != null ? `하방중앙 ${fmtSpotPctSigned(-(downPct), 1)}` : '',
    closePct != null ? `종가중앙 ${fmtSpotPctSigned(closePct, 1)}` : '',
    '확정아님',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    side,
    horizonBars,
    sampleCount: n,
    upPct,
    downPct,
    closePct,
    chipKo,
    detailKo,
    labelKo,
  };
}
