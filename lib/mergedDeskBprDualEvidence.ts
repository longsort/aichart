/**
 * Dual Fast 추가근거 — 15m ICT BPR 재터치 품질 + Dual 방향 합류.
 * 형성 직후·첫겹침 가산 없음 · BPR 단독 주문 아님.
 * 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { detectIctBpr, priceTouchesBpr, type IctBprZone } from '@/lib/bpr';
import {
  analyzeBprRetestQuality,
  BPR_RETEST_MIN_TOUCHES,
  BPR_RETEST_TF,
} from '@/lib/mergedDeskBprRetestTrade';

export const BPR_DUAL_EVIDENCE_KO = 'BPR합류15m';
export const BPR_DUAL_TF = BPR_RETEST_TF;

export type BprDualEvidenceResult = {
  /** 재터치 OK + Dual 방향 = zone.bias */
  alignOk: boolean;
  /** 면·기관·로켓 중 정렬≥1일 때만 주문 태그/점수에 쓸 보강 */
  boostOk: boolean;
  touchCount: number;
  bias: IctBprZone['bias'] | null;
  reasonKo: string;
  zoneTop: number | null;
  zoneBot: number | null;
};

function emptyResult(reasonKo: string): BprDualEvidenceResult {
  return {
    alignOk: false,
    boostOk: false,
    touchCount: 0,
    bias: null,
    reasonKo,
    zoneTop: null,
    zoneBot: null,
  };
}

function barOverlapsZone(
  hi: number,
  lo: number,
  closePx: number,
  zone: { top: number; bottom: number }
): boolean {
  return (
    priceTouchesBpr(closePx, zone) ||
    priceTouchesBpr(lo, zone) ||
    priceTouchesBpr(hi, zone) ||
    (lo <= zone.top && hi >= zone.bottom)
  );
}

function biasMatchesDirection(
  bias: IctBprZone['bias'],
  direction: 'LONG' | 'SHORT'
): boolean {
  if (direction === 'LONG') return bias === 'bullish';
  return bias === 'bearish';
}

/**
 * 15m 캔들 기준 Dual 추가근거.
 * @param baseAlignedN 면·기관·로켓 정렬 축 수 — ≥1일 때만 boostOk
 */
export function evaluateBprDualEvidence(params: {
  candles15m: Candle[] | null | undefined;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  /** aiZoneEvidenceGate.alignedN — 없으면 0 */
  baseAlignedN?: number;
  minTouches?: number;
}): BprDualEvidenceResult {
  const direction = params.direction;
  if (direction === 'NEUTRAL') {
    return emptyResult('BPR가산대기 · Dual방향없음');
  }
  const candles = params.candles15m;
  if (!Array.isArray(candles) || candles.length < 12) {
    return emptyResult('BPR15m캔들부족');
  }

  const n = candles.length;
  const closedIdx = n - 2;
  const closed = candles[closedIdx];
  if (!closed) return emptyResult('BPR마감봉없음');
  const closePx = Number(closed.close);
  const hi = Number(closed.high);
  const lo = Number(closed.low);
  if (!(closePx > 0) || !(hi >= lo)) return emptyResult('BPR가격무효');

  const zones = detectIctBpr(candles, {
    endExclusive: n - 1,
    maxZones: 3,
  });
  if (!zones.length) return emptyResult('BPR존없음');

  const minTouches = Math.max(2, params.minTouches ?? BPR_RETEST_MIN_TOUCHES);
  let best: {
    zone: IctBprZone;
    quality: ReturnType<typeof analyzeBprRetestQuality>;
  } | null = null;

  for (const zone of zones) {
    if (!barOverlapsZone(hi, lo, closePx, zone)) continue;
    const quality = analyzeBprRetestQuality({
      candles,
      zone,
      closedIdx,
      minTouches,
    });
    if (!quality.ok) continue;
    if (!best) {
      best = { zone, quality };
      continue;
    }
    const dBest = Math.abs(best.zone.midpoint - closePx);
    const dCur = Math.abs(zone.midpoint - closePx);
    if (dCur < dBest) best = { zone, quality };
  }

  if (!best) {
    /** 겹침 존이 있어도 재터치 미달 — 첫겹침/이탈없음 등 */
    for (const zone of zones) {
      if (!barOverlapsZone(hi, lo, closePx, zone)) continue;
      const quality = analyzeBprRetestQuality({
        candles,
        zone,
        closedIdx,
        minTouches,
      });
      return emptyResult(quality.reasonKo || 'BPR재터치미달');
    }
    return emptyResult('BPR마감봉미겹침');
  }

  const { zone, quality } = best;
  if (!biasMatchesDirection(zone.bias, direction)) {
    return {
      alignOk: false,
      boostOk: false,
      touchCount: quality.touchCount,
      bias: zone.bias,
      reasonKo: `BPR방향불일치 · ${zone.bias}≠${direction}`,
      zoneTop: zone.top,
      zoneBot: zone.bottom,
    };
  }

  const baseAlignedN = Math.max(0, Math.floor(Number(params.baseAlignedN) || 0));
  const alignOk = true;
  const boostOk = baseAlignedN >= 1;

  return {
    alignOk,
    boostOk,
    touchCount: quality.touchCount,
    bias: zone.bias,
    reasonKo: boostOk
      ? `${BPR_DUAL_EVIDENCE_KO} · 재터치${quality.touchCount}회 · 축보강`
      : `${BPR_DUAL_EVIDENCE_KO} · 재터치${quality.touchCount}회 · 기본축대기`,
    zoneTop: zone.top,
    zoneBot: zone.bottom,
  };
}

/** 15m 캔들 단기 캐시 — 프로브/틱 공유 · 주문 아님 */
const candles15mCache = new Map<
  string,
  { at: number; candles: Candle[] }
>();
const CANDLES_15M_TTL_MS = 45_000;

export function peekBprCandles15m(symbol: string): Candle[] | null {
  const key = String(symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const hit = candles15mCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CANDLES_15M_TTL_MS) return null;
  return hit.candles;
}

export function putBprCandles15m(symbol: string, candles: Candle[]): void {
  const key = String(symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!key || !Array.isArray(candles) || candles.length < 12) return;
  candles15mCache.set(key, { at: Date.now(), candles });
}

export async function fetchBprCandles15m(symbol: string): Promise<Candle[]> {
  if (typeof fetch === 'undefined') return [];
  const sym = String(symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!sym) return [];
  const cached = peekBprCandles15m(sym);
  if (cached) return cached;
  try {
    const q = new URLSearchParams({
      symbol: sym.endsWith('USDT') ? sym : `${sym}USDT`,
      timeframe: BPR_DUAL_TF,
      depth: 'recent',
    });
    const res = await fetch(`/api/market?${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({}))) as { candles?: Candle[] };
    const candles = Array.isArray(json.candles) ? json.candles : [];
    if (candles.length >= 12) putBprCandles15m(sym, candles);
    return candles;
  } catch {
    return [];
  }
}
