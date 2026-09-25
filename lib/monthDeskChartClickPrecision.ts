/**
 * 마감·안착 — 차트 클릭 시 구조 기반 정밀 핫존·타점·반등 (MTF).
 * 카드 없이 zone·line 오버레이만 반환.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe, TIMEFRAME_ORDER } from '@/lib/constants';
import {
  capZoneVerticalSpan,
  findRecentImpulseLeg,
  htfOtePocketBounds,
  monthDeskZoneLookbackBars,
} from '@/lib/monthDeskZonePrecision';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

export type ClickPrecisionMtfRow = {
  tf: string;
  tfLabel: string;
  side: 'LONG' | 'SHORT' | 'NEUTRAL';
  zoneTop: number;
  zoneBot: number;
  entry: number;
  bounce: number;
  sl: number;
  score: number;
  ko: string;
};

export type MonthDeskClickPrecisionResult = {
  clickTime: number;
  clickPrice: number;
  barIndex: number;
  primarySide: 'LONG' | 'SHORT';
  headlineKo: string;
  sublineKo: string;
  rows: ClickPrecisionMtfRow[];
  overlays: OverlayItem[];
};

const MTF_SCAN = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'] as const;

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) {
    const last = candles[n - 1];
    return Math.max((last?.high ?? 0) - (last?.low ?? 0), (last?.close ?? 1) * 0.004);
  }
  let sum = 0;
  for (let i = n - 14; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  return sum / 14;
}

function tfAtrScale(chartTf: string, targetTf: string, refTimeSec: number): number {
  const a = candleBarDurationSec(normalizeChartTimeframe(chartTf), refTimeSec);
  const b = candleBarDurationSec(normalizeChartTimeframe(targetTf), refTimeSec);
  if (!a || !b) return 1;
  return Math.max(0.12, Math.min(2.8, Math.sqrt(b / a)));
}

function nearestBarIndex(candles: Candle[], time: number): number {
  let best = candles.length - 1;
  let bestD = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(Number(candles[i]!.time) - time);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function snapZoneCenter(
  price: number,
  candles: Candle[],
  barIdx: number,
  atr: number,
  strike: MonthDeskStrikeDeskBundle | null
): { center: number; side: 'LONG' | 'SHORT' } {
  const close = Number(candles[barIdx]?.close ?? price);
  const refs: Array<{ p: number; side: 'LONG' | 'SHORT'; w: number }> = [];
  if (strike?.long) {
    refs.push({ p: strike.long.entry, side: 'LONG', w: 100 });
    refs.push({ p: (strike.long.zoneTop + strike.long.zoneBot) / 2, side: 'LONG', w: 90 });
  }
  if (strike?.short) {
    refs.push({ p: strike.short.entry, side: 'SHORT', w: 100 });
    refs.push({ p: (strike.short.zoneTop + strike.short.zoneBot) / 2, side: 'SHORT', w: 90 });
  }
  refs.push({ p: candles[barIdx]!.low, side: 'LONG', w: 70 });
  refs.push({ p: candles[barIdx]!.high, side: 'SHORT', w: 70 });

  let best = price;
  let side: 'LONG' | 'SHORT' = price <= close ? 'LONG' : 'SHORT';
  let bestScore = -1;
  for (const r of refs) {
    const dist = Math.abs(price - r.p);
    if (dist > atr * 2.5) continue;
    const score = r.w - dist / Math.max(atr, 1e-9) * 40;
    if (score > bestScore) {
      bestScore = score;
      best = r.p;
      side = r.side;
    }
  }
  if (bestScore < 0) {
    side = price < close ? 'LONG' : 'SHORT';
    best = price;
  }
  return { center: best, side };
}

function buildRowForTf(params: {
  tf: string;
  chartTf: string;
  center: number;
  side: 'LONG' | 'SHORT';
  atr: number;
  candles: Candle[];
  barIdx: number;
  swingPivot: number;
  strike: MonthDeskStrikeDeskBundle | null;
  mtfVerdict?: string;
}): ClickPrecisionMtfRow {
  const { tf, chartTf, center, side, atr, candles, barIdx, swingPivot, strike, mtfVerdict } = params;
  const refT = Number(candles[barIdx]?.time ?? candles[candles.length - 1]?.time ?? 0);
  const scale = tfAtrScale(chartTf, tf, refT);
  const half = atr * scale * 0.42;
  let zoneBot = center - half;
  let zoneTop = center + half;

  const L = Math.max(2, Math.min(4, swingPivot));
  const n = candles.length;
  const start = Math.max(L, n - monthDeskZoneLookbackBars(chartTf, 120));
  const impulse = findRecentImpulseLeg(candles, L, start, barIdx, side);
  if (impulse && side === 'LONG') {
    const ote = htfOtePocketBounds(impulse.legHi, impulse.legLo, 'LONG');
    if (ote && center >= ote.pocketBot - atr && center <= ote.pocketTop + atr) {
      zoneBot = ote.pocketBot;
      zoneTop = ote.pocketTop;
    }
  } else if (impulse && side === 'SHORT') {
    const ote = htfOtePocketBounds(impulse.legHi, impulse.legLo, 'SHORT');
    if (ote && center >= ote.pocketBot - atr && center <= ote.pocketTop + atr) {
      zoneBot = ote.pocketBot;
      zoneTop = ote.pocketTop;
    }
  }

  const capped = capZoneVerticalSpan(zoneTop, zoneBot, center, atr * scale * 1.2);
  zoneBot = capped.bot;
  zoneTop = capped.top;

  const entry = side === 'LONG' ? zoneBot + (zoneTop - zoneBot) * 0.38 : zoneBot + (zoneTop - zoneBot) * 0.62;

  let sl = side === 'LONG' ? zoneBot - atr * scale * 0.35 : zoneTop + atr * scale * 0.35;
  let bounce =
    side === 'LONG'
      ? zoneTop + atr * scale * 1.8
      : zoneBot - atr * scale * 1.8;

  if (side === 'LONG' && strike?.long) {
    if (Math.abs(entry - strike.long.entry) / entry < 0.02) {
      sl = strike.long.stopLoss;
      bounce = strike.long.tp2;
    }
  }
  if (side === 'SHORT' && strike?.short) {
    if (Math.abs(entry - strike.short.entry) / entry < 0.02) {
      sl = strike.short.stopLoss;
      bounce = strike.short.tp2;
    }
  }

  if (impulse) {
    bounce = side === 'LONG' ? Math.max(bounce, impulse.legHi) : Math.min(bounce, impulse.legLo);
  }

  let score = 50;
  if (mtfVerdict === 'LONG' && side === 'LONG') score += 22;
  if (mtfVerdict === 'SHORT' && side === 'SHORT') score += 22;
  if (mtfVerdict && mtfVerdict !== side) score -= 18;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(bounce - entry);
  if (risk > 0 && reward / risk >= 1.5) score += 12;

  const tfLabel = tf === '1w' ? '1W' : tf === '1M' ? '1M' : tf;
  const ko =
    side === 'LONG'
      ? `${tfLabel} 롱 핫존 · E 근처 반등 ${((bounce - entry) / entry * 100).toFixed(1)}%`
      : `${tfLabel} 숏 핫존 · E 근처 하락 ${((entry - bounce) / entry * 100).toFixed(1)}%`;

  return {
    tf,
    tfLabel,
    side,
    zoneTop,
    zoneBot,
    entry,
    bounce,
    sl,
    score: Math.max(0, Math.min(100, Math.round(score))),
    ko,
  };
}

function rowOverlays(
  row: ClickPrecisionMtfRow,
  t1: number,
  t2: number,
  primary: boolean
): OverlayItem[] {
  const isLong = row.side === 'LONG';
  const id = `month-desk-click-precision-${row.tf}`;
  const alpha = primary ? 0.38 : 0.22;
  const color = isLong ? `rgba(34,197,94,${alpha})` : `rgba(248,113,113,${alpha})`;
  const tip = [row.ko, `E ${row.entry.toFixed(2)}`, `반등/목표 ${row.bounce.toFixed(2)}`, `SL ${row.sl.toFixed(2)}`, `점수 ${row.score}`].join(
    '\n'
  );

  const out: OverlayItem[] = [
    {
      id: `${id}-zone`,
      kind: isLong ? 'demandZone' : 'supplyZone',
      label: primary ? `◎ ${row.tfLabel} 핫존` : row.tfLabel,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: row.zoneTop,
      price2: row.zoneBot,
      confidence: primary ? 97 : 88,
      color,
      zoneFillPreserve: true,
      zoneSpanOnly: !primary,
      overlayZoneExtraClass: primary
        ? 'overlay-zone--click-precision-primary'
        : 'overlay-zone--click-precision-mtf',
      labelTooltip: tip,
      category: 'scenario',
    },
  ];

  if (primary) {
    out.push(
      {
        id: `${id}-entry`,
        kind: 'keyLevel',
        label: `E ${row.tfLabel}`,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: t1,
        time2: t2,
        price1: row.entry,
        price2: row.entry,
        confidence: 96,
        color: 'rgba(250,204,21,0.95)',
        lineStrokeWidth: 2.5,
        labelTooltip: tip,
      },
      {
        id: `${id}-bounce`,
        kind: 'keyLevel',
        label: `반등 ${row.tfLabel}`,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: t1,
        time2: t2,
        price1: row.bounce,
        price2: row.bounce,
        confidence: 90,
        color: 'rgba(134,239,172,0.85)',
        lineDash: '8 5',
        lineStrokeWidth: 1.8,
        labelTooltip: tip,
      },
      {
        id: `${id}-sl`,
        kind: 'keyLevel',
        label: 'SL',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: t1,
        time2: t2,
        price1: row.sl,
        price2: row.sl,
        confidence: 90,
        color: 'rgba(248,113,113,0.9)',
        lineDash: '5 4',
        lineStrokeWidth: 1.8,
        labelTooltip: tip,
      }
    );
  }

  return out;
}

/** 차트 클릭 → MTF 정밀 핫존·타점·반등 zone·line */
export function buildMonthDeskClickPrecision(params: {
  candles: Candle[];
  clickTime: number;
  clickPrice: number;
  chartTf: string;
  swingPivot?: number;
  strike?: MonthDeskStrikeDeskBundle | null;
  mtfSignals?: Array<{ tf: string; verdict: string; confidence?: number }>;
  analysis?: AnalyzeResponse | null;
}): MonthDeskClickPrecisionResult | null {
  const candles = params.candles;
  if (candles.length < 20) return null;
  const clickPrice = Number(params.clickPrice);
  const clickTime = Number(params.clickTime);
  if (!Number.isFinite(clickPrice) || !Number.isFinite(clickTime)) return null;

  const chartTf = normalizeChartTimeframe(params.chartTf);
  const barIdx = nearestBarIndex(candles, clickTime);
  const atr = atr14(candles);
  const swingPivot = Math.max(2, Math.min(4, params.swingPivot ?? 2));

  const { center, side: snapSide } = snapZoneCenter(
    clickPrice,
    candles,
    barIdx,
    atr,
    params.strike ?? null
  );

  let primarySide = snapSide;
  if (params.strike) {
    const distLong = params.strike.long
      ? Math.abs(clickPrice - params.strike.long.entry)
      : Infinity;
    const distShort = params.strike.short
      ? Math.abs(clickPrice - params.strike.short.entry)
      : Infinity;
    if (distLong < distShort * 0.85) primarySide = 'LONG';
    else if (distShort < distLong * 0.85) primarySide = 'SHORT';
    else if (params.strike.primary === 'LONG' || params.strike.primary === 'SHORT') {
      primarySide = params.strike.primary;
    }
  }

  const mtfMap = new Map<string, string>();
  for (const m of params.mtfSignals ?? []) {
    mtfMap.set(normalizeChartTimeframe(m.tf), m.verdict);
  }
  const multi = (params.analysis as { multiTF?: Record<string, string> } | null)?.multiTF;
  if (multi?.htf) mtfMap.set('4h', multi.htf.includes('상') ? 'LONG' : multi.htf.includes('하') ? 'SHORT' : 'NEUTRAL');
  if (multi?.ltf) mtfMap.set('1h', multi.ltf.includes('상') ? 'LONG' : multi.ltf.includes('하') ? 'SHORT' : 'NEUTRAL');

  const chartIdx = TIMEFRAME_ORDER.indexOf(chartTf as (typeof TIMEFRAME_ORDER)[number]);
  const rows: ClickPrecisionMtfRow[] = [];
  for (const tf of MTF_SCAN) {
    const idx = TIMEFRAME_ORDER.indexOf(tf as (typeof TIMEFRAME_ORDER)[number]);
    if (chartIdx >= 0 && idx >= 0 && Math.abs(idx - chartIdx) > 5) continue;
    const verdict = mtfMap.get(tf);
    rows.push(
      buildRowForTf({
        tf,
        chartTf,
        center,
        side: primarySide,
        atr,
        candles,
        barIdx,
        swingPivot,
        strike: params.strike ?? null,
        mtfVerdict: verdict,
      })
    );
  }

  rows.sort((a, b) => b.score - a.score);
  const primaryRow = rows.find((r) => r.tf === chartTf) ?? rows[0]!;
  const t2 = clickTime;
  const t1 = Number(candles[Math.max(0, barIdx - 8)]?.time ?? clickTime);

  const overlays: OverlayItem[] = [];
  for (const row of rows) {
    const isPrimary = row.tf === primaryRow.tf;
    overlays.push(...rowOverlays(row, t1, t2, isPrimary));
  }

  const headlineKo =
    primarySide === 'LONG'
      ? `◎ ${primaryRow.tfLabel} 롱 핫존 — 클릭가 ${clickPrice.toFixed(1)}`
      : `◎ ${primaryRow.tfLabel} 숏 핫존 — 클릭가 ${clickPrice.toFixed(1)}`;
  const sublineKo = `E ${primaryRow.entry.toFixed(1)} · 반등 ${primaryRow.bounce.toFixed(1)} · SL ${primaryRow.sl.toFixed(1)} · MTF ${rows.length}개`;

  return {
    clickTime,
    clickPrice,
    barIndex: barIdx,
    primarySide,
    headlineKo,
    sublineKo,
    rows,
    overlays,
  };
}
