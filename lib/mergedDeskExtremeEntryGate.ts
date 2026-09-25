/**
 * 극단(스윙고/저·면·존 가장자리) 근처만 진입.
 * 중간 횡보·EMA 뭉침 구간 진입 스킵 — 차트에서 원 친 저점/고점 쪽에 가깝게.
 * 확정 수익·승률 아님.
 */

import {
  readAiZoneEntrySnapshot,
  type AiZoneEntrySnapshot,
  type AiZoneFaceBand,
} from '@/lib/mergedDeskAiZoneSnapshot';

/** 레인지 하단/상단 허용 비율 (롱≤이값 · 숏≥1-이값) */

export const EXTREME_EDGE_FRAC = 0.34;

/** 중간 금지 구간 (이 안이면 면/스윙 근접 없을 때 스킵) */

export const EXTREME_MID_LO = 0.38;

export const EXTREME_MID_HI = 0.62;

export type ExtremeRangePack = {
  rangeLo: number;
  rangeHi: number;
  swingLow: number;
  swingHigh: number;
};

export function computeExtremeRangeFromCandles(
  candles: Array<{ high?: number; low?: number }> | null | undefined,
  lookback = 48
): ExtremeRangePack | null {
  if (!Array.isArray(candles) || candles.length < 8) return null;
  const slice = candles.slice(-Math.max(12, Math.min(120, lookback)));
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of slice) {
    const l = Number(c.low);
    const h = Number(c.high);
    if (l > 0 && l < lo) lo = l;
    if (h > 0 && h > hi) hi = h;
  }
  if (!(lo < hi) || !(lo > 0)) return null;
  /** 최근 스윙: 끝쪽 피벗 근사 (단순 최저/최고) */
  const tail = slice.slice(-Math.min(24, slice.length));
  let swingLow = lo;
  let swingHigh = hi;
  let tLo = Infinity;
  let tHi = -Infinity;
  for (const c of tail) {
    const l = Number(c.low);
    const h = Number(c.high);
    if (l > 0 && l < tLo) tLo = l;
    if (h > 0 && h > tHi) tHi = h;
  }
  if (tLo < Infinity) swingLow = tLo;
  if (tHi > -Infinity) swingHigh = tHi;
  return { rangeLo: lo, rangeHi: hi, swingLow, swingHigh };
}

function nearBand(price: number, band: AiZoneFaceBand, bufPct: number): boolean {
  const mid = band.mid > 0 ? band.mid : (band.lo + band.hi) / 2;
  const buf = Math.max(mid * (bufPct / 100), (band.hi - band.lo) * 0.4, mid * 0.0012);
  return price >= band.lo - buf && price <= band.hi + buf;
}

function nearLevel(price: number, level: number, range: number): boolean {
  if (!(level > 0) || !(price > 0)) return false;
  const buf = Math.max(range * 0.06, price * 0.0012, level * 0.001);
  return Math.abs(price - level) <= buf;
}

export type ExtremeEntryGateResult = {
  allow: boolean;
  reasonKo: string;
  /** 0=레인지바닥 · 1=천장 · null=데이터없음 */
  posFrac: number | null;
};

/**
 * 롱: 하단·매수면·롱존·스윙저 근처만.
 * 숏: 상단·매도면·숏존·스윙고 근처만.
 * 스냅/캔들·면 데이터 없으면 WAIT(억지 진입 금지 · fail-closed).
 */

export function extremeEntryGate(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  snap?: AiZoneEntrySnapshot | null;
  candles?: Array<{ high?: number; low?: number }> | null;
  edgeFrac?: number;
}): ExtremeEntryGateResult {
  const price = Number(params.price);
  if (!(price > 0)) {
    return { allow: false, reasonKo: '극단게이트 · 가격없음', posFrac: null };
  }
  const snap = params.snap ?? readAiZoneEntrySnapshot(params.symbol);
  const fromCandles = computeExtremeRangeFromCandles(params.candles, 48);
  const rangeLo =
    (snap?.rangeLo != null && snap.rangeLo > 0 ? snap.rangeLo : null) ??
    fromCandles?.rangeLo ??
    null;
  const rangeHi =
    (snap?.rangeHi != null && snap.rangeHi > 0 ? snap.rangeHi : null) ??
    fromCandles?.rangeHi ??
    null;
  const swingLow =
    (snap?.swingLow != null && snap.swingLow > 0 ? snap.swingLow : null) ??
    fromCandles?.swingLow ??
    null;
  const swingHigh =
    (snap?.swingHigh != null && snap.swingHigh > 0 ? snap.swingHigh : null) ??
    fromCandles?.swingHigh ??
    null;
  const edge = Math.max(0.22, Math.min(0.42, params.edgeFrac ?? EXTREME_EDGE_FRAC));
  const hasRange = rangeLo != null && rangeHi != null && rangeHi > rangeLo;
  const range = hasRange ? rangeHi! - rangeLo! : 0;
  const posFrac = hasRange ? (price - rangeLo!) / range : null;
  const buyFace = snap?.buyFace ?? snap?.longZone ?? null;
  const sellFace = snap?.sellFace ?? snap?.shortZone ?? null;
  const longZone = snap?.longZone ?? snap?.buyFace ?? null;
  const shortZone = snap?.shortZone ?? snap?.sellFace ?? null;

  if (params.direction === 'LONG') {
    /** 억지 금지: 레인지·면·존·스윙 아무 근거도 없으면 WAIT */
    if (!hasRange && !buyFace && !longZone && !(swingLow != null && swingLow > 0)) {
      return {
        allow: false,
        reasonKo: '극단데이터없음 · 롱 WAIT(억지진입금지)',
        posFrac: null,
      };
    }
    const nearBuy = buyFace ? nearBand(price, buyFace, 0.35) : false;
    const nearLongZ = longZone ? nearBand(price, longZone, 0.4) : false;
    const nearSwL =
      swingLow != null && (hasRange ? nearLevel(price, swingLow, range) : nearLevel(price, swingLow, price * 0.02))
        ? true
        : false;
    const atBottom = posFrac != null && posFrac <= edge;
    if (nearBuy || nearLongZ || nearSwL || atBottom) {
      const why = nearBuy
        ? '매수면'
        : nearLongZ
          ? '롱구간'
          : nearSwL
            ? '스윙저'
            : `하단${((posFrac ?? 0) * 100).toFixed(0)}%`;
      return {
        allow: true,
        reasonKo: `극단롱 · ${why} · 확정아님`,
        posFrac,
      };
    }
    if (posFrac != null && posFrac >= EXTREME_MID_LO && posFrac <= EXTREME_MID_HI) {
      return {
        allow: false,
        reasonKo: `중간횡보 롱스킵 · 위치${(posFrac * 100).toFixed(0)}%(하단≤${(edge * 100).toFixed(0)}%만)`,
        posFrac,
      };
    }
    if (posFrac != null && posFrac > edge) {
      return {
        allow: false,
        reasonKo: `극단밖 롱스킵 · 위치${(posFrac * 100).toFixed(0)}% · 저점/매수면 재터치 대기`,
        posFrac,
      };
    }
    return {
      allow: false,
      reasonKo: '극단롱스킵 · 지지/스윙저 미근접',
      posFrac,
    };
  }

  if (!hasRange && !sellFace && !shortZone && !(swingHigh != null && swingHigh > 0)) {
    return {
      allow: false,
      reasonKo: '극단데이터없음 · 숏 WAIT(억지진입금지)',
      posFrac: null,
    };
  }
  const nearSell = sellFace ? nearBand(price, sellFace, 0.35) : false;
  const nearShortZ = shortZone ? nearBand(price, shortZone, 0.4) : false;
  const nearSwH =
    swingHigh != null &&
    (hasRange ? nearLevel(price, swingHigh, range) : nearLevel(price, swingHigh, price * 0.02))
      ? true
      : false;
  const atTop = posFrac != null && posFrac >= 1 - edge;
  if (nearSell || nearShortZ || nearSwH || atTop) {
    const why = nearSell
      ? '매도면'
      : nearShortZ
        ? '숏구간'
        : nearSwH
          ? '스윙고'
          : `상단${((posFrac ?? 0) * 100).toFixed(0)}%`;
    return {
      allow: true,
      reasonKo: `극단숏 · ${why} · 확정아님`,
      posFrac,
    };
  }
  if (posFrac != null && posFrac >= EXTREME_MID_LO && posFrac <= EXTREME_MID_HI) {
    return {
      allow: false,
      reasonKo: `중간횡보 숏스킵 · 위치${(posFrac * 100).toFixed(0)}%(상단≥${((1 - edge) * 100).toFixed(0)}%만)`,
      posFrac,
    };
  }
  if (posFrac != null && posFrac < 1 - edge) {
    return {
      allow: false,
      reasonKo: `극단밖 숏스킵 · 위치${(posFrac * 100).toFixed(0)}% · 고점/매도면 재터치 대기`,
      posFrac,
    };
  }
  return {
    allow: false,
    reasonKo: '극단숏스킵 · 저항/스윙고 미근접',
    posFrac,
  };
}
