import type { Candle, OverlayItem } from '@/types';
import type { CandleTradeAtlas } from '@/lib/candleTradeAtlas';
import { monthDeskTailLabelAnchorTime } from '@/lib/monthDeskChartTailSpacing';

function fmtAtlasPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (p >= 0.01) return p.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  return p.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 });
}

function pushHLine(
  out: OverlayItem[],
  id: string,
  label: string,
  price: number,
  t1: number,
  t2: number,
  color: string,
  lineColor: string,
  opts?: { dash?: string; width?: number; z?: number }
) {
  if (!Number.isFinite(price) || price <= 0) return;
  out.push({
    id,
    kind: 'keyLevel',
    label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: price,
    price2: price,
    confidence: 92,
    color,
    lineLabelColor: lineColor,
    lineStrokeWidth: opts?.width ?? 1.85,
    lineDash: opts?.dash,
    category: 'labels',
    overlayZoneExtraClass: 'overlay-zone--trade-atlas-line',
    labelTooltip: `${label} · 참고(확정 아님)`,
  });
}

function pushZone(
  out: OverlayItem[],
  id: string,
  label: string,
  low: number,
  high: number,
  t1: number,
  t2: number,
  fill: string,
  line: string,
  side: 'long' | 'short'
) {
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return;
  out.push({
    id,
    kind: side === 'long' ? 'demandZone' : 'supplyZone',
    label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1,
    time2: t2,
    price1: high,
    price2: low,
    confidence: 88,
    color: fill,
    lineLabelColor: line,
    category: 'labels',
    zonePulse: true,
    zoneFillPreserve: true,
    overlayZoneExtraClass: `overlay-zone--trade-atlas overlay-zone--trade-atlas-${side}`,
    labelTooltip: `${label} · ${side === 'long' ? '롱' : '숏'} 관심 구간(참고)`,
  });
}

/** 차트 가로선·존 — trade-atlas- 프리픽스 (일괄 숨김 예외) */
export function buildCandleTradeAtlasOverlays(
  atlas: CandleTradeAtlas,
  candles: Candle[],
  opts?: { showZones?: boolean; showLevels?: boolean; timeframe?: string }
): OverlayItem[] {
  if (candles.length < 2) return [];
  const showZones = opts?.showZones !== false;
  const showLevels = opts?.showLevels !== false;
  const t1 = candles[0].time as number;
  const t2 = monthDeskTailLabelAnchorTime(candles, opts?.timeframe ?? atlas.timeframe ?? '1h');
  const out: OverlayItem[] = [];
  const v = atlas.verdict;

  if (showZones) {
    if (atlas.longZone) {
      pushZone(
        out,
        'trade-atlas-long-zone',
        `▲ 롱 · ${atlas.longZone.labelKo}`,
        atlas.longZone.low,
        atlas.longZone.high,
        t1,
        t2,
        'rgba(34,197,94,0.16)',
        '#4ade80',
        'long'
      );
    }
    if (atlas.shortZone) {
      pushZone(
        out,
        'trade-atlas-short-zone',
        `▼ 숏 · ${atlas.shortZone.labelKo}`,
        atlas.shortZone.low,
        atlas.shortZone.high,
        t1,
        t2,
        'rgba(239,68,68,0.14)',
        '#f87171',
        'short'
      );
    }
    if (atlas.entryBand) {
      pushZone(
        out,
        'trade-atlas-entry-band',
        v === 'SHORT' ? '★ 숏 타점' : v === 'LONG' ? '★ 롱 타점' : '★ 핵심 타점',
        atlas.entryBand.low,
        atlas.entryBand.high,
        t1,
        t2,
        v === 'SHORT'
          ? 'rgba(248,113,113,0.12)'
          : v === 'LONG'
            ? 'rgba(74,222,128,0.12)'
            : 'rgba(250,204,21,0.12)',
        v === 'SHORT' ? '#fca5a5' : v === 'LONG' ? '#86efac' : '#fde047',
        v === 'SHORT' ? 'short' : 'long'
      );
    }
  }

  if (!showLevels) return out;

  pushHLine(
    out,
    'trade-atlas-entry',
    v === 'SHORT'
      ? `★ 숏 진입 E · ${fmtAtlasPrice(atlas.entry)}`
      : v === 'LONG'
        ? `★ 롱 진입 E · ${fmtAtlasPrice(atlas.entry)}`
        : `★ 진입 E · ${fmtAtlasPrice(atlas.entry)}`,
    atlas.entry,
    t1,
    t2,
    'rgba(250,204,21,0.62)',
    '#fde047',
    { width: 2.2 }
  );

  pushHLine(
    out,
    'trade-atlas-sl',
    `⛔ 손절 SL · ${fmtAtlasPrice(atlas.stopLoss)}`,
    atlas.stopLoss,
    t1,
    t2,
    'rgba(248,113,113,0.55)',
    '#f87171',
    { dash: '6 4', width: 1.75 }
  );

  const tpColors = ['#4ade80', '#34d399', '#2dd4bf'];
  atlas.takeProfits.forEach((tp, i) => {
    pushHLine(
      out,
      `trade-atlas-tp${i + 1}`,
      `${tp.label} · ${fmtAtlasPrice(tp.price)}`,
      tp.price,
      t1,
      t2,
      'rgba(52,211,153,0.48)',
      tpColors[i] ?? '#86efac',
      { width: 1.55 }
    );
  });

  return out;
}
