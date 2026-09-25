/**
 * 마감·안착 — **핵심롱·핵심숏** $$$$ 타점 zone 동시 표시 (TF 공통).
 */
import type { Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { monthDeskTrainerMoneyColors } from '@/lib/monthDeskChartTrainerTheme';
import {
  MONTH_DESK_MONEY_LABEL,
  monthDeskCoreMoneyEntryLabel,
  monthDeskMoneyDirectionHint,
  monthDeskMoneySideKo,
  type MonthDeskMoneyZone,
} from '@/lib/monthDeskMoneyZone';
import {
  extractMonthDeskMoneyAnchors,
  resolveMonthDeskMoneyPoolGeometry,
} from '@/lib/monthDeskMoneyAnchors';
import { tightenMoneyZoneVerticalSpan } from '@/lib/monthDeskMoneyZone';

export const MONTH_DESK_CORE_LONG_ID = 'month-desk-core-money-long';
export const MONTH_DESK_CORE_SHORT_ID = 'month-desk-core-money-short';

export const MONTH_DESK_CORE_ENTRY_IDS = new Set([
  MONTH_DESK_CORE_LONG_ID,
  MONTH_DESK_CORE_SHORT_ID,
  'month-desk-core-money-entry',
]);

export function isMonthDeskCoreMoneyEntryId(id: string): boolean {
  const zid = String(id || '');
  return MONTH_DESK_CORE_ENTRY_IDS.has(zid) || zid.startsWith('month-desk-core-money-');
}

function bestPool(pools: MonthDeskMoneyZone[], side: 'LONG' | 'SHORT'): MonthDeskMoneyZone | null {
  const list = pools.filter((p) => p.side === side).sort((a, b) => b.strength - a.strength);
  return list[0] ?? null;
}

/** 상승 → 숏($$$$ 위) 강조 · 하락 → 롱($$$$ 아래) 강조 */
export function resolveMonthDeskCoreEmphasisSide(
  candles: Candle[],
  longMid: number | null,
  shortMid: number | null
): 'LONG' | 'SHORT' | null {
  const n = candles.length;
  if (n < 6) return null;
  const close = Number(candles[n - 1]?.close);
  const ref = Number(candles[Math.max(0, n - 8)]?.close);
  if (!Number.isFinite(close) || !Number.isFinite(ref) || ref <= 0) return null;
  const ret = (close - ref) / ref;
  if (ret > 0.0018) return 'SHORT';
  if (ret < -0.0018) return 'LONG';
  if (longMid != null && shortMid != null && Number.isFinite(close)) {
    const dL = Math.abs(close - longMid);
    const dS = Math.abs(close - shortMid);
    if (dL < dS * 0.82) return 'LONG';
    if (dS < dL * 0.82) return 'SHORT';
  }
  return null;
}

function buildSideCoreZone(
  pool: MonthDeskMoneyZone,
  candles: Candle[],
  emphasis: 'LONG' | 'SHORT' | null,
  timeframe?: string,
  fusionNote?: string
): OverlayItem[] {
  const isLong = pool.side === 'LONG';
  const sideTag = isLong ? 'long' : 'short';
  const zoneId = isLong ? MONTH_DESK_CORE_LONG_ID : MONTH_DESK_CORE_SHORT_ID;
  const tc = monthDeskTrainerMoneyColors(isLong);
  const sideKo = monthDeskMoneySideKo(pool.side);
  const emphasized = emphasis === pool.side;
  const dimmed = emphasis != null && !emphasized;

  const anchors = extractMonthDeskMoneyAnchors([]);
  const geom = resolveMonthDeskMoneyPoolGeometry(pool, candles, anchors, { tightCore: true });
  const chartTf = normalizeChartTimeframe(timeframe ?? '4h');
  const atrHint = Math.max((geom.priceTop - geom.priceBot) * 0.5, Math.abs(pool.priceMid) * 0.003);
  const capped = tightenMoneyZoneVerticalSpan(
    geom.priceTop,
    geom.priceBot,
    pool.priceMid,
    atrHint,
    chartTf
  );

  const tip = [
    `${monthDeskCoreMoneyEntryLabel(pool.side)} — ${pool.headlineKo}`,
    monthDeskMoneyDirectionHint(pool.side),
    fusionNote ? `연합: ${fusionNote}` : '',
    emphasized ? '현재 흐름에서 우선 참고 구간' : dimmed ? '반대편 유동성 — 스윕·되돌림 참고' : '',
    '교육·참고 — 확정 매매 아님',
  ]
    .filter(Boolean)
    .join('\n');

  const pulse = emphasized ? ' overlay-zone--core-pulse' : '';
  const emphCls = emphasized
    ? ' overlay-zone--monthdesk-core-emphasis'
    : dimmed
      ? ' overlay-zone--monthdesk-core-dim'
      : '';
  const extraClass =
    `overlay-zone--monthdesk-core-money-entry overlay-zone--monthdesk-core-money-${sideTag} overlay-zone--monthdesk-money--${sideTag} overlay-zone--monthdesk-money--primary${pulse}${emphCls}`.trim();

  const out: OverlayItem[] = [
    {
      id: zoneId,
      kind: isLong ? 'demandZone' : 'supplyZone',
      label: monthDeskCoreMoneyEntryLabel(pool.side),
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: geom.time1,
      time2: geom.time2,
      price1: capped.top,
      price2: capped.bot,
      confidence: Math.min(98, Math.round(pool.strength) + (emphasized ? 6 : 0)),
      color: tc.fill,
      category: 'scenario',
      labelTooltip: tip,
      zoneFillPreserve: true,
      zonePulse: emphasized,
      lineLabelColor: tc.borderGold,
      labelBackgroundColor: tc.bg,
      labelTextColor: tc.text,
      overlayZoneExtraClass: extraClass,
      noProject: true,
    },
    {
      id: `${zoneId}-liq`,
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: geom.time1,
      time2: geom.time2,
      price1: pool.priceMid,
      price2: pool.priceMid,
      confidence: 88,
      color: tc.line,
      lineDash: '6 4',
      category: 'scenario',
      labelTooltip: `${sideKo} ${MONTH_DESK_MONEY_LABEL} 유동성`,
      noProject: true,
    },
  ];

  if (pool.swept) {
    const sweepTime =
      pool.anchorTimes?.length ? pool.anchorTimes[pool.anchorTimes.length - 1]! : pool.barTimeEnd;
    if (sweepTime != null && Number.isFinite(sweepTime)) {
      const sweepIdx = candles.findIndex((c) => Number(c.time) === sweepTime);
      const c = sweepIdx >= 0 ? candles[sweepIdx] : candles[candles.length - 1];
      const sweepPx = isLong ? c?.low : c?.high;
      if (c && Number.isFinite(sweepPx)) {
        out.push({
          id: `${zoneId}-sweep`,
          kind: 'label',
          label: `${sideKo}×`,
          x1: 0,
          y1: 0,
          time1: sweepTime,
          price1: Number(sweepPx),
          confidence: 92,
          color: tc.text,
          lineLabelColor: tc.borderGold,
          labelBackgroundColor: tc.bg,
          labelTextColor: tc.text,
          category: 'scenario',
          labelTooltip: `${sideKo} 스윕 — ${monthDeskMoneyDirectionHint(pool.side)}`,
          noProject: true,
        });
      }
    }
  }

  return out;
}

export function buildMonthDeskDualCoreMoneyOverlays(input: {
  pools: MonthDeskMoneyZone[];
  candles: Candle[];
  timeframe?: string;
  fusionNote?: string;
}): OverlayItem[] {
  const { pools, candles, timeframe, fusionNote } = input;
  if (candles.length < 12 || !pools.length) return [];

  const longPool = bestPool(pools, 'LONG');
  const shortPool = bestPool(pools, 'SHORT');
  if (!longPool && !shortPool) return [];

  const emphasis = resolveMonthDeskCoreEmphasisSide(
    candles,
    longPool?.priceMid ?? null,
    shortPool?.priceMid ?? null
  );

  const out: OverlayItem[] = [];
  if (longPool) {
    out.push(...buildSideCoreZone(longPool, candles, emphasis, timeframe, fusionNote));
  }
  if (shortPool) {
    out.push(...buildSideCoreZone(shortPool, candles, emphasis, timeframe, fusionNote));
  }
  return out;
}

export function monthDeskHistoricalMaxPerSide(tf: string): number {
  const t = normalizeChartTimeframe(tf);
  if (t === '1w' || t === '1M' || t === '1Y') return 3;
  if (t === '1d' || t === '4h') return 2;
  return 2;
}
