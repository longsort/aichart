/**
 * 연합밴드 + Triple Trend [BigBeluga] 융합 — CP·LinReg·Strike 중심 + 3밴드·시그널.
 */
import type { Candle, OverlayItem } from '@/types';
import type { LineData, Time, UTCTimestamp } from 'lightweight-charts';
import type { MonthDeskBandFusionContext } from '@/lib/institutionalSuperBand';
import {
  buildFusionMidByBar,
  computeFusionDeskBandMeta,
  computeFusionDeskBandScores,
  type FusionDeskBandExtra,
  type FusionDeskBandMeta,
} from '@/lib/monthDeskFusionDeskBand';
import {
  computeTripleTrendIndicator,
  type TripleTrendBar,
  type TripleTrendSignal,
  type TripleTrendSignalBandOption,
} from '@/lib/tripleTrendIndicator';

export const TRIPLE_TREND_BULL = '#1fa075';
export const TRIPLE_TREND_BEAR = '#ad7725';

export type TripleTrendFusionSegment = {
  dir: 'long' | 'short';
  band1: LineData<UTCTimestamp>[];
  band2: LineData<UTCTimestamp>[];
  band3: LineData<UTCTimestamp>[];
};

export type TripleTrendChangeEvent = {
  time: number;
  priceTop: number;
  priceBot: number;
  bull: boolean;
};

export type TripleTrendFusionPack = {
  segments: TripleTrendFusionSegment[];
  signals: TripleTrendSignal[];
  trendChanges: number[];
  trendChangeEvents: TripleTrendChangeEvent[];
  meta: FusionDeskBandMeta;
  last: TripleTrendBar | null;
};

function barToLine(candles: Candle[], i: number, v: number): LineData<UTCTimestamp> | null {
  if (!Number.isFinite(v)) return null;
  return { time: candles[i]!.time as UTCTimestamp, value: v };
}

function buildSegments(candles: Candle[], bars: TripleTrendBar[]): TripleTrendFusionSegment[] {
  const n = candles.length;
  if (n < 2 || bars.length !== n) return [];

  const segments: TripleTrendFusionSegment[] = [];
  let runStart = 0;
  for (let i = 1; i <= n; i++) {
    const atEnd = i === n;
    const trendFlip = !atEnd && bars[i]!.trend !== bars[runStart]!.trend;
    if (atEnd || trendFlip) {
      const end = atEnd ? n - 1 : i - 1;
      if (end >= runStart) {
        const dir: 'long' | 'short' = bars[runStart]!.trend ? 'long' : 'short';
        const band1: LineData<UTCTimestamp>[] = [];
        const band2: LineData<UTCTimestamp>[] = [];
        const band3: LineData<UTCTimestamp>[] = [];
        for (let j = runStart; j <= end; j++) {
          const b = bars[j]!;
          const l1 = barToLine(candles, j, b.band1);
          const l2 = barToLine(candles, j, b.band2);
          const l3 = barToLine(candles, j, b.band3);
          if (l1) band1.push(l1);
          if (l2) band2.push(l2);
          if (l3) band3.push(l3);
        }
        if (band1.length >= 2) segments.push({ dir, band1, band2, band3 });
      }
      runStart = atEnd ? n : i;
    }
  }
  return segments;
}

/** 연합 융합 + Triple Trend 밴드·시그널 패키지 */
export function computeTripleTrendFusionBandPackage(params: {
  candles: Candle[];
  timeframe: string;
  fusion: MonthDeskBandFusionContext | null;
  extra: FusionDeskBandExtra | null;
  stMid: LineData<UTCTimestamp>[];
  lrMid: LineData<UTCTimestamp>[];
  cpMid: LineData<UTCTimestamp>[];
  signalBand?: TripleTrendSignalBandOption;
}): TripleTrendFusionPack | null {
  const { candles, timeframe, fusion, extra, stMid, lrMid, cpMid, signalBand = 3 } = params;
  if (candles.length < 24) return null;

  const fusionMidByBar = buildFusionMidByBar(candles, stMid, lrMid, cpMid);
  const scores = computeFusionDeskBandScores(candles, fusion, extra, fusionMidByBar);
  const meta = computeFusionDeskBandMeta(candles, scores, extra, timeframe);

  const { bars, signals } = computeTripleTrendIndicator(candles, fusionMidByBar, {
    len: 70,
    bandsDist: 3,
    maType: 'sma',
    signalBand,
  });
  if (!bars.length) return null;

  const trendChangeEvents: TripleTrendChangeEvent[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    if (!b.trendChange || i < 1) continue;
    const atr = b.atr || 0;
    /** Pine: line at bar_index - 1 (전환 직전 봉) */
    trendChangeEvents.push({
      time: Number(candles[i - 1]!.time),
      priceTop: b.band3 + atr * 5,
      priceBot: b.band3 - atr * 5,
      bull: b.trend,
    });
  }

  const trendChanges = trendChangeEvents.map((e) => e.time);

  const sigCap = signalBand === 'all' ? 24 : 12;

  return {
    segments: buildSegments(candles, bars),
    signals: signals.slice(-sigCap),
    trendChanges: trendChanges.slice(-8),
    trendChangeEvents: trendChangeEvents.slice(-8),
    meta: {
      ...meta,
      headlineKo: `Triple·연합 ${meta.direction === 'long' ? '롱' : meta.direction === 'short' ? '숏' : '중립'} · ${meta.confluence}% — BigBeluga+CP·LinReg·Strike`,
    },
    last: bars[bars.length - 1] ?? null,
  };
}

/** SMC·작도용 — 융합 없이 캔들만으로 Triple Trend 패키지 */
export function computeTripleTrendSmcPack(
  candles: Candle[],
  opts?: { signalBand?: TripleTrendSignalBandOption }
): TripleTrendFusionPack | null {
  if (candles.length < 24) return null;
  const { bars, signals } = computeTripleTrendIndicator(candles, undefined, {
    len: 70,
    bandsDist: 3,
    maType: 'sma',
    signalBand: opts?.signalBand ?? 3,
  });
  if (!bars.length) return null;
  const trendChangeEvents: TripleTrendChangeEvent[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    if (!b.trendChange || i < 1) continue;
    const atr = b.atr || 0;
    /** Pine: line at bar_index - 1 (전환 직전 봉) */
    trendChangeEvents.push({
      time: Number(candles[i - 1]!.time),
      priceTop: b.band3 + atr * 5,
      priceBot: b.band3 - atr * 5,
      bull: b.trend,
    });
  }
  const sigCap = opts?.signalBand === 'all' ? 24 : 12;
  const lastBar = bars[bars.length - 1]!;
  const lastC = candles[candles.length - 1]!;
  return {
    segments: buildSegments(candles, bars),
    signals: signals.slice(-sigCap),
    trendChanges: trendChangeEvents.map((e) => e.time).slice(-8),
    trendChangeEvents: trendChangeEvents.slice(-8),
    meta: {
      direction: lastBar.trend ? 'long' : 'short',
      confluence: 0,
      headlineKo: 'Triple Trend · SMC',
      sublineKo: 'BigBeluga 3밴드',
      entry: lastC.close,
      stopLoss: lastBar.trend ? lastBar.band1 : lastBar.band3,
      tp1: lastBar.trend ? lastBar.band3 : lastBar.band1,
      tp2: lastC.close,
      tp3: lastC.close,
    },
    last: lastBar,
  };
}

export type TripleTrendFusionOverlayOpts = {
  includeFlipLines?: boolean;
  includeSmcChannel?: boolean;
  idPrefix?: string;
};

function lineAt(seg: TripleTrendFusionSegment, key: 'band1' | 'band3', end: boolean): number | null {
  const arr = seg[key];
  const pt = end ? arr[arr.length - 1] : arr[0];
  return pt && Number.isFinite(pt.value) ? pt.value : null;
}

/** 추세 전환 점선 + (선택) SMC 채널 면 */
export function buildTripleTrendFusionOverlays(
  pack: TripleTrendFusionPack | null | undefined,
  candles: Candle[],
  opts: TripleTrendFusionOverlayOpts = {}
): OverlayItem[] {
  if (!pack || candles.length < 2) return [];
  const prefix = opts.idPrefix ?? 'merged-tt-fusion-';
  const out: OverlayItem[] = [];

  if (opts.includeFlipLines === true) {
    for (const ev of pack.trendChangeEvents) {
      const col = ev.bull ? TRIPLE_TREND_BULL : TRIPLE_TREND_BEAR;
      out.push({
        id: `${prefix}flip-${ev.time}`,
        kind: 'label',
        label: '',
        x1: 0,
        y1: 0,
        confidence: 0.62,
        color: col,
        time1: ev.time,
        price1: ev.priceBot,
        price2: ev.priceTop,
        category: 'mirageLSP',
        overlayZoneExtraClass: 'merged-tt-fusion-flip-vline',
      });
    }
  }

  if (opts.includeSmcChannel !== false) {
    const seg = pack.segments[pack.segments.length - 1];
    if (seg && seg.band1.length >= 2) {
      const longSeg = seg.dir === 'long';
      const t1 = Number(seg.band1[0]!.time);
      const t2 = Number(seg.band1[seg.band1.length - 1]!.time);
      const hi1 = lineAt(seg, longSeg ? 'band3' : 'band1', false);
      const hi2 = lineAt(seg, longSeg ? 'band3' : 'band1', true);
      const lo1 = lineAt(seg, longSeg ? 'band1' : 'band3', false);
      const lo2 = lineAt(seg, longSeg ? 'band1' : 'band3', true);
      if (
        Number.isFinite(t1) &&
        Number.isFinite(t2) &&
        hi1 != null &&
        hi2 != null &&
        lo1 != null &&
        lo2 != null
      ) {
        const col = longSeg ? TRIPLE_TREND_BULL : TRIPLE_TREND_BEAR;
        out.push({
          id: `${prefix}channel-active`,
          kind: 'channelBand',
          label: longSeg ? 'Triple·롱' : 'Triple·숏',
          x1: 0,
          y1: 0,
          confidence: 0.55,
          color: longSeg ? 'rgba(31,160,117,0.12)' : 'rgba(173,119,37,0.12)',
          lineLabelColor: col,
          time1: t1,
          time2: t2,
          price1: lo1,
          price2: lo2,
          category: 'mirageLSP',
          zoneFillPreserve: true,
          noProject: true,
          channelBand: {
            time1: t1,
            time2: t2,
            priceHigh1: hi1,
            priceHigh2: hi2,
            priceLow1: lo1,
            priceLow2: lo2,
          },
          overlayZoneExtraClass: `merged-tt-fusion-channel ${longSeg ? 'merged-desk-smc-dir-long' : 'merged-desk-smc-dir-short'}`,
        });
      }
    }
  }

  return out;
}

export type TripleTrendFusionChartMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown';
  color: string;
  text: string;
  size: number;
  id: string;
};

/** BigBeluga 1·2·3 터치 시그널 → 차트 마커 (band3 기준) */
export function buildTripleTrendFusionChartMarkers(
  pack: TripleTrendFusionPack | null | undefined,
  chartCandles: Candle[]
): TripleTrendFusionChartMarker[] {
  if (!pack?.signals?.length || chartCandles.length < 2) return [];
  const visible = new Set(chartCandles.map((c) => Number(c.time)));
  const seen = new Set<string>();
  const out: TripleTrendFusionChartMarker[] = [];
  for (const sig of pack.signals) {
    const t = Number(sig.time);
    const key = `${t}-${sig.dir}-${sig.text}`;
    if (!visible.has(t) || seen.has(key)) continue;
    seen.add(key);
    const long = sig.dir === 'long';
    out.push({
      time: t as Time as UTCTimestamp,
      position: long ? 'belowBar' : 'aboveBar',
      shape: long ? 'arrowUp' : 'arrowDown',
      color: long ? TRIPLE_TREND_BULL : TRIPLE_TREND_BEAR,
      text: sig.text,
      size: 1,
      id: `tt-fusion-${t}-${sig.dir}-${sig.text}`,
    });
  }
  return out;
}

export function parseTripleTrendSignalBandSetting(v: unknown): TripleTrendSignalBandOption {
  if (v === '1' || v === 1) return 1;
  if (v === '2' || v === 2) return 2;
  if (v === 'all') return 'all';
  return 3;
}
