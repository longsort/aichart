import type { Candle, OverlayItem } from '@/types';
import { getLastInstitutionalBandEdges, INSTITUTIONAL_BAND_DEFAULT_MULT, INSTITUTIONAL_BAND_DEFAULT_PERIOD } from '@/lib/institutionalSuperBand';

/**
 * 기관 SuperTrend 밴드 대비 종가 위치로 롱·숏 관심 구간 근접 힌트(라벨).
 * 투자 권유·확정 신호가 아닌 참고용.
 */
export function buildWhaleZoneRecognitionOverlays(candles: Candle[]): OverlayItem[] {
  if (candles.length < 3) return [];
  const edges = getLastInstitutionalBandEdges(candles, INSTITUTIONAL_BAND_DEFAULT_PERIOD, INSTITUTIONAL_BAND_DEFAULT_MULT);
  if (!edges) return [];
  const last = candles[candles.length - 1];
  const close = last.close;
  const t = Number(last.time);
  const span = Math.max(1e-9, edges.upper - edges.lower);
  /** 밴드 내 하단 22% → 지지(롱) 맥락, 상단 22% → 저항(숏) 맥락 */
  const fracLower = 0.22;
  const nearLower = close <= edges.lower + span * fracLower;
  const nearUpper = close >= edges.upper - span * fracLower;
  const out: OverlayItem[] = [];
  if (nearLower && !nearUpper) {
    out.push({
      id: 'whale-zone-long-context',
      kind: 'label',
      label: '롱·지지 구간',
      x1: t,
      y1: edges.lower,
      time1: t,
      price1: edges.lower,
      confidence: 55,
      color: '#22c55e',
      labelBackgroundColor: 'rgba(21,128,61,0.92)',
      labelTextColor: '#ecfdf5',
      category: 'whaleToolkit',
      labelTooltip: '기관 밴드 하단부 근처 — 참고용',
    });
  }
  if (nearUpper && !nearLower) {
    out.push({
      id: 'whale-zone-short-context',
      kind: 'label',
      label: '숏·저항 구간',
      x1: t,
      y1: edges.upper,
      time1: t,
      price1: edges.upper,
      confidence: 55,
      color: '#ef4444',
      labelBackgroundColor: 'rgba(185,28,28,0.92)',
      labelTextColor: '#fef2f2',
      category: 'whaleToolkit',
      labelTooltip: '기관 밴드 상단부 근처 — 참고용',
    });
  }
  if (nearLower && nearUpper) {
    out.push({
      id: 'whale-zone-squeeze',
      kind: 'label',
      label: '밴드 수렴',
      x1: t,
      y1: (edges.lower + edges.upper) / 2,
      time1: t,
      price1: (edges.lower + edges.upper) / 2,
      confidence: 52,
      color: '#eab308',
      labelBackgroundColor: 'rgba(113,63,18,0.9)',
      labelTextColor: '#fffbeb',
      category: 'whaleToolkit',
      labelTooltip: '상·하단 동시 근접(좁은 변동) — 참고용',
    });
  }
  return out;
}
