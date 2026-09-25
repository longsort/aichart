/**
 * 펀딩·OI 한 줄 합류 + 청산 밀집 가격선 (전폭 createPriceLine).
 * 확정 자리 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';

function fmt(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

export function buildMergedDeskDerivativesPriceLines(
  analysis: AnalyzeResponse | null,
  candles: Candle[]
): AtlasPulsePriceLine[] {
  if (!analysis || candles.length < 2) return [];
  const um = analysis.unifiedMarketMetrics;
  const close = Number(candles[candles.length - 1]?.close) || Number(analysis.currentPrice) || 0;
  const out: AtlasPulsePriceLine[] = [];

  const longP = Number(um?.liqClusterLongPrice);
  const shortP = Number(um?.liqClusterShortPrice);
  if (longP > 0 && Math.abs(longP - close) / Math.max(close, 1e-9) < 0.12) {
    out.push({
      price: longP,
      color: 'rgba(251,113,133,0.88)',
      title: `롱청산밀집·${fmt(longP)}`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  if (shortP > 0 && Math.abs(shortP - close) / Math.max(close, 1e-9) < 0.12) {
    out.push({
      price: shortP,
      color: 'rgba(52,211,153,0.88)',
      title: `숏청산밀집·${fmt(shortP)}`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  return out.slice(0, 2);
}
