/**
 * 통합·분석 — Mirage TV 고급 캔들 zone (전 TF 1m~1M).
 * OB(장악형 n캔·SMC BOS), HVP/LVP(거래량 프로파일), 피벗 wick S/R.
 * 교육·구조 참고용 — 확정 수익·투자 권유 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  detectCandleAnalysisAutoOrderBlocks,
  computeCandleAnalysisVpLevelCenters,
  type DetectedAutoOb,
} from '@/lib/candleAnalysisAutoOverlays';
import { detectSmcStructureOrderBlocks, isObBrokenByClose } from '@/lib/smcStructureOrderBlocks';
import { collectSwingPivots } from '@/lib/mergedDeskCandleTrendline';
import { snapMergedOverlayTimeToCandles } from '@/lib/mergedAnalysisOverlayTimes';

const OB_BULL = 'rgba(251,146,60,0.22)';
const OB_BEAR = 'rgba(244,63,94,0.20)';
const SMC_OB_BULL = 'rgba(16,185,129,0.20)';
const SMC_OB_BEAR = 'rgba(225,29,72,0.18)';
const HVP_ZONE = 'rgba(45,212,191,0.16)';
const LVP_ZONE = 'rgba(248,113,113,0.14)';
const SR_LINE_RES = 'rgba(217,70,239,0.88)';
const SR_LINE_SUP = 'rgba(96,165,250,0.88)';

function snapT(candles: Candle[], t: number): number {
  return Number(snapMergedOverlayTimeToCandles(t, candles));
}

function tvZone(params: {
  id: string;
  caption: string;
  t1: number;
  t2: number;
  top: number;
  bot: number;
  color: string;
  extraClass: string;
}): OverlayItem {
  return {
    id: params.id,
    kind: 'zone',
    label: params.caption,
    labelTooltip: params.caption,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: params.t1 as UTCTimestamp,
    time2: params.t2 as UTCTimestamp,
    price1: params.top,
    price2: params.bot,
    confidence: 0.76,
    color: params.color,
    category: 'mirageLSP',
    zoneFillPreserve: true,
    zoneSpanOnly: false,
    overlayZoneExtraClass: `${params.extraClass} merged-ares-mlsp-tv-zone-face`,
  };
}

function tvHorizSr(params: {
  id: string;
  caption: string;
  t1: number;
  t2: number;
  price: number;
  color: string;
  extraClass: string;
}): OverlayItem {
  return {
    id: params.id,
    kind: 'trendLine',
    label: params.caption,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: params.t1 as UTCTimestamp,
    price1: params.price,
    time2: params.t2 as UTCTimestamp,
    price2: params.price,
    confidence: 0.8,
    color: params.color,
    lineDash: '4 3',
    lineStrokeWidth: 1.25,
    category: 'mirageLSP',
    overlayZoneExtraClass: `${params.extraClass} merged-ares-mlsp-tv-sr-line merged-desk-candle-trend`,
    noProject: true,
    lineLabelColor: params.color,
    labelTextColor: params.color,
  };
}

function buildEngulfingObZones(
  candles: Candle[],
  lastTime: number
): OverlayItem[] {
  const detected = detectCandleAnalysisAutoOrderBlocks(candles, { max: 6 });
  const out: OverlayItem[] = [];
  for (const d of detected) {
    const z = obZoneFromDetected(candles, d, lastTime);
    if (z) out.push(z);
  }
  return out;
}

function obZoneFromDetected(
  candles: Candle[],
  d: DetectedAutoOb,
  lastTime: number
): OverlayItem | null {
  const c = candles[d.obIndex];
  if (!c) return null;
  /** ICT 반구간 — 바디+윅 (합성 pad 금지). 상승OB: 바디저~고점 / 하락OB: 저점~바디고 */
  const isBull = d.bias === 'bullish';
  const bot = isBull ? Math.min(c.open, c.close) : c.low;
  const top = isBull ? c.high : Math.max(c.open, c.close);
  if (!(top > bot) || !(bot > 0)) return null;
  /** 종가 이탈 시 OB 존·라벨 생성 안 함 — 하락 후 LONG OB BUY 잔존 방지 */
  if (
    isObBrokenByClose(
      { index: d.obIndex, low: bot, high: top, bias: d.bias },
      candles
    )
  ) {
    return null;
  }
  const t1 = snapT(candles, Number(c.time));
  const id = `merged-ares-mlsp-tv-ob-${d.kind}-${Number(c.time)}`;
  return tvZone({
    id,
    caption: '오더블럭',
    t1,
    t2: lastTime,
    top,
    bot,
    color: isBull ? OB_BULL : OB_BEAR,
    extraClass: isBull ? 'merged-ares-mlsp-tv-ob-bull' : 'merged-ares-mlsp-tv-ob-bear',
  });
}

function buildSmcObZones(
  candles: Candle[],
  analysisT1: number,
  lastTime: number
): OverlayItem[] {
  const { validObs } = detectSmcStructureOrderBlocks(candles);
  const recent = validObs.slice(-4);
  const out: OverlayItem[] = [];
  for (const ob of recent) {
    const c = candles[ob.index];
    if (!c) continue;
    const t1 = snapT(candles, Number(c.time));
    const isBull = ob.bias === 'bullish';
    out.push(
      tvZone({
        id: `merged-ares-mlsp-tv-smc-ob-${ob.bias}-${ob.index}`,
        caption: '오더블럭',
        t1,
        t2: lastTime,
        top: ob.high,
        bot: ob.low,
        color: isBull ? SMC_OB_BULL : SMC_OB_BEAR,
        extraClass: isBull ? 'merged-ares-mlsp-tv-ob-smc-bull' : 'merged-ares-mlsp-tv-ob-smc-bear',
      })
    );
  }
  return out;
}

function buildVpZones(
  candles: Candle[],
  analysisT1: number,
  lastTime: number
): OverlayItem[] {
  const vp = computeCandleAnalysisVpLevelCenters(candles);
  if (!vp) return [];
  const { hvp, lvp, halfBand } = vp;
  const out: OverlayItem[] = [];
  hvp.slice(0, 2).forEach((center, i) => {
    out.push(
      tvZone({
        id: `merged-ares-mlsp-tv-hvp-${i}-${Math.round(center)}`,
        caption: '매집대',
        t1: analysisT1,
        t2: lastTime,
        top: center + halfBand,
        bot: center - halfBand,
        color: HVP_ZONE,
        extraClass: 'merged-ares-mlsp-tv-hvp-zone',
      })
    );
  });
  lvp.slice(0, 2).forEach((center, i) => {
    out.push(
      tvZone({
        id: `merged-ares-mlsp-tv-lvp-${i}-${Math.round(center)}`,
        caption: '저거래',
        t1: analysisT1,
        t2: lastTime,
        top: center + halfBand,
        bot: center - halfBand,
        color: LVP_ZONE,
        extraClass: 'merged-ares-mlsp-tv-lvp-zone',
      })
    );
  });
  return out;
}

function buildPivotWickSrLines(
  candles: Candle[],
  timeframe: string,
  analysisT1: number,
  lastTime: number,
  close: number
): OverlayItem[] {
  const tf = normalizeChartTimeframe(timeframe);
  const { highs, lows } = collectSwingPivots(candles, tf);
  const out: OverlayItem[] = [];
  const nearPct = 0.12;

  const pickNear = (pivots: typeof highs, side: 'high' | 'low') => {
    const sorted = [...pivots].sort((a, b) => {
      const da = Math.abs(a.price - close) / Math.max(close, 1);
      const db = Math.abs(b.price - close) / Math.max(close, 1);
      return da - db;
    });
    const kept: typeof highs = [];
    for (const p of sorted) {
      if (kept.some((k) => Math.abs(k.price - p.price) / Math.max(close, 1) < 0.004)) continue;
      if (Math.abs(p.price - close) / Math.max(close, 1) > nearPct) continue;
      kept.push(p);
      if (kept.length >= 3) break;
    }
    return kept;
  };

  for (const h of pickNear(highs, 'high')) {
    const t1 = snapT(candles, h.time);
    out.push(
      tvHorizSr({
        id: `merged-ares-mlsp-tv-sr-res-${h.i}`,
        caption: '저항',
        t1,
        t2: lastTime,
        price: h.price,
        color: SR_LINE_RES,
        extraClass: 'merged-ares-mlsp-tv-sr-resist',
      })
    );
  }
  for (const l of pickNear(lows, 'low')) {
    const t1 = snapT(candles, l.time);
    out.push(
      tvHorizSr({
        id: `merged-ares-mlsp-tv-sr-sup-${l.i}`,
        caption: '지지',
        t1,
        t2: lastTime,
        price: l.price,
        color: SR_LINE_SUP,
        extraClass: 'merged-ares-mlsp-tv-sr-support',
      })
    );
  }
  return out;
}

/** Mirage TV — OB·VP·피벗 S/R (전 TF) */
export function buildMergedDeskAdvancedCandleZones(
  candles: Candle[],
  timeframe: string,
  analysisT1: number,
  lastTime: number
): OverlayItem[] {
  if (candles.length < 12) return [];
  const close = Number(candles[candles.length - 1]?.close) || 0;
  const t1 = snapT(candles, analysisT1);
  const t2 = snapT(candles, lastTime);

  return [
    ...buildEngulfingObZones(candles, t2),
    ...buildSmcObZones(candles, t1, t2),
    ...buildVpZones(candles, t1, t2),
    ...buildPivotWickSrLines(candles, timeframe, t1, t2, close),
  ];
}
