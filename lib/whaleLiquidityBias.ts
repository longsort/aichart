/**
 * Pine 호환 요약: "Liquidity Bias Pro" — 스윙 BSL/SSL 풀, 스윕 제거, 최근접 레벨 + 바이어스 상태.
 * 차트에는 **가로선·텍스트 라벨 대신** ATR 두께의 **존(면)** 으로만 표시.
 */
import type { Candle, OverlayItem } from '@/types';
import { atrSeries } from '@/lib/indicators';

const SWING_L = 5;
const SWING_R = 5;
const ATR_LEN = 14;
/** 존 반두께 = ATR × (Pine 라인 대비 띠로 보이게) */
const ZONE_HALF_ATR_MUL = 0.22;
/** SMC 데스크: 스윙 유의미성·중복 배제 강화, 띠는 약간 얇게 */
const LQB_SMC_ATR_FILTER = 0.62;
const LQB_SMC_EQ_PCT = 0.075;
const ZONE_HALF_ATR_MUL_SMC = 0.19;

export type WhaleLiquidityBiasPreset = 'default' | 'smcDesk' | 'whaleClean';

type Liq = { price: number; origin: number };

function isEqual(a: number, b: number, pct: number): boolean {
  return Math.abs(a - b) <= Math.abs(a) * (pct / 100);
}

function isPivotHigh(candles: Candle[], p: number, L: number, R: number): boolean {
  const h = candles[p].high;
  for (let j = p - L; j <= p + R; j++) {
    if (j < 0 || j >= candles.length) return false;
    if (j !== p && candles[j].high >= h) return false;
  }
  return true;
}

function isPivotLow(candles: Candle[], p: number, L: number, R: number): boolean {
  const lo = candles[p].low;
  for (let j = p - L; j <= p + R; j++) {
    if (j < 0 || j >= candles.length) return false;
    if (j !== p && candles[j].low <= lo) return false;
  }
  return true;
}

export type WhaleLiquidityBiasSnapshot = {
  bias: 'Neutral' | 'Bullish' | 'Bearish';
  reason: string;
  nearestBsl: Liq | null;
  nearestSsl: Liq | null;
};

export function simulateWhaleLiquidityBias(candles: Candle[], atrFilter = 0.5, eqPct = 0.1): WhaleLiquidityBiasSnapshot {
  const n = candles.length;
  if (n < SWING_L + SWING_R + 3) {
    return { bias: 'Neutral', reason: '데이터 부족', nearestBsl: null, nearestSsl: null };
  }
  const atr = atrSeries(candles, ATR_LEN);
  const bsl: Liq[] = [];
  const ssl: Liq[] = [];

  let waitingBull = false;
  let waitingBear = false;
  let bias: 'Neutral' | 'Bullish' | 'Bearish' = 'Neutral';
  let reason = '유동성 스윕 대기';
  let sslSwept = false;
  let bslSwept = false;

  for (let conf = SWING_L + SWING_R; conf < n; conf++) {
    const p = conf - SWING_R;
    const th = (Number(atr[conf]) || 0) * atrFilter;

    if (isPivotHigh(candles, p, SWING_L, SWING_R)) {
      const ph = candles[p].high;
      const significant = th <= 0 || ph - candles[p].low > th;
      if (significant) {
        let exists = false;
        for (const x of bsl) {
          if (isEqual(ph, x.price, eqPct)) {
            exists = true;
            break;
          }
        }
        if (!exists) bsl.push({ price: ph, origin: p });
      }
    }
    if (isPivotLow(candles, p, SWING_L, SWING_R)) {
      const pl = candles[p].low;
      const significant = th <= 0 || candles[p].high - pl > th;
      if (significant) {
        let exists = false;
        for (const x of ssl) {
          if (isEqual(pl, x.price, eqPct)) {
            exists = true;
            break;
          }
        }
        if (!exists) ssl.push({ price: pl, origin: p });
      }
    }

    const hi = candles[conf].high;
    const lo = candles[conf].low;
    const cl = candles[conf].close;
    const hi1 = conf > 0 ? candles[conf - 1].high : hi;
    const lo1 = conf > 0 ? candles[conf - 1].low : lo;

    for (let i = bsl.length - 1; i >= 0; i--) {
      if (hi >= bsl[i].price) {
        bsl.splice(i, 1);
        bslSwept = true;
      }
    }
    for (let i = ssl.length - 1; i >= 0; i--) {
      if (lo <= ssl[i].price) {
        ssl.splice(i, 1);
        sslSwept = true;
      }
    }

    if (sslSwept) {
      waitingBull = true;
      waitingBear = false;
      sslSwept = false;
    }
    if (bslSwept) {
      waitingBear = true;
      waitingBull = false;
      bslSwept = false;
    }

    if (waitingBull && cl > hi1) {
      bias = 'Bullish';
      reason = 'SSL 스윕 후 구조 상방';
      waitingBull = false;
    }
    if (waitingBear && cl < lo1) {
      bias = 'Bearish';
      reason = 'BSL 스윕 후 하방 거부';
      waitingBear = false;
    }
  }

  let nearestBsl: Liq | null = null;
  for (const x of bsl) {
    if (!nearestBsl || x.price < nearestBsl.price) nearestBsl = x;
  }
  let nearestSsl: Liq | null = null;
  for (const x of ssl) {
    if (!nearestSsl || x.price > nearestSsl.price) nearestSsl = x;
  }

  return { bias, reason, nearestBsl, nearestSsl };
}

export function buildWhaleLiquidityBiasOverlays(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  /** SMC 데스크: 유의미한 스윙만·얇은 띠·바이어스 툴팁 강화 */
  preset?: WhaleLiquidityBiasPreset;
}): OverlayItem[] {
  const { candles, preset } = params;
  const smc = preset === 'smcDesk';
  const whaleClean = preset === 'whaleClean';
  const snap = smc
    ? simulateWhaleLiquidityBias(candles, LQB_SMC_ATR_FILTER, LQB_SMC_EQ_PCT)
    : simulateWhaleLiquidityBias(candles);
  const n = candles.length;
  if (n < 8) return [];

  const lastT = candles[n - 1].time as number;
  const atr = atrSeries(candles, ATR_LEN);
  const atrNow = Math.max(Number(atr[n - 1]) || 0, 1e-12);
  const half = atrNow * (smc ? ZONE_HALF_ATR_MUL_SMC : whaleClean ? ZONE_HALF_ATR_MUL * 0.9 : ZONE_HALF_ATR_MUL);
  const biasLine = `바이어스: ${snap.bias} — ${snap.reason}`;

  const out: OverlayItem[] = [];

  if (snap.nearestBsl) {
    const t1 = candles[snap.nearestBsl.origin].time as number;
    const p = snap.nearestBsl.price;
    const top = p + half;
    const bot = p - half;
    const bslColor = whaleClean
      ? 'rgba(139, 92, 246, 0.30)'
      : smc
        ? 'rgba(8,153,129,0.34)'
        : 'rgba(8,153,129,0.26)';
    const bslLine = whaleClean ? '#7C3AED' : smc ? '#10B981' : '#089981';
    out.push({
      id: 'whale-lqb-bsl',
      kind: 'supplyZone',
      label: 'BSL',
      labelTooltip: smc
        ? `${biasLine} · 매수측(BSL) — SMC: 레인지≥${LQB_SMC_ATR_FILTER}×ATR · 근접 ${(LQB_SMC_EQ_PCT * 100).toFixed(2)}% 병합`
        : whaleClean
          ? `${snap.reason} · 매수측 BSL(보라) — DRS(로즈/틴)과 구분`
          : `${snap.reason} (매수측 유동성 풀 · 존)`,
      category: 'whaleToolkit',
      time1: t1,
      time2: lastT,
      price1: top,
      price2: bot,
      confidence: smc ? 72 : 68,
      color: bslColor,
      lineLabelColor: bslLine,
      zoneSpanOnly: true,
      zonePulse: false,
      x1: 0,
      y1: 0,
    });
  }
  if (snap.nearestSsl) {
    const t1 = candles[snap.nearestSsl.origin].time as number;
    const p = snap.nearestSsl.price;
    const top = p + half;
    const bot = p - half;
    const sslColor = whaleClean
      ? 'rgba(6, 182, 212, 0.30)'
      : smc
        ? 'rgba(242,54,69,0.32)'
        : 'rgba(242,54,69,0.24)';
    const sslLine = whaleClean ? '#0891B2' : smc ? '#FB7185' : '#f23645';
    out.push({
      id: 'whale-lqb-ssl',
      kind: 'demandZone',
      label: 'SSL',
      labelTooltip: smc
        ? `${biasLine} · 매도측(SSL) — SMC: 레인지≥${LQB_SMC_ATR_FILTER}×ATR · 근접 ${(LQB_SMC_EQ_PCT * 100).toFixed(2)}% 병합`
        : whaleClean
          ? `${snap.reason} · 매도측 SSL(시안) — DRS·Hot존과 색상 분리`
          : `${snap.reason} (매도측 유동성 풀 · 존)`,
      category: 'whaleToolkit',
      time1: t1,
      time2: lastT,
      price1: top,
      price2: bot,
      confidence: smc ? 72 : 68,
      color: sslColor,
      lineLabelColor: sslLine,
      zoneSpanOnly: true,
      zonePulse: false,
      x1: 0,
      y1: 0,
    });
  }

  return out;
}
