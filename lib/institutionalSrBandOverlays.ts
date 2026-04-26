import type { Candle, OverlayItem } from '@/types';
import { getLastInstitutionalBandEdges, INSTITUTIONAL_BAND_DEFAULT_MULT, INSTITUTIONAL_BAND_DEFAULT_PERIOD } from '@/lib/institutionalSuperBand';

/**
 * 기관 SuperTrend 하단(지지)·상단(저항) 가격대에 얇은 수평 존 면 — 차트만 봐도 구간 인지용.
 */
export function buildInstitutionalSrBandOverlays(
  candles: Candle[],
  opts: {
    showBuySupport: boolean;
    showSellResistance: boolean;
    widthPct: number;
    period?: number;
    mult?: number;
  }
): OverlayItem[] {
  if (!candles.length || (!opts.showBuySupport && !opts.showSellResistance)) return [];
  const edges = getLastInstitutionalBandEdges(
    candles,
    opts.period ?? INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    opts.mult ?? INSTITUTIONAL_BAND_DEFAULT_MULT
  );
  if (!edges) return [];
  const t0 = Number(candles[0].time);
  const t1 = Number(candles[candles.length - 1].time);
  const w = Math.max(0.0003, Math.min(0.02, opts.widthPct));
  const out: OverlayItem[] = [];

  if (opts.showBuySupport) {
    const c = edges.lower;
    const pLo = c * (1 - w);
    const pHi = c * (1 + w);
    out.push({
      id: 'inst-sr-band-buy',
      kind: 'zone',
      label: '매수·지지',
      category: 'institutionalSrBand',
      x1: t0,
      y1: pLo,
      x2: t1,
      y2: pHi,
      time1: t0,
      time2: t1,
      price1: pLo,
      price2: pHi,
      confidence: 70,
      color: 'rgba(34,197,94,0.16)',
      lineLabelColor: '#22c55e',
      labelBackgroundColor: 'rgba(21,128,61,0.88)',
      labelTextColor: '#ecfdf5',
      labelTooltip: '기관 스텝(하단 밴드) 기준 근접 면 — 참고용',
    });
  }
  if (opts.showSellResistance) {
    const c = edges.upper;
    const pLo = c * (1 - w);
    const pHi = c * (1 + w);
    out.push({
      id: 'inst-sr-band-sell',
      kind: 'zone',
      label: '매도·저항',
      category: 'institutionalSrBand',
      x1: t0,
      y1: pLo,
      x2: t1,
      y2: pHi,
      time1: t0,
      time2: t1,
      price1: pLo,
      price2: pHi,
      confidence: 70,
      color: 'rgba(239,68,68,0.16)',
      lineLabelColor: '#ef4444',
      labelBackgroundColor: 'rgba(185,28,28,0.88)',
      labelTextColor: '#fef2f2',
      labelTooltip: '기관 스텝(상단 밴드) 기준 근접 면 — 참고용',
    });
  }
  return out;
}
