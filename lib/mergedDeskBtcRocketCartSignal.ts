/**
 * Dual 신호B — 3m 로켓→≤5봉 장바구니(동방) / 숏=하락그래프→번개·숏장바.
 * Dual 코어4와 믹스 금지 · 단독 추격 금지 · 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { detectMergedAnalysisKeyZones } from '@/lib/mergedAnalysisKeyZones';
import { detectMergedCriticalZones } from '@/lib/mergedAnalysisCriticalZones';
import { scanMergedLeadingCandleSignals } from '@/lib/mergedAnalysisLeadingSignals';
import { buildMergedDeskChartTfStructureRockets } from '@/lib/mergedAnalysisDeskMarkers';
import {
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  computeInstitutionalBandInteractionMarkersUnion,
  institutionalBandTouchMinGapBars,
} from '@/lib/institutionalSuperBand';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import {
  computeMergedDeskRbEdgeConfluenceGate,
  detectRbRailSfp,
} from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { aiZoneFeeRrGate } from '@/lib/mergedDeskAiZoneFeeGate';
import { aiZoneEvidenceGate } from '@/lib/mergedDeskAiZoneEvidenceGate';
import {
  readAiZoneEntrySnapshot,
  type AiZoneEntrySnapshot,
} from '@/lib/mergedDeskAiZoneSnapshot';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import { resolveBtcRocketHuntSl } from '@/lib/mergedDeskBtc3mRocketTrade';
import { rbScalpPlaceFastOk } from '@/lib/mergedDeskRbScalpDriveTrade';

export const BTC_ROCKET_CART_SOURCE = 'btc-rocket-cart' as const;
export const BTC_ROCKET_CART_TF = '3m';
export const BTC_ROCKET_CART_WINDOW = 5;
export const BTC_ROCKET_CART_EXT_K = 1.8;
export const BTC_ROCKET_CART_SYMBOL = 'BTCUSDT';
export const ROCKET_CART_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'XRPUSDT',
] as const;

export function rocketCartSymbolAllowed(symbol: string): boolean {
  const u = String(symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const full = u.endsWith('USDT') ? u : `${u}USDT`;
  return (ROCKET_CART_SYMBOLS as readonly string[]).includes(full);
}

export type BtcRocketCartFilters = {
  place: boolean;
  seq: boolean;
  fee: boolean;
  htfOk: boolean;
  extensionOk: boolean;
};

export type BtcRocketCartProbe = {
  symbol: string;
  timeframe: typeof BTC_ROCKET_CART_TF;
  slotKo: '신호B';
  ready: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  waitingKo: string;
  filter: BtcRocketCartFilters;
  rocketBarTime: number | null;
  cartBarTime: number | null;
  updatedAt: number;
};

export type BtcRocketCartCandidate = {
  symbol: string;
  timeframe: typeof BTC_ROCKET_CART_TF;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  score: number;
  signalKo: string;
  evidenceKo: string;
  source: typeof BTC_ROCKET_CART_SOURCE;
  signalId: string;
  analysisTags: string[];
  closedBarTime: number;
  rocketBarTime: number;
  cartBarTime: number;
  netRoePct: number;
  rr: number;
  waitingKo: string;
  filter: BtcRocketCartFilters;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function idxAtTime(candles: Candle[], t: number): number {
  if (!(t > 0) || !candles.length) return -1;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (Number(candles[i]!.time) === t) return i;
  }
  let best = -1;
  for (let i = 0; i < candles.length; i++) {
    const ct = Number(candles[i]!.time);
    if (ct <= t) best = i;
    else break;
  }
  return best;
}

function emptyFilter(partial?: Partial<BtcRocketCartFilters>): BtcRocketCartFilters {
  return {
    place: false,
    seq: false,
    fee: false,
    htfOk: true,
    extensionOk: false,
    ...partial,
  };
}

function probeOut(
  waitingKo: string,
  filter: BtcRocketCartFilters,
  symbol: string,
  extra?: Partial<BtcRocketCartProbe>
): BtcRocketCartProbe {
  return {
    symbol,
    timeframe: BTC_ROCKET_CART_TF,
    slotKo: '신호B',
    ready: false,
    direction: 'NEUTRAL',
    waitingKo,
    filter,
    rocketBarTime: null,
    cartBarTime: null,
    updatedAt: Date.now(),
    ...extra,
  };
}

/** Dual 4코인 3m 신호B */
export function buildBtcRocketCartSignal(params: {
  symbol?: string;
  candles: Candle[];
  leverage?: number;
  minRr?: number;
  tp1RoePct?: number;
  snap?: AiZoneEntrySnapshot | null;
  price?: number | null;
}): { candidate: BtcRocketCartCandidate | null; probe: BtcRocketCartProbe } {
  const raw = String(params.symbol || BTC_ROCKET_CART_SYMBOL)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const symbol = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  if (!rocketCartSymbolAllowed(symbol)) {
    return {
      candidate: null,
      probe: probeOut('신호B · 심볼불가', emptyFilter(), symbol),
    };
  }

  const candles = params.candles;
  const n = candles.length;
  if (n < 40) {
    return {
      candidate: null,
      probe: probeOut('신호B · 3m캔들부족', emptyFilter(), symbol),
    };
  }

  const closedIdx = n - 2;
  const closed = candles[closedIdx]!;
  const closedT = Number(closed.time) || 0;
  const entry =
    Number(params.price) > 0 ? Number(params.price) : Number(closed.close);
  if (!(entry > 0) || !(closedT > 0)) {
    return {
      candidate: null,
      probe: probeOut('신호B · 가격없음', emptyFilter(), symbol),
    };
  }

  const atr = atrApprox(candles);
  const tf = BTC_ROCKET_CART_TF;
  const window = BTC_ROCKET_CART_WINDOW;
  const extK = BTC_ROCKET_CART_EXT_K;

  const rockets = buildMergedDeskChartTfStructureRockets(candles, tf);
  if (!rockets.length) {
    return {
      candidate: null,
      probe: probeOut('신호B · 로켓대기', emptyFilter(), symbol),
    };
  }

  let carts: Array<{ time: number; direction: 'LONG' | 'SHORT'; tier: string }> =
    [];
  try {
    const keyZones = detectMergedAnalysisKeyZones(candles, tf);
    const criticalZones = detectMergedCriticalZones({
      candles,
      timeframe: tf,
      keyZones,
    });
    const leading = scanMergedLeadingCandleSignals({
      candles,
      timeframe: tf,
      keyZones,
      criticalZones,
    });
    carts = leading
      .filter((s) => s.tier === 'confirmed' || s.tier === 'strong')
      .map((s) => ({ time: s.time, direction: s.direction, tier: s.tier }));
  } catch {
    carts = [];
  }

  let bandShorts: Array<{ time: number }> = [];
  try {
    const marks = computeInstitutionalBandInteractionMarkersUnion(
      candles,
      INSTITUTIONAL_BAND_DEFAULT_PERIOD,
      INSTITUTIONAL_BAND_DEFAULT_MULT,
      {
        minBarsBetween: institutionalBandTouchMinGapBars(tf),
        tierEnabled: { A: true, B: true, C: false },
      }
    );
    bandShorts = marks
      .filter((m) => m.verdict === 'SHORT')
      .map((m) => ({ time: m.time }));
  } catch {
    bandShorts = [];
  }

  type SeqHit = {
    direction: 'LONG' | 'SHORT';
    rocketIdx: number;
    confirmIdx: number;
    rocketT: number;
    confirmT: number;
    labelKo: string;
  };

  const hits: SeqHit[] = [];
  for (const rk of rockets) {
    const rocketT = Number(rk.time);
    const rocketIdx = idxAtTime(candles, rocketT);
    if (rocketIdx < 0 || rocketIdx > closedIdx) continue;
    if (closedIdx - rocketIdx > window) continue;
    if (rk.direction !== 'LONG' && rk.direction !== 'SHORT') continue;

    if (rk.direction === 'LONG') {
      for (const c of carts) {
        if (c.direction !== 'LONG') continue;
        const confirmIdx = idxAtTime(candles, c.time);
        if (confirmIdx < rocketIdx || confirmIdx > closedIdx) continue;
        if (confirmIdx - rocketIdx > window) continue;
        if (c.time < rocketT) continue;
        hits.push({
          direction: 'LONG',
          rocketIdx,
          confirmIdx,
          rocketT,
          confirmT: c.time,
          labelKo: '로켓→장바5봉',
        });
      }
    } else {
      const shortConfirms = [
        ...carts
          .filter((c) => c.direction === 'SHORT')
          .map((c) => ({ time: c.time, labelKo: '하락→번개·숏장바' })),
        ...bandShorts.map((b) => ({
          time: b.time,
          labelKo: '하락→번개5봉',
        })),
      ];
      for (const c of shortConfirms) {
        const confirmIdx = idxAtTime(candles, c.time);
        if (confirmIdx < rocketIdx || confirmIdx > closedIdx) continue;
        if (confirmIdx - rocketIdx > window) continue;
        if (c.time < rocketT) continue;
        hits.push({
          direction: 'SHORT',
          rocketIdx,
          confirmIdx,
          rocketT,
          confirmT: c.time,
          labelKo: c.labelKo,
        });
      }
    }
  }

  if (!hits.length) {
    return {
      candidate: null,
      probe: probeOut('신호B · 시퀀스대기(로켓→확인≤5봉)', emptyFilter(), symbol),
    };
  }

  hits.sort(
    (a, b) =>
      b.confirmT - a.confirmT ||
      b.rocketT - a.rocketT ||
      a.confirmIdx - b.confirmIdx
  );
  const best = hits[0]!;
  const direction = best.direction;
  const rb = candles[best.rocketIdx]!;
  const rocketLow = Number(rb.low);
  const rocketHigh = Number(rb.high);
  const confirmBar = candles[best.confirmIdx]!;
  const confirmClose = Number(confirmBar.close);

  const extensionOk =
    direction === 'LONG'
      ? confirmClose <= rocketLow + extK * atr
      : confirmClose >= rocketHigh - extK * atr;

  if (!extensionOk) {
    return {
      candidate: null,
      probe: probeOut(
        '신호B · 시퀀스확인·추격금지',
        emptyFilter({ seq: true }),
        symbol,
        {
          direction,
          rocketBarTime: best.rocketT,
          cartBarTime: best.confirmT,
        }
      ),
    };
  }

  let placeOk = false;
  try {
    const ch = buildMergedDeskBlueRedChannels(candles, tf);
    const geom = ch.geoms.find((g) => g.primary) ?? ch.geoms[0] ?? null;
    if (geom) {
      const gate = computeMergedDeskRbEdgeConfluenceGate({
        candles: candles.slice(0, n - 1),
        geom,
        masterSide: null,
      });
      const sfp =
        gate.sfp ?? detectRbRailSfp(candles.slice(0, n - 1), geom, atr);
      placeOk = rbScalpPlaceFastOk({
        placeRefOk: gate.placeRefOk === true,
        coreHitCount: gate.coreHitCount,
        entry,
        atr,
        tipUpper: geom.tipUpper,
        tipLower: geom.tipLower,
        hasSfp: Boolean(sfp),
        direction,
      });
    }
  } catch {
    placeOk = false;
  }
  if (!placeOk) {
    const pad = atr * 0.9;
    placeOk =
      direction === 'LONG'
        ? entry >= rocketLow - pad && entry <= rocketHigh + atr * extK
        : entry <= rocketHigh + pad && entry >= rocketLow - atr * extK;
  }

  const snap = params.snap ?? readAiZoneEntrySnapshot(symbol);
  let htfOk = true;
  if (snap) {
    const ev = aiZoneEvidenceGate({ direction, price: entry, snap });
    if (ev.conflictN > 0) htfOk = false;
  }

  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 40));
  const tpRoe = Math.max(5, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT) / 100;
  const tp = roeTargetPrice(entry, direction, lev, tpRoe);
  const hunt = resolveBtcRocketHuntSl({
    direction,
    rocketBar: { high: rocketHigh, low: rocketLow },
    atr,
    entry,
  });
  let sl = hunt.sl;
  const minRr = Math.max(1.2, Number(params.minRr) || 1.2);
  const reward = Math.abs(tp - entry);
  const maxRisk = reward / minRr;
  if (direction === 'LONG') {
    sl = Math.max(sl, entry - maxRisk);
    if (!(sl > 0) || !(sl < entry)) {
      return {
        candidate: null,
        probe: probeOut(
          '신호B · SL무효',
          emptyFilter({ seq: true, extensionOk: true, place: placeOk, htfOk }),
          symbol,
          {
            direction,
            rocketBarTime: best.rocketT,
            cartBarTime: best.confirmT,
          }
        ),
      };
    }
  } else {
    sl = Math.min(sl, entry + maxRisk);
    if (!(sl > entry)) {
      return {
        candidate: null,
        probe: probeOut(
          '신호B · SL무효',
          emptyFilter({ seq: true, extensionOk: true, place: placeOk, htfOk }),
          symbol,
          {
            direction,
            rocketBarTime: best.rocketT,
            cartBarTime: best.confirmT,
          }
        ),
      };
    }
  }

  const fee = aiZoneFeeRrGate({
    entry,
    sl,
    tp,
    direction,
    leverage: lev,
    minRr,
  });

  const filter = emptyFilter({
    place: placeOk,
    seq: true,
    fee: fee.ok === true,
    htfOk,
    extensionOk: true,
  });

  if (!htfOk) {
    return {
      candidate: null,
      probe: probeOut('신호B · 상위역행차단', filter, symbol, {
        direction,
        rocketBarTime: best.rocketT,
        cartBarTime: best.confirmT,
      }),
    };
  }
  if (!placeOk) {
    return {
      candidate: null,
      probe: probeOut('신호B · 자리미달', filter, symbol, {
        direction,
        rocketBarTime: best.rocketT,
        cartBarTime: best.confirmT,
      }),
    };
  }
  if (!fee.ok) {
    return {
      candidate: null,
      probe: probeOut(`신호B · ${fee.reasonKo || '수수료미달'}`, filter, symbol, {
        direction,
        rocketBarTime: best.rocketT,
        cartBarTime: best.confirmT,
      }),
    };
  }

  const signalId = `rkcart-${symbol}-${direction}-${Math.round(closedT)}`;
  const candidate: BtcRocketCartCandidate = {
    symbol,
    timeframe: BTC_ROCKET_CART_TF,
    direction,
    entry,
    sl,
    tp,
    score: Math.min(99, 62 + (best.confirmIdx === closedIdx ? 4 : 0)),
    signalKo: `신호B · ${best.labelKo} · ${direction} · ROE${(tpRoe * 100).toFixed(0)}%`,
    evidenceKo: `${hunt.reasonKo} · ${fee.reasonKo}`,
    source: BTC_ROCKET_CART_SOURCE,
    signalId,
    analysisTags: ['신호B', best.labelKo, '레이스', direction, symbol],
    closedBarTime: closedT,
    rocketBarTime: best.rocketT,
    cartBarTime: best.confirmT,
    netRoePct: fee.netRoePct,
    rr: fee.rr,
    waitingKo: '신호B · 조건충족',
    filter,
  };

  return {
    candidate,
    probe: {
      symbol,
      timeframe: BTC_ROCKET_CART_TF,
      slotKo: '신호B',
      ready: true,
      direction,
      waitingKo: candidate.waitingKo,
      filter,
      rocketBarTime: best.rocketT,
      cartBarTime: best.confirmT,
      updatedAt: Date.now(),
    },
  };
}
