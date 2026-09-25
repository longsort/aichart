import type { Candle } from '@/types';
import { ema, macd, rsi } from '@/lib/indicators';

export type VolumeShockConfluence = {
  emaBias: 'up' | 'down' | 'flat';
  rsi: number;
  macdBias: 'bull' | 'bear' | 'neutral';
  /** 거래량 쇼크 방향과 맞는 지표 수 (0~3) */
  alignScore: number;
};

export function volumeShockConfluenceAt(candles: Candle[], idx: number): VolumeShockConfluence | null {
  if (idx < 30 || idx >= candles.length) return null;
  const closes = candles.map((c) => c.close);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const close = closes[idx];
  const ema9 = e9[idx];
  const ema21 = e21[idx];
  let emaBias: 'up' | 'down' | 'flat' = 'flat';
  if (close > ema9 && ema9 >= ema21 * 0.9995) emaBias = 'up';
  else if (close < ema9 && ema9 <= ema21 * 1.0005) emaBias = 'down';

  const rsiVals = rsi(candles, 14);
  const rsiVal = Math.round(rsiVals[idx] ?? 50);

  const { hist, macd: macdLine, signal: sigLine } = macd(candles, 12, 26, 9);
  const h = hist[idx] ?? 0;
  const hPrev = hist[idx - 1] ?? 0;
  let macdBias: 'bull' | 'bear' | 'neutral' = 'neutral';
  if (h > 0 && (h > hPrev || macdLine[idx] > sigLine[idx])) macdBias = 'bull';
  else if (h < 0 && (h < hPrev || macdLine[idx] < sigLine[idx])) macdBias = 'bear';

  return { emaBias, rsi: rsiVal, macdBias, alignScore: 0 };
}

export function confluenceAlignScore(side: 'long' | 'short', c: VolumeShockConfluence): number {
  let n = 0;
  if (side === 'long') {
    if (c.emaBias === 'up') n++;
    if (c.rsi >= 45 && c.rsi <= 72) n++;
    if (c.macdBias === 'bull') n++;
  } else {
    if (c.emaBias === 'down') n++;
    if (c.rsi <= 55 && c.rsi >= 28) n++;
    if (c.macdBias === 'bear') n++;
  }
  return n;
}

/** 거래량 마커용 초단문 (예: E↑ R52 M+) */
export function formatVolumeShockConfluenceTag(side: 'long' | 'short', c: VolumeShockConfluence): string {
  const e = c.emaBias === 'up' ? 'E↑' : c.emaBias === 'down' ? 'E↓' : 'E—';
  const m = c.macdBias === 'bull' ? 'M+' : c.macdBias === 'bear' ? 'M−' : 'M0';
  const align = confluenceAlignScore(side, c);
  const star = align >= 2 ? '★' : align === 1 ? '·' : '';
  return `${e} R${c.rsi} ${m}${star}`;
}
