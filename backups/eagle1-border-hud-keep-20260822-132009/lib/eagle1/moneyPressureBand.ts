/**
 * 파랑/빨강 띠 — 기존 채널 엔진은 유지.
 * 단순 가격 Band가 아니라 Live Money Pressure(추정)로 두께·투명도·표시 여부를 조절한다.
 * 투자자 신원을 "기관"으로 확정하지 않는다. 없는 파생값은 만들지 않는다.
 */
import type { Candle, OverlayItem } from '@/types';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';

type PressureBar = {
  time?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  takerBuyBaseVolume?: number;
};

function asCandle(c: PressureBar): Candle {
  return {
    time: Number(c.time) || 0,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: Number(c.volume) || 0,
    takerBuyBaseVolume: c.takerBuyBaseVolume,
  };
}

export type Eagle1MoneyPressureState =
  | 'STRONG_BUY'
  | 'PERSISTENT_BUY'
  | 'BUY_ABSORPTION'
  | 'BREAKOUT_BUY'
  | 'CHASE_BUY'
  | 'NEUTRAL'
  | 'CHASE_SELL'
  | 'BREAKDOWN_SELL'
  | 'SELL_ABSORPTION'
  | 'PERSISTENT_SELL'
  | 'STRONG_SELL';

export const EAGLE1_MONEY_PRESSURE_KO: Record<Eagle1MoneyPressureState, string> = {
  STRONG_BUY: '강한매수',
  PERSISTENT_BUY: '꾸준한매수',
  BUY_ABSORPTION: '매도흡수',
  BREAKOUT_BUY: '돌파매수',
  CHASE_BUY: '추격매수',
  NEUTRAL: '중립',
  CHASE_SELL: '추격매도',
  BREAKDOWN_SELL: '돌파매도',
  SELL_ABSORPTION: '매수흡수',
  PERSISTENT_SELL: '꾸준한매도',
  STRONG_SELL: '강한매도',
};

export type Eagle1MoneyPressureLive = {
  buyPressure?: number | null;
  sellPressure?: number | null;
  volumeDelta?: number | null;
  orderbookImbalance?: number | null;
  has_cvd?: boolean;
  has_orderbook?: boolean;
  has_trades?: boolean;
  oiState?: 'increasing' | 'decreasing' | 'neutral' | null;
  spreadBps?: number | null;
  bidQty?: number | null;
  askQty?: number | null;
  ofi?: number | null;
  has_ofi?: boolean;
  markPrice?: number | null;
  indexPrice?: number | null;
  has_mark?: boolean;
  has_index?: boolean;
  ofi10s?: Array<{ t: number; buyQty: number; sellQty: number; ofi: number }>;
  ofi30s?: Array<{ t: number; buyQty: number; sellQty: number; ofi: number }>;
  replenishBid?: number | null;
  replenishAsk?: number | null;
  replenishScore?: number | null;
  bookSeriesPoints?: number;
  liqAccel?: boolean | null;
  liqSeriesPoints?: number;
};

export type Eagle1MoneyPressure = {
  state: Eagle1MoneyPressureState;
  stateKo: string;
  score: number;
  buyShare: number;
  sellShare: number;
  ret: number;
  absorbed: boolean;
  evidence: 'taker' | 'closePos' | 'live' | '혼합';
  note: string;
};

function atr14(candles: PressureBar[]): number {
  const end = candles.length - 1;
  if (end < 1) return Math.abs(Number(candles[end]?.close) || 1) * 0.01;
  let sum = 0;
  let n = 0;
  const start = Math.max(1, end - 13);
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n += 1;
  }
  return n > 0 ? sum / n : Math.abs(Number(candles[end]!.close) || 1) * 0.01;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function computeMoneyPressure(
  candles: PressureBar[],
  live?: Eagle1MoneyPressureLive | null
): Eagle1MoneyPressure {
  const n = candles.length;
  if (n < 8) {
    return {
      state: 'NEUTRAL',
      stateKo: EAGLE1_MONEY_PRESSURE_KO.NEUTRAL,
      score: 0,
      buyShare: 0,
      sellShare: 0,
      ret: 0,
      absorbed: false,
      evidence: 'closePos',
      note: '데이터 없음',
    };
  }
  const win = candles.slice(-12);
  let buy = 0;
  let sell = 0;
  let takerBars = 0;
  for (const c of win) {
    const s = estimateBarBuySell(asCandle(c));
    buy += s.buyVol;
    sell += s.sellVol;
    if (s.source === 'taker') takerBars += 1;
  }
  const tot = buy + sell;
  const buyShare = tot > 0 ? buy / tot : 0.5;
  const sellShare = 1 - buyShare;
  const first = Number(win[0]!.close);
  const last = Number(win[win.length - 1]!.close);
  const ret = first > 0 ? (last - first) / first : 0;
  const lastBar = win[win.length - 1]!;
  const winHigh = Math.max(...win.map((c) => c.high));
  const winLow = Math.min(...win.map((c) => c.low));

  let liveBias = 0;
  let usedLive = false;
  const bp = live?.buyPressure;
  const sp = live?.sellPressure;
  if (
    live &&
    !(bp === 0.5 && sp === 0.5) &&
    typeof bp === 'number' &&
    typeof sp === 'number' &&
    Number.isFinite(bp) &&
    Number.isFinite(sp)
  ) {
    liveBias += (bp - sp) * 18;
    usedLive = true;
  }
  if (live?.has_orderbook && typeof live.orderbookImbalance === 'number' && Number.isFinite(live.orderbookImbalance)) {
    liveBias += clamp(live.orderbookImbalance, -1, 1) * 12;
    usedLive = true;
  }
  if (live?.has_cvd && typeof live.volumeDelta === 'number' && Number.isFinite(live.volumeDelta) && live.volumeDelta !== 0) {
    liveBias += clamp(live.volumeDelta / Math.max(1, tot), -1, 1) * 10;
    usedLive = true;
  }

  const buyAbs = sellShare >= 0.62 && ret > -0.0018;
  const sellAbs = buyShare >= 0.62 && ret < 0.0018;
  const chaseBuy = ret >= 0.012 && buyShare >= 0.56;
  const chaseSell = ret <= -0.012 && sellShare >= 0.56;
  const breakoutBuy = lastBar.close >= winHigh * 0.998 && buyShare >= 0.55 && ret > 0;
  const breakdownSell = lastBar.close <= winLow * 1.002 && sellShare >= 0.55 && ret < 0;
  const strongBuy = buyShare >= 0.68 && ret >= 0.0035;
  const strongSell = sellShare >= 0.68 && ret <= -0.0035;
  const persistBuy = buyShare >= 0.56 && ret >= 0;
  const persistSell = sellShare >= 0.56 && ret <= 0;

  let state: Eagle1MoneyPressureState = 'NEUTRAL';
  if (buyAbs) state = 'BUY_ABSORPTION';
  else if (sellAbs) state = 'SELL_ABSORPTION';
  else if (chaseBuy) state = 'CHASE_BUY';
  else if (chaseSell) state = 'CHASE_SELL';
  else if (breakoutBuy) state = 'BREAKOUT_BUY';
  else if (breakdownSell) state = 'BREAKDOWN_SELL';
  else if (strongBuy) state = 'STRONG_BUY';
  else if (strongSell) state = 'STRONG_SELL';
  else if (persistBuy) state = 'PERSISTENT_BUY';
  else if (persistSell) state = 'PERSISTENT_SELL';

  if (liveBias > 8 && (state === 'NEUTRAL' || state === 'PERSISTENT_BUY')) state = 'PERSISTENT_BUY';
  if (liveBias < -8 && (state === 'NEUTRAL' || state === 'PERSISTENT_SELL')) state = 'PERSISTENT_SELL';

  const directional = buyShare - 0.5;
  const score = clamp(Math.round(Math.abs(directional) * 140 + Math.abs(ret) * 1800 + Math.abs(liveBias)), 0, 100);

  const evidence: Eagle1MoneyPressure['evidence'] =
    takerBars >= 4 && usedLive ? '혼합' : takerBars >= 4 ? 'taker' : usedLive ? 'live' : 'closePos';
  const note =
    evidence === 'closePos'
      ? '체결분류 추정 · 신원 확인 아님'
      : live?.has_cvd
        ? '체결+파생 추정 · 신원 확인 아님'
        : '체결 추정 · CVD 데이터 없음';

  return {
    state,
    stateKo: EAGLE1_MONEY_PRESSURE_KO[state],
    score,
    buyShare,
    sellShare,
    ret,
    absorbed: buyAbs || sellAbs,
    evidence,
    note,
  };
}

function rgbaAlpha(color: string | undefined, alpha: number): string {
  const src = String(color || '');
  const m = src.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${clamp(alpha, 0.08, 0.55).toFixed(2)})`;
  return src;
}

function bandPrices(o: OverlayItem): { lo: number; hi: number; mid: number } | null {
  const cb = o.channelBand;
  if (cb) {
    const hi = Math.max(cb.priceHigh1, cb.priceHigh2);
    const lo = Math.min(cb.priceLow1, cb.priceLow2);
    if (!(hi > lo)) return null;
    return { lo, hi, mid: (hi + lo) / 2 };
  }
  const a = Number(o.price1);
  const b = Number(o.price2);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { lo: Math.min(a, b), hi: Math.max(a, b), mid: (a + b) / 2 };
}

function isRbDraw(o: OverlayItem): boolean {
  const id = String(o.id || '');
  if (/^merged-desk-rb-(short|long|fb)-(band|upper|lower|mid)$/.test(id)) return true;
  const extra = String(o.overlayZoneExtraClass || '');
  return (
    o.kind === 'channelBand' &&
    (extra.includes('merged-desk-rb-channel') || extra.includes('merged-desk-blue-red-channel'))
  );
}

function rbPrefix(id: string): string {
  return String(id || '').replace(/-(upper|lower|mid|band)$/i, '');
}

function isHtf(id: string): boolean {
  return id.includes('-long-');
}

/**
 * 현재가 근처 중요 띠만 남기고, 강도에 따라 투명도를 조절한다.
 * 약/중/강 스택 박스는 건드리지 않는다(그건 기존 GRADE 필터).
 */
export function applyMoneyPressureToRbOverlays(
  overlays: OverlayItem[],
  candles: Candle[],
  live?: Eagle1MoneyPressureLive | null
): OverlayItem[] {
  if (!overlays.length) return overlays;
  const close = Number(candles[candles.length - 1]?.close);
  if (!(close > 0)) return overlays;
  const atr = atr14(candles);
  const pressure = computeMoneyPressure(candles, live);
  const near = atr * 2.8;
  const alpha = 0.12 + (pressure.score / 100) * 0.3;

  const rb = overlays.filter(isRbDraw);
  const rest = overlays.filter((o) => !isRbDraw(o));
  if (!rb.length) return overlays;

  const bandFaces = rb.filter((o) => o.kind === 'channelBand');
  const ranked = bandFaces
    .map((o) => {
      const px = bandPrices(o);
      if (!px) return null;
      const contains = close >= px.lo && close <= px.hi;
      const dist = Math.abs(px.mid - close);
      const extra = String(o.overlayZoneExtraClass || '');
      const primary = extra.includes('merged-desk-rb-primary');
      return { o, contains, dist, primary, htf: isHtf(String(o.id || '')) };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.dist - b.dist);
  const nearOnes = ranked.filter((x) => x.contains || x.dist <= near);
  const keepBands: OverlayItem[] = [];
  const activeNear = nearOnes.filter((x) => !x.htf);
  const htfNear = nearOnes.filter((x) => x.htf);
  if (activeNear[0]) keepBands.push(activeNear[0].o);
  if (htfNear[0]) keepBands.push(htfNear[0].o);

  const keepPrefixes = new Set(keepBands.map((o) => rbPrefix(String(o.id || ''))));
  const intensityKo = pressure.score >= 70 ? '압력 강함' : pressure.score >= 40 ? '압력 보통' : '압력 약함';
  const compact = EAGLE1_MONEY_PRESSURE_KO[pressure.state];
  const painted = rb
    .filter((o) => {
      if (o.kind === 'channelBand') return keepBands.includes(o);
      return keepPrefixes.has(rbPrefix(String(o.id || '')));
    })
    .map((o) => {
      const extra = `${String(o.overlayZoneExtraClass || '')} eagle1-money-pressure`.replace(/\s+/g, ' ').trim();
      if (o.kind !== 'channelBand') {
        return { ...o, overlayZoneExtraClass: extra, labelTooltip: pressure.note };
      }
      const sellish =
        pressure.state.includes('SELL') || pressure.state === 'BREAKDOWN_SELL';
      return {
        ...o,
        color: rgbaAlpha(String(o.color), alpha),
        overlayZoneExtraClass: extra,
        label: compact,
        zoneFaceBase: compact,
        zoneFaceSignal: pressure.note,
        labelTooltip: `${compact} · ${intensityKo} · ${pressure.note}`,
        structureBias: sellish ? 'bearish' : pressure.state === 'NEUTRAL' ? o.structureBias : 'bullish',
      };
    });

  return [...rest, ...painted];
}

export function isPracticalRbPressureBand(params: {
  id?: string;
  kind?: string;
  extraClass?: string;
  label?: string;
}): boolean {
  const id = String(params.id || '');
  const blob = `${id} ${params.extraClass || ''} ${params.label || ''}`;
  if (/rail-bounce|초강력|약반등|중하락|강반등/.test(blob)) return false;
  if (/^merged-desk-rb-(short|long|fb)-(band|upper|lower|mid)$/.test(id)) return true;
  return (
    params.kind === 'channelBand' &&
    /merged-desk-rb-|merged-desk-blue-red-channel|eagle1-money-pressure/.test(blob)
  );
}

export function moneyFlowSide(
  state: Eagle1MoneyPressureState | null | undefined
): 'long' | 'short' | 'chase' | 'neutral' {
  if (!state || state === 'NEUTRAL') return 'neutral';
  if (state === 'CHASE_BUY' || state === 'CHASE_SELL') return 'chase';
  if (
    state === 'STRONG_BUY' ||
    state === 'PERSISTENT_BUY' ||
    state === 'BUY_ABSORPTION' ||
    state === 'BREAKOUT_BUY'
  ) {
    return 'long';
  }
  if (
    state === 'STRONG_SELL' ||
    state === 'PERSISTENT_SELL' ||
    state === 'SELL_ABSORPTION' ||
    state === 'BREAKDOWN_SELL'
  ) {
    return 'short';
  }
  return 'neutral';
}

export function moneyPressureShellKo(p: Eagle1MoneyPressure | null | undefined): string {
  if (!p || p.note === '데이터 없음') return '데이터 없음';
  const src =
    p.evidence === 'taker' || p.evidence === '혼합' ? '체결 추정' : p.evidence === 'live' ? '실시간 추정' : '캔들 추정';
  return `${p.stateKo} · ${src}`;
}
