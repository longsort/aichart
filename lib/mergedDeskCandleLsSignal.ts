/**
 * BNB/XRP 통합모드 캔들 롱숏 신호.
 * 이더 폭락존 터치와 분리 — 마감봉 다중 TF 합의 + 스윙 SL.
 * 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import { resolveAutoTradeTfHold } from '@/lib/doksuri1/autoTradeTfHoldScale';

/** BNB/XRP 스캔 TF — 덤프존(1m~1M)과 다름 */
export const CANDLE_LS_SCAN_TFS = ['5m', '15m', '1h'] as const;

export type CandleLsDirection = 'LONG' | 'SHORT';

export type CandleLsTfVote = {
  timeframe: string;
  direction: CandleLsDirection | null;
  score: number;
  noteKo: string;
  swingHigh: number;
  swingLow: number;
  closedBarTime: number;
  close: number;
};

export type CandleLsSignal = {
  symbol: string;
  /** 대표 TF (합의에 기여한 가장 높은 score TF) */
  timeframe: string;
  direction: CandleLsDirection;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  signalId: string;
  noteKo: string;
  maxBars: number;
  tp1RoePct: number;
  tp2RoePct: number;
  closedBarTime: number;
  agreeCount: number;
  votes: CandleLsTfVote[];
};

function emaLast(closes: number[], period: number): number | null {
  if (closes.length < period + 2) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i]! * k + ema * (1 - k);
  }
  return Number.isFinite(ema) ? ema : null;
}

/** 최근 스윙 고/저 (단순 피벗, 마감봉 제외 구간) */
function recentSwings(candles: Candle[], lookback = 24): { high: number; low: number } {
  const n = candles.length;
  const end = Math.max(2, n - 2);
  const start = Math.max(1, end - lookback);
  let high = -Infinity;
  let low = Infinity;
  for (let i = start; i < end; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    if (h > high) high = h;
    if (l < low && l > 0) low = l;
  }
  if (!(high > 0) || !(low > 0) || !(high > low)) {
    const c = Number(candles[n - 2]?.close) || 1;
    return { high: c * 1.01, low: c * 0.99 };
  }
  return { high, low };
}

/**
 * 단일 TF 마감봉 캔들 바이어스.
 * 강양/음봉 · 거부심지 · EMA20 · 스윙 위치 합산.
 */
export function voteCandleLsOnClosedBar(params: {
  timeframe: string;
  candles: Candle[];
}): CandleLsTfVote | null {
  const candles = params.candles;
  const n = candles.length;
  if (n < 30) return null;
  const tf = normalizeChartTimeframe(params.timeframe);
  const closed = candles[n - 2]!;
  const prev = candles[n - 3];
  const closePx = Number(closed.close);
  const openPx = Number(closed.open);
  const hi = Number(closed.high);
  const lo = Number(closed.low);
  const closedT = Number(closed.time) || 0;
  if (!(closePx > 0) || !(closedT > 0) || !(hi > lo)) return null;

  const range = hi - lo || closePx * 0.001;
  const body = Math.abs(closePx - openPx);
  const bodyRatio = body / range;
  const upperWick = hi - Math.max(openPx, closePx);
  const lowerWick = Math.min(openPx, closePx) - lo;
  const bullish = closePx > openPx;
  const bearish = closePx < openPx;

  const closes = candles.slice(0, n - 1).map((c) => Number(c.close));
  const ema20 = emaLast(closes, 20);
  const swings = recentSwings(candles);
  const mid = (swings.high + swings.low) / 2;

  let score = 0;
  const notes: string[] = [];

  if (bullish && bodyRatio >= 0.55) {
    score += 2;
    notes.push('강양봉');
  } else if (bearish && bodyRatio >= 0.55) {
    score -= 2;
    notes.push('강음봉');
  } else if (bullish && bodyRatio >= 0.35) {
    score += 1;
    notes.push('양봉');
  } else if (bearish && bodyRatio >= 0.35) {
    score -= 1;
    notes.push('음봉');
  }

  /** 하단 거부 → 롱 가점 · 상단 거부 → 숏 가점 */
  if (lowerWick / range >= 0.4 && bodyRatio >= 0.2 && closePx >= openPx) {
    score += 2;
    notes.push('하단거부');
  }
  if (upperWick / range >= 0.4 && bodyRatio >= 0.2 && closePx <= openPx) {
    score -= 2;
    notes.push('상단거부');
  }

  if (ema20 != null) {
    if (closePx > ema20 * 1.001) {
      score += 1;
      notes.push('EMA상');
    } else if (closePx < ema20 * 0.999) {
      score -= 1;
      notes.push('EMA하');
    }
  }

  if (closePx > mid) {
    score += 1;
    notes.push('스윙상단측');
  } else if (closePx < mid) {
    score -= 1;
    notes.push('스윙하단측');
  }

  /** 연속 마감 방향 */
  if (prev) {
    const prevClose = Number(prev.close);
    const prevOpen = Number(prev.open);
    if (closePx > prevClose && prevClose > prevOpen) {
      score += 1;
      notes.push('연속상승마감');
    } else if (closePx < prevClose && prevClose < prevOpen) {
      score -= 1;
      notes.push('연속하락마감');
    }
  }

  /** 약한 신호 버림 — |score| < 2 */
  let direction: CandleLsDirection | null = null;
  if (score >= 2) direction = 'LONG';
  else if (score <= -2) direction = 'SHORT';

  return {
    timeframe: tf,
    direction,
    score,
    noteKo: notes.slice(0, 4).join('+') || '중립',
    swingHigh: swings.high,
    swingLow: swings.low,
    closedBarTime: closedT,
    close: closePx,
  };
}

/**
 * 다중 TF 투표 → 합의 시 시그널.
 * deskBias는 가산만 (불일치해도 강한 합의면 통과) — 알트 진입 막지 않음.
 */
export function buildCandleLsSignal(params: {
  symbol: string;
  votes: CandleLsTfVote[];
  leverage?: number;
  minRr?: number;
  /** 통합 데스크 BTC 등 바이어스 — 일치 시 가산, 불일치는 차단하지 않음 */
  deskBias?: CandleLsDirection | null;
}): CandleLsSignal | null {
  const votes = params.votes.filter((v) => v && v.closedBarTime > 0);
  if (votes.length < 1) return null;

  let longN = 0;
  let shortN = 0;
  let longScore = 0;
  let shortScore = 0;
  for (const v of votes) {
    if (v.direction === 'LONG') {
      longN += 1;
      longScore += Math.abs(v.score);
    } else if (v.direction === 'SHORT') {
      shortN += 1;
      shortScore += Math.abs(v.score);
    }
  }

  let direction: CandleLsDirection | null = null;
  /** 2TF 합의 또는 1TF 강신호(|score|≥3) — 하루종일 무진입 완화 */
  if (longN >= 2 && longN > shortN) direction = 'LONG';
  else if (shortN >= 2 && shortN > longN) direction = 'SHORT';
  else if (longN === 1 && shortN === 0 && longScore >= 3) direction = 'LONG';
  else if (shortN === 1 && longN === 0 && shortScore >= 3) direction = 'SHORT';
  if (!direction) return null;

  /** deskBias 일치 시 통과 강화만 — 불일치로 버리지는 않음 */
  void params.deskBias;

  const agree = votes.filter((v) => v.direction === direction);
  if (!agree.length) return null;

  agree.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const best = agree[0]!;
  const entry = best.close;
  const atr = Math.max(
    Math.abs(best.swingHigh - best.swingLow) * 0.15,
    entry * 0.004
  );
  const lev = Math.max(1, Math.min(125, params.leverage ?? 10));
  const hold = resolveAutoTradeTfHold(best.timeframe);

  let sl: number;
  const tp1Roe = hold.tp1RoePct / 100;
  const tp2Roe = hold.tp2RoePct / 100;
  const tp1 = roeTargetPrice(entry, direction, lev, tp1Roe);
  const tp2 = roeTargetPrice(entry, direction, lev, tp2Roe);

  const reward = Math.abs(tp1 - entry);
  const minRr = Math.max(1, params.minRr ?? 1.2);
  if (!(reward > 0)) return null;
  /** 고레버·ROE TP 대비 스윙SL이 멀면 RR 탈락 → SL을 RR에 맞게 조임 */
  const maxRisk = reward / minRr;
  if (direction === 'LONG') {
    const floor = Math.min(best.swingLow - atr * 0.1, entry - atr * 0.35);
    sl = Math.max(floor, entry - maxRisk);
    if (!(sl > 0) || !(sl < entry)) return null;
  } else {
    const ceil = Math.max(best.swingHigh + atr * 0.1, entry + atr * 0.35);
    sl = Math.min(ceil, entry + maxRisk);
    if (!(sl > entry)) return null;
  }
  const risk = Math.abs(entry - sl);
  if (!(risk > 0) || reward / risk < minRr * 0.98) return null;

  const sym = params.symbol.toUpperCase();
  const chip = sym.replace(/USDT$/i, '');
  const closedT = Math.max(...agree.map((v) => v.closedBarTime));
  const signalId = `candlels-${sym}-${direction}-${closedT}`;

  return {
    symbol: sym,
    timeframe: best.timeframe,
    direction,
    entry,
    sl,
    tp1,
    tp2,
    signalId,
    noteKo: `${chip}캔들LS · ${agree.length}/${votes.length}TF합의 · ${agree
      .map((v) => v.timeframe)
      .join('+')} · 스윙SL`,
    maxBars: hold.maxBars,
    tp1RoePct: hold.tp1RoePct,
    tp2RoePct: hold.tp2RoePct,
    closedBarTime: closedT,
    agreeCount: agree.length,
    votes,
  };
}

export function listCandleLsScanTimeframes(): string[] {
  return [...CANDLE_LS_SCAN_TFS];
}
