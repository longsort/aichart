/**
 * 구조 + RSI + 지지/저항 + 종가 + FVG 확정 존 5요소 통합 확정 신호 (엄격 모드)
 * 5개 모두 충족 시 확정 (L/S 표시용)
 */

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
  /** MTF 정렬: 상위 TF가 반대 방향이면 확정 억제 (1m 롱인데 15m 숏 80%+ → 롱 미확정) */
  mtfAgainst?: { htf?: 'bullish' | 'bearish' | 'range'; ltf?: 'bullish' | 'bearish' | 'range'; trend1M?: 'bullish' | 'bearish' | 'range' };
  /** FVG 확정 존: 방향 일치하는 유효 FVG 근처여야 확정 */
  fvgBoundaries?: Array<{ low: number; high: number; bias: 'bullish' | 'bearish' }>;
};

export type ConfirmedSignalResult = {
  confirmed: boolean;
  direction: 'LONG' | 'SHORT' | null;
  structure: boolean;
  rsi: boolean;
  supportResistance: boolean;
  close: boolean;
  fvgZone: boolean;
  reasons: string[];
};

function nearLevel(price: number, level: number, pct: number): boolean {
  if (level <= 0) return false;
  const diff = Math.abs(price - level) / level;
  return diff <= pct;
}

/**
 * 5요소 확정(엄격): 구조 + RSI 85+ + 지지/저항 0.3% + 일·주 종가 모두 + FVG 확정 존
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
    };
  }

  const direction = verdict;
  let fvgZone = false;

  structure = true;
  reasons.push(`구조: ${direction} 방향`);

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

  // 종가: 일봉 + 주봉 모두 정배열 (엄격)
  const closeOkLong = dailyState === 'accepted_above' && weeklyState === 'accepted_above';
  const closeOkShort = dailyState === 'accepted_below' && weeklyState === 'accepted_below';

  if (direction === 'LONG' && closeOkLong) {
    close = true;
    reasons.push('종가: 일·주봉 모두 위 안착');
  } else if (direction === 'SHORT' && closeOkShort) {
    close = true;
    reasons.push('종가: 일·주봉 모두 아래 안착');
  } else {
    reasons.push(
      `종가: LONG→일·주 모두 위, SHORT→일·주 모두 아래 (일${dailyState ?? '-'} 주${weeklyState ?? '-'})`
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
  const fourPlusFvg = structure && rsi && supportResistance && close && fvgZone;
  if (mtf && fourPlusFvg) {
    const againstLong = direction === 'LONG' && (mtf.htf === 'bearish' || mtf.ltf === 'bearish' || mtf.trend1M === 'bearish');
    const againstShort = direction === 'SHORT' && (mtf.htf === 'bullish' || mtf.ltf === 'bullish' || mtf.trend1M === 'bullish');
    if (againstLong || againstShort) {
      mtfBlock = true;
      reasons.push(`MTF: 상위 TF 반대 (${mtf.htf ?? '-'}/${mtf.ltf ?? '-'}/1M ${mtf.trend1M ?? '-'})`);
    }
  }

  const confirmed = fourPlusFvg && !mtfBlock;

  return {
    confirmed,
    direction: confirmed ? direction : null,
    structure,
    rsi,
    supportResistance,
    close,
    fvgZone,
    reasons,
  };
}
