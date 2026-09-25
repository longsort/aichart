/**
 * Big Move Meter — compression / expansion / cascade readiness.
 * Score is NOT a win probability.
 */
import { atrAt, type Eagle1Bar } from './structureEngine';
import type { Eagle1MoneyPressure, Eagle1MoneyPressureLive } from './moneyPressureBand';

export type BigMoveState = 'COMPRESSION' | 'READY' | 'EXPANSION' | 'CASCADE' | 'NONE';

export type BigMoveReport = {
  score: number | null;
  state: BigMoveState;
  direction: 'up' | 'down' | 'neutral';
  labelKo: string;
  labelEn: string;
  compression: number | null;
  expansionReady: number | null;
  note: string;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function meanRange(bars: Eagle1Bar[]): number {
  if (!bars.length) return 0;
  return bars.reduce((s, b) => s + Math.max(0, b.high - b.low), 0) / bars.length;
}

export function runBigMoveEngine(params: {
  candles: Eagle1Bar[];
  endExclusive?: number;
  money?: Eagle1MoneyPressure | null;
  live?: Eagle1MoneyPressureLive | null;
  regime?: string | null;
}): BigMoveReport {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const prefix = params.candles.slice(0, n);
  if (prefix.length < 24) {
    return {
      score: null,
      state: 'NONE',
      direction: 'neutral',
      labelKo: '데이터 없음',
      labelEn: 'NONE',
      compression: null,
      expansionReady: null,
      note: '데이터 없음',
    };
  }
  const atrNow = atrAt(prefix, n, 14);
  const atrPrev = atrAt(prefix, Math.max(15, n - 20), 14);
  const recent = meanRange(prefix.slice(-8));
  const base = meanRange(prefix.slice(-40, -8));
  const vols = prefix.slice(-21, -1).map((b) => Number(b.volume) || 0);
  const vAvg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  const vLast = Number(prefix[n - 1]?.volume) || 0;
  const volZ = vAvg > 0 ? vLast / vAvg : null;
  const compress = base > 0 ? clamp((1 - recent / base) * 100) : null;
  const atrExpand = atrPrev > 0 && atrNow > 0 ? atrNow / atrPrev : null;
  const flow = params.money?.score ?? 0;
  const oi = params.live?.oiState;
  let expansionReady =
    compress != null
      ? clamp(
          compress * 0.35 +
            (atrExpand != null ? Math.min(40, Math.max(0, (atrExpand - 0.85) * 80)) : 0) +
            (volZ != null ? Math.min(25, Math.max(0, (volZ - 0.8) * 20)) : 0)
        )
      : null;
  if (oi === 'increasing' && expansionReady != null) expansionReady = clamp(expansionReady + 6);
  if (oi === 'decreasing' && expansionReady != null) expansionReady = clamp(expansionReady + 4);

  const last = prefix[n - 1]!;
  const body = Math.abs(last.close - last.open);
  const range = Math.max(last.high - last.low, 1e-9);
  const dumpBody = atrNow > 0 && body > atrNow * 1.6 && last.close < last.open;
  const cascadeFlow =
    flow <= -18 ||
    params.money?.state === 'STRONG_SELL' ||
    params.money?.state === 'BREAKDOWN_SELL' ||
    params.live?.liqAccel === true;
  const expandFlow = flow >= 18 || params.money?.state === 'STRONG_BUY' || params.money?.state === 'BREAKOUT_BUY';

  let state: BigMoveState = 'NONE';
  if (dumpBody && cascadeFlow) state = 'CASCADE';
  else if (atrExpand != null && atrExpand >= 1.35 && (volZ != null ? volZ >= 1.25 : expandFlow || cascadeFlow))
    state = params.regime === 'STRONG_BEAR' || cascadeFlow ? 'CASCADE' : 'EXPANSION';
  else if (compress != null && compress >= 55 && (volZ == null || volZ < 1.15)) state = 'COMPRESSION';
  else if (expansionReady != null && expansionReady >= 62) state = 'READY';
  else if (compress != null) state = compress >= 40 ? 'COMPRESSION' : 'READY';

  const direction: BigMoveReport['direction'] =
    state === 'CASCADE' ? 'down' : expandFlow ? 'up' : cascadeFlow ? 'down' : last.close >= last.open ? 'up' : 'down';

  const score =
    state === 'CASCADE'
      ? clamp(70 + Math.min(25, (body / range) * 20))
      : expansionReady;

  const labelEn = state === 'NONE' ? 'NONE' : state;
  const labelKo =
    state === 'COMPRESSION'
      ? '압축 진행'
      : state === 'READY'
        ? '확장 준비'
        : state === 'EXPANSION'
          ? '확장'
          : state === 'CASCADE'
            ? '급락 위험'
            : '데이터 없음';

  return {
    score: score != null && Number.isFinite(score) ? Math.round(score) : null,
    state,
    direction: state === 'NONE' ? 'neutral' : direction,
    labelKo,
    labelEn,
    compression: compress != null ? Math.round(compress) : null,
    expansionReady: expansionReady != null ? Math.round(expansionReady) : null,
    note: '큰 움직임 준비도 · 확률 아님',
  };
}
