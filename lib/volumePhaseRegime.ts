import type { Candle } from '@/types';
import { ema, rsi } from '@/lib/indicators';
import { normalizeChartTimeframe } from '@/lib/constants';

export type TfTrend = 'up' | 'down' | 'range';
export type AtrBucket = 'compress' | 'normal' | 'expand';
export type SellPctBucket = 'sellHi' | 'sellMid' | 'sellLo';
export type RsiBucket = 'rsiHi' | 'rsiMid' | 'rsiLo';
export type HtfTrend = 'htfUp' | 'htfDown' | 'htfRange';

export type PhaseRegimeTags = {
  tfTrend: TfTrend;
  atrBucket: AtrBucket;
  sellPctBucket: SellPctBucket;
  rsiBucket: RsiBucket;
  htfTrend: HtfTrend;
};

function atrPctAt(candles: Candle[], idx: number, period = 14): number {
  if (idx < 1 || idx >= candles.length) return 0;
  const c = candles[idx];
  const prev = candles[idx - 1];
  const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  return c.close > 0 ? (tr / c.close) * 100 : 0;
}

function trendFromSlice(slice: Candle[]): TfTrend {
  if (slice.length < 8) return 'range';
  const first = slice[0].close;
  const last = slice[slice.length - 1].close;
  if (first <= 0) return 'range';
  const ch = ((last / first) - 1) * 100;
  if (ch > 1.2) return 'up';
  if (ch < -1.2) return 'down';
  return 'range';
}

export function tagRegimeAt(
  candles: Candle[],
  idx: number,
  sellPct: number,
  htfCandles?: Candle[]
): PhaseRegimeTags {
  const win = Math.min(48, idx + 1);
  const slice = candles.slice(Math.max(0, idx - win + 1), idx + 1);
  const tfTrend = trendFromSlice(slice);

  const atrs: number[] = [];
  for (let i = Math.max(1, idx - 40); i <= idx; i++) atrs.push(atrPctAt(candles, i));
  const cur = atrs[atrs.length - 1] ?? 0;
  const med = [...atrs].sort((a, b) => a - b)[Math.floor(atrs.length / 2)] ?? cur;
  let atrBucket: AtrBucket = 'normal';
  if (cur < med * 0.82) atrBucket = 'compress';
  else if (cur > med * 1.18) atrBucket = 'expand';

  let sellPctBucket: SellPctBucket = 'sellMid';
  if (sellPct >= 0.58) sellPctBucket = 'sellHi';
  else if (sellPct <= 0.42) sellPctBucket = 'sellLo';

  const rsiVals = rsi(candles, 14);
  const r = rsiVals[idx] ?? 50;
  let rsiBucket: RsiBucket = 'rsiMid';
  if (r >= 58) rsiBucket = 'rsiHi';
  else if (r <= 42) rsiBucket = 'rsiLo';

  let htfTrend: HtfTrend = 'htfRange';
  if (htfCandles && htfCandles.length >= 12) {
    const t = candles[idx]?.time ?? 0;
    let hi = 0;
    for (let i = 0; i < htfCandles.length; i++) {
      if (htfCandles[i].time <= t) hi = i;
      else break;
    }
    const htfSlice = htfCandles.slice(Math.max(0, hi - 19), hi + 1);
    const ht = trendFromSlice(htfSlice);
    htfTrend = ht === 'up' ? 'htfUp' : ht === 'down' ? 'htfDown' : 'htfRange';
  }

  return { tfTrend, atrBucket, sellPctBucket, rsiBucket, htfTrend };
}

export function buildPhaseRegimeKey(
  timeframe: string,
  eventType: 'RANGE_DIST' | 'RANGE_ACC' | 'VOL_SHOCK',
  tags: PhaseRegimeTags
): string {
  const tf = normalizeChartTimeframe(timeframe) || timeframe;
  const side = eventType === 'RANGE_ACC' ? 'ACC' : eventType === 'RANGE_DIST' ? 'DIST' : 'SHOCK';
  return [
    tf,
    side,
    tags.tfTrend,
    tags.atrBucket,
    tags.sellPctBucket,
    tags.rsiBucket,
    tags.htfTrend,
  ].join('|');
}

export function regimeKeyLabel(key: string): string {
  const p = key.split('|');
  if (p.length < 7) return key;
  const sideKo = p[1] === 'DIST' ? '매도분산' : p[1] === 'ACC' ? '매집' : '거래량쇼크';
  const trendKo = p[2] === 'up' ? '상승' : p[2] === 'down' ? '하락' : '횡보';
  const atrKo = p[3] === 'compress' ? '변동수축' : p[3] === 'expand' ? '변동확대' : '변동보통';
  const scenario = p.find((x) => x.startsWith('RANGE_') || x.startsWith('BEAR_') || x.startsWith('BULL_'));
  if (scenario) {
    const map: Record<string, string> = {
      RANGE_BULL_TRAP_DIST: '양봉위장·분산',
      RANGE_DIST_VOL_UP_BREAK: '횡보후하락·량↑',
      RANGE_DIST_VOL_DOWN_BREAK: '횡보·매도우세',
      RANGE_DIST_DRY_THEN_DROP: '횡보후하락·량↓',
      RANGE_ACC_VOL_UP_BREAK: '횡보후상승·량↑',
      RANGE_ACC_DRY_THEN_RISE: '횡보후상승·량↓',
      BEAR_TREND_VOL_UP: '하락·량↑',
      BEAR_TREND_VOL_DOWN: '하락·량↓',
      BULL_TREND_VOL_UP: '상승·량↑',
      BULL_TREND_VOL_DOWN: '상승·량↓',
    };
    if (map[scenario]) return `${map[scenario]}·${trendKo}`;
  }
  return `${sideKo}·${trendKo}·${atrKo}`;
}
