/**
 * PHASE 8 — Zone reaction. Touch ≠ success. Prefix-causal, no fake %.
 */
import { atrAt, type Eagle1Bar } from './structureEngine';

export type ZoneReactionKind =
  | 'NONE'
  | 'APPROACH'
  | 'TOUCH'
  | 'HOLD'
  | 'REJECT'
  | 'RETEST'
  | 'RECLAIM'
  | 'LOST'
  | 'BREAK_ATTEMPT';

export const ZONE_REACTION_KO: Record<ZoneReactionKind, string> = {
  NONE: '데이터 없음',
  APPROACH: '접근',
  TOUCH: '접촉',
  HOLD: '지지유지',
  REJECT: '거절',
  RETEST: '재확인',
  RECLAIM: '재탈환',
  LOST: '상실',
  BREAK_ATTEMPT: '돌파시도',
};

export type ZoneReaction = {
  kind: ZoneReactionKind;
  kindKo: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  resolved: boolean;
  known_at: number;
  lower: number;
  upper: number;
  source: 'poc' | 'cluster' | 'none';
  evidence: string[];
};

const RESOLVED: ZoneReactionKind[] = ['HOLD', 'REJECT', 'RETEST', 'RECLAIM', 'LOST'];

export function zoneReactionKo(r: ZoneReaction | null | undefined): string {
  if (!r) return ZONE_REACTION_KO.NONE;
  return r.kindKo || ZONE_REACTION_KO[r.kind] || ZONE_REACTION_KO.NONE;
}

export function isZoneReactionResolved(kind: ZoneReactionKind): boolean {
  return RESOLVED.includes(kind);
}

function volumeNote(candles: Eagle1Bar[], n: number): string {
  const last = candles[n - 1];
  if (!last || last.volume == null || !(last.volume > 0)) return '거래량 데이터 없음';
  const from = Math.max(0, n - 13);
  const xs = candles.slice(from, n - 1).map((c) => Number(c.volume) || 0).filter((v) => v > 0);
  if (xs.length < 5) return '거래량 데이터 없음';
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!(avg > 0)) return '거래량 데이터 없음';
  if (last.volume > avg * 1.25) return '상대거래량 높음(추정)';
  if (last.volume < avg * 0.7) return '상대거래량 낮음(추정)';
  return '상대거래량 보통(추정)';
}

function priorSide(candles: Eagle1Bar[], n: number, lower: number, upper: number): 'above' | 'below' | 'inside' {
  let above = 0;
  let below = 0;
  const from = Math.max(0, n - 9);
  for (let i = from; i < n - 1; i++) {
    const c = candles[i]!.close;
    if (c > upper) above += 1;
    else if (c < lower) below += 1;
  }
  if (above > below) return 'above';
  if (below > above) return 'below';
  return 'inside';
}

export function pocStateToReactionKind(state: string | null | undefined): ZoneReactionKind {
  if (!state) return 'NONE';
  if (state === 'HOLD_SUCCESS' || state === 'CLOSED_ABOVE') return 'HOLD';
  if (state === 'RECLAIMED') return 'RECLAIM';
  if (state === 'LOST' || state === 'CLOSED_BELOW') return 'LOST';
  if (state === 'REJECTION') return 'REJECT';
  if (state === 'RETEST') return 'RETEST';
  if (state === 'BREAK_ATTEMPT') return 'BREAK_ATTEMPT';
  if (state === 'APPROACH') return 'APPROACH';
  return 'NONE';
}

export function classifyBandReaction(params: {
  candles: Eagle1Bar[];
  endExclusive?: number;
  lower: number;
  upper: number;
  bias: 'bullish' | 'bearish' | 'neutral';
}): { kind: ZoneReactionKind; evidence: string[] } {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const evidence: string[] = [];
  if (n < 2 || !(params.upper > params.lower)) return { kind: 'NONE', evidence };
  const last = params.candles[n - 1]!;
  const atr = atrAt(params.candles, n) || Math.abs(last.close) * 0.002;
  const { lower, upper, bias } = params;
  const touch = last.low <= upper && last.high >= lower;
  const closeAbove = last.close > upper;
  const closeBelow = last.close < lower;
  const closeInside = last.close >= lower && last.close <= upper;
  const near =
    Math.abs(last.close - lower) <= atr * 0.45 ||
    Math.abs(last.close - upper) <= atr * 0.45 ||
    closeInside;
  const candleMid = (last.high + last.low) / 2;
  const closeUpperHalf = last.close >= candleMid;
  const closeLowerHalf = last.close <= candleMid;
  const wickThroughLow = last.low < lower && closeInside;
  const wickThroughHigh = last.high > upper && closeInside;
  const side = priorSide(params.candles, n, lower, upper);
  evidence.push(volumeNote(params.candles, n));

  if (!touch) {
    if (near) {
      evidence.push('존 근처 — 종가 확인 전');
      return { kind: 'APPROACH', evidence };
    }
    return { kind: 'NONE', evidence };
  }

  if (bias !== 'bearish' && wickThroughLow && closeInside && side === 'above') {
    evidence.push('하단 관통 후 존 안 종가 — 돌파 미확정');
    return { kind: 'BREAK_ATTEMPT', evidence };
  }
  if (bias !== 'bullish' && wickThroughHigh && closeInside && side === 'below') {
    evidence.push('상단 관통 후 존 안 종가 — 돌파 미확정');
    return { kind: 'BREAK_ATTEMPT', evidence };
  }

  if (closeInside) {
    evidence.push('존 안 종가 — 재확인');
    return { kind: 'RETEST', evidence };
  }

  if (closeAbove && side === 'below') {
    evidence.push('아래서 존 종가 재탈환');
    return { kind: 'RECLAIM', evidence };
  }
  if (closeBelow && side === 'above') {
    evidence.push('위에서 존 종가 이탈');
    return { kind: 'LOST', evidence };
  }

  if (bias === 'bearish') {
    if (closeBelow && (side === 'below' || side === 'inside')) {
      if (closeLowerHalf) {
        evidence.push('공급구간 종가 거절 확인');
        return { kind: 'HOLD', evidence };
      }
      evidence.push('공급 접촉 — 종가 확인 부족');
      return { kind: 'TOUCH', evidence };
    }
    if (closeAbove) {
      evidence.push('공급구간 종가 돌파');
      return { kind: 'LOST', evidence };
    }
  } else {
    if (closeAbove && (side === 'above' || side === 'inside')) {
      if (closeUpperHalf) {
        evidence.push('수요구간 종가 지지 확인');
        return { kind: 'HOLD', evidence };
      }
      evidence.push('수요 접촉 — 종가 확인 부족(터치≠성공)');
      return { kind: 'TOUCH', evidence };
    }
    if (closeBelow) {
      evidence.push('수요구간 종가 이탈');
      return { kind: side === 'inside' ? 'REJECT' : 'LOST', evidence };
    }
  }

  evidence.push('윅 접촉 — 종가 미확인');
  return { kind: 'TOUCH', evidence };
}

export function computeZoneReaction(params: {
  candles: Eagle1Bar[];
  endExclusive?: number;
  recommended?: { lower: number; upper: number; bias: 'bullish' | 'bearish' | 'neutral' } | null;
  poc?: number | null;
  pocState?: string | null;
}): ZoneReaction {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const known_at = Math.max(0, n - 1);
  const rec = params.recommended;
  if (rec && rec.upper > rec.lower) {
    const { kind, evidence } = classifyBandReaction({
      candles: params.candles,
      endExclusive: n,
      lower: rec.lower,
      upper: rec.upper,
      bias: rec.bias,
    });
    return {
      kind,
      kindKo: ZONE_REACTION_KO[kind],
      bias: rec.bias,
      resolved: isZoneReactionResolved(kind),
      known_at,
      lower: rec.lower,
      upper: rec.upper,
      source: 'cluster',
      evidence,
    };
  }
  if (params.poc != null && params.poc > 0) {
    const pad = Math.abs(params.poc) * 0.0008;
    const kind = pocStateToReactionKind(params.pocState);
    const { kind: bandKind, evidence } =
      kind === 'NONE' || kind === 'APPROACH'
        ? classifyBandReaction({
            candles: params.candles,
            endExclusive: n,
            lower: params.poc - pad,
            upper: params.poc + pad,
            bias: 'neutral',
          })
        : { kind, evidence: ['최다거래가격 상태'] };
    const use = kind === 'NONE' || kind === 'APPROACH' ? bandKind : kind;
    return {
      kind: use,
      kindKo: ZONE_REACTION_KO[use],
      bias: 'neutral',
      resolved: isZoneReactionResolved(use),
      known_at,
      lower: params.poc - pad,
      upper: params.poc + pad,
      source: 'poc',
      evidence: evidence.length ? evidence : ['최다거래가격 상태'],
    };
  }
  return {
    kind: 'NONE',
    kindKo: ZONE_REACTION_KO.NONE,
    bias: 'neutral',
    resolved: false,
    known_at,
    lower: 0,
    upper: 0,
    source: 'none',
    evidence: [],
  };
}
