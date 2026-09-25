/**
 * §18 BREAKOUT 전략 — Sweep 반전만이 전부는 아님.
 * Compression→BOS→Acceptance→Retest 후보.
 */
import { evalBreakoutQuality } from '@/lib/assets/breakoutQualityEngine';
import type { StructureSnapshot } from '@/lib/eagle1/structureEngine';
import type { Candle } from '@/types';

export type TapBreakoutSnap = {
  active: boolean;
  direction: 'LONG' | 'SHORT' | null;
  score: number;
  phaseKo: string;
  noteKo: string;
  /** 추세장 돌파 경로 — 역추세 스윕 강제 금지용 */
  allowsBreakoutPath: boolean;
};

export function buildTapBreakoutSnap(params: {
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  structure?: StructureSnapshot | null;
  regime?: string | null;
  extremeKind?: string | null;
}): TapBreakoutSnap {
  const empty: TapBreakoutSnap = {
    active: false,
    direction: null,
    score: 0,
    phaseKo: '없음',
    noteKo: '돌파전략 비활성',
    allowsBreakoutPath: false,
  };

  const bars = params.candles || [];
  if (bars.length < 40) return empty;

  const st = params.structure;
  const resist = st?.lastSwingHigh?.price ?? st?.rangeHigh ?? null;
  const supp = st?.lastSwingLow?.price ?? st?.rangeLow ?? null;
  const close = Number(bars[bars.length - 1]?.close) || 0;

  const asCandle = bars as Candle[];
  const qUp =
    resist != null && resist > 0
      ? evalBreakoutQuality(asCandle, { breakLevel: resist, r1: resist })
      : null;
  const qDn =
    supp != null && supp > 0
      ? evalBreakoutQuality(asCandle, { breakLevel: supp, s1: supp })
      : null;

  let direction: 'LONG' | 'SHORT' | null = null;
  let score = 0;
  let phaseKo = '대기';

  const bos = st?.events?.length
    ? [...st.events].reverse().find((e) => e.kind === 'BOS' || e.kind === 'CHOCH')
    : null;

  const regime = String(params.regime || '');
  const trendUp = regime.includes('BULL') || regime === 'STRONG_BULL';
  const trendDn = regime.includes('BEAR') || regime === 'STRONG_BEAR';
  const compress =
    regime === 'ACCUMULATION' ||
    regime === 'RANGE' ||
    st?.state === 'IDLE';

  if (params.extremeKind?.includes('BREAKOUT_CONTINUATION')) {
    direction = 'LONG';
    score = 78;
    phaseKo = '이벤트돌파연속';
  } else if (params.extremeKind?.includes('BREAKDOWN_CONTINUATION')) {
    direction = 'SHORT';
    score = 78;
    phaseKo = '이벤트붕괴연속';
  } else if (qUp && qUp.labelKo === '돌파좋음' && (trendUp || compress || bos?.bias === 'bullish')) {
    direction = 'LONG';
    score = Math.max(qUp.score, bos ? 70 : 58);
    phaseKo = bos ? `BOS+돌파` : '상단돌파수용';
  } else if (qDn && qDn.labelKo === '돌파좋음' && (trendDn || compress || bos?.bias === 'bearish')) {
    direction = 'SHORT';
    score = Math.max(qDn.score, bos ? 70 : 58);
    phaseKo = bos ? `BOS+붕괴` : '하단돌파수용';
  } else if (qUp && qUp.labelKo === '애매') {
    score = 40;
    phaseKo = '돌파애매';
  }

  /** 리테스트 힌트 */
  if (
    direction &&
    (st?.state === 'RETEST' || st?.state === 'CONFIRMED') &&
    close > 0
  ) {
    score = Math.min(100, score + 12);
    phaseKo += '+리테스트';
  }

  const active = score >= 58 && direction != null;
  const allowsBreakoutPath =
    active &&
    (trendUp || trendDn || score >= 72) &&
    !String(params.extremeKind || '').includes('REVERSAL');

  return {
    active,
    direction,
    score,
    phaseKo,
    noteKo: active
      ? `돌파전략 ${direction} · ${phaseKo} · ${score}`
      : `돌파대기 · ${phaseKo}`,
    allowsBreakoutPath,
  };
}
