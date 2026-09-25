/**
 * 마감·안착 — LinReg 추세선 **정밀 작도** (회귀창 time·price 직결, 피벗/과연장 제거).
 * 대각선 최대 6개: monthDeskTrendLineCap.
 */
import type { Candle, OverlayItem } from '@/types';
import type { ParkfTrendlineOpts } from '@/lib/parkfLinregTrendlineEngine';
import {
  computeLinRegLargeChannelBounds,
  DEFAULT_PARKF_TRENDLINE_OPTS,
} from '@/lib/parkfLinregTrendlineEngine';
import {
  buildWhaleAnchoredLinRegChannelsOverlays,
  defaultWhaleAlrSlots,
  type WhaleAlrSlotConfig,
} from '@/lib/whaleAnchoredLinRegChannels';
import {
  capMonthDeskDiagonalTrendLines,
  MONTH_DESK_MAX_TREND_LINES,
} from '@/lib/monthDeskTrendLineCap';
import {
  hexToRgba,
  mergeParkfTrendlineColors,
  DEFAULT_PARKF_TRENDLINE_COLORS,
} from '@/lib/chartHexColor';

const TV_LABEL = {
  lrCenterBg: '#EAB308',
  lrCenterFg: '#0F172A',
  lrResistBg: '#DC2626',
  lrResistFg: '#FFFFFF',
  lrSupportBg: '#16A34A',
  lrSupportFg: '#FFFFFF',
} as const;

function monthDeskBarMs(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 86_400_000;
  const d = Number(candles[n - 1]!.time) - Number(candles[n - 2]!.time);
  return Number.isFinite(d) && d > 0 ? d : 86_400_000;
}

/** TF별 회귀 길이 — 가시 구간에 맞춘 정밀 창 */
export function monthDeskLinRegLength(tf: string, candleCount: number): number {
  const n = candleCount;
  const t = tf.toLowerCase();
  if (t.includes('1w')) return Math.min(n - 2, Math.max(18, Math.round(n * 0.34)));
  if (t.includes('1d')) return Math.min(n - 2, Math.max(24, Math.round(n * 0.26)));
  if (t.includes('4h')) return Math.min(n - 2, 88);
  if (t.includes('1h') || t.includes('2h')) return Math.min(n - 2, 110);
  if (t.includes('15m') || t.includes('30m')) return Math.min(n - 2, 140);
  if (t.includes('1m') || t === '3m' || t === '5m') return Math.min(n - 2, 180);
  return Math.min(n - 2, 96);
}

/** 미래 연장 — 짧게(캔들·가격 어긋남 방지) */
export function monthDeskLinRegExtendBars(tf: string): number {
  const t = tf.toLowerCase();
  if (t.includes('1w') || t.includes('1d')) return 2;
  if (t.includes('4h')) return 3;
  return 4;
}

function chartTimeSpan(candles: Candle[]): { t0: number; tN: number; barMs: number } {
  const n = candles.length;
  const t0 = Number(candles[0]!.time);
  const tN = Number(candles[n - 1]!.time);
  return { t0, tN, barMs: monthDeskBarMs(candles) };
}

function priceEnvelope(candles: Candle[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  const pad = (max - min) * 0.02;
  return { min: min - pad, max: max + pad };
}

function yRatio(p: number, min: number, max: number): number {
  const r = max - min;
  return r > 0 ? (max - p) / r : 0.5;
}

function xRatio(t: number, t0: number, tEnd: number): number {
  const span = Math.max(1, tEnd - t0);
  return Math.max(0, Math.min(1.06, (t - t0) / span));
}

function pushPreciseTrendLine(
  out: OverlayItem[],
  candles: Candle[],
  min: number,
  max: number,
  t0: number,
  tEnd: number,
  spec: {
    id: string;
    label: string;
    t1: number;
    p1: number;
    t2: number;
    p2: number;
    hex: string;
    alpha: number;
    dash?: string;
    width: number;
    labelBg?: string;
    labelFg?: string;
  }
): void {
  const { id, label, t1, p1, t2, p2, hex, alpha, dash, width, labelBg, labelFg } = spec;
  if (!Number.isFinite(p1) || !Number.isFinite(p2) || !Number.isFinite(t1) || !Number.isFinite(t2)) return;
  const fg = labelFg ?? hex;
  out.push({
    id,
    kind: 'trendLine',
    label,
    time1: t1,
    time2: t2,
    price1: p1,
    price2: p2,
    x1: xRatio(t1, t0, tEnd),
    y1: yRatio(p1, min, max),
    x2: xRatio(t2, t0, tEnd),
    y2: yRatio(p2, min, max),
    confidence: 78,
    color: hexToRgba(hex, alpha),
    lineLabelColor: fg,
    ...(labelBg ? { labelBackgroundColor: labelBg, labelTextColor: labelFg ?? '#fff' } : {}),
    category: 'trendlineEngine',
    ...(dash ? { lineDash: dash } : {}),
    lineStrokeWidth: width,
    /** time·price 기준 화면 투영(기하 연장) */
    noProject: false,
  });
}

/** ParkF Large 밴드와 동일 수학 — 회귀 시작~마지막 봉(+짧은 연장) */
function buildPreciseParkfLinRegLines(
  candles: Candle[],
  partial: Partial<ParkfTrendlineOpts>,
  tf: string
): OverlayItem[] {
  const n = candles.length;
  if (n < 12) return [];

  const length = monthDeskLinRegLength(tf, n);
  const bounds = computeLinRegLargeChannelBounds(candles, {
    ...DEFAULT_PARKF_TRENDLINE_OPTS,
    ...partial,
    linregLength: length,
    useLargeLinReg: true,
    useMediumLinReg: false,
    useSmallLinReg: false,
  });
  if (!bounds) return [];

  const col = mergeParkfTrendlineColors(partial.colors ?? DEFAULT_PARKF_TRENDLINE_COLORS);
  const { min, max } = priceEnvelope(candles);
  const { t0, tN, barMs } = chartTimeSpan(candles);
  const ext = monthDeskLinRegExtendBars(tf);
  const tEnd = tN + barMs * ext;
  const tEndPlot = ext > 0 ? tEnd : tN;

  const dt = bounds.tR - bounds.tL;
  if (Math.abs(dt) < 1e-9) return [];

  const midAt = (t: number) => bounds.startMid + ((bounds.endMid - bounds.startMid) * (t - bounds.tL)) / dt;
  const off = bounds.mult * bounds.bandDev;
  const upperAt = (t: number) => midAt(t) + off;
  const lowerAt = (t: number) => midAt(t) - off;

  const t1 = bounds.tL;
  const t2 = tEndPlot;
  const out: OverlayItem[] = [];

  pushPreciseTrendLine(out, candles, min, max, t0, tEndPlot, {
    id: 'parkf-lr-lg-u',
    label: '★ 저항',
    t1,
    p1: upperAt(t1),
    t2,
    p2: upperAt(t2),
    hex: col.linRegLargeHex,
    alpha: 0.92,
    dash: '6 4',
    width: 2,
    labelBg: TV_LABEL.lrResistBg,
    labelFg: TV_LABEL.lrResistFg,
  });

  pushPreciseTrendLine(out, candles, min, max, t0, tEndPlot, {
    id: 'parkf-lr-lg-d',
    label: '★ 지지',
    t1,
    p1: lowerAt(t1),
    t2,
    p2: lowerAt(t2),
    hex: col.linRegLargeHex,
    alpha: 0.9,
    dash: '6 4',
    width: 2,
    labelBg: TV_LABEL.lrSupportBg,
    labelFg: TV_LABEL.lrSupportFg,
  });

  pushPreciseTrendLine(out, candles, min, max, t0, tEndPlot, {
    id: 'parkf-lr-base',
    label: 'LinReg 중심',
    t1,
    p1: midAt(t1),
    t2,
    p2: midAt(t2),
    hex: col.linRegBaseHex,
    alpha: 0.95,
    width: 2,
    labelBg: TV_LABEL.lrCenterBg,
    labelFg: TV_LABEL.lrCenterFg,
  });

  return out;
}

export function monthDeskWhaleAlrSlots(
  density: 'clear' | 'rich' = 'clear'
): [WhaleAlrSlotConfig, WhaleAlrSlotConfig, WhaleAlrSlotConfig] {
  const base = defaultWhaleAlrSlots();
  if (density === 'clear') {
    return [{ ...base[0], display: 'off' }, { ...base[1], display: 'off' }, { ...base[2], display: 'off' }];
  }
  return [
    { ...base[0], display: 'channel', devMult: 2.05, maxLen: Math.min(520, base[0].maxLen), step: 1 },
    { ...base[1], display: 'off' },
    { ...base[2], display: 'off' },
  ];
}

/** ALR 선 — time·price 재정렬(캔들 축과 일치) */
function realignWhaleAlrLines(candles: Candle[], items: OverlayItem[]): OverlayItem[] {
  const { t0, tN } = chartTimeSpan(candles);
  const { min, max } = priceEnvelope(candles);
  const barMs = monthDeskBarMs(candles);
  const tEnd = tN + barMs * 2;

  return items
    .filter((o) => o.kind === 'trendLine')
    .map((o) => {
      const t1 = Number(o.time1);
      const t2 = Number(o.time2);
      const p1 = Number(o.price1);
      const p2 = Number(o.price2);
      if (![t1, t2, p1, p2].every(Number.isFinite)) return o;
      return {
        ...o,
        x1: xRatio(t1, t0, tEnd),
        y1: yRatio(p1, min, max),
        x2: xRatio(t2, t0, tEnd),
        y2: yRatio(p2, min, max),
        noProject: false,
        label: '',
      };
    });
}

export function buildMonthDeskLinRegTrendlineOverlays(input: {
  candles: Candle[];
  timeframe?: string;
  parkfPartial?: Partial<ParkfTrendlineOpts>;
  density?: 'clear' | 'rich';
  whaleAlrLogScale?: boolean;
  extendBars?: number;
}): OverlayItem[] {
  const { candles } = input;
  if (candles.length < 12) return [];

  const density = input.density ?? 'clear';
  const tf = input.timeframe ?? '1h';
  const parkfPartial = {
    ...input.parkfPartial,
    linregLength: monthDeskLinRegLength(tf, candles.length),
  };

  const parkfLines = buildPreciseParkfLinRegLines(candles, parkfPartial, tf);

  let alr: OverlayItem[] = [];
  if (density === 'rich') {
    const extBars = input.extendBars ?? monthDeskLinRegExtendBars(tf);
    alr = realignWhaleAlrLines(
      candles,
      buildWhaleAnchoredLinRegChannelsOverlays({
        candles,
        logScale: input.whaleAlrLogScale === true,
        slots: monthDeskWhaleAlrSlots(density),
        extendBars: Math.min(extBars, 4),
        fibParallelRatios: null,
      }).filter((o) => {
        const id = String(o.id || '');
        return id === 'whale-alr-0-ch-mid' || id === 'whale-alr-0-ch-top' || id === 'whale-alr-0-ch-bot';
      })
    );
  }

  return capMonthDeskDiagonalTrendLines([...parkfLines, ...alr], MONTH_DESK_MAX_TREND_LINES);
}
