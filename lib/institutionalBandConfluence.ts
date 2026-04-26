import type { Candle, OverlayItem, OverlayKind } from '@/types';

/** Wilder RSI — 합류 모멘텀 축. */
export function computeRsiWilderSeries(candles: Candle[], period = 14): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return out;
  const p = Math.max(2, Math.min(50, Math.round(period)));
  const closes = candles.map((c) => c.close);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= p; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) avgGain += ch;
    else avgLoss -= ch;
  }
  avgGain /= p;
  avgLoss /= p;
  let i = p;
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  out[i] = 100 - 100 / (1 + rs0);
  for (i = p + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (p - 1) + g) / p;
    avgLoss = (avgLoss * (p - 1) + l) / p;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
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

export type BandConfluenceGrade = 'S' | 'A' | 'B' | 'C';

export type BandConfluenceResult = {
  /** 0–100 */
  total: number;
  /** 48 미만이면 null — 합류 신호로 부적합 */
  grade: BandConfluenceGrade | null;
  /** minTier 필터용 — S·A→A, B→B, C→C (grade null이면 C로 취급하지 않음·스킵) */
  mappedTier: 'A' | 'B' | 'C';
  parts: string[];
  /** 총점이 최소 등급 하한(48) 이상 */
  ok: boolean;
};

function gradeFromTotal(total: number): BandConfluenceGrade | null {
  if (total >= 83) return 'S';
  if (total >= 72) return 'A';
  if (total >= 58) return 'B';
  if (total >= 48) return 'C';
  return null;
}

function mapGradeToTier(g: BandConfluenceGrade): 'A' | 'B' | 'C' {
  if (g === 'S' || g === 'A') return 'A';
  if (g === 'B') return 'B';
  return 'C';
}

/**
 * 밴드 접촉 한 건에 대해 다축 합류 점수(터치 품질·OBV·거래량·구조·RSI)를 계산.
 * 실전 판단 보조 — 과거·미래 손익 보장 없음.
 */
export function scoreInstitutionalBandConfluence(
  candles: Candle[],
  obv: number[],
  rsi: (number | null)[],
  i: number,
  verdict: 'LONG' | 'SHORT',
  bandPrice: number,
  atr: number,
  touchScore: number,
  overlays: OverlayItem[] | undefined
): BandConfluenceResult {
  const c = candles[i];
  const px = Math.max(1e-12, Math.abs(c?.close ?? bandPrice));
  const atrSafe = Math.max(atr, px * 1e-8);
  const tol = Math.max(atrSafe * 0.48, px * 1e-7);
  const parts: string[] = [];

  // 1) 터치 품질 (최대 32)
  const touchPts = Math.max(0, Math.min(32, (touchScore / 100) * 32));
  if (touchPts >= 26) parts.push('터치우수');
  else if (touchPts >= 18) parts.push('터치양호');

  // 2) OBV (최대 18)
  let obvPts = 0;
  if (i >= 1 && obv.length > i) {
    if (i >= 3) {
      const slope = obv[i] - obv[i - 3];
      const aligned = verdict === 'LONG' ? slope >= 0 : slope <= 0;
      if (aligned) {
        obvPts = 18;
        parts.push('OBV일치');
      } else if (verdict === 'LONG' ? slope > -1e-12 * Math.abs(obv[i]) : slope < 1e-12 * Math.abs(obv[i])) {
        obvPts = 9;
        parts.push('OBV중립');
      }
    } else {
      const d = obv[i] - obv[i - 1];
      const aligned = verdict === 'LONG' ? d >= 0 : d <= 0;
      obvPts = aligned ? 16 : 7;
      if (aligned) parts.push('OBV일치');
    }
  }

  // 3) 거래량 (최대 18)
  const sma20 = volumeSma(candles, i, 20);
  const vol = c.volume ?? 0;
  const ratio = sma20 > 0 ? vol / sma20 : 1;
  let volPts = 0;
  if (ratio >= 1.22) {
    volPts = 18;
    parts.push('거래량강');
  } else if (ratio >= 1.14) {
    volPts = 14;
    parts.push('거래량확');
  } else if (ratio >= 1.06) {
    volPts = 8;
    parts.push('거래량보통+');
  }

  // 4) 구조 EQ·저항·지지 (최대 20)
  const ys = collectStructurePrices(overlays, verdict);
  const structureAvailable = ys.length > 0;
  let structPts = 0;
  if (!structureAvailable) {
    structPts = 14;
    parts.push('구조데이터없음');
  } else if (ys.some((y) => Math.abs(bandPrice - y) <= tol)) {
    structPts = 20;
    parts.push('구조근접');
  } else {
    structPts = 5;
    parts.push('구조엇갈림');
  }

  // 5) RSI 모멘텀 (최대 12)
  const r = rsi[i];
  let rsiPts = 6;
  if (r != null && Number.isFinite(r)) {
    const r2 = i >= 2 ? rsi[i - 2] : null;
    if (verdict === 'LONG') {
      if (r <= 36 && c.close >= c.open) {
        rsiPts = 12;
        parts.push('RSI과매도반응');
      } else if (r2 != null && r > r2 + 0.4) {
        rsiPts = 10;
        parts.push('RSI상승전환');
      } else if (r >= 30 && r <= 58) {
        rsiPts = 9;
        parts.push('RSI구간양호');
      } else {
        rsiPts = 5;
        parts.push('RSI보통');
      }
    } else {
      if (r >= 64 && c.close <= c.open) {
        rsiPts = 12;
        parts.push('RSI과매수반응');
      } else if (r2 != null && r < r2 - 0.4) {
        rsiPts = 10;
        parts.push('RSI하락전환');
      } else if (r >= 42 && r <= 70) {
        rsiPts = 9;
        parts.push('RSI구간양호');
      } else {
        rsiPts = 5;
        parts.push('RSI보통');
      }
    }
  } else {
    parts.push('RSI데이터부족');
  }

  const total = Math.min(
    100,
    Math.round(touchPts + obvPts + volPts + structPts + rsiPts + Number.EPSILON)
  );
  const grade = gradeFromTotal(total);
  const ok = grade != null;
  const mappedTier = grade ? mapGradeToTier(grade) : 'C';

  return {
    total,
    grade,
    mappedTier,
    parts: parts.slice(0, 10),
    ok,
  };
}

/** 합류 모드에서 마커 채택 최소 총점 — 기본 50 (C급 하한 근처). */
export const DEFAULT_CONFLUENCE_MIN_TOTAL = 50;
