import type { Candle, OverlayItem } from '@/types';
import {
  getLastInstitutionalBandEdges,
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
} from '@/lib/institutionalSuperBand';
import {
  computeInstitutionalBandSrProb,
  computePriceBandSrProb,
  appendSrProbToLabel,
} from '@/lib/zoneSupportResistProb';

/**
 * 기관 SuperTrend 하단(지지)·상단(저항) 가격대에 얇은 수평 존 면.
 * 지지/저항% = 과거 밴드 터치 실측 (가짜 70 금지).
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
  const period = opts.period ?? INSTITUTIONAL_BAND_DEFAULT_PERIOD;
  const mult = opts.mult ?? INSTITUTIONAL_BAND_DEFAULT_MULT;
  const edges = getLastInstitutionalBandEdges(candles, period, mult);
  if (!edges) return [];

  const core = computeInstitutionalSuperTrendCore(candles, period, mult);
  const bandProb =
    core != null
      ? computeInstitutionalBandSrProb(candles, core.finalLower, core.finalUpper)
      : null;

  const t0 = Number(candles[0].time);
  const t1 = Number(candles[candles.length - 1].time);
  const w = Math.max(0.0003, Math.min(0.02, opts.widthPct));
  const out: OverlayItem[] = [];

  if (opts.showBuySupport) {
    const c = edges.lower;
    const pLo = c * (1 - w);
    const pHi = c * (1 + w);
    const local = computePriceBandSrProb(candles, pLo, pHi);
    const supportProb = bandProb?.supportProb ?? local.supportProb;
    const resistanceProb = bandProb?.resistanceProb ?? local.resistanceProb;
    const conf =
      supportProb != null
        ? supportProb
        : local.confidence != null
          ? local.confidence
          : null;
    const baseLabel = '매수·지지';
    const label = appendSrProbToLabel(baseLabel, {
      supportProb,
      resistanceProb: null,
      labelKo: '',
    });
    out.push({
      id: 'inst-sr-band-buy',
      kind: 'zone',
      label,
      category: 'institutionalSrBand',
      x1: t0,
      y1: pLo,
      x2: t1,
      y2: pHi,
      time1: t0,
      time2: t1,
      price1: pLo,
      price2: pHi,
      confidence: conf ?? 50,
      supportProb,
      resistanceProb,
      probSamples: bandProb?.supportTouches ?? local.supportTouches,
      color: 'rgba(34,197,94,0.16)',
      lineLabelColor: '#22c55e',
      labelBackgroundColor: 'rgba(21,128,61,0.88)',
      labelTextColor: '#ecfdf5',
      labelTooltip: `기관 하단밴드 · ${bandProb?.labelKo || local.labelKo} · 확정아님`,
      zoneFaceBase: label,
      zoneFaceSignal:
        supportProb != null ? `지지${supportProb}%` : '표본대기',
      zoneFaceDetailKo: `기관지지 · ${bandProb?.labelKo || local.labelKo}`,
    });
  }
  if (opts.showSellResistance) {
    const c = edges.upper;
    const pLo = c * (1 - w);
    const pHi = c * (1 + w);
    const local = computePriceBandSrProb(candles, pLo, pHi);
    const supportProb = bandProb?.supportProb ?? local.supportProb;
    const resistanceProb = bandProb?.resistanceProb ?? local.resistanceProb;
    const conf =
      resistanceProb != null
        ? resistanceProb
        : local.confidence != null
          ? local.confidence
          : null;
    const baseLabel = '매도·저항';
    const label = appendSrProbToLabel(baseLabel, {
      supportProb: null,
      resistanceProb,
      labelKo: '',
    });
    out.push({
      id: 'inst-sr-band-sell',
      kind: 'zone',
      label,
      category: 'institutionalSrBand',
      x1: t0,
      y1: pLo,
      x2: t1,
      y2: pHi,
      time1: t0,
      time2: t1,
      price1: pLo,
      price2: pHi,
      confidence: conf ?? 50,
      supportProb,
      resistanceProb,
      probSamples: bandProb?.resistTouches ?? local.resistTouches,
      color: 'rgba(239,68,68,0.16)',
      lineLabelColor: '#ef4444',
      labelBackgroundColor: 'rgba(185,28,28,0.88)',
      labelTextColor: '#fef2f2',
      labelTooltip: `기관 상단밴드 · ${bandProb?.labelKo || local.labelKo} · 확정아님`,
      zoneFaceBase: label,
      zoneFaceSignal:
        resistanceProb != null ? `저항${resistanceProb}%` : '표본대기',
      zoneFaceDetailKo: `기관저항 · ${bandProb?.labelKo || local.labelKo}`,
    });
  }
  return out;
}
