/**
 * 통합·분석 — Tops & Bottoms (TradingView Jwolshi 스타일).
 * 빨강 TOP / 초록 BOT 라벨 · BOT 저점 지지 추세선(녹색).
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import { normalizeChartTimeframe } from '@/lib/constants';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import {
  detectTopsAndBottoms,
  topsBottomsOptionsForTimeframe,
  type TopsBottomsPivot,
} from '@/lib/topsAndBottomsIndicator';
import { fmtMirageCryptoPrice } from '@/lib/mirageLiquiditySweepIndicator';

const TOP_COLOR = '#FF3B3B';
const BOT_COLOR = '#00E676';

/** 코인 USDT 가격 표기 */
function fmtTvPrice(p: number): string {
  return fmtMirageCryptoPrice(p);
}

function fmtLabel(kind: 'top' | 'bottom', price: number): string {
  return kind === 'top' ? `TOP\n${fmtTvPrice(price)}` : `BOT\n${fmtTvPrice(price)}`;
}

export type MergedTopsBottomsChartPack = {
  markers: AtlasPulseMarker[];
  overlays: OverlayItem[];
  pivots: TopsBottomsPivot[];
  summaryKo: string;
};

export function summarizeMergedTopsBottomsKo(
  pivots: TopsBottomsPivot[],
  candles: Candle[]
): string {
  if (!pivots.length || !candles.length) return 'TOP/BOT — 피벗 대기';
  const price = candles[candles.length - 1]!.close;
  const precision = pivots.filter((p) => p.precision);
  const lastTop = [...precision].reverse().find((p) => p.kind === 'top');
  const lastBot = [...precision].reverse().find((p) => p.kind === 'bottom');
  const parts: string[] = [];
  if (lastTop) {
    const d = price > 0 ? ((lastTop.price - price) / price) * 100 : 0;
    parts.push(`TOP ${fmtTvPrice(lastTop.price)} (${d >= 0 ? '+' : ''}${d.toFixed(1)}%)`);
  }
  if (lastBot) {
    const d = price > 0 ? ((price - lastBot.price) / price) * 100 : 0;
    parts.push(`BOT ${fmtTvPrice(lastBot.price)} (${d.toFixed(1)}%↑)`);
  }
  return parts.length ? parts.join(' · ') : `피벗 ${pivots.length} · RSI필터 미충족`;
}

/** BOT 저점 2개 → 상승 지지 추세선 (이미지 녹색 선) */
function buildBotSupportTrendline(
  bots: TopsBottomsPivot[],
  lastTime: number
): { anchor: TopsBottomsPivot; second: TopsBottomsPivot; extendPrice: number } | null {
  const ps = bots.filter((p) => p.precision).sort((a, b) => a.time - b.time);
  if (ps.length < 2) return null;

  let anchor = ps[0]!;
  for (const p of ps) {
    if (p.price < anchor.price) anchor = p;
  }

  const higherLows = ps.filter((p) => p.time > anchor.time && p.price > anchor.price * 1.004);
  let second: TopsBottomsPivot | null = higherLows.length ? higherLows[higherLows.length - 1]! : null;

  if (!second) {
    const later = ps.filter((p) => p.time > anchor.time);
    if (later.length < 1) return null;
    second = later.reduce((a, b) => (a.price < b.price ? a : b));
    if (second.time === anchor.time || second.price <= anchor.price) return null;
  }

  const dt = second.time - anchor.time;
  if (dt <= 0) return null;
  const slope = (second.price - anchor.price) / dt;
  const extendPrice = anchor.price + slope * (lastTime - anchor.time);
  if (!Number.isFinite(extendPrice)) return null;

  return { anchor, second, extendPrice };
}

export function buildMergedTopsBottomsChartPack(params: {
  candles: Candle[];
  timeframe: string;
  maxPivots?: number;
  showLabels?: boolean;
  /** Pine showZigzag — 회색 점선 (기본 off, TV 캡처는 지지선 위주) */
  showZigzag?: boolean;
  /** BOT 저점 연결 녹색 추세선 (TV 이미지) */
  showBotTrendline?: boolean;
}): MergedTopsBottomsChartPack {
  const tf = normalizeChartTimeframe(params.timeframe);
  const work = mergedWorkCandles(params.candles, tf);
  const opts = topsBottomsOptionsForTimeframe(tf);
  const all = detectTopsAndBottoms(work, opts);
  const maxP = Math.min(500, params.maxPivots ?? 120);
  const pivots = all.slice(-maxP);

  const showLabels = params.showLabels !== false;
  const showZigzag = params.showZigzag === true;
  const showBotTrendline = params.showBotTrendline !== false;

  const overlays: OverlayItem[] = [];
  const precision = pivots.filter((p) => p.precision);

  for (const p of precision) {
    if (!showLabels) continue;
    const isTop = p.kind === 'top';
    overlays.push({
      id: `merged-ares-tb-label-${p.kind}-${p.time}`,
      kind: 'label',
      label: fmtLabel(p.kind, p.price),
      x1: 1,
      y1: isTop ? 0 : 1,
      x2: 1,
      y2: isTop ? 0 : 1,
      time1: p.time as UTCTimestamp,
      time2: p.time as UTCTimestamp,
      price1: p.price,
      confidence: 88,
      color: isTop ? TOP_COLOR : BOT_COLOR,
      category: 'topsBottoms',
      labelBackgroundColor: isTop ? TOP_COLOR : BOT_COLOR,
      labelTextColor: '#ffffff',
      labelTooltip: `${isTop ? 'TOP' : 'BOT'} ${fmtTvPrice(p.price)} · RSI ${p.rsi.toFixed(0)} · 조건부 참고`,
      overlayZoneExtraClass: [
        'merged-ares-tb-label',
        isTop ? 'merged-ares-tb-label--top' : 'merged-ares-tb-label--bottom',
      ].join(' '),
    });
  }

  if (showZigzag) {
    for (let i = 1; i < precision.length; i++) {
      const a = precision[i - 1]!;
      const b = precision[i]!;
      overlays.push({
        id: `merged-ares-tb-zig-${a.time}-${b.time}`,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: a.time as UTCTimestamp,
        time2: b.time as UTCTimestamp,
        price1: a.price,
        price2: b.price,
        confidence: 50,
        color: 'rgba(148,163,184,0.35)',
        lineLabelColor: 'rgba(148,163,184,0.5)',
        lineStrokeWidth: 1,
        lineDash: '4 3',
        category: 'topsBottoms',
        noProject: true,
        overlayZoneExtraClass: 'merged-ares-tb-zigzag',
      });
    }
  }

  if (showBotTrendline && work.length >= 2) {
    const bots = pivots.filter((p) => p.kind === 'bottom');
    const lastTime = Number(work[work.length - 1]!.time);
    const tl = buildBotSupportTrendline(bots, lastTime);
    if (tl) {
      overlays.push({
        id: `merged-ares-tb-support-${tl.anchor.time}-${tl.second.time}`,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: tl.anchor.time as UTCTimestamp,
        time2: lastTime as UTCTimestamp,
        price1: tl.anchor.price,
        price2: tl.extendPrice,
        confidence: 85,
        color: BOT_COLOR,
        lineLabelColor: BOT_COLOR,
        lineStrokeWidth: 2,
        category: 'topsBottoms',
        noProject: true,
        overlayZoneExtraClass: 'merged-ares-tb-support-line',
        labelTooltip: `BOT 지지 · ${fmtTvPrice(tl.anchor.price)} → ${fmtTvPrice(tl.second.price)} · 조건부 참고`,
      });
    }
  }

  return {
    markers: [],
    overlays,
    pivots,
    summaryKo: summarizeMergedTopsBottomsKo(all, work),
  };
}
