/**
 * 마감·안착 — 돌파·안착·리테스트·거래량을 **캔들 본체 색**으로 표시 (카드/핀 문구 아님).
 */
/** ChartView `chartMonthDeskSettleCandlePaint`가 true일 때만 캔들 색·zone-reaction 핀 대체 */
export const MONTH_DESK_SETTLE_USE_CANDLE_PAINT = false;

import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import {
  buildSettleLevelProbes,
  evaluateSettleBreak,
  settleHoldBarsForTf,
  type SettleLevelProbe,
} from '@/lib/monthDeskSettleProbe';

export type MonthDeskSettleCandlePhase =
  | 'failed'
  | 'breakoutWeak'
  | 'breakout'
  | 'retest'
  | 'settling'
  | 'confirmed';

export type MonthDeskSettleCandleCell = {
  phase: MonthDeskSettleCandlePhase;
  bias: 'bullish' | 'bearish';
};

function phaseRank(p: MonthDeskSettleCandlePhase): number {
  switch (p) {
    case 'failed':
      return 0;
    case 'breakoutWeak':
      return 1;
    case 'breakout':
      return 2;
    case 'retest':
      return 3;
    case 'settling':
      return 4;
    case 'confirmed':
      return 5;
    default:
      return 0;
  }
}

function putCell(
  m: Map<number, MonthDeskSettleCandleCell>,
  candles: Candle[],
  idx: number,
  phase: MonthDeskSettleCandlePhase,
  bias: 'bullish' | 'bearish'
) {
  if (idx < 0 || idx >= candles.length) return;
  const t = Number(candles[idx]?.time);
  if (!Number.isFinite(t)) return;
  const cell: MonthDeskSettleCandleCell = {
    phase,
    bias,
  };
  const prev = m.get(t);
  if (!prev || phaseRank(phase) >= phaseRank(prev.phase)) {
    m.set(t, cell);
  }
}

function paintFromBreak(
  out: Map<number, MonthDeskSettleCandleCell>,
  candles: Candle[],
  snap: NonNullable<ReturnType<typeof evaluateSettleBreak>>
) {
  const bias: 'bullish' | 'bearish' = snap.probe.dir === 'above' ? 'bullish' : 'bearish';
  const bi = snap.breakIdx;
  const n = candles.length;

  if (snap.fakeBreak || snap.retest.violated || !snap.stillAbove) {
    putCell(out, candles, bi, 'failed', bias);
    for (let i = bi + 1; i < n; i++) putCell(out, candles, i, 'failed', bias);
    return;
  }

  putCell(out, candles, bi, snap.breakVolOk ? 'breakout' : 'breakoutWeak', bias);

  const holdNeed = snap.holdNeed ?? 2;
  for (let i = bi + 1; i < n; i++) {
    const eps = Math.max(Math.abs(snap.probe.level) * 0.00035, 1e-8);
    const cl = Number(candles[i]?.close);
    const ok =
      snap.probe.dir === 'above'
        ? cl >= snap.probe.level - eps
        : cl <= snap.probe.level + eps;
    if (!ok) {
      putCell(out, candles, i, 'failed', bias);
      continue;
    }
    if (snap.confirmIdx >= 0 && i === snap.confirmIdx) {
      putCell(out, candles, i, 'confirmed', bias);
    } else if (i === bi + 1) putCell(out, candles, i, 'settling', bias);
    else if (snap.holdN && snap.breakVolOk && i >= bi + holdNeed) {
      putCell(out, candles, i, 'confirmed', bias);
    } else putCell(out, candles, i, 'settling', bias);
  }

  if (snap.retest.retestIdx >= 0) {
    putCell(
      out,
      candles,
      snap.retest.retestIdx,
      snap.retest.violated ? 'failed' : 'retest',
      bias
    );
  }
}

function paintFromEngine(
  out: Map<number, MonthDeskSettleCandleCell>,
  candles: Candle[],
  sz: NonNullable<AnalyzeResponse['settlementZone']>
) {
  if (sz.direction !== 'LONG' && sz.direction !== 'SHORT') return;
  const bias: 'bullish' | 'bearish' = sz.direction === 'LONG' ? 'bullish' : 'bearish';
  const bi = typeof sz.breakIndex === 'number' ? sz.breakIndex : -1;
  const ri = typeof sz.retestIndex === 'number' ? sz.retestIndex : -1;
  const level = sz.level;
  if (bi < 0 || level == null || !Number.isFinite(level)) return;

  const probe: SettleLevelProbe = {
    key: 'engine',
    levelKo: '안착존',
    level,
    dir: bias === 'bullish' ? 'above' : 'below',
    weight: 100,
  };
  const snap = evaluateSettleBreak(candles, probe, { useLastBreak: true });
  if (snap) paintFromBreak(out, candles, snap);
  else {
    putCell(out, candles, bi, sz.state === 'failed' ? 'failed' : 'breakout', bias);
    if (ri >= 0) putCell(out, candles, ri, sz.state === 'failed' ? 'failed' : 'retest', bias);
    if (sz.state === 'confirmed') {
      for (let i = bi; i < candles.length; i++) {
        putCell(out, candles, i, i === bi ? 'breakout' : 'confirmed', bias);
      }
    }
  }
}

/** 차트 setData용 — 봉 time → 돌파·안착 단계 색 */
export function collectMonthDeskSettleCandlePaint(
  candles: Candle[],
  pack: OverlayItem[],
  analysis?: AnalyzeResponse | null,
  timeframe?: string
): Map<number, MonthDeskSettleCandleCell> {
  const out = new Map<number, MonthDeskSettleCandleCell>();
  if (candles.length < 4) return out;

  const evalOpts = {
    useLastBreak: true,
    holdBars: settleHoldBarsForTf(timeframe),
    timeframe,
  };

  const sz = analysis?.settlementZone;
  if (sz && sz.state !== 'none' && sz.level != null) {
    paintFromEngine(out, candles, sz);
  }

  let best: ReturnType<typeof evaluateSettleBreak> = null;
  let bestW = 0;
  for (const probe of buildSettleLevelProbes(pack)) {
    const snap = evaluateSettleBreak(candles, probe, evalOpts);
    if (!snap) continue;
    if (probe.weight > bestW) {
      bestW = probe.weight;
      best = snap;
    }
  }
  if (best) paintFromBreak(out, candles, best);

  return out;
}
