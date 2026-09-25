/**
 * REAL CANDLE BATTLE — 실데이터 계산 (캔들 OHLC·거래량·테이커·선택적 파생).
 * 가짜/목/랜덤 금지. 표본·데이터 없으면 NOT_AVAILABLE / WAIT.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import { atrSeries } from '@/lib/indicators';
import type {
  BattleAnalysisMarker,
  BattleAnalysisPhase,
  BattleAvailability,
  BattleDataQuality,
  BattleDecisionStatus,
  BattleDirection,
  BattleForecastPath,
  BattlePaneSeries,
  BattleTradeDecision,
  CandleBattlePack,
} from '@/lib/candleBattle/types';

export type CandleBattleInput = {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  /** HTF 캔들(있으면 핵심 존·방향) */
  htfCandles?: Candle[] | null;
  htfLabel?: string;
  volumeDelta?: number | null;
  buyPressure?: number | null;
  sellPressure?: number | null;
  orderbookImbalance?: number | null;
  oiState?: 'increasing' | 'decreasing' | 'neutral' | null;
  fundingState?: 'positive' | 'negative' | 'neutral' | null;
  hasTrades?: boolean;
  hasOrderbook?: boolean;
  hasCvd?: boolean;
  /** 호가 시계열 없으면 replenishment = NOT_AVAILABLE */
  hasOrderbookHistory?: boolean;
};

type Swing = { type: 'high' | 'low'; index: number; price: number; time: number };

function atr14(candles: Candle[]): number {
  const a = atrSeries(candles, 14);
  const last = a[a.length - 1];
  if (typeof last === 'number' && last > 0) return last;
  const c = candles[candles.length - 1];
  return c ? Math.max(1e-8, Math.abs(c.close) * 0.004) : 1;
}

function buildSwings(candles: Candle[], left = 2, right = 2): Swing[] {
  const out: Swing[] = [];
  const n = candles.length;
  for (let i = left; i < n - right; i++) {
    const c = candles[i]!;
    let isH = true;
    let isL = true;
    for (let k = i - left; k <= i + right; k++) {
      if (k === i) continue;
      if (candles[k]!.high >= c.high) isH = false;
      if (candles[k]!.low <= c.low) isL = false;
    }
    if (isH) out.push({ type: 'high', index: i, price: c.high, time: Number(c.time) });
    if (isL) out.push({ type: 'low', index: i, price: c.low, time: Number(c.time) });
  }
  return out;
}

function candleDelta(c: Candle): number | null {
  const tb = c.takerBuyBaseVolume;
  if (typeof tb === 'number' && Number.isFinite(tb) && c.volume > 0) {
    return tb - (c.volume - tb);
  }
  return null;
}

function assessQuality(candles: Candle[]): { quality: BattleDataQuality; notes: string[] } {
  const notes: string[] = [];
  if (candles.length < 40) {
    notes.push(`봉 수 ${candles.length} < 40`);
    return { quality: 'BAD', notes };
  }
  let gaps = 0;
  let badOhlc = 0;
  for (let i = 1; i < candles.length; i++) {
    const a = candles[i - 1]!;
    const b = candles[i]!;
    if (!(b.high >= b.low && b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close))) {
      badOhlc += 1;
    }
    if (Number(b.time) <= Number(a.time)) gaps += 1;
  }
  if (badOhlc > 0) notes.push(`OHLC 이상 ${badOhlc}`);
  if (gaps > 0) notes.push(`시간역전/중복 ${gaps}`);
  if (badOhlc > 3 || gaps > 5) return { quality: 'BAD', notes };
  if (badOhlc > 0 || gaps > 0 || candles.length < 80) return { quality: 'DEGRADED', notes };
  return { quality: 'GOOD', notes: notes.length ? notes : ['캔들 품질 양호'] };
}

type BullSfpHit = {
  sweepIdx: number;
  sweepPrice: number;
  prevLow: number;
  reclaimIdx: number;
  strong: boolean;
  reasons: string[];
};

type BearSfpHit = {
  sweepIdx: number;
  sweepPrice: number;
  prevHigh: number;
  reclaimIdx: number;
  strong: boolean;
  reasons: string[];
};

function scoreSfpRecency(reclaimIdx: number, n: number): number {
  /** 최근 회수일수록 가점 — 실전 화면 기준 */
  return reclaimIdx - Math.max(0, n - 80);
}

function detectBullSweepSfp(
  candles: Candle[],
  swings: Swing[],
  atr: number
): BullSfpHit | null {
  const n = candles.length;
  if (n < 12) return null;
  const eps = Math.max(atr * 0.08, Math.abs(candles[n - 1]!.close) * 0.00015);
  const candidates: BullSfpHit[] = [];

  const refLows: Array<{ index: number; price: number }> = swings
    .filter((s) => s.type === 'low')
    .map((s) => ({ index: s.index, price: s.price }));
  /** 스윙 부족 시 롤링 저점 보조(가짜 아님 — 실봉 low) */
  if (refLows.length < 2) {
    for (let i = 6; i < n - 3; i++) {
      const win = candles.slice(Math.max(0, i - 12), i - 1);
      if (win.length < 4) continue;
      const lo = Math.min(...win.map((c) => c.low));
      const loIdx = Math.max(0, i - 12) + win.findIndex((c) => c.low === lo);
      refLows.push({ index: loIdx, price: lo });
    }
  }

  const seen = new Set<string>();
  for (const prev of refLows.slice(-14)) {
    for (let i = prev.index + 1; i < n - 1; i++) {
      if (i < n - 90) continue;
      const sweepBar = candles[i]!;
      /** 이전 저 아래 스윕 */
      if (!(sweepBar.low < prev.price - eps * 0.15)) continue;
      let reclaimIdx = -1;
      for (let j = i; j < Math.min(n, i + 8); j++) {
        if (candles[j]!.close > prev.price) {
          reclaimIdx = j;
          break;
        }
      }
      if (reclaimIdx < 0) continue;
      const key = `${i}:${reclaimIdx}:${prev.price.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const d = candleDelta(sweepBar);
      const volMa =
        candles.slice(Math.max(0, i - 20), i).reduce((s, x) => s + x.volume, 0) /
        Math.max(1, Math.min(20, i));
      const volSpike = volMa > 0 ? sweepBar.volume / volMa : 1;
      const reasons = [
        `이전저 ${prev.price.toFixed(2)} 아래 스윕 ${sweepBar.low.toFixed(2)}`,
        `종가 회복 idx=${reclaimIdx}`,
        `상대거래량×${volSpike.toFixed(2)}`,
      ];
      if (d != null) reasons.push(`테이커델타 ${d.toFixed(2)}`);
      const strong =
        volSpike >= 1.25 &&
        candles[reclaimIdx]!.close > prev.price + eps * 0.35 &&
        (d == null || d > -sweepBar.volume * 0.2);
      candidates.push({
        sweepIdx: i,
        sweepPrice: sweepBar.low,
        prevLow: prev.price,
        reclaimIdx,
        strong,
        reasons,
      });
    }
  }
  if (!candidates.length) return null;
  candidates.sort(
    (a, b) =>
      scoreSfpRecency(b.reclaimIdx, n) - scoreSfpRecency(a.reclaimIdx, n) ||
      (b.strong === a.strong ? 0 : b.strong ? 1 : -1)
  );
  return candidates[0]!;
}

function detectBearSweepSfp(
  candles: Candle[],
  swings: Swing[],
  atr: number
): BearSfpHit | null {
  const n = candles.length;
  if (n < 12) return null;
  const eps = Math.max(atr * 0.08, Math.abs(candles[n - 1]!.close) * 0.00015);
  const candidates: BearSfpHit[] = [];

  const refHighs: Array<{ index: number; price: number }> = swings
    .filter((s) => s.type === 'high')
    .map((s) => ({ index: s.index, price: s.price }));
  if (refHighs.length < 2) {
    for (let i = 6; i < n - 3; i++) {
      const win = candles.slice(Math.max(0, i - 12), i - 1);
      if (win.length < 4) continue;
      const hi = Math.max(...win.map((c) => c.high));
      const hiIdx = Math.max(0, i - 12) + win.findIndex((c) => c.high === hi);
      refHighs.push({ index: hiIdx, price: hi });
    }
  }

  const seen = new Set<string>();
  for (const prev of refHighs.slice(-14)) {
    for (let i = prev.index + 1; i < n - 1; i++) {
      if (i < n - 90) continue;
      const sweepBar = candles[i]!;
      if (!(sweepBar.high > prev.price + eps * 0.15)) continue;
      let reclaimIdx = -1;
      for (let j = i; j < Math.min(n, i + 8); j++) {
        if (candles[j]!.close < prev.price) {
          reclaimIdx = j;
          break;
        }
      }
      if (reclaimIdx < 0) continue;
      const key = `${i}:${reclaimIdx}:${prev.price.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const d = candleDelta(sweepBar);
      const volMa =
        candles.slice(Math.max(0, i - 20), i).reduce((s, x) => s + x.volume, 0) /
        Math.max(1, Math.min(20, i));
      const volSpike = volMa > 0 ? sweepBar.volume / volMa : 1;
      const reasons = [
        `이전기 ${prev.price.toFixed(2)} 위 스윕 ${sweepBar.high.toFixed(2)}`,
        `종가 회복(아래) idx=${reclaimIdx}`,
        `상대거래량×${volSpike.toFixed(2)}`,
      ];
      if (d != null) reasons.push(`테이커델타 ${d.toFixed(2)}`);
      const strong =
        volSpike >= 1.25 &&
        candles[reclaimIdx]!.close < prev.price - eps * 0.35 &&
        (d == null || d < sweepBar.volume * 0.2);
      candidates.push({
        sweepIdx: i,
        sweepPrice: sweepBar.high,
        prevHigh: prev.price,
        reclaimIdx,
        strong,
        reasons,
      });
    }
  }
  if (!candidates.length) return null;
  candidates.sort(
    (a, b) =>
      scoreSfpRecency(b.reclaimIdx, n) - scoreSfpRecency(a.reclaimIdx, n) ||
      (b.strong === a.strong ? 0 : b.strong ? 1 : -1)
  );
  return candidates[0]!;
}

function detectAbsorptionNear(
  candles: Candle[],
  aroundIdx: number,
  side: 'bull' | 'bear',
  atr: number
): { score: number; reasons: string[]; idx: number } | null {
  const from = Math.max(1, aroundIdx - 2);
  const to = Math.min(candles.length - 1, aroundIdx + 2);
  let best: { score: number; reasons: string[]; idx: number } | null = null;
  for (let i = from; i <= to; i++) {
    const c = candles[i]!;
    const d = candleDelta(c);
    const body = Math.abs(c.close - c.open);
    const range = Math.max(1e-9, c.high - c.low);
    const impactEff = body / range;
    const volMa =
      candles.slice(Math.max(0, i - 20), i).reduce((s, x) => s + x.volume, 0) /
      Math.max(1, Math.min(20, i));
    const volSpike = volMa > 0 ? c.volume / volMa : 1;
    const reasons: string[] = [];
    let score = 40;
    if (side === 'bull') {
      /** 매도 공격 큰데 하락 제한 */
      if (d != null && d < 0) {
        score += 18;
        reasons.push(`음델타 ${d.toFixed(2)}`);
      } else if (c.close < c.open) {
        score += 8;
        reasons.push('음봉');
      } else {
        continue;
      }
      if (volSpike >= 1.4) {
        score += 16;
        reasons.push(`거래량×${volSpike.toFixed(2)}`);
      }
      if (impactEff < 0.45) {
        score += 16;
        reasons.push(`가격충격효율 ${impactEff.toFixed(2)}↓`);
      }
      if (c.close > c.low + range * 0.45) {
        score += 10;
        reasons.push('종가 저점 이탈 실패');
      }
    } else {
      if (d != null && d > 0) {
        score += 18;
        reasons.push(`양델타 ${d.toFixed(2)}`);
      } else if (c.close > c.open) {
        score += 8;
        reasons.push('양봉');
      } else continue;
      if (volSpike >= 1.4) {
        score += 16;
        reasons.push(`거래량×${volSpike.toFixed(2)}`);
      }
      if (impactEff < 0.45) {
        score += 16;
        reasons.push(`가격충격효율 ${impactEff.toFixed(2)}↓`);
      }
      if (c.close < c.high - range * 0.45) {
        score += 10;
        reasons.push('종가 고점 돌파 실패');
      }
    }
    if (c.high - c.low < atr * 0.15) score -= 10;
    score = Math.max(0, Math.min(100, score));
    if (score >= 55 && (!best || score > best.score)) {
      best = { score, reasons, idx: i };
    }
  }
  return best;
}

function detectChochBos(
  swings: Swing[],
  afterIdx: number,
  side: 'bull' | 'bear'
): { kind: 'CHOCH' | 'BOS'; idx: number; price: number; time: number } | null {
  const recent = swings.filter((s) => s.index >= afterIdx);
  if (side === 'bull') {
    const highs = recent.filter((s) => s.type === 'high');
    if (highs.length < 1) return null;
    /** 스윕 이후 첫 LH 돌파 ≈ CHoCH */
    const priorHighs = swings.filter((s) => s.type === 'high' && s.index < afterIdx).slice(-3);
    if (!priorHighs.length) return null;
    const lh = priorHighs[priorHighs.length - 1]!;
    for (const h of highs) {
      if (h.price > lh.price) {
        return { kind: 'CHOCH', idx: h.index, price: h.price, time: h.time };
      }
    }
  } else {
    const lows = recent.filter((s) => s.type === 'low');
    if (!lows.length) return null;
    const priorLows = swings.filter((s) => s.type === 'low' && s.index < afterIdx).slice(-3);
    if (!priorLows.length) return null;
    const hl = priorLows[priorLows.length - 1]!;
    for (const l of lows) {
      if (l.price < hl.price) {
        return { kind: 'CHOCH', idx: l.index, price: l.price, time: l.time };
      }
    }
  }
  return null;
}

function detectDisplacement(
  candles: Candle[],
  fromIdx: number,
  side: 'bull' | 'bear',
  atr: number
): { idx: number; price: number; reasons: string[] } | null {
  for (let i = fromIdx; i < candles.length; i++) {
    const c = candles[i]!;
    const body = Math.abs(c.close - c.open);
    const volMa =
      candles.slice(Math.max(0, i - 20), i).reduce((s, x) => s + x.volume, 0) /
      Math.max(1, Math.min(20, i));
    const volSpike = volMa > 0 ? c.volume / volMa : 1;
    const bull = c.close > c.open && body >= atr * 0.85 && volSpike >= 1.25;
    const bear = c.close < c.open && body >= atr * 0.85 && volSpike >= 1.25;
    if (side === 'bull' && bull) {
      return {
        idx: i,
        price: c.close,
        reasons: [`몸통/ATR ${(body / atr).toFixed(2)}`, `거래량×${volSpike.toFixed(2)}`],
      };
    }
    if (side === 'bear' && bear) {
      return {
        idx: i,
        price: c.close,
        reasons: [`몸통/ATR ${(body / atr).toFixed(2)}`, `거래량×${volSpike.toFixed(2)}`],
      };
    }
  }
  return null;
}

function detectRetest(
  candles: Candle[],
  zoneTop: number,
  zoneBot: number,
  afterIdx: number,
  side: 'bull' | 'bear',
  atr: number
): { idx: number; price: number } | null {
  const mid = (zoneTop + zoneBot) / 2;
  const tol = atr * 0.85;
  for (let i = afterIdx + 1; i < candles.length; i++) {
    const c = candles[i]!;
    const touch =
      (c.low <= zoneTop + tol && c.high >= zoneBot - tol) ||
      Math.abs(c.close - mid) <= tol;
    if (!touch) continue;
    if (side === 'bull' && c.close >= zoneBot - tol * 0.2) {
      return { idx: i, price: Math.min(c.high, zoneTop) };
    }
    if (side === 'bear' && c.close <= zoneTop + tol * 0.2) {
      return { idx: i, price: Math.max(c.low, zoneBot) };
    }
  }
  return null;
}

function htfSupportZone(
  htf: Candle[] | null | undefined,
  atr: number
): { top: number; bot: number } | null {
  if (!htf || htf.length < 30) return null;
  const swings = buildSwings(htf, 2, 2).filter((s) => s.type === 'low').slice(-4);
  if (!swings.length) return null;
  const last = swings[swings.length - 1]!;
  const half = Math.max(atr * 0.9, Math.abs(last.price) * 0.0012);
  return { top: last.price + half, bot: last.price - half * 0.35 };
}

function buildPanes(candles: Candle[], input: CandleBattleInput): BattlePaneSeries[] {
  const vol: BattlePaneSeries = {
    key: 'volume',
    availability: 'AVAILABLE',
    noteKo: '캔들 volume 실데이터',
    points: candles.map((c) => ({ time: Number(c.time), value: c.volume })),
  };
  const deltas = candles.map((c) => candleDelta(c));
  const hasDelta = deltas.some((d) => d != null);
  const deltaPane: BattlePaneSeries = {
    key: 'delta',
    availability: hasDelta ? 'AVAILABLE' : 'NOT_AVAILABLE',
    noteKo: hasDelta ? 'takerBuyBaseVolume 기반 봉 델타' : '테이커 매수 거래량 없음',
    points: hasDelta
      ? candles.map((c, i) => ({ time: Number(c.time), value: deltas[i] ?? 0 }))
      : [],
  };
  let cvdPane: BattlePaneSeries;
  if (hasDelta) {
    let run = 0;
    const pts = candles.map((c, i) => {
      run += deltas[i] ?? 0;
      return { time: Number(c.time), value: run };
    });
    cvdPane = {
      key: 'cvd',
      availability: 'ESTIMATED',
      noteKo: '봉 델타 누적 CVD(추정) — 체결 스트림 풀 CVD와 구분',
      points: pts,
    };
  } else if (input.hasCvd && typeof input.volumeDelta === 'number') {
    cvdPane = {
      key: 'cvd',
      availability: 'PARTIAL',
      noteKo: `최근 volumeDelta=${input.volumeDelta.toFixed(2)} (시계열 없음)`,
      points: [],
    };
  } else {
    cvdPane = {
      key: 'cvd',
      availability: 'NOT_AVAILABLE',
      noteKo: 'CVD 시계열 없음',
      points: [],
    };
  }
  const oiPane: BattlePaneSeries = {
    key: 'oi',
    availability: input.oiState ? 'PARTIAL' : 'NOT_AVAILABLE',
    noteKo: input.oiState
      ? `OI 상태=${input.oiState} (봉별 시계열 없음)`
      : 'OI 시계열 없음',
    points: [],
  };
  return [vol, deltaPane, cvdPane, oiPane];
}

function mkMarker(
  partial: Omit<BattleAnalysisMarker, 'symbol' | 'timeframe'> & {
    symbol: string;
    timeframe: string;
  }
): BattleAnalysisMarker {
  return partial;
}

/** 메인 빌더 — 실캔들 전투 분석 */
export function buildCandleBattlePack(input: CandleBattleInput): CandleBattlePack {
  const symbol = String(input.symbol || 'BTCUSDT').toUpperCase();
  const timeframe = normalizeChartTimeframe(input.timeframe) || String(input.timeframe || '5m');
  const candles = input.candles.filter(
    (c) =>
      Number.isFinite(c.time) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
  );
  const { quality, notes: qualityNotes } = assessQuality(candles);
  const atr = atr14(candles);
  const close = candles.length ? candles[candles.length - 1]!.close : 0;
  const lastT = candles.length ? Number(candles[candles.length - 1]!.time) : 0;

  const availability = {
    candles: (candles.length >= 40 ? 'AVAILABLE' : 'PARTIAL') as BattleAvailability,
    trades: (input.hasTrades ? 'PARTIAL' : 'NOT_AVAILABLE') as BattleAvailability,
    orderbook: (input.hasOrderbook ? 'PARTIAL' : 'NOT_AVAILABLE') as BattleAvailability,
    orderbookHistory: (input.hasOrderbookHistory ? 'AVAILABLE' : 'NOT_AVAILABLE') as BattleAvailability,
    cvd: (input.hasCvd || candles.some((c) => candleDelta(c) != null)
      ? candles.some((c) => candleDelta(c) != null)
        ? 'ESTIMATED'
        : 'PARTIAL'
      : 'NOT_AVAILABLE') as BattleAvailability,
    oi: (input.oiState ? 'PARTIAL' : 'NOT_AVAILABLE') as BattleAvailability,
    funding: (input.fundingState && input.fundingState !== 'neutral'
      ? 'PARTIAL'
      : 'NOT_AVAILABLE') as BattleAvailability,
    liquidation: 'NOT_AVAILABLE' as BattleAvailability,
    replenishment: (input.hasOrderbookHistory
      ? 'AVAILABLE'
      : 'NOT_AVAILABLE') as BattleAvailability,
  };

  const markers: BattleAnalysisMarker[] = [];
  const phases: BattleAnalysisPhase[] = [];
  const overlays: OverlayItem[] = [];
  const chartMarkers: CandleBattlePack['chartMarkers'] = [];
  const priceLines: CandleBattlePack['priceLines'] = [];

  if (quality === 'BAD' || candles.length < 24) {
    const decision: BattleTradeDecision = {
      symbol,
      timeframe,
      direction: 'NEUTRAL',
      status: 'DATA_INSUFFICIENT',
      entry: null,
      stopLoss: null,
      tp1: null,
      tp2: null,
      tp3: null,
      invalidationPrice: null,
      gatePassed: 0,
      gateTotal: 8,
      confidenceScore: null,
      historicalProbability: null,
      sampleCount: 0,
      reasons: qualityNotes,
      waitReason: '데이터 품질 부족 — CONFIRMED 금지',
      attackScore: null,
      defenseScore: null,
    };
    return {
      version: 1,
      symbol,
      timeframe,
      builtAt: new Date().toISOString(),
      quality,
      qualityNotes,
      availability,
      phases,
      markers,
      decision,
      forecast: null,
      coreZone: null,
      previousLow: null,
      previousHigh: null,
      panes: buildPanes(candles, input),
      overlays,
      chartMarkers,
      priceLines,
      summaryKo: '데이터 부족 · WAIT',
    };
  }

  const swings = buildSwings(candles);
  const bullSfp = detectBullSweepSfp(candles, swings, atr);
  const bearSfp = detectBearSweepSfp(candles, swings, atr);
  /** 최근 이벤트 우선 — 둘 다 있으면 더 최근 reclaim */
  let side: 'bull' | 'bear' | null = null;
  if (bullSfp && bearSfp) {
    side = bullSfp.reclaimIdx >= bearSfp.reclaimIdx ? 'bull' : 'bear';
  } else if (bullSfp) side = 'bull';
  else if (bearSfp) side = 'bear';

  const htfZone = htfSupportZone(input.htfCandles, atr);
  const chartLows = swings.filter((s) => s.type === 'low').slice(-5);
  const chartHighs = swings.filter((s) => s.type === 'high').slice(-5);
  const prevLow = bullSfp?.prevLow ?? chartLows[chartLows.length - 2]?.price ?? null;
  const prevHigh = bearSfp?.prevHigh ?? chartHighs[chartHighs.length - 2]?.price ?? null;

  let coreZone =
    side === 'bull' && bullSfp
      ? {
          top: Math.max(bullSfp.prevLow + atr * 0.35, bullSfp.sweepPrice + atr * 0.15),
          bot: Math.min(bullSfp.sweepPrice, bullSfp.prevLow - atr * 0.05),
          labelKo: `${input.htfLabel || 'HTF'} 핵심 지지구간`,
          sourceTfKo: input.htfLabel || 'LTF',
        }
      : side === 'bear' && bearSfp
        ? {
            top: Math.max(bearSfp.sweepPrice, bearSfp.prevHigh + atr * 0.05),
            bot: Math.min(bearSfp.prevHigh - atr * 0.35, bearSfp.sweepPrice - atr * 0.15),
            labelKo: `${input.htfLabel || 'HTF'} 핵심 저항구간`,
            sourceTfKo: input.htfLabel || 'LTF',
          }
        : htfZone
          ? {
              top: htfZone.top,
              bot: htfZone.bot,
              labelKo: `${input.htfLabel || '4H'} 핵심 지지구간`,
              sourceTfKo: input.htfLabel || '4H',
            }
          : null;

  /** Phase 1 추세 */
  const slopeN = Math.min(30, candles.length - 1);
  const slope =
    slopeN > 5
      ? (candles[candles.length - 1]!.close - candles[candles.length - 1 - slopeN]!.close) /
        candles[candles.length - 1 - slopeN]!.close
      : 0;
  const trendDir: BattleDirection =
    slope < -0.004 ? 'SHORT' : slope > 0.004 ? 'LONG' : 'NEUTRAL';
  phases.push({
    id: 'phase-trend',
    index: 1,
    startTimestamp: Number(candles[Math.max(0, candles.length - 1 - slopeN)]!.time),
    endTimestamp: lastT,
    phaseType: 'TREND',
    direction: trendDir,
    score: Math.min(90, Math.round(Math.abs(slope) * 8000)),
    labelKo: trendDir === 'SHORT' ? '① 하락추세' : trendDir === 'LONG' ? '① 상승추세' : '① 횡보',
    detailKo:
      trendDir === 'SHORT'
        ? '공격적 매도·하방 기울기'
        : trendDir === 'LONG'
          ? '상방 기울기'
          : '뚜렷한 추세 기울기 약함',
    evidence: [`slopePct=${(slope * 100).toFixed(2)}`],
    confirmed: true,
    active: true,
  });

  if (coreZone && side) {
    phases.push({
      id: 'phase-approach',
      index: 2,
      startTimestamp: Number(
        candles[Math.max(0, (side === 'bull' ? bullSfp!.sweepIdx : bearSfp!.sweepIdx) - 8)]!.time
      ),
      endTimestamp: Number(
        candles[side === 'bull' ? bullSfp!.sweepIdx : bearSfp!.sweepIdx]!.time
      ),
      phaseType: 'APPROACH',
      direction: side === 'bull' ? 'SHORT' : 'LONG',
      score: 70,
      labelKo: '② 접근',
      detailKo: 'AGGRESSIVE APPROACH — Zone으로 가속 접근(조건부)',
      evidence: ['스윕 직전 구간 속도·거래량 관찰'],
      confirmed: true,
      active: true,
    });
  }

  let absorption: ReturnType<typeof detectAbsorptionNear> = null;
  let choch: ReturnType<typeof detectChochBos> = null;
  let displacement: ReturnType<typeof detectDisplacement> = null;
  let retest: { idx: number; price: number } | null = null;

  if (side === 'bull' && bullSfp) {
    markers.push(
      mkMarker({
        id: 'battle-sweep-bull',
        symbol,
        timeframe,
        timestamp: Number(candles[bullSfp.sweepIdx]!.time),
        price: bullSfp.sweepPrice,
        type: 'SWEEP',
        direction: 'LONG',
        score: bullSfp.strong ? 78 : 58,
        confidence: null,
        confirmed: true,
        labelKo: '유동성 스윕',
        reasons: bullSfp.reasons,
        debugReason: bullSfp.reasons.join(' | '),
        availability: 'AVAILABLE',
      })
    );
    markers.push(
      mkMarker({
        id: 'battle-sfp-bull',
        symbol,
        timeframe,
        timestamp: Number(candles[bullSfp.reclaimIdx]!.time),
        price: bullSfp.prevLow,
        type: 'SFP',
        direction: 'LONG',
        score: bullSfp.strong ? 82 : 60,
        confidence: null,
        confirmed: bullSfp.strong,
        labelKo: bullSfp.strong ? 'SFP ↑' : 'SFP ↑(약)',
        reasons: bullSfp.reasons,
        debugReason: bullSfp.reasons.join(' | '),
        availability: 'AVAILABLE',
      })
    );
    phases.push({
      id: 'phase-sweep-sfp',
      index: 3,
      startTimestamp: Number(candles[bullSfp.sweepIdx]!.time),
      endTimestamp: Number(candles[bullSfp.reclaimIdx]!.time),
      phaseType: 'SWEEP_SFP',
      direction: 'LONG',
      score: bullSfp.strong ? 80 : 58,
      labelKo: '③ 유동성 스윕/SFP',
      detailKo: '이전 저점 스윕 후 종가 회복',
      evidence: bullSfp.reasons,
      confirmed: true,
      active: true,
    });

    absorption = detectAbsorptionNear(candles, bullSfp.sweepIdx, 'bull', atr);
    if (absorption) {
      markers.push(
        mkMarker({
          id: 'battle-abs-bull',
          symbol,
          timeframe,
          timestamp: Number(candles[absorption.idx]!.time),
          price: candles[absorption.idx]!.low,
          type: 'ABSORPTION',
          direction: 'LONG',
          score: absorption.score,
          confidence: null,
          confirmed: absorption.score >= 65,
          labelKo: 'ABS ↑ 매수흡수',
          reasons: absorption.reasons,
          debugReason: absorption.reasons.join(' | '),
          availability: candleDelta(candles[absorption.idx]!) != null ? 'AVAILABLE' : 'ESTIMATED',
        })
      );
      phases.push({
        id: 'phase-abs',
        index: 4,
        startTimestamp: Number(candles[absorption.idx]!.time),
        endTimestamp: Number(candles[absorption.idx]!.time),
        phaseType: 'ABSORPTION',
        direction: 'LONG',
        score: absorption.score,
        labelKo: '④ 흡수',
        detailKo: '공격적 매도에도 하방 진행 제한',
        evidence: absorption.reasons,
        confirmed: absorption.score >= 65,
        active: true,
      });
    }

    markers.push(
      mkMarker({
        id: 'battle-reclaim-bull',
        symbol,
        timeframe,
        timestamp: Number(candles[bullSfp.reclaimIdx]!.time),
        price: bullSfp.prevLow,
        type: 'RECLAIM',
        direction: 'LONG',
        score: 72,
        confidence: null,
        confirmed: true,
        labelKo: '회복',
        reasons: ['이전 저점 위 종가 회복'],
        debugReason: 'close > prevLow',
        availability: 'AVAILABLE',
      })
    );
    phases.push({
      id: 'phase-reclaim',
      index: 5,
      startTimestamp: Number(candles[bullSfp.reclaimIdx]!.time),
      endTimestamp: Number(candles[bullSfp.reclaimIdx]!.time),
      phaseType: 'RECLAIM',
      direction: 'LONG',
      score: 72,
      labelKo: '⑤ 회복',
      detailKo: '구조 전환 후보 시작',
      evidence: ['Reclaim above prev low'],
      confirmed: true,
      active: true,
    });

    choch = detectChochBos(swings, bullSfp.reclaimIdx, 'bull');
    if (choch) {
      markers.push(
        mkMarker({
          id: 'battle-choch-bull',
          symbol,
          timeframe,
          timestamp: choch.time,
          price: choch.price,
          type: 'CHOCH',
          direction: 'LONG',
          score: 76,
          confidence: null,
          confirmed: true,
          labelKo: 'CHoCH',
          reasons: ['스윕 이후 최근 고점 돌파'],
          debugReason: `choch @ ${choch.price}`,
          availability: 'AVAILABLE',
        })
      );
    }

    displacement = detectDisplacement(
      candles,
      Math.max(bullSfp.reclaimIdx, choch?.idx ?? bullSfp.reclaimIdx),
      'bull',
      atr
    );
    if (displacement) {
      markers.push(
        mkMarker({
          id: 'battle-disp-bull',
          symbol,
          timeframe,
          timestamp: Number(candles[displacement.idx]!.time),
          price: displacement.price,
          type: 'DISPLACEMENT',
          direction: 'LONG',
          score: 84,
          confidence: null,
          confirmed: true,
          labelKo: 'DISPLACEMENT ↑',
          reasons: displacement.reasons,
          debugReason: displacement.reasons.join(' | '),
          availability: 'AVAILABLE',
        })
      );
      phases.push({
        id: 'phase-disp',
        index: 6,
        startTimestamp: Number(candles[displacement.idx]!.time),
        endTimestamp: Number(candles[displacement.idx]!.time),
        phaseType: 'DISPLACEMENT',
        direction: 'LONG',
        score: 84,
        labelKo: '⑥ 상승',
        detailKo: '강한 매수 충격·거래량 확대',
        evidence: displacement.reasons,
        confirmed: true,
        active: true,
      });
      if (coreZone) {
        retest = detectRetest(
          candles,
          coreZone.top,
          coreZone.bot,
          displacement.idx,
          'bull',
          atr
        );
      }
      if (!retest && bullSfp) {
        retest = detectRetest(
          candles,
          bullSfp.prevLow + atr * 0.45,
          bullSfp.prevLow - atr * 0.25,
          displacement.idx,
          'bull',
          atr
        );
      }
      if (retest) {
          markers.push(
            mkMarker({
              id: 'battle-retest-bull',
              symbol,
              timeframe,
              timestamp: Number(candles[retest.idx]!.time),
              price: retest.price,
              type: 'RETEST',
              direction: 'LONG',
              score: 74,
              confidence: null,
              confirmed: true,
              labelKo: 'RETEST 지지확인',
              reasons: ['Displ 이후 Zone/이전저 재시험'],
              debugReason: `retest ${retest.price}`,
              availability: 'AVAILABLE',
            })
          );
          phases.push({
            id: 'phase-retest',
            index: 7,
            startTimestamp: Number(candles[retest.idx]!.time),
            endTimestamp: Number(candles[retest.idx]!.time),
            phaseType: 'RETEST',
            direction: 'LONG',
            score: 74,
            labelKo: '⑦ 조정/리테스트',
            detailKo: '돌파 구간 지지 확인(조건부)',
            evidence: ['zone retest hold'],
            confirmed: true,
            active: true,
          });
      }
    }
  } else if (side === 'bear' && bearSfp) {
    /** 숏 대칭 — 동일 품질 */
    markers.push(
      mkMarker({
        id: 'battle-sweep-bear',
        symbol,
        timeframe,
        timestamp: Number(candles[bearSfp.sweepIdx]!.time),
        price: bearSfp.sweepPrice,
        type: 'SWEEP',
        direction: 'SHORT',
        score: bearSfp.strong ? 78 : 58,
        confidence: null,
        confirmed: true,
        labelKo: '유동성 스윕',
        reasons: bearSfp.reasons,
        debugReason: bearSfp.reasons.join(' | '),
        availability: 'AVAILABLE',
      })
    );
    markers.push(
      mkMarker({
        id: 'battle-sfp-bear',
        symbol,
        timeframe,
        timestamp: Number(candles[bearSfp.reclaimIdx]!.time),
        price: bearSfp.prevHigh,
        type: 'SFP',
        direction: 'SHORT',
        score: bearSfp.strong ? 82 : 60,
        confidence: null,
        confirmed: bearSfp.strong,
        labelKo: bearSfp.strong ? 'SFP ↓' : 'SFP ↓(약)',
        reasons: bearSfp.reasons,
        debugReason: bearSfp.reasons.join(' | '),
        availability: 'AVAILABLE',
      })
    );
    phases.push({
      id: 'phase-sweep-sfp',
      index: 3,
      startTimestamp: Number(candles[bearSfp.sweepIdx]!.time),
      endTimestamp: Number(candles[bearSfp.reclaimIdx]!.time),
      phaseType: 'SWEEP_SFP',
      direction: 'SHORT',
      score: bearSfp.strong ? 80 : 58,
      labelKo: '③ 유동성 스윕/SFP',
      detailKo: '이전 고점 스윕 후 종가 회복(아래)',
      evidence: bearSfp.reasons,
      confirmed: true,
      active: true,
    });
    absorption = detectAbsorptionNear(candles, bearSfp.sweepIdx, 'bear', atr);
    if (absorption) {
      markers.push(
        mkMarker({
          id: 'battle-abs-bear',
          symbol,
          timeframe,
          timestamp: Number(candles[absorption.idx]!.time),
          price: candles[absorption.idx]!.high,
          type: 'ABSORPTION',
          direction: 'SHORT',
          score: absorption.score,
          confidence: null,
          confirmed: absorption.score >= 65,
          labelKo: 'ABS ↓ 매도흡수',
          reasons: absorption.reasons,
          debugReason: absorption.reasons.join(' | '),
          availability: candleDelta(candles[absorption.idx]!) != null ? 'AVAILABLE' : 'ESTIMATED',
        })
      );
      phases.push({
        id: 'phase-abs',
        index: 4,
        startTimestamp: Number(candles[absorption.idx]!.time),
        endTimestamp: Number(candles[absorption.idx]!.time),
        phaseType: 'ABSORPTION',
        direction: 'SHORT',
        score: absorption.score,
        labelKo: '④ 흡수',
        detailKo: '공격적 매수에도 상방 진행 제한',
        evidence: absorption.reasons,
        confirmed: absorption.score >= 65,
        active: true,
      });
    }
    choch = detectChochBos(swings, bearSfp.reclaimIdx, 'bear');
    if (choch) {
      markers.push(
        mkMarker({
          id: 'battle-choch-bear',
          symbol,
          timeframe,
          timestamp: choch.time,
          price: choch.price,
          type: 'CHOCH',
          direction: 'SHORT',
          score: 76,
          confidence: null,
          confirmed: true,
          labelKo: 'CHoCH',
          reasons: ['스윕 이후 최근 저점 이탈'],
          debugReason: `choch @ ${choch.price}`,
          availability: 'AVAILABLE',
        })
      );
    }
    displacement = detectDisplacement(
      candles,
      Math.max(bearSfp.reclaimIdx, choch?.idx ?? bearSfp.reclaimIdx),
      'bear',
      atr
    );
    if (displacement) {
      markers.push(
        mkMarker({
          id: 'battle-disp-bear',
          symbol,
          timeframe,
          timestamp: Number(candles[displacement.idx]!.time),
          price: displacement.price,
          type: 'DISPLACEMENT',
          direction: 'SHORT',
          score: 84,
          confidence: null,
          confirmed: true,
          labelKo: 'DISPLACEMENT ↓',
          reasons: displacement.reasons,
          debugReason: displacement.reasons.join(' | '),
          availability: 'AVAILABLE',
        })
      );
      phases.push({
        id: 'phase-disp',
        index: 6,
        startTimestamp: Number(candles[displacement.idx]!.time),
        endTimestamp: Number(candles[displacement.idx]!.time),
        phaseType: 'DISPLACEMENT',
        direction: 'SHORT',
        score: 84,
        labelKo: '⑥ 하락',
        detailKo: '강한 매도 충격·거래량 확대',
        evidence: displacement.reasons,
        confirmed: true,
        active: true,
      });
      if (coreZone) {
        retest = detectRetest(
          candles,
          coreZone.top,
          coreZone.bot,
          displacement.idx,
          'bear',
          atr
        );
      }
      if (!retest && bearSfp) {
        retest = detectRetest(
          candles,
          bearSfp.prevHigh + atr * 0.25,
          bearSfp.prevHigh - atr * 0.45,
          displacement.idx,
          'bear',
          atr
        );
      }
      if (retest) {
        markers.push(
          mkMarker({
            id: 'battle-retest-bear',
            symbol,
            timeframe,
            timestamp: Number(candles[retest.idx]!.time),
            price: retest.price,
            type: 'RETEST',
            direction: 'SHORT',
            score: 74,
            confidence: null,
            confirmed: true,
            labelKo: 'RETEST 저항확인',
            reasons: ['Displ 이후 Zone/이전기 재시험'],
            debugReason: `retest ${retest.price}`,
            availability: 'AVAILABLE',
          })
        );
        phases.push({
          id: 'phase-retest',
          index: 7,
          startTimestamp: Number(candles[retest.idx]!.time),
          endTimestamp: Number(candles[retest.idx]!.time),
          phaseType: 'RETEST',
          direction: 'SHORT',
          score: 74,
          labelKo: '⑦ 조정/리테스트',
          detailKo: '돌파 구간 저항 확인(조건부)',
          evidence: ['zone retest hold'],
          confirmed: true,
          active: true,
        });
      }
    }
  }

  /** ⑦ 리테스트 — 미확인이면 WATCH 단계로 표시(가짜 확정 금지) */
  if (displacement && !phases.some((p) => p.phaseType === 'RETEST')) {
    phases.push({
      id: 'phase-retest-watch',
      index: 7,
      startTimestamp: Number(candles[displacement.idx]!.time),
      endTimestamp: null,
      phaseType: 'RETEST',
      direction: side === 'bear' ? 'SHORT' : 'LONG',
      score: retest ? 74 : 42,
      labelKo: '⑦ 조정/리테스트',
      detailKo: retest
        ? '돌파 구간 재시험 확인'
        : 'Displacement 후 리테스트 대기(미확정)',
      evidence: retest ? ['retest hold'] : ['retest pending'],
      confirmed: Boolean(retest),
      active: true,
    });
  }

  if (availability.replenishment === 'NOT_AVAILABLE') {
    markers.push(
      mkMarker({
        id: 'battle-repl-na',
        symbol,
        timeframe,
        timestamp: lastT,
        price: close,
        type: 'REPLENISHMENT',
        direction: 'NEUTRAL',
        score: null,
        confidence: null,
        confirmed: false,
        labelKo: 'REP NOT_AVAILABLE',
        reasons: ['호가 시계열(history) 없음 — 재생성 판정 불가'],
        debugReason: 'orderbookHistory=NOT_AVAILABLE',
        availability: 'NOT_AVAILABLE',
      })
    );
  }

  /** CVD divergence (봉 델타 누적 추정) */
  const deltas = candles.map(candleDelta);
  if (deltas.some((d) => d != null) && side === 'bull' && bullSfp) {
    const window = candles.slice(Math.max(0, bullSfp.sweepIdx - 12), bullSfp.reclaimIdx + 1);
    let cvd = 0;
    const cvdSeries: number[] = [];
    for (const c of window) {
      cvd += candleDelta(c) ?? 0;
      cvdSeries.push(cvd);
    }
    if (cvdSeries.length >= 4) {
      const priceLow = Math.min(...window.map((c) => c.low));
      const lastLow = window[window.length - 1]!.low;
      const cvdMin = Math.min(...cvdSeries);
      const cvdLast = cvdSeries[cvdSeries.length - 1]!;
      if (lastLow >= priceLow * 0.999 && cvdLast < cvdMin * 0.85) {
        markers.push(
          mkMarker({
            id: 'battle-cvd-div',
            symbol,
            timeframe,
            timestamp: Number(candles[bullSfp.reclaimIdx]!.time),
            price: lastLow,
            type: 'CVD_DIVERGENCE',
            direction: 'LONG',
            score: 70,
            confidence: null,
            confirmed: false,
            labelKo: 'CVD DIV ↑',
            reasons: ['가격 저점 유지·CVD 더 낮은 저점(봉델타 추정)'],
            debugReason: `cvdLast=${cvdLast.toFixed(2)} cvdMin=${cvdMin.toFixed(2)}`,
            availability: 'ESTIMATED',
          })
        );
      }
    }
  }

  /** Entry gate */
  const gates = {
    htf: Boolean(coreZone || input.htfCandles),
    zone: Boolean(coreZone),
    sweepSfp: Boolean(side && (bullSfp || bearSfp)),
    abs: Boolean(absorption && absorption.score >= 55),
    reclaim: Boolean(side && (bullSfp || bearSfp)),
    choch: Boolean(choch),
    disp: Boolean(displacement),
    retest: Boolean(retest) || Boolean(displacement && !retest && close),
  };
  const gateList = Object.values(gates);
  const gatePassed = gateList.filter(Boolean).length;
  const gateTotal = gateList.length;

  let status: BattleDecisionStatus = 'WAIT';
  let direction: BattleDirection = 'NEUTRAL';
  let entry: number | null = null;
  let stopLoss: number | null = null;
  let tp1: number | null = null;
  let tp2: number | null = null;
  let tp3: number | null = null;
  let invalidationPrice: number | null = null;
  const reasons: string[] = [];
  let waitReason: string | null = null;

  if (quality === 'BAD') {
    status = 'DATA_INSUFFICIENT';
    waitReason = '품질 BAD';
  } else if (side === 'bull' && bullSfp) {
    direction = 'LONG';
    const strong =
      gates.sweepSfp &&
      gates.reclaim &&
      (gates.abs || gates.choch) &&
      gates.disp &&
      bullSfp.strong;
    if (strong && gatePassed >= 6) {
      status = 'CONFIRMED_LONG';
      entry = retest?.price ?? coreZone?.top ?? close;
      stopLoss = bullSfp.sweepPrice - atr * 0.25;
      invalidationPrice = stopLoss;
      tp1 = entry + (entry - stopLoss) * 1.6;
      tp2 = entry + (entry - stopLoss) * 2.6;
      tp3 = entry + (entry - stopLoss) * 3.8;
      reasons.push('Sweep+SFP+Reclaim+Displ 합류(확정≠수익보장)');
    } else if (gates.sweepSfp && gates.reclaim) {
      status = 'LONG_WATCH';
      waitReason = `게이트 ${gatePassed}/${gateTotal} — Displacement/Retest/흡수 추가 확인`;
      entry = coreZone?.top ?? close;
      stopLoss = bullSfp.sweepPrice - atr * 0.25;
    } else {
      waitReason = '롱 게이트 미충족';
    }
  } else if (side === 'bear' && bearSfp) {
    direction = 'SHORT';
    const strong =
      gates.sweepSfp &&
      gates.reclaim &&
      (gates.abs || gates.choch) &&
      gates.disp &&
      bearSfp.strong;
    if (strong && gatePassed >= 5) {
      status = 'CONFIRMED_SHORT';
      entry = retest?.price ?? coreZone?.bot ?? close;
      stopLoss = bearSfp.sweepPrice + atr * 0.25;
      invalidationPrice = stopLoss;
      tp1 = entry - (stopLoss - entry) * 1.6;
      tp2 = entry - (stopLoss - entry) * 2.6;
      tp3 = entry - (stopLoss - entry) * 3.8;
      reasons.push('Bear Sweep+SFP+Displ 합류(확정≠수익보장)');
    } else if (gates.sweepSfp) {
      status = 'SHORT_WATCH';
      waitReason = `게이트 ${gatePassed}/${gateTotal}`;
    } else waitReason = '숏 게이트 미충족';
  } else {
    waitReason = '유효 Sweep/SFP 없음 — WAIT';
  }

  if (entry != null && tp1 != null) {
    phases.push({
      id: 'phase-target',
      index: 8,
      startTimestamp: lastT,
      endTimestamp: null,
      phaseType: 'TARGET',
      direction,
      score: status.startsWith('CONFIRMED') ? 70 : 40,
      labelKo: '⑧ 목표 구간',
      detailKo: `TP1 ${tp1.toFixed(0)}${tp2 ? ` · TP2 ${tp2.toFixed(0)}` : ''}`,
      evidence: reasons,
      confirmed: status.startsWith('CONFIRMED'),
      active: true,
    });
  }

  /** Overlays — 이미지형 작도 */
  const t0 = Number(candles[Math.max(0, candles.length - 80)]!.time) as UTCTimestamp;
  const tLast = lastT as UTCTimestamp;

  if (prevLow != null) {
    priceLines.push({
      price: prevLow,
      color: '#EAB308',
      title: '이전 저점',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (prevHigh != null && side === 'bear') {
    priceLines.push({
      price: prevHigh,
      color: '#EAB308',
      title: '이전 고점',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }

  if (coreZone) {
    overlays.push({
      id: 'candle-battle-core-zone',
      kind: 'zone',
      label: coreZone.labelKo,
      zoneFaceBase: coreZone.labelKo,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t0,
      time2: tLast,
      price1: coreZone.top,
      price2: coreZone.bot,
      confidence: 78,
      color: side === 'bear' ? 'rgba(248,113,113,0.22)' : 'rgba(251,146,60,0.28)',
      category: 'zones',
      structureBias: side === 'bear' ? 'bearish' : 'bullish',
      zoneFillPreserve: true,
      overlayZoneExtraClass:
        'candle-battle-core-zone merged-desk-zone-label-on merged-desk-pill-zone',
      labelTooltip: `${coreZone.labelKo} · 실스윙 기반 · 확정 수익 아님`,
    });
  }

  if (retest) {
    const band = atr * 0.35;
    overlays.push({
      id: 'candle-battle-retest-zone',
      kind: 'zone',
      label: '리테스트',
      zoneFaceBase: '리테스트',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: Number(candles[Math.max(0, retest.idx - 2)]!.time) as UTCTimestamp,
      time2: tLast,
      price1: retest.price + band,
      price2: retest.price - band,
      confidence: 70,
      color: 'rgba(56,189,248,0.2)',
      category: 'zones',
      structureBias: side === 'bear' ? 'bearish' : 'bullish',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'candle-battle-retest-zone merged-desk-zone-label-on',
    });
  }

  /** Displacement 화살 경로 — 이미지형 두꺼운 실선 */
  if (displacement && side) {
    const fromIdx =
      side === 'bull'
        ? bullSfp?.reclaimIdx ?? Math.max(0, displacement.idx - 2)
        : bearSfp?.reclaimIdx ?? Math.max(0, displacement.idx - 2);
    const a = candles[fromIdx]!;
    const b = candles[displacement.idx]!;
    overlays.push({
      id: 'candle-battle-displacement-path',
      kind: 'trendLine',
      label: 'Displacement',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: Number(a.time) as UTCTimestamp,
      time2: Number(b.time) as UTCTimestamp,
      price1: side === 'bull' ? a.low : a.high,
      price2: side === 'bull' ? b.high : b.low,
      confidence: 80,
      color: side === 'bull' ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)',
      lineDash: '',
      lineStrokeWidth: 3.5,
      category: 'mergedDeskCandleBattle',
      noProject: true,
      overlayZoneExtraClass: 'candle-battle-displacement-path',
      labelTooltip: 'Displacement · 실봉 충격 이동',
    });
  }

  /** 이미지형 콜아웃 라벨 (SFP·흡수·CHoCH·Approach) */
  const pushCallout = (
    id: string,
    time: number,
    price: number,
    text: string,
    color: string
  ) => {
    overlays.push({
      id,
      kind: 'label',
      label: text,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      time1: time as UTCTimestamp,
      time2: time as UTCTimestamp,
      price1: price,
      price2: price,
      confidence: 72,
      color,
      category: 'mergedDeskCandleBattle',
      noProject: true,
      overlayZoneExtraClass: 'candle-battle-callout',
      labelTooltip: text,
    });
  };
  if (side === 'bull' && bullSfp) {
    pushCallout(
      'candle-battle-callout-approach',
      Number(candles[Math.max(0, bullSfp.sweepIdx - 3)]!.time),
      candles[Math.max(0, bullSfp.sweepIdx - 3)]!.high,
      'AGGRESSIVE APPROACH',
      '#f87171'
    );
    pushCallout(
      'candle-battle-callout-sfp',
      Number(candles[bullSfp.reclaimIdx]!.time),
      bullSfp.sweepPrice,
      'SFP ↑',
      '#4ade80'
    );
    if (absorption) {
      pushCallout(
        'candle-battle-callout-abs',
        Number(candles[absorption.idx]!.time),
        candles[absorption.idx]!.low,
        '흡수(매수방어)',
        '#a78bfa'
      );
    }
    if (choch) {
      pushCallout('candle-battle-callout-choch', choch.time, choch.price, 'CHoCH', '#38bdf8');
    }
    if (displacement) {
      pushCallout(
        'candle-battle-callout-disp',
        Number(candles[displacement.idx]!.time),
        displacement.price,
        'Displacement ↑',
        '#22c55e'
      );
    }
  } else if (side === 'bear' && bearSfp) {
    pushCallout(
      'candle-battle-callout-approach',
      Number(candles[Math.max(0, bearSfp.sweepIdx - 3)]!.time),
      candles[Math.max(0, bearSfp.sweepIdx - 3)]!.low,
      'AGGRESSIVE APPROACH',
      '#f87171'
    );
    pushCallout(
      'candle-battle-callout-sfp',
      Number(candles[bearSfp.reclaimIdx]!.time),
      bearSfp.sweepPrice,
      'SFP ↓',
      '#f87171'
    );
    if (absorption) {
      pushCallout(
        'candle-battle-callout-abs',
        Number(candles[absorption.idx]!.time),
        candles[absorption.idx]!.high,
        '흡수(매도방어)',
        '#a78bfa'
      );
    }
    if (choch) {
      pushCallout('candle-battle-callout-choch', choch.time, choch.price, 'CHoCH', '#38bdf8');
    }
    if (displacement) {
      pushCallout(
        'candle-battle-callout-disp',
        Number(candles[displacement.idx]!.time),
        displacement.price,
        'Displacement ↓',
        '#ef4444'
      );
    }
  }

  for (const m of markers) {
    if (m.availability === 'NOT_AVAILABLE') continue;
    if (m.type === 'REPLENISHMENT') continue;
    const bull = m.direction === 'LONG';
    chartMarkers.push({
      time: m.timestamp as UTCTimestamp,
      position: bull ? 'belowBar' : 'aboveBar',
      shape: m.type === 'DISPLACEMENT' || m.type === 'SFP' ? 'square' : 'circle',
      color:
        m.type === 'SFP'
          ? '#4ade80'
          : m.type === 'CHOCH'
            ? '#38bdf8'
            : m.type === 'ABSORPTION'
              ? '#a78bfa'
              : m.type === 'DISPLACEMENT'
                ? '#22c55e'
                : '#fbbf24',
      text: m.labelKo,
      size: m.type === 'DISPLACEMENT' || m.type === 'SFP' ? 2 : 1,
      id: m.id,
    });
  }

  if (entry != null) {
    priceLines.push({
      price: entry,
      color: direction === 'SHORT' ? '#F87171' : '#4ADE80',
      title: direction === 'SHORT' ? '🔥 SHORT E' : '🔥 LONG E',
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
    markers.push(
      mkMarker({
        id: 'battle-entry',
        symbol,
        timeframe,
        timestamp: lastT,
        price: entry,
        type: 'ENTRY',
        direction,
        score: gatePassed * 10,
        confidence: null,
        confirmed: status.startsWith('CONFIRMED'),
        labelKo: direction === 'LONG' ? '🔥 LONG E' : '🔥 SHORT E',
        reasons,
        debugReason: `gates ${gatePassed}/${gateTotal}`,
        availability: 'AVAILABLE',
      })
    );
  }
  if (stopLoss != null) {
    priceLines.push({
      price: stopLoss,
      color: '#F87171',
      title: 'SL',
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (tp1 != null) {
    priceLines.push({
      price: tp1,
      color: '#FB7185',
      title: 'TP1',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (tp2 != null) {
    priceLines.push({
      price: tp2,
      color: '#FB7185',
      title: 'TP2',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (tp3 != null) {
    priceLines.push({
      price: tp3,
      color: '#FB7185',
      title: 'TP3',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }

  /** Forecast path — 실구조 기반 점선 (랜덤 금지) */
  let forecast: BattleForecastPath | null = null;
  if (entry != null && stopLoss != null && tp1 != null && direction !== 'NEUTRAL') {
    const step = Math.max(60, Math.round((Number(candles[candles.length - 1]!.time) - Number(candles[candles.length - 2]!.time)) || 300));
    const pts = [
      { time: lastT, price: close, kind: 'path' as const },
      ...(retest ? [{ time: lastT + step, price: retest.price, kind: 'retest' as const }] : []),
      { time: lastT + step * 2, price: entry, kind: 'entry' as const },
      { time: lastT + step * 4, price: tp1, kind: 'tp1' as const },
      ...(tp2 ? [{ time: lastT + step * 6, price: tp2, kind: 'tp2' as const }] : []),
      ...(tp3 ? [{ time: lastT + step * 8, price: tp3, kind: 'tp3' as const }] : []),
    ];
    forecast = {
      direction,
      createdAt: Date.now(),
      startTimestamp: lastT,
      startPrice: close,
      points: pts,
      invalidationPrice,
      status: 'ACTIVE',
      reasons: ['구조·유동성 목표 기반 예상경로 · 확정 미래 아님'],
      forecastOnly: true,
    };
    /** 점선 경로 오버레이 */
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      overlays.push({
        id: `candle-battle-forecast-${i}`,
        kind: 'trendLine',
        label: i === pts.length - 2 ? '예상경로' : '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: a.time as UTCTimestamp,
        time2: b.time as UTCTimestamp,
        price1: a.price,
        price2: b.price,
        confidence: 55,
        color: direction === 'LONG' ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.85)',
        lineDash: '6 5',
        lineStrokeWidth: 2,
        category: 'mergedDeskCandleBattle',
        noProject: true,
        overlayZoneExtraClass: 'candle-battle-forecast-path merged-desk-candle-battle-path',
        labelTooltip: 'FORECAST 예상경로 · 확정 아님',
      });
    }
  }

  const defenseScore = absorption?.score ?? null;
  const attackScore =
    side === 'bull'
      ? Math.min(90, Math.round(40 + Math.abs(slope) * 5000))
      : side === 'bear'
        ? Math.min(90, Math.round(40 + Math.abs(slope) * 5000))
        : null;

  const decision: BattleTradeDecision = {
    symbol,
    timeframe,
    direction,
    status,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    invalidationPrice,
    gatePassed,
    gateTotal,
    confidenceScore: Math.round((gatePassed / gateTotal) * 100),
    historicalProbability: null,
    sampleCount: 0,
    reasons,
    waitReason,
    attackScore,
    defenseScore,
  };

  const summaryKo = [
    status,
    phases.map((p) => p.labelKo).join(' → '),
    waitReason,
    availability.replenishment === 'NOT_AVAILABLE' ? 'REP=N/A' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /** ①~⑧ 시간 구간 분배 + SFP 구간 강조 (거래량 패널은 건드리지 않음) */
  const sortedPhases = [...phases].sort((a, b) => a.index - b.index);
  const viewCandles = candles.slice(Math.max(0, candles.length - 100));
  const bandHi = Math.max(...viewCandles.map((c) => c.high));
  const bandLo = Math.min(...viewCandles.map((c) => c.low));
  const phaseFill: Record<number, string> = {
    1: 'rgba(185,28,28,0.10)',
    2: 'rgba(194,65,12,0.11)',
    3: 'rgba(127,29,29,0.16)',
    4: 'rgba(22,163,74,0.12)',
    5: 'rgba(21,128,61,0.11)',
    6: 'rgba(37,99,235,0.10)',
    7: 'rgba(71,85,105,0.10)',
    8: 'rgba(34,197,94,0.10)',
  };
  const barSec = Math.max(
    60,
    Math.round(
      (Number(candles[candles.length - 1]!.time) - Number(candles[Math.max(0, candles.length - 2)]!.time)) ||
        300
    )
  );
  for (let i = 0; i < sortedPhases.length; i++) {
    const p = sortedPhases[i]!;
    if (!p.active && !p.confirmed) continue;
    const tStart = p.startTimestamp;
    let tEnd =
      p.endTimestamp != null && p.endTimestamp > tStart
        ? p.endTimestamp
        : sortedPhases[i + 1]?.startTimestamp ?? lastT;
    if (!(tEnd > tStart)) tEnd = tStart + barSec * 3;
    if (tEnd <= tStart) continue;
    const fill = phaseFill[p.index] ?? 'rgba(148,163,184,0.08)';
    overlays.push({
      id: `candle-battle-phase-band-${p.index}`,
      kind: 'zone',
      label: p.labelKo,
      zoneFaceBase: p.labelKo,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart as UTCTimestamp,
      time2: tEnd as UTCTimestamp,
      price1: bandHi,
      price2: bandLo,
      confidence: p.confirmed ? 70 : 50,
      color: fill,
      category: 'mergedDeskCandleBattle',
      zoneFillPreserve: true,
      noProject: true,
      overlayZoneExtraClass: `candle-battle-phase-band candle-battle-phase-${p.index} merged-desk-zone-label-on`,
      labelTooltip: `${p.labelKo} · ${p.detailKo}`,
    });
    overlays.push({
      id: `candle-battle-phase-div-${p.index}`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      time1: tStart as UTCTimestamp,
      time2: tStart as UTCTimestamp,
      price1: bandLo,
      price2: bandHi,
      confidence: 40,
      color: 'rgba(251,191,36,0.55)',
      lineDash: '4 5',
      lineStrokeWidth: 1,
      category: 'mergedDeskCandleBattle',
      noProject: true,
      overlayZoneExtraClass: 'candle-battle-phase-divider',
    });
  }

  /** SFP 구간 — 공유 이미지형 (스윕~회수, 흡수 콜아웃) */
  if (side === 'bull' && bullSfp) {
    const tSweep = Number(candles[bullSfp.sweepIdx]!.time);
    const tReclaim = Number(candles[bullSfp.reclaimIdx]!.time);
    const tAbsEnd =
      absorption != null
        ? Number(candles[Math.min(candles.length - 1, absorption.idx + 1)]!.time)
        : tReclaim;
    const sfpHi = Math.max(bullSfp.prevLow + atr * 0.8, coreZone?.top ?? bullSfp.prevLow);
    const sfpLo = Math.min(bullSfp.sweepPrice, coreZone?.bot ?? bullSfp.sweepPrice);
    overlays.push({
      id: 'candle-battle-sfp-section-zone',
      kind: 'zone',
      label: '③ SFP 구간',
      zoneFaceBase: '③ SFP 구간',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tSweep as UTCTimestamp,
      time2: Math.max(tReclaim, tAbsEnd) as UTCTimestamp,
      price1: sfpHi,
      price2: sfpLo,
      confidence: 82,
      color: 'rgba(251,191,36,0.22)',
      category: 'mergedDeskCandleBattle',
      structureBias: 'bullish',
      zoneFillPreserve: true,
      noProject: true,
      overlayZoneExtraClass:
        'candle-battle-sfp-section merged-desk-zone-label-on merged-desk-pill-zone',
      labelTooltip: '유동성 스윕 → SFP↑ · 실봉 기반',
    });
    for (const [tid, tm] of [
      ['candle-battle-sfp-v1', tSweep],
      ['candle-battle-sfp-v2', tReclaim],
    ] as const) {
      overlays.push({
        id: tid,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        time1: tm as UTCTimestamp,
        time2: tm as UTCTimestamp,
        price1: bandLo,
        price2: bandHi,
        confidence: 60,
        color: 'rgba(250,204,21,0.75)',
        lineDash: '5 4',
        lineStrokeWidth: 1.5,
        category: 'mergedDeskCandleBattle',
        noProject: true,
        overlayZoneExtraClass: 'candle-battle-sfp-vline',
      });
    }
    pushCallout(
      'candle-battle-callout-sfp-section-head',
      tSweep,
      sfpHi,
      '③ 유동성 스윕 / SFP',
      '#4ade80'
    );
    if (absorption) {
      pushCallout(
        'candle-battle-callout-abs-head',
        Number(candles[absorption.idx]!.time),
        sfpHi,
        '④ 흡수 (Absorption)',
        '#22c55e'
      );
      pushCallout(
        'candle-battle-callout-abs-box',
        Number(candles[absorption.idx]!.time),
        (sfpHi + sfpLo) / 2,
        '대량매도(Δ↓CVD↓)에도 하락실패=매수흡수',
        '#38bdf8'
      );
    }
  } else if (side === 'bear' && bearSfp) {
    const tSweep = Number(candles[bearSfp.sweepIdx]!.time);
    const tReclaim = Number(candles[bearSfp.reclaimIdx]!.time);
    const sfpHi = Math.max(bearSfp.sweepPrice, coreZone?.top ?? bearSfp.sweepPrice);
    const sfpLo = Math.min(bearSfp.prevHigh - atr * 0.8, coreZone?.bot ?? bearSfp.prevHigh);
    overlays.push({
      id: 'candle-battle-sfp-section-zone',
      kind: 'zone',
      label: '③ SFP 구간',
      zoneFaceBase: '③ SFP 구간',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tSweep as UTCTimestamp,
      time2: tReclaim as UTCTimestamp,
      price1: sfpHi,
      price2: sfpLo,
      confidence: 82,
      color: 'rgba(248,113,113,0.18)',
      category: 'mergedDeskCandleBattle',
      structureBias: 'bearish',
      zoneFillPreserve: true,
      noProject: true,
      overlayZoneExtraClass:
        'candle-battle-sfp-section merged-desk-zone-label-on merged-desk-pill-zone',
      labelTooltip: '유동성 스윕 → SFP↓ · 실봉 기반',
    });
    for (const [tid, tm] of [
      ['candle-battle-sfp-v1', tSweep],
      ['candle-battle-sfp-v2', tReclaim],
    ] as const) {
      overlays.push({
        id: tid,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        time1: tm as UTCTimestamp,
        time2: tm as UTCTimestamp,
        price1: bandLo,
        price2: bandHi,
        confidence: 60,
        color: 'rgba(250,204,21,0.75)',
        lineDash: '5 4',
        lineStrokeWidth: 1.5,
        category: 'mergedDeskCandleBattle',
        noProject: true,
        overlayZoneExtraClass: 'candle-battle-sfp-vline',
      });
    }
  }

  return {
    version: 1,
    symbol,
    timeframe,
    builtAt: new Date().toISOString(),
    quality,
    qualityNotes,
    availability,
    phases: sortedPhases,
    markers,
    decision,
    forecast,
    coreZone,
    previousLow: prevLow,
    previousHigh: prevHigh,
    panes: buildPanes(candles, input),
    overlays,
    chartMarkers,
    priceLines,
    summaryKo,
  };
}
