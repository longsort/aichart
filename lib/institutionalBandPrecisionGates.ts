import type { Candle, OverlayItem, OverlayKind } from '@/types';

/**
 * 클래식 OBV — 종가 전일 대비 상승/하락/보합에 따라 거래량 가감.
 * 기관밴드 접촉 시 매집/분배 방향과의 정합 여부(정밀 필터 축).
 */
export function computeObvSeries(candles: Candle[]): number[] {
  const n = candles.length;
  const out = new Array(n).fill(0);
  if (!n) return out;
  out[0] = candles[0].volume ?? 0;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const vol = c.volume ?? 0;
    if (c.close > p.close) out[i] = out[i - 1] + vol;
    else if (c.close < p.close) out[i] = out[i - 1] - vol;
    else out[i] = out[i - 1];
  }
  return out;
}

function volumeSma(candles: Candle[], i: number, period: number): number {
  const start = Math.max(0, i - period + 1);
  let sum = 0;
  let count = 0;
  for (let k = start; k <= i; k++) {
    sum += candles[k].volume ?? 0;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

const LONG_STRUCTURE_KINDS = new Set<OverlayKind>([
  'equilibrium',
  'eql',
  'demandZone',
  'supportLine',
  'strongLow',
  'poi',
  'reactionZone',
  'keyLevel',
]);

const SHORT_STRUCTURE_KINDS = new Set<OverlayKind>([
  'equilibrium',
  'eqh',
  'supplyZone',
  'resistanceLine',
  'strongHigh',
  'poi',
  'reactionZone',
  'keyLevel',
]);

function collectStructurePrices(overlays: OverlayItem[] | undefined, verdict: 'LONG' | 'SHORT'): number[] {
  if (!overlays?.length) return [];
  const kinds = verdict === 'LONG' ? LONG_STRUCTURE_KINDS : SHORT_STRUCTURE_KINDS;
  const ys: number[] = [];
  for (const o of overlays) {
    if (!kinds.has(o.kind)) continue;
    for (const py of [o.y1, o.y2, o.price1, o.price2]) {
      if (typeof py === 'number' && Number.isFinite(py)) ys.push(py);
    }
  }
  return ys;
}

export type BandTouchPrecisionChecks = {
  obvOk: boolean;
  volOk: boolean;
  structureOk: boolean;
  /** 분석 오버레이에서 해당 방향 구조 앵커가 하나라도 있음 */
  structureAvailable: boolean;
  /** 툴팁·마커 접미사용 짧은 근거 */
  parts: string[];
};

/**
 * 밴드 접촉 봉 index에서 OBV 방향·거래량 SMA 대비·밴드가격 vs EQ/저항·지지 등 근접 여부 평가.
 */
export function evaluateBandTouchPrecision(
  candles: Candle[],
  obv: number[],
  i: number,
  verdict: 'LONG' | 'SHORT',
  bandPrice: number,
  atr: number,
  overlays: OverlayItem[] | undefined
): BandTouchPrecisionChecks {
  const parts: string[] = [];
  const c = candles[i];
  const px = Math.max(1e-12, Math.abs(c?.close ?? bandPrice));
  const atrSafe = Math.max(atr, px * 1e-8);
  const tol = Math.max(atrSafe * 0.48, px * 1e-7);

  const ys = collectStructurePrices(overlays, verdict);
  const structureAvailable = ys.length > 0;
  const structureOk = structureAvailable && ys.some((y) => Math.abs(bandPrice - y) <= tol);
  if (structureOk) parts.push('구조근접');
  else if (structureAvailable) parts.push('구조미근접');

  let obvOk = false;
  if (i >= 1 && obv.length > i) {
    if (i >= 3) {
      const slope = obv[i] - obv[i - 3];
      obvOk = verdict === 'LONG' ? slope >= 0 : slope <= 0;
    } else {
      const d = obv[i] - obv[i - 1];
      obvOk = verdict === 'LONG' ? d >= 0 : d <= 0;
    }
  }
  if (obvOk) parts.push('OBV방향');
  else parts.push('OBV약함');

  const sma20 = volumeSma(candles, i, 20);
  const vol = c.volume ?? 0;
  const volRatio = sma20 > 0 ? vol / sma20 : 1;
  const volOk = volRatio >= 1.14;
  if (volOk) parts.push('거래량확인');
  else parts.push('거래량보통');

  return { obvOk, volOk, structureOk, structureAvailable, parts };
}

/**
 * 정밀 모드 통과: OBV·거래량은 항상 요구.
 * 분석에서 구조 앵커가 있으면 밴드가 그 근처일 때만 통과(없으면 구조 조건 생략).
 */
export function bandTouchMeetsPrecisionGate(checks: BandTouchPrecisionChecks): boolean {
  if (!checks.obvOk || !checks.volOk) return false;
  if (checks.structureAvailable) return checks.structureOk;
  return true;
}
