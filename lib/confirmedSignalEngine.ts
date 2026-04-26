/**
 * 구조 + RSI + 지지/저항 + 종가 + FVG 확정 존 5요소 통합 확정 신호 (엄격 모드)
 * 5개 모두 충족 시 확정 (L/S 표시용)
 */

import { latchedClosesAlignedWithVerdict, type LatchedCloseStatesBundle } from '@/lib/closeAlignment';

const NEAR_LEVEL_PCT = 0.003;  // 0.5% → 0.3% (지지/저항 거리)
const RSI_THRESHOLD = 85;      // 80 → 85

export type ConfirmedSignalInput = {
  verdict: 'LONG' | 'SHORT';
  currentPrice: number;
  supportLevel: { price: number } | null;
  resistanceLevel: { price: number } | null;
  rsiVerdict: 'LONG' | 'SHORT' | 'WATCH' | 'NONE';
  rsiScore: number;
  dailyState: string | null;
  weeklyState: string | null;
  /** 직전 확정봉 라칭 종가 — 있으면 차트 TF·일·주·월을 동시에 검사 (분·시·일·주·달 공통 규칙) */
  chartTimeframe?: string;
  latchedCloseStates?: LatchedCloseStatesBundle;
  /** MTF 정렬: 상위 TF가 반대 방향이면 확정 억제 (1m 롱인데 15m 숏 80%+ → 롱 미확정) */
  mtfAgainst?: { htf?: 'bullish' | 'bearish' | 'range'; ltf?: 'bullish' | 'bearish' | 'range'; trend1M?: 'bullish' | 'bearish' | 'range' };
  /** FVG 확정 존: 방향 일치하는 유효 FVG 근처여야 확정 */
  fvgBoundaries?: Array<{ low: number; high: number; bias: 'bullish' | 'bearish' }>;
  /** 구조 실질 점수용 메트릭 (없으면 기존 호환 로직 사용) */
  structureMetrics?: {
    trend?: 'bullish' | 'bearish' | 'range' | null;
    bosCount?: number;
    chochCount?: number;
    obCount?: number;
    fvgCount?: number;
  };
};

export type ReadinessTier = 'none' | 'building' | 'prepared' | 'strong' | 'full' | 'mtf_veto';

export type ConfirmedSignalResult = {
  confirmed: boolean;
  direction: 'LONG' | 'SHORT' | null;
  structure: boolean;
  rsi: boolean;
  supportResistance: boolean;
  close: boolean;
  fvgZone: boolean;
  reasons: string[];
  /** 0~5: 구조·RSI·S/R·종가·FVG */
  gatesPassCount: number;
  /** 확정(5/5) 단계: full=5/5+MTF통과, mtf_veto=5/5인데 MTF가 반대 */
  readinessTier: ReadinessTier;
  mtfBlocked: boolean;
};

function nearLevel(price: number, level: number, pct: number): boolean {
  if (level <= 0) return false;
  const diff = Math.abs(price - level) / level;
  return diff <= pct;
}

/**
 * 5요소 확정(엄격): 구조 + RSI 85+ + 지지/저항 0.3% + 종가(차트 TF·일·주·월 가용분) + FVG 확정 존
 */
export function computeConfirmedSignal(input: ConfirmedSignalInput): ConfirmedSignalResult {
  const {
    verdict,
    currentPrice,
    supportLevel,
    resistanceLevel,
    rsiVerdict,
    rsiScore,
    dailyState,
    weeklyState,
    chartTimeframe,
    latchedCloseStates,
  } = input;

  const reasons: string[] = [];
  let structure = false;
  let rsi = false;
  let supportResistance = false;
  let close = false;

  if (verdict !== 'LONG' && verdict !== 'SHORT') {
    return {
      confirmed: false,
      direction: null,
      structure: false,
      rsi: false,
      supportResistance: false,
      close: false,
      fvgZone: false,
      reasons: ['구조: LONG/SHORT 아님'],
      gatesPassCount: 0,
      readinessTier: 'none',
      mtfBlocked: false,
    };
  }

  const direction = verdict;
  let fvgZone = false;

  const sm = input.structureMetrics;
  if (sm) {
    const trendAligned =
      (direction === 'LONG' && sm.trend === 'bullish') ||
      (direction === 'SHORT' && sm.trend === 'bearish');
    const structureScore =
      (trendAligned ? 45 : 0) +
      Math.min(20, (sm.bosCount ?? 0) * 8) +
      Math.min(15, (sm.chochCount ?? 0) * 6) +
      Math.min(10, (sm.obCount ?? 0) * 3) +
      Math.min(10, (sm.fvgCount ?? 0) * 3);
    if (structureScore >= 55) {
      structure = true;
      reasons.push(`구조: 정합 ${structureScore}점`);
    } else {
      reasons.push(`구조: 정합 부족 ${structureScore}점 (기준 55)`);
    }
  } else {
    structure = true;
    reasons.push(`구조: ${direction} 방향`);
  }

  if (rsiVerdict === direction && rsiScore >= RSI_THRESHOLD) {
    rsi = true;
    reasons.push(`RSI: ${rsiScore}점 (≥${RSI_THRESHOLD})`);
  } else {
    reasons.push(`RSI: ${rsiVerdict} ${rsiScore}점 (목표 ${RSI_THRESHOLD})`);
  }

  if (direction === 'LONG') {
    if (supportLevel && nearLevel(currentPrice, supportLevel.price, NEAR_LEVEL_PCT)) {
      supportResistance = true;
      reasons.push(`지지: ${supportLevel.price.toLocaleString()} 근처`);
    } else if (supportLevel) {
      reasons.push(`지지: ${supportLevel.price.toLocaleString()}과 거리 있음`);
    } else {
      reasons.push('지지: 레벨 없음');
    }
  } else {
    if (resistanceLevel && nearLevel(currentPrice, resistanceLevel.price, NEAR_LEVEL_PCT)) {
      supportResistance = true;
      reasons.push(`저항: ${resistanceLevel.price.toLocaleString()} 근처`);
    } else if (resistanceLevel) {
      reasons.push(`저항: ${resistanceLevel.price.toLocaleString()}과 거리 있음`);
    } else {
      reasons.push('저항: 레벨 없음');
    }
  }

  let closeOkLong: boolean;
  let closeOkShort: boolean;
  if (latchedCloseStates && chartTimeframe) {
    closeOkLong = latchedClosesAlignedWithVerdict('LONG', chartTimeframe, latchedCloseStates);
    closeOkShort = latchedClosesAlignedWithVerdict('SHORT', chartTimeframe, latchedCloseStates);
  } else {
    closeOkLong = dailyState === 'accepted_above' && weeklyState === 'accepted_above';
    closeOkShort = dailyState === 'accepted_below' && weeklyState === 'accepted_below';
  }

  if (direction === 'LONG' && closeOkLong) {
    close = true;
    reasons.push(
      latchedCloseStates && chartTimeframe
        ? '종가: 차트·일·주·월(데이터 있는 구간) 방향 일치'
        : '종가: 일·주봉 모두 위 안착'
    );
  } else if (direction === 'SHORT' && closeOkShort) {
    close = true;
    reasons.push(
      latchedCloseStates && chartTimeframe
        ? '종가: 차트·일·주·월(데이터 있는 구간) 방향 일치'
        : '종가: 일·주봉 모두 아래 안착'
    );
  } else {
    reasons.push(
      latchedCloseStates && chartTimeframe
        ? `종가: LONG/SHORT와 차트·일·주·월 라칭 정배열 필요 (TF ${chartTimeframe})`
        : `종가: LONG→일·주 모두 위, SHORT→일·주 모두 아래 (일${dailyState ?? '-'} 주${weeklyState ?? '-'})`
    );
  }

  // FVG 확정 존: 방향 일치하는 유효 FVG 구간 내/근처
  const fvgs = input.fvgBoundaries ?? [];
  const matchBias = direction === 'LONG' ? 'bullish' : 'bearish';
  const dirFvgs = fvgs.filter(f => f.bias === matchBias);
  const inFvgZone = dirFvgs.some(f => {
    const pad = (f.high - f.low) * 0.15 || currentPrice * NEAR_LEVEL_PCT;
    return currentPrice >= f.low - pad && currentPrice <= f.high + pad;
  });
  if (dirFvgs.length === 0) {
    reasons.push(`FVG: ${matchBias === 'bullish' ? '상승' : '하락'} 확정 존 없음`);
  } else if (inFvgZone) {
    fvgZone = true;
    reasons.push(`FVG: ${matchBias === 'bullish' ? '상승' : '하락'} 확정 존 근처`);
  } else {
    reasons.push(`FVG: ${matchBias === 'bullish' ? '상승' : '하락'} 존과 거리 있음`);
  }

  let mtfBlock = false;
  const mtf = input.mtfAgainst;
  const allFiveGates = structure && rsi && supportResistance && close && fvgZone;
  if (mtf && allFiveGates) {
    const againstLong = direction === 'LONG' && (mtf.htf === 'bearish' || mtf.ltf === 'bearish' || mtf.trend1M === 'bearish');
    const againstShort = direction === 'SHORT' && (mtf.htf === 'bullish' || mtf.ltf === 'bullish' || mtf.trend1M === 'bullish');
    if (againstLong || againstShort) {
      mtfBlock = true;
      reasons.push(`MTF: 상위 TF 반대 (${mtf.htf ?? '-'}/${mtf.ltf ?? '-'}/1M ${mtf.trend1M ?? '-'})`);
    }
  }

  const confirmed = allFiveGates && !mtfBlock;

  const gatesPassCount = [structure, rsi, supportResistance, close, fvgZone].filter(Boolean).length;
  let readinessTier: ReadinessTier;
  if (gatesPassCount === 0) {
    readinessTier = 'none';
  } else if (gatesPassCount <= 2) {
    readinessTier = 'building';
  } else if (gatesPassCount === 3) {
    readinessTier = 'prepared';
  } else if (gatesPassCount === 4) {
    readinessTier = 'strong';
  } else {
    if (mtfBlock) {
      readinessTier = 'mtf_veto';
    } else {
      readinessTier = 'full';
    }
  }

  return {
    confirmed,
    direction: confirmed ? direction : null,
    structure,
    rsi,
    supportResistance,
    close,
    fvgZone,
    reasons,
    gatesPassCount,
    readinessTier,
    mtfBlocked: mtfBlock,
  };
}
