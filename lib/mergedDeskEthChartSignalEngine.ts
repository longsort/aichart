/**
 * ETH 자동매매 — 차트에 뜨는 진입 신호 합류.
 * 장바구니(🛒/⚡) · 로켓 · LH번개(기관밴드) · 스윙 · SFP.
 * 폭락존 터치와 병행. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
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
import { detectRbRailSfp } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import { resolveAutoTradeTfHold } from '@/lib/doksuri1/autoTradeTfHoldScale';

/** 차트 신호 스캔 TF — 덤프존(1m~1M)보다 좁게 · 부하·정확도 균형 */
export const ETH_CHART_SIGNAL_SCAN_TFS = ['5m', '15m', '1h', '4h'] as const;

export type EthChartSignalKind =
  | 'cart'
  | 'rocket'
  | 'lh-band'
  | 'swing'
  | 'sfp';

export type EthChartSignalHit = {
  kind: EthChartSignalKind;
  direction: 'LONG' | 'SHORT';
  weight: number;
  labelKo: string;
  barTime: number;
};

export type EthChartSignalEntry = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  signalId: string;
  noteKo: string;
  score: number;
  hits: EthChartSignalHit[];
  closedBarTime: number;
  maxBars: number;
  tp1RoePct: number;
  tp2RoePct: number;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 8) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function recentSwingExtremes(
  candles: Candle[],
  lookback = 28
): { high: number; low: number; hh: boolean; ll: boolean } {
  const n = candles.length;
  const end = Math.max(2, n - 2);
  const start = Math.max(1, end - lookback);
  let high = -Infinity;
  let low = Infinity;
  let midHigh = -Infinity;
  let midLow = Infinity;
  const mid = Math.floor((start + end) / 2);
  for (let i = start; i < end; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    if (h > high) high = h;
    if (l < low && l > 0) low = l;
    if (i < mid) {
      if (h > midHigh) midHigh = h;
      if (l < midLow && l > 0) midLow = l;
    }
  }
  const lateHigh = high;
  const lateLow = low;
  const hh = lateHigh >= midHigh;
  const ll = lateLow <= midLow;
  if (!(high > 0) || !(low > 0)) {
    const c = Number(candles[n - 2]?.close) || 1;
    return { high: c * 1.01, low: c * 0.99, hh: false, ll: false };
  }
  return { high, low, hh, ll };
}

/** 스윙 스윕→회수 SFP (채널 없을 때) */
function detectPivotSfp(
  candles: Candle[],
  atr: number
): { side: 'bull' | 'bear'; price: number; time: number } | null {
  const n = candles.length;
  if (n < 16 || !(atr > 0)) return null;
  const eps = atr * 0.1;
  const closed = candles[n - 2]!;
  const closedT = Number(closed.time) || 0;
  /** 최근 스윙 저/고 */
  let swingLow = Infinity;
  let swingHigh = -Infinity;
  for (let i = Math.max(2, n - 30); i < n - 3; i++) {
    const lo = Number(candles[i]!.low);
    const hi = Number(candles[i]!.high);
    let isLow = true;
    let isHigh = true;
    for (let k = i - 2; k <= i + 2; k++) {
      if (k === i) continue;
      if (Number(candles[k]!.low) < lo) isLow = false;
      if (Number(candles[k]!.high) > hi) isHigh = false;
    }
    if (isLow && lo < swingLow) swingLow = lo;
    if (isHigh && hi > swingHigh) swingHigh = hi;
  }
  if (!(swingLow < Infinity) || !(swingHigh > 0)) return null;

  const look = Math.min(5, n - 2);
  for (let k = 1; k <= look; k++) {
    const c = candles[n - 1 - k]!;
    const t = Number(c.time) || closedT;
    if (c.low < swingLow - eps * 0.2 && c.close > swingLow) {
      return { side: 'bull', price: swingLow, time: t };
    }
    if (c.high > swingHigh + eps * 0.2 && c.close < swingHigh) {
      return { side: 'bear', price: swingHigh, time: t };
    }
  }
  return null;
}

/**
 * 단일 TF 마감봉 기준 — 차트 신호 합류 스캔.
 * 점수 ≥4 + 방향 과반 시 진입 후보.
 */
export function scanEthChartSignalsOnClosedBar(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  leverage?: number;
  minRr?: number;
  /** 최소 합류 점수 (기본 4) */
  minScore?: number;
}): EthChartSignalEntry | null {
  const candles = params.candles;
  const n = candles.length;
  if (n < 36) return null;
  const tf = normalizeChartTimeframe(params.timeframe);
  const closed = candles[n - 2]!;
  const closePx = Number(closed.close);
  const closedT = Number(closed.time) || 0;
  if (!(closePx > 0) || !(closedT > 0)) return null;

  const atr = atrApprox(candles);
  const hits: EthChartSignalHit[] = [];

  /** 1) 장바구니 롱숏 — leading confirmed/strong */
  try {
    const keyZones = detectMergedAnalysisKeyZones(candles, tf);
    const criticalZones = detectMergedCriticalZones({ candles, timeframe: tf, keyZones });
    const leading = scanMergedLeadingCandleSignals({
      candles,
      timeframe: tf,
      keyZones,
      criticalZones,
    });
    const onClosed = leading.filter(
      (s) =>
        (s.tier === 'confirmed' || s.tier === 'strong') &&
        (s.time === closedT ||
          s.time === Number(candles[n - 3]?.time) ||
          s.time === Number(candles[n - 1]?.time))
    );
    const pick = onClosed.sort((a, b) => {
      const r = (t: string) => (t === 'confirmed' ? 3 : 2);
      return r(b.tier) - r(a.tier) || b.gatesPass - a.gatesPass;
    })[0];
    if (pick) {
      hits.push({
        kind: 'cart',
        direction: pick.direction,
        weight: pick.tier === 'confirmed' ? 3 : 2,
        labelKo:
          pick.direction === 'LONG'
            ? pick.tier === 'confirmed'
              ? '🛒장바구니롱'
              : '장바구니롱강'
            : pick.tier === 'confirmed'
              ? '⚡숏신호'
              : '하락그래프숏',
        barTime: pick.time,
      });
    }
  } catch {
    /* zone/leading 실패 시 스킵 */
  }

  /** 2) 로켓 / 하락그래프(숏 로켓) */
  try {
    const rockets = buildMergedDeskChartTfStructureRockets(candles, tf);
    const onBar = rockets.filter(
      (r) =>
        r.time === closedT ||
        r.time === Number(candles[n - 3]?.time) ||
        r.time === Number(candles[n - 1]?.time)
    );
    const rk = onBar[onBar.length - 1];
    if (rk && (rk.direction === 'LONG' || rk.direction === 'SHORT')) {
      hits.push({
        kind: 'rocket',
        direction: rk.direction,
        weight: 2,
        labelKo: rk.direction === 'LONG' ? '🚀로켓롱' : '📉하락그래프숏',
        barTime: rk.time,
      });
    }
  } catch {
    /* ignore */
  }

  /** 3) 기관밴드 LH★ / SH◆ 번개 */
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
    const recentMarks = marks.filter(
      (m) =>
        m.time === closedT ||
        m.time === Number(candles[n - 3]?.time) ||
        m.time === Number(candles[n - 1]?.time)
    );
    const best = recentMarks.sort((a, b) => {
      const g = (x: typeof a) =>
        (x.confluence?.grade === 'S' ? 4 : 0) + (x.tier === 'A' ? 3 : x.tier === 'B' ? 2 : 1);
      return g(b) - g(a) || b.score - a.score;
    })[0];
    if (best) {
      const sGrade = best.confluence?.grade === 'S';
      hits.push({
        kind: 'lh-band',
        direction: best.verdict,
        weight: sGrade ? 3 : best.tier === 'A' ? 3 : 2,
        labelKo:
          best.verdict === 'LONG'
            ? sGrade
              ? '⚡LH★기관지지'
              : `LH★기관지지${best.tier}`
            : sGrade
              ? '⚡SH◆기관저항'
              : `SH◆기관저항${best.tier}`,
        barTime: best.time,
      });
    }
  } catch {
    /* ignore */
  }

  /** 4) SFP — 채널 레일 우선, 없으면 피벗 스윕 */
  try {
    let sfp: { side: 'bull' | 'bear'; price: number; time: number } | null = null;
    try {
      const gs = buildMergedDeskBlueRedChannels(candles, tf).geoms;
      const geom = gs.find((g) => g.primary) ?? gs[0] ?? null;
      if (geom && atr > 0) {
        sfp = detectRbRailSfp(candles.slice(0, n - 1), geom, atr);
      }
    } catch {
      sfp = null;
    }
    if (!sfp) sfp = detectPivotSfp(candles, atr);
    if (sfp) {
      const dir: 'LONG' | 'SHORT' = sfp.side === 'bull' ? 'LONG' : 'SHORT';
      hits.push({
        kind: 'sfp',
        direction: dir,
        weight: 2,
        labelKo: dir === 'LONG' ? 'SFP↑스윕회수' : 'SFP↓스윕회수',
        barTime: sfp.time,
      });
    }
  } catch {
    /* ignore */
  }

  /** 5) 스윙 구조 바이어스 */
  try {
    const sw = recentSwingExtremes(candles);
    const mid = (sw.high + sw.low) / 2;
    let dir: 'LONG' | 'SHORT' | null = null;
    if (sw.hh && !sw.ll && closePx >= mid) dir = 'LONG';
    else if (sw.ll && !sw.hh && closePx <= mid) dir = 'SHORT';
    else if (closePx > mid * 1.002 && sw.hh) dir = 'LONG';
    else if (closePx < mid * 0.998 && sw.ll) dir = 'SHORT';
    if (dir) {
      hits.push({
        kind: 'swing',
        direction: dir,
        weight: 2,
        labelKo: dir === 'LONG' ? '스윙HL상승' : '스윙LH하락',
        barTime: closedT,
      });
    }
  } catch {
    /* ignore */
  }

  if (hits.length < 1) return null;

  let longW = 0;
  let shortW = 0;
  for (const h of hits) {
    if (h.direction === 'LONG') longW += h.weight;
    else shortW += h.weight;
  }
  const direction: 'LONG' | 'SHORT' | null =
    longW > shortW && longW >= (params.minScore ?? 3)
      ? 'LONG'
      : shortW > longW && shortW >= (params.minScore ?? 3)
        ? 'SHORT'
        : null;
  if (!direction) return null;

  const agree = hits.filter((h) => h.direction === direction);
  if (agree.length < 1) return null;
  /** 단독 약신호 금지 — 합류 2종 이상 또는 고가중(≥3) 1종 */
  const maxW = Math.max(...agree.map((h) => h.weight));
  if (agree.length < 2 && maxW < 3) return null;

  const score = direction === 'LONG' ? longW : shortW;
  const sw = recentSwingExtremes(candles);
  const lev = Math.max(1, Math.min(125, params.leverage ?? 10));
  const hold = resolveAutoTradeTfHold(tf);
  const tp1 = roeTargetPrice(closePx, direction, lev, hold.tp1RoePct / 100);
  const tp2 = roeTargetPrice(closePx, direction, lev, hold.tp2RoePct / 100);
  const reward = Math.abs(tp1 - closePx);
  const minRr = Math.max(1, params.minRr ?? 1.2);
  if (!(reward > 0)) return null;
  const maxRisk = reward / minRr;
  let sl: number;
  if (direction === 'LONG') {
    const floor = Math.min(sw.low - atr * 0.08, closePx - atr * 0.35);
    sl = Math.max(floor, closePx - maxRisk);
    if (!(sl > 0) || !(sl < closePx)) return null;
  } else {
    const ceil = Math.max(sw.high + atr * 0.08, closePx + atr * 0.35);
    sl = Math.min(ceil, closePx + maxRisk);
    if (!(sl > closePx)) return null;
  }
  const risk = Math.abs(closePx - sl);
  if (!(risk > 0) || reward / risk < minRr * 0.98) return null;

  const kinds = [...new Set(agree.map((h) => h.kind))].join('+');
  const labels = agree.map((h) => h.labelKo).slice(0, 4).join('·');
  const signalId = `ethchart-${params.symbol}-${tf}-${direction}-${closedT}-${kinds}`;

  return {
    symbol: params.symbol.toUpperCase(),
    timeframe: tf,
    direction,
    entry: closePx,
    sl,
    tp1,
    tp2,
    signalId,
    noteKo: `ETH차트신호 · ${labels} · 점수${score}`,
    score,
    hits: agree,
    closedBarTime: closedT,
    maxBars: hold.maxBars,
    tp1RoePct: hold.tp1RoePct,
    tp2RoePct: hold.tp2RoePct,
  };
}

export function listEthChartSignalScanTimeframes(): string[] {
  return [...ETH_CHART_SIGNAL_SCAN_TFS];
}
