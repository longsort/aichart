import type { Candle } from '@/types';
import { wadBuyVolume, wadSellVolume } from '@/lib/volumeHistogramIntelligence';
import type { VolumeRangePhaseKind } from '@/lib/volumeRangeAccumDist';

export type VolTrendInRange = 'shrink' | 'grow' | 'flat';
export type CandleVolScenarioId =
  | 'RANGE_BULL_TRAP_DIST'
  | 'RANGE_DIST_VOL_UP_BREAK'
  | 'RANGE_DIST_VOL_DOWN_BREAK'
  | 'RANGE_DIST_DRY_THEN_DROP'
  | 'RANGE_ACC_VOL_UP_BREAK'
  | 'RANGE_ACC_DRY_THEN_RISE'
  | 'BEAR_TREND_VOL_UP'
  | 'BEAR_TREND_VOL_DOWN'
  | 'BULL_TREND_VOL_UP'
  | 'BULL_TREND_VOL_DOWN'
  | 'MIXED_RANGE';

/** 양봉 많은데 가격은 못 오르는 분산(Upthrust/매도 누적) */
export type GreenTrapMetrics = {
  bullPct: number;
  netPct: number;
  downVolPct: number;
  upthrustPct: number;
  weakGreenPct: number;
  lowerHigh: boolean;
  score: number;
  isTrap: boolean;
};

export type CandleVolumeJoint = {
  fromIdx: number;
  toIdx: number;
  bars: number;
  bearPct: number;
  bullPct: number;
  downVolPct: number;
  upVolPct: number;
  volTrend: VolTrendInRange;
  volTrendRatio: number;
  avgBodyPct: number;
  closePosAvg: number;
  lastBarBear: boolean;
  lastBarVolVsAvg: number;
  scenarioId: CandleVolScenarioId;
  scenarioKo: string;
  theoryKo: string;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

function bodyPct(c: Candle): number {
  const r = Math.max(1e-9, c.high - c.low);
  return Math.abs(c.close - c.open) / r;
}

function closePos(c: Candle): number {
  const r = Math.max(1e-9, c.high - c.low);
  return clamp((c.close - c.low) / r, 0, 1);
}

function upperWickPct(c: Candle): number {
  const r = Math.max(1e-9, c.high - c.low);
  const top = Math.max(c.open, c.close);
  return (c.high - top) / r;
}

/**
 * 횡보 구간: 양봉 위장 + 가격 정체 + 매도/윗꼬리 (하락 전 핵심 패턴)
 */
export function scoreGreenTrapSegment(seg: Candle[]): GreenTrapMetrics {
  if (seg.length < 5) {
    return {
      bullPct: 0,
      netPct: 0,
      downVolPct: 0.5,
      upthrustPct: 0,
      weakGreenPct: 0,
      lowerHigh: false,
      score: 0,
      isTrap: false,
    };
  }
  let bull = 0;
  let upthrust = 0;
  let weakGreen = 0;
  let upVol = 0;
  let downVol = 0;
  const highs: number[] = [];

  for (const c of seg) {
    highs.push(c.high);
    const isBull = c.close >= c.open;
    if (isBull) {
      bull++;
      if (closePos(c) < 0.48) weakGreen++;
      if (upperWickPct(c) >= 0.38) upthrust++;
    }
    upVol += wadBuyVolume(c);
    downVol += wadSellVolume(c);
  }
  const n = seg.length;
  const bullPct = bull / n;
  const open0 = seg[0].open ?? seg[0].close;
  const close1 = seg[n - 1].close;
  const netPct = open0 > 0 ? ((close1 / open0) - 1) * 100 : 0;
  const total = upVol + downVol;
  const downVolPct = total > 0 ? downVol / total : 0.5;
  const upthrustPct = bull > 0 ? upthrust / bull : 0;
  const weakGreenPct = bull > 0 ? weakGreen / bull : 0;

  const t1 = Math.max(1, Math.floor(n / 3));
  const hi1 = Math.max(...highs.slice(0, t1));
  const hi2 = Math.max(...highs.slice(-t1));
  const lowerHigh = hi2 < hi1 * 0.998;

  let score = 0;
  if (bullPct >= 0.38) score += 1;
  if (netPct <= 0.65) score += netPct <= 0 ? 1.2 : 0.8;
  if (downVolPct >= 0.5) score += 0.9;
  if (upthrustPct >= 0.22) score += 0.8;
  if (weakGreenPct >= 0.28) score += 0.7;
  if (lowerHigh) score += 0.9;

  const isTrap =
    bullPct >= 0.38 &&
    netPct <= 0.85 &&
    score >= 2.4 &&
    (downVolPct >= 0.5 || upthrustPct >= 0.2 || weakGreenPct >= 0.25 || lowerHigh);

  return {
    bullPct,
    netPct,
    downVolPct,
    upthrustPct,
    weakGreenPct,
    lowerHigh,
    score,
    isTrap,
  };
}

/**
 * 횡보·추세 구간의 캔들+거래량 결합 프로파일 (매집/분산·거래량 증감 이론)
 */
export function analyzeCandleVolumeJoint(
  candles: Candle[],
  fromIdx: number,
  toIdx: number,
  phaseHint: VolumeRangePhaseKind | 'shock' | 'none' = 'none'
): CandleVolumeJoint | null {
  if (toIdx < fromIdx || toIdx >= candles.length) return null;
  const seg = candles.slice(fromIdx, toIdx + 1);
  if (seg.length < 4) return null;

  let bull = 0;
  let bear = 0;
  let upVol = 0;
  let downVol = 0;
  const bodies: number[] = [];
  const closes: number[] = [];
  const vols: number[] = [];

  for (const c of seg) {
    const isBear = c.close < c.open;
    if (isBear) bear++;
    else bull++;
    const bv = wadBuyVolume(c);
    const sv = wadSellVolume(c);
    upVol += bv;
    downVol += sv;
    bodies.push(bodyPct(c));
    closes.push(closePos(c));
    vols.push(Math.max(0, c.volume || 0));
  }

  const n = seg.length;
  const bearPct = bear / n;
  const bullPct = bull / n;
  const totalFlow = upVol + downVol;
  const downVolPct = totalFlow > 0 ? downVol / totalFlow : 0.5;
  const upVolPct = 1 - downVolPct;

  const mid = Math.floor(n / 2);
  const volFirst = avg(vols.slice(0, mid));
  const volSecond = avg(vols.slice(mid));
  const volTrendRatio = volFirst > 0 ? volSecond / volFirst : 1;
  let volTrend: VolTrendInRange = 'flat';
  if (volTrendRatio >= 1.18) volTrend = 'grow';
  else if (volTrendRatio <= 0.82) volTrend = 'shrink';

  const last = seg[n - 1];
  const lastBarBear = last.close < last.open;
  const avgVol = avg(vols);
  const lastBarVolVsAvg = avgVol > 0 ? last.volume / avgVol : 1;

  const trap = scoreGreenTrapSegment(seg);
  const open0 = seg[0].open ?? seg[0].close;
  const close1 = seg[seg.length - 1].close;
  const netPct = open0 > 0 ? ((close1 / open0) - 1) * 100 : 0;

  const phase: VolumeRangePhaseKind =
    phaseHint !== 'none' && phaseHint !== 'shock'
      ? phaseHint
      : trap.isTrap
        ? 'distribution'
        : bearPct >= 0.55 && downVolPct >= 0.54
          ? 'distribution'
          : bullPct >= 0.55 && upVolPct >= 0.54
            ? 'accumulation'
            : 'neutral';

  const { scenarioId, scenarioKo, theoryKo } = classifyScenario({
    phase,
    bearPct,
    bullPct,
    downVolPct,
    volTrend,
    lastBarBear,
    lastBarVolVsAvg,
    avgBodyPct: avg(bodies),
    closePosAvg: avg(closes),
    trap,
    netPct,
  });

  return {
    fromIdx,
    toIdx,
    bars: n,
    bearPct,
    bullPct,
    downVolPct,
    upVolPct,
    volTrend,
    volTrendRatio,
    avgBodyPct: avg(bodies),
    closePosAvg: avg(closes),
    lastBarBear,
    lastBarVolVsAvg,
    scenarioId,
    scenarioKo,
    theoryKo,
  };
}

function classifyScenario(p: {
  phase: VolumeRangePhaseKind;
  bearPct: number;
  bullPct: number;
  downVolPct: number;
  volTrend: VolTrendInRange;
  lastBarBear: boolean;
  lastBarVolVsAvg: number;
  avgBodyPct: number;
  closePosAvg: number;
  trap: GreenTrapMetrics;
  netPct: number;
}): { scenarioId: CandleVolScenarioId; scenarioKo: string; theoryKo: string } {
  const volKo =
    p.volTrend === 'grow' ? '거래량↑' : p.volTrend === 'shrink' ? '거래량↓' : '거래량→';
  const candleKo = `음${Math.round(p.bearPct * 100)}%·매도${Math.round(p.downVolPct * 100)}%`;

  if (p.phase === 'distribution' && p.trap.isTrap) {
    const yang = Math.round(p.trap.bullPct * 100);
    const sell = Math.round(p.trap.downVolPct * 100);
    const why =
      p.trap.lowerHigh ? '고점↓' : p.trap.upthrustPct >= 0.22 ? '윗꼬리' : '매도누적';
    return {
      scenarioId: 'RANGE_BULL_TRAP_DIST',
      scenarioKo: `양봉위장·횡보·분산(양${yang}%·매도${sell}%)`,
      theoryKo: `양봉인데 가격 ${p.netPct >= 0 ? '+' : ''}${p.netPct.toFixed(1)}% 정체 — ${why} 후 하락 가능(참고·검증)`,
    };
  }

  if (p.phase === 'distribution') {
    if (p.volTrend === 'grow' && p.lastBarBear && p.lastBarVolVsAvg >= 1.1) {
      return {
        scenarioId: 'RANGE_DIST_VOL_UP_BREAK',
        scenarioKo: `횡보후하락·${volKo}·음봉이탈`,
        theoryKo: '분산: 횡보 중 매도거래량·음봉 증가 후 하방 이탈(참고)',
      };
    }
    if (p.volTrend === 'shrink' && p.lastBarBear) {
      return {
        scenarioId: 'RANGE_DIST_DRY_THEN_DROP',
        scenarioKo: `횡보후하락·${volKo}·저유동이탈`,
        theoryKo: '분산: 거래량 축소 뒤 음봉 이탈 — 봄/sping 실패형(참고)',
      };
    }
    return {
      scenarioId: 'RANGE_DIST_VOL_DOWN_BREAK',
      scenarioKo: `횡보·매도우세·${candleKo}`,
      theoryKo: '분산 구간: 가격 횡보 + 매도 캔들·거래량 우세(참고)',
    };
  }

  if (p.phase === 'accumulation') {
    if (p.volTrend === 'shrink' && !p.lastBarBear) {
      return {
        scenarioId: 'RANGE_ACC_DRY_THEN_RISE',
        scenarioKo: `횡보후상승·${volKo}·양봉`,
        theoryKo: '매집: 거래량 축소(흡수) 뒤 양봉 돌파 — 스프링/복귀형(참고)',
      };
    }
    if (p.volTrend === 'grow' && !p.lastBarBear) {
      return {
        scenarioId: 'RANGE_ACC_VOL_UP_BREAK',
        scenarioKo: `횡보후상승·${volKo}·양봉이탈`,
        theoryKo: '매집: 횡보 중 매수거래량 증가 후 상방 이탈(참고)',
      };
    }
    return {
      scenarioId: 'RANGE_ACC_VOL_UP_BREAK',
      scenarioKo: `횡보·매수우세·${candleKo}`,
      theoryKo: '매집 구간: 횡보 + 양봉·매수 거래량 우세(참고)',
    };
  }

  if (p.bearPct >= 0.6 && p.volTrend === 'grow') {
    return {
      scenarioId: 'BEAR_TREND_VOL_UP',
      scenarioKo: `하락추세·${volKo}·음봉`,
      theoryKo: '하락 중 거래량 증가 — 추세 지속 또는 투매 후 반등 가능(검증 필요)',
    };
  }
  if (p.bearPct >= 0.6 && p.volTrend === 'shrink') {
    return {
      scenarioId: 'BEAR_TREND_VOL_DOWN',
      scenarioKo: `하락추세·${volKo}`,
      theoryKo: '하락 중 거래량 감소 — 매도 압력 완화·반등 준비 가능(검증 필요)',
    };
  }
  if (p.bullPct >= 0.6 && p.volTrend === 'grow') {
    return {
      scenarioId: 'BULL_TREND_VOL_UP',
      scenarioKo: `상승추세·${volKo}·양봉`,
      theoryKo: '상승 중 거래량 증가 — 추세 확인(참고)',
    };
  }
  if (p.bullPct >= 0.6 && p.volTrend === 'shrink') {
    return {
      scenarioId: 'BULL_TREND_VOL_DOWN',
      scenarioKo: `상승추세·${volKo}`,
      theoryKo: '상승 중 거래량 감소 — 상승 피로·조정 가능(검증 필요)',
    };
  }

  return {
    scenarioId: 'MIXED_RANGE',
    scenarioKo: `혼조·${candleKo}`,
    theoryKo: '캔들·거래량 방향 불명확 — 추가 봉 확인(참고)',
  };
}

/** 통계 키·라벨용 짧은 토큰 */
export function candleVolKeyTokens(j: CandleVolumeJoint): string {
  const vt = j.volTrend === 'grow' ? 'vUp' : j.volTrend === 'shrink' ? 'vDn' : 'vFlat';
  const cb = j.bearPct >= 0.55 ? 'bear' : j.bullPct >= 0.55 ? 'bull' : 'mix';
  return `${j.scenarioId}|${vt}|${cb}`;
}

export function formatCandleVolShort(j: CandleVolumeJoint): string {
  return j.scenarioKo;
}
