/**
 * Per-candle events for HUD icons. One icon per bar. Missing flow → skip that feature.
 */
import { atrAt, type Eagle1Bar, type StructureEvent } from './structureEngine';
import type { Eagle1MoneyPressure } from './moneyPressureBand';

export type CandleEventKind =
  | 'SWEEP'
  | 'ABSORB'
  | 'IMPULSE'
  | 'FAKE_BREAK'
  | 'EXPANSION'
  | 'STACK_BUY'
  | 'STACK_SELL'
  | 'BOS'
  | 'CHOCH'
  | 'MSS';

export type CandleEventMark = {
  index: number;
  time: number;
  price: number;
  kind: CandleEventKind;
  icon: string;
  labelKo: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confirmed: boolean;
};

const PRIORITY: CandleEventKind[] = [
  'FAKE_BREAK',
  'CHOCH',
  'MSS',
  'BOS',
  'ABSORB',
  'IMPULSE',
  'SWEEP',
  'EXPANSION',
  'STACK_BUY',
  'STACK_SELL',
];

function pri(k: CandleEventKind): number {
  const i = PRIORITY.indexOf(k);
  return i < 0 ? 99 : i;
}

function buyShare(bar: Eagle1Bar): number | null {
  const vol = Number(bar.volume) || 0;
  if (!(vol > 0) || bar.takerBuyBaseVolume == null) return null;
  return bar.takerBuyBaseVolume / vol;
}

export function runCandleEventEngine(params: {
  candles: Eagle1Bar[];
  events?: StructureEvent[] | null;
  money?: Eagle1MoneyPressure | null;
  endExclusive?: number;
}): CandleEventMark[] {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const prefix = params.candles.slice(0, n);
  if (prefix.length < 8) return [];
  const atr = atrAt(prefix, n) || prefix[n - 1]!.close * 0.002;
  const byIndex = new Map<number, CandleEventMark[]>();
  const push = (m: CandleEventMark) => {
    const arr = byIndex.get(m.index) ?? [];
    arr.push(m);
    byIndex.set(m.index, arr);
  };

  for (const ev of params.events ?? []) {
    const idx = Number.isFinite(ev.known_at) ? ev.known_at : ev.index;
    if (idx < 0 || idx >= n) continue;
    const bar = prefix[idx]!;
    const t = Number(bar.time) || 0;
    if (ev.kind === 'SWEEP') {
      push({
        index: idx,
        time: t,
        price: ev.bias === 'bullish' ? bar.low : bar.high,
        kind: 'SWEEP',
        icon: '◇',
        labelKo: '유동성털기',
        bias: ev.bias,
        confirmed: true,
      });
    } else if (ev.kind === 'FAILED_BREAK') {
      push({
        index: idx,
        time: t,
        price: ev.level,
        kind: 'FAKE_BREAK',
        icon: '×',
        labelKo: ev.bias === 'bearish' ? '가짜돌파' : '가짜이탈',
        bias: ev.bias,
        confirmed: true,
      });
    } else if (ev.kind === 'CHOCH') {
      push({
        index: idx,
        time: t,
        price: ev.level,
        kind: 'CHOCH',
        icon: ev.bias === 'bullish' ? 'CHOCH ↑' : 'CHOCH ↓',
        labelKo: '추세전환',
        bias: ev.bias,
        confirmed: true,
      });
    } else if (ev.kind === 'BOS') {
      push({
        index: idx,
        time: t,
        price: ev.level,
        kind: 'BOS',
        icon: ev.bias === 'bullish' ? 'BOS ↑' : 'BOS ↓',
        labelKo: '구조돌파',
        bias: ev.bias,
        confirmed: true,
      });
    }
  }

  const vols = prefix.map((b) => Number(b.volume) || 0);
  const vAvg = (from: number, to: number) => {
    const sl = vols.slice(Math.max(0, from), to);
    return sl.length ? sl.reduce((a, b) => a + b, 0) / sl.length : 0;
  };

  for (let i = Math.max(8, n - 48); i < n; i++) {
    const bar = prefix[i]!;
    const prev = prefix[i - 1]!;
    const range = Math.max(bar.high - bar.low, 1e-9);
    const body = Math.abs(bar.close - bar.open);
    const rel = vAvg(i - 20, i);
    const volZ = rel > 0 ? (Number(bar.volume) || 0) / rel : null;
    const share = buyShare(bar);
    const disp = atr > 0 && range >= atr * 1.65 && body / range >= 0.55 && (volZ == null || volZ >= 1.15);
    if (disp) {
      push({
        index: i,
        time: Number(bar.time) || 0,
        price: bar.close,
        kind: 'IMPULSE',
        icon: '⚡',
        labelKo: bar.close >= bar.open ? '충격 상승' : '충격 하락',
        bias: bar.close >= bar.open ? 'bullish' : 'bearish',
        confirmed: i < n - 1,
      });
    }
    const sellFail =
      bar.close > bar.open &&
      bar.low < prev.low &&
      (share == null || share <= 0.48) &&
      (params.money?.absorbed && params.money.score > 0 ? true : body / range >= 0.45);
    const buyFail =
      bar.close < bar.open &&
      bar.high > prev.high &&
      (share == null || share >= 0.52) &&
      (params.money?.absorbed && params.money.score < 0 ? true : body / range >= 0.45);
    if (sellFail) {
      push({
        index: i,
        time: Number(bar.time) || 0,
        price: bar.low,
        kind: 'ABSORB',
        icon: '↑',
        labelKo: '매도흡수',
        bias: 'bullish',
        confirmed: i < n - 1,
      });
    } else if (buyFail) {
      push({
        index: i,
        time: Number(bar.time) || 0,
        price: bar.high,
        kind: 'ABSORB',
        icon: '↓',
        labelKo: '매수흡수',
        bias: 'bearish',
        confirmed: i < n - 1,
      });
    }
    if (i >= 2) {
      const a = buyShare(prefix[i - 2]!);
      const b = buyShare(prefix[i - 1]!);
      const c = share;
      if (a != null && b != null && c != null && a >= 0.58 && b >= 0.58 && c >= 0.58) {
        push({
          index: i,
          time: Number(bar.time) || 0,
          price: bar.low,
          kind: 'STACK_BUY',
          icon: '▲',
          labelKo: '연속 공격매수',
          bias: 'bullish',
          confirmed: i < n - 1,
        });
      }
      if (a != null && b != null && c != null && a <= 0.42 && b <= 0.42 && c <= 0.42) {
        push({
          index: i,
          time: Number(bar.time) || 0,
          price: bar.high,
          kind: 'STACK_SELL',
          icon: '▼',
          labelKo: '연속 공격매도',
          bias: 'bearish',
          confirmed: i < n - 1,
        });
      }
    }
  }

  const out: CandleEventMark[] = [];
  for (const [, marks] of byIndex) {
    marks.sort((a, b) => pri(a.kind) - pri(b.kind));
    const top = marks[0];
    if (top) out.push(top);
  }
  return out.sort((a, b) => a.index - b.index).slice(-36);
}
