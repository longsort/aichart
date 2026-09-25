import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { mergedDeskLastCandleZoneTimes } from '@/lib/mergedAnalysisOverlayTimes';
import { computeTradePlan } from '@/lib/tradePlanner';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';

function simpleAtr(candles: Candle[], period: number): number {
  const n = candles.length;
  if (n < 2) return 0;
  let sum = 0;
  let count = 0;
  const start = Math.max(1, n - period);
  for (let i = start; i < n; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
    count++;
  }
  return count > 0 ? sum / count : candles[n - 1].high - candles[n - 1].low;
}

function firstIdxAtOrAfter(candles: Candle[], t: number): number {
  for (let i = 0; i < candles.length; i++) {
    if (Number(candles[i].time) >= t) return i;
  }
  return Math.max(0, candles.length - 1);
}

function toRatio(price: number, min: number, max: number) {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

function fmtPx(p: number): string {
  if (!Number.isFinite(p)) return '—';
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(2);
  if (a >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

/**
 * 통합 고급 완전판: 스윙 타점을 **리스크 밴드(SL~진입) + 수익 밴드(진입~TP1) + 진입 포켓 + 수평 키**로 병합.
 * `lsSignalPlan` 우선, 없으면 verdict LONG/SHORT + `computeTradePlan`. 참고용(비권유·비보장).
 */
export function buildMergedAdvancedSwingFusionPack(params: {
  analysis: AnalyzeResponse | null;
  candles: Candle[];
  timeframe: string;
}): OverlayItem[] {
  const { analysis, candles, timeframe } = params;
  if (!analysis) return [];
  const safe = sanitizeChartCandlesForSeries(candles, timeframe);
  if (safe.length < 8) return [];

  let dir: 'LONG' | 'SHORT' | null = null;
  let entry: number;
  let stop: number;
  let targets: number[] = [];
  let rr = 0;
  let note = '';

  const lp = analysis.lsSignalPlan;
  if (lp && (lp.direction === 'LONG' || lp.direction === 'SHORT')) {
    dir = lp.direction;
    entry = Number(lp.entry);
    stop = Number(lp.stopLoss);
    targets = [...lp.targets].map(Number);
    rr = Number(lp.rr) || 0;
    note = lp.structureNote ? `lsSignalPlan · ${lp.structureNote}` : 'lsSignalPlan';
  } else {
    const v = analysis.verdict;
    if (v !== 'LONG' && v !== 'SHORT') return [];
    const last = safe[safe.length - 1];
    const span = Math.min(48, Math.max(14, Math.floor(safe.length * 0.14)));
    const recentSlice = safe.slice(-span);
    const rh = Math.max(...recentSlice.map((c) => c.high));
    const rl = Math.min(...recentSlice.map((c) => c.low));
    const eq = (rh + rl) / 2;
    const atr = simpleAtr(safe, 14);
    const tp = computeTradePlan({
      signal: v,
      currentPrice: last.close,
      equilibrium: eq,
      rangeHigh: rh,
      rangeLow: rl,
      atr: Number.isFinite(atr) && atr > 0 ? atr : last.close * 0.01,
      timeframe,
    });
    dir = v;
    entry = tp.entry;
    stop = tp.stopLoss;
    targets = [...tp.targets];
    rr = tp.rr;
    note = 'verdict·computeTradePlan';
  }

  if (!dir || !Number.isFinite(entry) || !Number.isFinite(stop)) return [];
  const t1 = targets[0];
  const t2 = targets[1];
  const t3 = targets[2];
  if (!Number.isFinite(t1)) return [];

  const last = safe[safe.length - 1];
  const { t1: tStart, t2: tEnd } = mergedDeskLastCandleZoneTimes(safe, timeframe);

  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of safe) {
    pMin = Math.min(pMin, c.low);
    pMax = Math.max(pMax, c.high);
  }
  if (!Number.isFinite(pMin) || !Number.isFinite(pMax) || pMax <= pMin) return [];

  const atr = simpleAtr(safe, 14);
  const atrUse = Number.isFinite(atr) && atr > 0 ? atr : Math.max(Math.abs(last.high - last.low), last.close * 0.002);

  /** x1/x2 비율은 mapOverlays 폴백에 쓰이면 좌측 과거로 튐 — time1~time2만 사용 */
  const x1 = 0;
  const x2 = 1;

  const tipBase = `${dir === 'LONG' ? '롱' : '숏'} · ${note} · RR≈${rr}`;

  const out: OverlayItem[] = [];

  if (dir === 'LONG') {
    const riskLo = Math.min(entry, stop);
    const riskHi = Math.max(entry, stop);
    out.push({
      id: 'merged-swing-fusion-risk',
      kind: 'demandZone',
      label: '스윙·리스크(SL~진입)',
      x1,
      y1: toRatio(Math.max(riskLo, riskHi), pMin, pMax),
      x2,
      y2: toRatio(Math.min(riskLo, riskHi), pMin, pMax),
      time1: tStart,
      time2: tEnd,
      price1: riskHi,
      price2: riskLo,
      confidence: 86,
      color: 'rgba(244,63,94,0.13)',
      category: 'zones',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'overlay-zone--merged-swing-fusion',
      labelTooltip: `${tipBase} · 손절~진입 구간`,
    });
    const rewLo = Math.min(entry, t1);
    const rewHi = Math.max(entry, t1);
    out.push({
      id: 'merged-swing-fusion-reward-tp1',
      kind: 'demandZone',
      label: '스윙·수익(진입~TP1)',
      x1,
      y1: toRatio(Math.max(rewLo, rewHi), pMin, pMax),
      x2,
      y2: toRatio(Math.min(rewLo, rewHi), pMin, pMax),
      time1: tStart,
      time2: tEnd,
      price1: rewHi,
      price2: rewLo,
      confidence: 84,
      color: 'rgba(34,197,94,0.11)',
      category: 'zones',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'overlay-zone--merged-swing-fusion',
      labelTooltip: `${tipBase} · 1차 목표권`,
    });
  } else {
    const riskLo = Math.min(entry, stop);
    const riskHi = Math.max(entry, stop);
    out.push({
      id: 'merged-swing-fusion-risk',
      kind: 'supplyZone',
      label: '스윙·리스크(진입~SL)',
      x1,
      y1: toRatio(Math.max(riskLo, riskHi), pMin, pMax),
      x2,
      y2: toRatio(Math.min(riskLo, riskHi), pMin, pMax),
      time1: tStart,
      time2: tEnd,
      price1: riskHi,
      price2: riskLo,
      confidence: 86,
      color: 'rgba(244,63,94,0.13)',
      category: 'zones',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'overlay-zone--merged-swing-fusion',
      labelTooltip: `${tipBase} · 진입~손절 구간`,
    });
    const rewLo = Math.min(entry, t1);
    const rewHi = Math.max(entry, t1);
    out.push({
      id: 'merged-swing-fusion-reward-tp1',
      kind: 'supplyZone',
      label: '스윙·수익(TP1~진입)',
      x1,
      y1: toRatio(Math.max(rewLo, rewHi), pMin, pMax),
      x2,
      y2: toRatio(Math.min(rewLo, rewHi), pMin, pMax),
      time1: tStart,
      time2: tEnd,
      price1: rewHi,
      price2: rewLo,
      confidence: 84,
      color: 'rgba(34,197,94,0.11)',
      category: 'zones',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'overlay-zone--merged-swing-fusion',
      labelTooltip: `${tipBase} · 1차 목표권`,
    });
  }

  if (Number.isFinite(t2) && Number.isFinite(t3) && t2 !== t1 && t3 !== t2) {
    const extLo = dir === 'LONG' ? Math.min(t1, t3) : Math.min(t1, t3);
    const extHi = dir === 'LONG' ? Math.max(t1, t3) : Math.max(t1, t3);
    out.push({
      id: 'merged-swing-fusion-reward-ext',
      kind: dir === 'LONG' ? 'demandZone' : 'supplyZone',
      label: '스윙·확장(TP1~TP3)',
      x1,
      y1: toRatio(Math.max(extLo, extHi), pMin, pMax),
      x2,
      y2: toRatio(Math.min(extLo, extHi), pMin, pMax),
      time1: tStart,
      time2: tEnd,
      price1: extHi,
      price2: extLo,
      confidence: 58,
      color: 'rgba(52,211,153,0.06)',
      category: 'zones',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'overlay-zone--merged-swing-fusion overlay-zone--merged-swing-fusion-ext',
      labelTooltip: `${tipBase} · 다차 목표(참고)`,
    });
  }

  const pocket = atrUse * 0.055;
  const pkLo = entry - pocket;
  const pkHi = entry + pocket;
  out.push({
    id: 'merged-swing-fusion-entry-pocket',
    kind: dir === 'LONG' ? 'demandZone' : 'supplyZone',
    label: '진입 포켓',
    x1,
    y1: toRatio(Math.max(pkLo, pkHi), pMin, pMax),
    x2,
    y2: toRatio(Math.min(pkLo, pkHi), pMin, pMax),
    time1: tStart,
    time2: tEnd,
    price1: pkHi,
    price2: pkLo,
    confidence: 72,
    color: 'rgba(250,204,21,0.09)',
    category: 'zones',
    zoneFillPreserve: true,
    overlayZoneExtraClass: 'overlay-zone--merged-swing-fusion',
    labelTooltip: tipBase,
  });

  const line = (
    idSuffix: string,
    label: string,
    price: number,
    color: string,
    dash?: string,
  ): OverlayItem => ({
    id: `merged-swing-fusion-${idSuffix}`,
    kind: 'keyLevel',
    label,
    x1,
    y1: toRatio(price, pMin, pMax),
    x2,
    y2: toRatio(price, pMin, pMax),
    time1: tStart,
    time2: tEnd,
    price1: price,
    price2: price,
    confidence: 91,
    color,
    lineLabelColor: '#f8fafc',
    category: 'keyLevel',
    lineDash: dash,
    labelTooltip: tipBase,
  });

  out.push(line('entry', `스윙 진입 ${fmtPx(entry)}`, entry, 'rgba(250,204,21,0.95)'));
  out.push(line('sl', `스윙 SL ${fmtPx(stop)}`, stop, 'rgba(248,113,113,0.92)', '5 5'));
  out.push(line('tp1', `TP1 ${fmtPx(t1)}`, t1, 'rgba(74,222,128,0.9)'));
  if (Number.isFinite(t2)) out.push(line('tp2', `TP2 ${fmtPx(t2!)}`, t2!, 'rgba(52,211,153,0.72)', '3 6'));
  if (Number.isFinite(t3)) out.push(line('tp3', `TP3 ${fmtPx(t3!)}`, t3!, 'rgba(16,185,129,0.55)', '2 8'));

  return out;
}
