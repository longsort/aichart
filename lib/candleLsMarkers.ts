import type { AnalyzeResponse, Candle } from '@/types';

/** lightweight-charts 시리즈 마커와 동형 */
export type ChartSeriesMarker = {
  time: number;
  position: 'aboveBar' | 'belowBar';
  shape: 'circle';
  color: string;
  text: string;
  size?: number;
};

/**
 * 분석 캔들 점수·엔진 타이롱 신호로 보조 L/S 마커 생성.
 * 차트에 이미 L/🚀 등이 있는 time은 호출측에서 스킵.
 */
export function buildCandleAnalysisMarkers(params: {
  analysis: AnalyzeResponse;
  candles: Candle[];
  symbol: string;
  timeframe: string;
  maxTotal: number;
  showTailong: boolean;
  showCandleScores: boolean;
  /** A: 점수 숫자를 마커 텍스트에 붙임 */
  metaA?: boolean;
}): ChartSeriesMarker[] {
  const { analysis, candles, symbol, timeframe, maxTotal, showTailong, showCandleScores, metaA } = params;
  const out: ChartSeriesMarker[] = [];
  if (!candles.length || maxTotal <= 0) return out;
  const a = analysis as AnalyzeResponse & { candles?: Candle[] };
  const match = a.symbol === symbol && a.timeframe === timeframe;
  const src = match && Array.isArray(a.candles) && a.candles.length ? a.candles : candles;
  const candleSet = new Set(candles.map((c) => c.time as number));

  const pushUnique = (time: number, position: 'aboveBar' | 'belowBar', color: string, text: string) => {
    if (out.length >= maxTotal) return;
    if (!candleSet.has(time)) return;
    out.push({ time, position, shape: 'circle', color, text });
  };

  if (showCandleScores && analysis.candleScores?.length) {
    const scored = [...analysis.candleScores].filter((row) => {
      const idx = row.index;
      if (idx < 0 || idx >= src.length) return false;
      const sc = Number(row.score ?? 50);
      const volumeConfirmed = (row as { volumeConfirmed?: boolean }).volumeConfirmed !== false;
      const strong = row.strength === 'strong' && sc >= 70 && volumeConfirmed;
      if (!strong) return false;
      return row.bullish === true || row.bullish === false;
    });
    for (const row of scored.reverse()) {
      const idx = row.index;
      const t = src[idx].time as number;
      const sc = Number(row.score ?? 50);
      const scSuf = metaA ? `${Math.round(sc)}` : '';
      if (row.bullish === true) {
        const base = sc >= 62 ? 'C↑' : 'c+';
        pushUnique(t, 'belowBar', '#4ADE80', metaA ? `${base}${scSuf}` : base);
      } else if (row.bullish === false) {
        const base = sc >= 62 ? 'C↓' : 'c-';
        pushUnique(t, 'aboveBar', '#F87171', metaA ? `${base}${scSuf}` : base);
      }
    }
  }

  if (showTailong) {
    const raw = ((analysis as { engine?: { tailongCloseSignals?: Array<{ bias: string; strength: string }> } }).engine?.tailongCloseSignals ??
      []) as Array<{ bias: string; strength: string }>;
    const lastT = candles[candles.length - 1]?.time as number | undefined;
    if (lastT != null && raw.length) {
      let bull = false;
      let bear = false;
      for (const s of raw) {
        if (s.bias === 'bullish') bull = true;
        if (s.bias === 'bearish') bear = true;
      }
      if (bull && !bear) pushUnique(lastT, 'belowBar', '#86EFAC', metaA ? 'T↑·종가' : 'T↑');
      else if (bear && !bull) pushUnique(lastT, 'aboveBar', '#FCA5A5', metaA ? 'T↓·종가' : 'T↓');
    }
  }

  return out;
}
