/**
 * 요만큼·이만큼 세트존 — 시안 이미지 100% · TF별 항상 표시.
 *
 * 세트(A · #FF2EB6):
 *  1) 터치 가로존 (MB/OB 또는 폴백 수요/공급 밴드)
 *  2) 요만큼↓↑ 우측 세로존
 *  3) 이만큼↑↓ 우측 세로존
 *  + 목표선
 *
 * POI 없으면 lookback 스윙+채널로 폴백(빈 화면 방지).
 * 우측 세로존은 ChartView가 마지막봉 우측 픽셀로 안착.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type {
  MergedDeskRbMoneySpotPlan,
  MergedDeskRbSmcPoi,
} from '@/lib/mergedDeskRbSmcPois';
import { loadSettings } from '@/lib/settings';

export const THIS_MUCH_LOOKBACK = 15;

export const THIS_MUCH_SET_HEX = '#FF2EB6';
export const THIS_MUCH_SET_FILL = 'rgba(255,46,182,0.28)';
export const THIS_MUCH_SET_FILL_SOFT = 'rgba(255,46,182,0.16)';
export const THIS_MUCH_SET_STROKE = 'rgba(255,46,182,0.95)';
export const THIS_MUCH_SET_DASH = 'rgba(255,46,182,0.85)';

export const THIS_MUCH_IDS = {
  zoneTouch: 'merged-desk-thismuch-zone-touch',
  zoneYo: 'merged-desk-thismuch-zone-yo',
  zoneYi: 'merged-desk-thismuch-zone-yi',
  labelYo: 'merged-desk-thismuch-label-yo',
  labelYi: 'merged-desk-thismuch-label-yi',
  labelTouch: 'merged-desk-thismuch-label-touch',
  edgeTg: 'merged-desk-thismuch-edge-tg',
} as const;

export type MergedDeskThisMuchPack = {
  enabled: boolean;
  lookback: number;
  side: 'LONG' | 'SHORT' | 'NEUTRAL';
  dropPct: number;
  risePct: number;
  swingHigh: number;
  swingLow: number;
  targetPrice: number;
  overlays: OverlayItem[];
  priceLines: Array<{
    price: number;
    color: string;
    title: string;
    lineWidth: 1 | 2 | 3 | 4;
    lineStyle: 'solid' | 'dotted' | 'dashed';
    axisLabel: boolean;
  }>;
  labelTargets: Array<{ id: string; label: string }>;
  summaryKo: string;
};

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toPrecision(4);
}

function barStepSec(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 3600;
  const d = Number(candles[n - 1]!.time) - Number(candles[n - 2]!.time);
  return Number.isFinite(d) && d > 0 ? d : 3600;
}

/** TF별 우측 세로존 논리봉 수 (ChartView 픽셀 안착과 맞춤) */
export function thisMuchRightBandBarsForTf(tf: string): { yo: number; yi: number; gap: number } {
  const t = normalizeChartTimeframe(tf) || tf;
  if (t === '1m' || t === '3m') return { yo: 4, yi: 6, gap: 1 };
  if (t === '5m' || t === '15m') return { yo: 5, yi: 8, gap: 1 };
  if (t === '30m' || t === '1h') return { yo: 6, yi: 10, gap: 1 };
  if (t === '4h' || t === '6h' || t === '12h') return { yo: 5, yi: 8, gap: 1 };
  return { yo: 4, yi: 7, gap: 1 };
}

function setExtra(...parts: string[]): string {
  return [
    'merged-desk-thismuch',
    'merged-desk-thismuch-set',
    'merged-desk-zone-label-on',
    'merged-desk-zone-pro-hero',
    ...parts,
  ]
    .filter(Boolean)
    .join(' ');
}

function primaryGeom(geoms: MergedDeskChannelGeom[] | null | undefined): MergedDeskChannelGeom | null {
  if (!geoms?.length) return null;
  return geoms.find((g) => g.primary) ?? geoms[0] ?? null;
}

function swingWindow(candles: Candle[], lookback: number) {
  const n = candles.length;
  const start = Math.max(0, n - lookback);
  const win = candles.slice(start);
  let hiI = 0;
  let loI = 0;
  for (let i = 1; i < win.length; i++) {
    if (win[i]!.high >= win[hiI]!.high) hiI = i;
    if (win[i]!.low <= win[loI]!.low) loI = i;
  }
  return {
    swingHigh: win[hiI]!.high,
    swingLow: win[loI]!.low,
    hiIdx: start + hiI,
    loIdx: start + loI,
    tHi: Number(win[hiI]!.time),
    tLo: Number(win[loI]!.time),
  };
}

function buildFallbackEntry(
  candles: Candle[],
  lookback: number,
  corridor: 'LONG' | 'SHORT',
  g: MergedDeskChannelGeom | null,
  close: number,
  tLast: number
): MergedDeskRbSmcPoi {
  const sw = swingWindow(candles, lookback);
  if (corridor === 'LONG') {
    const low = sw.swingLow;
    const high = Math.min(sw.swingHigh, low + Math.max(close * 0.004, (sw.swingHigh - sw.swingLow) * 0.25));
    const mid = (low + high) / 2;
    const target = g?.tipUpper ?? sw.swingHigh;
    const dropPct = ((sw.swingHigh - high) / close) * 100;
    const risePct = ((target - mid) / close) * 100;
    return {
      kind: 'MB',
      bias: 'bullish',
      low,
      high,
      mid,
      index: sw.loIdx,
      time1: sw.tLo || tLast,
      time2: tLast,
      priority: 2,
      labelKo: 'MB/OB',
      inChannel: true,
      touchActive: true,
      dropPct,
      risePct,
      targetPrice: target,
    };
  }
  const high = sw.swingHigh;
  const low = Math.max(sw.swingLow, high - Math.max(close * 0.004, (sw.swingHigh - sw.swingLow) * 0.25));
  const mid = (low + high) / 2;
  const target = g?.tipLower ?? sw.swingLow;
  const risePct = ((low - Math.min(sw.swingLow, close)) / close) * 100;
  const dropPct = ((mid - target) / close) * 100;
  return {
    kind: 'BB',
    bias: 'bearish',
    low,
    high,
    mid,
    index: sw.hiIdx,
    time1: sw.tHi || tLast,
    time2: tLast,
    priority: 2,
    labelKo: 'BE-BB/MB',
    inChannel: true,
    touchActive: true,
    dropPct,
    risePct,
    targetPrice: target,
  };
}

/**
 * 요이만 ON이면 차트 TF마다 세트존을 그린다(POI 없어도 폴백).
 */
export function buildMergedDeskThisMuchMeasurePack(params: {
  candles: Candle[];
  timeframe: string;
  geoms?: MergedDeskChannelGeom[] | null;
  money?: MergedDeskRbMoneySpotPlan | null;
  entry?: MergedDeskRbSmcPoi | null;
  lookback?: number;
  enabled?: boolean;
}): MergedDeskThisMuchPack {
  const lookback = Math.max(8, Math.min(40, params.lookback ?? THIS_MUCH_LOOKBACK));
  const empty: MergedDeskThisMuchPack = {
    enabled: false,
    lookback,
    side: 'NEUTRAL',
    dropPct: 0,
    risePct: 0,
    swingHigh: 0,
    swingLow: 0,
    targetPrice: 0,
    overlays: [],
    priceLines: [],
    labelTargets: [],
    summaryKo: '요만큼이만큼 대기',
  };

  let enabled = params.enabled;
  if (enabled == null) {
    try {
      enabled = loadSettings().chartMergedDeskThisMuchEnabled !== false;
    } catch {
      enabled = true;
    }
  }
  if (!enabled) return empty;

  const candles = params.candles;
  const n = candles.length;
  const g = primaryGeom(params.geoms);
  const tf = normalizeChartTimeframe(params.timeframe) || params.timeframe;
  if (n < lookback) {
    return { ...empty, enabled: true, summaryKo: `요이만 · ${tf} 봉 부족` };
  }

  const tLast = Number(candles[n - 1]!.time);
  const close = Number(candles[n - 1]!.close);
  if (!(tLast > 0) || !(close > 0)) {
    return { ...empty, enabled: true, summaryKo: '요이만 · 시세 없음' };
  }

  const money = params.money;
  const waitConflict = money?.waitConflict === true;

  let corridor: 'LONG' | 'SHORT' =
    money?.side === 'LONG' || money?.side === 'SHORT'
      ? money.side
      : g && !(g.descending || g.useBearFill)
        ? 'LONG'
        : 'SHORT';

  let entry = params.entry;
  let usedFallback = false;
  if (!entry) {
    entry = buildFallbackEntry(candles, lookback, corridor, g, close, tLast);
    usedFallback = true;
  }

  const targetPrice =
    entry.targetPrice ??
    money?.targetPrice ??
    (corridor === 'LONG' ? g?.tipUpper ?? entry.high : g?.tipLower ?? entry.low);
  if (!(targetPrice > 0)) {
    return { ...empty, enabled: true, summaryKo: '요이만 · 목표 없음' };
  }

  const step = barStepSec(candles);
  const band = thisMuchRightBandBarsForTf(tf);
  /** time은 메타용 — 실제 X는 ChartView가 마지막봉 우측 픽셀로 잡음 */
  const tYo0 = (tLast + step * 0.35) as UTCTimestamp;
  const tYo1 = (tLast + step * band.yo) as UTCTimestamp;
  const tYi0 = (tLast + step * (band.yo + band.gap)) as UTCTimestamp;
  const tYi1 = (tLast + step * (band.yo + band.gap + band.yi)) as UTCTimestamp;
  const tYoMid = ((Number(tYo0) + Number(tYo1)) / 2) as UTCTimestamp;
  const tYiMid = ((Number(tYi0) + Number(tYi1)) / 2) as UTCTimestamp;
  const tTouch0 = (Number(entry.time1) || tLast) as UTCTimestamp;
  const tTouch1 = tLast as UTCTimestamp;

  let yoHi: number;
  let yoLo: number;
  let yiHi: number;
  let yiLo: number;
  let dropPct: number;
  let risePct: number;
  let yoLabel: string;
  let yiLabel: string;
  const touchFace = waitConflict
    ? `${entry.labelKo} 터치·WAIT`
    : `${entry.labelKo} 터치`;

  if (corridor === 'LONG') {
    const swingRef = Math.max(g?.tipMid ?? close, entry.high, close);
    yoHi = Math.max(swingRef, entry.high);
    yoLo = entry.high;
    if (!(yoHi > yoLo)) {
      yoHi = entry.high + Math.max(close * 0.0025, (entry.high - entry.low) || close * 0.004);
      yoLo = entry.high;
    }
    yiLo = Math.min(entry.low, entry.mid);
    yiHi = Math.max(targetPrice, entry.high);
    dropPct = entry.dropPct ?? money?.dropPct ?? ((yoHi - yoLo) / close) * 100;
    risePct = entry.risePct ?? money?.risePct ?? ((yiHi - entry.mid) / close) * 100;
    yoLabel = `요만큼↓ ${fmtPct(dropPct)}`;
    yiLabel = `이만큼↑ ${fmtPct(risePct)}`;
  } else {
    const swingRef = Math.min(g?.tipMid ?? close, entry.low, close);
    yoHi = entry.low;
    yoLo = Math.min(swingRef, entry.low);
    if (!(yoHi > yoLo)) {
      yoHi = entry.low;
      yoLo = entry.low - Math.max(close * 0.0025, (entry.high - entry.low) || close * 0.004);
    }
    yiHi = Math.max(entry.high, entry.mid);
    yiLo = Math.min(targetPrice, entry.low);
    risePct = entry.risePct ?? money?.risePct ?? ((yoHi - yoLo) / close) * 100;
    dropPct = entry.dropPct ?? money?.dropPct ?? ((entry.mid - yiLo) / close) * 100;
    yoLabel = `요만큼↑ ${fmtPct(risePct)}`;
    yiLabel = `이만큼↓ ${fmtPct(dropPct)}`;
  }

  const dim = waitConflict;
  const fill = dim ? 'rgba(255,46,182,0.12)' : THIS_MUCH_SET_FILL;
  const fillSoft = dim ? 'rgba(255,46,182,0.08)' : THIS_MUCH_SET_FILL_SOFT;
  const stroke = dim ? 'rgba(255,46,182,0.45)' : THIS_MUCH_SET_STROKE;
  const hex = dim ? '#F472B6' : THIS_MUCH_SET_HEX;
  const targetKo = money?.targetKo ?? (corridor === 'LONG' ? '채널상 · 다음저항' : '채널하 · 다음지지');

  const overlays: OverlayItem[] = [];
  const priceLines: MergedDeskThisMuchPack['priceLines'] = [];
  const labelTargets: Array<{ id: string; label: string }> = [];

  overlays.push({
    id: THIS_MUCH_IDS.zoneTouch,
    kind: corridor === 'SHORT' ? 'supplyZone' : 'demandZone',
    label: touchFace,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: tTouch0,
    time2: tTouch1,
    price1: entry.high,
    price2: entry.low,
    color: fillSoft,
    confidence: dim ? 40 : entry.touchActive ? 95 : 80,
    category: 'zones',
    zoneFillPreserve: true,
    /** 요이만 터치에도 구조반응 클래스 — 실루엣 이모지 연동 */
    overlayZoneExtraClass: setExtra(
      'merged-desk-thismuch-touch',
      'merged-desk-structure-reaction',
      entry.touchActive && !dim ? 'merged-desk-thismuch-touch-hot' : ''
    ),
    zoneFaceBase: touchFace,
    labelTooltip: `${tf} · ${touchFace}${usedFallback ? ' ·폴백' : ''} · 세트`,
  });
  labelTargets.push({ id: THIS_MUCH_IDS.zoneTouch, label: touchFace });

  overlays.push({
    id: THIS_MUCH_IDS.labelTouch,
    kind: 'label',
    label: touchFace,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: ((Number(tTouch0) + Number(tTouch1)) / 2) as UTCTimestamp,
    time2: ((Number(tTouch0) + Number(tTouch1)) / 2) as UTCTimestamp,
    price1: entry.mid,
    price2: entry.mid,
    color: hex,
    confidence: 90,
    category: 'structure',
    overlayZoneExtraClass: setExtra('merged-desk-thismuch-caption-touch'),
    zoneFaceBase: touchFace,
  });
  labelTargets.push({ id: THIS_MUCH_IDS.labelTouch, label: touchFace });

  overlays.push({
    id: THIS_MUCH_IDS.zoneYo,
    kind: 'zone',
    label: yoLabel,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: tYo0,
    time2: tYo1,
    price1: yoHi,
    price2: yoLo,
    color: fill,
    confidence: 94,
    category: 'zones',
    zoneFillPreserve: true,
    overlayZoneExtraClass: setExtra('merged-desk-thismuch-yo', 'merged-desk-thismuch-right-band'),
    zoneFaceBase: yoLabel,
    labelTooltip: `${tf} · ${yoLabel}`,
  });
  labelTargets.push({ id: THIS_MUCH_IDS.zoneYo, label: yoLabel });

  overlays.push({
    id: THIS_MUCH_IDS.labelYo,
    kind: 'label',
    label: yoLabel,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: tYoMid,
    time2: tYoMid,
    price1: (yoHi + yoLo) / 2,
    price2: (yoHi + yoLo) / 2,
    color: hex,
    confidence: 96,
    category: 'structure',
    overlayZoneExtraClass: setExtra(
      'merged-desk-thismuch-caption',
      'merged-desk-thismuch-right-band',
      'merged-desk-thismuch-yo'
    ),
    zoneFaceBase: yoLabel,
  });
  labelTargets.push({ id: THIS_MUCH_IDS.labelYo, label: yoLabel });

  overlays.push({
    id: THIS_MUCH_IDS.zoneYi,
    kind: 'zone',
    label: yiLabel,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: tYi0,
    time2: tYi1,
    price1: yiHi,
    price2: yiLo,
    color: fillSoft,
    confidence: 92,
    category: 'zones',
    zoneFillPreserve: true,
    overlayZoneExtraClass: setExtra('merged-desk-thismuch-yi', 'merged-desk-thismuch-right-band'),
    zoneFaceBase: yiLabel,
    labelTooltip: `${tf} · ${yiLabel} · ${targetKo}`,
  });
  labelTargets.push({ id: THIS_MUCH_IDS.zoneYi, label: yiLabel });

  overlays.push({
    id: THIS_MUCH_IDS.labelYi,
    kind: 'label',
    label: yiLabel,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: tYiMid,
    time2: tYiMid,
    price1: (yiHi + yiLo) / 2,
    price2: (yiHi + yiLo) / 2,
    color: hex,
    confidence: 94,
    category: 'structure',
    overlayZoneExtraClass: setExtra(
      'merged-desk-thismuch-caption-yi',
      'merged-desk-thismuch-right-band',
      'merged-desk-thismuch-yi'
    ),
    zoneFaceBase: yiLabel,
  });
  labelTargets.push({ id: THIS_MUCH_IDS.labelYi, label: yiLabel });

  overlays.push({
    id: THIS_MUCH_IDS.edgeTg,
    kind: 'keyLevel',
    label: `목표선 · ${targetKo}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: tTouch0,
    time2: tYi1,
    price1: targetPrice,
    price2: targetPrice,
    color: stroke,
    confidence: 88,
    category: 'structure',
    overlayZoneExtraClass: setExtra('merged-desk-thismuch-edge-tg'),
    zoneFaceBase: `목표선 · ${targetKo}`,
  });
  labelTargets.push({ id: THIS_MUCH_IDS.edgeTg, label: `목표선 · ${targetKo}` });

  priceLines.push({
    price: entry.mid,
    color: hex,
    title: `${touchFace}·${fmtPx(entry.mid)}`,
    lineWidth: 2,
    lineStyle: 'dashed',
    axisLabel: true,
  });
  priceLines.push({
    price: targetPrice,
    color: hex,
    title: `목표선·${fmtPx(targetPrice)}`,
    lineWidth: 2,
    lineStyle: 'dotted',
    axisLabel: true,
  });

  return {
    enabled: true,
    lookback,
    side: corridor,
    dropPct,
    risePct,
    swingHigh: Math.max(yoHi, yiHi),
    swingLow: Math.min(yoLo, yiLo),
    targetPrice,
    overlays,
    priceLines,
    labelTargets,
    summaryKo: `${tf} · ${yoLabel} · ${yiLabel}${usedFallback ? ' ·폴백' : ''}${waitConflict ? ' ·WAIT' : ''} ·A세트`,
  };
}
