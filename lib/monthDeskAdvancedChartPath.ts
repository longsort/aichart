/**
 * 마감·안착 — 고급 차트 경로: 평행 채널 추세선 + 미래 예측(고스트) 캔들 + 타점 라벨
 * 참고·시나리오용 — 확정 수익·승률 표현 없음
 */
import type { UTCTimestamp } from 'lightweight-charts';
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import {
  monthDeskTailLabelAnchorTime,
  monthDeskTailLabelAnchorXNorm,
} from '@/lib/monthDeskChartTailSpacing';

export type MonthDeskAdvancedChartPath = {
  overlays: OverlayItem[];
  projectedCandles: Candle[];
  summaryKo: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
};

function barDurationMs(candles: Candle[]): number {
  if (candles.length < 2) return 3600_000;
  const d = Number(candles[candles.length - 1].time) - Number(candles[candles.length - 2].time);
  if (d > 0 && d < 86400_000 * 45) return d;
  return 3600_000;
}

function toRatio(price: number, min: number, max: number): number {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

function fmtPriceK(p: number): string {
  if (p >= 1000) return `$${(p / 1000).toFixed(p >= 10000 ? 1 : 2)}K`;
  return `$${p.toFixed(2)}`;
}

function projectedBarCount(tf: string, n: number): number {
  const t = tf.toLowerCase();
  if (t.includes('1m') || t === '3m' || t === '5m') return Math.min(24, Math.max(12, Math.floor(n * 0.08)));
  if (t.includes('15m') || t.includes('30m')) return Math.min(18, 12);
  if (t.includes('1h') || t.includes('2h')) return Math.min(14, 10);
  if (t.includes('4h')) return Math.min(12, 8);
  if (t.includes('1d') || t.includes('d')) return Math.min(10, 6);
  return 10;
}

/** 시나리오 A 경로로 미래 OHLC 캔들 생성 (하얀 고스트용) */
export function buildMonthDeskProjectedCandles(
  candles: Candle[],
  analysis: AnalyzeResponse | null
): Candle[] {
  if (!analysis || candles.length < 5) return [];
  const verdict =
    analysis.verdict === 'LONG' ? 'LONG' : analysis.verdict === 'SHORT' ? 'SHORT' : 'WAIT';
  if (verdict === 'WAIT') return [];

  const visible = candles;
  const last = visible[visible.length - 1];
  const barMs = barDurationMs(visible);
  const close0 = Number(last.close);
  if (!Number.isFinite(close0)) return [];

  const pathA = analysis.futurePaths?.find((p) => p.path === 'A') ?? analysis.futurePaths?.[0];
  let target = pathA?.targets?.[pathA.targets.length - 1] ?? pathA?.targets?.[0];
  if (target == null || !Number.isFinite(target)) {
    const sup = analysis.supportLevel?.price;
    const res = analysis.resistanceLevel?.price;
    const inv = analysis.invalidationLevel?.price;
    if (verdict === 'LONG') target = res ?? close0 * 1.02;
    else target = sup ?? close0 * 0.98;
    if (inv != null && Number.isFinite(inv)) {
      target = verdict === 'LONG' ? Math.max(target, close0) : Math.min(target, close0);
    }
  }

  const atr =
    analysis.indicators?.atr?.length != null
      ? Number(analysis.indicators.atr[analysis.indicators.atr.length - 1])
      : close0 * 0.012;
  const nBars = projectedBarCount(analysis.timeframe ?? '1h', visible.length);
  const out: Candle[] = [];
  let prevClose = close0;

  for (let i = 1; i <= nBars; i++) {
    const t = Number(last.time) + barMs * i;
    const progress = i / nBars;
    const eased = progress * progress * (3 - 2 * progress);
    const idealClose = close0 + (target - close0) * eased;
    const noise = (Math.sin(i * 1.7) * 0.15 + Math.cos(i * 0.9) * 0.1) * atr;
    const close = idealClose + noise;
    const open = prevClose;
    const bodyTop = Math.max(open, close);
    const bodyBot = Math.min(open, close);
    const wick = atr * (0.35 + 0.12 * Math.abs(Math.sin(i * 2.3)));
    const high = bodyTop + wick * (verdict === 'LONG' && i > nBars * 0.6 ? 0.5 : 1);
    const low = bodyBot - wick * (verdict === 'SHORT' && i > nBars * 0.6 ? 0.5 : 1);
    out.push({
      time: t,
      open,
      high: Math.max(high, bodyTop),
      low: Math.min(low, bodyBot),
      close,
      volume: 0,
    });
    prevClose = close;
  }
  return out;
}

export function buildMonthDeskAdvancedChartPath(input: {
  candles: Candle[];
  analysis: AnalyzeResponse | null;
  timeframe?: string;
  extendBars?: number;
}): MonthDeskAdvancedChartPath | null {
  const { candles, analysis } = input;
  const n = candles.length;
  if (n < 12 || !analysis) return null;

  const verdict =
    analysis.verdict === 'LONG' ? 'LONG' : analysis.verdict === 'SHORT' ? 'SHORT' : 'WAIT';
  const visible = candles;
  let min = Infinity;
  let max = -Infinity;
  for (const c of visible) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  const pad = (max - min) * 0.06;
  min -= pad;
  max += pad;

  const overlays: OverlayItem[] = [];

  const projectedCandles = buildMonthDeskProjectedCandles(visible, analysis);
  if (projectedCandles.length > 0) {
    const lastT = Number(visible[n - 1].time);
    overlays.push({
      id: 'md-path-future-divider',
      kind: 'trendLine',
      label: '예측 구간',
      x1: (n - 1) / Math.max(1, n - 1),
      y1: 0.02,
      x2: (n - 1) / Math.max(1, n - 1),
      y2: 0.98,
      time1: lastT,
      time2: lastT,
      price1: max,
      price2: min,
      confidence: 70,
      color: 'rgba(34,211,238,0.45)',
      lineDash: '2 8',
      category: 'scenario',
      noProject: true,
    });

    const parsePx = (s: string | undefined): number | null => {
      if (!s) return null;
      const n = parseFloat(String(s).replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const entry =
      parsePx(analysis.entry) ??
      analysis.zoneBiasCard?.low ??
      analysis.currentPrice ??
      visible[n - 1].close;
    const inv = analysis.invalidationLevel?.price ?? parsePx(analysis.stopLoss);
    const tp1 =
      projectedCandles[projectedCandles.length - 1]?.close ??
      parsePx(analysis.targets?.[0]) ??
      (verdict === 'LONG' ? analysis.resistanceLevel?.price : analysis.supportLevel?.price) ??
      null;
    const endT = Number(projectedCandles[projectedCandles.length - 1].time);
    const tf = input.timeframe ?? analysis.timeframe ?? '1h';
    const labelT = monthDeskTailLabelAnchorTime(visible, tf);
    const labelX = monthDeskTailLabelAnchorXNorm(visible, tf);
    const dirKo = verdict === 'LONG' ? '롱' : '숏';

    if (entry != null && Number.isFinite(entry)) {
      overlays.push({
        id: 'md-path-entry',
        kind: 'label',
        label: `★ ${dirKo} 타점 ${fmtPriceK(entry)}`,
        x1: labelX,
        y1: toRatio(entry, min, max),
        time1: labelT,
        price1: entry,
        confidence: 88,
        color: verdict === 'LONG' ? 'rgba(74,222,128,0.98)' : 'rgba(248,113,113,0.98)',
        category: 'labels',
      });
    }
    if (tp1 != null && Number.isFinite(tp1)) {
      overlays.push({
        id: 'md-path-tp1',
        kind: 'label',
        label: `TP1 ${fmtPriceK(tp1)} · 시나리오 A`,
        x1: Math.min(1.12, labelX + 0.04),
        y1: toRatio(tp1, min, max),
        time1: endT,
        price1: tp1,
        confidence: 80,
        color: 'rgba(248,250,252,0.95)',
        labelBackgroundColor: 'rgba(30,27,75,0.85)',
        labelTextColor: '#e0e7ff',
        category: 'labels',
      });
    }
    if (inv != null && Number.isFinite(inv)) {
      overlays.push({
        id: 'md-path-invalidation',
        kind: 'label',
        label: `무효 ${fmtPriceK(inv)}`,
        x1: Math.max(0.85, labelX - 0.03),
        y1: toRatio(inv, min, max),
        time1: labelT,
        price1: inv,
        confidence: 78,
        color: 'rgba(251,191,36,0.95)',
        category: 'labels',
      });
    }
  }

  const beamPts = analysis.beamPathForecast?.points;
  const beam =
    beamPts && beamPts.length > 0
      ? {
          dominant: analysis.beamPathForecast!.dominant,
          confidence: analysis.beamPathForecast!.confidence,
        }
      : null;

  const summaryKo = [
    `${verdict === 'LONG' ? '롱' : verdict === 'SHORT' ? '숏' : '관망'} 시나리오 · LinReg+예측캔들(참고)`,
    projectedCandles.length ? `미래 ${projectedCandles.length}봉 경로 A` : '',
    beam ? `빔 ${beam.dominant} ${beam.confidence}%` : '',
    '확정·실매매 아님 — 무효 이탈 시 재검토',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    overlays,
    projectedCandles,
    summaryKo,
    direction: verdict,
  };
}

/** LWC 보조 시리즈용 캔들 데이터 */
export function monthDeskProjectedToLwc(
  projected: Candle[]
): Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }> {
  return projected.map((c) => ({
    time: Math.floor(Number(c.time) / 1000) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}
